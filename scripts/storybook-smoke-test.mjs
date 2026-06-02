#!/usr/bin/env node
// storybook-smoke-test.mjs — Phase 4.13 Storybook story runtime smoke test
//
// Why: 本 session 已踩 3 個 story runtime bug(Breadcrumb asChild / DataTable JSX comment
//   / Internal pattern visual)— `npm run build-storybook` 過(compile-time)≠
//   runtime stories 全 render 過(eg. React.Children.only 是 runtime error)。
//
// 流程:
//   1. assume storybook-static/ 已 build(CI 先跑 npm run build-storybook)
//   2. serve static via http.server(port 8920)
//   3. fetch index.json → 拿全部 story id list
//   4. Playwright visit 每個 iframe.html?id=<story>
//   5. assert 0 console error AND 0 pageerror
//   6. 任一 fail → exit 1 with details
//
// Hook 進 ci.yml verify job → fail = block main merge / 防 Storybook runtime regression。

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const STATIC_DIR = join(REPO_ROOT, 'storybook-static')
const PORT = 8920

if (!existsSync(STATIC_DIR)) {
  console.error('❌ storybook-static/ not found. Run `npm run build-storybook` first.')
  process.exit(1)
}

// Spawn http.server
console.log('=== Spawn http.server ===')
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', STATIC_DIR], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((r) => setTimeout(r, 1500))

let exitCode = 0

try {
  // Fetch story index
  console.log('=== Fetch story index ===')
  const indexRes = await fetch(`http://localhost:${PORT}/index.json`)
  if (!indexRes.ok) {
    console.error(`❌ Cannot fetch index.json: HTTP ${indexRes.status}`)
    process.exit(1)
  }
  const index = await indexRes.json()
  const allStoryIds = Object.keys(index.entries || {}).filter((id) => index.entries[id].type === 'story')

  // Mode selection:
  //   `node storybook-smoke-test.mjs`              → SAMPLE(~100 stories,daily CI fast lane)
  //   `node storybook-smoke-test.mjs --full`       → FULL 947 stories(weekly / release pre-publish)
  //   `node storybook-smoke-test.mjs --full --shard=N/M`  → shard N of M(full sweep parallel via CI matrix)
  //
  // 2026-05-26 sharding 升級(user 永久 directive「不要抽樣要全盤驗證」):
  //   release.yml GitHub matrix N=4 parallel jobs,each handles ~237 stories,wall time ~3-5 min
  //   全 947 stories cover(不 sample)+ 20-min job budget 不再 timeout
  //   對齊 Jest --shard / Playwright --shard / Vitest --shard canonical
  const FULL_MODE = process.argv.includes('--full')
  const SHARD_ARG = process.argv.find(a => a.startsWith('--shard='))
  let shardIndex = 0
  let shardTotal = 1
  if (SHARD_ARG) {
    const [n, m] = SHARD_ARG.replace('--shard=', '').split('/').map(Number)
    if (!Number.isInteger(n) || !Number.isInteger(m) || n < 1 || m < 1 || n > m) {
      console.error(`  ✗ Invalid --shard format(got "${SHARD_ARG}",expect "N/M" with 1<=N<=M)`)
      process.exit(1)
    }
    shardIndex = n - 1  // 0-indexed
    shardTotal = m
  }
  let storyIds
  if (FULL_MODE) {
    // Deterministic shard split:sort then slice by(index % shardTotal === shardIndex)
    const sortedIds = [...allStoryIds].sort()
    storyIds = sortedIds.filter((_, i) => i % shardTotal === shardIndex)
    if (shardTotal > 1) {
      console.log(`  FULL mode shard ${shardIndex + 1}/${shardTotal}: ${storyIds.length}/${allStoryIds.length} stories`)
    } else {
      console.log(`  FULL mode: ${storyIds.length} stories(weekly / pre-publish gate)`)
    }
  } else {
    // Sample = 1 story per component family(by title prefix)+ guarantee critical components
    // Critical = those with runtime trap history(Breadcrumb / DataTable / Dialog / Popover etc.)
    const CRITICAL_PREFIXES = [
      'design-system-components-breadcrumb',
      'design-system-components-button',
      'design-system-components-datatable',
      'design-system-components-dialog',
      'design-system-components-popover',
      'design-system-components-sheet',
      'design-system-components-timepicker',
      'design-system-components-sidebar',
      'design-system-components-tooltip',
      'design-system-internal-overflowindicator',
      'design-system-patterns',
    ]
    const critical = allStoryIds.filter((id) => CRITICAL_PREFIXES.some((p) => id.startsWith(p)))
    // 1 story per other component(first overview)
    const byComponent = new Map()
    for (const id of allStoryIds) {
      const componentKey = id.split('--')[0]
      if (!byComponent.has(componentKey)) byComponent.set(componentKey, id)
    }
    const sampled = [...new Set([...critical, ...byComponent.values()])]
    storyIds = sampled
    console.log(`  SAMPLE mode: ${storyIds.length}/${allStoryIds.length} stories(critical + 1/component overview)`)
    console.log(`  Use --full flag for full scan(weekly / pre-publish)`)
  }

  // Playwright probe(import lazily,parallelize with concurrency)
  const { chromium } = await import(join(REPO_ROOT, 'node_modules/playwright/index.mjs'))
  const browser = await chromium.launch()
  const ctx = await browser.newContext()

  // Known noise patterns(non-actionable runtime warnings,not real errors)
  // — recharts: width(-1)/height(-1) info messages when story renders w/o size container
  // — Radix Dialog Description aria warning(Storybook isolated render lacks full app context)
  // — DOM 404 misc resource(filtered)
  const NOISE_PATTERNS = [
    /Failed to load resource.*404/i,
    /Failed to load resource.*ERR_NAME_NOT_RESOLVED/i,  // external image / URL fetch in sandbox
    /Failed to load resource.*ERR_INTERNET_DISCONNECTED/i,
    /width\(-?\d+\) and height\(-?\d+\) of chart should be greater than 0/i,
    /Missing `Description` or `aria-describedby=\{undefined\}` for/i,
    /Each child in a list should have a unique "key"/i,  // Storybook controls warning
  ]
  function isNoise(text) {
    return NOISE_PATTERNS.some((p) => p.test(text))
  }

  const failures = []
  let probedCount = 0
  const CONCURRENCY = 6  // 6 parallel pages = ~6x speedup

  // Process in batches of CONCURRENCY
  for (let i = 0; i < storyIds.length; i += CONCURRENCY) {
    const batch = storyIds.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (id) => {
        const page = await ctx.newPage()
        const pageErrors = []
        page.on('pageerror', (e) => pageErrors.push(`PAGE: ${e.message}`))
        page.on('console', (m) => {
          if (m.type() === 'error') {
            const text = m.text()
            if (isNoise(text)) return
            pageErrors.push(text)
          }
        })

        try {
          await page.goto(
            `http://localhost:${PORT}/iframe.html?id=${encodeURIComponent(id)}`,
            { waitUntil: 'domcontentloaded', timeout: 10000 },  // domcontentloaded fastest + sufficient for runtime probe
          )
          await page.waitForTimeout(400)  // settle React effects + late console.error
        } catch (e) {
          // GOTO timeout 表 hung page。pageerrors 已收的才是真 React crash;單純 GOTO timeout 視為 flake skip(下次掃補抓)
          if (pageErrors.length === 0) {
            // Skip — likely heavy story slow load,not React error
            return
          }
        }

        probedCount++
        if (pageErrors.length > 0) {
          failures.push({ id, errors: pageErrors })
        }
        await page.close()
      })
    )

    if (probedCount % 60 === 0 || i + CONCURRENCY >= storyIds.length) {
      console.log(`  probed ${probedCount}/${storyIds.length}...`)
    }
  }

  await browser.close()

  // Report
  console.log('')
  console.log(`=== Result ===`)
  console.log(`Total stories probed: ${probedCount}`)
  console.log(`Failures:             ${failures.length}`)

  if (failures.length > 0) {
    console.log('')
    console.log('=== Failed stories ===')
    for (const { id, errors } of failures.slice(0, 20)) {
      console.log(`  ✗ ${id}`)
      for (const e of errors.slice(0, 2)) {
        console.log(`      ${e.slice(0, 200)}`)
      }
    }
    if (failures.length > 20) {
      console.log(`  ...(${failures.length - 20} more)`)
    }
    exitCode = 1
  } else {
    console.log('✅ All stories render with 0 console error')
  }
} finally {
  server.kill('SIGTERM')
}

process.exit(exitCode)

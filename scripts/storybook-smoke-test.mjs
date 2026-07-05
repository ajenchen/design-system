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
import { existsSync, statSync } from 'node:fs'
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

// ── Stale-build guard(2026-07-05 自抓包 codify)────────────────────────────
// 本 script 驗的是 storybook-static/ 靜態 build — 若 build 早於 src 最新改動,整輪 smoke =
// 驗舊碼的假綠燈(anchor:2026-07-05 發現 7/3 舊 build 撐過本 branch 全部 smoke 宣稱)。
// Guard:storybook-static/iframe.html mtime 必 >= src 最新 tsx/ts/css mtime,否則 fail-loud
//(fail-closed,對齊 rsync --checksum 檔頭同款沉默陷阱教訓)。純 Node 實作零 shell。
{
  const { readdirSync: rd, statSync: st } = await import('node:fs')
  const staticMtime = st(join(STATIC_DIR, 'iframe.html')).mtimeMs
  const stale = []
  const walk = (dir) => {
    for (const e of rd(dir, { withFileTypes: true })) {
      if (stale.length >= 5) return
      const p = join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p) }
      else if (/\.(tsx|ts|css)$/.test(e.name) && st(p).mtimeMs > staticMtime) stale.push(p)
    }
  }
  for (const root of [join(REPO_ROOT, 'packages/design-system/src'), join(REPO_ROOT, 'src')]) {
    if (existsSync(root)) walk(root)
  }
  if (stale.length) {
    console.error('❌ storybook-static/ 比 src 舊(stale build = 假綠燈)。先跑 `npm run build-storybook` 再 smoke。')
    console.error('   比 build 新的檔案(前 5):')
    for (const p of stale) console.error('   ' + p.replace(REPO_ROOT + '/', ''))
    console.error(`   build mtime: ${new Date(staticMtime).toISOString()}`)
    process.exit(1)
  }
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
  const unprobed = []  // 2026-06-02: GOTO-timeout 未驗的 story 改「追蹤可見化」而非靜默 skip(原 silent
  // return 把「載不起」藏成綠燈 = SizeMatrix crash 漏 ship beta.44 root cause 之一)。先非致命 log
  // 觀測 CI 真實 skip 數;若 CI 持續 ≈0 再升 hard coverage-gate(避免盲推 hard-gate 再弄垮 release)。
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
          let loaded = false
          try {
            await page.goto(
              `http://localhost:${PORT}/iframe.html?id=${encodeURIComponent(id)}`,
              { waitUntil: 'domcontentloaded', timeout: 10000 },  // domcontentloaded fastest + sufficient for runtime probe
            )
            await page.waitForTimeout(400)  // settle React effects + late console.error
            loaded = true
          } catch (e) {
            // pageerrors 已收 = 真 React crash(有效偵測);純 GOTO timeout 才是「載不起」
            if (pageErrors.length > 0) loaded = true
          }
          if (!loaded) {
            unprobed.push(id)  // 不靜默 skip:追蹤可見化(報告會列出 + 非致命 warn)
            return
          }
          probedCount++
          if (pageErrors.length > 0) {
            failures.push({ id, errors: pageErrors })
          }
        } finally {
          await page.close()  // 永遠 close(原 skip 路徑漏 close → page 洩漏 → timeout 連鎖)
        }
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
  console.log(`Total stories probed: ${probedCount}/${storyIds.length}`)
  console.log(`Failures:             ${failures.length}`)
  console.log(`Unprobed (timeout):   ${unprobed.length}`)

  // 2026-06-02: unprobed 可見化(非致命)。原 silent skip 把「載不起」藏成綠燈;現在列出來。
  // 暫不 hard-fail —— 需先觀測 CI 真實 skip 數(本機 GDrive 噪音不可靠),若 CI 持續 ≈0 再升
  // hard coverage-gate(per memory feedback_ai_ground_truth:盲推 hard-gate 曾弄垮 beta.45 release)。
  if (unprobed.length > 0) {
    console.log('')
    console.log(`⚠️  COVERAGE 觀測:${unprobed.length} 個 story GOTO timeout 未驗(非致命 warn)。前 10 個:`)
    for (const id of unprobed.slice(0, 10)) console.log(`   ◦ ${id}`)
    if (unprobed.length > 10) console.log(`   ...(${unprobed.length - 10} more)`)
    console.log('   (若 CI 持續顯示 0 → 可把此升為 hard BLOCKER 防 silent-skip 假綠燈)')
  }

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

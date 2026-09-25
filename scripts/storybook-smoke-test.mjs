#!/usr/bin/env node
// storybook-smoke-test.mjs — Phase 4.13 Storybook story runtime smoke test
//
// Why: 本 session 已踩 3 個 story runtime bug(Breadcrumb asChild / DataTable JSX comment
//   / Internal pattern visual)— `npm run build-storybook` 過(compile-time)≠
//   runtime stories 全 render 過(eg. React.Children.only 是 runtime error)。
//
// 流程:
//   1. assume storybook-static/ 已 build(或 `--static=<dir>` 指定另一份建置)
//   2. 以 lib/a11y-static-server.mjs 從本次獨佔的建置快照供檔(有同源 404 帳本)
//   3. fetch index.json → 拿全部 story id list
//   4. 每一則以 lib/launch-browser.mjs 的 openStory 開啟並等到 Storybook 回報渲染完成(含 play)
//   5. assert 0 console error AND 0 pageerror AND story 沒有渲染拋錯
//   6. 任一 fail → exit 1 with details
//
// ⚠️ **這支目前不在 CI 裡**(2026-09-18 實測 `grep -rn storybook-smoke .github/workflows package.json` = 0 筆)。
// 上面那句「Hook 進 ci.yml verify job」是當初的意圖,不是現況 —— 留著會讓人以為有閘在守(M32「量具要先證明會紅」的變形:
// 沒有被呼叫的閘等於不存在)。**現在真正在 CI 擋「story 整則渲不出來」的是**
// `scripts/overlay-footer-gutter-invariant.mjs` —— 它本來就要逐一開啟全部 story,順手檢查有沒有掉進
// Storybook 的錯誤畫面,不必為此再跑一次全庫掃描。本檔保留作為手動 / 本機工具(它另外還驗 console error,涵蓋面更廣);
// 要把它排進 CI 時,請連同「跑多久、放哪個 job」一起決定,不要只加一行 npm script。
//
// ── 2026-09-25:「開起來了」改由共用的 openStory 判定,建置缺檔不再被讀成「story 壞了」 ──
// 原本:python http.server 讀活的 storybook-static + `domcontentloaded` + 固定睡 400ms 當「已渲染」,
// 同一個 context 並行開 6 個 page。實測本機 storybook-static 有 25 個 0 位元組檔時,它印出「388 則全部 Failures」——
// 那是**建置壞了**(preview.js 讀不到),不是 388 則 story 壞了;固定睡 400ms 也可能在 story 模組還沒載完時就收工(M37)。
// 現在:
//   - 每則 story 由 openStory 等 Storybook 回報渲染完成(含 play)+ render-health;渲染完成後再等兩個影格
//     (React 的被動 effect 在 commit 之後才跑,晚到的 console.error 在那之後才出現)
//   - **產品裁決**(Failures):story 自己渲染拋錯(Storybook 錯誤頁 / render errored / 頁面例外,且同源沒有缺檔)、
//     或渲染期間有非雜訊的 console error —— 這正是這支工具要抓的 runtime bug
//   - **儀器失效**(Unprobed):導覽失敗、等不到渲染完成、同源檔案 404 / 載入失敗、空畫面等 —— 點名 story、附原因與 404,
//     exit 1,**不是產品裁決**,也不算通過
//   - 並行改成 N 個瀏覽器、每個瀏覽器只開一個 page 重複使用(lib/launch-browser.mjs:`--single-process` 下
//     同一個 context 開多個 page 不穩);換下一則之前先導到 about:blank,讓這一則的晚到 console 訊息記在它自己頭上

import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProvisionedPlaywrightRuntime } from '../infra/governance/lib/playwright-runtime.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const STATIC_ARG = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const STATIC_DIR = STATIC_ARG ? resolve(STATIC_ARG) : join(REPO_ROOT, 'storybook-static')

if (!existsSync(STATIC_DIR)) {
  console.error(`❌ ${STATIC_DIR} not found. Run \`npm run build-storybook\` first.`)
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
    console.error(`❌ ${STATIC_DIR} 比 src 舊(stale build = 假綠燈)。先跑 \`npm run build-storybook\` 再 smoke。`)
    console.error('   比 build 新的檔案(前 5):')
    for (const p of stale) console.error('   ' + p.replace(REPO_ROOT + '/', ''))
    console.error(`   build mtime: ${new Date(staticMtime).toISOString()}`)
    process.exit(1)
  }
}

// 從本次獨佔的建置快照供檔(不再讀活目錄:別人同時 build-storybook 會清空它);建置不完整會以 INSTRUMENT 丟出
console.log('=== Serve build snapshot ===')
const server = await startA11yStaticServer({ rootDirectory: STATIC_DIR, defaultFile: 'iframe.html' })

let exitCode = 0

try {
  // Fetch story index
  console.log('=== Fetch story index ===')
  const indexRes = await fetch(`${server.origin}/index.json`)
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
  const runtime = resolveProvisionedPlaywrightRuntime({ repoRoot: REPO_ROOT, environment: process.env })
  if (!runtime) throw new Error('[storybook-smoke] exact Playwright Chromium runtime missing; run `npm run setup:playwright`')
  process.env.PLAYWRIGHT_BROWSERS_PATH = runtime.environmentValue
  await import(join(REPO_ROOT, 'node_modules/playwright/index.mjs'))

  // Known noise patterns(non-actionable runtime warnings,not real errors)
  // — recharts: width(-1)/height(-1) info messages when story renders w/o size container
  // — Radix Dialog Description aria warning(Storybook isolated render lacks full app context)
  // — DOM 404 misc resource(filtered;同源 script / stylesheet 404 由 openStory 的 render-health 判成儀器失效,不靠這裡)
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
  const unprobed = []  // 沒量到(儀器失效:導覽失敗 / 等不到渲染完成 / 同源缺檔 / 空畫面)= 未實際驗證,必須 fail-closed 防止假綠燈。
  const CONCURRENCY = 6  // 6 個瀏覽器並行,每個只開一個 page 重複使用

  // 同源檔案載入失敗(openStory 的失敗請求清單裡,同源的寫成路徑、外部的寫成完整網址)= 建置缺檔,不是 story 壞了
  const sameOriginFailure = (failedRequests) => failedRequests.some((f) => /^(\d{3} )?\//.test(f))
  // Storybook 自己回報「這則 story 渲染拋錯」的種類(錯誤頁 / render errored / 頁面例外)
  const isStoryCrash = (error) => ['storybook-error', 'render-errored'].includes(error.kind)
    || (error.kind === 'render-health' && /page exceptions=/.test(error.reason) && !/critical resource/.test(error.reason))

  let nextIndex = 0
  let settledCount = 0
  const worker = async () => {
    const browser = await launchBrowser()
    try {
      const page = await browser.newPage()
      let current = null
      page.on('pageerror', (e) => current?.errors.push(`PAGE: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() !== 'error' || !current) return
        const text = m.text()
        if (isNoise(text)) return
        current.errors.push(text)
      })
      for (;;) {
        const i = nextIndex++
        if (i >= storyIds.length) return
        const id = storyIds[i]
        const record = current = { id, errors: [] }
        let instrument = null
        try {
          // 導覽前不併入伺服器帳本(並行的其他瀏覽器也在記,會混進來);openStory 自己記本頁的失敗請求,伺服器帳本最後整份印出
          await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
            navigationTimeoutMs: 30_000, timeoutMs: 30_000,
          })
          // 渲染完成後再等兩個影格:React 的被動 effect(useEffect)在 commit 之後才跑,晚到的 console.error 在那之後才出現
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        } catch (error) {
          if (!(error instanceof StoryRenderInstrumentError)) throw error
          instrument = error
        }
        // 換下一則之前把這一則的文件卸掉:卸載前冒出的 console 訊息仍記在這一則,不會被記到下一則頭上
        await page.goto('about:blank').catch(() => {})
        current = null

        if (instrument && isStoryCrash(instrument) && !sameOriginFailure(instrument.failedRequests)) {
          // 產品裁決:story 自己渲染拋錯(React.Children.only 之類)—— 這正是 smoke 要抓的
          probedCount++
          failures.push({ id, errors: [`STORY CRASH: ${instrument.storybookError || instrument.reason}`, ...record.errors] })
        } else if (instrument) {
          // 儀器失效:沒量到,不是產品裁決
          unprobed.push({ id, detail: instrument.detail })
        } else {
          probedCount++
          if (record.errors.length > 0) failures.push({ id, errors: record.errors })
        }
        settledCount++
        if (settledCount % 60 === 0 || settledCount === storyIds.length) {
          console.log(`  probed ${settledCount}/${storyIds.length}...`)
        }
      }
    } finally {
      await browser.close()
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, storyIds.length) }, worker))

  // Report
  console.log('')
  console.log(`=== Result ===`)
  console.log(`Total stories probed: ${probedCount}/${storyIds.length}`)
  console.log(`Failures:             ${failures.length}`)
  console.log(`Unprobed (儀器失效):  ${unprobed.length}`)

  if (unprobed.length > 0) {
    console.log('')
    console.log(`❌ COVERAGE GAP:${unprobed.length} 個 story 沒量到 —— 這是儀器失效(沒量到),不是產品裁決:元件不一定有問題,但這次不能算通過。前 10 個:`)
    for (const { id, detail } of unprobed.slice(0, 10)) console.log(`   ◦ ${id}:${detail.slice(0, 300)}`)
    if (unprobed.length > 10) console.log(`   ...(${unprobed.length - 10} more)`)
    const missing = [...new Set(server.notFound)]
    if (missing.length) console.log(`   同源 404 帳本(${missing.length}):${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}`)
    exitCode = 1
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
  }

  if (failures.length === 0 && unprobed.length === 0) {
    console.log('✅ All stories render with 0 console error')
  }
} finally {
  await server.stop()
}

process.exit(exitCode)

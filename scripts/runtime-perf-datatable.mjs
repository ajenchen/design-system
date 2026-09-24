#!/usr/bin/env node
/**
 * DataTable 捲動效能量測工具(2026-05-13 建;2026-09-25 「沒量到」改為明說的儀器失效)
 *
 * 量 4 則虛擬捲動 story 的:
 *   - Initial mount time(navigation → 第一列出現)
 *   - 捲動期間的幀距(連續捲動 2 秒,平均 / p95)
 *   - Long task(>50ms 阻塞)
 *   - DOM 列數(virtualizer 是否真有限制列數)
 *
 * 對標:AG Grid public benchmark / Material X-DataGrid demo / Glide DataEditor
 *
 * ── 身分:量測工具,不是閘(2026-09-25 查證後記錄)──────────────────────────────
 * - **不比任何門檻**。數字只印給人讀;exit code 只回答「量測有沒有完成」,不回答「效能合不合格」。
 * - **沒有任何執行面呼叫它**(CI workflow / package.json / hooks / skills 全無)。檔名不符
 *   `gate-reachability-invariant.mjs` 的閘名樣式(GATE_LIKE),所以不在 `gate-reachability-baseline.json`
 *   的孤兒清單裡 —— 也**不該手動加進去**:該閘會把「在 baseline 但不在孤兒清單」的項目報成
 *   「已接好線或已退役」,那是假訊號。
 * - `data-table.spec.md`「六之三、Runtime perf budget canonical」那張表標了 hard gate 門檻,
 *   但本檔從來沒有比對那些門檻,也沒有人跑它 —— 那張表目前**沒有機械強制**。要讓它成為閘,
 *   得先決定在哪種環境量(見下一段)與門檻是否重校(spec 已註明 4x 門檻是 user 決策);本檔不自行發明門檻。
 * - 本工具用 headless(`lib/launch-browser.mjs`)。M32(g)(`ds-canonical/rules/meta-patterns.md`)逐字:
 *   `任何「每幀時間」類量具在 headless 一律無效,綠燈是零證據`(錨例:`連故意把每列加上 box-shadow+blur 都不動`)。
 *   觀察(非規則):主執行緒的 JS 工作仍會拉長這裡的幀距 —— 2026-09-08 拿掉舊列重繪後 RoadmapAllInOne
 *   57.3 → 17.7ms(spec 六之三)—— 但這些數字**不是「使用者看起來順不順」的證據**。
 *
 * ── 「沒量到」不是「沒發生」(M37)────────────────────────────────────────────────
 * 修前三個洞(2026-09-25 以合成頁實跑確認):
 *   1. story 每一次都沒出現第一列 → `runResults` 是空的 → 讀 `undefined.mountMs` 當場崩,後面的 story 全沒量。
 *   2. 找不到捲動容器 → 幀計時器從沒啟動 → 0 幀 → 印出「平均每幀 0ms」並 exit 0(看起來完美)。
 *   3. 捲動容器沒有移動 → 量到的是靜止頁面的幀(16.58ms)並 exit 0,被讀成捲動成本。
 * 現在這些一律記為該次的「儀器失效」並寫明原因;某則 story 一次都沒量到就不印任何數字;
 * 只要有任何一次沒量到,整次執行 exit 1,並說明這份輸出不完整、不能拿來比較。
 *
 * 用法:
 *   node scripts/runtime-perf-datatable.mjs                  量 storybook-static(本次獨佔快照)
 *   STORYBOOK_URL=http://… node scripts/runtime-perf-datatable.mjs
 *   CPU_THROTTLE_RATE=4 RUNS_PER_STORY=5 node scripts/runtime-perf-datatable.mjs
 *   node scripts/runtime-perf-datatable.mjs --selftest       對照組:四種合成頁,驗「該紅的紅、該綠的綠」
 */
import { launchBrowser } from './lib/launch-browser.mjs'

// 2026-09-08:沒給 STORYBOOK_URL 就直接服務 storybook-static(跟 data-table-scroll-cost.mjs 同款),不再依賴
// 開著的 dev server —— 這支工具在沙箱裡從沒跑起來過(dev server 不在、而且 `--single-process` 沙箱一個 browser 只能開
// 一個 context,第二次 `browser.newPage` 就炸 "browser has been closed")。每 run 重開 browser。
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const SELFTEST = process.argv.includes('--selftest')
const STATIC_DIR = process.env.DT_STATIC || join(dirname(fileURLToPath(import.meta.url)), '..', 'storybook-static')
const targets = [
  { id: 'design-system-components-datatable-展示--virtual-scroll', label: 'VirtualScroll(10000 rows × 7 cols rich)' },
  { id: 'design-system-components-datatable-展示--roadmap-all-in-one', label: 'RoadmapAllInOne(500 × 13 rich + 全 features)' },
  { id: 'design-system-components-datatable-展示--roadmap-perf-budget', label: 'RoadmapPerfBudget(同 cols 但禁 row drag/reorder/resize/select/overlay)' },
  { id: 'design-system-components-datatable-展示--row-drag-with-virtualization', label: 'RowDragVirtualization(200 rows)' },
]

// 2026-05-14 thermal-immune perf measurement(per user「想辦法自動驗證啊」directive):
// Chrome DevTools Protocol `Emulation.setCPUThrottlingRate` 鎖 virtual CPU = 4x slower。
// Effect:測量永遠在固定虛擬 CPU speed,不受 Mac thermal throttle 影響 → 完全 reproducible。
// 對齊 Chrome Lighthouse perf testing canonical(throttle:provided,fixed CPU multiplier)。
// Source:https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate
//
// 同時 multiple runs + statistical analysis(median + stddev)消除 single-run noise。
// 2026-06-12 校準(R2 實測):4x throttle 在開發機(Google Drive 常駐負載)連未動過的對照組
// Case A 都超標(38ms vs 16.67ms = 60fps vsync 物理下限)→ 門檻與 4x 連乘對本機不現實。
// 預設 1x(全 4 case 實測過);4x 保留為 CI 專用 stress(待 CI 硬體跑基準後再定門檻):
//   CPU_THROTTLE_RATE=4 node scripts/runtime-perf-datatable.mjs
const CPU_THROTTLE_RATE = Number(process.env.CPU_THROTTLE_RATE || 1)
const RUNS_PER_STORY = Number(process.env.RUNS_PER_STORY || 3)
// 2026-05-14 bump 10s → 25s — storybook dev mode 偶爾慢 mount。等的是第一列本身,不是固定睡眠。
const FIRST_ROW_TIMEOUT_MS = 25000
const FIRST_ROW = '[role="row"][data-row-index="0"]'

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length
  return { median, mean, stddev: Math.sqrt(variance) }
}

/**
 * 量一次。回傳 `{ ok: true, … }`,或 `{ ok: false, reason, detail }` —— 後者代表**這次沒量到**,
 * 不是被測物的任何性質;呼叫端不得把它算成 0 或略過不提。
 */
async function measureRun(origin, storyId, { firstRowTimeoutMs = FIRST_ROW_TIMEOUT_MS } = {}) {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

    // CPU throttle via CDP(必在 page mount 後 newCDPSession)
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE })

    // 量測條件照舊(開著 JS coverage),讓數字能跟 spec 六之三 / 2026-09-08 的歷史紀錄比。
    await page.coverage.startJSCoverage()

    const mountStart = Date.now()
    await page.goto(`${origin}/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: 'networkidle' })
    try {
      await page.waitForSelector(FIRST_ROW, { timeout: firstRowTimeoutMs })
    } catch {
      return { ok: false, reason: 'no-first-row', detail: `${firstRowTimeoutMs}ms 內沒出現 ${FIRST_ROW}` }
    }
    const mountMs = Date.now() - mountStart

    // Wait for table to stabilize
    await page.waitForTimeout(800)

    const initStats = await page.evaluate(() => ({
      totalRowsRendered: document.querySelectorAll('[role="row"][data-row-index]').length,
      domNodeCount: document.querySelectorAll('*').length,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null,
    }))

    // Inject long-task observer + frame timer
    const longTaskObservable = await page.evaluate(() => {
      window.__perf = { longTasks: [], frames: [], scrollEnd: 0 }
      // 不支援 longtask 時「0 個長工」是「看不到」而不是「沒有」—— 回報給呼叫端判儀器失效。
      const supported = (PerformanceObserver.supportedEntryTypes || []).includes('longtask')
      if (supported) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__perf.longTasks.push({ ts: entry.startTime, duration: entry.duration })
          }
        }).observe({ entryTypes: ['longtask'] })
      }

      let lastTs = performance.now()
      function tick(ts) {
        window.__perf.frames.push(ts - lastTs)
        lastTs = ts
        if (ts < window.__perf.scrollEnd) requestAnimationFrame(tick)
      }
      window.__startFrameTimer = (durationMs) => {
        window.__perf.frames = []
        window.__perf.scrollEnd = performance.now() + durationMs
        requestAnimationFrame(tick)
      }
      return supported
    })
    if (!longTaskObservable) {
      return { ok: false, reason: 'no-longtask-observer', detail: '瀏覽器不支援 longtask 觀察,長工數量會被誤讀成 0' }
    }

    // Scroll the scroll container
    const scrollResult = await page.evaluate(async () => {
      const scroller = document.querySelector('[role="grid"] [class*="overflow"]') ||
        document.querySelector('.overflow-auto, [class*="overflow-y-auto"], [class*="overflow-auto"]')
      if (!scroller) return { error: 'no-scroller' }
      const scrollerEl = (scroller.closest('[class*="overflow-y-auto"]') || scroller)
      const startScrollTop = scrollerEl.scrollTop
      window.__startFrameTimer(2000)
      const startScroll = performance.now()
      // Simulate 2s of scrolling: 50px per frame
      let pos = startScrollTop
      while (performance.now() - startScroll < 2000) {
        pos += 50
        scrollerEl.scrollTop = pos
        await new Promise(r => requestAnimationFrame(r))
      }
      return { startScrollTop, finalScrollTop: scrollerEl.scrollTop, scrollDuration: performance.now() - startScroll }
    })
    if (scrollResult.error === 'no-scroller') {
      return { ok: false, reason: 'no-scroller', detail: '找不到捲動容器 —— 沒有捲動,就沒有可量的捲動幀' }
    }
    if (!(scrollResult.finalScrollTop > scrollResult.startScrollTop)) {
      return { ok: false, reason: 'did-not-scroll', detail: `捲動容器沒有移動(scrollTop ${scrollResult.startScrollTop} → ${scrollResult.finalScrollTop})—— 量到的會是靜止頁面的幀` }
    }

    await page.waitForTimeout(300)

    const perfData = await page.evaluate(() => {
      const frames = window.__perf.frames
      const longTasks = window.__perf.longTasks
      const sorted = [...frames].sort((a, b) => a - b)
      return {
        frameCount: frames.length,
        avgFrameMs: frames.length ? Number((frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(2)) : null,
        p95FrameMs: frames.length ? Number(sorted[Math.floor(frames.length * 0.95)].toFixed(2)) : null,
        longTaskCount: longTasks.length,
        longestTaskMs: longTasks.length ? Math.round(Math.max(...longTasks.map(t => t.duration))) : 0,
      }
    })
    if (perfData.frameCount === 0) {
      return { ok: false, reason: 'no-frames', detail: '捲動期間一幀都沒量到' }
    }

    const afterStats = await page.evaluate(() => ({
      rowCount: document.querySelectorAll('[role="row"][data-row-index]').length,
      domNodeCount: document.querySelectorAll('*').length,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null,
    }))

    return {
      ok: true, mountMs, avgFrame: perfData.avgFrameMs, p95Frame: perfData.p95FrameMs, frameCount: perfData.frameCount,
      longTaskCount: perfData.longTaskCount, longestTaskMs: perfData.longestTaskMs,
      scrolledPx: scrollResult.finalScrollTop - scrollResult.startScrollTop, initStats, afterStats,
    }
  } finally {
    await browser.close()
  }
}

async function measureStory(origin, target, runs, options) {
  const results = []
  const failures = []
  for (let run = 0; run < runs; run++) {
    const outcome = await measureRun(origin, target.id, options)
    if (outcome.ok) results.push({ run, ...outcome })
    else failures.push({ run, reason: outcome.reason, detail: outcome.detail })
  }
  return { target, runs, results, failures }
}

/** 一則 story 的報告文字。只由量到的次數算數字;一次都沒量到就不印數字。 */
function formatStory({ target, runs, results, failures }) {
  const lines = []
  if (results.length === 0) {
    lines.push(`\n## ${target.label}: 儀器失效 —— ${runs} 次全部沒量到,沒有數字`)
  } else {
    const avgFrames = results.map(r => r.avgFrame)
    const avgStats = stats(avgFrames)
    const p95Stats = stats(results.map(r => r.p95Frame))
    const longestStats = stats(results.map(r => r.longestTaskMs))
    const last = results[results.length - 1]
    const partial = failures.length ? ` —— 只量到 ${results.length}/${runs} 次,數字不完整` : ''
    lines.push(`\n## ${target.label} [CPU ${CPU_THROTTLE_RATE}x throttled, 量到 ${results.length}/${runs} 次${partial}]`)
    lines.push(`  Mount-to-first-row(last):  ${last.mountMs}ms`)
    lines.push(`  Initial DOM rows:           ${last.initStats.totalRowsRendered}`)
    lines.push(`  Scrolled(last):             ${last.scrolledPx}px, ${last.frameCount} frames`)
    lines.push(`  Avg frame median: ${avgStats.median}ms  mean: ${avgStats.mean.toFixed(2)}ms  ±stddev: ${avgStats.stddev.toFixed(2)}ms`)
    lines.push(`  p95 frame median: ${p95Stats.median}ms  mean: ${p95Stats.mean.toFixed(2)}ms`)
    lines.push(`  Longest task median: ${longestStats.median}ms`)
    lines.push(`  All runs avg: [${avgFrames.join(', ')}] ms`)
  }
  for (const f of failures) lines.push(`  ✗ 第 ${f.run + 1} 次沒量到(${f.reason}):${f.detail}`)
  return lines
}

/** 整次執行的結論。任何一次沒量到 → exit 1(儀器失效,不是效能不合格)。 */
function verdict(reports, notFound = []) {
  const failed = reports.filter(r => r.failures.length > 0)
  const lines = []
  if (failed.length === 0) {
    lines.push(`\n✓ ${reports.length} 則 story 各量到 ${reports.map(r => `${r.results.length}/${r.runs}`).join('、')} 次。本工具不比任何門檻,數字只供人讀。`)
    return { exitCode: 0, lines }
  }
  const missed = failed.reduce((n, r) => n + r.failures.length, 0)
  lines.push(`\n✗ 儀器失效:${reports.length} 則 story 裡有 ${failed.length} 則沒量完(共 ${missed} 次沒量到):${failed.map(r => r.target.label.split('(')[0]).join('、')}`)
  lines.push('  這份輸出不完整,數字不能拿來比較或當證據。這不是「效能不合格」—— 本工具不比門檻,是量測本身沒有完成。')
  const unique = [...new Set(notFound)]
  if (unique.length) lines.push(`  同源 404(儀器沒拿到檔,不代表元件沒渲染):${unique.join(', ')}`)
  return { exitCode: 1, lines }
}

// ── 對照組:合成頁,證明「該紅的紅、該綠的綠」,跟機器快慢無關 ─────────────────────
// 前三種頁面**永遠**不可能量到(沒有列 / 沒有捲動容器 / 容器內容不夠高),所以不論機器快慢都必須判儀器失效;
// 第四種是會真的捲的頁面,必須量到。no-row 那頁沒有任何腳本,等 3 秒跟等 25 秒結論相同,故縮短等待。
async function selftest() {
  const root = mkdtempSync(join(tmpdir(), 'runtime-perf-selftest-'))
  if (!root) throw new Error('mkdtemp 回傳空路徑 —— 無法建立對照組頁面')
  const row = '<div role="row" data-row-index="0">PROJ-1421 付款頁 3DS 驗證逾時</div>'
  // 合成頁沒有 Tailwind:class 只給選擇器找得到,真正讓容器可捲的是 inline overflow。
  // (第一版只寫 class,會捲的那頁被判 did-not-scroll —— 正向對照組當場抓到。)
  const fixtures = [
    { name: 'no-row', expect: 'no-first-row', html: '<div id="storybook-root"></div>' },
    { name: 'no-scroller', expect: 'no-scroller', html: `<div role="grid">${row}</div>` },
    { name: 'did-not-scroll', expect: 'did-not-scroll', html: `<div role="grid"><div class="overflow-y-auto" style="height:200px;overflow-y:auto">${row}</div></div>` },
    { name: 'scrolls', expect: 'ok', html: `<div role="grid"><div class="overflow-y-auto" style="height:200px;overflow-y:auto"><div style="height:100000px">${row}</div></div></div>` },
  ]
  const outcomes = []
  let bad = 0
  try {
    for (const fx of fixtures) {
      const dir = join(root, fx.name)
      mkdirSync(dir)
      writeFileSync(join(dir, 'iframe.html'), `<!doctype html><html><body>${fx.html}</body></html>\n`)
      const server = await startA11yStaticServer({ rootDirectory: dir, defaultFile: 'iframe.html', snapshot: false })
      try {
        const report = await measureStory(server.origin, { id: fx.name, label: `fixture:${fx.name}` }, 1, { firstRowTimeoutMs: 3000 })
        const got = report.results.length ? 'ok' : report.failures[0].reason
        const pass = got === fx.expect
        if (!pass) bad++
        console.log(`${pass ? '✓' : '✗'} ${fx.name}: 預期 ${fx.expect},實得 ${got}${report.failures[0] ? `(${report.failures[0].detail})` : ` — 捲了 ${report.results[0].scrolledPx}px、${report.results[0].frameCount} 幀`}`)
        outcomes.push(report)
      } finally {
        await server.stop()
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  // 結論層也要驗:只有會捲的那頁 → exit 0;任何一則沒量到(含「部分沒量到」)→ exit 1。
  const okReport = outcomes.find(r => r.target.id === 'scrolls')
  const failReport = outcomes.find(r => r.target.id === 'no-row')
  const partial = okReport && failReport && { target: { label: 'fixture:partial' }, runs: 2, results: okReport.results, failures: failReport.failures }
  const checks = [
    ['只有量到的報告 → exit 0', okReport && verdict([okReport]).exitCode === 0],
    ['一次都沒量到 → exit 1', failReport && verdict([okReport, failReport]).exitCode === 1],
    ['部分沒量到(1/2)→ exit 1 且標「數字不完整」', partial && verdict([partial]).exitCode === 1 && formatStory(partial).some(l => l.includes('只量到 1/2 次'))],
    ['一次都沒量到 → 不印任何數字', failReport && !formatStory(failReport).some(l => /frame|Mount/.test(l))],
  ]
  for (const [name, pass] of checks) { if (!pass) bad++; console.log(`${pass ? '✓' : '✗'} ${name}`) }
  if (bad) { console.log(`\n✗ selftest:${bad} 項不符 —— 本工具的「量到/沒量到」判定不可信`); process.exit(1) }
  console.log('\n✓ selftest:三種量不到的頁面都判儀器失效、會捲的頁面量得到,結論層 exit code 正確')
  process.exit(0)
}

if (SELFTEST) await selftest()

let server = null
if (!process.env.STORYBOOK_URL) {
  // 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
  server = await startA11yStaticServer({ rootDirectory: STATIC_DIR, defaultFile: 'iframe.html' })
}
const STORYBOOK_URL = process.env.STORYBOOK_URL || server.origin

try {
  const reports = []
  for (const t of targets) {
    const report = await measureStory(STORYBOOK_URL, t, RUNS_PER_STORY)
    reports.push(report)
    for (const line of formatStory(report)) console.log(line)
  }
  const { exitCode, lines } = verdict(reports, server?.notFound)
  for (const line of lines) console.log(line)
  process.exitCode = exitCode
} catch (error) {
  if (server?.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', '))
  throw error
} finally {
  await server?.stop()
}

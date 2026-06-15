#!/usr/bin/env node
/**
 * DataTable performance probe（2026-05-13）
 *
 * 量 3 個 virtual-scroll stories 的:
 *   - Initial mount time(navigation → first paint of table rows)
 *   - Scroll FPS(模擬連續 scroll 1000px,frame budget breach 次數)
 *   - Long task count(>50ms blocking)
 *   - JS heap size
 *   - DOM node count(virtualizer 是否真有限制 row DOM count)
 *
 * 對標:AG Grid public benchmark / Material X-DataGrid demo / Glide DataEditor
 */
import { chromium } from 'playwright'

const STORYBOOK_URL = process.env.STORYBOOK_URL || 'http://localhost:6006'
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
// 預設 1x(全 4 case 實測過,具迴歸偵測力);4x 保留為 CI 專用 stress(待 CI 硬體跑基準後再定門檻):
//   CPU_THROTTLE_RATE=4 node scripts/runtime-perf-datatable.mjs
const CPU_THROTTLE_RATE = Number(process.env.CPU_THROTTLE_RATE || 1)
const RUNS_PER_STORY = Number(process.env.RUNS_PER_STORY || 3)

const browser = await chromium.launch({ headless: true })

function stats(arr) {
  if (arr.length === 0) return { median: 0, mean: 0, stddev: 0 }
  const sorted = [...arr].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length
  return { median, mean, stddev: Math.sqrt(variance) }
}

for (const t of targets) {
  const runResults = []
  for (let run = 0; run < RUNS_PER_STORY; run++) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

  // CPU throttle via CDP(必在 page mount 後 newCDPSession)
  const client = await page.context().newCDPSession(page)
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE })

  await page.coverage.startJSCoverage()

  const mountStart = Date.now()
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=${t.id}&viewMode=story`, { waitUntil: 'networkidle' })

  // Wait until first row appears(2026-05-14 bump 10s → 25s — storybook dev mode 偶爾慢 mount)
  try {
    await page.waitForSelector('[role="row"][data-row-index="0"]', { timeout: 25000 })
  } catch {
    console.log(`\n## ${t.label}: FAIL — no row[data-row-index=0] in 25s`)
    await page.close()
    continue
  }
  const mountMs = Date.now() - mountStart

  // Wait for table to stabilize
  await page.waitForTimeout(800)

  // Initial DOM stats
  const initStats = await page.evaluate(() => {
    const rows = document.querySelectorAll('[role="row"][data-row-index]')
    return {
      totalRowsRendered: rows.length,
      domNodeCount: document.querySelectorAll('*').length,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null,
    }
  })

  // Inject long-task observer + frame timer
  await page.evaluate(() => {
    window.__perf = { longTasks: [], frames: [], scrollEnd: 0 }
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__perf.longTasks.push({ ts: entry.startTime, duration: entry.duration })
      }
    }).observe({ entryTypes: ['longtask'] })

    let lastTs = performance.now()
    function tick(ts) {
      const delta = ts - lastTs
      window.__perf.frames.push(delta)
      lastTs = ts
      if (ts < window.__perf.scrollEnd) requestAnimationFrame(tick)
    }
    window.__startFrameTimer = (durationMs) => {
      window.__perf.frames = []
      window.__perf.scrollEnd = performance.now() + durationMs
      requestAnimationFrame(tick)
    }
  })

  // Scroll the scroll container
  const scrollResult = await page.evaluate(async () => {
    // Find scrolling element (center body)
    const scroller = document.querySelector('[role="grid"] [class*="overflow"]') ||
      document.querySelector('.overflow-auto, [class*="overflow-y-auto"], [class*="overflow-auto"]')
    if (!scroller) return { error: 'no scroller found' }
    const scrollerEl = (scroller.closest('[class*="overflow-y-auto"]') || scroller)
    window.__startFrameTimer(2000)
    const startScroll = performance.now()
    // Simulate 2s of scrolling: 50px per 16ms
    let pos = 0
    while (performance.now() - startScroll < 2000) {
      pos += 50
      scrollerEl.scrollTop = pos
      await new Promise(r => requestAnimationFrame(r))
    }
    return { ok: true, finalScrollTop: scrollerEl.scrollTop, scrollDuration: performance.now() - startScroll }
  })

  await page.waitForTimeout(300)

  // Read perf
  const perfData = await page.evaluate(() => {
    const frames = window.__perf.frames
    const longTasks = window.__perf.longTasks
    // 16.67ms = 60fps budget
    const overBudget = frames.filter(f => f > 16.67).length
    const overBudgetPct = frames.length > 0 ? Math.round((overBudget / frames.length) * 100) : 0
    const avgFrame = frames.length > 0 ? frames.reduce((a, b) => a + b, 0) / frames.length : 0
    const p95Frame = frames.length > 0 ? [...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.95)] : 0
    return {
      frameCount: frames.length,
      avgFrameMs: Number(avgFrame.toFixed(2)),
      p95FrameMs: Number((p95Frame || 0).toFixed(2)),
      framesOverBudget: overBudget,
      framesOverBudgetPct: overBudgetPct,
      longTaskCount: longTasks.length,
      longestTaskMs: longTasks.length > 0 ? Math.max(...longTasks.map(t => t.duration)).toFixed(0) : 0,
    }
  })

  // After-scroll DOM stats
  const afterStats = await page.evaluate(() => ({
    rowCount: document.querySelectorAll('[role="row"][data-row-index]').length,
    domNodeCount: document.querySelectorAll('*').length,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null,
  }))

  runResults.push({ run, mountMs, avgFrame: perfData.avgFrameMs, p95Frame: perfData.p95FrameMs,
    longTaskCount: perfData.longTaskCount, longestTaskMs: Number(perfData.longestTaskMs),
    initStats, afterStats, scrollResult })

  await page.close()
  } // end runs

  // Statistical summary across runs
  const avgFrames = runResults.map(r => r.avgFrame)
  const p95Frames = runResults.map(r => r.p95Frame)
  const longestTasks = runResults.map(r => r.longestTaskMs)
  const avgStats = stats(avgFrames)
  const p95Stats = stats(p95Frames)
  const longestStats = stats(longestTasks)
  const last = runResults[runResults.length - 1]

  console.log(`\n## ${t.label} [CPU ${CPU_THROTTLE_RATE}x throttled, ${RUNS_PER_STORY} runs]`)
  console.log(`  Mount-to-first-row(last):  ${last.mountMs}ms`)
  console.log(`  Initial DOM rows:           ${last.initStats.totalRowsRendered}`)
  console.log(`  Avg frame median: ${avgStats.median}ms  mean: ${avgStats.mean.toFixed(2)}ms  ±stddev: ${avgStats.stddev.toFixed(2)}ms`)
  console.log(`  p95 frame median: ${p95Stats.median}ms  mean: ${p95Stats.mean.toFixed(2)}ms`)
  console.log(`  Longest task median: ${longestStats.median}ms`)
  console.log(`  All runs avg: [${avgFrames.join(', ')}] ms`)
}

await browser.close()

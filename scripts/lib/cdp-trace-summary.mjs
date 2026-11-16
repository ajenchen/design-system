/**
 * CDP Tracing 摘要 —— headless 也有效的成本量法(2026-11-16,A25;【AI 推導 2026-11-16】)。
 *
 * 為什麼要它:headless Chromium 的 rAF 被釘在 16.7ms(meta-patterns M32(g)),任何「每幀時間」在本機都是零證據;
 * 而 CI 上擋下 Q2b 的兩支閘量的正是幀節奏(推進幀距、送幀缺口)。CPU 工作量不靠幀節奏:同一支 story、同一段捲動,
 * 每條執行緒忙了多久、合成器畫了幾幀、每幀幾個 render pass / quad,在 headless 本機與 CI 上都量得到。
 * 2026-11-16 本機試驗(`tmp/wip…/a25` 的 trace-*):同建置 A/A 各執行緒 0.92–0.99×;故意給每列加 box-shadow → 光柵 1.29×
 * (RasterTask 1.43×)被指名,而呈現幀數 64 vs 64 完全看不到 —— 這就是這支 lib 存在的理由。
 *
 * 用法(閘端):`const t = await startTrace(browser)` → 量測 → `const events = await t.stop()` →
 * `summarizeTrace(events, findMark(events, 'a'), findMark(events, 'b'))`。時間窗的錨用頁內 `console.timeStamp(<訊息>)`
 * 打記號(trace 的 ts 與 performance.now 不同源)。找不到記號 / 窗內沒有任何事件 → 丟 `TraceInstrumentError`
 * (「儀器拿不到」,M32 臨時查詢條:0 筆不得當成「沒有成本」)。
 *
 * 執行緒分組靠 thread_name(單行程 `--single-process` 下全部在同一個 pid):
 *   main = CrRendererMain / Chrome_InProcRendererThread;compositor = Compositor;raster = CompositorTileWorker* / ThreadPool*Worker;
 *   viz = VizCompositorThread;gpu = CrGpuMain / Chrome_InProcGpuThread / Gpu*;browser = CrBrowserMain;其餘 other。
 */
export const TRACE_CATEGORIES = [
  'toplevel', 'blink', 'cc', 'viz', 'gpu', 'benchmark', 'input', 'latencyInfo', 'v8.execute',
  'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
]
export const THREAD_GROUPS = ['main', 'compositor', 'raster', 'viz', 'gpu', 'browser', 'other']

export class TraceInstrumentError extends Error {
  constructor(message) { super(`儀器拿不到:${message}`); this.name = 'TraceInstrumentError' }
}

export const threadGroup = (name = '') => (
  name === 'CrRendererMain' || name === 'Chrome_InProcRendererThread' ? 'main'
    : name === 'Compositor' ? 'compositor'
      : /^CompositorTileWorker|^ThreadPool(Background|Foreground)Worker/.test(name) ? 'raster'
        : name === 'VizCompositorThread' ? 'viz'
          : name === 'CrGpuMain' || name === 'Chrome_InProcGpuThread' || /^Gpu/.test(name) ? 'gpu'
            : name === 'CrBrowserMain' ? 'browser'
              : 'other'
)

/** 區間聯集的總長(不重算巢狀 / 重疊)。輸入 [[start, end], …](單位不限)。 */
export function unionLength(intervals) {
  const iv = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0])
  let tot = 0, cs = -Infinity, ce = -Infinity
  for (const [s, e] of iv) {
    if (s > ce) { if (ce > cs) tot += ce - cs; cs = s; ce = e } else ce = Math.max(ce, e)
  }
  if (ce > cs) tot += ce - cs
  return tot
}

/** 頁內 `console.timeStamp(message)` 在 trace 裡的時間(µs);找不到 → null。 */
export const findMark = (events, message) => events.find((e) => e.name === 'TimeStamp' && e.args?.data?.message === message)?.ts ?? null

/**
 * 時間窗 [t0us, t1us] 內的摘要。
 * @returns {{ windowMs:number, busy:Record<string,number>, counts:{beginMainFrame:number, drawFrame:number, commit:number, rasterTasks:number, drawQuads:number, renderPasses:number, eventLatency:number},
 *   perFrame:{ quads:number, renderPasses:number }, drawFrameTs:number[], mainTasks:{ts:number, dur:number}[], eventLatencyMs:number[], byName:Record<string,number> }}
 */
export function summarizeTrace(events, t0us, t1us) {
  if (!Array.isArray(events) || !events.length) throw new TraceInstrumentError('trace 是空的(沒有收到任何事件)')
  if (t0us == null || t1us == null || !(t1us > t0us)) throw new TraceInstrumentError('找不到時間窗記號(console.timeStamp)或窗長 ≤ 0')
  const tname = new Map()
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') tname.set(`${e.pid}:${e.tid}`, e.args?.name)
  const spans = []
  const stacks = new Map()
  for (const e of events) {
    if (e.ts == null) continue
    const key = `${e.pid}:${e.tid}`
    if (e.ph === 'X' && e.dur != null) spans.push({ key, name: e.name, ts: e.ts, dur: e.dur })
    else if (e.ph === 'B') { if (!stacks.has(key)) stacks.set(key, []); stacks.get(key).push(e) }
    else if (e.ph === 'E') { const b = stacks.get(key)?.pop(); if (b) spans.push({ key, name: b.name, ts: b.ts, dur: e.ts - b.ts }) }
  }
  const inWin = spans.filter((s) => s.ts + s.dur > t0us && s.ts < t1us)
  if (!inWin.length) throw new TraceInstrumentError('時間窗裡沒有任何有長度的事件')
  const byThread = new Map()
  for (const s of inWin) {
    if (!byThread.has(s.key)) byThread.set(s.key, [])
    byThread.get(s.key).push([Math.max(s.ts, t0us), Math.min(s.ts + s.dur, t1us)])
  }
  const busy = Object.fromEntries(THREAD_GROUPS.map((g) => [g, 0]))
  for (const [key, iv] of byThread) busy[threadGroup(tname.get(key))] += unionLength(iv) / 1000
  const byName = {}
  for (const s of inWin) { const k = `${threadGroup(tname.get(s.key))}|${s.name}`; byName[k] = (byName[k] ?? 0) + s.dur / 1000 }
  const count = (re) => inWin.filter((s) => re.test(s.name)).length
  const inst = (name) => events.filter((e) => e.name === name && e.ts > t0us && e.ts < t1us)
  // 合成器每畫一幀:viz 的 instant `DrawFrame`(Chromium 147 headless 實測 66 個,與 `DirectRenderer::DrawFrame` 區間一一對應但 ts 不同);
  // 有 instant 就只數它,沒有才退回區間 —— 兩種一起收會把同一幀算兩次
  const dfInstant = inst('DrawFrame')
  const drawFrameTs = (dfInstant.length ? dfInstant : inst('DirectRenderer::DrawFrame')).map((e) => e.ts).sort((a, b) => a - b)
  const counts = {
    beginMainFrame: count(/^(ProxyMain::BeginMainFrame|BeginMainThreadFrame)$/),
    drawFrame: drawFrameTs.length,
    commit: count(/^(ProxyImpl::ScheduledActionCommit|Commit)$/),
    rasterTasks: count(/^RasterTask$/),
    drawQuads: count(/^(SoftwareRenderer::DoDrawQuad|DirectRenderer::DoDrawQuad|SkiaRenderer::DoDrawQuad)$/),
    renderPasses: count(/^(DirectRenderer::DrawRenderPass|SkiaRenderer::DrawRenderPass)$/),
    // 合成器畫到「還沒光柵好的圖塊」(白 / 底色):cc 每遇到一次記一個 `TileBasedLayerImpl::AppendQuads checkerboard`(Chromium 147 實測)。
    // 這是使用者看得到的(快速捲動時的空白區),而且不靠幀節奏 —— 2026-11-16 本機:單一捲動盒 mouse 14 → 42、釘選欄 12 → 37
    checkerboard: events.filter((e) => /checkerboard/i.test(e.name ?? '') && e.ts > t0us && e.ts < t1us).length,
  }
  // EventLatency(輸入事件 → 畫面送出):非同步事件,ph b / e 以 id 配對(Chromium 147 實測;也收 X 形)
  const eventLatencyMs = []
  const open = new Map()
  for (const e of events) {
    if (e.name !== 'EventLatency' || e.ts == null) continue
    const id = `${e.id ?? e.id2?.local ?? e.id2?.global ?? ''}`
    if (e.ph === 'X' && e.dur != null && e.ts > t0us && e.ts < t1us) eventLatencyMs.push(e.dur / 1000)
    else if (e.ph === 'b') open.set(id, e.ts)
    else if (e.ph === 'e' && open.has(id)) { const b = open.get(id); open.delete(id); if (b > t0us && b < t1us) eventLatencyMs.push((e.ts - b) / 1000) }
  }
  counts.eventLatency = eventLatencyMs.length
  const mainKeys = new Set([...tname.entries()].filter(([, n]) => threadGroup(n) === 'main').map(([k]) => k))
  const mainTasks = inWin.filter((s) => mainKeys.has(s.key) && /^(ThreadControllerImpl::RunTask|RunTask)$/.test(s.name)).map((s) => ({ ts: s.ts, dur: s.dur }))
  const df = counts.drawFrame || NaN
  return {
    windowMs: (t1us - t0us) / 1000, busy, counts,
    perFrame: { quads: counts.drawQuads / df, renderPasses: counts.renderPasses / df },
    drawFrameTs, mainTasks, eventLatencyMs, byName,
  }
}

/**
 * 開始收 trace(瀏覽器層 CDP session、`ReportEvents`:Playwright 的 startTracing 走 IO stream,本 repo 沙箱 + 單行程模式下 IO.read 會失敗)。
 * @returns {Promise<{ stop: () => Promise<object[]> }>}
 */
export async function startTrace(browser, { categories = TRACE_CATEGORIES } = {}) {
  const session = await browser.newBrowserCDPSession()
  const collected = []
  session.on('Tracing.dataCollected', ({ value }) => { for (const v of value) collected.push(v) })
  const done = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve))
  await session.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: categories, recordMode: 'recordContinuously' } })
  return {
    async stop() { await session.send('Tracing.end'); await done; await session.detach().catch(() => {}); return collected },
  }
}

/**
 * 靜止時的合成層摘要(LayerTree;不要跟 Tracing 同時開 —— 它本身有成本)。`nudge` = 讓頁面推 1px 再推回、逼出一次 commit
 * (layerTreeDidChange 只在下一次 commit 才送;2026-11-16 第一版沒推,兩份建置都讀到 0 層 = 儀器沒看到,不是沒有層)。
 */
export async function layerTreeSnapshot(page, cdp, { nudge }) {
  let layers = []
  const on = (e) => { if (e.layers) layers = e.layers }
  cdp.on('LayerTree.layerTreeDidChange', on)
  await cdp.send('LayerTree.enable')
  await nudge(page)
  await page.waitForTimeout(400)
  if (!layers.length) { await cdp.send('LayerTree.disable').catch(() => {}); throw new TraceInstrumentError('推過捲動仍沒收到 layerTreeDidChange') }
  const reasons = {}
  for (const l of layers) {
    try { const { compositingReasonIds = [] } = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId }); for (const id of compositingReasonIds) reasons[id] = (reasons[id] ?? 0) + 1 } catch { /* 層已消失 */ }
  }
  const content = layers.filter((l) => l.drawsContent)
  await cdp.send('LayerTree.disable').catch(() => {})
  return { layers: layers.length, drawsContent: content.length, sticky: layers.filter((l) => l.stickyPositionConstraint).length,
    contentAreaMpx: +(content.reduce((s, l) => s + l.width * l.height, 0) / 1e6).toFixed(3), reasons }
}

/**
 * 擷取缺口歸因(data-table-scroll-performance.spec.md「dpr1 擷取缺口判定表」,plan §3.6):最長送幀缺口那段時間裡,
 * 合成器有沒有照常出幀、主執行緒有沒有長工。
 *   · 合成器連續(相鄰 DrawFrame 間隔 ≤ 2 個 vsync,邊界 2.5 個 vsync 容幀時間戳抖動)且主執行緒無長工 → 'capture-starved'(產品照常出幀,截圖搶不到 CPU = 量具問題)
 *   · 合成器也斷、主執行緒有長工 → 'main-thread-stall'
 *   · 合成器也斷、主執行緒無長工 → 'compositor-stall'(合成 / 光柵停頓 = 結構成本)
 * 缺口裡一張 DrawFrame 都沒有、而缺口前後也沒有 → 'no-data'(儀器沒看到,不下結論)。時間單位一律 µs(trace 時鐘)。
 */
export function captureGapDiagnosis({ drawFrameTs, mainTasks, gapStartUs, gapEndUs, vsyncMs = 16.7, longTaskMs = 50 }) {
  const inGap = drawFrameTs.filter((t) => t >= gapStartUs && t <= gapEndUs)
  const around = drawFrameTs.filter((t) => t >= gapStartUs - 200_000 && t <= gapEndUs + 200_000)
  if (!around.length) return { verdict: 'no-data', maxDrawGapMs: NaN, drawFramesInGap: 0, mainLongTasks: 0 }
  const seq = [gapStartUs, ...inGap, gapEndUs]
  let maxGap = 0
  for (let i = 1; i < seq.length; i++) maxGap = Math.max(maxGap, (seq[i] - seq[i - 1]) / 1000)
  const longs = mainTasks.filter((t) => t.dur / 1000 >= longTaskMs && t.ts < gapEndUs && t.ts + t.dur > gapStartUs)
  // 「連續」= 相鄰兩張最多隔 2 個 vsync(漏 1 張)。邊界取 2.5 個 vsync:幀時間戳有 ±1ms 抖動,2 個 vsync 實測是 33.7ms(> 33.4)——
  // 寫成 ≤ 2 × vsync 會因抖動在「漏 1 張」與「漏 2 張」之間翻來翻去(2026-11-16 本機注入對照組實得)【AI 推導 2026-11-16】
  const continuous = maxGap <= 2.5 * vsyncMs
  const verdict = continuous && !longs.length ? 'capture-starved' : !continuous && longs.length ? 'main-thread-stall' : !continuous ? 'compositor-stall' : 'main-busy-but-drawing'
  return { verdict, maxDrawGapMs: maxGap, drawFramesInGap: inGap.length, mainLongTasks: longs.length }
}

/** 各組各趟摘要 → 並排表文字(每格各趟中位數;兩組時附比值)。`groups` = { label: summary[] }。 */
export function traceTable(groups) {
  const med = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN }
  const labels = Object.keys(groups)
  const rows = []
  const line = (name, get, digits = 0) => {
    const v = labels.map((l) => med(groups[l].map(get)))
    const ratio = labels.length === 2 && v[0] > 0 ? ` 比值 ${(v[1] / v[0]).toFixed(2)}×` : ''
    rows.push(`   ${name.padEnd(28)} ${labels.map((l, i) => `${l} ${Number.isFinite(v[i]) ? v[i].toFixed(digits) : '-'}`).join('  ')}${ratio}`)
  }
  for (const g of THREAD_GROUPS) line(`忙碌 ${g}(ms)`, (s) => s.busy[g])
  for (const k of ['beginMainFrame', 'drawFrame', 'commit', 'rasterTasks', 'drawQuads', 'renderPasses', 'checkerboard', 'eventLatency']) line(`次數 ${k}`, (s) => s.counts[k])
  line('每幀 quad', (s) => s.perFrame.quads, 1)
  line('每幀 render pass', (s) => s.perFrame.renderPasses, 2)
  line('EventLatency 中位(ms)', (s) => med(s.eventLatencyMs), 1)
  return rows.join('\n')
}

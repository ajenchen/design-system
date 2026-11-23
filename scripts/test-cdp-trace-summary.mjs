#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: scripts/lib/cdp-trace-summary.mjs 的摘要算的是對的東西 —— 每條執行緒忙碌 = 區間聯集(巢狀 / 重疊不重算)、
 *         執行緒分組照 thread_name、合成幀 / render pass / quad / EventLatency 次數照實數、擷取缺口歸因照判定表;
 *         拿不到資料時丟「儀器拿不到」,不回 0。
 *   紅: 任一列不符 → 逐列點名 exit 1。對照組(`--selftest`):把聯集改成直接相加、把 instant DrawFrame 與區間 DrawFrame 一起數、
 *       把空 trace 改成回傳全 0、把 EventLatency 的時間窗檢查拿掉(b/e 與 X 形各一個,2026-11-16 覆核 SF12 補)—— 每一個突變都必須讓判定表至少一列不符。
 *   綠: 判定表全部相符時綠;輸入是固定的合成 trace、純函式,無時鐘、無隨機、無瀏覽器,重複跑結果恆等(不是抽籤)。
 *
 * 2026-11-16(A25;【AI 推導 2026-11-16】)。為什麼要它:headless 下「每幀時間」無效(M32(g)),捲動效能閘在 CI 上紅的當下,
 * 唯一說得出「成本在哪條執行緒」的就是這支 lib 的摘要;它算錯 = 歸因整個指錯方向。事件形狀取自 Chromium 147 headless 實測
 * (instant `DrawFrame` 與區間 `DirectRenderer::DrawFrame` 一一對應、`EventLatency` 是 ph b / e 以 id 配對)。
 *
 *   node scripts/test-cdp-trace-summary.mjs [--selftest]
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { summarizeTrace, unionLength, threadGroup, findMark, captureGapDiagnosis, traceTable, TraceInstrumentError, THREAD_GROUPS } from './lib/cdp-trace-summary.mjs'

const SELFTEST = process.argv.includes('--selftest')
let fail = 0
const check = (name, ok, got = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name}${!ok && got !== '' ? `(得 ${got})` : ''}`) }

// ── 合成 trace:時間單位 µs,窗 [1000, 11000] ──
const meta = (tid, name) => ({ ph: 'M', name: 'thread_name', pid: 1, tid, args: { name } })
const X = (tid, name, ts, dur) => ({ ph: 'X', name, pid: 1, tid, ts, dur })
const SYN = [
  meta(1, 'CrRendererMain'), meta(2, 'Compositor'), meta(3, 'CompositorTileWorker1'), meta(4, 'VizCompositorThread'), meta(5, 'ThreadPoolForegroundWorker'), meta(6, 'CrBrowserMain'), meta(7, 'SomethingElse'),
  { ph: 'I', name: 'TimeStamp', pid: 1, tid: 1, ts: 1000, args: { data: { message: 'win-start' } } },
  { ph: 'I', name: 'TimeStamp', pid: 1, tid: 1, ts: 11000, args: { data: { message: 'win-end' } } },
  // main:兩個任務,第二個裡巢狀一個子事件(聯集 = 2000 + 3000 = 5000µs = 5ms;直接相加會是 6.5ms)
  X(1, 'ThreadControllerImpl::RunTask', 2000, 2000), X(1, 'ThreadControllerImpl::RunTask', 5000, 3000), X(1, 'Layout', 5500, 1500),
  // main:一個跨出窗口的任務(10500–12500,窗內只算 500)
  X(1, 'ThreadControllerImpl::RunTask', 10500, 2000),
  // raster 兩條執行緒各 1ms(合計 2ms),其中一條兩個重疊區間(1000–1600 與 1400–2000 → 聯集 1000)
  X(3, 'RasterTask', 1000, 600), X(3, 'RasterTask', 1400, 600), X(5, 'RasterTask', 3000, 1000),
  // viz:兩幀,每幀一個 DrawRenderPass、3 個 quad;instant DrawFrame 與區間 DirectRenderer::DrawFrame 一一對應(ts 不同)
  X(4, 'DirectRenderer::DrawFrame', 4000, 500), { ph: 'I', name: 'DrawFrame', pid: 1, tid: 4, ts: 3990 }, X(4, 'DirectRenderer::DrawRenderPass', 4050, 400),
  X(4, 'SoftwareRenderer::DoDrawQuad', 4100, 50), X(4, 'SoftwareRenderer::DoDrawQuad', 4200, 50), X(4, 'SoftwareRenderer::DoDrawQuad', 4300, 50),
  X(4, 'DirectRenderer::DrawFrame', 9000, 500), { ph: 'I', name: 'DrawFrame', pid: 1, tid: 4, ts: 8990 }, X(4, 'DirectRenderer::DrawRenderPass', 9050, 400),
  X(4, 'SoftwareRenderer::DoDrawQuad', 9100, 50), X(4, 'SoftwareRenderer::DoDrawQuad', 9200, 50), X(4, 'SoftwareRenderer::DoDrawQuad', 9300, 50),
  // 光柵追不上:合成器畫到還沒光柵好的圖塊,窗內 2 次、窗外 1 次
  X(4, 'TileBasedLayerImpl::AppendQuads checkerboard', 4060, 5), X(4, 'TileBasedLayerImpl::AppendQuads checkerboard', 9060, 5), X(4, 'TileBasedLayerImpl::AppendQuads checkerboard', 700, 5),
  // 窗外的一幀(不得算進來)
  { ph: 'I', name: 'DrawFrame', pid: 1, tid: 4, ts: 500 }, X(4, 'DirectRenderer::DrawFrame', 510, 100),
  // compositor / browser / other 各一段
  X(2, 'ProxyMain::BeginMainFrame', 6000, 300), X(6, 'BrowserMainLoop', 7000, 100), X(7, 'Whatever', 7000, 200),
  // EventLatency:非同步 b / e 以 id 配對(一筆 8ms、一筆 12ms;一筆只有 b 沒有 e → 不算)
  { ph: 'b', name: 'EventLatency', pid: 1, tid: 6, ts: 2000, id: '0x1' }, { ph: 'e', name: 'EventLatency', pid: 1, tid: 6, ts: 10000, id: '0x1' },
  { ph: 'b', name: 'EventLatency', pid: 1, tid: 6, ts: 3000, id: '0x2' }, { ph: 'e', name: 'EventLatency', pid: 1, tid: 6, ts: 15000, id: '0x2' },
  { ph: 'b', name: 'EventLatency', pid: 1, tid: 6, ts: 4000, id: '0x3' },
  // 窗外的 EventLatency(覆核 SF12:規格「釘選欄滾輪延遲 104 → 74ms」靠這個時間窗過濾,原本沒有任何一列守它):
  // 開始在窗前(500)、結束在窗內 → 不算;開始在窗後(12000)→ 不算;X 形的窗外一筆 → 不算
  { ph: 'b', name: 'EventLatency', pid: 1, tid: 6, ts: 500, id: '0x4' }, { ph: 'e', name: 'EventLatency', pid: 1, tid: 6, ts: 3000, id: '0x4' },
  { ph: 'b', name: 'EventLatency', pid: 1, tid: 6, ts: 12000, id: '0x5' }, { ph: 'e', name: 'EventLatency', pid: 1, tid: 6, ts: 14000, id: '0x5' },
  X(6, 'EventLatency', 11500, 900),
]

const s = summarizeTrace(SYN, findMark(SYN, 'win-start'), findMark(SYN, 'win-end'))
check('窗長 10ms', s.windowMs === 10, s.windowMs)
check('main 忙碌 = 區間聯集 5ms + 跨窗任務窗內 0.5ms = 5.5ms(巢狀的 Layout 不重算)', Math.abs(s.busy.main - 5.5) < 1e-9, s.busy.main)
check('raster 忙碌 = 兩條執行緒各自聯集相加 = 1 + 1 = 2ms(重疊不重算)', Math.abs(s.busy.raster - 2) < 1e-9, s.busy.raster)
check('viz 忙碌 = 兩幀各 0.5ms = 1ms(子事件在幀內,不重算;窗外那一幀不算)', Math.abs(s.busy.viz - 1) < 1e-9, s.busy.viz)
check('compositor / browser / other 各自分組', s.busy.compositor === 0.3 && s.busy.browser === 0.1 && s.busy.other === 0.2, JSON.stringify(s.busy))
check('合成幀 = 窗內 instant DrawFrame 2 個(不與區間 DirectRenderer::DrawFrame 重算、窗外那一幀不算)', s.counts.drawFrame === 2 && s.drawFrameTs.join() === '3990,8990', `${s.counts.drawFrame} / ${s.drawFrameTs.join()}`)
check('每幀 render pass 1、quad 3', s.perFrame.renderPasses === 1 && s.perFrame.quads === 3, JSON.stringify(s.perFrame))
check('checkerboard(畫到還沒光柵好的圖塊)窗內 2 次(窗外那次不算)', s.counts.checkerboard === 2, s.counts.checkerboard)
check('EventLatency b/e 以 id 配對:8ms、12ms(只有 b 的不算;開始在窗外的 b/e 兩筆與 X 形一筆都不算)', s.eventLatencyMs.join() === '8,12', s.eventLatencyMs.join())
check('主執行緒任務清單(給擷取缺口歸因)3 筆', s.mainTasks.length === 3, s.mainTasks.length)
check('區間聯集:[0,10]+[5,15]+[20,25] = 20', unionLength([[0, 10], [5, 15], [20, 25]]) === 20)
check('執行緒分組:單行程的 Chrome_InProcRendererThread 也是 main、ThreadPoolBackgroundWorker 是 raster、GpuWatchdog 是 gpu',
  threadGroup('Chrome_InProcRendererThread') === 'main' && threadGroup('ThreadPoolBackgroundWorker') === 'raster' && threadGroup('GpuWatchdog') === 'gpu')
// 拿不到資料 → 儀器拿不到(不回 0)
const throws = (fn) => { try { fn(); return false } catch (e) { return e instanceof TraceInstrumentError && /儀器拿不到/.test(e.message) } }
check('空 trace → 丟「儀器拿不到」', throws(() => summarizeTrace([], 0, 1)))
check('找不到時間窗記號 → 丟「儀器拿不到」', throws(() => summarizeTrace(SYN, findMark(SYN, 'nope'), 11000)))
check('窗內沒有任何事件 → 丟「儀器拿不到」', throws(() => summarizeTrace(SYN, 20000, 30000)))
// 擷取缺口歸因(plan §3.6 判定表):vsync 16.7ms
const df = (ms) => ms.map((m) => m * 1000)
const G = { gapStartUs: 100_000, gapEndUs: 210_000 }
const rows = [
  ['合成器每 16ms 一幀、主執行緒沒長工 → 截圖被餓死(量具問題)', { drawFrameTs: df([90, 106, 122, 138, 154, 170, 186, 202, 218]), mainTasks: [] }, 'capture-starved'],
  ['合成器也斷(60ms 沒幀)、主執行緒有 80ms 長工 → 主執行緒停頓', { drawFrameTs: df([90, 106, 166, 182, 198, 214]), mainTasks: [{ ts: 105_000, dur: 80_000 }] }, 'main-thread-stall'],
  ['合成器也斷、主執行緒沒長工 → 合成 / 光柵停頓(結構成本)', { drawFrameTs: df([90, 106, 166, 182, 198, 214]), mainTasks: [{ ts: 105_000, dur: 20_000 }] }, 'compositor-stall'],
  ['合成器漏 1 張(間隔 33.7ms = 2 個 vsync 加抖動;2026-11-16 本機注入對照組實得)、主執行緒沒長工 → 仍算連續', { drawFrameTs: df([90, 106, 139.7, 156, 172, 188, 204, 220]), mainTasks: [] }, 'capture-starved'],
  ['合成器漏 2 張(間隔 50ms = 3 個 vsync)、主執行緒沒長工 → 合成 / 光柵停頓', { drawFrameTs: df([90, 106, 156, 172, 188, 204, 220]), mainTasks: [] }, 'compositor-stall'],
  ['缺口前後 200ms 一張合成幀都沒收到 → 儀器沒看到(不下結論)', { drawFrameTs: df([1000]), mainTasks: [] }, 'no-data'],
  // 規格「dpr1 擷取缺口判定表」第四列(覆核 SF13:程式會回、規格原本沒寫):合成器照常出幀,但缺口裡主執行緒有長工
  ['合成器每 16ms 一幀、主執行緒有 80ms 長工 → 主執行緒忙但合成器照畫', { drawFrameTs: df([90, 106, 122, 138, 154, 170, 186, 202, 218]), mainTasks: [{ ts: 105_000, dur: 80_000 }] }, 'main-busy-but-drawing'],
]
for (const [name, x, want] of rows) { const got = captureGapDiagnosis({ ...x, ...G }).verdict; check(`擷取缺口歸因|${name} → ${got}`, got === want, got) }
// 並排表:兩組時附比值、每組取各趟中位數
const t = traceTable({ a: [s, s], b: [{ ...s, busy: { ...s.busy, raster: 4 } }] })
check('並排表:raster 比值 2.00×、THREAD_GROUPS 全列', /忙碌 raster\(ms\)\s+a 2\s+b 4 比值 2\.00×/.test(t) && THREAD_GROUPS.every((g) => t.includes(`忙碌 ${g}`)), t.split('\n').find((l) => l.includes('raster')))

// ── 對照組(--selftest):五個單一根因突變,每一個都必須讓上面的判定表至少一列不符 ──
// 突變版寫到固定路徑(node_modules/.cache;被啟動的檔路徑必須能被 harness 來源清單靜態審查,與 test-gen-design-system-barrel 同一個做法)
if (SELFTEST) {
  const lib = readFileSync(new URL('./lib/cdp-trace-summary.mjs', import.meta.url), 'utf8')
  const self = readFileSync(new URL(import.meta.url), 'utf8')
  const MUT_DIR = join(import.meta.dirname, '..', 'node_modules', '.cache', 'cdp-trace-summary-mutant')
  const MUT_TEST = join(MUT_DIR, 'test.mjs')
  const MUTANTS = [
    ['聯集改成直接相加(巢狀重算)', (x) => x.replace('  for (const [key, iv] of byThread) busy[threadGroup(tname.get(key))] += unionLength(iv) / 1000', '  for (const [key, iv] of byThread) busy[threadGroup(tname.get(key))] += iv.reduce((a, [p, q]) => a + q - p, 0) / 1000')],
    ['instant DrawFrame 與區間一起數', (x) => x.replace("const drawFrameTs = (dfInstant.length ? dfInstant : inst('DirectRenderer::DrawFrame')).map((e) => e.ts).sort((a, b) => a - b)", "const drawFrameTs = [...dfInstant, ...inst('DirectRenderer::DrawFrame')].map((e) => e.ts).sort((a, b) => a - b)")],
    ['空 trace 回全 0(不丟儀器拿不到)', (x) => x.replace("if (!Array.isArray(events) || !events.length) throw new TraceInstrumentError('trace 是空的(沒有收到任何事件)')", "if (!Array.isArray(events) || !events.length) return { windowMs: 0, busy: {}, counts: {}, perFrame: {}, drawFrameTs: [], mainTasks: [], eventLatencyMs: [], byName: {} }")],
    // 覆核 SF12:EventLatency 的時間窗檢查拿掉(b/e 配對與 X 形各一處)→ 窗外那幾筆被算進來
    ['EventLatency 的 b/e 時間窗檢查拿掉', (x) => x.replace('if (b > t0us && b < t1us) eventLatencyMs.push((e.ts - b) / 1000)', 'eventLatencyMs.push((e.ts - b) / 1000)')],
    ['EventLatency 的 X 形時間窗檢查拿掉', (x) => x.replace("if (e.ph === 'X' && e.dur != null && e.ts > t0us && e.ts < t1us) eventLatencyMs.push(e.dur / 1000)", "if (e.ph === 'X' && e.dur != null) eventLatencyMs.push(e.dur / 1000)")],
  ]
  mkdirSync(join(MUT_DIR, 'lib'), { recursive: true })
  writeFileSync(MUT_TEST, self)
  for (const [name, mutate] of MUTANTS) {
    const m = mutate(lib)
    if (m === lib) { check(`對照組|${name}:突變沒套上(找不到要改的那一行)`, false); continue }
    writeFileSync(join(MUT_DIR, 'lib', 'cdp-trace-summary.mjs'), m)
    const r = spawnSync(process.execPath, ['--', MUT_TEST], { encoding: 'utf8' })
    const wrong = (r.stdout.match(/^✗ /gm) ?? []).length + (r.stdout ? 0 : 1)
    check(`對照組|${name} → 判定表 ${wrong} 列不符(必須 ≥ 1;exit ${r.status})`, r.status !== 0 && wrong >= 1)
  }
  rmSync(MUT_DIR, { recursive: true, force: true })
}

console.log(fail ? `\n✗ ${fail} 項不符` : `\n✓ CDP Tracing 摘要判定表全過${SELFTEST ? '(含五個突變對照組)' : ''}`)
process.exit(fail ? 1 : 0)

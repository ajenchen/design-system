#!/usr/bin/env node
/**
 * DataTable 快速捲動「中間區空白」儀器 —— 2026-09-09
 *
 * 背景:user 在真實 Chrome(Netlify 分支預覽)快速滾輪捲「專案排程全功能整合」時,左釘選 ID 欄與右側動作欄有畫、
 * 中間整片白,而 main 的 storybook 幾乎不會。既有閘 `scripts/data-table-scroll-cost.mjs` 用 60px 步進、換列後才量,
 * 全綠 —— 它量的是「主執行緒做了多少事」,不是「使用者看到什麼」。本儀器改量真實情境:連續滾輪、每一幀看畫面。
 *
 * 為什麼會「左右有畫、中間白」(量測設計的依據):
 *   - 三個區各自是捲動容器,只有 center 真的捲(`data-table.tsx` 三區容器段,`overflow-y-auto` 的 [data-datatable-hscroll]);
 *     左右釘選面板 `overflow-hidden`,由 `onCenterBodyScroll` 在 scroll 事件裡寫 `scrollTop` 同步(data-table.tsx:1700-1706)。
 *   - 滾輪捲 center 走瀏覽器原生路徑:合成執行緒先把 layer 位移,主執行緒下一幀才收到 scroll 事件;
 *     react-virtual 在 scroll 事件內 `flushSync` 重繪(node_modules/@tanstack/react-virtual/dist/esm/index.js:16),
 *     overscan 只預先掛 5 列(data-table.tsx:1084 `overscan = 5`、:1548)。
 *   → 主執行緒一幀沒跟上,合成執行緒已經把視窗推到「還沒掛任何列」的區域 = 中間白;左右面板要等主執行緒
 *     才會動,所以停在舊位置、看起來「有畫」。這個機制在 DOM 層看不到(rAF 時 DOM 永遠是一致的),
 *     只能從「兩個主幀之間捲了多遠」對「上一幀已渲染的範圍」推算 —— 本儀器的「預估 paint 空白」就是這個。
 *
 * 量什麼(每一幀 requestAnimationFrame 取樣):
 *   (1) DOM 空白率 = (中間區缺列 + 中間區有列但所有格子沒內容)/ 左釘選面板在視窗內的列數
 *       視窗內 = 該列 rect 與 center 容器 rect 垂直相交;格子有內容 = textContent 非空或有子元素。
 *   (2) 預估 paint 空白率 = 1 − |[0,H] ∩ (上一幀已渲染列範圍 − 本幀捲動位移)| / H
 *       H = center clientHeight;已渲染範圍 = 第一列 top 到最後一列 bottom(相對 center)。
 *       滾輪(page.mouse.wheel)模式下這就是合成執行緒真的畫出來的東西;JS 直接寫 scrollTop 的模式沒有合成超前,
 *       這個數字是「若由合成執行緒推進會看到的」。
 *   (3) Long Task(PerformanceObserver longtask):個數、最長、合計;主幀間隔(dt)最大/平均。
 *   (4) 主執行緒 script 時間、layout / style 次數(CDP Performance.getMetrics 差分;機器相關,只印)。
 *   (5) 每幀 React commits / scroll 事件數(DevTools hook 樁 + capture scroll listener)。
 *
 * 捲動情境(--mode,逗號分隔):
 *   wheel  :對 center 容器 dispatch `wheel`(deltaY 300/400/500/600 輪替,每 16ms 一次,連續 40 次)。
 *            合成的 WheelEvent 沒有預設動作(untrusted),所以自己補 `scrollTop += deltaY`。
 *   pinned :同上但 dispatch 在左釘選面板,走元件自己的滾輪轉發(data-table.tsx makeBindPinnedPanel,非 passive 監聽)。
 *   mouse  :CDP `Input.dispatchMouseEvent mouseWheel`(trusted,走真的輸入管線與合成執行緒;不等回應,照 16ms 節奏丟)。
 *   gesture:**真實呈現幀(2026-09-09,Codex R8 駁回「預估 paint 空白」後改用)**:CDP `Input.synthesizeScrollGesture`(走原生輸入管線與
 *            合成執行緒,--gesture-px / --gesture-speed)+ `Page.startScreencast`(合成器實際送出的每一幀)。每一幀把中央捲動區切成
 *            40px 帶,帶內(避開分隔線)完全沒有墨跡 = 空白帶;同時每幀數 DOM 裡的列殼(`[data-row-shell]`)。量得到:空白幀數、
 *            最大空白帶數、最長連續空白 ms(按幀時間戳)、空白面積×時間、殼出現幀數、停捲後殼補齊時間。這才是使用者看到的東西。
 *   之後靜止 1 秒(--settle-ms)繼續取樣,看空白要多久才補回。
 *
 * 用法:
 *   node scripts/data-table-fast-scroll.mjs [--static=<dir>] [--label=<名>] [--runs=3] [--mode=wheel,mouse]
 *     [--builds=main=<dir>,branch=<dir>](多個 build 對照,取代 --static/--label)
 *     [--story=<id>] [--viewport=1400x800] [--dpr=1](deviceScaleFactor,Retina 用 2)[--smooth=on|off](off = --disable-smooth-scrolling)
 *     [--cpu-throttle=1](CDP Emulation.setCPUThrottlingRate;4–6 約等於 GitHub ubuntu runner,重現慢機器的白區)
 *     [--ticks=40] [--tick-ms=16] [--settle-ms=1000] [--start=<px>](起始 scrollTop,預設 0)
 *     [--shots](mouse 模式在第 15 / 30 個滾輪事件後 + 靜止後各用 CDP 截圖,量中間區與左面板的近白像素比例 —— 直接看畫面;靜止那張是基準)
 *     [--profile=<dir>](另跑一次 CPU profile,寫 <dir>/<label>-<mode>.cpuprofile + .json,印 self time 前 15 名與 minified 原始碼片段)
 *     [--json=<path>](寫全部 run 的原始資料)
 *     [--gesture-px=6000] [--gesture-speed=12000](gesture 模式的距離與速度,px 與 px/s)
 *     [--css=<css>](消融實驗:載入後注入一段 CSS,同一個 build 比較有無 —— 2026-09-09 用它抓到列殼的脈動動畫讓光柵追不上)
 *     [--assert-max-blank-ms=<ms>] [--assert-max-fill-ms=<ms>](gesture 模式的閘:最長連續空白、停捲後殼補齊時間;給了才當閘)
 *     [--assert-max-paint-blank=<0..1>] [--assert-max-dom-blank=<0..1>](wheel / mouse 模式的舊閘;預估值只做診斷,不是白屏證據)
 *     [--selftest](對照組,見下)
 *
 * 對照組(--selftest,M32「儀器要先有對照組」):
 *   (a) 往左面板注入 5 列 React 不認識的假列(中間沒有對應)+ 1 列兩邊都有但中間格子空 → DOM 空白必須量到 ≥ 6 列;
 *   (b) 第 20 個滾輪事件前主執行緒忙等 150ms → long task 必須量到 ≥ 100ms,且忙等後的預估 paint 空白必須 > 0;
 *   (c0) gesture 公式對照(純函式):正常@0 / 空白@100 / 正常@110 必須算成 10ms(不是 100)、觀測窗結束仍有殼必須判「沒補完」;
 *   (c) gesture 模式兩組對照:負對照 = 500 列**不虛擬化**的靜態頁(同幾何)用同一手勢捲,呈現幀必須 0 空白帶(高速位移本身不會被誤判成白);
 *       正對照 = DataTable 每個 scroll 事件主執行緒忙等 120ms,呈現幀必須量到 ≥ 3 幀空白(該紅會紅)。
 *   任一沒紅 / 該綠沒綠 = 儀器壞了,exit 1。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'
import { median, gateVerdict, CEILING_FACTOR, longTaskLimit, refRatioVerdict, BLANK_RATIO_LIMIT } from './lib/fast-scroll-gate-policy.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, def) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : def }
const flag = (name) => process.argv.includes(`--${name}`)
const STORY = arg('story', 'design-system-components-datatable-展示--roadmap-all-in-one')
const RUNS = Number(arg('runs', 3))
const MODES = arg('mode', 'gesture').split(',').map((s) => s.trim()).filter(Boolean)
const TICKS = Number(arg('ticks', 40))
const TICK_MS = Number(arg('tick-ms', 16))
const SETTLE_MS = Number(arg('settle-ms', 1000))
const START_PX = Number(arg('start', 0))
const DELTAS = [300, 400, 500, 600]
const [VW, VH] = arg('viewport', '1400x800').split('x').map(Number)
const DPR = Number(arg('dpr', 1))
// 2026-09-09:CI(ubuntu runner)比 Mac 慢,R17 的緊急殼觸發在慢機器失效(6000px/s 白區 918–1027ms);本機用 CDP CPU 節流重現。
const CPU_THROTTLE = Number(arg('cpu-throttle', 1))
const SMOOTH = arg('smooth', 'on')
const SHOTS = flag('shots')
const PROFILE_DIR = arg('profile', '')
const JSON_OUT = arg('json', '')
const ASSERT_PAINT = arg('assert-max-paint-blank', '')
const ASSERT_DOM = arg('assert-max-dom-blank', '')
const SELFTEST = flag('selftest')
// `--ref=<label>`:把某個 build label 當成參考點(通常是 main),空白改判「本 build ÷ 參考 ≤ 比值上限」。
// 為什麼不是絕對門檻、也不是忙等對照:見 lib 的 refRatioVerdict 註解(忙等對照會飽和,量不出真實差距)。
const REF_LABEL = arg('ref', '')
const BUSY_AT = 20, BUSY_MS = 150
const GESTURE_PX = Number(arg('gesture-px', 6000))
const GESTURE_SPEED = Number(arg('gesture-speed', 12000))
// ── 目的地閘(2026-09-12)──────────────────────────────────────────────────────
// 本檔其餘的 `--assert-*` 都是**相對**判準(本 build ÷ `--ref` ≤ 比值上限),它們擋的是「比 main 差」。
// user 2026-09-12 原話:「你知道main只是低標嗎?理想上data table整體互動和體驗越順暢越好」
// ——「不比 main 差」是地板,不是目的地。整份閘只有地板 = 把 main 寫成了天花板。
//
// 這一條是**絕對**的,而且刻意與機器速度無關:
//   「送出的任何一幀,中央捲動區都不得有任何一帶是空的。」
// 它做得到與機器無關,是因為滿足它的機制(未掛載區預先鋪好骨架底)成本固定、由合成器搬運,
// 機器再慢也畫得出來 —— 慢機器該退化的是「多久看到真資料」,不是「看到白的」。
// 對偶條件(「不應該為了達成此目的而讓體驗和互動卡頓」,同一則 user 訊息)仍由上面的相對閘擋:
// 幀距與長工不得比 `--ref` 差 —— 兩條合起來才是完整的目的地,單獨任一條都可以被作弊繞過。
const ASSERT_BLANK_FRAMES = arg('assert-max-blank-frames', '')
const ASSERT_BLANK_MS = arg('assert-max-blank-ms', '')
const ASSERT_FILL_MS = arg('assert-max-fill-ms', '')
/** 主執行緒單一任務上限 / 合成器送出的幀距上限。
 *
 *  **為什麼要補**(2026-09-11,user:「連 hover table row 的反應都是延遲很久」):這支閘一直有量長工與幀距,
 *  但**從來沒有斷言**,只印在表上。於是一版把主執行緒最長任務從 66ms 推到 661ms 的改動照樣全綠放行 ——
 *  那個 661ms 會把所有輸入(hover、點擊)一起卡住,使用者感受到的就是「反應延遲很久」,而空白與補齊兩個
 *  既有斷言完全看不見它。任何超過 ~200ms 的主執行緒任務都是人感覺得到的停頓(web.dev INP 指引同一量級)。 */
const ASSERT_LONG_TASK_MS = arg('assert-max-long-task-ms', '')
const ASSERT_FRAME_GAP_MS = arg('assert-max-frame-gap-ms', '')
// 「**畫得動的機器**不准出殼」(2026-09-11)。這支閘原本只會印殼幀數、從不判定 —— 於是一個把
// `ahead` / `budgeted` 判準訂成「只看位移」的版本可以全綠出貨,而在 user 的真實 Chrome 上
// **一次普通滾輪就把整個視窗 14 列全變骨架**(main 同樣操作 0 骨架)。
//
// **不能無條件斷言 0**:骨架本來就是「機器真的畫不完」時的過渡手段,CI 那台 2 vCPU runner 就是畫不完的那種
// (實測 3 趟各 9 / 10 / 10 殼幀,那是正確行為)。所以判定前先問元件自己算出來的能力值:
// 視窗列數 × 每列成本 + commit 固定成本 ≤ 元件自己的出殼門檻才套這條斷言,
// 畫不動的機器印出數字並註明跳過 —— 它的白區與補齊由另外兩條斷言管。
const ASSERT_SHELL_FRAMES = arg('assert-max-shell-frames', '')
// **門檻從元件讀,不在這裡留第二份**(2026-09-12)。原本這裡硬寫 120,元件改成 60 之後兩邊打架:
// 閘用 120 判「畫得動 → 不准出殼」,元件用 60 判「畫不動 → 該出殼」,CI 必紅而且紅得沒道理。
// 元件把 `engageMs` 一起寫進 `data-shell-state`,這裡讀它;舊 build 沒有該欄位時退回 120(原行為)。
const SHELL_ENGAGE_FALLBACK_MS = 120
const SCROLL_BUSY_MS = 120
// 觀測窗必須長過補齊期限,否則「到窗尾還沒補完」會被當成補完(Codex R9)
const SETTLE_EFFECTIVE = ASSERT_FILL_MS !== '' ? Math.max(SETTLE_MS, Number(ASSERT_FILL_MS) + 300) : SETTLE_MS
const CSS_INJECT = arg('css', '') // 消融實驗用:載入後注入一段 CSS(例:關掉某個動畫),同一個 build 比較有無
const BUILDS = arg('builds', '')
  ? arg('builds', '').split(',').map((s) => { const i = s.indexOf('='); return { label: s.slice(0, i), dir: resolve(s.slice(i + 1)) } })
  : [{ label: arg('label', 'build'), dir: resolve(arg('static', process.env.DT_STATIC || join(REPO, 'storybook-static'))) }]
for (const m of MODES) if (!['wheel', 'pinned', 'mouse', 'gesture'].includes(m)) { console.error(`✗ 不認識的 --mode ${m}(wheel / pinned / mouse / gesture)`); process.exit(1) }
if (!SELFTEST && !(RUNS >= 1)) { console.error('✗ --runs 必須 ≥ 1(0 次會沒有任何結果卻 exit 0)'); process.exit(1) }
for (const b of BUILDS) if (!existsSync(join(b.dir, 'iframe.html'))) { console.error(`✗ ${b.label}:${b.dir} 沒有 iframe.html(build 不完整或路徑錯)`); process.exit(1) }

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const serve = async (dir) => {
  const server = http.createServer((q, s) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
    const f = join(dir, p)
    if (!existsSync(f) || statSync(f).isDirectory()) { s.writeHead(404); s.end(); return }
    s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f))
  })
  await new Promise((r) => server.listen(0, r))
  return { server, base: `http://localhost:${server.address().port}` }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 頁內:最早期樁(commit 計數 / long task / scroll 與 wheel 事件計數)──
const INIT = () => {
  const S = (window.__fs = { commits: 0, scrollEvents: 0, wheelTs: [], longs: [], frames: [], on: false })
  const renderers = new Map()
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers,
    inject(r) { const id = renderers.size + 1; renderers.set(id, r); return id },
    onCommitFiberRoot() { S.commits++ }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {},
    on() {}, off() {}, emit() {}, sub() { return () => {} },
  }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) S.longs.push({ start: e.startTime, dur: e.duration }) }).observe({ type: 'longtask', buffered: true }) } catch (e) { S.longtaskErr = String(e) }
  window.addEventListener('scroll', () => { S.scrollEvents++ }, true)
  window.addEventListener('wheel', (e) => { S.wheelTs.push({ t: performance.now(), dy: e.deltaY, trusted: e.isTrusted }) }, { capture: true, passive: true })
}

// ── 頁內:每幀取樣器(回傳 setup 資訊)──
const START_SAMPLER = ({ sabotage, startPx }) => {
  const S = window.__fs
  const cb = document.querySelector('[data-datatable-hscroll]')
  const left = document.querySelector('[data-datatable-panel="left"]')
  if (!cb) return { crashed: true }
  if (cb.scrollHeight <= cb.clientHeight + 1) return { noOverflow: true }
  cb.scrollTop = startPx
  const cbRect0 = cb.getBoundingClientRect()
  if (sabotage) {
    // 對照組 (a):假列用 position:fixed 釘在面板的螢幕座標上,不論怎麼捲都「在視窗內」;React 只動自己的節點,多一個外來子節點不會壞。
    const leftRect = (left ?? cb).getBoundingClientRect()
    const mk = (idx, k, withCell) => {
      const d = document.createElement('div'); d.setAttribute('data-row-index', String(idx)); d.setAttribute('data-fs-fake', '')
      d.style.cssText = `position:fixed;left:${leftRect.left}px;top:${leftRect.top + 60 + k * 40}px;width:40px;height:40px;pointer-events:none`
      if (withCell) { const c = document.createElement('div'); c.setAttribute('role', 'cell'); d.appendChild(c) }
      return d
    }
    for (let k = 0; k < 5; k++) (left ?? cb).appendChild(mk(9990 + k, k, true))   // 左有、中間沒有 → 列缺
    ;(left ?? cb).appendChild(mk(9995, 5, true)); cb.appendChild(mk(9995, 5, true)) // 兩邊都有、中間格子空 → 格空
  }
  S.frames = []; S.on = true; S.t0 = performance.now()
  let lastCommits = S.commits, lastScroll = S.scrollEvents, lastT = performance.now()
  const sample = () => {
    const t = performance.now()
    const cbRect = cb.getBoundingClientRect()
    const H = cb.clientHeight
    const map = new Map()
    for (const r of cb.querySelectorAll('[data-row-index]')) map.set(r.getAttribute('data-row-index'), r)
    const real = cb.querySelectorAll('[data-row-index]:not([data-fs-fake])')
    let rTop = 0, rBot = 0
    if (real.length) { const a = real[0].getBoundingClientRect(), b = real[real.length - 1].getBoundingClientRect(); rTop = Math.min(a.top, b.top) - cbRect.top; rBot = Math.max(a.bottom, b.bottom) - cbRect.top }
    let visible = 0, missing = 0, empty = 0
    for (const r of (left ?? cb).querySelectorAll('[data-row-index]')) {
      const rr = r.getBoundingClientRect()
      if (rr.bottom <= cbRect.top || rr.top >= cbRect.bottom) continue
      visible++
      const c = map.get(r.getAttribute('data-row-index'))
      if (!c) { missing++; continue }
      let has = false
      for (const cell of c.querySelectorAll('[role="cell"],[role="gridcell"]')) { if (cell.firstElementChild || cell.textContent.trim() !== '') { has = true; break } }
      if (!has) empty++
    }
    S.frames.push({ t, dt: t - lastT, shells: cb.querySelectorAll('[data-row-shell]').length, st: cb.scrollTop, lst: left ? left.scrollTop : null, H, visible, missing, empty, rTop, rBot, rows: real.length, commits: S.commits - lastCommits, scrolls: S.scrollEvents - lastScroll })
    lastT = t; lastCommits = S.commits; lastScroll = S.scrollEvents
  }
  const loop = () => { if (!S.on) return; sample(); requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  return { ok: true, hasLeft: !!left, rows: cb.querySelectorAll('[data-row-index]:not([data-fs-fake])').length, H: cb.clientHeight, scrollHeight: cb.scrollHeight, cx: cbRect0.left + cbRect0.width / 2, cy: cbRect0.top + cbRect0.height / 2, hookOk: window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size > 0, longtaskErr: S.longtaskErr || null }
}

// ── 頁內:合成滾輪事件(wheel / pinned 模式)。逾時的刻度一次補齊,模擬主執行緒卡住時輸入事件排隊再一起送到。──
const RUN_TICKS = async ({ ticks, tickMs, deltas, target, busyAt, busyMs }) => {
  const cb = document.querySelector('[data-datatable-hscroll]')
  const el = target === 'pinned' ? document.querySelector('[data-datatable-panel="left"]') : cb
  if (!el) return { noTarget: true }
  const rect = el.getBoundingClientRect(); const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
  const t0 = performance.now(); let applied = 0, forwarded = 0
  const applyTick = (i) => {
    const dy = deltas[i % deltas.length]
    const notPrevented = el.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: 0, bubbles: true, cancelable: true, clientX: cx, clientY: cy }))
    if (!notPrevented) forwarded++
    else if (target !== 'pinned') cb.scrollTop += dy // 合成事件沒有預設動作,補上瀏覽器會做的事
    applied++
  }
  await new Promise((done) => {
    const step = () => {
      const due = Math.min(ticks, Math.floor((performance.now() - t0) / tickMs) + 1)
      while (applied < due) {
        if (busyAt != null && applied === busyAt) { const b = performance.now(); while (performance.now() - b < busyMs) { /* 對照組 (b):忙等 */ } }
        applyTick(applied)
      }
      if (applied >= ticks) return done()
      setTimeout(step, Math.max(0, t0 + applied * tickMs - performance.now()))
    }
    step()
  })
  return { applied, forwarded, wallMs: performance.now() - t0 }
}

const STOP_SAMPLER = () => { const S = window.__fs; S.on = false; return { frames: S.frames, longs: S.longs.filter((l) => l.start + l.dur >= S.t0) /* 只算取樣視窗內;buffered 會含頁面載入 */, wheelTs: S.wheelTs, commits: S.commits, scrollEvents: S.scrollEvents, finalScroll: document.querySelector('[data-datatable-hscroll]')?.scrollTop ?? null } }

// ── 頁內:截圖近白像素比例(中間區 vs 左面板;PNG base64 → canvas)──
const ANALYZE_SHOT = async ({ b64 }) => {
  const cb = document.querySelector('[data-datatable-hscroll]'); const left = document.querySelector('[data-datatable-panel="left"]')
  const img = new Image(); img.src = 'data:image/png;base64,' + b64
  await new Promise((r, j) => { img.onload = r; img.onerror = j })
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0)
  // 截圖像素 / CSS 像素的比例由圖片實際尺寸算,不信 devicePixelRatio(dpr 2 時 CDP 截圖仍可能是 CSS 尺寸;2026-09-09 實測誤用 dpr 會量到圖外的透明像素)
  const k = img.width / window.innerWidth
  const white = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const x = Math.round(r.left * k), y = Math.round(r.top * k), w = Math.round(r.width * k), h = Math.round(r.height * k)
    const d = ctx.getImageData(x, y, w, h).data; let n = 0, tot = 0
    for (let i = 0; i < d.length; i += 16) { tot++; if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) n++ }
    return tot ? n / tot : null
  }
  return { center: white(cb), left: white(left) }
}

// ── 頁內:呈現幀分析(screencast jpeg → canvas;中央捲動區每 40px 一帶,避開上下 4px 的分隔線帶)──
const ANALYZE_FRAMES = async ({ list }) => {
  const cb = document.querySelector('[data-datatable-hscroll]'); const left = document.querySelector('[data-datatable-panel="left"]')
  const r = cb.getBoundingClientRect(); const lr = left ? left.getBoundingClientRect() : null
  const out = []
  for (const f of list) {
    const img = new Image(); img.src = 'data:image/png;base64,' + f.data
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no })
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
    const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0)
    const k = img.width / window.innerWidth
    const ink = (x, y, w, h) => {
      const d = ctx.getImageData(Math.round(x * k), Math.round(y * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))).data
      let n = 0, tot = 0
      for (let i = 0; i < d.length; i += 8) { tot++; if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) n++ }
      return tot ? n / tot : 0
    }
    // 帶內「有內容」= 至少 1 個「內容像素列」:該列(每 2px 取一列、每 8px 取一點)有 ≥ 3 個墨跡點、且墨跡點不到 90% 寬 ——
    // 滿寬的那種列是列分隔線(1px,neutral-4),不算內容(Codex R9 指出固定帶會被捲進來的分隔線騙過);
    // 墨跡門檻 < 250(PNG 幀白底 = 255),讓 DS 骨架色(≈ 240)與文字、頭像都算墨跡。假設淺色主題(story 是淺色)。
    const contentRows = (bx, by, bw, bh) => {
      const x0 = Math.round(bx * k), y0 = Math.round(by * k), w = Math.max(1, Math.round(bw * k)), h = Math.max(1, Math.round(bh * k))
      const d = ctx.getImageData(x0, y0, w, h).data; let rows = 0
      for (let yy = 0; yy < h; yy += 2) {
        let pts = 0, tot = 0
        for (let xx = 0; xx < w; xx += 8) { tot++; const i = (yy * w + xx) * 4; if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) pts++ }
        if (pts >= 3 && pts < tot * 0.9) rows++
      }
      return rows
    }
    const bands = []
    for (let y = r.top; y + 40 <= r.bottom; y += 40) bands.push(contentRows(r.left, y + 4, r.width, 32))
    out.push({ ts: f.ts, bands: bands.length, blank: bands.filter((v) => v < 1).length, centerInk: +ink(r.left, r.top, r.width, r.height).toFixed(4), leftInk: lr ? +ink(lr.left, lr.top, lr.width, lr.height).toFixed(4) : null })
  }
  return out
}
const analyzeGesture = (shots, frames, gestureEndFallback, windowEndTs = null) => {
  // 空白幀 = 中央區至少一帶沒有內容。每張擷取幀「保持到下一張擷取幀」為止 —— 空白的持續時間 = 下一張的時間戳 − 這一張
  // (Codex R9 反例:第一版把「前一段幀距」套到當前空白幀,正常@0、空白@100、正常@110 會報 100ms,實際是 10ms)。
  // 擷取序列仍是估算:screencast 可能略過幀,時間戳是建 metadata 的時間不是顯示回饋;所以這是回歸線,不是精確白屏時間。
  const blankArr = shots.map((s) => (s.bands ? s.blank / s.bands : 0))
  // 最後一張幀保持到觀測窗結束(不是 0):尾幀一路白到窗尾,必須算滿(Codex R10 blocker:最後兩張全白卻只報 31ms 過閘)
  const hold = shots.map((s, i) => (i + 1 < shots.length ? (shots[i + 1].ts - s.ts) * 1000 : (windowEndTs != null ? Math.max(0, (windowEndTs - s.ts) * 1000) : 0)))
  let longestMs = 0, cur = 0, areaMs = 0
  for (let i = 0; i < shots.length; i++) {
    if (shots[i].blank > 0) { cur += hold[i]; longestMs = Math.max(longestMs, cur); areaMs += blankArr[i] * hold[i] }
    else cur = 0
  }
  const dts = shots.slice(1).map((s, i) => (s.ts - shots[i].ts) * 1000)
  // 手勢結束 = DOM 取樣裡最後一次 scrollTop 變動的那一幀(不用 evaluate 回來的時間:主執行緒忙時它會往後飄)
  let gestureEnd = gestureEndFallback
  for (let i = frames.length - 1; i > 0; i--) if (frames[i].st !== frames[i - 1].st) { gestureEnd = frames[i].t; break }
  const shellFrames = frames.filter((f) => f.shells > 0)
  const shellMax = frames.reduce((m, f) => Math.max(m, f.shells), 0)
  // 補齊 = 最後一張有殼的幀之後、第一張殼歸零的幀;觀測窗結束時仍有殼 = 沒補完,不是「補了 N ms」
  // (Codex R9 反例:永久殼會以 990ms 通過 1000ms 的閘)
  let lastShellIdx = -1
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i].shells > 0) { lastShellIdx = i; break }
  const fillMs = lastShellIdx < 0 ? 0 : (lastShellIdx === frames.length - 1 ? Infinity : Math.max(0, frames[lastShellIdx + 1].t - gestureEnd))
  return {
    presented: shots.length, presentedGapMax: dts.length ? Math.max(...dts) : 0, presentedGapMean: dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0,
    blankFrames: shots.filter((s) => s.blank > 0).length, blankMaxBands: shots.reduce((m, s) => Math.max(m, s.blank), 0), bandsPerFrame: shots[0]?.bands ?? 0,
    blankLongestMs: longestMs, blankAreaMs: areaMs, blankSeries: blankArr,
    shellFrames: shellFrames.length, shellMax, fillMs, gestureEnd,
    centerInkMin: shots.reduce((m, s) => Math.min(m, s.centerInk), Infinity),
    shots: shots.map((s) => ({ ts: s.ts, blank: s.blank, bands: s.bands, centerInk: s.centerInk, leftInk: s.leftInk })),
    windowEndTs,
  }
}
// 純函式對照(selftest):公式在該紅的序列上要給出對的數字
const analyzeGestureSelfCheck = () => {
  const mk = (ts, blank) => ({ ts, blank, bands: 17, centerInk: 0.1, leftInk: 0.1 })
  const a = analyzeGesture([mk(0, 0), mk(0.1, 17), mk(0.11, 0)], [{ t: 0, st: 0, shells: 0 }, { t: 50, st: 100, shells: 0 }, { t: 100, st: 100, shells: 0 }], 0)
  const b = analyzeGesture([mk(0, 0), mk(0.01, 17), mk(0.1, 0)], [{ t: 0, st: 0, shells: 0 }, { t: 50, st: 100, shells: 0 }, { t: 100, st: 100, shells: 0 }], 0)
  const c = analyzeGesture([mk(0, 0), mk(0.02, 0)], [{ t: 0, st: 0, shells: 0 }, { t: 50, st: 100, shells: 20 }, { t: 990, st: 100, shells: 3 }], 0)
  const d = analyzeGesture([mk(0, 0), mk(0.02, 0)], [{ t: 0, st: 0, shells: 0 }, { t: 50, st: 100, shells: 20 }, { t: 300, st: 100, shells: 0 }], 0)
  const e = analyzeGesture([mk(0, 0), mk(0.02, 17)], [{ t: 0, st: 0, shells: 0 }, { t: 50, st: 100, shells: 0 }], 0, 1.0)
  const checks = [
    ['正常@0 / 空白@100 / 正常@110 → 最長連續 10ms', Math.abs(a.blankLongestMs - 10) < 1e-6, a.blankLongestMs],
    ['正常@0 / 空白@10 / 正常@100 → 最長連續 90ms', Math.abs(b.blankLongestMs - 90) < 1e-6, b.blankLongestMs],
    ['觀測窗結束仍有殼 → 補齊時間 = 沒補完(Infinity)', c.fillMs === Infinity, c.fillMs],
    ['停手(t=50)後 t=300 殼歸零 → 補齊 250ms', Math.abs(d.fillMs - 250) < 1e-6, d.fillMs],
    ['尾幀白到觀測窗結束(空白@20,窗尾 1000)→ 最長連續 980ms(不是 0)', Math.abs(e.blankLongestMs - 980) < 1e-6, e.blankLongestMs],
  ]
  for (const [name, ok, got] of checks) console.log(`${ok ? '✓' : '✗'} selftest 公式:${name}(得 ${got})`)
  return checks.every((c) => c[1])
}

// ── 分析 ──
const analyze = (frames) => {
  const paint = frames.map((f, i) => {
    if (i === 0 || !f.H) return 0
    const p = frames[i - 1]; const jump = f.st - p.st
    const top = p.rTop - jump, bot = p.rBot - jump
    const ov = Math.max(0, Math.min(bot, f.H) - Math.max(top, 0))
    return Math.max(0, Math.min(1, 1 - ov / f.H))
  })
  const dom = frames.map((f) => (f.visible ? (f.missing + f.empty) / f.visible : 0))
  const streak = (arr) => { let best = { frames: 0, ms: 0 }, cur = { frames: 0, ms: 0 }; arr.forEach((v, i) => { if (v > 0) { cur.frames++; cur.ms += frames[i].dt } else cur = { frames: 0, ms: 0 }; if (cur.ms > best.ms) best = { ...cur } }); return best }
  const max = (a) => a.reduce((m, v) => Math.max(m, v), 0)
  const jumps = frames.map((f, i) => (i ? f.st - frames[i - 1].st : 0))
  const dts = frames.slice(1).map((f) => f.dt)
  return {
    paint, dom, paintMax: max(paint), domMax: max(dom), paintStreak: streak(paint), domStreak: streak(dom),
    paintFrames: paint.filter((v) => v > 0).length, domFrames: dom.filter((v) => v > 0).length,
    missingMax: max(frames.map((f) => f.missing)), emptyMax: max(frames.map((f) => f.empty)), visibleMin: frames.reduce((m, f) => Math.min(m, f.visible), Infinity),
    jumpMax: max(jumps), dtMax: max(dts), dtMean: dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0,
    leftLagMax: max(frames.map((f) => (f.lst == null ? 0 : Math.abs(f.lst - f.st)))),
    commitsPerFrameMax: max(frames.map((f) => f.commits)), scrollsPerFrameMax: max(frames.map((f) => f.scrolls)),
  }
}
const pct = (v) => `${(v * 100).toFixed(0)}%`
const spark = (arr) => arr.map((v) => (v <= 0 ? '·' : String(Math.min(9, Math.ceil(v * 9))))).join('')

// ── profile 彙總(對照 scratchpad/prof/profile-scroll-story.mjs 的寫法)──
const summarizeProfile = (profile, staticDir) => {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id)
  const key = (id) => { const f = byId.get(id).callFrame; return `${f.functionName || '(anon)'}@${basename(f.url) || '-'}:${f.lineNumber + 1}:${f.columnNumber + 1}` }
  const self = new Map(), inc = new Map(); let total = 0
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i]; const dt = profile.timeDeltas[i] || 0; total += dt
    self.set(id, (self.get(id) || 0) + dt)
    const seenKeys = new Set(); let cur = id; const seen = new Set()
    while (cur != null && !seen.has(cur)) { seen.add(cur); const k = key(cur); if (!seenKeys.has(k)) { seenKeys.add(k); inc.set(k, (inc.get(k) || 0) + dt) } cur = parent.get(cur) }
  }
  const snippet = (url, line, col) => { try { const src = readFileSync(join(staticDir, new URL(url).pathname), 'utf8').split('\n')[line] || ''; return src.slice(Math.max(0, col - 70), col + 150).replace(/\s+/g, ' ') } catch { return '' } }
  const agg = new Map()
  for (const [id, dt] of self) { const f = byId.get(id).callFrame; const k = key(id); const e = agg.get(k) || { key: k, self: 0, url: f.url, line: f.lineNumber, col: f.columnNumber, fn: f.functionName }; e.self += dt; agg.set(k, e) }
  const cats = {}
  for (const e of agg.values()) { const n = ['(idle)', '(program)', '(garbage collector)', '(root)'].includes(e.fn) ? e.fn : 'script'; cats[n] = (cats[n] || 0) + e.self }
  const ms = (us) => +(us / 1000).toFixed(1)
  const top = [...agg.values()].filter((e) => !['(idle)', '(program)', '(garbage collector)', '(root)'].includes(e.fn)).sort((a, b) => b.self - a.self).slice(0, 15)
    .map((e) => ({ key: e.key, selfMs: ms(e.self), totalMs: ms(inc.get(e.key) || 0), snippet: e.url ? snippet(e.url, e.line, e.col) : '' }))
  return { sampledMs: ms(total), cats: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, ms(v)])), top, topInclusive: [...inc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ key: k, totalMs: ms(v) })) }
}

// ── 一次 run ──
const runOnce = async ({ build, mode, base, sabotage, profile }) => {
  const browser = await launchBrowser({ args: SMOOTH === 'off' ? ['--disable-smooth-scrolling'] : [] })
  try {
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR })
    const errors = []; page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(INIT)
    await page.goto(build.url ? `${base}${build.url}` : `${base}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitUntil: 'load' })
    if (CSS_INJECT) await page.addStyleTag({ content: CSS_INJECT })
    await page.waitForTimeout(1500)
    const cdp = await page.context().newCDPSession(page)
    if (CPU_THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
    await cdp.send('Performance.enable')
    if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }) }
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
    const setup = await page.evaluate(START_SAMPLER, { sabotage, startPx: START_PX })
    if (setup.crashed) return { crashed: true, errors }
    if (setup.noOverflow) return { noOverflow: true }
    await page.waitForTimeout(200) // 起點就位、第一批列掛好
    const m0 = await metrics()
    if (profile) await cdp.send('Profiler.start')
    const shots = []
    let ticks
    let gesture = null
    if (mode === 'gesture') {
      // 真實呈現幀:先開 screencast(合成器每送出一幀就給一張),再用合成手勢走原生輸入管線捲中央區;正對照 = 每個 scroll 事件忙等
      const cast = []
      cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => { cast.push({ data, ts: metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}) })
      // PNG 而不是 JPEG:白底要是純 255 才能把 DS 骨架色(`bg-muted` = 黑 6% 透明 ≈ 240)與分隔線(neutral-4)當墨跡,JPEG 的壓縮雜訊會把白弄髒
      await cdp.send('Page.startScreencast', { format: 'png', maxWidth: VW, maxHeight: VH, everyNthFrame: 1 })
      await page.waitForTimeout(200)
      // 正對照 = 「儀器在該紅的時候會紅」。原本只忙等主執行緒,前提是「主執行緒卡住 ⇒ 一定空白」。
      // 2026-09-12 起這個前提**不再成立**:未掛載區已經預先鋪了骨架底(`[data-row-shell-band]`),
      // 由合成器搬運,主執行緒卡死也照樣有東西可畫 —— CI 實測忙等 120ms 之後空白 0 幀,對照組因此失效。
      // (那不是偵測器壞了,正是這次修正要消滅的因果。)所以正對照要**連骨架底一起關掉**:
      // 沒有地板 + 主執行緒卡死 = 真的什麼都沒有,偵測器不紅就是偵測器壞了。
      if (sabotage) {
        await page.addStyleTag({ content: '[data-row-shell-band]{display:none !important}' })
        await page.evaluate((ms) => { document.querySelector('[data-datatable-hscroll]').addEventListener('scroll', () => { const b = performance.now(); while (performance.now() - b < ms) { /* busy */ } }, { passive: true }) }, SCROLL_BUSY_MS)
      }
      const t0 = Date.now()
      await cdp.send('Input.synthesizeScrollGesture', { x: setup.cx, y: setup.cy, yDistance: -GESTURE_PX, speed: GESTURE_SPEED, gestureSourceType: 'mouse', preventFling: true })
      const wallMs = Date.now() - t0
      const gestureEnd = await page.evaluate(() => performance.now())
      await page.waitForTimeout(SETTLE_EFFECTIVE)
      await cdp.send('Page.stopScreencast')
      const windowEndTs = Date.now() / 1000 // 與 screencast metadata.timestamp 同為 epoch 秒
      ticks = { applied: 1, wallMs }
      gesture = { cast, gestureEnd, windowEndTs }
    } else if (mode === 'mouse') {
      // 真輸入:CDP Input.dispatchMouseEvent mouseWheel(page.mouse.wheel 底層同一個呼叫),但**不等回應**——
      // 等回應會被主執行緒的忙碌拖成 60ms+ 一個事件(實測 63.7ms),OS 送滾輪事件不會等 render,所以照 16ms 節奏丟進輸入管線,最後再一起收。
      await page.mouse.move(setup.cx, setup.cy)
      const t0 = Date.now(); let applied = 0; const pending = []
      for (let i = 0; i < TICKS; i++) {
        // 對照組 (b):忙等要排成頁面自己的 task(setTimeout),直接在 Runtime.evaluate 裡忙等不會被 longtask 觀測器記到(2026-09-09 實測只記到 99ms)
        if (sabotage && i === BUSY_AT) await page.evaluate((ms) => { setTimeout(() => { const b = performance.now(); while (performance.now() - b < ms) { /* busy */ } }, 0) }, BUSY_MS)
        pending.push(cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: setup.cx, y: setup.cy, deltaX: 0, deltaY: DELTAS[i % DELTAS.length], modifiers: 0 })); applied++
        if (SHOTS && (i === 14 || i === 29)) pending.push(cdp.send('Page.captureScreenshot', { format: 'png' }).then(({ data }) => shots.push({ afterTick: i + 1, b64: data })))
        const wait = t0 + (i + 1) * TICK_MS - Date.now(); if (wait > 0) await sleep(wait)
      }
      await Promise.all(pending); shots.sort((a, b) => a.afterTick - b.afterTick)
      ticks = { applied, wallMs: Date.now() - t0 }
    } else {
      ticks = await page.evaluate(RUN_TICKS, { ticks: TICKS, tickMs: TICK_MS, deltas: DELTAS, target: mode, busyAt: sabotage ? BUSY_AT : null, busyMs: BUSY_MS })
      if (ticks.noTarget) return { noTarget: true }
    }
    if (mode !== 'gesture') await page.waitForTimeout(SETTLE_MS)
    if (SHOTS && mode === 'mouse') { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); shots.push({ afterTick: 0, b64: data }) } // 靜止基準:同一位置畫完後的近白比例
    let prof = null
    if (profile) { const { profile: p } = await cdp.send('Profiler.stop'); prof = p }
    const m1 = await metrics()
    const raw = await page.evaluate(STOP_SAMPLER)
    const shotStats = []
    for (const s of shots) shotStats.push({ afterTick: s.afterTick, ...(await page.evaluate(ANALYZE_SHOT, { b64: s.b64 })) })
    const a = analyze(raw.frames)
    let g = null
    if (gesture) { const shotsG = await page.evaluate(ANALYZE_FRAMES, { list: gesture.cast }); g = { ...analyzeGesture(shotsG, raw.frames, gesture.gestureEnd, gesture.windowEndTs), gestureWallMs: ticks.wallMs } }
    const tickTs = raw.wheelTs.map((w) => w.t); const gaps = tickTs.slice(1).map((t, i) => t - tickTs[i])
    // 這台機器畫一個視窗要多久 = 視窗列數 × 每列成本 + commit 固定成本(全部取自元件自己量的 `data-shell-state`)。
    // 「畫得動的機器不准出殼」那條斷言要先知道這個值才知道適不適用。
    //
    // **旗標只在量完之後才開(2026-09-11 踩過)**:`__DT_DEBUG_SHELL` 會讓元件每次 commit 都往捲動容器寫一個長字串屬性,
    // 而 `data-table.css` 有 `[data-datatable-hscroll]` 的屬性選擇器 —— 等於每次 commit 多一輪樣式重算。
    // 一開始我用 `addInitScript` 整跑開著,CI 的長工從 113/101/110ms 變成 105/663/359ms、script 874 → 1008-1235ms,
    // **儀器把被量的東西弄慢了**。現在改成:量完 → 開旗標 → 推一格捲動逼出一次 commit → 讀屬性。
    await page.evaluate(() => {
      window.__DT_DEBUG_SHELL = true
      const el = document.querySelector('[data-datatable-hscroll]')
      if (el) el.scrollTop += 1
    }).catch(() => {})
    await page.waitForTimeout(400)
    const shellCost = await page.evaluate(() => {
      const el = document.querySelector('[data-datatable-hscroll]')
      const st = el?.getAttribute('data-shell-state')
      if (!st) return null
      const num = (k) => { const m = st.match(new RegExp(k + '=([0-9.]+)')); return m ? Number(m[1]) : null }
      // **用峰值不用當下值**(2026-09-12):`costPerRow` 是平滑值,手勢結束後讀到的是最後那個微小 commit。
      // CI 上就因此發生過「守衛判定畫得動 → 套了不准出殼 → 但那一趟中途真的畫不動、出了 2 幀殼」。
      // `costPeak` 是元件在整段手勢記的高水位;舊 build 沒有這個欄位時退回 costPerRow(行為同以前)。
      const cpr = num('costPeak') ?? num('costPerRow'), fixed = num('fixed')
      const engageMs = num('engageMs')
      if (cpr == null || fixed == null) return null
      const rows = Math.max(1, Math.ceil(el.getBoundingClientRect().height / 40))
      return { cost: rows * cpr + fixed, engageMs }
    }).catch(() => null)
    return {
      build: build.label, mode, sabotage, setup, ticks, errors, shotStats, shellCost, ...a, g, frames: raw.frames,
      longs: raw.longs, longCount: raw.longs.length, longMax: raw.longs.reduce((m, l) => Math.max(m, l.dur), 0), longSum: raw.longs.reduce((s, l) => s + l.dur, 0),
      commits: raw.commits, scrollEvents: raw.scrollEvents, finalScroll: raw.finalScroll, scrolled: (raw.finalScroll ?? 0) - START_PX,
      wheelSeen: raw.wheelTs.length, wheelTrusted: raw.wheelTs.filter((w) => w.trusted).length, wheelGapMean: gaps.length ? gaps.reduce((x, y) => x + y, 0) / gaps.length : 0, wheelGapMax: gaps.reduce((m, g) => Math.max(m, g), 0),
      perf: Object.fromEntries(['ScriptDuration', 'LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'TaskDuration'].map((k) => [k, +((m1[k] ?? 0) - (m0[k] ?? 0)).toFixed(3)])),
      profile: prof,
    }
  } finally { await browser.close() }
}

const line = (r, i) => {
  const tag = `[${r.build}/${r.mode}${r.sabotage ? '/對照組' : ''} #${i}]`
  if (r.g) return `${tag} 呈現 ${r.g.presented} 幀(幀距 max ${r.g.presentedGapMax.toFixed(0)}ms 平均 ${r.g.presentedGapMean.toFixed(1)}ms);` +
    `中央空白:${r.g.blankFrames} 幀、最多 ${r.g.blankMaxBands}/${r.g.bandsPerFrame} 帶、最長連續 ${r.g.blankLongestMs.toFixed(0)}ms、面積×時間 ${r.g.blankAreaMs.toFixed(0)}ms;` +
    `列殼:${r.g.shellFrames} 幀(最多 ${r.g.shellMax} 列)、停捲後 ${Number.isFinite(r.g.fillMs) ? r.g.fillMs.toFixed(0) + 'ms 補齊' : '沒補完(窗尾仍有殼)'};手勢 ${r.g.gestureWallMs}ms 捲 ${r.scrolled}px;` +
    `long task ${r.longCount}(最長 ${r.longMax.toFixed(0)}ms 合計 ${r.longSum.toFixed(0)}ms);script ${(r.perf.ScriptDuration * 1000).toFixed(0)}ms layout ${(r.perf.LayoutDuration * 1000).toFixed(0)}ms(${r.perf.LayoutCount} 次);` +
    `靜止後 DOM 列缺 ${r.frames[r.frames.length - 1]?.missing ?? '-'} 格空 ${r.frames[r.frames.length - 1]?.empty ?? '-'}` +
    (r.errors.length ? `;pageerror ${r.errors.length}(${r.errors[0].slice(0, 80)})` : '')
  return `${tag} DOM空白 max ${pct(r.domMax)}(列缺 ${r.missingMax} / 格空 ${r.emptyMax},${r.domFrames} 幀,最長連續 ${r.domStreak.frames} 幀 ${r.domStreak.ms.toFixed(0)}ms);` +
    `預估paint空白 max ${pct(r.paintMax)}(${r.paintFrames} 幀,最長連續 ${r.paintStreak.frames} 幀 ${r.paintStreak.ms.toFixed(0)}ms);` +
    `主幀間隔 max ${r.dtMax.toFixed(0)}ms 平均 ${r.dtMean.toFixed(1)}ms;單幀最大位移 ${r.jumpMax}px;` +
    `long task ${r.longCount}(最長 ${r.longMax.toFixed(0)}ms 合計 ${r.longSum.toFixed(0)}ms);script ${(r.perf.ScriptDuration * 1000).toFixed(0)}ms layout ${r.perf.LayoutCount} style ${r.perf.RecalcStyleCount};` +
    `捲了 ${r.scrolled}px,wheel 事件 ${r.wheelSeen}(trusted ${r.wheelTrusted},平均間隔 ${r.wheelGapMean.toFixed(1)}ms max ${r.wheelGapMax.toFixed(0)}ms),commits ${r.commits},scroll 事件 ${r.scrollEvents},左右面板 scrollTop 落差 max ${r.leftLagMax}px` +
    (r.shotStats.length ? `;截圖近白 ${r.shotStats.map((s) => `${s.afterTick === 0 ? '靜止基準' : '第' + s.afterTick + '刻'} 中間 ${s.center == null ? '-' : pct(s.center)} / 左 ${s.left == null ? '-' : pct(s.left)}`).join(',')}` : '') +
    (r.errors.length ? `;pageerror ${r.errors.length}(${r.errors[0].slice(0, 80)})` : '')
}

// ── 主流程 ──
const results = []
let failed = 0
for (const build of BUILDS) {
  const { server, base } = await serve(build.dir)
  try {
    for (const mode of MODES) {
      const n = SELFTEST ? 1 : RUNS
      if (SELFTEST && mode === 'gesture') {
        // 負對照:500 列不虛擬化的靜態頁,同幾何、同手勢 —— 高速位移本身不能被量成空白
        const ctrlDir = mkdtempSync(join(tmpdir(), 'fs-control-'))
        const rowsHtml = Array.from({ length: 500 }, (_, i) => `<div data-row-index="${i}" role="row" style="position:absolute;top:${i * 40}px;left:0;right:0;height:40px;border-bottom:1px solid #d9dde3;display:flex;align-items:center;font:14px system-ui"><span role="cell" style="width:120px;padding-left:12px">#${1000 + i}</span><span role="cell" style="width:320px">第 ${i + 1} 列的內容文字</span><span role="cell" style="width:160px">2026-09-${(i % 28) + 1}</span></div>`).join('')
        writeFileSync(join(ctrlDir, 'control.html'), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><div style="height:93px"></div><div data-datatable-hscroll style="height:690px;overflow:auto;position:relative;width:1300px"><div style="height:20000px;position:relative">${rowsHtml}</div></div></body>`)
        const ctrl = await serve(ctrlDir)
        try {
          const rc = await runOnce({ build: { label: `${build.label}/負對照(靜態 500 列)`, dir: ctrlDir, url: '/control.html' }, mode, base: ctrl.base, sabotage: false, profile: false })
          if (rc.crashed || rc.noOverflow || !rc.g) { console.log(`✗ 負對照頁沒跑起來`); failed++ } else { console.log(`   ${line(rc, 'neg')}`); results.push({ ...rc, control: 'negative' }) }
        } finally { ctrl.server.close() }
      }
      for (let i = 1; i <= n; i++) {
        // 崩潰 / 沒溢出 = **儀器沒跑起來**(這次什麼都沒量到),不是量到壞結果 —— 重試一次再判失敗。
        // 2026-09-11 錨例:同一個 job 多 build 一份參考 storybook 之後 runner 更熱,branch 有一趟 story 沒渲染出來。
        let r = await runOnce({ build, mode, base, sabotage: SELFTEST, profile: false })
        if (r.crashed || r.noOverflow || r.noTarget) {
          console.log(`   ⟳ ${build.label}/${mode} #${i}:這一趟儀器沒跑起來(${r.crashed ? 'story 沒渲染' : r.noOverflow ? '沒有垂直溢出' : '找不到 dispatch 目標'}),重試一次`)
          r = await runOnce({ build, mode, base, sabotage: SELFTEST, profile: false })
        }
        if (r.crashed) { console.log(`✗ ${build.label}/${mode}:story 沒有渲染出捲動區(story 崩潰或 build 壞了)${r.errors?.length ? ':' + r.errors[0] : ''}`); failed++; continue }
        if (r.noOverflow) { console.log(`✗ ${build.label}/${mode}:沒有垂直溢出,不適用`); failed++; continue }
        if (r.noTarget) { console.log(`✗ ${build.label}/${mode}:找不到 dispatch 目標(pinned 模式需要左釘選面板)`); failed++; continue }
        if (i === 1 && mode === MODES[0]) console.log(`   ${build.label}:${build.dir}\n   story 起點:中間區掛 ${r.setup.rows} 列、視窗高 ${r.setup.H}px、可捲 ${r.setup.scrollHeight}px、左釘選面板 ${r.setup.hasLeft ? '有' : '無(改用中間區自己的列當視窗內集合,列缺恆 0)'}、React hook ${r.setup.hookOk ? '接上' : '沒接上(commits 無效)'}${r.setup.longtaskErr ? '、longtask 觀測失敗 ' + r.setup.longtaskErr : ''}`)
        if (r.scrolled <= 0) { console.log(`✗ ${line(r, i)}\n   → scrollTop 沒動,這個模式的事件沒有造成捲動(儀器對照失敗)`); failed++; continue }
        console.log(`   ${line(r, i)}`)
        results.push(r)
      }
      if (PROFILE_DIR && !SELFTEST) {
        mkdirSync(PROFILE_DIR, { recursive: true })
        const r = await runOnce({ build, mode, base, sabotage: false, profile: true })
        if (r.profile) {
          const sum = summarizeProfile(r.profile, build.dir)
          writeFileSync(join(PROFILE_DIR, `${build.label}-${mode}.cpuprofile`), JSON.stringify(r.profile))
          writeFileSync(join(PROFILE_DIR, `${build.label}-${mode}.json`), JSON.stringify({ ...sum, run: { ...r, profile: undefined, frames: undefined } }, null, 1))
          console.log(`   [${build.label}/${mode} profile] 取樣 ${sum.sampledMs}ms:${JSON.stringify(sum.cats)};本 run ${line(r, 'p')}`)
          console.log(`   self time 前 15 名(${build.label}/${mode}):`)
          for (const t of sum.top) console.log(`     ${String(t.selfMs).padStart(6)}ms self / ${String(t.totalMs).padStart(6)}ms total  ${t.key}\n           ${t.snippet}`)
        }
      }
    }
  } finally { server.close() }
}

// ── 時間序列摘要:每個 build×mode 取 paint 空白最嚴重的 run 印一條(0–9 = 空白率九分位,· = 0)──
if (!SELFTEST) {
  console.log('\n每幀空白率時間序列(最嚴重的 run;每字一幀:· = 0,1–8 = 空白帶比例分箱(1 ≤ 11%…8 ≤ 89%),9 = 89% 以上;是比例不是帶數)')
  for (const build of BUILDS) for (const mode of MODES) {
    const rs = results.filter((r) => r.build === build.label && r.mode === mode); if (!rs.length) continue
    if (rs[0].g) { const w = rs.reduce((m, r) => (r.g.blankLongestMs > m.g.blankLongestMs ? r : m), rs[0]); console.log(`   ${build.label}/${mode} 呈現幀空白帶 ${spark(w.g.blankSeries)}\n   ${build.label}/${mode} 列殼/幀   ${w.frames.map((f) => (f.shells ? String(Math.min(9, f.shells)) : '·')).join('')}`); continue }
    const w = rs.reduce((m, r) => (r.paintMax > m.paintMax ? r : m), rs[0])
    console.log(`   ${build.label}/${mode} 預估paint ${spark(w.paint)}\n   ${build.label}/${mode} DOM     ${spark(w.dom)}\n   ${build.label}/${mode} 幀間隔ms ${w.frames.slice(1).map((f) => Math.round(f.dt)).join(' ')}`)
  }
  console.log('\n對照表(每格 = 中位數 / 最大值,跨 runs)')
  const gcols = [['空白幀', (r) => r.g?.blankFrames ?? 0, String], ['最長連續空白ms', (r) => r.g?.blankLongestMs ?? 0, (v) => v.toFixed(0)], ['空白面積×ms', (r) => r.g?.blankAreaMs ?? 0, (v) => v.toFixed(0)], ['殼幀', (r) => r.g?.shellFrames ?? 0, String], ['停捲後補齊ms', (r) => r.g?.fillMs ?? 0, (v) => (Number.isFinite(v) ? v.toFixed(0) : '沒補完')], ['呈現幀距max', (r) => r.g?.presentedGapMax ?? NaN, (v) => v.toFixed(0)], ['long task max', (r) => r.longMax, (v) => v.toFixed(0)], ['script ms', (r) => r.perf.ScriptDuration * 1000, (v) => v.toFixed(0)]]
  const cols = [['預估paint空白 max', (r) => r.paintMax, pct], ['paint 連續幀', (r) => r.paintStreak.frames, String], ['paint 連續 ms', (r) => r.paintStreak.ms, (v) => v.toFixed(0)], ['DOM空白 max', (r) => r.domMax, pct], ['主幀間隔 max ms', (r) => r.dtMax, (v) => v.toFixed(0)], ['long task 數', (r) => r.longCount, String], ['long task 最長 ms', (r) => r.longMax, (v) => v.toFixed(0)], ['long task 合計 ms', (r) => r.longSum, (v) => v.toFixed(0)], ['script ms', (r) => r.perf.ScriptDuration * 1000, (v) => v.toFixed(0)], ['commits', (r) => r.commits, String]]
  for (const build of BUILDS) for (const mode of MODES) {
    const rs = results.filter((r) => r.build === build.label && r.mode === mode); if (!rs.length) continue
    const cc = rs[0].g ? gcols : cols
    if ((build === BUILDS[0] && mode === MODES[0]) || rs[0].g !== results[0].g) console.log('   ' + ['build/mode', ...cc.map((c) => c[0])].join(' | '))
    console.log('   ' + [`${build.label}/${mode}(n=${rs.length})`, ...cc.map(([, get, fmt]) => `${fmt(median(rs.map(get)))} / ${fmt(Math.max(...rs.map(get)))}`)].join(' | '))
  }
}
if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(results.map((r) => ({ ...r, profile: undefined })), null, 1)); console.log(`   原始資料 → ${JSON_OUT}`) }

if (SELFTEST) {
  // 對照組判定:三個偵測器都必須紅
  let ok = results.length > 0 && failed === 0
  if (MODES.includes('gesture') && !analyzeGestureSelfCheck()) ok = false
  for (const r of results) {
    if (r.g) {
      if (r.control === 'negative') { const pass = r.g.blankFrames === 0 && r.g.presented >= 10; console.log(`${pass ? '✓' : '✗'} selftest 負對照 ${r.build}:呈現 ${r.g.presented} 幀、空白 ${r.g.blankFrames} 幀(需 0 且幀數 ≥ 10)`); if (!pass) ok = false; continue }
      const pass = r.g.blankFrames >= 3 && r.g.presented >= 10
      console.log(`${pass ? '✓' : '✗'} selftest 正對照 ${r.build}/${r.mode}:關掉骨架底 + 每個 scroll 事件忙等 ${SCROLL_BUSY_MS}ms → 空白 ${r.g.blankFrames} 幀、最長 ${r.g.blankLongestMs.toFixed(0)}ms(需 ≥ 3 幀)`)
      if (!pass) ok = false
      continue
    }
    const domHit = r.missingMax >= 5 && r.emptyMax >= 1
    const longHit = r.longMax >= 100
    const idx = r.frames.findIndex((f) => f.dt >= BUSY_MS * 0.8)
    const paintAfterBusy = idx > 0 ? Math.max(...r.paint.slice(idx, idx + 3)) : 0
    const paintHit = paintAfterBusy > 0
    console.log(`${domHit && longHit && paintHit ? '✓' : '✗'} selftest ${r.build}/${r.mode}:DOM 偵測器 ${domHit ? '量到' : '沒量到'}(列缺 ${r.missingMax} 需 ≥5、格空 ${r.emptyMax} 需 ≥1);long task ${longHit ? '量到' : '沒量到'}(最長 ${r.longMax.toFixed(0)}ms 需 ≥100);忙等後預估 paint 空白 ${pct(paintAfterBusy)} ${paintHit ? '> 0' : '沒紅'}`)
    if (!(domHit && longHit && paintHit)) ok = false
  }
  console.log(ok ? '✓ selftest:三個偵測器在該紅的時候都會紅' : '✗ selftest:儀器有偵測器沒反應')
  process.exit(ok ? 0 : 1)
}
if (ASSERT_BLANK_FRAMES !== '' || ASSERT_BLANK_MS !== '' || ASSERT_FILL_MS !== '' || ASSERT_LONG_TASK_MS !== '' || ASSERT_FRAME_GAP_MS !== '' || ASSERT_SHELL_FRAMES !== '') {
  // 「證據有效」逐趟判(儀器沒在工作就不能當證據);「效能門檻」判同一 build 的**中位數**,不判單趟最大值。
  // 為什麼(2026-09-11,c34e035c 實測):共享 2 vCPU runner 上同一份 build 的最長連續空白跑間差很大 ——
  // eb5b42fc 兩趟 276 / 282ms 全綠,同樣的 data-table.tsx 加了 Tag/PeoplePicker 量測快取之後兩趟是 153 / 415ms。
  // 中位數 284 跟 276 幾乎一樣、其餘七欄也都一樣,只有那一趟 415 讓 max 判定翻紅 = 雜訊,不是回歸。
  // 中位數仍抓得到真回歸:同一支閘在 119e279f 是 438 / 476ms(中位 438)照樣紅。
  // 另留一道「單趟天花板 = 門檻 × 2」擋住單趟災難級停頓(119e279f 的 476 在天花板內,靠中位數擋;
  // 真正一趟就爆掉的回歸由天花板擋),兩道合起來才不會為了穩定性放掉偵測力。
  const groups = new Map()
  // 收**所有模式**,不只 gesture。wheel 沒有截圖幾何(`r.g`,只有 gesture 走 screencast,見 mode === 'gesture' 分支),
  // 但它有 long task 指標 —— 而 wheel 正是 user 真實的捲動路徑(滾輪),不該因為少了截圖就整個不判。
  // 取不到值的指標由下方 gate / relGate 各自跳過並說明,不會靜默當成通過。
  for (const r of results) { const k = `${r.build}/${r.mode}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r) }
  for (const r of results) {
    if (!r.g) continue
    if (r.g.presented < 10) { console.log(`✗ ${r.build}/${r.mode}:只收到 ${r.g.presented} 張呈現幀,screencast 沒在工作,不能當證據`); failed++ }
    if (!r.g.bandsPerFrame || !r.frames.length) { console.log(`✗ ${r.build}/${r.mode}:缺資料(每幀帶數 ${r.g.bandsPerFrame}、DOM 取樣 ${r.frames.length}),不能當證據`); failed++ }
    if (r.scrolled < GESTURE_PX * 0.8) { console.log(`✗ ${r.build}/${r.mode}:只捲了 ${r.scrolled}px(手勢 ${GESTURE_PX}px),覆蓋不足不能當證據`); failed++ }
    if (r.errors.length) { console.log(`✗ ${r.build}/${r.mode}:pageerror ${r.errors.length}(${r.errors[0].slice(0, 100)})`); failed++ }
    const last = r.frames[r.frames.length - 1]
    if (last && (last.missing > 0 || last.empty > 0)) { console.log(`✗ ${r.build}/${r.mode}:靜止後 DOM 仍缺列 ${last.missing} / 格空 ${last.empty}`); failed++ }
  }
  const gate = (limitRaw, name, CEILING, pick, extra = () => '') => {
    if (limitRaw === '') return
    const limit = Number(limitRaw)
    for (const [k, rs] of groups) {
      // 參考建置(`--ref`)是**基準**不是受測對象:它自己慢不該把閘弄紅(CI 實測 main 長工中位 372ms)。
      // 它唯一的用途是當比值的分母。
      if (REF_LABEL && k.split('/')[0] === REF_LABEL) continue
      const vals = rs.map(pick)
      // 該模式沒有這個指標(例:wheel 沒有截圖幾何 → 空白/補齊類指標)→ 明說跳過,不靜默當通過
      if (!vals.length || !vals.every((v) => Number.isFinite(v))) { console.log(`↷ ${k}:${name}——這個模式沒有這項量測,不適用`); continue }
      const mid = median(vals)
      const worst = Math.max(...vals)
      const all = vals.map((v) => v.toFixed(0)).join(' / ')
      const verdict = gateVerdict(vals, limit, CEILING)
      if (verdict === 'median') { console.log(`✗ ${k}:${name}中位數 ${mid.toFixed(0)}ms > ${limit.toFixed(0)}ms(${rs.length} 趟 ${all})${extra(rs[vals.indexOf(worst)])}`); failed++ }
      else if (verdict === 'ceiling') { console.log(`✗ ${k}:${name}單趟 ${worst.toFixed(0)}ms > 天花板 ${(limit * CEILING).toFixed(0)}ms(${rs.length} 趟 ${all};中位數 ${mid.toFixed(0)}ms 在門檻內,但這趟已是災難級)`); failed++ }
      else console.log(`✓ ${k}:${name}中位數 ${mid.toFixed(0)}ms ≤ ${limit.toFixed(0)}ms(${rs.length} 趟 ${all})`)
    }
  }
  // 有參考建置(`--ref`)時,**會被機器速度影響的三個指標**都改判「本 build ÷ 參考 ≤ 比值上限」——
  // 那是唯一不受 runner 漂移影響的形式。沒有參考(或參考那項是 0)就退回絕對門檻,並**印出來說明**(不可靜默降級)。
  // 為什麼長工與幀距也要:同一輪 CI 上 main 自己就量到長工 698ms、幀距 845ms,絕對門檻在那台機器上量的是機器不是程式碼。
  // **分母要取「同一個模式」的參考值**(2026-09-12 修)。原本寫死 `${REF_LABEL}/gesture`,
  // 於是 `--mode=wheel --ref=main` 找不到分母 → 整項退回絕對門檻。
  // 後果實例:CI 的 wheel 長工用絕對 300ms 判定,三趟 315 / 88 / 449(雜訊極大)而紅 ——
  // 那正是本檔開頭反覆說的「絕對門檻只是在量那台機器」。
  const refFor = (pick, mode) => {
    const rs = groups.get(`${REF_LABEL}/${mode}`)
    if (!rs?.length) return NaN
    // pick 可能取不到(例:wheel 沒有截圖幾何 `r.g`),取值本身也可能丟例外 —— 一律當「沒有分母」
    const vals = []
    for (const r of rs) { try { const v = pick(r); if (Number.isFinite(v)) vals.push(v) } catch { /* 這項該模式沒有 */ } }
    return vals.length ? median(vals) : NaN
  }
  const relGate = (rawLimit, name, ceiling, pick, extra = () => '') => {
    if (rawLimit === '' && !REF_LABEL) return
    // 每個受測 group 各自跟「同模式的參考」比
    for (const [k, rs] of groups) {
      const [label, mode] = k.split('/')
      if (label === REF_LABEL) continue
      const refMs = REF_LABEL ? refFor(pick, mode) : NaN
      if (!Number.isFinite(refMs) || refMs <= 0) {
        if (REF_LABEL) console.log(`   (參考「${REF_LABEL}/${mode}」的${name}是 ${Number.isFinite(refMs) ? refMs.toFixed(0) : '無資料'},無法當分母 → 這項退回絕對門檻 ${rawLimit || '(未設)'}ms)`)
        continue
      }
      let vals
      try { vals = rs.map(pick) } catch { vals = [] }
      if (!vals.length || !vals.every((v) => Number.isFinite(v))) { console.log(`↷ ${k}:${name}——這個模式沒有這項量測,不適用`); continue }
      const mine = median(vals)
      const verdict = refRatioVerdict(mine, refMs)
      const cap = (refMs * BLANK_RATIO_LIMIT).toFixed(0)
      if (verdict === 'fail') { console.log(`✗ ${k}:${name}中位數 ${mine.toFixed(0)}ms > 參考「${REF_LABEL}/${mode}」的 ${refMs.toFixed(0)}ms × ${BLANK_RATIO_LIMIT}(= ${cap}ms)`); failed++ }
      else console.log(`✓ ${k}:${name}中位數 ${mine.toFixed(0)}ms ≤ 參考「${REF_LABEL}/${mode}」的 ${refMs.toFixed(0)}ms × ${BLANK_RATIO_LIMIT}(= ${cap}ms)`)
    }
    return
  }
  // 目的地閘:絕對、判**每一趟的最大值**不判中位數 —— 空白幀不是雜訊是缺陷,
  // 「三趟裡有一趟 27 幀全白」用中位數會被蓋掉。與 `--ref` 無關:參考建置自己爛不構成放行理由。
  if (ASSERT_BLANK_FRAMES !== '') {
    const limit = Number(ASSERT_BLANK_FRAMES)
    for (const [k, rs] of groups) {
      if (REF_LABEL && k.split('/')[0] === REF_LABEL) continue
      const vals = rs.map((r) => r.g?.blankFrames).filter((v) => Number.isFinite(v))
      if (!vals.length) { console.log(`↷ ${k}:空白幀數——這個模式沒有截圖幾何,不適用`); continue }
      const worst = Math.max(...vals)
      const all = vals.join(' / ')
      if (worst > limit) {
        const bad = rs.find((r) => r.g?.blankFrames === worst)
        console.log(`✗ ${k}:**目的地**呈現幀不得有空白,實測最差一趟 ${worst} 幀是空的(${rs.length} 趟 ${all};該趟最嚴重 ${bad.g.blankMaxBands}/${bad.g.bandsPerFrame} 帶、最長連續 ${bad.g.blankLongestMs.toFixed(0)}ms)`)
        failed++
      } else console.log(`✓ ${k}:**目的地**呈現幀零空白(${rs.length} 趟 ${all},上限 ${limit})`)
    }
  }
  relGate(ASSERT_BLANK_MS, '中央區最長連續空白', CEILING_FACTOR.blank, (r) => r.g.blankLongestMs, (r) => `(${r.g.blankFrames} 幀,最多 ${r.g.blankMaxBands} 帶)`)
  gate(ASSERT_FILL_MS, '停捲後列殼補齊', CEILING_FACTOR.fill, (r) => r.g.fillMs)
  if (REF_LABEL) {
    relGate(ASSERT_LONG_TASK_MS, '主執行緒單一任務最長', CEILING_FACTOR.longTask, (r) => r.longMax, (r) => `(${r.longCount} 個長工、合計 ${r.longSum.toFixed(0)}ms)`)
    relGate(ASSERT_FRAME_GAP_MS, '合成器送出的幀距最大', CEILING_FACTOR.frameGap, (r) => r.g?.presentedGapMax ?? NaN)
  } else if (ASSERT_LONG_TASK_MS !== '') {
    // 沒有參考建置時的後備:門檻相對於這台機器自己的能力(理由見 lib 的 longTaskLimit)
    const costs = results.map((r) => r.shellCost?.cost).filter((v) => Number.isFinite(v))
    const worstCost = costs.length ? Math.max(...costs) : null
    const limit = longTaskLimit(Number(ASSERT_LONG_TASK_MS), worstCost)
    if (limit !== Number(ASSERT_LONG_TASK_MS)) console.log(`   (這台機器畫一個視窗要 ${worstCost.toFixed(0)}ms → 長工門檻由 ${ASSERT_LONG_TASK_MS}ms 放大為 ${limit.toFixed(0)}ms)`)
    gate(String(limit), '主執行緒單一任務最長', CEILING_FACTOR.longTask, (r) => r.longMax, (r) => `(${r.longCount} 個長工、合計 ${r.longSum.toFixed(0)}ms;這段期間所有 hover / 點擊都會被卡住)`)
    gate(ASSERT_FRAME_GAP_MS, '合成器送出的幀距最大', CEILING_FACTOR.frameGap, (r) => r.g?.presentedGapMax ?? NaN)
  } else {
    gate(ASSERT_FRAME_GAP_MS, '合成器送出的幀距最大', CEILING_FACTOR.frameGap, (r) => r.g?.presentedGapMax ?? NaN)
  }
  if (ASSERT_SHELL_FRAMES !== '') {
    // 元件自己量出來的能力值(`data-shell-state`,需 window.__DT_DEBUG_SHELL);讀不到就保守跳過並說明
    const costs = results.map((r) => r.shellCost?.cost).filter((v) => Number.isFinite(v))
    const engage = results.map((r) => r.shellCost?.engageMs).find((v) => Number.isFinite(v)) ?? SHELL_ENGAGE_FALLBACK_MS
    const worst = costs.length ? Math.max(...costs) : null
    if (worst == null) console.log(`⚠️  出現列殼的幀數:讀不到 data-shell-state(需 window.__DT_DEBUG_SHELL),這條斷言跳過`)
    else if (worst > engage) console.log(`↷ 出現列殼的幀數:這台機器畫不動(一個視窗要 ${worst.toFixed(0)}ms > 元件門檻 ${engage}ms),出殼是正確行為,這條斷言不適用(白區與補齊由另外兩條管)`)
    else gate(ASSERT_SHELL_FRAMES, '出現列殼的幀數', 2, (r) => r.g?.shellFrames ?? 0)
  }
}
if (ASSERT_PAINT !== '' || ASSERT_DOM !== '') {
  for (const r of results) {
    if (ASSERT_PAINT !== '' && r.paintMax > Number(ASSERT_PAINT)) { console.log(`✗ ${r.build}/${r.mode}:預估 paint 空白 ${pct(r.paintMax)} > ${pct(Number(ASSERT_PAINT))}`); failed++ }
    if (ASSERT_DOM !== '' && r.domMax > Number(ASSERT_DOM)) { console.log(`✗ ${r.build}/${r.mode}:DOM 空白 ${pct(r.domMax)} > ${pct(Number(ASSERT_DOM))}`); failed++ }
  }
}
console.log(failed ? `✗ ${failed} 項失敗` : (ASSERT_BLANK_MS !== '' || ASSERT_FILL_MS !== '' || ASSERT_PAINT !== '' || ASSERT_DOM !== '') ? '✓ 快速捲動閘全過' : '✓ 快速捲動儀器跑完(未給 --assert-* 時只報數字)')
process.exit(failed ? 1 : 0)

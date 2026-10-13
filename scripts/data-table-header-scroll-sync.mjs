#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 捲軸不佔 / 佔版面兩種幾何下,指標停在表頭上把有欄寬調整的表捲到最右端,之後每一個畫出來的影格表頭與表身的 scrollLeft 相等、每欄左緣差 ≤ 0.5px;祖先有 transform: scale() 時操作欄寬、填滿高度、多區列高與不縮放時相等
 *   紅: 拿掉表頭內層的 overflow-x: clip、或表頭偏 3px、或在縮放下注入錯的面板寬 / 上限 / 列高(--selftest);7777b61c 的建置跑必須紅 31 項(overlay 1005 / 1002、137 / 134)
 *   綠: 修好的建置兩個 lane 全綠;rAF 逐格與 screencast 逐格兩種量法同時為 0 才綠,沒有水平溢出 / lane 幾何不對 / screencast 任一階段收不到幀時以儀器失效紅而不是綠
 * ─────
 * DataTable 表頭 / 表身水平捲動同步 + 版面量測不受 transform 影響(2026-10-13,待辦總帳 Q2a / Q2c)。
 *
 * Q2a(user 2026-10-13:「在其他機器上，當table出現水平卷軸的時候,往後方捲動之後，欄位的header跟body也會發生沒有對齊起來的情況…
 *   root cause到底是什麼？」)。根因:最後一欄的欄寬把手刻意往外凸 3px(`patterns/resize-handle/resize-handle.tsx` HIT_OUTSET),
 *   讓表頭比表身多能捲 3px;同步只在表身發捲動事件時校正,表身被夾住不發事件 → 停在差 3px。捲軸佔位置的機器上,
 *   表頭尾端讓給垂直捲軸的 15–17px 剛好吞掉這 3px,所以只有捲軸不佔位置的機器(觸控板 Mac、Win11 / Linux 的 Firefox、平板)會中。
 *   修法:表頭內層在捲動容器邊界裁掉(`resize-handle.spec.md`「面板 / 捲動容器的邊界把它裁掉是預期例外」)→ 兩邊可捲範圍相等
 *   (`data-table.spec.md` 六之二);再加保險「表身被夾住時當場把表頭拉回」(`onSecondaryScroll` → `writeScroll`)。
 *
 *   兩個 lane:
 *     overlay = Playwright 預設啟動(帶 `--hide-scrollbars`,捲軸不佔版面,= 觸控板 Mac 的幾何);
 *     classic = 拿掉 `--hide-scrollbars`(Linux headless 畫 15px classic 捲軸,= CI 其餘 DataTable 閘的幾何)。
 *   每個 lane 先證明自己的幾何(overlay 量到垂直捲軸寬 0、classic > 0),否則 INSTRUMENT-FAIL。
 *   兩則有欄寬調整的 story(roadmap-all-in-one、column-resize 兩張表),視窗 900 寬(兩者都真的有水平溢出;沒有 = INSTRUMENT-FAIL):
 *     H1 兩邊最大可捲量相等(根因那一層:多出來的 3px 不見了)
 *     H2 指標在表身上把表身捲到底,再把指標移到表頭上往右推 6 下:**之後每一個畫出來的影格**
 *        —— (a) 頁內 rAF 逐影格讀 scrollLeft 與每欄左緣;(b) CDP screencast 逐影格量表頭紅條 / 表身藍條的位移 ——
 *        表頭 scrollLeft = 表身 scrollLeft、每欄左緣 |Δ| ≤ 0.5px;停手後再量一次
 *        screencast 只在畫面有變動時才送幀:修好的建置推表頭時表頭表身都已在最右、畫面一個像素都不變 → Linux runner
 *        整段只送 1 格(2026-10-13 CI 六格全 INSTRUMENT-FAIL);本機 mac 有 18 格是 mac 的彈性回彈(rubber-band)動畫
 *        剛好在畫,不是儀器設計(M37:「本機有幀」被當成「儀器會送幀」)。所以在畫面角落掛一個每個 rAF 換色的心跳方塊
 *        (不碰兩條掃描列,碰到 = INSTRUMENT-FAIL):每一格都有變動 → 合成器每一格都畫、screencast 才真的是逐格證人;
 *        並以**收到的幀數**當條件等(推前 / 每一下之後 / 停手後各 ≥ 3 格,上限 5 秒,不足 = INSTRUMENT-FAIL),
 *        不用固定時間猜機器多快(M32 第四題)。
 *     H3 從最左邊開始,指標一直停在表頭上一路捲到底(refute 第 3 條:觸控板在表頭列上滑到底就中),同樣逐影格
 *   對照組:`--build=<7777b61c 的建置>` overlay lane 的 H1 / H2 / H3 必紅(實測 625 / 622,12 欄全差 3px)。
 *
 * Q2c:版面量測一律用不受 transform 影響的值。`getBoundingClientRect` 量的是**畫面上**的大小 —— 祖先有 `transform: scale()`
 *   (Dialog / Popover 的 `zoom-in-95` 進場動畫、Storybook 工具列縮放)時量到的是縮放後的值,拿去寫成 CSS 寬高就錯
 *   (操作欄表頭 48 / 表身 38、列高、填滿高度)。在 `#storybook-root` 掛 `transform: scale(S)`(S = 0.8 與 1.25,
 *   **元件掛載前就掛上** —— 量測發生在縮放中)後:
 *     T1 右側操作欄:表頭面板與表身面板的版面寬相等,且等於不縮放時的值
 *     T2 填滿高度:表身上限(CSS px)等於不縮放時的值
 *     T3 自動行高的多區表:每一列在三區的版面高相等,且等於不縮放時的值
 *   對照組:同上 `--build=` 指向 7777b61c,T1 / T2 / T3 必紅。
 *
 * `--selftest`:不改產品,在頁面注入兩種破法,各自必須讓對應斷言變紅(儀器先證明它會紅,M32):
 *   (1) 把表頭內層的裁切拿掉(`overflow-x: visible`)→ overlay lane 的 H1 必紅;
 *   (2) 表頭內層 `translateX(3px)` → H2 / H3 的「每欄左緣」與 screencast 位移必紅(只在 overlay lane 跑:classic lane 的尾端讓位帶本來就吞得掉這 3px);
 *   (3) T1 / T2 / T3 各注入一個錯值(右側表身面板寬、表身上限、左區第 0 列 min-height)→ 必紅。
 * 開 story 一律經 lib/launch-browser.mjs 的 openStory(開不起來 = 儀器失效,exit 2,`--selftest` 下也不算如預期紅)。
 *   node scripts/data-table-header-scroll-sync.mjs [--build=<storybook 建置目錄>] [--selftest]
 */
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowserOrSkip, openStory, StoryRenderInstrumentError, requireStorybookBuild, requireFreshStorybookBuild, settleAfterInteraction, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const { PNG } = createRequire(join(REPO, 'package.json'))('pngjs')
const SELFTEST = process.argv.includes('--selftest')
const buildArg = process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length)
const STATIC = buildArg ? (isAbsolute(buildArg) ? buildArg : join(process.cwd(), buildArg)) : join(REPO, 'storybook-static')
requireStorybookBuild(join(STATIC, 'index.json'))
// 指定 --build 的(對照組 / 並行工作者)自己負責建置身分;預設目錄必須比 DataTable 原始碼新
if (!buildArg) requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/DataTable', 'packages/design-system/src/patterns/resize-handle'])

const STORY = (id) => `iframe.html?id=${encodeURIComponent(`design-system-components-datatable-展示--${id}`)}&viewMode=story`
const SYNC_STORIES = ['roadmap-all-in-one', 'column-resize']
const VIEWPORT = { width: 900, height: 800 }
const SCALES = [0.8, 1.25]
const EDGE_TOL = 0.5

let failCount = 0
let instrumentFail = false
const lines = []
const check = (name, pass, detail = '') => {
  // --selftest:被注入破法的斷言必須紅(pass === false 才是「如預期」)
  const ok = SELFTEST ? !pass : pass
  lines.push(`${ok ? '✓' : '✗'} ${SELFTEST ? '[對照組應紅] ' : ''}${name}${detail ? ` | ${detail}` : ''}`)
  console.log(lines[lines.length - 1])
  if (!ok) failCount++
}
const instrument = (name, detail) => {
  instrumentFail = true
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${name} | ${detail}`)
}

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html', snapshot: true })
const open = async (page, id, waitFor = '[data-datatable-hscroll] [role="row"]') => {
  try {
    await openStory(page, `${server.origin}/${STORY(id)}`, { waitFor, settleFrames: 10, notFound: server.notFound })
    return true
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    instrument(`開 story ${id}`, error.message)
    return false
  }
}
const settle = async (page) => (await settleAfterInteraction(page, { frames: 8, capMs: 6000 })).ok

// ── 頁面端:每一張「表頭中央區 + 表身中央區」的幾何 ───────────────────────────────────────────
function tablesGeometry() {
  return [...document.querySelectorAll('[data-datatable-hscroll]')].map((body, index) => {
    const table = body.closest('[role="table"], [role="grid"]')
    const header = table?.querySelector('[data-datatable-header-panel="center"]')
    if (!header) return { index, header: false }
    const b = body.getBoundingClientRect(), h = header.getBoundingClientRect()
    return {
      index, header: true,
      bodyMax: body.scrollWidth - body.clientWidth,
      headerMax: header.scrollWidth - header.clientWidth,
      // 水平捲軸厚度(這張表一定有水平溢出,否則下面判 INSTRUMENT-FAIL):overlay 幾何 = 0、classic = 15
      hGutter: body.offsetHeight - body.clientHeight - (parseFloat(getComputedStyle(body).borderTopWidth) || 0) - (parseFloat(getComputedStyle(body).borderBottomWidth) || 0),
      body: { x: b.x, y: b.y, w: b.width, h: b.height },
      head: { x: h.x, y: h.y, w: h.width, h: h.height },
    }
  })
}

/** 頁面端:對第 index 張表啟動逐影格取樣(rAF —— 這一格畫出來之前,scroll 事件與同步都已跑完)。 */
function startSampler(index) {
  const body = document.querySelectorAll('[data-datatable-hscroll]')[index]
  const header = body.closest('[role="table"], [role="grid"]').querySelector('[data-datatable-header-panel="center"]')
  const samples = []
  let stop = false
  const tick = () => {
    if (stop) return
    const heads = [...header.querySelectorAll('[role="columnheader"]')]
    const row = [...body.querySelectorAll('[role="row"]')].find((r) => r.querySelector(':is([role="cell"], [role="gridcell"])'))
    const cells = row ? [...row.querySelectorAll(':scope > :is([role="cell"], [role="gridcell"])')] : []
    const n = Math.min(heads.length, cells.length)
    let worst = 0
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(heads[i].getBoundingClientRect().left - cells[i].getBoundingClientRect().left))
    samples.push({ h: header.scrollLeft, b: body.scrollLeft, edge: +worst.toFixed(2), n })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__dtSync = { samples, stop: () => { stop = true; return samples } }
}

/** 頁面端:停手後的最終狀態(每欄左緣 + 兩邊 scrollLeft) */
function finalState(index) {
  const body = document.querySelectorAll('[data-datatable-hscroll]')[index]
  const header = body.closest('[role="table"], [role="grid"]').querySelector('[data-datatable-header-panel="center"]')
  const heads = [...header.querySelectorAll('[role="columnheader"]')]
  const row = [...body.querySelectorAll('[role="row"]')].find((r) => r.querySelector(':is([role="cell"], [role="gridcell"])'))
  const cells = row ? [...row.querySelectorAll(':scope > :is([role="cell"], [role="gridcell"])')] : []
  const n = Math.min(heads.length, cells.length)
  const deltas = []
  for (let i = 0; i < n; i++) deltas.push(+(heads[i].getBoundingClientRect().left - cells[i].getBoundingClientRect().left).toFixed(2))
  return { h: header.scrollLeft, b: body.scrollLeft, bodyMax: body.scrollWidth - body.clientWidth, deltas, n }
}

// ── screencast:逐影格量表頭紅條與表身藍條的相對位移 ─────────────────────────────────────────
const MARKER_CSS = `[data-datatable-header-panel="center"] [role="columnheader"]{box-shadow: inset 2px 0 0 rgb(255,0,0) !important}
[data-datatable-hscroll] [role="row"] > :is([role="cell"],[role="gridcell"]){box-shadow: inset 2px 0 0 rgb(0,0,255) !important}`
// 心跳方塊:每個 rAF 換一次色,保證每一格都有畫面變動 → screencast 每一格都會送(而不是只在產品剛好有動的時候)。
// 兩個顏色都不會被下面的紅條 / 藍條判準認成標記條(r、b 都 ≤ 128)。
const HEARTBEAT_COLORS = [[64, 64, 128], [96, 64, 128]]
const HEARTBEAT_SIZE = 8
/** screencast 每個階段(推前 / 每一下之後 / 停手後)至少要收到的幀數:回 ack 之前最多只有一格在路上,收到 ≥ 3 格 = 至少 2 格是這個階段開始之後才畫的 */
const FRAMES_PER_PHASE = 3
const PHASE_FRAME_DEADLINE_MS = 5000
function startHeartbeat({ size, colors }) {
  const el = document.createElement('div')
  el.setAttribute('data-screencast-heartbeat', '')
  el.style.cssText = `position:fixed;left:0;bottom:0;width:${size}px;height:${size}px;z-index:2147483647;pointer-events:none;background:rgb(${colors[0].join(',')})`
  document.body.appendChild(el)
  let tick = 0
  let stop = false
  const beat = () => {
    if (stop) return
    tick += 1
    el.style.background = `rgb(${colors[tick % 2].join(',')})`
    requestAnimationFrame(beat)
  }
  requestAnimationFrame(beat)
  window.__dtHeartbeat = { stop: () => { stop = true; el.remove(); return tick } }
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}
function heartbeatVisible(png, scale, hb) {
  const x = Math.floor((hb.x + hb.w / 2) * scale), y = Math.floor((hb.y + hb.h / 2) * scale)
  const i = (png.width * y + x) * 4
  return HEARTBEAT_COLORS.some(([r, g, b]) => Math.abs(png.data[i] - r) <= 2 && Math.abs(png.data[i + 1] - g) <= 2 && Math.abs(png.data[i + 2] - b) <= 2)
}

/** [0,0,-3,-3,-3] → '0×2 -3×3'(心跳下一段有數十格,逐格列印讀不出重點) */
const runLengths = (values) => {
  const out = []
  for (const v of values) {
    if (out.length && out[out.length - 1][0] === v) out[out.length - 1][1] += 1
    else out.push([v, 1])
  }
  return out.map(([v, n]) => `${v}×${n}`).join(' ')
}
function frameShift(png, scale, geo) {
  const scan = (yCss, pred) => {
    const y = Math.round(yCss * scale)
    const xs = []
    let prev = false
    for (let x = Math.ceil(geo.x0 * scale); x < Math.floor(geo.x1 * scale); x++) {
      const i = (png.width * y + x) * 4
      const on = pred(png.data[i], png.data[i + 1], png.data[i + 2])
      if (on && !prev) xs.push(x / scale)
      prev = on
    }
    return xs
  }
  const red = (r, g, b) => r > 190 && g < 90 && b < 90
  const blue = (r, g, b) => b > 190 && r < 90 && g < 90
  const hx = scan(geo.hy, red), bx = scan(geo.by, blue)
  let best = null, bestN = -1
  for (let k = -20; k <= 20; k++) {
    const n = hx.filter((x) => bx.some((v) => Math.abs(v - (x + k)) <= 0.5)).length
    if (n > bestN || (n === bestN && Math.abs(k) < Math.abs(best))) { bestN = n; best = k }
  }
  return { shift: bestN >= 3 ? best : null, matched: bestN, red: hx.length, blue: bx.length }
}

async function runSyncLane(context, page, lane) {
  await page.setViewportSize(VIEWPORT)
  for (const story of SYNC_STORIES) {
    if (!(await open(page, story))) continue
    await page.addStyleTag({ content: MARKER_CSS })
    if (SELFTEST) {
      await page.addStyleTag({ content: '[data-datatable-header-panel="center"] > div{overflow-x:visible!important;transform:translateX(3px)}' })
    }
    await settle(page)
    const tables = (await page.evaluate(tablesGeometry)).filter((t) => t.header)
    if (tables.length === 0) { instrument(`${lane.name} ${story}`, '找不到表頭中央區 + 表身中央區'); continue }
    for (const t of tables) {
      const tag = `${lane.name} ${story} 表 ${t.index + 1}`
      if (!(t.bodyMax > 0)) { instrument(tag, `表身沒有水平溢出(可捲 ${t.bodyMax})—— 這張表量不到「捲到最右」`); continue }
      if (lane.name === 'overlay' && t.hGutter !== 0) { instrument(tag, `overlay lane 量到水平捲軸厚 ${t.hGutter}px(應 0:捲軸不佔版面)`); continue }
      if (lane.name === 'classic' && !(t.hGutter > 0)) { instrument(tag, `classic lane 量到水平捲軸厚 ${t.hGutter}px(應 > 0:捲軸佔版面)`); continue }

      check(`H1 ${tag}:表頭與表身最大可捲量相等`, Math.abs(t.headerMax - t.bodyMax) <= EDGE_TOL, `表頭 ${t.headerMax} / 表身 ${t.bodyMax}`)

      // H2:指標在表身上捲到底,再移到表頭上往右推
      const bodyPt = { x: t.body.x + t.body.w / 2, y: t.body.y + Math.min(60, t.body.h / 2) }
      const headPt = { x: t.head.x + t.head.w / 2, y: t.head.y + t.head.h / 2 }
      await page.evaluate((i) => { document.querySelectorAll('[data-datatable-hscroll]')[i].scrollLeft = 0 }, t.index)
      await settle(page)
      await page.mouse.move(bodyPt.x, bodyPt.y)
      for (let k = 0; k < 40; k++) {
        const at = await page.evaluate((i) => { const b = document.querySelectorAll('[data-datatable-hscroll]')[i]; return b.scrollLeft >= b.scrollWidth - b.clientWidth - 0.5 }, t.index)
        if (at) break
        await page.mouse.wheel(200, 0)
        await page.waitForTimeout(16)
      }
      await settle(page)
      const atEnd = await page.evaluate(finalState, t.index)
      if (Math.abs(atEnd.b - atEnd.bodyMax) > 0.5) { instrument(`H2 ${tag}`, `在表身上捲不到最右(${atEnd.b} / ${atEnd.bodyMax})`); continue }
      await page.mouse.move(headPt.x, headPt.y)
      await settle(page)
      const cdp = await context.newCDPSession(page)
      const frames = []
      cdp.on('Page.screencastFrame', async (f) => {
        frames.push(f.data)
        try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }) } catch { /* 停止後的最後一格 */ }
      })
      const geo = { x0: Math.max(t.head.x, t.body.x) + 2, x1: Math.min(t.head.x + t.head.w, t.body.x + t.body.w) - 6, hy: Math.round(t.head.y + t.head.h / 2), by: Math.round(t.body.y + Math.min(20, t.body.h / 4)) }
      const hb = await page.evaluate(startHeartbeat, { size: HEARTBEAT_SIZE, colors: HEARTBEAT_COLORS })
      // 心跳方塊要先真的畫進一格,screencast 開始時送的第一格(合成器手上最近的一格)才會帶著它
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
      const hbOnScanRow = [geo.hy, geo.by].some((y) => y >= hb.y - 1 && y <= hb.y + hb.h + 1) && hb.x <= geo.x1 && hb.x + hb.w >= geo.x0
      // 以「收到的幀數」當條件等,不用固定時間猜機器多快;固定的 150 / 90 / 500ms 仍保留為最短間隔(滾輪節奏不變)
      const phases = []
      const waitFrames = async (phase, since, minimumMs) => {
        const started = Date.now()
        await page.waitForTimeout(minimumMs)
        while (frames.length - since < FRAMES_PER_PHASE && Date.now() - started < PHASE_FRAME_DEADLINE_MS) await page.waitForTimeout(10)
        phases.push({ phase, frames: frames.length - since })
      }
      await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
      await page.evaluate(startSampler, t.index)
      await waitFrames('推前', 0, 150)
      for (let k = 0; k < 6; k++) {
        const since = frames.length
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: headPt.x, y: headPt.y, deltaX: 40, deltaY: 0 })
        await waitFrames(`推第 ${k + 1} 下後`, since, 90)
      }
      await waitFrames('停手後', frames.length, 500)
      const samples = await page.evaluate(() => window.__dtSync.stop())
      await cdp.send('Page.stopScreencast')
      await cdp.detach().catch(() => {})
      await page.evaluate(() => window.__dtHeartbeat.stop())
      const after = await page.evaluate(finalState, t.index)
      const badFrames = samples.filter((s) => Math.abs(s.h - s.b) > EDGE_TOL || s.edge > EDGE_TOL)
      if (samples.length < 10 || samples.some((s) => s.n < 2)) instrument(`H2 ${tag} rAF`, `取樣 ${samples.length} 格 / 欄數 ${Math.min(...samples.map((s) => s.n))}`)
      else check(`H2a ${tag}:推表頭之後每一個影格(rAF ${samples.length} 格)表頭 = 表身、每欄左緣 |Δ| ≤ ${EDGE_TOL}`, badFrames.length === 0, badFrames.length ? `${badFrames.length} 格錯開,例 ${JSON.stringify(badFrames.slice(0, 3))}` : '')
      // 逐格解碼、量完就丟(每格 900×800×4 ≈ 2.9MB,心跳下一段約數十格,不一次全留著)
      const shifts = frames.map((d) => {
        const png = PNG.sync.read(Buffer.from(d, 'base64'))
        const scale = png.width / VIEWPORT.width
        return { ...frameShift(png, scale, geo), heartbeat: heartbeatVisible(png, scale, hb) }
      })
      const unreadable = shifts.filter((s) => s.shift === null)
      const starved = phases.filter((p) => p.frames < FRAMES_PER_PHASE)
      const noHeartbeat = shifts.filter((s) => !s.heartbeat).length
      const coverage = phases.map((p) => `${p.phase} ${p.frames}`).join(' / ')
      if (hbOnScanRow) instrument(`H2 ${tag} screencast`, `心跳方塊 ${JSON.stringify(hb)} 壓到掃描列(表頭 y=${geo.hy} / 表身 y=${geo.by})`)
      else if (starved.length) instrument(`H2 ${tag} screencast`, `心跳每一格都在變,${PHASE_FRAME_DEADLINE_MS}ms 內仍收不到 ${FRAMES_PER_PHASE} 格:${starved.map((p) => `${p.phase} ${p.frames} 格`).join('、')}(各階段 ${coverage})`)
      else if (noHeartbeat) instrument(`H2 ${tag} screencast`, `${noHeartbeat} / ${frames.length} 格看不到心跳方塊 —— 送來的幀不是這一頁畫出來的`)
      else if (unreadable.length) instrument(`H2 ${tag} screencast`, `${frames.length} 格,${unreadable.length} 格讀不到標記條(例 ${JSON.stringify(unreadable.slice(0, 2))})`)
      else check(`H2b ${tag}:推表頭之後每一個畫出來的影格(screencast ${frames.length} 格;各階段 ${coverage})紅條與藍條位移 0`, shifts.every((s) => s.shift === 0), `位移序列(值×連續格數)${runLengths(shifts.map((s) => s.shift))}`)
      check(`H2c ${tag}:停手後 表頭 scrollLeft = 表身 scrollLeft、每欄左緣 |Δ| ≤ ${EDGE_TOL}`, Math.abs(after.h - after.b) <= EDGE_TOL && after.deltas.every((d) => Math.abs(d) <= EDGE_TOL), `表頭 ${after.h} / 表身 ${after.b};左緣差 ${JSON.stringify(after.deltas)}`)

      // H3:從最左邊開始,指標一直停在表頭上一路捲到底
      await page.evaluate((i) => { document.querySelectorAll('[data-datatable-hscroll]')[i].scrollLeft = 0 }, t.index)
      await settle(page)
      await page.mouse.move(headPt.x, headPt.y)
      await page.evaluate(startSampler, t.index)
      for (let k = 0; k < 80; k++) {
        await page.mouse.wheel(25, 0)
        await page.waitForTimeout(12)
        if (k % 10 === 9) {
          const done = await page.evaluate((i) => { const b = document.querySelectorAll('[data-datatable-hscroll]')[i]; return b.scrollLeft >= b.scrollWidth - b.clientWidth - 0.5 }, t.index)
          if (done) { for (let j = 0; j < 4; j++) { await page.mouse.wheel(25, 0); await page.waitForTimeout(12) } break }
        }
      }
      await page.waitForTimeout(400)
      const samples3 = await page.evaluate(() => window.__dtSync.stop())
      const after3 = await page.evaluate(finalState, t.index)
      if (Math.abs(after3.b - after3.bodyMax) > 0.5) { instrument(`H3 ${tag}`, `指標在表頭上捲不到最右(${after3.b} / ${after3.bodyMax})`); continue }
      const bad3 = samples3.filter((s) => Math.abs(s.h - s.b) > EDGE_TOL || s.edge > EDGE_TOL)
      check(`H3 ${tag}:指標停在表頭上從最左捲到底,每一個影格(rAF ${samples3.length} 格)與停手後表頭 = 表身、每欄左緣對齊`,
        bad3.length === 0 && Math.abs(after3.h - after3.b) <= EDGE_TOL && after3.deltas.every((d) => Math.abs(d) <= EDGE_TOL),
        `${bad3.length} 格錯開${bad3.length ? `,例 ${JSON.stringify(bad3.slice(0, 3))}` : ''};停手後 表頭 ${after3.h} / 表身 ${after3.b}`)
    }
  }
}

// ── Q2c:transform 祖先下的版面量測 ───────────────────────────────────────────────────────────
function layoutReport() {
  const out = { actions: null, fill: null, rows: [] }
  const rh = document.querySelector('[data-datatable-header-panel="right"]')
  const rb = document.querySelector('[data-datatable-panel="right"]')
  if (rh && rb) out.actions = { headW: rh.offsetWidth, bodyW: rb.offsetWidth, headVis: +rh.getBoundingClientRect().width.toFixed(2), bodyVis: +rb.getBoundingClientRect().width.toFixed(2) }
  const center = document.querySelector('[data-datatable-panel="center"]')
  if (center) out.fill = parseFloat(center.style.maxHeight) || null
  for (const w of [...document.querySelectorAll('[data-datatable-panel="center"]')].map((c) => c.parentElement)) {
    const byIndex = new Map()
    for (const side of ['left', 'center', 'right']) {
      const p = w.querySelector(`:scope > [data-datatable-panel="${side}"]`)
      if (!p) continue
      for (const row of p.querySelectorAll('[data-row-auto][data-row-index]')) {
        const i = row.getAttribute('data-row-index')
        if (!byIndex.has(i)) byIndex.set(i, {})
        byIndex.get(i)[side] = row.offsetHeight
      }
    }
    out.rows.push(Object.fromEntries(byIndex))
  }
  return out
}
// 縮放由網址參數 `dtscale=` 帶(Storybook 不認的參數會被忽略):同一個 page 只掛一次 init script,
// 不為每個縮放開新的 context —— `--single-process` 的 Chromium 反覆開關 context 會整個掛掉(2026-10-13 本機實測 SIGTRAP)。
function scaleInit() {
  const m = /[?&]dtscale=([0-9.]+)/.exec(location.search)
  if (!m) return
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style')
    st.textContent = `#storybook-root{transform:scale(${m[1]});transform-origin:0 0}`
    document.head.appendChild(st)
  })
}

async function runTransformLane(page) {
  const reference = {}
  await page.setViewportSize({ width: 1400, height: 800 })
  const measure = async (scale, story, waitFor) => {
    let opened = false
    try {
      await openStory(page, `${server.origin}/${STORY(story)}&dtscale=${scale}`, { waitFor: waitFor ?? '[data-datatable-hscroll] [role="row"]', settleFrames: 10, notFound: server.notFound })
      opened = true
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      instrument(`開 story ${story} scale(${scale})`, error.message)
    }
    if (opened && scale !== 1) {
      const applied = await page.evaluate(() => getComputedStyle(document.getElementById('storybook-root')).transform)
      if (!applied || applied === 'none') { instrument(`scale(${scale})`, '#storybook-root 沒有掛上 transform(儀器沒造出縮放)'); return null }
    }
    if (opened && SELFTEST && scale !== 1) {
      await page.addStyleTag({ content: '[data-datatable-panel="right"]{width:30px!important}[data-datatable-panel="left"] [data-row-index="0"]{min-height:200px!important}' })
      await page.evaluate(() => { const c = document.querySelector('[data-datatable-panel="center"]'); if (c) c.style.maxHeight = `${(parseFloat(c.style.maxHeight) || 100) + 37}px` })
      await settle(page)
    }
    return opened ? page.evaluate(layoutReport) : null
  }
  reference.roadmap = await measure(1, 'roadmap-all-in-one')
  reference.auto = await measure(1, 'row-auto-height', '[data-datatable-panel="left"] [data-row-auto]')
  if (!reference.roadmap?.actions || reference.roadmap.fill == null) { instrument('T 對照基準', `roadmap 量不到操作欄或填滿高度:${JSON.stringify(reference.roadmap)}`); return }
  if (!reference.auto?.rows?.some((t) => Object.keys(t).length > 0)) { instrument('T 對照基準', 'row-auto-height 量不到多區自動行高的列'); return }
  for (const s of SCALES) {
    const r = await measure(s, 'roadmap-all-in-one')
    if (!r?.actions || r.fill == null) { instrument(`T scale(${s})`, `量不到:${JSON.stringify(r)}`); continue }
    check(`T1 scale(${s}):右側操作欄 表頭 / 表身面板版面寬相等,且 = 不縮放時(${reference.roadmap.actions.headW})`,
      r.actions.headW === r.actions.bodyW && r.actions.headW === reference.roadmap.actions.headW && Math.abs(r.actions.headVis - r.actions.bodyVis) <= 0.5,
      JSON.stringify(r.actions))
    check(`T2 scale(${s}):填滿高度的表身上限 = 不縮放時(${reference.roadmap.fill}px)`, Math.abs(r.fill - reference.roadmap.fill) <= 1, `${r.fill}px`)
    const a = await measure(s, 'row-auto-height', '[data-datatable-panel="left"] [data-row-auto]')
    if (!a) continue
    const problems = []
    a.rows.forEach((table, ti) => {
      for (const [i, m] of Object.entries(table)) {
        const ref = reference.auto.rows[ti]?.[i]
        const hs = Object.values(m)
        if (Math.max(...hs) - Math.min(...hs) > 1) problems.push(`表${ti + 1} 列${i} 三區不等高 ${JSON.stringify(m)}`)
        else if (ref && Math.abs(Math.max(...hs) - Math.max(...Object.values(ref))) > 1) problems.push(`表${ti + 1} 列${i} ${Math.max(...hs)} ≠ 不縮放時 ${Math.max(...Object.values(ref))}`)
      }
    })
    check(`T3 scale(${s}):自動行高的多區表,每列三區等高且 = 不縮放時`, problems.length === 0, problems.slice(0, 4).join(';'))
  }
}

// 每個 lane 只開**一個** context + page(縮放用網址參數切換):`--single-process` 的 Chromium 關掉一個 context 再開新的,
// 下一個 newPage 會讓整個瀏覽器 SIGTRAP(2026-10-13 本機兩次實測)。
const lanePage = async (browser) => {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.addInitScript(scaleInit)
  return { context, page }
}
let overlay, classic
try {
  overlay = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  const o = await lanePage(overlay)
  await runSyncLane(o.context, o.page, { name: 'overlay' })
  await overlay.close()
  classic = await launchBrowserOrSkip({ ignoreDefaultArgs: ['--hide-scrollbars'] }, { cleanup: () => server.stop() })
  const c = await lanePage(classic)
  // 對照組的表頭破法只注入 overlay lane(證明儀器會紅一次就夠;classic lane 的對照由 7777b61c 建置實測:column-resize 也紅)
  if (!SELFTEST) await runSyncLane(c.context, c.page, { name: 'classic' })
  await runTransformLane(c.page)
} finally {
  await overlay?.close().catch(() => {})
  await classic?.close().catch(() => {})
  if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', '))
  await server.stop()
}

if (instrumentFail) {
  console.error(`\n✗ data-table-header-scroll-sync:${INSTRUMENT_FAIL_MARKER} —— 有量測沒有真的量到${SELFTEST ? '(對照組沒有真的跑,不得讀成「如預期紅」)' : ''}`)
  process.exit(2)
}
console.log(failCount
  ? `\n✗ ${failCount} 項未通過`
  : `\n✓ ${SELFTEST ? '對照組:拿掉裁切 / 表頭偏 3px / 注入錯值時 H1–H3、T1–T3 如預期變紅(儀器有效)' : '表頭 / 表身兩種捲軸幾何下逐影格對齊;transform 祖先下版面量測不變,全通過'}`)
process.exit(failCount ? 1 : 0)

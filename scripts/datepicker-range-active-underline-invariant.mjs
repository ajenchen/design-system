#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: `DatePicker.Range` 起訖兩顆按鈕「現在在選哪一端」那條線(RANGE-FOCUS-BAR(定)2026-11-26;date-picker.spec.md「Active-end 機制」視覺指示)
 *        **畫出來**是:(1) 壓在欄位框的下邊上 —— 線的下緣 = 框外緣、粗 2px(框那 1px 被蓋住,與框線合成一條,不是框線上方再一條);
 *        (2) 線長 = 該端文字寬(長日期被截斷時 = 看得到的那一段),不是按鈕寬;(3) 線色 = 這圈框當下的顏色(一般主色、欄位錯誤時紅)。
 *        一般 / 大密度 × sm / md / lg × 帶 / 不帶時間、錯誤態(兩種密度)、長日期,起訖兩端 × 兩種出現方式(面板關著用鍵盤 Tab 到那一顆 = focus-visible;
 *        點開面板 = `data-active-end`),外加 Calendar 詳情時間欄(進編輯後點開起訖兩端);裝置像素比 1 與 2 都量。
 *        高對比模式(`page.emulateMedia({ forcedColors: 'active' })`,md 密度 md 尺寸那一欄):背景色在該模式被強制換成底色、只有系統色不換
 *        (W3C css-color-adjust-1),所以線色 = 系統色 `Highlight`(線下緣 = 框外緣、線長 = 文字寬照舊量;列名 F-…)。
 *        系統色可能半透明(macOS Chromium 的 Highlight = rgba(5,0,73,0.8)):比對的線色 = 它疊在底色上 / 疊在框線上**合成出來**的兩個顏色(見 composite),
 *        不透明時兩個都 = 讀到的顏色本身;任一個與底下那一層分不出來 = 儀器失效。
 *        長日期另驗截斷:span 的 scrollWidth > clientWidth、`text-overflow: ellipsis`、水平有裁切,按鈕右緣到下一個元素之間那條縫**零墨點**。
 *        量的是像素:每列截欄位框(上框線之下 → 外緣下 4px;上框線不截,否則聚焦時那一列也是框色)的圖,(a)在文字寬的範圍裡逐列數「框色像素佔一半以上」的列 = 必須剛好是框外緣往上 2px 那幾列;
 *        (b)在框外緣往上 1.5px 那一列(只有線、沒有框線)找框色像素的左右端 = 文字左右緣(±1px)。
 *   紅: 任一列不符 → 逐列點名(案例 / 端點 / 出現方式 / 像素比,量到的列與左右端)exit 1。`--selftest` 在 DS 原始碼上造七個單一根因突變(MUTANTS),
 *        每個突變必須**剛好**紅它負責的那幾列,契約列每一條都要被某個突變弄紅過:線放回文字底線 / 線坐在框線上方(少加框寬)/ 文字段雙軸裁切
 *        → 全部線列紅;線長改成按鈕寬 → 文字比按鈕窄 2px 以上的線列紅(由基準那一趟實量的 slack 推,不寫死);錯誤時線仍主色 → 錯誤態的線列紅;
 *        高對比模式不換系統色 → F- 列紅;文字段水平不裁 → 截斷列紅。`--root=<修改前的整棵原始碼>` = 天然對照組(1e468c7d 的文字底線版:全部線列紅)。
 *   綠: 現行原始碼每列都量到且符合;對照列在現行原始碼與每個突變上都綠:還沒聚焦、面板沒開時「只有線」那一列框色像素 = 0(數到的是線、
 *        不是框線);聚焦 / 開著時,中間箭頭底下那一段數到的框色列 = 剛好框寬那一列(顏色辨認是活的,而且線沒有伸到箭頭底下);
 *        高對比模式下箭頭底下 Highlight 列 = 0(該模式框色由瀏覽器換掉,只驗線沒伸過去),且 Highlight 與 Canvas 必須分得出來(否則儀器失效)。
 *        harness 載不起來 / 焦點沒落到該落的那一顆 / 面板沒開 / 等不到靜止 / 外框不在整數像素上 = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過(M37)。
 *   註: 2026-11-17 新增(A50,當時量的是文字底線畫出幾 px);2026-11-26 依 RANGE-FOCUS-BAR(定)改寫成量「線壓在框下邊、線長 = 文字寬、線色 = 框色」。
 *        user 原話(決策卡留言,逐字):「應該是甲，但是你的圖片的底線長度應該要等同於上方的時間吧？」;對話內確認「可以,照甲做」。
 *        舊版刻意不量框那一列、拿框那一列當對照組;新規則的線就畫在框那一列上,所以改成「箭頭底下的框列」當對照組。
 *        A50 的教訓(雙軸裁切把線裁掉)保留成突變 span-clips-both-axes:線從文字盒往下伸到框邊,雙軸裁切會把它整條裁掉。
 *        CI:`.github/workflows/ci.yml`「DatePicker range active-end underline (browser)」那一步跑 `npm run test:datepicker-range-active-underline`
 *        (= `--selftest`:基準那一趟必須全綠,紅就印判定紅那一行;再跑全部突變)。
 *
 * 用法:
 *   node scripts/datepicker-range-active-underline-invariant.mjs                判定(現行原始碼)
 *   node scripts/datepicker-range-active-underline-invariant.mjs --selftest     對照組(全部單一根因突變)
 *   node scripts/datepicker-range-active-underline-invariant.mjs --root=<dir>   改量另一棵原始碼(例:修改前的基準樹)
 *   node scripts/datepicker-range-active-underline-invariant.mjs --shot=<dir>   另存幾張欄位畫面(像素比 2,淺色;前後圖用;不影響判定)
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, parkPointer } from './lib/launch-browser.mjs'
import {
  InstrumentError,
  REPO_ROOT,
  WAIT_CAP_MS,
  bundleDsHarness,
  compileDsCss,
  dsSourceDir,
  makeDriver,
  mountHarness,
  mutantFor,
  replaceOnce,
  resolveSourceRoot,
} from './lib/ds-source-harness.mjs'

const SELFTEST = process.argv.includes('--selftest')
const SHOT_DIR = process.argv.find((a) => a.startsWith('--shot='))?.slice('--shot='.length)
const SOURCE_ROOT = resolveSourceRoot()

/** 規格值:date-picker.spec.md「Active-end 機制」視覺指示「2px、壓在欄位框的下邊上」 */
const SPEC_THICKNESS_PX = 2
const DPRS = [1, 2]
/** 框色像素:與外框當下的 computed border-bottom-color 每個色版差 ≤ 此值 */
const COLOR_TOLERANCE = 40
/** 一列算「框色列」:框色像素 ≥ 文字寬的這個比例 */
const ROW_COVERAGE = 0.5
/** 線長容差(CSS px):文字左右緣是小數,線的兩端對齊到像素 */
const LENGTH_TOLERANCE_PX = 1
/** 截圖往框外緣下多截幾 px:線若畫過頭(超出框外緣)也數得到 */
const BELOW_PX = 4
/** 「墨點」:亮度低於此值(白底上的字) */
const INK_LUMA = 200
/** 線長改成按鈕寬的突變「該紅」:文字比按鈕窄超過這麼多(CSS px)的列 —— 由基準那一趟實量推 */
const SLACK_RED_PX = 2

const VALUE_DATE = ['2026-04-15', '2026-04-20']
const VALUE_TIME = ['2026-04-15T14:30', '2026-04-20T09:05']
const CASES = []
for (const density of ['md', 'lg']) {
  for (const size of ['sm', 'md', 'lg']) {
    for (const time of [false, true]) {
      CASES.push({ id: `${density}-${size}${time ? '-time' : ''}`, density, size, time, width: time ? 440 : 360, value: time ? VALUE_TIME : VALUE_DATE })
    }
  }
  // 錯誤態:線色要跟紅框同色
  CASES.push({ id: `${density}-md-error`, density, size: 'md', error: true, width: 360, value: VALUE_DATE })
}
// 長日期:showTime + 秒,欄位故意窄 —— 兩端都必須截斷,線長 = 看得到的那一段
CASES.push({ id: 'md-md-long', density: 'md', size: 'md', time: true, long: true, width: 260, value: ['2026-04-15T14:30:59', '2026-04-20T09:05:00'] })
const ENDS = ['start', 'end']
const PLACEHOLDER = ['入住日期', '退房日期']
const CAL_EVENT = 'rf1'
const CAL_SCOPE = '[data-calendar-event-detail] [data-calendar-detail-field="time"]'
const caseScope = (id) => `[data-case="${id}"]`

/** 同一字串在起訖兩顆各出現一次:兩處一起換(錨點必須剛好兩處,否則儀器失效) */
const replaceAll = (src, pattern, replacement, want) => {
  const hits = src.match(pattern)?.length ?? 0
  if (hits !== want) throw new InstrumentError(`突變錨點命中 ${hits} 次(應為 ${want} 次):${pattern} —— 原始碼改了,selftest 的突變要跟著改`)
  return src.replace(pattern, replacement)
}
const STATE_ANCHOR = /'data-\[active-end=true\]:\[--range-end-bar:var\(--range-end-bar-color\)\] focus-visible:\[--range-end-bar:var\(--range-end-bar-color\)\]'/g
const TEXT_CLASS_ANCHOR = /const RANGE_END_TEXT_CLASS = 'relative min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap'/
const ERROR_COLOR_ANCHOR = /error \? '\[--range-end-bar-color:var\(--color-error\)\]' : /
const BOTTOM_ANCHOR = /\(var\(--field-control-py-(sm|md|lg)\)_\+_var\(--field-border-width\)\)/g
const FORCED_ANCHOR = /'forced-colors:\[--range-end-bar-color:Highlight\]',/
/** 高對比模式量哪一欄、線用哪個系統色 */
const FORCED_CASE = 'md-md'
const FORCED_LINE = 'Highlight'

const isBar = (row) => row.kind === 'bar'
const MUTANTS = [
  {
    id: 'bar-as-text-underline',
    what: '線放回文字底線(2026-11-26 前的做法:`underline decoration-primary underline-offset-4 decoration-2`)',
    redWhen: isBar,
    apply: (src) => replaceAll(src, STATE_ANCHOR, "'data-[active-end=true]:underline focus-visible:underline decoration-primary underline-offset-4 decoration-2'", 2),
  },
  {
    id: 'bar-above-border',
    what: '線坐在框線上方(位置少加一條框寬:下緣 = 框內緣)',
    redWhen: isBar,
    apply: (src) => replaceAll(src, BOTTOM_ANCHOR, '(var(--field-control-py-$1))', 3),
  },
  {
    id: 'bar-button-width',
    what: '線長改成按鈕寬(文字段 flex-1 撐滿按鈕)',
    redWhen: (row) => isBar(row) && row.slack > SLACK_RED_PX,
    apply: (src) => replaceOnce(src, TEXT_CLASS_ANCHOR, "const RANGE_END_TEXT_CLASS = 'relative flex-1 min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap'"),
  },
  {
    id: 'bar-error-stays-primary',
    what: '欄位錯誤時線仍是主色(沒跟紅框同色)',
    redWhen: (row) => isBar(row) && row.error,
    apply: (src) => replaceOnce(src, ERROR_COLOR_ANCHOR, "error ? '[--range-end-bar-color:var(--color-primary)]' : "),
  },
  {
    id: 'bar-forced-colors-vanishes',
    what: '高對比模式不換系統色(拿掉 forced-colors 那條)—— 背景色被強制換成底色,線整條消失',
    redWhen: (row) => isBar(row) && row.forced,
    apply: (src) => replaceOnce(src, FORCED_ANCHOR, ''),
  },
  {
    id: 'span-clips-both-axes',
    what: '文字段改回 `truncate`(雙軸 overflow:hidden,A50 修前)—— 往下伸到框邊的線被裁掉',
    redWhen: isBar,
    apply: (src) => replaceOnce(src, TEXT_CLASS_ANCHOR, "const RANGE_END_TEXT_CLASS = 'relative min-w-0 truncate'"),
  },
  {
    id: 'span-no-horizontal-clip',
    what: '文字段水平也不裁(只剩 nowrap)—— 長日期溢出按鈕',
    redWhen: (row) => row.kind === 'truncate',
    apply: (src) => replaceOnce(src, TEXT_CLASS_ANCHOR, "const RANGE_END_TEXT_CLASS = 'relative min-w-0 whitespace-nowrap'"),
  },
]
const MUTANT_FILE = 'components/DatePicker/date-picker.tsx'

const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { CalendarDemo } from '@/design-system/components/Calendar/_calendar-demo'

const CASES = ${JSON.stringify(CASES)}
const DAY = new Date(2026, 6, 15)
function Case({ c }) {
  const [range, setRange] = React.useState(c.value)
  return (
    <div data-case={c.id} data-density={c.density} style={{ display: 'flex', flexDirection: 'column', gap: 8, width: c.width }}>
      <button type="button" data-before={c.id} style={{ alignSelf: 'flex-start', fontSize: 12, height: 24 }}>上一欄</button>
      <DatePicker.Range size={c.size} value={range} onChange={setRange} placeholder={${JSON.stringify(PLACEHOLDER)}} showTime={!!c.time} showSeconds={!!c.long} error={!!c.error} />
    </div>
  )
}
function App() {
  return (
    <TooltipProvider>
      <main data-scene style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 48, background: 'var(--canvas)', minHeight: '100vh' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '480px 480px', columnGap: 48, rowGap: 64, alignItems: 'start' }}>
          {CASES.map((c) => <Case key={c.id} c={c} />)}
        </div>
        <div data-calendar-scene style={{ height: 620, width: 820 }}>
          <CalendarDemo defaultReferenceDate={DAY} today={DAY} events={[{ id: '${CAL_EVENT}', title: '設計審查', start: '2026-07-06T10:00', end: '2026-07-06T11:00', color: 'blue' }]} />
        </div>
      </main>
    </TooltipProvider>
  )
}
createRoot(document.getElementById('root')).render(<App />)
`

/** 頁面端:某一端按鈕的幾何、文字寬、外框、箭頭與顏色(computed 顏色可能是 oklch() / color() —— 交給 canvas 換成 sRGB 的 0–255,截圖量的就是 sRGB) */
const GEOMETRY = ({ scope, end, probe }) => {
  const root = document.querySelector(scope)
  const btns = root ? [...root.querySelectorAll('button[aria-haspopup="dialog"]')] : []
  if (btns.length !== 2) return { missing: `${scope} 裡起訖按鈕 ${btns.length} 顆(應 2)` }
  const btn = btns[end === 'start' ? 0 : 1]
  const wrap = btn.closest('[data-field-mode]')
  const span = btn.querySelector(':scope > span')
  const arrow = btns[0].nextElementSibling
  if (!wrap || !span || !arrow) return { missing: '找不到外框 / 文字段 / 中間箭頭' }
  const r = (el) => { const x = el.getBoundingClientRect(); return { left: x.left, top: x.top, right: x.right, bottom: x.bottom } }
  const range = document.createRange(); range.selectNodeContents(span)
  const text = range.getBoundingClientRect()
  const toRgba = (css) => {
    const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1
    const cx = cv.getContext('2d'); cx.fillStyle = css; cx.fillRect(0, 0, 1, 1)
    return [...cx.getImageData(0, 0, 1, 1).data]
  }
  const toRgb = (css) => toRgba(css).slice(0, 3)
  // 對照用的「線色」:直接讀 token(不經元件),沒聚焦時數「只有線」那一列用。連 alpha 一起讀:高對比模式的系統色可能半透明
  // (2026-11-26 macOS Chromium 實量 Highlight = rgba(5, 0, 73, 0.8)),畫出來的顏色要跟底下那一層合成才是截圖上看到的(見 composite)
  const p = document.createElement('div'); p.style.background = probe; wrap.appendChild(p)
  const [pr, pg, pb, probeAlpha] = toRgba(getComputedStyle(p).backgroundColor); p.remove()
  const probeRgb = [pr, pg, pb]
  // 系統色 Canvas(高對比模式下的底色):Highlight 與它分不出來時,高對比那幾列量不到線 = 儀器失效
  const cvs = document.createElement('div'); cvs.style.background = 'Canvas'; wrap.appendChild(cvs)
  const canvasRgb = toRgb(getComputedStyle(cvs).backgroundColor); cvs.remove()
  const wcs = getComputedStyle(wrap); const scs = getComputedStyle(span)
  const next = btn.nextElementSibling
  return {
    button: r(btn), wrap: r(wrap), span: r(span), arrow: r(arrow), next: next ? r(next) : null,
    text: { left: text.left, right: text.right },
    borderWidth: parseFloat(wcs.borderBottomWidth), radius: parseFloat(wcs.borderBottomLeftRadius) || 0,
    borderRgb: toRgb(wcs.borderBottomColor), probeRgb, probeAlpha, canvasRgb,
    activeEnd: btn.getAttribute('data-active-end'), focused: document.activeElement === btn,
    scrollWidth: span.scrollWidth, clientWidth: span.clientWidth, textOverflow: scs.textOverflow, overflowX: scs.overflowX,
  }
}

const near = (a, b) => Math.abs(a - b) <= COLOR_TOLERANCE
const sameColor = (x, y) => [0, 1, 2].every((k) => near(x[k], y[k]))
/** rgb 可以是一個顏色或一組顏色(任一個相符就算) */
const isColor = (png, i, rgb) => (Array.isArray(rgb[0]) ? rgb : [rgb]).some((c) => near(png.data[i], c[0]) && near(png.data[i + 1], c[1]) && near(png.data[i + 2], c[2]))
const fmt = (n) => Number(n.toFixed(2))
const fmtRgb = (rgb) => (Array.isArray(rgb[0]) ? rgb : [rgb]).map((c) => `rgb(${c.join(',')})`).join(' / ')
/** 線色疊在某一層(bg)上「畫出來」的顏色:probe 的 RGBA 照 source-over 合成。不透明(一般主色 / 錯誤紅)時 = probeRgb 本身;
 *  高對比模式的系統色可能半透明(macOS Chromium 的 Highlight alpha 0.8),線疊在底色上與疊在框線上會是兩個不同的顏色 ——
 *  只拿去掉 alpha 的 probeRgb 去比,截圖上一個像素都對不到(2026-11-26 第一次實跑 F- 列全紅、「線 (沒有)」的根因)。 */
const composite = (g, bg) => { const a = g.probeAlpha / 255; return [0, 1, 2].map((k) => Math.round(g.probeRgb[k] * a + bg[k] * (1 - a))) }

/** 截外框(上框線之下 → 外緣下 BELOW_PX),回傳 PNG 與截圖原點(CSS px,整數;外框邊緣必須落在裝置像素格上,浮層裡可能是 .5)。
 *  上框線不截:聚焦時它也是框色,會被 colorRows 數成一列(要的只有下緣那幾列)。起點取 ceil:浮層裡(Calendar 詳情)外框在像素比 2 時
 *  落在 .5 上,floor 會把半條上框線截進第 0 列(2026-11-26 對照趟實量:d2 Calendar 詳情箭頭底下數到 [0,53,54]) */
async function shotField(page, g, dpr) {
  for (const v of [g.wrap.top, g.wrap.bottom, g.wrap.left]) {
    if (Math.abs(v * dpr - Math.round(v * dpr)) > 0.02) throw new InstrumentError(`外框邊緣不在裝置像素格上(${v} × ${dpr})—— 像素列對不準`)
  }
  const x = Math.floor(g.wrap.left), y = Math.ceil(g.wrap.top + g.borderWidth)
  const clip = { x, y, width: Math.ceil(g.wrap.right) - x, height: Math.ceil(g.wrap.bottom) + BELOW_PX - y }
  return { png: PNG.sync.read(await page.screenshot({ clip })), clip }
}

/** [x0, x1)(CSS px)範圍裡逐列數「顏色像素佔一半以上」的列(裝置像素列號,相對截圖上緣) */
function colorRows(png, clip, dpr, x0, x1, rgb) {
  const a = Math.ceil((x0 - clip.x) * dpr), b = Math.floor((x1 - clip.x) * dpr)
  if (b - a < 4) throw new InstrumentError(`量測範圍太窄(${fmt(x1 - x0)}px)`)
  const rows = []
  for (let y = 0; y < png.height; y++) {
    let n = 0
    for (let x = a; x < b; x++) if (isColor(png, (y * png.width + x) * 4, rgb)) n++
    if (n >= (b - a) * ROW_COVERAGE) rows.push(y)
  }
  return rows
}

/** 某一條 CSS y 所在的裝置像素列,在 [x0, x1) 裡顏色像素的左右端(CSS px)與個數 */
function colorRun(png, clip, dpr, y, x0, x1, rgb) {
  const row = Math.floor((y - clip.y) * dpr)
  const a = Math.ceil((x0 - clip.x) * dpr), b = Math.floor((x1 - clip.x) * dpr)
  let first = -1, last = -1, n = 0
  for (let x = a; x < b; x++) {
    if (isColor(png, (row * png.width + x) * 4, rgb)) { if (first < 0) first = x; last = x; n++ }
  }
  return first < 0 ? { n: 0 } : { n, left: clip.x + first / dpr, right: clip.x + (last + 1) / dpr }
}

/** 從某條 CSS y 到另一條(不含)對應的裝置像素列號 */
const rowSpan = (clip, dpr, y0, y1) => {
  const out = []
  for (let y = Math.round((y0 - clip.y) * dpr); y < Math.round((y1 - clip.y) * dpr); y++) out.push(y)
  return out
}

/** 截圖數「按鈕右緣 → 下一個元素左緣」那條縫裡的墨點 */
async function countSpill(page, g) {
  if (!g.next) throw new InstrumentError('按鈕後面沒有下一個元素,量不到溢出縫')
  const x0 = g.button.right + 1, x1 = g.next.left - 1
  if (x1 - x0 < 2) throw new InstrumentError(`溢出縫太窄(${fmt(x1 - x0)}px)`)
  const png = PNG.sync.read(await page.screenshot({ clip: { x: x0, y: g.button.top, width: x1 - x0, height: g.button.bottom - g.button.top } }))
  let ink = 0
  for (let i = 0; i < png.data.length; i += 4) if (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2] < INK_LUMA) ink++
  return ink
}

/**
 * DS 樣式只編一次(compileDsCss 的候選 class 取自原始碼)。selftest 時把每個突變**套用後**的那份原始碼也當候選:
 * 突變換上的 class(例:放回文字底線、少加一條框寬的 bottom)現行原始碼裡沒有,不加就不會被編出來 ——
 * 突變會因「class 不存在」而紅,而不是因為它模擬的那個根因(紅對了但理由錯,量具證明不了任何事)。
 * 只是多編幾條沒人用的規則,基準那一趟的畫面不變。錨點對不上 = 儀器失效(在下方 try 裡接)。
 */
let STYLE
const loadStyle = async () => {
  const mutated = SELFTEST ? MUTANTS.map((m) => m.apply(readFileSync(resolve(dsSourceDir(SOURCE_ROOT), MUTANT_FILE), 'utf8'))) : []
  STYLE = await compileDsCss({ root: SOURCE_ROOT, extraSources: [HARNESS, ...mutated] })
}

async function runOnce(dpr, mutate) {
  const browser = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 2200 }, deviceScaleFactor: dpr, colorScheme: 'light', reducedMotion: 'reduce' })
    const page = await context.newPage()
    const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: HARNESS, harnessName: 'datepicker-range-active-underline-harness.tsx', mutate })
    mutate?.assertApplied?.()
    const { pageErrors, dispose } = await mountHarness(page, code, 'main[data-scene] [data-case] [data-field-mode]')
    try {
      await page.addStyleTag({ content: STYLE })
      await page.evaluate(() => document.fonts.ready)
      const d = makeDriver(page)
      await d.settle()
      const checks = []
      const tag = (id) => `d${dpr}-${id}`
      const geo = async (scope, end, probe) => {
        const g = await page.evaluate(GEOMETRY, { scope, end, probe })
        if (g.missing) throw new InstrumentError(`${scope}:${g.missing}`)
        return g
      }
      /** 對照:沒聚焦、面板沒開 —— 「只有線」那一列(框外緣往上 1.5px)在文字範圍裡沒有線色像素 */
      const idle = async (id, scope, end, probe) => {
        const g = await geo(scope, end, probe)
        const { png, clip } = await shotField(page, g, dpr)
        // 「只有線」那一列底下是欄位底色:線色疊在底色上畫出來的顏色(不透明時 = probeRgb)
        const run = colorRun(png, clip, dpr, g.wrap.bottom - 1.5, g.wrap.left + g.radius + g.borderWidth, g.wrap.right - g.radius - g.borderWidth, composite(g, g.canvasRgb))
        checks.push({ id: tag(`C-${id}-${end}-idle`), kind: 'control', pass: run.n === 0, detail: `沒聚焦時「只有線」那一列線色像素 ${run.n}(應 0)` })
      }
      /** 契約列:線下緣 = 框外緣、粗 2px、線長 = 文字寬、線色 = 框色(高對比模式 = 系統色 Highlight);對照列:箭頭底下只有框寬那一列(高對比:沒有線色) */
      const measure = async (id, scope, end, how, { error = false, probe, forced = false }) => {
        const g = await geo(scope, end, probe)
        if (how === 'keyboard' && !g.focused) throw new InstrumentError(`${id}:焦點不在 ${end} 端`)
        if (how === 'open' && g.activeEnd !== 'true') throw new InstrumentError(`${id}:點 ${end} 端之後面板沒開在這一端(data-active-end=${g.activeEnd})`)
        // 高對比模式:框色由瀏覽器換掉,線色 = 系統色(probe 讀的就是它的實際 sRGB);它跟底色分不出來就量不到線 —— 儀器失效,不是產品裁決
        // 系統色可能半透明(見 composite):線疊在底色上(只有線那幾列)與疊在框線上(蓋住框線那幾列)畫出來是兩個顏色,兩個都算線色;
        // 任一個跟它底下那一層分不出來 = 量不到線 = 儀器失效
        const onCanvas = composite(g, g.canvasRgb), onBorder = composite(g, g.borderRgb)
        if (forced && (sameColor(onCanvas, g.canvasRgb) || sameColor(onBorder, g.borderRgb))) {
          throw new InstrumentError(`${id}:高對比模式下 ${FORCED_LINE} rgba(${g.probeRgb.join(',')},${fmt(g.probeAlpha / 255)}) 畫在 Canvas ${fmtRgb(g.canvasRgb)} 上 = ${fmtRgb(onCanvas)}、`
            + `畫在框線 ${fmtRgb(g.borderRgb)} 上 = ${fmtRgb(onBorder)},與底下那一層分不出來`)
        }
        const lineRgb = forced ? [onCanvas, onBorder] : g.borderRgb
        const { png, clip } = await shotField(page, g, dpr)
        const tx0 = g.text.left, tx1 = Math.min(g.text.right, g.span.right)
        const rows = colorRows(png, clip, dpr, tx0 + 1, tx1 - 1, lineRgb)
        const want = rowSpan(clip, dpr, g.wrap.bottom - SPEC_THICKNESS_PX, g.wrap.bottom)
        const run = colorRun(png, clip, dpr, g.wrap.bottom - 1.5, g.wrap.left + g.radius + g.borderWidth, g.wrap.right - g.radius - g.borderWidth, lineRgb)
        const lengthOk = run.n > 0 && Math.abs(run.left - tx0) <= LENGTH_TOLERANCE_PX && Math.abs(run.right - tx1) <= LENGTH_TOLERANCE_PX
          && run.n >= (run.right - run.left) * dpr * 0.9
        const rowsOk = JSON.stringify(rows) === JSON.stringify(want)
        const colorName = forced ? `線色(${FORCED_LINE})` : '框色'
        checks.push({ id: tag(`${forced ? 'F' : 'U'}-${id}-${end}-${how}`), kind: 'bar', error, forced, slack: (g.button.right - g.button.left) - (tx1 - tx0),
          pass: rowsOk && lengthOk,
          detail: `${colorName}列 ${JSON.stringify(rows)}(應 ${JSON.stringify(want)} = 框外緣往上 ${SPEC_THICKNESS_PX}px);`
            + `線 ${run.n ? `${fmt(run.left)}–${fmt(run.right)}` : '(沒有)'} vs 文字 ${fmt(tx0)}–${fmt(tx1)}(按鈕 ${fmt(g.button.left)}–${fmt(g.button.right)});${colorName} ${fmtRgb(lineRgb)}` })
        const ar = colorRows(png, clip, dpr, g.arrow.left + 1, g.arrow.right - 1, lineRgb)
        if (forced) {
          // 對照:箭頭底下沒有線色(線沒伸到箭頭底下;顏色辨認是活的由同一張圖上的契約列證明)
          checks.push({ id: tag(`C-F-${id}-${end}-${how}-arrow`), kind: 'control', pass: ar.length === 0,
            detail: `高對比模式箭頭底下${colorName}列 ${JSON.stringify(ar)}(應 [])` })
        } else {
          // 對照:箭頭底下只有框寬那一列是框色(顏色辨認是活的、線沒伸到箭頭底下)
          const arWant = rowSpan(clip, dpr, g.wrap.bottom - g.borderWidth, g.wrap.bottom)
          checks.push({ id: tag(`C-${id}-${end}-${how}-border-seen`), kind: 'control', pass: JSON.stringify(ar) === JSON.stringify(arWant),
            detail: `箭頭底下框色列 ${JSON.stringify(ar)}(應 ${JSON.stringify(arWant)} = 框寬一列)` })
        }
        return g
      }
      const shoot = async (name, g) => {
        if (!SHOT_DIR || dpr !== 2) return
        mkdirSync(SHOT_DIR, { recursive: true })
        const file = resolve(SHOT_DIR, `datepicker-range-active-bar-${name}.png`)
        const pad = 12
        await page.screenshot({ path: file, clip: { x: g.wrap.left - pad, y: g.wrap.top - pad, width: g.wrap.right - g.wrap.left + pad * 2, height: g.wrap.bottom - g.wrap.top + pad * 2 } })
        console.log(`  (畫面:${file})`)
      }

      for (const c of CASES) {
        const scope = caseScope(c.id)
        const probe = c.error ? 'var(--color-error)' : 'var(--color-primary)'
        await parkPointer(page)
        for (const end of ENDS) await idle(c.id, scope, end, probe)
        // 鍵盤:從前一個控件 Tab 進來 = 起始端;再 Tab = 結束端(面板關著,線來自 focus-visible)
        await d.focus(`[data-before="${c.id}"]`)
        for (const end of ENDS) {
          await d.press('Tab')
          const g = await measure(c.id, scope, end, 'keyboard', { error: !!c.error, probe })
          if (end === 'start' && ['md-md', 'lg-md', 'lg-lg'].includes(c.id)) await shoot(`${c.id}-keyboard`, g)
          if (c.long) {
            const ink = await countSpill(page, g)
            const truncated = g.scrollWidth > g.clientWidth + 1
            const pass = truncated && g.textOverflow === 'ellipsis' && g.overflowX !== 'visible' && ink === 0
            checks.push({ id: tag(`T-${c.id}-${end}`), kind: 'truncate', pass,
              detail: `scrollWidth ${g.scrollWidth} / clientWidth ${g.clientWidth}、text-overflow ${g.textOverflow}、overflow-x ${g.overflowX}、按鈕外那條縫墨點 ${ink}` })
          }
        }
        // 點開面板:線來自 data-active-end(滑鼠點,不是 focus-visible)
        if (!c.long) {
          for (const end of ENDS) {
            await page.click(`${scope} button[aria-label="${PLACEHOLDER[end === 'start' ? 0 : 1]}"]`, { timeout: WAIT_CAP_MS })
            await d.settle()
            await parkPointer(page)
            await d.settle()
            const g = await measure(c.id, scope, end, 'open', { error: !!c.error, probe })
            if (end === 'start' && c.id === 'md-md-error') await shoot(`${c.id}-open`, g)
            await d.press('Escape')
          }
        }
      }

      // 高對比模式(forced-colors):同一欄再量一次,線色 = 系統色 Highlight(背景色在該模式被強制換成底色、只有系統色不換)
      {
        const scope = caseScope(FORCED_CASE)
        await page.emulateMedia({ forcedColors: 'active' })
        await d.settle()
        await parkPointer(page)
        for (const end of ENDS) await idle(`F-${FORCED_CASE}`, scope, end, FORCED_LINE)
        await d.focus(`[data-before="${FORCED_CASE}"]`)
        for (const end of ENDS) {
          await d.press('Tab')
          const g = await measure(FORCED_CASE, scope, end, 'keyboard', { probe: FORCED_LINE, forced: true })
          if (end === 'start') await shoot(`${FORCED_CASE}-forced-colors-keyboard`, g)
        }
        for (const end of ENDS) {
          await page.click(`${scope} button[aria-label="${PLACEHOLDER[end === 'start' ? 0 : 1]}"]`, { timeout: WAIT_CAP_MS })
          await d.settle()
          await parkPointer(page)
          await d.settle()
          await measure(FORCED_CASE, scope, end, 'open', { probe: FORCED_LINE, forced: true })
          await d.press('Escape')
        }
        await page.emulateMedia({ forcedColors: 'none' })
        await d.settle()
      }

      // Calendar 詳情時間欄:點事件開詳情 → 點時間欄進編輯 → 點開起訖兩端
      await d.click(`[data-calendar-event-id="${CAL_EVENT}"]`)
      await d.waitFor(() => !!document.querySelector('[data-calendar-event-detail][data-state="open"]'), '事件詳情打開')
      await d.click(`${CAL_SCOPE} button`)
      const rangeBtns = `${CAL_SCOPE} button[aria-haspopup="dialog"]`
      await page.waitForFunction((s) => document.querySelectorAll(s).length === 2, rangeBtns, { timeout: WAIT_CAP_MS })
        .catch(() => { throw new InstrumentError('Calendar 詳情:時間欄沒進編輯(等不到 DatePicker.Range 兩端)') })
      await d.settle()
      // 2026-11-27 起點時間欄一下就開好日期面板(DatePicker.Range defaultOpen):先按一下 Esc 收起(仍在編輯、焦點回開始端),
      // 回到「面板關著、逐端點開」的量法 —— 面板開著時直接點起訖鈕 = 點在面板外,Radix 先關再開,量到的是動畫中間
      await page.waitForSelector('[role="dialog"][aria-label="日期區間選擇"]', { timeout: WAIT_CAP_MS })
        .catch(() => { throw new InstrumentError('Calendar 詳情:點時間欄進編輯後日期面板沒開(應點一下就開)') })
      await d.press('Escape')
      await page.waitForFunction((s) => !document.querySelector('[role="dialog"][aria-label="日期區間選擇"]') && document.querySelectorAll(s).length === 2, rangeBtns, { timeout: WAIT_CAP_MS })
        .catch(() => { throw new InstrumentError('Calendar 詳情:Esc 後日期面板沒收起 / 時間欄離開了編輯') })
      for (const end of ENDS) {
        await page.locator(rangeBtns).nth(end === 'start' ? 0 : 1).click({ timeout: WAIT_CAP_MS })
          .catch(() => { throw new InstrumentError(`Calendar 詳情:點不到 ${end} 端`) })
        await d.settle()
        await parkPointer(page)
        await d.settle()
        const g = await measure('calendar-detail', CAL_SCOPE, end, 'open', { probe: 'var(--color-primary)' })
        if (end === 'start') await shoot('calendar-detail-open', g)
        await d.press('Escape')
      }

      if (pageErrors.length) throw new InstrumentError(`頁面例外:${pageErrors.join(' | ')}`)
      return checks
    } finally {
      dispose()
    }
  } finally {
    await browser.close()
  }
}

async function runVariant(label, mutateFactory) {
  const checks = []
  for (const dpr of DPRS) checks.push(...await runOnce(dpr, mutateFactory?.()))
  return { label, checks }
}

function report({ label, checks }) {
  console.log(`\n── ${label} ──`)
  for (const c of checks) {
    if (c.kind === 'control' && c.pass) continue
    if (c.pass && SELFTEST) continue
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id.padEnd(40)} ${c.kind === 'control' ? '[對照] ' : ''}${c.detail}`)
  }
  const controls = checks.filter((c) => c.kind === 'control')
  console.log(`  ${controls.every((c) => c.pass) ? '✓' : '✗'} [對照] 沒聚焦時「只有線」那一列 = 0、箭頭底下只有框寬一列:${controls.filter((c) => c.pass).length}/${controls.length}`)
}
const redIds = (checks) => checks.filter((c) => !c.pass).map((c) => c.id).sort()
/** 判定紅的那一行 —— 判定模式與 selftest 基準共用(npm 別名與 CI 只跑 --selftest,基準紅就是產品裁決,不能只印「量具不可信」) */
const verdictRedLine = (red) => `\n✗ 日期區間作用端線:${red.length} 列不符(${red.join(' / ')})—— SSOT date-picker.spec.md「Active-end 機制」視覺指示(壓在框下邊、線長 = 文字寬、線色 = 框色)`

try {
  await loadStyle()
  const rootLabel = SOURCE_ROOT === REPO_ROOT ? '本 repo' : SOURCE_ROOT
  if (!SELFTEST) {
    const result = await runVariant(`原始碼 = ${rootLabel}`, null)
    report(result)
    const red = redIds(result.checks)
    if (red.length) {
      console.log(verdictRedLine(red))
      process.exitCode = 1
    } else {
      const contract = result.checks.filter((c) => c.kind !== 'control')
      console.log(`\n✓ 日期區間作用端線:${contract.length} 列全綠(線 ${contract.filter(isBar).length} 列壓在框下邊 ${SPEC_THICKNESS_PX}px、線長 = 文字寬、線色 = 框色;長日期截斷 ${contract.filter((c) => c.kind === 'truncate').length} 列;像素比 ${DPRS.join(' / ')}),對照 ${result.checks.length - contract.length} 列綠`)
    }
  } else {
    const baseline = await runVariant('現行原始碼(selftest 基準,必須全綠)', null)
    report(baseline)
    const problems = []
    if (redIds(baseline.checks).length) {
      console.log(verdictRedLine(redIds(baseline.checks)))
      problems.push(`現行原始碼本身就紅(${redIds(baseline.checks).join(' / ')}),突變的紅燈無法歸因`)
    }
    const contract = baseline.checks.filter((c) => c.kind !== 'control')
    const slackRows = contract.filter((c) => isBar(c) && c.slack > SLACK_RED_PX)
    console.log(`\n  文字比按鈕窄 ${SLACK_RED_PX}px 以上的線列 ${slackRows.length} / ${contract.filter(isBar).length}(線長改成按鈕寬的突變該紅的就是這些)`)
    for (const m of MUTANTS) if (!contract.some(m.redWhen)) problems.push(`突變 ${m.id} 的「該紅」集合是空的 —— 對照組沒有作用`)
    const covered = new Set()
    for (const m of MUTANTS) {
      let result
      try {
        result = await runVariant(`突變 ${m.id}:${m.what}`, () => mutantFor(SOURCE_ROOT, MUTANT_FILE, m.apply))
      } catch (error) {
        if (error instanceof InstrumentError) error.message = `突變 ${m.id}:${error.message}`
        throw error
      }
      report(result)
      const red = redIds(result.checks)
      const want = contract.filter(m.redWhen).map((c) => c.id).sort()
      const controlRed = result.checks.filter((c) => c.kind === 'control' && !c.pass).map((c) => c.id)
      if (controlRed.length) problems.push(`${m.id}:對照列 ${controlRed.join(' / ')} 紅了 —— 突變弄壞的是量具,不是契約`)
      if (JSON.stringify(red) !== JSON.stringify(want)) {
        const extra = red.filter((id) => !want.includes(id)); const lack = want.filter((id) => !red.includes(id))
        problems.push(`${m.id}:紅了 ${red.length} 列、應剛好 ${want.length} 列(多紅:${extra.join(', ') || '無'};該紅沒紅:${lack.join(', ') || '無'})`)
      } else {
        console.log(`  → 突變 ${m.id} 剛好紅了該紅的 ${want.length} 列`)
      }
      for (const id of red) covered.add(id)
    }
    const uncovered = contract.map((c) => c.id).filter((id) => !covered.has(id))
    if (uncovered.length) problems.push(`契約列 ${uncovered.join(' / ')} 沒有任何突變能讓它紅 —— 它的綠燈是零證據`)
    if (problems.length) {
      console.log('\n✗ selftest:量具不可信 ——')
      for (const p of problems) console.log(`  - ${p}`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ selftest:${MUTANTS.length} 個根因突變各自剛好紅了該紅的列(契約 ${contract.length} 列全被覆蓋),對照列全程綠 —— 量具會紅`)
    }
  }
} catch (error) {
  if (error instanceof InstrumentError) {
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${error.message} —— 不是產品裁決,但這一趟不能算通過`)
    process.exitCode = 1
  } else {
    throw error
  }
}

#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: `DatePicker.Range` 起訖兩顆按鈕「現在在選哪一端」的作用端盒子(RANGE-END(定)2026-11-27;date-picker.spec.md「Active-end 機制」視覺指示;
 *        取代 2026-11-26 RANGE-FOCUS-BAR 那條線)**畫出來**是:
 *        (G 幾何)盒子 = 欄位裡 Tag 的四邊等距矩形:高 = --tag-height-*;上下離框內緣、開始端離框左內緣、到中間箭頭、結束端離箭頭、到右側下一個元素都 = 內縮
 *          (欄位高 − 2 × 框寬 − Tag 高)/ 2(小 3 / 中 3 / 大 5,由頁面上的 token 現算);字的位置與改前相同(開始端字左緣 = 框內緣 + --field-px、
 *          結束端字左緣 = 箭頭右緣 + 箭頭 mx-2 + 外框 gap-2);
 *        (O 面板開著那一端)盒子鋪 --primary-subtle(欄位錯誤時 --error-subtle),另一顆不鋪;作用端沒有焦點框(焦點在日曆裡);
 *          (OF)外框 = 主色(浮層開著,field.spec.md「Field state machine SSOT」;錯誤態不分開著關著都是紅框,由對照列量,不另立 OF 列);
 *        (H 滑過)面板開著時滑鼠滑到另一端:另一端不鋪底、作用端照鋪、外框照舊(起訖兩半自己沒有滑過樣式);
 *        (K 面板關著、鍵盤 Tab 到那一顆)那一顆畫自己的焦點框(solid 2px、offset −2px,框帶像素 = 它 computed 的 outline 顏色),另一顆不畫;盒內不鋪底;
 *          (KF)外框照 field-wrapper.tsx `focus-within:!border-primary` 轉主色(錯誤時紅)—— 框中框(user「確認的話就照你建議」,確認不成立 → 採 (i));
 *        (N 沒有線)盒子底 → 框線之間(內縮那幾列,含 2026-11-26 那條線的位置)沒有主色 / 錯誤色 / 焦點色像素;
 *        (F / FK 高對比模式,`page.emulateMedia({ forcedColors: 'active' })`,md 密度 md 尺寸)開著那一端鋪系統色 Highlight(半透明時與 Canvas 合成;
 *          背景色在該模式被強制換成底色、只有系統色不換 —— W3C css-color-adjust-1);鍵盤那一顆照畫焦點框(outline 在該模式照畫,顏色由瀏覽器換,量「有墨」);
 *        (T 長日期)文字段截斷(scrollWidth > clientWidth、text-overflow: ellipsis),盒子右緣到下一個元素之間那條縫零墨點。
 *        一般 / 大密度 × sm / md / lg × 帶 / 不帶時間、錯誤態(兩種密度)、長日期,起訖兩端;Calendar 詳情時間欄(進編輯後逐端點開);裝置像素比 1 與 2。
 *   紅: 任一列不符 → 逐列點名(案例 / 端點 / 出現方式 / 像素比,量到的值)exit 1。`--selftest` 在 DS 原始碼上造單一根因突變(MUTANTS),
 *        每個突變必須**剛好**紅它負責的那幾列,契約列每一條都要被某個突變弄紅過:拿掉焦點框 → K / FK 列;開著不鋪底 → 非高對比的 O 列與 H 列;
 *        錯誤時仍鋪淺藍 → 錯誤態 O 列;高對比不換系統色 → F 列;盒子撐滿欄位高 → G 列;放回那條線 → N 列;外框改成 (ii) 不亮 → KF 列;拿掉外框的「浮層開著」記號 → OF 與 H 列;
 *        起訖兩半加滑過底色 → H 列;文字段水平不裁 → T 列。
 *   綠: 現行原始碼每列都量到且符合;對照列(C-)在現行原始碼與每個突變上都綠:沒聚焦、面板沒開時兩顆都不鋪底、不畫框、外框是一般框色
 *        (顏色辨認是活的:同一張圖上框線那一列數得到框色)。harness 載不起來 / 焦點沒落到該落的那一顆 / 面板沒開 / 底色與欄位底色分不出來 /
 *        等不到靜止 = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過(M37)。
 *   註: 2026-11-17 新增(A50,量文字底線);2026-11-26 改量 RANGE-FOCUS-BAR 那條線;2026-11-27 依 RANGE-END(定)改量作用端盒子(檔名與 npm 別名沿用,
 *        CI 步驟不變)。user 原話(逐字):決策頁 q6 備註「不要有底線，然後整段寬上淺藍色底，但會有相等的邊距不會貼在邊上？邊距看要怎麼訂比較符合我們ds一致的設計語言」;
 *        「那為何不能直接以原本焦點框的視覺定義原則去決定到底焦點框⏎要怎麼長？為何要執著在那一條線？⏎那一條線不就是因為不清楚才被淘汰掉的嗎？？？？？」;
 *        「確認的話就照你建議」。CI:`.github/workflows/ci.yml` 跑 `npm run test:datepicker-range-active-underline`(= `--selftest`)。
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

const DPRS = [1, 2]
/** 線狀的東西(框線、焦點框)比顏色:每個色版差 ≤ 此值(反鋸齒) */
const LINE_TOLERANCE = 40
/** 外框上框線(整數像素上的實心橫線)比顏色:一般框 `--border` 半透明,疊在白底上只比白暗約 38,用線狀容差會把白底也當成框色 */
const FRAME_TOLERANCE = 12
/** 大塊實心底色比顏色:每個色版差 ≤ 此值。淺藍底與白底只差約 24,寬容差會把兩者當成同一色 */
const FILL_TOLERANCE = 5
/** 幾何容差(CSS px) */
const GEOM_TOLERANCE_PX = 0.5
/** 一塊取樣算「是這個顏色」:≥ 此比例的像素相符 */
const COVERAGE = 0.8
/** 另一顆「沒有焦點框」:框帶像素相符的比例 < 此值 */
const OTHER_MAX = 0.2
/** 「墨點」:亮度低於此值(白底上的字) */
const INK_LUMA = 200

const VALUE_DATE = ['2026-04-15', '2026-04-20']
const VALUE_TIME = ['2026-04-15T14:30', '2026-04-20T09:05']
const CASES = []
for (const density of ['md', 'lg']) {
  for (const size of ['sm', 'md', 'lg']) {
    for (const time of [false, true]) {
      CASES.push({ id: `${density}-${size}${time ? '-time' : ''}`, density, size, time, width: time ? 440 : 360, value: time ? VALUE_TIME : VALUE_DATE })
    }
  }
  // 錯誤態:底色換錯誤淡色、外框紅
  CASES.push({ id: `${density}-md-error`, density, size: 'md', error: true, width: 360, value: VALUE_DATE })
}
// 長日期:showTime + 秒,欄位故意窄 —— 兩端都必須截斷
CASES.push({ id: 'md-md-long', density: 'md', size: 'md', time: true, long: true, width: 260, value: ['2026-04-15T14:30:59', '2026-04-20T09:05:00'] })
const ENDS = ['start', 'end']
const PLACEHOLDER = ['入住日期', '退房日期']
const CAL_EVENT = 'rf1'
const CAL_SCOPE = '[data-calendar-event-detail] [data-calendar-detail-field="time"]'
const caseScope = (id) => `[data-case="${id}"]`
/** 高對比模式量哪一欄;滑過量哪幾欄;--shot 存哪幾欄 */
const FORCED_CASE = 'md-md'
const FORCED_FILL = 'Highlight'
const HOVER_CASES = ['md-md', 'lg-lg']
const SHOT_CASES = ['md-md', 'lg-lg', 'md-md-error']

/** 錨點必須剛好命中 want 次(否則儀器失效) */
const replaceAll = (src, pattern, replacement, want) => {
  const hits = src.match(pattern)?.length ?? 0
  if (hits !== want) throw new InstrumentError(`突變錨點命中 ${hits} 次(應為 ${want} 次):${pattern} —— 原始碼改了,selftest 的突變要跟著改`)
  return src.replace(pattern, replacement)
}
const BOX_ANCHOR = /const RANGE_END_BOX = 'rounded-md focus-visible:focus-ring-inset /
const FILL_ANCHOR = /error \? 'data-\[active-end=true\]:bg-error-subtle' : 'data-\[active-end=true\]:bg-primary-subtle'/g
const FORCED_ANCHOR = / forced-colors:data-\[active-end=true\]:forced-color-adjust-none forced-colors:data-\[active-end=true\]:bg-\[color:Highlight\] forced-colors:data-\[active-end=true\]:text-\[color:HighlightText\]'/
const HEIGHT_ANCHOR = /const RANGE_END_HEIGHT = \{ sm: 'h-tag-sm', md: 'h-tag-md', lg: 'h-tag-lg' \} as const/
const TEXT_CLASS_ANCHOR = /const RANGE_END_TEXT_CLASS = 'min-w-0 truncate'/
const INSET_USE_ANCHOR = /RANGE_END_INSET\[size \?\? 'md'\],/
/** Range 外框那一處(12 格縮排;單日 DatePicker 那一處縮排不同,不會命中) */
const OPEN_MARK_ANCHOR = /\n {12}\{\.\.\.fieldOpenProps\(open\)\}/

const kindIs = (...kinds) => (row) => kinds.includes(row.kind)
const MUTANTS = [
  {
    id: 'no-focus-ring',
    what: '拿掉那一顆自己的焦點框(focus-visible:focus-ring-inset)—— 面板關著時起訖兩顆又分不出來',
    redWhen: kindIs('ring'),
    apply: (src) => replaceOnce(src, BOX_ANCHOR, "const RANGE_END_BOX = 'rounded-md "),
  },
  {
    id: 'no-open-fill',
    what: '面板開著那一端不鋪底(一般與錯誤都不鋪)',
    redWhen: (row) => (row.kind === 'fill' && !row.forced) || row.kind === 'hover',
    apply: (src) => replaceAll(src, FILL_ANCHOR, "error ? '' : ''", 2),
  },
  {
    id: 'error-fill-stays-primary',
    what: '欄位錯誤時作用端仍鋪淺藍(沒跟外框換成錯誤淡色)',
    redWhen: (row) => row.kind === 'fill' && row.error,
    apply: (src) => replaceAll(src, FILL_ANCHOR, "error ? 'data-[active-end=true]:bg-primary-subtle' : 'data-[active-end=true]:bg-primary-subtle'", 2),
    scope: { cases: ['md-md', 'md-md-error', 'lg-md-error'] },
  },
  {
    id: 'forced-fill-vanishes',
    what: '高對比模式不換系統色(背景色被強制換成底色,作用端看不出來)',
    redWhen: (row) => row.kind === 'fill' && row.forced,
    apply: (src) => replaceOnce(src, FORCED_ANCHOR, "'"),
    scope: { cases: ['md-md'], forced: true },
  },
  {
    id: 'box-full-height',
    what: '盒子撐滿欄位高(不是 Tag 高、上下不內縮)',
    redWhen: kindIs('geom'),
    apply: (src) => replaceOnce(src, HEIGHT_ANCHOR, "const RANGE_END_HEIGHT = { sm: 'self-stretch', md: 'self-stretch', lg: 'self-stretch' } as const"),
  },
  {
    id: 'bar-back',
    what: '放回作用端那條線(2026-11-26 RANGE-FOCUS-BAR 的位置:壓在框下邊、2px 主色)',
    redWhen: kindIs('noline'),
    apply: (src) => replaceOnce(src, BOX_ANCHOR,
      "const RANGE_END_BOX = 'relative overflow-visible after:absolute after:inset-x-0 after:-bottom-[calc(var(--range-end-inset)_+_var(--field-border-width))] after:h-0.5 data-[active-end=true]:after:bg-primary focus-visible:after:bg-primary rounded-md focus-visible:focus-ring-inset "),
  },
  {
    id: 'frame-not-lit-ii',
    what: '面板關著 Tab 到一端時外框不亮(選項 (ii):焦點落在起訖鈕上時外框蓋回一般框色)',
    redWhen: kindIs('kframe'),
    apply: (src) => replaceOnce(src, INSET_USE_ANCHOR, "RANGE_END_INSET[size ?? 'md'], 'has-[[data-range-end]:focus-visible]:!border-border',"),
  },
  {
    id: 'open-mark-missing',
    what: 'Range 外框不掛「自己的浮層開著」記號(拿掉 fieldOpenProps)—— 焦點進日曆後外框退回一般框色',
    redWhen: kindIs('oframe', 'hover'),
    apply: (src) => replaceOnce(src, OPEN_MARK_ANCHOR, '\n'),
  },
  {
    id: 'hover-fill',
    what: '起訖兩半加滑過底色(hover:bg-primary-subtle)',
    redWhen: kindIs('hover'),
    apply: (src) => replaceOnce(src, BOX_ANCHOR, "const RANGE_END_BOX = 'hover:bg-primary-subtle rounded-md focus-visible:focus-ring-inset "),
    scope: { cases: [...HOVER_CASES, 'md-sm'] },
  },
  {
    id: 'span-no-horizontal-clip',
    what: '文字段水平不裁(只剩 nowrap)—— 長日期溢出按鈕',
    redWhen: kindIs('truncate'),
    apply: (src) => replaceOnce(src, TEXT_CLASS_ANCHOR, "const RANGE_END_TEXT_CLASS = 'min-w-0 whitespace-nowrap'"),
    scope: { cases: ['md-md', 'md-md-long'] },
  },
]
// scope(選填):只跑這幾欄(forced / calendar = 是否也跑高對比與 Calendar 詳情段)—— 只給「該紅的列只出現在少數幾欄」的突變用,
// 省 CI 時間(25 分上限);範圍裡必須同時有該紅與不該紅的列,「剛好紅該紅的」才有意義。沒有 scope = 全部跑。
// 覆蓋率照舊對全部契約列算:每一種列都至少有一個不帶 scope 的突變能讓它全部紅(F、H、T 列由帶 scope 的突變負責,範圍已含全部那種列)。
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

/**
 * 頁面端:兩顆盒子、外框、箭頭、結束端右側下一個元素的幾何,與要比對的顏色(全部經 canvas 換成 sRGB 0–255;截圖量的就是 sRGB)。
 * 尺寸由外框實高對 --field-height-* 反推(同一密度裡三檔互不相同),Tag 高與內縮再由 token 現算 —— 不信元件自己的盒高。
 */
const GEOMETRY = ({ scope, end, fillProbe, forced }) => {
  const root = document.querySelector(scope)
  const btns = root ? [...root.querySelectorAll('button[aria-haspopup="dialog"]')] : []
  if (btns.length !== 2) return { missing: `${scope} 裡起訖按鈕 ${btns.length} 顆(應 2)` }
  const i = end === 'start' ? 0 : 1
  const btn = btns[i], other = btns[1 - i]
  const wrap = btn.closest('[data-field-mode]')
  const arrow = btns[0].nextElementSibling
  const spans = btns.map((b) => b.querySelector(':scope > span'))
  if (!wrap || !arrow || spans.some((s) => !s)) return { missing: '找不到外框 / 文字段 / 中間箭頭' }
  const r = (el) => { const x = el.getBoundingClientRect(); return { left: x.left, top: x.top, right: x.right, bottom: x.bottom } }
  const toRgba = (css) => {
    const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1
    const cx = cv.getContext('2d'); cx.fillStyle = css; cx.fillRect(0, 0, 1, 1)
    return [...cx.getImageData(0, 0, 1, 1).data]
  }
  const probeColor = (css) => { const p = document.createElement('div'); p.style.background = css; wrap.appendChild(p); const v = toRgba(getComputedStyle(p).backgroundColor); p.remove(); return v }
  const probeLen = (css) => { const p = document.createElement('div'); p.style.cssText = `position:absolute;visibility:hidden;height:0;width:${css}`; wrap.appendChild(p); const v = p.getBoundingClientRect().width; p.remove(); return v }
  const textLeft = (span) => { const rg = document.createRange(); rg.selectNodeContents(span); return rg.getBoundingClientRect().left }
  // 欄位實際的底:從外框往上找第一個不透明的背景(高對比模式一律是系統色 Canvas)
  const effBg = () => { for (let e = wrap; e; e = e.parentElement) { const v = toRgba(getComputedStyle(e).backgroundColor); if (v[3] > 0) return v.slice(0, 3) } return [255, 255, 255] }
  const wcs = getComputedStyle(wrap), bcs = getComputedStyle(btn), scs = getComputedStyle(spans[i])
  const B = parseFloat(wcs.borderTopWidth)
  const fieldH = wrap.getBoundingClientRect().height
  const size = ['sm', 'md', 'lg'].find((s) => Math.abs(probeLen(`var(--field-height-${s})`) - fieldH) < 0.1) ?? null
  const tagH = size ? probeLen(`var(--tag-height-${size})`) : NaN
  const afterEnd = btns[1].nextElementSibling
  const canvasRgb = probeColor('Canvas').slice(0, 3)
  const bgRgb = forced ? canvasRgb : effBg()
  // 框色可能半透明(一般框 `--border` = oklch(0 0 0 / 0.15)):截圖上看到的是它疊在欄位底上的合成色
  const over = (rgba) => { const a = rgba[3] / 255; return [0, 1, 2].map((k) => Math.round(rgba[k] * a + bgRgb[k] * (1 - a))) }
  // 主色 / 錯誤色讀語意 token 本身(`--primary` / `--error`):Tailwind `@theme inline` 不在執行期輸出 `--color-*`,讀那個會拿到透明
  const tok = { '--primary': probeColor('var(--primary)'), '--error': probeColor('var(--error)'), '--border': probeColor('var(--border)') }
  const blank = Object.keys(tok).filter((k) => tok[k][3] === 0)
  if (blank.length) return { missing: `token 讀到透明:${blank.join(' / ')}` }
  return {
    size, box: r(btn), otherBox: r(other), wrap: r(wrap), arrow: r(arrow),
    next: btn.nextElementSibling ? r(btn.nextElementSibling) : null, afterEnd: afterEnd ? r(afterEnd) : null,
    textLeft: textLeft(spans[i]), otherTextLeft: textLeft(spans[1 - i]),
    borderWidth: B, radius: parseFloat(wcs.borderTopLeftRadius) || 0, borderRgb: over(toRgba(wcs.borderTopColor)),
    fillRgba: probeColor(fillProbe), primaryRgb: over(tok['--primary']), errorRgb: over(tok['--error']),
    defaultBorderRgb: over(tok['--border']), canvasRgb, bgRgb,
    outlineRgb: toRgba(bcs.outlineColor).slice(0, 3), outlineStyle: bcs.outlineStyle, outlineWidth: parseFloat(bcs.outlineWidth), outlineOffset: parseFloat(bcs.outlineOffset),
    expectInset: (fieldH - 2 * B - tagH) / 2, expectTagH: tagH,
    fieldPx: probeLen('var(--field-px)'), gap2: probeLen('calc(var(--spacing) * 2)'),
    activeEnd: btn.getAttribute('data-active-end'),
    focused: document.activeElement === btn, focusVisible: btn.matches(':focus-visible'),
    scrollWidth: spans[i].scrollWidth, clientWidth: spans[i].clientWidth, textOverflow: scs.textOverflow,
  }
}

const fmt = (n) => Number(n.toFixed(2))
const fmtRgb = (rgb) => (Array.isArray(rgb[0]) ? rgb : [rgb]).map((c) => `rgb(${c.join(',')})`).join(' / ')
const sameColor = (x, y, tol) => [0, 1, 2].every((k) => Math.abs(x[k] - y[k]) <= tol)
/** rgb 可以是一個顏色或一組顏色(任一個相符就算) */
const isColor = (png, i, rgb, tol) => (Array.isArray(rgb[0]) ? rgb : [rgb]).some((c) => [0, 1, 2].every((k) => Math.abs(png.data[i + k] - c[k]) <= tol))
/** RGBA 疊在底色上畫出來的顏色(source-over;系統色可能半透明,macOS Chromium 的 Highlight alpha 0.8) */
const composite = (rgba, bg) => { const a = rgba[3] / 255; return [0, 1, 2].map((k) => Math.round(rgba[k] * a + bg[k] * (1 - a))) }
const nearPx = (a, b) => Math.abs(a - b) <= GEOM_TOLERANCE_PX

/** 截外框整塊(含框線)→ PNG 與截圖原點(CSS px,整數) */
async function shotField(page, g) {
  const x = Math.floor(g.wrap.left), y = Math.floor(g.wrap.top)
  const clip = { x, y, width: Math.ceil(g.wrap.right) - x, height: Math.ceil(g.wrap.bottom) - y }
  return { png: PNG.sync.read(await page.screenshot({ clip })), clip }
}
/** 矩形 [x0, x1) × [y0, y1)(CSS px)裡、中心點落在範圍內的裝置像素(的 data 位移) */
function pixelsIn(png, clip, dpr, [x0, y0, x1, y1]) {
  const ax = Math.ceil((x0 - clip.x) * dpr - 0.5), bx = Math.ceil((x1 - clip.x) * dpr - 0.5)
  const ay = Math.ceil((y0 - clip.y) * dpr - 0.5), by = Math.ceil((y1 - clip.y) * dpr - 0.5)
  if (bx <= ax || by <= ay) throw new InstrumentError(`取樣範圍是空的(${fmt(x0)}–${fmt(x1)} × ${fmt(y0)}–${fmt(y1)})`)
  const out = []
  for (let y = Math.max(0, ay); y < Math.min(png.height, by); y++) for (let x = Math.max(0, ax); x < Math.min(png.width, bx); x++) out.push((y * png.width + x) * 4)
  if (!out.length) throw new InstrumentError(`取樣範圍在截圖外(${fmt(x0)}–${fmt(x1)} × ${fmt(y0)}–${fmt(y1)})`)
  return out
}
/** 一塊矩形裡顏色相符的比例 */
function ratio(png, clip, dpr, rect, rgb, tol) {
  const px = pixelsIn(png, clip, dpr, rect)
  return px.filter((i) => isColor(png, i, rgb, tol)).length / px.length
}

/** 截圖數「盒子右緣 → 下一個元素左緣」那條縫裡的墨點 */
async function countSpill(page, g) {
  if (!g.next) throw new InstrumentError('按鈕後面沒有下一個元素,量不到溢出縫')
  const x0 = g.box.right + 0.5, x1 = g.next.left - 0.5
  if (x1 - x0 < 1) throw new InstrumentError(`溢出縫太窄(${fmt(x1 - x0)}px)`)
  const png = PNG.sync.read(await page.screenshot({ clip: { x: x0, y: g.box.top, width: x1 - x0, height: g.box.bottom - g.box.top } }))
  let ink = 0
  for (let i = 0; i < png.data.length; i += 4) if (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2] < INK_LUMA) ink++
  return ink
}

/**
 * DS 樣式只編一次(compileDsCss 的候選 class 取自原始碼)。selftest 時把每個突變**套用後**的那份原始碼也當候選:
 * 突變換上的 class 現行原始碼裡沒有,不加就不會被編出來 —— 突變會因「class 不存在」而紅,不是因為它模擬的那個根因。
 */
let STYLE
const loadStyle = async () => {
  const mutated = SELFTEST ? MUTANTS.map((m) => m.apply(readFileSync(resolve(dsSourceDir(SOURCE_ROOT), MUTANT_FILE), 'utf8'))) : []
  STYLE = await compileDsCss({ root: SOURCE_ROOT, extraSources: [HARNESS, ...mutated] })
}

async function runOnce(dpr, mutate, only = null) {
  const browser = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 2200 }, deviceScaleFactor: dpr, colorScheme: 'light', reducedMotion: 'reduce' })
    const page = await context.newPage()
    const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: HARNESS, harnessName: 'datepicker-range-active-end-harness.tsx', mutate })
    mutate?.assertApplied?.()
    const { pageErrors, dispose } = await mountHarness(page, code, 'main[data-scene] [data-case] [data-field-mode]')
    try {
      await page.addStyleTag({ content: STYLE })
      await page.evaluate(() => document.fonts.ready)
      const d = makeDriver(page)
      await d.settle()
      const checks = []
      const tag = (id) => `d${dpr}-${id}`
      const geo = async (scope, end, { fillProbe = 'var(--primary-subtle)', forced = false } = {}) => {
        const g = await page.evaluate(GEOMETRY, { scope, end, fillProbe, forced })
        if (g.missing) throw new InstrumentError(`${scope}:${g.missing}`)
        if (!g.size) throw new InstrumentError(`${scope}:外框高對不上任何一檔 --field-height-*`)
        return g
      }
      /** 盒子裡、字左邊那一段(焦點框帶之內 0.5px 起、到字前 0.5px,最多 2.5px 寬):量底色 */
      const fillRect = (b, textLeft) => [b.left + 2.5, b.top + 4, Math.min(b.left + 5, textLeft - 0.5), b.bottom - 4]
      /** 焦點框帶(往內 2px 那一圈的左邊;上下避開圓角):量框 */
      const ringRect = (b) => [b.left + 0.25, b.top + 4, b.left + 1.75, b.bottom - 4]
      /** 外框上框線那一列(避開圓角) */
      const frameRect = (g) => [g.wrap.left + g.radius + 2, g.wrap.top, g.wrap.right - g.radius - 2, g.wrap.top + g.borderWidth]
      const frameName = (error) => (error ? '錯誤紅' : '主色')

      /** 對照(C)+ 幾何(G):沒聚焦、面板沒開 —— 兩顆不鋪底、不畫框、外框一般框色;盒子幾何照 Tag 內縮 */
      const idle = async (id, scope, end, { error = false } = {}) => {
        const g = await geo(scope, end)
        const { png, clip } = await shotField(page, g)
        const noFill = ratio(png, clip, dpr, fillRect(g.box, g.textLeft), g.bgRgb, FILL_TOLERANCE) >= COVERAGE
        const noRing = ratio(png, clip, dpr, ringRect(g.box), g.bgRgb, FILL_TOLERANCE) >= COVERAGE
        const frameOk = ratio(png, clip, dpr, frameRect(g), error ? g.errorRgb : g.defaultBorderRgb, FRAME_TOLERANCE) >= COVERAGE
        checks.push({ id: tag(`C-${id}-${end}-idle`), kind: 'control', pass: noFill && noRing && frameOk,
          detail: `沒聚焦時:盒子${noFill ? '沒鋪底' : '鋪了底'}、${noRing ? '沒有框' : '有框'}、外框${frameOk ? '是' : '不是'}${error ? '錯誤紅' : '一般框色'}` })
        const B = g.borderWidth, inset = g.expectInset
        const sides = end === 'start'
          ? { 左: g.box.left - (g.wrap.left + B), 到箭頭: g.arrow.left - g.box.right }
          : { 離箭頭: g.box.left - g.arrow.right, 到右側: g.afterEnd ? g.afterEnd.left - g.box.right : NaN }
        const vert = { 上: g.box.top - (g.wrap.top + B), 下: (g.wrap.bottom - B) - g.box.bottom }
        const textOff = end === 'start' ? g.textLeft - (g.wrap.left + B + g.fieldPx) : g.textLeft - (g.arrow.right + 2 * g.gap2)
        const pass = [...Object.values(sides), ...Object.values(vert)].every((v) => nearPx(v, inset)) && nearPx(g.box.bottom - g.box.top, g.expectTagH) && nearPx(textOff, 0)
        checks.push({ id: tag(`G-${id}-${end}`), kind: 'geom', pass,
          detail: `${g.size} 內縮應 ${fmt(inset)}:${Object.entries({ ...vert, ...sides }).map(([k, v]) => `${k} ${fmt(v)}`).join('、')};盒高 ${fmt(g.box.bottom - g.box.top)}(應 Tag 高 ${fmt(g.expectTagH)});字左緣偏移 ${fmt(textOff)}(應 0)` })
      }

      /** N:盒子底 → 框線之間(內縮那幾列,含舊線位置)沒有主色 / 錯誤色 / 焦點色;框線那一列數得到當下框色(顏色辨認是活的) */
      const noLine = (id, g, png, clip) => {
        const B = g.borderWidth
        const band = [g.box.left + 2, g.box.bottom + 0.5, g.box.right - 2, g.wrap.bottom - B]
        // 盒子貼到框內緣(沒有內縮帶)時這一段是空的:沒有地方畫線,由 G 列負責紅「盒子不是 Tag 內縮」
        const leaked = band[3] - band[1] >= 1 / dpr ? ratio(png, clip, dpr, band, [g.primaryRgb, g.errorRgb, g.outlineRgb], LINE_TOLERANCE) : 0
        const borderSeen = ratio(png, clip, dpr, [band[0], g.wrap.bottom - B, band[2], g.wrap.bottom], g.borderRgb, LINE_TOLERANCE) >= COVERAGE
        checks.push({ id: tag(`N-${id}`), kind: 'noline', pass: leaked === 0 && borderSeen,
          detail: `盒底 → 框線之間主色 / 錯誤色 / 焦點色像素比例 ${fmt(leaked)}(應 0);框線那一列${borderSeen ? '數得到' : '數不到'}框色 ${fmtRgb(g.borderRgb)}` })
      }

      /** O / F:面板開著那一端 */
      const open = async (id, scope, end, { error = false, forced = false } = {}) => {
        const fillProbe = forced ? FORCED_FILL : error ? 'var(--error-subtle)' : 'var(--primary-subtle)'
        const g = await geo(scope, end, { fillProbe, forced })
        if (g.activeEnd !== 'true') throw new InstrumentError(`${id}:點 ${end} 端之後面板沒開在這一端(data-active-end=${g.activeEnd})`)
        const fillRgb = composite(g.fillRgba, g.bgRgb)
        if (sameColor(fillRgb, g.bgRgb, FILL_TOLERANCE * 2)) throw new InstrumentError(`${id}:底色 ${fmtRgb(fillRgb)} 與欄位底色 ${fmtRgb(g.bgRgb)} 分不出來 —— 量不到`)
        const { png, clip } = await shotField(page, g)
        const filled = ratio(png, clip, dpr, fillRect(g.box, g.textLeft), fillRgb, FILL_TOLERANCE)
        const otherBare = ratio(png, clip, dpr, fillRect(g.otherBox, g.otherTextLeft), g.bgRgb, FILL_TOLERANCE)
        const noRing = g.outlineStyle === 'none' || g.outlineWidth === 0
        checks.push({ id: tag(`${forced ? 'F' : 'O'}-${id}-${end}`), kind: 'fill', error, forced,
          pass: filled >= COVERAGE && otherBare >= COVERAGE && noRing,
          detail: `${end} 端盒子底色 ${fmtRgb(fillRgb)} 覆蓋 ${fmt(filled)}(應 ≥ ${COVERAGE})、另一顆沒鋪 ${fmt(otherBare)}、作用端${noRing ? '沒有' : '有'}焦點框(焦點應在日曆)` })
        if (!forced) {
          // 錯誤態不量開著的外框:錯誤紅框不分開著關著(Field state machine),由同一欄的對照列(沒聚焦時外框是錯誤紅)與 field-open-border-invariant 管;
          // 量了也沒有任何本元件的單一根因能讓它紅(拿掉「浮層開著」記號時錯誤框照樣紅)= 零證據的綠燈
          if (!error) {
            const lit = ratio(png, clip, dpr, frameRect(g), g.primaryRgb, LINE_TOLERANCE) >= COVERAGE
            checks.push({ id: tag(`OF-${id}-${end}`), kind: 'oframe', pass: lit, detail: `面板開著外框${lit ? '' : '不'}是主色` })
          }
          noLine(`${id}-${end}-open`, g, png, clip)
        }
        return { g, fillRgb }
      }

      /** H:面板開著時滑到另一端 —— 另一端不鋪底、作用端照鋪、外框照舊 */
      const hoverOther = async (id, scope, end, fillRgb) => {
        await page.locator(`${scope} button[aria-haspopup="dialog"]`).nth(end === 'start' ? 1 : 0).hover({ timeout: WAIT_CAP_MS })
        await d.settle()
        const g = await geo(scope, end)
        const { png, clip } = await shotField(page, g)
        const still = ratio(png, clip, dpr, fillRect(g.box, g.textLeft), fillRgb, FILL_TOLERANCE)
        const otherBare = ratio(png, clip, dpr, fillRect(g.otherBox, g.otherTextLeft), g.bgRgb, FILL_TOLERANCE)
        const lit = ratio(png, clip, dpr, frameRect(g), g.primaryRgb, LINE_TOLERANCE) >= COVERAGE
        checks.push({ id: tag(`H-${id}-${end}`), kind: 'hover', pass: still >= COVERAGE && otherBare >= COVERAGE && lit,
          detail: `開著 ${end} 端、滑到另一端:作用端底色覆蓋 ${fmt(still)}、被滑過那一顆沒鋪 ${fmt(otherBare)}、外框${lit ? '' : '不'}是主色` })
        await parkPointer(page)
        await d.settle()
      }

      /** K / FK:面板關著、鍵盤停在那一顆 */
      const keyboard = async (id, scope, end, { error = false, forced = false } = {}) => {
        const g = await geo(scope, end, { forced })
        if (!g.focused || !g.focusVisible) throw new InstrumentError(`${id}:焦點不在 ${end} 端(或不是可見焦點)`)
        if (!forced && sameColor(g.outlineRgb, g.bgRgb, LINE_TOLERANCE)) throw new InstrumentError(`${id}:焦點框顏色 ${fmtRgb(g.outlineRgb)} 與底色分不出來 —— 量不到`)
        const { png, clip } = await shotField(page, g)
        // 一般模式:框帶像素 = computed outline 顏色;高對比模式:outline 顏色由瀏覽器換成系統色,量「框帶不是底色」
        const band = (b) => (forced ? 1 - ratio(png, clip, dpr, ringRect(b), g.bgRgb, LINE_TOLERANCE) : ratio(png, clip, dpr, ringRect(b), g.outlineRgb, LINE_TOLERANCE))
        const ring = band(g.box), otherRing = band(g.otherBox)
        const bare = ratio(png, clip, dpr, fillRect(g.box, g.textLeft), g.bgRgb, FILL_TOLERANCE)
        const shape = g.outlineStyle === 'solid' && nearPx(g.outlineWidth, 2) && nearPx(g.outlineOffset, -2)
        checks.push({ id: tag(`${forced ? 'FK' : 'K'}-${id}-${end}`), kind: 'ring', forced,
          pass: shape && ring >= COVERAGE && otherRing < OTHER_MAX && bare >= COVERAGE,
          detail: `${end} 端焦點框 ${g.outlineStyle} ${g.outlineWidth}px offset ${g.outlineOffset}(應 solid 2 / −2)、框帶${forced ? '有墨' : ` ${fmtRgb(g.outlineRgb)}`} ${fmt(ring)}、另一顆 ${fmt(otherRing)}、盒內沒鋪底 ${fmt(bare)}` })
        if (!forced) {
          const lit = ratio(png, clip, dpr, frameRect(g), error ? g.errorRgb : g.primaryRgb, LINE_TOLERANCE) >= COVERAGE
          checks.push({ id: tag(`KF-${id}-${end}`), kind: 'kframe', size: g.size, pass: lit, detail: `鍵盤停在 ${end} 端時外框${lit ? '' : '不'}是${frameName(error)}(選項 (i):框中框)` })
          noLine(`${id}-${end}-keyboard`, g, png, clip)
        }
        return g
      }
      const shoot = async (name, g) => {
        if (!SHOT_DIR || dpr !== 2) return
        mkdirSync(SHOT_DIR, { recursive: true })
        const file = resolve(SHOT_DIR, `datepicker-range-active-end-${name}.png`)
        const pad = 12
        await page.screenshot({ path: file, clip: { x: g.wrap.left - pad, y: g.wrap.top - pad, width: g.wrap.right - g.wrap.left + pad * 2, height: g.wrap.bottom - g.wrap.top + pad * 2 } })
        console.log(`  (畫面:${file})`)
      }
      const clickEnd = async (scope, end) => {
        await page.click(`${scope} button[aria-label="${PLACEHOLDER[end === 'start' ? 0 : 1]}"]`, { timeout: WAIT_CAP_MS })
        await d.settle(); await parkPointer(page); await d.settle()
      }

      for (const c of CASES) {
        if (only && !only.cases.includes(c.id)) continue
        const scope = caseScope(c.id)
        await parkPointer(page)
        for (const end of ENDS) await idle(c.id, scope, end, { error: !!c.error })
        // 鍵盤:從前一個控件 Tab 進來 = 起始端;再 Tab = 結束端(面板關著,框來自 focus-visible)
        await d.focus(`[data-before="${c.id}"]`)
        for (const end of ENDS) {
          await d.press('Tab')
          const g = await keyboard(c.id, scope, end, { error: !!c.error })
          if (end === 'start' && SHOT_CASES.includes(c.id)) await shoot(`${c.id}-keyboard`, g)
          if (c.long) {
            const ink = await countSpill(page, g)
            const truncated = g.scrollWidth > g.clientWidth + 1
            checks.push({ id: tag(`T-${c.id}-${end}`), kind: 'truncate', pass: truncated && g.textOverflow === 'ellipsis' && ink === 0,
              detail: `scrollWidth ${g.scrollWidth} / clientWidth ${g.clientWidth}、text-overflow ${g.textOverflow}、盒子外那條縫墨點 ${ink}` })
          }
        }
        // 點開面板:底色來自 data-active-end(滑鼠點,焦點進日曆)
        if (!c.long) {
          for (const end of ENDS) {
            await clickEnd(scope, end)
            const { g, fillRgb } = await open(c.id, scope, end, { error: !!c.error })
            if (end === 'start' && SHOT_CASES.includes(c.id)) await shoot(`${c.id}-open`, g)
            if (HOVER_CASES.includes(c.id)) await hoverOther(c.id, scope, end, fillRgb)
            await d.press('Escape')
          }
        }
      }

      // 高對比模式(forced-colors):開著那一端鋪 Highlight;鍵盤那一顆照畫焦點框
      if (!only || only.forced) {
        const scope = caseScope(FORCED_CASE)
        await page.emulateMedia({ forcedColors: 'active' })
        await d.settle(); await parkPointer(page)
        await d.focus(`[data-before="${FORCED_CASE}"]`)
        for (const end of ENDS) {
          await d.press('Tab')
          const g = await keyboard(FORCED_CASE, scope, end, { forced: true })
          if (end === 'start') await shoot(`${FORCED_CASE}-forced-keyboard`, g)
        }
        for (const end of ENDS) {
          await clickEnd(scope, end)
          const { g } = await open(FORCED_CASE, scope, end, { forced: true })
          if (end === 'start') await shoot(`${FORCED_CASE}-forced-open`, g)
          await d.press('Escape')
        }
        await page.emulateMedia({ forcedColors: 'none' })
        await d.settle()
      }

      // Calendar 詳情時間欄:點事件開詳情 → 點時間欄進編輯(點一下就開好日期面板,DatePicker.Range defaultOpen)→ Esc 收起 → 逐端點開
      // (面板開著時直接點起訖鈕 = 點在面板外,Radix 先關再開,量到的是動畫中間)
      if (!only || only.calendar) {
      await d.click(`[data-calendar-event-id="${CAL_EVENT}"]`)
      await d.waitFor(() => !!document.querySelector('[data-calendar-event-detail][data-state="open"]'), '事件詳情打開')
      await d.click(`${CAL_SCOPE} button`)
      const rangeBtns = `${CAL_SCOPE} button[aria-haspopup="dialog"]`
      await page.waitForFunction((s) => document.querySelectorAll(s).length === 2, rangeBtns, { timeout: WAIT_CAP_MS })
        .catch(() => { throw new InstrumentError('Calendar 詳情:時間欄沒進編輯(等不到 DatePicker.Range 兩端)') })
      await page.waitForSelector('[role="dialog"][aria-label="日期區間選擇"]', { timeout: WAIT_CAP_MS })
        .catch(() => { throw new InstrumentError('Calendar 詳情:點時間欄進編輯後日期面板沒開(應點一下就開)') })
      await d.press('Escape')
      await page.waitForFunction((s) => !document.querySelector('[role="dialog"][aria-label="日期區間選擇"]') && document.querySelectorAll(s).length === 2, rangeBtns, { timeout: WAIT_CAP_MS })
        .catch(() => { throw new InstrumentError('Calendar 詳情:Esc 後日期面板沒收起 / 時間欄離開了編輯') })
      for (const end of ENDS) {
        await page.locator(rangeBtns).nth(end === 'start' ? 0 : 1).click({ timeout: WAIT_CAP_MS })
          .catch(() => { throw new InstrumentError(`Calendar 詳情:點不到 ${end} 端`) })
        await d.settle(); await parkPointer(page); await d.settle()
        const { g } = await open('calendar-detail', CAL_SCOPE, end)
        if (end === 'start') await shoot('calendar-detail-open', g)
        await d.press('Escape')
      }
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

async function runVariant(label, mutateFactory, only = null) {
  const checks = []
  for (const dpr of DPRS) checks.push(...await runOnce(dpr, mutateFactory?.(), only))
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
  console.log(`  ${controls.every((c) => c.pass) ? '✓' : '✗'} [對照] 沒聚焦、面板沒開:不鋪底、不畫框、外框一般框色:${controls.filter((c) => c.pass).length}/${controls.length}`)
}
const redIds = (checks) => checks.filter((c) => !c.pass).map((c) => c.id).sort()
/** 判定紅的那一行 —— 判定模式與 selftest 基準共用(npm 別名與 CI 只跑 --selftest,基準紅就是產品裁決,不能只印「量具不可信」) */
const verdictRedLine = (red) => `\n✗ 日期區間作用端:${red.length} 列不符(${red.join(' / ')})—— SSOT date-picker.spec.md「Active-end 機制」視覺指示(Tag 內縮盒子、開著淺藍底、鍵盤自己的焦點框 + 外框主色、沒有線)`

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
      const by = (k) => contract.filter((c) => c.kind === k).length
      console.log(`\n✓ 日期區間作用端:${contract.length} 列全綠(幾何 ${by('geom')}、開著底色 ${by('fill')}、開著外框 ${by('oframe')}、滑過 ${by('hover')}、鍵盤焦點框 ${by('ring')}、`
        + `鍵盤外框 ${by('kframe')}、沒有線 ${by('noline')}、截斷 ${by('truncate')};像素比 ${DPRS.join(' / ')}),對照 ${result.checks.length - contract.length} 列綠`)
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
    for (const m of MUTANTS) if (!contract.some(m.redWhen)) problems.push(`突變 ${m.id} 的「該紅」集合是空的 —— 對照組沒有作用`)
    const covered = new Set()
    for (const m of MUTANTS) {
      let result
      try {
        result = await runVariant(`突變 ${m.id}:${m.what}${m.scope ? `(只跑 ${m.scope.cases.join(' / ')}${m.scope.forced ? ' + 高對比' : ''})` : ''}`,
          () => mutantFor(SOURCE_ROOT, MUTANT_FILE, m.apply), m.scope ?? null)
      } catch (error) {
        if (error instanceof InstrumentError) error.message = `突變 ${m.id}:${error.message}`
        throw error
      }
      report(result)
      const red = redIds(result.checks)
      // 這一趟實際量到的列(帶 scope 的突變只跑幾欄):該紅 = 其中符合 redWhen 的;列 id 必須都是基準那一趟有的
      const ran = new Set(result.checks.map((c) => c.id))
      const stray = [...ran].filter((id) => !baseline.checks.some((c) => c.id === id))
      if (stray.length) problems.push(`${m.id}:量到基準沒有的列 ${stray.slice(0, 5).join(' / ')} —— 列 id 不穩定,無法比對`)
      const ranContract = contract.filter((c) => ran.has(c.id))
      const want = ranContract.filter(m.redWhen).map((c) => c.id).sort()
      if (m.scope && ranContract.length === want.length) problems.push(`${m.id}:範圍裡沒有不該紅的列 —— 看不出它有沒有多紅`)
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

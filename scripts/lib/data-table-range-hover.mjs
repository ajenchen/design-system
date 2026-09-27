// ═══════════════════════════════════════════════════════════════════════════
// DataTable 區間格 × 列滑過:兩個主題都釘住 —— 量測與判定的**唯一實作**
// ═══════════════════════════════════════════════════════════════════════════
//
// 要保證的性質(逐字,待辦總帳 C12⑦ / C1 K16,2026-09-25):
//   區間格(`[data-range-cell]`,`--primary-subtle`)在它那一列被滑過時,畫面上的顏色**不變**,淺色與深色都一樣。
// 為什麼要專門量:淺色的 `--primary-subtle`(blue-1)是不透明色票,列的滑過層蓋不到;深色的 step-1 是 alpha 公式,
// 列的 `--neutral-hover` 會從底下透上來(R11 實測:淺 #E3F1FF 不變、深 #1C304A → #243851)—— 兩個主題行為不一致,
// 而且**只在深色看得到**,只跑淺色的閘結構上抓不到。修法在 `data-table.css`(含區間格的列被滑過時,滑過層改畫在非區間格上)。
//
// 儀器的對照(M32:綠燈要先證明它會紅):
//   - 同一列的非區間格必須**有**變色 —— 否則儀器根本看不到列滑過,「區間格沒變」是零證據(instrument)
//   - 那一列必須真的帶 `data-hovered`、區間必須真的建立(≥ 3 格)、主題必須真的切到 —— 任一不成立 = 儀器失效
//   - 每個取樣點都要證明「那個像素是那一格自己的底」:指標點到的元素是那一格,或是它底下沒有自己底色的子孫
//   - 非區間格的滑過色必須等於**沒有區間的列**的滑過色 —— 修法把滑過層從列搬到格子上,不准順手改掉一般格的樣子
//
// 使用者:scripts/data-table-invariants.mjs 的 I31(CI 必跑)。對照組:判定表在 scripts/test-data-table-range-hover.mjs。

import { PNG } from 'pngjs'
import { openStory } from './launch-browser.mjs'

export const RANGE_HOVER_STORY = 'design-system-components-datatable-展示--inline-edit-with-spreadsheet-overlay'
/** 區間格「沒變」的容差(每個通道,8-bit):只吸收編碼誤差 */
export const PIN_TOLERANCE = 1
/** 儀器「看得到列滑過」的下限:非區間格滑過前後至少要差這麼多(淺色 #FFFFFF→#FAFAFA = 5) */
export const HOVER_VISIBLE_MIN = 3

/** 每通道最大差 */
export const channelDistance = (a, b) => (a && b ? Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) : Number.POSITIVE_INFINITY)
const hex = (p) => (p ? `#${p.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}` : '(無)')

/**
 * 判定(純函式)。**儀器失效優先於產品裁決**:看不到列滑過時,區間格「沒變」不能算通過,「變了」也不能拿去指控產品。
 * @param {object} m measureRangeHoverPin 的回傳
 * @returns {{ verdict: 'pass' | 'fail' | 'instrument', problems: string[] }}
 */
export function rangeHoverPinVerdict(m) {
  const instrument = []
  if (!m || typeof m !== 'object') return { verdict: 'instrument', problems: ['沒有量測結果'] }
  if (m.themeRead !== m.theme) instrument.push(`主題沒切到(要 ${m.theme},實得 ${m.themeRead})`)
  if (!(m.rangeCount >= 3)) instrument.push(`區間沒建立(區間格 ${m.rangeCount} 個,需 ≥ 3)`)
  if (m.rowHovered !== true) instrument.push('被量的那一列沒有帶 data-hovered(指標沒進到列裡)')
  if (m.referenceHovered !== true) instrument.push('對照列沒有帶 data-hovered')
  if (!Array.isArray(m.unowned) || m.unowned.length) instrument.push(`取樣點不屬於那一格自己的底:${(m.unowned || ['(未量)']).join('、')}`)
  const controlDelta = channelDistance(m.controlRest, m.controlHover)
  if (!(controlDelta >= HOVER_VISIBLE_MIN)) {
    instrument.push(`同一列的非區間格滑過前後沒有變色(${hex(m.controlRest)} → ${hex(m.controlHover)})—— 儀器看不到列滑過,區間格「沒變」是零證據`)
  }
  if (instrument.length) return { verdict: 'instrument', problems: instrument }
  const problems = []
  const rangeDelta = channelDistance(m.rangeRest, m.rangeHover)
  if (rangeDelta > PIN_TOLERANCE) problems.push(`區間格在列被滑過時變色 ${hex(m.rangeRest)} → ${hex(m.rangeHover)}(${m.theme};應釘住)`)
  const refDelta = channelDistance(m.controlHover, m.referenceHover)
  if (refDelta > PIN_TOLERANCE) problems.push(`含區間的列上,非區間格的滑過色 ${hex(m.controlHover)} ≠ 沒有區間的列 ${hex(m.referenceHover)}(${m.theme};修法不得改掉一般格的樣子)`)
  return { verdict: problems.length ? 'fail' : 'pass', problems }
}

/** 取一個像素(CSS px,deviceScaleFactor = 1) */
async function pixelAt(page, x, y) {
  const buf = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } })
  const png = PNG.sync.read(buf)
  return [png.data[0], png.data[1], png.data[2]]
}

/** 兩個影格:滑過樣式寫進 DOM 之後,讓合成器真的畫出一幀再取樣 */
const twoFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

/**
 * 量一個主題。回傳原始量測,判定交給 rangeHoverPinVerdict。
 * 開不起來 → openStory 丟 StoryRenderInstrumentError(呼叫端照既有規則處理成儀器失效)。
 * @param {import('playwright').Page} page viewport 寬至少 1280(表格要放得下六欄)
 * @param {object} o
 * @param {string} o.origin 靜態伺服器 origin
 * @param {'light'|'dark'} o.theme
 * @param {string[]} [o.notFound] 伺服器 404 帳本
 * @param {(page) => Promise<void>} [o.beforeMeasure] 對照組用:開好 story 之後、量之前注入(例:把釘住的規則拆掉)
 */
export async function measureRangeHoverPin(page, { origin, theme, notFound = null, beforeMeasure = null }) {
  await openStory(page, `${origin}/iframe.html?id=${encodeURIComponent(RANGE_HOVER_STORY)}&viewMode=story&globals=theme:${theme}`, {
    waitFor: '[role="row"][data-row-index="3"] [role="gridcell"]', settleFrames: 10, notFound,
  })
  if (beforeMeasure) await beforeMeasure(page)
  const themeRead = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || '(none)')

  // 幾何:第 r 列第 c 格(同一個 story 只有中間面板)
  const cellBox = (r, c) => page.evaluate(([r, c]) => {
    const row = document.querySelector(`[role="row"][data-row-index="${r}"]`)
    const cell = row?.querySelectorAll(':scope > [role="gridcell"]')[c]
    if (!cell) return null
    const b = cell.getBoundingClientRect()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  }, [r, c])
  const park = async () => {
    const vp = page.viewportSize()
    await page.mouse.move(vp.width - 2, vp.height - 2)
    await page.waitForFunction(() => !document.querySelector('[data-hovered]'), null, { timeout: 5000 }).catch(() => {})
    await twoFrames(page)
  }
  const hoverRow = async (r, box) => {
    await page.mouse.move(box.x + 8, box.y + box.h / 2)
    const ok = await page.waitForFunction((r) => document.querySelector(`[role="row"][data-row-index="${r}"]`)?.hasAttribute('data-hovered'), r, { timeout: 5000 })
      .then(() => true, () => false)
    await twoFrames(page)
    return ok
  }

  // 1. 建立區間:Product 欄(第 1 格)第 0 列點一下,Shift+點第 2 列 → 3 格區間
  const a = await cellBox(0, 1)
  const b = await cellBox(2, 1)
  if (!a || !b) return { theme, themeRead, rangeCount: 0, unowned: ['找不到第 0 / 2 列的 Product 格'] }
  await page.mouse.click(a.x + a.w / 2, a.y + a.h / 2)
  await page.keyboard.down('Shift')
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2)
  await page.keyboard.up('Shift')
  const rangeCount = await page.waitForFunction(() => document.querySelectorAll('[data-range-cell]').length >= 3, null, { timeout: 5000 })
    .then(() => page.evaluate(() => document.querySelectorAll('[data-range-cell]').length), () => page.evaluate(() => document.querySelectorAll('[data-range-cell]').length))

  // 2. 取樣點:各格右上角的留白(右緣內縮 5、上緣內縮 4 —— 避開右側 1px 格線與文字)
  //    range   = 第 1 列 Product(區間中段,不是錨點也不是終點,沒有選取框)
  //    control = 第 1 列 SKU(唯讀,沒有 hover 框;與區間格同一列)
  //    ref     = 第 3 列 SKU(不在區間裡的列;這則 story 只有 4 列)
  const rc = await cellBox(1, 1)
  const cc = await cellBox(1, 0)
  const fc = await cellBox(3, 0)
  const pt = (box) => [box.x + box.w - 5, box.y + 4]
  const points = { range: [1, 1, pt(rc)], control: [1, 0, pt(cc)], reference: [3, 0, pt(fc)] }

  // 3. 每個取樣點都要屬於那一格自己的底:指標點到的是那一格,或是它底下沒有自己底色的子孫
  const unowned = await page.evaluate((points) => {
    const out = []
    for (const [name, [r, c, [x, y]]] of Object.entries(points)) {
      const cell = document.querySelector(`[role="row"][data-row-index="${r}"]`)?.querySelectorAll(':scope > [role="gridcell"]')[c]
      let el = document.elementFromPoint(x, y)
      if (!cell || !el || !cell.contains(el)) { out.push(`${name}(點到的不是那一格:${el ? el.tagName : '無'})`); continue }
      while (el && el !== cell) {
        const cs = getComputedStyle(el)
        if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') { out.push(`${name}(子孫 ${el.tagName} 自己有底色)`); break }
        el = el.parentElement
      }
    }
    return out
  }, points)

  await park()
  const rangeRest = await pixelAt(page, ...points.range[2])
  const controlRest = await pixelAt(page, ...points.control[2])
  const rowHovered = await hoverRow(1, cc)
  const rangeHover = await pixelAt(page, ...points.range[2])
  const controlHover = await pixelAt(page, ...points.control[2])
  await park()
  const referenceHovered = await hoverRow(3, fc)
  const referenceHover = await pixelAt(page, ...points.reference[2])
  await park()
  return { theme, themeRead, rangeCount, unowned, rowHovered, referenceHovered, rangeRest, rangeHover, controlRest, controlHover, referenceHover }
}

export const formatPixel = hex

/**
 * I31 的判定表(唯一住所;scripts/data-table-invariants.mjs 每次跑 I31 前先跑一遍,scripts/test-data-table-range-hover.mjs 單獨跑)。
 * 像素**全部來自 2026-09-25 的實測**(同一份 storybook-static,就地編輯 + 試算表浮層):
 *   A 現況(釘住規則尚未進建置):淺 pass、深 fail(#1C304A → #243851,與 R11 一致)
 *   B 注入 data-table.css 的釘住規則:兩主題 pass
 *   C 把列滑過整個拿掉:兩主題 instrument(區間格「沒變」不能算通過)
 * 另加容差邊界、對照列不同色、欄位缺漏。
 * @returns {Array<[string, object|null, 'pass'|'fail'|'instrument']>}
 */
export function rangeHoverVerdictCases() {
  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const base = (theme, over = {}) => ({
    theme, themeRead: theme, rangeCount: 3, unowned: [], rowHovered: true, referenceHovered: true, ...over,
  })
  const LIGHT = { rangeRest: hex('#E3F1FF'), rangeHover: hex('#E3F1FF'), controlRest: hex('#FFFFFF'), controlHover: hex('#FAFAFA'), referenceHover: hex('#FAFAFA') }
  const DARK_PINNED = { rangeRest: hex('#1C304A'), rangeHover: hex('#1C304A'), controlRest: hex('#1D1D1D'), controlHover: hex('#262626'), referenceHover: hex('#262626') }

  return [
    ['A 現況 淺色(不透明 blue-1,本來就蓋得住)', base('light', LIGHT), 'pass'],
    ['A 現況 深色(列滑過透上來 #1C304A → #243851;K16 本身)', base('dark', { ...DARK_PINNED, rangeHover: hex('#243851') }), 'fail'],
    ['B 釘住規則 淺色', base('light', LIGHT), 'pass'],
    ['B 釘住規則 深色', base('dark', DARK_PINNED), 'pass'],
    ['C 拿掉列滑過 淺色(非區間格沒變 → 儀器看不到)', base('light', { ...LIGHT, controlHover: hex('#FFFFFF'), referenceHover: hex('#FFFFFF') }), 'instrument'],
    ['C 拿掉列滑過 深色', base('dark', { ...DARK_PINNED, controlHover: hex('#1D1D1D'), referenceHover: hex('#1D1D1D') }), 'instrument'],
    ['容差內(編碼誤差 1)仍算釘住', base('dark', { ...DARK_PINNED, rangeHover: [0x1D, 0x30, 0x4A] }), 'pass'],
    ['超過容差 2 就算沒釘住', base('dark', { ...DARK_PINNED, rangeHover: [0x1E, 0x30, 0x4A] }), 'fail'],
    ['修法順手改掉一般格的滑過色(與沒有區間的列不同)', base('dark', { ...DARK_PINNED, controlHover: hex('#2F2F2F') }), 'fail'],
    ['列沒帶 data-hovered → 儀器', base('dark', { ...DARK_PINNED, rowHovered: false }), 'instrument'],
    ['主題沒切到 → 儀器', base('dark', { ...DARK_PINNED, themeRead: 'light' }), 'instrument'],
    ['區間沒建立 → 儀器', base('dark', { ...DARK_PINNED, rangeCount: 0 }), 'instrument'],
    ['取樣點被子孫的底蓋住 → 儀器', base('dark', { ...DARK_PINNED, unowned: ['range(子孫 DIV 自己有底色)'] }), 'instrument'],
    ['取樣點清單缺席(沒量)→ 儀器,不得當成「沒有問題」', base('dark', { ...DARK_PINNED, unowned: undefined }), 'instrument'],
    ['儀器失效優先:看不到滑過時,區間格變色也不拿去指控產品', base('dark', { ...DARK_PINNED, rangeHover: hex('#243851'), controlHover: hex('#1D1D1D') }), 'instrument'],
    ['沒有量測結果 → 儀器', null, 'instrument'],
  ]
}

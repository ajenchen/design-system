// ═══════════════════════════════════════════════════════════════════════════
// visual-audit 幾何 / 顏色斷言:**契約 + 讀值 + 判定**(scripts/visual-audit.mjs 只負責開 story 與呼叫)
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼抽出來**(2026-09-29,待辦總帳 OE8;2026-09-27 起草、未納入):斷言引擎從 2026-09-12 起有兩個查實的缺陷,
// 一直沒有對照組能證明它「在該紅的時候會紅、該放的時候會放」(M32「儀器要先有對照組」):
//   1. `padding4Sided` 只把四邊互比全等 —— Field 家族(水平有 padding、垂直靠 flex 置中,實測 Input 控件 `0 12 0 12`)
//      恆假紅;規格文件宣稱的 `symmetric` 選項**根本沒實作**(`grep -n symmetric visual-audit.mjs` = 0 命中)。
//      而且只量 `$eval` 選到的第一個元素 —— 選到十顆只看第一顆。
//   2. `gap` 用 `parseFloat(getComputedStyle(el).gap) || 0`:grid 只設 column-gap 時 computed 逐字回 `"normal 12px"`
//      (實測 Field horizontal `grid gap-x-3`)→ parseFloat NaN → `|| 0` → 0 → **必假紅**;row / column 不同值
//      (`"8px 16px"`)則只讀到 row。「沒讀到」被讀成「0」正是 M37 第八個形狀。
// 判定抽成純函式後,判定表(scripts/test-visual-audit.mjs)可以不開 Storybook 就證明兩面;讀值(readGeometryInPage)
// 用合成 DOM 在真瀏覽器裡驗。
//
// 契約(visual-assertions.json 的 `assertions[]`;未知 type / 欄位一律在載入時 fail-closed,不靠引擎吞):
//   equalHeight   { name, selector }                                   選到的每個元素高度都與第一個相等(±0.5px)
//   padding4Sided { name, selector, symmetric?, expected? }            symmetric:'all'(預設)| 'horizontal'(左=右)| 'vertical'(上=下);
//                                                                       expected 給了就再要求那幾邊 = expected(±0.5px)
//   gap           { name, selector, expected, axis? }                  axis:'both'(預設,row 與 column 都要 = expected)| 'row' | 'column';
//                                                                       逐軸讀 row-gap / column-gap;computed 的 `normal`(flex / grid 沒設那一軸)讀成 0 —— 那一軸畫出來就是 0
//   color         { name, selector, property, expected }               property 限 COLOR_PROPERTIES;expected 任何 CSS 顏色寫法(hex / rgb / oklch …),
//                                                                       瀏覽器端用 1×1 canvas 畫一次讀回 sRGB 8-bit(`#rrggbb`,半透明加 `/0.45`)再逐字比
// 每一條都對**選到的全部元素**判(不再只量第一個);選不到任何元素 = `selectorMissing` 違規(2026-09-12 起的既有語意)。
//
// 場景層另有 `globals`(Storybook 全域 toolbar,對齊 packages/storybook-config/preview.tsx 的 globalTypes):
//   globals { theme?: 'light' | 'dark', density?: 'md' | 'lg' }        同一則 story 用不同主題 / 密度再拍一張(檔名另取,基準圖另一槽);
//                                                                       未知 global / 未知值在載入時就停 —— 2026-09-29 實測:`theme:hc` 會被 preview.tsx
//                                                                       照寫成 `<html data-theme="hc">`,但 CSS 沒有那套 token,畫面仍是淺色;不認得的
//                                                                       global(`dir:rtl`)則被 Storybook 靜默忽略。兩種都是拍到淺色卻當成別的(2026-06-11 假覆蓋)

const GEOMETRY_ASSERTION_TOLERANCE_PX = 0.5

export const GEOMETRY_TYPES = Object.freeze(['equalHeight', 'padding4Sided', 'gap', 'color'])
export const PADDING_SYMMETRY = Object.freeze(['all', 'horizontal', 'vertical'])
export const GAP_AXES = Object.freeze(['both', 'row', 'column'])
export const COLOR_PROPERTIES = Object.freeze([
  'backgroundColor', 'color',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'fill', 'stroke',
])
/** Storybook globals 的封閉值域(preview.tsx globalTypes 真值:theme light/dark × density md/lg;沒有 hc、沒有 rtl) */
export const STORYBOOK_GLOBALS = Object.freeze({
  theme: Object.freeze(['light', 'dark']),
  density: Object.freeze(['md', 'lg']),
})

// 每種 type 允許的欄位(name / type / selector / rationale 之外)
const EXTRA_KEYS = {
  equalHeight: [],
  padding4Sided: ['symmetric', 'expected'],
  gap: ['expected', 'axis'],
  color: ['property', 'expected'],
}
const COMMON_KEYS = ['name', 'type', 'selector', 'rationale']

function fail(message) {
  throw new Error(`visual geometry assertion contract:${message}`)
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0 && value === value.trim()

/**
 * 驗證並補預設值(載入 visual-assertions.json 時呼叫;壞契約在這裡停,不進瀏覽器)。
 * @param {unknown} assertion
 * @param {string} [label]
 * @returns {object} 正規化後的斷言(symmetric / axis 補上預設)
 */
export function normalizeGeometryAssertion(assertion, label = 'assertion') {
  if (!isPlainObject(assertion)) fail(`${label} must be a plain object`)
  const { type } = assertion
  if (!GEOMETRY_TYPES.includes(type)) fail(`${label}.type must be one of ${GEOMETRY_TYPES.join(' / ')},got ${JSON.stringify(type)}`)
  if (!nonEmptyString(assertion.name)) fail(`${label}.name must be a non-empty string`)
  if (!nonEmptyString(assertion.selector)) fail(`${label}.selector must be a non-empty trimmed string`)
  const allowed = new Set([...COMMON_KEYS, ...EXTRA_KEYS[type]])
  const unknown = Object.keys(assertion).filter((key) => !allowed.has(key))
  if (unknown.length) fail(`${label}(${type}) has unknown keys:${unknown.join(',')}`)
  if (assertion.rationale !== undefined && typeof assertion.rationale !== 'string') fail(`${label}.rationale must be a string`)

  const out = { ...assertion }
  if (type === 'padding4Sided') {
    out.symmetric = assertion.symmetric ?? 'all'
    if (!PADDING_SYMMETRY.includes(out.symmetric)) fail(`${label}.symmetric must be one of ${PADDING_SYMMETRY.join(' / ')},got ${JSON.stringify(assertion.symmetric)}`)
    if (assertion.expected !== undefined && !isFiniteNumber(assertion.expected)) fail(`${label}.expected must be a finite number (px)`)
  } else if (type === 'gap') {
    if (!isFiniteNumber(assertion.expected)) fail(`${label}.expected must be a finite number (px)`)
    out.axis = assertion.axis ?? 'both'
    if (!GAP_AXES.includes(out.axis)) fail(`${label}.axis must be one of ${GAP_AXES.join(' / ')},got ${JSON.stringify(assertion.axis)}`)
  } else if (type === 'color') {
    if (!COLOR_PROPERTIES.includes(assertion.property)) fail(`${label}.property must be one of ${COLOR_PROPERTIES.join(' / ')},got ${JSON.stringify(assertion.property)}`)
    if (!nonEmptyString(assertion.expected)) fail(`${label}.expected must be a non-empty CSS color string`)
  }
  return Object.freeze(out)
}

/**
 * 驗證場景的 Storybook globals(theme / density);undefined = 沒指定(Storybook 用預設 light / md)。
 * @param {unknown} globals
 * @param {string} [label]
 * @returns {Readonly<{theme?: string, density?: string}> | undefined}
 */
export function normalizeScenarioGlobals(globals, label = 'scenario.globals') {
  if (globals === undefined) return undefined
  const stop = (message) => { throw new Error(`visual scenario globals contract:${message}`) }
  if (!isPlainObject(globals)) stop(`${label} must be a plain object`)
  const keys = Object.keys(globals)
  if (keys.length === 0) stop(`${label} must name at least one Storybook global (${Object.keys(STORYBOOK_GLOBALS).join(' / ')})`)
  const out = {}
  for (const key of keys) {
    const allowed = STORYBOOK_GLOBALS[key]
    if (!allowed) stop(`${label}.${key} is not a Storybook global (allowed:${Object.keys(STORYBOOK_GLOBALS).join(' / ')})—— 不認得的 global 會被 Storybook 靜默忽略、不認得的值會照寫進 data-* 但 CSS 沒有那套 token,拍到的都不是你以為的那一張`)
    if (!allowed.includes(globals[key])) stop(`${label}.${key} must be one of ${allowed.join(' / ')},got ${JSON.stringify(globals[key])}`)
    out[key] = globals[key]
  }
  return Object.freeze(out)
}

/**
 * 把 globals 組成 Storybook iframe 網址的 `&globals=theme:dark;density:md`(空物件 / undefined → 空字串)。
 * @param {{theme?: string, density?: string} | undefined} globals
 */
export function storybookGlobalsQuery(globals) {
  if (!globals) return ''
  const parts = Object.keys(STORYBOOK_GLOBALS)
    .filter((key) => globals[key] !== undefined)
    .map((key) => `${key}:${globals[key]}`)
  return parts.length ? `&globals=${parts.join(';')}` : ''
}

/** padding4Sided 這一條要比的邊(依 symmetric) */
export function paddingSidesFor(symmetric) {
  if (symmetric === 'horizontal') return ['left', 'right']
  if (symmetric === 'vertical') return ['top', 'bottom']
  return ['top', 'right', 'bottom', 'left']
}

/** gap 這一條要比的軸(依 axis) */
export function gapAxesFor(axis) {
  if (axis === 'row') return ['row']
  if (axis === 'column') return ['column']
  return ['row', 'column']
}

/**
 * **瀏覽器端**讀值:`page.$$eval(assertion.selector, readGeometryInPage, assertion)`。
 * 必須自給自足(Playwright 把函式原始碼序列化進頁面,外層的常數 / import 都拿不到)。
 * 回傳形狀 = judgeGeometryAssertion 的 `measured`:
 *   equalHeight   { elements: number[] }
 *   padding4Sided { elements: {top,right,bottom,left}[] }
 *   gap           { elements: {row: number|null, column: number|null, raw: string}[] }   null = computed `normal`
 *   color         { expected: string|null, elements: {actual: string|null, raw: string}[] }
 * @param {Element[]} els
 * @param {object} a  正規化後的斷言
 */
export function readGeometryInPage(els, a) {
  const px = (value) => { const n = parseFloat(value); return Number.isFinite(n) ? n : null }
  // gap 逐軸讀 longhand:shorthand `gap` 的 computed 是 `"normal 12px"` / `"8px 16px"`,parseFloat 只吃得到第一個字 —— 那正是被修掉的缺陷
  const gapAxis = (style, longhand) => {
    const value = style.getPropertyValue(longhand).trim()
    return value === 'normal' ? null : px(value)
  }
  if (a.type === 'equalHeight') {
    return { elements: els.map((el) => el.getBoundingClientRect().height) }
  }
  if (a.type === 'padding4Sided') {
    return {
      elements: els.map((el) => {
        const s = getComputedStyle(el)
        return { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) }
      }),
    }
  }
  if (a.type === 'gap') {
    return {
      elements: els.map((el) => {
        const s = getComputedStyle(el)
        return { row: gapAxis(s, 'row-gap'), column: gapAxis(s, 'column-gap'), raw: s.getPropertyValue('gap') }
      }),
    }
  }
  if (a.type === 'color') {
    // canvas 正規化:先用 fillStyle 判合法(不合法的值 fillStyle 不會變 —— 先設黑再設它、先設白再設它,兩次結果不同 = 沒被接受),
    // 再真的畫 1×1 像素用 getImageData 讀回 sRGB 8-bit → `#rrggbb`(有透明度時加 `/0.45`)。
    // **不能拿 fillStyle 字串當正規化結果**:本 repo 的 token 是 oklch,Chromium 的 fillStyle 會原樣回 `oklch(...)`,
    // 與 `#rrggbb` 寫的期望值永遠比不上(2026-09-29 實測);getImageData 讀回的才是兩邊共同的 sRGB。
    const probe = document.createElement('canvas')
    probe.width = probe.height = 1
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    const normalize = (value) => {
      if (typeof value !== 'string' || !value.trim()) return null
      ctx.fillStyle = '#000000'; ctx.fillStyle = value; const onBlack = ctx.fillStyle
      ctx.fillStyle = '#ffffff'; ctx.fillStyle = value; const onWhite = ctx.fillStyle
      if (onBlack !== onWhite) return null
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = value
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      const hex = `#${[d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`
      return d[3] === 255 ? hex : `${hex}/${(d[3] / 255).toFixed(2)}`
    }
    return {
      expected: normalize(a.expected),
      elements: els.map((el) => {
        const raw = getComputedStyle(el)[a.property]
        return { actual: normalize(raw), raw: String(raw ?? '') }
      }),
    }
  }
  return { elements: [] }
}

const near = (a, b) => Math.abs(a - b) <= GEOMETRY_ASSERTION_TOLERANCE_PX

/**
 * 判一條斷言(純函式,可不開瀏覽器測)。
 * @param {object} assertion  normalizeGeometryAssertion 的回傳
 * @param {{ elements: unknown[], expected?: string|null }} measured  readGeometryInPage 的回傳
 * @returns {object[]} 違規清單(空 = 通過)
 */
export function judgeGeometryAssertion(assertion, measured) {
  const a = assertion
  const elements = Array.isArray(measured?.elements) ? measured.elements : null
  if (!elements) fail(`judge ${a.name}:measured.elements must be an array`)
  const base = { assertion: a.name, type: a.type, selector: a.selector }
  if (elements.length === 0) {
    return [{ ...base, type: 'selectorMissing', error: `${a.type}: 選不到任何元素` }]
  }
  const violations = []

  if (a.type === 'equalHeight') {
    const heights = elements.map((h) => {
      if (!isFiniteNumber(h)) fail(`judge ${a.name}:equalHeight readings must be numbers`)
      return h
    })
    const first = heights[0]
    if (heights.some((h) => !near(h, first))) {
      violations.push({ ...base, matched: elements.length, expected: first, actual: heights })
    }
    return violations
  }

  if (a.type === 'padding4Sided') {
    const sides = paddingSidesFor(a.symmetric)
    elements.forEach((padding, index) => {
      if (!isPlainObject(padding) || !sides.every((side) => isFiniteNumber(padding[side]))) fail(`judge ${a.name}:padding readings must have numeric ${sides.join('/')}`)
      const values = sides.map((side) => padding[side])
      const first = values[0]
      if (values.some((v) => !near(v, first))) {
        violations.push({ ...base, index, matched: elements.length, symmetric: a.symmetric, expected: `${sides.join(' = ')}${a.expected !== undefined ? ` = ${a.expected}` : ''}`, actual: padding })
      } else if (a.expected !== undefined && !near(first, a.expected)) {
        violations.push({ ...base, index, matched: elements.length, symmetric: a.symmetric, expected: a.expected, actual: padding })
      }
    })
    return violations
  }

  if (a.type === 'gap') {
    const axes = gapAxesFor(a.axis)
    elements.forEach((gap, index) => {
      if (!isPlainObject(gap)) fail(`judge ${a.name}:gap readings must be objects`)
      for (const axis of axes) {
        const reading = gap[axis]
        if (reading !== null && !isFiniteNumber(reading)) fail(`judge ${a.name}:gap.${axis} must be a number or null (normal)`)
        // computed `normal` = 那一軸沒設 gap,flex / grid 畫出來就是 0
        const value = reading === null ? 0 : reading
        if (!near(value, a.expected)) {
          violations.push({ ...base, index, matched: elements.length, axis, expected: a.expected, actual: { row: gap.row, column: gap.column, raw: gap.raw } })
        }
      }
    })
    return violations
  }

  if (a.type === 'color') {
    const expected = measured.expected
    if (expected === null || expected === undefined) {
      return [{ ...base, property: a.property, error: `expected「${a.expected}」不是瀏覽器認得的 CSS 顏色 —— 斷言本身壞了,不算通過`, expected: a.expected }]
    }
    elements.forEach((reading, index) => {
      if (!isPlainObject(reading) || typeof reading.raw !== 'string') fail(`judge ${a.name}:color readings must be {actual, raw}`)
      if (reading.actual !== expected) {
        violations.push({ ...base, index, matched: elements.length, property: a.property, expected: a.expected, expectedNormalized: expected, actual: reading.actual, actualRaw: reading.raw })
      }
    })
    return violations
  }

  fail(`judge ${a.name}:unsupported type ${a.type}`)
  return violations
}

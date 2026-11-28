#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Calendar 元件檔(components/Calendar/*.tsx,不含 *.stories.tsx 與 `_` 開頭的示範殼)的 class 字串裡,內距 / 外距 / 間距 /
 *         寬高 / 最小最大值 / 位置 / 邊框寬一律不寫數字(`p-1.5`、`gap-0.5`、`min-h-28`、`h-6`、`border-2`)也不寫 `[Npx]`、`[Nrem]`
 *         這類任意值 —— 一律讀 token 或 Calendar 自己的元件內變數(calendar.spec.md「間距」【SPACING(定)】與「禁止事項」第 7 條)。
 *         唯一放行:工具列那一列(帶 `data-calendar-toolbar` 的元素)與它裡面 `<nav>` 上的按鈕群微距(utility-registry.json spacing.canonical_micro_geometry.gap_utilities,
 *         例 `gap-2`;那一列 2026-11-27 起 = 原本 ChromeHeader、gap-2 從 chrome-header.tsx 搬進來,calendar.spec.md「工具列」),
 *         只在這兩個元素的 className 上算數,搬到別的元素就紅。另核對三件事:
 *         (1) calendar-geometry.ts 的列高 `CALENDAR_ROW_HEIGHT_PX` 與 tag.tsx 的 `TAG_HEIGHT_PX.md` 同值(雙生常數:Calendar 不 import tag.tsx,
 *             免得整個 Tag 模組進 Calendar 的包;值由本閘從 tag.tsx 讀出來比),
 *             空隙 = 4、文字內距 = 2 × 空隙、格線 = 1(Tailwind `border` 預設寬;本閘禁數字型邊框寬,格子的 `border-b` 只可能是它)、
 *             格最小高 = 3 × 空隙 + 2 × 列高 + 格線(格子是 border-box、底線在格高裡;算出來比對,Tag 盒高從 tag.tsx 讀);
 *         (2) class 裡讀到的每一個 `var(--calendar-*)` 都在 `CALENDAR_GEOMETRY_STYLE` 有設值(沒設值的 var 讓整條宣告靜默失效);
 *         (3) calendar.tsx 的根節點(展開 `{...props}`、接住 consumer props 的那個元素)真的把 `CALENDAR_GEOMETRY_STYLE` 設在 style 上
 *             —— 別的檔有設不算(2026-11-26 起「+N」清單浮層 calendar-more-list.tsx 在 Portal 上也設一次,只問「任一檔有設」會漏掉根節點);
 *         (4) 有時段事件的色條(calendar.spec.md「事件的兩種長相」「間距」有時段的色條列;2026-11-25 事件長相那一包):
 *             色條寬常數 `CALENDAR_ACCENT_WIDTH_PX` = 4(= Tag 的「Tag px」),而且「色條寬 + 間隔(空隙)= 文字內距」(字左緣與全天長條同一條線);
 *             calendar.tsx 有元素的寬讀 `w-[var(--calendar-accent-w)]`(色條寬只從常數來);
 *             類別色表(tokens/categorical-color.ts 的 `CAT_ACCENT` 12 色相 + `CAT_EVENT_NEUTRAL.accent`)只給顏色 —— 每個 class 都是
 *             `bg-[var(--color-…)]`,不得含寬度、邊框或任何尺寸(2026-11-25 前是 `border-l-[3px] border-[var(--color-X-6)]`)。
 *   紅: --selftest(與配對測試 scripts/test-calendar-geometry-invariant.mjs 的實檔突變)逐一注入 `p-1.5`、`gap-0.5`、`min-h-28`、
 *       `border-l-[3px]`、把列高改成 20、格最小高沒算格線、把 `gap-2` 搬到非 `<nav>` 的元素、class 讀一個沒設值的 `--calendar-*`、拿掉根節點的 style、
 *       色表 CAT_ACCENT 恢復 `border-l-[3px]`、色條寬寫死 `w-1`、色條寬常數改成 3,每一個都必須被指名(檔:行 + 該 class / 常數)並 exit 1。
 *   綠: 現況 0 命中時 exit 0;註解裡提到的舊 class(例「2026-11-25 前是 p-1.5」)不算 —— 只看 TypeScript 語法樹裡的字串字面值。
 *       純靜態讀檔、不讀時間,重複跑結果相同。掃描母體 0 個檔(路徑錯)、讀不到 CAT_ACCENT = 儀器失效 exit 2,不讀成通過。
 *   不涵蓋: 畫出來的像素由 scripts/calendar-month-invariant.mjs 在瀏覽器量(M32:class 對了 ≠ 畫對了;色條寬 4、高 = 字高、字左緣兩種長相相同都在那裡量)。
 */
// 用法:node scripts/calendar-geometry-invariant.mjs [--root <dir>] [--selftest]
//   --root 只給配對測試用(複製出來的一份 repo 子集);CI 一律不帶。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argValue = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null }
const ROOT = path.resolve(argValue('--root') ?? REPO)
const SELFTEST = process.argv.includes('--selftest')

export const CALENDAR_DIR = 'packages/design-system/src/components/Calendar'
export const GEOMETRY_FILE = `${CALENDAR_DIR}/calendar-geometry.ts`
export const TAG_FILE = 'packages/design-system/src/components/Tag/tag.tsx'
export const UTILITY_REGISTRY = 'packages/design-system/src/tokens/utility-registry.json'
export const CATEGORICAL_FILE = 'packages/design-system/src/tokens/categorical-color.ts'
/** calendar.spec.md「間距」:格內所有空隙 = 4 */
export const SPEC_GAP_PX = 4
/** calendar.spec.md「間距」有時段的色條:色條寬 4(佔 Tag 的「Tag px」那 4) */
export const SPEC_ACCENT_PX = 4
/** 色條的 class 一律讀這個元件內變數(值 = calendar-geometry.ts CALENDAR_ACCENT_WIDTH_PX) */
export const ACCENT_WIDTH_CLASS = 'w-[var(--calendar-accent-w)]'
/** 類別色表的色條只給顏色:每個 class 都是背景色 `bg-[var(--color-…)]` */
const COLOR_ONLY_CLASS = /^bg-\[var\(--color-[a-z0-9-]+\)\]$/
/** 格線 = Tailwind `border` 預設寬 1px(calendar.spec.md「每一週等高」格最小高算式的「格線」) */
export const SPEC_GRID_LINE_PX = 1

// ── class token 判定 ───────────────────────────────────────────────────────────
/** 取掉變體前綴(`hover:` / `data-[x]:` / `[&>div]:`;方括號裡的冒號不算)與 `!`、負號,回傳 utility 本體 */
export function utilityOf(token) {
  let depth = 0, last = 0
  for (let i = 0; i < token.length; i++) {
    const c = token[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if (c === ':' && depth === 0) last = i + 1
  }
  return token.slice(last).replace(/^!/, '').replace(/!$/, '').replace(/^-/, '')
}
const NUMERIC_SIZE = /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|h|w|size|min-h|min-w|max-h|max-w|translate-[xy]|scroll-[mp][xytrblse]?)-(\d+(?:\.\d+)?|px)$/
const BORDER_WIDTH = /^(?:border|divide|outline|ring)(?:-[xytrblse])?-(\d+(?:\.\d+)?)$/
const ARBITRARY_LENGTH = /\[[^\]]*?\d(?:\.\d+)?(?:px|rem|em)\b[^\]]*\]/
/** 這個 token 寫死了尺寸嗎?回傳原因(人話)或 null */
export function hardcodedReason(token) {
  if (ARBITRARY_LENGTH.test(token)) return '任意值裡寫了長度單位'
  const u = utilityOf(token)
  const size = NUMERIC_SIZE.exec(u)
  if (size && size[1] !== '0') return '數字型尺寸'
  const border = BORDER_WIDTH.exec(u)
  if (border && border[1] !== '0') return '數字型邊框 / 外框寬'
  return null
}

// ── 讀 TypeScript 語法樹 ───────────────────────────────────────────────────────
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
/** 字串字面值落在哪個 JSX 元素的 className 上(不是 className 的字串回 null) */
function classNameHost(node) {
  let n = node.parent
  while (n && (ts.isJsxExpression(n) || ts.isParenthesizedExpression(n))) n = n.parent
  if (!n || !ts.isJsxAttribute(n) || n.name.getText() !== 'className') return null
  const opening = n.parent?.parent
  if (!opening || !(ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening))) return null
  // 工具列那一列(2026-11-27 起是帶 data-calendar-toolbar 的 div,不再是 ChromeHeader)認屬性、不認標籤名 —— 放行 div 會放行到所有 div
  if (opening.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText() === 'data-calendar-toolbar')) return 'toolbar'
  return opening.tagName.getText()
}

/**
 * 掃一個 .tsx 的字串字面值(含 template 的靜態片段)。
 * `setsGeometryStyle` = 有元素的 style 設了 `CALENDAR_GEOMETRY_STYLE`;`setsGeometryStyleOnRoot` = 設在「同時展開 `{...props}`」的元素上
 * (= 接住 consumer props 的根節點)。2026-11-26 起清單浮層(calendar-more-list.tsx,Portal 到 body)也設一次,
 * 只問「任一檔有設」就抓不到「根節點拿掉」—— 第 (3) 條改鎖 calendar.tsx 的根節點。
 * @returns {{ violations: Array<{file,line,token,reason}>, calendarVars: Array<{file,line,name}>, setsGeometryStyle: boolean, setsGeometryStyleOnRoot: boolean }}
 */
export function scanComponentSource(file, text, { microGaps }) {
  const sf = parse(file, text)
  const violations = [], calendarVars = []
  let setsGeometryStyle = false, setsGeometryStyleOnRoot = false, readsAccentWidth = false
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) return
    if (ts.isIdentifier(node) && node.text === 'CALENDAR_GEOMETRY_STYLE') {
      for (let n = node.parent; n; n = n.parent) {
        if (ts.isJsxAttribute(n)) {
          if (n.name.getText() === 'style') {
            setsGeometryStyle = true
            const spreadsProps = n.parent.properties.some((a) => ts.isJsxSpreadAttribute(a) && a.expression.getText() === 'props')
            if (spreadsProps) setsGeometryStyleOnRoot = true
          }
          break
        }
      }
    }
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
    if (literal) {
      const host = classNameHost(node)
      const line = lineOf(sf, node)
      for (const m of node.text.matchAll(/var\((--calendar-[a-z0-9-]+)/g)) calendarVars.push({ file, line, name: m[1] })
      if (node.text.split(/\s+/).includes(ACCENT_WIDTH_CLASS)) readsAccentWidth = true
      for (const token of node.text.split(/\s+/).filter(Boolean)) {
        const reason = hardcodedReason(token)
        if (!reason) continue
        // 工具列 <nav> 的按鈕群微距與工具列那一列(data-calendar-toolbar)的子項間距(canonical_micro_geometry;那一列 2026-11-27 起 = 原本 ChromeHeader,
        // gap-2 從 chrome-header.tsx 搬進 calendar.tsx,calendar.spec.md「工具列」)
        if ((host === 'nav' || host === 'toolbar') && microGaps.includes(utilityOf(token))) continue
        violations.push({ file, line, token, reason })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { violations, calendarVars, setsGeometryStyle, setsGeometryStyleOnRoot, readsAccentWidth }
}

/**
 * 類別色表的色條(categorical-color.ts `CAT_ACCENT` 每個色相 + `CAT_EVENT_NEUTRAL.accent`)只給顏色:每個 class 都要是 `bg-[var(--color-…)]`。
 * @returns {{ problems: string[], entries: number }}  entries = 讀到的值的個數(0 = 儀器讀不到,呼叫端當儀器失效)
 */
export function checkAccentColorMap(text) {
  const sf = parse(CATEGORICAL_FILE, text)
  const problems = []
  let entries = 0
  const unwrap = (n) => { while (n && (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isSatisfiesExpression?.(n))) n = n.expression; return n }
  const checkValue = (where, node) => {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) { problems.push(`${CATEGORICAL_FILE}:${lineOf(sf, node)}:${where} 不是字串字面值(讀不出 class)`); return }
    entries++
    const bad = node.text.split(/\s+/).filter(Boolean).filter((t) => !COLOR_ONLY_CLASS.test(t))
    if (bad.length) problems.push(`${CATEGORICAL_FILE}:${lineOf(sf, node)}:${where} 含 \`${bad.join(' ')}\` —— 色條的色表只給顏色(bg-[var(--color-…)]),寬由 calendar-geometry.ts 給、不寫在色表(calendar.spec.md「事件的兩種長相」)`)
  }
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const name = node.name.getText(sf)
      const init = unwrap(node.initializer)
      if (init && ts.isObjectLiteralExpression(init) && (name === 'CAT_ACCENT' || name === 'CAT_EVENT_NEUTRAL')) {
        for (const p of init.properties) {
          if (!ts.isPropertyAssignment(p)) continue
          const key = p.name.getText(sf).replace(/^['"]|['"]$/g, '')
          if (name === 'CAT_EVENT_NEUTRAL' && key !== 'accent') continue
          checkValue(`${name}.${key}`, p.initializer)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { problems, entries }
}

/** 極小的常數求值器:數字、同檔常數、TAG_HEIGHT_PX.<size>、+ 與 * */
function evaluate(node, env) {
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isParenthesizedExpression(node)) return evaluate(node.expression, env)
  if (ts.isIdentifier(node)) return env.consts.has(node.text) ? evaluate(env.consts.get(node.text), env) : NaN
  if (ts.isPropertyAccessExpression(node) && node.expression.getText() === 'TAG_HEIGHT_PX') return env.tagHeights[node.name.text] ?? NaN
  if (ts.isBinaryExpression(node)) {
    const a = evaluate(node.left, env), b = evaluate(node.right, env)
    if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) return a + b
    if (node.operatorToken.kind === ts.SyntaxKind.AsteriskToken) return a * b
  }
  return NaN
}

/** tag.tsx 的 TAG_HEIGHT_PX 物件字面值 → { sm, md, lg } */
export function readTagHeights(text) {
  const sf = parse(TAG_FILE, text)
  const out = {}
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === 'TAG_HEIGHT_PX' && node.initializer) {
      let init = node.initializer
      while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression
      if (ts.isObjectLiteralExpression(init)) {
        for (const p of init.properties) if (ts.isPropertyAssignment(p) && ts.isNumericLiteral(p.initializer)) out[p.name.getText()] = Number(p.initializer.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** calendar-geometry.ts 的常數核對 + 設出去的變數名 */
export function checkGeometryModule(text, tagHeights) {
  const sf = parse(GEOMETRY_FILE, text)
  const problems = [], consts = new Map(), styleKeys = []
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      consts.set(node.name.getText(), node.initializer)
      if (node.name.getText() === 'CALENDAR_GEOMETRY_STYLE') {
        let init = node.initializer
        while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression
        if (ts.isObjectLiteralExpression(init)) for (const p of init.properties) if (ts.isPropertyAssignment(p)) styleKeys.push(p.name.getText().replace(/^['"]|['"]$/g, ''))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const env = { consts, tagHeights }
  const at = (name) => (consts.has(name) ? `${GEOMETRY_FILE}:${lineOf(sf, consts.get(name))}` : GEOMETRY_FILE)
  const row = consts.get('CALENDAR_ROW_HEIGHT_PX')
  if (!Number.isFinite(tagHeights.md)) problems.push(`${TAG_FILE}:讀不到 TAG_HEIGHT_PX.md(儀器讀檔失敗,不是 Calendar 的問題)`)
  const gap = evaluate(consts.get('CALENDAR_GAP_PX') ?? ts.factory.createIdentifier('missing'), env)
  if (gap !== SPEC_GAP_PX) problems.push(`${at('CALENDAR_GAP_PX')}:格內空隙 CALENDAR_GAP_PX 應為 ${SPEC_GAP_PX}(calendar.spec.md「間距」),實得 ${gap}`)
  const rowPx = evaluate(row ?? ts.factory.createIdentifier('missing'), env)
  if (rowPx !== tagHeights.md) problems.push(`${at('CALENDAR_ROW_HEIGHT_PX')}:列高 CALENDAR_ROW_HEIGHT_PX = ${rowPx},與 tag.tsx 的 TAG_HEIGHT_PX.md = ${tagHeights.md} 不同(列高單位 = Tag md 盒高,calendar.spec.md「間距」)`)
  const inset = evaluate(consts.get('CALENDAR_TEXT_INSET_PX') ?? ts.factory.createIdentifier('missing'), env)
  if (inset !== 2 * gap) problems.push(`${at('CALENDAR_TEXT_INSET_PX')}:文字內距應 = 2 × 空隙 = ${2 * gap}(Tag px + Text px),實得 ${inset}`)
  const line = evaluate(consts.get('CALENDAR_GRID_LINE_PX') ?? ts.factory.createIdentifier('missing'), env)
  if (line !== SPEC_GRID_LINE_PX) problems.push(`${at('CALENDAR_GRID_LINE_PX')}:格線 CALENDAR_GRID_LINE_PX 應為 ${SPEC_GRID_LINE_PX}(格子 border-b = Tailwind 預設寬),實得 ${line}`)
  const minH = evaluate(consts.get('CALENDAR_CELL_MIN_HEIGHT_PX') ?? ts.factory.createIdentifier('missing'), env)
  // 期望值用規格的格線 1,不用常數自己的值:常數改錯時上一條紅,這一條仍照規格算(兩條各自獨立)
  const wantMinH = 3 * gap + 2 * rowPx + SPEC_GRID_LINE_PX
  if (minH !== wantMinH) problems.push(`${at('CALENDAR_CELL_MIN_HEIGHT_PX')}:格最小高應 = 上內距 + 日期框 + 列距 + 一列 + 下內距 + 格線 = ${wantMinH},實得 ${minH}(格子是 border-box,底線在格高裡;沒算格線時內容少 1px,事件列被壓或吃掉下內距)`)
  // 有時段事件的色條寬:= 4(Tag px),且色條寬 + 間隔(空隙)= 文字內距 —— 字左緣與全天長條(外層 4 + 文字 4)同一條線(calendar.spec.md「間距」有時段的色條列)
  const accent = evaluate(consts.get('CALENDAR_ACCENT_WIDTH_PX') ?? ts.factory.createIdentifier('missing'), env)
  if (accent !== SPEC_ACCENT_PX) problems.push(`${at('CALENDAR_ACCENT_WIDTH_PX')}:有時段事件的色條寬 CALENDAR_ACCENT_WIDTH_PX 應為 ${SPEC_ACCENT_PX}(Tag 的「Tag px」,calendar.spec.md「間距」),實得 ${accent}`)
  else if (accent + gap !== inset) problems.push(`${at('CALENDAR_ACCENT_WIDTH_PX')}:色條寬 ${accent} + 間隔 ${gap} ≠ 文字內距 ${inset} —— 有時段事件的字左緣會和全天長條錯開`)
  if (!styleKeys.includes('--calendar-accent-w')) problems.push(`${GEOMETRY_FILE}:CALENDAR_GEOMETRY_STYLE 沒有設 --calendar-accent-w(色條寬的元件內變數)`)
  if (styleKeys.length === 0) problems.push(`${GEOMETRY_FILE}:找不到 CALENDAR_GEOMETRY_STYLE 的變數名(元件內變數沒有設值的地方)`)
  return { problems, styleKeys, values: { row: rowPx, gap, inset, line, minH, accent } }
}

/** 整體判定(純函式;輸入 = 各檔內容) */
export function evaluateCalendarGeometry({ components, geometry, tag, microGaps, categorical }) {
  const problems = []
  const tagHeights = readTagHeights(tag)
  const geo = checkGeometryModule(geometry, tagHeights)
  problems.push(...geo.problems)
  const defined = new Set(geo.styleKeys)
  const main = `${CALENDAR_DIR}/calendar.tsx`
  let rootSetsStyle = false, readsAccent = false
  for (const [file, text] of Object.entries(components)) {
    const r = scanComponentSource(file, text, { microGaps })
    for (const v of r.violations) problems.push(`${v.file}:${v.line}:\`${v.token}\` ${v.reason} —— 改讀 token 或 --calendar-* 元件內變數(calendar.spec.md「間距」)`)
    for (const v of r.calendarVars) if (!defined.has(v.name)) problems.push(`${v.file}:${v.line}:class 讀 var(${v.name}),但 CALENDAR_GEOMETRY_STYLE 沒有設它(整條宣告會靜默失效)`)
    if (file === main && r.setsGeometryStyleOnRoot) rootSetsStyle = true
    if (r.readsAccentWidth) readsAccent = true
  }
  // (3) 鎖 calendar.tsx 的根節點(展開 {...props} 的那個元素);清單浮層在 Portal 裡另設的那一次不算(它的列距 / 上限由 calendar-month ML-half 在瀏覽器量)
  if (!rootSetsStyle) problems.push(`${main}:根節點(展開 {...props} 的那個元素)的 style 沒有設 CALENDAR_GEOMETRY_STYLE(格陣裡的 --calendar-* 全部沒值;別的檔有設不算)`)
  if (!readsAccent) problems.push(`${CALENDAR_DIR}:沒有任何元素的寬讀 \`${ACCENT_WIDTH_CLASS}\` —— 有時段事件的色條寬沒有從 calendar-geometry.ts 的常數來(calendar.spec.md「間距」有時段的色條列)`)
  const accentMap = checkAccentColorMap(categorical)
  problems.push(...accentMap.problems)
  return { problems, values: geo.values, accentEntries: accentMap.entries }
}

// ── 讀檔 ──────────────────────────────────────────────────────────────────────
export function loadInputs(root) {
  const dir = path.join(root, CALENDAR_DIR)
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.includes('.stories.') && !f.startsWith('_')).sort() : []
  const components = Object.fromEntries(files.map((f) => [`${CALENDAR_DIR}/${f}`, fs.readFileSync(path.join(dir, f), 'utf8')]))
  const registry = JSON.parse(fs.readFileSync(path.join(root, UTILITY_REGISTRY), 'utf8'))
  const microGaps = registry?.spacing?.canonical_micro_geometry?.gap_utilities ?? []
  return {
    components,
    geometry: fs.readFileSync(path.join(root, GEOMETRY_FILE), 'utf8'),
    tag: fs.readFileSync(path.join(root, TAG_FILE), 'utf8'),
    categorical: fs.readFileSync(path.join(root, CATEGORICAL_FILE), 'utf8'),
    microGaps,
  }
}

// ── 對照組(記憶體內突變;實檔突變在配對測試)────────────────────────────────────
export const MUTANTS = [
  ['格子內距寫回 p-1.5', 'components', (s) => s.replace("'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)]", "'flex flex-col gap-[var(--calendar-gap)] p-1.5")],
  // 事件區 2026-11-25 事件版面那一包起是 grid(一列一條車道),列距 = gap-y
  ['列距寫回 gap-y-0.5', 'components', (s) => s.replace('className="grid gap-y-[var(--calendar-gap)] shrink-0"', 'className="grid gap-y-0.5 shrink-0"')],
  ['格子加回 min-h-28', 'components', (s) => s.replace("'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)]", "'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)] min-h-28")],
  // 事件列的顏色層(MonthEventPiece 內層;外層是長條墊底的那一層)
  ['事件列寫死 border-l-[3px]', 'components', (s) => s.replace("'flex items-center h-full rounded-[inherit]", "'border-l-[3px] flex items-center h-full rounded-[inherit]")],
  ['列高常數改成 20', 'geometry', (s) => s.replace('CALENDAR_ROW_HEIGHT_PX = 24', 'CALENDAR_ROW_HEIGHT_PX = 20')],
  ['格最小高沒算格線', 'geometry', (s) => s.replace(' + CALENDAR_GAP_PX + CALENDAR_GRID_LINE_PX', ' + CALENDAR_GAP_PX')],
  ['gap-2 搬到非 <nav> 的元素', 'components', (s) => s.replace('className="grid gap-y-[var(--calendar-gap)] shrink-0"', 'className="grid gap-2 shrink-0"')],
  // 工具列那一列只放行微距那幾個(gap-1 / gap-2),其他數字照擋(2026-11-27 那一列加進放行時的對照組)
  ['工具列那一列子項間距寫成 gap-3', 'components', (s) => s.replace('className="flex items-center gap-2 shrink-0 min-w-0', 'className="flex items-center gap-3 shrink-0 min-w-0')],
  ['class 讀一個沒設值的 --calendar-*', 'components', (s) => s.replace('px-[var(--calendar-text-inset)]', 'px-[var(--calendar-txt-inset)]')],
  ['根節點沒設元件內變數', 'components', (s) => s.replace('style={{ ...CALENDAR_GEOMETRY_STYLE, ...style }}', 'style={style}')],
  // 根節點沒設、改設在別的元素上(只問「有元素設了」抓不到這一格)
  ['元件內變數從根節點搬到工具列', 'components', (s) => s.replace('style={{ ...CALENDAR_GEOMETRY_STYLE, ...style }}', 'style={style}').replace('<div data-calendar-toolbar=""', '<div style={CALENDAR_GEOMETRY_STYLE} data-calendar-toolbar=""')],
  // 有時段事件的色條(2026-11-25 事件長相那一包):色表恢復成 2026-11-25 前的左側 3px 邊框、元件寫死色條寬、常數改成 3(字左緣與全天長條錯開 1px)
  ['色表 CAT_ACCENT 恢復 border-l-[3px]', 'categorical', (s) => s.replace("blue: 'bg-[var(--color-blue-6)]',", "blue: 'border-l-[3px] border-[var(--color-blue-6)]',")],
  ['色條寬寫死 w-1', 'components', (s) => s.replace('w-[var(--calendar-accent-w)]', 'w-1')],
  ['色條寬常數改成 3', 'geometry', (s) => s.replace('CALENDAR_ACCENT_WIDTH_PX = CALENDAR_GAP_PX', 'CALENDAR_ACCENT_WIDTH_PX = 3')],
]
/** 一個突變套到輸入上;字串沒變 = 突變的錨點失效(儀器問題,不是對照組綠) */
export function applyMutant(inputs, [label, target, fn]) {
  if (target === 'geometry') {
    const geometry = fn(inputs.geometry)
    return geometry === inputs.geometry ? null : { ...inputs, geometry }
  }
  if (target === 'categorical') {
    const categorical = fn(inputs.categorical)
    return categorical === inputs.categorical ? null : { ...inputs, categorical }
  }
  const main = `${CALENDAR_DIR}/calendar.tsx`
  const next = fn(inputs.components[main] ?? '')
  if (next === inputs.components[main]) return null
  return { ...inputs, components: { ...inputs.components, [main]: next }, label }
}

const isMain = path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)
if (isMain) {
  let inputs
  try { inputs = loadInputs(ROOT) } catch (error) {
    console.error(`✗ INSTRUMENT-FAIL:讀不到 Calendar 幾何閘的輸入(${error.message})`)
    process.exit(2)
  }
  if (Object.keys(inputs.components).length === 0 || !inputs.components[`${CALENDAR_DIR}/calendar.tsx`]) {
    console.error(`✗ INSTRUMENT-FAIL:${CALENDAR_DIR} 底下沒有掃到 calendar.tsx(掃描母體 0 個檔 ≠ 沒有違規)`)
    process.exit(2)
  }
  if (inputs.microGaps.length === 0) {
    console.error(`✗ INSTRUMENT-FAIL:${UTILITY_REGISTRY} 讀不到 spacing.canonical_micro_geometry.gap_utilities`)
    process.exit(2)
  }
  const base = evaluateCalendarGeometry(inputs)
  // CAT_ACCENT 12 色相 + neutral 的 accent = 13 個值;讀到 0 個 = 解析不到色表(儀器失效,不是「沒有違規」)
  if (base.accentEntries === 0) {
    console.error(`✗ INSTRUMENT-FAIL:${CATEGORICAL_FILE} 讀不到 CAT_ACCENT / CAT_EVENT_NEUTRAL.accent 的任何一個值`)
    process.exit(2)
  }
  if (SELFTEST) {
    let bad = 0
    if (base.problems.length) { console.log(`✗ selftest:現況就紅(${base.problems.length} 條),對照組無從比較`); bad++ }
    for (const mutant of MUTANTS) {
      const mutated = applyMutant(inputs, mutant)
      if (!mutated) { console.log(`✗ selftest:「${mutant[0]}」的錨點在原始碼裡找不到 —— 突變沒有套上(改了原始碼要同步改本檔 MUTANTS)`); bad++; continue }
      const r = evaluateCalendarGeometry(mutated)
      if (r.problems.length === 0) { console.log(`✗ selftest:「${mutant[0]}」沒被抓到 —— 量具無效`); bad++ }
      else console.log(`✓ selftest:「${mutant[0]}」→ 紅(${r.problems[0]})`)
    }
    console.log(bad ? `✗ calendar-geometry selftest:${bad} 條沒照預期` : `✅ calendar-geometry selftest:${MUTANTS.length} 個突變全紅、現況綠`)
    process.exit(bad ? 1 : 0)
  }
  if (base.problems.length) {
    console.error(`✗ calendar-geometry:${base.problems.length} 處寫死尺寸或幾何常數不對(calendar.spec.md「間距」【SPACING(定)】、「禁止事項」第 7 條):`)
    for (const p of base.problems) console.error(`  · ${p}`)
    process.exit(1)
  }
  const v = base.values
  console.log(`✅ calendar-geometry PASS(${Object.keys(inputs.components).length} 個元件檔;列高 ${v.row} = tag.tsx TAG_HEIGHT_PX.md、空隙 ${v.gap}、文字內距 ${v.inset}、格線 ${v.line}、格最小高 ${v.minH}、色條寬 ${v.accent};色表 ${base.accentEntries} 個色條值都只給顏色)`)
}

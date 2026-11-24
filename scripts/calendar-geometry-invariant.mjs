#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Calendar 元件檔(components/Calendar/*.tsx,不含 *.stories.tsx 與 `_` 開頭的示範殼)的 class 字串裡,內距 / 外距 / 間距 /
 *         寬高 / 最小最大值 / 位置 / 邊框寬一律不寫數字(`p-1.5`、`gap-0.5`、`min-h-28`、`h-6`、`border-2`)也不寫 `[Npx]`、`[Nrem]`
 *         這類任意值 —— 一律讀 token 或 Calendar 自己的元件內變數(calendar.spec.md「間距」【SPACING(定)】與「禁止事項」第 7 條)。
 *         唯一放行:工具列 `<nav>` 上的按鈕群微距(utility-registry.json spacing.canonical_micro_geometry.gap_utilities,例 `gap-2`),
 *         只在 `<nav>` 那個元素的 className 上算數,搬到別的元素就紅。另核對三件事:
 *         (1) calendar-geometry.ts 的列高 `CALENDAR_ROW_HEIGHT_PX` 與 tag.tsx 的 `TAG_HEIGHT_PX.md` 同值(雙生常數:Calendar 不 import tag.tsx,
 *             免得整個 Tag 模組進 Calendar 的包;值由本閘從 tag.tsx 讀出來比),
 *             空隙 = 4、文字內距 = 2 × 空隙、格最小高 = 3 × 空隙 + 2 × 列高(算出來比對,Tag 盒高從 tag.tsx 讀);
 *         (2) class 裡讀到的每一個 `var(--calendar-*)` 都在 `CALENDAR_GEOMETRY_STYLE` 有設值(沒設值的 var 讓整條宣告靜默失效);
 *         (3) calendar.tsx 真的把 `CALENDAR_GEOMETRY_STYLE` 設在某個元素的 style 上。
 *   紅: --selftest(與配對測試 scripts/test-calendar-geometry-invariant.mjs 的實檔突變)逐一注入 `p-1.5`、`gap-0.5`、`min-h-28`、
 *       `border-l-[3px]`、把列高改成 20、把 `gap-2` 搬到非 `<nav>` 的元素、class 讀一個沒設值的 `--calendar-*`、拿掉根節點的 style,
 *       每一個都必須被指名(檔:行 + 該 class)並 exit 1。
 *   綠: 現況 0 命中時 exit 0;註解裡提到的舊 class(例「2026-11-25 前是 p-1.5」)不算 —— 只看 TypeScript 語法樹裡的字串字面值。
 *       純靜態讀檔、不讀時間,重複跑結果相同。掃描母體 0 個檔(路徑錯)= 儀器失效 exit 2,不讀成通過。
 *   不涵蓋: 類別色表(categorical-color.ts 的 CAT_ACCENT `border-l-[3px]`)這一包先不掃,事件長相那一包擴掃;
 *       畫出來的像素由 scripts/calendar-month-invariant.mjs 在瀏覽器量(M32:class 對了 ≠ 畫對了)。
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
/** calendar.spec.md「間距」:格內所有空隙 = 4 */
export const SPEC_GAP_PX = 4

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
  return opening && (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)) ? opening.tagName.getText() : null
}

/**
 * 掃一個 .tsx 的字串字面值(含 template 的靜態片段)。
 * @returns {{ violations: Array<{file,line,token,reason}>, calendarVars: Array<{file,line,name}>, setsGeometryStyle: boolean }}
 */
export function scanComponentSource(file, text, { microGaps }) {
  const sf = parse(file, text)
  const violations = [], calendarVars = []
  let setsGeometryStyle = false
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) return
    if (ts.isIdentifier(node) && node.text === 'CALENDAR_GEOMETRY_STYLE') {
      for (let n = node.parent; n; n = n.parent) {
        if (ts.isJsxAttribute(n)) { if (n.name.getText() === 'style') setsGeometryStyle = true; break }
      }
    }
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
    if (literal) {
      const host = classNameHost(node)
      const line = lineOf(sf, node)
      for (const m of node.text.matchAll(/var\((--calendar-[a-z0-9-]+)/g)) calendarVars.push({ file, line, name: m[1] })
      for (const token of node.text.split(/\s+/).filter(Boolean)) {
        const reason = hardcodedReason(token)
        if (!reason) continue
        if (host === 'nav' && microGaps.includes(utilityOf(token))) continue // 工具列 <nav> 的按鈕群微距(canonical_micro_geometry)
        violations.push({ file, line, token, reason })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { violations, calendarVars, setsGeometryStyle }
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
  const minH = evaluate(consts.get('CALENDAR_CELL_MIN_HEIGHT_PX') ?? ts.factory.createIdentifier('missing'), env)
  const wantMinH = 3 * gap + 2 * rowPx
  if (minH !== wantMinH) problems.push(`${at('CALENDAR_CELL_MIN_HEIGHT_PX')}:格最小高應 = 上內距 + 日期框 + 列距 + 一列 + 下內距 = ${wantMinH},實得 ${minH}`)
  if (styleKeys.length === 0) problems.push(`${GEOMETRY_FILE}:找不到 CALENDAR_GEOMETRY_STYLE 的變數名(元件內變數沒有設值的地方)`)
  return { problems, styleKeys, values: { row: rowPx, gap, inset, minH } }
}

/** 整體判定(純函式;輸入 = 各檔內容) */
export function evaluateCalendarGeometry({ components, geometry, tag, microGaps }) {
  const problems = []
  const tagHeights = readTagHeights(tag)
  const geo = checkGeometryModule(geometry, tagHeights)
  problems.push(...geo.problems)
  const defined = new Set(geo.styleKeys)
  let setsStyle = false
  for (const [file, text] of Object.entries(components)) {
    const r = scanComponentSource(file, text, { microGaps })
    for (const v of r.violations) problems.push(`${v.file}:${v.line}:\`${v.token}\` ${v.reason} —— 改讀 token 或 --calendar-* 元件內變數(calendar.spec.md「間距」)`)
    for (const v of r.calendarVars) if (!defined.has(v.name)) problems.push(`${v.file}:${v.line}:class 讀 var(${v.name}),但 CALENDAR_GEOMETRY_STYLE 沒有設它(整條宣告會靜默失效)`)
    if (r.setsGeometryStyle) setsStyle = true
  }
  if (!setsStyle) problems.push(`${CALENDAR_DIR}:沒有任何元素的 style 設了 CALENDAR_GEOMETRY_STYLE(--calendar-* 全部沒值)`)
  return { problems, values: geo.values }
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
    microGaps,
  }
}

// ── 對照組(記憶體內突變;實檔突變在配對測試)────────────────────────────────────
export const MUTANTS = [
  ['格子內距寫回 p-1.5', 'components', (s) => s.replace("'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)]", "'flex flex-col gap-[var(--calendar-gap)] p-1.5")],
  ['列距寫回 gap-0.5', 'components', (s) => s.replace("<div className=\"flex flex-col gap-[var(--calendar-gap)] min-h-0\">", "<div className=\"flex flex-col gap-0.5 min-h-0\">")],
  ['格子加回 min-h-28', 'components', (s) => s.replace("'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)]", "'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)] min-h-28")],
  ['事件列寫死 border-l-[3px]', 'components', (s) => s.replace("const tileBase = 'flex items-center h-tag-md", "const tileBase = 'border-l-[3px] flex items-center h-tag-md")],
  ['列高常數改成 20', 'geometry', (s) => s.replace('CALENDAR_ROW_HEIGHT_PX = 24', 'CALENDAR_ROW_HEIGHT_PX = 20')],
  ['gap-2 搬到非 <nav> 的元素', 'components', (s) => s.replace("<div className=\"flex flex-col gap-[var(--calendar-gap)] min-h-0\">", "<div className=\"flex flex-col gap-2 min-h-0\">")],
  ['class 讀一個沒設值的 --calendar-*', 'components', (s) => s.replace('px-[var(--calendar-text-inset)]', 'px-[var(--calendar-txt-inset)]')],
  ['根節點沒設元件內變數', 'components', (s) => s.replace('style={{ ...CALENDAR_GEOMETRY_STYLE, ...style }}', 'style={style}')],
]
/** 一個突變套到輸入上;字串沒變 = 突變的錨點失效(儀器問題,不是對照組綠) */
export function applyMutant(inputs, [label, target, fn]) {
  if (target === 'geometry') {
    const geometry = fn(inputs.geometry)
    return geometry === inputs.geometry ? null : { ...inputs, geometry }
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
  console.log(`✅ calendar-geometry PASS(${Object.keys(inputs.components).length} 個元件檔;列高 ${v.row} = tag.tsx TAG_HEIGHT_PX.md、空隙 ${v.gap}、文字內距 ${v.inset}、格最小高 ${v.minH})`)
}

#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 原始碼(.tsx 與 .ts,不含 story)裡,同一個 class 宣告單位(一個 cn()/cva()/clsx() 呼叫、一個 *className 屬性、
 *         一個 class 值的 const / 物件屬性、或一段單獨的字串)不會同時有「hover 驅動的顏色 / 外框 / 顯隱變化」與
 *         「會把**那一族**屬性一起過渡、作用在**同一個目標**的 transition」。
 *         受管三族(2026-09-26 同意範圍):顏色(底色、字色、外框色、描邊、填色)、ring(畫成外框的 box-shadow)、
 *         不透明度(滑過才出現的按鈕淡入)。目標 = 元素本身 vs `after:` / `before:` 等偽元素 vs `[&>svg]` 等子元素。
 *         hover class 或 transition 寫在別的 const(含跨檔 import,例 categorical-color.ts 的 CAT_EVENT)、
 *         或由函式回傳再 spread 進來(例 field-wrapper.tsx 的 fieldDefaultChromeCompounds)的也算。
 *   紅: --selftest 的 hover 底色 / 字色 / 外框 / 滑過淡入 / ring 各配上會過渡它的 transition、`transition`(不帶後綴)、
 *       `transition-[opacity]` 任意值、同一個 cn() 內相距 12 行、.ts 自己同時寫兩者、Calendar 事件方塊的跨檔形狀、
 *       字色 hover 經 import 進有 transition-colors 的 cn()、函式回傳的 hover 外框 spread 進有過渡的 cva(Textarea 形狀)都必須紅
 *   綠: 寫了 escape(含 escape 過的 cva 在別處被 cn() 引用)、有 hover 但沒有過渡、兩者在不同的 cn()(就算只隔一行)、
 *       同一條跨檔路徑但沒有過渡、無關 const 與過渡同框、屬性族不同(箭頭 `transition-transform` 旁的 `hover:text-*`、
 *       `transition-[width]` 旁的 hover 底色、hover 微放大與陰影升級)、目標不同(分頁底線 `after:transition-colors` 旁的
 *       `hover:text-*`)—— 都必須 0 命中;純靜態讀檔,重複跑結果相同
 *   不涵蓋(靜態掃不到或不在同意範圍,由元件規格與實測負責):
 *       (1) hover 由 JS 狀態驅動、class 裡看不到 hover 字樣的淡入(例 `opacity: visible ? 1 : 0`、`armVisible ? 'opacity-100' : …`);
 *       (2) hover 造成的形變與高度(`hover:scale-*`、`hover:shadow-*` 陰影升級)—— 2026-09-26 同意的範圍只到顏色、外框與淡入;
 *       (3) `.css` 檔(DS 目前 0 條 `transition` 宣告,2026-09-26 grep)。
 */
// ═══════════════════════════════════════════════════════════════════════════
// hover 回饋不做過渡 —— 「指標滑過去的時候,因它而起的顏色與顯隱變化都要立刻到位」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`packages/design-system/src/tokens/motion/motion.spec.md`「hover 回饋不做過渡」
//
// user 2026-09-10 拍板(原話:「第三題改成全部瞬間,確保有SSOT不要有漂移」)—— 當時題目只問底色。
// **2026-09-26 延伸**(待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` 〇節 L9 / N4(3);
// user 對 L9 原話:「確定這樣才是一致設計語言就做」;同意清單回覆:「確保符合我們一致的設計語言且不違背世界級的設計
// 且都有確保整個ds 是SSOT,避免漂移就照你建議做」):同一次滑過,底色瞬間、字色與外框卻 0.15 秒 = 兩套手感。
// 範圍 = 字色、外框色、滑過才出現的按鈕淡入;**不含**選中切換類動畫(勾選框打勾、開關滑動、分頁底線移動、
// 手風琴展開、箭頭旋轉)—— 它們不是 hover 觸發的。
//
// 為什麼(底色那一段的量測):過渡時長必須短於「指標停在一個項目上的時間」,否則底色永遠追不上指標 ——
// 表格列高 36–52px,指標以 500–1000px/s 掃過時每 40–90ms 換一列,150ms 的過渡在每一列
// 都完成不了,畫面上同時有兩三列半亮的拖尾(2026-09-10 量到 hover 最終色延遲 p95 109ms,
// 其中 84ms 是過渡本身)。一手來源:MUI DataGrid 的列 hover、AG Grid `.ag-row-hover`、
// VS Code `.monaco-list-row:hover` 三家都沒有任何 background 過渡。
//
// 判準(機械):同一個 class 宣告單位裡同時出現
//   (a) hover 驅動的 class:變體鏈含 `hover`(`hover:` / `group-hover/x:` / `peer-hover:` / `data-[hovered]:` /
//       `data-[action-hover]:` / `[@media(hover:hover)]:[&:where(:has(~…:hover))]:` …)或 `data-[highlighted]:`,
//       utility 屬受管三族之一;另 `group-data-[state=open]/x:` 的**顏色**也算(子選單開著時觸發列維持滑過色,2026-09-10 起)
//   (b) 會過渡**同一族**、作用在**同一個目標**的宣告:`transition`(不帶後綴)/ `transition-all` /
//       `transition-colors` / `transition-opacity` / `transition-shadow`(對 ring)/ `transition-[…]`
// = 漂移。每行 escape:`@hover-transition-allow: <理由>`(寫在該行上方 LOOKBACK 行內)。
// escape 過的過渡不會沿著 const 傳出去(Checkbox 的 cva 在元件本體被 cn() 引用時不再報一次)。
//
// 例外(已登記,清單的唯一住所 = motion.spec.md「唯一的例外」段):Checkbox / Radio / Switch 的 checked 狀態切換。
//
// **2026-09-26 由「上下 8 行」改成「同一個宣告單位」**:本 repo 的 class 陣列註解很多,8 行常常跨不過去 ——
// 實測漏掉 FileUpload 拖放區(`transition-colors` 與 `data-[state=idle]:hover:border-*` 在同一個 cn() 裡相隔 10 行)、
// Textarea(hover 外框由 `...fieldDefaultChromeCompounds('control')` 函式回傳再 spread 進 cva);
// 同時「上下 8 行」會把父層的過渡跟相鄰子元素的 hover 誤配成一對(父層的過渡根本不會動到子元素的顏色)。
// 以 TypeScript AST 取宣告單位,兩個方向一起收掉。
//
// **2026-09-25 補盲點(兩個)**:Calendar 事件方塊 `calendar.tsx` 寫了 `transition-colors`,而它的 hover 底色
// `hover:bg-[var(--color-{hue}-2)]` 住在 **`.ts`** 檔(`tokens/categorical-color.ts` 的 `CAT_EVENT`),
// 經 `EVENT_COLOR_CLASSES = CAT_EVENT` → `colorClass` 變數傳進同一段 `cn(...)`。舊版 (1) 只掃 `.tsx`、
// (2) 只認「字面上寫在附近的 hover class」,所以兩道都看不到。
// 現在:(1) `.ts` 也掃;(2) 「帶著 hover class / transition 的識別字」也算:初始值裡寫了它們的 const
// (跨檔:從別的檔 import 進來的也算),以及同一檔裡由它們衍生出來的 const —— 每個識別字帶著它的「目標|屬性族」集合。
// 靠名字比對、不做型別推導,所以 escape 照舊可用。
//
// Run: `node scripts/hover-instant-invariant.mjs`(`--selftest` 跑正反例)
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../packages/design-system/src', import.meta.url))
/** escape 註解要寫在過渡那一行上方幾行內 */
const LOOKBACK = 3

const ESCAPE = /@hover-transition-allow:\s*\S/

// ── class 解析:變體鏈 / 目標 / 屬性族 ──────────────────────────────────────────

/**
 * 屬性族。受管的只有前三族(2026-09-26 同意範圍:顏色、外框、淡入);`elevation`(陰影升級)與 `transform`(微放大)
 * 會解析出來、但不參與判定 —— 它們不在同意範圍(見檔頭「不涵蓋」(2))。`all` 只出現在 transition 那一側。
 */
const GOVERNED = new Set(['colour', 'ring', 'opacity'])
const ALL_FAMILIES = ['colour', 'ring', 'opacity', 'elevation', 'transform']

/** hover 驅動的變體(見檔頭判準 (a)) */
const HOVER_VARIANT = /hover|data-\[highlighted\]/
/** 子選單開著時觸發列維持滑過色 —— 只對顏色成立(2026-09-10 底色規則起就在) */
const OPEN_AS_HOVER_VARIANT = /^group-data-\[state=open\]\//
/** 目標是偽元素的變體:過渡掛在 `after:` 上,只過渡那條偽元素,跟元素本身的 hover 無關(分頁底線) */
const PSEUDO_ELEMENT_VARIANT = /^(?:before|after|placeholder|file|marker|selection|backdrop|first-letter|first-line|details-content)$/

/** 把一個 class 拆成變體鏈與 utility:`:` 只在方括號 / 圓括號外才算分隔 */
function splitClass(token) {
  const parts = []
  let depth = 0, cur = ''
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth++
    else if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ':' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  parts.push(cur)
  const utility = parts.pop().replace(/^!/, '').replace(/!$/, '')
  return { variants: parts, utility }
}

/** `[&>svg]` / `[&_x]` / `*` 這類「換到子元素」的變體:選擇器在括號外有組合子(`>` `~` `+` 或代表空白的 `_`) */
function isChildTargetVariant(v) {
  if (v === '*' || v === '**') return true
  if (!v.startsWith('[&') || !v.endsWith(']')) return false
  let depth = 0
  for (const ch of v.slice(2, -1)) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (depth === 0 && (ch === '>' || ch === '~' || ch === '+' || ch === '_')) return true
  }
  return false
}

/** 這個 class 作用在哪個目標:元素本身 = `self`;偽元素 / 子元素變體依序串起來 */
function targetOf(variants) {
  const t = variants.filter((v) => PSEUDO_ELEMENT_VARIANT.test(v) || isChildTargetVariant(v))
  return t.length ? t.join(':') : 'self'
}

/** utility 屬於哪個屬性族(不屬於任何一族 → null) */
function familyOfUtility(u) {
  if (/^-?(?:bg|text|border(?:-[xytrblse])?|outline|decoration|fill|stroke|from|via|to|divide|caret|accent)-/.test(u)
    || /^\[(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|outline-color|text-decoration-color|fill|stroke):/.test(u)) return 'colour'
  if (/^(?:ring|inset-ring)(?:-|$)/.test(u)) return 'ring'
  if (/^opacity-/.test(u) || /^\[opacity:/.test(u)) return 'opacity'
  if (/^(?:shadow|inset-shadow)(?:-|$)/.test(u) || /^\[box-shadow:/.test(u)) return 'elevation'
  if (/^-?(?:scale|translate|rotate|skew)(?:-|$)/.test(u) || /^\[(?:transform|translate|scale|rotate):/.test(u)) return 'transform'
  return null
}

/** transition 宣告會過渡哪些屬性族(不是 transition → null;`transition-none` → 空集合) */
function familiesOfTransition(u) {
  if (u === 'transition') return new Set(ALL_FAMILIES) // Tailwind v4 預設清單含顏色、opacity、box-shadow、transform
  if (u === 'transition-all') return new Set(['all'])
  if (u === 'transition-colors') return new Set(['colour'])
  if (u === 'transition-opacity') return new Set(['opacity'])
  if (u === 'transition-shadow') return new Set(['ring', 'elevation']) // ring 與陰影都畫在 box-shadow 上
  if (u === 'transition-transform') return new Set(['transform'])
  if (u === 'transition-none') return new Set()
  const m = /^transition-\[(.+)\]$/.exec(u)
  if (!m) return null
  const out = new Set()
  for (const p of m[1].split(',')) {
    const prop = p.trim()
    if (prop === 'all') out.add('all')
    else if (/colou?rs?$|^(?:color|fill|stroke)$/.test(prop)) out.add('colour')
    else if (prop === 'opacity') out.add('opacity')
    else if (prop === 'box-shadow') { out.add('ring'); out.add('elevation') }
    else if (/^(?:transform|translate|scale|rotate)$/.test(prop)) out.add('transform')
  }
  return out
}

/** 一段文字裡的 class 候選(引號 / 空白 / 反引號分隔;不像 class 的字自然對不上任何屬性族) */
const classTokens = (text) => text.match(/[^\s'"`]+/g) ?? []

/** 一段文字裡「hover 驅動、受管屬性族」的鍵集合:`目標|屬性族` */
function hoverKeysOf(text) {
  const keys = new Set()
  for (const tok of classTokens(text)) {
    const { variants, utility } = splitClass(tok)
    const fam = familyOfUtility(utility)
    if (!fam || !GOVERNED.has(fam)) continue
    const hover = variants.some((v) => HOVER_VARIANT.test(v))
      || (fam === 'colour' && variants.some((v) => OPEN_AS_HOVER_VARIANT.test(v)))
    if (hover) keys.add(`${targetOf(variants)}|${fam}`)
  }
  return keys
}

/** 一段文字裡的 transition 宣告攤成 `目標|屬性族` 鍵(`all` 保留為一族) */
function transitionKeysOf(text) {
  const keys = new Set()
  for (const tok of classTokens(text)) {
    const { variants, utility } = splitClass(tok)
    const fams = familiesOfTransition(utility)
    if (!fams) continue
    for (const f of fams) keys.add(`${targetOf(variants)}|${f}`)
  }
  return keys
}

/** transition 鍵與 hover 鍵有沒有交集(同目標、同屬性族;`all` 對上同目標任何一族) */
function overlaps(transKeys, hoverKeys) {
  for (const t of transKeys) {
    const [target, fam] = t.split('|')
    if (fam === 'all' ? [...hoverKeys].some((h) => h.startsWith(`${target}|`)) : hoverKeys.has(t)) return true
  }
  return false
}

// ── AST:字串片段、宣告單位、帶著 class 的識別字 ─────────────────────────────────

/** 會合併 class 的函式:它們的回傳值仍是「class 字串」,可以沿著傳下去 */
const CLASS_FNS = new Set(['cn', 'clsx', 'cx', 'twMerge', 'twJoin', 'classNames', 'cva'])

const calleeName = (call) => {
  const e = call.expression
  return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ''
}

/**
 * 初始值是不是「一個 class 值」:字串 / 樣板字串 / 字串組成的物件或陣列 / 三元與 && / 取索引或屬性 /
 * cn()·cva() 等合併呼叫。**函式不算**(元件本體、forwardRef、useMemo 的 callback)——
 * 否則整個元件的名字都會因為本體裡某處寫了 hover class 而變成 carrier,再一路擴散到全檔(2026-09-25 第一版實測:data-table.tsx 擴散到 300+ 個名字)。
 * 函式另走 fnCarriers,而且只在「被呼叫」時才生效(見 scanSource)。
 */
function isClassValue(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isNonNullExpression(node)) node = node.expression
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isIdentifier(node)) return true
  if (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) return isClassValue(node.expression)
  if (ts.isConditionalExpression(node)) return isClassValue(node.whenTrue) && isClassValue(node.whenFalse)
  if (ts.isBinaryExpression(node)) return isClassValue(node.right)
  if (ts.isArrayLiteralExpression(node)) return node.elements.every((e) => isClassValue(ts.isSpreadElement(e) ? e.expression : e) || e.kind === ts.SyntaxKind.FalseKeyword)
  if (ts.isObjectLiteralExpression(node)) return node.properties.every((p) => ts.isPropertyAssignment(p) && isClassValue(p.initializer))
  if (ts.isCallExpression(node)) return CLASS_FNS.has(calleeName(node)) || calleeName(node) === 'join'
  return false
}

const isFunctionNode = (n) => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)

/**
 * 一個節點底下的字串片段(字面值 / 樣板的每一段;註解天然不在其中)、被引用的識別字、被呼叫的識別字。
 * 物件 / 屬性存取的「名字」那一側不算引用(`CAT_ACCENT.blue` 的 blue、`{ blue: … }` 的 blue)。
 */
function collect(node, sf) {
  const pieces = [], idents = [], calls = []
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line
  const walk = (x) => {
    if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) { pieces.push({ text: x.text, line: lineOf(x) }); return }
    if (ts.isTemplateExpression(x)) {
      pieces.push({ text: x.head.text, line: lineOf(x.head) })
      for (const span of x.templateSpans) { walk(span.expression); pieces.push({ text: span.literal.text, line: lineOf(span.literal) }) }
      return
    }
    if (ts.isIdentifier(x)) { idents.push({ name: x.text, line: lineOf(x) }); return }
    if (ts.isCallExpression(x) && ts.isIdentifier(x.expression)) calls.push({ name: x.expression.text, line: lineOf(x) })
    if (ts.isPropertyAccessExpression(x)) { walk(x.expression); return }
    if (ts.isPropertyAssignment(x)) { walk(x.initializer); return }
    ts.forEachChild(x, walk)
  }
  walk(node)
  return { pieces, idents, calls }
}

/** 同一份原始碼只解析一次(carrier 推導與逐檔掃描都要用 AST) */
const parsed = new Map()
const parse = (source, path) => {
  const hit = parsed.get(path)
  if (hit && hit.source === source) return hit.sf
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  parsed.set(path, { source, sf })
  return sf
}

const isEscaped = (lines, line) => lines.slice(Math.max(0, line - LOOKBACK), line + 1).some((l) => ESCAPE.test(l))

/**
 * 一個檔裡:
 *   decls   —「class 值」const(任何作用域)與「初始值是呼叫某個函式」的 const:名字、自帶的 hover 鍵與 transition 鍵、引用、是否 export
 *   fns     — 具名函式(function 宣告 / const 箭頭函式):名字、本體字串裡的 hover 鍵、是否 export
 *   imports — import 進來的名字 → 來源模組與原名
 * 自帶的 transition 若已 escape,就不沿著 const 傳出去。
 */
function readDeclarations(source, path) {
  const sf = parse(source, path)
  const lines = source.split('\n')
  const decls = [], fns = [], imports = []
  const isExported = (stmt) => !!stmt?.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  const ownKeys = (node) => {
    const { pieces, idents } = collect(node, sf)
    const hover = new Set(), trans = new Set()
    for (const p of pieces) {
      for (const k of hoverKeysOf(p.text)) hover.add(k)
      if (!isEscaped(lines, p.line)) for (const k of transitionKeysOf(p.text)) trans.add(k)
    }
    return { hover, trans, refs: new Set(idents.map((i) => i.name)) }
  }
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const stmt = n.parent && n.parent.parent
      const exported = !!(stmt && ts.isVariableStatement(stmt) && stmt.parent === sf && isExported(stmt))
      if (isFunctionNode(n.initializer)) fns.push({ name: n.name.text, hover: ownKeys(n.initializer).hover, exported })
      else if (isClassValue(n.initializer)) decls.push({ name: n.name.text, ...ownKeys(n.initializer), exported })
      else if (ts.isCallExpression(n.initializer) && ts.isIdentifier(n.initializer.expression)) {
        // `const X = someFn('wrapper')`:本身不是 class 值,但 someFn 若回傳 hover class,X 就帶著它(FIELD_DEFAULT_CHROME_COMPOUNDS)
        decls.push({ name: n.name.text, hover: new Set(), trans: new Set(), refs: new Set(), callee: n.initializer.expression.text, exported })
      }
    }
    if (ts.isFunctionDeclaration(n) && n.name && n.body) fns.push({ name: n.name.text, hover: ownKeys(n.body).hover, exported: isExported(n) })
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings)) {
      for (const el of n.importClause.namedBindings.elements) {
        imports.push({ from: n.moduleSpecifier.text, imported: (el.propertyName ?? el.name).text, local: el.name.text })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return { decls, fns, imports }
}

/** import 路徑 → 專案內相對 src 的檔名(對齊 tsconfig 的 `@/design-system/*`、`@/lib/*`) */
function resolveImport(fromPath, spec, known) {
  let base
  if (spec.startsWith('@/design-system/')) base = spec.slice('@/design-system/'.length)
  else if (spec.startsWith('@/lib/')) base = `lib/${spec.slice('@/lib/'.length)}`
  else if (spec.startsWith('.')) base = join(dirname(fromPath), spec).split('\\').join('/')
  else return null
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) if (known.has(base + ext)) return base + ext
  return null
}

/** 把 b 的鍵併進 a;回傳 a 有沒有變大 */
const absorb = (a, b) => { const before = a.size; for (const k of b) a.add(k); return a.size !== before }
const carrierOf = (map, name) => { if (!map.has(name)) map.set(name, { hover: new Set(), trans: new Set() }); return map.get(name) }

/**
 * @param {Map<string,string>} files 相對 src 的路徑 → 原始碼
 * @returns {Map<string, { vars: Map<string,{hover:Set<string>,trans:Set<string>}>, fns: Map<string,{hover:Set<string>}> }>}
 *   每個檔裡「帶著 hover class / transition 的 const」與「回傳 hover class 的函式」
 */
export function hoverCarriers(files) {
  const info = new Map([...files].map(([p, src]) => [p, readDeclarations(src, p)]))
  const out = new Map([...files.keys()].map((p) => [p, { vars: new Map(), fns: new Map() }]))
  // 種子
  for (const [p, { decls, fns }] of info) {
    for (const d of decls) if (d.hover.size || d.trans.size) { const c = carrierOf(out.get(p).vars, d.name); absorb(c.hover, d.hover); absorb(c.trans, d.trans) }
    for (const f of fns) if (f.hover.size) absorb(carrierOf(out.get(p).fns, f.name).hover, f.hover)
  }
  // 衍生到不動為止:同檔 const 引用了 carrier / 呼叫了回傳 hover class 的函式 → 自己也帶上;import 進來的 exported carrier → 本地名字也帶上
  for (let changed = true; changed;) {
    changed = false
    for (const [p, { decls, imports }] of info) {
      const { vars, fns: fnMap } = out.get(p)
      for (const imp of imports) {
        const target = resolveImport(p, imp.from, files)
        if (!target) continue
        const there = info.get(target), carried = out.get(target)
        if (there.decls.some((d) => d.exported && d.name === imp.imported) && carried.vars.has(imp.imported)) {
          const c = carrierOf(vars, imp.local), src = carried.vars.get(imp.imported)
          if (absorb(c.hover, src.hover) | absorb(c.trans, src.trans)) changed = true
        }
        if (there.fns.some((f) => f.exported && f.name === imp.imported) && carried.fns.has(imp.imported)) {
          if (absorb(carrierOf(fnMap, imp.local).hover, carried.fns.get(imp.imported).hover)) changed = true
        }
      }
      for (const d of decls) {
        for (const r of d.refs) {
          if (r === d.name || !vars.has(r)) continue
          const c = carrierOf(vars, d.name), src = vars.get(r)
          if (absorb(c.hover, src.hover) | absorb(c.trans, src.trans)) changed = true
        }
        if (d.callee && fnMap.has(d.callee) && absorb(carrierOf(vars, d.name).hover, fnMap.get(d.callee).hover)) changed = true
      }
    }
  }
  return out
}

// ── 宣告單位與掃描 ────────────────────────────────────────────────────────────

/**
 * 宣告單位的根:一個 cn()/cva()… 呼叫、一個 *className 屬性、一個 class 值的 const、一個物件屬性的 class 值、
 * 或一段單獨的字串。由外往內找,找到就不再往下拆(cva 裡的 compoundVariants 物件屬於那一個 cva)。
 */
function unitRoot(n) {
  if (ts.isCallExpression(n) && CLASS_FNS.has(calleeName(n))) return n
  if (ts.isJsxAttribute(n) && /className$/i.test(n.name.getText()) && n.initializer) return n.initializer
  if (ts.isVariableDeclaration(n) && n.initializer && !ts.isObjectLiteralExpression(n.initializer) && !isFunctionNode(n.initializer) && isClassValue(n.initializer)) return n.initializer
  if (ts.isPropertyAssignment(n) && !ts.isObjectLiteralExpression(n.initializer) && !isFunctionNode(n.initializer) && isClassValue(n.initializer)) return n.initializer
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) return n
  return null
}

/**
 * @param {string} source
 * @param {string} [path]
 * @param {{ vars: Map<string,{hover:Set<string>,trans:Set<string>}>, fns: Map<string,{hover:Set<string>}> }} [carriers]
 *   這個檔裡「帶著 hover class / transition 的識別字」(見檔頭 2026-09-25 段)
 */
export function scanSource(source, path = '<inline>', carriers = { vars: new Map(), fns: new Map() }) {
  const sf = parse(source, path)
  const lines = source.split('\n')
  const hits = new Map()
  const report = (line) => { if (!hits.has(line) && !isEscaped(lines, line)) hits.set(line, { path, line: line + 1, text: lines[line].trim().slice(0, 90) }) }
  const scanUnit = (unit) => {
    const { pieces, idents, calls } = collect(unit, sf)
    // 各來源的 hover 鍵分開記:識別字自己帶來的過渡,只跟「別的來源」的 hover 配對(它自己的定義處已經被掃過一次)
    const sources = []
    for (const p of pieces) sources.push({ id: null, hover: hoverKeysOf(p.text) })
    for (const i of idents) { const c = carriers.vars.get(i.name); if (c) sources.push({ id: i.name, hover: c.hover }) }
    for (const c of calls) { const f = carriers.fns.get(c.name); if (f) sources.push({ id: `${c.name}()`, hover: f.hover }) }
    const hoverExcept = (id) => { const s = new Set(); for (const src of sources) if (src.id !== id || id === null) absorb(s, src.hover); return s }
    const all = hoverExcept(null)
    if (!all.size) return
    for (const p of pieces) { const t = transitionKeysOf(p.text); if (t.size && overlaps(t, all)) report(p.line) }
    for (const i of idents) {
      const c = carriers.vars.get(i.name)
      if (c?.trans.size && overlaps(c.trans, hoverExcept(i.name))) report(i.line)
    }
  }
  const visit = (n) => {
    const root = unitRoot(n)
    if (root) { scanUnit(root); return }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return [...hits.values()].sort((a, b) => a.line - b.line)
}

/** 掃一組檔(相對 src 的路徑 → 原始碼):只報非 story 檔的命中,但 carrier 從全部檔推導 */
export function scanProject(files) {
  const carriers = hoverCarriers(files)
  const hits = []
  for (const [p, src] of files) {
    if (p.endsWith('.stories.tsx')) continue
    hits.push(...scanSource(src, p, carriers.get(p)))
  }
  return hits
}

const walkDir = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkDir(p, out)
    else if ((name.endsWith('.tsx') || name.endsWith('.ts')) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

// 被 import 當模組時不得有副作用(判定函式要能單獨拿來驗)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain && process.argv.includes('--selftest')) {
  // 對照組:儀器要先證明它該紅的時候會紅(M32)
  const positive = `const rowVariants = cva([\n  'flex items-center',\n  'transition-colors duration-150',\n  'hover:bg-neutral-hover',\n])`
  const positiveAttr = `<div className={cn('transition-all', 'data-[hovered]:bg-neutral-hover')} />`
  const escaped = `const v = cva([\n  // @hover-transition-allow: 過渡屬於 checked 狀態切換,不是 hover\n  'transition-colors duration-150',\n  'data-[state=checked]:hover:bg-primary-hover',\n])`
  const negativeNoTransition = `const row = cn('hover:bg-neutral-hover', 'rounded-md')`
  const negativeFar = `const a = cn('transition-colors')\n${'\n'.repeat(20)}\nconst b = cn('hover:bg-neutral-hover')`
  const comments = (n) => Array.from({ length: n }, (_, i) => `    // 說明第 ${i + 1} 行`).join('\n')
  const cases = [
    ['hover 底色 + transition-colors', positive, 1],
    ['data-[hovered] 底色 + transition-all', positiveAttr, 1],
    ['寫了 escape 註解', escaped, 0],
    ['有 hover 底色但沒有過渡', negativeNoTransition, 0],
    ['過渡與 hover 底色相距 20 行以上(兩個 cn())', negativeFar, 0],
    // ── 2026-09-26 延伸(待辦總帳 L9 / N4(3)):字色、外框、滑過淡入、ring 也算 ──
    // 原本這一格是反例(「只有文字色 hover → 0」),延伸後必須反過來紅 —— 麵包屑連結的真實形狀
    ['字色 hover + transition-colors(麵包屑連結)', `const link = cn('hover:text-primary-hover', 'transition-colors duration-150')`, 1],
    ['外框 hover + transition-colors(Chip)', `const chip = cva([\n  'border border-border',\n  'transition-colors duration-150',\n  'hover:border-border-hover hover:text-foreground',\n])`, 1],
    ['滑過才出現的按鈕淡入(ItemSuffix 查表)', `const R = { row: "opacity-0 group-hover/row:opacity-100 transition-opacity duration-150" }`, 1],
    ['ring hover + transition-shadow(縮圖外框)', `const t = cn('transition-shadow duration-150', active ? 'ring-2 ring-primary' : 'ring-1 ring-border hover:ring-border-hover')`, 1],
    ['不帶後綴的 transition 也過渡字色', `const a = cn('transition', 'hover:text-foreground')`, 1],
    ['transition-[opacity] 任意值', `const a = cn('transition-[opacity] duration-150', 'group-hover/cell:opacity-100')`, 1],
    ['[@media(hover:hover)] 任意變體的字色', `const s = cn('transition-colors', '[@media(hover:hover)]:[&:where(:has(~[data-col-menu]:hover))]:text-foreground')`, 1],
    ['同一個 cn() 內相距 12 行(拖放區的真實形狀,舊版上下 8 行漏掉)', `const z = cn(\n    'cursor-pointer transition-colors',\n${comments(12)}\n    'data-[state=idle]:hover:border-drop-target-border',\n)`, 1],
    ['JSX className 字串(連結)', `const A = () => <a className="text-primary hover:text-primary-hover hover:underline transition-colors" />`, 1],
    // 反例:屬性族不同 / 目標不同 / 不同單位 → 不是 hover 在過渡
    ['箭頭 transition-transform 旁的 hover 字色(手風琴)', `const t = cn(\n  'transition-transform duration-200',\n  'hover:text-fg-secondary',\n)`, 0],
    ['transition-[width] 旁的 hover 底色(輪播指示點)', `const d = cn('transition-[width]', 'hover:bg-neutral-hover')`, 0],
    ['hover 微放大與陰影升級(不在同意範圍)', `const f = cn('transition-[transform,box-shadow]', 'hover:scale-[1.04] hover:shadow-[var(--elevation-200-hover)]')`, 0],
    ['分頁底線 after:transition-colors 旁的 hover 字色', `const tab = cva([\n  'after:bg-transparent after:transition-colors after:duration-150',\n  'hover:text-foreground',\n  'data-[state=active]:after:bg-primary',\n])`, 0],
    ['transition-none', `const a = cn('transition-none', 'hover:text-foreground')`, 0],
    ['父層過渡、相鄰子元素 hover(兩個 cn(),只隔一行)', `const A = () => <div className={cn('transition-colors')}>\n  <span className={cn('hover:bg-neutral-hover')} />\n</div>`, 0],
    ['開啟狀態的箭頭旋轉(group-data-[state=open] 不是 hover)', `const c = cn('transition-transform', 'group-data-[state=open]/x:rotate-180')`, 0],
  ]
  let bad = 0
  for (const [name, src, expected] of cases) {
    const n = scanSource(src, 'selftest.tsx').length
    const ok = n === expected
    console.log(`${ok ? '✓' : '✗'} ${name} — 期望 ${expected} 命中,實得 ${n}`)
    if (!ok) bad++
  }
  // 跨檔對照組:2026-09-25 Calendar 事件方塊的真實形狀(hover 底色在 .ts、過渡在 .tsx,中間隔兩個變數)
  const tokensTs = `/** Calendar event tile */\nexport const CAT_EVENT: Record<Hue, string> = {\n  blue: 'bg-[var(--color-blue-1)] text-[var(--color-blue-7)] hover:bg-[var(--color-blue-2)]',\n}\nexport const CAT_ACCENT = { blue: 'border-l-[3px]' }\n`
  const calendarTsx = (withTransition) => `import { CAT_EVENT, CAT_ACCENT } from '@/design-system/tokens/categorical-color'\nconst EVENT_COLOR_CLASSES = CAT_EVENT\nfunction Tile({ colorClass }: { colorClass: string }) {\n  return <div className={cn(\n    'rounded-md px-1.5 py-0.5 cursor-pointer${withTransition ? ' transition-colors' : ''}',\n    colorClass,\n  )} />\n}\nfunction Cell() {\n  const colorClass = allDay ? CAT_ACCENT.blue : EVENT_COLOR_CLASSES.blue\n  return <Tile colorClass={colorClass} />\n}\n`
  const project = (withTransition) => new Map([
    ['tokens/categorical-color.ts', tokensTs],
    ['components/Calendar/calendar.tsx', calendarTsx(withTransition)],
  ])
  // Textarea 的真實形狀:hover 外框由 field-wrapper 的函式回傳,再 spread 進另一個檔的 cva
  const fieldWrapper = `export function fieldDefaultChromeCompounds(host: string) {\n  return [{ mode: 'edit', className: 'border-border hover:border-border-hover' }]\n}\nexport const FIELD_DEFAULT_CHROME_COMPOUNDS = fieldDefaultChromeCompounds('wrapper')\n`
  const textarea = (base) => `import { fieldDefaultChromeCompounds } from '@/design-system/components/Field/field-wrapper'\nconst textareaVariants = cva(['w-full', '${base}'], {\n  compoundVariants: [\n    ...fieldDefaultChromeCompounds('control'),\n  ],\n})\n`
  const composite = `import { FIELD_DEFAULT_CHROME_COMPOUNDS } from '@/design-system/components/Field/field-wrapper'\nexport const fieldChromeStyles = cva('transition-colors duration-150', { compoundVariants: FIELD_DEFAULT_CHROME_COMPOUNDS })\n`
  // 已 escape 的 cva 在元件本體被 cn() 引用:不得在引用處再報一次(Checkbox 的真實形狀)
  const checkbox = `const checkboxVariants = cva([\n  // @hover-transition-allow: 過渡屬於 checked 狀態切換,不是 hover\n  'transition-colors duration-150',\n  'hover:border-border-hover',\n])\nconst Checkbox = () => <Root className={cn(checkboxVariants({ size }), className)} />\n`
  const crossCases = [
    ['跨檔:.ts 裡的 hover 底色經兩層變數傳進有 transition-colors 的 cn()(Calendar 事件方塊)', project(true), 1],
    ['跨檔:同一條路徑但沒有過渡', project(false), 0],
    ['.ts 檔自己同時寫了 hover 底色與過渡', new Map([['lib/x.ts', `export const row = cn('transition-colors', 'hover:bg-neutral-hover')`]]), 1],
    ['無關的 const 與過渡同框(名字不是 carrier)', new Map([['lib/y.ts', `export const plain = 'text-body'`], ['components/z.tsx', `import { plain } from '@/design-system/lib/y'\nconst a = cn('transition-colors', plain)`]]), 0],
    // 2026-09-26:carrier 帶著屬性族 —— 字色 hover 經 import 傳進有 transition-colors 的 cn() 要紅;
    // 同一個 carrier 傳進只有 transition-transform 的 cn() 不紅(屬性族不同)
    ['跨檔:.ts 裡的字色 hover 經 import 傳進有 transition-colors 的 cn()', new Map([['lib/link.ts', `export const LINK = 'text-primary hover:text-primary-hover'`], ['components/a.tsx', `import { LINK } from '@/design-system/lib/link'\nconst a = cn('transition-colors', LINK)`]]), 1],
    ['跨檔:同一個字色 carrier 旁只有 transition-transform', new Map([['lib/link.ts', `export const LINK = 'text-primary hover:text-primary-hover'`], ['components/a.tsx', `import { LINK } from '@/design-system/lib/link'\nconst a = cn('transition-transform', LINK)`]]), 0],
    ['跨檔:函式回傳的 hover 外框 spread 進有 transition-colors 的 cva(Textarea)', new Map([['components/Field/field-wrapper.tsx', fieldWrapper], ['components/Textarea/textarea.tsx', textarea('transition-colors duration-150')]]), 1],
    ['跨檔:同一個 spread 但 cva 沒有過渡', new Map([['components/Field/field-wrapper.tsx', fieldWrapper], ['components/Textarea/textarea.tsx', textarea('rounded-md')]]), 0],
    ['跨檔:函式回傳值存成 const 再 import 進有過渡的 cva(複合欄位外框)', new Map([['components/Field/field-wrapper.tsx', fieldWrapper], ['components/X/x.tsx', composite]]), 1],
    ['已 escape 的 cva 在元件本體被 cn() 引用(Checkbox)', new Map([['components/Checkbox/checkbox.tsx', checkbox]]), 0],
  ]
  for (const [name, files, expected] of crossCases) {
    const n = scanProject(files).length
    const ok = n === expected
    console.log(`${ok ? '✓' : '✗'} ${name} — 期望 ${expected} 命中,實得 ${n}`)
    if (!ok) bad++
  }
  console.log(bad ? `\n✗ selftest ${bad} 項不符` : `\n✓ selftest:${cases.length + crossCases.length} 個正反例 —— 正例會紅、反例不會紅、escape 有效`)
  process.exit(bad ? 1 : 0)
}

if (isMain) {
  const files = new Map(walkDir(ROOT).map((p) => [relative(ROOT, p).split('\\').join('/'), readFileSync(p, 'utf8')]))
  const hits = scanProject(files)
  if (hits.length) {
    console.error('✗ hover 造成的變化仍有過渡(底色 user 2026-09-10 拍板;字色 / 外框 / 滑過淡入 2026-09-26 同意 —— 一律瞬間;SSOT = tokens/motion/motion.spec.md):')
    for (const h of hits) console.error(`  ${h.path}:${h.line}  ${h.text}`)
    console.error('\n  修法:把會過渡該屬性的 transition(transition-colors / -opacity / -shadow / -all / transition)從那段 class 拿掉;')
    console.error('  真的屬於「狀態切換」而不是 hover 的(清單見 motion.spec.md「唯一的例外」),在該行上方寫 `// @hover-transition-allow: <理由>`。')
    process.exit(1)
  }
  console.log(`✓ 全 DS 的 hover 回饋都是瞬間切換(底色 / 字色 / 外框 / ring / 淡入皆無殘留過渡;掃了 ${files.size} 個 .tsx / .ts)`)
}

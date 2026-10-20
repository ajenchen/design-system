#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 的教學頁(全部 *.principles.stories.tsx,以及 Patterns 文件頁裡用到教學框的 story 檔)的段落 / 規則版面只來自
 *         stories-helpers/examples/tutorial-page.tsx(user 2026-10-07「第一題照你建議」= 建議 ②:規則之間 = 段落之間 = loose × 2、
 *         段落標題 text-h3 半粗體 + 淺分隔線、所有教學頁收成一個共用元件);各頁不自抄 Rule / Section、不手寫段落 / 規則之間的間距;
 *         共用元件本身仍是 ② 的寫法(值由 loose 推出、不借 --layout-space-bottom)。2026-10-20 起另守:「使用指引」固定三段
 *         (T4 甲)、說明 / 清單 / 連結 / 對錯記號各只有一種寫法、頁根擁有 text-body、Tokens / Patterns 文件頁的段落也是 TutorialSection(T7 甲)。
 *   紅: 教學頁自抄教學框(看結構不看名字:小元件回傳的區塊以手寫標題開頭,改名照樣紅)、手寫 <h2> / <section>、規則或段落被別的容器包著
 *       (間距不再由共用元件給)、TutorialPage / TutorialSection 直接子層是手寫標題、以標題開頭的區塊、或下一層藏著 ≥ 2 則手刻規則、
 *       直接子層自帶間距(margin / padding / 空白 spacer / style;sm: / [&>*+*]: 這類前綴照樣算;className / style 讀不到值也算)、
 *       TutorialPage 帶間距 / 字級、createTutorialRule 不在 module 層、設計原則頁的 story(物件 story 的 render 與 CSF2 函式 story)根節點
 *       不是 TutorialPage、設計原則頁完全沒用共用元件、loose × 2 寫在共用元件以外、共用元件改成別的值 / 別的標題;使用指引不是依序三段
 *       UsageSection / 名稱不是「使用指引」、自抄說明元件、caption / noteTone 選項、手寫 LinkTo / 說明清單 / 工具列高度、✓ ✗ ⚠ 記號、清單項或手寫標題帶
 *       對錯記號、範例區只放空元素、Tokens / Patterns 頁手寫 h2 / section 或疊 ≥ 2 塊以標題開頭的區塊 → 指名 file:line,exit 1;
 *       --selftest 以 c6c192a1 與 be2f1324 的真檔(git blob 驗明正身)與合成違規(含 2026-10-14 審查抓到的七種繞法)證明每一條在指定行紅。
 *   綠: 現況 0 筆;合成的乾淨教學頁(含 fragment / 條件式 / .map 包住的規則、render 內定義再回傳 TutorialPage 的小元件、範例裡的產品標題、
 *       左右並排的多欄比較、清單自己的縮排 / 列距、只渲染元件本身的 story)0 筆。純靜態(TypeScript AST)、不讀時間、不開瀏覽器,
 *       重複跑結果相同;掃到 0 個設計原則頁、讀不到共用元件 = 儀器失效(exit 2),不讀成通過。
 *
 * SSOT:packages/design-system/src/stories-helpers/examples/tutorial-page.tsx(元件與 ② 的出處);
 *       packages/design-system/ds-canonical/skills/story-writing/references/category-templates.md「教學框的間距與標題」(規範文字);
 *       packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md 規則 3(指標:這一級只定義在教學頁)。
 *
 * 為什麼要有這支(2026-10-14):研究時 66 個設計原則頁 + Action Bar 教學框各自抄一份 Rule / Section,段落標題至少 6 種長相、
 * 段落之間的間距有 16 / 32 / 33 三種(gap + 下方 margin 疊加、或分隔線 + 內距)—— 同一個值散在 60 個檔,只要有一頁照舊寫,② 就漂回去。
 * 收成一個元件之後,這支閘守「不准再繞過它」:
 *
 *   (R1) 設計原則頁(*.principles.stories.tsx)必須用 TutorialPage,且每則 story 的根節點是 TutorialPage —— 物件 story 看 render,
 *        CSF2 函式 story(export 的箭頭函式 / function)看它回傳的 JSX(根節點是同檔定義的小元件時,追到它回傳的根節點;
 *        沒有 render 的物件 story 只渲染元件本身,不在範圍)。
 *   (R2) 教學頁不得自抄教學框,也不得手寫 <h2> / <section>(段落外框只能來自 TutorialSection)。「自抄」看結構、不看名字:
 *        module 層的小元件,回傳的區塊沿著第一個子節點(穿過手寫容器與同檔小元件)先碰到 h1–h6 = 手刻的規則 / 段落外框;
 *        教學頁裡根節點本身就是 h1–h6 的標題小元件也算。其餘 Patterns 文件頁只查小元件,不查 story 本身(那是那一頁的內容)。
 *   (R3) TutorialRule / TutorialSection 的父層(略過 fragment、{運算式}、.map)只能是 TutorialPage / TutorialSection,
 *        TutorialSection 只能在 TutorialPage 裡 —— 否則規則之間的間距是別的容器在給(手寫間距的形狀之一)。
 *   (R4) TutorialPage / TutorialSection 的直接子層(同檔小元件追到它回傳的根節點;範例排版小幫手 ExampleGroup 本身沒有框,
 *        跟手寫元素一樣看):
 *        · 不得是手寫標題(h1–h6)、不得以標題開頭(= 手刻的規則 / 段落外框;2026-10-20 起「標題樣式的一行字」—— span / p / code
 *          加半粗體、大寫小字、text-h* —— 開頭也算,T8)、裡面也不得藏著上下疊的 ≥ 2 塊以標題開頭的區塊
 *          (= 一層之下的手刻規則);左右並排的比較(多欄 grid、橫向 flex)不算疊,但每一欄照樣往下查;
 *        · 不得自帶間距 —— 手寫元素:上下 margin / 上下 padding / 撐高度的空塊(m / mt / mb / my / p / pt / pb / py / h / min-h / size)
 *          與同義的 style 鍵;元件:只看 margin(padding / 高度在它自己的框內)。sm: / hover: / *: / [&>*+*]: 這類前綴不能拿來繞過;
 *          className / style 不是字面值、或用 {...展開},閘讀不到 = 不放行(沒讀到 ≠ 沒有)。
 *        範例裡的產品標題(卡片標題等)在規則裡面,不受影響。
 *   (R5) TutorialPage 的 className / style 不得帶間距(gap / space / m* / p*,含前綴;margin / padding / gap 的 style 鍵)—— 間距由共用元件擁有;
 *        也不得帶字級 / 字色(text-*)—— 內文字級 text-body 由共用元件擁有(2026-10-20 T2)。
 *   (R6) createTutorialRule(…) 只能在 module 層呼叫(寫在 render 裡會每次重建元件;story-rules.md「小元件定義在 module 層」)。
 *   (R7) 「loose × 2」(calc(var(--layout-space-loose) * 2))只准寫在 tutorial-page.tsx;寫在別處 = 手寫段落 / 規則間距。
 *   (R8) tutorial-page.tsx 本身仍是 ②:塊距 = calc(var(--layout-space-loose)*2)、不出現 --layout-space-bottom、
 *        段落標題 <h2> = text-h3 + font-semibold + border-divider、規則標題 <h3> = text-h6 + font-semibold;
 *        (2026-10-20)頁根有 text-body、使用指引三段段名 = 何時用 / 何時不用 / 和相近元件怎麼選、沒有 noteTone、
 *        規則說明 = text-caption + text-fg-muted、判斷「有沒有範例」用 Children.toArray(不是 Children.count)。
 *   (R9) 設計原則頁的「使用指引」(UsageGuidance):story 名稱「使用指引」、TutorialPage 底下依序剛好三段
 *        <UsageSection kind="when" / "whenNot" / "siblings">(T4 甲);沒有 UsageGuidance 的頁必須是被接受的舊 split style
 *        (category-templates.md「Legacy aliases 接受」,例:InlineEdit);UsageSection 不准用在別則 story;不准手寫同名 TutorialSection。
 *   (R10) 單一住所(T6 / T3 / T5):不自定說明元件(根節點是 caption / footnote 字級的小元件)、createTutorialRule 不帶 caption / noteTone、
 *        不手寫 LinkTo(用 StoryLink)、不手寫說明清單(用 TutorialList;排成 flex / grid 的範例清單不算)、對錯記號只用 ✅ / ❌
 *        (規則標題與 ExampleCaption 不得用 ✓ ✗ ✕ ✔ ✘ ⚠)、清單項與手寫標題不以對錯記號開頭(對錯寫在規則標題 / 說明)、
 *        畫面上不顯示 Markdown 反引號(用 <code>)、規則範例裡不逐顆寫 self-start(自然寬度 = createTutorialRule({ naturalWidth }))、
 *        不手刻工具列 / 標題列(橫向置中一列寫死 px 高度;工具列示範框用 ChromeHeader,T9)。
 *   (R11) 規則的範例區不放空元素(<div /> 這類畫不出東西卻佔一段範例區;T13)。
 *   (R12) Tokens / Patterns 文件頁(tokens/** 與 patterns/** 的 *.stories.tsx,不論有沒有 import 共用元件):story 裡疊了 ≥ 2 塊以標題
 *        (h1–h6,或大寫小字 / text-h* / 半粗體的一行字)開頭的區塊 = 手刻的段落 → 改用 TutorialPage + TutorialSection(T7 甲);
 *        這些頁手寫 <h2> / <section> 也由 R2 收(chrome / 浮層標題槽 *Header 裡的 <h2> 是範例的產品標題,不算)。
 *
 * 教學頁的範圍:全部 *.principles.stories.tsx(R1–R11),加上 tokens/** 與 patterns/** 裡 import 共用元件的 *.stories.tsx(R2–R6、R10、R11);
 * 其餘 Tokens / Patterns 文件頁只收「自抄教學框小元件」、手寫 <h2> / <section>(R2)與手刻段落清單(R12)。
 *
 *   node scripts/tutorial-page-invariant.mjs              判定(exit 0 綠 / 1 紅 / 2 儀器失效)
 *   node scripts/tutorial-page-invariant.mjs --selftest   對照組
 *   node scripts/tutorial-page-invariant.mjs --root=<dir> 判定另一棵樹(例:c6c192a1 的 export,證明舊寫法會紅)
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SELF = 'scripts/tutorial-page-invariant.mjs'
export const HELPER = 'packages/design-system/src/stories-helpers/examples/tutorial-page.tsx'
const SRC = 'packages/design-system/src'

export class InstrumentError extends Error {}

const HEADING = /^h[1-6]$/
// 以下三組都比對「去掉 variant 前綴之後的本體」(utilityBase):sm: / hover: / *: / [&>*+*]: 這類前綴不能拿來繞過
/** 頁 / 段落裡的手寫塊在塊距上再加一段:上下 margin、上下 padding、空塊撐高度(spacer) */
const BLOCK_SPACING = /^-?(?:m[tby]?|p[tby]?|h|min-h|size)-/
/** 元件(大寫標籤)的 padding / 高度是它自己框內的事,只有 margin 落在塊與塊之間 */
const BLOCK_MARGIN = /^-?m[tby]?-/
/** 有內容的手寫塊:高度是它自己的內容框(範例畫布),只看上下 margin / padding(2026-10-20:elevation 層級對比的 h-52 畫布) */
const BLOCK_PAD_MARGIN = /^-?(?:m[tby]?|p[tby]?)-/
const SPACING_UTILITY = /^-?(?:gap(?:-[xy])?|space-[xy]|[mp][trblxyse]?)-/
/** style 的鍵(去掉連字號、轉小寫後)—— 與上面兩組 class 同義 */
const STYLE_BLOCK_SPACING = /^(?:margin|padding)|^(?:min)?(?:height|blocksize)$/
const STYLE_MARGIN = /^margin/
const STYLE_PAGE_SPACING = /^(?:margin|padding|gap|rowgap|columngap)/
const CLASS_HELPERS = /^(?:cn|clsx|classnames|cx|twMerge)$/
const LOOSE_TIMES_TWO = /calc\(\s*var\(\s*--layout-space-loose\s*\)\s*\*\s*2\s*\)|calc\(\s*2\s*\*\s*var\(\s*--layout-space-loose\s*\)\s*\)/

/** 一個 class token 去掉 variant 前綴(`sm:` / `hover:` / `*:` / `[&>*+*]:`,方括號 / 圓括號裡的冒號不算)與 important 記號後的本體 */
export function utilityBase(token) {
  let depth = 0
  let cut = 0
  for (let i = 0; i < token.length; i++) {
    const ch = token[i]
    if (ch === '[' || ch === '(') depth++
    else if (ch === ']' || ch === ')') depth--
    else if (ch === ':' && depth === 0) cut = i + 1
  }
  return token.slice(cut).replace(/^!/, '').replace(/!$/, '')
}

/** 一筆命中 */
const hit = (rule, file, sf, node, message) => {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
  return { rule, file, line: line + 1, message }
}
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

const tagName = (sf, el) => (ts.isJsxElement(el) ? el.openingElement.tagName : el.tagName).getText(sf)
const isJsx = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)
const isFragment = (sf, n) => ts.isJsxFragment(n) || (ts.isJsxElement(n) && /^(?:React\.)?Fragment$/.test(tagName(sf, n)))
const attrs = (el) => (ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes).properties
const unwrap = (e) => {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e))) e = e.expression
  return e
}

/**
 * className 的 class(字面值,含 cn(…) / 條件式 / 樣板字串裡的字面值)。
 * 值來自變數 / 其他函式呼叫 = dynamic:閘讀不到,呼叫端一律當「無法證明沒有間距」處理(沒讀到 ≠ 沒有)。
 */
function classInfo(el) {
  const a = attrs(el).find((p) => ts.isJsxAttribute(p) && p.name.getText() === 'className')
  if (!a?.initializer) return { tokens: [], dynamic: false }
  const texts = []
  let dynamic = false
  const source = (e) => {
    e = unwrap(e)
    if (!e) return
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) { texts.push(e.text); return }
    if (ts.isTemplateExpression(e)) { texts.push(e.head.text); for (const s of e.templateSpans) { source(s.expression); texts.push(s.literal.text) } return }
    if (ts.isConditionalExpression(e)) { source(e.whenTrue); source(e.whenFalse); return }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) { source(e.right); return }
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.PlusToken) { source(e.left); source(e.right); return }
    }
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && CLASS_HELPERS.test(e.expression.text)) { for (const x of e.arguments) source(x); return }
    if (ts.isArrayLiteralExpression(e)) { for (const x of e.elements) source(x); return }
    if (e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined')) return
    dynamic = true
  }
  if (ts.isStringLiteral(a.initializer)) texts.push(a.initializer.text)
  else if (ts.isJsxExpression(a.initializer)) source(a.initializer.expression)
  else dynamic = true
  return { tokens: texts.join(' ').split(/\s+/).filter(Boolean), dynamic }
}
const classNameOf = (el) => classInfo(el).tokens.join(' ')

/** style 物件的鍵;不是字面物件、或有展開 / 計算鍵 = dynamic。沒有 style → null */
function styleInfo(el) {
  const a = attrs(el).find((p) => ts.isJsxAttribute(p) && p.name.getText() === 'style')
  if (!a) return null
  const obj = a.initializer && ts.isJsxExpression(a.initializer) ? unwrap(a.initializer.expression) : null
  if (!obj || !ts.isObjectLiteralExpression(obj)) return { keys: [], dynamic: true }
  const keys = []
  let dynamic = false
  for (const p of obj.properties) {
    if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) keys.push(p.name.text)
    else dynamic = true
  }
  return { keys, dynamic }
}

/** 一個元素自己帶的間距:class(去前綴後比對)、style 鍵、讀不到的值(dynamic className / style、{...展開})。 */
function ownSpacing(el, classRe, styleRe) {
  const found = []
  const { tokens, dynamic } = classInfo(el)
  for (const t of tokens) if (classRe.test(utilityBase(t))) found.push(`\`${t}\``)
  if (dynamic) found.push('className 不是字面值(閘讀不到,無法證明沒有間距)')
  const st = styleInfo(el)
  if (st) {
    for (const k of st.keys) if (styleRe.test(k.replace(/-/g, '').toLowerCase())) found.push(`style.${k}`)
    if (st.dynamic) found.push('style 不是字面物件(閘讀不到,無法證明沒有間距)')
  }
  if (attrs(el).some((p) => ts.isJsxSpreadAttribute(p))) found.push('{...展開屬性}(閘讀不到,無法證明沒有間距)')
  return found
}

/** 有框的手寫盒子(border / rounded / shadow / 不透明底色)= 範例本身:padding / 高度在它自己的框內,跟元件一樣只看 margin */
function isFramed(el) {
  return classInfo(el).tokens.map(utilityBase).some((b) => /^(?:border|rounded|shadow)(?:-|$)/.test(b) || (/^bg-/.test(b) && b !== 'bg-transparent'))
}
/** 沒有任何子節點(自閉合或只有空白)= 只撐高度的空塊 */
const isEmptyEl = (el) => ts.isJsxSelfClosingElement(el) || (ts.isJsxElement(el) && el.children.every((c) => (ts.isJsxText(c) && !c.text.trim()) || (ts.isJsxExpression(c) && !c.expression)))

/** 並排的容器(多欄 grid、橫向 flex):裡面以標題開頭的塊是左右比較的欄,不是上下疊的規則。 */
function isSideBySide(el) {
  const bases = classInfo(el).tokens.map(utilityBase)
  if (bases.some((b) => /^(?:inline-)?grid$/.test(b)) && bases.some((b) => /^grid-cols-(?:[2-9]|\d{2,}|\[.+\])$/.test(b))) return true
  if (bases.some((b) => /^(?:inline-)?flex$/.test(b)) && !bases.some((b) => /^flex-col/.test(b))) return true
  return false
}

/** 子節點攤平:fragment、{運算式}(含條件式與 .map 回傳的 JSX)都透明。 */
function flattenNodes(sf, children) {
  const out = []
  const visitExpr = (e) => {
    if (!e) return
    if (isJsx(e) || ts.isJsxFragment(e)) return visitNode(e)
    if (ts.isParenthesizedExpression(e)) return visitExpr(e.expression)
    if (ts.isConditionalExpression(e)) { visitExpr(e.whenTrue); visitExpr(e.whenFalse); return }
    if (ts.isBinaryExpression(e)) { visitExpr(e.left); visitExpr(e.right); return }
    if (ts.isCallExpression(e)) { for (const a of e.arguments) visitExpr(a); return }
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
      if (ts.isBlock(e.body)) { for (const st of e.body.statements) if (ts.isReturnStatement(st)) visitExpr(st.expression) } else visitExpr(e.body)
      return
    }
    if (ts.isArrayLiteralExpression(e)) { for (const x of e.elements) visitExpr(x) }
  }
  const visitNode = (n) => {
    if (isFragment(sf, n)) { for (const c of n.children) visitChild(c); return }
    out.push(n)
  }
  const visitChild = (c) => {
    if (ts.isJsxText(c)) return
    if (ts.isJsxExpression(c)) return visitExpr(c.expression)
    visitNode(c)
  }
  for (const c of children) visitChild(c)
  return out
}
const flatChildren = (sf, el) => (ts.isJsxElement(el) || ts.isJsxFragment(el) ? flattenNodes(sf, el.children) : [])

/** 第一個子節點(略過空白與 {/* 註解 *\/});前面是非空白文字或不是 JSX 的 {運算式} → null(不是「以它開頭」) */
function firstChild(sf, el) {
  if (!(ts.isJsxElement(el) || ts.isJsxFragment(el))) return null
  for (const c of el.children) {
    if (ts.isJsxText(c)) { if (c.text.trim()) return null; continue }
    if (ts.isJsxExpression(c) && !c.expression) continue
    return flattenNodes(sf, [c])[0] ?? null
  }
  return null
}

/** 名字 → 這個名字是否為 createTutorialRule(…) 的產物(本檔 module 層)。 */
function tutorialRuleNames(sf) {
  const names = new Set()
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue
    for (const d of st.declarationList.declarations) {
      if (d.initializer && ts.isCallExpression(d.initializer) && d.initializer.expression.getText(sf) === 'createTutorialRule' && ts.isIdentifier(d.name)) names.add(d.name.text)
    }
  }
  return names
}

/** 函式(箭頭 / function)回傳的 JSX 根節點;回傳的不是 JSX → null */
function fnRoot(fn) {
  let body = fn?.body
  if (!body) return null
  body = unwrap(body)
  if (isJsx(body) || ts.isJsxFragment(body)) return body
  if (ts.isBlock(body)) {
    const ret = body.statements.filter(ts.isReturnStatement).pop()
    const e = unwrap(ret?.expression)
    return e && (isJsx(e) || ts.isJsxFragment(e)) ? e : null
  }
  return null
}

/** module 層的函式元件:[{ name, fn, decl, exported }] */
function moduleFunctions(sf) {
  const out = []
  for (const st of sf.statements) {
    const exported = !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (ts.isFunctionDeclaration(st) && st.name && st.body) out.push({ name: st.name.text, fn: st, decl: st, exported })
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
      const init = unwrap(d.initializer)
      if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) out.push({ name: d.name.text, fn: init, decl: d, exported })
    }
  }
  return out
}

/** 同檔裡定義的小元件:從 from 往外一層層找(render 函式本體 → … → module 層),名字 → 它回傳的 JSX 根節點 */
function resolveLocal(sf, name, from) {
  const search = (stmts) => {
    for (const st of stmts) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === name) return fnRoot(st)
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
        const init = unwrap(d.initializer)
        if (ts.isIdentifier(d.name) && d.name.text === name && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return fnRoot(init)
      }
    }
    return null
  }
  for (let p = from; p; p = p.parent) {
    if (ts.isBlock(p) || ts.isSourceFile(p)) { const r = search(p.statements); if (r) return r }
  }
  return null
}

/**
 * 結構判斷(不看名字):一個節點是否「以手寫標題開頭」—— 沿著第一個子節點往下走(穿過 fragment、手寫容器、同檔小元件、
 * 範例排版小幫手 ExampleGroup / CaptionedExamples),先碰到 h1–h6 就是。共用元件(Tutorial*)、外部元件(範例)、
 * 並排容器(多欄 grid / 橫向 flex)停下。回傳標題標籤或 null。ctx = { isTutorialTag, isStackHelper }
 */
function leadingHeading(sf, node, ctx, depth = 0) {
  if (!node || depth > 8) return null
  if (isFragment(sf, node)) return leadingHeading(sf, firstChild(sf, node), ctx, depth + 1)
  if (!isJsx(node)) return null
  const t = tagName(sf, node)
  if (HEADING.test(t)) return t
  if (/^[A-Z]/.test(t) || t.includes('.')) {
    if (ctx.isTutorialTag(t)) return null
    if (ctx.isStackHelper(t)) return ts.isJsxElement(node) && !isSideBySideHelper(sf, node) ? leadingHeading(sf, firstChild(sf, node), ctx, depth + 1) : null
    const r = resolveLocal(sf, t, node)
    return r ? leadingHeading(sf, r, ctx, depth + 1) : null
  }
  if (!ts.isJsxElement(node) || isSideBySide(node)) return null
  return leadingHeading(sf, firstChild(sf, node), ctx, depth + 1)
}

/** 範例排版小幫手的 layout 不是直排(CaptionedExamples layout="row" / "wrap")= 並排 */
function isSideBySideHelper(sf, el) {
  const a = attrs(el).find((p) => ts.isJsxAttribute(p) && p.name.getText() === 'layout')
  return !!a?.initializer && ts.isStringLiteral(a.initializer) && a.initializer.text !== 'column'
}

/**
 * 結構判斷:node 底下(只走手寫元素、同檔小元件、範例排版小幫手,不進外部元件)有沒有一個上下疊的容器,裡面 ≥ 2 塊
 * 以手寫標題開頭(= 手刻的規則清單)。回傳那個容器或 null。並排容器本身不算疊,但它的每一欄照樣往下查。
 */
function stackedHeadingBlocks(sf, node, ctx, depth = 0) {
  if (!node || depth > 8) return null
  let stacked
  if (isJsx(node) && (/^[A-Z]/.test(tagName(sf, node)) || tagName(sf, node).includes('.'))) {
    const t = tagName(sf, node)
    if (ctx.isTutorialTag(t)) return null
    if (!ctx.isStackHelper(t)) {
      const r = resolveLocal(sf, t, node)
      return r ? stackedHeadingBlocks(sf, r, ctx, depth + 1) : null
    }
    stacked = !isSideBySideHelper(sf, node)
  } else stacked = ts.isJsxElement(node) && !isFragment(sf, node) && !isSideBySide(node)
  if (!(ts.isJsxElement(node) || ts.isJsxFragment(node))) return null
  const kids = flatChildren(sf, node)
  if (stacked && kids.filter((k) => leadingHeading(sf, k, ctx)).length >= 2) return node
  for (const k of kids) { const r = stackedHeadingBlocks(sf, k, ctx, depth + 1); if (r) return r }
  return null
}

/** 設計原則頁的 story:物件 story 的 render、以及函式 story(CSF2:export 的箭頭 / function 回傳 JSX)→ JSX 根節點 */
function storyRoots(sf) {
  const out = []
  const fromFn = (fn) => {
    let root = null
    const body = fn.body
    if (body && !ts.isBlock(body)) root = unwrap(body)
    else if (body && ts.isBlock(body)) root = unwrap(body.statements.filter(ts.isReturnStatement).pop()?.expression) ?? null
    return root
  }
  for (const st of sf.statements) {
    if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue
    if (st.modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) continue
    // export function X() { return … }(CSF2 函式 story)
    if (ts.isFunctionDeclaration(st) && st.name && st.body) { out.push({ name: st.name.text, node: st, root: fromFn(st) }); continue }
    if (!ts.isVariableStatement(st)) continue
    for (const d of st.declarationList.declarations) {
      const init = unwrap(d.initializer)
      if (!init) continue
      // export const X = () => …(CSF2 函式 story)
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) { out.push({ name: d.name.getText(sf), node: d, root: fromFn(init) }); continue }
      if (!ts.isObjectLiteralExpression(init)) continue
      const render = init.properties.find((p) => (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) && p.name.getText(sf) === 'render')
      if (!render) continue
      const fn = ts.isPropertyAssignment(render) ? unwrap(render.initializer) : render
      const root = fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isMethodDeclaration(fn)) ? fromFn(fn) : null
      out.push({ name: d.name.getText(sf), node: render, root })
    }
  }
  return out
}

// ── 2026-10-20 教學頁稽核(T2–T7 / T13)新增的判斷 ──────────────────────────────────────────────
/** 段落元件:TutorialSection 本身,與「使用指引」的固定段名包裝 UsageSection(它就是一個 TutorialSection) */
const SECTION_TAGS = new Set(['TutorialSection', 'UsageSection'])
/** 「使用指引」固定三段(tutorial-page.tsx USAGE_SECTION_TITLES;category-templates.md「Principles canonical」) */
export const USAGE_KINDS = ['when', 'whenNot', 'siblings']
export const USAGE_TITLES = { when: '何時用', whenNot: '何時不用', siblings: '和相近元件怎麼選' }
/** 手寫成 TutorialSection 的三段段名(含舊寫法「何時不用(…)」「vs 近親」)—— 應改用 UsageSection */
const USAGE_TITLE_LIKE = /^(?:何時用|何時不用|何時不該用|和相近元件怎麼選|vs 近親)/
/** category-templates.md「Legacy aliases 接受」:split style 至少兩個不同的判斷面向 */
const LEGACY_SPLIT = /^(?:WhenToUse|WhenNotToUse|Vs\w*Rule|ContentGuidelines)$/
/** 對錯記號只用 ✅ / ❌(✓ ✗ ✕ ✔ ✘ ⚠ 是 2026-10-20 前各頁各選的另一套) */
const BAD_MARK = /^[✓✗✕✔✘⚠]/
const VERDICT = /^[✅❌✓✗✕✔✘⚠]/
/** 說明開頭的方向箭頭(↑ / ← …)不算內容 */
const CAPTION_ARROW = /^[↑↓←→\s]+/
/** chrome / 浮層的標題槽(ChromeHeader / SurfaceHeader / DialogHeader …):裡面的 <h2> 是範例的產品標題(header-canonical 決策表),不是段落 */
const HEADER_SLOT = /Header$/
/** 手寫的清單排成範例版面(flex / grid)= 範例本身,不是說明清單 */
const LIST_LAYOUT = /^(?:inline-)?(?:flex|grid)$/
/** 畫面上原樣顯示的 Markdown 反引號(Storybook canvas 不解析 Markdown;T12) */
const LITERAL_BACKTICK = /`[^`\n]+`/
/** 不會顯示在畫面上的屬性(class / 識別 / 值)—— 反引號在這些屬性裡不算 */
const NON_RENDERED_ATTR = /^(?:className|class|kind|name|key|id|src|href|value|defaultValue|variant|size|type|align|side|mode|layout|role|style|data-.*)$/

/** 一個 JSX 屬性的初始值節點 */
const attrInit = (el, name) => attrs(el).find((p) => ts.isJsxAttribute(p) && p.name.getText() === name)?.initializer ?? null

/** 可見文字的開頭:字串、{字串}、fragment / 元素裡第一段非空白的文字(穿過 <code> 等行內元素) */
function leadingText(n, depth = 0) {
  if (!n || depth > 6) return ''
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text.trim()
  if (ts.isTemplateExpression(n)) return n.head.text.trim()
  if (ts.isJsxExpression(n)) return leadingText(n.expression, depth + 1)
  if (ts.isParenthesizedExpression(n)) return leadingText(n.expression, depth + 1)
  if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
    for (const c of n.children) {
      if (ts.isJsxText(c)) { if (c.text.trim()) return c.text.trim(); continue }
      if (ts.isJsxExpression(c) && !c.expression) continue
      return leadingText(c, depth + 1)
    }
  }
  return ''
}

/** 往上找:是否在某個 chrome / 浮層標題槽(*Header 元件)裡 */
function inHeaderSlot(sf, n) {
  for (let p = n.parent; p && !ts.isSourceFile(p); p = p.parent) if (ts.isJsxElement(p) && HEADER_SLOT.test(tagName(sf, p))) return true
  return false
}

/** 往上找:所在的 module 層 export 名稱(story 名);不在 export 裡 → null */
function enclosingExport(n) {
  for (let p = n; p && !ts.isSourceFile(p); p = p.parent) {
    if (ts.isVariableDeclaration(p) && ts.isVariableStatement(p.parent?.parent) && ts.isSourceFile(p.parent.parent.parent)) return ts.isIdentifier(p.name) ? p.name.text : null
    if (ts.isFunctionDeclaration(p) && ts.isSourceFile(p.parent)) return p.name?.text ?? null
  }
  return null
}

/**
 * 「看起來是標題的一行字」(T7:Tokens 文件頁的 SectionLabel = 大寫小字 <p>、`<p className="font-medium">Field Height</p>`、
 * 「<code font-medium>rounded-xs</code> + 說明」的標題列)—— 不是 h1–h6,但在頁面上就是段落 / 區塊的標題。
 * 有框的盒子(border / rounded / bg / shadow)是範例本身,不往裡看。
 */
function labelLike(sf, el, depth = 0) {
  if (!el || depth > 3 || !isJsx(el)) return false
  const t = tagName(sf, el)
  if (!/^(?:p|span|code|strong|div)$/.test(t)) return false
  const bases = classInfo(el).tokens.map(utilityBase)
  if (bases.some((b) => /^(?:border|rounded|shadow)(?:-|$)|^bg-/.test(b))) return false
  if (bases.includes('uppercase') || bases.some((b) => /^text-h[1-6]$/.test(b))) return true
  if (isSideBySide(el)) return labelLike(sf, firstChild(sf, el), depth + 1)
  if (bases.some((b) => /^font-(?:medium|semibold|bold)$/.test(b))) {
    // 一行字:子節點只有文字 / 行內元素(沒有區塊)
    const kids = ts.isJsxElement(el) ? flattenNodes(sf, el.children) : []
    return kids.every((k) => isJsx(k) && /^(?:code|strong|span|em|b)$/.test(tagName(sf, k)))
  }
  return false
}

/** Tokens / Patterns 文件頁用的結構判斷:同 leadingHeading,另把 labelLike 的一行字當標題 */
function leadingHeadingOrLabel(sf, node, ctx, depth = 0) {
  if (!node || depth > 8) return null
  if (isFragment(sf, node)) return leadingHeadingOrLabel(sf, firstChild(sf, node), ctx, depth + 1)
  if (!isJsx(node)) return null
  const t = tagName(sf, node)
  if (HEADING.test(t)) return t
  if (/^[A-Z]/.test(t) || t.includes('.')) {
    if (ctx.isTutorialTag(t)) return null
    const r = ctx.isStackHelper(t) ? (ts.isJsxElement(node) && !isSideBySideHelper(sf, node) ? firstChild(sf, node) : null) : resolveLocal(sf, t, node)
    return r ? leadingHeadingOrLabel(sf, r, ctx, depth + 1) : null
  }
  // 單獨一行的標題樣式字(token 表的分組列,後面接的是同一張表的列)不算;「區塊以它開頭」才是手刻段落
  if (depth > 0 && labelLike(sf, node)) return `${t}(標題樣式的一行字)`
  if (!ts.isJsxElement(node) || isSideBySide(node)) return null
  if (classInfo(node).tokens.map(utilityBase).some((b) => /^(?:border|rounded|shadow)(?:-|$)|^bg-/.test(b))) return null
  return leadingHeadingOrLabel(sf, firstChild(sf, node), ctx, depth + 1)
}

/** 同 stackedHeadingBlocks,但「標題」含 labelLike(Tokens / Patterns 文件頁的手刻段落清單) */
function stackedLabelBlocks(sf, node, ctx, depth = 0) {
  if (!node || depth > 8) return null
  let stacked
  if (isJsx(node) && (/^[A-Z]/.test(tagName(sf, node)) || tagName(sf, node).includes('.'))) {
    const t = tagName(sf, node)
    if (ctx.isTutorialTag(t)) return null
    if (!ctx.isStackHelper(t)) {
      const r = resolveLocal(sf, t, node)
      return r ? stackedLabelBlocks(sf, r, ctx, depth + 1) : null
    }
    stacked = !isSideBySideHelper(sf, node)
  } else stacked = ts.isJsxElement(node) && !isFragment(sf, node) && !isSideBySide(node)
  if (!(ts.isJsxElement(node) || ts.isJsxFragment(node))) return null
  const kids = flatChildren(sf, node)
  if (stacked && kids.filter((k) => leadingHeadingOrLabel(sf, k, ctx)).length >= 2) return node
  for (const k of kids) { const r = stackedLabelBlocks(sf, k, ctx, depth + 1); if (r) return r }
  return null
}

/**
 * 檢查一個教學頁檔。
 * @param {string} file  相對 repo 根的路徑(只用來決定範圍與印訊息)
 * @param {string} text  檔案內容
 */
export function checkTutorialFile(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const principles = file.endsWith('.principles.stories.tsx')
  // Patterns 文件頁:用到共用元件的才是教學頁(R2–R6 全收);其餘 Patterns 頁(anatomy 總覽、chrome header 範例)只收「自抄教學框」
  const teaching = principles || /from '@\/design-system\/stories-helpers\/examples\/tutorial-page'/.test(text)
  // Tokens / Patterns 文件頁(2026-10-20 T7 甲):段落一律 TutorialSection —— 不論有沒有 import 共用元件,手寫段落 / 標題清單都紅
  const docPage = /^packages\/design-system\/src\/(?:tokens|patterns)\//.test(file) && file.endsWith('.stories.tsx')
  const hits = []
  const ruleNames = tutorialRuleNames(sf)
  const isTutorialTag = (t) => t === 'TutorialPage' || SECTION_TAGS.has(t) || ruleNames.has(t)
  // 範例排版小幫手(example-captions.tsx 的 ExampleGroup / CaptionedExamples):只是把子節點直排,裡面的手寫標題照樣算
  const stackHelpers = new Set()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !/\/stories-helpers\/examples\/example-captions$/.test(st.moduleSpecifier.text)) continue
    const nb = st.importClause?.namedBindings
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) stackHelpers.add(el.name.text)
  }
  const ctx = { isTutorialTag, isStackHelper: (t) => stackHelpers.has(t) }
  const isTutorialRule = (n) => isJsx(n) && ruleNames.has(tagName(sf, n))
  const isTutorialSection = (n) => isJsx(n) && SECTION_TAGS.has(tagName(sf, n))
  const isTutorialPage = (n) => isJsx(n) && tagName(sf, n) === 'TutorialPage'
  let usesPage = false

  // (R2) 自抄教學框 —— 看結構不看名字:module 層的小元件,回傳的根節點以手寫標題開頭(= 手刻的規則 / 段落外框);
  //      教學頁裡連「根節點本身就是手寫標題」的標題小元件也算(規則 / 段落標題只能由共用元件畫)
  //      export 的函式是 story(CSF2),不是小元件:教學頁照查(設計原則頁另由 R1 要求根節點是 TutorialPage);
  //      其餘 Patterns 文件頁(anatomy 總覽、chrome header 範例)的 story 本身就是那一頁的內容,只查它自抄的小元件
  for (const c of moduleFunctions(sf)) {
    if (c.exported && !teaching) continue
    const root = fnRoot(c.fn)
    if (!root) continue
    const what = c.exported ? `story ${c.name} 自己手刻教學框` : `自定 ${c.name} 教學框`
    const rootTag = isJsx(root) ? tagName(sf, root) : null
    if (rootTag && HEADING.test(rootTag)) {
      if (teaching) hits.push(hit('R2', file, sf, c.decl, `自定標題小元件 ${c.name}(根節點就是 <${rootTag}>)—— 段落 / 規則標題只能由 TutorialSection / TutorialRule 畫`))
      continue
    }
    const lead = leadingHeading(sf, root, ctx)
    if (lead) hits.push(hit('R2', file, sf, c.decl, `${what}(回傳的區塊以手寫標題 <${lead}> 開頭)—— 改用 stories-helpers/examples/tutorial-page.tsx(TutorialSection / createTutorialRule)`))
    // (R10) 自定說明元件(2026-10-20 T6:53 頁各抄一份 Label、字色分岔)—— 根節點是 caption / footnote 字級的一行字
    if (teaching && !c.exported && rootTag && /^(?:p|span|div)$/.test(rootTag) && classInfo(root).tokens.map(utilityBase).some((b) => /^text-(?:caption|footnote)$/.test(b))) {
      hits.push(hit('R10', file, sf, c.decl, `自定說明元件 ${c.name}(根節點 <${rootTag}> 是 caption / footnote 字級)—— 範例的說明一律 ExampleCaption(stories-helpers/examples/example-captions.tsx)`))
    }
  }

  const walk = (n) => {
    // (R6) createTutorialRule 不在 module 層
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'createTutorialRule') {
      const decl = n.parent
      const atModule = ts.isVariableDeclaration(decl) && decl.initializer === n && ts.isVariableDeclarationList(decl.parent) && ts.isVariableStatement(decl.parent.parent) && ts.isSourceFile(decl.parent.parent.parent)
      if (!atModule) hits.push(hit('R6', file, sf, n, 'createTutorialRule(…) 不在 module 層 —— 寫在 render / 函式裡每次都會產生新元件(story-rules.md「小元件定義在 module 層」)'))
      // (R10) 各頁自帶說明元件 / 說明字色的舊選項(2026-10-20 T6 收掉:caption → examples: true + ExampleCaption;noteTone → 一律 fg-muted)
      const opts = unwrap(n.arguments[0])
      if (opts && ts.isObjectLiteralExpression(opts)) for (const pr of opts.properties) {
        const key = pr.name?.getText(sf)
        if (key === 'caption' || key === 'noteTone') hits.push(hit('R10', file, sf, pr, `createTutorialRule 的 ${key} 選項 —— ${key === 'caption' ? '說明元件只有 ExampleCaption 一份,範例區用 examples: true' : '規則說明一律 text-fg-muted(color.spec.md caption 列),不再逐頁選字色'}`))
      }
    }
    if (isJsx(n)) {
      const tag = tagName(sf, n)
      if (teaching) {
        // (R10) 連結 / 清單 / 對錯記號只有一種寫法(2026-10-20 T6 / T3 / T5)
        if (tag === 'LinkTo') hits.push(hit('R10', file, sf, n, '手寫 <LinkTo> + 自己的連結字色 —— 教學頁的 story 連結一律 StoryLink(tutorial-page.tsx)'))
        if ((tag === 'ul' || tag === 'ol') && !classInfo(n).tokens.map(utilityBase).some((b) => LIST_LAYOUT.test(b))) hits.push(hit('R10', file, sf, n, `手寫 <${tag}> 清單 —— 教學頁的說明清單一律 TutorialList(圓點 + 縮排 + 列距只住在 tutorial-page.tsx);排成 flex / grid 的範例清單不算`))
        const lead = leadingText(n)
        // (R10) Markdown 反引號會原樣顯示(T12:37 則 story 畫面上出現 `pressed` 這種字)—— 程式碼字樣用 <code>
        for (const a of attrs(n)) {
          if (!ts.isJsxAttribute(a) || !a.initializer || NON_RENDERED_ATTR.test(a.name.getText(sf))) continue
          const t = ts.isStringLiteral(a.initializer) ? a.initializer.text : ''
          if (LITERAL_BACKTICK.test(t)) hits.push(hit('R10', file, sf, a, `${a.name.getText(sf)} 裡的 Markdown 反引號「${t.match(LITERAL_BACKTICK)[0]}」會原樣顯示 —— 改用 <code>(title / note 都收 ReactNode)`))
        }
        // <code> / <pre> 裡的反引號是程式碼字樣本身(例:樣板字串),不算
        if (ts.isJsxElement(n) && tag !== 'code' && tag !== 'pre') for (const c of n.children) {
          const t = ts.isJsxText(c) ? c.text : ts.isJsxExpression(c) && c.expression && (ts.isStringLiteral(c.expression) || ts.isNoSubstitutionTemplateLiteral(c.expression)) ? c.expression.text : ''
          if (LITERAL_BACKTICK.test(t)) hits.push(hit('R10', file, sf, c, `<${tag}> 的文字裡有 Markdown 反引號「${t.match(LITERAL_BACKTICK)[0]}」會原樣顯示 —— 改用 <code>`))
        }
        if (tag === 'li' && VERDICT.test(lead)) hits.push(hit('R10', file, sf, n, `清單項以對錯記號開頭(「${lead.slice(0, 12)}…」)—— 對錯判斷寫在規則標題:每條改成一則 TutorialRule(title「❌ …」/「✅ …」)`))
        if (HEADING.test(tag) && VERDICT.test(lead) && !inHeaderSlot(sf, n)) hits.push(hit('R10', file, sf, n, `手寫的對錯標題 <${tag}>「${lead.slice(0, 12)}…」—— 對錯判斷寫在 TutorialRule 的標題,範例的對錯寫在 ExampleCaption`))
        // (R10) 範例維持自然寬度只有一個機制:createTutorialRule({ naturalWidth })(T15:32 處逐顆寫 self-start)
        if (classInfo(n).tokens.map(utilityBase).includes('self-start')) {
          // 只看「範例區那一層」:往上走到規則之前沒有經過任何手寫容器(div 等)—— 中間只隔著 Dialog / Trigger 這類元件包裝
          //(範例本身裡面的版面,例如藍圖裡 inline-flex 的 self-start,是範例自己的幾何,不算)
          for (let p = n.parent; p && !ts.isSourceFile(p); p = p.parent) {
            if (!ts.isJsxElement(p)) continue
            const pt = tagName(sf, p)
            if (ruleNames.has(pt)) { hits.push(hit('R10', file, sf, n, `規則範例裡逐顆寫 self-start —— 範例維持自然寬度由 createTutorialRule({ naturalWidth: true }) 一次給(整頁都是觸發鈕就整頁一個工廠,混合的頁另開一個 TriggerRule 工廠)`)); break }
            if (/^[a-z]/.test(pt)) break
          }
        }
        if (tag === 'ExampleCaption' && BAD_MARK.test(lead.replace(CAPTION_ARROW, ''))) hits.push(hit('R10', file, sf, n, `說明用了另一套對錯記號「${lead.slice(0, 6)}」—— 對錯記號只用 ✅ / ❌`))
        if (ruleNames.has(tag)) {
          const tl = leadingText(attrInit(n, 'title'))
          if (BAD_MARK.test(tl)) hits.push(hit('R10', file, sf, n, `規則標題用了另一套對錯記號「${tl.slice(0, 6)}」—— 對錯記號只用 ✅ / ❌`))
          // (R11) 範例區裡放空元素(2026-10-20 T13:Chart 那則規則只放一個 <div />,畫出一段看不見的範例區,規則之間多出 tight 空白)
          for (const c of flatChildren(sf, n)) {
            if (ts.isJsxSelfClosingElement(c) && /^[a-z]/.test(tagName(sf, c)) && attrs(c).length === 0) hits.push(hit('R11', file, sf, c, `規則的範例區只放了空的 <${tagName(sf, c)} /> —— 畫不出任何東西卻佔一段範例區(規則之間不再是 loose × 2);沒有範例就不給 children`))
          }
        }
      }
      // (R10,T9)手刻的工具列 / 標題列:橫向置中的一列寫死 px 高度 —— 高度與標題字由 ChromeHeader 擁有(--chrome-header-height,
      //  header-canonical.spec.md 決策表「固定在版面上的工具列 → ChromeHeader」;2026-10-20 前 Action Bar 的 ToolbarFrame 兩種密度都 52px)
      if ((teaching || docPage) && /^[a-z]/.test(tag)) {
        const bases = classInfo(n).tokens.map(utilityBase)
        if (bases.some((b) => /^(?:inline-)?flex$/.test(b)) && bases.includes('items-center') && bases.some((b) => /^(?:min-)?h-\[\d+(?:\.\d+)?px\]$/.test(b))) {
          hits.push(hit('R10', file, sf, n, `手刻的工具列 / 標題列(橫向一列寫死 ${bases.find((b) => /h-\[/.test(b))})—— 工具列示範框用 ChromeHeader(高度跟 --chrome-header-height、標題 text-body-lg font-medium)`))
        }
      }
      // (R9) 「使用指引」的三段只住在 UsageGuidance;別處手寫同名段落 = 第二份段名
      if (principles && tag === 'UsageSection' && enclosingExport(n) !== 'UsageGuidance') hits.push(hit('R9', file, sf, n, `UsageSection 用在 ${enclosingExport(n) ?? '(story 以外)'} —— 何時用 / 何時不用 / 和相近元件怎麼選 這三段只屬於「使用指引」(UsageGuidance)`))
      if (teaching && tag === 'TutorialSection' && USAGE_TITLE_LIKE.test(leadingText(attrInit(n, 'title')))) hits.push(hit('R9', file, sf, n, `手寫段名「${leadingText(attrInit(n, 'title'))}」—— 使用指引的三段改用 <UsageSection kind>(段名只住在 tutorial-page.tsx)`))
      if (tag === 'TutorialPage') {
        usesPage = true
        // (R5) 頁根的 className / style 不得帶間距(variant 前綴也算:[&>*+*]:mt-8、*:mb-8)
        const own = ownSpacing(n, SPACING_UTILITY, STYLE_PAGE_SPACING)
        if (own.length) hits.push(hit('R5', file, sf, n, `TutorialPage 帶間距 ${own.join(' ')} —— 頁裡的間距由共用元件擁有,這裡只放寬度`))
        // (R5) 字級 / 字色也由共用元件擁有(2026-10-20 T2:TutorialPage 自己就是 text-body)
        const typo = classInfo(n).tokens.filter((t) => /^text-/.test(utilityBase(t)))
        if (typo.length) hits.push(hit('R5', file, sf, n, `TutorialPage 自帶字級 / 字色 ${typo.map((t) => `\`${t}\``).join(' ')} —— 內文字級由共用元件擁有(text-body,typography.spec.md:39),這裡只放寬度`))
      }
      // (R2) 手寫 h2 / section(chrome / 浮層標題槽裡的 <h2> 是範例的產品標題,不算)
      if ((teaching || docPage) && (tag === 'h2' || tag === 'section') && !inHeaderSlot(sf, n)) hits.push(hit('R2', file, sf, n, `手寫 <${tag}> —— ${teaching ? '教學頁' : 'Tokens / Patterns 文件頁'}的段落外框只能來自 TutorialSection`))
      // (R4) 段落 / 頁的直接子層
      if (tag === 'TutorialPage' || SECTION_TAGS.has(tag)) {
        for (const c of flatChildren(sf, n)) {
          if (!isJsx(c)) continue
          const ct = tagName(sf, c)
          if (isTutorialTag(ct)) continue
          const intrinsic = /^[a-z]/.test(ct)
          // 範例排版小幫手(ExampleGroup 等)本身沒有框,跟手寫元素一樣看待;同檔小元件看它回傳的根節點;其餘元件是範例
          const frameless = (intrinsic && !isFramed(c)) || ctx.isStackHelper(ct)
          // 塊自己帶間距 = 在共用元件的塊距(loose × 2)上再手寫一段:
          //   手寫元素 / 排版小幫手 → 上下 margin / 上下 padding / 撐高度的空塊(h / min-h / size)/ 同義的 style;
          //   元件 → 只看 margin(padding / 高度在它自己的框內)
          const own = frameless ? ownSpacing(c, isEmptyEl(c) ? BLOCK_SPACING : BLOCK_PAD_MARGIN, STYLE_BLOCK_SPACING) : ownSpacing(c, BLOCK_MARGIN, STYLE_MARGIN)
          // 同檔小元件:真正放進頁裡的是它回傳的根節點
          const resolved = frameless ? c : resolveLocal(sf, ct, c)
          if (!frameless && resolved && isJsx(resolved) && /^[a-z]/.test(tagName(sf, resolved))) {
            for (const x of ownSpacing(resolved, BLOCK_SPACING, STYLE_BLOCK_SPACING)) own.push(`${x}(${ct} 回傳的 <${tagName(sf, resolved)}>,:${lineOf(sf, resolved)})`)
          }
          if (own.length) hits.push(hit('R4', file, sf, c, `<${tag}> 裡的 <${ct}> 自帶間距 ${own.join(' ')} —— 頁 / 段落裡塊與塊的間距由共用元件給(loose × 2),塊本身不留 margin / padding / 空白塊`))
          // 手寫標題:直接放標題、以標題開頭的區塊、區塊裡疊了 ≥ 2 個以標題開頭的塊 —— 都是手刻的段落 / 規則
          if (!resolved) continue
          const via = frameless ? '' : `(${ct} 回傳的 <${isJsx(resolved) ? tagName(sf, resolved) : '>'}>)`
          if (isJsx(resolved) && HEADING.test(tagName(sf, resolved))) { hits.push(hit('R4', file, sf, c, `<${tag}> 裡直接放手寫標題 <${tagName(sf, resolved)}>${via} —— 段落用 TutorialSection、規則用 TutorialRule`)); continue }
          const lead = leadingHeading(sf, resolved, ctx)
          if (lead) { hits.push(hit('R4', file, sf, c, `<${tag}> 裡的 <${ct}>${via} 以手寫標題 <${lead}> 開頭 = 手刻的段落 / 規則外框 —— 改用 TutorialSection / TutorialRule`)); continue }
          const stack = stackedHeadingBlocks(sf, resolved, ctx)
          if (stack) { hits.push(hit('R4', file, sf, c, `<${tag}> 裡的 <${ct}>${via} 在 :${lineOf(sf, stack)} 疊了 ≥ 2 塊以手寫標題開頭的區塊 = 手刻的規則(間距由那個容器手寫)—— 每則改成 TutorialRule;左右並排比較用多欄 grid`)); continue }
          // (R4,2026-10-20 T8)「標題樣式的一行字」當標題(span / p 加半粗體、大寫小字):同樣是手刻的規則 / 段落外框
          const labelLead = leadingHeadingOrLabel(sf, resolved, ctx)
          if (labelLead) { hits.push(hit('R4', file, sf, c, `<${tag}> 裡的 <${ct}>${via} 以標題樣式的一行字 <${labelLead}> 開頭 = 手刻的段落 / 規則外框 —— 改用 TutorialSection / TutorialRule(標題一律 h1–h6,typography.spec.md:43)`)); continue }
          const labelStack = stackedLabelBlocks(sf, resolved, ctx)
          if (labelStack) hits.push(hit('R4', file, sf, c, `<${tag}> 裡的 <${ct}>${via} 在 :${lineOf(sf, labelStack)} 疊了 ≥ 2 塊以標題樣式的一行字開頭的區塊 = 手刻的規則 —— 每則改成 TutorialRule`))
        }
      }
      // (R3) 規則 / 段落的父層
      if (isTutorialRule(n) || isTutorialSection(n)) {
        let p = n.parent
        let parentEl = null
        while (p) {
          if (ts.isJsxElement(p) && !isFragment(sf, p)) { parentEl = p; break }
          if (ts.isSourceFile(p)) break
          // 跨過函式邊界(例:.map 的 callback)仍往上找;跨過 render 函式本身(story 根節點)就停
          if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p)) && !ts.isCallExpression(p.parent)) break
          p = p.parent
        }
        const what = tagName(sf, n)
        const okParents = isTutorialSection(n) ? ['TutorialPage'] : ['TutorialPage', ...SECTION_TAGS]
        const parentTag = parentEl ? tagName(sf, parentEl) : null
        if (!parentTag || !okParents.includes(parentTag)) {
          hits.push(hit('R3', file, sf, n, `<${what}> ${parentTag ? `被 <${parentTag}> 包著` : '不在 TutorialPage 裡'} —— 規則 / 段落之間的間距必須由 ${okParents.join(' / ')} 給(loose × 2),不得由別的容器手寫`))
        }
      }
    }
    ts.forEachChild(n, walk)
  }
  walk(sf)

  // (R12) Tokens / Patterns 文件頁:story 本身疊了 ≥ 2 塊以標題(或標題樣式的一行字)開頭的區塊 = 手刻的段落清單(2026-10-20 T7 甲)
  if (docPage) {
    const labelCtx = { ...ctx }
    for (const story of storyRoots(sf)) {
      if (!story.root || isTutorialPage(story.root)) continue
      const stack = stackedLabelBlocks(sf, story.root, labelCtx)
      if (stack) hits.push(hit('R12', file, sf, stack, `story ${story.name} 在這裡疊了 ≥ 2 塊以標題開頭的區塊(含大寫小字 / 半粗體的一行字當標題)= 手刻的段落 —— Tokens / Patterns 文件頁的段落一律 TutorialPage + TutorialSection(段落之間 loose × 2、h2 + 淺分隔線;category-templates.md「教學框的間距與標題」)`))
    }
  }

  if (principles) {
    // (R9) 使用指引的骨架(2026-10-20 T4 甲):name「使用指引」、TutorialPage 底下依序剛好三段 UsageSection when / whenNot / siblings
    const stories = storyRoots(sf)
    const ug = stories.find((x) => x.name === 'UsageGuidance')
    if (!ug) {
      const dims = new Set(stories.map((x) => x.name).filter((nm) => LEGACY_SPLIT.test(nm)).map((nm) => (nm.startsWith('Vs') ? 'Vs' : nm)))
      if (dims.size < 2) hits.push({ rule: 'R9', file, line: 1, message: '設計原則頁沒有「使用指引」(UsageGuidance),也不是被接受的舊 split style(WhenToUse / WhenNotToUse / Vs*Rule / ContentGuidelines 至少兩種;category-templates.md「Legacy aliases 接受」)' })
    } else {
      const decl = ug.node.parent && ts.isObjectLiteralExpression(ug.node.parent) ? ug.node.parent : null
      const nameProp = decl?.properties.find((pr) => ts.isPropertyAssignment(pr) && pr.name.getText(sf) === 'name')
      const nm = nameProp && ts.isStringLiteral(nameProp.initializer) ? nameProp.initializer.text : null
      if (nm !== '使用指引') hits.push(hit('R9', file, sf, nameProp ?? ug.node, `UsageGuidance 的 story 名稱是「${nm ?? '(沒寫)'}」—— 一律「使用指引」`))
      let root = ug.root
      for (let d = 0; root && isJsx(root) && !isTutorialPage(root) && d < 3; d++) { const t = tagName(sf, root); if (!/^[A-Z]/.test(t)) break; root = resolveLocal(sf, t, root) }
      if (root && isTutorialPage(root)) {
        const kids = flatChildren(sf, root).filter((k) => isJsx(k))
        const got = kids.map((k) => (tagName(sf, k) === 'UsageSection' ? leadingText(attrInit(k, 'kind')) || '?' : `<${tagName(sf, k)}>`))
        if (got.join(',') !== USAGE_KINDS.join(',')) hits.push(hit('R9', file, sf, root, `使用指引的骨架是 [${got.join(', ')}] —— 必須依序剛好三段 <UsageSection kind="when" / "whenNot" / "siblings">(何時用 / 何時不用 / 和相近元件怎麼選;tutorial-page.tsx USAGE_SECTION_TITLES)`))
      }
    }
    if (!usesPage) hits.push({ rule: 'R1', file, line: 1, message: '設計原則頁沒有用 TutorialPage —— 教學頁一律由 stories-helpers/examples/tutorial-page.tsx 組成' })
    for (const story of storyRoots(sf)) {
      let root = story.root
      let depth = 0
      while (root && isJsx(root) && !isTutorialPage(root) && depth < 3) {
        const t = tagName(sf, root)
        if (!/^[A-Z]/.test(t)) break
        const next = resolveLocal(sf, t, root)
        if (!next) break
        root = next; depth++
      }
      if (!root || !isTutorialPage(root)) {
        const where = story.root ?? story.node
        const desc = story.root && isJsx(story.root) ? `<${tagName(sf, story.root)}>` : story.root && ts.isJsxFragment(story.root) ? '<>' : '(不是 JSX)'
        hits.push(hit('R1', file, sf, where, `story ${story.name} 的根節點是 ${desc},不是 TutorialPage —— 教學頁每則 story 都由 TutorialPage 起頭(頁裡的塊距才有單一擁有者)`))
      }
    }
  }
  return hits
}

/** (R7) loose × 2 只准在共用元件裡 */
export function checkLooseTimesTwo(file, text) {
  if (file === HELPER) return []
  const out = []
  text.split('\n').forEach((l, i) => { if (LOOSE_TIMES_TWO.test(l)) out.push({ rule: 'R7', file, line: i + 1, message: '「loose × 2」寫在共用元件以外 = 手寫段落 / 規則間距 —— 改用 TutorialPage / TutorialSection(stories-helpers/examples/tutorial-page.tsx)' }) })
  return out
}

/** (R8) 共用元件本身仍是 ② */
export function checkHelper(text) {
  const out = []
  const sf = ts.createSourceFile(HELPER, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const strings = []
  const walk = (n) => { if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) strings.push(n.text); ts.forEachChild(n, walk) }
  walk(sf)
  const code = strings.join('\n')
  if (!/gap-\[calc\(var\(--layout-space-loose\)\*2\)\]/.test(code)) out.push({ rule: 'R8', file: HELPER, line: 1, message: '共用元件的塊距不是 gap-[calc(var(--layout-space-loose)*2)](② = 規則之間 = 段落之間 = loose × 2,user 2026-10-07)' })
  if (/--layout-space-bottom/.test(code)) out.push({ rule: 'R8', file: HELPER, line: 1, message: '共用元件用到 --layout-space-bottom —— 那是「結論留白:內容到 action buttons」(layoutSpace.spec.md:13),段落之間不借它' })
  const headingClass = (tag) => {
    let found = null
    const v = (n) => { if (isJsx(n) && tagName(sf, n) === tag) found = classNameOf(n); if (!found) ts.forEachChild(n, v) }
    v(sf)
    return found ?? ''
  }
  const h2 = headingClass('h2').split(/\s+/)
  const h3 = headingClass('h3').split(/\s+/)
  if (!(h2.includes('text-h3') && h2.includes('font-semibold') && h2.includes('border-divider'))) out.push({ rule: 'R8', file: HELPER, line: 1, message: `段落標題不是 text-h3 + font-semibold + border-divider(② 的段落標題;現為「${h2.join(' ')}」)` })
  if (!(h3.includes('text-h6') && h3.includes('font-semibold'))) out.push({ rule: 'R8', file: HELPER, line: 1, message: `規則標題不是 text-h6 + font-semibold(現為「${h3.join(' ')}」)` })
  // ── 2026-10-20 新增(T2 / T4 / T6 / T13):頁根擁有內文字級、使用指引三段的段名、說明一律 fg-muted、只畫真的有東西的範例區 ──
  const decls = new Map()
  const idents = []
  const calls = []
  const v2 = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) decls.set(n.name.text, unwrap(n.initializer))
    if (ts.isIdentifier(n)) idents.push(n.text)
    if (ts.isPropertyAccessExpression(n)) calls.push(n.getText(sf))
    ts.forEachChild(n, v2)
  }
  v2(sf)
  const pageText = decls.get('PAGE_TEXT')
  const pageFn = sf.statements.find((st) => ts.isFunctionDeclaration(st) && st.name?.text === 'TutorialPage')
  const pageRoot = pageFn ? fnRoot(pageFn) : null
  const pageUses = pageRoot && pageRoot.getText(sf).includes('PAGE_TEXT')
  if (!(pageText && ts.isStringLiteral(pageText) && pageText.text.split(/\s+/).includes('text-body') && pageUses)) out.push({ rule: 'R8', file: HELPER, line: 1, message: 'TutorialPage 的根節點沒有內文字級 text-body(PAGE_TEXT)—— 頁裡沒寫字級的段落 / 清單會落到瀏覽器預設 16px(typography.spec.md:13 / :39;2026-10-20 T2)' })
  const titles = decls.get('USAGE_SECTION_TITLES')
  const got = {}
  if (titles && ts.isObjectLiteralExpression(titles)) for (const pr of titles.properties) if (ts.isPropertyAssignment(pr) && ts.isStringLiteral(unwrap(pr.initializer))) got[pr.name.getText(sf)] = unwrap(pr.initializer).text
  if (JSON.stringify(got) !== JSON.stringify(USAGE_TITLES)) out.push({ rule: 'R8', file: HELPER, line: 1, message: `使用指引三段的段名不是 ${JSON.stringify(USAGE_TITLES)}(現為 ${JSON.stringify(got)};T4 甲,user 2026-10-20 核准)` })
  if (idents.includes('noteTone')) out.push({ rule: 'R8', file: HELPER, line: 1, message: '共用元件又有 noteTone —— 規則說明的字色只有一種(text-fg-muted,color.spec.md caption 列;2026-10-20 T6)' })
  if (!/text-caption[^'"`]*text-fg-muted|text-fg-muted[^'"`]*text-caption/.test(code)) out.push({ rule: 'R8', file: HELPER, line: 1, message: '規則說明不是 text-caption + text-fg-muted' })
  if (calls.some((c) => /(?:^|\.)Children\.count$/.test(c)) || !calls.some((c) => /(?:^|\.)Children\.toArray$/.test(c))) out.push({ rule: 'R8', file: HELPER, line: 1, message: '判斷「有沒有範例」不是用 React.Children.toArray —— Children.count 把 null / false 也算成一個(react.dev Children.count),沒有範例時會多畫一段空的範例區(2026-10-20 T13)' })
  return out
}

function walkFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { if (name !== 'node_modules') walkFiles(p, acc) } else acc.push(p)
  }
  return acc
}

export function scanTree(root) {
  const srcDir = join(root, SRC)
  if (!existsSync(srcDir)) throw new InstrumentError(`找不到 ${SRC}(--root=${root})`)
  const all = walkFiles(srcDir).map((p) => relative(root, p).split(sep).join('/'))
  const principles = all.filter((f) => f.endsWith('.principles.stories.tsx'))
  if (principles.length === 0) throw new InstrumentError('掃到 0 個設計原則頁 —— 儀器讀不到東西,不是通過')
  const patternPages = all.filter((f) => (f.startsWith(`${SRC}/patterns/`) || f.startsWith(`${SRC}/tokens/`)) && f.endsWith('.stories.tsx'))
  const hits = []
  for (const f of [...principles, ...patternPages]) hits.push(...checkTutorialFile(f, readFileSync(join(root, f), 'utf8')))
  for (const f of all.filter((x) => /\.(tsx?|css)$/.test(x))) hits.push(...checkLooseTimesTwo(f, readFileSync(join(root, f), 'utf8')))
  const helperPath = join(root, HELPER)
  if (existsSync(helperPath)) hits.push(...checkHelper(readFileSync(helperPath, 'utf8')))
  else hits.push({ rule: 'R8', file: HELPER, line: 1, message: '共用教學頁元件不存在' })
  return { hits, scanned: { principles: principles.length, patternPages: patternPages.length, files: all.length } }
}

// ═══════════════════════════════════════════════════════════════════════════
// --selftest
// ═══════════════════════════════════════════════════════════════════════════

const gitBlobId = (buf) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex')

/** c6c192a1 的真檔(本支閘上線前的最後一版),逐位元組 = 各自的 git blob。 */
export const BASE_FIXTURES = [
  {
    file: 'packages/design-system/src/components/Tabs/tabs.principles.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/tabs.principles.c6c192a1.tsx.txt',
    blob: '9403d2052459bcd9db681fc5072ad2111c1fb1e4',
    // 自抄 Section(:23)/ Rule(:31)、Section 裡手寫的 <section>(:24)<h2>(:26)、整頁沒用共用元件(:1)、三則 story 根節點是 <div>(:52 :220 :270)
    expect: [['R2', 23], ['R2', 24], ['R2', 26], ['R2', 31], ['R1', 1], ['R1', 52], ['R1', 220], ['R1', 270]],
  },
  {
    file: 'packages/design-system/src/components/AgentPanel/agent-panel.principles.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/agent-panel.principles.c6c192a1.tsx.txt',
    blob: '4b195bfc04dc651bf7135cc6e5831838b5b2bef6',
    // 整頁沒用共用元件(:1)、四個手寫 <section>(:15 :24 :34 :49)、根節點 <article>(:14)
    expect: [['R1', 1], ['R1', 14], ['R2', 15], ['R2', 24], ['R2', 34], ['R2', 49]],
  },
  // ── be2f1324(2026-10-20 教學頁稽核的基底,本輪修正前的最後一版)—— 新規則 R5 字級 / R9 / R10 / R11 / R12 與 Tokens 頁的 R2 ──
  {
    file: 'packages/design-system/src/components/AppShell/app-shell.principles.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/app-shell.principles.stories.be2f1324.tsx.txt',
    blob: '69c1485a11099d709f26b11628f53d2876803d9e',
    // T4:story 名「使用準則」(:17)、五段手寫段落(:19)、手寫段名「何時用 AppShell」(:20);T3 手寫 <ul>(:22);T6 手寫 LinkTo(:25);
    // T5「❌ 禁:」清單項(:67);T12 清單裡的 Markdown 反引號「`&lt;main&gt;`」(:41)
    expect: [['R9', 17], ['R9', 19], ['R9', 20], ['R10', 22], ['R10', 25], ['R10', 67], ['R10', 41]],
  },
  {
    file: 'packages/design-system/src/components/Chart/chart.principles.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/chart.principles.stories.be2f1324.tsx.txt',
    blob: '2f4df6b6048ae5005e7bd7384327cbb64f79e902',
    // T6:自抄 Label(:33)、caption + noteTone 選項(:41 兩筆);T13:範例區只放 <div />(:310)
    expect: [['R10', 33], ['R10', 41], ['R11', 310]],
  },
  {
    file: 'packages/design-system/src/components/FieldControlGroup/field-control-group.principles.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/field-control-group.principles.stories.be2f1324.tsx.txt',
    blob: 'ef05873445f9b454ac39c5438b7b2f0a1edc95dc',
    // T4:story 名「使用準則」(:30)、骨架不是三段(:32)、手寫段名「何時用 ✓」(:33);T5:手寫的紅色對錯 <h3>(:53 :61)
    expect: [['R9', 30], ['R9', 32], ['R9', 33], ['R10', 53], ['R10', 61]],
  },
  {
    file: 'packages/design-system/src/components/Command/command.principles.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/command.principles.stories.be2f1324.tsx.txt',
    blob: 'a11c23c606ef4b2a9bc8b03368a3e0ffdc6fa283',
    // T4:使用指引沒有任何段落標題(段名只寫在 JSX 註解裡)(:25)
    expect: [['R9', 25]],
  },
  {
    file: 'packages/design-system/src/components/AccountMenu/account-menu.principles.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/account-menu.principles.stories.be2f1324.tsx.txt',
    blob: '1011a11b697cabe7b2a7b0b06eccc07335e1c01a',
    // T2:頁根自己寫 text-body(:58);T6:noteTone(:24)
    expect: [['R5', 58], ['R10', 24]],
  },
  {
    file: 'packages/design-system/src/components/Badge/badge.principles.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/badge.principles.stories.be2f1324.tsx.txt',
    blob: '724523454c05309671a2505554d3f9d23335ad52',
    // T5:規則標題「✓ 正確做法」(:268);T12 note 裡的 Markdown 反引號(:339)
    expect: [['R10', 268], ['R10', 339]],
  },
  {
    file: 'packages/design-system/src/tokens/color/color.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/color.stories.be2f1324.tsx.txt',
    blob: '9e0a97ecc66e176f245feee0649f5ed8e9c201e5',
    // T7:Semantic 的 SectionLabel 段落清單(:257)、Interactive(:352)、手寫 <section>(:441)
    expect: [['R12', 257], ['R12', 352], ['R2', 441]],
  },
  {
    file: 'packages/design-system/src/tokens/uiSize/uiSize.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/uiSize.stories.be2f1324.tsx.txt',
    blob: 'bbb4743d0f0011aa8108358e8d804aa339c583a6',
    // T7:手寫 <h2>(:71 :85)、段落清單(:70)
    expect: [['R2', 71], ['R2', 85], ['R12', 70]],
  },
  {
    file: 'packages/design-system/src/tokens/radius/radius.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/radius.stories.be2f1324.tsx.txt',
    blob: '767b52b1801acd30c52ae21e2b44bc917d49c286',
    // T7:「<code font-medium>rounded-xs</code> + 說明」標題列開頭的三塊(:34)
    expect: [['R12', 34]],
  },
  {
    file: 'packages/design-system/src/patterns/action-bar/action-bar.stories.tsx',
    fixture: 'scripts/test-fixtures/tutorial-page/action-bar.stories.be2f1324.tsx.txt',
    blob: 'b3bd5cf9ec1519f5663808dc1969a8cb23744a3b',
    // T9 / N2:ToolbarFrame 手刻 52px 標題列(:35)、兩個手刻 52px 工具列(:316 :420)
    expect: [['R10', 35], ['R10', 316], ['R10', 420]],
  },
]

/** be2f1324 的共用元件(本輪修正前):沒有 text-body、沒有三段段名、還有 noteTone、用 Children.count → R8 */
export const BASE_HELPER = { fixture: 'scripts/test-fixtures/tutorial-page/tutorial-page.be2f1324.tsx.txt', blob: 'a936b95a28faf7d52420cc150b5bc78a8b505909' }

export const CLEAN = `import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/design-system/components/Button/button'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, TutorialSection, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = { title: 'Design System/Components/Demo/設計原則', component: Button }
export default meta
type Story = StoryObj

// 範例的說明 = ExampleCaption(共用);規則 = 每頁一行 createTutorialRule
const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-md' })
const ITEMS = ['複製連結', '重新命名']

export const UsageGuidance: Story = {
  name: '使用指引', render: () => (
    <TutorialPage className="max-w-3xl">
      <UsageSection kind="when">
        <div className="max-w-prose"><p>適合的場景</p></div>
      </UsageSection>
      <UsageSection kind="whenNot">
        <>
          <TutorialRule title="❌ 不用來導覽" note="說明">
            <div className="rounded-md border p-[var(--layout-space-loose)]">
              <h3 className="text-h6 font-medium">產品卡片標題</h3>
            </div>
            <ExampleCaption>↑ 說明</ExampleCaption>
          </TutorialRule>
        </>
        {ITEMS.map((t) => <TutorialRule key={t} title={t} />)}
        {true && <TutorialRule title="條件式規則" />}
      </UsageSection>
      <UsageSection kind="siblings"><TutorialList><li><StoryLink kind="Design System/Components/Demo/展示" name="基本">相近元件</StoryLink>:差在哪裡</li></TutorialList></UsageSection>
    </TutorialPage>
  ),
}

export const DemoInRender: Story = {
  render: () => {
    const Demo = () => (
      <TutorialPage>
        <ExampleGroup><p>說明</p><Button>送出</Button></ExampleGroup>
      </TutorialPage>
    )
    return <Demo />
  },
}

export const ComponentOnly: Story = { args: { children: '只渲染元件本身' } }

export const SideBySide: Story = {
  render: () => (
    <TutorialPage className="w-[640px]">
      <TutorialSection title="並排比較">
        <div className="grid grid-cols-2 gap-[var(--layout-space-loose)]">
          <div><h3 className="text-h6 font-semibold">這樣</h3><p>說明</p></div>
          <div><h3 className="text-h6 font-semibold">那樣</h3><p>說明</p></div>
        </div>
        <TutorialList><li>清單項(圓點、左縮排與列距是 TutorialList 的幾何)</li></TutorialList>
        <ExampleGroup><Button>送出</Button><ExampleCaption>↑ 說明</ExampleCaption></ExampleGroup>
        <Button className="h-8 px-4">元件自己的高度 / 內距在它的框內,不算塊距</Button>
        <div className="relative h-52 rounded-md bg-canvas"><Button>範例畫布:有內容的框,高度是它自己的</Button></div>
        <TutorialRule title="✅ 範例本身是一份清單" note="排成 flex / grid 的清單是範例,不是說明清單">
          <ul className="flex flex-col gap-2"><li>上傳中 · 42%</li></ul>
          <ExampleCaption warn>↑ ❌ 反例的說明也可以帶對錯記號</ExampleCaption>
        </TutorialRule>
      </TutorialSection>
    </TutorialPage>
  ),
}
`

/** 合成違規:[名稱, [[替換前, 替換後], …], 預期規則, 預期行(以替換後的檔案計)];替換前 = null 表示整頁不用 TutorialPage */
export const MUTATIONS = [
  ['自抄 Rule helper', [["const ITEMS = ['複製連結', '重新命名']\n", "const ITEMS = ['複製連結', '重新命名']\nconst Rule = ({ title }: { title: string }) => <div><h3>{title}</h3></div>\n"]], 'R2', 13],
  ['手寫 <section> + <h2> 段落', [['        <div className="max-w-prose"><p>適合的場景</p></div>\n', '        <section><h2 className="text-h3">何時用</h2></section>\n']], 'R2', 18],
  ['規則被手寫的間距容器包著(bottom 當段落距)', [
    ['        <>\n          <TutorialRule title="❌ 不用來導覽" note="說明">', '        <div className="mt-[var(--layout-space-bottom)]">\n          <TutorialRule title="❌ 不用來導覽" note="說明">'],
    ['          </TutorialRule>\n        </>\n', '          </TutorialRule>\n        </div>\n'],
  ], 'R3', 22],
  ['story 根節點是 <div>', [
    ['    <TutorialPage className="max-w-3xl">\n', '    <div className="flex flex-col gap-[var(--layout-space-loose)]">\n'],
    ['</UsageSection>\n    </TutorialPage>\n', '</UsageSection>\n    </div>\n'],
  ], 'R1', 16],
  ['TutorialPage 直接放手刻的規則外框', [['      <UsageSection kind="when">\n', '      <div><h3 className="text-h6 font-semibold">手刻規則</h3><p>說明</p></div>\n      <UsageSection kind="when">\n']], 'R4', 17],
  ['TutorialPage 的 className 帶間距', [['className="max-w-3xl"', 'className="max-w-3xl gap-[var(--layout-space-bottom)]"']], 'R5', 16],
  ['createTutorialRule 寫在 render 裡', [['    const Demo = () => (\n', '    const Inner = createTutorialRule({})\n    const Demo = () => (\n']], 'R6', 39],
  ['段落裡的塊自帶 margin(說明塊 mb-loose)', [['<div className="max-w-prose">', '<div className="max-w-prose mb-[var(--layout-space-loose)]">']], 'R4', 18],
  ['loose × 2 寫在共用元件以外', [['<div className="max-w-prose">', '<div className="max-w-prose mt-[calc(var(--layout-space-loose)*2)]">']], 'R7', 18],
  ['整頁沒用 TutorialPage', null, 'R1', 1],
  // ── 2026-10-14 審查抓到的繞法(a)–(g)與同族;每一條在修閘之前都是 exit 0 ──
  ['(a) 頁的直接子層放空白 spacer(h-loose)', [['      <UsageSection kind="when">\n', '      <div aria-hidden className="h-[var(--layout-space-loose)]" />\n      <UsageSection kind="when">\n']], 'R4', 17],
  ['(a) 段落的直接子層放空白 spacer(h-8)', [['        <>\n          <TutorialRule title="❌ 不用來導覽"', '        <div aria-hidden className="h-8" />\n        <>\n          <TutorialRule title="❌ 不用來導覽"']], 'R4', 21],
  ['(b) 說明塊用 padding 代替 margin(pt-loose)', [['<div className="max-w-prose">', '<div className="max-w-prose pt-[var(--layout-space-loose)]">']], 'R4', 18],
  ['(b) 說明塊用 padding 代替 margin(pt-8)', [['<div className="max-w-prose">', '<div className="max-w-prose pt-8">']], 'R4', 18],
  ['(b) 加了 variant 前綴的 margin(md:mt-8)', [['<div className="max-w-prose">', '<div className="max-w-prose md:mt-8">']], 'R4', 18],
  ['(c) inline style marginTop', [['<div className="max-w-prose">', "<div className=\"max-w-prose\" style={{ marginTop: 'var(--layout-space-loose)' }}>"]], 'R4', 18],
  ['(c) style 不是字面物件(讀不到 ≠ 沒有)', [['<div className="max-w-prose">', '<div className="max-w-prose" style={spacer}>']], 'R4', 18],
  ['(c) className 不是字面值(讀不到 ≠ 沒有)', [['<div className="max-w-prose">', '<div className={blockClass}>']], 'R4', 18],
  ['(d) TutorialPage 的 arbitrary variant [&>*+*]:mt-8', [['className="max-w-3xl"', 'className="max-w-3xl [&>*+*]:mt-8"']], 'R5', 16],
  ['(d) TutorialPage 的 *:mb-8', [['className="max-w-3xl"', 'className="max-w-3xl *:mb-8"']], 'R5', 16],
  ['(e) 頁裡一個容器包兩則手刻規則', [['      <UsageSection kind="when">\n', '      <div className="flex flex-col gap-[var(--layout-space-loose)]">\n        <div><h3 className="text-h6 font-semibold">❌ 手刻規則一</h3><p>說明</p></div>\n        <div><h3 className="text-h6 font-semibold">❌ 手刻規則二</h3><p>說明</p></div>\n      </div>\n      <UsageSection kind="when">\n']], 'R4', 17],
  ['(e) 說明塊裡、前言之後再下一層疊兩則手刻規則', [['        <div className="max-w-prose"><p>適合的場景</p></div>\n', '        <div className="max-w-prose">\n          <p>適合的場景</p>\n          <div className="flex flex-col gap-8">\n            <div><h4 className="text-h6 font-semibold">❌ 手刻規則一</h4><p>說明</p></div>\n            <div><h4 className="text-h6 font-semibold">❌ 手刻規則二</h4><p>說明</p></div>\n          </div>\n        </div>\n']], 'R4', 18],
  ['(e) 說明塊裡平鋪兩個手寫小標', [['        <div className="max-w-prose"><p>適合的場景</p></div>\n', '        <div className="max-w-prose"><p>前言</p><h5>一</h5><p>說明</p><h5>二</h5><p>說明</p></div>\n']], 'R4', 18],
  ['(e) 單欄 grid 疊兩則手刻規則(只有多欄才算並排)', [['<div className="grid grid-cols-2 gap-[var(--layout-space-loose)]">', '<div className="grid gap-[var(--layout-space-loose)]">']], 'R4', 54],
  ['(f) 函式 story(CSF2)手刻規則、不經 TutorialPage', [["const ITEMS = ['複製連結', '重新命名']\n", "const ITEMS = ['複製連結', '重新命名']\nexport const ExtraRule = () => (<div className=\"flex flex-col gap-[var(--layout-space-loose)]\"><div><h3 className=\"text-h6 font-semibold\">❌ 手刻規則</h3><p>說明</p></div><div><h3 className=\"text-h6 font-semibold\">✅ 手刻規則二</h3><p>說明</p></div></div>)\n"]], 'R1', 13],
  ['(f) export function story 不經 TutorialPage', [["const ITEMS = ['複製連結', '重新命名']\n", "const ITEMS = ['複製連結', '重新命名']\nexport function ExtraPage() {\n  return <div><p>說明</p></div>\n}\n"]], 'R1', 14],
  ['(g) 改名的教學框小元件 RuleBlock', [["const ITEMS = ['複製連結', '重新命名']\n", "const ITEMS = ['複製連結', '重新命名']\nconst RuleBlock = ({ title, children }: { title: string; children: React.ReactNode }) => (<div className=\"mb-[var(--layout-space-loose)]\"><h3 className=\"text-h6 font-semibold\">{title}</h3>{children}</div>)\n"]], 'R2', 13],
  ['(g) 自定標題小元件(根節點就是 <h4>)', [["const ITEMS = ['複製連結', '重新命名']\n", "const ITEMS = ['複製連結', '重新命名']\nconst Heading = ({ children }: { children: React.ReactNode }) => <h4 className=\"text-h6 font-semibold\">{children}</h4>\nconst Block = ({ title, children }: { title: string; children: React.ReactNode }) => (\n  <div className=\"flex flex-col\"><div><Heading>{title}</Heading></div>{children}</div>\n)\n"]], 'R2', 13],
  ['(g) 教學框把標題再包一層、標題是同檔小元件(Sidebar 舊寫法)', [["const ITEMS = ['複製連結', '重新命名']\n", "const ITEMS = ['複製連結', '重新命名']\nconst Heading = ({ children }: { children: React.ReactNode }) => <h4 className=\"text-h6 font-semibold\">{children}</h4>\nconst Block = ({ title, children }: { title: string; children: React.ReactNode }) => (\n  <div className=\"flex flex-col\"><div><Heading>{title}</Heading></div>{children}</div>\n)\n"]], 'R2', 14],
  ['同檔小元件當 spacer 放進頁裡', [
    ["const ITEMS = ['複製連結', '重新命名']\n", "const ITEMS = ['複製連結', '重新命名']\nconst Gap = () => <div aria-hidden className=\"h-8\" />\n"],
    ['      <UsageSection kind="when">\n', '      <Gap />\n      <UsageSection kind="when">\n'],
  ], 'R4', 18],
  ['外部元件帶 margin 放進段落', [['        <div className="max-w-prose"><p>適合的場景</p></div>\n', '        <Button className="mt-8">送出</Button>\n']], 'R4', 18],
  ['ExampleGroup(無框的排版小幫手)帶 padding', [['        <div className="max-w-prose"><p>適合的場景</p></div>\n', '        <ExampleGroup className="pt-8"><p>說明</p></ExampleGroup>\n']], 'R4', 18],
  ['ExampleGroup 裡以手寫標題開頭', [['        <div className="max-w-prose"><p>適合的場景</p></div>\n', '        <ExampleGroup><h4 className="text-h6 font-semibold">手刻規則</h4><Button>送出</Button></ExampleGroup>\n']], 'R4', 18],
  ['render 裡定義的手刻規則小元件放進頁裡', [['    const Demo = () => (\n      <TutorialPage>\n', '    const R = ({ t }: { t: string }) => <div><h3>{t}</h3><p>說明</p></div>\n    const Demo = () => (\n      <TutorialPage>\n        <R t="手刻規則" />\n']], 'R4', 42],
  // ── 2026-10-20 教學頁稽核(預期行可以是字串:= 注入後的檔案裡第一個含該字串的行)──
  ['(T2) TutorialPage 自帶字級', [['className="max-w-3xl"', 'className="max-w-3xl text-body"']], 'R5', 16],
  ['(T2) TutorialPage 自帶字色', [['className="max-w-3xl"', 'className="max-w-3xl text-foreground"']], 'R5', 16],
  ['(T4) 使用指引的 story 名稱不是「使用指引」', [["  name: '使用指引', render", "  name: '使用準則', render"]], 'R9', 15],
  ['(T4) 使用指引少了一段(沒有 siblings)', [['      <UsageSection kind="siblings">', '      <div>']], 'R9', 16],
  ['(T4) 使用指引三段順序錯', [['<UsageSection kind="when">', '<UsageSection kind="siblings">'], ['<UsageSection kind="siblings"><TutorialList>', '<UsageSection kind="when"><TutorialList>']], 'R9', 16],
  ['(T4) 使用指引前面多一段說明塊(段落外的 prose)', [['      <UsageSection kind="when">\n', '      <p>前言</p>\n      <UsageSection kind="when">\n']], 'R9', 16],
  ['(T4) 手寫 TutorialSection 段名「何時用」', [['      <UsageSection kind="when">\n        <div className="max-w-prose"><p>適合的場景</p></div>\n      </UsageSection>\n', '      <TutorialSection title="何時用">\n        <div className="max-w-prose"><p>適合的場景</p></div>\n      </TutorialSection>\n']], 'R9', 17],
  ['(T4) UsageSection 用在使用指引以外', [['        <ExampleGroup><p>說明</p><Button>送出</Button></ExampleGroup>\n', '        <UsageSection kind="when"><p>說明</p></UsageSection>\n']], 'R9', 41],
  ['(T4) 沒有使用指引、也不是舊 split style', [['export const UsageGuidance: Story', 'export const Usage: Story']], 'R9', 1],
  ['(T6) 自抄說明元件 Label', [['// 範例的說明 = ExampleCaption(共用);規則 = 每頁一行 createTutorialRule\n', 'const Label = ({ children }: { children: React.ReactNode }) => <p className="text-footnote">{children}</p>\n']], 'R10', 10],
  ['(T6) 改名的說明元件 Hint(span)', [['// 範例的說明 = ExampleCaption(共用);規則 = 每頁一行 createTutorialRule\n', 'const Hint = ({ children }: { children: React.ReactNode }) => <span className="text-caption text-fg-secondary">{children}</span>\n']], 'R10', 10],
  ['(T6) createTutorialRule({ caption })', [['createTutorialRule({ examples: true,', 'createTutorialRule({ caption: ExampleCaption,']], 'R10', 11],
  ['(T6) createTutorialRule({ noteTone })', [["examplesClassName: 'max-w-md' })", "examplesClassName: 'max-w-md', noteTone: 'secondary' })"]], 'R10', 11],
  ['(T6) 手寫 LinkTo 連結', [['<StoryLink kind="Design System/Components/Demo/展示" name="基本">相近元件</StoryLink>', '<LinkTo kind="Design System/Components/Demo/展示" name="基本"><span className="text-primary">相近元件</span></LinkTo>']], 'R10', 32],
  ['(T3) 手寫 <ul> 說明清單(沒有 class)', [['<TutorialList><li>清單項', '<ul><li>清單項'], ['</li></TutorialList>\n        <ExampleGroup>', '</li></ul>\n        <ExampleGroup>']], 'R10', '<ul><li>清單項'],
  ['(T3) 手寫 <ul className="list-inside list-disc">', [['<TutorialList><li>清單項', '<ul className="list-inside list-disc"><li>清單項'], ['</li></TutorialList>\n        <ExampleGroup>', '</li></ul>\n        <ExampleGroup>']], 'R10', '<ul className="list-inside'],
  ['(T3) 手寫 <ol className="space-y-1">', [['<TutorialList><li>清單項', '<ol className="space-y-1"><li>清單項'], ['</li></TutorialList>\n        <ExampleGroup>', '</li></ol>\n        <ExampleGroup>']], 'R10', '<ol className="space-y-1">'],
  ['(T5) 清單項以「❌ 禁:」開頭', [['<li><StoryLink', '<li>❌ 禁:<StoryLink']], 'R10', 32],
  ['(T5) 手寫的對錯 <h3>(並排比較裡也算)', [['<h3 className="text-h6 font-semibold">這樣</h3>', '<h3 className="text-caption font-medium">✅ 這樣</h3>']], 'R10', '✅ 這樣'],
  ['(T5) 規則標題用 ✓', [['title="❌ 不用來導覽"', 'title="✓ 不用來導覽"']], 'R10', 22],
  ['(T5) 規則標題用 ⚠️', [['title="❌ 不用來導覽"', 'title="⚠️ 不用來導覽"']], 'R10', 22],
  ['(T5) 規則標題(JSX)用 ✗', [['title="❌ 不用來導覽"', 'title={<>✗ 不用 <code>nav</code> 導覽</>}']], 'R10', 22],
  ['(T5) 說明用 ✗(箭頭之後)', [['<ExampleCaption>↑ 說明</ExampleCaption>\n          </TutorialRule>', '<ExampleCaption>↑ ✗ 說明</ExampleCaption>\n          </TutorialRule>']], 'R10', 26],
  ['(T7 / T8) 頁裡的塊以「code 半粗體 + 說明」標題列開頭(radius 舊名稱列)', [['      <UsageSection kind="when">\n', '      <div><div className="flex items-baseline gap-2"><code className="text-caption font-medium">rounded-xs</code><span>2px</span></div><div>樣本</div></div>\n      <UsageSection kind="when">\n']], 'R4', 17],
  ['(T8) 段落裡的塊以 span 半粗體標題開頭(item-anatomy 舊寫法)', [['        <div className="max-w-prose"><p>適合的場景</p></div>\n', '        <div><span className="text-caption font-semibold">Scanning</span><div>樣本</div></div>\n']], 'R4', 18],
  ['(T8) 段落裡疊兩塊大寫小字開頭的區塊', [['        <div className="max-w-prose"><p>適合的場景</p></div>\n', '        <div className="flex flex-col gap-4">\n          <div><p className="text-caption uppercase tracking-wider">Status</p><div>色票</div></div>\n          <div><p className="text-caption uppercase tracking-wider">Other</p><div>色票</div></div>\n        </div>\n']], 'R4', 18],
  ['(T15) 規則範例裡逐顆寫 self-start', [['<h3 className="text-h6 font-medium">產品卡片標題</h3>', '<h3 className="text-h6 font-medium">產品卡片標題</h3>'], ['            <ExampleCaption>↑ 說明</ExampleCaption>\n          </TutorialRule>', '            <ExampleCaption>↑ 說明</ExampleCaption>\n            <Dialog><DialogTrigger asChild><Button className="self-start">建立專案</Button></DialogTrigger></Dialog>\n          </TutorialRule>']], 'R10', 27],
  ['(T15) 範例自己的版面裡的 self-start 不算(對照組)', [['<h3 className="text-h6 font-medium">產品卡片標題</h3>', '<h3 className="text-h6 font-medium">產品卡片標題</h3><div className="inline-flex self-start">藍圖</div>']], null, 0],
  ['(T9) 手刻的工具列標題列(橫向一列寫死 px 高度)', [['        <div className="max-w-prose"><p>適合的場景</p></div>\n', '        <div className="flex items-center justify-between min-h-[52px] border rounded-lg"><span className="text-body font-bold">文件</span><Button>送出</Button></div>\n']], 'R10', 18],
  ['(T12) note 字串裡的 Markdown 反引號', [['note="說明">', 'note="用 `pressed` 標示啟用">']], 'R10', 22],
  ['(T12) JSX 文字裡的 Markdown 反引號', [['<p>適合的場景</p>', '<p>適合 `inline` 的場景</p>']], 'R10', 18],
  ['(T12) {字串} 子節點裡的 Markdown 反引號', [['<p>適合的場景</p>', "<p>{'適合 `inline` 的場景'}</p>"]], 'R10', 18],
  ['(T12) <code> 裡的樣板字串反引號是程式碼 → 不算(對照組:同一句不在 <code> 裡就紅)', [['<p>適合的場景</p>', "<p><code>{'formatter={(v) => `$${v}`}'}</code></p>"]], null, 0],
  ['(T13) 範例區只放一個空的 <div />', [['{ITEMS.map((t) => <TutorialRule key={t} title={t} />)}', '<TutorialRule title="空範例區"><div /></TutorialRule>']], 'R11', 29],
]

/** Tokens / Patterns 文件頁(T7 甲):[名稱, 檔案, 內容, 預期 [規則, 行] 或 null(= 0 筆)] */
export const DOC_PAGE_CASES = [
  ['SectionLabel(大寫小字 <p>)開頭的兩塊 = 手刻段落', `${SRC}/tokens/demo/demo.stories.tsx`,
    'const SectionLabel = ({ children }: { children: React.ReactNode }) => <p className="text-caption font-medium uppercase tracking-wider text-fg-muted">{children}</p>\nexport const Overview = { render: () => (\n  <div className="space-y-[var(--layout-space-loose)]">\n    <div><SectionLabel>Status</SectionLabel><div>色票</div></div>\n    <div><SectionLabel>Other</SectionLabel><div>色票</div></div>\n  </div>\n) }\n', ['R12', 3]],
  ['<p font-medium> 開頭的兩塊(density UI 尺寸舊寫法)', `${SRC}/tokens/demo/demo.stories.tsx`,
    'export const UISize = { render: () => (\n  <div className="max-w-2xl space-y-[var(--layout-space-loose)]">\n    <div><p className="mb-[var(--layout-space-tight)] text-caption font-medium text-fg-muted">Field Height</p><table /></div>\n    <div><p className="mb-[var(--layout-space-tight)] text-caption font-medium text-fg-muted">Table Row</p><table /></div>\n  </div>\n) }\n', ['R12', 2]],
  ['「<code font-medium> + 說明」標題列開頭的兩塊(radius 舊寫法)', `${SRC}/tokens/demo/demo.stories.tsx`,
    'export const Overview = { render: () => (\n  <div className="max-w-2xl space-y-[var(--layout-space-loose)]">\n    <div><div className="flex items-baseline gap-2"><code className="text-caption font-medium">rounded-xs</code><span>2px</span></div><div>樣本</div></div>\n    <div><div className="flex items-baseline gap-2"><code className="text-caption font-medium">rounded-md</code><span>4px</span></div><div>樣本</div></div>\n  </div>\n) }\n', ['R12', 2]],
  ['手寫 <h2> 段落(uiSize 舊寫法)', `${SRC}/tokens/demo/demo.stories.tsx`,
    'export const Overview = { render: () => (\n  <div>\n    <h2 className="text-h3">Field Height</h2>\n    <table />\n  </div>\n) }\n', ['R2', 3]],
  ['Patterns 頁:chrome 標題槽裡的 <h2> 是範例的產品標題 → 0 筆', `${SRC}/patterns/demo/demo.stories.tsx`,
    'export const WithTabs = () => (\n  <div className="rounded-lg border">\n    <ChromeHeader><h2 className="flex-1 truncate text-body-lg font-medium">Acme 品牌改版專案</h2></ChromeHeader>\n  </div>\n)\n', null],
  ['Tokens 頁:一張 token 表裡的分組列(單獨一行、後面接同一張表的列)→ 0 筆', `${SRC}/tokens/demo/demo.stories.tsx`,
    'export const Overview = { render: () => (\n  <div className="max-w-2xl">\n    <p className="py-2 text-caption font-medium text-fg-muted">Field Height</p>\n    <Row token="--field-height-lg" />\n    <p className="py-2 text-caption font-medium text-fg-muted">Table Row</p>\n    <Row token="--table-row-lg" />\n  </div>\n) }\n', null],
  ['Tokens 頁:TutorialPage + TutorialSection → 0 筆', `${SRC}/tokens/demo/demo.stories.tsx`,
    "import { TutorialPage, TutorialSection } from '@/design-system/stories-helpers/examples/tutorial-page'\nexport const Overview = { render: () => (\n  <TutorialPage>\n    <TutorialSection title=\"Status\"><div>色票</div></TutorialSection>\n    <TutorialSection title=\"Other\"><div className=\"relative h-52 rounded-md bg-canvas\"><span>畫布</span></div></TutorialSection>\n  </TutorialPage>\n) }\n", null],
]

export function runSelftest(root = SCRIPT_ROOT) {
  const fails = []
  const ok = []
  const expect = (cond, msg) => (cond ? ok.push(msg) : fails.push(msg))
  const file = `${SRC}/components/Demo/demo.principles.stories.tsx`
  // 綠:乾淨的合成頁
  const clean = checkTutorialFile(file, CLEAN)
  expect(clean.length === 0, `乾淨的合成頁 0 筆(實得 ${clean.length}:${clean.map((h) => `${h.rule}:${h.line} ${h.message}`).join(' / ')})`)
  // 同一段放在 patterns 文件頁也 0 筆;但 patterns 頁不要求 TutorialPage
  expect(checkTutorialFile(`${SRC}/patterns/demo/demo.stories.tsx`, 'export const A = { render: () => <div>沒有教學框</div> }\n').length === 0, 'Patterns 文件頁沒有教學框 → 0 筆')
  // 紅:每個合成違規在指定行
  for (const [name, edits, rule, line] of MUTATIONS) {
    let text = CLEAN
    if (edits === null) text = CLEAN.replace(/TutorialPage/g, 'PageShell')
    else for (const [from, to] of edits) { expect(text.includes(from), `對照組「${name}」的注入點存在`); text = text.replace(from, to) }
    const hits = checkTutorialFile(file, text).concat(checkLooseTimesTwo(file, text))
    if (rule === null) { expect(hits.length === 0, `「${name}」→ 0 筆(實得 ${hits.map((h) => `${h.rule}:${h.line}`).join(' ') || '0 筆'})`); continue }
    const want = typeof line === 'string' ? text.split('\n').findIndex((l) => l.includes(line)) + 1 : line
    expect(want > 0 && hits.some((h) => h.rule === rule && h.line === want), `「${name}」→ ${rule} 在 :${want}(實得 ${hits.map((h) => `${h.rule}:${h.line}`).join(' ') || '0 筆'})`)
  }
  // Tokens / Patterns 文件頁(T7 甲)
  for (const [name, f, text, want] of DOC_PAGE_CASES) {
    const hits = checkTutorialFile(f, text)
    if (want === null) expect(hits.length === 0, `${name}(實得 ${hits.map((h) => `${h.rule}:${h.line}`).join(' ') || '0 筆'})`)
    else expect(hits.some((h) => h.rule === want[0] && h.line === want[1]), `${name} → ${want[0]} :${want[1]}(實得 ${hits.map((h) => `${h.rule}:${h.line}`).join(' ') || '0 筆'})`)
  }
  // 紅:Patterns 文件頁自抄 Rule(Action Bar 原本的形狀)
  const patternRule = 'const Rule = ({ title }: { title: string }) => (\n  <div className="mb-[var(--layout-space-loose)]"><h3>{title}</h3></div>\n)\n'
  expect(checkTutorialFile(`${SRC}/patterns/action-bar/action-bar.stories.tsx`, patternRule).some((h) => h.rule === 'R2' && h.line === 1), 'Patterns 文件頁自抄 Rule → R2 :1')
  // 紅:c6c192a1 的真檔
  for (const fx of BASE_FIXTURES) {
    const raw = readFileSync(join(root, fx.fixture))
    if (gitBlobId(raw) !== fx.blob) throw new InstrumentError(`對照組 fixture ${fx.fixture} 不是原檔(blob ${gitBlobId(raw)} ≠ ${fx.blob})`)
    const hits = checkTutorialFile(fx.file, raw.toString('utf8'))
    const commit = fx.fixture.match(/\.([0-9a-f]{8})\.tsx\.txt$/)?.[1] ?? '?'
    for (const [rule, line] of fx.expect) expect(hits.some((h) => h.rule === rule && h.line === line), `${commit} ${fx.file.split('/').pop()} → ${rule} :${line}(實得 ${hits.map((h) => `${h.rule}:${h.line}`).join(' ')})`)
  }
  // R8:共用元件被改成借 bottom / 換標題 → 紅;現況 → 綠
  const helper = readFileSync(join(root, HELPER), 'utf8')
  expect(checkHelper(helper).length === 0, '現況的 tutorial-page.tsx 仍是 ②')
  expect(checkHelper(helper.replace('gap-[calc(var(--layout-space-loose)*2)]', 'gap-[var(--layout-space-bottom)]')).filter((h) => h.rule === 'R8').length === 2, '塊距改成 --layout-space-bottom → R8 兩筆(值不對 + 借 bottom)')
  expect(checkHelper(helper.replace('text-h3 font-semibold', 'text-h5 font-semibold')).length === 1, '段落標題改回 text-h5 → R8')
  expect(checkLooseTimesTwo(HELPER, helper).length === 0, 'loose × 2 寫在共用元件裡 → 不算(那是它唯一的住所)')
  // R8(2026-10-20):頁根字級 / 三段段名 / noteTone / Children.count —— 現況綠、各注入一種舊形狀紅、be2f1324 的原檔紅
  const r8 = (t) => checkHelper(t).filter((h) => h.rule === 'R8').map((h) => h.message)
  expect(r8(helper.replace("const PAGE_TEXT = 'text-body'", "const PAGE_TEXT = ''")).some((m) => m.includes('text-body')), '頁根拿掉 text-body → R8')
  expect(r8(helper.replace("siblings: '和相近元件怎麼選'", "siblings: 'vs 近親'")).some((m) => m.includes('段名')), '段名改回「vs 近親」→ R8')
  expect(r8(helper.replace('React.Children.toArray(children)', 'React.Children.count(children)')).some((m) => m.includes('toArray')), '改回 Children.count → R8')
  expect(r8(helper.replace('  examplesClassName?: string\n}', "  examplesClassName?: string\n  noteTone?: 'muted' | 'secondary'\n}")).some((m) => m.includes('noteTone')), '加回 noteTone 選項 → R8')
  const baseHelper = readFileSync(join(root, BASE_HELPER.fixture))
  if (gitBlobId(baseHelper) !== BASE_HELPER.blob) throw new InstrumentError(`對照組 fixture ${BASE_HELPER.fixture} 不是 be2f1324 的原檔`)
  const baseR8 = r8(baseHelper.toString('utf8'))
  for (const k of ['text-body', '段名', 'noteTone', 'toArray']) expect(baseR8.some((m) => m.includes(k)), `be2f1324 的 tutorial-page.tsx → R8「${k}」(實得 ${baseR8.length} 筆)`)
  return { ok, fails }
}

// ═══════════════════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2)
  const rootArg = args.find((a) => a.startsWith('--root='))
  const root = rootArg ? resolve(rootArg.slice('--root='.length)) : SCRIPT_ROOT
  try {
    if (args.includes('--selftest')) {
      const { ok, fails } = runSelftest(root)
      if (fails.length) {
        console.error('✗ tutorial-page-invariant --selftest 失敗:')
        for (const f of fails) console.error(`  ✗ ${f}`)
        process.exit(1)
      }
      console.log(`✓ tutorial-page-invariant --selftest:${ok.length} 題全過`)
      for (const o of ok) console.log(`  · ${o}`)
      return
    }
    const { hits, scanned } = scanTree(root)
    if (hits.length) {
      console.error(`✗ 教學頁繞過共用元件 / 手寫段落與規則間距 ${hits.length} 處(stories-helpers/examples/tutorial-page.tsx;category-templates.md「教學框的間距與標題」):`)
      for (const h of hits) console.error(`  ${h.rule} ${h.file}:${h.line}  ${h.message}`)
      process.exit(1)
    }
    console.log(`✓ tutorial-page-invariant:${scanned.principles} 個設計原則頁 + ${scanned.patternPages} 個 Tokens / Patterns 文件頁都由共用教學頁元件組成,段落 / 規則間距沒有手寫(掃 ${scanned.files} 檔)`)
  } catch (error) {
    if (error instanceof InstrumentError) {
      console.error(`INSTRUMENT-FAIL tutorial-page-invariant:${error.message}`)
      process.exit(2)
    }
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

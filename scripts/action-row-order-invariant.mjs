#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 裡每一列按鈕(stories / 元件原始碼 / 範本裡的 ButtonGroup、手寫 flex 按鈕列、Dialog / Sheet / Popover / Surface footer、
 *         toolbar)的順序與對齊都照 patterns/action-bar/action-bar.spec.md:109(有標題 → 靠右;沒有標題 → 靠左)與 :121
 *         (全局排序 primary > secondary > tertiary > text;靠右時 primary 最右、靠左時 primary 最左;同 variant 內 danger 在後),
 *         直排照 components/Button/button.spec.md「垂直排列」(最希望被點的放最上);stories 裡手寫的按鈕列不得自己重抄 ButtonGroup。
 *   紅: 靠左 / 直排的列裡 primary 不在最前、靠右的列裡 primary 不在最後、同 variant 內 danger 排在非 danger 前面;沒有標題卻靠右
 *       (justify-end / ml-auto / ButtonGroup align="end",且不是 owner 已規定靠右的浮層 footer);stories 裡手寫 `flex gap-2` 包 ≥ 2 顆
 *       有字按鈕(= 重抄 ButtonGroup)→ 指名 file:line 並 exit 1;--selftest 以修正前的真檔(TreeView 步驟引導、Steps 設計規格、
 *       Field 設計原則、Breadcrumb 設計原則、Textarea 設計原則、Density 頁面版型,git blob 驗明正身)與合成違規(含包在 DialogClose /
 *       Tooltip 裡的按鈕、BulkActionBar / Alert 槽裡的 fragment 列)證明每條在指定行紅。
 *   綠: 現況 0 筆;合成的乾淨列(靠左 primary 最前、靠右有標題 primary 最後、浮層 footer、置中的空狀態、條件式擇一的按鈕、
 *       mr-auto 分成兩群、圖示鈕工具層、直排 primary 最上、測試夾具、DialogClose 包著「取消」的正確頁腳、不知道 owner 的槽)0 筆。純靜態(TypeScript AST)、不讀時間、不開瀏覽器;
 *       掃到 0 檔或 0 列 = 儀器失效(exit 2),不讀成通過。
 *
 * SSOT:patterns/action-bar/action-bar.spec.md 第二節「對齊方向的決定」(:109)與第三節「全局排序」「danger 位置」(:121–:122);
 *       components/Button/button.spec.md「按鈕排列 › 垂直排列」;浮層 footer 靠右的 owner = components/Dialog/dialog.spec.md:178
 *       「Footer 按鈕」(按鈕靠右 justify-end)+ patterns/overlay-surface/overlay-surface.spec.md:237(SurfaceFooter justify-end,
 *       Sheet / Popover 頁腳純轉發);
 *       ButtonGroup 擁有群組內鈕距(components/Button/button-group.tsx 檔頭:「負責群組內的間距(gap 8px)與對齊方式」)。
 *
 * 為什麼有這支(2026-10-20,user 的提問觸發盤查 —— 原話「我們應該也有定義何時primary放右何時放左吧？為何沒注意？為何會漂移？我們有SSOT吧？」,
 *   是提問不是拍板;規則本身是既有的 action-bar.spec.md:109 / :121):
 *   TreeView 展示的步驟引導(f0dbaf5a)把「上一步」放在「下一步」左邊、整列靠左 —— 註解引 coachmark.spec.md「Footer 按鈕順序」,
 *   但那是 Coachmark 浮層 footer(右側 actions)的規則,搬到沒有標題、靠左的表單頁底就正好反了;Steps 設計規格頁從 main 就是同一個錯,
 *   而且是手寫 `flex gap-2`。順序 / 對齊的 SSOT 早就寫在 action-bar.spec.md:109 / :121,卻沒有任何機械面看得到:
 *   2026-10-13 的稽核(XF-01)查到的是 coachmark / dialog 各自的頁腳規則,結論寫成「沒有 owner」,沒有往上走到 patterns/action-bar;
 *   也沒有任何閘。這支就是那個機械面。
 *
 * 判法(全部看結構,不看名字):
 *   · 一列 = 一個 JSX 元素,它的直接子節點(穿過 fragment、`cond && …`;三元運算式兩邊各是一個選項,`.map` 不展開)裡有 Button;
 *     或是當成元件槽的值傳進去的 fragment(`actions={<>…</>}`),位置照 SLOT_OWNERS 表上 owner 的規定(BulkActionBar.actions 靠左、
 *     DialogHeader.actions / Alert / Notice 的 endContent / FileItem.actions 靠右;表上沒有的槽 = `slot?`,列出來不判)。
 *     只包一顆按鈕的包裝(`<DialogClose asChild>`、`<TooltipTrigger asChild>`、`<Tooltip>` 根底下只有一個 TooltipTrigger …)看穿到那顆
 *     Button:它本身不算一列,裡面的按鈕算進它所在的那一列(2026-10-20 獨立複核 R1b-T6:原本 Dialog 頁腳的「取消」包在 DialogClose
 *     裡,整列只剩一顆 primary,順序從來沒比過)。
 *     有字的 Button 才排序(iconOnly 是工具層 / 溢出,action-bar.spec.md:125 / 第二節「工具層永遠在業務層右側」不參與全局排序);
 *     variant 讀字面值,沒寫 = tertiary(button.tsx defaultVariants),讀不到(運算式)= 不比;`link` 是導覽,不在操作列(:119)。
 *     子節點帶 `mr-auto` 的那顆把列切成左右兩群(左群靠左、右群靠右且左群就是它的「標題」—— DatePicker footer「此刻 | 確定」)。
 *   · 對齊:SurfaceFooter / DialogFooter / SheetFooter / PopoverFooter = 靠右(owner 已規定,不需標題);ButtonGroup align="end" /
 *     className 有 justify-end / 自己帶 ml-auto / self-end = 靠右;justify-center 或在 Empty 的 action 裡 = 置中(SSOT 沒定順序,不比);
 *     justify-between 而且子節點全是按鈕 = 兩端分開(各自成一群,不判對齊);
 *     intrinsic 容器用 gap-[var(--layout-space-loose|tight)] 當鈕距 = 範例並排(一顆鈕一則範例,變體 / 狀態展示),不是一組動作,不判;父層是 justify-between 而本列是最後一個子節點、前面有東西
 *     (標題 / 計數 / 說明)= 靠右且有標題;orientation="vertical" / flex-col = 直排;其餘 = 靠左。
 *   · 標題:同一列(或父層 justify-between 的前面兄弟、同檔小元件 ToolbarFrame 這類「title 在左、children 在右」的框)有非按鈕內容。
 *
 *   node scripts/action-row-order-invariant.mjs              判定(exit 0 綠 / 1 紅 / 2 儀器失效)
 *   node scripts/action-row-order-invariant.mjs --selftest   對照組
 *   node scripts/action-row-order-invariant.mjs --list       列出全部操作列與判定結果(不判紅綠)
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { testOnlyRanges } from './story-layer-drift-invariant.mjs'

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SELF = 'scripts/action-row-order-invariant.mjs'
const SCAN_DIRS = ['packages/design-system/src', 'apps/template/src', 'packages/design-system/ds-canonical/templates']

export class InstrumentError extends Error {}

const RANK = { primary: 0, secondary: 1, tertiary: 2, text: 3 }
const RIGHT_FOOTERS = new Set(['SurfaceFooter', 'DialogFooter', 'SheetFooter', 'PopoverFooter'])
const MARKER = /@story-counter-example:\s*(\S.{5,})/

const isJsx = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)
const tagOf = (n) => (ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName).getText()
const attrsOf = (n) => (ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes).properties
const attr = (n, name) => attrsOf(n).find((p) => ts.isJsxAttribute(p) && p.name.getText() === name)
/** 字面值屬性:true(無值)/ 字串 / undefined(沒寫)/ DYN(運算式) */
const DYN = Symbol('dynamic')
function attrValue(n, name) {
  const a = attr(n, name)
  if (!a) return undefined
  if (!a.initializer) return true
  if (ts.isStringLiteral(a.initializer)) return a.initializer.text
  const e = a.initializer.expression
  if (!e) return DYN
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text
  if (e.kind === ts.SyntaxKind.TrueKeyword) return true
  if (e.kind === ts.SyntaxKind.FalseKeyword) return false
  return DYN
}
/** className 的字面 class(cn(...) / 樣板 / 條件式裡的字面值都收) */
function classTokens(n) {
  const a = attr(n, 'className')
  if (!a?.initializer) return []
  const out = []
  const visit = (e) => {
    if (!e) return
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) { out.push(...e.text.split(/\s+/)); return }
    if (ts.isTemplateExpression(e)) { out.push(...e.head.text.split(/\s+/)); for (const s of e.templateSpans) { visit(s.expression); out.push(...s.literal.text.split(/\s+/)) } return }
    ts.forEachChild(e, visit)
  }
  if (ts.isStringLiteral(a.initializer)) out.push(...a.initializer.text.split(/\s+/))
  else visit(a.initializer.expression)
  return out.filter(Boolean)
}
const hasClass = (n, re) => isJsx(n) && classTokens(n).some((t) => re.test(t.replace(/^.*:/, '')))

/** 子節點攤平成「槽」:每槽是一組擇一的節點(三元兩邊各一個;其餘一個)。.map 與其他運算式不展開。 */
function slotsOf(children) {
  const slots = []
  const visitExpr = (e, into) => {
    if (!e) return
    if (ts.isParenthesizedExpression(e)) return visitExpr(e.expression, into)
    if (isJsx(e) || ts.isJsxFragment(e)) return visitNode(e, into)
    if (ts.isConditionalExpression(e)) {
      const a = []; const b = []
      visitExpr(e.whenTrue, a); visitExpr(e.whenFalse, b)
      if (a.length <= 1 && b.length <= 1 && (a.length || b.length)) { into.push({ alts: [...a, ...b].map((x) => x.alts[0]), optional: !a.length || !b.length }); return }
      for (const s of [...a, ...b]) into.push({ ...s, optional: true })
      return
    }
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const inner = []
      visitExpr(e.right, inner)
      for (const s of inner) into.push({ ...s, optional: true })
    }
  }
  const visitNode = (n, into) => {
    if (ts.isJsxFragment(n) || (ts.isJsxElement(n) && /^(React\.)?Fragment$/.test(tagOf(n)))) { for (const c of n.children) visitChild(c, into); return }
    into.push({ alts: [n], optional: false })
  }
  const visitChild = (c, into) => {
    if (ts.isJsxText(c)) { if (c.text.trim()) into.push({ alts: [{ text: c.text.trim() }], optional: false }); return }
    if (ts.isJsxExpression(c)) { if (c.expression) visitExpr(c.expression, into); return }
    visitNode(c, into)
  }
  for (const c of children) visitChild(c, slots)
  return slots
}

/**
 * 只包一顆按鈕的包裝 → 裡面那顆按鈕。畫面上這一格就是那顆 Button(Radix 的 asChild 把行為併進子節點),
 * 所以排序、對齊都要看穿它 —— 否則 Dialog 頁腳把「取消」包在 <DialogClose asChild> 裡,整列就只剩一顆 primary、從來不比順序。
 * 判法看結構不看名單:(a) 名字以 Trigger / Close 結尾、底下剛好一個 JSX 子節點;(b) 複合元件的根(Tooltip / DropdownMenu /
 * Popover / Dialog / HoverCard …)底下剛好一個「自己名字 + Trigger」的子節點(其餘是 Content,不在列上)。
 */
function unwrap(n) {
  if (!n || n.text || !ts.isJsxElement(n)) return n
  const t = tagOf(n)
  const kids = n.children.filter(isJsx)
  if (/(Trigger|Close)$/.test(t) && kids.length === 1) return unwrap(kids[0])
  const trig = kids.filter((k) => tagOf(k) === `${t}Trigger`)
  if (trig.length === 1) return unwrap(trig[0])
  return n
}
const isButton = (n) => { const u = unwrap(n); return !!u && !u.text && isJsx(u) && tagOf(u) === 'Button' }
const isDivider = (n) => n && !n.text && isJsx(n) && /^(ButtonDivider|Separator)$/.test(tagOf(n))

/** 一顆 Button 的排序鍵;null = 不參與排序(iconOnly / link / 讀不到 variant) */
function buttonKey(b) {
  b = unwrap(b)
  const io = attrValue(b, 'iconOnly')
  if (io === true || io === DYN) return null
  let v = attrValue(b, 'variant')
  if (v === undefined) v = 'tertiary'
  if (v === DYN || !(v in RANK)) return null
  const d = attrValue(b, 'danger')
  const danger = d === true || d === 'true'
  if (d === DYN) return null
  // primary + danger 不受「同 variant 內 danger 在後」影響(:122)
  return { variant: v, rank: RANK[v] * 2 + (danger && v !== 'primary' ? 1 : 0) }
}

/** 同檔 module 層的小元件 → 它回傳的 JSX 根節點 */
function localRoots(sf) {
  const map = new Map()
  const fnRoot = (fn) => {
    let body = fn.body
    if (!body) return null
    while (body && ts.isParenthesizedExpression(body)) body = body.expression
    if (isJsx(body)) return body
    if (ts.isBlock(body)) { const ret = body.statements.filter(ts.isReturnStatement).pop(); let e = ret?.expression; while (e && ts.isParenthesizedExpression(e)) e = e.expression; return e && isJsx(e) ? e : null }
    return null
  }
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body) { const r = fnRoot(st); if (r) map.set(st.name.text, r) }
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
      let init = d.initializer
      while (init && ts.isParenthesizedExpression(init)) init = init.expression
      if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) { const r = fnRoot(init); if (r) map.set(d.name.text, r) }
    }
  }
  return map
}

/** 「title 在左、children 在右」的框:根節點(或它的直接子層)是 justify-between,且 children 放在某個前面還有東西的位置 */
function isTitleLeftFrame(root) {
  const holds = (el) => {
    if (!ts.isJsxElement(el)) return false
    const kids = el.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()))
    const idx = kids.findIndex((c) => ts.isJsxExpression(c) && c.expression && ts.isIdentifier(c.expression) && c.expression.text === 'children')
    return idx > 0 && (hasClass(el, /^justify-between$/) || /^ChromeHeader$/.test(tagOf(el)) && classTokens(el).includes('justify-between'))
  }
  if (holds(root)) return true
  if (ts.isJsxElement(root)) for (const c of root.children) if (isJsx(c) && holds(c)) return true
  return false
}

/**
 * 元件的「按鈕槽」屬性 → 元件把這個槽放在哪裡(owner 已規定,consumer 傳進來的那一列照它排)。
 * 不在表上的槽 = 不知道 owner 的位置 → 列出來(--list 標 `slot?`),不判對錯;新槽出現時補上 owner 出處即可。
 */
export const SLOT_OWNERS = {
  // 批次操作緊接在「已選 N 項」與分隔線後、由左往右排(bulk-action-bar.tsx 的 actions 容器 `flex … flex-1`;spec「結構」圖)
  'BulkActionBar.actions': { align: 'start', titled: false, cite: 'components/BulkActionBar/bulk-action-bar.tsx:172-173(actions 容器 flex-1,接在計數與分隔線後)+ bulk-action-bar.spec.md「結構」' },
  // 標題在左、header 操作在右上(Close X 左側)
  'DialogHeader.actions': { align: 'end', titled: true, cite: 'components/Dialog/dialog.spec.md:161「Header actions slot」' },
  // 右側操作區(對齊第一行、靠右)
  'Alert.endContent': { align: 'end', titled: true, cite: 'components/Alert/alert.spec.md:94 / :113「右側操作區」' },
  'Notice.endContent': { align: 'end', titled: true, cite: 'components/Notice/notice.spec.md:67「Layout」[title + description] [endContent] [dismiss X]' },
  // 列的尾端操作(名稱在左)
  'FileItem.actions': { align: 'end', titled: true, cite: 'components/FileItem/file-item.spec.md:316 / :425(trailing actions)' },
  // 等寬均分整條寬度 —— 不是靠左也不是靠右,action-bar.spec.md:109 / :121 沒有定這種列的順序(ProfileCard spec 寫「無主次之分」)→ 不判
  'ProfileCard.actions': { align: 'fill', titled: false, cite: 'components/ProfileCard/profile-card.spec.md:86「Action 行」等寬均分' },
  // 置中的空狀態(SSOT 沒定順序)
  'Empty.action': { align: 'center', titled: false, cite: 'components/Empty/empty.spec.md:59(Action 居中)' },
}

/** 這個節點是不是某個元件屬性的值(穿過括號、三元、&&);是 → { key: 'Owner.prop' } */
function slotOf(n) {
  let p = n.parent
  while (p && (ts.isParenthesizedExpression(p) || ts.isConditionalExpression(p) || (ts.isBinaryExpression(p) && /^(&&|\|\||\?\?)$/.test(p.operatorToken.getText())))) p = p.parent
  if (!p || !ts.isJsxExpression(p) || !ts.isJsxAttribute(p.parent)) return null
  const owner = p.parent.parent.parent // JsxAttribute → JsxAttributes → JsxOpeningElement / JsxSelfClosingElement
  return { key: `${owner.tagName.getText()}.${p.parent.name.getText()}` }
}

/** 這一列的位置:start / end / center / split / vertical,以及有沒有標題 */
function placement(sf, row, locals) {
  const tag = tagOf(row)
  if (RIGHT_FOOTERS.has(tag)) return { align: 'end', titled: true, owner: 'footer' }
  const cls = classTokens(row)
  const base = (re) => cls.some((t) => re.test(t.replace(/^.*:/, '')))
  // 範例排版:intrinsic 容器用 layout-space 當間距 = 一顆鈕一則範例並排(變體 / 狀態展示),不是同一組動作 —— 不判
  if (/^[a-z]/.test(tag) && base(/^gap(-[xy])?-\[var\(--layout-space-(loose|tight)\)\]$/)) return { align: 'examples', titled: false }
  if (attrValue(row, 'orientation') === 'vertical' || base(/^flex-col$/)) return { align: 'vertical', titled: false }
  if (tag !== 'ButtonGroup' && /^[a-z]/.test(tag) && !base(/^(inline-)?flex$/)) return { align: 'none', titled: false }
  // 整列被當成某個元件槽的值傳進去(actions={<ButtonGroup>…</ButtonGroup>})→ 位置由那個元件決定
  const slot = slotOf(row)
  if (slot) { const o = SLOT_OWNERS[slot.key]; return o ? { align: o.align, titled: o.titled, owner: 'slot' } : { align: 'slot?', titled: false, owner: 'slot' } }
  if (/^[A-Z]/.test(tag) && tag !== 'ButtonGroup') {
    // 同檔的框元件(ToolbarFrame):children 被放在 title 右邊
    const r = locals.get(tag)
    if (r && isTitleLeftFrame(r) && attrValue(row, 'title') !== undefined) return { align: 'end', titled: true }
    if (r && isTitleLeftFrame(r)) return { align: 'split', titled: false }
    return { align: 'none', titled: false }
  }
  if (base(/^justify-center$/) || attrValue(row, 'align') === 'center') return { align: 'center', titled: false }
  // 父層脈絡
  const parent = parentElement(row)
  if (isInEmptyAction(row)) return { align: 'center', titled: false }
  let align = 'start'
  if (attrValue(row, 'align') === 'end' || base(/^justify-end$/) || base(/^(ml-auto|self-end)$/)) align = 'end'
  if (base(/^justify-between$/)) align = 'between'
  let titled = false
  if (parent) {
    const pslots = slotsOf(ts.isJsxElement(parent) ? parent.children : []).map((s) => s.alts[0])
    const at = pslots.indexOf(row)
    const pbetween = hasClass(parent, /^justify-between$/) || (RIGHT_FOOTERS.has(tagOf(parent)) && classTokens(parent).includes('justify-between'))
    if (pbetween && at > 0 && at === pslots.length - 1) { align = 'end'; titled = true }
    if (hasClass(parent, /^justify-end$/) && align === 'start') align = 'end'
    if (at > 0 && pslots.slice(0, at).some((x) => x && (x.text || (isJsx(x) && !isButton(x) && /^(h[1-6]|span|p|strong|code|label)$/.test(tagOf(x)))))) titled = titled || align === 'end'
    // 父層是 title 在左的框元件
    if (/^[A-Z]/.test(tagOf(parent))) {
      const r = locals.get(tagOf(parent))
      if (r && isTitleLeftFrame(r)) { const t = attrValue(parent, 'title'); if (t !== undefined) { align = 'end'; titled = true } }
    }
    if (tagOf(parent) === 'ChromeHeader' && classTokens(parent).includes('justify-between') && at > 0) { align = 'end'; titled = true }
    if (RIGHT_FOOTERS.has(tagOf(parent)) && align === 'start') return { align: 'end', titled: true, owner: 'footer' }
  }
  return { align, titled }
}

function parentElement(n) {
  let p = n.parent
  while (p) {
    if (ts.isJsxElement(p)) return p
    if (ts.isSourceFile(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p)) return null
    p = p.parent
  }
  return null
}
function isInEmptyAction(n) {
  for (let p = n.parent; p && !ts.isSourceFile(p); p = p.parent) {
    if (ts.isJsxAttribute(p) && p.name.getText() === 'action') {
      const owner = p.parent?.parent
      if (owner && isJsx(owner) && tagOf(owner) === 'Empty') return true
    }
    if (isJsx(p) && p !== n) return false
  }
  return false
}

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

function markerAllowed(text, line, principles) {
  if (!principles) return false
  const lines = text.split('\n')
  return [lines[line - 1], lines[line - 2]].some((l) => l && MARKER.test(l))
}

/**
 * 檢查一個檔。回傳 { hits, rows }:rows 是找到的每一列(--list 用),hits 是違規。
 * @param {string} file 相對 repo 根的路徑
 */
export function checkActionRows(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const isStory = file.endsWith('.stories.tsx')
  const principles = file.endsWith('.principles.stories.tsx')
  const skip = isStory ? testOnlyRanges(sf) : []
  const inSkip = (n) => skip.some(([a, b]) => n.getStart(sf) >= a && n.getEnd() <= b)
  const locals = localRoots(sf)
  const hits = []
  const rows = []
  const visit = (n) => {
    // 一列 = JSX 元素(本身不是「只包一顆按鈕的包裝」),或被當成元件槽的值傳進去的 fragment(actions={<>…</>})
    const fragSlot = ts.isJsxFragment(n) ? slotOf(n) : null
    if (((ts.isJsxElement(n) && !isButton(n)) || fragSlot) && !inSkip(n)) {
      const slots = slotsOf(n.children)
      const btnSlots = slots.filter((s) => s.alts.some(isButton))
      if (btnSlots.length) {
        const line = lineOf(sf, n)
        const p = fragSlot
          ? (SLOT_OWNERS[fragSlot.key] ? { align: SLOT_OWNERS[fragSlot.key].align, titled: SLOT_OWNERS[fragSlot.key].titled, owner: 'slot' } : { align: 'slot?', titled: false, owner: 'slot' })
          : placement(sf, n, locals)
        const row = { file, line, tag: fragSlot ? `<>@${fragSlot.key}` : tagOf(n), ...p, buttons: [] }
        rows.push(row)
        const allowed = markerAllowed(text, line, principles)
        // mr-auto 把列切成左右兩群
        const cut = slots.findIndex((s) => s.alts.some((x) => isJsx(x) && (hasClass(x, /^mr-auto$/) || hasClass(unwrap(x), /^mr-auto$/))))
        const groups = cut >= 0 && (p.align === 'end' || p.align === 'start')
          ? [{ slots: slots.slice(0, cut + 1), align: 'start' }, { slots: slots.slice(cut + 1), align: 'end', titled: true }]
          : [{ slots, align: p.align, titled: p.titled }]
        for (const g of groups) {
          // 每一組擇一的展開(上限 16 種)
          let combos = [[]]
          for (const s of g.slots) {
            const opts = s.alts.filter((x) => isButton(x) || isDivider(x) || true)
            const next = []
            for (const c of combos) for (const o of (s.optional ? [...opts, null] : opts)) next.push(o ? [...c, o] : c)
            combos = next.slice(0, 16)
          }
          for (const combo of combos) {
            const keys = combo.filter(isButton).map((b) => ({ b, k: buttonKey(b) })).filter((x) => x.k)
            row.buttons = keys.map((x) => x.k.variant)
            if (keys.length >= 2 && !allowed) {
              const ranks = keys.map((x) => x.k.rank)
              const startLike = g.align === 'start' || g.align === 'vertical'
              const bad = startLike ? ranks.findIndex((r, i) => i > 0 && r < ranks[i - 1]) : g.align === 'end' ? ranks.findIndex((r, i) => i > 0 && r > ranks[i - 1]) : -1
              if (bad > 0) {
                const where = g.align === 'vertical' ? '直排的列裡最希望被點的按鈕必須在最上(button.spec.md「垂直排列」)'
                  : g.align === 'start' ? '靠左的列裡 primary 必須在最左、依 primary > secondary > tertiary > text 往右排(action-bar.spec.md:121)'
                    : '靠右的列裡 primary 必須在最右、依重量由右往左遞減(action-bar.spec.md:121)'
                const got = keys.map((x) => x.k.variant + (x.k.rank % 2 ? '+danger' : '')).join(' → ')
                hits.push({ rule: 'A1', file, line: lineOf(sf, unwrap(keys[bad].b)), message: `按鈕順序 ${got} —— ${where}` })
                break
              }
            }
          }
          // 對齊:沒有標題卻靠右(owner 規定的浮層 footer 與 mr-auto 右群除外)
          if (g.align === 'end' && !g.titled && !p.owner && !allowed && g.slots.some((s) => s.alts.some((x) => isButton(x) && buttonKey(x)))) {
            hits.push({ rule: 'A2', file, line, message: `<${tagOf(n)}> 這一列沒有標題卻靠右 —— 沒有標題的操作列按鈕靠左(action-bar.spec.md:109「空白放在右邊不會造成視覺斷裂,放在左邊會讓按鈕群組像是漂在半空」);靠右只給有標題的列與 owner 已規定的浮層 footer` })
          }
        }
        // 手寫的 ButtonGroup:stories 裡 intrinsic flex 列、子節點只有 ≥ 2 顆有字按鈕、鈕距就是 ButtonGroup 的 gap-2
        if (isStory && !fragSlot && /^[a-z]/.test(tagOf(n)) && p.align !== 'vertical' && p.align !== 'none') {
          const kids = slots.map((s) => s.alts[0])
          const labeled = kids.filter((x) => isButton(x) && attrValue(unwrap(x), 'iconOnly') !== true)
          if (labeled.length >= 2 && kids.every((x) => isButton(x) || isDivider(x)) && hasClass(n, /^gap-2$/) && !allowed) {
            hits.push({ rule: 'A3', file, line, message: `手寫 <${tagOf(n)} className="flex gap-2"> 排 ${labeled.length} 顆按鈕 = 重抄 ButtonGroup —— 同一組動作的鈕用 ButtonGroup(鈕距與對齊由群組擁有,button-group.tsx)` })
          }
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return { hits, rows }
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { if (name !== 'node_modules' && name !== 'dist') walk(p, acc) } else if (p.endsWith('.tsx')) acc.push(p)
  }
  return acc
}

export function scanTree(root) {
  const files = []
  for (const d of SCAN_DIRS) { const abs = join(root, d); if (existsSync(abs)) files.push(...walk(abs)) }
  if (!files.length) throw new InstrumentError('掃到 0 個 .tsx —— 儀器讀不到東西,不是通過')
  const hits = []; const rows = []
  for (const abs of files) {
    const rel = relative(root, abs).split(sep).join('/')
    const r = checkActionRows(rel, readFileSync(abs, 'utf8'))
    hits.push(...r.hits); rows.push(...r.rows)
  }
  if (rows.length < 50) throw new InstrumentError(`只找到 ${rows.length} 列按鈕 —— 少於 50 列代表判法壞了,不是通過`)
  return { hits, rows, files: files.length }
}

// ═══════════════════════════════════════════════════════════════════════════
// --selftest
// ═══════════════════════════════════════════════════════════════════════════

const gitBlobId = (buf) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex')

/** 修正前的真檔(be2f1324),逐位元組 = 各自的 git blob;expect = 必須在這幾行紅 */
export const BASE_FIXTURES = [
  // TreeView 展示步驟引導(f0dbaf5a 新增):靠左卻「上一步」(tertiary)在「下一步」(primary)前面
  { file: 'packages/design-system/src/components/TreeView/tree-view.stories.tsx', fixture: 'scripts/test-fixtures/action-row-order/tree-view.stories.be2f1324.tsx.txt', blob: 'e1ac5f505ac8a67144a3acfcadf29a9be1eb5ee7', expect: [['A1', 141]] },
  // Steps 設計規格(main 就有):同一個錯 + 手寫 flex gap-2
  { file: 'packages/design-system/src/components/Steps/steps.anatomy.stories.tsx', fixture: 'scripts/test-fixtures/action-row-order/steps.anatomy.stories.be2f1324.tsx.txt', blob: 'e6bf29c8315bfc88f9ff693755a3ebac3ae1df7e', expect: [['A1', 317], ['A3', 313]] },
  // Field 設計原則:表單底沒有標題卻 align="end"
  { file: 'packages/design-system/src/components/Field/field.principles.stories.tsx', fixture: 'scripts/test-fixtures/action-row-order/field.principles.stories.be2f1324.tsx.txt', blob: 'a990ea52227757c086b1284ce140ed898278e897', expect: [['A2', 219]] },
  // Breadcrumb 設計原則反例裡的按鈕順序(反例教的是另一件事)
  { file: 'packages/design-system/src/components/Breadcrumb/breadcrumb.principles.stories.tsx', fixture: 'scripts/test-fixtures/action-row-order/breadcrumb.principles.stories.be2f1324.tsx.txt', blob: '9d574644f48da315457de2681949f12b9650df50', expect: [['A1', 340]] },
  // Textarea 設計原則 / Density 頁面版型:單顆鈕的列沒有標題卻 justify-end
  { file: 'packages/design-system/src/components/Textarea/textarea.principles.stories.tsx', fixture: 'scripts/test-fixtures/action-row-order/textarea.principles.stories.be2f1324.tsx.txt', blob: '7312053ac8f6f7101df3eb2a09b62b83ce205940', expect: [['A2', 175]] },
  { file: 'packages/design-system/src/tokens/density/density.stories.tsx', fixture: 'scripts/test-fixtures/action-row-order/density.stories.be2f1324.tsx.txt', blob: '979c1a6ba778501297efac12a5f620354591731d', expect: [['A2', 117]] },
]

const T = (body) => `import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
export const A = { render: () => (
${body}
) }
`
/** 合成案例:[名稱, 檔名, 內容, 預期 [[rule, line]](空 = 0 筆)] */
export const CASES = [
  ['靠左 primary 最前 → 綠', 'x.stories.tsx', T(`<ButtonGroup>\n  <Button variant="primary">下一步</Button>\n  <Button variant="tertiary">上一步</Button>\n</ButtonGroup>`), []],
  ['靠左卻 tertiary 在 primary 前 → A1', 'x.stories.tsx', T(`<ButtonGroup>\n  <Button variant="tertiary">上一步</Button>\n  <Button variant="primary">下一步</Button>\n</ButtonGroup>`), [['A1', 6]]],
  ['沒寫 variant = tertiary,排在 primary 前 → A1', 'x.stories.tsx', T(`<ButtonGroup>\n  <Button>取消</Button>\n  <Button variant="primary">儲存</Button>\n</ButtonGroup>`), [['A1', 6]]],
  ['浮層 footer 靠右 tertiary → primary → 綠', 'x.stories.tsx', T(`<DialogFooter>\n  <Button variant="tertiary">取消</Button>\n  <Button variant="primary">建立</Button>\n</DialogFooter>`), []],
  ['浮層 footer primary 在左 → A1', 'x.stories.tsx', T(`<DialogFooter>\n  <Button variant="primary">建立</Button>\n  <Button variant="tertiary">取消</Button>\n</DialogFooter>`), [['A1', 6]]],
  ['沒有標題卻 align="end" → A2', 'x.stories.tsx', T(`<ButtonGroup align="end">\n  <Button variant="tertiary">取消</Button>\n  <Button variant="primary">儲存</Button>\n</ButtonGroup>`), [['A2', 4]]],
  ['單顆鈕 justify-end、沒有標題 → A2', 'x.stories.tsx', T(`<div className="flex justify-end">\n  <Button variant="primary">送出</Button>\n</div>`), [['A2', 4]]],
  ['標題在左、按鈕列在 justify-between 右邊 → 綠', 'x.stories.tsx', T(`<div className="flex items-center justify-between">\n  <h3>成員</h3>\n  <ButtonGroup>\n    <Button variant="tertiary">匯出</Button>\n    <Button variant="primary">邀請</Button>\n  </ButtonGroup>\n</div>`), []],
  ['標題在左的框元件(ToolbarFrame)裡靠右 → primary 在左 → A1', 'x.stories.tsx', `import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
const ToolbarFrame = ({ title, children }) => (<div className="flex items-center justify-between"><span>{title}</span>{children}</div>)
export const A = { render: () => (
<ToolbarFrame title="專案">
  <ButtonGroup>
    <Button variant="primary">新增</Button>
    <Button variant="tertiary">匯出</Button>
  </ButtonGroup>
</ToolbarFrame>
) }
`, [['A1', 8]]],
  ['同 variant 內 danger 在前(靠左)→ A1', 'x.stories.tsx', T(`<ButtonGroup>\n  <Button variant="secondary" danger>放棄變更</Button>\n  <Button variant="secondary">儲存草稿</Button>\n</ButtonGroup>`), [['A1', 6]]],
  ['primary + danger 不受 danger 規則影響 → 綠', 'x.stories.tsx', T(`<ButtonGroup>\n  <Button variant="primary" danger>永久刪除</Button>\n  <Button variant="tertiary">取消</Button>\n</ButtonGroup>`), []],
  ['圖示鈕(工具層)不參與排序 → 綠', 'x.stories.tsx', T(`<ButtonGroup>\n  <Button variant="primary">新增</Button>\n  <Button variant="tertiary">匯出</Button>\n  <Button variant="text" iconOnly aria-label="設定" />\n</ButtonGroup>`), []],
  ['三元運算式擇一(確定 / 關閉)不當成兩顆並排 → 綠', 'x.tsx', T(`<SurfaceFooter>\n  <Button variant="tertiary" className="mr-auto">此刻</Button>\n  {ok ? <Button variant="primary">確定</Button> : <Button variant="tertiary">關閉</Button>}\n</SurfaceFooter>`), []],
  ['置中的空狀態 action 不判順序 → 綠', 'x.stories.tsx', T(`<Empty title="開始" description="d" action={\n  <ButtonGroup>\n    <Button variant="tertiary">從範本</Button>\n    <Button variant="primary">從零建立</Button>\n  </ButtonGroup>\n} />`), []],
  ['直排 primary 最上 → 綠;最下 → A1', 'x.stories.tsx', T(`<>\n<ButtonGroup orientation="vertical">\n  <Button variant="primary">確認送出</Button>\n  <Button variant="tertiary">取消</Button>\n</ButtonGroup>\n<ButtonGroup orientation="vertical">\n  <Button variant="tertiary">取消</Button>\n  <Button variant="primary">確認送出</Button>\n</ButtonGroup>\n</>`), [['A1', 11]]],
  ['手寫 flex gap-2 排兩顆有字按鈕 → A3', 'x.stories.tsx', T(`<div className="flex gap-2">\n  <Button variant="primary">下一步</Button>\n  <Button variant="tertiary">上一步</Button>\n</div>`), [['A3', 4]]],
  ['元件原始碼裡的 flex gap-2 不收 A3(元件自己的排版)', 'x.tsx', T(`<div className="flex gap-2">\n  <Button variant="primary">下一步</Button>\n  <Button variant="tertiary">上一步</Button>\n</div>`), []],
  ['test-only 夾具不收', 'x.stories.tsx', `import { Button } from '@/design-system/components/Button/button'
export const A = { tags: ['test-only'], render: () => (
<div className="flex justify-end gap-2">
  <Button variant="tertiary">取消</Button>
  <Button variant="primary">儲存</Button>
</div>
) }
`, []],
  // 2026-10-20 獨立複核(R1b-T6):包在 asChild 包裝裡的按鈕、用 fragment 傳進元件槽的列,原本整個看不到
  ['DialogFooter「取消」包在 DialogClose 裡、primary 在左 → A1', 'x.stories.tsx', T(`<DialogFooter>\n  <Button variant="primary">建立</Button>\n  <DialogClose asChild>\n    <Button variant="tertiary">取消</Button>\n  </DialogClose>\n</DialogFooter>`), [['A1', 7]]],
  ['DialogFooter「取消」包在 DialogClose 裡、primary 在右 → 綠', 'x.stories.tsx', T(`<DialogFooter>\n  <DialogClose asChild>\n    <Button variant="tertiary">取消</Button>\n  </DialogClose>\n  <Button variant="primary">建立</Button>\n</DialogFooter>`), []],
  ['Tooltip 包住的 tertiary 排在 primary 前(靠左)→ A1', 'x.stories.tsx', T(`<ButtonGroup>\n  <Tooltip>\n    <TooltipTrigger asChild><Button variant="tertiary">上一步</Button></TooltipTrigger>\n    <TooltipContent>回到「付款方式」</TooltipContent>\n  </Tooltip>\n  <Button variant="primary">下一步</Button>\n</ButtonGroup>`), [['A1', 9]]],
  ['BulkActionBar 的 actions fragment tertiary → primary(槽靠左)→ A1', 'x.stories.tsx', T(`<BulkActionBar selection={['a']} actions={<>\n  <Button variant="tertiary">封存</Button>\n  <Button variant="primary">刪除</Button>\n</>} />`), [['A1', 6]]],
  ['Alert 的 endContent fragment primary 在左(槽靠右)→ A1', 'x.stories.tsx', T(`<Alert title="同步失敗" endContent={<>\n  <Button variant="primary" size="xs">重試</Button>\n  <Button variant="tertiary" size="xs">查看紀錄</Button>\n</>} />`), [['A1', 6]]],
  ['不知道 owner 的槽 → 列出來、不判', 'x.stories.tsx', T(`<Unknown slot={<>\n  <Button variant="tertiary">甲</Button>\n  <Button variant="primary">乙</Button>\n</>} />`), []],
  ['設計原則頁的反例標記放行;展示頁同一個標記不算', 'x.principles.stories.tsx', T(`<>\n{/* @story-counter-example: ❌ 反例:主按鈕放錯邊本身 */}\n<ButtonGroup>\n  <Button variant="tertiary">取消</Button>\n  <Button variant="primary">儲存</Button>\n</ButtonGroup>\n</>`), []],
]

export function runSelftest(root = SCRIPT_ROOT) {
  const ok = []; const fails = []
  const expect = (cond, msg) => (cond ? ok.push(msg) : fails.push(msg))
  for (const [name, file, text, want] of CASES) {
    const { hits } = checkActionRows(file, text)
    const got = hits.map((h) => `${h.rule}:${h.line}`)
    const exact = want.length === hits.length && want.every(([r, l]) => got.includes(`${r}:${l}`))
    expect(exact, `${name}(預期 ${want.map(([r, l]) => `${r}:${l}`).join(' ') || '0 筆'};實得 ${got.join(' ') || '0 筆'})`)
  }
  // 同一個反例標記放在展示頁 → 照紅
  const showcase = checkActionRows('x.stories.tsx', T(`<>\n{/* @story-counter-example: ❌ 反例:主按鈕放錯邊本身 */}\n<ButtonGroup>\n  <Button variant="tertiary">取消</Button>\n  <Button variant="primary">儲存</Button>\n</ButtonGroup>\n</>`))
  expect(showcase.hits.some((h) => h.rule === 'A1'), '反例標記寫在展示頁不算數 → A1')
  // 包裝本身不是一列;包在裡面的按鈕算進它所在的那一列
  const wrapped = checkActionRows('x.stories.tsx', T(`<DialogFooter>\n  <DialogClose asChild>\n    <Button variant="tertiary">取消</Button>\n  </DialogClose>\n  <Button variant="primary">建立</Button>\n</DialogFooter>`))
  expect(wrapped.rows.length === 1 && wrapped.rows[0].tag === 'DialogFooter', `DialogClose 包裝不自成一列,只有 DialogFooter 一列(實得 ${wrapped.rows.map((r) => r.tag).join(' / ')})`)
  const lone = checkActionRows('x.stories.tsx', T(`<DialogTrigger asChild>\n  <Button variant="tertiary">開啟</Button>\n</DialogTrigger>`))
  expect(lone.rows.length === 0, `單獨的 DialogTrigger 包裝不是一列(實得 ${lone.rows.length} 列)`)
  const unknown = checkActionRows('x.stories.tsx', T(`<Unknown slot={<>\n  <Button variant="tertiary">甲</Button>\n  <Button variant="primary">乙</Button>\n</>} />`))
  expect(unknown.rows.length === 1 && unknown.rows[0].align === 'slot?', `不知道 owner 的槽列成 slot?(實得 ${unknown.rows.map((r) => r.align).join(' / ') || '0 列'})`)
  for (const fx of BASE_FIXTURES) {
    const raw = readFileSync(join(root, fx.fixture))
    if (gitBlobId(raw) !== fx.blob) throw new InstrumentError(`對照組 fixture ${fx.fixture} 不是修正前的原檔(blob ${gitBlobId(raw)} ≠ ${fx.blob})`)
    const { hits } = checkActionRows(fx.file, raw.toString('utf8'))
    for (const [rule, line] of fx.expect) expect(hits.some((h) => h.rule === rule && h.line === line), `修正前 ${fx.file.split('/').pop()} → ${rule} :${line}(實得 ${hits.map((h) => `${h.rule}:${h.line}`).join(' ') || '0 筆'})`)
  }
  return { ok, fails }
}

function main() {
  const args = process.argv.slice(2)
  const rootArg = args.find((a) => a.startsWith('--root='))
  const root = rootArg ? resolve(rootArg.slice('--root='.length)) : SCRIPT_ROOT
  try {
    if (args.includes('--selftest')) {
      const { ok, fails } = runSelftest(root)
      if (fails.length) { console.error('✗ action-row-order-invariant --selftest 失敗:'); for (const f of fails) console.error(`  ✗ ${f}`); process.exit(1) }
      console.log(`✓ action-row-order-invariant --selftest:${ok.length} 題全過`)
      for (const o of ok) console.log(`  · ${o}`)
      return
    }
    const { hits, rows, files } = scanTree(root)
    if (args.includes('--list')) {
      for (const r of rows) console.log(`${r.file}:${r.line} <${r.tag}> ${r.align}${r.titled ? '+title' : ''}${r.owner ? `(${r.owner})` : ''} ${r.buttons.join(',')}`)
    }
    if (hits.length) {
      console.error(`✗ 操作列的順序 / 對齊不照 action-bar.spec.md ${hits.length} 處:`)
      for (const h of hits) console.error(`  ${h.rule} ${h.file}:${h.line}  ${h.message}`)
      process.exit(1)
    }
    console.log(`✓ action-row-order-invariant:${rows.length} 列按鈕(${files} 檔)的順序與對齊都照 action-bar.spec.md:109 / :121`)
  } catch (error) {
    if (error instanceof InstrumentError) { console.error(`INSTRUMENT-FAIL action-row-order-invariant:${error.message}`); process.exit(2) }
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

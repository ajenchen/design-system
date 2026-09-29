#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 原始碼(packages/design-system/src/**\/*.tsx,含 stories)裡沒有「手刻的行內動作鈕」——
 *         (A) 只放圖示的原生 `<button>`(inline-action.spec.md:253「❌ 自刻 `<button><X /></button>`」);
 *         (B) 放在列 / 項目宿主(TreeItem / MenuItem / SidebarMenuButton / Tag / Chip / Breadcrumb …)子樹裡的
 *             icon-only `<Button>` 或原生 `<button>`(inline-action.spec.md:161-163、:217「Host 走宣告式 API … 不自刻 button JSX」)。
 *         合法例外只准寫在 ALLOWLIST,每筆帶理由與 spec 出處;清單裡對不到任何命中的條目 = 過期豁免 → 紅。
 *   紅: --selftest 把合成的「TreeItem 裡的 <button><Trash2/></button>」「MenuItem 裡的 <Button iconOnly>」
 *       「Tag 裡 DropdownMenuTrigger asChild 包的 <Button iconOnly>」「抄 primitive 形狀(span 底色層 + 圖示)的原生鈕」
 *       餵進同一支分析器,每筆都必須被指名;把允許清單清空後,真實原始碼必須恰好抓到清單裡那幾筆(證明豁免的是真的存在的東西);
 *       過期的允許清單條目必須紅;primitive 自己那顆 <button>(item-anatomy.tsx)在解除排除後必須被抓到(證明偵測看得到它守護的形狀)。
 *   綠: 現行 DS 原始碼 0 筆違規;selftest 的合法寫法(`ItemInlineActionButton`、工具列裡的 `<Button iconOnly>`、
 *        `SidebarMenuButton asChild` 包的整列 <button>、帶文字的 <button>、`rowActions` / `inlineActionsSlot` 這種
 *        以屬性傳入的 Button(spec:297(b) 的逃生口)、DataTable rowActions)必須 0 筆;
 *        掃到 0 個檔或 0 顆按鈕 = 儀器失效(紅),不讀成通過;純靜態分析、不讀時間也不開瀏覽器,重複跑結果相同。
 */
// ═══════════════════════════════════════════════════════════════════════════
// 行內動作鈕不得手刻 —— 「列上的小圖示鈕,只有一個住所:ItemInlineActionButton」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`packages/design-system/src/patterns/element-anatomy/inline-action.spec.md`
//   :217 「Host 走宣告式 API(inlineActions / endAction prop)— 不自刻 button JSX」
//   :253 「❌ 自刻 `<button><X /></button>` — 繞過 ItemInlineAction / Button dismiss 的 a11y + 尺寸自動化」
//   :157-179 Real case 表(哪些宿主是 Inline Action、哪些是 Button)/ :184-193 同列不得混用
//   :297 (b) app-code 需要視覺一致的行內動作鈕時可用 `<Button iconOnly variant="text" />` **經宿主的 slot 傳入**(逃生口)
// 尺寸 / 命中區的 owner:`ds-canonical/references/hit-area-canonical.md`(滑過底色的形狀 ≡ 命中區;TreeItem 列 18 / lg 22)。
//
// 為什麼需要(2026-09-24 → 09-27,待辦總帳 N22):TreeView 的展開箭頭 2026-09-26 之前是一顆手刻的 16×16 `<button>`
// (tree-view.tsx:1315 註解),滑過底色與點擊範圍都只有 16,跟 primitive 的 18 差 2px —— 同一種鈕兩個長相。
// 09-24 AI 承諾「全 DS 掃手刻 + 新閘擋手刻」。掃完(2026-09-27)現況只剩兩顆有 spec 明文的例外(見 ALLOWLIST);
// 這支閘讓下一顆手刻在寫下去的當天就紅,而不是等 user 在畫面上看到 2px 的差。
//
// 判準(機械,零誤判的原因寫在每條後面):
//   (A) 原生 `<button>` 的有效子節點(去掉空白、註解、純裝飾的空 <span>)**全部**是圖示元素 —— 圖示元素 =
//       該檔從 'lucide-react' 具名匯入的識別字、`<svg>`、名字以 Icon 結尾的 PascalCase 元件、或裸的 `Icon`(prop 解構的別名)。
//       為何零誤判:DS 裡合法的原生 <button> 不是帶文字(儲存 / 取消 / 句中連結)、就是包頭像 + 文字(SidebarMenuButton asChild)、
//       日期格數字、縮圖 <img>、或整顆隱形(沒有子節點);「只有圖示」這一個形狀在 spec 裡只有 primitive 一種正當實作。
//       實測 2026-09-27:全 DS 只有 2 顆命中,兩顆都有 spec 明文(ALLOWLIST)。
//   (B) icon-only 的 `<Button>`(有 `iconOnly`,或沒有子節點但有 startIcon / endIcon)或 (A) 形狀的原生鈕,
//       往上找祖先 JSX 元素碰到 ROW_HOSTS 之一 —— 這些宿主的行內動作在 spec 是宣告式 API 或內建 primitive。
//       走到 JSX 屬性就停(以 prop 傳入的是 spec:297(b) 的逃生口,不算子樹);宿主 `asChild` 直接包的那顆不算(那是整列本身)。
//       為何零誤判:ROW_HOSTS 只放 spec Real case 表明寫「Inline Action」的宿主;DataTable rowActions / FileItem actions /
//       對話框 header actions 這些 spec 明寫「Button」的位置**不在**清單裡。實測 2026-09-27:0 筆。
//   (C) ALLOWLIST 每筆 `file#icon` 必須對得到至少一筆命中;對不到 = 豁免對象已經不存在 → 紅(過期豁免比沉默貴,M37)。
//   (D) 掃到 0 個檔 / 0 顆按鈕 → 儀器失效紅(M37:沒量到 ≠ 沒發生)。
//
// 不判(超出本閘、由別的 owner 管):
//   · 帶可見文字的 <button> 沒用 <Button>(不是行內動作;Button 家族的事);
//   · 列上 icon-only <Button> 在 ROW_HOSTS 之外的手刻列(div 列):列高 ≥ 28 時 spec:130 決策樹本來就允許 Button xs,
//     靜態掃描分不出列高,寧可不判也不誤判;
//   · spec 之間的張力(data-table.spec.md:789 的 Trash text Button vs inline-action.spec.md:184 同列不混用)—— 那是 spec 的裁決,
//     不是這支閘能定的;命中的那幾顆都在 ROW_HOSTS 之外,本閘不碰。
//
//   node scripts/inline-action-hand-craft-invariant.mjs                判定(exit 0 = 0 筆違規且允許清單全對得到)
//   node scripts/inline-action-hand-craft-invariant.mjs --selftest     對照組(見 @gate-contract)
//   node scripts/inline-action-hand-craft-invariant.mjs --root <dir>   改掃別的 design-system 根目錄(只給對照組 / 測試用)
import ts from 'typescript'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, globSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const SELFTEST = argv.includes('--selftest')
const rootArgIndex = argv.indexOf('--root')
const DS_ROOT = rootArgIndex >= 0 ? argv[rootArgIndex + 1] : join(REPO, 'packages/design-system')
if (rootArgIndex >= 0 && !DS_ROOT) { console.error('✗ --root 後面要接目錄'); process.exit(1) }

const SPEC = 'packages/design-system/src/patterns/element-anatomy/inline-action.spec.md'

/** primitive 自己的實作檔:它那顆 <button> 就是 (A) 要守護的形狀,排除;selftest 會解除排除證明偵測看得到它。 */
const PRIMITIVE_FILE = 'src/patterns/element-anatomy/item-anatomy.tsx'

/**
 * 行內動作由宿主宣告式渲染的元件(inline-action.spec.md:157-179 Real case 表「Inline Action」列 + :217 已遷移清單)。
 * 子樹裡出現 icon-only 的 <Button> / 原生 <button> = 手刻。**不放** DataTable / FileItem / DialogHeader / Notice
 * —— 那些位置 spec 明寫 Button(data-table.spec.md:590 / :845 / :891;notice.spec.md:71;inline-action.spec.md:164-169)。
 */
const ROW_HOSTS = new Set([
  'MenuItem', 'DropdownMenuItem', 'DropdownMenuCheckboxItem', 'DropdownMenuRadioItem', 'DropdownMenuSubTrigger', 'ContextMenuItem',
  'TreeItem', 'SidebarMenuButton', 'SidebarMenuSubButton', 'SidebarGroupLabel', 'SelectionItem',
  'Tag', 'Chip', 'BreadcrumbItem', 'BreadcrumbEllipsis', 'PersonAvatarTag',
])

/**
 * 合法例外。每筆:`key` = `<相對 src 的檔案路徑>#<圖示元件名>`、`reason`(為什麼不是手刻)、`spec`(owner 出處,檔名:行)。
 * 空 reason / 空 spec = 啟動即紅;對不到任何命中 = 紅(過期豁免)。
 */
const ALLOWLIST = [
  {
    key: 'src/components/Field/field.tsx#InfoIcon',
    reason: 'FieldLabel 的 ⓘ 是「給資訊的觸發處」:點下去不做事(Radix Tooltip 點擊只會收起說明),只借行內動作「顏色退後、滑過深一階」的長相,游標明寫 cursor-default;spec 明文「不是行內動作」。',
    spec: 'packages/design-system/src/components/Field/field.spec.md:277(設計定位:給資訊的觸發處 … 不是行內動作)+ ds-canonical/references/hit-area-canonical.md:54(三-1:觸發處若是 <button> 要明寫 cursor-default)',
  },
  {
    key: 'src/components/PeoplePicker/person-display.tsx#X',
    reason: 'PeoplePicker 堆疊模式頭像角落的 12×12 移除徽章(AvatarDismissOverlay):不是列上的行內動作,是疊在頭像上的 badge 型 ×,幾何(top -1 / right -4 / 12px)是 user 2026-05-07 v15.15 確認的不對稱 canonical,顯隱規則 2026-08-05 user 否決恆顯;待辦總帳 N22 原句「PeoplePicker × 只在 A18 以尺寸追」—— 尺寸由 A18 追,本閘不判。',
    spec: 'packages/design-system/src/components/PeoplePicker/person-display.tsx:380-401(Visual canonical 註解,含 user 確認紀錄)+ governance/planning/2026-09-25-interaction-and-hover-remediation.md N22 列',
  },
]

// ── 分析器(純函式:給檔名 + 原文,回命中清單;CLI 與 selftest 都走這一支)─────────────

const tagOf = (node) => (ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName).getText()
const attrsOf = (node) => {
  const open = ts.isJsxElement(node) ? node.openingElement : node
  const out = new Map()
  for (const a of open.attributes.properties) if (ts.isJsxAttribute(a)) out.set(a.name.getText(), a.initializer ? a.initializer.getText() : true)
  return out
}
const isElement = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)
// 名字以 Icon 結尾的 PascalCase 元件,含裸的 `Icon`(primitive 把 `icon` prop 解構成 `Icon` 再 <Icon /> —— 抄它形狀的手刻也會這樣寫)
const isPascalIconName = (name) => /^(Icon|[A-Z][A-Za-z0-9]*Icon)$/.test(name)

/** 有效子節點:去掉純空白文字、純註解 / 空的 {} 表達式、以及純裝飾的空 <span>(primitive 的底色層形狀)。 */
function meaningfulChildren(node) {
  if (!ts.isJsxElement(node)) return []
  return node.children.filter((c) => {
    if (ts.isJsxText(c)) return c.getText().trim() !== ''
    if (ts.isJsxExpression(c)) return c.expression !== undefined
    if (isElement(c) && tagOf(c) === 'span' && meaningfulChildren(c).length === 0) return false
    return true
  })
}

function lucideImports(sf) {
  const names = new Set()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== 'lucide-react') continue
    const nb = st.importClause?.namedBindings
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) names.add(el.name.getText())
  }
  return names
}

const isIconElement = (child, icons) => isElement(child) && (icons.has(tagOf(child)) || tagOf(child) === 'svg' || isPascalIconName(tagOf(child)))

/** (A) 形狀:原生 <button>,有效子節點 ≥ 1 且全部是圖示。回圖示名(第一顆)或 null。 */
function nativeIconOnly(node, icons) {
  if (tagOf(node) !== 'button') return null
  const kids = meaningfulChildren(node)
  if (kids.length === 0 || !kids.every((k) => isIconElement(k, icons))) return null
  return tagOf(kids[0])
}

/** icon-only 的 <Button>:有 iconOnly,或沒有子節點但有 startIcon / endIcon。回圖示表達式文字或 'iconOnly'。 */
function buttonIconOnly(node) {
  if (tagOf(node) !== 'Button') return null
  const attrs = attrsOf(node)
  if (attrs.has('iconOnly')) return String(attrs.get('startIcon') ?? attrs.get('endIcon') ?? 'iconOnly').replace(/^\{|\}$/g, '')
  if (meaningfulChildren(node).length === 0 && (attrs.has('startIcon') || attrs.has('endIcon'))) return String(attrs.get('startIcon') ?? attrs.get('endIcon')).replace(/^\{|\}$/g, '')
  return null
}

/** (B):往上找 ROW_HOSTS;碰到 JSX 屬性就停(slot 逃生口);宿主 asChild 直接包的那顆不算。回宿主標籤名或 null。 */
function rowHostAncestor(node) {
  let child = node
  let p = node.parent
  while (p) {
    if (ts.isJsxAttribute(p)) return null
    if (ts.isJsxElement(p)) {
      const tag = p.openingElement.tagName.getText()
      if (ROW_HOSTS.has(tag)) {
        const direct = p.children.filter((c) => !(ts.isJsxText(c) && c.getText().trim() === '')).length === 1 && p.children.includes(child)
        if (direct && attrsOf(p).has('asChild')) return null
        return tag
      }
    }
    if (isElement(p)) child = p
    p = p.parent
  }
  return null
}

/**
 * @param {string} rel   相對 design-system 根的檔案路徑(進 key 用)
 * @param {string} text  原文
 * @param {{ includePrimitive?: boolean }} [options]
 * @returns {{ findings: Array<{ file, line, kind: string[], tag, icon, host, key, snippet }>, buttonsSeen: number }}
 */
export function analyzeSource(rel, text, { includePrimitive = false } = {}) {
  const findings = []
  let buttonsSeen = 0
  if (rel === PRIMITIVE_FILE && !includePrimitive) return { findings, buttonsSeen }
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const icons = lucideImports(sf)
  const visit = (node) => {
    if (isElement(node)) {
      const tag = tagOf(node)
      if (tag === 'button' || tag === 'Button') buttonsSeen++
      const nativeIcon = nativeIconOnly(node, icons)
      const buttonIcon = buttonIconOnly(node)
      const icon = nativeIcon ?? buttonIcon
      if (icon) {
        const kind = []
        if (nativeIcon) kind.push('native-icon-only')
        const host = rowHostAncestor(node)
        if (host) kind.push('row-host-button')
        if (kind.length) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
          findings.push({ file: rel, line, kind, tag, icon, host, key: `${rel}#${icon}`, snippet: node.getText().split('\n')[0].slice(0, 100) })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { findings, buttonsSeen }
}

/** 掃一個 design-system 根目錄(src/**\/*.tsx)。 */
export function scan(dsRoot, options = {}) {
  const files = globSync('src/**/*.tsx', { cwd: dsRoot }).filter((f) => !f.includes('node_modules')).sort()
  let buttonsSeen = 0
  const findings = []
  for (const rel of files) {
    const r = analyzeSource(rel, readFileSync(join(dsRoot, rel), 'utf8'), options)
    buttonsSeen += r.buttonsSeen
    findings.push(...r.findings)
  }
  return { files: files.length, buttonsSeen, findings }
}

/** (C) 把命中對上允許清單(純函式)。 */
export function evaluate(findings, allowlist) {
  for (const entry of allowlist) {
    if (!entry.key || !entry.reason?.trim() || !entry.spec?.trim()) throw new Error(`允許清單條目缺 key / reason / spec:${JSON.stringify(entry)}`)
  }
  const allowed = new Map(allowlist.map((e) => [e.key, 0]))
  const violations = []
  for (const f of findings) {
    if (allowed.has(f.key)) allowed.set(f.key, allowed.get(f.key) + 1)
    else violations.push(f)
  }
  const stale = [...allowed].filter(([, n]) => n === 0).map(([k]) => k)
  return { violations, stale, allowedHits: [...allowed].filter(([, n]) => n > 0).length }
}

const describe = (f) => `${f.file}:${f.line}  <${f.tag}>(${f.icon})  ${f.kind.join('+')}${f.host ? `,宿主 <${f.host}>` : ''}  ${f.snippet}`

// ── selftest ─────────────────────────────────────────────────────────────────

function selftest() {
  const problems = []
  const expect = (cond, msg) => { if (!cond) problems.push(msg) }

  // 1. 真實原始碼 + 清空允許清單 → 恰好抓到清單裡那幾筆(豁免對象真的存在、偵測看得到它們)
  const real = scan(DS_ROOT)
  const realKeys = real.findings.map((f) => f.key).sort()
  const allowKeys = ALLOWLIST.map((e) => e.key).sort()
  expect(JSON.stringify(realKeys) === JSON.stringify(allowKeys), `清空允許清單後真實原始碼的命中應恰好 = 清單 ${JSON.stringify(allowKeys)},實得 ${JSON.stringify(realKeys)}`)
  expect(real.files > 0 && real.buttonsSeen > 0, `真實掃描應看到檔案與按鈕(files=${real.files} buttons=${real.buttonsSeen})`)

  // 2. primitive 自己那顆:解除排除後必須被 (A) 抓到 —— 證明偵測看得到它守護的形狀
  const primitivePath = join(DS_ROOT, PRIMITIVE_FILE)
  let primitiveText = null
  try { primitiveText = readFileSync(primitivePath, 'utf8') } catch { /* --root 指到假目錄時沒有 primitive */ }
  if (primitiveText !== null) {
    const p = analyzeSource(PRIMITIVE_FILE, primitiveText, { includePrimitive: true })
    expect(p.findings.length === 1 && p.findings[0].kind.includes('native-icon-only'), `primitive 解除排除後應恰好 1 筆 native-icon-only,實得 ${JSON.stringify(p.findings.map(describe))}`)
    expect(analyzeSource(PRIMITIVE_FILE, primitiveText).findings.length === 0, 'primitive 預設應被排除(0 筆)')
  }

  // 3. 合成違規 / 合法寫法,寫成真的檔案、走真的 scan()(不是只測純函式;M32「參數是誰算的」)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'inline-action-hand-craft-'))
  const write = (rel, body) => { mkdirSync(dirname(join(fixtureRoot, rel)), { recursive: true }); writeFileSync(join(fixtureRoot, rel), body) }
  const head = "import { X, Trash2, MoreVertical, Pencil } from 'lucide-react'\nimport { Button } from '../components/Button/button'\n"
  write('src/bad/tree-native.tsx', `${head}export const A = () => (<TreeView><TreeItem id="a" label="a">\n  <button type="button" aria-label="刪除"><Trash2 size={16} /></button>\n</TreeItem></TreeView>)\n`)
  write('src/bad/menu-button.tsx', `${head}export const B = () => (<Menu><MenuItem>\n  <span>標題</span><Button iconOnly variant="text" size="xs" startIcon={X} aria-label="關閉" />\n</MenuItem></Menu>)\n`)
  write('src/bad/tag-trigger.tsx', `${head}export const C = () => (<Tag>\n  藍色\n  <DropdownMenuTrigger asChild><Button iconOnly startIcon={MoreVertical} aria-label="更多" /></DropdownMenuTrigger>\n</Tag>)\n`)
  write('src/bad/primitive-copy.stories.tsx', `${head}export const D = () => (<div>\n  <button type="button" aria-label="清除" className="relative"><span aria-hidden className="absolute" /><X size={16} aria-hidden /></button>\n</div>)\n`)
  write('src/bad/map-in-host.tsx', `${head}export const E = ({ items }) => (<SidebarMenuButton>\n  {items.map((i) => <Button key={i} iconOnly startIcon={Pencil} aria-label="編輯" />)}\n</SidebarMenuButton>)\n`)
  write('src/good/primitive.tsx', `${head}export const F = () => (<TreeItem id="f" label="f"><ItemInlineActionButton icon={X} aria-label="清除" /></TreeItem>)\n`)
  write('src/good/toolbar.tsx', `${head}export const G = () => (<div className="flex gap-1"><Button iconOnly variant="text" startIcon={X} aria-label="關閉" /></div>)\n`)
  write('src/good/aschild-row.tsx', `${head}export const H = () => (<SidebarMenuButton asChild>\n  <button type="button"><ItemAvatar alt="Alan" /><span>Alan</span></button>\n</SidebarMenuButton>)\n`)
  write('src/good/text.tsx', `${head}export const I = () => (<MenuItem><button type="button">儲存</button></MenuItem>)\n`)
  write('src/good/row-actions.tsx', `${head}export const J = () => (<DataTable rowActions={() => <Button iconOnly variant="text" size="xs" startIcon={Pencil} aria-label="編輯" />} />)\n`)
  write('src/good/slot.tsx', `${head}export const K = () => (<TreeItem id="k" label="k" inlineActionsSlot={<Button iconOnly variant="text" startIcon={X} aria-label="清除" />} />)\n`)
  write('src/good/empty.tsx', `${head}export const L = () => (<TreeItem id="l" label="l"><button type="button" aria-label="鍵盤" className="absolute inset-0 opacity-0" /></TreeItem>)\n`)
  try {
    const r = scan(fixtureRoot)
    const byFile = (name) => r.findings.filter((f) => f.file === `src/${name}`)
    const kinds = (name) => byFile(name).map((f) => f.kind.join('+')).join('|')
    expect(kinds('bad/tree-native.tsx') === 'native-icon-only+row-host-button', `bad/tree-native 應 native-icon-only+row-host-button,實得「${kinds('bad/tree-native.tsx')}」`)
    expect(kinds('bad/menu-button.tsx') === 'row-host-button' && byFile('bad/menu-button.tsx')[0]?.host === 'MenuItem', `bad/menu-button 應 row-host-button(宿主 MenuItem),實得「${kinds('bad/menu-button.tsx')}」`)
    expect(kinds('bad/tag-trigger.tsx') === 'row-host-button' && byFile('bad/tag-trigger.tsx')[0]?.host === 'Tag', `bad/tag-trigger 應 row-host-button(宿主 Tag),實得「${kinds('bad/tag-trigger.tsx')}」`)
    expect(kinds('bad/primitive-copy.stories.tsx') === 'native-icon-only', `bad/primitive-copy 應 native-icon-only,實得「${kinds('bad/primitive-copy.stories.tsx')}」`)
    expect(kinds('bad/map-in-host.tsx') === 'row-host-button' && byFile('bad/map-in-host.tsx')[0]?.host === 'SidebarMenuButton', `bad/map-in-host 應 row-host-button(宿主 SidebarMenuButton),實得「${kinds('bad/map-in-host.tsx')}」`)
    for (const good of ['good/primitive.tsx', 'good/toolbar.tsx', 'good/aschild-row.tsx', 'good/text.tsx', 'good/row-actions.tsx', 'good/slot.tsx', 'good/empty.tsx']) {
      expect(byFile(good).length === 0, `${good} 應 0 筆,實得 ${JSON.stringify(byFile(good).map(describe))}`)
    }
    expect(r.findings.length === 5, `合成夾具應恰好 5 筆違規,實得 ${r.findings.length}`)
    // 4. 允許清單的兩面:對得到 → 不算違規;對不到 → 過期紅;缺理由 → 拒收
    const ev = evaluate(r.findings, [{ key: 'src/bad/tree-native.tsx#Trash2', reason: 'r', spec: 's' }, { key: 'src/nowhere.tsx#X', reason: 'r', spec: 's' }])
    expect(ev.violations.length === 4 && ev.allowedHits === 1 && JSON.stringify(ev.stale) === JSON.stringify(['src/nowhere.tsx#X']), `evaluate 應 4 違規 / 1 豁免 / 1 過期,實得 ${JSON.stringify({ v: ev.violations.length, a: ev.allowedHits, s: ev.stale })}`)
    let threw = false
    try { evaluate(r.findings, [{ key: 'src/bad/tree-native.tsx#Trash2', reason: '', spec: 's' }]) } catch { threw = true }
    expect(threw, '空 reason 的允許清單條目應拒收(丟例外)')
    // 5. 空目錄 = 儀器失效(不是通過)
    const empty = mkdtempSync(join(tmpdir(), 'inline-action-empty-'))
    try { const e = scan(empty); expect(e.files === 0 && e.buttonsSeen === 0, '空目錄應回 0 檔 0 鈕(CLI 據此判儀器失效)') } finally { rmSync(empty, { recursive: true, force: true }) }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }

  if (problems.length) {
    console.error('✗ inline-action-hand-craft-invariant --selftest 失敗:')
    for (const p of problems) console.error(`  · ${p}`)
    process.exit(1)
  }
  console.log(`✓ inline-action-hand-craft-invariant --selftest:5 筆合成違規全部指名、7 種合法寫法 0 筆、允許清單兩面(對得到 / 過期 / 缺理由)、primitive 形狀可見、真實原始碼清空清單後恰好命中 ${allowKeys.length} 筆`)
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (SELFTEST) {
  selftest()
} else {
  const r = scan(DS_ROOT)
  if (r.files === 0 || r.buttonsSeen === 0) {
    console.error(`✗ INSTRUMENT-FAIL:在 ${relative(REPO, DS_ROOT) || DS_ROOT} 掃到 ${r.files} 個 tsx、${r.buttonsSeen} 顆按鈕 —— 沒量到不是通過(M37)`)
    process.exit(1)
  }
  const { violations, stale, allowedHits } = evaluate(r.findings, ALLOWLIST)
  if (violations.length || stale.length) {
    if (violations.length) {
      console.error(`✗ 手刻的行內動作鈕 ${violations.length} 筆(${SPEC}:217 / :253):`)
      for (const f of violations) console.error(`  · ${describe(f)}`)
      console.error('  修法:列 / 項目上的圖示鈕改用宿主的宣告式 API(inlineActions / endAction / onRemove)或 ItemInlineActionButton;')
      console.error('        spec 有明文的例外才寫進本檔 ALLOWLIST(key = 檔案#圖示,附理由與 spec 檔名:行)。')
    }
    if (stale.length) {
      console.error(`✗ 允許清單有 ${stale.length} 筆對不到任何命中(豁免對象已不存在,清單過期):`)
      for (const k of stale) console.error(`  · ${k}`)
    }
    process.exit(1)
  }
  console.log(`✓ inline-action-hand-craft:${r.files} 個 tsx、${r.buttonsSeen} 顆 <button>/<Button>,0 筆手刻行內動作鈕;允許清單 ${allowedHits}/${ALLOWLIST.length} 筆各對到命中`)
}

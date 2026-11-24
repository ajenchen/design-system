#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 浮層高度上限只有一份(`packages/design-system/src/tokens/elevation/elevation.spec.md`「浮層高度上限」;
 *         常數與公式住 `tokens/elevation/overlay-geometry.ts`:OVERLAY_AVAILABLE_HEIGHT / MODAL_AVAILABLE_HEIGHT / capHeight / OVERLAY_LIST_MAX_HEIGHT):
 *     H1 Radix 的可用高變數(`--radix-*-available-height`)只准出現在 overlay-geometry.ts —— DS(packages/design-system/src)與 apps 的
 *        其他程式裡,字串 / class / style 都不准直接讀(註解與 JSX 說明文字不算);.css 同樣(註解剔除)。
 *     H2 浮層元件檔(本檔 OVERLAY_POLICY 的 file)的字串裡不准有 Tailwind `max-h-*` —— 高度上限一律寫 inline style 讀 overlay-geometry。
 *     H3 浮層元件檔裡每一個物件屬性 `maxHeight:` 的值只准是:`capHeight(…)` 呼叫、從 overlay-geometry 匯入的常數,
 *        或「初始值是前兩者」的本地常數(Dialog 的 heightCap)。直接寫字串、把使用端的 maxHeight 原樣塞進去,都紅。
 *     H4 掛點真的接上(OVERLAY_POLICY 每一列):Popover / HoverCard / DropdownMenu 檔裡每一個 Radix `*Primitive.Content` 與
 *        `*Primitive.SubContent` 都有 `style={{ maxHeight: … }}`(修前 DropdownMenuSubContent 完全沒有上限 —— 這條就是擋它回來);
 *        CommandList 的 ScrollArea 讀 OVERLAY_LIST_MAX_HEIGHT;ProfileCard 有元素讀 OVERLAY_AVAILABLE_HEIGHT;
 *        Dialog 有一個 `capHeight(…)` 呼叫的第一個參數是 MODAL_AVAILABLE_HEIGHT(直接或經本地常數)。
 *     H5 使用端(DS 元件 / pattern / story 與 apps)不准在浮層內容元件(PopoverContent / HoverCardContent / DropdownMenuContent /
 *        DropdownMenuSubContent / DialogContent / CommandList)上用 className 的 `max-h-*` 或 `style.maxHeight` 改上限 ——
 *        要更矮走元件的 `maxHeight` 參數(同一條 capHeight;CommandList 的清單上限不開參數,值住 overlay-geometry.ts `OVERLAY_LIST_MAX_HEIGHT`、理由住 command.spec.md「清單捲動上限 300px」)。
 *   紅: 指名 檔:行 與哪一條,exit 1。
 *   綠: 五條 0 筆。純靜態(TypeScript 語法樹;不做型別推論),同一份 worktree 恆等,沒有取樣、不量時間。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): overlay-geometry.ts 讀不到四個匯出(或 OVERLAY_AVAILABLE_HEIGHT 不是讀 Radix popper 的可用高)、
 *       OVERLAY_POLICY 列的檔案不存在、掛點一個都找不到、掃到 0 檔 —— 沒量到不讀成綠。
 *   註: 2026-11-24 新寫(OVERLAY-HEIGHT-SSOT 包)。執行期那一半(開著的浮層 computed max-height = capHeight 的結果)在
 *       scripts/overlay-height-cap-invariant.mjs。`--selftest` 用合成原始碼與真實檔案的破法證明每條各自會紅、合規寫法不誤報。
 *
 * 跑法: node scripts/overlay-height-ssot-invariant.mjs [--selftest]
 */
import ts from 'typescript'
import { existsSync, globSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DS = 'packages/design-system/src'
export const GEOMETRY_FILE = `${DS}/tokens/elevation/overlay-geometry.ts`
const GEOMETRY_MODULE = /(?:^|\/)tokens\/elevation\/overlay-geometry(?:\.ts)?$/
const GEOMETRY_EXPORTS = ['OVERLAY_AVAILABLE_HEIGHT', 'MODAL_AVAILABLE_HEIGHT', 'OVERLAY_LIST_MAX_HEIGHT', 'capHeight']

/**
 * 浮層元件表(唯一一份機器可讀的;elevation.spec.md「浮層高度上限」那張表的程式面)。
 * hook:'radix-content' = 檔裡每個 *Primitive.Content / *Primitive.SubContent 都要有 style.maxHeight(min = 至少幾個);
 *       'list' = 有 ScrollArea 的 style.maxHeight 讀 OVERLAY_LIST_MAX_HEIGHT;'standalone' = 有元素的 style.maxHeight 讀 OVERLAY_AVAILABLE_HEIGHT;
 *       'modal' = 有 capHeight(MODAL_AVAILABLE_HEIGHT …) 呼叫。
 */
export const OVERLAY_POLICY = [
  { name: 'Popover', file: `${DS}/components/Popover/popover.tsx`, hook: 'radix-content', min: 1 },
  { name: 'HoverCard', file: `${DS}/components/HoverCard/hover-card.tsx`, hook: 'radix-content', min: 1 },
  { name: 'DropdownMenu', file: `${DS}/components/DropdownMenu/dropdown-menu.tsx`, hook: 'radix-content', min: 2 },
  { name: 'Command', file: `${DS}/components/Command/command.tsx`, hook: 'list', min: 1 },
  { name: 'ProfileCard', file: `${DS}/components/ProfileCard/profile-card.tsx`, hook: 'standalone', min: 1 },
  { name: 'Dialog', file: `${DS}/components/Dialog/dialog.tsx`, hook: 'modal', min: 1 },
]
const OVERLAY_FILES = new Set(OVERLAY_POLICY.map((o) => o.file))
/** 使用端不准在這些元件上蓋上限(H5) */
export const CAPPED_ELEMENTS = ['PopoverContent', 'HoverCardContent', 'DropdownMenuContent', 'DropdownMenuSubContent', 'DialogContent', 'CommandList']

const RADIX_AVAILABLE = /--radix-[a-z-]*available-height/
const MAX_H_CLASS = /(?:^|[\s:!])max-h-\S/
const parse = (rel, src) => ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
const readRepo = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')

/** 程式裡的字串片段(字串、模板字串的每一段);不含註解與 JSX 說明文字 */
function stringPieces(sf) {
  const out = []
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push({ node, text: node.text })
    else if (ts.isTemplateExpression(node)) {
      out.push({ node: node.head, text: node.head.text })
      for (const span of node.templateSpans) out.push({ node: span.literal, text: span.literal.text })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** 從 overlay-geometry 匯入的名字(本地名 → 匯出名) */
function geometryImports(sf) {
  const map = new Map()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !GEOMETRY_MODULE.test(st.moduleSpecifier.text)) continue
    const named = st.importClause?.namedBindings
    if (named && ts.isNamedImports(named)) for (const el of named.elements) map.set(el.name.text, (el.propertyName ?? el.name).text)
  }
  return map
}

/** 檔內 `const X = <初始值>`(任何作用域)的初始值,以名字查 */
function localConsts(sf) {
  const map = new Map()
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const)) map.set(node.name.text, node.initializer)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return map
}

const unwrap = (e) => { while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))) e = e.expression; return e }

/** H3 的判準:這個值是不是從 overlay-geometry 來的(capHeight 呼叫 / 匯入常數 / 初始值是前兩者的本地常數)。回傳來源名或 null */
function geometrySource(expr, imports, consts, depth = 0) {
  const e = unwrap(expr)
  if (!e || depth > 3) return null
  if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && imports.get(e.expression.text) === 'capHeight') return 'capHeight'
  if (ts.isIdentifier(e)) {
    if (imports.has(e.text) && imports.get(e.text) !== 'capHeight') return imports.get(e.text)
    if (consts.has(e.text)) return geometrySource(consts.get(e.text), imports, consts, depth + 1)
  }
  return null
}

const tagName = (el, sf) => el.tagName.getText(sf)
const jsxAttr = (el, name) => el.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name)
/** style={{ … }} 的物件字面值(不是物件字面值回 null) */
function styleObject(el) {
  const a = jsxAttr(el, 'style')
  const e = a?.initializer && ts.isJsxExpression(a.initializer) ? unwrap(a.initializer.expression) : null
  return e && ts.isObjectLiteralExpression(e) ? e : null
}
const propNamed = (obj, name) => obj?.properties.find((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name)

function jsxElements(sf) {
  const out = []
  const visit = (node) => { if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) out.push(node); ts.forEachChild(node, visit) }
  visit(sf)
  return out
}

/** H1 / H2 / H3 / H5:單一檔案。回傳 [{ line, rule, msg }] */
export function checkSource(src, rel) {
  const out = []
  if (rel.endsWith('.css')) {
    const body = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    body.split('\n').forEach((l, i) => { if (RADIX_AVAILABLE.test(l)) out.push({ line: i + 1, rule: 'H1', msg: `CSS 直接讀 Radix 可用高(${l.match(RADIX_AVAILABLE)[0]})—— 高度上限只從 overlay-geometry.ts 來` }) })
    return out
  }
  const sf = parse(rel, src)
  const isGeometry = rel === GEOMETRY_FILE
  const isOverlay = OVERLAY_FILES.has(rel)
  for (const { node, text } of stringPieces(sf)) {
    if (!isGeometry && RADIX_AVAILABLE.test(text)) out.push({ line: lineOf(sf, node), rule: 'H1', msg: `字串直接讀 Radix 可用高(${text.match(RADIX_AVAILABLE)[0]})—— 改讀 overlay-geometry.ts 的 OVERLAY_AVAILABLE_HEIGHT / capHeight` })
    if (isOverlay && MAX_H_CLASS.test(text)) out.push({ line: lineOf(sf, node), rule: 'H2', msg: `浮層元件寫 Tailwind max-h-*(「${text.trim().slice(0, 60)}」)—— 高度上限一律 inline style 讀 overlay-geometry.ts` })
  }
  if (isOverlay) {
    const imports = geometryImports(sf)
    const consts = localConsts(sf)
    const visit = (node) => {
      if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && node.name && ts.isIdentifier(node.name) && node.name.text === 'maxHeight' && ts.isObjectLiteralExpression(node.parent)) {
        const value = ts.isShorthandPropertyAssignment(node) ? node.name : node.initializer
        if (!geometrySource(value, imports, consts)) out.push({ line: lineOf(sf, node), rule: 'H3', msg: `maxHeight: ${value.getText(sf).slice(0, 60)} —— 不是從 overlay-geometry 來的(要 capHeight(…) 或匯入的常數)` })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  for (const el of jsxElements(sf)) {
    const tag = tagName(el, sf).split('.').pop()
    if (!CAPPED_ELEMENTS.includes(tag)) continue
    const cls = jsxAttr(el, 'className')
    if (cls?.initializer) {
      const pieces = ts.isStringLiteral(cls.initializer) ? [cls.initializer.text] : stringPieces(cls.initializer).map((p) => p.text)
      const bad = pieces.find((p) => MAX_H_CLASS.test(p))
      if (bad) out.push({ line: lineOf(sf, el), rule: 'H5', msg: `<${tag} className="…max-h-…"> —— 使用端不在浮層內容上蓋上限;要更矮傳 maxHeight 參數` })
    }
    if (propNamed(styleObject(el), 'maxHeight')) out.push({ line: lineOf(sf, el), rule: 'H5', msg: `<${tag} style={{ maxHeight }}> —— 使用端不在浮層內容上蓋上限;要更矮傳 maxHeight 參數` })
  }
  return out
}

/** H4:浮層元件表的掛點。read(rel) 可替換(對照組)。回傳 [{ rule, msg }] 與找到的掛點數 */
export function checkPolicy(read) {
  const out = []
  let hooks = 0
  for (const o of OVERLAY_POLICY) {
    const sf = parse(o.file, read(o.file))
    const imports = geometryImports(sf)
    const consts = localConsts(sf)
    const els = jsxElements(sf)
    let found = 0
    if (o.hook === 'radix-content') {
      for (const el of els.filter((e) => /Primitive\.(?:Content|SubContent)$/.test(tagName(e, sf)))) {
        found++
        const p = propNamed(styleObject(el), 'maxHeight')
        if (!p) out.push({ rule: 'H4', msg: `${o.file}:${lineOf(sf, el)} <${tagName(el, sf)}> 沒有 style.maxHeight —— ${o.name} 的這一層浮層沒有高度上限(比可用高還高時會超出視窗、捲不到)` })
        else hooks++
      }
    } else if (o.hook === 'list' || o.hook === 'standalone') {
      const want = o.hook === 'list' ? 'OVERLAY_LIST_MAX_HEIGHT' : 'OVERLAY_AVAILABLE_HEIGHT'
      for (const el of els) {
        if (o.hook === 'list' && tagName(el, sf) !== 'ScrollArea') continue
        const p = propNamed(styleObject(el), 'maxHeight')
        if (p && ts.isPropertyAssignment(p) && geometrySource(p.initializer, imports, consts) === want) found++
      }
      if (found) hooks += found
    } else if (o.hook === 'modal') {
      const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && imports.get(node.expression.text) === 'capHeight' && node.arguments[0] && geometrySource(node.arguments[0], imports, consts) === 'MODAL_AVAILABLE_HEIGHT') found++
        ts.forEachChild(node, visit)
      }
      visit(sf)
      hooks += found
    }
    if (found < o.min) {
      const what = { 'radix-content': 'Radix 內容元素(*Primitive.Content / SubContent)', list: 'ScrollArea 的 style.maxHeight 讀 OVERLAY_LIST_MAX_HEIGHT', standalone: '元素的 style.maxHeight 讀 OVERLAY_AVAILABLE_HEIGHT', modal: 'capHeight(MODAL_AVAILABLE_HEIGHT …) 呼叫' }[o.hook]
      out.push({ rule: 'H4', msg: `${o.file}:${o.name} 應有至少 ${o.min} 個${what},找到 ${found} 個` })
    }
  }
  return { violations: out, hooks }
}

/** overlay-geometry.ts 的四個匯出還在、OVERLAY_AVAILABLE_HEIGHT 讀的是 Radix popper 的可用高。回傳問題清單(空 = 量具可用) */
export function instrumentProblems(read = readRepo) {
  const out = []
  if (!existsSync(path.join(ROOT, GEOMETRY_FILE))) return [`找不到 ${GEOMETRY_FILE}`]
  const sf = parse(GEOMETRY_FILE, read(GEOMETRY_FILE))
  const exported = new Map()
  for (const st of sf.statements) {
    const isExport = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!isExport) continue
    if (ts.isFunctionDeclaration(st) && st.name) exported.set(st.name.text, st)
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) exported.set(d.name.text, d)
  }
  for (const n of GEOMETRY_EXPORTS) if (!exported.has(n)) out.push(`${GEOMETRY_FILE} 沒有匯出 ${n}(改名 → 先改本閘與 elevation.spec.md「浮層高度上限」)`)
  const avail = exported.get('OVERLAY_AVAILABLE_HEIGHT')
  if (avail && !(avail.initializer && ts.isStringLiteralLike(avail.initializer) && /--radix-popper-available-height/.test(avail.initializer.text))) out.push(`${GEOMETRY_FILE} 的 OVERLAY_AVAILABLE_HEIGHT 不是讀 --radix-popper-available-height 的字串 —— 錨定浮層共用的可用高換了來源,先改本閘`)
  for (const o of OVERLAY_POLICY) if (!existsSync(path.join(ROOT, o.file))) out.push(`浮層元件表的 ${o.name} 檔 ${o.file} 不存在(搬家 → 先改本閘 OVERLAY_POLICY)`)
  return out
}

export function repoFiles() {
  return [
    ...globSync(`${DS}/**/*.{ts,tsx,css}`, { cwd: ROOT }),
    ...globSync('apps/*/src/**/*.{ts,tsx,css}', { cwd: ROOT }),
  ].filter((f) => !f.includes('node_modules')).sort()
}

function selftest() {
  const real = (rel, edit) => (f) => (f === rel ? edit(readRepo(f)) : readRepo(f))
  const mustChange = (before, after, what) => { if (before === after) throw new Error(`對照組注入沒有改到 ${what} —— 破法失效`); return after }
  const POP = OVERLAY_POLICY[0].file, HC = OVERLAY_POLICY[1].file, DD = OVERLAY_POLICY[2].file, CMD = OVERLAY_POLICY[3].file, PC = OVERLAY_POLICY[4].file, DLG = OVERLAY_POLICY[5].file
  const reds = [
    ['H1 元件 class 直接讀 Radix 可用高', () => checkSource('export const X = () => <div className="max-h-[var(--radix-popover-content-available-height,100vh)]" />', `${DS}/components/Foo/foo.tsx`), 'H1'],
    ['H1 story 的 style 直接讀 popper 可用高', () => checkSource("export const S = () => <div style={{ maxHeight: 'var(--radix-popper-available-height)' }} />", `${DS}/components/Foo/foo.stories.tsx`), 'H1'],
    ['H1 模板字串的一段讀 Radix 可用高', () => checkSource('const h = 200; export const c = `min(var(--radix-dropdown-menu-content-available-height), ${h}px)`', `${DS}/components/Foo/foo.ts`), 'H1'],
    ['H1 CSS 讀 Radix 可用高', () => checkSource('.menu { max-height: var(--radix-select-content-available-height); }', `${DS}/components/Foo/foo.css`), 'H1'],
    ['H2+H1 把修前的 class 加回 popover.tsx', () => {
      const src = readRepo(POP)
      return checkSource(mustChange(src, src.replace('"flex flex-col overflow-hidden min-h-0",', '"max-h-[var(--radix-popover-content-available-height,100vh)] flex flex-col overflow-hidden min-h-0",'), 'popover.tsx 外殼 class'), POP)
    }, 'H2'],
    ['H2 CommandList 改回寫死 class', () => {
      const src = readRepo(CMD)
      return checkSource(mustChange(src, src.replace('<ScrollArea className="flex-1 min-h-0" style={{ maxHeight: OVERLAY_LIST_MAX_HEIGHT }}', '<ScrollArea className="flex-1 min-h-0 max-h-[18.75rem]"'), 'command.tsx CommandList 的 ScrollArea'), CMD)
    }, 'H2'],
    ['H3 DropdownMenu 改回自己拼 min()', () => {
      const src = readRepo(DD)
      return checkSource(mustChange(src, src.replace('maxHeight: capHeight(OVERLAY_AVAILABLE_HEIGHT, maxHeight),', "maxHeight: maxHeight ? `min(100vh, ${maxHeight}px)` : '100vh',"), 'dropdown-menu.tsx Content 的 maxHeight'), DD)
    }, 'H3'],
    ['H3 HoverCard 把使用端的 maxHeight 原樣塞進去', () => {
      const src = readRepo(HC)
      return checkSource(mustChange(src, src.replace('style={{ maxHeight: capHeight(OVERLAY_AVAILABLE_HEIGHT, maxHeight), ...style }}', 'style={{ maxHeight, ...style }}'), 'hover-card.tsx 的 style'), HC)
    }, 'H3'],
    ['H3 ProfileCard 改回兩層後備值字串', () => {
      const src = readRepo(PC)
      return checkSource(mustChange(src, src.replace('style={{ maxHeight: OVERLAY_AVAILABLE_HEIGHT, ...style }}', "style={{ maxHeight: '100vh', ...style }}"), 'profile-card.tsx 的 style'), PC)
    }, 'H3'],
    ['H4 DropdownMenuSubContent 拿掉上限(修前的缺口)', () => checkPolicy(real(DD, (s) => mustChange(s, s.replace(", maxHeight: capHeight(OVERLAY_AVAILABLE_HEIGHT) }}", ' }}'), 'dropdown-menu.tsx SubContent 的 style'))).violations, 'H4'],
    ['H4 PopoverContent 拿掉 style.maxHeight', () => checkPolicy(real(POP, (s) => mustChange(s, s.replace('maxHeight: capHeight(OVERLAY_AVAILABLE_HEIGHT, maxHeight),\n', ''), 'popover.tsx 的 style.maxHeight'))).violations, 'H4'],
    ['H4 CommandList 改讀別的值', () => checkPolicy(real(CMD, (s) => mustChange(s, s.replace('style={{ maxHeight: OVERLAY_LIST_MAX_HEIGHT }}', "style={{ maxHeight: '300px' }}"), 'command.tsx 的 style'))).violations, 'H4'],
    ['H4 Dialog 不再用 capHeight(MODAL_AVAILABLE_HEIGHT …)', () => checkPolicy(real(DLG, (s) => mustChange(s, s.replace('const heightCap = capHeight(availableH, maxHeight)', 'const heightCap = maxHeight ? `min(${availableH}, ${maxHeight})` : availableH'), 'dialog.tsx 的 heightCap'))).violations, 'H4'],
    ['H5 story 在 PopoverContent 上用 className 蓋上限', () => checkSource('export const S = () => <PopoverContent className="w-80 max-h-[400px]">…</PopoverContent>', `${DS}/components/Foo/foo.stories.tsx`), 'H5'],
    ['H5 apps 在 DropdownMenuSubContent 上用 cn() 蓋上限', () => checkSource("export const S = () => <DropdownMenuSubContent className={cn('max-h-60', x)} />", 'apps/demo/src/menu.tsx'), 'H5'],
    ['H5 元件在 DialogContent 上用 style 蓋上限', () => checkSource("export const S = () => <DialogContent style={{ maxHeight: '60svh' }} />", `${DS}/components/Foo/foo.tsx`), 'H5'],
  ]
  const greens = [
    ['使用端走 maxHeight 參數', () => checkSource('export const S = () => <PopoverContent maxHeight={400} width={320}>…</PopoverContent>', `${DS}/components/Foo/foo.stories.tsx`)],
    ['註解提到 Radix 可用高變數', () => checkSource('// 舊寫法是 max-h-[var(--radix-popover-content-available-height)],別再寫\nexport const a = 1', `${DS}/components/Foo/foo.tsx`)],
    ['JSX 說明文字提到 Radix 可用高變數', () => checkSource('export const S = () => <p>改讀 --radix-popper-available-height 之前,每個浮層各讀各的</p>', `${DS}/components/Foo/foo.stories.tsx`)],
    ['非浮層元件的 max-h-* class', () => checkSource('export const X = () => <textarea className="field-sizing-content max-h-40" />', `${DS}/components/Foo/foo.tsx`)],
    ['overlay-geometry.ts 本人', () => checkSource(readRepo(GEOMETRY_FILE), GEOMETRY_FILE)],
    ...OVERLAY_POLICY.map((o) => [`現況的 ${o.name}`, () => checkSource(readRepo(o.file), o.file)]),
    ['現況的掛點表', () => checkPolicy(readRepo).violations],
  ]
  let ok = true
  for (const [n, run, rule] of reds) {
    let got
    try { got = run() } catch (e) { console.log(`  ✗ 該紅(${rule}):${n} —— ${e.message}`); ok = false; continue }
    const pass = got.some((v) => v.rule === rule)
    console.log(`  ${pass ? '✓' : '✗'} 該紅(${rule}):${n} —— 實得 ${got.length} 筆`)
    if (!pass) ok = false
  }
  for (const [n, run] of greens) {
    const got = run()
    console.log(`  ${got.length === 0 ? '✓' : '✗'} 該綠:${n} —— 實得 ${got.length} 筆${got.length ? `:${JSON.stringify(got[0])}` : ''}`)
    if (got.length) ok = false
  }
  const broken = instrumentProblems((f) => (f === GEOMETRY_FILE ? readRepo(f).replace('export function capHeight', 'function capHeight') : readRepo(f)))
  const instrOk = broken.some((m) => m.includes('capHeight'))
  console.log(`  ${instrOk ? '✓' : '✗'} overlay-geometry.ts 不再匯出 capHeight → 判成量具失效(不讀成綠)`)
  return ok && instrOk
}

const broken = instrumentProblems()
const files = repoFiles()
if (!files.length) broken.push('掃描範圍 0 檔(glob 壞了?)')
if (broken.length) {
  const { INSTRUMENT_FAIL_MARKER } = await import('./lib/launch-browser.mjs')
  for (const m of broken) console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${m}`)
  process.exit(2)
}

if (process.argv.includes('--selftest')) {
  console.log('overlay-height-ssot-invariant selftest:')
  process.exit(selftest() ? 0 : 1)
}

const v = []
for (const rel of files) for (const f of checkSource(readRepo(rel), rel)) v.push(`  - ${rel}:${f.line} [${f.rule}] ${f.msg}`)
const policy = checkPolicy(readRepo)
for (const f of policy.violations) v.push(`  - [${f.rule}] ${f.msg}`)
if (v.length) {
  console.error('❌ 浮層高度上限不是從 overlay-geometry.ts 來(elevation.spec.md「浮層高度上限」):')
  console.error(v.join('\n'))
  process.exit(1)
}
console.log(`✓ overlay-height-ssot-invariant:${files.length} 檔(DS 元件 / pattern / story / token / apps)H1、H5 0 違規;浮層元件 ${OVERLAY_POLICY.length} 檔 H2、H3 0 違規;H4 掛點 ${policy.hooks} 個全部讀 overlay-geometry.ts`)

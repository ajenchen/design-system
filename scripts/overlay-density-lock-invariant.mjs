#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 密度只有規格允許的那幾種寫法(tokens/density/density.spec.md 情境 1「浮層跟觸發點」表 + Anti-patterns):
 *     L1 任何浮層內容根元素(*Content / *SubContent)不准寫 data-density(總開關鎖法,規格 Anti-patterns 禁止);
 *     L2 版面間距只有 Popover 的內容根元素可以鎖,而且只能鎖 md;
 *     L3 標題列元件不准鎖密度(Anti-patterns「把 density/layout-space lock 設在 header primitive」;FileViewer 圖二 ——
 *        標題列鎖了、下面內容沒鎖 → 一般密度頁面標題字比內容字往右 8px)。要鎖就在整塊的最外層寫(情境 3「局部覆蓋」)。
 *        「標題列元件」= ChromeHeader / SurfaceHeader,加上從原始碼推出來、return 的最外層就是它們而且把自己收到的屬性
 *        展開轉交的元件(DialogHeader / SheetHeader / PopoverHeader / SidebarHeader / AgentPanelHeader…;名單不寫死,每次跑重推);
 *        「密度屬性」= lib/overlay-density.tsx 的 DENSITY_ATTRIBUTES(不另抄一份)。兩種寫法都紅:
 *        (a) 用的人在標題列元件上寫;(b) 標題列元件自己在定義裡的任何元素上寫(擋「只鎖標題列」的參數被加回來)。
 *        **2026-11-14 改寫**:原本只認 `lockDensity` 這個名字。該參數同日從 chrome-header.tsx 移除(AI 建議;user 沒說過要拿掉),
 *        舊寫法失去目標;而且直接寫 `<ChromeHeader data-density="lg">` 從來擋不到(同日查證實測)—— 名字是代理,屬性才是要守的事(M37);
 *     L4 機器可讀的浮層表(本檔 OVERLAY_POLICY):密度來源「觸發點」的浮層原始碼必須用 lib/overlay-density.tsx 的
 *        useTriggerRegionDensity,「整頁」的浮層不准用;density.spec.md 情境 1 表每一列的「密度來源」必須與這份表一致。
 *   紅: 指名檔案:行與哪一條,exit 1。讀不到 DENSITY_ATTRIBUTES、規格點名的標題列 primitive 在原始碼裡找不到、
 *       或一個轉交元件都推不出來 → 儀器失效,exit 2(沒量到不是綠)。
 *   綠: 掃 packages/design-system/src/**(元件、pattern、story)與 apps/**\/src/** 的 .tsx,0 違規;表與規格一致。
 *       密度寫在整塊的最外層(裡面有標題列)、或寫在一般 div 上,都不算。
 *   註: 純靜態(TypeScript 語法樹),不量時間。「轉交元件」以名字認(同名元件視為同一個)。
 *
 * 2026-11-11 稽核 R7-07:前身 `overlay-density-lock-placement.mjs` 沒有任何執行面呼叫它(孤兒閘),檔名也對不上可達性棘輪的
 * 閘名正規式,連孤兒盤點都看不到它;而且只掃 components/、排除 story,只抓 `lockDensity=`。改名 + 擴大範圍 + 加 L1/L2/L4 + 接進 CI。
 *
 * 跑法: node scripts/overlay-density-lock-invariant.mjs [--selftest]
 */
import ts from 'typescript'
import { readFileSync, globSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SPEC = 'packages/design-system/src/tokens/density/density.spec.md'
/** 「會改變某一區密度的屬性」唯一一份清單住在這支的 DENSITY_ATTRIBUTES(本閘讀它,不另抄)。 */
const DENSITY_ATTR_FILE = 'packages/design-system/src/lib/overlay-density.tsx'
const CHROME_HEADER_FILE = 'packages/design-system/src/patterns/header-canonical/chrome-header.tsx'

/** 浮層表(唯一一份機器可讀的;density.spec.md 情境 1 表由本閘比對,不一致就紅)。follows:'trigger' 觸發點那一區 / 'page' 整頁。 */
export const OVERLAY_POLICY = [
  { name: 'Popover', file: 'packages/design-system/src/components/Popover/popover.tsx', follows: 'trigger', lockLayoutSpace: 'md' },
  { name: 'DropdownMenu', file: 'packages/design-system/src/components/DropdownMenu/dropdown-menu.tsx', follows: 'trigger' },
  { name: 'HoverCard', file: 'packages/design-system/src/components/HoverCard/hover-card.tsx', follows: 'trigger' },
  { name: 'Tooltip', file: 'packages/design-system/src/components/Tooltip/tooltip.tsx', follows: 'trigger' },
  { name: 'Dialog', file: 'packages/design-system/src/components/Dialog/dialog.tsx', follows: 'page' },
  { name: 'Sheet', file: 'packages/design-system/src/components/Sheet/sheet.tsx', follows: 'page' },
  { name: 'FileViewer', file: 'packages/design-system/src/components/FileViewer/file-viewer.tsx', follows: 'page' },
]
const POPOVER_FILE = OVERLAY_POLICY.find((o) => o.lockLayoutSpace).file

/** 規格點名的標題列 primitive(density.spec.md Anti-patterns「header primitive(ChromeHeader / SurfaceHeader)」)。轉交給它們的元件由 collectHeaderComponents 推。 */
export const HEADER_PRIMITIVES = ['ChromeHeader', 'SurfaceHeader']

const CONTENT_TAG = /(?:^|\.)(?:\w*Content|\w*SubContent)$/
const parse = (rel, src) => ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const shortTag = (el, sf) => el.tagName.getText(sf).split('.').pop()
const attrValue = (a) => {
  const init = a.initializer
  if (!init) return true
  if (ts.isStringLiteral(init)) return init.text
  if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) return init.expression.text
  return null // 動態值
}

/** lib/overlay-density.tsx 的 `DENSITY_ATTRIBUTES = [...] as const` 的字串;找不到或不是純字串陣列回 null。 */
export function readDensityAttributes(src) {
  let out = null
  const visit = (node) => {
    if (out) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'DENSITY_ATTRIBUTES' && node.initializer) {
      let init = node.initializer
      while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(init))) init = init.expression
      if (ts.isArrayLiteralExpression(init) && init.elements.length && init.elements.every(ts.isStringLiteral)) out = init.elements.map((e) => e.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(parse('overlay-density.tsx', src))
  return out
}

/** 元件的函式本體:箭頭 / function;`React.forwardRef(…)`、`React.memo(…)` 這種包一層的呼叫取裡面第一個函式。 */
function componentFunction(node) {
  if (!node) return null
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) return node
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return componentFunction(node.expression)
  if (ts.isCallExpression(node)) for (const a of node.arguments) { const f = componentFunction(a); if (f) return f }
  return null
}

/** 檔內的元件定義:`const X = …` / `function X(…)`。只認大寫開頭 —— 小寫是 HTML 標籤(例:`header`)。 */
function componentDefs(sf) {
  const defs = []
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^[A-Z]/.test(node.name.text)) {
      const fn = componentFunction(node.initializer)
      if (fn) defs.push({ name: node.name.text, fn })
    } else if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text)) {
      defs.push({ name: node.name.text, fn: node })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return defs
}

/** 元件自己 return 出去的最外層 JSX 元素(不進巢狀函式;三元 / && 兩邊都算)。 */
function returnedRoots(fn) {
  const exprs = []
  if (fn.body && !ts.isBlock(fn.body)) exprs.push(fn.body)
  else if (fn.body) {
    const walk = (n) => {
      if (ts.isFunctionLike(n)) return
      if (ts.isReturnStatement(n) && n.expression) exprs.push(n.expression)
      ts.forEachChild(n, walk)
    }
    ts.forEachChild(fn.body, walk)
  }
  const roots = []
  const unwrap = (e) => {
    if (!e) return
    if (ts.isParenthesizedExpression(e)) return unwrap(e.expression)
    if (ts.isConditionalExpression(e)) { unwrap(e.whenTrue); unwrap(e.whenFalse); return }
    if (ts.isBinaryExpression(e)) { unwrap(e.right); return }
    if (ts.isJsxElement(e)) roots.push(e.openingElement)
    else if (ts.isJsxSelfClosingElement(e)) roots.push(e)
  }
  exprs.forEach(unwrap)
  return roots
}

/**
 * 標題列元件全集 = HEADER_PRIMITIVES + 「return 的最外層就是標題列元件、而且把屬性展開(`{...props}`)轉交給它」的元件,
 * 一路推到不再增加(包兩層也算)。只看最外層:標題列在裡面、外層是整塊容器的元件(例:面板)不算 —— 在它身上寫密度 = 鎖整塊,是對的寫法。
 * @param {{ rel: string, src: string }[]} sources
 * @returns {{ headers: Set<string>, defined: Set<string> }} defined = 原始碼裡找得到定義的元件名(用來確認 primitive 沒改名)
 */
export function collectHeaderComponents(sources) {
  const parsed = sources.map(({ rel, src }) => { const sf = parse(rel, src); return { sf, defs: componentDefs(sf) } })
  const defined = new Set(parsed.flatMap(({ defs }) => defs.map((d) => d.name)))
  const headers = new Set(HEADER_PRIMITIVES)
  for (let grew = true; grew;) {
    grew = false
    for (const { sf, defs } of parsed) {
      for (const d of defs) {
        if (headers.has(d.name)) continue
        const forwards = returnedRoots(d.fn).some((el) => headers.has(shortTag(el, sf)) && el.attributes.properties.some(ts.isJsxSpreadAttribute))
        if (forwards) { headers.add(d.name); grew = true }
      }
    }
  }
  return { headers, defined }
}

const readRepo = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')

let repoCtx = null
/** 掃描範圍、密度屬性清單、標題列元件全集(從 repo 現況推;每次跑只算一次)。 */
export function repoContext() {
  if (repoCtx) return repoCtx
  const files = [
    ...globSync('packages/design-system/src/**/*.tsx', { cwd: ROOT }),
    ...globSync('apps/*/src/**/*.tsx', { cwd: ROOT }),
  ]
  const sources = new Map(files.map((rel) => [rel, readRepo(rel)]))
  const { headers, defined } = collectHeaderComponents([...sources].map(([rel, src]) => ({ rel, src })))
  repoCtx = { files, sources, headers, defined, attrs: readDensityAttributes(readRepo(DENSITY_ATTR_FILE)) }
  return repoCtx
}

/** 沒量到的情況(量具本身失效):回傳說明清單,空 = 量具可用。 */
export function instrumentProblems(ctx) {
  const out = []
  if (!ctx.attrs) out.push(`${DENSITY_ATTR_FILE} 讀不到 DENSITY_ATTRIBUTES(改名或改寫法 → 先改本閘),L3 不知道要擋哪些屬性`)
  for (const p of HEADER_PRIMITIVES) if (!ctx.defined.has(p)) out.push(`規格點名的標題列 primitive ${p} 在掃描範圍裡找不到定義(改名 → 先改本閘與 density.spec.md Anti-patterns)`)
  if (ctx.headers.size <= HEADER_PRIMITIVES.length) out.push('一個轉交給標題列 primitive 的元件都推不出來(header-canonical.spec.md 寫明 DialogHeader / SheetHeader / PopoverHeader 底層是 SurfaceHeader)—— 推導壞了,L3 只守得到兩個名字')
  return out
}

/** 單一檔案的 L1–L3。rel:用來判斷是不是 Popover 本人。ctx:headers / attrs(預設 = repo 現況)。回傳 [{ line, rule, msg }]。 */
export function checkSource(src, rel = 'snippet.tsx', ctx = repoContext()) {
  const { headers, attrs } = ctx
  const sf = parse(rel, src)
  const out = []
  // L3(b):標題列元件自己的定義範圍
  const headerDefs = componentDefs(sf).filter((d) => headers.has(d.name)).map((d) => ({ name: d.name, pos: d.fn.getStart(sf), end: d.fn.getEnd() }))
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf)
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
      const pos = node.getStart(sf)
      const owner = headerDefs.find((d) => pos >= d.pos && pos < d.end)
      for (const a of node.attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue
        const name = a.name.getText(sf)
        if (attrs.includes(name)) {
          if (headers.has(shortTag(node, sf))) out.push({ line, rule: 'L3', msg: `<${tag} ${name}> —— 密度不鎖在標題列(標題列鎖了、下面內容沒鎖 → 左緣不對齊);要鎖就寫在整塊的最外層(density.spec.md 情境 3)` })
          else if (owner) out.push({ line, rule: 'L3', msg: `${owner.name} 在自己定義裡的 <${tag}> 寫 ${name} —— 標題列元件不准替自己鎖密度(2026-11-14 移除的 lockDensity 就是這種寫法)` })
        }
        if (!CONTENT_TAG.test(tag)) continue
        if (name === 'data-density') out.push({ line, rule: 'L1', msg: `<${tag} data-density> —— 浮層不准用總開關鎖密度(連控制項一起鎖 → 選項對不上觸發點)` })
        if (name === 'data-layout-space') {
          const v = attrValue(a)
          if (rel !== POPOVER_FILE) out.push({ line, rule: 'L2', msg: `<${tag} data-layout-space> —— 只有 Popover 可以鎖版面間距` })
          else if (v !== 'md') out.push({ line, rule: 'L2', msg: `Popover 版面間距只能鎖 md(寫的是 ${JSON.stringify(v)})` })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** L4:浮層表 vs 原始碼 vs 規格表。files:路徑 → 內容(對照組可替換)。 */
export function checkPolicy(read) {
  const out = []
  for (const o of OVERLAY_POLICY) {
    const src = read(o.file)
    const uses = /\buseTriggerRegionDensity\s*\(/.test(src)
    if (o.follows === 'trigger' && !uses) out.push(`${o.file}:${o.name} 的密度來源是「觸發點」,原始碼沒有呼叫 useTriggerRegionDensity()`)
    if (o.follows === 'page' && uses) out.push(`${o.file}:${o.name} 蓋住整頁、密度跟整頁,原始碼卻呼叫了 useTriggerRegionDensity()`)
  }
  const spec = read(SPEC)
  const sec = spec.split('#### 浮層跟觸發點')[1]?.split('\n### ')[0] ?? ''
  if (!sec) out.push(`${SPEC}:找不到「#### 浮層跟觸發點」那一節(規格表被移走 → 先改本閘)`)
  for (const o of OVERLAY_POLICY) {
    const row = sec.split('\n').find((l) => new RegExp(`^\\|\\s*${o.name}\\b`).test(l))
    if (!row) { out.push(`${SPEC}:情境 1 表沒有 ${o.name} 那一列`); continue }
    const source = row.split('|')[2] ?? ''
    const want = o.follows === 'trigger' ? '觸發點' : '整頁'
    if (!source.includes(want)) out.push(`${SPEC}:情境 1 表 ${o.name} 那一列的密度來源寫「${source.trim()}」,浮層表是「${want}」`)
    const lock = row.split('|')[3] ?? ''
    if (o.lockLayoutSpace && !lock.includes(`data-layout-space="${o.lockLayoutSpace}"`)) out.push(`${SPEC}:情境 1 表 ${o.name} 那一列的鎖應為 data-layout-space="${o.lockLayoutSpace}"`)
    if (!o.lockLayoutSpace && !lock.includes('不鎖')) out.push(`${SPEC}:情境 1 表 ${o.name} 那一列應為「不鎖」`)
  }
  return out
}

/** 合成來源(對照組用):在這幾個檔案上推標題列元件,再檢查 usage 那一個。 */
function checkSynthetic(files, usageRel) {
  const { attrs } = repoContext()
  const { headers } = collectHeaderComponents(files)
  return checkSource(files.find((f) => f.rel === usageRel).src, usageRel, { headers, attrs })
}

function selftest() {
  const popoverSrc = readRepo(POPOVER_FILE)
  const chromeHeaderSrc = readRepo(CHROME_HEADER_FILE)
  const cases = [
    ['浮層內容寫 data-density', () => checkSource('<PopoverContent data-density="md" />'), 'L1'],
    ['Radix 原生內容寫 data-density', () => checkSource('<DropdownMenuPrimitive.Content data-density="lg">x</DropdownMenuPrimitive.Content>'), 'L1'],
    ['Dialog 鎖版面間距', () => checkSource('<DialogPrimitive.Content data-layout-space="lg" />', 'packages/design-system/src/components/Dialog/dialog.tsx'), 'L2'],
    // 只換屬性那一行(註解裡也有同一串字;換到註解 = 對照組沒改到東西)
    ['Popover 鎖成 lg', () => {
      const bad = popoverSrc.replace(/^(\s*)data-layout-space="md"\s*$/m, '$1data-layout-space="lg"')
      if (bad === popoverSrc) throw new Error('對照組注入沒有改到 popover.tsx 的屬性行 —— INSTRUMENT-FAIL')
      return checkSource(bad, POPOVER_FILE)
    }, 'L2'],
    ['ChromeHeader 上寫 data-density(2026-11-14 前擋不到)', () => checkSource('<ChromeHeader data-density="lg"><h1>專案設定</h1></ChromeHeader>'), 'L3'],
    ['SurfaceHeader 上寫 data-density', () => checkSource('<SurfaceHeader data-density="lg"><h2>邀請成員</h2></SurfaceHeader>'), 'L3'],
    ['ChromeHeader 只鎖控制項大小這一軸', () => checkSource('<ChromeHeader data-ui-size="lg" />'), 'L3'],
    ['SurfaceHeader 只鎖版面間距這一軸', () => checkSource('<SurfaceHeader data-layout-space="lg" />'), 'L3'],
    ['DialogHeader(repo 推出來的轉交元件)上寫 data-density', () => checkSource('<DialogHeader data-density="lg"><DialogTitle>刪除專案</DialogTitle></DialogHeader>'), 'L3'],
    ['SidebarHeader(repo 推出來的轉交元件)上寫 data-ui-size', () => checkSource('<SidebarHeader data-ui-size="md" />'), 'L3'],
    ['合成的兩層轉交元件上寫 data-density', () => checkSynthetic([
      { rel: 'a.tsx', src: 'const ToolbarHeader = React.forwardRef((p, ref) => <ChromeHeader ref={ref} {...p} />)' },
      { rel: 'b.tsx', src: 'function ReportToolbar({ title, ...rest }) {\n  return (\n    <ToolbarHeader {...rest}>{title}</ToolbarHeader>\n  )\n}' },
      { rel: 'c.tsx', src: 'export const X = () => <ReportToolbar title="Q3 營收報表" data-density="lg" />' },
    ], 'c.tsx'), 'L3'],
    ['把只鎖標題列的參數加回 chrome-header.tsx', () => {
      const bad = chromeHeaderSrc.replace(/(<header\s+ref=\{ref\})/, '$1\n          data-density={lockDensity === \'lg\' ? \'lg\' : undefined}')
      if (bad === chromeHeaderSrc) throw new Error('對照組注入沒有改到 chrome-header.tsx 的 <header ref={ref}> —— INSTRUMENT-FAIL')
      return checkSource(bad, CHROME_HEADER_FILE)
    }, 'L3'],
    ['小浮層沒接 useTriggerRegionDensity', () => checkPolicy((f) => (f.endsWith('hover-card.tsx') ? readRepo(f).replace(/useTriggerRegionDensity\s*\(/g, 'noop(') : readRepo(f))).map(() => ({ rule: 'L4' })), 'L4'],
    ['Dialog 接了 useTriggerRegionDensity', () => checkPolicy((f) => (f.endsWith('dialog.tsx') ? `${readRepo(f)}\nuseTriggerRegionDensity()` : readRepo(f))).map(() => ({ rule: 'L4' })), 'L4'],
    ['規格表把 HoverCard 寫成跟整頁', () => checkPolicy((f) => (f === SPEC ? readRepo(f).replace(/^\| HoverCard \| 觸發點那一區 \|/m, '| HoverCard | 整頁 |') : readRepo(f))).map(() => ({ rule: 'L4' })), 'L4'],
  ]
  const greens = [
    ['密度寫在整塊的最外層(情境 3),標題列在裡面', () => checkSource('<section data-density="lg"><ChromeHeader><h1>專案設定</h1></ChromeHeader><div>內容</div></section>')],
    ['註解裡提到 <ChromeHeader data-density="lg">', () => checkSource('// 別寫 <ChromeHeader data-density="lg">,要鎖就鎖整塊\nconst a = 1')],
    ['一般 div 上的區塊密度', () => checkSource('<div data-density="lg"><Select /></div>')],
    ['外層是整塊容器、標題列在裡面的元件(不是轉交元件)', () => checkSynthetic([
      { rel: 'a.tsx', src: 'const SettingsPanel = ({ title, headerProps, ...props }) => (\n  <section {...props}>\n    <ChromeHeader {...headerProps}>{title}</ChromeHeader>\n    <div>內容</div>\n  </section>\n)' },
      { rel: 'b.tsx', src: 'export const X = () => <SettingsPanel title="通知設定" data-density="lg" />' },
    ], 'b.tsx')],
    ['不轉交屬性的包裝元件', () => checkSynthetic([
      { rel: 'a.tsx', src: 'function FixedTitleHeader() { return <ChromeHeader>專案設定</ChromeHeader> }' },
      { rel: 'b.tsx', src: 'export const X = () => <FixedTitleHeader data-density="lg" />' },
    ], 'b.tsx')],
    ['現況的 chrome-header.tsx', () => checkSource(chromeHeaderSrc, CHROME_HEADER_FILE)],
    ['Popover 本人鎖 md', () => checkSource(popoverSrc, POPOVER_FILE)],
    ['現況的浮層表與規格', () => checkPolicy(readRepo)],
  ]
  let ok = true
  for (const [n, run, rule] of cases) {
    const got = run()
    const pass = got.some((v) => v.rule === rule)
    console.log(`  ${pass ? '✓' : '✗'} 該紅(${rule}):${n} —— 實得 ${got.length} 筆`)
    if (!pass) ok = false
  }
  for (const [n, run] of greens) {
    const got = run()
    console.log(`  ${got.length === 0 ? '✓' : '✗'} 該綠:${n} —— 實得 ${got.length} 筆${got.length ? `:${JSON.stringify(got[0])}` : ''}`)
    if (got.length) ok = false
  }
  const noAttrs = readDensityAttributes('export const OTHER = ["data-density"] as const')
  console.log(`  ${noAttrs === null ? '✓' : '✗'} 讀不到 DENSITY_ATTRIBUTES 時回 null(主程式據此判成量具失效、不讀成綠)`)
  if (noAttrs !== null) ok = false
  return ok
}

const ctx = repoContext()
const broken = instrumentProblems(ctx)
if (broken.length) {
  const { INSTRUMENT_FAIL_MARKER } = await import('./lib/launch-browser.mjs')
  for (const m of broken) console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${m}`)
  process.exit(2)
}

if (process.argv.includes('--selftest')) {
  console.log('overlay-density-lock-invariant selftest:')
  process.exit(selftest() ? 0 : 1)
}

const v = []
for (const rel of ctx.files) for (const f of checkSource(ctx.sources.get(rel), rel, ctx)) v.push(`  - ${rel}:${f.line} [${f.rule}] ${f.msg}`)
for (const m of checkPolicy(readRepo)) v.push(`  - [L4] ${m}`)
if (v.length) { console.error('❌ 密度寫法不符 density.spec.md(情境 1 / Anti-patterns):'); console.error(v.join('\n')); process.exit(1) }
const derived = [...ctx.headers].filter((h) => !HEADER_PRIMITIVES.includes(h))
console.log(`✓ overlay-density-lock-invariant:${ctx.files.length} 檔(元件 / pattern / story / apps)L1–L3 0 違規;L3 標題列元件 ${ctx.headers.size} 個(${HEADER_PRIMITIVES.join('、')} + 推出來的 ${derived.join('、')}),密度屬性 ${ctx.attrs.join(' / ')};浮層表 ${OVERLAY_POLICY.length} 列與原始碼、規格一致`)

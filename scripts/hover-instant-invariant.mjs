#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 原始碼(.tsx 與 .ts,不含 story)裡,同一段 class 宣告不會同時有 hover 驅動的底色與會過渡底色的 transition ——
 *         hover 底色寫在別的 const(含跨檔 import,例 categorical-color.ts 的 CAT_EVENT)再傳進來的也算
 *   紅: --selftest 的 hover 底色 + transition-colors、data-[hovered] + transition-all、.ts 自己同時寫兩者、
 *       以及 Calendar 事件方塊的真實形狀(hover 底色在 .ts、經兩層變數傳進有 transition-colors 的 cn())都必須紅
 *   綠: 寫了 escape、只有文字色 hover、沒有過渡、兩者相距 20 行以上、同一條跨檔路徑但沒有過渡、無關 const 與過渡同框 —— 都必須 0 命中;
 *        純靜態讀檔,重複跑結果相同
 */
// ═══════════════════════════════════════════════════════════════════════════
// hover 底色不做過渡 —— 「指標掃過去的時候,底色要立刻到位」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`packages/design-system/src/tokens/motion/motion.spec.md`「hover 回饋不做過渡」
//
// user 2026-09-10 拍板(原話:「第三題改成全部瞬間,確保有SSOT不要有漂移」)。
// 為什麼:過渡時長必須短於「指標停在一個項目上的時間」,否則底色永遠追不上指標 ——
// 表格列高 36–52px,指標以 500–1000px/s 掃過時每 40–90ms 換一列,150ms 的過渡在每一列
// 都完成不了,畫面上同時有兩三列半亮的拖尾(2026-09-10 量到 hover 最終色延遲 p95 109ms,
// 其中 84ms 是過渡本身)。一手來源:MUI DataGrid 的列 hover、AG Grid `.ag-row-hover`、
// VS Code `.monaco-list-row:hover` 三家都沒有任何 background 過渡。
//
// 判準(機械):同一段 class 宣告裡同時出現
//   (a) hover 驅動的底色(`hover:bg-*` / `data-[hovered]:bg-*` / `data-[highlighted]:bg-*` /
//       `group-hover/x:bg-*` / `group-data-[state=open]/x:bg-*`)
//   (b) 會把 background-color 一起過渡的宣告(`transition-colors` / `transition-all` /
//       `transition-[…background-color…]`)
// = 漂移。每行 escape:`@hover-transition-allow: <理由>`(寫在該行上方 3 行內)。
//
// 例外(已登記,理由寫在程式碼裡):Checkbox / Switch —— 那條過渡屬於 checked 狀態切換
// (unchecked ↔ checked 的色彩),不是 hover;它們是控件大小的點目標,不是掃過去的列面。
//
// **2026-09-25 補盲點(兩個)**:Calendar 事件方塊 `calendar.tsx` 寫了 `transition-colors`,而它的 hover 底色
// `hover:bg-[var(--color-{hue}-2)]` 住在 **`.ts`** 檔(`tokens/categorical-color.ts` 的 `CAT_EVENT`),
// 經 `EVENT_COLOR_CLASSES = CAT_EVENT` → `colorClass` 變數傳進同一段 `cn(...)`。舊版 (1) 只掃 `.tsx`、
// (2) 只認「字面上寫在附近的 hover class」,所以兩道都看不到 —— 這一格從 2026-09-10 拍板「全部瞬間」起一直漏著。
// 現在:(1) `.ts` 也掃;(2) 「帶著 hover 底色的識別字」也算 hover 底色:初始值裡寫了 hover 底色 class 的 const
// (跨檔:從別的檔 import 進來的也算),以及同一檔裡由它們衍生出來的 const。靠名字比對、不做型別推導,
// 所以 escape 照舊可用。
//
// Run: `node scripts/hover-instant-invariant.mjs`(`--selftest` 跑正反例)
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../packages/design-system/src', import.meta.url))
/** 上下各看幾行算「同一段 class 宣告」(cva 陣列 / cn(...) 呼叫的典型長度) */
const WINDOW = 8
const LOOKBACK = 3

const HOVER_BG = /(?:^|[\s'"`:[])(?:hover|data-\[hovered\]|data-\[highlighted\]|group-hover\/[\w-]+|group-data-\[state=open\]\/[\w-]+):bg-/
const COLOUR_TRANSITION = /\btransition-colors\b|\btransition-all\b|\btransition-\[[^\]]*(?:background-color|colors)[^\]]*\]/
const ESCAPE = /@hover-transition-allow:\s*\S/

/** 把註解剝掉再判斷:spec 引用或說明文字提到 `transition-colors` 不算宣告(對齊 focus-suppression-registry 的做法) */
const stripComments = (line) => line.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/, '')

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @param {string} source
 * @param {string} [path]
 * @param {Set<string>} [carriers] 這個檔裡「帶著 hover 底色的識別字」(見檔頭 2026-09-25 段)
 */
export function scanSource(source, path = '<inline>', carriers = new Set()) {
  const lines = source.split('\n')
  const hits = []
  const carrierRe = carriers.size ? new RegExp(`(?<![\\w$])(?:${[...carriers].map(escapeRe).join('|')})(?![\\w$])`) : null
  lines.forEach((raw, i) => {
    const code = stripComments(raw)
    if (!COLOUR_TRANSITION.test(code)) return
    const from = Math.max(0, i - WINDOW), to = Math.min(lines.length, i + WINDOW + 1)
    const near = lines.slice(from, to).map(stripComments).join('\n')
    if (!HOVER_BG.test(near) && !(carrierRe && carrierRe.test(near))) return
    const escaped = lines.slice(Math.max(0, i - LOOKBACK), i + 1).some((l) => ESCAPE.test(l))
    if (escaped) return
    hits.push({ path, line: i + 1, text: raw.trim().slice(0, 90) })
  })
  return hits
}

// ── 帶著 hover 底色的識別字(跨檔)──────────────────────────────────────────────

/** 會合併 class 的函式:它們的回傳值仍是「class 字串」,可以沿著傳下去 */
const CLASS_FNS = new Set(['cn', 'clsx', 'cx', 'twMerge', 'twJoin', 'classNames', 'cva'])
/**
 * 初始值是不是「一個 class 值」:字串 / 樣板字串 / 字串組成的物件或陣列 / 三元與 && / 取索引或屬性 /
 * cn()·cva() 等合併呼叫。**函式不算**(元件本體、forwardRef、useMemo 的 callback)——
 * 否則整個元件的名字都會因為本體裡某處寫了 hover class 而變成 carrier,再一路擴散到全檔(2026-09-25 第一版實測:data-table.tsx 擴散到 300+ 個名字)。
 */
function isClassValue(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isNonNullExpression(node)) node = node.expression
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isIdentifier(node)) return true
  if (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) return isClassValue(node.expression)
  if (ts.isConditionalExpression(node)) return isClassValue(node.whenTrue) && isClassValue(node.whenFalse)
  if (ts.isBinaryExpression(node)) return isClassValue(node.right)
  if (ts.isArrayLiteralExpression(node)) return node.elements.every((e) => isClassValue(ts.isSpreadElement(e) ? e.expression : e) || e.kind === ts.SyntaxKind.FalseKeyword)
  if (ts.isObjectLiteralExpression(node)) return node.properties.every((p) => ts.isPropertyAssignment(p) && isClassValue(p.initializer))
  if (ts.isCallExpression(node)) {
    const e = node.expression
    const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ''
    return CLASS_FNS.has(name) || name === 'join'
  }
  return false
}

/** 一個檔裡:「class 值」const 宣告(任何作用域)的名字 → 初始值;import 進來的名字 → 來源模組與原名;是否 export */
function readDeclarations(source, path) {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const decls = []
  const imports = []
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && isClassValue(n.initializer)) {
      const stmt = n.parent && n.parent.parent
      const exported = !!(stmt && ts.isVariableStatement(stmt) && stmt.parent === sf
        && stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
      const text = n.initializer.getText(sf).split('\n').map(stripComments).join('\n')
      const refs = new Set()
      const collect = (x) => {
        if (ts.isIdentifier(x)) refs.add(x.text)
        // 物件 / 屬性存取的「名字」那一側不是引用(`CAT_ACCENT.blue` 的 blue、`{ blue: … }` 的 blue)
        if (ts.isPropertyAccessExpression(x)) { collect(x.expression); return }
        if (ts.isPropertyAssignment(x)) { collect(x.initializer); return }
        ts.forEachChild(x, collect)
      }
      collect(n.initializer)
      decls.push({ name: n.name.text, text, refs, exported })
    }
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings)) {
      for (const el of n.importClause.namedBindings.elements) {
        imports.push({ from: n.moduleSpecifier.text, imported: (el.propertyName ?? el.name).text, local: el.name.text })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return { decls, imports }
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

/**
 * @param {Map<string,string>} files 相對 src 的路徑 → 原始碼
 * @returns {Map<string, Set<string>>} 每個檔裡「帶著 hover 底色的識別字」
 */
export function hoverBgCarriers(files) {
  const info = new Map([...files].map(([p, src]) => [p, readDeclarations(src, p)]))
  const carriers = new Map([...files.keys()].map((p) => [p, new Set()]))
  // 種子:初始值裡字面上寫了 hover 底色 class
  for (const [p, { decls }] of info) for (const d of decls) if (HOVER_BG.test(d.text)) carriers.get(p).add(d.name)
  // 衍生到不動為止:同檔 const 引用了 carrier → 自己也是;import 進來的 exported carrier → 本地名字也是
  for (let changed = true; changed;) {
    changed = false
    for (const [p, { decls, imports }] of info) {
      const set = carriers.get(p)
      for (const imp of imports) {
        const target = resolveImport(p, imp.from, files)
        if (!target || set.has(imp.local)) continue
        const exportedThere = info.get(target).decls.some((d) => d.exported && d.name === imp.imported && carriers.get(target).has(d.name))
        if (exportedThere) { set.add(imp.local); changed = true }
      }
      for (const d of decls) {
        if (set.has(d.name)) continue
        if ([...d.refs].some((r) => set.has(r))) { set.add(d.name); changed = true }
      }
    }
  }
  return carriers
}

/** 掃一組檔(相對 src 的路徑 → 原始碼):只報非 story 檔的命中,但 carrier 從全部檔推導 */
export function scanProject(files) {
  const carriers = hoverBgCarriers(files)
  const hits = []
  for (const [p, src] of files) {
    if (p.endsWith('.stories.tsx')) continue
    hits.push(...scanSource(src, p, carriers.get(p)))
  }
  return hits
}

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
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
  const negativeNoHoverBg = `const link = cn('hover:text-primary-hover', 'transition-colors duration-150')`
  const negativeNoTransition = `const row = cn('hover:bg-neutral-hover', 'rounded-md')`
  const negativeFar = `const a = cn('transition-colors')\n${'\n'.repeat(20)}\nconst b = cn('hover:bg-neutral-hover')`
  const cases = [
    ['hover 底色 + transition-colors', positive, 1],
    ['data-[hovered] 底色 + transition-all', positiveAttr, 1],
    ['寫了 escape 註解', escaped, 0],
    ['只有文字色 hover(無底色)', negativeNoHoverBg, 0],
    ['有 hover 底色但沒有過渡', negativeNoTransition, 0],
    ['過渡與 hover 底色相距 20 行以上', negativeFar, 0],
  ]
  let bad = 0
  for (const [name, src, expected] of cases) {
    const n = scanSource(src).length
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
  const crossCases = [
    ['跨檔:.ts 裡的 hover 底色經兩層變數傳進有 transition-colors 的 cn()(Calendar 事件方塊)', project(true), 1],
    ['跨檔:同一條路徑但沒有過渡', project(false), 0],
    ['.ts 檔自己同時寫了 hover 底色與過渡', new Map([['lib/x.ts', `export const row = cn('transition-colors', 'hover:bg-neutral-hover')`]]), 1],
    ['無關的 const 與過渡同框(名字不是 carrier)', new Map([['lib/y.ts', `export const plain = 'text-body'`], ['components/z.tsx', `import { plain } from '@/design-system/lib/y'\nconst a = cn('transition-colors', plain)`]]), 0],
  ]
  for (const [name, files, expected] of crossCases) {
    const n = scanProject(files).length
    const ok = n === expected
    console.log(`${ok ? '✓' : '✗'} ${name} — 期望 ${expected} 命中,實得 ${n}`)
    if (!ok) bad++
  }
  console.log(bad ? `\n✗ selftest ${bad} 項不符` : '\n✓ selftest:正例會紅、反例不會紅、escape 有效')
  process.exit(bad ? 1 : 0)
}

if (isMain) {
  const files = new Map(walk(ROOT).map((p) => [relative(ROOT, p).split('\\').join('/'), readFileSync(p, 'utf8')]))
  const hits = scanProject(files)
  if (hits.length) {
    console.error('✗ hover 底色仍有過渡(user 2026-09-10 拍板一律瞬間;SSOT = tokens/motion/motion.spec.md):')
    for (const h of hits) console.error(`  ${h.path}:${h.line}  ${h.text}`)
    console.error('\n  修法:把 transition-colors / transition-all 從那段 class 拿掉;')
    console.error('  真的屬於「狀態切換」而不是 hover 的,在該行上方寫 `// @hover-transition-allow: <理由>`。')
    process.exit(1)
  }
  console.log(`✓ 全 DS 的 hover 底色都是瞬間切換(無殘留過渡;掃了 ${files.size} 個 .tsx / .ts)`)
}

#!/usr/bin/env node
/**
 * Token 建立不變式(2026-09-11 立;2026-11-11 擴成「分類表」九條檢查裡的八條)
 *
 * user 原話(2026-09-11):「為何你他媽又不照規範來建立 token?要講幾次?而且這個部分我們之前也有特別提醒每次建立必檢查吧?
 * 你他媽要如何永遠在各種環境下都能避免這個問題?」
 *
 * **2026-11-11 為什麼要擴**:342 顆 token 裡 194 顆,`tokens/README.md` 那張「公開 / 內部」表與
 * `token-system.spec.md` 那張「誰可以讀」表說法相反 —— 分類只寫在兩張給人看的表裡,沒有任何檢查看得到。
 * 這支舊版只管兩件事(前綴不跨家族、新 token 要出現在家族規格裡),只掃 `tokens/`,而且拿不到 main 的清單就跳過。
 * 現在改成:分類只住一份給機器讀的表 `packages/design-system/src/tokens/token-registry.json`,這支拿它驗每一次改動
 * (原則見 `token-system.spec.md`「三類 / 三題 / 三條規則」)。
 *
 * 檢查(編號沿用 user 2026-11-10 拍板的落地計畫 (d) 節;第 8 條住在 `scripts/token-twin-invariant.mjs`):
 *   C1 有登記:整頁生效的名字(`:root` / 密度 / 主題 / Tailwind `@theme` 段)恰好對到分類表一列(最長吻合;對不到或兩列一樣長都算錯);
 *      被「宣告它的資料夾以外」讀到的名字也要登記;Tailwind 轉接名(`@theme` 裡 `--x: var(--y)`)不登記,只驗它指向的本尊有登記;
 *      分類表每一列欄位合法、沒有對不到任何名字的死列。
 *   C2 新名字逐顆登記、要有理由:相對 main 新增、需要登記的名字,分類表必須有它完整名字的一列,`why` 不可空;
 *      類別是共用刻度的,要寫出它屬於哪一組既有刻度(`scale`)或第二個讀者(`secondReader`,那個檔必須真的讀它)。
 *   C3 宣告的檔案 = 登記的住處:整頁生效的宣告只准出現在該列 `home`;`home` 列的每個檔都真的宣告了它(住處不准過期)。
 *   C4 新名字完整出現在登記的那份規格裡(整個名字比對);既有在規格裡完全找不到的,列已知名單 `known.missingSpec`,只能變短。
 *   C5 有大密度覆寫就要有回復,而且覆寫、回復、預設值同一個檔;深色主題覆寫也跟預設值同檔。已知名單 `known.missingRestore`。
 *   C6 元件樣式檔有進對外彙總檔(`styles/tokens.css`)或被設計系統程式匯入 —— 2026-05-26 事故(產品拿不到值、版面跑掉)。
 *      判準同 `packages/design-system/ds-canonical/hooks/check_orphan_ds_css.sh`(那支只在本機收工時提醒),這裡是 CI 必跑的那一份。
 *   C7 誰可以讀:(甲)產品端程式(本 repo `apps/`)不得讀 `product: "no"` 的名字、不得覆寫非 `read-write` 的名字;
 *      (乙)設計系統 `components/` / `patterns/` / `styles/` 讀原料,資料夾必須在該列 `dsReaders`。兩邊都是已知名單以外的才擋。
 *   C9 只有主人自己在讀、又不切換的新值,不該有全系統的名字(第一階段只對相對 main 新增的名字開)。
 * 三件跨條的事:拿不到 main → **紅**(INSTRUMENT-FAIL,不是跳過);讀者一律去掉註解(程式檔用 TypeScript 語法樹只取字串);
 * 已知名單「只能變短」= 比 main 的那份多一筆就紅、修好了還留著也紅。
 *
 * 跑法:
 *   node scripts/token-creation-invariant.mjs              現況(要綠)
 *   node scripts/token-creation-invariant.mjs --selftest   對照組:每一條各自注入違規、確認紅的是它而且指名;每條也有一筆該綠的
 *   node scripts/token-creation-invariant.mjs --inventory  列出需要登記的名字、它對到的列、宣告處與讀者資料夾(搬家時用)
 * 純讀檔比對,不開瀏覽器、不量時間;機器快慢不影響結果。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DS_ROOT = 'packages/design-system/src'
export const REGISTRY_PATH = `${DS_ROOT}/tokens/token-registry.json`
const AGGREGATOR = 'styles/tokens.css'

// ── 掃描範圍 ──────────────────────────────────────────────────────────────
// 執行期程式 = 設計系統 src 與產品 apps/*/src 的 .css / .ts / .tsx;範例(stories、stories-helpers、story-governance)與測試不算。
const SCANNABLE = /\.(css|ts|tsx)$/
const EXCLUDED = /(\.stories\.tsx$|story-helpers\.tsx?$|\/_demo-helpers\.tsx?$|\.test\.[jt]sx?$|\.d\.ts$|\/__tests__\/|\/node_modules\/|\/stories-helpers\/|\/story-governance\/)/
export const isScannable = (p) => SCANNABLE.test(p) && !EXCLUDED.test(p) &&
  (p.startsWith(`${DS_ROOT}/`) || /^apps\/[^/]+\/src\//.test(p))

function walk(dir, out = []) {
  for (const n of readdirSync(join(REPO, dir))) {
    if (n === 'node_modules' || n.startsWith('.')) continue
    const p = `${dir}/${n}`
    if (statSync(join(REPO, p)).isDirectory()) walk(p, out)
    else if (isScannable(p)) out.push(p)
  }
  return out
}
export function readWorkingFiles() {
  const files = new Map()
  const roots = [DS_ROOT, ...readdirSync(join(REPO, 'apps')).map((a) => `apps/${a}/src`).filter((d) => { try { return statSync(join(REPO, d)).isDirectory() } catch { return false } })]
  for (const r of roots) for (const p of walk(r)) files.set(p, readFileSync(join(REPO, p), 'utf8'))
  return files
}

const git = (args, opts = {}) => execFileSync('git', args, { cwd: REPO, maxBuffer: 512 * 1024 * 1024, ...opts })
/** main 的檔案快照(一次 cat-file --batch);拿不到 ref → 丟例外(呼叫端判紅)。 */
export function readFilesAt(ref) {
  const list = git(['ls-tree', '-r', '--name-only', ref, '--', DS_ROOT, 'apps'], { encoding: 'utf8' }).split('\n').filter(isScannable)
  const out = git(['cat-file', '--batch'], { input: list.map((p) => `${ref}:${p}`).join('\n') + '\n' })
  const files = new Map()
  let off = 0, i = 0
  while (off < out.length && i < list.length) {
    const nl = out.indexOf(10, off)
    const header = out.toString('utf8', off, nl)
    if (header.endsWith(' missing')) { off = nl + 1; i++; continue }
    const size = Number(header.split(' ')[2])
    files.set(list[i], out.toString('utf8', nl + 1, nl + 1 + size))
    off = nl + 1 + size + 1; i++
  }
  if (files.size !== list.length) throw new Error(`cat-file 只讀回 ${files.size}/${list.length} 個檔`)
  return files
}
export function resolveBaseRef() {
  for (const ref of ['origin/main', 'main']) {
    try { git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'pipe' }); return ref } catch { /* 下一個 */ }
  }
  return null
}

// ── 解析 ─────────────────────────────────────────────────────────────────
const NAME = '--[A-Za-z0-9_-]+'
const GLOBAL_PART = /^(?::root|html)?(?:\[data-(?:theme|density|ui-size|layout-space)(?:=["']?[\w-]+["']?)?\])*$/
const AT_TRANSPARENT = /^@(media|supports|layer|container)\b/

function blockOf(stack) {
  const sel = [...stack].reverse().find((s) => !AT_TRANSPARENT.test(s))
  if (sel == null) return { scope: 'top' }
  if (/^@theme\b/.test(sel)) return { scope: 'theme-tw' }
  const parts = sel.split(',').map((s) => s.replace(/\s+/g, ''))
  if (!parts.every((p) => p && GLOBAL_PART.test(p))) return { scope: 'local', selector: sel }
  const txt = parts.join(',')
  const block = /data-(density|ui-size)=["']?lg/.test(txt) ? 'density-lg'
    : /data-(density|ui-size)=["']?md/.test(txt) ? 'density-md'
      : /data-theme=["']?dark/.test(txt) ? 'theme-dark'
        : /data-[\w-]+=/.test(txt) ? `variant:${txt}` : 'root'
  return { scope: 'global', block, selector: sel }
}

function scanCss(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const lineAt = (i) => src.slice(0, i).split('\n').length
  const decls = [], reads = [], utilities = new Map()
  for (const m of src.matchAll(new RegExp(`var\\(\\s*(${NAME})`, 'g'))) if (!/[-_]$/.test(m[1])) reads.push({ name: m[1], line: lineAt(m.index), how: 'var' })
  for (const m of src.matchAll(/@utility\s+([\w-]+)\s*\{([^}]*)\}/g)) {
    utilities.set(m[1], [...m[2].matchAll(new RegExp(`var\\(\\s*(${NAME})`, 'g'))].map((x) => x[1]))
  }
  const stack = []
  let start = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '{') { stack.push(src.slice(start, i).trim()); start = i + 1; continue }
    if (c !== ';' && c !== '}') continue
    const seg = src.slice(start, i)
    const m = seg.match(new RegExp(`^\\s*(${NAME})\\s*:([\\s\\S]*)$`))
    if (m) {
      const b = blockOf(stack)
      const value = m[2].trim()
      const line = lineAt(start + seg.indexOf(m[1]))
      if (b.scope === 'theme-tw') {
        const alias = value.match(new RegExp(`^var\\(\\s*(${NAME})\\s*\\)$`))
        decls.push(alias ? { name: m[1], kind: 'alias', aliasOf: alias[1], line } : { name: m[1], kind: 'global', block: 'root', tw: true, line })
      } else if (b.scope === 'global') decls.push({ name: m[1], kind: 'global', block: b.block, line })
      else decls.push({ name: m[1], kind: 'local', line })
    }
    if (c === '}') stack.pop()
    start = i + 1
  }
  return { decls, reads, utilities, words: new Set(), imports: cssImports(src) }
}
function cssImports(src) {
  return [...src.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+\.css)['"]/g)].map((m) => m[1])
}

/** 程式檔:用 TypeScript 語法樹只取字串(註解自然被排除),在字串裡找讀取 / 宣告 / class 名。 */
function scanCode(text, path) {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const decls = [], reads = [], words = new Set(), imports = []
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
  const up = (n) => { let p = n.parent; while (p && (ts.isAsExpression(p) || ts.isParenthesizedExpression(p) || ts.isSatisfiesExpression?.(p))) { n = p; p = p.parent } return { node: n, parent: p } }
  const onLiteral = (node, t) => {
    if (new RegExp(`^${NAME}$`).test(t)) {
      if (/[-_]$/.test(t)) return // `'--table-row-' + size`:字串拼出來的名字只拿得到開頭
      const { node: self, parent } = up(node)
      if (parent && ts.isComputedPropertyName(parent)) { decls.push({ name: t, kind: 'code', line: lineOf(node) }); return }
      if (parent && ts.isPropertyAssignment(parent) && parent.name === self) { decls.push({ name: t, kind: 'code', line: lineOf(node) }); return }
      if (parent && ts.isCallExpression(parent) && parent.arguments[0] === self && ts.isPropertyAccessExpression(parent.expression)) {
        const fn = parent.expression.name.text
        if (fn === 'setProperty') { decls.push({ name: t, kind: 'code', line: lineOf(node) }); return }
        if (fn === 'removeProperty') return
      }
      reads.push({ name: t, line: lineOf(node), how: 'quoted' })
      return
    }
    // 字串拼出來的名字(`var(--table-row-${size})`)只拿得到開頭 —— 結尾是 `-` / `_` 的不算一個名字
    for (const m of t.matchAll(new RegExp(`var\\(\\s*(${NAME})`, 'g'))) if (!/[-_]$/.test(m[1])) reads.push({ name: m[1], line: lineOf(node), how: 'var' })
    for (const m of t.matchAll(new RegExp(`[A-Za-z0-9]-\\((${NAME})\\)`, 'g'))) reads.push({ name: m[1], line: lineOf(node), how: 'tw-shorthand' })
    for (const m of t.matchAll(new RegExp(`\\[(${NAME}):`, 'g'))) decls.push({ name: m[1], kind: 'code', line: lineOf(node) })
    for (const w of t.split(/[\s"'`,]+/)) {
      if (!w) continue
      const u = w.split(':').pop().replace(/^!/, '').replace(/!$/, '').replace(/\/[\w.[\]]+$/, '')
      if (u) words.add(u)
    }
  }
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text)
    else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) onLiteral(node, node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { decls, reads, utilities: new Map(), words, imports }
}

// ── 模型 ─────────────────────────────────────────────────────────────────
const dsRel = (p) => p.slice(DS_ROOT.length + 1)
export function folderOf(p) {
  if (!p.startsWith(`${DS_ROOT}/`)) { const m = p.match(/^apps\/([^/]+)\//); return m ? `product:${m[1]}` : p }
  const s = dsRel(p).split('/')
  if (['components', 'patterns', 'tokens'].includes(s[0])) return s.length > 2 ? `${s[0]}/${s[1]}` : s[0]
  return s.length > 1 ? s[0] : '.'
}
const parseCache = new Map()
function parse(path, text) {
  const key = `${path}\0${text}`
  if (!parseCache.has(key)) parseCache.set(key, path.endsWith('.css') ? scanCss(text) : scanCode(text, path))
  return parseCache.get(key)
}

// Tailwind @theme 名字 → 產生的 class(只收本 DS 用得到的幾種命名空間)
const NS_UTILS = {
  spacing: ['h', 'w', 'size', 'min-h', 'min-w', 'max-h', 'max-w', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'ps', 'pe', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'ms', 'me', '-m', '-mx', '-my', '-mt', '-mb', '-ml', '-mr', 'gap', 'gap-x', 'gap-y', 'space-x', 'space-y', '-space-x', '-space-y', 'inset', 'inset-x', 'inset-y', 'top', 'bottom', 'left', 'right', 'start', 'end', 'basis', 'indent', 'scroll-m', 'scroll-p', 'translate-x', 'translate-y'],
  color: ['bg', 'text', 'border', 'border-t', 'border-b', 'border-l', 'border-r', 'border-x', 'border-y', 'border-s', 'border-e', 'ring', 'ring-offset', 'outline', 'fill', 'stroke', 'divide', 'from', 'via', 'to', 'caret', 'accent', 'decoration', 'shadow', 'placeholder', 'inset-ring'],
  radius: ['rounded', 'rounded-t', 'rounded-b', 'rounded-l', 'rounded-r', 'rounded-s', 'rounded-e', 'rounded-tl', 'rounded-tr', 'rounded-bl', 'rounded-br', 'rounded-ss', 'rounded-se', 'rounded-es', 'rounded-ee'],
  font: ['font'], text: ['text'], opacity: ['opacity'], shadow: ['shadow'], ease: ['ease'], animate: ['animate'],
}

export function buildModel(files) {
  const entries = []
  for (const [path, text] of files) entries.push({ path, folder: folderOf(path), isDs: path.startsWith(`${DS_ROOT}/`), ...parse(path, text) })
  const globalDecls = new Map(), aliases = new Map(), declFolders = new Map(), allDecls = new Map()
  const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v) }
  const utilToNames = new Map()
  for (const e of entries) {
    for (const d of e.decls) {
      const at = { ...d, path: e.path, folder: e.folder }
      if (e.isDs) push(allDecls, d.name, at)
      if (!e.isDs) continue
      if (d.kind === 'alias') aliases.set(d.name, at)
      if (d.kind === 'global') push(globalDecls, d.name, at)
      if (!declFolders.has(d.name)) declFolders.set(d.name, new Set())
      declFolders.get(d.name).add(e.folder)
    }
    for (const [u, names] of e.utilities) for (const n of names) push(utilToNames, u, n)
  }
  // @theme 名字(轉接名與 @theme 裡直接給值的)對應的 class
  for (const [name, list] of [...[...aliases].map(([n, a]) => [n, [a]]), ...globalDecls]) {
    if (!list.some((d) => d.kind === 'alias' || d.tw)) continue
    const m = name.match(/^--([a-z]+)-(.+)$/)
    if (!m || !NS_UTILS[m[1]]) continue
    for (const pre of NS_UTILS[m[1]]) push(utilToNames, `${pre}-${m[2]}`, name)
  }
  const resolve = (n) => { const seen = new Set(); while (aliases.has(n) && !seen.has(n)) { seen.add(n); n = aliases.get(n).aliasOf } return n }
  // (names:這份快照裡出現過的名字 = 設計系統裡任何宣告 + 設計系統執行期讀到的;「相對 main 新增」拿它當基準)
  const reads = [] // { name(本尊), raw(字面), path, folder, isDs, line, how }
  for (const e of entries) {
    for (const r of e.reads) reads.push({ name: resolve(r.name), raw: r.name, path: e.path, folder: e.folder, isDs: e.isDs, line: r.line, how: r.how })
    for (const w of e.words) for (const n of utilToNames.get(w) ?? []) reads.push({ name: resolve(n), raw: n, path: e.path, folder: e.folder, isDs: e.isDs, line: 0, how: `class ${w}` })
  }
  const names = new Set([...allDecls.keys(), ...reads.filter((r) => r.isDs).map((r) => r.name)])
  return { entries, globalDecls, aliases, declFolders, allDecls, reads, resolve, names }
}

// ── 分類表 ───────────────────────────────────────────────────────────────
const CLASSES = ['raw', 'shared', 'component', 'ignore']
const PRODUCT = ['no', 'read', 'read-write']
export const isPrefixRow = (r) => r.match.endsWith('-') || r.match.endsWith('_')
export function lookup(rows, name) {
  let best = [], len = -1
  for (const r of rows) {
    if (!(isPrefixRow(r) ? name.startsWith(r.match) : name === r.match)) continue
    if (r.match.length > len) { best = [r]; len = r.match.length } else if (r.match.length === len) best.push(r)
  }
  return best
}
const homesOf = (r) => (r.home == null ? [] : Array.isArray(r.home) ? r.home : [r.home]).map((h) => `${DS_ROOT}/${h}`)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const specHasWhole = (spec, name) => new RegExp(`(?<![\\w-])${esc(name)}(?![\\w-])`).test(spec)
/** 規格裡的萬用寫法(`--color-{hue}-{1~10}`、`--field-height-*`、`--x-<size>`)涵蓋到它也算「找得到」—— 只用在既有名字的已知名單。 */
export function specCovers(spec, name) {
  if (specHasWhole(spec, name)) return true
  for (const m of spec.matchAll(/--[A-Za-z0-9_-]*(?:\{[^}\s]*\}|\*|<[^>\s]*>)[A-Za-z0-9_{}<>*~-]*/g)) {
    const pat = m[0]
    if (pat.replace(/\{[^}]*\}|\*|<[^>]*>/g, '').replace(/^--/, '').replace(/-/g, '').length < 3) continue
    const re = new RegExp(`^${pat.split(/(\{[^}]*\}|\*|<[^>]*>)/).map((s, i) => (i % 2 ? '[A-Za-z0-9_-]+' : esc(s))).join('')}$`)
    if (re.test(name)) return true
  }
  return false
}

// ── 判定 ─────────────────────────────────────────────────────────────────
/**
 * @param {object} ctx { files: Map, registry, mainNames: Set|null(null = 拿不到 main), mainRegistry: object|null|undefined(undefined = main 上沒有分類表), readSpec(path)→text|null }
 * @returns {{ problems: Record<string,string[]>, info: object }}
 */
export function runChecks(ctx) {
  const P = { C1: [], C2: [], C3: [], C4: [], C5: [], C6: [], C7: [], C9: [] }
  const reg = ctx.registry
  const rows = Array.isArray(reg?.rows) ? reg.rows : []
  const known = reg?.known ?? {}
  const m = buildModel(ctx.files)
  const look = (n) => lookup(rows, n)
  const real = (r) => r && r.class !== 'ignore'

  // C1-0 分類表本身
  if (!Array.isArray(reg?.rows)) P.C1.push(`分類表 ${REGISTRY_PATH} 讀不到或沒有 rows`)
  const seen = new Map()
  for (const r of rows) {
    const id = r?.match ?? JSON.stringify(r)
    if (typeof r?.match !== 'string' || !r.match.startsWith('--')) { P.C1.push(`分類表一列沒有合法的 match:${id}`); continue }
    if (seen.has(r.match)) P.C1.push(`分類表有兩列 match 相同(${r.match})—— 同一個名字兩列一樣長都吻合`)
    seen.set(r.match, r)
    if (!CLASSES.includes(r.class)) P.C1.push(`${r.match}:class 必須是 ${CLASSES.join(' / ')}`)
    if (typeof r.why !== 'string' || !r.why.trim()) P.C1.push(`${r.match}:why 不可空`)
    if (r.class === 'ignore') continue
    if (typeof r.owner !== 'string' || !r.owner) P.C1.push(`${r.match}:owner 不可空`)
    if (!(r.home === null || typeof r.home === 'string' || (Array.isArray(r.home) && r.home.length))) P.C1.push(`${r.match}:home 必須是路徑、路徑陣列或 null`)
    if (typeof r.spec !== 'string') P.C1.push(`${r.match}:spec 必須是路徑`)
    if (!PRODUCT.includes(r.product)) P.C1.push(`${r.match}:product 必須是 ${PRODUCT.join(' / ')}`)
    if (!(r.dsReaders === 'any' || Array.isArray(r.dsReaders))) P.C1.push(`${r.match}:dsReaders 必須是 "any" 或資料夾陣列`)
  }

  // 需要登記的名字
  const need = new Map() // name → 原因
  for (const n of m.globalDecls.keys()) need.set(n, '整頁生效的宣告')
  for (const r of m.reads) {
    if (!r.isDs || m.aliases.has(r.raw) || m.globalDecls.has(r.name)) continue
    const df = m.declFolders.get(r.name)
    if (!df || !df.has(r.folder)) need.set(r.name, need.get(r.name) ?? `在宣告它的資料夾以外被讀(${r.folder})`)
  }
  for (const [n, why] of need) {
    const hit = look(n)
    if (hit.length === 0) P.C1.push(`${n} 沒有登記(${why})—— 在分類表加一列`)
    else if (hit.length > 1) P.C1.push(`${n} 同時吻合 ${hit.length} 列一樣長的 match(${hit.map((h) => h.match).join(' / ')})`)
  }
  for (const [a, at] of m.aliases) {
    const target = m.resolve(a)
    const hit = look(target)
    if (!(hit.length === 1 && real(hit[0]))) P.C1.push(`轉接名 ${a}(${dsRel(at.path)}:${at.line})指向 ${target},但 ${target} 沒有登記`)
  }
  const usedRows = new Set()
  for (const n of need.keys()) for (const h of look(n)) usedRows.add(h)
  for (const r of rows) if (typeof r?.match === 'string' && r.class !== 'ignore' && !usedRows.has(r)) P.C1.push(`分類表的 ${r.match} 對不到任何需要登記的名字(死列;名字退場就刪這一列)`)

  // 相對 main 新增
  const mainNames = ctx.mainNames
  const isNew = (n) => mainNames != null && !mainNames.has(n)
  const ownRow = (n) => { const h = look(n); return h.length === 1 ? h[0] : null }

  // C2
  for (const n of need.keys()) {
    if (!isNew(n)) continue
    const r = ownRow(n)
    if (r && r.class === 'ignore' && isPrefixRow(r)) continue
    if (!r || r.match !== n) { P.C2.push(`${n} 是新名字,分類表要有它完整名字的一列(現在${r ? `只靠開頭 ${r.match} 那列` : '沒有任何一列'}對到)`); continue }
    if (typeof r.why !== 'string' || !r.why.trim()) { P.C2.push(`${n} 是新名字,why 不可空`); continue }
    if (r.class === 'shared') {
      const scaleOk = typeof r.scale === 'string' && rows.some((x) => x !== r && x.match === r.scale && x.class === 'shared')
      let readerOk = false
      if (typeof r.secondReader === 'string') {
        const t = ctx.files.get(`${DS_ROOT}/${r.secondReader}`)
        readerOk = t != null && m.reads.some((x) => x.path === `${DS_ROOT}/${r.secondReader}` && x.name === n)
      }
      if (!scaleOk && !readerOk) P.C2.push(`${n} 登記成共用刻度,要寫出它屬於哪一組既有刻度(scale = 另一列共用刻度的 match)或第二個讀者(secondReader = 真的讀它的檔)`)
    }
  }

  // C3
  for (const [n, list] of m.globalDecls) {
    const r = ownRow(n)
    if (!real(r)) continue
    const homes = homesOf(r)
    for (const d of list) if (!homes.includes(d.path)) P.C3.push(`${n} 宣告在 ${dsRel(d.path)}:${d.line},分類表登記的住處是 ${homes.map(dsRel).join(' / ') || '(無預設宣告)'}`)
  }
  for (const r of rows) {
    if (!real(r) || !usedRows.has(r)) continue
    const names = [...need.keys()].filter((n) => ownRow(n) === r)
    for (const h of homesOf(r)) {
      if (!ctx.files.has(h)) { P.C3.push(`${r.match} 登記的住處 ${dsRel(h)} 不存在`); continue }
      if (!names.some((n) => (m.allDecls.get(n) ?? []).some((d) => d.path === h))) P.C3.push(`${r.match} 登記的住處 ${dsRel(h)} 沒有宣告它(住處過期)`)
    }
  }

  // C4
  const specCache = new Map()
  const specText = (p) => { if (!specCache.has(p)) specCache.set(p, ctx.readSpec(`${DS_ROOT}/${p}`)); return specCache.get(p) }
  const missingSpec = []
  for (const n of need.keys()) {
    const r = ownRow(n)
    if (!real(r)) continue
    const t = specText(r.spec)
    if (t == null) { P.C4.push(`${n} 登記的規格 ${r.spec} 不存在`); continue }
    if (isNew(n)) { if (!specHasWhole(t, n)) P.C4.push(`${n} 是新名字,登記的規格 ${r.spec} 裡找不到它完整的名字`) }
    else if (!specCovers(t, n)) missingSpec.push(n)
  }
  ratchet(P.C4, 'missingSpec', missingSpec, known.missingSpec, ctx.mainRegistry?.known?.missingSpec, ctx.mainRegistry, (n) => `${n} 在登記的規格裡完全找不到(新的缺漏;補進規格)`)

  // C5
  const missingRestore = []
  for (const [n, list] of m.globalDecls) {
    const roots = new Set(list.filter((d) => d.block === 'root').map((d) => d.path))
    for (const d of list.filter((x) => x.block === 'density-lg' || x.block === 'theme-dark')) {
      if (!roots.has(d.path)) P.C5.push(`${n} 的${d.block === 'theme-dark' ? '深色主題' : '大密度'}覆寫在 ${dsRel(d.path)}:${d.line},預設值不在同一個檔`)
    }
    for (const d of list.filter((x) => x.block === 'density-lg')) {
      if (!list.some((x) => x.block === 'density-md' && x.path === d.path)) missingRestore.push(n)
    }
  }
  ratchet(P.C5, 'missingRestore', [...new Set(missingRestore)], known.missingRestore, ctx.mainRegistry?.known?.missingRestore, ctx.mainRegistry, (n) => `${n} 有大密度覆寫,但同一個檔的「鎖回一般密度」段沒有它`)

  // C6
  const importedBy = new Map()
  for (const e of m.entries) {
    if (!e.isDs) continue
    for (const spec of e.imports) {
      if (!spec.startsWith('.')) continue
      const target = posix.normalize(posix.join(posix.dirname(e.path), spec))
      if (target !== e.path) { if (!importedBy.has(target)) importedBy.set(target, []); importedBy.get(target).push(e.path) }
    }
  }
  for (const p of ctx.files.keys()) {
    if (!p.startsWith(`${DS_ROOT}/`) || !p.endsWith('.css') || dsRel(p) === AGGREGATOR) continue
    if (!importedBy.has(p)) P.C6.push(`${dsRel(p)} 沒進 ${AGGREGATOR},也沒有任何設計系統程式匯入它 —— 產品拿不到(2026-05-26 事故);跑 node scripts/gen-figma-make-artifacts.mjs 或在元件程式 import`)
  }

  // C7
  const productRead = [], productWrite = [], dsRaw = []
  const productDeclared = new Set(m.entries.filter((e) => !e.isDs).flatMap((e) => e.decls.map((d) => d.name)))
  for (const r of m.reads) {
    // 只看 token:設計系統這邊 = 整頁生效 / 跨資料夾被讀的名字(元件自己宣告自己讀的區域變數,例:圖表的 --color-bg,不是 token);
    // 產品這邊 = 上述名字,加上產品自己沒宣告、卻吻合分類表某列的名字(例:讀一個根本不存在的 --color-teal-6 也是讀原料的寫法)
    if (r.isDs ? !need.has(r.name) : !(need.has(r.name) || (!productDeclared.has(r.name) && look(r.name).length))) continue
    const row = ownRow(r.name)
    if (!real(row)) continue
    if (!r.isDs && row.product === 'no') productRead.push(`${r.path}|${r.name}`)
    if (r.isDs && row.class === 'raw' && /^(components|patterns|styles)(\/|$)/.test(r.folder) && !(Array.isArray(row.dsReaders) ? row.dsReaders.includes(r.folder) : row.dsReaders === 'any')) dsRaw.push(`${dsRel(r.path)}|${r.name}`)
  }
  for (const e of m.entries) {
    if (e.isDs) continue
    for (const d of e.decls) {
      if (d.kind === 'alias' || !need.has(m.resolve(d.name))) continue
      const row = ownRow(m.resolve(d.name))
      if (real(row) && row.product !== 'read-write') productWrite.push(`${e.path}|${d.name}`)
    }
  }
  ratchet(P.C7, 'productReads', [...new Set(productRead)], known.productReads, ctx.mainRegistry?.known?.productReads, ctx.mainRegistry, (k) => `產品端讀了不開放給產品的名字:${k.replace('|', ' 讀 ')}`)
  ratchet(P.C7, 'productWrites', [...new Set(productWrite)], known.productWrites, ctx.mainRegistry?.known?.productWrites, ctx.mainRegistry, (k) => `產品端覆寫了不開放覆寫的名字:${k.replace('|', ' 覆寫 ')}`)
  ratchet(P.C7, 'dsRawColorReads', [...new Set(dsRaw)], known.dsRawColorReads, ctx.mainRegistry?.known?.dsRawColorReads, ctx.mainRegistry, (k) => `設計系統元件直接讀原料:${k.replace('|', ' 讀 ')}(改用語意色,或在該列 dsReaders 點名)`)

  // C9
  for (const [n, list] of m.globalDecls) {
    if (!isNew(n)) continue
    const r = ownRow(n)
    if (!real(r)) continue
    if (list.some((d) => d.block !== 'root')) continue
    const homeFolders = new Set(homesOf(r).map(folderOf))
    const readerFolders = new Set(m.reads.filter((x) => x.name === n).map((x) => x.folder))
    if (![...readerFolders].some((f) => !homeFolders.has(f))) {
      P.C9.push(`${n} 是新名字,只有 ${[...readerFolders].join(' / ') || '(沒有人)'} 在讀、也不隨密度或主題切換 —— 寫成元件自己的常數,不開全系統的名字`)
    }
  }

  return { problems: P, info: { need, model: m, missingSpec, missingRestore: [...new Set(missingRestore)], productReads: [...new Set(productRead)], productWrites: [...new Set(productWrite)], dsRawColorReads: [...new Set(dsRaw)] } }
}

/** 已知名單:現況違規 ⊆ 名單;名單裡的都還是違規(修好就刪);main 有分類表時,名單不得比 main 多。 */
function ratchet(out, key, current, listed, mainListed, mainRegistry, describe) {
  const L = new Set((listed ?? []).map(String))
  const cur = new Set(current)
  for (const k of cur) if (!L.has(k)) out.push(describe(k))
  for (const k of L) if (!cur.has(k)) out.push(`已知名單 known.${key} 裡的 ${k} 已經不是違規了 —— 從名單刪掉(名單只能變短)`)
  if (mainRegistry) {
    const M = new Set((mainListed ?? []).map(String))
    for (const k of L) if (!M.has(k)) out.push(`已知名單 known.${key} 比 main 多了 ${k} —— 名單只能變短,新違規要修,不能登記`)
  }
}

// ── 執行 ─────────────────────────────────────────────────────────────────
const readSpecFromDisk = (p) => { try { return readFileSync(join(REPO, p), 'utf8') } catch { return null } }
const readRegistry = (text) => JSON.parse(text)

function mainContext() {
  const ref = resolveBaseRef()
  if (!ref) return { error: '拿不到 origin/main 或 main(簽出要 fetch-depth: 0)' }
  try {
    const mainFiles = readFilesAt(ref)
    const mainNames = buildModel(mainFiles).names
    let mainRegistry
    try { mainRegistry = readRegistry(git(['show', `${ref}:${REGISTRY_PATH}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) } catch (e) {
      const msg = String(e.stderr ?? e.message)
      if (/does not exist|exists on disk, but not in/.test(msg)) mainRegistry = undefined
      else throw e
    }
    return { ref, mainNames, mainRegistry }
  } catch (e) { return { error: String(e.message).split('\n')[0].slice(0, 160) } }
}

const LABEL = {
  C1: 'C1 有登記(整頁生效 / 跨資料夾被讀的名字恰好對到一列;轉接名指向已登記本尊;表本身合法)',
  C2: 'C2 新名字有自己的一列與理由',
  C3: 'C3 宣告的檔案 = 登記的住處',
  C4: 'C4 新名字完整出現在登記的規格裡;既有缺漏只能變短',
  C5: 'C5 大密度覆寫有回復、覆寫與預設同檔',
  C6: 'C6 樣式檔有進對外彙總檔或被程式匯入',
  C7: 'C7 誰可以讀(產品 / 設計系統讀原料)',
  C9: 'C9 新名字不是只有主人自己在讀的常數',
}

function main() {
  const files = readWorkingFiles()
  let registry
  try { registry = readRegistry(readFileSync(join(REPO, REGISTRY_PATH), 'utf8')) } catch (e) { registry = null; console.log(`✗ 分類表讀不到:${String(e.message).split('\n')[0]}`) }
  const base = mainContext()
  if (base.error) {
    console.log(`✗ INSTRUMENT-FAIL 拿不到 main 的 token 清單:${base.error} —— 不是跳過,是紅(「新增」沒有基準就無從判定)`)
    process.exit(1)
  }
  const { problems, info } = runChecks({ files, registry, mainNames: base.mainNames, mainRegistry: base.mainRegistry, readSpec: readSpecFromDisk })
  if (process.argv.includes('--inventory')) {
    for (const [n, why] of [...info.need].sort()) {
      const h = lookup(registry?.rows ?? [], n)
      const decl = (info.model.allDecls.get(n) ?? []).map((d) => `${dsRel(d.path)}:${d.line}${d.block ? `[${d.block}]` : ''}`).slice(0, 4).join(' ')
      const readers = [...new Set(info.model.reads.filter((r) => r.name === n).map((r) => r.folder))].join(' ')
      console.log(`${n}\t${h.map((x) => x.match).join('|') || '-'}\t${why}\t${decl}\t${readers}`)
    }
    return
  }
  let fail = 0
  for (const [k, list] of Object.entries(problems)) {
    console.log(`${list.length ? '✗' : '✓'} ${LABEL[k]}${list.length ? '' : ''}`)
    for (const p of list) console.log(`    ${p}`)
    fail += list.length
  }
  console.log(`\n基準 ${base.ref}${base.mainRegistry === undefined ? '(main 上還沒有分類表 —— 已知名單從這一版開始只能變短)' : ''}`)
  console.log(`需要登記的名字 ${info.need.size} 個 / 分類表 ${registry?.rows?.length ?? 0} 列 / 已知缺規格 ${info.missingSpec.length} / 已知缺回復 ${info.missingRestore.length} / 掃了 ${files.size} 個檔`)
  console.log(fail ? `✗ ${fail} 項未通過` : '✓ Token 建立不變式:全通過')
  process.exit(fail ? 1 : 0)
}

// ── 對照組 ───────────────────────────────────────────────────────────────
function selftest() {
  const files = readWorkingFiles()
  const registry = readRegistry(readFileSync(join(REPO, REGISTRY_PATH), 'utf8'))
  const mainNames = buildModel(files).names
  const clone = (o) => JSON.parse(JSON.stringify(o))
  const UI = `${DS_ROOT}/tokens/uiSize/uiSize.css`
  const DT = `${DS_ROOT}/components/DataTable/data-table.css`
  const withFiles = (extra, drop = []) => { const f = new Map(files); for (const d of drop) f.delete(d); for (const [k, v] of Object.entries(extra)) f.set(k, v); return f }
  const addRows = (...rows) => { const r = clone(registry); r.rows.push(...rows); return r }
  const appendRoot = (decl) => withFiles({ [UI]: `${files.get(UI)}\n:root { ${decl} }\n` })
  const row = (o) => ({ class: 'component', owner: 'Fixture', home: 'tokens/uiSize/uiSize.css', spec: 'tokens/uiSize/uiSize.spec.md', product: 'no', dsReaders: 'any', why: '對照組', ...o })
  const run = (over) => runChecks({ files, registry, mainNames, mainRegistry: registry, readSpec: readSpecFromDisk, ...over })
  const BTN = `${DS_ROOT}/components/Button/fixture-raw.tsx`
  const cases = [
    // C1
    ['C1', true, '--fixture-unregistered', '整頁宣告一個沒登記的名字', () => run({ files: appendRoot('--fixture-unregistered: 1px;') })],
    ['C1', true, '--fixture-tie-a', '兩列一樣長都吻合', () => run({ files: appendRoot('--fixture-tie-a: 1px;'), registry: addRows(row({ match: '--fixture-tie-' }), row({ match: '--fixture-tie-' })) })],
    ['C1', true, '--fixture-code-var', '別的資料夾讀元件程式裡宣告、沒登記的變數', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureA/a.tsx`]: "export const s = { '--fixture-code-var': '1px' }\n", [`${DS_ROOT}/components/FixtureB/b.tsx`]: "export const c = 'w-[var(--fixture-code-var)]'\n" }) })],
    ['C1', false, '--fixture-own-var', '同一個變數只在自己資料夾讀', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureA/a.tsx`]: "export const s = { '--fixture-own-var': '1px' }\n", [`${DS_ROOT}/components/FixtureA/a2.tsx`]: "export const c = 'w-[var(--fixture-own-var)]'\n" }) })],
    ['C1', false, '--spacing-fixture-alias', '轉接名指向已登記本尊', () => run({ files: withFiles({ [UI]: `${files.get(UI)}\n@theme inline { --spacing-fixture-alias: var(--field-height-md); }\n` }) })],
    ['C1', true, '--spacing-fixture-alias', '轉接名指向沒登記的名字', () => run({ files: withFiles({ [UI]: `${files.get(UI)}\n@theme inline { --spacing-fixture-alias: var(--fixture-nobody); }\n` }) })],
    // C2(審查案例 A:在共用尺寸檔加 --field-label-gap,只有一個元件讀)
    ['C2', true, '--tab-height-xl', '開頭已登記、沒有自己那一列(不得靠開頭自動繼承分類)', () => run({ files: appendRoot('--tab-height-xl: 4rem;') })],
    ['C2', true, '--field-label-gap', '有自己那一列但 why 空白', () => run({ files: appendRoot('--field-label-gap: 4px;'), registry: addRows(row({ match: '--field-label-gap', class: 'shared', why: ' ' })) })],
    ['C2', true, '--field-label-gap', '共用刻度沒寫所屬刻度或第二個讀者', () => run({ files: appendRoot('--field-label-gap: 4px;'), registry: addRows(row({ match: '--field-label-gap', class: 'shared', why: '欄位標籤間距' })) })],
    ['C2', false, '--field-label-gap', '寫了理由與所屬刻度', () => run({ files: appendRoot('--field-label-gap: 4px;'), registry: addRows(row({ match: '--field-label-gap', class: 'shared', why: '欄位標籤間距', scale: '--field-height-' })) })],
    // C3(審查案例 D:在按鈕樣式檔加 --field-height-xl)
    ['C3', true, '--field-height-xl', '共用刻度被宣告在元件樣式檔', () => run({ files: withFiles({ [`${DS_ROOT}/components/Button/fixture.css`]: ':root { --field-height-xl: 40px; }\n' }) })],
    ['C3', true, '--sidebar-width', '登記在別處的值被宣告在別的檔', () => run({ files: withFiles({ [`${DS_ROOT}/components/Button/fixture.css`]: ':root { --sidebar-width: 1px; }\n' }) })],
    ['C3', true, '--table-cell-px', '登記的住處過期(住處檔不再宣告它)', () => run({ registry: (() => { const r = clone(registry); r.rows.find((x) => x.match === '--table-cell-px').home = 'components/DataTable/data-table.tsx'; return r })() })],
    ['C3', false, '--sidebar-width', '現況', () => run({})],
    // C4
    ['C4', true, '--fixture-spec-elsewhere', '新名字只出現在別份規格', () => run({ files: appendRoot('--fixture-spec-elsewhere: 1px;'), registry: addRows(row({ match: '--fixture-spec-elsewhere', spec: 'tokens/color/color.spec.md' })) })],
    ['C4', true, '--fixture-half', '新名字剛好是規格裡另一顆的前半段', () => run({ files: appendRoot('--fixture-half: 1px;'), registry: addRows(row({ match: '--fixture-half', spec: 'tokens/fixture.spec.md' })), readSpec: (p) => (p.endsWith('tokens/fixture.spec.md') ? '| `--fixture-half-md` | 1px |' : readSpecFromDisk(p)) })],
    ['C4', false, '--fixture-whole', '新名字完整出現在登記的規格', () => run({ files: appendRoot('--fixture-whole: 1px;'), registry: addRows(row({ match: '--fixture-whole', spec: 'tokens/fixture.spec.md' })), readSpec: (p) => (p.endsWith('tokens/fixture.spec.md') ? '| `--fixture-whole` | 1px |' : readSpecFromDisk(p)) })],
    ['C4', true, '--fixture-listed', '已知名單多出一筆(比 main 長)', () => run({ registry: (() => { const r = clone(registry); r.known.missingSpec.push('--fixture-listed'); return r })() })],
    ['C4', false, String(registry.known?.missingSpec?.[0] ?? '--none'), '已知名單裡的舊名字', () => run({})],
    // C5
    // 列高 2026-11-11 搬到 data-table.css(token「2甲」第四批);注入點跟著住處走(住處搬了還注入舊檔 = 沒改到東西,這條會變成假綠)
    ['C5', true, '--table-row-sm', '拿掉一顆的回復', () => run({ files: withFiles({ [DT]: files.get(DT).replace(/(\[data-density="md"\][^{]*\{[\s\S]*?)--table-row-sm:[^;]*;/, '$1') }) })],
    ['C5', true, '--tab-height-sm', '把覆寫放到另一個檔', () => run({ files: withFiles({ [`${DS_ROOT}/tokens/layoutSpace/layoutSpace.css`]: `${files.get(`${DS_ROOT}/tokens/layoutSpace/layoutSpace.css`)}\n[data-density="lg"] { --tab-height-sm: 2.5rem; }\n` }) })],
    ['C5', false, '--table-row-sm', '現況', () => run({})],
    // C6
    ['C6', true, 'components/FixtureOrphan/orphan.css', '假造一個沒被匯入的元件樣式檔', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureOrphan/orphan.css`]: '.x { color: red; }\n' }) })],
    ['C6', false, 'components/FixtureOrphan/orphan.css', '同一個檔被元件程式匯入', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureOrphan/orphan.css`]: '.x { color: red; }\n', [`${DS_ROOT}/components/FixtureOrphan/orphan.tsx`]: "import './orphan.css'\nexport const x = 1\n" }) })],
    // C7(審查案例 C:按鈕裡寫 --color-teal-6)
    ['C7', true, '--color-teal-6', '產品讀原料色', () => run({ files: withFiles({ 'apps/template/src/fixture-read.tsx': "export const c = 'text-[var(--color-teal-6)]'\n" }) })],
    ['C7', false, '--primary', '產品讀語意色', () => run({ files: withFiles({ 'apps/template/src/fixture-read.tsx': "export const c = 'text-[var(--primary)]'\n" }) })],
    ['C7', true, '--color-teal-6', '按鈕元件讀原料色', () => run({ files: withFiles({ [BTN]: "export const c = 'bg-[var(--color-teal-6)]'\n" }) })],
    ['C7', false, '--color-blue-6', '標籤(已點名)讀分類色', () => run({ files: withFiles({ [`${DS_ROOT}/components/Tag/fixture-raw.tsx`]: "export const c = 'bg-[var(--color-blue-6)]'\n" }) })],
    ['C7', true, '--field-height-md', '產品覆寫只開放讀的名字', () => run({ files: withFiles({ 'apps/template/src/fixture-write.tsx': "export const c = '[--field-height-md:40px]'\n" }) })],
    // C9(審查案例 E:在側欄加只有側欄自己讀的 --sidebar-section-gap)
    ...(() => {
      const css = `${DS_ROOT}/components/Sidebar/fixture.css`
      const reg = addRows(row({ match: '--sidebar-section-gap', owner: 'Sidebar', home: 'components/Sidebar/fixture.css', spec: 'components/Sidebar/sidebar.spec.md' }))
      const base = { [css]: ':root { --sidebar-section-gap: 8px; }\n', [`${DS_ROOT}/components/Sidebar/fixture.tsx`]: "import './fixture.css'\nexport const c = 'gap-[var(--sidebar-section-gap)]'\n" }
      return [
        ['C9', true, '--sidebar-section-gap', '只有主人自己讀、不切換的新值', () => run({ files: withFiles(base), registry: reg })],
        ['C9', true, '--sidebar-section-gap', '別的檔只在註解裡提到 → 仍然紅', () => run({ files: withFiles({ ...base, [`${DS_ROOT}/components/AppShell/fixture.tsx`]: '// 對齊 var(--sidebar-section-gap)\nexport const z = 1\n' }), registry: reg })],
        ['C9', false, '--sidebar-section-gap', '真的被別的資料夾讀', () => run({ files: withFiles({ ...base, [`${DS_ROOT}/components/AppShell/fixture.tsx`]: "export const z = 'gap-[var(--sidebar-section-gap)]'\n" }), registry: reg })],
      ]
    })(),
  ]
  let ok = true
  const baseline = run({})
  const baseCount = Object.values(baseline.problems).flat().length
  console.log(`${baseCount === 0 ? '✓' : '✗'} selftest 基準:現況 ${baseCount} 個問題(要 0)`)
  if (baseCount) { ok = false; for (const p of Object.values(baseline.problems).flat()) console.log(`    ${p}`) }
  for (const [check, expectRed, name, label, fn] of cases) {
    const { problems } = fn()
    const hits = problems[check].filter((p) => p.includes(name))
    const pass = expectRed ? hits.length > 0 : hits.length === 0
    console.log(`${pass ? '✓' : '✗'} ${check} ${expectRed ? '該紅' : '該綠'}:${label}(${name})${pass ? '' : ` —— 實得 ${problems[check].join(' / ') || '沒有問題'}`}`)
    if (!pass) ok = false
  }
  for (const k of Object.keys(LABEL)) {
    const reds = cases.filter((c) => c[0] === k && c[1]).length, greens = cases.filter((c) => c[0] === k && !c[1]).length
    if (!reds || !greens) { console.log(`✗ ${k} 對照組不完整(該紅 ${reds} 筆 / 該綠 ${greens} 筆;兩種都要有)`); ok = false }
  }
  console.log(ok ? '✓ 對照組:每一條各自在該紅的時候紅、該綠的時候綠(儀器有效)' : '✗ 對照組有一條沒照預期 —— 儀器無效')
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--selftest')) selftest()
  else main()
}

// 消費端升版改寫器 —— 讀變更帳本(../../ds-changes.json,隨 npm 出貨),不寫死任何規則。
//
// `qijenchen-ds-codemod upgrade [--from <版>]`:選出 from(不含)到已裝版(含)之間的帳本節,套用所有帶 fix 的條目
// (rename-prop〔可帶值對照〕/ rename-export / rename-token),再列出剩下的條目在消費端的使用處(檔:行、do、spec),
// 以及每條 behavior / default 影響到的使用處。有歧義的地方擋下不改(那個檔整個不動,列在報告裡)。
// 讀不到帳本或版本 = 儀器失效,不當成「沒有要改的」。
//
// 改寫一律走 TypeScript AST(JSX 屬性、import 綁定)與整個名字邊界的比對(CSS 變數、class);
// 每一處改寫都記成 proposal(檔案 before/after 雜湊 + 編輯清單 + digest),套用走 shared/safe-filesystem 的原子交易。
//
// 重跑防線:(1) 掃描範圍有未 commit 的檔就拒跑;(2) 起點版本只讀 git HEAD 的宣告;(3) 套用成功後在 .git/ 底下留戳記
// (from → to、範圍、改過的檔),同一組 from → to 在重疊範圍再跑就拒跑。三道都 --force 才放行。
// 已知限制:--root 不是 git repo 的最上層 / 不是 git repo 時拿不到 .git,第 (3) 道不存在,報告寫明「不要再跑第二次」。
// 任何一條規則丟錯 → 只把那個檔擋下(codemod-internal-error,整檔不改),其他檔與報告照常。

import { execFileSync } from 'node:child_process'
import { lstatSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import {
  SHA256_PATTERN,
  applyAtomicOperations,
  canonicalRoot,
  compareUtf8Bytes,
  exactKeys,
  portablePath,
  readStableFile,
  sha256,
  stableStringify,
} from '../shared/safe-filesystem.mjs'
import { compareVersions, entriesBetween, LEDGER_PACKAGE_PATH, ledgerShapeProblems, parseSpecRef, parseVersion } from '../changes/ledger.mjs'

export const CODEMOD_TOOL_VERSION = '2.0.0'
export const DS_PACKAGE_NAME = '@qijenchen/design-system'
const PROPOSAL_KIND = 'qijenchen-design-system-upgrade-proposal'
const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SCRIPT_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts', '.cjs', '.cts'])
const SOURCE_EXTENSIONS = new Set([...SCRIPT_EXTENSIONS, '.css'])
const EXCLUDED_DIRECTORIES = new Set([
  '.git', '.next', '.parcel-cache', '.turbo', '.visual-candidates', 'build', 'coverage', 'dist',
  'node_modules', 'storybook-static', 'tmp',
])
const fatalUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })

export class CodemodInstrumentError extends Error {}

function fail(message) {
  throw new Error(`design-system codemod blocked:${message}`)
}

const dsModule = (value) => value === DS_PACKAGE_NAME || value.startsWith(`${DS_PACKAGE_NAME}/`)
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function scriptKind(path) {
  const extension = extname(path).toLowerCase()
  if (extension === '.tsx') return ts.ScriptKind.TSX
  if (extension === '.jsx') return ts.ScriptKind.JSX
  if (['.js', '.mjs', '.cjs'].includes(extension)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function lineColumn(source, position) {
  let line = 1
  let last = -1
  for (let index = source.indexOf('\n'); index !== -1 && index < position; index = source.indexOf('\n', index + 1)) { line += 1; last = index }
  return { line, column: position - last }
}

// ── 帳本與版本 ─────────────────────────────────────────────────────────────────────
/** 已裝的 DS(本工具所在的那一包)的版本與帳本。讀不到 = 儀器失效。 */
export function readInstalledLedger(packageRoot = PACKAGE_ROOT) {
  let pkg
  try { pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) } catch (error) { throw new CodemodInstrumentError(`讀不到已裝 DS 的 package.json(${packageRoot}):${error.message}`) }
  if (pkg?.name !== DS_PACKAGE_NAME) throw new CodemodInstrumentError(`${packageRoot} 不是 ${DS_PACKAGE_NAME}(name = ${pkg?.name})`)
  try { parseVersion(pkg.version) } catch { throw new CodemodInstrumentError(`已裝 DS 的版本「${pkg.version}」不是 semver`) }
  let ledger
  const ledgerPath = join(packageRoot, LEDGER_PACKAGE_PATH)
  try { ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) } catch (error) { throw new CodemodInstrumentError(`讀不到變更帳本 ${ledgerPath}:${error.message}`) }
  const problems = ledgerShapeProblems(ledger)
  if (problems.length) throw new CodemodInstrumentError(`變更帳本形狀不對:${problems.slice(0, 3).join(';')}`)
  return { version: pkg.version, ledger, ledgerSha256: sha256(Buffer.from(stableStringify(ledger))), packageRoot }
}

function declaredVersion(manifest) {
  const raw = manifest?.dependencies?.[DS_PACKAGE_NAME] ?? manifest?.devDependencies?.[DS_PACKAGE_NAME]
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim().replace(/^[\^~=]/, '')
  try { parseVersion(cleaned); return cleaned } catch { return null }
}

/** 消費端 HEAD(最後一次 commit)的 package.json 宣告的 DS 版本;讀不到回 null */
export function committedVersion({ repoRoot, readGit = defaultReadGit }) {
  const text = readGit(repoRoot, ['show', 'HEAD:package.json'])
  if (text === null) return null
  try { return declaredVersion(JSON.parse(text)) } catch { return null }
}

/**
 * 升版的起點:--from 有給就用;沒給就讀消費端 HEAD 的 package.json 宣告的 DS 版本(升版流程是先 sync-all 改版號、還沒 commit,
 * 所以 HEAD 還是舊版)。HEAD 已經宣告已裝版 = 這次升版已經 commit 過,沒有要改的(回傳已裝版,選不到任何節)——
 * 不再往 main / origin/main 找舊版,否則 commit 之後重跑會把同一批改名再套一次(xs→sm 之後又 sm→md)。
 * 讀不到 HEAD 的宣告 = 儀器失效(請明給 --from),不猜。
 */
export function resolveFromVersion({ repoRoot, from = null, installed, readGit = defaultReadGit }) {
  if (from) {
    try { parseVersion(from) } catch { throw new CodemodInstrumentError(`--from「${from}」不是 semver 版本號`) }
    if (compareVersions(from, installed) > 0) throw new CodemodInstrumentError(`--from ${from} 比已裝的 ${installed} 還新`)
    return from.replace(/^v/, '')
  }
  const version = committedVersion({ repoRoot, readGit })
  if (!version) throw new CodemodInstrumentError(`讀不出升版前的 DS 版本(git HEAD 的 package.json 沒有宣告 ${DS_PACKAGE_NAME})—— 請明給 --from <升版前的版本>`)
  return compareVersions(version, installed) < 0 ? version : installed
}

/** 改寫範圍外的檔:升版流程先跑 sync-all 改版號與 lock,這些未 commit 的改動不擋 */
const UPGRADE_DIRTY_EXEMPT = new Set(['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'lock.json'])

// ── 重跑戳記(.git 底下,不會被 commit)────────────────────────────────────────────────
// 套用成功後在 .git/ 底下記下這次的 from → to、掃描範圍與改過的檔;同一組 from → to、範圍重疊的再跑 → 拒跑(--force 才跑)。
// 只看 git 狀態擋不住「src 已 commit、版號還沒 commit」:那時 src 乾淨、HEAD 仍宣告舊版,同一批改名會再套一次(xs→sm 又 sm→md)。
// 已知限制:--root 不是 git repo 的最上層(或根本不是 git repo)時拿不到 .git,不留戳記,只能靠「不要跑第二次」。
export const UPGRADE_STAMP_FILE = 'qijenchen-ds-codemod-upgrade.json'
const UPGRADE_STAMP_KIND = 'qijenchen-ds-codemod-upgrade-stamp'

/** --root 自己的 .git 目錄(--root 必須正好是 git 最上層;子資料夾 / 外層別的 repo 一律不算)。拿不到回 null。 */
export function upgradeStampPath({ repoRoot, readGit = defaultReadGit }) {
  const top = readGit(repoRoot, ['rev-parse', '--show-toplevel'])
  const dir = readGit(repoRoot, ['rev-parse', '--absolute-git-dir'])
  if (top === null || dir === null) return null
  const gitDir = dir.trim()
  if (!isAbsolute(gitDir)) return null
  try {
    if (realpathSync(top.trim()) !== realpathSync(resolve(repoRoot))) return null
    if (!lstatSync(gitDir).isDirectory()) return null
  } catch { return null }
  return join(gitDir, UPGRADE_STAMP_FILE)
}

function readUpgradeStamp(path) {
  let text
  try { text = readFileSync(path, 'utf8') } catch (error) { if (error?.code === 'ENOENT') return { runs: [] }; throw error }
  let stamp
  try { stamp = JSON.parse(text) } catch { fail(`upgrade stamp ${path} is not valid JSON — delete it or pass --force`) }
  if (stamp?.kind !== UPGRADE_STAMP_KIND || !Array.isArray(stamp.runs)) fail(`upgrade stamp ${path} has an unknown shape — delete it or pass --force`)
  return stamp
}

const rootsOverlap = (a, b) => a.some((x) => b.some((y) => x === '.' || y === '.' || x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)))

/** 套用成功後記一筆(同一組 from → to + 同一份範圍覆寫舊的那筆);拿不到 .git 回 false */
export function recordUpgradeStamp({ repoRoot, readGit = defaultReadGit, run }) {
  const path = upgradeStampPath({ repoRoot, readGit })
  if (!path) return false
  const stamp = readUpgradeStamp(path)
  const runs = stamp.runs.filter((r) => !(r.from === run.from && r.to === run.to && stableStringify(r.sourceRoots) === stableStringify(run.sourceRoots)))
  const next = { kind: UPGRADE_STAMP_KIND, schemaVersion: 1, runs: [...runs, run] }
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`)
  renameSync(temporary, path)
  return true
}

/**
 * 改寫前的安全檢查(Next.js codemod 同樣做法:工作區不乾淨就拒跑):掃描範圍內有未 commit 的檔 → 擋(同一批改名重套會連鎖);
 * --from 明給、但 HEAD 已宣告已裝版 → 擋(這次升版已經 commit 過);.git 裡的戳記記著同一組 from → to 已在重疊的範圍跑過 → 擋
 * (src 先 commit、版號還沒 commit 時,git 狀態看不出來)。force 才放行。不是 git repo = 證明不了乾淨 → 擋。
 */
export function upgradePreflight({ repoRoot, sourceRoots, from, installed, readGit = defaultReadGit, force = false }) {
  if (force) return
  const status = readGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...sourceRoots])
  if (status === null) fail('cannot read git status of the source roots (not a git repository?) — commit first, or pass --force')
  const dirty = status.split('\n').filter(Boolean).map((line) => line.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''))
    .filter((path) => !UPGRADE_DIRTY_EXEMPT.has(path.split('/').pop()))
  if (dirty.length) fail(`uncommitted changes in the source roots (${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ', …' : ''}) — commit or stash them first so a re-run cannot apply the same renames twice, or pass --force`)
  if (from) {
    const committed = committedVersion({ repoRoot, readGit })
    if (committed && compareVersions(committed, installed) >= 0) fail(`HEAD already declares ${DS_PACKAGE_NAME}@${committed}; --from ${from} would re-apply renames that are already committed — pass --force to do it anyway`)
  }
  const fromVersion = resolveFromVersion({ repoRoot, from, installed, readGit })
  if (fromVersion === installed) return
  const stampPath = upgradeStampPath({ repoRoot, readGit })
  if (!stampPath) return
  const roots = sourceRoots.map((item) => (item === '.' ? '.' : portablePath(item, 'codemod source root', fail)))
  const prior = readUpgradeStamp(stampPath).runs.find((r) => r.from === fromVersion && r.to === installed && Array.isArray(r.sourceRoots) && rootsOverlap(r.sourceRoots, roots))
  if (prior) fail(`this upgrade (${fromVersion} → ${installed}) already ran over ${prior.sourceRoots.join(', ')} (stamp ${stampPath}, ${prior.files?.length ?? 0} files changed); running it again would apply the same renames twice — if you reverted that run, pass --force`)
}

function defaultReadGit(cwd, args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null }
}

// ── 規則:帳本條目的 fix → 改寫表(跨節串接,同一節同時生效)───────────────────────────
/**
 * 依版本順序把各節的 fix 疊成一張表:後面的節把前面某條的 `to` 再改名時,前面那條直接接到最後的名字(A→B、B→C ⇒ A→C);
 * 同一節裡的規則同時生效、不互相串接(例:同一版 --radius-sm → --radius-md 與 --radius-xs → --radius-sm,xs 只到 sm)。
 */
export function buildRules(selected) {
  const props = new Map() // `${component}\0${from}` → { component, from, to, values, pxToNumber, ids }
  const exports = new Map()
  const tokens = new Map()
  const classes = new Map()
  const byVersion = new Map()
  for (const { version, entry } of selected) {
    if (!entry.fix) continue
    if (!byVersion.has(version)) byVersion.set(version, [])
    byVersion.get(version).push(entry)
  }
  const chainSimple = (map, additions) => {
    for (const [from, rule] of additions) {
      for (const prior of map.values()) if (prior.to === from) { prior.to = rule.to; prior.ids.push(...rule.ids) }
    }
    for (const [from, rule] of additions) {
      if (map.has(from) && map.get(from).to !== rule.to) fail(`ledger rename conflict for ${from}: ${map.get(from).to} vs ${rule.to}`)
      map.set(from, map.get(from) ? { ...map.get(from), ids: [...map.get(from).ids, ...rule.ids] } : rule)
    }
  }
  for (const entries of byVersion.values()) {
    const propAdds = new Map()
    const exportAdds = new Map()
    const tokenAdds = new Map()
    const classAdds = new Map()
    for (const entry of entries) {
      const fix = entry.fix
      if (fix.op === 'rename-prop') {
        for (const component of fix.components) {
          propAdds.set(`${component}\0${fix.from}`, {
            component, from: fix.from, to: fix.to, values: fix.values ?? null, pxToNumber: Boolean(fix.pxToNumber), ids: [entry.id],
          })
        }
      } else if (fix.op === 'rename-export') {
        exportAdds.set(fix.from, { to: fix.to, ids: [entry.id] })
      } else if (fix.op === 'rename-token') {
        tokenAdds.set(fix.from, { to: fix.to, ids: [entry.id] })
        if (fix.classes) {
          for (const prefix of fix.classes.prefixes) classAdds.set(`${prefix}-${fix.classes.from}`, { to: `${prefix}-${fix.classes.to}`, ids: [entry.id] })
        }
      }
    }
    for (const [key, rule] of propAdds) {
      for (const prior of props.values()) {
        if (prior.component !== rule.component || prior.to !== rule.from) continue
        // 前一條改到的名字這一節又改:名字接上;值對照疊起來(前一條的新值再經這一條的對照)
        prior.to = rule.to
        if (rule.values) {
          const composed = {}
          for (const [k, v] of Object.entries(prior.values ?? {})) composed[k] = Object.hasOwn(rule.values, String(v)) ? rule.values[String(v)] : v
          prior.values = { ...rule.values, ...composed }
        }
        prior.pxToNumber = prior.pxToNumber || rule.pxToNumber
        prior.ids.push(...rule.ids)
      }
      props.set(key, props.get(key) ? { ...props.get(key), ...rule, ids: [...props.get(key).ids, ...rule.ids] } : rule)
    }
    chainSimple(exports, exportAdds)
    chainSimple(tokens, tokenAdds)
    chainSimple(classes, classAdds)
  }
  return { props, exports, tokens, classes }
}

/** 名字邊界比對的正則(CSS 變數 / class;長的先比,避免前綴吃掉) */
function nameRegex(names) {
  const list = [...names].sort((a, b) => b.length - a.length).map(escapeRegExp)
  return list.length ? new RegExp(`(?<![\\w-])(?:${list.join('|')})(?![\\w-])`, 'g') : null
}

// ── 掃檔 ─────────────────────────────────────────────────────────────────────────
function scanSourceFiles(root, sourceRoots) {
  const found = []
  const visit = (relativePath) => {
    const absolute = resolve(root, relativePath)
    const entries = readdirSync(absolute, { withFileTypes: true })
      .sort((a, b) => compareUtf8Bytes(a.name, b.name))
    for (const entry of entries) {
      const child = relativePath === '.' ? entry.name : `${relativePath}/${entry.name}`
      if (entry.isSymbolicLink()) fail(`source traversal crosses a symbolic link:${child}`)
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) visit(child)
        continue
      }
      if (!entry.isFile()) fail(`source traversal found an unsupported filesystem entry:${child}`)
      if (SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) found.push(child)
    }
  }
  for (const sourceRoot of sourceRoots) {
    const read = readStableFileOrDirectory(root, sourceRoot)
    if (read === 'directory') visit(sourceRoot)
    else if (SOURCE_EXTENSIONS.has(extname(sourceRoot).toLowerCase())) found.push(sourceRoot)
    else fail(`source root file has an unsupported extension:${sourceRoot}`)
  }
  return [...new Set(found)].sort(compareUtf8Bytes)
}

function readStableFileOrDirectory(root, relativePath) {
  const absolute = resolve(root, relativePath)
  const rel = relative(root, absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`)) fail(`source root escapes repository:${relativePath}`)
  let cursor = root
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`source root crosses a symbolic link:${relativePath}`)
    if (cursor !== absolute && !info.isDirectory()) fail(`source root crosses a non-directory:${relativePath}`)
  }
  const info = lstatSync(absolute)
  if (info.isDirectory()) return 'directory'
  if (info.isFile() && info.nlink === 1) return 'file'
  fail(`source root must be a real directory or single-link regular file:${relativePath}`)
}

function renameLocations(fileName, source, position) {
  const snapshots = new Map([[fileName, ts.ScriptSnapshot.fromString(source)]])
  const host = {
    getCompilationSettings: () => ({
      allowJs: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ESNext, noResolve: true,
    }),
    getScriptFileNames: () => [fileName],
    getScriptVersion: () => '1',
    getScriptSnapshot: (path) => {
      if (snapshots.has(path)) return snapshots.get(path)
      const body = ts.sys.readFile(path)
      return body === undefined ? undefined : ts.ScriptSnapshot.fromString(body)
    },
    getCurrentDirectory: () => process.cwd(),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  }
  const service = ts.createLanguageService(host)
  try {
    return service.findRenameLocations(fileName, position, false, false, { providePrefixAndSuffixTextForRename: false }) ?? []
  } finally {
    service.dispose()
  }
}

// ── 使用處(剩下的條目要列到哪裡)────────────────────────────────────────────────────
/** 條目的 target → 消費端看得到的「元件 + 參數」(`DialogContentProps.maxWidth` → DialogContent / maxWidth;Labels → 元件的 labels) */
function componentTarget(entry) {
  if (!['prop', 'default', 'behavior'].includes(entry.surface)) return null
  const m = /^([A-Z][A-Za-z0-9]*?)(OwnProps|Props|Labels)?\.([A-Za-z_$][\w$]*)$/.exec(entry.target)
  // context 的值 / hook 回傳(XContext、XContextValue)與 ColumnMeta 這類型別成員不是 JSX 元件,找 <X …> 永遠找不到
  if (!m || /Context(Value)?$/.test(m[1]) || m[1] === 'ColumnMeta') return null
  if (entry.surface !== 'default' && !m[2] && entry.surface !== 'prop') return null
  return { component: m[1], prop: m[2] === 'Labels' ? 'labels' : m[3], member: m[3], labels: m[2] === 'Labels' }
}

// ── 單檔分析 ────────────────────────────────────────────────────────────────────────
function analyzeFile({ root, path, read, rules, watch }) {
  let source
  try {
    source = fatalUtf8.decode(read.bytes)
  } catch (error) {
    return { edits: [], blockers: [{ path, line: 1, column: 1, rule: 'utf8-source-required', message: error.message }], sites: [] }
  }
  const edits = []
  const blockers = []
  const sites = []
  const addEdit = (start, end, to, rule) => {
    const from = source.slice(start, end)
    edits.push({ start, end, ...lineColumn(source, start), from, to, rule })
  }
  const addBlocker = (position, rule, message) => blockers.push({ path, ...lineColumn(source, position), rule, message })
  const addSite = (position, id, note) => sites.push({ id, path, ...lineColumn(source, position), note })
  // 任何一條規則 / 使用處判斷丟錯:只把這個檔擋下(整檔不改),照常往下、照常出報告 —— 不讓一條規則把整次升版弄當
  const guarded = (position, label, run) => {
    try { run() } catch (error) { addBlocker(position, 'codemod-internal-error', `${label} 判斷時出錯(${error?.message ?? error}),這個檔沒改;請照帳本手動處理並回報 DS`) }
  }

  // CSS 變數與 class:整個名字邊界比對(CSS 檔與程式檔都適用;名字裡有連字號,不會是識別字)
  const tokenRe = nameRegex(rules.tokens.keys())
  const classRe = nameRegex(rules.classes.keys())
  for (const [re, map, kind] of [[tokenRe, rules.tokens, 'token'], [classRe, rules.classes, 'class']]) {
    if (!re) continue
    for (const m of source.matchAll(re)) {
      const rule = map.get(m[0])
      addEdit(m.index, m.index + m[0].length, rule.to, `${kind}:${rule.ids.join('+')}`)
    }
  }
  for (const { entry, pattern } of watch.text) {
    for (const m of source.matchAll(pattern)) addSite(m.index, entry.id, m[0])
  }

  if (SCRIPT_EXTENSIONS.has(extname(path).toLowerCase())) {
    const absolute = resolve(root, path)
    const sourceFile = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true, scriptKind(path))
    if (sourceFile.parseDiagnostics.length) {
      for (const diagnostic of sourceFile.parseDiagnostics) addBlocker(diagnostic.start ?? 0, 'syntax-error', ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
      return { edits: [], blockers, sites }
    }
    const directBindings = new Map() // local → imported
    const namespaces = new Set()
    const unaliasedExportRenames = []
    for (const statement of sourceFile.statements) {
      const spec = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null
      if (!spec || !dsModule(spec)) continue
      for (const { entry } of watch.modules.filter((w) => w.module === spec)) addSite(statement.getStart(sourceFile), entry.id, spec)
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const bindings = statement.importClause.namedBindings
        if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
        if (bindings && ts.isNamedImports(bindings)) {
          for (const specifier of bindings.elements) {
            const imported = (specifier.propertyName ?? specifier.name).text
            directBindings.set(specifier.name.text, imported)
            for (const { entry } of watch.exports.filter((w) => w.name === imported)) addSite(specifier.getStart(sourceFile), entry.id, imported)
            const rename = rules.exports.get(imported)
            if (!rename) continue
            if (specifier.propertyName) {
              const start = specifier.propertyName.getStart(sourceFile)
              addEdit(start, start + imported.length, rename.to, `export:${rename.ids.join('+')}`)
            } else {
              unaliasedExportRenames.push({ node: specifier.name, imported, rename })
            }
          }
        }
      }
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const specifier of statement.exportClause.elements) {
          const exported = (specifier.propertyName ?? specifier.name).text
          for (const { entry } of watch.exports.filter((w) => w.name === exported)) addSite(specifier.getStart(sourceFile), entry.id, exported)
          const rename = rules.exports.get(exported)
          if (!rename) continue
          if (specifier.propertyName) {
            const start = specifier.propertyName.getStart(sourceFile)
            addEdit(start, start + exported.length, rename.to, `export:${rename.ids.join('+')}`)
          } else {
            addBlocker(specifier.getStart(sourceFile), `export:${rename.ids.join('+')}`, `re-export of ${exported} changes this module's own public name; rename it manually (export { ${rename.to} as … })`)
          }
        }
      }
    }
    // 沒有別名的 import:檔內所有引用一起改名(TypeScript 的 rename 找出全部位置);新名字已存在 = 歧義
    for (const { node, imported, rename } of unaliasedExportRenames) {
      const clash = []
      const findClash = (candidate) => { if (ts.isIdentifier(candidate) && candidate.text === rename.to) clash.push(candidate); ts.forEachChild(candidate, findClash) }
      findClash(sourceFile)
      if (clash.length) { addBlocker(node.getStart(sourceFile), `export:${rename.ids.join('+')}`, `${rename.to} already exists in this file; rename ${imported} manually`); continue }
      const locations = renameLocations(absolute, source, node.getStart(sourceFile)).filter((row) => row.fileName === absolute)
      if (!locations.length) { addBlocker(node.getStart(sourceFile), `export:${rename.ids.join('+')}`, `TypeScript could not prove the ${imported} binding closure`); continue }
      for (const row of locations) {
        const { start, length } = row.textSpan
        if (source.slice(start, start + length) !== imported) { addBlocker(start, `export:${rename.ids.join('+')}`, `non-exact rename token for ${imported}`); continue }
        addEdit(start, start + length, rename.to, `export:${rename.ids.join('+')}`)
      }
    }
    const componentOf = (tag) => {
      if (ts.isIdentifier(tag)) return directBindings.get(tag.text) ?? null
      if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression) && namespaces.has(tag.expression.text)) return tag.name.text
      return null
    }
    const literalOf = (attribute) => {
      const init = attribute.initializer
      if (!init) return { key: 'true' }
      if (ts.isStringLiteral(init)) return { key: init.text, string: true }
      if (ts.isJsxExpression(init) && init.expression) {
        const e = init.expression
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { key: e.text, string: true }
        if (ts.isNumericLiteral(e)) return { key: String(Number(e.text)), number: true }
        if (e.kind === ts.SyntaxKind.TrueKeyword) return { key: 'true' }
        if (e.kind === ts.SyntaxKind.FalseKeyword) return { key: 'false' }
      }
      return null
    }
    const valueText = (value) => (typeof value === 'string' ? JSON.stringify(value) : `{${JSON.stringify(value)}}`)
    const visit = (node) => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && namespaces.has(node.expression.text)) {
        const rename = rules.exports.get(node.name.text)
        if (rename) addEdit(node.name.getStart(sourceFile), node.name.getEnd(), rename.to, `export:${rename.ids.join('+')}`)
      }
      if (ts.isQualifiedName(node) && ts.isIdentifier(node.left) && namespaces.has(node.left.text)) {
        const rename = rules.exports.get(node.right.text)
        if (rename) addEdit(node.right.getStart(sourceFile), node.right.getEnd(), rename.to, `export:${rename.ids.join('+')}`)
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const component = componentOf(node.tagName)
        if (component) {
          const attributes = node.attributes.properties
          const named = (name) => attributes.find((a) => ts.isJsxAttribute(a) && a.name.getText(sourceFile) === name)
          const spread = attributes.some((a) => ts.isJsxSpreadAttribute(a))
          // 升版後真的會帶著 prop 的那個屬性:本來就寫 prop,或同一次升版會改名成 prop 的舊參數(例:maxWidth → width);
          // 舊參數的值對照是「拿掉屬性」(autoWidth={false} → 不寫)的,升版後就沒有 prop,不算
          const carrierOf = (prop) => named(prop) ?? [...rules.props.values()]
            .filter((rule) => rule.component === component && rule.to === prop && rule.from !== prop)
            .map((rule) => {
              const old = named(rule.from)
              if (!old) return null
              const literal = literalOf(old)
              return literal && rule.values && Object.hasOwn(rule.values, literal.key) && rule.values[literal.key] === null ? null : old
            })
            .find(Boolean)
          for (const w of watch.components.filter((x) => x.component === component)) {
            guarded(node.getStart(sourceFile), `條目 ${w.entry.id}`, () => {
              const carrier = carrierOf(w.prop)
              if (w.mode === 'present' && carrier) addSite(carrier.getStart(sourceFile), w.entry.id, `<${component} ${carrier.name.getText(sourceFile) === w.prop ? w.prop : `${carrier.name.getText(sourceFile)}(升版後是 ${w.prop})`}>`)
              else if (w.mode === 'absent' && !carrier) addSite(node.getStart(sourceFile), w.entry.id, `<${component}>(沒傳 ${w.prop})`)
              else if (w.mode === 'any') addSite(node.getStart(sourceFile), w.entry.id, `<${component}>`)
            })
          }
          const applyPropRule = (rule) => {
            const old = named(rule.from)
            const tag = `prop:${rule.ids.join('+')}`
            if (!old) {
              if (spread && rule.from !== rule.to) addSite(node.getStart(sourceFile), rule.ids[0], `<${component} {...spread}> 可能帶著舊參數 ${rule.from},要確認`)
              return
            }
            if (rule.from !== rule.to && named(rule.to)) { addBlocker(old.getStart(sourceFile), tag, `<${component}> has both ${rule.from} and ${rule.to}`); return }
            const literal = literalOf(old)
            const mapped = rule.values ?? {}
            let next
            if (!literal) {
              if (rule.values || rule.pxToNumber) {
                if (rule.from === rule.to) { addSite(old.getStart(sourceFile), rule.ids[0], `<${component} ${rule.from}={…}> 動態值,要確認不是舊值`); return }
                addBlocker(old.getStart(sourceFile), tag, `<${component} ${rule.from}={…}> is a dynamic value; map it to ${rule.to} manually (${Object.entries(mapped).map(([k, v]) => `${k} → ${v}`).join(', ') || 'px string → number'})`)
                return
              }
              next = `${rule.to}${old.initializer ? `=${old.initializer.getText(sourceFile)}` : ''}`
            } else if (Object.hasOwn(mapped, literal.key)) {
              const value = mapped[literal.key]
              if (value === null) { addEdit(old.getFullStart(), old.getEnd(), '', tag); return }
              next = `${rule.to}=${valueText(value)}`
            } else if (rule.pxToNumber && literal.string && /^\d+(?:\.\d+)?px$/.test(literal.key)) {
              next = `${rule.to}={${Number(literal.key.slice(0, -2))}}`
            } else if (rule.from === rule.to) {
              return
            } else if ((rule.values || rule.pxToNumber) && !literal.number) {
              addBlocker(old.getStart(sourceFile), tag, `<${component} ${rule.from}=${literal.key}> has no mechanical mapping to ${rule.to}; rewrite it manually`)
              return
            } else {
              next = `${rule.to}${old.initializer ? `=${old.initializer.getText(sourceFile)}` : ''}`
            }
            addEdit(old.getStart(sourceFile), old.getEnd(), next, tag)
          }
          for (const rule of rules.props.values()) {
            if (rule.component !== component) continue
            guarded(node.getStart(sourceFile), `規則 ${rule.ids.join('+')}`, () => applyPropRule(rule))
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  const unique = [...new Map(edits.map((edit) => [`${edit.start}:${edit.end}:${edit.to}`, edit])).values()]
    .sort((a, b) => a.start - b.start || a.end - b.end)
  for (let index = 1; index < unique.length; index += 1) {
    if (unique[index].start < unique[index - 1].end) addBlocker(unique[index].start, 'overlapping-transform', 'two transforms overlap and cannot be applied safely')
  }
  // 有歧義的檔整個不改(不留半套)
  if (blockers.length) return { edits: [], blockers, sites }
  return { edits: unique, blockers: [], sites }
}

function applyTextEdits(source, edits, path) {
  let output = source
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (output.slice(edit.start, edit.end) !== edit.from) fail(`${path}: planned token no longer matches ${edit.rule}`)
    output = `${output.slice(0, edit.start)}${edit.to}${output.slice(edit.end)}`
  }
  return output
}

/** 剩下的條目要在消費端找哪些地方(沒有 fix 的條目,與 behavior / default 影響到的使用處) */
export function watchList(selected) {
  const watch = { exports: [], modules: [], components: [], text: [] }
  for (const { entry } of selected) {
    if (entry.surface === 'export') watch.exports.push({ entry, name: entry.target })
    else if (entry.surface === 'subpath') watch.modules.push({ entry, module: `${DS_PACKAGE_NAME}${entry.target.slice(1)}` })
    else if (entry.surface === 'token' || entry.surface === 'class') watch.text.push({ entry, pattern: nameRegex([entry.target]) })
    else {
      const t = componentTarget(entry)
      if (t) {
        // 改必填 / 預設值:沒傳的那些地方受影響;其餘(移除、收窄、行為):有傳的那些地方
        watch.components.push({ entry, component: t.component, prop: t.prop, mode: entry.change === 'required' || entry.surface === 'default' ? 'absent' : 'present' })
      }
      // 其餘(context 值、hook 回傳、型別成員、規則):機器找不到使用處,報告寫「只能人工查」,不用名字去全文比對(會把每一行 `border:` 都列進來)
    }
  }
  return watch
}

// ── proposal ──────────────────────────────────────────────────────────────────────
export function codemodProposalDigest(proposal) {
  const projection = structuredClone(proposal)
  delete projection.proposalDigest
  return sha256(stableStringify(projection))
}

function compareRows(left, right) {
  return compareUtf8Bytes(left.path, right.path) || left.line - right.line || left.column - right.column
    || compareUtf8Bytes(left.rule ?? left.id, right.rule ?? right.id) || compareUtf8Bytes(left.message ?? left.note, right.message ?? right.note)
}

/**
 * 規劃升版:from(不含)到已裝版(含)之間的帳本節 → 改寫 proposal(不寫檔)。
 * installed = readInstalledLedger() 的結果(測試可注入合成的套件)。
 */
export function planCodemod({ repoRoot = process.cwd(), sourceRoots = ['.'], from = null, installed = null, readGit } = {}) {
  const pkg = installed ?? readInstalledLedger()
  const root = canonicalRoot(repoRoot, 'codemod repository root', fail)
  const fromVersion = resolveFromVersion({ repoRoot: root, from, installed: pkg.version, readGit })
  const selected = entriesBetween(pkg.ledger, { from: fromVersion, to: pkg.version })
  const rules = buildRules(selected)
  const watch = watchList(selected.filter(({ entry }) => !entry.fix || entry.change === 'behavior' || entry.surface === 'default'))
  const roots = [...new Set(sourceRoots.map((item) => item === '.' ? '.' : portablePath(item, 'codemod source root', fail)))]
    .sort(compareUtf8Bytes)
  const paths = scanSourceFiles(root, roots)
  const inventory = []
  const files = []
  const blockers = []
  const sites = []
  for (const path of paths) {
    const read = readStableFile(root, path, `codemod source ${path}`, fail)
    inventory.push({ path, sha256: read.sha256, bytes: read.size, mode: read.mode })
    let result
    try {
      result = analyzeFile({ root, path, read, rules, watch })
    } catch (error) {
      // 最後一道:分析這個檔時任何沒接住的錯 → 這個檔擋下不改,其餘檔照常、照常出報告
      result = { edits: [], sites: [], blockers: [{ path, line: 1, column: 1, rule: 'codemod-internal-error', message: `分析這個檔時出錯(${error?.message ?? error}),這個檔沒改;請照帳本手動處理並回報 DS` }] }
    }
    blockers.push(...result.blockers)
    sites.push(...result.sites)
    if (!result.edits.length) continue
    const source = fatalUtf8.decode(read.bytes)
    const output = applyTextEdits(source, result.edits, path)
    const bytes = Buffer.from(output, 'utf8')
    files.push({
      path, beforeSha256: read.sha256, afterSha256: sha256(bytes), beforeBytes: read.size, afterBytes: bytes.length, mode: read.mode,
      edits: result.edits,
    })
  }
  const entries = selected.map(({ version, entry }) => ({
    version, id: entry.id, surface: entry.surface, target: entry.target, change: entry.change, to: entry.to ?? null,
    fix: entry.fix ? entry.fix.op : null, do: entry.do, spec: entry.spec, corrected: entry.corrected ?? [],
  }))
  const proposal = {
    schemaVersion: 2,
    kind: PROPOSAL_KIND,
    toolVersion: CODEMOD_TOOL_VERSION,
    typescriptVersion: ts.version,
    from: fromVersion,
    to: pkg.version,
    ledgerSha256: pkg.ledgerSha256,
    sourceRoots: roots,
    entries,
    inventory,
    files,
    blockers: blockers.sort(compareRows),
    sites: sites.sort(compareRows),
    proposalDigest: '',
  }
  proposal.proposalDigest = codemodProposalDigest(proposal)
  validateCodemodProposal(proposal)
  return proposal
}

export function validateCodemodProposal(proposal) {
  exactKeys(proposal, ['schemaVersion', 'kind', 'toolVersion', 'typescriptVersion', 'from', 'to', 'ledgerSha256', 'sourceRoots', 'entries', 'inventory', 'files', 'blockers', 'sites', 'proposalDigest'], 'codemod proposal', fail)
  if (proposal.schemaVersion !== 2 || proposal.kind !== PROPOSAL_KIND || proposal.toolVersion !== CODEMOD_TOOL_VERSION
    || proposal.typescriptVersion !== ts.version || !SHA256_PATTERN.test(proposal.ledgerSha256 ?? '') || !SHA256_PATTERN.test(proposal.proposalDigest)
    || proposal.proposalDigest !== codemodProposalDigest(proposal)) fail('codemod proposal identity or digest is invalid')
  if (!Array.isArray(proposal.sourceRoots) || !proposal.sourceRoots.length
    || stableStringify(proposal.sourceRoots) !== stableStringify([...new Set(proposal.sourceRoots)].sort(compareUtf8Bytes))) fail('codemod sourceRoots are not a sorted closed set')
  proposal.sourceRoots.forEach((path) => { if (path !== '.') portablePath(path, 'codemod sourceRoot', fail) })
  for (const key of ['entries', 'inventory', 'files', 'blockers', 'sites']) if (!Array.isArray(proposal[key])) fail(`codemod proposal ${key} is missing`)
  const inventoryPaths = []
  for (const row of proposal.inventory) {
    exactKeys(row, ['path', 'sha256', 'bytes', 'mode'], 'codemod inventory row', fail)
    portablePath(row.path, 'codemod inventory path', fail)
    if (!SHA256_PATTERN.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0
      || !Number.isInteger(row.mode) || row.mode < 0 || row.mode > 0o777) fail(`codemod inventory row is invalid:${row.path}`)
    inventoryPaths.push(row.path)
  }
  if (stableStringify(inventoryPaths) !== stableStringify([...new Set(inventoryPaths)].sort(compareUtf8Bytes))) fail('codemod inventory paths are not unique and sorted')
  const plannedPaths = []
  for (const row of proposal.files) {
    exactKeys(row, ['path', 'beforeSha256', 'afterSha256', 'beforeBytes', 'afterBytes', 'mode', 'edits'], 'codemod file row', fail)
    portablePath(row.path, 'codemod file path', fail)
    if (!inventoryPaths.includes(row.path) || !SHA256_PATTERN.test(row.beforeSha256) || !SHA256_PATTERN.test(row.afterSha256)
      || row.beforeSha256 === row.afterSha256 || !Number.isSafeInteger(row.beforeBytes) || row.beforeBytes < 0
      || !Number.isSafeInteger(row.afterBytes) || row.afterBytes < 0 || !Number.isInteger(row.mode)
      || !Array.isArray(row.edits) || !row.edits.length) fail(`codemod file row is invalid:${row.path}`)
    plannedPaths.push(row.path)
    let priorEnd = -1
    for (const edit of row.edits) {
      exactKeys(edit, ['start', 'end', 'line', 'column', 'from', 'to', 'rule'], 'codemod edit', fail)
      if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < priorEnd || edit.end <= edit.start
        || !Number.isSafeInteger(edit.line) || edit.line < 1 || !Number.isSafeInteger(edit.column) || edit.column < 1
        || typeof edit.from !== 'string' || !edit.from || typeof edit.to !== 'string' || typeof edit.rule !== 'string' || !edit.rule) {
        fail(`codemod edit is invalid:${row.path}`)
      }
      priorEnd = edit.end
    }
  }
  if (stableStringify(plannedPaths) !== stableStringify([...new Set(plannedPaths)].sort(compareUtf8Bytes))) fail('codemod file paths are not unique and sorted')
  for (const blocker of proposal.blockers) {
    exactKeys(blocker, ['path', 'line', 'column', 'rule', 'message'], 'codemod blocker', fail)
    portablePath(blocker.path, 'codemod blocker path', fail)
    if (plannedPaths.includes(blocker.path)) fail(`codemod blocker file also has planned edits:${blocker.path}`)
  }
  if (stableStringify(proposal.blockers) !== stableStringify([...proposal.blockers].sort(compareRows))) fail('codemod blockers are not canonically sorted')
  for (const site of proposal.sites) exactKeys(site, ['id', 'path', 'line', 'column', 'note'], 'codemod site', fail)
  return true
}

function currentCodemodState({ root, proposal }) {
  const actualPaths = scanSourceFiles(root, proposal.sourceRoots)
  const expectedPaths = proposal.inventory.map((row) => row.path)
  if (stableStringify(actualPaths) !== stableStringify(expectedPaths)) fail('codemod source inventory gained, lost, or renamed a file after planning')
  const planned = new Map(proposal.files.map((row) => [row.path, row]))
  const states = []
  for (const expected of proposal.inventory) {
    const read = readStableFile(root, expected.path, `codemod check ${expected.path}`, fail)
    const change = planned.get(expected.path)
    if (!change) {
      if (read.sha256 !== expected.sha256 || read.size !== expected.bytes || read.mode !== expected.mode) fail(`unplanned source changed after codemod planning:${expected.path}`)
      continue
    }
    if (read.sha256 === change.beforeSha256 && read.size === change.beforeBytes) states.push('pending')
    else if (read.sha256 === change.afterSha256 && read.size === change.afterBytes) states.push('applied')
    else fail(`planned source has neither the before nor after image:${expected.path}`)
    if (read.mode !== change.mode) fail(`planned source mode changed:${expected.path}`)
  }
  if (new Set(states).size > 1) fail('codemod proposal is partially applied')
  return states[0] ?? 'no-changes'
}

export function checkCodemodProposal({ repoRoot = process.cwd(), proposal } = {}) {
  validateCodemodProposal(proposal)
  const root = canonicalRoot(repoRoot, 'codemod repository root', fail)
  const state = currentCodemodState({ root, proposal })
  if (state === 'pending') fail('codemod migration is planned but not applied')
  return { proposalDigest: proposal.proposalDigest, state, files: proposal.files.length, blockers: proposal.blockers.length }
}

/** 套用 proposal 裡規劃好的檔(有歧義的檔本來就沒有編輯,不動)。原子交易:全有或全無。 */
export function applyCodemodProposal({ repoRoot = process.cwd(), proposal, expectedProposalDigest, beforePublish = null } = {}) {
  validateCodemodProposal(proposal)
  if (!SHA256_PATTERN.test(expectedProposalDigest ?? '') || expectedProposalDigest !== proposal.proposalDigest) fail('explicit expected proposal digest is missing or mismatched')
  const root = canonicalRoot(repoRoot, 'codemod repository root', fail)
  const state = currentCodemodState({ root, proposal })
  if (state === 'applied' || state === 'no-changes') return { proposalDigest: proposal.proposalDigest, state, changed: 0 }
  const operations = proposal.files.map((row) => {
    const read = readStableFile(root, row.path, `codemod materialization ${row.path}`, fail)
    let source
    try { source = fatalUtf8.decode(read.bytes) } catch (error) { fail(`${row.path} is no longer valid UTF-8:${error.message}`) }
    const output = applyTextEdits(source, row.edits, row.path)
    const afterBytes = Buffer.from(output, 'utf8')
    if (sha256(afterBytes) !== row.afterSha256 || afterBytes.length !== row.afterBytes) fail(`codemod materialization differs from proposal:${row.path}`)
    return { action: 'replace', path: row.path, beforeSha256: row.beforeSha256, beforeMode: row.mode, afterSha256: row.afterSha256, afterBytes, mode: row.mode }
  })
  const result = applyAtomicOperations({ root, operations, fail, lockName: '.qijenchen-ds-codemod.lock', beforePublish })
  const checked = currentCodemodState({ root, proposal })
  if (checked !== 'applied') fail('codemod atomic readback did not reach the applied state')
  return { proposalDigest: proposal.proposalDigest, state: checked, changed: result.changed }
}

// ── 報告(markdown,給消費端的 AI 讀)────────────────────────────────────────────────
const CHANGE_LABEL = Object.freeze({ removed: '移除', renamed: '改名', required: '改必填', narrowed: '收窄', default: '預設值', behavior: '行為', rule: '規則' })

export function renderUpgradeReport(proposal, { applied = false } = {}) {
  const specPath = (spec) => {
    const ref = parseSpecRef(spec)
    return ref ? `node_modules/${DS_PACKAGE_NAME}/${ref.path}「${ref.section}」` : spec
  }
  const editCount = proposal.files.reduce((n, f) => n + f.edits.length, 0)
  const sitesById = new Map()
  const addSite = (id, site) => {
    if (!sitesById.has(id)) sitesById.set(id, [])
    sitesById.get(id).push(site)
  }
  for (const site of proposal.sites) addSite(site.id, site)
  // 擋下的地方也是那一條的使用處(要手改的就是它們)
  for (const b of proposal.blockers) {
    for (const e of proposal.entries) if (b.rule.includes(e.id)) addSite(e.id, { path: b.path, line: b.line, note: `擋下:${b.message}` })
  }
  /** 同一個檔的使用處併成一行(檔:行, 行, …),每一處都列、不截斷 */
  const siteLines = (sites) => {
    const byPath = new Map()
    for (const site of sites) {
      if (!byPath.has(site.path)) byPath.set(site.path, [])
      byPath.get(site.path).push(site)
    }
    return [...byPath].map(([path, list]) => {
      const notes = [...new Set(list.map((x) => x.note))]
      return `- \`${path}\`:${list.map((x) => x.line).join(', ')}${notes.length === 1 ? ` —— ${notes[0]}` : ` —— ${notes.join(';')}`}`
    })
  }
  const arrow = (e) => (e.to && e.to !== e.target ? ` → \`${e.to}\`` : e.to === e.target ? '(名字照用)' : '')
  const head = (e) => `\`${e.id}\` ${CHANGE_LABEL[e.change] ?? e.change} \`${e.target}\`${arrow(e)}`
  const ruleHas = (rule, id) => rule.split(/[:+]/).includes(id)
  // 每一條的狀態:已自動改 N 處 / 擋下 / 可能經由 spread 帶入 / 要人工處理 K 處 / 0 處 / 只能人工查
  const statusOf = (e) => {
    const edits = proposal.files.reduce((n, f) => n + f.edits.filter((x) => ruleHas(x.rule, e.id)).length, 0)
    const blocked = proposal.blockers.filter((b) => ruleHas(b.rule, e.id)).length
    const spread = proposal.sites.filter((x) => x.id === e.id && x.note.includes('spread')).length
    const manual = proposal.sites.filter((x) => x.id === e.id && !x.note.includes('spread')).length
    const findable = ['export', 'subpath', 'token', 'class'].includes(e.surface) || Boolean(componentTarget(e))
    const parts = []
    if (edits) parts.push(`已自動改 ${edits} 處`)
    if (blocked) parts.push(`擋下 ${blocked} 處(要人工)`)
    if (spread) parts.push(`可能經由 spread 帶入 ${spread} 處(要確認)`)
    if (manual) parts.push(`要人工處理 / 確認 ${manual} 處`)
    if (!parts.length) parts.push(findable ? '0 處(掃描範圍內沒用到)' : '這類只能人工查(context 值、hook 回傳、型別成員或規則,機器找不到使用處)')
    return { text: parts.join(';'), detail: blocked + spread + manual > 0 || !findable }
  }
  const statuses = new Map(proposal.entries.map((e) => [e.id, statusOf(e)]))
  const lines = [
    `# DS 升版:${proposal.from} → ${proposal.to}`,
    '',
    `帳本:node_modules/${DS_PACKAGE_NAME}/${LEDGER_PACKAGE_PATH}(${proposal.from} 之後到 ${proposal.to} 的 ${proposal.entries.length} 條;規則一律以套件裡的規格為準)。`,
    ...proposal.entries.filter((e) => e.corrected.length).map((e) => `勘誤已套用:\`${e.id}\`(${e.corrected.join('、')})`),
    '',
    `## 條目一覽(${proposal.entries.length} 條,每一條都列)`,
    '',
    ...(proposal.entries.length ? proposal.entries.map((e) => `- ${head(e)}:${statuses.get(e.id).text}`) : ['(這個範圍沒有條目)']),
    '',
    `## 已自動改(${editCount} 處,${proposal.files.length} 個檔${applied ? '' : ',尚未套用'})`,
    '',
    ...(proposal.files.length ? proposal.files.flatMap((f) => f.edits.map((e) => `- \`${f.path}:${e.line}\` ${e.rule}:\`${e.from}\` → \`${e.to || '(拿掉)'}\``)) : ['(沒有)']),
    '',
    `## 擋下沒改(有歧義,${proposal.blockers.length} 處;這些檔整個沒動)`,
    '',
    ...(proposal.blockers.length ? proposal.blockers.map((b) => `- \`${b.path}:${b.line}\` ${b.rule}:${b.message}`) : ['(沒有)']),
    '',
    '## 要人工處理 / 確認的(逐條:做法、規格、使用處)',
    '',
  ]
  const detailed = proposal.entries.filter((e) => statuses.get(e.id).detail)
  if (!detailed.length) lines.push('(沒有)', '')
  for (const e of detailed) {
    lines.push(`### ${head(e)}`, '', `${e.do}`, '', `規格:${specPath(e.spec)}`, '')
    const sites = sitesById.get(e.id) ?? []
    lines.push(...(sites.length ? siteLines(sites) : ['- 這類只能人工查:照做法在程式裡找用到它的地方(型別檢查、lint:imports 與 governance:check 會指出一部分)']), '')
  }
  lines.push('## 完成條件', '', '依序跑 typecheck、lint:imports、governance:check、build,全綠才算升版完成;behavior / 預設值條目逐條在 PR 說明寫「接受新行為」或「已調整」。', '')
  return lines.join('\n')
}

/** 一次做完:規劃 → 套用(沒有歧義的檔)→ 報告。dryRun = 只規劃不寫檔。 */
export function upgradeConsumer({ repoRoot = process.cwd(), sourceRoots = ['.'], from = null, installed = null, readGit, dryRun = false, force = false } = {}) {
  const pkg = installed ?? readInstalledLedger()
  if (!dryRun) upgradePreflight({ repoRoot, sourceRoots, from, installed: pkg.version, readGit, force })
  const proposal = planCodemod({ repoRoot, sourceRoots, from, installed: pkg, readGit })
  let applied = false
  let stamped = false
  if (!dryRun && proposal.files.length) {
    applyCodemodProposal({ repoRoot, proposal, expectedProposalDigest: proposal.proposalDigest })
    applied = true
    stamped = recordUpgradeStamp({ repoRoot, readGit, run: { from: proposal.from, to: proposal.to, sourceRoots: proposal.sourceRoots, files: proposal.files.map((f) => f.path) } })
  }
  let report = renderUpgradeReport(proposal, { applied })
  if (applied && !stamped) report += '\n> 注意:--root 不是 git repo 的最上層,沒有留下重跑戳記 —— 這次升版不要再跑第二次(同一批改名會再套一次)。\n'
  return { proposal, applied, stamped, report }
}


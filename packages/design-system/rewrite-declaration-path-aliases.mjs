#!/usr/bin/env node
// rewrite-declaration-path-aliases.mjs — `build:dts` 的第二步:把 `tsc -p` 產出的宣告檔(.d.ts)裡的
// tsconfig `paths` 別名改寫成相對路徑。
//
// 為什麼需要:tsc 輸出宣告檔時,module specifier 一律照原始碼字面保留(TypeScript 刻意不改寫 `paths`),
// 所以 `@/design-system/...` 會原封不動進 dist;consumer 那邊沒有這個別名,型別就斷鏈
// (README「beta.6 以前 .d.ts 有 `@/` alias leak」就是這一類)。
// 2026-10-07 起取代 tsc-alias:它的每一版都依賴 chokidar 3 / globby 11 → micromatch → braces,
// 而 braces 的 GHSA-vfj7-8cjw-p6xm 沒有任何修正版,安裝閘(GOV-DEPENDENCY-BOOTSTRAP-001)因此全紅。
//
// 單一來源:別名表、rootDir、outDir / declarationDir 全部經 TypeScript API 從 tsconfig 讀(含 extends),
// 本檔不寫死任何一條別名;模組解析也用 TypeScript 自己的 resolveModuleName,與 tsc 編譯時同一套規則。
//
// 改寫範圍(以語法樹定位,不是對整份檔案做文字取代):
//   - import / export … from "…"、import x = require("…")、型別位置的 import("…")、declare module "…"
//   - 註解(含 JSDoc)裡同形狀的寫法:from "…"、import "…"、import("…")、require("…")、module "…"
//     —— 文件範例裡的別名同樣會漏給 consumer;舊管線(tsc-alias,文字比對)也改寫這些位置,
//     維持這一點才能讓輸出與舊管線逐位元相同。因此**註解裡的別名也必須解析得到**:
//     範例寫了一個已不存在的模組,建置就紅(請修正或刪掉該範例),不會默默留一條斷掉的路徑給 consumer。
//   - triple-slash reference 若出現別名一律判失敗:TypeScript 不對 reference 套用 `paths`,
//     原始碼裡這樣寫本身就是錯的,本工具不猜它的意思。
//
// 改寫公式:別名前綴換成「TypeScript 實際採用的那個 `paths` 目標資料夾在輸出樹中的位置」相對於
// 該宣告檔所在資料夾的路徑,其餘字面原樣保留。例:dist/components/Button/x.d.ts 裡的
// `@/design-system/components/Avatar/avatar` → `../../components/Avatar/avatar`。
// 一個別名有多個目標時,照 TypeScript 的規則依陣列順序逐一嘗試、取第一個解析得到的(不是第一個
// 「資料夾包含該檔」的 —— 兩者在目標彼此巢狀時會不同)。改寫後的路徑會再用 TypeScript 從該宣告檔
// 解析一次,必須落在「別名原本解析到的那個原始檔」的宣告輸出上,否則判失敗。
//
// 「哪些檔有宣告輸出」以 tsc 實際編譯的程式為準(ts.createProgram 的檔案集合),不是 tsconfig 列出的
// 起點(include / exclude):被 exclude、但被別的檔 import 進來的檔,tsc 照樣會編、照樣產出宣告。
//
// 失敗一律大聲失敗(exit 1,逐筆列出 檔案:行),而且整批不寫入任何檔案:
//   - 符合別名卻解析不到(含註解裡的範例;別名指向 CSS 等非 TypeScript 資源時另有明確訊息)
//   - 解析結果不是 tsc 這次編譯的檔、或 tsc 不為它產出宣告(例如 JSON 模組)、或其宣告輸出不存在
//   - 解析結果對不上任何 `paths` 目標(例如經 baseUrl 退路解析到別處)
//   - 改寫後的相對路徑解析不到同一個宣告檔
//   - 非相對 specifier 經 baseUrl 解析進原始碼樹(不是 `paths` 別名,本工具不猜)
//   - 第一段與別名相同卻對不上任何 `paths` 的 specifier(打錯字的別名)
//   - 不支援的 `paths` 形狀(萬用字元前後不是完整路徑段、萬用字元後還有字尾、沒有萬用字元)
//   - 別名目標在 rootDir 之外
//   - 程式的宣告輸出不存在(沒先跑 tsc -p)
//   - specifier 字面含跳脫字元(無法逐字改寫)
//
// 用法:node rewrite-declaration-path-aliases.mjs -p tsconfig.json [--check]
//   --check:只檢查不寫入;只要還有任何別名要改寫或任何違規就 exit 1。這就是「dist 不殘留別名」的
//   後置條件:對建好的 dist 再跑一次,改寫數必須是 0(scripts/test-rewrite-declaration-path-aliases.mjs)。

import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const DECLARATION_FILE = /\.d\.[cm]?ts$/
// 註解裡的 specifier 形狀;與 tsc-alias 認得的語句形狀一致(函式呼叫 / 副作用 import / from / module)。
const COMMENT_SPECIFIER =
  /\b(?:(?:import|require)\s*\(\s*(?:\/\*.*?\*\/\s*)?(?<callQuote>['"])(?<callPath>[^'"\r\n]+)\k<callQuote>\s*\)|(?:import|from)\s*(?<stmtQuote>['"])(?<stmtPath>[^'"\r\n]+)\k<stmtQuote>|module\s+(?<modQuote>['"])(?<modPath>[^'"\r\n]+)\k<modQuote>)/dg

export class DeclarationPathAliasError extends Error {
  constructor(violations) {
    super(`rewrite-declaration-path-aliases: ${violations.length} violation(s)\n${violations.map((line) => `  - ${line}`).join('\n')}`)
    this.name = 'DeclarationPathAliasError'
    this.violations = violations
  }
}

const toPosix = (value) => value.split(path.sep).join('/')
const isRelativeSpecifier = (text) => text === '.' || text === '..' || text.startsWith('./') || text.startsWith('../')
const isWithin = (directory, file) => {
  const relative = path.relative(directory, file)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}
const firstSegment = (text) => text.split('/')[0]

function formatDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('; ')
}

// 讀 tsconfig(含 extends),把 `paths` 轉成「別名前綴 → 原始碼資料夾 → 輸出資料夾」的對照。
function loadProject(project) {
  const requested = path.resolve(project)
  if (!existsSync(requested)) throw new DeclarationPathAliasError([`tsconfig not found: ${requested}`])
  const configPath = realpathSync(requested)
  const configDiagnostics = []
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => configDiagnostics.push(diagnostic),
  })
  if (!parsed || configDiagnostics.length > 0 || parsed.errors.length > 0) {
    throw new DeclarationPathAliasError([`cannot read ${configPath}: ${formatDiagnostics([...configDiagnostics, ...(parsed?.errors ?? [])])}`])
  }
  const { options } = parsed
  const problems = []
  const outRoot = options.declarationDir ?? options.outDir
  if (!outRoot) problems.push(`${configPath}: declarationDir or outDir is required`)
  if (!options.rootDir) problems.push(`${configPath}: an explicit rootDir is required (the alias → output mapping is rootDir-relative)`)
  if (problems.length) throw new DeclarationPathAliasError(problems)
  if (!existsSync(outRoot)) throw new DeclarationPathAliasError([`declaration output directory does not exist: ${outRoot} (run tsc -p first)`])
  const rootDir = realpathSync(options.rootDir)
  const outDir = realpathSync(outRoot)
  // TypeScript 的規則:有 baseUrl 時 `paths` 相對 baseUrl,否則相對宣告 `paths` 的那份 tsconfig 所在資料夾。
  const pathsBase = options.baseUrl ?? options.pathsBasePath ?? path.dirname(configPath)
  const aliases = []
  for (const [key, substitutions] of Object.entries(options.paths ?? {})) {
    const star = key.indexOf('*')
    const prefix = star === -1 ? key : key.slice(0, star)
    if (star === -1 || key.slice(star + 1) !== '' || !prefix.endsWith('/')) {
      problems.push(`unsupported paths key "${key}" (supported form: "<prefix>/*")`)
      continue
    }
    const targets = []
    for (const substitution of substitutions) {
      const subStar = substitution.indexOf('*')
      const subPrefix = subStar === -1 ? substitution : substitution.slice(0, subStar)
      if (subStar === -1 || substitution.slice(subStar + 1) !== '' || !(subPrefix === '' || subPrefix.endsWith('/'))) {
        problems.push(`unsupported paths substitution "${key}" → "${substitution}" (supported form: "<directory>/*")`)
        continue
      }
      const sourceDir = path.resolve(pathsBase, subPrefix)
      if (!existsSync(sourceDir)) {
        problems.push(`paths "${key}" → "${substitution}" points at a missing directory: ${sourceDir}`)
        continue
      }
      const realSourceDir = realpathSync(sourceDir)
      if (realSourceDir !== rootDir && !isWithin(rootDir, realSourceDir)) {
        problems.push(`paths "${key}" → "${substitution}" is outside rootDir ${rootDir}; its declarations are not emitted under ${outDir}`)
        continue
      }
      targets.push({ substitution, sourceDir: realSourceDir, outDir: path.join(outDir, path.relative(rootDir, realSourceDir)) })
    }
    aliases.push({ key, prefix, targets })
  }
  if (problems.length) throw new DeclarationPathAliasError(problems)
  return { configPath, parsed, options, rootDir, outDir, aliases }
}

// TypeScript 的 `paths` 比對規則:符合的樣式中取前綴最長的那一條。
function matchAlias(aliases, text) {
  let best = null
  for (const alias of aliases) {
    if (text.startsWith(alias.prefix) && (!best || alias.prefix.length > best.prefix.length)) best = alias
  }
  return best
}

function collectCodeSpecifiers(sourceFile, out, violations, label) {
  const take = (literal, kind) => {
    if (!literal || !ts.isStringLiteralLike(literal)) return
    const start = literal.getStart(sourceFile) + 1
    const end = literal.end - 1
    const raw = sourceFile.text.slice(start, end)
    if (raw !== literal.text) {
      violations.push(`${label(start)} module specifier with escapes cannot be rewritten verbatim: ${JSON.stringify(literal.text)}`)
      return
    }
    out.push({ start, end, text: raw, origin: 'code', kind })
  }
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) take(node.moduleSpecifier, 'import/export')
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) take(node.moduleReference.expression, 'import = require')
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) take(node.argument.literal, 'import() type')
    else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) take(node.name, 'declare module')
    else if (
      ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) take(node.arguments[0], 'import()/require() call')
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

// 每一段註解都是某個 token 的前導或尾隨 trivia;沿所有 token 收集即可拿到完整、不重複的註解範圍。
// JSDoc 節點不往下走:它們的子節點位置落在註解內部,從那裡掃 trivia 會切出假的註解片段。
function collectCommentRanges(sourceFile) {
  const text = sourceFile.text
  const ranges = new Map()
  const add = (list) => {
    for (const range of list ?? []) if (!ranges.has(range.pos)) ranges.set(range.pos, range)
  }
  const visit = (node) => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return
    add(ts.getLeadingCommentRanges(text, node.pos))
    add(ts.getTrailingCommentRanges(text, node.end))
    for (const child of node.getChildren(sourceFile)) visit(child)
  }
  visit(sourceFile)
  const sorted = [...ranges.values()].sort((a, b) => a.pos - b.pos)
  const disjoint = []
  for (const range of sorted) {
    const previous = disjoint.at(-1)
    if (previous && range.pos < previous.end) continue
    disjoint.push(range)
  }
  return disjoint
}

function collectCommentSpecifiers(sourceFile, out) {
  for (const range of collectCommentRanges(sourceFile)) {
    const comment = sourceFile.text.slice(range.pos, range.end)
    for (const match of comment.matchAll(COMMENT_SPECIFIER)) {
      const group = ['callPath', 'stmtPath', 'modPath'].find((name) => match.groups[name] !== undefined)
      const [start, end] = match.indices.groups[group]
      out.push({ start: range.pos + start, end: range.pos + end, text: match.groups[group], origin: 'comment', kind: 'comment' })
    }
  }
}

function collectTripleSlashSpecifiers(sourceFile, out) {
  for (const [kind, references] of [
    ['reference path', sourceFile.referencedFiles],
    ['reference types', sourceFile.typeReferenceDirectives],
    ['reference lib', sourceFile.libReferenceDirectives],
  ]) {
    for (const reference of references) out.push({ start: reference.pos, end: reference.end, text: reference.fileName, origin: 'triple-slash', kind })
  }
}

function listDeclarationFiles(directory) {
  const files = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(absolute)
      } else if (entry.isFile() && DECLARATION_FILE.test(entry.name)) files.push(absolute)
    }
  }
  walk(directory)
  return files
}

export function rewriteDeclarationPathAliases({ project, write = true } = {}) {
  if (!project) throw new DeclarationPathAliasError(['a tsconfig path is required (-p <tsconfig>)'])
  const { parsed, options, rootDir, outDir, aliases } = loadProject(project)
  const ignoreCase = !ts.sys.useCaseSensitiveFileNames
  const violations = []
  const realpathOrNull = (file) => (existsSync(file) ? realpathSync(file) : null)
  const fromRoot = (file) => toPosix(path.relative(rootDir, file))

  // tsc 實際編譯的輸入檔 = 程式的檔案集合扣掉宣告檔與外部套件。tsconfig 的 include / exclude 只是起點:
  // 被 exclude、但被別的檔 import 進來的檔照樣在程式裡、照樣有宣告輸出(parsed.fileNames 看不到它)。
  const program = ts.createProgram({ rootNames: parsed.fileNames, options, projectReferences: parsed.projectReferences })
  const compiledInputs = program.getSourceFiles()
    .filter((sourceFile) => !sourceFile.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sourceFile))
    .map((sourceFile) => sourceFile.fileName)
  // getOutputFileNames 只接受命令列裡的檔(否則 Debug.assert 直接崩潰),所以把實際編譯的集合放進去再問。
  const emitCommandLine = { ...parsed, fileNames: compiledInputs }
  const compiledByRealpath = new Map(compiledInputs.map((input) => [realpathOrNull(input) ?? input, input]))
  const declarationOutputOf = (input) => ts.getOutputFileNames(emitCommandLine, input, ignoreCase).find((output) => DECLARATION_FILE.test(output)) ?? null

  // 宣告輸出必須已存在:這一步只改寫 tsc 的產出,不負責產生它。
  const missingOutputs = compiledInputs.map(declarationOutputOf).filter((output) => output && !existsSync(output))
  if (missingOutputs.length) {
    throw new DeclarationPathAliasError([`${missingOutputs.length} declaration output(s) missing (run tsc -p first), e.g. ${missingOutputs[0]}`])
  }

  const resolutionHost = ts.sys
  const cache = ts.createModuleResolutionCache(process.cwd(), (name) => (ignoreCase ? name.toLowerCase() : name), options)
  const consumerOptions = { ...options, paths: undefined, baseUrl: undefined, pathsBasePath: undefined }
  const consumerCache = ts.createModuleResolutionCache(process.cwd(), (name) => (ignoreCase ? name.toLowerCase() : name), consumerOptions)
  const namespaces = new Set(aliases.map((alias) => firstSegment(alias.prefix)))

  const declarationFiles = listDeclarationFiles(outDir)
  const pending = []
  let rewriteCount = 0
  let commentRewriteCount = 0

  for (const file of declarationFiles) {
    const original = readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const relativeFile = toPosix(path.relative(process.cwd(), file))
    const label = (position) => `${relativeFile}:${sourceFile.getLineAndCharacterOfPosition(position).line + 1}`
    // 解析原始別名時用「這份宣告檔對應的原始碼位置」當 containing file —— 與 tsc 編譯時的視角一致。
    const containingSource = path.join(rootDir, path.relative(outDir, file))
    const specifiers = []
    collectCodeSpecifiers(sourceFile, specifiers, violations, label)
    collectCommentSpecifiers(sourceFile, specifiers)
    collectTripleSlashSpecifiers(sourceFile, specifiers)
    specifiers.sort((a, b) => a.start - b.start)

    const edits = []
    for (const specifier of specifiers) {
      const where = `${label(specifier.start)} ${specifier.kind} ${JSON.stringify(specifier.text)}`
      const alias = matchAlias(aliases, specifier.text)
      if (specifier.origin === 'triple-slash') {
        if (alias) violations.push(`${where}: path aliases are not applied to triple-slash references; write the reference as a relative path`)
        continue
      }
      if (!alias) {
        if (isRelativeSpecifier(specifier.text) || path.isAbsolute(specifier.text)) continue
        const resolved = ts.resolveModuleName(specifier.text, containingSource, options, resolutionHost, cache).resolvedModule
        const resolvedPath = resolved ? realpathOrNull(resolved.resolvedFileName) : null
        if (resolvedPath && !resolved.isExternalLibraryImport && isWithin(rootDir, resolvedPath)) {
          violations.push(`${where}: bare specifier resolves into the source tree via baseUrl (${toPosix(path.relative(rootDir, resolvedPath))}); use a paths alias or a relative import`)
        } else if (!resolved && namespaces.has(firstSegment(specifier.text))) {
          violations.push(`${where}: looks like a path alias but matches no tsconfig paths pattern (${aliases.map((a) => a.key).join(', ')})`)
        }
        continue
      }
      const rest = specifier.text.slice(alias.prefix.length)
      const resolved = ts.resolveModuleName(specifier.text, containingSource, options, resolutionHost, cache).resolvedModule
      const resolvedPath = resolved ? realpathOrNull(resolved.resolvedFileName) : null
      if (!resolvedPath) {
        const asset = alias.targets.map((candidate) => path.join(candidate.sourceDir, rest)).find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
        violations.push(asset
          ? `${where}: path alias "${alias.key}" points at ${fromRoot(asset)}, a file TypeScript does not resolve as a module (a CSS or other asset import), so the rewritten path cannot be verified; import assets with a relative path`
          : `${where}: path alias "${alias.key}" cannot be resolved${specifier.origin === 'comment' ? ' (aliases in comments are rewritten too and must resolve; fix or remove the example)' : ''}`)
        continue
      }
      // TypeScript 依 `paths` 陣列順序逐一替換、取第一個解析得到的目標;用同一套解析規則(不帶 paths)
      // 從同一個位置解析每個候選的絕對路徑,找出它實際採用的那一個。
      let target = null
      let viaTarget = null
      for (const candidate of alias.targets) {
        viaTarget = ts.resolveModuleName(toPosix(path.join(candidate.sourceDir, rest)), containingSource, consumerOptions, resolutionHost, consumerCache).resolvedModule
        if (viaTarget) {
          target = candidate
          break
        }
      }
      if (!target || realpathOrNull(viaTarget.resolvedFileName) !== resolvedPath) {
        violations.push(`${where}: resolves to ${fromRoot(resolvedPath)}, which no target of "${alias.key}" (${alias.targets.map((candidate) => candidate.substitution).join(', ')}) resolves to in TypeScript's substitution order`)
        continue
      }
      const input = compiledByRealpath.get(resolvedPath)
      if (!input) {
        violations.push(`${where}: resolves to ${fromRoot(resolvedPath)}, which is not part of the program tsc compiled for this tsconfig (excluded and never imported by a compiled file), so there is no declaration for it under the output directory`)
        continue
      }
      const declaration = declarationOutputOf(input)
      if (!declaration || !existsSync(declaration)) {
        violations.push(`${where}: resolves to ${fromRoot(resolvedPath)}, ${declaration ? `whose declaration output ${declaration} does not exist (run tsc -p first)` : `for which tsc emits no declaration (${path.extname(resolvedPath) || 'no extension'} module); a shipped declaration cannot point at it`}`)
        continue
      }
      const base = toPosix(path.relative(path.dirname(file), target.outDir))
      const replacement = `${base === '' ? '.' : base.startsWith('.') ? base : `./${base}`}/${rest}`
      const check = ts.resolveModuleName(replacement, file, consumerOptions, resolutionHost, consumerCache).resolvedModule
      const checkPath = check ? realpathOrNull(check.resolvedFileName) : null
      if (checkPath !== realpathSync(declaration)) {
        violations.push(`${where}: rewritten specifier ${JSON.stringify(replacement)} resolves to ${checkPath ?? '(nothing)'}, expected ${declaration}`)
        continue
      }
      edits.push({ start: specifier.start, end: specifier.end, replacement, origin: specifier.origin })
    }
    if (edits.length === 0) continue
    let next = original
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.replacement + next.slice(edit.end)
    rewriteCount += edits.length
    commentRewriteCount += edits.filter((edit) => edit.origin === 'comment').length
    pending.push({ file, next })
  }

  if (violations.length) throw new DeclarationPathAliasError(violations)
  if (!write && pending.length) {
    throw new DeclarationPathAliasError(pending.map(({ file }) => `${toPosix(path.relative(process.cwd(), file))}: still contains path aliases (check mode)`))
  }
  if (write) for (const { file, next } of pending) writeFileSync(file, next, 'utf8')
  return {
    declarationFiles: declarationFiles.length,
    rewrittenFiles: pending.map(({ file }) => file),
    rewriteCount,
    commentRewriteCount,
    outDir,
  }
}

function parseArguments(argv) {
  let project = null
  let write = true
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if ((argument === '-p' || argument === '--project') && argv[index + 1] && !argv[index + 1].startsWith('-')) {
      project = argv[index + 1]
      index += 1
    } else if (argument === '--check') write = false
    else throw new DeclarationPathAliasError([`unknown argument ${JSON.stringify(argument)}; usage: rewrite-declaration-path-aliases.mjs -p <tsconfig> [--check]`])
  }
  if (!project) throw new DeclarationPathAliasError(['usage: rewrite-declaration-path-aliases.mjs -p <tsconfig> [--check]'])
  return { project, write }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  try {
    const { project, write } = parseArguments(process.argv.slice(2))
    const result = rewriteDeclarationPathAliases({ project, write })
    const where = toPosix(path.relative(process.cwd(), result.outDir)) || '.'
    console.log(write
      ? `✓ declaration path aliases: rewrote ${result.rewriteCount} specifier(s) (${result.commentRewriteCount} in comments) in ${result.rewrittenFiles.length} of ${result.declarationFiles} declaration file(s) under ${where}`
      : `✓ declaration path aliases: ${result.declarationFiles} declaration file(s) under ${where} contain no path alias`)
  } catch (error) {
    console.error(`❌ ${error instanceof DeclarationPathAliasError ? error.message : error.stack ?? error}`)
    process.exitCode = 1
  }
}

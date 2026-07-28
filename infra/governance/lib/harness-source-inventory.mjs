import { createHash } from 'node:crypto'
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createGateMetaTestInventory } from '../../../scripts/lib/gate-meta-test-inventory.mjs'
import {
  assertControlPlaneGenesisTombstones,
  CONTROL_PLANE_GENESIS_OPEN_STATE,
  loadControlPlaneGenesisTransition,
} from '../../../scripts/lib/control-plane-genesis-transition.mjs'
import { compareUtf8Bytes } from './common.mjs'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_HARNESS_SOURCE_REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')
export const HARNESS_SOURCE_ROOTS = Object.freeze([
  'infra/governance/test/**/*.test.mjs',
  'packages/governance/test/**/*.test.mjs',
  'scripts/**/test-*.mjs',
  'packages/design-system/ds-canonical/hooks/tests/**/test_*.sh{,.broken}',
  '.claude/hooks/tests/**/test_*.sh{,.broken}',
])
export const HARNESS_STATIC_EXECUTION_FIXTURE_ROOT = 'scripts/test-fixtures/transitive-execution'
export const HARNESS_EXECUTION_BOUNDARY = 'Committed test-source plus registered static-execution-fixture closure with structured argv, exact fixture digests, stripped credentials, isolated HOME/TMP and bounded process groups; entrypoint and registered Node fixture AST review is defense-in-depth, not arbitrary imported-dependency containment; this is not an OS sandbox and does not certify containment against arbitrary concurrent worktree or external writes.'
const SOURCE_ROOT_MATCHERS = Object.freeze([
  { directory: 'infra/governance/test', matches: name => name.endsWith('.test.mjs') },
  { directory: 'packages/governance/test', matches: name => name.endsWith('.test.mjs') },
  { directory: 'scripts', matches: name => name.startsWith('test-') && name.endsWith('.mjs') },
  { directory: 'packages/design-system/ds-canonical/hooks/tests', matches: name => name.startsWith('test_') && (name.endsWith('.sh') || name.endsWith('.sh.broken')) },
  { directory: '.claude/hooks/tests', matches: name => name.startsWith('test_') && (name.endsWith('.sh') || name.endsWith('.sh.broken')) },
])
const CANONICAL_HOOK_SUITE_ID = 'canonical-hook-behavioral'
const CANONICAL_HOOK_TEST_ROOT = 'packages/design-system/ds-canonical/hooks/tests'
const CANONICAL_HOOK_ROOT = 'packages/design-system/ds-canonical/hooks'
const CANONICAL_HOOK_RUNNER = `${CANONICAL_HOOK_TEST_ROOT}/run-all.sh`
const CLAUDE_HOOK_TEST_MIRROR_ROOT = '.claude/hooks/tests'
const CHILD_PROCESS_MODULES = new Set(['child_process', 'node:child_process'])
const NODE_MODULE_MODULES = new Set(['module', 'node:module'])
const DYNAMIC_CODE_MODULES = new Set(['node:vm', 'vm'])
const CHILD_PROCESS_APIS = new Set(['exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'spawn', 'spawnSync'])
const STRING_SHELL_APIS = new Set(['exec', 'execSync'])
const STRUCTURED_PROCESS_APIS = new Set(['execFile', 'execFileSync', 'fork', 'spawn', 'spawnSync'])
const SHELL_EXECUTABLES = new Set(['bash', 'bash.exe', 'cmd', 'cmd.exe', 'dash', 'dash.exe', 'fish', 'fish.exe', 'ksh', 'ksh.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'sh', 'sh.exe', 'zsh', 'zsh.exe'])
const POSIX_SHELL_EXECUTABLES = new Set(['bash', 'bash.exe', 'dash', 'dash.exe', 'ksh', 'ksh.exe', 'sh', 'sh.exe', 'zsh', 'zsh.exe'])
const REVIEWED_PROCESS_EXECUTABLES = new Set([
  ...POSIX_SHELL_EXECUTABLES,
  'diff', 'git', 'mkfifo', 'node', 'node.exe', 'npm', 'ps', 'python3',
])
const NON_MUTATING_ARRAY_METHODS = new Set([
  'at', 'concat', 'entries', 'every', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex',
  'flat', 'flatMap', 'forEach', 'includes', 'indexOf', 'join', 'keys', 'lastIndexOf', 'map',
  'reduce', 'reduceRight', 'slice', 'some', 'toReversed', 'toSorted', 'toSpliced', 'values', 'with',
])
const REVIEWED_ENTRYPOINT_SAFETY_POLICY_VERSION = 'reviewed-entrypoint-safety-v7'
const REVIEWED_ENTRYPOINT_SAFETY_CACHE_LIMIT = 1024
const REVIEWED_ENTRYPOINT_MAX_BYTES = 4 * 1024 * 1024
const REVIEWED_ENTRYPOINT_COMPILER_OPTIONS = Object.freeze({
  allowJs: true,
  checkJs: false,
  module: ts.ModuleKind.ESNext,
  noEmit: true,
  noLib: true,
  noResolve: true,
  target: ts.ScriptTarget.ESNext,
})
const reviewedEntrypointSafetyCache = new Map()
const fatalUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(
    JSON.stringify(Object.keys(value).sort(compareUtf8Bytes)) === JSON.stringify([...expected].sort(compareUtf8Bytes)),
    `${label} has an invalid or open shape`,
  )
}

function canonicalRepoRoot(repoRoot) {
  const absolute = realpathSync(resolve(repoRoot))
  const info = lstatSync(absolute)
  invariant(info.isDirectory() && !info.isSymbolicLink(), 'Harness source repository root must be a real directory')
  return absolute
}

function portableRepoPath(repoPath, label) {
  invariant(
    typeof repoPath === 'string'
      && repoPath.length > 0
      && !isAbsolute(repoPath)
      && !repoPath.includes('\\')
      && !/[\0\n\r]/.test(repoPath)
      && repoPath.split('/').every(part => part && part !== '.' && part !== '..'),
    `${label} must be a portable repository-relative path`,
  )
}

function resolveRegularRepoFile(repoRoot, repoPath, label) {
  portableRepoPath(repoPath, label)
  const root = canonicalRepoRoot(repoRoot)
  const lexical = resolve(root, repoPath)
  const lexicalRelative = relative(root, lexical)
  invariant(lexicalRelative !== '..' && !lexicalRelative.startsWith(`..${sep}`) && !isAbsolute(lexicalRelative), `${label} escapes the repository`)
  const info = lstatSync(lexical)
  invariant(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular no-symlink file:${repoPath}`)
  invariant(info.nlink === 1, `${label} must not be a hard-link alias:${repoPath}`)
  const physical = realpathSync(lexical)
  const physicalRelative = relative(root, physical)
  invariant(physicalRelative !== '..' && !physicalRelative.startsWith(`..${sep}`) && !isAbsolute(physicalRelative), `${label} resolves outside the repository`)
  invariant(physical === lexical, `${label} traverses a symbolic-link alias:${repoPath}`)
  return lexical
}

function resolveRegularRepoDirectory(repoRoot, repoPath, label) {
  portableRepoPath(repoPath, label)
  const root = canonicalRepoRoot(repoRoot)
  const lexical = resolve(root, repoPath)
  const lexicalRelative = relative(root, lexical)
  invariant(lexicalRelative !== '..' && !lexicalRelative.startsWith(`..${sep}`) && !isAbsolute(lexicalRelative), `${label} escapes the repository`)
  const info = lstatSync(lexical)
  invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} must be a real no-symlink directory:${repoPath}`)
  const physical = realpathSync(lexical)
  const physicalRelative = relative(root, physical)
  invariant(physicalRelative !== '..' && !physicalRelative.startsWith(`..${sep}`) && !isAbsolute(physicalRelative), `${label} resolves outside the repository`)
  invariant(physical === lexical, `${label} traverses a symbolic-link alias:${repoPath}`)
  return lexical
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function shellNodeTailTokens(source) {
  const tokens = []
  let stdinRedirect = false
  let index = 0
  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index += 1
    if (index >= source.length || source[index] === '#' || /[;&|()]/.test(source[index])) break
    if (source[index] === '<' || source[index] === '>') {
      if (source[index] === '<') stdinRedirect = true
      break
    }
    let token = ''
    let quote = null
    while (index < source.length) {
      const character = source[index]
      if (quote !== null) {
        if (character === quote) {
          quote = null
          index += 1
          continue
        }
        if (character === '\\' && quote === '"' && index + 1 < source.length) {
          token += source[index + 1]
          index += 2
          continue
        }
        token += character
        index += 1
        continue
      }
      if (character === '"' || character === "'") {
        quote = character
        index += 1
        continue
      }
      if (character === '\\' && index + 1 < source.length) {
        token += source[index + 1]
        index += 2
        continue
      }
      if (/\s/.test(character) || /[<>&;|()]/.test(character)) break
      token += character
      index += 1
    }
    if (token.length > 0) tokens.push(token)
    if (index < source.length && (source[index] === '<' || source[index] === '>')) {
      if (source[index] === '<') stdinRedirect = true
      break
    }
    if (index < source.length && /[;&|()]/.test(source[index])) break
  }
  return { stdinRedirect, tokens }
}

function nodeShellTailUsesDynamicOrStdinCode(source) {
  const { stdinRedirect, tokens } = shellNodeTailTokens(source)
  const dynamicLong = /^--(?:env-file(?:-if-exists)?|eval|experimental-loader|import|loader|print|require|run)(?:=|$)/
  const terminalFlags = new Set(['--help', '--version', '-h', '-v'])
  const optionsWithValue = new Set(['--input-type'])
  let terminal = false
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--') {
      const script = tokens[index + 1]
      return script === undefined || script === '-' || stdinRedirect
    }
    if (token === '-') return true
    if (dynamicLong.test(token)) return true
    if (/^-(?!-)[A-Za-z]*[epr][A-Za-z]*(?:=|$)/.test(token)) return true
    if (terminalFlags.has(token)) {
      terminal = true
      continue
    }
    const optionName = token.split('=', 1)[0]
    if (optionsWithValue.has(optionName)) {
      if (!token.includes('=')) index += 1
      continue
    }
    if (token.startsWith('-')) continue
    return false
  }
  return !terminal || stdinRedirect
}

export function hasForbiddenNodeShellCode(source) {
  const invocation = /(^|[;&|()])\s*(?:(?:(?:if|elif|while|until|then|do|time|!)\s+)+)?(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*(?:command\s+)?(?:(?:\/usr\/bin\/)?env\s+(?:-[^\s]+\s+)*)?(?:["']?[^"' \t]*\/)?node(?:\.exe)?["']?(?=$|[\s<>])/gim
  for (const line of source.split(/\r?\n/)) {
    if (!/\bnode(?:\.exe)?\b/i.test(line)) continue
    for (const match of line.matchAll(invocation)) {
      if (nodeShellTailUsesDynamicOrStdinCode(line.slice(match.index + match[0].length))) {
        return true
      }
    }
  }
  return false
}

function reviewedEntrypointStatIdentity(info) {
  invariant(info.isFile() && !info.isSymbolicLink(), 'Harness reviewed entrypoint must remain a regular no-symlink file')
  invariant(info.nlink === 1n, 'Harness reviewed entrypoint must not become a hard-link alias')
  invariant(info.size >= 0n && info.size <= BigInt(REVIEWED_ENTRYPOINT_MAX_BYTES), 'Harness reviewed entrypoint exceeds the closed source-size limit')
  return {
    dev: info.dev.toString(),
    ino: info.ino.toString(),
    mode: info.mode.toString(),
    nlink: info.nlink.toString(),
    size: info.size.toString(),
    mtimeNs: info.mtimeNs.toString(),
    ctimeNs: info.ctimeNs.toString(),
  }
}

function captureReviewedEntrypoint(repoRoot, repoPath, absolutePath) {
  const root = canonicalRepoRoot(repoRoot)
  const absolute = resolve(absolutePath)
  invariant(resolve(root, repoPath) === absolute, `Harness reviewed entrypoint path binding drifted:${repoPath}`)
  const pathBefore = reviewedEntrypointStatIdentity(lstatSync(absolute, { bigint: true }))
  invariant(realpathSync(absolute) === absolute, `Harness reviewed entrypoint traverses a symbolic-link alias:${repoPath}`)
  const noFollow = Number.isInteger(fsConstants.O_NOFOLLOW) ? fsConstants.O_NOFOLLOW : 0
  const descriptor = openSync(absolute, fsConstants.O_RDONLY | noFollow)
  try {
    const descriptorBefore = reviewedEntrypointStatIdentity(fstatSync(descriptor, { bigint: true }))
    invariant(JSON.stringify(descriptorBefore) === JSON.stringify(pathBefore), `Harness reviewed entrypoint changed before capture:${repoPath}`)
    const expectedSize = Number(descriptorBefore.size)
    const bytes = Buffer.allocUnsafe(expectedSize)
    let offset = 0
    while (offset < expectedSize) {
      const count = readSync(descriptor, bytes, offset, expectedSize - offset, offset)
      if (count === 0) break
      offset += count
    }
    invariant(offset === expectedSize, `Harness reviewed entrypoint shrank during bounded capture:${repoPath}`)
    const overflowProbe = Buffer.allocUnsafe(1)
    invariant(readSync(descriptor, overflowProbe, 0, 1, expectedSize) === 0, `Harness reviewed entrypoint grew during bounded capture:${repoPath}`)
    const descriptorAfter = reviewedEntrypointStatIdentity(fstatSync(descriptor, { bigint: true }))
    const pathAfter = reviewedEntrypointStatIdentity(lstatSync(absolute, { bigint: true }))
    invariant(realpathSync(absolute) === absolute, `Harness reviewed entrypoint traverses a symbolic-link alias:${repoPath}`)
    invariant(
      JSON.stringify(descriptorAfter) === JSON.stringify(descriptorBefore)
        && JSON.stringify(pathAfter) === JSON.stringify(pathBefore),
      `Harness reviewed entrypoint changed during capture:${repoPath}`,
    )
    const contentSha256 = sha256(bytes)
    const policySha256 = sha256(JSON.stringify({
      policy: REVIEWED_ENTRYPOINT_SAFETY_POLICY_VERSION,
      typescript: ts.version,
      compilerOptions: REVIEWED_ENTRYPOINT_COMPILER_OPTIONS,
    }))
    const key = sha256(JSON.stringify({
      policySha256,
      root,
      absolute,
      repoPath,
      ...pathBefore,
      contentSha256,
    }))
    return { bytes, key }
  } finally {
    closeSync(descriptor)
  }
}

function rememberReviewedEntrypointSafety(key) {
  reviewedEntrypointSafetyCache.delete(key)
  reviewedEntrypointSafetyCache.set(key, true)
  while (reviewedEntrypointSafetyCache.size > REVIEWED_ENTRYPOINT_SAFETY_CACHE_LIMIT) {
    reviewedEntrypointSafetyCache.delete(reviewedEntrypointSafetyCache.keys().next().value)
  }
}

function assertReviewedBashSafety(repoRoot, repoPath, absolutePath, label) {
  const before = captureReviewedEntrypoint(repoRoot, repoPath, absolutePath)
  let sourceText
  try {
    sourceText = fatalUtf8.decode(before.bytes)
  } catch (error) {
    throw new Error(`Harness ${label} is not canonical UTF-8:${repoPath}`, { cause: error })
  }
  invariant(
    sourceText.startsWith('#!/usr/bin/env bash\n') || sourceText.startsWith('#!/bin/bash\n'),
    `Harness ${label} must have one reviewed Bash shebang:${repoPath}`,
  )
  invariant(
    !hasForbiddenNodeShellCode(sourceText),
    `Harness ${label} uses forbidden Node dynamic or stdin code:${repoPath}`,
  )
  const after = captureReviewedEntrypoint(repoRoot, repoPath, absolutePath)
  invariant(after.key === before.key, `Harness ${label} changed while safety was being verified:${repoPath}`)
  return sourceText
}

function assertReviewedStaticShellFixtureSafety(repoRoot, repoPath, absolutePath) {
  assertReviewedBashSafety(repoRoot, repoPath, absolutePath, 'static shell fixture')
}

function canonicalActiveHookFiles(repoRoot, predicate, label) {
  const root = canonicalRepoRoot(repoRoot)
  const absoluteRoot = resolveRegularRepoDirectory(root, CANONICAL_HOOK_ROOT, 'Harness canonical hook root')
  const paths = []
  function visit(absoluteDirectory, relativeDirectory = '') {
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const repoPath = `${CANONICAL_HOOK_ROOT}/${relativePath}`
      invariant(!entry.isSymbolicLink(), `Harness canonical hook root contains a symbolic link:${repoPath}`)
      if (entry.isDirectory()) {
        if (relativePath !== 'retired' && !relativePath.startsWith('retired/')) {
          visit(resolve(absoluteDirectory, entry.name), relativePath)
        }
        continue
      }
      invariant(entry.isFile(), `Harness canonical hook root contains a special entry:${repoPath}`)
      if (!predicate(entry.name, relativePath)) continue
      resolveRegularRepoFile(root, repoPath, label)
      paths.push(repoPath)
    }
  }
  visit(absoluteRoot)
  return paths.sort(compareUtf8Bytes)
}

function hookTreeManifest(repoRoot, rootPath, label) {
  const root = canonicalRepoRoot(repoRoot)
  const absoluteRoot = resolveRegularRepoDirectory(root, rootPath, label)
  const records = []
  function visit(absoluteDirectory, relativeDirectory = '') {
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const repoPath = `${rootPath}/${relativePath}`
      invariant(!entry.isSymbolicLink(), `${label} contains a symbolic link:${repoPath}`)
      if (entry.isDirectory()) {
        visit(resolve(absoluteDirectory, entry.name), relativePath)
        continue
      }
      if (
        relativePath !== 'run-all.sh'
        && !entry.name.endsWith('.mjs')
        && !(entry.name.startsWith('test_') && (entry.name.endsWith('.sh') || entry.name.endsWith('.sh.broken')))
      ) continue
      const absolute = resolveRegularRepoFile(root, repoPath, label)
      records.push({ path: relativePath, sha256: sha256(readFileSync(absolute)) })
    }
  }
  visit(absoluteRoot)
  records.sort((left, right) => compareUtf8Bytes(left.path, right.path))
  invariant(records.some(record => record.path === 'run-all.sh'), `${label} lacks the canonical aggregate runner`)
  invariant(records.some(record => record.path !== 'run-all.sh'), `${label} lacks behavioral tests`)
  return {
    records,
    treeSha256: sha256(Buffer.from(JSON.stringify(records))),
  }
}

function isDisabledHookTestPath(path) {
  return path.endsWith('.sh.broken')
}

function isActiveHookTestPath(path) {
  return basename(path).startsWith('test_') && path.endsWith('.sh')
}

function transitionInactiveCanonicalHookNames(repoRoot) {
  const root = canonicalRepoRoot(repoRoot)
  if (!existsSync(resolve(root, 'scripts/governance-build-graph.json'))) return new Set()
  const transition = loadControlPlaneGenesisTransition({ root })
  if (transition.state !== CONTROL_PLANE_GENESIS_OPEN_STATE) return new Set()
  const prefix = `${CANONICAL_HOOK_ROOT}/`
  return new Set(assertControlPlaneGenesisTombstones({ root, transition })
    .map(item => item.path)
    .filter(path => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
    .map(path => path.slice(prefix.length)))
}

function validateCanonicalActiveHookCoverage(repoRoot, canonicalHookTree) {
  const root = canonicalRepoRoot(repoRoot)
  const absoluteRoot = resolveRegularRepoDirectory(root, CANONICAL_HOOK_ROOT, 'Harness canonical hook root')
  const transitionInactive = transitionInactiveCanonicalHookNames(root)
  const active = []
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
    const repoPath = `${CANONICAL_HOOK_ROOT}/${entry.name}`
    invariant(!entry.isSymbolicLink(), `Harness canonical hook root contains a symbolic link:${repoPath}`)
    if (!entry.isFile() || !/\.(?:sh|py)$/.test(entry.name) || /^(?:_log-fire|log_.+)\.sh$/.test(entry.name)) continue
    if (transitionInactive.has(entry.name)) continue
    resolveRegularRepoFile(root, repoPath, 'Harness canonical active hook')
    active.push(entry.name.replace(/\.(?:sh|py)$/, ''))
  }
  const tested = new Set(canonicalHookTree.records
    .filter(record => record.path.startsWith('test_') && record.path.endsWith('.sh'))
    .map(record => record.path.replace(/^test_/, '').replace(/\.sh$/, '')))
  const untested = active.filter(name => !tested.has(name))
  invariant(untested.length === 0, `Harness canonical active hooks lack behavioral tests:${untested.join(',')}`)
}

function commandKey(command) {
  return JSON.stringify(command)
}

function commandEntrypoint(command) {
  if (!Array.isArray(command)) return null
  return command[1] === '--test' ? command[2] : command[1]
}

function memberCommand(path) {
  return path.endsWith('.test.mjs') ? ['node', '--test', path] : ['node', path]
}

function suiteCommand(suiteId) {
  return ['node', 'infra/governance/bin/run-harness-suite.mjs', '--suite', suiteId]
}

function assertSortedUnique(values, label) {
  invariant(Array.isArray(values), `${label} must be an array`)
  invariant(
    JSON.stringify(values) === JSON.stringify([...new Set(values)].sort(compareUtf8Bytes)),
    `${label} must be sorted and unique`,
  )
}

function registryCommands(registry) {
  invariant(registry && Array.isArray(registry.entries), 'Harness source inventory requires the canonical Harness registry join')
  return registry.entries.flatMap(entry => entry.commands)
}

function sourcePropertyName(node, evaluateString = literalString) {
  if (!node) return null
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  if (ts.isComputedPropertyName(node)) return evaluateString(node.expression)
  return null
}

function unwrapExpression(node) {
  let current = node
  while (
    current
    && (
      ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
      || ts.isNonNullExpression(current)
      || ts.isAwaitExpression(current)
    )
  ) current = current.expression
  return current
}

function literalString(node) {
  const current = unwrapExpression(node)
  return current && (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current))
    ? current.text
    : null
}

function assertReviewedEntrypointSafety(repoRoot, repoPath, absolutePath) {
  const before = captureReviewedEntrypoint(repoRoot, repoPath, absolutePath)
  if (reviewedEntrypointSafetyCache.has(before.key)) {
    const after = captureReviewedEntrypoint(repoRoot, repoPath, absolutePath)
    invariant(after.key === before.key, `Harness reviewed entrypoint changed while cached safety was in use:${repoPath}`)
    rememberReviewedEntrypointSafety(before.key)
    return
  }
  let sourceText
  try {
    sourceText = fatalUtf8.decode(before.bytes)
  } catch (error) {
    throw new Error(`Harness source is not canonical UTF-8:${repoPath}`, { cause: error })
  }
  const absolute = resolve(absolutePath)
  const source = ts.createSourceFile(
    absolute,
    sourceText,
    REVIEWED_ENTRYPOINT_COMPILER_OPTIONS.target,
    true,
    ts.ScriptKind.JS,
  )
  const exactSource = fileName => resolve(fileName) === absolute
  const host = {
    getSourceFile: fileName => exactSource(fileName) ? source : undefined,
    getDefaultLibFileName: () => '/__governance_no_lib__.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => canonicalRepoRoot(repoRoot),
    getDirectories: () => [],
    fileExists: exactSource,
    readFile: fileName => exactSource(fileName) ? sourceText : undefined,
    getCanonicalFileName: fileName => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    directoryExists: directory => resolve(directory) === canonicalRepoRoot(repoRoot),
    realpath: fileName => exactSource(fileName) ? absolute : fileName,
  }
  const program = ts.createProgram([absolute], REVIEWED_ENTRYPOINT_COMPILER_OPTIONS, host)
  const sourceFile = program.getSourceFile(absolute)
  invariant(sourceFile, `Harness source could not be parsed:${repoPath}`)
  const diagnostics = program.getSyntacticDiagnostics(sourceFile)
  invariant(diagnostics.length === 0, `Harness source has invalid JavaScript syntax:${repoPath}`)
  const checker = program.getTypeChecker()
  const origins = new Map()
  const initializers = new Map()
  const mutatedSymbols = new Set()
  let processExecPathMutated = false
  let processCwdMutated = false

  function localSymbol(node) {
    if (!node || !ts.isIdentifier(node)) return null
    if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
      return checker.getShorthandAssignmentValueSymbol(node.parent) ?? checker.getSymbolAtLocation(node)
    }
    if (ts.isExportSpecifier(node.parent) && node.parent.name === node) {
      return checker.getExportSpecifierLocalTargetSymbol(node.parent) ?? checker.getSymbolAtLocation(node)
    }
    return checker.getSymbolAtLocation(node)
  }

  function isLocallyDeclared(symbol) {
    return Boolean(symbol?.declarations?.some(declaration => declaration.getSourceFile() === sourceFile))
  }

  function hasExplicitLocalBinding(symbol) {
    return Boolean(symbol?.declarations?.some(declaration => (
      declaration.getSourceFile() === sourceFile
      && (
        ts.isVariableDeclaration(declaration)
        || ts.isBindingElement(declaration)
        || ts.isParameter(declaration)
        || ts.isImportClause(declaration)
        || ts.isImportSpecifier(declaration)
        || ts.isNamespaceImport(declaration)
        || ts.isFunctionDeclaration(declaration)
        || ts.isClassDeclaration(declaration)
      )
    )))
  }

  function setOrigin(binding, origin) {
    const symbol = localSymbol(binding)
    if (!symbol || !origin || origins.has(symbol)) return false
    origins.set(symbol, origin)
    return true
  }

  function resolvedInitializer(node, seen = new Set()) {
    const current = unwrapExpression(node)
    if (!current || !ts.isIdentifier(current)) return current
    const symbol = localSymbol(current)
    if (!symbol || seen.has(symbol) || mutatedSymbols.has(symbol) || !initializers.has(symbol)) return current
    seen.add(symbol)
    return resolvedInitializer(initializers.get(symbol), seen)
  }

  function staticString(node, seen = new Set()) {
    const current = unwrapExpression(node)
    if (!current) return null
    if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) return current.text
    if (ts.isIdentifier(current)) {
      const symbol = localSymbol(current)
      if (!symbol || seen.has(symbol) || mutatedSymbols.has(symbol) || !initializers.has(symbol)) return null
      const nextSeen = new Set(seen)
      nextSeen.add(symbol)
      return staticString(initializers.get(symbol), nextSeen)
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = staticString(current.left, new Set(seen))
      const right = staticString(current.right, new Set(seen))
      return left === null || right === null ? null : `${left}${right}`
    }
    if (ts.isTemplateExpression(current)) {
      let value = current.head.text
      for (const span of current.templateSpans) {
        const expression = staticString(span.expression, new Set(seen))
        if (expression === null) return null
        value += expression + span.literal.text
      }
      return value
    }
    return null
  }

  function reviewedPropertyName(node) {
    return sourcePropertyName(node, staticString)
  }

  function importedCallable(node) {
    const current = unwrapExpression(node)
    let binding = current
    let member = null
    if (current && (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))) {
      binding = unwrapExpression(current.expression)
      member = ts.isPropertyAccessExpression(current)
        ? current.name.text
        : staticString(current.argumentExpression)
    }
    if (!binding || !ts.isIdentifier(binding)) return null
    const symbol = localSymbol(binding)
    for (const declaration of symbol?.declarations ?? []) {
      let imported = null
      if (ts.isImportSpecifier(declaration) && member === null) {
        imported = (declaration.propertyName ?? declaration.name).text
      } else if (ts.isNamespaceImport(declaration) && member !== null) {
        imported = member
      } else {
        continue
      }
      let owner = declaration.parent
      while (owner && !ts.isImportDeclaration(owner)) owner = owner.parent
      const moduleName = owner && ts.isImportDeclaration(owner) ? literalString(owner.moduleSpecifier) : null
      if (moduleName) return { imported, moduleName }
    }
    return null
  }

  function isImportMetaMember(node, member) {
    const current = unwrapExpression(node)
    return Boolean(
      current
      && ts.isPropertyAccessExpression(current)
      && current.name.text === member
      && ts.isMetaProperty(unwrapExpression(current.expression))
      && unwrapExpression(current.expression).keywordToken === ts.SyntaxKind.ImportKeyword,
    )
  }

  function isGlobalProcessMember(node, member) {
    const current = unwrapExpression(node)
    if (!current || (!ts.isPropertyAccessExpression(current) && !ts.isElementAccessExpression(current))) return false
    const base = unwrapExpression(current.expression)
    const property = ts.isPropertyAccessExpression(current) ? current.name.text : staticString(current.argumentExpression)
    return Boolean(
      base
      && ts.isIdentifier(base)
      && base.text === 'process'
      && !isLocallyDeclared(localSymbol(base))
      && property === member,
    )
  }

  function isSyntacticProcessExecPath(node) {
    const current = unwrapExpression(node)
    if (!current || (!ts.isPropertyAccessExpression(current) && !ts.isElementAccessExpression(current))) return false
    const base = unwrapExpression(current.expression)
    const property = ts.isPropertyAccessExpression(current) ? current.name.text : staticString(current.argumentExpression)
    return property === 'execPath' && isSyntacticProcessObject(base)
  }

  function isSyntacticProcessCwd(node) {
    const current = unwrapExpression(node)
    if (!current || (!ts.isPropertyAccessExpression(current) && !ts.isElementAccessExpression(current))) return false
    const base = unwrapExpression(current.expression)
    const property = ts.isPropertyAccessExpression(current) ? current.name.text : staticString(current.argumentExpression)
    return property === 'cwd' && isSyntacticProcessObject(base)
  }

  function isSyntacticProcessObject(node) {
    const current = unwrapExpression(node)
    if (current && ts.isIdentifier(current)) {
      return current.text === 'process' && !hasExplicitLocalBinding(localSymbol(current))
    }
    if (!current || (!ts.isPropertyAccessExpression(current) && !ts.isElementAccessExpression(current))) return false
    const base = unwrapExpression(current.expression)
    const property = ts.isPropertyAccessExpression(current) ? current.name.text : staticString(current.argumentExpression)
    return Boolean(
      property === 'process'
      && base
      && ts.isIdentifier(base)
      && !hasExplicitLocalBinding(localSymbol(base))
      && ['global', 'globalThis', 'self', 'window'].includes(base.text),
    )
  }

  function localFunctionDeclaration(node) {
    const current = unwrapExpression(node)
    if (!current || !ts.isIdentifier(current)) return null
    const symbol = localSymbol(current)
    if (mutatedSymbols.has(symbol)) return null
    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isFunctionDeclaration(declaration)) return declaration
      if (ts.isVariableDeclaration(declaration)) {
        const initializer = unwrapExpression(declaration.initializer)
        if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) return initializer
      }
    }
    return null
  }

  function bindingIsImmutable(symbol) {
    return Boolean(symbol?.declarations?.every(declaration => {
      if (ts.isVariableDeclaration(declaration)) return (declaration.parent.flags & ts.NodeFlags.Const) !== 0
      if (ts.isBindingElement(declaration)) {
        let owner = declaration.parent
        while (owner && !ts.isVariableDeclaration(owner)) owner = owner.parent
        return Boolean(owner && (owner.parent.flags & ts.NodeFlags.Const) !== 0)
      }
      return !ts.isParameter(declaration)
    }))
  }

  function bindingSource(symbol) {
    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) return declaration.initializer
      if (ts.isBindingElement(declaration)) {
        let owner = declaration.parent
        while (owner && !ts.isVariableDeclaration(owner)) owner = owner.parent
        if (owner?.initializer) return owner.initializer
        if (owner?.parent?.parent && ts.isForOfStatement(owner.parent.parent)) return owner.parent.parent.expression
      }
    }
    return null
  }

  function reviewedPathProvenance(node, seen = new Set(), trustedParameters = new Set()) {
    const current = unwrapExpression(node)
    if (!current) return false
    if (
      ts.isStringLiteral(current)
      || ts.isNoSubstitutionTemplateLiteral(current)
      || ts.isNumericLiteral(current)
      || current.kind === ts.SyntaxKind.TrueKeyword
      || current.kind === ts.SyntaxKind.FalseKeyword
      || current.kind === ts.SyntaxKind.NullKeyword
      || isImportMetaMember(current, 'url')
      || isImportMetaMember(current, 'dirname')
    ) return true
    if (ts.isIdentifier(current)) {
      const symbol = localSymbol(current)
      if (!symbol || seen.has(symbol) || mutatedSymbols.has(symbol)) return false
      if (symbol.declarations?.some(declaration => ts.isParameter(declaration))) return trustedParameters.has(symbol)
      if (!bindingIsImmutable(symbol)) return false
      const sourceNode = initializers.get(symbol) ?? bindingSource(symbol)
      if (!sourceNode) return false
      const nextSeen = new Set(seen)
      nextSeen.add(symbol)
      return reviewedPathProvenance(sourceNode, nextSeen, trustedParameters)
    }
    if (ts.isTemplateExpression(current)) {
      return current.templateSpans.every(span => reviewedPathProvenance(span.expression, new Set(seen), trustedParameters))
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return reviewedPathProvenance(current.left, new Set(seen), trustedParameters)
        && reviewedPathProvenance(current.right, new Set(seen), trustedParameters)
    }
    if (ts.isConditionalExpression(current)) {
      return reviewedPathProvenance(current.whenTrue, new Set(seen), trustedParameters)
        && reviewedPathProvenance(current.whenFalse, new Set(seen), trustedParameters)
    }
    if (ts.isArrayLiteralExpression(current)) {
      return current.elements.every(element => reviewedPathProvenance(
        ts.isSpreadElement(element) ? element.expression : element,
        new Set(seen),
        trustedParameters,
      ))
    }
    if (ts.isObjectLiteralExpression(current)) {
      return current.properties.every(property => {
        if (ts.isSpreadAssignment(property)) return reviewedPathProvenance(property.expression, new Set(seen), trustedParameters)
        if (ts.isPropertyAssignment(property)) return reviewedPathProvenance(property.initializer, new Set(seen), trustedParameters)
        if (ts.isShorthandPropertyAssignment(property)) return reviewedPathProvenance(property.name, new Set(seen), trustedParameters)
        return false
      })
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      if (
        isGlobalProcessMember(current, 'argv')
        || isGlobalProcessMember(current, 'env')
        || expressionOrigin(current) === 'process-external-input'
      ) return false
      const property = ts.isPropertyAccessExpression(current) ? current.name.text : staticString(current.argumentExpression)
      return property !== null && reviewedPathProvenance(current.expression, new Set(seen), trustedParameters)
    }
    if (ts.isNewExpression(current)) {
      const callee = unwrapExpression(current.expression)
      return Boolean(
        callee
        && ts.isIdentifier(callee)
        && callee.text === 'URL'
        && !isLocallyDeclared(localSymbol(callee))
        && (current.arguments ?? []).every(argument => reviewedPathProvenance(argument, new Set(seen), trustedParameters)),
      )
    }
    if (!ts.isCallExpression(current)) return false
    if (
      ts.isPropertyAccessExpression(unwrapExpression(current.expression))
      && isGlobalProcessMember(unwrapExpression(current.expression), 'cwd')
      && !processCwdMutated
      && current.arguments.length === 0
    ) return true
    const imported = importedCallable(current.expression)
    const reviewedImports = new Map([
      ['node:path', new Set(['dirname', 'join', 'normalize', 'resolve'])],
      ['path', new Set(['dirname', 'join', 'normalize', 'resolve'])],
      ['node:url', new Set(['fileURLToPath'])],
      ['url', new Set(['fileURLToPath'])],
      ['node:os', new Set(['tmpdir'])],
      ['os', new Set(['tmpdir'])],
      ['node:fs', new Set(['mkdtempSync', 'realpathSync'])],
      ['fs', new Set(['mkdtempSync', 'realpathSync'])],
    ])
    if (imported && reviewedImports.get(imported.moduleName)?.has(imported.imported)) {
      return current.arguments.every(argument => reviewedPathProvenance(argument, new Set(seen), trustedParameters))
    }
    const declaration = localFunctionDeclaration(current.expression)
    const functionSymbol = ts.isIdentifier(unwrapExpression(current.expression))
      ? localSymbol(unwrapExpression(current.expression))
      : null
    if (
      !declaration
      || !functionSymbol
      || seen.has(functionSymbol)
      || !current.arguments.every(argument => reviewedPathProvenance(argument, new Set(seen), trustedParameters))
    ) return false
    const producerSeen = new Set(seen)
    producerSeen.add(functionSymbol)
    const parameters = new Set()
    const nextTrustedParameters = new Set(trustedParameters)
    for (let index = 0; index < declaration.parameters.length; index += 1) {
      const parameter = declaration.parameters[index]
      if (!ts.isIdentifier(parameter.name)) return false
      const symbol = localSymbol(parameter.name)
      if (!symbol) return false
      if (index >= current.arguments.length) {
        if (
          !parameter.initializer
          || !reviewedPathProvenance(parameter.initializer, new Set(producerSeen), nextTrustedParameters)
        ) return false
      }
      parameters.add(symbol)
      nextTrustedParameters.add(symbol)
    }
    const returns = []
    if (ts.isArrowFunction(declaration) && !ts.isBlock(declaration.body)) {
      returns.push(declaration.body)
    } else if (declaration.body) {
      function collectReturns(candidate) {
        if (candidate !== declaration.body && ts.isFunctionLike(candidate)) return
        if (ts.isReturnStatement(candidate)) {
          if (candidate.expression) returns.push(candidate.expression)
          return
        }
        ts.forEachChild(candidate, collectReturns)
      }
      collectReturns(declaration.body)
    }
    return returns.length > 0
      && returns.every(value => reviewedPathProvenance(value, new Set(producerSeen), nextTrustedParameters))
  }

  function reviewedNodeScriptOperand(node, seen = new Set()) {
    const current = unwrapExpression(node)
    if (!current) return false
    const literal = staticString(current)
    if (literal !== null) return literal.length > 0 && !/[\0\n\r]/.test(literal)
    if (ts.isIdentifier(current)) {
      const symbol = localSymbol(current)
      if (!symbol || seen.has(symbol) || mutatedSymbols.has(symbol)) return false
      const sourceNode = initializers.get(symbol)
      if (!sourceNode) return false
      const nextSeen = new Set(seen)
      nextSeen.add(symbol)
      return reviewedNodeScriptOperand(sourceNode, nextSeen)
    }
    if (ts.isConditionalExpression(current)) {
      return reviewedNodeScriptOperand(current.whenTrue, new Set(seen))
        && reviewedNodeScriptOperand(current.whenFalse, new Set(seen))
    }
    if (ts.isElementAccessExpression(current)) {
      const indexText = staticString(current.argumentExpression)
        ?? (ts.isNumericLiteral(unwrapExpression(current.argumentExpression)) ? unwrapExpression(current.argumentExpression).text : null)
      const index = indexText === null ? NaN : Number(indexText)
      const sourceNode = resolvedInitializer(current.expression)
      if (Number.isInteger(index) && index >= 0 && sourceNode && ts.isArrayLiteralExpression(sourceNode)) {
        const candidate = sourceNode.elements[index]
        return Boolean(candidate && !ts.isSpreadElement(candidate) && reviewedNodeScriptOperand(candidate, new Set(seen)))
      }
      return false
    }
    return reviewedPathProvenance(current, seen)
  }

  function reviewedAbsoluteScriptPath(node, seen = new Set()) {
    const current = unwrapExpression(node)
    if (!current) return false
    const literal = staticString(current)
    if (literal !== null) return /^(?:\/|[A-Za-z]:[\\/])/.test(literal) && !/[\0\n\r]/.test(literal)
    if (isImportMetaMember(current, 'dirname')) return true
    if (ts.isIdentifier(current)) {
      const symbol = localSymbol(current)
      if (!symbol || seen.has(symbol) || mutatedSymbols.has(symbol) || !initializers.has(symbol)) return false
      const nextSeen = new Set(seen)
      nextSeen.add(symbol)
      return reviewedAbsoluteScriptPath(initializers.get(symbol), nextSeen)
    }
    if (ts.isConditionalExpression(current)) {
      return reviewedAbsoluteScriptPath(current.whenTrue, new Set(seen))
        && reviewedAbsoluteScriptPath(current.whenFalse, new Set(seen))
    }
    if (!ts.isCallExpression(current)) return false
    if (
      ts.isPropertyAccessExpression(unwrapExpression(current.expression))
      && isGlobalProcessMember(unwrapExpression(current.expression), 'cwd')
      && !processCwdMutated
      && current.arguments.length === 0
    ) return true
    const imported = importedCallable(current.expression)
    if (!imported || !reviewedPathProvenance(current, new Set(seen))) return false
    if (['node:path', 'path'].includes(imported.moduleName) && imported.imported === 'resolve') return true
    if (['node:url', 'url'].includes(imported.moduleName) && imported.imported === 'fileURLToPath') return true
    if (['node:os', 'os'].includes(imported.moduleName) && imported.imported === 'tmpdir') return true
    if (['node:fs', 'fs'].includes(imported.moduleName) && imported.imported === 'realpathSync') return true
    if (['node:path', 'path'].includes(imported.moduleName) && imported.imported === 'join') {
      return current.arguments.length > 0 && reviewedAbsoluteScriptPath(current.arguments[0], new Set(seen))
    }
    return false
  }

  function reviewedForkModuleOperand(node) {
    const current = unwrapExpression(node)
    if (!current) return false
    const literal = staticString(current)
    if (literal !== null) return literal.length > 0 && !literal.startsWith('-') && !/[\0\n\r]/.test(literal)
    return reviewedAbsoluteScriptPath(current) && reviewedNodeScriptOperand(current)
  }

  function latestTopLevelPropertyAssignment(baseSymbol, property, before) {
    let latest = null
    for (const statement of sourceFile.statements) {
      if (!ts.isExpressionStatement(statement) || statement.getStart(sourceFile) >= before) continue
      const expression = unwrapExpression(statement.expression)
      if (
        !expression
        || !ts.isBinaryExpression(expression)
        || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
      ) continue
      const target = unwrapExpression(expression.left)
      if (!target || (!ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target))) continue
      const base = unwrapExpression(target.expression)
      const assignedProperty = ts.isPropertyAccessExpression(target) ? target.name.text : staticString(target.argumentExpression)
      if (!base || !ts.isIdentifier(base) || localSymbol(base) !== baseSymbol || assignedProperty !== property) continue
      latest = expression.right
    }
    return latest
  }

  function mayBeFunctionValue(node, seen = new Set()) {
    const current = unwrapExpression(node)
    if (!current) return false
    if (
      ts.isArrowFunction(current)
      || ts.isFunctionExpression(current)
      || ts.isClassExpression(current)
      || ts.isFunctionDeclaration(current)
      || ts.isClassDeclaration(current)
    ) return true
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      const property = ts.isPropertyAccessExpression(current) ? current.name.text : staticString(current.argumentExpression)
      const baseExpression = unwrapExpression(current.expression)
      const baseSymbol = baseExpression && ts.isIdentifier(baseExpression) ? localSymbol(baseExpression) : null
      const assigned = baseSymbol && property !== null
        ? latestTopLevelPropertyAssignment(baseSymbol, property, current.getStart(sourceFile))
        : null
      if (assigned) return mayBeFunctionValue(assigned, new Set(seen))
      const base = baseSymbol && initializers.has(baseSymbol)
        ? unwrapExpression(initializers.get(baseSymbol))
        : resolvedInitializer(current.expression)
      if (property !== null && base && ts.isObjectLiteralExpression(base)) {
        for (const candidate of [...base.properties].reverse()) {
          if (ts.isSpreadAssignment(candidate) || reviewedPropertyName(candidate.name) !== property) continue
          if (ts.isMethodDeclaration(candidate)) return true
          if (ts.isPropertyAssignment(candidate)) return mayBeFunctionValue(candidate.initializer, new Set(seen))
          if (ts.isShorthandPropertyAssignment(candidate)) return mayBeFunctionValue(candidate.name, new Set(seen))
          return false
        }
      }
      return false
    }
    if (ts.isCallExpression(current)) {
      const callee = unwrapExpression(current.expression)
      if (
        (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee))
        && (ts.isPropertyAccessExpression(callee) ? callee.name.text : staticString(callee.argumentExpression)) === 'bind'
      ) return mayBeFunctionValue(callee.expression, new Set(seen))
      return false
    }
    if (!ts.isIdentifier(current)) return false
    const symbol = localSymbol(current)
    if (!symbol || seen.has(symbol)) return false
    if (origins.has(symbol)) {
      const origin = origins.get(symbol)
      if (origin?.startsWith('child-process:') || origin?.startsWith('dynamic-code:') || origin?.startsWith('reflect:')) return true
    }
    if (symbol.declarations?.some(declaration => ts.isFunctionDeclaration(declaration) || ts.isClassDeclaration(declaration))) return true
    if (symbol.declarations?.some(declaration => ts.isParameter(declaration))) {
      const nextSeen = new Set(seen)
      nextSeen.add(symbol)
      for (const parameter of symbol.declarations.filter(declaration => ts.isParameter(declaration))) {
        if (parameter.initializer && mayBeFunctionValue(parameter.initializer, new Set(nextSeen))) return true
        const owner = parameter.parent
        const index = owner.parameters.indexOf(parameter)
        let callableSymbol = null
        if (ts.isFunctionDeclaration(owner) && owner.name) callableSymbol = localSymbol(owner.name)
        else if (
          (ts.isArrowFunction(owner) || ts.isFunctionExpression(owner))
          && ts.isVariableDeclaration(owner.parent)
          && ts.isIdentifier(owner.parent.name)
        ) callableSymbol = localSymbol(owner.parent.name)
        if (!callableSymbol || index < 0) continue
        let matched = false
        function inspectCallSites(candidate) {
          if (matched) return
          if (ts.isCallExpression(candidate)) {
            const callee = unwrapExpression(candidate.expression)
            if (callee && ts.isIdentifier(callee) && localSymbol(callee) === callableSymbol) {
              const argument = candidate.arguments[index]
              if (argument && mayBeFunctionValue(argument, new Set(nextSeen))) {
                matched = true
                return
              }
            }
          }
          ts.forEachChild(candidate, inspectCallSites)
        }
        inspectCallSites(sourceFile)
        if (matched) return true
      }
      return false
    }
    const initializer = initializers.get(symbol)
    if (!initializer || mutatedSymbols.has(symbol)) return false
    const nextSeen = new Set(seen)
    nextSeen.add(symbol)
    return mayBeFunctionValue(initializer, nextSeen)
  }

  function propertyOrigin(base, property) {
    if (property === 'constructor') return 'dynamic-code:constructor'
    if (base === 'child-process-namespace') {
      return property && CHILD_PROCESS_APIS.has(property) ? `child-process:${property}` : 'child-process-unknown-property'
    }
    if (base === 'global-namespace') {
      if (property === 'eval') return 'dynamic-code:eval'
      if (property === 'Function') return 'dynamic-code:Function'
      if (property === 'require') return 'module-loader:require'
      if (property === 'process') return 'process-namespace'
      return property === null ? 'global-unknown-property' : null
    }
    if (base === 'reflect-namespace') {
      return ['apply', 'construct', 'get'].includes(property) ? `reflect:${property}` : null
    }
    if (base === 'node-module-namespace') {
      return property === 'createRequire' ? 'module-loader:createRequire' : 'module-loader:nodeModuleAccess'
    }
    if (base === 'process-namespace') {
      if (property === 'execPath') return 'process-exec-path'
      if (property === 'cwd') return 'process-cwd'
      if (property === 'argv' || property === 'env') return 'process-external-input'
      if (property === 'getBuiltinModule') return 'module-loader:getBuiltinModule'
      return property === null ? 'process-unknown-property' : null
    }
    if (base === 'process-external-input') return 'process-external-input'
    if (
      (
        base === 'dynamic-code:eval'
        || base === 'dynamic-code:Function'
        || base === 'module-loader:require'
        || base?.startsWith('reflect:')
        || base?.startsWith('child-process:')
      )
      && ['apply', 'bind', 'call'].includes(property)
    ) return base
    return null
  }

  function staticArrayElements(node, seen = new Set()) {
    const current = resolvedInitializer(node, seen)
    if (!current || !ts.isArrayLiteralExpression(current)) return null
    const elements = []
    for (const element of current.elements) {
      if (ts.isSpreadElement(element)) {
        const spread = staticArrayElements(element.expression, new Set(seen))
        if (spread === null) return null
        elements.push(...spread)
      } else {
        elements.push(element)
      }
    }
    return elements
  }

  function expressionOrigin(node) {
    const current = unwrapExpression(node)
    if (!current) return null
    if (ts.isIdentifier(current)) {
      const symbol = localSymbol(current)
      if (symbol && origins.has(symbol)) return origins.get(symbol)
      if (!isLocallyDeclared(symbol)) {
        if (current.text === 'eval') return 'dynamic-code:eval'
        if (current.text === 'Function') return 'dynamic-code:Function'
        if (current.text === 'require') return 'module-loader:require'
        if (current.text === 'Reflect') return 'reflect-namespace'
        if (current.text === 'process') return 'process-namespace'
        if (['global', 'globalThis', 'self', 'window'].includes(current.text)) return 'global-namespace'
      }
      return null
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      const base = expressionOrigin(current.expression)
      const property = ts.isPropertyAccessExpression(current)
        ? current.name.text
        : staticString(current.argumentExpression)
      if (ts.isElementAccessExpression(current) && property === null && mayBeFunctionValue(current.expression)) {
        return 'dynamic-code:constructor'
      }
      return propertyOrigin(base, property)
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return expressionOrigin(current.right)
    }
    if (ts.isCallExpression(current)) {
      const callee = unwrapExpression(current.expression)
      const calleeOrigin = expressionOrigin(callee)
      if (calleeOrigin === 'module-loader:require') {
        const requestedModule = staticString(current.arguments[0])
        if (requestedModule && CHILD_PROCESS_MODULES.has(requestedModule)) return 'child-process-namespace'
        if (requestedModule && NODE_MODULE_MODULES.has(requestedModule)) return 'node-module-namespace'
        if (requestedModule && DYNAMIC_CODE_MODULES.has(requestedModule)) return 'dynamic-code:vm-module'
        return requestedModule === null ? 'module-loader:dynamic-call' : null
      }
      if (calleeOrigin === 'module-loader:createRequire') return 'module-loader:require'
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        const requestedModule = staticString(current.arguments[0])
        if (requestedModule && CHILD_PROCESS_MODULES.has(requestedModule)) return 'child-process-namespace'
        if (requestedModule && NODE_MODULE_MODULES.has(requestedModule)) return 'node-module-namespace'
        if (requestedModule && DYNAMIC_CODE_MODULES.has(requestedModule)) return 'dynamic-code:vm-module'
        return requestedModule === null ? 'module-loader:dynamic-call' : null
      }
      if (calleeOrigin === 'reflect:get') {
        const property = staticString(current.arguments[1])
        if (property === null && mayBeFunctionValue(current.arguments[0])) return 'dynamic-code:constructor'
        return propertyOrigin(expressionOrigin(current.arguments[0]), property)
      }
      if (calleeOrigin === 'reflect:apply') {
        const targetOrigin = expressionOrigin(current.arguments[0])
        const reflectedArguments = staticArrayElements(current.arguments[2])
        if (targetOrigin === 'module-loader:require') {
          const requestedModule = reflectedArguments?.length ? staticString(reflectedArguments[0]) : null
          if (requestedModule && CHILD_PROCESS_MODULES.has(requestedModule)) return 'child-process-namespace'
          return requestedModule === null ? 'module-loader:dynamic-call' : null
        }
        if (targetOrigin === 'reflect:get') {
          if (!reflectedArguments || reflectedArguments.length < 2) return 'reflect:dynamic-call'
          const property = staticString(reflectedArguments[1])
          if (property === null && mayBeFunctionValue(reflectedArguments[0])) return 'dynamic-code:constructor'
          return propertyOrigin(expressionOrigin(reflectedArguments[0]), property)
        }
        if (targetOrigin?.startsWith('child-process:')) return `indirect-${targetOrigin}`
        if (targetOrigin?.startsWith('reflect:')) return 'reflect:dynamic-call'
        return targetOrigin
      }
      if (calleeOrigin === 'reflect:construct') {
        const targetOrigin = expressionOrigin(current.arguments[0])
        if (targetOrigin?.startsWith('child-process:')) return `indirect-${targetOrigin}`
        if (targetOrigin?.startsWith('reflect:')) return 'reflect:dynamic-call'
        return targetOrigin
      }
      if (
        calleeOrigin === 'dynamic-code:eval'
        || calleeOrigin === 'dynamic-code:Function'
      ) return calleeOrigin
    }
    return null
  }

  function boundPropertyOrigin(origin, property) {
    if (property === 'constructor') return 'dynamic-code:constructor'
    if (origin === 'child-process-namespace') {
      return property && CHILD_PROCESS_APIS.has(property) ? `child-process:${property}` : 'child-process-unknown-property'
    }
    if (origin === 'global-namespace') {
      if (property === 'eval') return 'dynamic-code:eval'
      if (property === 'Function') return 'dynamic-code:Function'
      if (property === 'require') return 'module-loader:require'
      if (property === 'process') return 'process-namespace'
      return property === null ? 'global-unknown-property' : null
    }
    if (origin === 'reflect-namespace') {
      return ['apply', 'construct', 'get'].includes(property) ? `reflect:${property}` : null
    }
    if (origin === 'node-module-namespace') {
      return property === 'createRequire' ? 'module-loader:createRequire' : null
    }
    if (origin === 'process-namespace' && (property === 'argv' || property === 'env')) return 'process-external-input'
    if (origin === 'process-external-input') return 'process-external-input'
    return null
  }

  function bindPattern(pattern, origin) {
    let changed = false
    if (ts.isIdentifier(pattern)) return setOrigin(pattern, origin)
    if (!ts.isObjectBindingPattern(pattern)) return false
    for (const element of pattern.elements) {
      const property = reviewedPropertyName(element.propertyName ?? element.name)
      changed = bindPattern(element.name, boundPropertyOrigin(origin, property)) || changed
    }
    return changed
  }

  function bindAssignmentPattern(pattern, origin) {
    const current = unwrapExpression(pattern)
    if (!current) return false
    if (ts.isIdentifier(current)) return setOrigin(current, origin)
    if (
      ts.isBinaryExpression(current)
      && current.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) return bindAssignmentPattern(current.left, origin)
    if (!ts.isObjectLiteralExpression(current)) return false
    let changed = false
    for (const property of current.properties) {
      if (ts.isSpreadAssignment(property)) continue
      const propertyName = reviewedPropertyName(property.name)
      const target = ts.isPropertyAssignment(property)
        ? property.initializer
        : ts.isShorthandPropertyAssignment(property)
          ? property.name
          : null
      if (target) changed = bindAssignmentPattern(target, boundPropertyOrigin(origin, propertyName)) || changed
    }
    return changed
  }

  function collectBindings(node) {
    if (ts.isImportDeclaration(node) && CHILD_PROCESS_MODULES.has(literalString(node.moduleSpecifier))) {
      const clause = node.importClause
      if (clause?.name) setOrigin(clause.name, 'child-process-namespace')
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) setOrigin(bindings.name, 'child-process-namespace')
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = (element.propertyName ?? element.name).text
          setOrigin(element.name, CHILD_PROCESS_APIS.has(imported) ? `child-process:${imported}` : 'child-process-unknown-property')
        }
      }
    }
    if (ts.isImportDeclaration(node) && NODE_MODULE_MODULES.has(literalString(node.moduleSpecifier))) {
      const clause = node.importClause
      if (clause?.name) setOrigin(clause.name, 'node-module-namespace')
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) setOrigin(bindings.name, 'node-module-namespace')
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = (element.propertyName ?? element.name).text
          setOrigin(element.name, imported === 'createRequire' ? 'module-loader:createRequire' : null)
        }
      }
    }
    if (ts.isImportDeclaration(node) && DYNAMIC_CODE_MODULES.has(literalString(node.moduleSpecifier))) {
      const clause = node.importClause
      if (clause?.name) setOrigin(clause.name, 'dynamic-code:vm-module')
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) setOrigin(bindings.name, 'dynamic-code:vm-module')
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) setOrigin(element.name, 'dynamic-code:vm-module')
      }
    }
    if (
      ts.isVariableDeclaration(node)
      && node.initializer
      && (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      const symbol = ts.isIdentifier(node.name) ? localSymbol(node.name) : null
      if (symbol) initializers.set(symbol, node.initializer)
    }
    ts.forEachChild(node, collectBindings)
  }
  collectBindings(sourceFile)

  for (let iteration = 0; iteration < 32; iteration += 1) {
    let changed = false
    function collectAliases(node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        changed = bindPattern(node.name, expressionOrigin(node.initializer)) || changed
      } else if (ts.isParameter(node) && node.initializer) {
        changed = bindPattern(node.name, expressionOrigin(node.initializer)) || changed
      } else if (ts.isParameter(node) && ts.isObjectBindingPattern(node.name)) {
        changed = bindPattern(node.name, null) || changed
      } else if (
        ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        changed = bindAssignmentPattern(node.left, expressionOrigin(node.right)) || changed
      }
      ts.forEachChild(node, collectAliases)
    }
    collectAliases(sourceFile)
    if (!changed) break
  }

  function rootLocalSymbol(node) {
    let current = unwrapExpression(node)
    while (current && (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))) {
      current = unwrapExpression(current.expression)
    }
    return current && ts.isIdentifier(current) ? localSymbol(current) : null
  }

  function initializerShape(symbol) {
    if (!symbol || !initializers.has(symbol)) return null
    const current = resolvedInitializer(initializers.get(symbol))
    if (current && ts.isArrayLiteralExpression(current)) return 'array'
    if (current && ts.isObjectLiteralExpression(current)) return 'object'
    return null
  }

  function markInitializerClosure(node) {
    const symbol = rootLocalSymbol(node)
    if (initializerShape(symbol)) mutatedSymbols.add(symbol)
  }

  function isReviewedProcessArgument(call, argument) {
    const origin = expressionOrigin(call.expression)
    if (!origin?.startsWith('child-process:')) return false
    const api = origin.slice('child-process:'.length)
    return STRUCTURED_PROCESS_APIS.has(api) && call.arguments.includes(argument)
  }

  function collectInitializerMutations(node) {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node))
      && node.initializer
      && !(
        ts.isVariableDeclaration(node)
        && (node.parent.flags & ts.NodeFlags.Const) !== 0
        && ts.isIdentifier(unwrapExpression(node.initializer))
      )
    ) {
      function markReferencedClosures(current) {
        if (ts.isCallExpression(current)) {
          const origin = expressionOrigin(current.expression)
          const api = origin?.startsWith('child-process:') ? origin.slice('child-process:'.length) : null
          if (api && STRUCTURED_PROCESS_APIS.has(api)) return
        }
        if (ts.isIdentifier(current)) markInitializerClosure(current)
        ts.forEachChild(current, markReferencedClosures)
      }
      markReferencedClosures(node.initializer)
    }
    if (
      ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      if (expressionOrigin(node.left) === 'process-exec-path' || isSyntacticProcessExecPath(node.left)) processExecPathMutated = true
      if (expressionOrigin(node.left) === 'process-cwd' || isSyntacticProcessCwd(node.left)) processCwdMutated = true
      const target = rootLocalSymbol(node.left)
      if (target) mutatedSymbols.add(target)
      if (ts.isIdentifier(unwrapExpression(node.right))) markInitializerClosure(node.right)
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
    ) {
      if (expressionOrigin(node.operand) === 'process-exec-path' || isSyntacticProcessExecPath(node.operand)) processExecPathMutated = true
      if (expressionOrigin(node.operand) === 'process-cwd' || isSyntacticProcessCwd(node.operand)) processCwdMutated = true
      const target = rootLocalSymbol(node.operand)
      if (target) mutatedSymbols.add(target)
    }
    if (ts.isDeleteExpression(node)) {
      if (expressionOrigin(node.expression) === 'process-exec-path' || isSyntacticProcessExecPath(node.expression)) processExecPathMutated = true
      if (expressionOrigin(node.expression) === 'process-cwd' || isSyntacticProcessCwd(node.expression)) processCwdMutated = true
      const target = rootLocalSymbol(node.expression)
      if (target) mutatedSymbols.add(target)
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression)
      if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) {
        const target = rootLocalSymbol(callee.expression)
        const shape = initializerShape(target)
        const method = ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : staticString(callee.argumentExpression)
        if (shape === 'array' && (!method || !NON_MUTATING_ARRAY_METHODS.has(method))) mutatedSymbols.add(target)
        else if (shape === 'object') mutatedSymbols.add(target)

        const namespace = expressionOrigin(callee.expression)
        if (
          (namespace === 'global-namespace' && ['Object', 'Reflect'].includes(method))
          || (ts.isIdentifier(callee.expression) && ['Object', 'Reflect'].includes(callee.expression.text))
        ) markInitializerClosure(node.arguments[0])
      }
      for (const argument of node.arguments) {
        const candidate = ts.isSpreadElement(argument) ? argument.expression : argument
        if (!isReviewedProcessArgument(node, argument)) markInitializerClosure(candidate)
      }
    }
    if (ts.isNewExpression(node)) {
      for (const argument of node.arguments ?? []) markInitializerClosure(argument)
    }
    if (ts.isReturnStatement(node) && node.expression) markInitializerClosure(node.expression)
    if (ts.isYieldExpression(node) && node.expression) markInitializerClosure(node.expression)
    if (
      ts.isPropertyAssignment(node)
      || ts.isShorthandPropertyAssignment(node)
      || ts.isArrayLiteralExpression(node)
      || ts.isSpreadAssignment(node)
    ) {
      const candidate = ts.isPropertyAssignment(node)
        ? node.initializer
        : ts.isShorthandPropertyAssignment(node)
          ? node.name
        : ts.isSpreadAssignment(node)
          ? node.expression
          : null
      if (candidate) markInitializerClosure(candidate)
      if (ts.isArrayLiteralExpression(node)) for (const element of node.elements) markInitializerClosure(element)
    }
    ts.forEachChild(node, collectInitializerMutations)
  }
  collectInitializerMutations(sourceFile)

  for (let iteration = 0; iteration < initializers.size + 1; iteration += 1) {
    let changed = false
    for (const [symbol, initializer] of initializers) {
      const current = unwrapExpression(initializer)
      if (!current || !ts.isIdentifier(current)) continue
      const target = localSymbol(current)
      if (!target) continue
      if (mutatedSymbols.has(symbol) && !mutatedSymbols.has(target)) {
        mutatedSymbols.add(target)
        changed = true
      }
      if (mutatedSymbols.has(target) && !mutatedSymbols.has(symbol)) {
        mutatedSymbols.add(symbol)
        changed = true
      }
    }
    if (!changed) break
  }

  function shellOptionState(node, seen = new Set()) {
    const current = resolvedInitializer(node, seen)
    if (!current || !ts.isObjectLiteralExpression(current)) return 'unknown'
    if (seen.has(current)) return 'unknown'
    const nextSeen = new Set(seen)
    nextSeen.add(current)
    let state = 'absent'
    for (const property of current.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spreadState = shellOptionState(property.expression, nextSeen)
        if (spreadState !== 'absent') state = spreadState
        continue
      }
      const propertyName = reviewedPropertyName(property.name)
      if (propertyName === null) {
        state = 'unknown'
        continue
      }
      if (propertyName === '__proto__') {
        state = 'unsafe'
        continue
      }
      if (propertyName !== 'shell') continue
      if (ts.isPropertyAssignment(property)) {
        state = resolvedInitializer(property.initializer)?.kind === ts.SyntaxKind.FalseKeyword ? 'false' : 'unsafe'
      } else if (ts.isShorthandPropertyAssignment(property)) {
        state = resolvedInitializer(property.name)?.kind === ts.SyntaxKind.FalseKeyword ? 'false' : 'unsafe'
      } else {
        state = 'unsafe'
      }
    }
    return state
  }

  function shellEvalFlagState(node, { posixDelimiter = false } = {}) {
    const elements = staticArrayElements(node)
    if (elements === null) return 'unknown'
    let state = 'absent'
    for (const element of elements) {
      const value = staticString(element)
      if (value === null) state = 'unknown'
      else if (value === '--' && posixDelimiter) return state
      else {
        const lower = value.toLowerCase()
        if (
          /^-[^-]*c/.test(value)
          || ['/c', '/k', '-command', '-encodedcommand'].includes(lower)
          || lower.startsWith('-enc')
        ) return 'present'
      }
    }
    return state
  }

  function reviewedArrayItems(node, seen = new Set()) {
    const current = resolvedInitializer(node, seen)
    if (!current || !ts.isArrayLiteralExpression(current) || seen.has(current)) return null
    const nextSeen = new Set(seen)
    nextSeen.add(current)
    const items = []
    for (const element of current.elements) {
      if (!ts.isSpreadElement(element)) {
        items.push(element)
        continue
      }
      const spread = reviewedArrayItems(element.expression, nextSeen)
      if (spread === null) items.push(null)
      else items.push(...spread)
    }
    return items
  }

  function isNodeDynamicCodeFlag(value) {
    const lower = value.toLowerCase()
    const longFlags = [
      '--env-file',
      '--env-file-if-exists',
      '--eval',
      '--experimental-loader',
      '--import',
      '--loader',
      '--print',
      '--require',
      '--run',
    ]
    if (longFlags.some(flag => lower === flag || lower.startsWith(`${flag}=`))) return true
    return /^-(?!-)[a-z]*[epr]/i.test(value)
  }

  function nodePreScriptArgvState(node) {
    if (!node) return 'no-script'
    const items = reviewedArrayItems(node)
    if (items === null) return 'unknown'
    if (items.length === 1 && items[0] !== null) {
      const onlyValue = staticString(items[0])
      if (onlyValue !== null && ['--version', '-v', '--help', '-h'].includes(onlyValue.toLowerCase())) return 'terminal'
    }
    let sawOption = false
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (item === null) return 'unknown'
      const value = staticString(item)
      if (value === null) return 'unknown'
      if (isNodeDynamicCodeFlag(value)) return 'present'
      if (value === '--') {
        const script = items[index + 1]
        if (!script) return 'no-script'
        return reviewedNodeScriptOperand(script) ? 'script' : 'unreviewable-script'
      }
      if (value.startsWith('-')) sawOption = true
      else if (!sawOption) return reviewedNodeScriptOperand(item) ? 'script' : 'unreviewable-script'
    }
    return 'no-script'
  }

  function nodeForkExecArgvState(node) {
    const items = reviewedArrayItems(node)
    if (items === null) return 'unknown'
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (item === null) return 'unknown'
      const value = staticString(item)
      if (value === null) return 'unknown'
      if (isNodeDynamicCodeFlag(value)) return 'present'
      if (value === '--') return index === items.length - 1 ? 'absent' : 'script-injection'
      if (value !== '--enable-source-maps') return value.startsWith('-') ? 'unreviewed-option' : 'script-injection'
    }
    return 'absent'
  }

  function objectPropertyValue(node, target, seen = new Set()) {
    const current = resolvedInitializer(node, seen)
    if (!current || !ts.isObjectLiteralExpression(current) || seen.has(current)) {
      return { state: 'unknown', value: null }
    }
    const nextSeen = new Set(seen)
    nextSeen.add(current)
    let result = { state: 'absent', value: null }
    for (const property of current.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = objectPropertyValue(property.expression, target, nextSeen)
        if (spread.state !== 'absent') result = spread
        continue
      }
      const propertyName = reviewedPropertyName(property.name)
      if (propertyName === null || propertyName === '__proto__') {
        result = { state: 'unknown', value: null }
        continue
      }
      if (propertyName !== target) continue
      if (ts.isPropertyAssignment(property)) result = { state: 'present', value: property.initializer }
      else if (ts.isShorthandPropertyAssignment(property)) result = { state: 'present', value: property.name }
      else result = { state: 'unknown', value: null }
    }
    return result
  }

  function isProcessExecPath(node) {
    const current = resolvedInitializer(node)
    return !processExecPathMutated && expressionOrigin(current) === 'process-exec-path'
  }

  function assertForkOptionsAreSafe(options) {
    invariant(options, `Harness source must close inherited fork execArgv with explicit options:${repoPath}`)
    const current = resolvedInitializer(options)
    invariant(
      current && ts.isObjectLiteralExpression(current),
      `Harness source uses an unreviewable fork options value:${repoPath}`,
    )
    const shellState = shellOptionState(current)
    invariant(shellState !== 'unsafe', `Harness source uses forbidden shell option:${repoPath}`)
    invariant(shellState !== 'unknown', `Harness source uses an unreviewable shell option:${repoPath}`)

    const execPath = objectPropertyValue(current, 'execPath')
    invariant(execPath.state !== 'unknown', `Harness source uses an unreviewable fork execPath:${repoPath}`)
    if (execPath.state === 'present') {
      const executable = staticString(execPath.value)
      const executableName = executable?.split(/[\\/]/).at(-1)?.toLowerCase()
      invariant(
        isProcessExecPath(execPath.value) || ['node', 'node.exe'].includes(executableName),
        `Harness source uses a forbidden fork execPath:${repoPath}`,
      )
    } else {
      invariant(!processExecPathMutated, `Harness source inherits a mutated fork execPath:${repoPath}`)
    }

    const execArgv = objectPropertyValue(current, 'execArgv')
    invariant(execArgv.state !== 'unknown', `Harness source uses an unreviewable fork execArgv:${repoPath}`)
    invariant(execArgv.state === 'present', `Harness source must close inherited fork execArgv explicitly:${repoPath}`)
    const state = nodeForkExecArgvState(execArgv.value)
    invariant(state !== 'present', `Harness source uses forbidden Node dynamic-code flags in fork execArgv:${repoPath}`)
    invariant(state !== 'script-injection', `Harness source uses a fork execArgv value that can replace the reviewed module path:${repoPath}`)
    invariant(state !== 'unreviewed-option', `Harness source uses an unreviewed Node option in fork execArgv:${repoPath}`)
    invariant(state !== 'unknown', `Harness source uses an unreviewable fork execArgv:${repoPath}`)
  }

  function assertForkCallIsSafe(args) {
    invariant(args.length >= 1 && args.length <= 3, `Harness source uses an invalid fork invocation shape:${repoPath}`)
    invariant(
      reviewedForkModuleOperand(args[0]),
      `Harness source uses an unreviewable fork module path:${repoPath}`,
    )
    let options = null
    if (args.length === 2) {
      const second = resolvedInitializer(args[1])
      invariant(
        second && (ts.isArrayLiteralExpression(second) || ts.isObjectLiteralExpression(second)),
        `Harness source uses an ambiguous fork args/options value:${repoPath}`,
      )
      if (ts.isObjectLiteralExpression(second)) options = args[1]
    } else if (args.length === 3) {
      const second = resolvedInitializer(args[1])
      const third = resolvedInitializer(args[2])
      invariant(second && ts.isArrayLiteralExpression(second), `Harness source uses an unreviewable fork args value:${repoPath}`)
      invariant(third && ts.isObjectLiteralExpression(third), `Harness source uses an unreviewable fork options value:${repoPath}`)
      options = args[2]
    }
    assertForkOptionsAreSafe(options)
  }

  function assertStructuredProcessCallIsSafe(api, args) {
    if (api === 'fork') {
      assertForkCallIsSafe(args)
      return
    }
    let optionsState = 'absent'
    if (args.length >= 3) {
      const third = resolvedInitializer(args[2])
      invariant(
        third && ts.isObjectLiteralExpression(third),
        `Harness source uses an unreviewable process options value:${repoPath}`,
      )
      optionsState = shellOptionState(third)
    } else if (args.length === 2) {
      const second = resolvedInitializer(args[1])
      if (second && ts.isObjectLiteralExpression(second)) optionsState = shellOptionState(second)
      else invariant(
        second && ts.isArrayLiteralExpression(second),
        `Harness source uses an ambiguous process argv/options value:${repoPath}`,
      )
    }
    invariant(optionsState !== 'unsafe', `Harness source uses forbidden shell option:${repoPath}`)
    invariant(optionsState !== 'unknown', `Harness source uses an unreviewable shell option:${repoPath}`)

    const executable = staticString(args[0])
    const executableName = executable?.split(/[\\/]/).at(-1)?.toLowerCase()
    invariant(
      !executableName || !SHELL_EXECUTABLES.has(executableName) || POSIX_SHELL_EXECUTABLES.has(executableName),
      `Harness source uses an unreviewable non-POSIX shell executable:${repoPath}`,
    )
    invariant(
      isProcessExecPath(args[0]) || (executableName && REVIEWED_PROCESS_EXECUTABLES.has(executableName)),
      `Harness source uses an executable outside the reviewed allowlist:${repoPath}`,
    )
    const argvState = args.length >= 2 && !ts.isObjectLiteralExpression(resolvedInitializer(args[1]))
      ? shellEvalFlagState(args[1], { posixDelimiter: POSIX_SHELL_EXECUTABLES.has(executableName) })
      : 'absent'
    const nodeExecutable = isProcessExecPath(args[0]) || ['node', 'node.exe'].includes(executableName)
    const nodeArgvState = nodeExecutable
      ? nodePreScriptArgvState(
        args.length >= 2 && !ts.isObjectLiteralExpression(resolvedInitializer(args[1])) ? args[1] : null,
      )
      : 'absent'
    invariant(
      nodeArgvState !== 'present',
      `Harness source uses forbidden Node dynamic-code flags:${repoPath}`,
    )
    invariant(
      nodeArgvState !== 'unknown',
      `Harness source uses unreviewable Node pre-script argv:${repoPath}`,
    )
    invariant(
      nodeArgvState !== 'unreviewable-script',
      `Harness source uses an unreviewable Node script operand:${repoPath}`,
    )
    invariant(
      nodeArgvState !== 'no-script',
      `Harness source invokes Node without a reviewed script operand or terminal flag:${repoPath}`,
    )
    invariant(
      argvState !== 'present' || (executableName && !SHELL_EXECUTABLES.has(executableName)) || isProcessExecPath(args[0]),
      `Harness source uses forbidden shell command evaluation:${repoPath}`,
    )
    invariant(
      !(executableName && SHELL_EXECUTABLES.has(executableName) && argvState === 'unknown'),
      `Harness source uses unreviewable shell command arguments:${repoPath}`,
    )
    invariant(
      executable !== null || isProcessExecPath(args[0]) || argvState !== 'unknown',
      `Harness source uses an unreviewable dynamic executable and argv:${repoPath}`,
    )
  }

  function assertNoHiddenNodeDynamicOptions(args) {
    for (const argument of args) {
      const options = resolvedInitializer(argument)
      if (!options || !ts.isObjectLiteralExpression(options)) continue
      const command = objectPropertyValue(options, 'command')
      const argv = objectPropertyValue(options, 'args')
      if (command.state !== 'present' || argv.state !== 'present') continue
      const executable = staticString(command.value)
      const executableName = executable?.split(/[\\/]/).at(-1)?.toLowerCase()
      if (!isProcessExecPath(command.value) && !['node', 'node.exe'].includes(executableName)) continue
      invariant(
        nodePreScriptArgvState(argv.value) !== 'present',
        `Harness source passes forbidden Node dynamic-code flags through a structured executor:${repoPath}`,
      )
    }
  }

  function forbiddenOriginName(origin) {
    if (origin === 'dynamic-code:eval' || origin === 'dynamic-code:Function' || origin === 'dynamic-code:constructor') return origin.replace('dynamic-code:', '')
    if (origin === 'child-process:exec' || origin === 'child-process:execSync') return origin.replace('child-process:', '')
    if (origin === 'child-process-unknown-property') return 'dynamic child_process property'
    if (origin === 'global-unknown-property') return 'dynamic global property'
    if (origin === 'module-loader:dynamic-call') return 'dynamic module loading'
    if (origin === 'module-loader:createRequire') return 'createRequire module loading'
    if (origin === 'module-loader:getBuiltinModule') return 'getBuiltinModule module loading'
    if (origin === 'module-loader:nodeModuleAccess') return 'private node:module loading'
    if (origin === 'dynamic-code:vm-module') return 'node:vm dynamic code'
    if (origin === 'process-unknown-property') return 'dynamic process property'
    if (origin === 'reflect:dynamic-call') return 'dynamic Reflect invocation'
    if (origin?.startsWith('indirect-child-process:')) return 'indirect child_process invocation'
    return null
  }

  function isDeclarationIdentifier(node) {
    const symbol = localSymbol(node)
    return Boolean(symbol?.declarations?.some(declaration => (
      declaration.getSourceFile() === sourceFile
      && declaration.name
      && node.pos >= declaration.name.pos
      && node.end <= declaration.name.end
    )))
  }

  function declarationIsExported(node) {
    const symbol = localSymbol(node)
    return Boolean(symbol?.declarations?.some(declaration => {
      let current = declaration
      while (current && current !== sourceFile) {
        if (current.modifiers?.some(modifier => (
          modifier.kind === ts.SyntaxKind.ExportKeyword
          || modifier.kind === ts.SyntaxKind.DefaultKeyword
        ))) return true
        current = current.parent
      }
      return false
    }))
  }

  function constructorUseIsBenignInspection(node) {
    if (ts.isIdentifier(node) && isDeclarationIdentifier(node)) return !declarationIsExported(node)
    let current = node
    while (
      current.parent
      && (
        ts.isParenthesizedExpression(current.parent)
        || ts.isAsExpression(current.parent)
        || ts.isTypeAssertionExpression(current.parent)
        || ts.isNonNullExpression(current.parent)
        || ts.isAwaitExpression(current.parent)
      )
      && current.parent.expression === current
    ) current = current.parent
    const parent = current.parent
    if (ts.isVariableDeclaration(parent) && parent.initializer === current) {
      return ts.isIdentifier(parent.name) && !declarationIsExported(parent.name)
    }
    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === current) {
      const property = ts.isPropertyAccessExpression(parent) ? parent.name.text : staticString(parent.argumentExpression)
      return property === 'name' || property === 'length'
    }
    if (ts.isTypeOfExpression(parent) && parent.expression === current) return true
    if (
      ts.isBinaryExpression(parent)
      && (parent.left === current || parent.right === current)
      && [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(parent.operatorToken.kind)
    ) return true
    return ts.isExpressionStatement(parent)
  }

  function privilegedUseIsLocalAndReviewable(node, origin) {
    if (ts.isIdentifier(node) && isDeclarationIdentifier(node)) return true
    let current = node
    while (
      current.parent
      && (
        ts.isParenthesizedExpression(current.parent)
        || ts.isAsExpression(current.parent)
        || ts.isTypeAssertionExpression(current.parent)
        || ts.isNonNullExpression(current.parent)
        || ts.isAwaitExpression(current.parent)
      )
      && current.parent.expression === current
    ) current = current.parent
    const parent = current.parent
    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === current) return true
    if (ts.isVariableDeclaration(parent) && parent.initializer === current) return true
    if (
      ts.isCallExpression(parent)
      && parent.expression === current
      && (
        origin === 'module-loader:require'
        || origin?.startsWith('child-process:')
        || origin?.startsWith('reflect:')
      )
    ) return true
    if (
      ts.isBinaryExpression(parent)
      && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && parent.right === current
      && ts.isIdentifier(parent.left)
    ) return true
    return false
  }

  function assertNamespaceDoesNotEscape(node, origin) {
    if (origin !== 'child-process-namespace' && origin !== 'node-module-namespace') return
    invariant(privilegedUseIsLocalAndReviewable(node, origin), `Harness source lets a privileged module namespace escape static review:${repoPath}`)
  }

  function assertPrivilegedIdentifierDoesNotEscape(node, origin) {
    if (
      origin !== 'global-namespace'
      && origin !== 'reflect-namespace'
      && origin !== 'process-namespace'
      && origin !== 'module-loader:require'
      && !origin?.startsWith('reflect:')
      && !origin?.startsWith('child-process:')
    ) return
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
    invariant(privilegedUseIsLocalAndReviewable(node, origin), `Harness source lets a privileged executable value escape static review:${repoPath}:${line}:${node.text}`)
  }

  function assertSafeCalls(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const value = staticString(node)
      invariant(
        value === null || !/^#![^\r\n]*(?:\r?\n|$)/.test(value) || !hasForbiddenNodeShellCode(value),
        `Harness source embeds forbidden runtime-generated Node dynamic code:${repoPath}`,
      )
    }
    if (ts.isIdentifier(node)) {
      if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
        ts.forEachChild(node, assertSafeCalls)
        return
      }
      const origin = expressionOrigin(node)
      const forbidden = forbiddenOriginName(origin)
      if (forbidden && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
        invariant(
          forbidden === 'constructor' && constructorUseIsBenignInspection(node),
          `Harness source uses forbidden ${forbidden}:${repoPath}`,
        )
      }
      assertNamespaceDoesNotEscape(node, origin)
      assertPrivilegedIdentifierDoesNotEscape(node, origin)
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const baseOrigin = expressionOrigin(node.expression)
      const property = ts.isPropertyAccessExpression(node) ? node.name.text : staticString(node.argumentExpression)
      invariant(
        !(baseOrigin?.startsWith('reflect:') && ['apply', 'bind', 'call'].includes(property)),
        `Harness source uses forbidden indirect Reflect invocation:${repoPath}`,
      )
      const origin = expressionOrigin(node)
      const forbidden = forbiddenOriginName(origin)
      invariant(
        !forbidden || (forbidden === 'constructor' && constructorUseIsBenignInspection(node)),
        `Harness source uses forbidden ${forbidden}:${repoPath}`,
      )
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      assertNoHiddenNodeDynamicOptions(node.arguments ?? [])
      const origin = expressionOrigin(node.expression)
      const callResultOrigin = ts.isCallExpression(node) ? expressionOrigin(node) : null
      assertNamespaceDoesNotEscape(node, callResultOrigin)
      const forbiddenOrigin = forbiddenOriginName(origin)
      const forbiddenResult = forbiddenOriginName(callResultOrigin)
      const forbiddenCall = forbiddenOrigin ?? forbiddenResult
      invariant(
        !forbiddenCall
          || (
            !forbiddenOrigin
            && forbiddenResult === 'constructor'
            && constructorUseIsBenignInspection(node)
          ),
        `Harness source uses forbidden ${forbiddenCall}:${repoPath}`,
      )
      if (origin === 'module-loader:require') {
        invariant(staticString(node.arguments?.[0]) !== null, `Harness source uses forbidden dynamic module loading:${repoPath}`)
      }
      if (origin?.startsWith('child-process:')) {
        const api = origin.slice('child-process:'.length)
        invariant(CHILD_PROCESS_APIS.has(api), `Harness source uses forbidden dynamic child_process property:${repoPath}`)
        invariant(!STRING_SHELL_APIS.has(api), `Harness source uses forbidden ${api} string-shell execution:${repoPath}`)
        if (STRUCTURED_PROCESS_APIS.has(api)) {
          const args = node.arguments ?? []
          assertStructuredProcessCallIsSafe(api, args)
        }
      }
    }
    ts.forEachChild(node, assertSafeCalls)
  }
  assertSafeCalls(sourceFile)
  const after = captureReviewedEntrypoint(repoRoot, repoPath, absolutePath)
  invariant(after.key === before.key, `Harness reviewed entrypoint changed while safety was being verified:${repoPath}`)
  rememberReviewedEntrypointSafety(before.key)
}

export function readHarnessSourceInventory(path = resolve(GOVERNANCE_ROOT, 'providers/harness-source-inventory.json')) {
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'Harness source inventory must be a regular no-link file')
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function discoverHarnessSources(repoRoot = DEFAULT_HARNESS_SOURCE_REPO_ROOT) {
  const root = canonicalRepoRoot(repoRoot)
  const discovered = []
  for (const matcher of SOURCE_ROOT_MATCHERS) {
    const directory = resolveRegularRepoDirectory(root, matcher.directory, 'Harness source root')
    function visit(absoluteDirectory, relativeDirectory = '') {
      for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
        const repoPath = `${matcher.directory}/${relativePath}`
        invariant(!entry.isSymbolicLink(), `Harness recursive source root contains a symbolic link:${repoPath}`)
        if (entry.isDirectory()) {
          visit(resolve(absoluteDirectory, entry.name), relativePath)
          continue
        }
        if (!matcher.matches(entry.name)) continue
        resolveRegularRepoFile(root, repoPath, 'Discovered Harness source')
        discovered.push(repoPath)
      }
    }
    visit(directory)
  }
  return discovered.sort(compareUtf8Bytes)
}

export function deriveHarnessGeneratedMirrorBinding(inventory, {
  repoRoot = DEFAULT_HARNESS_SOURCE_REPO_ROOT,
} = {}) {
  invariant(Array.isArray(inventory?.generatedMirrors) && inventory.generatedMirrors.length === 1, 'Harness source inventory must bind the generated hook-test mirror exactly once')
  const mirror = inventory.generatedMirrors[0]
  exactKeys(mirror, ['id', 'canonicalRoot', 'mirrorRoot', 'include', 'treeSha256'], 'Harness generated mirror binding')
  invariant(mirror.id === 'claude-hook-behavioral-tests', 'Harness generated mirror identity is invalid')
  invariant(mirror.canonicalRoot === CANONICAL_HOOK_TEST_ROOT, 'Harness generated mirror canonical root is invalid')
  invariant(mirror.mirrorRoot === CLAUDE_HOOK_TEST_MIRROR_ROOT, 'Harness generated mirror root is invalid')
  invariant(
    JSON.stringify(mirror.include) === JSON.stringify(['run-all.sh', '**/*.mjs', '**/test_*.sh', '**/test_*.sh.broken']),
    'Harness generated mirror include policy is invalid',
  )
  invariant(/^[a-f0-9]{64}$/.test(mirror.treeSha256), 'Harness generated mirror tree digest is invalid')
  const canonicalHookTree = hookTreeManifest(repoRoot, mirror.canonicalRoot, 'Harness canonical hook-test tree')
  const generatedHookTree = hookTreeManifest(repoRoot, mirror.mirrorRoot, 'Harness generated hook-test mirror')
  invariant(
    JSON.stringify(generatedHookTree.records) === JSON.stringify(canonicalHookTree.records),
    'Harness generated hook-test mirror differs from its canonical tree',
  )
  return Object.freeze({
    binding: Object.freeze({
      ...mirror,
      treeSha256: canonicalHookTree.treeSha256,
    }),
    canonicalHookTree,
    generatedHookTree,
  })
}

export function validateHarnessSourceInventory(inventory, {
  repoRoot = DEFAULT_HARNESS_SOURCE_REPO_ROOT,
  registry,
} = {}) {
  exactKeys(inventory, [
    '$schema',
    'schemaVersion',
    'kind',
    'roots',
    'executionBoundary',
    'authorityContract',
    'gateMetaExclusions',
    'generatedMirrors',
    'canonicalHookStaticHelpers',
    'reviewedDisabled',
    'staticExecutionFixtures',
    'suites',
    'pairedMeta',
    'direct',
    'externalExclusions',
    'nonGovernance',
  ], 'Harness source inventory')
  invariant(inventory.$schema === '../schemas/harness-source-inventory.schema.json', 'Harness source inventory schema binding is invalid')
  invariant(inventory.schemaVersion === 2 && inventory.kind === 'provider-neutral-governance-harness-source-inventory', 'Harness source inventory identity is invalid')
  invariant(JSON.stringify(inventory.roots) === JSON.stringify(HARNESS_SOURCE_ROOTS), 'Harness source inventory roots are incomplete or reordered')
  invariant(inventory.executionBoundary === HARNESS_EXECUTION_BOUNDARY, 'Harness source inventory execution boundary is diluted')
  invariant(registry && Array.isArray(registry.entries), 'Harness source inventory requires the canonical Harness registry join')

  exactKeys(inventory.authorityContract, ['path', 'schemaPath', 'closurePolicy'], 'Harness authority-contract source binding')
  invariant(
    inventory.authorityContract.path === 'infra/governance/providers/harness-authority-contracts.json'
      && inventory.authorityContract.schemaPath === 'infra/governance/schemas/harness-authority-contracts.schema.json'
      && inventory.authorityContract.closurePolicy === 'claim-contract-and-schema-are-static-all-harness-receipt-inputs',
    'Harness authority-contract source binding is invalid',
  )
  invariant(
    registry?.authorityContract?.path === inventory.authorityContract.path
      && registry?.authorityContract?.schemaPath === inventory.authorityContract.schemaPath,
    'Harness source inventory authority-contract binding differs from the registry',
  )
  const authorityContractPath = resolveRegularRepoFile(repoRoot, inventory.authorityContract.path, 'Harness authority contract source')
  const authorityContractSchemaPath = resolveRegularRepoFile(repoRoot, inventory.authorityContract.schemaPath, 'Harness authority contract schema source')
  invariant(
    sha256(readFileSync(authorityContractPath)) === registry.authorityContract.sha256,
    'Harness authority contract source digest drifted',
  )
  invariant(
    sha256(readFileSync(authorityContractSchemaPath)) === registry.authorityContract.schemaSha256,
    'Harness authority contract schema source digest drifted',
  )

  exactKeys(inventory.gateMetaExclusions, ['path', 'sha256'], 'Harness gate-meta exclusion binding')
  invariant(inventory.gateMetaExclusions.path === 'scripts/gate-meta-test-exclusions.json', 'Harness gate-meta exclusion path is not canonical')
  invariant(/^[a-f0-9]{64}$/.test(inventory.gateMetaExclusions.sha256), 'Harness gate-meta exclusion digest is invalid')
  const exclusionPath = resolveRegularRepoFile(repoRoot, inventory.gateMetaExclusions.path, 'Harness gate-meta exclusion inventory')
  invariant(sha256(readFileSync(exclusionPath)) === inventory.gateMetaExclusions.sha256, 'Harness gate-meta exclusion digest drifted')
  const canonicalGateMeta = createGateMetaTestInventory({ root: canonicalRepoRoot(repoRoot) })
  const discovered = discoverHarnessSources(repoRoot)
  invariant(discovered.length > 0, 'Harness source discovery must not be empty')
  const discoveredSet = new Set(discovered)
  const commands = registryCommands(registry)

  exactKeys(inventory.staticExecutionFixtures, ['root', 'policy', 'entries'], 'Harness static-execution fixture closure')
  invariant(
    inventory.staticExecutionFixtures.root === HARNESS_STATIC_EXECUTION_FIXTURE_ROOT,
    'Harness static-execution fixture root is not canonical',
  )
  invariant(
    inventory.staticExecutionFixtures.policy === 'all-files-exact-digest-and-consumer-bound;node-ast-reviewed;shell-dynamic-node-code-forbidden',
    'Harness static-execution fixture policy is diluted',
  )
  invariant(
    Array.isArray(inventory.staticExecutionFixtures.entries) && inventory.staticExecutionFixtures.entries.length > 0,
    'Harness static-execution fixture closure must not be empty',
  )
  const staticFixtureRoot = resolveRegularRepoDirectory(
    repoRoot,
    inventory.staticExecutionFixtures.root,
    'Harness static-execution fixture root',
  )
  const discoveredStaticFixtures = []
  function visitStaticFixtures(absoluteDirectory, relativeDirectory = '') {
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const repoPath = `${inventory.staticExecutionFixtures.root}/${relativePath}`
      invariant(!entry.isSymbolicLink(), `Harness static-execution fixture root contains a symbolic link:${repoPath}`)
      if (entry.isDirectory()) {
        visitStaticFixtures(resolve(absoluteDirectory, entry.name), relativePath)
        continue
      }
      invariant(entry.isFile(), `Harness static-execution fixture root contains a special entry:${repoPath}`)
      discoveredStaticFixtures.push(repoPath)
    }
  }
  visitStaticFixtures(staticFixtureRoot)
  discoveredStaticFixtures.sort(compareUtf8Bytes)
  const declaredStaticFixtures = []
  for (const item of inventory.staticExecutionFixtures.entries) {
    exactKeys(item, ['path', 'sha256', 'kind', 'consumers'], `Harness static-execution fixture ${item?.path ?? '<missing>'}`)
    invariant(
      typeof item.path === 'string' && item.path.startsWith(`${HARNESS_STATIC_EXECUTION_FIXTURE_ROOT}/`),
      `Harness static-execution fixture path is outside its closed root:${String(item.path)}`,
    )
    invariant(/^[a-f0-9]{64}$/.test(item.sha256), `Harness static-execution fixture digest is invalid:${item.path}`)
    invariant(['node', 'bash'].includes(item.kind), `Harness static-execution fixture kind is invalid:${item.path}`)
    assertSortedUnique(item.consumers, `Harness static-execution fixture consumers:${item.path}`)
    invariant(item.consumers.length > 0, `Harness static-execution fixture has no consumer:${item.path}`)
    const absolute = resolveRegularRepoFile(repoRoot, item.path, 'Harness static-execution fixture')
    invariant(sha256(readFileSync(absolute)) === item.sha256, `Harness static-execution fixture digest drifted:${item.path}`)
    invariant(
      item.kind === 'node' ? item.path.endsWith('.mjs') : item.path.endsWith('.sh'),
      `Harness static-execution fixture extension differs from its kind:${item.path}`,
    )
    if (item.kind === 'node') assertReviewedEntrypointSafety(repoRoot, item.path, absolute)
    else assertReviewedStaticShellFixtureSafety(repoRoot, item.path, absolute)
    for (const consumer of item.consumers) {
      invariant(discoveredSet.has(consumer), `Harness static-execution fixture consumer is not a discovered Harness source:${item.path}:${consumer}`)
      const consumerPath = resolveRegularRepoFile(repoRoot, consumer, 'Harness static-execution fixture consumer')
      invariant(
        readFileSync(consumerPath, 'utf8').includes(item.path),
        `Harness static-execution fixture consumer lacks an exact source reference:${item.path}:${consumer}`,
      )
    }
    declaredStaticFixtures.push(item.path)
  }
  invariant(
    JSON.stringify(declaredStaticFixtures) === JSON.stringify([...new Set(declaredStaticFixtures)].sort(compareUtf8Bytes)),
    'Harness static-execution fixture entries must be sorted and unique',
  )
  invariant(
    JSON.stringify(declaredStaticFixtures) === JSON.stringify(discoveredStaticFixtures),
    'Harness static-execution fixture inventory is not root-closed',
  )

  exactKeys(inventory.canonicalHookStaticHelpers, ['root', 'policy', 'entries'], 'Harness canonical hook static-helper closure')
  invariant(
    inventory.canonicalHookStaticHelpers.root === CANONICAL_HOOK_ROOT,
    'Harness canonical hook static-helper root is not canonical',
  )
  invariant(
    inventory.canonicalHookStaticHelpers.policy === 'all-active-mjs-exact-digest-and-consumer-bound;shell-dynamic-node-code-forbidden;generated-test-helper-mirror-bound',
    'Harness canonical hook static-helper policy is diluted',
  )
  invariant(
    Array.isArray(inventory.canonicalHookStaticHelpers.entries) && inventory.canonicalHookStaticHelpers.entries.length > 0,
    'Harness canonical hook static-helper closure must not be empty',
  )
  const discoveredCanonicalHookHelpers = canonicalActiveHookFiles(
    repoRoot,
    name => name.endsWith('.mjs'),
    'Harness canonical hook static helper',
  )
  const helperBasenames = discoveredCanonicalHookHelpers.map(path => basename(path))
  invariant(
    helperBasenames.length === new Set(helperBasenames).size,
    'Harness canonical hook static-helper basenames must be unique',
  )
  const canonicalHookShellPaths = canonicalActiveHookFiles(
    repoRoot,
    name => name.endsWith('.sh'),
    'Harness canonical active shell',
  )
  const canonicalHookShellSources = new Map()
  for (const shellPath of canonicalHookShellPaths) {
    const absolute = resolveRegularRepoFile(repoRoot, shellPath, 'Harness canonical active shell')
    canonicalHookShellSources.set(
      shellPath,
      assertReviewedBashSafety(repoRoot, shellPath, absolute, 'canonical active shell'),
    )
  }
  const declaredCanonicalHookHelpers = []
  for (const item of inventory.canonicalHookStaticHelpers.entries) {
    exactKeys(item, ['path', 'sha256', 'consumers'], `Harness canonical hook static helper ${item?.path ?? '<missing>'}`)
    invariant(
      typeof item.path === 'string'
        && item.path.startsWith(`${CANONICAL_HOOK_ROOT}/`)
        && item.path.endsWith('.mjs')
        && !item.path.startsWith(`${CANONICAL_HOOK_ROOT}/retired/`),
      `Harness canonical hook static-helper path is outside its active closed root:${String(item.path)}`,
    )
    invariant(/^[a-f0-9]{64}$/.test(item.sha256), `Harness canonical hook static-helper digest is invalid:${item.path}`)
    assertSortedUnique(item.consumers, `Harness canonical hook static-helper consumers:${item.path}`)
    invariant(item.consumers.length > 0, `Harness canonical hook static helper has no consumer:${item.path}`)
    const absolute = resolveRegularRepoFile(repoRoot, item.path, 'Harness canonical hook static helper')
    invariant(sha256(readFileSync(absolute)) === item.sha256, `Harness canonical hook static-helper digest drifted:${item.path}`)
    const helperName = basename(item.path)
    const discoveredConsumers = canonicalHookShellPaths
      .filter(path => canonicalHookShellSources.get(path).includes(helperName))
      .sort(compareUtf8Bytes)
    for (const consumer of item.consumers) {
      invariant(
        canonicalHookShellSources.has(consumer),
        `Harness canonical hook static-helper consumer is not an active canonical shell:${item.path}:${consumer}`,
      )
      invariant(
        canonicalHookShellSources.get(consumer).includes(helperName),
        `Harness canonical hook static-helper consumer lacks its helper reference:${item.path}:${consumer}`,
      )
    }
    invariant(
      JSON.stringify(item.consumers) === JSON.stringify(discoveredConsumers),
      `Harness canonical hook static-helper consumers differ from active canonical shell references:${item.path}`,
    )
    declaredCanonicalHookHelpers.push(item.path)
  }
  invariant(
    JSON.stringify(declaredCanonicalHookHelpers)
      === JSON.stringify([...new Set(declaredCanonicalHookHelpers)].sort(compareUtf8Bytes)),
    'Harness canonical hook static-helper entries must be sorted and unique',
  )
  invariant(
    JSON.stringify(declaredCanonicalHookHelpers) === JSON.stringify(discoveredCanonicalHookHelpers),
    'Harness canonical hook static-helper inventory is not root-closed',
  )

  invariant(Array.isArray(inventory.suites) && inventory.suites.length > 0, 'Harness source inventory must declare closed suites')
  const suiteIds = []
  const classified = new Set()
  const rolesByPath = new Map()
  function addRole(path, role) {
    const roles = rolesByPath.get(path) ?? new Set()
    invariant(!roles.has(role), `Harness source repeats an execution role:${path}:${role}`)
    roles.add(role)
    rolesByPath.set(path, roles)
    classified.add(path)
  }

  const generatedMirror = deriveHarnessGeneratedMirrorBinding(inventory, { repoRoot })
  const mirror = inventory.generatedMirrors[0]
  const { canonicalHookTree, generatedHookTree } = generatedMirror
  invariant(mirror.treeSha256 === generatedMirror.binding.treeSha256, 'Harness generated hook-test mirror digest drifted')
  validateCanonicalActiveHookCoverage(repoRoot, canonicalHookTree)
  for (const record of generatedHookTree.records) {
    if (!isActiveHookTestPath(record.path)) continue
    addRole(`${mirror.mirrorRoot}/${record.path}`, 'generated-mirror')
  }

  invariant(Array.isArray(inventory.reviewedDisabled), 'Harness reviewed disabled debt must be an array')
  const expectedDisabled = canonicalHookTree.records
    .filter(record => isDisabledHookTestPath(record.path))
    .map(record => `${CANONICAL_HOOK_TEST_ROOT}/${record.path}`)
    .sort(compareUtf8Bytes)
  const disabledPaths = []
  for (const item of inventory.reviewedDisabled) {
    exactKeys(item, ['path', 'sha256', 'owner', 'reason', 'expiresOn', 'remediation'], `Harness reviewed disabled source ${item?.path ?? '<missing>'}`)
    invariant(
      typeof item.path === 'string'
        && item.path.startsWith(`${CANONICAL_HOOK_TEST_ROOT}/`)
        && /^test_[A-Za-z0-9._-]+\.sh\.broken$/.test(item.path.slice(CANONICAL_HOOK_TEST_ROOT.length + 1)),
      `Harness reviewed disabled source path is invalid:${String(item.path)}`,
    )
    invariant(/^[a-f0-9]{64}$/.test(item.sha256), `Harness reviewed disabled source digest is invalid:${item.path}`)
    invariant(/^[a-z][a-z0-9-]*$/.test(item.owner), `Harness reviewed disabled source owner is invalid:${item.path}`)
    invariant(typeof item.reason === 'string' && item.reason.trim().length >= 40, `Harness reviewed disabled source reason is not substantive:${item.path}`)
    invariant(typeof item.remediation === 'string' && item.remediation.trim().length >= 40, `Harness reviewed disabled source remediation is not substantive:${item.path}`)
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(item.expiresOn), `Harness reviewed disabled source expiry is invalid:${item.path}`)
    const expiry = Date.parse(`${item.expiresOn}T23:59:59.999Z`)
    invariant(
      Number.isFinite(expiry) && new Date(expiry).toISOString().slice(0, 10) === item.expiresOn,
      `Harness reviewed disabled source expiry is invalid:${item.path}`,
    )
    invariant(expiry > Date.now(), `Harness reviewed disabled source debt expired:${item.path}`)
    const absolute = resolveRegularRepoFile(repoRoot, item.path, 'Harness reviewed disabled source')
    invariant(sha256(readFileSync(absolute)) === item.sha256, `Harness reviewed disabled source digest drifted:${item.path}`)
    addRole(item.path, 'reviewed-disabled-debt')
    const mirrorPath = item.path.replace(CANONICAL_HOOK_TEST_ROOT, CLAUDE_HOOK_TEST_MIRROR_ROOT)
    resolveRegularRepoFile(repoRoot, mirrorPath, 'Harness generated disabled source mirror')
    addRole(mirrorPath, 'generated-disabled-debt')
    disabledPaths.push(item.path)
  }
  invariant(JSON.stringify(disabledPaths) === JSON.stringify([...new Set(disabledPaths)].sort(compareUtf8Bytes)), 'Harness reviewed disabled debt entries must be sorted and unique')
  invariant(JSON.stringify(disabledPaths) === JSON.stringify(expectedDisabled), 'Harness reviewed disabled debt differs from discovered canonical .broken sources')

  for (const suite of inventory.suites) {
    exactKeys(suite, ['id', 'memberTimeoutMs', 'totalTimeoutMs', 'execution', 'members'], `Harness suite ${suite?.id ?? '<missing>'}`)
    invariant(typeof suite.id === 'string' && /^[a-z][a-z0-9-]*$/.test(suite.id), `Harness suite id is invalid:${String(suite.id)}`)
    invariant(!suiteIds.includes(suite.id), `Harness suite id is duplicated:${suite.id}`)
    invariant(Number.isInteger(suite.memberTimeoutMs) && suite.memberTimeoutMs >= 1_000 && suite.memberTimeoutMs <= 3_600_000, `Harness suite member timeout is invalid:${suite.id}`)
    invariant(Number.isInteger(suite.totalTimeoutMs) && suite.totalTimeoutMs >= suite.memberTimeoutMs && suite.totalTimeoutMs <= 21_600_000, `Harness suite total timeout is invalid:${suite.id}`)
    if (suite.id === CANONICAL_HOOK_SUITE_ID) {
      exactKeys(suite.execution, ['kind', 'command'], `Harness suite execution ${suite.id}`)
      invariant(suite.execution.kind === 'aggregate', 'Harness canonical hook suite must use aggregate execution')
      invariant(JSON.stringify(suite.execution.command) === JSON.stringify(['bash', CANONICAL_HOOK_RUNNER]), 'Harness canonical hook suite aggregate command is invalid')
      const expectedMembers = canonicalHookTree.records
        .filter(record => isActiveHookTestPath(record.path))
        .map(record => `${CANONICAL_HOOK_TEST_ROOT}/${record.path}`)
        .sort(compareUtf8Bytes)
      invariant(JSON.stringify(suite.members) === JSON.stringify(expectedMembers), 'Harness canonical hook suite members differ from the canonical recursive hook-test tree')
    } else {
      exactKeys(suite.execution, ['kind'], `Harness suite execution ${suite.id}`)
      invariant(suite.execution.kind === 'members', `Harness non-hook suite must execute its declared members:${suite.id}`)
    }
    assertSortedUnique(suite.members, `Harness suite members:${suite.id}`)
    for (const member of suite.members) {
      const absolute = resolveRegularRepoFile(repoRoot, member, `Harness suite ${suite.id} member`)
      addRole(member, `suite:${suite.id}`)
      if (suite.execution.kind === 'members') assertReviewedEntrypointSafety(repoRoot, member, absolute)
    }
    suiteIds.push(suite.id)
  }
  invariant(JSON.stringify(suiteIds) === JSON.stringify([...suiteIds].sort(compareUtf8Bytes)), 'Harness suites must be sorted by id')
  invariant(suiteIds.includes(CANONICAL_HOOK_SUITE_ID), 'Harness canonical hook behavioral suite is missing')

  exactKeys(inventory.pairedMeta, ['command', 'members'], 'Harness paired-meta owner')
  invariant(JSON.stringify(inventory.pairedMeta.command) === JSON.stringify(['node', 'scripts/run-gate-meta-tests.mjs']), 'Harness paired-meta command is not canonical')
  assertSortedUnique(inventory.pairedMeta.members, 'Harness paired-meta members')
  const expectedPaired = canonicalGateMeta.runnable.map(({ file }) => `scripts/${file}`).sort(compareUtf8Bytes)
  invariant(JSON.stringify(inventory.pairedMeta.members) === JSON.stringify(expectedPaired), 'Harness paired-meta members differ from the canonical gate-meta inventory')
  for (const member of inventory.pairedMeta.members) {
    const absolute = resolveRegularRepoFile(repoRoot, member, 'Harness paired-meta member')
    addRole(member, 'paired-meta')
    assertReviewedEntrypointSafety(repoRoot, member, absolute)
  }

  assertSortedUnique(inventory.direct, 'Harness direct sources')
  const directCommands = commands.filter(command => discoveredSet.has(commandEntrypoint(command)))
  const expectedDirect = [...new Set(directCommands.map(commandEntrypoint))].sort(compareUtf8Bytes)
  invariant(JSON.stringify(inventory.direct) === JSON.stringify(expectedDirect), 'Harness direct sources differ from canonical registry leaf commands')
  const deterministicExclusions = canonicalGateMeta.excludedByClass['deterministic-isolated'].map(entry => entry.harness).sort(compareUtf8Bytes)
  invariant(deterministicExclusions.every(path => inventory.direct.includes(path)), 'Deterministic gate-meta exclusions lack direct canonical owners')
  for (const path of inventory.direct) {
    const absolute = resolveRegularRepoFile(repoRoot, path, 'Harness direct source')
    addRole(path, 'direct')
    assertReviewedEntrypointSafety(repoRoot, path, absolute)
  }

  assertSortedUnique(inventory.externalExclusions, 'Harness external exclusions')
  const expectedExternal = canonicalGateMeta.excludedByClass['environmental-observation'].map(entry => entry.harness).sort(compareUtf8Bytes)
  invariant(JSON.stringify(inventory.externalExclusions) === JSON.stringify(expectedExternal), 'Harness external exclusions differ from environmental gate-meta exclusions')
  for (const path of inventory.externalExclusions) {
    resolveRegularRepoFile(repoRoot, path, 'Harness external exclusion')
    addRole(path, 'external-exclusion')
  }

  exactKeys(inventory.nonGovernance, ['path', 'sha256'], 'Harness non-governance exclusion binding')
  invariant(inventory.nonGovernance.path === 'infra/governance/providers/harness-non-governance-exclusions.json', 'Harness non-governance exclusion path is not canonical')
  invariant(/^[a-f0-9]{64}$/.test(inventory.nonGovernance.sha256), 'Harness non-governance exclusion digest is invalid')
  const nonGovernancePath = resolveRegularRepoFile(repoRoot, inventory.nonGovernance.path, 'Harness non-governance exclusion inventory')
  const nonGovernanceBytes = readFileSync(nonGovernancePath)
  invariant(sha256(nonGovernanceBytes) === inventory.nonGovernance.sha256, 'Harness non-governance exclusion digest drifted')
  const nonGovernanceDocument = JSON.parse(nonGovernanceBytes.toString('utf8'))
  exactKeys(nonGovernanceDocument, ['$schema', 'schemaVersion', 'kind', 'entries'], 'Harness non-governance exclusion inventory')
  invariant(nonGovernanceDocument.$schema === '../schemas/harness-non-governance-exclusions.schema.json', 'Harness non-governance exclusion schema binding is invalid')
  invariant(nonGovernanceDocument.schemaVersion === 1 && nonGovernanceDocument.kind === 'reviewed-non-governance-harness-source-exclusions', 'Harness non-governance exclusion identity is invalid')
  invariant(Array.isArray(nonGovernanceDocument.entries), 'Harness non-governance exclusion entries must be an array')
  const nonGovernancePaths = []
  for (const item of nonGovernanceDocument.entries) {
    exactKeys(item, ['path', 'category', 'reason'], `Harness non-governance source ${item?.path ?? '<missing>'}`)
    invariant(item.category === 'interactive-product-visual-exploration', `Harness non-governance category is invalid:${item.path}`)
    invariant(typeof item.reason === 'string' && item.reason.trim().length >= 40, `Harness non-governance reason is not substantive:${item.path}`)
    resolveRegularRepoFile(repoRoot, item.path, 'Harness non-governance source')
    addRole(item.path, 'non-governance')
    nonGovernancePaths.push(item.path)
  }
  invariant(JSON.stringify(nonGovernancePaths) === JSON.stringify([...new Set(nonGovernancePaths)].sort(compareUtf8Bytes)), 'Harness non-governance entries must be sorted and unique')

  for (const [path, roles] of rolesByPath) {
    const roleList = [...roles].sort(compareUtf8Bytes)
    const allowedOverlap = JSON.stringify(roleList) === JSON.stringify(['direct', 'paired-meta'])
    invariant(roleList.length === 1 || allowedOverlap, `Harness source has incompatible execution roles:${path}:${roleList.join(',')}`)
  }
  invariant(
    JSON.stringify([...classified].sort(compareUtf8Bytes)) === JSON.stringify(discovered),
    `Harness source inventory is not source-closed; discovered=${discovered.length} classified=${classified.size}`,
  )

  const counts = new Map()
  for (const command of commands) counts.set(commandKey(command), (counts.get(commandKey(command)) ?? 0) + 1)
  for (const suite of inventory.suites) {
    invariant((counts.get(commandKey(suiteCommand(suite.id))) ?? 0) >= 1, `Harness suite is not registered by the canonical runner:${suite.id}`)
  }
  invariant((counts.get(commandKey(inventory.pairedMeta.command)) ?? 0) >= 1, 'Harness paired-meta owner is not registered by the canonical runner')
  for (const path of inventory.direct) {
    invariant((counts.get(commandKey(memberCommand(path))) ?? 0) === 1, `Harness direct source must have exactly one registry command:${path}`)
  }
  const leafCommands = commands.filter(command => rolesByPath.has(commandEntrypoint(command)))
  for (const command of leafCommands) {
    const path = commandEntrypoint(command)
    invariant(rolesByPath.get(path).has('direct'), `Harness suite/meta/excluded source bypasses its canonical execution owner:${path}`)
    invariant(commandKey(command) === commandKey(memberCommand(path)), `Harness direct source uses a non-canonical argv:${path}`)
  }
  return true
}

export function harnessSuiteCommand(suiteId) {
  invariant(typeof suiteId === 'string' && /^[a-z][a-z0-9-]*$/.test(suiteId), 'Harness suite id is invalid')
  return suiteCommand(suiteId)
}

export function harnessMemberCommand(path) {
  portableRepoPath(path, 'Harness member path')
  return memberCommand(path)
}

export function harnessSourceInventorySha256(bytes) {
  return sha256(bytes)
}

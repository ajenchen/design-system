#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runClosedGit } from './closed-tool-execution.mjs'

function fail(message) {
  throw new Error(`governance runtime evidence blocked:${message}`)
}

function canonicalDirectory(path, label) {
  let resolved
  try {
    resolved = realpathSync(resolve(path))
  } catch (error) {
    fail(`${label} is unavailable:${error.message}`)
  }
  const info = lstatSync(resolved)
  if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} must be a real directory`)
  return resolved
}

export function isContained(root, target, { allowRoot = true } = {}) {
  const rel = relative(root, target)
  if (!rel) return allowRoot
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

export function assertSafeExistingPath(base, target, label, { targetKind = 'any' } = {}) {
  if (!isContained(base, target)) fail(`${label} escapes its authority root`)
  const rel = relative(base, target)
  let cursor = base
  const segments = rel ? rel.split(sep) : []
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    cursor = resolve(cursor, segment)
    let info
    try {
      info = lstatSync(cursor)
    } catch (error) {
      if (error?.code === 'ENOENT') break
      fail(`${label} cannot inspect ${cursor}:${error.message}`)
    }
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link:${cursor}`)
    const final = index === segments.length - 1
    if (!final && !info.isDirectory()) fail(`${label} crosses a non-directory:${cursor}`)
    if (!final) continue
    if (targetKind === 'directory' && !info.isDirectory()) fail(`${label} must be a real directory`)
    if (targetKind === 'file' && !info.isFile()) fail(`${label} must be a regular file`)
    if (targetKind === 'any' && !info.isDirectory() && !info.isFile()) fail(`${label} has an unsupported file type`)
    if (info.isFile() && info.nlink !== 1) fail(`${label} is a hard-link alias`)
  }
}

export function resolveRepositoryRoot(repoRoot) {
  const requestedRepository = canonicalDirectory(repoRoot ?? process.cwd(), 'repository root')
  const top = runClosedGit(['rev-parse', '--show-toplevel'], { cwd: requestedRepository })
  if (top.error || top.signal !== null || top.status !== 0 || typeof top.stdout !== 'string' || !top.stdout.trim()) {
    fail('repository top level is unavailable')
  }
  return canonicalDirectory(top.stdout.trim(), 'repository top level')
}

export function resolveGitRuntimeRoots(repoRoot, { create = false } = {}) {
  const repository = resolveRepositoryRoot(repoRoot)
  const git = runClosedGit(['rev-parse', '--absolute-git-dir'], { cwd: repository })
  if (git.error || git.signal !== null || git.status !== 0 || typeof git.stdout !== 'string' || !git.stdout.trim()) {
    fail('repository Git directory is unavailable')
  }
  const gitDirectory = canonicalDirectory(git.stdout.trim(), 'repository Git directory')
  const runtime = resolve(gitDirectory, 'governance-runtime')
  const evidence = resolve(runtime, 'evidence')
  if (create) {
    if (process.env.GOVERNANCE_READ_ONLY === '1') fail('GOVERNANCE_READ_ONLY forbids evidence writes')
    mkdirSync(evidence, { recursive: true, mode: 0o700 })
  }
  assertSafeExistingPath(gitDirectory, runtime, 'Git governance runtime root', { targetKind: 'directory' })
  assertSafeExistingPath(gitDirectory, evidence, 'canonical evidence root', { targetKind: 'directory' })
  return { repository, gitDirectory, runtime, evidence }
}

export function safeRelativePath(value, label = 'relativePath') {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\') || isAbsolute(value)) {
    fail(`${label} must be a non-empty repository-style relative path`)
  }
  if (/\p{Cc}/u.test(value) || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    fail(`${label} contains an unsafe segment`)
  }
  return value
}

/**
 * Resolve the single Git-owned mutable governance evidence root.
 *
 * The only authority root is `<real Git dir>/governance-runtime/evidence`.
 * `explicitRoot` may select that directory or a narrower child; a relative
 * value is interpreted below the canonical evidence root. Workspace runtime
 * directories such as `infra/governance/runtime` are deliberately outside
 * this contract.
 */
export function resolveRuntimeEvidenceRoot({ repoRoot, explicitRoot } = {}) {
  const { evidence } = resolveGitRuntimeRoots(repoRoot)
  if (explicitRoot !== undefined && explicitRoot !== null
    && (typeof explicitRoot !== 'string' || explicitRoot.includes('\0') || /\p{Cc}/u.test(explicitRoot))) {
    fail('explicitRoot must be a safe filesystem path')
  }
  const requested = explicitRoot === undefined || explicitRoot === null || explicitRoot === ''
    ? evidence
    : isAbsolute(explicitRoot)
      ? resolve(explicitRoot)
      : resolve(evidence, explicitRoot)
  if (!isContained(evidence, requested)) fail('explicitRoot must be the Git-owned evidence root or its child')
  assertSafeExistingPath(evidence, requested, 'explicit runtime evidence root', { targetKind: 'directory' })
  return requested
}

/** Resolve one fail-closed path below the Git-owned evidence root. */
export function resolveRuntimeEvidencePath({ repoRoot, explicitRoot, relativePath } = {}) {
  const root = resolveRuntimeEvidenceRoot({ repoRoot, explicitRoot })
  const target = resolve(root, safeRelativePath(relativePath))
  if (!isContained(root, target, { allowRoot: false })) fail('relativePath escapes its evidence root')
  assertSafeExistingPath(root, target, 'runtime evidence path')
  return target
}

/**
 * Resolve the passive provider telemetry state already owned by the neutral
 * hook runner. Audit readers may consume it, but audit evidence must be written
 * below its dedicated `evidence/` child via the evidence APIs above.
 */
export function resolveProviderTelemetryStateRoot({ repoRoot, runtimeRoot, stateRoot } = {}) {
  const { gitDirectory, runtime: allowedRuntime } = resolveGitRuntimeRoots(repoRoot)
  const requestedRuntime = runtimeRoot ?? process.env.GOVERNANCE_RUNTIME_ROOT
  const resolvedRuntime = requestedRuntime === undefined || requestedRuntime === null || requestedRuntime === ''
    ? allowedRuntime
    : isAbsolute(requestedRuntime)
      ? resolve(requestedRuntime)
      : resolve(allowedRuntime, requestedRuntime)
  if (resolvedRuntime !== allowedRuntime) fail('GOVERNANCE_RUNTIME_ROOT does not match the repository Git runtime')
  assertSafeExistingPath(gitDirectory, resolvedRuntime, 'provider telemetry runtime root', { targetKind: 'directory' })
  const requestedState = stateRoot ?? process.env.GOVERNANCE_STATE_DIR
  const resolvedState = requestedState === undefined || requestedState === null || requestedState === ''
    ? resolvedRuntime
    : isAbsolute(requestedState)
      ? resolve(requestedState)
      : resolve(resolvedRuntime, requestedState)
  if (!isContained(resolvedRuntime, resolvedState)) fail('GOVERNANCE_STATE_DIR escapes the provider telemetry runtime')
  assertSafeExistingPath(resolvedRuntime, resolvedState, 'provider telemetry state root', { targetKind: 'directory' })
  return resolvedState
}

/**
 * Resolve one read-only telemetry file below the unique Git runtime/state root.
 * This never creates a directory or file and rejects traversal, symbolic-link
 * redirection, special files, and hard-link aliases at the final path.
 */
export function resolveProviderTelemetryStatePath({ repoRoot, runtimeRoot, stateRoot, relativePath } = {}) {
  const root = resolveProviderTelemetryStateRoot({ repoRoot, runtimeRoot, stateRoot })
  const target = resolve(root, safeRelativePath(relativePath))
  if (!isContained(root, target, { allowRoot: false })) fail('relativePath escapes the provider telemetry state root')
  assertSafeExistingPath(root, target, 'provider telemetry state path')
  return target
}

/**
 * Prepare a directory without allowing a pre-positioned symlink to redirect
 * evidence. Explicit audit commands may write here; read-only provider probes
 * remain byte-for-byte non-mutating.
 */
export function ensureRuntimeEvidenceDirectory(options = {}) {
  if (process.env.GOVERNANCE_READ_ONLY === '1') fail('GOVERNANCE_READ_ONLY forbids evidence writes')
  const directory = resolveRuntimeEvidencePath(options)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const root = resolveRuntimeEvidenceRoot(options)
  const validatedDirectory = resolveRuntimeEvidencePath(options)
  if (validatedDirectory !== directory) fail('prepared runtime evidence directory changed during validation')
  assertSafeExistingPath(root, validatedDirectory, 'prepared runtime evidence directory', { targetKind: 'directory' })
  const info = lstatSync(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) fail('prepared runtime evidence directory is not a real directory')
  return directory
}

/** Prepare an optional caller-narrowed evidence root itself. */
export function ensureRuntimeEvidenceRoot(options = {}) {
  if (process.env.GOVERNANCE_READ_ONLY === '1') fail('GOVERNANCE_READ_ONLY forbids evidence writes')
  const { evidence } = resolveGitRuntimeRoots(options.repoRoot, { create: true })
  const requested = options.explicitRoot
  const root = requested === undefined || requested === null || requested === ''
    ? evidence
    : isAbsolute(requested)
      ? resolve(requested)
      : resolve(evidence, safeRelativePath(requested, 'explicitRoot'))
  if (!isContained(evidence, root)) fail('explicitRoot must be the Git-owned evidence root or its child')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const canonical = resolveRuntimeEvidenceRoot({ repoRoot: options.repoRoot })
  const validatedRoot = resolveRuntimeEvidenceRoot(options)
  if (validatedRoot !== root) fail('prepared runtime evidence root changed during validation')
  assertSafeExistingPath(canonical, validatedRoot, 'prepared runtime evidence root', { targetKind: 'directory' })
  const info = lstatSync(root)
  if (!info.isDirectory() || info.isSymbolicLink()) fail('prepared runtime evidence root is not a real directory')
  return root
}

/** Prepare the parent of an evidence file and return the validated file path. */
export function prepareRuntimeEvidenceFile(options = {}) {
  if (process.env.GOVERNANCE_READ_ONLY === '1') fail('GOVERNANCE_READ_ONLY forbids evidence writes')
  const file = resolveRuntimeEvidencePath(options)
  const root = resolveRuntimeEvidenceRoot(options)
  const parent = dirname(file)
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  const validatedRoot = resolveRuntimeEvidenceRoot(options)
  const validatedFile = resolveRuntimeEvidencePath(options)
  if (validatedRoot !== root || validatedFile !== file) fail('prepared runtime evidence file changed during validation')
  assertSafeExistingPath(validatedRoot, validatedFile, 'prepared runtime evidence file', { targetKind: 'file' })
  if (existsSync(file)) {
    const info = lstatSync(file)
    if (!info.isFile() || info.isSymbolicLink()) fail('existing runtime evidence target must be a regular file')
    if (info.nlink !== 1) fail('existing runtime evidence target is a hard-link alias')
  }
  return file
}

function parseCli(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--ensure-directory' || arg === '--prepare-file' || arg === '--telemetry') {
      result[arg] = true
      continue
    }
    if (!['--repo-root', '--root', '--path'].includes(arg) || index + 1 >= argv.length) {
      fail('usage: governance-runtime-evidence.mjs --repo-root <repo> [--root <evidence-root-or-child>] --path <relative-path> [--ensure-directory|--prepare-file|--telemetry]')
    }
    result[arg] = argv[index + 1]
    index += 1
  }
  if (!result['--path']) fail('--path is required')
  if (result['--ensure-directory'] && result['--prepare-file']) fail('--ensure-directory and --prepare-file are mutually exclusive')
  if (result['--telemetry'] && (result['--ensure-directory'] || result['--prepare-file'] || result['--root'])) {
    fail('--telemetry is read-only and cannot be combined with evidence root/write flags')
  }
  return result
}

const IS_MAIN = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()
if (IS_MAIN) {
  try {
    const args = parseCli(process.argv.slice(2))
    const options = {
      repoRoot: args['--repo-root'] ?? process.cwd(),
      explicitRoot: args['--root'],
      relativePath: args['--path'],
    }
    const path = args['--telemetry']
      ? resolveProviderTelemetryStatePath({ repoRoot: options.repoRoot, relativePath: options.relativePath })
      : args['--ensure-directory']
        ? ensureRuntimeEvidenceDirectory(options)
        : args['--prepare-file']
          ? prepareRuntimeEvidenceFile(options)
          : resolveRuntimeEvidencePath(options)
    process.stdout.write(`${path}\n`)
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
}

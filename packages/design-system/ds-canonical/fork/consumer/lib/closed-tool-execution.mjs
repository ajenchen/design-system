import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const CLOSED_GIT_EXECUTABLES = Object.freeze({
  darwin: '/usr/bin/git',
  linux: '/usr/bin/git',
})
const CLOSED_GIT_GLOBAL_ARGUMENTS = Object.freeze([
  '--no-optional-locks',
  '-c', 'core.autocrlf=false',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'credential.helper=',
  '-c', 'diff.external=',
  '-c', 'core.attributesFile=/dev/null',
  '-c', 'core.excludesFile=/dev/null',
  '-c', 'core.untrackedCache=false',
  '-c', 'init.templateDir=',
])
const CLOSED_GIT_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_NO_LAZY_FETCH: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: '/bin/cat',
  GIT_TERMINAL_PROMPT: '0',
  HOME: '/dev/null',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
  XDG_CONFIG_HOME: '/dev/null',
})
const CLOSED_GH_CANDIDATES = Object.freeze({
  darwin: ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'],
  linux: ['/usr/bin/gh', '/usr/local/bin/gh', '/home/linuxbrew/.linuxbrew/bin/gh'],
})
const CLOSED_PRIVATE_RUNTIME_BASES = Object.freeze({
  darwin: '/private/tmp',
  linux: '/tmp',
})
const CLOSED_HOOK_EXECUTABLE_CANDIDATES = Object.freeze({
  darwin: Object.freeze({
    bash: Object.freeze(['/bin/bash']),
    git: Object.freeze(['/usr/bin/git']),
    jq: Object.freeze(['/usr/bin/jq']),
    python3: Object.freeze(['/usr/bin/python3']),
  }),
  linux: Object.freeze({
    bash: Object.freeze(['/usr/bin/bash', '/bin/bash']),
    git: Object.freeze(['/usr/bin/git']),
    jq: Object.freeze(['/usr/bin/jq']),
    python3: Object.freeze(['/usr/bin/python3']),
  }),
})
const CLOSED_HOOK_SYSTEM_PATH_CANDIDATES = Object.freeze([
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
])
const CLOSED_GH_ARGUMENT_PREFIX = Object.freeze([])
const DANGEROUS_LOCAL_GIT_CONFIG = /^(?:alias\.|credential\.|filter\.|gpg\.|http\.|include\.|includeif\.|merge\..+\.driver$|protocol\..+\.allow$|submodule\.|tar\..+\.command$|url\..+\.(?:insteadof|pushinsteadof)$|core\.(?:alternaterefscommand|askpass|attributesfile|editor|excludesfile|gitproxy|hookspath|pager|sshcommand|worktree)$|extensions\.worktreeconfig$|interactive\.difffilter$|remote\..+\.(?:proxy|receivepack|uploadpack|vcs)$|sequence\.editor$)|^diff\..+\.(?:command|textconv)$/

const cachedGhExecutables = new Map()
const cachedHookToolPaths = new Map()
let ghCleanupRegistered = false
const ghCleanupRoots = new Set()
const MAX_CLOSED_EXECUTABLE_BYTES = 512 * 1024 * 1024
const MAX_CANONICAL_GIT_HOOK_BYTES = 1024 * 1024
const MAX_CLOSED_GIT_OUTPUT_BYTES = 256 * 1024 * 1024

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function isContained(root, target) {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function sameDirectoryIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid
}

function validateClosedRuntimeBaseCandidate(candidate, runtimePlatform) {
  const configured = candidate
  invariant(configured, `Closed private runtime is unsupported on platform ${runtimePlatform}`)
  const canonical = realpathSync(configured)
  const info = lstatSync(canonical, { bigint: true })
  const currentUid = typeof process.getuid === 'function' ? BigInt(process.getuid()) : null
  const rootStickyOrClosed = info.uid === 0n
    && (
      (info.mode & 0o022n) === 0n
      || (info.mode & 0o1000n) === 0o1000n
    )
  const ownedPrivate = currentUid !== null
    && info.uid === currentUid
    && (info.mode & 0o022n) === 0n
  invariant(
    info.isDirectory()
      && !info.isSymbolicLink()
      && (rootStickyOrClosed || ownedPrivate),
    `Closed private runtime base is unsafe at ${canonical}`,
  )
  return canonical
}

function validateClosedPrivateRuntimeBase(runtimePlatform) {
  // Honor the standard per-user temporary directory (TMPDIR / os.tmpdir()) before the
  // platform fallback. A hardcoded /private/tmp breaks sandboxed and CI environments where
  // only TMPDIR is writable; a per-user 0700 directory is at least as private as a
  // root-owned sticky directory.
  return validateClosedRuntimeBaseCandidate(
    tmpdir() || CLOSED_PRIVATE_RUNTIME_BASES[runtimePlatform],
    runtimePlatform,
  )
}

function validateClosedPlatformRuntimeBase(runtimePlatform) {
  return validateClosedRuntimeBaseCandidate(CLOSED_PRIVATE_RUNTIME_BASES[runtimePlatform], runtimePlatform)
}

export function resolveClosedPrivateRuntimeBase(runtimePlatform = process.platform) {
  return validateClosedPrivateRuntimeBase(runtimePlatform)
}

function stableExecutableDigest(path, maxBytes = MAX_CLOSED_EXECUTABLE_BYTES) {
  let descriptor
  try {
    invariant(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= MAX_CLOSED_EXECUTABLE_BYTES, 'Closed executable byte limit is invalid')
    const pathBefore = lstatSync(path, { bigint: true })
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY
        | (fsConstants.O_CLOEXEC ?? 0)
        | (fsConstants.O_NOFOLLOW ?? 0),
    )
    const before = fstatSync(descriptor, { bigint: true })
    invariant(
      sameIdentity(pathBefore, before)
        && before.isFile()
        && before.size > 0n
        && before.size <= BigInt(maxBytes),
      `Closed executable size is outside the safe range at ${path}`,
    )
    const digest = createHash('sha256')
    const chunk = Buffer.allocUnsafe(1024 * 1024)
    let total = 0n
    while (true) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null)
      if (count === 0) break
      digest.update(chunk.subarray(0, count))
      total += BigInt(count)
    }
    const after = fstatSync(descriptor, { bigint: true })
    const pathAfter = lstatSync(path, { bigint: true })
    invariant(
      sameIdentity(before, after)
        && sameIdentity(after, pathAfter)
        && total === before.size,
      `Closed executable changed while it was authenticated at ${path}`,
    )
    return Object.freeze({
      info: after,
      sha256: digest.digest('hex'),
    })
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function canonicalRepositoryRoot(repoRoot) {
  if (repoRoot === undefined) return null
  invariant(
    typeof repoRoot === 'string' && resolve(repoRoot) === repoRoot,
    'Closed tool repository root must be an absolute normalized path',
  )
  const canonical = realpathSync(repoRoot)
  const info = lstatSync(canonical)
  invariant(
    canonical === repoRoot && info.isDirectory() && !info.isSymbolicLink(),
    'Closed tool repository root must be one canonical real directory',
  )
  return canonical
}

function validateClosedHookExecutableSource({
  candidate,
  label,
  repoRoot,
  runtimePlatform,
  allowCurrentOwner = false,
}) {
  invariant(
    typeof candidate === 'string' && isAbsolute(candidate) && resolve(candidate) === candidate,
    `Closed ${label} executable candidate must be one absolute normalized path`,
  )
  const source = realpathSync(candidate)
  const currentUid = typeof process.getuid === 'function' ? BigInt(process.getuid()) : null
  const authenticated = stableExecutableDigest(source)
  const info = authenticated.info
  invariant(
    info.isFile()
      && !info.isSymbolicLink()
      && (info.mode & 0o111n) !== 0n
      && (info.mode & 0o022n) === 0n
      && (
        info.uid === 0n
        || (
          allowCurrentOwner
          && currentUid !== null
          && info.uid === currentUid
          && info.nlink === 1n
        )
      ),
    `Closed ${label} executable source is unsafe at ${source}`,
  )
  if (repoRoot) {
    invariant(
      !isContained(repoRoot, source),
      `Closed ${label} executable source cannot be inside the governed repository`,
    )
  }
  return Object.freeze({
    label,
    runtimePlatform,
    sha256: authenticated.sha256,
    source,
    sourceInfo: info,
  })
}

function resolveClosedHookExecutable({
  label,
  nodeExecutable,
  repoRoot,
  runtimePlatform,
}) {
  if (label === 'node') {
    return validateClosedHookExecutableSource({
      candidate: nodeExecutable,
      label,
      repoRoot,
      runtimePlatform,
      allowCurrentOwner: true,
    })
  }
  const candidates = CLOSED_HOOK_EXECUTABLE_CANDIDATES[runtimePlatform]?.[label]
  invariant(candidates, `Closed ${label} execution is unsupported on platform ${runtimePlatform}`)
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      return validateClosedHookExecutableSource({
        candidate,
        label,
        repoRoot,
        runtimePlatform,
      })
    } catch {}
  }
  throw new Error(`No authenticated ${label} executable is available from the closed platform candidates`)
}

function resolveClosedHookSystemPaths(runtimePlatform) {
  invariant(
    CLOSED_HOOK_EXECUTABLE_CANDIDATES[runtimePlatform],
    `Closed hook tool execution is unsupported on platform ${runtimePlatform}`,
  )
  const records = new Map()
  for (const candidate of CLOSED_HOOK_SYSTEM_PATH_CANDIDATES) {
    if (!existsSync(candidate)) continue
    const canonical = realpathSync(candidate)
    if (records.has(canonical)) continue
    const info = lstatSync(canonical, { bigint: true })
    invariant(
      info.isDirectory()
        && !info.isSymbolicLink()
        && info.uid === 0n
        && (info.mode & 0o022n) === 0n,
      `Closed hook system PATH entry is unsafe at ${canonical}`,
    )
    records.set(canonical, Object.freeze({ path: canonical, info }))
  }
  invariant(records.size > 0, 'Closed hook system PATH has no authenticated directory')
  return Object.freeze([...records.values()])
}

function closedGitIdentityEnvironment(identity) {
  if (identity === undefined) return {}
  invariant(identity && typeof identity === 'object' && !Array.isArray(identity), 'Closed Git identity must be an object')
  const expected = [
    'authorDate',
    'authorEmail',
    'authorName',
    'committerDate',
    'committerEmail',
    'committerName',
  ]
  invariant(
    JSON.stringify(Object.keys(identity).sort()) === JSON.stringify(expected),
    'Closed Git identity has an open or incomplete shape',
  )
  for (const key of expected) {
    invariant(
      typeof identity[key] === 'string'
        && identity[key].length > 0
        && identity[key].length <= 320
        && !/[\0\r\n]/.test(identity[key]),
      `Closed Git identity ${key} is invalid`,
    )
  }
  invariant(
    !Number.isNaN(Date.parse(identity.authorDate))
      && !Number.isNaN(Date.parse(identity.committerDate)),
    'Closed Git identity dates are invalid',
  )
  return {
    GIT_AUTHOR_DATE: identity.authorDate,
    GIT_AUTHOR_EMAIL: identity.authorEmail,
    GIT_AUTHOR_NAME: identity.authorName,
    GIT_COMMITTER_DATE: identity.committerDate,
    GIT_COMMITTER_EMAIL: identity.committerEmail,
    GIT_COMMITTER_NAME: identity.committerName,
  }
}

export function validateClosedGitExecutable(executable) {
  invariant(typeof executable === 'string' && resolve(executable) === executable, 'Closed Git executable must be an absolute normalized path')
  let info
  try {
    info = lstatSync(executable)
  } catch (error) {
    throw new Error(`Closed Git executable is unavailable at ${executable}: ${error.message}`, { cause: error })
  }
  invariant(
    info.isFile()
      && !info.isSymbolicLink()
      && info.uid === 0
      && (info.mode & 0o111) !== 0
      && (info.mode & 0o022) === 0
      && realpathSync(executable) === executable,
    `Closed Git executable is unsafe at ${executable}`,
  )
  return executable
}

export function resolveClosedGitExecutable(runtimePlatform = process.platform) {
  const executable = CLOSED_GIT_EXECUTABLES[runtimePlatform]
  invariant(executable, `Closed Git execution is unsupported on platform ${runtimePlatform}`)
  return validateClosedGitExecutable(executable)
}

export function runClosedGit(args, {
  cwd,
  gitIdentity,
  input,
  maxInputBytes = 64 * 1024 * 1024,
  output = 'capture',
  maxOutputBytes = 8 * 1024 * 1024,
  runner = spawnSync,
  runtimePlatform = process.platform,
  timeoutMs = 5000,
} = {}) {
  invariant(Array.isArray(args) && args.length > 0 && args.every(value => typeof value === 'string'), 'Closed Git arguments must be a non-empty string array')
  invariant(
    !args.some(value => value === '-c'
      || value.startsWith('-c')
      || value === '--config-env'
      || value.startsWith('--config-env=')),
    'Closed Git callers may not inject global configuration arguments',
  )
  invariant(typeof cwd === 'string' && resolve(cwd) === cwd, 'Closed Git cwd must be one absolute normalized path')
  const cwdInfo = lstatSync(cwd)
  invariant(
    cwdInfo.isDirectory() && !cwdInfo.isSymbolicLink() && realpathSync(cwd) === cwd,
    'Closed Git cwd must be one canonical real directory',
  )
  invariant(['buffer', 'capture', 'ignore'].includes(output), 'Closed Git output mode is unsupported')
  invariant(Number.isInteger(maxInputBytes) && maxInputBytes > 0 && maxInputBytes <= 128 * 1024 * 1024, 'Closed Git input limit is outside the safe range')
  invariant(Number.isInteger(maxOutputBytes) && maxOutputBytes > 0 && maxOutputBytes <= MAX_CLOSED_GIT_OUTPUT_BYTES, 'Closed Git output limit is outside the safe range')
  invariant(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30_000, 'Closed Git timeout is outside the safe range')
  invariant(typeof runner === 'function', 'Closed Git runner must be callable')
  invariant(
    input === undefined || typeof input === 'string' || Buffer.isBuffer(input),
    'Closed Git input must be a string or Buffer',
  )
  invariant(
    input === undefined || Buffer.byteLength(input) <= maxInputBytes,
    'Closed Git input exceeds the closed size limit',
  )
  return runner(
    resolveClosedGitExecutable(runtimePlatform),
    [...CLOSED_GIT_GLOBAL_ARGUMENTS, ...args],
    {
      cwd,
      encoding: output === 'capture' ? 'utf8' : (output === 'buffer' ? null : undefined),
      env: {
        ...CLOSED_GIT_ENVIRONMENT,
        ...closedGitIdentityEnvironment(gitIdentity),
      },
      input,
      maxBuffer: maxOutputBytes,
      shell: false,
      stdio: output === 'ignore'
        ? [input === undefined ? 'ignore' : 'pipe', 'ignore', 'ignore']
        : [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      windowsHide: true,
    },
  )
}

function closedGitOutput(repoRoot, args, label, options = {}) {
  const result = runClosedGit(args, { cwd: resolve(repoRoot), ...options })
  invariant(
    !result.error && result.signal === null && result.status === 0 && typeof result.stdout === 'string',
    `Cannot resolve ${label} through closed Git`,
  )
  return result.stdout
}

export function validateCanonicalGovernanceHook(repoRoot) {
  const root = realpathSync(resolve(repoRoot))
  const expectedHookRoot = join(root, '.husky')
  const hookRootInfo = lstatSync(expectedHookRoot, { bigint: true })
  const precommitPath = join(expectedHookRoot, 'pre-commit')
  const precommitPathInfo = lstatSync(precommitPath, { bigint: true })
  invariant(
    precommitPathInfo.isFile() && !precommitPathInfo.isSymbolicLink(),
    'Repository-local Git hook path is not backed by the canonical executable .husky/pre-commit file',
  )
  const precommitSource = realpathSync(precommitPath)
  const authenticated = stableExecutableDigest(precommitPath, MAX_CANONICAL_GIT_HOOK_BYTES)
  const precommitInfo = authenticated.info
  const currentUid = typeof process.getuid === 'function' ? BigInt(process.getuid()) : null
  invariant(
    hookRootInfo.isDirectory()
      && !hookRootInfo.isSymbolicLink()
      && (hookRootInfo.mode & 0o022n) === 0n
      && currentUid !== null
      && (hookRootInfo.uid === currentUid || hookRootInfo.uid === 0n)
      && realpathSync(expectedHookRoot) === expectedHookRoot
      && precommitSource === precommitPath
      && precommitInfo.isFile()
      && !precommitInfo.isSymbolicLink()
      && precommitInfo.nlink === 1n
      && (precommitInfo.mode & 0o111n) !== 0n
      && (precommitInfo.mode & 0o022n) === 0n
      && (precommitInfo.mode & 0o7000n) === 0n
      && (precommitInfo.uid === currentUid || precommitInfo.uid === 0n),
    'Repository-local Git hook path is not backed by the canonical executable .husky/pre-commit file',
  )
  return Object.freeze({
    root,
    hookRoot: expectedHookRoot,
    hookPath: precommitPath,
    sha256: authenticated.sha256,
  })
}

export function assertClosedGitLocalConfiguration(repoRoot, options = {}) {
  const {
    allowHookPathMigration = false,
    ...gitOptions
  } = options
  invariant(typeof allowHookPathMigration === 'boolean', 'Closed Git hook migration option must be boolean')
  const root = realpathSync(resolve(repoRoot))
  const names = closedGitOutput(
    root,
    ['config', '--local', '--no-includes', '--null', '--name-only', '--list'],
    'repository-local Git configuration',
    gitOptions,
  ).split('\0').filter(Boolean)
  const hookPathNames = names.filter(name => name.toLowerCase() === 'core.hookspath')
  if (hookPathNames.length > 0 && !allowHookPathMigration) {
    const hookPaths = closedGitOutput(
      root,
      ['config', '--local', '--no-includes', '--null', '--get-all', 'core.hooksPath'],
      'repository-local Git hook path',
      gitOptions,
    ).split('\0').filter(Boolean)
    invariant(hookPathNames.length === 1 && hookPaths.length === 1, 'Repository-local Git hook path must be one exact canonical binding')
    // Accept every standard husky binding shape (relative `.husky`, husky v9 `.husky/_`,
    // or an absolute path) as long as it stays inside this repository. Byte-exact
    // absolute-path equality broke linked worktrees, re-clones, and path renames.
    const resolvedHookPath = resolve(root, hookPaths[0])
    invariant(
      isContained(root, resolvedHookPath),
      'Repository-local Git hook path must stay inside the repository',
    )
  }
  const dangerous = names
    .map(name => name.toLowerCase())
    .filter(name => name !== 'core.hookspath')
    .filter(name => DANGEROUS_LOCAL_GIT_CONFIG.test(name))
    .sort()
  invariant(
    dangerous.length === 0,
    `Repository-local Git configuration may execute unsupported external commands: ${dangerous.join(', ')}`,
  )
  return true
}

function ghSourceCandidates({ executable, runtimePlatform }) {
  if (executable !== undefined) {
    invariant(typeof executable === 'string' && isAbsolute(executable) && resolve(executable) === executable, 'Closed GitHub CLI override must be one absolute normalized path')
    return [executable]
  }
  const candidates = CLOSED_GH_CANDIDATES[runtimePlatform]
  invariant(candidates, `Closed GitHub CLI execution is unsupported on platform ${runtimePlatform}`)
  return candidates
}

function validateGhSource(candidate, repoRoot) {
  const source = realpathSync(candidate)
  const info = lstatSync(source, { bigint: true })
  const currentUid = typeof process.getuid === 'function' ? BigInt(process.getuid()) : null
  invariant(
    info.isFile()
      && !info.isSymbolicLink()
      && info.nlink === 1n
      && (info.mode & 0o111n) !== 0n
      && (info.mode & 0o022n) === 0n
      && (info.uid === 0n || (currentUid !== null && info.uid === currentUid)),
    `Closed GitHub CLI source is unsafe at ${source}`,
  )
  if (repoRoot) {
    const canonicalRepo = realpathSync(resolve(repoRoot))
    invariant(!isContained(canonicalRepo, source), 'Closed GitHub CLI source cannot be inside the governed repository')
  }
  return { source, info }
}

function registerPrivateCleanup(root) {
  ghCleanupRoots.add(root)
  if (ghCleanupRegistered) return
  ghCleanupRegistered = true
  process.once('exit', () => {
    for (const cleanupRoot of ghCleanupRoots) {
      try {
        chmodSync(cleanupRoot, 0o700)
        rmSync(cleanupRoot, { recursive: true, force: true })
      } catch {}
    }
  })
}

function materializeClosedGhExecutable(options = {}) {
  let selected = null
  for (const candidate of ghSourceCandidates(options)) {
    if (!existsSync(candidate)) continue
    try {
      selected = validateGhSource(candidate, options.repoRoot)
      break
    } catch (error) {
      if (options.executable !== undefined) throw error
    }
  }
  invariant(selected, 'No authenticated GitHub CLI executable is available from the closed platform candidates')
  const cacheKey = `${options.runtimePlatform ?? process.platform}\0${selected.source}`
  const cached = cachedGhExecutables.get(cacheKey)
  if (cached) {
    const current = lstatSync(cached.source, { bigint: true })
    invariant(sameIdentity(current, cached.sourceInfo), 'Closed GitHub CLI source changed after it was authenticated')
    const privateInfo = lstatSync(cached.executable, { bigint: true })
    invariant(
      sameIdentity(privateInfo, cached.privateInfo)
        && sha256(readFileSync(cached.executable)) === cached.sha256,
      'Private GitHub CLI executable changed after it was authenticated',
    )
    return cached.executable
  }
  const temporaryBase = validateClosedPrivateRuntimeBase(options.runtimePlatform ?? process.platform)
  const root = realpathSync(mkdtempSync(join(temporaryBase, 'qijenchen-closed-gh-')))
  chmodSync(root, 0o700)
  if (options.repoRoot) {
    const canonicalRepo = realpathSync(resolve(options.repoRoot))
    invariant(!isContained(canonicalRepo, root), 'Closed GitHub CLI private executable cannot be materialized inside the governed repository')
  }
  const executable = join(root, 'gh')
  const before = lstatSync(selected.source, { bigint: true })
  const bytes = readFileSync(selected.source)
  const after = lstatSync(selected.source, { bigint: true })
  invariant(sameIdentity(before, after), 'GitHub CLI source changed while it was authenticated')
  let descriptor
  try {
    descriptor = openSync(executable, 'wx', 0o500)
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
  const privateInfo = lstatSync(executable, { bigint: true })
  invariant(
    privateInfo.isFile()
      && !privateInfo.isSymbolicLink()
      && privateInfo.nlink === 1n
      && (privateInfo.mode & 0o777n) === 0o500n
      && privateInfo.size === BigInt(bytes.length)
      && sha256(readFileSync(executable)) === sha256(bytes),
    'Private GitHub CLI executable failed authenticated materialization',
  )
  registerPrivateCleanup(root)
  const materialized = Object.freeze({
    executable,
    privateInfo,
    root,
    sha256: sha256(bytes),
    source: selected.source,
    sourceInfo: after,
  })
  cachedGhExecutables.set(cacheKey, materialized)
  return executable
}

export function materializeClosedHookToolProfile({
  nodeExecutable = process.execPath,
  repoRoot,
  runtimePlatform = process.platform,
} = {}) {
  invariant(
    typeof nodeExecutable === 'string'
      && isAbsolute(nodeExecutable)
      && resolve(nodeExecutable) === nodeExecutable,
    'Closed hook Node executable must be one absolute normalized path',
  )
  const canonicalRepo = canonicalRepositoryRoot(repoRoot)
  const executableRecords = Object.fromEntries(
    ['bash', 'git', 'jq', 'node', 'python3'].map((label) => [
      label,
      resolveClosedHookExecutable({
        label,
        nodeExecutable,
        repoRoot: canonicalRepo,
        runtimePlatform,
      }),
    ]),
  )
  const systemPaths = resolveClosedHookSystemPaths(runtimePlatform)
  const cacheKey = [
    runtimePlatform,
    canonicalRepo ?? '',
    ...Object.values(executableRecords).map(record => `${record.label}:${record.source}:${record.sha256}`),
    ...systemPaths.map(record => record.path),
  ].join('\0')
  const cached = cachedHookToolPaths.get(cacheKey)
  if (cached) {
    cached.verify()
    return cached
  }

  // If the honored TMPDIR sits inside the governed repository (common in isolated test
  // fixtures that pin TMPDIR to a snapshot directory), fall back to a base outside the
  // repository: first the platform base, then the repository's parent directory (for
  // sandboxes where only the checkout's own volume is writable).
  let root = null
  const baseCandidates = []
  const honoredBase = validateClosedPrivateRuntimeBase(runtimePlatform)
  if (!canonicalRepo || !isContained(canonicalRepo, honoredBase)) baseCandidates.push(honoredBase)
  else {
    baseCandidates.push(() => validateClosedPlatformRuntimeBase(runtimePlatform))
    baseCandidates.push(() => dirname(canonicalRepo))
  }
  let lastBaseError = null
  for (const candidate of baseCandidates) {
    try {
      const temporaryBase = typeof candidate === 'function' ? candidate() : candidate
      root = realpathSync(mkdtempSync(join(temporaryBase, 'qijenchen-closed-hook-tools-')))
      break
    } catch (error) {
      lastBaseError = error
    }
  }
  if (!root) throw lastBaseError || new Error('Closed hook tool profile has no writable private base')
  chmodSync(root, 0o700)
  if (canonicalRepo) {
    invariant(
      !isContained(canonicalRepo, root),
      'Closed hook tool profile cannot be materialized inside the governed repository',
    )
  }
  const homeDirectory = join(root, 'home')
  const tempDirectory = join(root, 'tmp')
  const directoryDescriptor = (path) => {
    const descriptor = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_CLOEXEC ?? 0))
    try {
      return fstatSync(descriptor, { bigint: true })
    } finally {
      closeSync(descriptor)
    }
  }
  mkdirSync(homeDirectory, { mode: 0o700 })
  mkdirSync(tempDirectory, { mode: 0o700 })
  const materializedHome = realpathSync(homeDirectory)
  const materializedTemp = realpathSync(tempDirectory)

  const executablePaths = {}
  const linkRecords = {}
  for (const [label, record] of Object.entries(executableRecords)) {
    const executablePath = join(root, label)
    symlinkSync(record.source, executablePath)
    const linkInfo = lstatSync(executablePath, { bigint: true })
    invariant(
      linkInfo.isSymbolicLink()
        && readlinkSync(executablePath) === record.source,
      `Closed ${label} executable alias failed authenticated materialization`,
    )
    executablePaths[label] = executablePath
    linkRecords[label] = Object.freeze({
      info: linkInfo,
      path: executablePath,
      target: record.source,
    })
  }
  chmodSync(root, 0o500)
  const rootInfo = lstatSync(root, { bigint: true })
  const homeInfo = directoryDescriptor(materializedHome)
  const tempInfo = directoryDescriptor(materializedTemp)
  const executablePath = [root, ...systemPaths.map(record => record.path)].join(':')
  const profileSha256 = sha256(JSON.stringify({
    executablePath,
    executables: Object.fromEntries(
      Object.entries(executableRecords).map(([label, record]) => [
        label,
        { source: record.source, sha256: record.sha256 },
      ]),
    ),
    runtimePlatform,
    schemaVersion: 1,
    systemPaths: systemPaths.map(record => record.path),
  }))

  const verify = () => {
    const currentRoot = lstatSync(root, { bigint: true })
    invariant(
      sameIdentity(currentRoot, rootInfo)
        && currentRoot.isDirectory()
        && !currentRoot.isSymbolicLink()
        && (currentRoot.mode & 0o777n) === 0o500n,
      'Closed hook tool profile root changed after it was authenticated',
    )
    invariant(
      sameDirectoryIdentity(directoryDescriptor(materializedHome), homeInfo)
        && sameDirectoryIdentity(directoryDescriptor(materializedTemp), tempInfo),
      'Closed hook private HOME or TMPDIR changed after it was authenticated',
    )
    for (const [label, record] of Object.entries(executableRecords)) {
      const sourceInfo = lstatSync(record.source, { bigint: true })
      invariant(
        sameIdentity(sourceInfo, record.sourceInfo),
        `Closed ${label} executable source changed after it was authenticated`,
      )
      const link = linkRecords[label]
      const linkInfo = lstatSync(link.path, { bigint: true })
      invariant(
        sameIdentity(linkInfo, link.info)
          && linkInfo.isSymbolicLink()
          && readlinkSync(link.path) === link.target,
        `Closed ${label} executable alias changed after it was authenticated`,
      )
    }
    for (const record of systemPaths) {
      invariant(
        sameIdentity(lstatSync(record.path, { bigint: true }), record.info),
        `Closed hook system PATH entry changed after it was authenticated:${record.path}`,
      )
    }
    return true
  }

  registerPrivateCleanup(root)
  const profile = Object.freeze({
    executablePath,
    executables: Object.freeze(executablePaths),
    homeDirectory: materializedHome,
    profileSha256,
    root,
    runtimePlatform,
    sources: Object.freeze(Object.fromEntries(
      Object.entries(executableRecords).map(([label, record]) => [
        label,
        Object.freeze({ path: record.source, sha256: record.sha256 }),
      ]),
    )),
    tempDirectory: materializedTemp,
    verify,
  })
  cachedHookToolPaths.set(cacheKey, profile)
  profile.verify()
  return profile
}

export function captureClosedGitHubToken({
  token,
  environment = process.env,
  requireToken = true,
  tokenEnvironmentName = 'GH_TOKEN',
} = {}) {
  invariant(
    tokenEnvironmentName === null || tokenEnvironmentName === 'GH_TOKEN' || tokenEnvironmentName === 'GITHUB_TOKEN',
    'Closed GitHub CLI token authority name is unsupported',
  )
  if (token !== undefined) {
    invariant(typeof token === 'string', 'Closed GitHub CLI token override must be a string')
  }
  const ambient = ['GH_TOKEN', 'GITHUB_TOKEN']
    .filter(name => typeof environment?.[name] === 'string' && environment[name] !== '')
  invariant(ambient.length <= 1, 'Closed GitHub CLI received multiple token authorities')
  if (token !== undefined && token !== '') {
    invariant(ambient.length === 0, 'Closed GitHub CLI explicit token conflicts with an ambient token authority')
  } else if (ambient.length) {
    invariant(
      tokenEnvironmentName !== null && ambient[0] === tokenEnvironmentName,
      `Closed GitHub CLI token authority must be ${tokenEnvironmentName ?? 'an explicit token'}`,
    )
  }
  const candidate = token !== undefined && token !== ''
    ? token
    : (ambient.length ? environment[ambient[0]] : null)
  if (candidate === null) {
    invariant(!requireToken, 'Closed GitHub CLI requires one explicit GH_TOKEN or GITHUB_TOKEN')
    return null
  }
  invariant(
    candidate.length >= 8
      && candidate.length <= 4096
      && !/[\0\r\n]/.test(candidate),
    'Closed GitHub CLI token is malformed',
  )
  return candidate
}

export function runClosedGh(args, {
  cwd,
  environment = process.env,
  executable,
  input,
  maxInputBytes = 16 * 1024 * 1024,
  maxOutputBytes = 16 * 1024 * 1024,
  output = 'capture',
  repoRoot,
  requireToken = true,
  runtimePlatform = process.platform,
  timeoutMs = 60_000,
  token,
  tokenEnvironmentName = 'GH_TOKEN',
} = {}) {
  invariant(Array.isArray(args) && args.length > 0 && args.every(value => typeof value === 'string'), 'Closed GitHub CLI arguments must be a non-empty string array')
  invariant(typeof cwd === 'string' && resolve(cwd) === cwd, 'Closed GitHub CLI cwd must be one absolute normalized path')
  invariant(['buffer', 'capture', 'ignore'].includes(output), 'Closed GitHub CLI output mode is unsupported')
  invariant(Number.isInteger(maxInputBytes) && maxInputBytes > 0 && maxInputBytes <= 64 * 1024 * 1024, 'Closed GitHub CLI input limit is outside the safe range')
  invariant(Number.isInteger(maxOutputBytes) && maxOutputBytes > 0 && maxOutputBytes <= 128 * 1024 * 1024, 'Closed GitHub CLI output limit is outside the safe range')
  invariant(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 120_000, 'Closed GitHub CLI timeout is outside the safe range')
  invariant(
    input === undefined || typeof input === 'string' || Buffer.isBuffer(input),
    'Closed GitHub CLI input must be a string or Buffer',
  )
  invariant(
    input === undefined || Buffer.byteLength(input) <= maxInputBytes,
    'Closed GitHub CLI input exceeds the closed size limit',
  )
  const githubToken = captureClosedGitHubToken({
    token,
    environment,
    requireToken,
    tokenEnvironmentName,
  })
  const privateExecutable = materializeClosedGhExecutable({ executable, repoRoot, runtimePlatform })
  const privateHome = dirname(privateExecutable)
  return spawnSync(
    privateExecutable,
    [...CLOSED_GH_ARGUMENT_PREFIX, ...args],
    {
      cwd,
      encoding: output === 'capture' ? 'utf8' : (output === 'buffer' ? null : undefined),
      env: {
        GH_HOST: 'github.com',
        GH_CONFIG_DIR: privateHome,
        GH_PAGER: 'cat',
        GH_PROMPT_DISABLED: '1',
        ...(githubToken ? { GH_TOKEN: githubToken } : {}),
        HOME: privateHome,
        LANG: 'C',
        LC_ALL: 'C',
        NO_COLOR: '1',
        PAGER: 'cat',
        PATH: '/usr/bin:/bin',
        XDG_CONFIG_HOME: privateHome,
      },
      input,
      maxBuffer: maxOutputBytes,
      shell: false,
      stdio: output === 'ignore' ? 'ignore' : ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      windowsHide: true,
    },
  )
}

export function closedToolExecutionPaths() {
  return Object.freeze({
    git: resolveClosedGitExecutable(),
    gh: [...cachedGhExecutables.values()].map(record => record.executable).sort(),
    hookProfiles: [...cachedHookToolPaths.values()].map(record => Object.freeze({
      executablePath: record.executablePath,
      profileSha256: record.profileSha256,
      root: record.root,
    })),
  })
}

import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { constants as fsConstants } from 'node:fs'
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { assertDeepAuditInventoryTopology, captureDeepAuditSnapshot } from './deep-audit-evidence-contract.mjs'
import {
  assertClosedGitLocalConfiguration,
  materializeClosedHookToolProfile,
  resolveClosedPrivateRuntimeBase,
  runClosedGit,
} from './closed-tool-execution.mjs'
import { resolveProvisionedPlaywrightRuntime } from '../../infra/governance/lib/playwright-runtime.mjs'
import { compareUtf8Bytes } from './provider-lifecycle.mjs'

function fail(message) {
  throw new Error(`disposable repository snapshot blocked:${message}`)
}

const snapshotToolProfiles = new WeakMap()

function contained(root, target, { allowRoot = true } = {}) {
  const rel = relative(root, target)
  if (!rel) return allowRoot
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function gitCommand(root, args, options = {}) {
  assertClosedGitLocalConfiguration(root, { maxOutputBytes: 4 * 1024 * 1024 })
  const result = runClosedGit(args, {
    cwd: root,
    maxOutputBytes: 32 * 1024 * 1024,
    output: options.output ?? 'capture',
    timeoutMs: options.timeout ?? 30_000,
  })
  if (options.allowFailure) return result
  if (result.status !== 0) {
    const detail = `${result.stderr || result.stdout || result.error?.message || result.signal || 'unknown failure'}`.trim()
    fail(`closed Git ${args.join(' ')} failed:${detail.slice(-2000)}`)
  }
  return result
}

function gitOutput(root, args, { allowFailure = false } = {}) {
  const result = gitCommand(root, args, { allowFailure })
  return result.status === 0 ? result.stdout.trim() : null
}

function assertRepositoryRoot(root) {
  const requested = resolve(root)
  let canonical
  try { canonical = realpathSync(requested) } catch (error) { fail(`repository is unavailable:${error.message}`) }
  const info = lstatSync(canonical)
  if (!info.isDirectory() || info.isSymbolicLink()) fail('repository root must be a real directory')
  if (gitOutput(canonical, ['rev-parse', '--is-inside-work-tree']) !== 'true') fail('repository is not a Git worktree')
  const topLevel = gitOutput(canonical, ['rev-parse', '--show-toplevel'])
  if (!topLevel || realpathSync(topLevel) !== canonical) fail('repository root must be the exact Git worktree top level')
  return canonical
}

function validateSymlink(sourceRoot, sourcePath, linkText) {
  if (isAbsolute(linkText)) fail(`absolute symbolic link is forbidden:${relative(sourceRoot, sourcePath)}`)
  const lexicalTarget = resolve(dirname(sourcePath), linkText)
  if (!contained(sourceRoot, lexicalTarget)) fail(`symbolic link escapes repository:${relative(sourceRoot, sourcePath)}`)
  try {
    const realTarget = realpathSync(sourcePath)
    if (!contained(sourceRoot, realTarget)) fail(`symbolic link resolves outside repository:${relative(sourceRoot, sourcePath)}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

function copyTreeContents(sourceRoot, destinationRoot, source = sourceRoot, { skipNodeModules = false } = {}) {
  for (const entry of readdirSync(source, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))) {
    if (source === sourceRoot && entry.name === '.git') continue
    const sourcePath = join(source, entry.name)
    const rel = relative(sourceRoot, sourcePath)
    const destinationPath = join(destinationRoot, rel)
    const info = lstatSync(sourcePath)
    if (skipNodeModules && info.isDirectory() && entry.name === 'node_modules') continue
    if (info.isSymbolicLink()) {
      const linkText = readlinkSync(sourcePath)
      validateSymlink(sourceRoot, sourcePath, linkText)
      mkdirSync(dirname(destinationPath), { recursive: true })
      symlinkSync(linkText, destinationPath, process.platform === 'win32' ? (entry.isDirectory() ? 'dir' : 'file') : undefined)
      continue
    }
    if (info.isDirectory()) {
      mkdirSync(destinationPath, { recursive: true, mode: info.mode & 0o777 })
      copyTreeContents(sourceRoot, destinationRoot, sourcePath, { skipNodeModules })
      chmodSync(destinationPath, info.mode & 0o777)
      utimesSync(destinationPath, info.atime, info.mtime)
      continue
    }
    if (!info.isFile()) fail(`unsupported filesystem entry:${rel}`)
    mkdirSync(dirname(destinationPath), { recursive: true })
    copyFileSync(sourcePath, destinationPath, fsConstants.COPYFILE_FICLONE)
    chmodSync(destinationPath, info.mode & 0o777)
    utimesSync(destinationPath, info.atime, info.mtime)
  }
}

function dependencyViewRoots(dependencyRoot) {
  const installedLockPath = join(dependencyRoot, 'node_modules', '.package-lock.json')
  if (!existsSync(installedLockPath)) fail(`dependency root has no installed package lock:${dependencyRoot}`)
  let installed
  try { installed = JSON.parse(readFileSync(installedLockPath, 'utf8')) } catch (error) { fail(`installed package lock is invalid JSON:${error.message}`) }
  const roots = new Set(['node_modules'])
  for (const path of Object.keys(installed.packages ?? {})) {
    if (typeof path !== 'string' || isAbsolute(path) || path.includes('\\')
      || path.split('/').some((part) => !part || part === '.' || part === '..')) fail(`installed package-lock path is unsafe:${String(path)}`)
    const marker = path.indexOf('/node_modules/')
    if (marker >= 0) roots.add(path.slice(0, marker + '/node_modules'.length))
  }
  const ordered = [...roots].sort((left, right) => {
    const depth = left.split('/').length - right.split('/').length
    return depth || compareUtf8Bytes(left, right)
  })
  const disjoint = []
  for (const root of ordered) {
    // Each selected root is copied recursively. A nested node_modules root is
    // already covered byte-for-byte by its selected ancestor; materializing it
    // again is both redundant and invalid for preserved .bin symlinks (the
    // second symlinkSync would collide with the first copy). Workspace-local
    // roots remain selected because no other dependency root contains them.
    if (disjoint.some((ancestor) => root.startsWith(`${ancestor}/`))) continue
    disjoint.push(root)
  }
  return disjoint
}

function copyDependencyView(dependencyRoot, snapshotRoot) {
  const views = []
  for (const relativeRoot of dependencyViewRoots(dependencyRoot)) {
    assertSourceAncestors(dependencyRoot, `${relativeRoot}/placeholder`)
    const source = join(dependencyRoot, ...relativeRoot.split('/'))
    if (!existsSync(source)) fail(`installed dependency view is absent:${relativeRoot}`)
    const info = lstatSync(source)
    if (!info.isDirectory() || info.isSymbolicLink()) fail(`dependency node_modules must be a real directory:${source}`)
    const destination = join(snapshotRoot, ...relativeRoot.split('/'))
    mkdirSync(destination, { recursive: true, mode: info.mode & 0o777 })
    copyTreeContents(dependencyRoot, snapshotRoot, source)
    for (const cacheName of ['.cache', '.tmp', '.vite', '.vite-temp']) {
      rmSync(join(destination, cacheName), { recursive: true, force: true })
    }
    // Vite's bundled TypeScript-config loader writes a uniquely named module
    // under the nearest node_modules/.vite-temp and unlinks that module after
    // loading, but intentionally leaves the directory behind. Seed the empty,
    // private scratch mountpoint into the before-image so a normal config load
    // is byte-identical before/after. The full dependency fingerprint still
    // rejects any file, link, mode, or other persistent change inside it.
    const viteConfigScratch = join(destination, '.vite-temp')
    mkdirSync(viteConfigScratch, { recursive: true, mode: 0o700 })
    chmodSync(viteConfigScratch, 0o700)
    chmodSync(destination, info.mode & 0o777)
    utimesSync(destination, info.atime, info.mtime)
    views.push({ label: relativeRoot, path: destination })
  }
  return views
}

function configureSnapshotGit(sourceRoot, snapshotRoot) {
  const sourceGitDirectory = gitOutput(sourceRoot, ['rev-parse', '--absolute-git-dir'])
  const snapshotGitDirectory = gitOutput(snapshotRoot, ['rev-parse', '--absolute-git-dir'])
  const head = gitOutput(sourceRoot, ['rev-parse', 'HEAD'])
  const branch = gitOutput(sourceRoot, ['symbolic-ref', '-q', 'HEAD'], { allowFailure: true })
  if (branch) {
    gitCommand(snapshotRoot, ['update-ref', branch, head])
    gitCommand(snapshotRoot, ['symbolic-ref', 'HEAD', branch])
  } else gitCommand(snapshotRoot, ['update-ref', '--no-deref', 'HEAD', head])
  const sourceIndex = join(sourceGitDirectory, 'index')
  const snapshotIndex = join(snapshotGitDirectory, 'index')
  if (existsSync(sourceIndex)) {
    const before = lstatSync(sourceIndex, { bigint: true })
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) fail('source Git index is not one regular unaliased file')
    const bytes = readFileSync(sourceIndex)
    const after = lstatSync(sourceIndex, { bigint: true })
    if (
      before.dev !== after.dev
        || before.ino !== after.ino
        || before.mode !== after.mode
        || before.size !== after.size
        || before.mtimeNs !== after.mtimeNs
        || before.ctimeNs !== after.ctimeNs
    ) fail('source Git index changed while the disposable snapshot was configured')
    writeFileSync(snapshotIndex, bytes)
    if (!readFileSync(snapshotIndex).equals(bytes)) fail('snapshot Git index differs from the captured source index')
  }
  else if (existsSync(snapshotIndex)) rmSync(snapshotIndex)
  for (const key of ['core.filemode', 'core.ignorecase', 'core.symlinks', 'core.autocrlf']) {
    const value = gitOutput(sourceRoot, ['config', '--get', key], { allowFailure: true })
    if (value !== null && value !== '') gitCommand(snapshotRoot, ['config', key, value])
  }
  gitCommand(snapshotRoot, ['config', 'core.fsmonitor', 'false'])
}

function manifestTreeShape(manifest) {
  if (!manifest || !Array.isArray(manifest.inventory) || !manifest.inventory.length) fail('frozen manifest inventory is unavailable')
  assertDeepAuditInventoryTopology(manifest.inventory, 'frozen manifest inventory')
  const leaves = new Map()
  const ancestors = new Set()
  for (const row of manifest.inventory) {
    if (!row || typeof row !== 'object') fail('manifest inventory row is invalid')
    if (typeof row.path !== 'string' || !row.path || row.path.includes('\\') || isAbsolute(row.path)
      || row.path.split('/').some((part) => !part || part === '.' || part === '..')) fail(`manifest path is unsafe:${String(row.path)}`)
    const parts = row.path.split('/')
    if (leaves.has(row.path)) fail(`manifest path is duplicated:${row.path}`)
    leaves.set(row.path, row)
    for (let index = 1; index < parts.length; index += 1) ancestors.add(parts.slice(0, index).join('/'))
  }
  return { ancestors, leaves }
}

function strictManifestBlocker(shape, path) {
  const parts = path.split('/')
  for (let index = 1; index < parts.length; index += 1) {
    const ancestor = shape.leaves.get(parts.slice(0, index).join('/'))
    if (ancestor && ['file', 'symlink'].includes(ancestor.kind)) return ancestor
  }
  return null
}

/**
 * Freeze the caller's current Git inventory without traversing ignored paths.
 * The canonical inventory source is Git's tracked index plus untracked,
 * non-ignored files; rows are immutable so later snapshot creation cannot
 * silently widen what it is permitted to read.
 */
export function captureFrozenRepositoryManifest(root) {
  const captured = captureDeepAuditSnapshot(root)
  const inventory = captured.inventory.map((row) => Object.freeze({ ...row }))
  return Object.freeze({ inventory: Object.freeze(inventory) })
}

function assertSourceAncestors(sourceRoot, relativePath) {
  const parts = relativePath.split('/')
  let current = sourceRoot
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = join(current, parts[index])
    const info = lstatSync(current)
    if (!info.isDirectory() || info.isSymbolicLink()) fail(`manifest path ancestor is not a real directory:${relativePath}`)
  }
}

function materializeSnapshotFromManifest(sourceRoot, snapshotRoot, manifest) {
  const shape = manifestTreeShape(manifest)
  for (const [path, row] of shape.leaves) {
    if (!['file', 'symlink', 'missing'].includes(row.kind)) fail(`manifest path kind is invalid:${path}`)
    if (row.kind === 'missing') continue
    assertSourceAncestors(sourceRoot, path)
    const sourcePath = join(sourceRoot, ...path.split('/'))
    const destinationPath = join(snapshotRoot, ...path.split('/'))
    const info = lstatSync(sourcePath)
    const bytes = row.kind === 'symlink' ? Buffer.from(readlinkSync(sourcePath)) : readFileSync(sourcePath)
    if (row.kind === 'symlink') {
      if (!info.isSymbolicLink()) fail(`manifest path kind differs before materialization:${path}`)
      validateSymlink(sourceRoot, sourcePath, bytes.toString('utf8'))
    } else if (!info.isFile() || info.isSymbolicLink()) fail(`manifest path kind differs before materialization:${path}`)
    if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
      fail(`manifest path bytes changed before materialization:${path}`)
    }
    if (process.platform !== 'win32' && row.kind === 'file') {
      const executable = (info.mode & 0o111) !== 0
      if ((row.mode === '100755') !== executable) fail(`manifest path executable mode changed before materialization:${path}`)
    }
    mkdirSync(dirname(destinationPath), { recursive: true })
    if (row.kind === 'symlink') symlinkSync(bytes.toString('utf8'), destinationPath)
    else {
      // Materialize the exact buffer whose digest was checked above. Re-reading
      // sourcePath through copyFileSync would reopen a TOCTOU window in which a
      // concurrent worktree mutation could replace the verified bytes.
      writeFileSync(destinationPath, bytes, { mode: row.mode === '100755' ? 0o755 : 0o644 })
      chmodSync(destinationPath, row.mode === '100755' ? 0o755 : 0o644)
      utimesSync(destinationPath, info.atime, info.mtime)
    }
  }
  return shape
}

function pruneSnapshotDirectory(snapshotRoot, current, shape) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (current === snapshotRoot && (entry.name === '.git' || entry.name === 'node_modules')) continue
    const path = join(current, entry.name)
    const rel = relative(snapshotRoot, path).split(sep).join('/')
    const row = shape.leaves.get(rel)
    const info = lstatSync(path)
    if (row) {
      if (row.kind === 'missing') rmSync(path, { recursive: true, force: true })
      continue
    }
    if (shape.ancestors.has(rel) && info.isDirectory() && !info.isSymbolicLink()) {
      pruneSnapshotDirectory(snapshotRoot, path, shape)
      continue
    }
    rmSync(path, { recursive: true, force: true })
  }
}

export function pruneSnapshotToManifest(snapshotRoot, manifest) {
  const root = realpathSync(resolve(snapshotRoot))
  const shape = manifestTreeShape(manifest)
  pruneSnapshotDirectory(root, root, shape)
  return shape
}

export function createDisposableRepositorySnapshot({ root, dependencyRoot = root, prefix = 'governance-repository-snapshot-', manifest = null } = {}) {
  if (typeof prefix !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(prefix)) {
    fail('snapshot prefix is invalid')
  }
  const sourceRoot = assertRepositoryRoot(root)
  const dependencies = realpathSync(resolve(dependencyRoot ?? sourceRoot))
  const parent = mkdtempSync(join(resolveClosedPrivateRuntimeBase(), prefix))
  const snapshotRoot = join(parent, 'repo')
  try {
    gitCommand(sourceRoot, ['clone', '--local', '--no-hardlinks', '--no-checkout', '--quiet', '--', sourceRoot, snapshotRoot], { timeout: 30_000 })
    configureSnapshotGit(sourceRoot, snapshotRoot)
    // A frozen audit must never transiently scan/copy ignored or non-manifest
    // worktree data.  The clone above copies Git objects only (`--no-checkout`);
    // materialize each frozen inventory leaf directly and verify before reading
    // anything else from the caller worktree.
    if (manifest) materializeSnapshotFromManifest(sourceRoot, snapshotRoot, manifest)
    else copyTreeContents(sourceRoot, snapshotRoot, sourceRoot, { skipNodeModules: true })
    const dependencyViews = copyDependencyView(dependencies, snapshotRoot)
    const dependencyView = dependencyViews.find((item) => item.label === 'node_modules')?.path
    if (!dependencyView) fail('top-level installed dependency view is unavailable')
    const runtimeRoot = join(parent, 'runtime')
    for (const directory of [
      'tmp',
      'cache',
      'npm-cache',
      'corepack-cache',
      'home',
      'home/.config',
      'home/.local/share',
      'home/.local/state',
    ]) mkdirSync(join(runtimeRoot, directory), { recursive: true, mode: 0o700 })
    return {
      sourceRoot,
      dependencyRoot: dependencies,
      dependencyView,
      dependencyViews,
      dependencyMaterialization: 'inode-independent-copy-on-write-or-byte-copy',
      parent,
      runtimeRoot,
      snapshotRoot,
    }
  } catch (error) {
    rmSync(parent, { recursive: true, force: true })
    throw error
  }
}

function fingerprintEntry(root, current, rows) {
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))) {
    if (current === root && entry.name === '.git') continue
    const path = join(current, entry.name)
    const rel = relative(root, path).split(sep).join('/')
    const info = lstatSync(path)
    if (info.isDirectory() && entry.name === 'node_modules') continue
    const mode = (info.mode & 0o7777).toString(8)
    if (info.isSymbolicLink()) rows.push(`${rel}\0link\0${mode}\0${readlinkSync(path)}`)
    else if (info.isDirectory()) {
      rows.push(`${rel}\0dir\0${mode}`)
      fingerprintEntry(root, path, rows)
    } else if (info.isFile()) rows.push(`${rel}\0file\0${mode}\0${createHash('sha256').update(readFileSync(path)).digest('hex')}`)
    else rows.push(`${rel}\0special\0${mode}`)
  }
}

function gitControlFingerprint(root) {
  const gitDirectory = gitOutput(root, ['rev-parse', '--absolute-git-dir'])
  const commonDirectoryRaw = gitOutput(root, ['rev-parse', '--git-common-dir'])
  const commonDirectory = realpathSync(isAbsolute(commonDirectoryRaw) ? commonDirectoryRaw : resolve(root, commonDirectoryRaw))
  const candidates = new Set([join(gitDirectory, 'HEAD'), join(gitDirectory, 'index'), join(commonDirectory, 'config'), join(commonDirectory, 'packed-refs')])
  const rows = []
  for (const path of [...candidates].sort()) {
    if (!existsSync(path)) continue
    const info = lstatSync(path)
    if (!info.isFile() || info.isSymbolicLink()) fail(`Git control path is not a regular file:${path}`)
    rows.push(`${path}\0${(info.mode & 0o7777).toString(8)}\0${createHash('sha256').update(readFileSync(path)).digest('hex')}`)
  }
  return rows
}

export function fingerprintCallerRepository(root) {
  const repository = assertRepositoryRoot(root)
  const rows = fingerprintRepositoryWorktree(repository)
  rows.push(...gitControlFingerprint(repository))
  return rows.sort()
}

/**
 * Fingerprint repository-owned working-tree bytes/types/modes only.
 *
 * This deliberately excludes .git and node_modules. Use it around commands
 * running inside a disposable snapshot, where read-only Git operations may
 * legitimately refresh index metadata but source mutations must still be
 * rejected. Use fingerprintCallerRepository for the stronger caller-side
 * zero-write invariant.
 */
export function fingerprintRepositoryWorktree(root) {
  const repository = assertRepositoryRoot(root)
  const rows = []
  fingerprintEntry(repository, repository, rows)
  return rows.sort()
}

export function diffRepositoryFingerprints(before, after) {
  const left = new Set(before)
  const right = new Set(after)
  return [
    ...before.filter((row) => !right.has(row)).map((row) => `before:${row.split('\0')[0]}`),
    ...after.filter((row) => !left.has(row)).map((row) => `after:${row.split('\0')[0]}`),
  ]
}

export function digestRepositoryFingerprint(rows) {
  if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'string')) fail('repository fingerprint rows are invalid')
  return createHash('sha256').update(`${rows.join('\n')}\n`).digest('hex')
}

function fingerprintCompleteTree(root, current, rows) {
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
    const path = join(current, entry.name)
    const rel = relative(root, path).split(sep).join('/')
    const info = lstatSync(path)
    const mode = (info.mode & 0o7777).toString(8)
    if (info.isSymbolicLink()) rows.push(`${rel}\0link\0${mode}\0${readlinkSync(path)}`)
    else if (info.isDirectory()) {
      rows.push(`${rel}\0dir\0${mode}`)
      fingerprintCompleteTree(root, path, rows)
    } else if (info.isFile()) rows.push(`${rel}\0file\0${mode}\0${createHash('sha256').update(readFileSync(path)).digest('hex')}`)
    else rows.push(`${rel}\0special\0${mode}`)
  }
}

export function fingerprintDependencyView(dependencyView) {
  const requested = Array.isArray(dependencyView)
    ? dependencyView
    : [{ label: 'node_modules', path: dependencyView }]
  const rows = []
  for (const item of requested) {
    if (!item || typeof item.label !== 'string' || !item.label || typeof item.path !== 'string') fail('dependency view descriptor is invalid')
    const root = realpathSync(resolve(item.path))
    const local = []
    fingerprintCompleteTree(root, root, local)
    rows.push(...local.map((row) => `${item.label}/${row}`))
  }
  return rows.sort()
}

function dependencyIdentity(entry) {
  return JSON.stringify({
    version: entry?.version ?? null,
    resolved: entry?.resolved ?? null,
    integrity: entry?.integrity ?? null,
    link: entry?.link ?? false,
  })
}

export function validateInstalledDependencyIdentity(snapshotRoot) {
  const canonicalPath = join(snapshotRoot, 'package-lock.json')
  const installedPath = join(snapshotRoot, 'node_modules', '.package-lock.json')
  if (!existsSync(canonicalPath) || !existsSync(installedPath)) fail('canonical/installed package-lock identity is unavailable')
  const canonicalBytes = readFileSync(canonicalPath)
  const installedBytes = readFileSync(installedPath)
  let canonical
  let installed
  try {
    canonical = JSON.parse(canonicalBytes)
    installed = JSON.parse(installedBytes)
  } catch (error) { fail(`canonical/installed package-lock is invalid JSON:${error.message}`) }
  if (canonical.lockfileVersion !== installed.lockfileVersion || !canonical.packages || !installed.packages) fail('canonical/installed package-lock shape differs')
  const identityRows = []
  for (const [path, entry] of Object.entries(installed.packages)) {
    if (typeof path !== 'string' || isAbsolute(path) || path.includes('\\')
      || path.split('/').some((part) => !part || part === '.' || part === '..')) fail(`installed package-lock path is unsafe:${String(path)}`)
    const expected = canonical.packages[path]
    if (!expected || dependencyIdentity(expected) !== dependencyIdentity(entry)) fail(`installed dependency identity differs from package-lock:${path}`)
    if (!lstatExists(join(snapshotRoot, path))) fail(`installed package-lock entry is absent:${path}`)
    identityRows.push(`${path}\0${dependencyIdentity(entry)}`)
  }
  for (const [path, entry] of Object.entries(canonical.packages)) {
    if (!(path.startsWith('node_modules/') || path.includes('/node_modules/')) || entry.optional === true) continue
    if (!lstatExists(join(snapshotRoot, path))) fail(`required package-lock dependency is absent:${path}`)
  }
  return {
    dependencyLockfileSha256: createHash('sha256').update(canonicalBytes).digest('hex'),
    installedLockfileSha256: createHash('sha256').update(installedBytes).digest('hex'),
    installedDependencyIdentityDigest: createHash('sha256').update(`${identityRows.sort().join('\n')}\n`).digest('hex'),
    installedPackageCount: Object.keys(installed.packages).length,
    provenance: 'caller-node-modules-copy',
  }
}

export function fingerprintGeneratedEntries(snapshotRoot, manifest) {
  const root = realpathSync(resolve(snapshotRoot))
  const shape = manifestTreeShape(manifest)
  const rows = []
  fingerprintEntry(root, root, rows)
  return rows.filter((row) => {
    const path = row.split('\0', 1)[0]
    return !shape.leaves.has(path) && !shape.ancestors.has(path)
  }).sort()
}

export function disposableSnapshotEnvironment(snapshot, { baseEnvironment = process.env } = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    fail('snapshot environment requires one snapshot record')
  }
  if (!baseEnvironment || typeof baseEnvironment !== 'object' || Array.isArray(baseEnvironment)) {
    fail('snapshot base environment must be an object')
  }
  const playwrightRuntime = resolveProvisionedPlaywrightRuntime({
    repoRoot: snapshot.dependencyRoot,
    environment: baseEnvironment,
  })
  const environment = {}
  for (const name of ['CI', 'CONTINUOUS_INTEGRATION', 'GITHUB_ACTIONS', 'LANG', 'LC_ALL', 'NO_COLOR', 'TZ']) {
    const value = baseEnvironment[name]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.includes('\0')) fail(`snapshot environment value is invalid:${name}`)
    environment[name] = value
  }
  const toolProfile = materializeClosedHookToolProfile({
    repoRoot: realpathSync(snapshot.snapshotRoot),
  })
  toolProfile.verify()
  snapshotToolProfiles.set(snapshot, toolProfile)
  environment.LANG = 'C'
  environment.LC_ALL = 'C'
  environment.NO_COLOR = '1'
  environment.PATH = [join(snapshot.dependencyView, '.bin'), toolProfile.executablePath].join(delimiter)
  environment.INIT_CWD = snapshot.snapshotRoot
  environment.GIT_CEILING_DIRECTORIES = dirname(snapshot.snapshotRoot)
  environment.GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT = snapshot.snapshotRoot
  environment.GOVERNANCE_TOOL_PROFILE_SHA256 = toolProfile.profileSha256
  environment.TMPDIR = join(snapshot.runtimeRoot, 'tmp')
  environment.TMP = environment.TMPDIR
  environment.TEMP = environment.TMPDIR
  const isolatedHome = join(snapshot.runtimeRoot, 'home')
  const configHome = join(isolatedHome, '.config')
  const dataHome = join(isolatedHome, '.local', 'share')
  const stateHome = join(isolatedHome, '.local', 'state')
  for (const directory of [
    environment.TMPDIR,
    isolatedHome,
    configHome,
    dataHome,
    stateHome,
  ]) mkdirSync(directory, { recursive: true, mode: 0o700 })
  const gitConfig = join(isolatedHome, '.gitconfig')
  const npmConfig = join(isolatedHome, '.npmrc')
  writeFileSync(gitConfig, '', { mode: 0o600 })
  writeFileSync(npmConfig, '', { mode: 0o600 })
  environment.HOME = isolatedHome
  environment.USERPROFILE = isolatedHome
  environment.XDG_CONFIG_HOME = configHome
  environment.XDG_CACHE_HOME = join(snapshot.runtimeRoot, 'cache')
  environment.XDG_DATA_HOME = dataHome
  environment.XDG_STATE_HOME = stateHome
  // Storybook 8's find-cache-dir implementation honors CACHE_DIR (not
  // XDG_CACHE_HOME) before falling back to node_modules/.cache/storybook.
  // Keep manager/dev-server bundles outside the copied dependency view.
  environment.CACHE_DIR = environment.XDG_CACHE_HOME
  environment.STORYBOOK_DISABLE_TELEMETRY = '1'
  // The provisioned browser cache is an immutable caller-owned runtime input.
  // Playwright otherwise refreshes DEPENDENCIES_VALIDATED in that external
  // directory every 30 days. Browser launch itself still fails closed when
  // the executable or its host libraries cannot run.
  environment.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
  environment.NPM_CONFIG_USERCONFIG = npmConfig
  environment.npm_config_userconfig = npmConfig
  environment.npm_config_cache = join(snapshot.runtimeRoot, 'npm-cache')
  environment.NPM_CONFIG_CACHE = environment.npm_config_cache
  environment.COREPACK_HOME = join(snapshot.runtimeRoot, 'corepack-cache')
  environment.GIT_CONFIG_NOSYSTEM = '1'
  environment.GIT_CONFIG_GLOBAL = gitConfig
  environment.GIT_CONFIG_COUNT = '1'
  environment.GIT_CONFIG_KEY_0 = 'credential.helper'
  environment.GIT_CONFIG_VALUE_0 = ''
  environment.GIT_TERMINAL_PROMPT = '0'
  environment.GCM_INTERACTIVE = 'never'
  environment.SSH_ASKPASS_REQUIRE = 'never'
  if (playwrightRuntime) environment.PLAYWRIGHT_BROWSERS_PATH = playwrightRuntime.environmentValue
  return environment
}

export function verifyDisposableSnapshotToolProfile(snapshot) {
  const profile = snapshotToolProfiles.get(snapshot)
  if (!profile) fail('snapshot tool profile has not been materialized')
  profile.verify()
  return true
}

function safeManifestPath(snapshotRoot, path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || isAbsolute(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) fail(`manifest path is unsafe:${String(path)}`)
  const target = resolve(snapshotRoot, path)
  if (!contained(snapshotRoot, target, { allowRoot: false })) fail(`manifest path escapes snapshot:${path}`)
  return target
}

export function verifySnapshotAgainstManifest(snapshotRoot, manifest, {
  allowedGeneratedRoots = [],
  dependencyRoots = [],
} = {}) {
  const shape = manifestTreeShape(manifest)
  if (!Array.isArray(allowedGeneratedRoots) || new Set(allowedGeneratedRoots).size !== allowedGeneratedRoots.length) fail('allowed generated roots are invalid')
  for (const root of allowedGeneratedRoots) {
    if (typeof root !== 'string' || !root || root.includes('\\') || isAbsolute(root)
      || root.split('/').some((part) => !part || part === '.' || part === '..')) fail(`allowed generated root is unsafe:${String(root)}`)
    const prefixLeaf = [...shape.leaves.entries()].find(([path, row]) => row.kind === 'symlink' && (root === path || root.startsWith(`${path}/`)))
    if (prefixLeaf) fail(`allowed generated root traverses a manifest symlink:${root}`)
  }
  if (!Array.isArray(dependencyRoots) || new Set(dependencyRoots).size !== dependencyRoots.length) {
    fail('dependency roots are invalid')
  }
  for (const root of dependencyRoots) {
    if (typeof root !== 'string' || !root || root.includes('\\') || isAbsolute(root)
      || root.split('/').some((part) => !part || part === '.' || part === '..')) fail(`dependency root is unsafe:${String(root)}`)
    const manifestOverlap = [...shape.leaves.keys()].find((path) => path === root || path.startsWith(`${root}/`))
    if (manifestOverlap) fail(`dependency root overlaps the frozen manifest:${root}`)
    const prefixLeaf = [...shape.leaves.entries()].find(([path, row]) => ['file', 'symlink'].includes(row.kind) && root.startsWith(`${path}/`))
    if (prefixLeaf) fail(`dependency root traverses a manifest leaf:${root}`)
    if (allowedGeneratedRoots.some((generated) => generated === root || generated.startsWith(`${root}/`) || root.startsWith(`${generated}/`))) {
      fail(`dependency root overlaps an allowed generated root:${root}`)
    }
    const target = safeManifestPath(snapshotRoot, root)
    if (!lstatExists(target)) fail(`dependency root is absent:${root}`)
    const info = lstatSync(target)
    if (!info.isDirectory() || info.isSymbolicLink()) fail(`dependency root is not a real directory:${root}`)
  }
  const counts = { file: 0, symlink: 0, missing: 0 }
  const rows = []
  for (const row of manifest.inventory) {
    const target = safeManifestPath(snapshotRoot, row.path)
    if (row.kind === 'missing') {
      if (!strictManifestBlocker(shape, row.path) && lstatExists(target)) fail(`tracked-missing path materialized unexpectedly:${row.path}`)
      counts.missing += 1
      rows.push(`${row.path}\0missing\0${row.mode}\0${row.sha256}`)
      continue
    }
    if (!existsSync(target) && !lstatExists(target)) fail(`manifest path is absent from snapshot:${row.path}`)
    const info = lstatSync(target)
    const bytes = row.kind === 'symlink' ? Buffer.from(readlinkSync(target)) : readFileSync(target)
    if (row.kind === 'symlink' ? !info.isSymbolicLink() : !info.isFile() || info.isSymbolicLink()) fail(`manifest path kind differs in snapshot:${row.path}`)
    if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) fail(`manifest path bytes differ in snapshot:${row.path}`)
    if (process.platform !== 'win32' && row.kind === 'file') {
      const executable = (info.mode & 0o111) !== 0
      if ((row.mode === '100755') !== executable) fail(`manifest path executable mode differs in snapshot:${row.path}`)
    }
    counts[row.kind] += 1
    rows.push(`${row.path}\0${row.kind}\0${row.mode}\0${row.sha256}`)
  }
  {
    const inspect = (current) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (current === snapshotRoot && entry.name === '.git') continue
        const target = join(current, entry.name)
        const rel = relative(snapshotRoot, target).split(sep).join('/')
        const info = lstatSync(target)
        if (dependencyRoots.includes(rel)) {
          if (!info.isDirectory() || info.isSymbolicLink()) fail(`dependency root is not a real directory:${rel}`)
          continue
        }
        if (shape.leaves.has(rel)) continue
        if (shape.ancestors.has(rel) && info.isDirectory() && !info.isSymbolicLink()) inspect(target)
        else if (allowedGeneratedRoots.some((root) => rel === root || rel.startsWith(`${root}/`))) {
          if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) fail(`generated output contains a symlink or special entry:${rel}`)
          if (info.isDirectory()) inspect(target)
        } else if (info.isDirectory() && !info.isSymbolicLink() && allowedGeneratedRoots.some((root) => root.startsWith(`${rel}/`))) inspect(target)
        else fail(`snapshot contains a path outside the frozen manifest:${rel}`)
      }
    }
    inspect(snapshotRoot)
  }
  return {
    ...counts,
    inventoryEntries: manifest.inventory.length,
    verificationDigest: createHash('sha256').update(`${rows.join('\n')}\n`).digest('hex'),
  }
}

function lstatExists(path) {
  try { lstatSync(path); return true } catch (error) { if (error?.code === 'ENOENT') return false; throw error }
}

export function removeDisposableRepositorySnapshot(snapshot) {
  if (!snapshot?.parent) return
  rmSync(snapshot.parent, { recursive: true, force: true })
}

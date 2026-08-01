#!/usr/bin/env node
// Provider-neutral consumer hard gate. Read-only by construction: no install, repair, refresh,
// registry lookup, or generated-file write. Native Claude/Codex hooks are optional accelerators;
// this check binds all provider views to the same immutable release BOM and npm payload.

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
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve, join, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TextDecoder } from 'node:util'
import {
  assertClosedGitLocalConfiguration,
  materializeClosedHookToolProfile,
  runClosedGit,
} from './lib/closed-tool-execution.mjs'
// This checker is also shipped as the standalone `consumer/governance-check.mjs` corpus entry,
// where repository managed files have not necessarily been materialized yet. Keep the exact
// comparator dependency-free at this bootstrap boundary.
const compareUtf8Bytes = (left, right) => Buffer.compare(
  Buffer.from(String(left), 'utf8'),
  Buffer.from(String(right), 'utf8'),
)
const strictUtf8 = new TextDecoder('utf-8', { fatal: true })
const maxReplaySourceBytes = 16 * 1024 * 1024
const maxReplayChildOutputBytes = 1024 * 1024
const replayChildTimeoutMs = 30000
const replayChildMaxAttempts = 2

const args = process.argv.slice(2)
const valueOf = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const repo = resolve(valueOf('--repo') || process.cwd())
const asJson = args.includes('--json')
const canonicalOutputRoots = new Set()
const canonicalReplayExcludedRoots = new Set()
const canonicalReplayExcludedFiles = new Set()
const discoveryTraversalExcludedRoots = new Set()
const exactSemver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/
const stableVersionAtLeast = (value, minimum) => {
  const parse = version => typeof version === 'string'
    ? version.match(/^(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/)?.slice(1, 4).map(Number)
    : null
  const observed = parse(value)
  const required = parse(minimum)
  if (!observed || !required) return false
  for (let index = 0; index < 3; index += 1) {
    if (observed[index] !== required[index]) return observed[index] > required[index]
  }
  return true
}
const pathsOverlap = (left, right) => left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
const canonicalManagedRepositoryPath = (value) => (
  typeof value === 'string'
  && value.length > 0
  && value === value.normalize('NFC')
  && !value.includes('\\')
  && !value.includes('\0')
  && !isAbsolute(value)
  && value.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
  && value.split('/')[0] !== '.git'
)
const portablePathKey = (value) => String(value).split('/')
  .map((segment) => segment.normalize('NFC').toLocaleLowerCase('en-US').normalize('NFC'))
  .join('/')
const diagnostics = []
const evidence = {}
const add = (ruleId, severity, message, detail = undefined) => diagnostics.push({ ruleId, severity, message, ...(detail ? { evidence: detail } : {}) })
const sha256 = (content) => createHash('sha256').update(content).digest('hex')
const fileSha = (path) => sha256(readFileSync(path))
const sameStableFileIdentity = (left, right) => (
  left.dev === right.dev
  && left.ino === right.ino
  && left.mode === right.mode
  && left.nlink === right.nlink
  && left.size === right.size
  && left.mtimeNs === right.mtimeNs
  && left.ctimeNs === right.ctimeNs
)
const captureStableRegularFile = (path, maxBytes, label) => {
  let descriptor
  try {
    const beforePath = lstatSync(path, { bigint: true })
    if (
      !beforePath.isFile()
      || beforePath.isSymbolicLink()
      || beforePath.nlink !== 1n
      || beforePath.size > BigInt(maxBytes)
      || realpathSync(path) !== resolve(path)
    ) throw new Error(`${label} is not one bounded single-link regular file`)
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY
        | (fsConstants.O_CLOEXEC ?? 0)
        | (fsConstants.O_NOFOLLOW ?? 0),
    )
    const before = fstatSync(descriptor, { bigint: true })
    if (!sameStableFileIdentity(beforePath, before)) throw new Error(`${label} changed before open`)
    const bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor, { bigint: true })
    const afterPath = lstatSync(path, { bigint: true })
    if (
      !sameStableFileIdentity(before, after)
      || !sameStableFileIdentity(after, afterPath)
      || BigInt(bytes.length) !== before.size
    ) throw new Error(`${label} changed while captured`)
    return Object.freeze({ bytes, info: after, sha256: sha256(bytes) })
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}
const pathEntryExists = (path) => {
  try { lstatSync(path); return true }
  catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}
const permissionDenied = (error) => error?.code === 'EPERM' || error?.code === 'EACCES'
// Local provider sandboxes legitimately deny credential-class paths (for example ./.env.*) that
// the repository may track as inert templates (.env.example). A denied metadata/content read is
// evidence about the runtime, not about the repository: record it as a deterministic WARNING and
// a distinct inventory row so a degraded local attestation can never collide with the fully
// readable CI hard-gate attestation, instead of crashing the whole check.
const sandboxDeniedPaths = new Set()
const noteSandboxDenied = (path) => {
  const rel = relative(repo, resolve(path)).replaceAll('\\', '/')
  if (!sandboxDeniedPaths.has(rel)) {
    sandboxDeniedPaths.add(rel)
    add('GOV-SANDBOX-001', 'WARNING', `path is unreadable in this sandboxed runtime; full verification defers to the unsandboxed CI hard gate:${rel}`)
  }
  return rel
}
const lstatIfReadable = (path) => {
  try { return lstatSync(path) }
  catch (error) {
    if (!permissionDenied(error)) throw error
    noteSandboxDenied(path)
    return null
  }
}
const readdirIfReadable = (path, options) => {
  try { return readdirSync(path, options) }
  catch (error) {
    if (!permissionDenied(error)) throw error
    noteSandboxDenied(path)
    return null
  }
}
const unsafePathReports = new Set()
const repositoryRootSafe = pathEntryExists(repo) && !lstatSync(repo).isSymbolicLink() && lstatSync(repo).isDirectory()
if (pathEntryExists(join(repo, 'npm-shrinkwrap.json'))) {
  add(
    'GOV-LOCK-001',
    'BLOCKER',
    'root npm-shrinkwrap.json is forbidden; authenticated package-lock.json is the sole dependency lock authority',
  )
}
const repositoryPathIsSafe = (path) => {
  if (!repositoryRootSafe) return false
  const absolute = resolve(path)
  const rel = relative(repo, absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    if (!unsafePathReports.has(absolute)) add('GOV-SYMLINK-001', 'BLOCKER', `governance path escapes repository:${absolute}`)
    unsafePathReports.add(absolute)
    return false
  }
  let cursor = repo
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    if (!pathEntryExists(cursor)) return true
    if (lstatSync(cursor).isSymbolicLink()) {
      if (!unsafePathReports.has(cursor)) add('GOV-SYMLINK-001', 'BLOCKER', `governance path contains symlink component:${relative(repo, cursor)}`)
      unsafePathReports.add(cursor)
      return false
    }
  }
  return true
}
if (!repositoryRootSafe) {
  add('GOV-SYMLINK-001', 'BLOCKER', 'repository root must be a real non-symlink directory')
}
let closedToolProfile = null
if (repositoryRootSafe) {
  try {
    closedToolProfile = materializeClosedHookToolProfile({ repoRoot: repo })
    closedToolProfile.verify()
  } catch (error) {
    add('GOV-RUNTIME-001', 'BLOCKER', 'closed governance tool profile is unavailable', error.message)
  }
}
let closedRepositoryGitReady = false
if (repositoryRootSafe) {
  try {
    const topLevel = runClosedGit(['rev-parse', '--show-toplevel'], {
      cwd: repo,
      maxOutputBytes: 1024 * 1024,
      timeoutMs: 3000,
    })
    if (topLevel.status === 0 && typeof topLevel.stdout === 'string' && topLevel.stdout.trim()) {
      const observedTopLevel = realpathSync(resolve(topLevel.stdout.trim()))
      if (observedTopLevel !== repo) {
        add('GOV-INVENTORY-001', 'BLOCKER', 'consumer repository must be the exact closed Git top-level')
      } else {
        assertClosedGitLocalConfiguration(repo)
        closedRepositoryGitReady = true
      }
    }
  } catch (error) {
    add('GOV-INVENTORY-001', 'BLOCKER', 'consumer repository Git configuration is unsafe', error.message)
  }
}
let externalGovernanceRoot = null
const externalGovernancePathIsSafe = (path) => {
  if (!externalGovernanceRoot) return false
  const absolute = resolve(path)
  const rel = relative(externalGovernanceRoot, absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false
  let cursor = externalGovernanceRoot
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    if (!pathEntryExists(cursor)) return true
    if (lstatSync(cursor).isSymbolicLink()) return false
  }
  return true
}
const governancePathIsSafe = path => {
  const absolute = resolve(path)
  const rel = relative(repo, absolute)
  const contained = rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  return contained ? repositoryPathIsSafe(absolute) : externalGovernancePathIsSafe(absolute)
}
const isRegularFile = (path) => {
  if (!governancePathIsSafe(path) || !pathEntryExists(path)) return false
  const info = lstatSync(path)
  return info.isFile() && !info.isSymbolicLink() && info.nlink === 1
}
const readJson = (path, ruleId) => {
  if (!isRegularFile(path)) { add(ruleId, 'BLOCKER', `${relative(repo, path)} missing or not a regular non-symlink file`); return null }
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) { add(ruleId, 'BLOCKER', `${relative(repo, path)} invalid JSON`, error.message); return null }
}
const treeInventory = (root, { frozenCanonicalSnapshot = false } = {}) => {
  if (!existsSync(root)) return null
  const rows = []
  const visit = (absolute, rel = '') => {
    const stat = lstatSync(absolute)
    const observedMode = stat.mode & 0o777
    let projectedMode = observedMode
    if (frozenCanonicalSnapshot) {
      if (stat.isDirectory() && observedMode === 0o500) projectedMode = 0o755
      else if (stat.isFile() && observedMode === 0o400) projectedMode = 0o644
      else if (stat.isFile() && observedMode === 0o500) projectedMode = 0o755
      else projectedMode = -1
    }
    const mode = projectedMode < 0
      ? `invalid-frozen-${observedMode.toString(8).padStart(4, '0')}`
      : projectedMode.toString(8).padStart(4, '0')
    if (stat.isSymbolicLink()) { rows.push(`link:${rel}:${mode}:${readlinkSync(absolute)}`); return }
    if (stat.isDirectory()) {
      rows.push(`dir:${rel || '.'}:${mode}`)
      for (const name of readdirSync(absolute).sort()) visit(join(absolute, name), rel ? `${rel}/${name}` : name)
      return
    }
    if (stat.isFile()) rows.push(`file:${rel}:${mode}:links=${stat.nlink}:${fileSha(absolute)}`)
    else rows.push(`unsupported:${rel}:${mode}`)
  }
  visit(root)
  return rows
}
const assertTreeEqual = (ruleId, label, actual, canonical) => {
  if (!governancePathIsSafe(actual) || !governancePathIsSafe(canonical)) {
    add(ruleId, 'BLOCKER', `${label} contains an unsafe symlink path component`)
    return false
  }
  const isFrozenCanonicalPath = path => entrypointIsPrivateSnapshot
    && (path === forkRoot || path.startsWith(`${forkRoot}${sep}`))
  const actualRows = treeInventory(actual, {
    frozenCanonicalSnapshot: isFrozenCanonicalPath(actual),
  })
  const canonicalRows = treeInventory(canonical, {
    frozenCanonicalSnapshot: isFrozenCanonicalPath(canonical),
  })
  if (!actualRows || !canonicalRows || JSON.stringify(actualRows) !== JSON.stringify(canonicalRows)) {
    add(ruleId, 'BLOCKER', `${label} is not a recursive path/type/mode/hash match of the installed canonical projection`)
    return false
  }
  return true
}
const collectSourceFiles = (root) => {
  const files = []
  if (!repositoryRootSafe) return files
  // Provider/generated control surfaces contain rule examples and are hash-verified separately.
  // Everything else in the consumer repository is part of the exhaustive hooks-off replay.
  const ignoredFiles = new Set(['scripts/governance-check.mjs'])
  const visit = (dir) => {
    if (!pathEntryExists(dir)) return
    const entries = readdirIfReadable(dir, { withFileTypes: true })
    if (!entries) return
    for (const entry of entries) {
      const absolute = join(dir, entry.name)
      const rel = relative(root, absolute).replaceAll('\\', '/')
      const info = lstatIfReadable(absolute)
      if (!info) {
        // A denied replay-class source would silently skip hook replay: that stays fail-closed.
        if (/\.(?:[cm]?[jt]sx?|css|mdx?|html|json|sh|py)$/.test(entry.name)) {
          add('GOV-CONTENT-002', 'BLOCKER', `replay-class source is unreadable in this runtime and cannot be attested:${rel}`)
        }
        continue
      }
      if (info.isSymbolicLink()) {
        add('GOV-SYMLINK-001', 'BLOCKER', `repository symlink is outside the exhaustive replay contract: ${rel}`)
        continue
      }
      if (info.isDirectory() && canonicalReplayExcludedRoots.has(resolve(absolute))) continue
      if (info.isDirectory()) visit(absolute)
      else if (
        info.isFile()
        && !canonicalReplayExcludedFiles.has(resolve(absolute))
        && /\.(?:[cm]?[jt]sx?|css|mdx?|html|json|sh|py)$/.test(entry.name)
        && !ignoredFiles.has(rel)
      ) {
        if (info.nlink !== 1) add('GOV-ALIAS-001', 'BLOCKER', `repository source file has a hard-link alias:${rel}`)
        else files.push(absolute)
      } else if (!info.isFile()) add('GOV-SPECIAL-001', 'BLOCKER', `repository contains an unsupported filesystem entry:${rel}`)
    }
  }
  visit(root)
  return files.sort()
}
const repositoryInventory = (root) => {
  const rows = []
  if (!repositoryRootSafe) return { basis: 'unsafe-repository-root', rows }
  const tracked = closedRepositoryGitReady
    ? runClosedGit(['ls-files', '-z', '--cached'], {
        cwd: resolve(root),
        maxOutputBytes: 32 * 1024 * 1024,
        output: 'buffer',
        timeoutMs: 5000,
      })
    : null
  if (tracked?.status === 0) {
    for (const rel of tracked.stdout.toString('utf8').split('\0').filter(Boolean).sort()) {
      const absolute = join(root, rel)
      let info
      try { info = lstatSync(absolute) }
      catch (error) {
        if (error?.code === 'ENOENT') {
          add('GOV-INVENTORY-001', 'BLOCKER', `tracked repository path missing:${rel}`)
        } else if (permissionDenied(error)) {
          // Tracked but sandbox-denied (for example .env.example under the canonical ./.env.*
          // credential deny): present per the Git index, so this is never GOV-INVENTORY-001.
          noteSandboxDenied(absolute)
          rows.push(`${rel}:sandbox-unreadable`)
        } else throw error
        continue
      }
      if (info.isSymbolicLink()) {
        add('GOV-SYMLINK-001', 'BLOCKER', `tracked symlink cannot be governance-attested:${rel}`)
        rows.push(`${rel}:symlink:${readlinkSync(absolute)}`)
        continue
      }
      if (!info.isFile()) {
        add('GOV-SPECIAL-001', 'BLOCKER', `tracked repository path is not a regular file:${rel}`)
        continue
      }
      if (info.nlink !== 1) {
        add('GOV-ALIAS-001', 'BLOCKER', `tracked repository file has a hard-link alias:${rel}`)
        continue
      }
      try {
        rows.push(`${rel}:${(info.mode & 0o777).toString(8).padStart(4, '0')}:${fileSha(absolute)}`)
      } catch (error) {
        if (!permissionDenied(error)) throw error
        noteSandboxDenied(absolute)
        rows.push(`${rel}:sandbox-unreadable`)
      }
    }
    return { basis: 'git-index', rows }
  }
  const visit = (dir) => {
    const entries = readdirIfReadable(dir, { withFileTypes: true })
    if (!entries) return
    for (const entry of entries) {
      const absolute = join(dir, entry.name)
      const rel = relative(root, absolute).replaceAll('\\', '/')
      const info = lstatIfReadable(absolute)
      if (!info) {
        rows.push(`${rel}:sandbox-unreadable`)
        continue
      }
      if (info.isSymbolicLink()) {
        add('GOV-SYMLINK-001', 'BLOCKER', `filesystem symlink cannot be governance-attested:${rel}`)
        rows.push(`${rel}:symlink:${readlinkSync(absolute)}`)
        continue
      }
      if (info.isDirectory() && canonicalOutputRoots.has(resolve(absolute))) continue
      if (info.isDirectory()) visit(absolute)
      else if (info.isFile()) {
        if (info.nlink !== 1) {
          add('GOV-ALIAS-001', 'BLOCKER', `filesystem repository file has a hard-link alias:${rel}`)
          continue
        }
        try {
          rows.push(`${rel}:${(info.mode & 0o777).toString(8).padStart(4, '0')}:${fileSha(absolute)}`)
        } catch (error) {
          if (!permissionDenied(error)) throw error
          noteSandboxDenied(absolute)
          rows.push(`${rel}:sandbox-unreadable`)
        }
      } else add('GOV-SPECIAL-001', 'BLOCKER', `filesystem repository contains an unsupported entry:${rel}`)
    }
  }
  visit(root)
  rows.sort()
  return { basis: 'filesystem-clean-room', rows }
}
const commandAvailable = (command) => Boolean(closedToolProfile?.executables?.[command])

const pkgPath = join(repo, 'package.json')
const lockPath = join(repo, 'package-lock.json')
const bomPath = join(repo, 'governance/lock.json')
const pkg = readJson(pkgPath, 'GOV-PACKAGE-001')
const packageLock = readJson(lockPath, 'GOV-PACKAGE-LOCK-001')
const bom = readJson(bomPath, 'GOV-BOM-001')
const bomManagedFileNames = Object.keys(bom?.payload?.managedFiles || {}).sort()
const bomManagedPortableKeys = bomManagedFileNames.map(portablePathKey)
if (
  bomManagedFileNames.some((path) => !canonicalManagedRepositoryPath(path))
  || new Set(bomManagedPortableKeys).size !== bomManagedPortableKeys.length
) {
  add(
    'GOV-MANAGED-FILE-002',
    'BLOCKER',
    'immutable BOM managed-file paths must be canonical NFC repository paths and portable-case unique',
  )
}

// Scan exclusions are absolute, machine-derived canonical roots rather than basename matches.
// Otherwise source-controlled paths such as apps/template/src/build/evil.ts or a nested
// node_modules/.codex/config.toml could evade both replay and discovery merely by choosing a
// generated-looking directory name. The only workspace output roots trusted here are direct
// children of the protected apps/* workspaces used by the base-owned consumer source harness.
const canonicalWorkspacePatterns = ['apps/*']
if (JSON.stringify(pkg?.workspaces) !== JSON.stringify(canonicalWorkspacePatterns)) {
  add('GOV-CONTENT-001', 'BLOCKER', `consumer workspaces must equal the protected roots:${canonicalWorkspacePatterns.join(',')}`)
}
const canonicalScanRoots = [repo]
const appsRoot = join(repo, 'apps')
if (!repositoryPathIsSafe(appsRoot) || !pathEntryExists(appsRoot) || !lstatSync(appsRoot).isDirectory()) {
  add('GOV-CONTENT-001', 'BLOCKER', 'canonical apps/* workspace parent is missing or unsafe')
} else {
  for (const name of readdirSync(appsRoot).sort()) {
    const workspace = join(appsRoot, name)
    const info = lstatSync(workspace)
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) {
      add('GOV-CONTENT-001', 'BLOCKER', `canonical workspace parent contains an unsafe entry:apps/${name}`)
      continue
    }
    if (info.isFile()) continue
    if (!isRegularFile(join(workspace, 'package.json'))) {
      add('GOV-CONTENT-001', 'BLOCKER', `canonical workspace directory has no regular package.json:apps/${name}`)
      continue
    }
    canonicalScanRoots.push(workspace)
  }
}
const generatedOutputNames = ['node_modules', 'dist', 'build', 'coverage', 'storybook-static', '.next', '.turbo', '.cache', '.vite']
canonicalOutputRoots.add(resolve(repo, '.git'))
discoveryTraversalExcludedRoots.add(resolve(repo, '.git'))
for (const scanRoot of canonicalScanRoots) {
  for (const name of generatedOutputNames) {
    const output = resolve(scanRoot, name)
    canonicalOutputRoots.add(output)
    if (name === 'node_modules') discoveryTraversalExcludedRoots.add(output)
  }
}
for (const path of canonicalOutputRoots) canonicalReplayExcludedRoots.add(path)
// Provider control surfaces are excluded only after their signed manifest records have been
// closed-shape validated below.  Keeping a fixed provider-name list here would silently scan a
// future adapter as product source (or silently trust an unregistered adapter root).
canonicalReplayExcludedFiles.add(resolve(repo, 'governance/lock.json'))
canonicalReplayExcludedFiles.add(resolve(repo, 'governance/lock.schema.json'))

if (bom) {
  if (bom.schemaVersion !== 1 || bom.role !== 'template-consumer' || bom.generatedBy !== 'scripts/build-fork-governance.mjs') {
    add('GOV-BOM-002', 'BLOCKER', 'governance lock identity/schema is not canonical')
  }
  evidence.bomSha256 = fileSha(bomPath)
}

const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
for (const [name, lockKey] of [['@qijenchen/design-system', 'designSystem'], ['@qijenchen/storybook-config', 'storybookConfig']]) {
  const declared = deps[name]
  const expected = bom?.release?.[lockKey]
  if (!exactSemver.test(declared || '')) add('GOV-VERSION-001', 'BLOCKER', `${name} must be exact semver; got ${declared || 'missing'}`)
  if (expected && declared !== expected) add('GOV-VERSION-002', 'BLOCKER', `${name} declaration ${declared} != governance lock ${expected}`)
  const lockEntry = packageLock?.packages?.[`node_modules/${name}`]
  const locked = lockEntry?.version
  if (declared && locked !== declared) add('GOV-PACKAGE-LOCK-002', 'BLOCKER', `${name} package-lock version ${locked || 'missing'} != ${declared}`)
  const unscoped = name.split('/').at(-1)
  const canonicalTarball = declared ? `https://registry.npmjs.org/${name}/-/${unscoped}-${declared}.tgz` : null
  if (declared && lockEntry?.resolved !== canonicalTarball) add('GOV-SUPPLY-001', 'BLOCKER', `${name} resolved URL is not the canonical exact npm registry tarball`)
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(lockEntry?.integrity || '')) add('GOV-SUPPLY-001', 'BLOCKER', `${name} package-lock entry lacks npm sha512 integrity`)
}

for (const [name, command] of Object.entries(bom?.payload?.requiredScripts || {})) {
  if (pkg?.scripts?.[name] !== command) add('GOV-SCRIPT-001', 'BLOCKER', `required package script ${name} drifted from immutable governance BOM`)
}
for (const [file, digest] of Object.entries(bom?.payload?.managedFiles || {})) {
  const absolute = join(repo, file)
  if (!isRegularFile(absolute) || fileSha(absolute) !== digest) add('GOV-MANAGED-FILE-001', 'BLOCKER', `${file} drifted from immutable governance BOM or is not a regular file`)
}

const dsRoot = join(repo, 'node_modules/@qijenchen/design-system')
const sbRoot = join(repo, 'node_modules/@qijenchen/storybook-config')
const utilityRegistryPath = join(dsRoot, 'src/tokens/utility-registry.json')
const dsPkg = readJson(join(dsRoot, 'package.json'), 'GOV-DEPS-001')
const sbPkg = readJson(join(sbRoot, 'package.json'), 'GOV-DEPS-001')
if (dsPkg?.version !== deps['@qijenchen/design-system']) add('GOV-DEPS-002', 'BLOCKER', `installed design-system ${dsPkg?.version || 'missing'} != declaration ${deps['@qijenchen/design-system'] || 'missing'}`)
if (sbPkg?.version !== deps['@qijenchen/storybook-config']) add('GOV-DEPS-002', 'BLOCKER', `installed storybook-config ${sbPkg?.version || 'missing'} != declaration ${deps['@qijenchen/storybook-config'] || 'missing'}`)

const installedForkRoot = join(dsRoot, 'ds-canonical/fork')
const entrypoint = realpathSync(fileURLToPath(import.meta.url))
const entrypointForkRoot = resolve(dirname(entrypoint), '..')
const entrypointForkRelative = relative(repo, entrypointForkRoot)
const entrypointIsPrivateSnapshot = (
  entrypoint === join(entrypointForkRoot, 'consumer/governance-check.mjs')
  && entrypointForkRelative !== ''
  && (entrypointForkRelative === '..' || entrypointForkRelative.startsWith(`..${sep}`))
  && pathEntryExists(entrypointForkRoot)
  && lstatSync(entrypointForkRoot).isDirectory()
  && !lstatSync(entrypointForkRoot).isSymbolicLink()
  && realpathSync(entrypointForkRoot) === entrypointForkRoot
)
const forkRoot = entrypointIsPrivateSnapshot ? entrypointForkRoot : installedForkRoot
if (entrypointIsPrivateSnapshot) externalGovernanceRoot = forkRoot
const corpusLockPath = join(forkRoot, 'governance.lock')
const corpusLock = readJson(corpusLockPath, 'GOV-CORPUS-001')
const manifest = readJson(join(forkRoot, 'manifest.json'), 'GOV-CORPUS-001')
const closedKeys = (value, keys) => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
)
// Structural/tamper mirror only. Canonical selection and certification semantics remain owned by
// packages/governance/src/provider-review-binding.mjs. This standalone shipped checker cannot
// import a repository-relative module before its corpus lock has been authenticated.
const stableProjectionValue = (value) => {
  if (Array.isArray(value)) return value.map(stableProjectionValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort(compareUtf8Bytes).map((key) => [key, stableProjectionValue(value[key])]),
    )
  }
  return value
}
const validReviewInvocation = (value) => (
  (closedKeys(value, ['strategy']) && value.strategy === 'main-context')
  || (
    closedKeys(value, ['agent', 'context', 'strategy'])
    && value.strategy === 'native-context-fork'
    && value.context === 'fork'
    && /^[a-z][a-z0-9-]*$/.test(value.agent || '')
  )
)
const validIndependentReviewProjection = (value) => {
  if (
    !closedKeys(value, [
      'schemaVersion', 'kind', 'skill', 'repositoryRole', 'certificationContract',
      'bindings', 'providerCompatibility', 'certifications', 'projectionDigest',
    ])
    || value.schemaVersion !== 2
    || value.kind !== 'provider-neutral-independent-review-projection'
    || value.skill !== 'independent-review'
    || value.repositoryRole !== 'product-consumer'
    || value.certificationContract !== 'exact-provider-runtime-surface-role-target-v1'
    || !Array.isArray(value.bindings)
    || value.bindings.length === 0
    || !Array.isArray(value.providerCompatibility)
    || value.providerCompatibility.length === 0
    || !Array.isArray(value.certifications)
    || !/^[a-f0-9]{64}$/.test(value.projectionDigest || '')
  ) return false
  const bindingIds = []
  for (const binding of value.bindings) {
    if (
      !closedKeys(binding, [
        'selfProviderId', 'selectionPolicy', 'reviewClass', 'requiredAssuranceTier',
        'requiredReasoningTier', 'requiredComputeTier', 'transport', 'invocation',
        'certificationContract', 'bindingDigest',
      ])
      || !/^[a-z][a-z0-9-]*$/.test(binding.selfProviderId || '')
      || !/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(binding.selectionPolicy || '')
      || binding.reviewClass !== 'tier-0-governance'
      || binding.requiredAssuranceTier !== 'maximum'
      || binding.requiredReasoningTier !== 'maximum'
      || binding.requiredComputeTier !== 'maximum'
      || binding.transport !== 'content-addressed-model-broker-exchange-v1'
      || !validReviewInvocation(binding.invocation)
      || binding.certificationContract !== 'exact-provider-runtime-surface-role-target-v1'
      || !/^[a-f0-9]{64}$/.test(binding.bindingDigest || '')
    ) return false
    bindingIds.push(binding.selfProviderId)
  }
  const compatibilityProviderIds = []
  const compatibilityRuntimeIds = []
  for (const compatibility of value.providerCompatibility) {
    if (
      !closedKeys(compatibility, ['compatibilityProviderId', 'providerId'])
      || !/^[a-z][a-z0-9-]*$/.test(compatibility.providerId || '')
      || !/^[a-z][a-z0-9-]*$/.test(compatibility.compatibilityProviderId || '')
    ) return false
    compatibilityProviderIds.push(compatibility.providerId)
    compatibilityRuntimeIds.push(compatibility.compatibilityProviderId)
  }
  if (
    JSON.stringify(bindingIds) !== JSON.stringify([...new Set(bindingIds)].sort(compareUtf8Bytes))
    || JSON.stringify(compatibilityProviderIds) !== JSON.stringify([...new Set(compatibilityProviderIds)].sort(compareUtf8Bytes))
    || new Set(compatibilityRuntimeIds).size !== compatibilityRuntimeIds.length
    || bindingIds.some((providerId) => !compatibilityProviderIds.includes(providerId))
  ) return false
  const expectedDigest = sha256(JSON.stringify(stableProjectionValue({
    skill: value.skill,
    repositoryRole: value.repositoryRole,
    bindings: value.bindings,
    providerCompatibility: value.providerCompatibility,
    certifications: value.certifications,
  })))
  return value.projectionDigest === expectedDigest
}
const expectedManifestKeys = [
  '_generated', 'schemaVersion', 'kind', 'providerRegistrySchemaVersion', 'materializers', 'discoveryPolicy',
  'providerLifecycle', 'providerAdapters', 'authorityDecision', 'independentReview', 'launchers', 'hooks', 'ciReplay', 'skills', 'commands',
  'agents', 'providerSurfaces', 'codex', 'consumer',
]
if (
  !closedKeys(manifest, expectedManifestKeys)
  || manifest?.schemaVersion !== 2
  || manifest?.kind !== 'provider-neutral-fork-manifest'
  || manifest?.providerRegistrySchemaVersion !== 9
) add('GOV-CORPUS-001', 'BLOCKER', 'installed fork manifest is open-shaped, unknown-versioned, or has the wrong identity')
const authorityDecision = manifest?.authorityDecision
const authorityDecisionArtifactPaths = [
  authorityDecision?.classifierSource,
  authorityDecision?.receiptContractSource,
  authorityDecision?.runner,
]
if (
  !closedKeys(authorityDecision, [
    'schemaVersion', 'policySource', 'classifierSource', 'receiptContractSource', 'runner',
    'prepareArgv', 'verifyArgv', 'certificationClaim',
  ])
  || authorityDecision.schemaVersion !== 1
  || authorityDecision.policySource !== 'AGENTS.md#canonical-decision-authority'
  || authorityDecision.classifierSource !== 'launchers/approval-evidence.mjs'
  || authorityDecision.receiptContractSource !== 'launchers/authority-decision-evidence.mjs'
  || authorityDecision.runner !== 'launchers/product-hook-dispatch-runtime.mjs'
  || JSON.stringify(authorityDecision.prepareArgv) !== JSON.stringify(['--authority-decision', 'prepare'])
  || JSON.stringify(authorityDecision.verifyArgv) !== JSON.stringify(['--authority-decision', 'verify'])
  || authorityDecision.certificationClaim !== 'structural-only-not-runtime-certified'
) add('GOV-CORPUS-001', 'BLOCKER', 'installed authority-decision projection is open-shaped, incomplete, tampered, or has the wrong identity')
const independentReview = manifest?.independentReview
if (!validIndependentReviewProjection(independentReview)) {
  add('GOV-CORPUS-001', 'BLOCKER', 'installed independent-review projection is open-shaped, incomplete, tampered, or has the wrong identity')
}
const expectedConsumerKeys = [
  'claudeMd', 'commonInstruction', 'compatibilityCategories', 'executionRuntime', 'governanceCheck', 'governanceLock',
  'governanceLockSchema', 'launcherDestination', 'managedFiles', 'materialization',
]
if (!closedKeys(manifest?.consumer, expectedConsumerKeys)) {
  add('GOV-CORPUS-001', 'BLOCKER', 'installed fork manifest consumer record is open-shaped or incomplete')
}
if (manifest?.consumer?.claudeMd !== null && typeof manifest?.consumer?.claudeMd !== 'string') {
  add('GOV-CORPUS-001', 'BLOCKER', 'legacy Claude instruction compatibility alias must be a path or null')
}
const commonInstruction = manifest?.consumer?.commonInstruction
if (
  !closedKeys(commonInstruction, ['artifact', 'destination', 'materializerId', 'schemaVersion'])
  || commonInstruction.schemaVersion !== 1
  || commonInstruction.artifact !== 'common/instruction.md'
  || typeof commonInstruction.destination !== 'string'
  || !commonInstruction.destination
  || typeof commonInstruction.materializerId !== 'string'
  || !commonInstruction.materializerId
) add('GOV-ADAPTER-003', 'BLOCKER', 'installed common instruction record is not the closed consumer authority')
if (manifest?.codex !== null && (
  !closedKeys(manifest?.codex, [
    'agentsMd', 'agentsSkills', 'compatibilityOnly', 'hookArtifact', 'hookDestination', 'hooksJson',
    'instructionDestination', 'skillArtifactRoot', 'skillDestination',
  ])
  || manifest.codex.compatibilityOnly !== true
  || typeof manifest.codex.agentsMd !== 'string'
  || typeof manifest.codex.instructionDestination !== 'string'
  || !Array.isArray(manifest.codex.agentsSkills)
  || !Array.isArray(manifest.codex.hooksJson)
  || (manifest.codex.hookArtifact !== null && typeof manifest.codex.hookArtifact !== 'string')
  || (manifest.codex.hookDestination !== null && typeof manifest.codex.hookDestination !== 'string')
  || typeof manifest.codex.skillArtifactRoot !== 'string'
  || typeof manifest.codex.skillDestination !== 'string'
)) {
  add('GOV-CORPUS-001', 'BLOCKER', 'legacy Codex compatibility record must be a closed active-surface projection or null')
}
const providerMaterializers = manifest?.materializers
const materializerGroups = ['instructionViews', 'hookBaseTemplateContracts', 'hookViews', 'skillViews', 'treeViews']
let providerMaterializersValid = closedKeys(providerMaterializers, materializerGroups)
  && materializerGroups.every((group) => Object.keys(providerMaterializers?.[group] || {}).length > 0)
if (providerMaterializersValid) {
  for (const [id, materializer] of Object.entries(providerMaterializers.instructionViews)) {
    const expectedOwnership = materializer?.engine === 'shared-instruction-v1'
      ? 'common-authority-consumer'
      : materializer?.engine === 'markdown-relative-at-import-v1'
        ? 'provider-generated-projection'
        : null
    if (
      !/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(id)
      || !closedKeys(materializer, ['engine', 'ownershipPolicy', 'supplementPolicy'])
      || !expectedOwnership
      || materializer.ownershipPolicy !== expectedOwnership
      || !['forbidden', 'optional', 'required'].includes(materializer.supplementPolicy)
      || (materializer.engine === 'shared-instruction-v1' && materializer.supplementPolicy !== 'forbidden')
    ) providerMaterializersValid = false
  }
  for (const [id, contract] of Object.entries(providerMaterializers.hookBaseTemplateContracts)) {
    const valid = contract?.engine === 'claude-permission-policy-v1'
      ? closedKeys(contract, ['engine', 'schema', 'source']) && typeof contract.source === 'string' && typeof contract.schema === 'string'
      : contract?.engine === 'static-json-object-v1' && closedKeys(contract, ['engine'])
    if (!/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(id) || !valid) providerMaterializersValid = false
  }
  for (const [id, materializer] of Object.entries(providerMaterializers.hookViews)) {
    const idValid = /^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(id)
    const shapeValid = materializer?.engine === 'json-hook-map-v1'
      ? closedKeys(materializer, ['baseTemplateContract', 'descriptionField', 'engine', 'hooksField', 'mergeStrategy'])
        && typeof materializer.hooksField === 'string' && materializer.hooksField.length > 0
      : materializer?.engine === 'json-hook-event-list-v1'
        ? closedKeys(materializer, ['baseTemplateContract', 'descriptionField', 'engine', 'eventField', 'eventsField', 'groupsField', 'handlerArgvField', 'handlersField', 'matcherField', 'mergeStrategy'])
          && ['eventField', 'eventsField', 'groupsField', 'handlerArgvField', 'handlersField', 'matcherField'].every((field) => typeof materializer[field] === 'string' && materializer[field].length > 0)
        : false
    const descriptionValid = materializer?.engine === 'json-hook-event-list-v1'
      ? typeof materializer.descriptionField === 'string' && materializer.descriptionField.length > 0
      : materializer?.descriptionField === null || (typeof materializer?.descriptionField === 'string' && materializer.descriptionField.length > 0)
    const commonValid = descriptionValid
      && ['merge-hook-map-into-base-v1', 'replace-document-v1'].includes(materializer?.mergeStrategy)
      && (materializer.mergeStrategy === 'merge-hook-map-into-base-v1'
        ? typeof materializer.baseTemplateContract === 'string' && Boolean(providerMaterializers.hookBaseTemplateContracts[materializer.baseTemplateContract])
        : materializer.baseTemplateContract === null)
    if (!idValid || !shapeValid || !commonValid) providerMaterializersValid = false
  }
  for (const [id, materializer] of Object.entries(providerMaterializers.skillViews)) {
    if (
      !/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(id)
      || !closedKeys(materializer, ['engine', 'entryFile'])
      || materializer.engine !== 'skill-directory-v1'
      || typeof materializer.entryFile !== 'string'
      || !/^[A-Za-z0-9._-]+\.md$/.test(materializer.entryFile)
    ) providerMaterializersValid = false
  }
  for (const [id, materializer] of Object.entries(providerMaterializers.treeViews)) {
    if (
      !/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(id)
      || !closedKeys(materializer, ['engine', 'transformPolicies'])
      || materializer.engine !== 'closed-tree-copy-v1'
      || JSON.stringify(materializer.transformPolicies) !== JSON.stringify(['byte-exact'])
    ) providerMaterializersValid = false
  }
}
const commonAuthorityMaterializerIds = Object.entries(providerMaterializers?.instructionViews || {})
  .filter(([, materializer]) => (
    materializer?.engine === 'shared-instruction-v1'
    && materializer?.ownershipPolicy === 'common-authority-consumer'
  ))
  .map(([id]) => id)
if (commonAuthorityMaterializerIds.length !== 1) providerMaterializersValid = false
if (!providerMaterializersValid) add('GOV-PROVIDER-001', 'BLOCKER', 'installed provider materializer catalog is missing, open-shaped, or uses an unsupported engine')
const resolveSurfaceMaterializer = (group, id, label) => {
  const materializer = typeof id === 'string' ? providerMaterializers?.[group]?.[id] : null
  if (!materializer) add('GOV-PROVIDER-002', 'BLOCKER', `${label} references an unknown ${group} materializer:${id || '<missing>'}`)
  return materializer || null
}
const discoveryPolicy = manifest?.discoveryPolicy
const discoveryPolicyKeys = [
  'schemaVersion', 'providerRootNames', 'instructionNames', 'instructionOverrideNames', 'configPaths', 'pluginRootNames',
].sort()
const discoveryArrayKeys = discoveryPolicyKeys.filter((key) => key !== 'schemaVersion')
const discoveryPolicyShapeValid = Boolean(
  discoveryPolicy
  && typeof discoveryPolicy === 'object'
  && !Array.isArray(discoveryPolicy)
  && discoveryPolicy.schemaVersion === 1
  && JSON.stringify(Object.keys(discoveryPolicy).sort()) === JSON.stringify(discoveryPolicyKeys)
)
if (!discoveryPolicyShapeValid) {
  add('GOV-PROVIDER-001', 'BLOCKER', 'installed manifest discoveryPolicy is missing, unknown-versioned, or open-shaped')
}
const discoveryInventory = Object.fromEntries(discoveryArrayKeys.map((key) => {
  const values = discoveryPolicyShapeValid && Array.isArray(discoveryPolicy[key]) ? discoveryPolicy[key] : []
  const expected = [...new Set(values.filter((value) => typeof value === 'string'))].sort()
  if (!values.length || JSON.stringify(values) !== JSON.stringify(expected)) {
    add('GOV-PROVIDER-001', 'BLOCKER', `installed discoveryPolicy.${key} must be a nonempty sorted unique string array`)
  }
  return [key, expected]
}))
const discoveryRootPattern = /^\.(?!git(?:hub)?$)[A-Za-z0-9][A-Za-z0-9_-]*$/
const discoveryInstructionPattern = /^[A-Za-z0-9][A-Za-z0-9_.@-]*\.md$/
const discoveryConfigPattern = /^\.(?:[A-Za-z0-9][A-Za-z0-9_.@-]*|[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9_.@/-]+)$/
for (const root of [...discoveryInventory.providerRootNames, ...discoveryInventory.pluginRootNames]) {
  if (!discoveryRootPattern.test(root)) add('GOV-PROVIDER-001', 'BLOCKER', `installed discovery policy has an unsafe provider/plugin root:${root}`)
}
for (const name of [...discoveryInventory.instructionNames, ...discoveryInventory.instructionOverrideNames]) {
  if (!discoveryInstructionPattern.test(name)) add('GOV-PROVIDER-001', 'BLOCKER', `installed discovery policy has an unsafe instruction name:${name}`)
}
for (const path of discoveryInventory.configPaths) {
  if (!discoveryConfigPattern.test(path) || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    add('GOV-PROVIDER-001', 'BLOCKER', `installed discovery policy has an unsafe config path:${path}`)
  }
}
if (discoveryPolicyShapeValid && bom?.payload?.discoveryPolicySha256 !== sha256(JSON.stringify(discoveryPolicy))) {
  add('GOV-BOM-004', 'BLOCKER', 'installed discovery policy digest differs from the immutable governance BOM')
}
const providerLifecycle = manifest?.providerLifecycle
const lifecycleSha256 = /^[a-f0-9]{64}$/
const lifecycleProviderId = /^[a-z][a-z0-9-]*$/
const lifecyclePathKey = (value) => String(value).split('/')
  .map((segment) => segment.normalize('NFC').toLocaleLowerCase('en-US').normalize('NFC'))
  .join('/')
const lifecyclePathsOverlap = (left, right) => {
  const leftKey = lifecyclePathKey(left)
  const rightKey = lifecyclePathKey(right)
  return leftKey === rightKey || leftKey.startsWith(`${rightKey}/`) || rightKey.startsWith(`${leftKey}/`)
}
const lifecyclePathValid = (value) => (
  typeof value === 'string'
  && value.length > 0
  && !value.includes('\\')
  && !value.includes('\0')
  && !isAbsolute(value)
  && value.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
  && !['.git', '.github'].includes(lifecyclePathKey(value.split('/')[0]))
)
const lifecycleSemverParts = (value) => {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  return match ? { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') ?? null } : null
}
const compareLifecycleSemver = (leftValue, rightValue) => {
  const left = lifecycleSemverParts(leftValue)
  const right = lifecycleSemverParts(rightValue)
  if (!left || !right) return null
  for (let index = 0; index < 3; index += 1) if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  if (left.pre === null || right.pre === null) return left.pre === right.pre ? 0 : left.pre === null ? 1 : -1
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    if (left.pre[index] === undefined || right.pre[index] === undefined) return left.pre[index] === undefined ? -1 : 1
    if (left.pre[index] === right.pre[index]) continue
    const leftNumeric = /^\d+$/.test(left.pre[index])
    const rightNumeric = /^\d+$/.test(right.pre[index])
    if (leftNumeric && rightNumeric) return Number(left.pre[index]) - Number(right.pre[index])
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return compareUtf8Bytes(left.pre[index], right.pre[index])
  }
  return 0
}
const lifecycleProblem = (message) => add('GOV-LIFECYCLE-001', 'BLOCKER', message)
const lifecycleDiscoveryReservesPath = (discovery, value) => {
  const key = lifecyclePathKey(value)
  const roots = [...(discovery?.providerRootNames || []), ...(discovery?.pluginRootNames || [])]
    .map(lifecyclePathKey)
  if (roots.some((root) => key === root || key.startsWith(`${root}/`))) return true
  return [
    ...(discovery?.instructionNames || []),
    ...(discovery?.instructionOverrideNames || []),
    ...(discovery?.configPaths || []),
  ].some((entry) => lifecyclePathKey(entry) === key)
}
const validateLifecycleDiscovery = (value, label) => {
  let valid = closedKeys(value, discoveryArrayKeys)
  if (!valid) {
    lifecycleProblem(`${label} discovery is open-shaped`)
    return false
  }
  for (const key of discoveryArrayKeys) {
    const entries = value[key]
    const pattern = key === 'configPaths'
      ? discoveryConfigPattern
      : ['instructionNames', 'instructionOverrideNames'].includes(key)
        ? discoveryInstructionPattern
        : discoveryRootPattern
    const canonical = Array.isArray(entries)
      ? [...new Set(entries.filter((entry) => typeof entry === 'string'))].sort()
      : []
    const portableEntries = Array.isArray(entries) ? entries.map(lifecyclePathKey) : []
    if (
      !Array.isArray(entries)
      || JSON.stringify(entries) !== JSON.stringify(canonical)
      || portableEntries.length !== new Set(portableEntries).size
      || entries.some((entry) => !pattern.test(entry))
    ) {
      lifecycleProblem(`${label} discovery ${key} must be a safe sorted unique string array`)
      valid = false
      continue
    }
    if (entries.some((entry) => !discoveryInventory[key].includes(entry))) {
      lifecycleProblem(`${label} discovery ${key} exceeds the signed discovery policy`)
      valid = false
    }
  }
  return valid
}
const validateLifecycleSurface = (surface, label, retired = false) => {
  const keys = retired ? ['kind', 'path', 'sha256'] : ['kind', 'path']
  const valid = closedKeys(surface, keys)
    && ['file', 'tree'].includes(surface.kind)
    && lifecyclePathValid(surface.path)
    && (!retired || lifecycleSha256.test(surface.sha256 || ''))
  if (!valid) lifecycleProblem(`${label} is open-shaped or invalid`)
  return valid
}
const validateSnapshotRetirement = (retirement, label) => {
  const transfersPresent = Object.hasOwn(retirement || {}, 'transfers')
  const keys = [
    'discovery', 'id', 'reasonCode', 'replacementProviderId', 'retiredInVersion', 'surfaces',
    ...(transfersPresent ? ['transfers'] : []),
  ]
  let valid = closedKeys(retirement, keys)
    && lifecycleProviderId.test(retirement.id || '')
    && (retirement.replacementProviderId === null || lifecycleProviderId.test(retirement.replacementProviderId || ''))
    && retirement.replacementProviderId !== retirement.id
    && exactSemver.test(retirement.retiredInVersion || '')
    && /^[A-Z][A-Z0-9_]*$/.test(retirement.reasonCode || '')
    && Array.isArray(retirement.surfaces)
    && (!transfersPresent || (Array.isArray(retirement.transfers) && retirement.transfers.length > 0))
  if (!valid) {
    lifecycleProblem(`${label} is open-shaped or invalid`)
    return false
  }
  valid = validateLifecycleDiscovery(retirement.discovery, `${label}.${retirement.id}`) && valid
  const transfers = retirement.transfers || []
  for (const [index, surface] of retirement.surfaces.entries()) {
    valid = validateLifecycleSurface(surface, `${label}.surfaces[${index}]`, true) && valid
  }
  for (const [index, surface] of transfers.entries()) {
    valid = validateLifecycleSurface(surface, `${label}.transfers[${index}]`) && valid
  }
  if (!retirement.surfaces.length && !transfers.length) {
    lifecycleProblem(`${label} must delete or transfer at least one surface`)
    valid = false
  }
  if (retirement.replacementProviderId === null && transfers.length) {
    lifecycleProblem(`${label} cannot transfer surfaces without a replacement provider`)
    valid = false
  }
  const sortedRetired = [...retirement.surfaces].sort((left, right) => compareUtf8Bytes(left?.path, right?.path))
  const sortedTransfers = [...transfers].sort((left, right) => compareUtf8Bytes(left?.path, right?.path))
  if (JSON.stringify(retirement.surfaces) !== JSON.stringify(sortedRetired) || JSON.stringify(transfers) !== JSON.stringify(sortedTransfers)) {
    lifecycleProblem(`${label} deletion/transfer surfaces must be sorted by path`)
    valid = false
  }
  const partition = [...retirement.surfaces, ...transfers]
  if (partition.length !== new Set(partition.map((surface) => lifecyclePathKey(surface?.path))).size) {
    lifecycleProblem(`${label} deletion/transfer partition contains duplicate paths`)
    valid = false
  }
  return valid
}
const validateLifecycleSnapshot = (snapshot, label) => {
  let valid = closedKeys(snapshot, ['previousSnapshotSha256', 'providers', 'releaseVersion', 'retiredProviders'])
    && exactSemver.test(snapshot?.releaseVersion || '')
    && (snapshot?.previousSnapshotSha256 === null || lifecycleSha256.test(snapshot?.previousSnapshotSha256 || ''))
    && Array.isArray(snapshot?.providers)
    && Array.isArray(snapshot?.retiredProviders)
  if (!valid) {
    lifecycleProblem(`${label} is missing, open-shaped, or invalid`)
    return false
  }
  const providerIds = []
  const globalClaims = []
  for (const [providerIndex, provider] of snapshot.providers.entries()) {
    const providerLabel = `${label}.providers[${providerIndex}]`
    let providerValid = closedKeys(provider, ['discovery', 'id', 'surfaces'])
      && lifecycleProviderId.test(provider?.id || '')
      && Array.isArray(provider?.surfaces)
      && provider.surfaces.length > 0
    if (!providerValid) {
      lifecycleProblem(`${providerLabel} is open-shaped or invalid`)
      valid = false
      continue
    }
    providerValid = validateLifecycleDiscovery(provider.discovery, `${providerLabel}.${provider.id}`) && providerValid
    for (const [surfaceIndex, surface] of provider.surfaces.entries()) {
      providerValid = validateLifecycleSurface(surface, `${providerLabel}.surfaces[${surfaceIndex}]`) && providerValid
      if (surface?.path) globalClaims.push({ ...surface, providerId: provider.id })
    }
    const sortedSurfaces = [...provider.surfaces].sort((left, right) => compareUtf8Bytes(left?.path, right?.path))
    if (JSON.stringify(provider.surfaces) !== JSON.stringify(sortedSurfaces)) {
      lifecycleProblem(`${providerLabel}.surfaces must be sorted by path`)
      providerValid = false
    }
    for (let left = 0; left < provider.surfaces.length; left += 1) for (let right = left + 1; right < provider.surfaces.length; right += 1) {
      if (lifecyclePathsOverlap(provider.surfaces[left]?.path, provider.surfaces[right]?.path)) {
        lifecycleProblem(`${providerLabel} has overlapping managed surfaces`)
        providerValid = false
      }
    }
    providerIds.push(provider.id)
    valid = providerValid && valid
  }
  if (JSON.stringify(providerIds) !== JSON.stringify([...new Set(providerIds)].sort())) {
    lifecycleProblem(`${label} provider ids must be sorted and unique`)
    valid = false
  }
  for (let left = 0; left < globalClaims.length; left += 1) for (let right = left + 1; right < globalClaims.length; right += 1) {
    if (globalClaims[left].providerId !== globalClaims[right].providerId && lifecyclePathsOverlap(globalClaims[left].path, globalClaims[right].path)) {
      lifecycleProblem(`${label} has cross-provider managed surface overlap`)
      valid = false
    }
  }
  for (const [index, retirement] of snapshot.retiredProviders.entries()) {
    valid = validateSnapshotRetirement(retirement, `${label}.retiredProviders[${index}]`) && valid
  }
  const retiredIds = snapshot.retiredProviders.map((retirement) => retirement?.id)
  if (
    JSON.stringify(retiredIds) !== JSON.stringify([...new Set(retiredIds)].sort())
    || providerIds.some((providerId) => retiredIds.includes(providerId))
  ) {
    lifecycleProblem(`${label} retired provider ids must be sorted, unique, and inactive`)
    valid = false
  }
  return valid
}
const lifecycleShapeValid = Boolean(
  closedKeys(providerLifecycle, [
    'schemaVersion', 'releaseVersion', 'immutableHead', 'immutableHeadSnapshot', 'ledgerSha256', 'previousSnapshotSha256',
    'currentSnapshot', 'currentSnapshotSha256', 'currentProviderInventorySha256', 'retiredProviders',
  ])
  && providerLifecycle.schemaVersion === 4
  && providerLifecycle.releaseVersion === bom?.release?.designSystem
  && closedKeys(providerLifecycle.immutableHead, ['releaseVersion', 'snapshotSha256', 'providerInventorySha256'])
  && exactSemver.test(providerLifecycle.immutableHead.releaseVersion || '')
  && lifecycleSha256.test(providerLifecycle.immutableHead.snapshotSha256 || '')
  && lifecycleSha256.test(providerLifecycle.immutableHead.providerInventorySha256 || '')
  && lifecycleSha256.test(providerLifecycle.ledgerSha256 || '')
  && lifecycleSha256.test(providerLifecycle.currentSnapshotSha256 || '')
  && lifecycleSha256.test(providerLifecycle.currentProviderInventorySha256 || '')
  && (providerLifecycle.previousSnapshotSha256 === null || lifecycleSha256.test(providerLifecycle.previousSnapshotSha256 || ''))
  && Array.isArray(providerLifecycle.retiredProviders)
)
if (!lifecycleShapeValid) lifecycleProblem('installed provider lifecycle is missing, open-shaped, or unknown-versioned')
const currentSnapshotValid = validateLifecycleSnapshot(providerLifecycle?.currentSnapshot, 'installed current provider snapshot')
const immutableHeadSnapshotValid = validateLifecycleSnapshot(providerLifecycle?.immutableHeadSnapshot, 'installed immutable-head provider snapshot')
const currentSnapshot = currentSnapshotValid ? providerLifecycle.currentSnapshot : null
const immutableHeadSnapshot = immutableHeadSnapshotValid ? providerLifecycle.immutableHeadSnapshot : null
if (lifecycleShapeValid && currentSnapshot && immutableHeadSnapshot) {
  const currentSnapshotSha256 = sha256(JSON.stringify(currentSnapshot))
  const currentProviderInventorySha256 = sha256(JSON.stringify(currentSnapshot.providers))
  const immutableSnapshotSha256 = sha256(JSON.stringify(immutableHeadSnapshot))
  const immutableProviderInventorySha256 = sha256(JSON.stringify(immutableHeadSnapshot.providers))
  if (
    currentSnapshotSha256 !== providerLifecycle.currentSnapshotSha256
    || currentProviderInventorySha256 !== providerLifecycle.currentProviderInventorySha256
  ) lifecycleProblem('installed current provider snapshot body does not match its authenticated hashes')
  if (
    currentSnapshot.releaseVersion !== providerLifecycle.releaseVersion
    || currentSnapshot.previousSnapshotSha256 !== providerLifecycle.previousSnapshotSha256
  ) lifecycleProblem('installed current provider snapshot release/previous pointer differs from its lifecycle envelope')
  if (
    immutableSnapshotSha256 !== providerLifecycle.immutableHead.snapshotSha256
    || immutableProviderInventorySha256 !== providerLifecycle.immutableHead.providerInventorySha256
    || immutableHeadSnapshot.releaseVersion !== providerLifecycle.immutableHead.releaseVersion
  ) lifecycleProblem('installed immutable-head snapshot body does not match its authenticated head')

  const projectedRetirements = providerLifecycle.retiredProviders.map((retirement) => {
    if (!retirement || typeof retirement !== 'object' || Array.isArray(retirement)) return retirement
    const {
      priorProviderSha256: _priorProviderSha256,
      priorReleaseVersion: _priorReleaseVersion,
      priorSnapshotSha256: _priorSnapshotSha256,
      ...projection
    } = retirement
    return projection
  })
  if (JSON.stringify(projectedRetirements) !== JSON.stringify(currentSnapshot.retiredProviders)) {
    lifecycleProblem('installed authenticated retirement proofs do not exactly project the current snapshot retirement ledger')
  }

  if (currentSnapshot.previousSnapshotSha256 === null) {
    if (
      JSON.stringify(currentSnapshot) !== JSON.stringify(immutableHeadSnapshot)
      || currentSnapshotSha256 !== immutableSnapshotSha256
      || currentSnapshot.retiredProviders.length !== 0
    ) lifecycleProblem('provider lifecycle genesis must use one identical current/immutable snapshot without retirements')
  } else {
    if (currentSnapshot.previousSnapshotSha256 !== immutableSnapshotSha256) {
      lifecycleProblem('current provider snapshot does not bind the embedded immutable-head snapshot')
    }
    if ((compareLifecycleSemver(currentSnapshot.releaseVersion, immutableHeadSnapshot.releaseVersion) ?? 0) <= 0) {
      lifecycleProblem('current provider snapshot release must increase after the immutable-head release')
    }
    const priorRetirements = immutableHeadSnapshot.retiredProviders
    if (
      currentSnapshot.retiredProviders.length < priorRetirements.length
      || JSON.stringify(currentSnapshot.retiredProviders.slice(0, priorRetirements.length)) !== JSON.stringify(priorRetirements)
    ) lifecycleProblem('provider snapshot retirement history is not append-only')
    const previousById = new Map(immutableHeadSnapshot.providers.map((provider) => [provider.id, provider]))
    const currentById = new Map(currentSnapshot.providers.map((provider) => [provider.id, provider]))
    for (const [providerId, previousProvider] of previousById) {
      const nextProvider = currentById.get(providerId)
      if (!nextProvider) continue
      const nextSurfaceKinds = new Map(nextProvider.surfaces.map((surface) => [surface.path, surface.kind]))
      if (previousProvider.surfaces.some((surface) => nextSurfaceKinds.get(surface.path) !== surface.kind)) {
        lifecycleProblem(`${currentSnapshot.releaseVersion}:${providerId} removed or changed a managed surface without retirement`)
      }
      const previousSurfacePaths = new Set(previousProvider.surfaces.map((surface) => lifecyclePathKey(surface.path)))
      if (nextProvider.surfaces.some((surface) => (
        !previousSurfacePaths.has(lifecyclePathKey(surface.path))
        && !lifecycleDiscoveryReservesPath(previousProvider.discovery, surface.path)
      ))) lifecycleProblem(`${currentSnapshot.releaseVersion}:${providerId} added a managed surface outside its immutable discovery authority`)
      for (const key of discoveryArrayKeys) {
        const nextDiscovery = new Set(nextProvider.discovery[key].map(lifecyclePathKey))
        if (previousProvider.discovery[key].some((entry) => !nextDiscovery.has(lifecyclePathKey(entry)))) {
          lifecycleProblem(`${currentSnapshot.releaseVersion}:${providerId} removed immutable discovery authority ${key}`)
        }
        const previousDiscovery = new Set(previousProvider.discovery[key].map(lifecyclePathKey))
        if (nextProvider.discovery[key].some((entry) => (
          !previousDiscovery.has(lifecyclePathKey(entry))
          && !lifecycleDiscoveryReservesPath(previousProvider.discovery, entry)
        ))) lifecycleProblem(`${currentSnapshot.releaseVersion}:${providerId} added discovery authority outside its immutable namespace ${key}`)
      }
    }
    const removedProviderIds = [...previousById.keys()].filter((providerId) => !currentById.has(providerId)).sort()
    const appendedRetirements = currentSnapshot.retiredProviders.slice(priorRetirements.length)
    if (JSON.stringify(appendedRetirements.map((retirement) => retirement.id).sort()) !== JSON.stringify(removedProviderIds)) {
      lifecycleProblem('provider removals do not exactly match appended snapshot retirements')
    }
    const authenticatedById = new Map(providerLifecycle.retiredProviders.map((retirement) => [retirement?.id, retirement]))
    const currentActiveClaims = currentSnapshot.providers.flatMap((provider) => provider.surfaces.map((surface) => ({
      ...surface,
      providerId: provider.id,
    })))
    for (const retirement of appendedRetirements) {
      const priorProvider = previousById.get(retirement.id)
      const authenticated = authenticatedById.get(retirement.id)
      const partition = [
        ...retirement.surfaces.map(({ path, kind }) => ({ path, kind })),
        ...(retirement.transfers || []).map(({ path, kind }) => ({ path, kind })),
      ].sort((left, right) => compareUtf8Bytes(left.path, right.path))
      if (
        !priorProvider
        || JSON.stringify(retirement.discovery) !== JSON.stringify(priorProvider.discovery)
        || JSON.stringify(partition) !== JSON.stringify(priorProvider.surfaces)
        || retirement.retiredInVersion !== currentSnapshot.releaseVersion
      ) lifecycleProblem(`${retirement.id}:retirement does not exactly project its immutable prior provider`)
      if (
        !authenticated
        || authenticated.priorReleaseVersion !== immutableHeadSnapshot.releaseVersion
        || authenticated.priorSnapshotSha256 !== immutableSnapshotSha256
        || !priorProvider
        || authenticated.priorProviderSha256 !== sha256(JSON.stringify(priorProvider))
      ) lifecycleProblem(`${retirement.id}:authenticated retirement origin does not bind the embedded immutable head`)
      const replacement = retirement.replacementProviderId === null
        ? null
        : currentById.get(retirement.replacementProviderId)
      if (retirement.replacementProviderId !== null && (!replacement || replacement.id === retirement.id)) {
        lifecycleProblem(`${retirement.id}:replacement provider is not a distinct active current provider`)
      }
      for (const surface of retirement.surfaces) {
        if (currentActiveClaims.some((candidate) => lifecyclePathsOverlap(candidate.path, surface.path))) {
          lifecycleProblem(`${retirement.id}:deletion tombstone remains owned by an active provider`)
        }
      }
      for (const surface of retirement.transfers || []) {
        if (!replacement?.surfaces.some((candidate) => candidate.path === surface.path && candidate.kind === surface.kind)) {
          lifecycleProblem(`${retirement.id}:transferred surface is not exactly owned by its replacement provider`)
        }
        if (currentActiveClaims.some((candidate) => candidate.providerId !== replacement?.id && lifecyclePathsOverlap(candidate.path, surface.path))) {
          lifecycleProblem(`${retirement.id}:transferred surface is also owned by a non-replacement provider`)
        }
      }
    }
  }
}
if (lifecycleShapeValid && bom?.payload?.providerLifecycleSha256 !== sha256(JSON.stringify(providerLifecycle))) {
  add('GOV-BOM-004', 'BLOCKER', 'installed provider lifecycle digest differs from the immutable governance BOM')
}
const shippedManagedFiles = manifest?.consumer?.managedFiles || {}
const expectedManagedNames = bomManagedFileNames
if (JSON.stringify(Object.keys(shippedManagedFiles).sort()) !== JSON.stringify(expectedManagedNames)) {
  add('GOV-MANAGED-FILE-002', 'BLOCKER', 'installed managed-file body map does not exactly match the immutable BOM')
}
for (const [destination, digest] of Object.entries(bom?.payload?.managedFiles || {})) {
  const artifact = shippedManagedFiles[destination]
  const absolute = typeof artifact === 'string' ? resolve(forkRoot, artifact) : ''
  const artifactRelative = absolute ? relative(forkRoot, absolute).replaceAll('\\', '/') : ''
  if (
    !artifact
    || artifactRelative.startsWith('../')
    || !artifactRelative.startsWith('consumer/managed-files/')
    || !isRegularFile(absolute)
    || fileSha(absolute) !== digest
  ) add('GOV-MANAGED-FILE-002', 'BLOCKER', `installed managed body missing or unbound: ${destination}`)
}
const shippedBomPath = join(forkRoot, manifest?.consumer?.governanceLock || 'consumer/lock.json')
const shippedBomSchemaPath = join(forkRoot, manifest?.consumer?.governanceLockSchema || 'consumer/lock.schema.json')
const committedBomSchemaPath = join(repo, 'governance/lock.schema.json')
if (!existsSync(shippedBomPath) || !existsSync(bomPath) || fileSha(shippedBomPath) !== fileSha(bomPath)) {
  add('GOV-BOM-003', 'BLOCKER', 'committed governance lock is not byte-identical to the installed immutable release lock')
}
if (!existsSync(shippedBomSchemaPath) || !existsSync(committedBomSchemaPath) || fileSha(shippedBomSchemaPath) !== fileSha(committedBomSchemaPath)) {
  add('GOV-BOM-003', 'BLOCKER', 'committed governance lock schema is not byte-identical to the installed immutable schema')
}
const expectedBomKeys = ['$schema', 'authority', 'generatedBy', 'payload', 'providers', 'release', 'role', 'schemaVersion', 'upgradeProtocol', 'upgradeTrust']
const expectedPayloadKeys = [
  'commonInstructionSha256', 'mergeSurfaceDigests', 'providerArtifactDigests',
  'discoveryPolicySha256', 'providerLifecycleSha256', 'providerInventorySha256', 'providerMaterializersSha256',
  'executionRuntimeSha256',
  'forkCorpusLockSha256', 'governanceCheckSha256', 'managedFiles', 'requiredScripts',
  'sharedSkillCount', 'sharedSkillsSha256', 'utilityRegistrySha256',
].sort()
if (
  !bom || JSON.stringify(Object.keys(bom).sort()) !== JSON.stringify(expectedBomKeys.sort())
  || JSON.stringify(Object.keys(bom?.payload || {}).sort()) !== JSON.stringify(expectedPayloadKeys)
) add('GOV-BOM-004', 'BLOCKER', 'governance lock does not satisfy the closed canonical shape')
if (!isRegularFile(utilityRegistryPath) || bom?.payload?.utilityRegistrySha256 !== fileSha(utilityRegistryPath)) {
  add('GOV-UTILITY-REGISTRY-001', 'BLOCKER', 'installed canonical utility registry is missing, aliased, or differs from the immutable governance BOM')
}
const executionRuntime = manifest?.consumer?.executionRuntime
const expectedExecutionRuntimeKeys = [
  'engine', 'exactNpmVersion', 'minimumNodeVersion', 'nativeWindowsPolicy', 'requiredExecutables', 'requiredPathClasses', 'schemaVersion',
  'supportedHostPlatforms', 'windowsCompatibilityEnvironments',
].sort()
const executionRuntimeValid = Boolean(
  closedKeys(executionRuntime, expectedExecutionRuntimeKeys)
  && executionRuntime.schemaVersion === 2
  && executionRuntime.engine === 'node-posix-toolchain-v2'
  && /^\d+\.\d+\.\d+$/.test(executionRuntime.minimumNodeVersion || '')
  && /^\d+\.\d+\.\d+$/.test(executionRuntime.exactNpmVersion || '')
  && executionRuntime.nativeWindowsPolicy === 'unsupported-fail-closed'
  && JSON.stringify(executionRuntime.supportedHostPlatforms) === JSON.stringify(['darwin', 'linux'])
  && JSON.stringify(executionRuntime.windowsCompatibilityEnvironments) === JSON.stringify(['devcontainer-linux', 'wsl2-linux'])
  && JSON.stringify(executionRuntime.requiredExecutables) === JSON.stringify(['bash', 'git', 'jq', 'node', 'python3'])
  && JSON.stringify(executionRuntime.requiredPathClasses) === JSON.stringify(['plain', 'space-containing'])
)
if (!executionRuntimeValid) add('GOV-RUNTIME-001', 'BLOCKER', 'installed consumer execution runtime contract is missing, open-shaped, or unsupported')
if (executionRuntimeValid && bom?.payload?.executionRuntimeSha256 !== sha256(JSON.stringify(executionRuntime))) {
  add('GOV-BOM-004', 'BLOCKER', 'installed execution runtime digest differs from the immutable governance BOM')
}
if (executionRuntimeValid && !executionRuntime.supportedHostPlatforms.includes(process.platform)) {
  const compatibility = process.platform === 'win32'
    ? `; use one of the declared Linux execution environments: ${executionRuntime.windowsCompatibilityEnvironments.join(', ')}`
    : ''
  add('GOV-RUNTIME-002', 'BLOCKER', `native host platform is unsupported:${process.platform}${compatibility}`)
}
if (executionRuntimeValid && !stableVersionAtLeast(process.versions.node, executionRuntime.minimumNodeVersion)) {
  add('GOV-RUNTIME-002', 'BLOCKER', `Node.js ${executionRuntime.minimumNodeVersion} or newer is required; received ${process.versions.node}`)
}
if (executionRuntimeValid) {
  const requiredNodeRange = `>=${executionRuntime.minimumNodeVersion}`
  const lockedRoot = packageLock?.packages?.['']
  const lockedNpm = packageLock?.packages?.['node_modules/npm']
  if (
    pkg?.engines?.node !== requiredNodeRange
    || pkg?.devDependencies?.npm !== executionRuntime.exactNpmVersion
    || packageLock?.lockfileVersion !== 3
    || lockedRoot?.engines?.node !== requiredNodeRange
    || lockedRoot?.devDependencies?.npm !== executionRuntime.exactNpmVersion
    || lockedNpm?.version !== executionRuntime.exactNpmVersion
    || lockedNpm?.resolved !== `https://registry.npmjs.org/npm/-/npm-${executionRuntime.exactNpmVersion}.tgz`
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(lockedNpm?.integrity || '')
  ) add('GOV-RUNTIME-001', 'BLOCKER', 'package engines and exact npm lock must equal the installed execution runtime contract')
}
const expectedUpgradeTrust = {
  schemaVersion: 1,
  repository: 'ajenchen/design-system',
  workflow: '.github/workflows/release.yml',
  workflowRef: 'refs/heads/main',
  provenancePredicate: 'https://slsa.dev/provenance/v1',
  builderId: 'https://github.com/actions/runner/github-hosted',
  immutableRelease: true,
  releaseBomAsset: 'release-bom.json',
  upgradePackages: ['@qijenchen/design-system', '@qijenchen/storybook-config'],
  releasePackages: ['@qijenchen/design-system', '@qijenchen/governance', '@qijenchen/storybook-config'],
}
if (JSON.stringify(bom?.upgradeTrust) !== JSON.stringify(expectedUpgradeTrust)) {
  add('GOV-BOM-004', 'BLOCKER', 'governance lock upgradeTrust is not the closed repository/workflow/release/package policy')
}
const expectedUpgradeProtocolKeys = [
  'bootstrapEvidenceContract', 'candidateCodeExecutionAllowed', 'controlPlaneUpdateEvidenceContract',
  'controlPlaneUpdateMode', 'controlPlaneUpdatePlanner', 'implementationSha256', 'legacyEntryMode',
  'ordinaryUpgradeMode', 'physicalPowerLossDurabilityClaimed', 'protectedBaseVerifier',
  'protocolId', 'schemaSha256', 'schemaVersion', 'specificationSha256',
]
const upgradeProtocolShapeValid = Boolean(
  closedKeys(bom?.upgradeProtocol, expectedUpgradeProtocolKeys)
  && bom.upgradeProtocol.schemaVersion === 2
  && bom.upgradeProtocol.protocolId === 'protected-base-reconstruction-v2'
  && bom.upgradeProtocol.legacyEntryMode === 'one-time-reviewed-full-snapshot-pr'
  && bom.upgradeProtocol.bootstrapEvidenceContract === 'consumer-governance-bootstrap-readback-v1'
  && bom.upgradeProtocol.controlPlaneUpdateMode === 'recurring-reviewed-full-snapshot-pr'
  && bom.upgradeProtocol.controlPlaneUpdateEvidenceContract === 'consumer-governance-control-plane-update-readback-v1'
  && bom.upgradeProtocol.controlPlaneUpdatePlanner === 'infra/governance/bin/consumerctl.mjs'
  && bom.upgradeProtocol.ordinaryUpgradeMode === 'protected-base-disposable-reconstruction'
  && bom.upgradeProtocol.protectedBaseVerifier === 'scripts/verify-upgrade-evidence.mjs'
  && bom.upgradeProtocol.candidateCodeExecutionAllowed === false
  && bom.upgradeProtocol.physicalPowerLossDurabilityClaimed === false
  && /^[a-f0-9]{64}$/.test(bom.upgradeProtocol.specificationSha256 || '')
  && /^[a-f0-9]{64}$/.test(bom.upgradeProtocol.schemaSha256 || '')
  && /^[a-f0-9]{64}$/.test(bom.upgradeProtocol.implementationSha256 || '')
)
if (!upgradeProtocolShapeValid) {
  add('GOV-BOM-004', 'BLOCKER', 'governance lock upgradeProtocol is not the closed protected-base reconstruction v2 specification/schema/implementation binding')
}
if (corpusLock && bom?.payload?.forkCorpusLockSha256 !== fileSha(corpusLockPath)) {
  add('GOV-CORPUS-002', 'BLOCKER', 'installed fork corpus lock digest does not match governance BOM')
}
const corpusLockShapeValid = Boolean(
  closedKeys(corpusLock, ['schemaVersion', 'kind', 'hashAlgorithm', '_purpose', 'entries'])
  && corpusLock.schemaVersion === 1
  && corpusLock.kind === 'fork-governance-corpus-lock'
  && corpusLock.hashAlgorithm === 'sha256'
  && Array.isArray(corpusLock.entries)
)
if (!corpusLockShapeValid) add('GOV-CORPUS-001', 'BLOCKER', 'installed fork corpus lock is open-shaped, unknown-versioned, or has the wrong identity')
const corpusEntryFiles = []
for (const entry of corpusLock?.entries || []) {
  if (
    !closedKeys(entry, ['schemaVersion', 'file', 'sha256', 'source', 'classification', 'destination'])
    || entry.schemaVersion !== 1
    || typeof entry.file !== 'string'
    || entry.file.includes('\\')
    || entry.file.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')
    || ![null, 'SHIP_AS_IS', 'SHIP_REWRITTEN', 'REPLACE', 'HELPER'].includes(entry.classification)
    || (entry.source !== null && typeof entry.source !== 'string')
    || (entry.destination !== null && typeof entry.destination !== 'string')
  ) {
    add('GOV-CORPUS-001', 'BLOCKER', `installed corpus entry is open-shaped or invalid:${entry?.file || '<unknown>'}`)
    continue
  }
  corpusEntryFiles.push(entry.file)
  const file = join(forkRoot, entry.file)
  if (!isRegularFile(file)) add('GOV-CORPUS-003', 'BLOCKER', `corpus entry missing or not a regular file: ${entry.file}`)
  else if (fileSha(file) !== entry.sha256) add('GOV-CORPUS-003', 'BLOCKER', `corpus entry tampered: ${entry.file}`)
}
if (JSON.stringify(corpusEntryFiles) !== JSON.stringify([...new Set(corpusEntryFiles)].sort(compareUtf8Bytes))) {
  add('GOV-CORPUS-001', 'BLOCKER', 'installed corpus entries must be unique and sorted by file')
}
if (!corpusEntryFiles.includes('review/provider-review-binding.mjs')) {
  add('GOV-CORPUS-001', 'BLOCKER', 'installed corpus lacks the locked exact provider review resolver')
}
for (const artifactPath of authorityDecisionArtifactPaths) {
  const launcherName = typeof artifactPath === 'string' && artifactPath.startsWith('launchers/')
    ? artifactPath.slice('launchers/'.length)
    : null
  if (
    !launcherName
    || !Array.isArray(manifest?.launchers)
    || !manifest.launchers.includes(launcherName)
    || !corpusEntryFiles.includes(artifactPath)
  ) add('GOV-CORPUS-001', 'BLOCKER', `installed authority-decision artifact is absent from the authenticated launcher corpus:${artifactPath || '<missing>'}`)
}

// Required CI executes this checker from the exact installed payload. The committed copy remains a
// reviewed mirror, but can never become the authority by editing itself in the same pull request.
const runningChecker = fileURLToPath(import.meta.url)
const shippedChecker = join(forkRoot, manifest?.consumer?.governanceCheck || 'consumer/governance-check.mjs')
const committedChecker = join(repo, 'scripts/governance-check.mjs')
if (!isRegularFile(shippedChecker) || fileSha(runningChecker) !== fileSha(shippedChecker)) add('GOV-CHECKER-001', 'BLOCKER', 'executed checker is not the exact installed regular-file governance payload')
if (!isRegularFile(committedChecker) || !isRegularFile(shippedChecker) || fileSha(committedChecker) !== fileSha(shippedChecker)) add('GOV-CHECKER-001', 'BLOCKER', 'committed governance checker drifted from exact installed payload')
if (bom?.payload?.governanceCheckSha256 && isRegularFile(shippedChecker) && bom.payload.governanceCheckSha256 !== fileSha(shippedChecker)) add('GOV-CHECKER-001', 'BLOCKER', 'governance checker digest != immutable consumer BOM')

const providerSurfaces = manifest?.providerSurfaces
if (!providerSurfaces || typeof providerSurfaces !== 'object' || Array.isArray(providerSurfaces)) {
  add('GOV-PROVIDER-001', 'BLOCKER', 'installed manifest has no provider-neutral providerSurfaces inventory')
}
if (providerSurfaces && bom?.payload?.providerInventorySha256 !== sha256(JSON.stringify(providerSurfaces))) {
  add('GOV-BOM-004', 'BLOCKER', 'installed provider surface inventory digest differs from the immutable governance BOM')
}
if (providerMaterializersValid && bom?.payload?.providerMaterializersSha256 !== sha256(JSON.stringify(providerMaterializers))) {
  add('GOV-BOM-004', 'BLOCKER', 'installed provider materializer catalog digest differs from the immutable governance BOM')
}
const providerAdapters = manifest?.providerAdapters
if (!providerAdapters || typeof providerAdapters !== 'object' || Array.isArray(providerAdapters)) {
  add('GOV-PROVIDER-001', 'BLOCKER', 'installed manifest has no provider adapter inventory')
}
const expectedAdapterKeys = ['schemaVersion', 'capabilities', 'environmentMap', 'normalization', 'blockingExitCode', 'contextOutputTransport', 'stopDecisionTransport']
for (const [providerId, adapter] of Object.entries(providerAdapters || {})) {
  if (
    !closedKeys(adapter, expectedAdapterKeys)
    || adapter.schemaVersion !== 1
    || !Number.isInteger(adapter.blockingExitCode)
    || adapter.blockingExitCode < 1
    || adapter.blockingExitCode > 255
    || !closedKeys(adapter.capabilities, ['nativeHooks', 'hookEnforcement', 'hardGate'])
    || adapter.capabilities.hardGate !== 'provider-neutral-ci-required'
    || !['native-feedback-plus-ci', 'ci-only'].includes(adapter.capabilities.hookEnforcement)
  ) add('GOV-PROVIDER-001', 'BLOCKER', `${providerId} provider adapter record is open-shaped or unknown-versioned`)
}
const manifestPath = (root, value, label) => {
  if (typeof value !== 'string' || !value || value.includes('\0') || isAbsolute(value)) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${label} is not a repository-relative path`)
    return null
  }
  const absolute = resolve(root, value)
  const rel = relative(root, absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${label} escapes its declared root:${value}`)
    return null
  }
  return absolute
}
const commonInstructionMaterializer = resolveSurfaceMaterializer(
  'instructionViews',
  commonInstruction?.materializerId,
  'consumer.commonInstruction.materializerId',
)
if (
  commonInstructionMaterializer?.engine !== 'shared-instruction-v1'
  || commonInstructionMaterializer?.ownershipPolicy !== 'common-authority-consumer'
  || commonInstruction?.materializerId !== commonAuthorityMaterializerIds[0]
) add('GOV-ADAPTER-003', 'BLOCKER', 'common instruction materializer is not the registered common-authority consumer')
const commonInstructionArtifact = manifestPath(forkRoot, commonInstruction?.artifact, 'common instruction artifact')
const commonInstructionDestination = manifestPath(repo, commonInstruction?.destination, 'common instruction destination')
if (
  !commonInstructionArtifact
  || !commonInstructionDestination
  || !isRegularFile(commonInstructionArtifact)
  || !isRegularFile(commonInstructionDestination)
  || fileSha(commonInstructionArtifact) !== fileSha(commonInstructionDestination)
  || bom?.payload?.commonInstructionSha256 !== fileSha(commonInstructionArtifact)
) add('GOV-ADAPTER-003', 'BLOCKER', 'common instruction is not the exact locked consumer projection')
// Provider-native discovery roots are closed surfaces. Exact hook files and recursively verified
// skill/launcher trees are the only leaves allowed below each generated dot-directory; otherwise a
// sibling settings.local.json/command/skill can become an unsigned executable policy source even
// when every canonical destination still matches its digest.
const providerRootPlans = new Map()
const generatedProviderDestinations = new Set()
if (commonInstructionDestination) {
  generatedProviderDestinations.add(resolve(commonInstructionDestination))
  canonicalReplayExcludedFiles.add(resolve(commonInstructionDestination))
}
const providerRootFor = (absolute) => {
  const rel = relative(repo, absolute)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null
  const first = rel.split(sep)[0]
  return first.startsWith('.') && first !== '.' && first !== '..' ? join(repo, first) : null
}
const registerProviderPath = (absolute, kind) => {
  if (!absolute) return
  const root = providerRootFor(absolute)
  if (!root) return
  const plan = providerRootPlans.get(root) || { files: new Set(), trees: new Set() }
  plan[kind === 'tree' ? 'trees' : 'files'].add(resolve(absolute))
  providerRootPlans.set(root, plan)
}
const registerProviderRootOnly = (absolute) => {
  const root = providerRootFor(absolute)
  if (root && !providerRootPlans.has(root)) providerRootPlans.set(root, { files: new Set(), trees: new Set() })
}
for (const root of [...discoveryInventory.providerRootNames, ...discoveryInventory.pluginRootNames]) {
  if (discoveryRootPattern.test(root)) registerProviderRootOnly(join(repo, root))
}
const surfaceHookConfigs = new Map()
const installedSurfaceHookConfigs = new Map()
const surfaceHookMaterializers = new Map()
const surfaceSkillMaterializers = new Map()
const surfaceNativeEventBindings = new Map()
const generatedSurfaces = []
const managedSurfacesByProvider = new Map()
const expectedSurfaceKeys = [
  'schemaVersion', 'generated', 'capabilities', 'instructionArtifact', 'instructionDestination',
  'instructionMaterializerId', 'hookArtifact', 'hookDestination', 'hookMaterializerId', 'skillArtifactRoot', 'skillDestination',
  'skillEntryFile', 'skillMaterializerId', 'skills', 'trees', 'managedSurfaces', 'nativeHookCoverage', 'environmentMap', 'exclusions',
]
for (const [providerId, surface] of Object.entries(providerSurfaces || {}).sort(([a], [b]) => compareUtf8Bytes(a, b))) {
  if (
    !closedKeys(surface, expectedSurfaceKeys)
    || surface.schemaVersion !== 3
    || !closedKeys(surface.capabilities, ['nativeHooks', 'hookEnforcement', 'hardGate'])
    || surface.capabilities.hardGate !== 'provider-neutral-ci-required'
    || !Array.isArray(surface.skills)
    || !Array.isArray(surface.trees)
    || !Array.isArray(surface.managedSurfaces)
    || !Array.isArray(surface.exclusions)
  ) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} provider surface record is open-shaped or unknown-versioned`)
    continue
  }
  if (!surface?.generated) {
    if (surface.managedSurfaces.length) add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} disabled surface claims managed destinations`)
    if (surface.trees.length) add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} disabled surface claims product managed trees`)
    if (!Array.isArray(surface?.exclusions) || !surface.exclusions.length) add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} disabled surface has no machine-readable exclusion`)
    if (surface.instructionMaterializerId !== null || surface.hookMaterializerId !== null || surface.skillMaterializerId !== null || surface.skillEntryFile !== null) {
      add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} disabled surface claims provider materializers`)
    }
    if (surface.nativeHookCoverage !== null) add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} disabled surface claims native hook coverage`)
    continue
  }
  const nativeHooks = surface.capabilities.nativeHooks === true
  const nativeHookCoverage = surface.nativeHookCoverage
  const coverageCanonicalEvents = nativeHookCoverage?.canonicalEvents
  const coverageProjectedEvents = nativeHookCoverage?.projectedEvents
  const coverageProjectedNativeEvents = nativeHookCoverage?.projectedNativeEvents
  const coverageExcludedEvents = nativeHookCoverage?.excludedEvents
  const sortedUniqueStrings = (values) => Array.isArray(values)
    && values.every((value) => typeof value === 'string' && value.length > 0)
    && JSON.stringify(values) === JSON.stringify([...new Set(values)].sort())
  const coverageExcludedValid = Array.isArray(coverageExcludedEvents)
    && coverageExcludedEvents.every((record) => (
      closedKeys(record, ['authoritativeFallback', 'event', 'reasonCode'])
      && typeof record.event === 'string'
      && /^[A-Z][A-Z0-9_]*$/.test(record.reasonCode || '')
      && record.authoritativeFallback === 'immutable-governance-check-and-protected-ci'
    ))
    && JSON.stringify(coverageExcludedEvents.map((record) => record.event))
      === JSON.stringify(coverageExcludedEvents.map((record) => record.event).sort())
  const excludedCoverageEvents = coverageExcludedValid ? coverageExcludedEvents.map((record) => record.event) : []
  const coverageProjectedNativeValid = Array.isArray(coverageProjectedNativeEvents)
    && coverageProjectedNativeEvents.every((record) => (
      closedKeys(record, ['canonicalEvent', 'nativeEvent'])
      && typeof record.canonicalEvent === 'string'
      && record.canonicalEvent.length > 0
      && typeof record.nativeEvent === 'string'
      && /^[A-Za-z][A-Za-z0-9_.:@/-]*$/.test(record.nativeEvent)
    ))
    && JSON.stringify(coverageProjectedNativeEvents.map((record) => record.canonicalEvent))
      === JSON.stringify(coverageProjectedNativeEvents.map((record) => record.canonicalEvent).sort())
  const projectedNativeCanonicalEvents = coverageProjectedNativeValid ? coverageProjectedNativeEvents.map((record) => record.canonicalEvent) : []
  const projectedNativeEvents = coverageProjectedNativeValid ? coverageProjectedNativeEvents.map((record) => record.nativeEvent) : []
  if (
    !closedKeys(nativeHookCoverage, ['canonicalEvents', 'excludedEvents', 'projectedEvents', 'projectedNativeEvents', 'schemaVersion'])
    || nativeHookCoverage.schemaVersion !== 2
    || !sortedUniqueStrings(coverageCanonicalEvents)
    || !coverageCanonicalEvents.length
    || !sortedUniqueStrings(coverageProjectedEvents)
    || !coverageExcludedValid
    || !coverageProjectedNativeValid
    || JSON.stringify(projectedNativeCanonicalEvents) !== JSON.stringify(coverageProjectedEvents)
    || new Set(projectedNativeEvents).size !== projectedNativeEvents.length
    || new Set(excludedCoverageEvents).size !== excludedCoverageEvents.length
    || coverageProjectedEvents.some((event) => excludedCoverageEvents.includes(event))
    || JSON.stringify([...coverageProjectedEvents, ...excludedCoverageEvents].sort()) !== JSON.stringify(coverageCanonicalEvents)
    || (!nativeHooks && (coverageProjectedEvents.length > 0 || coverageExcludedEvents.some((record) => record.reasonCode !== 'NATIVE_HOOK_API_UNAVAILABLE')))
    || (nativeHooks && coverageExcludedEvents.some((record) => record.reasonCode !== 'EVENT_NOT_SUPPORTED'))
  ) add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} native hook event coverage is open, incomplete, or lacks its authoritative fallback`)
  surfaceNativeEventBindings.set(providerId, coverageProjectedNativeValid ? coverageProjectedNativeEvents : [])
  const instructionMaterializer = resolveSurfaceMaterializer('instructionViews', surface.instructionMaterializerId, `${providerId}.instructionMaterializerId`)
  const hookMaterializer = nativeHooks
    ? resolveSurfaceMaterializer('hookViews', surface.hookMaterializerId, `${providerId}.hookMaterializerId`)
    : null
  const skillMaterializer = resolveSurfaceMaterializer('skillViews', surface.skillMaterializerId, `${providerId}.skillMaterializerId`)
  surfaceHookMaterializers.set(providerId, hookMaterializer)
  surfaceSkillMaterializers.set(providerId, skillMaterializer)
  if (skillMaterializer && surface.skillEntryFile !== skillMaterializer.entryFile) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} skill entry file differs from its registered materializer`)
  }
  const canonicalManagedSurfaces = [...surface.managedSurfaces].sort((left, right) => compareUtf8Bytes(left?.path, right?.path))
  if (!surface.managedSurfaces.length || JSON.stringify(surface.managedSurfaces) !== JSON.stringify(canonicalManagedSurfaces)) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} managed surfaces must be non-empty and sorted`)
  }
  const managedSurfaceKeys = new Set()
  const ownedManagedSurfaces = []
  for (const managed of surface.managedSurfaces) {
    const absolute = closedKeys(managed, ['path', 'kind']) && ['file', 'tree'].includes(managed.kind)
      ? manifestPath(repo, managed.path, `${providerId} managed surface`)
      : null
    if (!absolute || managedSurfaceKeys.has(managed.path)) {
      add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} managed surface is invalid or duplicated:${managed?.path || '<unknown>'}`)
      continue
    }
    managedSurfaceKeys.add(managed.path)
    ownedManagedSurfaces.push({ path: managed.path, kind: managed.kind })
    registerProviderPath(absolute, managed.kind)
    if (managed.kind === 'tree') canonicalReplayExcludedRoots.add(resolve(absolute))
    else canonicalReplayExcludedFiles.add(resolve(absolute))
  }
  managedSurfacesByProvider.set(providerId, ownedManagedSurfaces)
  generatedSurfaces.push([providerId, surface])
  if (instructionMaterializer?.engine === 'shared-instruction-v1') {
    if (
      surface.instructionArtifact !== commonInstruction?.artifact
      || surface.instructionDestination !== commonInstruction?.destination
      || surface.instructionMaterializerId !== commonInstruction?.materializerId
      || ownedManagedSurfaces.some((managed) => commonInstruction?.destination && pathsOverlap(managed.path, commonInstruction.destination))
    ) add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} shared instruction does not reference the common non-provider authority`)
  } else if (!ownedManagedSurfaces.some((managed) => managed.path === surface.instructionDestination && managed.kind === 'file')) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} provider instruction projection is absent from its managed surfaces`)
  }
  const instructionArtifact = manifestPath(forkRoot, surface.instructionArtifact, `${providerId} instruction artifact`)
  const instructionDestination = manifestPath(repo, surface.instructionDestination, `${providerId} instruction destination`)
  if (instructionDestination) {
    generatedProviderDestinations.add(resolve(instructionDestination))
    registerProviderPath(instructionDestination, 'file')
  }
  if (!instructionArtifact || !instructionDestination || !isRegularFile(instructionArtifact) || !isRegularFile(instructionDestination) || fileSha(instructionArtifact) !== fileSha(instructionDestination)) {
    add('GOV-ADAPTER-002', 'BLOCKER', `${providerId} instruction is not the exact installed regular-file projection`)
  }

  if (surface.capabilities.hookEnforcement !== (nativeHooks ? 'native-feedback-plus-ci' : 'ci-only')) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} hook capability does not match its provider-neutral enforcement mode`)
  }
  const hookArtifact = nativeHooks ? manifestPath(forkRoot, surface.hookArtifact, `${providerId} hook artifact`) : null
  const hookDestination = nativeHooks ? manifestPath(repo, surface.hookDestination, `${providerId} hook destination`) : null
  if (nativeHooks && hookDestination) {
    generatedProviderDestinations.add(resolve(hookDestination))
    registerProviderPath(hookDestination, 'file')
  }
  if (!nativeHooks && (surface.hookArtifact !== null || surface.hookDestination !== null || surface.hookMaterializerId !== null)) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} ci-only provider declares a native hook surface`)
  }
  if (!nativeHooks && !surface.exclusions.some((item) => item?.scope === 'native-hooks')) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} ci-only provider has no explicit native-hooks exclusion`)
  }
  const canonicalHookConfig = nativeHooks && hookArtifact ? readJson(hookArtifact, 'GOV-ADAPTER-001') : null
  const installedHookConfig = nativeHooks && hookDestination ? readJson(hookDestination, 'GOV-ADAPTER-001') : null
  surfaceHookConfigs.set(providerId, canonicalHookConfig)
  installedSurfaceHookConfigs.set(providerId, installedHookConfig)
  if (nativeHooks && hookMaterializer?.mergeStrategy !== 'merge-hook-map-into-base-v1') {
    if (!hookArtifact || !hookDestination || !isRegularFile(hookArtifact) || !isRegularFile(hookDestination) || fileSha(hookArtifact) !== fileSha(hookDestination)) {
      add('GOV-ADAPTER-005', 'BLOCKER', `${providerId} hook config is not the exact installed canonical projection`)
    }
    const expectedConfigKeys = hookMaterializer?.engine === 'json-hook-map-v1'
      ? [hookMaterializer.hooksField, ...(hookMaterializer.descriptionField === null ? [] : [hookMaterializer.descriptionField])]
      : hookMaterializer?.engine === 'json-hook-event-list-v1'
        ? [hookMaterializer.eventsField, hookMaterializer.descriptionField]
        : []
    if (installedHookConfig && (!expectedConfigKeys.length || !closedKeys(installedHookConfig, expectedConfigKeys))) {
      add('GOV-ADAPTER-004', 'BLOCKER', `${providerId} hook config does not satisfy its registered closed materializer shape`)
    }
  }

  const skillDestinationRoot = manifestPath(repo, surface.skillDestination, `${providerId} skill destination`)
  if (skillDestinationRoot) {
    generatedProviderDestinations.add(resolve(skillDestinationRoot))
    registerProviderPath(skillDestinationRoot, 'tree')
  }
  for (const name of surface.skills || []) {
    const source = manifestPath(forkRoot, `${surface.skillArtifactRoot}/${name}`, `${providerId} skill artifact ${name}`)
    const destination = manifestPath(repo, `${surface.skillDestination}/${name}`, `${providerId} skill destination ${name}`)
    if (!source || !destination) continue
    if (!isRegularFile(join(source, surface.skillEntryFile || ''))) {
      add('GOV-SKILL-003', 'BLOCKER', `${providerId} managed skill ${name} lacks its registered entry file`)
    }
    assertTreeEqual('GOV-SKILL-003', `${providerId} managed skill ${name}`, destination, source)
  }
  const validTrees = []
  for (const [index, tree] of surface.trees.entries()) {
    const label = `${providerId} product managed tree[${index}]`
    if (
      !closedKeys(tree, ['artifactRoot', 'destination', 'materializerId', 'name', 'schemaVersion', 'transformPolicy'])
      || tree.schemaVersion !== 1
      || !/^[a-z][a-z0-9-]*$/.test(tree.name || '')
      || tree.artifactRoot !== `providers/${providerId}/trees/${tree.name}`
      || typeof tree.destination !== 'string'
      || !tree.destination
      || tree.destination.includes('\\')
      || tree.destination.includes('\0')
      || isAbsolute(tree.destination)
      || tree.destination.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      add('GOV-PROVIDER-002', 'BLOCKER', `${label} record is open-shaped or invalid`)
      continue
    }
    const materializer = resolveSurfaceMaterializer('treeViews', tree.materializerId, `${label}.materializerId`)
    if (
      materializer?.engine !== 'closed-tree-copy-v1'
      || tree.transformPolicy !== 'byte-exact'
      || !materializer?.transformPolicies?.includes(tree.transformPolicy)
    ) {
      add('GOV-PROVIDER-002', 'BLOCKER', `${label} has an unsupported deterministic materializer`)
      continue
    }
    const source = manifestPath(forkRoot, tree.artifactRoot, `${label} artifact`)
    const destination = manifestPath(repo, tree.destination, `${label} destination`)
    if (!source || !destination) continue
    generatedProviderDestinations.add(resolve(destination))
    registerProviderPath(destination, 'tree')
    const lockedFiles = (corpusLock?.entries || [])
      .map((entry) => entry?.file)
      .filter((file) => typeof file === 'string' && file.startsWith(`${tree.artifactRoot}/`))
      .sort()
    const actualFiles = []
    const visitArtifact = (directory) => {
      if (!governancePathIsSafe(directory) || !pathEntryExists(directory)) return
      for (const name of readdirSync(directory).sort()) {
        const absolute = join(directory, name)
        const info = lstatSync(absolute)
        if (info.isDirectory() && !info.isSymbolicLink()) visitArtifact(absolute)
        else if (info.isFile() && !info.isSymbolicLink() && info.nlink === 1) actualFiles.push(relative(forkRoot, absolute).replaceAll('\\', '/'))
        else add('GOV-ADAPTER-005', 'BLOCKER', `${label} artifact contains an unsafe filesystem entry`)
      }
    }
    if (!pathEntryExists(source) || !lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) {
      add('GOV-ADAPTER-005', 'BLOCKER', `${label} artifact is missing or not a real directory`)
    } else visitArtifact(source)
    if (!actualFiles.length || JSON.stringify(actualFiles) !== JSON.stringify(lockedFiles)) {
      add('GOV-CORPUS-003', 'BLOCKER', `${label} artifact does not exactly match its corpus-lock inventory`)
    }
    assertTreeEqual('GOV-ADAPTER-005', label, destination, source)
    validTrees.push(tree)
  }
  if (
    JSON.stringify(surface.trees) !== JSON.stringify([...surface.trees].sort((left, right) => compareUtf8Bytes(left?.name, right?.name)))
    || new Set(surface.trees.map((tree) => tree?.name)).size !== surface.trees.length
    || new Set(surface.trees.map((tree) => tree?.destination)).size !== surface.trees.length
  ) add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} product managed trees must be sorted and unique by name/destination`)
  const expectedManagedTrees = [surface.skillDestination, ...validTrees.map((tree) => tree.destination)].sort()
  const actualManagedTrees = ownedManagedSurfaces.filter((managed) => managed.kind === 'tree').map((managed) => managed.path).sort()
  if (JSON.stringify(actualManagedTrees) !== JSON.stringify(expectedManagedTrees)) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} managed tree ownership does not exactly match skill plus product-tree artifacts`)
  }
}
if (manifest?.codex != null) {
  const compatibility = manifest.codex
  const matches = generatedSurfaces.filter(([, surface]) => (
    surface.instructionArtifact === compatibility.agentsMd
    && surface.instructionDestination === compatibility.instructionDestination
    && surface.hookDestination === compatibility.hookDestination
    && surface.skillDestination === compatibility.skillDestination
    && JSON.stringify(surface.skills) === JSON.stringify(compatibility.agentsSkills)
  ))
  if (matches.length !== 1) {
    add('GOV-CORPUS-001', 'BLOCKER', 'legacy Codex compatibility metadata does not bind exactly one active provider surface')
  } else {
    const [, sourceSurface] = matches[0]
    const compatibilityHook = compatibility.hookArtifact
      ? manifestPath(forkRoot, compatibility.hookArtifact, 'legacy Codex hook alias')
      : null
    const sourceHook = sourceSurface.hookArtifact
      ? manifestPath(forkRoot, sourceSurface.hookArtifact, 'legacy Codex hook source')
      : null
    if ((compatibilityHook || sourceHook) && (
      !compatibilityHook
      || !sourceHook
      || !isRegularFile(compatibilityHook)
      || !isRegularFile(sourceHook)
      || fileSha(compatibilityHook) !== fileSha(sourceHook)
    )) add('GOV-CORPUS-003', 'BLOCKER', 'legacy Codex hook alias differs from its active provider artifact')
    for (const name of compatibility.agentsSkills) {
      const alias = manifestPath(forkRoot, `${compatibility.skillArtifactRoot}/${name}`, `legacy Codex skill alias ${name}`)
      const source = manifestPath(forkRoot, `${sourceSurface.skillArtifactRoot}/${name}`, `legacy Codex skill source ${name}`)
      if (alias && source) assertTreeEqual('GOV-CORPUS-003', `legacy Codex skill alias ${name}`, alias, source)
    }
  }
}
const surfaceProviderIds = Object.keys(providerSurfaces || {}).sort()
const bomProviderIds = Object.keys(bom?.providers || {}).sort()
if (JSON.stringify(surfaceProviderIds) !== JSON.stringify(bomProviderIds)) {
  add('GOV-PROVIDER-002', 'BLOCKER', 'providerSurfaces inventory does not exactly match the immutable BOM provider inventory')
}
if (JSON.stringify(surfaceProviderIds) !== JSON.stringify(Object.keys(providerAdapters || {}).sort())) {
  add('GOV-PROVIDER-002', 'BLOCKER', 'providerSurfaces inventory does not exactly match the provider adapter inventory')
}
const providerArtifactDigests = bom?.payload?.providerArtifactDigests
if (
  !providerArtifactDigests
  || typeof providerArtifactDigests !== 'object'
  || Array.isArray(providerArtifactDigests)
  || JSON.stringify(Object.keys(providerArtifactDigests).sort()) !== JSON.stringify(surfaceProviderIds)
) add('GOV-BOM-004', 'BLOCKER', 'provider artifact digest map does not exactly match the signed provider inventory')
const lockedTreeDigest = (prefix) => sha256((corpusLock?.entries || [])
  .filter((entry) => typeof entry?.file === 'string' && entry.file.startsWith(`${prefix}/`))
  .map((entry) => `${entry.file}:${entry.sha256}`)
  .join('\n') + '\n')
for (const [providerId, surface] of Object.entries(providerSurfaces || {})) {
  const binding = providerArtifactDigests?.[providerId]
  if (
    !closedKeys(binding, ['hookSha256', 'instructionSha256', 'skillsSha256', 'treeDigests'])
    || !closedKeys(binding?.treeDigests, (surface.trees || []).map((tree) => tree.name))
  ) {
    add('GOV-BOM-004', 'BLOCKER', `${providerId} provider artifact digest binding is open-shaped or missing`)
    continue
  }
  const expected = {
    instructionSha256: surface.instructionArtifact && isRegularFile(join(forkRoot, surface.instructionArtifact))
      ? fileSha(join(forkRoot, surface.instructionArtifact))
      : null,
    hookSha256: surface.hookArtifact && isRegularFile(join(forkRoot, surface.hookArtifact))
      ? fileSha(join(forkRoot, surface.hookArtifact))
      : null,
    skillsSha256: surface.skillArtifactRoot ? lockedTreeDigest(surface.skillArtifactRoot) : null,
    treeDigests: Object.fromEntries((surface.trees || []).map((tree) => [tree.name, lockedTreeDigest(tree.artifactRoot)])),
  }
  if (JSON.stringify(binding) !== JSON.stringify(expected)) {
    add('GOV-BOM-004', 'BLOCKER', `${providerId} provider artifact digests differ from the installed locked corpus`)
  }
}
const retiredProviderIds = []
const retiredSurfacePaths = []
const activeOwnedSurfaces = [...managedSurfacesByProvider].flatMap(([providerId, surfaces]) => (
  surfaces.map((surface) => ({ ...surface, providerId }))
))
for (const retired of providerLifecycle?.retiredProviders || []) {
  const discovery = retired?.discovery
  const surfaces = retired?.surfaces
  const transfers = retired?.transfers || []
  if (
    !closedKeys(retired, [
      'id', 'replacementProviderId', 'retiredInVersion', 'reasonCode', 'discovery', 'surfaces',
      'priorReleaseVersion', 'priorSnapshotSha256', 'priorProviderSha256',
      ...(Object.hasOwn(retired || {}, 'transfers') ? ['transfers'] : []),
    ])
    || !/^[a-z][a-z0-9-]*$/.test(retired.id || '')
    || !(retired.replacementProviderId === null || /^[a-z][a-z0-9-]*$/.test(retired.replacementProviderId || ''))
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/.test(retired.retiredInVersion || '')
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/.test(retired.priorReleaseVersion || '')
    || !/^[a-f0-9]{64}$/.test(retired.priorSnapshotSha256 || '')
    || !/^[a-f0-9]{64}$/.test(retired.priorProviderSha256 || '')
    || (compareLifecycleSemver(retired.retiredInVersion, retired.priorReleaseVersion) ?? 0) <= 0
    || (compareLifecycleSemver(retired.retiredInVersion, providerLifecycle?.releaseVersion) ?? 1) > 0
    || !/^[A-Z][A-Z0-9_]*$/.test(retired.reasonCode || '')
    || !closedKeys(discovery, discoveryArrayKeys)
    || !Array.isArray(surfaces)
    || (Object.hasOwn(retired || {}, 'transfers') && (!Array.isArray(transfers) || !transfers.length))
    || (!surfaces?.length && !transfers.length)
  ) {
    add('GOV-LIFECYCLE-001', 'BLOCKER', `retired provider record is open-shaped or invalid:${retired?.id || '<unknown>'}`)
    continue
  }
  retiredProviderIds.push(retired.id)
  const priorSurfaces = [
    ...retired.surfaces.map((surface) => ({ path: surface?.path, kind: surface?.kind })),
    ...transfers.map((surface) => ({ path: surface?.path, kind: surface?.kind })),
  ].sort((left, right) => compareUtf8Bytes(left.path, right.path))
  if (sha256(JSON.stringify({
    id: retired.id,
    discovery: retired.discovery,
    surfaces: priorSurfaces,
  })) !== retired.priorProviderSha256) {
    add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} retirement proof does not bind its previous managed provider inventory`)
  }
  if (surfaceProviderIds.includes(retired.id)) add('GOV-LIFECYCLE-001', 'BLOCKER', `retired provider remains active:${retired.id}`)
  const replacementSurfaces = retired.replacementProviderId === null
    ? null
    : managedSurfacesByProvider.get(retired.replacementProviderId)
  if (retired.replacementProviderId !== null && (!replacementSurfaces || retired.replacementProviderId === retired.id)) {
    add('GOV-LIFECYCLE-001', 'BLOCKER', `replacementProviderId must name a distinct active current provider:${retired.id}:${retired.replacementProviderId}`)
  }
  if (retired.replacementProviderId === null && transfers.length) {
    add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} null replacementProviderId cannot transfer surfaces`)
  }
  for (const key of discoveryArrayKeys) {
    const values = discovery[key]
    if (!Array.isArray(values) || JSON.stringify(values) !== JSON.stringify([...new Set(values || [])].sort())) {
      add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} retired discovery ${key} must be sorted and unique`)
      continue
    }
    if (values.some((value) => !discoveryInventory[key].includes(value))) {
      add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} retired discovery ${key} is not reserved by the signed discovery policy`)
    }
  }
  const canonicalSurfaces = [...surfaces].sort((left, right) => compareUtf8Bytes(left?.path, right?.path))
  if (JSON.stringify(surfaces) !== JSON.stringify(canonicalSurfaces)) {
    add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} retired surfaces must be sorted by path`)
  }
  const canonicalTransfers = [...transfers].sort((left, right) => compareUtf8Bytes(left?.path, right?.path))
  if (JSON.stringify(transfers) !== JSON.stringify(canonicalTransfers)) {
    add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} transferred surfaces must be sorted by path`)
  }
  const partitionPaths = [...surfaces, ...transfers].map((surface) => surface?.path)
  if (partitionPaths.length !== new Set(partitionPaths).size) {
    add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} deletion/transfer partition contains a duplicate surface path`)
  }
  for (const surface of surfaces) {
    if (!closedKeys(surface, ['path', 'kind', 'sha256']) || !['file', 'tree'].includes(surface.kind) || !/^[a-f0-9]{64}$/.test(surface.sha256 || '')) {
      add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} retired surface is open-shaped or invalid`)
      continue
    }
    const destination = manifestPath(repo, surface.path, `${retired.id} retired surface`)
    if (!destination) continue
    if (['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'LICENSE.md'].includes(surface.path)) {
      add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} tombstone targets a protected product document:${surface.path}`)
    }
    if (commonInstruction?.destination && pathsOverlap(surface.path, commonInstruction.destination)) {
      add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} provider tombstone targets the common instruction authority:${surface.path}`)
    }
    retiredSurfacePaths.push(surface.path)
    if (activeOwnedSurfaces.some((candidate) => pathsOverlap(candidate.path, surface.path))) {
      add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} deletion tombstone remains owned by an active provider:${surface.path}`)
    }
    if (pathEntryExists(destination)) add('GOV-LIFECYCLE-001', 'BLOCKER', `retired provider surface has not converged to absent:${surface.path}`)
  }
  for (const surface of transfers) {
    if (!closedKeys(surface, ['path', 'kind']) || !['file', 'tree'].includes(surface.kind)) {
      add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} transferred surface is open-shaped or invalid`)
      continue
    }
    const destination = manifestPath(repo, surface.path, `${retired.id} transferred surface`)
    if (!destination) continue
    if (['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'LICENSE.md'].includes(surface.path)) {
      add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} transfer targets a protected product document:${surface.path}`)
    }
    if (!replacementSurfaces?.some((candidate) => candidate.path === surface.path && candidate.kind === surface.kind)) {
      add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} transfer is not exactly owned by replacement ${retired.replacementProviderId}:${surface.path}`)
    }
    if (activeOwnedSurfaces.some((candidate) => candidate.providerId !== retired.replacementProviderId && pathsOverlap(candidate.path, surface.path))) {
      add('GOV-LIFECYCLE-001', 'BLOCKER', `${retired.id} transfer is also owned by a non-replacement provider:${surface.path}`)
    }
  }
}
if (
  JSON.stringify(retiredProviderIds) !== JSON.stringify([...new Set(retiredProviderIds)].sort())
  || retiredSurfacePaths.length !== new Set(retiredSurfacePaths).size
) add('GOV-LIFECYCLE-001', 'BLOCKER', 'retired provider ids and tombstone paths must be globally unique and sorted')
for (const [providerId, surface] of Object.entries(providerSurfaces || {})) {
  const declaration = bom?.providers?.[providerId]
  if (
    !closedKeys(declaration, ['schemaVersion', 'generated', 'instruction', 'hooks', 'skills', 'capabilities', 'exclusions'])
    || declaration.schemaVersion !== 1
    || !closedKeys(declaration.capabilities, ['nativeHooks', 'hookEnforcement', 'hardGate'])
  ) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} immutable BOM provider record is open-shaped or unknown-versioned`)
    continue
  }
  if (declaration.generated !== Boolean(surface?.generated)) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} generated/disabled state differs from the immutable BOM`)
    continue
  }
  if (JSON.stringify(declaration.capabilities) !== JSON.stringify(surface.capabilities)) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} provider capability differs from the immutable BOM`)
  }
  const instructionName = typeof declaration.instruction === 'string' ? declaration.instruction.replaceAll('\\', '/').split('/').at(-1) : null
  if (!instructionName || !discoveryInventory.instructionNames.includes(instructionName)) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} instruction is not reserved by the signed discovery policy`)
  }
  if (typeof declaration.hooks === 'string' && !discoveryInventory.configPaths.includes(declaration.hooks)) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} hook config is not reserved by the signed discovery policy`)
  }
  for (const [kind, value] of [['instruction', declaration.instruction], ['hooks', declaration.hooks], ['skills', declaration.skills]]) {
    if (typeof value !== 'string') continue
    const root = value.replaceAll('\\', '/').split('/')[0]
    if (root.startsWith('.') && !discoveryInventory.providerRootNames.includes(root)) {
      add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} ${kind} root ${root} is not reserved by the signed discovery policy`)
    }
  }
  if (surface.generated) {
    if (
      declaration.instruction !== surface.instructionDestination
      || declaration.hooks !== surface.hookDestination
      || declaration.skills !== surface.skillDestination
    ) add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} destination binding differs from the immutable BOM`)
    continue
  }
  if (JSON.stringify(declaration.exclusions || []) !== JSON.stringify(surface.exclusions || [])) {
    add('GOV-PROVIDER-002', 'BLOCKER', `${providerId} disabled-provider exclusions differ from the immutable BOM`)
  }
  for (const [kind, value] of [['instruction', declaration.instruction], ['hook', declaration.hooks], ['skill', declaration.skills]]) {
    if (typeof value !== 'string' || !value) continue
    const destination = manifestPath(repo, value, `${providerId} disabled ${kind} destination`)
    if (!destination || generatedProviderDestinations.has(resolve(destination))) continue
    registerProviderRootOnly(destination)
    if (pathEntryExists(destination)) {
      add('GOV-EXTENSION-001', 'BLOCKER', `${providerId} is disabled but its undeclared ${kind} surface exists at ${value}`)
    }
  }
}
if (!generatedSurfaces.length) add('GOV-PROVIDER-001', 'BLOCKER', 'providerSurfaces has no generated provider adapter')

const rawManagedLaunchers = manifest?.launchers || manifest?.codex?.hooksJson || []
const managedLaunchers = Array.isArray(rawManagedLaunchers)
  ? rawManagedLaunchers.filter((name) => typeof name === 'string' && /^[A-Za-z0-9._-]+\.(?:sh|mjs|py)$/.test(name))
  : []
if (
  JSON.stringify(rawManagedLaunchers) !== JSON.stringify([...new Set(managedLaunchers)].sort())
  || managedLaunchers.length === 0
) add('GOV-CORPUS-001', 'BLOCKER', 'installed manifest launcher inventory must be non-empty, safe, unique, and sorted')
// Claude commands and subagent definitions are package-owned discovery leaves too. Keep the
// directory closed even while today's classified sets are empty: a later release may add an exact
// file without requiring the checker to open the entire directory to consumer-owned content.
const materialization = manifest?.consumer?.materialization
const materializationExactPaths = materialization?.exactPaths
const materializationPathPrefixes = materialization?.pathPrefixes
if (
  !closedKeys(materialization, ['exactPaths', 'pathPrefixes'])
  || !Array.isArray(materializationExactPaths)
  || !Array.isArray(materializationPathPrefixes)
) add('GOV-CORPUS-001', 'BLOCKER', 'installed manifest has no closed consumer materialization inventory')
const canonicalMaterializationPath = (value, prefix) => {
  if (
    typeof value !== 'string'
    || !value
    || value.includes('\\')
    || value.includes('\0')
    || isAbsolute(value)
    || (prefix ? !value.endsWith('/') : value.endsWith('/'))
  ) return null
  const path = prefix ? value.slice(0, -1) : value
  const segments = path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..') || segments[0] === '.git') return null
  return value
}
const materializationInventory = (values, prefix, label) => {
  const valid = (values || []).map((value) => canonicalMaterializationPath(value, prefix)).filter(Boolean)
  const canonical = [...new Set(valid)].sort()
  if (JSON.stringify(values || []) !== JSON.stringify(canonical)) {
    add('GOV-CORPUS-001', 'BLOCKER', `consumer materialization ${label} must be safe, unique, and sorted`)
  }
  return canonical
}
const exactMaterializationPaths = materializationInventory(materializationExactPaths, false, 'exactPaths')
const prefixMaterializationPaths = materializationInventory(materializationPathPrefixes, true, 'pathPrefixes')
const exactMaterializationSet = new Set(exactMaterializationPaths)
const expectedProviderPrefixes = generatedSurfaces.flatMap(([, surface]) => [
  ...(surface.skills || []).map((name) => `${surface.skillDestination}/${name}/`),
  ...(surface.trees || []).map((tree) => `${tree.destination}/`),
]).sort()
if (JSON.stringify(prefixMaterializationPaths) !== JSON.stringify(expectedProviderPrefixes)) {
  add('GOV-CORPUS-001', 'BLOCKER', 'consumer path-prefix materialization inventory does not exactly match provider skill and product-tree surfaces')
}
if (
  !commonInstruction?.destination
  || exactMaterializationPaths.filter((path) => path === commonInstruction.destination).length !== 1
  || !(corpusLock?.entries || []).some((entry) => entry?.file === commonInstruction.artifact)
) add('GOV-CORPUS-001', 'BLOCKER', 'common instruction must have exactly one locked artifact and one consumer destination')
const materializationAllows = (relativePath, directory) => {
  if (exactMaterializationSet.has(relativePath) || prefixMaterializationPaths.some((prefix) => relativePath.startsWith(prefix))) return true
  if (!directory) return false
  const descendantPrefix = `${relativePath}/`
  return exactMaterializationPaths.some((path) => path.startsWith(descendantPrefix))
    || prefixMaterializationPaths.some((path) => path.startsWith(descendantPrefix))
}
const compatibilityCategories = manifest?.consumer?.compatibilityCategories
const compatibilityFileSurfacesByProvider = new Map()
if (!Array.isArray(compatibilityCategories)) {
  add('GOV-CORPUS-001', 'BLOCKER', 'installed compatibility category inventory must be an array')
} else {
  const categoryNames = compatibilityCategories.map((category) => category?.name)
  if (JSON.stringify(categoryNames) !== JSON.stringify([...new Set(categoryNames)].sort())) {
    add('GOV-CORPUS-001', 'BLOCKER', 'installed compatibility categories must be sorted and unique by name')
  }
  for (const category of compatibilityCategories) {
    if (
      !closedKeys(category, ['artifactRoot', 'destinationRoot', 'entries', 'name', 'providerId', 'schemaVersion'])
      || category.schemaVersion !== 1
      || !['agents', 'commands'].includes(category.name)
      || !/^[a-z][a-z0-9-]*$/.test(category.providerId || '')
      || !Array.isArray(category.entries)
    ) {
      add('GOV-CORPUS-001', 'BLOCKER', 'installed compatibility category record is open-shaped or invalid')
      continue
    }
    const artifactRoot = canonicalMaterializationPath(category.artifactRoot, false)
    const destinationRoot = canonicalMaterializationPath(category.destinationRoot, false)
    const entries = category.entries.filter((name) => /^[A-Za-z0-9][A-Za-z0-9_.@-]*\.md$/.test(name))
    if (
      !artifactRoot
      || !destinationRoot
      || JSON.stringify(category.entries) !== JSON.stringify([...new Set(entries)].sort())
      || JSON.stringify(manifest?.[category.name]) !== JSON.stringify(category.entries)
    ) {
      add('GOV-CORPUS-001', 'BLOCKER', `compatibility category ${category.name} has an unsafe or divergent inventory`)
      continue
    }
    const ownerSurfaces = managedSurfacesByProvider.get(category.providerId)
    if (!ownerSurfaces) add('GOV-PROVIDER-002', 'BLOCKER', `compatibility category ${category.name} has no active provider owner`)
    for (const name of entries) {
      const artifactPath = `${artifactRoot}/${name}`
      const destinationPath = `${destinationRoot}/${name}`
      const providerFiles = compatibilityFileSurfacesByProvider.get(category.providerId) || []
      providerFiles.push({ path: destinationPath, kind: 'file' })
      compatibilityFileSurfacesByProvider.set(category.providerId, providerFiles)
      if (!(corpusLock?.entries || []).some((entry) => entry?.file === artifactPath)) {
        add('GOV-CORPUS-003', 'BLOCKER', `compatibility category artifact is absent from corpus lock:${artifactPath}`)
      }
      if (!exactMaterializationSet.has(destinationPath)) {
        add('GOV-CORPUS-001', 'BLOCKER', `compatibility category destination is absent from exact materialization:${destinationPath}`)
      }
      if (!ownerSurfaces?.some((surface) => surface.path === destinationPath && surface.kind === 'file')) {
        add('GOV-PROVIDER-002', 'BLOCKER', `compatibility category destination is absent from provider lifecycle ownership:${destinationPath}`)
      }
      const artifact = manifestPath(forkRoot, artifactPath, `compatibility category ${category.name} artifact ${name}`)
      const destination = manifestPath(repo, destinationPath, `compatibility category ${category.name} destination ${name}`)
      if (!artifact || !destination) continue
      generatedProviderDestinations.add(resolve(destination))
      registerProviderPath(destination, 'file')
      assertTreeEqual('GOV-ADAPTER-005', `compatibility category ${category.name} ${name}`, destination, artifact)
    }
  }
  for (const name of ['agents', 'commands']) if (
    !compatibilityCategories.some((category) => category.name === name)
    && (manifest?.[name] || []).length
  ) add('GOV-CORPUS-001', 'BLOCKER', `legacy ${name} inventory has no active compatibility category owner`)
}
const activeLifecycleProviderIds = generatedSurfaces.map(([providerId]) => providerId).sort()
const currentSnapshotProviderIds = currentSnapshot?.providers?.map((provider) => provider.id) || []
if (currentSnapshot && JSON.stringify(currentSnapshotProviderIds) !== JSON.stringify(activeLifecycleProviderIds)) {
  lifecycleProblem('current provider snapshot ids do not exactly match active generated provider surfaces')
}
const currentSnapshotProvidersById = new Map((currentSnapshot?.providers || []).map((provider) => [provider.id, provider]))
for (const [providerId, surface] of generatedSurfaces) {
  const currentProvider = currentSnapshotProvidersById.get(providerId)
  const actualManagedSurfaces = managedSurfacesByProvider.get(providerId) || []
  if (!currentProvider || JSON.stringify(currentProvider.surfaces) !== JSON.stringify(actualManagedSurfaces)) {
    lifecycleProblem(`${providerId} current snapshot managed surfaces do not exactly match the installed provider surface inventory`)
  }

  const instructionEngine = providerMaterializers?.instructionViews?.[surface.instructionMaterializerId]?.engine
  const expectedManagedFiles = [
    ...(instructionEngine === 'shared-instruction-v1' ? [] : [{ path: surface.instructionDestination, kind: 'file' }]),
    ...(typeof surface.hookDestination === 'string' ? [{ path: surface.hookDestination, kind: 'file' }] : []),
    ...(compatibilityFileSurfacesByProvider.get(providerId) || []),
  ].sort((left, right) => compareUtf8Bytes(left.path, right.path))
  const actualManagedFiles = actualManagedSurfaces
    .filter((managed) => managed.kind === 'file')
    .sort((left, right) => compareUtf8Bytes(left.path, right.path))
  if (JSON.stringify(actualManagedFiles) !== JSON.stringify(expectedManagedFiles)) {
    add(
      'GOV-PROVIDER-002',
      'BLOCKER',
      `${providerId} managed file ownership must exactly equal its non-shared instruction, hook config, and compatibility-category leaves`,
    )
  }
}
const mergeSurfaces = generatedSurfaces.filter(([providerId]) => surfaceHookMaterializers.get(providerId)?.mergeStrategy === 'merge-hook-map-into-base-v1')
const mergePolicy = readJson(manifestPath(forkRoot, 'launchers/settings-hooks.json', 'provider hook merge policy'), 'GOV-ADAPTER-001')
const mergeProviderIds = mergeSurfaces.map(([providerId]) => providerId).sort()
const mergePolicyProviderIds = Object.keys(mergePolicy?.surfaces || {}).sort()
const mergeDigestProviderIds = Object.keys(bom?.payload?.mergeSurfaceDigests || {}).sort()
if (
  !closedKeys(mergePolicy, ['_generated', 'kind', 'schemaVersion', 'sourceDigest', 'surfaces'])
  || mergePolicy?._generated !== 'build-fork-governance.mjs'
  || mergePolicy?.kind !== 'provider-hook-merge-policies'
  || mergePolicy?.schemaVersion !== 1
  || !/^[a-f0-9]{64}$/.test(mergePolicy?.sourceDigest || '')
  || JSON.stringify(mergePolicyProviderIds) !== JSON.stringify(mergeProviderIds)
  || JSON.stringify(mergeDigestProviderIds) !== JSON.stringify(mergeProviderIds)
) add('GOV-ADAPTER-001', 'BLOCKER', 'provider hook merge policy/BOM inventory does not exactly match every merge-capable provider')
for (const [providerId, surface] of mergeSurfaces) {
  const materializer = surfaceHookMaterializers.get(providerId)
  const baseTemplate = providerMaterializers?.hookBaseTemplateContracts?.[materializer?.baseTemplateContract]
  const policy = mergePolicy?.surfaces?.[providerId]
  if (
    materializer?.engine !== 'json-hook-map-v1'
    || !closedKeys(policy, [
      'baseTemplateContract', 'hookArtifact', 'hookDestination', 'hookMaterializerId', 'mergeStrategy',
      'permissionPolicy', 'retiredHookRegistrations', 'schemaVersion',
    ])
    || policy.schemaVersion !== 1
    || policy.hookArtifact !== surface.hookArtifact
    || policy.hookDestination !== surface.hookDestination
    || policy.hookMaterializerId !== surface.hookMaterializerId
    || policy.mergeStrategy !== materializer.mergeStrategy
    || policy.baseTemplateContract !== materializer.baseTemplateContract
    || !baseTemplate
  ) {
    add('GOV-ADAPTER-004', 'BLOCKER', `${providerId} template-backed hook materializer is unsupported by the closed merge runtime`)
    continue
  }
  const settings = installedSurfaceHookConfigs.get(providerId)
  const canonicalConfig = surfaceHookConfigs.get(providerId)
  const hookArtifact = manifestPath(forkRoot, surface.hookArtifact, `${providerId} canonical hook artifact`)
  if (!hookArtifact || bom?.payload?.mergeSurfaceDigests?.[providerId] !== fileSha(hookArtifact)) {
    add('GOV-ADAPTER-003', 'BLOCKER', `${providerId} canonical merge surface digest != immutable governance BOM`)
  }
  if (JSON.stringify(settings?.[materializer.hooksField] || {}) !== JSON.stringify(canonicalConfig?.[materializer.hooksField] || {})) {
    add('GOV-EXTENSION-001', 'BLOCKER', `${providerId} native hook wiring contains an undeclared executable extension; product policy belongs in governance/overlay.md`)
  }
  if (!Array.isArray(policy.retiredHookRegistrations)) {
    add('GOV-ADAPTER-004', 'BLOCKER', `${providerId} retired hook registration policy is invalid`)
  } else {
    const ids = []
    const paths = []
    for (const record of policy.retiredHookRegistrations) {
      if (
        !closedKeys(record, ['id', 'path', 'provider', 'reasonCode'])
        || record.provider !== providerId
        || !/^[a-z][a-z0-9-]*$/.test(record.id || '')
        || !/^[A-Z][A-Z0-9_]*$/.test(record.reasonCode || '')
        || !canonicalMaterializationPath(record.path, false)
      ) add('GOV-ADAPTER-004', 'BLOCKER', `${providerId} retired hook registration policy is invalid`)
      ids.push(record.id)
      paths.push(record.path)
      if (JSON.stringify(settings || {}).includes(JSON.stringify(record.path).slice(1, -1))) {
        add('GOV-ADAPTER-005', 'BLOCKER', `${providerId} settings still reference retired hook registration ${record.id}`)
      }
    }
    if (JSON.stringify(ids) !== JSON.stringify([...ids].sort()) || new Set(paths).size !== paths.length) {
      add('GOV-ADAPTER-004', 'BLOCKER', `${providerId} retired hook registrations must be sorted and path-unique`)
    }
  }
  const specializedBaseFields = baseTemplate.engine === 'claude-permission-policy-v1'
    ? ['permissions']
    : []
  for (const [key, value] of Object.entries(canonicalConfig || {})) {
    if ([materializer.hooksField, ...specializedBaseFields].includes(key)) continue
    if (JSON.stringify(settings?.[key]) !== JSON.stringify(value)) {
      add('GOV-ADAPTER-005', 'BLOCKER', `${providerId} base-template field ${key} differs from its canonical projection`)
    }
  }
  if (baseTemplate.engine === 'claude-permission-policy-v1') {
    const permissionPolicy = policy.permissionPolicy
    const canonicalPermissions = canonicalConfig?.permissions
    const installedPermissions = settings?.permissions
    if (
      !closedKeys(permissionPolicy, ['retiredPermissionAllow', 'sha256', 'source'])
      || permissionPolicy.source !== baseTemplate.source
      || !/^[a-f0-9]{64}$/.test(permissionPolicy.sha256 || '')
      || !Array.isArray(permissionPolicy.retiredPermissionAllow)
      || !permissionPolicy.retiredPermissionAllow.length
      || permissionPolicy.retiredPermissionAllow.some((rule) => typeof rule !== 'string' || !/^Bash\(.+\)$/.test(rule))
      || !canonicalPermissions
      || !installedPermissions
      || Object.hasOwn(canonicalConfig, 'disableAutoMode')
      || Object.hasOwn(settings || {}, 'disableAutoMode')
      || canonicalPermissions.defaultMode !== installedPermissions.defaultMode
      || canonicalPermissions.disableBypassPermissionsMode !== installedPermissions.disableBypassPermissionsMode
      || !Array.isArray(installedPermissions.allow)
      || !Array.isArray(installedPermissions.ask)
      || !Array.isArray(installedPermissions.deny)
      || installedPermissions.allow.some((rule) => (
        typeof rule !== 'string'
        || installedPermissions.ask.includes(rule)
        || installedPermissions.deny.includes(rule)
      ))
      || installedPermissions.ask.some((rule) => typeof rule !== 'string')
      || installedPermissions.deny.some((rule) => typeof rule !== 'string')
      || (canonicalPermissions.allow || []).some((rule) => !installedPermissions.allow.includes(rule))
      || (canonicalPermissions.ask || []).some((rule) => !installedPermissions.ask.includes(rule))
      || (canonicalPermissions.deny || []).some((rule) => !installedPermissions.deny.includes(rule))
      || permissionPolicy.retiredPermissionAllow.some((rule) => installedPermissions.allow.includes(rule))
      || Object.hasOwn(installedPermissions, 'disableAutoMode')
      || Object.hasOwn(settings || {}, 'defaultMode')
    ) add('GOV-ADAPTER-005', 'BLOCKER', `${providerId} permission base was not safely materialized from its registered contract`)
  } else if (policy.permissionPolicy !== null) {
    add('GOV-ADAPTER-004', 'BLOCKER', `${providerId} non-permission base template claims a permission policy`)
  }
}

const canonicalEventSurfaces = generatedSurfaces
  .map(([providerId, surface]) => {
    const config = surfaceHookConfigs.get(providerId)
    const materializer = surfaceHookMaterializers.get(providerId)
    const rawNativeEvents = !surface.capabilities.nativeHooks
      ? []
      : materializer?.engine === 'json-hook-map-v1'
      ? Object.keys(config?.[materializer.hooksField] || {})
      : materializer?.engine === 'json-hook-event-list-v1'
        ? (config?.[materializer.eventsField] || []).map((record) => record?.[materializer.eventField]).filter((event) => typeof event === 'string')
        : []
    const bindings = surfaceNativeEventBindings.get(providerId) || []
    const canonicalEvents = bindings.map((record) => record.canonicalEvent)
    return [providerId, canonicalEvents, [...new Set(rawNativeEvents)].sort(), rawNativeEvents.length !== new Set(rawNativeEvents).size, surface.nativeHookCoverage]
  })
const canonicalEventsByProvider = new Map(canonicalEventSurfaces.map(([providerId, events]) => [providerId, events]))
const nativeEventsByProvider = new Map(canonicalEventSurfaces.map(([providerId, , nativeEvents]) => [providerId, nativeEvents]))
const productEventBaseline = canonicalEventSurfaces[0]?.[4]?.canonicalEvents || []
for (const [providerId, events, nativeEvents, duplicateNativeEvents, coverage] of canonicalEventSurfaces) {
  if (JSON.stringify(coverage?.canonicalEvents || []) !== JSON.stringify(productEventBaseline)) {
    add('GOV-PROVIDER-001', 'BLOCKER', `${providerId} product hook event authority differs from the signed provider baseline`)
  }
  if (JSON.stringify(events) !== JSON.stringify(coverage?.projectedEvents || [])) {
    add('GOV-PROVIDER-001', 'BLOCKER', `${providerId} projected native hook events differ from its machine-readable coverage record`)
  }
  if (duplicateNativeEvents || JSON.stringify(nativeEvents) !== JSON.stringify((coverage?.projectedNativeEvents || []).map((record) => record.nativeEvent).sort())) {
    add('GOV-PROVIDER-001', 'BLOCKER', `${providerId} native hook configuration event identifiers differ from its canonical-to-native bindings`)
  }
}

const launcherDestination = manifest?.consumer?.launcherDestination
const launcherRootName = typeof launcherDestination === 'string' ? launcherDestination.replaceAll('\\', '/').split('/')[0] : null
if (
  typeof launcherDestination !== 'string'
  || !launcherDestination
  || discoveryInventory.providerRootNames.includes(launcherRootName)
  || discoveryInventory.pluginRootNames.includes(launcherRootName)
) add('GOV-ADAPTER-005', 'BLOCKER', 'shared launcher destination must be provider-neutral and outside every provider discovery root')
const committedLauncherRoot = manifestPath(repo, launcherDestination, 'shared launcher destination')
if (committedLauncherRoot) canonicalReplayExcludedRoots.add(resolve(committedLauncherRoot))
const launcherLifecycleOwners = generatedSurfaces.filter(([, surface]) => (surface.managedSurfaces || []).some((managed) => (
  managed.path === launcherDestination
  || managed.path.startsWith(`${launcherDestination}/`)
  || launcherDestination?.startsWith(`${managed.path}/`)
)))
if (launcherLifecycleOwners.length) {
  add('GOV-ADAPTER-005', 'BLOCKER', `shared launcher substrate is incorrectly owned by provider lifecycle:${launcherLifecycleOwners.map(([id]) => id).join(',')}`)
}
const expectedLauncherDestinations = managedLaunchers.map((launcher) => `${launcherDestination}/${launcher}`).sort()
const actualLauncherDestinations = exactMaterializationPaths
  .filter((path) => managedLaunchers.some((launcher) => path.endsWith(`/${launcher}`)))
  .sort()
if (JSON.stringify(actualLauncherDestinations) !== JSON.stringify(expectedLauncherDestinations)) {
  add('GOV-CORPUS-001', 'BLOCKER', 'shared launchers must have exactly one provider-neutral materialization destination')
}
for (const launcher of managedLaunchers) {
  const committed = committedLauncherRoot ? join(committedLauncherRoot, launcher) : null
  const shipped = join(forkRoot, 'launchers', launcher)
  if (!committed || !isRegularFile(committed) || !isRegularFile(shipped) || fileSha(committed) !== fileSha(shipped)) add('GOV-ADAPTER-005', 'BLOCKER', `shared thin adapter drift: ${launcher}`)
  if (!exactMaterializationSet.has(`${launcherDestination}/${launcher}`)) {
    add('GOV-CORPUS-001', 'BLOCKER', `shared launcher is absent from consumer materialization inventory:${launcher}`)
  }
}
if (!committedLauncherRoot || !repositoryPathIsSafe(committedLauncherRoot) || !pathEntryExists(committedLauncherRoot) || !lstatSync(committedLauncherRoot).isDirectory()) {
  add('GOV-EXTENSION-001', 'BLOCKER', 'provider-neutral shared launcher directory is missing or unsafe')
} else {
  const actualLaunchers = readdirSync(committedLauncherRoot).sort()
  const expectedLaunchers = [...managedLaunchers].sort()
  if (JSON.stringify(actualLaunchers) !== JSON.stringify(expectedLaunchers)) {
    add('GOV-EXTENSION-001', 'BLOCKER', 'undeclared files are forbidden in the shared launcher directory; executable extensions must be promoted through the provider-neutral package SSOT')
  }
}

const managedSharedSkills = manifest?.skills || []
for (const [providerId, surface] of generatedSurfaces) {
  const skillRoot = manifestPath(repo, surface.skillDestination, `${providerId} skill destination`)
  if (!skillRoot || !repositoryPathIsSafe(skillRoot) || !pathEntryExists(skillRoot) || !lstatSync(skillRoot).isDirectory()) {
    add('GOV-SKILL-004', 'BLOCKER', `${providerId} skill directory is missing or unsafe`)
    continue
  }
  const actualEntries = readdirSync(skillRoot).sort()
  const expectedEntries = [...new Set(surface.skills || [])].sort()
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    add('GOV-SKILL-004', 'BLOCKER', `${providerId} skill directory contains undeclared executable content; extensions must be promoted through the provider-neutral package SSOT`)
  }
}
if (bom?.payload?.sharedSkillCount !== managedSharedSkills.length) add('GOV-SKILL-003', 'BLOCKER', `managed shared skill count ${managedSharedSkills.length} != BOM ${bom?.payload?.sharedSkillCount}`)
const lockedSharedSkills = (corpusLock?.entries || []).filter((entry) => entry.file.startsWith('skills/')).map((entry) => `${entry.file}:${entry.sha256}`).sort()
if (bom?.payload?.sharedSkillsSha256 !== sha256(lockedSharedSkills.join('\n') + '\n')) add('GOV-SKILL-003', 'BLOCKER', 'shared skill aggregate digest != governance BOM')

// Provider runtimes create local, git-ignored state directly below their discovery root:
// Claude Code's .cc-writes write journal and the governance dispatcher's telemetry logs
// (template/ds-product-template/.gitignore already declares .claude/logs/ as runtime noise;
// both are empirically present in live consumer repos). They are not instruction/config/skill/
// command/agent/hook discovery surfaces, and every executable/discovery class above stays
// digest-closed, so skipping these exact direct children of the Claude root cannot open an
// unsigned policy or execution surface. Symlink and plain-file impostors still fail below.
const claudeRuntimeStateNames = new Set(['.cc-writes', 'logs'])
for (const [providerRoot, plan] of providerRootPlans) {
  if (!pathEntryExists(providerRoot)) continue
  if (!repositoryPathIsSafe(providerRoot) || lstatSync(providerRoot).isSymbolicLink() || !lstatSync(providerRoot).isDirectory()) {
    add('GOV-EXTENSION-001', 'BLOCKER', `provider-native root must be a real directory:${relative(repo, providerRoot)}`)
    continue
  }
  const providerRootIsClaude = relative(repo, providerRoot) === '.claude'
  const leaves = [...plan.files, ...plan.trees]
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = resolve(directory, name)
      const info = lstatSync(absolute)
      const rel = relative(repo, absolute).replaceAll('\\', '/')
      if (info.isSymbolicLink()) {
        add('GOV-EXTENSION-001', 'BLOCKER', `provider-native surface contains an undeclared symlink:${rel}`)
        continue
      }
      if (providerRootIsClaude && directory === providerRoot && info.isDirectory() && claudeRuntimeStateNames.has(name)) continue
      if (plan.files.has(absolute)) {
        if (!info.isFile()) add('GOV-EXTENSION-001', 'BLOCKER', `provider-native managed file has the wrong type:${rel}`)
        continue
      }
      if (plan.trees.has(absolute)) {
        if (!info.isDirectory()) add('GOV-EXTENSION-001', 'BLOCKER', `provider-native managed tree has the wrong type:${rel}`)
        else visit(absolute)
        continue
      }
      const isManagedAncestor = leaves.some((leaf) => leaf.startsWith(`${absolute}${sep}`))
      if (isManagedAncestor && info.isDirectory()) visit(absolute)
      else if (materializationAllows(rel, info.isDirectory())) {
        if (info.isDirectory()) visit(absolute)
        else if (!info.isFile() || info.nlink !== 1) add('GOV-EXTENSION-001', 'BLOCKER', `provider-native materialization is not one regular file:${rel}`)
      } else add('GOV-EXTENSION-001', 'BLOCKER', `undeclared provider-native executable/discovery surface:${rel}`)
    }
  }
  visit(providerRoot)
}

// Repository-level provider discovery is also closed. Codex and Claude can discover instruction,
// config and MCP files below the repository root, so hashing only the root projections would still
// leave a second policy/tool SSOT in an application subdirectory. Provider roots already verified
// above (including authenticated skill trees) are skipped; generated/build dependency trees are
// non-source and intentionally excluded from this discovery walk.
const managedProviderRoots = new Set([...providerRootPlans.keys()].map((path) => resolve(path)))
const reservedProviderRootNames = new Set([
  ...discoveryInventory.providerRootNames,
  ...discoveryInventory.pluginRootNames,
])
const canonicalInstructionDestinations = new Set(generatedSurfaces
  .map(([, surface]) => surface?.instructionDestination)
  .filter((path) => typeof path === 'string' && path)
  .map((path) => resolve(repo, path)))
const reservedInstructionNames = new Set(discoveryInventory.instructionNames)
const overrideInstructionNames = new Set(discoveryInventory.instructionOverrideNames)
const reservedConfigPaths = [...discoveryInventory.configPaths]
const canonicalConfigDestinations = new Set(generatedSurfaces
  .map(([, surface]) => surface?.hookDestination)
  .filter((path) => typeof path === 'string' && path)
  .map((path) => resolve(repo, path)))
const matchedDiscoveryConfig = (rel, name) => reservedConfigPaths.find((path) => path.includes('/')
  ? rel === path || rel.endsWith(`/${path}`)
  : name === path)
const reservedDiscoveryLeaf = (rel, name) => (
  reservedInstructionNames.has(name)
  || overrideInstructionNames.has(name)
  || Boolean(matchedDiscoveryConfig(rel, name))
)
const visitDiscoverySurfaces = (directory) => {
  const names = readdirIfReadable(directory)
  if (!names) return
  for (const name of names.sort()) {
    const absolute = resolve(directory, name)
    const rel = relative(repo, absolute).replaceAll('\\', '/')
    const info = lstatIfReadable(absolute)
    if (!info) {
      // Reserved provider discovery surfaces must stay verifiable; only non-reserved names degrade.
      if (reservedProviderRootNames.has(name) || reservedDiscoveryLeaf(rel, name)) {
        add('GOV-EXTENSION-001', 'BLOCKER', `provider discovery surface is unreadable and cannot be verified:${rel}`)
      }
      continue
    }
    if (info.isSymbolicLink()) {
      if (reservedProviderRootNames.has(name) || reservedDiscoveryLeaf(rel, name)) {
        add('GOV-SYMLINK-001', 'BLOCKER', `provider discovery surface is a symbolic-link alias:${rel}`)
      }
      continue
    }
    if (info.isDirectory()) {
      if (managedProviderRoots.has(absolute) || discoveryTraversalExcludedRoots.has(absolute)) continue
      if (reservedProviderRootNames.has(name)) {
        add('GOV-EXTENSION-001', 'BLOCKER', `nested provider-native discovery root is undeclared:${rel}`)
        continue
      }
      visitDiscoverySurfaces(absolute)
      continue
    }
    if (!info.isFile()) {
      if (reservedDiscoveryLeaf(rel, name)) add('GOV-SPECIAL-001', 'BLOCKER', `provider discovery surface is not a regular file:${rel}`)
      continue
    }
    if (info.nlink !== 1 && reservedDiscoveryLeaf(rel, name)) {
      add('GOV-ALIAS-001', 'BLOCKER', `provider discovery surface has a hard-link alias:${rel}`)
      continue
    }
    const matchedConfig = matchedDiscoveryConfig(rel, name)
    if (matchedConfig && !canonicalConfigDestinations.has(absolute)) {
      add('GOV-EXTENSION-001', 'BLOCKER', `provider config/MCP discovery surface is undeclared:${rel} (policy:${matchedConfig})`)
      continue
    }
    if (overrideInstructionNames.has(name)) {
      add('GOV-EXTENSION-001', 'BLOCKER', `provider instruction override/local file is undeclared:${rel}`)
      continue
    }
    if (reservedInstructionNames.has(name) && !canonicalInstructionDestinations.has(absolute)) {
      add('GOV-EXTENSION-001', 'BLOCKER', `nested provider instruction is undeclared:${rel}`)
    }
  }
}
if (repositoryRootSafe) visitDiscoverySurfaces(repo)

const governanceRoot = join(repo, 'governance')
if (!repositoryPathIsSafe(governanceRoot) || !pathEntryExists(governanceRoot) || lstatSync(governanceRoot).isSymbolicLink() || !lstatSync(governanceRoot).isDirectory()) {
  add('GOV-EXTENSION-001', 'BLOCKER', 'governance must be a real directory containing only immutable locks, authenticated managed data, the declared launcher substrate, and optional overlay.md')
} else {
  // Governance data files are allowed only when the immutable consumer BOM declares their exact
  // repository path and digest. Deriving both files and parent directories from that authenticated
  // authority lets a release add non-executable data (for example trust registries and schemas)
  // without turning governance/ into an open local policy or executable extension home.
  // Filesystem execute bits are not a data/code boundary: `node file.mjs` and `bash file.sh`
  // execute mode-0644 files. Dynamic direct leaves therefore use a closed lowercase JSON data
  // class. Fixed Markdown/lock/overlay homes retain their separate authority below.
  const requiredManagedGuide = 'governance/consumer-governance.md'
  if (!expectedManagedNames.includes(requiredManagedGuide)) {
    add('GOV-MANAGED-FILE-002', 'BLOCKER', `${requiredManagedGuide} must remain bound to the immutable managed-file BOM`)
  }
  const fixedGovernanceEntryNames = new Set([
    'consumer-governance.md', 'lock.json', 'lock.schema.json', 'overlay.md',
  ])
  const directGovernanceDataName = /^[a-z0-9][a-z0-9._-]*\.json$/
  const authenticatedManagedGovernanceEntries = []
  const authenticatedNestedGovernanceFiles = new Set()
  const authenticatedNestedGovernanceDirectories = new Set()
  const governanceDirectoryName = /^[a-z0-9][a-z0-9._-]*$/
  for (const path of expectedManagedNames) {
    const segments = path.split('/')
    if (segments.length < 2 || segments[0] !== 'governance') continue
    const name = segments.at(-1)
    if (segments.length === 2 && name === 'consumer-governance.md') continue
    if (fixedGovernanceEntryNames.has(name) || !directGovernanceDataName.test(name)) {
      add(
        'GOV-EXTENSION-001',
        'BLOCKER',
        `BOM-managed governance data must use a non-reserved canonical lowercase .json name:${path}`,
      )
      continue
    }
    if (segments.length === 2) {
      authenticatedManagedGovernanceEntries.push(name)
      continue
    }
    const directorySegments = segments.slice(1, -1)
    if (directorySegments.some((segment) => !governanceDirectoryName.test(segment))) {
      add('GOV-EXTENSION-001', 'BLOCKER', `BOM-managed governance data has an unsafe directory path:${path}`)
      continue
    }
    authenticatedNestedGovernanceFiles.add(segments.slice(1).join('/'))
    for (let index = 1; index <= directorySegments.length; index += 1) {
      authenticatedNestedGovernanceDirectories.add(directorySegments.slice(0, index).join('/'))
    }
  }
  const allowedGovernanceEntries = new Set([
    ...fixedGovernanceEntryNames,
    ...authenticatedManagedGovernanceEntries,
    ...[...authenticatedNestedGovernanceDirectories].filter((path) => !path.includes('/')),
  ])
  const launcherSegments = typeof launcherDestination === 'string' ? launcherDestination.replaceAll('\\', '/').split('/') : []
  if (launcherSegments[0] === 'governance' && launcherSegments.length > 1) allowedGovernanceEntries.add(launcherSegments[1])
  const unexpected = readdirSync(governanceRoot).filter((name) => !allowedGovernanceEntries.has(name)).sort()
  if (unexpected.length) add('GOV-EXTENSION-001', 'BLOCKER', `governance contains undeclared executable/policy homes:${unexpected.join(',')}`)
  for (const name of authenticatedManagedGovernanceEntries) {
    const managedData = join(governanceRoot, name)
    if (!isRegularFile(managedData) || (lstatSync(managedData).mode & 0o111) !== 0) {
      add('GOV-EXTENSION-001', 'BLOCKER', `managed governance data must be one regular non-executable file:governance/${name}`)
    }
  }
  const nestedGovernanceFiles = [...authenticatedNestedGovernanceFiles].sort()
  const nestedGovernanceDirectories = [...authenticatedNestedGovernanceDirectories].sort()
  if (launcherSegments[0] === 'governance' && nestedGovernanceDirectories.some((path) => (
    path === launcherSegments[1] || path.startsWith(`${launcherSegments[1]}/`)
  ))) {
    add('GOV-EXTENSION-001', 'BLOCKER', 'BOM-managed governance data overlaps the declared executable launcher substrate')
  }
  for (const directory of nestedGovernanceDirectories) {
    const absolute = join(governanceRoot, directory)
    if (!repositoryPathIsSafe(absolute) || !pathEntryExists(absolute) || lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isDirectory()) {
      add('GOV-EXTENSION-001', 'BLOCKER', `managed governance data directory must be one real directory:governance/${directory}`)
      continue
    }
    const expectedChildren = new Set()
    for (const childDirectory of nestedGovernanceDirectories) {
      const parts = childDirectory.split('/')
      if (parts.slice(0, -1).join('/') === directory) expectedChildren.add(parts.at(-1))
    }
    for (const childFile of nestedGovernanceFiles) {
      const parts = childFile.split('/')
      if (parts.slice(0, -1).join('/') === directory) expectedChildren.add(parts.at(-1))
    }
    const actualChildren = readdirSync(absolute).sort()
    const expected = [...expectedChildren].sort()
    if (JSON.stringify(actualChildren) !== JSON.stringify(expected)) {
      add('GOV-EXTENSION-001', 'BLOCKER', `managed governance data directory differs from its exact BOM-derived inventory:governance/${directory}`)
    }
  }
  for (const file of nestedGovernanceFiles) {
    const managedData = join(governanceRoot, file)
    if (!isRegularFile(managedData) || (lstatSync(managedData).mode & 0o111) !== 0) {
      add('GOV-EXTENSION-001', 'BLOCKER', `managed governance data must be one regular non-executable file:governance/${file}`)
    }
  }
  const overlay = join(governanceRoot, 'overlay.md')
  if (pathEntryExists(overlay) && (!isRegularFile(overlay) || (lstatSync(overlay).mode & 0o111) !== 0)) {
    add('GOV-EXTENSION-001', 'BLOCKER', 'governance/overlay.md must be one regular non-executable Markdown file')
  }
  const consumerGuide = join(governanceRoot, 'consumer-governance.md')
  if (!isRegularFile(consumerGuide) || (lstatSync(consumerGuide).mode & 0o111) !== 0) {
    add('GOV-EXTENSION-001', 'BLOCKER', 'governance/consumer-governance.md must be the managed regular non-executable Markdown guide')
  }
}

// Replay every enforceable shared hook directly over every consumer-controlled source/config/doc.
// Direct invocation avoids dispatcher event fan-out/timeouts and means hook crashes are blockers,
// while preserving one predicate implementation (the exact immutable npm corpus) as the SSOT.
const sourceFiles = collectSourceFiles(repo)
const replayHooks = Array.isArray(manifest?.ciReplay) ? manifest.ciReplay : []
let replayExecutionCount = 0
const replayHookKeys = [
  'event',
  'file',
  'sourceHook',
  'interpreter',
  'matcher',
  'outputMode',
  'inputContract',
  'transcriptRequirement',
]
const nativeHookKeys = [
  'file',
  'sourceHook',
  'bucket',
  'matcher',
  'runtime',
  'outputMode',
  'inputContract',
  'transcriptRequirement',
]
const nativeHookEvents = new Set(['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit'])
const replayEvents = new Set(['PreToolUse', 'PostToolUse'])
const replayInterpreters = new Set(['bash', 'node', 'python3'])
const replayOutputModes = new Set([
  'diagnostic',
  'blocking',
  'governance-context',
  'governance-decision',
  'governance-context-or-block',
])
const replayInputContracts = new Set(['event-v1', 'proposed-text-v1'])
const replayTranscriptRequirements = new Set(['none', 'optional', 'stable-required'])
const replayWriteTools = ['Write', 'Edit', 'MultiEdit']
const replayToolByHook = new Map()
const replayHookIdentities = new Set()
const nativeHookByIdentity = new Map()
const expectedReplayIdentities = new Set()
if (!manifest?.hooks || typeof manifest.hooks !== 'object' || Array.isArray(manifest.hooks)) {
  add('GOV-CONTENT-002', 'BLOCKER', 'installed native hook manifest is missing or invalid')
} else {
  for (const [event, hooks] of Object.entries(manifest.hooks)) {
    if (!nativeHookEvents.has(event) || !Array.isArray(hooks)) {
      add('GOV-CONTENT-002', 'BLOCKER', `installed native hook event contract is invalid:${event}`)
      continue
    }
    for (const [index, hook] of hooks.entries()) {
      const matcherTools = typeof hook?.matcher === 'string'
        ? hook.matcher.split('|').filter(Boolean)
        : []
      const identity = `${event}\0${hook?.file || ''}\0${hook?.sourceHook || ''}\0${hook?.matcher || ''}`
      const valid = (
        closedKeys(hook, nativeHookKeys)
        && canonicalManagedRepositoryPath(hook.file)
        && hook.file.startsWith('hooks/')
        && typeof hook.sourceHook === 'string'
        && hook.sourceHook.length > 0
        && ['SHIP_AS_IS', 'SHIP_REWRITTEN', 'REPLACE'].includes(hook.bucket)
        && typeof hook.matcher === 'string'
        && matcherTools.every((tool) => /^[A-Za-z][A-Za-z0-9]*$/.test(tool))
        && replayInterpreters.has(hook.runtime)
        && replayOutputModes.has(hook.outputMode)
        && replayInputContracts.has(hook.inputContract)
        && replayTranscriptRequirements.has(hook.transcriptRequirement)
        && (
          hook.inputContract !== 'proposed-text-v1'
          || (event === 'PreToolUse' && replayWriteTools.some((tool) => matcherTools.includes(tool)))
        )
        && !nativeHookByIdentity.has(identity)
      )
      if (!valid) {
        add('GOV-CONTENT-002', 'BLOCKER', `installed native hook contract is invalid or duplicated:${event}:${index}`)
        continue
      }
      nativeHookByIdentity.set(identity, hook)
      if (hook.bucket !== 'REPLACE' && hook.sourceHook !== 'inject_deploy_url_after_push.sh') {
        expectedReplayIdentities.add(identity)
      }
    }
  }
}
for (const [index, hook] of replayHooks.entries()) {
  const matcherTools = typeof hook?.matcher === 'string'
    ? hook.matcher.split('|').filter(Boolean)
    : []
  const replayTool = replayWriteTools.find((tool) => matcherTools.includes(tool))
  const identity = `${hook?.event || ''}\0${hook?.file || ''}\0${hook?.sourceHook || ''}\0${hook?.matcher || ''}`
  const nativeHook = nativeHookByIdentity.get(identity)
  const valid = (
    closedKeys(hook, replayHookKeys)
    && replayEvents.has(hook.event)
    && canonicalManagedRepositoryPath(hook.file)
    && hook.file.startsWith('hooks/')
    && typeof hook.sourceHook === 'string'
    && hook.sourceHook.length > 0
    && replayInterpreters.has(hook.interpreter)
    && matcherTools.length > 0
    && matcherTools.every((tool) => /^[A-Za-z][A-Za-z0-9]*$/.test(tool))
    && Boolean(replayTool)
    && replayOutputModes.has(hook.outputMode)
    && replayInputContracts.has(hook.inputContract)
    && replayTranscriptRequirements.has(hook.transcriptRequirement)
    && (hook.inputContract !== 'proposed-text-v1' || hook.event === 'PreToolUse')
    && nativeHook?.runtime === hook.interpreter
    && nativeHook?.outputMode === hook.outputMode
    && nativeHook?.inputContract === hook.inputContract
    && nativeHook?.transcriptRequirement === hook.transcriptRequirement
    && expectedReplayIdentities.has(identity)
    && !replayHookIdentities.has(identity)
  )
  if (!valid) {
    add('GOV-CONTENT-002', 'BLOCKER', `installed CI replay hook contract is invalid or duplicated at index ${index}`)
    continue
  }
  replayHookIdentities.add(identity)
  replayToolByHook.set(hook, replayTool)
}
if (
  JSON.stringify([...replayHookIdentities].sort())
  !== JSON.stringify([...expectedReplayIdentities].sort())
) {
  add('GOV-CONTENT-002', 'BLOCKER', 'installed CI replay inventory is not an exact projection of eligible native hook contracts')
}
const requiredTools = new Set(executionRuntimeValid ? executionRuntime.requiredExecutables : [])
for (const hook of replayHooks) {
  if (replayToolByHook.has(hook)) requiredTools.add(hook.interpreter)
}
const missingTools = [...requiredTools].filter((tool) => !commandAvailable(tool)).sort()
if (!replayHooks.length) add('GOV-CONTENT-001', 'BLOCKER', 'installed manifest has no fail-closed CI replay hooks')
if (missingTools.length) add('GOV-CONTENT-002', 'BLOCKER', `required governance replay tools missing: ${missingTools.join(', ')}`)
const replayBaseEnvironment = closedToolProfile
  ? Object.freeze({
      HOME: closedToolProfile.homeDirectory,
      LANG: 'C',
      LC_ALL: 'C',
      NO_COLOR: '1',
      PATH: closedToolProfile.executablePath,
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONNOUSERSITE: '1',
      TMPDIR: closedToolProfile.tempDirectory,
      XDG_CONFIG_HOME: closedToolProfile.homeDirectory,
    })
  : Object.freeze({})

const materializeVerifiedReplayCorpus = () => {
  if (!closedToolProfile) throw new Error('closed replay tool profile is unavailable')
  const snapshotRoot = realpathSync(mkdtempSync(join(closedToolProfile.tempDirectory, 'verified-replay-corpus-')))
  const snapshotForkRoot = join(snapshotRoot, 'fork')
  chmodSync(snapshotRoot, 0o700)
  mkdirSync(snapshotForkRoot, { mode: 0o700 })
  const captured = new Map()
  let totalBytes = 0
  const captureAndWrite = (path, expectedDigest = null) => {
    const source = join(forkRoot, ...path.split('/'))
    const record = captureStableRegularFile(source, maxReplaySourceBytes, `replay corpus ${path}`)
    if (expectedDigest !== null && record.sha256 !== expectedDigest) {
      throw new Error(`replay corpus digest differs from its authenticated lock:${path}`)
    }
    totalBytes += record.bytes.length
    if (totalBytes > 256 * 1024 * 1024) throw new Error('replay corpus exceeds the closed 256 MiB snapshot budget')
    const destination = join(snapshotForkRoot, ...path.split('/'))
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
    let descriptor
    try {
      descriptor = openSync(destination, 'wx', 0o400)
      writeFileSync(descriptor, record.bytes)
      fsyncSync(descriptor)
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
    }
    const written = captureStableRegularFile(destination, maxReplaySourceBytes, `private replay corpus ${path}`)
    if (written.sha256 !== record.sha256) throw new Error(`private replay corpus write changed authenticated bytes:${path}`)
    captured.set(path, record)
  }
  const thawAndRemove = () => {
    if (!existsSync(snapshotRoot)) return
    const thaw = directory => {
      chmodSync(directory, 0o700)
      for (const name of readdirSync(directory)) {
        const path = join(directory, name)
        const info = lstatSync(path)
        if (info.isDirectory() && !info.isSymbolicLink()) thaw(path)
      }
    }
    thaw(snapshotRoot)
    rmSync(snapshotRoot, { recursive: true, force: true })
  }
  try {
    for (const entry of corpusLock.entries) captureAndWrite(entry.file, entry.sha256)
    for (const special of ['governance.lock', 'consumer/lock.json', 'consumer/lock.schema.json']) {
      if (!captured.has(special)) captureAndWrite(special)
    }
    const directories = []
    const freeze = directory => {
      directories.push(directory)
      for (const name of readdirSync(directory)) {
        const path = join(directory, name)
        if (lstatSync(path).isDirectory()) freeze(path)
      }
    }
    freeze(snapshotRoot)
    for (const directory of directories.reverse()) chmodSync(directory, 0o500)
    return {
      forkRoot: snapshotForkRoot,
      outputTransport: join(snapshotForkRoot, 'launchers/provider-hook-output-transport.mjs'),
      has(path) {
        return captured.has(path)
      },
      verify() {
        for (const [path, expected] of captured) {
          const current = captureStableRegularFile(
            join(forkRoot, ...path.split('/')),
            maxReplaySourceBytes,
            `live replay corpus CAS ${path}`,
          )
          if (
            current.sha256 !== expected.sha256
            || !sameStableFileIdentity(current.info, expected.info)
          ) throw new Error(`live replay corpus changed after authenticated snapshot:${path}`)
        }
        return true
      },
      cleanup: thawAndRemove,
      corpusLockSha256: captured.get('governance.lock')?.sha256 || null,
    }
  } catch (error) {
    thawAndRemove()
    throw error
  }
}

let interpretProviderHookChildResult = null
const replayIntegrity = (detail) => ({ kind: 'integrity', detail })
const interpretReplayResult = ({ hook, status, stdout, stderr }) => {
  if (status === 70) {
    return replayIntegrity(
      stderr.trim() || stdout.trim() || 'child reported the reserved integrity exit code:70',
    )
  }
  if (!Number.isInteger(status) || ![0, 2].includes(status)) {
    return replayIntegrity(`unsupported child exit code:${status ?? '<missing>'}`)
  }
  if (stderr.includes('GOVERNANCE_INTEGRITY:')) {
    return replayIntegrity('child output contains the reserved governance integrity marker')
  }
  const hasStdout = stdout.length > 0
  const hasStderr = stderr.length > 0
  if (hasStdout && hasStderr) return replayIntegrity('child mixed stdout and stderr channels')

  if (hook.outputMode === 'diagnostic') {
    if (status !== 0) return replayIntegrity('diagnostic hook returned a blocking exit')
    if (hasStdout) return replayIntegrity('diagnostic hook wrote forbidden success stdout')
    return hasStderr
      ? { kind: 'content-violation', detail: stderr.trim() }
      : { kind: 'clean' }
  }
  try {
    const interpreted = interpretProviderHookChildResult({
      status,
      outputMode: hook.outputMode,
      event: hook.event,
      stdout,
      stderr,
    })
    if (interpreted.kind === 'clean') return interpreted
    if (interpreted.kind === 'policy-block') {
      return { kind: 'content-violation', detail: interpreted.reason }
    }
    if (interpreted.kind === 'governance-context') {
      return { kind: 'content-violation', detail: interpreted.message }
    }
    if (interpreted.kind === 'governance-decision') {
      return { kind: 'content-violation', detail: interpreted.reason }
    }
    return replayIntegrity(`strict child-result interpreter returned an unknown result:${interpreted.kind || '<missing>'}`)
  } catch (error) {
    return replayIntegrity(error?.message || 'strict child-result interpretation failed')
  }
}
// A repository that already failed a closed structural/authenticity rule cannot become compliant
// through content replay. Avoid executing the expensive hook matrix in that terminal state while
// preserving the complete replay for every otherwise-eligible repository and every content-only
// violation. The report remains a hard failure and records zero hook executions, so this is an
// explicit fail-closed short circuit rather than a hidden PASS-path optimization.
const replaySkippedForPreexistingBlocker = diagnostics.some((diagnostic) => diagnostic.severity === 'BLOCKER')
let verifiedReplayCorpus = null
const replaySourceCaptures = new Map()
const replaySourceChangeDiagnostics = new Set()
const addReplaySourceChange = (file, message, evidence = undefined) => {
  const repositoryFile = relative(repo, file).replaceAll('\\', '/')
  if (replaySourceChangeDiagnostics.has(repositoryFile)) return
  replaySourceChangeDiagnostics.add(repositoryFile)
  add('GOV-CONTENT-002', 'BLOCKER', `${repositoryFile} ${message}`, evidence)
}
const verifyReplaySourceCaptures = () => {
  for (const [file, replayed] of replaySourceCaptures) {
    const repositoryFile = relative(repo, file).replaceAll('\\', '/')
    try {
      const current = captureStableRegularFile(
        file,
        maxReplaySourceBytes,
        `final replay source CAS ${repositoryFile}`,
      )
      if (
        current.sha256 !== replayed.sha256
        || !sameStableFileIdentity(current.info, replayed.info)
      ) addReplaySourceChange(file, 'changed after its authenticated replay')
    } catch (error) {
      addReplaySourceChange(file, 'cannot be stably attested after replay', error.message)
    }
  }
}
if (replayHooks.length && !missingTools.length && !replaySkippedForPreexistingBlocker) {
  try {
    verifiedReplayCorpus = materializeVerifiedReplayCorpus()
    ;({ interpretProviderHookChildResult } = await import(pathToFileURL(verifiedReplayCorpus.outputTransport).href))
    if (typeof interpretProviderHookChildResult !== 'function') {
      throw new Error('strict child-result interpreter export is missing')
    }
  } catch (error) {
    verifiedReplayCorpus?.cleanup()
    verifiedReplayCorpus = null
    add('GOV-CONTENT-002', 'BLOCKER', 'verified immutable CI replay corpus cannot be materialized or loaded', error.message)
  }
}
if (
  replayHooks.length
  && !missingTools.length
  && !replaySkippedForPreexistingBlocker
  && verifiedReplayCorpus
  && typeof interpretProviderHookChildResult === 'function'
) {
  outer: for (const file of sourceFiles) {
    let body
    try {
      const captured = captureStableRegularFile(file, maxReplaySourceBytes, `replay source ${relative(repo, file)}`)
      replaySourceCaptures.set(file, captured)
      body = strictUtf8.decode(captured.bytes)
    } catch (error) {
      add('GOV-CONTENT-002', 'BLOCKER', `${relative(repo, file)} cannot be replayed as bounded strict UTF-8`, error.message)
      continue
    }
    for (const hook of replayHooks) {
      const hookPath = join(verifiedReplayCorpus.forkRoot, hook.file || '')
      const replayTool = replayToolByHook.get(hook)
      if (!replayTool) {
        add('GOV-CONTENT-002', 'BLOCKER', `CI replay hook has no validated write contract: ${hook.file || 'unnamed'}`)
        break outer
      }
      if (!verifiedReplayCorpus.has(hook.file || '')) {
        add('GOV-CONTENT-002', 'BLOCKER', `CI replay hook missing or unsafe: ${hook.file || 'unnamed'}`)
        break outer
      }
      // The shared hook corpus has a provider-neutral canonical payload contract. Native adapters
      // translate provider tool names to this contract; CI deliberately replays the canonical form.
      const absoluteFile = resolve(file)
      const repositoryFile = relative(repo, file).replaceAll('\\', '/')
      const proposedState = hook.inputContract === 'proposed-text-v1'
        ? { schemaVersion: 1, path: repositoryFile, kind: 'text', content: body }
        : null
      const materializedFile = {
        file_path: absoluteFile,
        path: absoluteFile,
        content: body,
        new_string: body,
        ...(proposedState ? { governance_write_state: proposedState } : {}),
      }
      const payload = JSON.stringify({
        hook_event_name: hook.event,
        event: hook.event,
        tool_name: replayTool,
        tool: 'write_file',
        operation: 'write',
        tool_input: {
          ...materializedFile,
          edits: [materializedFile],
          changed_paths: [absoluteFile],
        },
        ...(proposedState ? { governance_write_state: proposedState } : {}),
        changed_paths: [absoluteFile],
      })
      const replayRuntime = closedToolProfile?.executables?.[hook.interpreter]
      if (!replayRuntime) {
        add('GOV-CONTENT-002', 'BLOCKER', `CI replay runtime is unavailable:${hook.interpreter}`)
        break outer
      }
      const replayOptions = {
        cwd: repo,
        input: Buffer.from(payload),
        encoding: null,
        timeout: replayChildTimeoutMs,
        maxBuffer: maxReplayChildOutputBytes,
        killSignal: 'SIGKILL',
        env: {
          ...replayBaseEnvironment,
          CLAUDE_PROJECT_DIR: repo,
          GOVERNANCE_PROJECT_DIR: repo,
          // Direct hooks-off CI replay must use the same already-verified immutable corpus as the
          // native product runner. Never inherit or rediscover a mutable project/package root.
          GOVERNANCE_CORPUS_ROOT: verifiedReplayCorpus.forkRoot,
          GOVERNANCE_PROVIDER: 'ci-replay',
          GOVERNANCE_SELF_PROVIDER: 'ci-replay',
          GOVERNANCE_READ_ONLY: '1',
          GOVERNANCE_TELEMETRY_OPT_IN: '0',
          GOVERNANCE_STRICT_REPLAY: '1',
          GOVERNANCE_STATIC_REPLAY: '1',
          GOVERNANCE_RUNTIME_ROOT: '',
          GOVERNANCE_STATE_DIR: '',
          GOVERNANCE_TRANSCRIPT_PATH: '',
          GOVERNANCE_TRANSCRIPT_TRUST: 'unavailable',
          GOVERNANCE_WRITE_STATE_TRUST: proposedState ? 'runner-v1' : 'unavailable',
        },
      }
      let replay
      let replayAttempt = 0
      do {
        replayAttempt += 1
        closedToolProfile.verify()
        replay = spawnSync(replayRuntime, [hookPath], replayOptions)
        closedToolProfile.verify()
      } while (
        replay.error?.code === 'ETIMEDOUT'
        && replayAttempt < replayChildMaxAttempts
      )
      replayExecutionCount += 1
      if (replay.error || replay.status === null || replay.signal) {
        const cause = [
          `file=${repositoryFile}`,
          `interpreter=${hook.interpreter}`,
          `attempt=${replayAttempt}/${replayChildMaxAttempts}`,
          `timeoutMs=${replayChildTimeoutMs}`,
          `error=${replay.error?.code || 'none'}`,
          `signal=${replay.signal || 'none'}`,
          `executionIndex=${replayExecutionCount}`,
        ].join(';')
        add(
          'GOV-CONTENT-002',
          'BLOCKER',
          `CI replay child execution failed for ${hook.sourceHook || hook.file}`,
          cause,
        )
        break outer
      }
      let stdout
      let stderr
      try {
        stdout = strictUtf8.decode(replay.stdout || Buffer.alloc(0))
        stderr = strictUtf8.decode(replay.stderr || Buffer.alloc(0))
      } catch {
        add('GOV-CONTENT-002', 'BLOCKER', `CI replay child emitted invalid UTF-8 for ${hook.sourceHook || hook.file}`)
        break outer
      }
      const interpreted = interpretReplayResult({
        hook,
        status: replay.status,
        stdout,
        stderr,
      })
      const detail = String(interpreted.detail || '').split(/\r?\n/).slice(0, 8).join(' | ')
      if (interpreted.kind === 'integrity') {
        add(
          'GOV-CONTENT-002',
          'BLOCKER',
          `CI replay integrity failure from ${hook.sourceHook || hook.file} (${hook.event})`,
          detail,
        )
        break outer
      }
      if (interpreted.kind === 'content-violation') {
        const ruleId = hook.outputMode === 'diagnostic' ? 'GOV-CONTENT-003' : 'GOV-CONTENT-001'
        add(ruleId, 'BLOCKER', `${relative(repo, file)} violates ${hook.sourceHook || hook.file} (${hook.event})`, detail)
        break
      }
    }
  }
}
if (verifiedReplayCorpus) {
  try {
    verifiedReplayCorpus.verify()
  } catch (error) {
    add('GOV-CONTENT-002', 'BLOCKER', 'live replay corpus failed final compare-and-swap verification', error.message)
  }
}

evidence.providers = Object.fromEntries(generatedSurfaces.map(([providerId, surface]) => [providerId, {
  events: canonicalEventsByProvider.get(providerId) || [],
  nativeEvents: nativeEventsByProvider.get(providerId) || [],
  skills: (surface.skills || []).length,
  instruction: surface.instructionDestination,
  hooks: surface.hookDestination,
  hookEnforcement: surface.capabilities.hookEnforcement,
}]))
evidence.release = bom?.release || null
evidence.checkerSha256 = isRegularFile(shippedChecker) ? fileSha(shippedChecker) : null
evidence.corpusLockSha256 = verifiedReplayCorpus?.corpusLockSha256
  || (existsSync(corpusLockPath) ? fileSha(corpusLockPath) : null)
const sourceInventoryRows = sourceFiles.map((file) => {
  const repositoryFile = relative(repo, file).replaceAll('\\', '/')
  try {
    const current = captureStableRegularFile(file, maxReplaySourceBytes, `source inventory ${repositoryFile}`)
    const replayed = replaySourceCaptures.get(file)
    if (
      replayed
      && (
        current.sha256 !== replayed.sha256
        || !sameStableFileIdentity(current.info, replayed.info)
      )
    ) {
      addReplaySourceChange(file, 'changed after its authenticated replay')
      return `${repositoryFile}:${replayed.sha256}`
    }
    return `${repositoryFile}:${current.sha256}`
  } catch (error) {
    addReplaySourceChange(file, 'cannot be stably attested after replay', error.message)
    return `${repositoryFile}:unavailable`
  }
})
evidence.sourceInventory = {
  files: sourceInventoryRows.length,
  sha256: sha256(sourceInventoryRows.join('\n') + '\n'),
}
const repositoryRows = repositoryInventory(repo)
evidence.repositoryInventory = {
  basis: repositoryRows.basis,
  files: repositoryRows.rows.length,
  sha256: sha256(repositoryRows.rows.join('\n') + '\n'),
}
const gitIdentity = closedRepositoryGitReady
  ? runClosedGit(['rev-parse', 'HEAD', 'HEAD^{tree}'], {
      cwd: repo,
      timeoutMs: 3000,
    })
  : null
const [gitHead = null, gitTree = null] = gitIdentity?.status === 0
  ? gitIdentity.stdout.trim().split(/\r?\n/)
  : []
evidence.git = {
  head: /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(gitHead || '') ? gitHead : null,
  tree: /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(gitTree || '') ? gitTree : null,
}
evidence.staticReplay = {
  sourceFiles: sourceFiles.length,
  hookExecutions: replayExecutionCount,
  skippedForPreexistingBlocker: replaySkippedForPreexistingBlocker,
  hooks: replayHooks.map((hook) => `${hook.event}:${hook.sourceHook || hook.file}`),
  requiredTools: [...requiredTools].sort(),
  nativeHooks: false,
}
evidence.sandboxDeniedPaths = [...sandboxDeniedPaths].sort()
verifyReplaySourceCaptures()
if (verifiedReplayCorpus) {
  try {
    verifiedReplayCorpus.verify()
  } catch (error) {
    add('GOV-CONTENT-002', 'BLOCKER', 'live replay corpus changed before final attestation', error.message)
  } finally {
    verifiedReplayCorpus.cleanup()
  }
}
const ok = !diagnostics.some((diagnostic) => diagnostic.severity === 'BLOCKER')
// Content-address the complete compliance input, not merely the package version. Two products at
// the same release therefore cannot share an attestation digest unless their source snapshot,
// checker/BOM/corpus, provider projections, and replay plan are all identical.
const attestationDigest = sha256(JSON.stringify({
  role: bom?.role || null,
  ok,
  bomSha256: evidence.bomSha256 || null,
  checkerSha256: evidence.checkerSha256,
  corpusLockSha256: evidence.corpusLockSha256,
  release: evidence.release,
  providers: evidence.providers,
  sourceInventory: evidence.sourceInventory,
  repositoryInventory: evidence.repositoryInventory,
  git: evidence.git,
  staticReplay: evidence.staticReplay,
  sandboxDeniedPaths: evidence.sandboxDeniedPaths,
  blockerRuleIds: diagnostics.filter((item) => item.severity === 'BLOCKER').map((item) => item.ruleId).sort(),
}))
const report = { schemaVersion: 1, ok, role: bom?.role || null, hooksRequired: false, attestationDigest, evidence, diagnostics }

if (asJson) process.stdout.write(JSON.stringify(report, null, 2) + '\n')
else {
  console.log(`${ok ? '✅' : '❌'} provider-neutral governance check: ${ok ? 'PASS' : 'FAIL'} (${diagnostics.length} diagnostics)`)
  console.log(`   attestationDigest: ${attestationDigest}`)
  for (const item of diagnostics) console.log(`   ${item.severity} ${item.ruleId}: ${item.message}${item.evidence ? ` (${item.evidence})` : ''}`)
}
process.exit(ok ? 0 : 1)

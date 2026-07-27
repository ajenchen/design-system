#!/usr/bin/env node
// Fresh consumer bootstrap shared by local shells and hosted setup-script environments.
// It installs only the committed lock, authenticates registry signatures, then executes the
// exact installed provider-neutral checker with native hooks disabled. SessionStart never calls it.

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
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION,
  GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION,
  GOVERNANCE_DEPENDENCY_NPM_STEPS,
  GOVERNANCE_DEPENDENCY_REQUIRED_EXECUTABLES,
  assertClosedProjectNpmConfig as assertClosedProjectNpmConfigShared,
  assertNoRootNpmShrinkwrap,
  assertGovernanceBootstrapRuntime,
  runClosedBootstrapStep,
  runVerifiedGovernanceDependencyBootstrap,
  sanitizeGovernanceBootstrapEnvironment,
} from './lib/governance-dependency-bootstrap.mjs'
import {
  resolveExactNpmArtifact,
} from './lib/verified-exact-npm-runtime.mjs'
import {
  assertGitVisibleWorktreeUnchanged,
  captureGitVisibleWorktree,
} from './lib/worktree-fingerprint.mjs'
import {
  resolveClosedPrivateRuntimeBase,
} from './lib/closed-tool-execution.mjs'

export const SETUP_GOVERNANCE_SCRIPT = 'node scripts/setup-governance.mjs'
export const SETUP_GOVERNANCE_MINIMUM_NODE_VERSION = GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION
export const SETUP_GOVERNANCE_EXACT_NPM_VERSION = GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION
export const SETUP_GOVERNANCE_REQUIRED_EXECUTABLES = GOVERNANCE_DEPENDENCY_REQUIRED_EXECUTABLES
export const SETUP_GOVERNANCE_NPM_STEPS = GOVERNANCE_DEPENDENCY_NPM_STEPS

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/
const INTERNAL_PACKAGES = Object.freeze([
  '@qijenchen/design-system',
  '@qijenchen/storybook-config',
])
const SETUP_AUTHORITY_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  '.npmrc',
  'scripts/lib/governance-dependency-bootstrap.mjs',
  'scripts/lib/closed-tool-execution.mjs',
  'scripts/lib/verified-exact-npm-runtime.mjs',
  'scripts/lib/worktree-fingerprint.mjs',
  'scripts/setup-governance.mjs',
])
const SHA256 = /^[a-f0-9]{64}$/
const MAX_SETUP_AUTHORITY_FILE_BYTES = 32 * 1024 * 1024
const MAX_SETUP_AUTHORITY_TOTAL_BYTES = 256 * 1024 * 1024

function invariant(condition, message) {
  if (!condition) throw new Error(`GOV-SETUP-001:${message}`)
}

function pathExists(path) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function stableRegularBytes(path, label, maxBytes = MAX_SETUP_AUTHORITY_FILE_BYTES) {
  let descriptor
  try {
    const beforePath = lstatSync(path, { bigint: true })
    invariant(
      beforePath.isFile()
        && !beforePath.isSymbolicLink()
        && beforePath.nlink === 1n
        && beforePath.size <= BigInt(maxBytes)
        && realpathSync(path) === resolve(path),
      `${label} must be one bounded single-link regular file with no symlink ancestry`,
    )
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY
        | (fsConstants.O_CLOEXEC ?? 0)
        | (fsConstants.O_NOFOLLOW ?? 0),
    )
    const before = fstatSync(descriptor, { bigint: true })
    invariant(sameFileIdentity(beforePath, before), `${label} changed before it was opened`)
    const bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor, { bigint: true })
    const afterPath = lstatSync(path, { bigint: true })
    invariant(
      sameFileIdentity(before, after)
        && sameFileIdentity(after, afterPath)
        && BigInt(bytes.length) === before.size,
      `${label} changed while it was captured`,
    )
    return bytes
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function canonicalForkPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && value === value.normalize('NFC')
    && !value.includes('\\')
    && !value.includes('\0')
    && !isAbsolute(value)
    && value.split('/').every(part => part && part !== '.' && part !== '..')
}

function regularForkInventory(root) {
  const rows = []
  const visit = (directory, prefix = '') => {
    const directoryInfo = lstatSync(directory)
    invariant(
      directoryInfo.isDirectory()
        && !directoryInfo.isSymbolicLink()
        && realpathSync(directory) === directory,
      `installed governance corpus directory is unsafe:${prefix || '.'}`,
    )
    for (const name of readdirSync(directory).sort()) {
      invariant(name === name.normalize('NFC') && name !== '.' && name !== '..', `installed governance corpus name is not canonical:${name}`)
      const absolute = join(directory, name)
      const path = prefix ? `${prefix}/${name}` : name
      const info = lstatSync(absolute)
      if (info.isDirectory() && !info.isSymbolicLink()) visit(absolute, path)
      else {
        invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `installed governance corpus leaf is unsafe:${path}`)
        rows.push(path)
      }
    }
  }
  visit(root)
  return rows
}

function writeExclusiveSnapshotFile(path, bytes) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  let descriptor
  try {
    descriptor = openSync(path, 'wx', 0o400)
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
  invariant(sha256(stableRegularBytes(path, `private checker snapshot ${path}`)) === sha256(bytes), 'private checker snapshot write did not preserve authenticated bytes')
}

function freezeSnapshotDirectories(root) {
  const directories = []
  const visit = directory => {
    directories.push(directory)
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (lstatSync(path).isDirectory()) visit(path)
    }
  }
  visit(root)
  for (const directory of directories.reverse()) chmodSync(directory, 0o500)
}

function removePrivateSnapshot(root) {
  if (!pathExists(root)) return
  const thaw = directory => {
    chmodSync(directory, 0o700)
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      const info = lstatSync(path)
      if (info.isDirectory() && !info.isSymbolicLink()) thaw(path)
    }
  }
  thaw(root)
  rmSync(root, { recursive: true, force: true })
}

function materializeInstalledCheckerClosure(root) {
  const installedFork = join(root, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  const forkInfo = lstatSync(installedFork)
  invariant(
    forkInfo.isDirectory()
      && !forkInfo.isSymbolicLink()
      && realpathSync(installedFork) === installedFork,
    'installed governance corpus root is missing or has symlink ancestry',
  )
  const corpusLockBytes = stableRegularBytes(join(installedFork, 'governance.lock'), 'installed governance corpus lock')
  let corpusLock
  let committedBom
  try {
    corpusLock = JSON.parse(corpusLockBytes.toString('utf8'))
    committedBom = JSON.parse(stableRegularBytes(join(root, 'governance/lock.json'), 'committed governance lock').toString('utf8'))
  } catch (error) {
    throw new Error(`GOV-SETUP-001:installed checker authority is invalid JSON:${error.message}`)
  }
  invariant(
    corpusLock?.schemaVersion === 1
      && corpusLock?.kind === 'fork-governance-corpus-lock'
      && corpusLock?.hashAlgorithm === 'sha256'
      && Array.isArray(corpusLock.entries),
    'installed governance corpus lock has an invalid closed shape',
  )
  invariant(
    committedBom?.payload?.forkCorpusLockSha256 === sha256(corpusLockBytes),
    'committed governance lock does not authenticate the installed corpus lock',
  )
  const shippedBom = stableRegularBytes(join(installedFork, 'consumer/lock.json'), 'installed governance release lock')
  const committedBomBytes = stableRegularBytes(join(root, 'governance/lock.json'), 'committed governance lock')
  invariant(shippedBom.equals(committedBomBytes), 'installed governance release lock differs from the committed lock')
  const shippedSchema = stableRegularBytes(join(installedFork, 'consumer/lock.schema.json'), 'installed governance lock schema')
  const committedSchema = stableRegularBytes(join(root, 'governance/lock.schema.json'), 'committed governance lock schema')
  invariant(shippedSchema.equals(committedSchema), 'installed governance lock schema differs from the committed schema')

  const entries = new Map()
  let totalBytes = corpusLockBytes.length + shippedBom.length + shippedSchema.length
  for (const [index, entry] of corpusLock.entries.entries()) {
    invariant(
      entry
        && Object.keys(entry).sort().join(',') === 'classification,destination,file,schemaVersion,sha256,source'
        && entry.schemaVersion === 1
        && canonicalForkPath(entry.file)
        && SHA256.test(entry.sha256 || '')
        && !entries.has(entry.file),
      `installed governance corpus lock entry is invalid or duplicated:${index}`,
    )
    const bytes = stableRegularBytes(join(installedFork, ...entry.file.split('/')), `installed governance corpus ${entry.file}`)
    invariant(sha256(bytes) === entry.sha256, `installed governance corpus digest mismatch:${entry.file}`)
    totalBytes += bytes.length
    invariant(totalBytes <= MAX_SETUP_AUTHORITY_TOTAL_BYTES, 'installed governance corpus exceeds the closed snapshot budget')
    entries.set(entry.file, bytes)
  }
  const checkerRelative = 'consumer/governance-check.mjs'
  invariant(
    entries.has(checkerRelative)
      && committedBom?.payload?.governanceCheckSha256 === sha256(entries.get(checkerRelative)),
    'committed governance lock does not authenticate the installed checker',
  )
  const expectedInventory = [...entries.keys(), 'consumer/lock.json', 'consumer/lock.schema.json', 'governance.lock'].sort()
  invariant(
    JSON.stringify(regularForkInventory(installedFork)) === JSON.stringify(expectedInventory),
    'installed governance corpus inventory is not exactly closed by its lock',
  )
  const sourceClosure = new Map([
    ...entries,
    ['governance.lock', corpusLockBytes],
    ['consumer/lock.json', shippedBom],
    ['consumer/lock.schema.json', shippedSchema],
  ])

  const privateBase = resolveClosedPrivateRuntimeBase(process.platform)
  const snapshotRoot = realpathSync(mkdtempSync(join(privateBase, 'qijenchen-governance-checker-')))
  chmodSync(snapshotRoot, 0o700)
  const snapshotFork = join(snapshotRoot, 'fork')
  mkdirSync(snapshotFork, { mode: 0o700 })
  try {
    for (const [path, bytes] of entries) {
      writeExclusiveSnapshotFile(join(snapshotFork, ...path.split('/')), bytes)
    }
    writeExclusiveSnapshotFile(join(snapshotFork, 'governance.lock'), corpusLockBytes)
    writeExclusiveSnapshotFile(join(snapshotFork, 'consumer/lock.json'), shippedBom)
    writeExclusiveSnapshotFile(join(snapshotFork, 'consumer/lock.schema.json'), shippedSchema)
    freezeSnapshotDirectories(snapshotRoot)
    return {
      checker: join(snapshotFork, checkerRelative),
      cleanup: () => removePrivateSnapshot(snapshotRoot),
      corpusSha256: sha256(corpusLockBytes),
      root: snapshotRoot,
      verify() {
        invariant(
          JSON.stringify(regularForkInventory(installedFork)) === JSON.stringify(expectedInventory),
          'installed governance corpus inventory changed after checker snapshot',
        )
        for (const [path, expected] of sourceClosure) {
          invariant(
            stableRegularBytes(
              join(installedFork, ...path.split('/')),
              `installed checker closure CAS ${path}`,
            ).equals(expected),
            `installed checker closure changed after authenticated snapshot:${path}`,
          )
        }
        return true
      },
    }
  } catch (error) {
    removePrivateSnapshot(snapshotRoot)
    throw error
  }
}

function removeTransactionPath(path) {
  if (!pathExists(path)) return
  const info = lstatSync(path)
  if (info.isDirectory() && !info.isSymbolicLink()) rmSync(path, { recursive: true, force: true })
  else unlinkSync(path)
}

async function withNodeModulesRollback(root, operation) {
  const parent = realpathSync(dirname(root))
  const transactionRoot = realpathSync(mkdtempSync(join(parent, `.${basename(root)}.governance-setup-`)))
  chmodSync(transactionRoot, 0o700)
  const live = join(root, 'node_modules')
  const backup = join(transactionRoot, 'before-node_modules')
  const beforePresent = pathExists(live)
  if (beforePresent) {
    const info = lstatSync(live)
    invariant(
      info.isDirectory() && !info.isSymbolicLink() && realpathSync(live) === live,
      'preexisting node_modules must be one real directory',
    )
    renameSync(live, backup)
  }
  let committed = false
  try {
    const result = await operation()
    if (beforePresent) removeTransactionPath(backup)
    committed = true
    return result
  } catch (error) {
    let rollbackError = null
    try {
      removeTransactionPath(live)
      if (beforePresent) renameSync(backup, live)
    } catch (failure) {
      rollbackError = failure
    }
    if (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `GOV-SETUP-001:setup failed and node_modules rollback also failed; recovery root preserved:${transactionRoot}`,
      )
    }
    throw error
  } finally {
    if (committed || !pathExists(backup)) removeTransactionPath(transactionRoot)
  }
}

function readRegularBytes(path, label) {
  const info = lstatSync(path)
  invariant(
    info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(path) === resolve(path),
    `${label} must be a single-link regular file with no symlink ancestry`,
  )
  return readFileSync(path)
}

function readRegularJson(path, label) {
  try {
    return JSON.parse(readRegularBytes(path, label).toString('utf8'))
  } catch (error) {
    throw new Error(`GOV-SETUP-001:${label} is invalid JSON:${error.message}`)
  }
}

function assertClosedProjectNpmConfig(root) {
  return assertClosedProjectNpmConfigShared(root, ['legacy-peer-deps=true', 'ignore-scripts=true'], { errorPrefix: 'GOV-SETUP-001' })
}

export function assertSupportedSetupPlatform(platform = process.platform) {
  assertGovernanceBootstrapRuntime({
    platform,
    nodeVersion: process.versions.node,
    runner: () => ({ status: 0 }),
    environment: { PATH: process.env.PATH },
    errorPrefix: 'GOV-SETUP-001',
  })
  return platform
}

export function assertSupportedSetupRuntime({
  platform = process.platform,
  nodeVersion = process.versions.node,
  runner = spawnSync,
  env = process.env,
} = {}) {
  return assertGovernanceBootstrapRuntime({
    platform,
    nodeVersion,
    runner,
    environment: env,
    errorPrefix: 'GOV-SETUP-001',
  })
}

export function assertCommittedSetupSnapshot(rootPath) {
  const root = realpathSync(resolve(rootPath))
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'repository root must be a real directory')
  assertNoRootNpmShrinkwrap(root, { errorPrefix: 'GOV-SETUP-001' })

  const manifest = readRegularJson(join(root, 'package.json'), 'package.json')
  const lock = readRegularJson(join(root, 'package-lock.json'), 'package-lock.json')
  assertClosedProjectNpmConfig(root)
  invariant(manifest?.scripts?.['setup:governance'] === SETUP_GOVERNANCE_SCRIPT, 'package.json setup:governance command drifted')
  invariant(lock.lockfileVersion === 3 && lock.packages && typeof lock.packages === 'object', 'package-lock.json must be lockfileVersion 3')
  const lockedRoot = lock.packages['']
  invariant(lockedRoot && typeof lockedRoot === 'object', 'package-lock.json is missing its root package record')
  const requiredNodeRange = `>=${SETUP_GOVERNANCE_MINIMUM_NODE_VERSION}`
  invariant(manifest?.engines?.node === requiredNodeRange, `package.json engines.node must equal ${requiredNodeRange}`)
  invariant(lockedRoot?.engines?.node === requiredNodeRange, `package-lock.json root engines.node must equal ${requiredNodeRange}`)
  invariant(manifest?.devDependencies?.npm === SETUP_GOVERNANCE_EXACT_NPM_VERSION, `package.json must pin npm ${SETUP_GOVERNANCE_EXACT_NPM_VERSION}`)
  invariant(lockedRoot?.devDependencies?.npm === SETUP_GOVERNANCE_EXACT_NPM_VERSION, `package-lock.json root must pin npm ${SETUP_GOVERNANCE_EXACT_NPM_VERSION}`)
  const npmArtifact = resolveExactNpmArtifact(root)
  invariant(npmArtifact.version === SETUP_GOVERNANCE_EXACT_NPM_VERSION, `package-lock.json npm artifact must equal ${SETUP_GOVERNANCE_EXACT_NPM_VERSION}`)

  for (const name of INTERNAL_PACKAGES) {
    const declared = manifest?.dependencies?.[name]
    invariant(typeof declared === 'string' && EXACT_VERSION.test(declared), `${name} must use an exact immutable version`)
    invariant(lockedRoot?.dependencies?.[name] === declared, `package-lock.json root dependency differs for ${name}`)
  }
  return root
}

function runStep(command, args, { root, runner, env = process.env }) {
  return runClosedBootstrapStep(command, args, {
    root,
    environment: env,
    runner,
    errorPrefix: 'GOV-SETUP-001',
  })
}

async function runGovernanceDependencyBootstrap({
  root,
  platform = process.platform,
  nodeVersion = process.versions.node,
  baseEnvironment = process.env,
  runner = spawnSync,
  runtimeFactory,
}) {
  const callerWorktree = captureGitVisibleWorktree(root)
  const dependencies = await runVerifiedGovernanceDependencyBootstrap({
    root,
    platform,
    nodeVersion,
    baseEnvironment,
    runner,
    ...(runtimeFactory ? { runtimeFactory } : {}),
    authorityPaths: SETUP_AUTHORITY_PATHS,
    expectedNpmrcLines: ['legacy-peer-deps=true', 'ignore-scripts=true'],
    errorPrefix: 'GOV-SETUP-001',
    validateRoleRepository: assertCommittedSetupSnapshot,
    afterStage({ index }) {
      assertGitVisibleWorktreeUnchanged(root, callerWorktree, { label: `consumer dependency stage ${index + 1}` })
    },
  })
  return { callerWorktree, dependencies }
}

export async function runInstalledGovernanceCheck({
  root: rootPath = join(dirname(fileURLToPath(import.meta.url)), '..'),
  baseEnvironment = process.env,
  runner = spawnSync,
  callerWorktree: requestedCallerWorktree,
} = {}) {
  const root = realpathSync(resolve(rootPath))
  const callerWorktree = requestedCallerWorktree || captureGitVisibleWorktree(root)
  const checkerCapability = materializeInstalledCheckerClosure(root)
  const environment = sanitizeGovernanceBootstrapEnvironment(baseEnvironment)
  try {
    runStep(process.execPath, [checkerCapability.checker, '--repo', root, '--hooks-off'], { root, runner, env: environment })
    checkerCapability.verify()
    assertGitVisibleWorktreeUnchanged(root, callerWorktree, { label: 'installed provider-neutral governance check' })
    return {
      checkerCorpusSha256: checkerCapability.corpusSha256,
      root,
      status: 'passed',
    }
  } finally {
    checkerCapability.cleanup()
  }
}

export async function runGovernanceDependencySetup({
  root: rootPath = join(dirname(fileURLToPath(import.meta.url)), '..'),
  platform = process.platform,
  nodeVersion = process.versions.node,
  baseEnvironment = process.env,
  runner = spawnSync,
  runtimeFactory,
} = {}) {
  const root = realpathSync(resolve(rootPath))
  return withNodeModulesRollback(root, async () => {
    const { dependencies } = await runGovernanceDependencyBootstrap({
      root,
      platform,
      nodeVersion,
      baseEnvironment,
      runner,
      runtimeFactory,
    })
    return {
      root,
      steps: ['verified-exact-npm-runtime', 'locked-install', 'exact-npm-signature-audit', 'high-vulnerability-audit'],
      toolchain: dependencies.toolchain,
    }
  })
}

export async function runGovernanceSetup({
  root: rootPath = join(dirname(fileURLToPath(import.meta.url)), '..'),
  platform = process.platform,
  nodeVersion = process.versions.node,
  baseEnvironment = process.env,
  runner = spawnSync,
  runtimeFactory,
} = {}) {
  const root = realpathSync(resolve(rootPath))
  return withNodeModulesRollback(root, async () => {
    const { callerWorktree, dependencies } = await runGovernanceDependencyBootstrap({
      root,
      platform,
      nodeVersion,
      baseEnvironment,
      runner,
      runtimeFactory,
    })
    await runInstalledGovernanceCheck({ root, baseEnvironment, runner, callerWorktree })
    return {
      root,
      steps: ['verified-exact-npm-runtime', 'locked-install', 'exact-npm-signature-audit', 'high-vulnerability-audit', 'installed-hooks-off-check'],
      toolchain: dependencies.toolchain,
    }
  })
}

const isMain = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
if (isMain) {
  try {
    const args = process.argv.slice(2)
    const closedMode = args[0]
    const hasClosedRoot = args.length === 3
      && (closedMode === '--dependencies-only' || closedMode === '--installed-check-only')
      && args[1] === '--root'
      && typeof args[2] === 'string'
      && args[2].length > 0
      && !args[2].startsWith('--')
    invariant(
      args.length === 0 || hasClosedRoot,
      'usage: setup-governance.mjs [--dependencies-only|--installed-check-only --root <repository>]',
    )
    const result = args.length === 0
      ? await runGovernanceSetup()
      : closedMode === '--dependencies-only'
        ? await runGovernanceDependencySetup({ root: args[2] })
        : await runInstalledGovernanceCheck({ root: args[2] })
    const label = args.length === 0
      ? 'setup'
      : closedMode === '--dependencies-only'
        ? 'dependency setup'
        : 'installed check'
    console.log(`✅ provider-neutral governance ${label} verified:${result.root}`)
  } catch (error) {
    console.error(`❌ provider-neutral governance setup failed:${error.message}`)
    process.exit(1)
  }
}

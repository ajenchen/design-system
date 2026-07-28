#!/usr/bin/env node
// Explicit, exact consumer upgrade entrypoint.
//
// Default behaviour is read-only planning. Workspace mutation requires BOTH an exact
// version and `--apply`; mutable dist-tags (`beta`, `latest`) and semver ranges are
// rejected. Normal fleet upgrades should be performed on a bot/user branch and reviewed
// as a PR. SessionStart must never call this command with --apply.

import {
  closeSync,
  constants as fsConstants,
  cpSync,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { hostname } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertNoSymlinkPath,
  assertSafeTree,
  canonicalRepositoryRoot,
  collectProviderMutationPaths,
  normalizeRepositoryRelative,
  pathEntryExists,
  validateInstalledForkCorpus,
} from './refresh-fork-launchers.mjs'
import { validateUpgradeTrustPolicy } from './verify-upgrade-provenance.mjs'
import { reconstructExpectedUpgrade } from './verify-upgrade-evidence.mjs'
import { REVIEWED_CONTROL_PLANE_UPDATE_ROUTE } from './lib/consumer-control-plane-policy.mjs'
import { assertNoRootNpmShrinkwrap } from './lib/governance-dependency-bootstrap.mjs'
import {
  assertClosedGitLocalConfiguration,
  runClosedGit,
} from './lib/closed-tool-execution.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const repoRoot = canonicalRepositoryRoot(process.cwd())
assertNoRootNpmShrinkwrap(repoRoot, { errorPrefix: 'GOV-UPGRADE-LOCK-001' })
const journalPath = join(repoRoot, '.governance-upgrade-journal.json')
const OWNER_MARKER = '.governance-upgrade-owner.json'
const LEGACY_JOURNAL_PUBLISH = '.governance-upgrade-journal.publish'
const JOURNAL_LEASE_SOURCE = '.governance-upgrade-journal.lease'
const JOURNAL_LEASE_KIND = 'governance-upgrade-journal-lease'
const JOURNAL_STATE_DIRECTORY = '.governance-upgrade-journal-states'
const JOURNAL_STATE_KIND = 'governance-upgrade-journal-state'
const JOURNAL_STATE_NAME = /^state-([0-9]{16})\.json$/
const JOURNAL_STATE_PUBLISH_NAME = /^\.state-([0-9]{16})\.publish$/
const TEST_RELEASE_HANDSHAKE_OPTION = '--test-journal-release-handshake'
const TEST_RELEASE_ACK = '.governance-upgrade-test-release-ack'
const TEST_GC_FAILURE_OPTION = '--test-transaction-gc-failure'
const TEST_NODE_MODULES_PUBLISH_HANDSHAKE_OPTION = '--test-node-modules-publish-handshake'
const TEST_NODE_MODULES_PUBLISH_ACK = '.governance-upgrade-test-node-modules-publish-ack'
const TEST_CONSUMER_ROLE_GAP_HANDSHAKE_OPTION = '--test-consumer-role-gap-handshake'
const TEST_CONSUMER_ROLE_GAP_ACK = '.governance-upgrade-test-consumer-role-gap-ack'
const PROVIDER_CLI_AUTHORITY_MANIFEST = 'infra/governance/providers/provider-cli-toolchain.json'
const PROVIDER_CLI_CONSUMER_MANIFEST = 'governance/provider-cli-toolchain.json'
const authorityProviderManifestPresent = pathEntryExists(join(repoRoot, PROVIDER_CLI_AUTHORITY_MANIFEST))
const TRANSACTION_PATHS = Object.freeze([
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', '.npmrc',
  'governance', 'schemas', '.devcontainer', '.github', 'scripts',
])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_RE = /^[a-f0-9]{64}$/
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const ignoredRepositoryPaths = (repository, paths, label) => {
  const normalized = [...new Set(paths.map((path, index) => (
    normalizeRepositoryRelative(path, `${label} path[${index}]`)
  )))].sort()
  if (!normalized.length) return []
  const probe = runClosedGit([
    'ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...normalized,
  ], { cwd: repository, output: 'buffer', maxOutputBytes: 64 * 1024 * 1024 })
  if (probe.error || probe.signal !== null || probe.status !== 0 || !Buffer.isBuffer(probe.stdout)) {
    throw new Error(`${label} ignored-inventory probe failed`)
  }
  return Buffer.from(probe.stdout)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort()
}
const assertNoIgnoredManagedContent = (repository, paths, label) => {
  const ignored = ignoredRepositoryPaths(repository, paths, label)
  if (ignored.length) {
    throw new Error(`${label} contains ignored content outside the reviewable patch boundary:${ignored.join(',')}`)
  }
}
const processIsAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}
const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an open or incomplete schema`)
  }
}
const providerCliStaticReceipt = (value, label, { setup = false } = {}) => {
  exactKeys(
    value,
    ['authorityDigest', 'lockDigest', 'platform', 'role', 'staticVerified', 'status', 'target', 'executablesProbed', 'versions'],
    label,
  )
  if (
    !SHA256_RE.test(value.authorityDigest)
    || !SHA256_RE.test(value.lockDigest)
    || !/^(?:darwin|linux)-(?:arm64|x64)$/.test(value.platform)
    || value.role !== 'consumer'
    || value.staticVerified !== true
    || value.executablesProbed !== false
    || value.versions !== null
    || typeof value.target !== 'string'
    || !value.target
    || !(setup ? ['installed', 'ready'].includes(value.status) : value.status === 'static-verified')
  ) throw new Error(`${label} is not a closed static-only provider CLI receipt`)
  return Object.freeze({
    authorityDigest: value.authorityDigest,
    lockDigest: value.lockDigest,
    platform: value.platform,
    role: value.role,
    staticVerified: true,
    executablesProbed: false,
    runtimeCertified: false,
  })
}
const assertSameProviderCliIdentity = (left, right, label) => {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} provider CLI identity differs across static verification boundaries`)
  }
}
const regularFile = (path, label) => {
  const info = lstatSync(path)
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) throw new Error(`${label} must be one regular non-symlink file`)
  return path
}
const sameFileIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino
const stableRegularFile = (path, label, { links = null, mode = 0o600 } = {}) => {
  const before = lstatSync(path, { bigint: true })
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || (Array.isArray(links) && !links.includes(Number(before.nlink)))
    || Number(before.mode & 0o777n) !== mode
  ) throw new Error(`${label} is not one closed regular file`)
  const bytes = readFileSync(path)
  const after = lstatSync(path, { bigint: true })
  if (
    !after.isFile()
    || after.isSymbolicLink()
    || !sameFileIdentity(after, before)
    || after.nlink !== before.nlink
    || after.mode !== before.mode
    || after.size !== before.size
    || after.mtimeNs !== before.mtimeNs
    || after.ctimeNs !== before.ctimeNs
    || BigInt(bytes.length) !== before.size
  ) throw new Error(`${label} changed while it was read`)
  return { bytes, info: after }
}
const writeFsyncedExclusive = (path, bytes, label) => {
  let descriptor
  try {
    descriptor = openSync(path, 'wx', 0o600)
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
  const written = stableRegularFile(path, label, { links: [1] })
  if (!written.bytes.equals(bytes)) throw new Error(`${label} readback differs from the published bytes`)
  return written.info
}
const journalStateNames = (sequence) => {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 9_999_999_999_999_999) {
    throw new Error('upgrade journal state sequence is invalid')
  }
  const suffix = String(sequence).padStart(16, '0')
  return {
    final: `state-${suffix}.json`,
    publish: `.state-${suffix}.publish`,
  }
}
const publishJournalState = ({ transactionRoot, journal, sequence, previousStateSha256 }) => {
  const stateRoot = join(transactionRoot, JOURNAL_STATE_DIRECTORY)
  if (sequence === 0) mkdirSync(stateRoot, { mode: 0o700 })
  const rootInfo = lstatSync(stateRoot)
  if (
    !rootInfo.isDirectory()
    || rootInfo.isSymbolicLink()
    || realpathSync(stateRoot) !== stateRoot
    || (rootInfo.mode & 0o777) !== 0o700
  ) throw new Error('upgrade journal state root is unsafe')
  const envelope = {
    schemaVersion: 1,
    kind: JOURNAL_STATE_KIND,
    sequence,
    previousStateSha256,
    journal: structuredClone(journal),
  }
  const bytes = Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`)
  const names = journalStateNames(sequence)
  const publishPath = join(stateRoot, names.publish)
  const finalPath = join(stateRoot, names.final)
  const publishInfo = writeFsyncedExclusive(publishPath, bytes, `upgrade journal state ${sequence} publication object`)
  linkSync(publishPath, finalPath)
  const final = stableRegularFile(finalPath, `upgrade journal state ${sequence}`, { links: [2] })
  const alias = lstatSync(publishPath, { bigint: true })
  if (
    !sameFileIdentity(final.info, publishInfo)
    || !sameFileIdentity(final.info, alias)
    || alias.nlink !== 2n
  ) throw new Error(`upgrade journal state ${sequence} publication alias is not exact`)
  return sha256(bytes)
}
const loadLatestJournalState = (transactionRoot, lease) => {
  const stateRoot = join(transactionRoot, JOURNAL_STATE_DIRECTORY)
  const rootInfo = lstatSync(stateRoot)
  if (
    !rootInfo.isDirectory()
    || rootInfo.isSymbolicLink()
    || realpathSync(stateRoot) !== stateRoot
    || (rootInfo.mode & 0o777) !== 0o700
  ) throw new Error('upgrade recovery journal state root is unsafe')
  const names = readdirSync(stateRoot).sort()
  const finalSequences = names
    .map(name => name.match(JOURNAL_STATE_NAME))
    .filter(Boolean)
    .map(match => Number(match[1]))
  if (!finalSequences.length) throw new Error('upgrade recovery journal has no committed state')
  for (const [index, sequence] of finalSequences.entries()) {
    if (sequence !== index) throw new Error('upgrade recovery journal state sequence is not contiguous')
  }
  const finalSet = new Set(finalSequences)
  const publishSequences = names
    .map(name => name.match(JOURNAL_STATE_PUBLISH_NAME))
    .filter(Boolean)
    .map(match => Number(match[1]))
  const recognized = new Set([
    ...finalSequences.map(sequence => journalStateNames(sequence).final),
    ...publishSequences.map(sequence => journalStateNames(sequence).publish),
  ])
  if (recognized.size !== names.length || names.some(name => !recognized.has(name))) {
    throw new Error('upgrade recovery journal state inventory is open')
  }
  let previousStateSha256 = null
  let latestJournal = null
  for (const sequence of finalSequences) {
    const stateNames = journalStateNames(sequence)
    if (!publishSequences.includes(sequence)) throw new Error(`upgrade recovery journal state ${sequence} lost its publication object`)
    const final = stableRegularFile(join(stateRoot, stateNames.final), `upgrade recovery journal state ${sequence}`, { links: [2] })
    const alias = lstatSync(join(stateRoot, stateNames.publish), { bigint: true })
    if (
      !alias.isFile()
      || alias.isSymbolicLink()
      || alias.nlink !== 2n
      || Number(alias.mode & 0o777n) !== 0o600
      || !sameFileIdentity(alias, final.info)
    ) throw new Error(`upgrade recovery journal state ${sequence} publication alias differs`)
    let envelope
    try { envelope = JSON.parse(final.bytes.toString('utf8')) } catch { throw new Error(`upgrade recovery journal state ${sequence} is invalid JSON`) }
    exactKeys(envelope, ['schemaVersion', 'kind', 'sequence', 'previousStateSha256', 'journal'], `upgrade recovery journal state ${sequence}`)
    if (
      envelope.schemaVersion !== 1
      || envelope.kind !== JOURNAL_STATE_KIND
      || envelope.sequence !== sequence
      || envelope.previousStateSha256 !== previousStateSha256
    ) throw new Error(`upgrade recovery journal state ${sequence} chain binding is invalid`)
    if (
      envelope.journal?.repoRoot !== lease.repoRoot
      || envelope.journal?.transactionId !== lease.transactionId
      || envelope.journal?.transactionRoot !== lease.transactionRoot
      || JSON.stringify(envelope.journal?.owner) !== JSON.stringify(lease.owner)
    ) throw new Error(`upgrade recovery journal state ${sequence} differs from its immutable lease`)
    latestJournal = envelope.journal
    previousStateSha256 = sha256(final.bytes)
  }
  const trailing = publishSequences.filter(sequence => !finalSet.has(sequence))
  if (
    trailing.length > 1
    || (trailing.length === 1 && trailing[0] !== finalSequences.at(-1) + 1)
  ) throw new Error('upgrade recovery journal has an invalid uncommitted state publication')
  if (trailing.length === 1) {
    const pending = lstatSync(join(stateRoot, journalStateNames(trailing[0]).publish), { bigint: true })
    if (
      !pending.isFile()
      || pending.isSymbolicLink()
      || pending.nlink !== 1n
      || Number(pending.mode & 0o777n) !== 0o600
    ) throw new Error('upgrade recovery journal pending state object is unsafe')
  }
  return { journal: latestJournal, sequence: finalSequences.at(-1), stateSha256: previousStateSha256 }
}
const journalLeaseBody = ({ transactionRoot, transactionId, owner }) => ({
  schemaVersion: 1,
  kind: JOURNAL_LEASE_KIND,
  repoRoot,
  transactionId,
  transactionRoot,
  owner: structuredClone(owner),
})
const publishJournalLease = (lease) => {
  const source = join(lease.transactionRoot, JOURNAL_LEASE_SOURCE)
  const bytes = Buffer.from(`${JSON.stringify(lease, null, 2)}\n`)
  const sourceInfo = writeFsyncedExclusive(source, bytes, 'upgrade journal lease source')
  let linked = false
  try {
    linkSync(source, journalPath)
    linked = true
    const published = stableRegularFile(journalPath, 'published upgrade journal lease', { links: [2] })
    const sourceAfter = lstatSync(source, { bigint: true })
    if (
      !published.bytes.equals(bytes)
      || !sameFileIdentity(published.info, sourceInfo)
      || !sameFileIdentity(published.info, sourceAfter)
      || sourceAfter.nlink !== 2n
    ) throw new Error('published upgrade journal lease differs from its capability source')
    return { bytes, info: published.info, source }
  } catch (error) {
    if (linked) {
      try {
        releaseJournalPointer({
          expectedIdentity: { bytes, info: sourceInfo, kind: JOURNAL_LEASE_KIND },
          transactionRoot: lease.transactionRoot,
          label: 'failed upgrade journal lease publication',
        })
      } catch (releaseError) {
        releaseError.preserveTransactionRoot = true
        throw releaseError
      }
    }
    throw error
  }
}
const assertPublishedJournalLease = (leaseIdentity) => {
  assertNoSymlinkPath(repoRoot, journalPath, 'owned upgrade journal lease', { allowMissing: false })
  const published = stableRegularFile(journalPath, 'owned upgrade journal lease', { links: [2] })
  const source = stableRegularFile(leaseIdentity.source, 'owned upgrade journal lease source', { links: [2] })
  if (
    !sameFileIdentity(published.info, leaseIdentity.info)
    || !sameFileIdentity(source.info, leaseIdentity.info)
    || !published.bytes.equals(leaseIdentity.bytes)
    || !source.bytes.equals(leaseIdentity.bytes)
  ) throw new Error('upgrade journal lease ownership changed during transaction')
  return published.info
}
const releaseJournalPointer = ({ expectedIdentity, transactionRoot, label }) => {
  assertNoSymlinkPath(repoRoot, dirname(journalPath), `${label} parent`, { allowMissing: false })
  const captureRoot = join(transactionRoot, `.governance-upgrade-lease-release-${randomUUID()}`)
  mkdirSync(captureRoot, { mode: 0o700 })
  const capturedPath = join(captureRoot, 'captured')
  // Rename preserves whichever inode currently occupies the public name. It never overwrites an
  // existing destination because the destination lives in a freshly-created random capability slot.
  renameSync(journalPath, capturedPath)
  let captured
  try {
    captured = stableRegularFile(capturedPath, `${label} captured pointer`, {
      links: expectedIdentity.kind === JOURNAL_LEASE_KIND ? [2] : [1, 2],
    })
  } catch (error) {
    try { linkSync(capturedPath, journalPath) } catch (restoreError) {
      if (restoreError?.code !== 'EEXIST') throw restoreError
    }
    throw new Error(`${label} could not be validated after capture; captured bytes were preserved`, { cause: error })
  }
  if (!sameFileIdentity(captured.info, expectedIdentity.info) || !captured.bytes.equals(expectedIdentity.bytes)) {
    // Restore the unknown bytes with atomic create-if-absent. If another writer has already claimed
    // the public name, both versions remain preserved: one there and one in this capability root.
    try { linkSync(capturedPath, journalPath) } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
    throw new Error(`${label} changed before release; substituted bytes were preserved`)
  }
  return capturedPath
}
const pathFingerprint = (path, label, { allowHardlinks = false } = {}) => {
  if (!pathEntryExists(path)) return null
  const rows = []
  const visit = (absolute, relativePath = '.') => {
    const info = lstatSync(absolute)
    if (info.isSymbolicLink()) throw new Error(`${label} contains a symbolic link:${relativePath}`)
    const mode = (info.mode & 0o777).toString(8).padStart(3, '0')
    if (info.isDirectory()) {
      rows.push(`tree:${relativePath}:${mode}`)
      for (const name of readdirSync(absolute).sort()) visit(join(absolute, name), relativePath === '.' ? name : `${relativePath}/${name}`)
      return
    }
    if (!info.isFile() || (!allowHardlinks && info.nlink !== 1) || (allowHardlinks && info.nlink > 2)) {
      throw new Error(`${label} contains an unsupported or hard-linked entry:${relativePath}`)
    }
    rows.push(`file:${relativePath}:${mode}:${sha256(readFileSync(absolute))}`)
  }
  visit(path)
  return sha256(`${rows.join('\n')}\n`)
}
const nodeModulesFingerprint = (path, label) => {
  if (!pathEntryExists(path)) return null
  const rows = []
  const stableIdentity = (before, after) => (
    before.dev === after.dev
    && before.ino === after.ino
    && before.mode === after.mode
    && before.size === after.size
    && before.mtimeNs === after.mtimeNs
    && before.ctimeNs === after.ctimeNs
    && before.nlink === after.nlink
  )
  const directoryNames = (absolute, relativePath) => readdirSync(absolute, { encoding: 'buffer' })
    .map((bytes) => {
      const name = bytes.toString('utf8')
      if (
        !Buffer.from(name, 'utf8').equals(bytes)
        || !name
        || name === '.'
        || name === '..'
        || name.includes('/')
        || name.includes('\0')
      ) throw new Error(`${label} contains an unsupported directory name:${relativePath}`)
      return { bytes, name }
    })
    .sort((left, right) => Buffer.compare(left.bytes, right.bytes))
  const visit = (absolute, relativePath) => {
    const before = lstatSync(absolute, { bigint: true })
    const mode = Number(before.mode & 0o777n)
    if (before.isSymbolicLink()) {
      if (before.nlink !== 1n) throw new Error(`${label} contains a hard-linked symbolic link:${relativePath}`)
      const target = readlinkSync(absolute, { encoding: 'buffer' })
      const after = lstatSync(absolute, { bigint: true })
      if (!after.isSymbolicLink() || !stableIdentity(before, after)) {
        throw new Error(`${label} symbolic link changed while hashing:${relativePath}`)
      }
      rows.push(JSON.stringify({
        kind: 'symlink',
        mode,
        path: relativePath,
        targetSha256: sha256(target),
        targetBytes: target.length,
      }))
      return
    }
    if (before.isDirectory()) {
      const names = directoryNames(absolute, relativePath)
      rows.push(JSON.stringify({ kind: 'directory', mode, path: relativePath }))
      for (const { name } of names) {
        visit(join(absolute, name), relativePath === '.' ? name : `${relativePath}/${name}`)
      }
      const namesAfter = directoryNames(absolute, relativePath)
      const after = lstatSync(absolute, { bigint: true })
      if (
        !after.isDirectory()
        || !stableIdentity(before, after)
        || names.length !== namesAfter.length
        || names.some((entry, index) => !entry.bytes.equals(namesAfter[index].bytes))
      ) throw new Error(`${label} directory changed while hashing:${relativePath}`)
      return
    }
    if (!before.isFile() || before.nlink !== 1n) {
      throw new Error(`${label} contains an unsupported or hard-linked entry:${relativePath}`)
    }
    let descriptor = null
    let opened
    let openedAfter
    let bytes
    try {
      const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
      descriptor = openSync(absolute, fsConstants.O_RDONLY | noFollow)
      opened = fstatSync(descriptor, { bigint: true })
      if (!opened.isFile() || opened.nlink !== 1n || !stableIdentity(before, opened)) {
        throw new Error(`${label} file changed before hashing:${relativePath}`)
      }
      bytes = readFileSync(descriptor)
      openedAfter = fstatSync(descriptor, { bigint: true })
    } finally {
      if (descriptor !== null) closeSync(descriptor)
    }
    const after = lstatSync(absolute, { bigint: true })
    if (
      BigInt(bytes.length) !== before.size
      || !openedAfter.isFile()
      || !stableIdentity(opened, openedAfter)
      || !after.isFile()
      || !stableIdentity(before, after)
    ) throw new Error(`${label} file changed while hashing:${relativePath}`)
    rows.push(JSON.stringify({
      bytes: bytes.length,
      contentSha256: sha256(bytes),
      kind: 'file',
      mode,
      path: relativePath,
    }))
  }
  const root = lstatSync(path)
  if (!root.isDirectory() || root.isSymbolicLink() || realpathSync(path) !== resolve(path)) {
    throw new Error(`${label} root must be one real directory`)
  }
  visit(path, '.')
  return sha256(`qijenchen-node-modules-tree-v1\0${rows.join('\n')}\n`)
}
const attachBeforeState = (entry, label) => ({
  ...entry,
  beforeFingerprint: entry.present ? pathFingerprint(entry.backup, `${label} before-image`) : null,
  afterRecorded: false,
  afterPresent: false,
  afterFingerprint: null,
  replacementStarted: false,
  replacementCompleted: false,
})
const captureCandidateState = (entry, candidatePath, label) => {
  const present = pathEntryExists(candidatePath)
  return {
    ...entry,
    afterRecorded: true,
    afterPresent: present,
    afterFingerprint: present ? pathFingerprint(candidatePath, `${label} candidate after-image`) : null,
    replacementStarted: false,
    replacementCompleted: false,
  }
}
const validateStateRecord = (entry, label) => {
  if (
    typeof entry.present !== 'boolean'
    || typeof entry.afterRecorded !== 'boolean'
    || typeof entry.afterPresent !== 'boolean'
    || typeof entry.replacementStarted !== 'boolean'
    || typeof entry.replacementCompleted !== 'boolean'
  ) {
    throw new Error(`${label} state flags are invalid`)
  }
  if (entry.present ? !SHA256_RE.test(entry.beforeFingerprint || '') : entry.beforeFingerprint !== null) {
    throw new Error(`${label} before-image fingerprint is invalid`)
  }
  if (!entry.afterRecorded) {
    if (
      entry.afterPresent !== false
      || entry.afterFingerprint !== null
      || entry.replacementStarted
      || entry.replacementCompleted
    ) throw new Error(`${label} uncommitted after-image is invalid`)
  } else if (entry.afterPresent ? !SHA256_RE.test(entry.afterFingerprint || '') : entry.afterFingerprint !== null) {
    throw new Error(`${label} after-image fingerprint is invalid`)
  }
  if (entry.replacementCompleted && !entry.replacementStarted) {
    throw new Error(`${label} completed replacement was never started`)
  }
}
const NODE_MODULES_STATE_KEYS = Object.freeze([
  'source', 'backup', 'present', 'beforeFingerprint',
  'afterRecorded', 'afterPresent', 'afterFingerprint',
  'replacementStarted', 'replacementCompleted',
])
const validateNodeModulesStateRecord = (entry, label) => {
  exactKeys(entry, NODE_MODULES_STATE_KEYS, label)
  validateStateRecord(entry, label)
  if (entry.afterRecorded && entry.afterPresent !== true) {
    throw new Error(`${label} must bind one present candidate node_modules tree`)
  }
}
const captureNodeModulesAfterState = (entry, candidatePath, label) => {
  const fingerprint = nodeModulesFingerprint(candidatePath, `${label} candidate after-image`)
  if (!SHA256_RE.test(fingerprint || '')) throw new Error(`${label} candidate node_modules tree is absent`)
  entry.afterRecorded = true
  entry.afterPresent = true
  entry.afterFingerprint = fingerprint
  entry.replacementStarted = false
  entry.replacementCompleted = false
  return entry
}
const inspectNodeModulesJournalState = (entry, candidatePath, label) => {
  validateNodeModulesStateRecord(entry, `${label} state`)
  const sourcePresent = pathEntryExists(entry.source)
  const backupPresent = pathEntryExists(entry.backup)
  const candidatePresent = candidatePath !== null && pathEntryExists(candidatePath)
  const sourceFingerprint = sourcePresent
    ? nodeModulesFingerprint(entry.source, `${label} live source`)
    : null
  const backupFingerprint = backupPresent
    ? nodeModulesFingerprint(entry.backup, `${label} recovery backup`)
    : null
  const candidateFingerprint = candidatePresent
    ? nodeModulesFingerprint(candidatePath, `${label} candidate source`)
    : null

  if (backupPresent && (!entry.present || backupFingerprint !== entry.beforeFingerprint)) {
    throw new Error(`${label} recovery backup is an unknown node_modules image`)
  }
  if (candidatePresent && (!entry.afterRecorded || candidateFingerprint !== entry.afterFingerprint)) {
    throw new Error(`${label} candidate source is an unknown node_modules image`)
  }
  const sourceIsBefore = sourcePresent
    && entry.present
    && sourceFingerprint === entry.beforeFingerprint
  const sourceIsAfter = sourcePresent
    && entry.afterRecorded
    && sourceFingerprint === entry.afterFingerprint
  const exactBeforeState = sourceIsBefore && !backupPresent
  const exactAfterState = sourceIsAfter
    && entry.replacementStarted
    && backupPresent === entry.present
    && !candidatePresent
  const controlledGap = !sourcePresent
    && entry.replacementStarted
    && !entry.replacementCompleted
    && (
      (entry.present && backupPresent)
      || (!entry.present && !backupPresent)
    )
  const originalAbsence = !sourcePresent
    && !entry.present
    && !backupPresent
    && !entry.replacementCompleted
  if (!(exactBeforeState || exactAfterState || controlledGap || originalAbsence)) {
    throw new Error(`${label} recovery blocked by unknown post-journal node_modules content`)
  }
  if (entry.replacementCompleted && !exactAfterState && !exactBeforeState) {
    throw new Error(`${label} completed replacement has no exact live image`)
  }
  return {
    backupFingerprint,
    backupPresent,
    candidateFingerprint,
    candidatePresent,
    exactAfterState,
    exactBeforeState,
    sourceFingerprint,
    sourceIsAfter,
    sourceIsBefore,
    sourcePresent,
  }
}
const assertNodeModulesBeforeState = (entry, candidatePath, label) => {
  const state = inspectNodeModulesJournalState(entry, candidatePath, label)
  if (!state.exactBeforeState && !(entry.present === false && state.sourcePresent === false && state.backupPresent === false)) {
    throw new Error(`${label} base changed during disposable reconstruction`)
  }
  if (!entry.afterRecorded || !state.candidatePresent) {
    throw new Error(`${label} candidate after-image is not capability-bound`)
  }
}
const assertNodeModulesCommitState = (entry, label) => {
  const state = inspectNodeModulesJournalState(entry, null, label)
  if (!entry.replacementCompleted || !state.exactAfterState) {
    throw new Error(`${label} is not the exact completed candidate image`)
  }
}
const restoreNodeModulesFromJournal = (entry, candidatePath, label) => {
  const state = inspectNodeModulesJournalState(entry, candidatePath, label)
  if (state.exactBeforeState || (!entry.present && !state.sourcePresent && !state.backupPresent)) return
  if (state.sourcePresent) {
    if (!state.sourceIsAfter) throw new Error(`${label} refuses to remove an unknown live node_modules image`)
    safeRemoveRepositoryTarget('node_modules')
  }
  if (entry.present) {
    if (!pathEntryExists(entry.backup)) throw new Error(`${label} lost its exact predecessor node_modules image`)
    renameSync(entry.backup, entry.source)
  }
  const finalPresent = pathEntryExists(entry.source)
  const finalFingerprint = finalPresent
    ? nodeModulesFingerprint(entry.source, `${label} restored predecessor`)
    : null
  if (finalPresent !== entry.present || finalFingerprint !== entry.beforeFingerprint) {
    throw new Error(`${label} did not restore the exact predecessor node_modules image`)
  }
}
const assertRecoverableLiveState = (
  entry,
  label,
  transientPath = null,
  transientCandidatePath = null,
  transientRestorePath = null,
  transientRecoveryMovedPath = null,
) => {
  const movedBeforePresent = transientPath !== null && pathEntryExists(transientPath)
  if (movedBeforePresent) {
    if (!entry.present || !entry.replacementStarted) {
      throw new Error(`recovery has an impossible moved before-image:${entry.path}`)
    }
    if (pathFingerprint(transientPath, `${label} moved before-image`) !== entry.beforeFingerprint) {
      throw new Error(`recovery blocked by changed moved before-image:${entry.path}`)
    }
  } else if (entry.present && entry.replacementCompleted) {
    throw new Error(`recovery lost the completed replacement before-image:${entry.path}`)
  }
  const present = pathEntryExists(entry.source)
  let linkedCandidate = false
  const possibleAliases = [transientCandidatePath, transientRestorePath]
    .filter((path) => path !== null && pathEntryExists(path))
  if (present && possibleAliases.length) {
    const sourceInfo = lstatSync(entry.source)
    linkedCandidate = sourceInfo.isFile()
      && !sourceInfo.isSymbolicLink()
      && sourceInfo.nlink === 2
      && possibleAliases.some((alias) => {
        const aliasInfo = lstatSync(alias)
        return aliasInfo.isFile()
          && !aliasInfo.isSymbolicLink()
          && aliasInfo.nlink === 2
          && sourceInfo.dev === aliasInfo.dev
          && sourceInfo.ino === aliasInfo.ino
      })
  }
  const fingerprint = present
    ? pathFingerprint(entry.source, `${label} live target`, { allowHardlinks: linkedCandidate })
    : null
  const beforeMatches = present === entry.present && fingerprint === entry.beforeFingerprint
  const afterMatches = entry.afterRecorded && present === entry.afterPresent && fingerprint === entry.afterFingerprint
  const candidatePresent = transientCandidatePath !== null && pathEntryExists(transientCandidatePath)
  const afterHasCapabilityEvidence = entry.replacementCompleted
    || (
      entry.replacementStarted
      && (
        entry.present
          ? movedBeforePresent
          : !entry.afterPresent
            || !candidatePresent
            || (present && sameRegularInode(entry.source, transientCandidatePath))
      )
    )
  const controlledTransientAbsence = entry.replacementStarted
    && !entry.replacementCompleted
    && entry.present
    && !present
    && movedBeforePresent
  const controlledRecoveryAbsence = entry.replacementStarted
    && !present
    && transientRecoveryMovedPath !== null
    && pathEntryExists(transientRecoveryMovedPath)
    && (
      knownFingerprint(
        entry,
        transientRecoveryMovedPath,
        `${label} recovery-moved image`,
        transientCandidatePath,
      ),
      true
    )
  const validState = beforeMatches
    || (afterMatches && afterHasCapabilityEvidence)
    || controlledTransientAbsence
    || controlledRecoveryAbsence
  if (!validState) {
    throw new Error(`recovery blocked by unknown post-journal content:${entry.path}`)
  }
}
const assertBeforeLiveState = (entry, label) => {
  const present = pathEntryExists(entry.source)
  const fingerprint = present ? pathFingerprint(entry.source, `${label} live before-image`) : null
  if (present !== entry.present || fingerprint !== entry.beforeFingerprint) {
    throw new Error(`transaction base changed during disposable reconstruction:${entry.path}`)
  }
}
const sameRegularInode = (left, right) => {
  if (!pathEntryExists(left) || !pathEntryExists(right)) return false
  const leftInfo = lstatSync(left)
  const rightInfo = lstatSync(right)
  return leftInfo.isFile()
    && rightInfo.isFile()
    && !leftInfo.isSymbolicLink()
    && !rightInfo.isSymbolicLink()
    && leftInfo.dev === rightInfo.dev
    && leftInfo.ino === rightInfo.ino
}
const knownFingerprint = (entry, path, label, aliasPath = null) => {
  const allowHardlinks = aliasPath !== null && sameRegularInode(path, aliasPath)
  const fingerprint = pathFingerprint(path, label, { allowHardlinks })
  if (fingerprint !== entry.beforeFingerprint && (!entry.afterRecorded || fingerprint !== entry.afterFingerprint)) {
    throw new Error(`recovery blocked by unknown moved content:${entry.path}`)
  }
  return fingerprint
}
const recoveryArtifactPaths = (transactionRoot, category, index) => {
  const slot = join(transactionRoot, 'recovery-staging', category, String(index))
  return {
    slot,
    restoreTemporary: join(slot, 'restore.tmp'),
    restore: join(slot, 'restore'),
    moved: join(slot, 'moved'),
  }
}
const validateRecoveryArtifactSlot = ({ entry, transactionRoot, category, index, label }) => {
  const paths = recoveryArtifactPaths(transactionRoot, category, index)
  if (!pathEntryExists(paths.slot)) return paths
  const slotInfo = lstatSync(paths.slot)
  if (!slotInfo.isDirectory() || slotInfo.isSymbolicLink() || realpathSync(paths.slot) !== paths.slot) {
    throw new Error(`${label} recovery slot is unsafe`)
  }
  const allowed = new Set(['restore.tmp', 'restore', 'moved'])
  for (const name of readdirSync(paths.slot)) {
    if (!allowed.has(name)) throw new Error(`${label} recovery slot has unowned content:${name}`)
  }
  if (pathEntryExists(paths.restoreTemporary)) {
    if (!entry.present) throw new Error(`${label} absent before-image has a temporary recovery copy`)
    assertSafeTree(transactionRoot, paths.restoreTemporary, `${label} temporary recovery copy`)
    const temporaryInfo = lstatSync(paths.restoreTemporary)
    const backupInfo = lstatSync(entry.backup)
    if (temporaryInfo.isDirectory() !== backupInfo.isDirectory() || temporaryInfo.isFile() !== backupInfo.isFile()) {
      throw new Error(`${label} temporary recovery copy has the wrong kind`)
    }
  }
  if (pathEntryExists(paths.restore)) {
    if (!entry.present) throw new Error(`${label} absent before-image has a recovery copy`)
    const linkedLive = sameRegularInode(entry.source, paths.restore)
    if (linkedLive) {
      const restoreInfo = lstatSync(paths.restore)
      const sourceInfo = lstatSync(entry.source)
      if (restoreInfo.nlink !== 2 || sourceInfo.nlink !== 2) {
        throw new Error(`${label} recovery publication has an unexpected hard-link shape`)
      }
    } else {
      assertSafeTree(transactionRoot, paths.restore, `${label} recovery copy`)
    }
    if (pathFingerprint(paths.restore, `${label} recovery copy`, { allowHardlinks: linkedLive }) !== entry.beforeFingerprint) {
      throw new Error(`${label} recovery copy differs from before-image`)
    }
  }
  if (pathEntryExists(paths.moved)) {
    const candidatePath = join(transactionRoot, 'candidate-staging', entry.path)
    const linkedCandidate = sameRegularInode(paths.moved, candidatePath)
    if (linkedCandidate) {
      const movedInfo = lstatSync(paths.moved)
      const candidateInfo = lstatSync(candidatePath)
      if (movedInfo.nlink !== 2 || candidateInfo.nlink !== 2) {
        throw new Error(`${label} recovery moved image has an unexpected hard-link shape`)
      }
    } else {
      assertSafeTree(transactionRoot, paths.moved, `${label} recovery moved image`)
    }
    knownFingerprint(entry, paths.moved, `${label} recovery moved image`, candidatePath)
  }
  return paths
}
const restoreEntryAtomically = ({ entry, transactionRoot, category, index, label }) => {
  const { slot, restoreTemporary, restore: restorePath, moved: movedPath } = recoveryArtifactPaths(
    transactionRoot,
    category,
    index,
  )
  const candidatePath = join(transactionRoot, 'candidate-staging', entry.path)
  const activeMovedPath = join(transactionRoot, 'live-staging', category, String(index))
  mkdirSync(slot, { recursive: true })
  assertNoSymlinkPath(transactionRoot, slot, `${label} recovery slot`, { allowMissing: false })
  validateRecoveryArtifactSlot({ entry, transactionRoot, category, index, label })

  // A crash can land between link(2) and unlinking the restore alias. Close that exact inode pair
  // first; no other hard-link shape is accepted as a recovery state.
  if (sameRegularInode(entry.source, restorePath)) rmSync(restorePath)

  if (pathEntryExists(movedPath)) {
    knownFingerprint(entry, movedPath, `${label} prior recovery move`, candidatePath)
  }

  assertRecoverableLiveState(entry, label, activeMovedPath, candidatePath, restorePath, movedPath)

  const sourcePresent = pathEntryExists(entry.source)
  const sourceFingerprint = sourcePresent
    ? pathFingerprint(entry.source, `${label} recovery live target`, {
        allowHardlinks: sameRegularInode(entry.source, candidatePath),
      })
    : null
  const beforeMatches = sourcePresent === entry.present && sourceFingerprint === entry.beforeFingerprint
  if (beforeMatches) return

  if (entry.present) {
    if (pathEntryExists(restoreTemporary)) rmSync(restoreTemporary, { recursive: true, force: true })
    if (!pathEntryExists(restorePath)) {
      cpSync(entry.backup, restoreTemporary, { recursive: true, verbatimSymlinks: true })
      if (pathFingerprint(restoreTemporary, `${label} complete temporary recovery copy`) !== entry.beforeFingerprint) {
        throw new Error(`recovery copy differs from before-image:${entry.path}`)
      }
      renameSync(restoreTemporary, restorePath)
    }
  } else if (pathEntryExists(restorePath) || pathEntryExists(restoreTemporary)) {
    throw new Error(`absent before-image has an unexpected recovery copy:${entry.path}`)
  }

  if (pathEntryExists(movedPath)) {
    knownFingerprint(entry, movedPath, `${label} prior recovery move`, candidatePath)
    if (pathEntryExists(entry.source)) {
      throw new Error(`recovery target was recreated after its known image was preserved:${entry.path}`)
    }
  } else if (pathEntryExists(entry.source)) {
    renameSync(entry.source, movedPath)
    try {
      knownFingerprint(entry, movedPath, `${label} atomically moved recovery image`, candidatePath)
    } catch (error) {
      if (!pathEntryExists(entry.source)) renameSync(movedPath, entry.source)
      throw error
    }
  }

  if (pathEntryExists(entry.source)) {
    throw new Error(`recovery destination appeared during restore:${entry.path}`)
  }
  if (entry.present) {
    const restoreInfo = lstatSync(restorePath)
    if (restoreInfo.isFile() && !restoreInfo.isSymbolicLink()) {
      linkSync(restorePath, entry.source)
      rmSync(restorePath)
    } else {
      renameSync(restorePath, entry.source)
    }
  }
  const finalPresent = pathEntryExists(entry.source)
  const finalFingerprint = finalPresent ? pathFingerprint(entry.source, `${label} restored before-image`) : null
  if (finalPresent !== entry.present || finalFingerprint !== entry.beforeFingerprint) {
    throw new Error(`recovery did not converge to before-image:${entry.path}`)
  }
  assertRecoverableLiveState(entry, label, activeMovedPath, candidatePath, restorePath, movedPath)
}
const expectedTransactionRoot = (transactionId) => join(dirname(repoRoot), `.governance-upgrade-${transactionId}`)
const validateTransactionRoot = (rawRoot, transactionId, owner) => {
  if (!UUID_RE.test(transactionId || '')) throw new Error('journal transactionId is invalid')
  const expected = expectedTransactionRoot(transactionId)
  if (typeof rawRoot !== 'string' || rawRoot !== expected || resolve(rawRoot) !== expected) {
    throw new Error('journal transactionRoot is not the exact capability-bound sibling path')
  }
  const info = lstatSync(expected)
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(expected) !== expected) {
    throw new Error('journal transactionRoot must be a real sibling directory')
  }
  const markerPath = join(expected, OWNER_MARKER)
  regularFile(markerPath, 'transaction owner marker')
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  exactKeys(marker, ['schemaVersion', 'repoRoot', 'transactionId', 'owner'], 'transaction owner marker')
  exactKeys(marker.owner, ['host', 'pid'], 'transaction owner marker owner')
  if (
    marker.schemaVersion !== 2
    || marker.repoRoot !== repoRoot
    || marker.transactionId !== transactionId
    || JSON.stringify(marker.owner) !== JSON.stringify(owner)
  ) {
    throw new Error('transaction owner marker does not bind this repository and capability')
  }
  return expected
}
const safeRemoveRepositoryTarget = (relativePath) => {
  const normalized = normalizeRepositoryRelative(relativePath, 'transaction target')
  const target = join(repoRoot, normalized)
  // Only the final target may have been replaced by the interrupted install. rmSync removes a
  // final symlink itself; every parent remains inside the canonical repository and non-symlink.
  assertNoSymlinkPath(repoRoot, dirname(target), `transaction target parent:${normalized}`, { allowMissing: false })
  if (pathEntryExists(target)) {
    rmSync(target, { recursive: true, force: true })
  }
}
const validateRecoveryJournal = () => {
  assertNoSymlinkPath(repoRoot, journalPath, 'upgrade recovery journal', { allowMissing: false })
  const pointer = stableRegularFile(journalPath, 'upgrade recovery journal pointer', { links: [1, 2] })
  let pointerValue
  try { pointerValue = JSON.parse(pointer.bytes.toString('utf8')) } catch { throw new Error('upgrade recovery journal pointer is invalid JSON') }
  const versioned = pointerValue?.kind === JOURNAL_LEASE_KIND
  let journal
  let journalInfo = pointer.info
  let transactionRoot
  if (versioned) {
    exactKeys(pointerValue, ['schemaVersion', 'kind', 'repoRoot', 'transactionId', 'transactionRoot', 'owner'], 'upgrade recovery journal lease')
    if (pointerValue.schemaVersion !== 1 || pointerValue.repoRoot !== repoRoot) {
      throw new Error('upgrade recovery journal lease repository/schema binding mismatch')
    }
  } else {
    journal = pointerValue
  }
  const binding = versioned ? pointerValue : journal
  if (!UUID_RE.test(binding.transactionId || '')) throw new Error('journal transactionId is invalid')
  exactKeys(binding.owner, ['host', 'pid'], 'upgrade recovery journal owner')
  if (
    typeof binding.owner.host !== 'string'
    || !binding.owner.host
    || !Number.isSafeInteger(binding.owner.pid)
    || binding.owner.pid <= 0
  ) throw new Error('upgrade recovery journal owner is invalid')
  if (binding.owner.host !== hostname()) {
    throw new Error(`transaction owner host cannot be proven inactive:${binding.owner.host}`)
  }
  if (processIsAlive(binding.owner.pid)) throw new Error(`upgrade transaction is still active on pid ${binding.owner.pid}`)
  transactionRoot = validateTransactionRoot(binding.transactionRoot, binding.transactionId, binding.owner)
  if (versioned) {
    const leaseSource = stableRegularFile(
      join(transactionRoot, JOURNAL_LEASE_SOURCE),
      'upgrade recovery journal lease source',
      { links: [2] },
    )
    if (
      journalInfo.nlink !== 2n
      || !sameFileIdentity(leaseSource.info, journalInfo)
      || !leaseSource.bytes.equals(pointer.bytes)
    ) throw new Error('upgrade recovery journal lease differs from its capability source')
    journal = loadLatestJournalState(transactionRoot, pointerValue).journal
  } else {
    // Legacy schema-v5 journals remain recoverable across the lease protocol rollout. A two-link
    // crash state is accepted only when the exact capability-owned publication alias still exists.
    if (journalInfo.nlink === 2n) {
      const initialTemporary = join(transactionRoot, LEGACY_JOURNAL_PUBLISH)
      const temporary = stableRegularFile(initialTemporary, 'legacy upgrade journal publication alias', { links: [2] })
      if (!sameFileIdentity(temporary.info, journalInfo) || !temporary.bytes.equals(pointer.bytes)) {
        throw new Error('upgrade recovery journal has an unbound hard-link alias')
      }
    } else if (journalInfo.nlink !== 1n) {
      throw new Error('upgrade recovery journal has an unexpected hard-link alias')
    }
  }
  exactKeys(journal, ['schemaVersion', 'repoRoot', 'transactionId', 'transactionRoot', 'owner', 'entries', 'nodeModules', 'providerSnapshot', 'commonSnapshot'], 'upgrade recovery journal')
  const modernJournal = journal.schemaVersion === 6
  const legacyJournal = journal.schemaVersion === 5
  if ((!modernJournal && !legacyJournal) || journal.repoRoot !== repoRoot) throw new Error('journal repository/schema binding mismatch')
  if (!UUID_RE.test(journal.transactionId || '')) throw new Error('journal transactionId is invalid')
  exactKeys(journal.owner, ['host', 'pid'], 'upgrade recovery journal owner')
  if (
    typeof journal.owner.host !== 'string'
    || !journal.owner.host
    || !Number.isSafeInteger(journal.owner.pid)
    || journal.owner.pid <= 0
  ) throw new Error('upgrade recovery journal owner is invalid')
  if (
    journal.transactionId !== binding.transactionId
    || journal.transactionRoot !== transactionRoot
    || JSON.stringify(journal.owner) !== JSON.stringify(binding.owner)
  ) throw new Error('upgrade recovery journal state differs from its pointer binding')
  if (!Array.isArray(journal.entries) || journal.entries.length !== TRANSACTION_PATHS.length) {
    throw new Error('journal entries do not match the closed transaction allowlist')
  }
  const entries = journal.entries.map((entry, index) => {
    exactKeys(entry, ['path', 'source', 'backup', 'present', 'beforeFingerprint', 'afterRecorded', 'afterPresent', 'afterFingerprint', 'replacementStarted', 'replacementCompleted'], `journal entry ${index}`)
    const expectedPath = TRANSACTION_PATHS[index]
    const expectedSource = join(repoRoot, expectedPath)
    const expectedBackup = join(transactionRoot, String(index))
    if (
      entry.path !== expectedPath || entry.source !== expectedSource || entry.backup !== expectedBackup
      || typeof entry.present !== 'boolean'
    ) throw new Error(`journal entry ${index} is not the exact fixed transaction target`)
    validateStateRecord(entry, `journal entry ${index}`)
    assertNoSymlinkPath(repoRoot, dirname(expectedSource), `journal source parent:${expectedPath}`, { allowMissing: false })
    assertNoSymlinkPath(transactionRoot, expectedBackup, `journal backup:${expectedPath}`)
    if (entry.present) {
      if (!pathEntryExists(expectedBackup)) throw new Error(`missing recovery backup:${expectedPath}`)
      assertSafeTree(transactionRoot, expectedBackup, `journal backup tree:${expectedPath}`)
      if (pathFingerprint(expectedBackup, `journal backup:${expectedPath}`) !== entry.beforeFingerprint) {
        throw new Error(`recovery backup fingerprint mismatch:${expectedPath}`)
      }
    } else if (pathEntryExists(expectedBackup)) throw new Error(`unexpected backup for absent target:${expectedPath}`)
    return { ...entry }
  })
  const expectedModulesSource = join(repoRoot, 'node_modules')
  const expectedModulesBackup = join(transactionRoot, 'node_modules')
  if (modernJournal) validateNodeModulesStateRecord(journal.nodeModules, 'journal nodeModules')
  else exactKeys(journal.nodeModules, ['source', 'backup', 'present'], 'legacy journal nodeModules')
  if (
    journal.nodeModules.source !== expectedModulesSource
    || journal.nodeModules.backup !== expectedModulesBackup
    || typeof journal.nodeModules.present !== 'boolean'
  ) throw new Error('invalid node_modules journal entry')
  assertNoSymlinkPath(repoRoot, dirname(expectedModulesSource), 'node_modules source parent', { allowMissing: false })
  assertNoSymlinkPath(transactionRoot, expectedModulesBackup, 'node_modules recovery backup')
  const modulesBackupPresent = pathEntryExists(expectedModulesBackup)
  if (modulesBackupPresent) {
    const info = lstatSync(expectedModulesBackup)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('node_modules recovery backup must be a real directory')
  } else if (journal.nodeModules.present) {
    assertNoSymlinkPath(repoRoot, expectedModulesSource, 'unmoved node_modules recovery source', { allowMissing: false })
    const info = lstatSync(expectedModulesSource)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('missing both safe node_modules recovery source and backup')
  }
  if (!journal.nodeModules.present && modulesBackupPresent) throw new Error('unexpected node_modules backup for absent original')
  if (modernJournal) {
    inspectNodeModulesJournalState(
      journal.nodeModules,
      join(transactionRoot, 'candidate-staging', 'node_modules'),
      'journal node_modules',
    )
  }
  let providerSnapshot = null
  let authenticatedIncomingCorpus = null
  if (journal.providerSnapshot !== null) {
    exactKeys(journal.providerSnapshot, ['entries', 'evidence', 'evidenceRoot', 'paths'], 'journal providerSnapshot')
    exactKeys(journal.providerSnapshot.evidence, [
      'consumerBomSha256', 'forkCorpusLockSha256', 'manifestSha256', 'providerLifecycleSha256', 'releaseVersion',
    ], 'journal providerSnapshot evidence')
    const expectedEvidenceRoot = join(transactionRoot, 'provider-evidence')
    if (journal.providerSnapshot.evidenceRoot !== expectedEvidenceRoot) throw new Error('journal provider evidence root is not capability-bound')
    assertSafeTree(transactionRoot, expectedEvidenceRoot, 'journal provider evidence corpus')
    const installed = validateInstalledForkCorpus(expectedEvidenceRoot)
    authenticatedIncomingCorpus = installed
    if (JSON.stringify(journal.providerSnapshot.evidence) !== JSON.stringify(installed.evidence)) {
      throw new Error('journal provider snapshot is not bound to the installed manifest/corpus')
    }
    const expectedPaths = collectProviderMutationPaths(installed.manifest)
    if (JSON.stringify(journal.providerSnapshot.paths) !== JSON.stringify(expectedPaths)) {
      throw new Error('journal provider paths do not match the authenticated installed manifest')
    }
    if (!Array.isArray(journal.providerSnapshot.entries) || journal.providerSnapshot.entries.length !== expectedPaths.length) {
      throw new Error('journal provider entries do not match the authenticated provider path set')
    }
    const providerEntries = journal.providerSnapshot.entries.map((entry, index) => {
      exactKeys(entry, ['backup', 'path', 'present', 'source', 'beforeFingerprint', 'afterRecorded', 'afterPresent', 'afterFingerprint', 'replacementStarted', 'replacementCompleted'], `journal provider entry ${index}`)
      const expectedPath = expectedPaths[index]
      const expectedSource = join(repoRoot, expectedPath.path)
      const expectedBackup = join(transactionRoot, 'provider-staging', String(index))
      if (
        entry.path !== expectedPath.path || entry.source !== expectedSource || entry.backup !== expectedBackup
        || typeof entry.present !== 'boolean'
      ) throw new Error(`journal provider entry ${index} is not the authenticated provider target`)
      validateStateRecord(entry, `journal provider entry ${index}`)
      assertNoSymlinkPath(repoRoot, dirname(expectedSource), `journal provider source parent:${entry.path}`, { allowMissing: false })
      assertNoSymlinkPath(transactionRoot, expectedBackup, `journal provider backup:${entry.path}`)
      if (entry.present) {
        if (!pathEntryExists(expectedBackup)) throw new Error(`missing provider recovery backup:${entry.path}`)
        const info = lstatSync(expectedBackup)
        if ((expectedPath.kind === 'file' && !info.isFile()) || (expectedPath.kind === 'tree' && !info.isDirectory())) {
          throw new Error(`provider recovery backup kind mismatch:${entry.path}`)
        }
        assertSafeTree(transactionRoot, expectedBackup, `journal provider backup tree:${entry.path}`)
        if (pathFingerprint(expectedBackup, `journal provider backup:${entry.path}`) !== entry.beforeFingerprint) {
          throw new Error(`provider recovery backup fingerprint mismatch:${entry.path}`)
        }
      } else if (pathEntryExists(expectedBackup)) throw new Error(`unexpected provider backup for absent target:${entry.path}`)
      return { ...entry }
    })
    const providerStagingRoot = join(transactionRoot, 'provider-staging')
    const expectedProviderBackups = providerEntries
      .flatMap((entry, index) => entry.present ? [String(index)] : [])
      .sort()
    const actualProviderBackups = pathEntryExists(providerStagingRoot)
      ? readdirSync(providerStagingRoot).sort()
      : []
    if (JSON.stringify(actualProviderBackups) !== JSON.stringify(expectedProviderBackups)) {
      throw new Error('journal provider-staging inventory is not closed')
    }
    providerSnapshot = { ...journal.providerSnapshot, entries: providerEntries }
  } else if (pathEntryExists(join(transactionRoot, 'provider-staging'))) {
    // A crash may occur after inert provider backups are staged but before the atomically replaced
    // journal binds them. They are never used for restore and disappear with the transaction root.
    assertSafeTree(transactionRoot, join(transactionRoot, 'provider-staging'), 'unbound provider staging tree')
  }
  if (journal.providerSnapshot === null && pathEntryExists(join(transactionRoot, 'provider-evidence'))) {
    assertSafeTree(transactionRoot, join(transactionRoot, 'provider-evidence'), 'unbound provider evidence tree')
  }
  let commonSnapshot = null
  if (journal.commonSnapshot !== null) {
    if (!authenticatedIncomingCorpus) throw new Error('journal common snapshot has no authenticated incoming corpus')
    exactKeys(journal.commonSnapshot, ['backup', 'path', 'present', 'source', 'beforeFingerprint', 'afterRecorded', 'afterPresent', 'afterFingerprint', 'replacementStarted', 'replacementCompleted'], 'journal commonSnapshot')
    const expectedPath = normalizeRepositoryRelative(
      authenticatedIncomingCorpus.manifest.consumer.commonInstruction.destination,
      'authenticated common instruction destination',
    )
    const coveredByFixedRoot = TRANSACTION_PATHS.some(root => expectedPath === root || expectedPath.startsWith(`${root}/`))
    if (coveredByFixedRoot) throw new Error('journal common snapshot duplicates a fixed transaction target')
    const expectedSource = join(repoRoot, expectedPath)
    const expectedBackup = join(transactionRoot, 'common-staging', '0')
    if (
      journal.commonSnapshot.path !== expectedPath
      || journal.commonSnapshot.source !== expectedSource
      || journal.commonSnapshot.backup !== expectedBackup
      || typeof journal.commonSnapshot.present !== 'boolean'
    ) throw new Error('journal common snapshot is not bound to the authenticated common instruction')
    validateStateRecord(journal.commonSnapshot, 'journal commonSnapshot')
    assertNoSymlinkPath(repoRoot, dirname(expectedSource), 'journal common source parent', { allowMissing: false })
    assertNoSymlinkPath(transactionRoot, expectedBackup, 'journal common backup')
    if (journal.commonSnapshot.present) {
      if (!pathEntryExists(expectedBackup)) throw new Error('missing common-instruction recovery backup')
      const info = lstatSync(expectedBackup)
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('common-instruction recovery backup must be one regular unaliased file')
      if (pathFingerprint(expectedBackup, 'journal common backup') !== journal.commonSnapshot.beforeFingerprint) {
        throw new Error('common-instruction recovery backup fingerprint mismatch')
      }
    } else if (pathEntryExists(expectedBackup)) throw new Error('unexpected common-instruction backup for absent target')
    const commonStagingRoot = join(transactionRoot, 'common-staging')
    const expectedCommonBackups = journal.commonSnapshot.present ? ['0'] : []
    const actualCommonBackups = pathEntryExists(commonStagingRoot) ? readdirSync(commonStagingRoot).sort() : []
    if (JSON.stringify(actualCommonBackups) !== JSON.stringify(expectedCommonBackups)) {
      throw new Error('journal common-staging inventory is not closed')
    }
    commonSnapshot = { ...journal.commonSnapshot }
  } else {
    if (authenticatedIncomingCorpus) {
      const expectedPath = normalizeRepositoryRelative(
        authenticatedIncomingCorpus.manifest.consumer.commonInstruction.destination,
        'authenticated common instruction destination',
      )
      const coveredByFixedRoot = TRANSACTION_PATHS.some(root => expectedPath === root || expectedPath.startsWith(`${root}/`))
      if (!coveredByFixedRoot) throw new Error('journal omits the authenticated common-instruction transaction target')
    }
    if (pathEntryExists(join(transactionRoot, 'common-staging'))) {
      // Inert common backup staged before the second journal replacement is never recovery authority.
      assertSafeTree(transactionRoot, join(transactionRoot, 'common-staging'), 'unbound common-instruction staging tree')
    }
  }
  const recoveryRoot = join(transactionRoot, 'recovery-staging')
  if (pathEntryExists(recoveryRoot)) {
    const recoveryInfo = lstatSync(recoveryRoot)
    if (!recoveryInfo.isDirectory() || recoveryInfo.isSymbolicLink() || realpathSync(recoveryRoot) !== recoveryRoot) {
      throw new Error('journal recovery-staging root is unsafe')
    }
    const categories = new Map([
      ['fixed', entries],
      ['provider', providerSnapshot?.entries || []],
      ['common', commonSnapshot ? [commonSnapshot] : []],
    ])
    for (const category of readdirSync(recoveryRoot)) {
      const categoryEntries = categories.get(category)
      if (!categoryEntries?.length) throw new Error(`journal recovery-staging has unknown category:${category}`)
      const categoryRoot = join(recoveryRoot, category)
      const categoryInfo = lstatSync(categoryRoot)
      if (!categoryInfo.isDirectory() || categoryInfo.isSymbolicLink() || realpathSync(categoryRoot) !== categoryRoot) {
        throw new Error(`journal recovery-staging category is unsafe:${category}`)
      }
      for (const indexName of readdirSync(categoryRoot)) {
        if (!/^(0|[1-9][0-9]*)$/.test(indexName)) {
          throw new Error(`journal recovery-staging has invalid index:${category}/${indexName}`)
        }
        const index = Number(indexName)
        const entry = categoryEntries[index]
        if (!entry) throw new Error(`journal recovery-staging has unbound index:${category}/${indexName}`)
        validateRecoveryArtifactSlot({
          entry,
          transactionRoot,
          category,
          index,
          label: `journal ${category} target:${entry.path}`,
        })
      }
    }
  }
  const liveStaging = join(transactionRoot, 'live-staging')
  if (pathEntryExists(liveStaging)) {
    const liveInfo = lstatSync(liveStaging)
    if (!liveInfo.isDirectory() || liveInfo.isSymbolicLink() || realpathSync(liveStaging) !== liveStaging) {
      throw new Error('journal live-staging root is unsafe')
    }
    const categories = new Map([
      ['fixed', entries],
      ['provider', providerSnapshot?.entries || []],
      ['common', commonSnapshot ? [commonSnapshot] : []],
    ])
    for (const category of readdirSync(liveStaging)) {
      const categoryEntries = categories.get(category)
      if (!categoryEntries?.length) throw new Error(`journal live-staging has unknown category:${category}`)
      const categoryRoot = join(liveStaging, category)
      const categoryInfo = lstatSync(categoryRoot)
      if (!categoryInfo.isDirectory() || categoryInfo.isSymbolicLink() || realpathSync(categoryRoot) !== categoryRoot) {
        throw new Error(`journal live-staging category is unsafe:${category}`)
      }
      for (const indexName of readdirSync(categoryRoot)) {
        if (!/^(0|[1-9][0-9]*)$/.test(indexName)) {
          throw new Error(`journal live-staging has invalid index:${category}/${indexName}`)
        }
        const entry = categoryEntries[Number(indexName)]
        if (!entry || !entry.present || !entry.replacementStarted) {
          throw new Error(`journal live-staging has unbound index:${category}/${indexName}`)
        }
      }
    }
  }
  for (const inertRoot of ['candidate-staging', 'candidate-staging.tmp', 'live-staging']) {
    const absolute = join(transactionRoot, inertRoot)
    if (!pathEntryExists(absolute)) continue
    const info = lstatSync(absolute)
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(absolute) !== absolute) {
      throw new Error(`journal inert transaction root is unsafe:${inertRoot}`)
    }
    // candidate-staging may contain npm's legitimate .bin symlinks. It is never recovery
    // authority; recovery only removes the capability-bound sibling root. The moved live tree is
    // authoritative and was already validated before mutation, so keep its stronger closed-tree check.
    if (inertRoot === 'live-staging') assertSafeTree(transactionRoot, absolute, `journal inert transaction tree:${inertRoot}`)
  }
  const pendingJournalPublication = join(transactionRoot, LEGACY_JOURNAL_PUBLISH)
  if (pathEntryExists(pendingJournalPublication)) {
    const info = lstatSync(pendingJournalPublication)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
      throw new Error('journal pending publication is not one inert regular file')
    }
  }
  const allowedRootNames = new Set([
    OWNER_MARKER,
    ...(pathEntryExists(pendingJournalPublication) ? [LEGACY_JOURNAL_PUBLISH] : []),
    ...(versioned ? [JOURNAL_LEASE_SOURCE, JOURNAL_STATE_DIRECTORY] : []),
    ...entries.flatMap((entry, index) => entry.present ? [String(index)] : []),
    ...(modulesBackupPresent ? ['node_modules'] : []),
    ...(pathEntryExists(join(transactionRoot, 'provider-staging')) ? ['provider-staging'] : []),
    ...(pathEntryExists(join(transactionRoot, 'provider-evidence')) ? ['provider-evidence'] : []),
    ...(pathEntryExists(join(transactionRoot, 'common-staging')) ? ['common-staging'] : []),
    ...(pathEntryExists(join(transactionRoot, 'candidate-staging')) ? ['candidate-staging'] : []),
    ...(pathEntryExists(join(transactionRoot, 'candidate-staging.tmp')) ? ['candidate-staging.tmp'] : []),
    ...(pathEntryExists(join(transactionRoot, 'live-staging')) ? ['live-staging'] : []),
    ...(pathEntryExists(recoveryRoot) ? ['recovery-staging'] : []),
  ])
  for (const name of readdirSync(transactionRoot)) {
    if (!allowedRootNames.has(name)) throw new Error(`transaction root has unowned content:${name}`)
  }
  // Validate every live authoritative target before the first restore mutation. A crash-recovery
  // journal is not permission to erase edits made after the last committed transaction state.
  for (const [index, entry] of entries.entries()) {
    assertRecoverableLiveState(
      entry,
      `journal fixed target:${entry.path}`,
      join(transactionRoot, 'live-staging', 'fixed', String(index)),
      join(transactionRoot, 'candidate-staging', entry.path),
      join(transactionRoot, 'recovery-staging', 'fixed', String(index), 'restore'),
      join(transactionRoot, 'recovery-staging', 'fixed', String(index), 'moved'),
    )
  }
  for (const [index, entry] of (providerSnapshot?.entries || []).entries()) {
    assertRecoverableLiveState(
      entry,
      `journal provider target:${entry.path}`,
      join(transactionRoot, 'live-staging', 'provider', String(index)),
      join(transactionRoot, 'candidate-staging', entry.path),
      join(transactionRoot, 'recovery-staging', 'provider', String(index), 'restore'),
      join(transactionRoot, 'recovery-staging', 'provider', String(index), 'moved'),
    )
  }
  if (commonSnapshot) {
    assertRecoverableLiveState(
      commonSnapshot,
      'journal common-instruction target',
      join(transactionRoot, 'live-staging', 'common', '0'),
      join(transactionRoot, 'candidate-staging', commonSnapshot.path),
      join(transactionRoot, 'recovery-staging', 'common', '0', 'restore'),
      join(transactionRoot, 'recovery-staging', 'common', '0', 'moved'),
    )
  }
  return {
    journal,
    journalPointerIdentity: {
      bytes: pointer.bytes,
      info: pointer.info,
      kind: versioned ? JOURNAL_LEASE_KIND : 'legacy-schema-v5-journal',
    },
    transactionRoot,
    entries,
    providerSnapshot,
    commonSnapshot,
    modules: {
      entry: { ...journal.nodeModules },
      backupPresent: modulesBackupPresent,
      modern: modernJournal,
    },
  }
}
let recoveredInterruptedTransaction = false
const assertRecoveryConsumerRole = (entries) => {
  const governanceEntry = entries.find((entry) => entry.path === 'governance')
  if (!governanceEntry?.present) {
    throw new Error('upgrade recovery journal has no consumer governance before-image')
  }
  const manifestPath = join(governanceEntry.backup, 'provider-cli-toolchain.json')
  assertNoSymlinkPath(
    governanceEntry.backup,
    manifestPath,
    'upgrade recovery consumer provider CLI manifest',
    { allowMissing: false },
  )
  const manifestFile = stableRegularFile(
    manifestPath,
    'upgrade recovery consumer provider CLI manifest',
    { links: [1], mode: 0o644 },
  )
  let manifest
  try {
    manifest = JSON.parse(manifestFile.bytes.toString('utf8'))
  } catch {
    throw new Error('upgrade recovery consumer provider CLI manifest is not valid JSON')
  }
  if (
    manifest?.kind !== 'provider-cli-toolchain'
    || !Number.isSafeInteger(manifest.schemaVersion)
    || manifest.schemaVersion < 1
    || manifest.packageLock?.consumerPath !== 'governance/provider-cli-toolchain.package-lock.json'
  ) throw new Error('upgrade recovery journal before-image is not a consumer provider CLI authority mirror')
}

// A SIGKILL or abrupt process termination cannot run a finally block. Recover the exact, validated
// sibling backup on the next invocation before reading package.json or checking worktree cleanliness.
// This is a process-crash contract, not a physical power-loss/filesystem-durability claim.
if (!authorityProviderManifestPresent && pathEntryExists(journalPath)) {
  try {
    const {
      transactionRoot,
      journalPointerIdentity,
      entries,
      providerSnapshot,
      commonSnapshot,
      modules,
    } = validateRecoveryJournal()
    // The live consumer manifest can be path-absent when SIGKILL lands between the two atomic
    // governance-directory renames. Authenticate the immutable before-image instead of mistaking
    // that controlled gap for a non-consumer root. The authority marker is outside transaction
    // scope and was rejected before this journal was inspected.
    assertRecoveryConsumerRole(entries)
    // No mutation occurs until the entire journal, capability marker, fixed allowlist, every
    // backup, and the transaction-root inventory have been validated.
    for (const [index, entry] of entries.entries()) {
      restoreEntryAtomically({ entry, transactionRoot, category: 'fixed', index, label: `restore fixed target:${entry.path}` })
    }
    for (const [index, entry] of (providerSnapshot?.entries || []).entries()) {
      restoreEntryAtomically({ entry, transactionRoot, category: 'provider', index, label: `restore provider target:${entry.path}` })
    }
    if (commonSnapshot) {
      restoreEntryAtomically({ entry: commonSnapshot, transactionRoot, category: 'common', index: 0, label: 'restore common-instruction target' })
    }
    if (modules.modern) {
      restoreNodeModulesFromJournal(
        modules.entry,
        join(transactionRoot, 'candidate-staging', 'node_modules'),
        'restore node_modules',
      )
    } else if (modules.entry.present) {
      // The journal is written before the same-filesystem rename. Abrupt process termination may
      // therefore leave either the original source or the backup; both are safe, unambiguous states.
      if (modules.backupPresent) {
        safeRemoveRepositoryTarget('node_modules')
        renameSync(modules.entry.backup, modules.entry.source)
      }
    } else {
      safeRemoveRepositoryTarget('node_modules')
    }
    // Re-read every path-visible predecessor/recovery image immediately before deleting the
    // capability root. A writer that changed a moved inode after the first validation must leave
    // this journal intact for manual reconciliation rather than lose those bytes.
    for (const [index, entry] of entries.entries()) {
      validateRecoveryArtifactSlot({ entry, transactionRoot, category: 'fixed', index, label: `final restore fixed target:${entry.path}` })
      assertRecoverableLiveState(
        entry,
        `final restore fixed target:${entry.path}`,
        join(transactionRoot, 'live-staging', 'fixed', String(index)),
        join(transactionRoot, 'candidate-staging', entry.path),
        join(transactionRoot, 'recovery-staging', 'fixed', String(index), 'restore'),
        join(transactionRoot, 'recovery-staging', 'fixed', String(index), 'moved'),
      )
    }
    for (const [index, entry] of (providerSnapshot?.entries || []).entries()) {
      validateRecoveryArtifactSlot({ entry, transactionRoot, category: 'provider', index, label: `final restore provider target:${entry.path}` })
      assertRecoverableLiveState(
        entry,
        `final restore provider target:${entry.path}`,
        join(transactionRoot, 'live-staging', 'provider', String(index)),
        join(transactionRoot, 'candidate-staging', entry.path),
        join(transactionRoot, 'recovery-staging', 'provider', String(index), 'restore'),
        join(transactionRoot, 'recovery-staging', 'provider', String(index), 'moved'),
      )
    }
    if (commonSnapshot) {
      validateRecoveryArtifactSlot({ entry: commonSnapshot, transactionRoot, category: 'common', index: 0, label: 'final restore common-instruction target' })
      assertRecoverableLiveState(
        commonSnapshot,
        'final restore common-instruction target',
        join(transactionRoot, 'live-staging', 'common', '0'),
        join(transactionRoot, 'candidate-staging', commonSnapshot.path),
        join(transactionRoot, 'recovery-staging', 'common', '0', 'restore'),
        join(transactionRoot, 'recovery-staging', 'common', '0', 'moved'),
      )
    }
    if (modules.modern) {
      const restored = inspectNodeModulesJournalState(
        modules.entry,
        join(transactionRoot, 'candidate-staging', 'node_modules'),
        'final restore node_modules',
      )
      if (
        modules.entry.present
          ? !restored.exactBeforeState
          : restored.sourcePresent || restored.backupPresent
      ) throw new Error('final restore node_modules differs from its exact predecessor')
    }
    releaseJournalPointer({
      expectedIdentity: journalPointerIdentity,
      transactionRoot,
      label: 'upgrade recovery journal pointer',
    })
    // Releasing the public pointer is the recovery commit point. Capability-root deletion is
    // post-commit garbage collection and must never turn a completed restore into an unjournaled
    // second rollback attempt.
    try {
      rmSync(transactionRoot, { recursive: true, force: true })
    } catch (error) {
      console.error(`GOV-UPGRADE-RECOVERY-GC-DEFERRED:${transactionRoot}:${error?.message || error}`)
    }
    recoveredInterruptedTransaction = true
  } catch (error) {
    console.error(`GOV-UPGRADE-RECOVERY-BLOCKED:${error?.message || error}`)
    process.exit(2)
  }
}
const consumerProviderManifestPresent = pathEntryExists(join(repoRoot, PROVIDER_CLI_CONSUMER_MANIFEST))

const argv = process.argv.slice(2)
const cliFailure = (message) => {
  const diagnostic = {
    ruleId: 'GOV-UPGRADE-CLI-001',
    severity: 'BLOCKER',
    message,
  }
  if (argv.filter((token) => token === '--json').length === 1) {
    process.stdout.write(JSON.stringify({
      ok: false,
      mode: 'invalid',
      mutationAuthorized: false,
      syntaxValid: false,
      targetVerification: 'not-started',
      targetVerified: false,
      ready: false,
      diagnostics: [diagnostic],
    }, null, 2) + '\n')
  } else console.error(`${diagnostic.ruleId}:${message}`)
  process.exit(1)
}
const testReleaseHandshakeAuthorized = process.env.NODE_ENV === 'test'
const booleanOptions = new Set([
  '--apply',
  '--dry-run',
  '--json',
  ...(testReleaseHandshakeAuthorized ? [TEST_RELEASE_HANDSHAKE_OPTION] : []),
  ...(testReleaseHandshakeAuthorized ? [TEST_GC_FAILURE_OPTION] : []),
  ...(testReleaseHandshakeAuthorized ? [TEST_NODE_MODULES_PUBLISH_HANDSHAKE_OPTION] : []),
  ...(testReleaseHandshakeAuthorized ? [TEST_CONSUMER_ROLE_GAP_HANDSHAKE_OPTION] : []),
])
const valueOptions = new Set(['--to', '--design-system', '--storybook'])
const parsedOptions = new Map()
for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index]
  if (!booleanOptions.has(token) && !valueOptions.has(token)) cliFailure(`unknown or positional option:${token}`)
  if (parsedOptions.has(token)) cliFailure(`duplicate option:${token}`)
  if (booleanOptions.has(token)) {
    parsedOptions.set(token, true)
    continue
  }
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) cliFailure(`${token} requires one exact-version value`)
  parsedOptions.set(token, value)
  index += 1
}
if (parsedOptions.has('--apply') && parsedOptions.has('--dry-run')) cliFailure('--apply and --dry-run are mutually exclusive')
if (
  parsedOptions.has(TEST_RELEASE_HANDSHAKE_OPTION)
  && (!parsedOptions.has('--apply') || !parsedOptions.has('--json'))
) cliFailure(`${TEST_RELEASE_HANDSHAKE_OPTION} requires --apply and --json`)
if (
  parsedOptions.has(TEST_GC_FAILURE_OPTION)
  && (!parsedOptions.has('--apply') || !parsedOptions.has('--json'))
) cliFailure(`${TEST_GC_FAILURE_OPTION} requires --apply and --json`)
if (
  parsedOptions.has(TEST_NODE_MODULES_PUBLISH_HANDSHAKE_OPTION)
  && (!parsedOptions.has('--apply') || !parsedOptions.has('--json'))
) cliFailure(`${TEST_NODE_MODULES_PUBLISH_HANDSHAKE_OPTION} requires --apply and --json`)
if (
  parsedOptions.has(TEST_CONSUMER_ROLE_GAP_HANDSHAKE_OPTION)
  && (!parsedOptions.has('--apply') || !parsedOptions.has('--json'))
) cliFailure(`${TEST_CONSUMER_ROLE_GAP_HANDSHAKE_OPTION} requires --apply and --json`)
if (parsedOptions.has('--to') && (parsedOptions.has('--design-system') || parsedOptions.has('--storybook'))) {
  cliFailure('--to cannot be combined with --design-system or --storybook')
}
if (parsedOptions.has('--design-system') !== parsedOptions.has('--storybook')) {
  cliFailure('--design-system and --storybook must be supplied together')
}
if (parsedOptions.has('--apply') && !parsedOptions.has('--to') && !parsedOptions.has('--design-system')) {
  cliFailure('--apply requires --to or both explicit package targets')
}

const APPLY = parsedOptions.has('--apply')
const AS_JSON = parsedOptions.has('--json')
const TEST_RELEASE_HANDSHAKE = parsedOptions.has(TEST_RELEASE_HANDSHAKE_OPTION)
const TEST_GC_FAILURE = parsedOptions.has(TEST_GC_FAILURE_OPTION)
const TEST_NODE_MODULES_PUBLISH_HANDSHAKE = parsedOptions.has(TEST_NODE_MODULES_PUBLISH_HANDSHAKE_OPTION)
const TEST_CONSUMER_ROLE_GAP_HANDSHAKE = parsedOptions.has(TEST_CONSUMER_ROLE_GAP_HANDSHAKE_OPTION)
const DRY_RUN = !APPLY
const sharedTarget = parsedOptions.get('--to')
const dsTarget = parsedOptions.get('--design-system') || sharedTarget
const storybookTarget = parsedOptions.get('--storybook') || sharedTarget
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/
const parseVersion = (value) => {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) return null
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') ?? null }
}
const compareVersion = (a, b) => {
  const left = parseVersion(a); const right = parseVersion(b)
  if (!left || !right) return null
  for (let i = 0; i < 3; i += 1) if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i]
  if (left.pre === null || right.pre === null) return left.pre === right.pre ? 0 : left.pre === null ? 1 : -1
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
    if (left.pre[i] === undefined || right.pre[i] === undefined) return left.pre[i] === undefined ? -1 : 1
    if (left.pre[i] === right.pre[i]) continue
    const ln = /^\d+$/.test(left.pre[i]); const rn = /^\d+$/.test(right.pre[i])
    if (ln && rn) return Number(left.pre[i]) - Number(right.pre[i])
    if (ln !== rn) return ln ? -1 : 1
    // SemVer prerelease identifiers are ASCII-only. UTF-8 byte order is therefore the exact
    // locale-independent ASCII lexical order required for non-numeric identifiers.
    return compareUtf8Bytes(left.pre[i], right.pre[i])
  }
  return 0
}

const project = JSON.parse(readFileSync('package.json', 'utf8'))
const allDeps = { ...(project.dependencies || {}), ...(project.devDependencies || {}) }
const current = {
  designSystem: allDeps['@qijenchen/design-system'] || null,
  storybook: allDeps['@qijenchen/storybook-config'] || null,
}
let currentLock = null
try { currentLock = JSON.parse(readFileSync('package-lock.json', 'utf8')) } catch { /* checker reports malformed lock */ }
const currentResolved = {
  designSystem: currentLock?.packages?.['node_modules/@qijenchen/design-system']?.version || null,
  storybook: currentLock?.packages?.['node_modules/@qijenchen/storybook-config']?.version || null,
}

const report = {
  ok: true,
  mode: DRY_RUN ? 'plan' : 'apply',
  mutationAuthorized: APPLY,
  syntaxValid: true,
  targetVerification: DRY_RUN ? 'deferred' : 'pending',
  targetVerified: false,
  ready: false,
  current,
  target: { designSystem: dsTarget || null, storybook: storybookTarget || null },
  refresh: null,
  provenance: null,
  toolchain: null,
  verification: null,
  providerCli: null,
  rollback: null,
  transactionGarbageCollection: null,
  diagnostics: [],
}

if (authorityProviderManifestPresent || !consumerProviderManifestPresent) {
  report.ok = false
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-ROLE-001',
    severity: 'BLOCKER',
    message: authorityProviderManifestPresent
      ? 'sync-all 是 consumer-only upgrade 入口；DS authority 必須使用受審查的 authority control-plane/update 流程。'
      : `sync-all consumer 缺少必要的 provider CLI authority mirror:${PROVIDER_CLI_CONSUMER_MANIFEST}`,
  })
}

if (recoveredInterruptedTransaction) {
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-RECOVERY-001',
    severity: 'INFO',
    message: '已先從 process-crash recovery journal 完整還原前次中斷的 tracked snapshot 與 node_modules，再處理本次命令。',
  })
}

const emit = () => {
  if (AS_JSON) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }
  console.log(`Governance upgrade ${report.mode.toUpperCase()}(mutable dist-tags disabled)`)
  console.log(`  current: design-system=${current.designSystem || 'missing'} / storybook=${current.storybook || 'missing'}`)
  console.log(`  target : design-system=${dsTarget || 'not selected'} / storybook=${storybookTarget || 'not selected'}`)
  console.log(`  syntaxValid=${report.syntaxValid} / targetVerification=${report.targetVerification} / targetVerified=${report.targetVerified} / ready=${report.ready}`)
  for (const diagnostic of report.diagnostics) console.log(`  ${diagnostic.severity}: ${diagnostic.message}`)
}

const transactionFailureRule = (error) => {
  const message = String(error?.message || error || '')
  if (
    error?.code === 'GOV-PROVIDER-CLI-CONTROL-PLANE-UPDATE-REQUIRED'
    || message.includes('GOV-PROVIDER-CLI-CONTROL-PLANE-UPDATE-REQUIRED')
  ) return 'GOV-UPGRADE-BOOTSTRAP-001'
  if (message.includes('GOV-UPGRADE-BOOTSTRAP-001')) return 'GOV-UPGRADE-BOOTSTRAP-001'
  if (message.includes('GOV-UPGRADE-BOOTSTRAP-002')) return 'GOV-UPGRADE-BOOTSTRAP-002'
  if (/audit(?:\s|[^a-z]).*(?:high|vulnerab)|(?:high|vulnerab).*audit/i.test(message)) return 'GOV-SUPPLY-005'
  if (/signature|attestation bundle|certificate verification/i.test(message)) return 'GOV-SUPPLY-002'
  if (/provenance|slsa|immutable release|release bom|release asset|source workflow|workflow mismatch|git commit|git tag/i.test(message)) return 'GOV-SUPPLY-003'
  if (/verified exact npm|npm (?:runtime|toolchain|tarball)|tar integrity|registry.*npm/i.test(message)) return 'GOV-SUPPLY-004'
  if (/npm (?:ci|install)|dependency install/i.test(message)) return 'GOV-UPGRADE-003'
  if (/corpus|provider lifecycle|materiali[sz]ation|mutation authority|governance lock|managed path|launcher destination/i.test(message)) return 'GOV-UPGRADE-008'
  return 'GOV-UPGRADE-007'
}
const transactionFailureMessage = (error) => {
  const message = String(error?.message || error || '')
  const ruleId = transactionFailureRule(error)
  if (
    (ruleId === 'GOV-UPGRADE-BOOTSTRAP-001' || ruleId === 'GOV-UPGRADE-BOOTSTRAP-002')
    && !message.includes(REVIEWED_CONTROL_PLANE_UPDATE_ROUTE)
  ) {
    return `${message}; ${REVIEWED_CONTROL_PLANE_UPDATE_ROUTE}`
  }
  return message
}

for (const [name, version] of [['design-system', dsTarget], ['storybook', storybookTarget]]) {
  if (version && !exactVersion.test(version)) {
    report.ok = false
    report.syntaxValid = false
    report.diagnostics.push({
      ruleId: 'GOV-VERSION-001',
      severity: 'BLOCKER',
      message: `${name} 必須是 exact semver；拒絕 dist-tag/range: ${version}`,
    })
  }
}
if (dsTarget && storybookTarget && dsTarget !== storybookTarget) {
  report.ok = false
  report.syntaxValid = false
  report.diagnostics.push({
    ruleId: 'GOV-VERSION-002',
    severity: 'BLOCKER',
    message: `design-system / storybook-config 必須採同一不可變 release；收到 ${dsTarget} / ${storybookTarget}。`,
  })
}
for (const [name, target, installed] of [
  ['design-system', dsTarget, currentResolved.designSystem],
  ['storybook-config', storybookTarget, currentResolved.storybook],
]) {
  if (target && installed && compareVersion(target, installed) < 0) {
    report.ok = false
    report.diagnostics.push({
      ruleId: 'GOV-VERSION-003',
      severity: 'BLOCKER',
      message: `${name} monotonic upgrade required；拒絕 ${installed} → ${target} downgrade。Rollback 使用 transaction，不靠發布舊版本。`,
    })
  }
}

if (!dsTarget || !storybookTarget) {
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-001',
    severity: 'INFO',
    message: '未選 target；本次只讀取現況，不查詢 registry、不修改 package/lock/generated adapters。',
  })
  emit()
  process.exit(report.ok ? 0 : 1)
}

if (DRY_RUN && report.syntaxValid) {
  report.ok = false
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-VERIFICATION-001',
    severity: 'INFO',
    message: 'target syntax 已通過，但此 read-only plan 未查詢或驗證 immutable release、Release BOM、npm provenance 與簽章；targetVerification=deferred、ready=false。只有受保護的 --apply 流程才會先完成這些驗證，任一 target 不存在或證據無效時會在 live mutation 前 fail closed。',
  })
}

if (!report.ok || DRY_RUN) {
  emit()
  process.exit(1)
}

try {
  const governanceLockPath = join(repoRoot, 'governance/lock.json')
  assertNoSymlinkPath(repoRoot, governanceLockPath, 'current governance lock', { allowMissing: false })
  validateUpgradeTrustPolicy(JSON.parse(readFileSync(regularFile(governanceLockPath, 'current governance lock'), 'utf8')).upgradeTrust)
} catch (error) {
  report.ok = false
  report.diagnostics.push({
    ruleId: 'GOV-SUPPLY-001',
    severity: 'BLOCKER',
    message: `目前受信任 governance lock 缺少 closed upgradeTrust policy:${error?.message || error}`,
  })
  emit()
  process.exit(1)
}

let git
try {
  assertClosedGitLocalConfiguration(repoRoot)
  git = runClosedGit([
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--ignore-submodules=all',
    '--no-ahead-behind',
    '--no-renames',
  ], { cwd: repoRoot })
} catch (error) {
  git = { status: null, signal: null, error, stdout: '' }
}
if (git.error || git.signal !== null || git.status !== 0 || git.stdout.length !== 0) {
  report.ok = false
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-002',
    severity: 'BLOCKER',
    message: `upgrade apply 只允許在封閉 Git 邊界驗證為乾淨的 working tree 執行；請先保全既有變更並使用專用 upgrade branch。${git.error ? ` (${git.error.message})` : ''}`,
  })
  emit()
  process.exit(1)
}

const branch = runClosedGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: repoRoot })
const branchName = !branch.error && branch.signal === null && branch.status === 0 ? branch.stdout.trim() : ''
if (!branchName || /^(?:main|master)$/.test(branchName)) {
  report.ok = false
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-009',
    severity: 'BLOCKER',
    message: branchName
      ? `upgrade apply 不得直接在 ${branchName} 執行；請建立專用 upgrade branch 後再試。`
      : 'upgrade apply 不得在 detached HEAD 或無法驗證的 branch 執行；請切換到專用 upgrade branch。',
  })
  emit()
  process.exit(1)
}

const protectedBaseProbe = runClosedGit(['rev-parse', 'HEAD'], { cwd: repoRoot })
const protectedBaseSha = !protectedBaseProbe.error && protectedBaseProbe.signal === null && protectedBaseProbe.status === 0
  ? protectedBaseProbe.stdout.trim()
  : ''
if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(protectedBaseSha)) {
  report.ok = false
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-009',
    severity: 'BLOCKER',
    message: 'upgrade apply 無法綁定一個 exact protected-base commit。',
  })
  emit()
  process.exit(1)
}

try {
  validateInstalledForkCorpus(repoRoot)
} catch (error) {
  report.ok = false
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-008',
    severity: 'BLOCKER',
    message: `目前安裝的 provider corpus 無法作為 ordinary upgrade 的 immutable predecessor:${error?.message || error}`,
  })
  emit()
  process.exit(1)
}

// The host's ignored node_modules is never a toolchain trust root. The protected reconstruction
// independently downloads, measures and extracts the exact npm tarball bound by the committed
// package-lock, then uses only that disposable runtime for ci/install/signature/high-audit gates.

// Transaction boundary is a UUID capability-bound sibling of the repository, so node_modules can
// be moved atomically on the same filesystem. Reject symlinks anywhere in every managed tree before
// making even the first backup: a lexical in-repo path must never redirect a copy outside the repo.
const transactionId = randomUUID()
const transactionRoot = expectedTransactionRoot(transactionId)
const transactionOwner = { host: hostname(), pid: process.pid }
let transactionState
let nodeModulesState
let journal
let journalLeaseIdentity = null
let journalStateSequence = -1
let journalStateSha256 = null
try {
  assertNoIgnoredManagedContent(repoRoot, TRANSACTION_PATHS, 'live fixed transaction authority')
  for (const path of TRANSACTION_PATHS) {
    assertSafeTree(repoRoot, join(repoRoot, path), `transaction source:${path}`, { allowMissing: true })
  }
  const initialNodeModulesPresent = pathEntryExists(join(repoRoot, 'node_modules'))
  assertNoSymlinkPath(repoRoot, join(repoRoot, 'node_modules'), 'node_modules transaction source')
  if (initialNodeModulesPresent) {
    const info = lstatSync(join(repoRoot, 'node_modules'))
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('node_modules transaction source must be a real directory')
  }
  mkdirSync(transactionRoot, { mode: 0o700 })
  writeFileSync(join(transactionRoot, OWNER_MARKER), JSON.stringify({
    schemaVersion: 2,
    repoRoot,
    transactionId,
    owner: transactionOwner,
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  transactionState = TRANSACTION_PATHS.map((path, index) => {
    const source = join(repoRoot, path)
    const backup = join(transactionRoot, String(index))
    const present = pathEntryExists(source)
    assertNoSymlinkPath(transactionRoot, backup, `transaction backup:${path}`)
    if (present) cpSync(source, backup, { recursive: true })
    return attachBeforeState({ path, source, backup, present }, `fixed transaction target:${path}`)
  })
  // Repeat after every before-image is complete. An ignored file created during a recursive copy
  // must remain live and block the transaction; it must never become invisible backup content that
  // is later deleted by a whole-tree replacement.
  assertNoIgnoredManagedContent(repoRoot, TRANSACTION_PATHS, 'snapshotted live fixed transaction authority')
  nodeModulesState = {
    source: join(repoRoot, 'node_modules'),
    backup: join(transactionRoot, 'node_modules'),
    present: initialNodeModulesPresent,
    beforeFingerprint: initialNodeModulesPresent
      ? nodeModulesFingerprint(join(repoRoot, 'node_modules'), 'initial node_modules before-image')
      : null,
    afterRecorded: false,
    afterPresent: false,
    afterFingerprint: null,
    replacementStarted: false,
    replacementCompleted: false,
  }
  assertNoSymlinkPath(transactionRoot, nodeModulesState.backup, 'node_modules transaction backup')
  journal = {
    schemaVersion: 6,
    repoRoot,
    transactionId,
    transactionRoot,
    owner: transactionOwner,
    entries: transactionState,
    nodeModules: nodeModulesState,
    providerSnapshot: null,
    commonSnapshot: null,
  }
} catch (error) {
  rmSync(transactionRoot, { recursive: true, force: true })
  report.ok = false
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-007',
    severity: 'BLOCKER',
    message: `無法建立 closed upgrade transaction:${error?.message || error}`,
  })
  emit()
  process.exit(1)
}
const journalLease = journalLeaseBody({ transactionRoot, transactionId, owner: transactionOwner })
const persistJournal = ({ initial = false } = {}) => {
  if (initial !== (journalStateSequence === -1)) {
    throw new Error('upgrade journal initial/subsequent state transition is invalid')
  }
  if (!initial) assertPublishedJournalLease(journalLeaseIdentity)
  const nextSequence = journalStateSequence + 1
  const nextSha256 = publishJournalState({
    transactionRoot,
    journal,
    sequence: nextSequence,
    previousStateSha256: journalStateSha256,
  })
  journalStateSequence = nextSequence
  journalStateSha256 = nextSha256
  if (initial) journalLeaseIdentity = publishJournalLease(journalLease)
  else assertPublishedJournalLease(journalLeaseIdentity)
}
try {
  persistJournal({ initial: true })
} catch (error) {
  if (!error?.preserveTransactionRoot) rmSync(transactionRoot, { recursive: true, force: true })
  report.ok = false
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-010',
    severity: 'BLOCKER',
    message: `無法獨占取得 upgrade transaction；另一個 sync-all 可能仍在執行:${error?.message || error}`,
  })
  emit()
  process.exit(1)
}

let transactionClosed = false
let liveMutationStarted = false
let providerTransactionState = []
let commonTransactionState = null
let liveProviderCliCommitIdentity = null
const assertTransactionDiscardablesKnown = () => {
  if (!liveMutationStarted) return
  inspectNodeModulesJournalState(
    nodeModulesState,
    join(transactionRoot, 'candidate-staging', 'node_modules'),
    'cleanup node_modules',
  )
  for (const [index, entry] of journal.entries.entries()) {
    validateRecoveryArtifactSlot({ entry, transactionRoot, category: 'fixed', index, label: `cleanup fixed target:${entry.path}` })
    assertRecoverableLiveState(
      entry,
      `cleanup fixed target:${entry.path}`,
      join(transactionRoot, 'live-staging', 'fixed', String(index)),
      join(transactionRoot, 'candidate-staging', entry.path),
      join(transactionRoot, 'recovery-staging', 'fixed', String(index), 'restore'),
      join(transactionRoot, 'recovery-staging', 'fixed', String(index), 'moved'),
    )
  }
  for (const [index, entry] of (journal.providerSnapshot?.entries || []).entries()) {
    validateRecoveryArtifactSlot({ entry, transactionRoot, category: 'provider', index, label: `cleanup provider target:${entry.path}` })
    assertRecoverableLiveState(
      entry,
      `cleanup provider target:${entry.path}`,
      join(transactionRoot, 'live-staging', 'provider', String(index)),
      join(transactionRoot, 'candidate-staging', entry.path),
      join(transactionRoot, 'recovery-staging', 'provider', String(index), 'restore'),
      join(transactionRoot, 'recovery-staging', 'provider', String(index), 'moved'),
    )
  }
  if (journal.commonSnapshot) {
    const entry = journal.commonSnapshot
    validateRecoveryArtifactSlot({ entry, transactionRoot, category: 'common', index: 0, label: 'cleanup common-instruction target' })
    assertRecoverableLiveState(
      entry,
      'cleanup common-instruction target',
      join(transactionRoot, 'live-staging', 'common', '0'),
      join(transactionRoot, 'candidate-staging', entry.path),
      join(transactionRoot, 'recovery-staging', 'common', '0', 'restore'),
      join(transactionRoot, 'recovery-staging', 'common', '0', 'moved'),
    )
  }
}
const waitForTestAcknowledgment = ({ enabled, readyMarker, acknowledgmentName, label }) => {
  if (!enabled) return
  const acknowledgmentPath = join(transactionRoot, acknowledgmentName)
  process.stderr.write(`${readyMarker}\n`)
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (pathEntryExists(acknowledgmentPath)) {
      const acknowledgment = stableRegularFile(
        acknowledgmentPath,
        `${label} acknowledgment`,
        { links: [1] },
      )
      if (!acknowledgment.bytes.equals(Buffer.from('ACK\n'))) {
        throw new Error(`${label} acknowledgment is invalid`)
      }
      rmSync(acknowledgmentPath)
      return
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
  throw new Error(`${label} acknowledgment timed out`)
}
const cleanupTransaction = ({ commit = false } = {}) => {
  // Revalidate every predecessor and recovery image immediately before discarding the capability
  // root. Path-visible concurrent edits therefore remain preserved behind the journal and fail
  // closed. Uncooperative writers that retain an old open fd are outside the pathname-CAS contract.
  assertTransactionDiscardablesKnown()
  // Capture whichever inode is currently public before discarding the capability root. Only the
  // exact immutable lease can authorize deletion; substituted bytes are moved, restored with
  // create-if-absent, and preserved behind this transaction for manual reconciliation.
  assertPublishedJournalLease(journalLeaseIdentity)
  waitForTestAcknowledgment({
    enabled: TEST_RELEASE_HANDSHAKE,
    readyMarker: 'GOV-UPGRADE-TEST-JOURNAL-RELEASE-READY',
    acknowledgmentName: TEST_RELEASE_ACK,
    label: 'test journal release',
  })
  if (commit) {
    assertNodeModulesCommitState(nodeModulesState, 'commit node_modules')
    if (
      typeof protectedProviderCliStaticVerifier !== 'function'
      || !liveProviderCliCommitIdentity
    ) throw new Error('commit lost its protected-base provider CLI verifier capability')
    const commitProviderCli = providerCliStaticReceipt(
      protectedProviderCliStaticVerifier({ root: repoRoot }),
      'commit-bound live provider CLI',
    )
    assertSameProviderCliIdentity(
      liveProviderCliCommitIdentity,
      commitProviderCli,
      'live-to-commit',
    )
  }
  releaseJournalPointer({
    expectedIdentity: { ...journalLeaseIdentity, kind: JOURNAL_LEASE_KIND },
    transactionRoot,
    label: 'owned upgrade journal lease',
  })
  // The successful no-replace pointer release is the commit point. From here onward rollback has
  // no authority: deleting this private capability root is best-effort garbage collection only.
  transactionClosed = true
  try {
    if (commit && TEST_GC_FAILURE) {
      throw new Error('test-only transaction garbage-collection failure')
    }
    rmSync(transactionRoot, { recursive: true, force: true })
    report.transactionGarbageCollection = { completed: true, retainedPath: null }
  } catch (error) {
    report.transactionGarbageCollection = { completed: false, retainedPath: transactionRoot }
    report.diagnostics.push({
      ruleId: 'GOV-UPGRADE-GC-001',
      severity: 'INFO',
      message: `transaction 已提交；private recovery root 延後清理且不得觸發 rollback:${transactionRoot}:${error?.message || error}`,
    })
  }
}
const rollbackTransaction = (reason) => {
  if (transactionClosed) return
  if (!liveMutationStarted) {
    report.rollback = { restored: true, reason, derivedState: 'disposable reconstruction never mutated the live repository' }
    return
  }
  const fixedEntries = journal.entries
  const providerEntries = journal.providerSnapshot?.entries || []
  const commonEntry = journal.commonSnapshot
  // Validate the ignored installed tree before restoring any tracked path. Unknown bytes are never
  // removed under rollback authority; the immutable journal remains for manual reconciliation.
  inspectNodeModulesJournalState(
    nodeModulesState,
    join(transactionRoot, 'candidate-staging', 'node_modules'),
    'rollback node_modules',
  )
  // The owner may restore only states committed by the same closed journal. Concurrent unknown
  // edits are preserved and turn the transaction into an explicit manual-recovery blocker.
  for (const [index, entry] of fixedEntries.entries()) {
    assertRecoverableLiveState(
      entry,
      `rollback fixed target:${entry.path}`,
      join(liveStagingRoot, 'fixed', String(index)),
      join(transactionRoot, 'candidate-staging', entry.path),
      join(transactionRoot, 'recovery-staging', 'fixed', String(index), 'restore'),
      join(transactionRoot, 'recovery-staging', 'fixed', String(index), 'moved'),
    )
  }
  for (const [index, entry] of providerEntries.entries()) {
    assertRecoverableLiveState(
      entry,
      `rollback provider target:${entry.path}`,
      join(liveStagingRoot, 'provider', String(index)),
      join(transactionRoot, 'candidate-staging', entry.path),
      join(transactionRoot, 'recovery-staging', 'provider', String(index), 'restore'),
      join(transactionRoot, 'recovery-staging', 'provider', String(index), 'moved'),
    )
  }
  if (commonEntry) {
    assertRecoverableLiveState(
      commonEntry,
      'rollback common-instruction target',
      join(liveStagingRoot, 'common', '0'),
      join(transactionRoot, 'candidate-staging', commonEntry.path),
      join(transactionRoot, 'recovery-staging', 'common', '0', 'restore'),
      join(transactionRoot, 'recovery-staging', 'common', '0', 'moved'),
    )
  }
  for (const [index, entry] of fixedEntries.entries()) {
    restoreEntryAtomically({ entry, transactionRoot, category: 'fixed', index, label: `rollback fixed target:${entry.path}` })
  }
  for (const [index, entry] of providerEntries.entries()) {
    restoreEntryAtomically({ entry, transactionRoot, category: 'provider', index, label: `rollback provider target:${entry.path}` })
  }
  if (commonEntry) {
    restoreEntryAtomically({ entry: commonEntry, transactionRoot, category: 'common', index: 0, label: 'rollback common-instruction target' })
  }
  restoreNodeModulesFromJournal(
    nodeModulesState,
    join(transactionRoot, 'candidate-staging', 'node_modules'),
    'rollback node_modules',
  )
  report.rollback = { restored: true, reason, derivedState: 'original node_modules restored byte-for-byte by same-filesystem rename' }
}

const exitForSignal = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }
for (const signal of Object.keys(exitForSignal)) process.once(signal, () => {
  try { rollbackTransaction(`interrupted by ${signal}`); cleanupTransaction() }
  catch (error) { console.error(`GOV-UPGRADE-ROLLBACK-BLOCKED:${error?.message || error}`) }
  process.exit(exitForSignal[signal])
})

const candidateRoot = join(transactionRoot, 'candidate-staging')
const candidateTemporary = join(transactionRoot, 'candidate-staging.tmp')
const liveStagingRoot = join(transactionRoot, 'live-staging')
let reconstructedUpgrade = null
let reconstructedContext = null
let protectedProviderCliStaticVerifier = null

const copyClosedCandidatePath = (sandbox, relativePath) => {
  const normalized = normalizeRepositoryRelative(relativePath, 'candidate materialization path')
  const source = join(sandbox, normalized)
  const destination = join(candidateTemporary, normalized)
  assertNoSymlinkPath(sandbox, source, `candidate materialization source:${normalized}`)
  if (!pathEntryExists(source)) return
  assertSafeTree(sandbox, source, `candidate materialization source:${normalized}`)
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true })
}

const captureDisposableCandidate = async ({ sandbox, incomingCorpus, providerTransition, provenance, toolchain, authority, operations }) => {
  assertNoSymlinkPath(transactionRoot, candidateTemporary, 'candidate materialization temporary root')
  mkdirSync(candidateTemporary, { mode: 0o700 })
  for (const path of TRANSACTION_PATHS) copyClosedCandidatePath(sandbox, path)

  const providerPaths = providerTransition.paths.map((record) => ({ ...record }))
  for (const record of providerPaths) {
    const covered = TRANSACTION_PATHS.some((root) => record.path === root || record.path.startsWith(`${root}/`))
    if (covered) throw new Error(`provider path overlaps fixed transaction authority:${record.path}`)
    copyClosedCandidatePath(sandbox, record.path)
  }
  const commonPath = normalizeRepositoryRelative(
    incomingCorpus.manifest.consumer.commonInstruction.destination,
    'candidate common instruction destination',
  )
  if (
    providerPaths.some((record) => commonPath === record.path || commonPath.startsWith(`${record.path}/`) || record.path.startsWith(`${commonPath}/`))
  ) throw new Error(`common instruction overlaps provider transaction authority:${commonPath}`)
  const commonCovered = TRANSACTION_PATHS.some((root) => commonPath === root || commonPath.startsWith(`${root}/`))
  if (!commonCovered) copyClosedCandidatePath(sandbox, commonPath)

  assertNoIgnoredManagedContent(
    sandbox,
    [...TRANSACTION_PATHS, ...providerPaths.map((record) => record.path), commonPath],
    'disposable candidate managed authority',
  )

  // `reconstructExpectedUpgrade` created this private checkout from the exact protected-base index,
  // proved its tree equals protectedBaseSha, and rejected every scripts/** candidate operation before
  // invoking this callback. Load the privileged provider implementation only from that closed
  // checkout. A poisoned live worktree hidden behind skip-worktree/assume-unchanged is never imported.
  if (operations.some((entry) => entry.path === 'scripts' || entry.path.startsWith('scripts/'))) {
    throw new Error(`GOV-UPGRADE-BOOTSTRAP-001: provider CLI protected-base closure changed; ${REVIEWED_CONTROL_PLANE_UPDATE_ROUTE}`)
  }
  const providerModulePath = join(sandbox, 'scripts/setup-provider-cli-toolchain.mjs')
  assertNoSymlinkPath(sandbox, providerModulePath, 'protected-base provider CLI module', { allowMissing: false })
  regularFile(providerModulePath, 'protected-base provider CLI module')
  const providerModuleUrl = pathToFileURL(providerModulePath)
  providerModuleUrl.searchParams.set('protectedBaseSha', protectedBaseSha)
  const providerModule = await import(providerModuleUrl.href)
  if (
    typeof providerModule.setupProviderCliToolchain !== 'function'
    || typeof providerModule.verifyProviderCliToolchainStatic !== 'function'
  ) throw new Error('protected-base provider CLI module has an incompatible static API')
  const {
    setupProviderCliToolchain: protectedSetupProviderCliToolchain,
    verifyProviderCliToolchainStatic: protectedVerifyProviderCliToolchainStatic,
  } = providerModule
  protectedProviderCliStaticVerifier = protectedVerifyProviderCliToolchainStatic

  // Provider binaries are content-verified but deliberately not executed.
  const sandboxProviderCli = providerCliStaticReceipt(await protectedSetupProviderCliToolchain({
    root: sandbox,
    probeExecutables: false,
  }), 'disposable sandbox provider CLI setup', { setup: true })

  const candidateModulesSource = join(sandbox, 'node_modules')
  if (!pathEntryExists(candidateModulesSource)) throw new Error('disposable reconstruction did not produce node_modules')
  const candidateModulesInfo = lstatSync(candidateModulesSource)
  if (!candidateModulesInfo.isDirectory() || candidateModulesInfo.isSymbolicLink()) {
    throw new Error('disposable reconstructed node_modules is not a real directory')
  }
  // npm's .bin links are relative to their containing node_modules. Node's default cp behavior
  // resolves and rewrites those links to the disposable sandbox, which is deleted immediately
  // after reconstruction. Preserve the link bytes verbatim so the atomic directory move keeps
  // every executable link relative and live.
  cpSync(candidateModulesSource, join(candidateTemporary, 'node_modules'), {
    recursive: true,
    verbatimSymlinks: true,
  })
  renameSync(candidateTemporary, candidateRoot)
  const candidateProviderCli = providerCliStaticReceipt(
    protectedVerifyProviderCliToolchainStatic({ root: candidateRoot }),
    'captured candidate provider CLI',
  )
  assertSameProviderCliIdentity(
    sandboxProviderCli,
    candidateProviderCli,
    'sandbox-to-candidate',
  )
  captureNodeModulesAfterState(
    nodeModulesState,
    join(candidateRoot, 'node_modules'),
    'captured candidate node_modules',
  )
  reconstructedContext = {
    incomingCorpusEvidence: { ...incomingCorpus.evidence },
    providerPaths,
    commonPath,
    provenance: structuredClone(provenance),
    toolchain: structuredClone(toolchain),
    authoritySha256: sha256(JSON.stringify(authority)),
    operations: operations.map((entry) => ({ ...entry })),
    providerCli: {
      identity: candidateProviderCli,
      sandboxStaticVerified: true,
      candidateStaticVerified: true,
    },
  }
}

const replaceFromCandidate = (entry, candidatePath, movedPath, label) => {
  const candidatePresent = pathEntryExists(candidatePath)
  const candidateFingerprint = candidatePresent ? pathFingerprint(candidatePath, `${label} staged candidate`) : null
  if (
    !entry.afterRecorded
    || candidatePresent !== entry.afterPresent
    || candidateFingerprint !== entry.afterFingerprint
    || !entry.replacementStarted
    || entry.replacementCompleted
  ) throw new Error(`${label} candidate no longer matches the write-ahead journal`)
  if (entry.present) {
    mkdirSync(dirname(movedPath), { recursive: true })
    assertNoSymlinkPath(transactionRoot, movedPath, `${label} moved live before-image`)
    renameSync(entry.source, movedPath)
    try {
      if (pathFingerprint(movedPath, `${label} atomically moved before-image`) !== entry.beforeFingerprint) {
        throw new Error(`${label} changed between its final CAS check and atomic rename`)
      }
    } catch (error) {
      // The candidate has not been published. Put the exact bytes we just moved back whenever the
      // source name is still free; if another writer claimed it, preserve both names and leave the
      // recovery journal for explicit inspection rather than overwriting either edit.
      if (!pathEntryExists(entry.source) && pathEntryExists(movedPath)) renameSync(movedPath, entry.source)
      throw error
    }
    if (entry.path === 'governance') {
      waitForTestAcknowledgment({
        enabled: TEST_CONSUMER_ROLE_GAP_HANDSHAKE,
        readyMarker: 'GOV-UPGRADE-TEST-CONSUMER-ROLE-GAP-READY',
        acknowledgmentName: TEST_CONSUMER_ROLE_GAP_ACK,
        label: 'test consumer role gap',
      })
    }
  }
  if (entry.afterPresent) {
    mkdirSync(dirname(entry.source), { recursive: true })
    assertNoSymlinkPath(repoRoot, dirname(entry.source), `${label} destination parent`, { allowMissing: false })
    const candidateInfo = lstatSync(candidatePath)
    if (candidateInfo.isFile() && !candidateInfo.isSymbolicLink()) {
      // link(2) is an atomic create-if-absent publication on the same filesystem. It cannot erase
      // a file concurrently created after the last CAS check. The short two-link crash state is
      // explicitly recognized only when both inodes match inside this capability root.
      linkSync(candidatePath, entry.source)
      rmSync(candidatePath)
    } else {
      // POSIX directory rename refuses a non-empty or wrong-kind destination. Recheck immediately;
      // an externally created destination therefore fails closed instead of being pre-removed.
      if (pathEntryExists(entry.source)) throw new Error(`${label} destination appeared during transaction`)
      renameSync(candidatePath, entry.source)
    }
  }
}

const replaceJournaledEntry = (entry, candidatePath, movedPath, label) => {
  assertBeforeLiveState(entry, label)
  entry.replacementStarted = true
  persistJournal()
  replaceFromCandidate(entry, candidatePath, movedPath, label)
  assertExactAfterImage(entry, label)
  entry.replacementCompleted = true
  persistJournal()
}

const assertExactAfterImage = (entry, label) => {
  const present = pathEntryExists(entry.source)
  const fingerprint = present ? pathFingerprint(entry.source, `${label} live after-image`) : null
  if (!entry.afterRecorded || present !== entry.afterPresent || fingerprint !== entry.afterFingerprint) {
    throw new Error(`${label} live after-image differs from disposable reconstruction`)
  }
}

try {
  // Build and authenticate the complete target in a disposable protected-base checkout. No
  // incoming script/checker runs in the live repository, and no live path changes until every
  // after-image and rollback backup is closed in the owner-bound journal.
  reconstructedUpgrade = await reconstructExpectedUpgrade({
    repository: repoRoot,
    expectedBaseSha: protectedBaseSha,
    expectedVersion: dsTarget,
    captureMaterialized: captureDisposableCandidate,
  })
  report.targetVerification = 'verified'
  report.targetVerified = true
  if (!reconstructedContext || !pathEntryExists(candidateRoot)) throw new Error('disposable reconstruction did not publish a candidate snapshot')
  if (typeof protectedProviderCliStaticVerifier !== 'function') {
    throw new Error('protected-base provider CLI verifier capability was not retained')
  }

  assertClosedGitLocalConfiguration(repoRoot)
  const freshHead = runClosedGit(['rev-parse', 'HEAD'], { cwd: repoRoot })
  const freshStatus = runClosedGit([
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--ignore-submodules=all',
    '--no-ahead-behind',
    '--no-renames',
  ], { cwd: repoRoot, output: 'buffer' })
  if (
    freshHead.error
    || freshHead.signal !== null
    || freshHead.status !== 0
    || freshHead.stdout.trim() !== protectedBaseSha
    || freshStatus.error
    || freshStatus.signal !== null
    || freshStatus.status !== 0
    || !Buffer.isBuffer(freshStatus.stdout)
    || freshStatus.stdout.length !== 0
  ) {
    throw new Error('protected base changed during disposable reconstruction')
  }

  const incomingForkCorpus = validateInstalledForkCorpus(candidateRoot)
  if (
    incomingForkCorpus.evidence.releaseVersion !== dsTarget
    || JSON.stringify(incomingForkCorpus.evidence) !== JSON.stringify(reconstructedContext.incomingCorpusEvidence)
  ) throw new Error('captured candidate corpus differs from protected-base reconstruction')
  const providerPaths = collectProviderMutationPaths(incomingForkCorpus.manifest)
  if (JSON.stringify(providerPaths) !== JSON.stringify(reconstructedContext.providerPaths)) {
    throw new Error('captured candidate provider path set differs from protected-base transition')
  }
  assertNoIgnoredManagedContent(
    repoRoot,
    [...providerPaths.map((record) => record.path), reconstructedContext.commonPath],
    'live provider/common transaction authority',
  )

  for (const managedPath of Object.keys(incomingForkCorpus.manifest.consumer.managedFiles || {}).sort()) {
    const normalized = normalizeRepositoryRelative(managedPath, 'incoming managed path')
    if (!TRANSACTION_PATHS.some((root) => normalized === root || normalized.startsWith(`${root}/`))) {
      throw new Error(`incoming managed path is outside fixed transaction authority:${managedPath}`)
    }
  }
  const launcherDestination = normalizeRepositoryRelative(
    incomingForkCorpus.manifest.consumer.launcherDestination,
    'incoming shared launcher destination',
  )
  if (!TRANSACTION_PATHS.some((root) => launcherDestination === root || launcherDestination.startsWith(`${root}/`))) {
    throw new Error(`incoming launcher destination is outside fixed transaction authority:${launcherDestination}`)
  }

  journal.entries = transactionState.map((entry) => captureCandidateState(
    entry,
    join(candidateRoot, entry.path),
    `fixed transaction target:${entry.path}`,
  ))

  const evidenceRoot = join(transactionRoot, 'provider-evidence')
  const candidateDesignSystem = join(candidateRoot, 'node_modules/@qijenchen/design-system')
  const evidenceDesignSystem = join(evidenceRoot, 'node_modules/@qijenchen/design-system')
  mkdirSync(evidenceDesignSystem, { recursive: true })
  for (const runtimePath of ['package.json', 'package-lock.json']) {
    cpSync(join(candidateRoot, runtimePath), join(evidenceRoot, runtimePath))
  }
  cpSync(join(candidateDesignSystem, 'package.json'), join(evidenceDesignSystem, 'package.json'))
  cpSync(join(candidateDesignSystem, 'ds-canonical/fork'), join(evidenceDesignSystem, 'ds-canonical/fork'), { recursive: true })
  mkdirSync(join(evidenceDesignSystem, 'src/tokens'), { recursive: true })
  cpSync(
    join(candidateDesignSystem, 'src/tokens/utility-registry.json'),
    join(evidenceDesignSystem, 'src/tokens/utility-registry.json'),
  )
  assertSafeTree(transactionRoot, evidenceRoot, 'captured provider evidence corpus')
  const evidenceCorpus = validateInstalledForkCorpus(evidenceRoot)
  if (JSON.stringify(evidenceCorpus.evidence) !== JSON.stringify(incomingForkCorpus.evidence)) {
    throw new Error('captured provider evidence differs from candidate corpus')
  }

  const providerStaging = join(transactionRoot, 'provider-staging')
  mkdirSync(providerStaging)
  providerTransactionState = providerPaths.map((record, index) => {
    const source = join(repoRoot, record.path)
    const backup = join(providerStaging, String(index))
    const present = pathEntryExists(source)
    assertNoSymlinkPath(repoRoot, source, `provider transaction source:${record.path}`)
    if (present) {
      const info = lstatSync(source)
      if ((record.kind === 'file' && !info.isFile()) || (record.kind === 'tree' && !info.isDirectory())) {
        throw new Error(`provider transaction source kind mismatch:${record.path}:${record.kind}`)
      }
      assertSafeTree(repoRoot, source, `provider transaction source:${record.path}`)
      cpSync(source, backup, { recursive: true })
    }
    return captureCandidateState(
      attachBeforeState({ path: record.path, source, backup, present }, `provider transaction target:${record.path}`),
      join(candidateRoot, record.path),
      `provider transaction target:${record.path}`,
    )
  })
  journal.providerSnapshot = {
    evidence: { ...incomingForkCorpus.evidence },
    evidenceRoot,
    paths: providerPaths.map((record) => ({ ...record })),
    entries: providerTransactionState.map((entry) => ({ ...entry })),
  }

  const commonPath = reconstructedContext.commonPath
  const commonCovered = TRANSACTION_PATHS.some((root) => commonPath === root || commonPath.startsWith(`${root}/`))
  if (!commonCovered) {
    const commonSource = join(repoRoot, commonPath)
    const commonBackup = join(transactionRoot, 'common-staging', '0')
    mkdirSync(dirname(commonBackup), { recursive: true })
    const present = pathEntryExists(commonSource)
    assertNoSymlinkPath(repoRoot, commonSource, 'common-instruction transaction source')
    if (present) {
      const info = lstatSync(commonSource)
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
        throw new Error('common-instruction transaction source must be one regular unaliased file')
      }
      cpSync(commonSource, commonBackup)
    }
    commonTransactionState = captureCandidateState(
      attachBeforeState({ path: commonPath, source: commonSource, backup: commonBackup, present }, `common transaction target:${commonPath}`),
      join(candidateRoot, commonPath),
      `common transaction target:${commonPath}`,
    )
    journal.commonSnapshot = { ...commonTransactionState }
  }

  // The second live scan closes the reconstruction/backup window for every dynamic provider and
  // common path. Any later path-visible edit is caught by the per-entry fingerprint CAS.
  assertNoIgnoredManagedContent(
    repoRoot,
    [...TRANSACTION_PATHS, ...providerPaths.map((record) => record.path), commonPath],
    'fully snapshotted live transaction authority',
  )

  // Publish all exact before/after states and replacement intent before the first live rename.
  persistJournal()
  liveMutationStarted = true
  mkdirSync(liveStagingRoot)
  for (const [index, entry] of journal.entries.entries()) {
    replaceJournaledEntry(entry, join(candidateRoot, entry.path), join(liveStagingRoot, 'fixed', String(index)), `fixed target:${entry.path}`)
  }
  for (const [index, entry] of journal.providerSnapshot.entries.entries()) {
    replaceJournaledEntry(entry, join(candidateRoot, entry.path), join(liveStagingRoot, 'provider', String(index)), `provider target:${entry.path}`)
  }
  if (journal.commonSnapshot) {
    replaceJournaledEntry(journal.commonSnapshot, join(candidateRoot, journal.commonSnapshot.path), join(liveStagingRoot, 'common', '0'), 'common-instruction target')
  }
  const candidateModules = join(candidateRoot, 'node_modules')
  waitForTestAcknowledgment({
    enabled: TEST_NODE_MODULES_PUBLISH_HANDSHAKE,
    readyMarker: 'GOV-UPGRADE-TEST-NODE-MODULES-PUBLISH-READY',
    acknowledgmentName: TEST_NODE_MODULES_PUBLISH_ACK,
    label: 'test node_modules publication',
  })
  assertNodeModulesBeforeState(
    nodeModulesState,
    candidateModules,
    'node_modules publication',
  )
  nodeModulesState.replacementStarted = true
  persistJournal()
  if (nodeModulesState.present) renameSync(nodeModulesState.source, nodeModulesState.backup)
  if (!pathEntryExists(candidateModules)) throw new Error('candidate node_modules disappeared before replacement')
  renameSync(candidateModules, nodeModulesState.source)
  if (
    nodeModulesFingerprint(nodeModulesState.source, 'published node_modules after-image')
    !== nodeModulesState.afterFingerprint
  ) throw new Error('published node_modules differs from the journaled candidate after-image')
  nodeModulesState.replacementCompleted = true
  persistJournal()
  const liveProviderCli = providerCliStaticReceipt(
    protectedProviderCliStaticVerifier({ root: repoRoot }),
    'live upgraded provider CLI',
  )
  assertSameProviderCliIdentity(
    reconstructedContext.providerCli.identity,
    liveProviderCli,
    'candidate-to-live',
  )
  liveProviderCliCommitIdentity = liveProviderCli

  for (const entry of journal.entries) assertExactAfterImage(entry, `fixed target:${entry.path}`)
  for (const entry of journal.providerSnapshot.entries) assertExactAfterImage(entry, `provider target:${entry.path}`)
  if (journal.commonSnapshot) assertExactAfterImage(journal.commonSnapshot, 'common-instruction target')
  assertNoIgnoredManagedContent(
    repoRoot,
    [...TRANSACTION_PATHS, ...providerPaths.map((record) => record.path), commonPath],
    'live upgraded transaction authority',
  )
  assertClosedGitLocalConfiguration(repoRoot)
  const livePatch = runClosedGit(
    ['diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames'],
    { cwd: repoRoot, output: 'buffer', maxOutputBytes: 64 * 1024 * 1024 },
  )
  const stagedDiff = runClosedGit(
    ['diff', '--cached', '--name-only', '-z', '--no-ext-diff', '--no-textconv'],
    { cwd: repoRoot, output: 'buffer' },
  )
  const endingHead = runClosedGit(['rev-parse', 'HEAD'], { cwd: repoRoot })
  const endingBranch = runClosedGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: repoRoot })
  if (
    livePatch.error
    || livePatch.signal !== null
    || livePatch.status !== 0
    || !Buffer.isBuffer(livePatch.stdout)
    || !livePatch.stdout.equals(reconstructedUpgrade.patchBytes)
    || stagedDiff.error
    || stagedDiff.signal !== null
    || stagedDiff.status !== 0
    || !Buffer.isBuffer(stagedDiff.stdout)
    || stagedDiff.stdout.length !== 0
    || endingHead.error
    || endingHead.signal !== null
    || endingHead.status !== 0
    || endingHead.stdout.trim() !== protectedBaseSha
    || endingBranch.error
    || endingBranch.signal !== null
    || endingBranch.status !== 0
    || endingBranch.stdout.trim() !== branchName
  ) throw new Error('live upgrade patch/index/base differs from protected-base reconstruction')

  report.provenance = structuredClone(reconstructedUpgrade.authority.provenance)
  report.toolchain = structuredClone(reconstructedUpgrade.authority.toolchain)
  report.refresh = {
    changed: reconstructedUpgrade.operations.map((entry) => entry.path),
    mode: 'protected-base-disposable-reconstruction',
  }
  report.verification = {
    ok: true,
    mode: 'protected-base-disposable-reconstruction',
    attestationDigest: reconstructedUpgrade.authoritySha256,
    patchSha256: sha256(reconstructedUpgrade.patchBytes),
    treeSha256: reconstructedUpgrade.treeSha256,
    candidateCodeExecutedInWriter: false,
    providerCliExecutableRunsInWriter: false,
  }
  report.providerCli = {
    ...liveProviderCli,
    sandboxStaticVerified: reconstructedContext.providerCli.sandboxStaticVerified,
    candidateStaticVerified: reconstructedContext.providerCli.candidateStaticVerified,
    liveStaticVerified: true,
  }
  report.diagnostics.push({
    ruleId: 'GOV-UPGRADE-005',
    severity: 'INFO',
    message: 'exact release 已由 protected-base 在 disposable checkout 重建、驗證並以已綁定 after-image 套用；請檢視 diff 後透過受保護 PR 合併。',
  })
  cleanupTransaction({ commit: true })
  report.ready = true
  emit()
  process.exit(0)

} catch (error) {
  report.ok = false
  report.ready = false
  report.diagnostics.push({
    ruleId: transactionFailureRule(error),
    severity: 'BLOCKER',
    message: `transaction exception:${transactionFailureMessage(error)}`,
  })
  try {
    rollbackTransaction('unexpected transaction exception')
    cleanupTransaction()
  } catch (rollbackError) {
    report.rollback = { restored: false, reason: `${rollbackError?.message || rollbackError}`, recoveryJournal: journalPath }
  }
  emit()
  process.exit(1)
}

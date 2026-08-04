import { createHash, randomUUID } from 'node:crypto'
import {
  accessSync,
  chmodSync,
  closeSync,
  constants as fsConstants,
  copyFileSync,
  cpSync,
  existsSync,
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
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runClosedGit } from '../../packages/governance/src/closed-tool-execution.mjs'
import {
  buildProviderAdapterTargets,
  checkProviderAdapterTargets,
  writeProviderAdapterTargets,
} from '../gen-codex-adapter.mjs'
import {
  buildProviderRuntimeValidator,
  writeProviderRuntimeValidator,
} from '../gen-provider-runtime-validator.mjs'
import { checkInstructionMirrors } from './instruction-mirrors.mjs'
import {
  assertNoSymlinkPath,
  assertSafeTree,
  canonicalRepositoryRoot,
  normalizeRepositoryRelative,
  pathEntryExists,
} from '../refresh-fork-launchers.mjs'
import { compareUtf8Bytes } from './provider-lifecycle.mjs'

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const CANONICAL_SYNC_JOURNAL = '.governance-sync-journal.json'
const TRANSACTION_PREFIX = '.governance-sync-'
const OWNER_MARKER = '.governance-sync-owner.json'
export const AUTHORITY_GENERATION_JOURNAL = '.governance-build-graph-journal.json'
const AUTHORITY_GENERATION_PREFIX = '.governance-build-graph-'
const AUTHORITY_GENERATION_OWNER_MARKER = '.governance-build-graph-owner.json'
const INSTRUCTION_MIRRORS = Object.freeze([
  ['scripts/package-role-sources/AGENTS.package.md', 'packages/design-system/AGENTS.md'],
  ['scripts/package-role-sources/CLAUDE.package.md', 'packages/design-system/CLAUDE.md'],
])

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

function fsyncDirectory(path) {
  let descriptor
  try {
    descriptor = openSync(path, 'r')
    fsyncSync(descriptor)
  } catch (error) {
    // Windows does not consistently expose directory handles to fsync. File
    // contents are still fsynced strictly; POSIX directory durability remains
    // fail-closed because rename/unlink persistence depends on it.
    if (process.platform !== 'win32' || !['EINVAL', 'ENOTSUP', 'EPERM', 'EISDIR'].includes(error?.code)) throw error
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function fsyncTree(path) {
  const info = lstatSync(path)
  invariant(!info.isSymbolicLink(), `cannot fsync symbolic-link transaction entry:${path}`)
  if (info.isDirectory()) {
    for (const name of readdirSync(path).sort()) fsyncTree(join(path, name))
    fsyncDirectory(path)
    return
  }
  invariant(info.isFile() && info.nlink === 1, `cannot fsync unsupported or hard-linked transaction entry:${path}`)
  let descriptor
  try {
    descriptor = openSync(path, 'r')
    fsyncSync(descriptor)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function fsyncAuthorityTree(path) {
  const info = lstatSync(path)
  if (info.isSymbolicLink()) return
  if (info.isDirectory()) {
    for (const name of readdirSync(path).sort(compareUtf8Bytes)) fsyncAuthorityTree(join(path, name))
    fsyncDirectory(path)
    return
  }
  invariant(info.isFile() && info.nlink === 1, `cannot fsync unsupported or hard-linked authority-generation entry:${path}`)
  let descriptor
  try {
    descriptor = openSync(path, 'r')
    fsyncSync(descriptor)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    return true
  }
}

function absentRepositoryParents(root, repositoryPath) {
  const missing = []
  let parent = dirname(repositoryPath).split(sep).join('/')
  while (parent && parent !== '.') {
    const absolute = join(root, parent)
    assertNoSymlinkPath(root, absolute, `canonical sync target parent ${parent}`)
    if (pathEntryExists(absolute)) break
    missing.push(normalizeRepositoryRelative(parent, 'canonical sync absent parent'))
    parent = dirname(parent).split(sep).join('/')
  }
  return missing
}

function exactKeys(value, keys, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  invariant(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} has an open or incomplete schema`)
}

function authorityGenerationTargets(targetPaths) {
  invariant(Array.isArray(targetPaths) && targetPaths.length > 0, 'authority generation requires a non-empty output target set')
  const targets = [...new Set(targetPaths.map((path, index) => (
    normalizeRepositoryRelative(String(path).replace(/\/$/, ''), `authority generation target ${index}`)
  )))].sort(compareUtf8Bytes)
  invariant(targets.length === targetPaths.length, 'authority generation output target set contains duplicates')
  for (let left = 0; left < targets.length; left += 1) {
    for (let right = left + 1; right < targets.length; right += 1) {
      invariant(!targets[right].startsWith(`${targets[left]}/`), `authority generation output targets overlap:${targets[left]}:${targets[right]}`)
    }
  }
  return targets
}

function authorityEntrySnapshot(path, label) {
  if (!pathEntryExists(path)) return { present: false, kind: 'missing', fingerprint: null }
  const records = []
  const visit = (absolute, rel = '.') => {
    const info = lstatSync(absolute)
    const mode = (info.mode & 0o777).toString(8).padStart(3, '0')
    if (info.isSymbolicLink()) {
      records.push(`symlink:${rel}:${mode}:${Buffer.from(readlinkSync(absolute)).toString('base64')}`)
      return
    }
    if (info.isDirectory()) {
      records.push(`tree:${rel}:${mode}`)
      for (const name of readdirSync(absolute).sort(compareUtf8Bytes)) {
        visit(join(absolute, name), rel === '.' ? name : `${rel}/${name}`)
      }
      return
    }
    invariant(info.isFile() && info.nlink === 1, `${label} contains an unsupported or hard-linked entry:${rel}`)
    records.push(`file:${rel}:${mode}:${sha256(readFileSync(absolute))}`)
  }
  visit(path)
  const info = lstatSync(path)
  const kind = info.isSymbolicLink() ? 'symlink' : info.isDirectory() ? 'tree' : 'file'
  return { present: true, kind, fingerprint: sha256(`${records.join('\n')}\n`) }
}

function copyAuthorityEntry(source, target, expected, label) {
  invariant(expected.present, `${label} cannot copy an absent entry`)
  mkdirSync(dirname(target), { recursive: true })
  const copy = (from, to) => {
    const info = lstatSync(from)
    if (info.isSymbolicLink()) {
      symlinkSync(readlinkSync(from), to)
      return
    }
    if (info.isDirectory()) {
      mkdirSync(to, { mode: info.mode & 0o777 })
      chmodSync(to, info.mode & 0o777)
      for (const name of readdirSync(from).sort(compareUtf8Bytes)) copy(join(from, name), join(to, name))
      return
    }
    invariant(info.isFile() && info.nlink === 1, `${label} contains an unsupported or hard-linked entry`)
    copyFileSync(from, to)
    chmodSync(to, info.mode & 0o777)
  }
  copy(source, target)
  const copied = authorityEntrySnapshot(target, label)
  invariant(
    copied.present
      && copied.kind === expected.kind
      && copied.fingerprint === expected.fingerprint,
    `${label} copy differs from its exact source image`,
  )
}

function authoritySnapshotEqual(left, right) {
  return left.present === right.present
    && left.kind === right.kind
    && left.fingerprint === right.fingerprint
}

function relativeTo(root, absolute, label) {
  const rel = relative(root, absolute).split(sep).join('/')
  invariant(rel && rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel), `${label} escapes repository root`)
  return normalizeRepositoryRelative(rel, label)
}

function transactionTargets(root) {
  root = canonicalRepositoryRoot(root)
  const built = buildProviderAdapterTargets({ sourceRoot: root, outputRoot: root })
  const rows = [
    ...built.managedRoots.map(path => ({ path: relativeTo(root, path, 'provider managed root'), kind: 'tree' })),
    ...built.managedFiles.map(path => ({ path: relativeTo(root, path, 'provider managed file'), kind: 'file' })),
    { path: 'generated/governance/provider-runtime-validator.mjs', kind: 'file' },
    ...INSTRUCTION_MIRRORS.map(([, target]) => ({ path: target, kind: 'file' })),
  ]
  const unique = new Map()
  for (const row of rows) {
    const path = normalizeRepositoryRelative(row.path, 'canonical sync transaction target')
    invariant(row.kind === 'file' || row.kind === 'tree', `canonical sync target kind is invalid:${path}`)
    const prior = unique.get(path)
    invariant(!prior || prior.kind === row.kind, `canonical sync target collision:${path}`)
    unique.set(path, { path, kind: row.kind })
  }
  const targets = [...unique.values()].sort((a, b) => compareUtf8Bytes(a.path, b.path))
  for (let left = 0; left < targets.length; left += 1) for (let right = left + 1; right < targets.length; right += 1) {
    invariant(!targets[right].path.startsWith(`${targets[left].path}/`), `canonical sync transaction targets overlap:${targets[left].path}:${targets[right].path}`)
  }
  return targets
}

function fingerprint(path, kind, label) {
  invariant(pathEntryExists(path), `${label} is missing`)
  const rootInfo = lstatSync(path)
  invariant(!rootInfo.isSymbolicLink(), `${label} is a symbolic link`)
  invariant(kind === 'file' ? rootInfo.isFile() : rootInfo.isDirectory(), `${label} kind mismatch`)
  const rows = []
  const visit = (absolute, rel = '.') => {
    const info = lstatSync(absolute)
    invariant(!info.isSymbolicLink(), `${label} contains a symbolic link:${rel}`)
    const mode = (info.mode & 0o777).toString(8).padStart(3, '0')
    if (info.isDirectory()) {
      rows.push(`tree:${rel}:${mode}`)
      for (const name of readdirSync(absolute).sort()) visit(join(absolute, name), rel === '.' ? name : `${rel}/${name}`)
      return
    }
    invariant(info.isFile() && info.nlink === 1, `${label} contains an unsupported or hard-linked entry:${rel}`)
    rows.push(`file:${rel}:${mode}:${sha256(readFileSync(absolute))}`)
  }
  visit(path)
  return sha256(`${rows.join('\n')}\n`)
}

function writeInstructionMirrorStage(root, payloadRoot) {
  for (const [sourceRelative, targetRelative] of INSTRUCTION_MIRRORS) {
    const source = join(root, sourceRelative)
    const target = join(payloadRoot, targetRelative)
    assertNoSymlinkPath(root, source, `instruction source ${sourceRelative}`, { allowMissing: false })
    const info = lstatSync(source)
    invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `instruction source must be one regular file:${sourceRelative}`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(source), { mode: info.mode & 0o777 })
    chmodSync(target, info.mode & 0o777)
  }
}

function verifyStagedPayload(root, payloadRoot, targets) {
  const adapter = checkProviderAdapterTargets({ sourceRoot: root, outputRoot: payloadRoot })
  invariant(adapter.drift.length === 0, `staged provider adapter drift:${adapter.drift.map(item => `${item.path}:${item.kind}`).join(',')}`)
  const validator = join(payloadRoot, 'generated/governance/provider-runtime-validator.mjs')
  invariant(readFileSync(validator, 'utf8') === buildProviderRuntimeValidator({ root }), 'staged provider runtime validator differs from canonical schemas')
  for (const [sourceRelative, targetRelative] of INSTRUCTION_MIRRORS) {
    const source = join(root, sourceRelative)
    const target = join(payloadRoot, targetRelative)
    invariant(readFileSync(target).equals(readFileSync(source)), `staged instruction mirror content drift:${targetRelative}`)
    invariant((lstatSync(target).mode & 0o777) === (lstatSync(source).mode & 0o777), `staged instruction mirror mode drift:${targetRelative}`)
  }
  for (const row of targets) fingerprint(join(payloadRoot, row.path), row.kind, `staged canonical sync target ${row.path}`)
}

function verifyRepository(root) {
  const adapter = checkProviderAdapterTargets({ sourceRoot: root, outputRoot: root })
  invariant(adapter.drift.length === 0, `provider adapter post-check drift:${adapter.drift.map(item => `${item.path}:${item.kind}`).join(',')}`)
  const validator = join(root, 'generated/governance/provider-runtime-validator.mjs')
  invariant(pathEntryExists(validator) && readFileSync(validator, 'utf8') === buildProviderRuntimeValidator({ root }), 'provider runtime validator post-check drift')
  const mirrors = checkInstructionMirrors(root, INSTRUCTION_MIRRORS)
  invariant(mirrors.drift.length === 0, `instruction mirror post-check drift:${mirrors.drift.map(item => `${item.target}:${item.kind}`).join(',')}`)
}

function journalPathFor(root) {
  return join(root, CANONICAL_SYNC_JOURNAL)
}

function expectedTransactionRoot(root, transactionId) {
  invariant(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId || ''), 'canonical sync transaction id is invalid')
  return join(dirname(root), `${TRANSACTION_PREFIX}${transactionId}`)
}

function persistExclusiveJournal(root, journal) {
  const journalPath = journalPathFor(root)
  assertNoSymlinkPath(root, journalPath, 'canonical sync journal')
  invariant(!pathEntryExists(journalPath), 'another canonical sync transaction is active')
  const temporary = `${journalPath}.tmp-${journal.transactionId}`
  assertNoSymlinkPath(root, temporary, 'canonical sync journal temporary')
  let descriptor
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify(journal, null, 2)}\n`)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    linkSync(temporary, journalPath)
    fsyncDirectory(root)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temporary, { force: true })
    fsyncDirectory(root)
  }
}

function validateJournal(root, { activeTransactionId = null } = {}) {
  root = canonicalRepositoryRoot(root)
  const journalPath = journalPathFor(root)
  assertNoSymlinkPath(root, journalPath, 'canonical sync recovery journal', { allowMissing: false })
  let info = lstatSync(journalPath)
  invariant(info.isFile() && !info.isSymbolicLink() && (info.nlink === 1 || info.nlink === 2), 'canonical sync recovery journal must be one regular file')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  exactKeys(journal, ['schemaVersion', 'repoRoot', 'transactionId', 'transactionRoot', 'owner', 'targets'], 'canonical sync recovery journal')
  invariant(journal.schemaVersion === 1 && journal.repoRoot === root, 'canonical sync journal repository/schema binding mismatch')
  exactKeys(journal.owner, ['host', 'pid'], 'canonical sync journal owner')
  invariant(typeof journal.owner.host === 'string' && journal.owner.host.length > 0 && Number.isSafeInteger(journal.owner.pid) && journal.owner.pid > 0, 'canonical sync journal owner is invalid')
  if (journal.owner.host !== hostname()) {
    throw new Error(`canonical sync recovery blocked:transaction owner host cannot be proven inactive:${journal.owner.host}`)
  }
  if (processIsAlive(journal.owner.pid) && !(activeTransactionId === journal.transactionId && journal.owner.pid === process.pid)) {
    throw new Error(`canonical sync transaction is still active on pid ${journal.owner.pid}`)
  }
  // A power loss can occur in the tiny interval after the complete journal is
  // hard-linked into place but before its same-inode temporary name is removed.
  // Close that state without trusting any other temporary path.
  if (info.nlink === 2) {
    const temporary = `${journalPath}.tmp-${journal.transactionId}`
    const temporaryInfo = lstatSync(temporary)
    invariant(temporaryInfo.isFile() && !temporaryInfo.isSymbolicLink() && temporaryInfo.dev === info.dev && temporaryInfo.ino === info.ino, 'canonical sync journal has an unbound hard-link alias')
    rmSync(temporary, { force: true })
    info = lstatSync(journalPath)
  }
  invariant(info.nlink === 1, 'canonical sync journal has an unexpected hard-link alias')
  const transactionRoot = expectedTransactionRoot(root, journal.transactionId)
  invariant(journal.transactionRoot === transactionRoot && pathEntryExists(transactionRoot), 'canonical sync transaction root binding mismatch')
  const transactionInfo = lstatSync(transactionRoot)
  invariant(transactionInfo.isDirectory() && !transactionInfo.isSymbolicLink() && realpathSync(transactionRoot) === transactionRoot, 'canonical sync transaction root must be a real sibling directory')
  assertSafeTree(transactionRoot, transactionRoot, 'canonical sync transaction tree')
  const markerPath = join(transactionRoot, OWNER_MARKER)
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  exactKeys(marker, ['schemaVersion', 'repoRoot', 'transactionId', 'owner'], 'canonical sync owner marker')
  invariant(marker.schemaVersion === 1 && marker.repoRoot === root && marker.transactionId === journal.transactionId, 'canonical sync owner marker binding mismatch')
  invariant(JSON.stringify(marker.owner) === JSON.stringify(journal.owner), 'canonical sync owner marker process binding mismatch')
  const expected = transactionTargets(root)
  invariant(Array.isArray(journal.targets) && journal.targets.length === expected.length, 'canonical sync journal target set is incomplete')
  const targets = journal.targets.map((entry, index) => {
    exactKeys(entry, ['path', 'kind', 'present', 'backup', 'backupFingerprint', 'stagedFingerprint', 'absentParents'], `canonical sync journal target ${index}`)
    const wanted = expected[index]
    invariant(entry.path === wanted.path && entry.kind === wanted.kind && typeof entry.present === 'boolean', `canonical sync journal target ${index} is not canonical`)
    const backup = join(transactionRoot, 'backup', String(index))
    invariant(entry.backup === backup, `canonical sync journal backup ${index} is not capability-bound`)
    invariant(Array.isArray(entry.absentParents) && new Set(entry.absentParents).size === entry.absentParents.length, `canonical sync absent parent inventory is invalid:${entry.path}`)
    for (const parent of entry.absentParents) {
      const normalizedParent = normalizeRepositoryRelative(parent, `canonical sync absent parent ${entry.path}`)
      invariant(entry.path.startsWith(`${normalizedParent}/`), `canonical sync absent parent is not an ancestor:${entry.path}:${parent}`)
    }
    if (entry.present) {
      assertSafeTree(transactionRoot, backup, `canonical sync recovery backup ${entry.path}`)
      invariant(fingerprint(backup, entry.kind, `canonical sync recovery backup ${entry.path}`) === entry.backupFingerprint, `canonical sync recovery backup fingerprint mismatch:${entry.path}`)
    } else invariant(!pathEntryExists(backup) && entry.backupFingerprint === null, `canonical sync absent backup is inconsistent:${entry.path}`)
    invariant(/^[a-f0-9]{64}$/.test(entry.stagedFingerprint), `canonical sync staged fingerprint is invalid:${entry.path}`)
    return { ...entry }
  })
  // A crash recovery may only replace a target that is absent, still equals
  // its exact before-image, or already equals this transaction's staged
  // after-image. Unknown post-journal content is preserved and blocks recovery.
  for (const entry of targets) {
    const target = join(root, entry.path)
    assertNoSymlinkPath(root, target, `canonical sync live recovery target ${entry.path}`)
    if (!pathEntryExists(target)) continue
    assertSafeTree(root, target, `canonical sync live recovery target ${entry.path}`)
    const current = fingerprint(target, entry.kind, `canonical sync live recovery target ${entry.path}`)
    const allowed = new Set([entry.stagedFingerprint, ...(entry.present ? [entry.backupFingerprint] : [])])
    invariant(allowed.has(current), `canonical sync recovery blocked by unknown post-journal content:${entry.path}`)
  }
  return { root, journalPath, journal, transactionRoot, targets }
}

function removeRepositoryTarget(root, path) {
  const normalized = normalizeRepositoryRelative(path, 'canonical sync target')
  const target = join(root, normalized)
  assertNoSymlinkPath(root, target, `canonical sync target ${normalized}`)
  if (!pathEntryExists(target)) return
  assertNoSymlinkPath(root, target, `canonical sync target ${normalized}`, { allowMissing: false })
  rmSync(target, { recursive: true, force: true })
  fsyncDirectory(dirname(target))
}

function authorityGenerationJournalPath(root) {
  return join(root, AUTHORITY_GENERATION_JOURNAL)
}

// Staging lives outside the repository so a partially written generation can never be scanned or
// committed. The repository parent is preferred, but some sandboxes only grant write access to the
// repository itself and the OS temp directory; fall back there instead of failing the whole run.
function authorityGenerationStagingParent(root) {
  const parent = dirname(root)
  try {
    accessSync(parent, fsConstants.W_OK)
    return parent
  } catch {
    // macOS exposes the temp directory through a symlink, and the transaction requires one
    // canonical real directory, so resolve it before use.
    return realpathSync(tmpdir())
  }
}

function expectedAuthorityGenerationRoot(root, transactionId) {
  invariant(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId || ''), 'authority generation transaction id is invalid')
  return join(authorityGenerationStagingParent(root), `${AUTHORITY_GENERATION_PREFIX}${transactionId}`)
}

// A SIGKILL between transaction-root creation and durable journal publication cannot run the
// normal finally/recovery path. Reconcile only roots cryptographically bound by our owner marker;
// unrelated/unknown sibling directories are never touched.
export function reapAbandonedAuthorityGenerationStaging({ root = MODULE_ROOT } = {}) {
  root = canonicalRepositoryRoot(root)
  const parent = authorityGenerationStagingParent(root)
  let reaped = 0
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    const match = /^\.governance-build-graph-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(entry.name)
    if (!match || !entry.isDirectory()) continue
    const transactionRoot = join(parent, entry.name)
    const markerPath = join(transactionRoot, AUTHORITY_GENERATION_OWNER_MARKER)
    if (!pathEntryExists(markerPath)) continue
    assertNoSymlinkPath(transactionRoot, markerPath, 'abandoned authority generation owner marker', { allowMissing: false })
    const markerInfo = lstatSync(markerPath)
    invariant(markerInfo.isFile() && !markerInfo.isSymbolicLink() && markerInfo.nlink === 1, 'abandoned authority generation owner marker must be one regular file')
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
    exactKeys(marker, ['schemaVersion', 'kind', 'repoRoot', 'transactionId', 'owner'], 'abandoned authority generation owner marker')
    if (marker.repoRoot !== root) continue
    invariant(
      marker.schemaVersion === 1
        && marker.kind === 'governance-build-graph-output-transaction'
        && marker.transactionId === match[1],
      'abandoned authority generation owner marker binding mismatch',
    )
    exactKeys(marker.owner, ['host', 'pid'], 'abandoned authority generation owner')
    invariant(marker.owner.host === hostname(), `abandoned authority generation owner host cannot be proven inactive:${marker.owner.host}`)
    invariant(Number.isSafeInteger(marker.owner.pid) && marker.owner.pid > 0, 'abandoned authority generation owner pid is invalid')
    invariant(!processIsAlive(marker.owner.pid), `authority generation transaction is still active on pid ${marker.owner.pid}`)
    invariant(realpathSync(transactionRoot) === transactionRoot, 'abandoned authority generation root is not a real directory')
    rmSync(transactionRoot, { recursive: true, force: true })
    fsyncDirectory(parent)
    reaped += 1
  }
  return { reaped }
}

function removeAuthorityEntry(root, repositoryPath, label = 'authority generation target') {
  const normalized = normalizeRepositoryRelative(repositoryPath, label)
  const target = join(root, normalized)
  assertNoSymlinkPath(root, dirname(target), `${label} parent`)
  if (!pathEntryExists(target)) return
  rmSync(target, { recursive: true, force: true })
  fsyncDirectory(dirname(target))
}

function persistExclusiveAuthorityGenerationJournal(root, journal) {
  const journalPath = authorityGenerationJournalPath(root)
  assertNoSymlinkPath(root, journalPath, 'authority generation journal')
  invariant(!pathEntryExists(journalPath), 'another authority generation transaction is active')
  const temporary = `${journalPath}.tmp-${journal.transactionId}`
  assertNoSymlinkPath(root, temporary, 'authority generation journal temporary')
  let descriptor
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify(journal, null, 2)}\n`)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    linkSync(temporary, journalPath)
    fsyncDirectory(root)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temporary, { force: true })
    fsyncDirectory(root)
  }
}

function validateAuthorityGenerationJournal(root, {
  targetPaths,
  activeTransactionId = null,
} = {}) {
  root = canonicalRepositoryRoot(root)
  const expectedTargets = authorityGenerationTargets(targetPaths)
  const journalPath = authorityGenerationJournalPath(root)
  assertNoSymlinkPath(root, journalPath, 'authority generation recovery journal', { allowMissing: false })
  let info = lstatSync(journalPath)
  invariant(info.isFile() && !info.isSymbolicLink() && (info.nlink === 1 || info.nlink === 2), 'authority generation recovery journal must be one regular file')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  exactKeys(
    journal,
    ['schemaVersion', 'kind', 'repoRoot', 'transactionId', 'transactionRoot', 'owner', 'authorityFingerprint', 'targets'],
    'authority generation recovery journal',
  )
  invariant(
    journal.schemaVersion === 1
      && journal.kind === 'governance-build-graph-output-transaction'
      && journal.repoRoot === root,
    'authority generation journal repository/schema binding mismatch',
  )
  invariant(/^[a-f0-9]{64}$/.test(journal.authorityFingerprint), 'authority generation journal authority fingerprint is invalid')
  exactKeys(journal.owner, ['host', 'pid'], 'authority generation journal owner')
  invariant(
    typeof journal.owner.host === 'string'
      && journal.owner.host.length > 0
      && Number.isSafeInteger(journal.owner.pid)
      && journal.owner.pid > 0,
    'authority generation journal owner is invalid',
  )
  if (journal.owner.host !== hostname()) {
    throw new Error(`authority generation recovery blocked:transaction owner host cannot be proven inactive:${journal.owner.host}`)
  }
  if (
    processIsAlive(journal.owner.pid)
    && !(activeTransactionId === journal.transactionId && journal.owner.pid === process.pid)
  ) {
    throw new Error(`authority generation transaction is still active on pid ${journal.owner.pid}`)
  }
  if (info.nlink === 2) {
    const temporary = `${journalPath}.tmp-${journal.transactionId}`
    const temporaryInfo = lstatSync(temporary)
    invariant(
      temporaryInfo.isFile()
        && !temporaryInfo.isSymbolicLink()
        && temporaryInfo.dev === info.dev
        && temporaryInfo.ino === info.ino,
      'authority generation journal has an unbound hard-link alias',
    )
    rmSync(temporary, { force: true })
    info = lstatSync(journalPath)
  }
  invariant(info.nlink === 1, 'authority generation journal has an unexpected hard-link alias')

  const transactionRoot = expectedAuthorityGenerationRoot(root, journal.transactionId)
  invariant(
    journal.transactionRoot === transactionRoot && pathEntryExists(transactionRoot),
    'authority generation transaction root binding mismatch',
  )
  const transactionInfo = lstatSync(transactionRoot)
  invariant(
    transactionInfo.isDirectory()
      && !transactionInfo.isSymbolicLink()
      && realpathSync(transactionRoot) === transactionRoot,
    'authority generation transaction root must be a real sibling directory',
  )
  const markerPath = join(transactionRoot, AUTHORITY_GENERATION_OWNER_MARKER)
  assertNoSymlinkPath(transactionRoot, markerPath, 'authority generation owner marker', { allowMissing: false })
  const markerInfo = lstatSync(markerPath)
  invariant(markerInfo.isFile() && !markerInfo.isSymbolicLink() && markerInfo.nlink === 1, 'authority generation owner marker must be one regular file')
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  exactKeys(marker, ['schemaVersion', 'kind', 'repoRoot', 'transactionId', 'owner'], 'authority generation owner marker')
  invariant(
    marker.schemaVersion === 1
      && marker.kind === journal.kind
      && marker.repoRoot === root
      && marker.transactionId === journal.transactionId,
    'authority generation owner marker binding mismatch',
  )
  invariant(JSON.stringify(marker.owner) === JSON.stringify(journal.owner), 'authority generation owner marker process binding mismatch')

  invariant(
    Array.isArray(journal.targets) && journal.targets.length === expectedTargets.length,
    'authority generation journal target set is incomplete',
  )
  const targets = journal.targets.map((entry, index) => {
    exactKeys(
      entry,
      ['path', 'backup', 'absentParents', 'before', 'after'],
      `authority generation journal target ${index}`,
    )
    invariant(entry.path === expectedTargets[index], `authority generation journal target ${index} is not canonical`)
    const backup = join(transactionRoot, 'backup', String(index))
    invariant(entry.backup === backup, `authority generation journal backup ${index} is not capability-bound`)
    invariant(
      Array.isArray(entry.absentParents)
        && new Set(entry.absentParents).size === entry.absentParents.length,
      `authority generation absent parent inventory is invalid:${entry.path}`,
    )
    for (const parent of entry.absentParents) {
      const normalizedParent = normalizeRepositoryRelative(parent, `authority generation absent parent ${entry.path}`)
      invariant(entry.path.startsWith(`${normalizedParent}/`), `authority generation absent parent is not an ancestor:${entry.path}:${parent}`)
    }
    for (const [imageName, image] of [['before', entry.before], ['after', entry.after]]) {
      exactKeys(image, ['present', 'kind', 'fingerprint'], `authority generation ${imageName} image ${entry.path}`)
      invariant(typeof image.present === 'boolean', `authority generation ${imageName} presence is invalid:${entry.path}`)
      if (image.present) {
        invariant(['file', 'tree', 'symlink'].includes(image.kind), `authority generation ${imageName} kind is invalid:${entry.path}`)
        invariant(/^[a-f0-9]{64}$/.test(image.fingerprint), `authority generation ${imageName} fingerprint is invalid:${entry.path}`)
      } else {
        invariant(image.kind === 'missing' && image.fingerprint === null, `authority generation ${imageName} absence is invalid:${entry.path}`)
      }
    }
    if (entry.before.present) {
      invariant(
        authoritySnapshotEqual(
          authorityEntrySnapshot(backup, `authority generation recovery backup ${entry.path}`),
          entry.before,
        ),
        `authority generation recovery backup fingerprint mismatch:${entry.path}`,
      )
    } else {
      invariant(!pathEntryExists(backup), `authority generation absent backup is inconsistent:${entry.path}`)
    }
    return { ...entry }
  })

  // Validate the complete live set before recovery mutates any path. Unknown
  // post-journal content is user data and therefore blocks automatic rollback.
  for (const entry of targets) {
    const target = join(root, entry.path)
    assertNoSymlinkPath(root, dirname(target), `authority generation live recovery parent ${entry.path}`)
    const current = authorityEntrySnapshot(target, `authority generation live recovery target ${entry.path}`)
    invariant(
      authoritySnapshotEqual(current, entry.before) || authoritySnapshotEqual(current, entry.after),
      `authority generation recovery blocked by unknown post-journal content:${entry.path}`,
    )
  }
  return { root, journalPath, journal, transactionRoot, targets }
}

function gitIndexHoldsExactSymlink(root, path, target) {
  try {
    const listing = runClosedGit(['ls-files', '-s', '--', path], { cwd: root })
    const match = listing.stdout.match(/^120000 ([0-9a-f]{40,64}) 0\t/)
    if (!match) return false
    const blob = runClosedGit(['cat-file', 'blob', match[1]], { cwd: root })
    return blob.stdout === target
  } catch {
    return false
  }
}

export function assertAuthorityGenerationIdle({ root = MODULE_ROOT } = {}) {
  root = canonicalRepositoryRoot(root)
  const journalPath = authorityGenerationJournalPath(root)
  assertNoSymlinkPath(root, journalPath, 'authority generation journal')
  invariant(
    !pathEntryExists(journalPath),
    'governance build graph --check is read-only and will not recover an interrupted generation; run governance-build-graph.mjs --recover explicitly',
  )
  return true
}

export function recoverInterruptedAuthorityGeneration({
  root = MODULE_ROOT,
  targetPaths,
  activeTransactionId = null,
} = {}) {
  root = canonicalRepositoryRoot(root)
  const journalPath = authorityGenerationJournalPath(root)
  if (!pathEntryExists(journalPath)) return { recovered: false, targetCount: 0 }
  const validated = validateAuthorityGenerationJournal(root, { targetPaths, activeTransactionId })
  for (const entry of validated.targets) {
    removeAuthorityEntry(root, entry.path, 'authority generation recovery target')
    if (entry.before.present) {
      const target = join(root, entry.path)
      mkdirSync(dirname(target), { recursive: true })
      assertNoSymlinkPath(root, dirname(target), `authority generation restore parent ${entry.path}`, { allowMissing: false })
      copyAuthorityEntry(entry.backup, target, entry.before, `authority generation restored target ${entry.path}`)
      fsyncAuthorityTree(target)
      fsyncDirectory(dirname(target))
    }
  }
  const absentParents = [...new Set(validated.targets.flatMap(entry => entry.absentParents))]
    .sort((left, right) => right.split('/').length - left.split('/').length || compareUtf8Bytes(right, left))
  for (const parent of absentParents) {
    const absolute = join(root, parent)
    assertNoSymlinkPath(root, absolute, `authority generation rollback parent ${parent}`)
    if (!pathEntryExists(absolute)) continue
    const parentInfo = lstatSync(absolute)
    invariant(parentInfo.isDirectory() && !parentInfo.isSymbolicLink(), `authority generation rollback parent changed type:${parent}`)
    if (readdirSync(absolute).length === 0) {
      rmdirSync(absolute)
      fsyncDirectory(dirname(absolute))
    }
  }
  rmSync(validated.journalPath, { force: true })
  fsyncDirectory(root)
  rmSync(validated.transactionRoot, { recursive: true, force: true })
  fsyncDirectory(dirname(root))
  return {
    recovered: true,
    transactionId: validated.journal.transactionId,
    targetCount: validated.targets.length,
  }
}

export function runAtomicAuthorityGenerationTransaction({
  root = MODULE_ROOT,
  targetPaths,
  seedTargetPaths = [],
  authorityFingerprint,
  materializeWorkspace,
  generateWorkspace,
  verifyWorkspace = () => {},
  verifyLive = () => {},
  failureInjector = null,
} = {}) {
  root = canonicalRepositoryRoot(root)
  const targets = authorityGenerationTargets(targetPaths)
  invariant(Array.isArray(seedTargetPaths), 'authority generation seed targets must be an array')
  const seedTargets = seedTargetPaths.length ? authorityGenerationTargets(seedTargetPaths) : []
  invariant(seedTargets.every((path) => targets.includes(path)), 'authority generation seed target is outside the output target set')
  invariant(typeof authorityFingerprint === 'function', 'authority generation requires an authority fingerprint callback')
  invariant(typeof materializeWorkspace === 'function', 'authority generation requires a workspace materializer')
  invariant(typeof generateWorkspace === 'function', 'authority generation requires a workspace generator')
  invariant(typeof verifyWorkspace === 'function' && typeof verifyLive === 'function', 'authority generation verification callbacks are invalid')
  const recovered = recoverInterruptedAuthorityGeneration({ root, targetPaths: targets })
  reapAbandonedAuthorityGenerationStaging({ root })
  const indexAuthoritativeSymlinks = []
  const transactionId = randomUUID()
  const transactionRoot = expectedAuthorityGenerationRoot(root, transactionId)
  const workspaceRoot = join(transactionRoot, 'workspace')
  const backupRoot = join(transactionRoot, 'backup')
  const owner = { host: hostname(), pid: process.pid }
  let journalCreated = false
  mkdirSync(transactionRoot, { mode: 0o700 })
  try {
    writeFileSync(
      join(transactionRoot, AUTHORITY_GENERATION_OWNER_MARKER),
      `${JSON.stringify({
        schemaVersion: 1,
        kind: 'governance-build-graph-output-transaction',
        repoRoot: root,
        transactionId,
        owner,
      }, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    )
    mkdirSync(workspaceRoot, { mode: 0o700 })
    mkdirSync(backupRoot, { mode: 0o700 })
    const authorityBefore = authorityFingerprint()
    invariant(/^[a-f0-9]{64}$/.test(authorityBefore), 'authority generation source fingerprint is invalid')
    const entries = targets.map((path, index) => {
      const source = join(root, path)
      assertNoSymlinkPath(root, dirname(source), `authority generation source parent ${path}`)
      const before = authorityEntrySnapshot(source, `authority generation source ${path}`)
      const backup = join(backupRoot, String(index))
      if (before.present) copyAuthorityEntry(source, backup, before, `authority generation backup ${path}`)
      return {
        path,
        backup,
        absentParents: absentRepositoryParents(root, path),
        before,
        after: null,
      }
    })

    materializeWorkspace({ root, workspaceRoot, transactionRoot, transactionId })
    for (const entry of entries) removeAuthorityEntry(workspaceRoot, entry.path, 'authority generation staged target')
    for (const path of seedTargets) {
      const entry = entries.find(candidate => candidate.path === path)
      if (!entry.before.present) continue
      copyAuthorityEntry(entry.backup, join(workspaceRoot, path), entry.before, `authority generation seeded target ${path}`)
    }
    generateWorkspace({ root, workspaceRoot, transactionRoot, transactionId })
    verifyWorkspace({ root, workspaceRoot, transactionRoot, transactionId })
    for (const entry of entries) {
      entry.after = authorityEntrySnapshot(join(workspaceRoot, entry.path), `authority generation staged result ${entry.path}`)
    }

    invariant(authorityFingerprint() === authorityBefore, 'authority generation canonical source changed while staging')
    for (const entry of entries) {
      const current = authorityEntrySnapshot(join(root, entry.path), `authority generation source recheck ${entry.path}`)
      invariant(authoritySnapshotEqual(current, entry.before), `authority generation output changed while staging:${entry.path}`)
    }
    fsyncAuthorityTree(transactionRoot)
    fsyncDirectory(dirname(root))
    const journal = {
      schemaVersion: 1,
      kind: 'governance-build-graph-output-transaction',
      repoRoot: root,
      transactionId,
      transactionRoot,
      owner,
      authorityFingerprint: authorityBefore,
      targets: entries,
    }
    persistExclusiveAuthorityGenerationJournal(root, journal)
    journalCreated = true
    failureInjector?.({ phase: 'after-journal', transactionId, targetCount: entries.length })

    invariant(authorityFingerprint() === authorityBefore, 'authority generation canonical source changed before publication')
    for (const [index, entry] of entries.entries()) {
      failureInjector?.({ phase: 'before-target', index, entry, transactionId })
      const current = authorityEntrySnapshot(join(root, entry.path), `authority generation pre-publish target ${entry.path}`)
      invariant(authoritySnapshotEqual(current, entry.before), `authority generation output changed before publication:${entry.path}`)
      // Publishing is write-if-changed. An output whose live bytes already equal the staged bytes is
      // republished to no effect, and rewriting it needlessly fails the whole transaction wherever
      // the host makes an already-correct path read-only. The post-check still verifies every
      // output, so skipping a no-op publish cannot weaken the closure.
      if (authoritySnapshotEqual(entry.before, entry.after)) {
        failureInjector?.({ phase: 'after-target', index, entry, transactionId })
        continue
      }
      // A symlink output whose exact after-image is already recorded in the Git index is committed
      // even when this checkout cannot rewrite the live link (a sandboxed session's read-only
      // path). Every fresh checkout materializes the committed link, and the index-aware stage
      // checks in verifyLive still validate the repository, so only this checkout stays stale.
      // Genuine drift — the index absent or disagreeing with the staged content — still publishes.
      // The skip is reported to the caller: a precommit that stages outputs from the working tree
      // afterwards would silently clobber the index entry back to the stale link (that is exactly
      // how the first retarget commit shipped the wrong target), so it must restore these entries.
      if (entry.before.kind === 'symlink' && entry.after.kind === 'symlink') {
        const stagedTarget = readlinkSync(join(workspaceRoot, entry.path))
        if (gitIndexHoldsExactSymlink(root, entry.path, stagedTarget)) {
          indexAuthoritativeSymlinks.push({ path: entry.path, target: stagedTarget })
          failureInjector?.({ phase: 'after-target', index, entry, transactionId })
          continue
        }
      }
      removeAuthorityEntry(root, entry.path, 'authority generation publish target')
      if (entry.after.present) {
        const staged = join(workspaceRoot, entry.path)
        const target = join(root, entry.path)
        mkdirSync(dirname(target), { recursive: true })
        assertNoSymlinkPath(root, dirname(target), `authority generation publish parent ${entry.path}`, { allowMissing: false })
        renameSync(staged, target)
        invariant(
          authoritySnapshotEqual(
            authorityEntrySnapshot(target, `authority generation committed target ${entry.path}`),
            entry.after,
          ),
          `authority generation commit verification failed:${entry.path}`,
        )
        fsyncAuthorityTree(target)
        fsyncDirectory(dirname(target))
      }
      failureInjector?.({ phase: 'after-target', index, entry, transactionId })
    }
    failureInjector?.({ phase: 'before-postcheck', transactionId, targetCount: entries.length })
    invariant(authorityFingerprint() === authorityBefore, 'authority generation canonical source changed during publication')
    verifyLive({ root, workspaceRoot, transactionRoot, transactionId })
    invariant(authorityFingerprint() === authorityBefore, 'authority generation canonical source changed during post-check')
    rmSync(authorityGenerationJournalPath(root), { force: true })
    fsyncDirectory(root)
    rmSync(transactionRoot, { recursive: true, force: true })
    fsyncDirectory(dirname(root))
    return { recovered, transactionId, targetCount: entries.length, authorityFingerprint: authorityBefore, indexAuthoritativeSymlinks }
  } catch (error) {
    if (journalCreated && pathEntryExists(authorityGenerationJournalPath(root))) {
      try {
        recoverInterruptedAuthorityGeneration({ root, targetPaths: targets, activeTransactionId: transactionId })
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `authority generation failed and rollback is blocked; durable journal retained:${authorityGenerationJournalPath(root)}`,
        )
      }
    } else {
      rmSync(transactionRoot, { recursive: true, force: true })
      fsyncDirectory(dirname(root))
    }
    throw error
  }
}

export function recoverInterruptedCanonicalSync({ root = MODULE_ROOT, activeTransactionId = null } = {}) {
  root = canonicalRepositoryRoot(root)
  const journalPath = journalPathFor(root)
  if (!pathEntryExists(journalPath)) return { recovered: false, targetCount: 0 }
  const validated = validateJournal(root, { activeTransactionId })
  // Validate the complete closed journal and every backup before the first restore mutation.
  for (const entry of validated.targets) {
    removeRepositoryTarget(root, entry.path)
    if (entry.present) {
      const target = join(root, entry.path)
      mkdirSync(dirname(target), { recursive: true })
      assertNoSymlinkPath(root, dirname(target), `canonical sync restore parent ${entry.path}`, { allowMissing: false })
      cpSync(entry.backup, target, { recursive: true })
      invariant(fingerprint(target, entry.kind, `restored canonical sync target ${entry.path}`) === entry.backupFingerprint, `canonical sync restore verification failed:${entry.path}`)
      fsyncTree(target)
      fsyncDirectory(dirname(target))
    }
  }
  const absentParents = [...new Set(validated.targets.flatMap(entry => entry.absentParents))]
    .sort((left, right) => right.split('/').length - left.split('/').length || compareUtf8Bytes(right, left))
  for (const parent of absentParents) {
    const absolute = join(root, parent)
    assertNoSymlinkPath(root, absolute, `canonical sync rollback parent ${parent}`)
    if (!pathEntryExists(absolute)) continue
    const info = lstatSync(absolute)
    invariant(info.isDirectory() && !info.isSymbolicLink(), `canonical sync rollback parent changed type:${parent}`)
    if (readdirSync(absolute).length === 0) {
      rmdirSync(absolute)
      fsyncDirectory(dirname(absolute))
    }
  }
  rmSync(validated.journalPath, { force: true })
  fsyncDirectory(root)
  rmSync(validated.transactionRoot, { recursive: true, force: true })
  fsyncDirectory(dirname(root))
  return { recovered: true, transactionId: validated.journal.transactionId, targetCount: validated.targets.length }
}

export function synchronizeCanonicalViews({ root = MODULE_ROOT, failureInjector = null } = {}) {
  root = canonicalRepositoryRoot(root)
  const recovered = recoverInterruptedCanonicalSync({ root })
  const transactionId = randomUUID()
  const transactionRoot = expectedTransactionRoot(root, transactionId)
  const payloadRoot = join(transactionRoot, 'payload')
  const backupRoot = join(transactionRoot, 'backup')
  const targets = transactionTargets(root)
  const owner = { host: hostname(), pid: process.pid }
  let journalCreated = false
  mkdirSync(transactionRoot, { mode: 0o700 })
  try {
    writeFileSync(join(transactionRoot, OWNER_MARKER), `${JSON.stringify({ schemaVersion: 1, repoRoot: root, transactionId, owner }, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    mkdirSync(payloadRoot, { mode: 0o700 })
    mkdirSync(backupRoot, { mode: 0o700 })
    const built = writeProviderAdapterTargets({ sourceRoot: root, outputRoot: payloadRoot })
    for (const managedRoot of built.managedRoots) mkdirSync(managedRoot, { recursive: true })
    writeProviderRuntimeValidator({ root, target: join(payloadRoot, 'generated/governance/provider-runtime-validator.mjs') })
    writeInstructionMirrorStage(root, payloadRoot)
    verifyStagedPayload(root, payloadRoot, targets)

    const entries = targets.map((row, index) => {
      const source = join(root, row.path)
      const staged = join(payloadRoot, row.path)
      assertNoSymlinkPath(root, source, `canonical sync source ${row.path}`)
      const present = pathEntryExists(source)
      const backup = join(backupRoot, String(index))
      let backupFingerprint = null
      if (present) {
        assertSafeTree(root, source, `canonical sync source ${row.path}`)
        cpSync(source, backup, { recursive: true })
        backupFingerprint = fingerprint(backup, row.kind, `canonical sync backup ${row.path}`)
      }
      return {
        ...row,
        present,
        absentParents: absentRepositoryParents(root, row.path),
        backup,
        backupFingerprint,
        stagedFingerprint: fingerprint(staged, row.kind, `canonical sync staged target ${row.path}`),
      }
    })
    fsyncTree(transactionRoot)
    fsyncDirectory(dirname(root))
    const journal = { schemaVersion: 1, repoRoot: root, transactionId, transactionRoot, owner, targets: entries }
    persistExclusiveJournal(root, journal)
    journalCreated = true
    failureInjector?.({ phase: 'after-journal', transactionId, targetCount: entries.length })

    for (const [index, entry] of entries.entries()) {
      failureInjector?.({ phase: 'before-target', index, entry, transactionId })
      removeRepositoryTarget(root, entry.path)
      const target = join(root, entry.path)
      mkdirSync(dirname(target), { recursive: true })
      assertNoSymlinkPath(root, dirname(target), `canonical sync commit parent ${entry.path}`, { allowMissing: false })
      renameSync(join(payloadRoot, entry.path), target)
      invariant(fingerprint(target, entry.kind, `canonical sync committed target ${entry.path}`) === entry.stagedFingerprint, `canonical sync commit verification failed:${entry.path}`)
      fsyncTree(target)
      fsyncDirectory(dirname(target))
      failureInjector?.({ phase: 'after-target', index, entry, transactionId })
    }
    failureInjector?.({ phase: 'before-postcheck', transactionId, targetCount: entries.length })
    verifyRepository(root)
    rmSync(journalPathFor(root), { force: true })
    fsyncDirectory(root)
    rmSync(transactionRoot, { recursive: true, force: true })
    fsyncDirectory(dirname(root))
    return { recovered, transactionId, targetCount: entries.length, generatedTargetCount: built.targets.length }
  } catch (error) {
    if (journalCreated && pathEntryExists(journalPathFor(root))) {
      try { recoverInterruptedCanonicalSync({ root, activeTransactionId: transactionId }) }
      catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `canonical sync failed and rollback is blocked; durable journal retained:${journalPathFor(root)}`)
      }
    } else {
      rmSync(transactionRoot, { recursive: true, force: true })
      fsyncDirectory(dirname(root))
    }
    throw error
  }
}

export function checkCanonicalViews({ root = MODULE_ROOT } = {}) {
  root = canonicalRepositoryRoot(root)
  const journalPath = journalPathFor(root)
  invariant(!pathEntryExists(journalPath), 'canonical sync --check is read-only and will not recover an interrupted transaction; run sync-ds-canonical.mjs --recover explicitly')
  verifyRepository(root)
  const adapter = checkProviderAdapterTargets({ sourceRoot: root, outputRoot: root })
  return { recovered: { recovered: false, targetCount: 0 }, targetCount: adapter.targets.length }
}

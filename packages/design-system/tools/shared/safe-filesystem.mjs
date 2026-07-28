import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export const SHA256_PATTERN = /^[a-f0-9]{64}$/

// Content-addressed tool artifacts preserve exact code points and use one host-independent
// ordering primitive. Comparing UTF-8 bytes performs no filesystem or locale I/O and never
// applies implicit Unicode normalization.
export function compareUtf8Bytes(left, right) {
  return Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'))
}

export function stableStringify(value, space = 0) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize)
    if (!item || typeof item !== 'object') return item
    return Object.fromEntries(Object.keys(item).sort(compareUtf8Bytes).map((key) => [key, normalize(item[key])]))
  }
  return JSON.stringify(normalize(value), null, space)
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function canonicalJson(value) {
  return `${stableStringify(value, 2)}\n`
}

export function exactKeys(value, expected, label, fail) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort(compareUtf8Bytes)
  const wanted = [...expected].sort(compareUtf8Bytes)
  if (stableStringify(actual) !== stableStringify(wanted)) fail(`${label} has an invalid or open shape`)
}

export function portablePath(value, label, fail) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.includes('\\') || /[\0\n\r]/.test(value)) {
    fail(`${label} must be a portable repository-relative path`)
  }
  if (value.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail(`${label} contains an unsafe path segment`)
  }
  return value
}

export function canonicalRoot(value, label, fail) {
  let root
  try {
    root = realpathSync(resolve(value ?? process.cwd()))
  } catch (error) {
    fail(`${label} is unavailable:${error.message}`)
  }
  const info = lstatSync(root)
  if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} must be a real directory`)
  return root
}

export function isContained(root, target, { allowRoot = true } = {}) {
  const rel = relative(root, target)
  if (!rel) return allowRoot
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

export function relativeInside(root, value, label, fail, { allowRoot = false } = {}) {
  const absolute = resolve(root, value)
  if (!isContained(root, absolute, { allowRoot })) fail(`${label} escapes the repository root`)
  const rel = relative(root, absolute).split(sep).join('/')
  if (!rel && allowRoot) return '.'
  return portablePath(rel, label, fail)
}

export function assertSafeExistingPath(root, absolute, label, fail, { kind = null, hardlinkSafe = true } = {}) {
  if (!isContained(root, absolute)) fail(`${label} escapes its authority root`)
  let cursor = root
  for (const segment of relative(root, absolute).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor)) fail(`${label} is missing:${relative(root, cursor)}`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link:${relative(root, cursor)}`)
    if (cursor !== absolute && !info.isDirectory()) fail(`${label} crosses a non-directory:${relative(root, cursor)}`)
    if (cursor === absolute) {
      if (kind === 'file' && !info.isFile()) fail(`${label} must be a regular file`)
      if (kind === 'directory' && !info.isDirectory()) fail(`${label} must be a real directory`)
      if (!info.isFile() && !info.isDirectory()) fail(`${label} has an unsupported filesystem type`)
      if (hardlinkSafe && info.isFile() && info.nlink !== 1) fail(`${label} is a hard-link alias`)
    }
  }
  return absolute
}

export function assertSafeParent(root, absolute, label, fail, createdDirectories = []) {
  if (!isContained(root, absolute)) fail(`${label} escapes its authority root`)
  const missing = []
  let cursor = dirname(absolute)
  while (cursor !== root && !existsSync(cursor)) {
    missing.push(cursor)
    cursor = dirname(cursor)
  }
  assertSafeExistingPath(root, cursor, `${label} existing parent`, fail, { kind: 'directory' })
  for (const directory of missing.reverse()) {
    mkdirSync(directory, { mode: 0o700 })
    createdDirectories.push(directory)
    assertSafeExistingPath(root, directory, `${label} prepared parent`, fail, { kind: 'directory' })
  }
}

export function readStableFile(root, relativePath, label, fail) {
  portablePath(relativePath, `${label} path`, fail)
  const absolute = resolve(root, relativePath)
  assertSafeExistingPath(root, absolute, label, fail, { kind: 'file' })
  const before = lstatSync(absolute)
  let descriptor
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const opened = fstatSync(descriptor)
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) {
      fail(`${label} changed while it was opened`)
    }
    const bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor)
    const visible = lstatSync(absolute)
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs
      || visible.dev !== opened.dev || visible.ino !== opened.ino
      || visible.nlink !== 1) fail(`${label} changed while it was read`)
    return { absolute, bytes, sha256: sha256(bytes), mode: opened.mode & 0o777, size: bytes.length }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function exclusiveFile(path, bytes, mode, label, fail) {
  let descriptor
  try {
    descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), mode)
    writeFileSync(descriptor, bytes)
    fchmodSync(descriptor, mode)
    fsyncSync(descriptor)
  } catch (error) {
    fail(`${label} cannot be staged exclusively:${error.message}`)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

export function writeAtomicFile(root, relativePath, bytes, label, fail, { mode = 0o600 } = {}) {
  portablePath(relativePath, `${label} path`, fail)
  const absolute = resolve(root, relativePath)
  assertSafeParent(root, absolute, label, fail)
  if (existsSync(absolute)) assertSafeExistingPath(root, absolute, label, fail, { kind: 'file' })
  const temporary = resolve(dirname(absolute), `.${relative( dirname(absolute), absolute)}.tmp-${randomUUID()}`)
  exclusiveFile(temporary, bytes, mode, `${label} temporary`, fail)
  try {
    renameSync(temporary, absolute)
  } catch (error) {
    try { unlinkSync(temporary) } catch {}
    fail(`${label} cannot be published atomically:${error.message}`)
  }
  const readback = readStableFile(root, relativePath, `${label} readback`, fail)
  if (!readback.bytes.equals(bytes)) fail(`${label} atomic readback differs`)
  return readback
}

function removeEmptyCreatedDirectories(directories) {
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
    try { rmdirSync(directory) } catch {}
  }
}

/**
 * Apply a closed set of create/replace/delete operations for cooperating writers that honor the
 * exclusive lock. Every before-image is moved to a same-directory backup and each observed file
 * pathname is revalidated before publication. This is not protection against parent-directory
 * replacement, an old open fd, or any other non-cooperative filesystem writer.
 */
export function applyAtomicOperations({
  root,
  operations,
  fail,
  lockName,
  beforePublish = null,
  afterOperation = null,
  beforeBackupCleanup = null,
  beforeLockRelease = null,
}) {
  const canonical = canonicalRoot(root, 'transaction root', fail)
  if (!Array.isArray(operations) || operations.length === 0) return { changed: 0, rolledBack: false }
  const paths = operations.map((item) => portablePath(item.path, 'transaction operation path', fail))
  if (new Set(paths).size !== paths.length) fail('transaction operation paths must be unique')
  const lockRelative = portablePath(lockName, 'transaction lock path', fail)
  const lockAbsolute = resolve(canonical, lockRelative)
  assertSafeParent(canonical, lockAbsolute, 'transaction lock', fail)
  let lockDescriptor
  try {
    lockDescriptor = openSync(lockAbsolute, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600)
    writeFileSync(lockDescriptor, `${process.pid}\n`)
    fsyncSync(lockDescriptor)
  } catch (error) {
    if (lockDescriptor !== undefined) closeSync(lockDescriptor)
    fail(`another tool transaction is active or the lock is poisoned:${error.message}`)
  }
  closeSync(lockDescriptor)

  const transactionId = randomUUID()
  const staged = []
  const completed = []
  const createdDirectories = []
  let active = null
  let committed = false
  const cleanup = ({ preserveBackups = false } = {}) => {
    for (const row of staged) {
      for (const path of [row.temporary, row.backup, row.displaced]) {
        if (!path || !existsSync(path)) continue
        if (preserveBackups && path === row.backup) continue
        try { unlinkSync(path) } catch {}
      }
    }
    removeEmptyCreatedDirectories(createdDirectories)
    try { unlinkSync(lockAbsolute) } catch {}
  }
  try {
    for (const [index, operation] of operations.entries()) {
      if (!['create', 'replace', 'delete'].includes(operation.action)) fail(`unsupported transaction action:${operation.action}`)
      const target = resolve(canonical, operation.path)
      assertSafeParent(canonical, target, `transaction target ${operation.path}`, fail, createdDirectories)
      let before = null
      if (operation.action !== 'create') {
        before = readStableFile(canonical, operation.path, `transaction before-image ${operation.path}`, fail)
        if (before.sha256 !== operation.beforeSha256) fail(`transaction before-image changed:${operation.path}`)
        if (operation.beforeMode !== undefined && before.mode !== operation.beforeMode) fail(`transaction before-image mode changed:${operation.path}`)
      } else if (existsSync(target)) fail(`transaction create target already exists:${operation.path}`)
      let temporary = null
      if (operation.action !== 'delete') {
        if (!Buffer.isBuffer(operation.afterBytes) || sha256(operation.afterBytes) !== operation.afterSha256) {
          fail(`transaction candidate digest mismatch:${operation.path}`)
        }
        temporary = resolve(dirname(target), `.qijenchen-candidate-${transactionId}-${index}`)
        exclusiveFile(temporary, operation.afterBytes, operation.mode ?? before?.mode ?? 0o600, `transaction candidate ${operation.path}`, fail)
      }
      staged.push({ operation, target, before, temporary, backup: null, displaced: null })
    }

    for (const row of staged) {
      const { operation } = row
      if (operation.action === 'create') {
        if (existsSync(row.target)) fail(`transaction create target appeared concurrently:${operation.path}`)
      } else {
        const current = readStableFile(canonical, operation.path, `transaction final CAS ${operation.path}`, fail)
        if (current.sha256 !== operation.beforeSha256) fail(`transaction target changed concurrently:${operation.path}`)
        if (operation.beforeMode !== undefined && current.mode !== operation.beforeMode) fail(`transaction target mode changed concurrently:${operation.path}`)
      }
    }
    if (beforePublish) beforePublish({ root: canonical, operations })

    for (const [index, row] of staged.entries()) {
      active = row
      const { operation } = row
      if (operation.action !== 'create') {
        const final = readStableFile(canonical, operation.path, `transaction publication CAS ${operation.path}`, fail)
        if (final.sha256 !== operation.beforeSha256) fail(`transaction target changed at publication:${operation.path}`)
        if (operation.beforeMode !== undefined && final.mode !== operation.beforeMode) fail(`transaction target mode changed at publication:${operation.path}`)
        row.backup = resolve(dirname(row.target), `.qijenchen-before-${transactionId}-${index}`)
        renameSync(row.target, row.backup)
        const frozen = lstatSync(row.backup)
        if (!frozen.isFile() || frozen.isSymbolicLink() || frozen.nlink !== 1
          || sha256(readFileSync(row.backup)) !== operation.beforeSha256) {
          if (!existsSync(row.target)) renameSync(row.backup, row.target)
          fail(`transaction moved before-image is not the planned file:${operation.path}`)
        }
      }
      if (operation.action !== 'delete') {
        if (existsSync(row.target)) fail(`transaction target was recreated concurrently:${operation.path}`)
        linkSync(row.temporary, row.target)
        unlinkSync(row.temporary)
        row.temporary = null
        const published = readStableFile(canonical, operation.path, `transaction published target ${operation.path}`, fail)
        const expectedMode = operation.mode ?? row.before?.mode ?? 0o600
        if (published.sha256 !== operation.afterSha256 || published.mode !== expectedMode) fail(`transaction published bytes or mode differ:${operation.path}`)
      }
      completed.push(row)
      active = null
      if (afterOperation) afterOperation({ root: canonical, operation, index })
    }
    // All targets now have their exact reviewed after-images. This is the transaction commit point:
    // failures while deleting recovery residue or releasing the lock must never enter rollback,
    // because some before-image backups may already have been irreversibly removed.
    committed = true
    const backupCleanupErrors = []
    for (const [index, row] of completed.entries()) {
      if (!row.backup || !existsSync(row.backup)) {
        row.backup = null
        continue
      }
      try {
        if (beforeBackupCleanup) beforeBackupCleanup({ root: canonical, operation: row.operation, index, backup: row.backup })
        unlinkSync(row.backup)
        row.backup = null
      } catch (cleanupError) {
        backupCleanupErrors.push(cleanupError)
      }
    }
    if (backupCleanupErrors.length) {
      throw new AggregateError(backupCleanupErrors, 'atomic transaction committed but before-image cleanup failed; applied targets and the exclusive lock were preserved for recovery')
    }
    try {
      if (beforeLockRelease) beforeLockRelease({ root: canonical, lock: lockAbsolute })
      unlinkSync(lockAbsolute)
    } catch (error) {
      throw new AggregateError([error], 'atomic transaction committed but lock release failed; applied targets and the lock residue were preserved')
    }
    return { changed: operations.length, rolledBack: false }
  } catch (error) {
    if (committed) throw error
    const rollbackErrors = []
    const rollbackRows = [...new Set([...completed, ...(active ? [active] : [])])].reverse()
    for (const row of rollbackRows) {
      const { operation } = row
      try {
        if (operation.action !== 'delete' && existsSync(row.target)) {
          const current = readStableFile(canonical, operation.path, `rollback current target ${operation.path}`, fail)
          if (current.sha256 !== operation.afterSha256) throw new Error(`rollback refuses to overwrite concurrent bytes:${operation.path}`)
          row.displaced = resolve(dirname(row.target), `.qijenchen-displaced-${transactionId}-${randomUUID()}`)
          renameSync(row.target, row.displaced)
        }
        if (operation.action !== 'create' && row.backup) {
          if (existsSync(row.target)) throw new Error(`rollback target is occupied:${operation.path}`)
          renameSync(row.backup, row.target)
          row.backup = null
          const restored = readStableFile(canonical, operation.path, `rollback restored target ${operation.path}`, fail)
          if (restored.sha256 !== operation.beforeSha256
            || (operation.beforeMode !== undefined && restored.mode !== operation.beforeMode)) throw new Error(`rollback before-image differs:${operation.path}`)
        }
        if (row.displaced && existsSync(row.displaced)) unlinkSync(row.displaced)
        if (row.backup && existsSync(row.backup)) unlinkSync(row.backup)
        row.backup = null
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    cleanup({ preserveBackups: rollbackErrors.length > 0 })
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], 'atomic transaction failed and rollback was blocked; before-image backups were retained')
    }
    throw error
  } finally {
    if (!committed) try { unlinkSync(lockAbsolute) } catch {}
    for (const row of staged) {
      if (row.temporary && existsSync(row.temporary)) try { unlinkSync(row.temporary) } catch {}
    }
  }
}

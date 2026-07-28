import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  chmod,
  lstat,
  mkdir,
  realpath,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareUtf8Bytes } from './canonical-order.mjs'

export { compareUtf8Bytes } from './canonical-order.mjs'

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_MANIFEST = resolve(PACKAGE_ROOT, 'canonical/manifest.json')
export const PACKAGE_VERSION = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8')).version

const severityOrder = new Map([
  ['critical', 0],
  ['major', 1],
  ['minor', 2],
  ['info', 3],
])

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort(compareUtf8Bytes)) {
      if (value[key] !== undefined) out[key] = canonicalize(value[key])
    }
    return out
  }
  return value
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value), null, 2) + '\n'
}

export function digest(value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : stableJson(value))
  return `sha256:${createHash('sha256').update(body).digest('hex')}`
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

export async function exists(file) {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export function relativePath(value, label = 'path') {
  if (typeof value !== 'string' || value.trim() === '' || isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty repository-relative path`)
  }
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
  if (!normalized || normalized.split('/').some((part) => part === '..' || part === '')) {
    throw new Error(`${label} escapes its repository root: ${value}`)
  }
  return normalized
}

export function resolveWithin(root, value, label = 'path') {
  const rel = relativePath(value, label)
  const absolute = resolve(root, rel)
  const rootPrefix = resolve(root) + sep
  if (absolute !== resolve(root) && !absolute.startsWith(rootPrefix)) throw new Error(`${label} escapes its repository root: ${value}`)
  return absolute
}

// `resolveWithin` proves lexical containment only. Repository paths also need a
// no-symlink walk before they are used as control-plane inputs or write targets;
// otherwise an in-repo parent symlink could redirect a trusted operation outside
// the repository after the lexical check has passed.
export async function assertNoSymlinkWithin(root, target, label = 'path', { allowMissing = true } = {}) {
  const rootPath = resolve(root)
  const targetPath = resolve(target)
  const rel = relative(rootPath, targetPath)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} escapes its repository root: ${target}`)
  }

  const realRoot = await realpath(rootPath)
  let current = realRoot
  const parts = rel ? rel.split(sep) : []
  for (let index = 0; index < parts.length; index += 1) {
    current = resolve(current, parts[index])
    let info
    try {
      info = await lstat(current)
    } catch (error) {
      if (error?.code === 'ENOENT' && allowMissing) return targetPath
      throw error
    }
    if (info.isSymbolicLink()) throw new Error(`${label} contains a symbolic-link path component: ${relative(realRoot, current)}`)
    if (index < parts.length - 1 && !info.isDirectory()) {
      throw new Error(`${label} contains a non-directory path component: ${relative(realRoot, current)}`)
    }
  }
  return targetPath
}

export async function assertRegularFileWithin(root, target, label = 'file') {
  const targetPath = await assertNoSymlinkWithin(root, target, label, { allowMissing: false })
  const info = await lstat(targetPath)
  if (!info.isFile()) throw new Error(`${label} must be a regular file`)
  return targetPath
}

export function modeString(mode) {
  return (mode & 0o777).toString(8).padStart(4, '0')
}

export function diagnostic({ ruleId, severity = 'major', kind, path = '', expected, actual, outcome = 'FAIL', message }) {
  return {
    ruleId,
    severity,
    evidence: canonicalize({ kind, path, expected, actual }),
    outcome,
    message,
  }
}

export function sortDiagnostics(items) {
  return [...items].sort((a, b) =>
    (severityOrder.get(a.severity) ?? 99) - (severityOrder.get(b.severity) ?? 99)
      || compareUtf8Bytes(a.ruleId, b.ruleId)
      || compareUtf8Bytes(a.evidence?.path || '', b.evidence?.path || '')
      || compareUtf8Bytes(a.message, b.message))
}

export function result(command, diagnostics = [], data = undefined, forcedOutcome = undefined) {
  const sorted = sortDiagnostics(diagnostics)
  const hasFailure = sorted.some((item) => ['FAIL', 'BLOCK', 'ERROR'].includes(item.outcome))
  return canonicalize({
    schemaVersion: 1,
    command,
    outcome: forcedOutcome || (hasFailure ? 'FAIL' : 'PASS'),
    diagnostics: sorted,
    data,
  })
}

export function humanResult(value) {
  const lines = [`${value.outcome === 'PASS' || value.outcome === 'APPLIED' || value.outcome === 'PLAN' ? '✅' : '❌'} ${value.command}: ${value.outcome}`]
  for (const item of value.diagnostics) {
    const at = item.evidence?.path ? ` (${item.evidence.path})` : ''
    lines.push(`  [${item.severity.toUpperCase()}] ${item.ruleId}${at}: ${item.message}`)
  }
  return lines.join('\n')
}

export async function writeFileWithMode(file, content, mode = 0o644) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
  await chmod(file, mode)
}

export async function writeJsonAtomic(file, value, mode = 0o644) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`
  try {
    await writeFileWithMode(temporary, stableJson(value), mode)
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}

export async function inventoryTree(root, { excludes = [], projectFile = null } = {}) {
  if (!(await exists(root))) return []
  const rootInfo = await lstat(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(`inventory root must be a regular directory, not ${rootInfo.isSymbolicLink() ? 'a symbolic link' : 'another file type'}: ${root}`)
  }
  const excludedRoots = excludes.map((value, index) => relativePath(value, `inventory exclusion ${index}`))
  if (new Set(excludedRoots).size !== excludedRoots.length) throw new Error('inventory exclusions must be unique')
  const isExcluded = path => excludedRoots.some(excluded => path === excluded || path.startsWith(`${excluded}/`))
  const entries = []

  async function visit(directory, prefix) {
    const children = await readdir(directory, { withFileTypes: true })
    children.sort((a, b) => compareUtf8Bytes(a.name, b.name))
    for (const child of children) {
      const absolute = resolve(directory, child.name)
      const rel = prefix ? `${prefix}/${child.name}` : child.name
      if (isExcluded(rel)) continue
      const info = await lstat(absolute)
      if (child.isDirectory()) {
        await visit(absolute, rel)
      } else if (child.isSymbolicLink()) {
        const target = await readlink(absolute)
        entries.push({ path: rel, type: 'symlink', mode: modeString(info.mode), hash: digest(target), target })
      } else if (child.isFile()) {
        const body = await readFile(absolute)
        const projected = projectFile === null ? body : await projectFile({ path: rel, bytes: body })
        if (!Buffer.isBuffer(projected)) throw new TypeError(`inventory file projection must return a Buffer:${rel}`)
        entries.push({ path: rel, type: 'file', mode: modeString(info.mode), hash: digest(projected), size: projected.length })
      } else {
        entries.push({ path: rel, type: 'unsupported', mode: modeString(info.mode), hash: null })
      }
    }
  }

  await visit(root, '')
  return entries
}

export function treeDigest(entries) {
  return digest(entries.map(({ path, type, mode, hash, target }) => canonicalize({ path, type, mode, hash, target })))
}

export function compareInventories(expected, actual, { prefix = '', ruleId = 'GOV-SNAPSHOT-001' } = {}) {
  const diagnostics = []
  const expectedByPath = new Map(expected.map((entry) => [entry.path, entry]))
  const actualByPath = new Map(actual.map((entry) => [entry.path, entry]))
  const displayPath = (path) => prefix ? `${prefix.replace(/\/$/, '')}/${path}` : path

  for (const [path, wanted] of expectedByPath) {
    const got = actualByPath.get(path)
    if (!got) {
      diagnostics.push(diagnostic({ ruleId, severity: 'critical', kind: 'missing-file', path: displayPath(path), expected: wanted.hash, actual: null, message: 'Generated file is missing.' }))
      continue
    }
    if (wanted.type !== got.type) {
      diagnostics.push(diagnostic({ ruleId, severity: 'critical', kind: 'type-mismatch', path: displayPath(path), expected: wanted.type, actual: got.type, message: 'Generated path type differs from the canonical snapshot.' }))
      continue
    }
    if (wanted.hash !== got.hash) diagnostics.push(diagnostic({ ruleId, severity: 'critical', kind: 'content-hash-mismatch', path: displayPath(path), expected: wanted.hash, actual: got.hash, message: 'Generated file content differs from the canonical snapshot.' }))
    if (wanted.mode !== got.mode) diagnostics.push(diagnostic({ ruleId, severity: 'major', kind: 'mode-mismatch', path: displayPath(path), expected: wanted.mode, actual: got.mode, message: 'Generated file mode differs from the canonical snapshot.' }))
  }
  for (const [path, got] of actualByPath) {
    if (!expectedByPath.has(path)) diagnostics.push(diagnostic({ ruleId, severity: 'critical', kind: 'extra-file', path: displayPath(path), expected: null, actual: got.hash, message: 'Unexpected file exists in the generated snapshot.' }))
  }
  return diagnostics
}

export async function inventoryFile(file, displayPath) {
  if (!(await exists(file))) return []
  const info = await lstat(file)
  if (!info.isFile()) return [{ path: displayPath, type: info.isSymbolicLink() ? 'symlink' : 'unsupported', mode: modeString(info.mode), hash: null }]
  const body = await readFile(file)
  return [{ path: displayPath, type: 'file', mode: modeString(info.mode), hash: digest(body), size: body.length }]
}

export async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

export function getAtPath(value, dottedPath) {
  let current = value
  for (const part of dottedPath.split('.')) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

export function unique(values) {
  return [...new Set(values)]
}

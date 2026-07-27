import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export const VISUAL_BASELINE_COLLECTIONS = Object.freeze({
  curated: 'infra/governance/baseline/visual/curated',
  targeted: 'infra/governance/baseline/visual/targeted',
})

function fail(message) {
  throw new Error(`governance visual baseline blocked:${message}`)
}

function contained(root, target, { allowRoot = true } = {}) {
  const rel = relative(root, target)
  if (!rel) return allowRoot
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function assertNoSymlink(base, target, label) {
  if (!contained(base, target)) fail(`${label} escapes its authority root`)
  let cursor = base
  const rel = relative(base, target)
  for (const segment of rel ? rel.split(sep) : []) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor)) break
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link:${cursor}`)
    if (cursor !== target && !info.isDirectory()) fail(`${label} crosses a non-directory:${cursor}`)
    if (cursor === target && !info.isDirectory() && !info.isFile()) fail(`${label} has an unsupported file type`)
    if (cursor === target && info.isFile() && info.nlink !== 1) fail(`${label} is a hard-link alias`)
  }
}

function safeChildPath(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || isAbsolute(value) || value.includes('\\') || value.includes('\0') || /\p{Cc}/u.test(value)) {
    fail('child path must be a repository-style relative path')
  }
  if (value.split('/').some((segment) => !segment || segment === '.' || segment === '..')) fail('child path contains an unsafe segment')
  return value
}

export function resolveVisualBaselinePath({ repoRoot, collection, childPath } = {}) {
  let repository
  try {
    repository = realpathSync(resolve(repoRoot ?? process.cwd()))
  } catch (error) {
    fail(`repository root is unavailable:${error.message}`)
  }
  if (!Object.hasOwn(VISUAL_BASELINE_COLLECTIONS, collection)) fail(`unknown collection:${String(collection)}`)
  const authority = resolve(repository, VISUAL_BASELINE_COLLECTIONS[collection])
  assertNoSymlink(repository, authority, `${collection} authority`)
  const child = safeChildPath(childPath)
  const target = child ? resolve(authority, child) : authority
  if (!contained(authority, target)) fail('child path escapes its collection')
  assertNoSymlink(authority, target, `${collection} baseline path`)
  return target
}

export function ensureVisualBaselineDirectory(options = {}) {
  if (process.env.GOVERNANCE_READ_ONLY === '1') fail('GOVERNANCE_READ_ONLY forbids baseline writes')
  const directory = resolveVisualBaselinePath(options)
  const authority = resolveVisualBaselinePath({ repoRoot: options.repoRoot, collection: options.collection })
  mkdirSync(directory, { recursive: true })
  assertNoSymlink(authority, directory, `${options.collection} prepared baseline directory`)
  const info = lstatSync(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) fail('prepared baseline destination is not a real directory')
  return directory
}

/**
 * Prepare one committed baseline file without allowing a provider mirror,
 * symbolic link, hard link, or path traversal to become the write target.
 */
export function prepareVisualBaselineFile(options = {}) {
  if (process.env.GOVERNANCE_READ_ONLY === '1') fail('GOVERNANCE_READ_ONLY forbids baseline writes')
  if (!options.childPath) fail('baseline file child path is required')
  const file = resolveVisualBaselinePath(options)
  const authority = resolveVisualBaselinePath({ repoRoot: options.repoRoot, collection: options.collection })
  mkdirSync(dirname(file), { recursive: true })
  assertNoSymlink(authority, file, `${options.collection} prepared baseline file`)
  if (existsSync(file)) {
    const info = lstatSync(file)
    if (!info.isFile() || info.isSymbolicLink()) fail('prepared baseline target must be a regular file')
    if (info.nlink !== 1) fail('prepared baseline target is a hard-link alias')
  }
  return file
}

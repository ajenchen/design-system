import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { runClosedGit } from './closed-tool-execution.mjs'
import { compareUtf8Bytes } from './provider-lifecycle.mjs'

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function runGit(root, args, runner = spawnSync) {
  const result = runClosedGit(args, {
    cwd: root,
    output: 'buffer',
    maxOutputBytes: 64 * 1024 * 1024,
    runner,
  })
  if (result?.error) throw result.error
  invariant(result?.status === 0 && Buffer.isBuffer(result.stdout), `worktree fingerprint git ${args[0]} failed with exit ${String(result?.status)}`)
  return result.stdout
}

function nulPaths(bytes) {
  const parts = bytes.toString('utf8').split('\0')
  if (parts.at(-1) === '') parts.pop()
  return parts
}

function assertRepositoryPath(root, path) {
  invariant(
    typeof path === 'string'
      && path.length > 0
      && !isAbsolute(path)
      && !path.includes('\\')
      && !path.includes('\0')
      && path.split('/').every((part) => part && part !== '.' && part !== '..'),
    `worktree fingerprint received an unsafe repository path:${String(path)}`,
  )
  const absolute = resolve(root, path)
  const lexicalRelative = relative(root, absolute)
  invariant(
    lexicalRelative !== '..' && !lexicalRelative.startsWith(`..${sep}`) && !isAbsolute(lexicalRelative),
    `worktree fingerprint path escapes the repository:${path}`,
  )
  return absolute
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function capturePath(root, path) {
  const absolute = assertRepositoryPath(root, path)
  let info
  try {
    info = lstatSync(absolute, { bigint: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return Object.freeze({ path, kind: 'missing' })
    throw error
  }
  if (info.isSymbolicLink()) {
    return Object.freeze({
      path,
      kind: 'symlink',
      mode: info.mode.toString(),
      targetSha256: sha256(Buffer.from(readlinkSync(absolute), 'utf8')),
    })
  }
  invariant(info.isFile(), `Git-visible worktree path must be a file, symlink, or missing:${path}`)
  return Object.freeze({
    path,
    kind: 'file',
    mode: info.mode.toString(),
    size: info.size.toString(),
    sha256: sha256(readFileSync(absolute)),
  })
}

function captureIndex(root, runner) {
  return sha256(runGit(root, ['ls-files', '--stage', '-z'], runner))
}

function visiblePaths(root, runner) {
  const paths = nulPaths(runGit(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], runner))
  invariant(new Set(paths).size === paths.length, 'worktree fingerprint path inventory contains duplicates')
  return paths.sort(compareUtf8Bytes)
}

export function captureGitVisibleWorktree(rootPath, { runner = spawnSync } = {}) {
  const root = realpathSync(resolve(rootPath))
  const paths = visiblePaths(root, runner)
  const entries = paths.map((path) => capturePath(root, path))
  const indexSha256 = captureIndex(root, runner)
  return Object.freeze({
    schemaVersion: 1,
    kind: 'git-visible-worktree-fingerprint',
    root,
    indexSha256,
    entries: Object.freeze(entries),
    digest: sha256(Buffer.from(JSON.stringify({ indexSha256, entries }), 'utf8')),
  })
}

export function assertGitVisibleWorktreeUnchanged(rootPath, expected, { runner = spawnSync, label = 'governance execution' } = {}) {
  invariant(expected?.kind === 'git-visible-worktree-fingerprint' && expected.schemaVersion === 1, `${label} baseline fingerprint is invalid`)
  const root = realpathSync(resolve(rootPath))
  invariant(root === expected.root, `${label} repository root differs from the baseline`)
  const actual = captureGitVisibleWorktree(root, { runner })
  invariant(actual.indexSha256 === expected.indexSha256, `${label} mutated the Git index/staging area`)
  invariant(actual.digest === expected.digest, `${label} mutated the Git-visible caller worktree`)
  return actual
}

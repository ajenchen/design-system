#!/usr/bin/env node
// Static, inventory-bound adversarial fixture for check-governance-tamper.
// All writes are constrained to caller-provided repository-relative paths under
// one disposable system-temp fixture root.
import {
  closeSync,
  constants,
  lstatSync,
  openSync,
  realpathSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

function fail(message) {
  throw new Error(`governance-tamper concurrent-writer fixture:${message}`)
}

function inside(root, candidate) {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function resolveFixturePath(root, repositoryPath, { mustExist }) {
  if (
    typeof repositoryPath !== 'string'
    || repositoryPath.length === 0
    || isAbsolute(repositoryPath)
    || repositoryPath.includes('\\')
    || repositoryPath.includes('\0')
    || repositoryPath.split('/').some(part => !part || part === '.' || part === '..')
  ) fail(`unsafe repository path:${String(repositoryPath)}`)
  const absolute = resolve(root, repositoryPath)
  if (!inside(root, absolute)) fail(`path escapes fixture root:${repositoryPath}`)
  const parent = realpathSync(dirname(absolute))
  if (!inside(root, parent) || parent !== dirname(absolute)) fail(`path parent is unsafe:${repositoryPath}`)
  if (mustExist && realpathSync(absolute) !== absolute) fail(`target path is unsafe:${repositoryPath}`)
  return absolute
}

const [rootArgument, targetArgument, readyArgument, atimeArgument, mtimeArgument, durationArgument] =
  process.argv.slice(2)
if ([rootArgument, targetArgument, readyArgument, atimeArgument, mtimeArgument, durationArgument].some(value => value === undefined)) {
  fail('expected root, target, ready, atime-ms, mtime-ms, and duration-ms')
}

const root = realpathSync(resolve(rootArgument))
const target = resolveFixturePath(root, targetArgument, { mustExist: true })
const ready = resolveFixturePath(root, readyArgument, { mustExist: false })
const targetInfo = lstatSync(target)
if (!targetInfo.isFile() || targetInfo.isSymbolicLink() || targetInfo.nlink !== 1) fail('target must be a unique regular file')
const atimeMs = Number(atimeArgument)
const mtimeMs = Number(mtimeArgument)
const durationMs = Number(durationArgument)
if (
  !Number.isFinite(atimeMs)
  || !Number.isFinite(mtimeMs)
  || !Number.isInteger(durationMs)
  || durationMs < 100
  // 上限是 runaway 保險,不是活性參數:caller 在掃描結束後立即 SIGTERM。
  // 60s 讓寫入窗必定罩住重載 CI 上的完整掃描(2026-07-29 release-9 flake 錨例:
  // 舊 5s 窗被併行 harness 的 node 冷啟動吃掉 → 掃描全程看到穩定檔案 → 假綠)。
  || durationMs > 120_000
) fail('time arguments are invalid')
if (!Number.isInteger(constants.O_NOFOLLOW)) fail('O_NOFOLLOW is required')

writeFileSync(ready, 'ready\n', { flag: 'wx', mode: 0o600 })
const versions = [Buffer.from('// first-version\n'), Buffer.from('// other-version\n')]
const deadline = Date.now() + durationMs
let index = 0
while (Date.now() < deadline) {
  const descriptor = openSync(target, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW)
  try {
    writeFileSync(descriptor, versions[index])
  } finally {
    closeSync(descriptor)
  }
  utimesSync(target, atimeMs / 1000, mtimeMs / 1000)
  index = (index + 1) % versions.length
}

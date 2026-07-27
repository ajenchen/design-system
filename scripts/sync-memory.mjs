#!/usr/bin/env node
/**
 * Materialize committed provider-neutral memory SSOT into Claude's optional home cache.
 * Repository content is the only authority; home state can never write back.
 */

import { createHash, randomUUID } from 'node:crypto'
import { closeSync, chmodSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import {
  assertNoSymlinkPath,
  assertSafeTree,
  canonicalRepositoryRoot,
  pathEntryExists,
} from './refresh-fork-launchers.mjs'

if (process.argv.includes('--reverse')) {
  console.error('[sync-memory] GOV-MEMORY-001: home → repo is forbidden; edit committed governance/memory instead')
  process.exit(2)
}

const CHECK = process.argv.includes('--check')
const SKIP = new Set(['README.md'])
const digest = (content) => createHash('sha256').update(content).digest('hex')
const harnessEncode = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-')

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false
  try { process.kill(pid, 0); return true } catch (error) {
    if (error?.code === 'ESRCH') return false
    return true
  }
}

function acquireLock(homeRoot, cacheRoot, repositoryRoot) {
  const lockRoot = `${cacheRoot}.governance-sync-lock`
  assertNoSymlinkPath(homeRoot, lockRoot, 'Claude memory synchronization lock')
  if (pathEntryExists(lockRoot)) {
    const lockInfo = lstatSync(lockRoot)
    if (!lockInfo.isDirectory() || lockInfo.isSymbolicLink()) throw new Error('memory synchronization lock must be a real directory')
    const ownerPath = join(lockRoot, 'owner.json')
    assertNoSymlinkPath(homeRoot, ownerPath, 'Claude memory synchronization lock owner', { allowMissing: false })
    let owner
    try { owner = JSON.parse(readFileSync(ownerPath, 'utf8')) } catch { throw new Error('memory synchronization lock owner is missing or corrupt; manual inspection required') }
    if (processAlive(owner.pid)) throw new Error(`memory synchronization is already active under pid ${owner.pid}`)
    // The cache is non-authoritative and every write is per-file atomic. If the prior
    // owner is certainly gone, removing its lock and replaying the exact mirror is the
    // complete recovery procedure for any partially materialized cache.
    rmSync(lockRoot, { recursive: true, force: true })
  }
  mkdirSync(dirname(lockRoot), { recursive: true })
  assertNoSymlinkPath(homeRoot, dirname(lockRoot), 'Claude memory synchronization lock parent', { allowMissing: false })
  mkdirSync(lockRoot, { mode: 0o700 })
  const ownerPath = join(lockRoot, 'owner.json')
  writeFileSync(ownerPath, `${JSON.stringify({ schemaVersion: 1, pid: process.pid, repositoryRootDigest: digest(repositoryRoot), createdAt: new Date().toISOString() })}\n`, { flag: 'wx', mode: 0o600 })
  return lockRoot
}

function cacheObservation(homeRoot, cacheRoot, records) {
  const expected = new Map(records.map(record => [record.name, record]))
  const drift = []
  const extras = []
  let unchanged = 0
  if (!pathEntryExists(cacheRoot)) {
    for (const record of records) drift.push({ name: record.name, kind: 'missing' })
    return { drift, extras, unchanged }
  }
  const cacheInfo = lstatSync(cacheRoot)
  if (!cacheInfo.isDirectory() || cacheInfo.isSymbolicLink()) throw new Error('Claude memory cache must be a real directory')
  for (const name of readdirSync(cacheRoot).sort()) {
    const path = join(cacheRoot, name)
    assertNoSymlinkPath(homeRoot, path, `Claude memory cache entry ${name}`, { allowMissing: false })
    const info = lstatSync(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`memory cache may contain only regular files:${name}`)
    const record = expected.get(name)
    if (!record) { extras.push({ name, path }); drift.push({ name, kind: 'extra' }); continue }
    const sameContent = digest(readFileSync(path)) === digest(record.content)
    const sameMode = (info.mode & 0o777) === record.mode
    if (sameContent && sameMode) unchanged += 1
    else drift.push({ name, kind: sameContent ? 'mode' : 'content' })
    expected.delete(name)
  }
  for (const record of expected.values()) drift.push({ name: record.name, kind: 'missing' })
  return { drift, extras, unchanged }
}

function atomicWrite(homeRoot, destination, content, mode) {
  const temporary = `${destination}.tmp-governance-${process.pid}-${randomUUID()}`
  assertNoSymlinkPath(homeRoot, temporary, 'Claude memory cache temporary output')
  let descriptor
  try {
    descriptor = openSync(temporary, 'wx', mode)
    writeFileSync(descriptor, content)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    chmodSync(temporary, mode)
    renameSync(temporary, destination)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temporary, { force: true })
  }
}

try {
  const repositoryRoot = canonicalRepositoryRoot(process.cwd())
  const homeRoot = canonicalRepositoryRoot(homedir())
  const sourceRoot = join(repositoryRoot, 'governance/memory')
  const cacheRoot = join(homeRoot, '.claude', 'projects', harnessEncode(repositoryRoot), 'memory')

  assertNoSymlinkPath(repositoryRoot, sourceRoot, 'committed memory SSOT', { allowMissing: false })
  assertSafeTree(repositoryRoot, sourceRoot, 'committed memory SSOT')
  assertNoSymlinkPath(homeRoot, cacheRoot, 'Claude memory cache')
  if (!pathEntryExists(sourceRoot)) {
    console.error('[sync-memory] GOV-MEMORY-002: committed SSOT missing: governance/memory')
    process.exit(1)
  }
  const records = []
  let skipped = 0
  for (const name of readdirSync(sourceRoot).sort()) {
    if (SKIP.has(name)) { skipped += 1; continue }
    if (!name.endsWith('.md')) continue
    const source = join(sourceRoot, name)
    const sourceInfo = lstatSync(source)
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error(`memory source must be a regular non-symlink file:${name}`)
    records.push({ name, content: readFileSync(source), mode: sourceInfo.mode & 0o777, destination: join(cacheRoot, name) })
  }

  const initial = cacheObservation(homeRoot, cacheRoot, records)
  if (CHECK) {
    console.log(`[sync-memory] direction: repo → Claude cache | read-only=true | drifted: ${initial.drift.length} | unchanged: ${initial.unchanged} | skipped: ${skipped}`)
    process.exit(initial.drift.length > 0 ? 1 : 0)
  }

  const lockRoot = acquireLock(homeRoot, cacheRoot, repositoryRoot)
  let copied = 0
  let removed = 0
  try {
    if (!pathEntryExists(cacheRoot)) mkdirSync(cacheRoot, { recursive: true })
    assertNoSymlinkPath(homeRoot, cacheRoot, 'Claude memory cache', { allowMissing: false })
    // Re-observe after acquiring the lock so this transaction never acts on the
    // pre-lock image. Unsafe entries fail before the first write or deletion.
    const observed = cacheObservation(homeRoot, cacheRoot, records)
    const byName = new Map(observed.drift.map(item => [item.name, item]))
    for (const record of records) {
      if (!byName.has(record.name)) continue
      assertNoSymlinkPath(homeRoot, record.destination, `Claude memory cache target ${record.name}`)
      atomicWrite(homeRoot, record.destination, record.content, record.mode)
      copied += 1
      console.log(`[sync-memory] repo SSOT → Claude cache: ${record.name}`)
    }
    for (const extra of observed.extras) {
      assertNoSymlinkPath(homeRoot, extra.path, `Claude memory stale cache ${extra.name}`, { allowMissing: false })
      const info = lstatSync(extra.path)
      if (!info.isFile() || info.isSymbolicLink()) throw new Error(`stale cache entry became unsafe:${extra.name}`)
      rmSync(extra.path)
      removed += 1
    }
    const final = cacheObservation(homeRoot, cacheRoot, records)
    if (final.drift.length) throw new Error(`exact cache read-back failed:${final.drift.map(item => `${item.name}:${item.kind}`).join(',')}`)
    console.log(`[sync-memory] direction: repo → Claude cache | copied: ${copied} | removed: ${removed} | drifted: ${observed.drift.length} | unchanged: ${final.unchanged} | skipped: ${skipped}`)
  } finally {
    rmSync(lockRoot, { recursive: true, force: true })
  }
} catch (error) {
  console.error(`[sync-memory] GOV-MEMORY-003: unsafe cache/source path blocked: ${error.message}`)
  process.exit(2)
}

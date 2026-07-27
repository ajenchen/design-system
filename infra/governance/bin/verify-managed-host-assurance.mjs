#!/usr/bin/env node
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareUtf8Bytes, invariant, parseFlags, readJson, stableStringify } from '../lib/common.mjs'
import { verifyManagedHostAssurance } from '../lib/managed-host-assurance.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const RUNTIME_EVIDENCE = resolve(REPO_ROOT, 'infra/governance/runtime/managed-host-assurance.json')

function assertSafeStatePath(path, { allowMissing = false } = {}) {
  const absolute = resolve(path)
  invariant(isAbsolute(absolute), 'managed-host state path must be absolute')
  let cursor = resolve('/')
  for (const part of relative(resolve('/'), absolute).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part)
    if (!existsSync(cursor)) {
      invariant(allowMissing, `managed-host state path is missing:${cursor}`)
      return absolute
    }
    invariant(!lstatSync(cursor).isSymbolicLink(), `managed-host state path crosses a symbolic link:${cursor}`)
  }
  return absolute
}

function persistentReplayCache(path, now) {
  const absolute = assertSafeStatePath(resolve(path), { allowMissing: true })
  const parent = assertSafeStatePath(dirname(absolute))
  const parentInfo = lstatSync(parent)
  invariant(parentInfo.isDirectory() && !parentInfo.isSymbolicLink(), 'managed-host replay cache parent must be a real directory')
  if (process.platform !== 'win32') {
    const effectiveUid = typeof process.geteuid === 'function' ? process.geteuid() : null
    invariant((parentInfo.mode & 0o022) === 0, 'managed-host replay cache parent may not be group/world writable')
    invariant(effectiveUid === null || parentInfo.uid === effectiveUid || parentInfo.uid === 0, 'managed-host replay cache parent has an unexpected owner')
  }

  const lock = assertSafeStatePath(`${absolute}.lock`, { allowMissing: true })
  try {
    mkdirSync(lock, { mode: 0o700 })
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('managed-host replay cache is already locked; concurrent certification fails closed')
    throw error
  }

  let entries = []
  try {
    assertSafeStatePath(lock)
    if (existsSync(absolute)) {
      const info = lstatSync(absolute)
      invariant(info.isFile() && !info.isSymbolicLink(), 'managed-host replay cache must be a regular file')
      if (process.platform !== 'win32') {
        const effectiveUid = typeof process.geteuid === 'function' ? process.geteuid() : null
        invariant((info.mode & 0o077) === 0, 'managed-host replay cache permissions are not private')
        invariant(effectiveUid === null || info.uid === effectiveUid || info.uid === 0, 'managed-host replay cache has an unexpected owner')
      }
      const value = JSON.parse(readFileSync(absolute, 'utf8'))
      invariant(value && typeof value === 'object' && !Array.isArray(value) && value.schemaVersion === 1 && Array.isArray(value.entries) && Object.keys(value).sort(compareUtf8Bytes).join(',') === 'entries,schemaVersion', 'managed-host replay cache has an invalid shape')
      const seen = new Set()
      for (const entry of value.entries) {
        invariant(entry && typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).sort(compareUtf8Bytes).join(',') === 'expiresAt,key', 'managed-host replay cache entry has an invalid shape')
        invariant(typeof entry.key === 'string' && entry.key.length > 0 && !seen.has(entry.key), 'managed-host replay cache key is invalid or duplicated')
        const expiresAt = new Date(entry.expiresAt)
        invariant(Number.isFinite(expiresAt.getTime()), 'managed-host replay cache expiry is invalid')
        seen.add(entry.key)
        if (expiresAt.getTime() > now.getTime()) entries.push(entry)
      }
    }
  } catch (error) {
    rmdirSync(lock)
    throw error
  }
  let dirty = false
  let closed = false
  const known = new Set(entries.map(entry => entry.key))
  return {
    durability: 'persistent-atomic',
    consume({ key, expiresAt }) {
      if (known.has(key)) return false
      const expiry = new Date(expiresAt)
      invariant(Number.isFinite(expiry.getTime()) && expiry.getTime() > now.getTime(), 'managed-host replay entry expiry is invalid')
      known.add(key)
      entries.push({ key, expiresAt: expiry.toISOString() })
      entries.sort((left, right) => compareUtf8Bytes(left.key, right.key))
      dirty = true
      return true
    },
    flush() {
      invariant(!closed, 'managed-host replay cache is already closed')
      try {
        if (dirty || !existsSync(absolute)) {
          const temporary = `${absolute}.${process.pid}.tmp`
          const descriptor = openSync(temporary, 'wx', 0o600)
          try {
            writeFileSync(descriptor, `${stableStringify({ schemaVersion: 1, entries }, 2)}\n`)
            fsyncSync(descriptor)
          } finally {
            closeSync(descriptor)
          }
          renameSync(temporary, absolute)
          if (process.platform !== 'win32') {
            const directoryDescriptor = openSync(parent, 'r')
            try { fsyncSync(directoryDescriptor) } finally { closeSync(directoryDescriptor) }
          }
          dirty = false
        }
      } finally {
        rmdirSync(lock)
        closed = true
      }
    },
  }
}

function main() {
  const flags = parseFlags(process.argv.slice(2), {
    'host-root': 'string',
    'effective-readbacks': 'string',
    'expected-host-id': 'string',
    'expected-endpoint-id': 'string',
    'expected-device-identity-sha256': 'string',
    'replay-cache': 'string',
    'write-evidence': 'boolean',
    'require-aligned': 'boolean',
    'require-certified': 'boolean',
  })
  if (flags._.length) throw new Error('usage: verify-managed-host-assurance.mjs [--host-root PATH] [--effective-readbacks FILE --expected-host-id ID --expected-endpoint-id ID --expected-device-identity-sha256 SHA256] [--replay-cache FILE] [--write-evidence] [--require-aligned] [--require-certified]')
  const readbacks = flags['effective-readbacks'] ? readJson(resolve(flags['effective-readbacks'])) : {}
  invariant(readbacks && typeof readbacks === 'object' && !Array.isArray(readbacks), 'effective readbacks must be a provider-keyed object')
  const hasReadbacks = Object.keys(readbacks).length > 0
  const identityFlags = [flags['expected-host-id'], flags['expected-endpoint-id'], flags['expected-device-identity-sha256']]
  invariant(!hasReadbacks || identityFlags.every(Boolean), 'signed readbacks require the complete externally expected host identity')
  invariant(!flags['require-certified'] || flags['replay-cache'], '--require-certified requires a persistent replay cache')
  const platform = process.platform
  const expectedHostIdentity = hasReadbacks ? {
    hostId: flags['expected-host-id'],
    endpointId: flags['expected-endpoint-id'],
    platform,
    deviceIdentitySha256: flags['expected-device-identity-sha256'],
  } : null
  const generatedAt = new Date()
  const replayProtection = flags['replay-cache'] ? persistentReplayCache(flags['replay-cache'], generatedAt) : null
  let evidence
  try {
    evidence = verifyManagedHostAssurance({
      repoRoot: REPO_ROOT,
      hostRoot: flags['host-root'] ? resolve(flags['host-root']) : '/',
      effectiveReadbacks: readbacks,
      expectedHostIdentity,
      replayProtection,
      generatedAt,
    })
  } finally {
    replayProtection?.flush()
  }
  if (flags['write-evidence']) {
    assertSafeStatePath(dirname(RUNTIME_EVIDENCE))
    const temporary = `${RUNTIME_EVIDENCE}.${process.pid}.tmp`
    writeFileSync(temporary, `${stableStringify(evidence, 2)}\n`, { mode: 0o600, flag: 'wx' })
    renameSync(temporary, RUNTIME_EVIDENCE)
  }
  process.stdout.write(`${stableStringify(evidence, 2)}\n`)
  if (flags['require-certified'] && evidence.overallStatus !== 'certified') process.exitCode = 2
  else if (flags['require-aligned'] && !['aligned-unattested', 'certified'].includes(evidence.overallStatus)) process.exitCode = 2
}

try {
  main()
} catch (error) {
  process.stderr.write(`managed-host assurance blocked:${error.message}\n`)
  process.exitCode = 2
}

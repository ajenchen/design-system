#!/usr/bin/env node
// Provider-neutral memory SSOT fixture: content-hash materialization and reverse-write rejection.

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'sync-memory-'))
const repo = join(temp, 'repo')
const home = join(temp, 'home')
mkdirSync(repo, { recursive: true })
const encoded = realpathSync(repo).replace(/[^A-Za-z0-9]/g, '-')
const cache = join(home, '.claude/projects', encoded, 'memory')
const run = (...args) => spawnSync(process.execPath, ['--', join(root, 'scripts/sync-memory.mjs'), ...args], {
  cwd: repo,
  env: { ...process.env, HOME: home },
  encoding: 'utf8',
})

try {
  mkdirSync(join(repo, 'governance/memory'), { recursive: true })
  mkdirSync(cache, { recursive: true })
  const source = join(repo, 'governance/memory/MEMORY.md')
  const destination = join(cache, 'MEMORY.md')
  writeFileSync(source, 'repo-authority\n')
  writeFileSync(destination, 'home-is-stale\n') // same byte length, deliberately newer mtime
  const future = new Date(Date.now() + 86_400_000)
  utimesSync(destination, future, future)

  const materialize = run()
  if (materialize.status !== 0 || readFileSync(destination, 'utf8') !== 'repo-authority\n') {
    throw new Error(`hash-based materialization failed:${materialize.stdout}\n${materialize.stderr}`)
  }
  const clean = run('--check')
  if (clean.status !== 0) throw new Error(`equal cache reported drift:${clean.stdout}\n${clean.stderr}`)

  chmodSync(destination, 0o600)
  const modeDrift = run('--check')
  if (modeDrift.status === 0) throw new Error('cache mode drift was not detected')
  const modeRepair = run()
  if (modeRepair.status !== 0 || (statSync(destination).mode & 0o777) !== 0o644) throw new Error(`cache mode was not repaired:${modeRepair.stdout}\n${modeRepair.stderr}`)

  const stale = join(cache, 'stale-home-only.md')
  writeFileSync(stale, 'stale\n')
  if (run('--check').status === 0) throw new Error('extra home cache file was not detected')
  const prune = run()
  if (prune.status !== 0 || readdirSync(cache).includes('stale-home-only.md')) throw new Error(`extra home cache file was not removed:${prune.stdout}\n${prune.stderr}`)

  writeFileSync(destination, 'cache-tampered\n')
  const check = run('--check')
  if (check.status === 0 || readFileSync(destination, 'utf8') !== 'cache-tampered\n') {
    throw new Error(`read-only drift check false-green or mutated cache:${check.stdout}\n${check.stderr}`)
  }

  const lockRoot = `${cache}.governance-sync-lock`
  mkdirSync(lockRoot)
  writeFileSync(join(lockRoot, 'owner.json'), `${JSON.stringify({ schemaVersion: 1, pid: process.pid, repositoryRootDigest: 'fixture', createdAt: new Date().toISOString() })}\n`)
  const concurrent = run()
  if (concurrent.status !== 2 || readFileSync(destination, 'utf8') !== 'cache-tampered\n') {
    throw new Error(`active synchronization lock did not fail closed:${concurrent.stdout}\n${concurrent.stderr}`)
  }
  rmSync(lockRoot, { recursive: true })
  mkdirSync(lockRoot)
  writeFileSync(join(lockRoot, 'owner.json'), `${JSON.stringify({ schemaVersion: 1, pid: 2147483647, repositoryRootDigest: 'fixture', createdAt: new Date(0).toISOString() })}\n`)
  const recovered = run()
  if (recovered.status !== 0 || readFileSync(destination, 'utf8') !== 'repo-authority\n') {
    throw new Error(`stale synchronization lock did not recover by exact replay:${recovered.stdout}\n${recovered.stderr}`)
  }
  const before = readFileSync(source)
  const reverse = run('--reverse')
  if (reverse.status !== 2 || !readFileSync(source).equals(before)) {
    throw new Error(`reverse write was not fail-closed:${reverse.stdout}\n${reverse.stderr}`)
  }

  const external = join(temp, 'external')
  mkdirSync(external, { recursive: true })
  const sentinel = join(external, 'sentinel.md')
  writeFileSync(sentinel, 'external-sentinel\n')

  rmSync(destination)
  symlinkSync(sentinel, destination)
  const destinationAttack = run()
  if (destinationAttack.status !== 2 || readFileSync(sentinel, 'utf8') !== 'external-sentinel\n') {
    throw new Error(`destination symlink was not blocked:${destinationAttack.stdout}\n${destinationAttack.stderr}`)
  }
  rmSync(destination)
  writeFileSync(destination, 'cache-tampered\n')

  rmSync(source)
  symlinkSync(sentinel, source)
  const sourceAttack = run()
  if (sourceAttack.status !== 2 || readFileSync(sentinel, 'utf8') !== 'external-sentinel\n') {
    throw new Error(`source symlink was not blocked:${sourceAttack.stdout}\n${sourceAttack.stderr}`)
  }
  rmSync(source)
  writeFileSync(source, 'repo-authority\n')

  rmSync(join(home, '.claude'), { recursive: true, force: true })
  symlinkSync(external, join(home, '.claude'))
  const ancestorAttack = run()
  if (ancestorAttack.status !== 2 || readFileSync(sentinel, 'utf8') !== 'external-sentinel\n') {
    throw new Error(`cache ancestor symlink was not blocked:${ancestorAttack.stdout}\n${ancestorAttack.stderr}`)
  }

  console.log('✅ MEMORY SSOT PASS(exact one-way cache, stale/mode/lock recovery, read-only drift, reverse/source/target/ancestor symlinks blocked)')
} finally {
  rmSync(temp, { recursive: true, force: true })
}

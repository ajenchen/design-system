#!/usr/bin/env node
/**
 * Execute gate mutation tests in a disposable repository snapshot.
 *
 * The snapshot preserves HEAD, the caller index (including staged bytes),
 * current working-tree bytes/types/modes and untracked non-ignored artifacts.
 * Ignored data is never traversed or copied: Git's frozen tracked + untracked
 * non-ignored inventory is the only worktree read authority.
 * Installed dependencies are copied into the snapshot with copy-on-write when
 * the filesystem supports it (portable byte-copy fallback; never hard links).
 * Workspace-package symlinks consequently resolve back into snapshot packages,
 * never the caller. Every mutation, failed restore, or crashed child therefore
 * dies with the disposable repository. This is mutation detection and cleanup,
 * not an OS sandbox and not proof that external writes were contained.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  realpathSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createDisposableRepositorySnapshot,
  captureFrozenRepositoryManifest,
  diffRepositoryFingerprints,
  disposableSnapshotEnvironment,
  fingerprintCallerRepository,
  removeDisposableRepositorySnapshot,
  verifyDisposableSnapshotToolProfile,
} from './lib/disposable-repository-snapshot.mjs'
import { createGateMetaTestInventory } from './lib/gate-meta-test-inventory.mjs'

export { createDisposableRepositorySnapshot, fingerprintCallerRepository }

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DEFAULT_ROOT = realpathSync(resolve(dirname(SCRIPT_PATH), '..'))

function fail(message) {
  throw new Error(`gate meta-test snapshot blocked:${message}`)
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (options.allowFailure) return result
  if (result.status !== 0) {
    const detail = `${result.stderr || result.stdout || result.error?.message || result.signal || 'unknown failure'}`.trim()
    fail(`${commandName} ${args.join(' ')} failed:${detail.slice(-2000)}`)
  }
  return result
}

export function collectGateMetaTestInventory(root, options = {}) {
  return createGateMetaTestInventory({ root, ...options })
}

export function collectGateMetaTests(root, options = {}) {
  return collectGateMetaTestInventory(root, options).runnable
}


export function runGateMetaTests({
  root = DEFAULT_ROOT,
  dependencyRoot = root,
  exclusionDocument,
  timeoutMs = Number(process.env.GATE_META_TEST_TIMEOUT_MS || 15 * 60 * 1000),
} = {}) {
  const callerRoot = realpathSync(resolve(root))
  const before = fingerprintCallerRepository(callerRoot)
  const manifest = captureFrozenRepositoryManifest(callerRoot)
  let snapshot
  let result
  try {
    snapshot = createDisposableRepositorySnapshot({ root: callerRoot, dependencyRoot, manifest })
    const inventory = collectGateMetaTestInventory(snapshot.snapshotRoot, { exclusionDocument })
    const environment = disposableSnapshotEnvironment(snapshot)
    let pass = 0
    const failed = []
    for (const { file, stem } of inventory.runnable) {
      verifyDisposableSnapshotToolProfile(snapshot)
      const child = command(process.execPath, [join(snapshot.snapshotRoot, 'scripts', file)], {
        cwd: snapshot.snapshotRoot,
        env: environment,
        allowFailure: true,
        timeout: timeoutMs,
      })
      verifyDisposableSnapshotToolProfile(snapshot)
      if (child.status === 0) pass += 1
      else failed.push({
        stem,
        code: child.status ?? child.signal ?? child.error?.code ?? 'unknown',
        detail: `${child.stderr || child.stdout || child.error?.message || ''}`.trim().split('\n').slice(-8).join('\n'),
      })
    }
    result = {
      pass,
      total: inventory.runnable.length,
      discoverable: inventory.discoverable.length,
      ran: pass + failed.length,
      failed,
      excluded: inventory.excluded.map(({ stem, executionClass }) => ({ stem, executionClass })),
      excludedByClass: Object.fromEntries(
        Object.entries(inventory.excludedByClass).map(([name, entries]) => [name, entries.map(({ stem }) => stem)]),
      ),
      snapshotRoot: snapshot.snapshotRoot,
      snapshotParent: snapshot.parent,
    }
  } finally {
    removeDisposableRepositorySnapshot(snapshot)
  }
  const after = fingerprintCallerRepository(callerRoot)
  const callerDrift = diffRepositoryFingerprints(before, after)
  return { ...result, callerDrift, cleaned: snapshot ? !existsSync(snapshot.parent) : true }
}

function printResult(result) {
  const excluded = Object.entries(result.excludedByClass)
    .map(([name, stems]) => `${name}:${stems.length}[${stems.join(',')}]`)
    .join(',')
  console.log(`gate meta-tests(snapshot): discoverable=${result.discoverable} ran=${result.ran} pass=${result.pass} excluded-by-class={${excluded}}`)
  if (result.callerDrift.length) {
    console.error('❌ caller repository changed while disposable meta-tests ran:')
    result.callerDrift.slice(0, 100).forEach((path) => console.error(`   - ${path}`))
  }
  if (result.failed.length) {
    console.error(`❌ ${result.failed.length} gate meta-test(s) failed in the disposable snapshot:`)
    for (const failure of result.failed) {
      console.error(`   - test-${failure.stem}.mjs(${failure.code})`)
      if (failure.detail) console.error(failure.detail.split('\n').map((line) => `       ${line}`).join('\n'))
    }
  }
  if (!result.cleaned) console.error('❌ disposable repository cleanup failed')
}

const IS_MAIN = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH) } catch { return false }
})()

if (IS_MAIN) {
  try {
    const result = runGateMetaTests()
    printResult(result)
    if (result.failed.length || result.callerDrift.length || !result.cleaned) process.exit(1)
    console.log('✅ all gate mutation tests passed in an isolated repository; caller stayed byte/mode/type identical')
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
}

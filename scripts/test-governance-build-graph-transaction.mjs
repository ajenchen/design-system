#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTHORITY_GENERATION_JOURNAL,
  assertAuthorityGenerationIdle,
  recoverInterruptedAuthorityGeneration,
  runAtomicAuthorityGenerationTransaction,
} from './lib/canonical-sync-transaction.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = [
  'out/created.txt',
  'out/deleted.txt',
  'out/dirty.txt',
  'out/link',
  'out/tree',
  'state/seed.json',
]

function inventory(root) {
  const rows = []
  const visit = (absolute, path) => {
    const info = fs.lstatSync(absolute)
    const mode = (info.mode & 0o777).toString(8).padStart(3, '0')
    if (info.isSymbolicLink()) {
      rows.push(`symlink:${path}:${mode}:${Buffer.from(fs.readlinkSync(absolute)).toString('base64')}`)
      return
    }
    if (info.isDirectory()) {
      rows.push(`tree:${path}:${mode}`)
      for (const name of fs.readdirSync(absolute).sort()) visit(join(absolute, name), `${path}/${name}`)
      return
    }
    rows.push(`file:${path}:${mode}:${createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`)
  }
  for (const name of fs.readdirSync(root).sort()) visit(join(root, name), name)
  return createHash('sha256').update(`${rows.join('\n')}\n`).digest('hex')
}

function fixture(prefix) {
  const outer = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), prefix)))
  const root = join(outer, 'repository')
  fs.mkdirSync(join(root, 'authority'), { recursive: true })
  fs.mkdirSync(join(root, 'out/tree'), { recursive: true })
  fs.mkdirSync(join(root, 'state'), { recursive: true })
  fs.writeFileSync(join(root, 'authority/source.txt'), 'canonical-source\n', { mode: 0o640 })
  fs.writeFileSync(join(root, 'out/dirty.txt'), 'preexisting-user-dirty-bytes\n', { mode: 0o601 })
  fs.writeFileSync(join(root, 'out/tree/stale.txt'), 'stale-generator-output\n', { mode: 0o604 })
  fs.chmodSync(join(root, 'out/tree'), 0o751)
  fs.writeFileSync(join(root, 'out/deleted.txt'), 'must-return-on-rollback\n', { mode: 0o620 })
  fs.symlinkSync('preexisting-broken-target', join(root, 'out/link'))
  fs.writeFileSync(join(root, 'state/seed.json'), '{"userDirty":true}\n', { mode: 0o600 })
  return { outer, root: fs.realpathSync(root) }
}

function sourceFingerprint(root) {
  return createHash('sha256').update(fs.readFileSync(join(root, 'authority/source.txt'))).digest('hex')
}

function generate(root) {
  const seed = JSON.parse(fs.readFileSync(join(root, 'state/seed.json'), 'utf8'))
  assert.equal(seed.userDirty, true)
  if (seed.source !== undefined) assert.equal(seed.source, sourceFingerprint(root))
  fs.mkdirSync(join(root, 'out/tree'), { recursive: true })
  fs.writeFileSync(join(root, 'out/dirty.txt'), 'deterministic-generated-bytes\n', { mode: 0o644 })
  fs.writeFileSync(join(root, 'out/created.txt'), 'created-by-generator\n', { mode: 0o640 })
  fs.writeFileSync(join(root, 'out/tree/current.txt'), 'complete-tree-after-image\n', { mode: 0o604 })
  fs.chmodSync(join(root, 'out/tree'), 0o750)
  fs.symlinkSync('../authority/source.txt', join(root, 'out/link'))
  fs.writeFileSync(
    join(root, 'state/seed.json'),
    `${JSON.stringify({ source: sourceFingerprint(root), userDirty: seed.userDirty }, null, 2)}\n`,
    { mode: 0o600 },
  )
}

function verify(root) {
  assert.equal(fs.readFileSync(join(root, 'out/dirty.txt'), 'utf8'), 'deterministic-generated-bytes\n')
  assert.equal(fs.readFileSync(join(root, 'out/created.txt'), 'utf8'), 'created-by-generator\n')
  assert.equal(fs.readFileSync(join(root, 'out/tree/current.txt'), 'utf8'), 'complete-tree-after-image\n')
  assert.equal(fs.existsSync(join(root, 'out/tree/stale.txt')), false)
  assert.equal(fs.existsSync(join(root, 'out/deleted.txt')), false)
  assert.equal(fs.readlinkSync(join(root, 'out/link')), '../authority/source.txt')
  assert.equal(fs.lstatSync(join(root, 'out/dirty.txt')).mode & 0o777, 0o644)
  assert.equal(fs.lstatSync(join(root, 'out/tree')).mode & 0o777, 0o750)
}

function options(root, { failLive = false } = {}) {
  return {
    root,
    targetPaths: TARGETS,
    seedTargetPaths: ['state/seed.json'],
    authorityFingerprint: () => sourceFingerprint(root),
    materializeWorkspace: ({ workspaceRoot }) => fs.cpSync(root, workspaceRoot, {
      recursive: true,
      dereference: false,
      preserveTimestamps: false,
      verbatimSymlinks: true,
    }),
    generateWorkspace: ({ workspaceRoot }) => generate(workspaceRoot),
    verifyWorkspace: ({ workspaceRoot }) => verify(workspaceRoot),
    verifyLive: () => {
      verify(root)
      if (failLive) throw new Error('injected late live verification failure')
    },
  }
}

if (process.argv[2] === '--crash-probe') {
  const root = process.argv[3]
  runAtomicAuthorityGenerationTransaction({
    ...options(root),
    failureInjector: ({ phase, index }) => {
      if (phase === 'after-target' && index === 1) process.exit(86)
    },
  })
  throw new Error('crash probe escaped its injected process exit')
}

{
  const fx = fixture('governance-graph-transaction-late-')
  try {
    const before = inventory(fx.root)
    assert.throws(
      () => runAtomicAuthorityGenerationTransaction(options(fx.root, { failLive: true })),
      /injected late live verification failure/,
    )
    assert.equal(inventory(fx.root), before)
    assert.equal(fs.existsSync(join(fx.root, AUTHORITY_GENERATION_JOURNAL)), false)
    assert.deepEqual(fs.readdirSync(fx.outer).filter(name => name.startsWith('.governance-build-graph-')), [])
  } finally {
    fs.rmSync(fx.outer, { recursive: true, force: true })
  }
}

{
  const fx = fixture('governance-graph-transaction-idempotent-')
  try {
    assert.equal(runAtomicAuthorityGenerationTransaction(options(fx.root)).targetCount, TARGETS.length)
    verify(fx.root)
    const first = inventory(fx.root)
    assert.equal(runAtomicAuthorityGenerationTransaction(options(fx.root)).targetCount, TARGETS.length)
    assert.equal(inventory(fx.root), first)
  } finally {
    fs.rmSync(fx.outer, { recursive: true, force: true })
  }
}

{
  const fx = fixture('governance-graph-transaction-crash-')
  const before = inventory(fx.root)
  try {
    const child = spawnSync(process.execPath, [
      'scripts/test-governance-build-graph-transaction.mjs',
      '--crash-probe',
      fx.root,
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.equal(child.status, 86, child.stderr || child.stdout)
    assert.equal(fs.existsSync(join(fx.root, AUTHORITY_GENERATION_JOURNAL)), true)
    const crashed = inventory(fx.root)
    assert.throws(() => assertAuthorityGenerationIdle({ root: fx.root }), /--check is read-only and will not recover/)
    assert.equal(inventory(fx.root), crashed)

    const dirty = join(fx.root, 'out/dirty.txt')
    const originalBytes = fs.readFileSync(dirty)
    const originalMode = fs.lstatSync(dirty).mode & 0o777
    fs.writeFileSync(dirty, 'unknown-post-crash-user-bytes\n')
    const unknown = inventory(fx.root)
    assert.throws(
      () => recoverInterruptedAuthorityGeneration({ root: fx.root, targetPaths: TARGETS }),
      /unknown post-journal content:out\/dirty\.txt/,
    )
    assert.equal(inventory(fx.root), unknown)
    fs.writeFileSync(dirty, originalBytes)
    fs.chmodSync(dirty, originalMode)

    const recovered = recoverInterruptedAuthorityGeneration({ root: fx.root, targetPaths: TARGETS })
    assert.equal(recovered.recovered, true)
    assert.equal(recovered.targetCount, TARGETS.length)
    assert.equal(inventory(fx.root), before)
  } finally {
    fs.rmSync(fx.outer, { recursive: true, force: true })
  }
}

console.log('✓ graph-wide authority transaction preserves dirty outputs and atomically handles stale/create/delete, late failure, crash recovery, and idempotence')

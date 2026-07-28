#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkBundleSize, createBundleBudget } from './check-bundle-size.mjs'

const fixtureRoot = mkdtempSync(join(tmpdir(), 'bundle-size-meta-'))
const distDir = join(fixtureRoot, 'dist')
const budgetPath = join(fixtureRoot, 'bundle-budget.json')
const measuredEntry = join(distDir, 'components', 'entry.js')

try {
  mkdirSync(join(distDir, 'components'), { recursive: true })
  writeFileSync(measuredEntry, Buffer.alloc(1024, 0x61))
  writeFileSync(join(distDir, 'styles.css'), Buffer.alloc(256, 0x62))
  writeFileSync(join(distDir, 'ignored.map'), Buffer.alloc(4096, 0x63))
  writeFileSync(budgetPath, `${JSON.stringify({
    _meta: { generatedAt: '2026-07-22', rule: 'paired mutation fixture' },
    totalKB: 1.3,
    entriesKB: { 'components/entry.js': 1 },
  }, null, 2)}\n`)

  const baseline = checkBundleSize({ distDir, budgetPath })
  assert.equal(baseline.ok, true, `fixture baseline must pass:${baseline.failures.join(';')}`)
  assert.equal(baseline.totalBytes, 1280, 'only measured .js/.css bytes belong to the gate')

  const original = readFileSync(measuredEntry)
  try {
    writeFileSync(measuredEntry, Buffer.concat([original, Buffer.alloc(1024, 0x64)]))
    const mutated = checkBundleSize({ distDir, budgetPath })
    assert.equal(mutated.ok, false, 'a real measured artifact growth must fail the gate')
    assert.equal(mutated.failures.some((failure) => failure.startsWith('total ')), true)
    assert.equal(mutated.failures.some((failure) => failure.startsWith('components/entry.js ')), true)
  } finally {
    writeFileSync(measuredEntry, original)
  }

  const restored = checkBundleSize({ distDir, budgetPath })
  assert.equal(restored.ok, true, `restored fixture must pass:${restored.failures.join(';')}`)

  const outside = join(fixtureRoot, 'outside.js')
  const link = join(distDir, 'linked.js')
  writeFileSync(outside, Buffer.alloc(64, 0x65))
  symlinkSync(outside, link)
  assert.throws(
    () => checkBundleSize({ distDir, budgetPath }),
    /symbolic link/,
    'a dist symlink must not read or count bytes outside the authenticated build tree',
  )
  rmSync(link)
  symlinkSync(join(distDir, 'components'), join(distDir, 'components', 'loop'))
  assert.throws(
    () => checkBundleSize({ distDir, budgetPath }),
    /symbolic link/,
    'a directory symlink loop must fail closed before recursive traversal',
  )
  rmSync(join(distDir, 'components', 'loop'))

  const initialized = createBundleBudget({
    distDir,
    headroom: 1.1,
    topN: 1,
    generatedAt: '2030-01-02',
  })
  assert.equal(initialized.budget._meta.generatedAt, '2030-01-02', 'init metadata must be injectable')
  assert.deepEqual(Object.keys(initialized.budget.entriesKB), ['components/entry.js'])
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true })
}

console.log('✅ bundle-size paired mutation: baseline PASS → measured artifact growth FAIL → restore PASS')

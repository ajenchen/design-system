#!/usr/bin/env node
// Isolated meta-test: never mutates the working tree it is validating.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GATE = join(ROOT, 'scripts/audit-failure-class-coverage.mjs')
const RELATIVE = 'packages/design-system/ds-canonical/references/failure-class-registry.json'
const SOURCE = join(ROOT, RELATIVE)

function run(root) {
  return spawnSync(process.execPath, ['--', GATE, '--root', root, '--check'], { encoding: 'utf8' })
}

function install(root) {
  const target = join(root, RELATIVE)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(SOURCE, target)
  return target
}

const fixture = mkdtempSync(join(tmpdir(), 'failure-class-gate-'))
const outside = mkdtempSync(join(tmpdir(), 'failure-class-gate-outside-'))
try {
  const target = install(fixture)

  // Canonical source passes even when a poisoned Claude projection exists.
  const legacy = join(fixture, '.claude/references/failure-class-registry.json')
  mkdirSync(dirname(legacy), { recursive: true })
  writeFileSync(legacy, '{"classes":[]}', 'utf8')
  assert.equal(run(fixture).status, 0)

  const registry = JSON.parse(readFileSync(target, 'utf8'))
  registry.classes[0].status = 'bogus-invalid-status'
  writeFileSync(target, `${JSON.stringify(registry, null, 2)}\n`)
  assert.notEqual(run(fixture).status, 0, 'invalid canonical status was accepted')

  rmSync(target)
  writeFileSync(join(outside, 'registry.json'), readFileSync(SOURCE))
  symlinkSync(join(outside, 'registry.json'), target)
  assert.notEqual(run(fixture).status, 0, 'symlinked canonical registry was accepted')
} finally {
  rmSync(fixture, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
}

console.log('✅ failure-class gate uses canonical SSOT and isolated fail-closed fixtures')

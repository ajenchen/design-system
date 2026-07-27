#!/usr/bin/env node
// Isolated meta-test: provider views and the caller worktree are never mutated.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GATE = join(ROOT, 'scripts/audit-hook-test-coverage.mjs')
const fixture = mkdtempSync(join(tmpdir(), 'hook-test-coverage-'))
const hooks = join(fixture, 'packages/design-system/ds-canonical/hooks')
const tests = join(hooks, 'tests')

function run() {
  return spawnSync(process.execPath, ['--', GATE, '--check', '--root', fixture], { encoding: 'utf8' })
}

try {
  mkdirSync(tests, { recursive: true })
  writeFileSync(join(hooks, 'check_fixture.sh'), '#!/bin/sh\nexit 2\n', { mode: 0o755 })
  writeFileSync(join(tests, 'test_check_fixture.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  assert.equal(run().status, 0)

  rmSync(join(tests, 'test_check_fixture.sh'))
  assert.notEqual(run().status, 0, 'BLOCKER hook without a test was accepted')

  writeFileSync(join(hooks, 'block_python_fixture.py'), 'raise SystemExit(2)\n# BLOCKER\n')
  assert.notEqual(run().status, 0, 'Python BLOCKER hook without a test was accepted')
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

console.log('✅ hook-test coverage reads canonical hooks and uses isolated mutations')

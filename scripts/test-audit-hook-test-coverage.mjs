#!/usr/bin/env node
// Isolated meta-test: provider views and the caller worktree are never mutated.
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: audit-hook-test-coverage.mjs 該綠時綠、該紅時紅 —— 全在 mkdtemp 夾具裡:一支 exit 2 的 hook 配一支測試 → 必須 exit 0;
//         刪掉那支測試 → 必須非 0;再加一支含 BLOCKER 的 .py 而沒有測試 → 仍必須非 0
//   紅: 任一斷言不成立 → node:assert 丟例外,exit 非 0
//   綠: 三條都成立時 exit 0 並印出 ✅;不寫入受驗的工作樹,夾具在 finally 刪掉,不讀時間,重複跑結果相同
//       (本測試不跑真 repo 的現況 —— 那一半由 ci.yml 同一步先跑的主判定負責)
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

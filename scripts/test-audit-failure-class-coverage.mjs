#!/usr/bin/env node
// Isolated meta-test: never mutates the working tree it is validating.
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: audit-failure-class-coverage.mjs 該綠時綠、該紅時紅 —— 全在 mkdtemp 夾具裡:複製 canonical registry(旁邊另放一份空的 .claude 投影當干擾)
//         → 必須 exit 0;把第一類的 status 改成 bogus → 必須非 0;把 registry 換成指到夾具外的 symlink → 必須非 0
//   紅: 任一斷言不成立 → node:assert 丟例外,exit 非 0 並印出是哪一條
//   綠: 三條都成立時 exit 0 並印出 ✅;不寫入受驗的工作樹,兩個夾具在 finally 刪掉,不讀時間,重複跑結果相同
//       (本測試不跑真 repo 的現況 —— 那一半由 ci.yml 同一步先跑的主判定負責)
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

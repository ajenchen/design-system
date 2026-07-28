#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'calc-self-audit-baseline.mjs')
const fixture = mkdtempSync(join(tmpdir(), 'self-audit-baseline-'))
const outside = mkdtempSync(join(tmpdir(), 'self-audit-baseline-outside-'))
execFileSync('git', ['init', '-q', fixture])
const gitDirectory = realpathSync(join(fixture, '.git'))
const runtimeRoot = join(gitDirectory, 'governance-runtime')
const stateRoot = join(runtimeRoot, 'state')
const baselineFile = join(stateRoot, 'self-audit-baseline-counts.jsonl')

function run(extraEnv = {}) {
  return spawnSync(process.execPath, ['--', SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GOVERNANCE_PROJECT_DIR: fixture,
      GOVERNANCE_RUNTIME_ROOT: runtimeRoot,
      GOVERNANCE_STATE_DIR: stateRoot,
      ...extraEnv,
    },
  })
}

try {
  mkdirSync(join(fixture, '.claude/logs'), { recursive: true })
  writeFileSync(
    join(fixture, '.claude/logs/self-audit-baseline-counts.jsonl'),
    Array.from({ length: 100 }, () => '{"trigger":999,"topic":999}').join('\n') + '\n',
  )
  mkdirSync(join(fixture, 'infra/governance/runtime'), { recursive: true })
  writeFileSync(
    join(fixture, 'infra/governance/runtime/self-audit-baseline-counts.jsonl'),
    Array.from({ length: 100 }, () => '{"trigger":888,"topic":888}').join('\n') + '\n',
  )
  const poisonOnly = run({ GOVERNANCE_READ_ONLY: '1' })
  assert.equal(poisonOnly.status, 0, poisonOnly.stderr)
  assert.match(poisonOnly.stdout, /No baseline file/)
  assert.equal(existsSync(runtimeRoot), false)
  rmSync(join(fixture, 'infra/governance/runtime'), { recursive: true, force: true })
  console.log('✓ provider/workspace poison is ignored and read-only analysis creates no Git runtime')

  mkdirSync(stateRoot, { recursive: true })
  writeFileSync(
    baselineFile,
    Array.from({ length: 100 }, (_, index) => JSON.stringify({
      ts: `2026-07-21T00:00:${String(index % 60).padStart(2, '0')}Z`,
      trigger: 2,
      topic: 3,
      fired: false,
    })).join('\n') + '\n',
  )
  rmSync(join(fixture, '.claude'), { recursive: true, force: true })
  const canonical = run({ GOVERNANCE_READ_ONLY: '1' })
  assert.equal(canonical.status, 0, canonical.stderr)
  assert.match(canonical.stdout, /Trigger ≥ 2/)
  assert.match(canonical.stdout, /Topic > 3/)
  assert.match(canonical.stdout, /packages\/design-system\/ds-canonical\/hooks\/stop_self_audit\.sh/)
  assert.doesNotMatch(canonical.stdout, /\.claude\/hooks/)
  assert.equal(existsSync(join(fixture, 'infra/governance/runtime')), false)
  console.log('✓ canonical Git telemetry is read without provider or workspace authority')

  writeFileSync(baselineFile, '{"trigger":"bad","topic":3}\n')
  const malformed = run()
  assert.equal(malformed.status, 2)
  assert.match(malformed.stderr, /invalid baseline sample/)
  console.log('✓ malformed baseline data fails closed')

  rmSync(stateRoot, { recursive: true, force: true })
  symlinkSync(outside, stateRoot)
  const redirected = run()
  assert.equal(redirected.status, 2)
  assert.match(redirected.stderr, /symbolic link/)
  console.log('✓ symlink-redirected telemetry state fails closed')

  rmSync(stateRoot, { force: true })
  mkdirSync(stateRoot, { recursive: true })
  const outsideFile = join(outside, 'outside.jsonl')
  writeFileSync(outsideFile, '{"trigger":1,"topic":1}\n')
  linkSync(outsideFile, baselineFile)
  const hardlinked = run()
  assert.equal(hardlinked.status, 2)
  assert.match(hardlinked.stderr, /hard-link alias/)
  console.log('✓ hard-linked telemetry file fails closed')

  const escaped = run({ GOVERNANCE_STATE_DIR: outside })
  assert.equal(escaped.status, 2)
  assert.match(escaped.stderr, /escapes/)
  console.log('✓ telemetry state escape fails closed')

  rmSync(runtimeRoot, { recursive: true, force: true })
  symlinkSync(outside, runtimeRoot)
  const redirectedRuntime = run()
  assert.equal(redirectedRuntime.status, 2)
  assert.match(redirectedRuntime.stderr, /symbolic link/)
  console.log('✓ symlink-redirected Git runtime root fails closed')
} finally {
  rmSync(fixture, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
}

console.log('✅ self-audit baseline neutral telemetry test PASS')

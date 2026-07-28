#!/usr/bin/env node
// Provider-neutral meta-test for audit-preflight. The fixture deliberately poisons `.claude` and
// proves both canonical reads and current-run check output are independent of provider-local state.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'audit-preflight.mjs')
const fixture = mkdtempSync(join(tmpdir(), 'audit-preflight-neutral-'))
execFileSync('git', ['init', '-q', fixture])
const evidenceRoot = join(realpathSync(join(fixture, '.git')), 'governance-runtime/evidence')

function write(path, value) {
  const absolute = join(fixture, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, value)
}

function run(...args) {
  return spawnSync(process.execPath, ['--', SCRIPT, ...args], { cwd: fixture, encoding: 'utf8' })
}

try {
  write('packages/design-system/ds-canonical/rules/meta-patterns.md', '| **M1** | canonical fixture | evidence |\n')
  write('packages/design-system/ds-canonical/rules/self-verify.md', '# fixture\n')
  write('packages/design-system/ds-canonical/hooks/check_fixture.sh', '#!/bin/bash\n')
  write('packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md', '| 1 | **Fixture dimension** | deterministic |\n')
  const mapPath = 'packages/design-system/ds-canonical/references/principle-dim-map.json'
  const validMap = {
    mRules: { M1: { dims: [1] } },
    traits: {},
    hooks: { fixture: { dims: [1] } },
  }
  write(mapPath, `${JSON.stringify(validMap, null, 2)}\n`)
  write('packages/design-system/src/components/Fixture/fixture.tsx', 'export const Fixture = 1\n')

  // Provider-local poison must never add a principle or supply a stale machine report.
  write('.claude/rules/meta-patterns.md', '| **M999** | poison | poison |\n')
  write('.claude/references/principle-dim-map.json', '{"mRules":{}}\n')
  write('.claude/logs/audit-preflight-2099-01-01.json', '{"coverageGaps":999,"gaps":["poison"]}\n')
  write('infra/governance/runtime/audit/preflight/audit-preflight-2099-01-01.json', '{"coverageGaps":999,"gaps":["workspace-poison"]}\n')

  const baseline = run('--check', '--json')
  assert.equal(baseline.status, 0, baseline.stderr)
  const baselineReport = JSON.parse(baseline.stdout)
  assert.equal(baselineReport.coverageGaps, 0)
  assert.equal(baselineReport.principles.mRules, 1)
  assert.equal(existsSync(evidenceRoot), false)
  console.log('✓ --check --json is read-only and ignores poisoned provider/workspace report data')

  const invalidMap = structuredClone(validMap)
  delete invalidMap.mRules.M1
  write(mapPath, `${JSON.stringify(invalidMap, null, 2)}\n`)
  const injected = run('--check', '--json')
  assert.equal(injected.status, 1, injected.stderr)
  const injectedReport = JSON.parse(injected.stdout)
  assert.equal(injectedReport.coverageGaps, 1)
  assert.match(injectedReport.gaps[0], /meta-pattern:M1/)
  assert.equal(existsSync(evidenceRoot), false)
  console.log('✓ current-run JSON exposes the injected canonical gap without a stale report read')

  write(mapPath, `${JSON.stringify(validMap, null, 2)}\n`)
  rmSync(join(fixture, 'infra/governance/runtime'), { recursive: true, force: true })
  rmSync(join(fixture, '.claude'), { recursive: true, force: true })
  const restored = run('--check', '--json')
  assert.equal(restored.status, 0, restored.stderr)
  assert.equal(JSON.parse(restored.stdout).coverageGaps, 0)
  console.log('✓ deleting .claude does not change canonical coverage results')

  const persisted = run('--json')
  assert.equal(persisted.status, 0, persisted.stderr)
  const reportDirectory = join(evidenceRoot, 'audit/preflight')
  assert(existsSync(reportDirectory))
  const reports = readdirSync(reportDirectory).filter((name) => name.endsWith('.json'))
  assert.equal(reports.length, 1)
  const report = JSON.parse(readFileSync(join(reportDirectory, reports[0]), 'utf8'))
  assert.equal(report.evidenceKind, 'audit-preflight')
  assert(!existsSync(join(fixture, '.claude')))
  assert(!existsSync(join(fixture, 'infra/governance/runtime')))
  console.log('✓ writable mode persists only Git-owned provider-neutral evidence')
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

console.log('✅ audit-preflight neutral evidence meta-test PASS')

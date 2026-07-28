#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WRITERS = [
  'scripts/composition-fidelity-visual-diff.mjs',
  'scripts/field-size-regression-diff.mjs',
  'scripts/audit-a11y.mjs',
  'scripts/peoplepicker-baseline.mjs',
  'scripts/add-story-baseline.mjs',
  'scripts/audit-hook-quality.mjs',
  'scripts/audit-story-quality.mjs',
  'scripts/check-three-layer-stories.mjs',
  'scripts/consolidate-audit-material.mjs',
  'scripts/dispatch-audit-dims.mjs',
  'scripts/visual-audit.mjs',
]

const RETIRED_MODEL_ENTRYPOINTS = [
  'scripts/run-codex-judgment-dims.mjs',
  'scripts/run-codex-phaseB.mjs',
]

const COMPATIBILITY_ENTRYPOINTS = new Map([
  ['scripts/run-deterministic-dims.sh', 'local'],
  ['scripts/run-heavy-deterministic-dims.sh', 'build'],
])

const FILE_WRITERS = new Set([
  'scripts/composition-fidelity-visual-diff.mjs',
  'scripts/field-size-regression-diff.mjs',
  'scripts/audit-a11y.mjs',
  'scripts/peoplepicker-baseline.mjs',
  'scripts/add-story-baseline.mjs',
  'scripts/audit-hook-quality.mjs',
  'scripts/audit-story-quality.mjs',
  'scripts/check-three-layer-stories.mjs',
  'scripts/consolidate-audit-material.mjs',
  'scripts/dispatch-audit-dims.mjs',
  'scripts/visual-audit.mjs',
])

for (const writer of WRITERS) {
  const source = readFileSync(join(ROOT, writer), 'utf8')
  assert.doesNotMatch(source, /\.claude\/(?:logs|snapshots|snapshots-baseline|baselines)(?:\/|\b)/, `${writer} retains a provider-owned evidence path`)
  if (/\.(?:mjs|js)$/.test(writer)) {
    assert.match(source, /governance-(?:runtime-evidence|visual-baselines)/, `${writer} bypasses the neutral evidence/baseline contract`)
    if (FILE_WRITERS.has(writer)) {
      assert.match(source, /prepare(?:RuntimeEvidence|VisualBaseline)File/, `${writer} writes files without validating the exact destination`)
    }
  } else {
    assert.match(source, /governance-runtime-evidence\.mjs/, `${writer} bypasses the neutral runtime resolver CLI`)
  }
}

for (const entrypoint of RETIRED_MODEL_ENTRYPOINTS) {
  const source = readFileSync(join(ROOT, entrypoint), 'utf8')
  assert.match(source, /runRetiredModelEntrypoint/, `${entrypoint} does not use the provider-neutral retirement gate`)
  assert.doesNotMatch(source, /governance-(?:runtime-evidence|visual-baselines)|prepare(?:RuntimeEvidence|VisualBaseline)File|node:child_process|\bspawnSync\b|\bexecSync\b/, `${entrypoint} retains an independent evidence writer/executor`)
}

for (const [entrypoint, profile] of COMPATIBILITY_ENTRYPOINTS) {
  const source = readFileSync(join(ROOT, entrypoint), 'utf8')
  const executableLines = source.split('\n').filter((line) => line.trim() && !line.startsWith('#'))
  assert.match(
    source,
    new RegExp(`exec node scripts/run-deterministic-deep-audit\\.mjs --profile=${profile} "\\$@"`),
    `${entrypoint} must delegate all policy, evidence, and authorization decisions to the neutral runner`,
  )
  assert.deepEqual(
    executableLines,
    [
      'set -euo pipefail',
      'cd "$(dirname "$0")/.."',
      `exec node scripts/run-deterministic-deep-audit.mjs --profile=${profile} "$@"`,
    ],
    `${entrypoint} contains a second execution or evidence-writing path`,
  )
}

function install(root, relativePath) {
  const destination = join(root, relativePath)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(join(ROOT, relativePath), destination)
}

const fixture = mkdtempSync(join(tmpdir(), 'neutral-audit-evidence-'))
const outside = mkdtempSync(join(tmpdir(), 'neutral-audit-evidence-outside-'))
try {
  for (const file of [
    'scripts/lib/governance-runtime-evidence.mjs',
    'scripts/add-story-baseline.mjs',
    'scripts/audit-hook-quality.mjs',
    'scripts/audit-story-quality.mjs',
    'scripts/check-three-layer-stories.mjs',
    'scripts/consolidate-audit-material.mjs',
    'scripts/dispatch-audit-dims.mjs',
  ]) install(fixture, file)
  copyFileSync(
    join(ROOT, 'packages/governance/src/closed-tool-execution.mjs'),
    join(fixture, 'scripts/lib/closed-tool-execution.mjs'),
  )
  mkdirSync(join(fixture, 'packages/design-system/ds-canonical/references'), { recursive: true })
  writeFileSync(join(fixture, 'packages/design-system/ds-canonical/references/story-baseline-registry.json'), '{"components":{}}\n')
  mkdirSync(join(fixture, 'packages/design-system/ds-canonical/skills/design-system-audit'), { recursive: true })
  copyFileSync(
    join(ROOT, 'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md'),
    join(fixture, 'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md'),
  )
  mkdirSync(join(fixture, 'packages/design-system/ds-canonical/hooks'), { recursive: true })
  writeFileSync(join(fixture, 'packages/design-system/ds-canonical/hooks/example.sh'), '#!/bin/sh\n')
  mkdirSync(join(fixture, 'packages/design-system/src/components/Fixture'), { recursive: true })
  for (const name of ['fixture.stories.tsx', 'fixture.anatomy.stories.tsx', 'fixture.principles.stories.tsx']) {
    writeFileSync(join(fixture, 'packages/design-system/src/components/Fixture', name), '')
  }

  execFileSync('git', ['init', '-q', fixture])
  const gitDirectory = execFileSync('git', ['-C', fixture, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()
  const state = join(gitDirectory, 'governance-runtime')
  const evidenceRoot = join(state, 'evidence')
  mkdirSync(state, { recursive: true })
  writeFileSync(join(state, 'hook-fires-per-hook.jsonl'), '{"hook":"example.sh","ts":"2026-07-21T00:00:00.000Z"}\n')
  const environment = { ...process.env, GOVERNANCE_RUNTIME_ROOT: state, GOVERNANCE_STATE_DIR: state }
  delete environment.GOVERNANCE_READ_ONLY

  const run = (script, args = []) => {
    if (script === 'scripts/add-story-baseline.mjs') return spawnSync(process.execPath, ['--', 'scripts/add-story-baseline.mjs', ...args], { cwd: fixture, env: environment, encoding: 'utf8' })
    if (script === 'scripts/audit-hook-quality.mjs') return spawnSync(process.execPath, ['--', 'scripts/audit-hook-quality.mjs', ...args], { cwd: fixture, env: environment, encoding: 'utf8' })
    if (script === 'scripts/audit-story-quality.mjs') return spawnSync(process.execPath, ['--', 'scripts/audit-story-quality.mjs', ...args], { cwd: fixture, env: environment, encoding: 'utf8' })
    if (script === 'scripts/check-three-layer-stories.mjs') return spawnSync(process.execPath, ['--', 'scripts/check-three-layer-stories.mjs', ...args], { cwd: fixture, env: environment, encoding: 'utf8' })
    if (script === 'scripts/consolidate-audit-material.mjs') return spawnSync(process.execPath, ['--', 'scripts/consolidate-audit-material.mjs', ...args], { cwd: fixture, env: environment, encoding: 'utf8' })
    if (script === 'scripts/dispatch-audit-dims.mjs') return spawnSync(process.execPath, ['--', 'scripts/dispatch-audit-dims.mjs', ...args], { cwd: fixture, env: environment, encoding: 'utf8' })
    throw new Error(`unsupported neutral audit fixture script:${script}`)
  }
  for (const [script, args] of [
    ['scripts/add-story-baseline.mjs', []],
    ['scripts/audit-hook-quality.mjs', []],
    ['scripts/audit-story-quality.mjs', []],
    ['scripts/check-three-layer-stories.mjs', []],
    ['scripts/consolidate-audit-material.mjs', []],
    ['scripts/dispatch-audit-dims.mjs', []],
    ['scripts/dispatch-audit-dims.mjs', ['--check']],
  ]) {
    const result = run(script, args)
    assert.equal(result.status, 0, `${script} failed without .claude:\n${result.stderr || result.stdout}`)
  }
  for (const evidence of [
    'audit/story-baseline-batch.json',
    'audit/hook-quality-report.json',
    'audit/story-quality-audit.json',
    'audit/three-layer-stories.json',
    'deep-audit/master-material.json',
    'deep-audit/dispatch.json',
  ]) assert.equal(existsSync(join(evidenceRoot, evidence)), true, `missing neutral evidence:${evidence}`)
  assert.equal(existsSync(join(fixture, '.claude')), false, 'a writer recreated provider-owned .claude state')
  assert.equal(existsSync(join(fixture, 'infra/governance/runtime')), false, 'a writer recreated workspace-owned mutable runtime state')

  rmSync(join(evidenceRoot, 'audit'), { recursive: true })
  symlinkSync(outside, join(evidenceRoot, 'audit'))
  const poisoned = run('scripts/add-story-baseline.mjs')
  assert.notEqual(poisoned.status, 0, 'poisoned runtime evidence path was accepted')
  assert.equal(existsSync(join(outside, 'story-baseline-batch.json')), false, 'poisoned writer escaped the runtime authority')
} finally {
  rmSync(fixture, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
}

// The composition producer owns nested baseline/consumer/diff directories. A
// poisoned child must be rejected before Playwright starts or any byte escapes.
const visualConsumer = mkdtempSync(join(tmpdir(), 'neutral-visual-consumer-'))
const visualOutside = mkdtempSync(join(tmpdir(), 'neutral-visual-outside-'))
const visualCase = `visual/test-composition-poison-${process.pid}-${Date.now()}`
let visualOutput
try {
  visualOutput = execFileSync(process.execPath, [
    '--',
    join(ROOT, 'scripts/lib/governance-runtime-evidence.mjs'),
    '--repo-root', ROOT,
    '--path', visualCase,
    '--ensure-directory',
  ], { encoding: 'utf8' }).trim()
  symlinkSync(visualOutside, join(visualOutput, 'baseline'))
  const poisonedVisual = spawnSync(process.execPath, [
    '--',
    join(ROOT, 'scripts/composition-fidelity-visual-diff.mjs'),
    `--consumer-root=${visualConsumer}`,
    `--out=${visualOutput}`,
  ], { cwd: ROOT, encoding: 'utf8' })
  assert.notEqual(poisonedVisual.status, 0, 'composition writer accepted a poisoned nested evidence directory')
  assert.deepEqual(readdirSync(visualOutside), [], 'composition writer escaped through a poisoned nested directory')
} finally {
  if (visualOutput) rmSync(visualOutput, { recursive: true, force: true })
  rmSync(visualConsumer, { recursive: true, force: true })
  rmSync(visualOutside, { recursive: true, force: true })
}

console.log('✓ audit/visual writers use neutral runtime evidence, survive delete-.claude, and reject poison')

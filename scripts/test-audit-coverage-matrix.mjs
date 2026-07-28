#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { validateAuditCoverageEntry } from './lib/audit-coverage-classification.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const CHECKER = resolve(import.meta.dirname, 'audit-coverage-matrix.mjs')
const CANONICAL_ARTIFACT = join(ROOT, 'generated/governance/audit-coverage-matrix.json')
const CANONICAL_PLAN = join(ROOT, 'scripts/deep-audit-deterministic-plan.json')
const CANONICAL_REGISTRATIONS = join(ROOT, 'packages/design-system/ds-canonical/hooks/registrations.json')
const CANONICAL_HOOKS = join(ROOT, 'packages/design-system/ds-canonical/hooks')
const fixture = mkdtempSync(join(tmpdir(), 'audit-coverage-matrix-meta-'))

assert.equal(validateAuditCoverageEntry({ tier: 'CI-ENFORCED', mechanism: 'fixture external readback' }, { dim: 1 }), true)
assert.throws(() => validateAuditCoverageEntry({ tier: 'TYPO', mechanism: 'looks classified' }, { dim: 1 }), /unsupported tier/)
assert.throws(() => validateAuditCoverageEntry({ tier: 'DETERMINISTIC', mechanism: '   ' }, { dim: 1 }), /empty mechanism/)
assert.throws(() => validateAuditCoverageEntry({ tier: 'DETERMINISTIC', mechanism: 'fixture', unreviewed: true }, { dim: 1 }), /keys must be exactly/)

function run(...args) {
  return spawnSync(process.execPath, ['--', CHECKER, ...args], {
    cwd: fixture,
    encoding: 'utf8',
  })
}

function write(path, content = '') {
  const target = join(fixture, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
  return target
}

try {
  const canonical = JSON.parse(readFileSync(CANONICAL_ARTIFACT, 'utf8'))
  const deterministicPlan = JSON.parse(readFileSync(CANONICAL_PLAN, 'utf8'))
  const registrations = JSON.parse(readFileSync(CANONICAL_REGISTRATIONS, 'utf8'))
  assert.equal(canonical.expected_dims, 91, 'fixture must exercise the complete canonical dimension map')
  const canonicalSkillPath = write(
    'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md',
    `${Array.from({ length: canonical.expected_dims }, (_, index) => `| ${index + 1} | **Fixture dimension** |`).join('\n')}\n`,
  )
  const canonicalSkill = readFileSync(canonicalSkillPath, 'utf8')

  const packageScripts = {}
  write('scripts/fixture-command.mjs', 'process.exit(0)\n')
  for (const command of deterministicPlan.commands) {
    if (command.argv[0] === 'node') write(command.argv[1], 'process.exit(0)\n')
    if (command.argv[0] === 'npm') packageScripts[command.argv[3]] = 'node scripts/fixture-command.mjs'
  }
  write('package.json', `${JSON.stringify({ private: true, scripts: packageScripts }, null, 2)}\n`)
  const planPath = write('scripts/deep-audit-deterministic-plan.json', `${JSON.stringify(deterministicPlan, null, 2)}\n`)
  const registrationsPath = write(
    'packages/design-system/ds-canonical/hooks/registrations.json',
    `${JSON.stringify(registrations, null, 2)}\n`,
  )

  for (const entry of Object.values(canonical.coverage_by_dim)) {
    for (const match of entry.mechanism.matchAll(/scripts\/([\w-]+\.mjs)/g)) {
      write(`scripts/${match[1]}`, '// isolated existence fixture\n')
    }
    if (entry.tier !== 'HOOK-ENFORCED') continue
    for (const match of entry.mechanism.matchAll(/\b([A-Za-z0-9_][A-Za-z0-9_-]*\.sh)\b/g)) {
      const prefix = entry.mechanism.slice(Math.max(0, match.index - 12), match.index)
      if (/(?:原(?:寫|從|名)?|retired)\s*$/i.test(prefix)) continue
      const pathPrefix = entry.mechanism.slice(Math.max(0, match.index - 5), match.index)
      const relative = match[1].startsWith('_') || /lib\/$/.test(pathPrefix) ? `lib/${match[1]}` : match[1]
      const source = join(CANONICAL_HOOKS, relative)
      write(`packages/design-system/ds-canonical/hooks/${relative}`, readFileSync(source))
    }
  }

  const generated = run()
  assert.equal(generated.status, 0, `fixture artifact generation must pass:\n${generated.stderr}`)
  const baseline = run('--check')
  assert.equal(baseline.status, 0, `fixture baseline must pass:\n${baseline.stderr}`)

  const citedHook = 'packages/design-system/ds-canonical/hooks/check_opacity_token_usage.sh'
  const citedHookPath = join(fixture, citedHook)
  const original = readFileSync(citedHookPath)
  try {
    rmSync(citedHookPath)
    write('packages/design-system/ds-canonical/hooks/unrelated.sh', '# check_opacity_token_usage provenance comment only\n')
    const mutated = run('--check')
    assert.equal(mutated.status, 1, 'a comment mentioning a removed active hook must not satisfy the coverage gate')
    assert.match(mutated.stderr, /check_opacity_token_usage\.sh/)
    assert.match(mutated.stderr, /VAPORWARE/)
  } finally {
    writeFileSync(citedHookPath, original)
  }

  const restored = run('--check')
  assert.equal(restored.status, 0, `restored fixture must pass:\n${restored.stderr}`)

  try {
    const unregistered = structuredClone(registrations)
    for (const groups of Object.values(unregistered.hooks)) {
      for (const group of groups) group.hooks = group.hooks.filter(descriptor => descriptor.hook !== 'check_opacity_token_usage.sh')
    }
    writeFileSync(registrationsPath, `${JSON.stringify(unregistered, null, 2)}\n`)
    const strayOwner = run('--check')
    assert.equal(strayOwner.status, 1, 'an on-disk but unregistered hook must not satisfy active ownership')
    assert.match(strayOwner.stderr, /not a registered single-link canonical owner/)
  } finally {
    writeFileSync(registrationsPath, `${JSON.stringify(registrations, null, 2)}\n`)
  }

  const dispatcherPath = join(fixture, 'packages/design-system/ds-canonical/hooks/post_edit_dispatcher.sh')
  const dispatcherSource = readFileSync(dispatcherPath, 'utf8')
  try {
    const unsourced = dispatcherSource.replace(/^.*\/_token_hygiene\.sh.*\n/m, '')
    assert.notEqual(unsourced, dispatcherSource)
    writeFileSync(dispatcherPath, unsourced)
    const unsourcedHelper = run('--check')
    assert.equal(unsourcedHelper.status, 1, 'an unsourced lib helper must not satisfy a dispatcher enforcement claim')
    assert.match(unsourcedHelper.stderr, /not sourced\/executed by a cited registered dispatcher/)
  } finally {
    writeFileSync(dispatcherPath, dispatcherSource)
  }

  try {
    rmSync(planPath)
    const missingPlan = run('--check')
    assert.equal(missingPlan.status, 1, 'a missing deterministic plan must fail closed')
    assert.match(missingPlan.stderr, /deterministic audit plan invalid/)

    const corruptPlan = structuredClone(deterministicPlan)
    corruptPlan.dimensions.pop()
    writeFileSync(planPath, `${JSON.stringify(corruptPlan, null, 2)}\n`)
    const incompletePlan = run('--check')
    assert.equal(incompletePlan.status, 1, 'an incomplete deterministic plan must fail closed')
    assert.match(incompletePlan.stderr, /plan must enumerate exactly 24 deterministic dimensions|matrix\/plan dimensions differ|unreferenced commands/)
  } finally {
    writeFileSync(planPath, `${JSON.stringify(deterministicPlan, null, 2)}\n`)
  }

  try {
    const missingInterior = canonicalSkill.replace(/^\| 45 \|.*\n/m, '')
    assert.notEqual(missingInterior, canonicalSkill)
    writeFileSync(canonicalSkillPath, missingInterior)
    const missingDimension = run('--check')
    assert.equal(missingDimension.status, 1, 'a missing interior canonical dimension must fail closed')
    assert.match(missingDimension.stderr, /canonical dimension IDs must be exactly/)

    const duplicateInterior = canonicalSkill.replace(/^\| 45 \|/m, '| 44 |')
    assert.notEqual(duplicateInterior, canonicalSkill)
    writeFileSync(canonicalSkillPath, duplicateInterior)
    const duplicateDimension = run('--check')
    assert.equal(duplicateDimension.status, 1, 'a duplicate canonical dimension must fail closed')
    assert.match(duplicateDimension.stderr, /canonical dimension IDs must be exactly/)
  } finally {
    writeFileSync(canonicalSkillPath, canonicalSkill)
  }
  assert.equal(run('--check').status, 0, 'restoring the exact canonical dimension sequence must restore PASS')

  const forbiddenFixtureFlag = run('--root', fixture)
  assert.equal(forbiddenFixtureFlag.status, 2, 'production CLI must not expose a fixture-root bypass')
  assert.match(forbiddenFixtureFlag.stderr, /用法/)
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

console.log('✅ audit-coverage paired mutation: registered hook edges + deterministic plan + exact 1..N fail closed')

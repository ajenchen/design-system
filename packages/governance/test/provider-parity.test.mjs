import assert from 'node:assert/strict'
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { inspectContract, inspectSkillParity } from '../src/contract.mjs'
import { evaluateHook, nativeHookStreams } from '../src/hook-api.mjs'
import { cleanup, json, makeRepository, write } from './helpers.mjs'
import {
  materializeProviderInstruction,
  PROVIDER_REGISTRY,
} from '../../../scripts/gen-codex-adapter.mjs'
import { buildProviderHookGroupLaunchArgv } from '../../../scripts/lib/provider-hook-output-transport.mjs'

const fixture = (provider) => resolve(import.meta.dirname, 'fixtures/hooks', `${provider}-generated-write.json`)

async function canonicalSkillNames(repoRoot) {
  const entries = await readdir(
    resolve(repoRoot, 'packages/design-system/ds-canonical/skills'),
    { withFileTypes: true },
  )
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

test('provider-bound skill semantic SSOT validates against its committed schema', async () => {
  const repoRoot = resolve(import.meta.dirname, '../../..')
  const semantics = JSON.parse(await readFile(resolve(repoRoot, 'scripts/provider-skill-semantics.json'), 'utf8'))
  const schema = JSON.parse(await readFile(resolve(repoRoot, 'scripts/schemas/provider-skill-semantics.schema.json'), 'utf8'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  assert.equal(validate(semantics), true, JSON.stringify(validate.errors))
})

test('rule match clauses are schema-closed against undeclared policy fields', async () => {
  const repoRoot = resolve(import.meta.dirname, '../../..')
  const rules = JSON.parse(await readFile(resolve(repoRoot, 'packages/governance/canonical/rules.json'), 'utf8'))
  const schema = JSON.parse(await readFile(resolve(repoRoot, 'packages/governance/canonical/schemas/rules.schema.json'), 'utf8'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  assert.equal(validate(rules), true, JSON.stringify(validate.errors))
  const poisoned = structuredClone(rules)
  poisoned.rules[0].match.unreviewed = 'poison'
  assert.equal(validate(poisoned), false, 'rule match clauses must reject undeclared semantics')
})

test('Claude, Codex, and generic hook payloads block with the same canonical evidence', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  await write(repoRoot, 'governance/generated/control-plane.json', '{"old":true}\n')
  const outcomes = []
  for (const provider of ['claude', 'codex', 'generic']) {
    const evaluated = await evaluateHook({ provider, repoRoot, input: await json(fixture(provider)) })
    assert.equal(evaluated.exitCode, 2)
    assert.equal(evaluated.normalized.operation, 'write')
    outcomes.push({
      outcome: evaluated.result.outcome,
      ruleId: evaluated.result.diagnostics.at(-1).ruleId,
      kind: evaluated.result.diagnostics.at(-1).evidence.kind,
      path: evaluated.result.diagnostics.at(-1).evidence.path,
    })
  }
  assert.deepEqual(outcomes, Array(3).fill({
    outcome: 'FAIL',
    ruleId: 'GOV-GENERATED-001',
    kind: 'generated-artifact-write',
    path: 'governance/generated/control-plane.json',
  }))
})

test('native PreToolUse output is silent on pass and uses stderr with exit-code blocking feedback', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const blocked = await evaluateHook({ provider: 'claude', repoRoot, input: await json(fixture('claude')) })
  assert.equal(blocked.exitCode, 2)
  assert.equal(nativeHookStreams(blocked).stdout, '')
  assert.match(nativeHookStreams(blocked).stderr, /Direct writes to generated governance artifacts are blocked/)

  const allowed = await evaluateHook({
    provider: 'claude',
    repoRoot,
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'src/allowed.ts', content: 'export const allowed = true\n' },
    },
  })
  assert.equal(allowed.exitCode, 0)
  assert.deepEqual(nativeHookStreams(allowed), { stdout: '', stderr: '' })
})

test('skill parity derives the full set recursively without hard-coded counts', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const { contract, diagnostics } = await inspectContract({ repoRoot })
  assert.deepEqual(diagnostics, [])
  let parity = await inspectSkillParity(contract)
  assert.deepEqual(parity.diagnostics, [])
  assert.deepEqual(parity.records[0].sourceSkills, await canonicalSkillNames(repoRoot))

  const source = '---\nname: new-shared\n---\n\n# New shared\n'
  const target = (provider) => `---\nname: new-shared\n---\n\n<!-- _generated: scripts/gen-codex-adapter.mjs; source: packages/design-system/ds-canonical/skills/new-shared/SKILL.md; provider: ${provider}; do not edit this adapter view. -->\n\n# New shared\n`
  await write(repoRoot, 'packages/design-system/ds-canonical/skills/new-shared/SKILL.md', source)
  await write(repoRoot, '.claude/skills/new-shared/SKILL.md', target('claude'))
  await write(repoRoot, '.agents/skills/new-shared/SKILL.md', target('codex'))
  parity = await inspectSkillParity(contract)
  assert.deepEqual(parity.diagnostics, [])
  assert.equal(parity.records[0].sourceSkills.includes('new-shared'), true)
})

test('a newly registered provider is automatically included in roles, rules, and materializer-aware skill parity', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const canonical = resolve(repoRoot, 'canonical')
  await cp(resolve(import.meta.dirname, '../canonical'), canonical, { recursive: true })
  const providersPath = resolve(canonical, 'providers.json')
  const registry = JSON.parse(await readFile(providersPath, 'utf8'))
  const future = structuredClone(registry.providers.find((provider) => provider.id === 'codex'))
  future.id = 'future-runtime'
  future.displayName = 'Future runtime fixture'
  future.instructionEntry = 'FUTURE.md'
  future.skillDirectory = '.future/workflows'
  future.hookConfig = '.future/events.json'
  future.adapter.repositoryInstructionSource = null
  future.adapter.instructionView = { materializerId: 'markdown-relative-at-import-v1' }
  future.adapter.skillView = { directory: future.skillDirectory, materializerId: 'markdown-workflows-directory-v1' }
  future.adapter.hookView.output = future.hookConfig
  future.adapter.hookView.materializerId = 'portable-event-list-json-v1'
  future.adapter.discovery = {
    providerRootNames: ['.future'], instructionNames: ['FUTURE.md'], instructionOverrideNames: [], configPaths: [future.hookConfig], pluginRootNames: [],
  }
  future.runtime.cli.executable = 'future-runtime'
  future.runtime.cli.localExecutable = 'node_modules/.bin/future-runtime'
  future.runtime.cli.replyArtifactPrefix = 'future-runtime-reply'
  future.runtime.branchNamespace = 'future-runtime/'
  for (const binding of Object.values(future.adapter.skillBindings)) {
    binding.self = future.id
  }
  registry.providers.push(future)
  await writeFile(providersPath, `${JSON.stringify(registry, null, 2)}\n`)
  const instruction = materializeProviderInstruction({ provider: future, registry, sourceRoot: repoRoot })
  await write(repoRoot, 'FUTURE.md', instruction.content)
  await write(repoRoot, future.hookConfig, `${JSON.stringify({
    description: 'fixture structured hook transport',
    events: [{
      event: 'PreToolUse',
      groups: [{
        handlers: [{
          argv: buildProviderHookGroupLaunchArgv({
            provider: future,
            event: 'PreToolUse',
            groupIndex: 0,
          }),
        }],
      }],
    }],
  })}\n`)
  for (const name of await canonicalSkillNames(repoRoot)) {
    const sourceDirectory = resolve(
      repoRoot,
      'packages/design-system/ds-canonical/skills',
      name,
    )
    const targetDirectory = resolve(repoRoot, future.skillDirectory, name)
    await cp(sourceDirectory, targetDirectory, {
      recursive: true,
      preserveTimestamps: false,
    })
    const sourcePath = `packages/design-system/ds-canonical/skills/${name}/SKILL.md`
    const source = await readFile(resolve(repoRoot, sourcePath), 'utf8')
    const marker = `<!-- _generated: scripts/gen-codex-adapter.mjs; source: ${sourcePath}; provider: ${future.id}; do not edit this adapter view. -->\n`
    const frontmatter = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
    const projected = frontmatter ? `${frontmatter[0]}\n${marker}${source.slice(frontmatter[0].length)}` : `${marker}${source}`
    await write(repoRoot, `${future.skillDirectory}/${name}/WORKFLOW.md`, projected)
    await rm(resolve(targetDirectory, 'SKILL.md'))
  }
  const inspected = await inspectContract({ repoRoot, manifestPath: resolve(canonical, 'manifest.json') })
  assert.deepEqual(inspected.diagnostics, [])
  assert.equal(inspected.contract.role.requiredProviders.includes(future.id), true)
  assert.equal(inspected.contract.rules.every((rule) => Object.hasOwn(rule.providerCoverage, future.id)), true)
  const target = inspected.contract.skillParityContracts[0].targets.find((item) => item.provider === future.id)
  assert.equal(target.entryFile, 'WORKFLOW.md')
  const tamperedEventList = JSON.parse(await readFile(resolve(repoRoot, future.hookConfig), 'utf8'))
  const futureArgv = tamperedEventList.events[0].groups[0].handlers[0].argv
  futureArgv[futureArgv.indexOf('--provider') + 1] = `${future.id}-spoof`
  await write(repoRoot, future.hookConfig, `${JSON.stringify(tamperedEventList)}\n`)
  const rejectedEventList = await inspectContract({ repoRoot, manifestPath: resolve(canonical, 'manifest.json') })
  assert.equal(
    rejectedEventList.diagnostics.some((item) => item.evidence.kind === 'provider-hook-entrypoint-missing'),
    true,
    'the contract must validate the actual structured argv transport declared by an event-list materializer',
  )
  const parity = await inspectSkillParity(inspected.contract)
  assert.deepEqual(parity.diagnostics, [])
  assert.equal(parity.records.some((record) => record.targetProvider === future.id && record.targetEntryFile === 'WORKFLOW.md'), true)
})

test('skill parity reports missing and recursively tampered provider files', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const { contract } = await inspectContract({ repoRoot })
  await rm(resolve(repoRoot, '.agents/skills/shared-tool'), { recursive: true })
  let parity = await inspectSkillParity(contract)
  assert.equal(parity.diagnostics.some((item) => item.evidence.kind === 'skill-missing'), true)

  await write(repoRoot, '.agents/skills/shared-tool/SKILL.md', '---\nname: shared-tool\n---\n\n<!-- _generated: scripts/gen-codex-adapter.mjs; source: packages/design-system/ds-canonical/skills/shared-tool/SKILL.md; provider: codex; do not edit this adapter view. -->\n\n# Shared tool\n')
  await write(repoRoot, '.agents/skills/shared-tool/scripts/run.mjs', '#!/usr/bin/env node\n', 0o755)
  await writeFile(resolve(repoRoot, '.agents/skills/design-system-audit/references/audit-prompts.md'), 'tampered\n')
  parity = await inspectSkillParity(contract)
  assert.equal(parity.diagnostics.some((item) => item.evidence.kind === 'content-hash-mismatch'), true)
})

test('runtime rejects registry fields that violate the committed JSON Schema', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const canonical = resolve(repoRoot, 'canonical')
  await cp(resolve(import.meta.dirname, '../canonical'), canonical, { recursive: true })
  const rolesPath = resolve(canonical, 'roles.json')
  const roles = JSON.parse(await readFile(rolesPath, 'utf8'))
  roles.roles[0].unreviewedField = true
  await writeFile(rolesPath, `${JSON.stringify(roles, null, 2)}\n`)
  const inspected = await inspectContract({ repoRoot, manifestPath: resolve(canonical, 'manifest.json') })
  assert.equal(inspected.diagnostics.some((item) => item.evidence.kind === 'schema-validation-failed'), true)
})

test('provider wiring rejects a drifted instruction projection and a bypassed Codex hook entrypoint', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))

  await write(repoRoot, 'CLAUDE.md', '# Detached provider instructions\n')
  let inspected = await inspectContract({ repoRoot })
  assert.equal(inspected.diagnostics.some((item) => item.evidence.kind === 'provider-instruction-projection-drift'), true)

  await write(repoRoot, 'CLAUDE.md', '@AGENTS.md\n\n# Claude adapter\n')
  await write(repoRoot, '.codex/hooks.json', '{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"true"}]}]}}\n')
  inspected = await inspectContract({ repoRoot })
  assert.equal(inspected.diagnostics.some((item) => item.evidence.kind === 'provider-hook-entrypoint-missing'), true)
})

test('provider hook wiring rejects duplicate handlers even when every argv is individually valid', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const hookConfigPath = resolve(repoRoot, '.codex/hooks.json')
  const config = JSON.parse(await readFile(hookConfigPath, 'utf8'))
  config.hooks.PreToolUse[0].hooks.push(structuredClone(config.hooks.PreToolUse[0].hooks[0]))
  await write(repoRoot, '.codex/hooks.json', `${JSON.stringify(config)}\n`)
  const inspected = await inspectContract({ repoRoot })
  const diagnostic = inspected.diagnostics.find((item) => item.evidence.kind === 'provider-hook-entrypoint-missing')
  assert.ok(diagnostic)
  assert.deepEqual(diagnostic.evidence.actual.malformed, ['PreToolUse:0:handler-count'])
})

test('provider hook wiring rejects substring, path-suffix, and provider-prefix command spoofs', async (t) => {
  const codex = PROVIDER_REGISTRY.providers.find((provider) => provider.id === 'codex')
  const valid = buildProviderHookGroupLaunchArgv({
    provider: codex,
    event: 'PreToolUse',
    groupIndex: 0,
  }).join(' ')
  const attacks = [
    `echo ${valid}`,
    valid.replace('scripts/run-provider-hook.mjs', 'scripts/run-provider-hook.mjs.backup'),
    valid.replace('--provider codex', '--provider codex-spoof'),
    `true && ${valid}`,
    valid.replace('--event PreToolUse', '--event PostToolUse'),
    valid.replace('--group 0', '--group 1'),
    `${valid} --extra injected`,
  ]

  for (const [index, command] of attacks.entries()) {
    await t.test(`spoof-${index + 1}`, async (subtest) => {
      const repoRoot = await makeRepository()
      subtest.after(() => cleanup(repoRoot))
      const config = { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command }] }] } }
      await write(repoRoot, '.codex/hooks.json', `${JSON.stringify(config)}\n`)
      const inspected = await inspectContract({ repoRoot })
      assert.equal(
        inspected.diagnostics.some((item) => item.evidence.kind === 'provider-hook-entrypoint-missing'),
        true,
      )
    })
  }
})

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, link, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

// These adversarial suites assert the fail-closed integrity lane. The production
// default is fail-open (hooks are accelerators, not the trust boundary); strict
// semantics are opted into exactly like a high-assurance deployment would.
Object.assign(process.env, { GOVERNANCE_HOOK_STRICT: '1' })
import Ajv2020 from 'ajv/dist/2020.js'
import { compareUtf8Bytes } from '../src/canonical-order.mjs'
import {
  PROVIDER_HOOK_COVERAGE_PATH,
  PROVIDER_REGISTRY,
  PROVIDER_SKILL_SEMANTICS,
  buildClaudePluginHookView,
  buildProviderAdapterTargets,
  buildProviderHookCoverage,
  buildProviderHookView,
  buildSharedSkillTargets,
  checkProviderAdapterTargets,
  materializeProductInstruction,
  materializeProviderHookConfig,
  materializeProviderInstruction,
  scanCanonicalSkillSemantics,
  validateProviderRegistry,
  validateProviderSkillSemantics,
  verifyEligibility,
  writeClaudePluginHookView,
  writeProviderAdapterTargets,
} from '../../../scripts/gen-codex-adapter.mjs'
import { assertNoSymlinkContractPath, validateHookRegistrations, validateProviderRegistryDocument } from '../../../scripts/lib/provider-contract-validation.mjs'
import {
  validateHookRegistrations as validateRuntimeHookRegistrations,
  validateProviderRegistryDocument as validateRuntimeProviderRegistry,
} from '../../../scripts/lib/provider-runtime-validation.mjs'
import { validateProviderRegistrySemantics } from '../../../scripts/lib/provider-runtime-contract.mjs'
import { checkProviderRuntimeValidator } from '../../../scripts/gen-provider-runtime-validator.mjs'
import { resolveProviderReviewBinding } from '../src/provider-review-binding.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')

function nativeHandlerCount(view) {
  return Object.values(view.config.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks)).length
}

test('hook base-template merge dispatch is contract-driven and provider-neutral', async (t) => {
  const sourceRoot = await mkdtemp(resolve(tmpdir(), 'hook-base-contract-'))
  t.after(() => rm(sourceRoot, { recursive: true, force: true }))
  await writeFile(resolve(sourceRoot, 'base.json'), '{"providerSetting":{"enabled":true}}\n')
  const registry = structuredClone(PROVIDER_REGISTRY)
  registry.canonical.materializers.hookViews = Object.fromEntries(Object.entries({
    ...registry.canonical.materializers.hookViews,
    'static-base-hook-map-v1': {
      engine: 'json-hook-map-v1',
      hooksField: 'automations',
      descriptionField: 'provenance',
      mergeStrategy: 'merge-hook-map-into-base-v1',
      baseTemplateContract: 'static-json-object-v1',
    },
  }).sort(([left], [right]) => compareUtf8Bytes(left, right)))
  const provider = structuredClone(registry.providers.find((item) => item.id === 'codex'))
  provider.id = 'static-base-fixture'
  provider.adapter.hookView.materializerId = 'static-base-hook-map-v1'
  provider.adapter.hookView.settingsTemplate = 'base.json'
  registry.providers.push(provider)
  const argv = ['node', 'scripts/run-provider-hook.mjs', '--provider', provider.id, '--hook', 'governance_control_plane.sh']
  const config = materializeProviderHookConfig({
    providerId: provider.id,
    registry,
    sourceRoot,
    description: 'fixture',
    hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: argv.join(' '), argv }] }] },
  })
  assert.deepEqual(config.providerSetting, { enabled: true })
  assert.equal(config.provenance, 'fixture')
  assert.equal(config.automations.PreToolUse[0].hooks[0].command, argv.join(' '))

  const unknownContract = structuredClone(registry)
  unknownContract.canonical.materializers.hookViews['static-base-hook-map-v1'].baseTemplateContract = 'unknown-template-contract-v1'
  assert.throws(
    () => materializeProviderHookConfig({ providerId: provider.id, registry: unknownContract, sourceRoot, description: 'fixture', hooks: {} }),
    /unregistered.*ADAPTER-BLOCKED/,
  )
})

test('instruction materializers own imports while shared views remain common-authority consumers', async (t) => {
  const sourceRoot = await mkdtemp(resolve(tmpdir(), 'instruction-materializer-'))
  t.after(() => rm(sourceRoot, { recursive: true, force: true }))
  await mkdir(resolve(sourceRoot, 'canonical'), { recursive: true })
  await writeFile(resolve(sourceRoot, 'canonical/supplement.md'), '# Provider supplement\n')
  await writeFile(resolve(sourceRoot, 'canonical/product-supplement.md'), '# Product consumer AI governance (provider-neutral)\n')
  const registry = structuredClone(PROVIDER_REGISTRY)
  const projected = structuredClone(registry.providers.find((item) => item.id === 'codex'))
  projected.id = 'instruction-fixture'
  projected.instructionEntry = 'nested/FUTURE.md'
  projected.adapter.instructionView = { materializerId: 'markdown-relative-at-import-v1' }
  projected.adapter.repositoryInstructionSource = 'canonical/supplement.md'
  projected.adapter.productInstructionSource = 'canonical/product-supplement.md'
  registry.providers.push(projected)
  const repositoryView = materializeProviderInstruction({ provider: projected, registry, sourceRoot })
  assert.equal(repositoryView.content.toString('utf8'), '@../AGENTS.md\n\n# Provider supplement\n')
  assert.equal(
    materializeProductInstruction({ provider: projected, registry, sourceRoot, sharedBody: '# Common\n' }).toString('utf8'),
    '@../AGENTS.md\n\n# Product consumer AI governance (provider-neutral)\n',
  )
  const direct = registry.providers.find((item) => item.id === 'codex')
  assert.equal(materializeProviderInstruction({ provider: direct, registry, sourceRoot }), null)
  assert.equal(materializeProductInstruction({ provider: direct, registry, sourceRoot, sharedBody: '# Common\n' }).toString('utf8'), '# Common\n')

  await writeFile(resolve(sourceRoot, 'canonical/supplement.md'), '@AGENTS.md\n\n# Smuggled authority\n')
  assert.throws(() => materializeProviderInstruction({ provider: projected, registry, sourceRoot }), /may not embed an import directive/)
})

test('Claude and Codex mechanically project the complete compatible hook corpus', () => {
  const claude = buildProviderHookView({ providerId: 'claude' })
  const codex = buildProviderHookView({ providerId: 'codex' })
  assert.equal(claude.excluded.length, 0)
  assert.equal(claude.projected.length, 61)
  assert.equal(codex.projected.length, 58)
  assert.equal(codex.projected.length + codex.excluded.length, 61)
  assert.equal(nativeHandlerCount(claude), 16)
  assert.equal(nativeHandlerCount(codex), 16)
  assert.equal(codex.excluded.every((item) => item.reasonCode === 'STABLE_TRANSCRIPT_CONTRACT_UNAVAILABLE'), true)
  assert.deepEqual(codex.excluded.map((item) => item.hook).sort(), [
    'check_propose_without_benchmark.sh',
    'check_solo_workflow.sh',
    'check_substantive_edit_approval_preflight.sh',
  ])
  for (const view of [claude, codex]) {
    const commands = Object.values(view.config.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks.map((hook) => hook.command)))
    assert.equal(commands.filter((command) => command.includes('run-provider-hook.mjs')).length, 16)
    assert.equal(commands.every((command) => command.includes(' --event ') && command.includes(' --group ')), true)
    assert.equal(commands.every((command) => !command.includes(' --hook ')), true)
    assert.equal(commands.every((command) => command.startsWith('/usr/bin/env -u ')), true)
    assert.equal(commands.every((command) => command.includes(' -u NODE_OPTIONS ')), true)
  }
  assert.deepEqual(verifyEligibility(), [])
})

test('root and Claude plugin hook projections remove startup injection before Node launches', async (t) => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'provider-hook-launch-poison-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const poison = resolve(fixture, 'poison.cjs')
  await writeFile(poison, 'process.exit(92)\n')
  const poisonedEnvironment = {
    ...process.env,
    NODE_OPTIONS: `--require=${poison}`,
    NODE_PATH: fixture,
  }
  const structuredLaunch = (args) => spawnSync(process.execPath, [
    '--',
    'packages/governance/test/fixtures/provider-hook-structured-launch-wrapper.mjs',
  ], {
    cwd: repoRoot,
    env: process.env,
    input: JSON.stringify({
      command: '/usr/bin/env',
      args,
      cwd: repoRoot,
      env: poisonedEnvironment,
      input: '{"broken":\n',
    }),
    encoding: 'utf8',
  })
  const rootHandler = buildProviderHookView({ providerId: 'codex' })
    .config.hooks.PreToolUse[0].hooks[0]
  const rootArgv = rootHandler.command.split(' ')
  assert.equal(rootArgv[0], '/usr/bin/env')
  assert.equal(rootArgv.includes('NODE_OPTIONS'), true)
  const rootResult = structuredLaunch(rootArgv.slice(1))
  assert.equal(rootResult.status, 70, rootResult.stderr)
  assert.match(rootResult.stderr, /GOVERNANCE_INTEGRITY:.*invalid JSON payload/)

  const pluginHandler = buildClaudePluginHookView()
    .config.hooks.PreToolUse[0].hooks[0]
  assert.equal(pluginHandler.command, '/usr/bin/env')
  assert.equal(pluginHandler.args.includes('NODE_OPTIONS'), true)
  const pluginArgs = pluginHandler.args.map((token) =>
    token.replace('${CLAUDE_PLUGIN_ROOT}', repoRoot))
  const pluginResult = structuredLaunch(pluginArgs)
  assert.equal(pluginResult.status, 70, pluginResult.stderr)
  assert.match(pluginResult.stderr, /GOVERNANCE_INTEGRITY:.*invalid JSON payload/)
})

test('Claude reviewer wiring and repository-only agents are generated from the registry', () => {
  const claude = buildProviderAdapterTargets({ sourceRoot: repoRoot, outputRoot: repoRoot, providerIds: ['claude'] })
  const claudeSkill = claude.targets.find((target) => target.path.endsWith('/.claude/skills/canonical-reviewer/SKILL.md'))
  const claudeAgent = claude.targets.find((target) => target.path.endsWith('/.claude/agents/canonical-reviewer.md'))
  assert.ok(claudeSkill)
  assert.ok(claudeAgent)
  assert.match(claudeSkill.content.toString('utf8'), /^context: fork$/m)
  assert.match(claudeSkill.content.toString('utf8'), /^agent: canonical-reviewer$/m)
  assert.equal(claudeAgent.source, resolve(repoRoot, 'packages/design-system/ds-canonical/adapters/claude/agents/canonical-reviewer.md'))
  assert.match(claudeAgent.content.toString('utf8'), /CLAUDE_CANONICAL_REVIEWER_AGENT_V1/)

  const codex = buildProviderAdapterTargets({ sourceRoot: repoRoot, outputRoot: repoRoot, providerIds: ['codex'] })
  const codexSkill = codex.targets.find((target) => target.path.endsWith('/.agents/skills/canonical-reviewer/SKILL.md'))
  assert.ok(codexSkill)
  assert.doesNotMatch(codexSkill.content.toString('utf8'), /^context:|^agent:/m)

  const unknownCanonicalTree = structuredClone(PROVIDER_REGISTRY)
  unknownCanonicalTree.providers.find((provider) => provider.id === 'claude').adapter.repositoryManagedTrees.unknownAgents = '.claude/agents'
  delete unknownCanonicalTree.providers.find((provider) => provider.id === 'claude').adapter.repositoryManagedTrees.contextForkAgents
  assert.throws(() => validateProviderRegistry(unknownCanonicalTree), /has no canonical source root/)

  const missingCanonicalAgent = structuredClone(PROVIDER_REGISTRY)
  const claudeAdapter = missingCanonicalAgent.providers.find((provider) => provider.id === 'claude').adapter
  claudeAdapter.repositoryManagedTrees.skills = claudeAdapter.repositoryManagedTrees.contextForkAgents
  delete claudeAdapter.repositoryManagedTrees.contextForkAgents
  assert.throws(
    () => buildProviderAdapterTargets({ registry: missingCanonicalAgent, sourceRoot: repoRoot, outputRoot: repoRoot, providerIds: ['claude'] }),
    /canonical agent source must exist.*ADAPTER-BLOCKED/,
  )
})

test('generated provider hook coverage is closed, exhaustive, and declares only proved hook-independent fallback', async () => {
  const coverage = buildProviderHookCoverage()
  const byProvider = new Map(coverage.providers.map((provider) => [provider.provider, provider]))
  const claude = byProvider.get('claude')
  const codex = byProvider.get('codex')
  const generic = byProvider.get('generic')

  assert.deepEqual(coverage.policy, {
    nativeProjectionIsFeedbackOnly: true,
    nativeProjectionIsSecurityBoundary: false,
    ciEquivalenceRequiresHookSpecificEvidence: true,
    absenceOfProvenFallbackOutcome: 'not-certified',
  })
  assert.equal(claude.projectedCount, 61)
  assert.equal(claude.excludedCount, 0)
  assert.equal(codex.projectedCount, 58)
  assert.equal(codex.excludedCount, 3)
  assert.equal(generic.projectedCount, 0)
  assert.equal(generic.excludedCount, 61)
  for (const provider of coverage.providers) {
    assert.equal(provider.projectedCount + provider.excludedCount, provider.canonicalRegistrationCount)
    assert.equal(provider.certificationClaim, 'projection-only-not-runtime-certified')
    assert.equal(provider.projected.every((hook) => hook.certificationImpact === 'runtime-certification-required'), true)
    assert.equal(provider.excluded.every((hook) => (
      hook.nativeCoverage === 'gap'
      && hook.certificationImpact === 'not-certified'
    )), true)
    const declared = provider.excluded.filter((hook) => hook.authoritativeFallback.status === 'declared')
    assert.deepEqual(declared.map((hook) => hook.hook), provider.provider === 'claude'
      ? []
      : ['check_substantive_edit_approval_preflight.sh'])
    for (const hook of provider.excluded) {
      if (hook.hook === 'check_substantive_edit_approval_preflight.sh') {
        assert.deepEqual(hook.authoritativeFallback, {
          status: 'declared',
          authority: 'packages/design-system/ds-canonical/hooks/lib/approval-evidence.mjs',
          runner: 'scripts/run-provider-hook.mjs',
          prepareArgv: ['--authority-decision', 'prepare'],
          verifyArgv: ['--authority-decision', 'verify'],
          evidence: 'scripts/test-authority-decision-evidence.mjs',
          detail: 'The existing provider-neutral hook runner prepares and verifies one content-addressed authority receipt with the canonical classifier; native projection remains feedback-only and every untested runtime remains not-certified.',
        })
      } else {
        assert.deepEqual(hook.authoritativeFallback, { status: 'none' })
      }
    }
  }
  assert.deepEqual(codex.excluded.map((item) => item.hook).sort(), [
    'check_propose_without_benchmark.sh',
    'check_solo_workflow.sh',
    'check_substantive_edit_approval_preflight.sh',
  ])
  assert.equal(codex.excluded.every((item) => item.reasonCode === 'STABLE_TRANSCRIPT_CONTRACT_UNAVAILABLE'), true)
  assert.equal(codex.excluded.every((item) => item.transcriptRequirement === 'stable-required'), true)
  assert.equal(generic.excluded.filter((item) => item.authoritativeFallback.status === 'declared').length, 1)

  const schema = JSON.parse(await readFile(resolve(repoRoot, 'packages/governance/canonical/schemas/provider-hook-coverage.schema.json'), 'utf8'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  assert.equal(validate(coverage), true)
  assert.equal(validate({ ...coverage, undeclaredClaim: true }), false, 'root schema must reject undeclared claims')
  const invalidExclusion = structuredClone(coverage)
  invalidExclusion.providers.find((provider) => provider.provider === 'codex').excluded[0].ciEquivalent = true
  assert.equal(validate(invalidExclusion), false, 'excluded-hook schema must reject undeclared CI-equivalence claims')
})

test('synthetic Alpha and Beta providers project the same semantics in both directions', () => {
  const registry = structuredClone(PROVIDER_REGISTRY)
  const alpha = structuredClone(registry.providers.find((item) => item.id === 'claude'))
  const beta = structuredClone(registry.providers.find((item) => item.id === 'codex'))
  alpha.id = 'alpha'
  alpha.displayName = 'Alpha'
  beta.id = 'beta'
  beta.displayName = 'Beta'
  beta.runtime.transcript = structuredClone(alpha.runtime.transcript)
  for (const binding of Object.values(alpha.adapter.skillBindings)) binding.self = 'alpha'
  for (const binding of Object.values(beta.adapter.skillBindings)) binding.self = 'beta'
  registry.providers = [alpha, beta, registry.providers.find((item) => item.id === 'generic')]
  const alphaView = buildProviderHookView({ providerId: 'alpha', registry })
  const betaView = buildProviderHookView({ providerId: 'beta', registry })
  assert.equal(alphaView.projected.length, 61)
  assert.equal(betaView.projected.length, 61)
  assert.equal(nativeHandlerCount(alphaView), 16)
  assert.equal(nativeHandlerCount(betaView), 16)
  assert.deepEqual(alphaView.excluded, [])
  assert.deepEqual(betaView.excluded, [])
})

test('a synthetic future provider needs explicit semantic certification and receives shell-free structured argv', async (t) => {
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'future provider adapter '))
  t.after(() => rm(outputRoot, { recursive: true, force: true }))
  const registry = structuredClone(PROVIDER_REGISTRY)
  const future = structuredClone(registry.providers.find((item) => item.id === 'codex'))
  future.id = 'future-synthetic'
  future.displayName = 'Future synthetic provider'
  future.instructionEntry = 'FUTURE.md'
  future.adapter.repositoryInstructionSource = null
  future.adapter.instructionView = { materializerId: 'markdown-relative-at-import-v1' }
  future.skillDirectory = '.future-provider/skills'
  future.hookConfig = '.future-provider/hooks.json'
  future.adapter.skillView.directory = future.skillDirectory
  future.adapter.hookView.output = future.hookConfig
  future.adapter.hookView.materializerId = 'portable-event-list-json-v1'
  future.adapter.hookView.workingDirectoryPolicy = 'repository-root'
  future.adapter.skillAliases = []
  future.adapter.discovery.providerRootNames = ['.future-provider']
  future.adapter.discovery.instructionNames = ['FUTURE.md']
  future.adapter.discovery.configPaths = ['.future-provider/hooks.json']
  for (const binding of Object.values(future.adapter.skillBindings)) {
    binding.self = future.id
  }
  registry.providers.push(future)
  validateProviderRegistry(registry)

  const unboundOptions = { registry, semantics: PROVIDER_SKILL_SEMANTICS, sourceRoot: repoRoot, outputRoot, providerIds: [future.id] }
  assert.throws(
    () => buildProviderAdapterTargets(unboundOptions),
    /BINDING_NOT_CERTIFIED|ADAPTER-BLOCKED/,
    'copying an existing provider shape must not certify semantic compatibility',
  )

  const semantics = structuredClone(PROVIDER_SKILL_SEMANTICS)
  for (const profile of Object.values(semantics.bindingProfiles)) {
    profile.providers[future.id] = {
      ...structuredClone(profile.providers.codex),
      evidenceSource: `synthetic-fixture:${future.id}:${profile.requiredCapabilities.join(',')}`,
    }
  }
  validateProviderSkillSemantics(semantics)
  const options = { registry, semantics, sourceRoot: repoRoot, outputRoot, providerIds: [future.id] }
  const built = buildProviderAdapterTargets(options)
  assert.equal(built.report[0].provider, future.id)
  const codexBaseline = buildProviderHookView({ providerId: 'codex' })
  assert.equal(built.report[0].projectedHooks, codexBaseline.projected.length)
  assert.equal(built.report[0].exclusions.length, codexBaseline.excluded.length)
  assert.equal(built.targets.some((item) => item.path.endsWith('.future-provider/skills/canonical-reviewer/SKILL.md')), true)
  const portableHooks = buildProviderHookView({ providerId: future.id, registry }).config
  const argvHandlers = portableHooks.events.flatMap((event) => event.groups.flatMap((group) => group.handlers))
  assert.equal(argvHandlers.length, 16)
  assert.equal(argvHandlers.every((handler) => Array.isArray(handler.argv)), true)
  assert.equal(argvHandlers.every((handler) => (
    handler.argv[0] === '/usr/bin/env'
    && handler.argv.includes('NODE_OPTIONS')
    && handler.argv.includes('node')
    && handler.argv.includes('scripts/run-provider-hook.mjs')
    && handler.argv.includes('--event')
    && handler.argv.includes('--group')
    && !handler.argv.includes('--hook')
    && !handler.argv.some((token) => token === 'bash' || token === '-lc' || token.includes('$(') || token.includes(outputRoot))
  )), true)
  const aliasedWriteGroup = portableHooks.events
    .find((event) => event.event === 'PreToolUse')
    .groups.find((group) => group.when?.includes('apply_patch'))
  assert.ok(aliasedWriteGroup)
  assert.equal(aliasedWriteGroup.handlers.length, 1)
  const boundCopy = built.targets.find((item) => item.path.endsWith('.future-provider/skills/bug-fix-rhythm/SKILL.md')).content.toString('utf8')
  const neutralCopy = built.targets.find((item) => item.path.endsWith('.future-provider/skills/delivery-handoff/SKILL.md')).content.toString('utf8')
  assert.match(boundCopy, /provider-binding: profile=repository-legacy-surfaces-v1; provider=future-synthetic/)
  assert.match(boundCopy, /Provider binding contract/)
  assert.doesNotMatch(neutralCopy, /Provider binding contract/)
  writeProviderAdapterTargets(options)
  assert.deepEqual(checkProviderAdapterTargets(options).drift, [])

  const coverageArtifact = resolve(outputRoot, PROVIDER_HOOK_COVERAGE_PATH)
  await writeFile(coverageArtifact, '{}\n')
  assert.equal(checkProviderAdapterTargets(options).drift.some((item) => item.path === PROVIDER_HOOK_COVERAGE_PATH && item.kind === 'content'), true)
  writeProviderAdapterTargets(options)

  const skill = resolve(outputRoot, '.future-provider/skills/canonical-reviewer/SKILL.md')
  await writeFile(skill, 'tampered\n')
  assert.equal(checkProviderAdapterTargets(options).drift.some((item) => item.kind === 'content'), true)
  await writeFile(resolve(outputRoot, '.future-provider/skills/extra.txt'), 'unexpected\n')
  assert.equal(checkProviderAdapterTargets(options).drift.some((item) => item.kind === 'extra'), true)
  assert.throws(() => buildProviderAdapterTargets({ ...options, providerIds: ['missing-provider'] }), /unknown provider.*ADAPTER-BLOCKED/)

  const invalid = structuredClone(registry)
  invalid.providers.at(-1).adapter.hookView.format = 'unknown-template'
  assert.throws(() => buildProviderAdapterTargets({ ...options, registry: invalid }), /violates its committed JSON Schema/)
})

test('provider registry paths and adapter trees fail closed on traversal and symlinks', async (t) => {
  for (const attack of ['../outside', '/tmp/outside', 'nested\\outside', 'nested/./outside', 'nested//outside']) {
    const registry = structuredClone(PROVIDER_REGISTRY)
    registry.providers[1].adapter.skillView.directory = attack
    assert.throws(() => validateProviderRegistry(registry), /repository-relative POSIX path|traversal|committed JSON Schema/)
  }

  const overlappingProductTree = structuredClone(PROVIDER_REGISTRY)
  const overlappingCodex = overlappingProductTree.providers.find((provider) => provider.id === 'codex')
  overlappingCodex.adapter.productManagedTrees.nestedSkills = {
    sourceRoot: 'scripts/test-fixtures/future-provider-managed-tree',
    destination: `${overlappingCodex.skillDirectory}/nested`,
    materializerId: 'closed-tree-copy-v1',
    transformPolicy: 'byte-exact',
  }
  assert.throws(
    () => validateProviderRegistry(overlappingProductTree),
    /product managed surfaces overlap/,
    'one provider may not assign a nested product path to two materializers',
  )

  const sourceRoot = await mkdtemp(resolve(tmpdir(), 'provider-source-symlink-'))
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'provider-output-symlink-'))
  const hookOutputRoot = await mkdtemp(resolve(tmpdir(), 'provider-hook-output-symlink-'))
  const broadOutputRoot = await mkdtemp(resolve(tmpdir(), 'provider-broad-output-'))
  const collisionOutputRoot = await mkdtemp(resolve(tmpdir(), 'provider-output-collision-'))
  const rootLinkParent = await mkdtemp(resolve(tmpdir(), 'provider-root-symlink-'))
  const external = await mkdtemp(resolve(tmpdir(), 'provider-external-canary-'))
  t.after(() => Promise.all([
    rm(sourceRoot, { recursive: true, force: true }),
    rm(outputRoot, { recursive: true, force: true }),
    rm(hookOutputRoot, { recursive: true, force: true }),
    rm(broadOutputRoot, { recursive: true, force: true }),
    rm(collisionOutputRoot, { recursive: true, force: true }),
    rm(rootLinkParent, { recursive: true, force: true }),
    rm(external, { recursive: true, force: true }),
  ]))

  const canonicalSkills = resolve(sourceRoot, 'canonical-skills')
  await mkdir(canonicalSkills, { recursive: true })
  await writeFile(resolve(external, 'SKILL.md'), '---\nname: escaped\n---\n')
  await symlink(external, resolve(canonicalSkills, 'escaped'))
  assert.throws(
    () => buildSharedSkillTargets({ sourceRoot, outputRoot, sourceDir: canonicalSkills, destinationDir: resolve(outputRoot, 'skills'), targetProvider: 'codex' }),
    /symbolic link/,
  )

  await mkdir(resolve(outputRoot), { recursive: true })
  await symlink(external, resolve(outputRoot, '.agents'))
  assert.throws(
    () => buildProviderAdapterTargets({ sourceRoot: repoRoot, outputRoot, providerIds: ['codex'] }),
    /symbolic link/,
  )

  await mkdir(resolve(hookOutputRoot, '.codex'), { recursive: true })
  const externalHookConfig = resolve(external, 'hooks.json')
  await writeFile(externalHookConfig, '{}\n')
  await symlink(externalHookConfig, resolve(hookOutputRoot, '.codex/hooks.json'))
  assert.throws(
    () => checkProviderAdapterTargets({ sourceRoot: repoRoot, outputRoot: hookOutputRoot, providerIds: ['codex'] }),
    /symbolic link/,
  )

  const injected = structuredClone(PROVIDER_REGISTRY)
  injected.providers[1].adapter.hookView.workingDirectoryPolicy = 'shell-expression'
  assert.throws(() => validateProviderRegistry(injected), /committed JSON Schema|working directory policy/)

  const sourceRootLink = resolve(rootLinkParent, 'source-root')
  const outputRootLink = resolve(rootLinkParent, 'output-root')
  const canary = resolve(external, 'DO-NOT-MUTATE.txt')
  await writeFile(canary, 'untouched\n')
  await symlink(repoRoot, sourceRootLink)
  await symlink(external, outputRootLink)
  assert.throws(
    () => buildProviderAdapterTargets({ sourceRoot: sourceRootLink, outputRoot, providerIds: ['codex'] }),
    /declared root.*symbolic link/,
  )
  assert.throws(
    () => writeProviderAdapterTargets({ sourceRoot: repoRoot, outputRoot: outputRootLink, providerIds: ['codex'] }),
    /declared root.*symbolic link/,
  )
  assert.equal(await readFile(canary, 'utf8'), 'untouched\n')

  const broadRegistry = structuredClone(PROVIDER_REGISTRY)
  const broadCodex = broadRegistry.providers.find((provider) => provider.id === 'codex')
  broadCodex.skillDirectory = 'packages'
  broadCodex.adapter.skillView.directory = 'packages'
  await mkdir(resolve(broadOutputRoot, 'packages'), { recursive: true })
  const broadCanary = resolve(broadOutputRoot, 'packages/UNMANAGED-SENTINEL.txt')
  await writeFile(broadCanary, 'must survive\n')
  assert.throws(
    () => writeProviderAdapterTargets({ registry: broadRegistry, sourceRoot: repoRoot, outputRoot: broadOutputRoot, providerIds: ['codex'] }),
    /committed JSON Schema|dedicated non-Git dot-directory/,
  )
  assert.equal(await readFile(broadCanary, 'utf8'), 'must survive\n')

  const overlapRegistry = structuredClone(PROVIDER_REGISTRY)
  const overlapCodex = overlapRegistry.providers.find((provider) => provider.id === 'codex')
  overlapCodex.skillDirectory = '.claude/rules/nested'
  overlapCodex.adapter.skillView.directory = '.claude/rules/nested'
  overlapCodex.adapter.discovery.providerRootNames = [...new Set([...overlapCodex.adapter.discovery.providerRootNames, '.claude'])].sort()
  assert.throws(() => validateProviderRegistry(overlapRegistry), /output roots overlap/)

  const collisionRegistry = structuredClone(PROVIDER_REGISTRY)
  const future = structuredClone(collisionRegistry.providers.find((provider) => provider.id === 'codex'))
  future.id = 'future-collision'
  future.displayName = 'Future collision fixture'
  future.instructionEntry = 'FUTURE.md'
  future.adapter.repositoryInstructionSource = null
  future.adapter.instructionView = { materializerId: 'markdown-relative-at-import-v1' }
  future.skillDirectory = '.future-collision/skills'
  future.adapter.skillView.directory = future.skillDirectory
  future.adapter.skillAliases = []
  future.adapter.discovery.providerRootNames = [...new Set([...future.adapter.discovery.providerRootNames, '.future-collision'])].sort()
  future.adapter.discovery.instructionNames = [...new Set([...future.adapter.discovery.instructionNames, 'FUTURE.md'])].sort()
  for (const binding of Object.values(future.adapter.skillBindings)) {
    binding.self = future.id
  }
  collisionRegistry.providers.push(future)
  await mkdir(resolve(collisionOutputRoot, '.codex'), { recursive: true })
  const collisionSentinel = resolve(collisionOutputRoot, '.codex/hooks.json')
  await writeFile(collisionSentinel, 'existing-provider-sentinel\n')
  assert.throws(
    () => writeProviderAdapterTargets({ registry: collisionRegistry, sourceRoot: repoRoot, outputRoot: collisionOutputRoot, providerIds: [future.id] }),
    /standalone output collision/,
  )
  assert.equal(await readFile(collisionSentinel, 'utf8'), 'existing-provider-sentinel\n')
})

test('standalone adapter and plugin writers atomically replace hard-linked targets without mutating outside inodes', async (t) => {
  const adapterRoot = await mkdtemp(resolve(tmpdir(), 'provider-hardlink-adapter-'))
  const pluginRoot = await mkdtemp(resolve(tmpdir(), 'provider-hardlink-plugin-'))
  const external = await mkdtemp(resolve(tmpdir(), 'provider-hardlink-outside-'))
  t.after(() => Promise.all([
    rm(adapterRoot, { recursive: true, force: true }),
    rm(pluginRoot, { recursive: true, force: true }),
    rm(external, { recursive: true, force: true }),
  ]))

  const claude = PROVIDER_REGISTRY.providers.find((provider) => provider.id === 'claude')
  const instructionTarget = resolve(adapterRoot, claude.instructionEntry)
  const instructionSentinel = resolve(external, 'instruction-sentinel.md')
  await writeFile(instructionSentinel, '# outside instruction sentinel\n')
  await link(instructionSentinel, instructionTarget)
  const instructionBefore = await lstat(instructionSentinel)
  const expectedInstruction = buildProviderAdapterTargets({
    sourceRoot: repoRoot,
    outputRoot: adapterRoot,
    providerIds: ['claude'],
  }).targets.find((target) => target.path === instructionTarget).content
  writeProviderAdapterTargets({ sourceRoot: repoRoot, outputRoot: adapterRoot, providerIds: ['claude'] })
  const instructionAfter = await lstat(instructionTarget)
  assert.equal(await readFile(instructionSentinel, 'utf8'), '# outside instruction sentinel\n')
  assert.equal((await readFile(instructionTarget)).equals(expectedInstruction), true)
  assert.equal(instructionAfter.dev !== instructionBefore.dev || instructionAfter.ino !== instructionBefore.ino, true)

  const pluginRelative = PROVIDER_REGISTRY.canonical.compatibilityProjections.marketplacePluginTransport.hookOutput
  const pluginTarget = resolve(pluginRoot, pluginRelative)
  const pluginSentinel = resolve(external, 'plugin-sentinel.json')
  await mkdir(resolve(pluginTarget, '..'), { recursive: true })
  await writeFile(pluginSentinel, '{"outside":"plugin-preserve"}\n')
  await link(pluginSentinel, pluginTarget)
  const pluginBefore = await lstat(pluginSentinel)
  const expectedPlugin = buildProviderAdapterTargets({
    sourceRoot: repoRoot,
    outputRoot: pluginRoot,
    providerIds: ['claude'],
  }).targets.find((target) => target.path === pluginTarget).content
  writeClaudePluginHookView({ sourceRoot: repoRoot, outputRoot: pluginRoot })
  const pluginAfter = await lstat(pluginTarget)
  assert.equal(await readFile(pluginSentinel, 'utf8'), '{"outside":"plugin-preserve"}\n')
  assert.equal((await readFile(pluginTarget)).equals(expectedPlugin), true)
  assert.equal(pluginAfter.dev !== pluginBefore.dev || pluginAfter.ino !== pluginBefore.ino, true)
})

test('Claude legacy environment is mapped only at the adapter boundary', async (t) => {
  const project = await mkdtemp(resolve(tmpdir(), 'legacy-env-adapter-'))
  t.after(() => rm(project, { recursive: true, force: true }))
  assert.equal(spawnSync('git', ['-C', project, 'init', '-q']).status, 0)
  await mkdir(resolve(project, 'governance/generated/adapters'), { recursive: true })
  await writeFile(resolve(project, 'governance/generated/adapters/claude-hook.mjs'), `
let body = ''
for await (const chunk of process.stdin) body += chunk
const input = JSON.parse(body || '{}')
console.error('GOV-GENERATED-001:' + input.tool_input.file_path)
process.exitCode = 2
`)
  const result = spawnSync(process.execPath, ['--', resolve(repoRoot, 'scripts/run-provider-hook.mjs'), '--provider', 'claude', '--hook', 'governance_control_plane.sh'], {
    cwd: project,
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    input: '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"governance/generated/a.json","old_string":"before","new_string":"after"}}\n',
    encoding: 'utf8',
  })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /GOV-GENERATED-001/)
  assert.match(result.stderr, /governance\/generated\/a\.json/)
})

test('runner normalizes contained paths, fans out per-file content, and translates context for both native providers', () => {
  const runner = resolve(repoRoot, 'scripts/run-provider-hook.mjs')
  const run = (provider, hook, payload) => spawnSync(process.execPath, ['--', runner, '--provider', provider, '--hook', hook], {
    cwd: repoRoot,
    env: { ...process.env, GOVERNANCE_READ_ONLY: '1' },
    input: `${JSON.stringify(payload)}\n`,
    encoding: 'utf8',
  })
  const violation = '<Sidebar />'
  const relative = {
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: 'apps/template/src/App.tsx', old_string: 'legacy anchor', new_string: violation },
  }
  const absolute = structuredClone(relative)
  absolute.tool_input.file_path = resolve(repoRoot, relative.tool_input.file_path)
  const multi = {
    hook_event_name: 'PreToolUse', tool_name: 'MultiEdit',
    tool_input: {
      edits: [
        { file_path: 'README.md', old_string: 'legacy readme', new_string: 'benign' },
        { file_path: 'apps/template/src/App.tsx', old_string: 'legacy anchor', new_string: violation },
      ],
    },
  }
  for (const provider of ['claude', 'codex']) {
    const optionalTranscriptAbsent = run(provider, 'check_ds_anchor_preflight.sh', relative)
    assert.equal(optionalTranscriptAbsent.status, 2)
    assert.doesNotMatch(optionalTranscriptAbsent.stderr, /TRANSCRIPT_SNAPSHOT_UNAVAILABLE/)
    assert.equal(run(provider, 'check_ds_anchor_preflight.sh', absolute).status, 2)
    assert.equal(run(provider, 'check_ds_anchor_preflight.sh', multi).status, 2)
    for (const escapedPath of ['../outside.tsx', resolve(repoRoot, '../outside-absolute.tsx')]) {
      const escaped = structuredClone(relative)
      escaped.tool_input.file_path = escapedPath
      const result = run(provider, 'check_ds_anchor_preflight.sh', escaped)
      assert.equal(result.status, 70)
      assert.match(result.stderr, /GOVERNANCE_INTEGRITY:/)
      assert.match(result.stderr, /changed path escapes repository root/)
    }
  }

  const sizePayload = {
    hook_event_name: 'PreToolUse', tool_name: 'Edit',
    tool_input: {
      file_path: 'packages/design-system/src/patterns/element-anatomy/item-anatomy.spec.md',
      old_string: 'legacy',
      new_string: 'x',
    },
  }
  const claude = run('claude', 'check_file_size_budget.sh', sizePayload)
  const codex = run('codex', 'check_file_size_budget.sh', sizePayload)
  assert.equal(claude.status, 0)
  assert.equal(codex.status, 0)
  assert.equal(JSON.parse(claude.stdout).hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.match(JSON.parse(codex.stdout).systemMessage, /item-anatomy/)
  assert.equal(JSON.parse(codex.stdout).suppressOutput, undefined)
})

test('event-group runner parses and materializes once, preserves order, and separates policy from integrity', async (t) => {
  const fixture = await mkdtemp(resolve(repoRoot, '.tmp-provider-batch-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const copy = async (path) => {
    await mkdir(resolve(fixture, path, '..'), { recursive: true })
    await cp(resolve(repoRoot, path), resolve(fixture, path), { recursive: true })
  }
  for (const path of [
    'AGENTS.md',
    'scripts/run-provider-hook.mjs',
    'scripts/lib/canonical-path-containment.mjs',
    'scripts/lib/closed-tool-execution.mjs',
    'scripts/lib/provider-contract-validation.mjs',
    'scripts/lib/provider-hook-output-transport.mjs',
    'scripts/lib/provider-runtime-contract.mjs',
    'scripts/schemas/provider-skill-semantics.schema.json',
    'packages/governance/canonical/providers.json',
    'packages/governance/canonical/schemas/providers.schema.json',
    'packages/governance/src/closed-tool-execution.mjs',
    'packages/governance/src/canonical-order.mjs',
    'packages/governance/src/provider-hook-normalization.mjs',
    'packages/governance/src/provider-review-binding.mjs',
    'packages/governance/src/authority-decision-evidence.mjs',
    'packages/design-system/ds-canonical/hooks/registrations.schema.json',
    'packages/design-system/ds-canonical/references',
    'packages/design-system/ds-canonical/rules',
    'packages/design-system/ds-canonical/skills',
    'packages/design-system/src/tokens/utility-registry.json',
  ]) await copy(path)

  const hookDirectory = resolve(fixture, 'packages/design-system/ds-canonical/hooks')
  const orderLog = resolve(fixture, 'order.log')
  await writeFile(resolve(hookDirectory, 'batch-context-a.mjs'), `
import { appendFileSync } from 'node:fs'
for await (const _chunk of process.stdin) {}
appendFileSync(process.env.GOVERNANCE_TEST_BATCH_ORDER_LOG, 'context-a\\n')
process.stdout.write(JSON.stringify({ governanceContext: { hookEventName: 'PreToolUse', message: 'ctx-a' } }))
`)
  await writeFile(resolve(hookDirectory, 'batch-gate.mjs'), `
import { appendFileSync } from 'node:fs'
let body = ''
for await (const chunk of process.stdin) body += chunk
const payload = JSON.parse(body)
appendFileSync(process.env.GOVERNANCE_TEST_BATCH_ORDER_LOG, 'gate\\n')
const state = payload.tool_input?.governance_write_state
if (!state || state.kind !== 'text'
  || ![Number(process.env.GOVERNANCE_TEST_BATCH_EXPECTED_LENGTH), 5].includes(state.content.length)) {
  process.stderr.write('GOVERNANCE_INTEGRITY: proposed state missing or wrong\\n')
  process.exit(70)
}
if (Object.hasOwn(payload.tool_input, 'new_string') || Object.hasOwn(payload.tool_input, 'content')) {
  process.stderr.write('GOVERNANCE_INTEGRITY: raw proposed transport was amplified\\n')
  process.exit(70)
}
if (process.env.GOVERNANCE_TEST_BATCH_MODE === 'policy') {
  process.stderr.write('fixture policy denial\\n')
  process.exit(2)
}
if (process.env.GOVERNANCE_TEST_BATCH_MODE === 'invalid-utf8') {
  process.stdout.write(Buffer.from([0xff]))
}
if (process.env.GOVERNANCE_TEST_BATCH_MODE === 'invalid-stderr-utf8') {
  process.stderr.write(Buffer.from([0xff]))
  process.exit(2)
}
`)
  await writeFile(resolve(hookDirectory, 'batch-context-b.mjs'), `
import { appendFileSync } from 'node:fs'
for await (const _chunk of process.stdin) {}
appendFileSync(process.env.GOVERNANCE_TEST_BATCH_ORDER_LOG, 'context-b\\n')
process.stdout.write(JSON.stringify({ governanceContext: { hookEventName: 'PreToolUse', message: 'ctx-b' } }))
`)
  await writeFile(resolve(hookDirectory, 'batch-noop.sh'), `
INPUT=$(cat)
if ! printf '%s' "$INPUT" | jq -e '
  (has("shared_metadata") | not)
  and (.changed_paths | length == 1)
  and (.tool_input.file_path == .changed_paths[0])
  and (.tool_input.path == .changed_paths[0])
  and (.tool_input | has("edits") | not)
  and (.tool_input | has("new_string") | not)
' >/dev/null 2>&1; then
  printf 'GOVERNANCE_INTEGRITY: child envelope is not compact and path-local\\n' >&2
  exit 70
fi
exit 0
`)
  await writeFile(resolve(hookDirectory, 'batch-command-noop.sh'), `
cat >/dev/null
exit 0
`)
  const bashSnapshotHelper = resolve(hookDirectory, 'lib/batch-snapshot-helper.sh')
  const bashSnapshotHook = resolve(hookDirectory, 'batch-snapshot.sh')
  await mkdir(resolve(bashSnapshotHelper, '..'), { recursive: true })
  await writeFile(bashSnapshotHelper, `
batch_snapshot_assert_sibling() {
  case "\${BASH_SOURCE[0]}" in
    /*/packages/design-system/ds-canonical/hooks/lib/batch-snapshot-helper.sh) ;;
    *) printf 'GOVERNANCE_INTEGRITY: bash helper BASH_SOURCE is not the absolute snapshot sibling\\n' >&2; exit 70 ;;
  esac
  case "\${BASH_SOURCE[1]}" in
    /*/packages/design-system/ds-canonical/hooks/batch-snapshot.sh) ;;
    *) printf 'GOVERNANCE_INTEGRITY: bash caller BASH_SOURCE is not the absolute snapshot hook\\n' >&2; exit 70 ;;
  esac
}
`)
  await writeFile(bashSnapshotHook, `
source "$(dirname "\${BASH_SOURCE[0]}")/lib/batch-snapshot-helper.sh" || exit 70
batch_snapshot_assert_sibling
[ "$0" = "\${BASH_SOURCE[0]}" ] || {
  printf 'GOVERNANCE_INTEGRITY: bash hook $0 and BASH_SOURCE differ\\n' >&2
  exit 70
}
case "$0" in
  "$GOVERNANCE_TEST_BATCH_LIVE_ROOT"/*) printf 'GOVERNANCE_INTEGRITY: bash hook executed from live corpus\\n' >&2; exit 70 ;;
  /*/packages/design-system/ds-canonical/hooks/batch-snapshot.sh) ;;
  *) printf 'GOVERNANCE_INTEGRITY: bash hook path is not the absolute snapshot path\\n' >&2; exit 70 ;;
esac
printf '{"governanceContext":{"hookEventName":"PreToolUse","message":"bash-snapshot-ok"}}'
`)
  await writeFile(resolve(hookDirectory, 'batch_snapshot_helper.py'), `
from pathlib import Path
def validate(main_file):
    helper = Path(__file__).resolve()
    main = Path(main_file).resolve()
    return helper.parent == main.parent and helper.name == "batch_snapshot_helper.py"
`)
  await writeFile(resolve(hookDirectory, 'batch-snapshot.py'), `
import json
import os
import site
import sys
from pathlib import Path
from batch_snapshot_helper import validate
main = Path(__file__).resolve()
if not validate(__file__) or Path(sys.argv[0]).resolve() != main:
    print("GOVERNANCE_INTEGRITY: python __file__/argv/sibling semantics differ", file=sys.stderr)
    raise SystemExit(70)
if str(main).startswith(os.environ["GOVERNANCE_TEST_BATCH_LIVE_ROOT"] + os.sep):
    print("GOVERNANCE_INTEGRITY: python hook executed from live corpus", file=sys.stderr)
    raise SystemExit(70)
if sys.flags.isolated != 1 or site.ENABLE_USER_SITE not in (False, None):
    print("GOVERNANCE_INTEGRITY: python hook runtime is not isolated from user site", file=sys.stderr)
    raise SystemExit(70)
if os.environ.get("PYTHONNOUSERSITE") != "1" or os.environ.get("PYTHONDONTWRITEBYTECODE") != "1":
    print("GOVERNANCE_INTEGRITY: python hook isolation environment is missing", file=sys.stderr)
    raise SystemExit(70)
print(json.dumps({"governanceContext":{"hookEventName":"PreToolUse","message":"python-snapshot-ok"}}), end="")
`)
  await writeFile(resolve(hookDirectory, 'batch-signal-tree.sh'), `
set -u
sh -c 'trap "" TERM INT; while :; do sleep 1; done' &
descendant=$!
printf '%s\\n%s\\n%s\\n' "$0" "\${BASH_SOURCE[0]}" "$descendant" > "$GOVERNANCE_TEST_BATCH_SIGNAL_LOG"
wait "$descendant"
`)
  await writeFile(resolve(hookDirectory, 'batch-delay.sh'), `
sleep 5
`)
  await writeFile(resolve(hookDirectory, 'batch-large-context.mjs'), `
for await (const _chunk of process.stdin) {}
process.stdout.write(JSON.stringify({
  governanceContext: {
    hookEventName: 'PreToolUse',
    message: 'z'.repeat(256 * 1024),
  },
}))
`)
  await writeFile(resolve(hookDirectory, 'batch-clean-parent-orphan.sh'), `
/bin/bash -c 'trap "" TERM; exec /bin/sleep 30' >/dev/null 2>&1 &
printf '%s\\n' "$!" > "$GOVERNANCE_TEST_BATCH_CLEAN_DESCENDANT_LOG"
exit 0
`)
  await writeFile(resolve(hookDirectory, 'batch-transcript-mutate.mjs'), `
import { chmodSync, writeFileSync } from 'node:fs'
for await (const _chunk of process.stdin) {}
chmodSync(process.env.GOVERNANCE_TRANSCRIPT_PATH, 0o600)
writeFileSync(process.env.GOVERNANCE_TRANSCRIPT_PATH, '{"mutated":true}\\n')
`)
  const descriptorLimitHooks = []
  for (let index = 0; index < 65; index += 1) {
    const name = `batch-descriptor-${index}.sh`
    await writeFile(resolve(hookDirectory, name), 'cat >/dev/null\n')
    descriptorLimitHooks.push({ kind: 'hook', hook: name, runtime: 'bash', outputMode: 'diagnostic' })
  }
  const invocationLimitHooks = []
  for (let index = 0; index < 5; index += 1) {
    const name = `batch-invocation-${index}.sh`
    await writeFile(resolve(hookDirectory, name), 'cat >/dev/null\n')
    invocationLimitHooks.push({ kind: 'hook', hook: name, runtime: 'bash', outputMode: 'diagnostic' })
  }
  const aggregateOutputHooks = []
  for (let index = 0; index < 10; index += 1) {
    const name = `batch-output-${index}.mjs`
    await writeFile(resolve(hookDirectory, name), `
for await (const _chunk of process.stdin) {}
process.stdout.write(JSON.stringify({governanceContext:{hookEventName:'PreToolUse',message:'x'.repeat(900 * 1024)}}))
`)
    aggregateOutputHooks.push({ kind: 'hook', hook: name, runtime: 'node', outputMode: 'governance-context' })
  }
  await writeFile(resolve(hookDirectory, 'registrations.json'), `${JSON.stringify({
    schemaVersion: 1,
    hooks: {
      PreToolUse: [
        {
          matcher: 'Edit|MultiEdit',
          hooks: [
            { kind: 'hook', hook: 'batch-context-a.mjs', runtime: 'node', outputMode: 'governance-context' },
            { kind: 'hook', hook: 'batch-gate.mjs', runtime: 'node', outputMode: 'governance-context-or-block', inputContract: 'proposed-text-v1' },
            { kind: 'hook', hook: 'batch-context-b.mjs', runtime: 'node', outputMode: 'governance-context' },
          ],
        },
        {
          matcher: 'MultiEdit',
          hooks: [
            { kind: 'hook', hook: 'batch-noop.sh', runtime: 'bash', outputMode: 'diagnostic' },
          ],
        },
        {
          matcher: 'Bash',
          hooks: [
            { kind: 'hook', hook: 'batch-command-noop.sh', runtime: 'bash', outputMode: 'diagnostic' },
          ],
        },
        {
          matcher: 'Bash',
          hooks: [
            { kind: 'hook', hook: 'batch-snapshot.sh', runtime: 'bash', outputMode: 'governance-context' },
          ],
        },
        {
          matcher: 'Bash',
          hooks: [
            { kind: 'hook', hook: 'batch-snapshot.py', runtime: 'python3', outputMode: 'governance-context' },
          ],
        },
        {
          matcher: 'Bash',
          hooks: [
            { kind: 'hook', hook: 'batch-signal-tree.sh', runtime: 'bash', outputMode: 'diagnostic' },
          ],
        },
        {
          matcher: 'Bash',
          hooks: descriptorLimitHooks,
        },
        {
          matcher: 'MultiEdit',
          hooks: invocationLimitHooks,
        },
        {
          matcher: 'Bash',
          hooks: aggregateOutputHooks,
        },
          {
            matcher: 'Bash',
            hooks: [
              { kind: 'hook', hook: 'batch-delay.sh', runtime: 'bash', outputMode: 'diagnostic' },
            ],
          },
          {
            matcher: 'Bash',
            hooks: [
              { kind: 'hook', hook: 'batch-large-context.mjs', runtime: 'node', outputMode: 'governance-context' },
            ],
          },
          {
            matcher: 'Bash',
            hooks: [
              { kind: 'hook', hook: 'batch-clean-parent-orphan.sh', runtime: 'bash', outputMode: 'diagnostic' },
            ],
          },
        ],
        UserPromptSubmit: [
          {
            matcher: '',
            hooks: [
              {
                kind: 'hook',
                hook: 'batch-transcript-mutate.mjs',
                runtime: 'node',
                outputMode: 'diagnostic',
                transcript: 'stable-required',
              },
            ],
          },
        ],
      },
  }, null, 2)}\n`)
  await writeFile(resolve(fixture, 'sample-a.txt'), 'alpha')
  await writeFile(resolve(fixture, 'sample-b.txt'), 'alpha')
  await writeFile(resolve(fixture, 'dense-replace.txt'), 'x'.repeat(4096))
  assert.equal(spawnSync('git', ['-C', fixture, 'init', '-q']).status, 0)

  const largeAfterImage = `beta-${'x'.repeat(2 * 1024 * 1024)}`
  const payload = {
    hook_event_name: 'PreToolUse',
    tool_name: 'MultiEdit',
    tool_input: {
      edits: [
        { file_path: 'sample-a.txt', old_string: 'alpha', new_string: largeAfterImage },
        { file_path: 'sample-b.txt', old_string: 'alpha', new_string: 'bravo' },
      ],
    },
  }
  const runner = resolve(fixture, 'scripts/run-provider-hook.mjs')
  const run = async (mode, options = {}) => {
    await writeFile(orderLog, '')
    const invocationPayload = options.payload ?? payload
    const result = options.constrainedHeap === true
      ? spawnSync(process.execPath, [
        '--max-old-space-size=48',
        '--',
        'scripts/run-provider-hook.mjs',
        '--provider',
        'claude',
        '--event',
        'PreToolUse',
        '--group',
        options.group ?? '0',
        '--test-batch-observe',
      ], {
        cwd: fixture,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          GOVERNANCE_READ_ONLY: '1',
          GOVERNANCE_TEST_BATCH_MODE: mode,
          GOVERNANCE_TEST_BATCH_LIVE_ROOT: fixture,
          GOVERNANCE_TEST_BATCH_ORDER_LOG: orderLog,
          GOVERNANCE_TEST_BATCH_EXPECTED_LENGTH: String(largeAfterImage.length),
          ...(options.extraEnvironment || {}),
        },
        input: options.rawInput ?? `${JSON.stringify(invocationPayload)}\n`,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      })
      : spawnSync(process.execPath, [
        '--',
        'scripts/run-provider-hook.mjs',
        '--provider',
        'claude',
        '--event',
        'PreToolUse',
        '--group',
        options.group ?? '0',
        '--test-batch-observe',
      ], {
        cwd: fixture,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          GOVERNANCE_READ_ONLY: '1',
          GOVERNANCE_TEST_BATCH_MODE: mode,
          GOVERNANCE_TEST_BATCH_LIVE_ROOT: fixture,
          GOVERNANCE_TEST_BATCH_ORDER_LOG: orderLog,
          GOVERNANCE_TEST_BATCH_EXPECTED_LENGTH: String(largeAfterImage.length),
          ...(options.extraEnvironment || {}),
        },
        input: options.rawInput ?? `${JSON.stringify(invocationPayload)}\n`,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      })
    return { result, order: await readFile(orderLog, 'utf8') }
  }

  const clean = await run('clean')
  assert.equal(clean.result.status, 0, clean.result.stderr)
  assert.deepEqual(
    JSON.parse(clean.result.stdout).hookSpecificOutput,
    { hookEventName: 'PreToolUse', additionalContext: 'ctx-a\n\nctx-b' },
  )
  assert.equal(
    clean.order,
    'context-a\ncontext-a\ngate\ngate\ncontext-b\ncontext-b\n',
  )
  assert.equal((clean.result.stderr.match(/batch test probe:normalized:/g) || []).length, 1)
  assert.equal((clean.result.stderr.match(/batch test probe:materialized:/g) || []).length, 1)
  assert.equal((clean.result.stderr.match(/batch test probe:invoke:/g) || []).length, 6)

  const policy = await run('policy')
  assert.equal(policy.result.status, 2)
  assert.equal(policy.result.stdout, '')
  assert.match(policy.result.stderr, /fixture policy denial/)
  assert.doesNotMatch(policy.result.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.equal(policy.order, 'context-a\ncontext-a\ngate\n')

  const invalidUtf8 = await run('invalid-utf8')
  assert.equal(invalidUtf8.result.status, 70)
  assert.equal(invalidUtf8.result.stdout, '')
  assert.match(invalidUtf8.result.stderr, /GOVERNANCE_INTEGRITY:.*stdout is not strict UTF-8/)
  assert.equal(invalidUtf8.order, 'context-a\ncontext-a\ngate\n')

  const invalidStderrUtf8 = await run('invalid-stderr-utf8')
  assert.equal(invalidStderrUtf8.result.status, 70)
  assert.equal(invalidStderrUtf8.result.stdout, '')
  assert.match(invalidStderrUtf8.result.stderr, /GOVERNANCE_INTEGRITY:.*stderr is not strict UTF-8/)
  assert.equal(invalidStderrUtf8.order, 'context-a\ncontext-a\ngate\n')

  const invalidJson = await run('clean', { rawInput: '{"broken":\n' })
  assert.equal(invalidJson.result.status, 70)
  assert.equal(invalidJson.result.stdout, '')
  assert.match(invalidJson.result.stderr, /GOVERNANCE_INTEGRITY:.*invalid JSON payload/)
  assert.equal(invalidJson.order, '')

  const escapedPath = await run('clean', {
    payload: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '../outside.txt', old_string: 'alpha', new_string: 'bravo' },
    },
  })
  assert.equal(escapedPath.result.status, 70)
  assert.match(escapedPath.result.stderr, /GOVERNANCE_INTEGRITY:.*changed path escapes repository root/)
  assert.equal(escapedPath.order, '')

  const materializationFailure = await run('clean', {
    payload: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'sample-a.txt', old_string: 'not-present', new_string: 'bravo' },
    },
  })
  assert.equal(materializationFailure.result.status, 70)
  assert.match(materializationFailure.result.stderr, /GOVERNANCE_INTEGRITY:.*PROPOSED_TEXT_MATERIALIZATION_FAILED/)
  assert.equal(materializationFailure.order, '')

  const denseReplacement = await run('clean', {
    constrainedHeap: true,
    payload: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: 'dense-replace.txt',
        old_string: 'x',
        new_string: 'z'.repeat(1024 * 1024),
        replace_all: true,
      },
    },
  })
  assert.equal(denseReplacement.result.status, 70)
  assert.match(denseReplacement.result.stderr, /PROPOSED_TEXT_MATERIALIZATION_FAILED:TEXT_TOO_LARGE/)
  assert.equal(denseReplacement.order, '')

  const oversizedChildPayload = await run('clean', {
    group: '2',
    payload: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: {
        command: 'q'.repeat((16 * 1024 * 1024) + 1),
      },
    },
  })
  assert.equal(oversizedChildPayload.result.status, 70)
  assert.match(oversizedChildPayload.result.stderr, /GOVERNANCE_INTEGRITY:.*child input exceeds 16777216 bytes/)
  assert.equal(oversizedChildPayload.order, '')

  const constrainedPathCount = 72
  const constrainedPayload = {
    hook_event_name: 'PreToolUse',
    tool_name: 'MultiEdit',
    shared_metadata: 'z'.repeat(1024 * 1024),
    tool_input: {
      edits: Array.from({ length: constrainedPathCount }, (_, index) => ({
        file_path: `memory-${String(index).padStart(3, '0')}.txt`,
        old_string: 'alpha',
        new_string: `bravo-${index}`,
      })),
    },
  }
  const constrained = await run('clean', {
    group: '1',
    payload: constrainedPayload,
    constrainedHeap: true,
  })
  assert.equal(constrained.result.status, 0, constrained.result.stderr)
  assert.equal(constrained.result.stdout, '')
  assert.equal(constrained.order, '')
  assert.equal((constrained.result.stderr.match(/batch test probe:normalized:/g) || []).length, 1)
  assert.equal((constrained.result.stderr.match(/batch test probe:materialized:/g) || []).length, 0)
  assert.equal((constrained.result.stderr.match(/batch test probe:invoke:/g) || []).length, constrainedPathCount)
  const serializedSizes = [...constrained.result.stderr.matchAll(/batch test probe:serialized:[^:]+:[^:]+:(\d+)/g)]
    .map((match) => Number(match[1]))
  assert.equal(serializedSizes.length, constrainedPathCount)
  assert.equal(serializedSizes.every((size) => size < 2048), true)
  assert.equal(Math.max(...serializedSizes) - Math.min(...serializedSizes) < 128, true)

  const bashPayload = {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'true' },
  }
  const launchAsync = ({ group, payload: asyncPayload = bashPayload, extraArguments = [], extraEnvironment = {} }) => {
    const child = spawn(process.execPath, [
      '--',
      'scripts/run-provider-hook.mjs',
      '--provider',
      'claude',
      '--event',
      'PreToolUse',
      '--group',
      String(group),
      ...extraArguments,
    ], {
      cwd: fixture,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        GOVERNANCE_READ_ONLY: '1',
        GOVERNANCE_TEST_BATCH_LIVE_ROOT: fixture,
        GOVERNANCE_TEST_BATCH_ORDER_LOG: orderLog,
        ...extraEnvironment,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.stdin.end(`${JSON.stringify(asyncPayload)}\n`)
    const completion = new Promise((accept) => {
      child.once('close', (status, signal) => accept({
        signal,
        status,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }))
    })
    return { child, completion, stderr }
  }

  const bashHookBefore = await readFile(bashSnapshotHook, 'utf8')
  const bashHelperBefore = await readFile(bashSnapshotHelper, 'utf8')
  const snapshotInvocation = launchAsync({
    group: 3,
    extraArguments: ['--test-hook-corpus-snapshot-probe'],
  })
  let snapshotProbe = ''
  await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('hook corpus snapshot probe timed out')), 3000)
    const inspect = () => {
      snapshotProbe = Buffer.concat(snapshotInvocation.stderr).toString('utf8')
      if (!snapshotProbe.includes('HOOK_CORPUS_SNAPSHOT_READY:')) return
      clearTimeout(timer)
      accept()
    }
    snapshotInvocation.child.stderr.on('data', inspect)
    inspect()
  })
  try {
    await writeFile(bashSnapshotHook, 'printf "GOVERNANCE_INTEGRITY: live hook replacement executed\\n" >&2; exit 70\n')
    await writeFile(bashSnapshotHelper, 'printf "GOVERNANCE_INTEGRITY: live helper replacement sourced\\n" >&2; exit 70\n')
    assert.equal(snapshotInvocation.child.kill('SIGUSR1'), true)
    const snapshotResult = await snapshotInvocation.completion
    assert.equal(snapshotResult.status, 0, snapshotResult.stderr)
    assert.deepEqual(
      JSON.parse(snapshotResult.stdout).hookSpecificOutput,
      { hookEventName: 'PreToolUse', additionalContext: 'bash-snapshot-ok' },
    )
  } finally {
    await writeFile(bashSnapshotHook, bashHookBefore)
    await writeFile(bashSnapshotHelper, bashHelperBefore)
  }

  const pythonSnapshot = await run('clean', { group: '4', payload: bashPayload })
  assert.equal(pythonSnapshot.result.status, 0, pythonSnapshot.result.stderr)
  assert.deepEqual(
    JSON.parse(pythonSnapshot.result.stdout).hookSpecificOutput,
    { hookEventName: 'PreToolUse', additionalContext: 'python-snapshot-ok' },
  )

  const changedFileLimit = await run('clean', {
    group: '1',
    payload: {
      hook_event_name: 'PreToolUse',
      tool_name: 'MultiEdit',
      tool_input: {
        edits: Array.from({ length: 257 }, (_, index) => ({
          file_path: `changed-limit-${index}.txt`,
          old_string: 'a',
          new_string: 'b',
        })),
      },
    },
  })
  assert.equal(changedFileLimit.result.status, 70)
  assert.match(changedFileLimit.result.stderr, /changed-file count exceeds 256/)

  const descriptorLimit = await run('clean', { group: '6', payload: bashPayload })
  assert.equal(descriptorLimit.result.status, 70)
  assert.match(descriptorLimit.result.stderr, /descriptor count exceeds 64/)

  const invocationLimit = await run('clean', {
    group: '7',
    payload: {
      hook_event_name: 'PreToolUse',
      tool_name: 'MultiEdit',
      tool_input: {
        edits: Array.from({ length: 205 }, (_, index) => ({
          file_path: `invocation-limit-${index}.txt`,
          old_string: 'a',
          new_string: 'b',
        })),
      },
    },
  })
  assert.equal(invocationLimit.result.status, 70)
  assert.match(invocationLimit.result.stderr, /invocation count exceeds 1024/)

  const afterImagePaths = ['after-image-limit-a.txt', 'after-image-limit-b.txt']
  for (const path of afterImagePaths) {
    await writeFile(resolve(fixture, path), `${'a'.repeat(9 * 1024 * 1024)}needle`)
  }
  const afterImageLimit = await run('clean', {
    constrainedHeap: true,
    payload: {
      hook_event_name: 'PreToolUse',
      tool_name: 'MultiEdit',
      tool_input: {
        edits: afterImagePaths.map((file_path) => ({
          file_path,
          old_string: 'needle',
          new_string: 'replacement',
        })),
      },
    },
  })
  assert.equal(afterImageLimit.result.status, 70)
  assert.match(afterImageLimit.result.stderr, /proposed after-image bytes exceed 16777216/)

  const aggregateOutputLimit = await run('clean', { group: '8', payload: bashPayload })
  assert.equal(aggregateOutputLimit.result.status, 70)
  assert.match(aggregateOutputLimit.result.stderr, /aggregate child output exceeds 8388608 bytes/)

  const largeContext = await run('clean', { group: '10', payload: bashPayload })
  assert.equal(largeContext.result.status, 0, largeContext.result.stderr)
  assert.equal(
    JSON.parse(largeContext.result.stdout).hookSpecificOutput.additionalContext,
    'z'.repeat(256 * 1024),
    'provider JSON must be fully flushed before the clean exit',
  )

  const cleanDescendantLog = resolve(fixture, 'clean-descendant.log')
  let cleanDescendantPid = 0
  t.after(() => {
    if (!cleanDescendantPid) return
    try { process.kill(cleanDescendantPid, 'SIGKILL') } catch {}
  })
  const cleanParent = await run('clean', {
    group: '11',
    payload: bashPayload,
    extraEnvironment: { GOVERNANCE_TEST_BATCH_CLEAN_DESCENDANT_LOG: cleanDescendantLog },
  })
  assert.equal(cleanParent.result.status, 0, cleanParent.result.stderr)
  cleanDescendantPid = Number((await readFile(cleanDescendantLog, 'utf8')).trim())
  assert.equal(Number.isSafeInteger(cleanDescendantPid) && cleanDescendantPid > 0, true)
  let cleanDescendantAlive = true
  const cleanDescendantDeadline = Date.now() + 1500
  while (Date.now() < cleanDescendantDeadline) {
    try {
      process.kill(cleanDescendantPid, 0)
    } catch (error) {
      if (error.code === 'ESRCH') {
        cleanDescendantAlive = false
        break
      }
    }
    await new Promise((accept) => setTimeout(accept, 20))
  }
  assert.equal(cleanDescendantAlive, false, 'a clean hook parent must not leave its process-group descendants alive')
  cleanDescendantPid = 0

  const transcriptMutation = resolve(fixture, 'batch-transcript-mutation.jsonl')
  await writeFile(transcriptMutation, '{"type":"user","message":{"role":"user","content":"safe"}}\n')
  const transcriptMutationResult = spawnSync(process.execPath, [
    '--',
    'scripts/run-provider-hook.mjs',
    '--provider',
    'claude',
    '--event',
    'UserPromptSubmit',
    '--group',
    '0',
  ], {
    cwd: fixture,
    env: {
      ...process.env,
      GOVERNANCE_READ_ONLY: '1',
    },
    input: `${JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'safe prompt',
      transcript_path: transcriptMutation,
    })}\n`,
    encoding: 'utf8',
  })
  assert.equal(transcriptMutationResult.status, 70)
  assert.match(transcriptMutationResult.stderr, /TRANSCRIPT_SNAPSHOT_CHANGED/)

  const shortDeadline = launchAsync({
    group: 9,
    extraArguments: ['--test-short-batch-runtime'],
  })
  const deadlineStartedAt = Date.now()
  const deadlineResult = await shortDeadline.completion
  assert.equal(deadlineResult.status, 70)
  assert.match(deadlineResult.stderr, /provider hook batch exceeded 750ms/)
  assert.ok(Date.now() - deadlineStartedAt < 3000, 'overall batch deadline must terminate the active child promptly')

  const signalLog = resolve(fixture, 'signal-tree.log')
  const signalInvocation = launchAsync({
    group: 5,
    extraEnvironment: { GOVERNANCE_TEST_BATCH_SIGNAL_LOG: signalLog },
  })
  let signalRows = []
  const signalReadyDeadline = Date.now() + 3000
  while (Date.now() < signalReadyDeadline) {
    try {
      signalRows = (await readFile(signalLog, 'utf8')).trim().split('\n')
      if (signalRows.length === 3) break
    } catch {}
    await new Promise((accept) => setTimeout(accept, 20))
  }
  assert.equal(signalRows.length, 3, 'signal fixture must expose hook paths and descendant pid')
  assert.equal(signalRows[0], signalRows[1], '$0 and BASH_SOURCE must identify the exact snapshot hook')
  assert.doesNotMatch(signalRows[0], new RegExp(`^${fixture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  const snapshotSuffix = '/packages/design-system/ds-canonical/hooks/batch-signal-tree.sh'
  assert.equal(signalRows[0].endsWith(snapshotSuffix), true)
  const signalSnapshotRoot = signalRows[0].slice(0, -snapshotSuffix.length)
  const descendantPid = Number(signalRows[2])
  assert.equal(Number.isSafeInteger(descendantPid) && descendantPid > 0, true)
  const signalStartedAt = Date.now()
  assert.equal(signalInvocation.child.kill('SIGTERM'), true)
  const signalResult = await signalInvocation.completion
  assert.deepEqual({ signal: signalResult.signal, status: signalResult.status }, { signal: null, status: 143 }, signalResult.stderr)
  assert.ok(Date.now() - signalStartedAt < 2000, 'signal cleanup must remain bounded')
  await assert.rejects(lstat(signalSnapshotRoot), /ENOENT/)
  let descendantAlive = true
  const descendantDeadline = Date.now() + 1500
  while (Date.now() < descendantDeadline) {
    try {
      process.kill(descendantPid, 0)
    } catch (error) {
      if (error.code === 'ESRCH') {
        descendantAlive = false
        break
      }
    }
    await new Promise((accept) => setTimeout(accept, 20))
  }
  assert.equal(descendantAlive, false, 'SIGTERM cleanup must terminate the entire active child process group')

  const runnerSource = await readFile(runner, 'utf8')
  assert.doesNotMatch(runnerSource, /serializedPayloads|payloadCacheKey/)
})

test('tested transcript contracts require closed bounded-tail access while Codex remains opaque', () => {
  const claude = PROVIDER_REGISTRY.providers.find((provider) => provider.id === 'claude')
  assert.deepEqual(claude.runtime.transcript.access, {
    strategy: 'validated-jsonl-tail-v2',
    pathPolicy: 'canonical-unique-regular-file-no-name-assumption',
    recordFormat: 'json-lines',
    emptyState: 'allowed-zero-byte',
    maximumRetainedRecordCount: 1200,
    maximumRecordBytes: 4194304,
    maximumMaterializedBytes: 16777216,
  })
  assert.equal(PROVIDER_REGISTRY.providers.find((provider) => provider.id === 'codex').runtime.transcript.access, null)

  const missingAccess = structuredClone(PROVIDER_REGISTRY)
  delete missingAccess.providers.find((provider) => provider.id === 'claude').runtime.transcript.access
  assert.throws(() => validateProviderRegistryDocument(missingAccess), /committed JSON Schema/)

  const openAccess = structuredClone(PROVIDER_REGISTRY)
  openAccess.providers.find((provider) => provider.id === 'claude').runtime.transcript.access.unexpected = true
  assert.throws(() => validateProviderRegistryDocument(openAccess), /committed JSON Schema/)

  const unversionedAccess = structuredClone(PROVIDER_REGISTRY)
  unversionedAccess.providers.find((provider) => provider.id === 'codex').runtime.transcript.access =
    structuredClone(claude.runtime.transcript.access)
  assert.throws(() => validateProviderRegistryDocument(unversionedAccess), /unversioned transcript cannot expose/)

  const impossibleBudget = structuredClone(PROVIDER_REGISTRY)
  const access = impossibleBudget.providers.find((provider) => provider.id === 'claude').runtime.transcript.access
  access.maximumMaterializedBytes = 1048576
  assert.throws(() => validateProviderRegistryDocument(impossibleBudget), /bounded validated-tail access/)

  const missingDelimiterBudget = structuredClone(PROVIDER_REGISTRY)
  const delimiterAccess = missingDelimiterBudget.providers.find((provider) => provider.id === 'claude').runtime.transcript.access
  delimiterAccess.maximumMaterializedBytes = delimiterAccess.maximumRecordBytes
  assert.throws(
    () => validateProviderRegistryDocument(missingDelimiterBudget),
    /bounded validated-tail access/,
    'the snapshot budget must own one normalized LF in addition to the maximum JSON body',
  )
  delimiterAccess.maximumMaterializedBytes += 1
  assert.doesNotThrow(() => validateProviderRegistryDocument(missingDelimiterBudget))
})

test('provider policy blocking codes cannot reuse reserved integrity exit code 70', () => {
  const invalid = structuredClone(PROVIDER_REGISTRY)
  invalid.providers.find((provider) => provider.id === 'claude').blockingExitCode = 70
  assert.throws(
    () => validateProviderRegistryDocument(structuredClone(invalid)),
    /committed JSON Schema/,
  )
  assert.throws(
    () => validateProviderRegistrySemantics(structuredClone(invalid)),
    /must not reuse reserved governance integrity exit code 70/,
  )
})

test('consumer corpus readers pin the current provider registry schema version', async () => {
  const compatibilitySchema = JSON.parse(await readFile(
    resolve(repoRoot, 'infra/governance/schemas/compatibility-matrix.schema.json'),
    'utf8',
  ))
  assert.equal(
    compatibilitySchema.properties.adapterRegistry.properties.schemaVersion.const,
    PROVIDER_REGISTRY.schemaVersion,
    'compatibility matrix schema must accept exactly the current provider registry schema',
  )
  for (const path of ['scripts/governance-check.mjs', 'scripts/refresh-fork-launchers.mjs']) {
    const source = await readFile(resolve(repoRoot, path), 'utf8')
    assert.match(
      source,
      new RegExp(`providerRegistrySchemaVersion !== ${PROVIDER_REGISTRY.schemaVersion}\\b`),
      `${path} must reject fork manifests from a different provider registry schema`,
    )
    assert.doesNotMatch(source, /providerRegistrySchemaVersion !== 7\b/)
  }
})

test('provider payload environment aliases use the transport scrub convention in every validator', () => {
  const invalid = structuredClone(PROVIDER_REGISTRY)
  invalid.providers.find((provider) => provider.id === 'claude')
    .adapter.environmentMap.GOVERNANCE_TOOL_INPUT = 'UNSAFE_PAYLOAD'
  for (const validate of [validateProviderRegistryDocument, validateRuntimeProviderRegistry]) {
    assert.throws(
      () => validate(structuredClone(invalid)),
      /GOVERNANCE_TOOL_INPUT must use the \*_TOOL_INPUT payload alias convention/,
    )
  }
})

test('Claude hooks validate and materialize a bounded tail from large transcripts without weakening failures', async (t) => {
  const fixture = await mkdtemp(resolve(repoRoot, '.tmp-provider-transcript-'))
  const snapshotTemp = resolve(fixture, 'private-tmp')
  await mkdir(snapshotTemp, { mode: 0o700 })
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const runner = resolve(repoRoot, 'scripts/run-provider-hook.mjs')
  const runnerSource = await readFile(runner, 'utf8')
  assert.match(
    runnerSource,
    /openedIdentity\.size < pathBefore\.size/,
    'an lstat/open race may grow but may never truncate the transcript before the captured inode state',
  )
  const execute = (provider, hook, payload) => spawnSync(process.execPath, [
    '--',
    runner,
    '--provider',
    provider,
    '--hook',
    hook,
  ], {
    cwd: repoRoot,
    env: { ...process.env, GOVERNANCE_READ_ONLY: '1', TMPDIR: snapshotTemp },
    input: `${JSON.stringify(payload)}\n`,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  })
  const launch = (provider, hook, payload, environment = {}, extraArguments = [], observeStderr = () => {}) => {
    const child = spawn(process.execPath, [
      '--',
      runner,
      '--provider',
      provider,
      '--hook',
      hook,
      ...extraArguments,
    ], {
      cwd: repoRoot,
      env: { ...process.env, GOVERNANCE_READ_ONLY: '1', TMPDIR: snapshotTemp, ...environment },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const completion = new Promise((resolveCompletion, rejectCompletion) => {
      child.once('error', rejectCompletion)
      child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      observeStderr(chunk)
    })
      child.once('close', (status, signal) => resolveCompletion({ status, signal, stdout, stderr }))
    })
    child.stdin.end(`${JSON.stringify(payload)}\n`)
    return { child, completion }
  }
  const executeAsync = (provider, hook, payload, environment, extraArguments) =>
    launch(provider, hook, payload, environment, extraArguments).completion
  const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
  const run = (provider, prompt, transcriptPath) => execute(
    provider,
    'check_propose_without_benchmark.sh',
    {
      hook_event_name: 'UserPromptSubmit',
      prompt,
      ...(transcriptPath === undefined ? {} : { transcript_path: transcriptPath }),
    },
  )
  const runAsync = (provider, prompt, transcriptPath, environment, extraArguments) => executeAsync(
    provider,
    'check_propose_without_benchmark.sh',
    {
      hook_event_name: 'UserPromptSubmit',
      prompt,
      ...(transcriptPath === undefined ? {} : { transcript_path: transcriptPath }),
    },
    environment,
    extraArguments,
  )
  const assertSnapshotCleaned = async () => {
    const runnerResidue = (await readdir(snapshotTemp))
      .filter(name => /^governance-(?:hook-corpus|transcript-tail)-/.test(name))
      .sort()
    assert.deepEqual(
      runnerResidue,
      [],
      'validated runner-owned snapshots must be removed before the adapter exits',
    )
  }

  const largeTranscript = resolve(fixture, 'large-claude.jsonl')
  const largeHandle = await open(largeTranscript, 'w', 0o600)
  // Keep this sparse prefix above the 377.5 MB real-session regression that previously caused
  // every Claude UserPromptSubmit event to fail before the bounded-tail adapter could run.
  const unverifiedPrefixBytes = 384 * 1024 * 1024
  await largeHandle.truncate(unverifiedPrefixBytes)
  const record = `${JSON.stringify({
    type: 'system',
    message: { role: 'assistant', content: 'x'.repeat(8192) },
  })}\n`
  const recordBytes = Buffer.from(record)
  let position = unverifiedPrefixBytes
  for (let index = 0; index < 2600; index += 1) {
    const { bytesWritten } = await largeHandle.write(recordBytes, 0, recordBytes.length, position)
    assert.equal(bytesWritten, recordBytes.length)
    position += bytesWritten
  }
  const lastUser = Buffer.from(`${JSON.stringify({
    type: 'user',
    message: { role: 'user', content: 'Review the sidebar options.' },
  })}\n`)
  assert.equal((await largeHandle.write(lastUser, 0, lastUser.length, position)).bytesWritten, lastUser.length)
  await largeHandle.close()
  assert.equal((await lstat(largeTranscript)).size > 377 * 1024 * 1024, true)

  const ordinary = run('claude', 'Hi', largeTranscript)
  assert.equal(ordinary.status, 0, ordinary.stderr)
  assert.equal(ordinary.stdout, '')
  await assertSnapshotCleaned()

  const longPrompt = run('claude', 'x'.repeat(262144), largeTranscript)
  assert.equal(longPrompt.status, 0, longPrompt.stderr)
  assert.equal(longPrompt.stdout, '')
  await assertSnapshotCleaned()

  const triggered = run('claude', 'propose me 3 options for the sidebar', largeTranscript)
  assert.equal(triggered.status, 0, triggered.stderr)
  assert.match(JSON.parse(triggered.stdout).hookSpecificOutput.additionalContext, /M26 Propose-without-benchmark/)
  await assertSnapshotCleaned()

  const liveAppendTranscript = resolve(fixture, 'live-append.jsonl')
  await writeFile(liveAppendTranscript, record.repeat(2600), { mode: 0o600 })
  const liveAppendHandle = await open(liveAppendTranscript, 'a')
  let appendActive = true
  let appendCount = 0
  const appendLoop = (async () => {
    while (appendActive) {
      await liveAppendHandle.appendFile(`${JSON.stringify({ type: 'system', sequence: appendCount })}\n`)
      appendCount += 1
      await wait(1)
    }
  })()
  await wait(8)
  let liveAppendResult
  try {
    liveAppendResult = await runAsync('claude', 'Hi', liveAppendTranscript)
  } finally {
    appendActive = false
    await appendLoop
    await liveAppendHandle.close()
  }
  assert.equal(appendCount > 2, true, 'writer must append before open and throughout bounded verification')
  assert.equal(liveAppendResult.status, 70)
  assert.equal(liveAppendResult.stdout, '')
  assert.match(liveAppendResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(liveAppendResult.stderr, /TRANSCRIPT_CHANGED_DURING_VERIFICATION/)
  await assertSnapshotCleaned()

  const livePartialTranscript = resolve(fixture, 'live-partial.jsonl')
  await writeFile(
    livePartialTranscript,
    `${record.repeat(2600)}{"type":"system","message":{"role":"assistant","content":"`,
    { mode: 0o600 },
  )
  const livePartialHandle = await open(livePartialTranscript, 'a')
  let partialActive = true
  let partialAppendCount = 0
  const partialLoop = (async () => {
    while (partialActive) {
      await livePartialHandle.appendFile('x'.repeat(1024))
      partialAppendCount += 1
      await wait(1)
    }
  })()
  await wait(8)
  let livePartialResult
  try {
    livePartialResult = await runAsync('claude', 'Hi', livePartialTranscript)
  } finally {
    partialActive = false
    await partialLoop
    await livePartialHandle.close()
  }
  assert.equal(partialAppendCount > 2, true, 'partial record writer must remain active during verification')
  assert.equal(livePartialResult.status, 70)
  assert.equal(livePartialResult.stdout, '')
  assert.match(livePartialResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(livePartialResult.stderr, /TRANSCRIPT_CHANGED_DURING_VERIFICATION/)
  await assertSnapshotCleaned()

  const optionalAppendTranscript = resolve(fixture, 'optional-live-append.jsonl')
  const canonicalReadEvidence = `${JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'Read',
        input: { file_path: 'packages/design-system/src/components/Button/button.spec.md' },
      }],
    },
  })}\n`
  await writeFile(optionalAppendTranscript, `${record.repeat(2600)}${canonicalReadEvidence}`, { mode: 0o600 })
  const optionalAppendHandle = await open(optionalAppendTranscript, 'a')
  let optionalAppendActive = true
  let optionalAppendCount = 0
  const optionalAppendLoop = (async () => {
    while (optionalAppendActive) {
      await optionalAppendHandle.appendFile(`${JSON.stringify({ type: 'system', sequence: optionalAppendCount })}\n`)
      optionalAppendCount += 1
      await wait(1)
    }
  })()
  await wait(8)
  let optionalAppendResult
  try {
    optionalAppendResult = await executeAsync(
      'claude',
      'check_ds_anchor_preflight.sh',
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        transcript_path: optionalAppendTranscript,
        tool_input: {
          file_path: 'apps/template/src/App.tsx',
          old_string: 'export const changed = false',
          new_string: 'export const changed = <Button>Save</Button>',
        },
      },
      { NODE_ENV: 'test' },
      ['--test-transcript-transition-probe'],
    )
  } finally {
    optionalAppendActive = false
    await optionalAppendLoop
    await optionalAppendHandle.close()
  }
  assert.equal(optionalAppendCount > 2, true, 'optional transcript writer must remain active during verification')
  assert.equal(optionalAppendResult.status, 2)
  assert.equal(optionalAppendResult.stdout, '')
  assert.match(optionalAppendResult.stderr, /M29 DS Anchor Preflight/)
  await assertSnapshotCleaned()

  const delayedPartialTranscript = resolve(fixture, 'delayed-partial-completion.jsonl')
  await writeFile(
    delayedPartialTranscript,
    `${record.repeat(2600)}{"type":"system","message":{"role":"assistant","content":"`,
    { mode: 0o600 },
  )
  const delayedPartialHandle = await open(delayedPartialTranscript, 'a')
  let delayedPartialWrites = 0
  let writerCompletedAt = 0
  const delayedWriter = (async () => {
    while (delayedPartialWrites < 120) {
      await delayedPartialHandle.appendFile('x'.repeat(1024))
      delayedPartialWrites += 1
      await wait(1)
    }
    await delayedPartialHandle.appendFile('"}}\n')
    writerCompletedAt = Date.now()
    await delayedPartialHandle.close()
  })()
  const delayedRunner = runAsync('claude', 'Hi', delayedPartialTranscript)
  const delayedPartialResult = await delayedRunner
  const runnerCompletedAt = Date.now()
  await delayedWriter
  assert.equal(delayedPartialWrites, 120)
  assert.equal(writerCompletedAt <= runnerCompletedAt, true, 'delayed record must complete while the runner is live')
  assert.equal(delayedPartialResult.status, 0, delayedPartialResult.stderr)
  assert.equal(delayedPartialResult.stdout, '')
  await assertSnapshotCleaned()

  const blockedAfterSnapshot = execute('claude', 'check_substantive_edit_approval_preflight.sh', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    transcript_path: largeTranscript,
    tool_input: {
      file_path: 'apps/template/src/App.tsx',
      old_string: 'export const changed = false',
      new_string: 'export const changed = true',
    },
  })
  assert.equal(blockedAfterSnapshot.status, 2)
  assert.match(blockedAfterSnapshot.stderr, /BLOCKER: Pre-action gate/)
  await assertSnapshotCleaned()

  const approvedToolInput = {
    file_path: 'apps/template/src/App.tsx',
    old_string: 'export const changed = false',
    new_string: 'export const changed = true',
  }
  const approvedAbsolutePath = resolve(repoRoot, approvedToolInput.file_path)
  // The approval binds the exact event-v1 child operation produced by the adapter, not the
  // provider-native request shape. Preserve the adapter's canonical insertion order as well as
  // its absolute path and single-copy proposed content projection.
  const approvedAdapterOperation = {
    path: approvedAbsolutePath,
    content: approvedToolInput.new_string,
    old_string: approvedToolInput.old_string,
    file_path: approvedAbsolutePath,
  }
  const approvedOperationSha256 = createHash('sha256')
    .update(JSON.stringify(approvedAdapterOperation))
    .digest('hex')
  const approvalPayload = (transcriptPath) => ({
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    transcript_path: transcriptPath,
    tool_input: approvedToolInput,
  })
  const approvedUserRecord = `${JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: `apps/template/src/App.tsx 的互動行為採用 changed = true 並請修改 App.tsx operation sha256:${approvedOperationSha256}`,
    },
  })}\n`
  const approvedTranscript = resolve(fixture, 'approved-before-withdrawal.jsonl')
  await writeFile(approvedTranscript, approvedUserRecord, { mode: 0o600 })
  const approvedResult = execute(
    'claude',
    'check_substantive_edit_approval_preflight.sh',
    approvalPayload(approvedTranscript),
  )
  assert.equal(approvedResult.status, 0, approvedResult.stderr)
  assert.equal(approvedResult.stdout, '')
  await assertSnapshotCleaned()

  const withdrawalHandle = await open(approvedTranscript, 'a')
  let withdrawalProbeOutput = ''
  let withdrawalMutation
  const withdrawalInvocation = launch(
    'claude',
    'check_substantive_edit_approval_preflight.sh',
    approvalPayload(approvedTranscript),
    { NODE_ENV: 'test' },
    ['--test-transcript-transition-probe'],
    (chunk) => {
      withdrawalProbeOutput += chunk
      if (withdrawalMutation || !withdrawalProbeOutput.includes('TRANSCRIPT_TEST_TRANSITION_PROBE_READY')) return
      withdrawalMutation = withdrawalHandle.appendFile(`${JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'do not modify apps/template/src/App.tsx' },
      })}\n`)
    },
  )
  const withdrawalResult = await withdrawalInvocation.completion
  if (withdrawalMutation) await withdrawalMutation
  await withdrawalHandle.close()
  assert.ok(withdrawalMutation, 'runner must expose one deterministic complete-append transition')
  assert.equal(withdrawalResult.status, 2)
  assert.match(withdrawalResult.stderr, /BLOCKER: Pre-action gate/)
  assert.match(withdrawalResult.stderr, /TARGET_BOUND_DENIAL_OR_REVOCATION/)
  await assertSnapshotCleaned()

  const prunedApprovalTranscript = resolve(fixture, 'approval-pruned-by-record-budget.jsonl')
  const postApprovalRecords = Array.from({ length: 1200 }, (_, index) =>
    `${JSON.stringify({ type: 'system', sequence: index })}\n`).join('')
  await writeFile(prunedApprovalTranscript, `${approvedUserRecord}${postApprovalRecords}`, { mode: 0o600 })
  const prunedApprovalResult = execute(
    'claude',
    'check_substantive_edit_approval_preflight.sh',
    approvalPayload(prunedApprovalTranscript),
  )
  assert.equal(prunedApprovalResult.status, 2)
  assert.match(prunedApprovalResult.stderr, /BLOCKER: Pre-action gate/)
  await assertSnapshotCleaned()

  const emptyTranscript = resolve(fixture, 'empty.jsonl')
  await writeFile(emptyTranscript, '', { mode: 0o600 })
  const emptyOrdinary = run('claude', 'Hi', emptyTranscript)
  assert.equal(emptyOrdinary.status, 0, emptyOrdinary.stderr)
  assert.equal(emptyOrdinary.stdout, '')
  const emptyTriggered = run('claude', 'propose me 3 options for the sidebar', emptyTranscript)
  assert.equal(emptyTriggered.status, 0, emptyTriggered.stderr)
  assert.match(JSON.parse(emptyTriggered.stdout).hookSpecificOutput.additionalContext, /M26 Propose-without-benchmark/)
  await assertSnapshotCleaned()

  const crlfTranscript = resolve(fixture, 'crlf.jsonl')
  await writeFile(
    crlfTranscript,
    `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'one' } })}\r\n`
      + `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'two' } })}\r\n`,
    { mode: 0o600 },
  )
  const crlfResult = run('claude', 'Hi', crlfTranscript)
  assert.equal(crlfResult.status, 0, crlfResult.stderr)
  assert.equal(crlfResult.stdout, '')

  const maximumRecordBytes = 4194304
  const maximumMaterializedBytes = 16777216
  const exactPrefix = '{"type":"system","padding":"'
  const exactSuffix = '"}'
  const exactBodyBytes = maximumRecordBytes - 1
  const exactPaddingBytes = exactBodyBytes - Buffer.byteLength(exactPrefix) - Buffer.byteLength(exactSuffix)
  const exactBody = `${exactPrefix}${'x'.repeat(exactPaddingBytes)}${exactSuffix}`
  assert.equal(Buffer.byteLength(exactBody), exactBodyBytes)
  const exactBudgetTranscript = resolve(fixture, 'exact-materialization-budget.jsonl')
  await writeFile(exactBudgetTranscript, `${exactBody}\n`.repeat(4), { mode: 0o600 })
  assert.equal((await lstat(exactBudgetTranscript)).size, maximumMaterializedBytes)
  const exactBudgetResult = run('claude', 'Hi', exactBudgetTranscript)
  assert.equal(exactBudgetResult.status, 0, exactBudgetResult.stderr)
  assert.equal(exactBudgetResult.stdout, '')
  await assertSnapshotCleaned()

  const malformed = resolve(fixture, 'malformed.jsonl')
  await writeFile(malformed, '{"type":"user","message":{"role":"user","content":"ok"}}\n{"broken":', { mode: 0o600 })
  const malformedResult = run('claude', 'Hi', malformed)
  assert.equal(malformedResult.status, 70)
  assert.match(malformedResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(malformedResult.stderr, /TRANSCRIPT_JSONL_INVALID/)

  const completeMalformed = resolve(fixture, 'complete-malformed.jsonl')
  await writeFile(completeMalformed, '{"type":"user"}\n{"broken":\n', { mode: 0o600 })
  const completeMalformedResult = run('claude', 'Hi', completeMalformed)
  assert.equal(completeMalformedResult.status, 70)
  assert.match(completeMalformedResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(completeMalformedResult.stderr, /TRANSCRIPT_JSONL_INVALID/)

  const fewerLargeRecords = resolve(fixture, 'fewer-large-records.jsonl')
  const fewerLargeHandle = await open(fewerLargeRecords, 'w', 0o600)
  const largeValidRecord = Buffer.from(`${JSON.stringify({
    type: 'system',
    message: { role: 'assistant', content: 'x'.repeat(2 * 1024 * 1024) },
  })}\n`)
  for (let index = 0; index < 9; index += 1) {
    assert.equal(
      (await fewerLargeHandle.write(largeValidRecord, 0, largeValidRecord.length)).bytesWritten,
      largeValidRecord.length,
    )
  }
  await fewerLargeHandle.close()
  const fewerLargeResult = run('claude', 'Hi', fewerLargeRecords)
  assert.equal(fewerLargeResult.status, 0, fewerLargeResult.stderr)
  assert.equal(fewerLargeResult.stdout, '')
  await assertSnapshotCleaned()

  const oversized = resolve(fixture, 'oversized-record.jsonl')
  await writeFile(oversized, `${JSON.stringify({ type: 'system', padding: 'x'.repeat(4194304) })}\n`, { mode: 0o600 })
  const oversizedResult = run('claude', 'Hi', oversized)
  assert.equal(oversizedResult.status, 70)
  assert.match(oversizedResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(oversizedResult.stderr, /TRANSCRIPT_RECORD_TOO_LARGE/)

  const rewriteTranscript = resolve(fixture, 'rewrite-plus-append.jsonl')
  await writeFile(rewriteTranscript, record.repeat(2600), { mode: 0o600 })
  const rewriteHandle = await open(rewriteTranscript, 'r+')
  const rewriteAppendHandle = await open(rewriteTranscript, 'a')
  const rewriteOffset = (Buffer.byteLength(record) * 2500) + record.indexOf('xxx')
  let rewriteCount = 0
  let rewriteProbeOutput = ''
  let rewriteMutation
  const rewriteInvocation = launch(
    'claude',
    'check_propose_without_benchmark.sh',
    {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Hi',
      transcript_path: rewriteTranscript,
    },
    { NODE_ENV: 'test' },
    ['--test-transcript-transition-probe'],
    (chunk) => {
      rewriteProbeOutput += chunk
      if (rewriteMutation || !rewriteProbeOutput.includes('TRANSCRIPT_TEST_TRANSITION_PROBE_READY')) return
      rewriteMutation = (async () => {
        const replacement = Buffer.from('y')
        assert.equal(
          (await rewriteHandle.write(replacement, 0, replacement.length, rewriteOffset)).bytesWritten,
          replacement.length,
        )
        await rewriteAppendHandle.appendFile(`${JSON.stringify({ type: 'system', append: rewriteCount })}\n`)
        rewriteCount += 1
      })()
    },
  )
  let rewriteResult
  try {
    rewriteResult = await rewriteInvocation.completion
    if (rewriteMutation) await rewriteMutation
  } finally {
    await rewriteHandle.close()
    await rewriteAppendHandle.close()
  }
  assert.ok(rewriteMutation, 'runner must expose the bounded test transition point')
  assert.equal(rewriteCount, 1, 'one observed rewrite-plus-append transition is sufficient')
  assert.equal(rewriteResult.status, 70)
  assert.match(rewriteResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(rewriteResult.stderr, /TRANSCRIPT_CHANGED_DURING_VERIFICATION/)

  const unfulfilledProbeResult = await runAsync(
    'claude',
    'Hi',
    rewriteTranscript,
    { NODE_ENV: 'test' },
    ['--test-transcript-transition-probe'],
  )
  assert.equal(unfulfilledProbeResult.status, 70)
  assert.match(unfulfilledProbeResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(
    unfulfilledProbeResult.stderr,
    /TRANSCRIPT_TEST_TRANSITION_NOT_OBSERVED|TRANSCRIPT_CHANGED_DURING_VERIFICATION/,
    'an unfulfilled probe must fail closed whether the backing filesystem stays still or reports a real metadata transition',
  )

  const truncateTranscript = resolve(fixture, 'truncate-during-verification.jsonl')
  const truncateBody = record.repeat(2600)
  await writeFile(truncateTranscript, truncateBody, { mode: 0o600 })
  const truncateBaseBytes = Buffer.byteLength(truncateBody)
  const truncateHandle = await open(truncateTranscript, 'r+')
  let truncateProbeOutput = ''
  let truncateMutation
  const truncateInvocation = launch(
    'claude',
    'check_propose_without_benchmark.sh',
    {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Hi',
      transcript_path: truncateTranscript,
    },
    { NODE_ENV: 'test' },
    ['--test-transcript-transition-probe'],
    (chunk) => {
      truncateProbeOutput += chunk
      if (truncateMutation || !truncateProbeOutput.includes('TRANSCRIPT_TEST_TRANSITION_PROBE_READY')) return
      truncateMutation = truncateHandle.truncate(truncateBaseBytes - 1)
    },
  )
  let truncateResult
  try {
    truncateResult = await truncateInvocation.completion
    if (truncateMutation) await truncateMutation
  } finally {
    await truncateHandle.close()
  }
  assert.ok(truncateMutation, 'runner must expose the bounded test transition point')
  assert.equal(truncateResult.status, 70)
  assert.match(truncateResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(truncateResult.stderr, /TRANSCRIPT_CHANGED_DURING_VERIFICATION/)

  const substituteTranscript = resolve(fixture, 'substitute-during-verification.jsonl')
  const substituteReplacement = resolve(fixture, 'substitute-replacement.jsonl')
  const substituteSwap = resolve(fixture, 'substitute-swap.jsonl')
  await writeFile(substituteTranscript, record.repeat(2600), { mode: 0o600 })
  await writeFile(substituteReplacement, record.repeat(2600), { mode: 0o600 })
  let substituteProbeOutput = ''
  let substituteMutation
  const substituteInvocation = launch(
    'claude',
    'check_propose_without_benchmark.sh',
    {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Hi',
      transcript_path: substituteTranscript,
    },
    { NODE_ENV: 'test' },
    ['--test-transcript-transition-probe'],
    (chunk) => {
      substituteProbeOutput += chunk
      if (substituteMutation || !substituteProbeOutput.includes('TRANSCRIPT_TEST_TRANSITION_PROBE_READY')) return
      substituteMutation = (async () => {
        await rename(substituteTranscript, substituteSwap)
        await rename(substituteReplacement, substituteTranscript)
      })()
    },
  )
  const substituteResult = await substituteInvocation.completion
  if (substituteMutation) await substituteMutation
  assert.ok(substituteMutation, 'runner must expose the bounded test transition point')
  assert.equal(substituteResult.status, 70)
  assert.match(substituteResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(substituteResult.stderr, /TRANSCRIPT_(?:CHANGED_DURING_VERIFICATION|UNVERIFIED|NOT_UNIQUE_REGULAR_FILE)/)

  const providerNamedTranscript = resolve(fixture, 'provider-owned-session-name')
  await writeFile(providerNamedTranscript, '{"type":"user"}\n', { mode: 0o600 })
  const providerNamedResult = run('claude', 'Hi', providerNamedTranscript)
  assert.equal(providerNamedResult.status, 0, providerNamedResult.stderr)
  assert.equal(providerNamedResult.stdout, '')

  const screenshotRegression = spawnSync(process.execPath, [
    '--',
    runner,
    '--provider',
    'claude',
    '--event',
    'UserPromptSubmit',
    '--group',
    '0',
  ], {
    cwd: repoRoot,
    env: { ...process.env, GOVERNANCE_READ_ONLY: '1', TMPDIR: snapshotTemp },
    input: `${JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'hi',
      transcript_path: providerNamedTranscript,
    })}\n`,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  })
  assert.equal(screenshotRegression.status, 0, screenshotRegression.stderr)

  const providerNamedMalformed = resolve(fixture, 'provider-owned-malformed-name.txt')
  await writeFile(providerNamedMalformed, '{"type":}\n', { mode: 0o600 })
  const providerNamedMalformedResult = run('claude', 'Hi', providerNamedMalformed)
  assert.equal(providerNamedMalformedResult.status, 70)
  assert.match(providerNamedMalformedResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(providerNamedMalformedResult.stderr, /TRANSCRIPT_JSONL_INVALID/)

  const symlinked = resolve(fixture, 'symlinked.jsonl')
  await symlink(providerNamedTranscript, symlinked)
  const symlinkResult = run('claude', 'Hi', symlinked)
  assert.equal(symlinkResult.status, 70)
  assert.match(symlinkResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(symlinkResult.stderr, /TRANSCRIPT_NOT_UNIQUE_REGULAR_FILE/)

  const hardlinkSource = resolve(fixture, 'hardlink-source.jsonl')
  const hardlinkAlias = resolve(fixture, 'hardlink-alias.jsonl')
  await writeFile(hardlinkSource, '{"type":"user"}\n', { mode: 0o600 })
  await link(hardlinkSource, hardlinkAlias)
  const hardlinkResult = run('claude', 'Hi', hardlinkSource)
  assert.equal(hardlinkResult.status, 70)
  assert.match(hardlinkResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(hardlinkResult.stderr, /TRANSCRIPT_NOT_UNIQUE_REGULAR_FILE/)

  const transcriptDirectory = resolve(fixture, 'transcript-directory')
  await mkdir(transcriptDirectory)
  const directoryResult = run('claude', 'Hi', transcriptDirectory)
  assert.equal(directoryResult.status, 70)
  assert.match(directoryResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(directoryResult.stderr, /TRANSCRIPT_NOT_UNIQUE_REGULAR_FILE/)

  const transcriptFifo = resolve(fixture, 'transcript-fifo')
  const fifoCreation = spawnSync('mkfifo', [transcriptFifo], { encoding: 'utf8' })
  assert.equal(fifoCreation.status, 0, fifoCreation.stderr)
  const fifoResult = run('claude', 'Hi', transcriptFifo)
  assert.equal(fifoResult.status, 70)
  assert.match(fifoResult.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(fifoResult.stderr, /TRANSCRIPT_NOT_UNIQUE_REGULAR_FILE/)

  let signalInvocation
  let signalProbeOutput = ''
  let signalDelivered = false
  signalInvocation = launch(
    'claude',
    'check_propose_without_benchmark.sh',
    {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'signal cleanup probe',
      transcript_path: largeTranscript,
    },
    { NODE_ENV: 'test' },
    ['--test-transcript-snapshot-signal-probe'],
    (chunk) => {
      signalProbeOutput += chunk
      if (!signalDelivered && signalProbeOutput.includes('TRANSCRIPT_TEST_SNAPSHOT_SIGNAL_READY')) {
        signalDelivered = signalInvocation.child.kill('SIGTERM')
      }
    },
  )
  const signalResult = await signalInvocation.completion
  assert.match(signalProbeOutput, /TRANSCRIPT_TEST_SNAPSHOT_SIGNAL_READY/)
  assert.equal(signalDelivered, true)
  assert.notEqual(signalResult.status, 0)
  await wait(20)
  await assertSnapshotCleaned()

  const codexWithTranscript = run('codex', 'Hi', largeTranscript)
  assert.equal(codexWithTranscript.status, 70)
  assert.match(codexWithTranscript.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(codexWithTranscript.stderr, /STABLE_TRANSCRIPT_CONTRACT_UNAVAILABLE/)
  const codexWithoutTranscript = run('codex', 'Hi')
  assert.equal(codexWithoutTranscript.status, 70)
  assert.match(codexWithoutTranscript.stderr, /GOVERNANCE_INTEGRITY:/)
  assert.match(codexWithoutTranscript.stderr, /VERSIONED_TRANSCRIPT_REQUIRED/)
  await assertSnapshotCleaned()
})

test('runner classifies every contract bootstrap failure as integrity code 70 for both providers', async (t) => {
  const fixture = await mkdtemp(resolve(repoRoot, '.tmp-provider-runner-'))
  const external = await mkdtemp(resolve(repoRoot, '.tmp-provider-contract-external-'))
  t.after(() => Promise.all([rm(fixture, { recursive: true, force: true }), rm(external, { recursive: true, force: true })]))
  const copy = async (path) => {
    await mkdir(resolve(fixture, path, '..'), { recursive: true })
    await cp(resolve(repoRoot, path), resolve(fixture, path))
  }
  for (const path of [
    'scripts/run-provider-hook.mjs',
    'scripts/lib/canonical-path-containment.mjs',
    'scripts/lib/closed-tool-execution.mjs',
    'scripts/lib/provider-hook-output-transport.mjs',
    'packages/governance/src/closed-tool-execution.mjs',
    'packages/governance/src/canonical-order.mjs',
    'packages/governance/src/provider-hook-normalization.mjs',
    'scripts/lib/provider-contract-validation.mjs',
    'packages/governance/canonical/schemas/providers.schema.json',
    'packages/design-system/ds-canonical/hooks/registrations.schema.json',
    'scripts/schemas/provider-skill-semantics.schema.json',
  ]) await copy(path)
  const schema = resolve(fixture, 'packages/governance/canonical/schemas/providers.schema.json')
  const original = await readFile(schema, 'utf8')
  const normalizer = resolve(fixture, 'packages/governance/src/provider-hook-normalization.mjs')
  const normalizerBody = await readFile(normalizer, 'utf8')
  const run = (provider) => spawnSync(process.execPath, ['--', 'scripts/run-provider-hook.mjs', '--provider', provider, '--hook', 'governance_control_plane.sh'], {
    cwd: fixture, input: '{}\n', encoding: 'utf8',
  })
  const assertBlocked = () => {
    for (const provider of ['claude', 'codex']) {
      const result = run(provider)
      assert.equal(result.status, 70, `${provider}:${result.stderr}`)
      assert.match(result.stderr, /GOVERNANCE_INTEGRITY:/)
      assert.match(result.stderr, /invalid canonical provider contract/)
    }
  }

  await rm(normalizer)
  assertBlocked()
  await writeFile(normalizer, normalizerBody)
  await rm(schema)
  assertBlocked()
  await writeFile(schema, '{not-json')
  assertBlocked()
  await writeFile(schema, '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"not-a-real-type"}\n')
  assertBlocked()
  await writeFile(resolve(external, 'providers.schema.json'), original)
  await rm(schema)
  await symlink(resolve(external, 'providers.schema.json'), schema)
  assertBlocked()
})

test('hook registrations and skill semantics are schema-closed and unambiguous', async () => {
  const registrations = JSON.parse(await readFile(resolve(repoRoot, 'packages/design-system/ds-canonical/hooks/registrations.json'), 'utf8'))
  assert.equal(validateHookRegistrations(structuredClone(registrations)).schemaVersion, 1)
  const chromeDescriptor = Object.values(registrations.hooks)
    .flatMap((groups) => groups)
    .flatMap((group) => group.hooks)
    .find((descriptor) => descriptor.hook === 'chrome_header_dispatcher.sh')
  assert.equal(chromeDescriptor.inputContract, 'proposed-text-v1')
  const storyPreDescriptor = registrations.hooks.PreToolUse
    .flatMap((group) => group.hooks)
    .find((descriptor) => descriptor.hook === 'check_story_invariants.sh')
  const storyPostDescriptor = registrations.hooks.PostToolUse
    .flatMap((group) => group.hooks)
    .find((descriptor) => descriptor.hook === 'check_story_invariants.sh')
  assert.equal(storyPreDescriptor.inputContract, 'proposed-text-v1')
  assert.equal(storyPostDescriptor.inputContract ?? 'event-v1', 'event-v1')

  const mutations = [
    (value) => { value.hooks.PreToolUse[0].hooks[0].runtime = 'ruby' },
    (value) => { value.hooks.PreToolUse[0].hooks[0].kind = 'shell' },
    (value) => { delete value.hooks.PreToolUse[0].matcher },
    (value) => { value.hooks.PreToolUse[0].unexpected = true },
    (value) => { value.hooks.PreToolUse[0].hooks[0].inputContract = 'untrusted-fragment-v1' },
    (value) => { value.hooks.PreToolUse[0].matcher = 'Edit|Edit' },
    (value) => { value.hooks.PreToolUse[0].hooks.push(structuredClone(value.hooks.PreToolUse[0].hooks[0])) },
  ]
  for (const mutate of mutations) {
    const invalid = structuredClone(registrations)
    mutate(invalid)
    assert.throws(() => validateHookRegistrations(invalid), /committed JSON Schema|duplicate/)
  }

  const invalidSemantics = structuredClone(PROVIDER_SKILL_SEMANTICS)
  invalidSemantics.skills[0].unexpected = true
  assert.throws(() => validateProviderSkillSemantics(invalidSemantics), /committed JSON Schema/)
  delete invalidSemantics.skills[0].unexpected
  delete invalidSemantics.skills[0].bindingProfile
  assert.throws(() => validateProviderSkillSemantics(invalidSemantics), /committed JSON Schema/)
})

test('dependency-free plugin validators have mutation parity with the full Ajv contract', async () => {
  const runtimeValidator = checkProviderRuntimeValidator()
  assert.equal(runtimeValidator.ok, true, JSON.stringify(runtimeValidator))
  const registrations = JSON.parse(await readFile(resolve(repoRoot, 'packages/design-system/ds-canonical/hooks/registrations.json'), 'utf8'))
  const parity = (full, runtime, values) => {
    for (const value of values) {
      let fullAccepted = true
      let runtimeAccepted = true
      try { full(structuredClone(value)) } catch { fullAccepted = false }
      try { runtime(structuredClone(value)) } catch { runtimeAccepted = false }
      assert.equal(runtimeAccepted, fullAccepted)
    }
  }
  const providerMutations = [
    structuredClone(PROVIDER_REGISTRY),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.schemaVersion = 999; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[0].unknown = true; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[0].runtime.contextOutputTransport = 'unknown'; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[1].id = value.providers[0].id; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[0].adapter.skillBindings['canonical-reviewer'].peer = value.providers[0].id; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); delete value.providers[0].adapter.instructionView; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[0].adapter.instructionView.materializerId = 'unknown-instruction-view-v1'; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.canonical.materializers.hookViews['claude-settings-json-v1'].baseTemplateContract = 'unknown-template-contract-v1'; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[0].adapter.managedTrees = {}; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); delete value.providers[0].adapter.productManagedTrees; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[0].adapter.skillBindings['canonical-reviewer'].invocation = { strategy: 'main-context', agent: 'ambiguous' }; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[0].capabilities.hookEnforcement = 'ci-only'; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[2].hookConfig = '.generic/hooks.json'; return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[2].adapter.exclusions = value.providers[2].adapter.exclusions.filter((item) => item.scope !== 'native-hooks'); return value })(),
    (() => { const value = structuredClone(PROVIDER_REGISTRY); value.providers[1].skillDirectory = value.providers[0].skillDirectory; value.providers[1].adapter.skillView.directory = value.providers[0].skillDirectory; value.providers[1].adapter.discovery.providerRootNames = ['.claude', '.codex']; return value })(),
    (() => {
      const value = structuredClone(PROVIDER_REGISTRY)
      value.canonical.retiredProviders = [{
        id: 'claude', replacementProviderId: 'codex', retiredInVersion: '1.0.0', reasonCode: 'PROVIDER_REPLACED',
        discovery: structuredClone(value.providers[0].adapter.discovery),
        surfaces: [{ path: '.claude/retired', kind: 'tree' }],
      }]
      return value
    })(),
    (() => {
      const value = structuredClone(PROVIDER_REGISTRY)
      const provider = structuredClone(value.providers[2])
      provider.id = 'future-nohook'
      provider.displayName = 'Future no-hook provider'
      provider.instructionEntry = 'NOHOOK.md'
      provider.skillDirectory = '.nohook/skills'
      provider.adapter.generate = true
      provider.adapter.repositoryInstructionSource = null
      provider.adapter.instructionView = { materializerId: 'markdown-relative-at-import-v1' }
      provider.adapter.productInstructionSource = 'scripts/fork-role-sources/AGENTS.product.md'
      provider.adapter.skillView = { directory: provider.skillDirectory, materializerId: 'agent-skills-directory-v1' }
      provider.adapter.discovery = {
        providerRootNames: ['.nohook'], instructionNames: ['NOHOOK.md'], instructionOverrideNames: [], configPaths: [], pluginRootNames: [],
      }
      provider.adapter.exclusions = provider.adapter.exclusions.filter((item) => item.scope === 'native-hooks')
      value.providers.push(provider)
      return value
    })(),
  ]
  parity(validateProviderRegistryDocument, validateRuntimeProviderRegistry, providerMutations)

  const registrationMutations = [
    structuredClone(registrations),
    (() => { const value = structuredClone(registrations); value.schemaVersion = 2; return value })(),
    (() => { const value = structuredClone(registrations); value.hooks.PreToolUse[0].unknown = true; return value })(),
    (() => { const value = structuredClone(registrations); value.hooks.Stop[0].hooks[0].transcript = 'opaque'; return value })(),
    (() => { const value = structuredClone(registrations); value.hooks.PreToolUse[0].matcher = 'Edit|Edit'; return value })(),
    (() => { const value = structuredClone(registrations); value.hooks.PreToolUse[0].hooks.push(structuredClone(value.hooks.PreToolUse[0].hooks[0])); return value })(),
  ]
  parity(validateHookRegistrations, validateRuntimeHookRegistrations, registrationMutations)
})

test('provider retirement registry closes pure rename transfers, blocks loss of reviewer independence, and rejects replacement/partition ambiguity', async () => {
  const renamedRegistry = structuredClone(PROVIDER_REGISTRY)
  const prior = renamedRegistry.providers.find((provider) => provider.id === 'claude')
  const replacement = structuredClone(prior)
  replacement.id = 'claude-next'
  replacement.displayName = 'Claude next fixture'
  for (const binding of Object.values(replacement.adapter.skillBindings)) binding.self = replacement.id
  renamedRegistry.providers = renamedRegistry.providers.filter((provider) => provider.id !== prior.id)
  renamedRegistry.providers.push(replacement)
  const transfers = [
    { path: prior.instructionEntry, kind: 'file' },
    { path: prior.hookConfig, kind: 'file' },
    { path: prior.skillDirectory, kind: 'tree' },
    ...Object.values(prior.adapter.productManagedTrees).map((path) => ({ path, kind: 'tree' })),
  ].sort((left, right) => compareUtf8Bytes(left.path, right.path))
  renamedRegistry.canonical.retiredProviders = [{
    id: prior.id,
    replacementProviderId: replacement.id,
    retiredInVersion: '1.0.0',
    reasonCode: 'PROVIDER_RENAMED',
    discovery: structuredClone(prior.adapter.discovery),
    surfaces: [],
    transfers,
  }]
  assert.doesNotThrow(() => validateProviderRegistryDocument(structuredClone(renamedRegistry)))
  assert.doesNotThrow(() => validateRuntimeProviderRegistry(structuredClone(renamedRegistry)))

  const removedRegistry = structuredClone(PROVIDER_REGISTRY)
  const removed = removedRegistry.providers.find((provider) => provider.id === 'claude')
  removedRegistry.providers = removedRegistry.providers.filter((provider) => provider.id !== removed.id)
  removedRegistry.canonical.retiredProviders = [{
    id: removed.id,
    replacementProviderId: null,
    retiredInVersion: '1.0.0',
    reasonCode: 'PROVIDER_REMOVED',
    discovery: structuredClone(removed.adapter.discovery),
    surfaces: [
      { path: removed.instructionEntry, kind: 'file' },
      { path: removed.hookConfig, kind: 'file' },
      { path: removed.skillDirectory, kind: 'tree' },
      ...Object.values(removed.adapter.productManagedTrees).map((path) => ({ path, kind: 'tree' })),
    ].sort((left, right) => compareUtf8Bytes(left.path, right.path)),
  }]
  assert.deepEqual(
    removedRegistry.providers
      .filter((provider) => provider.id !== 'codex' && provider.providerKind === 'concrete-runtime')
      .map((provider) => provider.id),
    [],
    'retiring the only independent concrete reviewer must leave no concrete reviewer candidate',
  )
  const blockedReview = resolveProviderReviewBinding({
    registry: removedRegistry,
    skill: 'independent-review',
    selfProviderId: 'codex',
    requireCertificationContract: true,
  })
  assert.equal(blockedReview.peer, null)
  assert.equal(blockedReview.selectionStatus, 'REVIEW-BLOCKED')
  assert.equal(blockedReview.selectionReasonCode, 'REVIEW_CAPABILITY_SELECTION_REQUIRED')
  assert.doesNotThrow(
    () => buildProviderAdapterTargets({ registry: removedRegistry, sourceRoot: repoRoot }),
    'structural adapter materialization must not invent a concrete reviewer',
  )

  const rejectedByBoth = (mutate, expected) => {
    const value = structuredClone(renamedRegistry)
    mutate(value.canonical.retiredProviders[0])
    assert.throws(() => validateProviderRegistryDocument(structuredClone(value)), expected)
    assert.throws(() => validateRuntimeProviderRegistry(structuredClone(value)), expected)
  }
  rejectedByBoth((record) => { record.replacementProviderId = 'ghost-provider' }, /distinct active current provider/)
  rejectedByBoth((record) => { record.replacementProviderId = record.id }, /distinct active current provider/)
  rejectedByBoth((record) => { record.replacementProviderId = null }, /committed JSON Schema|null replacementProviderId cannot transfer/)
  rejectedByBoth((record) => { record.replacementProviderId = 'codex' }, /transfer is not exactly owned by replacement codex/)
  rejectedByBoth((record) => { record.surfaces = [structuredClone(record.transfers[0])] }, /duplicate surface path/)
  rejectedByBoth((record) => { record.surfaces = record.transfers; delete record.transfers }, /overlaps an active provider output/)
})

test('standalone provider semantics reject retirement tombstones over every active managed and compatibility transport', () => {
  const assertBlocked = ({ mutate = () => {}, path, kind = 'file' }) => {
    const value = structuredClone(PROVIDER_REGISTRY)
    mutate(value.canonical.compatibilityProjections)
    const root = path.split('/')[0]
    value.canonical.retiredProviders = [{
      id: 'retired-fixture',
      replacementProviderId: null,
      retiredInVersion: '1.0.0',
      reasonCode: 'PROVIDER_REMOVED',
      discovery: {
        providerRootNames: [root],
        instructionNames: [],
        instructionOverrideNames: [],
        configPaths: [],
        pluginRootNames: [],
      },
      surfaces: [{ path, kind }],
    }]
    assert.throws(
      () => validateProviderRegistrySemantics(value),
      /retired provider surface overlaps an active provider output/,
      `active compatibility surface must be protected from a retirement tombstone:${path}`,
    )
  }

  assertBlocked({ path: '.claude/rules/retired-fixture.md' })
  assertBlocked({
    mutate: ({ legacyClaudeInstruction }) => {
      legacyClaudeInstruction.discoveryCategories[0].destinationRoot = '.compat-discovery'
      legacyClaudeInstruction.discoveryCategories[0].entries = ['leaf.md']
    },
    path: '.compat-discovery/leaf.md',
  })
  assertBlocked({
    mutate: ({ legacyClaudeInstruction }) => {
      legacyClaudeInstruction.discoveryCategories[0].artifactRoot = '.compat-artifact'
      legacyClaudeInstruction.discoveryCategories[0].entries = ['leaf.md']
    },
    path: '.compat-artifact/leaf.md',
  })
  assertBlocked({
    mutate: ({ legacyCodexCorpus }) => { legacyCodexCorpus.hookArtifact = '.compat-corpus/hooks.json' },
    path: '.compat-corpus/hooks.json',
  })
  assertBlocked({
    mutate: ({ legacyCodexCorpus }) => { legacyCodexCorpus.skillArtifactRoot = '.compat-corpus/skills' },
    path: '.compat-corpus/skills',
    kind: 'tree',
  })
  assertBlocked({
    mutate: ({ marketplacePluginTransport }) => { marketplacePluginTransport.hookOutput = '.compat-marketplace/hooks.json' },
    path: '.compat-marketplace/hooks.json',
  })
})

test('standalone validator bytes are independent of the caller working directory', () => {
  const generator = resolve(repoRoot, 'scripts/gen-provider-runtime-validator.mjs')
  for (const cwd of [repoRoot, resolve(repoRoot, 'packages/governance')]) {
    const result = spawnSync(process.execPath, ['--', generator, '--check'], { cwd, encoding: 'utf8' })
    assert.equal(result.status, 0, `${cwd}: ${result.stdout}${result.stderr}`)
    assert.match(result.stdout, /matches canonical schemas/)
  }
})

test('every canonical skill is classified and SKILL, references, and scripts are scanned recursively', async (t) => {
  const scan = scanCanonicalSkillSemantics()
  assert.equal(scan.records.length, PROVIDER_SKILL_SEMANTICS.skills.length)
  assert.equal(scan.records.every((record) => ['provider-neutral', 'provider-bound'].includes(record.classification)), true)
  for (const name of ['codex-collab', 'deep-audit-cross-codex', 'canonical-reviewer']) {
    assert.deepEqual(scan.records.find((record) => record.name === name).assumptions, [])
  }

  const sourceRoot = await mkdtemp(resolve(tmpdir(), 'provider-skill-semantics-'))
  t.after(() => rm(sourceRoot, { recursive: true, force: true }))
  const canonicalRoot = resolve(sourceRoot, 'packages/design-system/ds-canonical/skills')
  await mkdir(resolve(canonicalRoot, '..'), { recursive: true })
  await cp(resolve(repoRoot, 'packages/design-system/ds-canonical/skills'), canonicalRoot, { recursive: true })
  const instructionSource = resolve(sourceRoot, 'packages/design-system/ds-canonical/adapters/claude-root-instructions.md')
  await mkdir(resolve(instructionSource, '..'), { recursive: true })
  await cp(resolve(repoRoot, 'packages/design-system/ds-canonical/adapters/claude-root-instructions.md'), instructionSource)
  for (const path of ['scripts/fork-role-sources/AGENTS.product.md', 'scripts/fork-role-sources/CLAUDE.product.md']) {
    const target = resolve(sourceRoot, path)
    await mkdir(resolve(target, '..'), { recursive: true })
    await cp(resolve(repoRoot, path), target)
  }

  const leakedSurface = resolve(canonicalRoot, 'PROVIDER-NOTE.md')
  await writeFile(leakedSurface, 'Use a Claude-only discovery path.\n')
  assert.throws(
    () => scanCanonicalSkillSemantics({ sourceRoot, registry: PROVIDER_REGISTRY, semantics: PROVIDER_SKILL_SEMANTICS }),
    /canonical skill surface file contains undeclared provider assumptions.*ADAPTER-BLOCKED/,
  )
  await rm(leakedSurface)

  const leakedReference = resolve(canonicalRoot, 'delivery-handoff/references/handoff-template.md')
  const originalReference = await readFile(leakedReference, 'utf8')
  await writeFile(leakedReference, `${originalReference}\nUse the Claude Task tool.\n`)
  assert.throws(
    () => scanCanonicalSkillSemantics({ sourceRoot, registry: PROVIDER_REGISTRY, semantics: PROVIDER_SKILL_SEMANTICS }),
    /delivery-handoff:semantic assumption mismatch.*provider-identity.*provider-native-tool.*ADAPTER-BLOCKED/,
  )
  await writeFile(leakedReference, originalReference)

  for (const authorityLeak of [
    'Canonical SSOT and edit target: .claude/rules/ui-development.md.',
    'Canonical source to update: .agents/skills/story-writing/SKILL.md.',
  ]) {
    await writeFile(leakedReference, `${originalReference}\n${authorityLeak}\n`)
    assert.throws(
      () => scanCanonicalSkillSemantics({ sourceRoot, registry: PROVIDER_REGISTRY, semantics: PROVIDER_SKILL_SEMANTICS }),
      /delivery-handoff:provider view cannot be canonical authority or edit\/execute\/enumeration target.*ADAPTER-BLOCKED/,
      'generated provider views may be discovery/delivery projections, never canonical authority or edit targets',
    )
  }
  await writeFile(leakedReference, originalReference)

  const extraResource = resolve(canonicalRoot, 'bug-fix-rhythm/output/provider-note.md')
  await mkdir(resolve(extraResource, '..'), { recursive: true })
  await writeFile(extraResource, 'Read another .claude/provider-specific.md path.\n')
  assert.throws(
    () => scanCanonicalSkillSemantics({ sourceRoot, registry: PROVIDER_REGISTRY, semantics: PROVIDER_SKILL_SEMANTICS }),
    /bug-fix-rhythm:declared assumption inventory drift.*ADAPTER-BLOCKED/,
    'a second leak in an already-allowed category must change the committed inventory fingerprint',
  )
  await rm(resolve(extraResource, '..'), { recursive: true, force: true })

  await cp(resolve(repoRoot, 'packages/design-system/ds-canonical/skills/delivery-handoff'), resolve(canonicalRoot, 'unclassified-skill'), { recursive: true })
  await writeFile(resolve(canonicalRoot, 'unclassified-skill/SKILL.md'), '---\nname: unclassified-skill\ndescription: fixture\n---\n')
  assert.throws(
    () => scanCanonicalSkillSemantics({ sourceRoot, registry: PROVIDER_REGISTRY, semantics: PROVIDER_SKILL_SEMANTICS }),
    /classification inventory mismatch.*unclassified-skill.*ADAPTER-BLOCKED/,
  )
})

test('skill semantics rejects detached sources, missing references, and unresolved bindings', () => {
  const detached = structuredClone(PROVIDER_SKILL_SEMANTICS)
  detached.skills[0].sourceWorkflow = 'packages/design-system/ds-canonical/skills/delivery-handoff/SKILL.md'
  assert.throws(() => validateProviderSkillSemantics(detached), /workflow source must be exactly/)

  const unbound = structuredClone(PROVIDER_SKILL_SEMANTICS)
  delete unbound.bindingProfiles['repository-legacy-surfaces-v1'].providers.codex.resolutions['provider-surface-path']
  assert.throws(() => validateProviderSkillSemantics(unbound), /no resolution for provider-surface-path/)

  const maskedLeak = structuredClone(PROVIDER_SKILL_SEMANTICS)
  maskedLeak.skills.find((skill) => skill.name === 'delivery-handoff').declaredIdentifiers = ['Claude']
  assert.throws(() => validateProviderSkillSemantics(maskedLeak), /declared identifier may only mask/)

  const missingReference = structuredClone(PROVIDER_SKILL_SEMANTICS)
  missingReference.skills.find((skill) => skill.name === 'canonical-reviewer').requiredReferences = [
    'packages/design-system/ds-canonical/skills/canonical-reviewer/references/missing.md',
  ]
  assert.throws(
    () => scanCanonicalSkillSemantics({ semantics: missingReference }),
    /required reference must exist as a regular no-symlink file/,
  )
})

test('contract policy and schema files cannot be symbolic or hard links', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'provider-contract-source-'))
  const external = await mkdtemp(resolve(tmpdir(), 'provider-contract-external-'))
  t.after(() => Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(external, { recursive: true, force: true }),
  ]))
  await mkdir(resolve(root, 'scripts/schemas'), { recursive: true })
  await writeFile(resolve(external, 'provider-skill-semantics.schema.json'), '{"type":"object"}\n')
  await symlink(resolve(external, 'provider-skill-semantics.schema.json'), resolve(root, 'scripts/schemas/provider-skill-semantics.schema.json'))
  assert.throws(
    () => assertNoSymlinkContractPath(root, 'scripts/schemas/provider-skill-semantics.schema.json', 'provider skill semantics schema'),
    /crosses a symbolic link/,
  )

  await mkdir(resolve(root, 'scripts/contracts'), { recursive: true })
  await writeFile(resolve(external, 'semantics.json'), '{}\n')
  await symlink(external, resolve(root, 'scripts/contracts/external'))
  assert.throws(
    () => assertNoSymlinkContractPath(root, 'scripts/contracts/external/semantics.json', 'provider skill semantics contract'),
    /crosses a symbolic link/,
  )

  await writeFile(resolve(external, 'hard-linked-schema.json'), '{"type":"object"}\n')
  await link(resolve(external, 'hard-linked-schema.json'), resolve(root, 'scripts/schemas/hard-linked-schema.json'))
  assert.throws(
    () => assertNoSymlinkContractPath(root, 'scripts/schemas/hard-linked-schema.json', 'provider hard-linked schema'),
    /regular unaliased/,
  )

  const rootAlias = resolve(external, 'repository-root-alias')
  await symlink(root, rootAlias)
  assert.throws(
    () => assertNoSymlinkContractPath(rootAlias, 'scripts/schemas/hard-linked-schema.json', 'provider aliased root'),
    /repository root must be a real directory/,
  )
})

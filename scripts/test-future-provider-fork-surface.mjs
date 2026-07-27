#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { annotateForkSkill, assertCanonicalInventoryClean, buildCorpus } from './build-fork-governance.mjs'
import { buildProviderHookView, PROVIDER_REGISTRY, PROVIDER_SKILL_SEMANTICS } from './gen-codex-adapter.mjs'
import {
  authorizeDisposableProviderRefreshTransaction,
  CONSUMER_CONTROL_PLANE_PATHS,
  refreshLaunchers,
  providerSurfaceDigest,
  validateInstalledForkCorpus,
  validateInstalledProviderTransition,
  validateForkManifestProviderSurfaces,
} from './refresh-fork-launchers.mjs'
import {
  compareUtf8Bytes,
  deriveProviderProductManagedInventory,
  lifecycleSnapshotSha256,
  providerInventorySha256,
} from './lib/provider-lifecycle.mjs'
import { buildProviderHookLaunchArgv } from './lib/provider-hook-output-transport.mjs'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'future-provider-fork-')))
const output = join(root, 'fork')
const generatedTemplate = join(root, 'generated-template')
const consumer = join(root, 'consumer')
const applyRefresh = (previousCorpus = null) => {
  const currentCorpus = validateInstalledForkCorpus(consumer)
  const transition = validateInstalledProviderTransition(previousCorpus || currentCorpus, currentCorpus)
  const transactionCapability = authorizeDisposableProviderRefreshTransaction({
    projectDir: consumer,
    verifiedCorpus: currentCorpus,
    providerTransition: transition,
  })
  return refreshLaunchers(consumer, {
    verifiedCorpus: currentCorpus,
    providerTransition: transition,
    transactionCapability,
  })
}

const registry = structuredClone(PROVIDER_REGISTRY)
const providerCompatibilityBase = JSON.parse(readFileSync(new URL('../infra/governance/providers/compatibility-matrix.json', import.meta.url), 'utf8'))
const providerCertifications = JSON.parse(readFileSync(new URL('../infra/governance/providers/certifications.json', import.meta.url), 'utf8'))
const syntheticWriteTransports = () => [
  {
    id: 'synthetic-edit-v1',
    rawTools: ['edit'],
    engine: 'exact-replace-v1',
    payloadFields: ['path', 'old_content', 'new_content', 'replace_all'],
  },
  {
    id: 'synthetic-write-v1',
    rawTools: ['write'],
    engine: 'full-file-v1',
    payloadFields: ['path', 'content'],
  },
]
// Deliberately construct this provider from the contract, not by cloning a certified adapter. The
// negative phases below prove that discovery capability and semantic profile bindings are explicit
// onboarding inputs rather than inherited defaults.
const future = {
  id: 'future-synthetic',
  displayName: 'Future synthetic provider',
  providerKind: 'concrete-runtime',
  instructionEntry: 'FUTURE.md',
  sharedInstructionEntry: 'AGENTS.md',
  skillDirectory: '.future-provider/skills',
  hookConfig: '.future-provider/hooks.json',
  hookConfigFormat: 'json',
  hookEntrypoint: 'scripts/run-provider-hook.mjs',
  blockingExitCode: 23,
  capabilities: { nativeHooks: true, hookTrustRequired: true, hardGateComplete: false, hookEnforcement: 'native-feedback-plus-ci' },
  runtime: {
    cli: {
      executable: 'future-synthetic',
      localExecutable: 'node_modules/.bin/future-synthetic',
      briefInvocationMarkers: ['review'],
      discoveryMarkers: ['command -v future-synthetic'],
      replyArtifactPrefix: 'future-synthetic-reply',
    },
    transcript: { contract: null, stability: 'unavailable', fixture: null, access: null },
    contextOutputTransport: 'stderr',
    stopDecisionTransport: 'blocking-exit',
    branchNamespace: 'future-synthetic/',
    memorySyncScript: null,
  },
  normalization: {
    eventFields: ['event'],
    toolFields: ['operation'],
    pathFields: ['path'],
    pathArrayFields: ['changed_paths'],
    writeTools: ['write', 'edit'],
    writeTransports: syntheticWriteTransports(),
    eventAliases: { beforewrite: 'PreToolUse', afterwrite: 'PostToolUse', sessionstart: 'SessionStart', userpromptsubmit: 'UserPromptSubmit', stop: 'Stop' },
    toolAliases: { write: 'Write', edit: 'Edit' },
  },
  adapter: {
    generate: true,
    repositoryInstructionSource: null,
    instructionView: { materializerId: 'markdown-relative-at-import-v1' },
    productInstructionSource: 'scripts/test-fixtures/future-provider-instruction-supplement.md',
    repositoryManagedTrees: {},
    productManagedTrees: {
      policies: {
        sourceRoot: 'scripts/test-fixtures/future-provider-managed-tree',
        destination: '.future-provider/policies',
        materializerId: 'closed-tree-copy-v1',
        transformPolicy: 'byte-exact',
      },
    },
    skillView: null,
    hookView: {
      output: '.future-provider/hooks.json',
      materializerId: 'portable-event-list-json-v1',
      settingsTemplate: null,
      // Deliberately partial: onboarding a runtime must not pretend that every provider exposes
      // every native event. Missing feedback events remain explicit and fall back to the hard gate.
      supportedEvents: ['PreToolUse', 'PostToolUse'],
      eventBindings: { PreToolUse: 'beforeWrite', PostToolUse: 'afterWrite' },
      matcherAliases: {},
      workingDirectoryPolicy: 'repository-root',
    },
    environmentMap: {},
    skillBindings: {},
    skillAliases: [],
    discovery: {
      providerRootNames: ['.future-provider'],
      instructionNames: ['FUTURE.md'],
      instructionOverrideNames: ['FUTURE.local.md', 'FUTURE.override.md'],
      configPaths: ['.future-mcp.json', '.future-provider/config.toml', '.future-provider/hooks.json'],
      pluginRootNames: ['.future-plugin'],
    },
  },
}
registry.providers.push(future)
const futureNoHook = {
  id: 'future-nohook',
  displayName: 'Future provider without native hooks',
  providerKind: 'concrete-runtime',
  instructionEntry: 'NOHOOK.md',
  sharedInstructionEntry: 'AGENTS.md',
  skillDirectory: '.nohook/skills',
  hookConfig: null,
  hookConfigFormat: null,
  hookEntrypoint: null,
  blockingExitCode: 2,
  capabilities: { nativeHooks: false, hookTrustRequired: false, hardGateComplete: false, hookEnforcement: 'ci-only' },
  runtime: {
    cli: {
      executable: 'future-nohook',
      localExecutable: 'node_modules/.bin/future-nohook',
      briefInvocationMarkers: ['review'],
      discoveryMarkers: ['command -v future-nohook'],
      replyArtifactPrefix: 'future-nohook-reply',
    },
    transcript: { contract: null, stability: 'unavailable', fixture: null, access: null },
    contextOutputTransport: 'stderr',
    stopDecisionTransport: 'blocking-exit',
    branchNamespace: 'future-nohook/',
    memorySyncScript: null,
  },
  normalization: {
    eventFields: ['event'],
    toolFields: ['operation'],
    pathFields: ['path'],
    pathArrayFields: ['changed_paths'],
    writeTools: ['write', 'edit'],
    writeTransports: syntheticWriteTransports(),
    eventAliases: { beforewrite: 'PreToolUse', afterwrite: 'PostToolUse' },
    toolAliases: { write: 'Write', edit: 'Edit' },
  },
  adapter: {
    generate: true,
    repositoryInstructionSource: null,
    instructionView: { materializerId: 'markdown-relative-at-import-v1' },
    productInstructionSource: 'scripts/test-fixtures/future-provider-instruction-supplement.md',
    repositoryManagedTrees: {},
    productManagedTrees: {},
    skillView: { directory: '.nohook/skills', materializerId: 'markdown-workflows-directory-v1' },
    hookView: null,
    environmentMap: {},
    skillBindings: {},
    skillAliases: [],
    discovery: {
      providerRootNames: ['.nohook'],
      instructionNames: ['NOHOOK.md'],
      instructionOverrideNames: ['NOHOOK.local.md', 'NOHOOK.override.md'],
      configPaths: [],
      pluginRootNames: ['.nohook-plugin'],
    },
    exclusions: [{
      scope: 'native-hooks',
      reasonCode: 'NATIVE_HOOK_API_UNAVAILABLE',
      detail: 'This provider has no native hook API; the immutable provider-neutral checker and protected CI remain mandatory.',
    }],
  },
}
registry.providers.push(futureNoHook)
const semantics = structuredClone(PROVIDER_SKILL_SEMANTICS)
const releaseVersion = JSON.parse(readFileSync(new URL('../packages/design-system/package.json', import.meta.url), 'utf8')).version
const nextReleaseVersion = releaseVersion.replace(/(?:-beta\.)?(\d+)$/, (match, value) => match.startsWith('-beta.') ? `-beta.${Number(value) + 1}` : String(Number(value) + 1))
const lifecycleSnapshot = (providerRegistry, version, retiredProviders = [], previousSnapshotSha256 = null) => ({
  releaseVersion: version,
  previousSnapshotSha256,
  providers: deriveProviderProductManagedInventory(providerRegistry),
  retiredProviders,
})
const lifecycleLedger = (snapshots) => {
  const immutable = snapshots.length === 1 ? snapshots[0] : snapshots.at(-2)
  return {
    $schema: './schemas/provider-lifecycle.schema.json',
    schemaVersion: 1,
    kind: 'provider-lifecycle-ledger',
    immutableHead: {
      releaseVersion: immutable.releaseVersion,
      snapshotSha256: lifecycleSnapshotSha256(immutable),
      providerInventorySha256: providerInventorySha256(immutable.providers),
    },
    snapshots,
  }
}
const genesisLifecycle = (providerRegistry) => lifecycleLedger([lifecycleSnapshot(providerRegistry, releaseVersion)])
const fixtureProviderCompatibility = (providerRegistry) => {
  const compatibility = structuredClone(providerCompatibilityBase)
  const registeredAdapters = new Set(
    Object.values(compatibility.providers).map((record) => record.adapterProviderId).filter(Boolean),
  )
  for (const provider of providerRegistry.providers) {
    if (provider.providerKind !== 'concrete-runtime' || registeredAdapters.has(provider.id)) continue
    compatibility.providers[provider.id] = {
      adapterProviderId: provider.id,
      runtimeKinds: {
        [`${provider.id}-cli`]: {
          runtimeProfilesBySurface: { local: provider.id },
          runtimeEvidenceRequired: true,
        },
      },
      minimumVersion: 'fixture-1',
    }
  }
  return compatibility
}

const build = (providerSkillSemantics = semantics) => buildCorpus({
  outDir: output,
  templateRoot: generatedTemplate,
  providerRegistry: registry,
  providerSkillSemantics,
  providerLifecycle: genesisLifecycle(registry),
  providerCompatibility: fixtureProviderCompatibility(registry),
  providerCertifications,
  releaseVersion,
})

const rewriteCorpusTrustChain = (consumerRoot, mutate) => {
  const forkRoot = join(consumerRoot, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  const manifestPath = join(forkRoot, 'manifest.json')
  const corpusLockPath = join(forkRoot, 'governance.lock')
  const bomPath = join(forkRoot, 'consumer/lock.json')
  const digest = (body) => createHash('sha256').update(body).digest('hex')

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  mutate({ forkRoot, manifest })
  const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(manifestPath, manifestBody)

  const corpusLock = JSON.parse(readFileSync(corpusLockPath, 'utf8'))
  const manifestEntries = corpusLock.entries.filter((entry) => entry.file === 'manifest.json')
  assert.equal(manifestEntries.length, 1, 'poison fixture needs exactly one locked manifest entry')
  for (const entry of corpusLock.entries) entry.sha256 = digest(readFileSync(join(forkRoot, entry.file)))
  const corpusLockBody = Buffer.from(`${JSON.stringify(corpusLock, null, 2)}\n`)
  writeFileSync(corpusLockPath, corpusLockBody)

  const bom = JSON.parse(readFileSync(bomPath, 'utf8'))
  bom.payload.forkCorpusLockSha256 = digest(corpusLockBody)
  bom.payload.providerInventorySha256 = digest(JSON.stringify(manifest.providerSurfaces))
  writeFileSync(bomPath, `${JSON.stringify(bom, null, 2)}\n`)
  assert.equal(manifestEntries[0].sha256, digest(readFileSync(manifestPath)), 'poison manifest must remain self-consistent with its corpus lock')
  assert.equal(bom.payload.forkCorpusLockSha256, digest(readFileSync(corpusLockPath)), 'poison corpus lock must remain self-consistent with its consumer BOM')
}
const rewriteMaterializationTrustChain = (consumerRoot, mutate) => rewriteCorpusTrustChain(
  consumerRoot,
  ({ manifest }) => mutate(manifest.consumer.materialization, manifest),
)

// Adversarial helper: rebuild every directly shipped hash after an attacker rewrites a manifest.
// This deliberately cannot recreate the canonical ledgerSha256 preimage; v4 snapshot bodies are
// therefore the installer-verifiable authority that must still reject a self-consistent outer lock.
const rewriteFullyAuthenticatedCorpusTrustChain = (consumerRoot, mutate) => {
  const forkRoot = join(consumerRoot, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  const manifestPath = join(forkRoot, 'manifest.json')
  const corpusLockPath = join(forkRoot, 'governance.lock')
  const bomPath = join(forkRoot, 'consumer/lock.json')
  const digest = (body) => createHash('sha256').update(body).digest('hex')
  const jsonDigest = (value) => digest(JSON.stringify(value))

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  mutate({ forkRoot, manifest })
  const lifecycle = manifest.providerLifecycle
  if (lifecycle.schemaVersion === 4) {
    lifecycle.currentSnapshotSha256 = jsonDigest(lifecycle.currentSnapshot)
    lifecycle.currentProviderInventorySha256 = jsonDigest(lifecycle.currentSnapshot.providers)
    lifecycle.previousSnapshotSha256 = lifecycle.currentSnapshot.previousSnapshotSha256
    lifecycle.releaseVersion = lifecycle.currentSnapshot.releaseVersion
    lifecycle.immutableHead = {
      releaseVersion: lifecycle.immutableHeadSnapshot.releaseVersion,
      snapshotSha256: jsonDigest(lifecycle.immutableHeadSnapshot),
      providerInventorySha256: jsonDigest(lifecycle.immutableHeadSnapshot.providers),
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const corpusLock = JSON.parse(readFileSync(corpusLockPath, 'utf8'))
  for (const entry of corpusLock.entries) entry.sha256 = digest(readFileSync(join(forkRoot, entry.file)))
  writeFileSync(corpusLockPath, `${JSON.stringify(corpusLock, null, 2)}\n`)

  const bom = JSON.parse(readFileSync(bomPath, 'utf8'))
  bom.payload.forkCorpusLockSha256 = digest(readFileSync(corpusLockPath))
  bom.payload.discoveryPolicySha256 = jsonDigest(manifest.discoveryPolicy)
  bom.payload.providerInventorySha256 = jsonDigest(manifest.providerSurfaces)
  bom.payload.providerLifecycleSha256 = jsonDigest(manifest.providerLifecycle)
  bom.payload.providerMaterializersSha256 = jsonDigest(manifest.materializers)
  writeFileSync(bomPath, `${JSON.stringify(bom, null, 2)}\n`)
}

const textFiles = (directory) => {
  const bodies = []
  const visit = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name)
      const info = lstatSync(path)
      if (info.isDirectory()) visit(path)
      else if (info.isFile()) {
        const body = readFileSync(path)
        if (!body.includes(0)) bodies.push(body.toString('utf8'))
      }
    }
  }
  visit(directory)
  return bodies
}

const scopedDiagnostics = (report) => report.diagnostics.filter((item) => /^(?:GOV-ADAPTER|GOV-PROVIDER|GOV-SKILL)/.test(item.ruleId))

{
  const poison = annotateForkSkill('Run `node scripts/future-ds-author-only.mjs --strict` before completion.\n')
  assert.match(poison, /common product instruction/)
  assert.doesNotMatch(poison, /AGENTS\.md/)
  assert.doesNotMatch(poison, /scripts\/future-ds-author-only\.mjs/)
}
const checkerReport = (run) => {
  assert.equal(run.signal, null, run.error?.message || run.stderr)
  assert.doesNotThrow(() => JSON.parse(run.stdout), `checker did not emit JSON:\n${run.stderr}\n${run.stdout}`)
  return JSON.parse(run.stdout)
}

try {
  const syntheticCanonicalRoot = join(root, 'synthetic-canonical-source')
  mkdirSync(join(syntheticCanonicalRoot, '.future-provider'), { recursive: true })
  assert.throws(
    () => assertCanonicalInventoryClean(registry, { canonicalRoot: syntheticCanonicalRoot }),
    /forbidden runtime\/provider artifact:.*\.future-provider/,
    'a future provider discovery root may not hide runtime output inside the canonical source tree',
  )

  const dataDrivenReservedDiscovery = structuredClone(PROVIDER_REGISTRY)
  dataDrivenReservedDiscovery.canonical.reservedDiscovery.providerRootNames = dataDrivenReservedDiscovery.canonical.reservedDiscovery.providerRootNames.filter((root) => root !== '.claude')
  const activeDiscoveryBuild = buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: dataDrivenReservedDiscovery, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS })
  assert.equal(activeDiscoveryBuild.manifest.discoveryPolicy.providerRootNames.includes('.claude'), true, 'active provider discovery is unioned independently of reserved tombstones')

  const providerDeletesOwnSurface = structuredClone(PROVIDER_REGISTRY)
  providerDeletesOwnSurface.providers.find((provider) => provider.id === 'claude').adapter.discovery.providerRootNames = []
  assert.throws(
    () => buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: providerDeletesOwnSurface, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS }),
    /claude\.adapter\.discovery\.providerRootNames must declare generated root:\.claude/,
    'a provider addition cannot subtract its generated discovery root even when the common floor still reserves it',
  )

  const missingDiscoveryField = structuredClone(PROVIDER_REGISTRY)
  delete missingDiscoveryField.providers.find((provider) => provider.id === 'codex').adapter.discovery.configPaths
  assert.throws(
    () => buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: missingDiscoveryField, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS }),
    /discovery|configPaths|required property/,
    'unknown or incomplete provider discovery contracts must fail closed',
  )

  const missingEventBinding = structuredClone(PROVIDER_REGISTRY)
  delete missingEventBinding.providers.find((provider) => provider.id === 'codex').adapter.hookView.eventBindings.PreToolUse
  assert.throws(
    () => buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: missingEventBinding, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS }),
    /eventBindings.*(?:required|exactly cover)/,
    'every supported canonical event requires one explicit native registration name',
  )
  const ambiguousEventBinding = structuredClone(PROVIDER_REGISTRY)
  ambiguousEventBinding.providers.find((provider) => provider.id === 'codex').adapter.hookView.eventBindings.PostToolUse = 'PreToolUse'
  assert.throws(
    () => buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: ambiguousEventBinding, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS }),
    /unique native events/,
    'two canonical events may not collapse onto one native registration name',
  )

  const unknownMaterializer = structuredClone(PROVIDER_REGISTRY)
  unknownMaterializer.providers.find((provider) => provider.id === 'codex').adapter.hookView.materializerId = 'unregistered-hook-view-v1'
  assert.throws(
    () => buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: unknownMaterializer, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS }),
    /materializer.*unregistered|committed JSON Schema/,
    'an unknown provider materializer must fail closed before emitting any adapter bytes',
  )
  const unknownInstructionMaterializer = structuredClone(PROVIDER_REGISTRY)
  unknownInstructionMaterializer.providers.find((provider) => provider.id === 'codex').adapter.instructionView.materializerId = 'unregistered-instruction-view-v1'
  assert.throws(
    () => buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: unknownInstructionMaterializer, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS }),
    /materializer.*unregistered|committed JSON Schema/,
    'an unknown instruction materializer must fail closed before emitting any adapter bytes',
  )
  const withTree = (mutate) => {
    const value = structuredClone(PROVIDER_REGISTRY)
    value.providers.find((provider) => provider.id === 'codex').adapter.productManagedTrees = {
      fixture: {
        sourceRoot: 'scripts/test-fixtures/future-provider-managed-tree',
        destination: '.codex/fixture-tree',
        materializerId: 'closed-tree-copy-v1',
        transformPolicy: 'byte-exact',
      },
    }
    mutate(value.providers.find((provider) => provider.id === 'codex').adapter.productManagedTrees.fixture)
    return value
  }
  const unknownTreeMaterializer = withTree((tree) => { tree.materializerId = 'unregistered-tree-view-v1' })
  assert.throws(
    () => buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: unknownTreeMaterializer, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS }),
    /tree.*materializer|unregistered-tree-view-v1|committed JSON Schema/i,
    'an unknown product-tree materializer must fail closed before emitting any adapter bytes',
  )
  const unsafeTreeSource = withTree((tree) => { tree.sourceRoot = '../outside-repository' })
  assert.throws(
    () => buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: unsafeTreeSource, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS }),
    /sourceRoot|repository-relative|unsafe|committed JSON Schema/i,
    'a product-tree source may not escape the canonical repository root',
  )
  const fileBackedTree = withTree((tree) => { tree.sourceRoot = 'scripts/test-fixtures/future-provider-instruction-supplement.md' })
  assert.throws(
    () => buildCorpus({
      outDir: output,
      templateRoot: generatedTemplate,
      providerRegistry: fileBackedTree,
      providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
      providerLifecycle: genesisLifecycle(fileBackedTree),
    }),
    /sourceRoot must be a nonempty directory.*ADAPTER-BLOCKED/,
    'a regular file may not masquerade as a closed product tree',
  )

  const missingCanonicalRoot = structuredClone(PROVIDER_REGISTRY)
  missingCanonicalRoot.canonical.roots.commands = 'packages/design-system/ds-canonical/missing-commands-fixture'
  missingCanonicalRoot.canonical.compatibilityProjections.legacyClaudeInstruction.discoveryCategories
    .find((category) => category.name === 'commands').sourceRoot = missingCanonicalRoot.canonical.roots.commands
  assert.throws(
    () => buildCorpus({
      outDir: output,
      templateRoot: generatedTemplate,
      providerRegistry: missingCanonicalRoot,
      providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
      providerLifecycle: genesisLifecycle(missingCanonicalRoot),
    }),
    /canonical\.roots\.commands|compatibility category commands\.sourceRoot|does not exist/i,
    'a missing registry-declared canonical root must fail closed instead of reading the historical default',
  )
  const renamedCanonicalRoot = structuredClone(PROVIDER_REGISTRY)
  renamedCanonicalRoot.canonical.roots.commands = renamedCanonicalRoot.canonical.roots.references
  renamedCanonicalRoot.canonical.compatibilityProjections.legacyClaudeInstruction.discoveryCategories
    .find((category) => category.name === 'commands').sourceRoot = renamedCanonicalRoot.canonical.roots.commands
  assert.throws(
    () => buildCorpus({
      outDir: output,
      templateRoot: generatedTemplate,
      providerRegistry: renamedCanonicalRoot,
      providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
      providerLifecycle: genesisLifecycle(renamedCanonicalRoot),
    }),
    /COVERAGE FAIL\(commands\)/,
    'a renamed canonical root must be consumed and classified rather than silently falling back to ds-canonical/commands',
  )

  const activeLegacyHookTree = withTree((tree) => { tree.destination = '.claude/hooks' })
  activeLegacyHookTree.providers.find((provider) => provider.id === 'codex').adapter.discovery.providerRootNames = ['.agents', '.claude', '.codex']
  const activeLegacyHookBuild = buildCorpus({
    outDir: output,
    templateRoot: generatedTemplate,
    providerRegistry: activeLegacyHookTree,
    providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
    providerLifecycle: genesisLifecycle(activeLegacyHookTree),
  })
  const activeTree = activeLegacyHookBuild.manifest.providerSurfaces.codex.trees.find((tree) => tree.destination === '.claude/hooks')
  assert.ok(activeTree, 'fixture must declare the active .claude/hooks product tree')
  assert.equal(
    readFileSync(join(generatedTemplate, '.claude/hooks/nested/policy.json')).equals(readFileSync(join(output, activeTree.artifactRoot, 'nested/policy.json'))),
    true,
    'legacy cleanup must preserve a registry-owned active tree byte-exactly',
  )

  const materializedHeadlessProtocol = structuredClone(PROVIDER_REGISTRY)
  const materializedHeadless = materializedHeadlessProtocol.providers.find((provider) => provider.id === 'generic')
  materializedHeadless.adapter.generate = true
  materializedHeadless.adapter.productInstructionSource = 'scripts/fork-role-sources/AGENTS.product.md'
  materializedHeadless.adapter.skillView = {
    directory: materializedHeadless.skillDirectory,
    materializerId: 'agent-skills-directory-v1',
  }
  assert.throws(
    () => buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: materializedHeadlessProtocol, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS }),
    /headless-protocol must remain runtime-free, hookless, and non-materialized/,
    'headless protocols cannot silently become concrete provider runtimes',
  )

  const ambiguousLegacyTrees = structuredClone(PROVIDER_REGISTRY)
  ambiguousLegacyTrees.providers[0].adapter.managedTrees = { rules: '.claude/rules' }
  assert.throws(
    () => buildCorpus({ outDir: output, templateRoot: generatedTemplate, providerRegistry: ambiguousLegacyTrees, providerSkillSemantics: PROVIDER_SKILL_SEMANTICS }),
    /committed JSON Schema|additional properties/,
    'legacy managedTrees cannot silently choose repository or product lifecycle scope',
  )

  assert.throws(
    () => build(),
    /future-synthetic:generated adapter requires a registered skillView|committed JSON Schema/,
    'a hook-capable provider without a declared skill discovery surface must not receive skills',
  )

  future.adapter.skillView = { directory: future.skillDirectory, materializerId: 'markdown-workflows-directory-v1' }
  assert.throws(
    () => build(),
    /bug-fix-rhythm:future-synthetic => LEGACY_ASSUMPTION_BINDING_NOT_CERTIFIED/,
    'a new discovery surface must not inherit another provider binding profile',
  )

  semantics.bindingProfiles['repository-legacy-surfaces-v1'].providers[future.id] = {
    status: 'compatible',
    strategy: 'generated-binding-header',
    evidenceSource: 'test-future-provider-fork-surface.mjs#future-synthetic',
    resolutions: {
      'provider-identity': 'Treat foreign provider names only as historical provenance and retain future-synthetic as the runtime identity.',
    },
  }
  assert.throws(
    () => build(),
    /bug-fix-rhythm:future-synthetic has no resolution for provider-surface-path/,
    'a partially declared profile binding must remain adapter-blocked',
  )

  Object.assign(semantics.bindingProfiles['repository-legacy-surfaces-v1'].providers[future.id].resolutions, {
    'provider-surface-path': 'Resolve discovery and instruction paths only through the future-synthetic generated surface and canonical npm corpus.',
    'provider-native-tool': 'Map native-tool prose only to a registered future-synthetic capability; otherwise stop as adapter-blocked.',
    'provider-native-env': 'Normalize provider input to the GOVERNANCE_* contract at the adapter boundary.',
    'provider-transport': 'Use only an explicitly registered future-synthetic transport with provider and artifact identity evidence.',
  })

  semantics.bindingProfiles['repository-legacy-surfaces-v1'].providers[futureNoHook.id] = {
    status: 'compatible',
    strategy: 'generated-binding-header',
    evidenceSource: 'test-future-provider-fork-surface.mjs#future-nohook',
    resolutions: {
      'provider-identity': 'Treat foreign provider names only as historical provenance and retain future-nohook as the runtime identity.',
      'provider-surface-path': 'Resolve discovery and instruction paths only through the future-nohook generated surface and canonical npm corpus.',
      'provider-native-tool': 'This provider exposes no native hook tool; invoke only provider-neutral commands and protected CI.',
      'provider-native-env': 'Normalize any provider input to the GOVERNANCE_* contract at explicit command boundaries.',
      'provider-transport': 'Use only the explicitly registered future-nohook peer transport with artifact identity evidence.',
    },
  }
  assert.throws(
    () => build(),
    /independent-review:future-synthetic => INDEPENDENT_REVIEW_BINDING_NOT_CERTIFIED/,
    'a new provider must not inherit an independent-review peer or target-certification contract',
  )
  for (const provider of [future, futureNoHook]) {
    semantics.bindingProfiles['cross-provider-review-v1'].providers[provider.id] = {
      status: 'compatible',
      strategy: 'provider-thin-driver',
      evidenceSource: `test-future-provider-fork-surface.mjs#${provider.id}`,
    }
    provider.adapter.skillBindings['independent-review'] = {
      self: provider.id,
      selectionPolicy: 'highest-certified-independent-review-v1',
      reviewClass: 'tier-0-governance',
      transport: 'content-addressed-model-broker-exchange-v1',
      invocation: { strategy: 'main-context' },
      certificationContract: 'exact-provider-runtime-surface-role-target-v1',
    }
  }

  const semanticLeak = structuredClone(semantics)
  const providerBoundSkill = semanticLeak.skills.find((skill) => skill.name === 'bug-fix-rhythm')
  providerBoundSkill.classification = 'provider-neutral'
  providerBoundSkill.projection = 'provider-copy'
  providerBoundSkill.allowedAssumptions = []
  delete providerBoundSkill.bindingProfile
  delete providerBoundSkill.assumptionFindingCount
  delete providerBoundSkill.assumptionFingerprint
  assert.throws(
    () => build(semanticLeak),
    /bug-fix-rhythm:semantic assumption mismatch;.*ADAPTER-BLOCKED/,
    'provider-specific prose/path cannot be relabeled neutral and leak through the fork projection',
  )

  future.adapter.skillAliases = [{ name: 'unsafe-canonical-review', sourceSkill: 'canonical-reviewer' }]
  assert.throws(
    () => build(),
    /product skill alias unsafe-canonical-review sources canonical-reviewer, which is not role-approved in manifest\.skills => ADAPTER-BLOCKED/,
    'a provider alias must not reintroduce a DS-author-only workflow that the product role classification dropped',
  )
  future.adapter.skillAliases = []
  for (const [index, collisionPath] of [
    '.devcontainer/devcontainer.json',
    '.devcontainer/devcontainer.json/nested',
    '.devcontainer/onboard-banner.sh',
    '.devcontainer/onboard-banner.sh/nested',
    '.DEVCONTAINER/DEVCONTAINER.JSON',
  ].entries()) {
    const collidingRegistry = structuredClone(registry)
    const collidingProvider = collidingRegistry.providers.find((provider) => provider.id === future.id)
    collidingProvider.adapter.productManagedTrees.policies.destination = collisionPath
    collidingProvider.adapter.discovery.providerRootNames.push(collisionPath.split('/')[0])
    collidingProvider.adapter.discovery.providerRootNames.sort()
    assert.throws(
      () => buildCorpus({
        outDir: join(root, `non-provider-collision-${index}-fork`),
        templateRoot: join(root, `non-provider-collision-${index}-template`),
        providerRegistry: collidingRegistry,
        providerSkillSemantics: semantics,
        providerLifecycle: genesisLifecycle(collidingRegistry),
        providerCompatibility: fixtureProviderCompatibility(collidingRegistry),
        providerCertifications,
        releaseVersion,
      }),
      /provider lifecycle surface overlaps non-provider authority/,
      `provider surface must not equal or contain a non-provider authority:${collisionPath}`,
    )
  }
  const built = build()
  const surface = built.manifest.providerSurfaces[future.id]
  const noHookSurface = built.manifest.providerSurfaces[futureNoHook.id]
  const nonProviderAuthorityPaths = [...new Set([
    built.manifest.consumer.commonInstruction.destination,
    built.manifest.consumer.launcherDestination,
    ...Object.keys(built.manifest.consumer.managedFiles),
    ...CONSUMER_CONTROL_PLANE_PATHS,
    'package.custom.json',
    'package.custom.json/nested',
    'PACKAGE.CUSTOM.JSON',
    'agents.md',
    '.DEVCONTAINER/DEVCONTAINER.JSON',
    'GOVERNANCE/BIN',
    'governance',
  ])].sort()
  for (const collisionPath of nonProviderAuthorityPaths) {
    const collidingManifest = structuredClone(built.manifest)
    const collidingSurface = collidingManifest.providerSurfaces[future.id]
    const policyTree = collidingSurface.trees.find((tree) => tree.name === 'policies')
    const previousPath = policyTree.destination
    policyTree.destination = collisionPath
    collidingSurface.managedSurfaces = collidingSurface.managedSurfaces
      .map((managed) => managed.path === previousPath ? { ...managed, path: collisionPath } : managed)
      .sort((left, right) => compareUtf8Bytes(left.path, right.path))
    assert.throws(
      () => validateForkManifestProviderSurfaces(collidingManifest, 'poisoned manifest'),
      /provider surface overlaps non-provider authority|addresses a protected Git root/,
      `installed manifest must reject provider overlap with non-provider authority:${collisionPath}`,
    )
  }
  {
    const internallyAliasedManifest = structuredClone(built.manifest)
    const aliasedSurface = internallyAliasedManifest.providerSurfaces[future.id]
    const policyTree = aliasedSurface.trees.find((tree) => tree.name === 'policies')
    const previousPath = policyTree.destination
    policyTree.destination = '.FUTURE-PROVIDER/SKILLS/nested'
    aliasedSurface.managedSurfaces = aliasedSurface.managedSurfaces
      .map((managed) => managed.path === previousPath ? { ...managed, path: policyTree.destination } : managed)
      .sort((left, right) => compareUtf8Bytes(left.path, right.path))
    assert.throws(
      () => validateForkManifestProviderSurfaces(internallyAliasedManifest, 'same-provider alias manifest'),
      /managedSurfaces contain overlapping portable paths/,
      'one provider may not claim a case-aliased descendant of its own managed tree',
    )
  }
  assert.deepEqual(
    built.manifest.providerSurfaces.codex.skills,
    built.manifest.providerSurfaces.claude.skills,
    'product-role skills must remain provider-symmetric after the product review contract is registered',
  )
  assert.equal(built.manifest.providerSurfaces.codex.skills.includes('independent-review'), true)
  assert.equal(built.manifest.providerSurfaces.codex.skills.includes('canonical-reviewer'), false)
  assert.equal(surface.generated, true)
  assert.equal(
    built.manifest.providerAdapters[future.id].blockingExitCode,
    23,
    'a future provider must project its registered blocking exit code into the product adapter',
  )
  assert.equal(surface.instructionDestination, 'FUTURE.md')
  assert.equal(surface.hookDestination, '.future-provider/hooks.json')
  assert.equal(surface.skillDestination, '.future-provider/skills')
  assert.equal(surface.hookMaterializerId, 'portable-event-list-json-v1')
  assert.equal(surface.skillMaterializerId, 'markdown-workflows-directory-v1')
  assert.equal(surface.skillEntryFile, 'WORKFLOW.md')
  assert.deepEqual(surface.trees, [{
    schemaVersion: 1,
    name: 'policies',
    artifactRoot: `providers/${future.id}/trees/policies`,
    destination: '.future-provider/policies',
    materializerId: 'closed-tree-copy-v1',
    transformPolicy: 'byte-exact',
  }])
  assert.deepEqual(
    readFileSync(join(output, surface.trees[0].artifactRoot, 'nested/policy.json')),
    readFileSync(join(process.cwd(), future.adapter.productManagedTrees.policies.sourceRoot, 'nested/policy.json')),
    'the signed corpus tree must preserve canonical source bytes',
  )
  assert.deepEqual(
    readFileSync(join(generatedTemplate, surface.trees[0].destination, 'nested/policy.json')),
    readFileSync(join(process.cwd(), future.adapter.productManagedTrees.policies.sourceRoot, 'nested/policy.json')),
    'the initial scaffold must materialize the provider tree byte-for-byte',
  )
  const futureInstruction = readFileSync(join(output, surface.instructionArtifact), 'utf8')
  const futureSupplement = readFileSync(join(process.cwd(), future.adapter.productInstructionSource), 'utf8')
  assert.doesNotMatch(futureSupplement, /^\s*@[A-Za-z0-9_./@-]+\.md\s*$/mu, 'future fixture supplement must not hand-author the shared import')
  assert.equal(futureInstruction, `@AGENTS.md\n\n${futureSupplement}`, 'future instruction import must be materialized from the registered instruction view')
  const novelHookConfig = JSON.parse(readFileSync(join(output, surface.hookArtifact), 'utf8'))
  assert.equal(Array.isArray(novelHookConfig.events), true, 'novel provider must use its registered event-list materializer')
  assert.deepEqual(novelHookConfig.events.map((record) => record.event).sort(), ['afterWrite', 'beforeWrite'])
  assert.equal(novelHookConfig.events.some((record) => ['PreToolUse', 'PostToolUse'].includes(record.event)), false, 'native config must not leak canonical event identifiers')
  assert.equal(Object.hasOwn(novelHookConfig, 'hooks'), false, 'novel provider must not inherit the Codex hook-map shape')
  assert.equal(Array.isArray(novelHookConfig.events[0].groups[0].handlers[0].argv), true, 'novel provider must use argv handlers rather than Codex command objects')
  assert.equal(Object.hasOwn(novelHookConfig.events[0].groups[0], 'hooks'), false, 'novel provider groups must not inherit Codex hook groups')
  const novelHandlers = novelHookConfig.events.flatMap((event) =>
    event.groups.flatMap((group) => group.handlers))
  const expectedNovelDispatcher = buildProviderHookLaunchArgv([
    '/bin/bash',
    '--',
    'governance/bin/fork-governance-dispatcher.sh',
    future.id,
  ])
  assert.equal(
    novelHandlers.every((handler) =>
      JSON.stringify(handler.argv) === JSON.stringify(expectedNovelDispatcher)),
    true,
    'every future-provider product hook must cross the same fixed pre-launch environment boundary',
  )
  for (const providerId of ['claude', 'codex']) {
    const providerSurface = built.manifest.providerSurfaces[providerId]
    const hookConfig = JSON.parse(readFileSync(join(output, providerSurface.hookArtifact), 'utf8'))
    const commands = Object.values(hookConfig.hooks).flatMap((groups) =>
      groups.flatMap((group) => group.hooks.map((hook) => hook.command)))
    assert.equal(commands.length > 0, true)
    assert.equal(commands.every((command) => {
      const match = command.match(/governance\/bin\/([a-z0-9_-]+\.sh) [a-z][a-z0-9-]*$/)
      if (!match) return false
      return command === buildProviderHookLaunchArgv([
        '/bin/bash',
        '--',
        `governance/bin/${match[1]}`,
        providerId,
      ]).join(' ')
    }), true, `${providerId} product hook commands must use the canonical pre-launch boundary`)
  }
  assert.deepEqual(surface.nativeHookCoverage, {
    schemaVersion: 2,
    canonicalEvents: ['PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit'],
    projectedEvents: ['PostToolUse', 'PreToolUse'],
    projectedNativeEvents: [
      { canonicalEvent: 'PostToolUse', nativeEvent: 'afterWrite' },
      { canonicalEvent: 'PreToolUse', nativeEvent: 'beforeWrite' },
    ],
    excludedEvents: [
      {
        event: 'SessionStart',
        reasonCode: 'EVENT_NOT_SUPPORTED',
        authoritativeFallback: 'immutable-governance-check-and-protected-ci',
      },
      {
        event: 'Stop',
        reasonCode: 'EVENT_NOT_SUPPORTED',
        authoritativeFallback: 'immutable-governance-check-and-protected-ci',
      },
      {
        event: 'UserPromptSubmit',
        reasonCode: 'EVENT_NOT_SUPPORTED',
        authoritativeFallback: 'immutable-governance-check-and-protected-ci',
      },
    ],
  }, 'partial native event APIs must remain explicit and hard-gate backed')
  assert.deepEqual(
    novelHookConfig.events.map((record) => record.event).sort(),
    surface.nativeHookCoverage.projectedNativeEvents.map((record) => record.nativeEvent).sort(),
    'hook config may project only the provider-declared native event names',
  )
  const repositoryFutureHookConfig = buildProviderHookView({ providerId: future.id, registry, sourceRoot: process.cwd() }).config
  assert.deepEqual(repositoryFutureHookConfig.events.map((record) => record.event).sort(), ['afterWrite', 'beforeWrite'], 'repository adapter must use the same native event bindings as the product adapter')
  assert.deepEqual(noHookSurface.capabilities, {
    nativeHooks: false,
    hookEnforcement: 'ci-only',
    hardGate: 'provider-neutral-ci-required',
  })
  assert.equal(noHookSurface.hookArtifact, null)
  assert.equal(noHookSurface.hookDestination, null)
  assert.deepEqual(noHookSurface.nativeHookCoverage.projectedEvents, [])
  assert.deepEqual(noHookSurface.nativeHookCoverage.projectedNativeEvents, [])
  assert.equal(noHookSurface.nativeHookCoverage.excludedEvents.every((record) => (
    record.reasonCode === 'NATIVE_HOOK_API_UNAVAILABLE'
    && record.authoritativeFallback === 'immutable-governance-check-and-protected-ci'
  )), true)
  assert.equal(noHookSurface.exclusions[0].reasonCode, 'NATIVE_HOOK_API_UNAVAILABLE')
  assert.equal(built.manifest.ciReplay.length > 0, true, 'hookless providers must not weaken mandatory static CI replay')
  const replayContractKeys = [
    'event',
    'file',
    'sourceHook',
    'interpreter',
    'matcher',
    'outputMode',
    'inputContract',
    'transcriptRequirement',
  ].sort()
  for (const replay of built.manifest.ciReplay) {
    assert.deepEqual(
      Object.keys(replay).sort(),
      replayContractKeys,
      `CI replay must preserve the closed native hook contract:${replay.sourceHook}`,
    )
    const native = (built.manifest.hooks[replay.event] || []).find((hook) => (
      hook.file === replay.file
      && hook.sourceHook === replay.sourceHook
      && hook.runtime === replay.interpreter
      && hook.matcher === replay.matcher
      && hook.outputMode === replay.outputMode
      && hook.inputContract === replay.inputContract
      && hook.transcriptRequirement === replay.transcriptRequirement
    ))
    assert.ok(native, `CI replay drifted from its canonical native descriptor:${replay.event}:${replay.sourceHook}`)
  }
  const corpusLock = JSON.parse(readFileSync(join(output, 'governance.lock'), 'utf8'))
  const lockedFiles = new Set(corpusLock.entries.map((entry) => entry.file))
  assert.equal(lockedFiles.has(surface.instructionArtifact), true)
  assert.equal(lockedFiles.has(surface.hookArtifact), true)
  assert.equal([...lockedFiles].some((file) => file.startsWith(`${surface.skillArtifactRoot}/`)), true)
  assert.equal([...lockedFiles].some((file) => file.startsWith(`${surface.trees[0].artifactRoot}/`)), true)
  assert.equal(built.manifest.discoveryPolicy.providerRootNames.includes('.future-provider'), true)
  assert.equal(built.manifest.discoveryPolicy.instructionNames.includes('FUTURE.md'), true)
  assert.equal(built.manifest.discoveryPolicy.instructionOverrideNames.includes('FUTURE.override.md'), true)
  assert.equal(built.manifest.discoveryPolicy.configPaths.includes('.future-provider/config.toml'), true)
  assert.equal(built.manifest.discoveryPolicy.configPaths.includes('.future-mcp.json'), true)
  assert.equal(built.manifest.discoveryPolicy.pluginRootNames.includes('.future-plugin'), true)
  const builtBom = JSON.parse(readFileSync(join(output, 'consumer/lock.json'), 'utf8'))
  assert.equal(builtBom.upgradeProtocol.protocolId, 'protected-base-reconstruction-v2')
  for (const field of ['specificationSha256', 'schemaSha256', 'implementationSha256']) {
    assert.match(builtBom.upgradeProtocol[field], /^[a-f0-9]{64}$/, `consumer BOM must bind the exact protocol ${field}`)
  }
  assert.equal(
    builtBom.payload.discoveryPolicySha256,
    createHash('sha256').update(JSON.stringify(built.manifest.discoveryPolicy)).digest('hex'),
    'consumer BOM must bind the exact normalized discovery inventory',
  )
  const expectedTreeDigest = createHash('sha256').update(corpusLock.entries
    .filter((entry) => entry.file.startsWith(`${surface.trees[0].artifactRoot}/`))
    .map((entry) => `${entry.file}:${entry.sha256}`)
    .join('\n') + '\n').digest('hex')
  assert.equal(
    builtBom.payload.providerArtifactDigests[future.id].treeDigests.policies,
    expectedTreeDigest,
    'the immutable consumer BOM must directly bind every product-managed tree',
  )

  const semanticByName = new Map(semantics.skills.map((skill) => [skill.name, skill]))
  const foreignProviderSurface = /(?:anthropic|claude(?:\s+code)?|codex)|(?:~\/)?\.(?:claude|agents)(?:\/|\\)|\b(?:CLAUDE|CODEX)_[A-Z0-9_]+\b|@codex\b|\bcodex\s+(?:exec|review)\b/iu
  for (const skillName of surface.skills) {
    const sourceName = future.adapter.skillAliases.find((alias) => alias.name === skillName)?.sourceSkill || skillName
    const contract = semanticByName.get(sourceName)
    assert.ok(contract, `surface skill lacks canonical semantic classification:${skillName}`)
    const skillRoot = join(output, surface.skillArtifactRoot, skillName)
    const skillMd = readFileSync(join(skillRoot, 'WORKFLOW.md'), 'utf8')
    assert.equal(existsSync(join(skillRoot, 'SKILL.md')), false, `${skillName} must use the registered non-Agent-Skills entrypoint`)
    assert.doesNotMatch(
      skillMd,
      /<!-- _generated:[^>]*provider:\s*(?:claude|codex)\b|<!-- provider-binding:[^>]*provider=(?:claude|codex)\b/i,
      `${skillName} inherited a foreign provider marker`,
    )
    if (contract.classification === 'provider-neutral') {
      for (const body of textFiles(skillRoot)) {
        const withoutGeneratedProvenance = body.replace(/<!-- _generated:[\s\S]*?-->/g, '')
        assert.doesNotMatch(withoutGeneratedProvenance, foreignProviderSurface, `${skillName} leaked provider-specific prose or paths`)
      }
    } else if (contract.projection === 'provider-thin-driver') {
      const binding = future.adapter.skillBindings[sourceName]
      assert.ok(binding, `${skillName} lacks an explicit future-provider binding`)
      assert.match(skillMd, /currentProvider: future-synthetic/)
      assert.match(skillMd, /independentPeerProvider: selected-and-frozen-at-review-prepare-time/)
      assert.match(skillMd, new RegExp(`transport: ${binding.transport}`))
      assert.doesNotMatch(skillMd, /Provider binding contract/)
    } else {
      assert.match(skillMd, new RegExp(`provider-binding: profile=${contract.bindingProfile}; provider=${future.id}; strategy=generated-binding-header`))
      for (const assumption of contract.allowedAssumptions) {
        assert.match(skillMd, new RegExp('- `' + assumption + '`:'), `${skillName} omitted its ${assumption} binding resolution`)
      }
    }
  }

  mkdirSync(consumer, { recursive: true })
  mkdirSync(join(consumer, 'apps/demo/src'), { recursive: true })
  writeFileSync(join(consumer, 'apps/demo/package.json'), JSON.stringify({ name: 'demo', private: true, version: '0.0.0' }) + '\n')
  writeFileSync(join(consumer, 'apps/demo/src/index.ts'), 'export const clean = true\n')
  const dsRoot = join(consumer, 'node_modules/@qijenchen/design-system')
  const sbRoot = join(consumer, 'node_modules/@qijenchen/storybook-config')
  mkdirSync(join(dsRoot, 'ds-canonical'), { recursive: true })
  mkdirSync(join(dsRoot, 'src/tokens'), { recursive: true })
  mkdirSync(sbRoot, { recursive: true })
  cpSync(output, join(dsRoot, 'ds-canonical/fork'), { recursive: true })
  cpSync(
    new URL('../packages/design-system/src/tokens/utility-registry.json', import.meta.url),
    join(dsRoot, 'src/tokens/utility-registry.json'),
  )
  const bom = JSON.parse(readFileSync(join(output, 'consumer/lock.json'), 'utf8'))
  const templatePackage = JSON.parse(readFileSync(new URL('../template/ds-product-template/package.json', import.meta.url), 'utf8'))
  const executionRuntime = built.manifest.consumer.executionRuntime
  const authorityNpmLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))?.packages?.['node_modules/npm']
  assert.equal(templatePackage.engines?.node, `>=${executionRuntime.minimumNodeVersion}`, 'template Node range must derive from the authenticated corpus runtime')
  assert.equal(templatePackage.devDependencies?.npm, executionRuntime.exactNpmVersion, 'template npm pin must derive from the authenticated corpus runtime')
  assert.equal(authorityNpmLock?.version, executionRuntime.exactNpmVersion, 'authority npm lock must match the authenticated corpus runtime')
  assert.equal(authorityNpmLock?.resolved, `https://registry.npmjs.org/npm/-/npm-${executionRuntime.exactNpmVersion}.tgz`)
  assert.match(authorityNpmLock?.integrity || '', /^sha512-[A-Za-z0-9+/]+={0,2}$/)
  writeFileSync(join(consumer, 'package.json'), JSON.stringify(templatePackage, null, 2) + '\n')
  writeFileSync(join(dsRoot, 'package.json'), JSON.stringify({ name: '@qijenchen/design-system', version: bom.release.designSystem }) + '\n')
  writeFileSync(join(sbRoot, 'package.json'), JSON.stringify({ name: '@qijenchen/storybook-config', version: bom.release.storybookConfig }) + '\n')
  const lockPackages = {
    '': {
      name: templatePackage.name,
      version: templatePackage.version,
      dependencies: templatePackage.dependencies,
      devDependencies: templatePackage.devDependencies,
      engines: templatePackage.engines,
    },
    'node_modules/npm': {
      version: authorityNpmLock.version,
      resolved: authorityNpmLock.resolved,
      integrity: authorityNpmLock.integrity,
      dev: true,
      bin: { npm: 'bin/npm-cli.js' },
    },
  }
  for (const [name, version] of [['@qijenchen/design-system', bom.release.designSystem], ['@qijenchen/storybook-config', bom.release.storybookConfig]]) {
    const unscoped = name.split('/').at(-1)
    lockPackages[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${unscoped}-${version}.tgz`,
      integrity: 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    }
  }
  writeFileSync(join(consumer, 'package-lock.json'), JSON.stringify({ name: templatePackage.name, version: templatePackage.version, lockfileVersion: 3, packages: lockPackages }, null, 2) + '\n')

  const protectedCorpusPoisons = [
    {
      name: 'discovery-bom-binding',
      expected: /consumer BOM does not bind the discovery policy/,
      mutate: ({ manifest }) => {
        manifest.discoveryPolicy.configPaths.push('.future-provider/forged-config.toml')
        manifest.discoveryPolicy.configPaths.sort()
      },
    },
    {
      name: 'discovery-closed-shape',
      expected: /discoveryPolicy has an open or incomplete shape/,
      mutate: ({ manifest }) => { manifest.discoveryPolicy.unreviewedRoots = [] },
    },
    {
      name: 'governance-checker-bom-binding',
      expected: /governance checker is not exactly bound by BOM\/corpus lock/,
      mutate: ({ forkRoot, manifest }) => {
        writeFileSync(join(forkRoot, manifest.consumer.governanceCheck), 'export const forgedChecker = true\n')
      },
    },
    {
      name: 'shared-skill-digest',
      expected: /shared skill inventory\/digest is invalid/,
      mutate: ({ forkRoot, manifest }) => {
        const skillPath = join(forkRoot, 'skills', manifest.skills[0], 'SKILL.md')
        writeFileSync(skillPath, `${readFileSync(skillPath, 'utf8')}\nforged shared skill body\n`)
      },
    },
    {
      name: 'shared-skill-count',
      expected: /shared skill inventory\/digest is invalid/,
      mutate: ({ manifest }) => { manifest.skills = manifest.skills.slice(1) },
    },
    {
      name: 'shared-skill-inventory-same-count',
      expected: /shared skill inventory\/digest is invalid/,
      mutate: ({ manifest }) => {
        manifest.skills = ['forged-shared-skill', ...manifest.skills.slice(1)].sort()
      },
    },
  ]
  for (const poison of protectedCorpusPoisons) {
    const poisonedConsumer = join(root, `consumer-protected-corpus-${poison.name}`)
    cpSync(consumer, poisonedConsumer, { recursive: true })
    rewriteCorpusTrustChain(poisonedConsumer, poison.mutate)
    assert.throws(
      () => validateInstalledForkCorpus(poisonedConsumer),
      poison.expected,
      `recomputing the general manifest/corpus locks must not bypass the dedicated ${poison.name} binding`,
    )
  }

  {
    const staleLifecycleConsumer = join(root, 'consumer-stale-lifecycle-rehashed-category')
    cpSync(consumer, staleLifecycleConsumer, { recursive: true })
    rewriteFullyAuthenticatedCorpusTrustChain(staleLifecycleConsumer, ({ manifest }) => {
      const category = manifest.consumer.compatibilityCategories[0]
      assert.ok(category, 'fixture needs a compatibility discovery category')
      const replacementEntry = 'stale-lifecycle-rehashed.md'
      const replacementPath = `${category.destinationRoot}/${replacementEntry}`
      category.entries = [...category.entries, replacementEntry].sort()
      manifest[category.name] = [...manifest[category.name], replacementEntry].sort()
      const owner = manifest.providerSurfaces[category.providerId]
      owner.managedSurfaces.push({ path: replacementPath, kind: 'file' })
      owner.managedSurfaces.sort((left, right) => compareUtf8Bytes(left.path, right.path))
      manifest.consumer.materialization.exactPaths.push(replacementPath)
      manifest.consumer.materialization.exactPaths.sort()
    })
    assert.throws(
      () => validateInstalledForkCorpus(staleLifecycleConsumer),
      /currentSnapshot provider ids\/surfaces do not exactly match active providerSurfaces managedSurfaces/,
      'a fully rehashed compatibility category/surface rewrite must not leave a stale authenticated lifecycle snapshot',
    )
  }

  {
    const arbitraryManagedFileConsumer = join(root, 'consumer-arbitrary-provider-managed-file')
    cpSync(consumer, arbitraryManagedFileConsumer, { recursive: true })
    rewriteFullyAuthenticatedCorpusTrustChain(arbitraryManagedFileConsumer, ({ manifest }) => {
      const arbitraryPath = '.future-provider/arbitrary-managed-file.txt'
      const providerSurface = manifest.providerSurfaces[future.id]
      providerSurface.managedSurfaces.push({ path: arbitraryPath, kind: 'file' })
      providerSurface.managedSurfaces.sort((left, right) => compareUtf8Bytes(left.path, right.path))
      const snapshotProvider = manifest.providerLifecycle.currentSnapshot.providers.find((provider) => provider.id === future.id)
      snapshotProvider.surfaces.push({ path: arbitraryPath, kind: 'file' })
      snapshotProvider.surfaces.sort((left, right) => compareUtf8Bytes(left.path, right.path))
      const immutableProvider = manifest.providerLifecycle.immutableHeadSnapshot.providers.find((provider) => provider.id === future.id)
      immutableProvider.surfaces.push({ path: arbitraryPath, kind: 'file' })
      immutableProvider.surfaces.sort((left, right) => compareUtf8Bytes(left.path, right.path))
      manifest.consumer.materialization.exactPaths.push(arbitraryPath)
      manifest.consumer.materialization.exactPaths.sort()
    })
    assert.throws(
      () => validateInstalledForkCorpus(arbitraryManagedFileConsumer),
      /managedSurfaces files must exactly match non-shared instruction, hook, and compatibility leaves/,
      'a fully rehashed arbitrary FILE claim must not expand provider lifecycle authority beyond declared materializers',
    )
  }

  const materializationPoisonCases = [
    {
      name: 'exact-extra',
      expected: /consumer exact materialization inventory must be .*exactly derived from authenticated corpus/,
      mutate: (materialization) => {
        materialization.exactPaths = [...materialization.exactPaths, 'undeclared-materialization.txt'].sort()
      },
    },
    {
      name: 'exact-missing',
      expected: /consumer exact materialization inventory must be .*exactly derived from authenticated corpus/,
      mutate: (materialization) => {
        assert.equal(materialization.exactPaths.includes('npm-shrinkwrap.json'), true)
        materialization.exactPaths = materialization.exactPaths.filter((path) => path !== 'npm-shrinkwrap.json')
      },
    },
    {
      name: 'prefix-extra',
      expected: /consumer prefix materialization inventory must be .*exactly derived from authenticated corpus/,
      mutate: (materialization) => {
        materialization.pathPrefixes = [...materialization.pathPrefixes, 'undeclared-materialization/'].sort()
      },
    },
    {
      name: 'prefix-missing',
      expected: /consumer prefix materialization inventory must be .*exactly derived from authenticated corpus/,
      mutate: (materialization) => {
        const prefix = `${surface.skillDestination}/${surface.skills[0]}/`
        assert.equal(materialization.pathPrefixes.includes(prefix), true)
        materialization.pathPrefixes = materialization.pathPrefixes.filter((candidate) => candidate !== prefix)
      },
    },
  ]
  for (const poison of materializationPoisonCases) {
    const poisonedConsumer = join(root, `consumer-materialization-${poison.name}`)
    cpSync(consumer, poisonedConsumer, { recursive: true })
    rewriteMaterializationTrustChain(poisonedConsumer, poison.mutate)
    assert.throws(
      () => validateInstalledForkCorpus(poisonedConsumer),
      poison.expected,
      `a self-consistent ${poison.name} inventory must not redefine the authenticated materialization closure`,
    )
  }
  const nonProviderOwnerPoisons = [
    {
      name: 'common-vs-managed',
      mutate: (materialization, manifest) => {
        const previous = manifest.consumer.commonInstruction.destination
        const collision = 'scripts/sync-all.mjs'
        assert.equal(Object.hasOwn(manifest.consumer.managedFiles, collision), true)
        manifest.consumer.commonInstruction.destination = collision
        for (const providerSurface of Object.values(manifest.providerSurfaces)) {
          if (providerSurface.instructionDestination === previous) providerSurface.instructionDestination = collision
        }
        if (manifest.codex?.instructionDestination === previous) manifest.codex.instructionDestination = collision
        materialization.exactPaths = materialization.exactPaths.filter((path) => path !== previous)
      },
    },
    {
      name: 'launcher-vs-managed-descendant',
      mutate: (materialization, manifest) => {
        const previous = manifest.consumer.launcherDestination
        manifest.consumer.launcherDestination = 'scripts'
        materialization.exactPaths = [...new Set(materialization.exactPaths.map((path) => (
          path.startsWith(`${previous}/`) ? `scripts/${path.slice(previous.length + 1)}` : path
        )))].sort()
      },
    },
  ]
  for (const poison of nonProviderOwnerPoisons) {
    const poisonedConsumer = join(root, `consumer-owner-${poison.name}`)
    cpSync(consumer, poisonedConsumer, { recursive: true })
    rewriteMaterializationTrustChain(poisonedConsumer, poison.mutate)
    assert.throws(
      () => validateInstalledForkCorpus(poisonedConsumer),
      /non-provider materialization authorit(?:y|ies) overlap/,
      `a self-consistent ${poison.name} manifest may not collapse two logical writers into one path`,
    )
  }

  applyRefresh()
  const checker = join(dsRoot, 'ds-canonical/fork/consumer/governance-check.mjs')
  const runChecker = ({ full = false, repo = consumer } = {}) => checkerReport(spawnSync(
    process.execPath,
    ['--', checker, '--repo', repo, '--json'],
    {
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, ...(full ? {} : { PATH: '' }), GOVERNANCE_READ_ONLY: '1' },
    },
  ))
  const baseline = runChecker({ full: true })
  assert.equal(baseline.ok, true, JSON.stringify(baseline.diagnostics, null, 2))
  assert.deepEqual(scopedDiagnostics(baseline), [], JSON.stringify(scopedDiagnostics(baseline), null, 2))
  assert.deepEqual(
    baseline.evidence.providers[future.id].events,
    surface.nativeHookCoverage.projectedEvents,
    'attestation evidence must retain canonical event semantics',
  )
  assert.deepEqual(
    baseline.evidence.providers[future.id].nativeEvents,
    surface.nativeHookCoverage.projectedNativeEvents.map((record) => record.nativeEvent).sort(),
    'attestation evidence must retain the projected provider-native event identifiers',
  )
  assert.deepEqual(baseline.evidence.providers[futureNoHook.id].events, [], 'hookless provider evidence must report no canonical events')
  assert.deepEqual(baseline.evidence.providers[futureNoHook.id].nativeEvents, [], 'hookless provider evidence must report no native events')
  assert.deepEqual(
    baseline.diagnostics.filter((item) => /discovery policy|discoveryPolicy/i.test(item.message)),
    [],
    'signed future-provider discovery policy must be accepted without BOM/shape drift',
  )
  const consumerTree = join(consumer, surface.trees[0].destination)
  assert.deepEqual(
    readFileSync(join(consumerTree, 'nested/policy.json')),
    readFileSync(join(output, surface.trees[0].artifactRoot, 'nested/policy.json')),
    'existing-consumer refresh must install the exact locked product tree',
  )

  writeFileSync(join(consumerTree, 'nested/policy.json'), '{"tampered":true}\n')
  assert.equal(
    scopedDiagnostics(runChecker()).some((item) => item.ruleId === 'GOV-ADAPTER-005' && item.message.includes('product managed tree')),
    true,
    'consumer tree byte tampering must fail the provider-neutral hard checker',
  )
  applyRefresh()

  writeFileSync(join(consumerTree, 'EXTRA.md'), 'undeclared\n')
  assert.equal(
    scopedDiagnostics(runChecker()).some((item) => item.ruleId === 'GOV-ADAPTER-005' && item.message.includes('product managed tree')),
    true,
    'an undeclared tree leaf must fail exact closed-tree parity',
  )
  applyRefresh()

  const externalTree = join(root, 'external-tree-sentinel')
  mkdirSync(externalTree, { recursive: true })
  writeFileSync(join(externalTree, 'sentinel.txt'), 'preserve\n')
  rmSync(consumerTree, { recursive: true, force: true })
  symlinkSync(externalTree, consumerTree, 'dir')
  assert.throws(() => applyRefresh(), /symlink/i, 'consumer tree targets may not redirect refresh through a symlink')
  assert.equal(readFileSync(join(externalTree, 'sentinel.txt'), 'utf8'), 'preserve\n')
  rmSync(consumerTree, { force: true })
  applyRefresh()

  writeFileSync(join(consumer, 'FUTURE.md'), 'tampered\n')
  assert.equal(scopedDiagnostics(runChecker()).some((item) => item.ruleId === 'GOV-ADAPTER-002' && item.message.includes(future.id)), true)
  applyRefresh()

  rmSync(join(consumer, '.future-provider/hooks.json'))
  assert.equal(scopedDiagnostics(runChecker()).some((item) => item.ruleId === 'GOV-ADAPTER-001' || item.ruleId === 'GOV-ADAPTER-005'), true)
  applyRefresh()

  writeFileSync(join(consumer, '.future-provider/skills/bug-fix-rhythm/EXTRA.md'), 'unexpected\n')
  assert.equal(scopedDiagnostics(runChecker()).some((item) => item.ruleId === 'GOV-SKILL-003' && item.message.includes(future.id)), true)
  applyRefresh()

  const previousLifecycle = genesisLifecycle(registry)
  const previousLifecycleSnapshot = previousLifecycle.snapshots[0]
  const futureInventory = previousLifecycleSnapshot.providers.find((provider) => provider.id === future.id)

  // A provider may add a new top-level surface in a later authenticated release, but that release
  // is not authority to adopt a product-owned file/tree already occupying the newly claimed path.
  const additionRegistry = structuredClone(registry)
  const additionPath = '.future-provider/additional-policies'
  additionRegistry.providers.find((provider) => provider.id === future.id).adapter.productManagedTrees['additional-policies'] = {
    sourceRoot: 'scripts/test-fixtures/future-provider-managed-tree',
    destination: additionPath,
    materializerId: 'closed-tree-copy-v1',
    transformPolicy: 'byte-exact',
  }
  const additionSnapshot = lifecycleSnapshot(
    additionRegistry,
    nextReleaseVersion,
    [],
    lifecycleSnapshotSha256(previousLifecycleSnapshot),
  )
  const additionOutput = join(root, 'fork-addition')
  const additionTemplate = join(root, 'generated-template-addition')
  const additionBuilt = buildCorpus({
    outDir: additionOutput,
    templateRoot: additionTemplate,
    providerRegistry: additionRegistry,
    providerSkillSemantics: semantics,
    providerLifecycle: lifecycleLedger([previousLifecycleSnapshot, additionSnapshot]),
    providerCompatibility: fixtureProviderCompatibility(additionRegistry),
    providerCertifications,
    releaseVersion: nextReleaseVersion,
  })
  const additionConsumer = join(root, 'consumer-addition')
  cpSync(consumer, additionConsumer, { recursive: true })
  const previousAdditionCorpus = validateInstalledForkCorpus(additionConsumer)
  const additionDsRoot = join(additionConsumer, 'node_modules/@qijenchen/design-system')
  rmSync(join(additionDsRoot, 'ds-canonical/fork'), { recursive: true, force: true })
  cpSync(additionOutput, join(additionDsRoot, 'ds-canonical/fork'), { recursive: true })
  writeFileSync(join(additionDsRoot, 'package.json'), JSON.stringify({ name: '@qijenchen/design-system', version: nextReleaseVersion }) + '\n')
  const currentAdditionCorpus = validateInstalledForkCorpus(additionConsumer)
  {
    const legacyPriorConsumer = join(root, 'consumer-legacy-v3-prior')
    cpSync(consumer, legacyPriorConsumer, { recursive: true })
    rewriteFullyAuthenticatedCorpusTrustChain(legacyPriorConsumer, ({ manifest }) => {
      manifest.providerLifecycle.schemaVersion = 3
      delete manifest.providerLifecycle.currentSnapshot
      delete manifest.providerLifecycle.immutableHeadSnapshot
    })
    const legacyPriorCorpus = validateInstalledForkCorpus(legacyPriorConsumer)
    assert.equal(validateInstalledProviderTransition(legacyPriorCorpus, legacyPriorCorpus).mode, 'replay')
    assert.equal(
      validateInstalledProviderTransition(legacyPriorCorpus, currentAdditionCorpus).mode,
      'upgrade',
      'v3 may serve as the authenticated prior side of the one-way v3-to-v4 bridge',
    )

    const legacyTargetConsumer = join(root, 'consumer-legacy-v3-new-target')
    cpSync(additionConsumer, legacyTargetConsumer, { recursive: true })
    rewriteFullyAuthenticatedCorpusTrustChain(legacyTargetConsumer, ({ manifest }) => {
      manifest.providerLifecycle.schemaVersion = 3
      delete manifest.providerLifecycle.currentSnapshot
      delete manifest.providerLifecycle.immutableHeadSnapshot
    })
    const legacyTargetCorpus = validateInstalledForkCorpus(legacyTargetConsumer)
    assert.throws(
      () => validateInstalledProviderTransition(legacyPriorCorpus, legacyTargetCorpus),
      /legacy provider lifecycle v3 may be a prior corpus or exact same-version replay, never a new upgrade target/,
      'v3 must never be accepted as the target of a newer ordinary upgrade',
    )
  }
  {
    const namespaceBorrowConsumer = join(root, 'consumer-cross-provider-namespace-borrow')
    cpSync(additionConsumer, namespaceBorrowConsumer, { recursive: true })
    rewriteFullyAuthenticatedCorpusTrustChain(namespaceBorrowConsumer, ({ manifest }) => {
      const borrowedPath = '.nohook/borrowed-policies'
      const providerSurface = manifest.providerSurfaces[future.id]
      const addedTree = providerSurface.trees.find((tree) => tree.destination === additionPath)
      assert.ok(addedTree, 'fixture needs the retained provider surface addition')
      addedTree.destination = borrowedPath
      providerSurface.managedSurfaces = providerSurface.managedSurfaces
        .map((surface) => surface.path === additionPath ? { ...surface, path: borrowedPath } : surface)
        .sort((left, right) => compareUtf8Bytes(left.path, right.path))
      const snapshotProvider = manifest.providerLifecycle.currentSnapshot.providers.find((provider) => provider.id === future.id)
      snapshotProvider.surfaces = snapshotProvider.surfaces
        .map((surface) => surface.path === additionPath ? { ...surface, path: borrowedPath } : surface)
        .sort((left, right) => compareUtf8Bytes(left.path, right.path))
      manifest.consumer.materialization.pathPrefixes = manifest.consumer.materialization.pathPrefixes
        .map((prefix) => prefix === `${additionPath}/` ? `${borrowedPath}/` : prefix)
        .sort()
    })
    assert.throws(
      () => validateInstalledForkCorpus(namespaceBorrowConsumer),
      /added managed surface outside its previously reviewed discovery namespace/,
      'a retained provider may not borrow another provider namespace from the global signed discovery union',
    )
  }
  const additionTransition = validateInstalledProviderTransition(previousAdditionCorpus, currentAdditionCorpus)
  assert.deepEqual(
    additionTransition.additions.filter((record) => record.path === additionPath),
    [{ providerId: future.id, path: additionPath, kind: 'tree' }],
    'ordinary provider additions must be explicit in the authenticated transition plan',
  )
  const authorizeAddition = () => {
    return authorizeDisposableProviderRefreshTransaction({
      projectDir: additionConsumer,
      verifiedCorpus: currentAdditionCorpus,
      providerTransition: additionTransition,
    })
  }
  const beforeCollisionPackage = readFileSync(join(additionConsumer, 'package.json'))
  const beforeCollisionCommon = readFileSync(join(
    additionConsumer,
    previousAdditionCorpus.manifest.consumer.commonInstruction.destination,
  ))
  const portableAliasRoot = join(additionConsumer, '.future-provider/ADDITIONAL-POLICIES')
  mkdirSync(portableAliasRoot, { recursive: true })
  writeFileSync(join(portableAliasRoot, 'portable-product-owned.txt'), 'preserve portable alias\n')
  assert.throws(
    () => refreshLaunchers(additionConsumer, {
      verifiedCorpus: currentAdditionCorpus,
      providerTransition: additionTransition,
      transactionCapability: authorizeAddition(),
    }),
    /new provider surface target already exists/,
    'an added provider tree must reject a portable case alias even on a case-sensitive host',
  )
  assert.equal(readFileSync(join(portableAliasRoot, 'portable-product-owned.txt'), 'utf8'), 'preserve portable alias\n')
  assert.equal(readFileSync(join(additionConsumer, 'package.json')).equals(beforeCollisionPackage), true)
  assert.equal(readFileSync(
    join(additionConsumer, previousAdditionCorpus.manifest.consumer.commonInstruction.destination),
  ).equals(beforeCollisionCommon), true, 'portable alias collision must fail before any common/package mutation')
  rmSync(portableAliasRoot, { recursive: true, force: true })

  const collisionRoot = join(additionConsumer, additionPath)
  mkdirSync(collisionRoot, { recursive: true })
  writeFileSync(join(collisionRoot, 'product-owned.txt'), 'preserve\n')
  assert.throws(
    () => refreshLaunchers(additionConsumer, {
      verifiedCorpus: currentAdditionCorpus,
      providerTransition: additionTransition,
      transactionCapability: authorizeAddition(),
    }),
    /new provider surface target already exists/,
    'an added provider tree must not clobber an existing product-owned root',
  )
  assert.equal(readFileSync(join(collisionRoot, 'product-owned.txt'), 'utf8'), 'preserve\n')
  assert.equal(readFileSync(join(additionConsumer, 'package.json')).equals(beforeCollisionPackage), true)
  assert.equal(readFileSync(
    join(additionConsumer, previousAdditionCorpus.manifest.consumer.commonInstruction.destination),
  ).equals(beforeCollisionCommon), true, 'addition collision must fail before any common/package mutation')
  rmSync(collisionRoot, { recursive: true, force: true })
  refreshLaunchers(additionConsumer, {
    verifiedCorpus: currentAdditionCorpus,
    providerTransition: additionTransition,
    transactionCapability: authorizeAddition(),
  })
  assert.equal(
    readFileSync(join(additionConsumer, additionPath, 'nested/policy.json')).equals(
      readFileSync(join(additionOutput, additionBuilt.manifest.providerSurfaces[future.id].trees
        .find((tree) => tree.destination === additionPath).artifactRoot, 'nested/policy.json')),
    ),
    true,
    'an absent added provider root must materialize from the authenticated corpus',
  )

  // A pure ID rename is an all-transfer lifecycle transition: every prior path remains present and
  // is now owned by the named replacement. This exercises the authenticated manifest, installed
  // corpus reader, transition validator, refresh transaction, and shipped hard checker together.
  const renameRegistry = structuredClone(registry)
  const renamedFuture = renameRegistry.providers.find((provider) => provider.id === future.id)
  renamedFuture.id = 'future-synthetic-renamed'
  renamedFuture.displayName = 'Future synthetic renamed provider'
  for (const binding of Object.values(renamedFuture.adapter.skillBindings)) binding.self = renamedFuture.id
  const renameRetirement = {
    id: future.id,
    replacementProviderId: renamedFuture.id,
    retiredInVersion: nextReleaseVersion,
    reasonCode: 'PROVIDER_RENAMED',
    discovery: structuredClone(futureInventory.discovery),
    surfaces: [],
    transfers: structuredClone(futureInventory.surfaces),
  }
  renameRegistry.canonical.retiredProviders = [structuredClone(renameRetirement)]
  const renameSemantics = structuredClone(semantics)
  for (const profile of Object.values(renameSemantics.bindingProfiles)) {
    if (!profile.providers[future.id]) continue
    profile.providers[renamedFuture.id] = {
      ...structuredClone(profile.providers[future.id]),
      evidenceSource: `${profile.providers[future.id].evidenceSource}:pure-id-rename`,
    }
  }
  const renameSnapshot = lifecycleSnapshot(
    renameRegistry,
    nextReleaseVersion,
    [renameRetirement],
    lifecycleSnapshotSha256(previousLifecycleSnapshot),
  )
  const renameOutput = join(root, 'fork-rename')
  const renameTemplate = join(root, 'generated-template-rename')
  const renameBuilt = buildCorpus({
    outDir: renameOutput,
    templateRoot: renameTemplate,
    providerRegistry: renameRegistry,
    providerSkillSemantics: renameSemantics,
    providerLifecycle: lifecycleLedger([previousLifecycleSnapshot, renameSnapshot]),
    providerCompatibility: fixtureProviderCompatibility(renameRegistry),
    providerCertifications,
    releaseVersion: nextReleaseVersion,
  })
  assert.equal(renameBuilt.manifest.providerLifecycle.schemaVersion, 4, 'the optional transfer extension must preserve the self-authenticating v4 bridge')
  assert.deepEqual(renameBuilt.manifest.providerLifecycle.retiredProviders[0].transfers, futureInventory.surfaces)
  assert.deepEqual(renameBuilt.manifest.providerLifecycle.retiredProviders[0].surfaces, [])

  const renameConsumer = join(root, 'consumer-rename')
  cpSync(consumer, renameConsumer, { recursive: true })
  const previousRenameCorpus = validateInstalledForkCorpus(renameConsumer)
  const renameDsRoot = join(renameConsumer, 'node_modules/@qijenchen/design-system')
  const renameSbRoot = join(renameConsumer, 'node_modules/@qijenchen/storybook-config')
  rmSync(join(renameDsRoot, 'ds-canonical/fork'), { recursive: true, force: true })
  cpSync(renameOutput, join(renameDsRoot, 'ds-canonical/fork'), { recursive: true })
  writeFileSync(join(renameDsRoot, 'package.json'), JSON.stringify({ name: '@qijenchen/design-system', version: nextReleaseVersion }) + '\n')
  writeFileSync(join(renameSbRoot, 'package.json'), JSON.stringify({ name: '@qijenchen/storybook-config', version: nextReleaseVersion }) + '\n')
  const renamePackage = structuredClone(templatePackage)
  renamePackage.dependencies['@qijenchen/design-system'] = nextReleaseVersion
  renamePackage.devDependencies['@qijenchen/storybook-config'] = nextReleaseVersion
  writeFileSync(join(renameConsumer, 'package.json'), JSON.stringify(renamePackage, null, 2) + '\n')
  const renameLockPackages = structuredClone(lockPackages)
  renameLockPackages[''].dependencies = renamePackage.dependencies
  renameLockPackages[''].devDependencies = renamePackage.devDependencies
  for (const name of ['@qijenchen/design-system', '@qijenchen/storybook-config']) {
    const unscoped = name.split('/').at(-1)
    renameLockPackages[`node_modules/${name}`].version = nextReleaseVersion
    renameLockPackages[`node_modules/${name}`].resolved = `https://registry.npmjs.org/${name}/-/${unscoped}-${nextReleaseVersion}.tgz`
  }
  writeFileSync(join(renameConsumer, 'package-lock.json'), JSON.stringify({ name: renamePackage.name, version: renamePackage.version, lockfileVersion: 3, packages: renameLockPackages }, null, 2) + '\n')
  const currentRenameCorpus = validateInstalledForkCorpus(renameConsumer)
  const renameTransition = validateInstalledProviderTransition(previousRenameCorpus, currentRenameCorpus)
  assert.deepEqual(renameTransition.retirements[0].transfers, futureInventory.surfaces)
  const renameCapability = authorizeDisposableProviderRefreshTransaction({
    projectDir: renameConsumer,
    verifiedCorpus: currentRenameCorpus,
    providerTransition: renameTransition,
  })
  const renamed = refreshLaunchers(renameConsumer, {
    verifiedCorpus: currentRenameCorpus,
    providerTransition: renameTransition,
    transactionCapability: renameCapability,
  })
  assert.deepEqual(renamed.retired, [], 'an all-transfer rename must not delete any prior provider path')
  for (const surface of futureInventory.surfaces) {
    assert.equal(lstatSync(join(renameConsumer, surface.path))[surface.kind === 'file' ? 'isFile' : 'isDirectory'](), true, `transferred surface must remain materialized:${surface.path}`)
  }
  const renameChecker = join(renameDsRoot, 'ds-canonical/fork/consumer/governance-check.mjs')
  const renameReport = checkerReport(spawnSync(
    process.execPath,
    ['--', renameChecker, '--repo', renameConsumer, '--json'],
    {
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GOVERNANCE_READ_ONLY: '1' },
    },
  ))
  assert.equal(renameReport.ok, true, JSON.stringify(renameReport.diagnostics, null, 2))

  // A true removal is the deletion half of the same partition contract. The next immutable corpus
  // cleans only exact hashed tombstones, then the checker requires them to remain absent.
  const nextRegistry = structuredClone(registry)
  nextRegistry.providers = nextRegistry.providers.filter((provider) => provider.id !== future.id)
  const registryRetirement = {
    id: future.id,
    replacementProviderId: futureNoHook.id,
    retiredInVersion: nextReleaseVersion,
    reasonCode: 'PROVIDER_REPLACED',
    discovery: structuredClone(futureInventory.discovery),
    surfaces: structuredClone(futureInventory.surfaces),
  }
  nextRegistry.canonical.retiredProviders = [registryRetirement]
  const lifecycleRetirement = {
    ...structuredClone(registryRetirement),
    surfaces: futureInventory.surfaces.map((surface) => ({ ...surface, sha256: providerSurfaceDigest(consumer, surface) })),
  }
  const nextSnapshot = lifecycleSnapshot(
    nextRegistry,
    nextReleaseVersion,
    [lifecycleRetirement],
    lifecycleSnapshotSha256(previousLifecycleSnapshot),
  )
  const nextLifecycle = lifecycleLedger([previousLifecycleSnapshot, nextSnapshot])
  const nextOutput = join(root, 'fork-next')
  const nextTemplate = join(root, 'generated-template-next')
  const nextBuilt = buildCorpus({
    outDir: nextOutput,
    templateRoot: nextTemplate,
    providerRegistry: nextRegistry,
    providerSkillSemantics: semantics,
    providerLifecycle: nextLifecycle,
    providerCompatibility: fixtureProviderCompatibility(nextRegistry),
    providerCertifications,
    releaseVersion: nextReleaseVersion,
  })
  assert.equal(nextBuilt.manifest.providerLifecycle.schemaVersion, 4)
  assert.equal(nextBuilt.manifest.providerLifecycle.retiredProviders[0].id, future.id)
  const priorFutureInstruction = readFileSync(join(consumer, 'FUTURE.md'))
  const previousCorpus = validateInstalledForkCorpus(consumer)
  rmSync(join(dsRoot, 'ds-canonical/fork'), { recursive: true, force: true })
  cpSync(nextOutput, join(dsRoot, 'ds-canonical/fork'), { recursive: true })
  writeFileSync(join(dsRoot, 'package.json'), JSON.stringify({ name: '@qijenchen/design-system', version: nextReleaseVersion }) + '\n')
  writeFileSync(join(sbRoot, 'package.json'), JSON.stringify({ name: '@qijenchen/storybook-config', version: nextReleaseVersion }) + '\n')
  templatePackage.dependencies['@qijenchen/design-system'] = nextReleaseVersion
  templatePackage.devDependencies['@qijenchen/storybook-config'] = nextReleaseVersion
  writeFileSync(join(consumer, 'package.json'), JSON.stringify(templatePackage, null, 2) + '\n')
  lockPackages[''].dependencies = templatePackage.dependencies
  lockPackages[''].devDependencies = templatePackage.devDependencies
  for (const name of ['@qijenchen/design-system', '@qijenchen/storybook-config']) {
    const unscoped = name.split('/').at(-1)
    lockPackages[`node_modules/${name}`].version = nextReleaseVersion
    lockPackages[`node_modules/${name}`].resolved = `https://registry.npmjs.org/${name}/-/${unscoped}-${nextReleaseVersion}.tgz`
  }
  writeFileSync(join(consumer, 'package-lock.json'), JSON.stringify({ name: templatePackage.name, version: templatePackage.version, lockfileVersion: 3, packages: lockPackages }, null, 2) + '\n')
  const currentCorpus = validateInstalledForkCorpus(consumer)
  const transition = validateInstalledProviderTransition(previousCorpus, currentCorpus)
  const authorizeTransition = () => {
    return authorizeDisposableProviderRefreshTransaction({ projectDir: consumer, verifiedCorpus: currentCorpus, providerTransition: transition })
  }
  writeFileSync(join(consumer, 'FUTURE.md'), 'user-replaced-before-retirement\n')
  assert.throws(
    () => refreshLaunchers(consumer, {
      verifiedCorpus: currentCorpus,
      providerTransition: transition,
      transactionCapability: authorizeTransition(),
    }),
    /content differs from immutable prior artifact/,
    'a first retirement must not delete a path whose bytes no longer equal the prior generated artifact',
  )
  assert.equal(readFileSync(join(consumer, 'FUTURE.md'), 'utf8'), 'user-replaced-before-retirement\n')
  assert.equal(lstatSync(join(consumer, '.future-provider/skills')).isDirectory(), true, 'digest mismatch must reject the entire deletion plan before its first removal')
  writeFileSync(join(consumer, 'FUTURE.md'), priorFutureInstruction)
  const transactionCapability = authorizeDisposableProviderRefreshTransaction({ projectDir: consumer, verifiedCorpus: currentCorpus, providerTransition: transition })
  const migrated = refreshLaunchers(consumer, { verifiedCorpus: currentCorpus, providerTransition: transition, transactionCapability })
  assert.deepEqual(migrated.retired.sort(), futureInventory.surfaces.map((surface) => surface.path).sort())
  assert.equal(lstatSync(join(consumer, '.nohook/skills')).isDirectory(), true, 'replacement provider surface must remain installed')
  assert.equal(runChecker({ full: true }).ok, true, 'N+1 signed tombstone migration must converge to a fully compliant consumer')

  writeFileSync(join(consumer, 'FUTURE.md'), '# stale retired provider instruction\n')
  assert.equal(runChecker().diagnostics.some((item) => item.ruleId === 'GOV-LIFECYCLE-001' && item.message.includes('FUTURE.md')), true)
  applyRefresh()
  assert.equal(readFileSync(join(consumer, 'FUTURE.md'), 'utf8'), '# stale retired provider instruction\n', 'historical tombstones must not re-delete a user-recreated reserved path')
  rmSync(join(consumer, 'FUTURE.md'))

  mkdirSync(join(consumer, 'nested-product'), { recursive: true })
  mkdirSync(join(consumer, '.future-plugin'), { recursive: true })
  writeFileSync(join(consumer, 'nested-product/FUTURE.md'), '# nested provider instruction\n')
  writeFileSync(join(consumer, 'FUTURE.override.md'), '# provider override\n')
  writeFileSync(join(consumer, '.future-mcp.json'), '{"tools":{}}\n')
  mkdirSync(join(consumer, '.future-provider'), { recursive: true })
  writeFileSync(join(consumer, '.future-provider/config.toml'), 'tool = "local"\n')
  writeFileSync(join(consumer, '.future-plugin/plugin.json'), '{"name":"local"}\n')
  mkdirSync(join(consumer, 'apps/demo/build'), { recursive: true })
  writeFileSync(join(consumer, 'apps/demo/build/NOHOOK.override.md'), '# hidden in an excluded build output\n')
  const discoveryAttack = runChecker()
  const extensionMessages = discoveryAttack.diagnostics
    .filter((item) => item.ruleId === 'GOV-EXTENSION-001')
    .map((item) => item.message)
    .join('\n')
  for (const path of ['nested-product/FUTURE.md', 'FUTURE.override.md', '.future-mcp.json', '.future-provider/config.toml', '.future-plugin', 'apps/demo/build/NOHOOK.override.md']) {
    assert.match(extensionMessages, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `signed future discovery policy did not close ${path}`)
  }

  rmSync(join(consumer, 'apps/demo/build/NOHOOK.override.md'))
  const fifo = spawnSync('mkfifo', [join(consumer, 'apps/demo/build/NOHOOK.local.md')], { encoding: 'utf8' })
  assert.equal(fifo.status, 0, fifo.stderr)
  assert.equal(runChecker().diagnostics.some((item) => item.ruleId === 'GOV-SPECIAL-001' && item.message.includes('NOHOOK.local.md')), true)
  rmSync(join(consumer, 'apps/demo/build/NOHOOK.local.md'))

  linkSync(join(consumer, 'NOHOOK.md'), join(consumer, 'apps/demo/build/NOHOOK.local.md'))
  assert.equal(runChecker().diagnostics.some((item) => item.ruleId === 'GOV-ALIAS-001' && item.message.includes('NOHOOK.local.md')), true)
  rmSync(join(consumer, 'apps/demo/build/NOHOOK.local.md'))

  console.log('✓ full clean-room check covers hookless onboarding, all-transfer rename, hashed deletion convergence, excluded-output discovery, and unaliased regular surfaces')
} finally {
  rmSync(root, { recursive: true, force: true })
}

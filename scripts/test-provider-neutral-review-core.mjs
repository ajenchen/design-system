#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  deepAuditProviderIdentityDigest,
  digestInventoryRows,
  prepareDeepAuditRun,
  stableStringify,
} from './lib/deep-audit-evidence-contract.mjs'
import { captureGitVisibleWorktree } from './lib/worktree-fingerprint.mjs'
import {
  buildBrokerGlobalContentSet,
  buildBrokerNoSampleReviewGraph,
  buildBrokerStructuralReviewGraphResult,
  buildBrokerShardCarrierMetadata,
  buildBrokerTaskDispatchDescriptor,
  buildBrokerTaskSet,
  buildContentAddressedBrokerShards,
  closeBrokerNoSampleReviewGraph,
  exportBrokerReviewGraphWorkCarrier,
  exportBrokerReviewGraphBatchCarrier,
  exportBrokerShardCarrier,
  loadModelEvidenceBrokerPlan,
  materializeBrokerReviewGraphWorkCarrier,
  materializeBrokerReviewGraphBatchCarrier,
  materializeBrokerShardCarrier,
  parseBrokerShardCarrierBundle,
  preflightBrokerDispatch,
  serializeBrokerShardCarrierBundle,
  validateBrokerGlobalContentSet,
  validateBrokerNoSampleReviewGraph,
  validateBrokerReviewGraphPortablePayloadBudget,
  validateBrokerReviewGraphBatchPortablePayloadBudget,
  validateBrokerTaskDispatchDescriptor,
  validateBrokerTaskSet,
} from './lib/model-evidence-broker.mjs'
import {
  buildModelBrokerReviewGraphCapabilityBudget,
  buildModelBrokerResultCarrier,
  buildModelBrokerReviewGraphResultCarrier,
  closeModelBrokerExchange,
  deriveReviewGraphSynthesisSemantics,
  ingestModelBrokerReviewGraphExchange,
  ingestModelBrokerReviewGraphExchangeResult,
  ingestModelBrokerExchangeTask,
  loadModelBrokerExchangeTrustState,
  materializeModelBrokerApiRequest,
  prepareModelBrokerExchangeRequest,
  prepareModelBrokerExchangeSchedule,
  prepareModelBrokerReviewGraphExchangeRequest,
  prepareModelBrokerReviewGraphExchangeSchedule,
  validateModelBrokerExchangeSchedule,
  validateModelBrokerReviewGraphExchangeSchedule,
} from './lib/model-broker-transcript.mjs'
import {
  expandComponentA1bCoverage,
  loadModelEvidencePlan,
} from './lib/model-evidence-plan.mjs'
import { buildComponentClaimInventory } from './lib/component-claim-inventory.mjs'
import {
  iterateCompleteModelReviewTasks,
  prepareProviderNeutralReviewExchange,
} from './run-model-deep-audit.mjs'
import {
  resolveHighestCertifiedReviewCapability,
} from '../packages/governance/src/provider-review-binding.mjs'

const ROOT = process.cwd()
const digest = (value) => createHash('sha256').update(value).digest('hex')
const normalize = (value) => Array.isArray(value)
  ? value.map(normalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]))
    : value
const canonical = (value) => JSON.stringify(normalize(value))
const canonicalBytes = (value) => Buffer.from(`${canonical(value)}\n`)

function write(root, path, bytes) {
  const target = resolve(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, bytes)
}

const FIXTURE_PROVIDER = {
  codex: {
    displayName: 'Codex',
    runtimeIdentity: 'codex-desktop',
    runtimeSurface: 'local',
    runtimeProfileId: 'codex-desktop-local',
  },
  claude: {
    displayName: 'Claude Code',
    runtimeIdentity: 'claude-code-cli',
    runtimeSurface: 'local',
    runtimeProfileId: 'claude',
  },
}

function fixtureProviderBindings(authorProviderId) {
  const reviewerProviderId = authorProviderId === 'codex' ? 'claude' : 'codex'
  const reviewBindingDigest = digest('fixture-managed-model-broker-v1-mutual-review-binding')
  const bind = (providerId, peerProviderId) => ({
    id: providerId,
    displayName: FIXTURE_PROVIDER[providerId].displayName,
    providerKind: 'concrete-runtime',
    ...FIXTURE_PROVIDER[providerId],
    reviewTransport: 'managed-model-broker-v1',
    reviewSkill: 'deep-audit-cross-codex',
    reviewPeerId: peerProviderId,
    certificationContract: 'exact-provider-runtime-surface-role-target-v1',
    reviewBindingDigest,
    registryRecordDigest: digest(`fixture-registry-record:${providerId}`),
    runtimeCertification: null,
  })
  return {
    self: bind(authorProviderId, reviewerProviderId),
    peer: bind(reviewerProviderId, authorProviderId),
  }
}

function fixtureManifest(root, authorProviderId) {
  const specPath = 'packages/design-system/src/components/Widget/widget.spec.md'
  const implementationPath = 'packages/design-system/src/components/Widget/Widget.tsx'
  const binaryPath = 'packages/design-system/src/components/Widget/fixture.bin'
  const files = new Map([
    [specPath, Buffer.from('# Widget\r\n支援送出 🚀\r\n保留 LF\n')],
    [implementationPath, Buffer.from(Array.from(
      { length: 20 },
      (_, index) => `export const widget${index} = (value) => \`送出${index}:\${value}\`\n`,
    ).join(''))],
    [binaryPath, Buffer.from([0x00, 0xff, 0x10, 0x80, 0x41])],
  ])
  for (const [path, bytes] of files) write(root, path, bytes)
  const inventory = [...files.entries()].map(([path, bytes]) => ({
    path,
    kind: 'file',
    mode: '100644',
    bytes: bytes.length,
    sha256: digest(bytes),
  })).sort((left, right) => left.path.localeCompare(right.path, 'en'))
  const componentPaths = inventory.map((row) => row.path).sort()
  const providers = fixtureProviderBindings(authorProviderId)
  const manifest = {
    runId: authorProviderId === 'codex'
      ? '22222222-2222-4222-8222-222222222222'
      : '33333333-3333-4333-8333-333333333333',
    head: authorProviderId === 'codex' ? '1'.repeat(40) : '3'.repeat(40),
    tree: authorProviderId === 'codex' ? '2'.repeat(40) : '4'.repeat(40),
    indexDigest: digest(`fixture-index:${authorProviderId}`),
    inventoryDigest: digest(canonical(inventory)),
    rubricDigest: digest(`fixture-rubric:${authorProviderId}`),
    worktreeFingerprint: digest(`fixture-worktree:${authorProviderId}`),
    authorProvider: authorProviderId,
    providerIdentityDigest: null,
    providers,
    inventory,
    components: [{
      name: 'Widget',
      paths: componentPaths,
      digest: digestInventoryRows(inventory, componentPaths),
    }],
  }
  manifest.providerIdentityDigest = deepAuditProviderIdentityDigest({
    authorProvider: manifest.authorProvider,
    providers: manifest.providers,
  })
  return {
    manifest,
    manifestSha256: digest(`${stableStringify(manifest, 2)}\n`),
    componentPaths,
  }
}

function fixturePlan(base) {
  const plan = structuredClone(base.plan)
  plan.limits.maxChunkBytes = 32
  plan.limits.maxRawContentBytesPerShard = 256
  plan.limits.maxPromptBytesPerShard = 131072
  plan.limits.maxEstimatedTokensPerShard = 65536
  plan.limits.maxChunksPerShard = 8
  plan.limits.maxClaimsPerShard = 4
  plan.budgets.wholeTask = {
    maxTotalSourceBytes: 4096,
    maxShardCount: 64,
    maxProviderCalls: 64,
    maxCostUnits: 2048,
  }
  plan.budgets.dispatchBatch = {
    maxTotalSourceBytes: 1048576,
    maxShardCount: 128,
    maxProviderCalls: 128,
    maxCostUnits: 4096,
  }
  plan.budgets.fullReview = {
    maxTaskCount: 4,
    maxTotalSourceBytes: 4194304,
    maxShardCount: 256,
    maxProviderCalls: 256,
    maxCostUnits: 8192,
  }
  return {
    ...base,
    plan,
    planDigest: digest(canonical(plan)),
  }
}

function fixtureTasks({
  root,
  manifest,
  manifestSha256,
  planState,
  modelPlanState,
  judgmentDimensions = modelPlanState.judgmentDimensions.slice(0, 1),
  includeComponent = true,
}) {
  const judgmentPaths = manifest.inventory.map((row) => row.path).sort()
  const tasks = judgmentDimensions.map((dimension) => ({
      kind: 'judgment',
      subject: dimension.dim,
      coverage: {
        inventoryPaths: judgmentPaths,
        inventoryDigest: digestInventoryRows(manifest.inventory, judgmentPaths),
        filesScanned: judgmentPaths.length,
      },
      claimInventory: null,
    }))
  if (includeComponent) {
    const claimInventory = buildComponentClaimInventory({
      repoRoot: root,
      manifest,
      component: 'Widget',
    })
    tasks.push({
      kind: 'component-a1b',
      subject: 'Widget',
      coverage: expandComponentA1bCoverage(manifest, 'Widget'),
      claimInventory,
    })
  }
  return tasks.map((task) => {
    const shardSet = buildContentAddressedBrokerShards({
      repoRoot: root,
      manifest,
      manifestSha256,
      coveragePaths: task.coverage.inventoryPaths,
      coverageInventoryDigest: task.coverage.inventoryDigest,
      taskKind: task.kind,
      subject: task.subject,
      modelEvidencePlanDigest: modelPlanState.planDigest,
      dependencySourceInventory: task.claimInventory?.dependencySourceInventory ?? null,
      claimInventory: task.claimInventory,
      planState,
    })
    const descriptor = buildBrokerTaskDispatchDescriptor(shardSet, {
      planState,
      claimInventoryDigest: task.claimInventory?.claimInventoryDigest ?? null,
      judgmentRule: task.kind === 'judgment'
        ? (() => {
            const record = modelPlanState.judgmentByDimension.get(task.subject)
            return {
              dim: record.dim,
              ruleId: `DS-DIM-${String(record.dim).padStart(3, '0')}`,
              mechanism: record.mechanism,
            }
          })()
        : null,
    })
    return { task, shardSet, descriptor }
  })
}

function resultForShard(shard, reviewIdentity) {
  const a1b = shard.identity.taskKind === 'component-a1b'
  const result = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-shard-result',
    runId: shard.identity.runId,
    providerId: reviewIdentity.reviewerProviderId,
    requestModelId: reviewIdentity.requestModelId,
    modelReleaseId: reviewIdentity.modelReleaseId,
    modelReleaseBindingDigest: reviewIdentity.modelReleaseBindingDigest,
    modelReleaseRegistryDigest: reviewIdentity.modelReleaseRegistryDigest,
    selectedProfileDigest: reviewIdentity.selectedProfileDigest,
    taskKind: shard.identity.taskKind,
    subject: shard.identity.subject,
    shardId: shard.shardId,
    batchDigest: shard.batchDigest,
    chunkVerdicts: shard.chunks.map((chunk) => ({ chunkId: chunk.chunkId, status: 'reviewed' })),
    findings: [],
    summary: 'Structural fixture adapter reviewed every exact content-addressed chunk in this shard.',
  }
  if (a1b) {
    result.claimVerdicts = shard.claims.map((claim) => {
      const graph = shard.claimEvidenceGraph
      const binding = graph.claimBindings.find((item) => item.claimId === claim.claimId)
      const supportingChunkIds = graph.status === 'self-contained'
        ? [...new Set([
            ...binding.claimSourceChunkIds,
            ...graph.implementationChunkIds,
            ...graph.dependencyPackages.flatMap((item) => item.chunkIds),
          ])].sort()
        : [...binding.claimSourceChunkIds].sort()
      return {
        claimId: claim.claimId,
        status: graph.status === 'self-contained' ? 'verified' : 'unverifiable',
        supportingChunkIds,
      }
    })
  }
  return result
}

function providerResponse(providerId, requestModelId, result, ordinal) {
  const text = canonical(result)
  if (providerId === 'claude') {
    return {
      id: `msg_fixture_${ordinal}`,
      model: requestModelId,
      type: 'message',
      stop_reason: 'end_turn',
      stop_sequence: null,
      content: [{ type: 'text', text }],
    }
  }
  return {
    id: `resp_fixture_${ordinal}`,
    model: requestModelId,
    status: 'completed',
    incomplete_details: null,
    error: null,
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
  }
}

const capabilityRegistry = JSON.parse(readFileSync(
  new URL('../infra/governance/providers/review-capability-registry.json', import.meta.url),
  'utf8',
))
const providerRegistry = JSON.parse(readFileSync(
  new URL('../packages/governance/canonical/providers.json', import.meta.url),
  'utf8',
))
const invocationRegistry = JSON.parse(readFileSync(
  new URL('../infra/governance/providers/model-invocation-profiles.json', import.meta.url),
  'utf8',
))
const modelReleaseRegistry = JSON.parse(readFileSync(
  new URL('../infra/governance/providers/model-release-registry.json', import.meta.url),
  'utf8',
))
const fixtureCapabilityCertification = (id, reviewProfileId) => {
  const profile = capabilityRegistry.reviewProfiles.find((record) => record.id === reviewProfileId)
  assert(profile, `fixture review profile must exist:${reviewProfileId}`)
  return {
    id,
    reviewProfileId,
    reviewProfileDigest: digest(canonical(profile)),
    providerId: profile.providerId,
    modelReleaseId: profile.modelReleaseId,
    entitlementId: profile.entitlementId,
    status: 'certified',
    assuranceTier: 'maximum',
    reasoningTier: 'maximum',
    computeTier: 'maximum',
    certifiedAt: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-08-25T00:00:00.000Z',
    evidence: {
      reference: `fixture/${id}.json`,
      sha256: digest(`fixture-capability-certification:${id}`),
    },
  }
}
const fixtureCapabilityLedger = {
  schemaVersion: 1,
  kind: 'review-capability-certification-ledger',
  certifications: [
    fixtureCapabilityCertification('fixture-claude-opus', 'claude-managed-api-opus-4-8'),
    fixtureCapabilityCertification('fixture-codex-sol', 'codex-managed-api-sol'),
  ].sort((left, right) => Buffer.from(left.id).compare(Buffer.from(right.id))),
}

function applyFixtureCapabilitySelection(base, authorProviderId) {
  const resolved = resolveHighestCertifiedReviewCapability({
    registry: providerRegistry,
    capabilityRegistry,
    capabilityCertificationLedger: fixtureCapabilityLedger,
    invocationRegistry,
    modelReleaseRegistry,
    skill: 'deep-audit-cross-codex',
    selfProviderId: authorProviderId,
    authorProviderId,
    entitlementAvailability: [],
    now: new Date('2026-07-26T00:00:00.000Z'),
  })
  const reviewerProviderId = resolved.peer.id
  const providerRecord = (providerId, peerProviderId) => {
    const registryRecord = providerRegistry.providers.find((record) => record.id === providerId)
    return {
      id: providerId,
      displayName: registryRecord.displayName,
      providerKind: registryRecord.providerKind,
      ...FIXTURE_PROVIDER[providerId],
      reviewTransport: resolved.transport,
      reviewSkill: 'deep-audit-cross-codex',
      reviewPeerId: peerProviderId,
      certificationContract: resolved.certificationContract,
      reviewBindingDigest: resolved.bindingDigest,
      registryRecordDigest: digest(canonical(registryRecord)),
      runtimeCertification: null,
    }
  }
  base.manifest.schemaVersion = 4
  base.manifest.reviewSelection = resolved.selectionReceipt
  base.manifest.providers = {
    self: providerRecord(authorProviderId, reviewerProviderId),
    peer: providerRecord(reviewerProviderId, authorProviderId),
  }
  base.manifest.providerIdentityDigest = deepAuditProviderIdentityDigest({
    authorProvider: authorProviderId,
    providers: base.manifest.providers,
    reviewSelection: base.manifest.reviewSelection,
  })
  base.manifestSha256 = digest(`${stableStringify(base.manifest, 2)}\n`)
  return base
}

function selectedFixtureManifest(root, authorProviderId) {
  return applyFixtureCapabilitySelection(fixtureManifest(root, authorProviderId), authorProviderId)
}

function selectedTransportBudgetRegressionManifest(
  root,
  authorProviderId,
  repeatCount = 1024,
) {
  const base = fixtureManifest(root, authorProviderId)
  const implementationPath =
    'packages/design-system/src/components/Widget/Widget.tsx'
  write(root, implementationPath, Buffer.from(
    'export const transportBudgetEvidence = true\n'.repeat(repeatCount),
  ))
  base.manifest.inventory = base.componentPaths.map((path) => {
    const bytes = readFileSync(resolve(root, path))
    return {
      path,
      kind: 'file',
      mode: '100644',
      bytes: bytes.length,
      sha256: digest(bytes),
    }
  }).sort((left, right) => left.path.localeCompare(right.path, 'en'))
  base.manifest.inventoryDigest = digest(canonical(base.manifest.inventory))
  base.manifest.components = [{
    name: 'Widget',
    paths: [...base.componentPaths],
    digest: digestInventoryRows(base.manifest.inventory, base.componentPaths),
  }]
  return applyFixtureCapabilitySelection(base, authorProviderId)
}

function fixtureReviewCapabilityBudget(manifest, overrides = {}) {
  const selected = manifest.reviewSelection.selected
  return buildModelBrokerReviewGraphCapabilityBudget({
    capabilityCertificationId: selected.capabilityCertificationId,
    selectedCapabilityCertificationDigest:
      manifest.reviewSelection.selectedCapabilityCertificationDigest,
    maxInputBytes: overrides.maxInputBytes ?? 4 * 1024 * 1024,
    maxOutputBytes: overrides.maxOutputBytes ?? 4 * 1024 * 1024,
    maxPayloadBytes: overrides.maxPayloadBytes ?? 8 * 1024 * 1024,
  })
}

function buildFixtureGraphExchange({
  root,
  fixture,
  planState,
  modelPlanState,
  judgmentDimensions,
  includeComponent,
  capabilityBudgetOverrides = {},
}) {
  const selected = fixture.manifest.reviewSelection.selected
  const tasks = fixtureTasks({
    root,
    manifest: fixture.manifest,
    manifestSha256: fixture.manifestSha256,
    planState,
    modelPlanState,
    judgmentDimensions,
    includeComponent,
  })
  const taskDescriptors = tasks.map((item) => item.descriptor)
  const taskSet = buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: tasks.map(({ task }) => `${task.kind}:${String(task.subject)}`),
    taskDescriptors,
    planState,
  })
  const carrierBundlesByTask = tasks.map(({ shardSet }) => (
    shardSet.shards.map((shard) => exportBrokerShardCarrier(shard))
  ))
  const carrierMetadata = carrierBundlesByTask.flatMap((bundles, taskOrdinal) => (
    bundles.map((bundle, shardOrdinal) => buildBrokerShardCarrierMetadata(bundle, {
      taskKey: taskSet.expectedTaskKeys[taskOrdinal],
      ordinal: shardOrdinal,
      planState,
    }))
  ))
  const contentSet = buildBrokerGlobalContentSet({
    taskSet,
    taskDescriptors,
    carrierMetadata,
    planState,
  })
  const reviewGraph = buildBrokerNoSampleReviewGraph({
    taskSet,
    taskDescriptors,
    planState,
  })
  const trust = {
    ...loadModelBrokerExchangeTrustState({
      repoRoot: ROOT,
      providerId: selected.providerId,
      invocationProfileId: selected.invocationProfileId,
      reviewSelection: fixture.manifest.reviewSelection,
    }),
    brokerState: planState,
  }
  const scheduleOptions = {
    trust,
    manifest: fixture.manifest,
    manifestSha256: fixture.manifestSha256,
    taskSet,
    taskDescriptors,
    reviewGraph,
    contentSet,
    carrierMetadata,
    authorProviderId: fixture.manifest.authorProvider,
    reviewerProviderId: selected.providerId,
    requestModelId: selected.requestModelId,
    capabilityBudget: fixtureReviewCapabilityBudget(
      fixture.manifest,
      capabilityBudgetOverrides,
    ),
  }
  const exchangeSchedule = prepareModelBrokerReviewGraphExchangeSchedule(scheduleOptions)
  const scheduleValidation = validateModelBrokerReviewGraphExchangeSchedule(
    exchangeSchedule,
    scheduleOptions,
  )
  return {
    root,
    fixture,
    planState,
    modelPlanState,
    tasks,
    taskDescriptors,
    taskSet,
    carrierMetadata,
    contentSet,
    reviewGraph,
    trust,
    scheduleOptions,
    exchangeSchedule,
    scheduleValidation,
  }
}

function buildHermeticSelectedFullReviewCore({
  repoRoot,
  manifest,
  planState,
  modelPlanState,
}) {
  const selectedRun = applyFixtureCapabilitySelection({
    manifest: structuredClone(manifest),
    manifestSha256: null,
  }, manifest.authorProvider)
  const tasks = []
  const taskDescriptors = []
  const carrierMetadata = []
  const chunksById = new Map()
  for (const task of iterateCompleteModelReviewTasks({
    planState: modelPlanState,
    manifest: selectedRun.manifest,
    repoRoot,
  })) {
    const shardSet = buildContentAddressedBrokerShards({
      repoRoot,
      manifest: selectedRun.manifest,
      manifestSha256: selectedRun.manifestSha256,
      coveragePaths: task.coverage.inventoryPaths,
      coverageInventoryDigest: task.coverage.inventoryDigest,
      taskKind: task.kind,
      subject: task.subject,
      modelEvidencePlanDigest: modelPlanState.planDigest,
      dependencySourceInventory: task.claimInventory?.dependencySourceInventory ?? null,
      claimInventory: task.claimInventory,
      planState,
    })
    const descriptor = buildBrokerTaskDispatchDescriptor(shardSet, {
      planState,
      claimInventoryDigest: task.claimInventory?.claimInventoryDigest ?? null,
      judgmentRule: task.judgmentRule ?? null,
    })
    const taskKey = `${task.kind}:${String(task.subject)}`
    for (const [ordinal, shard] of shardSet.shards.entries()) {
      const bundle = exportBrokerShardCarrier(shard)
      carrierMetadata.push(buildBrokerShardCarrierMetadata(bundle, {
        taskKey,
        ordinal,
        planState,
      }))
      for (const chunk of shard.chunks) {
        const previous = chunksById.get(chunk.chunkId)
        if (previous && canonical(previous) !== canonical(chunk)) {
          throw new Error(`full-90 fixture substitutes a CAS leaf:${chunk.chunkId}`)
        }
        if (!previous) chunksById.set(chunk.chunkId, chunk)
      }
    }
    tasks.push({ task, shardSet, descriptor })
    taskDescriptors.push(descriptor)
  }
  const expectedTaskKeys = tasks.map(({ task }) => `${task.kind}:${String(task.subject)}`)
  const taskSet = buildBrokerTaskSet({
    scopeKind: 'registered-full-review',
    expectedTaskKeys,
    taskDescriptors,
    planState,
  })
  const contentSet = buildBrokerGlobalContentSet({
    taskSet,
    taskDescriptors,
    carrierMetadata,
    planState,
  })
  const reviewGraph = buildBrokerNoSampleReviewGraph({
    taskSet,
    taskDescriptors,
    planState,
  })
  const selected = selectedRun.manifest.reviewSelection.selected
  const trust = {
    ...loadModelBrokerExchangeTrustState({
      repoRoot,
      providerId: selected.providerId,
      invocationProfileId: selected.invocationProfileId,
      reviewSelection: selectedRun.manifest.reviewSelection,
    }),
    brokerState: planState,
  }
  const scheduleOptions = {
    trust,
    manifest: selectedRun.manifest,
    manifestSha256: selectedRun.manifestSha256,
    taskSet,
    taskDescriptors,
    reviewGraph,
    contentSet,
    carrierMetadata,
    authorProviderId: selectedRun.manifest.authorProvider,
    reviewerProviderId: selected.providerId,
    requestModelId: selected.requestModelId,
    capabilityBudget: fixtureReviewCapabilityBudget(selectedRun.manifest),
  }
  const exchangeSchedule = prepareModelBrokerReviewGraphExchangeSchedule(scheduleOptions)
  const replayedSchedule = prepareModelBrokerReviewGraphExchangeSchedule(scheduleOptions)
  assert.equal(canonical(exchangeSchedule), canonical(replayedSchedule))
  const scheduleValidation = validateModelBrokerReviewGraphExchangeSchedule(
    exchangeSchedule,
    scheduleOptions,
  )
  return {
    selectedRun,
    taskDescriptors,
    taskSet,
    carrierMetadata,
    contentSet,
    reviewGraph,
    chunksById,
    trust,
    exchangeSchedule,
    scheduleValidation,
  }
}

function referenceReviewGraphEvidenceCarrierBinding(taskDescriptors, unit) {
  const refsByLeaf = new Map()
  for (const descriptor of taskDescriptors) {
    for (const shard of descriptor.shards) {
      for (const ref of shard.chunkRefs) {
        const previous = refsByLeaf.get(ref.chunkId)
        assert(
          previous === undefined || canonical(previous) === canonical(ref),
          `reference carrier index substitutes leaf ${ref.chunkId}`,
        )
        if (!previous) refsByLeaf.set(ref.chunkId, ref)
      }
    }
  }
  const leafRefs = unit.leafIds.map((leafId) => {
    const ref = refsByLeaf.get(leafId)
    assert(ref, `reference carrier index omits leaf ${leafId}`)
    return ref
  })
  const blobRefsByDigest = new Map()
  for (const ref of leafRefs) {
    const blobRef = {
      sha256: ref.contentSha256,
      bytes: ref.bytes,
      encoding: 'base64',
    }
    const previous = blobRefsByDigest.get(blobRef.sha256)
    assert(
      previous === undefined || canonical(previous) === canonical(blobRef),
      `reference carrier index substitutes blob metadata ${blobRef.sha256}`,
    )
    if (!previous) blobRefsByDigest.set(blobRef.sha256, blobRef)
  }
  const blobRefs = [...blobRefsByDigest.values()].sort(
    (left, right) => Buffer.from(left.sha256).compare(Buffer.from(right.sha256)),
  )
  const projection = {
    leafSetDigest: digest(canonical(unit.leafIds)),
    minimalLeafReferenceSetDigest: digest(canonical(leafRefs)),
    blobSetDigest: digest(canonical(blobRefs)),
    rawContentBytes: unit.rawContentBytes,
    reviewSemanticsSetDigest: unit.reviewSemanticsSetDigest,
  }
  return { ...projection, bindingDigest: digest(canonical(projection)) }
}

function assertIndexedReviewGraphParityAndPoisoning(core) {
  const replayedSchedule = prepareModelBrokerReviewGraphExchangeSchedule(core.scheduleOptions)
  assert.equal(canonical(replayedSchedule), canonical(core.exchangeSchedule))
  assert.equal(replayedSchedule.exchangeScheduleDigest, core.exchangeSchedule.exchangeScheduleDigest)
  for (const reference of core.exchangeSchedule.requests) {
    const units = reference.memberUnitOrdinals.map(
      (ordinal) => core.reviewGraph.reviewWorkUnits[ordinal],
    )
    const bindingByUnit = new Map(
      reference.evidenceCarrierBinding.memberBindings.map((member) => [
        member.unitId,
        member.binding,
      ]),
    )
    for (const unit of units) {
      assert.deepEqual(
        bindingByUnit.get(unit.workUnitId),
        referenceReviewGraphEvidenceCarrierBinding(core.taskDescriptors, unit),
      )
    }
    const options = {
      trust: core.trust,
      scheduleValidation: core.scheduleValidation,
      exchangeSchedule: core.exchangeSchedule,
      taskSet: core.taskSet,
      reviewGraph: core.reviewGraph,
      contentSet: core.contentSet,
      requestOrdinal: reference.requestOrdinal,
      prerequisiteResults: [],
    }
    const first = prepareModelBrokerReviewGraphExchangeRequest(options)
    const second = prepareModelBrokerReviewGraphExchangeRequest(options)
    assert(first.bytes.equals(second.bytes))
    assert.equal(first.envelope.requestDigest, second.envelope.requestDigest)
    for (const [memberOrdinal, member] of first.envelope.members.entries()) {
      const unit = units[memberOrdinal]
      const instructions = JSON.parse(member.instructions.canonicalText)
      const expectedCoverageCells = unit.coverageCellIds.map((cellId) => {
        const cell = core.reviewGraph.coverageCells.find((row) => row.cellId === cellId)
        assert(cell, `canonical graph omits cell ${cellId}`)
        return cell
      })
      assert.deepEqual(instructions.unitIdentity.coverageCells, expectedCoverageCells)
      assert.equal(
        member.instructions.sha256,
        digest(member.instructions.canonicalText),
      )
    }
  }

  const duplicatedCellGraph = structuredClone(core.reviewGraph)
  duplicatedCellGraph.coverageCells.push(structuredClone(duplicatedCellGraph.coverageCells[0]))
  duplicatedCellGraph.coverageCellCount += 1
  assert.throws(() => prepareModelBrokerReviewGraphExchangeSchedule({
    ...core.scheduleOptions,
    reviewGraph: duplicatedCellGraph,
  }), /duplicate|invalid|stale|substitut|coverage/)

  const substitutedLeafDescriptors = structuredClone(core.taskDescriptors)
  substitutedLeafDescriptors[0].shards[0].chunkRefs[0].bytes += 1
  assert.throws(() => prepareModelBrokerReviewGraphExchangeSchedule({
    ...core.scheduleOptions,
    taskDescriptors: substitutedLeafDescriptors,
  }), /invalid|stale|substitut|digest|task/)
}

function materializeHermeticSelectedFullReview(core) {
  const rows = []
  for (const reference of core.exchangeSchedule.requests) {
    const built = prepareModelBrokerReviewGraphExchangeRequest({
      trust: core.trust,
      scheduleValidation: core.scheduleValidation,
      exchangeSchedule: core.exchangeSchedule,
      taskSet: core.taskSet,
      reviewGraph: core.reviewGraph,
      contentSet: core.contentSet,
      requestOrdinal: reference.requestOrdinal,
      prerequisiteResults: [],
    })
    const workUnits = reference.memberUnitOrdinals.map(
      (ordinal) => core.reviewGraph.reviewWorkUnits[ordinal],
    )
    const bundle = exportBrokerReviewGraphBatchCarrier({
      graph: core.reviewGraph,
      contentSet: core.contentSet,
      requestDigest: built.envelope.requestDigest,
      requestBatch: reference,
      workUnits,
      chunks: reference.leafIds.map((leafId) => core.chunksById.get(leafId)),
      expectedBinding: built.envelope.carrier.evidenceCarrierBinding,
    })
    materializeBrokerReviewGraphBatchCarrier({
      graph: core.reviewGraph,
      contentSet: core.contentSet,
      requestDigest: built.envelope.requestDigest,
      requestBatch: reference,
      workUnits,
      carrier: bundle.carrier,
      blobs: bundle.blobs,
      expectedBinding: built.envelope.carrier.evidenceCarrierBinding,
    })
    const evidenceCarrierCanonicalBytes = Buffer.from(canonical(bundle.carrier))
    const evidenceBlobsCanonicalBytes = Buffer.from(canonical(bundle.blobs))
    const payloadBudget = validateBrokerReviewGraphBatchPortablePayloadBudget({
      requestBatch: reference,
      requestEnvelopeBytes: built.bytes,
      resultSchema: core.trust.resultSchema,
      evidenceCarrier: bundle.carrier,
      evidenceBlobs: bundle.blobs,
      capabilityBudget: core.exchangeSchedule.capabilityBudget,
    })
    assert.deepEqual(
      built.envelope.members.map((member) => member.reviewSemanticsSetDigest),
      workUnits.map((unit) => unit.reviewSemanticsSetDigest),
    )
    rows.push({
      requestOrdinal: reference.requestOrdinal,
      requestPlanDigest: reference.requestPlanDigest,
      requestDigest: built.envelope.requestDigest,
      requestBytes: built.bytes.length,
      requestBytesSha256: digest(built.bytes),
      evidenceCarrierDigest: bundle.carrier.carrierDigest,
      evidenceCarrierBytes: payloadBudget.evidenceCarrierBytes,
      evidenceCarrierBytesSha256: digest(evidenceCarrierCanonicalBytes),
      evidenceBlobSetDigest: digest(canonical(bundle.blobs)),
      evidenceBlobBytes: payloadBudget.evidenceBlobBytes,
      evidenceBlobBytesSha256: digest(evidenceBlobsCanonicalBytes),
      orderedBlobIdentities: bundle.blobs.map((blob) => ({
        sha256: blob.sha256,
        bytes: Buffer.byteLength(canonical(blob)),
        bytesSha256: digest(Buffer.from(canonical(blob))),
      })),
      reviewSemanticsSetDigest: digest(canonical(
        workUnits.map((unit) => unit.reviewSemanticsSetDigest),
      )),
      totalPreparedPayloadBytes: payloadBudget.plannedPayloadBytes,
      preparedTransportBytes: payloadBudget.plannedInputBytes,
    })
  }
  assert.equal(rows.length, core.exchangeSchedule.providerCallCount)
  assert.equal(rows.length, core.exchangeSchedule.requestCount)
  assert(rows.every((row, ordinal) => row.requestOrdinal === ordinal))
  return {
    rows,
    rowsDigest: digest(canonical(rows)),
    requestCount: rows.length,
    maxPreparedPayloadBytes: Math.max(...rows.map((row) => row.totalPreparedPayloadBytes)),
  }
}

function assertFixtureExactPortablePayloadBudgets(core) {
  const chunksById = new Map()
  for (const { shardSet } of core.tasks) {
    for (const shard of shardSet.shards) {
      for (const chunk of shard.chunks) {
        const previous = chunksById.get(chunk.chunkId)
        assert(
          previous === undefined || canonical(previous) === canonical(chunk),
          `fixture substitutes transport leaf ${chunk.chunkId}`,
        )
        if (!previous) chunksById.set(chunk.chunkId, chunk)
      }
    }
  }
  const budgets = core.exchangeSchedule.requests.map((reference) => {
    const built = prepareModelBrokerReviewGraphExchangeRequest({
      trust: core.trust,
      scheduleValidation: core.scheduleValidation,
      exchangeSchedule: core.exchangeSchedule,
      taskSet: core.taskSet,
      reviewGraph: core.reviewGraph,
      contentSet: core.contentSet,
      requestOrdinal: reference.requestOrdinal,
      prerequisiteResults: [],
    })
    const workUnits = reference.memberUnitOrdinals.map(
      (ordinal) => core.reviewGraph.reviewWorkUnits[ordinal],
    )
    const bundle = exportBrokerReviewGraphBatchCarrier({
      graph: core.reviewGraph,
      contentSet: core.contentSet,
      requestDigest: built.envelope.requestDigest,
      requestBatch: reference,
      workUnits,
      chunks: reference.leafIds.map((leafId) => chunksById.get(leafId)),
      expectedBinding: built.envelope.carrier.evidenceCarrierBinding,
    })
    materializeBrokerReviewGraphBatchCarrier({
      graph: core.reviewGraph,
      contentSet: core.contentSet,
      requestDigest: built.envelope.requestDigest,
      requestBatch: reference,
      workUnits,
      carrier: bundle.carrier,
      blobs: bundle.blobs,
      expectedBinding: built.envelope.carrier.evidenceCarrierBinding,
    })
    return {
      reference,
      built,
      bundle,
      budget: validateBrokerReviewGraphBatchPortablePayloadBudget({
        requestBatch: reference,
        requestEnvelopeBytes: built.bytes,
        resultSchema: core.trust.resultSchema,
        evidenceCarrier: bundle.carrier,
        evidenceBlobs: bundle.blobs,
        capabilityBudget: core.exchangeSchedule.capabilityBudget,
      }),
    }
  })
  assert.equal(budgets.length, core.exchangeSchedule.providerCallCount)
  assert(budgets.every(({ budget }) => (
    budget.actualInputBytes <= budget.plannedInputBytes
    && budget.plannedInputBytes <= budget.maxInputBytes
    && budget.plannedOutputBytes <= budget.maxOutputBytes
    && budget.plannedPayloadBytes <= budget.maxPayloadBytes
  )))
  const first = budgets[0]
  assert.throws(() => validateBrokerReviewGraphBatchPortablePayloadBudget({
    requestBatch: {
      ...first.reference,
      plannedInputBytes: first.budget.actualInputBytes - 1,
    },
    requestEnvelopeBytes: first.built.bytes,
    resultSchema: core.trust.resultSchema,
    evidenceCarrier: first.bundle.carrier,
    evidenceBlobs: first.bundle.blobs,
    capabilityBudget: core.exchangeSchedule.capabilityBudget,
  }), /capability-bound serialized transport budget/)
  return {
    requestCount: budgets.length,
    maxActualBytes: Math.max(...budgets.map(({ budget }) => (
      budget.actualInputBytes
    ))),
    maxPlannedBytes: Math.max(...budgets.map(({ budget }) => (
      budget.plannedInputBytes
    ))),
  }
}

function selectedFullCoreEvidence(core) {
  const entries = {
    selectedRun: {
      value: core.selectedRun,
      addressedDigests: [core.selectedRun.manifestSha256],
    },
    taskDescriptors: {
      value: core.taskDescriptors,
      addressedDigests: core.taskDescriptors.map(
        (descriptor) => descriptor.descriptorDigest,
      ),
    },
    taskSet: {
      value: core.taskSet,
      addressedDigests: [core.taskSet.taskSetDigest],
    },
    carrierMetadata: {
      value: core.carrierMetadata,
      addressedDigests: core.carrierMetadata.map((row) => row.metadataDigest),
    },
    contentSet: {
      value: core.contentSet,
      addressedDigests: [core.contentSet.contentSetDigest],
    },
    reviewGraph: {
      value: core.reviewGraph,
      addressedDigests: [
        core.reviewGraph.reviewGraphDigest,
        core.reviewGraph.proof.coverageCompletenessDigest,
        ...core.reviewGraph.reviewWorkUnits.map((unit) => unit.workUnitDigest),
        ...core.reviewGraph.synthesisUnits.map((unit) => unit.synthesisUnitDigest),
      ],
    },
    exchangeSchedule: {
      value: core.exchangeSchedule,
      addressedDigests: [
        core.exchangeSchedule.exchangeScheduleDigest,
        ...core.exchangeSchedule.requests.map((request) => request.requestPlanDigest),
      ],
    },
  }
  return Object.fromEntries(Object.entries(entries).map(([name, item]) => {
    const bytes = canonicalBytes(item.value)
    return [name, {
      bytes,
      bytesSha256: digest(bytes),
      addressedDigests: item.addressedDigests,
    }]
  }))
}

function graphPrerequisiteUnitIds(reviewGraph, reference) {
  if (reference.requestKind === 'review-work-batch') return []
  const unit = reviewGraph.synthesisUnits[reference.unitOrdinal]
  if (unit.inputKind === 'synthesis-units') return [...unit.inputIds]
  const workByCell = new Map(reviewGraph.reviewWorkUnits.flatMap((work) => (
    work.coverageCellIds.map((cellId) => [cellId, work.workUnitId])
  )))
  return [...new Set(unit.inputIds.map((cellId) => workByCell.get(cellId)))]
}

function fixtureClaimVerdict(cell, claimId) {
  for (const binding of cell.reviewSemanticsBindings) {
    const semantics = binding.reviewSemantics
    if (semantics.semanticsKind !== 'component-claim-evidence-review') continue
    const claim = semantics.claims.find((row) => row.claimId === claimId)
    const claimBinding = semantics.claimEvidenceGraph.claimBindings
      .find((row) => row.claimId === claimId)
    if (!claim || !claimBinding) continue
    const supportingChunkIds = [...new Set([
      ...claimBinding.claimSourceChunkIds,
      ...semantics.claimEvidenceGraph.implementationChunkIds,
      ...semantics.claimEvidenceGraph.dependencyPackages.flatMap((dependency) => dependency.chunkIds),
    ])].sort()
    return {
      claimId,
      claimTextSha256: claim.textSha256,
      path: claim.path,
      line: claim.line,
      claimEvidenceGraphDigest: semantics.claimEvidenceGraph.graphDigest,
      status: semantics.claimEvidenceGraph.status === 'self-contained'
        ? 'verified'
        : 'unverifiable',
      supportingChunkIds,
    }
  }
  throw new Error(`fixture claim semantics are absent:${claimId}`)
}

function fixtureFindingRule(cell, claimId = null) {
  if (cell.cellKind === 'judgment-applicability-cell') {
    return cell.reviewSemanticsBindings[0].reviewSemantics.rule.ruleId
  }
  return claimId === null ? 'component-a1b-shared-evidence' : `claim:${claimId}`
}

function resultForReviewGraphWorkUnit(core, request, member) {
  const identity = core.exchangeSchedule.reviewIdentity
  const unit = core.reviewGraph.reviewWorkUnits[member.unitOrdinal]
  const common = {
    schemaVersion: 1,
    runId: core.fixture.manifest.runId,
    providerId: identity.reviewerProviderId,
    requestModelId: identity.requestModelId,
    modelReleaseId: identity.modelReleaseId,
    modelReleaseBindingDigest: identity.modelReleaseBindingDigest,
    modelReleaseRegistryDigest: identity.modelReleaseRegistryDigest,
    selectedProfileDigest: identity.selectedProfileDigest,
    selectionDigest: identity.selectionDigest,
    reviewProfileId: identity.reviewProfileId,
    invocationProfileId: identity.invocationProfileId,
    selectedInvocationProfileDigest: identity.selectedInvocationProfileDigest,
    capabilityCertificationId: identity.capabilityCertificationId,
    selectedCapabilityCertificationDigest: identity.selectedCapabilityCertificationDigest,
    responseSelectorDigest: identity.responseSelectorDigest,
    inputResultSetDigest: digest(canonical([])),
    reviewGraphDigest: core.reviewGraph.reviewGraphDigest,
    taskSetDigest: core.taskSet.taskSetDigest,
    unitKind: unit.unitKind,
    unitId: member.unitId,
    unitDigest: member.unitDigest,
    ordinal: member.unitOrdinal,
  }
  const cells = unit.coverageCellIds.map((cellId) => (
    core.reviewGraph.coverageCells.find((cell) => cell.cellId === cellId)
  ))
  const claimIds = cells.flatMap((cell) => cell.claimIds)
  assert.equal(claimIds.length, new Set(claimIds).size)
  const claimVerdicts = cells.flatMap((cell) => (
    cell.claimIds.map((claimId) => fixtureClaimVerdict(cell, claimId))
  ))
  return {
    ...common,
    evidenceKind: 'deep-audit-review-graph-model-work-result',
    coveredCellIds: [...unit.coverageCellIds],
    reviewedLeafIds: [...unit.leafIds],
    cellVerdicts: cells.map((cell) => ({
      cellId: cell.cellId,
      reviewSemanticsSetDigest: cell.reviewSemanticsSetDigest,
      supportingLeafIds: [...cell.leafIds],
      status: claimVerdicts.some(
        (verdict) => cell.claimIds.includes(verdict.claimId)
          && verdict.status === 'unverifiable',
      ) ? 'unverifiable' : 'verified',
    })),
    claimVerdicts,
    findings: [],
    summary: 'Fixture independently reviewed every bound graph cell, leaf, and claim.',
  }
}

function resultForReviewGraphRequest(core, request) {
  const identity = core.exchangeSchedule.reviewIdentity
  const results = request.members.map((member) => (
    resultForReviewGraphWorkUnit(core, request, member)
  ))
  return {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-review-graph-model-batch-result',
    runId: core.fixture.manifest.runId,
    providerId: identity.reviewerProviderId,
    requestModelId: identity.requestModelId,
    modelReleaseId: identity.modelReleaseId,
    modelReleaseBindingDigest: identity.modelReleaseBindingDigest,
    modelReleaseRegistryDigest: identity.modelReleaseRegistryDigest,
    selectedProfileDigest: identity.selectedProfileDigest,
    selectionDigest: identity.selectionDigest,
    reviewProfileId: identity.reviewProfileId,
    invocationProfileId: identity.invocationProfileId,
    selectedInvocationProfileDigest: identity.selectedInvocationProfileDigest,
    capabilityCertificationId: identity.capabilityCertificationId,
    selectedCapabilityCertificationDigest:
      identity.selectedCapabilityCertificationDigest,
    responseSelectorDigest: identity.responseSelectorDigest,
    reviewGraphDigest: core.reviewGraph.reviewGraphDigest,
    taskSetDigest: core.taskSet.taskSetDigest,
    requestDigest: request.requestDigest,
    requestBatchId: request.requestBatchId,
    requestBatchDigest: request.requestBatchDigest,
    requestBatchOrdinal: request.requestBatchOrdinal,
    memberUnitIds: [...request.memberUnitIds],
    memberUnitDigests: [...request.memberUnitDigests],
    memberResultCount: results.length,
    results,
    resultSetDigest: digest(canonical(results)),
    summary: 'Fixture completed every ordered batch member without sampling.',
  }
}

function exerciseFixtureGraphExchange(
  core,
  { expectedAggregateVerdict = 'unverifiable' } = {},
) {
  const recordsByUnit = new Map()
  const requests = []
  const resultCarriers = []
  for (const reference of core.exchangeSchedule.requests) {
    const prerequisiteResults = graphPrerequisiteUnitIds(core.reviewGraph, reference)
      .map((unitId) => recordsByUnit.get(unitId))
    assert(prerequisiteResults.every(Boolean))
    const request = prepareModelBrokerReviewGraphExchangeRequest({
      trust: core.trust,
      scheduleValidation: core.scheduleValidation,
      exchangeSchedule: core.exchangeSchedule,
      taskSet: core.taskSet,
      reviewGraph: core.reviewGraph,
      contentSet: core.contentSet,
      requestOrdinal: reference.requestOrdinal,
      prerequisiteResults,
    }).envelope
    const result = resultForReviewGraphRequest(core, request)
    const response = providerResponse(
      core.exchangeSchedule.reviewIdentity.reviewerProviderId,
      core.exchangeSchedule.reviewIdentity.requestModelId,
      result,
      reference.requestOrdinal,
    )
    const carrier = buildModelBrokerReviewGraphResultCarrier({
      scheduleValidation: core.scheduleValidation,
      exchangeSchedule: core.exchangeSchedule,
      requestEnvelope: request,
      response,
    })
    const record = ingestModelBrokerReviewGraphExchangeResult({
      trust: core.trust,
      scheduleValidation: core.scheduleValidation,
      exchangeSchedule: core.exchangeSchedule,
      reviewGraph: core.reviewGraph,
      requestEnvelope: request,
      resultCarrier: carrier,
      prerequisiteResults,
    })
    requests.push(request)
    resultCarriers.push(carrier)
    for (const unitRecord of record.unitRecords) {
      recordsByUnit.set(unitRecord.unitId, unitRecord)
    }
  }
  const completion = ingestModelBrokerReviewGraphExchange({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskSet: core.taskSet,
    taskDescriptors: core.taskDescriptors,
    reviewGraph: core.reviewGraph,
    contentSet: core.contentSet,
    resultCarriers,
  })
  assert.equal(completion.fullNoSampleClosure, true)
  assert.equal(completion.taskCount, core.reviewGraph.taskCount)
  assert.equal(
    completion.reviewWorkUnitCount,
    core.reviewGraph.reviewWorkUnitCount,
  )
  assert.equal(
    completion.providerCallCount,
    core.exchangeSchedule.requestCount,
  )
  assert.equal(
    completion.aggregateVerdict,
    expectedAggregateVerdict,
    'fixture graph reducer must preserve the expected monotonic aggregate verdict',
  )
  assert.equal(
    completion.modelWorkResultCount,
    core.exchangeSchedule.reviewWorkUnitCount,
  )
  assert.equal(
    completion.deterministicReductionResultCount,
    core.reviewGraph.synthesisUnitCount,
  )
  assert.equal(core.exchangeSchedule.synthesisRequestCount, 0)
  assert(core.exchangeSchedule.requests.every(
    (reference) => reference.requestKind === 'review-work-batch',
  ))
  assert.equal(completion.genuineCrossProviderReview, false)
  assert.equal(completion.promotionEligible, false)
  assert.equal(completion.managedEvidence, false)
  return { ...core, requests, resultCarriers, recordsByUnit, completion }
}

function assertCapabilityBatchingFailClosed(core) {
  const scheduledUnitIds = core.exchangeSchedule.requests.flatMap(
    (request) => request.memberUnitIds,
  )
  const expectedUnitIds = core.reviewGraph.reviewWorkUnits.map(
    (unit) => unit.workUnitId,
  )
  assert.equal(
    core.exchangeSchedule.providerCallCount,
    core.exchangeSchedule.requestCount,
  )
  assert.equal(
    core.exchangeSchedule.taskCount,
    core.reviewGraph.taskCount,
  )
  assert.equal(
    core.exchangeSchedule.reviewWorkUnitCount,
    core.reviewGraph.reviewWorkUnitCount,
  )
  assert(
    core.exchangeSchedule.providerCallCount
      < core.exchangeSchedule.reviewWorkUnitCount,
    'physical provider requests must be fewer than canonical review work units',
  )
  assert.deepEqual(scheduledUnitIds, expectedUnitIds)
  assert.equal(new Set(scheduledUnitIds).size, expectedUnitIds.length)
  assert.equal(core.exchangeSchedule.sampling, false)

  const substitutedBudget = structuredClone(
    core.scheduleOptions.capabilityBudget,
  )
  substitutedBudget.capabilityBudgetDigest = digest(
    'substituted-capability-budget',
  )
  assert.throws(() => prepareModelBrokerReviewGraphExchangeSchedule({
    ...core.scheduleOptions,
    capabilityBudget: substitutedBudget,
  }), /capability budget.*stale|capability budget.*substituted|capability budget.*detached/)

  const selected = core.fixture.manifest.reviewSelection.selected
  const overBudget = buildModelBrokerReviewGraphCapabilityBudget({
    capabilityCertificationId: selected.capabilityCertificationId,
    selectedCapabilityCertificationDigest:
      core.fixture.manifest.reviewSelection.selectedCapabilityCertificationDigest,
    maxInputBytes: 1,
    maxOutputBytes: 1,
    maxPayloadBytes: 2,
  })
  assert.throws(() => prepareModelBrokerReviewGraphExchangeSchedule({
    ...core.scheduleOptions,
    capabilityBudget: overBudget,
  }), /cannot fit (?:exact portable )?selected capability budget/)

  const multiMember = core.exchangeSchedule.requests.find(
    (request) => request.memberUnitIds.length > 1,
  )
  assert(multiMember, 'fixture must exercise a multiplexed physical request')
  const reorderedSchedule = structuredClone(core.exchangeSchedule)
  const reorderedRequest = reorderedSchedule.requests[multiMember.requestOrdinal]
  ;[reorderedRequest.memberUnitIds[0], reorderedRequest.memberUnitIds[1]] =
    [reorderedRequest.memberUnitIds[1], reorderedRequest.memberUnitIds[0]]
  assert.throws(() => validateModelBrokerReviewGraphExchangeSchedule(
    reorderedSchedule,
    core.scheduleOptions,
  ), /stale|substituted|incomplete|duplicated|reordered/)

  const duplicatedSchedule = structuredClone(core.exchangeSchedule)
  const duplicatedRequest = duplicatedSchedule.requests[multiMember.requestOrdinal]
  duplicatedRequest.memberUnitIds[1] = duplicatedRequest.memberUnitIds[0]
  assert.throws(() => validateModelBrokerReviewGraphExchangeSchedule(
    duplicatedSchedule,
    core.scheduleOptions,
  ), /stale|substituted|incomplete|duplicated|reordered/)

  const request = core.requests[multiMember.requestOrdinal]
  const assertResultRejected = (result) => {
    const carrier = buildModelBrokerReviewGraphResultCarrier({
      scheduleValidation: core.scheduleValidation,
      exchangeSchedule: core.exchangeSchedule,
      requestEnvelope: request,
      response: providerResponse(
        core.exchangeSchedule.reviewIdentity.reviewerProviderId,
        core.exchangeSchedule.reviewIdentity.requestModelId,
        result,
        multiMember.requestOrdinal,
      ),
    })
    assert.throws(() => ingestModelBrokerReviewGraphExchangeResult({
      trust: core.trust,
      scheduleValidation: core.scheduleValidation,
      exchangeSchedule: core.exchangeSchedule,
      reviewGraph: core.reviewGraph,
      requestEnvelope: request,
      resultCarrier: carrier,
      prerequisiteResults: [],
    }), /partial|stale|substituted|foreign|schema|identity/)
  }

  const partialResult = resultForReviewGraphRequest(core, request)
  partialResult.results.pop()
  partialResult.memberUnitIds.pop()
  partialResult.memberUnitDigests.pop()
  partialResult.memberResultCount = partialResult.results.length
  partialResult.resultSetDigest = digest(canonical(partialResult.results))
  assertResultRejected(partialResult)

  const reorderedResult = resultForReviewGraphRequest(core, request)
  reorderedResult.results = [...reorderedResult.results].reverse()
  reorderedResult.resultSetDigest = digest(canonical(reorderedResult.results))
  assertResultRejected(reorderedResult)

  const substitutedResult = resultForReviewGraphRequest(core, request)
  substitutedResult.results[1] = structuredClone(substitutedResult.results[0])
  substitutedResult.resultSetDigest = digest(canonical(substitutedResult.results))
  assertResultRejected(substitutedResult)

  assert.throws(() => ingestModelBrokerReviewGraphExchange({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskSet: core.taskSet,
    taskDescriptors: core.taskDescriptors,
    reviewGraph: core.reviewGraph,
    contentSet: core.contentSet,
    resultCarriers: core.resultCarriers.slice(0, -1),
  }), /partial|unexpected completion/)
  assert.throws(() => ingestModelBrokerReviewGraphExchange({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskSet: core.taskSet,
    taskDescriptors: core.taskDescriptors,
    reviewGraph: core.reviewGraph,
    contentSet: core.contentSet,
    resultCarriers: [...core.resultCarriers, core.resultCarriers[0]],
  }), /partial|unexpected completion/)
}

function assertDeterministicReductionIsolation(core) {
  assert.equal(core.exchangeSchedule.synthesisRequestCount, 0)
  assert.equal(
    core.exchangeSchedule.deterministicReductionUnitCount,
    core.reviewGraph.synthesisUnitCount,
  )
  assert(core.exchangeSchedule.requests.every(
    (reference) => reference.requestKind === 'review-work-batch',
  ))
  const request = core.requests[0]
  const changedResult = resultForReviewGraphRequest(core, request)
  changedResult.results[0].summary =
    `${changedResult.results[0].summary} Changed upstream bytes.`
  changedResult.resultSetDigest = digest(canonical(changedResult.results))
  const changedCarrier = buildModelBrokerReviewGraphResultCarrier({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    requestEnvelope: request,
    response: providerResponse(
      core.exchangeSchedule.reviewIdentity.reviewerProviderId,
      core.exchangeSchedule.reviewIdentity.requestModelId,
      changedResult,
      10_000 + request.requestOrdinal,
    ),
  })
  const replayed = [...core.resultCarriers]
  replayed[request.requestOrdinal] = changedCarrier
  const recomputed = ingestModelBrokerReviewGraphExchange({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskSet: core.taskSet,
    taskDescriptors: core.taskDescriptors,
    reviewGraph: core.reviewGraph,
    contentSet: core.contentSet,
    resultCarriers: replayed,
  })
  assert.notEqual(
    recomputed.deterministicReductionResultSetDigest,
    core.completion.deterministicReductionResultSetDigest,
  )
  assert.notEqual(
    recomputed.taskRootVerdictSetDigest,
    core.completion.taskRootVerdictSetDigest,
  )
  assert.throws(() => ingestModelBrokerReviewGraphExchange({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskSet: core.taskSet,
    taskDescriptors: core.taskDescriptors,
    reviewGraph: core.reviewGraph,
    contentSet: core.contentSet,
    resultCarriers: [...core.resultCarriers, changedCarrier],
  }), /partial|unexpected/)
}

function assertMonotonicGraphReductionAndResultBudget(core) {
  let workMemberOrdinal = -1
  const workReference = core.exchangeSchedule.requests.find((reference) => {
    workMemberOrdinal = reference.memberUnitOrdinals.findIndex((unitOrdinal) => {
      const work = core.reviewGraph.reviewWorkUnits[unitOrdinal]
      return work.coverageCellIds.some((cellId) => (
        core.reviewGraph.coverageCells.find((cell) => cell.cellId === cellId).claimIds.length === 0
      ))
    })
    return workMemberOrdinal >= 0
  })
  assert(workReference)
  const workRequest = core.requests[workReference.requestOrdinal]
  const workUnit = core.reviewGraph.reviewWorkUnits[
    workReference.memberUnitOrdinals[workMemberOrdinal]
  ]
  const falseCellId = workUnit.coverageCellIds.find((cellId) => (
    core.reviewGraph.coverageCells.find((cell) => cell.cellId === cellId).claimIds.length === 0
  ))
  const falseCell = core.reviewGraph.coverageCells.find((cell) => cell.cellId === falseCellId)
  assert.equal(falseCell.claimIds.length, 0)
  const falseWorkResult = resultForReviewGraphRequest(core, workRequest)
  const falseMemberResult = falseWorkResult.results[workMemberOrdinal]
  falseMemberResult.cellVerdicts.find((row) => row.cellId === falseCellId).status = 'false'
  falseMemberResult.findings = [{
    cellId: falseCellId,
    leafId: falseCell.leafIds[0],
    claimId: null,
    path: falseCell.leafBindings[0].path,
    line: falseCell.leafBindings[0].lineStart,
    rule: fixtureFindingRule(falseCell),
    supportingChunkIds: [falseCell.leafIds[0]],
    severity: 'material',
    problem: 'Fixture finding that must propagate monotonically.',
    recommendation: 'Preserve the finding verdict through every synthesis stage.',
  }]
  falseWorkResult.resultSetDigest = digest(canonical(falseWorkResult.results))
  const falseWorkCarrier = buildModelBrokerReviewGraphResultCarrier({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    requestEnvelope: workRequest,
    response: providerResponse(
      core.exchangeSchedule.reviewIdentity.reviewerProviderId,
      core.exchangeSchedule.reviewIdentity.requestModelId,
      falseWorkResult,
      20_000 + workReference.requestOrdinal,
    ),
  })
  const findingCarriers = [...core.resultCarriers]
  findingCarriers[workReference.requestOrdinal] = falseWorkCarrier
  const findingCompletion = ingestModelBrokerReviewGraphExchange({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskSet: core.taskSet,
    taskDescriptors: core.taskDescriptors,
    reviewGraph: core.reviewGraph,
    contentSet: core.contentSet,
    resultCarriers: findingCarriers,
  })
  assert.equal(
    findingCompletion.aggregateVerdict,
    'unverifiable',
    'an unrelated fail-closed A1b task remains dominant in the aggregate',
  )
  const falseTaskKey = falseCell.taskKey
  assert.equal(
    findingCompletion.taskRootVerdicts.find((row) => row.taskKey === falseTaskKey).verdict,
    'findings',
  )
  assert.equal(
    findingCompletion.taskRootVerdicts.find((row) => row.taskKey === falseTaskKey).findingCount,
    1,
  )

  const oversizedResult = resultForReviewGraphRequest(core, workRequest)
  const oversizedMemberResult = oversizedResult.results[workMemberOrdinal]
  oversizedMemberResult.cellVerdicts.find((row) => row.cellId === falseCellId).status = 'false'
  oversizedMemberResult.findings = Array.from({ length: 9 }, (_, index) => ({
    cellId: falseCellId,
    leafId: falseCell.leafIds[0],
    claimId: null,
    path: falseCell.leafBindings[0].path,
    line: falseCell.leafBindings[0].lineStart,
    rule: fixtureFindingRule(falseCell),
    supportingChunkIds: [falseCell.leafIds[0]],
    severity: 'material',
    problem: `${String(index).padStart(2, '0')}:${'p'.repeat(100)}`,
    recommendation: `${String(index).padStart(2, '0')}:${'r'.repeat(100)}`,
  })).sort((left, right) => Buffer.from(canonical(left)).compare(Buffer.from(canonical(right))))
  oversizedResult.resultSetDigest = digest(canonical(oversizedResult.results))
  const oversizedCarrier = buildModelBrokerReviewGraphResultCarrier({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    requestEnvelope: workRequest,
    response: providerResponse(
      core.exchangeSchedule.reviewIdentity.reviewerProviderId,
      core.exchangeSchedule.reviewIdentity.requestModelId,
      oversizedResult,
      40_000 + workReference.requestOrdinal,
    ),
  })
  assert.throws(() => ingestModelBrokerReviewGraphExchangeResult({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    reviewGraph: core.reviewGraph,
    requestEnvelope: workRequest,
    resultCarrier: oversizedCarrier,
    prerequisiteResults: [],
  }), /schema failed/)

  const bareVerdict = resultForReviewGraphRequest(core, workRequest)
  delete bareVerdict.results[workMemberOrdinal].cellVerdicts[0].supportingLeafIds
  bareVerdict.resultSetDigest = digest(canonical(bareVerdict.results))
  const bareVerdictCarrier = buildModelBrokerReviewGraphResultCarrier({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    requestEnvelope: workRequest,
    response: providerResponse(
      core.exchangeSchedule.reviewIdentity.reviewerProviderId,
      core.exchangeSchedule.reviewIdentity.requestModelId,
      bareVerdict,
      50_000 + workReference.requestOrdinal,
    ),
  })
  assert.throws(() => ingestModelBrokerReviewGraphExchangeResult({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    reviewGraph: core.reviewGraph,
    requestEnvelope: workRequest,
    resultCarrier: bareVerdictCarrier,
    prerequisiteResults: [],
  }), /schema failed/)

  const semanticsSubstitutedRequest = structuredClone(workRequest)
  semanticsSubstitutedRequest.members[workMemberOrdinal].reviewSemanticsSetDigest = digest(
    'substituted-request-review-semantics',
  )
  const { requestDigest: ignoredRequestDigest, ...substitutedRequestProjection } =
    semanticsSubstitutedRequest
  semanticsSubstitutedRequest.requestDigest = digest(canonical(substitutedRequestProjection))
  assert.throws(() => ingestModelBrokerReviewGraphExchangeResult({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    reviewGraph: core.reviewGraph,
    requestEnvelope: semanticsSubstitutedRequest,
    resultCarrier: falseWorkCarrier,
    prerequisiteResults: [],
  }), /request\/carrier binding is missing or foreign/)

  let claimMemberOrdinal = -1
  const claimReference = core.exchangeSchedule.requests.find((reference) => {
    claimMemberOrdinal = reference.memberUnitOrdinals.findIndex((unitOrdinal) => (
      core.reviewGraph.reviewWorkUnits[unitOrdinal].coverageCellIds.some((cellId) => (
        core.reviewGraph.coverageCells.find((cell) => cell.cellId === cellId).claimIds.length > 0
      ))
    ))
    return claimMemberOrdinal >= 0
  })
  assert(claimReference)
  const claimRequest = core.requests[claimReference.requestOrdinal]
  const claimResult = resultForReviewGraphRequest(core, claimRequest)
  const claimMemberResult = claimResult.results[claimMemberOrdinal]
  const opaqueVerdict = claimMemberResult.claimVerdicts.find((verdict) => (
    verdict.status === 'unverifiable'
  ))
  assert(opaqueVerdict, 'fixture must contain an incomplete bounded claim-evidence graph')
  opaqueVerdict.status = 'verified'
  const opaqueCell = core.reviewGraph.coverageCells.find((cell) => (
    cell.claimIds.includes(opaqueVerdict.claimId)
  ))
  claimMemberResult.cellVerdicts.find((row) => row.cellId === opaqueCell.cellId).status = 'verified'
  claimResult.resultSetDigest = digest(canonical(claimResult.results))
  const opaqueCarrier = buildModelBrokerReviewGraphResultCarrier({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    requestEnvelope: claimRequest,
    response: providerResponse(
      core.exchangeSchedule.reviewIdentity.reviewerProviderId,
      core.exchangeSchedule.reviewIdentity.requestModelId,
      claimResult,
      60_000 + claimReference.requestOrdinal,
    ),
  })
  assert.throws(() => ingestModelBrokerReviewGraphExchangeResult({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    reviewGraph: core.reviewGraph,
    requestEnvelope: claimRequest,
    resultCarrier: opaqueCarrier,
    prerequisiteResults: [],
  }), /opaque\/incomplete claim must fail closed/)

  const substitutedClaimResult = resultForReviewGraphRequest(core, claimRequest)
  substitutedClaimResult.results[claimMemberOrdinal].claimVerdicts[0].claimTextSha256 =
    digest('substituted-claim-text')
  substitutedClaimResult.resultSetDigest = digest(canonical(substitutedClaimResult.results))
  const substitutedClaimCarrier = buildModelBrokerReviewGraphResultCarrier({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    requestEnvelope: claimRequest,
    response: providerResponse(
      core.exchangeSchedule.reviewIdentity.reviewerProviderId,
      core.exchangeSchedule.reviewIdentity.requestModelId,
      substitutedClaimResult,
      70_000 + claimReference.requestOrdinal,
    ),
  })
  assert.throws(() => ingestModelBrokerReviewGraphExchangeResult({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    reviewGraph: core.reviewGraph,
    requestEnvelope: claimRequest,
    resultCarrier: substitutedClaimCarrier,
    prerequisiteResults: [],
  }), /substitutes its exact claim record/)
}

function buildFixtureExchange({
  root,
  fixture,
  planState,
  modelPlanState,
  authorProviderId,
  reviewerProviderId,
  requestModelId,
}) {
  assert.equal(fixture.manifest.authorProvider, authorProviderId)
  assert.equal(fixture.manifest.providers.self.id, authorProviderId)
  assert.equal(fixture.manifest.providers.peer.id, reviewerProviderId)
  const tasks = fixtureTasks({
    root,
    manifest: fixture.manifest,
    manifestSha256: fixture.manifestSha256,
    planState,
    modelPlanState,
  })
  const taskDescriptors = tasks.map((item) => item.descriptor)
  const taskSet = buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: tasks.map(({ task }) => `${task.kind}:${String(task.subject)}`),
    taskDescriptors,
    planState,
  })
  const carrierBundlesByTask = tasks.map(({ task, shardSet }) => (
    shardSet.shards.map((shard) => exportBrokerShardCarrier(shard))
  ))
  const carrierMetadata = carrierBundlesByTask.flatMap((bundles, taskOrdinal) => (
    bundles.map((bundle, shardOrdinal) => buildBrokerShardCarrierMetadata(bundle, {
      taskKey: taskSet.expectedTaskKeys[taskOrdinal],
      ordinal: shardOrdinal,
      planState,
    }))
  ))
  const dispatchSchedule = preflightBrokerDispatch({
    taskSet,
    taskDescriptors,
    planState,
  })
  const contentSet = buildBrokerGlobalContentSet({
    taskSet,
    taskDescriptors,
    carrierMetadata,
    planState,
  })
  validateBrokerGlobalContentSet(contentSet, {
    taskSet,
    taskDescriptors,
    carrierMetadata,
    planState,
  })
  const trust = {
    ...loadModelBrokerExchangeTrustState({ repoRoot: ROOT, providerId: reviewerProviderId }),
    brokerState: planState,
  }
  const scheduleOptions = {
    trust,
    manifest: fixture.manifest,
    manifestSha256: fixture.manifestSha256,
    taskSet,
    taskDescriptors,
    dispatchSchedule,
    contentSet,
    carrierMetadata,
    authorProviderId,
    reviewerProviderId,
    requestModelId,
  }
  const exchangeSchedule = prepareModelBrokerExchangeSchedule(scheduleOptions)
  const scheduleValidation = validateModelBrokerExchangeSchedule(exchangeSchedule, scheduleOptions)
  return {
    root,
    fixture,
    planState,
    modelPlanState,
    authorProviderId,
    reviewerProviderId,
    requestModelId,
    tasks,
    taskSet,
    taskDescriptors,
    carrierBundlesByTask,
    carrierMetadata,
    dispatchSchedule,
    contentSet,
    trust,
    scheduleOptions,
    exchangeSchedule,
    scheduleValidation,
  }
}

function exerciseFixtureExchange(core) {
  const carrierGroups = []
  let responseOrdinal = 0
  for (const [taskOrdinal, item] of core.tasks.entries()) {
    const carriers = []
    for (const [shardOrdinal, shard] of item.shardSet.shards.entries()) {
      const requestOrdinal = core.exchangeSchedule.tasks[taskOrdinal].requestStart + shardOrdinal
      const request = prepareModelBrokerExchangeRequest({
        trust: core.trust,
        scheduleValidation: core.scheduleValidation,
        exchangeSchedule: core.exchangeSchedule,
        taskSet: core.taskSet,
        dispatchSchedule: core.dispatchSchedule,
        contentSet: core.contentSet,
        carrierMetadata: core.carrierMetadata,
        taskDescriptor: item.descriptor,
        taskOrdinal,
        shardOrdinal,
      })
      assert.equal(request.envelope.requestOrdinal, requestOrdinal)
      assert.equal(request.envelope.taskOrdinal, taskOrdinal)
      assert.equal(request.envelope.shardOrdinal, shardOrdinal)
      const bundle = core.carrierBundlesByTask[taskOrdinal][shardOrdinal]
      const bytes = serializeBrokerShardCarrierBundle(bundle, { planState: core.planState })
      const parsed = parseBrokerShardCarrierBundle(bytes, { planState: core.planState })
      const materialized = materializeBrokerShardCarrier({ ...parsed, planState: core.planState })
      assert.equal(materialized.shardId, shard.shardId)
      const apiRequest = materializeModelBrokerApiRequest({
        trust: core.trust,
        requestEnvelope: request.envelope,
        carrier: parsed.carrier,
        shard: materialized,
      })
      assert.equal(apiRequest.dataSha256, shard.batchDigest)
      assert(!Object.hasOwn(JSON.parse(apiRequest.bodyCanonicalJson), 'tools'))
      assert.deepEqual(Object.keys(apiRequest.credential).sort(), ['header', 'mode', 'scheme'])
      assert(!Object.hasOwn(apiRequest.credential, 'value'))
      assert(!Object.hasOwn(apiRequest.credential, 'token'))
      const result = resultForShard(shard, core.exchangeSchedule.reviewIdentity)
      const response = providerResponse(
        core.reviewerProviderId,
        core.requestModelId,
        result,
        responseOrdinal,
      )
      carriers.push(buildModelBrokerResultCarrier({
        scheduleValidation: core.scheduleValidation,
        exchangeSchedule: core.exchangeSchedule,
        requestEnvelope: request.envelope,
        requestOrdinal,
        response,
      }))
      responseOrdinal += 1
    }
    carrierGroups.push(carriers)
  }
  const taskCompletions = core.tasks.map((item, taskOrdinal) => ingestModelBrokerExchangeTask({
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    manifest: core.fixture.manifest,
    manifestSha256: core.fixture.manifestSha256,
    task: item.task,
    shardSet: item.shardSet,
    taskSet: core.taskSet,
    taskDescriptor: item.descriptor,
    dispatchSchedule: core.dispatchSchedule,
    contentSet: core.contentSet,
    carrierMetadata: core.carrierMetadata,
    exchangeSchedule: core.exchangeSchedule,
    taskOrdinal,
    resultCarriers: carrierGroups[taskOrdinal],
  }))
  const completion = closeModelBrokerExchange({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskCompletions,
  })
  assert.equal(core.taskSet.scopeKind, 'fixture')
  assert.equal(core.exchangeSchedule.fullRegisteredReview, false)
  assert.equal(core.exchangeSchedule.structuralOnly, true)
  assert.equal(completion.fullNoSampleClosure, false)
  assert.equal(completion.aggregateVerdict, 'structural-scope-complete-unattested')
  assert.equal(completion.genuineCrossProviderReview, false)
  assert.equal(completion.promotionEligible, false)
  assert.equal(completion.managedEvidence, false)
  return { ...core, carrierGroups, taskCompletions, completion }
}

function readdressCarrier(bundle) {
  const copy = structuredClone(bundle)
  const { carrierDigest, ...projection } = copy.carrier
  copy.carrier.carrierDigest = digest(canonical(projection))
  return copy
}

function readdressTaskSet(taskSet) {
  const copy = structuredClone(taskSet)
  const { taskSetDigest, ...projection } = copy
  copy.taskSetDigest = digest(canonical(projection))
  return copy
}

function readdressDescriptor(descriptor) {
  const copy = structuredClone(descriptor)
  const { descriptorDigest, ...projection } = copy
  copy.descriptorDigest = digest(canonical(projection))
  return copy
}

function assertCarrierPoisoning(core) {
  const bundle = core.carrierBundlesByTask.flat().find((candidate) => candidate.blobs.length > 1)
  assert(bundle, 'fixture must produce a carrier with multiple blobs')

  assert.throws(() => materializeBrokerShardCarrier({
    ...structuredClone(bundle),
    blobs: bundle.blobs.slice(1),
    planState: core.planState,
  }), /missing|extra|reordered/)

  const extraBytes = Buffer.from('extra-unused-fixture-blob')
  const extraBlob = {
    sha256: digest(extraBytes),
    bytes: extraBytes.length,
    encoding: 'base64',
    content: extraBytes.toString('base64'),
  }
  assert.throws(() => materializeBrokerShardCarrier({
    ...structuredClone(bundle),
    blobs: [...structuredClone(bundle.blobs), extraBlob],
    planState: core.planState,
  }), /missing|extra|reordered/)

  assert.throws(() => materializeBrokerShardCarrier({
    ...structuredClone(bundle),
    blobs: [...structuredClone(bundle.blobs), structuredClone(bundle.blobs[0])],
    planState: core.planState,
  }), /duplicate/)

  assert.throws(() => materializeBrokerShardCarrier({
    ...structuredClone(bundle),
    blobs: [...structuredClone(bundle.blobs)].reverse(),
    planState: core.planState,
  }), /reordered/)

  const substitutedBlob = structuredClone(bundle)
  substitutedBlob.blobs[0].content = Buffer.from('substituted').toString('base64')
  assert.throws(() => materializeBrokerShardCarrier({
    ...substitutedBlob,
    planState: core.planState,
  }), /substituted|invalid/)

  const missingRef = structuredClone(bundle)
  missingRef.carrier.blobRefs = missingRef.carrier.blobRefs.slice(1)
  assert.throws(() => materializeBrokerShardCarrier({
    ...readdressCarrier(missingRef),
    planState: core.planState,
  }), /exactly close|missing/)

  const unusedRef = structuredClone(bundle)
  unusedRef.carrier.blobRefs = [...unusedRef.carrier.blobRefs, {
    sha256: extraBlob.sha256,
    bytes: extraBlob.bytes,
    encoding: 'base64',
  }].sort((left, right) => left.sha256.localeCompare(right.sha256, 'en'))
  unusedRef.blobs = [...unusedRef.blobs, extraBlob]
    .sort((left, right) => left.sha256.localeCompare(right.sha256, 'en'))
  assert.throws(() => materializeBrokerShardCarrier({
    ...readdressCarrier(unusedRef),
    planState: core.planState,
  }), /exactly close|unused/)

  const duplicateRef = structuredClone(bundle)
  duplicateRef.carrier.blobRefs.push(structuredClone(duplicateRef.carrier.blobRefs[0]))
  assert.throws(() => materializeBrokerShardCarrier({
    ...readdressCarrier(duplicateRef),
    planState: core.planState,
  }), /duplicate|reordered/)

  const reorderedRef = structuredClone(bundle)
  reorderedRef.carrier.blobRefs.reverse()
  assert.throws(() => materializeBrokerShardCarrier({
    ...readdressCarrier(reorderedRef),
    planState: core.planState,
  }), /reordered/)

  const substitutedRef = structuredClone(bundle)
  substitutedRef.carrier.blobRefs[0].bytes += 1
  assert.throws(() => materializeBrokerShardCarrier({
    ...readdressCarrier(substitutedRef),
    planState: core.planState,
  }), /exactly close|substitute/)
}

function ingestOptions(core, taskOrdinal, resultCarriers) {
  const item = core.tasks[taskOrdinal]
  return {
    trust: core.trust,
    scheduleValidation: core.scheduleValidation,
    manifest: core.fixture.manifest,
    manifestSha256: core.fixture.manifestSha256,
    task: item.task,
    shardSet: item.shardSet,
    taskSet: core.taskSet,
    taskDescriptor: item.descriptor,
    dispatchSchedule: core.dispatchSchedule,
    contentSet: core.contentSet,
    carrierMetadata: core.carrierMetadata,
    exchangeSchedule: core.exchangeSchedule,
    taskOrdinal,
    resultCarriers,
  }
}

function assertResultAndClosurePoisoning(core) {
  const taskOrdinal = core.carrierGroups.findIndex((group) => group.length > 1)
  assert.notEqual(taskOrdinal, -1, 'fixture must produce a multi-shard task')
  const carriers = core.carrierGroups[taskOrdinal]

  assert.throws(() => ingestModelBrokerExchangeTask(
    ingestOptions(core, taskOrdinal, carriers.slice(0, -1)),
  ), /partial|unexpected completion/)

  const duplicated = structuredClone(carriers)
  duplicated[1] = duplicated[0]
  assert.throws(() => ingestModelBrokerExchangeTask(
    ingestOptions(core, taskOrdinal, duplicated),
  ), /duplicated|reordered/)

  const reordered = structuredClone(carriers)
  ;[reordered[0], reordered[1]] = [reordered[1], reordered[0]]
  assert.throws(() => ingestModelBrokerExchangeTask(
    ingestOptions(core, taskOrdinal, reordered),
  ), /reordered/)

  const otherTaskOrdinal = taskOrdinal === 0 ? 1 : 0
  const substituted = structuredClone(carriers)
  substituted[0] = core.carrierGroups[otherTaskOrdinal][0]
  assert.throws(() => ingestModelBrokerExchangeTask(
    ingestOptions(core, taskOrdinal, substituted),
  ), /foreign|reordered|substituted/)

  const wrongProvider = structuredClone(carriers)
  wrongProvider[0].reviewerProviderId = core.authorProviderId
  const { carrierDigest: ignoredProviderDigest, ...wrongProviderProjection } = wrongProvider[0]
  wrongProvider[0].carrierDigest = digest(canonical(wrongProviderProjection))
  assert.throws(() => ingestModelBrokerExchangeTask(
    ingestOptions(core, taskOrdinal, wrongProvider),
  ), /foreign|substituted|mismatched/)

  const wrongModel = structuredClone(carriers)
  wrongModel[0].requestModelId = 'unregistered-model'
  const { carrierDigest: ignoredModelDigest, ...wrongModelProjection } = wrongModel[0]
  wrongModel[0].carrierDigest = digest(canonical(wrongModelProjection))
  assert.throws(() => ingestModelBrokerExchangeTask(
    ingestOptions(core, taskOrdinal, wrongModel),
  ), /foreign|substituted|mismatched/)

  assert.throws(() => closeModelBrokerExchange({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskCompletions: core.taskCompletions.slice(0, -1),
  }), /until every scheduled task completes/)

  assert.throws(() => closeModelBrokerExchange({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskCompletions: [...core.taskCompletions].reverse(),
  }), /reordered|substituted/)

  assert.throws(() => closeModelBrokerExchange({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskCompletions: [core.taskCompletions[0], core.taskCompletions[0]],
  }), /duplicate|reordered|substituted/)

  assert.throws(() => closeModelBrokerExchange({
    scheduleValidation: core.scheduleValidation,
    exchangeSchedule: core.exchangeSchedule,
    taskCompletions: core.taskCompletions.map((completion) => structuredClone(completion)),
  }), /substituted|overclaimed/)

  assert.throws(() => prepareModelBrokerExchangeRequest({
    trust: core.trust,
    scheduleValidation: {
      exchangeScheduleDigest: core.exchangeSchedule.exchangeScheduleDigest,
      taskSetDigest: core.taskSet.taskSetDigest,
    },
    exchangeSchedule: core.exchangeSchedule,
    taskSet: core.taskSet,
    dispatchSchedule: core.dispatchSchedule,
    contentSet: core.contentSet,
    carrierMetadata: core.carrierMetadata,
    taskDescriptor: core.taskDescriptors[0],
    taskOrdinal: 0,
    shardOrdinal: 0,
  }), /lacks current canonical validation/)

  const fabricatedSchedule = structuredClone(core.exchangeSchedule)
  ;[fabricatedSchedule.requests[0], fabricatedSchedule.requests[1]] = [
    fabricatedSchedule.requests[1],
    fabricatedSchedule.requests[0],
  ]
  const { exchangeScheduleDigest, ...scheduleProjection } = fabricatedSchedule
  fabricatedSchedule.exchangeScheduleDigest = digest(canonical(scheduleProjection))
  assert.throws(() => validateModelBrokerExchangeSchedule(
    fabricatedSchedule,
    core.scheduleOptions,
  ), /stale|substituted|reordered/)
}

function assertSelfConsistentStaleTargetRejected(core) {
  const staleTarget = digest('self-consistent-stale-worktree-target')
  const staleDescriptors = core.taskDescriptors.map((descriptor) => {
    const poisoned = structuredClone(descriptor)
    poisoned.identity.worktreeFingerprint = staleTarget
    return readdressDescriptor(poisoned)
  })
  staleDescriptors.forEach((descriptor) => {
    assert.doesNotThrow(() => validateBrokerTaskDispatchDescriptor(descriptor, {
      planState: core.planState,
    }))
  })
  const taskSet = buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: core.taskSet.expectedTaskKeys,
    taskDescriptors: staleDescriptors,
    planState: core.planState,
  })
  const dispatchSchedule = preflightBrokerDispatch({
    taskSet,
    taskDescriptors: staleDescriptors,
    planState: core.planState,
  })
  const contentSet = buildBrokerGlobalContentSet({
    taskSet,
    taskDescriptors: staleDescriptors,
    carrierMetadata: core.carrierMetadata,
    planState: core.planState,
  })
  const options = {
    ...core.scheduleOptions,
    taskSet,
    taskDescriptors: staleDescriptors,
    dispatchSchedule,
    contentSet,
  }
  assert.throws(
    () => prepareModelBrokerExchangeSchedule(options),
    /stale, substituted, or foreign frozen target/,
  )
}

function assertProviderAndModelPoisoning(core) {
  assert.throws(() => prepareModelBrokerExchangeSchedule({
    ...core.scheduleOptions,
    trust: {
      ...loadModelBrokerExchangeTrustState({ repoRoot: ROOT, providerId: core.authorProviderId }),
      brokerState: core.planState,
    },
    reviewerProviderId: core.authorProviderId,
  }), /must be distinct/)
  assert.throws(() => loadModelBrokerExchangeTrustState({
    repoRoot: ROOT,
    providerId: 'unknown-provider',
  }), /profile|provider|closed repository-unmounted/)
  assert.throws(() => prepareModelBrokerExchangeSchedule({
    ...core.scheduleOptions,
    requestModelId: 'unknown-model',
  }), /model release is absent|not exact/)

  const wrongPeerManifest = structuredClone(core.fixture.manifest)
  wrongPeerManifest.providers.peer.runtimeProfileId = core.authorProviderId
  wrongPeerManifest.providerIdentityDigest = deepAuditProviderIdentityDigest({
    authorProvider: wrongPeerManifest.authorProvider,
    providers: wrongPeerManifest.providers,
  })
  assert.throws(() => prepareModelBrokerExchangeSchedule({
    ...core.scheduleOptions,
    manifest: wrongPeerManifest,
  }), /profile binding is unknown|stale|substituted|foreign frozen target/)
}

function preparedArtifactEvidence(prepared) {
  const entries = {
    taskSet: {
      value: prepared.taskSet,
      addressedDigests: [prepared.taskSet.taskSetDigest],
    },
    taskDescriptors: {
      value: prepared.taskDescriptors,
      addressedDigests: prepared.taskDescriptors.map((descriptor) => descriptor.descriptorDigest),
    },
    carrierMetadata: {
      value: prepared.carrierMetadata,
      addressedDigests: prepared.carrierMetadata.map((metadata) => metadata.metadataDigest),
    },
    reviewSelection: {
      value: prepared.reviewSelection,
      addressedDigests: [prepared.reviewSelection.selectionDigest],
    },
    reviewGraph: {
      value: prepared.reviewGraph,
      addressedDigests: [
        prepared.reviewGraph.reviewGraphDigest,
        prepared.reviewGraph.proof.coverageCompletenessDigest,
        ...prepared.reviewGraph.reviewWorkUnits.map((unit) => unit.workUnitDigest),
        ...prepared.reviewGraph.synthesisUnits.map((unit) => unit.synthesisUnitDigest),
      ],
    },
    globalContentSet: {
      value: prepared.contentSet,
      addressedDigests: [prepared.contentSet.contentSetDigest],
    },
    exchangeSchedule: {
      value: prepared.exchangeSchedule,
      addressedDigests: prepared.exchangeSchedule === null
        ? []
        : [
            prepared.exchangeSchedule.exchangeScheduleDigest,
            ...prepared.exchangeSchedule.requests.map((request) => request.requestPlanDigest),
          ],
    },
  }
  return Object.fromEntries(Object.entries(entries).map(([name, item]) => {
    const bytes = canonicalBytes(item.value)
    return [name, {
      bytes,
      bytesSha256: digest(bytes),
      addressedDigests: item.addressedDigests,
    }]
  }))
}

function assertPreparedArtifactsEqual(left, right) {
  assert.deepEqual(Object.keys(left), Object.keys(right))
  for (const name of Object.keys(left)) {
    assert(left[name].bytes.equals(right[name].bytes), `${name} canonical bytes must be reproducible`)
    assert.equal(left[name].bytesSha256, right[name].bytesSha256)
    assert.deepEqual(left[name].addressedDigests, right[name].addressedDigests)
  }
}

function assertFullTaskSetPoisoning(prepared, brokerState) {
  const missingTaskSet = structuredClone(prepared.taskSet)
  missingTaskSet.expectedTaskKeys.pop()
  missingTaskSet.taskDescriptorDigests.pop()
  missingTaskSet.expectedTaskCount -= 1
  assert.throws(() => validateBrokerTaskSet(
    readdressTaskSet(missingTaskSet),
    { taskDescriptors: prepared.taskDescriptors, planState: brokerState },
  ), /expected task keys|incomplete|match/)

  const replacedTaskSet = structuredClone(prepared.taskSet)
  replacedTaskSet.expectedTaskKeys[0] = 'judgment:999'
  assert.throws(() => validateBrokerTaskSet(
    readdressTaskSet(replacedTaskSet),
    { taskDescriptors: prepared.taskDescriptors, planState: brokerState },
  ), /expected task keys|substituted|match/)

  assert.throws(() => validateBrokerTaskSet(prepared.taskSet, {
    taskDescriptors: prepared.taskDescriptors.slice(1),
    planState: brokerState,
  }), /incomplete|expected task keys|stale|substituted/)

  const replacedDescriptors = [...prepared.taskDescriptors]
  replacedDescriptors[0] = prepared.taskDescriptors[1]
  assert.throws(() => validateBrokerTaskSet(prepared.taskSet, {
    taskDescriptors: replacedDescriptors,
    planState: brokerState,
  }), /duplicate|reordered|substituted/)
}

const before = captureGitVisibleWorktree(ROOT)
const transportBudgetGuardOnly =
  process.argv.includes('--transport-budget-guard-only')
const singleCellPartitionGuardOnly =
  process.argv.includes('--single-cell-partition-guard-only')
const originalFetch = globalThis.fetch
let fetchCalls = 0
globalThis.fetch = () => {
  fetchCalls += 1
  throw new Error('network capability is forbidden in provider-neutral review core tests')
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'provider-neutral-review-core-'))
let explicitEvidenceRoot = null
let explicitEvidencePath = null
try {
  const baseBrokerPlan = loadModelEvidenceBrokerPlan({ repoRoot: ROOT })
  const planState = fixturePlan(baseBrokerPlan)
  const modelPlanState = loadModelEvidencePlan({ repoRoot: ROOT })

  const codexFixture = fixtureManifest(fixtureRoot, 'codex')
  const codexToClaude = exerciseFixtureExchange(buildFixtureExchange({
    root: fixtureRoot,
    fixture: codexFixture,
    planState,
    modelPlanState,
    authorProviderId: 'codex',
    reviewerProviderId: 'claude',
    requestModelId: 'claude-sonnet-4-5-20250929',
  }))
  assertCarrierPoisoning(codexToClaude)
  assertResultAndClosurePoisoning(codexToClaude)
  assertSelfConsistentStaleTargetRejected(codexToClaude)
  assertProviderAndModelPoisoning(codexToClaude)

  const claudeFixture = fixtureManifest(fixtureRoot, 'claude')
  const claudeToCodex = exerciseFixtureExchange(buildFixtureExchange({
    root: fixtureRoot,
    fixture: claudeFixture,
    planState,
    modelPlanState,
    authorProviderId: 'claude',
    reviewerProviderId: 'codex',
    requestModelId: 'gpt-5.6-sol',
  }))
  assert.equal(claudeToCodex.fixture.manifest.authorProvider, 'claude')
  assert.equal(claudeToCodex.fixture.manifest.providers.self.id, 'claude')
  assert.equal(claudeToCodex.fixture.manifest.providers.peer.id, 'codex')
  assert.notEqual(
    codexToClaude.exchangeSchedule.reviewIdentity.reviewerProviderId,
    claudeToCodex.exchangeSchedule.reviewIdentity.reviewerProviderId,
  )
  assert.equal(claudeToCodex.completion.genuineCrossProviderReview, false)
  assert.equal(claudeToCodex.completion.promotionEligible, false)
  assert.equal(claudeToCodex.completion.managedEvidence, false)
  console.log('✓ both legitimate author/self directions use one task-set/content-set/carrier/schedule/ingest core; structural fixtures remain unattested and non-promotable')

  const codexGraphFixture = selectedFixtureManifest(fixtureRoot, 'codex')
  const codexToClaudeGraph = exerciseFixtureGraphExchange(buildFixtureGraphExchange({
    root: fixtureRoot,
    fixture: codexGraphFixture,
    planState,
    modelPlanState,
  }))
  assertIndexedReviewGraphParityAndPoisoning(codexToClaudeGraph)
  assertCapabilityBatchingFailClosed(codexToClaudeGraph)
  assertDeterministicReductionIsolation(codexToClaudeGraph)
  assertMonotonicGraphReductionAndResultBudget(codexToClaudeGraph)
  const codexTransportBudget =
    assertFixtureExactPortablePayloadBudgets(codexToClaudeGraph)
  const claudeGraphFixture = selectedFixtureManifest(fixtureRoot, 'claude')
  const claudeToCodexGraph = exerciseFixtureGraphExchange(buildFixtureGraphExchange({
    root: fixtureRoot,
    fixture: claudeGraphFixture,
    planState,
    modelPlanState,
  }))
  const claudeTransportBudget =
    assertFixtureExactPortablePayloadBudgets(claudeToCodexGraph)
  assert.equal(
    codexToClaudeGraph.exchangeSchedule.reviewIdentity.reviewerProviderId,
    'claude',
  )
  assert.equal(
    claudeToCodexGraph.exchangeSchedule.reviewIdentity.reviewerProviderId,
    'codex',
  )
  assert.notEqual(
    codexToClaudeGraph.exchangeSchedule.reviewIdentity.selectionDigest,
    claudeToCodexGraph.exchangeSchedule.reviewIdentity.selectionDigest,
  )
  console.log('✓ both author directions execute the same capability-selected graph prepare → ordered exchange → exact ingest → hierarchical reduce lifecycle; changed upstream result bytes invalidate downstream synthesis replay')
  console.log('✓ one-pass review-graph indexes preserve canonical schedule/request bytes and digests while duplicate coverage cells and substituted leaf references still fail closed')
  console.log(`✓ canonical transport budget closes exact serialized envelope + schema + carrier + CAS blob bytes for both provider directions (${codexTransportBudget.requestCount + claudeTransportBudget.requestCount} requests; max actual ${Math.max(codexTransportBudget.maxActualBytes, claudeTransportBudget.maxActualBytes)} bytes; max planned ${Math.max(codexTransportBudget.maxPlannedBytes, claudeTransportBudget.maxPlannedBytes)} bytes) and fails closed one byte over plan`)

  const transportRegressionFixture =
    selectedTransportBudgetRegressionManifest(fixtureRoot, 'codex')
  const transportRegressionCore = buildFixtureGraphExchange({
    root: fixtureRoot,
    fixture: transportRegressionFixture,
    planState: baseBrokerPlan,
    modelPlanState,
    judgmentDimensions: modelPlanState.judgmentDimensions,
    includeComponent: false,
  })
  assert.equal(transportRegressionCore.taskSet.expectedTaskCount, 26)
  assert(
    transportRegressionCore.reviewGraph.proof.judgmentReviewWorkUnitCount > 1,
    'large identical judgment capsule must split instead of overflowing transport',
  )
  const transportRegressionBudget =
    assertFixtureExactPortablePayloadBudgets(transportRegressionCore)
  console.log(`✓ request-0 regression guard deterministically packs the complete 26-dimension identical-evidence capsule into ${transportRegressionBudget.requestCount} capability-bounded requests (max actual ${transportRegressionBudget.maxActualBytes}; max planned ${transportRegressionBudget.maxPlannedBytes}; certified input limit ${transportRegressionCore.exchangeSchedule.capabilityBudget.maxInputBytes})`)

  const constrainedTransportRegressionCore = buildFixtureGraphExchange({
    root: fixtureRoot,
    fixture: transportRegressionFixture,
    planState: baseBrokerPlan,
    modelPlanState,
    judgmentDimensions: modelPlanState.judgmentDimensions,
    includeComponent: false,
    capabilityBudgetOverrides: {
      maxInputBytes: 165000,
      maxOutputBytes: 4194304,
      maxPayloadBytes: 4359304,
    },
  })
  assert(
    constrainedTransportRegressionCore.exchangeSchedule.requestCount
      > transportRegressionCore.exchangeSchedule.requestCount,
    'exact serialized portable overhead must split a batch that only the approximate plan could fit',
  )
  assert.deepEqual(
    constrainedTransportRegressionCore.exchangeSchedule.requests.flatMap(
      (request) => request.memberUnitIds,
    ),
    constrainedTransportRegressionCore.reviewGraph.reviewWorkUnits.map(
      (unit) => unit.workUnitId,
    ),
  )
  const constrainedTransportBudget =
    assertFixtureExactPortablePayloadBudgets(constrainedTransportRegressionCore)
  const missingConstrainedSchedule =
    structuredClone(constrainedTransportRegressionCore.exchangeSchedule)
  missingConstrainedSchedule.requests.pop()
  missingConstrainedSchedule.requestCount -= 1
  missingConstrainedSchedule.providerCallCount -= 1
  missingConstrainedSchedule.reviewWorkRequestCount -= 1
  assert.throws(() => validateModelBrokerReviewGraphExchangeSchedule(
    missingConstrainedSchedule,
    constrainedTransportRegressionCore.scheduleOptions,
  ), /stale|substituted|incomplete|duplicated|reordered/)
  const reorderedConstrainedSchedule =
    structuredClone(constrainedTransportRegressionCore.exchangeSchedule)
  reorderedConstrainedSchedule.requests.reverse()
  assert.throws(() => validateModelBrokerReviewGraphExchangeSchedule(
    reorderedConstrainedSchedule,
    constrainedTransportRegressionCore.scheduleOptions,
  ), /stale|substituted|incomplete|duplicated|reordered/)
  console.log(`✓ exact canonical envelope/schema/carrier/CAS planning splits the same complete ordered graph into ${constrainedTransportBudget.requestCount} requests at a 165000-byte certified input limit; actual <= planned <= capability for every batch, one-byte-under plan and missing/reordered schedules fail closed`)

  if (singleCellPartitionGuardOnly) {
    explicitEvidenceRoot = `provider-neutral-single-cell-partition-${randomUUID()}`
    const frozen = prepareDeepAuditRun({
      repoRoot: ROOT,
      explicitRoot: explicitEvidenceRoot,
      selfProvider: 'codex',
      authorProvider: 'codex',
      selfRuntime: 'codex-desktop',
      selfSurface: 'local',
    })
    explicitEvidencePath = frozen.evidenceRoot
    const component = 'Accordion'
    const coverage = expandComponentA1bCoverage(frozen.manifest, component)
    const claimInventory = buildComponentClaimInventory({
      repoRoot: ROOT,
      manifest: frozen.manifest,
      component,
    })
    const buildComponentShardSet = (planState, inventory) => (
      buildContentAddressedBrokerShards({
        repoRoot: ROOT,
        manifest: frozen.manifest,
        manifestSha256: frozen.manifestSha256,
        coveragePaths: coverage.inventoryPaths,
        coverageInventoryDigest: coverage.inventoryDigest,
        taskKind: 'component-a1b',
        subject: component,
        modelEvidencePlanDigest: modelPlanState.planDigest,
        dependencySourceInventory: claimInventory.dependencySourceInventory,
        claimInventory: inventory,
        planState,
      })
    )
    const claimShardSet = buildComponentShardSet(baseBrokerPlan, claimInventory)
    const claimDescriptor = buildBrokerTaskDispatchDescriptor(claimShardSet, {
      planState: baseBrokerPlan,
      claimInventoryDigest: claimInventory.claimInventoryDigest,
    })
    const claimTaskSet = buildBrokerTaskSet({
      scopeKind: 'fixture',
      expectedTaskKeys: [`component-a1b:${component}`],
      taskDescriptors: [claimDescriptor],
      planState: baseBrokerPlan,
    })
    const claimGraphOptions = {
      taskSet: claimTaskSet,
      taskDescriptors: [claimDescriptor],
      planState: baseBrokerPlan,
    }
    const claimGraph = buildBrokerNoSampleReviewGraph(claimGraphOptions)
    assert.doesNotThrow(() => validateBrokerNoSampleReviewGraph(
      claimGraph,
      claimGraphOptions,
    ))
    const expectedClaimIds = claimInventory.claims.map((claim) => claim.claimId).sort()
    const actualClaimIds = claimShardSet.shards
      .flatMap((shard) => shard.claims.map((claim) => claim.claimId))
      .sort()
    assert.deepEqual(actualClaimIds, expectedClaimIds)
    assert.equal(new Set(actualClaimIds).size, actualClaimIds.length)
    const claimCapsules = new Map()
    for (const shard of claimShardSet.shards.filter((item) => item.claims.length)) {
      const capsule = canonical(shard.chunks.map((chunk) => chunk.chunkId).sort())
      if (!claimCapsules.has(capsule)) claimCapsules.set(capsule, [])
      claimCapsules.get(capsule).push(shard)
    }
    const splitClaimCapsule = [...claimCapsules.values()]
      .sort((left, right) => (
        right.reduce((sum, shard) => sum + shard.claims.length, 0)
        - left.reduce((sum, shard) => sum + shard.claims.length, 0)
      ))
      .find((shards) => shards.length > 1)
    assert(splitClaimCapsule, 'oversized claim capsule must split into bounded native shards')
    assert(splitClaimCapsule.every((shard) => (
      canonical(shard.chunks.map((chunk) => chunk.chunkId).sort())
        === canonical(splitClaimCapsule[0].chunks.map((chunk) => chunk.chunkId).sort())
    )))
    assert(claimGraph.reviewWorkUnits.every((unit) => (
      unit.preparedTransportBytes <= baseBrokerPlan.plan.limits.maxPromptBytesPerShard
    )))
    assert.equal(claimGraph.proof.claimCoverageOwnershipDuplicateCount, 0)
    assert(claimGraph.proof.claimContextReuseCount > 0)
    assert.equal(claimGraph.proof.claimContextReuseIsCoverageOverlap, false)
    assert.equal(claimGraph.proof.overlapCount, 0)

    const zeroClaimPlan = structuredClone(baseBrokerPlan.plan)
    zeroClaimPlan.limits.maxPromptBytesPerShard = 90000
    const zeroClaimPlanState = {
      ...baseBrokerPlan,
      plan: zeroClaimPlan,
      planDigest: digest(canonical(zeroClaimPlan)),
    }
    const zeroClaimInventory = {
      ...claimInventory,
      claimInventoryDigest: digest(canonical([])),
      claimCount: 0,
      claims: [],
    }
    const zeroClaimShardSet = buildComponentShardSet(
      zeroClaimPlanState,
      zeroClaimInventory,
    )
    const zeroClaimDescriptor = buildBrokerTaskDispatchDescriptor(
      zeroClaimShardSet,
      {
        planState: zeroClaimPlanState,
        claimInventoryDigest: zeroClaimInventory.claimInventoryDigest,
      },
    )
    const zeroClaimTaskSet = buildBrokerTaskSet({
      scopeKind: 'fixture',
      expectedTaskKeys: [`component-a1b:${component}`],
      taskDescriptors: [zeroClaimDescriptor],
      planState: zeroClaimPlanState,
    })
    const zeroClaimGraphOptions = {
      taskSet: zeroClaimTaskSet,
      taskDescriptors: [zeroClaimDescriptor],
      planState: zeroClaimPlanState,
    }
    const zeroClaimGraph = buildBrokerNoSampleReviewGraph(zeroClaimGraphOptions)
    assert.doesNotThrow(() => validateBrokerNoSampleReviewGraph(
      zeroClaimGraph,
      zeroClaimGraphOptions,
    ))
    const zeroClaimLeafIds = zeroClaimShardSet.shards
      .flatMap((shard) => shard.chunks.map((chunk) => chunk.chunkId))
    assert(zeroClaimShardSet.shardCount > 1)
    assert(zeroClaimShardSet.shards.every((shard) => shard.claims.length === 0))
    assert.equal(zeroClaimLeafIds.length, new Set(zeroClaimLeafIds).size)
    assert.equal(
      new Set(zeroClaimLeafIds).size,
      zeroClaimShardSet.inputArtifactSet.sourceChunkCount,
    )
    assert(zeroClaimGraph.coverageCells.every(
      (cell) => cell.cellKind === 'shared-evidence-review-cell',
    ))
    assert(zeroClaimGraph.reviewWorkUnits.every((unit) => (
      unit.preparedTransportBytes <= zeroClaimPlan.limits.maxPromptBytesPerShard
    )))
    assert.equal(zeroClaimGraph.proof.expectedSharedLeafUseCount, zeroClaimLeafIds.length)
    assert.equal(zeroClaimGraph.proof.actualSharedLeafUseCount, zeroClaimLeafIds.length)
    assert.equal(zeroClaimGraph.proof.overlapCount, 0)
    console.log(`✓ oversized native claim cell splits into ${splitClaimCapsule.length} deterministic full-context claim batches with exact-once claim ownership; content-addressed context reuse is not coverage overlap; forced oversized zero-claim corpus refines into ${zeroClaimShardSet.shardCount} bounded shared cells with ${zeroClaimLeafIds.length} leaves exactly once`)

    const dimension = modelPlanState.judgmentByDimension.get(14)
    assert(dimension, 'focused oversized-cell regression requires judgment dimension 14')
    const oversizedCellFixture = selectedTransportBudgetRegressionManifest(
      fixtureRoot,
      'codex',
      1100,
    )
    const oversizedCellPlan = structuredClone(baseBrokerPlan.plan)
    oversizedCellPlan.limits.maxPromptBytesPerShard = 80000
    const oversizedCellPlanState = {
      ...baseBrokerPlan,
      plan: oversizedCellPlan,
      planDigest: digest(canonical(oversizedCellPlan)),
    }
    const oversizedCellCore = buildFixtureGraphExchange({
      root: fixtureRoot,
      fixture: oversizedCellFixture,
      planState: oversizedCellPlanState,
      modelPlanState,
      judgmentDimensions: [dimension],
      includeComponent: false,
    })
    const judgmentGraph = oversizedCellCore.reviewGraph
    const judgmentGraphOptions = {
      taskSet: oversizedCellCore.taskSet,
      taskDescriptors: oversizedCellCore.taskDescriptors,
      planState: oversizedCellPlanState,
    }
    const repeatedJudgmentGraph =
      buildBrokerNoSampleReviewGraph(judgmentGraphOptions)
    assert.equal(
      canonicalBytes(judgmentGraph).compare(canonicalBytes(repeatedJudgmentGraph)),
      0,
      'oversized-cell fragmentation must be byte-for-byte deterministic',
    )
    assert.equal(
      judgmentGraph.reviewGraphDigest,
      repeatedJudgmentGraph.reviewGraphDigest,
    )
    assert(
      judgmentGraph.coveragePartitionCount > 0,
      `oversized-cell fixture did not fragment:maxPrepared=${Math.max(
        ...judgmentGraph.reviewWorkUnits.map((unit) => unit.preparedTransportBytes),
      )}:maxShardPrompt=${Math.max(
        ...oversizedCellCore.tasks.flatMap(({ shardSet }) => (
          shardSet.shards.map((shard) => shard.promptBytes)
        )),
      )}`,
    )
    assert(judgmentGraph.proof.fragmentedSourceCoverageCellCount > 0)
    assert(judgmentGraph.proof.coverageFragmentCount >= 2)
    assert.equal(judgmentGraph.proof.coveragePartitionMissingCount, 0)
    assert.equal(judgmentGraph.proof.coveragePartitionDuplicateCount, 0)
    assert.equal(judgmentGraph.proof.coveragePartitionOverlapCount, 0)
    assert.equal(judgmentGraph.proof.sampling, false)
    assert(judgmentGraph.reviewWorkUnits.every((unit) => (
      unit.preparedTransportBytes
        <= oversizedCellPlanState.plan.limits.maxPromptBytesPerShard
    )))
    for (const partition of judgmentGraph.coveragePartitions) {
      const fragments = partition.fragmentCellIds.map((cellId) => (
        judgmentGraph.coverageCells.find((cell) => cell.cellId === cellId)
      ))
      assert(fragments.every(Boolean))
      assert.deepEqual(
        fragments.flatMap((cell) => cell.leafIds).sort(),
        [...partition.sourceLeafIds].sort(),
      )
      assert.equal(
        new Set(fragments.flatMap((cell) => cell.leafIds)).size,
        partition.sourceLeafIds.length,
      )
      const synthesis = judgmentGraph.synthesisUnits.find(
        (unit) => unit.taskKey === partition.sourceTaskKey,
      )
      assert(synthesis)
      assert(partition.fragmentCellIds.every(
        (cellId) => synthesis.inputIds.includes(cellId),
      ))
    }
    assert.doesNotThrow(() => validateBrokerNoSampleReviewGraph(
      judgmentGraph,
      judgmentGraphOptions,
    ))
    const exercisedJudgmentGraph = exerciseFixtureGraphExchange(
      oversizedCellCore,
      { expectedAggregateVerdict: 'verified' },
    )
    assert.equal(exercisedJudgmentGraph.completion.fullNoSampleClosure, true)
    assert.equal(exercisedJudgmentGraph.completion.aggregateVerdict, 'verified')

    const workResults = judgmentGraph.reviewWorkUnits.map((unit) => (
      buildBrokerStructuralReviewGraphResult(judgmentGraph, unit)
    ))
    const synthesisResults = judgmentGraph.synthesisUnits.map((unit) => (
      buildBrokerStructuralReviewGraphResult(judgmentGraph, unit)
    ))
    assert.doesNotThrow(() => closeBrokerNoSampleReviewGraph({
      graph: judgmentGraph,
      workResults,
      synthesisResults,
      ...judgmentGraphOptions,
    }))
    assert.throws(() => closeBrokerNoSampleReviewGraph({
      graph: judgmentGraph,
      workResults: workResults.slice(0, -1),
      synthesisResults,
      ...judgmentGraphOptions,
    }), /partial|unexpected completion/)
    assert.throws(() => closeBrokerNoSampleReviewGraph({
      graph: judgmentGraph,
      workResults: [...workResults, workResults[0]],
      synthesisResults,
      ...judgmentGraphOptions,
    }), /partial|unexpected completion/)
    assert.throws(() => closeBrokerNoSampleReviewGraph({
      graph: judgmentGraph,
      workResults: [...workResults].reverse(),
      synthesisResults,
      ...judgmentGraphOptions,
    }), /duplicated|reordered|stale|substituted/)

    const refreshGraphDigest = (graph) => {
      const { reviewGraphDigest, ...projection } = graph
      graph.reviewGraphDigest = digest(canonical(projection))
      return graph
    }
    const assertTamperedGraphRejected = (graph) => {
      refreshGraphDigest(graph)
      assert.throws(() => validateBrokerNoSampleReviewGraph(
        graph,
        judgmentGraphOptions,
      ), /invalid|stale|substituted|incomplete|duplicated|reordered/)
    }
    const firstPartition = judgmentGraph.coveragePartitions[0]
    const firstFragmentId = firstPartition.fragmentCellIds[0]
    const secondFragmentId = firstPartition.fragmentCellIds[1]
    const firstFragment = judgmentGraph.coverageCells.find(
      (cell) => cell.cellId === firstFragmentId,
    )

    const missingFragmentGraph = structuredClone(judgmentGraph)
    missingFragmentGraph.coverageCells = missingFragmentGraph.coverageCells
      .filter((cell) => cell.cellId !== firstFragmentId)
    missingFragmentGraph.coverageCellCount -= 1
    assertTamperedGraphRejected(missingFragmentGraph)

    const duplicateFragmentGraph = structuredClone(judgmentGraph)
    duplicateFragmentGraph.coverageCells.push(structuredClone(firstFragment))
    duplicateFragmentGraph.coverageCellCount += 1
    assertTamperedGraphRejected(duplicateFragmentGraph)

    const reorderedFragmentGraph = structuredClone(judgmentGraph)
    const reorderedPartition = reorderedFragmentGraph.coveragePartitions[0]
    ;[reorderedPartition.fragmentCellIds[0], reorderedPartition.fragmentCellIds[1]] =
      [reorderedPartition.fragmentCellIds[1], reorderedPartition.fragmentCellIds[0]]
    reorderedPartition.partitionDigest = digest(canonical((({
      partitionDigest,
      ...projection
    }) => projection)(reorderedPartition)))
    assertTamperedGraphRejected(reorderedFragmentGraph)

    const substitutedFragmentGraph = structuredClone(judgmentGraph)
    const substitutedFragment = substitutedFragmentGraph.coverageCells.find(
      (cell) => cell.cellId === firstFragmentId,
    )
    substitutedFragment.sourceCellId = digest('substituted-source-cell')
    assertTamperedGraphRejected(substitutedFragmentGraph)

    const overlappingFragmentGraph = structuredClone(judgmentGraph)
    const overlappingFragment = overlappingFragmentGraph.coverageCells.find(
      (cell) => cell.cellId === secondFragmentId,
    )
    overlappingFragment.leafIds[0] = firstFragment.leafIds[0]
    assertTamperedGraphRejected(overlappingFragmentGraph)
    console.log(`✓ oversized judgment coverage cells deterministically fragment into ${judgmentGraph.proof.coverageFragmentCount} content-addressed bounded fragments; exact source/leaf/cell closure and reducer reject missing, duplicate, reordered, substituted, and overlapping fragments before aggregation`)
  }

  if (!transportBudgetGuardOnly && !singleCellPartitionGuardOnly) {
    explicitEvidenceRoot = `provider-neutral-review-core-${randomUUID()}`
    const frozen = prepareDeepAuditRun({
    repoRoot: ROOT,
    explicitRoot: explicitEvidenceRoot,
    selfProvider: 'codex',
    authorProvider: 'codex',
    selfRuntime: 'codex-desktop',
    selfSurface: 'local',
  })
  explicitEvidencePath = frozen.evidenceRoot
  let first = prepareProviderNeutralReviewExchange({
    repoRoot: ROOT,
    explicitRoot: explicitEvidenceRoot,
  })
  assert.equal(first.run.manifest.runId, frozen.manifest.runId)
  assert.equal(modelPlanState.judgmentDimensions.length, 26)
  assert.equal(frozen.manifest.components.length, 64)
  assert.equal(first.taskSet.expectedTaskCount, 26 + 64)
  assert.equal(first.taskDescriptors.length, 26 + 64)
  assert.equal(first.reviewGraph.taskCount, 26 + 64)
  assert.equal(first.taskSet.scopeKind, 'registered-full-review')
  assert.deepEqual(
    first.taskSet.expectedTaskKeys.slice(0, 26),
    modelPlanState.judgmentDimensions.map((dimension) => `judgment:${dimension.dim}`),
  )
  assert.deepEqual(
    first.taskSet.expectedTaskKeys.slice(26),
    frozen.manifest.components.map((component) => `component-a1b:${component.name}`),
  )
  assert.equal(first.reviewGraph.proof.complete, true)
  assert.equal(first.reviewGraph.proof.missingCount, 0)
  assert.equal(first.reviewGraph.proof.unexpectedCount, 0)
  assert.equal(first.reviewGraph.proof.duplicateCount, 0)
  assert.equal(first.reviewGraph.proof.overlapCount, 0)
  assert.equal(first.reviewGraph.proof.unknownApplicabilityCount, 0)
  assert.equal(first.reviewGraph.proof.zeroClaimStandaloneWorkUnitCount, 0)
  assert.equal(first.reviewGraph.proof.taskSynthesisProviderCallCount, 0)
  assert.equal(
    first.reviewGraph.proof.modelReviewWorkUnitCount,
    first.reviewGraph.reviewWorkUnitCount,
  )
  assert.equal(first.reviewGraph.synthesisUnitCount, first.reviewGraph.taskCount)
  assert.equal(
    first.reviewGraph.deterministicReductionUnitCount,
    first.reviewGraph.taskCount,
  )
  assert(first.reviewGraph.synthesisUnits.every(
    (unit) => unit.stage === 0 && unit.inputKind === 'coverage-cells',
  ))
  assert.equal(
    first.reviewGraph.dispatchTotals.reviewWorkUnitCount,
    first.reviewGraph.reviewWorkUnitCount,
  )
  assert.equal(
    first.reviewGraph.dispatchTotals.providerCallUpperBound,
    first.reviewGraph.reviewWorkUnitCount,
  )
  assert.equal(
    first.reviewGraph.dispatchTotals.providerCallAccounting,
    'capability-bounded-exchange-schedule',
  )
  assert.equal(first.reviewGraph.dispatchTotals.synthesisProviderCalls, 0)
  assert.equal(
    first.reviewGraph.dispatchTotals.deterministicReductionUnits,
    first.reviewGraph.synthesisUnitCount,
  )
  assert.equal(first.reviewGraph.proof.sampling, false)
  assert.equal(first.contentSet.sampling, false)
  assert.equal(first.reviewSelection.kind, 'provider-review-capability-selection-blocked')
  assert.equal(first.reviewSelectionStatus, 'REVIEW-BLOCKED')
  assert.equal(first.run.manifest.providers.peer, null)
  assert.equal(first.reviewerProviderId, null)
  assert.equal(first.requestModelId, null)
  assert.equal(first.exchangeSchedule, null)
  assert.equal(first.completeReviewScheduleDigest, first.reviewGraph.reviewGraphDigest)
  assert.equal(
    first.coverageCompletenessDigest,
    first.reviewGraph.proof.coverageCompletenessDigest,
  )
  assertFullTaskSetPoisoning(first, baseBrokerPlan)
  assert.equal(first.noNetworkCapability, true)
  assert.equal(first.noCredentialCapability, true)
  assert.equal(first.noRepositoryMutationCapability, true)
  assert.equal(fetchCalls, 0)
  const firstArtifactEvidence = preparedArtifactEvidence(first)
  const workUnitCount = first.reviewGraph.dispatchTotals.reviewWorkUnitCount
  first = null

  let second = prepareProviderNeutralReviewExchange({
    repoRoot: ROOT,
    explicitRoot: explicitEvidenceRoot,
  })
  assert.equal(second.run.manifestSha256, frozen.manifestSha256)
  assertPreparedArtifactsEqual(firstArtifactEvidence, preparedArtifactEvidence(second))
  console.log(`✓ hermetic blocked frozen run prepares the complete 26 judgment + 64 manifest-component graph twice with identical canonical bytes/digests and no sampling (${workUnitCount} canonical review work units + ${second.reviewGraph.synthesisUnitCount} content-addressed zero-call task reductions); physical provider calls remain deferred until certified capability selection`)
  assert(workUnitCount > 0)
  second = null

  let selectedFullFirst = buildHermeticSelectedFullReviewCore({
    repoRoot: ROOT,
    manifest: frozen.manifest,
    planState: baseBrokerPlan,
    modelPlanState,
  })
  assert.equal(selectedFullFirst.taskSet.expectedTaskCount, 90)
  assert.equal(selectedFullFirst.reviewGraph.proof.complete, true)
  assert.equal(selectedFullFirst.reviewGraph.proof.missingCount, 0)
  assert.equal(selectedFullFirst.reviewGraph.proof.unexpectedCount, 0)
  assert.equal(selectedFullFirst.reviewGraph.proof.duplicateCount, 0)
  assert.equal(selectedFullFirst.reviewGraph.proof.overlapCount, 0)
  assert.equal(selectedFullFirst.reviewGraph.proof.sampling, false)
  assert.equal(
    selectedFullFirst.reviewGraph.dispatchTotals.reviewWorkUnitCount,
    selectedFullFirst.reviewGraph.reviewWorkUnitCount,
  )
  const selectedRequestCount =
    selectedFullFirst.exchangeSchedule.providerCallCount
  assert.equal(selectedFullFirst.exchangeSchedule.requestCount, selectedRequestCount)
  assert(
    selectedRequestCount < selectedFullFirst.reviewGraph.reviewWorkUnitCount,
    'capability-aware physical batching must use fewer calls than canonical work units',
  )
  assert(
    selectedRequestCount < 5_344,
    'full-90 capability-aware physical provider calls must close below the legacy explosion',
  )
  const selectedFullCoreFirstEvidence = selectedFullCoreEvidence(selectedFullFirst)
  const selectedFullMaterializedFirst = materializeHermeticSelectedFullReview(
    selectedFullFirst,
  )

  let selectedFullSecond = buildHermeticSelectedFullReviewCore({
    repoRoot: ROOT,
    manifest: frozen.manifest,
    planState: baseBrokerPlan,
    modelPlanState,
  })
  assert.equal(selectedFullSecond.taskSet.expectedTaskCount, 90)
  assert.equal(
    selectedFullSecond.reviewGraph.dispatchTotals.reviewWorkUnitCount,
    selectedFullFirst.reviewGraph.reviewWorkUnitCount,
  )
  assert.equal(
    selectedFullSecond.exchangeSchedule.providerCallCount,
    selectedRequestCount,
  )
  assert.equal(selectedFullSecond.exchangeSchedule.requestCount, selectedRequestCount)
  assertPreparedArtifactsEqual(
    selectedFullCoreFirstEvidence,
    selectedFullCoreEvidence(selectedFullSecond),
  )
  const selectedFullMaterializedSecond = materializeHermeticSelectedFullReview(
    selectedFullSecond,
  )
  assert.deepEqual(selectedFullMaterializedFirst, selectedFullMaterializedSecond)
  assert.equal(selectedFullMaterializedFirst.requestCount, selectedRequestCount)
  assert.equal(fetchCalls, 0)
  console.log(`✓ two independently rebuilt full-90 selected cores materialize all ${selectedFullMaterializedFirst.requestCount} ordered request envelopes and carriers twice with identical task/descriptor/content/graph/schedule/request/carrier/blob bytes and digests; max exact prepared payload ${selectedFullMaterializedFirst.maxPreparedPayloadBytes} bytes`)
    selectedFullFirst = null
    selectedFullSecond = null
  }
} finally {
  globalThis.fetch = originalFetch
  rmSync(fixtureRoot, { recursive: true, force: true })
  if (explicitEvidencePath) rmSync(explicitEvidencePath, { recursive: true, force: true })
}

assert.deepEqual(captureGitVisibleWorktree(ROOT), before)
assert.equal(fetchCalls, 0)
console.log('✓ provider-neutral review preparation has no network, credential-value, model invocation, or Git-visible repository-mutation capability')

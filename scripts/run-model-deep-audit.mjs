#!/usr/bin/env node
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  captureDeepAuditSnapshot,
  loadActiveDeepAuditRun,
  sha256,
  stableStringify,
  validateDeepAuditRunProviderBindings,
} from './lib/deep-audit-evidence-contract.mjs'
import {
  buildExternalEntitlementReviewInvocation,
  executeExternalEntitlementReviewInvocation,
  expandComponentA1bCoverage,
  expandJudgmentCoverage,
  loadModelEvidencePlan,
  loadModelInvocationProfiles,
  modelResultSchemaState,
  normalizeExternalEntitlementReviewResponse,
  readExternalEntitlementRuntimePreflight,
  selectBrokerResultWithSelector,
  validateExplicitModel,
  validateImmutableModelForProfile,
} from './lib/model-evidence-plan.mjs'
import { buildComponentClaimInventory } from './lib/component-claim-inventory.mjs'
import {
  buildBrokerGlobalContentSet,
  buildBrokerNoSampleReviewGraph,
  buildBrokerTaskSet,
  buildBrokerTaskDispatchDescriptor,
  buildContentAddressedBrokerShards,
  exportBrokerReviewGraphBatchCarrier,
  exportBrokerShardCarrierWithMetadata,
  loadModelEvidenceBrokerPlan,
  materializeBrokerReviewGraphBatchCarrier,
  validateBrokerReviewGraphBatchPortablePayloadBudget,
  validateBrokerGlobalContentSet,
  validateBrokerNoSampleReviewGraph,
  validateBrokerTaskSet,
} from './lib/model-evidence-broker.mjs'
import {
  buildModelBrokerReviewGraphCapabilityBudget,
  buildModelBrokerReviewGraphResultCarrier,
  ingestModelBrokerReviewGraphExchange,
  ingestModelBrokerReviewGraphExchangeResult,
  loadModelBrokerExchangeTrustState,
  prepareModelBrokerReviewGraphExchangeRequest,
  prepareModelBrokerReviewGraphExchangeSchedule,
  validateModelBrokerReviewGraphExchangeSchedule,
} from './lib/model-broker-transcript.mjs'
import {
  buildGenuineCrossProviderReviewReceipt,
  validateGenuineCrossProviderReviewReceipt,
  validateReviewCapabilitySelectionReceipt,
  verifyEntitlementAvailabilityEvidence,
} from '../packages/governance/src/provider-review-binding.mjs'
import {
  loadManagedCiTrustedExecutionPlan,
  managedCiModelBrokerActivationLifecycleStatus,
  managedCiModelBrokerActivationConvergence,
} from './lib/managed-ci-trusted-execution-plan.mjs'
import {
  archiveGenuineCrossProviderReviewEvidence,
  archiveAllHarnessPassReceipt,
  buildDeepAuditSourceChangeSummary,
  buildFocusedValidationRecordSet,
  writeFrozenReviewBundle,
} from './lib/deep-audit-review-archive.mjs'
import {
  captureGitVisibleWorktree,
} from './lib/worktree-fingerprint.mjs'

const KINDS = new Set(['judgment', 'component-a1b'])

function fail(message) {
  throw new Error(`model deep-audit runner blocked:${message}`)
}

function optionValue(argv, index, token) {
  const equals = token.indexOf('=')
  if (equals >= 0) return { value: token.slice(equals + 1), consumed: 0 }
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) fail(`${token} requires a value`)
  return { value, consumed: 1 }
}

export function parseModelDeepAuditArgs(argv) {
  const result = {
    json: false,
    check: false,
    execute: false,
    allowModel: false,
    managedBroker: false,
    externalEntitlement: false,
    provider: null,
    surface: null,
    model: null,
    kind: null,
    explicitRoot: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--json') result.json = true
    else if (token === '--check') result.check = true
    else if (token === '--execute') result.execute = true
    else if (token === '--allow-model') result.allowModel = true
    else if (token === '--managed-broker') result.managedBroker = true
    else if (token === '--external-entitlement') result.externalEntitlement = true
    else if (token === '--allow-unverified-local-containment') {
      fail('--allow-unverified-local-containment is retired; repository-reading model execution is never promotion evidence')
    } else if (/^--(?:provider|surface|model|kind|evidence-root)(?:=|$)/.test(token)) {
      const name = token.match(/^--([a-z-]+)/)[1]
      const { value, consumed } = optionValue(argv, index, token)
      if (!value) fail(`${name} must be non-empty`)
      if (name === 'evidence-root') result.explicitRoot = value
      else result[name] = value
      index += consumed
    } else fail(`unknown option:${token}`)
  }
  if (result.check && result.execute) fail('--check cannot be combined with --execute')
  if (result.allowModel && !result.execute) fail('--allow-model requires --execute')
  if (result.managedBroker && !result.execute) fail('--managed-broker requires --execute')
  if (result.externalEntitlement && !result.execute) fail('--external-entitlement requires --execute')
  if (result.managedBroker && result.externalEntitlement) {
    fail('--managed-broker and --external-entitlement are mutually exclusive deployment wrappers')
  }
  if (result.kind !== null && !KINDS.has(result.kind)) fail(`unknown model evidence kind:${result.kind}`)
  if (result.surface !== null && !/^[a-z][a-z0-9-]*$/.test(result.surface)) fail(`runtime surface is invalid:${result.surface}`)
  if (result.model !== null) validateExplicitModel(result.model)
  if (result.execute) {
    const commonMissing = [
      ['--allow-model', result.allowModel],
      ['--provider', result.provider],
      ['--surface', result.surface],
    ].filter(([, value]) => !value).map(([name]) => name)
    if (commonMissing.length) {
      fail(`model execution requires explicit ${commonMissing.join(',')}`)
    }
    if (!result.managedBroker && !result.externalEntitlement) {
      fail('model execution requires one explicit --managed-broker or --external-entitlement deployment wrapper')
    }
    if (result.managedBroker) {
      const missing = [
        ['--model', result.model],
        ['--kind', result.kind],
      ].filter(([, value]) => !value).map(([name]) => name)
      if (missing.length) {
        fail(`managed model execution requires explicit ${missing.join(',')}`)
      }
    } else if (result.model !== null || result.kind !== null) {
      fail('external entitlement execution derives the exact model and complete task graph only from the frozen capability selection')
    }
  }
  return result
}

// Retained as a pure utility for tests and future managed launchers.  The
// production runner never forwards the caller's environment to a provider.
export function sanitizeModelBaseEnvironment(hostEnvironment, { privateHome } = {}) {
  if (!hostEnvironment || typeof hostEnvironment !== 'object' || typeof privateHome !== 'string' || !privateHome) {
    fail('model environment sanitization inputs are invalid')
  }
  const clean = {
    PATH: hostEnvironment.PATH ?? '/usr/bin:/bin',
    HOME: privateHome,
    USERPROFILE: privateHome,
    XDG_CONFIG_HOME: join(privateHome, '.config'),
    LANG: hostEnvironment.LANG ?? 'C.UTF-8',
    LC_ALL: hostEnvironment.LC_ALL ?? hostEnvironment.LANG ?? 'C.UTF-8',
  }
  if (hostEnvironment.TERM) clean.TERM = hostEnvironment.TERM
  return clean
}

function taskList(kind, planState, manifest, repoRoot) {
  if (kind === 'judgment') {
    const coverage = expandJudgmentCoverage(manifest)
    return planState.judgmentDimensions.map((dimension) => ({
      kind,
      subject: dimension.dim,
      coverage,
      claimInventory: null,
    }))
  }
  return manifest.components.map((component) => {
    const claimInventory = buildComponentClaimInventory({ repoRoot, manifest, component: component.name })
    return {
      kind,
      subject: component.name,
      coverage: expandComponentA1bCoverage(manifest, component.name),
      claimInventory,
    }
  })
}

export function* iterateCompleteModelReviewTasks({ planState, manifest, repoRoot } = {}) {
  if (!planState?.judgmentDimensions || !manifest?.components || typeof repoRoot !== 'string' || !repoRoot) {
    fail('complete model review task iterator inputs are invalid')
  }
  for (const dimension of planState.judgmentDimensions) {
    yield {
      kind: 'judgment',
      subject: dimension.dim,
      coverage: expandJudgmentCoverage(manifest),
      claimInventory: null,
      judgmentRule: {
        dim: dimension.dim,
        ruleId: `DS-DIM-${String(dimension.dim).padStart(3, '0')}`,
        mechanism: dimension.mechanism,
      },
    }
  }
  for (const component of manifest.components) {
    const claimInventory = buildComponentClaimInventory({
      repoRoot,
      manifest,
      component: component.name,
    })
    yield {
      kind: 'component-a1b',
      subject: component.name,
      coverage: expandComponentA1bCoverage(manifest, component.name),
      claimInventory,
    }
  }
}

function buildTaskShardSet({ repoRoot, manifest, manifestSha256, task, planState, brokerState }) {
  return buildContentAddressedBrokerShards({
    repoRoot,
    manifest,
    manifestSha256,
    coveragePaths: task.coverage.inventoryPaths,
    coverageInventoryDigest: task.coverage.inventoryDigest,
    taskKind: task.kind,
    subject: task.subject,
    modelEvidencePlanDigest: planState.planDigest,
    dependencySourceInventory: task.claimInventory?.dependencySourceInventory ?? null,
    claimInventory: task.claimInventory,
    planState: brokerState,
  })
}

function selectedReviewCapabilityBudget({ repoRoot, selectionReceipt }) {
  const selected = selectionReceipt?.selected
  if (selectionReceipt?.kind !== 'provider-review-capability-selection' || !selected) {
    fail('selected capability budget requires a frozen capability selection')
  }
  const ledger = JSON.parse(readFileSync(resolve(
    repoRoot,
    'infra/governance/providers/review-capability-certifications.json',
  ), 'utf8'))
  const matches = (ledger.certifications ?? []).filter(
    record => record?.id === selected.capabilityCertificationId,
  )
  if (matches.length !== 1
    || sha256(stableStringify(matches[0]))
      !== selectionReceipt.selectedCapabilityCertificationDigest
    || matches[0].evidence?.sha256 !== selected.capabilityEvidenceDigest
    || typeof matches[0].evidence?.reference !== 'string'
    || !/^infra\/governance\/evidence\/review-capability\/[a-f0-9]{64}\.json$/
      .test(matches[0].evidence.reference)) {
    fail('selected capability certification/evidence binding is stale or ambiguous')
  }
  const evidenceBytes = readFileSync(resolve(repoRoot, matches[0].evidence.reference))
  if (sha256(evidenceBytes) !== matches[0].evidence.sha256) {
    fail('selected capability evidence content address is invalid')
  }
  let evidence
  try {
    evidence = JSON.parse(evidenceBytes.toString('utf8'))
  } catch (error) {
    fail(`selected capability evidence is invalid JSON:${error.message}`)
  }
  const { evidenceDigest, ...projection } = evidence ?? {}
  if (evidence?.kind !== 'provider-neutral-review-capability-certification-evidence'
    || evidence.certificationId !== matches[0].id
    || evidence.reviewProfileId !== selected.reviewProfileId
    || evidence.providerId !== selected.providerId
    || evidence.invocationProfileId !== selected.invocationProfileId
    || evidence.modelReleaseId !== selected.modelReleaseId
    || evidence.requestModelId !== selected.requestModelId
    || evidenceDigest !== sha256(stableStringify(projection))) {
    fail('selected capability evidence is stale, substituted, or detached')
  }
  const budget = evidence.capability?.exchangeBudget
  return buildModelBrokerReviewGraphCapabilityBudget({
    capabilityCertificationId: matches[0].id,
    selectedCapabilityCertificationDigest:
      selectionReceipt.selectedCapabilityCertificationDigest,
    maxInputBytes: budget?.maxInputBytes,
    maxOutputBytes: budget?.maxOutputBytes,
    maxPayloadBytes: budget?.maxPayloadBytes,
  })
}

export function prepareProviderNeutralReviewExchange({
  repoRoot = process.cwd(),
  explicitRoot = null,
  reviewerProviderId = null,
  requestModelId = null,
} = {}) {
  const run = loadActiveDeepAuditRun({ repoRoot, explicitRoot, requireCurrent: true })
  validateDeepAuditRunProviderBindings(run.manifest, { repoRoot })
  const planState = loadModelEvidencePlan({ repoRoot })
  const brokerState = loadModelEvidenceBrokerPlan({ repoRoot })
  const taskDescriptors = []
  const carrierMetadata = []
  for (const task of iterateCompleteModelReviewTasks({
    planState,
    manifest: run.manifest,
    repoRoot,
  })) {
    const shardSet = buildTaskShardSet({
      repoRoot,
      manifest: run.manifest,
      manifestSha256: run.manifestSha256,
      task,
      planState,
      brokerState,
    })
    const descriptor = buildBrokerTaskDispatchDescriptor(shardSet, {
      planState: brokerState,
      claimInventoryDigest: task.claimInventory?.claimInventoryDigest ?? null,
      judgmentRule: task.judgmentRule ?? null,
    })
    taskDescriptors.push(descriptor)
    for (const [ordinal, shard] of shardSet.shards.entries()) {
      carrierMetadata.push(exportBrokerShardCarrierWithMetadata(shard, {
        taskKey: `${task.kind}:${String(task.subject)}`,
        ordinal,
      }).metadata)
    }
  }
  const expectedTaskKeys = [
    ...planState.judgmentDimensions.map((dimension) => `judgment:${dimension.dim}`),
    ...run.manifest.components.map((component) => `component-a1b:${component.name}`),
  ]
  const taskSet = buildBrokerTaskSet({
    scopeKind: 'registered-full-review',
    expectedTaskKeys,
    taskDescriptors,
    planState: brokerState,
  })
  validateBrokerTaskSet(taskSet, { taskDescriptors, planState: brokerState })
  const contentSet = buildBrokerGlobalContentSet({
    taskSet,
    taskDescriptors,
    carrierMetadata,
    planState: brokerState,
  })
  validateBrokerGlobalContentSet(contentSet, {
    taskSet,
    taskDescriptors,
    carrierMetadata,
    planState: brokerState,
  })
  const reviewGraph = buildBrokerNoSampleReviewGraph({
    taskSet,
    taskDescriptors,
    planState: brokerState,
  })
  validateBrokerNoSampleReviewGraph(reviewGraph, {
    taskSet,
    taskDescriptors,
    planState: brokerState,
  })

  const selectionReceipt = run.manifest.reviewSelection
  const selected = selectionReceipt?.kind === 'provider-review-capability-selection'
    ? selectionReceipt.selected
    : null
  if (selected) {
    validateReviewCapabilitySelectionReceipt(selectionReceipt)
    if (reviewerProviderId !== null && reviewerProviderId !== selected.providerId) {
      fail('caller reviewer provider assertion differs from frozen capability selection receipt')
    }
    if (requestModelId !== null && requestModelId !== selected.requestModelId) {
      fail('caller model assertion differs from frozen capability selection receipt')
    }
  } else if (selectionReceipt?.kind !== 'provider-review-capability-selection-blocked'
    || selectionReceipt?.selectionStatus !== 'REVIEW-BLOCKED') {
    fail('frozen target lacks a canonical selected-or-blocked review capability receipt')
  }
  const trust = selected
    ? loadModelBrokerExchangeTrustState({
        repoRoot,
        providerId: selected.providerId,
        invocationProfileId: selected.invocationProfileId,
        reviewSelection: selectionReceipt,
      })
    : null
  const capabilityBudget = selected
    ? selectedReviewCapabilityBudget({ repoRoot, selectionReceipt })
    : null
  const exchangeSchedule = selected
    ? prepareModelBrokerReviewGraphExchangeSchedule({
        trust,
        manifest: run.manifest,
        manifestSha256: run.manifestSha256,
        taskSet,
        taskDescriptors,
        reviewGraph,
        contentSet,
        carrierMetadata,
        authorProviderId: run.manifest.authorProvider,
        reviewerProviderId: selected.providerId,
        requestModelId: selected.requestModelId,
        capabilityBudget,
      })
    : null
  const completeReviewScheduleDigest = exchangeSchedule?.exchangeScheduleDigest
    ?? reviewGraph.reviewGraphDigest
  return {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-provider-neutral-review-preparation',
    run,
    authorProviderId: run.manifest.authorProvider,
    reviewerProviderId: selected?.providerId ?? null,
    requestModelId: selected?.requestModelId ?? null,
    reviewSelection: selectionReceipt,
    reviewSelectionStatus: selected ? 'selected' : 'REVIEW-BLOCKED',
    taskSet,
    taskDescriptors,
    carrierMetadata,
    contentSet,
    reviewGraph,
    capabilityBudget,
    exchangeSchedule,
    completeReviewScheduleDigest,
    coverageCompletenessDigest: reviewGraph.proof.coverageCompletenessDigest,
    noNetworkCapability: true,
    noCredentialCapability: true,
    noRepositoryMutationCapability: true,
  }
}

function validatePreparedReviewGraphExchange({ repoRoot, prepared }) {
  if (!prepared?.run || !prepared?.reviewGraph || !prepared?.taskSet
    || !Array.isArray(prepared.taskDescriptors) || !prepared.contentSet) {
    fail('portable review graph preparation is invalid')
  }
  if (prepared.reviewSelectionStatus !== 'selected'
    || !prepared.exchangeSchedule
    || prepared.reviewSelection?.kind !== 'provider-review-capability-selection'
    || !prepared.reviewerProviderId
    || !prepared.requestModelId) {
    fail('portable review materialization/dispatch is REVIEW-BLOCKED until a selected peer and dispatch schedule are frozen')
  }
  validateDeepAuditRunProviderBindings(prepared.run.manifest, { repoRoot })
  validateReviewCapabilitySelectionReceipt(prepared.reviewSelection)
  const selected = prepared.reviewSelection.selected
  if (prepared.reviewerProviderId !== selected.providerId
    || prepared.requestModelId !== selected.requestModelId) {
    fail('portable review preparation differs from its frozen capability selection receipt')
  }
  const brokerState = loadModelEvidenceBrokerPlan({ repoRoot })
  const trust = loadModelBrokerExchangeTrustState({
    repoRoot,
    providerId: selected.providerId,
    invocationProfileId: selected.invocationProfileId,
    reviewSelection: prepared.reviewSelection,
  })
  const capabilityBudget = selectedReviewCapabilityBudget({
    repoRoot,
    selectionReceipt: prepared.reviewSelection,
  })
  if (stableStringify(prepared.capabilityBudget)
      !== stableStringify(capabilityBudget)) {
    fail('portable review preparation capability budget is stale or substituted')
  }
  const scheduleValidation = validateModelBrokerReviewGraphExchangeSchedule(
    prepared.exchangeSchedule,
    {
      trust,
      manifest: prepared.run.manifest,
      manifestSha256: prepared.run.manifestSha256,
      taskSet: prepared.taskSet,
      taskDescriptors: prepared.taskDescriptors,
      reviewGraph: prepared.reviewGraph,
      contentSet: prepared.contentSet,
      carrierMetadata: prepared.carrierMetadata,
      authorProviderId: prepared.run.manifest.authorProvider,
      reviewerProviderId: selected.providerId,
      requestModelId: selected.requestModelId,
      capabilityBudget,
    },
  )
  return { brokerState, trust, scheduleValidation }
}

function rebuildPreparedReviewLeafCas({ repoRoot, prepared, brokerState }) {
  const planState = loadModelEvidencePlan({ repoRoot })
  const chunksById = new Map()
  const blobsByDigest = new Map()
  let carrierCursor = 0
  let taskOrdinal = 0
  for (const task of iterateCompleteModelReviewTasks({
    planState,
    manifest: prepared.run.manifest,
    repoRoot,
  })) {
    const shardSet = buildTaskShardSet({
      repoRoot,
      manifest: prepared.run.manifest,
      manifestSha256: prepared.run.manifestSha256,
      task,
      planState,
      brokerState,
    })
    const descriptor = buildBrokerTaskDispatchDescriptor(shardSet, {
      planState: brokerState,
      claimInventoryDigest: task.claimInventory?.claimInventoryDigest ?? null,
      judgmentRule: task.judgmentRule ?? null,
    })
    if (stableStringify(descriptor) !== stableStringify(prepared.taskDescriptors[taskOrdinal])) {
      fail(`portable review graph exporter task descriptor drifted:${task.kind}:${String(task.subject)}`)
    }
    for (const [shardOrdinal, shard] of shardSet.shards.entries()) {
      const bundle = exportBrokerShardCarrierWithMetadata(shard, {
        taskKey: `${task.kind}:${String(task.subject)}`,
        ordinal: shardOrdinal,
      })
      if (stableStringify(bundle.metadata)
        !== stableStringify(prepared.carrierMetadata[carrierCursor])) {
        fail(`portable review graph exporter carrier metadata drifted:${task.kind}:${String(task.subject)}:${shardOrdinal}`)
      }
      carrierCursor += 1
      for (const chunk of shard.chunks) {
        const previous = chunksById.get(chunk.chunkId)
        if (previous && stableStringify(previous) !== stableStringify(chunk)) {
          fail(`portable review graph exporter substitutes a CAS evidence leaf:${chunk.chunkId}`)
        }
        if (!previous) chunksById.set(chunk.chunkId, chunk)
      }
      for (const blob of bundle.blobs) {
        const previous = blobsByDigest.get(blob.sha256)
        if (previous && stableStringify(previous) !== stableStringify(blob)) {
          fail(`portable review graph exporter substitutes a content blob:${blob.sha256}`)
        }
        if (!previous) blobsByDigest.set(blob.sha256, blob)
      }
    }
    taskOrdinal += 1
  }
  const expectedLeafIds = prepared.reviewGraph.reviewWorkUnits
    .flatMap((unit) => unit.leafIds)
  const uniqueExpectedLeafIds = [...new Set(expectedLeafIds)].sort()
  const actualLeafIds = [...chunksById.keys()].sort()
  if (taskOrdinal !== prepared.taskDescriptors.length
    || carrierCursor !== prepared.contentSet.carrierCount
    || stableStringify(actualLeafIds) !== stableStringify(uniqueExpectedLeafIds)
    || blobsByDigest.size !== prepared.contentSet.uniqueBlobCount
    || [...blobsByDigest.values()].reduce((sum, blob) => sum + blob.bytes, 0)
      !== prepared.contentSet.uniqueBlobBytes) {
    fail('portable review graph exporter does not exactly close the frozen CAS corpus')
  }
  return { chunksById, blobsByDigest }
}

function frozenSnapshotIdentity(snapshot) {
  return {
    head: snapshot.head,
    tree: snapshot.tree,
    indexDigest: snapshot.indexDigest,
    inventoryDigest: snapshot.inventoryDigest,
    worktreeFingerprint: snapshot.worktreeFingerprint,
  }
}

function assertFrozenSnapshotUnchanged(before, after, label) {
  if (stableStringify(frozenSnapshotIdentity(before))
    !== stableStringify(frozenSnapshotIdentity(after))) {
    fail(`${label} changed the frozen repository target`)
  }
}

function canonicalArtifact(path, role, value) {
  return {
    path,
    role,
    mediaType: 'application/json',
    bytes: Buffer.from(`${stableStringify(value, 2)}\n`),
  }
}

/**
 * Persist the exact canonical portable exchange inputs below the active run's
 * Git-owned evidence root. Materialization is lazy: only a frozen selected-peer
 * exchange that is dispatch-ready may reach this archive/export surface.
 * REVIEW-BLOCKED preparations remain compact. This function does not select a
 * provider, invoke a model, or mutate the repository.
 */
export function writeProviderNeutralReviewBundle({
  repoRoot = process.cwd(),
  explicitRoot = null,
  prepared,
  baselineRun = null,
  sourceChangeSummary = null,
  focusedValidationRecords,
} = {}) {
  if (!prepared?.run?.manifest || !prepared?.reviewGraph || !prepared?.taskSet
    || !Array.isArray(prepared.taskDescriptors)
    || !Array.isArray(prepared.carrierMetadata)
    || !prepared.contentSet) {
    fail('portable review bundle preparation is invalid')
  }
  const { brokerState } = validatePreparedReviewGraphExchange({ repoRoot, prepared })
  const before = captureDeepAuditSnapshot(repoRoot)
  for (const key of ['head', 'tree', 'indexDigest', 'inventoryDigest', 'worktreeFingerprint']) {
    if (prepared.run.manifest[key] !== before[key]) {
      fail(`portable review bundle target is stale:${key}`)
    }
  }
  if (prepared.run.manifestSha256 !== sha256(readFileSync(prepared.run.manifestPath))) {
    fail('portable review bundle run manifest bytes are substituted')
  }
  const leafCas = rebuildPreparedReviewLeafCas({ repoRoot, prepared, brokerState })
  const summary = sourceChangeSummary ?? buildDeepAuditSourceChangeSummary({
    baselineRun,
    currentRun: {
      manifest: prepared.run.manifest,
      manifestSha256: prepared.run.manifestSha256,
    },
  })
  const focusedValidation = buildFocusedValidationRecordSet(focusedValidationRecords)
  const exchangeState = {
    schemaVersion: 1,
    kind: 'provider-neutral-review-exchange-state',
    selectionStatus: prepared.reviewSelectionStatus,
    authorProviderId: prepared.authorProviderId,
    reviewerProviderId: prepared.reviewerProviderId,
    requestModelId: prepared.requestModelId,
    completeReviewScheduleDigest: prepared.completeReviewScheduleDigest,
    coverageCompletenessDigest: prepared.coverageCompletenessDigest,
    exchangeSchedule: prepared.exchangeSchedule,
    noNetworkCapability: prepared.noNetworkCapability,
    noCredentialCapability: prepared.noCredentialCapability,
    noRepositoryMutationCapability: prepared.noRepositoryMutationCapability,
  }
  const artifacts = [
    {
      path: 'run/run-manifest.json',
      role: 'run-manifest',
      mediaType: 'application/json',
      bytes: readFileSync(prepared.run.manifestPath),
    },
    {
      path: 'authority/model-evidence-plan.json',
      role: 'model-evidence-plan',
      mediaType: 'application/json',
      bytes: readFileSync(resolve(repoRoot, 'infra/governance/model-evidence-plan.json')),
    },
    {
      path: 'authority/model-evidence-broker.json',
      role: 'model-evidence-broker-plan',
      mediaType: 'application/json',
      bytes: readFileSync(resolve(repoRoot, 'infra/governance/model-evidence-broker.json')),
    },
    {
      path: 'authority/model-broker-shard-result.schema.json',
      role: 'model-result-schema',
      mediaType: 'application/json',
      bytes: readFileSync(resolve(repoRoot, 'infra/governance/schemas/model-broker-shard-result.schema.json')),
    },
    canonicalArtifact('review/review-selection.json', 'review-selection', prepared.reviewSelection),
    canonicalArtifact('review/exchange-state.json', 'exchange-state', exchangeState),
    canonicalArtifact('review/exchange-schedule.json', 'exchange-schedule', prepared.exchangeSchedule),
    canonicalArtifact('review/task-set.json', 'task-set', prepared.taskSet),
    canonicalArtifact('review/task-descriptors.json', 'task-descriptors', prepared.taskDescriptors),
    canonicalArtifact('review/carrier-metadata.json', 'carrier-metadata', prepared.carrierMetadata),
    canonicalArtifact('review/content-set.json', 'content-set', prepared.contentSet),
    canonicalArtifact('review/review-graph.json', 'review-graph', prepared.reviewGraph),
    canonicalArtifact('review/coverage-proof.json', 'coverage-proof', prepared.reviewGraph.proof),
    canonicalArtifact('closure/source-change-summary.json', 'source-change-summary', summary),
    canonicalArtifact('closure/focused-validation.json', 'focused-validation', focusedValidation),
    ...[...leafCas.chunksById.entries()]
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map(([chunkId, chunk]) => canonicalArtifact(
        `cas/leaves/${chunkId}.json`,
        'cas-leaf',
        chunk,
      )),
    ...[...leafCas.blobsByDigest.entries()]
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map(([blobDigest, blob]) => {
        const bytes = Buffer.from(blob.content, 'base64')
        if (blob.encoding !== 'base64' || bytes.toString('base64') !== blob.content
          || bytes.length !== blob.bytes || sha256(bytes) !== blobDigest
          || blob.sha256 !== blobDigest) {
          fail(`portable review bundle CAS blob is invalid:${blobDigest}`)
        }
        return {
          path: `cas/blobs/${blobDigest}.bin`,
          role: 'cas-blob',
          mediaType: 'application/octet-stream',
          bytes,
        }
      }),
  ]
  const archived = writeFrozenReviewBundle({
    repoRoot,
    explicitRoot,
    identity: {
      runId: prepared.run.manifest.runId,
      manifestSha256: prepared.run.manifestSha256,
      head: prepared.run.manifest.head,
      tree: prepared.run.manifest.tree,
      indexDigest: prepared.run.manifest.indexDigest,
      worktreeFingerprint: prepared.run.manifest.worktreeFingerprint,
      inventoryDigest: prepared.run.manifest.inventoryDigest,
      rubricDigest: prepared.run.manifest.rubricDigest,
      providerIdentityDigest: prepared.run.manifest.providerIdentityDigest,
    },
    review: {
      selectionStatus: prepared.reviewSelectionStatus,
      completeReviewScheduleDigest: prepared.completeReviewScheduleDigest,
      coverageCompletenessDigest: prepared.coverageCompletenessDigest,
      taskCount: prepared.reviewGraph.taskCount,
      reviewWorkUnitCount: prepared.reviewGraph.reviewWorkUnitCount,
      synthesisUnitCount: prepared.reviewGraph.synthesisUnitCount,
      sampling: prepared.reviewGraph.proof.sampling,
    },
    artifacts,
  })
  const after = captureDeepAuditSnapshot(repoRoot)
  assertFrozenSnapshotUnchanged(before, after, 'portable review bundle publication')
  return {
    ...archived,
    frozenIdentityBefore: frozenSnapshotIdentity(before),
    frozenIdentityAfter: frozenSnapshotIdentity(after),
  }
}

export function captureProviderNeutralReviewWorktreeIdentity({
  repoRoot = process.cwd(),
} = {}) {
  const observed = captureGitVisibleWorktree(repoRoot)
  return {
    schemaVersion: observed.schemaVersion,
    kind: observed.kind,
    indexSha256: observed.indexSha256,
    entryCount: observed.entries.length,
    digest: observed.digest,
  }
}

export function archiveProviderNeutralReviewAllHarnessReceipt({
  repoRoot = process.cwd(),
  explicitRoot = null,
  runId,
  candidateDigest,
  preWorktree,
  postWorktree,
} = {}) {
  return archiveAllHarnessPassReceipt({
    repoRoot,
    explicitRoot,
    runId,
    candidateDigest,
    preWorktree,
    postWorktree,
  })
}

function portableReviewBatchCarrier({ prepared, request, leafCas }) {
  const workUnits = request.memberUnitOrdinals.map((unitOrdinal, memberOrdinal) => {
    const unit = prepared.reviewGraph.reviewWorkUnits[unitOrdinal]
    if (!unit
      || unit.workUnitId !== request.memberUnitIds[memberOrdinal]
      || unit.workUnitDigest !== request.memberUnitDigests[memberOrdinal]) {
      fail('portable review batch carrier request/unit binding is invalid')
    }
    return unit
  })
  const chunks = request.leafIds.map((leafId) => {
    const chunk = leafCas.chunksById.get(leafId)
    if (!chunk) fail(`portable review batch carrier is missing a CAS leaf:${leafId}`)
    return chunk
  })
  const bundle = exportBrokerReviewGraphBatchCarrier({
    graph: prepared.reviewGraph,
    contentSet: prepared.contentSet,
    requestDigest: request.requestDigest,
    requestBatch: request,
    workUnits,
    chunks,
    expectedBinding: request.carrier.evidenceCarrierBinding,
  })
  return { ...bundle, leaves: bundle.carrier.leafReferences }
}

function prerequisiteResultIds(reviewGraph, reference) {
  if (reference.requestKind === 'review-work-batch') return []
  const unit = reviewGraph.synthesisUnits[reference.unitOrdinal]
  if (!unit || unit.synthesisUnitId !== reference.unitId) {
    fail(`portable review graph synthesis reference is invalid:${reference.unitId}`)
  }
  if (unit.inputKind === 'synthesis-units') return [...unit.inputIds]
  const workByCell = new Map()
  for (const work of reviewGraph.reviewWorkUnits) {
    for (const cellId of work.coverageCellIds) {
      if (workByCell.has(cellId)) fail(`portable review graph cell has multiple work owners:${cellId}`)
      workByCell.set(cellId, work.workUnitId)
    }
  }
  return [...new Set(unit.inputIds.map((cellId) => {
    const workUnitId = workByCell.get(cellId)
    if (!workUnitId) fail(`portable review graph synthesis input lacks a work owner:${cellId}`)
    return workUnitId
  }))]
}

export function prepareProviderNeutralReviewExchangeRequest({
  repoRoot = process.cwd(),
  prepared,
  requestOrdinal,
  prerequisiteResults = [],
  leafCas = null,
} = {}) {
  const { brokerState, trust, scheduleValidation } =
    validatePreparedReviewGraphExchange({ repoRoot, prepared })
  const built = prepareModelBrokerReviewGraphExchangeRequest({
    trust,
    scheduleValidation,
    exchangeSchedule: prepared.exchangeSchedule,
    taskSet: prepared.taskSet,
    reviewGraph: prepared.reviewGraph,
    contentSet: prepared.contentSet,
    requestOrdinal,
    prerequisiteResults,
  })
  const evidence = built.envelope.requestKind === 'review-work-batch'
    ? portableReviewBatchCarrier({
        prepared,
        request: built.envelope,
        leafCas: leafCas ?? rebuildPreparedReviewLeafCas({ repoRoot, prepared, brokerState }),
      })
    : null
  if (evidence) {
    const workUnits = built.envelope.memberUnitOrdinals.map(
      ordinal => prepared.reviewGraph.reviewWorkUnits[ordinal],
    )
    materializeBrokerReviewGraphBatchCarrier({
      graph: prepared.reviewGraph,
      contentSet: prepared.contentSet,
      requestDigest: built.envelope.requestDigest,
      requestBatch: built.envelope,
      workUnits,
      carrier: evidence.carrier,
      blobs: evidence.blobs,
      expectedBinding: built.envelope.carrier.evidenceCarrierBinding,
    })
  }
  const resultSchema = {
    ...trust.resultSchema,
    oneOf: [{ $ref: '#/$defs/reviewGraphBatch' }],
  }
  const portablePayloadBudget = validateBrokerReviewGraphBatchPortablePayloadBudget({
    requestBatch: built.envelope,
    requestEnvelopeBytes: built.bytes,
    resultSchema,
    evidenceCarrier: evidence?.carrier,
    evidenceBlobs: evidence?.blobs,
    capabilityBudget: prepared.capabilityBudget,
  })
  return {
    request: built.envelope,
    requestBytes: built.bytes,
    resultSchema,
    resultSchemaSha256: sha256(stableStringify(resultSchema)),
    evidenceCarrier: evidence?.carrier ?? null,
    evidenceLeaves: evidence?.leaves ?? [],
    blobs: evidence?.blobs ?? [],
    prerequisiteResultPayloads: built.prerequisiteResultPayloads,
    portablePayloadBudget,
  }
}

export function materializeProviderNeutralReviewWorkRequest({
  prepared,
  portableRequest,
} = {}) {
  const request = portableRequest?.request
  if (request?.requestKind !== 'review-work-batch') {
    fail('portable review work materializer requires a review-work batch request')
  }
  const workUnits = request.memberUnitOrdinals.map(
    ordinal => prepared.reviewGraph.reviewWorkUnits[ordinal],
  )
  return materializeBrokerReviewGraphBatchCarrier({
    graph: prepared?.reviewGraph,
    contentSet: prepared?.contentSet,
    requestDigest: request.requestDigest,
    requestBatch: request,
    workUnits,
    carrier: portableRequest.evidenceCarrier,
    blobs: portableRequest.blobs,
    expectedBinding: request.carrier.evidenceCarrierBinding,
  })
}

export function* iteratePreparedModelReviewRequests({
  repoRoot = process.cwd(),
  prepared,
  validatedResults = [],
} = {}) {
  const { brokerState } = validatePreparedReviewGraphExchange({ repoRoot, prepared })
  const completedBatches = new Set()
  for (const record of validatedResults) {
    if (!record?.requestBatchId || completedBatches.has(record.requestBatchId)) {
      fail('portable review graph validated results are invalid or duplicate')
    }
    completedBatches.add(record.requestBatchId)
  }
  const leafCas = rebuildPreparedReviewLeafCas({ repoRoot, prepared, brokerState })
  for (const reference of prepared.exchangeSchedule.requests) {
    if (completedBatches.has(reference.requestBatchId)) continue
    const prerequisiteIds = prerequisiteResultIds(prepared.reviewGraph, reference)
    if (prerequisiteIds.length !== 0) {
      fail('portable review graph provider batches cannot have prerequisites')
    }
    yield {
      requestOrdinal: reference.requestOrdinal,
      ...prepareProviderNeutralReviewExchangeRequest({
        repoRoot,
        prepared,
        requestOrdinal: reference.requestOrdinal,
        prerequisiteResults: [],
        leafCas,
      }),
    }
  }
}

export function ingestProviderNeutralReviewExchangeResult({
  repoRoot = process.cwd(),
  prepared,
  requestOrdinal,
  prerequisiteResults = [],
  response = null,
  resultCarrier = null,
} = {}) {
  const { trust, scheduleValidation } =
    validatePreparedReviewGraphExchange({ repoRoot, prepared })
  const portableRequest = prepareProviderNeutralReviewExchangeRequest({
    repoRoot,
    prepared,
    requestOrdinal,
    prerequisiteResults,
  })
  const carrier = resultCarrier ?? buildModelBrokerReviewGraphResultCarrier({
    scheduleValidation,
    exchangeSchedule: prepared.exchangeSchedule,
    requestEnvelope: portableRequest.request,
    response,
  })
  return ingestModelBrokerReviewGraphExchangeResult({
    trust,
    scheduleValidation,
    exchangeSchedule: prepared.exchangeSchedule,
    reviewGraph: prepared.reviewGraph,
    requestEnvelope: portableRequest.request,
    resultCarrier: carrier,
    prerequisiteResults,
  })
}

export function ingestProviderNeutralReviewExchange({
  repoRoot = process.cwd(),
  prepared,
  resultCarriers,
} = {}) {
  if (!Array.isArray(resultCarriers)) {
    fail('portable review graph importer requires the exact ordered result-carrier set')
  }
  const { trust, scheduleValidation } =
    validatePreparedReviewGraphExchange({ repoRoot, prepared })
  return ingestModelBrokerReviewGraphExchange({
    trust,
    scheduleValidation,
    exchangeSchedule: prepared.exchangeSchedule,
    taskSet: prepared.taskSet,
    taskDescriptors: prepared.taskDescriptors,
    reviewGraph: prepared.reviewGraph,
    contentSet: prepared.contentSet,
    resultCarriers,
  })
}

export function sanitizeExternalEntitlementEnvironment(hostEnvironment, {
  accountHome,
  accountUser,
} = {}) {
  if (!hostEnvironment || typeof hostEnvironment !== 'object'
    || typeof accountHome !== 'string' || !accountHome.startsWith('/')
    || typeof accountUser !== 'string' || !accountUser.trim()
    || (hostEnvironment.HOME !== undefined && hostEnvironment.HOME !== accountHome)
    || (hostEnvironment.USER !== undefined && hostEnvironment.USER !== accountUser)) {
    fail('external entitlement environment/account identity is invalid')
  }
  const clean = {
    PATH: hostEnvironment.PATH ?? '/usr/bin:/bin',
    HOME: accountHome,
    USER: accountUser,
    LOGNAME: accountUser,
    LANG: hostEnvironment.LANG ?? 'C.UTF-8',
    LC_ALL: hostEnvironment.LC_ALL ?? hostEnvironment.LANG ?? 'C.UTF-8',
  }
  for (const key of ['SHELL', 'TMPDIR']) {
    if (typeof hostEnvironment[key] === 'string' && hostEnvironment[key]) {
      clean[key] = hostEnvironment[key]
    }
  }
  return clean
}

export function prepareProviderNeutralExternalEntitlementInvocation({
  repoRoot = process.cwd(),
  prepared,
  requestOrdinal,
  prerequisiteResults = [],
  authReadback,
  runtimeTarget,
} = {}) {
  if (prepared?.reviewSelection?.kind !== 'provider-review-capability-selection'
    || prepared.reviewSelection.selected?.routeClass !== 'subscription-entitlement') {
    fail('external entitlement invocation requires a frozen subscription capability selection')
  }
  const profileState = loadModelInvocationProfiles({ repoRoot })
  const invocationProfileId = prepared.reviewSelection.selected.invocationProfileId
  const profile = profileState.externalEntitlementProfiles[invocationProfileId]
  if (!profile) {
    fail(`external entitlement invocation profile is unavailable:${invocationProfileId}`)
  }
  const portableRequest = prepareProviderNeutralReviewExchangeRequest({
    repoRoot,
    prepared,
    requestOrdinal,
    prerequisiteResults,
  })
  return {
    portableRequest,
    invocation: buildExternalEntitlementReviewInvocation({
      invocationProfileId,
      profile,
      selectionReceipt: prepared.reviewSelection,
      portableRequest,
      resultSchema: portableRequest.resultSchema,
      authReadback,
      runtimeTarget,
      repoRoot,
      forbiddenArguments: profileState.registry.forbiddenArguments,
    }),
  }
}

export function normalizeProviderNeutralExternalEntitlementResponse({
  repoRoot = process.cwd(),
  prepared,
  invocation,
  processResult,
} = {}) {
  if (prepared?.reviewSelection?.kind !== 'provider-review-capability-selection') {
    fail('external entitlement response requires a frozen capability selection')
  }
  const profileState = loadModelInvocationProfiles({ repoRoot })
  const invocationProfileId = prepared.reviewSelection.selected.invocationProfileId
  const profile = profileState.externalEntitlementProfiles[invocationProfileId]
  if (!profile) {
    fail(`external entitlement invocation profile is unavailable:${invocationProfileId}`)
  }
  return normalizeExternalEntitlementReviewResponse({
    profile,
    invocationPlan: invocation,
    processResult,
    forbiddenArguments: profileState.registry.forbiddenArguments,
  })
}

export function dispatchProviderNeutralExternalEntitlementRequest({
  repoRoot = process.cwd(),
  prepared,
  requestOrdinal,
  prerequisiteResults = [],
  authReadback,
  runtimeTarget,
  environment,
  workingDirectory,
} = {}) {
  const planned = prepareProviderNeutralExternalEntitlementInvocation({
    repoRoot,
    prepared,
    requestOrdinal,
    prerequisiteResults,
    authReadback,
    runtimeTarget,
  })
  const profileState = loadModelInvocationProfiles({ repoRoot })
  const invocationProfileId = prepared.reviewSelection.selected.invocationProfileId
  const profile = profileState.externalEntitlementProfiles[invocationProfileId]
  const response = executeExternalEntitlementReviewInvocation({
    profile,
    invocationPlan: planned.invocation,
    environment,
    workingDirectory,
    repositoryRoot: repoRoot,
    forbiddenArguments: profileState.registry.forbiddenArguments,
  })
  const { scheduleValidation } = validatePreparedReviewGraphExchange({
    repoRoot,
    prepared,
  })
  const carrier = buildModelBrokerReviewGraphResultCarrier({
    scheduleValidation,
    exchangeSchedule: prepared.exchangeSchedule,
    requestEnvelope: planned.portableRequest.request,
    response,
  })
  const record = ingestProviderNeutralReviewExchangeResult({
    repoRoot,
    prepared,
    requestOrdinal,
    prerequisiteResults,
    resultCarrier: carrier,
  })
  return { response, carrier, record }
}

function decodeCanonicalProviderResponse(carrier) {
  const response = carrier?.response
  if (response?.encoding !== 'canonical-json'
    || typeof response.canonicalJson !== 'string'
    || response.bytes !== Buffer.byteLength(response.canonicalJson)
    || response.sha256 !== sha256(response.canonicalJson)) {
    fail(`external entitlement result carrier response is invalid:${String(carrier?.requestOrdinal)}`)
  }
  let decoded
  try { decoded = JSON.parse(response.canonicalJson) } catch (error) {
    fail(`external entitlement result carrier response is invalid JSON:${error.message}`)
  }
  if (stableStringify(decoded) !== response.canonicalJson) {
    fail('external entitlement result carrier response is not canonical JSON')
  }
  return decoded
}

export function closeGenuineProviderNeutralReview({
  repoRoot = process.cwd(),
  prepared,
  resultCarriers,
  runtimeTarget,
  runtimeEvidenceBytes,
  capabilityEvidenceBytes,
  now = new Date(),
} = {}) {
  validateDeepAuditRunProviderBindings(prepared?.run?.manifest, { repoRoot })
  const structuralCompletion = ingestProviderNeutralReviewExchange({
    repoRoot,
    prepared,
    resultCarriers,
  })
  const profileState = loadModelInvocationProfiles({ repoRoot })
  const registry = JSON.parse(readFileSync(resolve(
    repoRoot,
    'packages/governance/canonical/providers.json',
  ), 'utf8'))
  const capabilityRegistry = JSON.parse(readFileSync(resolve(
    repoRoot,
    'infra/governance/providers/review-capability-registry.json',
  ), 'utf8'))
  const capabilityCertificationLedger = JSON.parse(readFileSync(resolve(
    repoRoot,
    'infra/governance/providers/review-capability-certifications.json',
  ), 'utf8'))
  const runtimeCertificationLedger = JSON.parse(readFileSync(resolve(
    repoRoot,
    'infra/governance/providers/certifications.json',
  ), 'utf8'))
  const selected = prepared.reviewSelection?.selected
  const invocationProfile = profileState.externalEntitlementProfiles[
    selected?.invocationProfileId
  ]
  if (!selected || !invocationProfile) {
    fail('genuine external entitlement closure lacks its selected invocation profile')
  }
  const selectedRuntimeRecord = runtimeCertificationLedger.certifications.find(
    (record) => record.id === [
      prepared.run.manifest.providers.self,
      prepared.run.manifest.providers.peer,
    ].find((provider) => provider?.id === selected.providerId)
      ?.runtimeCertification?.certificationId,
  )
  const selectedRuntimeTarget = selectedRuntimeRecord?.platformMatrix?.find(
    (target) => target.id === runtimeTarget?.id,
  )
  const certifiedRuntimeEvidence =
    selectedRuntimeTarget?.runtimeEvidence ?? selectedRuntimeRecord?.runtimeEvidence
  if (!/^[a-f0-9]{40}$/.test(certifiedRuntimeEvidence?.gitTree ?? '')) {
    fail('genuine external entitlement closure lacks its exact certified runtime subject tree')
  }
  const certifiedRuntimeSubjectTree = certifiedRuntimeEvidence.gitTree
  const entitlementAvailability = [verifyEntitlementAvailabilityEvidence({
    invocationRegistry: profileState.registry,
    invocationProfileId: selected.invocationProfileId,
    certificationLedger: runtimeCertificationLedger,
    target: runtimeTarget,
    expectedGitTree: certifiedRuntimeSubjectTree,
    runtimeEvidenceBytes,
    now,
  })]
  let capabilityEvidence
  try {
    capabilityEvidence = JSON.parse(
      Buffer.from(capabilityEvidenceBytes).toString('utf8'),
    )
  } catch {
    fail('genuine external entitlement closure capability evidence is invalid JSON')
  }
  const runtimeBinding = capabilityEvidence?.runtimeBinding
  const executionEvidence = resultCarriers.map((carrier, requestOrdinal) => {
    const providerResponse = decodeCanonicalProviderResponse(carrier)
    const selectedResult = selectBrokerResultWithSelector({
      providerId: selected.providerId,
      modelIdentity: invocationProfile.modelIdentity,
      responseSelector: invocationProfile.responseSelector,
      requestedModel: selected.requestModelId,
      response: providerResponse,
    })
    const executionBinding = providerResponse.executionBinding
    if (!executionBinding
      || executionBinding.schemaVersion !== 1
      || executionBinding.kind
        !== 'provider-neutral-external-entitlement-execution-binding') {
      fail(`genuine external entitlement response lacks its exact execution binding:${requestOrdinal}`)
    }
    return {
      requestOrdinal,
      requestDigest: carrier.requestDigest,
      carrierDigest: carrier.carrierDigest,
      providerRunId: selectedResult.providerRunId,
      responseSha256: selectedResult.responseSha256,
      observedProviderId: selected.providerId,
      observedReviewProfileId: selected.reviewProfileId,
      observedInvocationProfileId: selected.invocationProfileId,
      observedModelReleaseId: selected.modelReleaseId,
      observedResponseModelId: selectedResult.observedResponseModelId,
      runtimeCertificationId: runtimeBinding?.certificationId,
      runtimeCertificationDigest: runtimeBinding?.certificationDigest,
      runtimeTargetDigest: runtimeBinding?.targetDigest,
      runtimeExecutableAuthorityDigest:
        executionBinding.runtimeExecutableAuthorityDigest,
      runtimeExecutableBindingDigest:
        executionBinding.runtimeExecutableBindingDigest,
      executionBindingDigest: executionBinding.executionBindingDigest,
      authReadbackDigest: executionBinding.authReadbackDigest,
      versionReadbackDigest: executionBinding.versionReadbackDigest,
      isolationPathClass: executionBinding.isolationPathClass,
      repositoryMounted: executionBinding.repositoryMounted,
    }
  })
  const receipt = buildGenuineCrossProviderReviewReceipt({
    structuralCompletion,
    exchangeSchedule: prepared.exchangeSchedule,
    executionEvidence,
    selectionReceipt: prepared.reviewSelection,
    registry,
    capabilityRegistry,
    capabilityCertificationLedger,
    invocationRegistry: profileState.registry,
    modelReleaseRegistry: profileState.releaseState.registry,
    entitlementAvailability,
    capabilityEvidenceBytes,
    runtimeCertificationLedger,
    runtimeTarget,
    expectedGitTree: certifiedRuntimeSubjectTree,
    now,
  })
  loadModelEvidenceBrokerPlan({ repoRoot })
    .validateGenuineCrossProviderReviewReceipt(receipt)
  return {
    structuralCompletion,
    executionEvidence,
    receipt,
  }
}

function genuineReviewArchiveArtifact(path, role, payload) {
  const canonicalJson = stableStringify(payload)
  return {
    path,
    role,
    mediaType: 'application/json',
    bytes: Buffer.byteLength(canonicalJson),
    sha256: sha256(canonicalJson),
    payload: structuredClone(payload),
  }
}

/**
 * Return the complete content-addressed post-review evidence set to the
 * existing deep-audit archive caller. This is an archive handoff for the
 * canonical exchange protocol, not a second broker, protocol, or receipt
 * format. The caller can persist every payload byte by serializing `payload`
 * with stableStringify and must bind the returned evidenceSetDigest.
 */
export function buildGenuineProviderNeutralReviewArchiveHandoff({
  prepared,
  resultCarriers,
  structuralCompletion,
  executionEvidence,
  receipt,
} = {}) {
  const manifest = prepared?.run?.manifest
  const schedule = prepared?.exchangeSchedule
  if (!manifest
    || !schedule
    || !Array.isArray(schedule.requests)
    || !Array.isArray(resultCarriers)
    || !Array.isArray(executionEvidence)
    || resultCarriers.length !== schedule.requestCount
    || executionEvidence.length !== schedule.requestCount
    || schedule.requests.length !== schedule.requestCount) {
    fail('genuine review archive handoff is partial')
  }
  validateGenuineCrossProviderReviewReceipt(receipt)
  if (receipt.exchangeScheduleDigest !== schedule.exchangeScheduleDigest
    || receipt.structuralCompletionDigest !== structuralCompletion?.completionDigest
    || receipt.executionEvidenceDigest !== sha256(stableStringify(executionEvidence))
    || receipt.requestCount !== schedule.requestCount
    || receipt.genuineCrossProviderReview !== true
    || structuralCompletion?.responseDigestSetDigest
      !== receipt.responseDigestSetDigest) {
    fail('genuine review archive handoff receipt/completion binding mismatches')
  }
  const carrierArtifacts = resultCarriers.map((carrier, ordinal) => {
    const planned = schedule.requests[ordinal]
    const { carrierDigest, ...projection } = carrier ?? {}
    if (!planned
      || carrier?.requestOrdinal !== ordinal
      || carrier.requestDigest !== planned.requestDigest
      || !/^[a-f0-9]{64}$/.test(carrierDigest ?? '')
      || carrierDigest !== sha256(stableStringify(projection))
      || executionEvidence[ordinal]?.requestOrdinal !== ordinal
      || executionEvidence[ordinal]?.requestDigest !== carrier.requestDigest
      || executionEvidence[ordinal]?.carrierDigest !== carrierDigest) {
      fail(`genuine review archive handoff carrier is missing, reordered, or substituted:${ordinal}`)
    }
    return genuineReviewArchiveArtifact(
      `results/${String(ordinal).padStart(6, '0')}-${carrierDigest}.json`,
      'provider-result-carrier',
      carrier,
    )
  })
  const artifacts = [
    genuineReviewArchiveArtifact(
      'completion/structural-completion.json',
      'structural-completion',
      structuralCompletion,
    ),
    genuineReviewArchiveArtifact(
      'execution/execution-evidence.json',
      'provider-execution-evidence',
      executionEvidence,
    ),
    genuineReviewArchiveArtifact(
      'receipt/genuine-cross-provider-review-receipt.json',
      'genuine-cross-provider-review-receipt',
      receipt,
    ),
    ...carrierArtifacts,
  ]
  const artifactRecords = artifacts.map(({
    payload: ignoredPayload,
    ...record
  }) => record)
  const artifactSetDigest = sha256(stableStringify(artifactRecords))
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'provider-neutral-genuine-review-archive-handoff',
    protocol: schedule.protocol,
    runIdentity: {
      runId: manifest.runId,
      manifestSha256: prepared.run.manifestSha256,
      head: manifest.head,
      tree: manifest.tree,
      indexDigest: manifest.indexDigest,
      worktreeFingerprint: manifest.worktreeFingerprint,
      inventoryDigest: manifest.inventoryDigest,
      rubricDigest: manifest.rubricDigest,
      providerIdentityDigest: manifest.providerIdentityDigest,
    },
    reviewerIdentity: {
      authorProviderId: receipt.authorProviderId,
      reviewerProviderId: receipt.reviewerProviderId,
      reviewProfileId: receipt.reviewProfileId,
      invocationProfileId: receipt.invocationProfileId,
      modelReleaseId: receipt.modelReleaseId,
      requestModelId: receipt.requestModelId,
      runtimeCertificationId: receipt.runtimeCertificationId,
      runtimeCertificationDigest: receipt.runtimeCertificationDigest,
      runtimeTargetDigest: receipt.runtimeTargetDigest,
    },
    exchangeScheduleDigest: schedule.exchangeScheduleDigest,
    selectionDigest: receipt.selectionDigest,
    structuralCompletionDigest: receipt.structuralCompletionDigest,
    executionEvidenceDigest: receipt.executionEvidenceDigest,
    receiptDigest: receipt.receiptDigest,
    requestCount: schedule.requestCount,
    artifactCount: artifactRecords.length,
    artifactSetDigest,
    completeArchiveHandoff: true,
  }
  return {
    ...projection,
    artifacts,
    evidenceSetDigest: sha256(stableStringify(projection)),
  }
}

function modelPlanView({ args, planState, profileState, schemaState, brokerState, managedState, activeRun = null, repoRoot }) {
  const providerIds = Object.keys(profileState.profiles).sort()
  if (args.provider && !providerIds.includes(args.provider)) fail(`provider has no broker-content-only invocation profile:${args.provider}`)
  const activationLifecycle = managedCiModelBrokerActivationLifecycleStatus(managedState)
  const selectedKinds = args.kind ? [args.kind] : [...KINDS]
  const tasks = activeRun
    ? Object.fromEntries(selectedKinds.map((kind) => [kind, taskList(kind, planState, activeRun.manifest, repoRoot).map((task) => task.subject)]))
    : {
        judgment: selectedKinds.includes('judgment') ? planState.judgmentDimensions.map((item) => item.dim) : [],
        componentA1b: selectedKinds.includes('component-a1b') ? 'active-run-manifest-components' : [],
      }
  return {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-plan-view',
    mode: args.check ? 'check' : 'plan',
    planDigest: planState.planDigest,
    invocationRegistryDigest: profileState.profileDigest,
    brokerProfileDigest: profileState.brokerProfileDigest,
    brokerPlanDigest: brokerState.planDigest,
    brokerExecutionMode: brokerState.plan.executionMode,
    brokerActivationContract: brokerState.plan.activation.contract,
    brokerCanonicalDesiredState: brokerState.plan.activation.canonicalDesiredState,
    brokerMaterializedState: activationLifecycle.materializedState,
    brokerExternalReadbackState: activationLifecycle.externalReadbackState,
    managedExecutionActive: activationLifecycle.managedExecutionActive,
    managedExecutionBlockers: managedState.blockers,
    resultSchemaSha256: schemaState.sha256,
    providers: args.provider ? [args.provider] : providerIds,
    surface: args.surface,
    model: args.model,
    tasks,
    activeRun: activeRun ? {
      runId: activeRun.manifest.runId,
      manifestSha256: activeRun.manifestSha256,
      providerCertifications: Object.fromEntries([
        activeRun.manifest.providers.self,
        activeRun.manifest.providers.peer,
      ].filter(Boolean).map((provider) => [provider.id, provider.runtimeCertification ? {
        certificationId: provider.runtimeCertification.certificationId,
        certificationStatus: provider.runtimeCertification.certificationStatus,
        runtimeProviderId: provider.runtimeCertification.runtimeProviderId,
        runtimeKind: provider.runtimeCertification.runtimeKind,
        surface: provider.runtimeCertification.surface,
        runtimeProfileId: provider.runtimeProfileId,
        repositoryRole: provider.runtimeCertification.repositoryRole,
        targetId: provider.runtimeCertification.targetId,
        expiresAt: provider.runtimeCertification.expiresAt,
      } : {
        certificationStatus: 'not-certified',
        runtimeProviderId: provider.id,
        runtimeKind: provider.runtimeIdentity,
        surface: provider.runtimeSurface,
        runtimeProfileId: provider.runtimeProfileId,
      }])),
    } : null,
    executionAuthorized: false,
    legacyRepositoryReadProfilesPromotionEligible: false,
  }
}

export function assertBrokerActivation({ args, profileState, brokerState, managedState }) {
  const profile = profileState.profiles[args.provider]
  if (!profile || profile.mode !== 'broker-content-only'
    || profile.transportKind !== 'provider-https-json-api'
    || profile.repositoryAccess !== 'forbidden'
    || profile.toolAccess !== 'none-tools-field-omitted'
    || profile.workingDirectory !== 'not-applicable-repository-unmounted') {
    fail(`provider is not bound to a repository-unmounted content-only broker profile:${args.provider}`)
  }
  if (!managedState.active) {
    fail('content-addressed model broker activation is blocked; no model was invoked')
  }
  return managedCiModelBrokerActivationConvergence(
    managedState,
    brokerState.plan.activation,
    {
      evidenceKind: args.kind === 'judgment' ? 'deep-audit-judgment' : 'deep-audit-component-a1b',
      selectedProvider: args.provider,
    },
  )
}

function contentAddressedEvidenceBytes(repoRoot, reference, sha256Digest, label) {
  if (typeof reference !== 'string'
    || isAbsolute(reference)
    || reference.includes('\\')
    || reference.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    || !reference.startsWith('infra/governance/evidence/')
    || !reference.endsWith(`/${sha256Digest}.json`)
    || !/^[a-f0-9]{64}$/.test(sha256Digest ?? '')) {
    fail(`${label} does not name one content-addressed JSON artifact`)
  }
  const repository = realpathSync(repoRoot)
  const absolute = resolve(repository, reference)
  const repositoryRelative = relative(repository, absolute)
  if (!repositoryRelative
    || repositoryRelative === '..'
    || repositoryRelative.startsWith(`..${sep}`)
    || isAbsolute(repositoryRelative)) {
    fail(`${label} escapes the repository evidence root`)
  }
  const info = lstatSync(absolute, { bigint: true })
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n
    || realpathSync(absolute) !== absolute) {
    fail(`${label} is not one canonical no-link repository evidence file`)
  }
  const bytes = readFileSync(absolute)
  if (sha256(bytes) !== sha256Digest) {
    fail(`${label} content digest mismatches`)
  }
  return bytes
}

async function executeExternalEntitlementDeepAudit({ repoRoot, args }) {
  if (!args.execute || !args.allowModel || !args.externalEntitlement
    || args.managedBroker || !args.provider || !args.surface
    || args.model !== null || args.kind !== null) {
    fail('external entitlement execution requires its complete explicit deployment authorization tuple')
  }
  const prepared = prepareProviderNeutralReviewExchange({
    repoRoot,
    explicitRoot: args.explicitRoot,
    reviewerProviderId: args.provider,
  })
  const selected = prepared.reviewSelection?.selected
  if (!selected || selected.routeClass !== 'subscription-entitlement'
    || selected.providerId !== args.provider) {
    fail('external entitlement execution is detached from the frozen subscription selection')
  }
  const provider = [
    prepared.run.manifest.providers.self,
    prepared.run.manifest.providers.peer,
  ].find((candidate) => candidate?.id === selected.providerId)
  if (!provider || provider.runtimeSurface !== args.surface
    || provider.runtimeCertification === null) {
    fail('external entitlement execution lacks the exact frozen reviewer runtime/surface certification')
  }
  const runtimeCertificationLedger = JSON.parse(readFileSync(resolve(
    repoRoot,
    'infra/governance/providers/certifications.json',
  ), 'utf8'))
  const runtimeRecord = runtimeCertificationLedger.certifications.find(
    (record) => record.id === provider.runtimeCertification.certificationId,
  )
  const targetRecord = runtimeRecord?.platformMatrix?.find(
    (target) => target.id === provider.runtimeCertification.targetId,
  )
  const runtimeEvidenceBinding =
    targetRecord?.runtimeEvidence ?? runtimeRecord?.runtimeEvidence
  if (!targetRecord || !runtimeEvidenceBinding) {
    fail('external entitlement execution runtime target/evidence binding is absent')
  }
  const runtimeTarget = Object.fromEntries([
    'id',
    'operatingSystem',
    'platform',
    'arch',
    'executionEnvironment',
    'distributionVersion',
    'pathClass',
  ].map((field) => [field, targetRecord[field]]))
  const runtimeEvidenceBytes = contentAddressedEvidenceBytes(
    repoRoot,
    runtimeEvidenceBinding.reference,
    runtimeEvidenceBinding.artifactSha256,
    'external entitlement runtime evidence',
  )
  const capabilityLedger = JSON.parse(readFileSync(resolve(
    repoRoot,
    'infra/governance/providers/review-capability-certifications.json',
  ), 'utf8'))
  const capabilityRecord = capabilityLedger.certifications.find(
    (record) => record.id === selected.capabilityCertificationId,
  )
  if (!capabilityRecord
    || capabilityRecord.evidence.sha256
      !== prepared.reviewSelection.selected.capabilityEvidenceDigest) {
    fail('external entitlement execution capability certification/evidence binding is absent')
  }
  const capabilityEvidenceBytes = contentAddressedEvidenceBytes(
    repoRoot,
    capabilityRecord.evidence.reference,
    capabilityRecord.evidence.sha256,
    'external entitlement capability evidence',
  )
  const account = userInfo()
  const environment = sanitizeExternalEntitlementEnvironment(process.env, {
    accountHome: account.homedir,
    accountUser: account.username,
  })
  const profileState = loadModelInvocationProfiles({ repoRoot })
  const profile = profileState.externalEntitlementProfiles[
    selected.invocationProfileId
  ]
  if (!profile) {
    fail('external entitlement execution profile is absent')
  }
  const preflightDirectory = mkdtempSync(join(
    tmpdir(),
    'provider-review-entitlement-preflight-',
  ))
  chmodSync(preflightDirectory, 0o700)
  let preflight
  try {
    preflight = readExternalEntitlementRuntimePreflight({
      profile,
      repoRoot,
      environment,
      workingDirectory: preflightDirectory,
      runtimeTarget,
      forbiddenArguments: profileState.registry.forbiddenArguments,
    })
  } finally {
    rmSync(preflightDirectory, { recursive: true, force: true })
  }
  const resultCarriers = []
  for (const request of iteratePreparedModelReviewRequests({
    repoRoot,
    prepared,
  })) {
    const workingDirectory = mkdtempSync(join(
      tmpdir(),
      `provider-review-entitlement-${request.requestOrdinal}-`,
    ))
    chmodSync(workingDirectory, 0o700)
    try {
      const dispatched =
        dispatchProviderNeutralExternalEntitlementRequest({
          repoRoot,
          prepared,
          requestOrdinal: request.requestOrdinal,
          prerequisiteResults: [],
          authReadback: preflight.authReadback,
          runtimeTarget,
          environment,
          workingDirectory,
        })
      resultCarriers.push(dispatched.carrier)
    } finally {
      rmSync(workingDirectory, { recursive: true, force: true })
    }
  }
  const closed = closeGenuineProviderNeutralReview({
    repoRoot,
    prepared,
    resultCarriers,
    runtimeTarget,
    runtimeEvidenceBytes,
    capabilityEvidenceBytes,
  })
  const archiveHandoff = buildGenuineProviderNeutralReviewArchiveHandoff({
    prepared,
    resultCarriers,
    ...closed,
  })
  const archived = archiveGenuineCrossProviderReviewEvidence({
    repoRoot,
    explicitRoot: args.explicitRoot,
    handoff: archiveHandoff,
  })
  return {
    schemaVersion: 1,
    evidenceKind: 'provider-neutral-external-entitlement-review-execution',
    mode: 'external-entitlement-review',
    providerId: selected.providerId,
    reviewProfileId: selected.reviewProfileId,
    invocationProfileId: selected.invocationProfileId,
    modelReleaseId: selected.modelReleaseId,
    requestModelId: selected.requestModelId,
    requestCount: prepared.exchangeSchedule.requestCount,
    exchangeScheduleDigest: prepared.exchangeSchedule.exchangeScheduleDigest,
    archive: {
      reference: archived.archiveReference,
      archiveDigest: archived.archiveDigest,
      evidenceSetDigest: archived.handoff.evidenceSetDigest,
      artifactSetDigest: archived.handoff.artifactSetDigest,
      receiptDigest: archived.receipt.receiptDigest,
      reused: archived.reused,
    },
    receipt: closed.receipt,
  }
}

async function executeModelDeepAudit({ repoRoot, args, planState, profileState, brokerState, managedState }) {
  if (!args.execute || !args.allowModel || !args.managedBroker || !args.provider || !args.surface || !args.model || !args.kind) {
    fail('executeModelDeepAudit requires the complete explicit managed-broker authorization tuple')
  }
  assertBrokerActivation({ args, profileState, brokerState, managedState })
  const activeRun = loadActiveDeepAuditRun({ repoRoot, explicitRoot: args.explicitRoot, requireCurrent: true })
  validateDeepAuditRunProviderBindings(activeRun.manifest, { repoRoot })
  const provider = [
    activeRun.manifest.providers.self,
    activeRun.manifest.providers.peer,
  ].filter(Boolean).find((item) => item.id === args.provider)
  if (!provider?.runtimeCertification) fail(`provider lacks active-run runtime certification:${args.provider}`)
  if (provider.certificationContract !== 'exact-provider-runtime-surface-role-target-v1'
    || provider.runtimeCertification.runtimeProviderId !== provider.id
    || provider.runtimeCertification.runtimeKind !== provider.runtimeIdentity
    || provider.runtimeSurface !== args.surface
    || provider.runtimeCertification.surface !== provider.runtimeSurface
    || provider.runtimeCertification.repositoryRole !== 'authority'
    || !provider.runtimeCertification.targetId
    || !['certified', 'conditional'].includes(provider.runtimeCertification.certificationStatus)
    || !Number.isFinite(Date.parse(provider.runtimeCertification.expiresAt))
    || Date.parse(provider.runtimeCertification.expiresAt) <= Date.now()) {
    fail(`provider lacks an exact active-run provider/runtime/surface/role/target certification:${args.provider}`)
  }
  const prepared = prepareProviderNeutralReviewExchange({
    repoRoot,
    explicitRoot: args.explicitRoot,
    reviewerProviderId: args.provider,
    requestModelId: args.model,
  })
  if (!prepared.exchangeSchedule
    || prepared.exchangeSchedule.fullRegisteredReview !== true
    || prepared.exchangeSchedule.sampling !== false
    || prepared.reviewGraph.proof.complete !== true
    || prepared.reviewGraph.proof.sampling !== false) {
    fail('activated managed wrapper did not converge on the canonical complete no-sample review graph')
  }
  // This local entrypoint deliberately has no provider spawn, network client,
  // secret access, or evidence writer.  The activated canonical workflow is
  // the sole owner of signed dispatch/reduction/publication.
  fail('local runner cannot impersonate the activated managed model-broker job; dispatch the canonical managed workflow with signed shard/result receipts')
}

export async function runModelDeepAudit(argv = process.argv.slice(2), options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('runner options must be an object')
  const optionKeys = Object.keys(options)
  if (optionKeys.some((key) => key !== 'repoRoot')) fail(`unknown runner option:${optionKeys.find((key) => key !== 'repoRoot')}`)
  const repoRoot = options.repoRoot ?? process.cwd()
  const args = parseModelDeepAuditArgs(argv)
  const planState = loadModelEvidencePlan({ repoRoot })
  const profileState = loadModelInvocationProfiles({ repoRoot })
  const schemaState = modelResultSchemaState({ repoRoot })
  const brokerState = loadModelEvidenceBrokerPlan({ repoRoot })
  const managedState = loadManagedCiTrustedExecutionPlan({ repoRoot })
  if (args.provider && !profileState.profiles[args.provider]) fail(`provider has no broker-content-only invocation profile:${args.provider}`)
  if (args.provider && args.model) validateImmutableModelForProfile(profileState.profiles[args.provider], args.model)
  if (!args.execute) {
    const activeRun = args.check
      ? loadActiveDeepAuditRun({ repoRoot, explicitRoot: args.explicitRoot, requireCurrent: true })
      : null
    if (activeRun) validateDeepAuditRunProviderBindings(activeRun.manifest, { repoRoot })
    return modelPlanView({ args, planState, profileState, schemaState, brokerState, managedState, activeRun, repoRoot })
  }
  if (args.externalEntitlement) {
    return executeExternalEntitlementDeepAudit({ repoRoot, args })
  }
  return executeModelDeepAudit({ repoRoot, args, planState, profileState, brokerState, managedState })
}

function printHuman(result) {
  if (result.mode === 'external-entitlement-review') {
    console.log(`Model deep-audit external entitlement review completed:${result.receipt.receiptDigest}`)
    console.log(`  provider:${result.providerId}; profile:${result.reviewProfileId}; model:${result.requestModelId}`)
    console.log(`  durable archive:${result.archive.reference} (${result.archive.archiveDigest})`)
    return
  }
  console.log(`Model deep-audit ${result.mode}: execution not authorized`)
  console.log(`  providers:${result.providers.join(',')}; surface:${result.surface ?? 'not-selected'}; result schema:${result.resultSchemaSha256}`)
  console.log(`  broker:${result.brokerActivation}; managed:${result.managedExecutionActive ? 'active' : 'blocked'}`)
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  runModelDeepAudit().then((result) => {
    if (process.argv.includes('--json')) process.stdout.write(`${stableStringify(result, 2)}\n`)
    else printHuman(result)
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
  })
}

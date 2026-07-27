#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  linkSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import {
  archiveAllHarnessPassReceipt,
  buildDeepAuditSourceChangeSummary,
  buildFocusedValidationRecordSet,
  readFrozenReviewBundle,
  writeFrozenReviewBundle,
} from './lib/deep-audit-review-archive.mjs'
import {
  captureDeepAuditSnapshot,
  sha256,
  stableStringify,
} from './lib/deep-audit-evidence-contract.mjs'
import {
  ensureRuntimeEvidenceRoot,
} from './lib/governance-runtime-evidence.mjs'
import { buildBrokerNoSampleReviewGraph } from './lib/model-evidence-broker.mjs'
import { captureGitVisibleWorktree } from './lib/worktree-fingerprint.mjs'

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function initializeRepository() {
  const root = mkdtempSync(resolve(tmpdir(), 'deep-audit-review-archive-'))
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'archive-test@example.invalid')
  git(root, 'config', 'user.name', 'Review Archive Test')
  writeFileSync(resolve(root, 'README.md'), 'fixture\n')
  git(root, 'add', 'README.md')
  git(root, 'commit', '-qm', 'fixture')
  ensureRuntimeEvidenceRoot({ repoRoot: root })
  return root
}

function identity(root, runId = randomUUID()) {
  const indexBytes = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root })
  return {
    runId,
    manifestSha256: '1'.repeat(64),
    head: git(root, 'rev-parse', 'HEAD'),
    tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    indexDigest: sha256(indexBytes),
    worktreeFingerprint: '2'.repeat(64),
    inventoryDigest: '3'.repeat(64),
    rubricDigest: '4'.repeat(64),
    providerIdentityDigest: '5'.repeat(64),
  }
}

function canonicalDigest(value, key) {
  const projection = structuredClone(value)
  delete projection[key]
  return sha256(stableStringify(projection))
}

function canonicalRowsDigest(rows) {
  const hash = createHash('sha256')
  for (const row of rows) hash.update(stableStringify(row)).update('\n')
  return hash.digest('hex')
}

function readdressForgedReviewGraph(graph, brokerPlan) {
  const cellsById = new Map(graph.coverageCells.map((cell) => [cell.cellId, cell]))
  const leavesById = new Map()
  for (const cell of graph.coverageCells) {
    for (const leaf of cell.leafBindings) {
      const previous = leavesById.get(leaf.chunkId)
      assert.ok(
        previous === undefined || stableStringify(previous) === stableStringify(leaf),
        `fixture graph substitutes leaf ${leaf.chunkId}`,
      )
      if (!previous) leavesById.set(leaf.chunkId, leaf)
    }
  }
  graph.reviewWorkUnits = graph.reviewWorkUnits.map((unit, ordinal) => {
    const cells = unit.coverageCellIds.map((cellId) => {
      const cell = cellsById.get(cellId)
      assert.ok(cell, `fixture graph references unknown cell ${cellId}`)
      return cell
    }).sort((left, right) => Buffer.compare(Buffer.from(left.cellId), Buffer.from(right.cellId)))
    const leafIds = [...new Set(cells.flatMap((cell) => cell.leafIds))]
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    const taskKeys = [...new Set(cells.map((cell) => cell.taskKey))]
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    const semanticsBindings = cells.map((cell) => ({
      cellId: cell.cellId,
      reviewSemanticsSetDigest: cell.reviewSemanticsSetDigest,
    }))
    const coverageCellIds = cells.map((cell) => cell.cellId)
    const reviewInstructionCellBytes =
      Buffer.byteLength(JSON.stringify(stableStringify(cells)))
    const requestBindingBytes = Buffer.byteLength(stableStringify({
      taskKeys,
      coverageCellIds,
      leafIds,
    }))
    const maxEvidenceReferenceBytesPerLeaf =
      brokerPlan.reviewGraph.maxEvidenceReferenceBytesPerLeaf
    const evidenceReferenceBudgetBytes =
      leafIds.length * maxEvidenceReferenceBytesPerLeaf
    const blobsByDigest = new Map()
    for (const leafId of leafIds) {
      const leaf = leavesById.get(leafId)
      assert.ok(leaf, `fixture graph references unknown leaf ${leafId}`)
      const previous = blobsByDigest.get(leaf.contentSha256)
      assert.ok(
        previous === undefined || previous === leaf.bytes,
        `fixture graph content digest changes byte length ${leaf.contentSha256}`,
      )
      blobsByDigest.set(leaf.contentSha256, leaf.bytes)
    }
    const evidenceBlobBytes = [...blobsByDigest.entries()].reduce(
      (sum, [contentSha256, bytes]) => sum
        + Buffer.byteLength(stableStringify({
          sha256: contentSha256,
          bytes,
          encoding: 'base64',
          content: '',
        }))
        + (Math.ceil(bytes / 3) * 4),
      0,
    )
    const preparedTransportBytes =
      brokerPlan.reviewGraph.maxPreparedRequestFixedBytes
      + reviewInstructionCellBytes
      + requestBindingBytes
      + evidenceReferenceBudgetBytes
      + evidenceBlobBytes
    const projection = {
      schemaVersion: 1,
      unitKind: unit.unitKind,
      taskSetDigest: graph.taskSetDigest,
      taskKeys,
      coverageCellIds,
      leafIds,
      rawContentBytes: leafIds.reduce((sum, leafId) => {
        const leaf = leavesById.get(leafId)
        assert.ok(leaf, `fixture graph references unknown leaf ${leafId}`)
        return sum + leaf.bytes
      }, 0),
      reviewSemanticsBytes: Buffer.byteLength(stableStringify(
        cells.flatMap((cell) => cell.reviewSemanticsBindings),
      )),
      reviewSemanticsSetDigest: sha256(stableStringify(semanticsBindings)),
      reviewInstructionCellBytes,
      requestBindingBytes,
      maxEvidenceReferenceBytesPerLeaf,
      evidenceReferenceBudgetBytes,
      evidenceBlobBytes,
      preparedTransportBytes,
    }
    const workUnitDigest = sha256(stableStringify(projection))
    return {
      ...projection,
      workUnitId: workUnitDigest,
      workUnitDigest,
      ordinal,
    }
  })
  graph.reviewWorkUnitCount = graph.reviewWorkUnits.length

  const dispatchItems = graph.reviewWorkUnits.map((unit) => {
    const estimatedPromptBytes = unit.preparedTransportBytes
    assert.ok(
      estimatedPromptBytes <= brokerPlan.limits.maxPromptBytesPerShard,
      `forged fixture work unit exceeds prompt budget ${unit.workUnitId}`,
    )
    return {
      unit,
      costUnits: Math.max(
        1,
        Math.ceil(estimatedPromptBytes / brokerPlan.budgets.costUnitPromptBytes),
      ),
    }
  })
  const dispatchProjection = {
    schemaVersion: 1,
    batchOrdinal: 0,
    dispatchIds: dispatchItems.map(({ unit }) => unit.workUnitId),
    reviewWorkUnitCount: dispatchItems.length,
    synthesisCount: 0,
    totalSourceBytes: dispatchItems.reduce(
      (sum, { unit }) => sum + unit.rawContentBytes,
      0,
    ),
    providerCallUpperBound: dispatchItems.length,
    costUnits: dispatchItems.reduce((sum, item) => sum + item.costUnits, 0),
  }
  assert.ok(
    dispatchProjection.reviewWorkUnitCount
        <= brokerPlan.budgets.dispatchBatch.maxProviderCalls
      && dispatchProjection.reviewWorkUnitCount
        <= brokerPlan.budgets.dispatchBatch.maxShardCount
      && dispatchProjection.totalSourceBytes
        <= brokerPlan.budgets.dispatchBatch.maxTotalSourceBytes
      && dispatchProjection.costUnits <= brokerPlan.budgets.dispatchBatch.maxCostUnits,
    'forged fixture must remain a single legal dispatch batch',
  )
  graph.dispatchBatches = [{
    ...dispatchProjection,
    batchId: sha256(stableStringify(dispatchProjection)),
  }]
  graph.dispatchBatchCount = 1
  graph.dispatchTotals = {
    totalSourceBytes: dispatchProjection.totalSourceBytes,
    shardCount: dispatchProjection.reviewWorkUnitCount,
    reviewWorkUnitCount: dispatchProjection.reviewWorkUnitCount,
    providerCallUpperBound: dispatchProjection.providerCallUpperBound,
    providerCallAccounting: 'capability-bounded-exchange-schedule',
    costUnits: dispatchProjection.costUnits,
    synthesisProviderCalls: 0,
    deterministicReductionUnits: graph.synthesisUnits.length,
  }

  graph.proof.modelReviewWorkUnitCount = graph.reviewWorkUnits.length
  graph.proof.judgmentReviewWorkUnitCount = graph.reviewWorkUnits.filter(
    (unit) => unit.unitKind === 'multiplexed-judgment-review',
  ).length
  graph.proof.componentClaimReviewWorkUnitCount = graph.reviewWorkUnits.filter(
    (unit) => unit.unitKind === 'component-claim-review',
  ).length
  graph.proof.sharedEvidenceReviewWorkUnitCount = graph.reviewWorkUnits.filter(
    (unit) => unit.unitKind === 'content-addressed-shared-evidence-review',
  ).length
  const proofProjection = structuredClone(graph.proof)
  delete proofProjection.expectedClaimSetDigest
  delete proofProjection.actualClaimSetDigest
  delete proofProjection.rawCorpusDispositionDigest
  delete proofProjection.coverageCompletenessDigest
  graph.proof.coverageCompletenessDigest = sha256(stableStringify(proofProjection))
  graph.reviewGraphDigest = canonicalDigest(graph, 'reviewGraphDigest')

  assert.equal(
    new Set(graph.reviewWorkUnits.flatMap((unit) => unit.coverageCellIds)).size,
    graph.coverageCellCount,
    'forged graph must preserve exact-once cell coverage',
  )
  assert.equal(
    graph.reviewWorkUnits.flatMap((unit) => unit.coverageCellIds).length,
    graph.coverageCellCount,
    'forged graph must not duplicate cell coverage',
  )
  assert.deepEqual(
    graph.dispatchBatches[0].dispatchIds,
    graph.reviewWorkUnits.map((unit) => unit.workUnitId),
    'forged graph dispatch must address every work unit in order',
  )
  assert.equal(
    graph.reviewGraphDigest,
    canonicalDigest(graph, 'reviewGraphDigest'),
    'forged graph must be content addressed',
  )
  return graph
}

function jsonArtifact(path, role, value) {
  return {
    path,
    role,
    mediaType: 'application/json',
    bytes: Buffer.from(`${stableStringify(value, 2)}\n`),
  }
}

function buildCompleteFixture(root, {
  runId = randomUUID(),
  snapshot = null,
  suffix = '',
} = {}) {
  const base = snapshot ?? identity(root, runId)
  const modelPlan = {
    judgment: {
      dimensions: Array.from({ length: 26 }, (_, index) => ({
        dim: index + 1,
        ruleId: `DS-DIM-${String(index + 1).padStart(3, '0')}`,
      })),
    },
  }
  const modelPlanBytes = Buffer.from(`${stableStringify(modelPlan, 2)}\n`)
  const brokerPlanBytes = readFileSync(resolve(
    process.cwd(),
    'infra/governance/model-evidence-broker.json',
  ))
  const brokerPlan = JSON.parse(brokerPlanBytes)
  const resultSchemaBytes = Buffer.from(`${stableStringify({ type: 'object' }, 2)}\n`)
  const contentBytes = Buffer.from(`complete-evidence${suffix}`)
  const inventory = [
    {
      path: 'review-source.txt',
      kind: 'file',
      mode: '100644',
      bytes: contentBytes.length,
      sha256: sha256(contentBytes),
    },
    {
      path: 'infra/governance/model-evidence-broker.json',
      kind: 'file',
      mode: '100644',
      bytes: brokerPlanBytes.length,
      sha256: sha256(brokerPlanBytes),
    },
    {
      path: 'infra/governance/model-evidence-plan.json',
      kind: 'file',
      mode: '100644',
      bytes: modelPlanBytes.length,
      sha256: sha256(modelPlanBytes),
    },
    {
      path: 'infra/governance/schemas/model-broker-shard-result.schema.json',
      kind: 'file',
      mode: '100644',
      bytes: resultSchemaBytes.length,
      sha256: sha256(resultSchemaBytes),
    },
  ].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))
  const components = Array.from({ length: 64 }, (_, index) => ({
    name: `Component${String(index + 1).padStart(2, '0')}`,
    paths: [`components/${String(index + 1).padStart(2, '0')}.tsx`],
    digest: sha256(`component-${index + 1}`),
  }))
  const selection = {
    kind: 'provider-review-capability-selection-blocked',
    selectionStatus: 'REVIEW-BLOCKED',
  }
  const runManifest = {
    runId,
    head: base.head,
    tree: base.tree,
    indexDigest: base.indexDigest,
    worktreeFingerprint: base.worktreeFingerprint,
    inventoryDigest: sha256(stableStringify(inventory)),
    rubricDigest: base.rubricDigest,
    providerIdentityDigest: base.providerIdentityDigest,
    components,
    inventory,
    reviewSelection: selection,
  }
  const runManifestBytes = Buffer.from(`${stableStringify(runManifest, 2)}\n`)
  const frozenIdentity = {
    ...base,
    runId,
    inventoryDigest: runManifest.inventoryDigest,
    manifestSha256: sha256(runManifestBytes),
  }
  const runIdentity = {
    runId,
    manifestSha256: frozenIdentity.manifestSha256,
    head: frozenIdentity.head,
    tree: frozenIdentity.tree,
    indexDigest: frozenIdentity.indexDigest,
    worktreeFingerprint: frozenIdentity.worktreeFingerprint,
    inventoryDigest: frozenIdentity.inventoryDigest,
    rubricDigest: frozenIdentity.rubricDigest,
    providerIdentityDigest: frozenIdentity.providerIdentityDigest,
    brokerPlanDigest: sha256(brokerPlanBytes),
    modelEvidencePlanDigest: sha256(modelPlanBytes),
    resultSchemaSha256: sha256(resultSchemaBytes),
  }
  const chunkIdentity = {
    sourceKind: 'repository-source',
    sourceId: sha256('fixture-source'),
    path: 'review-source.txt',
    packageName: null,
    packageVersion: null,
    lockfileIntegrity: null,
    mediaType: 'text',
    fileSha256: sha256(contentBytes),
    fileBytes: contentBytes.length,
    chunkIndex: 0,
    chunkCount: 1,
    offset: 0,
    bytes: contentBytes.length,
    lineStart: 1,
    lineEnd: 1,
    contentSha256: sha256(contentBytes),
    encoding: 'base64',
  }
  const chunk = {
    ...chunkIdentity,
    content: contentBytes.toString('base64'),
    chunkId: sha256(stableStringify(chunkIdentity)),
  }
  const taskKeys = [
    ...modelPlan.judgment.dimensions.map(row => `judgment:${row.dim}`),
    ...components.map(component => `component-a1b:${component.name}`),
  ]
  const taskDescriptors = taskKeys.map((taskKey, taskIndex) => {
    const [taskKind, rawSubject] = taskKey.split(':')
    const subject = taskKind === 'judgment' ? Number(rawSubject) : rawSubject
    const hasExactClaim = taskKind === 'component-a1b' && taskIndex < 28
    const claimInventoryDigest = taskKind === 'judgment'
      ? null
      : sha256(`claim-${taskIndex}`)
    const identityValue = {
      ...runIdentity,
      coverageInventoryDigest: sha256(`coverage-${taskIndex}`),
      taskKind,
      subject,
      sourceSetDigest: sha256(`source-set-${taskIndex}`),
      sourceChunkCount: 1,
      totalSourceBytes: contentBytes.length,
      inputArtifactSetDigest: sha256(`input-${taskIndex}`),
      dependencySourceInventoryDigest: taskKind === 'judgment'
        ? null
        : sha256(`dependency-inventory-${taskIndex}`),
      dependencySourceStatus: taskKind === 'judgment' ? null : 'verified',
      dependencySourceFindingsDigest: taskKind === 'judgment'
        ? null
        : sha256('[]'),
      dependencySourceDispositionDigest: taskKind === 'judgment'
        ? null
        : sha256(`dependency-disposition-${taskIndex}`),
      dependencySourceUniverseCount: taskKind === 'judgment' ? null : 1,
      dependencySourceMaterializedReachableCount: taskKind === 'judgment' ? null : 1,
      dependencySourceNotApplicableCount: taskKind === 'judgment' ? null : 0,
      dependencySourceUnknownCount: taskKind === 'judgment' ? null : 0,
      maxClaimsPerShard: brokerPlan.limits.maxClaimsPerShard,
    }
    const shard = {
      ordinal: 0,
      shardId: sha256(`shard-${taskIndex}`),
      batchDigest: sha256(`batch-${taskIndex}`),
      promptBytes: 1,
      estimatedTokens: 1,
      rawContentBytes: contentBytes.length,
      chunkRefs: [{
        chunkId: chunk.chunkId,
        sourceId: chunk.sourceId,
        path: chunk.path,
        mediaType: chunk.mediaType,
        offset: chunk.offset,
        bytes: chunk.bytes,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        contentSha256: chunk.contentSha256,
      }],
      claimIds: [],
      claimEvidenceGraphDigest: null,
      reviewSemantics: null,
    }
    if (taskKind === 'judgment') {
      const semantics = {
        schemaVersion: 1,
        semanticsKind: 'judgment-rule-review',
        rule: {
          dim: subject,
          ruleId: `DS-DIM-${String(subject).padStart(3, '0')}`,
          mechanism: `fixture archived judgment mechanism ${String(subject)}`,
        },
      }
      semantics.semanticsDigest = canonicalDigest(semantics, 'semanticsDigest')
      shard.reviewSemantics = semantics
    } else {
      const claim = hasExactClaim
        ? {
          claimId: sha256(`${subject}\0review-source.txt\0${String(1)}\0fixture-claim`),
          claimClass: 'claim-source-line',
          path: 'review-source.txt',
          line: 1,
          textSha256: sha256(`fixture-claim-${subject}`),
          supportingSourceSetDigest: identityValue.dependencySourceInventoryDigest,
        }
        : null
      const claimEvidenceGraph = {
        schemaVersion: 1,
        status: 'self-contained',
        reason: null,
        requiredEvidenceDigest: sha256(stableStringify([shard.chunkRefs[0]])),
        requiredChunkCount: 1,
        requiredRawContentBytes: contentBytes.length,
        allowedSupportingChunkIds: [chunk.chunkId],
        implementationChunkIds: claim ? [] : [chunk.chunkId],
        dependencyPackages: [],
        claimBindings: claim
          ? [{
            claimId: claim.claimId,
            line: claim.line,
            claimSourceChunkIds: [chunk.chunkId],
          }]
          : [],
      }
      claimEvidenceGraph.graphDigest = canonicalDigest(claimEvidenceGraph, 'graphDigest')
      const semantics = claim
        ? {
          schemaVersion: 1,
          semanticsKind: 'component-claim-evidence-review',
          claimInventoryDigest,
          claims: [claim],
          claimEvidenceGraph,
        }
        : {
          schemaVersion: 1,
          semanticsKind: 'component-shared-evidence-review',
          claimInventoryDigest,
          parentClaimEvidenceGraphDigest: claimEvidenceGraph.graphDigest,
          leafIds: [chunk.chunkId],
          rule: {
            ruleId: 'component-a1b-shared-evidence',
            mechanism: 'Review every exact bound evidence leaf for component contract, implementation, dependency, and integrity risks without making an unbound claim verdict.',
          },
        }
      semantics.semanticsDigest = canonicalDigest(semantics, 'semanticsDigest')
      shard.claimIds = claim ? [claim.claimId] : []
      shard.claimEvidenceGraphDigest = claimEvidenceGraph.graphDigest
      shard.reviewSemantics = semantics
    }
    const descriptor = {
      schemaVersion: 1,
      evidenceKind: 'deep-audit-model-task-dispatch-descriptor',
      identity: identityValue,
      inputArtifactSetDigest: identityValue.inputArtifactSetDigest,
      shardSetDigest: sha256(`shard-set-${taskIndex}`),
      claimInventoryDigest,
      shardCount: 1,
      shards: [shard],
      estimate: {
        totalSourceBytes: contentBytes.length,
        shardCount: 1,
        providerCalls: 1,
        costUnits: 1,
      },
    }
    descriptor.descriptorDigest = canonicalDigest(descriptor, 'descriptorDigest')
    return descriptor
  })
  const taskSet = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-task-set',
    scopeKind: 'registered-full-review',
    brokerPlanDigest: runIdentity.brokerPlanDigest,
    runIdentity,
    expectedTaskCount: 90,
    expectedTaskKeys: taskKeys,
    taskDescriptorDigests: taskDescriptors.map(row => row.descriptorDigest),
  }
  taskSet.taskSetDigest = canonicalDigest(taskSet, 'taskSetDigest')
  const carrierMetadata = taskDescriptors.map((descriptor, index) => {
    const metadata = {
      schemaVersion: 1,
      evidenceKind: 'deep-audit-model-shard-carrier-metadata',
      taskKey: taskKeys[index],
      ordinal: 0,
      shardId: descriptor.shards[0].shardId,
      batchDigest: descriptor.shards[0].batchDigest,
      descriptorDigest: sha256(`carrier-descriptor-${index}`),
      carrierDigest: sha256(`carrier-${index}`),
      blobRefs: [{
        sha256: chunk.contentSha256,
        bytes: chunk.bytes,
        encoding: 'base64',
      }],
    }
    metadata.metadataDigest = canonicalDigest(metadata, 'metadataDigest')
    return metadata
  })
  assert.ok(
    carrierMetadata.every((metadata, index) => (
      metadata.descriptorDigest !== taskDescriptors[index].descriptorDigest
    )),
    'carrier metadata must bind its content-shard carrier descriptor, not the task-dispatch descriptor',
  )
  const blobUseRows = carrierMetadata.map(metadata => ({
    taskKey: metadata.taskKey,
    ordinal: metadata.ordinal,
    sha256: chunk.contentSha256,
    bytes: chunk.bytes,
  }))
  const uniqueBlobRefs = [{
    sha256: chunk.contentSha256,
    bytes: chunk.bytes,
    encoding: 'base64',
  }]
  const contentSet = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-global-content-set',
    protocol: brokerPlan.executionMode,
    brokerPlanDigest: runIdentity.brokerPlanDigest,
    taskSetDigest: taskSet.taskSetDigest,
    runIdentity,
    taskCount: 90,
    shardCount: 90,
    tasks: taskDescriptors.map((descriptor, index) => ({
      taskKey: taskKeys[index],
      taskDescriptorDigest: descriptor.descriptorDigest,
      shardSetDigest: descriptor.shardSetDigest,
      shardCount: descriptor.shardCount,
    })),
    carrierCount: carrierMetadata.length,
    orderedCarrierSetDigest: canonicalRowsDigest(carrierMetadata),
    blobUseCount: blobUseRows.length,
    orderedBlobUseDigest: canonicalRowsDigest(blobUseRows),
    uniqueBlobCount: 1,
    uniqueBlobSetDigest: canonicalRowsDigest(uniqueBlobRefs),
    uniqueBlobBytes: contentBytes.length,
    storageDeduplicationOnly: true,
    sampling: false,
  }
  contentSet.contentSetDigest = canonicalDigest(contentSet, 'contentSetDigest')
  const reviewGraph = buildBrokerNoSampleReviewGraph({
    taskSet,
    taskDescriptors,
    planState: {
      plan: brokerPlan,
      planDigest: runIdentity.brokerPlanDigest,
      resultSchemaSha256: runIdentity.resultSchemaSha256,
    },
  })
  const coverageProof = reviewGraph.proof
  const reviewClosure = {
    selectionStatus: 'REVIEW-BLOCKED',
    completeReviewScheduleDigest: reviewGraph.reviewGraphDigest,
    coverageCompletenessDigest: coverageProof.coverageCompletenessDigest,
    taskCount: 90,
    reviewWorkUnitCount: reviewGraph.reviewWorkUnitCount,
    synthesisUnitCount: reviewGraph.synthesisUnitCount,
    sampling: false,
  }
  const focusedValidation = buildFocusedValidationRecordSet([{
    id: 'archive-fixture',
    argv: ['node', 'archive-fixture'],
    exitCode: 0,
    status: 'passed',
    evidenceSha256: 'b'.repeat(64),
  }])
  const current = {
    runId: frozenIdentity.runId,
    manifestSha256: frozenIdentity.manifestSha256,
    head: frozenIdentity.head,
    tree: frozenIdentity.tree,
    indexDigest: frozenIdentity.indexDigest,
    inventoryDigest: frozenIdentity.inventoryDigest,
    worktreeFingerprint: frozenIdentity.worktreeFingerprint,
  }
  const exchangeState = {
    schemaVersion: 1,
    kind: 'provider-neutral-review-exchange-state',
    selectionStatus: 'REVIEW-BLOCKED',
    authorProviderId: 'codex',
    reviewerProviderId: null,
    requestModelId: null,
    completeReviewScheduleDigest: reviewGraph.reviewGraphDigest,
    coverageCompletenessDigest: coverageProof.coverageCompletenessDigest,
    exchangeSchedule: null,
    noNetworkCapability: true,
    noCredentialCapability: true,
    noRepositoryMutationCapability: true,
  }
  const artifacts = [
    {
      path: 'run/run-manifest.json',
      role: 'run-manifest',
      mediaType: 'application/json',
      bytes: runManifestBytes,
    },
    {
      path: 'authority/model-evidence-plan.json',
      role: 'model-evidence-plan',
      mediaType: 'application/json',
      bytes: modelPlanBytes,
    },
    {
      path: 'authority/model-evidence-broker.json',
      role: 'model-evidence-broker-plan',
      mediaType: 'application/json',
      bytes: brokerPlanBytes,
    },
    {
      path: 'authority/model-broker-shard-result.schema.json',
      role: 'model-result-schema',
      mediaType: 'application/json',
      bytes: resultSchemaBytes,
    },
    jsonArtifact('review/review-selection.json', 'review-selection', selection),
    jsonArtifact('review/exchange-state.json', 'exchange-state', exchangeState),
    jsonArtifact('review/exchange-schedule.json', 'exchange-schedule', null),
    jsonArtifact('review/task-set.json', 'task-set', taskSet),
    jsonArtifact('review/task-descriptors.json', 'task-descriptors', taskDescriptors),
    jsonArtifact('review/carrier-metadata.json', 'carrier-metadata', carrierMetadata),
    jsonArtifact('review/content-set.json', 'content-set', contentSet),
    jsonArtifact('review/review-graph.json', 'review-graph', reviewGraph),
    jsonArtifact('review/coverage-proof.json', 'coverage-proof', coverageProof),
    {
      path: `cas/blobs/${chunk.contentSha256}.bin`,
      role: 'cas-blob',
      mediaType: 'application/octet-stream',
      bytes: contentBytes,
    },
    jsonArtifact(`cas/leaves/${chunk.chunkId}.json`, 'cas-leaf', chunk),
    jsonArtifact('closure/focused-validation.json', 'focused-validation', focusedValidation),
    jsonArtifact(
      'closure/source-change-summary.json',
      'source-change-summary',
      {
        schemaVersion: 1,
        kind: 'deep-audit-source-change-summary',
        baseline: null,
        current,
        changeCount: 0,
        changes: [],
      },
    ),
  ]
  return { identity: frozenIdentity, review: reviewClosure, artifacts }
}

function expectReadbackFailure(root, written, pattern) {
  assert.throws(() => readFrozenReviewBundle({
    repoRoot: root,
    runId: written.candidate.identity.runId,
    candidateDigest: written.candidateDigest,
  }), pattern)
}

function testSourceChangeSummaryAllowsGovernedDotPaths() {
  const root = initializeRepository()
  try {
    const fixture = buildCompleteFixture(root)
    const common = {
      ...fixture.identity,
      inventory: [
        { path: '.agents/rules.json', kind: 'file', sha256: '1'.repeat(64) },
        { path: '.claude/settings.json', kind: 'file', sha256: '2'.repeat(64) },
        { path: '.github/workflows/governance.yml', kind: 'file', sha256: '3'.repeat(64) },
      ],
    }
    const current = {
      ...common,
      inventory: common.inventory.map(row => ({
        ...row,
        sha256: row.sha256.replace(/^./, 'f'),
      })),
    }
    const summary = buildDeepAuditSourceChangeSummary({
      baselineRun: { manifest: common, manifestSha256: '4'.repeat(64) },
      currentRun: { manifest: current, manifestSha256: '5'.repeat(64) },
    })
    assert.deepEqual(summary.changes.map(change => change.path), [
      '.agents/rules.json',
      '.claude/settings.json',
      '.github/workflows/governance.yml',
    ])
  } finally {
    rmSync(root, { recursive: true })
  }
}

function testBundleDeterminismAndRecovery() {
  const root = initializeRepository()
  try {
    const fixture = buildCompleteFixture(root)
    const first = writeFrozenReviewBundle({
      repoRoot: root,
      ...fixture,
    })
    const replay = writeFrozenReviewBundle({
      repoRoot: root,
      ...fixture,
    })
    assert.equal(replay.reused, true)
    assert.equal(replay.candidateDigest, first.candidateDigest)
    assert.equal(replay.artifactSetDigest, first.artifactSetDigest)
    assert.deepEqual(replay.candidateBytes, first.candidateBytes)
    assert.deepEqual(replay.artifactSetBytes, first.artifactSetBytes)

    const abandoned = resolve(dirname(first.root), `.${first.candidateDigest}.stage-crashed-fixture`)
    renameSync(first.root, abandoned)
    const recovered = writeFrozenReviewBundle({
      repoRoot: root,
      ...fixture,
    })
    assert.equal(recovered.reused, false)
    assert.equal(recovered.candidateDigest, first.candidateDigest)
    assert.equal(readFrozenReviewBundle({
      repoRoot: root,
      runId: fixture.identity.runId,
      candidateDigest: first.candidateDigest,
    }).artifactSetDigest, first.artifactSetDigest)
    const wrongSourceArtifacts = fixture.artifacts.map(artifact => {
      if (artifact.role !== 'source-change-summary') return artifact
      const value = JSON.parse(artifact.bytes)
      value.current.runId = randomUUID()
      return jsonArtifact(artifact.path, artifact.role, value)
    })
    assert.throws(() => writeFrozenReviewBundle({
      repoRoot: root,
      identity: fixture.identity,
      review: fixture.review,
      artifacts: wrongSourceArtifacts,
    }), /source-change summary targets another frozen review candidate/i)
    rmSync(abandoned, { recursive: true })
  } finally {
    rmSync(root, { recursive: true })
  }
}

function testBundleCorruptionAndTopologyRejection() {
  for (const defect of ['corrupt', 'missing', 'extra', 'symlink', 'hardlink']) {
    const root = initializeRepository()
    try {
      const fixture = buildCompleteFixture(root, { suffix: defect })
      const written = writeFrozenReviewBundle({ repoRoot: root, ...fixture })
      const artifact = resolve(written.root, written.artifactSet.artifacts[0].path)
      if (defect === 'corrupt') writeFileSync(artifact, 'substituted')
      if (defect === 'missing') unlinkSync(artifact)
      if (defect === 'extra') writeFileSync(resolve(written.root, 'unexpected.txt'), 'extra')
      if (defect === 'symlink') symlinkSync('candidate.json', resolve(written.root, 'unexpected-link'))
      if (defect === 'hardlink') linkSync(artifact, resolve(written.root, 'unexpected-hardlink'))
      expectReadbackFailure(
        root,
        written,
        /missing|extra|substituted|symbolic link|hard-linked|no-link|unsupported/i,
      )
      assert.throws(() => writeFrozenReviewBundle({
        repoRoot: root,
        ...fixture,
      }), /missing|extra|substituted|symbolic link|hard-linked|no-link|unsupported/i)
    } finally {
      rmSync(root, { recursive: true })
    }
  }
}

function testSemanticClosureRejectsIncompleteOrSubstitutedSets() {
  const root = initializeRepository()
  try {
    const fixture = buildCompleteFixture(root)
    const cases = [
      {
        name: 'missing task set',
        artifacts: fixture.artifacts.filter(artifact => artifact.role !== 'task-set'),
        pattern: /exactly one task-set/i,
      },
      {
        name: 'missing CAS blob',
        artifacts: fixture.artifacts.filter(artifact => artifact.role !== 'cas-blob'),
        pattern: /non-empty exact CAS|CAS blob set/i,
      },
      {
        name: 'blocked schedule substituted',
        artifacts: fixture.artifacts.map(artifact => (
          artifact.role === 'exchange-schedule'
            ? jsonArtifact(artifact.path, artifact.role, { substituted: true })
            : artifact
        )),
        pattern: /detached from candidate closure|REVIEW-BLOCKED bundle contains a selected or detached exchange schedule/i,
      },
      {
        name: 'coverage proof substituted',
        artifacts: fixture.artifacts.map(artifact => {
          if (artifact.role !== 'coverage-proof') return artifact
          const value = JSON.parse(artifact.bytes)
          value.missingCount = 1
          value.complete = false
          return jsonArtifact(artifact.path, artifact.role, value)
        }),
        pattern: /complete, unique, no-sample|coverage/i,
      },
    ]
    for (const testCase of cases) {
      assert.throws(() => writeFrozenReviewBundle({
        repoRoot: root,
        identity: fixture.identity,
        review: fixture.review,
        artifacts: testCase.artifacts,
      }), testCase.pattern, testCase.name)
    }
    const graphArtifact = fixture.artifacts.find((artifact) => artifact.role === 'review-graph')
    const assertReaddressedSynthesisPoison = (mutate, pattern, name) => {
      const readdressedGraph = JSON.parse(graphArtifact.bytes)
      const poisonedRoot = readdressedGraph.synthesisUnits[0]
      mutate(poisonedRoot)
      const synthesisProjection = structuredClone(poisonedRoot)
      delete synthesisProjection.ordinal
      delete synthesisProjection.synthesisUnitId
      delete synthesisProjection.synthesisUnitDigest
      poisonedRoot.synthesisUnitDigest = sha256(stableStringify(synthesisProjection))
      poisonedRoot.synthesisUnitId = poisonedRoot.synthesisUnitDigest
      readdressedGraph.reviewGraphDigest = canonicalDigest(
        readdressedGraph,
        'reviewGraphDigest',
      )
      const readdressedArtifacts = fixture.artifacts.map((artifact) => {
        if (artifact.role === 'review-graph') {
          return jsonArtifact(artifact.path, artifact.role, readdressedGraph)
        }
        if (artifact.role === 'exchange-state') {
          const value = JSON.parse(artifact.bytes)
          value.completeReviewScheduleDigest = readdressedGraph.reviewGraphDigest
          return jsonArtifact(artifact.path, artifact.role, value)
        }
        return artifact
      })
      assert.throws(() => writeFrozenReviewBundle({
        repoRoot: root,
        identity: fixture.identity,
        review: {
          ...fixture.review,
          completeReviewScheduleDigest: readdressedGraph.reviewGraphDigest,
        },
        artifacts: readdressedArtifacts,
      }), pattern, name)
    }
    assertReaddressedSynthesisPoison(
      (unit) => { unit.inputIds = [] },
      /no-sample review graph is stale, substituted, incomplete, duplicated, or reordered|differs from the canonical broker graph/i,
      'fully readdressed root omission',
    )
    assertReaddressedSynthesisPoison(
      (unit) => { unit.stage = 1 },
      /no-sample review graph is stale, substituted, incomplete, duplicated, or reordered|differs from the canonical broker graph/i,
      'fully readdressed stage substitution',
    )
    assertReaddressedSynthesisPoison(
      (unit) => { unit.taskSetDigest = sha256('foreign-task-set') },
      /no-sample review graph is stale, substituted, incomplete, duplicated, or reordered|differs from the canonical broker graph/i,
      'fully readdressed task-set substitution',
    )
    assertReaddressedSynthesisPoison(
      (unit) => { unit.unitKind = 'foreign-synthesis-unit' },
      /no-sample review graph is stale, substituted, incomplete, duplicated, or reordered|differs from the canonical broker graph/i,
      'fully readdressed unit-kind substitution',
    )
    assertReaddressedSynthesisPoison(
      (unit) => { unit.schemaVersion = 2 },
      /no-sample review graph is stale, substituted, incomplete, duplicated, or reordered|differs from the canonical broker graph/i,
      'fully readdressed schema-version substitution',
    )

    const brokerPlanArtifact = fixture.artifacts.find(
      (artifact) => artifact.role === 'model-evidence-broker-plan',
    )
    const brokerPlan = JSON.parse(brokerPlanArtifact.bytes)
    const assertReaddressedWorkUnitPoison = (mutate, name) => {
      const readdressedGraph = JSON.parse(graphArtifact.bytes)
      mutate(readdressedGraph)
      readdressForgedReviewGraph(readdressedGraph, brokerPlan)
      const readdressedArtifacts = fixture.artifacts.map((artifact) => {
        if (artifact.role === 'review-graph') {
          return jsonArtifact(artifact.path, artifact.role, readdressedGraph)
        }
        if (artifact.role === 'coverage-proof') {
          return jsonArtifact(artifact.path, artifact.role, readdressedGraph.proof)
        }
        if (artifact.role === 'exchange-state') {
          const value = JSON.parse(artifact.bytes)
          value.completeReviewScheduleDigest = readdressedGraph.reviewGraphDigest
          value.coverageCompletenessDigest =
            readdressedGraph.proof.coverageCompletenessDigest
          return jsonArtifact(artifact.path, artifact.role, value)
        }
        return artifact
      })
      assert.throws(() => writeFrozenReviewBundle({
        repoRoot: root,
        identity: fixture.identity,
        review: {
          ...fixture.review,
          completeReviewScheduleDigest: readdressedGraph.reviewGraphDigest,
          coverageCompletenessDigest:
            readdressedGraph.proof.coverageCompletenessDigest,
          reviewWorkUnitCount: readdressedGraph.reviewWorkUnitCount,
        },
        artifacts: readdressedArtifacts,
      }), /no-sample review graph is stale, substituted, incomplete, duplicated, or reordered|differs from the canonical broker graph/i, name)
    }
    const splitCanonicalCapsule = (graph, unitKind) => {
      const index = graph.reviewWorkUnits.findIndex(
        (unit) => unit.unitKind === unitKind && unit.coverageCellIds.length >= 2,
      )
      assert.notEqual(index, -1, `fixture lacks splittable ${unitKind}`)
      const unit = graph.reviewWorkUnits[index]
      const midpoint = Math.ceil(unit.coverageCellIds.length / 2)
      graph.reviewWorkUnits.splice(index, 1,
        {
          ...unit,
          coverageCellIds: unit.coverageCellIds.slice(0, midpoint),
        },
        {
          ...unit,
          coverageCellIds: unit.coverageCellIds.slice(midpoint),
        })
    }
    assertReaddressedWorkUnitPoison(
      (graph) => splitCanonicalCapsule(graph, 'content-addressed-shared-evidence-review'),
      'fully readdressed split of an identical shared-evidence capsule',
    )
    assertReaddressedWorkUnitPoison(
      (graph) => splitCanonicalCapsule(graph, 'multiplexed-judgment-review'),
      'fully readdressed split of an identical judgment capsule',
    )
    assertReaddressedWorkUnitPoison(
      (graph) => {
        const indexes = graph.reviewWorkUnits
          .map((unit, index) => ({ unit, index }))
          .filter(({ unit }) => unit.unitKind === 'component-claim-review')
          .map(({ index }) => index)
        assert.ok(indexes.length >= 2, 'fixture lacks mergeable component claim work')
        const [firstIndex, secondIndex] = indexes
        const first = graph.reviewWorkUnits[firstIndex]
        const second = graph.reviewWorkUnits[secondIndex]
        graph.reviewWorkUnits[firstIndex] = {
          ...first,
          coverageCellIds: [...first.coverageCellIds, ...second.coverageCellIds],
        }
        graph.reviewWorkUnits.splice(secondIndex, 1)
      },
      'fully readdressed merge of component claim work units',
    )
  } finally {
    rmSync(root, { recursive: true })
  }
}

function gitVisibleIdentity(observed) {
  return {
    schemaVersion: observed.schemaVersion,
    kind: observed.kind,
    indexSha256: observed.indexSha256,
    entryCount: observed.entries.length,
    digest: observed.digest,
  }
}

function testReceiptArchiveRejectsNoncanonicalSource() {
  const root = initializeRepository()
  try {
    const snapshot = captureDeepAuditSnapshot(root)
    const fixture = buildCompleteFixture(root, {
      snapshot: {
        runId: randomUUID(),
        head: snapshot.head,
        tree: snapshot.tree,
        indexDigest: snapshot.indexDigest,
        worktreeFingerprint: snapshot.worktreeFingerprint,
        inventoryDigest: snapshot.inventoryDigest,
        rubricDigest: '9'.repeat(64),
        providerIdentityDigest: 'a'.repeat(64),
      },
    })
    const bundle = writeFrozenReviewBundle({
      repoRoot: root,
      ...fixture,
    })
    const worktree = gitVisibleIdentity(captureGitVisibleWorktree(root))
    assert.throws(() => archiveAllHarnessPassReceipt({
      repoRoot: root,
      runId: fixture.identity.runId,
      candidateDigest: bundle.candidateDigest,
      preWorktree: worktree,
      postWorktree: worktree,
      receiptPath: resolve(root, 'forged-receipt.json'),
    }), /option is forbidden:receiptPath/i)
    assert.throws(() => archiveAllHarnessPassReceipt({
      repoRoot: root,
      runId: fixture.identity.runId,
      candidateDigest: bundle.candidateDigest,
      preWorktree: worktree,
      postWorktree: worktree,
    }), /archive target is stale:inventoryDigest/i)
  } finally {
    rmSync(root, { recursive: true })
  }
}

testBundleDeterminismAndRecovery()
testBundleCorruptionAndTopologyRejection()
testSemanticClosureRejectsIncompleteOrSubstitutedSets()
testSourceChangeSummaryAllowsGovernedDotPaths()
testReceiptArchiveRejectsNoncanonicalSource()
console.log('deep-audit review archive tests passed')

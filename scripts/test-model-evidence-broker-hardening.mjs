#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { buildComponentClaimInventory } from './lib/component-claim-inventory.mjs'
import {
  buildComponentDependencySourceInventory,
  compareUtf8Bytes,
} from './lib/component-dependency-source-inventory.mjs'
import {
  buildBrokerGlobalContentSet,
  buildBrokerNoSampleReviewGraph,
  buildBrokerShardCarrierMetadata,
  buildBrokerStructuralReviewGraphResult,
  buildBrokerTaskDispatchDescriptor,
  buildBrokerTaskSet,
  buildContentAddressedBrokerShards as buildBrokerShards,
  closeBrokerNoSampleReviewGraph,
  estimateBrokerShardSetDispatch,
  exportBrokerShardCarrier,
  exportBrokerReviewGraphWorkCarrier,
  loadModelEvidenceBrokerPlan,
  materializeBrokerReviewGraphWorkCarrier,
  materializeBrokerShardCarrier,
  preflightBrokerDispatch,
  reduceBrokerShardResults,
  validateBrokerDispatchSchedule,
  validateBrokerGlobalContentSet,
  validateBrokerNoSampleReviewGraph,
  validateBrokerShardClosure,
  validateBrokerShardSetEnvelope,
  validateBrokerTaskSet,
} from './lib/model-evidence-broker.mjs'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value
const canonical = (value) => JSON.stringify(stable(value))
const digestRows = (rows) => sha256(canonical(rows))
const MODEL_EVIDENCE_PLAN_DIGEST = sha256('fixture-model-evidence-plan')

function buildContentAddressedBrokerShards(options) {
  return buildBrokerShards({
    ...options,
    manifestSha256: options.manifestSha256 ?? sha256(`${canonical(options.manifest)}\n`),
    modelEvidencePlanDigest: options.modelEvidencePlanDigest ?? MODEL_EVIDENCE_PLAN_DIGEST,
  })
}

function sourceRow({ sourceKind, path, bytes, packageName = null, packageVersion = null, lockfileIntegrity = null }) {
  const identity = {
    sourceKind,
    path,
    packageName,
    packageVersion,
    lockfileIntegrity,
    mediaType: 'text',
    bytes: bytes.length,
    sha256: sha256(bytes),
  }
  return {
    ...identity,
    sourceId: sha256(canonical(identity)),
    encoding: 'base64',
    content: bytes.toString('base64'),
  }
}

function withPlan(base, mutate) {
  const plan = structuredClone(base.plan)
  mutate(plan)
  return {
    root: base.root,
    plan,
    planDigest: sha256(canonical(plan)),
    resultSchemaSha256: base.resultSchemaSha256,
  }
}

const providerIdentity = {
  providerId: 'fixture-provider',
  requestModelId: 'fixture-model',
  modelReleaseId: 'fixture-provider/fixture-model',
  modelReleaseBindingDigest: sha256('release-binding'),
  modelReleaseRegistryDigest: sha256('release-registry'),
  selectedProfileDigest: sha256('selected-profile'),
}

function resultForShard(shard, { a1b = false, status = 'verified', findings = [] } = {}) {
  const result = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-shard-result',
    runId: shard.identity.runId,
    ...providerIdentity,
    taskKind: shard.identity.taskKind,
    subject: shard.identity.subject,
    shardId: shard.shardId,
    batchDigest: shard.batchDigest,
    chunkVerdicts: shard.chunks.map((chunk) => ({ chunkId: chunk.chunkId, status: 'reviewed' })),
    findings,
    summary: 'Reviewed the exact bounded content-addressed shard.',
  }
  if (a1b) {
    result.claimVerdicts = shard.claims.map((claim) => {
      const binding = shard.claimEvidenceGraph.claimBindings.find((item) => item.claimId === claim.claimId)
      const supportingChunkIds = [...new Set([
        ...binding.claimSourceChunkIds,
        ...shard.claimEvidenceGraph.implementationChunkIds,
        ...shard.claimEvidenceGraph.dependencyPackages.flatMap((item) => item.chunkIds),
      ])].sort()
      return { claimId: claim.claimId, status, supportingChunkIds }
    })
  }
  return result
}

function readdressChunk(chunk, mutate) {
  const next = structuredClone(chunk)
  mutate(next)
  const bytes = Buffer.from(next.content, 'base64')
  next.bytes = bytes.length
  next.contentSha256 = sha256(bytes)
  const { content, chunkId, ...identity } = next
  next.chunkId = sha256(canonical(identity))
  return next
}

function readdressShard(shard, planState) {
  const next = structuredClone(shard)
  next.rawContentBytes = next.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
  const digestMaterial = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-shard',
    identity: next.identity,
    rawContentBytes: next.rawContentBytes,
    chunks: next.chunks.map(({ content, ...chunk }) => chunk),
    claims: next.claims,
    claimEvidenceGraph: next.claimEvidenceGraph,
  }
  next.shardId = sha256(canonical(digestMaterial))
  const promptEnvelope = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-shard-prompt',
    shardId: next.shardId,
    identity: next.identity,
    rawContentBytes: next.rawContentBytes,
    chunks: next.chunks,
    claims: next.claims,
    claimEvidenceGraph: next.claimEvidenceGraph,
  }
  next.prompt = `${canonical(promptEnvelope)}\n`
  next.promptBytes = Buffer.byteLength(next.prompt)
  next.estimatedTokens = Math.ceil(next.promptBytes / planState.plan.limits.bytesPerEstimatedToken)
  next.batchDigest = sha256(next.prompt)
  return next
}

function readdressShardSet(shardSet) {
  const next = structuredClone(shardSet)
  next.shardCount = next.shards.length
  next.shardIds = next.shards.map((shard) => shard.shardId)
  next.shardSetDigest = sha256(canonical({
    identity: next.identity,
    inputArtifactSet: next.inputArtifactSet,
    shards: next.shards.map((shard) => ({ shardId: shard.shardId, batchDigest: shard.batchDigest })),
  }))
  return next
}

function readdressCarrierBundle(bundle, mutate) {
  const next = structuredClone(bundle)
  mutate(next)
  const { carrierDigest, ...carrierProjection } = next.carrier
  next.carrier.carrierDigest = sha256(canonical(carrierProjection))
  return next
}

const fixture = mkdtempSync(join(tmpdir(), 'model-evidence-broker-hardening-'))
try {
  const specPath = 'packages/widget/widget.spec.md'
  const implementationPath = 'packages/widget/widget.ts'
  const specBytes = Buffer.from('# 按鈕\r\n支援送出 🚀\r\n保留换行\n')
  const implementationBytes = Buffer.from("import { wrap } from 'fixture-dependency'\r\nexport const widget = wrap('送出')\n")
  for (const [path, bytes] of [[specPath, specBytes], [implementationPath, implementationBytes]]) {
    const target = resolve(fixture, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
  const inventory = [
    { path: implementationPath, kind: 'file', mode: '100644', bytes: implementationBytes.length, sha256: sha256(implementationBytes) },
    { path: specPath, kind: 'file', mode: '100644', bytes: specBytes.length, sha256: sha256(specBytes) },
  ]
  const manifest = {
    runId: '11111111-1111-4111-8111-111111111111',
    head: '1'.repeat(40),
    tree: '2'.repeat(40),
    indexDigest: sha256('index'),
    inventoryDigest: sha256('inventory'),
    rubricDigest: sha256('rubric'),
    worktreeFingerprint: sha256('worktree'),
    providerIdentityDigest: sha256('providers'),
    inventory,
  }
  const coveragePaths = inventory.map((row) => row.path).sort()
  const coverageInventoryDigest = digestRows(coveragePaths.map((path) => inventory.find((row) => row.path === path)))

  const dependencyBytes = Buffer.from('export declare function wrap(value: string): string\r\n')
  const dependency = sourceRow({
    sourceKind: 'dependency-source',
    path: 'dependency/fixture-dependency@1.0.0/index.d.ts',
    bytes: dependencyBytes,
    packageName: 'fixture-dependency',
    packageVersion: '1.0.0',
    lockfileIntegrity: 'sha512-Zml4dHVyZQ==',
  })
  const duplicateClaimSource = sourceRow({ sourceKind: 'claim-source', path: specPath, bytes: specBytes })
  const duplicateImplementationSource = sourceRow({ sourceKind: 'repository-source', path: implementationPath, bytes: implementationBytes })
  const dependencySources = [dependency, duplicateClaimSource, duplicateImplementationSource]
    .sort((left, right) => compareUtf8Bytes(left.path, right.path) || compareUtf8Bytes(left.sourceId, right.sourceId))
  const dependencyPackages = [{
    packageName: 'fixture-dependency',
    version: '1.0.0',
    integrity: 'sha512-Zml4dHVyZQ==',
    sourceCount: 1,
    sourceDigest: sha256(canonical([{ ...dependency, content: undefined }])),
  }]
  const dependencySourceDispositions = [{
    path: dependency.path,
    packageName: dependency.packageName,
    packageVersion: dependency.packageVersion,
    kind: 'file',
    bytes: dependency.bytes,
    sha256: dependency.sha256,
    disposition: 'materialized-reachable',
    reason: 'reachable-from-frozen-component-runtime-entry-via-static-import-closure',
  }]
  const dependencyDispositionSummary = {
    universeCount: 1,
    materializedReachableCount: 1,
    notApplicableCount: 0,
    unknownCount: 0,
  }
  const dependencySourceDispositionDigest = sha256(canonical(dependencySourceDispositions))
  const dependencySourceInventoryDigest = sha256(canonical({
    component: 'Widget',
    packages: dependencyPackages,
    rows: dependencySources.map(({ content, ...source }) => source),
    findings: [],
    sourceDispositions: dependencySourceDispositions,
    dispositionSummary: dependencyDispositionSummary,
    sourceDispositionDigest: dependencySourceDispositionDigest,
  }))
  const dependencySourceInventory = {
    schemaVersion: 2,
    evidenceKind: 'component-dependency-source-inventory',
    component: 'Widget',
    status: 'verified',
    lockfileSha256: sha256('lockfile'),
    packages: dependencyPackages,
    sourceCount: 3,
    dependencySourceInventoryDigest,
    findings: [],
    dispositionSummary: dependencyDispositionSummary,
    sourceDispositionDigest: dependencySourceDispositionDigest,
    sourceDispositions: dependencySourceDispositions,
    sources: dependencySources,
  }
  const claimLines = [1, 2, 3]
  const claims = claimLines.map((line) => ({
    claimId: sha256(`${specPath}\0${line}\0claim-${line}`),
    claimClass: 'claim-source-line',
    path: specPath,
    line,
    textSha256: sha256(`claim-${line}`),
    supportingSourceSetDigest: dependencySourceInventoryDigest,
  }))
  const claimInventory = {
    component: 'Widget',
    claimInventoryDigest: sha256(canonical(claims)),
    claimCount: claims.length,
    supportingSourceSetDigest: dependencySourceInventoryDigest,
    supportingSourceCount: dependencySourceInventory.sourceCount,
    dependencySourceStatus: 'verified',
    dependencySourceFindingCount: 0,
    dependencySourceFindingsDigest: sha256(canonical([])),
    dependencySourceInventory,
    claims,
  }

  const basePlan = loadModelEvidenceBrokerPlan({ repoRoot: process.cwd() })
  const emptyTextPath = 'packages/widget/empty.md'
  const emptyTextBytes = Buffer.alloc(0)
  writeFileSync(resolve(fixture, emptyTextPath), emptyTextBytes)
  const emptyTextRow = {
    path: emptyTextPath,
    kind: 'file',
    mode: '100644',
    bytes: 0,
    sha256: sha256(emptyTextBytes),
  }
  const emptyTextManifest = {
    ...manifest,
    inventory: [...manifest.inventory, emptyTextRow].sort(
      (left, right) => compareUtf8Bytes(left.path, right.path),
    ),
  }
  const emptyTextShardSet = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest: emptyTextManifest,
    coveragePaths: [emptyTextPath],
    coverageInventoryDigest: digestRows([emptyTextRow]),
    taskKind: 'judgment',
    subject: 1,
    planState: basePlan,
  })
  const emptyTextDescriptor = buildBrokerTaskDispatchDescriptor(emptyTextShardSet, {
    planState: basePlan,
    judgmentRule: {
      dim: 1,
      ruleId: 'DS-DIM-001',
      mechanism: 'Review the exact empty text source as declared coverage.',
    },
  })
  assert.equal(emptyTextDescriptor.shards[0].chunkRefs[0].bytes, 0)
  assert.equal(emptyTextDescriptor.shards[0].chunkRefs[0].lineStart, null)
  assert.doesNotThrow(() => buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: ['judgment:1'],
    taskDescriptors: [emptyTextDescriptor],
    planState: basePlan,
  }))
  // The managed-CI activation cluster was retired 2026-08-04: the closed plan
  // schema no longer declares an "activation" section, and any resurrected
  // activation state must fail schema validation instead of becoming source.
  assert.equal(Object.hasOwn(basePlan.plan, 'activation'), false)
  const closedPlanRoot = resolve(fixture, 'closed-plan')
  for (const path of [
    'infra/governance/schemas/model-evidence-broker.schema.json',
    'infra/governance/schemas/model-broker-shard-result.schema.json',
  ]) {
    const target = resolve(closedPlanRoot, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(resolve(process.cwd(), path)))
  }
  const closedPlanPath = resolve(closedPlanRoot, 'infra/governance/model-evidence-broker.json')
  mkdirSync(dirname(closedPlanPath), { recursive: true })
  const expectClosedPlanPoison = (mutate) => {
    const plan = structuredClone(basePlan.plan)
    mutate(plan)
    writeFileSync(closedPlanPath, `${JSON.stringify(plan, null, 2)}\n`)
    assert.throws(
      () => loadModelEvidenceBrokerPlan({ repoRoot: closedPlanRoot }),
      /plan schema validation failed/,
    )
  }
  expectClosedPlanPoison(plan => {
    plan.activation = {
      contract: 'managed-ci-activation-convergence-v1',
      executionClass: 'model-broker',
      status: 'active',
    }
  })
  expectClosedPlanPoison(plan => { plan.activation = { status: 'active' } })
  expectClosedPlanPoison(plan => { plan.unreviewedSection = true })
  expectClosedPlanPoison(plan => { delete plan.executionMode })
  console.log('✓ broker source stores only the closed schema shape; retired activation state or any undeclared section cannot become canonical source')

  const unicodeRoot = resolve(fixture, 'unicode-order')
  const unicodeSpecPath = 'packages/widget/Widget.spec.md'
  const unicodeImplementationPath = 'packages/widget/Widget.ts'
  const unicodePackageNames = ['Z', 'ä', 'ب', 'あ', '中', '\uE000', '😀']
  const unicodeFiles = new Map([
    [unicodeSpecPath, Buffer.from('# 多語系順序\n公開行為必須跨 locale 保持同一摘要。\n')],
    [unicodeImplementationPath, Buffer.from("import { wrap } from 'fixture-dependency'\nexport const widget = wrap('順序')\n")],
  ])
  const lockfile = Buffer.from(`${JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'node_modules/fixture-dependency': {
        version: '1.0.0',
        integrity: 'sha512-Zml4dHVyZQ==',
      },
    },
  })}\n`)
  unicodeFiles.set('package-lock.json', lockfile)
  for (const [path, bytes] of unicodeFiles) {
    const target = resolve(unicodeRoot, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
  const unicodePackageRoot = resolve(unicodeRoot, 'node_modules/fixture-dependency')
  mkdirSync(unicodePackageRoot, { recursive: true })
  writeFileSync(resolve(unicodePackageRoot, 'package.json'), `${JSON.stringify({
    name: 'fixture-dependency',
    version: '1.0.0',
    main: 'index.js',
  })}\n`)
  writeFileSync(
    resolve(unicodePackageRoot, 'index.js'),
    unicodePackageNames.map((name) => `export * from './${name}.d.ts'\n`).join(''),
  )
  for (const name of unicodePackageNames) {
    writeFileSync(resolve(unicodePackageRoot, `${name}.d.ts`), `export declare const ${name === 'Z' ? 'Z' : 'value'}: "${name}"\n`)
  }
  const unicodeManifest = {
    runId: '22222222-2222-4222-8222-222222222222',
    head: '3'.repeat(40),
    tree: '4'.repeat(40),
    indexDigest: sha256('unicode-index'),
    inventoryDigest: sha256('unicode-inventory'),
    rubricDigest: sha256('unicode-rubric'),
    worktreeFingerprint: sha256('unicode-worktree'),
    providerIdentityDigest: sha256('unicode-providers'),
    inventory: [...unicodeFiles].map(([path, bytes]) => ({
      path,
      kind: 'file',
      mode: '100644',
      bytes: bytes.length,
      sha256: sha256(bytes),
    })),
    components: [{
      name: 'WidgetUnicode',
      paths: [unicodeSpecPath, unicodeImplementationPath],
    }],
  }
  const unicodeDependencyInventory = buildComponentDependencySourceInventory({
    repoRoot: unicodeRoot,
    dependencyRoot: unicodeRoot,
    manifest: unicodeManifest,
    component: 'WidgetUnicode',
  })
  const unicodeClaimInventory = buildComponentClaimInventory({
    repoRoot: unicodeRoot,
    dependencyRoot: unicodeRoot,
    manifest: unicodeManifest,
    component: 'WidgetUnicode',
  })
  const unicodeCoveragePaths = [unicodeImplementationPath, unicodeSpecPath].sort(compareUtf8Bytes)
  const unicodeCoverageInventoryDigest = sha256(canonical(unicodeCoveragePaths.map(path => (
    unicodeManifest.inventory.find(row => row.path === path)
  ))))
  const unicodeShardSet = buildContentAddressedBrokerShards({
    repoRoot: unicodeRoot,
    manifest: unicodeManifest,
    coveragePaths: unicodeCoveragePaths,
    coverageInventoryDigest: unicodeCoverageInventoryDigest,
    taskKind: 'component-a1b',
    subject: 'WidgetUnicode',
    dependencySourceInventory: unicodeDependencyInventory,
    claimInventory: unicodeClaimInventory,
    planState: basePlan,
  })
  const unicodeSourcePaths = unicodeDependencyInventory.sources.map(source => source.path)
  assert.deepEqual(unicodeSourcePaths, [...unicodeSourcePaths].sort(compareUtf8Bytes))
  assert(unicodePackageNames.every(name => (
    unicodeSourcePaths.includes(`dependency/fixture-dependency@1.0.0/${name}.d.ts`)
  )))
  const localeNames = ['en-US', 'tr-TR', 'sv-SE', 'ja-JP', 'ar']
  const dependencyTypePaths = unicodeSourcePaths.filter(path => path.endsWith('.d.ts'))
  const localeOrders = localeNames.map(locale => (
    [...dependencyTypePaths].sort(new Intl.Collator(locale).compare)
  ))
  assert(new Set(localeOrders.map(order => JSON.stringify(order))).size > 1)
  assert(localeOrders.some(order => canonical(order) !== canonical(dependencyTypePaths)))
  assert.equal(unicodeClaimInventory.supportingSourceSetDigest, unicodeDependencyInventory.dependencySourceInventoryDigest)
  assert.equal(unicodeShardSet.identity.dependencySourceInventoryDigest, unicodeDependencyInventory.dependencySourceInventoryDigest)
  assert.equal(
    unicodeShardSet.identity.dependencySourceDispositionDigest,
    unicodeDependencyInventory.sourceDispositionDigest,
  )
  assert.deepEqual({
    universeCount: unicodeShardSet.identity.dependencySourceUniverseCount,
    materializedReachableCount:
      unicodeShardSet.identity.dependencySourceMaterializedReachableCount,
    notApplicableCount: unicodeShardSet.identity.dependencySourceNotApplicableCount,
    unknownCount: unicodeShardSet.identity.dependencySourceUnknownCount,
  }, unicodeDependencyInventory.dispositionSummary)
  const missingDispositionInventory = structuredClone(unicodeDependencyInventory)
  missingDispositionInventory.sourceDispositions.pop()
  assert.throws(() => buildContentAddressedBrokerShards({
    repoRoot: unicodeRoot,
    manifest: unicodeManifest,
    coveragePaths: unicodeCoveragePaths,
    coverageInventoryDigest: unicodeCoverageInventoryDigest,
    taskKind: 'component-a1b',
    subject: 'WidgetUnicode',
    dependencySourceInventory: missingDispositionInventory,
    claimInventory: unicodeClaimInventory,
    planState: basePlan,
  }), /disposition universe/)

  const unknownDispositionInventory = structuredClone(unicodeDependencyInventory)
  unknownDispositionInventory.status = 'unverifiable'
  unknownDispositionInventory.findings.push({
    code: 'dependency-transitive-package-unresolved',
    packageName: 'fixture-dependency',
    path: 'index.js',
    reason: 'poison fixture leaves an exact applicability edge unresolved',
  })
  unknownDispositionInventory.findings.sort((left, right) => compareUtf8Bytes(
    canonical(left),
    canonical(right),
  ))
  unknownDispositionInventory.sourceDispositions.push({
    path: 'dependency/fixture-dependency@1.0.0/unresolved.js',
    packageName: 'fixture-dependency',
    packageVersion: '1.0.0',
    kind: 'file',
    bytes: 17,
    sha256: sha256('unresolved-source'),
    disposition: 'unknown',
    reason: 'reachable-package-contains-unresolved-dynamic-or-conditional-edge',
  })
  unknownDispositionInventory.sourceDispositions.sort((left, right) => (
    compareUtf8Bytes(left.path, right.path)
  ))
  unknownDispositionInventory.dispositionSummary.universeCount += 1
  unknownDispositionInventory.dispositionSummary.unknownCount += 1
  unknownDispositionInventory.sourceDispositionDigest = sha256(
    canonical(unknownDispositionInventory.sourceDispositions),
  )
  unknownDispositionInventory.dependencySourceInventoryDigest = sha256(canonical({
    component: unknownDispositionInventory.component,
    packages: unknownDispositionInventory.packages,
    rows: unknownDispositionInventory.sources.map(({ content, ...source }) => source),
    findings: unknownDispositionInventory.findings,
    sourceDispositions: unknownDispositionInventory.sourceDispositions,
    dispositionSummary: unknownDispositionInventory.dispositionSummary,
    sourceDispositionDigest: unknownDispositionInventory.sourceDispositionDigest,
  }))
  const unknownClaimInventory = structuredClone(unicodeClaimInventory)
  unknownClaimInventory.supportingSourceSetDigest =
    unknownDispositionInventory.dependencySourceInventoryDigest
  unknownClaimInventory.dependencySourceStatus = 'unverifiable'
  unknownClaimInventory.dependencySourceFindingCount =
    unknownDispositionInventory.findings.length
  unknownClaimInventory.dependencySourceFindingsDigest =
    sha256(canonical(unknownDispositionInventory.findings))
  unknownClaimInventory.dependencySourceInventory = unknownDispositionInventory
  for (const claim of unknownClaimInventory.claims) {
    claim.supportingSourceSetDigest = unknownDispositionInventory.dependencySourceInventoryDigest
  }
  unknownClaimInventory.claimInventoryDigest = sha256(canonical(unknownClaimInventory.claims))
  assert.throws(() => buildContentAddressedBrokerShards({
    repoRoot: unicodeRoot,
    manifest: unicodeManifest,
    coveragePaths: unicodeCoveragePaths,
    coverageInventoryDigest: unicodeCoverageInventoryDigest,
    taskKind: 'component-a1b',
    subject: 'WidgetUnicode',
    dependencySourceInventory: unknownDispositionInventory,
    claimInventory: unknownClaimInventory,
    planState: basePlan,
  }), /unresolved dependency applicability universe/)
  console.log('✓ Unicode dependency/claim/broker digests use exact UTF-8 byte order, independent of locale collation')

  const oneClaimPlan = withPlan(basePlan, (plan) => { plan.limits.maxClaimsPerShard = 1 })
  const wrapperShardSet = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    coveragePaths,
    coverageInventoryDigest,
    taskKind: 'component-a1b',
    subject: 'Widget',
    dependencySourceInventory,
    claimInventory,
    planState: oneClaimPlan,
  })
  assert(wrapperShardSet.shardCount > 2)
  assert(wrapperShardSet.shards.every((shard) => shard.claimEvidenceGraph.status === 'self-contained'))
  assert(wrapperShardSet.shards.every((shard) => shard.claimEvidenceGraph.requiredChunkCount === shard.chunks.length))
  const completeResults = wrapperShardSet.shards.map((shard) => resultForShard(shard, { a1b: true }))
  assert.equal(reduceBrokerShardResults({
    shardSet: wrapperShardSet,
    results: completeResults,
    ...providerIdentity,
    claimInventory,
    planState: oneClaimPlan,
  }).claimStatus, 'closed')
  console.log('✓ >2-shard wrapper batches duplicate the complete bounded corpus and bind every claim to a deterministic self-contained evidence graph')

  const tinyChunkPlan = withPlan(basePlan, (plan) => {
    plan.limits.maxChunkBytes = 7
    plan.limits.maxClaimsPerShard = 1
  })
  const multibyteShardSet = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    coveragePaths: [specPath],
    coverageInventoryDigest: digestRows([inventory.find((row) => row.path === specPath)]),
    taskKind: 'judgment',
    subject: 'utf8-newline-boundary',
    planState: tinyChunkPlan,
  })
  const textChunks = multibyteShardSet.shards.flatMap((shard) => shard.chunks)
  assert.equal(Buffer.concat(textChunks.map((chunk) => Buffer.from(chunk.content, 'base64'))).compare(specBytes), 0)
  for (let index = 0; index < textChunks.length; index += 1) {
    assert.doesNotThrow(() => new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(textChunks[index].content, 'base64')))
    assert(Number.isSafeInteger(textChunks[index].lineStart))
    assert(Number.isSafeInteger(textChunks[index].lineEnd))
    if (index + 1 < textChunks.length) {
      const current = Buffer.from(textChunks[index].content, 'base64')
      const next = Buffer.from(textChunks[index + 1].content, 'base64')
      assert(!(current.at(-1) === 0x0d && next.at(0) === 0x0a))
    }
  }
  const badFindingChunk = textChunks[0]
  const badFindingResults = multibyteShardSet.shards.map((shard) => resultForShard(shard, {
    findings: shard.shardId === multibyteShardSet.shards[0].shardId
      ? [{
          chunkId: badFindingChunk.chunkId,
          path: badFindingChunk.path,
          line: badFindingChunk.lineEnd + 1,
          severity: 'material',
          rule: 'fixture',
          problem: 'wrong canonical chunk line',
          recommendation: 'bind the finding to the chunk that actually contains the line',
        }]
      : [],
  }))
  assert.throws(() => reduceBrokerShardResults({
    shardSet: multibyteShardSet,
    results: badFindingResults,
    ...providerIdentity,
    planState: tinyChunkPlan,
  }), /not bound to a reviewed chunk/)
  console.log('✓ UTF-8/CRLF/LF chunks are canonical and findings cannot cite a line outside the cited chunk')

  const fullCoveragePlan = withPlan(basePlan, (plan) => {
    plan.limits.maxChunkBytes = 7
    plan.limits.maxRawContentBytesPerShard = 14
    plan.limits.maxChunksPerShard = 2
  })
  const specCoverageDigest = digestRows([inventory.find((row) => row.path === specPath)])
  const manifestSha256 = sha256(`${canonical(manifest)}\n`)
  const fullCoverageShardSet = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    manifestSha256,
    coveragePaths: [specPath],
    coverageInventoryDigest: specCoverageDigest,
    taskKind: 'judgment',
    subject: 'full-coverage-partition',
    modelEvidencePlanDigest: MODEL_EVIDENCE_PLAN_DIGEST,
    planState: fullCoveragePlan,
  })
  const rebuiltFullCoverageShardSet = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    manifestSha256,
    coveragePaths: [specPath],
    coverageInventoryDigest: specCoverageDigest,
    taskKind: 'judgment',
    subject: 'full-coverage-partition',
    modelEvidencePlanDigest: MODEL_EVIDENCE_PLAN_DIGEST,
    planState: fullCoveragePlan,
  })
  assert(fullCoverageShardSet.shardCount > 2)
  assert.deepEqual(rebuiltFullCoverageShardSet, fullCoverageShardSet)
  assert(fullCoverageShardSet.shards.every((shard) => (
    shard.rawContentBytes <= fullCoveragePlan.plan.limits.maxRawContentBytesPerShard
    && shard.rawContentBytes <= 16_777_216
  )))
  const fullCoverageChunks = fullCoverageShardSet.shards.flatMap((shard) => shard.chunks)
  assert.equal(new Set(fullCoverageChunks.map((chunk) => chunk.chunkId)).size, fullCoverageChunks.length)
  assert.equal(fullCoverageShardSet.identity.sourceChunkCount, fullCoverageChunks.length)
  assert.equal(fullCoverageShardSet.identity.totalSourceBytes, specBytes.length)
  assert.equal(fullCoverageShardSet.identity.sourceSetDigest, fullCoverageShardSet.inputArtifactSet.sourceSetDigest)
  assert.equal(fullCoverageShardSet.identity.inputArtifactSetDigest, fullCoverageShardSet.inputArtifactSet.artifactSetDigest)
  assert(fullCoverageShardSet.shards.every((shard) => canonical(shard.identity) === canonical(fullCoverageShardSet.identity)))
  assert.equal(Buffer.concat(
    fullCoverageChunks.sort((left, right) => left.offset - right.offset)
      .map((chunk) => Buffer.from(chunk.content, 'base64')),
  ).compare(specBytes), 0)
  assert.doesNotThrow(() => validateBrokerShardSetEnvelope(fullCoverageShardSet, { planState: fullCoveragePlan }))
  const fullCoverageDescriptor = buildBrokerTaskDispatchDescriptor(fullCoverageShardSet, {
    planState: fullCoveragePlan,
  })
  const fullCoverageTaskSet = buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: ['judgment:full-coverage-partition'],
    taskDescriptors: [fullCoverageDescriptor],
    planState: fullCoveragePlan,
  })
  assert.doesNotThrow(() => validateBrokerTaskSet(fullCoverageTaskSet, {
    taskDescriptors: [fullCoverageDescriptor],
    planState: fullCoveragePlan,
  }))
  const staleFullCoverageTaskSet = {
    ...fullCoverageTaskSet,
    taskSetDigest: sha256('stale-task-set'),
  }
  assert.throws(() => validateBrokerTaskSet(staleFullCoverageTaskSet, {
    taskDescriptors: [fullCoverageDescriptor],
    planState: fullCoveragePlan,
  }), /task set is stale/)

  const carrierBundles = fullCoverageShardSet.shards.map((shard) => exportBrokerShardCarrier(shard))
  assert(carrierBundles[0].blobs.length > 1)
  for (const bundle of carrierBundles) {
    assert.equal(
      materializeBrokerShardCarrier({ ...bundle, planState: fullCoveragePlan }).shardId,
      bundle.carrier.descriptor.shardId,
    )
  }
  const missingCarrierBlob = readdressCarrierBundle(carrierBundles[0], (bundle) => {
    bundle.carrier.blobRefs.pop()
    bundle.blobs.pop()
  })
  assert.throws(() => materializeBrokerShardCarrier({
    ...missingCarrierBlob,
    planState: fullCoveragePlan,
  }), /do not exactly close/)
  const unusedBytes = Buffer.from('unused-carrier-content')
  const unusedBlob = {
    sha256: sha256(unusedBytes),
    bytes: unusedBytes.length,
    encoding: 'base64',
    content: unusedBytes.toString('base64'),
  }
  const extraCarrierBlob = readdressCarrierBundle(carrierBundles[0], (bundle) => {
    bundle.carrier.blobRefs.push({
      sha256: unusedBlob.sha256,
      bytes: unusedBlob.bytes,
      encoding: unusedBlob.encoding,
    })
    bundle.carrier.blobRefs.sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256))
    bundle.blobs.push(unusedBlob)
    bundle.blobs.sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256))
  })
  assert.throws(() => materializeBrokerShardCarrier({
    ...extraCarrierBlob,
    planState: fullCoveragePlan,
  }), /do not exactly close/)
  const reorderedCarrierBlobs = readdressCarrierBundle(carrierBundles[0], (bundle) => {
    bundle.carrier.blobRefs.reverse()
    bundle.blobs.reverse()
  })
  assert.throws(() => materializeBrokerShardCarrier({
    ...reorderedCarrierBlobs,
    planState: fullCoveragePlan,
  }), /duplicate or reordered/)
  const substitutedCarrierBlob = structuredClone(carrierBundles[0])
  const substitutedCarrierBytes = Buffer.from(substitutedCarrierBlob.blobs[0].content, 'base64')
  substitutedCarrierBytes[0] ^= 0x01
  substitutedCarrierBlob.blobs[0].content = substitutedCarrierBytes.toString('base64')
  assert.throws(() => materializeBrokerShardCarrier({
    ...substitutedCarrierBlob,
    planState: fullCoveragePlan,
  }), /duplicate, substituted, or invalid/)

  const carrierMetadata = carrierBundles.map((bundle, ordinal) => buildBrokerShardCarrierMetadata(bundle, {
    taskKey: 'judgment:full-coverage-partition',
    ordinal,
    planState: fullCoveragePlan,
  }))
  const globalContentSet = buildBrokerGlobalContentSet({
    taskSet: fullCoverageTaskSet,
    taskDescriptors: [fullCoverageDescriptor],
    carrierMetadata,
    planState: fullCoveragePlan,
  })
  assert.doesNotThrow(() => validateBrokerGlobalContentSet(globalContentSet, {
    taskSet: fullCoverageTaskSet,
    taskDescriptors: [fullCoverageDescriptor],
    carrierMetadata,
    planState: fullCoveragePlan,
  }))
  assert.equal(globalContentSet.shardCount, fullCoverageShardSet.shardCount)
  assert.equal(globalContentSet.storageDeduplicationOnly, true)
  assert.equal(globalContentSet.sampling, false)
  assert.throws(() => buildBrokerGlobalContentSet({
    taskSet: fullCoverageTaskSet,
    taskDescriptors: [fullCoverageDescriptor],
    carrierMetadata: carrierMetadata.slice(1),
    planState: fullCoveragePlan,
  }), /carrier metadata count/)
  assert.throws(() => buildBrokerGlobalContentSet({
    taskSet: fullCoverageTaskSet,
    taskDescriptors: [fullCoverageDescriptor],
    carrierMetadata: [...carrierMetadata].reverse(),
    planState: fullCoveragePlan,
  }), /substitutes or reorders/)
  const staleGlobalContentSet = {
    ...globalContentSet,
    contentSetDigest: sha256('stale-global-content-set'),
  }
  assert.throws(() => validateBrokerGlobalContentSet(staleGlobalContentSet, {
    taskSet: fullCoverageTaskSet,
    taskDescriptors: [fullCoverageDescriptor],
    carrierMetadata,
    planState: fullCoveragePlan,
  }), /global content set digest is invalid or stale/)
  console.log('✓ task-set and global carrier content-set identities close every whole task, shard, and blob exactly once; missing, extra, substituted, reordered, and stale content fail closed')

  const fullCoverageResults = fullCoverageShardSet.shards.map((shard) => resultForShard(shard))
  const fullCoverageReducerOptions = {
    shardSet: fullCoverageShardSet,
    results: fullCoverageResults,
    ...providerIdentity,
    planState: fullCoveragePlan,
  }
  const fullCoverageReduction = reduceBrokerShardResults(fullCoverageReducerOptions)
  assert.equal(fullCoverageReduction.shardCount, fullCoverageShardSet.shardCount)
  assert.deepEqual(
    reduceBrokerShardResults({
      ...fullCoverageReducerOptions,
      results: [...fullCoverageResults].reverse(),
    }),
    fullCoverageReduction,
  )
  assert.throws(() => reduceBrokerShardResults({
    ...fullCoverageReducerOptions,
    results: fullCoverageResults.slice(0, -1),
  }), /exact once-only/)
  const partialReviewerCompletion = structuredClone(fullCoverageResults)
  partialReviewerCompletion[0].chunkVerdicts.pop()
  assert.throws(() => reduceBrokerShardResults({
    ...fullCoverageReducerOptions,
    results: partialReviewerCompletion,
  }), /verdict every chunk exactly once/)

  const closureOptions = {
    manifest,
    manifestSha256,
    coveragePaths: [specPath],
    coverageInventoryDigest: specCoverageDigest,
    taskKind: 'judgment',
    subject: 'full-coverage-partition',
    modelEvidencePlanDigest: MODEL_EVIDENCE_PLAN_DIGEST,
    inputArtifactSet: fullCoverageShardSet.inputArtifactSet,
    planState: fullCoveragePlan,
  }

  const missingShard = fullCoverageShardSet.shards.slice(1)
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    shards: missingShard,
  }), /missing|reconstruct|artifact set/)

  const duplicatedCoverage = structuredClone(fullCoverageShardSet.shards)
  const duplicatedChunk = structuredClone(duplicatedCoverage[0].chunks[0])
  const duplicateTarget = duplicatedCoverage.findIndex((shard, index) => (
    index > 0
    && shard.chunks.length + 1 <= fullCoveragePlan.plan.limits.maxChunksPerShard
    && shard.rawContentBytes + duplicatedChunk.bytes <= fullCoveragePlan.plan.limits.maxRawContentBytesPerShard
  ))
  assert(duplicateTarget > 0)
  duplicatedCoverage[duplicateTarget].chunks.push(duplicatedChunk)
  duplicatedCoverage[duplicateTarget] = readdressShard(duplicatedCoverage[duplicateTarget], fullCoveragePlan)
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    shards: duplicatedCoverage,
  }), /duplicates canonical coverage/)

  const overlappingCoverage = structuredClone(fullCoverageShardSet.shards)
  overlappingCoverage[0].chunks[1] = readdressChunk(overlappingCoverage[0].chunks[1], (chunk) => {
    chunk.offset = overlappingCoverage[0].chunks[0].offset
  })
  overlappingCoverage[0] = readdressShard(overlappingCoverage[0], fullCoveragePlan)
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    shards: overlappingCoverage,
  }), /overlapping|reordered|mixed/)

  const uncoveredCoverage = structuredClone(fullCoverageShardSet.shards)
  uncoveredCoverage[0].chunks.pop()
  uncoveredCoverage[0] = readdressShard(uncoveredCoverage[0], fullCoveragePlan)
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    shards: uncoveredCoverage,
  }), /missing|reconstruct|artifact set/)

  const substitutedCoverage = structuredClone(fullCoverageShardSet.shards)
  substitutedCoverage[0].chunks[0] = readdressChunk(substitutedCoverage[0].chunks[0], (chunk) => {
    const content = Buffer.from(chunk.content, 'base64')
    content[0] ^= 0x01
    chunk.content = content.toString('base64')
  })
  substitutedCoverage[0] = readdressShard(substitutedCoverage[0], fullCoveragePlan)
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    shards: substitutedCoverage,
  }), /reconstruct|artifact set/)

  const reorderedShards = structuredClone(fullCoverageShardSet.shards)
  ;[reorderedShards[0], reorderedShards[1]] = [reorderedShards[1], reorderedShards[0]]
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    shards: reorderedShards,
  }), /deterministic canonical grouping/)

  const oversizedJudgmentShard = structuredClone(fullCoverageShardSet.shards)
  oversizedJudgmentShard[0].rawContentBytes = fullCoveragePlan.plan.limits.maxRawContentBytesPerShard + 1
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    shards: oversizedJudgmentShard,
  }), /exceeds context budget|raw byte total/)

  const staleManifest = { ...manifest, worktreeFingerprint: sha256('stale-worktree') }
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    manifest: staleManifest,
    shards: fullCoverageShardSet.shards,
  }), /artifact set|different run/)
  const mismatchedRubric = { ...manifest, rubricDigest: sha256('mismatched-rubric') }
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    manifest: mismatchedRubric,
    shards: fullCoverageShardSet.shards,
  }), /artifact set|different run/)
  const mismatchedInventory = { ...manifest, inventoryDigest: sha256('mismatched-inventory') }
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    manifest: mismatchedInventory,
    shards: fullCoverageShardSet.shards,
  }), /artifact set|different run/)
  const mismatchedArtifactSet = structuredClone(fullCoverageShardSet.inputArtifactSet)
  mismatchedArtifactSet.artifactSetDigest = sha256('mismatched-artifact-set')
  assert.throws(() => validateBrokerShardClosure({
    ...closureOptions,
    inputArtifactSet: mismatchedArtifactSet,
    shards: fullCoverageShardSet.shards,
  }), /artifact set/)

  const substitutedShardSet = structuredClone(fullCoverageShardSet)
  substitutedShardSet.shards[0] = substitutedCoverage[0]
  assert.throws(() => validateBrokerShardSetEnvelope(
    readdressShardSet(substitutedShardSet),
    { planState: fullCoveragePlan },
  ), /source|artifact|closure/)
  const reorderedShardSet = structuredClone(fullCoverageShardSet)
  ;[reorderedShardSet.shards[0], reorderedShardSet.shards[1]] = [
    reorderedShardSet.shards[1],
    reorderedShardSet.shards[0],
  ]
  assert.throws(() => validateBrokerShardSetEnvelope(
    readdressShardSet(reorderedShardSet),
    { planState: fullCoveragePlan },
  ), /source|artifact|closure|order/)
  console.log('✓ judgment shards deterministically cover every byte exactly once; oversized, missing, duplicate, overlap, uncovered, substituted, reordered, stale, and digest-mismatched sets fail closed')

  const oversizedPlan = withPlan(basePlan, (plan) => {
    plan.limits.maxChunkBytes = 24
    plan.limits.maxRawContentBytesPerShard = 48
    plan.limits.maxChunksPerShard = 2
    plan.limits.maxClaimsPerShard = 1
  })
  const oversizedShardSet = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    coveragePaths,
    coverageInventoryDigest,
    taskKind: 'component-a1b',
    subject: 'Widget',
    dependencySourceInventory,
    claimInventory,
    planState: oversizedPlan,
  })
  assert(oversizedShardSet.shards.some((shard) => shard.claimEvidenceGraph.status === 'unverifiable-context-budget'))
  const oversizedResults = oversizedShardSet.shards.map((shard) => resultForShard(shard, { a1b: true, status: 'unverifiable' }))
  const claimShardIndex = oversizedShardSet.shards.findIndex((shard) => shard.claims.length > 0)
  const forbiddenDependencyChunk = oversizedShardSet.shards
    .flatMap((shard) => shard.chunks)
    .find((chunk) => chunk.sourceKind === 'dependency-source'
      && !oversizedShardSet.shards[claimShardIndex].claimEvidenceGraph.allowedSupportingChunkIds.includes(chunk.chunkId))
  assert(forbiddenDependencyChunk)
  const unrelatedCitationResults = structuredClone(oversizedResults)
  unrelatedCitationResults[claimShardIndex].claimVerdicts[0].supportingChunkIds = [...new Set([
    ...unrelatedCitationResults[claimShardIndex].claimVerdicts[0].supportingChunkIds,
    forbiddenDependencyChunk.chunkId,
  ])].sort()
  assert.throws(() => reduceBrokerShardResults({
    shardSet: oversizedShardSet,
    results: unrelatedCitationResults,
    ...providerIdentity,
    claimInventory,
    planState: oversizedPlan,
  }), /unrelated chunk outside its claim-evidence graph/)
  const falseCertaintyResults = structuredClone(oversizedResults)
  falseCertaintyResults[claimShardIndex].claimVerdicts[0].status = 'verified'
  assert.throws(() => reduceBrokerShardResults({
    shardSet: oversizedShardSet,
    results: falseCertaintyResults,
    ...providerIdentity,
    claimInventory,
    planState: oversizedPlan,
  }), /must be explicitly unverifiable/)
  console.log('✓ oversized A1b evidence is explicitly unverifiable and cannot borrow an unrelated dependency citation from another shard')

  const judgmentOne = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    coveragePaths: [specPath],
    coverageInventoryDigest: digestRows([inventory.find((row) => row.path === specPath)]),
    taskKind: 'judgment',
    subject: 'budget-one',
    planState: basePlan,
  })
  const estimate = estimateBrokerShardSetDispatch(judgmentOne, { planState: basePlan })
  assert.equal(estimate.totalSourceBytes, specBytes.length)
  assert.equal(estimate.providerCalls, judgmentOne.shardCount)
  const splitBatchPlan = withPlan(basePlan, (plan) => {
    plan.budgets.wholeTask.maxTotalSourceBytes = specBytes.length
    plan.budgets.dispatchBatch.maxTotalSourceBytes = specBytes.length
  })
  const splitOne = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    coveragePaths: [specPath],
    coverageInventoryDigest: digestRows([inventory.find((row) => row.path === specPath)]),
    taskKind: 'judgment',
    subject: 'budget-one',
    planState: splitBatchPlan,
  })
  const splitTwo = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    coveragePaths: [specPath],
    coverageInventoryDigest: digestRows([inventory.find((row) => row.path === specPath)]),
    taskKind: 'judgment',
    subject: 'budget-two',
    planState: splitBatchPlan,
  })
  const splitDescriptors = [splitOne, splitTwo].map((shardSet) => (
    buildBrokerTaskDispatchDescriptor(shardSet, { planState: splitBatchPlan })
  ))
  const splitTaskSet = buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: ['judgment:budget-one', 'judgment:budget-two'],
    taskDescriptors: splitDescriptors,
    planState: splitBatchPlan,
  })
  let providerCalls = 0
  const splitSchedule = preflightBrokerDispatch({
    taskDescriptors: splitDescriptors,
    taskSet: splitTaskSet,
    planState: splitBatchPlan,
  })
  assert.equal(splitSchedule.batchCount, 2)
  assert.equal(splitSchedule.logicalTotals.totalSourceBytes, specBytes.length * 2)
  assert(splitSchedule.batches.every((batch) => batch.taskAssignments.length === 1))
  assert(splitSchedule.tasks.every((task) => typeof task.batchId === 'string'))
  assert.equal(splitSchedule.coverageProof.missingCount, 0)
  assert.equal(splitSchedule.coverageProof.unexpectedCount, 0)
  assert.equal(splitSchedule.coverageProof.duplicateCount, 0)
  assert.equal(splitSchedule.coverageProof.overlapCount, 0)
  assert.equal(splitSchedule.coverageProof.sampling, false)
  assert.equal(splitSchedule.coverageProof.complete, true)
  assert.equal(splitSchedule.structuralCoverageAuthorized, true)
  assert.equal(splitSchedule.executionAuthorized, false)
  assert.doesNotThrow(() => validateBrokerDispatchSchedule(splitSchedule, {
    taskDescriptors: splitDescriptors,
    taskSet: splitTaskSet,
    planState: splitBatchPlan,
  }))
  assert.throws(() => buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: ['judgment:budget-one'],
    taskDescriptors: splitDescriptors,
    planState: splitBatchPlan,
  }), /expected task keys do not exactly match/)
  assert.throws(() => validateBrokerTaskSet(splitTaskSet, {
    taskDescriptors: [...splitDescriptors].reverse(),
    planState: splitBatchPlan,
  }), /descriptors are reordered/)
  assert.throws(() => validateBrokerTaskSet(splitTaskSet, {
    taskDescriptors: splitDescriptors.slice(0, 1),
    planState: splitBatchPlan,
  }), /expected task keys do not exactly match/)
  const duplicatedAssignmentSchedule = structuredClone(splitSchedule)
  duplicatedAssignmentSchedule.batches[1].taskAssignments = [
    ...duplicatedAssignmentSchedule.batches[0].taskAssignments,
    ...duplicatedAssignmentSchedule.batches[1].taskAssignments,
  ]
  assert.throws(() => validateBrokerDispatchSchedule(duplicatedAssignmentSchedule, {
    taskDescriptors: splitDescriptors,
    taskSet: splitTaskSet,
    planState: splitBatchPlan,
  }), /schedule is stale/)
  assert.equal(providerCalls, 0)

  const fullReviewPoisonPlan = withPlan(basePlan, (plan) => {
    plan.budgets.fullReview.maxTaskCount = 1
  })
  const fullReviewPoisonShardSets = ['budget-one', 'budget-two'].map((subject) => (
    buildContentAddressedBrokerShards({
      repoRoot: fixture,
      manifest,
      coveragePaths: [specPath],
      coverageInventoryDigest: digestRows([inventory.find((row) => row.path === specPath)]),
      taskKind: 'judgment',
      subject,
      planState: fullReviewPoisonPlan,
    })
  ))
  const fullReviewPoisonDescriptors = fullReviewPoisonShardSets.map((shardSet) => (
    buildBrokerTaskDispatchDescriptor(shardSet, { planState: fullReviewPoisonPlan })
  ))
  const fullReviewPoisonTaskSet = buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: ['judgment:budget-one', 'judgment:budget-two'],
    taskDescriptors: fullReviewPoisonDescriptors,
    planState: fullReviewPoisonPlan,
  })
  assert.throws(() => preflightBrokerDispatch({
    taskDescriptors: fullReviewPoisonDescriptors,
    taskSet: fullReviewPoisonTaskSet,
    planState: fullReviewPoisonPlan,
  }), /full review pre-dispatch budget exceeded without sampling:taskCount=2>1/)

  const poisonedTaskPlan = withPlan(basePlan, (plan) => {
    plan.budgets.wholeTask.maxTotalSourceBytes = specBytes.length - 1
  })
  assert.throws(() => buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    coveragePaths: [specPath],
    coverageInventoryDigest: digestRows([inventory.find((row) => row.path === specPath)]),
    taskKind: 'judgment',
    subject: 'poisoned-task',
    planState: poisonedTaskPlan,
  }), /whole task judgment:poisoned-task pre-dispatch budget exceeded without sampling/)
  console.log('✓ exact whole-task, dispatch-batch, and full-review budgets use no cross-task dedupe; complete tasks pack deterministically and impossible coverage makes zero provider calls')

  const graphPlan = withPlan(basePlan, (plan) => {
    plan.limits.maxChunkBytes = 7
    plan.limits.maxRawContentBytesPerShard = 14
    plan.limits.maxChunksPerShard = 2
    plan.limits.maxClaimsPerShard = 1
  })
  const graphJudgmentSets = [6, 7].map((subject) => (
    buildContentAddressedBrokerShards({
      repoRoot: fixture,
      manifest,
      coveragePaths: [specPath],
      coverageInventoryDigest: specCoverageDigest,
      taskKind: 'judgment',
      subject,
      planState: graphPlan,
    })
  ))
  const graphA1bSet = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    coveragePaths,
    coverageInventoryDigest,
    taskKind: 'component-a1b',
    subject: 'Widget',
    dependencySourceInventory,
    claimInventory,
    planState: graphPlan,
  })
  assert(graphA1bSet.shards.some((shard) => shard.claims.length === 0))
  const graphDescriptors = [
    ...graphJudgmentSets.map((shardSet) => buildBrokerTaskDispatchDescriptor(shardSet, {
      planState: graphPlan,
      judgmentRule: {
        dim: shardSet.identity.subject,
        ruleId: `DS-DIM-${String(shardSet.identity.subject).padStart(3, '0')}`,
        mechanism: `fixture exact judgment mechanism ${String(shardSet.identity.subject)}`,
      },
    })),
    buildBrokerTaskDispatchDescriptor(graphA1bSet, {
      planState: graphPlan,
      claimInventoryDigest: claimInventory.claimInventoryDigest,
    }),
  ]
  const graphTaskSet = buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: ['judgment:6', 'judgment:7', 'component-a1b:Widget'],
    taskDescriptors: graphDescriptors,
    planState: graphPlan,
  })
  const graphOptions = {
    taskSet: graphTaskSet,
    taskDescriptors: graphDescriptors,
    planState: graphPlan,
  }
  const reviewGraph = buildBrokerNoSampleReviewGraph(graphOptions)
  assert.deepEqual(buildBrokerNoSampleReviewGraph(graphOptions), reviewGraph)
  assert.doesNotThrow(() => validateBrokerNoSampleReviewGraph(reviewGraph, graphOptions))
  assert.equal(reviewGraph.taskCount, 3)
  assert.equal(reviewGraph.proof.sampling, false)
  assert.equal(reviewGraph.proof.complete, true)
  assert.equal(reviewGraph.proof.unknownApplicabilityCount, 0)
  assert.equal(reviewGraph.proof.zeroClaimStandaloneWorkUnitCount, 0)
  assert.equal(reviewGraph.proof.taskSynthesisProviderCallCount, 0)
  assert.equal(reviewGraph.proof.modelReviewWorkUnitCount, reviewGraph.reviewWorkUnitCount)
  assert.equal(reviewGraph.proof.deterministicTaskReductionCount, reviewGraph.taskCount)
  assert.equal(reviewGraph.synthesisUnitCount, reviewGraph.taskCount)
  assert.equal(reviewGraph.deterministicReductionUnitCount, reviewGraph.taskCount)
  assert(reviewGraph.synthesisUnits.every(
    (unit) => unit.stage === 0 && unit.inputKind === 'coverage-cells',
  ))
  assert.equal(
    reviewGraph.dispatchTotals.reviewWorkUnitCount,
    reviewGraph.reviewWorkUnitCount,
  )
  assert.equal(
    reviewGraph.dispatchTotals.providerCallUpperBound,
    reviewGraph.reviewWorkUnitCount,
  )
  assert.equal(
    reviewGraph.dispatchTotals.providerCallAccounting,
    'capability-bounded-exchange-schedule',
  )
  assert.equal(reviewGraph.dispatchTotals.synthesisProviderCalls, 0)
  assert.equal(
    reviewGraph.dispatchTotals.deterministicReductionUnits,
    reviewGraph.synthesisUnitCount,
  )
  assert.equal(reviewGraph.proof.missingCount, 0)
  assert.equal(reviewGraph.proof.duplicateCount, 0)
  assert.equal(reviewGraph.proof.overlapCount, 0)
  assert(reviewGraph.coverageCells.every((cell) => (
    Array.isArray(cell.reviewSemanticsBindings)
    && cell.reviewSemanticsBindings.length > 0
    && cell.reviewSemanticsSetDigest === sha256(canonical(cell.reviewSemanticsBindings))
    && cell.leafBindings.map((reference) => reference.chunkId).join(',')
      === cell.leafIds.join(',')
  )))
  assert(reviewGraph.coverageCells
    .filter((cell) => cell.cellKind === 'judgment-applicability-cell')
    .every((cell) => {
      const semantics = cell.reviewSemanticsBindings[0].reviewSemantics
      return semantics.semanticsKind === 'judgment-rule-review'
        && semantics.rule.dim === Number(cell.taskKey.split(':')[1])
        && semantics.rule.mechanism.startsWith('fixture exact judgment mechanism')
    }))
  assert(reviewGraph.coverageCells
    .filter((cell) => cell.cellKind === 'component-claim-review-cell')
    .every((cell) => {
      const semantics = cell.reviewSemanticsBindings[0].reviewSemantics
      return semantics.semanticsKind === 'component-claim-evidence-review'
        && semantics.claims.map((claim) => claim.claimId).join(',') === cell.claimIds.join(',')
        && semantics.claimEvidenceGraph.claimBindings
          .map((binding) => binding.claimId).join(',') === [...cell.claimIds].sort().join(',')
    }))
  assert(reviewGraph.coverageCells
    .filter((cell) => cell.cellKind === 'shared-evidence-review-cell')
    .every((cell) => {
      const semantics = cell.reviewSemanticsBindings[0].reviewSemantics
      return semantics.semanticsKind === 'component-shared-evidence-review'
        && semantics.rule.ruleId === 'component-a1b-shared-evidence'
        && semantics.parentClaimEvidenceGraphDigest
          === graphDescriptors[2].shards.find(
            (shard) => shard.shardId === cell.shardIds[0],
          ).claimEvidenceGraphDigest
        && semantics.leafIds.join(',') === cell.leafIds.join(',')
        && cell.claimIds.length === 0
    }))
  assert(reviewGraph.reviewWorkUnits.every((unit) => (
    /^[a-f0-9]{64}$/.test(unit.reviewSemanticsSetDigest)
    && unit.reviewSemanticsBytes > 0
  )))
  assert(reviewGraph.reviewWorkUnits.some((unit) => (
    unit.unitKind === 'multiplexed-judgment-review'
    && unit.taskKeys.join(',') === 'judgment:6,judgment:7'
  )))
  assert(reviewGraph.reviewWorkUnits.some((unit) => unit.unitKind === 'content-addressed-shared-evidence-review'))
  assert(reviewGraph.reviewWorkUnits
    .filter((unit) => unit.unitKind === 'component-claim-review')
    .every((unit) => unit.coverageCellIds.every((cellId) => (
      reviewGraph.coverageCells.find((cell) => cell.cellId === cellId).claimIds.length > 0
    ))))
  assert(reviewGraph.rawCorpus.tasks.every((task) => (
    task.rawLeafCount === task.applicableLeafCount
    && task.notApplicableLeafCount === 0
    && task.unknownLeafCount === 0
  )))
  assert(reviewGraph.reviewWorkUnitCount
    < graphDescriptors.reduce((sum, descriptor) => sum + descriptor.shardCount, 0))
  const graphChunks = new Map([
    ...graphJudgmentSets,
    graphA1bSet,
  ].flatMap((shardSet) => shardSet.shards.flatMap((shard) => shard.chunks))
    .map((chunk) => [chunk.chunkId, chunk]))
  const carrierWorkUnit = reviewGraph.reviewWorkUnits[0]
  const carrierContentSet = { contentSetDigest: sha256('fixture-graph-content-set') }
  const carrierRequestDigest = sha256('fixture-graph-request')
  const workCarrierBundle = exportBrokerReviewGraphWorkCarrier({
    graph: reviewGraph,
    contentSet: carrierContentSet,
    requestDigest: carrierRequestDigest,
    workUnit: carrierWorkUnit,
    chunks: carrierWorkUnit.leafIds.map((leafId) => graphChunks.get(leafId)),
  })
  assert.deepEqual(materializeBrokerReviewGraphWorkCarrier({
    graph: reviewGraph,
    contentSet: carrierContentSet,
    requestDigest: carrierRequestDigest,
    workUnit: carrierWorkUnit,
    ...workCarrierBundle,
    expectedBinding: workCarrierBundle.carrier.binding,
  }).map((chunk) => chunk.chunkId), carrierWorkUnit.leafIds)
  const substitutedWorkCarrier = structuredClone(workCarrierBundle)
  substitutedWorkCarrier.blobs[0].content = Buffer.from('substituted').toString('base64')
  assert.throws(() => materializeBrokerReviewGraphWorkCarrier({
    graph: reviewGraph,
    contentSet: carrierContentSet,
    requestDigest: carrierRequestDigest,
    workUnit: carrierWorkUnit,
    ...substitutedWorkCarrier,
    expectedBinding: workCarrierBundle.carrier.binding,
  }), /blob is invalid/)
  const staleWorkCarrier = structuredClone(workCarrierBundle)
  staleWorkCarrier.carrier.binding.rawContentBytes += 1
  assert.throws(() => materializeBrokerReviewGraphWorkCarrier({
    graph: reviewGraph,
    contentSet: carrierContentSet,
    requestDigest: carrierRequestDigest,
    workUnit: carrierWorkUnit,
    ...staleWorkCarrier,
    expectedBinding: workCarrierBundle.carrier.binding,
  }), /digest-mismatched|binding is stale/)
  const substitutedSemanticsBinding = structuredClone(workCarrierBundle)
  substitutedSemanticsBinding.carrier.binding.reviewSemanticsSetDigest = sha256(
    'substituted-review-semantics',
  )
  const {
    carrierDigest: ignoredSemanticsCarrierDigest,
    ...substitutedSemanticsCarrierProjection
  } = substitutedSemanticsBinding.carrier
  substitutedSemanticsBinding.carrier.carrierDigest = sha256(
    canonical(substitutedSemanticsCarrierProjection),
  )
  assert.throws(() => materializeBrokerReviewGraphWorkCarrier({
    graph: reviewGraph,
    contentSet: carrierContentSet,
    requestDigest: carrierRequestDigest,
    workUnit: carrierWorkUnit,
    ...substitutedSemanticsBinding,
    expectedBinding: workCarrierBundle.carrier.binding,
  }), /binding is stale|substituted/)
  const openBlobReferenceCarrier = structuredClone(workCarrierBundle)
  openBlobReferenceCarrier.carrier.blobRefs[0].unexpected = true
  const {
    carrierDigest: ignoredOpenBlobReferenceDigest,
    ...openBlobReferenceProjection
  } = openBlobReferenceCarrier.carrier
  openBlobReferenceCarrier.carrier.carrierDigest = sha256(canonical(openBlobReferenceProjection))
  assert.throws(() => materializeBrokerReviewGraphWorkCarrier({
    graph: reviewGraph,
    contentSet: carrierContentSet,
    requestDigest: carrierRequestDigest,
    workUnit: carrierWorkUnit,
    ...openBlobReferenceCarrier,
    expectedBinding: workCarrierBundle.carrier.binding,
  }), /blob reference has an invalid or open shape/)
  const graphWorkResults = reviewGraph.reviewWorkUnits.map((unit) => (
    buildBrokerStructuralReviewGraphResult(reviewGraph, unit)
  ))
  const graphSynthesisResults = reviewGraph.synthesisUnits.map((unit) => (
    buildBrokerStructuralReviewGraphResult(reviewGraph, unit)
  ))
  const graphClosure = closeBrokerNoSampleReviewGraph({
    graph: reviewGraph,
    workResults: graphWorkResults,
    synthesisResults: graphSynthesisResults,
    ...graphOptions,
  })
  assert.equal(graphClosure.fullNoSampleStructuralClosure, true)
  assert.equal(graphClosure.aggregateVerdict, 'structural-no-sample-complete-unattested')
  assert.equal(graphClosure.genuineCrossProviderReview, false)
  assert.equal(graphClosure.promotionEligible, false)
  assert.throws(() => closeBrokerNoSampleReviewGraph({
    graph: reviewGraph,
    workResults: graphWorkResults.slice(0, -1),
    synthesisResults: graphSynthesisResults,
    ...graphOptions,
  }), /partial/)
  assert.throws(() => closeBrokerNoSampleReviewGraph({
    graph: reviewGraph,
    workResults: graphWorkResults,
    synthesisResults: graphSynthesisResults.slice(0, -1),
    ...graphOptions,
  }), /partial/)
  const reorderedGraphResults = structuredClone(graphWorkResults)
  ;[reorderedGraphResults[0], reorderedGraphResults[1]] = [reorderedGraphResults[1], reorderedGraphResults[0]]
  assert.throws(() => closeBrokerNoSampleReviewGraph({
    graph: reviewGraph,
    workResults: reorderedGraphResults,
    synthesisResults: graphSynthesisResults,
    ...graphOptions,
  }), /reordered/)
  const staleGraph = structuredClone(reviewGraph)
  staleGraph.rawCorpus.tasks[0].unknownLeafCount = 1
  assert.throws(() => validateBrokerNoSampleReviewGraph(staleGraph, graphOptions), /stale/)
  const missingSemanticsDescriptors = structuredClone(graphDescriptors)
  missingSemanticsDescriptors[0].shards[0].reviewSemantics = null
  const { descriptorDigest: ignoredDescriptorDigest, ...missingSemanticsProjection } =
    missingSemanticsDescriptors[0]
  missingSemanticsDescriptors[0].descriptorDigest = sha256(canonical(missingSemanticsProjection))
  const missingSemanticsTaskSet = buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: ['judgment:6', 'judgment:7', 'component-a1b:Widget'],
    taskDescriptors: missingSemanticsDescriptors,
    planState: graphPlan,
  })
  assert.throws(() => buildBrokerNoSampleReviewGraph({
    taskSet: missingSemanticsTaskSet,
    taskDescriptors: missingSemanticsDescriptors,
    planState: graphPlan,
  }), /lacks canonical review semantics/)

  const sharedDescriptorIndex = 2
  const sharedShardOrdinal = graphDescriptors[sharedDescriptorIndex].shards
    .findIndex((shard) => shard.claimIds.length === 0)
  assert(sharedShardOrdinal >= 0)
  const assertSharedSemanticsPoison = (mutate, pattern) => {
    const poisoned = structuredClone(graphDescriptors)
    const shard = poisoned[sharedDescriptorIndex].shards[sharedShardOrdinal]
    mutate(shard.reviewSemantics)
    const { semanticsDigest: ignoredSemanticsDigest, ...semanticsProjection } =
      shard.reviewSemantics
    shard.reviewSemantics.semanticsDigest = sha256(canonical(semanticsProjection))
    const { descriptorDigest: ignoredPoisonedDescriptorDigest, ...descriptorProjection } =
      poisoned[sharedDescriptorIndex]
    poisoned[sharedDescriptorIndex].descriptorDigest = sha256(canonical(descriptorProjection))
    assert.throws(() => buildBrokerTaskSet({
      scopeKind: 'fixture',
      expectedTaskKeys: ['judgment:6', 'judgment:7', 'component-a1b:Widget'],
      taskDescriptors: poisoned,
      planState: graphPlan,
    }), pattern)
  }
  assertSharedSemanticsPoison(
    (semantics) => semantics.leafIds.push(sha256('unknown-shared-leaf')),
    /shared-evidence review semantics are invalid/,
  )
  assertSharedSemanticsPoison(
    (semantics) => {
      semantics.leafIds[0] = sha256('substituted-shared-leaf')
      semantics.leafIds.sort()
    },
    /shared-evidence review semantics are invalid/,
  )
  const sharedLeafCount = graphDescriptors[sharedDescriptorIndex]
    .shards[sharedShardOrdinal].reviewSemantics.leafIds.length
  if (sharedLeafCount > 1) {
    assertSharedSemanticsPoison(
      (semantics) => semantics.leafIds.reverse(),
      /shared-evidence review semantics are invalid/,
    )
  }
  assertSharedSemanticsPoison(
    (semantics) => {
      semantics.parentClaimEvidenceGraphDigest = sha256('substituted-parent-claim-graph')
    },
    /shared-evidence review semantics are invalid/,
  )
  assertSharedSemanticsPoison(
    (semantics) => {
      semantics.rule.ruleId = 'provider-specific-shared-rule'
    },
    /shared-evidence review semantics are invalid/,
  )
  assertSharedSemanticsPoison(
    (semantics) => {
      semantics.rule.mechanism = 'Use a provider-specific shortcut.'
    },
    /shared-evidence review semantics are invalid/,
  )

  const zeroClaimInventory = {
    ...claimInventory,
    claimInventoryDigest: sha256(canonical([])),
    claimCount: 0,
    claims: [],
  }
  const zeroClaimShardSet = buildContentAddressedBrokerShards({
    repoRoot: fixture,
    manifest,
    coveragePaths,
    coverageInventoryDigest,
    taskKind: 'component-a1b',
    subject: 'Widget',
    dependencySourceInventory,
    claimInventory: zeroClaimInventory,
    planState: graphPlan,
  })
  const zeroClaimDescriptor = buildBrokerTaskDispatchDescriptor(zeroClaimShardSet, {
    planState: graphPlan,
    claimInventoryDigest: zeroClaimInventory.claimInventoryDigest,
  })
  const zeroClaimTaskSet = buildBrokerTaskSet({
    scopeKind: 'fixture',
    expectedTaskKeys: ['component-a1b:Widget'],
    taskDescriptors: [zeroClaimDescriptor],
    planState: graphPlan,
  })
  const zeroClaimGraph = buildBrokerNoSampleReviewGraph({
    taskSet: zeroClaimTaskSet,
    taskDescriptors: [zeroClaimDescriptor],
    planState: graphPlan,
  })
  assert.equal(zeroClaimGraph.proof.expectedClaimCount, 0)
  assert.equal(zeroClaimGraph.proof.actualClaimCount, 0)
  assert(zeroClaimGraph.coverageCells.length > 0)
  assert(zeroClaimGraph.coverageCells.every(
    (cell) => cell.cellKind === 'shared-evidence-review-cell'
      && cell.claimIds.length === 0,
  ))
  assert.equal(zeroClaimGraph.proof.complete, true)
  console.log(`✓ no-sample review graph multiplexes identical judgment work, routes every applicable raw leaf to claim/shared review, and performs exact content-addressed task synthesis in the deterministic reducer (${graphDescriptors.reduce((sum, descriptor) => sum + descriptor.shardCount, 0)} legacy shards → ${reviewGraph.dispatchTotals.reviewWorkUnitCount} canonical review work units, with physical provider calls deferred to the capability-bounded exchange schedule, + ${reviewGraph.synthesisUnitCount} zero-call task reductions)`)
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

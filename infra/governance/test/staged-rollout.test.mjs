import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveGitRuntimeRoots } from '../../../scripts/lib/governance-runtime-evidence.mjs'
import {
  RELEASE_PACKAGE_NAMES,
  RELEASE_PUBLISH_ORDER,
  RELEASE_SUPPLY_CHAIN,
} from '../../../scripts/release-bom-contract.mjs'
import {
  activeRunBinding,
  appendCanonicalCandidateFreezeReceipt,
  buildStagedRolloutPrepareVerification,
  buildStagedRolloutExecutionPackage,
  createCanonicalCandidateFreezeSigningRequest,
  loadStagedRolloutPlan,
  loadAndBuildStagedRolloutPrepareVerification,
  loadCanonicalStagedRolloutRunBindings,
  loadReleaseTrustActivationInputs,
  loadStagedRolloutCoverageTopology,
  phaseReceiptSigningPayload,
  prepareCanonicalStagedRolloutLedger,
  resolveStagedRolloutDeploymentProfile,
  stagedRolloutContract,
  stagedRolloutArtifact,
  stagedRolloutCanonicalGovernanceInputPaths,
  stagedRolloutExecutionTransition,
  stagedRolloutManagedCiIndexDigest,
  stagedRolloutPlanDigest,
  stagedRolloutProfileLifecycle,
  stagedRolloutPrepareVerificationDigest,
  stagedRolloutReceiptDigest,
  stagedRolloutReleaseRecordDigest,
  mintCanonicalStagedRolloutExecutionPackage,
  validateCanonicalStagedRolloutExecutionPackage,
  validateCanonicalStagedRolloutLedger,
  validateCandidateFreezeBootstrapPrerequisites,
  validateStagedRolloutCandidateCarrier,
  validateStagedRolloutExecutionPackage,
  validateStagedRolloutLedger,
  validateStagedRolloutPlan,
  validateStagedCandidateManagedCiTrust,
} from '../lib/staged-rollout.mjs'
import { buildRepositorySubjectProof } from '../lib/repository-subject-proof.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import { compareUtf8Bytes, sha256, stableStringify } from '../lib/common.mjs'
import {
  captureDeepAuditSnapshot,
  deepAuditProviderIdentityDigest,
  deriveDeepAuditManifestProjections,
  digestInventoryRows,
} from '../../../scripts/lib/deep-audit-evidence-contract.mjs'
import { EXACT_REVIEW_CERTIFICATION_CONTRACT, resolveProviderReviewBinding } from '../../../packages/governance/src/provider-review-binding.mjs'
import {
  loadManagedCiTrustedExecutionPlan,
  managedCiExpectedFrozenSubjectArtifactBinding,
  managedCiExpectedFrozenSubjectClassReadback,
  managedCiExpectedHostSandboxPolicyBinding,
  managedCiExpectedImageSupplyChainBinding,
  managedCiExpectedReceiptBinding,
  managedCiExpectedReceiptSignerAuthorityBinding,
  managedCiExpectedReceiptSignerIssuerMapping,
  managedCiHostSandboxObservationReceiptDigest,
  managedCiHostSandboxObservationSigningBytes,
  managedCiProvenanceBinding,
  managedCiReceiptSigningBytes,
  managedCiReceiptSigningPayload,
  managedCiSignerAuditEvent,
} from '../../../scripts/lib/managed-ci-trusted-execution-plan.mjs'
import { buildModelReleaseAuthorityFixture } from '../../../scripts/test-fixtures/model-release-authority-fixture.mjs'
import { createManagedCiActivationFixture } from './fixtures/managed-ci-activation-fixture.mjs'
import { createAuthorityBootstrapReplayFixture } from './fixtures/authority-bootstrap-replay-fixture.mjs'
import { validateAuthorityBootstrapDurableReplayReceipt } from '../bin/reconcile-github.mjs'

const PLAN = loadStagedRolloutPlan()
const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const PLAN_SHA256 = stagedRolloutPlanDigest(PLAN)
const CONSUMER_UPGRADE_PROTOCOL_BYTES = readFileSync(new URL('../consumer-upgrade-protocol.json', import.meta.url))
const CONSUMER_UPGRADE_PROTOCOL_SCHEMA_BYTES = readFileSync(new URL('../schemas/consumer-upgrade-protocol.schema.json', import.meta.url))
const CONSUMER_UPGRADE_PROTOCOL_IMPLEMENTATION_BYTES = readFileSync(new URL('../lib/consumer-upgrade-protocol.mjs', import.meta.url))
const CONSUMER_UPGRADE_PROTOCOL = JSON.parse(CONSUMER_UPGRADE_PROTOCOL_BYTES.toString('utf8'))
const CONSUMER_UPGRADE_PROTOCOL_SHA256 = sha256(CONSUMER_UPGRADE_PROTOCOL_BYTES)
const CONSUMER_UPGRADE_PROTOCOL_SCHEMA_SHA256 = sha256(CONSUMER_UPGRADE_PROTOCOL_SCHEMA_BYTES)
const CONSUMER_UPGRADE_PROTOCOL_IMPLEMENTATION_SHA256 = sha256(CONSUMER_UPGRADE_PROTOCOL_IMPLEMENTATION_BYTES)
const COVERAGE_TOPOLOGY = loadStagedRolloutCoverageTopology()
const INVENTORY = JSON.parse(readFileSync(new URL('../inventory/managed-repos.json', import.meta.url), 'utf8'))
const DESIRED = JSON.parse(readFileSync(new URL('../desired/github.json', import.meta.url), 'utf8'))
const AUTHORITY_PROFILE = DESIRED.profiles['design-system-authority']
const NOW = new Date('2026-07-31T10:00:00.000Z')
const RUN_ID = '12345678-1234-4123-8123-123456789abc'
const FROZEN_CONTENT = new Map([
  ['docs/link', Buffer.from('../README.md')],
  ['infra/governance/bin/run-harnesses.mjs', Buffer.from('fixture All-Harness runner\n')],
  ['new/nested.txt', Buffer.from('new prepared file\n')],
  ['package-lock.json', Buffer.from('{"lockfileVersion":3}\n')],
  ['scripts/governance-build-graph.mjs', Buffer.from('fixture governance build graph\n')],
  ['scripts/tool.sh', Buffer.from('#!/bin/sh\nexit 0\n')],
])
const LOCKFILE_SHA256 = sha256(FROZEN_CONTENT.get('package-lock.json'))
const FROZEN_INVENTORY = [
  { path: 'deleted.txt', kind: 'missing', mode: '100644', bytes: 0, sha256: sha256('missing\0deleted.txt') },
  { path: 'docs/link', kind: 'symlink', mode: '120000', bytes: FROZEN_CONTENT.get('docs/link').length, sha256: sha256(FROZEN_CONTENT.get('docs/link')) },
  { path: 'infra/governance/bin/run-harnesses.mjs', kind: 'file', mode: '100644', bytes: FROZEN_CONTENT.get('infra/governance/bin/run-harnesses.mjs').length, sha256: sha256(FROZEN_CONTENT.get('infra/governance/bin/run-harnesses.mjs')) },
  { path: 'new/nested.txt', kind: 'file', mode: '100644', bytes: FROZEN_CONTENT.get('new/nested.txt').length, sha256: sha256(FROZEN_CONTENT.get('new/nested.txt')) },
  { path: 'package-lock.json', kind: 'file', mode: '100644', bytes: FROZEN_CONTENT.get('package-lock.json').length, sha256: LOCKFILE_SHA256 },
  { path: 'scripts/governance-build-graph.mjs', kind: 'file', mode: '100644', bytes: FROZEN_CONTENT.get('scripts/governance-build-graph.mjs').length, sha256: sha256(FROZEN_CONTENT.get('scripts/governance-build-graph.mjs')) },
  { path: 'scripts/tool.sh', kind: 'file', mode: '100755', bytes: FROZEN_CONTENT.get('scripts/tool.sh').length, sha256: sha256(FROZEN_CONTENT.get('scripts/tool.sh')) },
]
const FROZEN_INVENTORY_DIGEST = sha256(stableStringify(FROZEN_INVENTORY, 0))
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const REGISTRY = {
  $schema: '../schemas/issuer-registry.schema.json',
  schemaVersion: 1,
  algorithm: 'ed25519',
  issuers: [{
    keyId: 'fixture-completion',
    subject: 'fixture-signer',
    publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    roles: ['apply-authorizer', 'completion-attestor'],
    status: 'active',
    notBefore: '2026-07-01T00:00:00.000Z',
    notAfter: '2027-07-01T00:00:00.000Z',
    revokedAt: null,
  }],
}
const POLICY = {
  schemaVersion: 1,
  algorithm: 'ed25519',
  maxAuthorizationTtlMinutes: 60,
  maxCompletionTtlMinutes: 10080,
  clockSkewSeconds: 120,
  issuerRegistryDigest: issuerRegistryDigest(REGISTRY),
  allowedKeyIds: ['fixture-completion'],
  applyAuthorizationQuorum: 1,
  completionAttestationQuorum: 1,
}
const ACTIVE_RUN = {
  manifestSha256: 'b'.repeat(64),
  manifest: {
    runId: RUN_ID,
    createdAt: '2026-07-20T00:00:00.000Z',
    head: '1'.repeat(40),
    tree: '2'.repeat(40),
    indexDigest: '4'.repeat(64),
    worktreeFingerprint: '3'.repeat(64),
    inventoryDigest: FROZEN_INVENTORY_DIGEST,
    rubricDigest: '5'.repeat(64),
    inventory: FROZEN_INVENTORY,
    authorProvider: 'claude',
    providerIdentityDigest: '7'.repeat(64),
    providers: { self: { id: 'claude' }, peer: { id: 'codex' } },
    components: [{ name: 'Fixture' }],
  },
}
const ACTIVE_BINDING = activeRunBinding(ACTIVE_RUN)
const EVIDENCE_SHA = label => sha256(`fixture:${label}`)
const SRI = byte => `sha512-${Buffer.alloc(64, byte).toString('base64')}`
const HEX = (value, length) => (value % 16).toString(16).repeat(length)

function runtimeRunManifest(snapshot, runId, createdAt) {
  const { rubricPaths, components } = deriveDeepAuditManifestProjections({
    repoRoot: process.cwd(),
    inventory: snapshot.inventory,
  })
  const selectionDigest = digestInventoryRows(snapshot.inventory, rubricPaths)
  const providerRegistry = JSON.parse(readFileSync(resolve(process.cwd(), 'packages/governance/canonical/providers.json'), 'utf8'))
  const capabilityRegistry = JSON.parse(readFileSync(resolve(process.cwd(), 'infra/governance/providers/review-capability-registry.json'), 'utf8'))
  const capabilityCertificationLedger = JSON.parse(readFileSync(resolve(process.cwd(), 'infra/governance/providers/review-capability-certifications.json'), 'utf8'))
  const invocationRegistry = JSON.parse(readFileSync(resolve(process.cwd(), 'infra/governance/providers/model-invocation-profiles.json'), 'utf8'))
  const modelReleaseRegistry = JSON.parse(readFileSync(resolve(process.cwd(), 'infra/governance/providers/model-release-registry.json'), 'utf8'))
  const review = resolveProviderReviewBinding({
    registry: providerRegistry,
    capabilityRegistry,
    capabilityCertificationLedger,
    invocationRegistry,
    modelReleaseRegistry,
    skill: 'deep-audit-cross-codex',
    selfProviderId: 'claude',
    authorProviderId: 'claude',
    requireCertificationContract: true,
    requireSelectedCapability: false,
    now: new Date(createdAt),
  })
  const provider = (id, peerId, runtimeIdentity) => {
    const record = providerRegistry.providers.find(item => item.id === id)
    return {
    id,
    displayName: record.displayName,
    providerKind: record.providerKind,
    runtimeIdentity,
    runtimeSurface: 'local',
    runtimeProfileId: id,
    reviewTransport: review.transport,
    reviewSkill: review.skill,
    reviewPeerId: peerId,
    certificationContract: review.certificationContract,
    reviewBindingDigest: review.bindingDigest,
    registryRecordDigest: sha256(stableStringify(record, 0)),
    runtimeCertification: null,
    }
  }
  const providers = {
    self: provider('claude', null, 'claude-code-cli'),
    peer: null,
  }
  return {
    schemaVersion: 4,
    contractVersion: 1,
    evidenceKind: 'deep-audit-run-manifest',
    runId,
    createdAt,
    head: snapshot.head,
    tree: snapshot.tree,
    indexDigest: snapshot.indexDigest,
    inventoryDigest: snapshot.inventoryDigest,
    rubricDigest: selectionDigest,
    worktreeFingerprint: snapshot.worktreeFingerprint,
    authorProvider: 'claude',
    providerIdentityDigest: deepAuditProviderIdentityDigest({
      authorProvider: 'claude',
      providers,
      reviewSelection: review.selectionReceipt,
    }),
    providers,
    reviewSelection: review.selectionReceipt,
    inventory: snapshot.inventory,
    rubricPaths,
    components,
  }
}

function writeRuntimeRun(evidenceRoot, manifest) {
  const runRoot = resolve(evidenceRoot, 'deep-audit', 'runs', manifest.runId)
  mkdirSync(runRoot, { recursive: true, mode: 0o700 })
  const bytes = Buffer.from(`${stableStringify(manifest, 2)}\n`)
  const manifestPath = resolve(runRoot, 'run-manifest.json')
  writeFileSync(manifestPath, bytes, { mode: 0o600 })
  return { manifest, manifestSha256: sha256(bytes), manifestPath, runRoot }
}

function writeRuntimePointer(evidenceRoot, run) {
  const path = resolve(evidenceRoot, 'deep-audit', 'active-run.json')
  writeFileSync(path, `${stableStringify({ schemaVersion: 1, evidenceKind: 'deep-audit-active-run', runId: run.manifest.runId, manifestSha256: run.manifestSha256 }, 2)}\n`, { mode: 0o600 })
}

function gitObjectId(kind, bytes) {
  return createHash('sha1').update(Buffer.from(`${kind} ${bytes.length}\0`)).update(bytes).digest('hex')
}

function fixtureTreeOid(entries) {
  const root = { files: new Map(), directories: new Map() }
  for (const entry of entries) {
    const segments = entry.path.split('/')
    let cursor = root
    for (const segment of segments.slice(0, -1)) {
      if (!cursor.directories.has(segment)) cursor.directories.set(segment, { files: new Map(), directories: new Map() })
      cursor = cursor.directories.get(segment)
    }
    cursor.files.set(segments.at(-1), entry)
  }
  const hash = node => {
    const children = [
      ...[...node.files].map(([name, entry]) => ({ name, key: Buffer.from(name), mode: entry.mode, oid: entry.blobOid })),
      ...[...node.directories].map(([name, child]) => ({ name, key: Buffer.from(`${name}/`), mode: '40000', oid: hash(child) })),
    ].sort((left, right) => Buffer.compare(left.key, right.key))
    return gitObjectId('tree', Buffer.concat(children.map(item => Buffer.concat([Buffer.from(`${item.mode} ${item.name}\0`), Buffer.from(item.oid, 'hex')]))))
  }
  return hash(root)
}

function gitObjectFixture() {
  const magic = Buffer.from('qijenchen-candidate-freeze-content-v1\0')
  const chunks = [magic]
  const blobs = new Map()
  let offset = magic.length
  const entries = FROZEN_INVENTORY.filter(row => row.kind !== 'missing').map(row => {
    const bytes = FROZEN_CONTENT.get(row.path)
    const blobOid = gitObjectId('blob', bytes)
    const key = `${row.sha256}:${blobOid}:${row.bytes}`
    let blob = blobs.get(key)
    if (!blob) {
      blob = { offset, bytes }
      blobs.set(key, blob)
      chunks.push(bytes)
      offset += bytes.length
    }
    return { ...row, blobOid, offset: blob.offset }
  })
  const content = Buffer.concat(chunks, offset)
  const artifactSha256 = sha256(content)
  const treeOid = fixtureTreeOid(entries)
  const epochSeconds = Math.floor(Date.parse(ACTIVE_RUN.manifest.createdAt) / 1000)
  const identity = 'Qijenchen Governance Freeze <governance-freeze@qijenchen.dev>'
  const commitBytes = Buffer.from([
    `tree ${treeOid}`,
    `parent ${ACTIVE_RUN.manifest.head}`,
    `author ${identity} ${epochSeconds} +0000`,
    `committer ${identity} ${epochSeconds} +0000`,
    '',
    `candidate freeze ${ACTIVE_RUN.manifest.runId}`,
    `manifest-sha256 ${ACTIVE_RUN.manifestSha256}`,
    `inventory-sha256 ${ACTIVE_RUN.manifest.inventoryDigest}`,
    `artifact-sha256 ${artifactSha256}`,
    '',
  ].join('\n'))
  return {
    schemaVersion: 2,
    kind: 'frozen-git-object-proof',
    objectFormat: 'sha1',
    artifact: {
      format: 'qijenchen-candidate-freeze-content-v1',
      storage: 'embedded-fixture',
      path: null,
      bytes: content.length,
      sha256: artifactSha256,
      contentBase64: content.toString('base64'),
    },
    entries,
    treeOid,
    commit: { encoding: 'base64', bytes: commitBytes.toString('base64'), oid: gitObjectId('commit', commitBytes) },
  }
}

const GIT_OBJECT_PROOF = gitObjectFixture()
const PR_HEAD = GIT_OBJECT_PROOF.commit.oid
const SOURCE_TREE = GIT_OBJECT_PROOF.treeOid
const MERGE_COMMIT_BYTES = Buffer.from(`tree ${SOURCE_TREE}\nparent ${PR_HEAD}\nauthor Fixture <fixture@example.com> 1752975000 +0000\ncommitter Fixture <fixture@example.com> 1752975000 +0000\n\nmerge protected PR\n`)
const MERGE_COMMIT = gitObjectId('commit', MERGE_COMMIT_BYTES)
const CERT_RUN = {
  manifestSha256: 'c'.repeat(64),
  manifest: {
    ...structuredClone(ACTIVE_RUN.manifest),
    runId: '87654321-4321-4123-8123-cba987654321',
    head: PR_HEAD,
    tree: SOURCE_TREE,
    worktreeFingerprint: '6'.repeat(64),
  },
}
const CERT_BINDING = activeRunBinding(CERT_RUN)

function releaseRecord(version, observedAt, seed, source = {}) {
  const sourceCommit = source.sourceCommit ?? String(seed).repeat(40)
  const sourceTree = source.sourceTree ?? String(seed + 1).repeat(40)
  const packages = RELEASE_PACKAGE_NAMES.map((name, index) => ({
    name,
    version,
    file: `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`,
    size: 100 + index,
    entryCount: 2,
    shasum: HEX(seed + 2 + index, 40),
    sha256: HEX(seed + 3 + index, 64),
    integrity: SRI(seed + index),
    packageJsonSha256: HEX(seed + 4 + index, 64),
    sourceManifest: `packages/${name.split('/')[1]}/package.json`,
    sourceManifestSha256: HEX(seed + 5 + index, 64),
  }))
  const hex = HEX(seed + 7, 64)
  const bom = {
    schemaVersion: 5,
    releaseVersion: version,
    npmDistTag: 'latest',
    publishOrder: RELEASE_PUBLISH_ORDER,
    source: {
      repository: 'ajenchen/design-system',
      repositoryUrl: 'git+https://github.com/ajenchen/design-system.git',
      gitCommit: sourceCommit,
      gitTree: sourceTree,
      tag: `v${version}`,
    },
    supplyChain: RELEASE_SUPPLY_CHAIN,
    packages,
    governance: {
      controlPlane: { path: 'governance/control-plane.lock.json', sha256: hex, role: 'ds-author', inputDigest: `sha256:${hex}`, contractDigest: `sha256:${hex}`, snapshotDigest: `sha256:${hex}`, generatorVersion: version },
      consumer: { path: 'template/ds-product-template/governance/lock.json', sha256: hex, role: 'template-consumer', release: { designSystem: version, storybookConfig: version } },
      forkCorpus: { path: 'packages/design-system/ds-canonical/fork/governance.lock', sha256: hex },
      productTemplateScaffold: { path: 'product-template-scaffold.lock.json', size: 42, sha256: hex, schemaVersion: 1, releaseVersion: version, staticTreeSha256: hex, publishedPathCount: 2 },
    },
    sbom: { file: 'release.sbom.cdx.json', size: 42, sha256: hex },
  }
  const bomBytes = Buffer.from(`${JSON.stringify(bom)}\n`)
  const bomSha256 = sha256(bomBytes)
  const candidateRelease = {
    id: `ajenchen/design-system@v${version}`,
    version,
    sourceCommit,
    sourceTree,
    bomSha256,
    packages: packages.map(item => ({ name: item.name, version: item.version, integrity: item.integrity })),
    observedAt,
  }
  const finalizationReceiptSha256 = EVIDENCE_SHA(`finalization-receipt-${seed}`)
  const releaseTrustEvidenceSha256 = EVIDENCE_SHA(`release-trust-${seed}`)
  const assets = [
    ...packages.map((item, index) => ({ id: String(2100 + seed + index), name: item.file, digest: `sha256:${item.sha256}`, size: item.size })),
    { id: String(2200 + seed), name: 'release-bom.json', digest: `sha256:${bomSha256}`, size: bomBytes.length },
    { id: String(2201 + seed), name: 'release.sbom.cdx.json', digest: `sha256:${bom.sbom.sha256}`, size: bom.sbom.size },
    { id: String(2202 + seed), name: 'product-template-scaffold.lock.json', digest: `sha256:${bom.governance.productTemplateScaffold.sha256}`, size: bom.governance.productTemplateScaffold.size },
    { id: String(2203 + seed), name: 'npm-finalization-receipt.json', digest: `sha256:${finalizationReceiptSha256}`, size: 42 },
    { id: String(2204 + seed), name: 'release-trust-preflight.json', digest: `sha256:${releaseTrustEvidenceSha256}`, size: 42 },
  ].sort((left, right) => compareUtf8Bytes(left.name, right.name))
  const verified = {
    schemaVersion: 2,
    candidateReleaseDigest: sha256(stableStringify(candidateRelease, 0)),
    repository: 'ajenchen/design-system',
    tag: `v${version}`,
    version,
    releaseId: String(1000 + seed),
    tagObject: HEX(seed + 20, 40),
    tagVerification: {
      verified: true,
      reason: 'valid',
      verifiedAt: observedAt,
      signatureSha256: EVIDENCE_SHA(`tag-signature-${seed}`),
      payloadSha256: EVIDENCE_SHA(`tag-payload-${seed}`),
    },
    sourceCommit,
    sourceTree,
    bomSha256,
    releaseSetSha256: EVIDENCE_SHA(`release-set-${seed}`),
    finalizationReceiptSha256,
    releaseTrustEvidenceSha256,
    assets,
    packages: candidateRelease.packages,
  }
  return {
    candidateRelease,
    bom: { encoding: 'base64', sha256: bomSha256, bytes: bomBytes.toString('base64') },
    verifiedReleaseEvidence: { sha256: sha256(stableStringify(verified, 0)), value: verified },
  }
}

function candidateSnapshotFixture() {
  return {
    runId: ACTIVE_BINDING.runId,
    manifestSha256: ACTIVE_BINDING.manifestSha256,
    head: ACTIVE_BINDING.head,
    tree: ACTIVE_BINDING.tree,
    indexDigest: ACTIVE_RUN.manifest.indexDigest,
    inventoryDigest: ACTIVE_RUN.manifest.inventoryDigest,
    worktreeFingerprint: ACTIVE_BINDING.worktreeFingerprint,
  }
}

function fixtureAllHarnessReceipt() {
  const sources = [
    'infra/governance/bin/run-harnesses.mjs',
    'scripts/governance-build-graph.mjs',
  ].map(path => ({ path, sha256: FROZEN_INVENTORY.find(row => row.path === path).sha256 }))
  const aggregateSha256 = sha256(`provider-neutral-governance-harness-local-source-projection-v1\n${stableStringify(sources, 0)}`)
  const localSourceProjection = {
    schemaVersion: 1,
    kind: 'provider-neutral-governance-harness-local-source-projection',
    algorithm: 'sha256',
    sourceCount: sources.length,
    sources,
    aggregateSha256,
  }
  const summary = {
    schemaVersion: 2,
    kind: 'provider-neutral-governance-harness-run-summary',
    runnerId: 'all-registered-local-harnesses',
    hardGateContractId: 'provider-neutral-governance-harness-v2',
    harnessRegistrySha256: EVIDENCE_SHA('fixture-harness-registry'),
    harnessSourceInventorySha256: EVIDENCE_SHA('fixture-harness-source-inventory'),
    status: 'passed',
    executedCommandCount: 2,
    registeredLocalSourceCount: sources.length,
    passedLocalSourceCount: sources.length,
    localSourceProjection,
    commands: [
      { argv: ['node', 'fixture-one.mjs'], status: 'passed' },
      { argv: ['node', 'fixture-two.mjs'], status: 'passed' },
    ],
  }
  const receipt = {
    schemaVersion: 3,
    kind: 'provider-neutral-local-all-harness-receipt',
    subject: {
      repositoryRole: 'design-system-authority',
      head: ACTIVE_RUN.manifest.head,
      tree: ACTIVE_RUN.manifest.tree,
      controlPlane: { path: 'governance/control-plane.lock.json', sha256: EVIDENCE_SHA('fixture-control-plane') },
      harnessRegistry: { path: 'infra/governance/providers/harness-registry.json', sha256: summary.harnessRegistrySha256 },
      harnessSourceInventory: { path: 'infra/governance/providers/harness-source-inventory.json', sha256: summary.harnessSourceInventorySha256 },
      localSourceProjection: {
        schemaVersion: 1,
        kind: localSourceProjection.kind,
        algorithm: localSourceProjection.algorithm,
        sourceCount: localSourceProjection.sourceCount,
        aggregateSha256,
      },
      gitVisibleWorktree: {
        schemaVersion: 1,
        kind: 'git-visible-worktree-fingerprint',
        indexSha256: ACTIVE_RUN.manifest.indexDigest,
        entryCount: FROZEN_INVENTORY.length,
        digest: EVIDENCE_SHA('fixture-git-visible-worktree'),
      },
    },
    runner: {
      argv: ['node', 'infra/governance/bin/run-harnesses.mjs'],
      runnerId: summary.runnerId,
      hardGateContractId: summary.hardGateContractId,
      executedCommandCount: summary.executedCommandCount,
      registeredLocalSourceCount: summary.registeredLocalSourceCount,
    },
    result: {
      pass: true,
      status: 'passed',
      runSummarySha256: sha256(stableStringify(summary, 0)),
      localSourceProjectionSha256: aggregateSha256,
    },
    startedAt: '2026-07-20T00:05:00.000Z',
    completedAt: '2026-07-20T00:30:00.000Z',
    expiresAt: '2026-07-21T00:30:00.000Z',
    ttlSeconds: 86400,
    runSummary: summary,
    receiptSha256: '',
  }
  const unsigned = structuredClone(receipt)
  delete unsigned.receiptSha256
  receipt.receiptSha256 = sha256(`provider-neutral-all-harness-receipt-v3\n${stableStringify(unsigned, 0)}`)
  return receipt
}

function prepareVerification() {
  const snapshot = candidateSnapshotFixture()
  const allHarnessReceipt = fixtureAllHarnessReceipt()
  const allHarnessBytes = Buffer.from(`${stableStringify(allHarnessReceipt)}\n`)
  const allHarnessSha256 = sha256(allHarnessBytes)
  const buildGraphTranscript = {
    schemaVersion: 1,
    kind: 'governance-build-graph-check-transcript',
    stdout: [
      'release-version',
      'provider-adapters',
      'plugin-aliases',
      'fork-template',
      'baseline-mirrors',
      'governance-metadata',
      'control-plane',
    ].map(id => `→ governance build graph check:${id}`).join('\n') + '\n',
    stderr: '',
  }
  const buildGraphBytes = Buffer.from(stableStringify(buildGraphTranscript, 0))
  const buildGraphSha256 = sha256(buildGraphBytes)
  const freeze = {
    schemaVersion: 2,
    kind: 'candidate-freeze-verification',
    activeRun: structuredClone(ACTIVE_BINDING),
    inventoryDigest: ACTIVE_RUN.manifest.inventoryDigest,
    inventory: structuredClone(ACTIVE_RUN.manifest.inventory),
    gitObjectProof: structuredClone(GIT_OBJECT_PROOF),
    targetFrozenAt: ACTIVE_RUN.manifest.createdAt,
    preparedAt: '2026-07-20T00:45:00.000Z',
    status: 'frozen',
    promotionEligible: false,
    checks: [
      {
        id: 'all-harness',
        producer: 'infra/governance/bin/run-harnesses.mjs',
        mode: 'completed-receipt-readback',
        argv: ['node', 'infra/governance/bin/run-harnesses.mjs'],
        entrypointSha256: FROZEN_INVENTORY.find(row => row.path === 'infra/governance/bin/run-harnesses.mjs').sha256,
        exitCode: 0,
        signal: null,
        startedAt: '2026-07-20T00:35:00.000Z',
        finishedAt: '2026-07-20T00:36:00.000Z',
        snapshotBefore: structuredClone(snapshot),
        snapshotAfter: structuredClone(snapshot),
        result: {
          schemaVersion: 1,
          kind: 'all-harness-receipt-validation',
          status: 'passed',
          artifactSha256: allHarnessSha256,
          detail: {
            receiptSha256: allHarnessReceipt.receiptSha256,
            completedAt: allHarnessReceipt.completedAt,
            expiresAt: allHarnessReceipt.expiresAt,
            registeredLocalSourceCount: allHarnessReceipt.runner.registeredLocalSourceCount,
            localSourceProjectionSha256: allHarnessReceipt.result.localSourceProjectionSha256,
            gitVisibleWorktreeDigest: allHarnessReceipt.subject.gitVisibleWorktree.digest,
          },
        },
        evidenceSha256: allHarnessSha256,
        artifact: { encoding: 'base64', bytes: allHarnessBytes.toString('base64') },
      },
      {
        id: 'governance-build-graph',
        producer: 'scripts/governance-build-graph.mjs',
        mode: 'isolated-local-process',
        argv: ['node', 'scripts/governance-build-graph.mjs', '--check'],
        entrypointSha256: FROZEN_INVENTORY.find(row => row.path === 'scripts/governance-build-graph.mjs').sha256,
        exitCode: 0,
        signal: null,
        startedAt: '2026-07-20T00:37:00.000Z',
        finishedAt: '2026-07-20T00:40:00.000Z',
        snapshotBefore: structuredClone(snapshot),
        snapshotAfter: structuredClone(snapshot),
        result: {
          schemaVersion: 1,
          kind: 'governance-build-graph-validation',
          status: 'passed',
          artifactSha256: buildGraphSha256,
          detail: { stageIds: ['release-version', 'provider-adapters', 'plugin-aliases', 'fork-template', 'baseline-mirrors', 'governance-metadata', 'control-plane'] },
        },
        evidenceSha256: buildGraphSha256,
        artifact: { encoding: 'base64', bytes: buildGraphBytes.toString('base64') },
      },
    ],
  }
  return buildStagedRolloutPrepareVerification({
    activeRun: ACTIVE_RUN,
    freeze,
    bootstrapPrerequisite: fixtureBootstrapPrerequisite(freeze.preparedAt),
    authorityBootstrapReplayReceipt: null,
    authorityBootstrapActivationRequirement: null,
    plan: PLAN,
    attestationPolicy: POLICY,
    issuerRegistry: REGISTRY,
  })
}

const CONTROL_PLANE_COMMIT = '7'.repeat(40)
const CONTROL_PLANE_TREE = '8'.repeat(40)
const WORKFLOW_IDENTITY_DIGEST = EVIDENCE_SHA('managed-workflow-identity')
const ACTIVATION_EVIDENCE_SHA256 = EVIDENCE_SHA('managed-activation-evidence')
const ACTIVATION_OBSERVED_AT = '2026-07-20T00:50:00.000Z'
const ACTIVATION_CLASS_RECEIPTS = {
  'dependency-acquisition': EVIDENCE_SHA('activation-dependency-receipt'),
  'deterministic-hook-audit': EVIDENCE_SHA('activation-deterministic-receipt'),
  'model-broker': EVIDENCE_SHA('activation-model-receipt'),
  'github-observer': EVIDENCE_SHA('activation-github-receipt'),
}
const ACTIVATION_CLASSES = Object.keys(ACTIVATION_CLASS_RECEIPTS)
const ACTIVATION_DIGEST_MAP = label => Object.fromEntries(ACTIVATION_CLASSES.map(id => [id, EVIDENCE_SHA(`${label}-${id}`)]))
const ACTIVATION_CLOSURE = {
  frozenSubjectArtifactBindingDigest: EVIDENCE_SHA('activation-frozen-subject-binding'),
  receiptSignerAuthorityBindingDigest: EVIDENCE_SHA('activation-signer-authority-binding'),
  receiptSignerIssuerMappingDigest: EVIDENCE_SHA('activation-signer-issuer-mapping'),
  modelReleaseAuthorityBindingDigest: EVIDENCE_SHA('activation-model-release-authority'),
  finalizationRequestDigest: EVIDENCE_SHA('activation-finalization-request'),
  finalizationRawReceiptSetDigest: EVIDENCE_SHA('activation-finalization-raw-receipt-set'),
  finalizationReceiptSetDigest: EVIDENCE_SHA('activation-finalization-receipt-set'),
  finalizationTransportReadbackDigest: EVIDENCE_SHA('activation-finalization-transport-readback'),
  readbackReceiptDigest: EVIDENCE_SHA('activation-aggregate-readback'),
  executionClassReceiptProvenanceDigests: ACTIVATION_DIGEST_MAP('activation-receipt-provenance'),
  executionClassOidcClaimsDigests: ACTIVATION_DIGEST_MAP('activation-oidc-claims'),
  executionClassOidcProvenanceDigests: ACTIVATION_DIGEST_MAP('activation-oidc-provenance'),
  executionClassImageSupplyChainDigests: ACTIVATION_DIGEST_MAP('activation-image-supply-chain'),
  executionClassHostSandboxReadbackDigests: ACTIVATION_DIGEST_MAP('activation-host-sandbox'),
  executionClassFrozenSubjectReadbackDigests: ACTIVATION_DIGEST_MAP('activation-frozen-readback'),
  executionClassReceiptSigningPayloadDigests: ACTIVATION_DIGEST_MAP('activation-receipt-signing-payload'),
  executionClassSignerAuditEventDigests: ACTIVATION_DIGEST_MAP('activation-signer-audit'),
}
const MAXIMUM_REPLAY_FIXTURE_PLAN = structuredClone(PLAN)
MAXIMUM_REPLAY_FIXTURE_PLAN.bootstrapBoundary.githubPolicyConvergence.position = 'before-candidate-freeze'
const AUTHORITY_REPLAY_FIXTURE = createAuthorityBootstrapReplayFixture({
  inventory: INVENTORY,
  desired: DESIRED,
  stagedRolloutPlan: MAXIMUM_REPLAY_FIXTURE_PLAN,
  aligned: true,
})
const ACTIVATION_FIXTURE = {
  schemaVersion: 3,
  kind: 'fixture-external-activation-ledger',
  requirements: [
    {
      id: 'activate-managed-ci-trusted-execution',
      kind: 'managed-ci-attestation',
      requiredFor: ['release'],
      status: 'activated',
      observedAt: ACTIVATION_OBSERVED_AT,
      expiresAt: '2026-07-27T00:30:00.000Z',
      evidence: {
        sha256: ACTIVATION_EVIDENCE_SHA256,
        payload: {
          observedResource: {
            workflowRepository: 'ajenchen/design-system',
            workflowPath: '.github/workflows/deep-audit-managed.yml',
            workflowRef: 'refs/heads/main',
            workflowDefinitionCommit: CONTROL_PLANE_COMMIT,
            workflowDefinitionTree: CONTROL_PLANE_TREE,
            workflowIdentityDigest: WORKFLOW_IDENTITY_DIGEST,
            workflowRunId: '6001',
            runAttempt: 1,
            bootstrapMode: 'protected-main-control-plane-only',
            protectedMainMergedAt: '2026-07-20T00:48:00.000Z',
            releaseMutationsObserved: false,
            candidateSelfCertificationAllowed: false,
            executionClassReceiptDigests: ACTIVATION_CLASS_RECEIPTS,
            ...ACTIVATION_CLOSURE,
          },
        },
      },
    },
    structuredClone(AUTHORITY_REPLAY_FIXTURE.activationRequirement),
  ],
}
const ACTIVATION_BASELINE_FIXTURE = structuredClone(ACTIVATION_FIXTURE)
{
  const managedCi = ACTIVATION_BASELINE_FIXTURE.requirements.find(
    item => item.id === 'activate-managed-ci-trusted-execution',
  )
  managedCi.status = 'not-activated'
  managedCi.observedAt = null
  managedCi.expiresAt = null
  managedCi.evidence = null
}
function fixtureBootstrapPrerequisite(freezeAt) {
  const readiness = {
    scope: 'release',
    profileId: PLAN.deploymentProfileBinding.profile.id,
    profileDigest: PLAN.deploymentProfileBinding.profile.sha256,
    policyDigest: PLAN.deploymentProfileBinding.externalActivationPolicy.sha256,
    ready: true,
    requiredCount: ACTIVATION_BASELINE_FIXTURE.requirements.length,
    activatedCount: ACTIVATION_BASELINE_FIXTURE.requirements.filter(item => item.status === 'activated').length,
    blockers: [],
    digest: sha256(stableStringify(ACTIVATION_BASELINE_FIXTURE, 0)),
  }
  return validateCandidateFreezeBootstrapPrerequisites({
    plan: PLAN,
    activationRequirements: ACTIVATION_BASELINE_FIXTURE,
    readiness,
    attestationPolicy: POLICY,
    issuerRegistry: REGISTRY,
    now: new Date(freezeAt),
    freezeAt: new Date(freezeAt),
  })
}
const FIXTURE_ACTIVATION_READINESS = value => ({
  scope: 'release',
  profileId: PLAN.deploymentProfileBinding.profile.id,
  profileDigest: PLAN.deploymentProfileBinding.profile.sha256,
  policyDigest: PLAN.deploymentProfileBinding.externalActivationPolicy.sha256,
  ready: true,
  requiredCount: value.requirements.length,
  activatedCount: value.requirements.filter(item => item.status === 'activated').length,
  blockers: [],
  digest: sha256(stableStringify(value, 0)),
})
const FIXTURE_ACTIVATION_CARRIER_VALIDATOR = (baseline, current) => {
  assert.equal(current.requirements.length, baseline.requirements.length)
  for (let index = 0; index < current.requirements.length; index += 1) {
    const before = baseline.requirements[index]
    const after = current.requirements[index]
    if (before.status === 'not-activated' && after.status === 'activated') continue
    if (stableStringify(after, 0) !== stableStringify(before, 0)) {
      throw new Error('fixture activation carrier is stale or substituted')
    }
  }
  return true
}
const FIXTURE_CONTRACT_VALIDATORS = {
  'release-trust-preflight-v4': value => value.kind === 'fixture-release-trust-preflight',
  'rollout-completion-attestation-v1': value => value.kind === 'fixture-rollout-completion',
  'fleet-recovery-authorization-v2': value => value.kind === 'fixture-fleet-recovery-authorization',
  'fleet-reconcile-journal-v6': value => value.kind === 'fixture-fleet-reconcile-journal',
}

const RESOLVED_INTEGRATIONS = Object.fromEntries(Object.entries(DESIRED.integrations).map(([name, integration], index) => [
  name,
  { id: integration.id ?? 9000 + index, slug: integration.slug },
]))

function fixtureRulesets() {
  return AUTHORITY_PROFILE.rulesets.map(source => {
    const ruleset = structuredClone(source)
    delete ruleset.rollout
    ruleset.rules = ruleset.rules.map(rule => {
      if (rule.type !== 'required_status_checks' || !rule.parameters?.fromProfile) return rule
      const parameters = structuredClone(rule.parameters)
      delete parameters.fromProfile
      parameters.required_status_checks = AUTHORITY_PROFILE.requiredChecks.map(check => ({
        context: check.context,
        integration_id: RESOLVED_INTEGRATIONS[check.integration].id,
      })).sort((left, right) => compareUtf8Bytes(left.context, right.context))
      return { ...rule, parameters }
    }).sort((left, right) => compareUtf8Bytes(`${left.type}:${stableStringify(left, 0)}`, `${right.type}:${stableStringify(right, 0)}`))
    ruleset.bypass_actors = (ruleset.bypass_actors ?? []).sort((left, right) => compareUtf8Bytes(stableStringify(left, 0), stableStringify(right, 0)))
    return ruleset
  }).sort((left, right) => compareUtf8Bytes(left.name, right.name))
}

function requiredCheckReadbacks() {
  return AUTHORITY_PROFILE.requiredChecks.map((check, index) => {
    const integration = RESOLVED_INTEGRATIONS[check.integration]
    const runId = String(7000 + index)
    const producer = {
      name: check.context,
      head_sha: PR_HEAD,
      status: 'completed',
      conclusion: 'success',
      app: { id: integration.id, slug: integration.slug },
      external_id: check.trustSource === 'protected-base-workflow'
        ? `governance-check-v1|ajenchen/design-system/${check.workflow}@refs/heads/main|${PR_HEAD}|${PR_HEAD}|${runId}|1`
        : null,
      details_url: `https://github.com/ajenchen/design-system/actions/runs/${runId}`,
      workflowRun: check.trustSource === 'repository-workflow' ? {
        id: Number(runId),
        path: check.workflow,
        head_sha: PR_HEAD,
        event: check.requiredEvents[0],
        status: 'completed',
        conclusion: 'success',
      } : null,
    }
    return {
      context: check.context,
      checkRunId: String(8000 + index),
      completedAt: '2026-07-27T11:15:00.000Z',
      producer,
      producerBindingDigest: sha256(stableStringify(producer, 0)),
    }
  })
}

function policySnapshot(headSha, observedAt) {
  const rulesets = fixtureRulesets()
  return {
    observedAt,
    repositoryMetadata: { fullName: 'ajenchen/design-system', defaultBranch: 'main', visibility: 'public', headSha },
    rulesets,
    rulesetsDigest: sha256(stableStringify(rulesets, 0)),
  }
}

function coverageProof({ complete }) {
  return {
    schemaVersion: 4,
    evidenceKind: 'deep-audit-coverage-verification',
    runId: CERT_RUN.manifest.runId,
    manifestSha256: CERT_RUN.manifestSha256,
    head: CERT_RUN.manifest.head,
    tree: CERT_RUN.manifest.tree,
    inventoryDigest: CERT_RUN.manifest.inventoryDigest,
    rubricDigest: CERT_RUN.manifest.rubricDigest,
    worktreeFingerprint: CERT_RUN.manifest.worktreeFingerprint,
    authorProvider: CERT_RUN.manifest.authorProvider,
    providerIdentityDigest: CERT_RUN.manifest.providerIdentityDigest,
    providers: { self: 'claude', peer: 'codex' },
    tiers: {
      deterministic: COVERAGE_TOPOLOGY.deterministic.length,
      pureJudgment: COVERAGE_TOPOLOGY.pureJudgment.length,
      hookEnforced: COVERAGE_TOPOLOGY.hookEnforced.length,
      ciEnforced: COVERAGE_TOPOLOGY.ciEnforced.length,
    },
    componentCount: 1,
    gaps: {
      deterministic: [], judgment: { claude: [], codex: [] }, hookResidue: [],
      ciEnforced: complete ? [] : [...COVERAGE_TOPOLOGY.ciEnforced], componentA1b: { claude: [], codex: [] },
    },
    totalGaps: complete ? 0 : 2,
    coverageStatus: complete ? 'complete' : 'incomplete',
    complianceStatus: 'clean',
    promotionEligible: complete,
    status: complete ? 'complete-clean' : 'incomplete',
    findings: { judgment: 0, componentA1b: 0, hookWarnings: 0, hookBlocking: 0 },
    trustDowngrades: { untrustedDependencies: 0, unverifiedContainment: 0, unverifiedModelCoverage: 0 },
  }
}

function certificationDependencies() {
  return {
    schemaVersion: 1,
    kind: 'frozen-dependency-trust',
    activeRun: structuredClone(CERT_BINDING),
    status: 'trusted',
    materialization: 'clean-npm-ci-from-frozen-lockfile',
    lockfileSha256: LOCKFILE_SHA256,
    installedDependencyIdentityDigest: EVIDENCE_SHA('cert-installed-dependencies'),
    registryIntegrityDigest: EVIDENCE_SHA('cert-registry-integrity'),
    installTranscriptSha256: EVIDENCE_SHA('cert-install-transcript'),
    cleanup: true,
  }
}

function managedCiBootstrapReadback() {
  return {
    schemaVersion: 1,
    kind: 'managed-ci-two-pr-bootstrap-readback',
    requirementId: 'activate-managed-ci-trusted-execution',
    repository: 'ajenchen/design-system',
    workflowPath: '.github/workflows/deep-audit-managed.yml',
    workflowRef: 'refs/heads/main',
    controlPlaneCommit: CONTROL_PLANE_COMMIT,
    controlPlaneTree: CONTROL_PLANE_TREE,
    workflowIdentityDigest: WORKFLOW_IDENTITY_DIGEST,
    workflowRunId: '6001',
    runAttempt: 1,
    activationEvidenceSha256: ACTIVATION_EVIDENCE_SHA256,
    protectedMainMergedAt: '2026-07-20T00:48:00.000Z',
    activationObservedAt: ACTIVATION_OBSERVED_AT,
    releaseMutationsObserved: false,
    candidateSelfCertificationAllowed: false,
    executionClassReceiptDigests: structuredClone(ACTIVATION_CLASS_RECEIPTS),
    ...structuredClone(ACTIVATION_CLOSURE),
  }
}

function managedCiBrokerEvidence(rows, modelArtifacts) {
  const modelIdentityIndex = rows.map(row => ({
    providerId: row.providerId,
    requestModelId: row.requestModelId,
    observedResponseModelId: row.observedResponseModelId,
    modelIdentityPolicyDigest: row.modelIdentityPolicyDigest,
  }))
  const modelReleaseIndex = rows.map(row => ({
    providerId: row.providerId,
    modelReleaseId: row.modelReleaseId,
    modelReleaseBindingDigest: row.modelReleaseBindingDigest,
    modelReleaseRegistryDigest: row.modelReleaseRegistryDigest,
  }))
  const modelAuthorityIndex = rows.map(row => ({
    providerId: row.providerId,
    modelReleaseAuthorityBindingDigest: row.modelReleaseAuthorityBindingDigest,
    effectivePromotionBindingDigest: row.effectivePromotionBindingDigest,
    modelReleaseValidFrom: row.modelReleaseValidFrom,
    modelReleaseValidUntil: row.modelReleaseValidUntil,
    providerInvocationWindow: row.providerInvocationWindow,
    exchangeInvocationObservations: row.exchangeInvocationObservations,
    modelAuthorityReceiptDigest: row.modelAuthorityReceiptDigest,
    modelAuthorityReadbackDigest: row.modelAuthorityReadbackDigest,
    modelAuthorityRevocationRegistryDigest: row.modelAuthorityRevocationRegistryDigest,
    modelAuthorityRevocationReadbackDigest: row.modelAuthorityRevocationReadbackDigest,
    modelAuthorityAuditReadbackDigest: row.modelAuthorityAuditReadbackDigest,
    modelAuthorityReplayLedgerReceiptDigest: row.modelAuthorityReplayLedgerReceiptDigest,
    providerInvocationWindowDigest: row.providerInvocationWindowDigest,
    exchangeInvocationObservationsDigest: row.exchangeInvocationObservationsDigest,
    modelAuthorityPolicyDigest: row.modelAuthorityPolicyDigest,
    modelAuthorityBindingSchemaDigest: row.modelAuthorityBindingSchemaDigest,
    modelAuthorityIssuerRegistryDigest: row.modelAuthorityIssuerRegistryDigest,
  }))
  return {
    brokerPlanDigest: rows[0].brokerPlanDigest,
    invocationProfileRegistryDigest: rows[0].invocationRegistryDigest,
    modelIdentityIndexDigest: sha256(stableStringify(modelIdentityIndex, 0)),
    modelReleaseIndexDigest: sha256(stableStringify(modelReleaseIndex, 0)),
    modelAuthorityIndexDigest: sha256(stableStringify(modelAuthorityIndex, 0)),
    promptIndexDigest: sha256(stableStringify(rows.map(row => row.shardSetDigest), 0)),
    resultIndexDigest: sha256(stableStringify(rows.map(row => row.shardResultDigest), 0)),
    dependencySourceInventoryDigest: sha256(stableStringify(rows.map(row => row.dependencySourceInventoryDigest).filter(value => value !== null), 0)),
    managedReceiptSetDigest: sha256(stableStringify(modelArtifacts.map(item => item.receiptBindingSha256), 0)),
    transcriptIndexDigest: sha256(stableStringify(rows, 0)),
    brokerReceiptSetDigest: sha256(stableStringify(rows.map(row => row.brokerReceiptSha256), 0)),
    claimReceiptSetDigest: sha256(stableStringify(rows.map(row => row.claimReceiptDigest).filter(value => value !== null), 0)),
  }
}

function refreshManagedCiIndex(index) {
  index.artifactSetSha256 = sha256(stableStringify(index.artifacts, 0))
  index.modelTranscriptSetSha256 = sha256(stableStringify(index.modelTranscriptArtifacts, 0))
  index.dependencyEvidence.managedReceiptSetDigest = sha256(stableStringify([
    index.dependencyEvidence.acquisitionReceipt.receiptBindingSha256,
    ...index.artifacts.map(item => item.receiptBindingSha256),
  ], 0))
  const modelArtifacts = index.artifacts.filter(item => item.executionClass === 'model-broker')
  if (index.modelTranscriptArtifacts.length > 0) index.brokerEvidence = managedCiBrokerEvidence(index.modelTranscriptArtifacts, modelArtifacts)
  else {
    for (const key of Object.keys(index.brokerEvidence)) index.brokerEvidence[key] = sha256(stableStringify([], 0))
  }
  index.indexSha256 = stagedRolloutManagedCiIndexDigest(index)
  return index
}

function managedCiEvidenceIndex(coverage, dependencies, timestamp) {
  const dependencyIdentity = {
    lockfileSha256: dependencies.lockfileSha256,
    installedLockfileSha256: dependencies.lockfileSha256,
    installedDependencyIdentityDigest: dependencies.installedDependencyIdentityDigest,
    installedPackageCount: 17,
  }
  const dependencyBundleDigest = sha256(stableStringify(dependencyIdentity, 0))
  const artifact = ({ evidenceKind, providerId = null, dimension = null, component = null }) => {
    const executionClass = ['deep-audit-judgment', 'deep-audit-component-a1b'].includes(evidenceKind) ? 'model-broker' : 'deterministic-hook-audit'
    const subject = dimension ?? component
    const category = evidenceKind === 'deep-audit-deterministic' ? 'deterministic'
      : evidenceKind === 'deep-audit-hook-residue' ? 'hook-residue'
        : evidenceKind === 'deep-audit-judgment' ? 'judgment' : 'component-a1b'
    const path = evidenceKind === 'deep-audit-deterministic' ? `deterministic/dim-${dimension}.json`
      : evidenceKind === 'deep-audit-hook-residue' ? `hook-residue/dim-${dimension}.json`
        : evidenceKind === 'deep-audit-judgment' ? `judgment/${providerId}/dim-${dimension}.json`
          : `component-a1b/${providerId}/${component}.json`
    return {
      evidenceKind, executionClass, providerId, dimension, component, path,
      sha256: EVIDENCE_SHA(`managed-${category}-${providerId ?? 'generic'}-${subject}`),
      receiptBindingSha256: EVIDENCE_SHA(`managed-${category}-${providerId ?? 'generic'}-receipt-${subject}`),
      dependencyBundleDigest,
    }
  }
  const artifacts = [
    ...COVERAGE_TOPOLOGY.deterministic.map(dimension => artifact({ evidenceKind: 'deep-audit-deterministic', dimension })),
    ...COVERAGE_TOPOLOGY.hookEnforced.map(dimension => artifact({ evidenceKind: 'deep-audit-hook-residue', dimension })),
    ...['claude', 'codex'].flatMap(providerId => [
      ...COVERAGE_TOPOLOGY.pureJudgment.map(dimension => artifact({ evidenceKind: 'deep-audit-judgment', providerId, dimension })),
      artifact({ evidenceKind: 'deep-audit-component-a1b', providerId, component: 'Fixture' }),
    ]),
  ]
  const brokerPlanDigest = EVIDENCE_SHA('broker-plan')
  const invocationRegistryDigest = EVIDENCE_SHA('broker-profile-registry')
  const brokerProfileDigest = EVIDENCE_SHA('broker-profile-catalog')
  const resultSchemaSha256 = EVIDENCE_SHA('broker-result-schema')
  const modelArtifacts = artifacts.filter(item => item.executionClass === 'model-broker')
  const modelTranscriptArtifacts = modelArtifacts.map((item, rowIndex) => {
    const taskKind = item.evidenceKind === 'deep-audit-judgment' ? 'judgment' : 'component-a1b'
    const subject = taskKind === 'judgment' ? item.dimension : item.component
    const transcriptSha256 = EVIDENCE_SHA(`transcript-${taskKind}-${item.providerId}-${subject}`)
    const providerInvocationWindow = {
      startedAt: '2026-07-21T00:10:00.000Z',
      finishedAt: '2026-07-21T00:12:00.000Z',
    }
    const exchangeInvocationObservations = Array.from({ length: 2 }, (_, index) => ({
      shardId: EVIDENCE_SHA(`authority-shard-${taskKind}-${item.providerId}-${subject}-${index}`),
      providerRunId: `authority-provider-run-${taskKind}-${item.providerId}-${subject}-${index}`,
      responseSha256: EVIDENCE_SHA(`authority-response-${taskKind}-${item.providerId}-${subject}-${index}`),
      observedAt: `2026-07-21T00:11:0${index}.000Z`,
    }))
    return {
      evidencePath: item.path,
      evidenceSha256: item.sha256,
      evidenceKind: item.evidenceKind,
      providerId: item.providerId,
      providerRuntime: `${item.providerId}-fixture-runtime`,
      requestModelId: `${item.providerId}-fixture-model-20260721`,
      observedResponseModelId: `${item.providerId}-fixture-model-20260721`,
      modelIdentityPolicyDigest: EVIDENCE_SHA(`model-identity-policy-${item.providerId}`),
      modelReleaseId: `${item.providerId}/${item.providerId}-fixture-model-20260721`,
      modelReleaseBindingDigest: EVIDENCE_SHA(`model-release-binding-${item.providerId}`),
      modelReleaseRegistryDigest: EVIDENCE_SHA('model-release-registry'),
      modelReleaseAuthorityBindingDigest: EVIDENCE_SHA(`model-authority-binding-${taskKind}-${item.providerId}-${subject}`),
      effectivePromotionBindingDigest: EVIDENCE_SHA(`effective-promotion-binding-${taskKind}-${item.providerId}-${subject}`),
      modelReleaseValidFrom: '2026-07-21T00:00:00.000Z',
      modelReleaseValidUntil: '2026-07-21T01:00:00.000Z',
      providerInvocationWindow,
      exchangeInvocationObservations,
      modelAuthorityReceiptDigest: EVIDENCE_SHA(`model-authority-receipt-${taskKind}-${item.providerId}-${subject}`),
      modelAuthorityReadbackDigest: EVIDENCE_SHA(`model-authority-readback-${taskKind}-${item.providerId}-${subject}`),
      modelAuthorityRevocationRegistryDigest: EVIDENCE_SHA(`model-authority-revocation-registry-${taskKind}-${item.providerId}-${subject}`),
      modelAuthorityRevocationReadbackDigest: EVIDENCE_SHA(`model-authority-revocation-readback-${taskKind}-${item.providerId}-${subject}`),
      modelAuthorityAuditReadbackDigest: EVIDENCE_SHA(`model-authority-audit-${taskKind}-${item.providerId}-${subject}`),
      modelAuthorityReplayLedgerReceiptDigest: EVIDENCE_SHA(`model-authority-replay-${taskKind}-${item.providerId}-${subject}`),
      providerInvocationWindowDigest: sha256(stableStringify(providerInvocationWindow, 0)),
      exchangeInvocationObservationsDigest: sha256(stableStringify(exchangeInvocationObservations, 0)),
      modelAuthorityPolicyDigest: EVIDENCE_SHA('model-authority-policy'),
      modelAuthorityBindingSchemaDigest: EVIDENCE_SHA('model-authority-binding-schema'),
      modelAuthorityIssuerRegistryDigest: EVIDENCE_SHA('model-authority-issuer-registry'),
      runtimeCertificationDigest: EVIDENCE_SHA(`runtime-certification-${item.providerId}`),
      profileDigest: EVIDENCE_SHA(`selected-profile-${item.providerId}`),
      runId: CERT_RUN.manifest.runId,
      manifestSha256: CERT_RUN.manifestSha256,
      taskKind,
      subject,
      transcriptPath: `${taskKind}/${item.providerId}/_transcripts/${transcriptSha256}.json`,
      transcriptSha256,
      transcriptBytes: 1000 + rowIndex,
      coverageInventoryDigest: EVIDENCE_SHA(`coverage-${taskKind}-${subject}`),
      brokerPlanDigest,
      invocationRegistryDigest,
      brokerProfileDigest,
      resultSchemaSha256,
      shardSetDigest: EVIDENCE_SHA(`shard-set-${taskKind}-${item.providerId}-${subject}`),
      shardCount: 2,
      shardResultDigest: EVIDENCE_SHA(`shard-result-${taskKind}-${item.providerId}-${subject}`),
      reductionDigest: EVIDENCE_SHA(`reduction-${taskKind}-${item.providerId}-${subject}`),
      managedAttestationDigest: EVIDENCE_SHA(`managed-attestation-${taskKind}-${item.providerId}-${subject}`),
      dependencyBundleDigest,
      dependencySourceInventoryDigest: taskKind === 'component-a1b' ? EVIDENCE_SHA(`dependency-source-${subject}`) : null,
      claimReceiptDigest: taskKind === 'component-a1b' ? EVIDENCE_SHA(`claim-receipt-${item.providerId}-${subject}`) : null,
      brokerReceiptSha256: EVIDENCE_SHA(`broker-receipt-${taskKind}-${item.providerId}-${subject}`),
    }
  })
  const index = {
    schemaVersion: 1,
    kind: 'managed-ci-pr-head-evidence-index',
    source: { runId: CERT_RUN.manifest.runId, manifestSha256: CERT_RUN.manifestSha256, head: CERT_RUN.manifest.head, tree: CERT_RUN.manifest.tree },
    executor: {
      repository: 'ajenchen/design-system', workflowPath: '.github/workflows/deep-audit-managed.yml',
      workflowRef: 'refs/heads/main', event: 'workflow_dispatch', controlPlaneCommit: CONTROL_PLANE_COMMIT,
      controlPlaneTree: CONTROL_PLANE_TREE, workflowIdentityDigest: WORKFLOW_IDENTITY_DIGEST,
      workflowRunId: '6101', runAttempt: 1, subjectCommit: CERT_RUN.manifest.head, subjectTree: CERT_RUN.manifest.tree,
    },
    activation: {
      requirementId: 'activate-managed-ci-trusted-execution', evidenceSha256: ACTIVATION_EVIDENCE_SHA256,
      observedAt: ACTIVATION_OBSERVED_AT, executionClassReceiptDigests: structuredClone(ACTIVATION_CLASS_RECEIPTS),
      ...structuredClone(ACTIVATION_CLOSURE),
    },
    dependencyEvidence: {
      proofSha256: sha256(stableStringify(dependencies, 0)), lockfileSha256: dependencies.lockfileSha256,
      installedLockfileSha256: dependencies.lockfileSha256,
      installedDependencyIdentityDigest: dependencies.installedDependencyIdentityDigest,
      installedPackageCount: dependencyIdentity.installedPackageCount,
      registryIntegrityDigest: dependencies.registryIntegrityDigest, installTranscriptSha256: dependencies.installTranscriptSha256,
      dependencyBundleDigest,
      acquisitionReceipt: {
        executionClass: 'dependency-acquisition', evidenceKind: 'dependency-bundle',
        path: 'dependency-acquisition/receipt.json', sha256: EVIDENCE_SHA('dependency-acquisition-receipt-artifact'),
        receiptBindingSha256: EVIDENCE_SHA('dependency-acquisition-receipt-binding'),
      },
      bundleArtifact: {
        kind: 'managed-ci-dependency-bundle-manifest', path: 'dependency-acquisition/bundle-manifest.json',
        sha256: EVIDENCE_SHA('dependency-bundle-manifest-artifact'), bindingSha256: EVIDENCE_SHA('dependency-bundle-manifest-binding'),
      },
      managedReceiptSetDigest: '0'.repeat(64),
    },
    brokerEvidence: managedCiBrokerEvidence(modelTranscriptArtifacts, modelArtifacts),
    artifacts,
    artifactSetSha256: sha256(stableStringify(artifacts, 0)),
    modelTranscriptArtifacts,
    modelTranscriptSetSha256: sha256(stableStringify(modelTranscriptArtifacts, 0)),
    observedAt: timestamp,
    indexSha256: '0'.repeat(64),
  }
  return refreshManagedCiIndex(index)
}

function artifactValue(contract, phase, candidate, previousGood, verification) {
  const timestamp = observedAt(phase.index)
  const requiredChecks = requiredCheckReadbacks()
  if (contract === 'staged-rollout-prepare-verification-v4') return verification
  if (contract === 'github-policy-bootstrap-readback-v1') {
    return {
      schemaVersion: 1, kind: 'github-policy-bootstrap-readback', repository: 'ajenchen/design-system',
      desiredStateDigest: sha256(stableStringify(DESIRED, 0)), resolvedIntegrations: structuredClone(RESOLVED_INTEGRATIONS),
      policySnapshot: policySnapshot('9'.repeat(40), '2026-07-20T01:50:00.000Z'),
      deploymentProfileBinding: structuredClone(PLAN.deploymentProfileBinding),
      activationBaselineSha256: verification.bootstrapPrerequisite.activationBaseline.sha256,
      activation: structuredClone(ACTIVATION_FIXTURE), activationDigest: sha256(stableStringify(ACTIVATION_FIXTURE, 0)),
      managedCiBootstrap: managedCiBootstrapReadback(),
      eligible: true, observedAt: timestamp,
    }
  }
  if (contract === 'protected-pr-readback-v1') {
    const repository = INVENTORY.repositories.find(item => item.id === 'design-system')
    const proof = buildRepositorySubjectProof(repository, {
      subjectCommit: PR_HEAD,
      subjectTree: SOURCE_TREE,
      carrierCommit: PR_HEAD,
      carrierTree: SOURCE_TREE,
    })
    return {
      schemaVersion: 1, kind: 'protected-pr-readback', repository: 'ajenchen/design-system', pullRequestNumber: 42,
      baseBranch: 'main', status: 'open', sourceCommit: PR_HEAD,
      sourceTree: SOURCE_TREE, mergeCommit: null,
      preparedRun: structuredClone(ACTIVE_BINDING), preparedInventoryDigest: ACTIVE_RUN.manifest.inventoryDigest,
      gitObjectProof: structuredClone(GIT_OBJECT_PROOF),
      repositoryIdentity: { gitCommit: PR_HEAD, gitTree: SOURCE_TREE, subjectProofs: { [PR_HEAD]: proof } },
      observedAt: timestamp,
    }
  }
  if (contract === 'pr-head-certification-v1') {
    const coverage = coverageProof({ complete: false })
    const dependencies = certificationDependencies()
    return {
      schemaVersion: 1, kind: 'pr-head-certification', certificationRun: structuredClone(CERT_BINDING),
      sourceCommit: PR_HEAD, sourceTree: SOURCE_TREE, coverage, dependencies,
      managedCiEvidenceIndex: managedCiEvidenceIndex(coverage, dependencies, timestamp), observedAt: timestamp,
    }
  }
  if (contract === 'github-hard-gates-readback-v1') {
    return {
      schemaVersion: 1, kind: 'github-hard-gates-readback', repository: 'ajenchen/design-system',
      pullRequestNumber: 42, headCommit: PR_HEAD, sourceCommit: MERGE_COMMIT, sourceTree: SOURCE_TREE,
      mergedAt: '2026-07-27T11:30:00.000Z',
      desiredStateDigest: sha256(stableStringify(DESIRED, 0)), resolvedIntegrations: structuredClone(RESOLVED_INTEGRATIONS),
      postMergePolicy: policySnapshot(MERGE_COMMIT, '2026-07-27T11:40:00.000Z'),
      requiredChecks, requiredChecksDigest: sha256(stableStringify(requiredChecks, 0)), eligible: true, observedAt: timestamp,
    }
  }
  if (contract === 'release-trust-preflight-v4') return { schemaVersion: 4, kind: 'fixture-release-trust-preflight', observedAt: timestamp }
  if (contract === 'release-bom-v5') return JSON.parse(Buffer.from(candidate.bom.bytes, 'base64').toString('utf8'))
  if (contract === 'verified-immutable-release-v2') return candidate.verifiedReleaseEvidence.value
  if (contract === 'consumer-governance-bootstrap-readback-v1') {
    const bom = JSON.parse(Buffer.from(candidate.bom.bytes, 'base64').toString('utf8'))
    return {
      schemaVersion: 1,
      kind: 'consumer-governance-bootstrap-readback',
      repositoryId: 'work-management',
      repository: 'ajenchen/work-management',
      protocolId: CONSUMER_UPGRADE_PROTOCOL.protocolId,
      protocolSpecificationSha256: CONSUMER_UPGRADE_PROTOCOL_SHA256,
      protocolSchemaSha256: CONSUMER_UPGRADE_PROTOCOL_SCHEMA_SHA256,
      protocolImplementationSha256: CONSUMER_UPGRADE_PROTOCOL_IMPLEMENTATION_SHA256,
      bootstrapMode: 'one-time-reviewed-full-snapshot-pr',
      baseDefaultBranchHeadSha: '7'.repeat(40),
      pullRequestNumber: 84,
      pullRequestHeadSha: '6'.repeat(40),
      mergeCommitSha: '8'.repeat(40),
      mergeTreeSha: '9'.repeat(40),
      defaultBranchHeadSha: '8'.repeat(40),
      candidateSourceCommit: candidate.candidateRelease.sourceCommit,
      candidateSourceTree: candidate.candidateRelease.sourceTree,
      version: candidate.candidateRelease.version,
      consumerLockSha256: bom.governance.consumer.sha256,
      forkCorpusLockSha256: bom.governance.forkCorpus.sha256,
      templateStaticTreeSha256: bom.governance.productTemplateScaffold.staticTreeSha256,
      fullSnapshotPlanDigest: EVIDENCE_SHA('wm-bootstrap-plan'),
      materializedGovernanceTreeSha256: EVIDENCE_SHA('wm-bootstrap-governance-tree'),
      requiredChecksDigest: EVIDENCE_SHA('wm-bootstrap-required-checks'),
      reviewAuthorization: {
        kind: 'independent-engineering-attestation',
        actorId: 'fixture-independent-reviewer',
        authorizationDigest: EVIDENCE_SHA('wm-bootstrap-independent-engineering-attestation'),
        authorizedAt: '2026-07-27T14:15:00.000Z',
      },
      legacySelfUpdateUsed: false,
      candidateCodeExecuted: false,
      eligible: true,
      mergedAt: '2026-07-27T14:30:00.000Z',
      observedAt: timestamp,
    }
  }
  if (contract === 'template-exact-version-upgrade-v2' || contract === 'wm-exact-version-canary-v2') {
    const template = contract === 'template-exact-version-upgrade-v2'
    const bom = JSON.parse(Buffer.from(candidate.bom.bytes, 'base64').toString('utf8'))
    const profileId = template ? 'new-snapshot-v2' : 'legacy-bootstrap-v2'
    const bootstrapValue = template ? null : artifactValue('consumer-governance-bootstrap-readback-v1', phase, candidate, previousGood, verification)
    const bootstrapArtifact = bootstrapValue ? stagedRolloutArtifact(bootstrapValue, { trailingNewline: false }) : null
    return {
      schemaVersion: 2, kind: 'exact-version-upgrade-readback-v2',
      repositoryId: template ? 'ds-product-template' : 'work-management',
      repository: template ? 'ajenchen/ds-product-template' : 'ajenchen/work-management',
      role: template ? 'template-mirror' : 'product-consumer',
      sourceCommit: candidate.candidateRelease.sourceCommit, sourceTree: candidate.candidateRelease.sourceTree,
      version: candidate.candidateRelease.version, packages: candidate.candidateRelease.packages,
      defaultBranchHeadSha: '8'.repeat(40), provenanceDigest: EVIDENCE_SHA(`${contract}-provenance`),
      lockfileDigest: EVIDENCE_SHA(`${contract}-lockfile`),
      upgradeProtocol: {
        protocolId: CONSUMER_UPGRADE_PROTOCOL.protocolId,
        specificationSha256: CONSUMER_UPGRADE_PROTOCOL_SHA256,
        schemaSha256: CONSUMER_UPGRADE_PROTOCOL_SCHEMA_SHA256,
        implementationSha256: CONSUMER_UPGRADE_PROTOCOL_IMPLEMENTATION_SHA256,
        profileId,
        entryMode: CONSUMER_UPGRADE_PROTOCOL.profiles[profileId].entryMode,
        consumerLockSha256: bom.governance.consumer.sha256,
        forkCorpusLockSha256: bom.governance.forkCorpus.sha256,
        templateStaticTreeSha256: bom.governance.productTemplateScaffold.staticTreeSha256,
      },
      bootstrapReadbackSha256: bootstrapArtifact?.sha256 ?? null,
      observedAt: timestamp,
    }
  }
  if (contract === 'rollout-completion-attestation-v1') return { schemaVersion: 1, kind: 'fixture-rollout-completion', phaseId: phase.id }
  if (contract === 'full-deep-audit-verification-v1') {
    const coverage = coverageProof({ complete: true })
    return {
      schemaVersion: 1,
      kind: 'full-deep-audit-verification',
      certificationRun: structuredClone(CERT_BINDING),
      coverage,
      ciImport: {
        schemaVersion: 1,
        kind: 'managed-ci-evidence-import',
        producer: 'verify-deep-audit-coverage',
        sourceWorkflow: '.github/workflows/ci.yml',
        workflowRunId: '9001',
        workflowRunAttempt: 1,
        sourceHead: CERT_RUN.manifest.head,
        sourceTree: CERT_RUN.manifest.tree,
        dimensions: [64, 66],
        artifacts: [64, 66].map(dimension => ({ dimension, path: `ci-enforced/dim-${dimension}.json`, sha256: EVIDENCE_SHA(`ci-${dimension}`) })),
        coverageSha256: sha256(stableStringify(coverage, 0)),
        importedAt: timestamp,
      },
      observedAt: timestamp,
    }
  }
  if (contract === 'candidate-bound-soak-72h-v1') return {
    schemaVersion: 1, kind: 'candidate-bound-soak', candidateReleaseDigest: stagedRolloutReleaseRecordDigest(candidate),
    startedAt: observedAt(8), completedAt: timestamp, minimumHours: 72, elapsedHours: 72,
  }
  if (contract === 'previous-good-release-v1') return previousGood
  if (contract === 'fleet-recovery-authorization-v2') return { schemaVersion: 2, kind: 'fixture-fleet-recovery-authorization' }
  if (contract === 'fleet-reconcile-journal-v6') return { schemaVersion: 6, kind: 'fixture-fleet-reconcile-journal' }
  throw new Error(`missing fixture artifact for ${contract}`)
}

function receiptEvidence(phase, decision, candidate, previousGood, verification) {
  const contracts = phase.id === 'promotion-or-rollback'
    ? phase.evidenceContracts[decision]
    : phase.evidenceContracts.standard
  return contracts.map(contract => {
    let artifact
    if (contract === 'release-bom-v5') artifact = { encoding: 'base64', bytes: candidate.bom.bytes, sha256: candidate.bom.sha256 }
    else if (contract === 'verified-immutable-release-v2') {
      artifact = stagedRolloutArtifact(candidate.verifiedReleaseEvidence.value, { trailingNewline: false })
      assert.equal(artifact.sha256, candidate.verifiedReleaseEvidence.sha256)
    } else artifact = stagedRolloutArtifact(artifactValue(contract, phase, candidate, previousGood, verification), { trailingNewline: false })
    return {
      contract,
      origin: stagedRolloutContract.contractOrigins.get(contract),
      sha256: artifact.sha256,
      uri: `urn:sha256:${artifact.sha256}`,
      artifact: { encoding: artifact.encoding, bytes: artifact.bytes },
    }
  })
}

function evidenceValue(receipt, contract) {
  const reference = receipt.evidence.find(item => item.contract === contract)
  return JSON.parse(Buffer.from(reference.artifact.bytes, 'base64').toString('utf8'))
}

function replaceEvidenceValue(receipt, contract, value) {
  const reference = receipt.evidence.find(item => item.contract === contract)
  const artifact = stagedRolloutArtifact(value, { trailingNewline: false })
  reference.sha256 = artifact.sha256
  reference.uri = `urn:sha256:${artifact.sha256}`
  reference.artifact = { encoding: artifact.encoding, bytes: artifact.bytes }
}

function refreshPrepareVerification(ledger) {
  ledger.prepareVerification.freeze.sha256 = sha256(stableStringify(ledger.prepareVerification.freeze.value, 0))
  replaceEvidenceValue(ledger.receipts[0], 'staged-rollout-prepare-verification-v4', ledger.prepareVerification)
  resignFrom(ledger, 0)
}

function refreshAuthorityBootstrapReplayReceipt(receipt) {
  const unsigned = structuredClone(receipt)
  delete unsigned.receiptDigest
  receipt.receiptDigest = sha256(
    `qijenchen-authority-policy-bootstrap-durable-replay-v1\n${stableStringify(unsigned, 0)}`,
  )
  return receipt
}

function refreshAuthorityBootstrapReplayEvidence(ledger) {
  const evidence = ledger.prepareVerification.authorityBootstrapReplay
  refreshAuthorityBootstrapReplayReceipt(evidence.value)
  evidence.sha256 = sha256(stableStringify(evidence.value, 0))
  replaceEvidenceValue(
    ledger.receipts[0],
    'staged-rollout-prepare-verification-v4',
    ledger.prepareVerification,
  )
  resignFrom(ledger, 0)
}

function signReceipt(receipt) {
  receipt.authority.signatures = []
  receipt.authority.signatures.push({
    signerKeyId: 'fixture-completion',
    subject: 'fixture-signer',
    signature: sign(null, phaseReceiptSigningPayload(receipt), privateKey).toString('base64url'),
  })
  return receipt
}

function observedAt(index) {
  if (index === 0) return '2026-07-20T00:45:00.000Z'
  if (index <= 7) return `2026-07-27T${String(index + 8).padStart(2, '0')}:00:00.000Z`
  if (index === 8) return '2026-07-28T08:00:00.000Z'
  if (index === 9) return '2026-07-31T08:00:00.000Z'
  return '2026-07-31T09:00:00.000Z'
}

function resignFrom(ledger, start) {
  for (let index = start; index < ledger.receipts.length; index += 1) {
    const receipt = ledger.receipts[index]
    receipt.priorReceiptSha256 = index === 0 ? null : stagedRolloutReceiptDigest(ledger.receipts[index - 1])
    receipt.authority.issuedAt = receipt.observedAt
    receipt.authority.expiresAt = new Date(new Date(receipt.observedAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    signReceipt(receipt)
  }
}

function ledgerFixture({
  decision = 'promotion',
  receiptCount = 11,
  candidate = releaseRecord('2.0.0', '2026-07-27T12:30:00.000Z', 1, { sourceCommit: MERGE_COMMIT, sourceTree: SOURCE_TREE }),
  previousGood = releaseRecord('1.9.0', '2026-07-19T00:00:00.000Z', 4),
} = {}) {
  const verification = prepareVerification()
  const ledger = {
    $schema: 'schemas/staged-rollout.schema.json',
    schemaVersion: 1,
    kind: 'staged-rollout-ledger',
    planSha256: PLAN_SHA256,
    activeRun: structuredClone(ACTIVE_BINDING),
    certificationRun: receiptCount >= 3 ? structuredClone(CERT_BINDING) : null,
    prepareVerification: verification,
    releaseTrain: { candidate: receiptCount >= 5 ? candidate : null, previousGood: receiptCount >= 5 ? previousGood : null },
    receipts: [],
  }
  for (let index = 0; index < receiptCount; index += 1) {
    const phase = PLAN.phases[index]
    const phaseDecision = phase.id === 'promotion-or-rollback' ? decision : null
    const timestamp = observedAt(index)
    const receipt = {
      schemaVersion: 1,
      kind: 'staged-rollout-phase-receipt',
      phaseId: phase.id,
      phaseIndex: index,
      decision: phaseDecision,
      planSha256: PLAN_SHA256,
      priorReceiptSha256: index === 0 ? null : stagedRolloutReceiptDigest(ledger.receipts[index - 1]),
      activeRun: structuredClone(index < 3 ? ACTIVE_BINDING : CERT_BINDING),
      actor: { id: 'fixture-signer', kind: 'workload', authorityRole: 'completion-attestor' },
      authority: {
        issuerRegistryDigest: POLICY.issuerRegistryDigest,
        issuedAt: timestamp,
        expiresAt: new Date(new Date(timestamp).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        signatures: [],
      },
      candidateReleaseDigest: index < 5 ? null : stagedRolloutReleaseRecordDigest(candidate),
      observedAt: timestamp,
      evidence: receiptEvidence(phase, phaseDecision, candidate, previousGood, verification),
    }
    ledger.receipts.push(signReceipt(receipt))
  }
  return ledger
}

function validate(ledger, { repoRoot = process.cwd(), verifyMechanisms = true } = {}) {
  return validateStagedRolloutLedger(PLAN, ledger, {
    activeRun: ACTIVE_RUN,
    certificationRun: CERT_RUN,
    issuerRegistry: REGISTRY,
    attestationPolicy: POLICY,
    now: NOW,
    repoRoot,
    verifyMechanisms,
    activationReadinessResolver: FIXTURE_ACTIVATION_READINESS,
    activationCarrierValidator: FIXTURE_ACTIVATION_CARRIER_VALIDATOR,
    contractValidators: FIXTURE_CONTRACT_VALIDATORS,
  })
}

function isolatedGovernanceRepo(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'staged-rollout-consumer-profile-'))
  mkdirSync(resolve(root, 'infra'), { recursive: true })
  cpSync(resolve(process.cwd(), 'infra/governance'), resolve(root, 'infra/governance'), { recursive: true })
  for (const path of ['.github', 'packages', 'scripts', 'template']) cpSync(resolve(process.cwd(), path), resolve(root, path), { recursive: true })
  for (const path of ['package.json', 'package-lock.json']) cpSync(resolve(process.cwd(), path), resolve(root, path))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function writeWmUpgradeProfile(repoRoot, profileId, acceptedBootstrapReadbackSha256) {
  const path = resolve(repoRoot, 'infra/governance/inventory/managed-repos.json')
  const inventory = JSON.parse(readFileSync(path, 'utf8'))
  const wm = inventory.repositories.find(repository => repository.id === 'work-management')
  wm.upgradeProtocolProfile = profileId
  if (acceptedBootstrapReadbackSha256 === undefined) delete wm.acceptedBootstrapReadbackSha256
  else wm.acceptedBootstrapReadbackSha256 = acceptedBootstrapReadbackSha256
  writeFileSync(path, `${JSON.stringify(inventory, null, 2)}\n`)
}

function mutateGovernanceJson(repoRoot, repoPath, mutate) {
  const path = resolve(repoRoot, repoPath)
  const value = JSON.parse(readFileSync(path, 'utf8'))
  mutate(value)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
  return value
}

function writeExternalCertifiedAuthorityLedger(repoRoot) {
  return mutateGovernanceJson(repoRoot, 'infra/governance/providers/certifications.json', (ledger) => {
    const certification = ledger.certifications.find(item => item.id === 'codex-cloud-governance-v1')
    assert.ok(certification, 'fixture requires the authority Codex Cloud certification record')
    const target = certification.platformMatrix[0]
    const artifactSha256 = EVIDENCE_SHA('offline-external-certification-artifact')
    certification.status = 'certified'
    certification.certifiedAt = '2026-07-20T00:30:00.000Z'
    certification.expiresAt = '2026-08-20T00:30:00.000Z'
    certification.platformMatrix = [{
      ...target,
      status: 'certified',
      limitations: [],
    }]
    certification.checks = [{
      id: 'signed-external-runtime-evidence',
      status: 'pass',
      evidence: {
        kind: 'artifact-digest',
        reference: `infra/governance/evidence/external-runtime/${artifactSha256}.json`,
        sha256: artifactSha256,
      },
    }]
    certification.limitations = []
    certification.runtimeEvidence = {
      evidenceKind: 'external-runtime-surface-conformance',
      reference: `infra/governance/evidence/external-runtime/${artifactSha256}.json`,
      artifactSha256,
      evidenceDigest: `sha256:${EVIDENCE_SHA('offline-external-evidence')}`,
      profileId: 'codex-cloud',
      runId: '20000000-0000-4000-8000-000000000001',
      targetId: target.id,
      targetDigest: `sha256:${EVIDENCE_SHA('offline-external-target')}`,
      repositoryId: 'design-system',
      repository: 'ajenchen/design-system',
      repositoryRole: 'authority',
      repositoryReadbackSha256: EVIDENCE_SHA('offline-external-repository-readback'),
      operatingSystem: target.operatingSystem,
      platform: target.platform,
      arch: target.arch,
      executionEnvironment: target.executionEnvironment,
      distributionVersion: target.distributionVersion,
      pathClass: target.pathClass,
      distributionDigest: `sha256:${EVIDENCE_SHA('offline-external-distribution')}`,
      gitCommit: 'a'.repeat(40),
      gitTree: 'b'.repeat(40),
      profileDigest: `sha256:${EVIDENCE_SHA('offline-external-profile')}`,
      harnessDigest: `sha256:${EVIDENCE_SHA('offline-external-harness')}`,
      hardGateContractDigest: `sha256:${EVIDENCE_SHA('offline-external-hard-gate')}`,
    }
  })
}

function withoutGithubQueries(repoRoot, callback) {
  const bin = resolve(repoRoot, '.offline-command-sentinel')
  const marker = resolve(repoRoot, '.github-query-observed')
  mkdirSync(bin, { recursive: true })
  writeFileSync(resolve(bin, 'gh'), '#!/bin/sh\n: > "$STAGED_ROLLOUT_GITHUB_QUERY_SENTINEL"\nexit 97\n', { mode: 0o755 })
  const previousPath = process.env.PATH
  const previousMarker = process.env.STAGED_ROLLOUT_GITHUB_QUERY_SENTINEL
  process.env.PATH = `${bin}:${previousPath ?? ''}`
  process.env.STAGED_ROLLOUT_GITHUB_QUERY_SENTINEL = marker
  try {
    const result = callback()
    assert.equal(existsSync(marker), false, 'offline staged-rollout validation must not query GitHub')
    return result
  } finally {
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
    if (previousMarker === undefined) delete process.env.STAGED_ROLLOUT_GITHUB_QUERY_SENTINEL
    else process.env.STAGED_ROLLOUT_GITHUB_QUERY_SENTINEL = previousMarker
  }
}

function establishedWmLedgerFixture() {
  const ledger = ledgerFixture({ receiptCount: 8 })
  const receipt = ledger.receipts[7]
  const bootstrapReference = receipt.evidence.find(item => item.contract === 'consumer-governance-bootstrap-readback-v1')
  const exact = evidenceValue(receipt, 'wm-exact-version-canary-v2')
  exact.upgradeProtocol.profileId = 'reviewed-bootstrap-established-v2'
  exact.upgradeProtocol.entryMode = CONSUMER_UPGRADE_PROTOCOL.profiles['reviewed-bootstrap-established-v2'].entryMode
  exact.bootstrapReadbackSha256 = bootstrapReference.sha256
  exact.defaultBranchHeadSha = 'a'.repeat(40)
  replaceEvidenceValue(receipt, 'wm-exact-version-canary-v2', exact)
  resignFrom(ledger, 7)
  return { ledger, bootstrapReferenceSha256: bootstrapReference.sha256 }
}

test('canonical plan is closed, ordered, plan-default, and points only to existing mechanisms', () => {
  const result = validateStagedRolloutPlan(PLAN)
  assert.equal(result.phaseCount, 11)
  assert.equal(PLAN.defaultMode, 'plan')
  assert.deepEqual(PLAN.phaseOrder, PLAN.phases.map(phase => phase.id))
  const dimensions = [
    ...COVERAGE_TOPOLOGY.deterministic,
    ...COVERAGE_TOPOLOGY.pureJudgment,
    ...COVERAGE_TOPOLOGY.hookEnforced,
    ...COVERAGE_TOPOLOGY.ciEnforced,
  ].sort((left, right) => left - right)
  assert.deepEqual(dimensions, Array.from({ length: 91 }, (_, index) => index + 1))
  assert.equal(new Set(dimensions).size, 91)
  assert.deepEqual(COVERAGE_TOPOLOGY.ciEnforced, [64, 66])
})

test('signed content-addressed promotion ledger validates through the exact 72-hour WM soak', () => {
  const result = validate(ledgerFixture())
  assert.equal(result.nextPhase, null)
  assert.equal(result.releaseStatus, 'RELEASED_PROMOTED')
  assert.equal(result.candidateVersion, '2.0.0')
  assert.equal(result.previousGoodVersion, '1.9.0')
})

test('production-grade candidate target precedes exactly-once All-Harness validation without pre-freeze activation', () => {
  const lifecycle = stagedRolloutProfileLifecycle('PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM')
  assert.equal(lifecycle.activationRequiredBeforeCandidateFreeze, false)
  assert.equal(lifecycle.managedCiBootstrapRequiredBeforeCandidateFreeze, false)
  assert.equal(lifecycle.activationReadbackPhase, 'github-policy-bootstrap')
  assert.deepEqual(lifecycle.candidateValidationLifecycle, PLAN.candidateValidationLifecycle)

  const inactiveReadiness = {
    scope: 'release',
    profileId: PLAN.deploymentProfileBinding.profile.id,
    profileDigest: PLAN.deploymentProfileBinding.profile.sha256,
    policyDigest: PLAN.deploymentProfileBinding.externalActivationPolicy.sha256,
    ready: false,
    requiredCount: ACTIVATION_FIXTURE.requirements.length,
    activatedCount: 0,
    blockers: [{ id: 'fixture-inactive' }],
    digest: sha256(stableStringify(ACTIVATION_FIXTURE, 0)),
  }
  const prerequisite = validateCandidateFreezeBootstrapPrerequisites({
    plan: PLAN,
    activationRequirements: ACTIVATION_FIXTURE,
    readiness: inactiveReadiness,
    attestationPolicy: POLICY,
    issuerRegistry: REGISTRY,
    now: new Date('2026-07-20T00:45:00.000Z'),
    freezeAt: new Date('2026-07-20T00:45:00.000Z'),
  })
  assert.equal(prerequisite.activationRequiredBeforeFreeze, false)
  assert.equal(prerequisite.activationGatePhase, 'github-policy-bootstrap')

  const verification = prepareVerification()
  assert.equal(verification.freeze.value.targetFrozenAt, ACTIVE_RUN.manifest.createdAt)
  const harness = verification.freeze.value.checks.find(check => check.id === 'all-harness')
  const harnessReceipt = JSON.parse(Buffer.from(harness.artifact.bytes, 'base64').toString('utf8'))
  assert.ok(new Date(harnessReceipt.startedAt) >= new Date(verification.freeze.value.targetFrozenAt))
  assert.equal(harnessReceipt.subject.head, ACTIVE_RUN.manifest.head)
  assert.equal(harnessReceipt.subject.tree, ACTIVE_RUN.manifest.tree)
  assert.equal(harness.snapshotBefore.runId, ACTIVE_RUN.manifest.runId)
  assert.equal(harness.snapshotBefore.manifestSha256, ACTIVE_RUN.manifestSha256)
  assert.equal(harnessReceipt.subject.gitVisibleWorktree.digest, harness.result.detail.gitVisibleWorktreeDigest)

  const staleTarget = structuredClone(verification.freeze.value)
  staleTarget.activeRun.worktreeFingerprint = 'f'.repeat(64)
  assert.throws(() => buildStagedRolloutPrepareVerification({
    activeRun: ACTIVE_RUN,
    freeze: staleTarget,
    bootstrapPrerequisite: prerequisite,
    authorityBootstrapReplayReceipt: null,
    authorityBootstrapActivationRequirement: null,
    plan: PLAN,
    attestationPolicy: POLICY,
    issuerRegistry: REGISTRY,
  }), /does not match the current active run/)
})

test('production-grade PR-head certification uses the portable exact-run core without requiring managed CI', () => {
  const ledger = ledgerFixture({ receiptCount: 4 })
  const bootstrap = evidenceValue(ledger.receipts[1], 'github-policy-bootstrap-readback-v1')
  bootstrap.managedCiBootstrap = null
  replaceEvidenceValue(ledger.receipts[1], 'github-policy-bootstrap-readback-v1', bootstrap)
  const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
  certification.managedCiEvidenceIndex = null
  replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
  resignFrom(ledger, 1)

  const result = validate(ledger)
  assert.equal(result.nextPhase, 'merge-post-gates')
  assert.equal(result.releaseStatus, 'NOT_RELEASED')

  const partial = structuredClone(ledger)
  const substituted = evidenceValue(partial.receipts[3], 'pr-head-certification-v1')
  substituted.managedCiEvidenceIndex = managedCiEvidenceIndex(
    substituted.coverage,
    substituted.dependencies,
    substituted.observedAt,
  )
  replaceEvidenceValue(partial.receipts[3], 'pr-head-certification-v1', substituted)
  resignFrom(partial, 3)
  assert.throws(
    () => validate(partial),
    /partial optional managed-CI wrapper/,
  )
})

test('production-grade carrier permits only reviewed activation descendants and maximum profile remains exact-subject', () => {
  const maximum = stagedRolloutProfileLifecycle('MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM')
  assert.equal(maximum.activationRequiredBeforeCandidateFreeze, true)
  assert.equal(maximum.managedCiBootstrapRequiredBeforeCandidateFreeze, true)
  assert.equal(maximum.candidateCarrierRelationship, 'exact-subject')

  const repository = INVENTORY.repositories.find(item => item.id === 'design-system')
  const carrierCommit = 'd'.repeat(40)
  const carrierTree = 'e'.repeat(40)
  const changedPath = 'infra/governance/external-activation-requirements.json'
  const carrierInventory = [
    ...structuredClone(ACTIVE_RUN.manifest.inventory),
    { path: changedPath, kind: 'file', mode: '100644', bytes: 3, sha256: sha256('new') },
  ].sort((left, right) => compareUtf8Bytes(left.path, right.path))
  const certificationRun = {
    manifestSha256: 'd'.repeat(64),
    manifest: {
      ...structuredClone(CERT_RUN.manifest),
      head: carrierCommit,
      tree: carrierTree,
      inventory: carrierInventory,
      inventoryDigest: sha256(stableStringify(carrierInventory, 0)),
    },
  }
  const proof = buildRepositorySubjectProof(repository, {
    subjectCommit: PR_HEAD,
    subjectTree: SOURCE_TREE,
    carrierCommit,
    carrierTree,
    changedFiles: [{ path: changedPath, status: 'added' }],
  })
  const transition = {
    ...artifactValue('protected-pr-readback-v1', PLAN.phases[2], null, null, prepareVerification()),
    sourceCommit: carrierCommit,
    sourceTree: carrierTree,
    repositoryIdentity: {
      gitCommit: carrierCommit,
      gitTree: carrierTree,
      subjectProofs: { [PR_HEAD]: proof },
    },
  }
  const accepted = validateStagedRolloutCandidateCarrier(PLAN, {
    activeRun: ACTIVE_RUN,
    certificationRun,
    sourceTransition: transition,
  })
  assert.deepEqual(accepted.changedPaths, [changedPath])

  const substituted = structuredClone(transition)
  substituted.repositoryIdentity.subjectProofs[PR_HEAD].changedFiles[0].path = 'packages/design-system/src/index.ts'
  assert.throws(() => validateStagedRolloutCandidateCarrier(PLAN, {
    activeRun: ACTIVE_RUN,
    certificationRun,
    sourceTransition: substituted,
  }), /changedFiles\/changedPaths mismatch|changed-file digest mismatch|forbidden path/)
})

test('deployment profile binding rejects stale policy, profile, and release-authorization substitutions', () => {
  assert.equal(resolveStagedRolloutDeploymentProfile(PLAN).id, 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM')
  for (const [label, mutate, expected] of [
    ['profile digest', plan => { plan.deploymentProfileBinding.profile.sha256 = 'f'.repeat(64) }, /profile ID\/digest differs/],
    ['activation policy digest', plan => { plan.deploymentProfileBinding.externalActivationPolicy.sha256 = 'f'.repeat(64) }, /another external activation policy/],
    ['release authorization', plan => { plan.deploymentProfileBinding.releaseAuthorization.maximumSignerQuorum = 2 }, /release authorization projection is stale/],
    ['activation ordering', plan => { plan.deploymentProfileBinding.candidateFreezeActivationOrder = 'profile-activation-before-freeze' }, /ordering is stale or substituted/],
  ]) {
    const poisoned = structuredClone(PLAN)
    mutate(poisoned)
    assert.throws(() => resolveStagedRolloutDeploymentProfile(poisoned), expected, label)
  }
})

test('release reporting keeps completed rollout released while soak is deferred and binds the handoff to the exact candidate', () => {
  const cases = [
    { receiptCount: 5, status: 'NOT_RELEASED', nextPhase: 'immutable-release-bom' },
    { receiptCount: 6, status: 'RELEASED_VALIDATION_IN_PROGRESS', nextPhase: 'template-fleet-rollout' },
    { receiptCount: 8, status: 'RELEASED_VALIDATION_IN_PROGRESS', nextPhase: 'rollout-completion' },
    { receiptCount: 9, status: 'RELEASED_VALIDATED_SOAK_DEFERRED', nextPhase: 'soak-72h' },
    { receiptCount: 10, status: 'RELEASED_VALIDATED_SOAK_COMPLETE', nextPhase: 'promotion-or-rollback' },
    { receiptCount: 11, status: 'RELEASED_PROMOTED', nextPhase: null },
  ]
  for (const item of cases) {
    const ledger = ledgerFixture({ receiptCount: item.receiptCount })
    const result = validate(ledger)
    assert.equal(result.releaseStatus, item.status)
    assert.equal(result.nextPhase, item.nextPhase)
    assert.equal(
      result.candidateReleaseDigest,
      ledger.releaseTrain.candidate
        ? stagedRolloutReleaseRecordDigest(ledger.releaseTrain.candidate)
        : null,
    )
    if (item.status === 'RELEASED_VALIDATED_SOAK_DEFERRED') {
      assert.deepEqual(result.deferredExecutionPackageBinding, {
        phaseId: 'soak-72h',
        ledgerSha256: sha256(stableStringify(ledger, 0)),
        prerequisiteReceiptSha256: stagedRolloutReceiptDigest(ledger.receipts.at(-1)),
        candidateReleaseDigest: stagedRolloutReleaseRecordDigest(ledger.releaseTrain.candidate),
      })
    } else {
      assert.equal(result.deferredExecutionPackageBinding, null)
    }
  }

  const rollback = validate(ledgerFixture({ decision: 'rollback' }))
  assert.equal(rollback.releaseStatus, 'ROLLED_BACK_TO_PREVIOUS_GOOD')
  assert.equal(rollback.nextPhase, null)
})

test('a newer candidate cannot inherit an older candidate soak observation', () => {
  const oldLedger = ledgerFixture({ receiptCount: 10 })
  const oldSoak = evidenceValue(oldLedger.receipts[9], 'candidate-bound-soak-72h-v1')
  const newerCandidate = releaseRecord(
    '2.1.0',
    '2026-07-27T12:45:00.000Z',
    2,
    { sourceCommit: MERGE_COMMIT, sourceTree: SOURCE_TREE },
  )
  const newerLedger = ledgerFixture({ receiptCount: 10, candidate: newerCandidate })
  replaceEvidenceValue(newerLedger.receipts[9], 'candidate-bound-soak-72h-v1', oldSoak)
  resignFrom(newerLedger, 9)
  assert.throws(
    () => validate(newerLedger),
    /soak artifact is bound to a different candidate/,
  )
})

test('external-certified policy-bootstrap and post-merge receipts validate offline without GitHub currentness', (t) => {
  const repoRoot = isolatedGovernanceRepo(t)
  const certificationsPath = resolve(repoRoot, 'infra/governance/providers/certifications.json')
  writeExternalCertifiedAuthorityLedger(repoRoot)
  const certifiedLedgerBytes = readFileSync(certificationsPath)

  const results = withoutGithubQueries(repoRoot, () => ([
    validate(ledgerFixture({ receiptCount: 2 }), { repoRoot }),
    validate(ledgerFixture({ receiptCount: 5 }), { repoRoot }),
  ]))

  assert.deepEqual(results.map(result => result.nextPhase), ['commit-pr-open', 'immutable-release-bom'])
  assert.deepEqual(readFileSync(certificationsPath), certifiedLedgerBytes, 'offline validation must not refresh or rewrite runtime certification state')
})

test('deterministic authority model poisons remain fail-closed during offline receipt validation', (t) => {
  const cases = [
    {
      id: 'schema-open-shape',
      path: 'infra/governance/desired/github.json',
      mutate: value => { value.profiles['design-system-authority'].candidateBypass = true },
      expected: /desired schema validation failed.*must NOT have additional properties/,
    },
    {
      id: 'role-surface-policy',
      path: 'infra/governance/inventory/managed-repos.json',
      mutate: value => { value.repositories.find(item => item.id === 'design-system').providerSurfacesRequired.pop() },
      expected: /provider surfaces differ from the canonical role-surface policy/,
    },
    {
      id: 'release-ring',
      path: 'infra/governance/release-rings.json',
      mutate: value => { value.assignments['design-system'].ring = 'attacker-ring' },
      expected: /Unknown release ring attacker-ring/,
    },
    {
      // 1B(2026-07-29):authority profile 已拆 verdict 環境;此 poison 改打仍保留
      // App 架構的 consumer profile(fleet 藍圖),validator 覆蓋不變。
      id: 'base-trust',
      path: 'infra/governance/desired/github.json',
      mutate: value => {
        const environment = value.profiles['product-consumer'].environments.find(item => item.name === 'governance-check-verdict')
        assert.ok(environment, 'fixture requires the consumer protected-base environment')
        environment.workflowIdentity.contentSha256 = 'f'.repeat(64)
      },
      expected: /governance-check-verdict identity must match/,
    },
  ]

  for (const fixture of cases) {
    const repoRoot = isolatedGovernanceRepo(t)
    mutateGovernanceJson(repoRoot, fixture.path, fixture.mutate)
    assert.throws(
      () => withoutGithubQueries(repoRoot, () => validate(ledgerFixture({ receiptCount: 2 }), { repoRoot })),
      fixture.expected,
      fixture.id,
    )
  }
})

const poison = JSON.parse(readFileSync(new URL('./fixtures/staged-rollout/poison-cases.json', import.meta.url), 'utf8'))
for (const fixture of poison.cases) {
  test(`rejects adversarial fixture: ${fixture.id}`, () => {
    let ledger = ledgerFixture()
    if (fixture.mutation === 'drop-prepare-verification') ledger.prepareVerification = null
    else if (fixture.mutation === 'add-compliance-finding') {
      ledger.prepareVerification.freeze.value.checks[0].exitCode = 1
      refreshPrepareVerification(ledger)
    }
    else if (fixture.mutation === 'replace-worktree-fingerprint') ledger.activeRun.worktreeFingerprint = 'f'.repeat(64)
    else if (fixture.mutation === 'downgrade-dependency-trust') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.dependencies.status = 'untrusted'
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    }
    else if (fixture.mutation === 'replace-phase-id') ledger.receipts[1].phaseId = 'post-merge-hard-gates'
    else if (fixture.mutation === 'replace-prior-receipt-digest') ledger.receipts[1].priorReceiptSha256 = '0'.repeat(64)
    else if (fixture.mutation === 'shorten-soak-to-71h') {
      ledger.receipts[9].observedAt = '2026-07-31T07:00:00.000Z'
      ledger.receipts[10].observedAt = '2026-07-31T07:30:00.000Z'
      const soak = evidenceValue(ledger.receipts[9], 'candidate-bound-soak-72h-v1')
      soak.completedAt = ledger.receipts[9].observedAt
      soak.elapsedHours = 71
      replaceEvidenceValue(ledger.receipts[9], 'candidate-bound-soak-72h-v1', soak)
      resignFrom(ledger, 9)
    } else if (fixture.mutation === 'replace-candidate-version-with-latest') ledger.releaseTrain.candidate.candidateRelease.version = 'latest'
    else if (fixture.mutation === 'replace-signature') ledger.receipts[0].authority.signatures[0].signature = 'A'.repeat(86)
    else if (fixture.mutation === 'drop-previous-good') {
      ledger = ledgerFixture({ decision: 'rollback' })
      ledger.releaseTrain.previousGood = null
    } else if (fixture.mutation === 'null-managed-ci-activation') {
      const bootstrap = evidenceValue(ledger.receipts[1], 'github-policy-bootstrap-readback-v1')
      bootstrap.activation.requirements[0].status = 'not-activated'
      bootstrap.activation.requirements[0].observedAt = null
      bootstrap.activation.requirements[0].expiresAt = null
      bootstrap.activation.requirements[0].evidence = null
      bootstrap.activationDigest = sha256(stableStringify(bootstrap.activation, 0))
      replaceEvidenceValue(ledger.receipts[1], 'github-policy-bootstrap-readback-v1', bootstrap)
      resignFrom(ledger, 1)
    } else if (fixture.mutation === 'substitute-bootstrap-model-authority-closure') {
      const bootstrap = evidenceValue(ledger.receipts[1], 'github-policy-bootstrap-readback-v1')
      bootstrap.managedCiBootstrap.modelReleaseAuthorityBindingDigest = EVIDENCE_SHA('substituted-bootstrap-model-authority')
      replaceEvidenceValue(ledger.receipts[1], 'github-policy-bootstrap-readback-v1', bootstrap)
      resignFrom(ledger, 1)
    } else if (fixture.mutation === 'substitute-index-signer-audit-closure') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.activation.executionClassSignerAuditEventDigests['model-broker'] = EVIDENCE_SHA('substituted-index-signer-audit')
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'drop-managed-ci-artifact-index') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.artifacts = []
      certification.managedCiEvidenceIndex.modelTranscriptArtifacts = []
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'reuse-candidate-as-control-plane') {
      const bootstrap = evidenceValue(ledger.receipts[1], 'github-policy-bootstrap-readback-v1')
      bootstrap.activation.requirements[0].evidence.payload.observedResource.workflowDefinitionCommit = PR_HEAD
      bootstrap.managedCiBootstrap.controlPlaneCommit = PR_HEAD
      bootstrap.activationDigest = sha256(stableStringify(bootstrap.activation, 0))
      replaceEvidenceValue(ledger.receipts[1], 'github-policy-bootstrap-readback-v1', bootstrap)
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.executor.controlPlaneCommit = PR_HEAD
      certification.managedCiEvidenceIndex.indexSha256 = stagedRolloutManagedCiIndexDigest(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 1)
    } else if (fixture.mutation === 'replay-managed-ci-index-from-other-candidate') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.source.head = 'f'.repeat(40)
      certification.managedCiEvidenceIndex.indexSha256 = stagedRolloutManagedCiIndexDigest(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'substitute-managed-ci-artifact-digest') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.artifacts.find(item => item.executionClass === 'model-broker').receiptBindingSha256 = 'f'.repeat(64)
      certification.managedCiEvidenceIndex.artifactSetSha256 = sha256(stableStringify(certification.managedCiEvidenceIndex.artifacts, 0))
      certification.managedCiEvidenceIndex.indexSha256 = stagedRolloutManagedCiIndexDigest(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'shrink-canonical-tier-count') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.coverage.tiers.deterministic -= 1
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'misplace-dimension-tier') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      const item = certification.managedCiEvidenceIndex.artifacts.find(row => row.evidenceKind === 'deep-audit-deterministic')
      item.evidenceKind = 'deep-audit-hook-residue'
      item.path = `hook-residue/dim-${item.dimension}.json`
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'duplicate-canonical-artifact') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.artifacts.push(structuredClone(certification.managedCiEvidenceIndex.artifacts[0]))
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'remove-canonical-artifact') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.artifacts.shift()
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'add-orphan-canonical-artifact') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      const orphan = structuredClone(certification.managedCiEvidenceIndex.artifacts.find(row => row.evidenceKind === 'deep-audit-deterministic'))
      orphan.dimension = 999
      orphan.path = 'deterministic/dim-999.json'
      orphan.sha256 = EVIDENCE_SHA('orphan-dim-999')
      orphan.receiptBindingSha256 = EVIDENCE_SHA('orphan-dim-999-receipt')
      certification.managedCiEvidenceIndex.artifacts.push(orphan)
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'remove-model-transcript') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.modelTranscriptArtifacts.pop()
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'tamper-model-transcript-digest') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.modelTranscriptArtifacts[0].transcriptSha256 = 'f'.repeat(64)
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'substitute-model-authority-exchange') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.modelTranscriptArtifacts[0].exchangeInvocationObservations[0].responseSha256 = EVIDENCE_SHA('substituted-authority-response')
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'replay-model-authority-binding') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      const [source, target] = certification.managedCiEvidenceIndex.modelTranscriptArtifacts
      target.modelReleaseAuthorityBindingDigest = source.modelReleaseAuthorityBindingDigest
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'replay-model-authority-ledger-receipt') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      const [source, target] = certification.managedCiEvidenceIndex.modelTranscriptArtifacts
      target.modelAuthorityReplayLedgerReceiptDigest = source.modelAuthorityReplayLedgerReceiptDigest
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'substitute-model-transcript-subject') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      const row = certification.managedCiEvidenceIndex.modelTranscriptArtifacts.find(item => item.taskKind === 'judgment')
      row.subject = COVERAGE_TOPOLOGY.pureJudgment.find(dim => dim !== row.subject)
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'add-orphan-model-transcript') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      const orphan = structuredClone(certification.managedCiEvidenceIndex.modelTranscriptArtifacts[0])
      orphan.transcriptSha256 = EVIDENCE_SHA('orphan-transcript')
      orphan.transcriptPath = `${orphan.taskKind}/${orphan.providerId}/_transcripts/${orphan.transcriptSha256}.json`
      orphan.brokerReceiptSha256 = EVIDENCE_SHA('orphan-transcript-receipt')
      certification.managedCiEvidenceIndex.modelTranscriptArtifacts.push(orphan)
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'mix-downstream-dependency-bundle') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.artifacts.at(-1).dependencyBundleDigest = 'f'.repeat(64)
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'shallow-dependency-acquisition') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.dependencyEvidence.acquisitionReceipt.sha256 = null
      certification.managedCiEvidenceIndex.dependencyEvidence.acquisitionReceipt.receiptBindingSha256 = null
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'substitute-broker-result-summary') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.brokerEvidence.resultIndexDigest = 'f'.repeat(64)
      certification.managedCiEvidenceIndex.indexSha256 = stagedRolloutManagedCiIndexDigest(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'substitute-observed-model-id') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      certification.managedCiEvidenceIndex.modelTranscriptArtifacts[0].observedResponseModelId = 'provider-returned-alias'
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'mix-provider-model-identity') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      const rows = certification.managedCiEvidenceIndex.modelTranscriptArtifacts.filter(item => item.providerId === 'claude')
      const row = rows.at(-1)
      row.requestModelId = 'claude-fixture-model-20260722'
      row.observedResponseModelId = row.requestModelId
      row.modelReleaseId = `claude/${row.requestModelId}`
      row.modelReleaseBindingDigest = EVIDENCE_SHA('model-release-binding-claude-drift')
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else if (fixture.mutation === 'alias-cross-provider-model-release') {
      const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
      const claudeBinding = certification.managedCiEvidenceIndex.modelTranscriptArtifacts.find(item => item.providerId === 'claude').modelReleaseBindingDigest
      for (const row of certification.managedCiEvidenceIndex.modelTranscriptArtifacts.filter(item => item.providerId === 'codex')) {
        row.modelReleaseBindingDigest = claudeBinding
      }
      refreshManagedCiIndex(certification.managedCiEvidenceIndex)
      replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
      resignFrom(ledger, 3)
    } else assert.fail(`unknown poison mutation ${fixture.mutation}`)
    const expected = fixture.id === 'same-candidate-workflow-self-certification'
      ? /self-certified|activation differs from the signed candidate-freeze prerequisite/
      : new RegExp(fixture.expected)
    assert.throws(() => validate(ledger), expected)
  })
}

test('rollback requires and addresses an older exact previous-good BOM and verified release', () => {
  const ledger = ledgerFixture({ decision: 'rollback' })
  assert.equal(validate(ledger).nextPhase, null)
  ledger.releaseTrain.previousGood = structuredClone(ledger.releaseTrain.candidate)
  assert.throws(() => validate(ledger), /identical to the candidate|strictly older/)
})

test('a one-package previous-good BOM/version substitution is rejected', () => {
  const ledger = ledgerFixture({ decision: 'rollback' })
  const parsed = JSON.parse(Buffer.from(ledger.releaseTrain.previousGood.bom.bytes, 'base64').toString('utf8'))
  parsed.packages[0].version = '1.8.0'
  const bytes = Buffer.from(`${JSON.stringify(parsed)}\n`)
  ledger.releaseTrain.previousGood.bom.bytes = bytes.toString('base64')
  ledger.releaseTrain.previousGood.bom.sha256 = sha256(bytes)
  ledger.releaseTrain.previousGood.candidateRelease.bomSha256 = sha256(bytes)
  assert.throws(() => validate(ledger), /package version differs|package versions\/SRI mismatch/)
})

test('generic validators, forged registries, active-run loaders, and repo roots cannot mint production packages', () => {
  const ledger = ledgerFixture({ receiptCount: 0 })
  ledger.prepareVerification = null
  const validation = validateStagedRolloutLedger(PLAN, ledger, {
    activeRun: ACTIVE_RUN,
    certificationRun: CERT_RUN,
    issuerRegistry: REGISTRY,
    attestationPolicy: POLICY,
    now: NOW,
  })
  assert.equal(validation.productionEligible, false)
  assert.throws(() => buildStagedRolloutExecutionPackage({
    plan: PLAN, ledger, phaseId: 'prepare', capabilities: ['local-evidence-write'], validation,
  }), /refuses fixture or injected validators/)
  const forgedRegistryValidation = validateStagedRolloutLedger(PLAN, ledger, {
    activeRun: ACTIVE_RUN, issuerRegistry: REGISTRY, attestationPolicy: POLICY, now: NOW,
    canonicalAuthority: { kind: 'canonical-staged-rollout-validation-authority' },
    canonicalBindings: { attacker: true },
  })
  assert.equal(forgedRegistryValidation.productionEligible, false)
  assert.throws(
    () => validateStagedRolloutLedger(PLAN, ledger, {
      activeRun: ACTIVE_RUN, issuerRegistry: REGISTRY, attestationPolicy: POLICY, now: NOW,
      repoRoot: resolve(tmpdir(), 'attacker-repo'), verifyMechanisms: false,
    }),
    /Cannot read valid JSON .*external-activation-policy\.json/,
  )
  assert.throws(() => buildStagedRolloutExecutionPackage({
    plan: PLAN, ledger, phaseId: 'prepare', capabilities: ['local-evidence-write'], validation: JSON.parse(JSON.stringify(validation)),
  }), /non-serializable validator capability/)
})

test('canonical production APIs reject caller-controlled clocks before reading any ledger', () => {
  const injected = new Date('2026-07-20T00:00:00.000Z')
  assert.throws(
    () => validateCanonicalStagedRolloutLedger({ now: injected }),
    /forbids a caller-controlled production clock/,
  )
  assert.throws(
    () => mintCanonicalStagedRolloutExecutionPackage({ now: injected }),
    /forbids a caller-controlled production clock/,
  )
  assert.throws(
    () => validateCanonicalStagedRolloutExecutionPackage({}, { now: injected }),
    /forbids a caller-controlled production clock/,
  )
  assert.throws(
    () => prepareCanonicalStagedRolloutLedger({ now: injected }),
    /forbids a caller-controlled production clock/,
  )
  assert.throws(
    () => createCanonicalCandidateFreezeSigningRequest({ now: injected }),
    /forbids a caller-controlled production clock/,
  )
  assert.throws(
    () => appendCanonicalCandidateFreezeReceipt({ now: injected }),
    /forbids a caller-controlled production clock/,
  )
})

test('production-grade candidate freeze content-addresses activation baseline without requiring readiness', () => {
  const activationRequirements = {
    schemaVersion: 3,
    requirements: [],
  }
  const readiness = {
    scope: 'release',
    profileId: PLAN.deploymentProfileBinding.profile.id,
    profileDigest: PLAN.deploymentProfileBinding.profile.sha256,
    policyDigest: PLAN.deploymentProfileBinding.externalActivationPolicy.sha256,
    ready: false,
    requiredCount: 0,
    activatedCount: 0,
    blockers: [{ id: 'not-activated' }],
    digest: sha256(stableStringify(activationRequirements, 0)),
  }
  const result = validateCandidateFreezeBootstrapPrerequisites({
    plan: PLAN,
    activationRequirements,
    readiness,
    attestationPolicy: POLICY,
    issuerRegistry: REGISTRY,
    now: new Date('2026-07-20T00:45:00.000Z'),
    freezeAt: new Date('2026-07-20T01:00:00.000Z'),
  })
  assert.equal(result.ready, true)
  assert.equal(result.freezeAt, '2026-07-20T01:00:00.000Z')
  assert.equal(result.activationRequiredBeforeFreeze, false)
  assert.equal(result.activationGatePhase, 'github-policy-bootstrap')
  assert.equal(result.activationBaseline.sha256, sha256(stableStringify(activationRequirements, 0)))
  assert.match(result.prerequisiteSha256, /^[a-f0-9]{64}$/)

  const wrongProfile = { ...readiness, profileDigest: 'f'.repeat(64) }
  assert.throws(() => validateCandidateFreezeBootstrapPrerequisites({
    plan: PLAN,
    activationRequirements,
    readiness: wrongProfile,
    attestationPolicy: POLICY,
    issuerRegistry: REGISTRY,
    now: new Date('2026-07-20T00:45:00.000Z'),
    freezeAt: new Date('2026-07-20T01:00:00.000Z'),
  }), /baseline\/profile binding is stale or substituted/)
})

test('production-grade candidate freeze refuses maximum-assurance replay input before writing output', () => {
  // Consume the canonical evidence-root resolver instead of assuming `.git` is a
  // directory: in a linked Git worktree it is a file, so the hardcoded join raised
  // ENOTDIR and this suite could never run from the worktree layout this repo uses.
  const evidenceBase = resolveGitRuntimeRoots(process.cwd(), { create: true }).evidence
  const evidenceRoot = realpathSync(mkdtempSync(resolve(evidenceBase, 'staged-rollout-empty-trust-')))
  try {
    const replayDirectory = resolve(
      evidenceRoot,
      'staged-rollout/authority-bootstrap-replay/sha256',
    )
    const replayPath = resolve(
      replayDirectory,
      `${AUTHORITY_REPLAY_FIXTURE.receipt.receiptDigest}.json`,
    )
    mkdirSync(replayDirectory, { recursive: true })
    const replayBytes = `${stableStringify(AUTHORITY_REPLAY_FIXTURE.receipt)}\n`
    writeFileSync(replayPath, replayBytes)
    const evidenceBefore = readdirSync(evidenceRoot, { recursive: true }).sort()
    assert.throws(
      () => prepareCanonicalStagedRolloutLedger({
        evidenceRoot,
        authorityBootstrapReplayReceiptPath: replayPath,
      }),
      /production-grade local candidate freeze refuses a maximum-assurance durable replay path/,
    )
    assert.deepEqual(readdirSync(evidenceRoot, { recursive: true }).sort(), evidenceBefore)
    assert.equal(readFileSync(replayPath, 'utf8'), replayBytes)
  } finally {
    rmSync(evidenceRoot, { recursive: true, force: true })
  }
})

test('strict generic validation recomputes the canonical bootstrap prerequisite', () => {
  const signerBoundFixture = ledgerFixture({ receiptCount: 1 })
  assert.throws(() => validateStagedRolloutLedger(PLAN, signerBoundFixture, {
    activeRun: ACTIVE_RUN,
    issuerRegistry: REGISTRY,
    attestationPolicy: POLICY,
    now: NOW,
  }), /requires current release-scope external activation|allowedKeyIds cannot be empty after trust activation|Issuer owner-governance-[a-z0-9-]+ is not active yet/)
})

test('fixture validation cannot mint a rollout package and the soak predecessor remains explicit', () => {
  const ledger = ledgerFixture({ decision: 'rollback', receiptCount: 10 })
  const validation = validate(ledger)
  assert.equal(validation.nextPhase, 'promotion-or-rollback')
  assert.equal(validation.productionEligible, false)
  assert.throws(() => buildStagedRolloutExecutionPackage({
    plan: PLAN,
    ledger,
    phaseId: 'promotion-or-rollback',
    decision: 'rollback',
    capabilities: ['fleet-rollback'],
    validation,
  }), /refuses fixture or injected validators/)
  const beforeSoak = ledgerFixture({ decision: 'rollback', receiptCount: 9 })
  const beforeValidation = validate(beforeSoak)
  assert.equal(beforeValidation.nextPhase, 'soak-72h')
})

test('production-grade deferred soak exposes only an exact emergency rollback handoff', () => {
  const beforeSoak = ledgerFixture({ decision: 'rollback', receiptCount: 9 })
  const ledgerSha256 = sha256(stableStringify(beforeSoak, 0))
  const candidateReleaseDigest = stagedRolloutReleaseRecordDigest(beforeSoak.releaseTrain.candidate)
  const prerequisiteReceiptSha256 = stagedRolloutReceiptDigest(beforeSoak.receipts.at(-1))
  const beforeValidation = {
    valid: true,
    nextPhase: 'soak-72h',
    releaseStatus: 'RELEASED_VALIDATED_SOAK_DEFERRED',
    rollbackReady: true,
    candidateReleaseDigest,
    deferredExecutionPackageBinding: {
      phaseId: 'soak-72h',
      ledgerSha256,
      prerequisiteReceiptSha256,
      candidateReleaseDigest,
    },
  }
  const transition = stagedRolloutExecutionTransition({
    plan: PLAN,
    ledger: beforeSoak,
    phaseId: 'promotion-or-rollback',
    decision: 'rollback',
    validation: beforeValidation,
  })
  assert.deepEqual(transition.emergencyRollbackBinding, {
    schemaVersion: 1,
    kind: 'production-grade-deferred-soak-emergency-rollback',
    releaseStatus: 'RELEASED_VALIDATED_SOAK_DEFERRED',
    deploymentProfile: structuredClone(PLAN.deploymentProfileBinding.profile),
    ledgerSha256,
    prerequisiteReceiptSha256,
    candidateReleaseDigest,
    previousGoodReleaseDigest: stagedRolloutReleaseRecordDigest(beforeSoak.releaseTrain.previousGood),
    deferredPhaseId: 'soak-72h',
    soakCompleted: false,
    promotionEligible: false,
  })
  const finalPhase = PLAN.phases.find(phase => phase.id === 'promotion-or-rollback')
  assert.deepEqual(finalPhase.capabilities.rollback, ['fleet-rollback'])
  assert.deepEqual(finalPhase.evidenceContracts.rollback, [
    'previous-good-release-v1',
    'fleet-recovery-authorization-v2',
    'fleet-reconcile-journal-v6',
  ])
  const governanceInputPaths = stagedRolloutCanonicalGovernanceInputPaths(PLAN)
  assert.ok(governanceInputPaths.length > 17 && governanceInputPaths.length <= 256)
  const unsignedPackage = {
    $schema: 'schemas/staged-rollout.schema.json',
    schemaVersion: 1,
    kind: 'staged-rollout-execution-package',
    mode: 'authorized-handoff-only',
    mutatesExternalState: false,
    phaseId: finalPhase.id,
    phaseIndex: finalPhase.index,
    decision: 'rollback',
    planSha256: PLAN_SHA256,
    ledgerSha256,
    prerequisiteReceiptSha256,
    activeRun: structuredClone(ACTIVE_BINDING),
    candidateVersion: beforeSoak.releaseTrain.candidate.candidateRelease.version,
    previousGoodVersion: beforeSoak.releaseTrain.previousGood.candidateRelease.version,
    emergencyRollbackBinding: structuredClone(transition.emergencyRollbackBinding),
    capabilities: structuredClone(finalPhase.capabilities.rollback),
    requiredEvidenceContracts: structuredClone(finalPhase.evidenceContracts.rollback),
    mechanismRefs: structuredClone(finalPhase.mechanismRefs),
    canonicalBindings: {
      schemaVersion: 1,
      kind: 'canonical-staged-rollout-bindings',
      governanceInputs: governanceInputPaths.map(path => ({ path, sha256: 'f'.repeat(64) })),
      activeRunPointerSha256: 'e'.repeat(64),
      runManifests: [{
        role: 'candidate-freeze',
        runId: ACTIVE_BINDING.runId,
        sha256: ACTIVE_BINDING.manifestSha256,
      }],
    },
  }
  const executionPackage = {
    ...unsignedPackage,
    packageSha256: sha256(stableStringify(unsignedPackage, 0)),
  }
  assert.equal(validateStagedRolloutExecutionPackage(executionPackage, { plan: PLAN }), true)
  const profileSubstitution = structuredClone(executionPackage)
  profileSubstitution.emergencyRollbackBinding.deploymentProfile.sha256 = '0'.repeat(64)
  const unsignedSubstitution = structuredClone(profileSubstitution)
  delete unsignedSubstitution.packageSha256
  profileSubstitution.packageSha256 = sha256(stableStringify(unsignedSubstitution, 0))
  assert.throws(
    () => validateStagedRolloutExecutionPackage(profileSubstitution, { plan: PLAN }),
    /binding is stale, substituted, or claims promotion\/soak completion/,
  )
  const fakeSoakCompletion = structuredClone(executionPackage)
  fakeSoakCompletion.emergencyRollbackBinding.soakCompleted = true
  assert.throws(
    () => validateStagedRolloutExecutionPackage(fakeSoakCompletion, { plan: PLAN }),
    /schema validation failed/,
  )
  assert.throws(() => stagedRolloutExecutionTransition({
    plan: PLAN,
    ledger: beforeSoak,
    phaseId: 'promotion-or-rollback',
    decision: 'promotion',
    validation: beforeValidation,
  }), /may target only the next phase soak-72h/)
  const noPreviousGood = ledgerFixture({
    decision: 'rollback',
    receiptCount: 9,
    previousGood: null,
  })
  assert.throws(() => stagedRolloutExecutionTransition({
    plan: PLAN,
    ledger: noPreviousGood,
    phaseId: 'promotion-or-rollback',
    decision: 'rollback',
    validation: {
      ...beforeValidation,
      rollbackReady: false,
      deferredExecutionPackageBinding: {
        ...beforeValidation.deferredExecutionPackageBinding,
        ledgerSha256: sha256(stableStringify(noPreviousGood, 0)),
      },
    },
  }), /requires the exact released candidate, previous-good release/)
  const staleValidation = {
    ...beforeValidation,
    deferredExecutionPackageBinding: {
      ...beforeValidation.deferredExecutionPackageBinding,
      candidateReleaseDigest: 'f'.repeat(64),
    },
  }
  assert.throws(() => stagedRolloutExecutionTransition({
    plan: PLAN,
    ledger: beforeSoak,
    phaseId: 'promotion-or-rollback',
    decision: 'rollback',
    validation: staleValidation,
  }), /requires the exact released candidate, previous-good release/)
  const forgedMaximum = structuredClone(PLAN)
  forgedMaximum.deploymentProfileBinding.profile.id = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
  assert.throws(() => stagedRolloutExecutionTransition({
    plan: forgedMaximum,
    ledger: beforeSoak,
    phaseId: 'promotion-or-rollback',
    decision: 'rollback',
    validation: beforeValidation,
  }), /profile ID\/digest differs/)
})

test('plan poisoning cannot weaken a capability or reorder the release train', () => {
  const weakened = structuredClone(PLAN)
  weakened.phases[1].capabilities.standard = ['github-pr-write']
  assert.throws(() => validateStagedRolloutPlan(weakened, { verifyMechanisms: false }), /capabilities differs/)
  const reordered = structuredClone(PLAN)
  ;[reordered.phaseOrder[1], reordered.phaseOrder[2]] = [reordered.phaseOrder[2], reordered.phaseOrder[1]]
  assert.throws(() => validateStagedRolloutPlan(reordered, { verifyMechanisms: false }), /phaseOrder differs/)
  const selfCertifying = structuredClone(PLAN)
  selfCertifying.bootstrapBoundary.candidateSelfCertificationAllowed = true
  assert.throws(() => validateStagedRolloutPlan(selfCertifying, { verifyMechanisms: false }), /candidateSelfCertificationAllowed|bootstrap boundary is invalid or weakened/)
  const candidateWriter = structuredClone(PLAN)
  candidateWriter.externalLedgerBootstrapBoundary.writerCodeSource = 'candidate-head'
  assert.throws(() => validateStagedRolloutPlan(candidateWriter, { verifyMechanisms: false }), /writerCodeSource|external-ledger bootstrap boundary/)
  const parallelLedgerWriters = structuredClone(PLAN)
  parallelLedgerWriters.externalLedgerBootstrapBoundary.openPullRequestCardinality = 'unbounded'
  assert.throws(() => validateStagedRolloutPlan(parallelLedgerWriters, { verifyMechanisms: false }), /openPullRequestCardinality|external-ledger bootstrap boundary/)
  const ledgerDirectWrite = structuredClone(PLAN)
  ledgerDirectWrite.externalLedgerBootstrapBoundary.directDefaultBranchWriteAllowed = true
  assert.throws(() => validateStagedRolloutPlan(ledgerDirectWrite, { verifyMechanisms: false }), /directDefaultBranchWriteAllowed|external-ledger bootstrap boundary/)
  const danglingCertificationLedger = structuredClone(PLAN)
  danglingCertificationLedger.externalLedgerBootstrapBoundary.certificationChangedPaths = [
    'infra/governance/providers/certifications.json',
  ]
  assert.throws(() => validateStagedRolloutPlan(danglingCertificationLedger, { verifyMechanisms: false }), /certificationChangedPaths|external-ledger bootstrap boundary/)
  const durableWorkflowReceipt = structuredClone(PLAN)
  durableWorkflowReceipt.externalLedgerBootstrapBoundary.workflowReceiptAuthority = 'durable-authority'
  assert.throws(() => validateStagedRolloutPlan(durableWorkflowReceipt, { verifyMechanisms: false }), /workflowReceiptAuthority|external-ledger bootstrap boundary/)
  const missingProtectedMergeGate = structuredClone(PLAN)
  missingProtectedMergeGate.externalLedgerBootstrapBoundary.requiredMergeGate = 'candidate-workflow-only'
  assert.throws(() => validateStagedRolloutPlan(missingProtectedMergeGate, { verifyMechanisms: false }), /requiredMergeGate|external-ledger bootstrap boundary/)
  const transportHandoffAsMergeAuthority = structuredClone(PLAN)
  transportHandoffAsMergeAuthority.externalLedgerBootstrapBoundary.expiredTransportHandoffMergeAuthority = 'reuse-green-check'
  assert.throws(() => validateStagedRolloutPlan(transportHandoffAsMergeAuthority, { verifyMechanisms: false }), /expiredTransportHandoffMergeAuthority|external-ledger bootstrap boundary/)
  const staleGreenCheckAsTtl = structuredClone(PLAN)
  staleGreenCheckAsTtl.externalLedgerBootstrapBoundary.greenCheckMeaning = 'merge-time-handoff-ttl'
  assert.throws(() => validateStagedRolloutPlan(staleGreenCheckAsTtl, { verifyMechanisms: false }), /greenCheckMeaning|external-ledger bootstrap boundary/)
  const envelopeOnly = structuredClone(PLAN)
  envelopeOnly.prHeadCertificationBoundary.canonicalTranscriptValidationRequired = false
  assert.throws(() => validateStagedRolloutPlan(envelopeOnly, { verifyMechanisms: false }), /canonicalTranscriptValidationRequired|transcript\/dependency\/coverage boundary is invalid or weakened/)
  const legacySelfCompletion = structuredClone(PLAN)
  legacySelfCompletion.consumerBootstrapBoundary.legacySelfUpdateCompletionAllowed = true
  assert.throws(() => validateStagedRolloutPlan(legacySelfCompletion, { verifyMechanisms: false }), /legacySelfUpdateCompletionAllowed|legacy-consumer full-snapshot bootstrap boundary/)
  const bootstrapProfileSubstitution = structuredClone(PLAN)
  bootstrapProfileSubstitution.consumerBootstrapBoundary.postAcceptanceProfile = 'new-snapshot-v2'
  assert.throws(() => validateStagedRolloutPlan(bootstrapProfileSubstitution, { verifyMechanisms: false }), /postAcceptanceProfile|legacy-consumer full-snapshot bootstrap boundary/)
  const missingBootstrapMaterializer = structuredClone(PLAN)
  const wmCanary = missingBootstrapMaterializer.phases.find(phase => phase.id === 'wm-canary')
  wmCanary.mechanismRefs = wmCanary.mechanismRefs.filter(path => path !== 'infra/governance/lib/consumer-bootstrap.mjs')
  assert.throws(
    () => validateStagedRolloutPlan(missingBootstrapMaterializer, { verifyMechanisms: false }),
    /wm-canary omits required consumer bootstrap mechanism reference/,
  )
  const missingExternalTransactionHandoff = structuredClone(PLAN)
  const candidateFreeze = missingExternalTransactionHandoff.phases.find(phase => phase.id === 'candidate-freeze')
  candidateFreeze.mechanismRefs = candidateFreeze.mechanismRefs.filter(
    path => path !== 'infra/governance/schemas/external-ledger-transaction-handoff.schema.json',
  )
  assert.throws(
    () => validateStagedRolloutPlan(missingExternalTransactionHandoff, { verifyMechanisms: false }),
    /candidate-freeze omits required external-ledger bootstrap mechanism reference/,
  )
  const missingExternalLedgerWriter = structuredClone(PLAN)
  missingExternalLedgerWriter.phases.find(phase => phase.id === 'candidate-freeze').mechanismRefs = (
    missingExternalLedgerWriter.phases.find(phase => phase.id === 'candidate-freeze').mechanismRefs.filter(
      path => path !== '.github/workflows/external-ledger-writer.yml',
    )
  )
  assert.throws(
    () => validateStagedRolloutPlan(missingExternalLedgerWriter, { verifyMechanisms: false }),
    /candidate-freeze omits required external-ledger bootstrap mechanism reference/,
  )
  for (const requiredReplayMechanism of [
    'infra/governance/lib/fleet-reconcile-mirror.mjs',
    'infra/governance/schemas/fleet-reconcile-bootstrap-replay-receipt.schema.json',
  ]) {
    const missingReplayMechanism = structuredClone(PLAN)
    const phase = missingReplayMechanism.phases.find(candidate => candidate.id === 'candidate-freeze')
    phase.mechanismRefs = phase.mechanismRefs.filter(path => path !== requiredReplayMechanism)
    assert.throws(
      () => validateStagedRolloutPlan(missingReplayMechanism, { verifyMechanisms: false }),
      /candidate-freeze omits required authority-policy bootstrap mechanism reference/,
      requiredReplayMechanism,
    )
  }
})

test('WM canary cannot omit, substitute, or self-assert its one-time reviewed full-snapshot bootstrap', () => {
  const missing = ledgerFixture({ receiptCount: 8 })
  missing.receipts[7].evidence = missing.receipts[7].evidence.filter(item => item.contract !== 'consumer-governance-bootstrap-readback-v1')
  resignFrom(missing, 7)
  assert.throws(() => validate(missing), /evidence contracts differs/)

  for (const [label, mutate, expected] of [
    ['legacy updater used', value => { value.legacySelfUpdateUsed = true }, /legacy self-updater/],
    ['candidate code executed', value => { value.candidateCodeExecuted = true }, /executed candidate code/],
    ['independent engineering attestation omitted', value => { value.reviewAuthorization.actorId = '' }, /independent engineering attestation is invalid/],
    ['candidate source substituted', value => { value.candidateSourceCommit = 'f'.repeat(40) }, /immutable candidate/],
    ['protocol validator substituted', value => { value.protocolImplementationSha256 = 'f'.repeat(64) }, /protocol binding is stale/],
  ]) {
    const ledger = ledgerFixture({ receiptCount: 8 })
    const receipt = ledger.receipts[7]
    const bootstrap = evidenceValue(receipt, 'consumer-governance-bootstrap-readback-v1')
    mutate(bootstrap)
    replaceEvidenceValue(receipt, 'consumer-governance-bootstrap-readback-v1', bootstrap)
    const reference = receipt.evidence.find(item => item.contract === 'consumer-governance-bootstrap-readback-v1')
    const exact = evidenceValue(receipt, 'wm-exact-version-canary-v2')
    exact.bootstrapReadbackSha256 = reference.sha256
    replaceEvidenceValue(receipt, 'wm-exact-version-canary-v2', exact)
    resignFrom(ledger, 7)
    assert.throws(() => validate(ledger), expected, label)
  }
})

test('WM exact-version canary is bound to the exact bootstrap artifact and reviewed merge head', () => {
  const digestSubstitution = ledgerFixture({ receiptCount: 8 })
  const exact = evidenceValue(digestSubstitution.receipts[7], 'wm-exact-version-canary-v2')
  exact.bootstrapReadbackSha256 = 'f'.repeat(64)
  replaceEvidenceValue(digestSubstitution.receipts[7], 'wm-exact-version-canary-v2', exact)
  resignFrom(digestSubstitution, 7)
  assert.throws(() => validate(digestSubstitution), /does not bind the exact bootstrap readback artifact/)

  const headSubstitution = ledgerFixture({ receiptCount: 8 })
  const head = evidenceValue(headSubstitution.receipts[7], 'wm-exact-version-canary-v2')
  head.defaultBranchHeadSha = 'a'.repeat(40)
  replaceEvidenceValue(headSubstitution.receipts[7], 'wm-exact-version-canary-v2', head)
  resignFrom(headSubstitution, 7)
  assert.throws(() => validate(headSubstitution), /default branch differs from the reviewed bootstrap merge/)

  const validatorSubstitution = ledgerFixture({ receiptCount: 8 })
  const validator = evidenceValue(validatorSubstitution.receipts[7], 'wm-exact-version-canary-v2')
  validator.upgradeProtocol.implementationSha256 = 'f'.repeat(64)
  replaceEvidenceValue(validatorSubstitution.receipts[7], 'wm-exact-version-canary-v2', validator)
  resignFrom(validatorSubstitution, 7)
  assert.throws(() => validate(validatorSubstitution), /protocol\/profile binding is stale/)
})

test('promoted WM canary accepts only the inventory-bound historical bootstrap readback', t => {
  const repoRoot = isolatedGovernanceRepo(t)
  const validateIsolated = ledger => validate(ledger, { repoRoot, verifyMechanisms: false })

  const baseline = establishedWmLedgerFixture()
  writeWmUpgradeProfile(repoRoot, 'reviewed-bootstrap-established-v2', baseline.bootstrapReferenceSha256)
  assert.equal(validateIsolated(baseline.ledger).nextPhase, 'rollout-completion')

  const missingAccepted = establishedWmLedgerFixture()
  writeWmUpgradeProfile(repoRoot, 'reviewed-bootstrap-established-v2', undefined)
  assert.throws(
    () => validateIsolated(missingAccepted.ledger),
    /inventory schema validation failed:.*acceptedBootstrapReadbackSha256/,
  )

  const wrongAccepted = establishedWmLedgerFixture()
  writeWmUpgradeProfile(repoRoot, 'reviewed-bootstrap-established-v2', 'f'.repeat(64))
  assert.throws(
    () => validateIsolated(wrongAccepted.ledger),
    /established consumer inventory does not bind the exact receipt bootstrap readback/,
  )

  const substitutedReceipt = establishedWmLedgerFixture()
  writeWmUpgradeProfile(repoRoot, 'reviewed-bootstrap-established-v2', substitutedReceipt.bootstrapReferenceSha256)
  const substitutedReceiptValue = evidenceValue(substitutedReceipt.ledger.receipts[7], 'consumer-governance-bootstrap-readback-v1')
  substitutedReceiptValue.fullSnapshotPlanDigest = 'f'.repeat(64)
  replaceEvidenceValue(substitutedReceipt.ledger.receipts[7], 'consumer-governance-bootstrap-readback-v1', substitutedReceiptValue)
  const substitutedReference = substitutedReceipt.ledger.receipts[7].evidence.find(item => item.contract === 'consumer-governance-bootstrap-readback-v1')
  const substitutedExact = evidenceValue(substitutedReceipt.ledger.receipts[7], 'wm-exact-version-canary-v2')
  substitutedExact.bootstrapReadbackSha256 = substitutedReference.sha256
  replaceEvidenceValue(substitutedReceipt.ledger.receipts[7], 'wm-exact-version-canary-v2', substitutedExact)
  resignFrom(substitutedReceipt.ledger, 7)
  assert.throws(
    () => validateIsolated(substitutedReceipt.ledger),
    /established consumer inventory does not bind the exact receipt bootstrap readback/,
  )

  const substitutedExactDigest = establishedWmLedgerFixture()
  writeWmUpgradeProfile(repoRoot, 'reviewed-bootstrap-established-v2', substitutedExactDigest.bootstrapReferenceSha256)
  const wrongExact = evidenceValue(substitutedExactDigest.ledger.receipts[7], 'wm-exact-version-canary-v2')
  wrongExact.bootstrapReadbackSha256 = 'f'.repeat(64)
  replaceEvidenceValue(substitutedExactDigest.ledger.receipts[7], 'wm-exact-version-canary-v2', wrongExact)
  resignFrom(substitutedExactDigest.ledger, 7)
  assert.throws(
    () => validateIsolated(substitutedExactDigest.ledger),
    /does not bind the exact bootstrap readback artifact/,
  )

  const staleReadbackProfile = establishedWmLedgerFixture()
  writeWmUpgradeProfile(repoRoot, 'reviewed-bootstrap-established-v2', staleReadbackProfile.bootstrapReferenceSha256)
  const staleExact = evidenceValue(staleReadbackProfile.ledger.receipts[7], 'wm-exact-version-canary-v2')
  staleExact.upgradeProtocol.profileId = 'legacy-bootstrap-v2'
  staleExact.upgradeProtocol.entryMode = CONSUMER_UPGRADE_PROTOCOL.profiles['legacy-bootstrap-v2'].entryMode
  replaceEvidenceValue(staleReadbackProfile.ledger.receipts[7], 'wm-exact-version-canary-v2', staleExact)
  resignFrom(staleReadbackProfile.ledger, 7)
  assert.throws(() => validateIsolated(staleReadbackProfile.ledger), /protocol\/profile binding is stale/)

  const invalidLiveProfile = establishedWmLedgerFixture()
  writeWmUpgradeProfile(repoRoot, 'new-snapshot-v2', undefined)
  assert.throws(
    () => validateIsolated(invalidLiveProfile.ledger),
    /inventory schema validation failed: data\/repositories\/2\/upgradeProtocolProfile must be equal to one of the allowed values/,
  )

  const legacyMissingBootstrap = ledgerFixture({ receiptCount: 8 })
  writeWmUpgradeProfile(repoRoot, 'legacy-bootstrap-v2', undefined)
  legacyMissingBootstrap.receipts[7].evidence = legacyMissingBootstrap.receipts[7].evidence.filter(item => item.contract !== 'consumer-governance-bootstrap-readback-v1')
  resignFrom(legacyMissingBootstrap, 7)
  assert.throws(() => validateIsolated(legacyMissingBootstrap), /evidence contracts differs/)
})

test('PR-head candidate cannot drift activated trust, image, host, token, signer, broker, or control-plane state', t => {
  {
    const fixture = createManagedCiActivationFixture({
      repoRoot: process.cwd(),
      issuerRegistry: JSON.parse(readFileSync(resolve(process.cwd(), 'infra/governance/trust/issuers.json'), 'utf8')),
      runtimeProfile: JSON.parse(readFileSync(resolve(process.cwd(), 'infra/governance/providers/runtime-conformance.json'), 'utf8')),
      observedAt: '2026-07-24T00:00:00.000Z',
    })
    t.after(() => fixture.dispose())
    const candidateState = fixture.managedCiState
    const candidateObserved = fixture.observedResource()
    assert.equal(validateStagedCandidateManagedCiTrust(candidateState, candidateObserved), true)

    const changedTrustFile = { ...candidateState, activationTrustBundle: structuredClone(candidateState.activationTrustBundle) }
    changedTrustFile.activationTrustBundle.fileDigests['managed-ci-trusted-execution-plan'] = EVIDENCE_SHA('candidate-plan-poison')
    assert.throws(() => validateStagedCandidateManagedCiTrust(changedTrustFile, candidateObserved), /changed an activated trust-file/)

    const changedBroker = structuredClone(candidateObserved)
    changedBroker.secretBrokerPolicyDigests['model-broker'] = EVIDENCE_SHA('candidate-broker-poison')
    assert.throws(() => validateStagedCandidateManagedCiTrust(candidateState, changedBroker), /changed the canonical OIDC secret-broker policy/)

    const changedRawReadback = structuredClone(candidateObserved)
    changedRawReadback.executionClassRawReceiptValidationReadbacks['model-broker'].evidenceEnvelopeDigest = EVIDENCE_SHA('candidate-envelope-poison')
    assert.throws(() => validateStagedCandidateManagedCiTrust(candidateState, changedRawReadback), /raw receipt validation readback|finalized receipt/)

    const changedSignerPayload = structuredClone(candidateObserved)
    changedSignerPayload.executionClassReceiptSigningPayloads['deterministic-hook-audit'].rawReceiptDigest = EVIDENCE_SHA('candidate-substituted-raw-receipt')
    assert.throws(() => validateStagedCandidateManagedCiTrust(candidateState, changedSignerPayload), /signer payload is detached from raw receipt|finalized receipt/)

    const changedSignerSignature = structuredClone(candidateObserved)
    {
      const signature = changedSignerSignature.executionClassSignerAuditEvents['github-observer'].signature
      changedSignerSignature.executionClassSignerAuditEvents['github-observer'].signature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    }
    assert.throws(() => validateStagedCandidateManagedCiTrust(candidateState, changedSignerSignature), /finalized receipt\/signature\/audit readback is invalid/)

    const changedFinalizationRequest = structuredClone(candidateObserved)
    changedFinalizationRequest.finalizationRequestDigest = EVIDENCE_SHA('candidate-finalization-request-substitution')
    assert.throws(
      () => validateStagedCandidateManagedCiTrust(candidateState, changedFinalizationRequest),
      /finalized receipt set digest is detached|finalization request\/set\/transport closure is invalid/,
    )

    const changedFinalizationRawReceiptSet = structuredClone(candidateObserved)
    changedFinalizationRawReceiptSet.finalizationRawReceiptSetDigest = EVIDENCE_SHA('candidate-finalization-raw-receipt-set-substitution')
    assert.throws(
      () => validateStagedCandidateManagedCiTrust(candidateState, changedFinalizationRawReceiptSet),
      /finalized receipt set digest is detached/,
    )

    const changedFinalizationSet = structuredClone(candidateObserved)
    changedFinalizationSet.finalizationReceiptSetDigest = EVIDENCE_SHA('candidate-finalization-set-substitution')
    assert.throws(
      () => validateStagedCandidateManagedCiTrust(candidateState, changedFinalizationSet),
      /finalized receipt set digest is detached|finalization request\/set\/transport closure is invalid/,
    )

    const downgradedFinalizationTransport = structuredClone(candidateObserved)
    downgradedFinalizationTransport.finalizationTransportReadback.clientToGateway.tlsVersion = 'TLSv1.2'
    assert.throws(
      () => validateStagedCandidateManagedCiTrust(candidateState, downgradedFinalizationTransport),
      /finalization request\/set\/transport closure is invalid.*client-to-gateway transport readback is invalid/,
    )

    const downgradedFinalizationMtls = structuredClone(candidateObserved)
    downgradedFinalizationMtls.finalizationTransportReadback.gatewayToSigner.mutualTlsEstablished = false
    assert.throws(
      () => validateStagedCandidateManagedCiTrust(candidateState, downgradedFinalizationMtls),
      /finalization request\/set\/transport closure is invalid.*gateway-to-signer mTLS transport readback is invalid/,
    )

    const substitutedFinalizationAuthority = structuredClone(candidateObserved)
    substitutedFinalizationAuthority.finalizationTransportReadback.gatewayToSigner.signerAuthorityBindingDigest = EVIDENCE_SHA('candidate-finalization-signer-authority-substitution')
    assert.throws(
      () => validateStagedCandidateManagedCiTrust(candidateState, substitutedFinalizationAuthority),
      /finalization request\/set\/transport closure is invalid.*gateway-to-signer mTLS transport readback is invalid/,
    )

    const substitutedFinalizationTransportDigest = structuredClone(candidateObserved)
    substitutedFinalizationTransportDigest.finalizationTransportReadbackDigest = EVIDENCE_SHA('candidate-finalization-transport-digest-substitution')
    assert.throws(
      () => validateStagedCandidateManagedCiTrust(candidateState, substitutedFinalizationTransportDigest),
      /finalization transport readback digest is detached/,
    )

    const missingFinalizationTransport = structuredClone(candidateObserved)
    delete missingFinalizationTransport.finalizationTransportReadback
    assert.throws(
      () => validateStagedCandidateManagedCiTrust(candidateState, missingFinalizationTransport),
      /finalization request\/set\/transport closure is invalid/,
    )

    const staleFinalizationTransport = structuredClone(candidateObserved)
    staleFinalizationTransport.finalizationTransportReadback.observedAt = '2026-07-23T00:00:00.000Z'
    assert.throws(
      () => validateStagedCandidateManagedCiTrust(candidateState, staleFinalizationTransport),
      /finalization request\/set\/transport closure is invalid.*predates the finalized signer operation/,
    )

    const tokenCapable = {
      ...candidateState,
      classes: new Map([...candidateState.classes].map(([id, value]) => [id, {
        ...value,
        executionClass: structuredClone(value.executionClass),
      }])),
    }
    tokenCapable.classes.get('dependency-acquisition').executionClass.permissions['id-token'] = 'write'
    assert.throws(() => validateStagedCandidateManagedCiTrust(tokenCapable, candidateObserved), /can mint an OIDC token/)
    return
  }
  const files = [
    { id: 'workflow', path: '.github/workflows/deep-audit-managed.yml', sha256: EVIDENCE_SHA('workflow') },
    { id: 'plan', path: 'scripts/managed-ci-trusted-execution-plan.json', sha256: EVIDENCE_SHA('plan') },
    { id: 'oidc-policy', path: 'infra/governance/providers/managed-ci-oidc-broker-policy.json', sha256: EVIDENCE_SHA('oidc-policy') },
  ]
  const fileDigests = Object.fromEntries(files.map(item => [item.id, item.sha256]))
  const manifest = { path: 'packages/governance/canonical/manifest.json', sha256: EVIDENCE_SHA('manifest'), id: 'qijenchen-provider-neutral-governance', schemaVersion: 2 }
  const controlPlaneLock = {
    path: 'governance/control-plane.lock.json', sha256: EVIDENCE_SHA('lock'),
    contractDigest: `sha256:${EVIDENCE_SHA('contract')}`, inputDigest: `sha256:${EVIDENCE_SHA('input')}`,
    snapshotDigest: `sha256:${EVIDENCE_SHA('snapshot')}`, manifestId: 'qijenchen-provider-neutral-governance',
  }
  const binding = { files, filesDigest: sha256(stableStringify(files, 0)), manifest, controlPlaneLock }
  const brokerPolicies = { 'model-broker': EVIDENCE_SHA('model-broker-policy'), 'github-observer': EVIDENCE_SHA('github-broker-policy') }
  const executionClasses = ['dependency-acquisition', 'deterministic-hook-audit', 'model-broker', 'github-observer']
  const modelAuthorityFixture = buildModelReleaseAuthorityFixture({ repoRoot: process.cwd(), releaseId: 'codex/gpt-5.6-sol' })
  const canonicalManagedState = loadManagedCiTrustedExecutionPlan({ repoRoot: process.cwd() })
  const runtimeSourceSha256 = canonicalManagedState.executorSupplyChain.executorBinarySources['run-class'].sourceSha256
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'staged-managed-authority-'))
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }))
  const signerKeys = generateKeyPairSync('ed25519')
  const hostObserverKeys = generateKeyPairSync('ed25519')
  const signerIssuer = {
    keyId: 'fixture-runtime-signer', subject: 'spiffe://qijenchen.dev/managed-ci/receipt-signer',
    publicKeySpki: signerKeys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    roles: ['runtime-evidence-issuer'], status: 'active', notBefore: '2026-01-01T00:00:00.000Z',
    notAfter: '2027-01-01T00:00:00.000Z', revokedAt: null,
  }
  const hostObserverIssuer = {
    keyId: 'fixture-host-observer', subject: 'spiffe://qijenchen.dev/managed-ci/host-observer',
    publicKeySpki: hostObserverKeys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    roles: ['runtime-evidence-issuer'], status: 'active', notBefore: '2026-01-01T00:00:00.000Z',
    notAfter: '2027-01-01T00:00:00.000Z', revokedAt: null,
  }
  mkdirSync(resolve(fixtureRoot, 'scripts/schemas'), { recursive: true })
  mkdirSync(resolve(fixtureRoot, 'infra/governance/trust'), { recursive: true })
  writeFileSync(resolve(fixtureRoot, 'scripts/schemas/managed-ci-finalized-receipt.schema.json'), readFileSync(resolve(process.cwd(), 'scripts/schemas/managed-ci-finalized-receipt.schema.json')))
  writeFileSync(resolve(fixtureRoot, 'scripts/schemas/managed-ci-sandbox-receipt.schema.json'), readFileSync(resolve(process.cwd(), 'scripts/schemas/managed-ci-sandbox-receipt.schema.json')))
  const fixtureIssuerRegistry = {
    ...modelAuthorityFixture.issuerRegistry,
    issuers: [...modelAuthorityFixture.issuerRegistry.issuers, signerIssuer, hostObserverIssuer],
  }
  writeFileSync(resolve(fixtureRoot, 'issuer-registry.json'), stableStringify(fixtureIssuerRegistry, 2))
  writeFileSync(resolve(fixtureRoot, 'infra/governance/trust/issuers.json'), stableStringify(fixtureIssuerRegistry, 2))
  const hostSandbox = {
    runnerLabels: ['self-hosted', 'linux', 'x64', 'qijenchen-managed-ci-v1'],
    enforcementAuthority: 'independently-administered-runner-sandbox-daemon',
    containerEngine: 'rootless-podman',
    candidateMount: { containerPath: '/workspace', mode: 'read-only', modelClassMounted: false },
    inputMount: { containerPath: '/input', mode: 'read-only' },
    outputMount: { containerPath: '/output', mode: 'read-write-separate-volume' },
    receiptMount: { containerPath: '/receipts', mode: 'read-write-separate-volume' },
    controlPlaneMount: { containerPath: '/opt/qijenchen/managed-ci/control-plane', mode: 'read-only-content-addressed' },
    kernelControls: {
      networkNamespacePerRun: true, rawSocketDenied: true, hostNetworkDenied: true, hostPidDenied: true,
      hostIpcDenied: true, capabilitiesDropped: 'ALL', noNewPrivileges: true, seccompRequired: true,
      hostSocketMounted: false, rootless: true, runAsUser: 65532, runAsGroup: 65532,
    },
    egress: {
      enforcement: 'host-network-namespace-firewall-and-authenticated-egress-proxy', dnsThroughProxyOnly: true,
      directInternetDenied: true, tlsRequired: true,
      classPolicies: Object.fromEntries(executionClasses.map(id => [id, { mode: id === 'deterministic-hook-audit' ? 'none' : 'exact-host-proxy', allowedHosts: [] }])),
    },
    independentNegativeProbes: [
      'candidate-write-denied', 'undeclared-write-denied', 'raw-socket-denied', 'direct-internet-denied',
      'unlisted-host-denied', 'container-engine-socket-absent', 'host-namespace-denied', 'ambient-secret-absent',
    ],
  }
  const receiptSigner = {
    serviceId: 'qijenchen-managed-ci-receipt-signer-v1', tenantId: 'ajenchen-design-system', endpointHost: 'managed-ci-signer.qijenchen.dev',
    transport: 'tls1.3-mtls', keyIdentity: 'qijenchen-managed-ci-receipt-signer-v1', certificateIdentity: 'spiffe://qijenchen.dev/managed-ci/receipt-signer',
    signatureAlgorithm: 'Ed25519', issuerRegistryPath: 'infra/governance/trust/issuers.json', issuerRole: 'runtime-evidence-issuer',
    oidcTrustPolicyPath: 'infra/governance/providers/managed-ci-oidc-broker-policy.json',
    allowedWorkflowRef: 'ajenchen/design-system/.github/workflows/deep-audit-managed.yml@refs/heads/main',
    allowedEnvironment: 'managed-ci-receipt-finalizer-v1', payloadSchemaPath: 'scripts/schemas/managed-ci-finalized-receipt.schema.json',
    payloadDomainSeparator: 'qijenchen:managed-ci:receipt:v1',
    auditLog: {
      kind: 'managed-ci-signer-audit-event-v1', appendOnly: true, independentReadbackRequired: true,
      requiredFields: ['eventId', 'tenantId', 'keyIdentity', 'policyDigest', 'payloadDigest', 'signature', 'workflowRunId', 'runAttempt', 'environment', 'signedAt'],
    },
  }
  const frozenSubjectArtifact = {
    schemaVersion: 1, kind: 'managed-ci-frozen-subject-v1',
    nameTemplate: 'managed-ci-frozen-subject-{workflowRunId}-{runAttempt}',
    createdByEnvironment: 'managed-ci-freeze-authority-v1',
  }
  const candidateBoundary = {
    jobs: executionClasses, idTokenPermission: 'none', environment: null, executesCandidateCode: true,
    prohibitedExposures: [
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'receipt-signer-binary',
      'secret-broker-binary', 'secret-broker-credential', 'sandbox-daemon-socket',
      'container-engine-socket', 'host-parent-proc',
    ],
    processBoundary: { procMode: 'private-hidepid2', hostPid: false, parentEnvironmentReadable: false },
    credentials: 'none-secretless-egress-proxy-only',
  }
  const authorityClient = {
    sourcePath: 'infra/governance/managed-ci-executor/authority/managed-ci-authority-client.mjs',
    installPath: '/opt/qijenchen/managed-ci-authority/bin/managed-ci-authority-client',
    deploymentAuthority: 'independently-administered-managed-ci-authority-host',
    artifactFormat: 'single-file-node-esm', contentAddressedInstall: true,
    independentBuildProvenanceRequired: true, independentDeploymentReadbackRequired: true,
    activationAttestationField: 'trustedAuthorityAttestationDigest', includedInExecutorImages: false,
    sourceSha256: EVIDENCE_SHA('authority-client-source'),
  }
  const hostSandboxLauncher = {
    sourcePath: 'infra/governance/managed-ci-executor/host/managed-ci-sandbox-launch.mjs',
    installPath: '/opt/qijenchen/managed-ci-host/bin/sandbox-launch',
    deploymentAuthority: 'independently-administered-runner-sandbox-host',
    artifactFormat: 'single-file-node-esm', contentAddressedInstall: true,
    independentBuildProvenanceRequired: true, independentDeploymentReadbackRequired: true,
    activationAttestationField: 'hostSandboxAttestationDigest', includedInExecutorImages: false,
    sourceSha256: EVIDENCE_SHA('sandbox-launcher'),
  }
  const activatedExecutionClasses = Object.fromEntries(executionClasses.map((id, index) => [id, {
    imageDigest: `sha256:${EVIDENCE_SHA(`image-${id}`)}`,
    runtimeSourceSha256,
    runtimeInventoryDigest: EVIDENCE_SHA(`runtime-inventory-${id}`),
    contextArchiveDigest: EVIDENCE_SHA(`context-archive-${id}`),
    sbomDigest: EVIDENCE_SHA(`sbom-${id}`),
    slsaProvenanceDigest: EVIDENCE_SHA(`provenance-${id}`),
    handoffPredicateDigest: EVIDENCE_SHA(`handoff-${id}`),
    evidenceSetDigest: EVIDENCE_SHA(`evidence-set-${id}`),
    provenanceBundleDigest: EVIDENCE_SHA(`provenance-bundle-${id}`),
    provenanceAttestationId: String((index + 1) * 100 + 1),
    provenanceAttestationUrl: `https://github.com/ajenchen/design-system/attestations/${(index + 1) * 100 + 1}`,
    provenanceRecordReadbackDigest: EVIDENCE_SHA(`provenance-record-readback-${id}`),
    sbomBundleDigest: EVIDENCE_SHA(`sbom-bundle-${id}`),
    sbomAttestationId: String((index + 1) * 100 + 2),
    sbomAttestationUrl: `https://github.com/ajenchen/design-system/attestations/${(index + 1) * 100 + 2}`,
    sbomRecordReadbackDigest: EVIDENCE_SHA(`sbom-record-readback-${id}`),
    handoffBundleDigest: EVIDENCE_SHA(`handoff-bundle-${id}`),
    handoffAttestationId: String((index + 1) * 100 + 3),
    handoffAttestationUrl: `https://github.com/ajenchen/design-system/attestations/${(index + 1) * 100 + 3}`,
    handoffRecordReadbackDigest: EVIDENCE_SHA(`handoff-record-readback-${id}`),
    registryReadbackDigest: EVIDENCE_SHA(`registry-${id}`),
  }]))
  const state = {
    root: fixtureRoot,
    active: true,
    plan: {
      workflow: {
        repository: 'ajenchen/design-system', path: '.github/workflows/deep-audit-managed.yml',
        ref: 'refs/heads/main', event: 'workflow_dispatch', runnerEnvironment: 'self-hosted',
      },
      observation: { noncePattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
      trust: { issuerRegistryPath: 'issuer-registry.json' },
      activation: {
        executorSourceCommit: 'a'.repeat(40), executorSourceTree: 'b'.repeat(40), builderWorkflowSha: 'c'.repeat(40),
        executorBuildRunId: '6100',
        executorBuildRunAttempt: 1,
        imageSetArtifactId: '70001',
        imageSetArtifactDigest: EVIDENCE_SHA('image-set-artifact'),
        imageSetManifestSha256: EVIDENCE_SHA('image-set-manifest'),
        imageSetInventorySha256: EVIDENCE_SHA('image-set-inventory'),
        imageSetInventoryEntryCount: 18,
        imageSetArtifactRetentionDays: 90,
        verifiedAt: '2026-07-20T00:00:00.000Z',
        receiptSignerTrustReadbackDigest: EVIDENCE_SHA('receipt-signer-trust-readback'),
        verificationReceipt: {
          schemaVersion: 2,
          kind: 'managed-ci-activation-verification-receipt-v2',
          expiresAt: '2026-07-20T00:30:00.000Z',
          replay: { retentionUntil: '2036-07-20T00:00:00.000Z' },
          issuerRegistryDigest: EVIDENCE_SHA('activation-issuer-registry'),
          trustBinding: { bindingDigest: EVIDENCE_SHA('activation-trust-binding') },
        },
        offlineEvidenceArchive: {
          locator: 'https://evidence.example.test/managed-ci/offline-evidence-archive',
          digest: EVIDENCE_SHA('offline-evidence-archive'),
          size: 65_536,
          format: 'tar-pax-v1',
          inventoryDigest: EVIDENCE_SHA('offline-evidence-archive-inventory'),
          objectVersionId: 'managed-ci-evidence-v1',
          retentionMode: 'compliance-object-lock',
          retentionUntil: '2036-07-20T00:00:00.000Z',
          writerPrincipal: 'spiffe://qijenchen.dev/managed-ci/evidence-archive-writer',
          verifierPrincipal: 'spiffe://qijenchen.dev/managed-ci/evidence-archive-verifier',
          readbackDigest: EVIDENCE_SHA('offline-evidence-archive-readback'),
        },
        executionClasses: activatedExecutionClasses,
      },
    },
    planDigest: EVIDENCE_SHA('managed-plan'),
    schemaDigest: EVIDENCE_SHA('managed-plan-schema'),
    workflow: { workflowIdentityDigest: EVIDENCE_SHA('managed-workflow') },
    trust: {
      digest: EVIDENCE_SHA('managed-trust'),
      receiptPolicy: { quorum: 1 },
    },
    activationEvidence: {
      status: 'verified',
      receiptDigest: EVIDENCE_SHA('managed-ci-activation-verification-receipt'),
      issuerKeyIds: ['fixture-managed-ci-activation-verifier'],
      issuerSubjects: ['spiffe://qijenchen.dev/managed-ci/activation-verifier'],
      blockers: [],
    },
    activationTrustBundle: {
      ...binding,
      fileDigests,
      bindingDigest: sha256(stableStringify(binding, 0)),
      lockCurrent: true,
    },
    oidcBrokerPolicy: { digest: EVIDENCE_SHA('oidc-policy') },
    modelReleaseAuthority: modelAuthorityFixture.policyState,
    executorSupplyChain: {
      externalDeployments: { authorityClient, hostSandboxLauncher },
      controlPlane: { digest: EVIDENCE_SHA('class-adapter-control-plane') },
      imageBindings: Object.fromEntries(executionClasses.map(id => [id, { subjectName: `ghcr.io/ajenchen/managed-ci-${id}`, target: 'runtime' }])),
      recipeDigest: EVIDENCE_SHA('recipe'), buildContext: { digest: EVIDENCE_SHA('context') }, materials: { digest: EVIDENCE_SHA('materials') },
      hostSandboxPolicyDigest: EVIDENCE_SHA('host-sandbox-policy'),
      executorBinarySources: structuredClone(canonicalManagedState.executorSupplyChain.executorBinarySources),
      binarySources: { 'managed-ci-sandbox-launch': { sourceSha256: EVIDENCE_SHA('sandbox-launcher') } },
      policy: {
        source: { repository: 'ajenchen/design-system', protectedRef: 'refs/heads/main', recipePath: 'infra/governance/managed-ci-executor/Containerfile' },
        builder: structuredClone(canonicalManagedState.executorSupplyChain.policy.builder),
        attestations: {
          sbom: { predicateType: 'https://cyclonedx.org/bom' }, provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
          signature: { bundleFormat: 'sigstore-bundle-v0.3', certificateIssuer: 'https://token.actions.githubusercontent.com', certificateIdentity: 'https://github.com/ajenchen/design-system/.github/workflows/build-managed-ci-executors.yml@refs/heads/main' },
        },
        hostSandbox,
      },
    },
    trustedAuthority: {
      digest: EVIDENCE_SHA('trusted-authority'), candidateBoundaryDigest: EVIDENCE_SHA('candidate-boundary'),
      receiptSignerPolicyDigest: EVIDENCE_SHA('receipt-signer-policy'),
      policy: {
        receiptSigner,
        frozenSubjectArtifact,
        candidateBoundary,
        hostObservation: structuredClone(canonicalManagedState.trustedAuthority.policy.hostObservation),
      },
    },
    classes: new Map(executionClasses.map(id => {
      const canonicalClass = canonicalManagedState.classes.get(id)
      return [id, {
        ...canonicalClass,
        oidcBrokerPolicyDigest: brokerPolicies[id] ?? null,
        containerImageDigest: activatedExecutionClasses[id].imageDigest,
      }]
    })),
  }
  const imageBindings = Object.fromEntries(executionClasses.map(id => [id, managedCiExpectedImageSupplyChainBinding(state, id)]))
  const hostReadbacks = Object.fromEntries(executionClasses.map((id, index) => {
    const negativeProbes = {
      candidateWriteDenied: true,
      undeclaredWriteDenied: true,
      rawSocketDenied: true,
      directInternetDenied: true,
      unlistedHostDenied: true,
      containerEngineSocketAbsent: true,
      hostNamespaceDenied: true,
      ambientSecretAbsent: true,
    }
    const observation = {
      schemaVersion: 1,
      kind: 'managed-ci-host-sandbox-independent-observation-v1',
      executionClass: id,
      workflowRunId: '6101',
      runAttempt: 1,
      policyBinding: managedCiExpectedHostSandboxPolicyBinding(state, id),
      receiptDigest: EVIDENCE_SHA(`host-receipt-placeholder-${id}`),
      issuerKeyId: hostObserverIssuer.keyId,
      issuerSubject: hostObserverIssuer.subject,
      signatureAlgorithm: 'Ed25519',
      signature: 'A'.repeat(86),
      observedAt: `2026-07-20T00:0${index}:00.000Z`,
      networkNamespaceDigest: EVIDENCE_SHA(`host-network-namespace-${id}`),
      firewallPolicyDigest: EVIDENCE_SHA(`host-firewall-policy-${id}`),
      egressProxyPolicyDigest: EVIDENCE_SHA(`host-egress-proxy-${id}`),
      mountTableDigest: EVIDENCE_SHA(`host-mount-table-${id}`),
      negativeProbeDigest: sha256(stableStringify(negativeProbes, 0)),
      negativeProbes,
    }
    observation.receiptDigest = managedCiHostSandboxObservationReceiptDigest(state, observation)
    observation.signature = sign(null, managedCiHostSandboxObservationSigningBytes(state, observation), hostObserverKeys.privateKey).toString('base64url')
    return [id, observation]
  }))
  const frozenSubject = managedCiExpectedFrozenSubjectArtifactBinding(state, {
    artifactName: 'managed-ci-frozen-subject-6101-1', artifactId: '70101',
    artifactStorageLocator: 'github-actions-artifact://ajenchen/design-system/70101',
    artifactSha256: EVIDENCE_SHA('frozen-subject-artifact'), artifactSize: 4096,
    subjectCommit: 'd'.repeat(40), subjectTree: 'e'.repeat(40),
    freezeRunId: '12345678-1234-4123-8123-123456789abc',
    manifestSha256: EVIDENCE_SHA('frozen-subject-manifest'), manifestBytesSha256: EVIDENCE_SHA('frozen-subject-manifest-bytes'),
    coverageDigest: EVIDENCE_SHA('frozen-subject-coverage'), shardSetDigest: EVIDENCE_SHA('frozen-subject-shards'),
    workflowDefinitionCommit: 'f'.repeat(40), workflowDefinitionTree: '1'.repeat(40),
    workflowRunId: '6101', runAttempt: 1, authorityOidcProjectionDigest: EVIDENCE_SHA('freeze-authority-oidc'),
  })
  const frozenReadbacks = Object.fromEntries(executionClasses.map((id, index) => [id, managedCiExpectedFrozenSubjectClassReadback(state, {
    executionClass: id, frozenSubject,
    recomputedArtifactSha256: frozenSubject.artifactSha256,
    recomputedManifestBytesSha256: frozenSubject.manifestBytesSha256,
    downloadedAt: `2026-07-20T00:0${index}:00.000Z`,
    hostObservationReceiptDigest: hostReadbacks[id].receiptDigest,
  })]))
  const provenance = managedCiProvenanceBinding(state, {
    workflowDefinitionRef: 'ajenchen/design-system/.github/workflows/deep-audit-managed.yml@refs/heads/main',
    workflowDefinitionCommit: 'f'.repeat(40),
    workflowDefinitionTree: '1'.repeat(40),
    workflowRunId: '6101',
    runAttempt: 1,
    subjectCommit: 'd'.repeat(40),
    subjectTree: 'e'.repeat(40),
    manifestSha256: EVIDENCE_SHA('frozen-subject-manifest'),
    subjectRunId: '12345678-1234-4123-8123-123456789abc',
    frozenSubject,
  })
  const modelReleaseAuthorityBinding = structuredClone(modelAuthorityFixture.binding)
  const signerAuthority = managedCiExpectedReceiptSignerAuthorityBinding(state)
  const classReceipts = Object.fromEntries(executionClasses.map(id => [id, EVIDENCE_SHA(`receipt-${id}`)]))
  const signerIssuerMapping = managedCiExpectedReceiptSignerIssuerMapping(state, {
    issuerKeyId: signerIssuer.keyId,
    issuerSubject: signerIssuer.subject,
  })
  const evidenceKinds = {
    'dependency-acquisition': 'dependency-bundle',
    'deterministic-hook-audit': 'deep-audit-deterministic',
    'model-broker': 'deep-audit-judgment',
    'github-observer': 'deep-audit-ci-enforced',
  }
  const finalizedReceipts = Object.fromEntries(executionClasses.map((id, index) => {
    const selectedProvider = id === 'model-broker' ? 'codex' : null
    const modelRelease = id === 'model-broker' ? modelReleaseAuthorityBinding : null
    const receiptBinding = managedCiExpectedReceiptBinding(state, {
      evidenceKind: evidenceKinds[id],
      selectedProvider,
      modelRelease,
    })
    const payload = managedCiReceiptSigningPayload(state, {
      evidenceKind: evidenceKinds[id],
      workflowRunId: '6101',
      runAttempt: 1,
      rawReceiptDigest: classReceipts[id],
      provenanceBinding: provenance,
      receiptBinding,
      frozenSubjectReadback: frozenReadbacks[id],
      hostObservation: hostReadbacks[id],
      imageSupplyChainBinding: imageBindings[id],
      issuerMapping: signerIssuerMapping,
      signedAt: `2026-07-20T00:1${index}:00.000Z`,
      selectedProvider,
      modelRelease,
    })
    const signature = sign(null, managedCiReceiptSigningBytes(state, payload, {
      issuerMapping: signerIssuerMapping,
    }), signerKeys.privateKey).toString('base64url')
    const event = managedCiSignerAuditEvent(state, {
      eventId: `fixture-signer-event-${index + 1}`,
      signature,
      receiptSigningPayload: payload,
      issuerMapping: signerIssuerMapping,
    })
    return [id, { payload, event }]
  }))
  const receiptSigningPayloads = Object.fromEntries(executionClasses.map(id => [id, finalizedReceipts[id].payload]))
  const signerAuditEvents = Object.fromEntries(executionClasses.map(id => [id, finalizedReceipts[id].event]))
  const observed = {
    planDigest: state.planDigest,
    planSchemaDigest: state.schemaDigest,
    workflowIdentityDigest: state.workflow.workflowIdentityDigest,
    workflowDefinitionRef: provenance.workflowDefinitionRef,
    workflowDefinitionCommit: provenance.workflowDefinitionCommit,
    workflowDefinitionTree: provenance.workflowDefinitionTree,
    workflowDefinitionProtectedMain: true,
    auditedSubjectCommit: provenance.auditedSubjectCommit,
    auditedSubjectTree: provenance.auditedSubjectTree,
    auditedManifestSha256: provenance.auditedManifestSha256,
    auditedSubjectRunId: provenance.auditedSubjectRunId,
    provenanceBindingDigest: provenance.provenanceBindingDigest,
    trustProfileDigest: state.trust.digest,
    activationTrustBundleDigest: state.activationTrustBundle.bindingDigest,
    activationTrustFileDigests: structuredClone(fileDigests),
    governanceManifestDigest: manifest.sha256,
    controlPlaneLockDigest: controlPlaneLock.sha256,
    controlPlaneContractDigest: controlPlaneLock.contractDigest,
    controlPlaneInputDigest: controlPlaneLock.inputDigest,
    controlPlaneSnapshotDigest: controlPlaneLock.snapshotDigest,
    controlPlaneManifestId: controlPlaneLock.manifestId,
    secretBrokerPolicyDigests: structuredClone(brokerPolicies),
    workflowRunId: '6101', runAttempt: 1,
    frozenSubjectArtifactBinding: frozenSubject,
    executionClassFrozenSubjectReadbacks: frozenReadbacks,
    modelReleaseAuthorityBinding,
    executionClassImageSupplyChainBindings: imageBindings,
    executionClassHostSandboxReadbacks: hostReadbacks,
    executionClassReceiptDigests: classReceipts,
    receiptSignerAuthorityBinding: signerAuthority,
    receiptSignerIssuerMapping: signerIssuerMapping,
    issuerRegistryDigest: issuerRegistryDigest(fixtureIssuerRegistry),
    executionClassReceiptSigningPayloads: receiptSigningPayloads,
    executionClassSignerAuditEvents: signerAuditEvents,
  }
  assert.equal(validateStagedCandidateManagedCiTrust(state, observed), true)

  const changedTrustFile = { ...state, activationTrustBundle: structuredClone(state.activationTrustBundle) }
  changedTrustFile.activationTrustBundle.fileDigests.plan = EVIDENCE_SHA('candidate-plan-poison')
  assert.throws(() => validateStagedCandidateManagedCiTrust(changedTrustFile, observed), /changed an activated trust-file/)

  const changedBroker = structuredClone(observed)
  changedBroker.secretBrokerPolicyDigests['model-broker'] = EVIDENCE_SHA('candidate-broker-poison')
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedBroker), /changed the canonical OIDC secret-broker policy/)

  const changedLock = structuredClone(observed)
  changedLock.controlPlaneSnapshotDigest = `sha256:${EVIDENCE_SHA('candidate-lock-poison')}`
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedLock), /changed the signed managed CI plan\/schema\/workflow\/trust\/control-plane bundle/)

  const changedImage = structuredClone(observed)
  changedImage.executionClassImageSupplyChainBindings['model-broker'].build.contextDigest = EVIDENCE_SHA('candidate-context-poison')
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedImage), /changed model-broker image source\/build\/SBOM\/SLSA\/signature binding/)

  const legacyBranchSelectableBuilder = structuredClone(observed)
  legacyBranchSelectableBuilder.executionClassImageSupplyChainBindings['dependency-acquisition'].builder.event = 'workflow_dispatch'
  delete legacyBranchSelectableBuilder.executionClassImageSupplyChainBindings['dependency-acquisition'].builder.activityType
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, legacyBranchSelectableBuilder), /changed dependency-acquisition image source\/build\/SBOM\/SLSA\/signature binding/)

  const substitutedBuilderActivity = structuredClone(observed)
  substitutedBuilderActivity.executionClassImageSupplyChainBindings['deterministic-hook-audit'].builder.activityType = 'substituted-request'
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, substitutedBuilderActivity), /changed deterministic-hook-audit image source\/build\/SBOM\/SLSA\/signature binding/)

  const changedHost = structuredClone(observed)
  changedHost.executionClassHostSandboxReadbacks['github-observer'].policyBinding.kernelControls.rawSocketDenied = false
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedHost), /changed github-observer independent host-sandbox policy/)

  const changedFrozen = structuredClone(observed)
  changedFrozen.executionClassFrozenSubjectReadbacks['model-broker'].recomputedManifestBytesSha256 = EVIDENCE_SHA('candidate-substituted-manifest-bytes')
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedFrozen), /model-broker frozen-subject readback is invalid/)

  const tokenCapable = {
    ...state,
    classes: new Map([...state.classes].map(([id, value]) => [id, { ...value, executionClass: structuredClone(value.executionClass) }])),
  }
  tokenCapable.classes.get('dependency-acquisition').executionClass.permissions['id-token'] = 'write'
  assert.throws(() => validateStagedCandidateManagedCiTrust(tokenCapable, observed), /can mint an OIDC token/)

  const hostCapable = { ...state, trustedAuthority: structuredClone(state.trustedAuthority) }
  hostCapable.trustedAuthority.policy.candidateBoundary.prohibitedExposures = hostCapable.trustedAuthority.policy.candidateBoundary.prohibitedExposures.filter(item => item !== 'host-parent-proc')
  assert.throws(() => validateStagedCandidateManagedCiTrust(hostCapable, observed), /changed the secretless\/tokenless candidate execution boundary/)

  const changedSigner = structuredClone(observed)
  changedSigner.receiptSignerIssuerMapping.certificateIdentity = 'spiffe://candidate.invalid/forged-signer'
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedSigner), /changed the external receipt signer authority or issuer-registry mapping/)

  const changedSignerAudit = structuredClone(observed)
  changedSignerAudit.executionClassSignerAuditEvents['dependency-acquisition'].signerAuthorityBindingDigest = EVIDENCE_SHA('candidate-signer-authority')
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedSignerAudit), /changed the external signer audit authority\/policy\/issuer binding/)

  const changedSignerPayload = structuredClone(observed)
  changedSignerPayload.executionClassReceiptSigningPayloads['deterministic-hook-audit'].rawReceiptDigest = EVIDENCE_SHA('candidate-substituted-raw-receipt')
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedSignerPayload), /signer payload is detached from raw receipt/)

  const changedSignerSignature = structuredClone(observed)
  {
    const signature = changedSignerSignature.executionClassSignerAuditEvents['github-observer'].signature
    changedSignerSignature.executionClassSignerAuditEvents['github-observer'].signature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
  }
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedSignerSignature), /finalized receipt\/signature\/audit readback is invalid/)

  const replayedSignerEvent = structuredClone(observed)
  replayedSignerEvent.executionClassSignerAuditEvents['github-observer'].eventId = replayedSignerEvent.executionClassSignerAuditEvents['dependency-acquisition'].eventId
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, replayedSignerEvent), /signer audit event id is replayed/)

  const changedModelIdentity = structuredClone(observed)
  changedModelIdentity.modelReleaseAuthorityBinding.observedResponseModelId = 'fixture-model-alias'
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedModelIdentity), /model release authority binding is invalid/)

  const changedModelRevocation = structuredClone(observed)
  changedModelRevocation.modelReleaseAuthorityBinding.revocationReadback.bodySha256 = 'not-a-digest'
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedModelRevocation), /model release authority binding is invalid/)

  const changedModelObservation = structuredClone(observed)
  changedModelObservation.modelReleaseAuthorityBinding.exchangeInvocationObservations[0].observedAt = '2027-01-15T09:30:00.000Z'
  assert.throws(() => validateStagedCandidateManagedCiTrust(state, changedModelObservation), /model release authority binding is invalid/)
})

test('production-grade candidate-freeze v4 carries no maximum-assurance replay and rejects baseline substitution', () => {
  const expected = prepareVerification()
  assert.equal(expected.authorityBootstrapReplay, null)
  const missing = ledgerFixture({ receiptCount: 1 })
  delete missing.prepareVerification.authorityBootstrapReplay
  assert.throws(() => validate(missing), /schema validation failed/)

  assert.throws(() => buildStagedRolloutPrepareVerification({
    activeRun: ACTIVE_RUN,
    freeze: expected.freeze.value,
    bootstrapPrerequisite: expected.bootstrapPrerequisite,
    authorityBootstrapReplayReceipt: AUTHORITY_REPLAY_FIXTURE.receipt,
    plan: PLAN,
    attestationPolicy: POLICY,
    issuerRegistry: REGISTRY,
  }), /refuses maximum-assurance replay input/)

  const staleBaseline = structuredClone(expected.bootstrapPrerequisite)
  staleBaseline.activationBaseline.sha256 = 'f'.repeat(64)
  assert.throws(() => buildStagedRolloutPrepareVerification({
    activeRun: ACTIVE_RUN,
    freeze: expected.freeze.value,
    bootstrapPrerequisite: staleBaseline,
    authorityBootstrapReplayReceipt: null,
    plan: PLAN,
    attestationPolicy: POLICY,
    issuerRegistry: REGISTRY,
  }), /activation baseline is missing, stale, or not content-addressed/)
})

test('production-grade prepare v4 constructor loads only the frozen target and rejects replay and symlink substitution', () => {
  const expected = prepareVerification()
  const directory = mkdtempSync(resolve(tmpdir(), 'staged-rollout-prepare-'))
  try {
    const paths = { freeze: 'freeze.json' }
    writeFileSync(resolve(directory, paths.freeze), stableStringify(expected.freeze.value, 0))
    const loaded = loadAndBuildStagedRolloutPrepareVerification({
      evidenceRoot: directory,
      paths,
      activeRun: ACTIVE_RUN,
      bootstrapPrerequisite: expected.bootstrapPrerequisite,
      plan: PLAN,
      issuerRegistry: REGISTRY,
      attestationPolicy: POLICY,
    })
    assert.equal(stagedRolloutPrepareVerificationDigest(loaded), stagedRolloutPrepareVerificationDigest(expected))
    symlinkSync(resolve(directory, paths.freeze), resolve(directory, 'freeze-alias.json'))
    assert.throws(() => loadAndBuildStagedRolloutPrepareVerification({
      evidenceRoot: directory,
      paths: { ...paths, freeze: 'freeze-alias.json' },
      activeRun: ACTIVE_RUN,
      bootstrapPrerequisite: expected.bootstrapPrerequisite,
      plan: PLAN,
      issuerRegistry: REGISTRY,
      attestationPolicy: POLICY,
    }), /unique regular no-symlink/)

    assert.throws(() => loadAndBuildStagedRolloutPrepareVerification({
      evidenceRoot: directory,
      paths: { ...paths, authorityBootstrapReplay: 'replay.json' },
      activeRun: ACTIVE_RUN,
      bootstrapPrerequisite: expected.bootstrapPrerequisite,
      plan: PLAN,
      issuerRegistry: REGISTRY,
      attestationPolicy: POLICY,
    }), /candidate freeze evidence paths has an invalid or open shape/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('content-addressed but hand-authored status/random proof cannot replace a strict release-trust artifact', () => {
  const ledger = ledgerFixture({ receiptCount: 6 })
  replaceEvidenceValue(ledger.receipts[5], 'release-trust-preflight-v4', {
    schemaVersion: 4,
    kind: 'release-trust-preflight',
    eligible: true,
    evidenceSha256: EVIDENCE_SHA('hand-authored-success'),
  })
  resignFrom(ledger, 5)
  const strictValidators = { ...FIXTURE_CONTRACT_VALIDATORS }
  delete strictValidators['release-trust-preflight-v4']
  assert.throws(() => validateStagedRolloutLedger(PLAN, ledger, {
    activeRun: ACTIVE_RUN,
    certificationRun: CERT_RUN,
    issuerRegistry: REGISTRY,
    attestationPolicy: POLICY,
    now: NOW,
    activationReadinessResolver: FIXTURE_ACTIVATION_READINESS,
    contractValidators: strictValidators,
  }), /invalid or open shape/)
})

test('strict release trust loads the complete activation tuple from one canonical root and fails closed when it is absent', () => {
  const inputs = loadReleaseTrustActivationInputs(REPO_ROOT)
  assert.deepEqual(inputs.activationInventory, JSON.parse(readFileSync(resolve(REPO_ROOT, 'infra/governance/inventory/managed-repos.json'), 'utf8')))
  assert.deepEqual(inputs.activationDesired, JSON.parse(readFileSync(resolve(REPO_ROOT, 'infra/governance/desired/github.json'), 'utf8')))
  assert.deepEqual(inputs.mutationBoundaryContract, JSON.parse(readFileSync(resolve(REPO_ROOT, 'infra/governance/providers/github-mutation-boundary-contract.json'), 'utf8')))
  assert.equal(inputs.activationRequirementsPath, resolve(REPO_ROOT, 'infra/governance/external-activation-requirements.json'))

  const missingRoot = mkdtempSync(resolve(tmpdir(), 'staged-release-trust-missing-root-'))
  try {
    assert.throws(() => loadReleaseTrustActivationInputs(missingRoot), /ENOENT/)
  } finally {
    rmSync(missingRoot, { recursive: true, force: true })
  }
})

test('protected PR proof must materialize the exact prepared inventory and rejects commit-tree mismatch', () => {
  const ledger = ledgerFixture()
  const proof = evidenceValue(ledger.receipts[2], 'protected-pr-readback-v1')
  proof.gitObjectProof.treeOid = 'f'.repeat(40)
  replaceEvidenceValue(ledger.receipts[2], 'protected-pr-readback-v1', proof)
  resignFrom(ledger, 2)
  assert.throws(() => validate(ledger), /recursive Git tree OID/)
})

test('candidate freeze projects nested untracked, executable, symlink, and deletion state exactly', () => {
  const baseline = ledgerFixture({ receiptCount: 3 })
  const proof = evidenceValue(baseline.receipts[2], 'protected-pr-readback-v1').gitObjectProof
  assert.deepEqual(proof.entries.map(item => item.path), [
    'docs/link',
    'infra/governance/bin/run-harnesses.mjs',
    'new/nested.txt',
    'package-lock.json',
    'scripts/governance-build-graph.mjs',
    'scripts/tool.sh',
  ])
  assert.equal(proof.entries.some(item => item.path === 'deleted.txt'), false)

  const cases = [
    {
      name: 'deleted path reintroduced',
      mutate: value => value.gitObjectProof.entries.push({ path: 'deleted.txt', kind: 'file', mode: '100644', bytes: 0, sha256: sha256(''), blobOid: gitObjectId('blob', Buffer.alloc(0)), offset: value.gitObjectProof.artifact.bytes }),
      expected: /omits or adds frozen paths/,
    },
    {
      name: 'nested untracked path omitted',
      mutate: value => { value.gitObjectProof.entries = value.gitObjectProof.entries.filter(item => item.path !== 'new/nested.txt') },
      expected: /omits or adds frozen paths/,
    },
    {
      name: 'executable bit lost',
      mutate: value => { value.gitObjectProof.entries.find(item => item.path === 'scripts/tool.sh').mode = '100644' },
      expected: /mode differs/,
    },
    {
      name: 'symlink target substituted',
      mutate: value => {
        const proof = value.gitObjectProof
        const entry = proof.entries.find(item => item.path === 'docs/link')
        const bytes = Buffer.from(proof.artifact.contentBase64, 'base64')
        Buffer.alloc(entry.bytes, 0x78).copy(bytes, entry.offset)
        proof.artifact.contentBase64 = bytes.toString('base64')
        proof.artifact.sha256 = sha256(bytes)
      },
      expected: /bytes differ/,
    },
  ]
  for (const item of cases) {
    const ledger = ledgerFixture({ receiptCount: 3 })
    const value = evidenceValue(ledger.receipts[2], 'protected-pr-readback-v1')
    item.mutate(value)
    replaceEvidenceValue(ledger.receipts[2], 'protected-pr-readback-v1', value)
    resignFrom(ledger, 2)
    assert.throws(() => validate(ledger), item.expected, item.name)
  }
})

test('candidate freeze v2 requires the exact two checks and canonical one-parent commit authority', () => {
  const unbound = ledgerFixture({ receiptCount: 1 })
  delete unbound.prepareVerification.bootstrapPrerequisite
  assert.throws(() => validate(unbound), /schema validation failed/)

  const poison = (mutate, expected) => {
    const ledger = ledgerFixture({ receiptCount: 1 })
    mutate(ledger.prepareVerification.freeze.value)
    refreshPrepareVerification(ledger)
    assert.throws(() => validate(ledger), expected)
  }
  poison(value => value.checks.pop(), /exactly the registered All-Harness and build-graph checks/)
  poison(value => value.checks.reverse(), /identity\/producer is substituted/)
  poison(value => { value.checks[0].argv = ['node', 'attacker.mjs'] }, /argv differs/)
  poison(value => { value.checks[0].entrypointSha256 = 'f'.repeat(64) }, /frozen producer bytes/)
  poison(value => { value.checks[1].exitCode = 1 }, /did not complete successfully/)
  poison(value => { value.checks[1].snapshotAfter.indexDigest = 'f'.repeat(64) }, /exact frozen snapshot/)
  poison(value => {
    const check = value.checks[0]
    const receipt = JSON.parse(Buffer.from(check.artifact.bytes, 'base64').toString('utf8'))
    receipt.result.pass = false
    const bytes = Buffer.from(`${stableStringify(receipt)}\n`)
    check.artifact.bytes = bytes.toString('base64')
    check.evidenceSha256 = sha256(bytes)
    check.result.artifactSha256 = check.evidenceSha256
  }, /does not record a content-addressed pass/)
  poison(value => {
    const commit = value.gitObjectProof.commit
    const bytes = Buffer.from(commit.bytes, 'base64')
    const substituted = Buffer.from(bytes.toString('utf8').replace(`parent ${ACTIVE_RUN.manifest.head}`, `parent ${'f'.repeat(40)}`))
    commit.bytes = substituted.toString('base64')
    commit.oid = gitObjectId('commit', substituted)
  }, /parent\/identity\/time\/message/)
  poison(value => {
    const commit = value.gitObjectProof.commit
    const bytes = Buffer.from(commit.bytes, 'base64')
    const substituted = Buffer.from(bytes.toString('utf8').replace(`parent ${ACTIVE_RUN.manifest.head}\n`, `parent ${ACTIVE_RUN.manifest.head}\nparent ${'e'.repeat(40)}\n`))
    commit.bytes = substituted.toString('base64')
    commit.oid = gitObjectId('commit', substituted)
  }, /parent\/identity\/time\/message/)
  const premature = ledgerFixture({ receiptCount: 1 })
  premature.prepareVerification.preparedAt = '2026-07-20T00:39:00.000Z'
  premature.prepareVerification.freeze.value.preparedAt = premature.prepareVerification.preparedAt
  refreshPrepareVerification(premature)
  assert.throws(() => validate(premature), /finished after the validation receipt was prepared/)

  const predates = ledgerFixture({ receiptCount: 1 })
  predates.receipts[0].observedAt = '2026-07-20T00:44:00.000Z'
  predates.receipts[0].authority.issuedAt = predates.receipts[0].observedAt
  predates.receipts[0].authority.expiresAt = '2026-07-27T00:44:00.000Z'
  signReceipt(predates.receipts[0])
  assert.throws(() => validate(predates), /observation must equal the completed local prepare verification time/)

  const postdated = ledgerFixture({ receiptCount: 1 })
  postdated.receipts[0].observedAt = '2026-07-20T01:00:00.000Z'
  postdated.receipts[0].authority.issuedAt = postdated.receipts[0].observedAt
  postdated.receipts[0].authority.expiresAt = '2026-07-27T01:00:00.000Z'
  signReceipt(postdated.receipts[0])
  assert.throws(() => validate(postdated), /observation must equal the completed local prepare verification time/)
})

test('production-grade managed-CI activation cannot be substituted to predate the frozen target', () => {
  const ledger = ledgerFixture({ receiptCount: 2 })
  const bootstrap = evidenceValue(ledger.receipts[1], 'github-policy-bootstrap-readback-v1')
  bootstrap.activation.requirements[0].observedAt = '2026-07-20T00:30:00.000Z'
  bootstrap.activation.requirements[0].evidence.payload.observedResource.protectedMainMergedAt = '2026-07-20T00:20:00.000Z'
  bootstrap.managedCiBootstrap.protectedMainMergedAt = '2026-07-20T00:20:00.000Z'
  bootstrap.managedCiBootstrap.activationObservedAt = '2026-07-20T00:30:00.000Z'
  bootstrap.activationDigest = sha256(stableStringify(bootstrap.activation, 0))
  replaceEvidenceValue(ledger.receipts[1], 'github-policy-bootstrap-readback-v1', bootstrap)
  resignFrom(ledger, 1)
  assert.throws(() => validate(ledger), /production-grade managed CI control plane activation must follow the immutable candidate freeze/)
})

test('PR-head certification permits only pending CI dimensions 64 and 66 and cannot claim early completion', () => {
  for (const [label, mutate, expected] of [
    ['unexpected pending dimension', coverage => { coverage.gaps.ciEnforced = [64, 65] }, /exactly post-release dims 64 and 66/],
    ['circular early full completion', coverage => Object.assign(coverage, coverageProof({ complete: true })), /only the typed post-release gap set pending/],
    ['author impersonates peer', coverage => { coverage.authorProvider = coverage.providers.peer }, /author provider differs from the committed run/],
    ['provider identity digest substituted', coverage => { coverage.providerIdentityDigest = 'f'.repeat(64) }, /provider identity digest differs from the committed run/],
  ]) {
    const ledger = ledgerFixture({ receiptCount: 4 })
    const certification = evidenceValue(ledger.receipts[3], 'pr-head-certification-v1')
    mutate(certification.coverage)
    replaceEvidenceValue(ledger.receipts[3], 'pr-head-certification-v1', certification)
    resignFrom(ledger, 3)
    assert.throws(() => validate(ledger), expected, label)
  }
})

test('dirty candidate-freeze run cannot be reused as the committed PR-head certification run', () => {
  const ledger = ledgerFixture({ receiptCount: 3 })
  ledger.certificationRun = structuredClone(ACTIVE_BINDING)
  assert.throws(() => validateStagedRolloutLedger(PLAN, ledger, {
    activeRun: ACTIVE_RUN,
    certificationRun: ACTIVE_RUN,
    issuerRegistry: REGISTRY,
    attestationPolicy: POLICY,
    now: NOW,
    activationReadinessResolver: FIXTURE_ACTIVATION_READINESS,
    contractValidators: FIXTURE_CONTRACT_VALIDATORS,
  }), /dirty candidate-freeze run cannot be reused/)
})

test('merge cannot drift from the certified tree or happen before signed policy/certification gates', () => {
  const treeDrift = ledgerFixture({ receiptCount: 5 })
  const drift = evidenceValue(treeDrift.receipts[4], 'github-hard-gates-readback-v1')
  drift.sourceTree = 'f'.repeat(40)
  replaceEvidenceValue(treeDrift.receipts[4], 'github-hard-gates-readback-v1', drift)
  resignFrom(treeDrift, 4)
  assert.throws(() => validate(treeDrift), /changed the certified frozen source tree/)

  const policyAfterMerge = ledgerFixture({ receiptCount: 5 })
  const earlyMerge = evidenceValue(policyAfterMerge.receipts[4], 'github-hard-gates-readback-v1')
  earlyMerge.mergedAt = '2026-07-20T01:40:00.000Z'
  replaceEvidenceValue(policyAfterMerge.receipts[4], 'github-hard-gates-readback-v1', earlyMerge)
  resignFrom(policyAfterMerge, 4)
  assert.throws(() => validate(policyAfterMerge), /merged before the signed policy bootstrap/)
})

test('full completion requires typed canonical CI import and soak starts after both WM and completion', () => {
  const missingImport = ledgerFixture({ receiptCount: 9 })
  const full = evidenceValue(missingImport.receipts[8], 'full-deep-audit-verification-v1')
  delete full.ciImport
  replaceEvidenceValue(missingImport.receipts[8], 'full-deep-audit-verification-v1', full)
  resignFrom(missingImport, 8)
  assert.throws(() => validate(missingImport), /invalid or open shape/)

  const wrongStart = ledgerFixture({ receiptCount: 10 })
  const soak = evidenceValue(wrongStart.receipts[9], 'candidate-bound-soak-72h-v1')
  soak.startedAt = observedAt(7)
  replaceEvidenceValue(wrongStart.receipts[9], 'candidate-bound-soak-72h-v1', soak)
  resignFrom(wrongStart, 9)
  assert.throws(() => validate(wrongStart), /later of WM canary and full rollout completion/)
})

test('re-signed random GitHub hard-gate digests cannot masquerade as desired-state readback', () => {
  const ledger = ledgerFixture({ receiptCount: 5 })
  const proof = evidenceValue(ledger.receipts[4], 'github-hard-gates-readback-v1')
  proof.desiredStateDigest = EVIDENCE_SHA('attacker-desired-state')
  replaceEvidenceValue(ledger.receipts[4], 'github-hard-gates-readback-v1', proof)
  resignFrom(ledger, 4)
  assert.throws(() => validate(ledger), /desired-state digest is not canonical/)
})

test('an entirely re-signed archived-run substitution still fails against the loaded manifest content address', () => {
  const ledger = ledgerFixture()
  const substituted = { ...ACTIVE_BINDING, manifestSha256: 'e'.repeat(64), worktreeFingerprint: 'd'.repeat(64) }
  ledger.activeRun = structuredClone(substituted)
  ledger.prepareVerification.activeRun = structuredClone(substituted)
  ledger.prepareVerification.freeze.value.activeRun = structuredClone(substituted)
  for (const receipt of ledger.receipts.slice(0, 3)) receipt.activeRun = structuredClone(substituted)
  refreshPrepareVerification(ledger)
  assert.throws(() => validate(ledger), /current active run HEAD\/tree\/worktree\/manifest/)
})

test('canonical loader permits exactly freeze plus PR-head runs, rejects a third pointer and archived tampering, and init output is no-clobber', () => {
  // Consume the canonical evidence-root resolver instead of assuming `.git` is a
  // directory: in a linked Git worktree it is a file, so the hardcoded join raised
  // ENOTDIR and this suite could never run from the worktree layout this repo uses.
  const evidenceBase = resolveGitRuntimeRoots(process.cwd(), { create: true }).evidence
  const evidenceRoot = mkdtempSync(resolve(evidenceBase, 'staged-rollout-loader-test-'))
  try {
    const snapshot = captureDeepAuditSnapshot(process.cwd())
    const freeze = writeRuntimeRun(evidenceRoot, runtimeRunManifest(snapshot, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-07-20T00:00:00.000Z'))
    const certification = writeRuntimeRun(evidenceRoot, runtimeRunManifest(snapshot, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-07-20T03:30:00.000Z'))
    const third = writeRuntimeRun(evidenceRoot, runtimeRunManifest(snapshot, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '2026-07-20T04:00:00.000Z'))
    writeRuntimePointer(evidenceRoot, certification)
    const ledger = {
      activeRun: activeRunBinding(freeze),
      certificationRun: activeRunBinding(certification),
      receipts: [{}, {}, {}],
    }
    const loaded = loadCanonicalStagedRolloutRunBindings({ ledger, evidenceRoot })
    assert.equal(loaded.freeze.runId, freeze.manifest.runId)
    assert.equal(loaded.certification.runId, certification.manifest.runId)

    writeRuntimePointer(evidenceRoot, third)
    assert.throws(() => loadCanonicalStagedRolloutRunBindings({ ledger, evidenceRoot }), /third\/substituted run/)

    writeRuntimePointer(evidenceRoot, certification)
    const freezeManifestBytes = readFileSync(freeze.manifestPath)
    const staleFreezeManifest = structuredClone(freeze.manifest)
    staleFreezeManifest.providers.self.reviewTransport = 'stale-managed-review-transport'
    staleFreezeManifest.providerIdentityDigest = deepAuditProviderIdentityDigest({
      authorProvider: staleFreezeManifest.authorProvider,
      providers: staleFreezeManifest.providers,
      reviewSelection: staleFreezeManifest.reviewSelection,
    })
    const staleFreezeBytes = Buffer.from(`${stableStringify(staleFreezeManifest, 2)}\n`)
    writeFileSync(freeze.manifestPath, staleFreezeBytes)
    ledger.activeRun = activeRunBinding({ manifest: staleFreezeManifest, manifestSha256: sha256(staleFreezeBytes) })
    assert.throws(
      () => loadCanonicalStagedRolloutRunBindings({ ledger, evidenceRoot }),
      /candidate-freeze provider binding is stale/,
    )
    writeFileSync(freeze.manifestPath, freezeManifestBytes)
    ledger.activeRun = activeRunBinding(freeze)

    const certificationManifestBytes = readFileSync(certification.manifestPath)
    const staleCertificationManifest = structuredClone(certification.manifest)
    staleCertificationManifest.providers.self.reviewTransport = 'stale-managed-review-transport'
    staleCertificationManifest.providerIdentityDigest = deepAuditProviderIdentityDigest({
      authorProvider: staleCertificationManifest.authorProvider,
      providers: staleCertificationManifest.providers,
      reviewSelection: staleCertificationManifest.reviewSelection,
    })
    const staleCertificationBytes = Buffer.from(`${stableStringify(staleCertificationManifest, 2)}\n`)
    writeFileSync(certification.manifestPath, staleCertificationBytes)
    const staleCertification = { manifest: staleCertificationManifest, manifestSha256: sha256(staleCertificationBytes) }
    ledger.certificationRun = activeRunBinding(staleCertification)
    writeRuntimePointer(evidenceRoot, staleCertification)
    assert.throws(
      () => loadCanonicalStagedRolloutRunBindings({ ledger, evidenceRoot }),
      /PR-head certification provider binding is stale/,
    )
    writeFileSync(certification.manifestPath, certificationManifestBytes)
    ledger.certificationRun = activeRunBinding(certification)
    writeRuntimePointer(evidenceRoot, certification)

    writeFileSync(resolve(evidenceRoot, 'deep-audit', 'runs', freeze.manifest.runId, 'run-manifest.json'), '{}')
    assert.throws(() => loadCanonicalStagedRolloutRunBindings({ ledger, evidenceRoot }), /archived manifest digest mismatch/)

    const fresh = writeRuntimeRun(evidenceRoot, freeze.manifest)
    ledger.activeRun = activeRunBinding(fresh)
    const output = resolve(evidenceRoot, 'rollout-ledger.json')
    const initialized = spawnSync(process.execPath, ['infra/governance/bin/staged-rollout.mjs', '--init-ledger', '--evidence-root', evidenceRoot, '--output', output], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(initialized.status, 0, initialized.stderr)
    const report = JSON.parse(initialized.stdout)
    assert.equal(report.created, true)
    assert.equal(report.ledgerSha256, sha256(readFileSync(output)))
    const noClobber = spawnSync(process.execPath, ['infra/governance/bin/staged-rollout.mjs', '--init-ledger', '--evidence-root', evidenceRoot, '--output', output], { cwd: process.cwd(), encoding: 'utf8' })
    assert.notEqual(noClobber.status, 0)
    assert.match(noClobber.stderr, /EEXIST|file already exists/)
  } finally {
    rmSync(evidenceRoot, { recursive: true, force: true })
  }
})

test('actor identity and issuance time are enforced while historical completion receipts remain durable', () => {
  const actorPoison = ledgerFixture({ receiptCount: 1 })
  actorPoison.receipts[0].actor.id = 'unregistered-actor'
  signReceipt(actorPoison.receipts[0])
  assert.throws(() => validate(actorPoison), /actor must be one of the authorized signer subjects/)

  const expired = ledgerFixture({ receiptCount: 1 })
  assert.equal(validateStagedRolloutLedger(PLAN, expired, {
    activeRun: ACTIVE_RUN,
    issuerRegistry: REGISTRY,
    attestationPolicy: POLICY,
    now: new Date('2026-07-28T00:00:00.000Z'),
    activationReadinessResolver: FIXTURE_ACTIVATION_READINESS,
    contractValidators: FIXTURE_CONTRACT_VALIDATORS,
  }).valid, true)

  const future = ledgerFixture({ receiptCount: 1 })
  future.receipts[0].authority.issuedAt = '2026-07-29T00:00:00.000Z'
  future.receipts[0].authority.expiresAt = '2026-07-30T00:00:00.000Z'
  signReceipt(future.receipts[0])
  assert.throws(() => validateStagedRolloutLedger(PLAN, future, {
    activeRun: ACTIVE_RUN,
    issuerRegistry: REGISTRY,
    attestationPolicy: POLICY,
    now: new Date('2026-07-28T00:00:00.000Z'),
    activationReadinessResolver: FIXTURE_ACTIVATION_READINESS,
    contractValidators: FIXTURE_CONTRACT_VALIDATORS,
  }), /issued in the future/)
})

test('CLI defaults remain read-only and no implicit execute mode exists', () => {
  const protectedFiles = [
    new URL('../staged-rollout-plan.json', import.meta.url),
    new URL('../schemas/staged-rollout.schema.json', import.meta.url),
    new URL('../lib/staged-rollout.mjs', import.meta.url),
  ]
  const before = protectedFiles.map(path => sha256(readFileSync(path)))
  for (const args of [['--plan', '--json'], ['--check', '--json']]) {
    const result = spawnSync(process.execPath, ['infra/governance/bin/staged-rollout.mjs', ...args], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.mutatesExternalState, false)
    if (args[0] === '--check') {
      assert.equal(report.planValid, true)
      assert.equal(report.rolloutValid, false)
      assert.equal(report.executionReady, false)
      assert.equal(report.blockers[0].code, 'missing-ledger')
      assert.equal(report.releaseStatus, 'NOT_RELEASED')
      assert.equal(report.candidateReleaseDigest, null)
      assert.equal(report.deferredExecutionPackageBinding, null)
      assert.equal(Object.prototype.hasOwnProperty.call(report, 'valid'), false)
    }
  }
  const humanCheck = spawnSync(
    process.execPath,
    ['infra/governance/bin/staged-rollout.mjs', '--check'],
    { cwd: process.cwd(), encoding: 'utf8' },
  )
  assert.equal(humanCheck.status, 0, humanCheck.stderr)
  assert.match(humanCheck.stdout, /Release: NOT_RELEASED/)
  assert.match(humanCheck.stdout, /Next: candidate-freeze/)
  const prepare = spawnSync(process.execPath, ['infra/governance/bin/staged-rollout.mjs', '--prepare-plan'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.equal(prepare.status, 0, prepare.stderr)
  assert.match(prepare.stdout, /candidate-freeze-verification-v2/)
  assert.doesNotMatch(prepare.stdout, /deep-audit-coverage-verification-v3|frozen-dependency-trust-v1|external-activation-readiness-v3/)
  const forbidden = spawnSync(process.execPath, ['infra/governance/bin/staged-rollout.mjs', '--execute'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.notEqual(forbidden.status, 0)
  assert.match(forbidden.stderr, /Unknown option --execute/)
  assert.deepEqual(protectedFiles.map(path => sha256(readFileSync(path))), before)
})

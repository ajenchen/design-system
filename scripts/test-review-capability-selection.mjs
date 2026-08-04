#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  buildGenuineCrossProviderReviewReceipt,
  materializeReviewCapabilityCertification,
  prepareReviewCapabilityCertification,
  resolveHighestCertifiedReviewCapability,
  resolveProviderReviewBinding,
  validateGenuineCrossProviderReviewReceipt,
  verifyEntitlementAvailabilityEvidence,
  verifyReviewCapabilitySelection,
} from '../packages/governance/src/provider-review-binding.mjs'
import {
  buildExternalEntitlementReviewInvocation,
  executeExternalEntitlementReviewInvocation,
  loadModelInvocationProfiles,
  normalizeExternalEntitlementReviewResponse,
  selectBrokerResultWithSelector,
} from './lib/model-evidence-plan.mjs'
import {
  captureDeepAuditSnapshot,
  discoverVerifiedReviewerEntitlementAvailability,
  validateSelectedEntitlementPeerBinding,
} from './lib/deep-audit-evidence-contract.mjs'
import {
  ensureRuntimeEvidenceRoot,
} from './lib/governance-runtime-evidence.mjs'

const readJson = (relative) => JSON.parse(readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'))
const registry = readJson('packages/governance/canonical/providers.json')
const capabilityRegistry = readJson('infra/governance/providers/review-capability-registry.json')
const emptyCapabilityCertifications = readJson('infra/governance/providers/review-capability-certifications.json')
const invocationRegistry = readJson('infra/governance/providers/model-invocation-profiles.json')
const modelReleaseRegistry = readJson('infra/governance/providers/model-release-registry.json')
const loadedInvocationProfiles = loadModelInvocationProfiles({ repoRoot: process.cwd() })

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
for (const [value, schemaPath] of [
  [registry, 'packages/governance/canonical/schemas/providers.schema.json'],
  [capabilityRegistry, 'infra/governance/schemas/review-capability-registry.schema.json'],
  [emptyCapabilityCertifications, 'infra/governance/schemas/review-capability-certifications.schema.json'],
  [invocationRegistry, 'infra/governance/schemas/model-invocation-profiles.schema.json'],
]) {
  const validate = ajv.compile(readJson(schemaPath))
  assert.equal(validate(value), true, `${schemaPath}:${ajv.errorsText(validate.errors)}`)
}
assert.deepEqual(loadedInvocationProfiles.externalEntitlementProfiles['claude-max-code'], invocationRegistry.externalEntitlementProfiles['claude-max-code'])
const maxInvocationProfile = loadedInvocationProfiles.externalEntitlementProfiles['claude-max-code']
const selectedExternalResult = selectBrokerResultWithSelector({
  providerId: maxInvocationProfile.providerId,
  modelIdentity: maxInvocationProfile.modelIdentity,
  responseSelector: maxInvocationProfile.responseSelector,
  requestedModel: 'claude-opus-4-8',
  response: {
    providerRunId: 'claude-max-fixture-run',
    observedModelId: 'claude-opus-4-8',
    status: 'completed',
    outputs: [{ kind: 'structured-review-result', canonicalJson: '{"fixture":true}' }],
  },
})
assert.equal(selectedExternalResult.observedResponseModelId, 'claude-opus-4-8')
assert.deepEqual(selectedExternalResult.result, { fixture: true })
assert.throws(
  () => selectBrokerResultWithSelector({
    providerId: maxInvocationProfile.providerId,
    modelIdentity: maxInvocationProfile.modelIdentity,
    responseSelector: maxInvocationProfile.responseSelector,
    requestedModel: 'claude-opus-4-8',
    response: {
      providerRunId: 'claude-max-fixture-run',
      observedModelId: 'claude-sonnet-5',
      status: 'completed',
      outputs: [{ kind: 'structured-review-result', canonicalJson: '{"fixture":true}' }],
    },
  }),
  /does not exactly match/,
)
assert.throws(
  () => selectBrokerResultWithSelector({
    providerId: maxInvocationProfile.providerId,
    modelIdentity: maxInvocationProfile.modelIdentity,
    responseSelector: maxInvocationProfile.responseSelector,
    requestedModel: 'claude-opus-4-8',
    response: {
      providerRunId: 'claude-max-fixture-run',
      observedModelId: 'claude-opus-4-8',
      status: 'completed',
      outputs: [
        { kind: 'structured-review-result', canonicalJson: '{"fixture":true}' },
        { kind: 'structured-review-result', canonicalJson: '{"fixture":false}' },
      ],
    },
  }),
  /must match exactly once/,
)

const compareUtf8 = (left, right) => Buffer.from(left).compare(Buffer.from(right))
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(compareUtf8).map((key) => [key, stable(value[key])]))
  }
  return value
}
const digest = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
const now = new Date('2026-07-26T00:00:00.000Z')
const maxTarget = {
  id: 'macos-darwin-arm64-native-no-space',
  operatingSystem: 'macos',
  platform: 'darwin',
  arch: 'arm64',
  executionEnvironment: 'native',
  distributionVersion: '2.1.215',
  pathClass: 'no-space',
}
const maxGitTree = '1'.repeat(40)
const maxExchangeBudget = capabilityRegistry.providerCapabilityPrecedence.claude
  .find((row) => row.modelReleaseId === 'claude/claude-opus-4-8')
  .exchangeBudget
const capabilityProbeCheck = (reviewProfileId, outcome) => {
  const reviewProfile = capabilityRegistry.reviewProfiles.find(
    (record) => record.id === reviewProfileId,
  )
  const adapter = invocationRegistry.externalEntitlementProfiles['claude-max-code']
    .deploymentAdapter
  const args = adapter.arguments.map((token) => ({
    '{model}': reviewProfile.requestModelId,
    '{effort}': 'max',
    '{emptyTools}': '',
    '{resultSchemaJson}': '{"type":"object"}',
    '{systemPrompt}': '{"kind":"fixture"}',
    '{emptyMcpConfig}': '{"mcpServers":{}}',
  })[token] ?? token)
  const outcomeAssertions = outcome === 'available'
    ? [
        { id: 'review-capability-outcome-available', pass: true },
        { id: 'review-capability-profile-observed', pass: true },
        { id: 'review-capability-model-usage-exact', pass: true },
      ]
    : outcome === 'permanently-unavailable'
      ? [
          {
            id: 'review-capability-outcome-permanently-unavailable',
            pass: true,
          },
          {
            id: 'review-capability-machine-readable-unavailability-observed',
            pass: true,
          },
          { id: 'review-capability-profile-observed', pass: true },
        ]
      : [
          { id: 'review-capability-outcome-classified', pass: false },
          { id: 'review-capability-profile-observed', pass: false },
        ]
  return {
    id: `review-capability-${reviewProfileId}`,
    driver: 'claude-review-capability-probe',
    certificationImpact: 'capability-only',
    status: outcome === 'unknown' ? 'fail' : 'pass',
    command: {
      executable: 'claude',
      arguments: args,
      cwd: '<fixture>',
      stdin: 'sha256',
    },
    result: {
      assertions: [
        ...outcomeAssertions,
        { id: 'review-capability-maximum-compute-observed', pass: true },
        {
          id: 'review-capability-isolated-no-tools-route-observed',
          pass: true,
        },
      ],
    },
  }
}
const runtimeEvidenceFixture = ({
  target = maxTarget,
  gitTree = maxGitTree,
  generatedAt = '2026-07-25T00:00:00.000Z',
  validUntil = '2026-07-27T00:00:00.000Z',
  assertionId = 'claude-max-entitlement-available',
  assertionPass = true,
  selectedReviewProfileId = 'claude-max-code-opus-4-8',
  probeOutcomes = null,
} = {}) => {
  const targetBindingDigest = `sha256:${digest(target)}`
  const unsigned = {
    schemaVersion: 4,
    kind: 'provider-runtime-conformance',
    scope: 'provider',
    status: 'pass',
    run: { generatedAt, validUntil },
    subject: { gitTree },
    providers: [{
      id: 'claude',
      status: 'pass',
      targetBinding: { id: target.id, digest: targetBindingDigest },
      tool: {
        distribution: {
          resolutionStatus: 'pass',
          distributionVersion: target.distributionVersion,
          authorityDigest: `sha256:${digest('fixture-claude-runtime-authority')}`,
        },
      },
      checks: [
        {
          id: 'subscription-entitlement-readback',
          certificationImpact: 'capability-only',
          status: 'pass',
          result: { assertions: [{ id: assertionId, pass: assertionPass }] },
        },
        ...(probeOutcomes ?? [
          ['claude-max-code-fable-5',
            selectedReviewProfileId === 'claude-max-code-fable-5'
              ? 'available'
              : 'permanently-unavailable'],
          ['claude-max-code-opus-5',
            selectedReviewProfileId === 'claude-max-code-opus-5'
              ? 'available'
              : 'permanently-unavailable'],
          [selectedReviewProfileId, 'available'],
        ]).filter(([reviewProfileId], index, values) => (
          values.findIndex(([candidate]) => candidate === reviewProfileId) === index
        )).map(([reviewProfileId, outcome]) => capabilityProbeCheck(
          reviewProfileId,
          outcome,
        )),
      ],
    }],
  }
  const evidence = {
    ...unsigned,
    evidenceDigest: `sha256:${digest(unsigned)}`,
    attestation: { status: 'verified' },
  }
  const bytes = Buffer.from(JSON.stringify(stable(evidence)), 'utf8')
  const artifactSha256 = createHash('sha256').update(bytes).digest('hex')
  return {
    bytes,
    binding: {
      reference: `infra/governance/evidence/provider-runtime/${artifactSha256}.json`,
      artifactSha256,
      evidenceDigest: evidence.evidenceDigest,
      providerId: 'claude',
      profileId: 'claude',
      targetId: target.id,
      targetDigest: targetBindingDigest,
      operatingSystem: target.operatingSystem,
      platform: target.platform,
      arch: target.arch,
      executionEnvironment: target.executionEnvironment,
      distributionVersion: target.distributionVersion,
      pathClass: target.pathClass,
      gitTree,
    },
  }
}
const entitlementCertificationFixture = (runtimeEvidence) => ({
  $schema: '../schemas/provider-surface-certification.schema.json',
  schemaVersion: 2,
  certifications: [{
    id: 'claude-local-authority',
    provider: 'claude-code',
    runtimeKind: 'claude-code-cli',
    surface: 'local',
    repositoryRole: 'authority',
    status: 'certified',
    certifiedAt: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-07-27T00:00:00.000Z',
    platformMatrix: [{
      ...maxTarget,
      status: 'certified',
      certifiedAt: '2026-07-25T00:00:00.000Z',
      expiresAt: '2026-07-27T00:00:00.000Z',
      runtimeEvidence: runtimeEvidence.binding,
    }],
  }],
})
const maxRuntimeEvidence = runtimeEvidenceFixture()
const maxAvailabilityRecord = verifyEntitlementAvailabilityEvidence({
  invocationRegistry,
  invocationProfileId: 'claude-max-code',
  certificationLedger: entitlementCertificationFixture(maxRuntimeEvidence),
  target: maxTarget,
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: maxRuntimeEvidence.bytes,
  now,
})
const maxAvailability = [maxAvailabilityRecord]
const entitlementDiscoveryRoot = mkdtempSync(join(tmpdir(), 'review-entitlement-discovery-'))
try {
  const entitlementEvidencePath = resolvePath(entitlementDiscoveryRoot, maxRuntimeEvidence.binding.reference)
  mkdirSync(dirname(entitlementEvidencePath), { recursive: true })
  writeFileSync(entitlementEvidencePath, maxRuntimeEvidence.bytes)
  const discoveryInputs = {
    invocationRegistry,
    capabilityRegistry,
    ledger: entitlementCertificationFixture(maxRuntimeEvidence),
  }
  const discovered = discoverVerifiedReviewerEntitlementAvailability({
    repository: entitlementDiscoveryRoot,
    inputs: discoveryInputs,
    expectedGitTree: maxGitTree,
    now,
  })
  // A serialized record that merely claims attestation.status=verified is not
  // a live signed certification. Discovery must fail closed even though the
  // lower-level content/ledger fixture is otherwise internally consistent.
  assert.equal(discovered.length, 0)
  assert.equal(discoverVerifiedReviewerEntitlementAvailability({
    repository: entitlementDiscoveryRoot,
    inputs: discoveryInputs,
    expectedGitTree: maxGitTree,
    requiredEntitlementId: 'claude-max',
    peerProvider: 'claude',
    peerRuntime: 'claude-code-cli',
    peerSurface: 'local',
    peerTarget: maxTarget.id,
    now,
  }).length, 0)
  assert.equal(discoverVerifiedReviewerEntitlementAvailability({
    repository: entitlementDiscoveryRoot,
    inputs: discoveryInputs,
    expectedGitTree: maxGitTree,
    peerTarget: 'macos-darwin-arm64-native-space',
    now,
  }).length, 0)

  const staleEvidence = runtimeEvidenceFixture({
    generatedAt: '2026-07-23T00:00:00.000Z',
    validUntil: '2026-07-24T00:00:00.000Z',
  })
  const stalePath = resolvePath(entitlementDiscoveryRoot, staleEvidence.binding.reference)
  mkdirSync(dirname(stalePath), { recursive: true })
  writeFileSync(stalePath, staleEvidence.bytes)
  assert.equal(discoverVerifiedReviewerEntitlementAvailability({
    repository: entitlementDiscoveryRoot,
    inputs: {
      invocationRegistry,
      capabilityRegistry,
      ledger: entitlementCertificationFixture(staleEvidence),
    },
    expectedGitTree: maxGitTree,
    now,
  }).length, 0)

  const unsignedValue = JSON.parse(maxRuntimeEvidence.bytes.toString('utf8'))
  unsignedValue.attestation.status = 'pending'
  const unsignedBytes = Buffer.from(JSON.stringify(stable(unsignedValue)), 'utf8')
  const unsignedSha256 = createHash('sha256').update(unsignedBytes).digest('hex')
  const unsignedEvidence = {
    bytes: unsignedBytes,
    binding: {
      ...maxRuntimeEvidence.binding,
      artifactSha256: unsignedSha256,
      reference: `infra/governance/evidence/provider-runtime/${unsignedSha256}.json`,
    },
  }
  const unsignedPath = resolvePath(entitlementDiscoveryRoot, unsignedEvidence.binding.reference)
  mkdirSync(dirname(unsignedPath), { recursive: true })
  writeFileSync(unsignedPath, unsignedEvidence.bytes)
  assert.equal(discoverVerifiedReviewerEntitlementAvailability({
    repository: entitlementDiscoveryRoot,
    inputs: {
      invocationRegistry,
      capabilityRegistry,
      ledger: entitlementCertificationFixture(unsignedEvidence),
    },
    expectedGitTree: maxGitTree,
    now,
  }).length, 0)
} finally {
  rmSync(entitlementDiscoveryRoot, { recursive: true, force: true })
}
const profile = (id) => capabilityRegistry.reviewProfiles.find((record) => record.id === id)
const certification = (id, reviewProfileId, {
  assuranceTier = 'maximum',
  reasoningTier = 'maximum',
  computeTier = 'maximum',
  status = 'certified',
} = {}) => {
  const selected = profile(reviewProfileId)
  return {
    id,
    reviewProfileId,
    reviewProfileDigest: digest(selected),
    providerId: selected.providerId,
    modelReleaseId: selected.modelReleaseId,
    entitlementId: selected.entitlementId,
    status,
    assuranceTier,
    reasoningTier,
    computeTier,
    certifiedAt: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-08-25T00:00:00.000Z',
    evidence: {
      reference: `fixture/${id}.json`,
      sha256: createHash('sha256').update(`fixture:${id}`).digest('hex'),
    },
  }
}
const ledger = (...certifications) => ({
  schemaVersion: 1,
  kind: 'review-capability-certification-ledger',
  certifications: [...certifications].sort((left, right) => compareUtf8(left.id, right.id)),
})
const resolve = (overrides = {}) => resolveHighestCertifiedReviewCapability({
  registry,
  capabilityRegistry,
  capabilityCertificationLedger: overrides.capabilityCertificationLedger,
  invocationRegistry: overrides.invocationRegistry ?? invocationRegistry,
  modelReleaseRegistry,
  skill: 'deep-audit-cross-codex',
  selfProviderId: overrides.selfProviderId,
  authorProviderId: overrides.authorProviderId ?? overrides.selfProviderId,
  requiredEntitlementId: overrides.requiredEntitlementId ?? null,
  entitlementAvailability: overrides.entitlementAvailability ?? [],
  now,
})
const expectCode = (code, operation) => assert.throws(operation, (error) => error?.code === code)
const fabricatedHashOnlyAvailability = [JSON.parse(JSON.stringify(maxAvailabilityRecord))]
const reflectedCapabilityForgery = JSON.parse(JSON.stringify(maxAvailabilityRecord))
for (const symbol of Object.getOwnPropertySymbols(maxAvailabilityRecord)) {
  Object.defineProperty(reflectedCapabilityForgery, symbol, {
    value: maxAvailabilityRecord[symbol],
  })
}

assert.equal(registry.canonical.reviewSelectionPolicies['highest-certified-independent-review-v1']
  .reviewClasses['tier-0-governance'].assuranceTier, 'maximum')
assert.equal(registry.canonical.reviewSelectionPolicies['highest-certified-independent-review-v1']
  .reviewClasses['tier-0-governance'].reasoningTier, 'maximum')
assert.equal(registry.canonical.reviewSelectionPolicies['highest-certified-independent-review-v1']
  .reviewClasses['tier-0-governance'].computeTier, 'maximum')
expectCode('REVIEW_ENTITLEMENT_AVAILABILITY_INVALID', () => resolve({
  selfProviderId: 'codex',
  entitlementAvailability: fabricatedHashOnlyAvailability,
  capabilityCertificationLedger: emptyCapabilityCertifications,
}))
assert.equal(Object.getOwnPropertySymbols(maxAvailabilityRecord).length, 0)
expectCode('REVIEW_ENTITLEMENT_AVAILABILITY_INVALID', () => resolve({
  selfProviderId: 'codex',
  entitlementAvailability: [reflectedCapabilityForgery],
  capabilityCertificationLedger: emptyCapabilityCertifications,
}))
expectCode('REVIEW_INVOCATION_PROFILE_UNAVAILABLE', () => verifyEntitlementAvailabilityEvidence({
  invocationRegistry,
  invocationProfileId: 'unknown-entitlement-profile',
  certificationLedger: entitlementCertificationFixture(maxRuntimeEvidence),
  target: maxTarget,
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: maxRuntimeEvidence.bytes,
  now,
}))
expectCode('REVIEW_ENTITLEMENT_CERTIFICATION_UNTRUSTED', () => verifyEntitlementAvailabilityEvidence({
  invocationRegistry,
  invocationProfileId: 'claude-max-code',
  certificationLedger: { certifications: entitlementCertificationFixture(maxRuntimeEvidence).certifications },
  target: maxTarget,
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: maxRuntimeEvidence.bytes,
  now,
}))
const staleRuntimeEvidence = runtimeEvidenceFixture({
  generatedAt: '2026-07-23T00:00:00.000Z',
  validUntil: '2026-07-24T00:00:00.000Z',
})
expectCode('REVIEW_ENTITLEMENT_UNAVAILABLE', () => verifyEntitlementAvailabilityEvidence({
  invocationRegistry,
  invocationProfileId: 'claude-max-code',
  certificationLedger: entitlementCertificationFixture(staleRuntimeEvidence),
  target: maxTarget,
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: staleRuntimeEvidence.bytes,
  now,
}))
expectCode('REVIEW_TARGET_UNCERTIFIED', () => verifyEntitlementAvailabilityEvidence({
  invocationRegistry,
  invocationProfileId: 'claude-max-code',
  certificationLedger: entitlementCertificationFixture(maxRuntimeEvidence),
  target: { ...maxTarget, id: 'macos-darwin-arm64-native-space', pathClass: 'contains-space' },
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: maxRuntimeEvidence.bytes,
  now,
}))
expectCode('REVIEW_ENTITLEMENT_EVIDENCE_CONTENT_MISMATCH', () => verifyEntitlementAvailabilityEvidence({
  invocationRegistry,
  invocationProfileId: 'claude-max-code',
  certificationLedger: entitlementCertificationFixture(maxRuntimeEvidence),
  target: maxTarget,
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: Buffer.concat([maxRuntimeEvidence.bytes, Buffer.from(' ')]),
  now,
}))
const substitutedReadback = runtimeEvidenceFixture({ assertionId: 'claude-pro-entitlement-available' })
expectCode('REVIEW_ENTITLEMENT_READBACK_REJECTED', () => verifyEntitlementAvailabilityEvidence({
  invocationRegistry,
  invocationProfileId: 'claude-max-code',
  certificationLedger: entitlementCertificationFixture(substitutedReadback),
  target: maxTarget,
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: substitutedReadback.bytes,
  now,
}))
assert.equal(resolveProviderReviewBinding({
  registry,
  skill: 'deep-audit-cross-codex',
  selfProviderId: 'codex',
  requireCertificationContract: true,
}).selectionReasonCode, 'REVIEW_CAPABILITY_SELECTION_REQUIRED')
const frozenBlockedSelection = resolveProviderReviewBinding({
  registry,
  capabilityRegistry,
  capabilityCertificationLedger: emptyCapabilityCertifications,
  invocationRegistry,
  modelReleaseRegistry,
  skill: 'deep-audit-cross-codex',
  selfProviderId: 'codex',
  requireCertificationContract: true,
})
assert.equal(frozenBlockedSelection.peer, null)
assert.equal(frozenBlockedSelection.selectionStatus, 'REVIEW-BLOCKED')
assert.equal(frozenBlockedSelection.selectionReceipt.selectionReasonCode, 'REVIEW_CAPABILITY_UNAVAILABLE')
assert.equal(Object.hasOwn(frozenBlockedSelection.selectionReceipt, 'selected'), false)
expectCode('REVIEW_CAPABILITY_UNAVAILABLE', () => resolve({
  selfProviderId: 'codex',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: emptyCapabilityCertifications,
}))
expectCode('REVIEW_ENTITLEMENT_UNAVAILABLE', () => resolve({
  selfProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  capabilityCertificationLedger: emptyCapabilityCertifications,
}))

const maxLedger = ledger(
  certification('max-opus', 'claude-max-code-opus-4-8'),
  certification('max-sonnet', 'claude-max-code-sonnet-5', { reasoningTier: 'high' }),
  certification('managed-opus', 'claude-managed-api-opus-4-8'),
)
const staleAuthorityInvocationRegistry = structuredClone(invocationRegistry)
staleAuthorityInvocationRegistry.externalEntitlementProfiles['claude-max-code']
  .availabilityEvidence.checkId = 'substituted-entitlement-readback'
expectCode('REVIEW_ENTITLEMENT_AVAILABILITY_INVALID', () => resolve({
  selfProviderId: 'codex',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: maxLedger,
  invocationRegistry: staleAuthorityInvocationRegistry,
}))
const maxSelection = resolve({
  selfProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: maxLedger,
})
assert.equal(maxSelection.peer.id, 'claude')
assert.equal(maxSelection.selectedProfile.id, 'claude-max-code-opus-4-8')
assert.equal(maxSelection.selectionReceipt.selected.entitlementId, 'claude-max')
assert.equal(maxSelection.selectionReceipt.requiredAssuranceTier, 'maximum')
assert.equal(maxSelection.selectionReceipt.requiredReasoningTier, 'maximum')
assert.equal(maxSelection.selectionReceipt.requiredComputeTier, 'maximum')
assert.equal(maxSelection.selectionReceipt.selected.assuranceTier, 'maximum')
const exactEntitlementPeerManifest = {
  reviewSelection: maxSelection.selectionReceipt,
  providers: {
    peer: {
      id: maxAvailabilityRecord.runtimeProviderId,
      runtimeIdentity: maxAvailabilityRecord.runtimeKind,
      runtimeSurface: maxAvailabilityRecord.runtimeSurface,
      runtimeProfileId: maxAvailabilityRecord.runtimeProfileId,
      runtimeCertification: {
        certificationId: maxAvailabilityRecord.runtimeCertificationId,
        recordDigest: maxAvailabilityRecord.runtimeCertificationDigest,
        targetId: maxAvailabilityRecord.target.id,
        targetDigest: maxAvailabilityRecord.targetDigest,
      },
    },
  },
}
assert.equal(validateSelectedEntitlementPeerBinding(exactEntitlementPeerManifest), true)
for (const [field, value] of [
  ['runtimeIdentity', 'claude-code-cloud'],
  ['runtimeSurface', 'cloud'],
  ['runtimeProfileId', 'claude-cloud'],
]) {
  const substituted = structuredClone(exactEntitlementPeerManifest)
  substituted.providers.peer[field] = value
  assert.throws(
    () => validateSelectedEntitlementPeerBinding(substituted),
    /detached from the exact peer runtime\/surface\/profile\/target certification/,
  )
}
for (const [field, value] of [
  ['targetId', 'macos-darwin-arm64-native-space'],
  ['targetDigest', digest({ ...maxTarget, id: 'macos-darwin-arm64-native-space', pathClass: 'contains-space' })],
  ['recordDigest', digest('substituted runtime certification')],
]) {
  const substituted = structuredClone(exactEntitlementPeerManifest)
  substituted.providers.peer.runtimeCertification[field] = value
  assert.throws(
    () => validateSelectedEntitlementPeerBinding(substituted),
    /detached from the exact peer runtime\/surface\/profile\/target certification/,
  )
}
assert.equal(resolve({
  selfProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: maxLedger,
}).selectionReceipt.selectionDigest, maxSelection.selectionReceipt.selectionDigest)
const equalCapabilityRoutes = ledger(
  certification('equal-max-opus', 'claude-max-code-opus-4-8'),
  certification('equal-managed-opus', 'claude-managed-api-opus-4-8'),
)
const entitlementPreferredOnCapabilityTie = resolve({
  selfProviderId: 'codex',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: equalCapabilityRoutes,
})
assert.equal(entitlementPreferredOnCapabilityTie.selectedProfile.id, 'claude-max-code-opus-4-8')
assert.equal(entitlementPreferredOnCapabilityTie.selectionReceipt.selected.routeClass, 'subscription-entitlement')

const managedCapabilityHigher = ledger(
  certification('lower-max-opus', 'claude-max-code-opus-4-8', { reasoningTier: 'high' }),
  certification('higher-managed-opus', 'claude-managed-api-opus-4-8'),
)
const noEntitlementPreferenceAcrossCapabilityDifference = resolve({
  selfProviderId: 'codex',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: managedCapabilityHigher,
})
assert.equal(noEntitlementPreferenceAcrossCapabilityDifference.selectedProfile.id, 'claude-managed-api-opus-4-8')
assert.equal(noEntitlementPreferenceAcrossCapabilityDifference.selectionReceipt.selected.routeClass, 'managed-api')

const noEntitlementSelection = resolve({
  selfProviderId: 'codex',
  capabilityCertificationLedger: maxLedger,
})
assert.equal(noEntitlementSelection.selectedProfile.id, 'claude-managed-api-opus-4-8')
const onlyManaged = ledger(certification('managed-only', 'claude-managed-api-opus-4-8'))
expectCode('REVIEW_CAPABILITY_UNAVAILABLE', () => resolve({
  selfProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: onlyManaged,
}))

const codexLedger = ledger(
  certification('codex-sol', 'codex-managed-api-sol'),
  certification('codex-terra', 'codex-managed-api-terra', { reasoningTier: 'high' }),
)
const codexSelection = resolve({
  selfProviderId: 'claude',
  capabilityCertificationLedger: codexLedger,
})
assert.equal(codexSelection.peer.id, 'codex')
assert.equal(codexSelection.selectedProfile.id, 'codex-managed-api-sol')

const highOnly = ledger(certification('max-high-only', 'claude-max-code-opus-4-8', {
  assuranceTier: 'high',
}))
expectCode('REVIEW_CAPABILITY_UNAVAILABLE', () => resolve({
  selfProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: highOnly,
}))
const lowerReasoningOnly = ledger(certification('max-lower-reasoning-only', 'claude-max-code-opus-4-8', {
  reasoningTier: 'high',
}))
expectCode('REVIEW_CAPABILITY_UNAVAILABLE', () => resolve({
  selfProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: lowerReasoningOnly,
}))
const lowerComputeOnly = ledger(certification('max-lower-compute-only', 'claude-max-code-opus-4-8', {
  computeTier: 'high',
}))
expectCode('REVIEW_CAPABILITY_UNAVAILABLE', () => resolve({
  selfProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: lowerComputeOnly,
}))

const sameProviderOnly = ledger(certification('codex-self', 'codex-managed-api-sol'))
expectCode('REVIEW_CAPABILITY_UNAVAILABLE', () => resolve({
  selfProviderId: 'codex',
  capabilityCertificationLedger: sameProviderOnly,
}))

const fixedPeer = structuredClone(registry)
fixedPeer.providers.find((provider) => provider.id === 'codex')
  .adapter.skillBindings['deep-audit-cross-codex'].peer = 'claude'
expectCode('REVIEW_FIXED_PEER_FORBIDDEN', () => resolveProviderReviewBinding({
  registry: fixedPeer,
  skill: 'deep-audit-cross-codex',
  selfProviderId: 'codex',
}))

const mutableAlias = structuredClone(capabilityRegistry)
mutableAlias.reviewProfiles.find((record) => record.id === 'claude-max-code-opus-4-8')
  .requestModelId = 'opus'
expectCode('REVIEW_MODEL_ALIAS_FORBIDDEN', () => resolveHighestCertifiedReviewCapability({
  registry,
  capabilityRegistry: mutableAlias,
  capabilityCertificationLedger: maxLedger,
  invocationRegistry,
  modelReleaseRegistry,
  skill: 'deep-audit-cross-codex',
  selfProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  now,
}))

assert.equal(verifyReviewCapabilitySelection({
  receipt: maxSelection.selectionReceipt,
  registry,
  capabilityRegistry,
  capabilityCertificationLedger: maxLedger,
  invocationRegistry,
  modelReleaseRegistry,
  skill: 'deep-audit-cross-codex',
  selfProviderId: 'codex',
  authorProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  observedProviderId: 'claude',
  observedReviewProfileId: 'claude-max-code-opus-4-8',
  observedModelReleaseId: 'claude/claude-opus-4-8',
  observedResponseModelId: 'claude-opus-4-8',
  now,
}), true)
const forgedReceipts = [
  (() => {
    const value = structuredClone(maxSelection.selectionReceipt)
    value.selected.reviewProfileId = 'claude-max-code-sonnet-5'
    value.selected.modelReleaseId = 'claude/claude-sonnet-5'
    value.selected.requestModelId = 'claude-sonnet-5'
    value.selected.capabilityCertificationId = 'max-sonnet'
    value.selected.reasoningTier = 'high'
    return value
  })(),
  (() => {
    const value = structuredClone(maxSelection.selectionReceipt)
    value.selected.capabilityCertificationId = 'uncertified-capability'
    return value
  })(),
  (() => {
    const value = structuredClone(maxSelection.selectionReceipt)
    value.selected.computeTier = 'high'
    return value
  })(),
  (() => {
    const value = structuredClone(maxSelection.selectionReceipt)
    value.selectedProfileDigest = 'f'.repeat(64)
    return value
  })(),
]
for (const forgedReceipt of forgedReceipts) {
  delete forgedReceipt.selectionDigest
  forgedReceipt.selectionDigest = digest(forgedReceipt)
  expectCode('REVIEW_SELECTION_RECEIPT_NONCANONICAL', () => verifyReviewCapabilitySelection({
    receipt: forgedReceipt,
    registry,
    capabilityRegistry,
    capabilityCertificationLedger: maxLedger,
    invocationRegistry,
    modelReleaseRegistry,
    skill: 'deep-audit-cross-codex',
    selfProviderId: 'codex',
    authorProviderId: 'codex',
    requiredEntitlementId: 'claude-max',
    entitlementAvailability: maxAvailability,
    observedProviderId: 'claude',
    observedReviewProfileId: 'claude-max-code-opus-4-8',
    observedModelReleaseId: 'claude/claude-opus-4-8',
    observedResponseModelId: 'claude-opus-4-8',
    now,
  }))
}
expectCode('REVIEW_MODEL_SUBSTITUTION', () => verifyReviewCapabilitySelection({
  receipt: maxSelection.selectionReceipt,
  registry,
  capabilityRegistry,
  capabilityCertificationLedger: maxLedger,
  invocationRegistry,
  modelReleaseRegistry,
  skill: 'deep-audit-cross-codex',
  selfProviderId: 'codex',
  authorProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  observedProviderId: 'claude',
  observedReviewProfileId: 'claude-max-code-opus-4-8',
  observedModelReleaseId: 'claude/claude-opus-4-8',
  observedResponseModelId: 'claude-sonnet-5',
  now,
}))
const staleCapabilityRegistry = structuredClone(capabilityRegistry)
staleCapabilityRegistry.reviewProfiles.reverse()
expectCode('REVIEW_CAPABILITY_REGISTRY_STALE', () => verifyReviewCapabilitySelection({
  receipt: maxSelection.selectionReceipt,
  registry,
  capabilityRegistry: staleCapabilityRegistry,
  capabilityCertificationLedger: maxLedger,
  invocationRegistry,
  modelReleaseRegistry,
  skill: 'deep-audit-cross-codex',
  selfProviderId: 'codex',
  authorProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  observedProviderId: 'claude',
  observedReviewProfileId: 'claude-max-code-opus-4-8',
  observedModelReleaseId: 'claude/claude-opus-4-8',
  observedResponseModelId: 'claude-opus-4-8',
  now,
}))

const preparedCapability = prepareReviewCapabilityCertification({
  registry,
  capabilityRegistry,
  invocationRegistry,
  modelReleaseRegistry,
  runtimeCertificationLedger: entitlementCertificationFixture(maxRuntimeEvidence),
  reviewProfileId: 'claude-max-code-opus-4-8',
  certificationId: 'promoted-max-opus',
  capability: {
    assuranceTier: 'maximum',
    reasoningTier: 'maximum',
    computeTier: 'maximum',
    exchangeBudget: maxExchangeBudget,
  },
  target: maxTarget,
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: maxRuntimeEvidence.bytes,
  certifiedAt: '2026-07-25T12:00:00.000Z',
  expiresAt: '2026-08-25T00:00:00.000Z',
  now,
})
assert.match(preparedCapability.evidenceReference,
  /^infra\/governance\/evidence\/review-capability\/[a-f0-9]{64}\.json$/)
assert.equal(
  createHash('sha256').update(preparedCapability.evidenceBytes).digest('hex'),
  preparedCapability.evidenceSha256,
)
assert.equal(preparedCapability.certification.expiresAt, '2026-07-27T00:00:00.000Z')

const fableRuntimeEvidence = runtimeEvidenceFixture({
  selectedReviewProfileId: 'claude-max-code-fable-5',
})
const fableExchangeBudget = capabilityRegistry.providerCapabilityPrecedence.claude
  .find((row) => row.modelReleaseId === 'claude/claude-fable-5')
  .exchangeBudget
const preparedFableCapability = prepareReviewCapabilityCertification({
  registry,
  capabilityRegistry,
  invocationRegistry,
  modelReleaseRegistry,
  runtimeCertificationLedger: entitlementCertificationFixture(fableRuntimeEvidence),
  reviewProfileId: 'claude-max-code-fable-5',
  certificationId: 'promoted-max-fable',
  capability: {
    assuranceTier: 'maximum',
    reasoningTier: 'maximum',
    computeTier: 'maximum',
    exchangeBudget: fableExchangeBudget,
  },
  target: maxTarget,
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: fableRuntimeEvidence.bytes,
  certifiedAt: '2026-07-25T12:00:00.000Z',
  expiresAt: '2026-08-25T00:00:00.000Z',
  now,
})
const fableLedger = materializeReviewCapabilityCertification({
  capabilityCertificationLedger: emptyCapabilityCertifications,
  prepared: preparedFableCapability,
})
const fableAvailability = [verifyEntitlementAvailabilityEvidence({
  invocationRegistry,
  invocationProfileId: 'claude-max-code',
  certificationLedger: entitlementCertificationFixture(fableRuntimeEvidence),
  target: maxTarget,
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: fableRuntimeEvidence.bytes,
  now,
})]
assert.equal(resolve({
  selfProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: fableAvailability,
  capabilityCertificationLedger: fableLedger,
}).selectedProfile.id, 'claude-max-code-fable-5')

const higherAvailableEvidence = runtimeEvidenceFixture({
  selectedReviewProfileId: 'claude-max-code-opus-4-8',
  probeOutcomes: [
    ['claude-max-code-fable-5', 'available'],
    ['claude-max-code-opus-5', 'permanently-unavailable'],
    ['claude-max-code-opus-4-8', 'available'],
  ],
})
expectCode('REVIEW_HIGHER_CAPABILITY_AVAILABLE', () =>
  prepareReviewCapabilityCertification({
    registry,
    capabilityRegistry,
    invocationRegistry,
    modelReleaseRegistry,
    runtimeCertificationLedger: entitlementCertificationFixture(higherAvailableEvidence),
    reviewProfileId: 'claude-max-code-opus-4-8',
    certificationId: 'forbidden-lower-opus',
    capability: {
      assuranceTier: 'maximum',
      reasoningTier: 'maximum',
      computeTier: 'maximum',
      exchangeBudget: maxExchangeBudget,
    },
    target: maxTarget,
    expectedGitTree: maxGitTree,
    runtimeEvidenceBytes: higherAvailableEvidence.bytes,
    certifiedAt: '2026-07-25T12:00:00.000Z',
    expiresAt: '2026-08-25T00:00:00.000Z',
    now,
  }))

const higherTransientEvidence = runtimeEvidenceFixture({
  selectedReviewProfileId: 'claude-max-code-opus-4-8',
  probeOutcomes: [
    ['claude-max-code-fable-5', 'unknown'],
    ['claude-max-code-opus-5', 'permanently-unavailable'],
    ['claude-max-code-opus-4-8', 'available'],
  ],
})
expectCode('REVIEW_HIGHER_CAPABILITY_OUTCOME_UNVERIFIED', () =>
  prepareReviewCapabilityCertification({
    registry,
    capabilityRegistry,
    invocationRegistry,
    modelReleaseRegistry,
    runtimeCertificationLedger: entitlementCertificationFixture(higherTransientEvidence),
    reviewProfileId: 'claude-max-code-opus-4-8',
    certificationId: 'forbidden-transient-downgrade',
    capability: {
      assuranceTier: 'maximum',
      reasoningTier: 'maximum',
      computeTier: 'maximum',
      exchangeBudget: maxExchangeBudget,
    },
    target: maxTarget,
    expectedGitTree: maxGitTree,
    runtimeEvidenceBytes: higherTransientEvidence.bytes,
    certifiedAt: '2026-07-25T12:00:00.000Z',
    expiresAt: '2026-08-25T00:00:00.000Z',
    now,
  }))

const promotedLedger = materializeReviewCapabilityCertification({
  capabilityCertificationLedger: emptyCapabilityCertifications,
  prepared: preparedCapability,
})
assert.equal(promotedLedger.certifications.length, 1)
assert.equal(materializeReviewCapabilityCertification({
  capabilityCertificationLedger: promotedLedger,
  prepared: preparedCapability,
}), promotedLedger)
const substitutedPreparedCapability = {
  ...preparedCapability,
  certification: {
    ...preparedCapability.certification,
    computeTier: 'high',
  },
}
expectCode('REVIEW_CAPABILITY_CERTIFICATION_INVALID', () =>
  materializeReviewCapabilityCertification({
    capabilityCertificationLedger: promotedLedger,
    prepared: substitutedPreparedCapability,
  }))
expectCode('REVIEW_TARGET_UNCERTIFIED', () => prepareReviewCapabilityCertification({
  registry,
  capabilityRegistry,
  invocationRegistry,
  modelReleaseRegistry,
  runtimeCertificationLedger: entitlementCertificationFixture(maxRuntimeEvidence),
  reviewProfileId: 'claude-max-code-opus-4-8',
  certificationId: 'wrong-target',
  capability: {
    assuranceTier: 'maximum',
    reasoningTier: 'maximum',
    computeTier: 'maximum',
    exchangeBudget: maxExchangeBudget,
  },
  target: { ...maxTarget, id: 'macos-darwin-arm64-native-space', pathClass: 'contains-space' },
  expectedGitTree: maxGitTree,
  runtimeEvidenceBytes: maxRuntimeEvidence.bytes,
  certifiedAt: '2026-07-25T12:00:00.000Z',
  expiresAt: '2026-08-25T00:00:00.000Z',
  now,
}))
const promotedSelection = resolve({
  selfProviderId: 'codex',
  requiredEntitlementId: 'claude-max',
  entitlementAvailability: maxAvailability,
  capabilityCertificationLedger: promotedLedger,
})
assert.equal(promotedSelection.selectionReceipt.selected.capabilityCertificationId,
  'promoted-max-opus')

const adapterProfile = invocationRegistry.externalEntitlementProfiles['claude-max-code']
const adapterInstructions = '{"authority":"provider-neutral-review"}\n'
const adapterRequest = {
  requestKind: 'review-work-batch',
  requestOrdinal: 0,
  requestDigest: digest('request-0'),
  requestModelId: promotedSelection.selectionReceipt.selected.requestModelId,
  reviewerProviderId: promotedSelection.selectionReceipt.selected.providerId,
  reviewProfileId: promotedSelection.selectionReceipt.selected.reviewProfileId,
  invocationProfileId: promotedSelection.selectionReceipt.selected.invocationProfileId,
  modelReleaseId: promotedSelection.selectionReceipt.selected.modelReleaseId,
  selectionDigest: promotedSelection.selectionReceipt.selectionDigest,
  capabilityCertificationId:
    promotedSelection.selectionReceipt.selected.capabilityCertificationId,
  selectedCapabilityCertificationDigest:
    promotedSelection.selectionReceipt.selectedCapabilityCertificationDigest,
  memberCount: 1,
  members: [{
    memberOrdinal: 0,
    unitId: digest('adapter-unit'),
    unitDigest: digest('adapter-unit-digest'),
    instructions: {
      canonicalText: adapterInstructions,
      bytes: Buffer.byteLength(adapterInstructions),
      sha256: createHash('sha256').update(adapterInstructions).digest('hex'),
    },
  }],
  preparedInputBudget: {
    plannedInputBytes: maxExchangeBudget.maxInputBytes,
    plannedOutputBytes: maxExchangeBudget.maxOutputBytes,
    plannedPayloadBytes:
      maxExchangeBudget.maxInputBytes + maxExchangeBudget.maxOutputBytes,
    ...maxExchangeBudget,
  },
}
const adapterInvocation = buildExternalEntitlementReviewInvocation({
  invocationProfileId: 'claude-max-code',
  profile: adapterProfile,
  selectionReceipt: promotedSelection.selectionReceipt,
  portableRequest: {
    request: adapterRequest,
    evidenceCarrier: { kind: 'fixture-content-addressed-carrier' },
    blobs: [],
    prerequisiteResultPayloads: [],
  },
  resultSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdict'],
    properties: { verdict: { enum: ['verified'] } },
  },
  authReadback: {
    loggedIn: true,
    authMethod: 'claude.ai',
    subscriptionType: 'max',
    email: 'not-carried-into-the-plan@example.invalid',
  },
  runtimeTarget: maxTarget,
  repoRoot: process.cwd(),
  forbiddenArguments: invocationRegistry.forbiddenArguments,
})
assert.equal(adapterInvocation.selectedEffort, 'max')
assert.equal(adapterInvocation.repositoryIsolation,
  'private-empty-working-directory-no-repository-mount')
assert.equal(adapterInvocation.environmentPolicy,
  'closed-first-party-subscription-no-api-credentials')
assert.equal(adapterInvocation.sessionPersistence, 'disabled')
assert.equal(adapterInvocation.fallbackPolicy, 'forbidden')
assert.equal(adapterInvocation.args.includes('--fallback-model'), false)
assert.equal(adapterInvocation.args.includes('--bare'), false)
assert.equal(adapterInvocation.args[adapterInvocation.args.indexOf('--tools') + 1], '')
assert.equal(adapterInvocation.stdin.includes('not-carried-into-the-plan'), false)
const normalizedAdapterResponse = normalizeExternalEntitlementReviewResponse({
  profile: adapterProfile,
  invocationPlan: adapterInvocation,
  processResult: {
    status: 0,
    signal: null,
    stderr: '',
    stdout: JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: 'claude-provider-run-1',
      modelUsage: {
        'claude-opus-4-8': { inputTokens: 10, outputTokens: 5 },
      },
      structured_output: { verdict: 'verified' },
    }),
  },
  forbiddenArguments: invocationRegistry.forbiddenArguments,
})
assert.deepEqual(normalizedAdapterResponse, {
  status: 'completed',
  providerRunId: 'claude-provider-run-1',
  observedModelId: 'claude-opus-4-8',
  outputs: [{
    kind: 'structured-review-result',
    canonicalJson: '{"verdict":"verified"}',
  }],
})
assert.throws(() => normalizeExternalEntitlementReviewResponse({
  profile: adapterProfile,
  invocationPlan: adapterInvocation,
  processResult: {
    status: 0,
    signal: null,
    stderr: '',
    stdout: 'x'.repeat(adapterInvocation.outputBudget.plannedOutputBytes + 1),
  },
  forbiddenArguments: invocationRegistry.forbiddenArguments,
}), /raw provider response exceeds its certified output\/payload budget/)
assert.throws(() => buildExternalEntitlementReviewInvocation({
  invocationProfileId: 'claude-max-code',
  profile: adapterProfile,
  selectionReceipt: promotedSelection.selectionReceipt,
  portableRequest: { request: adapterRequest },
  resultSchema: { type: 'object' },
  authReadback: {
    loggedIn: true,
    authMethod: 'api-key',
    subscriptionType: 'max',
  },
  runtimeTarget: maxTarget,
  repoRoot: process.cwd(),
  forbiddenArguments: invocationRegistry.forbiddenArguments,
}), /auth-method readback does not match/)
assert.throws(() => normalizeExternalEntitlementReviewResponse({
  profile: adapterProfile,
  invocationPlan: adapterInvocation,
  processResult: {
    status: 0,
    signal: null,
    stderr: '',
    stdout: JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: 'claude-provider-run-1',
      modelUsage: {
        'claude-opus-4-8': {},
        'claude-sonnet-5': {},
      },
      structured_output: { verdict: 'verified' },
    }),
  },
  forbiddenArguments: invocationRegistry.forbiddenArguments,
}), /response model does not exactly match/)
assert.throws(() => executeExternalEntitlementReviewInvocation({
  profile: adapterProfile,
  invocationPlan: adapterInvocation,
  environment: {
    PATH: '/usr/bin:/bin',
    HOME: '/Users/reviewer',
    USER: 'reviewer',
    LOGNAME: 'reviewer',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
  },
  workingDirectory: process.cwd(),
  repositoryRoot: process.cwd(),
  forbiddenArguments: invocationRegistry.forbiddenArguments,
}), /private empty repository-unmounted boundary/)

const runtimeBinding = preparedCapability.evidence.runtimeBinding
const executionEvidence = [0, 1].map((requestOrdinal) => {
  const executionBinding = {
    schemaVersion: 1,
    kind: 'provider-neutral-external-entitlement-execution-binding',
    runtimeExecutableAuthorityDigest:
      runtimeBinding.runtimeExecutableAuthorityDigest,
    runtimeExecutableBindingDigest: digest('fixture-runtime-binding'),
    certifiedRuntimeTargetDigest: runtimeBinding.targetDigest,
    authReadbackDigest: digest('fixture-auth-readback'),
    versionReadbackDigest: digest('fixture-version-readback'),
    isolationPathClass: 'no-space',
    repositoryMounted: false,
  }
  return {
    requestOrdinal,
    requestDigest: digest(`genuine-request-${requestOrdinal}`),
    carrierDigest: digest(`genuine-carrier-${requestOrdinal}`),
    providerRunId: `claude-provider-run-${requestOrdinal}`,
    responseSha256: digest(`genuine-response-${requestOrdinal}`),
    observedProviderId: 'claude',
    observedReviewProfileId: 'claude-max-code-opus-4-8',
    observedInvocationProfileId: 'claude-max-code',
    observedModelReleaseId: 'claude/claude-opus-4-8',
    observedResponseModelId: 'claude-opus-4-8',
    runtimeCertificationId: runtimeBinding.certificationId,
    runtimeCertificationDigest: runtimeBinding.certificationDigest,
    runtimeTargetDigest: runtimeBinding.targetDigest,
    runtimeExecutableAuthorityDigest:
      executionBinding.runtimeExecutableAuthorityDigest,
    runtimeExecutableBindingDigest:
      executionBinding.runtimeExecutableBindingDigest,
    executionBindingDigest: digest(executionBinding),
    authReadbackDigest: executionBinding.authReadbackDigest,
    versionReadbackDigest: executionBinding.versionReadbackDigest,
    isolationPathClass: executionBinding.isolationPathClass,
    repositoryMounted: executionBinding.repositoryMounted,
  }
})
const responseRows = executionEvidence.map((row) => ({
  requestDigest: row.requestDigest,
  carrierDigest: row.carrierDigest,
  providerRunId: row.providerRunId,
  responseSha256: row.responseSha256,
}))
const capabilityBudgetProjection = {
  schemaVersion: 1,
  evidenceKind: 'deep-audit-review-exchange-capability-budget',
  capabilityCertificationId: promotedSelection.selectionReceipt.selected
    .capabilityCertificationId,
  selectedCapabilityCertificationDigest:
    promotedSelection.selectionReceipt.selectedCapabilityCertificationDigest,
  ...maxExchangeBudget,
}
const capabilityBudget = {
  ...capabilityBudgetProjection,
  capabilityBudgetDigest: digest(capabilityBudgetProjection),
}
const exchangeSchedule = {
  protocol: 'content-addressed-model-broker-exchange-v1',
  exchangeScheduleDigest: digest('genuine-exchange-schedule'),
  requestCount: executionEvidence.length,
  requests: executionEvidence.map((row) => ({
    requestOrdinal: row.requestOrdinal,
    requestDigest: row.requestDigest,
  })),
  reviewIdentity: {
    selectionDigest: promotedSelection.selectionReceipt.selectionDigest,
  },
  capabilityBudget,
  capabilityBudgetDigest: capabilityBudget.capabilityBudgetDigest,
  fullRegisteredReview: true,
  sampling: false,
  structuralOnly: true,
  genuineCrossProviderReview: false,
}
const taskRootVerdicts = [{
  taskKey: 'judgment:1',
  synthesisUnitId: digest('task-root'),
  verdict: 'verified',
  findingCount: 0,
  findingClosureDigest: digest([]),
  resultSha256: digest('task-root-result'),
}]
const structuralProjection = {
  schemaVersion: 1,
  evidenceKind: 'deep-audit-model-broker-review-graph-exchange-completion',
  protocol: exchangeSchedule.protocol,
  exchangeScheduleDigest: exchangeSchedule.exchangeScheduleDigest,
  requestCount: executionEvidence.length,
  responseDigestSetDigest: digest(responseRows),
  taskRootVerdicts,
  taskRootVerdictSetDigest: digest(taskRootVerdicts),
  aggregateVerdict: 'verified',
  fullNoSampleClosure: true,
  structuralOnly: true,
  genuineCrossProviderReview: false,
  promotionEligible: false,
  managedEvidence: false,
}
const structuralCompletion = {
  ...structuralProjection,
  completionDigest: digest(structuralProjection),
}
const genuineReceiptArgs = {
  structuralCompletion,
  exchangeSchedule,
  executionEvidence,
  selectionReceipt: promotedSelection.selectionReceipt,
  registry,
  capabilityRegistry,
  capabilityCertificationLedger: promotedLedger,
  invocationRegistry,
  modelReleaseRegistry,
  entitlementAvailability: maxAvailability,
  capabilityEvidenceBytes: preparedCapability.evidenceBytes,
  runtimeCertificationLedger: entitlementCertificationFixture(maxRuntimeEvidence),
  runtimeTarget: maxTarget,
  expectedGitTree: maxGitTree,
  now,
}
const genuineReceipt = buildGenuineCrossProviderReviewReceipt(genuineReceiptArgs)
assert.equal(genuineReceipt.genuineCrossProviderReview, true)
assert.equal(genuineReceipt.promotionEligible, true)
assert.equal(genuineReceipt.managedEvidence, false)
assert.equal(validateGenuineCrossProviderReviewReceipt(genuineReceipt), true)
expectCode('REVIEW_GENUINE_TRANSITION_BLOCKED', () =>
  buildGenuineCrossProviderReviewReceipt({
    ...genuineReceiptArgs,
    executionEvidence: executionEvidence.slice(0, 1),
  }))
expectCode('REVIEW_GENUINE_TRANSITION_BLOCKED', () =>
  buildGenuineCrossProviderReviewReceipt({
    ...genuineReceiptArgs,
    executionEvidence: executionEvidence.map((row, index) => (
      index === 1 ? { ...row, providerRunId: executionEvidence[0].providerRunId } : row
    )),
  }))
expectCode('REVIEW_GENUINE_TRANSITION_BLOCKED', () =>
  buildGenuineCrossProviderReviewReceipt({
    ...genuineReceiptArgs,
    capabilityEvidenceBytes: Buffer.concat([
      preparedCapability.evidenceBytes,
      Buffer.from(' '),
    ]),
  }))
expectCode('REVIEW_TARGET_UNCERTIFIED', () =>
  buildGenuineCrossProviderReviewReceipt({
    ...genuineReceiptArgs,
    runtimeTarget: {
      ...maxTarget,
      id: 'macos-darwin-arm64-native-space',
      pathClass: 'contains-space',
    },
  }))
const forgedGenuineReceipt = { ...genuineReceipt, managedEvidence: true }
expectCode('REVIEW_GENUINE_RECEIPT_INVALID', () =>
  validateGenuineCrossProviderReviewReceipt(forgedGenuineReceipt))
expectCode('REVIEW_GENUINE_TRANSITION_BLOCKED', () =>
  buildGenuineCrossProviderReviewReceipt({
    ...genuineReceiptArgs,
    executionEvidence: executionEvidence.map((row, index) => (
      index === 0
        ? { ...row, authReadbackDigest: digest('substituted-auth-readback') }
        : row
    )),
  }))

for (const aggregateVerdict of ['findings', 'unverifiable']) {
  const verdictRoots = [{
    ...taskRootVerdicts[0],
    verdict: aggregateVerdict,
    findingCount: aggregateVerdict === 'findings' ? 1 : 0,
    findingClosureDigest: digest([aggregateVerdict]),
    resultSha256: digest(`task-root-result-${aggregateVerdict}`),
  }]
  const verdictProjection = {
    ...structuralProjection,
    taskRootVerdicts: verdictRoots,
    taskRootVerdictSetDigest: digest(verdictRoots),
    aggregateVerdict,
  }
  const verdictCompletion = {
    ...verdictProjection,
    completionDigest: digest(verdictProjection),
  }
  const verdictReceipt = buildGenuineCrossProviderReviewReceipt({
    ...genuineReceiptArgs,
    structuralCompletion: verdictCompletion,
  })
  assert.equal(verdictReceipt.genuineCrossProviderReview, true)
  assert.equal(verdictReceipt.aggregateVerdict, aggregateVerdict)
  assert.equal(verdictReceipt.promotionEligible, false)
  assert.equal(validateGenuineCrossProviderReviewReceipt(verdictReceipt), true)
}

// The archive/handoff lanes retired 2026-08-04 with the model-broker execution
// layer (baton §8.3); the selection/binding/entitlement contract coverage above
// is the surviving surface.
process.stdout.write('review capability selection: ok\n')

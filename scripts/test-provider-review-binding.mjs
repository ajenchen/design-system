#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  EXACT_REVIEW_CERTIFICATION_CONTRACT,
  PORTABLE_REVIEW_EXCHANGE_CORE,
  certificationAggregateStatus,
  projectProviderReviewBindings,
  resolveHighestCertifiedReviewCapability,
  resolveProviderReviewBinding,
  resolveProjectedReviewRequest,
  verifyExactProviderCertification,
  verifyReviewCapabilitySelection,
} from '../packages/governance/src/provider-review-binding.mjs'
import {
  independentReviewArtifactsDigest,
  independentReviewBriefDigest,
  independentReviewInventoryDigest,
  independentReviewOutputDigest,
  independentReviewRubricDigest,
  launchIndependentReview,
  validateIndependentReviewTransportResult,
} from '../packages/design-system/ds-canonical/templates/product-launchers/independent-review.mjs'
import { hookEligibilityForProvider, resolveProviderPeerContext } from './gen-codex-adapter.mjs'

const cli = {
  executable: 'peer-cli',
  localExecutable: true,
  replyArtifactPrefix: 'peer-reply',
  briefInvocationMarkers: ['--brief'],
  discoveryMarkers: ['--version'],
}
const policy = {
  schemaVersion: 1,
  assuranceTierOrder: ['standard', 'high', 'maximum'],
  reasoningTierOrder: ['standard', 'high', 'maximum'],
  computeTierOrder: ['standard', 'high', 'maximum'],
  reviewClasses: {
    'tier-0-governance': {
      assuranceTier: 'maximum',
      reasoningTier: 'maximum',
      computeTier: 'maximum',
    },
  },
  eligibility: {
    independentProvider: true,
    independentContext: true,
    immutableTarget: true,
    identicalEvidence: true,
    completeEvidenceVisibility: true,
    certifiedCapability: true,
    policyAllowed: true,
    noSelfReview: true,
    failClosed: true,
  },
  ranking: [
    'assurance-tier-desc',
    'reasoning-tier-desc',
    'compute-tier-desc',
    'available-required-entitlement-route-first',
    'provider-local-capability-rank-desc',
    'provider-id-utf8-asc',
    'review-profile-id-utf8-asc',
    'model-release-id-utf8-asc',
  ],
  costPolicy: 'batch-or-stop-never-capability-downgrade',
  bindingPolicy: 'freeze-exact-provider-profile-model-and-registry-digests-after-selection',
  unavailableOutcome: 'REVIEW-BLOCKED',
}
const binding = (self, certificationContract = undefined) => ({
  self,
  selectionPolicy: 'highest-certified-independent-review-v1',
  reviewClass: 'tier-0-governance',
  transport: certificationContract ? PORTABLE_REVIEW_EXCHANGE_CORE : 'external-or-orchestrator',
  invocation: { strategy: 'main-context' },
  ...(certificationContract ? { certificationContract } : {}),
})
const registry = {
  canonical: {
    reviewSelectionPolicies: {
      'highest-certified-independent-review-v1': policy,
    },
  },
  providers: [
    {
      id: 'alpha',
      providerKind: 'concrete-runtime',
      adapter: {
        generate: true,
        skillBindings: {
          'canonical-reviewer': binding('alpha'),
          'codex-collab': binding('alpha'),
          'deep-audit-cross-codex': binding('alpha', EXACT_REVIEW_CERTIFICATION_CONTRACT),
          'independent-review': binding('alpha', EXACT_REVIEW_CERTIFICATION_CONTRACT),
        },
      },
      runtime: { cli },
    },
    { id: 'beta', providerKind: 'concrete-runtime', adapter: { generate: false, skillBindings: {} }, runtime: { cli } },
    { id: 'gamma', providerKind: 'concrete-runtime', adapter: { generate: false, skillBindings: {} }, runtime: { cli } },
  ],
}

assert.equal(resolveProviderReviewBinding({ registry, skill: 'canonical-reviewer', selfProviderId: 'alpha' }).peer, null)
assert.equal(resolveProviderReviewBinding({ registry, skill: 'codex-collab', selfProviderId: 'alpha' }).selectionReasonCode, 'REVIEW_CAPABILITY_SELECTION_REQUIRED')
const unicodeBindingRegistry = {
  canonical: structuredClone(registry.canonical),
  providers: [
    {
      id: 'alpha',
      providerKind: 'concrete-runtime',
      adapter: {
        skillBindings: {
          'canonical-reviewer': {
            self: 'alpha',
            selectionPolicy: 'highest-certified-independent-review-v1',
            reviewClass: 'tier-0-governance',
            transport: 'fixture',
            invocation: { strategy: 'main-context' },
            '\u{10000}': 'astral',
            '\uE000': 'bmp',
          },
        },
      },
    },
    { id: 'beta', providerKind: 'concrete-runtime', adapter: { skillBindings: {} } },
  ],
}
const unicodeBindingDigest = resolveProviderReviewBinding({
  registry: unicodeBindingRegistry,
  skill: 'canonical-reviewer',
  selfProviderId: 'alpha',
}).bindingDigest
const expectedUnicodeBindingDigest = createHash('sha256').update(JSON.stringify({
  binding: {
    invocation: { strategy: 'main-context' },
    reviewClass: 'tier-0-governance',
    selectionPolicy: 'highest-certified-independent-review-v1',
    self: 'alpha',
    transport: 'fixture',
    '\uE000': 'bmp',
    '\u{10000}': 'astral',
  },
  reviewClass: 'tier-0-governance',
  selectionPolicy: 'highest-certified-independent-review-v1',
  self: 'alpha',
  skill: 'canonical-reviewer',
})).digest('hex')
assert.equal(
  unicodeBindingDigest,
  expectedUnicodeBindingDigest,
  'review-binding digest must order BMP U+E000 before astral U+10000 by UTF-8 bytes',
)
assert.equal(resolveProviderReviewBinding({
  registry,
  skill: 'deep-audit-cross-codex',
  selfProviderId: 'alpha',
  requireCertificationContract: true,
}).selectionReasonCode, 'REVIEW_CAPABILITY_SELECTION_REQUIRED')
const untrustedCertifiedTransport = structuredClone(registry)
untrustedCertifiedTransport.providers[0].adapter.skillBindings['deep-audit-cross-codex'].transport = 'external-or-orchestrator'
assert.throws(
  () => resolveProviderReviewBinding({ registry: untrustedCertifiedTransport, skill: 'deep-audit-cross-codex', selfProviderId: 'alpha', requireCertificationContract: true }),
  (error) => error.code === 'REVIEW_EXCHANGE_CORE_UNATTESTED',
)
assert.throws(
  () => resolveProviderReviewBinding({ registry, skill: 'deep-audit-cross-codex', selfProviderId: 'alpha', authorProviderId: 'beta' }),
  (error) => error.code === 'REVIEW_AUTHOR_COLLISION',
)
const noCanonicalReviewer = structuredClone(registry)
delete noCanonicalReviewer.providers[0].adapter.skillBindings['canonical-reviewer']
assert.equal(resolveProviderPeerContext('alpha', 'deep-audit-cross-codex', noCanonicalReviewer).peer, null)
assert.equal(resolveProviderPeerContext('alpha', 'deep-audit-cross-codex', noCanonicalReviewer).reasonCode, 'REVIEW_CAPABILITY_SELECTION_REQUIRED')
const deferredHookEligibility = hookEligibilityForProvider('alpha', {
  reviewSkill: 'deep-audit-cross-codex',
  requires: ['peer-review-binding', 'peer-cli'],
  transcript: 'none',
}, noCanonicalReviewer)
assert.equal(deferredHookEligibility.eligible, true)
assert.equal(deferredHookEligibility.selectionStatus, 'deferred-to-review-prepare')
assert.equal(deferredHookEligibility.selectionPolicy, 'highest-certified-independent-review-v1')

const now = new Date('2026-07-22T00:00:00.000Z')
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort((left, right) => Buffer.from(left).compare(Buffer.from(right))).map((key) => [key, stable(value[key])]))
  }
  return value
}
const stableDigest = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
const capabilityRegistry = {
  schemaVersion: 1,
  kind: 'provider-neutral-review-capability-registry',
  selectionSemantics: 'exact-candidates-only-capability-values-require-separate-certification',
  providerCapabilityPrecedence: {
    beta: [{
      modelReleaseId: 'beta/beta-model-1',
      capabilityRank: 100,
      assuranceTier: 'maximum',
      reasoningTier: 'high',
      computeTier: 'maximum',
      exchangeBudget: {
        maxInputBytes: 16_777_216,
        maxOutputBytes: 1_048_576,
        maxPayloadBytes: 17_825_792,
      },
    }],
    gamma: [{
      modelReleaseId: 'gamma/gamma-model-1',
      capabilityRank: 100,
      assuranceTier: 'maximum',
      reasoningTier: 'maximum',
      computeTier: 'maximum',
      exchangeBudget: {
        maxInputBytes: 16_777_216,
        maxOutputBytes: 1_048_576,
        maxPayloadBytes: 17_825_792,
      },
    }],
  },
  reviewProfiles: [
    {
      id: 'beta-review',
      providerId: 'beta',
      routeClass: 'managed-api',
      invocationProfileId: 'beta',
      entitlementId: null,
      modelReleaseId: 'beta/beta-model-1',
      requestModelId: 'beta-model-1',
      modelIdentityPolicy: 'exact-model-release-response-match-no-mutable-alias',
    },
    {
      id: 'gamma-review',
      providerId: 'gamma',
      routeClass: 'managed-api',
      invocationProfileId: 'gamma',
      entitlementId: null,
      modelReleaseId: 'gamma/gamma-model-1',
      requestModelId: 'gamma-model-1',
      modelIdentityPolicy: 'exact-model-release-response-match-no-mutable-alias',
    },
  ],
}
const invocationRegistry = {
  profiles: {
    beta: {
      providerId: 'beta',
      mode: 'broker-content-only',
      modelIdentity: { allowedModelReleaseIds: ['beta/beta-model-1'] },
    },
    gamma: {
      providerId: 'gamma',
      mode: 'broker-content-only',
      modelIdentity: { allowedModelReleaseIds: ['gamma/gamma-model-1'] },
    },
  },
  externalEntitlementProfiles: {},
}
const modelReleaseRegistry = {
  records: [
    {
      id: 'beta/beta-model-1',
      providerId: 'beta',
      requestModelId: 'beta-model-1',
      responseModelPolicy: { kind: 'exact', expectedModelId: 'beta-model-1' },
    },
    {
      id: 'gamma/gamma-model-1',
      providerId: 'gamma',
      requestModelId: 'gamma-model-1',
      responseModelPolicy: { kind: 'exact', expectedModelId: 'gamma-model-1' },
    },
  ],
}
const capabilityCertificationLedger = {
  schemaVersion: 1,
  kind: 'review-capability-certification-ledger',
  certifications: [
    {
      id: 'beta-cert',
      reviewProfileId: 'beta-review',
      reviewProfileDigest: stableDigest(capabilityRegistry.reviewProfiles[0]),
      providerId: 'beta',
      modelReleaseId: 'beta/beta-model-1',
      entitlementId: null,
      status: 'certified',
      assuranceTier: 'maximum',
      reasoningTier: 'high',
      computeTier: 'maximum',
      certifiedAt: '2026-07-01T00:00:00.000Z',
      expiresAt: '2026-08-01T00:00:00.000Z',
      evidence: { reference: 'fixture/beta-capability.json', sha256: 'a'.repeat(64) },
    },
    {
      id: 'gamma-cert',
      reviewProfileId: 'gamma-review',
      reviewProfileDigest: stableDigest(capabilityRegistry.reviewProfiles[1]),
      providerId: 'gamma',
      modelReleaseId: 'gamma/gamma-model-1',
      entitlementId: null,
      status: 'certified',
      assuranceTier: 'maximum',
      reasoningTier: 'maximum',
      computeTier: 'maximum',
      certifiedAt: '2026-07-01T00:00:00.000Z',
      expiresAt: '2026-08-01T00:00:00.000Z',
      evidence: { reference: 'fixture/gamma-capability.json', sha256: 'b'.repeat(64) },
    },
  ],
}
const selectedCapability = resolveHighestCertifiedReviewCapability({
  registry,
  capabilityRegistry,
  capabilityCertificationLedger,
  invocationRegistry,
  modelReleaseRegistry,
  skill: 'independent-review',
  selfProviderId: 'alpha',
  now,
})
assert.equal(selectedCapability.peer.id, 'gamma')
assert.equal(selectedCapability.selectionReceipt.requiredAssuranceTier, 'maximum')
assert.equal(selectedCapability.selectionReceipt.requiredReasoningTier, 'maximum')
assert.equal(selectedCapability.selectionReceipt.requiredComputeTier, 'maximum')
assert.equal(selectedCapability.selectionReceipt.selected.reasoningTier, 'maximum')
assert.equal(verifyReviewCapabilitySelection({
  receipt: selectedCapability.selectionReceipt,
  registry,
  capabilityRegistry,
  capabilityCertificationLedger,
  invocationRegistry,
  modelReleaseRegistry,
  skill: 'independent-review',
  selfProviderId: 'alpha',
  authorProviderId: 'alpha',
  requiredEntitlementId: null,
  entitlementAvailability: [],
  observedProviderId: 'gamma',
  observedReviewProfileId: 'gamma-review',
  observedModelReleaseId: 'gamma/gamma-model-1',
  observedResponseModelId: 'gamma-model-1',
  now,
}), true)
const gitTree = '1'.repeat(40)
const target = {
  id: 'linux-x64-native',
  operatingSystem: 'linux',
  platform: 'linux',
  arch: 'x64',
  executionEnvironment: 'native',
  distributionVersion: '1.2.3',
  pathClass: 'no-space',
}
const evidence = {
  reference: `infra/governance/evidence/provider-runtime/${'3'.repeat(64)}.json`,
  artifactSha256: '3'.repeat(64),
  evidenceDigest: `sha256:${'4'.repeat(64)}`,
  providerId: 'gamma',
  runId: '12345678-1234-4123-8123-123456789abc',
  scope: 'provider',
  targetId: target.id,
  targetDigest: `sha256:${'5'.repeat(64)}`,
  operatingSystem: target.operatingSystem,
  platform: target.platform,
  arch: target.arch,
  executionEnvironment: target.executionEnvironment,
  distributionVersion: target.distributionVersion,
  pathClass: target.pathClass,
  distributionDigest: `sha256:${'6'.repeat(64)}`,
  gitCommit: '0'.repeat(40),
  gitTree,
  profileDigest: `sha256:${'7'.repeat(64)}`,
  harnessDigest: `sha256:${'8'.repeat(64)}`,
  hardGateContractDigest: `sha256:${'9'.repeat(64)}`,
}
const secondTarget = {
  ...target,
  id: 'linux-x64-space',
  pathClass: 'contains-space',
  status: 'not-certified',
  limitations: ['not exercised'],
}
const certification = {
  id: 'gamma-cli-local-product',
  provider: 'gamma-cli',
  runtimeKind: 'cli',
  providerVersion: '1.2.3',
  adapterVersion: '1.0.0',
  surface: 'local',
  repositoryRole: 'product-consumer',
  status: 'conditional',
  platformMatrix: [{
    ...target,
    status: 'certified',
    limitations: [],
    certifiedAt: '2026-07-01T00:00:00.000Z',
    expiresAt: '2026-08-01T00:00:00.000Z',
    runtimeEvidence: evidence,
  }, secondTarget],
  checks: [{ id: 'runtime', status: 'pass', evidence: { kind: 'artifact-digest', reference: evidence.reference, sha256: evidence.artifactSha256 } }],
  limitations: ['space target pending'],
}
const certificationLedger = { schemaVersion: 2, certifications: [certification] }
const compatibilityMatrix = {
  providers: {
    'alpha-cli': { adapterProviderId: 'alpha' },
    'beta-cli': { adapterProviderId: 'beta' },
    'gamma-cli': { adapterProviderId: 'gamma' },
  },
}
const certificationSchema = JSON.parse(readFileSync(new URL('../infra/governance/schemas/provider-surface-certification.schema.json', import.meta.url), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validateCertificationSchema = ajv.compile(certificationSchema)
assert.equal(validateCertificationSchema(certificationLedger), true, JSON.stringify(validateCertificationSchema.errors))

assert.equal(certificationAggregateStatus(certification, { now }), 'conditional')
const exact = verifyExactProviderCertification({
  certificationLedger,
  compatibilityProviderId: 'gamma-cli',
  runtimeProviderId: 'gamma',
  runtimeKind: 'cli',
  surface: 'local',
  repositoryRole: 'product-consumer',
  target,
  expectedGitTree: gitTree,
  now,
})
assert.equal(exact.target.id, target.id)
assert.equal(exact.evidence, certification.platformMatrix[0].runtimeEvidence)
const expectCode = (code, operation) => assert.throws(operation, (error) => error.code === code)

const cloudTarget = {
  id: 'linux-linux-x64-cloud-hosted-space',
  operatingSystem: 'linux',
  platform: 'linux',
  arch: 'x64',
  executionEnvironment: 'cloud-hosted',
  distributionVersion: '1.2.3',
  pathClass: 'contains-space',
}
const externalEvidence = {
  evidenceKind: 'external-runtime-surface-conformance',
  reference: `infra/governance/evidence/external-runtime/${'a'.repeat(64)}.json`,
  artifactSha256: 'a'.repeat(64),
  evidenceDigest: `sha256:${'b'.repeat(64)}`,
  profileId: 'gamma-cloud',
  runId: '22345678-1234-4123-8123-123456789abc',
  targetId: cloudTarget.id,
  targetDigest: `sha256:${'c'.repeat(64)}`,
  repositoryId: 'fixture-product',
  repository: 'fixture/product',
  repositoryRole: 'product-consumer',
  repositoryReadbackSha256: 'd'.repeat(64),
  operatingSystem: cloudTarget.operatingSystem,
  platform: cloudTarget.platform,
  arch: cloudTarget.arch,
  executionEnvironment: cloudTarget.executionEnvironment,
  distributionVersion: cloudTarget.distributionVersion,
  pathClass: cloudTarget.pathClass,
  distributionDigest: `sha256:${'e'.repeat(64)}`,
  gitCommit: '0'.repeat(40),
  gitTree,
  profileDigest: `sha256:${'f'.repeat(64)}`,
  harnessDigest: `sha256:${'1'.repeat(64)}`,
  hardGateContractDigest: `sha256:${'2'.repeat(64)}`,
}
const cloudCertification = {
  ...structuredClone(certification),
  id: 'gamma-cloud-product',
  runtimeKind: 'gamma-cloud',
  surface: 'cloud',
  status: 'certified',
  platformMatrix: [{
    ...cloudTarget,
    status: 'certified',
    limitations: [],
    certifiedAt: '2026-07-01T00:00:00.000Z',
    expiresAt: '2026-08-01T00:00:00.000Z',
    runtimeEvidence: externalEvidence,
  }],
  checks: [{ id: 'runtime', status: 'pass', evidence: { kind: 'artifact-digest', reference: externalEvidence.reference, sha256: externalEvidence.artifactSha256 } }],
  limitations: [],
}
assert.equal(validateCertificationSchema({ schemaVersion: 2, certifications: [cloudCertification] }), true, JSON.stringify(validateCertificationSchema.errors))
const externalExact = verifyExactProviderCertification({
  certificationLedger: [cloudCertification],
  compatibilityProviderId: 'gamma-cli',
  runtimeProviderId: 'gamma',
  runtimeProfileId: 'gamma-cloud',
  runtimeKind: 'gamma-cloud',
  surface: 'cloud',
  repositoryRole: 'product-consumer',
  target: cloudTarget,
  expectedGitTree: gitTree,
  now,
})
assert.equal(externalExact.evidence.profileId, 'gamma-cloud')
expectCode('REVIEW_CERTIFICATION_EVIDENCE_PROVIDER_MISMATCH', () => verifyExactProviderCertification({
  certificationLedger: [cloudCertification], compatibilityProviderId: 'gamma-cli', runtimeProviderId: 'gamma', runtimeProfileId: 'gamma-other-cloud',
  runtimeKind: 'gamma-cloud', surface: 'cloud', repositoryRole: 'product-consumer', target: cloudTarget, now,
}))

expectCode('REVIEW_TARGET_AXES_MISMATCH', () => verifyExactProviderCertification({
  certificationLedger, compatibilityProviderId: 'gamma-cli', runtimeProviderId: 'gamma', runtimeKind: 'cli', surface: 'local', repositoryRole: 'product-consumer',
  target: { ...target, arch: 'arm64' }, now,
}))
expectCode('REVIEW_TARGET_UNCERTIFIED', () => verifyExactProviderCertification({
  certificationLedger, compatibilityProviderId: 'gamma-cli', runtimeProviderId: 'gamma', runtimeKind: 'cli', surface: 'local', repositoryRole: 'product-consumer',
  target: { ...target, id: 'missing-target' }, now,
}))
expectCode('REVIEW_CERTIFICATION_MISSING', () => verifyExactProviderCertification({
  certificationLedger, compatibilityProviderId: 'gamma-cli', runtimeProviderId: 'gamma', runtimeKind: 'cli', surface: 'cloud', repositoryRole: 'product-consumer', target, now,
}))
expectCode('REVIEW_CERTIFICATION_STALE', () => verifyExactProviderCertification({
  certificationLedger, compatibilityProviderId: 'gamma-cli', runtimeProviderId: 'gamma', runtimeKind: 'cli', surface: 'local', repositoryRole: 'product-consumer',
  target, expectedGitTree: '9'.repeat(40), now,
}))
expectCode('REVIEW_CERTIFICATION_EVIDENCE_PROVIDER_MISMATCH', () => verifyExactProviderCertification({
  certificationLedger, compatibilityProviderId: 'gamma-cli', runtimeProviderId: 'beta', runtimeKind: 'cli', surface: 'local', repositoryRole: 'product-consumer',
  target, now,
}))

const expired = structuredClone(certification)
expired.status = 'expired'
expired.platformMatrix = [structuredClone(expired.platformMatrix[0])]
expired.platformMatrix[0].expiresAt = '2026-07-20T00:00:00.000Z'
expectCode('REVIEW_CERTIFICATION_EXPIRED', () => verifyExactProviderCertification({
  certificationLedger: [expired], compatibilityProviderId: 'gamma-cli', runtimeProviderId: 'gamma', runtimeKind: 'cli', surface: 'local',
  repositoryRole: 'product-consumer', target, now,
}))
const notCertified = structuredClone(certification)
notCertified.status = 'not-certified'
notCertified.platformMatrix = [{ ...secondTarget, id: target.id, pathClass: target.pathClass }]
expectCode('REVIEW_NOT_CERTIFIED', () => verifyExactProviderCertification({
  certificationLedger: [notCertified], compatibilityProviderId: 'gamma-cli', runtimeProviderId: 'gamma', runtimeKind: 'cli', surface: 'local',
  repositoryRole: 'product-consumer', target, now,
}))

const projection = projectProviderReviewBindings({ registry, compatibilityMatrix, certificationLedger })
assert.equal(resolveProjectedReviewRequest({
  projection,
  selectionReceipt: selectedCapability.selectionReceipt,
  registry,
  capabilityRegistry,
  capabilityCertificationLedger,
  invocationRegistry,
  modelReleaseRegistry,
  selfProviderId: 'alpha',
  runtimeKind: 'cli',
  surface: 'local',
  repositoryRole: 'product-consumer',
  target,
  now,
}).peerProviderId, 'gamma')
const tamperedProjection = structuredClone(projection)
tamperedProjection.bindings[0].selectionPolicy = 'substituted-policy-v1'
expectCode('REVIEW_PROJECTION_TAMPERED', () => resolveProjectedReviewRequest({
  projection: tamperedProjection,
  selectionReceipt: selectedCapability.selectionReceipt,
  registry,
  capabilityRegistry,
  capabilityCertificationLedger,
  invocationRegistry,
  modelReleaseRegistry,
  selfProviderId: 'alpha', runtimeKind: 'cli', surface: 'local',
  repositoryRole: 'product-consumer', target, now,
}))
const selectedResolver = (options) => resolveProjectedReviewRequest({
  ...options,
  selectionReceipt: selectedCapability.selectionReceipt,
  registry,
  capabilityRegistry,
  capabilityCertificationLedger,
  invocationRegistry,
  modelReleaseRegistry,
})

const inventory = [
  { path: 'apps/product/src/a.ts', sha256: 'a'.repeat(64) },
  { path: 'apps/product/src/b.ts', sha256: 'b'.repeat(64) },
]
const rubric = [
  { id: 'accessibility', reference: 'governance/rubric/accessibility.md', sha256: 'c'.repeat(64) },
  { id: 'ssot', reference: 'governance/rubric/ssot.md', sha256: 'd'.repeat(64) },
]
const brief = {
  userWording: 'Review the frozen product change independently.',
  questions: ['Does the change preserve the declared product contract?'],
  constraints: ['Read only.', 'Do not use the author conclusions.'],
}
const verificationArtifacts = [
  { id: 'governance-check', reference: 'governance-runtime/evidence/governance-check.json', sha256: 'e'.repeat(64) },
]
const packet = {
  schemaVersion: 1,
  kind: 'neutral-independent-review-packet',
  repository: 'example/product',
  head: 'a'.repeat(40),
  tree: gitTree,
  diffDigest: 'f'.repeat(64),
  inventory,
  inventoryDigest: independentReviewInventoryDigest(inventory),
  rubric,
  rubricDigest: independentReviewRubricDigest(rubric),
  brief,
  briefDigest: independentReviewBriefDigest(brief),
  verificationArtifacts,
  artifactsDigest: independentReviewArtifactsDigest(verificationArtifacts),
  worktreeFingerprintBefore: '9'.repeat(64),
  authorConclusionsExcluded: true,
  scopeCoverageRequired: 'complete',
  mutationPolicy: 'read-only',
}
const reviewRequest = (mode, overrides = {}) => ({
  schemaVersion: 1,
  kind: 'provider-neutral-independent-review-request',
  mode,
  currentProviderId: 'alpha',
  authorProviderId: 'alpha',
  runtimeKind: 'cli',
  surface: 'local',
  repositoryRole: 'product-consumer',
  target,
  packet,
  ...overrides,
})
const validTransportResult = (envelope, overrides = {}) => {
  const output = 'PASS\nThe complete declared scope was reviewed independently.'
  return {
    schemaVersion: 1,
    kind: 'provider-neutral-independent-review-result',
    outcome: 'PASS',
    blockReasonCode: null,
    evidenceClass: 'certified-independent-review',
    peerProviderId: envelope.binding.peerProviderId,
    reviewProfileId: envelope.binding.reviewProfileId,
    modelReleaseId: envelope.binding.modelReleaseId,
    responseModelId: envelope.binding.requestModelId,
    selectionDigest: envelope.binding.selectionDigest,
    contextId: 'independent-context-123',
    transport: envelope.binding.transport,
    bindingDigest: envelope.binding.bindingDigest,
    certificationContract: envelope.binding.certificationContract,
    certificationId: envelope.binding.certificationId,
    certificationTargetId: envelope.binding.certificationTargetId,
    certificationRecordDigest: envelope.binding.certificationRecordDigest,
    requestDigest: envelope.requestDigest,
    repository: envelope.request.packet.repository,
    head: envelope.request.packet.head,
    tree: envelope.request.packet.tree,
    diffDigest: envelope.request.packet.diffDigest,
    inventoryDigest: envelope.request.packet.inventoryDigest,
    rubricDigest: envelope.request.packet.rubricDigest,
    briefDigest: envelope.request.packet.briefDigest,
    artifactsDigest: envelope.request.packet.artifactsDigest,
    coveredPaths: envelope.request.packet.inventory.map((entry) => entry.path),
    coveredRubricIds: envelope.request.packet.rubric.map((entry) => entry.id),
    coveredArtifactIds: envelope.request.packet.verificationArtifacts.map((entry) => entry.id),
    output,
    outputDigest: independentReviewOutputDigest(output),
    worktreeFingerprintBefore: envelope.request.packet.worktreeFingerprintBefore,
    worktreeFingerprintAfter: envelope.request.packet.worktreeFingerprintBefore,
    scopeCoverage: 'complete',
    mutationDetected: false,
    roleBoundaryConfirmed: true,
    ...overrides,
  }
}
const blockedProjection = projectProviderReviewBindings({
  registry,
  compatibilityMatrix,
  certificationLedger: { schemaVersion: 2, certifications: [notCertified] },
})
const blocked = await launchIndependentReview({
  projection: blockedProjection,
  request: reviewRequest('dispatch'),
  resolver: selectedResolver,
  mode: 'dispatch',
  clock: () => now,
})
assert.equal(blocked.status, 'REVIEW-BLOCKED')
assert.equal(blocked.transportInvoked, false)
const wrongRole = await launchIndependentReview({
  projection,
  request: reviewRequest('dispatch', { repositoryRole: 'authority' }),
  resolver: selectedResolver,
  mode: 'dispatch',
  clock: () => now,
})
assert.equal(wrongRole.reasonCode, 'REVIEW_ROLE_BLOCKED')

const planned = await launchIndependentReview({
  projection,
  request: reviewRequest('plan-only'),
  resolver: selectedResolver,
  mode: 'plan-only',
  clock: () => now,
})
assert.equal(planned.status, 'PLAN-ONLY')
assert.equal(planned.mode, 'plan-only')
assert.equal(planned.transportInvoked, false)
assert.equal(planned.binding.peerProviderId, 'gamma')
assert.equal(planned.packet.inventoryDigest, packet.inventoryDigest)

const planWithDispatcher = await launchIndependentReview({
  projection,
  request: reviewRequest('plan-only'),
  resolver: selectedResolver,
  mode: 'plan-only',
  clock: () => now,
  dispatch: async () => {},
})
assert.equal(planWithDispatcher.reasonCode, 'REVIEW_PLAN_DISPATCHER_FORBIDDEN')
assert.equal(planWithDispatcher.transportInvoked, false)

const mismatchedMode = await launchIndependentReview({
  projection,
  request: reviewRequest('plan-only'),
  resolver: selectedResolver,
  mode: 'dispatch',
  clock: () => now,
})
assert.equal(mismatchedMode.reasonCode, 'REVIEW_MODE_MISMATCH')
assert.equal(mismatchedMode.transportInvoked, false)

const forgedClock = await launchIndependentReview({
  projection,
  request: { ...reviewRequest('dispatch'), now: '2026-07-01T00:00:00.000Z' },
  resolver: selectedResolver,
  mode: 'dispatch',
  clock: () => new Date('2026-09-01T00:00:00.000Z'),
})
assert.equal(forgedClock.reasonCode, 'REVIEW_REQUEST_INVALID')
assert.equal(forgedClock.transportInvoked, false)

const expiredTrustedClock = await launchIndependentReview({
  projection,
  request: reviewRequest('dispatch'),
  resolver: selectedResolver,
  mode: 'dispatch',
  clock: () => new Date('2026-09-01T00:00:00.000Z'),
})
assert.equal(expiredTrustedClock.reasonCode, 'REVIEW_CAPABILITY_UNAVAILABLE')
assert.equal(expiredTrustedClock.transportInvoked, false)

let transportInvocations = 0
const untrustedDispatcher = await launchIndependentReview({
  projection,
  request: reviewRequest('dispatch'),
  resolver: selectedResolver,
  mode: 'dispatch',
  clock: () => now,
  dispatch: async () => { transportInvocations += 1 },
})
assert.equal(untrustedDispatcher.reasonCode, 'REVIEW_UNTRUSTED_DISPATCHER_FORBIDDEN')
assert.equal(untrustedDispatcher.transportInvoked, false)
assert.equal(transportInvocations, 0)

const managedDispatch = await launchIndependentReview({
  projection,
  request: reviewRequest('dispatch'),
  resolver: selectedResolver,
  mode: 'dispatch',
  clock: () => now,
})
assert.equal(managedDispatch.reasonCode, 'REVIEW_PORTABLE_EXCHANGE_CARRIER_REQUIRED')
assert.equal(managedDispatch.transportInvoked, false)
const transportEnvelope = {
  binding: planned.binding,
  request: reviewRequest('dispatch'),
  requestDigest: managedDispatch.requestDigest,
}
const structurallyValid = validateIndependentReviewTransportResult(validTransportResult(transportEnvelope), transportEnvelope)
assert.equal(structurallyValid.peerProviderId, 'gamma')
assert.equal(structurallyValid.scopeCoverage, 'complete')

expectCode('REVIEW_RESULT_INVALID', () => validateIndependentReviewTransportResult({ outcome: 'PASS' }, transportEnvelope))
expectCode('REVIEW_RESULT_INCOMPLETE', () => validateIndependentReviewTransportResult(
  validTransportResult(transportEnvelope, { coveredPaths: [inventory[0].path] }),
  transportEnvelope,
))

expectCode('REVIEW_RESULT_MUTATION', () => validateIndependentReviewTransportResult(
  validTransportResult(transportEnvelope, {
    mutationDetected: true,
    worktreeFingerprintAfter: '8'.repeat(64),
  }),
  transportEnvelope,
))

expectCode('REVIEW_RESULT_BINDING_MISMATCH', () => validateIndependentReviewTransportResult(
  validTransportResult(transportEnvelope, { peerProviderId: 'beta' }),
  transportEnvelope,
))

const blockedPeer = validateIndependentReviewTransportResult(validTransportResult(transportEnvelope, {
    outcome: 'REVIEW-BLOCKED',
    blockReasonCode: 'PEER_EVIDENCE_UNAVAILABLE',
    coveredPaths: [],
    coveredRubricIds: [],
    coveredArtifactIds: [],
    scopeCoverage: 'incomplete',
    output: 'REVIEW-BLOCKED\nRequired peer evidence was unavailable.',
    outputDigest: independentReviewOutputDigest('REVIEW-BLOCKED\nRequired peer evidence was unavailable.'),
  }), transportEnvelope)
assert.equal(blockedPeer.outcome, 'REVIEW-BLOCKED')

const existingLedger = JSON.parse(readFileSync(new URL('../infra/governance/providers/certifications.json', import.meta.url), 'utf8'))
assert.ok(existingLedger.certifications.length > 0)
assert.ok(existingLedger.certifications.every((record) => record.status === 'not-certified'))

process.stdout.write('provider review binding: ok\n')

import { createHash } from 'node:crypto'
import { compareUtf8Bytes } from './canonical-order.mjs'

export const EXACT_REVIEW_CERTIFICATION_CONTRACT = 'exact-provider-runtime-surface-role-target-v1'
export const MANAGED_REVIEW_TRANSPORT = 'managed-model-broker-v1'
export const PORTABLE_REVIEW_EXCHANGE_CORE = 'content-addressed-model-broker-exchange-v1'
export const REVIEW_TARGET_AXES = Object.freeze([
  'operatingSystem',
  'platform',
  'arch',
  'executionEnvironment',
  'distributionVersion',
  'pathClass',
])

const PROVIDER_ID = /^[a-z][a-z0-9-]*$/
const TARGET_ID = /^[a-z0-9][a-z0-9-]*$/
const SHA256 = /^[a-f0-9]{64}$/
const REVIEW_PROFILE_ID = /^[a-z][a-z0-9-]*$/
const REVIEW_TIERS = Object.freeze(['standard', 'high', 'maximum'])
// Capability authority must not be transferable by reflecting over an object
// or replayable after its invocation-profile authority changes. Module-private
// metadata binds the exact minted object to the exact profile that authorized
// its runtime/surface/check/assertion evidence; serialized or stale records must
// be reverified.
const VERIFIED_ENTITLEMENT_AVAILABILITY = new WeakMap()

export class ProviderReviewBindingError extends Error {
  constructor(code, detail) {
    super(`${code}:${detail}`)
    this.name = 'ProviderReviewBindingError'
    this.code = code
  }
}

function block(code, detail) {
  throw new ProviderReviewBindingError(code, detail)
}

function object(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) block(code, `${label} is missing or invalid`)
  return value
}

function nonEmpty(value, code, label) {
  if (typeof value !== 'string' || !value.trim()) block(code, `${label} is missing or invalid`)
  return value
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(compareUtf8Bytes).map((key) => [key, stableValue(value[key])]))
  }
  return value
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function providerById(registry, providerId, label) {
  if (!PROVIDER_ID.test(providerId ?? '')) block('REVIEW_PROVIDER_INVALID', `${label} provider id is invalid:${providerId ?? '<missing>'}`)
  const matches = (registry.providers || []).filter((provider) => provider?.id === providerId)
  if (matches.length !== 1) block('REVIEW_PROVIDER_UNAVAILABLE', `${label} provider is not a registered concrete runtime:${providerId}`)
  if (matches[0].providerKind && matches[0].providerKind !== 'concrete-runtime') {
    block('REVIEW_PROVIDER_UNAVAILABLE', `${label} provider is not a concrete runtime:${providerId}`)
  }
  return matches[0]
}

function exactReviewPolicy(registry, policyId, reviewClass) {
  const policies = object(registry.canonical?.reviewSelectionPolicies, 'REVIEW_SELECTION_POLICY_UNAVAILABLE', 'review selection policies')
  const policy = object(policies[policyId], 'REVIEW_SELECTION_POLICY_UNAVAILABLE', `review selection policy ${policyId}`)
  if (policy.schemaVersion !== 1
    || JSON.stringify(policy.assuranceTierOrder) !== JSON.stringify(REVIEW_TIERS)
    || JSON.stringify(policy.reasoningTierOrder) !== JSON.stringify(REVIEW_TIERS)
    || JSON.stringify(policy.computeTierOrder) !== JSON.stringify(REVIEW_TIERS)
    || policy.costPolicy !== 'batch-or-stop-never-capability-downgrade'
    || policy.bindingPolicy !== 'freeze-exact-provider-profile-model-and-registry-digests-after-selection'
    || policy.unavailableOutcome !== 'REVIEW-BLOCKED') {
    block('REVIEW_SELECTION_POLICY_INVALID', policyId)
  }
  const expectedRanking = [
    'assurance-tier-desc',
    'reasoning-tier-desc',
    'compute-tier-desc',
    'available-required-entitlement-route-first',
    'provider-local-capability-rank-desc',
    'provider-id-utf8-asc',
    'review-profile-id-utf8-asc',
    'model-release-id-utf8-asc',
  ]
  if (JSON.stringify(policy.ranking) !== JSON.stringify(expectedRanking)) {
    block('REVIEW_SELECTION_POLICY_INVALID', `${policyId}:ranking`)
  }
  const eligibility = policy.eligibility
  if (!eligibility || Object.values(eligibility).some((value) => value !== true)) {
    block('REVIEW_SELECTION_POLICY_INVALID', `${policyId}:eligibility`)
  }
  const reviewClassPolicy = object(policy.reviewClasses?.[reviewClass], 'REVIEW_CLASS_UNAVAILABLE', `${policyId}/${reviewClass}`)
  if (!REVIEW_TIERS.includes(reviewClassPolicy.assuranceTier)
    || !REVIEW_TIERS.includes(reviewClassPolicy.reasoningTier)
    || !REVIEW_TIERS.includes(reviewClassPolicy.computeTier)) {
    block('REVIEW_CLASS_INVALID', `${policyId}/${reviewClass}`)
  }
  return { policy, reviewClassPolicy }
}

function reviewBinding(registry, skill, selfProviderId, authorProviderId) {
  object(registry, 'REVIEW_REGISTRY_INVALID', 'provider registry')
  if (!Array.isArray(registry.providers)) block('REVIEW_REGISTRY_INVALID', 'provider registry providers must be an array')
  if (typeof skill !== 'string' || !/^[a-z][a-z0-9-]*$/.test(skill)) block('REVIEW_SKILL_INVALID', `review skill is invalid:${skill ?? '<missing>'}`)
  const self = providerById(registry, selfProviderId, 'self')
  if (authorProviderId !== self.id) block('REVIEW_AUTHOR_COLLISION', `author must equal the current provider:${authorProviderId ?? '<missing>'}/${self.id}`)
  const binding = self.adapter?.skillBindings?.[skill]
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    block('REVIEW_BINDING_UNAVAILABLE', `${self.id} has no binding for ${skill}`)
  }
  if (binding.self !== self.id) block('REVIEW_BINDING_INVALID', `${self.id}/${skill} self binding mismatches`)
  if (Object.hasOwn(binding, 'peer')) block('REVIEW_FIXED_PEER_FORBIDDEN', `${self.id}/${skill}`)
  if (!/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(binding.selectionPolicy ?? '')) {
    block('REVIEW_SELECTION_POLICY_UNAVAILABLE', `${self.id}/${skill}`)
  }
  if (!/^[a-z][a-z0-9-]*$/.test(binding.reviewClass ?? '')) block('REVIEW_CLASS_INVALID', `${self.id}/${skill}`)
  const { policy, reviewClassPolicy } = exactReviewPolicy(registry, binding.selectionPolicy, binding.reviewClass)
  return { self, binding, policy, reviewClassPolicy }
}

function records(value, field, code, label) {
  object(value, code, label)
  if (!Array.isArray(value[field])) block(code, `${label}.${field} must be an array`)
  return value[field]
}

function uniqueSortedById(items, code, label) {
  const ids = items.map((item) => item?.id)
  if (ids.some((id) => typeof id !== 'string')
    || new Set(ids).size !== ids.length
    || ids.some((id, index) => index > 0 && compareUtf8Bytes(ids[index - 1], id) >= 0)) {
    block(code, `${label} must be unique and UTF-8 sorted by id`)
  }
}

function tierRank(policy, axis, value, label) {
  const order = policy[axis]
  const rank = Array.isArray(order) ? order.indexOf(value) : -1
  if (rank < 0) block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${label}:${value ?? '<missing>'}`)
  return rank
}

function invocationProfileById(invocationRegistry, profileId) {
  object(invocationRegistry, 'REVIEW_INVOCATION_REGISTRY_INVALID', 'model invocation profile registry')
  const matches = [
    ...(invocationRegistry.profiles?.[profileId] ? [invocationRegistry.profiles[profileId]] : []),
    ...(invocationRegistry.externalEntitlementProfiles?.[profileId] ? [invocationRegistry.externalEntitlementProfiles[profileId]] : []),
  ]
  if (matches.length !== 1) block('REVIEW_INVOCATION_PROFILE_UNAVAILABLE', profileId)
  return matches[0]
}

function modelReleaseById(modelReleaseRegistry, modelReleaseId) {
  const releaseRecords = records(modelReleaseRegistry, 'records', 'REVIEW_MODEL_RELEASE_REGISTRY_INVALID', 'model release registry')
  const matches = releaseRecords.filter((record) => record?.id === modelReleaseId)
  if (matches.length !== 1) block('REVIEW_MODEL_RELEASE_UNAVAILABLE', modelReleaseId)
  return matches[0]
}

function reviewProfileRecords(capabilityRegistry) {
  if (capabilityRegistry?.schemaVersion !== 1
    || capabilityRegistry?.kind !== 'provider-neutral-review-capability-registry'
    || capabilityRegistry?.selectionSemantics !== 'exact-candidates-only-capability-values-require-separate-certification'
    || !capabilityRegistry.providerCapabilityPrecedence
    || typeof capabilityRegistry.providerCapabilityPrecedence !== 'object'
    || Array.isArray(capabilityRegistry.providerCapabilityPrecedence)) {
    block('REVIEW_CAPABILITY_REGISTRY_INVALID', 'review capability registry identity is invalid')
  }
  const profiles = records(capabilityRegistry, 'reviewProfiles', 'REVIEW_CAPABILITY_REGISTRY_INVALID', 'review capability registry')
  if (profiles.length === 0) block('REVIEW_CAPABILITY_REGISTRY_INVALID', 'review capability registry is empty')
  uniqueSortedById(profiles, 'REVIEW_CAPABILITY_REGISTRY_INVALID', 'review capability profiles')
  return profiles
}

function providerCapabilityForProfile(capabilityRegistry, profile) {
  const providerRows = capabilityRegistry.providerCapabilityPrecedence?.[profile.providerId]
  if (!Array.isArray(providerRows) || providerRows.length === 0) {
    block('REVIEW_CAPABILITY_REGISTRY_INVALID', `${profile.providerId} lacks provider-local capability precedence`)
  }
  const modelIds = new Set()
  const ranks = new Set()
  for (const row of providerRows) {
    exactObjectKeys(row, [
      'modelReleaseId',
      'capabilityRank',
      'assuranceTier',
      'reasoningTier',
      'computeTier',
      'exchangeBudget',
    ], 'REVIEW_CAPABILITY_REGISTRY_INVALID', `${profile.providerId} capability precedence`)
    exactObjectKeys(row.exchangeBudget, [
      'maxInputBytes',
      'maxOutputBytes',
      'maxPayloadBytes',
    ], 'REVIEW_CAPABILITY_REGISTRY_INVALID', `${row.modelReleaseId} exchange budget`)
    if (!row.modelReleaseId.startsWith(`${profile.providerId}/`)
      || modelIds.has(row.modelReleaseId)
      || !Number.isSafeInteger(row.capabilityRank)
      || row.capabilityRank <= 0
      || ranks.has(row.capabilityRank)
      || !REVIEW_TIERS.includes(row.assuranceTier)
      || !REVIEW_TIERS.includes(row.reasoningTier)
      || !REVIEW_TIERS.includes(row.computeTier)
      || !Number.isSafeInteger(row.exchangeBudget.maxInputBytes)
      || row.exchangeBudget.maxInputBytes <= 0
      || !Number.isSafeInteger(row.exchangeBudget.maxOutputBytes)
      || row.exchangeBudget.maxOutputBytes <= 0
      || !Number.isSafeInteger(row.exchangeBudget.maxPayloadBytes)
      || row.exchangeBudget.maxPayloadBytes
        < row.exchangeBudget.maxInputBytes + row.exchangeBudget.maxOutputBytes) {
      block('REVIEW_CAPABILITY_REGISTRY_INVALID', `${profile.providerId}/${row.modelReleaseId ?? '<missing>'}`)
    }
    modelIds.add(row.modelReleaseId)
    ranks.add(row.capabilityRank)
  }
  const matches = providerRows.filter((row) => row.modelReleaseId === profile.modelReleaseId)
  if (matches.length !== 1) {
    block('REVIEW_CAPABILITY_REGISTRY_INVALID', `${profile.id} lacks one exact provider-local capability rank`)
  }
  return matches[0]
}

function capabilityCertificationRecords(certificationLedger) {
  if (certificationLedger?.schemaVersion !== 1
    || certificationLedger?.kind !== 'review-capability-certification-ledger') {
    block('REVIEW_CAPABILITY_CERTIFICATION_LEDGER_INVALID', 'review capability certification ledger identity is invalid')
  }
  const certifications = records(
    certificationLedger,
    'certifications',
    'REVIEW_CAPABILITY_CERTIFICATION_LEDGER_INVALID',
    'review capability certification ledger',
  )
  uniqueSortedById(certifications, 'REVIEW_CAPABILITY_CERTIFICATION_LEDGER_INVALID', 'review capability certifications')
  return certifications
}

function validateExactReviewProfile({
  profile,
  registry,
  invocationRegistry,
  modelReleaseRegistry,
} = {}) {
  object(profile, 'REVIEW_CAPABILITY_PROFILE_INVALID', 'review capability profile')
  if (!REVIEW_PROFILE_ID.test(profile.id ?? '')
    || !PROVIDER_ID.test(profile.providerId ?? '')
    || !['managed-api', 'subscription-entitlement'].includes(profile.routeClass)
    || !REVIEW_PROFILE_ID.test(profile.invocationProfileId ?? '')
    || !/^[a-z][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(profile.modelReleaseId ?? '')
    || typeof profile.requestModelId !== 'string'
    || profile.modelIdentityPolicy !== 'exact-model-release-response-match-no-mutable-alias') {
    block('REVIEW_CAPABILITY_PROFILE_INVALID', profile.id ?? '<missing>')
  }
  providerById(registry, profile.providerId, 'capability')
  const release = modelReleaseById(modelReleaseRegistry, profile.modelReleaseId)
  if (release.providerId !== profile.providerId
    || release.requestModelId !== profile.requestModelId
    || release.responseModelPolicy?.kind !== 'exact'
    || release.responseModelPolicy.expectedModelId !== profile.requestModelId
    || release.id !== `${profile.providerId}/${profile.requestModelId}`) {
    block('REVIEW_MODEL_ALIAS_FORBIDDEN', profile.id)
  }
  const invocationProfile = invocationProfileById(invocationRegistry, profile.invocationProfileId)
  if (invocationProfile.providerId !== profile.providerId
    || !invocationProfile.modelIdentity?.allowedModelReleaseIds?.includes(profile.modelReleaseId)) {
    block('REVIEW_INVOCATION_PROFILE_MISMATCH', profile.id)
  }
  if (profile.routeClass === 'subscription-entitlement') {
    if (typeof profile.entitlementId !== 'string'
      || invocationProfile.mode !== 'external-subscription-entitlement'
      || invocationProfile.entitlementId !== profile.entitlementId
      || invocationProfile.availabilityPolicy !== 'exact-certified-entitlement-readback-required'
      || invocationProfile.runtimeCertification !== 'required-not-source-certified'
      || invocationProfile.availabilityEvidence?.kind !== 'certified-runtime-evidence-assertion-v1'
      || !PROVIDER_ID.test(invocationProfile.availabilityEvidence.compatibilityProviderId ?? '')
      || invocationProfile.availabilityEvidence.runtimeProviderId !== profile.providerId
      || invocationProfile.availabilityEvidence.runtimeProfileId !== profile.providerId
      || !REVIEW_PROFILE_ID.test(invocationProfile.availabilityEvidence.runtimeKind ?? '')
      || !REVIEW_PROFILE_ID.test(invocationProfile.availabilityEvidence.surface ?? '')
      || !REVIEW_PROFILE_ID.test(invocationProfile.availabilityEvidence.repositoryRole ?? '')
      || invocationProfile.availabilityEvidence.providerEvidenceId !== profile.providerId
      || !REVIEW_PROFILE_ID.test(invocationProfile.availabilityEvidence.checkId ?? '')
      || !REVIEW_PROFILE_ID.test(invocationProfile.availabilityEvidence.assertionId ?? '')
      || invocationProfile.costFallbackPolicy !== 'forbidden'
      || invocationProfile.responseSelector?.schemaVersion !== 1
      || invocationProfile.responseSelector?.kind !== 'provider-review-result-response-selector'
      || invocationProfile.responseSelector?.carrierShape !== 'content-addressed-provider-review-result-v1') {
      block('REVIEW_ENTITLEMENT_PROFILE_INVALID', profile.id)
    }
  } else if (profile.entitlementId !== null || invocationProfile.mode !== 'broker-content-only') {
    block('REVIEW_INVOCATION_PROFILE_MISMATCH', profile.id)
  }
  return { release, invocationProfile }
}

function activeCapabilityCertification(certifications, profile, policy, now) {
  const matching = certifications.filter((record) => record?.reviewProfileId === profile.id)
  const eligible = []
  for (const certification of matching) {
    if (!REVIEW_PROFILE_ID.test(certification.id ?? '')
      || certification.reviewProfileDigest !== digest(profile)
      || certification.providerId !== profile.providerId
      || certification.modelReleaseId !== profile.modelReleaseId
      || certification.entitlementId !== profile.entitlementId
      || !['certified', 'expired', 'revoked'].includes(certification.status)
      || !Number.isFinite(Date.parse(certification.certifiedAt ?? ''))
      || !Number.isFinite(Date.parse(certification.expiresAt ?? ''))
      || Date.parse(certification.expiresAt) <= Date.parse(certification.certifiedAt)
      || !certification.evidence
      || typeof certification.evidence.reference !== 'string'
      || !SHA256.test(certification.evidence.sha256 ?? '')) {
      block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${profile.id}/${certification?.id ?? '<missing>'}`)
    }
    tierRank(policy, 'assuranceTierOrder', certification.assuranceTier, `${certification.id}/assuranceTier`)
    tierRank(policy, 'reasoningTierOrder', certification.reasoningTier, `${certification.id}/reasoningTier`)
    tierRank(policy, 'computeTierOrder', certification.computeTier, `${certification.id}/computeTier`)
    if (certification.status === 'certified'
      && Date.parse(certification.certifiedAt) <= now.getTime()
      && Date.parse(certification.expiresAt) > now.getTime()) eligible.push(certification)
  }
  if (eligible.length > 1) block('REVIEW_CAPABILITY_CERTIFICATION_AMBIGUOUS', profile.id)
  return eligible[0] ?? null
}

function selectionReceiptDigest(receipt) {
  const { selectionDigest: ignored, ...content } = receipt
  return digest(content)
}

function entitlementAvailabilityKey(record) {
  return `${record?.providerId ?? ''}/${record?.invocationProfileId ?? ''}/${record?.entitlementId ?? ''}`
}

function exactObjectKeys(value, expected, code, label) {
  object(value, code, label)
  const actual = Object.keys(value).sort(compareUtf8Bytes)
  const normalizedExpected = [...expected].sort(compareUtf8Bytes)
  if (actual.length !== normalizedExpected.length
    || actual.some((key, index) => key !== normalizedExpected[index])) {
    block(code, `${label} has an invalid or open shape`)
  }
}

function runtimeEvidenceUnsigned(evidence) {
  const { attestation: ignoredAttestation, evidenceDigest: ignoredDigest, ...unsigned } = evidence
  return unsigned
}

function evidenceBytes(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value)
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  block('REVIEW_ENTITLEMENT_EVIDENCE_INVALID', 'runtime evidence bytes are missing or invalid')
}

function contentSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function freezeEntitlementRecord(record, invocationProfile) {
  Object.freeze(record.target)
  Object.freeze(record.evidence)
  Object.freeze(record)
  VERIFIED_ENTITLEMENT_AVAILABILITY.set(record, Object.freeze({
    invocationProfileDigest: digest(invocationProfile),
  }))
  return record
}

/**
 * Mint the only entitlement-availability value accepted by capability selection.
 *
 * The token is derived from an existing exact runtime certification and the exact
 * content-addressed runtime evidence bytes named by that certification. No caller
 * supplied availability boolean, hash-only record, or serialized receipt can mint
 * the private in-process capability.
 */
export function verifyEntitlementAvailabilityEvidence({
  invocationRegistry,
  invocationProfileId,
  certificationLedger,
  target,
  expectedGitTree = null,
  runtimeEvidenceBytes,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    block('REVIEW_TIME_INVALID', 'entitlement evidence verification clock is invalid')
  }
  const invocationProfile = invocationProfileById(invocationRegistry, invocationProfileId)
  const binding = object(
    invocationProfile.availabilityEvidence,
    'REVIEW_ENTITLEMENT_EVIDENCE_INVALID',
    `${invocationProfileId} availability evidence binding`,
  )
  exactObjectKeys(binding, [
    'kind',
    'compatibilityProviderId',
    'runtimeProviderId',
    'runtimeProfileId',
    'runtimeKind',
    'surface',
    'repositoryRole',
    'providerEvidenceId',
    'checkId',
    'assertionId',
  ], 'REVIEW_ENTITLEMENT_EVIDENCE_INVALID', `${invocationProfileId} availability evidence binding`)
  if (invocationProfile.mode !== 'external-subscription-entitlement'
    || invocationProfile.availabilityPolicy !== 'exact-certified-entitlement-readback-required'
    || binding.kind !== 'certified-runtime-evidence-assertion-v1'
    || binding.runtimeProviderId !== invocationProfile.providerId
    || binding.runtimeProfileId !== invocationProfile.providerId
    || binding.providerEvidenceId !== invocationProfile.providerId) {
    block('REVIEW_ENTITLEMENT_EVIDENCE_INVALID', `${invocationProfileId} is not an exact entitlement readback profile`)
  }
  if (certificationLedger?.schemaVersion !== 2
    || certificationLedger?.$schema !== '../schemas/provider-surface-certification.schema.json') {
    block('REVIEW_ENTITLEMENT_CERTIFICATION_UNTRUSTED', 'entitlement readback requires the promoted canonical provider certification ledger')
  }
  const certification = verifyExactProviderCertification({
    certificationLedger,
    compatibilityProviderId: binding.compatibilityProviderId,
    runtimeProviderId: binding.runtimeProviderId,
    runtimeProfileId: binding.runtimeProfileId,
    runtimeKind: binding.runtimeKind,
    surface: binding.surface,
    repositoryRole: binding.repositoryRole,
    target,
    expectedGitTree,
    now,
    requireEvidence: true,
  })
  const bytes = evidenceBytes(runtimeEvidenceBytes)
  const artifactSha256 = contentSha256(bytes)
  const certifiedEvidence = object(
    certification.evidence,
    'REVIEW_ENTITLEMENT_EVIDENCE_INVALID',
    `${certification.certificationId} runtime evidence binding`,
  )
  if (certifiedEvidence.artifactSha256 !== artifactSha256
    || certifiedEvidence.reference !== `infra/governance/evidence/provider-runtime/${artifactSha256}.json`) {
    block('REVIEW_ENTITLEMENT_EVIDENCE_CONTENT_MISMATCH', `${certification.certificationId}/${invocationProfileId}`)
  }
  let evidence
  try {
    evidence = JSON.parse(bytes.toString('utf8'))
  } catch {
    block('REVIEW_ENTITLEMENT_EVIDENCE_INVALID', `${certification.certificationId} runtime evidence is not JSON`)
  }
  // Trust is inherited from the promoted exact certification record above. The
  // embedded attestation status remains a required consistency assertion, but
  // is never accepted without that canonical certification/content binding.
  if (evidence?.schemaVersion !== 4
    || evidence.kind !== 'provider-runtime-conformance'
    || evidence.scope !== 'provider'
    || evidence.status !== 'pass'
    || evidence.attestation?.status !== 'verified'
    || evidence.evidenceDigest !== certifiedEvidence.evidenceDigest
    || evidence.evidenceDigest !== `sha256:${digest(runtimeEvidenceUnsigned(evidence))}`
    || evidence.subject?.gitTree !== (expectedGitTree ?? evidence.subject?.gitTree)) {
    block('REVIEW_ENTITLEMENT_EVIDENCE_UNTRUSTED', `${certification.certificationId}/${invocationProfileId}`)
  }
  const observedAt = evidence.run?.generatedAt
  const evidenceExpiresAt = evidence.run?.validUntil
  if (!Number.isFinite(Date.parse(observedAt ?? ''))
    || !Number.isFinite(Date.parse(evidenceExpiresAt ?? ''))
    || Date.parse(evidenceExpiresAt) <= Date.parse(observedAt)
    || Date.parse(observedAt) > now.getTime()
    || Date.parse(evidenceExpiresAt) <= now.getTime()) {
    block('REVIEW_ENTITLEMENT_UNAVAILABLE', `${invocationProfile.providerId}/${invocationProfileId}/${invocationProfile.entitlementId}`)
  }
  const providerMatches = (evidence.providers || []).filter((provider) => provider?.id === binding.providerEvidenceId)
  if (providerMatches.length !== 1
    || providerMatches[0].status !== 'pass'
    || providerMatches[0].targetBinding?.id !== certification.target.id) {
    block('REVIEW_ENTITLEMENT_EVIDENCE_TARGET_MISMATCH', `${certification.certificationId}/${certification.target.id}`)
  }
  if (certifiedEvidence.targetId !== certification.target.id
    || certifiedEvidence.providerId !== binding.runtimeProfileId
    || (certifiedEvidence.targetDigest !== undefined
      && certifiedEvidence.targetDigest !== providerMatches[0].targetBinding?.digest)) {
    block('REVIEW_ENTITLEMENT_EVIDENCE_TARGET_MISMATCH', `${certification.certificationId}/${certification.target.id}`)
  }
  const checkMatches = (providerMatches[0].checks || []).filter((check) => check?.id === binding.checkId)
  const assertionMatches = checkMatches.length === 1
    ? (checkMatches[0].result?.assertions || []).filter((assertion) => assertion?.id === binding.assertionId)
    : []
  if (checkMatches.length !== 1
    || checkMatches[0].certificationImpact !== 'capability-only'
    || checkMatches[0].status !== 'pass'
    || assertionMatches.length !== 1
    || assertionMatches[0].pass !== true) {
    block('REVIEW_ENTITLEMENT_READBACK_REJECTED', `${invocationProfile.providerId}/${invocationProfileId}/${invocationProfile.entitlementId}`)
  }
  const expiresAt = new Date(Math.min(
    Date.parse(evidenceExpiresAt),
    Date.parse(certification.expiresAt),
  )).toISOString()
  if (Date.parse(expiresAt) <= now.getTime()) {
    block('REVIEW_ENTITLEMENT_UNAVAILABLE', `${invocationProfile.providerId}/${invocationProfileId}/${invocationProfile.entitlementId}`)
  }
  const readback = {
    providerId: invocationProfile.providerId,
    invocationProfileId,
    entitlementId: invocationProfile.entitlementId,
    source: 'verified-provider-adapter-readback',
    status: 'available',
    observedAt,
    expiresAt,
    runtimeProviderId: binding.runtimeProviderId,
    runtimeProfileId: binding.runtimeProfileId,
    runtimeKind: binding.runtimeKind,
    runtimeSurface: binding.surface,
    repositoryRole: binding.repositoryRole,
    target: certification.target,
    targetDigest: certification.targetDigest,
    runtimeCertificationId: certification.certificationId,
    runtimeCertificationDigest: certification.recordDigest,
    runtimeEvidenceDigest: evidence.evidenceDigest,
    evidence: {
      reference: certifiedEvidence.reference,
      sha256: artifactSha256,
    },
  }
  const record = {
    ...readback,
    adapterReadbackDigest: digest(readback),
  }
  return freezeEntitlementRecord(record, invocationProfile)
}

function validateEntitlementAvailability(value, {
  code = 'REVIEW_ENTITLEMENT_AVAILABILITY_INVALID',
  now = null,
  requireVerified = true,
  invocationRegistry = null,
} = {}) {
  if (!Array.isArray(value)) block(code, 'entitlement availability must be an array')
  const keys = value.map(entitlementAvailabilityKey)
  if (new Set(keys).size !== keys.length
    || keys.some((key, index) => index > 0 && compareUtf8Bytes(keys[index - 1], key) >= 0)) {
    block(code, 'entitlement availability must be unique and UTF-8 sorted')
  }
  for (const record of value) {
    exactObjectKeys(record, [
      'providerId',
      'invocationProfileId',
      'entitlementId',
      'source',
      'status',
      'observedAt',
      'expiresAt',
      'runtimeProviderId',
      'runtimeProfileId',
      'runtimeKind',
      'runtimeSurface',
      'repositoryRole',
      'target',
      'targetDigest',
      'runtimeCertificationId',
      'runtimeCertificationDigest',
      'runtimeEvidenceDigest',
      'adapterReadbackDigest',
      'evidence',
    ], code, `entitlement availability ${entitlementAvailabilityKey(record)}`)
    exactObjectKeys(record.evidence, ['reference', 'sha256'], code, `entitlement availability evidence ${entitlementAvailabilityKey(record)}`)
    if (!PROVIDER_ID.test(record?.providerId ?? '')
      || !REVIEW_PROFILE_ID.test(record?.invocationProfileId ?? '')
      || !/^[a-z][a-z0-9-]*$/.test(record?.entitlementId ?? '')
      || record.source !== 'verified-provider-adapter-readback'
      || record.status !== 'available'
      || !Number.isFinite(Date.parse(record.observedAt ?? ''))
      || !Number.isFinite(Date.parse(record.expiresAt ?? ''))
      || Date.parse(record.expiresAt) <= Date.parse(record.observedAt)
      || !PROVIDER_ID.test(record.runtimeProviderId ?? '')
      || !REVIEW_PROFILE_ID.test(record.runtimeProfileId ?? '')
      || !REVIEW_PROFILE_ID.test(record.runtimeKind ?? '')
      || !REVIEW_PROFILE_ID.test(record.runtimeSurface ?? '')
      || !REVIEW_PROFILE_ID.test(record.repositoryRole ?? '')
      || !REVIEW_PROFILE_ID.test(record.runtimeCertificationId ?? '')
      || digest(reviewTargetIdentity(record.target)) !== record.targetDigest
      || !SHA256.test(record.runtimeCertificationDigest ?? '')
      || !/^sha256:[a-f0-9]{64}$/.test(record.runtimeEvidenceDigest ?? '')
      || !SHA256.test(record.adapterReadbackDigest ?? '')
      || !record.evidence
      || record.evidence.reference !== `infra/governance/evidence/provider-runtime/${record.evidence.sha256}.json`
      || !SHA256.test(record.evidence.sha256 ?? '')
      || record.adapterReadbackDigest !== digest(Object.fromEntries(
        Object.entries(record).filter(([key]) => key !== 'adapterReadbackDigest'),
      ))
      || (requireVerified && !VERIFIED_ENTITLEMENT_AVAILABILITY.has(record))) {
      block(code, entitlementAvailabilityKey(record))
    }
    if (requireVerified) {
      const currentProfile = invocationProfileById(invocationRegistry, record.invocationProfileId)
      if (VERIFIED_ENTITLEMENT_AVAILABILITY.get(record)?.invocationProfileDigest !== digest(currentProfile)) {
        block(code, `${entitlementAvailabilityKey(record)}:invocation profile authority is stale`)
      }
    }
    if (now && (Date.parse(record.observedAt) > now.getTime()
      || Date.parse(record.expiresAt) <= now.getTime())) {
      block('REVIEW_ENTITLEMENT_UNAVAILABLE', entitlementAvailabilityKey(record))
    }
  }
  return value
}

export function validateBlockedReviewCapabilitySelectionReceipt(receipt) {
  object(receipt, 'REVIEW_SELECTION_RECEIPT_INVALID', 'blocked review capability selection receipt')
  if (receipt.schemaVersion !== 1
    || receipt.kind !== 'provider-review-capability-selection-blocked'
    || receipt.selectionStatus !== 'REVIEW-BLOCKED'
    || !['REVIEW_CAPABILITY_UNAVAILABLE', 'REVIEW_ENTITLEMENT_UNAVAILABLE'].includes(receipt.selectionReasonCode)
    || !PROVIDER_ID.test(receipt.authorProviderId ?? '')
    || receipt.selfProviderId !== receipt.authorProviderId
    || !/^[a-z][a-z0-9-]*$/.test(receipt.skill ?? '')
    || !/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(receipt.selectionPolicy ?? '')
    || !/^[a-z][a-z0-9-]*$/.test(receipt.reviewClass ?? '')
    || !REVIEW_TIERS.includes(receipt.requiredAssuranceTier)
    || !REVIEW_TIERS.includes(receipt.requiredReasoningTier)
    || !REVIEW_TIERS.includes(receipt.requiredComputeTier)
    || (receipt.requiredEntitlementId !== null
      && !/^[a-z][a-z0-9-]*$/.test(receipt.requiredEntitlementId ?? ''))
    || !SHA256.test(receipt.bindingDigest ?? '')
    || !SHA256.test(receipt.selectionPolicyDigest ?? '')
    || !SHA256.test(receipt.providerRegistryDigest ?? '')
    || !SHA256.test(receipt.capabilityRegistryDigest ?? '')
    || !SHA256.test(receipt.capabilityCertificationLedgerDigest ?? '')
    || !SHA256.test(receipt.invocationRegistryDigest ?? '')
    || !SHA256.test(receipt.modelReleaseRegistryDigest ?? '')
    || !SHA256.test(receipt.entitlementAvailabilityDigest ?? '')
    || receipt.entitlementAvailabilityDigest !== digest(receipt.entitlementAvailability)
    || !SHA256.test(receipt.selectionDigest ?? '')
    || receipt.selectionDigest !== selectionReceiptDigest(receipt)) {
    block('REVIEW_SELECTION_RECEIPT_INVALID', 'blocked selection receipt identity, shape, or digest mismatches')
  }
  validateEntitlementAvailability(receipt.entitlementAvailability, {
    code: 'REVIEW_SELECTION_RECEIPT_INVALID',
    requireVerified: false,
  })
  return true
}

export function validateReviewCapabilitySelectionReceipt(receipt) {
  object(receipt, 'REVIEW_SELECTION_RECEIPT_INVALID', 'review capability selection receipt')
  if (receipt.schemaVersion !== 1
    || receipt.kind !== 'provider-review-capability-selection'
    || !PROVIDER_ID.test(receipt.authorProviderId ?? '')
    || receipt.selfProviderId !== receipt.authorProviderId
    || !/^[a-z][a-z0-9-]*$/.test(receipt.skill ?? '')
    || !/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(receipt.selectionPolicy ?? '')
    || !/^[a-z][a-z0-9-]*$/.test(receipt.reviewClass ?? '')
    || !REVIEW_TIERS.includes(receipt.requiredAssuranceTier)
    || !REVIEW_TIERS.includes(receipt.requiredReasoningTier)
    || !REVIEW_TIERS.includes(receipt.requiredComputeTier)
    || !receipt.selected
    || !PROVIDER_ID.test(receipt.selected.providerId ?? '')
    || receipt.selected.providerId === receipt.authorProviderId
    || !REVIEW_PROFILE_ID.test(receipt.selected.reviewProfileId ?? '')
    || !REVIEW_PROFILE_ID.test(receipt.selected.invocationProfileId ?? '')
    || !['managed-api', 'subscription-entitlement'].includes(receipt.selected.routeClass)
    || !/^[a-z][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(receipt.selected.modelReleaseId ?? '')
    || typeof receipt.selected.requestModelId !== 'string'
    || !REVIEW_TIERS.includes(receipt.selected.assuranceTier)
    || !REVIEW_TIERS.includes(receipt.selected.reasoningTier)
    || !REVIEW_TIERS.includes(receipt.selected.computeTier)
    || !REVIEW_PROFILE_ID.test(receipt.selected.capabilityCertificationId ?? '')
    || !Number.isFinite(Date.parse(receipt.selected.capabilityCertificationExpiresAt ?? ''))
    || !SHA256.test(receipt.selected.capabilityEvidenceDigest ?? '')
    || !SHA256.test(receipt.bindingDigest ?? '')
    || !SHA256.test(receipt.selectionPolicyDigest ?? '')
    || !SHA256.test(receipt.providerRegistryDigest ?? '')
    || !SHA256.test(receipt.capabilityRegistryDigest ?? '')
    || !SHA256.test(receipt.capabilityCertificationLedgerDigest ?? '')
    || !SHA256.test(receipt.invocationRegistryDigest ?? '')
    || !SHA256.test(receipt.modelReleaseRegistryDigest ?? '')
    || !SHA256.test(receipt.selectedProviderRecordDigest ?? '')
    || !SHA256.test(receipt.selectedProfileDigest ?? '')
    || !SHA256.test(receipt.selectedInvocationProfileDigest ?? '')
    || !SHA256.test(receipt.selectedModelReleaseDigest ?? '')
    || !SHA256.test(receipt.selectedCapabilityCertificationDigest ?? '')
    || !SHA256.test(receipt.entitlementAvailabilityDigest ?? '')
    || receipt.entitlementAvailabilityDigest !== digest(receipt.entitlementAvailability)
    || !SHA256.test(receipt.selectionDigest ?? '')
    || receipt.selectionDigest !== selectionReceiptDigest(receipt)) {
    block('REVIEW_SELECTION_RECEIPT_INVALID', 'selection receipt identity, shape, or digest mismatches')
  }
  validateEntitlementAvailability(receipt.entitlementAvailability, {
    code: 'REVIEW_SELECTION_RECEIPT_INVALID',
    requireVerified: false,
  })
  if (receipt.selected.routeClass === 'subscription-entitlement') {
    if (typeof receipt.selected.entitlementId !== 'string'
      || !receipt.entitlementAvailability.some((record) => (
        record.providerId === receipt.selected.providerId
        && record.invocationProfileId === receipt.selected.invocationProfileId
        && record.entitlementId === receipt.selected.entitlementId
      ))
      || (receipt.requiredEntitlementId !== null
        && receipt.requiredEntitlementId !== receipt.selected.entitlementId)) {
      block('REVIEW_SELECTION_RECEIPT_INVALID', 'subscription entitlement binding mismatches')
    }
  } else if (receipt.selected.entitlementId !== null || receipt.requiredEntitlementId !== null) {
    block('REVIEW_SELECTION_RECEIPT_INVALID', 'managed API selection cannot claim an entitlement')
  }
  return true
}

export function resolveHighestCertifiedReviewCapability({
  registry,
  capabilityRegistry,
  capabilityCertificationLedger,
  invocationRegistry,
  modelReleaseRegistry,
  skill,
  selfProviderId,
  authorProviderId = selfProviderId,
  requiredEntitlementId = null,
  entitlementAvailability = [],
  expectedPeerProviderId = null,
  expectedReviewProfileId = null,
  expectedModelReleaseId = null,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) block('REVIEW_TIME_INVALID', 'capability selection clock is invalid')
  const { self, binding, policy, reviewClassPolicy } = reviewBinding(registry, skill, selfProviderId, authorProviderId)
  if (requiredEntitlementId !== null && !/^[a-z][a-z0-9-]*$/.test(requiredEntitlementId)) {
    block('REVIEW_ENTITLEMENT_INVALID', requiredEntitlementId ?? '<missing>')
  }
  validateEntitlementAvailability(entitlementAvailability, { now, invocationRegistry })
  if (requiredEntitlementId !== null
    && !entitlementAvailability.some((record) => record.entitlementId === requiredEntitlementId)) {
    block('REVIEW_ENTITLEMENT_UNAVAILABLE', requiredEntitlementId)
  }
  const profiles = reviewProfileRecords(capabilityRegistry)
  const certifications = capabilityCertificationRecords(capabilityCertificationLedger)
  const candidates = []
  for (const profile of profiles) {
    const { release, invocationProfile } = validateExactReviewProfile({
      profile,
      registry,
      invocationRegistry,
      modelReleaseRegistry,
    })
    if (profile.providerId === self.id || profile.providerId === authorProviderId) continue
    if (profile.routeClass === 'subscription-entitlement'
      && !entitlementAvailability.some((record) => (
        record.providerId === profile.providerId
        && record.invocationProfileId === profile.invocationProfileId
        && record.entitlementId === profile.entitlementId
      ))) continue
    if (requiredEntitlementId !== null && profile.entitlementId !== requiredEntitlementId) continue
    const certification = activeCapabilityCertification(certifications, profile, policy, now)
    if (!certification) continue
    const providerCapability = providerCapabilityForProfile(capabilityRegistry, profile)
    const requiredAssuranceRank = tierRank(
      policy,
      'assuranceTierOrder',
      reviewClassPolicy.assuranceTier,
      `${binding.reviewClass}/assuranceTier`,
    )
    const requiredReasoningRank = tierRank(
      policy,
      'reasoningTierOrder',
      reviewClassPolicy.reasoningTier,
      `${binding.reviewClass}/reasoningTier`,
    )
    const requiredComputeRank = tierRank(
      policy,
      'computeTierOrder',
      reviewClassPolicy.computeTier,
      `${binding.reviewClass}/computeTier`,
    )
    const assuranceRank = tierRank(policy, 'assuranceTierOrder', certification.assuranceTier, `${certification.id}/assuranceTier`)
    const reasoningRank = tierRank(policy, 'reasoningTierOrder', certification.reasoningTier, `${certification.id}/reasoningTier`)
    const computeRank = tierRank(policy, 'computeTierOrder', certification.computeTier, `${certification.id}/computeTier`)
    if (assuranceRank < requiredAssuranceRank
      || reasoningRank < requiredReasoningRank
      || computeRank < requiredComputeRank) continue
    candidates.push({
      profile,
      release,
      invocationProfile,
      certification,
      assuranceRank,
      reasoningRank,
      computeRank,
      providerCapabilityRank: providerCapability.capabilityRank,
      availableRequiredEntitlementRoute: profile.routeClass === 'subscription-entitlement' ? 1 : 0,
    })
  }
  candidates.sort((left, right) => (
    right.assuranceRank - left.assuranceRank
    || right.reasoningRank - left.reasoningRank
    || right.computeRank - left.computeRank
    || right.availableRequiredEntitlementRoute - left.availableRequiredEntitlementRoute
    || right.providerCapabilityRank - left.providerCapabilityRank
    || compareUtf8Bytes(left.profile.providerId, right.profile.providerId)
    || compareUtf8Bytes(left.profile.id, right.profile.id)
    || compareUtf8Bytes(left.profile.modelReleaseId, right.profile.modelReleaseId)
  ))
  if (candidates.length === 0) {
    block('REVIEW_CAPABILITY_UNAVAILABLE', `${self.id}/${skill}/${binding.reviewClass}/${requiredEntitlementId ?? 'any-entitlement'}`)
  }
  const selected = candidates[0]
  if (expectedPeerProviderId !== null && selected.profile.providerId !== expectedPeerProviderId) {
    block('REVIEW_PEER_MISMATCH', `${selected.profile.providerId}, not ${expectedPeerProviderId}`)
  }
  if (expectedReviewProfileId !== null && selected.profile.id !== expectedReviewProfileId) {
    block('REVIEW_PROFILE_MISMATCH', `${selected.profile.id}, not ${expectedReviewProfileId}`)
  }
  if (expectedModelReleaseId !== null && selected.profile.modelReleaseId !== expectedModelReleaseId) {
    block('REVIEW_MODEL_RELEASE_MISMATCH', `${selected.profile.modelReleaseId}, not ${expectedModelReleaseId}`)
  }
  const peer = providerById(registry, selected.profile.providerId, 'peer')
  const bindingDigest = digest({
    skill,
    self: self.id,
    selectionPolicy: binding.selectionPolicy,
    reviewClass: binding.reviewClass,
    binding,
  })
  const receipt = {
    schemaVersion: 1,
    kind: 'provider-review-capability-selection',
    skill,
    authorProviderId,
    selfProviderId: self.id,
    selectionPolicy: binding.selectionPolicy,
    reviewClass: binding.reviewClass,
    requiredAssuranceTier: reviewClassPolicy.assuranceTier,
    requiredReasoningTier: reviewClassPolicy.reasoningTier,
    requiredComputeTier: reviewClassPolicy.computeTier,
    requiredEntitlementId,
    entitlementAvailability,
    entitlementAvailabilityDigest: digest(entitlementAvailability),
    selected: {
      providerId: peer.id,
      reviewProfileId: selected.profile.id,
      invocationProfileId: selected.profile.invocationProfileId,
      routeClass: selected.profile.routeClass,
      entitlementId: selected.profile.entitlementId,
      modelReleaseId: selected.profile.modelReleaseId,
      requestModelId: selected.profile.requestModelId,
      assuranceTier: selected.certification.assuranceTier,
      reasoningTier: selected.certification.reasoningTier,
      computeTier: selected.certification.computeTier,
      capabilityCertificationId: selected.certification.id,
      capabilityCertificationExpiresAt: selected.certification.expiresAt,
      capabilityEvidenceDigest: selected.certification.evidence.sha256,
    },
    bindingDigest,
    selectionPolicyDigest: digest(policy),
    providerRegistryDigest: digest(registry),
    capabilityRegistryDigest: digest(capabilityRegistry),
    capabilityCertificationLedgerDigest: digest(capabilityCertificationLedger),
    invocationRegistryDigest: digest(invocationRegistry),
    modelReleaseRegistryDigest: digest(modelReleaseRegistry),
    selectedProviderRecordDigest: digest(peer),
    selectedProfileDigest: digest(selected.profile),
    selectedInvocationProfileDigest: digest(selected.invocationProfile),
    selectedModelReleaseDigest: digest(selected.release),
    selectedCapabilityCertificationDigest: digest(selected.certification),
  }
  receipt.selectionDigest = selectionReceiptDigest(receipt)
  validateReviewCapabilitySelectionReceipt(receipt)
  return {
    skill,
    self,
    peer,
    transport: binding.transport,
    invocation: binding.invocation ?? null,
    certificationContract: binding.certificationContract ?? null,
    binding,
    bindingDigest,
    policy,
    reviewClassPolicy,
    selectedProfile: selected.profile,
    selectedCapabilityCertification: selected.certification,
    selectionReceipt: receipt,
  }
}

function blockedCapabilitySelection({
  registry,
  capabilityRegistry,
  capabilityCertificationLedger,
  invocationRegistry,
  modelReleaseRegistry,
  skill,
  self,
  binding,
  policy,
  reviewClassPolicy,
  requiredEntitlementId,
  entitlementAvailability,
  selectionReasonCode,
} = {}) {
  const bindingDigest = digest({
    skill,
    self: self.id,
    selectionPolicy: binding.selectionPolicy,
    reviewClass: binding.reviewClass,
    binding,
  })
  const receipt = {
    schemaVersion: 1,
    kind: 'provider-review-capability-selection-blocked',
    selectionStatus: 'REVIEW-BLOCKED',
    selectionReasonCode,
    skill,
    authorProviderId: self.id,
    selfProviderId: self.id,
    selectionPolicy: binding.selectionPolicy,
    reviewClass: binding.reviewClass,
    requiredAssuranceTier: reviewClassPolicy.assuranceTier,
    requiredReasoningTier: reviewClassPolicy.reasoningTier,
    requiredComputeTier: reviewClassPolicy.computeTier,
    requiredEntitlementId,
    entitlementAvailability,
    entitlementAvailabilityDigest: digest(entitlementAvailability),
    bindingDigest,
    selectionPolicyDigest: digest(policy),
    providerRegistryDigest: digest(registry),
    capabilityRegistryDigest: digest(capabilityRegistry),
    capabilityCertificationLedgerDigest: digest(capabilityCertificationLedger),
    invocationRegistryDigest: digest(invocationRegistry),
    modelReleaseRegistryDigest: digest(modelReleaseRegistry),
  }
  receipt.selectionDigest = selectionReceiptDigest(receipt)
  validateBlockedReviewCapabilitySelectionReceipt(receipt)
  return receipt
}

export function verifyReviewCapabilitySelection({
  receipt,
  registry,
  capabilityRegistry,
  capabilityCertificationLedger,
  invocationRegistry,
  modelReleaseRegistry,
  skill,
  selfProviderId,
  authorProviderId = selfProviderId,
  requiredEntitlementId = null,
  entitlementAvailability = [],
  observedProviderId,
  observedReviewProfileId,
  observedModelReleaseId,
  observedResponseModelId,
  now = new Date(),
} = {}) {
  validateReviewCapabilitySelectionReceipt(receipt)
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) block('REVIEW_TIME_INVALID', 'selection verification clock is invalid')
  if (typeof skill !== 'string' || !selfProviderId || !authorProviderId) {
    block('REVIEW_SELECTION_VERIFICATION_CONTEXT_REQUIRED', 'skill, self provider, and author provider must be explicit')
  }
  validateEntitlementAvailability(entitlementAvailability, { now, invocationRegistry })
  for (const [actual, expected, code, label] of [
    [digest(registry), receipt.providerRegistryDigest, 'REVIEW_PROVIDER_REGISTRY_STALE', 'provider registry'],
    [digest(capabilityRegistry), receipt.capabilityRegistryDigest, 'REVIEW_CAPABILITY_REGISTRY_STALE', 'capability registry'],
    [digest(capabilityCertificationLedger), receipt.capabilityCertificationLedgerDigest, 'REVIEW_CAPABILITY_CERTIFICATION_STALE', 'capability certification ledger'],
    [digest(invocationRegistry), receipt.invocationRegistryDigest, 'REVIEW_INVOCATION_REGISTRY_STALE', 'invocation registry'],
    [digest(modelReleaseRegistry), receipt.modelReleaseRegistryDigest, 'REVIEW_MODEL_RELEASE_REGISTRY_STALE', 'model release registry'],
  ]) {
    if (actual !== expected) block(code, label)
  }
  const canonical = resolveHighestCertifiedReviewCapability({
    registry,
    capabilityRegistry,
    capabilityCertificationLedger,
    invocationRegistry,
    modelReleaseRegistry,
    skill,
    selfProviderId,
    authorProviderId,
    requiredEntitlementId,
    entitlementAvailability,
    now,
  }).selectionReceipt
  if (JSON.stringify(stableValue(canonical)) !== JSON.stringify(stableValue(receipt))) {
    block('REVIEW_SELECTION_RECEIPT_NONCANONICAL', 'selection receipt differs from the current canonical highest eligible capability')
  }
  const selected = canonical.selected
  if (authorProviderId === selected.providerId
    || observedProviderId !== selected.providerId) {
    block('REVIEW_PROVIDER_SUBSTITUTION', `${observedProviderId ?? '<missing>'}/${selected.providerId}`)
  }
  if (observedReviewProfileId !== selected.reviewProfileId) {
    block('REVIEW_PROFILE_SUBSTITUTION', `${observedReviewProfileId ?? '<missing>'}/${selected.reviewProfileId}`)
  }
  if (observedModelReleaseId !== selected.modelReleaseId) {
    block('REVIEW_MODEL_RELEASE_SUBSTITUTION', `${observedModelReleaseId ?? '<missing>'}/${selected.modelReleaseId}`)
  }
  if (observedResponseModelId !== selected.requestModelId) {
    block('REVIEW_MODEL_SUBSTITUTION', `${observedResponseModelId ?? '<missing>'}/${selected.requestModelId}`)
  }
  if (Date.parse(selected.capabilityCertificationExpiresAt) <= now.getTime()) {
    block('REVIEW_CAPABILITY_CERTIFICATION_EXPIRED', selected.capabilityCertificationId)
  }
  return true
}

export function resolveProviderReviewBinding({
  registry,
  skill,
  selfProviderId,
  authorProviderId = selfProviderId,
  expectedPeerProviderId = null,
  requireCertificationContract = false,
  capabilityRegistry = null,
  capabilityCertificationLedger = null,
  invocationRegistry = null,
  modelReleaseRegistry = null,
  requiredEntitlementId = null,
  entitlementAvailability = [],
  expectedReviewProfileId = null,
  expectedModelReleaseId = null,
  requireSelectedCapability = false,
  now = new Date(),
} = {}) {
  const { self, binding, policy, reviewClassPolicy } = reviewBinding(registry, skill, selfProviderId, authorProviderId)
  const transport = nonEmpty(binding.transport, 'REVIEW_TRANSPORT_UNAVAILABLE', `${self.id}/${skill} transport`)
  if (requireCertificationContract && binding.certificationContract !== EXACT_REVIEW_CERTIFICATION_CONTRACT) {
    block('REVIEW_CERTIFICATION_CONTRACT_UNAVAILABLE', `${self.id}/${skill} lacks ${EXACT_REVIEW_CERTIFICATION_CONTRACT}`)
  }
  if (requireCertificationContract && transport !== PORTABLE_REVIEW_EXCHANGE_CORE) {
    block('REVIEW_EXCHANGE_CORE_UNATTESTED', `${self.id}/${skill} must use ${PORTABLE_REVIEW_EXCHANGE_CORE}`)
  }
  const selectionInputs = [capabilityRegistry, capabilityCertificationLedger, invocationRegistry, modelReleaseRegistry]
  const suppliedSelectionInputs = selectionInputs.filter((value) => value !== null).length
  if (suppliedSelectionInputs !== 0 && suppliedSelectionInputs !== selectionInputs.length) {
    block('REVIEW_CAPABILITY_INPUTS_INCOMPLETE', `${self.id}/${skill}`)
  }
  if (suppliedSelectionInputs === selectionInputs.length) {
    try {
      return resolveHighestCertifiedReviewCapability({
        registry,
        capabilityRegistry,
        capabilityCertificationLedger,
        invocationRegistry,
        modelReleaseRegistry,
        skill,
        selfProviderId,
        authorProviderId,
        requiredEntitlementId,
        entitlementAvailability,
        expectedPeerProviderId,
        expectedReviewProfileId,
        expectedModelReleaseId,
        now,
      })
    } catch (error) {
      if (requireSelectedCapability
        || !['REVIEW_CAPABILITY_UNAVAILABLE', 'REVIEW_ENTITLEMENT_UNAVAILABLE'].includes(error?.code)) throw error
      const bindingDigest = digest({
        skill,
        self: self.id,
        selectionPolicy: binding.selectionPolicy,
        reviewClass: binding.reviewClass,
        binding,
      })
      return {
        skill,
        self,
        peer: null,
        transport,
        invocation: binding.invocation ?? null,
        certificationContract: binding.certificationContract ?? null,
        binding,
        bindingDigest,
        policy,
        reviewClassPolicy,
        selectionStatus: 'REVIEW-BLOCKED',
        selectionReasonCode: error.code,
        selectionReceipt: blockedCapabilitySelection({
          registry,
          capabilityRegistry,
          capabilityCertificationLedger,
          invocationRegistry,
          modelReleaseRegistry,
          skill,
          self,
          binding,
          policy,
          reviewClassPolicy,
          requiredEntitlementId,
          entitlementAvailability,
          selectionReasonCode: error.code,
        }),
      }
    }
  }
  if (requireSelectedCapability || expectedPeerProviderId !== null
    || expectedReviewProfileId !== null || expectedModelReleaseId !== null
    || requiredEntitlementId !== null) {
    block('REVIEW_CAPABILITY_SELECTION_REQUIRED', `${self.id}/${skill}`)
  }
  const bindingDigest = digest({
    skill,
    self: self.id,
    selectionPolicy: binding.selectionPolicy,
    reviewClass: binding.reviewClass,
    binding,
  })
  return {
    skill,
    self,
    peer: null,
    transport,
    invocation: binding.invocation ?? null,
    certificationContract: binding.certificationContract ?? null,
    binding,
    bindingDigest,
    policy,
    reviewClassPolicy,
    selectionStatus: 'REVIEW-BLOCKED',
    selectionReasonCode: 'REVIEW_CAPABILITY_SELECTION_REQUIRED',
  }
}

/**
 * Resolve native-hook projection eligibility from the same provider registry and review-binding
 * authority used at runtime. Both the adapter generator and the event dispatcher consume this
 * function so a batch cannot silently select a different descriptor set than its generated view.
 */
export function resolveProviderHookEligibility({
  registry,
  providerId,
  descriptor,
  hasUsableVersionedTranscript,
  allowDeferredSelection = false,
} = {}) {
  object(registry, 'HOOK_ELIGIBILITY_REGISTRY_INVALID', 'provider registry')
  object(descriptor, 'HOOK_ELIGIBILITY_DESCRIPTOR_INVALID', 'hook descriptor')
  if (typeof hasUsableVersionedTranscript !== 'function') {
    block('HOOK_ELIGIBILITY_TRANSCRIPT_CONTRACT_INVALID', 'versioned transcript predicate is unavailable')
  }
  const provider = providerById(registry, providerId, 'hook')
  if (descriptor.transcript === 'stable-required'
    && !hasUsableVersionedTranscript(provider.runtime?.transcript)) {
    return {
      eligible: false,
      reasonCode: 'STABLE_TRANSCRIPT_CONTRACT_UNAVAILABLE',
      detail: `${providerId} does not declare a tested versioned native transcript contract`,
      peer: null,
    }
  }

  const requirements = descriptor.requires || []
  if (!requirements.length) return { eligible: true, reasonCode: null, detail: null, peer: null }
  let resolved = null
  try {
    resolved = resolveProviderReviewBinding({
      registry,
      skill: descriptor.reviewSkill,
      selfProviderId: providerId,
      requireCertificationContract: ['deep-audit-cross-codex', 'independent-review'].includes(descriptor.reviewSkill),
    })
  } catch (error) {
    if (requirements.includes('peer-review-binding') || requirements.includes('peer-cli')) {
      return {
        eligible: false,
        reasonCode: error.code || 'PEER_REVIEW_BINDING_UNAVAILABLE',
        detail: `${providerId} has no distinct registered ${descriptor.reviewSkill} peer`,
        peer: null,
      }
    }
    throw error
  }
  if (!resolved.peer && (requirements.includes('peer-review-binding') || requirements.includes('peer-cli'))) {
    if (allowDeferredSelection) {
      return {
        eligible: true,
        reasonCode: null,
        detail: null,
        peer: null,
        selectionStatus: 'deferred-to-review-prepare',
        selectionPolicy: resolved.binding.selectionPolicy,
        reviewClass: resolved.binding.reviewClass,
      }
    }
    return {
      eligible: false,
      reasonCode: resolved.selectionReasonCode || 'REVIEW_CAPABILITY_SELECTION_REQUIRED',
      detail: `${providerId} requires a distinct certified capability selection at review prepare time`,
      peer: null,
      selectionPolicy: resolved.binding.selectionPolicy,
      reviewClass: resolved.binding.reviewClass,
    }
  }
  if (requirements.includes('peer-cli')) {
    const cli = resolved.peer?.runtime?.cli
    if (!cli?.executable
      || !cli?.localExecutable
      || !cli?.replyArtifactPrefix
      || !cli?.briefInvocationMarkers?.length
      || !cli?.discoveryMarkers?.length) {
      return {
        eligible: false,
        reasonCode: 'PEER_CLI_METADATA_UNAVAILABLE',
        detail: `${providerId} peer ${resolved.peer?.id || '<missing>'} has no complete CLI/reply/discovery metadata`,
        peer: null,
      }
    }
  }
  return {
    eligible: true,
    reasonCode: null,
    detail: null,
    peer: resolved.peer,
  }
}

export function compatibilityProviderIdForAdapter(compatibilityMatrix, adapterProviderId) {
  object(compatibilityMatrix, 'REVIEW_COMPATIBILITY_INVALID', 'compatibility matrix')
  object(compatibilityMatrix.providers, 'REVIEW_COMPATIBILITY_INVALID', 'compatibility matrix providers')
  const matches = Object.entries(compatibilityMatrix.providers)
    .filter(([, record]) => record?.adapterProviderId === adapterProviderId)
    .map(([providerId]) => providerId)
  if (matches.length !== 1) {
    block('REVIEW_COMPATIBILITY_UNAVAILABLE', `adapter provider must map to exactly one compatibility provider:${adapterProviderId}`)
  }
  return matches[0]
}

export function reviewTargetIdentity(target) {
  object(target, 'REVIEW_TARGET_INVALID', 'review target')
  if (!TARGET_ID.test(target.id ?? '')) block('REVIEW_TARGET_INVALID', `review target id is invalid:${target.id ?? '<missing>'}`)
  const result = { id: target.id }
  for (const axis of REVIEW_TARGET_AXES) result[axis] = nonEmpty(target[axis], 'REVIEW_TARGET_INVALID', `review target.${axis}`)
  return result
}

export function certificationAggregateStatus(certification, { now = new Date() } = {}) {
  object(certification, 'REVIEW_CERTIFICATION_INVALID', 'certification')
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) block('REVIEW_TIME_INVALID', 'certification clock is invalid')
  if (!Array.isArray(certification.platformMatrix) || certification.platformMatrix.length === 0) {
    block('REVIEW_CERTIFICATION_INVALID', `${certification.id ?? '<unknown>'} has no platform targets`)
  }
  const targets = certification.platformMatrix.filter((target) => target.status !== 'unsupported')
  if (targets.length === 0) return 'not-applicable'
  let certified = 0
  let expired = 0
  for (const target of targets) {
    if (target.status !== 'certified') continue
    const expiresAt = target.expiresAt ?? certification.expiresAt
    if (typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= now.getTime()) expired += 1
    else certified += 1
  }
  if (certified === targets.length) return 'certified'
  if (certified > 0) return 'conditional'
  if (expired > 0 && expired === targets.length) return 'expired'
  return 'not-certified'
}

function certificationRecords(ledger) {
  if (Array.isArray(ledger)) return ledger
  object(ledger, 'REVIEW_CERTIFICATION_LEDGER_INVALID', 'certification ledger')
  if (!Array.isArray(ledger.certifications)) block('REVIEW_CERTIFICATION_LEDGER_INVALID', 'certification ledger records must be an array')
  return ledger.certifications
}

export function verifyExactProviderCertification({
  certificationLedger,
  compatibilityProviderId,
  runtimeProviderId,
  runtimeProfileId = runtimeProviderId,
  runtimeKind,
  surface,
  repositoryRole,
  target,
  expectedGitTree = null,
  now = new Date(),
  requireEvidence = true,
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) block('REVIEW_TIME_INVALID', 'certification clock is invalid')
  for (const [value, label] of [
    [compatibilityProviderId, 'provider'], [runtimeProviderId, 'runtimeProviderId'], [runtimeKind, 'runtimeKind'],
    [runtimeProfileId, 'runtimeProfileId'], [surface, 'surface'], [repositoryRole, 'repositoryRole'],
  ]) nonEmpty(value, 'REVIEW_CERTIFICATION_REQUEST_INVALID', label)
  const identity = reviewTargetIdentity(target)
  const records = certificationRecords(certificationLedger).filter((record) => (
    record?.provider === compatibilityProviderId
    && record.runtimeKind === runtimeKind
    && record.surface === surface
    && record.repositoryRole === repositoryRole
  ))
  if (records.length !== 1) {
    block(records.length ? 'REVIEW_CERTIFICATION_AMBIGUOUS' : 'REVIEW_CERTIFICATION_MISSING', `${compatibilityProviderId}/${runtimeKind}/${surface}/${repositoryRole}`)
  }
  const record = records[0]
  if (record.status === 'expired') block('REVIEW_CERTIFICATION_EXPIRED', `${record.id}:${record.status}`)
  if (!['certified', 'conditional'].includes(record.status)) block('REVIEW_NOT_CERTIFIED', `${record.id}:${record.status}`)
  const matches = record.platformMatrix.filter((candidate) => candidate?.id === identity.id)
  if (matches.length !== 1) block('REVIEW_TARGET_UNCERTIFIED', `${record.id}/${identity.id}`)
  const certifiedTarget = matches[0]
  for (const axis of REVIEW_TARGET_AXES) {
    if (certifiedTarget[axis] !== identity[axis]) {
      block('REVIEW_TARGET_AXES_MISMATCH', `${record.id}/${identity.id}/${axis}:${identity[axis]}!=${certifiedTarget[axis]}`)
    }
  }
  if (certifiedTarget.status !== 'certified') block('REVIEW_TARGET_UNCERTIFIED', `${record.id}/${identity.id}:${certifiedTarget.status}`)
  const certifiedAt = certifiedTarget.certifiedAt ?? record.certifiedAt
  const expiresAt = certifiedTarget.expiresAt ?? record.expiresAt
  if (!Number.isFinite(Date.parse(certifiedAt ?? '')) || !Number.isFinite(Date.parse(expiresAt ?? ''))) {
    block('REVIEW_CERTIFICATION_DATES_INVALID', `${record.id}/${identity.id}`)
  }
  if (Date.parse(expiresAt) <= Date.parse(certifiedAt)) block('REVIEW_CERTIFICATION_DATES_INVALID', `${record.id}/${identity.id}:expiry ordering`)
  if (Date.parse(expiresAt) <= now.getTime()) block('REVIEW_CERTIFICATION_EXPIRED', `${record.id}/${identity.id}`)
  const aggregate = certificationAggregateStatus(record, { now })
  if (!['certified', 'conditional'].includes(aggregate)) block('REVIEW_NOT_CERTIFIED', `${record.id}:${record.status}/${aggregate}`)
  const evidence = certifiedTarget.runtimeEvidence ?? record.runtimeEvidence ?? null
  if (requireEvidence && (!evidence || typeof evidence !== 'object' || Array.isArray(evidence))) {
    block('REVIEW_CERTIFICATION_EVIDENCE_MISSING', `${record.id}/${identity.id}`)
  }
  if (evidence) {
    const observedRuntimeIdentity = evidence.profileId ?? evidence.providerId
    const expectedRuntimeIdentity = evidence.profileId === undefined ? runtimeProviderId : runtimeProfileId
    if (observedRuntimeIdentity !== expectedRuntimeIdentity) block('REVIEW_CERTIFICATION_EVIDENCE_PROVIDER_MISMATCH', `${record.id}/${identity.id}`)
    if (evidence.targetId !== identity.id) block('REVIEW_CERTIFICATION_EVIDENCE_TARGET_MISMATCH', `${record.id}/${identity.id}`)
    for (const axis of REVIEW_TARGET_AXES) {
      if (evidence[axis] !== identity[axis]) block('REVIEW_CERTIFICATION_EVIDENCE_AXES_MISMATCH', `${record.id}/${identity.id}/${axis}`)
    }
    if (expectedGitTree !== null && evidence.gitTree !== expectedGitTree) {
      block('REVIEW_CERTIFICATION_STALE', `${record.id}/${identity.id}`)
    }
  }
  return {
    certificationId: record.id,
    certificationStatus: record.status,
    aggregateStatus: aggregate,
    compatibilityProviderId,
    runtimeProviderId,
    runtimeKind,
    surface,
    repositoryRole,
    target: identity,
    targetDigest: digest(identity),
    certifiedAt,
    expiresAt,
    evidence,
    record,
    recordDigest: digest(record),
  }
}

function canonicalIsoTime(value, code, label) {
  if (typeof value !== 'string'
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    block(code, `${label} is not a canonical ISO timestamp`)
  }
  return value
}

function reviewCapabilityEvidenceProjection(value) {
  const { evidenceDigest: ignoredEvidenceDigest, ...projection } = value
  return projection
}

function reviewCapabilityEvidenceBytes(value) {
  return Buffer.from(`${JSON.stringify(stableValue(value))}\n`, 'utf8')
}

function reviewCapabilityCertificationRecord({
  certificationId,
  profile,
  capability,
  certifiedAt,
  expiresAt,
  evidenceReference,
  evidenceSha256,
}) {
  return {
    id: certificationId,
    reviewProfileId: profile.id,
    reviewProfileDigest: digest(profile),
    providerId: profile.providerId,
    modelReleaseId: profile.modelReleaseId,
    entitlementId: profile.entitlementId,
    status: 'certified',
    assuranceTier: capability.assuranceTier,
    reasoningTier: capability.reasoningTier,
    computeTier: capability.computeTier,
    certifiedAt,
    expiresAt,
    evidence: {
      reference: evidenceReference,
      sha256: evidenceSha256,
    },
  }
}

function exactFlagValue(args, flag, expected, code, label) {
  const indexes = args.flatMap((value, index) => value === flag ? [index] : [])
  if (indexes.length !== 1 || args[indexes[0] + 1] !== expected) {
    block(code, `${label} does not bind ${flag}=${JSON.stringify(expected)}`)
  }
}

function verifySignedReviewCapabilityProbe({
  runtimeEvidenceBytes,
  capabilityRegistry,
  invocationProfile,
  profile,
  capability,
  target,
} = {}) {
  let evidence
  try {
    evidence = JSON.parse(evidenceBytes(runtimeEvidenceBytes).toString('utf8'))
  } catch {
    block('REVIEW_CAPABILITY_PROBE_INVALID', `${profile.id}:runtime evidence is not JSON`)
  }
  const providerMatches = (evidence.providers || []).filter(
    (provider) => provider?.id === invocationProfile.availabilityEvidence.providerEvidenceId,
  )
  const distribution = providerMatches[0]?.tool?.distribution
  if (providerMatches.length !== 1
    || providerMatches[0].status !== 'pass'
    || distribution?.resolutionStatus !== 'pass'
    || distribution.distributionVersion !== target.distributionVersion
    || !/^sha256:[a-f0-9]{64}$/.test(distribution.authorityDigest ?? '')) {
    block('REVIEW_CAPABILITY_PROBE_INVALID', `${profile.id}:signed exact runtime evidence is absent or failed`)
  }
  const candidates = reviewProfileRecords(capabilityRegistry)
    .filter((candidate) => (
      candidate.providerId === profile.providerId
      && candidate.routeClass === 'subscription-entitlement'
      && candidate.entitlementId === profile.entitlementId
      && candidate.invocationProfileId === profile.invocationProfileId
    ))
    .map((candidate) => ({
      profile: candidate,
      capability: providerCapabilityForProfile(capabilityRegistry, candidate),
    }))
    .sort((left, right) => (
      right.capability.capabilityRank - left.capability.capabilityRank
      || compareUtf8Bytes(left.profile.id, right.profile.id)
    ))
  const selectedIndex = candidates.findIndex(
    (candidate) => candidate.profile.id === profile.id,
  )
  if (selectedIndex < 0) {
    block('REVIEW_CAPABILITY_PROBE_INVALID', `${profile.id}:candidate schedule is incomplete`)
  }
  const probeRows = candidates.slice(0, selectedIndex + 1).map((candidate, ordinal) => {
    const candidateProfile = candidate.profile
    const checkId = `review-capability-${candidateProfile.id}`
    const checkMatches = (providerMatches[0].checks || [])
      .filter((check) => check?.id === checkId)
    const check = checkMatches[0]
    const args = check?.command?.arguments
    const selectedCandidate = candidateProfile.id === profile.id
    const assertions = new Map(
      (check?.result?.assertions || [])
        .map((assertion) => [assertion?.id, assertion?.pass]),
    )
    if (checkMatches.length !== 1
      || check.driver !== 'claude-review-capability-probe'
      || check.certificationImpact !== 'capability-only'
      || check.command?.executable
        !== invocationProfile.deploymentAdapter.executable
      || check.command.cwd !== '<fixture>'
      || check.command.stdin !== 'sha256'
      || !Array.isArray(args)) {
      block('REVIEW_CAPABILITY_PROBE_INVALID',
        `${candidateProfile.id}:signed exact candidate outcome is absent or failed`)
    }
    if (check.status !== 'pass') {
      block(
        selectedCandidate
          ? 'REVIEW_CAPABILITY_PROBE_INVALID'
          : 'REVIEW_HIGHER_CAPABILITY_OUTCOME_UNVERIFIED',
        `${candidateProfile.id}:candidate probe is transient, quota/capacity/auth blocked, timed out, or otherwise unverified`,
      )
    }
    if (assertions.get('review-capability-profile-observed') !== true
      || assertions.get('review-capability-maximum-compute-observed') !== true
      || assertions.get('review-capability-isolated-no-tools-route-observed') !== true) {
      block('REVIEW_CAPABILITY_PROBE_INVALID',
        `${candidateProfile.id}:successful candidate outcome lacks exact profile/compute/isolation evidence`)
    }
    exactFlagValue(args, '--model', candidateProfile.requestModelId,
      'REVIEW_CAPABILITY_PROBE_INVALID', candidateProfile.id)
    exactFlagValue(args, '--effort', invocationProfile.deploymentAdapter
      .effortByComputeTier[candidate.capability.computeTier],
    'REVIEW_CAPABILITY_PROBE_INVALID', candidateProfile.id)
    exactFlagValue(args, '--tools', '',
      'REVIEW_CAPABILITY_PROBE_INVALID', candidateProfile.id)
    exactFlagValue(args, '--mcp-config', '{"mcpServers":{}}',
      'REVIEW_CAPABILITY_PROBE_INVALID', candidateProfile.id)
    exactFlagValue(args, '--permission-mode', 'plan',
      'REVIEW_CAPABILITY_PROBE_INVALID', candidateProfile.id)
    for (const required of [
      '--no-session-persistence',
      '--strict-mcp-config',
      '--safe-mode',
      '--no-chrome',
    ]) {
      if (args.filter((value) => value === required).length !== 1) {
        block('REVIEW_CAPABILITY_PROBE_INVALID',
          `${candidateProfile.id} lacks exact ${required}`)
      }
    }
    if (args.some((value) => (
      [
        '--fallback-model',
        '--resume',
        '--continue',
        '--max-budget-usd',
      ].includes(value)
    ))) {
      block('REVIEW_CAPABILITY_PROBE_INVALID',
        `${candidateProfile.id} capability probe permits fallback or session reuse`)
    }
    const available =
      assertions.get('review-capability-outcome-available') === true
      && assertions.get('review-capability-model-usage-exact') === true
    const permanentlyUnavailable =
      assertions.get('review-capability-outcome-permanently-unavailable') === true
      && assertions.get('review-capability-machine-readable-unavailability-observed') === true
    if (available === permanentlyUnavailable) {
      block('REVIEW_CAPABILITY_PROBE_INVALID',
        `${candidateProfile.id}:candidate outcome is ambiguous`)
    }
    if ((selectedCandidate && !available)
      || (!selectedCandidate && !permanentlyUnavailable)) {
      block(
        selectedCandidate
          ? 'REVIEW_CAPABILITY_PROBE_INVALID'
          : (available
              ? 'REVIEW_HIGHER_CAPABILITY_AVAILABLE'
              : 'REVIEW_HIGHER_CAPABILITY_OUTCOME_UNVERIFIED'),
        `${candidateProfile.id}:${selectedCandidate ? 'selected-not-available' : (available ? 'higher-candidate-available' : 'higher-candidate-not-permanently-unavailable')}`,
      )
    }
    return {
      ordinal,
      reviewProfileId: candidateProfile.id,
      modelReleaseId: candidateProfile.modelReleaseId,
      requestModelId: candidateProfile.requestModelId,
      capabilityRank: candidate.capability.capabilityRank,
      checkId,
      outcome: available ? 'available' : 'permanently-unavailable',
      checkDigest: digest(check),
    }
  })
  const checkId = `review-capability-${profile.id}`
  const selectedRow = probeRows[probeRows.length - 1]
  const candidateSet = candidates.map(({ profile: candidateProfile, capability: row }) => ({
    reviewProfileId: candidateProfile.id,
    modelReleaseId: candidateProfile.modelReleaseId,
    requestModelId: candidateProfile.requestModelId,
    capabilityRank: row.capabilityRank,
  }))
  const projection = {
    reviewProfileId: profile.id,
    requestModelId: profile.requestModelId,
    computeTier: capability.computeTier,
    effort: invocationProfile.deploymentAdapter.effortByComputeTier[capability.computeTier],
    checkId,
    checkDigest: selectedRow.checkDigest,
    candidateSetDigest: digest(candidateSet),
    orderedProbeRows: probeRows,
    orderedProbeSetDigest: digest(probeRows),
    runtimeExecutableAuthorityDigest: distribution.authorityDigest.slice('sha256:'.length),
    distributionVersion: distribution.distributionVersion,
  }
  return {
    ...projection,
    capabilityProbeDigest: digest(projection),
  }
}

/**
 * Prepare a deterministic capability-certification carrier from an already
 * promoted exact runtime certification. The function does not grant trust to
 * an unsigned runtime observation: the existing provider certification ledger
 * and its content-addressed runtime evidence remain the trust root. The tier
 * assertion becomes authoritative only when the returned record is reviewed
 * and materialized in the canonical capability ledger.
 */
export function prepareReviewCapabilityCertification({
  registry,
  capabilityRegistry,
  invocationRegistry,
  modelReleaseRegistry,
  runtimeCertificationLedger,
  reviewProfileId,
  certificationId,
  capability,
  target,
  expectedGitTree,
  runtimeEvidenceBytes,
  certifiedAt,
  expiresAt,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    block('REVIEW_TIME_INVALID', 'capability certification clock is invalid')
  }
  if (!REVIEW_PROFILE_ID.test(reviewProfileId ?? '')
    || !REVIEW_PROFILE_ID.test(certificationId ?? '')) {
    block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${certificationId ?? '<missing>'}/${reviewProfileId ?? '<missing>'}`)
  }
  exactObjectKeys(capability, [
    'assuranceTier',
    'reasoningTier',
    'computeTier',
    'exchangeBudget',
  ], 'REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${certificationId} capability`)
  for (const [field, value] of Object.entries(capability)
    .filter(([key]) => key !== 'exchangeBudget')) {
    if (!REVIEW_TIERS.includes(value)) {
      block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${certificationId}/${field}:${value ?? '<missing>'}`)
    }
  }
  exactObjectKeys(capability.exchangeBudget, [
    'maxInputBytes',
    'maxOutputBytes',
    'maxPayloadBytes',
  ], 'REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${certificationId} exchange budget`)
  const { maxInputBytes, maxOutputBytes, maxPayloadBytes } = capability.exchangeBudget
  if (!Number.isSafeInteger(maxInputBytes) || maxInputBytes <= 0
    || !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0
    || !Number.isSafeInteger(maxPayloadBytes)
    || maxPayloadBytes < maxInputBytes + maxOutputBytes) {
    block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${certificationId}:exchange budget`)
  }
  canonicalIsoTime(certifiedAt, 'REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${certificationId}.certifiedAt`)
  canonicalIsoTime(expiresAt, 'REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${certificationId}.expiresAt`)
  if (Date.parse(certifiedAt) > now.getTime()
    || Date.parse(expiresAt) <= Date.parse(certifiedAt)
    || Date.parse(expiresAt) <= now.getTime()) {
    block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${certificationId}:validity window`)
  }
  const profiles = reviewProfileRecords(capabilityRegistry)
  const matchingProfiles = profiles.filter((profile) => profile.id === reviewProfileId)
  if (matchingProfiles.length !== 1) {
    block('REVIEW_CAPABILITY_PROFILE_INVALID', reviewProfileId)
  }
  const profile = matchingProfiles[0]
  const providerCapability = providerCapabilityForProfile(capabilityRegistry, profile)
  const governedCapability = {
    assuranceTier: providerCapability.assuranceTier,
    reasoningTier: providerCapability.reasoningTier,
    computeTier: providerCapability.computeTier,
    exchangeBudget: stableValue(providerCapability.exchangeBudget),
  }
  if (JSON.stringify(stableValue(capability))
      !== JSON.stringify(stableValue(governedCapability))) {
    block('REVIEW_CAPABILITY_CERTIFICATION_INVALID',
      `${reviewProfileId}:caller capability differs from reviewed provider-local capability authority`)
  }
  const { release, invocationProfile } = validateExactReviewProfile({
    profile,
    registry,
    invocationRegistry,
    modelReleaseRegistry,
  })
  if (profile.routeClass !== 'subscription-entitlement') {
    block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${reviewProfileId} is not an external entitlement route`)
  }
  const availability = verifyEntitlementAvailabilityEvidence({
    invocationRegistry,
    invocationProfileId: profile.invocationProfileId,
    certificationLedger: runtimeCertificationLedger,
    target,
    expectedGitTree,
    runtimeEvidenceBytes,
    now,
  })
  if (availability.providerId !== profile.providerId
    || availability.entitlementId !== profile.entitlementId
    || availability.invocationProfileId !== profile.invocationProfileId) {
    block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${reviewProfileId}:runtime entitlement binding`)
  }
  const capabilityProbe = verifySignedReviewCapabilityProbe({
    runtimeEvidenceBytes,
    capabilityRegistry,
    invocationProfile,
    profile,
    capability: governedCapability,
    target,
  })
  const effectiveExpiresAt = new Date(Math.min(
    Date.parse(expiresAt),
    Date.parse(availability.expiresAt),
  )).toISOString()
  if (Date.parse(effectiveExpiresAt) <= Date.parse(certifiedAt)) {
    block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', `${certificationId}:runtime-bound expiry`)
  }
  const projection = {
    schemaVersion: 1,
    kind: 'provider-neutral-review-capability-certification-evidence',
    certificationContract: EXACT_REVIEW_CERTIFICATION_CONTRACT,
    exchangeCore: PORTABLE_REVIEW_EXCHANGE_CORE,
    certificationId,
    reviewProfileId: profile.id,
    reviewProfileDigest: digest(profile),
    providerId: profile.providerId,
    invocationProfileId: profile.invocationProfileId,
    invocationProfileDigest: digest(invocationProfile),
    routeClass: profile.routeClass,
    entitlementId: profile.entitlementId,
    modelReleaseId: profile.modelReleaseId,
    requestModelId: profile.requestModelId,
    modelReleaseDigest: digest(release),
    capabilityRank: providerCapability.capabilityRank,
    capability: stableValue(governedCapability),
    capabilityProbe,
    certifiedAt,
    expiresAt: effectiveExpiresAt,
    runtimeBinding: {
      compatibilityProviderId: invocationProfile.availabilityEvidence.compatibilityProviderId,
      runtimeProviderId: availability.runtimeProviderId,
      runtimeProfileId: availability.runtimeProfileId,
      runtimeKind: availability.runtimeKind,
      surface: availability.runtimeSurface,
      repositoryRole: availability.repositoryRole,
      certificationId: availability.runtimeCertificationId,
      certificationDigest: availability.runtimeCertificationDigest,
      target: stableValue(availability.target),
      targetDigest: availability.targetDigest,
      evidenceReference: availability.evidence.reference,
      evidenceSha256: availability.evidence.sha256,
      runtimeEvidenceDigest: availability.runtimeEvidenceDigest,
      runtimeExecutableAuthorityDigest:
        capabilityProbe.runtimeExecutableAuthorityDigest,
      capabilityProbeDigest: capabilityProbe.capabilityProbeDigest,
    },
  }
  const evidence = {
    ...projection,
    evidenceDigest: digest(projection),
  }
  const bytes = reviewCapabilityEvidenceBytes(evidence)
  const evidenceSha256 = contentSha256(bytes)
  const evidenceReference =
    `infra/governance/evidence/review-capability/${evidenceSha256}.json`
  const certification = reviewCapabilityCertificationRecord({
    certificationId,
    profile,
    capability,
    certifiedAt,
    expiresAt: effectiveExpiresAt,
    evidenceReference,
    evidenceSha256,
  })
  return Object.freeze({
    evidence: Object.freeze(evidence),
    evidenceBytes: bytes,
    evidenceSha256,
    evidenceReference,
    certification: Object.freeze(certification),
  })
}

export function materializeReviewCapabilityCertification({
  capabilityCertificationLedger,
  prepared,
} = {}) {
  capabilityCertificationRecords(capabilityCertificationLedger)
  object(prepared, 'REVIEW_CAPABILITY_CERTIFICATION_INVALID', 'prepared capability certification')
  if (!Buffer.isBuffer(prepared.evidenceBytes)
    || prepared.evidenceBytes.length === 0
    || prepared.evidenceSha256 !== contentSha256(prepared.evidenceBytes)
    || prepared.evidenceReference
      !== `infra/governance/evidence/review-capability/${prepared.evidenceSha256}.json`
    || prepared.certification?.evidence?.reference !== prepared.evidenceReference
    || prepared.certification?.evidence?.sha256 !== prepared.evidenceSha256) {
    block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', 'prepared evidence is not content-addressed')
  }
  let decoded
  try {
    decoded = JSON.parse(prepared.evidenceBytes.toString('utf8'))
  } catch {
    block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', 'prepared evidence is invalid JSON')
  }
  if (JSON.stringify(stableValue(decoded)) !== JSON.stringify(stableValue(prepared.evidence))
    || decoded?.schemaVersion !== 1
    || decoded.kind !== 'provider-neutral-review-capability-certification-evidence'
    || decoded.certificationContract !== EXACT_REVIEW_CERTIFICATION_CONTRACT
    || decoded.exchangeCore !== PORTABLE_REVIEW_EXCHANGE_CORE
    || decoded.evidenceDigest !== digest(reviewCapabilityEvidenceProjection(decoded))
    || decoded.certificationId !== prepared.certification?.id
    || decoded.reviewProfileId !== prepared.certification?.reviewProfileId
    || decoded.reviewProfileDigest !== prepared.certification?.reviewProfileDigest
    || decoded.providerId !== prepared.certification?.providerId
    || decoded.modelReleaseId !== prepared.certification?.modelReleaseId
    || decoded.entitlementId !== prepared.certification?.entitlementId
    || decoded.certifiedAt !== prepared.certification?.certifiedAt
    || decoded.expiresAt !== prepared.certification?.expiresAt
    || decoded.capability?.assuranceTier !== prepared.certification?.assuranceTier
    || decoded.capability?.reasoningTier !== prepared.certification?.reasoningTier
    || decoded.capability?.computeTier !== prepared.certification?.computeTier) {
    block('REVIEW_CAPABILITY_CERTIFICATION_INVALID', 'prepared evidence/ledger projection mismatches')
  }
  const current = capabilityCertificationLedger.certifications
  const sameId = current.filter((record) => record.id === prepared.certification.id)
  if (sameId.length > 1) {
    block('REVIEW_CAPABILITY_CERTIFICATION_AMBIGUOUS', prepared.certification.id)
  }
  if (sameId.length === 1) {
    if (JSON.stringify(stableValue(sameId[0]))
      !== JSON.stringify(stableValue(prepared.certification))) {
      block('REVIEW_CAPABILITY_CERTIFICATION_SUBSTITUTED', prepared.certification.id)
    }
    return capabilityCertificationLedger
  }
  const overlapping = current.filter((record) => (
    record.reviewProfileId === prepared.certification.reviewProfileId
    && record.status === 'certified'
    && Date.parse(record.expiresAt) > Date.parse(prepared.certification.certifiedAt)
    && Date.parse(record.certifiedAt) < Date.parse(prepared.certification.expiresAt)
  ))
  if (overlapping.length > 0) {
    block('REVIEW_CAPABILITY_CERTIFICATION_AMBIGUOUS', prepared.certification.reviewProfileId)
  }
  const next = {
    ...capabilityCertificationLedger,
    certifications: [...current, prepared.certification]
      .sort((left, right) => compareUtf8Bytes(left.id, right.id)),
  }
  capabilityCertificationRecords(next)
  return next
}

function genuineReceiptProjection(receipt) {
  const { receiptDigest: ignoredReceiptDigest, ...projection } = receipt
  return projection
}

export function validateGenuineCrossProviderReviewReceipt(receipt) {
  exactObjectKeys(receipt, [
    'schemaVersion',
    'kind',
    'protocol',
    'exchangeCore',
    'assurance',
    'authorProviderId',
    'reviewerProviderId',
    'reviewProfileId',
    'invocationProfileId',
    'modelReleaseId',
    'requestModelId',
    'observedResponseModelId',
    'selectionDigest',
    'capabilityCertificationId',
    'capabilityCertificationDigest',
    'capabilityEvidenceDigest',
    'runtimeCertificationId',
    'runtimeCertificationDigest',
    'runtimeTargetDigest',
    'structuralCompletionDigest',
    'exchangeScheduleDigest',
    'capabilityBudgetDigest',
    'aggregateVerdict',
    'taskRootVerdictSetDigest',
    'requestCount',
    'responseDigestSetDigest',
    'executionEvidenceDigest',
    'fullNoSampleClosure',
    'genuineCrossProviderReview',
    'promotionEligible',
    'managedEvidence',
    'receiptDigest',
  ], 'REVIEW_GENUINE_RECEIPT_INVALID', 'genuine review receipt')
  if (receipt.schemaVersion !== 1
    || receipt.kind !== 'provider-neutral-genuine-cross-provider-review-receipt'
    || receipt.exchangeCore !== PORTABLE_REVIEW_EXCHANGE_CORE
    || receipt.assurance !== 'exact-runtime-and-capability-attested'
    || !PROVIDER_ID.test(receipt.authorProviderId ?? '')
    || !PROVIDER_ID.test(receipt.reviewerProviderId ?? '')
    || receipt.authorProviderId === receipt.reviewerProviderId
    || !REVIEW_PROFILE_ID.test(receipt.reviewProfileId ?? '')
    || !REVIEW_PROFILE_ID.test(receipt.invocationProfileId ?? '')
    || !REVIEW_PROFILE_ID.test(receipt.capabilityCertificationId ?? '')
    || !REVIEW_PROFILE_ID.test(receipt.runtimeCertificationId ?? '')
    || typeof receipt.modelReleaseId !== 'string'
    || typeof receipt.requestModelId !== 'string'
    || receipt.observedResponseModelId !== receipt.requestModelId
    || !SHA256.test(receipt.selectionDigest ?? '')
    || !SHA256.test(receipt.capabilityCertificationDigest ?? '')
    || !SHA256.test(receipt.capabilityEvidenceDigest ?? '')
    || !SHA256.test(receipt.runtimeCertificationDigest ?? '')
    || !SHA256.test(receipt.runtimeTargetDigest ?? '')
    || !SHA256.test(receipt.structuralCompletionDigest ?? '')
    || !SHA256.test(receipt.exchangeScheduleDigest ?? '')
    || !SHA256.test(receipt.capabilityBudgetDigest ?? '')
    || !['verified', 'findings', 'unverifiable'].includes(receipt.aggregateVerdict)
    || !SHA256.test(receipt.taskRootVerdictSetDigest ?? '')
    || !Number.isSafeInteger(receipt.requestCount)
    || receipt.requestCount <= 0
    || !SHA256.test(receipt.responseDigestSetDigest ?? '')
    || !SHA256.test(receipt.executionEvidenceDigest ?? '')
    || receipt.fullNoSampleClosure !== true
    || receipt.genuineCrossProviderReview !== true
    || receipt.promotionEligible !== (receipt.aggregateVerdict === 'verified')
    || receipt.managedEvidence !== false
    || !SHA256.test(receipt.receiptDigest ?? '')
    || receipt.receiptDigest !== digest(genuineReceiptProjection(receipt))) {
    block('REVIEW_GENUINE_RECEIPT_INVALID', 'genuine review receipt identity or digest mismatches')
  }
  return true
}

/**
 * Upgrade a portable structural closure to a genuine review receipt only after
 * the exact capability selection, runtime certification, response identity,
 * and every ordered provider invocation are revalidated. This does not rewrite
 * the structural completion and cannot be used to claim managed execution.
 */
export function buildGenuineCrossProviderReviewReceipt({
  structuralCompletion,
  exchangeSchedule,
  executionEvidence,
  selectionReceipt,
  registry,
  capabilityRegistry,
  capabilityCertificationLedger,
  invocationRegistry,
  modelReleaseRegistry,
  entitlementAvailability,
  capabilityEvidenceBytes,
  runtimeCertificationLedger,
  runtimeTarget,
  expectedGitTree,
  now = new Date(),
} = {}) {
  object(structuralCompletion, 'REVIEW_GENUINE_TRANSITION_BLOCKED', 'structural completion')
  object(exchangeSchedule, 'REVIEW_GENUINE_TRANSITION_BLOCKED', 'exchange schedule')
  validateReviewCapabilitySelectionReceipt(selectionReceipt)
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    block('REVIEW_TIME_INVALID', 'genuine review transition clock is invalid')
  }
  const selected = selectionReceipt.selected
  verifyReviewCapabilitySelection({
    receipt: selectionReceipt,
    registry,
    capabilityRegistry,
    capabilityCertificationLedger,
    invocationRegistry,
    modelReleaseRegistry,
    skill: selectionReceipt.skill,
    selfProviderId: selectionReceipt.selfProviderId,
    authorProviderId: selectionReceipt.authorProviderId,
    requiredEntitlementId: selectionReceipt.requiredEntitlementId,
    entitlementAvailability,
    observedProviderId: selected.providerId,
    observedReviewProfileId: selected.reviewProfileId,
    observedModelReleaseId: selected.modelReleaseId,
    observedResponseModelId: selected.requestModelId,
    now,
  })
  const capabilityRecords = capabilityCertificationRecords(capabilityCertificationLedger)
  const capabilityMatches = capabilityRecords.filter((record) => (
    record.id === selected.capabilityCertificationId
  ))
  if (capabilityMatches.length !== 1
    || digest(capabilityMatches[0]) !== selectionReceipt.selectedCapabilityCertificationDigest) {
    block('REVIEW_GENUINE_TRANSITION_BLOCKED', 'selected capability certification is absent or substituted')
  }
  const capabilityRecord = capabilityMatches[0]
  const capabilityBytes = evidenceBytes(capabilityEvidenceBytes)
  if (contentSha256(capabilityBytes) !== capabilityRecord.evidence.sha256
    || capabilityRecord.evidence.reference
      !== `infra/governance/evidence/review-capability/${capabilityRecord.evidence.sha256}.json`) {
    block('REVIEW_GENUINE_TRANSITION_BLOCKED', 'capability evidence content binding mismatches')
  }
  let capabilityEvidence
  try {
    capabilityEvidence = JSON.parse(capabilityBytes.toString('utf8'))
  } catch {
    block('REVIEW_GENUINE_TRANSITION_BLOCKED', 'capability evidence is invalid JSON')
  }
  if (capabilityEvidence?.schemaVersion !== 1
    || capabilityEvidence.kind !== 'provider-neutral-review-capability-certification-evidence'
    || capabilityEvidence.evidenceDigest
      !== digest(reviewCapabilityEvidenceProjection(capabilityEvidence))
    || capabilityEvidence.certificationId !== capabilityRecord.id
    || capabilityEvidence.reviewProfileId !== selected.reviewProfileId
    || capabilityEvidence.reviewProfileDigest !== selectionReceipt.selectedProfileDigest
    || capabilityEvidence.providerId !== selected.providerId
    || capabilityEvidence.invocationProfileId !== selected.invocationProfileId
    || capabilityEvidence.modelReleaseId !== selected.modelReleaseId
    || capabilityEvidence.requestModelId !== selected.requestModelId
    || capabilityEvidence.capability?.assuranceTier !== selected.assuranceTier
    || capabilityEvidence.capability?.reasoningTier !== selected.reasoningTier
    || capabilityEvidence.capability?.computeTier !== selected.computeTier) {
    block('REVIEW_GENUINE_TRANSITION_BLOCKED', 'capability evidence is stale or substituted')
  }
  const certifiedBudget = capabilityEvidence.capability?.exchangeBudget
  if (!certifiedBudget
    || exchangeSchedule.capabilityBudget?.capabilityCertificationId
      !== capabilityRecord.id
    || exchangeSchedule.capabilityBudget?.selectedCapabilityCertificationDigest
      !== selectionReceipt.selectedCapabilityCertificationDigest
    || exchangeSchedule.capabilityBudget?.maxInputBytes !== certifiedBudget.maxInputBytes
    || exchangeSchedule.capabilityBudget?.maxOutputBytes !== certifiedBudget.maxOutputBytes
    || exchangeSchedule.capabilityBudget?.maxPayloadBytes !== certifiedBudget.maxPayloadBytes
    || exchangeSchedule.capabilityBudgetDigest
      !== exchangeSchedule.capabilityBudget.capabilityBudgetDigest) {
    block('REVIEW_GENUINE_TRANSITION_BLOCKED', 'exchange schedule is detached from the certified capability budget')
  }
  const invocationProfile = invocationProfileById(
    invocationRegistry,
    selected.invocationProfileId,
  )
  const runtimeBinding = capabilityEvidence.runtimeBinding
  const runtimeCertification = verifyExactProviderCertification({
    certificationLedger: runtimeCertificationLedger,
    compatibilityProviderId: invocationProfile.availabilityEvidence.compatibilityProviderId,
    runtimeProviderId: selected.providerId,
    runtimeProfileId: invocationProfile.availabilityEvidence.runtimeProfileId,
    runtimeKind: invocationProfile.availabilityEvidence.runtimeKind,
    surface: invocationProfile.availabilityEvidence.surface,
    repositoryRole: invocationProfile.availabilityEvidence.repositoryRole,
    target: runtimeTarget,
    expectedGitTree,
    now,
    requireEvidence: true,
  })
  if (runtimeBinding?.runtimeProviderId !== runtimeCertification.runtimeProviderId
    || runtimeBinding.runtimeProfileId !== invocationProfile.availabilityEvidence.runtimeProfileId
    || runtimeBinding.runtimeKind !== runtimeCertification.runtimeKind
    || runtimeBinding.surface !== runtimeCertification.surface
    || runtimeBinding.repositoryRole !== runtimeCertification.repositoryRole
    || runtimeBinding.certificationId !== runtimeCertification.certificationId
    || runtimeBinding.certificationDigest !== runtimeCertification.recordDigest
    || runtimeBinding.targetDigest !== runtimeCertification.targetDigest) {
    block('REVIEW_GENUINE_TRANSITION_BLOCKED', 'runtime certification is detached from the capability evidence')
  }
  const { completionDigest, ...structuralProjection } = structuralCompletion
  if (structuralCompletion.evidenceKind
      !== 'deep-audit-model-broker-review-graph-exchange-completion'
    || completionDigest !== digest(structuralProjection)
    || structuralCompletion.exchangeScheduleDigest
      !== exchangeSchedule.exchangeScheduleDigest
    || structuralCompletion.requestCount !== exchangeSchedule.requestCount
    || !['verified', 'findings', 'unverifiable']
      .includes(structuralCompletion.aggregateVerdict)
    || !SHA256.test(structuralCompletion.taskRootVerdictSetDigest ?? '')
    || structuralCompletion.taskRootVerdictSetDigest
      !== digest(structuralCompletion.taskRootVerdicts)
    || structuralCompletion.fullNoSampleClosure !== true
    || structuralCompletion.structuralOnly !== true
    || structuralCompletion.genuineCrossProviderReview !== false
    || structuralCompletion.promotionEligible !== false
    || structuralCompletion.managedEvidence !== false
    || exchangeSchedule.fullRegisteredReview !== true
    || exchangeSchedule.sampling !== false
    || exchangeSchedule.structuralOnly !== true
    || exchangeSchedule.genuineCrossProviderReview !== false
    || exchangeSchedule.reviewIdentity?.selectionDigest !== selectionReceipt.selectionDigest) {
    block('REVIEW_GENUINE_TRANSITION_BLOCKED', 'structural completion/schedule is incomplete, stale, or overclaimed')
  }
  if (!Array.isArray(executionEvidence)
    || executionEvidence.length !== exchangeSchedule.requestCount) {
    block('REVIEW_GENUINE_TRANSITION_BLOCKED', 'execution evidence is partial')
  }
  const responseRows = []
  const providerRunIds = new Set()
  for (const [ordinal, row] of executionEvidence.entries()) {
    const planned = exchangeSchedule.requests[ordinal]
    exactObjectKeys(row, [
      'requestOrdinal',
      'requestDigest',
      'carrierDigest',
      'providerRunId',
      'responseSha256',
      'observedProviderId',
      'observedReviewProfileId',
      'observedInvocationProfileId',
      'observedModelReleaseId',
      'observedResponseModelId',
      'runtimeCertificationId',
      'runtimeCertificationDigest',
      'runtimeTargetDigest',
      'runtimeExecutableAuthorityDigest',
      'runtimeExecutableBindingDigest',
      'executionBindingDigest',
      'authReadbackDigest',
      'versionReadbackDigest',
      'isolationPathClass',
      'repositoryMounted',
    ], 'REVIEW_GENUINE_TRANSITION_BLOCKED', `execution evidence ${ordinal}`)
    if (!planned
      || row.requestOrdinal !== ordinal
      || row.requestDigest !== planned.requestDigest
      || !SHA256.test(row.carrierDigest ?? '')
      || !nonEmpty(row.providerRunId, 'REVIEW_GENUINE_TRANSITION_BLOCKED', `execution evidence ${ordinal}.providerRunId`)
      || providerRunIds.has(row.providerRunId)
      || !SHA256.test(row.responseSha256 ?? '')
      || row.observedProviderId !== selected.providerId
      || row.observedReviewProfileId !== selected.reviewProfileId
      || row.observedInvocationProfileId !== selected.invocationProfileId
      || row.observedModelReleaseId !== selected.modelReleaseId
      || row.observedResponseModelId !== selected.requestModelId
      || row.runtimeCertificationId !== runtimeCertification.certificationId
      || row.runtimeCertificationDigest !== runtimeCertification.recordDigest
      || row.runtimeTargetDigest !== runtimeCertification.targetDigest
      || row.runtimeExecutableAuthorityDigest
        !== runtimeBinding.runtimeExecutableAuthorityDigest
      || !SHA256.test(row.runtimeExecutableBindingDigest ?? '')
      || !SHA256.test(row.executionBindingDigest ?? '')
      || !SHA256.test(row.authReadbackDigest ?? '')
      || !SHA256.test(row.versionReadbackDigest ?? '')
      || !['no-space', 'contains-space'].includes(row.isolationPathClass)
      || row.repositoryMounted !== false
      || row.executionBindingDigest !== digest({
        schemaVersion: 1,
        kind: 'provider-neutral-external-entitlement-execution-binding',
        runtimeExecutableAuthorityDigest: row.runtimeExecutableAuthorityDigest,
        runtimeExecutableBindingDigest: row.runtimeExecutableBindingDigest,
        certifiedRuntimeTargetDigest: row.runtimeTargetDigest,
        authReadbackDigest: row.authReadbackDigest,
        versionReadbackDigest: row.versionReadbackDigest,
        isolationPathClass: row.isolationPathClass,
        repositoryMounted: row.repositoryMounted,
      })) {
      block('REVIEW_GENUINE_TRANSITION_BLOCKED', `execution evidence is missing, duplicate, reordered, or substituted:${ordinal}`)
    }
    providerRunIds.add(row.providerRunId)
    responseRows.push({
      requestDigest: row.requestDigest,
      carrierDigest: row.carrierDigest,
      providerRunId: row.providerRunId,
      responseSha256: row.responseSha256,
    })
  }
  const responseDigestSetDigest = digest(responseRows)
  if (responseDigestSetDigest !== structuralCompletion.responseDigestSetDigest) {
    block('REVIEW_GENUINE_TRANSITION_BLOCKED', 'execution response closure differs from the structural completion')
  }
  const executionEvidenceDigest = digest(executionEvidence)
  const projection = {
    schemaVersion: 1,
    kind: 'provider-neutral-genuine-cross-provider-review-receipt',
    protocol: exchangeSchedule.protocol,
    exchangeCore: PORTABLE_REVIEW_EXCHANGE_CORE,
    assurance: 'exact-runtime-and-capability-attested',
    authorProviderId: selectionReceipt.authorProviderId,
    reviewerProviderId: selected.providerId,
    reviewProfileId: selected.reviewProfileId,
    invocationProfileId: selected.invocationProfileId,
    modelReleaseId: selected.modelReleaseId,
    requestModelId: selected.requestModelId,
    observedResponseModelId: selected.requestModelId,
    selectionDigest: selectionReceipt.selectionDigest,
    capabilityCertificationId: capabilityRecord.id,
    capabilityCertificationDigest: digest(capabilityRecord),
    capabilityEvidenceDigest: capabilityEvidence.evidenceDigest,
    runtimeCertificationId: runtimeCertification.certificationId,
    runtimeCertificationDigest: runtimeCertification.recordDigest,
    runtimeTargetDigest: runtimeCertification.targetDigest,
    structuralCompletionDigest: completionDigest,
    exchangeScheduleDigest: exchangeSchedule.exchangeScheduleDigest,
    capabilityBudgetDigest: exchangeSchedule.capabilityBudgetDigest,
    aggregateVerdict: structuralCompletion.aggregateVerdict,
    taskRootVerdictSetDigest: structuralCompletion.taskRootVerdictSetDigest,
    requestCount: exchangeSchedule.requestCount,
    responseDigestSetDigest,
    executionEvidenceDigest,
    fullNoSampleClosure: true,
    genuineCrossProviderReview: true,
    promotionEligible: structuralCompletion.aggregateVerdict === 'verified',
    managedEvidence: false,
  }
  const receipt = { ...projection, receiptDigest: digest(projection) }
  validateGenuineCrossProviderReviewReceipt(receipt)
  return receipt
}

export function projectProviderReviewBindings({
  registry,
  compatibilityMatrix,
  certificationLedger,
  skill = 'independent-review',
  repositoryRole = 'product-consumer',
} = {}) {
  object(registry, 'REVIEW_REGISTRY_INVALID', 'provider registry')
  const providers = (registry.providers || []).filter((provider) => provider?.adapter?.generate)
  const bindings = providers.map((provider) => {
    const resolved = resolveProviderReviewBinding({
      registry,
      skill,
      selfProviderId: provider.id,
      requireCertificationContract: true,
    })
    return {
      selfProviderId: provider.id,
      selectionPolicy: resolved.binding.selectionPolicy,
      reviewClass: resolved.binding.reviewClass,
      requiredAssuranceTier: resolved.reviewClassPolicy.assuranceTier,
      requiredReasoningTier: resolved.reviewClassPolicy.reasoningTier,
      requiredComputeTier: resolved.reviewClassPolicy.computeTier,
      transport: resolved.transport,
      invocation: resolved.invocation,
      certificationContract: resolved.certificationContract,
      bindingDigest: resolved.bindingDigest,
    }
  }).sort((left, right) => compareUtf8Bytes(left.selfProviderId, right.selfProviderId))
  const providerCompatibility = (registry.providers || [])
    .filter((provider) => provider?.providerKind === 'concrete-runtime')
    .map((provider) => ({
      providerId: provider.id,
      compatibilityProviderId: compatibilityProviderIdForAdapter(compatibilityMatrix, provider.id),
    }))
    .sort((left, right) => compareUtf8Bytes(left.providerId, right.providerId))
  const compatibilityIds = new Set(providerCompatibility.map((binding) => binding.compatibilityProviderId))
  const certifications = certificationRecords(certificationLedger)
    .filter((record) => compatibilityIds.has(record.provider) && record.repositoryRole === repositoryRole)
    .sort((left, right) => compareUtf8Bytes(left.id, right.id))
  return {
    schemaVersion: 2,
    kind: 'provider-neutral-independent-review-projection',
    skill,
    repositoryRole,
    certificationContract: EXACT_REVIEW_CERTIFICATION_CONTRACT,
    bindings,
    providerCompatibility,
    certifications,
    projectionDigest: digest({ skill, repositoryRole, bindings, providerCompatibility, certifications }),
  }
}

export function resolveProjectedReviewRequest({
  projection,
  selectionReceipt,
  registry,
  capabilityRegistry,
  capabilityCertificationLedger,
  invocationRegistry,
  modelReleaseRegistry,
  selfProviderId,
  authorProviderId = selfProviderId,
  runtimeKind,
  surface,
  repositoryRole,
  target,
  requiredEntitlementId = null,
  entitlementAvailability = [],
  now = new Date(),
  requireEvidence = true,
} = {}) {
  object(projection, 'REVIEW_PROJECTION_INVALID', 'independent review projection')
  if (projection.schemaVersion !== 2 || projection.kind !== 'provider-neutral-independent-review-projection') {
    block('REVIEW_PROJECTION_INVALID', 'independent review projection identity is invalid')
  }
  if (projection.skill !== 'independent-review' || typeof projection.repositoryRole !== 'string') {
    block('REVIEW_PROJECTION_INVALID', 'independent review projection role or skill is invalid')
  }
  if (projection.projectionDigest !== digest({
    skill: projection.skill,
    repositoryRole: projection.repositoryRole,
    bindings: projection.bindings,
    providerCompatibility: projection.providerCompatibility,
    certifications: projection.certifications,
  })) block('REVIEW_PROJECTION_TAMPERED', 'independent review projection digest mismatches')
  if (projection.certificationContract !== EXACT_REVIEW_CERTIFICATION_CONTRACT) {
    block('REVIEW_CERTIFICATION_CONTRACT_UNAVAILABLE', 'projection certification contract is missing or stale')
  }
  if (repositoryRole !== projection.repositoryRole) {
    block('REVIEW_ROLE_MISMATCH', `${repositoryRole ?? '<missing>'}/${projection.repositoryRole}`)
  }
  if (authorProviderId !== selfProviderId) block('REVIEW_AUTHOR_COLLISION', `${authorProviderId ?? '<missing>'}/${selfProviderId ?? '<missing>'}`)
  const bindings = (projection.bindings || []).filter((binding) => binding?.selfProviderId === selfProviderId)
  if (bindings.length !== 1) block('REVIEW_BINDING_UNAVAILABLE', `${projection.skill}/${selfProviderId ?? '<missing>'}`)
  const binding = bindings[0]
  if (binding.certificationContract !== EXACT_REVIEW_CERTIFICATION_CONTRACT) {
    block('REVIEW_CERTIFICATION_CONTRACT_UNAVAILABLE', `${projection.skill}/${selfProviderId}`)
  }
  if (selectionReceipt === null || selectionReceipt === undefined) {
    return {
      skill: projection.skill,
      authorProviderId,
      currentProviderId: selfProviderId,
      peerProviderId: null,
      reviewProfileId: null,
      modelReleaseId: null,
      requestModelId: null,
      selectionDigest: null,
      selectionPolicy: binding.selectionPolicy,
      reviewClass: binding.reviewClass,
      requiredAssuranceTier: binding.requiredAssuranceTier,
      requiredReasoningTier: binding.requiredReasoningTier,
      requiredComputeTier: binding.requiredComputeTier,
      selectionStatus: 'REVIEW-BLOCKED',
      selectionReasonCode: 'REVIEW_CAPABILITY_SELECTION_REQUIRED',
      transport: binding.transport,
      invocation: binding.invocation,
      certificationContract: binding.certificationContract,
      bindingDigest: binding.bindingDigest,
      certification: null,
    }
  }
  if (binding.selectionPolicy !== selectionReceipt?.selectionPolicy
    || binding.reviewClass !== selectionReceipt?.reviewClass
    || binding.requiredAssuranceTier !== selectionReceipt?.requiredAssuranceTier
    || binding.requiredReasoningTier !== selectionReceipt?.requiredReasoningTier
    || binding.requiredComputeTier !== selectionReceipt?.requiredComputeTier
    || binding.bindingDigest !== selectionReceipt?.bindingDigest) {
    block('REVIEW_SELECTION_BINDING_MISMATCH', `${projection.skill}/${selfProviderId}`)
  }
  verifyReviewCapabilitySelection({
    receipt: selectionReceipt,
    registry,
    capabilityRegistry,
    capabilityCertificationLedger,
    invocationRegistry,
    modelReleaseRegistry,
    skill: projection.skill,
    selfProviderId,
    authorProviderId,
    requiredEntitlementId,
    entitlementAvailability,
    observedProviderId: selectionReceipt.selected?.providerId,
    observedReviewProfileId: selectionReceipt.selected?.reviewProfileId,
    observedModelReleaseId: selectionReceipt.selected?.modelReleaseId,
    observedResponseModelId: selectionReceipt.selected?.requestModelId,
    now,
  })
  if (selectionReceipt.selfProviderId !== selfProviderId
    || selectionReceipt.authorProviderId !== authorProviderId
    || selectionReceipt.skill !== projection.skill) {
    block('REVIEW_SELECTION_BINDING_MISMATCH', `${projection.skill}/${selfProviderId}`)
  }
  const compatibility = (projection.providerCompatibility || [])
    .filter((entry) => entry?.providerId === selectionReceipt.selected.providerId)
  if (compatibility.length !== 1) block('REVIEW_COMPATIBILITY_UNAVAILABLE', selectionReceipt.selected.providerId)
  nonEmpty(binding.transport, 'REVIEW_TRANSPORT_UNAVAILABLE', `${projection.skill}/${selfProviderId} transport`)
  const certification = verifyExactProviderCertification({
    certificationLedger: projection.certifications,
    compatibilityProviderId: compatibility[0].compatibilityProviderId,
    runtimeProviderId: selectionReceipt.selected.providerId,
    runtimeKind,
    surface,
    repositoryRole,
    target,
    now,
    requireEvidence,
  })
  return {
    skill: projection.skill,
    authorProviderId,
    currentProviderId: selfProviderId,
    peerProviderId: selectionReceipt.selected.providerId,
    reviewProfileId: selectionReceipt.selected.reviewProfileId,
    modelReleaseId: selectionReceipt.selected.modelReleaseId,
    requestModelId: selectionReceipt.selected.requestModelId,
    selectionDigest: selectionReceipt.selectionDigest,
    selectionPolicy: selectionReceipt.selectionPolicy,
    reviewClass: selectionReceipt.reviewClass,
    requiredAssuranceTier: selectionReceipt.requiredAssuranceTier,
    requiredReasoningTier: selectionReceipt.requiredReasoningTier,
    requiredComputeTier: selectionReceipt.requiredComputeTier,
    selectionStatus: 'selected',
    selectionReasonCode: null,
    transport: binding.transport,
    invocation: binding.invocation,
    certificationContract: binding.certificationContract,
    bindingDigest: binding.bindingDigest,
    certification,
  }
}

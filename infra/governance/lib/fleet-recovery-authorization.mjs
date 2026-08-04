import { createPrivateKey, sign, verify } from 'node:crypto'
import { deepEqual, invariant, sha256, stableStringify } from './common.mjs'
import { validateAttestationPolicy } from './attestation.mjs'
import {
  issuerRegistryDigest,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
  validateIssuerRegistry,
  validateRegistryPolicyBinding,
} from './issuer-registry.mjs'

const AUTHORIZATION_KEYS = [
  'schemaVersion',
  'kind',
  'operation',
  'transactionId',
  'historicalControlPlaneDigest',
  'journalAuthorizationEnvelopeDigest',
  'journalEventHeadDigest',
  'rollbackPlanDigest',
  'currentInventoryDigest',
  'currentDesiredDigest',
  'currentAttestationPolicyDigest',
  'currentPrivilegedPolicyDigest',
  'issuerRegistryDigest',
  'issuedAt',
  'expiresAt',
  'applySignatures',
  'rootSignatures',
]
const SIGNATURE_KEYS = ['signerKeyId', 'subject', 'signature']
const PRIVILEGED_POLICY_KEYS = [
  '$schema',
  'schemaVersion',
  'repository',
  'algorithm',
  'externalActivationPolicyDigest',
  'authorizationProfileId',
  'authorizationProfileDigest',
  'maxAuthorizationTtlMinutes',
  'clockSkewSeconds',
  'authorizationDirectory',
  'issuerRegistryDigest',
  'allowedKeyIds',
  'protectedPaths',
  'protectedPrefixes',
  'trustRootQuorum',
  'bootstrap',
]
const BOOTSTRAP_KEYS = ['schemaVersion', 'enabled', 'ownerLogins', 'nonce', 'maxCommentTtlMinutes']
const PRODUCTION_PROFILE = 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM'
const MAXIMUM_PROFILE = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
// The retired external-activation catalog fixed these signer-quorum bounds per
// assurance profile; the invariant survives here as plain data.
const PROFILE_RELEASE_AUTHORIZATION = Object.freeze({
  [PRODUCTION_PROFILE]: Object.freeze({ minimumSignerQuorum: 1, maximumSignerQuorum: 1 }),
  [MAXIMUM_PROFILE]: Object.freeze({ minimumSignerQuorum: 2, maximumSignerQuorum: 5 }),
})

const clone = value => JSON.parse(JSON.stringify(value))
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')

export function normalizeHistoricalControlPlane({ inventory, desired, attestationPolicy, issuerRegistry }) {
  return JSON.parse(stableStringify({
    schemaVersion: 1,
    inventory: clone(inventory),
    desired: clone(desired),
    attestationPolicy: clone(attestationPolicy),
    issuerRegistry: clone(issuerRegistry),
  }, 0))
}

export function historicalControlPlaneDigest(bundle) {
  return sha256(stableStringify(bundle, 0))
}

export function validateHistoricalControlPlane(bundle) {
  invariant(exactKeys(bundle, ['schemaVersion', 'inventory', 'desired', 'attestationPolicy', 'issuerRegistry']), 'Historical control-plane bundle has an invalid or open shape')
  invariant(bundle.schemaVersion === 1, 'Historical control-plane bundle schemaVersion must be 1')
  validateIssuerRegistry(bundle.issuerRegistry)
  return true
}

function validatePrivilegedPolicy(policy, registry, now) {
  invariant(exactKeys(policy, PRIVILEGED_POLICY_KEYS), 'Current privileged trust-root policy has an invalid or open shape')
  invariant(policy.$schema === 'schemas/privileged-trust-roots.schema.json', 'Current privileged trust-root policy schema reference is invalid')
  invariant(policy.schemaVersion === 2 && policy.algorithm === 'ed25519', 'Current privileged trust-root policy version/algorithm is invalid')
  invariant(typeof policy.repository === 'string' && /^[^/]+\/[^/]+$/.test(policy.repository), 'Current privileged trust-root repository is invalid')
  invariant(Number.isInteger(policy.maxAuthorizationTtlMinutes) && policy.maxAuthorizationTtlMinutes >= 1 && policy.maxAuthorizationTtlMinutes <= 1440, 'Current privileged authorization TTL is invalid')
  invariant(Number.isInteger(policy.clockSkewSeconds) && policy.clockSkewSeconds >= 0 && policy.clockSkewSeconds <= 300, 'Current privileged authorization clock skew is invalid')
  invariant(Number.isInteger(policy.trustRootQuorum) && policy.trustRootQuorum >= 1 && policy.trustRootQuorum <= 5, 'Current privileged trust-root quorum is invalid')
  invariant(/^[a-f0-9]{64}$/.test(policy.externalActivationPolicyDigest ?? ''), 'Current privileged trust-root external activation policy digest is invalid')
  invariant(policy.authorizationProfileId === PRODUCTION_PROFILE || policy.authorizationProfileId === MAXIMUM_PROFILE,
    `Current privileged trust-root profile is unknown: ${policy.authorizationProfileId}`)
  invariant(/^[a-f0-9]{64}$/.test(policy.authorizationProfileDigest ?? ''), 'Current privileged trust-root profile digest is invalid')
  const profile = { id: policy.authorizationProfileId, releaseAuthorization: PROFILE_RELEASE_AUTHORIZATION[policy.authorizationProfileId] }
  invariant(
    policy.trustRootQuorum >= profile.releaseAuthorization.minimumSignerQuorum
      && policy.trustRootQuorum <= profile.releaseAuthorization.maximumSignerQuorum
      && (
        profile.releaseAuthorization.minimumSignerQuorum !== profile.releaseAuthorization.maximumSignerQuorum
        || policy.trustRootQuorum === profile.releaseAuthorization.minimumSignerQuorum
      ),
    `Current privileged trust-root quorum is invalid for profile ${profile.id}`,
  )
  invariant(exactKeys(policy.bootstrap, BOOTSTRAP_KEYS) && policy.bootstrap.schemaVersion === 1, 'Current privileged bootstrap policy has an invalid or open shape')
  invariant(policy.bootstrap.enabled === false, 'Fleet rollback is unavailable while privileged trust bootstrap remains open')
  for (const field of ['allowedKeyIds', 'protectedPaths', 'protectedPrefixes']) {
    invariant(Array.isArray(policy[field]) && new Set(policy[field]).size === policy[field].length, `Current privileged ${field} must contain unique values`)
  }
  const privilegedBinding = validateRegistryPolicyBinding(policy, registry, {
    role: 'privileged-change-authorizer',
    quorum: profile.id === PRODUCTION_PROFILE ? 1 : policy.trustRootQuorum,
    now,
    allowUnactivated: false,
  })
  const rootBinding = validateRegistryPolicyBinding(policy, registry, {
    role: 'root-rotator',
    quorum: policy.trustRootQuorum,
    now,
    allowUnactivated: false,
  })
  if (profile.id === PRODUCTION_PROFILE) {
    invariant(
      policy.allowedKeyIds.length === 1
        && privilegedBinding.eligible.length === 1
        && rootBinding.eligible.length === 1
        && privilegedBinding.eligible[0].keyId === rootBinding.eligible[0].keyId,
      'Single-owner production profile requires exactly one governed key carrying both privileged-change-authorizer and root-rotator roles',
    )
  }
  return profile
}

export function fleetRecoveryAuthorizationPayload(authorization) {
  invariant(exactKeys(authorization, AUTHORIZATION_KEYS), 'Fleet recovery authorization has an invalid or open shape')
  const unsigned = clone(authorization)
  delete unsigned.applySignatures
  delete unsigned.rootSignatures
  return Buffer.from(stableStringify(unsigned, 0), 'utf8')
}

export function createFleetRecoveryAuthorization({
  transactionId,
  historicalControlPlaneDigest: historicalDigest,
  journalAuthorizationEnvelopeDigest,
  journalEventHeadDigest,
  rollbackPlanDigest,
  inventory,
  desired,
  attestationPolicy,
  privilegedPolicy,
  issuerRegistry,
  issuedAt,
  expiresAt,
}) {
  return {
    schemaVersion: 2,
    kind: 'fleet-recovery-authorization',
    operation: 'rollback',
    transactionId,
    historicalControlPlaneDigest: historicalDigest,
    journalAuthorizationEnvelopeDigest,
    journalEventHeadDigest,
    rollbackPlanDigest,
    currentInventoryDigest: sha256(stableStringify(inventory, 0)),
    currentDesiredDigest: sha256(stableStringify(desired, 0)),
    currentAttestationPolicyDigest: sha256(stableStringify(attestationPolicy, 0)),
    currentPrivilegedPolicyDigest: sha256(stableStringify(privilegedPolicy, 0)),
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    issuedAt,
    expiresAt,
    applySignatures: [],
    rootSignatures: [],
  }
}

export function signFleetRecoveryAuthorization(authorization, {
  signerKeyId,
  subject,
  privateKey,
  gates,
}) {
  invariant(Array.isArray(gates)
    && gates.length === 1
    && (gates[0] === 'apply' || gates[0] === 'root'), 'Fleet recovery signer must authorize exactly one disjoint gate')
  const key = privateKey?.type === 'private' ? privateKey : createPrivateKey(privateKey)
  invariant(key.asymmetricKeyType === 'ed25519', 'Fleet recovery authorization private key must be Ed25519')
  const signature = sign(null, fleetRecoveryAuthorizationPayload(authorization), key).toString('base64url')
  for (const gate of new Set(gates)) {
    const field = gate === 'apply' ? 'applySignatures' : 'rootSignatures'
    invariant(!authorization[field].some(item => item.signerKeyId === signerKeyId), `Duplicate ${gate} signer ${signerKeyId}`)
    authorization[field].push({ signerKeyId, subject, signature })
  }
  return authorization
}

function canonicalTime(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be a canonical UTC timestamp`)
  return parsed
}

function verifyGate({ authorization, signatures, field, policy, registry, role, quorum, issuedAt, expiresAt, now }) {
  invariant(Array.isArray(signatures) && signatures.every(item => exactKeys(item, SIGNATURE_KEYS)), `Fleet recovery ${field} have an invalid or open shape`)
  invariant(new Set(signatures.map(item => item.signerKeyId)).size === signatures.length, `Fleet recovery ${field} signers must be distinct`)
  invariant(new Set(signatures.map(item => item.subject)).size === signatures.length, `Fleet recovery ${field} signer subjects must be distinct`)
  const payload = fleetRecoveryAuthorizationPayload(authorization)
  let verified = 0
  for (const item of signatures) {
    const issuer = resolvePolicyIssuer(policy, registry, item.signerKeyId, { role, at: issuedAt, validThrough: expiresAt })
    resolvePolicyIssuer(policy, registry, item.signerKeyId, { role, at: now, validThrough: now })
    invariant(issuer.subject === item.subject, `Fleet recovery ${field} signer subject mismatch for ${item.signerKeyId}`)
    invariant(/^[A-Za-z0-9_-]+$/.test(item.signature ?? ''), `Fleet recovery ${field} signature encoding is invalid`)
    const signature = Buffer.from(item.signature, 'base64url')
    invariant(signature.length === 64 && signature.toString('base64url') === item.signature, `Fleet recovery ${field} signature encoding is not canonical Ed25519 base64url`)
    invariant(verify(null, payload, publicKeyFromIssuer(issuer), signature), `Fleet recovery ${field} signature is invalid for ${item.signerKeyId}`)
    verified += 1
  }
  invariant(verified >= quorum, `Fleet recovery ${field} lack required current ${role} quorum ${quorum}`)
}

export function verifyFleetRecoveryAuthorization(authorization, {
  journal,
  inventory,
  desired,
  attestationPolicy,
  privilegedPolicy,
  issuerRegistry,
  expectedJournalEventHeadDigest = journal.eventHeadDigest,
  now = new Date(),
}) {
  invariant(exactKeys(authorization, AUTHORIZATION_KEYS), 'Fleet recovery authorization has an invalid or open shape')
  invariant(authorization.schemaVersion === 2 && authorization.kind === 'fleet-recovery-authorization' && authorization.operation === 'rollback', 'Fleet recovery authorization identity is invalid')
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'Fleet recovery authorization verification time is invalid')
  validateIssuerRegistry(issuerRegistry)
  validateAttestationPolicy(attestationPolicy, { issuerRegistry, now, allowUnactivated: false })
  const privilegedProfile = validatePrivilegedPolicy(privilegedPolicy, issuerRegistry, now)
  invariant(attestationPolicy.issuerRegistryDigest === privilegedPolicy.issuerRegistryDigest, 'Current apply and privileged policies do not share one issuer registry')
  const authorities = inventory?.repositories?.filter(repository => repository.role === 'authority') ?? []
  invariant(authorities.length === 1 && privilegedPolicy.repository === authorities[0].github, 'Current privileged trust-root policy is not scoped to the sole inventory authority repository')

  const expected = {
    transactionId: journal.transactionId,
    historicalControlPlaneDigest: journal.historicalControlPlaneDigest,
    journalAuthorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
    journalEventHeadDigest: expectedJournalEventHeadDigest,
    rollbackPlanDigest: journal.rollbackPlanDigest,
    currentInventoryDigest: sha256(stableStringify(inventory, 0)),
    currentDesiredDigest: sha256(stableStringify(desired, 0)),
    currentAttestationPolicyDigest: sha256(stableStringify(attestationPolicy, 0)),
    currentPrivilegedPolicyDigest: sha256(stableStringify(privilegedPolicy, 0)),
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
  }
  for (const [field, value] of Object.entries(expected)) invariant(deepEqual(authorization[field], value), `Fleet recovery authorization ${field} mismatch`)

  const issuedAt = canonicalTime(authorization.issuedAt, 'Fleet recovery authorization issuedAt')
  const expiresAt = canonicalTime(authorization.expiresAt, 'Fleet recovery authorization expiresAt')
  invariant(expiresAt > issuedAt && expiresAt > now, 'Fleet recovery authorization is expired or has an invalid time window')
  for (const [label, policy] of [['apply', attestationPolicy], ['privileged', privilegedPolicy]]) {
    invariant(expiresAt.getTime() - issuedAt.getTime() <= policy.maxAuthorizationTtlMinutes * 60 * 1000, `Fleet recovery authorization exceeds current ${label} policy TTL`)
    invariant(issuedAt.getTime() <= now.getTime() + policy.clockSkewSeconds * 1000, `Fleet recovery authorization is issued in the future under current ${label} policy`)
  }

  verifyGate({
    authorization,
    signatures: authorization.applySignatures,
    field: 'applySignatures',
    policy: attestationPolicy,
    registry: issuerRegistry,
    role: 'apply-authorizer',
    quorum: attestationPolicy.applyAuthorizationQuorum,
    issuedAt,
    expiresAt,
    now,
  })
  verifyGate({
    authorization,
    signatures: authorization.rootSignatures,
    field: 'rootSignatures',
    policy: privilegedPolicy,
    registry: issuerRegistry,
    role: 'root-rotator',
    quorum: privilegedPolicy.trustRootQuorum,
    issuedAt,
    expiresAt,
    now,
  })
  const applyKeys = new Set(authorization.applySignatures.map(item => item.signerKeyId))
  const applySubjects = new Set(authorization.applySignatures.map(item => item.subject))
  if (privilegedProfile.id === MAXIMUM_PROFILE) {
    invariant(
      authorization.rootSignatures.every(item => !applyKeys.has(item.signerKeyId) && !applySubjects.has(item.subject)),
      'Maximum-assurance fleet recovery apply and root quorums must use disjoint signer keys and subjects',
    )
  }
  return true
}

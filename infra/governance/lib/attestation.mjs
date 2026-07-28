import { createPrivateKey, sign, verify } from 'node:crypto'
import { invariant, sha256, stableStringify } from './common.mjs'
import {
  issuerRegistryDigest as computeIssuerRegistryDigest,
  loadIssuerRegistry,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
  validateRegistryPolicyBinding,
} from './issuer-registry.mjs'

const ATTESTATION_KINDS = new Set(['apply-authorization', 'readback-completion'])
const ATTESTATION_ROLES = new Map([
  ['apply-authorization', 'apply-authorizer'],
  ['readback-completion', 'completion-attestor'],
])
const ATTESTATION_KEYS = [
  'schemaVersion',
  'kind',
  'repoId',
  'github',
  'ring',
  'wave',
  'candidateRelease',
  'verifiedReleaseEvidenceDigest',
  'candidatePlanDigest',
  'predicateDigest',
  'stateDigest',
  'defaultBranchHeadSha',
  'actionsDigest',
  'issuerRegistryDigest',
  'issuedAt',
  'expiresAt',
  'signerKeyId',
  'subject',
  'signature',
  'coSignatures',
]
const COSIGNATURE_KEYS = ['signerKeyId', 'subject', 'signature']

const clone = value => JSON.parse(JSON.stringify(value))
const isSha256 = value => /^[a-f0-9]{64}$/.test(value ?? '')
const isCommitSha = value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value ?? '')

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function dateValue(value) {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function payload(attestation) {
  const unsigned = clone(attestation)
  delete unsigned.signature
  delete unsigned.coSignatures
  return Buffer.from(stableStringify(unsigned, 0), 'utf8')
}

export function attestationDigest(attestation) {
  return sha256(stableStringify(attestation, 0))
}

export function validateAttestationPolicy(policy, {
  issuerRegistry = loadIssuerRegistry(),
  now = new Date(),
  allowUnactivated = true,
} = {}) {
  invariant(exactKeys(policy, [
    'schemaVersion',
    'algorithm',
    'maxAuthorizationTtlMinutes',
    'maxCompletionTtlMinutes',
    'clockSkewSeconds',
    'issuerRegistryDigest',
    'allowedKeyIds',
    'applyAuthorizationQuorum',
    'completionAttestationQuorum',
  ]), 'Attestation policy has an invalid or open shape')
  invariant(policy.schemaVersion === 1, 'Attestation policy schemaVersion must be 1')
  invariant(policy.algorithm === 'ed25519', 'Attestation policy algorithm must be ed25519')
  invariant(Number.isInteger(policy.maxAuthorizationTtlMinutes) && policy.maxAuthorizationTtlMinutes >= 1 && policy.maxAuthorizationTtlMinutes <= 1440, 'Attestation authorization TTL must be between 1 and 1440 minutes')
  invariant(Number.isInteger(policy.maxCompletionTtlMinutes) && policy.maxCompletionTtlMinutes >= 1 && policy.maxCompletionTtlMinutes <= 10080, 'Attestation completion TTL must be between 1 and 10080 minutes')
  invariant(Number.isInteger(policy.clockSkewSeconds) && policy.clockSkewSeconds >= 0 && policy.clockSkewSeconds <= 300, 'Attestation clock skew must be between 0 and 300 seconds')
  invariant(Number.isInteger(policy.applyAuthorizationQuorum) && policy.applyAuthorizationQuorum >= 1 && policy.applyAuthorizationQuorum <= 5, 'Apply authorization quorum must be between 1 and 5')
  invariant(Number.isInteger(policy.completionAttestationQuorum) && policy.completionAttestationQuorum >= 1 && policy.completionAttestationQuorum <= 5, 'Completion attestation quorum must be between 1 and 5')
  validateRegistryPolicyBinding(policy, issuerRegistry, { role: 'apply-authorizer', quorum: policy.applyAuthorizationQuorum, now, allowUnactivated })
  validateRegistryPolicyBinding(policy, issuerRegistry, { role: 'completion-attestor', quorum: policy.completionAttestationQuorum, now, allowUnactivated })
  return true
}

export function issueSignedAttestation({
  kind,
  repoId,
  github,
  ring,
  wave,
  candidateRelease,
  verifiedReleaseEvidenceDigest,
  candidatePlanDigest,
  predicateDigest,
  stateDigest,
  defaultBranchHeadSha,
  actionsDigest,
  issuerRegistryDigest,
  signerKeyId,
  subject,
  privateKey,
  issuedAt = new Date().toISOString(),
  expiresAt,
}) {
  invariant(ATTESTATION_KINDS.has(kind), `Unknown attestation kind ${kind}`)
  invariant(candidateRelease && typeof candidateRelease === 'object' && !Array.isArray(candidateRelease), 'Signed attestation requires a candidate release')
  for (const [name, value] of Object.entries({ verifiedReleaseEvidenceDigest, candidatePlanDigest, predicateDigest, stateDigest, actionsDigest, issuerRegistryDigest })) invariant(isSha256(value), `Signed attestation ${name} is invalid`)
  invariant(isCommitSha(defaultBranchHeadSha), 'Signed attestation defaultBranchHeadSha is invalid')
  invariant(typeof signerKeyId === 'string' && signerKeyId.trim() !== '', 'Signed attestation signerKeyId is missing')
  invariant(typeof subject === 'string' && subject.trim() !== '', 'Signed attestation subject is missing')
  invariant(dateValue(issuedAt), 'Signed attestation issuedAt is invalid')
  invariant(dateValue(expiresAt) && new Date(expiresAt) > new Date(issuedAt), 'Signed attestation expiresAt is invalid')
  const attestation = {
    schemaVersion: 1,
    kind,
    repoId,
    github,
    ring,
    wave,
    candidateRelease: clone(candidateRelease),
    verifiedReleaseEvidenceDigest,
    candidatePlanDigest,
    predicateDigest,
    stateDigest,
    defaultBranchHeadSha,
    actionsDigest,
    issuerRegistryDigest,
    issuedAt,
    expiresAt,
    signerKeyId,
    subject,
    signature: '',
    coSignatures: [],
  }
  const key = typeof privateKey === 'object' && privateKey?.type === 'private' ? privateKey : createPrivateKey(privateKey)
  invariant(key.asymmetricKeyType === 'ed25519', 'Signed attestation private key must be Ed25519')
  attestation.signature = sign(null, payload(attestation), key).toString('base64url')
  return attestation
}

export function cosignSignedAttestation(attestation, { signerKeyId, subject, privateKey }) {
  invariant(exactKeys(attestation, ATTESTATION_KEYS), 'Signed attestation has an invalid or open shape')
  invariant(![attestation.signerKeyId, ...attestation.coSignatures.map(item => item.signerKeyId)].includes(signerKeyId), 'Signed attestation cosigner must be distinct')
  invariant(![attestation.subject, ...attestation.coSignatures.map(item => item.subject)].includes(subject), 'Signed attestation cosigner subject must be distinct')
  const key = typeof privateKey === 'object' && privateKey?.type === 'private' ? privateKey : createPrivateKey(privateKey)
  invariant(key.asymmetricKeyType === 'ed25519', 'Signed attestation private key must be Ed25519')
  attestation.coSignatures.push({ signerKeyId, subject, signature: sign(null, payload(attestation), key).toString('base64url') })
  return attestation
}

export function verifySignedAttestation(attestation, policy, expected = {}, {
  now = new Date(),
  issuerRegistry = loadIssuerRegistry(),
} = {}) {
  const failures = []
  try {
    validateAttestationPolicy(policy, { issuerRegistry, now })
  } catch (error) {
    return { valid: false, failures: [`attestation trust policy is invalid: ${error.message}`] }
  }
  if (!exactKeys(attestation, ATTESTATION_KEYS)) return { valid: false, failures: ['attestation has an invalid or open shape'] }
  if (attestation.schemaVersion !== 1) failures.push('attestation schemaVersion must be 1')
  if (!ATTESTATION_KINDS.has(attestation.kind)) failures.push('attestation kind is invalid')
  const role = ATTESTATION_ROLES.get(attestation.kind)
  const issuedAt = dateValue(attestation.issuedAt)
  const expiresAt = dateValue(attestation.expiresAt)
  const current = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date(Number.NaN)
  if (!issuedAt) failures.push('attestation issuedAt is invalid')
  if (!expiresAt) failures.push('attestation expiresAt is invalid')
  if (!Number.isFinite(current.getTime())) failures.push('attestation verification time is invalid')
  if (issuedAt && expiresAt) {
    if (expiresAt <= issuedAt) failures.push('attestation expiry must be after issuance')
    const maxMinutes = attestation.kind === 'apply-authorization' ? policy.maxAuthorizationTtlMinutes : policy.maxCompletionTtlMinutes
    if (expiresAt.getTime() - issuedAt.getTime() > maxMinutes * 60 * 1000) failures.push('attestation validity exceeds policy TTL')
    if (Number.isFinite(current.getTime()) && issuedAt.getTime() > current.getTime() + policy.clockSkewSeconds * 1000) failures.push('attestation was issued in the future')
    if (Number.isFinite(current.getTime()) && expiresAt <= current) failures.push('attestation is expired')
  }

  if (attestation.issuerRegistryDigest !== policy.issuerRegistryDigest || attestation.issuerRegistryDigest !== computeIssuerRegistryDigest(issuerRegistry)) failures.push('attestation issuerRegistryDigest mismatch')
  if (!Array.isArray(attestation.coSignatures) || !attestation.coSignatures.every(item => exactKeys(item, COSIGNATURE_KEYS))) failures.push('attestation cosignatures have an invalid shape')
  const signatures = Array.isArray(attestation.coSignatures)
    ? [{ signerKeyId: attestation.signerKeyId, subject: attestation.subject, signature: attestation.signature }, ...attestation.coSignatures]
    : []
  if (new Set(signatures.map(item => item.signerKeyId)).size !== signatures.length) failures.push('attestation signers must be distinct')
  if (new Set(signatures.map(item => item.subject)).size !== signatures.length) failures.push('attestation signer subjects must be distinct')
  let verifiedCount = 0
  for (const item of signatures) {
    try {
      invariant(issuedAt && expiresAt, 'attestation time window is invalid')
      const issuer = resolvePolicyIssuer(policy, issuerRegistry, item.signerKeyId, { role, at: issuedAt, validThrough: expiresAt })
      invariant(issuer.subject === item.subject, 'attestation subject does not match the registered issuer')
      invariant(/^[A-Za-z0-9_-]+$/.test(item.signature ?? ''), 'attestation signature is invalid')
      const signature = Buffer.from(item.signature, 'base64url')
      invariant(signature.length === 64 && signature.toString('base64url') === item.signature, 'attestation signature encoding is not canonical Ed25519 base64url')
      invariant(verify(null, payload(attestation), publicKeyFromIssuer(issuer), signature), 'attestation signature is invalid')
      resolvePolicyIssuer(policy, issuerRegistry, item.signerKeyId, { role, at: current, validThrough: current })
      verifiedCount += 1
    } catch (error) {
      failures.push(error.message)
    }
  }
  const requiredQuorum = attestation.kind === 'apply-authorization' ? policy.applyAuthorizationQuorum : policy.completionAttestationQuorum
  if (verifiedCount < requiredQuorum) failures.push(`attestation lacks required ${role} quorum ${requiredQuorum}`)

  for (const [field, value] of Object.entries(expected)) {
    if (value === undefined) continue
    const matches = field === 'candidateRelease'
      ? sha256(stableStringify(attestation[field], 0)) === sha256(stableStringify(value, 0))
      : attestation[field] === value
    if (!matches) failures.push(`attestation ${field} mismatch`)
  }
  for (const field of ['verifiedReleaseEvidenceDigest', 'candidatePlanDigest', 'predicateDigest', 'stateDigest', 'actionsDigest', 'issuerRegistryDigest']) if (!isSha256(attestation[field])) failures.push(`attestation ${field} is invalid`)
  if (!isCommitSha(attestation.defaultBranchHeadSha)) failures.push('attestation defaultBranchHeadSha is invalid')
  return {
    valid: failures.length === 0,
    failures: [...new Set(failures)],
    signers: signatures.map(item => ({ keyId: item.signerKeyId, subject: item.subject, role })),
  }
}

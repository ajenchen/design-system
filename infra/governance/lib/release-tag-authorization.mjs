import { createPrivateKey, sign, verify } from 'node:crypto'
import { compareUtf8Bytes, invariant, sha256, stableStringify } from './common.mjs'
import {
  issuerRegistryDigest,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
  validateIssuerRegistry,
  validateRegistryPolicyBinding,
} from './issuer-registry.mjs'
import {
  EXTERNAL_ACTIVATION_POLICY_DIGEST,
  externalActivationPolicyDigest,
  loadExternalActivationPolicy,
  resolveExternalActivationProfile,
} from './external-activation.mjs'

const POLICY_KEYS = [
  '$schema',
  'schemaVersion',
  'repository',
  'algorithm',
  'externalActivationPolicyDigest',
  'authorizationProfileId',
  'authorizationProfileDigest',
  'releaseAuthorization',
  'maxAuthorizationTtlMinutes',
  'clockSkewSeconds',
  'issuerRegistryDigest',
  'allowedKeyIds',
  'requiredSignerQuorum',
]
const AUTHORIZATION_KEYS = [
  'schemaVersion',
  'kind',
  'repository',
  'tag',
  'tagObject',
  'commit',
  'tree',
  'issuerRegistryDigest',
  'policyDigest',
  'externalActivationPolicyDigest',
  'authorizationProfileId',
  'authorizationProfileDigest',
  'releaseAuthorization',
  'issuedAt',
  'expiresAt',
  'nonce',
  'authorizationDigest',
  'signatures',
]
const SIGNATURE_KEYS = ['signerKeyId', 'subject', 'signature']
const SHA1 = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const RELEASE_TAG = /^v\d+\.\d+\.\d+(?:-(?:beta|next|rc)\.\d+)?$/
const NONCE = /^[A-Za-z0-9_-]{32,128}$/
const RELEASE_AUTHORIZATION_KEYS = ['minimumSignerQuorum', 'maximumSignerQuorum']
const clone = value => JSON.parse(JSON.stringify(value))
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')

function resolveReleaseTagAuthorizationProfile(policy, {
  externalActivationPolicy = loadExternalActivationPolicy(),
  expectedExternalActivationPolicyDigest = EXTERNAL_ACTIVATION_POLICY_DIGEST,
} = {}) {
  invariant(
    policy.externalActivationPolicyDigest === expectedExternalActivationPolicyDigest
      && externalActivationPolicyDigest(externalActivationPolicy) === expectedExternalActivationPolicyDigest,
    'Release-tag authorization policy is bound to another external activation policy',
  )
  const profile = resolveExternalActivationProfile(externalActivationPolicy, {
    expectedPolicyDigest: expectedExternalActivationPolicyDigest,
  })
  invariant(policy.authorizationProfileId === profile.id, 'Release-tag authorization policy profile differs from the active canonical profile')
  invariant(policy.authorizationProfileDigest === profile.sha256, 'Release-tag authorization policy profile digest is stale or substituted')
  invariant(
    exactKeys(policy.releaseAuthorization, RELEASE_AUTHORIZATION_KEYS)
      && stableStringify(policy.releaseAuthorization, 0) === stableStringify(profile.releaseAuthorization, 0),
    'Release-tag authorization policy releaseAuthorization range is stale or substituted',
  )
  return profile
}

// Compatibility projection for existing release/staged callers. The profile
// bytes and digest are owned only by external-activation-policy.json.
export function releaseTagAuthorizationProfileDigest(profileId, {
  externalActivationPolicy = loadExternalActivationPolicy(),
  expectedExternalActivationPolicyDigest = EXTERNAL_ACTIVATION_POLICY_DIGEST,
} = {}) {
  return resolveExternalActivationProfile(externalActivationPolicy, {
    expectedPolicyDigest: expectedExternalActivationPolicyDigest,
    profileId,
  }).sha256
}

function canonicalTime(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be a canonical UTC timestamp`)
  return parsed
}

function validatePolicyShape(policy, profileOptions = {}) {
  invariant(exactKeys(policy, POLICY_KEYS), 'Release-tag authorization policy has an invalid or open shape')
  invariant(policy.$schema === 'schemas/release-tag-authorization-policy.schema.json', 'Release-tag authorization policy schema reference is invalid')
  invariant(policy.schemaVersion === 2 && policy.algorithm === 'ed25519', 'Release-tag authorization policy version/algorithm is invalid')
  invariant(typeof policy.repository === 'string' && /^[^/]+\/[^/]+$/.test(policy.repository), 'Release-tag authorization policy repository is invalid')
  const profile = resolveReleaseTagAuthorizationProfile(policy, profileOptions)
  invariant(Number.isInteger(policy.maxAuthorizationTtlMinutes) && policy.maxAuthorizationTtlMinutes >= 1 && policy.maxAuthorizationTtlMinutes <= 1440, 'Release-tag authorization policy TTL is invalid')
  invariant(Number.isInteger(policy.clockSkewSeconds) && policy.clockSkewSeconds >= 0 && policy.clockSkewSeconds <= 300, 'Release-tag authorization policy clock skew is invalid')
  invariant(typeof policy.issuerRegistryDigest === 'string' && SHA256.test(policy.issuerRegistryDigest), 'Release-tag authorization policy issuer registry digest is invalid')
  invariant(Array.isArray(policy.allowedKeyIds) && new Set(policy.allowedKeyIds).size === policy.allowedKeyIds.length, 'Release-tag authorization policy allowedKeyIds must be unique')
  invariant(policy.allowedKeyIds.every(keyId => /^[a-z0-9][a-z0-9._-]*$/.test(keyId)), 'Release-tag authorization policy contains an invalid key ID')
  invariant(
    Number.isInteger(policy.requiredSignerQuorum)
      && policy.requiredSignerQuorum >= profile.releaseAuthorization.minimumSignerQuorum
      && policy.requiredSignerQuorum <= profile.releaseAuthorization.maximumSignerQuorum
      && (
        profile.releaseAuthorization.minimumSignerQuorum !== profile.releaseAuthorization.maximumSignerQuorum
        || policy.requiredSignerQuorum === profile.releaseAuthorization.minimumSignerQuorum
      ),
    `Release-tag authorization policy quorum is invalid for profile ${profile.id}`,
  )
  return true
}

export function releaseTagAuthorizationPolicyDigest(policy, profileOptions = {}) {
  validatePolicyShape(policy, profileOptions)
  return sha256(stableStringify(policy, 0))
}

export function validateReleaseTagAuthorizationPolicy(policy, {
  issuerRegistry,
  now = new Date(),
  allowUnactivated = true,
  externalActivationPolicy,
  expectedExternalActivationPolicyDigest = EXTERNAL_ACTIVATION_POLICY_DIGEST,
} = {}) {
  validatePolicyShape(policy, { externalActivationPolicy, expectedExternalActivationPolicyDigest })
  if (issuerRegistry) {
    const binding = validateRegistryPolicyBinding(policy, issuerRegistry, {
      role: 'release-tag-authorizer',
      quorum: policy.requiredSignerQuorum,
      now,
      allowUnactivated,
    })
    invariant(
      binding.eligible.every(issuer => issuer.roles.length === 1 && issuer.roles[0] === 'release-tag-authorizer'),
      'Release-tag authorization keys must have only the release-tag-authorizer role',
    )
  }
  return true
}

function authorizationStatement(authorization) {
  invariant(exactKeys(authorization, AUTHORIZATION_KEYS), 'Release-tag authorization has an invalid or open shape')
  const statement = clone(authorization)
  delete statement.authorizationDigest
  delete statement.signatures
  return statement
}

export function releaseTagAuthorizationPayload(authorization) {
  const statement = authorizationStatement(authorization)
  invariant(typeof authorization.authorizationDigest === 'string' && SHA256.test(authorization.authorizationDigest), 'Release-tag authorization digest is invalid')
  return Buffer.from(stableStringify({ ...statement, authorizationDigest: authorization.authorizationDigest }, 0), 'utf8')
}

export function createReleaseTagAuthorization({
  repository,
  tag,
  tagObject,
  commit,
  tree,
  policy,
  issuerRegistry,
  issuedAt,
  expiresAt,
  nonce,
  externalActivationPolicy,
  expectedExternalActivationPolicyDigest = EXTERNAL_ACTIVATION_POLICY_DIGEST,
}) {
  const profileOptions = { externalActivationPolicy, expectedExternalActivationPolicyDigest }
  validateReleaseTagAuthorizationPolicy(policy, {
    issuerRegistry,
    allowUnactivated: true,
    ...profileOptions,
  })
  const authorization = {
    schemaVersion: 2,
    kind: 'release-tag-authorization',
    repository,
    tag,
    tagObject,
    commit,
    tree,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    policyDigest: releaseTagAuthorizationPolicyDigest(policy, profileOptions),
    externalActivationPolicyDigest: policy.externalActivationPolicyDigest,
    authorizationProfileId: policy.authorizationProfileId,
    authorizationProfileDigest: policy.authorizationProfileDigest,
    releaseAuthorization: clone(policy.releaseAuthorization),
    issuedAt,
    expiresAt,
    nonce,
    authorizationDigest: '',
    signatures: [],
  }
  authorization.authorizationDigest = sha256(stableStringify(authorizationStatement(authorization), 0))
  return authorization
}

export function signReleaseTagAuthorization(authorization, {
  signerKeyId,
  subject,
  privateKey,
}) {
  const key = privateKey?.type === 'private' ? privateKey : createPrivateKey(privateKey)
  invariant(key.asymmetricKeyType === 'ed25519', 'Release-tag authorization private key must be Ed25519')
  invariant(!authorization.signatures.some(item => item.signerKeyId === signerKeyId), `Duplicate release-tag authorization signer ${signerKeyId}`)
  invariant(!authorization.signatures.some(item => item.subject === subject), `Duplicate release-tag authorization signer subject ${subject}`)
  const signature = sign(null, releaseTagAuthorizationPayload(authorization), key).toString('base64url')
  authorization.signatures.push({ signerKeyId, subject, signature })
  authorization.signatures.sort((left, right) => compareUtf8Bytes(left.signerKeyId, right.signerKeyId))
  return authorization
}

function validateAuthorizationIdentity(authorization) {
  invariant(exactKeys(authorization, AUTHORIZATION_KEYS), 'Release-tag authorization has an invalid or open shape')
  invariant(authorization.schemaVersion === 2 && authorization.kind === 'release-tag-authorization', 'Release-tag authorization identity is invalid')
  invariant(typeof authorization.repository === 'string' && /^[^/]+\/[^/]+$/.test(authorization.repository), 'Release-tag authorization repository is invalid')
  invariant(RELEASE_TAG.test(authorization.tag || ''), 'Release-tag authorization tag is invalid')
  for (const field of ['tagObject', 'commit', 'tree']) invariant(SHA1.test(authorization[field] || ''), `Release-tag authorization ${field} is invalid`)
  invariant(
    SHA256.test(authorization.issuerRegistryDigest || '')
      && SHA256.test(authorization.policyDigest || '')
      && SHA256.test(authorization.externalActivationPolicyDigest || '')
      && SHA256.test(authorization.authorizationProfileDigest || ''),
    'Release-tag authorization policy/registry/profile binding is invalid',
  )
  invariant(exactKeys(authorization.releaseAuthorization, RELEASE_AUTHORIZATION_KEYS), 'Release-tag authorization releaseAuthorization range has an invalid or open shape')
  invariant(NONCE.test(authorization.nonce || ''), 'Release-tag authorization nonce is invalid')
  invariant(Array.isArray(authorization.signatures) && authorization.signatures.every(item => exactKeys(item, SIGNATURE_KEYS)), 'Release-tag authorization signatures have an invalid or open shape')
  invariant(new Set(authorization.signatures.map(item => item.signerKeyId)).size === authorization.signatures.length, 'Release-tag authorization signers must be distinct')
  invariant(new Set(authorization.signatures.map(item => item.subject)).size === authorization.signatures.length, 'Release-tag authorization signer subjects must be distinct')
  const sorted = [...authorization.signatures].sort((left, right) => compareUtf8Bytes(left.signerKeyId, right.signerKeyId))
  invariant(stableStringify(sorted, 0) === stableStringify(authorization.signatures, 0), 'Release-tag authorization signatures must be sorted by signerKeyId')
}

export function validateReleaseTagAuthorizationEnvelope(authorization, {
  expected,
  policy,
  issuerRegistry,
  now = new Date(),
  externalActivationPolicy,
  expectedExternalActivationPolicyDigest = EXTERNAL_ACTIVATION_POLICY_DIGEST,
}) {
  validateAuthorizationIdentity(authorization)
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'Release-tag authorization verification time is invalid')
  validateIssuerRegistry(issuerRegistry)
  const profileOptions = { externalActivationPolicy, expectedExternalActivationPolicyDigest }
  const profile = resolveReleaseTagAuthorizationProfile(policy, profileOptions)
  validateReleaseTagAuthorizationPolicy(policy, {
    issuerRegistry,
    now,
    allowUnactivated: false,
    ...profileOptions,
  })

  const expectedIdentity = {
    repository: expected?.repository,
    tag: expected?.tag,
    tagObject: expected?.tagObject,
    commit: expected?.commit,
    tree: expected?.tree,
  }
  for (const [field, value] of Object.entries(expectedIdentity)) {
    invariant(typeof value === 'string' && authorization[field] === value, `Release-tag authorization ${field} mismatch`)
  }
  invariant(authorization.repository === policy.repository, 'Release-tag authorization repository differs from policy')
  invariant(authorization.issuerRegistryDigest === issuerRegistryDigest(issuerRegistry), 'Release-tag authorization issuer registry digest mismatch')
  invariant(authorization.policyDigest === releaseTagAuthorizationPolicyDigest(policy, profileOptions), 'Release-tag authorization policy digest mismatch')
  invariant(authorization.externalActivationPolicyDigest === policy.externalActivationPolicyDigest, 'Release-tag authorization external activation policy digest mismatch')
  invariant(authorization.authorizationProfileId === policy.authorizationProfileId, 'Release-tag authorization profile ID mismatch')
  invariant(authorization.authorizationProfileDigest === policy.authorizationProfileDigest, 'Release-tag authorization profile digest mismatch')
  invariant(
    authorization.authorizationProfileDigest === profile.sha256,
    'Release-tag authorization profile binding is stale or substituted',
  )
  invariant(
    stableStringify(authorization.releaseAuthorization, 0) === stableStringify(policy.releaseAuthorization, 0),
    'Release-tag authorization releaseAuthorization range mismatch',
  )
  const expectedDigest = sha256(stableStringify(authorizationStatement(authorization), 0))
  invariant(authorization.authorizationDigest === expectedDigest, 'Release-tag authorization digest mismatch')

  const issuedAt = canonicalTime(authorization.issuedAt, 'Release-tag authorization issuedAt')
  const expiresAt = canonicalTime(authorization.expiresAt, 'Release-tag authorization expiresAt')
  invariant(expiresAt > issuedAt, 'Release-tag authorization time window is invalid')
  invariant(expiresAt.getTime() - issuedAt.getTime() <= policy.maxAuthorizationTtlMinutes * 60_000, 'Release-tag authorization exceeds policy TTL')
  invariant(issuedAt.getTime() <= now.getTime() + policy.clockSkewSeconds * 1000, 'Release-tag authorization is issued in the future')
  invariant(expiresAt > now, 'Release-tag authorization is expired')

  return { issuedAt, expiresAt, profile }
}

export function verifyReleaseTagAuthorization(authorization, options) {
  const { policy, issuerRegistry, now = new Date() } = options
  const { issuedAt, expiresAt, profile } = validateReleaseTagAuthorizationEnvelope(authorization, options)

  const payload = releaseTagAuthorizationPayload(authorization)
  let verified = 0
  for (const item of authorization.signatures) {
    invariant(typeof item.signerKeyId === 'string' && typeof item.subject === 'string' && item.subject.length > 0, 'Release-tag authorization signer identity is invalid')
    invariant(/^[A-Za-z0-9_-]+$/.test(item.signature || ''), `Release-tag authorization signature encoding is invalid for ${item.signerKeyId || '<missing>'}`)
    const signature = Buffer.from(item.signature, 'base64url')
    invariant(signature.length === 64 && signature.toString('base64url') === item.signature, `Release-tag authorization signature encoding is not canonical Ed25519 base64url for ${item.signerKeyId || '<missing>'}`)
    const issuer = resolvePolicyIssuer(policy, issuerRegistry, item.signerKeyId, {
      role: 'release-tag-authorizer',
      at: issuedAt,
      validThrough: expiresAt,
    })
    resolvePolicyIssuer(policy, issuerRegistry, item.signerKeyId, {
      role: 'release-tag-authorizer',
      at: now,
      validThrough: now,
    })
    invariant(issuer.subject === item.subject, `Release-tag authorization signer subject mismatch for ${item.signerKeyId}`)
    invariant(verify(null, payload, publicKeyFromIssuer(issuer), signature), `Release-tag authorization signature is invalid for ${item.signerKeyId}`)
    verified += 1
  }
  if (profile.releaseAuthorization.minimumSignerQuorum === profile.releaseAuthorization.maximumSignerQuorum) {
    invariant(verified === policy.requiredSignerQuorum, `Release-tag authorization requires exactly ${policy.requiredSignerQuorum} signature for profile ${profile.id}`)
  } else {
    invariant(verified >= policy.requiredSignerQuorum, `Release-tag authorization lacks required signer quorum ${policy.requiredSignerQuorum}`)
  }
  return authorization
}

import { createPublicKey } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invariant, readJson, sha256, stableStringify } from './common.mjs'

const MODULE_PATH = fileURLToPath(import.meta.url)
const GOVERNANCE_ROOT = resolve(dirname(MODULE_PATH), '..')

export const DEFAULT_ISSUER_REGISTRY_PATH = resolve(GOVERNANCE_ROOT, 'trust/issuers.json')
export const ISSUER_ROLES = Object.freeze([
  'privileged-change-authorizer',
  'root-rotator',
  'runtime-evidence-issuer',
  'apply-authorizer',
  'completion-attestor',
  'release-tag-authorizer',
  'visual-baseline-reviewer',
])

const ROLE_SET = new Set(ISSUER_ROLES)
const REGISTRY_KEYS = ['$schema', 'schemaVersion', 'algorithm', 'issuers']
const ISSUER_KEYS = [
  'keyId',
  'subject',
  'publicKeySpki',
  'roles',
  'status',
  'notBefore',
  'notAfter',
  'revokedAt',
]

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
}

function canonicalTime(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be a canonical UTC timestamp`)
  return parsed
}

function validNow(now) {
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'Issuer verification time must be a valid Date')
  return now
}

export function issuerRegistryDigest(registry) {
  validateIssuerRegistry(registry)
  return sha256(stableStringify(registry, 0))
}

export function validateIssuerRegistry(registry) {
  invariant(exactKeys(registry, REGISTRY_KEYS), 'Issuer registry has an invalid or open shape')
  invariant(registry.$schema === '../schemas/issuer-registry.schema.json', 'Issuer registry schema reference is invalid')
  invariant(registry.schemaVersion === 1, 'Issuer registry schemaVersion must be 1')
  invariant(registry.algorithm === 'ed25519', 'Issuer registry algorithm must be ed25519')
  invariant(Array.isArray(registry.issuers), 'Issuer registry issuers must be an array')
  const keyIds = new Set()
  const publicKeys = new Set()
  for (const issuer of registry.issuers) {
    invariant(exactKeys(issuer, ISSUER_KEYS), 'Issuer registry entry has an invalid or open shape')
    invariant(typeof issuer.keyId === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(issuer.keyId), 'Issuer registry keyId is invalid')
    invariant(!keyIds.has(issuer.keyId), `Duplicate issuer registry keyId ${issuer.keyId}`)
    invariant(typeof issuer.subject === 'string' && issuer.subject.trim() !== '', `Issuer ${issuer.keyId} subject is missing`)
    invariant(typeof issuer.publicKeySpki === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(issuer.publicKeySpki), `Issuer ${issuer.keyId} public key is invalid`)
    let publicKey
    const encodedPublicKey = Buffer.from(issuer.publicKeySpki, 'base64')
    try {
      publicKey = createPublicKey({ key: encodedPublicKey, format: 'der', type: 'spki' })
    } catch {
      throw new Error(`Issuer ${issuer.keyId} public key is invalid`)
    }
    invariant(publicKey.asymmetricKeyType === 'ed25519', `Issuer ${issuer.keyId} key must be Ed25519`)
    const canonicalPublicKey = publicKey.export({ format: 'der', type: 'spki' })
    const canonicalPublicKeySpki = canonicalPublicKey.toString('base64')
    invariant(
      encodedPublicKey.equals(canonicalPublicKey) && issuer.publicKeySpki === canonicalPublicKeySpki,
      `Issuer ${issuer.keyId} public key must be canonical Ed25519 SPKI DER/base64 without trailing bytes`,
    )
    invariant(!publicKeys.has(canonicalPublicKeySpki), `Duplicate issuer registry public key for ${issuer.keyId}`)
    invariant(Array.isArray(issuer.roles) && issuer.roles.length > 0 && new Set(issuer.roles).size === issuer.roles.length, `Issuer ${issuer.keyId} roles are invalid`)
    invariant(issuer.roles.every(role => ROLE_SET.has(role)), `Issuer ${issuer.keyId} has an unknown role`)
    invariant(['active', 'revoked'].includes(issuer.status), `Issuer ${issuer.keyId} status is invalid`)
    const notBefore = canonicalTime(issuer.notBefore, `Issuer ${issuer.keyId} notBefore`)
    const notAfter = canonicalTime(issuer.notAfter, `Issuer ${issuer.keyId} notAfter`)
    invariant(notAfter > notBefore, `Issuer ${issuer.keyId} validity window is invalid`)
    if (issuer.status === 'active') invariant(issuer.revokedAt === null, `Active issuer ${issuer.keyId} cannot have revokedAt`)
    else {
      const revokedAt = canonicalTime(issuer.revokedAt, `Revoked issuer ${issuer.keyId} revokedAt`)
      invariant(revokedAt >= notBefore, `Issuer ${issuer.keyId} revokedAt predates notBefore`)
    }
    keyIds.add(issuer.keyId)
    publicKeys.add(canonicalPublicKeySpki)
  }
  return true
}

export function loadIssuerRegistry(path = DEFAULT_ISSUER_REGISTRY_PATH) {
  const registry = readJson(resolve(path))
  validateIssuerRegistry(registry)
  return registry
}

function lineageTime(value, label) {
  if (value === undefined) return null
  if (value instanceof Date) {
    validNow(value)
    return value
  }
  return canonicalTime(value, label)
}

export function validateIssuerRegistryLineage(historicalRegistry, currentRegistry, {
  historicalAt,
  revocationEffectiveAt,
} = {}) {
  validateIssuerRegistry(historicalRegistry)
  validateIssuerRegistry(currentRegistry)
  const historicalTime = lineageTime(historicalAt, 'Historical issuer lineage time')
  const revocationTime = lineageTime(revocationEffectiveAt, 'Issuer revocation effective time')
  const historicalById = new Map(historicalRegistry.issuers.map(issuer => [issuer.keyId, issuer]))
  const currentById = new Map(currentRegistry.issuers.map(issuer => [issuer.keyId, issuer]))
  for (const [keyId, historical] of historicalById) {
    const current = currentById.get(keyId)
    invariant(current, `Historical issuer ${keyId} is missing from the append-only current registry`)
    for (const field of ['keyId', 'subject', 'publicKeySpki', 'roles', 'notBefore', 'notAfter']) {
      invariant(stableStringify(current[field], 0) === stableStringify(historical[field], 0), `Historical issuer ${keyId} changed immutable lineage field ${field}`)
    }
    if (historical.status === 'revoked') {
      invariant(current.status === 'revoked' && current.revokedAt === historical.revokedAt, `Revoked historical issuer ${keyId} cannot be reactivated or rewritten`)
    } else {
      invariant(
        (current.status === 'active' && current.revokedAt === null)
        || (current.status === 'revoked' && current.revokedAt !== null),
        `Historical issuer ${keyId} has an invalid current lifecycle transition`,
      )
      if (current.status === 'revoked') {
        const currentRevokedAt = canonicalTime(current.revokedAt, `Issuer ${keyId} revokedAt`)
        if (historicalTime) invariant(currentRevokedAt > historicalTime, `Historical issuer ${keyId} was revoked at or before the historical transaction time`)
        if (revocationTime) invariant(currentRevokedAt.getTime() === revocationTime.getTime(), `New issuer revocation ${keyId} must take effect exactly at the privileged authorization issuedAt`)
      }
    }
  }
  return true
}

export function publicKeyFromIssuer(issuer) {
  return createPublicKey({ key: Buffer.from(issuer.publicKeySpki, 'base64'), format: 'der', type: 'spki' })
}

export function assertIssuerActive(issuer, { role, at = new Date(), validThrough = at } = {}) {
  validNow(at)
  validNow(validThrough)
  invariant(validThrough >= at, `Issuer ${issuer?.keyId || '<missing>'} validation interval is invalid`)
  invariant(issuer, 'Issuer is not registered')
  invariant(issuer.status === 'active' && issuer.revokedAt === null, `Issuer ${issuer.keyId} is revoked`)
  const notBefore = new Date(issuer.notBefore)
  const notAfter = new Date(issuer.notAfter)
  invariant(notBefore <= at, `Issuer ${issuer.keyId} is not active yet`)
  invariant(notAfter > at && notAfter >= validThrough, `Issuer ${issuer.keyId} is expired before the signed evidence validity ends`)
  if (role) invariant(issuer.roles.includes(role), `Issuer ${issuer.keyId} is not authorized for ${role}`)
  return issuer
}

export function validateRegistryPolicyBinding(policy, registry, {
  allowedKeyField = 'allowedKeyIds',
  role,
  quorum = 1,
  now = new Date(),
  allowUnactivated = true,
} = {}) {
  validateIssuerRegistry(registry)
  validNow(now)
  invariant(typeof policy?.issuerRegistryDigest === 'string' && /^[a-f0-9]{64}$/.test(policy.issuerRegistryDigest), 'Issuer registry digest reference is invalid')
  invariant(policy.issuerRegistryDigest === issuerRegistryDigest(registry), 'Issuer registry digest reference does not match the canonical registry')
  const allowed = policy[allowedKeyField]
  invariant(Array.isArray(allowed) && new Set(allowed).size === allowed.length, `${allowedKeyField} must contain unique key IDs`)
  invariant(allowed.every(keyId => typeof keyId === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(keyId)), `${allowedKeyField} contains an invalid key ID`)
  invariant(Number.isInteger(quorum) && quorum >= 1 && quorum <= 5, 'Issuer quorum must be between 1 and 5')
  if (allowed.length === 0) {
    invariant(allowUnactivated, `${allowedKeyField} cannot be empty after trust activation`)
    return { active: false, eligible: [] }
  }
  const byId = new Map(registry.issuers.map(issuer => [issuer.keyId, issuer]))
  const eligible = []
  for (const keyId of allowed) {
    const issuer = byId.get(keyId)
    invariant(issuer, `Allowed issuer ${keyId} is absent from the canonical registry`)
    assertIssuerActive(issuer, { at: now })
    if (!role || issuer.roles.includes(role)) eligible.push(issuer)
  }
  invariant(
    new Set(eligible.map(issuer => issuer.subject)).size >= quorum,
    `Issuer policy lacks quorum ${quorum} for ${role || 'the requested role'} across distinct subjects`,
  )
  return { active: true, eligible }
}

export function resolvePolicyIssuer(policy, registry, keyId, {
  allowedKeyField = 'allowedKeyIds',
  role,
  at = new Date(),
  validThrough = at,
} = {}) {
  validateIssuerRegistry(registry)
  invariant(policy.issuerRegistryDigest === issuerRegistryDigest(registry), 'Issuer registry digest reference does not match the canonical registry')
  invariant(Array.isArray(policy[allowedKeyField]) && policy[allowedKeyField].includes(keyId), `Issuer ${keyId || '<missing>'} is not allowed by the active policy`)
  const issuer = registry.issuers.find(candidate => candidate.keyId === keyId)
  return assertIssuerActive(issuer, { role, at, validThrough })
}

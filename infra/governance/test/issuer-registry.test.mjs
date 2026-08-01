import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  cosignSignedAttestation,
  issueSignedAttestation,
  verifySignedAttestation,
} from '../lib/attestation.mjs'
import {
  ISSUER_ROLES,
  issuerRegistryDigest,
  validateIssuerRegistry,
  validateIssuerRegistryLineage,
  validateRegistryPolicyBinding,
} from '../lib/issuer-registry.mjs'

const NOW = new Date('2026-07-20T00:30:00.000Z')

function issuer(name, roles = ['apply-authorizer', 'completion-attestor']) {
  const keys = generateKeyPairSync('ed25519')
  return {
    keys,
    record: {
      keyId: `issuer-${name}`,
      subject: `authority-${name}`,
      publicKeySpki: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles,
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}

function registry(records) {
  return { $schema: '../schemas/issuer-registry.schema.json', schemaVersion: 1, algorithm: 'ed25519', issuers: records }
}

function policy(activeRegistry, allowedKeyIds, applyAuthorizationQuorum = 1) {
  return {
    schemaVersion: 1,
    algorithm: 'ed25519',
    maxAuthorizationTtlMinutes: 60,
    maxCompletionTtlMinutes: 10080,
    clockSkewSeconds: 0,
    issuerRegistryDigest: issuerRegistryDigest(activeRegistry),
    allowedKeyIds,
    applyAuthorizationQuorum,
    completionAttestationQuorum: 1,
  }
}

function authorization(signer, activePolicy) {
  return issueSignedAttestation({
    kind: 'apply-authorization',
    repoId: 'fixture',
    github: 'acme/fixture',
    ring: 'canary',
    wave: 'one',
    candidateRelease: { id: 'release-fixture', bomSha256: 'a'.repeat(64) },
    verifiedReleaseEvidenceDigest: 'b'.repeat(64),
    candidatePlanDigest: 'c'.repeat(64),
    predicateDigest: 'd'.repeat(64),
    stateDigest: 'e'.repeat(64),
    defaultBranchHeadSha: 'f'.repeat(40),
    actionsDigest: '1'.repeat(64),
    issuerRegistryDigest: activePolicy.issuerRegistryDigest,
    signerKeyId: signer.record.keyId,
    subject: signer.record.subject,
    privateKey: signer.keys.privateKey,
    issuedAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T01:00:00.000Z',
  })
}

test('issuer registry is closed-shape and its digest is deterministic', () => {
  const first = issuer('one')
  const active = registry([first.record])
  assert.equal(validateIssuerRegistry(active), true)
  assert.equal(issuerRegistryDigest(structuredClone(active)), issuerRegistryDigest(active))
  assert.throws(() => validateIssuerRegistry({ ...active, privateKey: 'forbidden' }), /invalid or open shape/)
})

test('runtime issuer roles stay byte-for-byte aligned with the canonical schema enum', () => {
  const schema = JSON.parse(readFileSync(new URL('../schemas/issuer-registry.schema.json', import.meta.url), 'utf8'))
  const schemaRoles = schema.properties.issuers.items.properties.roles.items.enum
  assert.deepEqual(ISSUER_ROLES, schemaRoles)

  const reviewer = issuer('visual-reviewer', ['visual-baseline-reviewer'])
  assert.equal(validateIssuerRegistry(registry([reviewer.record])), true)
  assert.throws(
    () => validateIssuerRegistry(registry([{ ...reviewer.record, roles: ['unknown-reviewer'] }])),
    /unknown role/,
  )
})

test('issuer identities cannot alias the same key or use non-canonical SPKI bytes', () => {
  const first = issuer('canonical-one')
  const alias = { ...first.record, keyId: 'issuer-canonical-alias', subject: 'authority-canonical-alias' }
  assert.throws(() => validateIssuerRegistry(registry([first.record, alias])), /Duplicate issuer registry public key/)

  const trailingBytes = Buffer.concat([
    Buffer.from(first.record.publicKeySpki, 'base64'),
    Buffer.from([0, 1, 2, 3]),
  ]).toString('base64')
  assert.throws(
    () => validateIssuerRegistry(registry([{ ...first.record, publicKeySpki: trailingBytes }])),
    /must be canonical Ed25519 SPKI DER\/base64 without trailing bytes/,
  )
})

test('quorum policies require independently identified subjects, not only distinct key IDs', () => {
  const first = issuer('subject-one')
  const second = issuer('subject-two')
  second.record.subject = first.record.subject
  const active = registry([first.record, second.record])
  assert.throws(
    () => validateRegistryPolicyBinding(policy(active, [first.record.keyId, second.record.keyId], 2), active, {
      role: 'apply-authorizer',
      quorum: 2,
      now: NOW,
    }),
    /lacks quorum 2.*distinct subjects/,
  )
})

test('role, expiry, and revocation checks fail closed for allowed policy keys', () => {
  const first = issuer('one')
  const base = registry([first.record])
  const activePolicy = policy(base, [first.record.keyId])
  assert.equal(validateRegistryPolicyBinding(activePolicy, base, { role: 'apply-authorizer', quorum: 1, now: NOW }).active, true)

  const wrongRole = registry([{ ...first.record, roles: ['completion-attestor'] }])
  assert.throws(() => validateRegistryPolicyBinding(policy(wrongRole, [first.record.keyId]), wrongRole, { role: 'apply-authorizer', quorum: 1, now: NOW }), /lacks quorum/)
  const expired = registry([{ ...first.record, notAfter: '2026-07-20T00:01:00.000Z' }])
  assert.throws(() => validateRegistryPolicyBinding(policy(expired, [first.record.keyId]), expired, { role: 'apply-authorizer', quorum: 1, now: NOW }), /expired/)
  const revoked = registry([{ ...first.record, status: 'revoked', revokedAt: '2026-07-20T00:01:00.000Z' }])
  assert.throws(() => validateRegistryPolicyBinding(policy(revoked, [first.record.keyId]), revoked, { role: 'apply-authorizer', quorum: 1, now: NOW }), /revoked/)
})

test('quorum is cryptographic and registry rotation invalidates prior authorizations', () => {
  const first = issuer('one')
  const second = issuer('two')
  const active = registry([first.record, second.record])
  const activePolicy = policy(active, [first.record.keyId, second.record.keyId], 2)
  const signed = authorization(first, activePolicy)
  assert.equal(verifySignedAttestation(signed, activePolicy, {}, { now: NOW, issuerRegistry: active }).valid, false)
  cosignSignedAttestation(signed, { signerKeyId: second.record.keyId, subject: second.record.subject, privateKey: second.keys.privateKey })
  assert.equal(verifySignedAttestation(signed, activePolicy, {}, { now: NOW, issuerRegistry: active }).valid, true)

  const nonCanonical = structuredClone(signed)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const signature = nonCanonical.coSignatures[0].signature
  const finalIndex = alphabet.indexOf(signature.at(-1))
  assert.equal(finalIndex % 16, 0)
  nonCanonical.coSignatures[0].signature = `${signature.slice(0, -1)}${alphabet[finalIndex + 1]}`
  const nonCanonicalResult = verifySignedAttestation(nonCanonical, activePolicy, {}, { now: NOW, issuerRegistry: active })
  assert.equal(nonCanonicalResult.valid, false)
  assert.ok(nonCanonicalResult.failures.some(failure => failure.includes('not canonical Ed25519 base64url')))

  const replacement = issuer('replacement')
  const rotated = registry([first.record, second.record, replacement.record])
  const rotatedPolicy = policy(rotated, [first.record.keyId, second.record.keyId], 2)
  const result = verifySignedAttestation(signed, rotatedPolicy, {}, { now: NOW, issuerRegistry: rotated })
  assert.equal(result.valid, false)
  assert.ok(result.failures.some(failure => failure.includes('issuerRegistryDigest mismatch')))
})

test('issuer registry lineage permits append and one-way revocation but forbids historical identity rewrites', () => {
  const first = issuer('lineage-one', ['apply-authorizer', 'completion-attestor', 'root-rotator'])
  const second = issuer('lineage-two', ['root-rotator'])
  const historical = registry([first.record])
  const revokedFirst = { ...first.record, status: 'revoked', revokedAt: '2026-07-20T00:10:00.000Z' }
  assert.equal(validateIssuerRegistryLineage(historical, registry([revokedFirst, second.record])), true)
  assert.equal(validateIssuerRegistryLineage(historical, registry([revokedFirst]), { historicalAt: new Date('2026-07-20T00:00:00.000Z') }), true)
  assert.equal(validateIssuerRegistryLineage(historical, registry([revokedFirst]), { revocationEffectiveAt: new Date('2026-07-20T00:10:00.000Z') }), true)
  assert.throws(
    () => validateIssuerRegistryLineage(historical, registry([revokedFirst]), { historicalAt: new Date('2026-07-20T00:10:00.000Z') }),
    /revoked at or before the historical transaction time/,
  )
  for (const ambiguous of ['2026-07-20T00:09:59.000Z', '2026-07-20T00:10:01.000Z']) {
    assert.throws(
      () => validateIssuerRegistryLineage(historical, registry([revokedFirst]), { revocationEffectiveAt: new Date(ambiguous) }),
      /must take effect exactly at the privileged authorization issuedAt/,
    )
  }

  const replacement = issuer('lineage-replacement')
  const forbidden = [
    [[], /missing from the append-only current registry/],
    [[{ ...first.record, publicKeySpki: replacement.record.publicKeySpki }], /publicKeySpki/],
    [[{ ...first.record, subject: 'rewritten-subject' }], /subject/],
    [[{ ...first.record, roles: ['root-rotator'] }], /roles/],
    [[{ ...first.record, notBefore: '2025-01-01T00:00:00.000Z' }], /notBefore/],
    [[{ ...first.record, notAfter: '2031-01-01T00:00:00.000Z' }], /notAfter/],
  ]
  for (const [records, pattern] of forbidden) {
    assert.throws(() => validateIssuerRegistryLineage(historical, registry(records)), pattern)
  }

  const revokedHistorical = registry([revokedFirst])
  assert.throws(() => validateIssuerRegistryLineage(revokedHistorical, historical), /cannot be reactivated or rewritten/)
  assert.throws(
    () => validateIssuerRegistryLineage(revokedHistorical, registry([{ ...revokedFirst, revokedAt: '2026-07-20T00:20:00.000Z' }])),
    /cannot be reactivated or rewritten/,
  )
})

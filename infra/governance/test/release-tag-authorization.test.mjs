import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readJson } from '../lib/common.mjs'
import {
  EXTERNAL_ACTIVATION_PROFILE_IDS,
  externalActivationPolicyDigest,
  externalActivationProfileDigest,
} from '../lib/external-activation.mjs'
import { issuerRegistryDigest, validateIssuerRegistry } from '../lib/issuer-registry.mjs'
import {
  createReleaseTagAuthorization,
  releaseTagAuthorizationPolicyDigest,
  signReleaseTagAuthorization,
  verifyReleaseTagAuthorization,
} from '../lib/release-tag-authorization.mjs'
import { run as runReleaseTagAuthorizationCli } from '../../../scripts/release-tag-authorization.mjs'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NOW = new Date('2026-07-20T00:30:00.000Z')
const SMALL_TEAM_PROFILE_ID = EXTERNAL_ACTIVATION_PROFILE_IDS[0]
const MAXIMUM_PROFILE_ID = EXTERNAL_ACTIVATION_PROFILE_IDS[1]
const IDENTITY = {
  repository: 'acme/design-system',
  tag: 'v1.2.3-beta.4',
  tagObject: '4'.repeat(40),
  commit: '2'.repeat(40),
  tree: '3'.repeat(40),
}

function signer(keyId, roles = ['release-tag-authorizer']) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const subject = `operator:${keyId}`
  return {
    keyId,
    subject,
    privateKey,
    record: {
      keyId,
      subject,
      publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      roles,
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}

function fixture({
  profileId = MAXIMUM_PROFILE_ID,
  quorum = profileId === SMALL_TEAM_PROFILE_ID ? 1 : 2,
  roles,
} = {}) {
  const first = signer('release-one', roles)
  const second = signer('release-two', roles)
  const issuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [first.record, second.record],
  }
  const externalActivationPolicy = readJson(resolve(GOVERNANCE_ROOT, 'external-activation-policy.json'))
  externalActivationPolicy.activeProfile = profileId
  const expectedExternalActivationPolicyDigest = externalActivationPolicyDigest(externalActivationPolicy)
  const profile = externalActivationPolicy.profiles.find(item => item.id === profileId)
  const policy = {
    $schema: 'schemas/release-tag-authorization-policy.schema.json',
    schemaVersion: 2,
    repository: IDENTITY.repository,
    algorithm: 'ed25519',
    externalActivationPolicyDigest: expectedExternalActivationPolicyDigest,
    authorizationProfileId: profileId,
    authorizationProfileDigest: externalActivationProfileDigest(profile),
    releaseAuthorization: structuredClone(profile.releaseAuthorization),
    maxAuthorizationTtlMinutes: 60,
    clockSkewSeconds: 120,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    allowedKeyIds: [first.keyId, second.keyId],
    requiredSignerQuorum: quorum,
  }
  return {
    first,
    second,
    issuerRegistry,
    policy,
    externalActivationPolicy,
    expectedExternalActivationPolicyDigest,
  }
}

function issue(context, {
  identity = IDENTITY,
  issuedAt = '2026-07-20T00:00:00.000Z',
  expiresAt = '2026-07-20T01:00:00.000Z',
  nonce = 'authorization_nonce_0123456789abcdef',
  signers = [context.first, context.second],
} = {}) {
  const authorization = createReleaseTagAuthorization({
    ...identity,
    policy: context.policy,
    issuerRegistry: context.issuerRegistry,
    issuedAt,
    expiresAt,
    nonce,
    externalActivationPolicy: context.externalActivationPolicy,
    expectedExternalActivationPolicyDigest: context.expectedExternalActivationPolicyDigest,
  })
  for (const item of signers) {
    signReleaseTagAuthorization(authorization, {
      signerKeyId: item.keyId,
      subject: item.subject,
      privateKey: item.privateKey,
    })
  }
  return authorization
}

function verify(context, authorization, overrides = {}) {
  return verifyReleaseTagAuthorization(authorization, {
    expected: IDENTITY,
    policy: context.policy,
    issuerRegistry: context.issuerRegistry,
    now: NOW,
    externalActivationPolicy: context.externalActivationPolicy,
    expectedExternalActivationPolicyDigest: context.expectedExternalActivationPolicyDigest,
    ...overrides,
  })
}

test('quorum authorization binds the exact immutable release identity and satisfies closed schemas', () => {
  const context = fixture()
  const authorization = issue(context)
  assert.equal(verify(context, authorization), authorization)
  assert.match(authorization.authorizationDigest, /^[a-f0-9]{64}$/)
  assert.equal(authorization.policyDigest, releaseTagAuthorizationPolicyDigest(context.policy, {
    externalActivationPolicy: context.externalActivationPolicy,
    expectedExternalActivationPolicyDigest: context.expectedExternalActivationPolicyDigest,
  }))

  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  for (const [path, value] of [
    ['schemas/release-tag-authorization.schema.json', authorization],
    ['schemas/release-tag-authorization-policy.schema.json', context.policy],
  ]) {
    const validate = ajv.compile(readJson(resolve(GOVERNANCE_ROOT, path)))
    assert.equal(validate(value), true, ajv.errorsText(validate.errors))
  }
})

test('authorization cannot replay across repository, tag, tag object, commit, or tree', () => {
  const context = fixture()
  const authorization = issue(context)
  for (const [field, value] of [
    ['repository', 'other/design-system'],
    ['tag', 'v1.2.4'],
    ['tagObject', '5'.repeat(40)],
    ['commit', '6'.repeat(40)],
    ['tree', '7'.repeat(40)],
  ]) {
    assert.throws(() => verify(context, authorization, {
      expected: { ...IDENTITY, [field]: value },
    }), new RegExp(`${field} mismatch`), field)
  }
})

test('nonce, time, policy, registry, authorization digest, and signed payload tampering fail closed', () => {
  const context = fixture()
  const authorization = issue(context)
  for (const [label, mutate, pattern] of [
    ['nonce', value => { value.nonce = 'tampered_nonce_0123456789abcdefghi' }, /authorization digest mismatch/],
    ['issuedAt', value => { value.issuedAt = '2026-07-20T00:01:00.000Z' }, /authorization digest mismatch/],
    ['policy digest', value => { value.policyDigest = 'a'.repeat(64) }, /policy digest mismatch/],
    ['registry digest', value => { value.issuerRegistryDigest = 'b'.repeat(64) }, /issuer registry digest mismatch/],
    ['external activation policy', value => { value.externalActivationPolicyDigest = 'f'.repeat(64) }, /external activation policy digest mismatch/],
    ['profile ID', value => { value.authorizationProfileId = SMALL_TEAM_PROFILE_ID }, /profile ID mismatch/],
    ['profile digest', value => { value.authorizationProfileDigest = 'd'.repeat(64) }, /profile digest mismatch/],
    ['release authorization range', value => { value.releaseAuthorization.minimumSignerQuorum = 3 }, /releaseAuthorization range mismatch/],
    ['authorization digest', value => { value.authorizationDigest = 'c'.repeat(64) }, /authorization digest mismatch/],
    ['signature payload', value => { value.signatures[0].signature = `${value.signatures[0].signature[0] === 'A' ? 'B' : 'A'}${value.signatures[0].signature.slice(1)}` }, /signature is invalid/],
    ['signer subject', value => { value.signatures[0].subject = 'operator:attacker' }, /subject mismatch/],
  ]) {
    const tampered = structuredClone(authorization)
    mutate(tampered)
    assert.throws(() => verify(context, tampered), pattern, label)
  }
})

test('expired, future-issued, and overlong authorizations fail closed', () => {
  const context = fixture()
  assert.throws(() => verify(context, issue(context, {
    issuedAt: '2026-07-19T23:30:00.000Z',
    expiresAt: '2026-07-20T00:29:59.000Z',
  })), /expired/)
  assert.throws(() => verify(context, issue(context, {
    issuedAt: '2026-07-20T00:33:00.000Z',
    expiresAt: '2026-07-20T01:00:00.000Z',
  })), /issued in the future/)
  assert.throws(() => verify(context, issue(context, {
    issuedAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T02:00:00.000Z',
  })), /exceeds policy TTL/)
})

test('unknown, revoked, wrong-role, duplicate, and insufficient signers fail closed', () => {
  const quorumContext = fixture()
  assert.throws(() => verify(quorumContext, issue(quorumContext, { signers: [quorumContext.first] })), /lacks required signer quorum/)

  const duplicate = issue(quorumContext)
  duplicate.signatures[1] = structuredClone(duplicate.signatures[0])
  assert.throws(() => verify(quorumContext, duplicate), /signers must be distinct/)

  const unknownPolicy = structuredClone(quorumContext.policy)
  unknownPolicy.allowedKeyIds[1] = 'unknown-release-key'
  assert.throws(() => verify(quorumContext, issue(quorumContext), { policy: unknownPolicy }), /absent from the canonical registry/)

  const revokedRegistry = structuredClone(quorumContext.issuerRegistry)
  revokedRegistry.issuers[0].status = 'revoked'
  revokedRegistry.issuers[0].revokedAt = '2026-07-20T00:15:00.000Z'
  const revokedPolicy = { ...quorumContext.policy, issuerRegistryDigest: issuerRegistryDigest(revokedRegistry) }
  assert.throws(() => verify(quorumContext, issue(quorumContext), {
    policy: revokedPolicy,
    issuerRegistry: revokedRegistry,
  }), /revoked/)

  const wrongRole = fixture({ roles: ['apply-authorizer'] })
  assert.throws(() => verify(wrongRole, issue(wrongRole)), /lacks quorum.*release-tag-authorizer/)
})

test('bounded profiles enforce exact single-owner quorum and maximum-assurance multi-custodian quorum', () => {
  const singleOwner = fixture({
    profileId: SMALL_TEAM_PROFILE_ID,
  })
  const oneSignature = issue(singleOwner, { signers: [singleOwner.first] })
  assert.equal(verify(singleOwner, oneSignature), oneSignature)
  assert.throws(
    () => verify(singleOwner, issue(singleOwner, { signers: [] })),
    /requires exactly 1 signature/,
  )
  assert.throws(
    () => verify(singleOwner, issue(singleOwner)),
    /requires exactly 1 signature/,
  )

  const invalidMaximum = fixture({ quorum: 1 })
  assert.throws(() => issue(invalidMaximum), /quorum is invalid for profile MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM/)

  const maximum = fixture()
  assert.throws(
    () => verify(maximum, issue(maximum, { signers: [maximum.first] })),
    /lacks required signer quorum 2/,
  )
})

test('profile identity and digest cannot be stale, substituted, or replayed across profiles', () => {
  const maximum = fixture()
  const authorization = issue(maximum)

  const substitutedAuthorization = structuredClone(authorization)
  substitutedAuthorization.authorizationProfileId = SMALL_TEAM_PROFILE_ID
  assert.throws(() => verify(maximum, substitutedAuthorization), /profile ID mismatch/)

  const staleAuthorization = structuredClone(authorization)
  staleAuthorization.authorizationProfileDigest = 'd'.repeat(64)
  assert.throws(() => verify(maximum, staleAuthorization), /profile digest mismatch/)

  const substitutedPolicy = structuredClone(maximum.policy)
  substitutedPolicy.authorizationProfileId = SMALL_TEAM_PROFILE_ID
  substitutedPolicy.authorizationProfileDigest = externalActivationProfileDigest(
    maximum.externalActivationPolicy.profiles.find(profile => profile.id === SMALL_TEAM_PROFILE_ID),
  )
  substitutedPolicy.releaseAuthorization = { minimumSignerQuorum: 1, maximumSignerQuorum: 1 }
  substitutedPolicy.requiredSignerQuorum = 1
  assert.throws(
    () => verify(maximum, authorization, { policy: substitutedPolicy }),
    /profile differs from the active canonical profile/,
  )

  const stalePolicy = structuredClone(maximum.policy)
  stalePolicy.authorizationProfileDigest = 'e'.repeat(64)
  assert.throws(
    () => verify(maximum, authorization, { policy: stalePolicy }),
    /policy profile digest is stale or substituted/,
  )

  const crossPolicy = readJson(resolve(GOVERNANCE_ROOT, 'external-activation-policy.json'))
  const crossPolicyDigest = externalActivationPolicyDigest(crossPolicy)
  assert.throws(
    () => verify(maximum, authorization, {
      externalActivationPolicy: crossPolicy,
      expectedExternalActivationPolicyDigest: crossPolicyDigest,
    }),
    /bound to another external activation policy/,
  )
})

test('release keys remain dedicated and distinct under both bounded profiles', () => {

  const sharedSubject = fixture()
  sharedSubject.second.subject = sharedSubject.first.subject
  sharedSubject.second.record.subject = sharedSubject.first.record.subject
  sharedSubject.policy.issuerRegistryDigest = issuerRegistryDigest(sharedSubject.issuerRegistry)
  assert.throws(() => issue(sharedSubject), /lacks quorum 2.*distinct subjects/)

  const multiRole = fixture({ roles: ['release-tag-authorizer', 'root-rotator'] })
  assert.throws(() => issue(multiRole), /must have only the release-tag-authorizer role/)
})

test('same public key cannot be registered under multiple release signer IDs', () => {
  const context = fixture()
  const aliased = structuredClone(context.second.record)
  aliased.publicKeySpki = context.first.record.publicKeySpki
  assert.throws(
    () => validateIssuerRegistry({ ...context.issuerRegistry, issuers: [context.first.record, aliased] }),
    /Duplicate issuer registry public key/,
  )
})

test('non-canonical base64url spellings of an Ed25519 signature are rejected', () => {
  const context = fixture()
  const authorization = issue(context)
  const signature = authorization.signatures[0].signature
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const finalIndex = alphabet.indexOf(signature.at(-1))
  assert.equal(finalIndex % 16, 0, '64-byte base64url signature should end on a canonical 2-bit symbol')
  authorization.signatures[0].signature = `${signature.slice(0, -1)}${alphabet[finalIndex + 1]}`
  assert.deepEqual(
    Buffer.from(authorization.signatures[0].signature, 'base64url'),
    Buffer.from(signature, 'base64url'),
    'fixture must preserve decoded signature bytes while changing its spelling',
  )
  assert.throws(() => verify(context, authorization), /signature encoding is not canonical/)
})

test('a synthetic empty registry and allowlist fail closed after trust activation', () => {
  const issuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [],
  }
  const policy = structuredClone(readJson(resolve(GOVERNANCE_ROOT, 'release-tag-authorization-policy.json')))
  policy.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  policy.allowedKeyIds = []
  const synthetic = {
    schemaVersion: 2,
    kind: 'release-tag-authorization',
    ...IDENTITY,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    policyDigest: releaseTagAuthorizationPolicyDigest(policy),
    externalActivationPolicyDigest: policy.externalActivationPolicyDigest,
    authorizationProfileId: policy.authorizationProfileId,
    authorizationProfileDigest: policy.authorizationProfileDigest,
    releaseAuthorization: structuredClone(policy.releaseAuthorization),
    issuedAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T01:00:00.000Z',
    nonce: 'authorization_nonce_0123456789abcdef',
    authorizationDigest: '0'.repeat(64),
    signatures: [],
  }
  assert.throws(() => verifyReleaseTagAuthorization(synthetic, {
    expected: { ...IDENTITY, repository: policy.repository },
    policy,
    issuerRegistry,
    now: NOW,
  }), /allowedKeyIds cannot be empty after trust activation/)
})

test('operator CLI creates the active exact-profile signature without overwriting inputs', () => {
  const context = fixture({ profileId: SMALL_TEAM_PROFILE_ID })
  const directory = mkdtempSync(resolve(tmpdir(), 'release-tag-authorization-'))
  try {
    const registryPath = resolve(directory, 'issuers.json')
    const policyPath = resolve(directory, 'policy.json')
    const unsignedPath = resolve(directory, 'unsigned.json')
    const firstPath = resolve(directory, 'first.json')
    const firstKeyPath = resolve(directory, 'first.pem')
    const secondKeyPath = resolve(directory, 'second.pem')
    writeFileSync(registryPath, JSON.stringify(context.issuerRegistry), { mode: 0o600 })
    writeFileSync(policyPath, JSON.stringify(context.policy), { mode: 0o600 })
    writeFileSync(firstKeyPath, context.first.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 })
    writeFileSync(secondKeyPath, context.second.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 })
    const identityArgs = [
      '--repository', IDENTITY.repository,
      '--tag', IDENTITY.tag,
      '--tag-object', IDENTITY.tagObject,
      '--commit', IDENTITY.commit,
      '--tree', IDENTITY.tree,
      '--policy', policyPath,
      '--issuer-registry', registryPath,
    ]
    runReleaseTagAuthorizationCli([
      '--create', ...identityArgs,
      '--issued-at', '2026-07-20T00:00:00.000Z',
      '--expires-at', '2026-07-20T01:00:00.000Z',
      '--nonce', 'cli_authorization_nonce_0123456789abcdef',
      '--output', unsignedPath,
    ], { now: NOW })
    runReleaseTagAuthorizationCli([
      '--sign', ...identityArgs,
      '--input', unsignedPath,
      '--output', firstPath,
      '--signer-key-id', context.first.keyId,
      '--subject', context.first.subject,
      '--private-key', firstKeyPath,
    ], { now: NOW })
    const authorization = JSON.parse(readFileSync(firstPath, 'utf8'))
    assert.equal(authorization.signatures.length, 1)
    verify(context, authorization)
    assert.equal(JSON.parse(readFileSync(unsignedPath, 'utf8')).signatures.length, 0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

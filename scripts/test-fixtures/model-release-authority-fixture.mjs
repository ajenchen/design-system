import { generateKeyPairSync, sign } from 'node:crypto'
import { loadModelInvocationProfiles } from '../lib/model-evidence-plan.mjs'
import {
  loadModelReleaseAuthorityPolicy,
  modelReleaseAuthorityDocumentSigningBytes,
  modelReleaseAuthoritySha256,
  stableModelReleaseAuthorityStringify,
} from '../lib/model-release-authority.mjs'

function issuer(keyId, subject) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey,
    record: {
      keyId,
      subject,
      publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      roles: ['runtime-evidence-issuer'],
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2027-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}

const digest = value => modelReleaseAuthoritySha256(typeof value === 'string' ? value : stableModelReleaseAuthorityStringify(value))

export function buildModelReleaseAuthorityFixture({
  repoRoot = process.cwd(),
  releaseId = 'codex/gpt-5.6-sol',
  providerInvocationWindow: invocationWindow = null,
  exchangeInvocationObservations: invocationObservations = null,
  timeline: timelineOverrides = {},
} = {}) {
  const policyState = loadModelReleaseAuthorityPolicy({ repoRoot })
  const profileState = loadModelInvocationProfiles({ repoRoot })
  const releaseState = profileState.releaseState
  const record = releaseState.byId.get(releaseId)
  if (!record) throw new Error(`fixture model release is absent:${releaseId}`)
  const profile = profileState.profiles[record.providerId]
  if (!profile) throw new Error(`fixture provider profile is absent:${record.providerId}`)

  const keys = {
    source: issuer('fixture-model-source-v1', 'spiffe://qijenchen.dev/fixture/model-release/source-observer'),
    receipt: issuer('fixture-model-receipt-v1', 'spiffe://qijenchen.dev/fixture/model-release/receipt-signer'),
    audit: issuer('fixture-model-audit-v1', 'spiffe://qijenchen.dev/fixture/model-release/audit-observer'),
  }
  const issuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [keys.source.record, keys.receipt.record, keys.audit.record],
  }
  const signDocument = (documentKind, document, keyName) => {
    const key = keys[keyName]
    if (!key) throw new Error(`unknown fixture signing key:${keyName}`)
    const payload = { ...document, issuerKeyId: key.record.keyId, issuerSubject: key.record.subject, signatureAlgorithm: 'Ed25519' }
    return {
      ...payload,
      signature: sign(null, modelReleaseAuthorityDocumentSigningBytes(policyState, documentKind, payload), key.privateKey).toString('base64url'),
    }
  }

  const identity = {
    providerId: record.providerId,
    requestModelId: record.requestModelId,
    modelReleaseId: record.id,
    modelReleaseBindingDigest: digest(record),
    modelReleaseRegistryDigest: releaseState.registryDigest,
  }
  const modelIdentityPolicyDigest = digest(profile.modelIdentity)
  const timeline = {
    sourceRetrievedAt: '2026-07-21T00:05:00.000Z',
    sourceExpiresAt: '2026-07-21T01:00:00.000Z',
    invocationStartedAt: '2026-07-21T00:10:00.000Z',
    invocationObservedAt: '2026-07-21T00:11:00.000Z',
    invocationFinishedAt: '2026-07-21T00:12:00.000Z',
    revocationCheckedAt: '2026-07-21T00:12:00.000Z',
    revocationExpiresAt: '2026-07-21T01:00:00.000Z',
    authorityIssuedAt: '2026-07-21T00:13:00.000Z',
    authorityExpiresAt: '2026-07-21T01:00:00.000Z',
    auditObservedAt: '2026-07-21T00:14:00.000Z',
    auditExpiresAt: '2026-07-21T01:00:00.000Z',
    modelReleaseValidUntil: '2026-07-21T01:00:00.000Z',
    ...timelineOverrides,
  }
  const providerInvocationWindow = invocationWindow ? structuredClone(invocationWindow) : {
    startedAt: timeline.invocationStartedAt,
    finishedAt: timeline.invocationFinishedAt,
  }
  const exchangeInvocationObservations = invocationObservations ? structuredClone(invocationObservations) : [{
    shardId: digest('fixture-model-shard-1'),
    providerRunId: 'fixture-provider-run-1',
    responseSha256: digest('fixture-provider-response-1'),
    observedAt: timeline.invocationObservedAt,
  }]
  const sourceReadback = signDocument('sourceReadback', {
    schemaVersion: 1,
    kind: 'managed-ci-model-release-source-readback-v1',
    readbackId: 'fixture-source-readback-1',
    ...identity,
    modelIdentityPolicyDigest,
    sourceUrl: record.reviewedDocumentationAssertion.reference,
    sourceHost: new URL(record.reviewedDocumentationAssertion.reference).hostname,
    finalUrl: record.reviewedDocumentationAssertion.reference,
    redirectCount: 0,
    tlsVersion: 'TLSv1.3',
    etag: '"fixture-official-source-v1"',
    lastModified: null,
    bodySha256: digest('fixture-official-source-body'),
    bodyBytes: 4096,
    retrievedAt: timeline.sourceRetrievedAt,
    expiresAt: timeline.sourceExpiresAt,
    nonce: '11111111-1111-4111-8111-111111111111',
  }, 'source')
  const revocationReadback = signDocument('revocationReadback', {
    schemaVersion: 1,
    kind: 'managed-ci-model-release-revocation-readback-v1',
    readbackId: 'fixture-revocation-readback-1',
    ...identity,
    registryUrl: policyState.policy.revocationRegistryUrl,
    registryHost: policyState.policy.authorityEndpointHost,
    finalUrl: policyState.policy.revocationRegistryUrl,
    redirectCount: 0,
    tlsVersion: 'TLSv1.3',
    etag: '"fixture-revocations-v1"',
    lastModified: null,
    bodySha256: digest('fixture-revocation-registry-body'),
    bodyBytes: 1024,
    status: 'not-revoked',
    checkedAt: timeline.revocationCheckedAt,
    expiresAt: timeline.revocationExpiresAt,
    nonce: '22222222-2222-4222-8222-222222222222',
  }, 'source')
  const authorityReceipt = signDocument('authorityReceipt', {
    schemaVersion: 1,
    kind: 'managed-ci-model-release-authority-receipt-v1',
    receiptId: 'fixture-authority-receipt-1',
    tenantId: policyState.policy.tenantId,
    ...identity,
    observedResponseModelId: record.requestModelId,
    modelIdentityPolicyDigest,
    modelReleaseValidFrom: record.validFrom,
    modelReleaseValidUntil: timeline.modelReleaseValidUntil,
    providerInvocationWindowDigest: digest(providerInvocationWindow),
    exchangeInvocationObservationsDigest: digest(exchangeInvocationObservations),
    sourceReadbackDigest: digest(sourceReadback),
    revocationReadbackDigest: digest(revocationReadback),
    replayLedgerReceiptDigest: digest('fixture-external-atomic-replay-ledger-receipt'),
    issuedAt: timeline.authorityIssuedAt,
    expiresAt: timeline.authorityExpiresAt,
    nonce: '33333333-3333-4333-8333-333333333333',
  }, 'receipt')
  const auditReadback = signDocument('auditReadback', {
    schemaVersion: 1,
    kind: 'managed-ci-model-release-audit-readback-v1',
    readbackId: 'fixture-audit-readback-1',
    eventId: 'fixture-audit-event-1',
    receiptId: authorityReceipt.receiptId,
    tenantId: policyState.policy.tenantId,
    ...identity,
    auditUrl: policyState.policy.auditReadbackUrl,
    auditHost: policyState.policy.authorityEndpointHost,
    finalUrl: policyState.policy.auditReadbackUrl,
    redirectCount: 0,
    tlsVersion: 'TLSv1.3',
    appendOnly: true,
    eventHeadDigest: digest('fixture-append-only-audit-head'),
    authorityReceiptDigest: digest(authorityReceipt),
    sourceReadbackDigest: digest(sourceReadback),
    revocationReadbackDigest: digest(revocationReadback),
    replayLedgerReceiptDigest: authorityReceipt.replayLedgerReceiptDigest,
    observedAt: timeline.auditObservedAt,
    expiresAt: timeline.auditExpiresAt,
    nonce: '44444444-4444-4444-8444-444444444444',
  }, 'audit')

  const binding = {
    schemaVersion: 1,
    kind: 'managed-ci-model-release-authority-binding-v1',
    requestModelId: record.requestModelId,
    observedResponseModelId: record.requestModelId,
    modelReleaseId: record.id,
    modelReleaseBindingDigest: identity.modelReleaseBindingDigest,
    modelReleaseRegistryDigest: identity.modelReleaseRegistryDigest,
    modelIdentityPolicyDigest,
    modelReleaseValidFrom: record.validFrom,
    modelReleaseValidUntil: timeline.modelReleaseValidUntil,
    providerInvocationWindow,
    exchangeInvocationObservations,
    authorityReceipt,
    sourceReadback,
    revocationReadback,
    auditReadback,
  }
  return {
    binding,
    issuerRegistry,
    policyState,
    profileState,
    releaseState,
    keys,
    signDocument,
  }
}

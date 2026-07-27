import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildModelReleaseAuthorityFixture } from './test-fixtures/model-release-authority-fixture.mjs'
import {
  modelReleaseAuthoritySha256,
  stableModelReleaseAuthorityStringify,
  validateModelReleaseAuthorityBinding,
} from './lib/model-release-authority.mjs'
import { resolvePromotionEligibleModelRelease } from './lib/model-release-registry.mjs'

const digest = value => modelReleaseAuthoritySha256(typeof value === 'string' ? value : stableModelReleaseAuthorityStringify(value))

function validate(fixture, binding = fixture.binding, issuerRegistry = fixture.issuerRegistry, releaseState = fixture.releaseState) {
  return validateModelReleaseAuthorityBinding(binding, {
    policyState: fixture.policyState,
    releaseState,
    profileState: fixture.profileState,
    issuerRegistry,
  })
}

function poisoned(fixture, mutate, pattern = /model release authority blocked:/) {
  const binding = structuredClone(fixture.binding)
  mutate(binding)
  assert.throws(() => validate(fixture, binding), pattern)
}

test('closed model release authority validates four independently signed readbacks and exact exchanges', () => {
  const fixture = buildModelReleaseAuthorityFixture()
  const result = validate(fixture)
  assert.equal(result.binding.modelReleaseId, 'codex/gpt-5.6-sol')
  assert.deepEqual(result.exchangeInvocationObservations, fixture.binding.exchangeInvocationObservations)
  for (const value of Object.values(result.digests)) assert.match(value, /^[a-f0-9]{64}$/)
  assert.equal(fixture.releaseState.byId.get(result.binding.modelReleaseId).promotionEligible, false)
})

test('fail-closed registry resolves only through a valid external authority overlay', () => {
  const fixture = buildModelReleaseAuthorityFixture()
  const providerId = 'codex'
  const requestModelId = 'gpt-5.6-sol'
  const resolve = (overrides = {}) => resolvePromotionEligibleModelRelease({
    state: fixture.releaseState,
    profile: fixture.profileState.profiles[providerId],
    providerId,
    requestModelId,
    authorityBinding: fixture.binding,
    authorityPolicyState: fixture.policyState,
    issuerRegistry: fixture.issuerRegistry,
    ...overrides,
  })
  const result = resolve()
  assert.equal(result.record.promotionEligible, false)
  assert.equal(result.effectivePromotionBinding.kind, 'externally-verified-model-release-promotion-v1')
  assert.equal(result.effectivePromotionBinding.canonicalRecordPromotionEligible, false)
  assert.equal(result.effectivePromotionBinding.modelReleaseAuthorityBindingDigest, digest(fixture.binding))
  assert.equal(result.effectivePromotionBinding.modelAuthorityReplayLedgerReceiptDigest, fixture.binding.authorityReceipt.replayLedgerReceiptDigest)
  assert.match(result.effectivePromotionBindingDigest, /^[a-f0-9]{64}$/)

  assert.throws(() => resolve({ authorityBinding: undefined }), /four-document authority binding is required and invalid/)

  const expired = structuredClone(fixture.binding)
  expired.modelReleaseValidUntil = '2026-07-21T00:09:00.000Z'
  assert.throws(() => resolve({ authorityBinding: expired }), /four-document authority binding is required and invalid/)

  const revokedRegistry = structuredClone(fixture.issuerRegistry)
  const receiptIssuer = revokedRegistry.issuers.find(item => item.keyId === fixture.binding.authorityReceipt.issuerKeyId)
  receiptIssuer.status = 'revoked'
  receiptIssuer.revokedAt = '2026-07-21T00:12:59.000Z'
  assert.throws(() => resolve({ issuerRegistry: revokedRegistry }), /four-document authority binding is required and invalid/)

  assert.throws(() => resolve({ requestModelId: 'gpt-5.6-terra' }), /detached from the selected provider\/model|four-document authority binding is required and invalid/)
})

test('model identity, fail-closed registry, profile, validity, and exchange bindings reject substitution', () => {
  const fixture = buildModelReleaseAuthorityFixture()
  poisoned(fixture, value => { value.observedResponseModelId = 'gpt-5.6-terra' }, /observed response model differs/)
  poisoned(fixture, value => { value.modelReleaseId = 'codex/gpt-5.6-terra' }, /release ID is detached/)
  poisoned(fixture, value => { value.modelReleaseBindingDigest = digest('substituted-record') }, /registry\/record\/profile policy digest/)
  poisoned(fixture, value => { value.modelReleaseRegistryDigest = digest('substituted-registry') }, /registry\/record\/profile policy digest/)
  poisoned(fixture, value => { value.modelIdentityPolicyDigest = digest('substituted-profile') }, /registry\/record\/profile policy digest/)
  poisoned(fixture, value => { value.modelReleaseValidFrom = '2026-07-21T00:11:00.000Z' }, /outside the signed overlay/)
  poisoned(fixture, value => { value.providerInvocationWindow.finishedAt = '2026-07-21T01:01:00.000Z' }, /outside the signed overlay/)
  poisoned(fixture, value => { value.exchangeInvocationObservations[0].shardId = digest('substituted-shard') }, /detached from validity\/window\/exchanges/)
  poisoned(fixture, value => { value.exchangeInvocationObservations[0].providerRunId = 'substituted-provider-run' }, /detached from validity\/window\/exchanges/)
  poisoned(fixture, value => { value.exchangeInvocationObservations[0].responseSha256 = digest('substituted-response') }, /detached from validity\/window\/exchanges/)
  poisoned(fixture, value => { value.exchangeInvocationObservations[0].observedAt = '2026-07-21T00:13:00.000Z' }, /duplicated, unordered, or outside/)
  poisoned(fixture, value => { value.exchangeInvocationObservations.push(structuredClone(value.exchangeInvocationObservations[0])) }, /duplicated, unordered, or outside/)

  const releaseState = { ...fixture.releaseState, byId: new Map(fixture.releaseState.byId) }
  releaseState.byId.set(fixture.binding.modelReleaseId, {
    ...releaseState.byId.get(fixture.binding.modelReleaseId),
    promotionEligible: true,
  })
  assert.throws(() => validate(fixture, fixture.binding, fixture.issuerRegistry, releaseState), /fail-closed canonical registry record/)
})

test('official source and revocation readbacks reject URL, transport, cache, content, time, and status poison', () => {
  const fixture = buildModelReleaseAuthorityFixture()
  poisoned(fixture, value => { value.sourceReadback.sourceUrl = 'https://example.com/models/gpt-5.6-sol' }, /official source readback URL/)
  poisoned(fixture, value => { value.sourceReadback.sourceHost = 'example.com' }, /official source readback URL/)
  poisoned(fixture, value => { value.sourceReadback.finalUrl = 'https://developers.openai.com/api/docs/models/gpt-5.6-sol?redirected=1' }, /official source readback URL/)
  poisoned(fixture, value => { value.sourceReadback.redirectCount = 1 })
  poisoned(fixture, value => { value.sourceReadback.tlsVersion = 'TLSv1.2' })
  poisoned(fixture, value => { value.sourceReadback.etag = null }, /official source readback URL/)
  poisoned(fixture, value => { value.sourceReadback.bodySha256 = digest('substituted-source-body') }, /detached from validity\/window\/exchanges/)
  poisoned(fixture, value => { value.sourceReadback.bodyBytes = 4194305 })
  poisoned(fixture, value => { value.sourceReadback.retrievedAt = '2026-07-21T00:11:00.000Z' }, /does not cover the provider invocation/)
  poisoned(fixture, value => { value.sourceReadback.expiresAt = '2026-07-21T00:11:30.000Z' }, /does not cover the provider invocation/)
  poisoned(fixture, value => { value.revocationReadback.registryUrl = 'https://managed-ci-authority.qijenchen.dev/v1/model-releases/other' }, /revocation readback URL/)
  poisoned(fixture, value => { value.revocationReadback.status = 'revoked' })
  poisoned(fixture, value => { value.revocationReadback.checkedAt = '2026-07-21T00:13:00.000Z' }, /does not cover provider completion/)
  poisoned(fixture, value => { value.revocationReadback.expiresAt = '2026-07-21T00:11:59.000Z' }, /validity interval is empty/)
})

test('receipt, append-only audit, replay, signature, issuer separation, and historical validity are closed', () => {
  const fixture = buildModelReleaseAuthorityFixture()
  poisoned(fixture, value => { value.authorityReceipt.sourceReadbackDigest = digest('substituted-source-readback') }, /detached from validity\/window\/exchanges/)
  poisoned(fixture, value => { value.authorityReceipt.issuedAt = '2026-07-21T00:11:59.000Z' }, /predates provider completion/)
  poisoned(fixture, value => { value.auditReadback.appendOnly = false })
  poisoned(fixture, value => { value.auditReadback.eventHeadDigest = digest('rewritten-audit-head') }, /signature is invalid/)
  poisoned(fixture, value => { value.auditReadback.authorityReceiptDigest = digest('substituted-authority-receipt') }, /append-only audit readback is detached/)
  poisoned(fixture, value => { value.auditReadback.replayLedgerReceiptDigest = digest('substituted-replay-ledger-receipt') }, /append-only audit readback is detached/)
  poisoned(fixture, value => { value.auditReadback.receiptId = 'fixture-other-receipt-1' }, /append-only audit readback is detached/)
  poisoned(fixture, value => { value.auditReadback.observedAt = '2026-07-21T00:12:59.000Z' }, /predates the authority receipt/)
  poisoned(fixture, value => { value.auditReadback.readbackId = value.sourceReadback.readbackId }, /identifiers or nonces are replayed/)
  poisoned(fixture, value => { value.auditReadback.nonce = value.sourceReadback.nonce }, /identifiers or nonces are replayed/)
  const invalidReceiptSignature = structuredClone(fixture.binding)
  invalidReceiptSignature.authorityReceipt.signature = `${invalidReceiptSignature.authorityReceipt.signature[0] === 'A' ? 'B' : 'A'}${invalidReceiptSignature.authorityReceipt.signature.slice(1)}`
  invalidReceiptSignature.auditReadback = fixture.signDocument('auditReadback', {
    ...invalidReceiptSignature.auditReadback,
    authorityReceiptDigest: digest(invalidReceiptSignature.authorityReceipt),
  }, 'audit')
  assert.throws(() => validate(fixture, invalidReceiptSignature), /authorityReceipt signature is invalid/)

  const collapsedReceipt = structuredClone(fixture.binding)
  collapsedReceipt.authorityReceipt = fixture.signDocument('authorityReceipt', collapsedReceipt.authorityReceipt, 'source')
  collapsedReceipt.auditReadback = fixture.signDocument('auditReadback', {
    ...collapsedReceipt.auditReadback,
    authorityReceiptDigest: digest(collapsedReceipt.authorityReceipt),
  }, 'audit')
  assert.throws(() => validate(fixture, collapsedReceipt), /issuers are not independently separated/)

  const collapsedAudit = structuredClone(fixture.binding)
  collapsedAudit.auditReadback = fixture.signDocument('auditReadback', collapsedAudit.auditReadback, 'source')
  assert.throws(() => validate(fixture, collapsedAudit), /issuers are not independently separated/)

  const laterRevokedRegistry = structuredClone(fixture.issuerRegistry)
  const receiptIssuer = laterRevokedRegistry.issuers.find(item => item.keyId === fixture.binding.authorityReceipt.issuerKeyId)
  receiptIssuer.status = 'revoked'
  receiptIssuer.revokedAt = '2026-08-01T00:00:00.000Z'
  assert.equal(validate(fixture, fixture.binding, laterRevokedRegistry).binding.modelReleaseId, fixture.binding.modelReleaseId)

  const alreadyRevokedRegistry = structuredClone(fixture.issuerRegistry)
  const alreadyRevoked = alreadyRevokedRegistry.issuers.find(item => item.keyId === fixture.binding.authorityReceipt.issuerKeyId)
  alreadyRevoked.status = 'revoked'
  alreadyRevoked.revokedAt = '2026-07-21T00:12:59.000Z'
  assert.throws(() => validate(fixture, fixture.binding, alreadyRevokedRegistry), /not valid for the signed historical interval/)
})

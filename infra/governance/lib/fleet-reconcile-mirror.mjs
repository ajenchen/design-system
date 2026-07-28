import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto'
import { invariant, sha256, stableStringify } from './common.mjs'

const clone = value => JSON.parse(JSON.stringify(value))

export const FLEET_RECONCILE_MIRROR_PROTOCOL = Object.freeze({
  protocolVersion: 'fleet-reconcile-mirror-v1',
  receiptKind: 'fleet-reconcile-off-host-ack',
  verificationKind: 'fleet-reconcile-off-host-verification',
  requestDigestDomain: 'fleet-reconcile-off-host-request-v1',
  eventIdempotencyDomain: 'fleet-reconcile-event-idempotency-v1',
  receiptDigestDomain: 'fleet-reconcile-off-host-receipt-v1',
  receiptSignatureDomain: 'fleet-reconcile-off-host-receipt-signature-v1',
  verificationDigestDomain: 'fleet-reconcile-off-host-verification-v1',
  verificationSignatureDomain: 'fleet-reconcile-off-host-verification-signature-v1',
  clockSkewMs: 5 * 60 * 1000,
})

export const FLEET_RECONCILE_MIRROR_IDENTITY_KEYS = Object.freeze([
  'protocolVersion',
  'provider',
  'endpoint',
  'tenant',
  'container',
  'wormMode',
  'lifecyclePolicyDigest',
  'minimumRetentionDays',
  'writerPrincipal',
  'verifierPrincipal',
  'adapterCommandSha256',
  'receiptSigningKeyId',
  'receiptSigningPublicKeySpki',
  'receiptSigningPublicKeySpkiSha256',
  'signatureAlgorithm',
])

const OFF_HOST_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'protocolVersion',
  'provider',
  'endpoint',
  'tenant',
  'container',
  'principal',
  'receiptId',
  'transactionId',
  'sequence',
  'eventDigest',
  'eventHeadDigest',
  'idempotencyKey',
  'requestNonce',
  'requestDigest',
  'receivedAt',
  'retainedUntil',
  'appendOnly',
  'independentAdministration',
  'signingKeyId',
  'signatureAlgorithm',
  'signature',
  'receiptSha256',
])

const OFF_HOST_VERIFICATION_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'protocolVersion',
  'provider',
  'endpoint',
  'tenant',
  'container',
  'principal',
  'verificationId',
  'transactionId',
  'eventHeadDigest',
  'eventCount',
  'requestNonce',
  'requestDigest',
  'verifiedAt',
  'retainedUntil',
  'appendOnly',
  'independentAdministration',
  'signingKeyId',
  'signatureAlgorithm',
  'signature',
  'verificationSha256',
])
const HEAD_VERIFICATION_REQUEST_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'protocolVersion',
  'provider',
  'endpoint',
  'tenant',
  'container',
  'principal',
  'transactionId',
  'eventHeadDigest',
  'eventCount',
  'requestNonce',
  'requestedAt',
  'requestDigest',
])
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function assertClosedKeys(value, allowed, message) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), message)
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${message}: unexpected field ${key}`)
}

export function fleetReconcileMirrorReceiptDigest(receipt) {
  const unsigned = clone(receipt)
  delete unsigned.receiptSha256
  return sha256(`${FLEET_RECONCILE_MIRROR_PROTOCOL.receiptDigestDomain}\n${stableStringify(unsigned, 0)}`)
}

export function fleetReconcileMirrorVerificationDigest(verification) {
  const unsigned = clone(verification)
  delete unsigned.verificationSha256
  return sha256(`${FLEET_RECONCILE_MIRROR_PROTOCOL.verificationDigestDomain}\n${stableStringify(unsigned, 0)}`)
}

export function fleetReconcileMirrorRequestDigest(request) {
  const unsigned = clone(request)
  delete unsigned.requestDigest
  return sha256(`${FLEET_RECONCILE_MIRROR_PROTOCOL.requestDigestDomain}\n${stableStringify(unsigned, 0)}`)
}

export function fleetReconcileMirrorSignedPayload(value, { digestField, domain }) {
  const unsigned = clone(value)
  delete unsigned.signature
  delete unsigned[digestField]
  return Buffer.from(`${domain}\n${stableStringify(unsigned, 0)}`, 'utf8')
}

export function validateFleetReconcileMirrorIdentity(identity) {
  assertClosedKeys(identity, new Set(FLEET_RECONCILE_MIRROR_IDENTITY_KEYS), 'Transaction journal mirror identity has an invalid or open shape')
  invariant(identity.protocolVersion === FLEET_RECONCILE_MIRROR_PROTOCOL.protocolVersion
    && typeof identity.provider === 'string' && identity.provider.length > 0
    && typeof identity.endpoint === 'string' && identity.endpoint.startsWith('https://')
    && typeof identity.tenant === 'string' && identity.tenant.length > 0
    && typeof identity.container === 'string' && identity.container.length > 0
    && identity.wormMode === 'compliance-object-lock'
    && /^[a-f0-9]{64}$/.test(identity.lifecyclePolicyDigest ?? '')
    && Number.isInteger(identity.minimumRetentionDays) && identity.minimumRetentionDays >= 30
    && typeof identity.writerPrincipal === 'string' && identity.writerPrincipal.length > 0
    && typeof identity.verifierPrincipal === 'string' && identity.verifierPrincipal.length > 0
    && identity.writerPrincipal !== identity.verifierPrincipal
    && /^[a-f0-9]{64}$/.test(identity.adapterCommandSha256 ?? '')
    && /^[a-z0-9][a-z0-9._-]*$/.test(identity.receiptSigningKeyId ?? '')
    && identity.signatureAlgorithm === 'ed25519', 'Transaction journal mirror identity is invalid')
  const keyBytes = Buffer.from(identity.receiptSigningPublicKeySpki ?? '', 'base64')
  invariant(keyBytes.length > 0 && keyBytes.toString('base64') === identity.receiptSigningPublicKeySpki
    && sha256(keyBytes) === identity.receiptSigningPublicKeySpkiSha256, 'Transaction journal mirror signing-key digest is invalid')
  let key
  try { key = createPublicKey({ key: keyBytes, format: 'der', type: 'spki' }) } catch { key = null }
  invariant(key?.asymmetricKeyType === 'ed25519', 'Transaction journal mirror signing key is not Ed25519')
  return key
}

export function verifyFleetReconcileMirrorSignature(value, identity, { digestField, domain }) {
  const key = validateFleetReconcileMirrorIdentity(identity)
  invariant(value.signingKeyId === identity.receiptSigningKeyId && value.signatureAlgorithm === identity.signatureAlgorithm, 'Off-host mirror response signing identity mismatch')
  invariant(typeof value.signature === 'string' && /^[A-Za-z0-9_-]+$/.test(value.signature), 'Off-host mirror response signature encoding is invalid')
  const signature = Buffer.from(value.signature, 'base64url')
  invariant(signature.length === 64 && signature.toString('base64url') === value.signature
    && verifySignature(null, fleetReconcileMirrorSignedPayload(value, { digestField, domain }), key, signature), 'Off-host mirror response signature is invalid')
}

export function buildFleetReconcileEventMirrorRequest(journal, event) {
  const request = {
    schemaVersion: 1,
    kind: 'fleet-reconcile-event',
    protocolVersion: journal.mirrorIdentity.protocolVersion,
    provider: journal.mirrorIdentity.provider,
    endpoint: journal.mirrorIdentity.endpoint,
    tenant: journal.mirrorIdentity.tenant,
    container: journal.mirrorIdentity.container,
    principal: journal.mirrorIdentity.writerPrincipal,
    transactionId: journal.transactionId,
    sequence: event.sequence,
    eventDigest: event.eventDigest,
    eventHeadDigest: event.eventDigest,
    idempotencyKey: sha256(`${FLEET_RECONCILE_MIRROR_PROTOCOL.eventIdempotencyDomain}\n${journal.transactionId}\n${event.sequence}\n${event.eventDigest}`),
    requestNonce: event.mirrorRequestNonce,
    event: clone(event),
    requestDigest: null,
  }
  request.requestDigest = fleetReconcileMirrorRequestDigest(request)
  return request
}

export function validateFleetReconcileOffHostReceipt(receipt, {
  journal,
  event,
  mirrorIdentity,
  request = buildFleetReconcileEventMirrorRequest(journal, event),
  at,
  requireFresh = false,
}) {
  assertClosedKeys(receipt, new Set(OFF_HOST_RECEIPT_KEYS), 'Off-host journal receipt has an invalid or open shape')
  invariant(receipt.schemaVersion === 1 && receipt.kind === FLEET_RECONCILE_MIRROR_PROTOCOL.receiptKind, 'Off-host journal receipt identity is invalid')
  invariant(receipt.protocolVersion === mirrorIdentity.protocolVersion
    && receipt.provider === mirrorIdentity.provider
    && receipt.endpoint === mirrorIdentity.endpoint
    && receipt.tenant === mirrorIdentity.tenant
    && receipt.container === mirrorIdentity.container
    && receipt.principal === mirrorIdentity.writerPrincipal, 'Off-host journal receipt differs from the activated mirror identity')
  invariant(typeof receipt.receiptId === 'string' && receipt.receiptId.length > 0, 'Off-host journal receipt id is missing')
  invariant(receipt.transactionId === journal.transactionId
    && receipt.sequence === event.sequence
    && receipt.eventDigest === event.eventDigest
    && receipt.eventHeadDigest === event.eventDigest
    && receipt.idempotencyKey === request.idempotencyKey
    && receipt.requestNonce === request.requestNonce
    && receipt.requestDigest === request.requestDigest, 'Off-host journal receipt event/request binding mismatch')
  invariant(receipt.appendOnly === true && receipt.independentAdministration === true, 'Off-host journal receipt is not independent append-only evidence')
  const receivedAt = new Date(receipt.receivedAt)
  const retainedUntil = new Date(receipt.retainedUntil)
  invariant(Number.isFinite(receivedAt.getTime()) && receivedAt.toISOString() === receipt.receivedAt, 'Off-host journal receipt receivedAt is invalid')
  invariant(
    receivedAt.getTime() <= at.getTime() + FLEET_RECONCILE_MIRROR_PROTOCOL.clockSkewMs
      && (!requireFresh
        || receivedAt.getTime() >= at.getTime() - FLEET_RECONCILE_MIRROR_PROTOCOL.clockSkewMs),
    'Off-host journal receipt acknowledgement time is invalid',
  )
  invariant(Number.isFinite(retainedUntil.getTime()) && retainedUntil.toISOString() === receipt.retainedUntil
    && retainedUntil.getTime() - at.getTime() >= mirrorIdentity.minimumRetentionDays * 86_400_000, 'Off-host journal receipt retention is invalid')
  verifyFleetReconcileMirrorSignature(receipt, mirrorIdentity, {
    digestField: 'receiptSha256',
    domain: FLEET_RECONCILE_MIRROR_PROTOCOL.receiptSignatureDomain,
  })
  invariant(receipt.receiptSha256 === fleetReconcileMirrorReceiptDigest(receipt), 'Off-host journal receipt digest mismatch')
  return true
}

export function buildFleetReconcileHeadVerificationRequest(journal, {
  mirrorIdentity = journal.mirrorIdentity,
  requestNonce = randomUUID(),
  requestedAt,
} = {}) {
  validateFleetReconcileMirrorIdentity(mirrorIdentity)
  const at = requestedAt instanceof Date ? requestedAt : new Date(requestedAt)
  invariant(Number.isFinite(at.getTime()) && at.toISOString() === (
    requestedAt instanceof Date ? requestedAt.toISOString() : requestedAt
  ), 'Off-host journal head-verification request time is invalid')
  invariant(typeof requestNonce === 'string' && UUID_V4.test(requestNonce),
    'Off-host journal head-verification nonce is invalid')
  invariant(
    /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(journal.eventHeadDigest ?? '')
      && Array.isArray(journal.events)
      && journal.events.length > 0,
    'Off-host journal head-verification source chain is invalid',
  )
  const request = {
    schemaVersion: 1,
    kind: 'fleet-reconcile-head-verification-request',
    protocolVersion: mirrorIdentity.protocolVersion,
    provider: mirrorIdentity.provider,
    endpoint: mirrorIdentity.endpoint,
    tenant: mirrorIdentity.tenant,
    container: mirrorIdentity.container,
    principal: mirrorIdentity.verifierPrincipal,
    transactionId: journal.transactionId,
    eventHeadDigest: journal.eventHeadDigest,
    eventCount: journal.events.length,
    requestNonce,
    requestedAt: at.toISOString(),
    requestDigest: null,
  }
  request.requestDigest = fleetReconcileMirrorRequestDigest(request)
  return request
}

export function validateFleetReconcileHeadVerificationRequest(request, {
  journal,
  mirrorIdentity = journal.mirrorIdentity,
  at,
}) {
  invariant(at instanceof Date && Number.isFinite(at.getTime()),
    'Off-host journal head-verification request time is invalid')
  validateFleetReconcileMirrorIdentity(mirrorIdentity)
  assertClosedKeys(request, new Set(HEAD_VERIFICATION_REQUEST_KEYS),
    'Off-host journal head-verification request has an invalid or open shape')
  invariant(
    Object.keys(request).length === HEAD_VERIFICATION_REQUEST_KEYS.length
      && request.schemaVersion === 1
      && request.kind === 'fleet-reconcile-head-verification-request'
      && request.protocolVersion === mirrorIdentity.protocolVersion
      && request.provider === mirrorIdentity.provider
      && request.endpoint === mirrorIdentity.endpoint
      && request.tenant === mirrorIdentity.tenant
      && request.container === mirrorIdentity.container
      && request.principal === mirrorIdentity.verifierPrincipal,
    'Off-host journal head-verification request differs from the activated mirror identity',
  )
  invariant(
    request.transactionId === journal.transactionId
      && request.eventHeadDigest === journal.eventHeadDigest
      && request.eventCount === journal.events.length
      && request.eventCount > 0
      && UUID_V4.test(request.requestNonce ?? ''),
    'Off-host journal head-verification request differs from the complete event chain',
  )
  const requestedAt = new Date(request.requestedAt)
  invariant(
    Number.isFinite(requestedAt.getTime())
      && requestedAt.toISOString() === request.requestedAt
      && requestedAt.getTime() === at.getTime(),
    'Off-host journal head-verification request timestamp is invalid or substituted',
  )
  invariant(
    request.requestDigest === fleetReconcileMirrorRequestDigest(request),
    'Off-host journal head-verification request digest mismatch',
  )
  return request
}

export function validateFleetReconcileHeadVerification(verification, {
  journal,
  mirrorIdentity = journal.mirrorIdentity,
  request,
  at,
}) {
  invariant(at instanceof Date && Number.isFinite(at.getTime()),
    'Off-host journal verification time is invalid')
  validateFleetReconcileMirrorIdentity(mirrorIdentity)
  validateFleetReconcileHeadVerificationRequest(request, {
    journal,
    mirrorIdentity,
    at,
  })
  assertClosedKeys(verification, new Set(OFF_HOST_VERIFICATION_KEYS), 'Off-host journal verification has an invalid or open shape')
  invariant(verification.schemaVersion === 1 && verification.kind === FLEET_RECONCILE_MIRROR_PROTOCOL.verificationKind, 'Off-host journal verification identity is invalid')
  invariant(verification.protocolVersion === mirrorIdentity.protocolVersion
    && verification.provider === mirrorIdentity.provider
    && verification.endpoint === mirrorIdentity.endpoint
    && verification.tenant === mirrorIdentity.tenant
    && verification.container === mirrorIdentity.container
    && verification.principal === mirrorIdentity.verifierPrincipal, 'Off-host journal verification differs from the activated mirror identity')
  invariant(typeof verification.verificationId === 'string' && verification.verificationId.length > 0, 'Off-host journal verification id is missing')
  invariant(verification.transactionId === journal.transactionId
    && verification.eventHeadDigest === journal.eventHeadDigest
    && verification.eventCount === journal.events.length
    && verification.requestNonce === request.requestNonce
    && verification.requestDigest === request.requestDigest, 'Off-host journal verification does not match the complete local event chain or nonce')
  invariant(verification.appendOnly === true && verification.independentAdministration === true, 'Off-host journal verification is not independent append-only evidence')
  const verifiedAt = new Date(verification.verifiedAt)
  const retainedUntil = new Date(verification.retainedUntil)
  invariant(Number.isFinite(verifiedAt.getTime()) && verifiedAt.toISOString() === verification.verifiedAt
    && verifiedAt.getTime() >= at.getTime() - FLEET_RECONCILE_MIRROR_PROTOCOL.clockSkewMs
    && verifiedAt.getTime() <= at.getTime() + FLEET_RECONCILE_MIRROR_PROTOCOL.clockSkewMs, 'Off-host journal verification is not live')
  invariant(Number.isFinite(retainedUntil.getTime()) && retainedUntil.toISOString() === verification.retainedUntil
    && retainedUntil.getTime() - at.getTime() >= mirrorIdentity.minimumRetentionDays * 86_400_000, 'Off-host journal verification retention is invalid')
  verifyFleetReconcileMirrorSignature(verification, mirrorIdentity, {
    digestField: 'verificationSha256',
    domain: FLEET_RECONCILE_MIRROR_PROTOCOL.verificationSignatureDomain,
  })
  invariant(verification.verificationSha256 === fleetReconcileMirrorVerificationDigest(verification), 'Off-host journal verification digest mismatch')
  return verification
}

export function verifyFleetReconcileJournalOffHost(journal, offHostMirror, {
  mirrorIdentity = journal.mirrorIdentity,
  at,
}) {
  invariant(at instanceof Date && Number.isFinite(at.getTime()), 'Off-host journal verification time is invalid')
  invariant(offHostMirror && typeof offHostMirror.verify === 'function', 'Transaction journal requires live verification from its off-host append-only mirror')
  validateFleetReconcileMirrorIdentity(mirrorIdentity)
  invariant(offHostMirror.adapterCommandSha256 === mirrorIdentity.adapterCommandSha256, 'Off-host mirror adapter artifact differs from the signed activation identity')
  const request = buildFleetReconcileHeadVerificationRequest(journal, {
    mirrorIdentity,
    requestedAt: at,
  })
  const verification = clone(offHostMirror.verify(request))
  return validateFleetReconcileHeadVerification(verification, {
    journal,
    mirrorIdentity,
    request,
    at,
  })
}

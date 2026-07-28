import { createHash, verify } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  issuerRegistryDigest,
  publicKeyFromIssuer,
  validateIssuerRegistry,
} from '../../infra/governance/lib/issuer-registry.mjs'

export const MODEL_RELEASE_AUTHORITY_POLICY_PATH = 'infra/governance/providers/managed-ci-model-release-authority-policy.json'
export const MODEL_RELEASE_AUTHORITY_POLICY_SCHEMA_PATH = 'infra/governance/schemas/managed-ci-model-release-authority-policy.schema.json'
export const MODEL_RELEASE_AUTHORITY_BINDING_SCHEMA_PATH = 'infra/governance/schemas/managed-ci-model-release-authority-binding.schema.json'

const DOCUMENT_FIELDS = Object.freeze({
  authorityReceipt: 'authorityReceipt',
  sourceReadback: 'sourceReadback',
  revocationReadback: 'revocationReadback',
  auditReadback: 'auditReadback',
})

function fail(message) {
  throw new Error(`model release authority blocked:${message}`)
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
}

export const stableModelReleaseAuthorityStringify = value => JSON.stringify(normalize(value))
export const modelReleaseAuthoritySha256 = value => createHash('sha256').update(value).digest('hex')

function safeRegularFile(repoRoot, path, label) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || isAbsolute(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) fail(`${label} path is unsafe`)
  const root = realpathSync(resolve(repoRoot))
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes repository`)
  let cursor = root
  for (const segment of rel.split(sep)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor)) fail(`${label} is missing:${path}`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link:${path}`)
    if (cursor === target && (!info.isFile() || info.nlink !== 1)) fail(`${label} must be one unique regular file:${path}`)
  }
  return target
}

function readJson(repoRoot, path, label) {
  const bytes = readFileSync(safeRegularFile(repoRoot, path, label))
  if (bytes.length === 0) fail(`${label} is empty`)
  try { return { value: JSON.parse(bytes), bytes } } catch (error) { fail(`${label} is invalid JSON:${error.message}`) }
}

function validator(schema, label) {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  let validate
  try { validate = ajv.compile(schema) } catch (error) { fail(`${label} cannot compile:${error.message}`) }
  return value => {
    if (!validate(value)) fail(`${label} failed:${ajv.errorsText(validate.errors, { separator: '; ' })}`)
  }
}

function exact(value, expected, label) {
  if (stableModelReleaseAuthorityStringify(value) !== stableModelReleaseAuthorityStringify(expected)) fail(`${label} differs from its canonical binding`)
}

function canonicalTime(value, label) {
  if (typeof value !== 'string') fail(`${label} must be canonical UTC`)
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) fail(`${label} must be canonical UTC`)
  return milliseconds
}

function canonicalHttps(value, label) {
  let parsed
  try { parsed = new URL(value) } catch { fail(`${label} is not a URL`) }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) fail(`${label} must be credential-free HTTPS without a fragment`)
  return parsed
}

function documentDigest(document) {
  return modelReleaseAuthoritySha256(stableModelReleaseAuthorityStringify(document))
}

function signatureBytes(value, label) {
  if (typeof value !== 'string') fail(`${label} signature is missing`)
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.length !== 64 || bytes.toString('base64url') !== value) fail(`${label} signature is not canonical Ed25519 base64url`)
  return bytes
}

function signedPayload(document) {
  const { signature: _signature, ...payload } = document
  return payload
}

export function loadModelReleaseAuthorityPolicy({ repoRoot = process.cwd() } = {}) {
  const root = realpathSync(resolve(repoRoot))
  const policyRead = readJson(root, MODEL_RELEASE_AUTHORITY_POLICY_PATH, 'model release authority policy')
  const policySchemaRead = readJson(root, MODEL_RELEASE_AUTHORITY_POLICY_SCHEMA_PATH, 'model release authority policy schema')
  const bindingSchemaRead = readJson(root, MODEL_RELEASE_AUTHORITY_BINDING_SCHEMA_PATH, 'model release authority binding schema')
  validator(policySchemaRead.value, 'model release authority policy schema')(policyRead.value)
  const validateBindingSchema = validator(bindingSchemaRead.value, 'model release authority binding schema')
  return {
    root,
    policy: policyRead.value,
    policyDigest: modelReleaseAuthoritySha256(policyRead.bytes),
    policySchemaDigest: modelReleaseAuthoritySha256(policySchemaRead.bytes),
    bindingSchemaDigest: modelReleaseAuthoritySha256(bindingSchemaRead.bytes),
    validateBindingSchema,
  }
}

export function modelReleaseAuthorityDocumentSigningBytes(policyState, documentKind, document) {
  const field = DOCUMENT_FIELDS[documentKind]
  if (!field || !policyState?.policy?.signingDomains?.[field]) fail(`unknown authority document kind:${String(documentKind)}`)
  return Buffer.from(`${policyState.policy.signingDomains[field]}\0${stableModelReleaseAuthorityStringify(signedPayload(document))}`, 'utf8')
}

function issuerForDocument({ issuerRegistry, document, policyState, documentKind, signedAt, expiresAt }) {
  const matches = issuerRegistry.issuers.filter(issuer => issuer.keyId === document.issuerKeyId)
  if (matches.length !== 1 || matches[0].subject !== document.issuerSubject) fail(`${documentKind} issuer is not exactly registered`)
  const issuer = matches[0]
  if (!issuer.roles.includes(policyState.policy.issuerRole)) fail(`${documentKind} issuer lacks ${policyState.policy.issuerRole}`)
  const notBefore = canonicalTime(issuer.notBefore, `${documentKind} issuer notBefore`)
  const notAfter = canonicalTime(issuer.notAfter, `${documentKind} issuer notAfter`)
  const revokedAt = issuer.revokedAt === null ? null : canonicalTime(issuer.revokedAt, `${documentKind} issuer revokedAt`)
  if (signedAt < notBefore || expiresAt > notAfter || (revokedAt !== null && revokedAt <= signedAt)) {
    fail(`${documentKind} issuer was not valid for the signed historical interval`)
  }
  const bytes = modelReleaseAuthorityDocumentSigningBytes(policyState, documentKind, document)
  if (!verify(null, bytes, publicKeyFromIssuer(issuer), signatureBytes(document.signature, documentKind))) fail(`${documentKind} signature is invalid`)
  return issuer
}

function validateDocumentInterval(document, issuedField, policy, label) {
  const issuedAt = canonicalTime(document[issuedField], `${label} ${issuedField}`)
  const expiresAt = canonicalTime(document.expiresAt, `${label} expiresAt`)
  if (expiresAt <= issuedAt || expiresAt - issuedAt > policy.maximumReceiptTtlSeconds * 1000) fail(`${label} validity interval is empty or exceeds policy`)
  return { issuedAt, expiresAt }
}

function identityProjection(binding, providerId) {
  return {
    providerId,
    requestModelId: binding.requestModelId,
    modelReleaseId: binding.modelReleaseId,
    modelReleaseBindingDigest: binding.modelReleaseBindingDigest,
    modelReleaseRegistryDigest: binding.modelReleaseRegistryDigest,
  }
}

function assertDocumentIdentity(document, identity, label, { includeResponse = false, includePolicy = false } = {}) {
  for (const [key, value] of Object.entries(identity)) if (document[key] !== value) fail(`${label} ${key} is detached`)
  if (includeResponse && document.observedResponseModelId !== identity.requestModelId) fail(`${label} response model identity is detached`)
  if (includePolicy && document.modelIdentityPolicyDigest === undefined) fail(`${label} model identity policy is missing`)
}

export function validateModelReleaseAuthorityBinding(binding, {
  repoRoot = process.cwd(),
  policyState = null,
  releaseState,
  profileState,
  issuerRegistry,
} = {}) {
  const state = policyState ?? loadModelReleaseAuthorityPolicy({ repoRoot })
  state.validateBindingSchema(binding)
  if (!releaseState?.byId || !profileState?.profiles || !issuerRegistry) fail('release registry, invocation profiles, and issuer registry are required')
  validateIssuerRegistry(issuerRegistry)

  if (binding.observedResponseModelId !== binding.requestModelId) fail('observed response model differs from the requested immutable model')
  const slash = binding.modelReleaseId.indexOf('/')
  const providerId = binding.modelReleaseId.slice(0, slash)
  if (binding.modelReleaseId !== `${providerId}/${binding.requestModelId}`) fail('model release ID is detached from provider/request model')
  const profile = profileState.profiles[providerId]
  if (!profile || profile.providerId !== providerId
    || !profile.modelIdentity.allowedModelReleaseIds.includes(binding.modelReleaseId)) fail('model release is not allowed by the selected provider profile')
  const record = releaseState.byId.get(binding.modelReleaseId)
  if (!record || record.id !== binding.modelReleaseId || record.providerId !== providerId
    || record.requestModelId !== binding.requestModelId
    || record.responseModelPolicy?.expectedModelId !== binding.requestModelId
    || record.promotionEligible !== false) fail('model release is detached from the fail-closed canonical registry record')
  if (binding.modelReleaseRegistryDigest !== releaseState.registryDigest
    || binding.modelReleaseBindingDigest !== modelReleaseAuthoritySha256(stableModelReleaseAuthorityStringify(record))
    || binding.modelIdentityPolicyDigest !== modelReleaseAuthoritySha256(stableModelReleaseAuthorityStringify(profile.modelIdentity))) {
    fail('model release registry/record/profile policy digest is inconsistent')
  }

  const validFrom = canonicalTime(binding.modelReleaseValidFrom, 'model release validFrom')
  const validUntil = canonicalTime(binding.modelReleaseValidUntil, 'model release validUntil')
  const startedAt = canonicalTime(binding.providerInvocationWindow.startedAt, 'provider invocation startedAt')
  const finishedAt = canonicalTime(binding.providerInvocationWindow.finishedAt, 'provider invocation finishedAt')
  if (validFrom < canonicalTime(record.validFrom, 'registry record validFrom')
    || validUntil <= validFrom || !(validFrom <= startedAt && startedAt < finishedAt && finishedAt <= validUntil)
    || (record.validUntil !== null && validUntil > canonicalTime(record.validUntil, 'registry record validUntil'))) {
    fail('provider invocation is outside the signed overlay and canonical record validity')
  }

  const shardIds = new Set()
  const providerRunIds = new Set()
  for (let index = 0; index < binding.exchangeInvocationObservations.length; index += 1) {
    const observation = binding.exchangeInvocationObservations[index]
    const observedAt = canonicalTime(observation.observedAt, `exchange observation ${index}`)
    if (shardIds.has(observation.shardId) || providerRunIds.has(observation.providerRunId)
      || observedAt < startedAt || observedAt > finishedAt
      || (index > 0 && observation.observedAt <= binding.exchangeInvocationObservations[index - 1].observedAt)) {
      fail('exchange observations are duplicated, unordered, or outside the provider invocation window')
    }
    shardIds.add(observation.shardId)
    providerRunIds.add(observation.providerRunId)
  }

  const identity = identityProjection(binding, providerId)
  const source = binding.sourceReadback
  const revocation = binding.revocationReadback
  const receipt = binding.authorityReceipt
  const audit = binding.auditReadback
  assertDocumentIdentity(source, identity, 'source readback', { includePolicy: true })
  assertDocumentIdentity(revocation, identity, 'revocation readback')
  assertDocumentIdentity(receipt, identity, 'authority receipt', { includeResponse: true, includePolicy: true })
  assertDocumentIdentity(audit, identity, 'audit readback')
  if (source.modelIdentityPolicyDigest !== binding.modelIdentityPolicyDigest
    || receipt.modelIdentityPolicyDigest !== binding.modelIdentityPolicyDigest) fail('authority source/receipt identity policy digest is detached')

  const reviewedSource = record.reviewedDocumentationAssertion.reference
  const sourceUrl = canonicalHttps(source.sourceUrl, 'source readback sourceUrl')
  const finalSourceUrl = canonicalHttps(source.finalUrl, 'source readback finalUrl')
  if (source.sourceUrl !== reviewedSource || source.finalUrl !== source.sourceUrl
    || source.sourceHost !== sourceUrl.hostname || finalSourceUrl.hostname !== source.sourceHost
    || !state.policy.allowedSourceHosts.includes(source.sourceHost)
    || source.redirectCount !== state.policy.maximumRedirects || source.tlsVersion !== state.policy.minimumTlsVersion
    || (source.etag === null && source.lastModified === null)) fail('official source readback URL/host/redirect/TLS/cache validators are invalid')
  const sourceInterval = validateDocumentInterval(source, 'retrievedAt', state.policy, 'source readback')
  if (sourceInterval.issuedAt > startedAt || sourceInterval.expiresAt < finishedAt) fail('official source readback does not cover the provider invocation')

  const revocationUrl = canonicalHttps(revocation.registryUrl, 'revocation registryUrl')
  const finalRevocationUrl = canonicalHttps(revocation.finalUrl, 'revocation finalUrl')
  if (revocation.registryUrl !== state.policy.revocationRegistryUrl || revocation.finalUrl !== revocation.registryUrl
    || revocation.registryHost !== revocationUrl.hostname || finalRevocationUrl.hostname !== revocation.registryHost
    || revocation.registryHost !== state.policy.authorityEndpointHost
    || revocation.redirectCount !== state.policy.maximumRedirects || revocation.tlsVersion !== state.policy.minimumTlsVersion
    || (revocation.etag === null && revocation.lastModified === null) || revocation.status !== 'not-revoked') {
    fail('revocation readback URL/host/redirect/TLS/validator/status is invalid')
  }
  const revocationInterval = validateDocumentInterval(revocation, 'checkedAt', state.policy, 'revocation readback')
  if (revocationInterval.issuedAt > finishedAt || revocationInterval.expiresAt < finishedAt) fail('revocation readback does not cover provider completion')

  const windowDigest = modelReleaseAuthoritySha256(stableModelReleaseAuthorityStringify(binding.providerInvocationWindow))
  const observationsDigest = modelReleaseAuthoritySha256(stableModelReleaseAuthorityStringify(binding.exchangeInvocationObservations))
  const sourceDigest = documentDigest(source)
  const revocationDigest = documentDigest(revocation)
  if (receipt.tenantId !== state.policy.tenantId
    || receipt.modelReleaseValidFrom !== binding.modelReleaseValidFrom || receipt.modelReleaseValidUntil !== binding.modelReleaseValidUntil
    || receipt.providerInvocationWindowDigest !== windowDigest || receipt.exchangeInvocationObservationsDigest !== observationsDigest
    || receipt.sourceReadbackDigest !== sourceDigest || receipt.revocationReadbackDigest !== revocationDigest) {
    fail('authority receipt is detached from validity/window/exchanges/source/revocation evidence')
  }
  const receiptInterval = validateDocumentInterval(receipt, 'issuedAt', state.policy, 'authority receipt')
  if (receiptInterval.issuedAt < finishedAt || receiptInterval.expiresAt < receiptInterval.issuedAt) fail('authority receipt predates provider completion')
  const receiptDigest = documentDigest(receipt)

  const auditUrl = canonicalHttps(audit.auditUrl, 'audit readback auditUrl')
  const finalAuditUrl = canonicalHttps(audit.finalUrl, 'audit readback finalUrl')
  if (audit.auditUrl !== state.policy.auditReadbackUrl || audit.finalUrl !== audit.auditUrl
    || audit.auditHost !== auditUrl.hostname || finalAuditUrl.hostname !== audit.auditHost
    || audit.auditHost !== state.policy.authorityEndpointHost
    || audit.redirectCount !== state.policy.maximumRedirects || audit.tlsVersion !== state.policy.minimumTlsVersion
    || audit.appendOnly !== true || audit.receiptId !== receipt.receiptId
    || audit.authorityReceiptDigest !== receiptDigest || audit.sourceReadbackDigest !== sourceDigest
    || audit.revocationReadbackDigest !== revocationDigest
    || audit.replayLedgerReceiptDigest !== receipt.replayLedgerReceiptDigest) fail('append-only audit readback is detached from the receipt/source/revocation/replay evidence')
  const auditInterval = validateDocumentInterval(audit, 'observedAt', state.policy, 'audit readback')
  if (auditInterval.issuedAt < receiptInterval.issuedAt || auditInterval.expiresAt < auditInterval.issuedAt) fail('audit readback predates the authority receipt')

  const identifiers = [receipt.receiptId, source.readbackId, revocation.readbackId, audit.readbackId, audit.eventId]
  const nonces = [receipt.nonce, source.nonce, revocation.nonce, audit.nonce]
  if (new Set(identifiers).size !== identifiers.length || new Set(nonces).size !== nonces.length) fail('authority receipt/readback identifiers or nonces are replayed')

  const sourceIssuer = issuerForDocument({ issuerRegistry, document: source, policyState: state, documentKind: 'sourceReadback', signedAt: sourceInterval.issuedAt, expiresAt: sourceInterval.expiresAt })
  const revocationIssuer = issuerForDocument({ issuerRegistry, document: revocation, policyState: state, documentKind: 'revocationReadback', signedAt: revocationInterval.issuedAt, expiresAt: revocationInterval.expiresAt })
  const receiptIssuer = issuerForDocument({ issuerRegistry, document: receipt, policyState: state, documentKind: 'authorityReceipt', signedAt: receiptInterval.issuedAt, expiresAt: receiptInterval.expiresAt })
  const auditIssuer = issuerForDocument({ issuerRegistry, document: audit, policyState: state, documentKind: 'auditReadback', signedAt: auditInterval.issuedAt, expiresAt: auditInterval.expiresAt })
  if (receiptIssuer.keyId === sourceIssuer.keyId || receiptIssuer.keyId === revocationIssuer.keyId || receiptIssuer.keyId === auditIssuer.keyId
    || auditIssuer.keyId === sourceIssuer.keyId || auditIssuer.keyId === revocationIssuer.keyId) fail('authority receipt/source-revocation/audit issuers are not independently separated')

  const digests = {
    modelAuthorityReceiptDigest: receiptDigest,
    modelAuthorityReadbackDigest: sourceDigest,
    modelAuthorityRevocationRegistryDigest: revocation.bodySha256,
    modelAuthorityRevocationReadbackDigest: revocationDigest,
    modelAuthorityAuditReadbackDigest: documentDigest(audit),
    providerInvocationWindowDigest: windowDigest,
    exchangeInvocationObservationsDigest: observationsDigest,
    authorityPolicyDigest: state.policyDigest,
    authorityBindingSchemaDigest: state.bindingSchemaDigest,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
  }
  return {
    binding: structuredClone(binding),
    digests,
    exchangeInvocationObservations: structuredClone(binding.exchangeInvocationObservations),
  }
}

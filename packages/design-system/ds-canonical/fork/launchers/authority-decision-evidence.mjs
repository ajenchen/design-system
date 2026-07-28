import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

export const AUTHORITY_DECISION_RECEIPT_KIND = 'provider-neutral-authority-decision-receipt'
export const AUTHORITY_DECISION_RECEIPT_SCHEMA_VERSION = 2
export const AUTHORITY_DECISION_POLICY_ID = 'canonical-decision-authority-v1'
export const AUTHORITY_DECISION_CLASSIFIER_ID = 'approval-evidence-v1'

const AUTHORITY_START = '<!-- canonical-decision-authority:start -->'
const AUTHORITY_END = '<!-- canonical-decision-authority:end -->'
const SHA256 = /^sha256:[a-f0-9]{64}$/
const PROVIDER_ID = /^[a-z][a-z0-9-]*$/
const RUNTIME_SURFACE = /^[a-z0-9][a-z0-9._/-]{0,255}$/
const MAX_TARGET_BYTES = 16 * 1024
const MAX_OPERATION_BYTES = 16 * 1024 * 1024
const MAX_USER_MESSAGE_BYTES = 4 * 1024 * 1024
const MAX_USER_MESSAGES_BYTES = 16 * 1024 * 1024
const MAX_USER_MESSAGE_COUNT = 4096
const MAX_SCOPE_VALUE_BYTES = 4096

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')))
        .map((key) => [key, canonicalize(value[key])]),
    )
  }
  return value
}

function stableJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`
}

function digest(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === 'string' ? value : stableJson(value))
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

const RECEIPT_KEYS = Object.freeze([
  'binding',
  'classification',
  'classificationMode',
  'kind',
  'receiptDigest',
  'schemaVersion',
  'source',
  'trust',
])
const BINDING_KEYS = Object.freeze([
  'operationEvidenceDigest',
  'providerId',
  'runtimeSurface',
  'scopeNonceDigest',
  'sessionDigest',
  'target',
  'userMessagesDigest',
])
const SOURCE_KEYS = Object.freeze([
  'authorityPolicy',
  'authorityPolicyDigest',
  'classifier',
  'classifierDigest',
  'providerRegistry',
  'providerRegistryDigest',
  'receiptContract',
  'receiptContractDigest',
])
const TRUST_KEYS = Object.freeze([
  'contentAddressed',
  'promotionEligible',
  'rawAuthorityTextStored',
  'rawOperationTextStored',
  'runtimeCertification',
])
const CLASSIFICATION_KEYS = Object.freeze([
  'allowedScopes',
  'decision',
  'decisionDomain',
  'decisionMessageSha256',
  'deniedOrAmbiguousScopes',
  'humanOnlyScopes',
  'latestUserMessageSha256',
  'operationEvidenceSha256',
  'reasonCode',
  'target',
  'targetBinding',
])
const CLASSIFICATION_SCOPE_IDS = new Set([
  'account-holder-platform-action',
  'approved-ui-ux-implementation',
  'consumer-template-adoption',
  'credential-reference-required',
  'current-target-operation',
  'engineering-execution',
  'external-activation',
  'github-configuration',
  'legal-account-organization-business-decision',
  'mechanical-approved-ssot-projection',
  'package-release',
  'plan-external-spend',
  'product-ui-ux-change',
  'product-ui-ux-decision',
  'protected-git-delivery',
  'rollback-recovery',
  'rollout',
  'runtime-certification',
  'testing-and-harness',
])

export class AuthorityDecisionEvidenceError extends Error {
  constructor(code, detail) {
    super(`authority decision evidence blocked:${code}:${detail}`)
    this.name = 'AuthorityDecisionEvidenceError'
    this.code = code
  }
}

function block(code, detail) {
  throw new AuthorityDecisionEvidenceError(code, detail)
}

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    block('RECEIPT_SHAPE_INVALID', `${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    block('RECEIPT_SHAPE_INVALID', `${label} has an open or incomplete shape`)
  }
  return value
}

function exactString(value, label, maximumBytes, { pattern = null, allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    block('INPUT_INVALID', `${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string`)
  }
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes > maximumBytes || value.includes('\0')) {
    block('INPUT_INVALID', `${label} exceeds its closed byte or character contract`)
  }
  if (pattern && !pattern.test(value)) block('INPUT_INVALID', `${label} has an invalid format`)
  return value
}

function exactBytes(value, label) {
  if (!(typeof value === 'string' || Buffer.isBuffer(value) || ArrayBuffer.isView(value))) {
    block('INPUT_INVALID', `${label} bytes are unavailable`)
  }
  return Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value)
}

function exactDigest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    block('RECEIPT_SHAPE_INVALID', `${label} is not a canonical sha256 digest`)
  }
  return value
}

function exactBoolean(value, expected, label) {
  if (value !== expected) block('RECEIPT_SHAPE_INVALID', `${label} is invalid`)
}

function normalizedUserMessages(value) {
  if (!Array.isArray(value) || value.length > MAX_USER_MESSAGE_COUNT) {
    block('INPUT_INVALID', 'userMessages must be one bounded array')
  }
  let aggregate = 0
  const messages = value.map((message, index) => {
    exactString(message, `userMessages[${index}]`, MAX_USER_MESSAGE_BYTES, { allowEmpty: false })
    aggregate += Buffer.byteLength(message, 'utf8')
    if (aggregate > MAX_USER_MESSAGES_BYTES) {
      block('INPUT_INVALID', 'userMessages exceed the aggregate byte contract')
    }
    return message
  })
  return messages
}

function registeredProvider(registry, providerId) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)
    || !Array.isArray(registry.providers)) {
    block('PROVIDER_REGISTRY_INVALID', 'provider registry has no closed provider list')
  }
  exactString(providerId, 'providerId', 128, { pattern: PROVIDER_ID })
  const matches = registry.providers.filter((provider) => provider?.id === providerId)
  if (matches.length !== 1) {
    block(matches.length === 0 ? 'PROVIDER_UNKNOWN' : 'PROVIDER_REGISTRY_INVALID', providerId)
  }
  return matches[0]
}

function canonicalAuthorityPolicy(bytes) {
  const text = exactBytes(bytes, 'authority policy').toString('utf8')
  const start = text.indexOf(AUTHORITY_START)
  const end = text.indexOf(AUTHORITY_END)
  if (start < 0 || end < start
    || text.indexOf(AUTHORITY_START, start + AUTHORITY_START.length) >= 0
    || text.indexOf(AUTHORITY_END, end + AUTHORITY_END.length) >= 0) {
    block('AUTHORITY_POLICY_INVALID', 'canonical authority markers must occur exactly once')
  }
  return `${text.slice(start, end + AUTHORITY_END.length)}\n`
}

function classifierFunctions(classifier) {
  if (!classifier || typeof classifier !== 'object'
    || typeof classifier.classifyLatestAuthorization !== 'function'
    || typeof classifier.classifyOperationAuthorization !== 'function') {
    block('CLASSIFIER_INVALID', 'canonical authority classifier functions are unavailable')
  }
  return classifier
}

function classificationScopes(value, label) {
  if (!Array.isArray(value)
    || value.some((scope) => typeof scope !== 'string' || !CLASSIFICATION_SCOPE_IDS.has(scope))) {
    block('CLASSIFIER_INVALID', `${label} is not one closed scope list`)
  }
  const sorted = [...value].sort((left, right) => (
    Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
  ))
  if (new Set(value).size !== value.length
    || value.some((scope, index) => scope !== sorted[index])) {
    block('CLASSIFIER_INVALID', `${label} is not sorted and unique`)
  }
  return value
}

function classificationResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !['approved', 'blocked'].includes(value.decision)
    || !['engineering-remediation', 'product-ui-ux', 'unknown'].includes(value.decisionDomain)
    || typeof value.reasonCode !== 'string'
    || typeof value.operationEvidenceSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.operationEvidenceSha256)) {
    block('CLASSIFIER_INVALID', 'canonical classifier returned an invalid decision')
  }
  const actualKeys = Object.keys(value).sort()
  const expectedKeys = [...CLASSIFICATION_KEYS].sort()
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    block('CLASSIFIER_INVALID', 'canonical classifier returned an open or incomplete decision')
  }
  const scopeLists = [
    classificationScopes(value.allowedScopes, 'classification.allowedScopes'),
    classificationScopes(value.humanOnlyScopes, 'classification.humanOnlyScopes'),
    classificationScopes(
      value.deniedOrAmbiguousScopes,
      'classification.deniedOrAmbiguousScopes',
    ),
  ]
  const allScopes = scopeLists.flat()
  if (new Set(allScopes).size !== allScopes.length) {
    block('CLASSIFIER_INVALID', 'classification scope lists overlap')
  }
  return canonicalize(value)
}

function receiptPayload({
  authorityPolicyBytes,
  classifierSourceBytes,
  receiptContractSourceBytes,
  classifier,
  providerRegistry,
  providerRegistrySource = 'packages/governance/canonical/providers.json',
  providerId,
  runtimeSurface,
  sessionId,
  scopeNonce,
  target,
  operationText,
  userMessages,
}) {
  registeredProvider(providerRegistry, providerId)
  exactString(providerRegistrySource, 'providerRegistrySource', 512)
  if (providerRegistrySource.includes('\\')
    || providerRegistrySource.startsWith('/')
    || providerRegistrySource.split('#', 1)[0].split('/').some((segment) => (
      !segment || segment === '.' || segment === '..'
    ))) {
    block('INPUT_INVALID', 'providerRegistrySource is not one canonical repository reference')
  }
  exactString(runtimeSurface, 'runtimeSurface', 256, { pattern: RUNTIME_SURFACE })
  exactString(sessionId, 'sessionId', MAX_SCOPE_VALUE_BYTES)
  exactString(scopeNonce, 'scopeNonce', MAX_SCOPE_VALUE_BYTES)
  exactString(target, 'target', MAX_TARGET_BYTES)
  exactString(operationText, 'operationText', MAX_OPERATION_BYTES, { allowEmpty: true })
  const messages = normalizedUserMessages(userMessages)
  const functions = classifierFunctions(classifier)
  const classificationMode = messages.length ? 'user-context' : 'operation-only'
  const classification = classificationResult(messages.length
    ? functions.classifyLatestAuthorization(messages.at(-1), {
      target,
      operationText,
      userMessages: messages,
    })
    : functions.classifyOperationAuthorization({ target, operationText }))
  const authorityPolicy = canonicalAuthorityPolicy(authorityPolicyBytes)
  const classifierBytes = exactBytes(classifierSourceBytes, 'classifier source')
  const receiptContractBytes = exactBytes(receiptContractSourceBytes, 'receipt contract source')
  return canonicalize({
    schemaVersion: AUTHORITY_DECISION_RECEIPT_SCHEMA_VERSION,
    kind: AUTHORITY_DECISION_RECEIPT_KIND,
    source: {
      authorityPolicy: 'AGENTS.md#canonical-decision-authority',
      authorityPolicyDigest: digest(authorityPolicy),
      classifier: 'packages/design-system/ds-canonical/hooks/lib/approval-evidence.mjs',
      classifierDigest: digest(classifierBytes),
      providerRegistry: providerRegistrySource,
      providerRegistryDigest: digest(providerRegistry),
      receiptContract: 'packages/governance/src/authority-decision-evidence.mjs',
      receiptContractDigest: digest(receiptContractBytes),
    },
    binding: {
      providerId,
      runtimeSurface,
      sessionDigest: digest(sessionId),
      scopeNonceDigest: digest(scopeNonce),
      userMessagesDigest: digest(messages),
      target: classification.target,
      operationEvidenceDigest: `sha256:${classification.operationEvidenceSha256}`,
    },
    classificationMode,
    classification,
    trust: {
      contentAddressed: true,
      runtimeCertification: 'not-certified',
      promotionEligible: false,
      rawAuthorityTextStored: false,
      rawOperationTextStored: false,
    },
  })
}

export function prepareAuthorityDecisionReceipt(input = {}) {
  const payload = receiptPayload(input)
  return canonicalize({
    ...payload,
    receiptDigest: digest(payload),
  })
}

export function validateAuthorityDecisionReceiptShape(receipt) {
  exactObject(receipt, RECEIPT_KEYS, 'receipt')
  if (receipt.schemaVersion !== AUTHORITY_DECISION_RECEIPT_SCHEMA_VERSION
    || receipt.kind !== AUTHORITY_DECISION_RECEIPT_KIND) {
    block('RECEIPT_SHAPE_INVALID', 'receipt identity is invalid')
  }
  exactObject(receipt.source, SOURCE_KEYS, 'receipt.source')
  exactObject(receipt.binding, BINDING_KEYS, 'receipt.binding')
  exactObject(receipt.trust, TRUST_KEYS, 'receipt.trust')
  for (const [key, value] of Object.entries(receipt.source)) {
    if (key.endsWith('Digest')) exactDigest(value, `receipt.source.${key}`)
    else exactString(value, `receipt.source.${key}`, 512)
  }
  for (const key of [
    'operationEvidenceDigest',
    'scopeNonceDigest',
    'sessionDigest',
    'userMessagesDigest',
  ]) exactDigest(receipt.binding[key], `receipt.binding.${key}`)
  exactString(receipt.binding.providerId, 'receipt.binding.providerId', 128, { pattern: PROVIDER_ID })
  exactString(receipt.binding.runtimeSurface, 'receipt.binding.runtimeSurface', 256, { pattern: RUNTIME_SURFACE })
  exactString(receipt.binding.target, 'receipt.binding.target', MAX_TARGET_BYTES)
  if (!['user-context', 'operation-only'].includes(receipt.classificationMode)) {
    block('RECEIPT_SHAPE_INVALID', 'classificationMode is invalid')
  }
  classificationResult(receipt.classification)
  exactBoolean(receipt.trust.contentAddressed, true, 'receipt.trust.contentAddressed')
  exactBoolean(receipt.trust.promotionEligible, false, 'receipt.trust.promotionEligible')
  exactBoolean(receipt.trust.rawAuthorityTextStored, false, 'receipt.trust.rawAuthorityTextStored')
  exactBoolean(receipt.trust.rawOperationTextStored, false, 'receipt.trust.rawOperationTextStored')
  if (receipt.trust.runtimeCertification !== 'not-certified') {
    block('RECEIPT_SHAPE_INVALID', 'receipt must not claim runtime certification')
  }
  exactDigest(receipt.receiptDigest, 'receipt.receiptDigest')
  const { receiptDigest, ...payload } = receipt
  if (digest(payload) !== receiptDigest) {
    block('RECEIPT_DIGEST_MISMATCH', 'receipt content address does not match its payload')
  }
  return true
}

export function verifyAuthorityDecisionReceipt({ receipt, ...expectedInput } = {}) {
  validateAuthorityDecisionReceiptShape(receipt)
  const expected = prepareAuthorityDecisionReceipt(expectedInput)
  const checks = [
    ['source.authorityPolicyDigest', receipt.source.authorityPolicyDigest, expected.source.authorityPolicyDigest, 'AUTHORITY_POLICY_STALE'],
    ['source.classifierDigest', receipt.source.classifierDigest, expected.source.classifierDigest, 'CLASSIFIER_STALE'],
    ['source.providerRegistryDigest', receipt.source.providerRegistryDigest, expected.source.providerRegistryDigest, 'PROVIDER_REGISTRY_STALE'],
    ['source.receiptContractDigest', receipt.source.receiptContractDigest, expected.source.receiptContractDigest, 'RECEIPT_CONTRACT_STALE'],
    ['binding.providerId', receipt.binding.providerId, expected.binding.providerId, 'PROVIDER_SUBSTITUTION'],
    ['binding.runtimeSurface', receipt.binding.runtimeSurface, expected.binding.runtimeSurface, 'RUNTIME_SURFACE_SUBSTITUTION'],
    ['binding.sessionDigest', receipt.binding.sessionDigest, expected.binding.sessionDigest, 'SESSION_SUBSTITUTION'],
    ['binding.scopeNonceDigest', receipt.binding.scopeNonceDigest, expected.binding.scopeNonceDigest, 'REPLAY_OR_SCOPE_MISMATCH'],
    ['binding.userMessagesDigest', receipt.binding.userMessagesDigest, expected.binding.userMessagesDigest, 'AUTHORITY_CONTEXT_SUBSTITUTION'],
    ['binding.target', receipt.binding.target, expected.binding.target, 'TARGET_SUBSTITUTION'],
    ['binding.operationEvidenceDigest', receipt.binding.operationEvidenceDigest, expected.binding.operationEvidenceDigest, 'OPERATION_SUBSTITUTION'],
  ]
  for (const [label, actual, expectedValue, code] of checks) {
    if (actual !== expectedValue) block(code, label)
  }
  if (stableJson(receipt) !== stableJson(expected)) {
    block('RECEIPT_NONCANONICAL', 'receipt differs from the current canonical classifier result')
  }
  return true
}

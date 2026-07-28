import { createHash, verify } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  assertIssuerActive,
  issuerRegistryDigest,
  loadIssuerRegistry,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
  validateRegistryPolicyBinding,
} from '../../infra/governance/lib/issuer-registry.mjs'

const SHA256 = /^[a-f0-9]{64}$/
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const MIN_RAW_RECEIPT_BYTES = 2
const MAX_RAW_RECEIPT_BYTES = 1024 * 1024
const TYPED_BINDING_KEYS = Object.freeze([
  'planDigest',
  'profileDigest',
  'executionClass',
  'evidenceKind',
  'selectedProvider',
  'networkPolicyDigest',
  'isolationPolicyDigest',
  'permissionsDigest',
  'workflowIdentityDigest',
  'containerImageDigest',
])
const WORKFLOW_KEYS = Object.freeze([
  'repository',
  'path',
  'runId',
  'runAttempt',
  'event',
  'head',
  'tree',
])
const READBACK_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'executionClass',
  'evidenceKind',
  'workflowRunId',
  'runAttempt',
  'rawReceiptPath',
  'rawReceiptSize',
  'rawReceiptDigest',
  'rawReceiptSchemaDigest',
  'attestationBindingDigest',
  'evidenceEnvelopeDigest',
  'oidcClaimsDigest',
  'generatedOutputClosureDigest',
  'rawReceiptBindingDigest',
  'issuerRegistryDigest',
  'runtimePolicyDigest',
  'requiredIssuerQuorum',
  'verifiedIssuerKeyIds',
  'verifiedIssuerSubjects',
  'verifiedAt',
  'checks',
])
const READBACK_CHECK_KEYS = Object.freeze([
  'schema',
  'dependencyAndClosureBinding',
  'classAndWorkflowBinding',
  'runAndEnvelopeBinding',
  'lifecycle',
  'signatureQuorum',
])
const EXECUTION_CLASSES = new Set([
  'dependency-acquisition',
  'deterministic-hook-audit',
  'model-broker',
  'github-observer',
])
const EVIDENCE_KINDS = new Set([
  'dependency-bundle',
  'deep-audit-deterministic',
  'deep-audit-hook-residue',
  'deep-audit-judgment',
  'deep-audit-component-a1b',
  'deep-audit-ci-enforced',
])
const EVIDENCE_CLASS = Object.freeze({
  'dependency-bundle': 'dependency-acquisition',
  'deep-audit-deterministic': 'deterministic-hook-audit',
  'deep-audit-hook-residue': 'deterministic-hook-audit',
  'deep-audit-judgment': 'model-broker',
  'deep-audit-component-a1b': 'model-broker',
  'deep-audit-ci-enforced': 'github-observer',
})

function fail(message) {
  throw new Error(`managed CI sandbox receipt blocked:${message}`)
}

function stableStringify(value) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize)
    if (!item || typeof item !== 'object') return item
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])]))
  }
  return JSON.stringify(normalize(value))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function exactValue(actual, expected, label) {
  if (stableStringify(actual) !== stableStringify(expected)) fail(`${label} mismatches`)
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || stableStringify(Object.keys(value).sort()) !== stableStringify([...keys].sort())) {
    fail(`${label} has an invalid or open shape`)
  }
}

function canonicalDate(value, label) {
  if (typeof value !== 'string') fail(`${label} is not a canonical UTC timestamp`)
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label} is not a canonical UTC timestamp`)
  }
  return parsed
}

function canonicalNow(now) {
  const parsed = now instanceof Date ? now : new Date(now)
  if (!Number.isFinite(parsed.getTime())) fail('validation time is invalid')
  return parsed
}

function canonicalSignature(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    fail('managed CI signature encoding is invalid')
  }
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.length !== 64 || bytes.toString('base64url') !== value) {
    fail('managed CI signature is not canonical Ed25519')
  }
  return bytes
}

function canonicalRawReceiptPath(rawReceiptPath) {
  if (rawReceiptPath === null) return null
  if (typeof rawReceiptPath !== 'string'
    || rawReceiptPath.length === 0
    || rawReceiptPath.includes('\\')
    || rawReceiptPath.includes('\0')
    || isAbsolute(rawReceiptPath)) {
    fail('raw receipt path is invalid')
  }
  const parts = rawReceiptPath.split('/')
  if (parts.some(part => part.length === 0 || part === '.' || part === '..')) {
    fail('raw receipt path is invalid')
  }
  return rawReceiptPath
}

function safeTrustFile(repoRoot, relativePath, label) {
  let root
  try {
    root = realpathSync(resolve(repoRoot))
  } catch (error) {
    fail(`${label} repository root is unavailable:${error.message}`)
  }
  if (typeof relativePath !== 'string' || relativePath.length === 0
    || relativePath.includes('\\') || isAbsolute(relativePath)) {
    fail(`${label} path is invalid`)
  }
  const target = resolve(root, relativePath)
  const rel = relative(root, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail(`${label} path escapes repository trust root`)
  }
  let cursor = root
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part)
    if (!existsSync(cursor)) fail(`${label} is unavailable`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link`)
    if (cursor === target && (!info.isFile() || info.nlink !== 1)) {
      fail(`${label} is not one unique regular file`)
    }
  }
  return target
}

function receiptInput({ rawBytes, receipt }) {
  if (rawBytes === undefined && receipt === undefined) fail('receipt input is missing')
  let bytes = null
  let parsed = null
  if (rawBytes !== undefined) {
    if (!(typeof rawBytes === 'string' || Buffer.isBuffer(rawBytes) || ArrayBuffer.isView(rawBytes))) {
      fail('raw receipt bytes are invalid')
    }
    bytes = Buffer.isBuffer(rawBytes) ? Buffer.from(rawBytes) : Buffer.from(rawBytes)
    if (bytes.length < MIN_RAW_RECEIPT_BYTES || bytes.length > MAX_RAW_RECEIPT_BYTES) {
      fail('raw receipt size is outside the closed bound')
    }
    try {
      parsed = JSON.parse(bytes.toString('utf8'))
    } catch (error) {
      fail(`raw receipt is invalid JSON:${error.message}`)
    }
  }
  if (receipt !== undefined) {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
      fail('receipt object is invalid')
    }
    if (parsed !== null && stableStringify(parsed) !== stableStringify(receipt)) {
      fail('raw receipt bytes and supplied receipt object differ')
    }
    parsed = receipt
    if (bytes === null) bytes = Buffer.from(stableStringify(receipt))
  }
  if (bytes.length < MIN_RAW_RECEIPT_BYTES || bytes.length > MAX_RAW_RECEIPT_BYTES) {
    fail('raw receipt size is outside the closed bound')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('raw receipt JSON must be an object')
  return { bytes, receipt: parsed }
}

function receiptSchema(repoRoot) {
  const schemaPath = safeTrustFile(
    repoRoot,
    'scripts/schemas/managed-ci-sandbox-receipt.schema.json',
    'managed CI sandbox receipt schema',
  )
  let schemaBytes
  let schema
  try {
    schemaBytes = readFileSync(schemaPath)
    schema = JSON.parse(schemaBytes.toString('utf8'))
  } catch (error) {
    fail(`managed CI sandbox receipt schema is unavailable:${error.message}`)
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: false })
  addFormats(ajv)
  let validate
  try {
    validate = ajv.compile(schema)
  } catch (error) {
    fail(`managed CI sandbox receipt schema cannot compile:${error.message}`)
  }
  return { ajv, schemaBytes, validate }
}

export function validateManagedCiSandboxReceiptShape(receipt, { repoRoot = process.cwd() } = {}) {
  if (!repoRoot) fail('schema validation requires repository trust roots')
  const { ajv, validate } = receiptSchema(resolve(repoRoot))
  if (!validate(receipt)) {
    fail(`managed CI sandbox receipt schema failed:${ajv.errorsText(validate.errors, { separator: '; ' })}`)
  }
  return true
}

function validateExpected(expected) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    fail('expected receipt context is missing')
  }
  const allowedKeys = [
    'manifestVerificationDigest',
    'dependencyLockfileSha256',
    'dependencyBundleDigest',
    'activeRun',
    'receiptBinding',
    'workflow',
    'runnerEnvironment',
    'evidenceEnvelopeDigest',
    'oidcClaimsDigest',
    'generatedOutputClosureDigest',
    'maxAgeSeconds',
  ]
  if (Object.keys(expected).some(key => !allowedKeys.includes(key))) {
    fail('expected receipt context has an unsupported key')
  }
  if (!SHA256.test(expected.manifestVerificationDigest ?? '')) {
    fail('expected manifest verification digest is invalid')
  }
  if (!expected.activeRun || typeof expected.activeRun !== 'object' || Array.isArray(expected.activeRun)) {
    fail('expected active run is invalid')
  }
  if (!expected.receiptBinding || typeof expected.receiptBinding !== 'object'
    || Array.isArray(expected.receiptBinding)) {
    fail('expected typed receipt binding is invalid')
  }
  exactKeys(expected.receiptBinding, TYPED_BINDING_KEYS, 'expected typed receipt binding')
  if (!SHA256.test(expected.evidenceEnvelopeDigest ?? '')) {
    fail('expected evidence envelope digest is invalid')
  }
  if (expected.oidcClaimsDigest !== undefined
    && !SHA256.test(expected.oidcClaimsDigest ?? '')) {
    fail('expected OIDC claims digest is invalid')
  }
  if (expected.generatedOutputClosureDigest !== undefined
    && !SHA256.test(expected.generatedOutputClosureDigest ?? '')) {
    fail('expected generated-output closure digest is invalid')
  }
  if (!Number.isSafeInteger(expected.maxAgeSeconds) || expected.maxAgeSeconds <= 0) {
    fail('expected maximum attestation age is invalid')
  }
  if (expected.workflow !== undefined
    && (!expected.workflow || typeof expected.workflow !== 'object' || Array.isArray(expected.workflow))) {
    fail('expected workflow binding is invalid')
  }
  if (expected.workflow
    && Object.keys(expected.workflow).some(key => !WORKFLOW_KEYS.includes(key))) {
    fail('expected workflow binding has an unsupported key')
  }
  if (expected.runnerEnvironment !== undefined
    && !['github-hosted', 'self-hosted-attested'].includes(expected.runnerEnvironment)) {
    fail('expected runner environment is invalid')
  }
  if (expected.dependencyLockfileSha256 !== undefined
    && !SHA256.test(expected.dependencyLockfileSha256)) {
    fail('expected dependency lockfile digest is invalid')
  }
  if (Object.hasOwn(expected, 'dependencyBundleDigest')
    && expected.dependencyBundleDigest !== null
    && !SHA256.test(expected.dependencyBundleDigest ?? '')) {
    fail('expected dependency bundle digest is invalid')
  }
}

function validateTrustPolicy({ binding, signatures, repoRoot, now }) {
  let registry
  let runtimeProfile
  let runtimeProfileBytes
  let rings
  try {
    registry = loadIssuerRegistry(safeTrustFile(
      repoRoot,
      'infra/governance/trust/issuers.json',
      'managed CI issuer registry',
    ))
    runtimeProfileBytes = readFileSync(safeTrustFile(
      repoRoot,
      'infra/governance/providers/runtime-conformance.json',
      'managed CI runtime conformance policy',
    ))
    runtimeProfile = JSON.parse(runtimeProfileBytes.toString('utf8'))
    rings = JSON.parse(readFileSync(safeTrustFile(
      repoRoot,
      'infra/governance/release-rings.json',
      'managed CI release rings policy',
    ), 'utf8'))
  } catch (error) {
    fail(`managed CI trust policy is unavailable:${error.message}`)
  }
  const registryDigest = issuerRegistryDigest(registry)
  const runtimePolicyDigest = sha256(runtimeProfileBytes)
  if (binding.issuerRegistryDigest !== registryDigest
    || runtimeProfile.issuerRegistryDigest !== registryDigest
    || rings.attestationPolicy?.issuerRegistryDigest !== registryDigest
    || binding.runtimePolicyDigest !== runtimePolicyDigest) {
    fail('managed CI trust-policy digest substitution detected')
  }
  let policyState
  try {
    policyState = validateRegistryPolicyBinding(runtimeProfile, registry, {
      role: 'runtime-evidence-issuer',
      quorum: runtimeProfile.requiredIssuerQuorum,
      now,
      allowUnactivated: false,
    })
  } catch (error) {
    fail(`managed CI runtime-evidence policy is invalid:${error.message}`)
  }
  if (!policyState.active
    || !Array.isArray(signatures)
    || signatures.length < runtimeProfile.requiredIssuerQuorum
    || signatures.length > 5) {
    fail('managed CI attestation lacks bounded quorum')
  }
  const observedAt = canonicalDate(binding.observedAt, 'managed CI attestation observedAt')
  const expiresAt = canonicalDate(binding.expiresAt, 'managed CI attestation expiresAt')
  const signedBytes = Buffer.from(stableStringify(binding))
  const signedDigest = sha256(signedBytes)
  const keyIds = new Set()
  const subjects = new Set()
  for (const signature of signatures) {
    if (keyIds.has(signature.issuerKeyId) || signature.payloadSha256 !== signedDigest) {
      fail('managed CI attestation has duplicate key or payload mismatch')
    }
    keyIds.add(signature.issuerKeyId)
    let issuer
    try {
      issuer = resolvePolicyIssuer(runtimeProfile, registry, signature.issuerKeyId, {
        role: 'runtime-evidence-issuer',
        at: observedAt,
        validThrough: expiresAt,
      })
      assertIssuerActive(issuer, {
        role: 'runtime-evidence-issuer',
        at: now,
        validThrough: now,
      })
    } catch (error) {
      fail(`managed CI signer is not currently authorized:${error.message}`)
    }
    subjects.add(issuer.subject)
    if (!verify(null, signedBytes, publicKeyFromIssuer(issuer), canonicalSignature(signature.signature))) {
      fail('managed CI signature is invalid')
    }
  }
  if (subjects.size < runtimeProfile.requiredIssuerQuorum) {
    fail('managed CI quorum is not independent across issuer subjects')
  }
  return {
    issuerRegistryDigest: registryDigest,
    runtimePolicyDigest,
    requiredIssuerQuorum: runtimeProfile.requiredIssuerQuorum,
    verifiedIssuerKeyIds: [...keyIds].sort(),
    verifiedIssuerSubjects: [...subjects].sort(),
  }
}

export function validateManagedCiSandboxReceipt({
  rawBytes,
  receipt,
  rawReceiptPath = null,
  repoRoot = process.cwd(),
  now = new Date(),
  expected,
} = {}) {
  if (!repoRoot) fail('validation requires repository trust roots')
  const root = resolve(repoRoot)
  const validationTime = canonicalNow(now)
  const canonicalPath = canonicalRawReceiptPath(rawReceiptPath)
  validateExpected(expected)
  const input = receiptInput({ rawBytes, receipt })
  const { ajv, schemaBytes, validate } = receiptSchema(root)
  if (!validate(input.receipt)) {
    fail(`managed CI sandbox receipt schema failed:${ajv.errorsText(validate.errors, { separator: '; ' })}`)
  }

  const value = input.receipt
  const binding = value.attestation.binding
  if (value.manifestVerificationBeforeDigest !== expected.manifestVerificationDigest
    || value.manifestVerificationAfterDigest !== expected.manifestVerificationDigest) {
    fail('receipt does not bind the expected frozen manifest before/after')
  }
  if (value.callerFingerprintBeforeDigest !== value.callerFingerprintAfterDigest) {
    fail('receipt caller repository fingerprint changed')
  }
  if (value.dependencyViewBeforeDigest !== value.dependencyViewAfterDigest) {
    fail('receipt installed dependency view changed')
  }
  if (expected.dependencyLockfileSha256 !== undefined
    && value.dependencyLockfileSha256 !== expected.dependencyLockfileSha256) {
    fail('receipt dependency lockfile is not bound to the expected frozen manifest')
  }
  const expectedDependency = {
    lockfileSha256: value.dependencyLockfileSha256,
    installedLockfileSha256: value.installedLockfileSha256,
    installedDependencyIdentityDigest: value.installedDependencyIdentityDigest,
    installedPackageCount: value.installedPackageCount,
  }
  exactValue(binding.dependency, expectedDependency, 'managed CI dependency binding')
  exactValue(binding.activeRun, expected.activeRun, 'managed CI activeRun binding')
  exactValue(binding.callerClosure, {
    beforeDigest: value.callerFingerprintBeforeDigest,
    afterDigest: value.callerFingerprintAfterDigest,
  }, 'managed CI callerClosure binding')
  exactValue(binding.manifestClosure, {
    beforeDigest: value.manifestVerificationBeforeDigest,
    afterDigest: value.manifestVerificationAfterDigest,
  }, 'managed CI manifestClosure binding')
  exactValue(binding.dependencyClosure, {
    beforeDigest: value.dependencyViewBeforeDigest,
    afterDigest: value.dependencyViewAfterDigest,
  }, 'managed CI dependencyClosure binding')

  for (const key of TYPED_BINDING_KEYS) {
    if (binding[key] !== expected.receiptBinding[key]) {
      fail(`managed CI typed execution binding mismatches:${key}`)
    }
  }
  if (binding.evidenceEnvelopeDigest !== expected.evidenceEnvelopeDigest) {
    fail('managed CI attestation is replayed/detached from the expected evidence envelope')
  }
  if (expected.oidcClaimsDigest !== undefined
    && binding.oidcClaimsDigest !== expected.oidcClaimsDigest) {
    fail('managed CI attestation is replayed/detached from the expected OIDC claims')
  }
  if (expected.generatedOutputClosureDigest !== undefined
    && binding.generatedOutputClosureDigest !== expected.generatedOutputClosureDigest) {
    fail('managed CI attestation is replayed/detached from the expected generated-output closure')
  }
  if (binding.execution.oidcClaimsDigest !== binding.oidcClaimsDigest
    || binding.execution.containerImageDigest !== binding.containerImageDigest
    || binding.execution.containmentBackend !== value.containmentBackend
    || binding.execution.externalWriteContainment !== value.externalWriteContainment) {
    fail('managed CI OIDC/image/containment execution binding is invalid')
  }
  if (expected.runnerEnvironment !== undefined
    && binding.execution.runnerEnvironment !== expected.runnerEnvironment) {
    fail('managed CI runner environment binding is invalid')
  }
  const expectedContainmentBackend = binding.execution.runnerEnvironment === 'github-hosted'
    ? 'github-hosted-ephemeral-container'
    : 'self-hosted-attested-ephemeral-container'
  if (binding.execution.containmentBackend !== expectedContainmentBackend
    || value.containmentBackend !== expectedContainmentBackend) {
    fail('managed CI runner environment/containment backend pair is invalid')
  }
  if (expected.workflow) {
    for (const key of WORKFLOW_KEYS) {
      if (Object.hasOwn(expected.workflow, key) && binding.workflow[key] !== expected.workflow[key]) {
        fail(`managed CI workflow binding mismatches:${key}`)
      }
    }
  }
  if (!RUN_ID.test(binding.nonce)) fail('managed CI nonce is invalid')
  const observedAt = canonicalDate(binding.observedAt, 'managed CI attestation observedAt')
  const expiresAt = canonicalDate(binding.expiresAt, 'managed CI attestation expiresAt')
  if (observedAt > validationTime || expiresAt <= observedAt || validationTime > expiresAt) {
    fail('managed CI attestation is future/expired')
  }
  if ((expiresAt.getTime() - observedAt.getTime()) / 1000 > expected.maxAgeSeconds) {
    fail('managed CI attestation exceeds canonical TTL')
  }
  const reproducibleDependencyBundleDigest = sha256(stableStringify(binding.dependency))
  let expectedDependencyBundleDigest
  if (Object.hasOwn(expected, 'dependencyBundleDigest')) {
    expectedDependencyBundleDigest = expected.dependencyBundleDigest
  } else {
    expectedDependencyBundleDigest = binding.executionClass === 'github-observer'
      ? null
      : reproducibleDependencyBundleDigest
  }
  if (binding.dependencyBundleDigest !== expectedDependencyBundleDigest
    || (binding.dependencyBundleDigest !== null
      && binding.dependencyBundleDigest !== reproducibleDependencyBundleDigest)) {
    fail('managed CI dependency bundle digest is absent or not reproducible')
  }
  if (binding.cleanup !== true || value.cleanup !== true) {
    fail('managed CI cleanup did not complete')
  }

  const trust = validateTrustPolicy({
    binding,
    signatures: value.attestation.signatures,
    repoRoot: root,
    now: validationTime,
  })
  return {
    schemaVersion: 1,
    kind: 'managed-ci-raw-receipt-validation-readback-v1',
    executionClass: binding.executionClass,
    evidenceKind: binding.evidenceKind,
    workflowRunId: binding.workflow.runId,
    runAttempt: binding.workflow.runAttempt,
    rawReceiptPath: canonicalPath,
    rawReceiptSize: input.bytes.length,
    rawReceiptDigest: sha256(input.bytes),
    rawReceiptSchemaDigest: sha256(schemaBytes),
    attestationBindingDigest: sha256(stableStringify(binding)),
    evidenceEnvelopeDigest: binding.evidenceEnvelopeDigest,
    oidcClaimsDigest: binding.oidcClaimsDigest,
    generatedOutputClosureDigest: binding.generatedOutputClosureDigest,
    rawReceiptBindingDigest: sha256(stableStringify(expected.receiptBinding)),
    issuerRegistryDigest: trust.issuerRegistryDigest,
    runtimePolicyDigest: trust.runtimePolicyDigest,
    requiredIssuerQuorum: trust.requiredIssuerQuorum,
    verifiedIssuerKeyIds: trust.verifiedIssuerKeyIds,
    verifiedIssuerSubjects: trust.verifiedIssuerSubjects,
    verifiedAt: validationTime.toISOString(),
    checks: {
      schema: true,
      dependencyAndClosureBinding: true,
      classAndWorkflowBinding: true,
      runAndEnvelopeBinding: true,
      lifecycle: true,
      signatureQuorum: true,
    },
  }
}

export function validateManagedCiRawReceiptValidationReadback(readback, { expected = {} } = {}) {
  exactKeys(readback, READBACK_KEYS, 'managed CI raw receipt validation readback')
  if (readback.schemaVersion !== 1
    || readback.kind !== 'managed-ci-raw-receipt-validation-readback-v1') {
    fail('managed CI raw receipt validation readback identity is invalid')
  }
  if (!EXECUTION_CLASSES.has(readback.executionClass)
    || !EVIDENCE_KINDS.has(readback.evidenceKind)
    || EVIDENCE_CLASS[readback.evidenceKind] !== readback.executionClass) {
    fail('managed CI raw receipt validation readback class/evidence identity is invalid')
  }
  if (typeof readback.workflowRunId !== 'string' || !/^[1-9][0-9]*$/.test(readback.workflowRunId)
    || !Number.isSafeInteger(readback.runAttempt) || readback.runAttempt <= 0) {
    fail('managed CI raw receipt validation readback workflow run identity is invalid')
  }
  canonicalRawReceiptPath(readback.rawReceiptPath)
  if (readback.rawReceiptPath !== `${readback.executionClass}.json`) {
    fail('managed CI raw receipt validation readback path is not canonical for its class')
  }
  if (!Number.isSafeInteger(readback.rawReceiptSize)
    || readback.rawReceiptSize < MIN_RAW_RECEIPT_BYTES
    || readback.rawReceiptSize > MAX_RAW_RECEIPT_BYTES) {
    fail('managed CI raw receipt validation readback byte size is invalid')
  }
  for (const key of [
    'rawReceiptDigest',
    'rawReceiptSchemaDigest',
    'attestationBindingDigest',
    'evidenceEnvelopeDigest',
    'oidcClaimsDigest',
    'generatedOutputClosureDigest',
    'rawReceiptBindingDigest',
    'issuerRegistryDigest',
    'runtimePolicyDigest',
  ]) {
    if (!SHA256.test(readback[key] ?? '')) {
      fail(`managed CI raw receipt validation readback ${key} is invalid`)
    }
  }
  canonicalDate(readback.verifiedAt, 'managed CI raw receipt validation readback verifiedAt')
  if (!Number.isSafeInteger(readback.requiredIssuerQuorum)
    || readback.requiredIssuerQuorum < 1
    || readback.requiredIssuerQuorum > 5) {
    fail('managed CI raw receipt validation readback issuer quorum is invalid')
  }
  for (const [key, pattern] of [
    ['verifiedIssuerKeyIds', /^[a-z0-9][a-z0-9._-]*$/],
    ['verifiedIssuerSubjects', /^.+$/],
  ]) {
    const values = readback[key]
    if (!Array.isArray(values)
      || values.length < readback.requiredIssuerQuorum
      || values.length > 5
      || values.some(value => typeof value !== 'string'
        || value.trim() !== value
        || !pattern.test(value))
      || new Set(values).size !== values.length
      || stableStringify(values) !== stableStringify([...values].sort())) {
      fail(`managed CI raw receipt validation readback ${key} is invalid`)
    }
  }
  exactKeys(readback.checks, READBACK_CHECK_KEYS, 'managed CI raw receipt validation readback checks')
  if (READBACK_CHECK_KEYS.some(key => readback.checks[key] !== true)) {
    fail('managed CI raw receipt validation readback does not prove every required check')
  }
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    fail('managed CI raw receipt validation readback expected context is invalid')
  }
  const expectedKeys = [
    'executionClass',
    'evidenceKind',
    'workflowRunId',
    'runAttempt',
    'rawReceiptDigest',
    'rawReceiptPath',
    'rawReceiptSize',
    'rawReceiptSchemaDigest',
    'attestationBindingDigest',
    'evidenceEnvelopeDigest',
    'oidcClaimsDigest',
    'generatedOutputClosureDigest',
    'rawReceiptBindingDigest',
    'issuerRegistryDigest',
    'runtimePolicyDigest',
    'requiredIssuerQuorum',
    'verifiedAt',
  ]
  if (Object.keys(expected).some(key => !expectedKeys.includes(key))) {
    fail('managed CI raw receipt validation readback expected context has an unsupported key')
  }
  for (const key of expectedKeys) {
    if (Object.hasOwn(expected, key) && readback[key] !== expected[key]) {
      fail(`managed CI raw receipt validation readback expected ${key} mismatches`)
    }
  }
  return true
}

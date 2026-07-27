#!/usr/bin/env node

import { createHash, createPublicKey, verify } from 'node:crypto'
import {
  appendFileSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { request } from 'node:https'
import { fileURLToPath } from 'node:url'

const OPERATIONS = new Set(['freeze-subject', 'authorize-sandbox-session', 'finalize-receipts'])
const ENVIRONMENTS = Object.freeze({
  'freeze-subject': 'managed-ci-freeze-authority-v1',
  'authorize-sandbox-session': 'managed-ci-sandbox-authority-v1',
  'finalize-receipts': 'managed-ci-receipt-finalizer-v1',
})
const CLASSES = Object.freeze(['dependency-acquisition', 'deterministic-hook-audit', 'model-broker', 'github-observer'])
const HEX40 = /^[a-f0-9]{40}$/
const HEX64 = /^[a-f0-9]{64}$/
const RUN_ID = /^[1-9][0-9]*$/
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const MAX_RAW_RECEIPT_BYTES = 1024 * 1024
const AUTHORITY_GATEWAY_HOST = 'managed-ci-authority.qijenchen.dev'
const AUTHORITY_GATEWAY_PORT = 443
const AUTHORITY_OIDC_AUDIENCE = 'qijenchen-managed-deep-audit-authority-v1'
const FINALIZATION_OPERATION_PATH = '/v1/finalize-receipts'
const SIGNER_ENDPOINT_HOST = 'managed-ci-signer.qijenchen.dev'
const SIGNER_ENDPOINT_PORT = 443
const SIGNER_TRANSPORT = 'tls1.3-mtls'
const FINALIZER_GATEWAY_CERTIFICATE_IDENTITY = 'spiffe://qijenchen.dev/managed-ci/receipt-finalizer-gateway'
const SIGNER_CERTIFICATE_IDENTITY = 'spiffe://qijenchen.dev/managed-ci/receipt-signer'
const FINALIZATION_REQUEST_KIND = 'managed-ci-authority-finalization-request-v1'
const FINALIZATION_RESPONSE_KIND = 'managed-ci-authority-finalization-response-v1'
const FINALIZED_RECEIPT_SET_KIND = 'managed-ci-finalized-receipt-set-v1'
const FINALIZED_RECEIPT_SET_DOMAIN = 'qijenchen:managed-ci:finalized-receipt-set:v1'
const RECEIPT_PAYLOAD_DOMAIN = 'qijenchen:managed-ci:receipt:v1'
const TRANSPORT_READBACK_DOMAIN = 'qijenchen:managed-ci:finalization-transport-readback:v1'
const TRANSPORT_ATTESTATION_DOMAIN = 'qijenchen:managed-ci:finalization-transport-attestation:v1'
const FINAL_RECEIPT_SIGNER_TENANT = 'ajenchen-design-system'
const FINAL_RECEIPT_SIGNER_KEY = 'qijenchen-managed-ci-receipt-signer-v1'
const FINAL_RECEIPT_SIGNER_ENVIRONMENT = 'managed-ci-receipt-finalizer-v1'
const FINAL_RECEIPT_SIGNER_ROLE = 'runtime-evidence-issuer'
const TRUSTED_ISSUER_REGISTRY_PATH = '/opt/qijenchen/managed-ci-authority/trust/issuers.json'
const EVIDENCE_CLASS = Object.freeze({
  'dependency-bundle': 'dependency-acquisition',
  'deep-audit-deterministic': 'deterministic-hook-audit',
  'deep-audit-hook-residue': 'deterministic-hook-audit',
  'deep-audit-judgment': 'model-broker',
  'deep-audit-component-a1b': 'model-broker',
  'deep-audit-ci-enforced': 'github-observer',
})
const RAW_READBACK_KEYS = Object.freeze([
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
const RAW_READBACK_CHECK_KEYS = Object.freeze([
  'schema',
  'dependencyAndClosureBinding',
  'classAndWorkflowBinding',
  'runAndEnvelopeBinding',
  'lifecycle',
  'signatureQuorum',
])
const FINALIZED_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'executionClass',
  'evidenceKind',
  'workflowRunId',
  'runAttempt',
  'rawReceiptDigest',
  'rawReceiptSchemaDigest',
  'rawReceiptValidationDigest',
  'provenanceBindingDigest',
  'receiptBindingDigest',
  'frozenSubjectReadbackDigest',
  'hostObservationReceiptDigest',
  'imageSupplyChainBindingDigest',
  'signerAuthorityBindingDigest',
  'issuerMappingDigest',
  'signedAt',
])
const SIGNER_AUDIT_KEYS = Object.freeze([
  'eventId',
  'tenantId',
  'keyIdentity',
  'policyDigest',
  'payloadDigest',
  'signature',
  'workflowRunId',
  'runAttempt',
  'environment',
  'signedAt',
  'executionClass',
  'rawReceiptDigest',
  'signerAuthorityBindingDigest',
  'issuerMappingDigest',
])
const ISSUER_REGISTRY_KEYS = Object.freeze(['$schema', 'schemaVersion', 'algorithm', 'issuers'])
const ISSUER_KEYS = Object.freeze([
  'keyId',
  'subject',
  'publicKeySpki',
  'roles',
  'status',
  'notBefore',
  'notAfter',
  'revokedAt',
])
const ISSUER_MAPPING_KEYS = Object.freeze([
  'issuerKeyId',
  'issuerSubject',
  'issuerRegistryDigest',
  'issuerRole',
  'keyIdentity',
  'certificateIdentity',
])
const TRANSPORT_ATTESTATION_KEYS = Object.freeze([
  'issuerMapping',
  'signedAt',
  'payloadDigest',
  'signature',
])

function fail(message) { throw new Error(`managed CI trusted authority blocked:${message}`) }

function parse(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || !value || value.startsWith('--') || name in values) fail('arguments must be unique --name value pairs')
    values[name] = value
  }
  return values
}

function env(name, pattern = null) {
  const value = process.env[name]
  if (!value || (pattern && !pattern.test(value))) fail(`trusted environment value is missing or invalid:${name}`)
  return value
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

function stableStringify(value) {
  const normalize = item => {
    if (Array.isArray(item)) return item.map(normalize)
    if (!item || typeof item !== 'object') return item
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])]))
  }
  return JSON.stringify(normalize(value))
}

function exactKeys(value, keys, label) {
  const actual = !value || typeof value !== 'object' || Array.isArray(value)
    ? null
    : Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual === null
    || actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has an open or incomplete shape`)
  }
}

function canonicalUtc(value, label) {
  if (typeof value !== 'string') fail(`${label} is not a canonical UTC timestamp`)
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label} is not a canonical UTC timestamp`)
  }
  return parsed
}

function digest(value, label) {
  if (typeof value !== 'string' || !HEX64.test(value)) fail(`${label} is not a SHA-256 digest`)
  return value
}

function positiveRunAttempt(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} is invalid`)
  return value
}

function canonicalBase64UrlSignature(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value)) {
    fail(`${label} is not canonical Ed25519 base64url`)
  }
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.length !== 64 || bytes.toString('base64url') !== value) {
    fail(`${label} is not canonical Ed25519 base64url`)
  }
  return value
}

function sortedUniqueStrings(values, pattern, minimum, label) {
  if (!Array.isArray(values)
    || values.length < minimum
    || values.length > 5
    || values.some(value => typeof value !== 'string'
      || value.trim() !== value
      || !pattern.test(value))
    || new Set(values).size !== values.length
    || stableStringify(values) !== stableStringify([...values].sort())) {
    fail(`${label} is not a sorted independent set`)
  }
  return values
}

function validateIssuerRegistry(value) {
  exactKeys(value, ISSUER_REGISTRY_KEYS, 'trusted issuer registry')
  if (value.$schema !== '../schemas/issuer-registry.schema.json'
    || value.schemaVersion !== 1
    || value.algorithm !== 'ed25519'
    || !Array.isArray(value.issuers)
    || value.issuers.length < 1
    || value.issuers.length > 64) {
    fail('trusted issuer registry metadata is invalid')
  }
  const keyIds = new Set()
  const publicKeys = new Set()
  for (const issuer of value.issuers) {
    exactKeys(issuer, ISSUER_KEYS, 'trusted issuer registry entry')
    if (typeof issuer.keyId !== 'string'
      || !/^[a-z0-9][a-z0-9._-]*$/.test(issuer.keyId)
      || keyIds.has(issuer.keyId)
      || typeof issuer.subject !== 'string'
      || issuer.subject.trim() !== issuer.subject
      || issuer.subject.length === 0
      || !Array.isArray(issuer.roles)
      || issuer.roles.length === 0
      || new Set(issuer.roles).size !== issuer.roles.length
      || !issuer.roles.every(role => [
        'privileged-change-authorizer',
        'root-rotator',
        'runtime-evidence-issuer',
        'apply-authorizer',
        'completion-attestor',
        'release-tag-authorizer',
      ].includes(role))
      || !['active', 'revoked'].includes(issuer.status)) {
      fail('trusted issuer registry entry identity/role/lifecycle is invalid')
    }
    const notBefore = canonicalUtc(issuer.notBefore, `${issuer.keyId} issuer notBefore`)
    const notAfter = canonicalUtc(issuer.notAfter, `${issuer.keyId} issuer notAfter`)
    if (notAfter <= notBefore
      || (issuer.status === 'active' && issuer.revokedAt !== null)
      || (issuer.status === 'revoked'
        && canonicalUtc(issuer.revokedAt, `${issuer.keyId} issuer revokedAt`) < notBefore)) {
      fail('trusted issuer registry entry validity window is invalid')
    }
    if (typeof issuer.publicKeySpki !== 'string'
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(issuer.publicKeySpki)) {
      fail('trusted issuer registry entry public key is invalid')
    }
    let publicKey
    try {
      const encoded = Buffer.from(issuer.publicKeySpki, 'base64')
      publicKey = createPublicKey({ key: encoded, format: 'der', type: 'spki' })
      const canonical = publicKey.export({ format: 'der', type: 'spki' })
      if (publicKey.asymmetricKeyType !== 'ed25519'
        || !encoded.equals(canonical)
        || issuer.publicKeySpki !== canonical.toString('base64')) {
        fail('trusted issuer registry entry public key is not canonical Ed25519 SPKI')
      }
    } catch (error) {
      if (error.message.startsWith('managed CI trusted authority blocked:')) throw error
      fail('trusted issuer registry entry public key is invalid')
    }
    if (publicKeys.has(issuer.publicKeySpki)) {
      fail('trusted issuer registry reuses one public key across identities')
    }
    keyIds.add(issuer.keyId)
    publicKeys.add(issuer.publicKeySpki)
  }
  return value
}

function trustedIssuerRegistryDigest(value) {
  validateIssuerRegistry(value)
  return sha256(Buffer.from(stableStringify(value)))
}

function validateIssuerMapping(value, registry, label = 'receipt signer issuer mapping') {
  exactKeys(value, ISSUER_MAPPING_KEYS, label)
  if (typeof value.issuerKeyId !== 'string'
    || !/^[a-z0-9][a-z0-9._-]*$/.test(value.issuerKeyId)
    || typeof value.issuerSubject !== 'string'
    || value.issuerSubject.length === 0
    || value.issuerRegistryDigest !== trustedIssuerRegistryDigest(registry)
    || value.issuerRole !== FINAL_RECEIPT_SIGNER_ROLE
    || value.keyIdentity !== FINAL_RECEIPT_SIGNER_KEY
    || value.certificateIdentity !== SIGNER_CERTIFICATE_IDENTITY) {
    fail(`${label} is detached from the trusted registry/signer authority`)
  }
  const matches = registry.issuers.filter(issuer => issuer.keyId === value.issuerKeyId)
  if (matches.length !== 1
    || matches[0].subject !== value.issuerSubject
    || matches[0].subject !== SIGNER_CERTIFICATE_IDENTITY
    || !matches[0].roles.includes(FINAL_RECEIPT_SIGNER_ROLE)) {
    fail(`${label} does not resolve one authorized signer`)
  }
  return matches[0]
}

function verifyIssuerSignature({
  registry,
  issuerMapping,
  signedAt,
  bytes,
  signature,
  label,
}) {
  const issuer = validateIssuerMapping(issuerMapping, registry, `${label} issuer mapping`)
  const instant = canonicalUtc(signedAt, `${label} signedAt`)
  const notBefore = new Date(issuer.notBefore)
  const notAfter = new Date(issuer.notAfter)
  const revokedAt = issuer.revokedAt === null ? null : new Date(issuer.revokedAt)
  if (!(notBefore <= instant && instant < notAfter)
    || (revokedAt !== null && revokedAt <= instant)) {
    fail(`${label} issuer was not valid at the historical signing instant`)
  }
  const signatureBytes = Buffer.from(
    canonicalBase64UrlSignature(signature, `${label} signature`),
    'base64url',
  )
  const publicKey = createPublicKey({
    key: Buffer.from(issuer.publicKeySpki, 'base64'),
    format: 'der',
    type: 'spki',
  })
  if (!verify(null, bytes, publicKey, signatureBytes)) {
    fail(`${label} signature is invalid`)
  }
  return true
}

function loadTrustedIssuerRegistry() {
  const target = resolve(TRUSTED_ISSUER_REGISTRY_PATH)
  if (!existsSync(target)
    || realpathSync(target) !== target) {
    fail('content-addressed authority issuer registry is missing or unsafe')
  }
  let descriptor
  let bytes
  let value
  try {
    descriptor = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW)
    const info = fstatSync(descriptor)
    if (!info.isFile() || info.nlink !== 1 || info.size < 2 || info.size > 1024 * 1024) {
      fail('content-addressed authority issuer registry is missing or unsafe')
    }
    bytes = readFileSync(descriptor)
    if (bytes.length !== info.size || realpathSync(target) !== target) {
      fail('content-addressed authority issuer registry changed during its trusted read')
    }
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (error) {
    if (error.message.startsWith('managed CI trusted authority blocked:')) throw error
    fail(`content-addressed authority issuer registry is not valid JSON:${error.message}`)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
  return validateIssuerRegistry(value)
}

export function finalizationTransportContract() {
  return {
    schemaVersion: 1,
    kind: 'managed-ci-finalization-transport-contract-v1',
    gatewayMode: 'oidc-authenticated-transparent-finalization-gateway',
    gatewayHoldsSignerPrivateKey: false,
    clientToGateway: {
      endpointHost: AUTHORITY_GATEWAY_HOST,
      endpointPort: AUTHORITY_GATEWAY_PORT,
      operationPath: FINALIZATION_OPERATION_PATH,
      minimumTlsVersion: 'TLSv1.3',
      serverAuthentication: 'webpki-hostname-verified',
      clientAuthentication: 'github-oidc-bearer',
      oidcAudience: AUTHORITY_OIDC_AUDIENCE,
    },
    gatewayToSigner: {
      endpointHost: SIGNER_ENDPOINT_HOST,
      endpointPort: SIGNER_ENDPOINT_PORT,
      transport: SIGNER_TRANSPORT,
      minimumTlsVersion: 'TLSv1.3',
      mutualTlsRequired: true,
      gatewayClientCertificateIdentity: FINALIZER_GATEWAY_CERTIFICATE_IDENTITY,
      signerServerCertificateIdentity: SIGNER_CERTIFICATE_IDENTITY,
      signerKeyIdentity: FINAL_RECEIPT_SIGNER_KEY,
      candidateCallable: false,
    },
  }
}

function validateFinalizationTransportContract(value) {
  if (stableStringify(value) !== stableStringify(finalizationTransportContract())) {
    fail('finalizer transport contract differs from the closed two-hop authority boundary')
  }
  return value
}

export function finalizationTransportContractDigest(value = finalizationTransportContract()) {
  validateFinalizationTransportContract(value)
  return sha256(Buffer.from(stableStringify(value)))
}

function commonRequest(operation) {
  const repository = env('GITHUB_REPOSITORY')
  if (repository !== 'ajenchen/design-system') fail('authority repository identity is invalid')
  return {
    schemaVersion: 1,
    kind: 'managed-ci-authority-operation-request-v1',
    operation,
    repository,
    repositoryId: env('GITHUB_REPOSITORY_ID', RUN_ID),
    repositoryOwnerId: env('GITHUB_REPOSITORY_OWNER_ID', RUN_ID),
    workflowRef: env('GITHUB_WORKFLOW_REF'),
    workflowSha: env('GITHUB_WORKFLOW_SHA', HEX40),
    workflowRunId: env('GITHUB_RUN_ID', RUN_ID),
    runAttempt: Number(env('GITHUB_RUN_ATTEMPT', RUN_ID)),
    eventName: env('GITHUB_EVENT_NAME'),
    protectedRef: env('GITHUB_REF'),
  }
}

function fixedRequest(operation) {
  const common = commonRequest(operation)
  if (common.workflowRef !== 'ajenchen/design-system/.github/workflows/deep-audit-managed.yml@refs/heads/main'
    || common.eventName !== 'workflow_dispatch' || common.protectedRef !== 'refs/heads/main') fail('authority workflow/ref/event identity is invalid')
  if (operation === 'freeze-subject') {
    return {
      ...common,
      workflowDefinitionTree: env('MANAGED_WORKFLOW_DEFINITION_TREE', HEX40),
      subjectCommit: env('MANAGED_SUBJECT_COMMIT', HEX40),
      subjectTree: env('MANAGED_SUBJECT_TREE', HEX40),
      retrievalMode: 'external-github-git-object-read-by-exact-commit-and-tree',
      candidateBytesExecute: false,
    }
  }
  if (operation === 'authorize-sandbox-session') {
    return {
      ...common,
      subjectCommit: env('MANAGED_SUBJECT_COMMIT', HEX40),
      subjectTree: env('MANAGED_SUBJECT_TREE', HEX40),
      frozenArtifactName: env('MANAGED_FROZEN_ARTIFACT_NAME'),
      frozenArtifactId: env('MANAGED_FROZEN_ARTIFACT_ID', RUN_ID),
      frozenArtifactLocator: env('MANAGED_FROZEN_ARTIFACT_LOCATOR'),
      frozenArtifactSha256: env('MANAGED_FROZEN_ARTIFACT_SHA256', HEX64),
      frozenArtifactSize: Number(env('MANAGED_FROZEN_ARTIFACT_SIZE', RUN_ID)),
      frozenLineageDigest: env('MANAGED_FROZEN_LINEAGE_DIGEST', HEX64),
      executionClasses: [...CLASSES],
      sessionHandleMode: 'opaque-non-secret-candidate-non-callable',
    }
  }
  const classResultInventory = fixedFileInventory('.managed-ci/input', 'finalizer class results')
  const rawReceiptSet = fixedRawReceiptSet('.managed-ci/input', classResultInventory)
  return {
    ...common,
    classResultInventory,
    rawReceiptSet,
    hostObservationInventory: fixedFileInventory('.managed-ci/finalize', 'finalizer host observations'),
    signerIssuerRegistry: loadTrustedIssuerRegistry(),
    transportContract: finalizationTransportContract(),
    candidateBytesExecute: false,
  }
}

function fixedFileInventory(rootPath, label) {
  const root = resolve(rootPath)
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) fail(`${label} root is missing or unsafe`)
  const files = []
  const visit = directory => {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name)
      const rel = relative(root, path)
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} path escapes root`)
      const info = lstatSync(path)
      if (info.isSymbolicLink()) fail(`${label} contains a symbolic link`)
      if (info.isDirectory()) visit(path)
      else if (info.isFile() && info.nlink === 1) {
        const bytes = readFileSync(path)
        files.push({ path: rel.split(sep).join('/'), sha256: sha256(bytes), size: bytes.length })
      } else fail(`${label} contains a non-unique non-regular entry`)
    }
  }
  visit(root)
  if (files.length === 0) fail(`${label} is empty`)
  return { files, inventoryDigest: sha256(Buffer.from(stableStringify(files))) }
}

export function fixedRawReceiptSet(rootPath, classResultInventory) {
  const root = resolve(rootPath)
  const inventory = new Map(classResultInventory.files.map(file => [file.path, file]))
  return Object.fromEntries(CLASSES.map(executionClass => {
    const relativePath = `${executionClass}/receipts/${executionClass}.json`
    const target = resolve(root, relativePath)
    const rel = relative(root, target)
    if (rel !== relativePath.split('/').join(sep)) fail(`raw receipt path is not canonical:${executionClass}`)
    let cursor = root
    for (const part of rel.split(sep)) {
      cursor = resolve(cursor, part)
      if (!existsSync(cursor)) fail(`raw receipt is missing:${executionClass}`)
      const info = lstatSync(cursor)
      if (info.isSymbolicLink()) fail(`raw receipt crosses a symbolic link:${executionClass}`)
      if (cursor === target && (!info.isFile() || info.nlink !== 1)) fail(`raw receipt is not one unique regular file:${executionClass}`)
    }
    const bytes = readFileSync(target)
    if (bytes.length < 2 || bytes.length > MAX_RAW_RECEIPT_BYTES) fail(`raw receipt size is outside the closed bound:${executionClass}`)
    const digest = sha256(bytes)
    const entry = inventory.get(relativePath)
    if (!entry || entry.sha256 !== digest || entry.size !== bytes.length) fail(`raw receipt bytes differ from the fixed finalizer inventory:${executionClass}`)
    return [executionClass, {
      path: `${executionClass}.json`,
      sourceArtifactPath: relativePath,
      sha256: digest,
      size: bytes.length,
      contentBase64: bytes.toString('base64'),
    }]
  }))
}

function validateFileInventory(value, label, {
  exactPaths = null,
  allowedClassRoots = false,
} = {}) {
  exactKeys(value, ['files', 'inventoryDigest'], label)
  if (!Array.isArray(value.files) || value.files.length === 0) fail(`${label} is empty`)
  const paths = []
  for (const [index, file] of value.files.entries()) {
    exactKeys(file, ['path', 'sha256', 'size'], `${label}.files[${index}]`)
    if (typeof file.path !== 'string'
      || file.path.length === 0
      || file.path.includes('\\')
      || file.path.includes('\0')
      || isAbsolute(file.path)
      || file.path.split('/').some(part => part.length === 0 || part === '.' || part === '..')
      || !Number.isSafeInteger(file.size)
      || file.size < 1) {
      fail(`${label}.files[${index}] has an unsafe path or size`)
    }
    digest(file.sha256, `${label}.files[${index}].sha256`)
    if (allowedClassRoots) {
      const [executionClass, category, ...rest] = file.path.split('/')
      if (!CLASSES.includes(executionClass)
        || !['output', 'receipts'].includes(category)
        || rest.length === 0
        || (category === 'receipts'
          && file.path !== `${executionClass}/receipts/${executionClass}.json`)) {
        fail(`${label}.files[${index}] is outside the closed class result layout`)
      }
    }
    paths.push(file.path)
  }
  if (new Set(paths).size !== paths.length
    || stableStringify(paths) !== stableStringify([...paths].sort())) {
    fail(`${label} paths are not unique and sorted`)
  }
  if (exactPaths !== null && stableStringify(paths) !== stableStringify([...exactPaths].sort())) {
    fail(`${label} differs from the exact required file set`)
  }
  if (value.inventoryDigest !== sha256(Buffer.from(stableStringify(value.files)))) {
    fail(`${label} digest is not reproducible`)
  }
  return value
}

function validateRawReceiptSet(value, classResultInventory, label = 'finalizer raw receipt set') {
  exactKeys(value, CLASSES, label)
  const inventory = new Map(classResultInventory.files.map(file => [file.path, file]))
  for (const executionClass of CLASSES) {
    const item = value[executionClass]
    exactKeys(item, ['path', 'sourceArtifactPath', 'sha256', 'size', 'contentBase64'], `${label}.${executionClass}`)
    const expectedPath = `${executionClass}.json`
    const expectedSourcePath = `${executionClass}/receipts/${executionClass}.json`
    if (item.path !== expectedPath
      || item.sourceArtifactPath !== expectedSourcePath
      || !Number.isSafeInteger(item.size)
      || item.size < 2
      || item.size > MAX_RAW_RECEIPT_BYTES) {
      fail(`${label}.${executionClass} path or size is invalid`)
    }
    digest(item.sha256, `${label}.${executionClass}.sha256`)
    const bytes = canonicalBase64(item.contentBase64, `${label}.${executionClass}.contentBase64`)
    let parsed
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch (error) {
      fail(`${label}.${executionClass} bytes are not strict UTF-8 JSON:${error.message}`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail(`${label}.${executionClass} JSON is not an object`)
    }
    const inventoryItem = inventory.get(expectedSourcePath)
    if (bytes.length !== item.size
      || sha256(bytes) !== item.sha256
      || !inventoryItem
      || inventoryItem.size !== item.size
      || inventoryItem.sha256 !== item.sha256) {
      fail(`${label}.${executionClass} bytes differ from the fixed class inventory`)
    }
  }
  return value
}

export function validateFinalizationRequest(value) {
  exactKeys(value, [
    'schemaVersion',
    'kind',
    'operation',
    'repository',
    'repositoryId',
    'repositoryOwnerId',
    'workflowRef',
    'workflowSha',
    'workflowRunId',
    'runAttempt',
    'eventName',
    'protectedRef',
    'classResultInventory',
    'rawReceiptSet',
    'hostObservationInventory',
    'signerIssuerRegistry',
    'transportContract',
    'candidateBytesExecute',
  ], 'finalizer request')
  if (value.schemaVersion !== 1
    || value.kind !== 'managed-ci-authority-operation-request-v1'
    || value.operation !== 'finalize-receipts'
    || value.repository !== 'ajenchen/design-system'
    || !RUN_ID.test(value.repositoryId ?? '')
    || !RUN_ID.test(value.repositoryOwnerId ?? '')
    || value.workflowRef !== 'ajenchen/design-system/.github/workflows/deep-audit-managed.yml@refs/heads/main'
    || !HEX40.test(value.workflowSha ?? '')
    || !RUN_ID.test(value.workflowRunId ?? '')
    || value.eventName !== 'workflow_dispatch'
    || value.protectedRef !== 'refs/heads/main'
    || value.candidateBytesExecute !== false) {
    fail('finalizer request authority identity is invalid')
  }
  positiveRunAttempt(value.runAttempt, 'finalizer request runAttempt')
  validateFileInventory(value.classResultInventory, 'finalizer class result inventory', {
    allowedClassRoots: true,
  })
  for (const executionClass of CLASSES) {
    if (!value.classResultInventory.files.some(
      file => file.path === `${executionClass}/receipts/${executionClass}.json`,
    )) {
      fail(`finalizer class result inventory lacks the canonical raw receipt:${executionClass}`)
    }
  }
  validateRawReceiptSet(value.rawReceiptSet, value.classResultInventory)
  validateFileInventory(value.hostObservationInventory, 'finalizer host observation inventory', {
    exactPaths: CLASSES.map(executionClass => `${executionClass}/host/${executionClass}.json`),
  })
  validateIssuerRegistry(value.signerIssuerRegistry)
  validateFinalizationTransportContract(value.transportContract)
  return true
}

export function finalizationRequestDigest(value) {
  validateFinalizationRequest(value)
  return sha256(Buffer.from(stableStringify(value)))
}

export function finalizationRequestEnvelope(value) {
  const requestSha256 = finalizationRequestDigest(value)
  return {
    schemaVersion: 1,
    kind: FINALIZATION_REQUEST_KIND,
    operation: 'finalize-receipts',
    requestSha256,
    request: value,
  }
}

async function oidcToken(audience) {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!url || !bearer) fail('GitHub OIDC request capability is unavailable in the trusted authority job')
  const target = new URL(url)
  target.searchParams.set('audience', audience)
  return await new Promise((resolve, reject) => {
    const call = request(target, { method: 'GET', headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) fail(`OIDC endpoint returned ${response.statusCode}`)
          const value = JSON.parse(body).value
          if (typeof value !== 'string' || value.split('.').length !== 3) fail('OIDC endpoint returned an invalid token')
          resolve(value)
        } catch (error) { reject(error) }
      })
    })
    call.on('error', reject)
    call.end()
  })
}

async function postJson(host, path, token, body) {
  const encoded = Buffer.from(JSON.stringify(body))
  return await new Promise((resolve, reject) => {
    const call = request({
      hostname: host,
      servername: host,
      port: AUTHORITY_GATEWAY_PORT,
      path,
      method: 'POST',
      minVersion: 'TLSv1.3',
      rejectUnauthorized: true,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': encoded.length,
      },
    }, response => {
      let result = ''
      if (response.socket.getProtocol() !== 'TLSv1.3'
        || response.socket.authorized !== true
        || response.socket.authorizationError) {
        call.destroy(new Error('authority gateway transport is not verified TLS 1.3'))
        return
      }
      response.setEncoding('utf8')
      response.on('data', chunk => {
        result += chunk
        if (Buffer.byteLength(result) > 128 * 1024 * 1024) call.destroy(new Error('authority response exceeds the closed size limit'))
      })
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) fail(`authority service returned ${response.statusCode}`)
          resolve(JSON.parse(result))
        } catch (error) { reject(error) }
      })
    })
    call.on('error', reject)
    call.end(encoded)
  })
}

function output(name, value) {
  const target = env('GITHUB_OUTPUT')
  if (typeof value !== 'string' || value.includes('\n') || value.includes('\r')) fail(`authority output is invalid:${name}`)
  appendFileSync(target, `${name}=${value}\n`, { encoding: 'utf8' })
}

function canonicalBase64(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail(`${label} is not canonical base64`)
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) fail(`${label} is not canonical base64`)
  return bytes
}

function validateRawReceiptReadback(value, {
  executionClass,
  request,
  rawReceipt,
}) {
  exactKeys(value, RAW_READBACK_KEYS, `${executionClass} raw receipt validation readback`)
  if (value.schemaVersion !== 1
    || value.kind !== 'managed-ci-raw-receipt-validation-readback-v1'
    || value.executionClass !== executionClass
    || EVIDENCE_CLASS[value.evidenceKind] !== executionClass
    || value.workflowRunId !== request.workflowRunId
    || value.runAttempt !== request.runAttempt
    || value.rawReceiptPath !== rawReceipt.path
    || value.rawReceiptSize !== rawReceipt.size
    || value.rawReceiptDigest !== rawReceipt.sha256) {
    fail(`${executionClass} raw receipt validation readback is detached from the request bytes/class/run`)
  }
  positiveRunAttempt(value.runAttempt, `${executionClass} raw receipt validation readback runAttempt`)
  if (!Number.isSafeInteger(value.rawReceiptSize)
    || value.rawReceiptSize < 2
    || value.rawReceiptSize > MAX_RAW_RECEIPT_BYTES) {
    fail(`${executionClass} raw receipt validation readback size is invalid`)
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
  ]) digest(value[key], `${executionClass} raw receipt validation readback.${key}`)
  canonicalUtc(value.verifiedAt, `${executionClass} raw receipt validation readback.verifiedAt`)
  if (!Number.isSafeInteger(value.requiredIssuerQuorum)
    || value.requiredIssuerQuorum < 1
    || value.requiredIssuerQuorum > 5) {
    fail(`${executionClass} raw receipt validation readback quorum is invalid`)
  }
  sortedUniqueStrings(
    value.verifiedIssuerKeyIds,
    /^[a-z0-9][a-z0-9._-]*$/,
    value.requiredIssuerQuorum,
    `${executionClass} raw receipt validation readback issuer keys`,
  )
  sortedUniqueStrings(
    value.verifiedIssuerSubjects,
    /^.+$/,
    value.requiredIssuerQuorum,
    `${executionClass} raw receipt validation readback issuer subjects`,
  )
  if (value.verifiedIssuerKeyIds.length !== value.verifiedIssuerSubjects.length) {
    fail(`${executionClass} raw receipt validation readback issuer key/subject cardinality differs`)
  }
  exactKeys(value.checks, RAW_READBACK_CHECK_KEYS, `${executionClass} raw receipt validation checks`)
  if (RAW_READBACK_CHECK_KEYS.some(key => value.checks[key] !== true)) {
    fail(`${executionClass} raw receipt validation did not pass every required check`)
  }
  return value
}

function validateFinalizedReceiptPayload(value, {
  executionClass,
  request,
  readback,
}) {
  exactKeys(value, FINALIZED_RECEIPT_KEYS, `${executionClass} finalized receipt payload`)
  if (value.schemaVersion !== 1
    || value.kind !== 'managed-ci-finalized-receipt-v1'
    || value.executionClass !== executionClass
    || value.evidenceKind !== readback.evidenceKind
    || EVIDENCE_CLASS[value.evidenceKind] !== executionClass
    || value.workflowRunId !== request.workflowRunId
    || value.runAttempt !== request.runAttempt
    || value.rawReceiptDigest !== readback.rawReceiptDigest
    || value.rawReceiptSchemaDigest !== readback.rawReceiptSchemaDigest
    || value.rawReceiptValidationDigest !== sha256(Buffer.from(stableStringify(readback)))) {
    fail(`${executionClass} finalized receipt payload is detached from the validated raw receipt/class/run`)
  }
  positiveRunAttempt(value.runAttempt, `${executionClass} finalized receipt payload runAttempt`)
  for (const key of [
    'rawReceiptDigest',
    'rawReceiptSchemaDigest',
    'rawReceiptValidationDigest',
    'provenanceBindingDigest',
    'receiptBindingDigest',
    'frozenSubjectReadbackDigest',
    'hostObservationReceiptDigest',
    'imageSupplyChainBindingDigest',
    'signerAuthorityBindingDigest',
    'issuerMappingDigest',
  ]) digest(value[key], `${executionClass} finalized receipt payload.${key}`)
  canonicalUtc(value.signedAt, `${executionClass} finalized receipt payload.signedAt`)
  if (readback.verifiedAt !== value.signedAt) {
    fail(`${executionClass} raw receipt validation time differs from the final signature time`)
  }
  return value
}

function finalizedReceiptSigningBytes(value) {
  return Buffer.from(`${RECEIPT_PAYLOAD_DOMAIN}\0${stableStringify(value)}`, 'utf8')
}

function finalizedReceiptPayloadDigest(value) {
  return sha256(finalizedReceiptSigningBytes(value))
}

function validateSignerAuditEvent(value, {
  executionClass,
  request,
  payload,
  eventIds,
  issuerRegistry,
  issuerMapping,
}) {
  exactKeys(value, SIGNER_AUDIT_KEYS, `${executionClass} signer audit event`)
  if (typeof value.eventId !== 'string'
    || !/^[A-Za-z0-9._:-]{8,256}$/.test(value.eventId)
    || eventIds.has(value.eventId)) {
    fail(`${executionClass} signer audit event id is invalid or replayed`)
  }
  eventIds.add(value.eventId)
  if (value.tenantId !== FINAL_RECEIPT_SIGNER_TENANT
    || value.keyIdentity !== FINAL_RECEIPT_SIGNER_KEY
    || value.environment !== FINAL_RECEIPT_SIGNER_ENVIRONMENT
    || value.workflowRunId !== request.workflowRunId
    || value.runAttempt !== request.runAttempt
    || value.executionClass !== executionClass
    || value.rawReceiptDigest !== payload.rawReceiptDigest
    || value.signerAuthorityBindingDigest !== payload.signerAuthorityBindingDigest
    || value.issuerMappingDigest !== payload.issuerMappingDigest
    || value.signedAt !== payload.signedAt
    || value.payloadDigest !== finalizedReceiptPayloadDigest(payload)) {
    fail(`${executionClass} signer audit event is detached from the canonical finalized payload`)
  }
  positiveRunAttempt(value.runAttempt, `${executionClass} signer audit event runAttempt`)
  for (const key of [
    'policyDigest',
    'payloadDigest',
    'rawReceiptDigest',
    'signerAuthorityBindingDigest',
    'issuerMappingDigest',
  ]) digest(value[key], `${executionClass} signer audit event.${key}`)
  const issuerMappingDigest = sha256(Buffer.from(stableStringify(issuerMapping)))
  if (value.issuerMappingDigest !== issuerMappingDigest
    || payload.issuerMappingDigest !== issuerMappingDigest) {
    fail(`${executionClass} signer audit event is detached from the exact issuer mapping`)
  }
  verifyIssuerSignature({
    registry: issuerRegistry,
    issuerMapping,
    signedAt: value.signedAt,
    bytes: finalizedReceiptSigningBytes(payload),
    signature: value.signature,
    label: `${executionClass} signer audit event`,
  })
  canonicalUtc(value.signedAt, `${executionClass} signer audit event.signedAt`)
  return value
}

export function finalizedReceiptSetDigest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('finalized receipt set is invalid')
  }
  const unsigned = structuredClone(value)
  delete unsigned.setDigest
  return sha256(Buffer.from(
    `${FINALIZED_RECEIPT_SET_DOMAIN}\0${stableStringify(unsigned)}`,
    'utf8',
  ))
}

function validateFinalizedReceiptSet(value, {
  request,
  requestSha256,
}) {
  exactKeys(value, [
    'schemaVersion',
    'kind',
    'requestSha256',
    'workflowRunId',
    'runAttempt',
    'rawReceiptSetDigest',
    'signerIssuerMapping',
    'receipts',
    'setDigest',
  ], 'finalized receipt set')
  if (value.schemaVersion !== 1
    || value.kind !== FINALIZED_RECEIPT_SET_KIND
    || value.requestSha256 !== requestSha256
    || value.workflowRunId !== request.workflowRunId
    || value.runAttempt !== request.runAttempt
    || value.rawReceiptSetDigest !== sha256(Buffer.from(stableStringify(request.rawReceiptSet)))) {
    fail('finalized receipt set is detached from the exact finalizer request/run/raw receipt set')
  }
  positiveRunAttempt(value.runAttempt, 'finalized receipt set runAttempt')
  digest(value.rawReceiptSetDigest, 'finalized receipt set rawReceiptSetDigest')
  digest(value.setDigest, 'finalized receipt set setDigest')
  const issuerRegistry = request.signerIssuerRegistry
  validateIssuerMapping(value.signerIssuerMapping, issuerRegistry)
  exactKeys(value.receipts, CLASSES, 'finalized receipt set class closure')
  const eventIds = new Set()
  let commonBindings = null
  let latestSignedAt = null
  for (const executionClass of CLASSES) {
    const entry = value.receipts[executionClass]
    exactKeys(entry, [
      'rawReceiptPath',
      'rawReceiptDigest',
      'rawReceiptValidationReadback',
      'receiptSigningPayload',
      'signerAuditEvent',
    ], `${executionClass} finalized receipt entry`)
    const rawReceipt = request.rawReceiptSet[executionClass]
    if (entry.rawReceiptPath !== rawReceipt.path
      || entry.rawReceiptDigest !== rawReceipt.sha256) {
      fail(`${executionClass} finalized receipt entry is detached from the request raw bytes`)
    }
    digest(entry.rawReceiptDigest, `${executionClass} finalized receipt entry.rawReceiptDigest`)
    const readback = validateRawReceiptReadback(entry.rawReceiptValidationReadback, {
      executionClass,
      request,
      rawReceipt,
    })
    if (readback.issuerRegistryDigest !== value.signerIssuerMapping.issuerRegistryDigest) {
      fail(`${executionClass} raw receipt validation used a different issuer registry snapshot`)
    }
    const payload = validateFinalizedReceiptPayload(entry.receiptSigningPayload, {
      executionClass,
      request,
      readback,
    })
    const auditEvent = validateSignerAuditEvent(entry.signerAuditEvent, {
      executionClass,
      request,
      payload,
      eventIds,
      issuerRegistry,
      issuerMapping: value.signerIssuerMapping,
    })
    const bindings = {
      rawReceiptSchemaDigest: readback.rawReceiptSchemaDigest,
      issuerRegistryDigest: readback.issuerRegistryDigest,
      runtimePolicyDigest: readback.runtimePolicyDigest,
      requiredIssuerQuorum: readback.requiredIssuerQuorum,
      signerAuthorityBindingDigest: payload.signerAuthorityBindingDigest,
      issuerMappingDigest: payload.issuerMappingDigest,
      signerPolicyDigest: auditEvent.policyDigest,
    }
    if (commonBindings === null) commonBindings = bindings
    else if (stableStringify(bindings) !== stableStringify(commonBindings)) {
      fail('finalized receipt classes do not share one schema/trust/signer policy snapshot')
    }
    const signedAt = canonicalUtc(payload.signedAt, `${executionClass} finalized receipt signedAt`)
    if (latestSignedAt === null || signedAt > latestSignedAt) latestSignedAt = signedAt
  }
  if (value.setDigest !== finalizedReceiptSetDigest(value)) {
    fail('finalized receipt set digest is not reproducible')
  }
  return {
    signerAuthorityBindingDigest: commonBindings.signerAuthorityBindingDigest,
    signerIssuerMapping: structuredClone(value.signerIssuerMapping),
    signerIssuerRegistry: structuredClone(issuerRegistry),
    latestSignedAt,
  }
}

export function finalizationTransportReadbackDigest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('finalization transport readback is invalid')
  }
  const unsigned = structuredClone(value)
  delete unsigned.readbackDigest
  return sha256(Buffer.from(
    `${TRANSPORT_READBACK_DOMAIN}\0${stableStringify(unsigned)}`,
    'utf8',
  ))
}

export function finalizationTransportAttestationPayloadDigest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('finalization transport attestation payload is invalid')
  }
  const payload = {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    requestSha256: value.requestSha256,
    finalizedReceiptSetDigest: value.finalizedReceiptSetDigest,
    transportContractDigest: value.transportContractDigest,
    clientToGateway: value.clientToGateway,
    gatewayToSigner: value.gatewayToSigner,
    observedAt: value.observedAt,
    issuerMapping: value.attestation?.issuerMapping,
    signedAt: value.attestation?.signedAt,
  }
  return sha256(Buffer.from(
    `${TRANSPORT_ATTESTATION_DOMAIN}:payload\0${stableStringify(payload)}`,
    'utf8',
  ))
}

export function finalizationTransportAttestationSigningBytes(value) {
  return Buffer.from(
    `${TRANSPORT_ATTESTATION_DOMAIN}\0${finalizationTransportAttestationPayloadDigest(value)}`,
    'utf8',
  )
}

export function validateFinalizationTransportReadback(value, {
  request,
  requestSha256,
  finalizedReceiptSetDigest,
  signerAuthorityBindingDigest,
  signerIssuerMapping,
  signerIssuerRegistry,
  latestSignedAt,
}) {
  exactKeys(value, [
    'schemaVersion',
    'kind',
    'requestSha256',
    'finalizedReceiptSetDigest',
    'transportContractDigest',
    'clientToGateway',
    'gatewayToSigner',
    'observedAt',
    'attestation',
    'readbackDigest',
  ], 'finalization transport readback')
  if (value.schemaVersion !== 1
    || value.kind !== 'managed-ci-finalization-transport-readback-v1'
    || value.requestSha256 !== requestSha256
    || value.finalizedReceiptSetDigest !== finalizedReceiptSetDigest
    || value.transportContractDigest
      !== finalizationTransportContractDigest(request.transportContract)) {
    fail('finalization transport readback is detached from the exact request contract')
  }
  exactKeys(value.clientToGateway, [
    'endpointHost',
    'endpointPort',
    'operationPath',
    'tlsVersion',
    'serverHostnameVerified',
    'clientAuthentication',
    'oidcAudience',
    'oidcBearerVerified',
  ], 'finalization client-to-gateway transport readback')
  if (value.clientToGateway.endpointHost !== AUTHORITY_GATEWAY_HOST
    || value.clientToGateway.endpointPort !== AUTHORITY_GATEWAY_PORT
    || value.clientToGateway.operationPath !== FINALIZATION_OPERATION_PATH
    || value.clientToGateway.tlsVersion !== 'TLSv1.3'
    || value.clientToGateway.serverHostnameVerified !== true
    || value.clientToGateway.clientAuthentication !== 'github-oidc-bearer'
    || value.clientToGateway.oidcAudience !== AUTHORITY_OIDC_AUDIENCE
    || value.clientToGateway.oidcBearerVerified !== true) {
    fail('finalization client-to-gateway transport readback is invalid')
  }
  exactKeys(value.gatewayToSigner, [
    'endpointHost',
    'endpointPort',
    'transport',
    'tlsVersion',
    'mutualTlsEstablished',
    'gatewayClientCertificateIdentity',
    'signerServerCertificateIdentity',
    'signerKeyIdentity',
    'signerAuthorityBindingDigest',
    'gatewayHeldSignerPrivateKey',
  ], 'finalization gateway-to-signer transport readback')
  if (value.gatewayToSigner.endpointHost !== SIGNER_ENDPOINT_HOST
    || value.gatewayToSigner.endpointPort !== SIGNER_ENDPOINT_PORT
    || value.gatewayToSigner.transport !== SIGNER_TRANSPORT
    || value.gatewayToSigner.tlsVersion !== 'TLSv1.3'
    || value.gatewayToSigner.mutualTlsEstablished !== true
    || value.gatewayToSigner.gatewayClientCertificateIdentity
      !== FINALIZER_GATEWAY_CERTIFICATE_IDENTITY
    || value.gatewayToSigner.signerServerCertificateIdentity
      !== SIGNER_CERTIFICATE_IDENTITY
    || value.gatewayToSigner.signerKeyIdentity !== FINAL_RECEIPT_SIGNER_KEY
    || value.gatewayToSigner.signerAuthorityBindingDigest
      !== signerAuthorityBindingDigest
    || value.gatewayToSigner.gatewayHeldSignerPrivateKey !== false) {
    fail('finalization gateway-to-signer mTLS transport readback is invalid')
  }
  digest(
    value.gatewayToSigner.signerAuthorityBindingDigest,
    'finalization gateway-to-signer signer authority binding digest',
  )
  digest(value.transportContractDigest, 'finalization transport contract digest')
  digest(value.finalizedReceiptSetDigest, 'finalization transport finalized receipt set digest')
  digest(value.readbackDigest, 'finalization transport readback digest')
  const observedAt = canonicalUtc(value.observedAt, 'finalization transport readback observedAt')
  if (observedAt < latestSignedAt) {
    fail('finalization transport readback predates the finalized signer operation')
  }
  if (value.readbackDigest !== finalizationTransportReadbackDigest(value)) {
    fail('finalization transport readback digest is not reproducible')
  }
  exactKeys(
    value.attestation,
    TRANSPORT_ATTESTATION_KEYS,
    'finalization transport readback attestation',
  )
  if (value.attestation.signedAt !== value.observedAt
    || stableStringify(value.attestation.issuerMapping)
      !== stableStringify(signerIssuerMapping)) {
    fail('finalization transport readback attestation is detached from the signer/request observation')
  }
  if (value.attestation.payloadDigest
    !== finalizationTransportAttestationPayloadDigest(value)) {
    fail('finalization transport readback attestation payload digest is not reproducible')
  }
  verifyIssuerSignature({
    registry: signerIssuerRegistry,
    issuerMapping: value.attestation.issuerMapping,
    signedAt: value.attestation.signedAt,
    bytes: finalizationTransportAttestationSigningBytes(value),
    signature: value.attestation.signature,
    label: 'finalization transport readback attestation',
  })
  return true
}

export function validateFinalizationResponse(value, {
  request: requestValue,
  requestSha256 = finalizationRequestDigest(requestValue),
} = {}) {
  validateFinalizationRequest(requestValue)
  exactKeys(value, [
    'schemaVersion',
    'kind',
    'operation',
    'status',
    'requestSha256',
    'finalizedReceiptSet',
    'transportReadback',
  ], 'finalizer response')
  if (value.schemaVersion !== 1
    || value.kind !== FINALIZATION_RESPONSE_KIND
    || value.operation !== 'finalize-receipts'
    || value.status !== 'complete'
    || value.requestSha256 !== requestSha256) {
    fail('finalizer response is not bound to the exact request')
  }
  const finalizedSet = validateFinalizedReceiptSet(value.finalizedReceiptSet, {
    request: requestValue,
    requestSha256,
  })
  validateFinalizationTransportReadback(value.transportReadback, {
    request: requestValue,
    requestSha256,
    finalizedReceiptSetDigest: value.finalizedReceiptSet.setDigest,
    signerAuthorityBindingDigest: finalizedSet.signerAuthorityBindingDigest,
    signerIssuerMapping: finalizedSet.signerIssuerMapping,
    signerIssuerRegistry: finalizedSet.signerIssuerRegistry,
    latestSignedAt: finalizedSet.latestSignedAt,
  })
  return true
}

function materialize(operation, response, requestEnvelope = null) {
  if (operation === 'freeze-subject') {
    exactKeys(response.outputs, [
      'artifactName', 'artifactId', 'artifactStorageLocator', 'artifactSha256', 'artifactSize',
      'freezeRunId', 'manifestSha256', 'manifestBytesSha256', 'coverageDigest', 'shardSetDigest',
      'authorityOidcProjectionDigest', 'lineageDigest',
    ], 'freeze authority outputs')
    exactKeys(response.materialization, ['artifactBase64', 'lineage'], 'freeze authority materialization')
    const artifact = canonicalBase64(response.materialization.artifactBase64, 'frozen artifact')
    if (sha256(artifact) !== response.outputs.artifactSha256 || artifact.length !== response.outputs.artifactSize
      || !UUID_V4.test(response.outputs.freezeRunId)
      || ['artifactSha256', 'manifestSha256', 'manifestBytesSha256', 'coverageDigest', 'shardSetDigest', 'authorityOidcProjectionDigest', 'lineageDigest'].some(name => !HEX64.test(response.outputs[name]))) {
      fail('frozen artifact bytes or lineage outputs are invalid')
    }
    mkdirSync('.managed-ci', { recursive: true, mode: 0o700 })
    writeFileSync('.managed-ci/frozen-subject.tar', artifact, { flag: 'wx', mode: 0o600 })
    writeFileSync('.managed-ci/frozen-subject-lineage.json', `${JSON.stringify(response.materialization.lineage)}\n`, { flag: 'wx', mode: 0o600 })
    for (const [name, value] of Object.entries(response.outputs)) output(name, String(value))
    return
  }
  if (operation === 'authorize-sandbox-session') {
    exactKeys(response.outputs, ['hostSandboxPolicyDigest'], 'sandbox authority outputs')
    exactKeys(response.sessions, CLASSES, 'sandbox authority session closure')
    if (!HEX64.test(response.outputs.hostSandboxPolicyDigest)) fail('sandbox host policy digest is invalid')
    mkdirSync('.managed-ci/sandbox-session', { recursive: true, mode: 0o700 })
    for (const executionClass of CLASSES) {
      const session = response.sessions[executionClass]
      exactKeys(session, ['schemaVersion', 'kind', 'executionClass', 'handle', 'requestDigest', 'hostSandboxPolicyDigest', 'expiresAt'], `${executionClass} sandbox session`)
      if (session.schemaVersion !== 1 || session.kind !== 'managed-ci-opaque-sandbox-session-v1'
        || session.executionClass !== executionClass || typeof session.handle !== 'string'
        || !/^[A-Za-z0-9._:-]{32,256}$/.test(session.handle) || !HEX64.test(session.requestDigest)
        || session.hostSandboxPolicyDigest !== response.outputs.hostSandboxPolicyDigest
        || new Date(session.expiresAt).toISOString() !== session.expiresAt) fail(`${executionClass} sandbox session is invalid`)
      writeFileSync(`.managed-ci/sandbox-session/${executionClass}.json`, `${JSON.stringify(session)}\n`, { flag: 'wx', mode: 0o600 })
    }
    output('hostSandboxPolicyDigest', response.outputs.hostSandboxPolicyDigest)
    return
  }
  mkdirSync('.managed-ci/finalized', { recursive: true, mode: 0o700 })
  if (!requestEnvelope) fail('finalization request envelope is missing at materialization')
  writeFileSync(
    '.managed-ci/finalized/managed-ci-finalization-request.json',
    `${stableStringify(requestEnvelope)}\n`,
    { flag: 'wx', mode: 0o600 },
  )
  writeFileSync(
    '.managed-ci/finalized/managed-ci-finalization-response.json',
    `${stableStringify(response)}\n`,
    { flag: 'wx', mode: 0o600 },
  )
  writeFileSync(
    '.managed-ci/finalized/managed-ci-finalized-receipt-set.json',
    `${stableStringify(response.finalizedReceiptSet)}\n`,
    { flag: 'wx', mode: 0o600 },
  )
  writeFileSync(
    '.managed-ci/finalized/managed-ci-finalization-transport-readback.json',
    `${stableStringify(response.transportReadback)}\n`,
    { flag: 'wx', mode: 0o600 },
  )
}

async function main() {
  const args = parse(process.argv.slice(2))
  const operation = args['--operation']
  if (!OPERATIONS.has(operation)) fail('operation is invalid')
  exactKeys(args, ['--operation', '--response'], 'authority client arguments')
  if (process.env.MANAGED_CI_AUTHORITY_ENVIRONMENT !== ENVIRONMENTS[operation]) fail('authority environment does not match operation')
  const requestBody = fixedRequest(operation)
  const finalizationEnvelope = operation === 'finalize-receipts'
    ? finalizationRequestEnvelope(requestBody)
    : null
  const requestBytes = Buffer.from(stableStringify(requestBody))
  const requestSha256 = finalizationEnvelope?.requestSha256 ?? sha256(requestBytes)
  const token = await oidcToken(AUTHORITY_OIDC_AUDIENCE)
  const requestEnvelope = finalizationEnvelope ?? {
    schemaVersion: 1,
    operation,
    requestSha256,
    request: requestBody,
  }
  const response = await postJson(
    AUTHORITY_GATEWAY_HOST,
    operation === 'finalize-receipts' ? FINALIZATION_OPERATION_PATH : `/v1/${operation}`,
    token,
    requestEnvelope,
  )
  if (operation === 'finalize-receipts') {
    validateFinalizationResponse(response, {
      request: requestBody,
      requestSha256,
    })
  } else if (response?.requestSha256 !== requestSha256
    || response?.operation !== operation
    || response?.status !== 'complete') {
    fail('authority response is not bound to the exact request')
  }
  materialize(operation, response, finalizationEnvelope)
  writeFileSync(args['--response'], `${stableStringify(response)}\n`, { flag: 'wx', mode: 0o600 })
}

function invokedAsMain() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (invokedAsMain()) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}

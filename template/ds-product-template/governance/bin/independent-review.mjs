#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REQUEST_KIND = 'provider-neutral-independent-review-request'
const PACKET_KIND = 'neutral-independent-review-packet'
const RESULT_KIND = 'provider-neutral-independent-review-result'
const MODES = new Set(['plan-only', 'dispatch'])
const REVIEW_OUTCOMES = new Set(['PASS', 'FINDINGS', 'REVIEW-BLOCKED'])
const PROVIDER_ID = /^[a-z][a-z0-9-]*$/
const GIT_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const SHA256 = /^[a-f0-9]{64}$/
const TARGET_KEYS = Object.freeze([
  'id',
  'operatingSystem',
  'platform',
  'arch',
  'executionEnvironment',
  'distributionVersion',
  'pathClass',
])

function fail(code, message) {
  throw Object.assign(new Error(message), { code })
}

function blocked(error, { mode = null, transportInvoked = false, requestDigest = null, transportResult = null } = {}) {
  return {
    schemaVersion: 1,
    kind: 'provider-neutral-independent-review-launch-result',
    status: 'REVIEW-BLOCKED',
    mode,
    reasonCode: error?.code || 'REVIEW_LAUNCHER_BLOCKED',
    detail: error?.message || String(error),
    requestDigest,
    transportInvoked,
    ...(transportResult === null ? {} : { transportResult }),
  }
}

function plainObject(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be an object`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail(code, `${label} must be a plain object`)
  return value
}

function exactKeys(value, expected, code, label) {
  plainObject(value, code, label)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code, `${label} has an invalid or open shape`)
}

function nonEmptyString(value, code, label) {
  if (typeof value !== 'string' || !value.trim() || /[\0\r\n]/.test(value)) fail(code, `${label} must be one non-empty line`)
  return value
}

function portablePath(value, code, label) {
  nonEmptyString(value, code, label)
  if (value.startsWith('/') || value.includes('\\') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail(code, `${label} must be a portable repository-relative path`)
  }
  return value
}

function sha256(value, code, label) {
  if (!SHA256.test(value ?? '')) fail(code, `${label} must be a lowercase SHA-256 digest`)
  return value
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  }
  return value
}

function digestDomain(domain, value) {
  return createHash('sha256').update(`${domain}\n${JSON.stringify(stableValue(value))}`).digest('hex')
}

function assertSortedUnique(values, code, label, identity = (value) => value) {
  if (!Array.isArray(values)) fail(code, `${label} must be an array`)
  const identities = values.map(identity)
  if (JSON.stringify(identities) !== JSON.stringify([...new Set(identities)].sort())) {
    fail(code, `${label} must be sorted and unique`)
  }
}

function normalizeInventory(value, code = 'REVIEW_PACKET_INVALID') {
  if (!Array.isArray(value) || value.length === 0) fail(code, 'review packet inventory must be a non-empty array')
  const normalized = value.map((entry, index) => {
    exactKeys(entry, ['path', 'sha256'], code, `review packet inventory[${index}]`)
    return {
      path: portablePath(entry.path, code, `review packet inventory[${index}].path`),
      sha256: sha256(entry.sha256, code, `review packet inventory[${index}].sha256`),
    }
  })
  assertSortedUnique(normalized, code, 'review packet inventory', (entry) => entry.path)
  return normalized
}

function normalizeRubric(value, code = 'REVIEW_PACKET_INVALID') {
  if (!Array.isArray(value) || value.length === 0) fail(code, 'review packet rubric must be a non-empty array')
  const normalized = value.map((entry, index) => {
    exactKeys(entry, ['id', 'reference', 'sha256'], code, `review packet rubric[${index}]`)
    const id = nonEmptyString(entry.id, code, `review packet rubric[${index}].id`)
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) fail(code, `review packet rubric[${index}].id is invalid`)
    return {
      id,
      reference: portablePath(entry.reference, code, `review packet rubric[${index}].reference`),
      sha256: sha256(entry.sha256, code, `review packet rubric[${index}].sha256`),
    }
  })
  assertSortedUnique(normalized, code, 'review packet rubric', (entry) => entry.id)
  return normalized
}

function normalizeBrief(value, code = 'REVIEW_PACKET_INVALID') {
  exactKeys(value, ['constraints', 'questions', 'userWording'], code, 'review packet brief')
  const stringArray = (items, label, { nonEmpty = false } = {}) => {
    if (!Array.isArray(items) || (nonEmpty && items.length === 0)) fail(code, `${label} must be ${nonEmpty ? 'a non-empty' : 'an'} array`)
    const normalized = items.map((item, index) => nonEmptyString(item, code, `${label}[${index}]`))
    if (new Set(normalized).size !== normalized.length) fail(code, `${label} must not contain duplicates`)
    return normalized
  }
  return {
    userWording: nonEmptyString(value.userWording, code, 'review packet brief.userWording'),
    questions: stringArray(value.questions, 'review packet brief.questions', { nonEmpty: true }),
    constraints: stringArray(value.constraints, 'review packet brief.constraints'),
  }
}

function normalizeArtifacts(value, code = 'REVIEW_PACKET_INVALID') {
  if (!Array.isArray(value)) fail(code, 'review packet verificationArtifacts must be an array')
  const normalized = value.map((entry, index) => {
    exactKeys(entry, ['id', 'reference', 'sha256'], code, `review packet verificationArtifacts[${index}]`)
    const id = nonEmptyString(entry.id, code, `review packet verificationArtifacts[${index}].id`)
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) fail(code, `review packet verificationArtifacts[${index}].id is invalid`)
    return {
      id,
      reference: nonEmptyString(entry.reference, code, `review packet verificationArtifacts[${index}].reference`),
      sha256: sha256(entry.sha256, code, `review packet verificationArtifacts[${index}].sha256`),
    }
  })
  assertSortedUnique(normalized, code, 'review packet verificationArtifacts', (entry) => entry.id)
  return normalized
}

export function independentReviewInventoryDigest(inventory) {
  return digestDomain('independent-review-inventory-v1', normalizeInventory(inventory))
}

export function independentReviewRubricDigest(rubric) {
  return digestDomain('independent-review-rubric-v1', normalizeRubric(rubric))
}

export function independentReviewBriefDigest(brief) {
  return digestDomain('independent-review-brief-v1', normalizeBrief(brief))
}

export function independentReviewArtifactsDigest(artifacts) {
  return digestDomain('independent-review-artifacts-v1', normalizeArtifacts(artifacts))
}

export function independentReviewOutputDigest(output) {
  if (typeof output !== 'string' || !output.trim()) fail('REVIEW_RESULT_INVALID', 'review result output must be non-empty')
  return createHash('sha256').update(output).digest('hex')
}

function normalizeTarget(target) {
  exactKeys(target, TARGET_KEYS, 'REVIEW_REQUEST_INVALID', 'review request target')
  return Object.fromEntries(TARGET_KEYS.map((key) => [key, nonEmptyString(target[key], 'REVIEW_REQUEST_INVALID', `review request target.${key}`)]))
}

function normalizePacket(packet) {
  exactKeys(packet, [
    'schemaVersion', 'kind', 'repository', 'head', 'tree', 'diffDigest',
    'inventory', 'inventoryDigest', 'rubric', 'rubricDigest', 'brief', 'briefDigest',
    'verificationArtifacts', 'artifactsDigest', 'worktreeFingerprintBefore',
    'authorConclusionsExcluded', 'scopeCoverageRequired', 'mutationPolicy',
  ], 'REVIEW_PACKET_INVALID', 'review packet')
  if (packet.schemaVersion !== 1 || packet.kind !== PACKET_KIND) fail('REVIEW_PACKET_INVALID', 'review packet identity is invalid')
  const repository = nonEmptyString(packet.repository, 'REVIEW_PACKET_INVALID', 'review packet repository')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('REVIEW_PACKET_INVALID', 'review packet repository must be an owner/name identity')
  if (!GIT_OID.test(packet.head ?? '') || !GIT_OID.test(packet.tree ?? '')) fail('REVIEW_PACKET_INVALID', 'review packet head/tree must be lowercase Git object ids')
  const inventory = normalizeInventory(packet.inventory)
  const rubric = normalizeRubric(packet.rubric)
  const brief = normalizeBrief(packet.brief)
  const verificationArtifacts = normalizeArtifacts(packet.verificationArtifacts)
  const normalized = {
    schemaVersion: 1,
    kind: PACKET_KIND,
    repository,
    head: packet.head,
    tree: packet.tree,
    diffDigest: sha256(packet.diffDigest, 'REVIEW_PACKET_INVALID', 'review packet diffDigest'),
    inventory,
    inventoryDigest: sha256(packet.inventoryDigest, 'REVIEW_PACKET_INVALID', 'review packet inventoryDigest'),
    rubric,
    rubricDigest: sha256(packet.rubricDigest, 'REVIEW_PACKET_INVALID', 'review packet rubricDigest'),
    brief,
    briefDigest: sha256(packet.briefDigest, 'REVIEW_PACKET_INVALID', 'review packet briefDigest'),
    verificationArtifacts,
    artifactsDigest: sha256(packet.artifactsDigest, 'REVIEW_PACKET_INVALID', 'review packet artifactsDigest'),
    worktreeFingerprintBefore: sha256(packet.worktreeFingerprintBefore, 'REVIEW_PACKET_INVALID', 'review packet worktreeFingerprintBefore'),
    authorConclusionsExcluded: packet.authorConclusionsExcluded,
    scopeCoverageRequired: packet.scopeCoverageRequired,
    mutationPolicy: packet.mutationPolicy,
  }
  if (normalized.inventoryDigest !== independentReviewInventoryDigest(inventory)) fail('REVIEW_PACKET_DIGEST_MISMATCH', 'review packet inventory digest mismatches')
  if (normalized.rubricDigest !== independentReviewRubricDigest(rubric)) fail('REVIEW_PACKET_DIGEST_MISMATCH', 'review packet rubric digest mismatches')
  if (normalized.briefDigest !== independentReviewBriefDigest(brief)) fail('REVIEW_PACKET_DIGEST_MISMATCH', 'review packet brief digest mismatches')
  if (normalized.artifactsDigest !== independentReviewArtifactsDigest(verificationArtifacts)) fail('REVIEW_PACKET_DIGEST_MISMATCH', 'review packet artifacts digest mismatches')
  if (normalized.authorConclusionsExcluded !== true) fail('REVIEW_PACKET_FRAMED', 'review packet must exclude author conclusions')
  if (normalized.scopeCoverageRequired !== 'complete') fail('REVIEW_PACKET_INVALID', 'review packet must require complete scope coverage')
  if (normalized.mutationPolicy !== 'read-only') fail('REVIEW_PACKET_INVALID', 'review packet must require read-only execution')
  return normalized
}

function normalizeRequest(request) {
  exactKeys(request, [
    'schemaVersion', 'kind', 'mode', 'currentProviderId', 'authorProviderId',
    'runtimeKind', 'surface', 'repositoryRole', 'target', 'packet',
  ], 'REVIEW_REQUEST_INVALID', 'review request')
  if (request.schemaVersion !== 1 || request.kind !== REQUEST_KIND) fail('REVIEW_REQUEST_INVALID', 'review request identity is invalid')
  if (!MODES.has(request.mode)) fail('REVIEW_MODE_INVALID', `review request mode is invalid:${request.mode ?? '<missing>'}`)
  for (const [key, value] of [['currentProviderId', request.currentProviderId], ['authorProviderId', request.authorProviderId]]) {
    if (!PROVIDER_ID.test(value ?? '')) fail('REVIEW_REQUEST_INVALID', `review request ${key} is invalid`)
  }
  const normalized = {
    schemaVersion: 1,
    kind: REQUEST_KIND,
    mode: request.mode,
    currentProviderId: request.currentProviderId,
    authorProviderId: request.authorProviderId,
    runtimeKind: nonEmptyString(request.runtimeKind, 'REVIEW_REQUEST_INVALID', 'review request runtimeKind'),
    surface: nonEmptyString(request.surface, 'REVIEW_REQUEST_INVALID', 'review request surface'),
    repositoryRole: request.repositoryRole,
    target: normalizeTarget(request.target),
    packet: normalizePacket(request.packet),
  }
  if (normalized.repositoryRole !== 'product-consumer') fail('REVIEW_ROLE_BLOCKED', 'product launcher accepts only the product-consumer role')
  return normalized
}

function normalizeBinding(resolved) {
  plainObject(resolved, 'REVIEW_BINDING_INVALID', 'resolved review binding')
  const selected = resolved.selectionStatus !== 'REVIEW-BLOCKED'
  if (selected) {
    plainObject(resolved.certification, 'REVIEW_BINDING_INVALID', 'resolved review certification')
    plainObject(resolved.certification.target, 'REVIEW_BINDING_INVALID', 'resolved review certification target')
  }
  return {
    schemaVersion: 2,
    kind: 'provider-neutral-independent-review-binding',
    skill: nonEmptyString(resolved.skill, 'REVIEW_BINDING_INVALID', 'resolved review skill'),
    authorProviderId: nonEmptyString(resolved.authorProviderId, 'REVIEW_BINDING_INVALID', 'resolved author provider'),
    currentProviderId: nonEmptyString(resolved.currentProviderId, 'REVIEW_BINDING_INVALID', 'resolved current provider'),
    selectionPolicy: nonEmptyString(resolved.selectionPolicy, 'REVIEW_BINDING_INVALID', 'resolved selection policy'),
    reviewClass: nonEmptyString(resolved.reviewClass, 'REVIEW_BINDING_INVALID', 'resolved review class'),
    requiredAssuranceTier: nonEmptyString(resolved.requiredAssuranceTier, 'REVIEW_BINDING_INVALID', 'resolved assurance tier'),
    requiredReasoningTier: nonEmptyString(resolved.requiredReasoningTier, 'REVIEW_BINDING_INVALID', 'resolved reasoning tier'),
    requiredComputeTier: nonEmptyString(resolved.requiredComputeTier, 'REVIEW_BINDING_INVALID', 'resolved compute tier'),
    selectionStatus: selected ? 'selected' : 'REVIEW-BLOCKED',
    selectionReasonCode: selected ? null : nonEmptyString(resolved.selectionReasonCode, 'REVIEW_BINDING_INVALID', 'selection block reason'),
    peerProviderId: selected ? nonEmptyString(resolved.peerProviderId, 'REVIEW_BINDING_INVALID', 'resolved peer provider') : null,
    reviewProfileId: selected ? nonEmptyString(resolved.reviewProfileId, 'REVIEW_BINDING_INVALID', 'resolved review profile') : null,
    modelReleaseId: selected ? nonEmptyString(resolved.modelReleaseId, 'REVIEW_BINDING_INVALID', 'resolved model release') : null,
    requestModelId: selected ? nonEmptyString(resolved.requestModelId, 'REVIEW_BINDING_INVALID', 'resolved request model') : null,
    selectionDigest: selected ? sha256(resolved.selectionDigest, 'REVIEW_BINDING_INVALID', 'resolved selection digest') : null,
    transport: nonEmptyString(resolved.transport, 'REVIEW_BINDING_INVALID', 'resolved transport'),
    invocation: resolved.invocation ?? null,
    bindingDigest: sha256(resolved.bindingDigest, 'REVIEW_BINDING_INVALID', 'resolved binding digest'),
    certificationContract: nonEmptyString(resolved.certificationContract, 'REVIEW_BINDING_INVALID', 'resolved certification contract'),
    certificationId: selected ? nonEmptyString(resolved.certification.certificationId, 'REVIEW_BINDING_INVALID', 'resolved certification id') : null,
    certificationTargetId: selected ? nonEmptyString(resolved.certification.target.id, 'REVIEW_BINDING_INVALID', 'resolved certification target id') : null,
    certificationRecordDigest: selected ? sha256(resolved.certification.recordDigest, 'REVIEW_BINDING_INVALID', 'resolved certification record digest') : null,
  }
}

function normalizeCoverage(values, allowed, label) {
  if (!Array.isArray(values)) fail('REVIEW_RESULT_INVALID', `${label} must be an array`)
  const normalized = values.map((value, index) => nonEmptyString(value, 'REVIEW_RESULT_INVALID', `${label}[${index}]`))
  assertSortedUnique(normalized, 'REVIEW_RESULT_INVALID', label)
  if (normalized.some((value) => !allowed.includes(value))) fail('REVIEW_RESULT_INPUT_MISMATCH', `${label} names an undeclared input`)
  return normalized
}

// Structural validation is exported for the protected managed-broker verifier. It does not by
// itself attest who executed a model. The local launcher therefore never promotes an arbitrary
// callback result to REVIEW-VALIDATED.
export function validateIndependentReviewTransportResult(result, { binding, request, requestDigest }) {
  exactKeys(result, [
    'schemaVersion', 'kind', 'outcome', 'blockReasonCode', 'evidenceClass',
    'peerProviderId', 'reviewProfileId', 'modelReleaseId', 'responseModelId', 'selectionDigest',
    'contextId', 'transport', 'bindingDigest',
    'certificationContract', 'certificationId', 'certificationTargetId', 'certificationRecordDigest',
    'requestDigest', 'repository', 'head', 'tree', 'diffDigest', 'inventoryDigest',
    'rubricDigest', 'briefDigest', 'artifactsDigest', 'coveredPaths', 'coveredRubricIds',
    'coveredArtifactIds', 'output', 'outputDigest', 'worktreeFingerprintBefore',
    'worktreeFingerprintAfter', 'scopeCoverage', 'mutationDetected', 'roleBoundaryConfirmed',
  ], 'REVIEW_RESULT_INVALID', 'review transport result')
  if (result.schemaVersion !== 1 || result.kind !== RESULT_KIND || !REVIEW_OUTCOMES.has(result.outcome)) {
    fail('REVIEW_RESULT_INVALID', 'review transport result identity or outcome is invalid')
  }
  const expectedPaths = request.packet.inventory.map((entry) => entry.path)
  const expectedRubricIds = request.packet.rubric.map((entry) => entry.id)
  const expectedArtifactIds = request.packet.verificationArtifacts.map((entry) => entry.id)
  const normalized = {
    schemaVersion: 1,
    kind: RESULT_KIND,
    outcome: result.outcome,
    blockReasonCode: result.blockReasonCode,
    evidenceClass: result.evidenceClass,
    peerProviderId: nonEmptyString(result.peerProviderId, 'REVIEW_RESULT_INVALID', 'review result peerProviderId'),
    reviewProfileId: nonEmptyString(result.reviewProfileId, 'REVIEW_RESULT_INVALID', 'review result reviewProfileId'),
    modelReleaseId: nonEmptyString(result.modelReleaseId, 'REVIEW_RESULT_INVALID', 'review result modelReleaseId'),
    responseModelId: nonEmptyString(result.responseModelId, 'REVIEW_RESULT_INVALID', 'review result responseModelId'),
    selectionDigest: sha256(result.selectionDigest, 'REVIEW_RESULT_INVALID', 'review result selectionDigest'),
    contextId: nonEmptyString(result.contextId, 'REVIEW_RESULT_INVALID', 'review result contextId'),
    transport: nonEmptyString(result.transport, 'REVIEW_RESULT_INVALID', 'review result transport'),
    bindingDigest: sha256(result.bindingDigest, 'REVIEW_RESULT_INVALID', 'review result bindingDigest'),
    certificationContract: nonEmptyString(result.certificationContract, 'REVIEW_RESULT_INVALID', 'review result certificationContract'),
    certificationId: nonEmptyString(result.certificationId, 'REVIEW_RESULT_INVALID', 'review result certificationId'),
    certificationTargetId: nonEmptyString(result.certificationTargetId, 'REVIEW_RESULT_INVALID', 'review result certificationTargetId'),
    certificationRecordDigest: sha256(result.certificationRecordDigest, 'REVIEW_RESULT_INVALID', 'review result certificationRecordDigest'),
    requestDigest: sha256(result.requestDigest, 'REVIEW_RESULT_INVALID', 'review result requestDigest'),
    repository: nonEmptyString(result.repository, 'REVIEW_RESULT_INVALID', 'review result repository'),
    head: result.head,
    tree: result.tree,
    diffDigest: sha256(result.diffDigest, 'REVIEW_RESULT_INVALID', 'review result diffDigest'),
    inventoryDigest: sha256(result.inventoryDigest, 'REVIEW_RESULT_INVALID', 'review result inventoryDigest'),
    rubricDigest: sha256(result.rubricDigest, 'REVIEW_RESULT_INVALID', 'review result rubricDigest'),
    briefDigest: sha256(result.briefDigest, 'REVIEW_RESULT_INVALID', 'review result briefDigest'),
    artifactsDigest: sha256(result.artifactsDigest, 'REVIEW_RESULT_INVALID', 'review result artifactsDigest'),
    coveredPaths: normalizeCoverage(result.coveredPaths, expectedPaths, 'review result coveredPaths'),
    coveredRubricIds: normalizeCoverage(result.coveredRubricIds, expectedRubricIds, 'review result coveredRubricIds'),
    coveredArtifactIds: normalizeCoverage(result.coveredArtifactIds, expectedArtifactIds, 'review result coveredArtifactIds'),
    output: result.output,
    outputDigest: sha256(result.outputDigest, 'REVIEW_RESULT_INVALID', 'review result outputDigest'),
    worktreeFingerprintBefore: sha256(result.worktreeFingerprintBefore, 'REVIEW_RESULT_INVALID', 'review result worktreeFingerprintBefore'),
    worktreeFingerprintAfter: sha256(result.worktreeFingerprintAfter, 'REVIEW_RESULT_INVALID', 'review result worktreeFingerprintAfter'),
    scopeCoverage: result.scopeCoverage,
    mutationDetected: result.mutationDetected,
    roleBoundaryConfirmed: result.roleBoundaryConfirmed,
  }
  if (normalized.outputDigest !== independentReviewOutputDigest(normalized.output)) fail('REVIEW_RESULT_OUTPUT_MISMATCH', 'review result output digest mismatches')
  const bindingEcho = [
    ['peerProviderId', binding.peerProviderId], ['reviewProfileId', binding.reviewProfileId],
    ['modelReleaseId', binding.modelReleaseId], ['responseModelId', binding.requestModelId],
    ['selectionDigest', binding.selectionDigest],
    ['transport', binding.transport], ['bindingDigest', binding.bindingDigest],
    ['certificationContract', binding.certificationContract], ['certificationId', binding.certificationId],
    ['certificationTargetId', binding.certificationTargetId], ['certificationRecordDigest', binding.certificationRecordDigest],
  ]
  if (bindingEcho.some(([key, expected]) => normalized[key] !== expected)) fail('REVIEW_RESULT_BINDING_MISMATCH', 'review result does not echo the certified peer binding')
  const inputEcho = [
    ['requestDigest', requestDigest], ['repository', request.packet.repository], ['head', request.packet.head],
    ['tree', request.packet.tree], ['diffDigest', request.packet.diffDigest], ['inventoryDigest', request.packet.inventoryDigest],
    ['rubricDigest', request.packet.rubricDigest], ['briefDigest', request.packet.briefDigest], ['artifactsDigest', request.packet.artifactsDigest],
    ['worktreeFingerprintBefore', request.packet.worktreeFingerprintBefore],
  ]
  if (inputEcho.some(([key, expected]) => normalized[key] !== expected)) fail('REVIEW_RESULT_INPUT_MISMATCH', 'review result does not echo the frozen review input')
  if (normalized.mutationDetected !== false || normalized.worktreeFingerprintAfter !== normalized.worktreeFingerprintBefore) {
    fail('REVIEW_RESULT_MUTATION', 'review result reports or proves worktree mutation')
  }
  if (normalized.roleBoundaryConfirmed !== true) fail('REVIEW_RESULT_ROLE_BOUNDARY', 'review result did not confirm the read-only role boundary')
  if (normalized.outcome === 'REVIEW-BLOCKED') {
    nonEmptyString(normalized.blockReasonCode, 'REVIEW_RESULT_INVALID', 'review result blockReasonCode')
    if (!['complete', 'incomplete'].includes(normalized.scopeCoverage)) fail('REVIEW_RESULT_INVALID', 'blocked review result scopeCoverage is invalid')
  } else {
    if (normalized.blockReasonCode !== null) fail('REVIEW_RESULT_INVALID', 'non-blocked review result must have a null blockReasonCode')
    if (normalized.scopeCoverage !== 'complete'
      || JSON.stringify(normalized.coveredPaths) !== JSON.stringify(expectedPaths)
      || JSON.stringify(normalized.coveredRubricIds) !== JSON.stringify(expectedRubricIds)
      || JSON.stringify(normalized.coveredArtifactIds) !== JSON.stringify(expectedArtifactIds)) {
      fail('REVIEW_RESULT_INCOMPLETE', 'review result does not prove complete declared-scope coverage')
    }
  }
  if (normalized.evidenceClass !== 'certified-independent-review') fail('REVIEW_RESULT_INVALID', 'review result evidenceClass is invalid')
  return normalized
}

export async function launchIndependentReview({
  projection,
  request,
  resolver,
  mode,
  dispatch = null,
  clock = () => new Date(),
} = {}) {
  let transportInvoked = false
  let requestDigest = null
  try {
    if (!MODES.has(mode)) fail('REVIEW_MODE_INVALID', `review launcher mode is invalid:${mode ?? '<missing>'}`)
    if (typeof resolver !== 'function') fail('REVIEW_RESOLVER_UNAVAILABLE', 'exact review resolver is unavailable')
    if (typeof clock !== 'function') fail('REVIEW_TIME_INVALID', 'trusted review clock is unavailable')
    if (mode === 'plan-only' && dispatch !== null) fail('REVIEW_PLAN_DISPATCHER_FORBIDDEN', 'plan-only review may not receive a dispatcher')
    if (mode === 'dispatch' && dispatch !== null) {
      fail('REVIEW_UNTRUSTED_DISPATCHER_FORBIDDEN', 'local callback dispatch cannot attest a peer provider, model release, or isolated context')
    }
    const normalizedRequest = normalizeRequest(request)
    if (normalizedRequest.mode !== mode) fail('REVIEW_MODE_MISMATCH', `review request mode ${normalizedRequest.mode} does not match launcher mode ${mode}`)
    requestDigest = digestDomain('independent-review-request-v1', normalizedRequest)
    const now = clock()
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('REVIEW_TIME_INVALID', 'trusted review clock returned an invalid Date')
    const resolved = resolver({
      projection,
      selfProviderId: normalizedRequest.currentProviderId,
      authorProviderId: normalizedRequest.authorProviderId,
      runtimeKind: normalizedRequest.runtimeKind,
      surface: normalizedRequest.surface,
      repositoryRole: normalizedRequest.repositoryRole,
      target: normalizedRequest.target,
      now: new Date(now.getTime()),
    })
    const binding = normalizeBinding(resolved)
    if (mode === 'plan-only') {
      return {
        schemaVersion: 1,
        kind: 'provider-neutral-independent-review-plan',
        status: 'PLAN-ONLY',
        mode,
        requestDigest,
        binding,
        packet: normalizedRequest.packet,
        transportInvoked: false,
      }
    }
    if (binding.selectionStatus !== 'selected') {
      return blocked(Object.assign(
        new Error('a certified independent review capability has not been selected and frozen'),
        { code: binding.selectionReasonCode },
      ), { mode, transportInvoked: false, requestDigest })
    }
    return blocked(Object.assign(
      new Error('dispatch requires a result carrier from the canonical content-addressed review exchange; local callback dispatch is forbidden'),
      { code: 'REVIEW_PORTABLE_EXCHANGE_CARRIER_REQUIRED' },
    ), { mode, transportInvoked: false, requestDigest })
  } catch (error) {
    return blocked(error, { mode: MODES.has(mode) ? mode : null, transportInvoked, requestDigest })
  }
}

async function main() {
  const scriptDirectory = dirname(realpathSync(fileURLToPath(import.meta.url)))
  let projectRoot
  try {
    if (basename(scriptDirectory) !== 'bin' || basename(dirname(scriptDirectory)) !== 'governance') {
      fail('REVIEW_LAUNCHER_LAYOUT_INVALID', 'review launcher must execute from governance/bin')
    }
    projectRoot = resolve(scriptDirectory, '../..')
    if (resolve(projectRoot, 'governance/bin') !== scriptDirectory) {
      fail('REVIEW_LAUNCHER_LAYOUT_INVALID', 'review launcher directory does not bind one product root')
    }
  } catch {
    process.stdout.write(`${JSON.stringify(blocked(Object.assign(new Error('project root is unavailable'), { code: 'REVIEW_PROJECT_ROOT_UNAVAILABLE' })))}\n`)
    process.exitCode = 2
    return
  }
  const forkRoot = resolve(projectRoot, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  let projection
  let resolver
  let request
  try {
    projection = JSON.parse(readFileSync(resolve(forkRoot, 'manifest.json'), 'utf8')).independentReview
    const module = await import(pathToFileURL(resolve(forkRoot, 'review/provider-review-binding.mjs')).href)
    resolver = module.resolveProjectedReviewRequest
    let body = ''
    for await (const chunk of process.stdin) body += chunk
    request = JSON.parse(body || '{}')
  } catch (error) {
    process.stdout.write(`${JSON.stringify(blocked(Object.assign(error, { code: 'REVIEW_PROJECTION_UNAVAILABLE' })))}\n`)
    process.exitCode = 2
    return
  }
  const result = await launchIndependentReview({ projection, request, resolver, mode: 'plan-only' })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status === 'REVIEW-BLOCKED') process.exitCode = 2
}

const IS_MAIN = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (IS_MAIN) await main()

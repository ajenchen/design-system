import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  allHarnessReceiptDigest,
  validateAllHarnessReceipt,
  validateAllHarnessReceiptEvidence,
} from '../../infra/governance/lib/harness-runner.mjs'
import {
  captureDeepAuditSnapshot,
  sha256,
  stableStringify,
} from './deep-audit-evidence-contract.mjs'
import {
  validateGenuineCrossProviderReviewReceipt,
} from '../../packages/governance/src/provider-review-binding.mjs'
import {
  buildBrokerNoSampleReviewGraph,
  validateBrokerNoSampleReviewGraph,
  validateBrokerShardCarrierMetadata,
} from './model-evidence-broker.mjs'
import {
  assertSafeExistingPath,
  ensureRuntimeEvidenceDirectory,
  isContained,
  resolveRepositoryRoot,
  resolveRuntimeEvidencePath,
  safeRelativePath,
} from './governance-runtime-evidence.mjs'

const SHA256 = /^[a-f0-9]{64}$/
const GIT_OID = /^[a-f0-9]{40,64}$/
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const TOKEN = /^[a-z][a-z0-9-]*$/

function fail(message) {
  throw new Error(`deep-audit review archive blocked:${message}`)
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'))
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort(compareUtf8)
  const expected = [...keys].sort(compareUtf8)
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has an invalid or open shape`)
  }
}

function canonicalBytes(value) {
  return Buffer.from(`${stableStringify(value, 2)}\n`)
}

function asBytes(value, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value)
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') return Buffer.from(value)
  fail(`${label} bytes are invalid`)
}

function canonicalJson(bytes, label) {
  let value
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    fail(`${label} is invalid JSON:${error.message}`)
  }
  if (!canonicalBytes(value).equals(bytes)) fail(`${label} is not canonical JSON`)
  return value
}

function digest(value, label) {
  if (!SHA256.test(value ?? '')) fail(`${label} must be a SHA-256 digest`)
  return value
}

function gitOid(value, label) {
  if (!GIT_OID.test(value ?? '')) fail(`${label} must be a Git object ID`)
  return value
}

function count(value, label, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`)
  return value
}

function portableArtifactPath(value, label = 'artifact path') {
  const path = safeRelativePath(value, label)
  if (path.startsWith('.') || path.split('/').some(segment => segment.startsWith('.'))) {
    fail(`${label} contains a reserved hidden segment`)
  }
  return path
}

function safeJoin(root, relativePath, label) {
  const target = resolve(root, portableArtifactPath(relativePath, label))
  if (!isContained(root, target, { allowRoot: false })) fail(`${label} escapes its content-addressed root`)
  return target
}

function directoryIdentity(path, label) {
  const info = lstatSync(path, { bigint: true })
  if (!info.isDirectory() || info.isSymbolicLink() || info.nlink < 1n) {
    fail(`${label} must be a real directory`)
  }
  return info
}

function fileIdentity(path, label) {
  const info = lstatSync(path, { bigint: true })
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) {
    fail(`${label} must be one regular no-link file`)
  }
  return info
}

function fsyncDirectory(path) {
  let descriptor
  try {
    descriptor = openSync(path, 'r')
    fsyncSync(descriptor)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function fsyncDirectoryTree(root) {
  const { directories } = scanDirectory(root)
  for (const path of [...directories].sort((left, right) => {
    const depth = right.split('/').length - left.split('/').length
    return depth || compareUtf8(left, right)
  })) {
    fsyncDirectory(safeJoin(root, path, 'staged directory durability path'))
  }
  fsyncDirectory(root)
}

function writeExclusive(path, bytes, label) {
  let descriptor
  try {
    descriptor = openSync(path, 'wx', 0o600)
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor)
    fail(`${label} cannot be created exclusively:${error.message}`)
  }
  closeSync(descriptor)
}

function prepareStageFile(stageRoot, relativePath) {
  const file = safeJoin(stageRoot, relativePath, 'staged evidence path')
  const parent = dirname(file)
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  assertSafeExistingPath(stageRoot, parent, 'staged evidence parent', { targetKind: 'directory' })
  directoryIdentity(parent, 'staged evidence parent')
  return file
}

function scanDirectory(root) {
  directoryIdentity(root, 'content-addressed evidence root')
  const files = []
  const directories = []
  const visit = (absolute, prefix) => {
    const names = readdirSync(absolute).sort(compareUtf8)
    for (const name of names) {
      const path = prefix ? `${prefix}/${name}` : name
      portableArtifactPath(path, 'content-addressed evidence entry')
      const child = resolve(absolute, name)
      if (!isContained(root, child, { allowRoot: false })) fail('content-addressed evidence entry escapes its root')
      const info = lstatSync(child, { bigint: true })
      if (info.isSymbolicLink()) fail(`content-addressed evidence contains a symbolic link:${path}`)
      if (info.isDirectory()) {
        directories.push(path)
        visit(child, path)
      } else if (info.isFile() && info.nlink === 1n) {
        files.push(path)
      } else {
        fail(`content-addressed evidence contains an unsupported or hard-linked entry:${path}`)
      }
    }
  }
  visit(root, '')
  return { files, directories }
}

function expectedDirectories(files) {
  const result = new Set()
  for (const file of files) {
    const segments = file.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      result.add(segments.slice(0, index).join('/'))
    }
  }
  return [...result].sort(compareUtf8)
}

function assertExactTopology(root, expectedFiles, label) {
  const expected = [...expectedFiles].sort(compareUtf8)
  if (new Set(expected).size !== expected.length) fail(`${label} expected files are duplicated`)
  const observed = scanDirectory(root)
  if (stableStringify(observed.files) !== stableStringify(expected)
    || stableStringify(observed.directories) !== stableStringify(expectedDirectories(expected))) {
    fail(`${label} contains a missing, extra, or reordered entry`)
  }
}

function createStage(base, prefix) {
  const stage = resolve(base, `.${prefix}.stage-${randomUUID()}`)
  if (!isContained(base, stage, { allowRoot: false })) fail('staging directory escapes its evidence parent')
  mkdirSync(stage, { mode: 0o700 })
  directoryIdentity(stage, 'staging directory')
  fsyncDirectory(base)
  return stage
}

function publishDirectory({ base, stage, target, readback, label }) {
  readback(stage)
  fsyncDirectoryTree(stage)
  fsyncDirectory(base)
  try {
    renameSync(stage, target)
  } catch (error) {
    if (existsSync(target)) {
      readback(target)
      return { reused: true }
    }
    fail(`${label} cannot be atomically published:${error.message}`)
  }
  fsyncDirectoryTree(target)
  fsyncDirectory(base)
  readback(target)
  return { reused: false }
}

function cleanupStage(stage) {
  if (!stage || !existsSync(stage)) return
  const info = lstatSync(stage)
  if (info.isSymbolicLink() || !info.isDirectory()) fail('staging cleanup target is unsafe')
  rmSync(stage, { recursive: true })
}

function normalizeBundleIdentity(identity) {
  exactKeys(identity, [
    'runId', 'manifestSha256', 'head', 'tree', 'indexDigest', 'worktreeFingerprint',
    'inventoryDigest', 'rubricDigest', 'providerIdentityDigest',
  ], 'review bundle frozen identity')
  if (!RUN_ID.test(identity.runId ?? '')) fail('review bundle run ID is invalid')
  digest(identity.manifestSha256, 'review bundle manifest')
  gitOid(identity.head, 'review bundle HEAD')
  gitOid(identity.tree, 'review bundle tree')
  for (const key of ['indexDigest', 'worktreeFingerprint', 'inventoryDigest', 'rubricDigest', 'providerIdentityDigest']) {
    digest(identity[key], `review bundle ${key}`)
  }
  return structuredClone(identity)
}

function normalizeReviewClosure(review) {
  exactKeys(review, [
    'selectionStatus', 'completeReviewScheduleDigest', 'coverageCompletenessDigest',
    'taskCount', 'reviewWorkUnitCount', 'synthesisUnitCount', 'sampling',
  ], 'review bundle closure')
  if (!['selected', 'REVIEW-BLOCKED'].includes(review.selectionStatus)) {
    fail('review bundle selection status is invalid')
  }
  digest(review.completeReviewScheduleDigest, 'review bundle complete schedule')
  digest(review.coverageCompletenessDigest, 'review bundle coverage completeness')
  count(review.taskCount, 'review bundle task count', { minimum: 1 })
  count(review.reviewWorkUnitCount, 'review bundle review-work count', { minimum: 1 })
  count(review.synthesisUnitCount, 'review bundle synthesis count', { minimum: 1 })
  if (review.sampling !== false) fail('review bundle must preserve no-sample closure')
  return structuredClone(review)
}

function normalizeArtifactRecords(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) fail('review bundle artifacts must be non-empty')
  const records = artifacts.map((artifact, index) => {
    exactKeys(artifact, ['path', 'role', 'mediaType', 'bytes'], `review bundle artifact ${index}`)
    const path = portableArtifactPath(artifact.path, `review bundle artifact ${index} path`)
    if (!TOKEN.test(artifact.role ?? '')) fail(`review bundle artifact ${index} role is invalid`)
    if (!['application/json', 'application/octet-stream', 'text/plain'].includes(artifact.mediaType)) {
      fail(`review bundle artifact ${index} media type is invalid`)
    }
    const bytes = asBytes(artifact.bytes, `review bundle artifact ${index}`)
    return { path, role: artifact.role, mediaType: artifact.mediaType, bytes }
  }).sort((left, right) => compareUtf8(left.path, right.path))
  if (new Set(records.map(record => record.path)).size !== records.length) fail('review bundle artifact paths are duplicated')
  return records
}

function manifestSummaryIdentity(run, label) {
  if (run === null) return null
  if (!run || typeof run !== 'object' || Array.isArray(run)) fail(`${label} must be a run object`)
  const manifest = run.manifest
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || !RUN_ID.test(manifest.runId ?? '') || !Array.isArray(manifest.inventory)) {
    fail(`${label} manifest is invalid`)
  }
  digest(run.manifestSha256, `${label} manifest`)
  return {
    runId: manifest.runId,
    manifestSha256: run.manifestSha256,
    head: gitOid(manifest.head, `${label} HEAD`),
    tree: gitOid(manifest.tree, `${label} tree`),
    indexDigest: digest(manifest.indexDigest, `${label} index`),
    inventoryDigest: digest(manifest.inventoryDigest, `${label} inventory`),
    worktreeFingerprint: digest(manifest.worktreeFingerprint, `${label} worktree`),
  }
}

export function buildDeepAuditSourceChangeSummary({
  baselineRun = null,
  currentRun,
} = {}) {
  const baseline = manifestSummaryIdentity(baselineRun, 'source-change baseline')
  const current = manifestSummaryIdentity(currentRun, 'source-change current')
  if (current === null) fail('source-change current run is required')
  const baselineRows = new Map((baselineRun?.manifest.inventory ?? []).map(row => [row.path, row]))
  const currentRows = new Map(currentRun.manifest.inventory.map(row => [row.path, row]))
  if (baselineRows.size !== (baselineRun?.manifest.inventory.length ?? 0)
    || currentRows.size !== currentRun.manifest.inventory.length) {
    fail('source-change inventories contain duplicate paths')
  }
  const paths = [...new Set([...baselineRows.keys(), ...currentRows.keys()])].sort(compareUtf8)
  const changes = paths.flatMap(path => {
    const before = baselineRows.get(path) ?? null
    const after = currentRows.get(path) ?? null
    if (before !== null && after !== null && stableStringify(before) === stableStringify(after)) return []
    return [{
      path: safeRelativePath(path, 'source-change path'),
      change: before === null ? 'added' : after === null ? 'removed' : 'modified',
      before,
      after,
    }]
  })
  return {
    schemaVersion: 1,
    kind: 'deep-audit-source-change-summary',
    baseline,
    current,
    changeCount: changes.length,
    changes,
  }
}

export function buildFocusedValidationRecordSet(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    fail('focused validation records must be a non-empty array')
  }
  const normalized = records.map((record, index) => {
    exactKeys(record, ['id', 'argv', 'exitCode', 'status', 'evidenceSha256'], `focused validation record ${index}`)
    if (!TOKEN.test(record.id ?? '') || !Array.isArray(record.argv) || record.argv.length === 0
      || record.argv.some(argument => typeof argument !== 'string' || !argument || /[\0\n\r]/.test(argument))
      || record.exitCode !== 0 || record.status !== 'passed') {
      fail(`focused validation record ${index} is not a canonical passing result`)
    }
    digest(record.evidenceSha256, `focused validation record ${index} evidence`)
    return structuredClone(record)
  }).sort((left, right) => compareUtf8(left.id, right.id))
  if (new Set(normalized.map(record => record.id)).size !== normalized.length) {
    fail('focused validation record IDs are duplicated')
  }
  return {
    schemaVersion: 1,
    kind: 'deep-audit-focused-validation-record-set',
    status: 'passed',
    recordCount: normalized.length,
    records: normalized,
    recordsDigest: sha256(stableStringify(normalized)),
  }
}

function buildArtifactSet(artifacts) {
  const records = normalizeArtifactRecords(artifacts)
  const artifactsIndex = records.map(record => ({
    path: `artifacts/${record.path}`,
    role: record.role,
    mediaType: record.mediaType,
    bytes: record.bytes.length,
    sha256: sha256(record.bytes),
  }))
  const value = {
    schemaVersion: 1,
    kind: 'provider-neutral-review-artifact-set',
    algorithm: 'sha256',
    artifactCount: artifactsIndex.length,
    totalBytes: artifactsIndex.reduce((sum, record) => sum + record.bytes, 0),
    artifacts: artifactsIndex,
  }
  const bytes = canonicalBytes(value)
  return { records, value, bytes, sha256: sha256(bytes) }
}

function roleDigest(artifactSet, role) {
  const matches = artifactSet.value.artifacts.filter(record => record.role === role)
  if (matches.length !== 1) fail(`review bundle requires exactly one ${role} artifact`)
  return matches[0].sha256
}

function roleRecord(artifactSet, role) {
  const matches = artifactSet.value.artifacts.filter(record => record.role === role)
  if (matches.length !== 1) fail(`review bundle requires exactly one ${role} artifact`)
  return matches[0]
}

function summaryIdentity(value, label) {
  if (value === null) return null
  exactKeys(value, [
    'runId', 'manifestSha256', 'head', 'tree', 'indexDigest',
    'inventoryDigest', 'worktreeFingerprint',
  ], label)
  if (!RUN_ID.test(value.runId ?? '')) fail(`${label} run ID is invalid`)
  digest(value.manifestSha256, `${label} manifest`)
  gitOid(value.head, `${label} HEAD`)
  gitOid(value.tree, `${label} tree`)
  for (const key of ['indexDigest', 'inventoryDigest', 'worktreeFingerprint']) {
    digest(value[key], `${label} ${key}`)
  }
  return structuredClone(value)
}

function validateSourceChangeSummary(value, identity) {
  exactKeys(value, [
    'schemaVersion', 'kind', 'baseline', 'current', 'changeCount', 'changes',
  ], 'source-change summary')
  if (value.schemaVersion !== 1 || value.kind !== 'deep-audit-source-change-summary') {
    fail('source-change summary identity/version is invalid')
  }
  summaryIdentity(value.baseline, 'source-change baseline')
  const current = summaryIdentity(value.current, 'source-change current')
  const expectedCurrent = {
    runId: identity.runId,
    manifestSha256: identity.manifestSha256,
    head: identity.head,
    tree: identity.tree,
    indexDigest: identity.indexDigest,
    inventoryDigest: identity.inventoryDigest,
    worktreeFingerprint: identity.worktreeFingerprint,
  }
  if (stableStringify(current) !== stableStringify(expectedCurrent)) {
    fail('source-change summary targets another frozen review candidate')
  }
  if (!Array.isArray(value.changes) || value.changeCount !== value.changes.length) {
    fail('source-change summary count is invalid')
  }
  const paths = []
  for (const [index, change] of value.changes.entries()) {
    exactKeys(change, ['path', 'change', 'before', 'after'], `source-change record ${index}`)
    const path = safeRelativePath(change.path, `source-change record ${index} path`)
    if (!['added', 'modified', 'removed'].includes(change.change)
      || (change.before !== null && (typeof change.before !== 'object' || Array.isArray(change.before)))
      || (change.after !== null && (typeof change.after !== 'object' || Array.isArray(change.after)))
      || (change.change === 'added' && (change.before !== null || change.after === null))
      || (change.change === 'removed' && (change.before === null || change.after !== null))
      || (change.change === 'modified' && (change.before === null || change.after === null))) {
      fail(`source-change record ${index} is invalid`)
    }
    paths.push(path)
  }
  if (new Set(paths).size !== paths.length
    || stableStringify(paths) !== stableStringify([...paths].sort(compareUtf8))) {
    fail('source-change records are duplicate or reordered')
  }
  return true
}

function validateFocusedValidationRecordSet(value) {
  exactKeys(value, [
    'schemaVersion', 'kind', 'status', 'recordCount', 'records', 'recordsDigest',
  ], 'focused validation record set')
  if (value.schemaVersion !== 1 || value.kind !== 'deep-audit-focused-validation-record-set'
    || value.status !== 'passed' || !Array.isArray(value.records)
    || value.recordCount !== value.records.length || value.recordCount < 1
    || value.recordsDigest !== sha256(stableStringify(value.records))) {
    fail('focused validation record set identity/content is invalid')
  }
  if (stableStringify(buildFocusedValidationRecordSet(value.records)) !== stableStringify(value)) {
    fail('focused validation record set is stale, incomplete, or reordered')
  }
  return true
}

function parseBoundJsonArtifact(artifactSet, artifactBytesByPath, role, label) {
  const record = roleRecord(artifactSet, role)
  const bytes = artifactBytesByPath.get(record.path)
  if (!bytes || record.mediaType !== 'application/json') {
    fail(`${label} artifact is absent or has the wrong media type`)
  }
  return canonicalJson(bytes, label)
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    fail(`${label} is invalid JSON:${error.message}`)
  }
}

function artifactForRole(artifactSet, artifactBytesByPath, role, expectedPath, {
  canonical = true,
} = {}) {
  const record = roleRecord(artifactSet, role)
  if (record.path !== `artifacts/${expectedPath}` || record.mediaType !== 'application/json') {
    fail(`${role} artifact path/media type is invalid`)
  }
  const bytes = artifactBytesByPath.get(record.path)
  if (!bytes) fail(`${role} artifact bytes are absent`)
  return canonical ? canonicalJson(bytes, role) : parseJsonBytes(bytes, role)
}

function canonicalObjectDigest(value, digestKey, label) {
  digest(value?.[digestKey], `${label} ${digestKey}`)
  const projection = structuredClone(value)
  delete projection[digestKey]
  if (value[digestKey] !== sha256(stableStringify(projection))) {
    fail(`${label} content digest is invalid`)
  }
}

function canonicalRowsDigest(rows) {
  const hash = createHash('sha256')
  for (const row of rows) hash.update(stableStringify(row)).update('\n')
  return hash.digest('hex')
}

function frozenRunIdentity(value, identity, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} run identity is invalid`)
  for (const key of [
    'runId', 'manifestSha256', 'head', 'tree', 'indexDigest', 'worktreeFingerprint',
    'inventoryDigest', 'rubricDigest', 'providerIdentityDigest',
  ]) {
    if (value[key] !== identity[key]) fail(`${label} targets another frozen run:${key}`)
  }
  for (const key of ['brokerPlanDigest', 'modelEvidencePlanDigest', 'resultSchemaSha256']) {
    digest(value[key], `${label} ${key}`)
  }
  return true
}

function taskKeyFromDescriptor(descriptor) {
  const identity = descriptor?.identity
  if (!['judgment', 'component-a1b'].includes(identity?.taskKind)
    || (identity.taskKind === 'judgment' && !Number.isSafeInteger(identity.subject))
    || (identity.taskKind === 'component-a1b'
      && (typeof identity.subject !== 'string' || !identity.subject))) {
    fail('review task descriptor task identity is invalid')
  }
  return `${identity.taskKind}:${String(identity.subject)}`
}

function validateArchivedReviewGraphInternalClosure({
  reviewGraph,
  taskSet,
  taskDescriptors,
  brokerPlan,
  brokerPlanDigest,
  resultSchemaSha256,
}) {
  const planState = {
    plan: brokerPlan,
    planDigest: brokerPlanDigest,
    resultSchemaSha256,
  }
  const options = {
    taskSet,
    taskDescriptors,
    planState,
  }
  const expected = buildBrokerNoSampleReviewGraph(options)
  validateBrokerNoSampleReviewGraph(reviewGraph, options)
  if (stableStringify(reviewGraph) !== stableStringify(expected)) {
    fail('review graph differs from the canonical broker graph rebuilt from archived SSOT')
  }
  return true
}

function requiredReviewArtifactRoles(artifactSet) {
  const fixed = new Map([
    ['run-manifest', 'run/run-manifest.json'],
    ['model-evidence-plan', 'authority/model-evidence-plan.json'],
    ['model-evidence-broker-plan', 'authority/model-evidence-broker.json'],
    ['model-result-schema', 'authority/model-broker-shard-result.schema.json'],
    ['review-selection', 'review/review-selection.json'],
    ['exchange-state', 'review/exchange-state.json'],
    ['exchange-schedule', 'review/exchange-schedule.json'],
    ['task-set', 'review/task-set.json'],
    ['task-descriptors', 'review/task-descriptors.json'],
    ['carrier-metadata', 'review/carrier-metadata.json'],
    ['content-set', 'review/content-set.json'],
    ['review-graph', 'review/review-graph.json'],
    ['coverage-proof', 'review/coverage-proof.json'],
    ['source-change-summary', 'closure/source-change-summary.json'],
    ['focused-validation', 'closure/focused-validation.json'],
  ])
  const counts = new Map()
  for (const record of artifactSet.value.artifacts) {
    counts.set(record.role, (counts.get(record.role) ?? 0) + 1)
    const expectedPath = fixed.get(record.role)
    if (expectedPath !== undefined && record.path !== `artifacts/${expectedPath}`) {
      fail(`review bundle ${record.role} artifact has a non-canonical path`)
    }
    if (expectedPath === undefined && !['cas-leaf', 'cas-blob'].includes(record.role)) {
      fail(`review bundle contains an unexpected artifact role:${record.role}`)
    }
  }
  for (const role of fixed.keys()) {
    if (counts.get(role) !== 1) fail(`review bundle requires exactly one ${role} artifact`)
  }
  if (!Number.isSafeInteger(counts.get('cas-leaf')) || counts.get('cas-leaf') < 1
    || !Number.isSafeInteger(counts.get('cas-blob')) || counts.get('cas-blob') < 1) {
    fail('review bundle requires non-empty exact CAS leaf/blob artifacts')
  }
  return fixed
}

function validateReviewBundleSemanticClosure(artifactSet, artifactBytesByPath, candidate) {
  requiredReviewArtifactRoles(artifactSet)
  const identity = candidate.identity
  const runManifest = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'run-manifest',
    'run/run-manifest.json',
    { canonical: false },
  )
  if (roleRecord(artifactSet, 'run-manifest').sha256 !== identity.manifestSha256) {
    fail('review bundle run manifest bytes differ from the frozen manifest digest')
  }
  for (const key of [
    'runId', 'head', 'tree', 'indexDigest', 'worktreeFingerprint', 'inventoryDigest',
    'rubricDigest', 'providerIdentityDigest',
  ]) {
    if (runManifest?.[key] !== identity[key]) fail(`review bundle run manifest differs from candidate:${key}`)
  }
  if (!Array.isArray(runManifest.inventory) || runManifest.inventory.length < 1
    || sha256(stableStringify(runManifest.inventory)) !== identity.inventoryDigest) {
    fail('review bundle run manifest inventory digest is invalid')
  }
  const inventoryPaths = runManifest.inventory.map(row => row?.path)
  if (inventoryPaths.some(path => typeof path !== 'string' || !path)
    || new Set(inventoryPaths).size !== inventoryPaths.length
    || stableStringify(inventoryPaths) !== stableStringify([...inventoryPaths].sort(compareUtf8))) {
    fail('review bundle run manifest inventory is duplicate or reordered')
  }
  const inventoryByPath = new Map(runManifest.inventory.map(row => [row.path, row]))
  if (!Array.isArray(runManifest.components) || runManifest.components.length !== 64) {
    fail('review bundle run manifest does not contain the complete 64-component scope')
  }

  const modelPlanRecord = roleRecord(artifactSet, 'model-evidence-plan')
  const modelPlan = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'model-evidence-plan',
    'authority/model-evidence-plan.json',
    { canonical: false },
  )
  const brokerPlanRecord = roleRecord(artifactSet, 'model-evidence-broker-plan')
  const brokerPlan = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'model-evidence-broker-plan',
    'authority/model-evidence-broker.json',
    { canonical: false },
  )
  const resultSchemaRecord = roleRecord(artifactSet, 'model-result-schema')
  artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'model-result-schema',
    'authority/model-broker-shard-result.schema.json',
    { canonical: false },
  )
  for (const [path, record] of [
    ['infra/governance/model-evidence-plan.json', modelPlanRecord],
    ['infra/governance/model-evidence-broker.json', brokerPlanRecord],
    ['infra/governance/schemas/model-broker-shard-result.schema.json', resultSchemaRecord],
  ]) {
    const row = inventoryByPath.get(path)
    if (row?.kind !== 'file' || row.sha256 !== record.sha256 || row.bytes !== record.bytes) {
      fail(`review bundle authority artifact differs from frozen inventory:${path}`)
    }
  }
  if (!Array.isArray(modelPlan?.judgment?.dimensions)
    || modelPlan.judgment.dimensions.length !== 26
    || new Set(modelPlan.judgment.dimensions.map(row => row?.dim)).size !== 26) {
    fail('review bundle model plan does not contain the complete 26-judgment scope')
  }
  const expectedTaskKeys = [
    ...modelPlan.judgment.dimensions.map(row => `judgment:${String(row.dim)}`),
    ...runManifest.components.map(component => `component-a1b:${String(component?.name)}`),
  ]
  if (expectedTaskKeys.length !== 90 || new Set(expectedTaskKeys).size !== 90) {
    fail('review bundle expected 90-task scope is duplicate or incomplete')
  }

  const selection = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'review-selection',
    'review/review-selection.json',
  )
  if (stableStringify(selection) !== stableStringify(runManifest.reviewSelection)) {
    fail('review selection artifact differs from the frozen run manifest')
  }
  const exchangeState = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'exchange-state',
    'review/exchange-state.json',
  )
  const exchangeSchedule = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'exchange-schedule',
    'review/exchange-schedule.json',
  )
  if (stableStringify(exchangeSchedule) !== stableStringify(exchangeState.exchangeSchedule)
    || exchangeState.selectionStatus !== candidate.review.selectionStatus
    || exchangeState.completeReviewScheduleDigest !== candidate.review.completeReviewScheduleDigest
    || exchangeState.coverageCompletenessDigest !== candidate.review.coverageCompletenessDigest
    || exchangeState.noNetworkCapability !== true
    || exchangeState.noCredentialCapability !== true
    || exchangeState.noRepositoryMutationCapability !== true) {
    fail('review exchange state is detached from candidate closure')
  }

  const taskSet = artifactForRole(artifactSet, artifactBytesByPath, 'task-set', 'review/task-set.json')
  const taskDescriptors = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'task-descriptors',
    'review/task-descriptors.json',
  )
  if (!Array.isArray(taskDescriptors) || taskDescriptors.length !== 90
    || taskSet.scopeKind !== 'registered-full-review'
    || taskSet.expectedTaskCount !== 90
    || stableStringify(taskSet.expectedTaskKeys) !== stableStringify(expectedTaskKeys)
    || stableStringify(taskSet.taskDescriptorDigests)
      !== stableStringify(taskDescriptors.map(descriptor => descriptor?.descriptorDigest))) {
    fail('review bundle task set is not the exact registered 26+64 task closure')
  }
  canonicalObjectDigest(taskSet, 'taskSetDigest', 'review task set')
  frozenRunIdentity(taskSet.runIdentity, identity, 'review task set')
  if (taskSet.runIdentity.modelEvidencePlanDigest !== modelPlanRecord.sha256
    || taskSet.runIdentity.brokerPlanDigest !== brokerPlanRecord.sha256
    || taskSet.runIdentity.resultSchemaSha256 !== resultSchemaRecord.sha256) {
    fail('review task set is detached from archived broker/model/schema authority')
  }

  const descriptorChunkRefs = new Map()
  const expectedShardRows = []
  const descriptorTaskKeys = []
  for (const [descriptorIndex, descriptor] of taskDescriptors.entries()) {
    canonicalObjectDigest(descriptor, 'descriptorDigest', `review task descriptor ${descriptorIndex}`)
    frozenRunIdentity(descriptor.identity, identity, `review task descriptor ${descriptorIndex}`)
    if (descriptor.identity.modelEvidencePlanDigest !== modelPlanRecord.sha256
      || descriptor.identity.brokerPlanDigest !== brokerPlanRecord.sha256
      || descriptor.identity.resultSchemaSha256 !== resultSchemaRecord.sha256
      || descriptor.shardCount !== descriptor.shards?.length || descriptor.shardCount < 1) {
      fail(`review task descriptor ${descriptorIndex} authority/count binding is invalid`)
    }
    const taskKey = taskKeyFromDescriptor(descriptor)
    descriptorTaskKeys.push(taskKey)
    for (const [ordinal, shard] of descriptor.shards.entries()) {
      if (shard?.ordinal !== ordinal || !SHA256.test(shard.shardId ?? '')
        || !SHA256.test(shard.batchDigest ?? '') || !Array.isArray(shard.chunkRefs)
        || shard.chunkRefs.length < 1) {
        fail(`review task descriptor shard reference is invalid:${taskKey}:${ordinal}`)
      }
      expectedShardRows.push({ taskKey, ordinal, descriptor, shard })
      for (const reference of shard.chunkRefs) {
        if (!SHA256.test(reference?.chunkId ?? '') || !SHA256.test(reference?.contentSha256 ?? '')
          || !Number.isSafeInteger(reference.bytes) || reference.bytes < 0) {
          fail(`review task descriptor chunk reference is invalid:${taskKey}:${ordinal}`)
        }
        const previous = descriptorChunkRefs.get(reference.chunkId)
        if (previous && stableStringify(previous) !== stableStringify(reference)) {
          fail(`review task descriptors substitute a CAS leaf:${reference.chunkId}`)
        }
        if (!previous) descriptorChunkRefs.set(reference.chunkId, structuredClone(reference))
      }
    }
  }
  if (stableStringify(descriptorTaskKeys) !== stableStringify(expectedTaskKeys)) {
    fail('review task descriptors are missing, duplicate, or reordered')
  }

  const carrierMetadata = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'carrier-metadata',
    'review/carrier-metadata.json',
  )
  if (!Array.isArray(carrierMetadata) || carrierMetadata.length !== expectedShardRows.length) {
    fail('review carrier metadata does not exactly cover every shard')
  }
  const uniqueBlobRefs = new Map()
  const blobUseRows = []
  for (const [index, expected] of expectedShardRows.entries()) {
    const metadata = carrierMetadata[index]
    try {
      validateBrokerShardCarrierMetadata(metadata)
    } catch (error) {
      fail(`review carrier metadata ${index} is invalid:${error.message}`)
    }
    const expectedBlobRefs = [...new Map(expected.shard.chunkRefs.map(reference => [
      reference.contentSha256,
      { sha256: reference.contentSha256, bytes: reference.bytes, encoding: 'base64' },
    ])).values()].sort((left, right) => compareUtf8(left.sha256, right.sha256))
    if (metadata.taskKey !== expected.taskKey || metadata.ordinal !== expected.ordinal
      || metadata.shardId !== expected.shard.shardId
      || metadata.batchDigest !== expected.shard.batchDigest
      || stableStringify(metadata.blobRefs) !== stableStringify(expectedBlobRefs)) {
      fail(`review carrier metadata substitutes or reorders shard coverage:${index}`)
    }
    for (const reference of expectedBlobRefs) {
      const previous = uniqueBlobRefs.get(reference.sha256)
      if (previous && stableStringify(previous) !== stableStringify(reference)) {
        fail(`review carrier metadata substitutes a blob reference:${reference.sha256}`)
      }
      if (!previous) uniqueBlobRefs.set(reference.sha256, reference)
      blobUseRows.push({
        taskKey: metadata.taskKey,
        ordinal: metadata.ordinal,
        sha256: reference.sha256,
        bytes: reference.bytes,
      })
    }
  }
  const orderedUniqueBlobRefs = [...uniqueBlobRefs.values()]
    .sort((left, right) => compareUtf8(left.sha256, right.sha256))

  const contentSet = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'content-set',
    'review/content-set.json',
  )
  canonicalObjectDigest(contentSet, 'contentSetDigest', 'review content set')
  frozenRunIdentity(contentSet.runIdentity, identity, 'review content set')
  const expectedContentTasks = taskDescriptors.map(descriptor => ({
    taskKey: taskKeyFromDescriptor(descriptor),
    taskDescriptorDigest: descriptor.descriptorDigest,
    shardSetDigest: descriptor.shardSetDigest,
    shardCount: descriptor.shardCount,
  }))
  if (contentSet.taskSetDigest !== taskSet.taskSetDigest || contentSet.taskCount !== 90
    || contentSet.shardCount !== expectedShardRows.length
    || stableStringify(contentSet.tasks) !== stableStringify(expectedContentTasks)
    || contentSet.carrierCount !== carrierMetadata.length
    || contentSet.orderedCarrierSetDigest !== canonicalRowsDigest(carrierMetadata)
    || contentSet.blobUseCount !== blobUseRows.length
    || contentSet.orderedBlobUseDigest !== canonicalRowsDigest(blobUseRows)
    || contentSet.uniqueBlobCount !== orderedUniqueBlobRefs.length
    || contentSet.uniqueBlobSetDigest !== canonicalRowsDigest(orderedUniqueBlobRefs)
    || contentSet.uniqueBlobBytes !== orderedUniqueBlobRefs.reduce((sum, row) => sum + row.bytes, 0)
    || contentSet.storageDeduplicationOnly !== true || contentSet.sampling !== false) {
    fail('review content set is incomplete, duplicated, reordered, or sampled')
  }

  const casLeafRecords = artifactSet.value.artifacts.filter(record => record.role === 'cas-leaf')
  const casBlobRecords = artifactSet.value.artifacts.filter(record => record.role === 'cas-blob')
  const actualLeafIds = []
  const leafBytesById = new Map()
  for (const record of casLeafRecords) {
    const match = record.path.match(/^artifacts\/cas\/leaves\/([a-f0-9]{64})\.json$/)
    if (!match || record.mediaType !== 'application/json') fail('review CAS leaf artifact path/media type is invalid')
    const chunk = canonicalJson(artifactBytesByPath.get(record.path), `review CAS leaf:${match[1]}`)
    const { content, chunkId, ...chunkIdentity } = chunk
    const contentBytes = Buffer.from(content ?? '', 'base64')
    const frozenSource = inventoryByPath.get(chunk.path)
    if (chunkId !== match[1] || chunkId !== sha256(stableStringify(chunkIdentity))
      || chunk.encoding !== 'base64' || contentBytes.toString('base64') !== content
      || contentBytes.length !== chunk.bytes || sha256(contentBytes) !== chunk.contentSha256
      || stableStringify({
        chunkId: chunk.chunkId,
        sourceId: chunk.sourceId,
        path: chunk.path,
        mediaType: chunk.mediaType,
        offset: chunk.offset,
        bytes: chunk.bytes,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        contentSha256: chunk.contentSha256,
      }) !== stableStringify(descriptorChunkRefs.get(chunkId))
      || (chunk.sourceKind !== 'dependency-source'
        && (frozenSource?.kind !== 'file'
          || frozenSource.sha256 !== chunk.fileSha256
          || frozenSource.bytes !== chunk.fileBytes))) {
      fail(`review CAS leaf is stale, unexpected, or substituted:${match[1]}`)
    }
    actualLeafIds.push(chunkId)
    leafBytesById.set(chunkId, chunk.bytes)
  }
  const expectedLeafIds = [...descriptorChunkRefs.keys()].sort(compareUtf8)
  if (stableStringify(actualLeafIds) !== stableStringify(expectedLeafIds)) {
    fail('review CAS leaf set has missing, duplicate, extra, or reordered content')
  }
  const actualBlobDigests = []
  for (const record of casBlobRecords) {
    const match = record.path.match(/^artifacts\/cas\/blobs\/([a-f0-9]{64})\.bin$/)
    if (!match || record.mediaType !== 'application/octet-stream') {
      fail('review CAS blob artifact path/media type is invalid')
    }
    const bytes = artifactBytesByPath.get(record.path)
    const expected = uniqueBlobRefs.get(match[1])
    if (!expected || bytes.length !== expected.bytes || sha256(bytes) !== match[1]) {
      fail(`review CAS blob is stale, unexpected, or substituted:${match[1]}`)
    }
    actualBlobDigests.push(match[1])
  }
  if (stableStringify(actualBlobDigests)
    !== stableStringify(orderedUniqueBlobRefs.map(row => row.sha256))) {
    fail('review CAS blob set has missing, duplicate, extra, or reordered content')
  }

  const reviewGraph = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'review-graph',
    'review/review-graph.json',
  )
  canonicalObjectDigest(reviewGraph, 'reviewGraphDigest', 'review graph')
  frozenRunIdentity(reviewGraph.runIdentity, identity, 'review graph')
  validateArchivedReviewGraphInternalClosure({
    reviewGraph,
    taskSet,
    taskDescriptors,
    brokerPlan,
    brokerPlanDigest: brokerPlanRecord.sha256,
    resultSchemaSha256: resultSchemaRecord.sha256,
  })
  const coverageProof = artifactForRole(
    artifactSet,
    artifactBytesByPath,
    'coverage-proof',
    'review/coverage-proof.json',
  )
  const graphLeafIds = [...new Set(
    (reviewGraph.reviewWorkUnits ?? []).flatMap(unit => unit?.leafIds ?? []),
  )].sort(compareUtf8)
  if (reviewGraph.taskSetDigest !== taskSet.taskSetDigest
    || reviewGraph.taskCount !== 90
    || candidate.review.taskCount !== 90
    || stableStringify(reviewGraph.taskDescriptorDigests)
      !== stableStringify(taskSet.taskDescriptorDigests)
    || reviewGraph.reviewWorkUnitCount !== reviewGraph.reviewWorkUnits?.length
    || reviewGraph.synthesisUnitCount !== reviewGraph.synthesisUnits?.length
    || reviewGraph.reviewWorkUnitCount !== candidate.review.reviewWorkUnitCount
    || reviewGraph.synthesisUnitCount !== candidate.review.synthesisUnitCount
    || reviewGraph.deterministicReductionUnitCount !== reviewGraph.synthesisUnitCount
    || reviewGraph.dispatchTotals?.reviewWorkUnitCount
      !== reviewGraph.reviewWorkUnitCount
    || reviewGraph.dispatchTotals?.providerCallUpperBound
      !== reviewGraph.reviewWorkUnitCount
    || reviewGraph.dispatchTotals?.providerCallAccounting
      !== 'capability-bounded-exchange-schedule'
    || reviewGraph.dispatchTotals?.synthesisProviderCalls !== 0
    || reviewGraph.dispatchTotals?.deterministicReductionUnits
      !== reviewGraph.synthesisUnitCount
    || stableStringify(coverageProof) !== stableStringify(reviewGraph.proof)
    || reviewGraph.proof?.coverageCompletenessDigest !== candidate.review.coverageCompletenessDigest
    || reviewGraph.proof.complete !== true || reviewGraph.proof.sampling !== false
    || reviewGraph.proof.missingCount !== 0 || reviewGraph.proof.unexpectedCount !== 0
    || reviewGraph.proof.duplicateCount !== 0 || reviewGraph.proof.overlapCount !== 0
    || reviewGraph.proof.unknownApplicabilityCount !== 0
    || reviewGraph.structuralOnly !== true
    || reviewGraph.genuineCrossProviderReview !== false
    || reviewGraph.promotionEligible !== false
    || stableStringify(graphLeafIds) !== stableStringify(expectedLeafIds)
    || reviewGraph.uniqueEvidenceLeafCount !== expectedLeafIds.length
    || reviewGraph.uniqueEvidenceLeafSetDigest !== sha256(stableStringify(expectedLeafIds))
    || reviewGraph.uniqueEvidenceLeafBytes
      !== expectedLeafIds.reduce((sum, leafId) => sum + leafBytesById.get(leafId), 0)) {
    fail('review graph does not prove complete, unique, no-sample 90-task/CAS closure')
  }

  if (candidate.review.selectionStatus === 'REVIEW-BLOCKED') {
    if (exchangeSchedule !== null || exchangeState.reviewerProviderId !== null
      || exchangeState.requestModelId !== null
      || selection?.kind !== 'provider-review-capability-selection-blocked'
      || selection?.selectionStatus !== 'REVIEW-BLOCKED'
      || candidate.review.completeReviewScheduleDigest !== reviewGraph.reviewGraphDigest) {
      fail('REVIEW-BLOCKED bundle contains a selected or detached exchange schedule')
    }
  } else {
    if (!exchangeSchedule || selection?.kind !== 'provider-review-capability-selection'
      || !selection.selected || exchangeState.reviewerProviderId !== selection.selected.providerId
      || exchangeState.requestModelId !== selection.selected.requestModelId) {
      fail('selected review bundle lacks its exact capability selection/schedule')
    }
    canonicalObjectDigest(exchangeSchedule, 'exchangeScheduleDigest', 'review exchange schedule')
    const expectedUnitIds = reviewGraph.reviewWorkUnits.map(unit => unit.workUnitId)
    if (exchangeSchedule.exchangeScheduleDigest !== candidate.review.completeReviewScheduleDigest
      || exchangeSchedule.taskSetDigest !== taskSet.taskSetDigest
      || exchangeSchedule.reviewGraphDigest !== reviewGraph.reviewGraphDigest
      || exchangeSchedule.contentSetDigest !== contentSet.contentSetDigest
      || exchangeSchedule.taskCount !== 90
      || exchangeSchedule.reviewWorkRequestCount !== exchangeSchedule.requestCount
      || exchangeSchedule.reviewWorkUnitCount !== reviewGraph.reviewWorkUnitCount
      || exchangeSchedule.providerCallCount !== exchangeSchedule.requestCount
      || exchangeSchedule.synthesisRequestCount !== 0
      || exchangeSchedule.deterministicReductionUnitCount !== reviewGraph.synthesisUnitCount
      || exchangeSchedule.deterministicReductionUnitSetDigest
        !== sha256(stableStringify(
          reviewGraph.synthesisUnits.map(unit => unit.synthesisUnitDigest),
        ))
      || exchangeSchedule.requestCount !== exchangeSchedule.requests?.length
      || stableStringify(
        exchangeSchedule.requests?.flatMap(request => request.memberUnitIds ?? []),
      )
        !== stableStringify(expectedUnitIds)
      || exchangeSchedule.coverageCompletenessDigest !== candidate.review.coverageCompletenessDigest
      || exchangeSchedule.sampling !== false || exchangeSchedule.fullRegisteredReview !== true
      || exchangeSchedule.structuralOnly !== true
      || exchangeSchedule.genuineCrossProviderReview !== false
      || exchangeSchedule.promotionEligible !== false
      || exchangeSchedule.managedEvidence !== false) {
      fail('selected exchange schedule is incomplete, reordered, sampled, or detached')
    }
  }
  return true
}

function buildCandidate({ identity, review, artifactSet }) {
  const value = {
    schemaVersion: 1,
    kind: 'provider-neutral-frozen-review-candidate',
    identity: normalizeBundleIdentity(identity),
    review: normalizeReviewClosure(review),
    artifactSet: {
      algorithm: 'sha256',
      artifactSetSha256: artifactSet.sha256,
      artifactCount: artifactSet.value.artifactCount,
      totalBytes: artifactSet.value.totalBytes,
    },
    sourceChangeSummarySha256: roleDigest(artifactSet, 'source-change-summary'),
    focusedValidationSha256: roleDigest(artifactSet, 'focused-validation'),
  }
  const bytes = canonicalBytes(value)
  return { value, bytes, sha256: sha256(bytes) }
}

function validateArtifactSet(value, bytes) {
  exactKeys(value, ['schemaVersion', 'kind', 'algorithm', 'artifactCount', 'totalBytes', 'artifacts'], 'review artifact set')
  if (value.schemaVersion !== 1 || value.kind !== 'provider-neutral-review-artifact-set' || value.algorithm !== 'sha256') {
    fail('review artifact set identity/version is invalid')
  }
  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0) fail('review artifact set is empty')
  const paths = []
  let totalBytes = 0
  for (const [index, artifact] of value.artifacts.entries()) {
    exactKeys(artifact, ['path', 'role', 'mediaType', 'bytes', 'sha256'], `review artifact-set record ${index}`)
    const path = portableArtifactPath(artifact.path, `review artifact-set record ${index} path`)
    if (!path.startsWith('artifacts/') || !TOKEN.test(artifact.role ?? '')
      || !['application/json', 'application/octet-stream', 'text/plain'].includes(artifact.mediaType)) {
      fail(`review artifact-set record ${index} metadata is invalid`)
    }
    count(artifact.bytes, `review artifact-set record ${index} bytes`)
    digest(artifact.sha256, `review artifact-set record ${index}`)
    totalBytes += artifact.bytes
    paths.push(path)
  }
  const ordered = [...paths].sort(compareUtf8)
  if (new Set(paths).size !== paths.length || stableStringify(paths) !== stableStringify(ordered)
    || value.artifactCount !== paths.length || value.totalBytes !== totalBytes) {
    fail('review artifact set is duplicate, reordered, or has invalid totals')
  }
  if (!canonicalBytes(value).equals(bytes)) fail('review artifact set bytes are non-canonical')
  return true
}

function validateCandidate(value, bytes, candidateDigest, artifactSet, artifactBytesByPath) {
  exactKeys(value, [
    'schemaVersion', 'kind', 'identity', 'review', 'artifactSet',
    'sourceChangeSummarySha256', 'focusedValidationSha256',
  ], 'frozen review candidate')
  if (value.schemaVersion !== 1 || value.kind !== 'provider-neutral-frozen-review-candidate') {
    fail('frozen review candidate identity/version is invalid')
  }
  normalizeBundleIdentity(value.identity)
  normalizeReviewClosure(value.review)
  exactKeys(value.artifactSet, ['algorithm', 'artifactSetSha256', 'artifactCount', 'totalBytes'], 'candidate artifact-set binding')
  if (value.artifactSet.algorithm !== 'sha256'
    || value.artifactSet.artifactSetSha256 !== sha256(artifactSet.bytes)
    || value.artifactSet.artifactCount !== artifactSet.value.artifactCount
    || value.artifactSet.totalBytes !== artifactSet.value.totalBytes
    || value.sourceChangeSummarySha256 !== roleDigest(artifactSet, 'source-change-summary')
    || value.focusedValidationSha256 !== roleDigest(artifactSet, 'focused-validation')) {
    fail('frozen review candidate is detached from its exact artifact set')
  }
  if (!canonicalBytes(value).equals(bytes) || sha256(bytes) !== candidateDigest) {
    fail('frozen review candidate content address is invalid')
  }
  validateSourceChangeSummary(
    parseBoundJsonArtifact(
      artifactSet,
      artifactBytesByPath,
      'source-change-summary',
      'source-change summary',
    ),
    value.identity,
  )
  validateFocusedValidationRecordSet(parseBoundJsonArtifact(
    artifactSet,
    artifactBytesByPath,
    'focused-validation',
    'focused validation record set',
  ))
  validateReviewBundleSemanticClosure(artifactSet, artifactBytesByPath, value)
  return true
}

function readReviewBundleDirectory(root, candidateDigest) {
  digest(candidateDigest, 'review candidate')
  const candidateBytes = readFileSync(resolve(root, 'candidate.json'))
  const artifactSetBytes = readFileSync(resolve(root, 'artifact-set.json'))
  const candidate = canonicalJson(candidateBytes, 'frozen review candidate')
  const artifactSet = {
    value: canonicalJson(artifactSetBytes, 'review artifact set'),
    bytes: artifactSetBytes,
  }
  validateArtifactSet(artifactSet.value, artifactSet.bytes)
  const expectedFiles = [
    'artifact-set.json',
    'candidate.json',
    ...artifactSet.value.artifacts.map(record => record.path),
  ]
  assertExactTopology(root, expectedFiles, 'review bundle')
  const artifactBytesByPath = new Map()
  for (const record of artifactSet.value.artifacts) {
    const file = safeJoin(root, record.path, 'review bundle artifact readback')
    fileIdentity(file, `review bundle artifact:${record.path}`)
    const bytes = readFileSync(file)
    if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) {
      fail(`review bundle artifact is missing or substituted:${record.path}`)
    }
    artifactBytesByPath.set(record.path, bytes)
  }
  validateCandidate(candidate, candidateBytes, candidateDigest, artifactSet, artifactBytesByPath)
  return {
    root,
    candidate,
    candidateBytes,
    candidateDigest,
    artifactSet: artifactSet.value,
    artifactSetBytes,
    artifactSetDigest: sha256(artifactSetBytes),
  }
}

export function writeFrozenReviewBundle({
  repoRoot = process.cwd(),
  explicitRoot = null,
  identity,
  review,
  artifacts,
} = {}) {
  const repository = resolveRepositoryRoot(repoRoot)
  const artifactSet = buildArtifactSet(artifacts)
  const candidate = buildCandidate({ identity, review, artifactSet })
  const runId = candidate.value.identity.runId
  const relativeBase = `deep-audit/runs/${runId}/cross-provider-review/bundles`
  const base = ensureRuntimeEvidenceDirectory({ repoRoot: repository, explicitRoot, relativePath: relativeBase })
  const target = resolve(base, candidate.sha256)
  if (!isContained(base, target, { allowRoot: false })) fail('review bundle target escapes its evidence parent')
  if (existsSync(target)) {
    const observed = readReviewBundleDirectory(target, candidate.sha256)
    if (!observed.candidateBytes.equals(candidate.bytes)
      || !observed.artifactSetBytes.equals(artifactSet.bytes)) {
      fail('existing content-addressed review bundle conflicts with the requested candidate')
    }
    return { ...observed, reused: true }
  }
  const stage = createStage(base, candidate.sha256)
  try {
    writeExclusive(prepareStageFile(stage, 'candidate.json'), candidate.bytes, 'frozen review candidate')
    writeExclusive(prepareStageFile(stage, 'artifact-set.json'), artifactSet.bytes, 'review artifact set')
    for (const record of artifactSet.records) {
      writeExclusive(
        prepareStageFile(stage, `artifacts/${record.path}`),
        record.bytes,
        `review artifact:${record.path}`,
      )
    }
    const publication = publishDirectory({
      base,
      stage,
      target,
      readback: path => readReviewBundleDirectory(path, candidate.sha256),
      label: 'content-addressed review bundle',
    })
    const observed = readReviewBundleDirectory(target, candidate.sha256)
    if (!observed.candidateBytes.equals(candidate.bytes)
      || !observed.artifactSetBytes.equals(artifactSet.bytes)) {
      fail('published content-addressed review bundle differs from the requested candidate')
    }
    return { ...observed, reused: publication.reused }
  } finally {
    cleanupStage(stage)
  }
}

export function readFrozenReviewBundle({
  repoRoot = process.cwd(),
  explicitRoot = null,
  runId,
  candidateDigest,
} = {}) {
  if (!RUN_ID.test(runId ?? '')) fail('review bundle run ID is invalid')
  digest(candidateDigest, 'review candidate')
  const relativePath = `deep-audit/runs/${runId}/cross-provider-review/bundles/${candidateDigest}`
  const root = resolveRuntimeEvidencePath({ repoRoot, explicitRoot, relativePath })
  const observed = readReviewBundleDirectory(root, candidateDigest)
  if (observed.candidate.identity.runId !== runId) {
    fail('review bundle path targets another frozen run')
  }
  return observed
}

function canonicalPayloadBytes(value) {
  return Buffer.from(stableStringify(value))
}

function canonicalPayloadJson(bytes, label) {
  let value
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    fail(`${label} is invalid JSON:${error.message}`)
  }
  if (!canonicalPayloadBytes(value).equals(bytes)) {
    fail(`${label} is not canonical compact JSON`)
  }
  return value
}

function genuineReviewHandoffProjection(handoff) {
  const {
    artifacts: ignoredArtifacts,
    evidenceSetDigest: ignoredEvidenceSetDigest,
    ...projection
  } = handoff
  return projection
}

function validateGenuineReviewArchiveHandoff(handoff) {
  exactKeys(handoff, [
    'schemaVersion', 'evidenceKind', 'protocol', 'runIdentity',
    'reviewerIdentity', 'exchangeScheduleDigest', 'selectionDigest',
    'structuralCompletionDigest', 'executionEvidenceDigest', 'receiptDigest',
    'requestCount', 'artifactCount', 'artifactSetDigest',
    'completeArchiveHandoff', 'artifacts', 'evidenceSetDigest',
  ], 'genuine review archive handoff')
  if (handoff.schemaVersion !== 1
    || handoff.evidenceKind !== 'provider-neutral-genuine-review-archive-handoff'
    || handoff.protocol !== 'content-addressed-model-broker-exchange-v1'
    || handoff.completeArchiveHandoff !== true
    || !Array.isArray(handoff.artifacts)
    || handoff.artifactCount !== handoff.artifacts.length
    || !Number.isSafeInteger(handoff.requestCount)
    || handoff.requestCount <= 0) {
    fail('genuine review archive handoff identity/closure is invalid')
  }
  exactKeys(handoff.runIdentity, [
    'runId', 'manifestSha256', 'head', 'tree', 'indexDigest',
    'worktreeFingerprint', 'inventoryDigest', 'rubricDigest',
    'providerIdentityDigest',
  ], 'genuine review archive run identity')
  if (!RUN_ID.test(handoff.runIdentity.runId ?? '')
    || !GIT_OID.test(handoff.runIdentity.head ?? '')
    || !GIT_OID.test(handoff.runIdentity.tree ?? '')) {
    fail('genuine review archive run identity is invalid')
  }
  for (const field of [
    'manifestSha256',
    'indexDigest',
    'worktreeFingerprint',
    'inventoryDigest',
    'rubricDigest',
    'providerIdentityDigest',
    'exchangeScheduleDigest',
    'selectionDigest',
    'structuralCompletionDigest',
    'executionEvidenceDigest',
    'receiptDigest',
    'artifactSetDigest',
    'evidenceSetDigest',
  ]) {
    digest(field in handoff ? handoff[field] : handoff.runIdentity[field],
      `genuine review archive ${field}`)
  }
  exactKeys(handoff.reviewerIdentity, [
    'authorProviderId', 'reviewerProviderId', 'reviewProfileId',
    'invocationProfileId', 'modelReleaseId', 'requestModelId',
    'runtimeCertificationId', 'runtimeCertificationDigest',
    'runtimeTargetDigest',
  ], 'genuine review archive reviewer identity')
  if (typeof handoff.reviewerIdentity.authorProviderId !== 'string'
    || typeof handoff.reviewerIdentity.reviewerProviderId !== 'string'
    || handoff.reviewerIdentity.authorProviderId
      === handoff.reviewerIdentity.reviewerProviderId) {
    fail('genuine review archive provider independence is invalid')
  }
  for (const field of [
    'runtimeCertificationDigest',
    'runtimeTargetDigest',
  ]) digest(handoff.reviewerIdentity[field], `genuine review archive reviewer ${field}`)
  const artifactRecords = []
  const artifactBytesByPath = new Map()
  let previousPath = null
  for (const [index, artifact] of handoff.artifacts.entries()) {
    exactKeys(artifact, [
      'path', 'role', 'mediaType', 'bytes', 'sha256', 'payload',
    ], `genuine review archive artifact ${index}`)
    const path = portableArtifactPath(artifact.path, `genuine review archive artifact ${index} path`)
    if (previousPath !== null && compareUtf8(previousPath, path) >= 0) {
      fail('genuine review archive artifacts are duplicated or reordered')
    }
    previousPath = path
    if (!TOKEN.test(artifact.role ?? '')
      || artifact.mediaType !== 'application/json'
      || !Number.isSafeInteger(artifact.bytes)
      || artifact.bytes <= 0) {
      fail(`genuine review archive artifact metadata is invalid:${path}`)
    }
    const bytes = canonicalPayloadBytes(artifact.payload)
    if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
      fail(`genuine review archive artifact bytes are substituted:${path}`)
    }
    artifactBytesByPath.set(path, bytes)
    artifactRecords.push({
      path,
      role: artifact.role,
      mediaType: artifact.mediaType,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
    })
  }
  if (sha256(stableStringify(artifactRecords)) !== handoff.artifactSetDigest
    || sha256(stableStringify(genuineReviewHandoffProjection(handoff)))
      !== handoff.evidenceSetDigest) {
    fail('genuine review archive artifact/evidence-set content address is invalid')
  }
  const byRole = (role) => handoff.artifacts.filter(
    artifact => artifact.role === role,
  )
  const completions = byRole('structural-completion')
  const executions = byRole('provider-execution-evidence')
  const receipts = byRole('genuine-cross-provider-review-receipt')
  const carriers = byRole('provider-result-carrier')
  if (completions.length !== 1
    || executions.length !== 1
    || receipts.length !== 1
    || carriers.length !== handoff.requestCount
    || handoff.artifactCount !== handoff.requestCount + 3) {
    fail('genuine review archive artifact closure is partial or duplicated')
  }
  const completion = completions[0].payload
  const executionEvidence = executions[0].payload
  const receipt = receipts[0].payload
  validateGenuineCrossProviderReviewReceipt(receipt)
  if (!Array.isArray(executionEvidence)
    || executionEvidence.length !== handoff.requestCount
    || receipt.receiptDigest !== handoff.receiptDigest
    || receipt.exchangeScheduleDigest !== handoff.exchangeScheduleDigest
    || receipt.selectionDigest !== handoff.selectionDigest
    || receipt.structuralCompletionDigest !== handoff.structuralCompletionDigest
    || receipt.executionEvidenceDigest !== handoff.executionEvidenceDigest
    || receipt.requestCount !== handoff.requestCount
    || receipt.authorProviderId !== handoff.reviewerIdentity.authorProviderId
    || receipt.reviewerProviderId !== handoff.reviewerIdentity.reviewerProviderId
    || receipt.reviewProfileId !== handoff.reviewerIdentity.reviewProfileId
    || receipt.invocationProfileId !== handoff.reviewerIdentity.invocationProfileId
    || receipt.modelReleaseId !== handoff.reviewerIdentity.modelReleaseId
    || receipt.requestModelId !== handoff.reviewerIdentity.requestModelId
    || receipt.runtimeCertificationId
      !== handoff.reviewerIdentity.runtimeCertificationId
    || receipt.runtimeCertificationDigest
      !== handoff.reviewerIdentity.runtimeCertificationDigest
    || receipt.runtimeTargetDigest !== handoff.reviewerIdentity.runtimeTargetDigest
    || completion?.completionDigest !== handoff.structuralCompletionDigest
    || completion?.responseDigestSetDigest !== receipt.responseDigestSetDigest
    || sha256(stableStringify(executionEvidence))
      !== handoff.executionEvidenceDigest) {
    fail('genuine review archive receipt/completion/execution binding mismatches')
  }
  for (const [ordinal, artifact] of carriers.entries()) {
    const match = artifact.path.match(/^results\/([0-9]{6})-([a-f0-9]{64})\.json$/)
    const carrier = artifact.payload
    const { carrierDigest, ...carrierProjection } = carrier ?? {}
    if (!match
      || Number(match[1]) !== ordinal
      || match[2] !== carrierDigest
      || carrierDigest !== sha256(stableStringify(carrierProjection))
      || carrier.requestOrdinal !== ordinal
      || executionEvidence[ordinal]?.requestOrdinal !== ordinal
      || executionEvidence[ordinal]?.requestDigest !== carrier.requestDigest
      || executionEvidence[ordinal]?.carrierDigest !== carrierDigest) {
      fail(`genuine review archive result carrier is missing, reordered, or substituted:${ordinal}`)
    }
  }
  return {
    artifactRecords,
    artifactBytesByPath,
    completion,
    executionEvidence,
    receipt,
  }
}

function genuineReviewArchiveWrapper({
  handoff,
  evidenceSetBytes,
  artifactRecords,
}) {
  return {
    schemaVersion: 1,
    kind: 'deep-audit-genuine-cross-provider-review-evidence-archive',
    runId: handoff.runIdentity.runId,
    evidenceSetDigest: handoff.evidenceSetDigest,
    evidenceSetContentSha256: sha256(evidenceSetBytes),
    artifactSetDigest: handoff.artifactSetDigest,
    artifactCount: artifactRecords.length,
    receiptDigest: handoff.receiptDigest,
  }
}

function readGenuineReviewArchiveDirectory(root, archiveDigest) {
  digest(archiveDigest, 'genuine review archive')
  const wrapperBytes = readFileSync(resolve(root, 'archive.json'))
  const evidenceSetBytes = readFileSync(resolve(root, 'evidence-set.json'))
  const wrapper = canonicalJson(wrapperBytes, 'genuine review archive wrapper')
  exactKeys(wrapper, [
    'schemaVersion', 'kind', 'runId', 'evidenceSetDigest',
    'evidenceSetContentSha256', 'artifactSetDigest', 'artifactCount',
    'receiptDigest',
  ], 'genuine review archive wrapper')
  if (wrapper.schemaVersion !== 1
    || wrapper.kind !== 'deep-audit-genuine-cross-provider-review-evidence-archive'
    || !RUN_ID.test(wrapper.runId ?? '')
    || sha256(wrapperBytes) !== archiveDigest
    || sha256(evidenceSetBytes) !== wrapper.evidenceSetContentSha256) {
    fail('genuine review archive wrapper is stale or substituted')
  }
  const evidenceSet = canonicalJson(evidenceSetBytes, 'genuine review evidence set')
  exactKeys(evidenceSet, [
    'schemaVersion', 'evidenceKind', 'protocol', 'runIdentity',
    'reviewerIdentity', 'exchangeScheduleDigest', 'selectionDigest',
    'structuralCompletionDigest', 'executionEvidenceDigest', 'receiptDigest',
    'requestCount', 'artifactCount', 'artifactSetDigest',
    'completeArchiveHandoff', 'artifacts', 'evidenceSetDigest',
  ], 'genuine review evidence set')
  if (!Array.isArray(evidenceSet.artifacts)) {
    fail('genuine review evidence-set artifact records are invalid')
  }
  const artifacts = evidenceSet.artifacts.map((record, index) => {
    exactKeys(record, [
      'path', 'role', 'mediaType', 'bytes', 'sha256',
    ], `genuine review evidence-set artifact ${index}`)
    const path = portableArtifactPath(record.path,
      `genuine review evidence-set artifact ${index} path`)
    const file = safeJoin(root, `artifacts/${path}`,
      `genuine review archive artifact ${index}`)
    fileIdentity(file, `genuine review archive artifact:${path}`)
    const bytes = readFileSync(file)
    if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) {
      fail(`genuine review archive artifact is missing or substituted:${path}`)
    }
    return {
      ...record,
      payload: canonicalPayloadJson(bytes, `genuine review archive artifact:${path}`),
    }
  })
  const handoff = {
    ...Object.fromEntries(
      Object.entries(evidenceSet).filter(([key]) => key !== 'artifacts'),
    ),
    artifacts,
  }
  const validated = validateGenuineReviewArchiveHandoff(handoff)
  if (wrapper.runId !== handoff.runIdentity.runId
    || wrapper.evidenceSetDigest !== handoff.evidenceSetDigest
    || wrapper.artifactSetDigest !== handoff.artifactSetDigest
    || wrapper.artifactCount !== handoff.artifactCount
    || wrapper.receiptDigest !== handoff.receiptDigest) {
    fail('genuine review archive wrapper is detached from its evidence set')
  }
  assertExactTopology(root, [
    'archive.json',
    'evidence-set.json',
    ...validated.artifactRecords.map(record => `artifacts/${record.path}`),
  ], 'genuine review archive')
  return {
    root,
    archiveDigest,
    wrapper,
    wrapperBytes,
    evidenceSet,
    evidenceSetBytes,
    handoff,
    receipt: validated.receipt,
  }
}

export function archiveGenuineCrossProviderReviewEvidence({
  repoRoot = process.cwd(),
  explicitRoot = null,
  handoff,
} = {}) {
  const repository = resolveRepositoryRoot(repoRoot)
  const validated = validateGenuineReviewArchiveHandoff(handoff)
  const before = captureDeepAuditSnapshot(repository)
  for (const field of [
    'head',
    'tree',
    'indexDigest',
    'inventoryDigest',
    'worktreeFingerprint',
  ]) {
    if (before[field] !== handoff.runIdentity[field]) {
      fail(`genuine review archive frozen target is stale:${field}`)
    }
  }
  const artifactRecords = validated.artifactRecords
  const evidenceSet = {
    ...genuineReviewHandoffProjection(handoff),
    artifacts: artifactRecords,
    evidenceSetDigest: handoff.evidenceSetDigest,
  }
  const evidenceSetBytes = canonicalBytes(evidenceSet)
  const wrapper = genuineReviewArchiveWrapper({
    handoff,
    evidenceSetBytes,
    artifactRecords,
  })
  const wrapperBytes = canonicalBytes(wrapper)
  const archiveDigest = sha256(wrapperBytes)
  const relativeBase =
    `deep-audit/runs/${handoff.runIdentity.runId}/cross-provider-review/genuine-reviews`
  const base = ensureRuntimeEvidenceDirectory({
    repoRoot: repository,
    explicitRoot,
    relativePath: relativeBase,
  })
  const target = resolve(base, archiveDigest)
  if (!isContained(base, target, { allowRoot: false })) {
    fail('genuine review archive target escapes its evidence parent')
  }
  if (existsSync(target)) {
    const observed = readGenuineReviewArchiveDirectory(target, archiveDigest)
    if (!observed.wrapperBytes.equals(wrapperBytes)
      || !observed.evidenceSetBytes.equals(evidenceSetBytes)) {
      fail('existing genuine review archive conflicts with the requested evidence set')
    }
    const after = captureDeepAuditSnapshot(repository)
    if (stableStringify(frozenWorktreeIdentity(before))
      !== stableStringify(frozenWorktreeIdentity(after))) {
      fail('genuine review archive replay changed the frozen target')
    }
    return {
      ...observed,
      archiveReference: `${relativeBase}/${archiveDigest}`,
      frozenIdentityBefore: frozenWorktreeIdentity(before),
      frozenIdentityAfter: frozenWorktreeIdentity(after),
      reused: true,
    }
  }
  const stage = createStage(base, archiveDigest)
  try {
    writeExclusive(prepareStageFile(stage, 'archive.json'), wrapperBytes,
      'genuine review archive wrapper')
    writeExclusive(prepareStageFile(stage, 'evidence-set.json'), evidenceSetBytes,
      'genuine review evidence set')
    for (const artifact of handoff.artifacts) {
      writeExclusive(
        prepareStageFile(stage, `artifacts/${artifact.path}`),
        canonicalPayloadBytes(artifact.payload),
        `genuine review archive artifact:${artifact.path}`,
      )
    }
    const publication = publishDirectory({
      base,
      stage,
      target,
      readback: path => readGenuineReviewArchiveDirectory(path, archiveDigest),
      label: 'genuine cross-provider review evidence archive',
    })
    const after = captureDeepAuditSnapshot(repository)
    if (stableStringify(frozenWorktreeIdentity(before))
      !== stableStringify(frozenWorktreeIdentity(after))) {
      fail('genuine review archive publication changed the frozen target')
    }
    return {
      ...readGenuineReviewArchiveDirectory(target, archiveDigest),
      archiveReference: `${relativeBase}/${archiveDigest}`,
      frozenIdentityBefore: frozenWorktreeIdentity(before),
      frozenIdentityAfter: frozenWorktreeIdentity(after),
      reused: publication.reused,
    }
  } finally {
    cleanupStage(stage)
  }
}

export function readGenuineCrossProviderReviewEvidenceArchive({
  repoRoot = process.cwd(),
  explicitRoot = null,
  runId,
  archiveDigest,
} = {}) {
  if (!RUN_ID.test(runId ?? '')) fail('genuine review archive run ID is invalid')
  digest(archiveDigest, 'genuine review archive')
  const relativePath =
    `deep-audit/runs/${runId}/cross-provider-review/genuine-reviews/${archiveDigest}`
  const root = resolveRuntimeEvidencePath({ repoRoot, explicitRoot, relativePath })
  const observed = readGenuineReviewArchiveDirectory(root, archiveDigest)
  if (observed.handoff.runIdentity.runId !== runId) {
    fail('genuine review archive path targets another frozen run')
  }
  return observed
}

function frozenWorktreeIdentity(snapshot) {
  return {
    head: snapshot.head,
    tree: snapshot.tree,
    indexDigest: snapshot.indexDigest,
    inventoryDigest: snapshot.inventoryDigest,
    worktreeFingerprint: snapshot.worktreeFingerprint,
  }
}

function normalizedWorktreeIdentity(value, label) {
  exactKeys(value, ['schemaVersion', 'kind', 'indexSha256', 'entryCount', 'digest'], label)
  if (value.schemaVersion !== 1 || value.kind !== 'git-visible-worktree-fingerprint') {
    fail(`${label} identity/version is invalid`)
  }
  digest(value.indexSha256, `${label} index`)
  digest(value.digest, `${label} digest`)
  count(value.entryCount, `${label} entry count`, { minimum: 1 })
  return structuredClone(value)
}

function normalizedFrozenTargetReadback(value, label) {
  exactKeys(value, [
    'head', 'tree', 'indexDigest', 'inventoryDigest', 'worktreeFingerprint',
  ], label)
  gitOid(value.head, `${label} HEAD`)
  gitOid(value.tree, `${label} tree`)
  for (const key of ['indexDigest', 'inventoryDigest', 'worktreeFingerprint']) {
    digest(value[key], `${label} ${key}`)
  }
  return structuredClone(value)
}

function validateReceiptArchiveWrapper(wrapper, bytes, archiveDigest, receiptBytes, bundle) {
  exactKeys(wrapper, [
    'schemaVersion', 'kind', 'candidate', 'receipt', 'frozenTargetReadback',
    'preWorktree', 'postWorktree',
  ], 'All-Harness pass-receipt archive')
  if (wrapper.schemaVersion !== 1 || wrapper.kind !== 'deep-audit-all-harness-pass-receipt-archive') {
    fail('All-Harness pass-receipt archive identity/version is invalid')
  }
  exactKeys(wrapper.candidate, [
    'runId', 'candidateDigest', 'manifestSha256', 'worktreeFingerprint',
    'inventoryDigest', 'artifactSetDigest',
  ], 'All-Harness archive candidate binding')
  if (wrapper.candidate.runId !== bundle.candidate.identity.runId
    || wrapper.candidate.candidateDigest !== bundle.candidateDigest
    || wrapper.candidate.manifestSha256 !== bundle.candidate.identity.manifestSha256
    || wrapper.candidate.worktreeFingerprint !== bundle.candidate.identity.worktreeFingerprint
    || wrapper.candidate.inventoryDigest !== bundle.candidate.identity.inventoryDigest
    || wrapper.candidate.artifactSetDigest !== bundle.artifactSetDigest) {
    fail('All-Harness archive targets another frozen review candidate')
  }
  exactKeys(wrapper.receipt, [
    'receiptSha256', 'contentSha256', 'completedAt', 'expiresAt',
  ], 'All-Harness archive receipt binding')
  const receipt = canonicalJson(receiptBytes, 'archived canonical All-Harness receipt')
  validateAllHarnessReceiptEvidence(receipt, { now: new Date(receipt.completedAt) })
  if (wrapper.receipt.receiptSha256 !== receipt.receiptSha256
    || wrapper.receipt.receiptSha256 !== allHarnessReceiptDigest(receipt)
    || wrapper.receipt.contentSha256 !== sha256(receiptBytes)
    || wrapper.receipt.completedAt !== receipt.completedAt
    || wrapper.receipt.expiresAt !== receipt.expiresAt) {
    fail('All-Harness archive receipt bytes are substituted or reissued')
  }
  const pre = normalizedWorktreeIdentity(wrapper.preWorktree, 'All-Harness archive pre-worktree')
  const post = normalizedWorktreeIdentity(wrapper.postWorktree, 'All-Harness archive post-worktree')
  const frozen = normalizedFrozenTargetReadback(
    wrapper.frozenTargetReadback,
    'All-Harness archive frozen-target readback',
  )
  if (stableStringify(pre) !== stableStringify(post)
    || frozen.head !== bundle.candidate.identity.head
    || frozen.tree !== bundle.candidate.identity.tree
    || frozen.indexDigest !== bundle.candidate.identity.indexDigest
    || frozen.inventoryDigest !== bundle.candidate.identity.inventoryDigest
    || frozen.worktreeFingerprint !== bundle.candidate.identity.worktreeFingerprint
    || post.indexSha256 !== bundle.candidate.identity.indexDigest
    || receipt.subject.head !== bundle.candidate.identity.head
    || receipt.subject.tree !== bundle.candidate.identity.tree
    || receipt.subject.gitVisibleWorktree.indexSha256 !== post.indexSha256
    || receipt.subject.gitVisibleWorktree.entryCount !== post.entryCount
    || receipt.subject.gitVisibleWorktree.digest !== post.digest) {
    fail('All-Harness archive does not prove an unchanged frozen target')
  }
  if (!canonicalBytes(wrapper).equals(bytes) || sha256(bytes) !== archiveDigest) {
    fail('All-Harness pass-receipt archive content address is invalid')
  }
  return receipt
}

function readReceiptArchiveDirectory(root, archiveDigest, bundle) {
  digest(archiveDigest, 'All-Harness receipt archive')
  const wrapperBytes = readFileSync(resolve(root, 'pass-receipt.json'))
  const receiptBytes = readFileSync(resolve(root, 'canonical-all-harness-receipt.json'))
  const wrapper = canonicalJson(wrapperBytes, 'All-Harness pass-receipt archive')
  const receipt = validateReceiptArchiveWrapper(wrapper, wrapperBytes, archiveDigest, receiptBytes, bundle)
  assertExactTopology(root, [
    'canonical-all-harness-receipt.json',
    'pass-receipt.json',
  ], 'All-Harness receipt archive')
  return { root, archiveDigest, wrapper, wrapperBytes, receipt, receiptBytes }
}

export function archiveAllHarnessPassReceipt(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    fail('All-Harness receipt archive options are invalid')
  }
  const allowed = new Set([
    'repoRoot', 'explicitRoot', 'runId', 'candidateDigest', 'preWorktree', 'postWorktree',
  ])
  const unknown = Object.keys(options).find(key => !allowed.has(key))
  if (unknown) fail(`All-Harness receipt archive option is forbidden:${unknown}`)
  const {
    repoRoot = process.cwd(),
    explicitRoot = null,
    runId,
    candidateDigest,
    preWorktree,
    postWorktree,
  } = options
  const repository = resolveRepositoryRoot(repoRoot)
  const bundle = readFrozenReviewBundle({ repoRoot: repository, explicitRoot, runId, candidateDigest })
  const liveSnapshot = captureDeepAuditSnapshot(repository)
  const frozenTargetReadback = {
    head: liveSnapshot.head,
    tree: liveSnapshot.tree,
    indexDigest: liveSnapshot.indexDigest,
    inventoryDigest: liveSnapshot.inventoryDigest,
    worktreeFingerprint: liveSnapshot.worktreeFingerprint,
  }
  for (const key of Object.keys(frozenTargetReadback)) {
    if (frozenTargetReadback[key] !== bundle.candidate.identity[key]) {
      fail(`All-Harness receipt archive target is stale:${key}`)
    }
  }
  const absoluteReceipt = resolve(repository, 'infra/governance/runtime/all-harness-receipt.json')
  assertSafeExistingPath(repository, absoluteReceipt, 'All-Harness receipt source', { targetKind: 'file' })
  fileIdentity(absoluteReceipt, 'All-Harness receipt source')
  const receiptBytes = readFileSync(absoluteReceipt)
  const receipt = canonicalJson(receiptBytes, 'canonical All-Harness receipt')
  validateAllHarnessReceipt(receipt, { repoRoot: repository, now: new Date() })
  const normalizedPre = normalizedWorktreeIdentity(preWorktree, 'All-Harness pre-worktree')
  const normalizedPost = normalizedWorktreeIdentity(postWorktree, 'All-Harness post-worktree')
  const wrapper = {
    schemaVersion: 1,
    kind: 'deep-audit-all-harness-pass-receipt-archive',
    candidate: {
      runId,
      candidateDigest,
      manifestSha256: bundle.candidate.identity.manifestSha256,
      worktreeFingerprint: bundle.candidate.identity.worktreeFingerprint,
      inventoryDigest: bundle.candidate.identity.inventoryDigest,
      artifactSetDigest: bundle.artifactSetDigest,
    },
    receipt: {
      receiptSha256: receipt.receiptSha256,
      contentSha256: sha256(receiptBytes),
      completedAt: receipt.completedAt,
      expiresAt: receipt.expiresAt,
    },
    frozenTargetReadback,
    preWorktree: normalizedPre,
    postWorktree: normalizedPost,
  }
  const wrapperBytes = canonicalBytes(wrapper)
  const archiveDigest = sha256(wrapperBytes)
  validateReceiptArchiveWrapper(wrapper, wrapperBytes, archiveDigest, receiptBytes, bundle)
  const relativeBase = `deep-audit/runs/${runId}/all-harness/pass-receipts`
  const base = ensureRuntimeEvidenceDirectory({ repoRoot: repository, explicitRoot, relativePath: relativeBase })
  const target = resolve(base, archiveDigest)
  if (!isContained(base, target, { allowRoot: false })) fail('All-Harness receipt archive escapes its evidence parent')
  if (existsSync(target)) {
    const observed = readReceiptArchiveDirectory(target, archiveDigest, bundle)
    if (!observed.wrapperBytes.equals(wrapperBytes) || !observed.receiptBytes.equals(receiptBytes)) {
      fail('existing All-Harness receipt archive conflicts with the requested archive')
    }
    return { ...observed, reused: true }
  }
  const stage = createStage(base, archiveDigest)
  try {
    writeExclusive(prepareStageFile(stage, 'pass-receipt.json'), wrapperBytes, 'All-Harness archive wrapper')
    writeExclusive(
      prepareStageFile(stage, 'canonical-all-harness-receipt.json'),
      receiptBytes,
      'canonical All-Harness receipt copy',
    )
    const publication = publishDirectory({
      base,
      stage,
      target,
      readback: path => readReceiptArchiveDirectory(path, archiveDigest, bundle),
      label: 'All-Harness pass-receipt archive',
    })
    return {
      ...readReceiptArchiveDirectory(target, archiveDigest, bundle),
      reused: publication.reused,
    }
  } finally {
    cleanupStage(stage)
  }
}

export function readAllHarnessPassReceiptArchive({
  repoRoot = process.cwd(),
  explicitRoot = null,
  runId,
  candidateDigest,
  archiveDigest,
} = {}) {
  const bundle = readFrozenReviewBundle({ repoRoot, explicitRoot, runId, candidateDigest })
  const relativePath = `deep-audit/runs/${runId}/all-harness/pass-receipts/${archiveDigest}`
  const root = resolveRuntimeEvidencePath({ repoRoot, explicitRoot, relativePath })
  return readReceiptArchiveDirectory(root, archiveDigest, bundle)
}

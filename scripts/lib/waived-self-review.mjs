#!/usr/bin/env node
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, resolve } from 'node:path'
import {
  loadActiveDeepAuditRun,
  sha256,
  stableStringify,
  validateDeepAuditEvidenceContractSchema,
  validateDeepAuditRunProviderBindings,
} from './deep-audit-evidence-contract.mjs'
import {
  assertSafeExistingPath,
  isContained,
  prepareRuntimeEvidenceFile,
  resolveRuntimeEvidencePath,
  safeRelativePath,
} from './governance-runtime-evidence.mjs'

const REQUIRED_DIMENSION_COUNT = 91
const SUPPORTED_TIERS = new Set(['DETERMINISTIC', 'PURE-JUDGMENT', 'HOOK-ENFORCED', 'CI-ENFORCED'])
const WAIVED_REVIEW_PATH = 'review/waived-self-review.json'
const MAX_INPUT_BYTES = 16 * 1024 * 1024

function fail(message) {
  throw new Error(`waived self-review blocked:${message}`)
}

function exact(value, expected, label) {
  if (stableStringify(value) !== stableStringify(expected)) fail(`${label} differs from the active run manifest`)
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (stableStringify(actual) !== stableStringify(expected)) fail(`${label} has an invalid or open shape`)
}

function validIso(value, label) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    || Number.isNaN(Date.parse(value))) fail(`${label} must be an ISO-8601 UTC timestamp`)
}

function regularFileSnapshot(path, label) {
  let info
  try { info = lstatSync(path, { bigint: true }) } catch (error) { fail(`${label} is unavailable:${error.message}`) }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) fail(`${label} must be one regular, non-linked file`)
  if (info.size <= 0n || info.size > BigInt(MAX_INPUT_BYTES)) fail(`${label} size is outside the accepted range`)
  return info
}

function sameFileSnapshot(left, right) {
  return ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every((key) => left[key] === right[key])
}

function readStableRegularJson(path, label, { requireCanonical = false } = {}) {
  const before = regularFileSnapshot(path, label)
  const bytes = readFileSync(path)
  const after = regularFileSnapshot(path, label)
  if (!sameFileSnapshot(before, after) || BigInt(bytes.length) !== before.size) fail(`${label} changed while it was read`)
  let value
  try { value = JSON.parse(bytes.toString('utf8')) } catch (error) { fail(`${label} is invalid JSON:${error.message}`) }
  if (requireCanonical && !bytes.equals(Buffer.from(`${stableStringify(value, 2)}\n`))) {
    fail(`${label} is not canonical stable JSON`)
  }
  return { value, bytes }
}

function resolveInputPath(repository, inputPath) {
  if (typeof inputPath !== 'string' || !inputPath || inputPath.includes('\0') || /\p{Cc}/u.test(inputPath)) {
    fail('--input must be one explicit safe path')
  }
  if (isAbsolute(inputPath)) {
    let physical
    try { physical = realpathSync(resolve(inputPath)) } catch (error) { fail(`--input is unavailable:${error.message}`) }
    regularFileSnapshot(physical, '--input')
    return physical
  }
  const relativePath = safeRelativePath(inputPath, '--input')
  const target = resolve(repository, relativePath)
  if (!isContained(repository, target, { allowRoot: false })) fail('--input escapes the repository')
  assertSafeExistingPath(repository, target, '--input', { targetKind: 'file' })
  regularFileSnapshot(target, '--input')
  return target
}

export function loadAuditCoverageTiers(repoRoot) {
  let source
  try { source = readFileSync(resolve(repoRoot, 'scripts/audit-coverage-matrix.mjs'), 'utf8') }
  catch (error) { fail(`audit coverage matrix is unavailable:${error.message}`) }
  const entries = [...source.matchAll(/(\d+):\s*\{\s*tier:\s*'([^']+)'/g)]
    .map((match) => [Number(match[1]), match[2]])
  const expected = Array.from({ length: REQUIRED_DIMENSION_COUNT }, (_, index) => index + 1)
  const numbers = entries.map(([number]) => number).sort((left, right) => left - right)
  if (entries.length !== REQUIRED_DIMENSION_COUNT
    || new Set(numbers).size !== REQUIRED_DIMENSION_COUNT
    || numbers.some((number, index) => number !== expected[index])
    || entries.some(([, tier]) => !SUPPORTED_TIERS.has(tier))) {
    fail(`audit coverage matrix must enumerate dimensions 1..${REQUIRED_DIMENSION_COUNT} exactly once`)
  }
  const byTier = Object.fromEntries([...SUPPORTED_TIERS].map((tier) => [tier, []]))
  for (const [number, tier] of entries) byTier[tier].push(number)
  for (const values of Object.values(byTier)) values.sort((left, right) => left - right)
  return byTier
}

function expectedProviderBinding(manifest) {
  return structuredClone(manifest.providers.self)
}

function judgmentCoveragePaths(manifest) {
  const rubric = new Set(manifest.rubricPaths)
  return manifest.inventory
    .filter((row) => row.kind !== 'missing'
      && (row.path.startsWith('packages/design-system/') || rubric.has(row.path)))
    .map((row) => row.path)
    .sort()
}

function validateReviewEntry(entry, { label, allowedPaths, a1b = false } = {}) {
  exactKeys(entry, a1b
    ? ['component', 'status', 'summary', 'claimsReviewed', 'findings']
    : ['dim', 'status', 'summary', 'findings'], label)
  if (!['PASS', 'FINDINGS', 'UNOBSERVED'].includes(entry.status)) fail(`${label}.status is invalid`)
  if (typeof entry.summary !== 'string' || !entry.summary.trim()) fail(`${label}.summary must be non-empty`)
  if (!Array.isArray(entry.findings)) fail(`${label}.findings must be an array`)
  if (entry.status === 'FINDINGS' && entry.findings.length === 0) fail(`${label} FINDINGS requires at least one finding`)
  if (entry.status !== 'FINDINGS' && entry.findings.length !== 0) fail(`${label} ${entry.status} cannot carry findings`)
  if (a1b) {
    if (!Number.isSafeInteger(entry.claimsReviewed) || entry.claimsReviewed < 0) fail(`${label}.claimsReviewed is invalid`)
    if (entry.status === 'UNOBSERVED' && entry.claimsReviewed !== 0) fail(`${label} UNOBSERVED must record zero reviewed claims`)
    if (entry.status !== 'UNOBSERVED' && entry.claimsReviewed === 0) fail(`${label} observed review must record at least one reviewed claim`)
  }
  const findingDigests = new Set()
  for (let index = 0; index < entry.findings.length; index += 1) {
    const finding = entry.findings[index]
    exactKeys(finding, ['severity', 'path', 'line', 'claim', 'actual', 'recommendation'], `${label}.findings[${index}]`)
    if (!['blocking', 'material', 'marginal'].includes(finding.severity)) fail(`${label}.findings[${index}].severity is invalid`)
    safeRelativePath(finding.path, `${label}.findings[${index}].path`)
    if (!allowedPaths.has(finding.path)) fail(`${label}.findings[${index}].path is outside exact coverage`)
    if (!Number.isSafeInteger(finding.line) || finding.line < 1) fail(`${label}.findings[${index}].line is invalid`)
    for (const key of ['claim', 'actual', 'recommendation']) {
      if (typeof finding[key] !== 'string' || !finding[key].trim()) fail(`${label}.findings[${index}].${key} must be non-empty`)
    }
    const digest = sha256(stableStringify(finding))
    if (findingDigests.has(digest)) fail(`${label} repeats an identical finding`)
    findingDigests.add(digest)
  }
}

export function validateWaivedSelfReviewBundle(bundle, {
  activeRun,
  tiers = null,
  repoRoot = null,
} = {}) {
  if (!activeRun?.manifest || !activeRun.manifestSha256) fail('activeRun is required')
  const repository = repoRoot ?? activeRun.repository
  if (!repository) fail('repository root is required')
  validateDeepAuditRunProviderBindings(activeRun.manifest, { repoRoot: repository })
  const { manifest, manifestSha256 } = activeRun
  const waiver = manifest.reviewSelection
  if (waiver?.kind !== 'provider-review-capability-selection-waived'
    || waiver.waiverAuthority !== 'user'
    || manifest.providers.peer !== null
    || manifest.authorProvider !== manifest.providers.self.id
    || waiver.authorProviderId !== manifest.authorProvider
    || waiver.selfProviderId !== manifest.providers.self.id) {
    fail('active run is not an exact user-waived self=author, peer=null run')
  }
  validateDeepAuditEvidenceContractSchema(bundle, { repoRoot: repository, manifest })
  exactKeys(bundle, [
    'schemaVersion', 'evidenceKind', 'runId', 'manifestSha256', 'head', 'tree', 'indexDigest',
    'inventoryDigest', 'rubricDigest', 'worktreeFingerprint', 'authorProvider',
    'providerIdentityDigest', 'reviewSelectionDigest', 'provider', 'reviewedAt', 'reviewMethod',
    'independent', 'assurance', 'secondOpinionPerformed', 'judgmentReviews', 'componentA1bReviews',
  ], 'waived self-review bundle')
  if (bundle.schemaVersion !== 1
    || bundle.evidenceKind !== 'deep-audit-waived-self-review'
    || bundle.reviewMethod !== 'local-self-review-import'
    || bundle.independent !== false
    || bundle.assurance !== 'self-attested'
    || bundle.secondOpinionPerformed !== false) fail('waived self-review identity or assurance is invalid')
  validIso(bundle.reviewedAt, 'waived self-review reviewedAt')
  if (Date.parse(bundle.reviewedAt) < Date.parse(manifest.createdAt)) {
    fail('waived self-review predates the active run manifest')
  }
  for (const key of ['runId', 'head', 'tree', 'indexDigest', 'inventoryDigest', 'rubricDigest', 'worktreeFingerprint', 'authorProvider', 'providerIdentityDigest']) {
    if (bundle[key] !== manifest[key]) fail(`waived self-review ${key} differs from the active run manifest`)
  }
  if (bundle.manifestSha256 !== manifestSha256) fail('waived self-review manifestSha256 differs from the active run manifest')
  if (bundle.reviewSelectionDigest !== waiver.selectionDigest) fail('waived self-review reviewSelectionDigest differs from the active waiver')
  exact(bundle.provider, expectedProviderBinding(manifest), 'waived self-review provider')

  const canonicalTiers = tiers ?? loadAuditCoverageTiers(repository)
  const expectedDims = canonicalTiers['PURE-JUDGMENT']
  if (!Array.isArray(bundle.judgmentReviews)
    || stableStringify(bundle.judgmentReviews.map((entry) => entry?.dim)) !== stableStringify(expectedDims)) {
    fail('waived self-review judgment dimensions do not exactly match canonical PURE-JUDGMENT coverage')
  }
  const judgmentPaths = new Set(judgmentCoveragePaths(manifest))
  if (judgmentPaths.size === 0) fail('waived self-review judgment coverage is empty')
  for (let index = 0; index < bundle.judgmentReviews.length; index += 1) {
    validateReviewEntry(bundle.judgmentReviews[index], {
      label: `waived self-review judgmentReviews[${index}]`,
      allowedPaths: judgmentPaths,
    })
  }

  const expectedComponents = manifest.components.map((component) => component.name)
  if (!Array.isArray(bundle.componentA1bReviews)
    || stableStringify(bundle.componentA1bReviews.map((entry) => entry?.component)) !== stableStringify(expectedComponents)) {
    fail('waived self-review A1b components do not exactly match the frozen manifest')
  }
  for (let index = 0; index < bundle.componentA1bReviews.length; index += 1) {
    const entry = bundle.componentA1bReviews[index]
    const component = manifest.components[index]
    validateReviewEntry(entry, {
      label: `waived self-review componentA1bReviews[${index}]`,
      allowedPaths: new Set(component.paths),
      a1b: true,
    })
  }
  return true
}

function writeAtomicExclusive(target, bytes) {
  const parent = dirname(target)
  const temporary = resolve(parent, `.waived-self-review.${randomUUID()}.tmp`)
  let fd
  let linked = false
  try {
    fd = openSync(temporary, 'wx', 0o600)
    writeFileSync(fd, bytes)
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    linkSync(temporary, target)
    linked = true
    unlinkSync(temporary)
    const directoryFd = openSync(parent, 'r')
    try { fsyncSync(directoryFd) } finally { closeSync(directoryFd) }
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd) } catch {}
    }
    try { if (existsSync(temporary)) unlinkSync(temporary) } catch {}
    if (!linked && existsSync(target)) fail('canonical waived self-review already exists; replacement is forbidden')
    fail(`canonical waived self-review cannot be published atomically:${error.message}`)
  }
}

export function importWaivedSelfReviewBundle({
  repoRoot = process.cwd(),
  explicitRoot = null,
  inputPath,
} = {}) {
  if (process.env.GOVERNANCE_READ_ONLY === '1') fail('GOVERNANCE_READ_ONLY forbids evidence writes')
  const activeRun = loadActiveDeepAuditRun({ repoRoot, explicitRoot, requireCurrent: true })
  const sourcePath = resolveInputPath(activeRun.repository, inputPath)
  const source = readStableRegularJson(sourcePath, '--input')
  validateWaivedSelfReviewBundle(source.value, {
    activeRun,
    tiers: loadAuditCoverageTiers(activeRun.repository),
    repoRoot: activeRun.repository,
  })
  const bytes = Buffer.from(`${stableStringify(source.value, 2)}\n`)
  const target = prepareRuntimeEvidenceFile({
    repoRoot: activeRun.repository,
    explicitRoot,
    relativePath: `deep-audit/runs/${activeRun.manifest.runId}/${WAIVED_REVIEW_PATH}`,
  })
  if (existsSync(target)) fail('canonical waived self-review already exists; replacement is forbidden')
  writeAtomicExclusive(target, bytes)
  const committed = readStableRegularJson(target, 'canonical waived self-review', { requireCanonical: true })
  if (!committed.bytes.equals(bytes)) fail('canonical waived self-review readback differs from the imported bundle')
  validateWaivedSelfReviewBundle(committed.value, {
    activeRun,
    tiers: loadAuditCoverageTiers(activeRun.repository),
    repoRoot: activeRun.repository,
  })
  return {
    runId: activeRun.manifest.runId,
    manifestSha256: activeRun.manifestSha256,
    relativePath: WAIVED_REVIEW_PATH,
    path: target,
    sha256: sha256(bytes),
    bytes: bytes.length,
    bundle: committed.value,
  }
}

export function loadWaivedSelfReviewBundle({
  activeRun,
  explicitRoot = null,
  tiers = null,
} = {}) {
  if (!activeRun?.manifest || !activeRun.repository) fail('activeRun is required')
  const path = resolveRuntimeEvidencePath({
    repoRoot: activeRun.repository,
    explicitRoot,
    relativePath: `deep-audit/runs/${activeRun.manifest.runId}/${WAIVED_REVIEW_PATH}`,
  })
  if (!existsSync(path)) return null
  assertSafeExistingPath(activeRun.runRoot, path, 'canonical waived self-review', { targetKind: 'file' })
  const read = readStableRegularJson(path, 'canonical waived self-review', { requireCanonical: true })
  validateWaivedSelfReviewBundle(read.value, {
    activeRun,
    tiers: tiers ?? loadAuditCoverageTiers(activeRun.repository),
    repoRoot: activeRun.repository,
  })
  return { path, relativePath: WAIVED_REVIEW_PATH, sha256: sha256(read.bytes), bytes: read.bytes.length, bundle: read.value }
}

export const waivedSelfReviewContract = Object.freeze({
  relativePath: WAIVED_REVIEW_PATH,
  evidenceKind: 'deep-audit-waived-self-review',
  assurance: 'self-attested',
  independent: false,
  secondOpinionPerformed: false,
})

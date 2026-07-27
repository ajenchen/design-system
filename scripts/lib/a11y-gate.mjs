import { createHash } from 'node:crypto'
import { compareUtf8Bytes } from './provider-lifecycle.mjs'

function fail(message) {
  throw new Error(`a11y audit gate blocked:${message}`)
}

/** Closed CLI grammar: enforcement/baseline modes always scan the complete Storybook corpus. */
export function parseA11yAuditArgs(argv) {
  if (!Array.isArray(argv) || argv.some(argument => typeof argument !== 'string')) fail('argv must be a string array')
  const parsed = { limit: 0, tag: null, verbose: false, gate: false, writeBaseline: false }
  const seen = new Set()
  for (const argument of argv) {
    let key
    if (['--verbose', '--gate', '--baseline-write'].includes(argument)) key = argument
    else if (argument.startsWith('--story=')) key = '--story'
    else if (argument.startsWith('--tag=')) key = '--tag'
    else fail(`unknown argument:${argument}`)
    if (seen.has(key)) fail(`duplicate argument:${key}`)
    seen.add(key)

    if (argument === '--verbose') parsed.verbose = true
    else if (argument === '--gate') parsed.gate = true
    else if (argument === '--baseline-write') parsed.writeBaseline = true
    else if (key === '--story') {
      const value = argument.slice('--story='.length)
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) fail(`invalid story limit:${value}`)
      parsed.limit = Number(value)
    } else {
      const value = argument.slice('--tag='.length)
      if (!value || /[\0\r\n]/.test(value)) fail('tag must be a non-empty single-line value')
      parsed.tag = value
    }
  }
  if (parsed.gate && parsed.writeBaseline) fail('--gate and --baseline-write are mutually exclusive')
  if ((parsed.gate || parsed.writeBaseline) && (parsed.limit > 0 || parsed.tag !== null)) {
    fail('gate and baseline-write modes must scan the complete unfiltered story corpus')
  }
  return Object.freeze(parsed)
}

/** Scan transport/render failures are blockers in baseline-write, regression, and severity modes. */
export function evaluateA11yScanIntegrity(violationsByStory) {
  createA11yFingerprintMap(violationsByStory)
  const auditErrors = Object.entries(violationsByStory)
    .filter(([, violations]) => violations.some(violation => violation.id === 'audit-error'))
    .map(([storyId]) => storyId)
    .sort()
  return { ok: auditErrors.length === 0, auditErrors }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} must be a positive safe integer`)
  return value
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer`)
  return value
}

function fingerprintKey(storyId, ruleId) {
  if (typeof storyId !== 'string' || !storyId || storyId.includes('|') || /[\0\n\r]/.test(storyId)) {
    fail('story id must be a non-empty delimiter-safe string')
  }
  if (typeof ruleId !== 'string' || !ruleId || ruleId.includes('|') || /[\0\n\r]/.test(ruleId)) {
    fail(`${storyId} rule id must be a non-empty delimiter-safe string`)
  }
  return `${storyId}|${ruleId}`
}

function validateStoryId(storyId, label = 'story id') {
  if (typeof storyId !== 'string' || !storyId || storyId.includes('|') || /[\0\n\r]/.test(storyId)) {
    fail(`${label} must be a non-empty delimiter-safe string`)
  }
  return storyId
}

/** Canonical corpus identity used by both baseline writes and regression checks. */
export function createA11yStoryCorpus(storyIds) {
  if (!Array.isArray(storyIds)) fail('scannedStoryIds must be an array')
  const normalized = storyIds.map((storyId, index) => validateStoryId(storyId, `scannedStoryIds[${index}]`)).sort()
  if (normalized.length === 0) fail('scannedStoryIds must not be empty')
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) fail(`duplicate scanned story id:${normalized[index]}`)
  }
  return Object.freeze({
    storyIds: Object.freeze(normalized),
    storyIdsSha256: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
  })
}

/**
 * Collapse axe violations to the governed baseline key:
 * `storyId|ruleId -> violating node count`.
 *
 * Infrastructure scan errors stay visible to the caller but are deliberately
 * outside the WCAG regression fingerprint, matching the production gate's
 * documented policy.
 */
export function createA11yFingerprintMap(violationsByStory) {
  if (!isRecord(violationsByStory)) fail('violationsByStory must be an object')
  const fingerprints = new Map()
  for (const [storyId, violations] of Object.entries(violationsByStory)) {
    if (!Array.isArray(violations)) fail(`${storyId} violations must be an array`)
    for (const [index, violation] of violations.entries()) {
      if (!isRecord(violation)) fail(`${storyId} violation ${index} must be an object`)
      const key = fingerprintKey(storyId, violation.id)
      positiveInteger(violation.nodes, `${key} nodes`)
      if (violation.id === 'audit-error') continue
      fingerprints.set(key, (fingerprints.get(key) || 0) + violation.nodes)
    }
  }
  return Object.fromEntries([...fingerprints.entries()].sort(([left], [right]) => compareUtf8Bytes(left, right)))
}

function validateBaselineFingerprints(baselineDocument) {
  if (!isRecord(baselineDocument) || !isRecord(baselineDocument.fingerprints)) {
    fail('baseline must contain a fingerprints object')
  }
  const baseline = {}
  for (const [key, count] of Object.entries(baselineDocument.fingerprints)) {
    const parts = key.split('|')
    if (parts.length !== 2) fail(`baseline fingerprint key is invalid:${key}`)
    fingerprintKey(parts[0], parts[1])
    baseline[key] = positiveInteger(count, `baseline ${key}`)
  }
  return baseline
}

function validateBaselineCorpus(baselineDocument) {
  if (!isRecord(baselineDocument?._meta)) fail('baseline must contain a _meta object')
  const storyIds = baselineDocument._meta.storyIds
  if (!Array.isArray(storyIds)) fail('baseline _meta.storyIds must be an array')
  const canonical = createA11yStoryCorpus(storyIds)
  if (storyIds.some((storyId, index) => storyId !== canonical.storyIds[index])) {
    fail('baseline _meta.storyIds must be sorted')
  }
  if (baselineDocument._meta.stories !== canonical.storyIds.length) {
    fail('baseline _meta.stories must equal the full storyIds corpus length')
  }
  if (baselineDocument._meta.storyIdsSha256 !== canonical.storyIdsSha256) {
    fail('baseline _meta.storyIdsSha256 does not match the full sorted storyIds corpus')
  }
  return canonical
}

/** Compare real axe output with the immutable governance baseline. */
export function evaluateA11yRegressionGate({ violationsByStory, baselineDocument, scannedStoryIds }) {
  const currentFingerprints = createA11yFingerprintMap(violationsByStory)
  const baselineFingerprints = validateBaselineFingerprints(baselineDocument)
  const currentCorpus = createA11yStoryCorpus(scannedStoryIds)
  const baselineCorpus = validateBaselineCorpus(baselineDocument)
  const currentSet = new Set(currentCorpus.storyIds)
  for (const storyId of Object.keys(violationsByStory)) {
    if (!currentSet.has(storyId)) fail(`violationsByStory contains an unscanned story:${storyId}`)
  }
  const baselineSet = new Set(baselineCorpus.storyIds)
  for (const key of Object.keys(baselineFingerprints)) {
    const storyId = key.slice(0, key.indexOf('|'))
    if (!baselineSet.has(storyId)) fail(`baseline fingerprint references a story outside its corpus:${storyId}`)
  }
  const missingStoryIds = baselineCorpus.storyIds.filter(storyId => !currentSet.has(storyId))
  const unexpectedStoryIds = currentCorpus.storyIds.filter(storyId => !baselineSet.has(storyId))
  const corpusMatches = currentCorpus.storyIdsSha256 === baselineCorpus.storyIdsSha256
  const regressions = []
  for (const [key, now] of Object.entries(currentFingerprints)) {
    const base = baselineFingerprints[key] || 0
    if (now > base) regressions.push({ key, base, now })
  }
  const improved = Object.entries(baselineFingerprints)
    .filter(([key]) => !Object.hasOwn(currentFingerprints, key))
    .map(([key, base]) => ({ key, base, now: 0 }))
  const { auditErrors } = evaluateA11yScanIntegrity(violationsByStory)
  return {
    ok: corpusMatches && regressions.length === 0 && auditErrors.length === 0,
    currentFingerprints,
    regressions,
    improved,
    auditErrors,
    corpus: {
      ok: corpusMatches,
      baselineStoryIdsSha256: baselineCorpus.storyIdsSha256,
      currentStoryIdsSha256: currentCorpus.storyIdsSha256,
      missingStoryIds,
      unexpectedStoryIds,
    },
  }
}

/** Default developer-mode gate: critical and serious violations are blocking. */
export function evaluateA11ySeverityGate(results) {
  const severity = results?.summary?.bySeverity
  if (!isRecord(severity)) fail('results summary.bySeverity must be an object')
  const critical = nonNegativeInteger(severity.critical, 'critical severity count')
  const serious = nonNegativeInteger(severity.serious, 'serious severity count')
  const hard = critical + serious
  const { auditErrors } = evaluateA11yScanIntegrity(results?.violationsByStory)
  return { ok: hard === 0 && auditErrors.length === 0, hard, auditErrors }
}

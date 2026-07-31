#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createA11yStoryCorpus,
  evaluateA11yRegressionGate,
  evaluateA11yScanIntegrity,
  evaluateA11ySeverityGate,
  parseA11yAuditArgs,
} from './lib/a11y-gate.mjs'
import { resolveA11yStaticFile } from './lib/a11y-static-server.mjs'

const storyId = 'fixture-button--default'
const ruleId = 'color-contrast'
const fingerprint = `${storyId}|${ruleId}`
const fixtureCorpus = createA11yStoryCorpus([storyId])
const baselineDocument = {
  _meta: {
    purpose: 'closed paired mutation fixture',
    stories: fixtureCorpus.storyIds.length,
    storyIds: fixtureCorpus.storyIds,
    storyIdsSha256: fixtureCorpus.storyIdsSha256,
  },
  fingerprints: { [fingerprint]: 1 },
}
const results = {
  summary: {
    bySeverity: { critical: 0, serious: 0, moderate: 1, minor: 0 },
  },
  violationsByStory: {
    [storyId]: [{ id: ruleId, impact: 'moderate', help: 'fixture contrast', nodes: 1 }],
  },
}
const original = structuredClone(results)

const baseline = evaluateA11yRegressionGate({
  violationsByStory: results.violationsByStory,
  baselineDocument,
  scannedStoryIds: fixtureCorpus.storyIds,
})
assert.equal(baseline.ok, true, 'an unchanged governed fingerprint must pass')
assert.deepEqual(baseline.currentFingerprints, baselineDocument.fingerprints)

try {
  results.violationsByStory[storyId][0].nodes = 2
  const mutated = evaluateA11yRegressionGate({
    violationsByStory: results.violationsByStory,
    baselineDocument,
    scannedStoryIds: fixtureCorpus.storyIds,
  })
  assert.equal(mutated.ok, false, 'an added violating node must fail the regression gate')
  assert.deepEqual(mutated.regressions, [{ key: fingerprint, base: 1, now: 2 }])
} finally {
  results.violationsByStory = structuredClone(original.violationsByStory)
}

const restored = evaluateA11yRegressionGate({
  violationsByStory: results.violationsByStory,
  baselineDocument,
  scannedStoryIds: fixtureCorpus.storyIds,
})
assert.equal(restored.ok, true, 'restoring the exact axe result must restore PASS')
assert.deepEqual(restored.regressions, [])

const defaultBaseline = evaluateA11ySeverityGate(results)
assert.deepEqual(defaultBaseline, { ok: true, hard: 0, auditErrors: [] })
try {
  results.summary.bySeverity.serious = 1
  const defaultMutation = evaluateA11ySeverityGate(results)
  assert.deepEqual(defaultMutation, { ok: false, hard: 1, auditErrors: [] }, 'a serious violation must fail developer mode')
} finally {
  results.summary = structuredClone(original.summary)
}
assert.deepEqual(evaluateA11ySeverityGate(results), { ok: true, hard: 0, auditErrors: [] }, 'severity restore must pass')

const auditErrorViolations = {
  [storyId]: [{ id: 'audit-error', impact: 'serious', help: 'fixture render failure', nodes: 1 }],
}
const auditError = evaluateA11yRegressionGate({
  violationsByStory: auditErrorViolations,
  baselineDocument,
  scannedStoryIds: fixtureCorpus.storyIds,
})
assert.equal(auditError.ok, false, 'an incomplete scan must block the regression gate')
assert.deepEqual(auditError.auditErrors, [storyId], 'infrastructure errors must remain visible')
assert.deepEqual(auditError.currentFingerprints, {}, 'infrastructure errors are not WCAG fingerprints')
assert.deepEqual(
  evaluateA11yScanIntegrity(auditErrorViolations),
  { ok: false, auditErrors: [storyId] },
  'scan integrity must fail closed before baseline-write, gate, or severity decisions',
)
assert.deepEqual(
  evaluateA11ySeverityGate({ summary: original.summary, violationsByStory: auditErrorViolations }),
  { ok: false, hard: 0, auditErrors: [storyId] },
  'developer mode must not treat a render failure as a clean scan',
)

assert.throws(
  () => evaluateA11yRegressionGate({ violationsByStory: {}, baselineDocument: {} }),
  /baseline must contain a fingerprints object/,
  'a malformed baseline must fail closed',
)
assert.throws(
  () => evaluateA11yRegressionGate({
    violationsByStory: { [storyId]: [{ id: ruleId, nodes: 0 }] },
    baselineDocument,
    scannedStoryIds: fixtureCorpus.storyIds,
  }),
  /nodes must be a positive safe integer/,
  'malformed axe output must fail closed',
)

const secondStoryId = 'fixture-input--default'
const twoStoryCorpus = createA11yStoryCorpus([storyId, secondStoryId])
const twoStoryBaseline = {
  _meta: {
    purpose: 'corpus mutation fixture',
    stories: twoStoryCorpus.storyIds.length,
    storyIds: twoStoryCorpus.storyIds,
    storyIdsSha256: twoStoryCorpus.storyIdsSha256,
  },
  fingerprints: baselineDocument.fingerprints,
}
const completeCorpusDecision = evaluateA11yRegressionGate({
  violationsByStory: results.violationsByStory,
  baselineDocument: twoStoryBaseline,
  scannedStoryIds: twoStoryCorpus.storyIds,
})
assert.equal(completeCorpusDecision.ok, true, 'a complete corpus with a passing story omitted from violations must pass')

const missingCorpusDecision = evaluateA11yRegressionGate({
  violationsByStory: results.violationsByStory,
  baselineDocument: twoStoryBaseline,
  scannedStoryIds: [storyId],
})
assert.equal(missingCorpusDecision.ok, false, 'removing a passing story from the scan corpus must fail closed')
assert.deepEqual(missingCorpusDecision.corpus.missingStoryIds, [secondStoryId])

const replacementStoryId = 'fixture-select--default'
const replacedCorpusDecision = evaluateA11yRegressionGate({
  violationsByStory: results.violationsByStory,
  baselineDocument: twoStoryBaseline,
  scannedStoryIds: [storyId, replacementStoryId],
})
assert.equal(replacedCorpusDecision.ok, false, 'same-count story replacement must fail closed')
assert.deepEqual(replacedCorpusDecision.corpus.missingStoryIds, [secondStoryId])
assert.deepEqual(replacedCorpusDecision.corpus.unexpectedStoryIds, [replacementStoryId])

assert.throws(
  () => evaluateA11yRegressionGate({
    violationsByStory: results.violationsByStory,
    baselineDocument: {
      ...twoStoryBaseline,
      _meta: { ...twoStoryBaseline._meta, storyIdsSha256: '0'.repeat(64) },
    },
    scannedStoryIds: twoStoryCorpus.storyIds,
  }),
  /storyIdsSha256 does not match/,
  'a forged corpus digest must fail closed',
)
assert.throws(
  () => evaluateA11yScanIntegrity({ [storyId]: [{ id: 'audit-error', nodes: 0 }] }),
  /nodes must be a positive safe integer/,
  'malformed scan errors must fail closed too',
)

assert.deepEqual(
  parseA11yAuditArgs(['--verbose', '--story=2', '--tag=button']),
  { limit: 2, tag: 'button', verbose: true, gate: false, writeBaseline: false },
)
for (const unsafeArgs of [
  ['--gate', '--story=1'],
  ['--gate', '--tag=button'],
  ['--baseline-write', '--story=1'],
  ['--gate', '--baseline-write'],
  ['--gate', '--gate'],
  ['--unknown'],
  ['--story=0'],
]) {
  assert.throws(() => parseA11yAuditArgs(unsafeArgs), /a11y audit gate blocked/, `unsafe argv must be rejected:${unsafeArgs.join(' ')}`)
}

const staticFixture = realpathSync(mkdtempSync(join(tmpdir(), 'a11y-static-containment-')))
try {
  const root = join(staticFixture, 'storybook-static')
  const siblingSecret = join(staticFixture, 'secret.txt')
  const iframe = join(root, 'iframe.html')
  mkdirSync(root)
  writeFileSync(iframe, '<!doctype html><title>safe</title>')
  writeFileSync(siblingSecret, 'must-not-be-served')
  assert.equal(resolveA11yStaticFile(root, '/iframe.html?x=1', { defaultFile: 'iframe.html' }), iframe)
  assert.equal(resolveA11yStaticFile(root, '/', { defaultFile: 'iframe.html' }), iframe)
  for (const requestUrl of [
    '/../../secret.txt',
    '/%2e%2e/%2e%2e/secret.txt',
    '/%2e%2e%2fsecret.txt',
    '/%ZZ',
  ]) assert.equal(resolveA11yStaticFile(root, requestUrl, { defaultFile: 'iframe.html' }), null, `traversal must reject:${requestUrl}`)
  const symlink = join(root, 'escape.txt')
  symlinkSync(siblingSecret, symlink)
  assert.equal(resolveA11yStaticFile(root, '/escape.txt', { defaultFile: 'iframe.html' }), null, 'symlink escape must reject')
} finally {
  rmSync(staticFixture, { recursive: true, force: true })
}

const canonicalBaseline = JSON.parse(readFileSync(
  fileURLToPath(new URL('../infra/governance/baseline/a11y-baseline.json', import.meta.url)),
  'utf8',
))
const canonicalViolations = {}
for (const [key, nodes] of Object.entries(canonicalBaseline.fingerprints)) {
  const [canonicalStoryId, canonicalRuleId] = key.split('|')
  canonicalViolations[canonicalStoryId] ||= []
  canonicalViolations[canonicalStoryId].push({ id: canonicalRuleId, nodes })
}
assert.equal(
  evaluateA11yRegressionGate({
    violationsByStory: canonicalViolations,
    baselineDocument: canonicalBaseline,
    scannedStoryIds: canonicalBaseline._meta.storyIds,
  }).ok,
  true,
  'the complete governed baseline must remain compatible with the tested comparator',
)

const productionSource = readFileSync(fileURLToPath(new URL('./audit-a11y.mjs', import.meta.url)), 'utf8')
assert.match(productionSource, /evaluateA11yRegressionGate\(\{/, 'production CLI must call the tested regression gate')
assert.match(productionSource, /scannedStoryIds: scanCorpus\.storyIds/, 'production CLI must bind the complete scanned story corpus')
assert.match(productionSource, /completedStoryIds\.push\(s\.id\)/, 'production CLI must record each completed story instead of assuming the manifest was scanned')
assert.match(productionSource, /scanCorpus\.storyIdsSha256 !== expectedScanCorpus\.storyIdsSha256/, 'production CLI must reject an incomplete completed-scan corpus')
assert.match(productionSource, /storyIdsSha256: scanCorpus\.storyIdsSha256/, 'baseline writes must bind the sorted story corpus digest')
assert.match(productionSource, /evaluateA11yScanIntegrity\(results\.violationsByStory\)/, 'production CLI must block scan errors before all output modes')
assert.match(productionSource, /evaluateA11ySeverityGate\(results\)/, 'production CLI must call the tested severity gate')
assert.match(productionSource, /startA11yStaticServer\(\{ rootDirectory: STORYBOOK_DIR/, 'production CLI must use the owned contained server')
assert.match(productionSource, /locator\('#error-message'\)\.textContent\(\)/, 'production CLI must fail closed on Storybook play/render error displays')
assert.match(productionSource, /Storybook error display:/, 'production CLI must classify Storybook error displays as audit errors')
assert.doesNotMatch(productionSource, /--(?:fixture|skip-a11y|mock-axe)\b/, 'production CLI must expose no test bypass')

const smokeSource = readFileSync(fileURLToPath(new URL('./storybook-smoke-test.mjs', import.meta.url)), 'utf8')
assert.match(smokeSource, /stdio:\s*\['ignore',\s*'ignore',\s*'ignore'\]/, 'smoke server must not block on unread child output pipes')
assert.match(smokeSource, /if \(unprobed\.length > 0\)[\s\S]*?exitCode = 1/, 'any unprobed story must fail the smoke gate')
assert.match(smokeSource, /if \(failures\.length === 0 && unprobed\.length === 0\)/, 'smoke success must require complete coverage and zero failures')
assert.doesNotMatch(smokeSource, /unprobed[^\n]*(?:非致命|nonfatal)|(?:非致命|nonfatal)[^\n]*unprobed/i, 'unprobed coverage must never be documented as nonfatal')

const staticServerSource = readFileSync(fileURLToPath(new URL('./lib/a11y-static-server.mjs', import.meta.url)), 'utf8')
assert.match(staticServerSource, /LOOPBACK_HOST = '127\.0\.0\.1'/, 'a11y server must bind explicit IPv4 loopback')
assert.match(staticServerSource, /server\.listen\(0, LOOPBACK_HOST/, 'a11y server must own an ephemeral port')

console.log('✅ a11y paired mutation: regression + scan-integrity + argv + static containment fail closed(no browser/external network)')

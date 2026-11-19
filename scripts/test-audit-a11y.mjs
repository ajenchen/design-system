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
  applyA11yLinuxOnlyBaseline,
  createA11yStoryCorpus,
  evaluateA11yRegressionGate,
  evaluateA11yScanIntegrity,
  evaluateA11ySeverityGate,
  findUnnamedFormControls,
  parseA11yAuditArgs,
  UNNAMED_CONTROL_RULE,
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
// 2026-09-25:渲染完成 / render-health 改由共用的 openStory(lib/launch-browser.mjs)負責 —— 它在導覽前掛監聽、
// 等 Storybook 回報渲染完成、跑 render-health(空畫面 / 錯誤頁 / 關鍵資源失敗 / 頁面例外),等不到就丟例外。
// 這裡鎖的是「每則 story 都走那條路、沒有關掉任何一步、沒有退回睡眠代理、沒量到就 fail closed」。
assert.match(productionSource, /await openStory\(page, url, \{[^}]*notFound: server\.notFound/, 'production CLI must open every story through the shared openStory (render finished + render health) with the 404 ledger')
assert.doesNotMatch(productionSource, /(?:health|requireRenderFinished|fonts): false/, 'production CLI must not switch off any openStory readiness step')
assert.doesNotMatch(productionSource, /waitUntil: 'networkidle'|waitForTimeout\(/, 'production CLI must not use a load / sleep proxy for "the story rendered"')
assert.match(productionSource, /results\.violationsByStory\[s\.id\] = \[\{ id: 'audit-error'/, 'an unrendered story must fail closed as audit-error, never as a WCAG pass')
assert.doesNotMatch(productionSource, /--(?:fixture|skip-a11y|mock-axe)\b/, 'production CLI must expose no test bypass')

const smokeSource = readFileSync(fileURLToPath(new URL('./storybook-smoke-test.mjs', import.meta.url)), 'utf8')
// 2026-09-25:smoke 不再起 python 子行程供檔(那條斷言防的是「子行程輸出管線沒人讀而卡住」),
// 改成行程內的共用伺服器 —— 從本次獨佔的建置快照供檔、帶同源 404 帳本。鎖新的不變式,並確認子行程不會回流。
assert.match(smokeSource, /startA11yStaticServer\(\{ rootDirectory: STATIC_DIR/, 'smoke must serve the build through the shared in-process snapshot server')
assert.doesNotMatch(smokeSource, /\bspawn\(|python3? -m http\.server/, 'smoke must not reintroduce a child static-server process')
assert.match(smokeSource, /if \(unprobed\.length > 0\)[\s\S]*?exitCode = 1/, 'any unprobed story must fail the smoke gate')
assert.match(smokeSource, /if \(failures\.length === 0 && unprobed\.length === 0\)/, 'smoke success must require complete coverage and zero failures')
assert.doesNotMatch(smokeSource, /unprobed[^\n]*(?:非致命|nonfatal)|(?:非致命|nonfatal)[^\n]*unprobed/i, 'unprobed coverage must never be documented as nonfatal')

const staticServerSource = readFileSync(fileURLToPath(new URL('./lib/a11y-static-server.mjs', import.meta.url)), 'utf8')
assert.match(staticServerSource, /LOOPBACK_HOST = '127\.0\.0\.1'/, 'a11y server must bind explicit IPv4 loopback')
assert.match(staticServerSource, /server\.listen\(0, LOOPBACK_HOST/, 'a11y server must own an ephemeral port')

// ── 表單控件的讀屏名稱(2026-10-21 r1b fields N3;axe 不報自建 combobox)──
// 對照組:名稱空白的 combobox / textbox 必算、有名稱 / 被 AX 樹忽略 / 不是表單控件的角色必不算
const axFixture = [
  { role: { value: 'combobox' }, name: { value: '' } }, // 修前 Select 範例:div[role=combobox] 沒有 aria-label、沒有 FieldLabel
  { role: { value: 'textbox' }, name: { value: '  ' } },
  { role: { value: 'combobox' }, name: { value: '商品分類' } },
  { role: { value: 'combobox' }, name: { value: '' }, ignored: true },
  { role: { value: 'button' }, name: { value: '' } },
]
const unnamed = findUnnamedFormControls(axFixture)
assert.equal(unnamed.length, 2, 'blank-named combobox / textbox must be counted; named, ignored and non-form roles must not')
assert.deepEqual(unnamed.map((n) => n.role.value), ['combobox', 'textbox'])
assert.throws(() => findUnnamedFormControls(null), /AX nodes must be an array/, 'a missing AX tree must fail closed, never count as zero unnamed controls')
// 新規則上線後新增的那一格是回歸(基線沒有這個指紋 → 紅)
const unnamedGate = evaluateA11yRegressionGate({
  violationsByStory: { [storyId]: [...structuredClone(original.violationsByStory[storyId]), { id: UNNAMED_CONTROL_RULE, impact: 'serious', help: 'fixture', nodes: 1 }] },
  baselineDocument,
  scannedStoryIds: fixtureCorpus.storyIds,
})
assert.equal(unnamedGate.ok, false, 'a newly unnamed form control must be a regression against the governed baseline')
assert.match(productionSource, /findUnnamedFormControls\(axNodes\)/, 'production CLI must run the tested unnamed-control check on every story')
assert.match(productionSource, /cdp\.send\('Accessibility\.getFullAXTree'\)/, 'production CLI must read the browser-computed AX tree (what a screen reader gets), not a DOM attribute proxy')

// ── --baseline-write 的平台保護(2026-11-20,A123 / A121-F2):只有 Linux 量得到的指紋,別的平台寫基線時保留基線原值 ──
// 錨例:e017c41c 在 macOS 重產基線,把 2f367ee3 寫入的 Linux 實測 23 / 41 寫回 22 / 40 → 只在 Linux 跑的 a11y drift 每天紅。
{
  const linuxKey = `${storyId}|${ruleId}`
  const otherStory = 'fixture-select--default'
  const corpusIds = [storyId, otherStory]
  const linuxCorpus = createA11yStoryCorpus(corpusIds)
  const previous = {
    _meta: { storyIds: linuxCorpus.storyIds, linuxOnly: { [linuxKey]: 'fixture:9px 小標只有 Linux 計入' } },
    fingerprints: { [linuxKey]: 23, [`${otherStory}|${ruleId}`]: 5 },
  }
  const macMeasured = { [linuxKey]: 22, [`${otherStory}|${ruleId}`]: 5 }
  // 對照組(拿掉登記 = 改前的行為):macOS 量到的 22 直接寫進去 —— 這就是 e017c41c 的形狀
  const unguarded = applyA11yLinuxOnlyBaseline({ measuredFingerprints: macMeasured, previousDocument: { ...previous, _meta: { storyIds: linuxCorpus.storyIds } }, platform: 'darwin', storyIds: corpusIds })
  assert.equal(unguarded.fingerprints[linuxKey], 22, 'control: without _meta.linuxOnly a macOS write takes the macOS count')
  // 有登記:macOS 寫基線保留 Linux 的 23,其餘指紋照本機實量
  const mac = applyA11yLinuxOnlyBaseline({ measuredFingerprints: macMeasured, previousDocument: previous, platform: 'darwin', storyIds: corpusIds })
  assert.equal(mac.fingerprints[linuxKey], 23, 'a macOS baseline write must keep the Linux-only value')
  assert.deepEqual(mac.kept, [{ key: linuxKey, measured: 22, kept: 23 }])
  assert.equal(mac.fingerprints[`${otherStory}|${ruleId}`], 5, 'unregistered fingerprints still take the local measurement')
  assert.deepEqual(Object.keys(mac.linuxOnly), [linuxKey], 'the registration must survive a macOS write')
  // macOS 量不到那個指紋(0)也一樣保留
  const macZero = applyA11yLinuxOnlyBaseline({ measuredFingerprints: { [`${otherStory}|${ruleId}`]: 5 }, previousDocument: previous, platform: 'darwin', storyIds: corpusIds })
  assert.equal(macZero.fingerprints[linuxKey], 23, 'a Linux-only fingerprint macOS cannot see at all is still kept')
  // 基線裡沒有 Linux 值可保留 → 拒寫(不准把本機值冒充 Linux 值)
  assert.throws(() => applyA11yLinuxOnlyBaseline({ measuredFingerprints: macMeasured, previousDocument: { ...previous, fingerprints: {} }, platform: 'darwin', storyIds: corpusIds }),
    /沒有它的 Linux 實測值/, 'a registered fingerprint without a stored Linux value must refuse a non-Linux write')
  // Linux 寫基線:照實量;實量裡沒有了 → 登記拿掉
  const linux = applyA11yLinuxOnlyBaseline({ measuredFingerprints: { [linuxKey]: 24, [`${otherStory}|${ruleId}`]: 5 }, previousDocument: previous, platform: 'linux', storyIds: corpusIds })
  assert.equal(linux.fingerprints[linuxKey], 24, 'a Linux write takes the Linux measurement')
  assert.deepEqual(Object.keys(linux.linuxOnly), [linuxKey])
  const linuxGone = applyA11yLinuxOnlyBaseline({ measuredFingerprints: { [`${otherStory}|${ruleId}`]: 5 }, previousDocument: previous, platform: 'linux', storyIds: corpusIds })
  assert.equal(Object.hasOwn(linuxGone.fingerprints, linuxKey), false)
  assert.deepEqual(linuxGone.linuxOnly, {}, 'a Linux write that no longer sees the fingerprint drops its registration')
  // story 已不在掃描範圍 → 登記拿掉
  const removed = applyA11yLinuxOnlyBaseline({ measuredFingerprints: { [`${otherStory}|${ruleId}`]: 5 }, previousDocument: previous, platform: 'darwin', storyIds: [otherStory] })
  assert.deepEqual(removed.linuxOnly, {}, 'a registration whose story left the corpus is dropped')
  assert.throws(() => applyA11yLinuxOnlyBaseline({ measuredFingerprints: macMeasured, previousDocument: { ...previous, _meta: { linuxOnly: { [linuxKey]: '' } } }, platform: 'darwin', storyIds: corpusIds }),
    /must state its reason/, 'a registration without a reason must fail closed')
  // 現行基線:每一筆登記都有正整數的 Linux 值(否則 macOS 上 --baseline-write 會拒寫),而且 macOS 量少一格時保留原值
  for (const [key, reason] of Object.entries(canonicalBaseline._meta.linuxOnly ?? {})) {
    assert.ok(Number.isSafeInteger(canonicalBaseline.fingerprints[key]) && canonicalBaseline.fingerprints[key] > 0, `${key} registered as Linux-only must carry its Linux value`)
    assert.ok(typeof reason === 'string' && reason.trim(), `${key} must state why it is Linux-only`)
    const lower = { ...canonicalBaseline.fingerprints, [key]: canonicalBaseline.fingerprints[key] - 1 }
    const kept = applyA11yLinuxOnlyBaseline({ measuredFingerprints: lower, previousDocument: canonicalBaseline, platform: 'darwin', storyIds: canonicalBaseline._meta.storyIds })
    assert.equal(kept.fingerprints[key], canonicalBaseline.fingerprints[key], `${key} must survive a macOS baseline write`)
  }
  assert.match(productionSource, /applyA11yLinuxOnlyBaseline\(\{[\s\S]*?platform: process\.platform/, 'production --baseline-write must route through the tested Linux-only guard with the real platform')
}

console.log('✅ a11y paired mutation: regression + scan-integrity + argv + static containment fail closed(no browser/external network)')

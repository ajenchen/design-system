#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import * as classifier from '../packages/design-system/ds-canonical/hooks/lib/approval-evidence.mjs'
import {
  AuthorityDecisionEvidenceError,
  prepareAuthorityDecisionReceipt,
  validateAuthorityDecisionReceiptShape,
  verifyAuthorityDecisionReceipt,
} from '../packages/governance/src/authority-decision-evidence.mjs'
import { buildCorpus } from './build-fork-governance.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
// This suite asserts the fail-closed integrity lane of the adapter's authority-decision
// transport; the production default is fail-open.
Object.assign(process.env, { GOVERNANCE_HOOK_STRICT: '1' })
const authorityPolicyBytes = readFileSync(resolve(repoRoot, 'AGENTS.md'))
const classifierPath = resolve(
  repoRoot,
  'packages/design-system/ds-canonical/hooks/lib/approval-evidence.mjs',
)
const receiptContractPath = resolve(
  repoRoot,
  'packages/governance/src/authority-decision-evidence.mjs',
)
const classifierSourceBytes = readFileSync(classifierPath)
const receiptContractSourceBytes = readFileSync(receiptContractPath)
const providerRegistry = JSON.parse(readFileSync(
  resolve(repoRoot, 'packages/governance/canonical/providers.json'),
  'utf8',
))
const target = 'packages/design-system/src/components/Button/button.tsx'
const operationText = 'const nextValue = normalizeValue(value)'
const latestStandingDelegationFixture = readFileSync(resolve(
  repoRoot,
  'scripts/test-fixtures/authority-decision/latest-standing-delegation.txt',
))
assert.equal(latestStandingDelegationFixture.at(-1), 0x0a)
const latestStandingDelegation = latestStandingDelegationFixture
  .subarray(0, latestStandingDelegationFixture.length - 1)
  .toString('utf8')
assert.equal(Buffer.byteLength(latestStandingDelegation), 8_002)
assert.equal(
  createHash('sha256').update(latestStandingDelegation).digest('hex'),
  '22d207434f74458f032f75a35795af970f3af7537263d752d0d532205053458b',
)
const latestScopedAuthorityFixture = readFileSync(resolve(
  repoRoot,
  'scripts/test-fixtures/authority-decision/latest-scoped-authority-clarification.txt',
))
assert.equal(latestScopedAuthorityFixture.at(-1), 0x0a)
const latestScopedAuthority = latestScopedAuthorityFixture
  .subarray(0, latestScopedAuthorityFixture.length - 1)
  .toString('utf8')
assert.equal(Buffer.byteLength(latestScopedAuthority), 3_119)
assert.equal(
  createHash('sha256').update(latestScopedAuthority).digest('hex'),
  '5dd8be410a2e2650fa685a9f99104f282150a75f8e12c43623aac106d7aff066',
)
const authorityPolicyText = authorityPolicyBytes.toString('utf8')
// These pin the two substantive claims of the marked canonical-decision-authority
// block: (1) only the user decides product/UI/UX SSOT tradeoffs and
// user-perceivable/product-semantic changes, and (2) standing AUTO already covers
// implementing approved UI/UX plus mechanical generation/sync. The block was
// compressed to stay inside the discovery budget, so these track the current
// wording and must be updated deliberately whenever that block is rewritten.
assert.match(
  authorityPolicyText,
  /user 只拍板產品／UI／UX SSOT 真取捨及可感知／產品語意變更/u,
)
assert.match(
  authorityPolicyText,
  /含已核准 UI／UX 實作\/機械 generation\/sync/u,
)
const canonicalDelegatedScopes = [
  'consumer-template-adoption',
  'engineering-execution',
  'external-activation',
  'github-configuration',
  'mechanical-approved-ssot-projection',
  'package-release',
  'protected-git-delivery',
  'rollback-recovery',
  'rollout',
  'runtime-certification',
  'testing-and-harness',
]
const canonicalHumanOnlyScopes = [
  'account-holder-platform-action',
  'credential-reference-required',
  'legal-account-organization-business-decision',
  'plan-external-spend',
  'product-ui-ux-decision',
]

function input(overrides = {}) {
  return {
    authorityPolicyBytes,
    classifierSourceBytes,
    receiptContractSourceBytes,
    classifier,
    providerRegistry,
    providerId: 'claude',
    runtimeSurface: 'claude-code/local/authority',
    sessionId: 'session-authority-001',
    scopeNonce: 'scope-authority-001',
    target,
    operationText,
    userMessages: ['請修復 Button 的 TypeScript null bug'],
    ...overrides,
  }
}

function receipt(overrides = {}) {
  return prepareAuthorityDecisionReceipt(input(overrides))
}

function errorCode(code) {
  return (error) => error instanceof AuthorityDecisionEvidenceError && error.code === code
}

const deterministic = receipt()
assert.deepEqual(receipt(), deterministic, 'identical scope must produce byte-stable receipt data')
assert.equal(validateAuthorityDecisionReceiptShape(deterministic), true)
assert.equal(verifyAuthorityDecisionReceipt({ receipt: deterministic, ...input() }), true)
assert.equal(deterministic.schemaVersion, 2)
assert.equal(deterministic.classification.decision, 'approved')
assert.equal(deterministic.classification.decisionDomain, 'engineering-remediation')
assert.deepEqual(deterministic.classification.allowedScopes, canonicalDelegatedScopes)
assert.deepEqual(deterministic.classification.humanOnlyScopes, canonicalHumanOnlyScopes)
assert.deepEqual(deterministic.classification.deniedOrAmbiguousScopes, [])
assert.equal(deterministic.trust.contentAddressed, true)
assert.equal(deterministic.trust.runtimeCertification, 'not-certified')
assert.equal(deterministic.trust.promotionEligible, false)
assert.equal(JSON.stringify(deterministic).includes(input().userMessages[0]), false)
assert.equal(JSON.stringify(deterministic).includes(operationText), false)

const providerReceipts = [
  ['claude', 'claude-code/local/authority'],
  ['codex', 'codex-desktop/local/authority'],
  ['generic', 'generic/ci/authority'],
  ['codex', 'codex/cloud/authority'],
  ['generic', 'generic/remote/authority'],
].map(([providerId, runtimeSurface]) => receipt({ providerId, runtimeSurface }))
for (const candidate of providerReceipts) {
  assert.deepEqual(
    candidate.classification,
    deterministic.classification,
    'provider adapters must consume one classifier result',
  )
  assert.equal(candidate.trust.runtimeCertification, 'not-certified')
}
assert.equal(new Set(providerReceipts.map((candidate) => candidate.receiptDigest)).size, 5)

const uiOperation = 'return <button className="hover:bg-blue-500" />'
const uiOperationDigest = createHash('sha256').update(uiOperation).digest('hex')
const exactUi = receipt({
  operationText: uiOperation,
  userMessages: [`Button hover 顏色採用藍色 operation sha256:${uiOperationDigest}`],
})
assert.equal(exactUi.classification.decision, 'approved')
assert.equal(exactUi.classification.decisionDomain, 'product-ui-ux')
assert.equal(exactUi.classification.reasonCode, 'TARGET_BOUND_UI_UX_DECISION_APPROVED')

const unresolvedUi = receipt({
  operationText: uiOperation,
  userMessages: ['請修復 Button hover bug 但紅色還是藍色由你自行決定'],
})
assert.equal(unresolvedUi.classification.decision, 'blocked')
assert.equal(unresolvedUi.classification.reasonCode, 'TARGET_BOUND_DISCUSSION_OR_QUESTION')

const mixedAuthorityBoundary = receipt({
  target: 'governance/authority-decision',
  operationText: 'reconcile the canonical engineering authority policy',
  userMessages: [
    '所有產品 UI／UX SSOT 方向保留給使用者。\n所有純工程與治理決策均已委派給 agent，由 agent 自行判斷。',
  ],
})
assert.equal(mixedAuthorityBoundary.classification.decision, 'approved')
assert.equal(mixedAuthorityBoundary.classification.decisionDomain, 'engineering-remediation')
assert.deepEqual(mixedAuthorityBoundary.classification.allowedScopes, canonicalDelegatedScopes)
assert.deepEqual(mixedAuthorityBoundary.classification.humanOnlyScopes, canonicalHumanOnlyScopes)
assert.deepEqual(mixedAuthorityBoundary.classification.deniedOrAmbiguousScopes, [])

const mixedAuthorityWithExplicitUiReservation = receipt({
  target: 'governance/authority-decision',
  operationText: 'record the production deployment profile and execute the delegated engineering release without changing product or UI UX semantics',
  userMessages: [
    [
      '所有純工程、治理、GitHub、package、template、WM 與 rollout 工作均已委派給 agent。',
      '所有 UI／UX 與產品語意仍由使用者拍板。',
      '未經我拍板，不得由 agent 自行：',
      '- 在多個合理 UI／UX 方案中自行選擇',
      '請直接完成已委派的 engineering release；不要改變 UI／UX SSOT。',
    ].join('\n\n'),
  ],
})
assert.equal(mixedAuthorityWithExplicitUiReservation.classification.decision, 'approved')
assert.equal(
  mixedAuthorityWithExplicitUiReservation.classification.decisionDomain,
  'engineering-remediation',
)
assert.deepEqual(
  mixedAuthorityWithExplicitUiReservation.classification.allowedScopes,
  canonicalDelegatedScopes,
)
assert.deepEqual(
  mixedAuthorityWithExplicitUiReservation.classification.humanOnlyScopes,
  canonicalHumanOnlyScopes,
)
assert.deepEqual(
  mixedAuthorityWithExplicitUiReservation.classification.deniedOrAmbiguousScopes,
  [],
)

const delegatedReleaseWithImmutableVersionGuardrail = receipt({
  target: 'governance/authority-decision',
  operationText: 'publish the delegated package release without changing product semantics',
  userMessages: [
    'package release 已委派給 agent。不得覆蓋既有版本，也不得違反 npm immutable-version semantics 重發同一版本。',
  ],
})
assert.equal(delegatedReleaseWithImmutableVersionGuardrail.classification.decision, 'approved')
assert.ok(
  delegatedReleaseWithImmutableVersionGuardrail.classification.allowedScopes.includes(
    'package-release',
  ),
)
assert.ok(
  !delegatedReleaseWithImmutableVersionGuardrail.classification.deniedOrAmbiguousScopes.includes(
    'package-release',
  ),
)

const deferredSoakDoesNotRevokeRelease = receipt({
  target: 'governance/authority-decision',
  operationText: 'record the non-blocking deferred soak supplement and continue the delegated release flow',
  userMessages: [
    [
      '72 小時 soak 不得作為正式發布、template adoption、WM 可用或 production-grade release completion 的阻塞條件。',
      '發布完成後標記為 RELEASED_VALIDATED_SOAK_DEFERRED，不得將其描述為尚未發布或不可使用。',
      '未完成 soak 不得阻止 package 使用、setup:all、sync-all、template consumer、WM、GitHub／npm 正式發布。',
    ].join('\n\n'),
  ],
})
assert.equal(deferredSoakDoesNotRevokeRelease.classification.decision, 'approved')
for (const scope of ['package-release', 'consumer-template-adoption', 'rollout']) {
  assert.ok(deferredSoakDoesNotRevokeRelease.classification.allowedScopes.includes(scope))
  assert.ok(!deferredSoakDoesNotRevokeRelease.classification.deniedOrAmbiguousScopes.includes(scope))
}

const unresolvedUiAcrossClauses = receipt({
  operationText: uiOperation,
  userMessages: ['Button 顏色需要調整。由你自行決定哪個比較好。'],
})
assert.equal(unresolvedUiAcrossClauses.classification.decision, 'blocked')
assert.equal(
  unresolvedUiAcrossClauses.classification.reasonCode,
  'TARGET_BOUND_DISCUSSION_OR_QUESTION',
)
assert.ok(
  unresolvedUiAcrossClauses.classification.deniedOrAmbiguousScopes.includes(
    'product-ui-ux-change',
  ),
)
assert.deepEqual(
  unresolvedUiAcrossClauses.classification.humanOnlyScopes,
  canonicalHumanOnlyScopes,
)

const exactStandingDelegationInput = {
  target: 'governance/authority-decision',
  operationText: 'record the latest standing engineering delegation as content-addressed canonical authority evidence without modifying repository source, index, or external systems',
  userMessages: [latestStandingDelegation],
}
const exactStandingDelegation = receipt(exactStandingDelegationInput)
assert.equal(exactStandingDelegation.classificationMode, 'user-context')
assert.equal(exactStandingDelegation.classification.decision, 'approved')
assert.equal(exactStandingDelegation.classification.decisionDomain, 'engineering-remediation')
assert.equal(
  exactStandingDelegation.classification.reasonCode,
  'ENGINEERING_REMEDIATION_NO_HUMAN_APPROVAL',
)

const exactStandingDelegationParity = [
  ['claude', 'claude-code/local/authority'],
  ['codex', 'codex-desktop/local/authority'],
  ['generic', 'generic/ci/authority'],
  ['codex', 'codex/cloud/authority'],
  ['generic', 'generic/remote/authority'],
].map(([providerId, runtimeSurface]) => receipt({
  ...exactStandingDelegationInput,
  providerId,
  runtimeSurface,
}))
for (const candidate of exactStandingDelegationParity) {
  assert.deepEqual(
    candidate.classification,
    exactStandingDelegation.classification,
    'the exact standing delegation must classify identically across provider surfaces',
  )
}

const scopedAuthorityEngineeringInput = {
  target: 'governance/authority-decision',
  operationText: 'reconcile the canonical authority classifier without changing product semantics',
  userMessages: [latestScopedAuthority],
}
const scopedAuthorityEngineering = receipt(scopedAuthorityEngineeringInput)
assert.equal(scopedAuthorityEngineering.classification.decision, 'approved')
assert.equal(
  scopedAuthorityEngineering.classification.decisionDomain,
  'engineering-remediation',
)
assert.deepEqual(
  scopedAuthorityEngineering.classification.allowedScopes,
  canonicalDelegatedScopes,
)
assert.deepEqual(
  scopedAuthorityEngineering.classification.humanOnlyScopes,
  canonicalHumanOnlyScopes,
)
assert.deepEqual(scopedAuthorityEngineering.classification.deniedOrAmbiguousScopes, [])

const scopedAuthorityUi = receipt({
  operationText: uiOperation,
  userMessages: [latestScopedAuthority],
})
assert.equal(scopedAuthorityUi.classification.decision, 'blocked')
assert.equal(scopedAuthorityUi.classification.decisionDomain, 'product-ui-ux')
assert.deepEqual(scopedAuthorityUi.classification.allowedScopes, canonicalDelegatedScopes)
assert.deepEqual(scopedAuthorityUi.classification.humanOnlyScopes, canonicalHumanOnlyScopes)
assert.deepEqual(
  scopedAuthorityUi.classification.deniedOrAmbiguousScopes,
  ['product-ui-ux-change'],
)

const scopedAuthorityUserVisibleSemantics = receipt({
  operationText: 'const navigationFlow = "new-checkout"',
  userMessages: [latestScopedAuthority],
})
assert.equal(scopedAuthorityUserVisibleSemantics.classification.decision, 'blocked')
assert.equal(
  scopedAuthorityUserVisibleSemantics.classification.decisionDomain,
  'product-ui-ux',
)
assert.deepEqual(
  scopedAuthorityUserVisibleSemantics.classification.deniedOrAmbiguousScopes,
  ['product-ui-ux-change'],
)

const mechanicalApprovedSsotProjection = receipt({
  target: 'governance/generated/control-plane.json',
  operationText: 'mechanically generate and sync already-approved canonical SSOT projections',
  userMessages: [latestScopedAuthority],
})
assert.equal(mechanicalApprovedSsotProjection.classification.decision, 'approved')
assert.equal(
  mechanicalApprovedSsotProjection.classification.decisionDomain,
  'engineering-remediation',
)
assert.ok(
  mechanicalApprovedSsotProjection.classification.allowedScopes.includes(
    'mechanical-approved-ssot-projection',
  ),
)
assert.deepEqual(
  mechanicalApprovedSsotProjection.classification.humanOnlyScopes,
  canonicalHumanOnlyScopes,
)
assert.deepEqual(
  mechanicalApprovedSsotProjection.classification.deniedOrAmbiguousScopes,
  [],
)

const scopedAuthorityProviderParity = [
  ['claude', 'claude-code/local/authority'],
  ['codex', 'codex-desktop/local/authority'],
  ['generic', 'generic/ci/authority'],
  ['codex', 'codex/cloud/authority'],
  ['generic', 'generic/remote/authority'],
].map(([providerId, runtimeSurface]) => receipt({
  ...scopedAuthorityEngineeringInput,
  providerId,
  runtimeSurface,
}))
for (const candidate of scopedAuthorityProviderParity) {
  assert.equal(candidate.schemaVersion, 2)
  assert.deepEqual(
    candidate.classification,
    scopedAuthorityEngineering.classification,
    'scoped partial delegation must remain provider- and surface-neutral',
  )
}
assert.equal(unresolvedUi.trust.promotionEligible, false)

const denialPrecedence = receipt({
  operationText: uiOperation,
  userMessages: [
    `Button hover 顏色採用藍色 operation sha256:${uiOperationDigest}`,
    '撤銷 Button 的 UI 修改核准，先不要修改 Button',
  ],
})
assert.equal(denialPrecedence.classification.decision, 'blocked')
assert.equal(denialPrecedence.classification.reasonCode, 'TARGET_BOUND_DENIAL_OR_REVOCATION')

const continuation = receipt({
  userMessages: ['請修復 Button 的 TypeScript null bug', 'go ahead'],
})
assert.equal(continuation.classification.decision, 'approved')
assert.equal(continuation.classification.decisionDomain, 'engineering-remediation')

const operationOnlyEngineering = receipt({
  target: 'infra/governance/lib/example.mjs',
  operationText: 'const verified = true',
  userMessages: [],
})
assert.equal(operationOnlyEngineering.classificationMode, 'operation-only')
assert.equal(operationOnlyEngineering.classification.decision, 'approved')
assert.equal(operationOnlyEngineering.classification.reasonCode, 'ENGINEERING_OPERATION_STANDING_AUTHORIZATION')

const operationOnlyProduct = receipt({ userMessages: [] })
assert.equal(operationOnlyProduct.classification.decision, 'blocked')
assert.equal(operationOnlyProduct.classification.reasonCode, 'PROVIDER_AUTHORITY_EVIDENCE_REQUIRED')

const governanceActionFamilies = [
  'protected-git-delivery',
  'external-activation',
  'github-reconciliation',
  'release-train',
  'consumer-bootstrap',
  'consumer-control-plane-update',
  'fleet-rollout',
  'runtime-certification',
  'rollback-recovery',
]
const governanceActionTarget = (family, operation, authorityDigest = 'a'.repeat(64)) => (
  `governance-action/v1/${family}/sha256:${authorityDigest}/sha256:${
    createHash('sha256').update(operation).digest('hex')
  }`
)
for (const family of governanceActionFamilies) {
  const externalOperation = `apply exact signed ${family} plan after canonical hard gates pass`
  const external = receipt({
    target: governanceActionTarget(family, externalOperation),
    operationText: externalOperation,
    userMessages: [],
  })
  assert.equal(external.classificationMode, 'operation-only')
  assert.equal(external.classification.decision, 'approved')
  assert.equal(external.classification.reasonCode, 'ENGINEERING_OPERATION_STANDING_AUTHORIZATION')
  assert.equal(external.trust.runtimeCertification, 'not-certified')
  assert.equal(external.trust.promotionEligible, false)
}

const partialDelegationMessage =
  '只委派測試與 Harness；release 與 push 不授權。產品 UI／UX 保留給我。'
const partialProtectedOperation =
  'apply exact signed protected Git delivery plan after canonical hard gates pass'
const partialProtectedInput = {
  target: governanceActionTarget('protected-git-delivery', partialProtectedOperation),
  operationText: partialProtectedOperation,
  userMessages: [partialDelegationMessage],
}
const partialProtected = receipt(partialProtectedInput)
assert.equal(partialProtected.classification.decision, 'blocked')
assert.equal(
  partialProtected.classification.reasonCode,
  'ENGINEERING_SCOPE_DENIED_OR_NOT_DELEGATED',
)
assert.deepEqual(
  partialProtected.classification.allowedScopes,
  ['testing-and-harness'],
)
assert.deepEqual(partialProtected.classification.humanOnlyScopes, canonicalHumanOnlyScopes)
assert.ok(
  partialProtected.classification.deniedOrAmbiguousScopes.includes(
    'protected-git-delivery',
  ),
)
assert.ok(
  partialProtected.classification.deniedOrAmbiguousScopes.includes('package-release'),
)

const partialTesting = receipt({
  target: 'scripts/authority-scope.test.mjs',
  operationText: 'run the focused test and Harness verification',
  userMessages: [partialDelegationMessage],
})
assert.equal(partialTesting.classification.decision, 'approved')
assert.deepEqual(partialTesting.classification.allowedScopes, ['testing-and-harness'])
assert.deepEqual(partialTesting.classification.humanOnlyScopes, canonicalHumanOnlyScopes)
assert.ok(
  partialTesting.classification.deniedOrAmbiguousScopes.includes(
    'protected-git-delivery',
  ),
)

for (const conflictMessage of [
  'push 已委派；push 不授權。',
  'push 不授權；push 已委派。',
]) {
  const conflict = receipt({
    ...partialProtectedInput,
    userMessages: [conflictMessage],
  })
  assert.equal(conflict.classification.decision, 'blocked')
  assert.equal(
    conflict.classification.reasonCode,
    'ENGINEERING_SCOPE_DENIED_OR_NOT_DELEGATED',
  )
  assert.ok(
    conflict.classification.deniedOrAmbiguousScopes.includes(
      'protected-git-delivery',
    ),
  )
}

const broadDelegationWithScopedDenial =
  'all engineering delegated, but do not push/publish'
const deniedProtectedDelivery = receipt({
  ...partialProtectedInput,
  userMessages: [broadDelegationWithScopedDenial],
})
assert.equal(deniedProtectedDelivery.classification.decision, 'blocked')
assert.equal(
  deniedProtectedDelivery.classification.reasonCode,
  'ENGINEERING_SCOPE_DENIED_OR_NOT_DELEGATED',
)
assert.ok(
  deniedProtectedDelivery.classification.deniedOrAmbiguousScopes.includes(
    'protected-git-delivery',
  ),
)
assert.ok(
  deniedProtectedDelivery.classification.deniedOrAmbiguousScopes.includes(
    'package-release',
  ),
)
const unrelatedTestingAfterScopedDenial = receipt({
  target: 'scripts/authority-scope.test.mjs',
  operationText: 'run the focused tests and Harness',
  userMessages: [broadDelegationWithScopedDenial],
})
assert.equal(unrelatedTestingAfterScopedDenial.classification.decision, 'approved')
assert.ok(
  unrelatedTestingAfterScopedDenial.classification.allowedScopes.includes(
    'testing-and-harness',
  ),
)
assert.ok(
  unrelatedTestingAfterScopedDenial.classification.deniedOrAmbiguousScopes.includes(
    'protected-git-delivery',
  ),
)

const partialDelegationProviderParity = [
  ['claude', 'claude-code/local/authority'],
  ['codex', 'codex-desktop/local/authority'],
  ['generic', 'generic/ci/authority'],
].map(([providerId, runtimeSurface]) => receipt({
  ...partialProtectedInput,
  providerId,
  runtimeSurface,
}))
for (const candidate of partialDelegationProviderParity) {
  assert.deepEqual(
    candidate.classification,
    partialProtected.classification,
    'same-scope engineering denial must be provider-neutral',
  )
}

const externalAuthorityOperation = 'apply exact signed protected Git delivery plan after all hard gates pass'
const externalAuthorityTarget = governanceActionTarget(
  'protected-git-delivery',
  externalAuthorityOperation,
)
const externalProviderReceipts = [
  ['claude', 'claude-code-cli/local/authority'],
  ['codex', 'codex-cli/local/authority'],
  ['codex', 'codex-desktop/local/authority'],
  ['codex', 'codex-desktop/remote-control/authority'],
  ['codex', 'codex-cloud/cloud/authority'],
  ['claude', 'claude-code-cloud/cloud/authority'],
  ['claude', 'claude-code-cli/remote-control/authority'],
  ['generic', 'github-actions/github-actions/authority'],
].map(([providerId, runtimeSurface]) => receipt({
  providerId,
  runtimeSurface,
  target: externalAuthorityTarget,
  operationText: externalAuthorityOperation,
  userMessages: [],
}))
for (const candidate of externalProviderReceipts) {
  assert.equal(candidate.classification.decision, 'approved')
  assert.equal(candidate.classification.reasonCode, 'ENGINEERING_OPERATION_STANDING_AUTHORIZATION')
  assert.equal(candidate.trust.runtimeCertification, 'not-certified')
  assert.equal(candidate.trust.promotionEligible, false)
}
assert.equal(new Set(externalProviderReceipts.map(candidate => candidate.receiptDigest)).size, 8)

const malformedExternalTarget = receipt({
  target: `governance-action/v1/unknown-family/sha256:${'a'.repeat(64)}/sha256:${'b'.repeat(64)}`,
  operationText: externalAuthorityOperation,
  userMessages: [],
})
assert.equal(malformedExternalTarget.classification.decision, 'blocked')
assert.equal(malformedExternalTarget.classification.reasonCode, 'EXTERNAL_ENGINEERING_TARGET_INVALID')

const substitutedExternalDigest = receipt({
  target: `governance-action/v1/protected-git-delivery/sha256:${'a'.repeat(64)}/sha256:${'b'.repeat(64)}`,
  operationText: externalAuthorityOperation,
  userMessages: [],
})
assert.equal(substitutedExternalDigest.classification.decision, 'blocked')
assert.equal(
  substitutedExternalDigest.classification.reasonCode,
  'EXTERNAL_ENGINEERING_OPERATION_DIGEST_MISMATCH',
)

const rawExternalTarget = receipt({
  target: 'https://github.com/ajenchen/design-system/pull/42',
  operationText: externalAuthorityOperation,
  userMessages: [],
})
assert.equal(rawExternalTarget.classification.decision, 'blocked')
assert.equal(rawExternalTarget.classification.reasonCode, 'PROVIDER_AUTHORITY_EVIDENCE_REQUIRED')

const externalUiOperation = 'set Button className color to blue'
const externalUi = receipt({
  target: governanceActionTarget('protected-git-delivery', externalUiOperation),
  operationText: externalUiOperation,
  userMessages: [],
})
assert.equal(externalUi.classification.decision, 'blocked')
assert.equal(externalUi.classification.reasonCode, 'EXACT_UI_UX_TARGET_BINDING_MISSING')

const externalHumanAction = 'complete OAuth consent in the organization owner account'
const humanOnlyExternal = receipt({
  target: governanceActionTarget('external-activation', externalHumanAction),
  operationText: externalHumanAction,
  userMessages: [],
})
assert.equal(humanOnlyExternal.classification.decision, 'blocked')
assert.equal(humanOnlyExternal.classification.reasonCode, 'HUMAN_ONLY_ACTION_REQUIRED')

const destructiveExternalOperation = 'git push --force origin HEAD:main'
const destructiveExternal = receipt({
  target: governanceActionTarget('protected-git-delivery', destructiveExternalOperation),
  operationText: destructiveExternalOperation,
  userMessages: [],
})
assert.equal(destructiveExternal.classification.decision, 'blocked')
assert.equal(destructiveExternal.classification.reasonCode, 'ENGINEERING_SAFETY_GATE_REQUIRED')

const externalDenial = receipt({
  target: externalAuthorityTarget,
  operationText: externalAuthorityOperation,
  userMessages: [`先不要執行 ${externalAuthorityTarget}`],
})
assert.equal(externalDenial.classification.decision, 'blocked')
assert.equal(externalDenial.classification.reasonCode, 'TARGET_BOUND_DENIAL_OR_REVOCATION')

const externalDeterministic = receipt({
  target: externalAuthorityTarget,
  operationText: externalAuthorityOperation,
  userMessages: [],
})
assert.deepEqual(receipt({
  target: externalAuthorityTarget,
  operationText: externalAuthorityOperation,
  userMessages: [],
}), externalDeterministic)
assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: externalDeterministic,
    ...input({
      target: externalAuthorityTarget,
      operationText: `${externalAuthorityOperation} substituted`,
      userMessages: [],
    }),
  }),
  errorCode('OPERATION_SUBSTITUTION'),
)

assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: deterministic,
    ...input({ scopeNonce: 'scope-authority-replay' }),
  }),
  errorCode('REPLAY_OR_SCOPE_MISMATCH'),
)
assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: deterministic,
    ...input({ target: 'packages/design-system/src/components/Input/input.tsx' }),
  }),
  errorCode('TARGET_SUBSTITUTION'),
)
assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: deterministic,
    ...input({ operationText: 'const substituted = true' }),
  }),
  errorCode('OPERATION_SUBSTITUTION'),
)
assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: deterministic,
    ...input({ providerId: 'codex', runtimeSurface: 'claude-code/local/authority' }),
  }),
  errorCode('PROVIDER_SUBSTITUTION'),
)
assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: deterministic,
    ...input({ runtimeSurface: 'claude-code/remote/authority' }),
  }),
  errorCode('RUNTIME_SURFACE_SUBSTITUTION'),
)
assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: deterministic,
    ...input({ userMessages: ['請修復 Input 的 TypeScript null bug'] }),
  }),
  errorCode('AUTHORITY_CONTEXT_SUBSTITUTION'),
)

const staleAuthorityPolicyBytes = Buffer.from(
  authorityPolicyBytes.toString('utf8').replace(
    '<!-- canonical-decision-authority:end -->',
    '\nAuthority test-only stale mutation.\n<!-- canonical-decision-authority:end -->',
  ),
)
assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: deterministic,
    ...input({ authorityPolicyBytes: staleAuthorityPolicyBytes }),
  }),
  errorCode('AUTHORITY_POLICY_STALE'),
)
assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: deterministic,
    ...input({ classifierSourceBytes: Buffer.concat([classifierSourceBytes, Buffer.from('\n// stale\n')]) }),
  }),
  errorCode('CLASSIFIER_STALE'),
)
const staleRegistry = structuredClone(providerRegistry)
staleRegistry.providers.find((provider) => provider.id === 'claude').displayName += ' stale'
assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: deterministic,
    ...input({ providerRegistry: staleRegistry }),
  }),
  errorCode('PROVIDER_REGISTRY_STALE'),
)
assert.throws(
  () => verifyAuthorityDecisionReceipt({
    receipt: deterministic,
    ...input({ receiptContractSourceBytes: Buffer.concat([receiptContractSourceBytes, Buffer.from('\n// stale\n')]) }),
  }),
  errorCode('RECEIPT_CONTRACT_STALE'),
)
assert.throws(() => receipt({ providerId: 'unknown' }), errorCode('PROVIDER_UNKNOWN'))

const digestTamper = structuredClone(deterministic)
digestTamper.classification.reasonCode = 'TAMPERED'
assert.throws(() => validateAuthorityDecisionReceiptShape(digestTamper), errorCode('RECEIPT_DIGEST_MISMATCH'))
const shapeTamper = { ...deterministic, undeclared: true }
assert.throws(() => validateAuthorityDecisionReceiptShape(shapeTamper), errorCode('RECEIPT_SHAPE_INVALID'))
const openClassificationTamper = structuredClone(deterministic)
openClassificationTamper.classification.undeclared = true
assert.throws(
  () => validateAuthorityDecisionReceiptShape(openClassificationTamper),
  errorCode('CLASSIFIER_INVALID'),
)
const unsortedScopesTamper = structuredClone(deterministic)
unsortedScopesTamper.classification.allowedScopes.reverse()
assert.throws(
  () => validateAuthorityDecisionReceiptShape(unsortedScopesTamper),
  errorCode('CLASSIFIER_INVALID'),
)
const overlappingScopesTamper = structuredClone(deterministic)
overlappingScopesTamper.classification.allowedScopes.push('product-ui-ux-decision')
overlappingScopesTamper.classification.allowedScopes.sort()
assert.throws(
  () => validateAuthorityDecisionReceiptShape(overlappingScopesTamper),
  errorCode('CLASSIFIER_INVALID'),
)
const staleV1Receipt = structuredClone(deterministic)
staleV1Receipt.schemaVersion = 1
assert.throws(
  () => validateAuthorityDecisionReceiptShape(staleV1Receipt),
  errorCode('RECEIPT_SHAPE_INVALID'),
)

const receiptContractSource = receiptContractSourceBytes.toString('utf8')
for (const forbidden of [
  /\bfetch\s*\(/u,
  /node:https/u,
  /node:http/u,
  /node:child_process/u,
  /process\.env/u,
  /\bwriteFile/u,
  /\brename/u,
  /\brmSync/u,
]) {
  assert.doesNotMatch(
    receiptContractSource,
    forbidden,
    'pure receipt contract must not acquire network, credential, child-process, or repository-write capability',
  )
}

function runner(mode, providerId, payload) {
  return spawnSync(process.execPath, [
    'scripts/run-provider-hook.mjs',
    '--provider',
    providerId,
    '--authority-decision',
    mode,
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GOVERNANCE_PROJECT_DIR: repoRoot,
    },
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  })
}

const runnerInput = {
  schemaVersion: 1,
  runtimeSurface: 'generic/ci/authority',
  sessionId: 'runner-session-001',
  scopeNonce: 'runner-scope-001',
  target,
  operationText,
  userMessages: ['請修復 Button 的 TypeScript null bug'],
}
const preparedByRunner = runner('prepare', 'generic', runnerInput)
assert.equal(preparedByRunner.status, 0, preparedByRunner.stderr)
const runnerReceipt = JSON.parse(preparedByRunner.stdout)
assert.equal(runnerReceipt.schemaVersion, 2)
assert.equal(runnerReceipt.binding.providerId, 'generic')
assert.equal(runnerReceipt.trust.runtimeCertification, 'not-certified')

const verifiedByRunner = runner('verify', 'generic', {
  ...runnerInput,
  receipt: runnerReceipt,
})
assert.equal(verifiedByRunner.status, 0, verifiedByRunner.stderr)
assert.deepEqual(JSON.parse(verifiedByRunner.stdout), runnerReceipt)

const exactStandingDelegationRunnerInput = {
  schemaVersion: 1,
  runtimeSurface: 'codex-desktop/local/authority',
  sessionId: '019f7b9e-f214-79b3-a41f-3d5bf22c0c4f',
  scopeNonce: 'standing-delegation/sha256:22d207434f74458f032f75a35795af970f3af7537263d752d0d532205053458b',
  ...exactStandingDelegationInput,
}
const exactStandingPreparedByRunner = runner(
  'prepare',
  'codex',
  exactStandingDelegationRunnerInput,
)
assert.equal(exactStandingPreparedByRunner.status, 0, exactStandingPreparedByRunner.stderr)
const exactStandingRunnerReceipt = JSON.parse(exactStandingPreparedByRunner.stdout)
assert.deepEqual(
  exactStandingRunnerReceipt.classification,
  exactStandingDelegation.classification,
)
const exactStandingVerifiedByRunner = runner('verify', 'codex', {
  ...exactStandingDelegationRunnerInput,
  receipt: exactStandingRunnerReceipt,
})
assert.equal(exactStandingVerifiedByRunner.status, 0, exactStandingVerifiedByRunner.stderr)
assert.deepEqual(
  JSON.parse(exactStandingVerifiedByRunner.stdout),
  exactStandingRunnerReceipt,
)

const scopedAuthorityRunnerInput = {
  schemaVersion: 1,
  runtimeSurface: 'codex-desktop/local/authority',
  sessionId: '019f7b9e-f214-79b3-a41f-3d5bf22c0c4f',
  scopeNonce: 'scoped-authority/sha256:5dd8be410a2e2650fa685a9f99104f282150a75f8e12c43623aac106d7aff066',
  ...scopedAuthorityEngineeringInput,
}
const scopedAuthorityPreparedByRunner = runner(
  'prepare',
  'codex',
  scopedAuthorityRunnerInput,
)
assert.equal(scopedAuthorityPreparedByRunner.status, 0, scopedAuthorityPreparedByRunner.stderr)
const scopedAuthorityRunnerReceipt = JSON.parse(scopedAuthorityPreparedByRunner.stdout)
assert.equal(scopedAuthorityRunnerReceipt.schemaVersion, 2)
assert.deepEqual(
  scopedAuthorityRunnerReceipt.classification,
  scopedAuthorityEngineering.classification,
)
const scopedAuthorityVerifiedByRunner = runner('verify', 'codex', {
  ...scopedAuthorityRunnerInput,
  receipt: scopedAuthorityRunnerReceipt,
})
assert.equal(scopedAuthorityVerifiedByRunner.status, 0, scopedAuthorityVerifiedByRunner.stderr)
assert.deepEqual(
  JSON.parse(scopedAuthorityVerifiedByRunner.stdout),
  scopedAuthorityRunnerReceipt,
)

const replayedByRunner = runner('verify', 'generic', {
  ...runnerInput,
  scopeNonce: 'runner-scope-replay',
  receipt: runnerReceipt,
})
assert.equal(replayedByRunner.status, 70)
assert.match(replayedByRunner.stderr, /REPLAY_OR_SCOPE_MISMATCH/)

const blockedByRunner = runner('prepare', 'codex', {
  ...runnerInput,
  runtimeSurface: 'codex-desktop/local/authority',
  operationText: uiOperation,
  userMessages: ['Button hover 顏色紅色還是藍色由你自行決定'],
})
assert.equal(blockedByRunner.status, 2, blockedByRunner.stderr)
assert.equal(JSON.parse(blockedByRunner.stdout).classification.decision, 'blocked')

const forkFixture = realpathSync(mkdtempSync(resolve(tmpdir(), 'authority-decision-fork-')))
try {
  const forkRoot = resolve(forkFixture, 'fork')
  const templateRoot = resolve(forkFixture, 'template')
  const built = buildCorpus({ outDir: forkRoot, templateRoot })
  assert.deepEqual(built.manifest.authorityDecision, {
    schemaVersion: 1,
    policySource: 'AGENTS.md#canonical-decision-authority',
    classifierSource: 'launchers/approval-evidence.mjs',
    receiptContractSource: 'launchers/authority-decision-evidence.mjs',
    runner: 'launchers/product-hook-dispatch-runtime.mjs',
    prepareArgv: ['--authority-decision', 'prepare'],
    verifyArgv: ['--authority-decision', 'verify'],
    certificationClaim: 'structural-only-not-runtime-certified',
  })
  const canonicalProductRunnerPath = resolve(
    repoRoot,
    'packages/design-system/ds-canonical/templates/product-launchers/product-hook-dispatch-runtime.mjs',
  )
  assert.deepEqual(
    readFileSync(resolve(forkRoot, built.manifest.authorityDecision.runner)),
    readFileSync(canonicalProductRunnerPath),
    'fork runner must remain byte-equal to its canonical source',
  )
  assert.deepEqual(
    readFileSync(resolve(templateRoot, 'governance/bin/product-hook-dispatch-runtime.mjs')),
    readFileSync(canonicalProductRunnerPath),
    'template runner must remain byte-equal to its canonical source',
  )
  const invokeForkProductRunner = (mode, payload) => spawnSync(process.execPath, [
    'packages/design-system/ds-canonical/fork/launchers/product-hook-dispatch-runtime.mjs',
    'generic',
    resolve(forkRoot, 'manifest.json'),
    forkRoot,
    '--authority-decision',
    mode,
  ], {
    cwd: repoRoot,
    env: process.env,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
  })
  const invokeTemplateProductRunner = (mode, payload) => spawnSync(process.execPath, [
    'template/ds-product-template/governance/bin/product-hook-dispatch-runtime.mjs',
    'generic',
    resolve(forkRoot, 'manifest.json'),
    forkRoot,
    '--authority-decision',
    mode,
  ], {
    cwd: repoRoot,
    env: process.env,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  const productRunner = (mode, payload) => invokeForkProductRunner(mode, payload)
  const productInput = {
    ...runnerInput,
    runtimeSurface: 'generic/ci/product-consumer',
    sessionId: 'product-session-001',
    scopeNonce: 'product-scope-001',
  }
  const productPrepared = productRunner('prepare', productInput)
  assert.equal(productPrepared.status, 0, productPrepared.stderr)
  const productReceipt = JSON.parse(productPrepared.stdout)
  assert.equal(
    productReceipt.source.providerRegistry,
    'packages/design-system/ds-canonical/fork/manifest.json#providerAdapters',
  )
  assert.equal(productReceipt.binding.providerId, 'generic')
  assert.deepEqual(productReceipt.classification, deterministic.classification)
  assert.equal(productReceipt.trust.runtimeCertification, 'not-certified')
  const productVerified = productRunner('verify', { ...productInput, receipt: productReceipt })
  assert.equal(productVerified.status, 0, productVerified.stderr)
  assert.deepEqual(JSON.parse(productVerified.stdout), productReceipt)

  const consumerInput = {
    ...productInput,
    runtimeSurface: 'generic/remote/product-consumer',
    sessionId: 'consumer-session-001',
    scopeNonce: 'consumer-scope-001',
  }
  const consumerPrepared = invokeTemplateProductRunner('prepare', consumerInput)
  assert.equal(consumerPrepared.status, 0, consumerPrepared.stderr)
  const consumerReceipt = JSON.parse(consumerPrepared.stdout)
  assert.deepEqual(consumerReceipt.classification, deterministic.classification)
  assert.equal(consumerReceipt.trust.runtimeCertification, 'not-certified')

  const externalProductInput = {
    ...productInput,
    target: externalAuthorityTarget,
    operationText: externalAuthorityOperation,
    userMessages: [],
    sessionId: 'product-external-session-001',
    scopeNonce: 'product-external-scope-001',
  }
  const externalForkPrepared = invokeForkProductRunner('prepare', externalProductInput)
  assert.equal(externalForkPrepared.status, 0, externalForkPrepared.stderr)
  const externalForkReceipt = JSON.parse(externalForkPrepared.stdout)
  assert.equal(externalForkReceipt.classification.decision, 'approved')
  assert.equal(
    externalForkReceipt.classification.reasonCode,
    'ENGINEERING_OPERATION_STANDING_AUTHORIZATION',
  )
  const externalTemplatePrepared = invokeTemplateProductRunner('prepare', {
    ...externalProductInput,
    runtimeSurface: 'generic/remote/product-consumer',
    sessionId: 'template-external-session-001',
    scopeNonce: 'template-external-scope-001',
  })
  assert.equal(externalTemplatePrepared.status, 0, externalTemplatePrepared.stderr)
  assert.deepEqual(
    JSON.parse(externalTemplatePrepared.stdout).classification,
    externalForkReceipt.classification,
    'fork and template runners must classify the same external engineering action identically',
  )
} finally {
  rmSync(forkFixture, { recursive: true, force: true })
}

console.log('✓ provider-neutral authority decisions use one content-addressed classifier receipt across native and hook-independent surfaces')

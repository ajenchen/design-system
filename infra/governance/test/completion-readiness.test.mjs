import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { dirname, resolve } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { auditCompletionReadiness, validateCompletionLivePlan } from '../lib/completion-readiness.mjs'
import { readJson, sha256, stableStringify } from '../lib/common.mjs'
import { candidatePlanDigest, resolveRolloutWave } from '../lib/rollout-state-machine.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import { createExternalRuntimeCertificationFixture } from './fixtures/external-runtime-certification-fixture.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NOW = new Date('2026-07-21T00:00:00.000Z')
const currentHarnessReceipt = {
  pass: true,
  detail: 'fixture receipt verified against exact subject',
  receiptPath: 'infra/governance/runtime/all-harness-receipt.json',
  receiptSha256: 'a'.repeat(64),
  head: '1'.repeat(40),
  tree: '2'.repeat(40),
  completedAt: '2026-07-20T23:00:00.000Z',
  expiresAt: '2026-07-21T23:00:00.000Z',
  runnerArgv: ['node', 'infra/governance/bin/run-harnesses.mjs'],
}

function models() {
  return {
    inventory: readJson(resolve(ROOT, 'inventory/managed-repos.json')),
    desired: readJson(resolve(ROOT, 'desired/github.json')),
    rings: readJson(resolve(ROOT, 'release-rings.json')),
    certifications: readJson(resolve(ROOT, 'providers/certifications.json')),
    waivers: readJson(resolve(ROOT, 'waivers.json')),
    activationRequirements: readJson(resolve(ROOT, 'external-activation-requirements.json')),
    activationPolicy: readJson(resolve(ROOT, 'external-activation-policy.json')),
    mutationBoundaryContract: readJson(resolve(ROOT, 'providers/github-mutation-boundary-contract.json')),
    issuerRegistry: readJson(resolve(ROOT, 'trust/issuers.json')),
    runtimeProfile: readJson(resolve(ROOT, 'providers/runtime-conformance.json')),
  }
}

const externalRuntimeFixtures = []
after(() => {
  for (const fixture of externalRuntimeFixtures) fixture.dispose()
})

function certifiedExternalModels() {
  const context = models()
  context.desired.integrations.governanceCheckApp.id = 1001
  context.desired.integrations.governanceWriterApp.id = 1002
  const keys = generateKeyPairSync('ed25519')
  const signer = { keyId: 'completion-runtime-evidence', privateKey: keys.privateKey }
  context.issuerRegistry.issuers.push({
    keyId: signer.keyId,
    subject: 'fixture:completion-runtime-evidence',
    publicKeySpki: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    roles: ['runtime-evidence-issuer'],
    status: 'active',
    notBefore: '2026-01-01T00:00:00.000Z',
    notAfter: '2030-01-01T00:00:00.000Z',
    revokedAt: null,
  })
  context.runtimeProfile.allowedKeyIds = [signer.keyId]
  context.runtimeProfile.requiredIssuerQuorum = 1
  context.runtimeProfile.issuerRegistryDigest = issuerRegistryDigest(context.issuerRegistry)
  context.rings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(context.issuerRegistry)
  const certification = context.certifications.certifications.find(item => item.runtimeKind === 'github-actions' && item.repositoryRole === 'product-consumer')
  assert.ok(certification)
  certification.status = 'certified'
  certification.checks = certification.checks.map(check => ({ ...check, status: 'pass' }))
  certification.limitations = []
  const fixture = createExternalRuntimeCertificationFixture({
    inventory: context.inventory,
    desired: context.desired,
    certifications: context.certifications,
    matrix: readJson(resolve(ROOT, 'providers/compatibility-matrix.json')),
    runtimeProfile: context.runtimeProfile,
    signer,
    now: NOW,
  })
  externalRuntimeFixtures.push(fixture)
  context.certifications = fixture.certifications
  context.runtimeValidationContext = fixture.runtimeValidationContext
  return context
}

function livePlan(context, { conflicts = [], actions = [], deferredActions = [], rolloutBlockers = [] } = {}) {
  const repoCandidates = context.inventory.repositories.map((repository, index) => ({
      repoId: repository.id,
      github: repository.github,
      ring: context.rings.assignments[repository.id].ring,
      defaultBranchHeadSha: String(index + 1).repeat(40),
      observedStateDigest: String(index + 4).repeat(64),
      conflicts: index === 0 ? conflicts : [],
      actions: index === 0 ? actions : [],
      deferredActions: index === 0 ? deferredActions : [],
      predicateResults: [],
    }))
  const planCandidateDigest = candidatePlanDigest({
    candidateRelease: context.rings.candidateRelease,
    verifiedReleaseEvidenceDigest: null,
    repoCandidates: repoCandidates.map(candidate => ({
      repoId: candidate.repoId,
      github: candidate.github,
      ring: candidate.ring,
      defaultBranchHeadSha: candidate.defaultBranchHeadSha,
      observedStateDigest: candidate.observedStateDigest,
      actions: candidate.actions,
      deferredActions: candidate.deferredActions,
      conflicts: candidate.conflicts,
    })),
  })
  const resolvedRollout = resolveRolloutWave({
    inventory: context.inventory,
    rings: context.rings,
    candidateRelease: null,
    verifiedReleaseEvidenceDigest: null,
    candidatePlanDigest: planCandidateDigest,
    repoCandidates,
    now: NOW,
    issuerRegistry: context.issuerRegistry,
  })
  assert.ok(Array.isArray(rolloutBlockers))
  const selected = new Set(resolvedRollout.selectedRepoIds)
  const repoPlans = repoCandidates.map(candidate => ({
    repoId: candidate.repoId,
    github: candidate.github,
    ring: candidate.ring,
    defaultBranchHeadSha: candidate.defaultBranchHeadSha,
    observedStateDigest: candidate.observedStateDigest,
    eligibility: {
      eligible: selected.has(candidate.repoId),
      promoted: false,
      ring: candidate.ring,
      wave: context.rings.assignments[candidate.repoId].wave,
      blockers: [],
    },
    requiredChecks: [],
    conflicts: candidate.conflicts,
    actions: selected.has(candidate.repoId) ? candidate.actions : [],
    deferredActions: candidate.deferredActions,
    predicateResults: candidate.predicateResults,
    applyAuthorization: context.rings.assignments[candidate.repoId].applyAuthorization,
    completionAttestation: context.rings.assignments[candidate.repoId].completionAttestation,
    candidateActions: candidate.actions,
    selectedForApply: selected.has(candidate.repoId),
  }))
  const plan = {
    schemaVersion: 6,
    mode: 'plan',
    readOnly: true,
    scope: {
      coverage: 'registered-opt-in-inventory',
      enrollment: 'reviewed-registration-only',
      unregisteredDescendants: 'not-covered',
      registeredRepositoryCount: context.inventory.repositories.length,
      plannedRepositoryCount: repoPlans.length,
    },
    inventoryDigest: sha256(stableStringify(context.inventory, 0)),
    desiredDigest: sha256(stableStringify(context.desired, 0)),
    attestationPolicyDigest: sha256(stableStringify(context.rings.attestationPolicy, 0)),
    candidateRelease: null,
    verifiedReleaseEvidenceDigest: null,
    candidatePlanDigest: planCandidateDigest,
    rollout: resolvedRollout,
    repoPlans,
    summary: {
      registeredInventory: {
        repositories: repoPlans.length,
        managedChanges: repoPlans.reduce((sum, item) => sum + item.candidateActions.length + item.deferredActions.length, 0),
        candidateActions: repoPlans.reduce((sum, item) => sum + item.candidateActions.length, 0),
        deferredActions: repoPlans.reduce((sum, item) => sum + item.deferredActions.length, 0),
        conflicts: repoPlans.reduce((sum, item) => sum + item.conflicts.length, 0),
      },
      selectedWave: {
        repositories: repoPlans.filter(item => item.selectedForApply).length,
        managedChanges: repoPlans.filter(item => item.selectedForApply).reduce((sum, item) => sum + item.actions.length + item.deferredActions.length, 0),
        actions: repoPlans.reduce((sum, item) => sum + item.actions.length, 0),
        deferredActions: repoPlans.filter(item => item.selectedForApply).reduce((sum, item) => sum + item.deferredActions.length, 0),
        conflicts: repoPlans.filter(item => item.selectedForApply).reduce((sum, item) => sum + item.conflicts.length, 0),
      },
      rolloutBlockers: resolvedRollout.blockers.length,
    },
  }
  plan.planDigest = sha256(stableStringify(plan, 0))
  return plan
}

const productionObservation = { source: 'github-api', defaultModels: true, productionEligible: true }

test('completion aggregation accepts exact certified external runtime context and rejects absent or stale identities', () => {
  const context = certifiedExternalModels()
  const report = auditCompletionReadiness({
    ...context,
    now: NOW,
    local: { buildGraph: { pass: false }, untrackedCanonicalInputs: [], headSha: '1'.repeat(40) },
    livePlan: { error: 'fixture plan intentionally unavailable' },
    liveObservation: { source: 'fixture', defaultModels: false, productionEligible: false },
  })
  assert.equal(report.ready, false)
  assert.equal(report.checks.find(check => check.id === 'production-live-observation').pass, false)
  assert.equal(report.checks.find(check => check.id === 'external-runtime-validation-context-current').pass, true)

  const { runtimeValidationContext: ignoredRuntimeValidationContext, ...withoutRuntimeContext } = context
  const offline = auditCompletionReadiness({
    ...withoutRuntimeContext,
    now: NOW,
    local: {},
    livePlan: { error: 'offline' },
    liveObservation: { source: 'offline', defaultModels: true, productionEligible: false },
  })
  const offlineRuntime = offline.checks.find(check => check.id === 'external-runtime-validation-context-current')
  assert.equal(offlineRuntime.pass, false)
  assert.match(offlineRuntime.evidence.error, /requires live identity for certification canary work-management/)
  assert.equal(offline.ready, false)

  const stale = structuredClone(context.runtimeValidationContext)
  stale.externalRepositoryIdentities['work-management'].gitTree = 'f'.repeat(40)
  const staleReport = auditCompletionReadiness({
    ...context,
    runtimeValidationContext: stale,
    now: NOW,
    local: {},
    livePlan: { error: 'stale fixture' },
    liveObservation: { source: 'fixture', defaultModels: false, productionEligible: false },
  })
  const staleRuntime = staleReport.checks.find(check => check.id === 'external-runtime-validation-context-current')
  assert.equal(staleRuntime.pass, false)
  assert.match(staleRuntime.evidence.error, /Repository certification carrier commit\/tree differs/)
  assert.equal(staleReport.ready, false)
})

test('completion audit fails closed on local graph/untracked state and every external activation class', () => {
  const context = models()
  const report = auditCompletionReadiness({
    ...context,
    now: NOW,
    local: {
      buildGraph: { pass: false, detail: 'fixture generated drift' },
      allHarnessReceipt: { ...currentHarnessReceipt, pass: false, detail: 'fixture receipt missing' },
      untrackedCanonicalInputs: ['infra/governance/new-control.json'],
      modifiedCanonicalInputs: ['packages/governance/canonical/providers.json'],
      headSha: '1'.repeat(40),
    },
    livePlan: livePlan(context, {
      conflicts: ['fixture ruleset conflict'],
      actions: [{ kind: 'create-ruleset', resource: 'fleet/verified-main' }],
    }),
    liveObservation: productionObservation,
  })
  assert.equal(report.ready, false)
  assert.equal(report.localReady, false)
  assert.equal(report.externalActivationRequired, true)
  assert.equal(report.status, 'local-and-external-remediation-required')
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const validate = ajv.compile(readJson(resolve(ROOT, 'schemas/governance-completion-readiness.schema.json')))
  assert.equal(validate(report), true, ajv.errorsText(validate.errors))
  for (const id of [
    'governance-build-graph-current',
    'all-harness-receipt-current',
    'canonical-inputs-versioned',
    'candidate-release-present',
    'required-provider-surfaces-certified',
    'signed-external-activation-complete',
    'signed-rollout-authorization-and-completion',
    'live-github-plan-conflict-free',
    'live-github-desired-state-aligned',
  ]) assert.equal(report.checks.find(check => check.id === id)?.pass, false, id)
})

test('completion audit distinguishes locally ready from still-required external activation', () => {
  const context = models()
  const report = auditCompletionReadiness({
    ...context,
    now: NOW,
    local: { buildGraph: { pass: true, detail: 'fixture pass' }, allHarnessReceipt: currentHarnessReceipt, untrackedCanonicalInputs: [], headSha: '1'.repeat(40) },
    livePlan: livePlan(context),
    liveObservation: productionObservation,
  })
  assert.equal(report.localReady, true)
  assert.equal(report.externalActivationRequired, true)
  assert.equal(report.ready, false)
  assert.equal(report.status, 'external-activation-required')
  assert.equal(report.checks.find(check => check.id === 'candidate-release-present').summary, 'candidateRelease is null.')
  assert.equal(report.checks.find(check => check.id === 'live-github-plan-conflict-free').evidence.error, null)
  assert.equal(report.checks.find(check => check.id === 'live-github-desired-state-aligned').evidence.error, null)
  assert.equal(report.scope.qualifiedClaim, 'registered-opt-in-inventory')
  assert.equal(report.scope.globalCompletionClaimEligible, false)
})

test('completion local readiness requires a durable current All-Harness receipt observation', () => {
  const context = models()
  const report = auditCompletionReadiness({
    ...context,
    now: NOW,
    local: { buildGraph: { pass: true }, untrackedCanonicalInputs: [], headSha: '1'.repeat(40) },
    livePlan: livePlan(context),
    liveObservation: productionObservation,
  })
  const receipt = report.checks.find(check => check.id === 'all-harness-receipt-current')
  assert.equal(receipt.pass, false)
  assert.match(receipt.evidence.detail, /receipt was not supplied/)
  assert.equal(report.localReady, false)
})

test('completion rejects a global descendants claim that the registered inventory cannot observe', () => {
  const context = models()
  const report = auditCompletionReadiness({
    ...context,
    now: NOW,
    completionClaim: 'all-template-descendants-global',
    local: { buildGraph: { pass: true }, allHarnessReceipt: currentHarnessReceipt, untrackedCanonicalInputs: [], headSha: '1'.repeat(40) },
    livePlan: livePlan(context),
    liveObservation: productionObservation,
  })
  const scope = report.checks.find(check => check.id === 'fleet-completion-scope-qualified')
  assert.equal(scope.pass, false)
  assert.equal(scope.evidence.globalDescendantsObserved, false)
  assert.equal(report.externalActivationRequired, true)
  assert.equal(report.ready, false)
})

test('completion audit treats an unavailable live plan as a blocker rather than an offline pass', () => {
  const context = models()
  const report = auditCompletionReadiness({
    ...context,
    now: NOW,
    local: { buildGraph: { pass: true }, allHarnessReceipt: currentHarnessReceipt, untrackedCanonicalInputs: [], headSha: '1'.repeat(40) },
    livePlan: { error: 'fixture transport unavailable' },
    liveObservation: productionObservation,
  })
  assert.equal(report.checks.find(check => check.id === 'live-github-plan-conflict-free').pass, false)
  assert.equal(report.checks.find(check => check.id === 'live-github-desired-state-aligned').pass, false)
})

test('completion audit rejects modified SSOT, deferred irreversible drift, and rollout blockers', () => {
  const context = models()
  const report = auditCompletionReadiness({
    ...context,
    now: NOW,
    local: {
      buildGraph: { pass: true },
      allHarnessReceipt: currentHarnessReceipt,
      untrackedCanonicalInputs: [],
      modifiedCanonicalInputs: ['packages/governance/canonical/providers.json'],
      headSha: '1'.repeat(40),
    },
    livePlan: livePlan(context, {
      deferredActions: [{ kind: 'enable-immutable-releases', resource: 'repository/releases' }],
      rolloutBlockers: ['fixture soak window incomplete'],
    }),
    liveObservation: productionObservation,
  })
  const versioned = report.checks.find(check => check.id === 'canonical-inputs-versioned')
  assert.equal(versioned.pass, false)
  assert.deepEqual(versioned.evidence.modifiedPaths, ['packages/governance/canonical/providers.json'])
  const conflicts = report.checks.find(check => check.id === 'live-github-plan-conflict-free')
  assert.equal(conflicts.pass, false)
  assert.equal(conflicts.evidence.conflicts[0].source, 'rollout')
  const aligned = report.checks.find(check => check.id === 'live-github-desired-state-aligned')
  assert.equal(aligned.pass, false)
  assert.equal(aligned.evidence.actions[0].deferred, true)
})

test('completion audit treats malformed live plan shape as unavailable', () => {
  const context = models()
  const report = auditCompletionReadiness({
    ...context,
    now: NOW,
    local: { buildGraph: { pass: true }, allHarnessReceipt: currentHarnessReceipt, untrackedCanonicalInputs: [], modifiedCanonicalInputs: [], headSha: '1'.repeat(40) },
    livePlan: { repoPlans: [{ repoId: 'design-system' }] },
    liveObservation: productionObservation,
  })
  for (const id of ['live-github-plan-conflict-free', 'live-github-desired-state-aligned']) {
    const check = report.checks.find(item => item.id === id)
    assert.equal(check.pass, false)
    assert.match(check.evidence.error, /invalid or open shape/)
  }
})

test('completion rejects empty, digest-tampered, fixture, and unpublished-head observations', () => {
  const context = models()
  const valid = livePlan(context)
  assert.equal(validateCompletionLivePlan(valid, { ...context, now: NOW }), true)

  const empty = structuredClone(valid)
  empty.repoPlans = []
  empty.scope.plannedRepositoryCount = 0
  empty.summary.registeredInventory.repositories = 0
  delete empty.planDigest
  empty.planDigest = sha256(stableStringify(empty, 0))
  assert.throws(() => validateCompletionLivePlan(empty, { ...context, now: NOW }), /full registered opt-in inventory scope|does not exactly cover inventory/)

  const tampered = structuredClone(valid)
  tampered.repoPlans[0].observedStateDigest = 'f'.repeat(64)
  assert.throws(() => validateCompletionLivePlan(tampered, { ...context, now: NOW }), /candidate-plan digest mismatch/)

  const inventoryDriftPlan = livePlan(context, {
    conflicts: ['registered inventory conflict hidden outside the selected wave'],
    actions: [{ kind: 'create-ruleset', resource: 'fleet/verified-main' }],
  })
  const hiddenInventoryTotals = structuredClone(inventoryDriftPlan)
  assert.notEqual(hiddenInventoryTotals.summary.registeredInventory.managedChanges, hiddenInventoryTotals.summary.selectedWave.managedChanges)
  assert.notEqual(hiddenInventoryTotals.summary.registeredInventory.conflicts, hiddenInventoryTotals.summary.selectedWave.conflicts)
  hiddenInventoryTotals.summary.registeredInventory.managedChanges = hiddenInventoryTotals.summary.selectedWave.managedChanges
  hiddenInventoryTotals.summary.registeredInventory.conflicts = hiddenInventoryTotals.summary.selectedWave.conflicts
  delete hiddenInventoryTotals.planDigest
  hiddenInventoryTotals.planDigest = sha256(stableStringify(hiddenInventoryTotals, 0))
  assert.throws(() => validateCompletionLivePlan(hiddenInventoryTotals, { ...context, now: NOW }), /summary mismatch/)

  const globalScope = structuredClone(valid)
  globalScope.scope.coverage = 'all-descendants'
  delete globalScope.planDigest
  globalScope.planDigest = sha256(stableStringify(globalScope, 0))
  assert.throws(() => validateCompletionLivePlan(globalScope, { ...context, now: NOW }), /full registered opt-in inventory scope/)

  const fixtureReport = auditCompletionReadiness({
    ...context,
    now: NOW,
    local: { buildGraph: { pass: true }, allHarnessReceipt: currentHarnessReceipt, headSha: '1'.repeat(40) },
    livePlan: valid,
    liveObservation: { source: 'fixture', defaultModels: true, productionEligible: false },
  })
  assert.equal(fixtureReport.checks.find(check => check.id === 'production-live-observation').pass, false)
  assert.equal(fixtureReport.checks.find(check => check.id === 'live-github-plan-conflict-free').pass, false)

  const unpublished = auditCompletionReadiness({
    ...context,
    now: NOW,
    local: { buildGraph: { pass: true }, allHarnessReceipt: currentHarnessReceipt, headSha: 'f'.repeat(40) },
    livePlan: valid,
    liveObservation: productionObservation,
  })
  assert.equal(unpublished.checks.find(check => check.id === 'local-authority-head-published').pass, false)
})

import { certificationKey, validateGovernanceModel } from './model-validation.mjs'
import { externalActivationReadiness } from './external-activation.mjs'
import { invariant, sha256, stableStringify } from './common.mjs'
import { normalizeRuntimeValidationContext } from './runtime-certification.mjs'
import { candidatePlanDigest, resolveRolloutWave } from './rollout-state-machine.mjs'

const clone = value => JSON.parse(JSON.stringify(value))

function result(id, category, pass, summary, evidence = {}) {
  return { id, category, pass, summary, evidence: clone(evidence) }
}

function runtimeValidationContextFailure(error) {
  return error instanceof Error && /(?:requires live identity for (?:repository|certification canary)|repository commit\/tree binding is stale|Repository certification carrier commit\/tree differs|profile\/Harness binding is stale)/.test(error.message)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

const PLAN_ROOT_KEYS = [
  'schemaVersion', 'mode', 'readOnly', 'scope', 'inventoryDigest', 'desiredDigest', 'attestationPolicyDigest',
  'candidateRelease', 'verifiedReleaseEvidenceDigest', 'candidatePlanDigest', 'rollout', 'repoPlans',
  'summary', 'planDigest',
]
const REPO_PLAN_KEYS = [
  'repoId', 'github', 'ring', 'defaultBranchHeadSha', 'observedStateDigest', 'eligibility',
  'requiredChecks', 'conflicts', 'actions', 'deferredActions', 'predicateResults', 'applyAuthorization',
  'completionAttestation', 'candidateActions', 'selectedForApply',
]

export function validateCompletionLivePlan(plan, {
  inventory,
  desired,
  rings,
  issuerRegistry,
  now = new Date(),
}) {
  exactKeys(plan, PLAN_ROOT_KEYS, 'Completion live plan')
  invariant(plan.schemaVersion === 6 && plan.mode === 'plan' && plan.readOnly === true, 'Completion live plan identity/version is invalid')
  exactKeys(plan.scope, ['coverage', 'enrollment', 'unregisteredDescendants', 'registeredRepositoryCount', 'plannedRepositoryCount'], 'Completion live plan scope')
  invariant(plan.scope.coverage === 'registered-opt-in-inventory'
    && plan.scope.enrollment === 'reviewed-registration-only'
    && plan.scope.unregisteredDescendants === 'not-covered'
    && plan.scope.registeredRepositoryCount === inventory.repositories.length
    && plan.scope.plannedRepositoryCount === inventory.repositories.length, 'Completion live plan does not represent the full registered opt-in inventory scope')
  invariant(plan.inventoryDigest === sha256(stableStringify(inventory, 0)), 'Completion live plan inventory digest mismatch')
  invariant(plan.desiredDigest === sha256(stableStringify(desired, 0)), 'Completion live plan desired digest mismatch')
  invariant(plan.attestationPolicyDigest === sha256(stableStringify(rings.attestationPolicy, 0)), 'Completion live plan attestation-policy digest mismatch')
  invariant(stableStringify(plan.candidateRelease, 0) === stableStringify(rings.candidateRelease, 0), 'Completion live plan candidate release mismatch')
  invariant(rings.candidateRelease === null
    ? plan.verifiedReleaseEvidenceDigest === null
    : /^[a-f0-9]{64}$/.test(plan.verifiedReleaseEvidenceDigest ?? ''), 'Completion live plan verified release evidence binding is invalid')
  invariant(Array.isArray(plan.repoPlans) && plan.repoPlans.length === inventory.repositories.length, 'Completion live plan does not exactly cover inventory')
  const expectedOrder = inventory.repositories.map(repository => repository.id)
  const actualOrder = plan.repoPlans.map(repo => repo?.repoId)
  invariant(stableStringify(actualOrder, 0) === stableStringify(expectedOrder, 0), 'Completion live plan repository set/order differs from inventory')
  const repoCandidates = plan.repoPlans.map((repoPlan, index) => {
    exactKeys(repoPlan, REPO_PLAN_KEYS, `Completion live plan repository ${index}`)
    const inventoryRepo = inventory.repositories[index]
    invariant(repoPlan.github === inventoryRepo.github
      && repoPlan.ring === rings.assignments[repoPlan.repoId].ring, `Completion live plan repository ${repoPlan.repoId} identity mismatch`)
    invariant(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(repoPlan.defaultBranchHeadSha ?? '')
      && /^[a-f0-9]{64}$/.test(repoPlan.observedStateDigest ?? ''), `Completion live plan repository ${repoPlan.repoId} state identity is invalid`)
    for (const key of ['requiredChecks', 'conflicts', 'actions', 'deferredActions', 'predicateResults', 'candidateActions']) {
      invariant(Array.isArray(repoPlan[key]), `Completion live plan repository ${repoPlan.repoId} ${key} must be an array`)
    }
    invariant(typeof repoPlan.selectedForApply === 'boolean', `Completion live plan repository ${repoPlan.repoId} selection flag is invalid`)
    return {
      repoId: repoPlan.repoId,
      github: repoPlan.github,
      ring: repoPlan.ring,
      defaultBranchHeadSha: repoPlan.defaultBranchHeadSha,
      observedStateDigest: repoPlan.observedStateDigest,
      actions: repoPlan.candidateActions,
      deferredActions: repoPlan.deferredActions,
      conflicts: repoPlan.conflicts,
      predicateResults: repoPlan.predicateResults,
    }
  })
  const recomputedCandidatePlanDigest = candidatePlanDigest({
    candidateRelease: rings.candidateRelease,
    verifiedReleaseEvidenceDigest: plan.verifiedReleaseEvidenceDigest,
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
  invariant(plan.candidatePlanDigest === recomputedCandidatePlanDigest, 'Completion live plan candidate-plan digest mismatch')
  const recomputedRollout = resolveRolloutWave({
    inventory,
    rings,
    candidateRelease: rings.candidateRelease,
    verifiedReleaseEvidenceDigest: plan.verifiedReleaseEvidenceDigest,
    candidatePlanDigest: recomputedCandidatePlanDigest,
    repoCandidates,
    now,
    issuerRegistry,
  })
  invariant(stableStringify(plan.rollout, 0) === stableStringify(recomputedRollout, 0), 'Completion live plan rollout resolution mismatch')
  const selected = new Set(recomputedRollout.selectedRepoIds)
  for (const repoPlan of plan.repoPlans) {
    invariant(repoPlan.selectedForApply === selected.has(repoPlan.repoId), `Completion live plan repository ${repoPlan.repoId} selection disagrees with rollout`)
    const expectedActions = selected.has(repoPlan.repoId) ? repoPlan.candidateActions : []
    invariant(stableStringify(repoPlan.actions, 0) === stableStringify(expectedActions, 0), `Completion live plan repository ${repoPlan.repoId} apply actions disagree with rollout`)
  }
  exactKeys(plan.summary, ['registeredInventory', 'selectedWave', 'rolloutBlockers'], 'Completion live plan summary')
  exactKeys(plan.summary.registeredInventory, ['repositories', 'managedChanges', 'candidateActions', 'deferredActions', 'conflicts'], 'Completion live plan registered-inventory summary')
  exactKeys(plan.summary.selectedWave, ['repositories', 'managedChanges', 'actions', 'deferredActions', 'conflicts'], 'Completion live plan selected-wave summary')
  const recomputedSummary = {
    registeredInventory: {
      repositories: plan.repoPlans.length,
      managedChanges: plan.repoPlans.reduce((sum, item) => sum + item.candidateActions.length + item.deferredActions.length, 0),
      candidateActions: plan.repoPlans.reduce((sum, item) => sum + item.candidateActions.length, 0),
      deferredActions: plan.repoPlans.reduce((sum, item) => sum + item.deferredActions.length, 0),
      conflicts: plan.repoPlans.reduce((sum, item) => sum + item.conflicts.length, 0),
    },
    selectedWave: {
      repositories: plan.repoPlans.filter(item => item.selectedForApply).length,
      managedChanges: plan.repoPlans.filter(item => item.selectedForApply).reduce((sum, item) => sum + item.actions.length + item.deferredActions.length, 0),
      actions: plan.repoPlans.reduce((sum, item) => sum + item.actions.length, 0),
      deferredActions: plan.repoPlans.filter(item => item.selectedForApply).reduce((sum, item) => sum + item.deferredActions.length, 0),
      conflicts: plan.repoPlans.filter(item => item.selectedForApply).reduce((sum, item) => sum + item.conflicts.length, 0),
    },
    rolloutBlockers: plan.rollout.blockers.length,
  }
  invariant(stableStringify(plan.summary, 0) === stableStringify(recomputedSummary, 0), 'Completion live plan summary mismatch')
  const unsigned = clone(plan)
  delete unsigned.planDigest
  invariant(plan.planDigest === sha256(stableStringify(unsigned, 0)), 'Completion live plan digest mismatch')
  return true
}

function certificationBlockers(inventory, certifications) {
  const byKey = new Map(certifications.certifications.map(certification => [
    certificationKey(
      certification.provider,
      certification.runtimeKind,
      certification.surface,
      certification.repositoryRole,
    ),
    certification,
  ]))
  const blockers = []
  for (const repository of inventory.repositories) {
    for (const surface of repository.providerSurfacesRequired ?? []) {
      const [provider, runtimeKind, runtimeSurface] = surface.split('/')
      const key = certificationKey(provider, runtimeKind, runtimeSurface, repository.role)
      const certification = byKey.get(key)
      if (certification?.status === 'certified') continue
      blockers.push({
        repository: repository.id,
        github: repository.github,
        surface,
        repositoryRole: repository.role,
        certificationId: certification?.id ?? null,
        status: certification?.status ?? 'missing',
      })
    }
  }
  return blockers
}

function rolloutEvidenceBlockers(inventory, rings) {
  const blockers = []
  for (const repository of inventory.repositories) {
    const assignment = rings.assignments[repository.id]
    if (!assignment?.applyAuthorization) blockers.push({ repository: repository.id, evidence: 'applyAuthorization', status: 'missing' })
    if (!assignment?.completionAttestation) blockers.push({ repository: repository.id, evidence: 'completionAttestation', status: 'missing' })
  }
  return blockers
}

export function auditCompletionReadiness({
  inventory,
  desired,
  rings,
  certifications,
  waivers,
  activationRequirements,
  mutationBoundaryContract,
  issuerRegistry,
  runtimeProfile,
  runtimeValidationContext = {},
  now = new Date(),
  local = {},
  livePlan = null,
  liveObservation = {},
  activationPolicy,
  expectedActivationPolicyDigest,
  completionClaim = 'registered-opt-in-inventory',
}) {
  const validationContext = normalizeRuntimeValidationContext(runtimeValidationContext, { inventory })
  let runtimeContextError = null
  try {
    validateGovernanceModel({
      inventory,
      desired,
      rings,
      certifications,
      waivers,
      now,
      issuerRegistry,
      runtimeProfile,
      repoRoot: validationContext.repoRoot,
      runtimeIdentity: validationContext.runtimeIdentity,
      externalRepositoryIdentities: validationContext.externalRepositoryIdentities,
    })
  } catch (error) {
    if (!runtimeValidationContextFailure(error)) throw error
    runtimeContextError = error.message
  }
  const checks = []
  checks.push(result(
    'external-runtime-validation-context-current',
    'external',
    runtimeContextError === null,
    runtimeContextError === null
      ? 'Certified external runtime records are bound to current exact repository and profile/Harness identities.'
      : 'Certified external runtime records lack a current exact live identity binding.',
    { error: runtimeContextError },
  ))
  const buildGraph = local.buildGraph ?? { pass: false, detail: 'governance build graph was not checked' }
  checks.push(result(
    'governance-build-graph-current',
    'local',
    buildGraph.pass === true,
    buildGraph.pass === true ? 'Generated governance artifacts match the canonical build graph.' : 'Canonical build-graph generation/check is stale or unavailable.',
    { detail: buildGraph.detail ?? null },
  ))

  const allHarnessReceipt = local.allHarnessReceipt ?? {
    pass: false,
    detail: 'a fresh content-addressed All-Harness receipt was not supplied by the local receipt verifier',
    receiptPath: 'infra/governance/runtime/all-harness-receipt.json',
    receiptSha256: null,
    head: null,
    tree: null,
    completedAt: null,
    expiresAt: null,
    runnerArgv: ['node', 'infra/governance/bin/run-harnesses.mjs'],
    registeredLocalSourceCount: null,
    localSourceProjectionSha256: null,
  }
  checks.push(result(
    'all-harness-receipt-current',
    'local',
    allHarnessReceipt.pass === true,
    allHarnessReceipt.pass === true
      ? 'A fresh content-addressed All-Harness receipt matches this exact authority snapshot.'
      : 'No fresh content-addressed All-Harness receipt proves this exact authority snapshot.',
    allHarnessReceipt,
  ))

  const specialIndexCanonicalInputs = [...new Set(local.specialIndexCanonicalInputs ?? [])].sort()
  const ignoredCanonicalInputs = [...new Set(local.ignoredCanonicalInputs ?? [])].sort()

  const untrackedCanonicalInputs = [...new Set(local.untrackedCanonicalInputs ?? [])].sort()
  const modifiedCanonicalInputs = [...new Set(local.modifiedCanonicalInputs ?? [])].sort()
  const unversionedCanonicalInputs = [...new Set([
    ...untrackedCanonicalInputs,
    ...modifiedCanonicalInputs,
    ...specialIndexCanonicalInputs,
    ...ignoredCanonicalInputs,
  ])].sort()
  checks.push(result(
    'canonical-inputs-versioned',
    'local',
    unversionedCanonicalInputs.length === 0,
    unversionedCanonicalInputs.length === 0
      ? 'Every locally visible canonical input is committed in the current Git snapshot.'
      : 'Untracked or locally modified canonical inputs are not yet Git/GitHub SSOT.',
    {
      paths: unversionedCanonicalInputs,
      untrackedPaths: untrackedCanonicalInputs,
      modifiedPaths: modifiedCanonicalInputs,
      specialIndexPaths: specialIndexCanonicalInputs,
      ignoredPaths: ignoredCanonicalInputs,
    },
  ))

  const productionObservation = liveObservation?.productionEligible === true
    && liveObservation?.source === 'github-api'
    && liveObservation?.defaultModels === true
  checks.push(result(
    'production-live-observation',
    'external',
    productionObservation,
    productionObservation
      ? 'Live reconciliation was observed from GitHub with the canonical production models.'
      : 'Fixture, injected, offline, or path-overridden observations cannot satisfy objective completion.',
    { source: liveObservation?.source ?? null, defaultModels: liveObservation?.defaultModels === true },
  ))

  const registeredScopeClaim = completionClaim === 'registered-opt-in-inventory'
  checks.push(result(
    'fleet-completion-scope-qualified',
    'external',
    registeredScopeClaim,
    registeredScopeClaim
      ? 'Completion is explicitly limited to the reviewed, registered opt-in inventory; unknown descendants are not covered.'
      : 'A global or all-descendants completion claim is not observable from the registered opt-in inventory.',
    {
      requestedClaim: completionClaim,
      qualifiedClaim: 'registered-opt-in-inventory',
      registeredRepositoryCount: inventory.repositories.length,
      unregisteredDescendants: 'not-covered',
      globalDescendantsObserved: false,
    },
  ))

  checks.push(result(
    'candidate-release-present',
    'external',
    rings.candidateRelease !== null,
    rings.candidateRelease === null ? 'candidateRelease is null.' : `Candidate release ${rings.candidateRelease.version} is bound to immutable package identities.`,
    { candidateRelease: rings.candidateRelease },
  ))

  const providerBlockers = certificationBlockers(inventory, certifications)
  checks.push(result(
    'required-provider-surfaces-certified',
    'external',
    providerBlockers.length === 0,
    providerBlockers.length === 0 ? 'Every required provider/runtime/surface/role tuple is certified.' : 'One or more required provider surfaces are not certified.',
    { blockers: providerBlockers },
  ))

  const activation = externalActivationReadiness(activationRequirements, {
    inventory,
    desired,
    mutationBoundaryContract,
    rings,
    issuerRegistry,
    policy: activationPolicy,
    expectedPolicyDigest: expectedActivationPolicyDigest,
    now,
    scope: 'objective-completion',
  })
  checks.push(result(
    'signed-external-activation-complete',
    'external',
    activation.ready,
    activation.ready ? 'Every objective-scoped external requirement has current signed read-back evidence.' : 'External activation is incomplete or lacks current signed evidence.',
    activation,
  ))

  const rolloutBlockers = rolloutEvidenceBlockers(inventory, rings)
  checks.push(result(
    'signed-rollout-authorization-and-completion',
    'external',
    rolloutBlockers.length === 0,
    rolloutBlockers.length === 0 ? 'Every registered opt-in managed repository has signed apply and completion evidence.' : 'Registered opt-in rollout authorization/completion evidence is missing.',
    { blockers: rolloutBlockers },
  ))

  let planValidationError = null
  let planObserved = false
  if (productionObservation && livePlan && typeof livePlan === 'object' && !livePlan.error) {
    try {
      validateCompletionLivePlan(livePlan, { inventory, desired, rings, issuerRegistry, now })
      planObserved = true
    } catch (error) {
      planValidationError = error.message
    }
  }
  const conflicts = planObserved
    ? [
        ...livePlan.repoPlans.flatMap(repo => repo.conflicts.map(conflict => ({ repository: repo.repoId, conflict }))),
        ...(livePlan.rollout?.blockers ?? []).map(blocker => ({ repository: null, conflict: blocker, source: 'rollout' })),
      ]
    : []
  const livePlanError = planObserved
    ? null
    : livePlan?.error
      ?? planValidationError
      ?? (productionObservation ? 'live GitHub plan shape is incomplete' : 'production-eligible live GitHub observation is unavailable')

  const authority = inventory.repositories.find(repository => repository.role === 'authority')
  const authorityPlan = planObserved ? livePlan.repoPlans.find(repository => repository.repoId === authority?.id) : null
  const localHeadPublished = typeof local.headSha === 'string'
    && authorityPlan
    && local.headSha === authorityPlan.defaultBranchHeadSha
  checks.push(result(
    'local-authority-head-published',
    'local',
    Boolean(localHeadPublished),
    localHeadPublished
      ? 'The local authority checkout is exactly the protected remote head observed by the live plan.'
      : 'The local authority checkout is not proven identical to the protected remote head.',
    { localHeadSha: local.headSha ?? null, remoteHeadSha: authorityPlan?.defaultBranchHeadSha ?? null },
  ))
  checks.push(result(
    'live-github-plan-conflict-free',
    'external',
    planObserved && conflicts.length === 0,
    !planObserved ? 'The live read-only GitHub reconciliation plan was not observed.' : conflicts.length ? 'The live GitHub plan contains conflicts.' : 'The live GitHub plan is conflict-free.',
    { error: livePlanError, conflicts },
  ))

  const actions = planObserved
    ? livePlan.repoPlans.flatMap(repo => [
        ...repo.candidateActions.map(action => ({ repository: repo.repoId, kind: action.kind, resource: action.resource, deferred: false })),
        ...(repo.deferredActions ?? []).map(action => ({ repository: repo.repoId, kind: action.kind, resource: action.resource, deferred: true })),
      ])
    : []
  checks.push(result(
    'live-github-desired-state-aligned',
    'external',
    planObserved && actions.length === 0,
    !planObserved ? 'Live desired-state alignment was not observed.' : actions.length ? 'The live GitHub plan still requires managed actions.' : 'Live GitHub state matches desired state.',
    { error: livePlanError, actions },
  ))

  const localChecks = checks.filter(check => check.category === 'local')
  const externalChecks = checks.filter(check => check.category === 'external')
  const localReady = localChecks.every(check => check.pass)
  const externalActivationRequired = externalChecks.some(check => !check.pass)
  const ready = localReady && !externalActivationRequired
  const status = ready
    ? 'ready'
    : localReady
      ? 'external-activation-required'
      : externalActivationRequired
        ? 'local-and-external-remediation-required'
        : 'local-remediation-required'
  return {
    schemaVersion: 2,
    kind: 'governance-completion-readiness',
    scope: {
      requestedClaim: completionClaim,
      qualifiedClaim: 'registered-opt-in-inventory',
      inventoryDigest: sha256(stableStringify(inventory, 0)),
      registeredRepositoryCount: inventory.repositories.length,
      unregisteredDescendants: 'not-covered',
      globalDescendantsObserved: false,
      globalCompletionClaimEligible: false,
    },
    status,
    ready,
    localReady,
    externalActivationRequired,
    checkedAt: now.toISOString(),
    summary: {
      total: checks.length,
      passing: checks.filter(check => check.pass).length,
      localFailures: localChecks.filter(check => !check.pass).length,
      externalFailures: externalChecks.filter(check => !check.pass).length,
    },
    checks,
  }
}

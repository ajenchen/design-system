import { compareUtf8Bytes, invariant, sha256, stableStringify } from './common.mjs'
import {
  issueSignedAttestation,
  validateAttestationPolicy,
  verifySignedAttestation,
} from './attestation.mjs'
import { validateRequiredCheckProducer } from './check-run-trust.mjs'
import { validateCandidateRelease } from './release-evidence.mjs'
import {
  EXTERNAL_ACTIVATION_PROFILE_IDS,
  externalActivationPolicyDigest,
  loadExternalActivationPolicy,
  resolveExternalActivationProfile,
} from './external-activation.mjs'

const certificationKey = (provider, surface, role) => `${provider}/${surface}/${role}`

export const PROMOTION_PREDICATE_TYPES = new Set([
  'manual-blockers-clear',
  'soak-complete',
  'soak-observation',
  'required-checks-green',
  'provider-surfaces-certified',
  'no-active-waiver-at-or-above',
  'plan-conflict-free',
  'upstream-waves-promoted',
])

const RISK_ORDER = new Map([['low', 0], ['medium', 1], ['high', 2], ['critical', 3]])
const clone = value => JSON.parse(JSON.stringify(value))
const digest = value => sha256(stableStringify(value, 0))
const SOAK_PREDICATE_TYPES = new Set(['soak-complete', 'soak-observation'])

function resolveRolloutDeploymentProfile({
  activationPolicy,
  expectedActivationPolicyDigest,
} = {}) {
  const policy = activationPolicy ?? loadExternalActivationPolicy()
  const profile = resolveExternalActivationProfile(policy, {
    expectedPolicyDigest: expectedActivationPolicyDigest,
  })
  return {
    profile,
    policyDigest: externalActivationPolicyDigest(policy),
  }
}

function soakPredicateTypeForProfile(profileId) {
  if (profileId === EXTERNAL_ACTIVATION_PROFILE_IDS[0]) return 'soak-observation'
  if (profileId === EXTERNAL_ACTIVATION_PROFILE_IDS[1]) return 'soak-complete'
  invariant(false, `Release-ring soak policy does not recognize deployment profile ${profileId}`)
}

function releaseRingDeploymentIdentity({ repo, ring, assignment }) {
  return {
    schemaVersion: 1,
    repositoryId: repo.id,
    repository: repo.github,
    ring: ring.id,
    wave: assignment.wave,
    enteredAt: assignment.enteredAt,
    candidateReleaseDigest: assignment.candidateReleaseDigest,
  }
}

function evaluateResolvedReleaseRingSoak({
  predicate,
  repo,
  ring,
  assignment,
  candidateRelease,
  now,
  profile,
  policyDigest,
}) {
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'Release-ring soak evaluation now must be a valid Date')
  const expectedType = soakPredicateTypeForProfile(profile.id)
  invariant(predicate?.type === expectedType,
    `Deployment profile ${profile.id} requires release-ring predicate ${expectedType}; received ${predicate?.type ?? '<missing>'}`)

  const enteredAt = new Date(assignment.enteredAt)
  const enteredAtValid = Number.isFinite(enteredAt.getTime())
  const releaseObservedAt = candidateRelease?.observedAt ? new Date(candidateRelease.observedAt) : null
  const releaseObservedAtValid = Boolean(releaseObservedAt && Number.isFinite(releaseObservedAt.getTime()))
  const completeAfter = enteredAtValid
    ? new Date(enteredAt.getTime() + ring.minimumSoakHours * 60 * 60 * 1000)
    : null
  const candidateDigest = candidateRelease ? digest(candidateRelease) : null
  const deploymentIdentity = releaseRingDeploymentIdentity({ repo, ring, assignment })
  const bound = Boolean(
    candidateDigest
    && assignment.candidateReleaseDigest === candidateDigest
    && enteredAtValid
    && releaseObservedAtValid
    && enteredAt >= releaseObservedAt,
  )
  const windowElapsed = Boolean(completeAfter && now >= completeAfter)
  const blocking = expectedType === 'soak-complete'
  const pass = bound && (!blocking || windowElapsed)
  const postReleaseValidationStatus = !bound
    ? 'INVALID_RELEASE_BINDING'
    : blocking
      ? windowElapsed
        ? 'SOAK_COMPLETE'
        : 'BLOCKED_PENDING_REQUIRED_SOAK'
      : 'RELEASED_VALIDATED_SOAK_DEFERRED'
  const evidence = {
    deploymentProfile: {
      id: profile.id,
      sha256: profile.sha256,
      policySha256: policyDigest,
    },
    enforcement: blocking ? 'blocking-promotion-gate' : 'deferred-post-release-validation',
    blocking,
    postReleaseValidationStatus,
    releaseTarget: {
      candidateDigest,
      assignmentCandidateDigest: assignment.candidateReleaseDigest,
      version: candidateRelease?.version ?? null,
      sourceCommit: candidateRelease?.sourceCommit ?? null,
      sourceTree: candidateRelease?.sourceTree ?? null,
      bomSha256: candidateRelease?.bomSha256 ?? null,
      packageSetSha256: candidateRelease ? digest(candidateRelease.packages) : null,
      observedAt: candidateRelease?.observedAt ?? null,
    },
    deploymentIdentity,
    deploymentIdentitySha256: digest(deploymentIdentity),
    window: {
      enteredAt: assignment.enteredAt,
      minimumSoakHours: ring.minimumSoakHours,
      completeAfter: completeAfter?.toISOString() ?? null,
      elapsed: windowElapsed,
    },
    exactReleaseBound: bound,
  }
  const message = !bound
    ? 'post-release soak target is missing, stale, or bound to a different release/deployment identity'
    : blocking
      ? windowElapsed
        ? 'candidate-bound minimum soak complete'
        : `candidate-bound minimum soak incomplete until ${completeAfter.toISOString()}`
      : `candidate-bound soak remains deferred post-release; observation target starts from ${assignment.enteredAt}`
  return result(predicate, pass, evidence, message)
}

export function evaluateReleaseRingSoak({
  predicate,
  repo,
  ring,
  assignment,
  candidateRelease,
  now = new Date(),
  activationPolicy,
  expectedActivationPolicyDigest,
}) {
  const deploymentProfile = resolveRolloutDeploymentProfile({
    activationPolicy,
    expectedActivationPolicyDigest,
  })
  return evaluateResolvedReleaseRingSoak({
    predicate,
    repo,
    ring,
    assignment,
    candidateRelease,
    now,
    ...deploymentProfile,
  })
}

export function predicateEvidenceDigest(predicateResults) {
  return digest(predicateResults)
}

export function candidateActionsDigest(actions) {
  return digest(actions)
}

function attestationExpected({ kind, repoId, github, ringId, waveId, candidateRelease, verifiedReleaseEvidenceDigest, candidatePlanDigest, predicateDigest, stateDigest, defaultBranchHeadSha, actionsDigest, issuerRegistryDigest }) {
  return {
    kind,
    repoId,
    github,
    ring: ringId,
    wave: waveId,
    candidateRelease,
    verifiedReleaseEvidenceDigest,
    candidatePlanDigest,
    predicateDigest,
    stateDigest,
    defaultBranchHeadSha,
    actionsDigest,
    issuerRegistryDigest,
  }
}

export function verifyApplyAuthorization(authorization, context, options) {
  if (!authorization) return { valid: false, failures: ['signed apply authorization is missing'] }
  return verifySignedAttestation(authorization, context.attestationPolicy, attestationExpected({ kind: 'apply-authorization', ...context }), options)
}

export function verifyCompletionAttestation(attestation, context, options) {
  if (!attestation) return { valid: false, failures: ['signed readback completion attestation is missing'] }
  return verifySignedAttestation(attestation, context.attestationPolicy, attestationExpected({ kind: 'readback-completion', ...context }), options)
}

function issueRolloutAttestation(kind, {
  repoId, github, ringId, waveId, candidateRelease, candidatePlanDigest, predicateResults,
  verifiedReleaseEvidenceDigest, attestationPolicy, issuerRegistryDigest = attestationPolicy?.issuerRegistryDigest,
  stateDigest, defaultBranchHeadSha, actions, signerKeyId, subject, privateKey, issuedAt, expiresAt,
}) {
  invariant(candidateRelease && typeof candidateRelease === 'object', `Cannot issue ${kind} without an immutable candidate release`)
  invariant(/^[a-f0-9]{64}$/.test(candidateRelease.bomSha256 ?? ''), `Cannot issue ${kind} without a candidate BOM sha256`)
  invariant(/^[a-f0-9]{64}$/.test(verifiedReleaseEvidenceDigest ?? ''), `Cannot issue ${kind} without verified release evidence`)
  invariant(/^[a-f0-9]{64}$/.test(candidatePlanDigest ?? ''), `Cannot issue ${kind} without a candidate plan digest`)
  invariant(Array.isArray(predicateResults) && predicateResults.length > 0, `Cannot issue ${kind} without predicate evidence`)
  invariant(predicateResults.every(result => result.pass), `Cannot issue ${kind} while a predicate is failing`)
  return issueSignedAttestation({
    kind,
    repoId,
    github,
    ring: ringId,
    wave: waveId,
    candidateRelease,
    verifiedReleaseEvidenceDigest,
    candidatePlanDigest,
    predicateDigest: predicateEvidenceDigest(predicateResults),
    stateDigest,
    defaultBranchHeadSha,
    actionsDigest: candidateActionsDigest(actions),
    issuerRegistryDigest,
    issuedAt,
    expiresAt,
    signerKeyId,
    subject,
    privateKey,
  })
}

export function issueApplyAuthorization(input) {
  return issueRolloutAttestation('apply-authorization', input)
}

export function issueCompletionAttestation(input) {
  return issueRolloutAttestation('readback-completion', input)
}

function result(predicate, pass, evidence, message) {
  return {
    id: predicate.id,
    type: predicate.type,
    pass,
    evidenceDigest: digest(evidence),
    message,
  }
}

function relevantWaivers(repo, waivers, now) {
  return (waivers.waivers ?? []).filter(waiver => {
    if (waiver.scope?.repository !== repo.id && waiver.scope?.repository !== repo.github) return false
    return waiver.status === 'active' && new Date(waiver.expiresAt) > now
  })
}

function certifiedSurfaces(repo, certifications, now, requested) {
  const required = requested?.length ? requested : repo.providerSurfacesRequired
  const byKey = new Map(certifications.certifications.map(item => [certificationKey(item.provider, item.runtimeKind, item.surface, item.repositoryRole), item]))
  return required.map(requirement => {
    const [provider, runtimeKind, surface] = requirement.split('/')
    const certification = byKey.get(certificationKey(provider, runtimeKind, surface, repo.role))
    const pass = certification?.status === 'certified' && (!certification.expiresAt || new Date(certification.expiresAt) > now)
    return { requirement, pass, certification: certification ?? null }
  })
}

function successfulCheckEvidence(repo, materialized, observed, desired, now) {
  const maximumAgeMs = desired.checkRunMaxAgeMinutes * 60 * 1000
  return materialized.requiredChecks.map(check => {
    const integration = desired.integrations[check.integration]
    const matches = observed.checkRuns
      .filter(run => run.name === check.context && run.app?.id === integration.id && run.head_sha === observed.defaultBranchHeadSha)
      .sort((a, b) => compareUtf8Bytes(
        String(b.completed_at ?? b.started_at ?? ''),
        String(a.completed_at ?? a.started_at ?? ''),
      ))
    const run = matches[0] ?? null
    const completedAt = run?.completed_at ? new Date(run.completed_at) : null
    const headCommittedAt = observed.defaultBranchCommittedAt ? new Date(observed.defaultBranchCommittedAt) : null
    const producerFailures = validateRequiredCheckProducer({ run, check, integration, repo, observed })
    const fresh = Boolean(
      completedAt
      && Number.isFinite(completedAt.getTime())
      && completedAt <= new Date(now.getTime() + desired.checkRunClockSkewSeconds * 1000)
      && now.getTime() - completedAt.getTime() <= maximumAgeMs
      && headCommittedAt
      && Number.isFinite(headCommittedAt.getTime())
      && completedAt >= headCommittedAt,
    )
    return {
      context: check.context,
      integrationId: integration.id,
      expectedHeadSha: observed.defaultBranchHeadSha,
      run: run ? { id: run.id ?? null, headSha: run.head_sha ?? null, status: run.status ?? null, conclusion: run.conclusion ?? null, completedAt: run.completed_at ?? null } : null,
      producerFailures,
      fresh,
      pass: run?.conclusion === 'success' && run?.status === 'completed' && fresh && producerFailures.length === 0,
    }
  })
}

function validatedUpstreamAttestations({ ring, rings, candidateRelease, verifiedReleaseEvidenceDigest, candidatePlanDigest, candidatesByRepo, now, issuerRegistry }) {
  const upstreamRingIds = new Set(rings.rings.filter(candidate => candidate.order < ring.order).map(candidate => candidate.id))
  return Object.entries(rings.assignments)
    .filter(([, assignment]) => upstreamRingIds.has(assignment.ring))
    .map(([repoId, assignment]) => {
      const candidate = candidatesByRepo.get(repoId)
      if (!candidate) return { repoId, attestationDigest: null, pass: false, failures: ['upstream candidate evidence is missing'] }
      const envelope = verifyCompletionAttestation(assignment.completionAttestation, {
        repoId,
        github: candidate.github,
        ringId: assignment.ring,
        waveId: assignment.wave,
        candidateRelease,
        verifiedReleaseEvidenceDigest,
        candidatePlanDigest,
        predicateDigest: predicateEvidenceDigest(candidate.predicateResults),
        stateDigest: candidate.observedStateDigest,
        defaultBranchHeadSha: candidate.defaultBranchHeadSha,
        actionsDigest: candidateActionsDigest(candidate.actions),
        issuerRegistryDigest: rings.attestationPolicy.issuerRegistryDigest,
        attestationPolicy: rings.attestationPolicy,
      }, { now, issuerRegistry })
      const failures = [...envelope.failures]
      if (candidate.actions.length !== 0) failures.push('upstream repository is not aligned with desired state')
      if (candidate.conflicts.length !== 0) failures.push('upstream repository still has reconciliation conflicts')
      return { repoId, attestationDigest: assignment.completionAttestation ? digest(assignment.completionAttestation) : null, pass: failures.length === 0, failures }
    })
}

export function evaluatePromotionPredicates({
  repo,
  ring,
  assignment,
  rings,
  certifications,
  waivers,
  materialized,
  observed,
  desired,
  candidateRelease,
  verifiedReleaseEvidenceDigest,
  candidatePlanDigest: planDigest,
  candidatesByRepo = new Map(),
  candidateConflicts,
  now = new Date(),
  issuerRegistry,
  activationPolicy,
  expectedActivationPolicyDigest,
}) {
  const soakPredicates = ring.promotionPredicates.filter(predicate => SOAK_PREDICATE_TYPES.has(predicate.type))
  invariant(soakPredicates.length === 1, `Release ring ${ring.id} must define exactly one soak policy`)
  const deploymentProfile = resolveRolloutDeploymentProfile({
    activationPolicy,
    expectedActivationPolicyDigest,
  })
  invariant(
    soakPredicates[0].type === soakPredicateTypeForProfile(deploymentProfile.profile.id),
    `Deployment profile ${deploymentProfile.profile.id} requires release-ring predicate ${soakPredicateTypeForProfile(deploymentProfile.profile.id)}; received ${soakPredicates[0].type}`,
  )
  return ring.promotionPredicates.map(predicate => {
    if (predicate.type === 'manual-blockers-clear') {
      const evidence = { blockers: assignment.manualBlockers }
      return result(predicate, evidence.blockers.length === 0, evidence, evidence.blockers.length === 0 ? 'manual blockers clear' : 'manual blockers remain')
    }
    if (SOAK_PREDICATE_TYPES.has(predicate.type)) {
      return evaluateResolvedReleaseRingSoak({
        predicate,
        repo,
        ring,
        assignment,
        candidateRelease,
        now,
        ...deploymentProfile,
      })
    }
    if (predicate.type === 'required-checks-green') {
      const evidence = successfulCheckEvidence(repo, materialized, observed, desired, now)
      const pass = evidence.length > 0 && evidence.every(item => item.pass)
      return result(predicate, pass, evidence, pass ? 'required checks green' : 'required check evidence missing or not successful')
    }
    if (predicate.type === 'provider-surfaces-certified') {
      const evidence = certifiedSurfaces(repo, certifications, now, predicate.surfaces)
      const pass = evidence.length > 0 && evidence.every(item => item.pass)
      return result(predicate, pass, evidence, pass ? 'provider surfaces certified' : 'required provider certification missing, failed, or expired')
    }
    if (predicate.type === 'no-active-waiver-at-or-above') {
      const threshold = RISK_ORDER.get(predicate.risk)
      const evidence = relevantWaivers(repo, waivers, now).filter(waiver => RISK_ORDER.get(waiver.risk) >= threshold).map(waiver => ({ id: waiver.id, risk: waiver.risk, expiresAt: waiver.expiresAt }))
      return result(predicate, evidence.length === 0, evidence, evidence.length === 0 ? `no active ${predicate.risk}+ waiver` : `active ${predicate.risk}+ waiver exists`)
    }
    if (predicate.type === 'plan-conflict-free') {
      const evidence = [...candidateConflicts]
      return result(predicate, evidence.length === 0, evidence, evidence.length === 0 ? 'candidate plan conflict-free' : 'candidate plan has conflicts')
    }
    if (predicate.type === 'upstream-waves-promoted') {
      const evidence = validatedUpstreamAttestations({ ring, rings, candidateRelease, verifiedReleaseEvidenceDigest, candidatePlanDigest: planDigest, candidatesByRepo, now, issuerRegistry })
      const pass = evidence.every(item => item.pass)
      return result(predicate, pass, evidence, pass ? 'upstream promotion receipts valid' : 'upstream promotion receipt missing or invalid')
    }
    return result(predicate, false, { unsupportedType: predicate.type }, `unsupported promotion predicate ${predicate.type}`)
  })
}

export function candidatePlanDigest({ candidateRelease, verifiedReleaseEvidenceDigest, repoCandidates }) {
  invariant(candidateRelease === null ? verifiedReleaseEvidenceDigest === null : /^[a-f0-9]{64}$/.test(verifiedReleaseEvidenceDigest ?? ''), 'candidate plan requires release evidence exactly when a candidate release exists')
  return digest({ candidateRelease, verifiedReleaseEvidenceDigest, repoCandidates })
}

function waveFor(ring, waveId) {
  return ring.waves.find(wave => wave.id === waveId)
}

function rolloutAttestationContext({ repo, assignment, rings, candidateRelease, verifiedReleaseEvidenceDigest, planDigest, candidate }) {
  return {
    repoId: repo.id,
    github: repo.github,
    ringId: assignment.ring,
    waveId: assignment.wave,
    candidateRelease,
    verifiedReleaseEvidenceDigest,
    candidatePlanDigest: planDigest,
    predicateDigest: predicateEvidenceDigest(candidate.predicateResults),
    stateDigest: candidate.observedStateDigest,
    defaultBranchHeadSha: candidate.defaultBranchHeadSha,
    actionsDigest: candidateActionsDigest(candidate.actions),
    issuerRegistryDigest: rings.attestationPolicy.issuerRegistryDigest,
    attestationPolicy: rings.attestationPolicy,
  }
}

export function resolveRolloutWave({ inventory, rings, candidateRelease, verifiedReleaseEvidenceDigest, candidatePlanDigest: planDigest, repoCandidates, now = new Date(), issuerRegistry }) {
  const ringById = new Map(rings.rings.map(ring => [ring.id, ring]))
  const candidateByRepo = new Map(repoCandidates.map(candidate => [candidate.repoId, candidate]))
  const completion = new Map()
  for (const repo of inventory.repositories) {
    const assignment = rings.assignments[repo.id]
    const candidate = candidateByRepo.get(repo.id)
    const envelope = candidate
      ? verifyCompletionAttestation(assignment.completionAttestation, rolloutAttestationContext({ repo, assignment, rings, candidateRelease, verifiedReleaseEvidenceDigest, planDigest, candidate }), { now, issuerRegistry })
      : { valid: false, failures: ['candidate evidence is missing'] }
    completion.set(repo.id, envelope.valid && candidate.actions.length === 0 && candidate.conflicts.length === 0 && candidate.predicateResults.every(result => result.pass))
  }

  let current = null
  for (const ring of [...rings.rings].sort((a, b) => a.order - b.order)) {
    for (const wave of [...ring.waves].sort((a, b) => a.order - b.order)) {
      const repoIds = inventory.repositories
        .filter(repo => rings.assignments[repo.id].ring === ring.id && rings.assignments[repo.id].wave === wave.id)
        .map(repo => repo.id)
      if (repoIds.some(repoId => !completion.get(repoId))) {
        current = { ring, wave, repoIds }
        break
      }
    }
    if (current) break
  }
  if (!current) return { complete: true, current: null, selectedRepoIds: [], budget: 0, blockers: [] }

  const authorized = []
  const blockers = []
  for (const repoId of current.repoIds) {
    const repo = inventory.repositories.find(item => item.id === repoId)
    const assignment = rings.assignments[repoId]
    const candidate = candidateByRepo.get(repoId)
    if (completion.get(repoId)) continue
    const envelope = verifyApplyAuthorization(assignment.applyAuthorization, rolloutAttestationContext({ repo, assignment, rings, candidateRelease, verifiedReleaseEvidenceDigest, planDigest, candidate }), { now, issuerRegistry })
    const failures = [...envelope.failures]
    if (!candidate.predicateResults.every(result => result.pass)) failures.push('one or more typed promotion predicates are failing')
    if (candidate.conflicts.length > 0) failures.push('candidate plan has conflicts')
    if (failures.length === 0) authorized.push(repoId)
    else blockers.push(...failures.map(failure => `${repoId}: ${failure}`))
  }

  const budget = Math.min(current.ring.maxParallel, current.wave.maxParallel)
  if (authorized.length > budget) blockers.push(`parallel budget exceeded for ${current.ring.id}/${current.wave.id}: authorized=${authorized.length}, budget=${budget}`)
  return {
    complete: false,
    current: { ring: current.ring.id, wave: current.wave.id, repoIds: current.repoIds },
    selectedRepoIds: authorized.length <= budget ? authorized : [],
    budget,
    blockers,
  }
}

export function validateRolloutShape(inventory, rings, {
  issuerRegistry,
  now = new Date(),
  activationPolicy,
  expectedActivationPolicyDigest,
} = {}) {
  invariant(rings?.schemaVersion === 3, 'Release rings schemaVersion must be 3')
  const deploymentProfile = resolveRolloutDeploymentProfile({
    activationPolicy,
    expectedActivationPolicyDigest,
  })
  const expectedSoakPredicateType = soakPredicateTypeForProfile(deploymentProfile.profile.id)
  validateAttestationPolicy(rings.attestationPolicy, { issuerRegistry, now })
  invariant(rings.candidateRelease === null || (typeof rings.candidateRelease === 'object' && !Array.isArray(rings.candidateRelease)), 'candidateRelease must be null or an object')
  if (rings.candidateRelease) validateCandidateRelease(rings.candidateRelease)
  invariant(Array.isArray(rings.evidence), 'Release ring evidence ledger must be an array')
  invariant(rings.evidence.length === 0, 'Release ring self-declared evidence is unsupported without an externally verifiable binding')
  for (const ring of rings.rings) {
    invariant(Array.isArray(ring.waves) && ring.waves.length > 0, `Release ring ${ring.id} must define waves`)
    const waveIds = new Set()
    const waveOrders = new Set()
    for (const wave of ring.waves) {
      invariant(typeof wave.id === 'string' && wave.id.trim() !== '', `Release ring ${ring.id} wave id is required`)
      invariant(!waveIds.has(wave.id), `Duplicate wave ${ring.id}/${wave.id}`)
      invariant(Number.isInteger(wave.order) && wave.order >= 0 && !waveOrders.has(wave.order), `Release ring ${ring.id} wave order is invalid or duplicated`)
      invariant(Number.isInteger(wave.maxParallel) && wave.maxParallel >= 1 && wave.maxParallel <= ring.maxParallel, `Release ring ${ring.id}/${wave.id} maxParallel exceeds its ring budget`)
      waveIds.add(wave.id)
      waveOrders.add(wave.order)
    }
    invariant(Array.isArray(ring.promotionPredicates) && ring.promotionPredicates.length > 0, `Release ring ${ring.id} must define typed promotion predicates`)
    const soakPredicates = ring.promotionPredicates.filter(predicate => SOAK_PREDICATE_TYPES.has(predicate.type))
    invariant(soakPredicates.length === 1, `Release ring ${ring.id} must define exactly one soak policy`)
    invariant(soakPredicates[0].type === expectedSoakPredicateType,
      `Deployment profile ${deploymentProfile.profile.id} requires release-ring predicate ${expectedSoakPredicateType}; received ${soakPredicates[0].type}`)
    const predicateIds = new Set()
    for (const predicate of ring.promotionPredicates) {
      invariant(typeof predicate.id === 'string' && predicate.id.trim() !== '', `Release ring ${ring.id} predicate id is required`)
      invariant(!predicateIds.has(predicate.id), `Duplicate release ring predicate ${ring.id}/${predicate.id}`)
      invariant(PROMOTION_PREDICATE_TYPES.has(predicate.type), `Unsupported release ring predicate ${predicate.type}`)
      if (predicate.type === 'no-active-waiver-at-or-above') invariant(RISK_ORDER.has(predicate.risk), `Predicate ${predicate.id} has invalid waiver risk`)
      if (predicate.type === 'provider-surfaces-certified' && predicate.surfaces !== undefined) invariant(Array.isArray(predicate.surfaces) && predicate.surfaces.length > 0, `Predicate ${predicate.id} surfaces must be non-empty`)
      predicateIds.add(predicate.id)
    }
    for (const [repoId, assignment] of Object.entries(rings.assignments)) {
      if (assignment.ring !== ring.id) continue
      invariant(waveIds.has(assignment.wave), `Release-ring assignment ${repoId} references unknown wave ${ring.id}/${assignment.wave}`)
    }
  }
  return true
}

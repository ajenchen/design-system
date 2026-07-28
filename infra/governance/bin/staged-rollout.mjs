#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, openSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appendCanonicalCandidateFreezeReceipt,
  createCanonicalCandidateFreezeSigningRequest,
  DEFAULT_STAGED_ROLLOUT_PLAN_PATH,
  REPOSITORY_ROOT,
  initializeCanonicalStagedRolloutLedger,
  loadStagedRolloutPlan,
  mintCanonicalStagedRolloutExecutionPackage,
  prepareCanonicalStagedRolloutLedger,
  validateCanonicalStagedRolloutLedger,
  validateStagedRolloutPlan,
} from '../lib/staged-rollout.mjs'
import { invariant, sha256, stableStringify } from '../lib/common.mjs'
import { loadActiveDeepAuditRun } from '../../../scripts/lib/deep-audit-evidence-contract.mjs'

function parseArgs(argv) {
  const result = { capabilities: [], json: false, plan: false, check: false, initLedger: false, preparePlan: false, prepareFreeze: false, createSigningRequest: false, appendSignedReceipt: false }
  const values = new Set(['--plan-file', '--ledger', '--rings', '--issuer-registry', '--evidence-root', '--authority-bootstrap-replay-receipt', '--package-phase', '--decision', '--capability', '--output', '--actor-id', '--actor-kind'])
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--json') { result.json = true; continue }
    if (token === '--plan') { result.plan = true; continue }
    if (token === '--check') { result.check = true; continue }
    if (token === '--init-ledger') { result.initLedger = true; continue }
    if (token === '--prepare-plan') { result.preparePlan = true; continue }
    if (token === '--prepare-freeze') { result.prepareFreeze = true; continue }
    if (token === '--create-signing-request') { result.createSigningRequest = true; continue }
    if (token === '--append-signed-receipt') { result.appendSignedReceipt = true; continue }
    invariant(values.has(token), `Unknown option ${token}`)
    const value = argv[index + 1]
    invariant(value && !value.startsWith('--'), `${token} requires a value`)
    if (token === '--capability') result.capabilities.push(value)
    else result[token.slice(2)] = value
    index += 1
  }
  return result
}

function modeFor(args) {
  const selected = [args.plan, args.check, args.initLedger, args.preparePlan, args.prepareFreeze, args.createSigningRequest, args.appendSignedReceipt, Boolean(args['package-phase'])].filter(Boolean).length
  invariant(selected <= 1, 'Select at most one of --plan, --check, --init-ledger, --prepare-plan, --prepare-freeze, --create-signing-request, --append-signed-receipt, or --package-phase')
  if (args['package-phase']) return 'package'
  if (args.initLedger) return 'init-ledger'
  if (args.preparePlan) return 'prepare-plan'
  if (args.prepareFreeze) return 'prepare-freeze'
  if (args.createSigningRequest) return 'create-signing-request'
  if (args.appendSignedReceipt) return 'append-signed-receipt'
  if (args.check) return 'check'
  return 'plan'
}

function planReport(plan, validation) {
  return {
    schemaVersion: 1,
    kind: 'staged-rollout-plan-report',
    mode: 'plan',
    mutatesExternalState: false,
    planSha256: validation.planSha256,
    deploymentProfile: plan.deploymentProfileBinding.profile,
    candidateValidationLifecycle: plan.candidateValidationLifecycle,
    phases: plan.phases.map(phase => ({
      id: phase.id,
      predecessor: phase.predecessor,
      scope: phase.scope,
      capabilities: phase.capabilities,
      evidenceContracts: phase.evidenceContracts,
    })),
  }
}

function printHuman(report) {
  if (report.kind === 'staged-rollout-plan-report') {
    process.stdout.write(`Staged rollout plan ${report.planSha256}\n`)
    process.stdout.write('Mode: plan only; no external state is mutated.\n')
    process.stdout.write(`Deployment profile: ${report.deploymentProfile.id}\n`)
    process.stdout.write(`Candidate validation: ${report.candidateValidationLifecycle.targetCreationOrder} -> ${report.candidateValidationLifecycle.receiptCompletionGate}\n`)
    for (const phase of report.phases) process.stdout.write(`${phase.id}: ${phase.scope}\n`)
    return
  }
  process.stdout.write(`Staged rollout check: ${report.rolloutValid ?? report.valid ? 'valid' : 'blocked'}\n`)
  process.stdout.write(`Completed: ${report.completedPhases?.join(' -> ') || 'none'}\n`)
  process.stdout.write(`Release: ${report.releaseStatus ?? 'UNKNOWN'}\n`)
  if (report.deferredExecutionPackageBinding) {
    process.stdout.write(
      `Deferred package: ${report.deferredExecutionPackageBinding.phaseId}; candidate ${report.deferredExecutionPackageBinding.candidateReleaseDigest}; prerequisite ${report.deferredExecutionPackageBinding.prerequisiteReceiptSha256}\n`,
    )
  }
  process.stdout.write(`Next: ${report.nextPhase ?? 'complete'}\n`)
}

function preparePlanReport(args, plan) {
  const evidenceRoot = args['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null
  let activeRun = null
  let activeRunFailure = null
  try { activeRun = loadActiveDeepAuditRun({ repoRoot: REPOSITORY_ROOT, explicitRoot: evidenceRoot, requireCurrent: true }) }
  catch (error) { activeRunFailure = error.message }
  const productionGrade = plan.deploymentProfileBinding.profile.id === 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM'
  return {
    schemaVersion: 1,
    kind: 'staged-rollout-prepare-plan',
    mode: 'plan',
    mutatesExternalState: false,
    ready: false,
    activeRun: activeRun ? {
      runId: activeRun.manifest.runId,
      manifestSha256: activeRun.manifestSha256,
      head: activeRun.manifest.head,
      tree: activeRun.manifest.tree,
    } : null,
    requiredPhase: {
      id: plan.phases[0].id,
      capabilities: plan.phases[0].capabilities.standard,
      evidenceContracts: plan.phases[0].evidenceContracts.standard,
      mechanismRefs: plan.phases[0].mechanismRefs,
    },
    deploymentProfile: plan.deploymentProfileBinding.profile,
    candidateValidationLifecycle: plan.candidateValidationLifecycle,
    blockers: [
      ...(activeRunFailure ? [{ contract: 'deep-audit-active-run-v1', reason: activeRunFailure, producer: 'node scripts/prepare-deep-audit-run.mjs' }] : []),
      ...(!productionGrade ? [{
        contract: 'candidate-freeze-bootstrap-prerequisites-v1',
        reason: 'every release-scope external activation, including the protected-main managed-CI two-PR bootstrap, plus an eligible completion-attestor quorum must be current before freeze preparation; changing those canonical inputs afterward invalidates the run and requires a new freeze',
        producers: ['npm run governance:activation-readiness -- --json', 'infra/governance/external-activation-requirements.json', 'infra/governance/trust/issuers.json'],
      }] : []),
      {
        contract: 'candidate-freeze-verification-v2',
        reason: productionGrade
          ? 'the immutable active-run manifest and canonical Git projection create the target before All-Harness; exactly one passing All-Harness receipt on the unchanged target gates signed candidate-freeze receipt completion, while external activation is deferred to github-policy-bootstrap'
          : 'phase 0 requires the complete tracked plus nonignored-untracked inventory, its compact content artifact and canonical Git tree/commit projection, plus exact All-Harness receipt and build-graph checks; it is never promotion-eligible',
        producers: ['node infra/governance/bin/run-harnesses.mjs', 'node scripts/governance-build-graph.mjs --check', 'node infra/governance/bin/staged-rollout.mjs --prepare-freeze'],
      },
    ],
    next: activeRunFailure
      ? 'create an immutable candidate-freeze run'
      : productionGrade
        ? 'validate the exact immutable active-run target once, complete its candidate-freeze receipt, then converge profile activation before opening the protected PR'
        : 'activate and independently attest every release-scope prerequisite first, then prepare and sign a new candidate freeze; PR-head certification owns dependency/model/compliance evidence',
  }
}

function writeNewLedger(path, bytes) {
  const absolute = resolve(path)
  const parent = dirname(absolute)
  const parentInfo = lstatSync(parent)
  invariant(parentInfo.isDirectory() && !parentInfo.isSymbolicLink() && realpathSync(parent) === parent, '--output parent must be an existing real directory')
  const temporary = resolve(parent, `.${basename(absolute)}.${process.pid}.${randomUUID()}.tmp`)
  let descriptor = null
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    linkSync(temporary, absolute)
    unlinkSync(temporary)
    const directoryDescriptor = openSync(parent, 'r')
    try { fsyncSync(directoryDescriptor) } finally { closeSync(directoryDescriptor) }
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  return absolute
}

export function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const mode = modeFor(args)
  invariant(!args.decision || mode === 'package', '--decision is valid only with --package-phase')
  invariant(args.capabilities.length === 0 || mode === 'package', '--capability is valid only with --package-phase')
  invariant(!args['actor-id'] || mode === 'create-signing-request', '--actor-id is valid only with --create-signing-request')
  invariant(!args['actor-kind'] || mode === 'create-signing-request', '--actor-kind is valid only with --create-signing-request')
  invariant(!args.output || mode === 'init-ledger', '--output is valid only with --init-ledger')
  invariant(!args['authority-bootstrap-replay-receipt'] || mode === 'prepare-freeze',
    '--authority-bootstrap-replay-receipt is valid only with --prepare-freeze')
  invariant(!args.ledger || mode !== 'plan', '--ledger requires --check or --package-phase')
  if (mode !== 'plan') invariant(!args['plan-file'] && !args.rings && !args['issuer-registry'], `${mode} accepts only canonical plan/rings/issuer paths`)
  const planPath = resolve(args['plan-file'] ?? DEFAULT_STAGED_ROLLOUT_PLAN_PATH)
  const plan = loadStagedRolloutPlan(planPath, { repoRoot: REPOSITORY_ROOT })
  const planValidation = validateStagedRolloutPlan(plan, { repoRoot: REPOSITORY_ROOT })
  if (mode === 'plan') {
    const report = planReport(plan, planValidation)
    if (args.json) process.stdout.write(`${stableStringify(report)}\n`)
    else printHuman(report)
    return report
  }
  if (mode === 'prepare-plan') {
    const report = preparePlanReport(args, plan)
    process.stdout.write(`${stableStringify(report)}\n`)
    return report
  }
  if (mode === 'prepare-freeze') {
    invariant(!args.ledger, '--prepare-freeze does not accept --ledger')
    const report = prepareCanonicalStagedRolloutLedger({
      evidenceRoot: args['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null,
      authorityBootstrapReplayReceiptPath: args['authority-bootstrap-replay-receipt']
        ?? process.env.GOVERNANCE_AUTHORITY_BOOTSTRAP_REPLAY_RECEIPT,
    })
    process.stdout.write(`${stableStringify(report)}\n`)
    return report
  }
  if (mode === 'create-signing-request') {
    invariant(!args.ledger, '--create-signing-request uses the canonical prepared ledger and does not accept --ledger')
    const report = createCanonicalCandidateFreezeSigningRequest({
      evidenceRoot: args['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null,
      ...(args['actor-id'] ? { actorId: args['actor-id'] } : {}),
      ...(args['actor-kind'] ? { actorKind: args['actor-kind'] } : {}),
    })
    process.stdout.write(`${stableStringify(report)}\n`)
    return report
  }
  if (mode === 'append-signed-receipt') {
    invariant(!args.ledger, '--append-signed-receipt uses the canonical prepared ledger and does not accept --ledger')
    const report = appendCanonicalCandidateFreezeReceipt({ evidenceRoot: args['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null })
    process.stdout.write(`${stableStringify(report)}\n`)
    return report
  }
  if (mode === 'init-ledger') {
    invariant(!args.ledger, '--init-ledger does not accept --ledger')
    const ledger = initializeCanonicalStagedRolloutLedger({ evidenceRoot: args['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null })
    const bytes = Buffer.from(stableStringify(ledger, 0), 'utf8')
    const ledgerSha256 = sha256(bytes)
    if (args.output) {
      const path = writeNewLedger(args.output, bytes)
      process.stdout.write(`${stableStringify({ schemaVersion: 1, kind: 'staged-rollout-ledger-init-report', path, ledgerSha256, bytes: bytes.length, created: true })}\n`)
    } else {
      process.stdout.write(`${bytes.toString('utf8')}\n`)
      process.stderr.write(`staged-rollout canonical ledger sha256:${ledgerSha256}\n`)
    }
    return ledger
  }
  if (mode === 'check' && !args.ledger) {
    const report = {
      schemaVersion: 1,
      kind: 'staged-rollout-check-report',
      mode: 'check',
      mutatesExternalState: false,
      planValid: true,
      rolloutValid: false,
      executionReady: false,
      planSha256: planValidation.planSha256,
      ledgerPresent: false,
      blockers: [{ code: 'missing-ledger', message: 'No staged-rollout ledger was supplied; plan validity is not rollout validity.' }],
      completedPhases: [],
      nextPhase: 'candidate-freeze',
      releaseStatus: 'NOT_RELEASED',
      candidateReleaseDigest: null,
      deferredExecutionPackageBinding: null,
    }
    if (args.json) process.stdout.write(`${stableStringify(report)}\n`)
    else printHuman(report)
    return report
  }

  invariant(args.ledger, `${mode === 'check' ? '--check' : '--package-phase'} requires --ledger`)
  if (mode === 'package') {
    const executionPackage = mintCanonicalStagedRolloutExecutionPackage({
      ledgerPath: args.ledger,
      evidenceRoot: args['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null,
      phaseId: args['package-phase'],
      capabilities: args.capabilities,
      decision: args.decision ?? null,
    })
    process.stdout.write(`${stableStringify(executionPackage)}\n`)
    return executionPackage
  }
  const validation = validateCanonicalStagedRolloutLedger({
    ledgerPath: args.ledger,
    evidenceRoot: args['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null,
  })
  if (mode === 'check') {
    const report = { schemaVersion: 1, kind: 'staged-rollout-check-report', mode: 'check', mutatesExternalState: false, ...validation }
    if (args.json) process.stdout.write(`${stableStringify(report)}\n`)
    else printHuman(report)
    return report
  }
  return validation
}

const IS_MAIN = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()

if (IS_MAIN) {
  try { run() }
  catch (error) {
    process.stderr.write(`staged-rollout blocked: ${error.message}\n`)
    process.exitCode = 1
  }
}

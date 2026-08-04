#!/usr/bin/env node
// Completion gate for one immutable, Git-owned deep-audit run.  Flat legacy
// JSON/logs are intentionally never upgraded or inferred as evidence.

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  digestInventorySelection,
  loadActiveDeepAuditRun,
  stableStringify,
  validateDeepAuditEvidenceEnvelope,
  validateDeepAuditRunProviderBindings,
} from './lib/deep-audit-evidence-contract.mjs'
import { resolveRuntimeEvidencePath } from './lib/governance-runtime-evidence.mjs'
import {
  NETLIFY_LIVE_CREDENTIAL_REFERENCES,
  NETLIFY_LIVE_UNOBSERVED_REASON,
  assertDeterministicMatrixParity,
  canonicalDeterministicRunnerArgv,
  canonicalDeterministicUnobservedRunnerArgv,
  deterministicCapabilitiesForDimension,
  expandDeterministicCoverage,
  loadDeterministicDeepAuditPlan,
} from './lib/deep-audit-deterministic-plan.mjs'
import { loadHookEvidencePlan, selectFrozenHookInventory } from './lib/hook-evidence-plan.mjs'
import {
  loadAuditCoverageTiers,
  loadWaivedSelfReviewBundle,
  waivedSelfReviewContract,
} from './lib/waived-self-review.mjs'

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  throw new Error(`deep-audit coverage verification failed closed:${message}`)
}

export function parseVerifierArgs(argv) {
  const result = { json: false, require: 'promotion' }
  let requirementWasExplicit = false
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--json') { result.json = true; continue }
    if (token === '--require' || token.startsWith('--require=')) {
      if (requirementWasExplicit) fail('--require may only be provided once')
      const value = token.startsWith('--require=') ? token.slice('--require='.length) : argv[++index]
      if (!['coverage', 'promotion'].includes(value)) fail('--require must be coverage or promotion')
      result.require = value
      requirementWasExplicit = true
      continue
    }
    if (!['--repo-root', '--evidence-root', '--self-provider', '--peer-provider', '--author-provider'].includes(token)) fail(`unknown option:${token}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) fail(`${token} requires a value`)
    result[token.slice(2)] = value
    index += 1
  }
  return result
}

function exact(value, expected, label) {
  if (stableStringify(value) !== stableStringify(expected)) fail(`${label} differs from the canonical execution plan`)
}

export function hookDimensionNumbers(hookState) {
  if (!Array.isArray(hookState?.hookDimensions)) fail('hook plan dimension index is missing')
  const dimensions = hookState.hookDimensions.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || !Number.isInteger(record.dim)) {
      fail(`hook plan dimension index entry ${index} is invalid`)
    }
    return record.dim
  })
  if (new Set(dimensions).size !== dimensions.length
    || dimensions.some((dim, index) => index > 0 && dim <= dimensions[index - 1])) fail('hook plan dimension index must be unique and sorted')
  return dimensions
}

function expectedDeterministicRunner(payload, command, planState) {
  const dimsArg = command.argv.find((arg) => /^--dims=/.test(arg))
  if (!dimsArg) fail(`deterministic dim ${payload.dim} runner argv lacks --dims`)
  const dims = dimsArg.slice('--dims='.length).split(',').map(Number)
  if (!dims.includes(payload.dim) || dims.some((dim) => !planState.dimensionByNumber.has(dim))) fail(`deterministic dim ${payload.dim} runner dim set is invalid`)
  const capabilities = new Set(dims.flatMap((dim) => deterministicCapabilitiesForDimension(planState, dim)))
  const allowBuild = capabilities.has('build')
  const allowNetwork = capabilities.has('network')
  const allowPublishedRelease = capabilities.has('published-release')
  exact(command.argv, canonicalDeterministicRunnerArgv({ dims, allowBuild, allowNetwork, allowPublishedRelease }), `deterministic dim ${payload.dim} runner argv`)
}

export function validateDeterministicReceipt(envelope, dim, active, planState) {
  const dimension = planState.dimensionByNumber.get(dim)
  if (!dimension) fail(`deterministic dim ${dim} is absent from the canonical execution plan`)
  const payload = envelope.payload
  if (payload.dim !== dim || payload.name !== dimension.name || payload.planDigest !== planState.planDigest) fail(`deterministic dim ${dim} plan identity mismatches`)
  exact(payload.capabilities, deterministicCapabilitiesForDimension(planState, dim), `deterministic dim ${dim} capabilities`)
  exact(payload.commandIds, dimension.commandIds, `deterministic dim ${dim} command ids`)
  if (payload.status === 'UNOBSERVED') {
    const policy = dimension.unobservedPolicy
    if (!policy || dim !== 83
      || payload.reasonCode !== policy.reasonCode
      || payload.reasonCode !== NETLIFY_LIVE_UNOBSERVED_REASON
      || payload.observedAt !== envelope.command.finishedAt) {
      fail(`deterministic dim ${dim} UNOBSERVED identity/reason mismatches canonical policy`)
    }
    exact(payload.credentialReferences, {
      required: [...NETLIFY_LIVE_CREDENTIAL_REFERENCES],
      observed: [],
    }, `deterministic dim ${dim} credential-reference receipt`)
    exact(
      envelope.command.argv,
      canonicalDeterministicUnobservedRunnerArgv({ dim, reasonCode: policy.reasonCode }),
      `deterministic dim ${dim} UNOBSERVED runner argv`,
    )
    if (envelope.command.exitCode !== 0) fail(`deterministic dim ${dim} UNOBSERVED recorder did not complete`)
    exact(envelope.coverage, expandDeterministicCoverage(planState, active.manifest, dim), `deterministic dim ${dim} coverage`)
    return { status: 'UNOBSERVED', reasonCode: policy.reasonCode }
  }
  if (payload.commands.length !== dimension.commandIds.length) fail(`deterministic dim ${dim} command receipt count mismatches`)
  for (let index = 0; index < dimension.commandIds.length; index += 1) {
    const planned = planState.commandById.get(dimension.commandIds[index])
    const observed = payload.commands[index]
    exact(observed.argv, planned.argv, `deterministic dim ${dim} command ${planned.id} argv`)
    if (!planned.completion.acceptedExitCodes.includes(observed.exitCode)) fail(`deterministic dim ${dim} command ${planned.id} exit was not accepted`)
  }
  expectedDeterministicRunner(payload, envelope.command, planState)
  exact(envelope.coverage, expandDeterministicCoverage(planState, active.manifest, dim), `deterministic dim ${dim} coverage`)
  return { status: 'PASS', reasonCode: null }
}

function validateHookReceipt(envelope, dim, active, hookState, hookCoverage) {
  const dimension = hookState.plan.dimensions.find((item) => item.dim === dim)
  if (!dimension) fail(`hook dim ${dim} is absent from canonical hook evidence plan`)
  if (envelope.payload.dim !== dim || envelope.payload.capability !== dimension.capability) fail(`hook dim ${dim} capability mismatches canonical plan`)
  if (envelope.payload.enforcementSuiteReceipt.planSha256 !== hookState.digests.planSha256
    || envelope.payload.replayReceipt.planSha256 !== hookState.digests.planSha256) fail(`hook dim ${dim} plan digest mismatches`)
  exact(envelope.payload.enforcementSuiteReceipt.tests, dimension.enforcementTests.map((test) => ({ test, observed: true })), `hook dim ${dim} enforcement tests`)
  exact(envelope.coverage, hookCoverage, `hook dim ${dim} coverage`)
  const expectedInvocations = hookCoverage.filesScanned * dimension.fileReplays.length
  if (envelope.payload.replayReceipt.invocationCount !== expectedInvocations) fail(`hook dim ${dim} invocation coverage is incomplete`)
  const expectedFocused = dimension.focusedContracts.map((contract) => ({
    contract: contract.contract,
    hook: contract.hook,
    event: contract.event,
    tool: contract.tool,
    test: contract.test,
    observed: true,
  }))
  exact(envelope.payload.replayReceipt.focusedContracts, expectedFocused, `hook dim ${dim} focused contracts`)
}

function expectedPathSet(tiers) {
  // Post-retirement (2026-08-04) the waived self-review is the only review
  // route, so judgment/A1b model envelope paths no longer exist.
  const paths = new Set(['run-manifest.json'])
  for (const dim of tiers.DETERMINISTIC) paths.add(`deterministic/dim-${dim}.json`)
  paths.add(waivedSelfReviewContract.relativePath)
  for (const dim of tiers['HOOK-ENFORCED']) paths.add(`hook-residue/dim-${dim}.json`)
  for (const dim of tiers['CI-ENFORCED']) paths.add(`ci-enforced/dim-${dim}.json`)
  return paths
}

function scanClosedRunTree(active, expectedFiles) {
  const allowedDirectories = new Set([''])
  for (const path of expectedFiles) {
    const segments = path.split('/')
    for (let index = 1; index < segments.length; index += 1) allowedDirectories.add(segments.slice(0, index).join('/'))
  }
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name)
      const path = relative(active.runRoot, absolute).split(sep).join('/')
      const info = lstatSync(absolute)
      if (info.isSymbolicLink()) fail(`active run contains symbolic-link evidence:${path}`)
      if (info.isDirectory()) {
        if (!allowedDirectories.has(path)) fail(`active run contains an unknown evidence directory:${path}`)
        walk(absolute)
      } else if (info.isFile()) {
        if (info.nlink !== 1) fail(`active run contains hard-link evidence:${path}`)
        if (!expectedFiles.has(path)) fail(`active run contains an unknown/mixed evidence file:${path}`)
      } else fail(`active run contains unsupported evidence type:${path}`)
    }
  }
  walk(active.runRoot)
}

function rejectLegacyOrPoisonedRoot(active) {
  const entries = readdirSync(active.deepAuditRoot, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = resolve(active.deepAuditRoot, entry.name)
    const info = lstatSync(absolute)
    if (info.isSymbolicLink()) fail(`deep-audit root contains a symbolic link:${entry.name}`)
    if (!['active-run.json', 'runs'].includes(entry.name)) fail(`legacy/poisoned flat evidence is forbidden:${entry.name}`)
    if (entry.name === 'active-run.json' && (!info.isFile() || info.nlink !== 1)) fail('active run pointer is not a unique regular file')
    if (entry.name === 'runs' && !info.isDirectory()) fail('deep-audit runs root is not a directory')
  }
  const runsRoot = resolve(active.deepAuditRoot, 'runs')
  for (const entry of readdirSync(runsRoot, { withFileTypes: true })) {
    const info = lstatSync(resolve(runsRoot, entry.name))
    if (info.isSymbolicLink() || !info.isDirectory()) fail(`deep-audit run entry is unsafe:${entry.name}`)
  }
}

function readEnvelope(active, explicitRoot, relativePath) {
  const fullRelative = `deep-audit/runs/${active.manifest.runId}/${relativePath}`
  const path = resolveRuntimeEvidencePath({ repoRoot: active.repository, explicitRoot, relativePath: fullRelative })
  if (!existsSync(path)) return null
  let envelope
  try { envelope = JSON.parse(readFileSync(path, 'utf8')) } catch (error) { fail(`evidence is invalid JSON:${relativePath}:${error.message}`) }
  validateDeepAuditEvidenceEnvelope(envelope, {
    manifest: active.manifest,
    manifestSha256: active.manifestSha256,
    relativePath,
    requireCurrentEnvironment: false,
    repoRoot: active.repository,
  })
  return envelope
}

export function summarizeDeepAuditCompliance({ totalGaps, envelopes, waivedSelfReview = null } = {}) {
  if (!Number.isSafeInteger(totalGaps) || totalGaps < 0 || !Array.isArray(envelopes)) {
    fail('compliance summary inputs are invalid')
  }
  const findings = {
    judgment: 0,
    componentA1b: 0,
    hookWarnings: 0,
    hookBlocking: 0,
  }
  const trustDowngrades = {
    untrustedDependencies: 0,
    unverifiedContainment: 0,
    unverifiedModelCoverage: 0,
    unobservedDeterministicCoverage: 0,
  }
  for (const envelope of envelopes) {
    if (envelope.evidenceKind === 'deep-audit-judgment') findings.judgment += envelope.payload.findings.length
    if (envelope.evidenceKind === 'deep-audit-component-a1b') findings.componentA1b += envelope.payload.falseClaims.length
    if (envelope.evidenceKind === 'deep-audit-hook-residue') {
      findings.hookWarnings += envelope.payload.replayReceipt.warningCount
      findings.hookBlocking += envelope.payload.replayReceipt.blockingCount
    }
    const sandbox = envelope.payload?.sandboxReceipt
    if (sandbox?.dependencyTrust === 'untrusted-local-copy') trustDowngrades.untrustedDependencies += 1
    if (sandbox?.externalWriteContainment === 'unverified') trustDowngrades.unverifiedContainment += 1
    if (['deep-audit-judgment', 'deep-audit-component-a1b'].includes(envelope.evidenceKind)
      && !envelope.payload.brokerReceipt && envelope.payload.accessReceipt?.status !== 'verified') {
      trustDowngrades.unverifiedModelCoverage += 1
    }
    if (envelope.evidenceKind === 'deep-audit-deterministic' && envelope.payload.status === 'UNOBSERVED') {
      trustDowngrades.unobservedDeterministicCoverage += 1
    }
  }
  if (waivedSelfReview !== null) {
    findings.judgment += waivedSelfReview.judgmentReviews
      .reduce((sum, review) => sum + review.findings.length, 0)
    findings.componentA1b += waivedSelfReview.componentA1bReviews
      .reduce((sum, review) => sum + review.findings.length, 0)
    // A local self-attestation can close enumeration coverage for a user-waived
    // run, but it is intentionally not verified model/independent evidence.
    trustDowngrades.unverifiedModelCoverage += 1
  }
  const coverageStatus = totalGaps === 0 ? 'complete' : 'incomplete'
  const findingCount = Object.values(findings).reduce((sum, count) => sum + count, 0)
  const trustDowngradeCount = Object.values(trustDowngrades).reduce((sum, count) => sum + count, 0)
  const complianceStatus = trustDowngradeCount > 0
    ? 'blocked'
    : findingCount > 0 ? 'findings-present' : 'clean'
  // Promotion is an ACHIEVABLE gate (2026-08-04, §7 item 9): complete coverage with no open
  // findings. Trust downgrades stay fully visible — complianceStatus still reads 'blocked' and the
  // counts ship in the verdict — but they no longer force the gate structurally false: with no
  // certified peer and no Netlify credential in this deployment, a waived self-review and the dim-83
  // UNOBSERVED receipt made promotionEligible a constant, and a gate that can never pass carries
  // zero information while diluting the gates that can. Honest annotation beats impossible gating.
  const promotionEligible = coverageStatus === 'complete' && findingCount === 0
  return {
    coverageStatus,
    complianceStatus,
    promotionEligible,
    status: coverageStatus === 'incomplete'
      ? 'incomplete'
      : complianceStatus === 'clean' ? 'complete-clean' : 'complete-with-findings',
    findings,
    trustDowngrades,
  }
}

export function verifyDeepAuditCoverage({
  repoRoot = DEFAULT_ROOT,
  explicitRoot = null,
  selfProvider = null,
  peerProvider = null,
  authorProvider = null,
} = {}) {
  const active = loadActiveDeepAuditRun({ repoRoot, explicitRoot, requireCurrent: true })
  validateDeepAuditRunProviderBindings(active.manifest, { repoRoot: active.repository })
  const secondOpinionWaived = active.manifest.reviewSelection?.kind === 'provider-review-capability-selection-waived'
  if (!secondOpinionWaived) {
    // The model-broker execution layer retired 2026-08-04 (baton §8.3): no
    // transport exists that could produce peer judgment/A1b model envelopes, so
    // the waived self-review route is the only valid review selection.
    fail('deep-audit runs without a waived self-review are retired 2026-08-04 (model-broker execution layer removed); reviewSelection must be provider-review-capability-selection-waived')
  }
  const manifestProviders = secondOpinionWaived
    ? [active.manifest.providers.self.id]
    : [active.manifest.providers.self.id, active.manifest.providers.peer.id]
  if (selfProvider !== null && selfProvider !== manifestProviders[0]) fail('--self-provider differs from the active run manifest')
  if (peerProvider !== null && peerProvider !== (manifestProviders[1] ?? null)) fail('--peer-provider differs from the active run manifest')
  if (authorProvider !== null && authorProvider !== active.manifest.authorProvider) fail('--author-provider differs from the active run manifest')
  if (active.manifest.authorProvider !== manifestProviders[0]
    || (manifestProviders[1] !== undefined && active.manifest.authorProvider === manifestProviders[1])) {
    fail('active run author provider is not the current/self provider or collides with the independent peer')
  }
  const providers = manifestProviders
  const tiers = loadAuditCoverageTiers(active.repository)
  rejectLegacyOrPoisonedRoot(active)
  const components = active.manifest.components.map((item) => item.name)
  const expectedFiles = expectedPathSet(tiers)
  scanClosedRunTree(active, expectedFiles)
  const planState = loadDeterministicDeepAuditPlan({ repoRoot: active.repository })
  assertDeterministicMatrixParity(planState, { repoRoot: active.repository })
  const hookState = loadHookEvidencePlan({ repoRoot: active.repository })
  exact(hookDimensionNumbers(hookState), tiers['HOOK-ENFORCED'], 'hook plan/matrix dimensions')
  const hookPaths = selectFrozenHookInventory(active.manifest, hookState.plan.inventory)
  const hookCoverage = {
    inventoryPaths: hookPaths,
    inventoryDigest: digestInventorySelection(active.manifest, hookPaths),
    filesScanned: hookPaths.length,
  }
  const gaps = {
    deterministic: [],
    judgment: Object.fromEntries(providers.map((provider) => [provider, []])),
    hookResidue: [],
    ciEnforced: [],
    componentA1b: Object.fromEntries(providers.map((provider) => [provider, []])),
  }
  const envelopes = []
  const deterministicUnobserved = []
  const waivedSelfReview = secondOpinionWaived
    ? loadWaivedSelfReviewBundle({ activeRun: active, explicitRoot, tiers })
    : null
  for (const dim of tiers.DETERMINISTIC) {
    const envelope = readEnvelope(active, explicitRoot, `deterministic/dim-${dim}.json`)
    if (!envelope) gaps.deterministic.push(dim)
    else {
      const validation = validateDeterministicReceipt(envelope, dim, active, planState)
      if (validation.status === 'UNOBSERVED') {
        deterministicUnobserved.push({
          dim,
          capability: deterministicCapabilitiesForDimension(planState, dim),
          reasonCode: validation.reasonCode,
        })
      }
      envelopes.push(envelope)
    }
  }
  if (waivedSelfReview === null) {
    gaps.judgment[providers[0]].push(...tiers['PURE-JUDGMENT'])
    gaps.componentA1b[providers[0]].push(...components)
  }
  for (const dim of tiers['HOOK-ENFORCED']) {
    const envelope = readEnvelope(active, explicitRoot, `hook-residue/dim-${dim}.json`)
    if (!envelope) gaps.hookResidue.push(dim)
    else {
      validateHookReceipt(envelope, dim, active, hookState, hookCoverage)
      envelopes.push(envelope)
    }
  }
  const ciObservationDigests = new Set()
  for (const dim of tiers['CI-ENFORCED']) {
    const envelope = readEnvelope(active, explicitRoot, `ci-enforced/dim-${dim}.json`)
    if (!envelope) gaps.ciEnforced.push(dim)
    else {
      if (envelope.payload.dim !== dim) fail(`CI receipt identity mismatches:dim-${dim}`)
      exact(envelope.coverage, { inventoryPaths: active.manifest.rubricPaths, inventoryDigest: active.manifest.rubricDigest, filesScanned: active.manifest.rubricPaths.length }, `CI dim ${dim} coverage`)
      const receipt = envelope.payload.receipt
      // The enforced-plan observation lane retired with the activation cluster
      // (2026-08-04); the standard five-step live observation is the only
      // contract a CI dimension receipt may carry.
      if (receipt.contract !== 'standard-five-step-live-observation-v1') {
        fail(`CI dim ${dim} receipt carries a retired observation contract:${receipt.contract}`)
      }
      ciObservationDigests.add(receipt.observationSha256)
      envelopes.push(envelope)
    }
  }
  if (ciObservationDigests.size > 1) fail('CI dimension receipts mix different full observation payloads')
  const totalGaps = gaps.deterministic.length + gaps.hookResidue.length + gaps.ciEnforced.length
    + Object.values(gaps.judgment).reduce((sum, values) => sum + values.length, 0)
    + Object.values(gaps.componentA1b).reduce((sum, values) => sum + values.length, 0)
  const compliance = summarizeDeepAuditCompliance({
    totalGaps,
    envelopes,
    waivedSelfReview: waivedSelfReview?.bundle ?? null,
  })
  return {
    schemaVersion: 4,
    evidenceKind: 'deep-audit-coverage-verification',
    runId: active.manifest.runId,
    manifestSha256: active.manifestSha256,
    head: active.manifest.head,
    tree: active.manifest.tree,
    inventoryDigest: active.manifest.inventoryDigest,
    rubricDigest: active.manifest.rubricDigest,
    worktreeFingerprint: active.manifest.worktreeFingerprint,
    authorProvider: active.manifest.authorProvider,
    providerIdentityDigest: active.manifest.providerIdentityDigest,
    providers: { self: providers[0], peer: providers[1] ?? null },
    secondOpinion: secondOpinionWaived ? 'waived-by-user' : 'completed',
    tiers: {
      deterministic: tiers.DETERMINISTIC.length,
      pureJudgment: tiers['PURE-JUDGMENT'].length,
      hookEnforced: tiers['HOOK-ENFORCED'].length,
      ciEnforced: tiers['CI-ENFORCED'].length,
    },
    componentCount: components.length,
    gaps,
    totalGaps,
    unobserved: { deterministic: deterministicUnobserved },
    ...compliance,
  }
}

function printHuman(result) {
  console.log(`═══ Immutable Deep-Audit Run ${result.runId} ═══`)
  const providerSummary = result.providers.peer === null
    ? `${result.providers.self} (second opinion waived by user)`
    : `${result.providers.self}+${result.providers.peer}`
  console.log(`author:${result.authorProvider}; providers:${providerSummary}; HEAD:${result.head}`)
  console.log(`deterministic gaps:${result.gaps.deterministic.join(',') || 'none'}`)
  for (const provider of Object.keys(result.gaps.judgment)) console.log(`judgment ${provider} gaps:${result.gaps.judgment[provider].join(',') || 'none'}`)
  console.log(`hook gaps:${result.gaps.hookResidue.join(',') || 'none'}`)
  console.log(`CI gaps:${result.gaps.ciEnforced.join(',') || 'none'}`)
  for (const provider of Object.keys(result.gaps.componentA1b)) console.log(`A1b ${provider} gaps:${result.gaps.componentA1b[provider].join(',') || 'none'}`)
  console.log(`coverage:${result.coverageStatus}; compliance:${result.complianceStatus}; promotion:${result.promotionEligible ? 'eligible' : 'blocked'}`)
  console.log(`findings:judgment=${result.findings.judgment}, A1b=${result.findings.componentA1b}, hook-warning=${result.findings.hookWarnings}, hook-blocking=${result.findings.hookBlocking}`)
  console.log(`UNOBSERVED deterministic:${result.unobserved.deterministic.map((item) => `dim-${item.dim}:${item.reasonCode}`).join(',') || 'none'}`)
  console.log(`trust downgrades:dependencies=${result.trustDowngrades.untrustedDependencies}, containment=${result.trustDowngrades.unverifiedContainment}, model-coverage=${result.trustDowngrades.unverifiedModelCoverage}, deterministic-unobserved=${result.trustDowngrades.unobservedDeterministicCoverage}`)
  console.log(result.promotionEligible ? '✅ immutable run evidence is complete, clean, and promotion-eligible' : '❌ immutable run is not promotion-eligible')
}

export function resolveVerifierProviderAssertions(args = {}, environment = process.env) {
  return {
    selfProvider: args['self-provider'] ?? environment.GOVERNANCE_SELF_PROVIDER ?? null,
    // The immutable active manifest is provider authority. Ambient peer metadata
    // is adapter context, not a verifier assertion; callers may still pass an
    // explicit --peer-provider to detect a mismatch or waiver conflict.
    peerProvider: args['peer-provider'] ?? null,
    authorProvider: args['author-provider'] ?? environment.GOVERNANCE_AUTHOR_PROVIDER ?? null,
  }
}

export function main(argv = process.argv.slice(2)) {
  const args = parseVerifierArgs(argv)
  const providerAssertions = resolveVerifierProviderAssertions(args)
  const result = verifyDeepAuditCoverage({
    repoRoot: args['repo-root'] ?? DEFAULT_ROOT,
    explicitRoot: args['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null,
    ...providerAssertions,
  })
  if (args.json) process.stdout.write(`${stableStringify(result, 2)}\n`)
  else printHuman(result)
  return verifierExitCode(result, args.require)
}

export function verifierExitCode(result, requirement = 'promotion') {
  if (!['coverage', 'promotion'].includes(requirement)) fail('verifier requirement is invalid')
  return requirement === 'coverage'
    ? (result.coverageStatus === 'complete' ? 0 : 1)
    : (result.promotionEligible ? 0 : 1)
}

const IS_MAIN = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()

if (IS_MAIN) {
  try { process.exitCode = main() } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2 }
}

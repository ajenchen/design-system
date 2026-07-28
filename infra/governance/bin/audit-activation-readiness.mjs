#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertClosedGitLocalConfiguration,
  GOVERNANCE_ROOT,
  invariant,
  parseFlags,
  readJson,
  runClosedGit,
  stableStringify,
} from '../lib/common.mjs'
import { loadIssuerRegistry } from '../lib/issuer-registry.mjs'
import { auditCompletionReadiness } from '../lib/completion-readiness.mjs'
import {
  FixtureApiClient,
  GhApiClient,
  buildPlan,
  reconcileFixtureTestHarness,
  resolveRuntimeValidationContext,
} from './reconcile-github.mjs'
import { resolveVerifiedCandidateRelease } from '../lib/release-evidence.mjs'
import {
  loadGovernanceBuildGraph,
  stageSourceMatches,
} from '../../../scripts/governance-build-graph.mjs'
import {
  loadAndValidateProtectedRootClassification,
  repositoryPath,
} from '../../../scripts/lib/governance-protected-roots.mjs'
import { observeAllHarnessReceipt } from '../lib/harness-runner.mjs'

const ROOT = resolve(GOVERNANCE_ROOT, '../..')
const PROTECTED_ROOT_INVENTORY = 'infra/governance/protected-root-classification.json'
const PROTECTED_ROOT_SCHEMA = 'infra/governance/schemas/protected-root-classification.schema.json'
const PROTECTED_ROOT_CLASSIFICATIONS = new Set(['canonical-source', 'generated-output', 'non-authority-exclusion'])
const DEFAULTS = {
  inventory: resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'),
  desired: resolve(GOVERNANCE_ROOT, 'desired/github.json'),
  rings: resolve(GOVERNANCE_ROOT, 'release-rings.json'),
  certifications: resolve(GOVERNANCE_ROOT, 'providers/certifications.json'),
  waivers: resolve(GOVERNANCE_ROOT, 'waivers.json'),
  requirements: resolve(GOVERNANCE_ROOT, 'external-activation-requirements.json'),
  activationPolicy: resolve(GOVERNANCE_ROOT, 'external-activation-policy.json'),
  runtimeProfile: resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json'),
  mutationBoundaryContract: resolve(GOVERNANCE_ROOT, 'providers/github-mutation-boundary-contract.json'),
}

function command(args) {
  invariant(Array.isArray(args) && args.length > 1, 'activation-readiness command is invalid')
  if (args[0] === 'git') {
    assertClosedGitLocalConfiguration(ROOT, { maxOutputBytes: 4 * 1024 * 1024 })
    return runClosedGit(args.slice(1), {
      cwd: ROOT,
      maxOutputBytes: 32 * 1024 * 1024,
      timeoutMs: 30_000,
    })
  }
  invariant(args[0] === process.execPath, `activation-readiness command is not an authenticated runtime:${args[0]}`)
  return spawnSync(args[0], args.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      HOME: '/dev/null',
      LANG: 'C',
      LC_ALL: 'C',
      NO_COLOR: '1',
      PATH: '/usr/bin:/bin',
      TZ: 'UTC',
    },
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  })
}

function buildGraphObservation() {
  const check = command([process.execPath, 'scripts/governance-build-graph.mjs', '--check'])
  return {
    pass: check.status === 0,
    detail: (check.status === 0 ? check.stdout : check.stderr || check.stdout).trim().slice(0, 12000),
  }
}

export function classifyCanonicalWorkingTreePaths({
  graph,
  classificationRecords,
  untrackedPaths = [],
  ignoredPaths = [],
  modifiedPaths = [],
  specialIndexPaths = [],
}) {
  invariant(graph && Array.isArray(graph.stages), 'governance build graph stages are required')
  invariant(Array.isArray(classificationRecords), 'validated protected-root classification records are required')
  const classifications = new Map()
  for (const [index, record] of classificationRecords.entries()) {
    invariant(record && typeof record === 'object' && !Array.isArray(record), `protected-root classification record ${index} is invalid`)
    const path = repositoryPath(record.path, `protected-root classification record ${index} path`)
    invariant(PROTECTED_ROOT_CLASSIFICATIONS.has(record.classification), `protected-root classification record has an unknown class:${path}:${record.classification}`)
    invariant(!classifications.has(path), `protected-root classification record is ambiguous:${path}`)
    classifications.set(path, record.classification)
  }

  const canonical = (paths, label) => {
    invariant(Array.isArray(paths), `${label} must be an array`)
    return [...new Set(paths.map((path, index) => repositoryPath(path, `${label}[${index}]`)))]
      .filter((path) => {
        if (!graph.stages.some(stage => stageSourceMatches(stage, path))) return false
        const classification = classifications.get(path)
        invariant(classification, `governance input has no protected-root classification:${path}`)
        return classification === 'canonical-source'
      })
      .sort()
  }

  return {
    untrackedCanonicalInputs: canonical(untrackedPaths, 'untrackedPaths'),
    ignoredCanonicalInputs: canonical(ignoredPaths, 'ignoredPaths'),
    modifiedCanonicalInputs: canonical(modifiedPaths, 'modifiedPaths'),
    specialIndexCanonicalInputs: canonical(specialIndexPaths, 'specialIndexPaths'),
  }
}

function canonicalWorkingTreeObservation(graph) {
  const untracked = command(['git', 'ls-files', '--others', '--exclude-standard', '-z'])
  invariant(untracked.status === 0, `git untracked-input inspection failed: ${(untracked.stderr || '').trim()}`)
  const ignored = command(['git', 'ls-files', '--others', '--ignored', '--exclude-standard', '-z'])
  invariant(ignored.status === 0, `git ignored-input inspection failed: ${(ignored.stderr || '').trim()}`)
  const unstaged = command(['git', 'diff', '--name-only', '-z'])
  invariant(unstaged.status === 0, `git unstaged-input inspection failed: ${(unstaged.stderr || '').trim()}`)
  const staged = command(['git', 'diff', '--cached', '--name-only', '-z'])
  invariant(staged.status === 0, `git staged-input inspection failed: ${(staged.stderr || '').trim()}`)
  const indexFlags = command(['git', 'ls-files', '-v', '-z'])
  invariant(indexFlags.status === 0, `git index-flag inspection failed: ${(indexFlags.stderr || '').trim()}`)
  const head = command(['git', 'rev-parse', 'HEAD'])
  invariant(head.status === 0 && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head.stdout.trim()), `git HEAD inspection failed: ${(head.stderr || '').trim()}`)
  const paths = output => output.split('\0').filter(Boolean)
  const untrackedPaths = paths(untracked.stdout)
  const ignoredPaths = paths(ignored.stdout)
  const modifiedPaths = [...paths(unstaged.stdout), ...paths(staged.stdout)]
  const specialIndexPaths = indexFlags.stdout.split('\0').filter(Boolean)
    .filter(entry => /^[a-zS] /.test(entry))
    .map(entry => entry.slice(2))
  const observedGovernanceInputPaths = [...new Set([
    ...untrackedPaths,
    ...ignoredPaths,
    ...modifiedPaths,
    ...specialIndexPaths,
  ].map((path, index) => repositoryPath(path, `observed governance path ${index}`))
    .filter(path => graph.stages.some(stage => stageSourceMatches(stage, path))))]
  const classification = loadAndValidateProtectedRootClassification({
    root: ROOT,
    inventoryPath: PROTECTED_ROOT_INVENTORY,
    schemaPath: PROTECTED_ROOT_SCHEMA,
    stages: graph.stages,
    observedPaths: observedGovernanceInputPaths,
    allowedCanonicalOutputOverlaps: [...new Set(graph.stages.flatMap(stage => stage.sourceOutputOverlaps || []))],
  })
  const classified = classifyCanonicalWorkingTreePaths({
    graph,
    classificationRecords: classification.records,
    untrackedPaths,
    ignoredPaths,
    modifiedPaths,
    specialIndexPaths,
  })
  return {
    ...classified,
    headSha: head.stdout.trim(),
  }
}

function printHuman(report) {
  console.log(`Governance completion readiness: ${report.status}`)
  console.log(`localReady=${report.localReady} externalActivationRequired=${report.externalActivationRequired} ready=${report.ready}`)
  for (const check of report.checks) console.log(`${check.pass ? 'PASS' : 'BLOCK'} [${check.category}] ${check.id}: ${check.summary}`)
}

export async function run(argv = process.argv.slice(2), { now = new Date(), client = null, runtimeValidationContext = null } = {}) {
  const flags = parseFlags(argv, {
    json: 'boolean',
    offline: 'boolean',
    inventory: 'string',
    desired: 'string',
    rings: 'string',
    certifications: 'string',
    waivers: 'string',
    requirements: 'string',
    'external-activation-policy': 'string',
    'mutation-boundary-contract': 'string',
    'issuer-registry': 'string',
    'runtime-profile': 'string',
    'fixture-dir': 'string',
  })
  invariant(flags._.length === 0, `Unexpected arguments: ${flags._.join(' ')}`)
  const inventory = readJson(resolve(flags.inventory ?? DEFAULTS.inventory))
  const desired = readJson(resolve(flags.desired ?? DEFAULTS.desired))
  const rings = readJson(resolve(flags.rings ?? DEFAULTS.rings))
  const certifications = readJson(resolve(flags.certifications ?? DEFAULTS.certifications))
  const waivers = readJson(resolve(flags.waivers ?? DEFAULTS.waivers))
  const activationRequirements = readJson(resolve(flags.requirements ?? DEFAULTS.requirements))
  const activationPolicy = readJson(resolve(flags['external-activation-policy'] ?? DEFAULTS.activationPolicy))
  const mutationBoundaryContract = readJson(resolve(flags['mutation-boundary-contract'] ?? DEFAULTS.mutationBoundaryContract))
  const issuerRegistry = flags['issuer-registry'] ? loadIssuerRegistry(resolve(flags['issuer-registry'])) : loadIssuerRegistry()
  const runtimeProfile = readJson(resolve(flags['runtime-profile'] ?? DEFAULTS.runtimeProfile))
  const graph = loadGovernanceBuildGraph()
  const workingTree = canonicalWorkingTreeObservation(graph)
  const local = {
    buildGraph: buildGraphObservation(),
    allHarnessReceipt: observeAllHarnessReceipt({ repoRoot: ROOT, now }),
    ...workingTree,
  }
  let livePlan
  let completionRuntimeValidationContext = runtimeValidationContext ?? {}
  const modelOverrides = ['inventory', 'desired', 'rings', 'certifications', 'waivers', 'requirements', 'external-activation-policy', 'mutation-boundary-contract', 'issuer-registry', 'runtime-profile']
    .filter(name => flags[name] !== undefined)
  const liveObservation = {
    source: flags.offline
      ? 'offline'
      : flags['fixture-dir']
        ? 'fixture'
        : client
          ? 'injected'
          : 'github-api',
    defaultModels: modelOverrides.length === 0,
    productionEligible: !flags.offline && !flags['fixture-dir'] && !client && modelOverrides.length === 0,
  }
  if (flags.offline) livePlan = { error: 'offline mode: live GitHub plan was intentionally not observed and therefore fails closed' }
  else {
    try {
      const api = client ?? (flags['fixture-dir'] ? new FixtureApiClient(resolve(flags['fixture-dir'])) : new GhApiClient())
      const productionLive = !flags['fixture-dir'] && !client
      const planBuilder = productionLive ? buildPlan : reconcileFixtureTestHarness.buildPlan
      const runtimeContextResolver = productionLive
        ? resolveRuntimeValidationContext
        : reconcileFixtureTestHarness.resolveRuntimeValidationContext
      if (productionLive && runtimeValidationContext !== null) {
        resolveRuntimeValidationContext({ client: api, inventory, certifications, runtimeProfile, runtimeValidationContext })
      }
      const verifiedReleaseEvidence = rings.candidateRelease
        ? await resolveVerifiedCandidateRelease(rings.candidateRelease)
        : null
      livePlan = planBuilder({
        inventory,
        desired,
        rings,
        certifications,
        waivers,
        client: api,
        verifiedReleaseEvidence,
        issuerRegistry,
        runtimeProfile,
        runtimeValidationContext: productionLive ? {} : completionRuntimeValidationContext,
        now,
      })
      completionRuntimeValidationContext = runtimeContextResolver({
        client: api,
        inventory,
        certifications,
        runtimeProfile,
        runtimeValidationContext: productionLive ? {} : completionRuntimeValidationContext,
      })
      if (productionLive) {
        for (const repoPlan of livePlan.repoPlans) {
          const identity = completionRuntimeValidationContext.externalRepositoryIdentities?.[repoPlan.repoId]
          invariant(identity?.gitCommit === repoPlan.defaultBranchHeadSha,
            `Completion readiness live repository identity changed after plan observation for ${repoPlan.repoId}`)
        }
      }
    } catch (error) {
      livePlan = { error: error.message }
    }
  }
  const report = auditCompletionReadiness({
    inventory,
    desired,
    rings,
    certifications,
    waivers,
    activationRequirements,
    activationPolicy,
    mutationBoundaryContract,
    issuerRegistry,
    runtimeProfile,
    runtimeValidationContext: completionRuntimeValidationContext,
    now,
    local,
    livePlan,
    liveObservation,
  })
  if (flags.json) console.log(stableStringify(report))
  else printHuman(report)
  if (!report.ready) process.exitCode = 2
  return report
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) run().catch(error => {
  console.error(`ACTIVATION-READINESS: ${error.message}`)
  process.exitCode = 1
})

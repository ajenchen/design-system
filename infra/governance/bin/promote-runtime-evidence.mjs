#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { invariant, parseFlags, readJson, sha256, stableStringify } from '../lib/common.mjs'
import {
  assertProductionRuntimeEvidenceSafety,
  attachRuntimeEvidenceAttestation,
  localRuntimeProviderIds,
  requiredRuntimeChecksPass,
  resolveGitIdentity,
  RUNTIME_EVIDENCE_SCOPES,
  runtimeConformancePaths,
  validateRuntimeEvidence,
  validateRuntimeEvidenceFreshness,
  verifyRuntimeEvidenceAttestation,
} from '../lib/provider-runtime-conformance.mjs'
import { currentRuntimeCertificationIdentity, runtimeCertificationPaths } from '../lib/runtime-certification.mjs'
import { loadIssuerRegistry } from '../lib/issuer-registry.mjs'

const RUNTIME_EVIDENCE_DIRECTORY_SEGMENTS = Object.freeze([
  'infra',
  'governance',
  'evidence',
  'provider-runtime',
])

function usage() {
  return `Usage: node infra/governance/bin/promote-runtime-evidence.mjs --accept-clean-current-tree --scope <local-fleet|provider> --attestation <signed.json>\n\nValidates the gitignored staging evidence, requires an explicit scope that exactly matches the signed evidence, verifies a detached Ed25519 signature from an issuer trusted by the active runtime profile, requires a fresh clean current-tree run, and writes one content-addressed immutable evidence file. local-fleet covers only every executionMode=local-probe provider; external-attested cloud, remote-control, desktop, and GitHub Actions surfaces require their separate signed evidence. This command does not edit the certification ledger. Without a configured trusted issuer and external signature, promotion fails closed.\n`
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path, { bigint: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function ensureRuntimeEvidenceDirectory(repoRoot, outputDirectory) {
  invariant(
    typeof repoRoot === 'string' && repoRoot.length > 0 && resolve(repoRoot) === repoRoot,
    'Runtime evidence repository root must be an absolute normalized path',
  )
  invariant(
    typeof outputDirectory === 'string' && outputDirectory.length > 0 && resolve(outputDirectory) === outputDirectory,
    'Runtime evidence output directory must be an absolute normalized path',
  )
  const expectedDirectory = resolve(repoRoot, ...RUNTIME_EVIDENCE_DIRECTORY_SEGMENTS)
  invariant(
    outputDirectory === expectedDirectory,
    'Runtime evidence output directory must be the canonical repository content-addressed directory',
  )
  const boundaryBefore = lstatIfPresent(repoRoot)
  invariant(
    boundaryBefore?.isDirectory() && !boundaryBefore.isSymbolicLink(),
    'Runtime evidence repository boundary must be an existing real directory',
  )
  const physicalBoundary = realpathSync(repoRoot)
  let current = repoRoot
  for (const [index, segment] of RUNTIME_EVIDENCE_DIRECTORY_SEGMENTS.entries()) {
    current = resolve(current, segment)
    let info = lstatIfPresent(current)
    if (!info) {
      try {
        mkdirSync(current, { mode: 0o755 })
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
      }
      info = lstatIfPresent(current)
    }
    invariant(
      info?.isDirectory() && !info.isSymbolicLink(),
      `Runtime evidence output directory parent chain contains a symlink or non-directory: ${current}`,
    )
    invariant(
      realpathSync(current) === resolve(physicalBoundary, ...RUNTIME_EVIDENCE_DIRECTORY_SEGMENTS.slice(0, index + 1)),
      `Runtime evidence output directory parent chain escapes its repository boundary: ${current}`,
    )
  }
  const boundaryAfter = lstatIfPresent(repoRoot)
  invariant(
    boundaryAfter?.isDirectory()
      && !boundaryAfter.isSymbolicLink()
      && boundaryAfter.dev === boundaryBefore.dev
      && boundaryAfter.ino === boundaryBefore.ino
      && realpathSync(repoRoot) === physicalBoundary,
    'Runtime evidence repository boundary changed while validating the output directory',
  )
  return expectedDirectory
}

export function promoteRuntimeEvidence({
  source = runtimeCertificationPaths.stagingEvidence,
  outputDirectory = runtimeCertificationPaths.evidenceDirectory,
  repoRoot = runtimeCertificationPaths.repoRoot,
  identity,
  currentGitIdentity,
  runtimeProfile = readJson(runtimeConformancePaths.defaultProfilePath),
  issuerRegistry = loadIssuerRegistry(),
  attestation,
  expectedScope,
  now = new Date(),
} = {}) {
  invariant(RUNTIME_EVIDENCE_SCOPES.includes(expectedScope), 'Runtime evidence promotion requires an explicit expected scope of local-fleet or provider')
  invariant(existsSync(source) && !lstatSync(source).isSymbolicLink() && lstatSync(source).isFile(), 'Runtime staging evidence must be a regular non-symlink file')
  const stagingBytes = readFileSync(source)
  let evidence = JSON.parse(stagingBytes.toString('utf8'))
  validateRuntimeEvidence(evidence, { expectedProviderIds: localRuntimeProviderIds(runtimeProfile) })
  invariant(evidence.scope === expectedScope, `Runtime staging evidence scope ${evidence.scope} does not match explicit promotion scope ${expectedScope}`)
  if (evidence.attestation.status === 'pending') {
    invariant(attestation, 'Runtime evidence issuer attestation is pending; pass a detached signature from a trusted issuer')
    evidence = attachRuntimeEvidenceAttestation(evidence, attestation, runtimeProfile, { issuerRegistry, now })
  } else {
    invariant(attestation === undefined, 'Runtime evidence already contains an issuer attestation; a second detached attestation is forbidden')
    verifyRuntimeEvidenceAttestation(evidence, runtimeProfile, { issuerRegistry, now })
  }
  validateRuntimeEvidenceFreshness(evidence, runtimeProfile, { now, issuerRegistry })
  assertProductionRuntimeEvidenceSafety(evidence)
  invariant(
    evidence.status === 'pass'
      && evidence.providers.every(provider => provider.status === 'pass' && requiredRuntimeChecksPass(provider.checks)),
    'Only runtime evidence whose required certification checks pass can be promoted',
  )
  const effectiveIdentity = identity ?? currentRuntimeCertificationIdentity(repoRoot)
  const effectiveGitIdentity = currentGitIdentity ?? resolveGitIdentity(repoRoot)
  invariant(
    effectiveGitIdentity
      && /^[a-f0-9]{40}$/.test(effectiveGitIdentity.gitHead ?? '')
      && /^[a-f0-9]{40}$/.test(effectiveGitIdentity.gitTree ?? '')
      && typeof effectiveGitIdentity.worktreeDirty === 'boolean',
    'Runtime evidence promotion current Git identity is invalid',
  )
  invariant(effectiveGitIdentity.worktreeDirty === false, 'Runtime evidence promotion requires the current worktree to remain clean')
  invariant(
    effectiveGitIdentity.gitHead === effectiveIdentity.gitCommit
      && effectiveGitIdentity.gitTree === effectiveIdentity.gitTree,
    'Runtime evidence promotion Git identity changed during current-tree validation',
  )
  invariant(evidence.subject.worktreeDirty === false, 'Runtime evidence must be generated from a clean worktree before certification promotion')
  invariant(evidence.subject.gitHead === effectiveIdentity.gitCommit, 'Runtime staging evidence gitCommit is stale')
  for (const field of ['gitTree', 'profileDigest', 'harnessDigest']) invariant(evidence.subject[field] === effectiveIdentity[field], `Runtime staging evidence ${field} is stale`)
  invariant(evidence.subject.contractValid === true && evidence.subject.contractBlockingDiagnosticIds.length === 0, 'Runtime staging evidence contract is not valid')
  const canonicalOutputDirectory = ensureRuntimeEvidenceDirectory(repoRoot, outputDirectory)
  const bytes = Buffer.from(`${stableStringify(evidence)}\n`)
  const artifactSha256 = sha256(bytes)
  const destination = resolve(canonicalOutputDirectory, `${artifactSha256}.json`)
  invariant(relative(canonicalOutputDirectory, destination) === `${artifactSha256}.json` && !relative(canonicalOutputDirectory, destination).startsWith(`..${sep}`), 'Runtime evidence destination escaped its directory')
  ensureRuntimeEvidenceDirectory(repoRoot, canonicalOutputDirectory)
  if (existsSync(destination)) invariant(readFileSync(destination).equals(bytes), 'Content-addressed runtime evidence path already contains different bytes')
  else writeFileSync(destination, bytes, { flag: 'wx', mode: 0o444 })
  ensureRuntimeEvidenceDirectory(repoRoot, canonicalOutputDirectory)
  const reference = relative(resolve(repoRoot), destination).split(sep).join('/')
  invariant(reference === `infra/governance/evidence/provider-runtime/${artifactSha256}.json`, 'Runtime evidence destination is outside the canonical content-addressed directory')
  return {
    scope: evidence.scope,
    artifactSha256,
    reference,
    evidenceDigest: evidence.evidenceDigest,
    gitCommit: evidence.subject.gitHead,
    gitTree: effectiveIdentity.gitTree,
    profileDigest: effectiveIdentity.profileDigest,
    harnessDigest: effectiveIdentity.harnessDigest,
    hardGateContractDigest: evidence.subject.contractDigest,
    runId: evidence.run.runId,
    providerBindings: evidence.providers.map(provider => ({
      providerId: provider.id,
      targetId: provider.targetBinding.id,
      targetDigest: provider.targetBinding.digest,
      operatingSystem: evidence.run.operatingSystem,
      platform: evidence.run.platform,
      arch: evidence.run.arch,
      executionEnvironment: evidence.run.executionEnvironment,
      distributionVersion: provider.tool.distribution.distributionVersion,
      pathClass: evidence.run.pathClass,
      distributionDigest: `sha256:${sha256(stableStringify(provider.tool.distribution, 0))}`,
    })),
  }
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help')) {
    process.stdout.write(usage())
    return 0
  }
  const flags = parseFlags(argv, {
    'accept-clean-current-tree': 'boolean',
    scope: 'string',
    attestation: 'string',
  })
  invariant(flags._.length === 0 && flags['accept-clean-current-tree'] === true, 'Runtime evidence promotion requires the exact --accept-clean-current-tree acknowledgement')
  invariant(RUNTIME_EVIDENCE_SCOPES.includes(flags.scope), 'Runtime evidence promotion requires --scope local-fleet or --scope provider')
  process.stdout.write(`${stableStringify(promoteRuntimeEvidence({
    expectedScope: flags.scope,
    attestation: flags.attestation ? readJson(resolve(flags.attestation)) : undefined,
  }))}\n`)
  return 0
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(`runtime evidence promotion failed closed: ${error.message}\n`)
    process.exitCode = 2
  }
}

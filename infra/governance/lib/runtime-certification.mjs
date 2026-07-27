import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareUtf8Bytes,
  invariant,
  readJson,
  resolveCertificationCanary,
  runClosedGit,
  sha256,
  stableStringify,
} from './common.mjs'
import {
  assertProductionRuntimeEvidenceSafety,
  computeRuntimeProfileDigest,
  requiredRuntimeChecksPass,
  RUNTIME_EVIDENCE_SCOPES,
  runtimeHarnessIdentity,
  runtimeTargetDigest,
  validateRuntimeEvidence,
  validateRuntimeEvidenceProfileBinding,
  validateRuntimeEvidenceFreshness,
  verifyRuntimeEvidenceAttestation,
} from './provider-runtime-conformance.mjs'
import { loadIssuerRegistry } from './issuer-registry.mjs'
import {
  externalHardGateContractDigest,
  externalSurfaceDistributionDigest,
  loadContentAddressedExternalSurfaceEvidence,
  validateExternalSurfaceEvidenceBinding,
} from './external-surface-evidence.mjs'
import { certificationCarrierPolicyForRole, loadRoleSurfacePolicy } from './role-surface-policy.mjs'
import {
  buildRepositorySubjectProof,
  validateRepositorySubjectProof,
  validateRepositorySubjectProofShape,
} from './repository-subject-proof.mjs'

const MODULE_PATH = fileURLToPath(import.meta.url)
const GOVERNANCE_ROOT = resolve(dirname(MODULE_PATH), '..')
const DEFAULT_REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')
const PROFILE_PATH = resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json')
const MATRIX_PATH = resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json')
const RUNTIME_VALIDATION_CONTEXT_KEYS = Object.freeze(['repoRoot', 'runtimeIdentity', 'externalRepositoryIdentities'])
const RUNTIME_IDENTITY_KEYS = Object.freeze(['gitCommit', 'gitTree', 'profileDigest', 'harnessDigest'])
const REPOSITORY_IDENTITY_KEYS = Object.freeze(['gitCommit', 'gitTree', 'subjectProofs'])
const SHA1 = /^[a-f0-9]{40}$/
const SHA256_URI = /^sha256:[a-f0-9]{64}$/

function digest(value) {
  return `sha256:${sha256(value)}`
}

export function currentRuntimeCertificationIdentity(repoRoot = DEFAULT_REPO_ROOT) {
  const git = runClosedGit(['rev-parse', 'HEAD', 'HEAD^{tree}'], { cwd: resolve(repoRoot) })
  const [gitCommit, gitTree, ...extra] = typeof git.stdout === 'string'
    ? git.stdout.trim().split('\n')
    : []
  invariant(
    !git.error
      && git.signal === null
      && git.status === 0
      && extra.length === 0
      && /^[a-f0-9]{40}$/.test(gitCommit)
      && /^[a-f0-9]{40}$/.test(gitTree),
    'Cannot resolve current Git commit/tree for runtime certification through closed Git',
  )
  return {
    gitCommit,
    gitTree,
    ...runtimeHarnessIdentity(repoRoot, resolve(repoRoot, 'infra/governance/providers/runtime-conformance.json')),
  }
}

function exactPlainObject(value, expectedKeys, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant([Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label} must be a plain object`)
  const actual = Object.keys(value).sort(compareUtf8Bytes)
  const expected = [...expectedKeys].sort(compareUtf8Bytes)
  invariant(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} has an invalid or open shape`,
  )
}

function validateRuntimeIdentity(identity) {
  exactPlainObject(identity, RUNTIME_IDENTITY_KEYS, 'Runtime validation identity')
  invariant(SHA1.test(identity.gitCommit) && SHA1.test(identity.gitTree), 'Runtime validation identity commit/tree is invalid')
  invariant(SHA256_URI.test(identity.profileDigest) && SHA256_URI.test(identity.harnessDigest), 'Runtime validation identity profile/Harness digest is invalid')
}

export function validateExternalRepositoryIdentityClosure(externalRepositoryIdentities, inventory) {
  invariant(Array.isArray(inventory?.repositories), 'Runtime validation context closure requires the managed repository inventory')
  invariant(
    externalRepositoryIdentities && typeof externalRepositoryIdentities === 'object' && !Array.isArray(externalRepositoryIdentities),
    `Certified runtime requires live identity for repository ${inventory.repositories[0]?.id ?? '<missing>'}`,
  )
  exactPlainObject(
    externalRepositoryIdentities,
    inventory.repositories.map(repository => repository.id),
    'Runtime validation external repository identities',
  )
  for (const repository of inventory.repositories) {
    const identity = externalRepositoryIdentities[repository.id]
    exactPlainObject(identity, REPOSITORY_IDENTITY_KEYS, `Repository identity ${repository.id}`)
    invariant(SHA1.test(identity.gitCommit) && SHA1.test(identity.gitTree), `Repository identity commit/tree is invalid for ${repository.id}`)
    invariant(identity.subjectProofs && typeof identity.subjectProofs === 'object' && !Array.isArray(identity.subjectProofs), `Repository identity subject proofs are missing for ${repository.id}`)
    invariant([Object.prototype, null].includes(Object.getPrototypeOf(identity.subjectProofs)), `Repository identity subject proofs must be a plain object for ${repository.id}`)
    for (const subjectCommit of Object.keys(identity.subjectProofs)) {
      invariant(SHA1.test(subjectCommit), `Repository identity subject proof key is invalid for ${repository.id}`)
      validateRepositorySubjectProofShape(repository, identity, subjectCommit)
    }
  }
}

export function normalizeRuntimeValidationContext(context = {}, { inventory } = {}) {
  invariant(context && typeof context === 'object' && !Array.isArray(context), 'Runtime validation context must be an object')
  invariant([Object.prototype, null].includes(Object.getPrototypeOf(context)), 'Runtime validation context must be a plain object')
  for (const key of Object.keys(context)) {
    invariant(RUNTIME_VALIDATION_CONTEXT_KEYS.includes(key), `Runtime validation context contains unsupported field ${key}`)
  }
  if (Object.keys(context).length === 0) return context
  exactPlainObject(context, RUNTIME_VALIDATION_CONTEXT_KEYS, 'Runtime validation context')
  invariant(typeof context.repoRoot === 'string' && context.repoRoot.length > 0 && resolve(context.repoRoot) === context.repoRoot, 'Runtime validation context repoRoot must be an absolute normalized path')
  validateRuntimeIdentity(context.runtimeIdentity)
  validateExternalRepositoryIdentityClosure(context.externalRepositoryIdentities, inventory)
  return context
}

function liveGitHubRepositoryIdentity(client, repository, subjectCommits, carrierPolicy) {
  invariant(typeof repository?.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(repository.id), 'Live runtime identity readback requires a valid inventory repository id')
  invariant(typeof repository.github === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.github), `Live runtime identity readback requires a valid GitHub slug for ${repository.id}`)
  invariant(typeof repository.defaultBranch === 'string' && repository.defaultBranch.length > 0, `Live runtime identity readback requires a default branch for ${repository.id}`)
  const metadata = client.request('GET', `/repos/${repository.github}`)
  invariant(metadata?.full_name === repository.github, `Live GitHub repository identity differs from inventory for ${repository.id}`)
  invariant(metadata?.default_branch === repository.defaultBranch, `Live GitHub default branch differs from inventory for ${repository.id}`)
  const commit = client.request('GET', `/repos/${repository.github}/commits/${encodeURIComponent(repository.defaultBranch)}`)
  const gitCommit = commit?.sha
  const gitTree = commit?.commit?.tree?.sha
  invariant(/^[a-f0-9]{40}$/.test(gitCommit ?? ''), `Live GitHub default-branch commit identity is invalid for ${repository.id}`)
  invariant(/^[a-f0-9]{40}$/.test(gitTree ?? ''), `Live GitHub default-branch tree identity is invalid for ${repository.id}`)
  const subjectProofs = {}
  for (const subjectCommit of subjectCommits) {
    invariant(/^[a-f0-9]{40}$/.test(subjectCommit), `Live certification subject commit is invalid for ${repository.id}`)
    const subject = client.request('GET', `/repos/${repository.github}/git/commits/${subjectCommit}`)
    const subjectTree = subject?.tree?.sha
    invariant(subject?.sha === subjectCommit && /^[a-f0-9]{40}$/.test(subjectTree ?? ''), `Live certification subject object readback is invalid for ${repository.id}/${subjectCommit}`)
    let changedFiles = []
    if (subjectCommit !== gitCommit) {
      invariant(carrierPolicy.relationship === 'ledger-carrier-descendant', `Live certification subject must exactly equal the protected default-branch carrier for ${repository.id}`)
      const comparison = client.request('GET', `/repos/${repository.github}/compare/${subjectCommit}...${gitCommit}`)
      invariant(comparison?.status === 'ahead'
        && comparison?.base_commit?.sha === subjectCommit
        && comparison?.merge_base_commit?.sha === subjectCommit
        && comparison?.ahead_by >= 1
        && comparison?.behind_by === 0, `Live certification subject is not a protected default-branch ancestor for ${repository.id}/${subjectCommit}`)
      invariant(Number.isInteger(comparison.total_commits)
        && comparison.total_commits === comparison.ahead_by
        && comparison.total_commits <= 250, `Live certification carrier commit readback is missing, inconsistent, or truncated for ${repository.id}/${subjectCommit}`)
      invariant(Array.isArray(comparison.files) && comparison.files.length < 300, `Live certification carrier changed-path readback is missing or truncated for ${repository.id}/${subjectCommit}`)
      changedFiles = comparison.files.map((file, index) => {
        invariant(['added', 'modified', 'removed'].includes(file?.status)
          && file.previous_filename === undefined, `Live certification carrier file ${index} uses an unsupported rename/copy/status for ${repository.id}/${subjectCommit}`)
        invariant(typeof file.filename === 'string' && file.filename.length > 0, `Live certification carrier changed-path readback is invalid for ${repository.id}/${subjectCommit}`)
        return { path: file.filename, status: file.status }
      }).sort((left, right) => compareUtf8Bytes(left.path, right.path))
      invariant(new Set(changedFiles.map(file => file.path)).size === changedFiles.length, `Live certification carrier changed-path readback contains duplicates for ${repository.id}/${subjectCommit}`)
      invariant(changedFiles.length > 0, `Live certification carrier ancestry has no changed paths for ${repository.id}/${subjectCommit}`)
    }
    subjectProofs[subjectCommit] = buildRepositorySubjectProof(repository, {
      subjectCommit,
      subjectTree,
      carrierCommit: gitCommit,
      carrierTree: gitTree,
      changedFiles,
    })
    validateRepositorySubjectProof(repository, { gitCommit, gitTree, subjectProofs }, { subjectCommit, subjectTree }, { carrierPolicy })
  }
  return { gitCommit, gitTree, subjectProofs }
}

export function certificationSubjectCommitsByRepository(certifications, inventory) {
  invariant(Array.isArray(certifications?.certifications), 'Certification subject resolution requires the certification ledger')
  const commits = new Map(inventory.repositories.map(repository => [repository.id, new Set()]))
  for (const certification of certifications.certifications) {
    if (!['certified', 'conditional'].includes(certification?.status)) continue
    const repository = resolveCertificationCanary(inventory, certification.repositoryRole)
    const certifiedTargets = certification.platformMatrix?.filter(target => target?.status === 'certified') ?? []
    for (const target of certifiedTargets) {
      const binding = target.runtimeEvidence ?? certification.runtimeEvidence
      if (binding === undefined) continue
      invariant(/^[a-f0-9]{40}$/.test(binding.gitCommit ?? ''), `Certified record ${certification.id} runtime evidence must bind a subject gitCommit`)
      commits.get(repository.id).add(binding.gitCommit)
    }
  }
  return new Map([...commits].map(([repositoryId, values]) => [repositoryId, [...values].sort(compareUtf8Bytes)]))
}

export function resolveGitHubRuntimeValidationContext({
  client,
  inventory,
  certifications = { certifications: [] },
  runtimeProfile,
  roleSurfacePolicy = loadRoleSurfacePolicy(),
  repoRoot = DEFAULT_REPO_ROOT,
  runtimeValidationContext = {},
  live = false,
} = {}) {
  invariant(runtimeValidationContext && typeof runtimeValidationContext === 'object' && !Array.isArray(runtimeValidationContext), 'Runtime validation context must be an object')
  invariant([Object.prototype, null].includes(Object.getPrototypeOf(runtimeValidationContext)), 'Runtime validation context must be a plain object')
  for (const key of Object.keys(runtimeValidationContext)) invariant(RUNTIME_VALIDATION_CONTEXT_KEYS.includes(key), `Runtime validation context contains unsupported field ${key}`)
  if (live) invariant(Object.keys(runtimeValidationContext).length === 0, 'Live GitHub runtime validation refuses an injected runtime validation identity')
  const injected = normalizeRuntimeValidationContext(runtimeValidationContext, { inventory })
  if (!live) return injected
  invariant(client && typeof client.request === 'function', 'Live runtime identity readback requires a GitHub API client')
  invariant(Array.isArray(inventory?.repositories) && inventory.repositories.length > 0, 'Live runtime identity readback requires the registered repository inventory')
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'Live runtime identity readback requires an explicit repository root')
  const resolvedRepoRoot = resolve(repoRoot)
  const identity = currentRuntimeCertificationIdentity(resolvedRepoRoot)
  invariant(
    identity.profileDigest === computeRuntimeProfileDigest(resolvedRepoRoot, runtimeProfile),
    'Live GitHub runtime validation requires the current canonical runtime profile and provider CLI authority',
  )
  const repositoryIds = new Set()
  const repositorySlugs = new Set()
  for (const repository of inventory.repositories) {
    invariant(!repositoryIds.has(repository?.id), `Live runtime identity inventory contains duplicate repository id ${repository?.id ?? '<missing>'}`)
    invariant(!repositorySlugs.has(repository?.github), `Live runtime identity inventory contains duplicate GitHub repository ${repository?.github ?? '<missing>'}`)
    repositoryIds.add(repository.id)
    repositorySlugs.add(repository.github)
  }
  const subjectCommitsByRepository = certificationSubjectCommitsByRepository(certifications, inventory)
  const externalRepositoryIdentities = Object.fromEntries(inventory.repositories.map(repository => {
    const subjectCommits = subjectCommitsByRepository.get(repository.id) ?? []
    const carrierPolicy = subjectCommits.length > 0
      ? certificationCarrierPolicyForRole(roleSurfacePolicy, repository.role)
      : { relationship: 'exact-subject', allowedChangedPaths: [] }
    return [repository.id, liveGitHubRepositoryIdentity(client, repository, subjectCommits, carrierPolicy)]
  }))
  return {
    repoRoot: resolvedRepoRoot,
    runtimeIdentity: identity,
    externalRepositoryIdentities,
  }
}

function safeEvidencePath(repoRoot, reference, artifactSha256) {
  invariant(typeof reference === 'string' && /^infra\/governance\/evidence\/provider-runtime\/[a-f0-9]{64}\.json$/.test(reference), 'Runtime certification evidence reference must be content-addressed below infra/governance/evidence/provider-runtime')
  invariant(reference.endsWith(`/${artifactSha256}.json`), 'Runtime certification evidence filename must equal its artifact sha256')
  const root = resolve(repoRoot)
  const path = resolve(root, reference)
  invariant(path.startsWith(`${root}${sep}`), 'Runtime certification evidence escaped the repository')
  invariant(existsSync(path), `Runtime certification evidence is missing: ${reference}`)
  let current = root
  for (const segment of relative(root, path).split(sep)) {
    current = resolve(current, segment)
    invariant(!lstatSync(current).isSymbolicLink(), `Runtime certification evidence traverses a symlink: ${reference}`)
  }
  invariant(lstatSync(path).isFile(), `Runtime certification evidence is not a regular file: ${reference}`)
  return path
}

function versionMatches(observed, expected) {
  if (typeof observed !== 'string' || typeof expected !== 'string') return false
  const versions = observed.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g) ?? []
  return versions.includes(expected)
}

const TARGET_AXES = Object.freeze(['operatingSystem', 'platform', 'arch', 'executionEnvironment', 'distributionVersion', 'pathClass'])

export function validateRuntimeCheckCoverage(profileProvider, evidenceProvider, label = 'Runtime evidence') {
  invariant(Array.isArray(profileProvider?.checks) && profileProvider.checks.length > 0, `${label} active profile has no checks`)
  invariant(Array.isArray(evidenceProvider?.checks) && evidenceProvider.checks.length > 0, `${label} provider has no checks`)
  const records = (checks, source) => {
    const ids = new Set()
    return checks.map(check => {
      invariant(typeof check?.id === 'string' && typeof check?.driver === 'string', `${label} ${source} check identity is invalid`)
      invariant(!ids.has(check.id), `${label} ${source} contains duplicate check id ${check.id}`)
      ids.add(check.id)
      const certificationImpact = check.certificationImpact ?? 'required'
      invariant(
        ['required', 'capability-only'].includes(certificationImpact),
        `${label} ${source} check ${check.id} certificationImpact is invalid`,
      )
      return { id: check.id, driver: check.driver, certificationImpact }
    }).sort((left, right) => {
      if (left.id !== right.id) return left.id < right.id ? -1 : 1
      return left.driver < right.driver ? -1 : (left.driver > right.driver ? 1 : 0)
    })
  }
  const expected = records(profileProvider.checks, 'profile')
  const actual = records(evidenceProvider.checks, 'evidence')
  invariant(
    stableStringify(actual, 0) === stableStringify(expected, 0),
    `${label} check coverage differs from the active runtime profile; expected=${stableStringify(expected, 0)} actual=${stableStringify(actual, 0)}`,
  )
  return true
}

export function validateCertificationRuntimeEvidence(certification, {
  repoRoot = DEFAULT_REPO_ROOT,
  identity = currentRuntimeCertificationIdentity(repoRoot),
  matrix = readJson(MATRIX_PATH),
  runtimeProfile = readJson(PROFILE_PATH),
  issuerRegistry = loadIssuerRegistry(),
  repositoryTarget,
  repositoryIdentity,
  carrierPolicy,
  desiredGithub,
  now = new Date(),
  targetId = certification?.runtimeEvidence?.targetId ?? null,
  runtimeEvidenceBytes = null,
} = {}) {
  const providerRegistration = matrix?.providers?.[certification.provider]
  invariant(providerRegistration && typeof providerRegistration === 'object', `Certified record ${certification.id} provider is absent from the compatibility registry`)
  const registration = providerRegistration.runtimeKinds?.[certification.runtimeKind]
  invariant(registration && typeof registration === 'object', `Certified record ${certification.id} runtime kind is absent from the compatibility registry`)
  const expectedRuntimeId = registration.runtimeProfilesBySurface?.[certification.surface]
  invariant(typeof expectedRuntimeId === 'string', `Certified record ${certification.id} provider has no unique registered runtime profile alias for surface ${certification.surface}`)
  const profileProvider = runtimeProfile?.providers?.find(item => item.id === expectedRuntimeId)
  invariant(profileProvider, `Certified record ${certification.id} runtime profile alias ${expectedRuntimeId} is unregistered`)
  invariant(profileProvider.runtimeKind === certification.runtimeKind, `Certified record ${certification.id} runtime kind binding mismatch`)
  invariant(profileProvider.certificationSurface === certification.surface, `Certified record ${certification.id} runtime surface binding mismatch`)
  const certificationTarget = certification.platformMatrix?.find(target => target.id === targetId)
  invariant(certificationTarget?.status === 'certified', `Certified record ${certification.id} target is absent or not certified in its platform matrix`)
  const binding = certificationTarget.runtimeEvidence ?? certification.runtimeEvidence
  invariant(binding && typeof binding === 'object' && !Array.isArray(binding), `Certified record ${certification.id} must bind runtime conformance evidence`)
  if (profileProvider.executionMode === 'external-attested') {
    invariant(profileProvider.evidenceKind === 'external-runtime-surface-conformance', `Certified record ${certification.id} external runtime profile evidence kind is invalid`)
    const { evidence } = loadContentAddressedExternalSurfaceEvidence(repoRoot, binding)
    validateExternalSurfaceEvidenceBinding(evidence, {
      certification,
      certificationTarget,
      repositoryTarget,
      repositoryIdentity,
      profileProvider,
      runtimeProfile,
      matrix,
      desiredGithub,
      identity,
      issuerRegistry,
      carrierPolicy,
      now,
    })
    invariant(binding.evidenceDigest === evidence.evidenceDigest, `Certified record ${certification.id} external evidenceDigest mismatch`)
    invariant(binding.profileId === profileProvider.id && binding.runId === evidence.run.runId, `Certified record ${certification.id} external profile/run binding mismatch`)
    invariant(binding.repositoryId === evidence.profile.repositoryId
      && binding.repository === evidence.profile.repository
      && binding.repositoryRole === evidence.profile.repositoryRole
      && binding.repositoryReadbackSha256 === evidence.surfaceBinding.repositoryReadbackSha256, `Certified record ${certification.id} external repository binding mismatch`)
    invariant(binding.targetId === targetId && binding.targetDigest === evidence.run.targetDigest, `Certified record ${certification.id} external target binding mismatch`)
    for (const field of ['operatingSystem', 'platform', 'arch', 'executionEnvironment', 'pathClass']) {
      invariant(binding[field] === evidence.run[field], `Certified record ${certification.id} external ${field} binding mismatch`)
    }
    invariant(binding.distributionVersion === evidence.distribution.version
      && binding.distributionDigest === externalSurfaceDistributionDigest(evidence.distribution), `Certified record ${certification.id} external distribution binding mismatch`)
    for (const field of ['gitCommit', 'gitTree', 'profileDigest', 'harnessDigest', 'hardGateContractDigest']) {
      invariant(binding[field] === evidence.subject[field], `Certified record ${certification.id} external ${field} binding mismatch`)
    }
    invariant(binding.hardGateContractDigest === externalHardGateContractDigest(matrix, certification.repositoryRole), `Certified record ${certification.id} external hard-gate contract is stale`)
    return {
      scope: 'external-surface',
      runtimeProfileId: profileProvider.id,
      providerId: profileProvider.id,
      runId: evidence.run.runId,
      evidenceDigest: evidence.evidenceDigest,
      distributionDigest: binding.distributionDigest,
      targetId: binding.targetId,
      targetDigest: binding.targetDigest,
    }
  }
  invariant(profileProvider.executionMode === 'local-probe' && profileProvider.evidenceKind === 'provider-runtime-conformance', `Certified record ${certification.id} local runtime profile evidence kind is invalid`)
  invariant(Object.keys(binding).sort(compareUtf8Bytes).join(',') === 'arch,artifactSha256,distributionDigest,distributionVersion,evidenceDigest,executionEnvironment,gitCommit,gitTree,hardGateContractDigest,harnessDigest,operatingSystem,pathClass,platform,profileDigest,providerId,reference,runId,scope,targetDigest,targetId', `Certified record ${certification.id} runtime evidence has an invalid or open shape`)
  invariant(RUNTIME_EVIDENCE_SCOPES.includes(binding.scope), `Certified record ${certification.id} runtime evidence scope is invalid`)
  invariant(/^[a-f0-9]{64}$/.test(binding.artifactSha256 ?? ''), `Certified record ${certification.id} runtime artifact sha256 is invalid`)
  const bytes = runtimeEvidenceBytes === null
    ? readFileSync(safeEvidencePath(repoRoot, binding.reference, binding.artifactSha256))
    : Buffer.from(runtimeEvidenceBytes)
  invariant(bytes.length > 0, `Certified record ${certification.id} supplied runtime artifact bytes are empty`)
  invariant(sha256(bytes) === binding.artifactSha256, `Certified record ${certification.id} runtime artifact bytes do not match sha256`)
  const evidence = JSON.parse(bytes.toString('utf8'))
  validateRuntimeEvidence(evidence, { expectedProviderIds: runtimeProfile.providers.filter(provider => provider.executionMode === 'local-probe').map(provider => provider.id) })
  validateRuntimeEvidenceProfileBinding(evidence, runtimeProfile, { issuerRegistry, now })
  verifyRuntimeEvidenceAttestation(evidence, runtimeProfile, { issuerRegistry, now })
  validateRuntimeEvidenceFreshness(evidence, runtimeProfile, {
    now,
    issuerRegistry,
    certifiedAt: certificationTarget.certifiedAt ?? certification.certifiedAt,
    certificationExpiresAt: certificationTarget.expiresAt ?? certification.expiresAt,
  })
  assertProductionRuntimeEvidenceSafety(evidence)
  invariant(evidence.status === 'pass', `Certified record ${certification.id} runtime evidence did not pass`)
  invariant(binding.evidenceDigest === evidence.evidenceDigest, `Certified record ${certification.id} runtime evidenceDigest mismatch`)
  invariant(binding.runId === evidence.run.runId, `Certified record ${certification.id} runtime runId mismatch`)
  invariant(binding.scope === evidence.scope, `Certified record ${certification.id} runtime evidence scope mismatch`)
  invariant(binding.providerId === expectedRuntimeId, `Certified record ${certification.id} runtime provider binding mismatch`)
  const provider = evidence.providers.find(item => item.id === binding.providerId)
  invariant(
    provider?.status === 'pass' && requiredRuntimeChecksPass(provider.checks),
    `Certified record ${certification.id} required provider runtime checks did not all pass`,
  )
  validateRuntimeCheckCoverage(profileProvider, provider, `Certified record ${certification.id} runtime evidence`)
  const profileTarget = profileProvider.certificationTargets.find(target => target.id === binding.targetId)
  invariant(profileTarget, `Certified record ${certification.id} target is absent from the active runtime profile`)
  invariant(binding.targetId === targetId, `Certified record ${certification.id} runtime evidence binds the wrong target`)
  invariant(provider.targetBinding.id === binding.targetId && provider.targetBinding.digest === binding.targetDigest, `Certified record ${certification.id} runtime target binding mismatch`)
  invariant(binding.targetDigest === runtimeTargetDigest(profileTarget), `Certified record ${certification.id} runtime target digest mismatch`)
  for (const field of TARGET_AXES) {
    invariant(binding[field] === profileTarget[field], `Certified record ${certification.id} ${field} differs from the active runtime profile target`)
    invariant(binding[field] === certificationTarget[field], `Certified record ${certification.id} ${field} differs from its certification platform matrix`)
    if (field !== 'distributionVersion') invariant(binding[field] === evidence.run[field], `Certified record ${certification.id} runtime artifact ${field} mismatch`)
  }
  invariant(binding.distributionVersion === provider.tool.distribution.distributionVersion, `Certified record ${certification.id} runtime distribution version mismatch`)
  invariant(certification.providerVersion === binding.distributionVersion, `Certified record ${certification.id} providerVersion differs from its bound distributionVersion`)
  invariant(provider.tool?.executable === profileProvider.executable, `Certified record ${certification.id} runtime executable differs from the registered profile`)
  invariant(binding.distributionDigest === digest(stableStringify(provider.tool.distribution, 0)), `Certified record ${certification.id} runtime distribution binding mismatch`)
  invariant(versionMatches(provider.tool.version, certification.providerVersion), `Certified record ${certification.id} provider version is stale or mismatched`)
  invariant(evidence.subject.worktreeDirty === false, `Certified record ${certification.id} runtime evidence was generated from a dirty worktree`)
  invariant(repositoryTarget && repositoryIdentity, `Certified record ${certification.id} requires its explicit role certification canary and repository identity`)
  invariant(binding.gitCommit === evidence.subject.gitHead, `Certified record ${certification.id} gitCommit binding differs from its runtime artifact`)
  invariant(binding.gitTree === evidence.subject.gitTree, `Certified record ${certification.id} gitTree binding differs from its runtime artifact`)
  invariant(binding.hardGateContractDigest === evidence.subject.contractDigest, `Certified record ${certification.id} hard-gate contract binding differs from its runtime artifact`)
  validateRepositorySubjectProof(repositoryTarget, repositoryIdentity, {
    subjectCommit: binding.gitCommit,
    subjectTree: binding.gitTree,
  }, { carrierPolicy })
  for (const field of ['profileDigest', 'harnessDigest']) {
    invariant(binding[field] === identity[field], `Certified record ${certification.id} ${field} binding is stale`)
    invariant(evidence.subject[field] === identity[field], `Certified record ${certification.id} runtime artifact ${field} is stale`)
  }
  invariant(evidence.subject.contractValid === true && evidence.subject.contractBlockingDiagnosticIds.length === 0, `Certified record ${certification.id} runtime contract did not pass`)
  invariant(evidence.subject.registeredProviderIds.includes(binding.providerId), `Certified record ${certification.id} runtime provider is absent from the contract`)
  return {
    scope: evidence.scope,
    runtimeProfileId: binding.providerId,
    providerId: binding.providerId,
    runId: evidence.run.runId,
    evidenceDigest: evidence.evidenceDigest,
    distributionDigest: binding.distributionDigest,
    targetId: binding.targetId,
    targetDigest: binding.targetDigest,
  }
}

export const runtimeCertificationPaths = {
  repoRoot: DEFAULT_REPO_ROOT,
  governanceRoot: GOVERNANCE_ROOT,
  stagingEvidence: resolve(GOVERNANCE_ROOT, 'runtime/provider-runtime-conformance.json'),
  evidenceDirectory: resolve(GOVERNANCE_ROOT, 'evidence/provider-runtime'),
}

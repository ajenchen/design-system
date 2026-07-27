#!/usr/bin/env node

import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertExternalActivationReady,
  externalActivationPolicyDigest,
} from '../infra/governance/lib/external-activation.mjs'
import {
  EMPTY_BYPASS_ACTORS_SHA256,
  GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH,
  GITHUB_MUTATION_BOUNDARY_MINIMUM_REMAINING_VALIDITY_SECONDS,
  sha256,
  stableJson,
  validateGithubMutationBoundaryContract,
} from './lib/github-mutation-boundary.mjs'
import {
  assertClosedGitLocalConfiguration,
  runClosedGit,
} from './lib/closed-tool-execution.mjs'

const SHA256 = /^[a-f0-9]{64}$/
const GIT_OID = /^[a-f0-9]{40}$/
const REQUIREMENTS_PATH = 'infra/governance/external-activation-requirements.json'
const INVENTORY_PATH = 'infra/governance/inventory/managed-repos.json'
const DESIRED_GITHUB_PATH = 'infra/governance/desired/github.json'
const RINGS_PATH = 'infra/governance/release-rings.json'
const ISSUERS_PATH = 'infra/governance/trust/issuers.json'
const POLICY_PATH = 'infra/governance/external-activation-policy.json'
const RUNTIME_PROFILE_PATH = 'infra/governance/providers/runtime-conformance.json'
const PROJECTION_CONTRACT_PATH = GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH
const PROJECTION_SCHEMA_PATH = 'infra/governance/schemas/github-mutation-boundary-contract.schema.json'
const MUTATION_KIND = 'github-mutation-boundary'
const SOURCE_REPOSITORY = 'ajenchen/design-system'
const TARGET_REPOSITORY = 'ajenchen/ds-product-template'
const EXPECTED_REPOSITORIES = Object.freeze([SOURCE_REPOSITORY, TARGET_REPOSITORY])
const OBSERVED_RESOURCE_KEYS = Object.freeze([
  'actionsWorkflowPermissionsDigest',
  'bypassActorsDigest',
  'environmentPolicyDigest',
  'fullRulesetsDigest',
  'normalizedRulesetsDigest',
  'projectionContractDigest',
  'publicRulesetProjectionDigest',
  'repositoryIdentityDefaultBranchDigest',
  'requiredChecksDigest',
])
const PROOF_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'release',
  'bindings',
  'minimumExpiresAt',
  'boundaries',
])
const RELEASE_KEYS = Object.freeze(['repository', 'commit', 'tree'])
const BINDING_KEYS = Object.freeze([
  'requirementsSha256',
  'policyDigest',
  'projectionContractDigest',
])
const BOUNDARY_KEYS = Object.freeze([
  'repository',
  'requirementId',
  'observedAt',
  'expiresAt',
  'publicRulesetProjectionDigest',
  'normalizedRulesetsDigest',
  'environmentPolicyDigest',
  'environmentClassification',
])
const ENVIRONMENT_CLASSIFICATION_KEYS = Object.freeze(['kind', 'name'])

const canonicalDigest = value => sha256(stableJson(value))
const prettyStableJson = value => JSON.stringify(JSON.parse(stableJson(value)), null, 2)
export const EMPTY_BYPASS_ACTORS_DIGEST = EMPTY_BYPASS_ACTORS_SHA256
export const DEFAULT_ACTIVATION_VALIDATOR = assertExternalActivationReady

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(
    actual.length === wanted.length && actual.every((key, index) => key === wanted[index]),
    `${label} has an invalid or open shape`,
  )
}

function canonicalDate(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be a canonical UTC timestamp`)
  return parsed
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error })
  }
}

function canonicalRelativePath(value, label) {
  invariant(typeof value === 'string' && value.length > 0 && !value.includes('\0') && !value.includes('\\'), `${label} is invalid`)
  invariant(!isAbsolute(value) && value.split('/').every(part => part && part !== '.' && part !== '..'), `${label} is not a canonical repository-relative path`)
  return value
}

function safeExistingDirectory(rawPath, label, { rejectDirectSymlink = false } = {}) {
  invariant(typeof rawPath === 'string' && rawPath.length > 0 && !rawPath.includes('\0'), `${label} path is invalid`)
  invariant(isAbsolute(rawPath) && resolve(rawPath) === rawPath, `${label} path must be an exact absolute path`)
  invariant(existsSync(rawPath), `${label} path does not exist`)
  const lexical = lstatSync(rawPath)
  invariant(!rejectDirectSymlink || !lexical.isSymbolicLink(), `${label} path must not be a symbolic link`)
  const canonical = realpathSync(rawPath)
  const info = lstatSync(canonical)
  invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} path must resolve to a real directory`)
  return canonical
}

function safeRegularFile(root, repositoryPath, label) {
  canonicalRelativePath(repositoryPath, label)
  const absolute = resolve(root, ...repositoryPath.split('/'))
  const rel = relative(root, absolute)
  invariant(rel && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel), `${label} escapes the release source`)
  let cursor = root
  for (const part of repositoryPath.split('/')) {
    cursor = resolve(cursor, part)
    invariant(existsSync(cursor), `${label} is missing`)
    const info = lstatSync(cursor)
    invariant(!info.isSymbolicLink(), `${label} crosses a symbolic link`)
  }
  const info = lstatSync(absolute)
  invariant(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular non-symlink file`)
  invariant(realpathSync(absolute) === absolute, `${label} resolves outside its canonical release-source path`)
  return absolute
}

function readReleaseFile(root, repositoryPath, label) {
  const path = safeRegularFile(root, repositoryPath, label)
  const before = lstatSync(path, { bigint: true })
  const bytes = readFileSync(path)
  const after = lstatSync(path, { bigint: true })
  invariant(
    before.dev === after.dev
      && before.ino === after.ino
      && before.mode === after.mode
      && before.size === after.size
      && before.mtimeNs === after.mtimeNs
      && before.ctimeNs === after.ctimeNs,
    `${label} changed while it was read`,
  )
  return { path, bytes, value: parseJsonBytes(bytes, label) }
}

function git(root, args, label) {
  assertClosedGitLocalConfiguration(root)
  const result = runClosedGit(args, {
    cwd: resolve(root),
    maxOutputBytes: 4 * 1024 * 1024,
    timeoutMs: 10_000,
  })
  invariant(result.status === 0, `${label} failed: ${(result.stderr || result.stdout || '').trim() || `exit ${result.status}`}`)
  return result.stdout.trim()
}

function assertReleaseGitState(root, expectedCommit, expectedTree) {
  invariant(GIT_OID.test(expectedCommit ?? ''), 'expected release commit must be a full lowercase SHA-1')
  invariant(GIT_OID.test(expectedTree ?? ''), 'expected release tree must be a full lowercase SHA-1')
  const topLevel = realpathSync(git(root, ['rev-parse', '--show-toplevel'], 'release-source Git root resolution'))
  invariant(topLevel === root, 'release source is not the exact Git worktree root')
  const commit = git(root, ['rev-parse', '--verify', 'HEAD'], 'release-source HEAD resolution')
  const tree = git(root, ['rev-parse', '--verify', 'HEAD^{tree}'], 'release-source tree resolution')
  invariant(commit === expectedCommit, 'release-source HEAD differs from the expected immutable commit')
  invariant(tree === expectedTree, 'release-source tree differs from the expected immutable tree')
  const trackedStatus = git(root, ['status', '--porcelain=v1', '--untracked-files=no', '--ignore-submodules=none'], 'release-source tracked-tree status')
  invariant(trackedStatus === '', 'release-source tracked tree is dirty')
  return { commit, tree }
}

function validateSchemaDocument(schema, contract) {
  exactKeys(schema, ['$schema', '$id', 'title', 'type', 'additionalProperties', 'required', 'properties', '$defs'], 'projection contract schema')
  invariant(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'projection contract schema draft is invalid')
  invariant(schema.$id === 'https://qijenchen.dev/schemas/github-mutation-boundary-contract-v1.json', 'projection contract schema identity is invalid')
  invariant(schema.type === 'object' && schema.additionalProperties === false, 'projection contract schema root must be closed')
  invariant(
    Array.isArray(schema.required)
      && stableJson([...schema.required].sort()) === stableJson(Object.keys(contract).sort()),
    'projection contract schema required fields do not exactly close the contract root',
  )
  invariant(
    schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      && stableJson(Object.keys(schema.properties).sort()) === stableJson(Object.keys(contract).sort()),
    'projection contract schema properties do not exactly close the contract root',
  )
}

function selectMutationRequirements(document, label) {
  invariant(Array.isArray(document?.requirements), `${label} requirements must be an array`)
  const mutations = document.requirements.filter(requirement => requirement?.kind === MUTATION_KIND)
  invariant(mutations.length === EXPECTED_REPOSITORIES.length, `${label} must contain exactly two GitHub mutation-boundary requirements`)
  const selected = new Map()
  for (const repository of EXPECTED_REPOSITORIES) {
    const matches = mutations.filter(requirement => requirement.repository === repository)
    invariant(matches.length === 1, `${label} must contain exactly one GitHub mutation-boundary requirement for ${repository}`)
    selected.set(repository, matches[0])
  }
  invariant(mutations.every(requirement => EXPECTED_REPOSITORIES.includes(requirement.repository)), `${label} contains a GitHub mutation-boundary requirement for an unexpected repository`)
  return selected
}

function validateContractBinding(requirement, contractDigest, label) {
  exactKeys(requirement.mutationBoundaryContract, ['path', 'sha256'], `${label} mutation-boundary contract binding`)
  invariant(
    requirement.mutationBoundaryContract.path === PROJECTION_CONTRACT_PATH
      && requirement.mutationBoundaryContract.sha256 === contractDigest,
    `${label} mutation-boundary contract binding drifted`,
  )
}

function environmentClassification(contract, repository) {
  const scope = repository === SOURCE_REPOSITORY ? contract.scope.source : contract.scope.target
  if (scope.environment === null) return { kind: 'absent', name: null }
  return { kind: 'named-protected-environment', name: scope.environment }
}

function validateActivatedMutationRequirement(requirement, {
  repository,
  policyRequirement,
  contractDigest,
  contract,
  now,
  rings,
}) {
  invariant(requirement.id === policyRequirement.id, `GitHub mutation-boundary requirement ID differs from policy for ${repository}`)
  invariant(requirement.repository === repository && requirement.kind === MUTATION_KIND, `GitHub mutation-boundary requirement identity is invalid for ${repository}`)
  invariant(requirement.status === 'activated', `GitHub mutation-boundary requirement for ${repository} is not activated`)
  invariant(
    Array.isArray(requirement.requiredFor)
      && requirement.requiredFor.includes('release')
      && Array.isArray(policyRequirement.requiredFor)
      && policyRequirement.requiredFor.includes('release'),
    `GitHub mutation-boundary requirement for ${repository} is not release-scoped`,
  )
  validateContractBinding(requirement, contractDigest, `GitHub mutation-boundary requirement ${requirement.id}`)
  validateContractBinding(policyRequirement, contractDigest, `GitHub mutation-boundary policy ${policyRequirement.id}`)

  const observedAt = canonicalDate(requirement.observedAt, `GitHub mutation-boundary requirement ${requirement.id} observedAt`)
  const expiresAt = canonicalDate(requirement.expiresAt, `GitHub mutation-boundary requirement ${requirement.id} expiresAt`)
  invariant(expiresAt > observedAt, `GitHub mutation-boundary requirement ${requirement.id} expiresAt must follow observedAt`)
  invariant(expiresAt > now, `GitHub mutation-boundary requirement ${requirement.id} evidence is expired`)
  const clockSkewSeconds = rings?.attestationPolicy?.clockSkewSeconds
  const maxTtlMinutes = rings?.attestationPolicy?.maxCompletionTtlMinutes
  const maximumObservationAgeSeconds = contract?.freshnessPolicy?.maximumObservationAgeSeconds
  const minimumRemainingValiditySeconds = contract?.freshnessPolicy?.minimumRemainingValiditySeconds
  invariant(Number.isInteger(clockSkewSeconds) && clockSkewSeconds >= 0, 'release-ring completion clock skew is invalid')
  invariant(Number.isInteger(maxTtlMinutes) && maxTtlMinutes > 0, 'release-ring completion TTL is invalid')
  invariant(Number.isInteger(maximumObservationAgeSeconds) && maximumObservationAgeSeconds > 0, 'mutation-boundary maximum observation age is invalid')
  invariant(Number.isInteger(minimumRemainingValiditySeconds) && minimumRemainingValiditySeconds > 0, 'mutation-boundary minimum remaining validity is invalid')
  invariant(observedAt.getTime() <= now.getTime() + clockSkewSeconds * 1000, `GitHub mutation-boundary requirement ${requirement.id} evidence is from the future`)
  invariant(now.getTime() - observedAt.getTime() <= maximumObservationAgeSeconds * 1000, `GitHub mutation-boundary requirement ${requirement.id} observation is too old`)
  invariant(expiresAt.getTime() - now.getTime() >= minimumRemainingValiditySeconds * 1000, `GitHub mutation-boundary requirement ${requirement.id} lacks the minimum remaining validity`)
  invariant(expiresAt.getTime() - observedAt.getTime() <= maxTtlMinutes * 60_000, `GitHub mutation-boundary requirement ${requirement.id} evidence exceeds the completion TTL`)

  const evidence = requirement.evidence
  invariant(evidence && typeof evidence === 'object' && !Array.isArray(evidence), `GitHub mutation-boundary requirement ${requirement.id} lacks signed evidence`)
  invariant(
    typeof evidence.signerKeyId === 'string' && evidence.signerKeyId.length > 0
      && typeof evidence.subject === 'string' && evidence.subject.length > 0
      && typeof evidence.signature === 'string' && evidence.signature.length > 0
      && Array.isArray(evidence.coSignatures),
    `GitHub mutation-boundary requirement ${requirement.id} signed evidence envelope is incomplete`,
  )
  const payload = evidence.payload
  invariant(payload && typeof payload === 'object' && !Array.isArray(payload), `GitHub mutation-boundary requirement ${requirement.id} evidence payload is missing`)
  invariant(
    payload.requirementId === requirement.id
      && payload.repository === repository
      && payload.observedAt === requirement.observedAt
      && payload.expiresAt === requirement.expiresAt,
    `GitHub mutation-boundary requirement ${requirement.id} evidence identity drifted`,
  )
  exactKeys(payload.observedResource, OBSERVED_RESOURCE_KEYS, `GitHub mutation-boundary requirement ${requirement.id} observed resource`)
  for (const key of OBSERVED_RESOURCE_KEYS) {
    invariant(SHA256.test(payload.observedResource[key] ?? ''), `GitHub mutation-boundary requirement ${requirement.id} ${key} is invalid`)
  }
  invariant(payload.observedResource.projectionContractDigest === contractDigest, `GitHub mutation-boundary requirement ${requirement.id} projection contract digest drifted`)
  invariant(payload.observedResource.bypassActorsDigest === EMPTY_BYPASS_ACTORS_DIGEST, `GitHub mutation-boundary requirement ${requirement.id} does not prove an empty bypass-actor set`)
  const desiredBinding = repository === SOURCE_REPOSITORY
    ? contract.desiredBindings.source
    : contract.desiredBindings.target
  for (const key of [
    'normalizedRulesetsDigest',
    'requiredChecksDigest',
    'actionsWorkflowPermissionsDigest',
    'repositoryIdentityDefaultBranchDigest',
    'environmentPolicyDigest',
  ]) {
    invariant(
      payload.observedResource[key] === desiredBinding[key],
      `GitHub mutation-boundary requirement ${requirement.id} ${key} differs from the immutable desired binding`,
    )
  }

  return {
    repository,
    requirementId: requirement.id,
    observedAt: requirement.observedAt,
    expiresAt: requirement.expiresAt,
    publicRulesetProjectionDigest: payload.observedResource.publicRulesetProjectionDigest,
    normalizedRulesetsDigest: payload.observedResource.normalizedRulesetsDigest,
    environmentPolicyDigest: payload.observedResource.environmentPolicyDigest,
    environmentClassification: environmentClassification(contract, repository),
  }
}

export function validateMirrorActivationBoundaryProof(proof, { now = null } = {}) {
  exactKeys(proof, PROOF_KEYS, 'mirror activation-boundary proof')
  invariant(proof.schemaVersion === 1 && proof.kind === 'mirror-activation-boundary-proof-v1', 'mirror activation-boundary proof identity/version is invalid')
  exactKeys(proof.release, RELEASE_KEYS, 'mirror activation-boundary release identity')
  invariant(
    proof.release.repository === SOURCE_REPOSITORY
      && GIT_OID.test(proof.release.commit ?? '')
      && GIT_OID.test(proof.release.tree ?? ''),
    'mirror activation-boundary release identity is invalid',
  )
  exactKeys(proof.bindings, BINDING_KEYS, 'mirror activation-boundary bindings')
  for (const [key, value] of Object.entries(proof.bindings)) invariant(SHA256.test(value ?? ''), `mirror activation-boundary ${key} is invalid`)
  const minimumExpiresAt = canonicalDate(proof.minimumExpiresAt, 'mirror activation-boundary minimumExpiresAt')
  invariant(now === null || (now instanceof Date && Number.isFinite(now.getTime())), 'mirror activation-boundary proof validation time is invalid')
  if (now !== null) invariant(
    minimumExpiresAt.getTime() - now.getTime()
      >= GITHUB_MUTATION_BOUNDARY_MINIMUM_REMAINING_VALIDITY_SECONDS * 1000,
    'mirror activation-boundary proof lacks the minimum remaining validity',
  )
  invariant(Array.isArray(proof.boundaries) && proof.boundaries.length === EXPECTED_REPOSITORIES.length, 'mirror activation-boundary proof must contain exactly two repository boundaries')
  for (const [index, repository] of EXPECTED_REPOSITORIES.entries()) {
    const boundary = proof.boundaries[index]
    exactKeys(boundary, BOUNDARY_KEYS, `mirror activation-boundary ${repository}`)
    invariant(boundary.repository === repository, `mirror activation-boundary repository order/identity drifted at ${repository}`)
    invariant(typeof boundary.requirementId === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(boundary.requirementId), `mirror activation-boundary requirement ID is invalid for ${repository}`)
    const observedAt = canonicalDate(boundary.observedAt, `mirror activation-boundary ${repository} observedAt`)
    const expiresAt = canonicalDate(boundary.expiresAt, `mirror activation-boundary ${repository} expiresAt`)
    invariant(expiresAt > observedAt, `mirror activation-boundary ${repository} validity window is invalid`)
    invariant(SHA256.test(boundary.publicRulesetProjectionDigest ?? ''), `mirror activation-boundary public projection digest is invalid for ${repository}`)
    invariant(SHA256.test(boundary.normalizedRulesetsDigest ?? ''), `mirror activation-boundary normalized ruleset digest is invalid for ${repository}`)
    invariant(SHA256.test(boundary.environmentPolicyDigest ?? ''), `mirror activation-boundary environment digest is invalid for ${repository}`)
    exactKeys(boundary.environmentClassification, ENVIRONMENT_CLASSIFICATION_KEYS, `mirror activation-boundary ${repository} environment classification`)
    if (repository === SOURCE_REPOSITORY) {
      invariant(
        boundary.environmentClassification.kind === 'named-protected-environment'
          && boundary.environmentClassification.name === 'governance-mirror',
        'design-system mirror environment classification is invalid',
      )
    } else {
      invariant(
        boundary.environmentClassification.kind === 'absent'
          && boundary.environmentClassification.name === null,
        'product-template mirror environment classification is invalid',
      )
    }
    invariant(expiresAt >= minimumExpiresAt, `mirror activation-boundary ${repository} expires before minimumExpiresAt`)
  }
  invariant(
    proof.minimumExpiresAt === proof.boundaries.map(boundary => boundary.expiresAt).sort()[0],
    'mirror activation-boundary minimumExpiresAt is not the earliest signed expiry',
  )
  invariant(new Set(proof.boundaries.map(boundary => boundary.requirementId)).size === proof.boundaries.length, 'mirror activation-boundary requirement IDs are duplicated')
  return true
}

export function buildMirrorActivationBoundaryProof({
  ledger,
  requirementsBytes,
  expectedRequirementsSha256,
  inventory,
  desired,
  rings,
  issuerRegistry,
  policy,
  runtimeProfile,
  projectionContract,
  projectionContractSchema,
  expectedCommit,
  expectedTree,
  releaseRoot,
  now = new Date(),
  activationValidator = DEFAULT_ACTIVATION_VALIDATOR,
}) {
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'mirror activation-boundary verification time is invalid')
  invariant(Buffer.isBuffer(requirementsBytes), 'external activation requirements bytes are required')
  invariant(SHA256.test(expectedRequirementsSha256 ?? ''), 'expected external activation requirements SHA-256 is invalid')
  const requirementsSha256 = sha256(requirementsBytes)
  invariant(requirementsSha256 === expectedRequirementsSha256, 'external activation requirements byte hash differs from the expected release binding')
  invariant(stableJson(parseJsonBytes(requirementsBytes, 'external activation requirements')) === stableJson(ledger), 'external activation requirements bytes differ from the parsed ledger')
  invariant(typeof activationValidator === 'function', 'activation validator is required')
  validateGithubMutationBoundaryContract(projectionContract, { desired, inventory })
  validateSchemaDocument(projectionContractSchema, projectionContract)
  const projectionContractDigest = canonicalDigest(projectionContract)
  const policyDigest = externalActivationPolicyDigest(policy)
  exactKeys(ledger.policy, ['path', 'sha256'], 'external activation ledger policy binding')
  invariant(ledger.policy.path === POLICY_PATH && ledger.policy.sha256 === policyDigest, 'external activation policy digest/path binding drifted')

  const readiness = activationValidator(ledger, {
    inventory,
    desired,
    rings,
    issuerRegistry,
    policy,
    mutationBoundaryContract: projectionContract,
    scope: 'release',
    now,
    managedCiValidationContext: { repoRoot: releaseRoot, runtimeProfile },
  })
  invariant(readiness?.ready === true && readiness.scope === 'release', 'external activation validator did not prove all release gates ready')

  const policyRequirements = selectMutationRequirements(policy, 'external activation policy')
  const activatedRequirements = selectMutationRequirements(ledger, 'external activation ledger')
  const boundaries = EXPECTED_REPOSITORIES.map(repository => validateActivatedMutationRequirement(
    activatedRequirements.get(repository),
    {
      repository,
      policyRequirement: policyRequirements.get(repository),
      contractDigest: projectionContractDigest,
      contract: projectionContract,
      now,
      rings,
    },
  ))
  const proof = {
    schemaVersion: 1,
    kind: 'mirror-activation-boundary-proof-v1',
    release: {
      repository: SOURCE_REPOSITORY,
      commit: expectedCommit,
      tree: expectedTree,
    },
    bindings: {
      requirementsSha256,
      policyDigest,
      projectionContractDigest,
    },
    minimumExpiresAt: boundaries.map(boundary => boundary.expiresAt).sort()[0],
    boundaries,
  }
  validateMirrorActivationBoundaryProof(proof, { now })
  return proof
}

function loadReleaseInputs(releaseRoot) {
  const requirements = readReleaseFile(releaseRoot, REQUIREMENTS_PATH, 'external activation requirements')
  return {
    requirementsBytes: requirements.bytes,
    ledger: requirements.value,
    inventory: readReleaseFile(releaseRoot, INVENTORY_PATH, 'managed repository inventory').value,
    desired: readReleaseFile(releaseRoot, DESIRED_GITHUB_PATH, 'desired GitHub state').value,
    rings: readReleaseFile(releaseRoot, RINGS_PATH, 'release rings').value,
    issuerRegistry: readReleaseFile(releaseRoot, ISSUERS_PATH, 'issuer registry').value,
    policy: readReleaseFile(releaseRoot, POLICY_PATH, 'external activation policy').value,
    runtimeProfile: readReleaseFile(releaseRoot, RUNTIME_PROFILE_PATH, 'runtime conformance profile').value,
    projectionContract: readReleaseFile(releaseRoot, PROJECTION_CONTRACT_PATH, 'GitHub mutation-boundary projection contract').value,
    projectionContractSchema: readReleaseFile(releaseRoot, PROJECTION_SCHEMA_PATH, 'GitHub mutation-boundary projection schema').value,
  }
}

function safeOutputPath(rawPath) {
  invariant(typeof rawPath === 'string' && rawPath.length > 0 && !rawPath.includes('\0'), 'output path is invalid')
  invariant(isAbsolute(rawPath) && resolve(rawPath) === rawPath, 'output path must be an exact absolute path')
  invariant(basename(rawPath) !== '.' && basename(rawPath) !== '..', 'output path filename is invalid')
  const parent = safeExistingDirectory(dirname(rawPath), 'output parent')
  const output = resolve(parent, basename(rawPath))
  invariant(!existsSync(output), 'output path already exists; proof replay/no-clobber policy blocked the write')
  return output
}

export function writeMirrorActivationBoundaryProof(proof, outputPath) {
  validateMirrorActivationBoundaryProof(proof)
  const output = safeOutputPath(outputPath)
  const descriptor = openSync(output, 'wx', 0o600)
  let completed = false
  try {
    fchmodSync(descriptor, 0o600)
    writeFileSync(descriptor, `${prettyStableJson(proof)}\n`)
    fsyncSync(descriptor)
    completed = true
  } finally {
    closeSync(descriptor)
    if (!completed) {
      // Deliberately leave a failed, no-clobber tombstone instead of making a partial
      // write path replayable. A fresh output name is required after an I/O failure.
    }
  }
  const info = lstatSync(output)
  invariant(info.isFile() && !info.isSymbolicLink(), 'written activation-boundary proof is not a regular file')
  invariant((info.mode & 0o777) === 0o600, 'written activation-boundary proof permissions are not 0600')
  invariant(stableJson(parseJsonBytes(readFileSync(output), 'written activation-boundary proof')) === stableJson(proof), 'written activation-boundary proof readback differs')
  return output
}

function buildExpectedProofAgainstRelease({
  releaseSourceRoot,
  expectedCommit,
  expectedTree,
  expectedExternalActivationRequirementsSha256,
  now = new Date(),
  activationValidator = DEFAULT_ACTIVATION_VALIDATOR,
}) {
  const releaseRoot = safeExistingDirectory(releaseSourceRoot, 'release source', { rejectDirectSymlink: true })
  assertReleaseGitState(releaseRoot, expectedCommit, expectedTree)
  const inputs = loadReleaseInputs(releaseRoot)
  const proof = buildMirrorActivationBoundaryProof({
    ...inputs,
    expectedRequirementsSha256: expectedExternalActivationRequirementsSha256,
    expectedCommit,
    expectedTree,
    releaseRoot,
    now,
    activationValidator,
  })
  assertReleaseGitState(releaseRoot, expectedCommit, expectedTree)
  return { proof, releaseRoot }
}

export function assertMirrorActivationBoundaryProofAgainstRelease({
  proof,
  releaseSourceRoot,
  expectedCommit,
  expectedTree,
  expectedExternalActivationRequirementsSha256,
  now = new Date(),
  activationValidator = DEFAULT_ACTIVATION_VALIDATOR,
}) {
  validateMirrorActivationBoundaryProof(proof, { now })
  const expected = buildExpectedProofAgainstRelease({
    releaseSourceRoot,
    expectedCommit,
    expectedTree,
    expectedExternalActivationRequirementsSha256,
    now,
    activationValidator,
  })
  invariant(
    stableJson(proof) === stableJson(expected.proof),
    'mirror activation-boundary proof differs from the fully revalidated signed release evidence',
  )
  assertReleaseGitState(expected.releaseRoot, expectedCommit, expectedTree)
  return expected.proof
}

export function verifyMirrorActivationBoundary({
  releaseSourceRoot,
  expectedCommit,
  expectedTree,
  expectedExternalActivationRequirementsSha256,
  outputPath,
  now = new Date(),
  activationValidator = DEFAULT_ACTIVATION_VALIDATOR,
}) {
  const expected = buildExpectedProofAgainstRelease({
    releaseSourceRoot,
    expectedCommit,
    expectedTree,
    expectedExternalActivationRequirementsSha256,
    now,
    activationValidator,
  })
  const { proof, releaseRoot } = expected
  writeMirrorActivationBoundaryProof(proof, outputPath)
  assertReleaseGitState(releaseRoot, expectedCommit, expectedTree)
  return proof
}

export function parseMirrorActivationBoundaryCli(argv) {
  const expectedFlags = Object.freeze([
    '--release-source-root',
    '--expected-commit',
    '--expected-tree',
    '--expected-external-activation-requirements-sha256',
    '--output',
  ])
  invariant(Array.isArray(argv) && argv.length === expectedFlags.length * 2, 'usage: verify-mirror-activation-boundary.mjs --release-source-root ABSOLUTE_PATH --expected-commit SHA1 --expected-tree SHA1 --expected-external-activation-requirements-sha256 SHA256 --output ABSOLUTE_PATH')
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    invariant(expectedFlags.includes(flag), `unknown or positional CLI input: ${String(flag)}`)
    invariant(!values.has(flag), `duplicate CLI input: ${flag}`)
    invariant(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), `${flag} requires one value`)
    values.set(flag, value)
  }
  return {
    releaseSourceRoot: values.get('--release-source-root'),
    expectedCommit: values.get('--expected-commit'),
    expectedTree: values.get('--expected-tree'),
    expectedExternalActivationRequirementsSha256: values.get('--expected-external-activation-requirements-sha256'),
    outputPath: values.get('--output'),
  }
}

function main() {
  const options = parseMirrorActivationBoundaryCli(process.argv.slice(2))
  const proof = verifyMirrorActivationBoundary(options)
  process.stdout.write(`${prettyStableJson(proof)}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`mirror activation boundary blocked: ${error.message}\n`)
    process.exitCode = 2
  }
}

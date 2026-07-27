import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, relative, resolve, sep } from 'node:path'
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
  externalSurfaceDistributionDigest,
  validateExternalSurfaceEvidence,
  verifyExternalSurfaceEvidenceAttestation,
} from './external-surface-evidence.mjs'
import {
  currentRuntimeCertificationIdentity,
  validateCertificationRuntimeEvidence,
} from './runtime-certification.mjs'
import {
  validateCertificationPlatformMatrix,
} from './model-validation.mjs'
import {
  certificationAggregateStatus,
  materializeReviewCapabilityCertification,
  prepareReviewCapabilityCertification,
} from '../../../packages/governance/src/provider-review-binding.mjs'
import {
  buildRepositorySubjectProof,
  resolveLocalRepositoryIdentity,
} from './repository-subject-proof.mjs'
import {
  certificationCarrierPolicyForRole,
  loadRoleSurfacePolicy,
} from './role-surface-policy.mjs'
import {
  createExternalActivationEvidence,
  EXTERNAL_ACTIVATION_POLICY_DIGEST,
  externalActivationPayload,
  externalActivationPolicyDigest,
  GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
  validateExternalActivationRequirements,
} from './external-activation.mjs'
import {
  issuerRegistryDigest,
  loadIssuerRegistry,
  resolvePolicyIssuer,
} from './issuer-registry.mjs'
import { validateAttestationPolicy } from './attestation.mjs'

const MODULE_PATH = fileURLToPath(import.meta.url)
const GOVERNANCE_ROOT = resolve(dirname(MODULE_PATH), '..')
const DEFAULT_REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024
const SHA256 = /^[a-f0-9]{64}$/
const GIT_OID = /^[a-f0-9]{40}$/
const CANONICAL_CERTIFICATION_LEDGER_PATH = 'infra/governance/providers/certifications.json'
const CANONICAL_REVIEW_CAPABILITY_LEDGER_PATH = 'infra/governance/providers/review-capability-certifications.json'
const CANONICAL_ACTIVATION_LEDGER_PATH = 'infra/governance/external-activation-requirements.json'
const EXTERNAL_EVIDENCE_PREFIX = 'infra/governance/evidence/external-runtime'
const PROVIDER_RUNTIME_EVIDENCE_PREFIX = 'infra/governance/evidence/provider-runtime'
const REVIEW_CAPABILITY_EVIDENCE_PREFIX = 'infra/governance/evidence/review-capability'
const CERTIFICATION_PROPOSAL_SCHEMA = '../schemas/external-runtime-certification-proposal.schema.json'
const PROVIDER_REVIEW_CERTIFICATION_PROPOSAL_SCHEMA = '../schemas/provider-review-capability-certification-proposal.schema.json'
const ACTIVATION_SIGNING_REQUEST_SCHEMA = '../schemas/external-activation-signing-request.schema.json'
const ACTIVATION_PROPOSAL_SCHEMA = '../schemas/external-activation-proposal.schema.json'
const IMPORT_RECEIPT_SCHEMA = '../schemas/external-surface-import-receipt.schema.json'
const BLOCK_RESULT_SCHEMA = '../schemas/external-operator-block-result.schema.json'
const SIGNATURE_BUNDLE_SCHEMA = '../schemas/external-activation-signature-bundle.schema.json'
const TRANSACTION_HANDOFF_SCHEMA = '../schemas/external-ledger-transaction-handoff.schema.json'
const ACTIVATION_SIGNATURE_DOMAIN = 'external-activation-v3'
export const EXTERNAL_HANDOFF_MINIMUM_VALIDITY_SECONDS = 60
const UTF8 = new TextDecoder('utf-8', { fatal: true })

export const externalOperatorPaths = Object.freeze({
  repoRoot: DEFAULT_REPO_ROOT,
  governanceRoot: GOVERNANCE_ROOT,
  certificationLedger: resolve(GOVERNANCE_ROOT, 'providers/certifications.json'),
  reviewCapabilityCertificationLedger: resolve(GOVERNANCE_ROOT, 'providers/review-capability-certifications.json'),
  providerRegistry: resolve(DEFAULT_REPO_ROOT, 'packages/governance/canonical/providers.json'),
  reviewCapabilityRegistry: resolve(GOVERNANCE_ROOT, 'providers/review-capability-registry.json'),
  modelInvocationProfiles: resolve(GOVERNANCE_ROOT, 'providers/model-invocation-profiles.json'),
  modelReleaseRegistry: resolve(GOVERNANCE_ROOT, 'providers/model-release-registry.json'),
  activationLedger: resolve(GOVERNANCE_ROOT, 'external-activation-requirements.json'),
  inventory: resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'),
  desired: resolve(GOVERNANCE_ROOT, 'desired/github.json'),
  compatibilityMatrix: resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json'),
  runtimeProfile: resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json'),
  roleSurfacePolicy: resolve(GOVERNANCE_ROOT, 'providers/role-surface-policy.json'),
  releaseRings: resolve(GOVERNANCE_ROOT, 'release-rings.json'),
  issuerRegistry: resolve(GOVERNANCE_ROOT, 'trust/issuers.json'),
  activationPolicy: resolve(GOVERNANCE_ROOT, 'external-activation-policy.json'),
  mutationBoundaryContract: resolve(GOVERNANCE_ROOT, 'providers/github-mutation-boundary-contract.json'),
  externalEvidenceDirectory: resolve(GOVERNANCE_ROOT, 'evidence/external-runtime'),
  runtimeDirectory: resolve(GOVERNANCE_ROOT, 'runtime'),
})

export class ExternalOperatorBlockedError extends Error {
  constructor(code, detail, options = undefined) {
    super(`${code}:${detail}`, options)
    this.name = 'ExternalOperatorBlockedError'
    this.code = code
    this.detail = detail
  }
}

function block(code, detail, cause = undefined) {
  throw new ExternalOperatorBlockedError(code, detail, cause ? { cause } : undefined)
}

function guarded(code, callback) {
  try {
    return callback()
  } catch (error) {
    if (error instanceof ExternalOperatorBlockedError) throw error
    block(code, error.message, error)
  }
}

function clone(value) {
  return structuredClone(value)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant([Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label} must be a plain object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

function canonicalUtc(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be a canonical UTC timestamp`)
  return parsed
}

function canonicalBytes(value) {
  return Buffer.from(`${stableStringify(value)}\n`, 'utf8')
}

function digestValue(value) {
  return sha256(stableStringify(value, 0))
}

function proposalDigest(value) {
  const unsigned = clone(value)
  delete unsigned.proposalDigest
  return digestValue(unsigned)
}

function requestDigest(value) {
  const unsigned = clone(value)
  delete unsigned.requestDigest
  return digestValue(unsigned)
}

function isWithin(parent, child) {
  const suffix = relative(parent, child)
  return suffix === '' || (!suffix.startsWith(`..${sep}`) && suffix !== '..' && !suffix.startsWith(sep))
}

function assertRealDirectory(path, boundary, label) {
  invariant(isWithin(boundary, path), `${label} escapes its filesystem boundary`)
  invariant(existsSync(boundary), `${label} boundary is missing`)
  const boundaryInfo = lstatSync(boundary)
  invariant(boundaryInfo.isDirectory() && !boundaryInfo.isSymbolicLink(), `${label} boundary must be a real directory`)
  let current = boundary
  const suffix = relative(boundary, path)
  for (const segment of suffix === '' ? [] : suffix.split(sep)) {
    invariant(segment && segment !== '.' && segment !== '..', `${label} contains an unsafe segment`)
    current = resolve(current, segment)
    invariant(existsSync(current), `${label} directory is missing: ${current}`)
    const info = lstatSync(current)
    invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} crosses a symlink or non-directory: ${current}`)
  }
}

function ensureEvidenceDirectory(repoRoot) {
  const root = resolve(repoRoot)
  const governance = resolve(root, 'infra/governance')
  assertRealDirectory(governance, root, 'External evidence governance root')
  const evidence = resolve(governance, 'evidence')
  if (!existsSync(evidence)) mkdirSync(evidence, { mode: 0o755 })
  assertRealDirectory(evidence, governance, 'External evidence root')
  const destination = resolve(evidence, 'external-runtime')
  if (!existsSync(destination)) mkdirSync(destination, { mode: 0o755 })
  assertRealDirectory(destination, evidence, 'External runtime evidence directory')
  return destination
}

export function readExternalOperatorArtifact(path, {
  boundary = null,
  label = 'External operator artifact',
  maxBytes = MAX_ARTIFACT_BYTES,
} = {}) {
  const requested = resolve(path)
  invariant(existsSync(requested), `${label} is missing: ${requested}`)
  const requestedBefore = lstatSync(requested, { bigint: true })
  invariant(requestedBefore.isFile() && !requestedBefore.isSymbolicLink(), `${label} must not be a symbolic link`)
  const absolute = realpathSync(requested)
  if (boundary) {
    const root = realpathSync(resolve(boundary))
    invariant(isWithin(root, absolute) && absolute !== root, `${label} escapes its allowed directory`)
    assertRealDirectory(dirname(absolute), root, `${label} parent`)
  } else assertRealDirectory(dirname(absolute), dirname(absolute), `${label} parent`)
  const before = lstatSync(absolute, { bigint: true })
  invariant(before.isFile()
    && !before.isSymbolicLink()
    && before.dev === requestedBefore.dev
    && before.ino === requestedBefore.ino
    && before.mode === requestedBefore.mode
    && before.nlink === 1n
    && before.size === requestedBefore.size
    && before.mtimeNs === requestedBefore.mtimeNs
    && before.ctimeNs === requestedBefore.ctimeNs,
  `${label} must be one stable single-link regular file`)
  invariant(before.size > 0n && before.size <= BigInt(maxBytes), `${label} has an invalid or oversized byte length`)
  invariant(realpathSync(requested) === absolute, `${label} canonical path changed before opening`)
  const descriptor = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const opened = fstatSync(descriptor, { bigint: true })
    invariant(opened.isFile()
      && opened.dev === before.dev
      && opened.ino === before.ino
      && opened.mode === before.mode
      && opened.nlink === before.nlink
      && opened.size === before.size
      && opened.mtimeNs === before.mtimeNs
      && opened.ctimeNs === before.ctimeNs,
    `${label} changed while opening`)
    const bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor, { bigint: true })
    invariant(after.dev === opened.dev
      && after.ino === opened.ino
      && after.mode === opened.mode
      && after.nlink === opened.nlink
      && after.size === BigInt(bytes.length)
      && after.mtimeNs === opened.mtimeNs
      && after.ctimeNs === opened.ctimeNs,
    `${label} changed while reading`)
    const pathAfter = lstatSync(absolute, { bigint: true })
    const requestedAfter = lstatSync(requested, { bigint: true })
    invariant(pathAfter.isFile()
      && !pathAfter.isSymbolicLink()
      && pathAfter.dev === after.dev
      && pathAfter.ino === after.ino
      && pathAfter.mode === after.mode
      && pathAfter.nlink === 1n
      && pathAfter.size === after.size
      && pathAfter.mtimeNs === after.mtimeNs
      && pathAfter.ctimeNs === after.ctimeNs
      && requestedAfter.isFile()
      && !requestedAfter.isSymbolicLink()
      && requestedAfter.dev === after.dev
      && requestedAfter.ino === after.ino
      && requestedAfter.mode === after.mode
      && requestedAfter.nlink === after.nlink
      && requestedAfter.size === after.size
      && requestedAfter.mtimeNs === after.mtimeNs
      && requestedAfter.ctimeNs === after.ctimeNs
      && realpathSync(requested) === absolute,
    `${label} was substituted while reading`)
    return { absolute, bytes, mode: Number(before.mode & 0o777n) }
  } finally {
    closeSync(descriptor)
  }
}

function parseCanonicalJson(bytes, label) {
  invariant(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES, `${label} bytes are missing or oversized`)
  let value
  try {
    value = JSON.parse(UTF8.decode(bytes))
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8 JSON: ${error.message}`, { cause: error })
  }
  invariant(bytes.equals(canonicalBytes(value)), `${label} must use exact canonical JSON bytes`)
  return value
}

export function parseCanonicalExternalOperatorArtifact(bytes, label = 'External operator artifact') {
  return guarded('EXTERNAL_OPERATOR_ARTIFACT_INVALID', () => parseCanonicalJson(bytes, label))
}

function validClockValue(value, label) {
  invariant(value instanceof Date && Number.isFinite(value.getTime()), `${label} is invalid`)
  return value
}

function fsyncDirectory(path) {
  const descriptor = openSync(path, constants.O_RDONLY)
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function runtimeOutputTarget(path, runtimeDirectory) {
  const runtimeRequested = resolve(runtimeDirectory)
  invariant(existsSync(runtimeRequested), 'External operator runtime directory is missing')
  const runtimeInfo = lstatSync(runtimeRequested)
  invariant(runtimeInfo.isDirectory() && !runtimeInfo.isSymbolicLink(), 'External operator runtime directory must be a real directory')
  const runtimePhysical = realpathSync(runtimeRequested)
  const requested = resolve(path)
  invariant(isWithin(runtimeRequested, requested) && requested !== runtimeRequested,
    'Output must remain below infra/governance/runtime')
  const parentRequested = dirname(requested)
  assertRealDirectory(parentRequested, runtimeRequested, 'External operator runtime output parent')
  const parentPhysical = realpathSync(parentRequested)
  invariant(isWithin(runtimePhysical, parentPhysical), 'External operator runtime output parent escapes its physical boundary')
  const physical = resolve(parentPhysical, basename(requested))
  invariant(isWithin(runtimePhysical, physical) && physical !== runtimePhysical,
    'External operator runtime output escapes its physical boundary')
  invariant(!existsSync(requested) && !existsSync(physical), 'External operator runtime output already exists')
  return {
    requested,
    physical,
    runtimeRequested,
    runtimePhysical,
    parentPhysical,
  }
}

export function writeExternalOperatorRuntimeArtifact(path, value, {
  runtimeDirectory = externalOperatorPaths.runtimeDirectory,
  clock = () => new Date(),
  validateBeforeWrite = null,
} = {}) {
  return guarded('EXTERNAL_OPERATOR_RUNTIME_OUTPUT_BLOCKED', () => {
    const target = runtimeOutputTarget(path, runtimeDirectory)
    const bytes = canonicalBytes(value)
    invariant(bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES,
      'External operator runtime output is missing or oversized')
    let descriptor = null
    let opened = null
    let completed = false
    try {
      descriptor = openSync(
        target.physical,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
        0o600,
      )
      opened = fstatSync(descriptor, { bigint: true })
      invariant(opened.isFile() && opened.nlink === 1n,
        'External operator runtime output is not a unique regular file')
      const commitNow = validClockValue(clock(), 'External operator runtime output commit time')
      if (validateBeforeWrite) validateBeforeWrite(commitNow)
      writeFileSync(descriptor, bytes)
      fsyncSync(descriptor)
      const written = fstatSync(descriptor, { bigint: true })
      invariant(written.isFile()
        && written.dev === opened.dev
        && written.ino === opened.ino
        && written.nlink === 1n
        && written.size === BigInt(bytes.length),
      'External operator runtime output changed while writing')
      closeSync(descriptor)
      descriptor = null
      const readback = readExternalOperatorArtifact(target.requested, {
        boundary: target.runtimeRequested,
        label: 'External operator runtime output readback',
      })
      invariant(readback.absolute === target.physical
        && isWithin(target.runtimePhysical, readback.absolute)
        && readback.bytes.equals(bytes),
      'External operator runtime output physical readback failed')
      fsyncDirectory(target.parentPhysical)
      completed = true
      return {
        path: readback.absolute,
        bytes: readback.bytes,
        commitTime: commitNow.toISOString(),
      }
    } finally {
      if (descriptor !== null) closeSync(descriptor)
      if (!completed && opened !== null && existsSync(target.physical)) {
        const current = lstatSync(target.physical, { bigint: true })
        if (current.isFile()
          && !current.isSymbolicLink()
          && current.dev === opened.dev
          && current.ino === opened.ino
          && current.nlink === 1n) {
          unlinkSync(target.physical)
          fsyncDirectory(target.parentPhysical)
        }
      }
    }
  })
}

function assertRemainingHandoffValidity(validUntil, now, label) {
  const expires = canonicalUtc(validUntil, `${label} validUntil`)
  const current = validClockValue(now, `${label} current time`)
  invariant(
    expires.getTime() - current.getTime() >= EXTERNAL_HANDOFF_MINIMUM_VALIDITY_SECONDS * 1000,
    `${label} lacks the minimum ${EXTERNAL_HANDOFF_MINIMUM_VALIDITY_SECONDS}-second remaining validity horizon`,
  )
  return expires
}

function handoffDigest(value) {
  const unsigned = clone(value)
  delete unsigned.handoffDigest
  return digestValue(unsigned)
}

function authorityRepository(models) {
  const matches = models.inventory.repositories.filter(repository => repository.role === 'authority')
  invariant(matches.length === 1, 'External operator handoff requires exactly one authority repository')
  const repository = matches[0]
  invariant(typeof repository.id === 'string'
    && typeof repository.github === 'string'
    && typeof repository.defaultBranch === 'string',
  'External operator handoff authority repository identity is incomplete')
  return {
    id: repository.id,
    github: repository.github,
    defaultBranch: repository.defaultBranch,
  }
}

function validateGitTransactionInputs({
  expectedBaseCommit,
  currentBaseCommit,
  expectedBaseTree,
  currentBaseTree,
  baseLedgerSha256,
  ledgerBeforeSha256,
}) {
  invariant(GIT_OID.test(expectedBaseCommit ?? '')
    && GIT_OID.test(currentBaseCommit ?? '')
    && expectedBaseCommit === currentBaseCommit,
  'External operator handoff expected Git base is not the current checkout base')
  invariant(GIT_OID.test(expectedBaseTree ?? '')
    && GIT_OID.test(currentBaseTree ?? '')
    && expectedBaseTree === currentBaseTree,
  'External operator handoff expected Git base tree is not current')
  invariant(SHA256.test(baseLedgerSha256 ?? '') && baseLedgerSha256 === ledgerBeforeSha256,
    'External operator handoff protected-base ledger differs from the reviewed before-image')
}

function transactionHandoffCore({
  operation,
  models,
  reviewedProposal,
  signingRequest,
  expectedBaseCommit,
  currentBaseCommit,
  expectedBaseTree,
  currentBaseTree,
  baseLedgerSha256,
  preparedAt,
  validUntil,
}) {
  validateGitTransactionInputs({
    expectedBaseCommit,
    currentBaseCommit,
    expectedBaseTree,
    currentBaseTree,
    baseLedgerSha256,
    ledgerBeforeSha256: reviewedProposal.ledger.beforeSha256,
  })
  assertRemainingHandoffValidity(validUntil, preparedAt, 'External operator transaction handoff')
  const repository = authorityRepository(models)
  return {
    $schema: TRANSACTION_HANDOFF_SCHEMA,
    schemaVersion: 1,
    kind: 'external-ledger-transaction-handoff',
    operation,
    applicationMode: 'protected-git-expected-base-pr-transaction-only',
    canonicalLedgerMutationPerformed: false,
    externalMutationAuthorized: false,
    preparedAt: preparedAt.toISOString(),
    validUntil,
    minimumRemainingValiditySeconds: EXTERNAL_HANDOFF_MINIMUM_VALIDITY_SECONDS,
    repository,
    gitTransaction: {
      expectedBaseCommit,
      expectedBaseTree,
      expectedBaseRef: `refs/heads/${repository.defaultBranch}`,
      expectedBaseLedgerSha256: baseLedgerSha256,
      liveProtectedBaseVerificationRequired: true,
      requiredReviewFlow: 'protected-pull-request',
      requiredPromotionPrimitive: 'atomic-expected-old-git-ref-cas',
      directCanonicalWriteAllowed: false,
    },
    reviewedProposalDigest: reviewedProposal.proposalDigest,
    signingRequest,
    reviewedProposal: clone(reviewedProposal),
    ledger: clone(reviewedProposal.ledger),
    requiredChangedPaths: [...reviewedProposal.requiredChangedPaths],
    evidenceArtifact: operation === 'external-runtime-certification'
      ? clone(reviewedProposal.evidenceArtifact)
      : null,
    ledgerAfter: clone(reviewedProposal.ledgerAfter),
  }
}

function currentModels(overrides = {}) {
  return {
    repoRoot: resolve(overrides.repoRoot ?? externalOperatorPaths.repoRoot),
    certifications: overrides.certifications ?? readJson(externalOperatorPaths.certificationLedger),
    reviewCapabilityCertifications: overrides.reviewCapabilityCertifications
      ?? readJson(externalOperatorPaths.reviewCapabilityCertificationLedger),
    providerRegistry: overrides.providerRegistry ?? readJson(externalOperatorPaths.providerRegistry),
    reviewCapabilityRegistry: overrides.reviewCapabilityRegistry
      ?? readJson(externalOperatorPaths.reviewCapabilityRegistry),
    modelInvocationProfiles: overrides.modelInvocationProfiles
      ?? readJson(externalOperatorPaths.modelInvocationProfiles),
    modelReleaseRegistry: overrides.modelReleaseRegistry
      ?? readJson(externalOperatorPaths.modelReleaseRegistry),
    activationLedger: overrides.activationLedger ?? readJson(externalOperatorPaths.activationLedger),
    inventory: overrides.inventory ?? readJson(externalOperatorPaths.inventory),
    desired: overrides.desired ?? readJson(externalOperatorPaths.desired),
    matrix: overrides.matrix ?? readJson(externalOperatorPaths.compatibilityMatrix),
    runtimeProfile: overrides.runtimeProfile ?? readJson(externalOperatorPaths.runtimeProfile),
    roleSurfacePolicy: overrides.roleSurfacePolicy ?? loadRoleSurfacePolicy(externalOperatorPaths.roleSurfacePolicy),
    rings: overrides.rings ?? readJson(externalOperatorPaths.releaseRings),
    issuerRegistry: overrides.issuerRegistry ?? loadIssuerRegistry(externalOperatorPaths.issuerRegistry),
    activationPolicy: overrides.activationPolicy ?? readJson(externalOperatorPaths.activationPolicy),
    mutationBoundaryContract: overrides.mutationBoundaryContract ?? readJson(externalOperatorPaths.mutationBoundaryContract),
    runtimeIdentity: overrides.runtimeIdentity ?? null,
  }
}

function modelDigests(models) {
  return {
    inventorySha256: digestValue(models.inventory),
    desiredSha256: digestValue(models.desired),
    compatibilityMatrixSha256: digestValue(models.matrix),
    runtimeProfileSha256: digestValue(models.runtimeProfile),
    roleSurfacePolicySha256: digestValue(models.roleSurfacePolicy),
    releaseRingsSha256: digestValue(models.rings),
    issuerRegistrySha256: digestValue(models.issuerRegistry),
    activationPolicySha256: digestValue(models.activationPolicy),
    mutationBoundaryContractSha256: digestValue(models.mutationBoundaryContract),
    providerRegistrySha256: digestValue(models.providerRegistry),
    reviewCapabilityRegistrySha256: digestValue(models.reviewCapabilityRegistry),
    modelInvocationProfilesSha256: digestValue(models.modelInvocationProfiles),
    modelReleaseRegistrySha256: digestValue(models.modelReleaseRegistry),
  }
}

function validateBaselineDigests(value, models, { includeActivation = false } = {}) {
  const required = [
    'inventorySha256',
    'desiredSha256',
    'compatibilityMatrixSha256',
    'runtimeProfileSha256',
    'roleSurfacePolicySha256',
    'issuerRegistrySha256',
  ]
  if (includeActivation) required.push('releaseRingsSha256', 'activationPolicySha256', 'mutationBoundaryContractSha256')
  exactKeys(value, required, 'External operator proposal model bindings')
  const current = modelDigests(models)
  for (const key of required) invariant(value[key] === current[key], `External operator proposal canonical input changed: ${key}`)
}

function reviewCertificationModelDigests(models) {
  const digests = modelDigests(models)
  return Object.fromEntries([
    'inventorySha256',
    'desiredSha256',
    'compatibilityMatrixSha256',
    'runtimeProfileSha256',
    'roleSurfacePolicySha256',
    'issuerRegistrySha256',
    'providerRegistrySha256',
    'reviewCapabilityRegistrySha256',
    'modelInvocationProfilesSha256',
    'modelReleaseRegistrySha256',
  ].map(key => [key, digests[key]]))
}

function validateReviewCertificationModelDigests(value, models) {
  const expected = reviewCertificationModelDigests(models)
  exactKeys(value, Object.keys(expected), 'Provider review certification proposal model bindings')
  invariant(
    stableStringify(value, 0) === stableStringify(expected, 0),
    'Provider review certification canonical inputs changed',
  )
}

function profileForEvidence(evidence, runtimeProfile) {
  const matches = runtimeProfile.providers.filter(profile => profile.id === evidence.profile.id)
  invariant(matches.length === 1, `External surface evidence profile is not uniquely registered: ${evidence.profile.id}`)
  const profile = matches[0]
  invariant(profile.executionMode === 'external-attested'
    && profile.evidenceKind === evidence.kind
    && profile.adapterProviderId === evidence.profile.adapterProviderId
    && profile.runtimeKind === evidence.profile.runtimeKind
    && profile.certificationSurface === evidence.profile.surface,
  `External surface evidence profile binding is not externally attestable: ${evidence.profile.id}`)
  const targets = profile.certificationTargets.filter(target => target.id === evidence.run.targetId)
  invariant(targets.length === 1, `External surface evidence target is not uniquely registered: ${evidence.run.targetId}`)
  return { profile, target: targets[0] }
}

export function inspectExternalSurfaceReceipt(bytes, {
  runtimeProfile = readJson(externalOperatorPaths.runtimeProfile),
  issuerRegistry = loadIssuerRegistry(externalOperatorPaths.issuerRegistry),
  now = new Date(),
} = {}) {
  return guarded('EXTERNAL_SURFACE_RECEIPT_INVALID', () => {
    const evidence = parseCanonicalJson(bytes, 'External surface receipt')
    validateExternalSurfaceEvidence(evidence)
    const { profile, target } = profileForEvidence(evidence, runtimeProfile)
    verifyExternalSurfaceEvidenceAttestation(evidence, runtimeProfile, { issuerRegistry, now })
    invariant(evidence.status === 'pass', 'External surface receipt did not pass')
    invariant(evidence.checks.every(check => check.status === 'pass'), 'External surface receipt contains a failing check')
    return {
      evidence,
      bytes,
      profile,
      target,
      artifactSha256: sha256(bytes),
    }
  })
}

export function materializeExternalSurfaceReceipt(bytes, {
  repoRoot = externalOperatorPaths.repoRoot,
  runtimeProfile,
  issuerRegistry,
  now = new Date(),
} = {}) {
  const inspected = inspectExternalSurfaceReceipt(bytes, { runtimeProfile, issuerRegistry, now })
  return guarded('EXTERNAL_SURFACE_ARTIFACT_CAS_FAILED', () => {
    const directory = ensureEvidenceDirectory(repoRoot)
    const artifactSha256 = inspected.artifactSha256
    const destination = resolve(directory, `${artifactSha256}.json`)
    if (existsSync(destination)) {
      const existing = readExternalOperatorArtifact(destination, {
        boundary: directory,
        label: 'Existing external surface artifact',
      })
      invariant(existing.bytes.equals(bytes), 'Existing content-addressed external surface artifact has different bytes')
    } else {
      const descriptor = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o444)
      try {
        writeFileSync(descriptor, bytes)
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
      const directoryDescriptor = openSync(directory, constants.O_RDONLY)
      try {
        fsyncSync(directoryDescriptor)
      } finally {
        closeSync(directoryDescriptor)
      }
    }
    const readback = readExternalOperatorArtifact(destination, {
      boundary: directory,
      label: 'Materialized external surface artifact',
    })
    invariant(readback.bytes.equals(bytes) && sha256(readback.bytes) === artifactSha256, 'External surface artifact readback failed')
    const reference = `${EXTERNAL_EVIDENCE_PREFIX}/${artifactSha256}.json`
    const receiptCore = {
      $schema: IMPORT_RECEIPT_SCHEMA,
      schemaVersion: 1,
      kind: 'external-surface-import-receipt',
      verificationStatus: 'verified',
      externalMutationPerformed: false,
      sourceBytesSha256: artifactSha256,
      artifact: {
        reference,
        artifactSha256,
        evidenceDigest: inspected.evidence.evidenceDigest,
      },
      surface: {
        profileId: inspected.profile.id,
        repositoryId: inspected.evidence.profile.repositoryId,
        repositoryRole: inspected.evidence.profile.repositoryRole,
        runId: inspected.evidence.run.runId,
        targetId: inspected.target.id,
        validUntil: inspected.evidence.run.validUntil,
      },
    }
    return {
      ...inspected,
      reference,
      destination,
      receipt: { ...receiptCore, receiptDigest: digestValue(receiptCore) },
    }
  })
}

function externalEvidenceBinding(evidence, reference, artifactSha256) {
  invariant(reference === `${EXTERNAL_EVIDENCE_PREFIX}/${artifactSha256}.json`, 'External surface artifact reference is not canonical')
  return {
    evidenceKind: evidence.kind,
    reference,
    artifactSha256,
    evidenceDigest: evidence.evidenceDigest,
    profileId: evidence.profile.id,
    runId: evidence.run.runId,
    targetId: evidence.run.targetId,
    targetDigest: evidence.run.targetDigest,
    repositoryId: evidence.profile.repositoryId,
    repository: evidence.profile.repository,
    repositoryRole: evidence.profile.repositoryRole,
    repositoryReadbackSha256: evidence.surfaceBinding.repositoryReadbackSha256,
    operatingSystem: evidence.run.operatingSystem,
    platform: evidence.run.platform,
    arch: evidence.run.arch,
    executionEnvironment: evidence.run.executionEnvironment,
    distributionVersion: evidence.distribution.version,
    pathClass: evidence.run.pathClass,
    distributionDigest: externalSurfaceDistributionDigest(evidence.distribution),
    gitCommit: evidence.subject.gitCommit,
    gitTree: evidence.subject.gitTree,
    profileDigest: evidence.subject.profileDigest,
    harnessDigest: evidence.subject.harnessDigest,
    hardGateContractDigest: evidence.subject.hardGateContractDigest,
  }
}

function exactRepositoryIdentity(repository, evidence) {
  const proof = buildRepositorySubjectProof(repository, {
    subjectCommit: evidence.subject.gitCommit,
    subjectTree: evidence.subject.gitTree,
    carrierCommit: evidence.subject.gitCommit,
    carrierTree: evidence.subject.gitTree,
  })
  return {
    gitCommit: evidence.subject.gitCommit,
    gitTree: evidence.subject.gitTree,
    subjectProofs: { [evidence.subject.gitCommit]: proof },
  }
}

function certificationTuple(models, evidence) {
  const { profile, target } = profileForEvidence(evidence, models.runtimeProfile)
  const candidates = models.certifications.certifications.filter(certification => {
    const profileId = models.matrix.providers?.[certification.provider]
      ?.runtimeKinds?.[certification.runtimeKind]
      ?.runtimeProfilesBySurface?.[certification.surface]
    return profileId === profile.id && certification.repositoryRole === evidence.profile.repositoryRole
  })
  invariant(candidates.length === 1, `External surface evidence has no unique certification ledger tuple: ${profile.id}/${evidence.profile.repositoryRole}`)
  const certification = candidates[0]
  const repository = resolveCertificationCanary(models.inventory, certification.repositoryRole)
  invariant(repository.id === evidence.profile.repositoryId && repository.github === evidence.profile.repository,
    'External surface evidence repository differs from the role certification canary')
  return { certification, profile, target, repository }
}

function certificationChecks(certification) {
  const certified = certification.platformMatrix.filter(target => target.status === 'certified')
  return certified.map(target => {
    const binding = target.runtimeEvidence ?? certification.runtimeEvidence
    invariant(binding && SHA256.test(binding.artifactSha256 ?? '') && typeof binding.reference === 'string',
      `Certified target ${certification.id}/${target.id} lacks a content-addressed artifact`)
    return {
      id: `external-runtime-evidence-${target.id}`,
      status: 'pass',
      evidence: {
        kind: 'artifact-digest',
        reference: binding.reference,
        sha256: binding.artifactSha256,
      },
    }
  })
}

function candidateCertification(models, evidence, reference, artifactSha256, { certifiedAt, expiresAt, now }) {
  const tuple = certificationTuple(models, evidence)
  const certification = clone(tuple.certification)
  const targetIndex = certification.platformMatrix.findIndex(target => target.id === tuple.target.id)
  invariant(targetIndex >= 0, `Certification ${certification.id} is missing target ${tuple.target.id}`)
  const certified = canonicalUtc(certifiedAt, 'External certification certifiedAt')
  const expires = canonicalUtc(expiresAt, 'External certification expiresAt')
  const generated = canonicalUtc(evidence.run.generatedAt, 'External surface generatedAt')
  const validUntil = canonicalUtc(evidence.run.validUntil, 'External surface validUntil')
  invariant(certified >= generated && certified <= validUntil, 'External certification issuance is outside the evidence validity window')
  invariant(certified <= now, 'External certification issuance is in the future')
  invariant(expires > certified && expires <= validUntil && expires > now, 'External certification expiry is outside the evidence validity window')
  const binding = externalEvidenceBinding(evidence, reference, artifactSha256)
  if (certification.runtimeEvidence !== undefined) {
    const existingTarget = certification.platformMatrix.find(target => target.status === 'certified'
      && (certification.runtimeEvidence.targetId === target.id))
    invariant(existingTarget, `Certification ${certification.id} has an ambiguous record-level runtime evidence binding`)
    existingTarget.runtimeEvidence = certification.runtimeEvidence
    delete certification.runtimeEvidence
  }
  certification.platformMatrix[targetIndex] = {
    ...certification.platformMatrix[targetIndex],
    status: 'certified',
    limitations: [],
    certifiedAt,
    expiresAt,
    runtimeEvidence: binding,
  }
  certification.providerVersion = evidence.distribution.version
  certification.status = certificationAggregateStatus(certification, { now })
  certification.checks = certificationChecks(certification)
  if (certification.status === 'certified') certification.limitations = []
  else {
    const pending = certification.platformMatrix.filter(target => target.status === 'not-certified').map(target => target.id)
    certification.limitations = [`Targets without reviewed runtime evidence remain not certified: ${pending.join(', ')}.`]
  }
  validateCertificationPlatformMatrix(certification, certification.id, { now })
  invariant(['certified', 'conditional'].includes(certification.status), 'External certification proposal did not certify its exact target')
  invariant(certification.checks.length > 0 && certification.checks.every(check => check.status === 'pass'), 'External certification proposal checks are incomplete')
  return { ...tuple, certification, binding }
}

function runtimeIdentityFor(models) {
  return models.runtimeIdentity ?? currentRuntimeCertificationIdentity(models.repoRoot)
}

function validateCandidateCertification(candidate, models, evidence, now) {
  const repositoryIdentity = exactRepositoryIdentity(candidate.repository, evidence)
  validateCertificationRuntimeEvidence(candidate.certification, {
    repoRoot: models.repoRoot,
    identity: runtimeIdentityFor(models),
    matrix: models.matrix,
    runtimeProfile: models.runtimeProfile,
    issuerRegistry: models.issuerRegistry,
    repositoryTarget: candidate.repository,
    repositoryIdentity,
    carrierPolicy: certificationCarrierPolicyForRole(models.roleSurfacePolicy, candidate.repository.role),
    desiredGithub: models.desired,
    now,
    targetId: candidate.target.id,
  })
  return true
}

function certificationVersionAxis(certification, label) {
  const versions = [...new Set(
    certification.platformMatrix
      .filter(target => target.status !== 'unsupported')
      .map(target => target.distributionVersion),
  )]
  invariant(versions.length === 1 && certification.providerVersion === versions[0],
    `${label} providerVersion differs from its immutable certifiable target distributionVersion`)
  return versions[0]
}

function currentHeadIdentity(repoRoot, label) {
  const root = realpathSync(resolve(repoRoot))
  const resolveOid = (revision, kind) => {
    const result = runClosedGit(
      ['rev-parse', '--verify', revision],
      {
        cwd: root,
        output: 'capture',
        maxOutputBytes: 1024,
        timeoutMs: 10_000,
      },
    )
    const oid = typeof result.stdout === 'string' ? result.stdout.trim() : ''
    invariant(
      !result.error && result.signal === null && result.status === 0 && GIT_OID.test(oid),
      `${label} cannot resolve one exact current HEAD ${kind}`,
    )
    return oid
  }
  return Object.freeze({
    commit: resolveOid('HEAD^{commit}', 'commit'),
    tree: resolveOid('HEAD^{tree}', 'tree'),
  })
}

function readCurrentHeadEvidenceArtifact(repoRoot, reference, artifactSha256, head) {
  const artifact = readCanonicalEvidenceArtifact(repoRoot, reference, artifactSha256)
  const tree = runClosedGit(
    ['ls-tree', '-z', '--full-tree', head.commit, '--', reference],
    {
      cwd: realpathSync(resolve(repoRoot)),
      output: 'buffer',
      maxOutputBytes: 1024,
      timeoutMs: 10_000,
    },
  )
  invariant(!tree.error && tree.signal === null && tree.status === 0 && Buffer.isBuffer(tree.stdout),
    `Current HEAD evidence tree lookup failed: ${reference}`)
  const record = tree.stdout.toString('utf8')
  const match = /^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(record)
  invariant(match && match[3] === reference, `Current HEAD does not contain one exact regular evidence blob: ${reference}`)
  const blob = runClosedGit(
    ['cat-file', 'blob', match[2]],
    {
      cwd: realpathSync(resolve(repoRoot)),
      output: 'buffer',
      maxOutputBytes: MAX_ARTIFACT_BYTES,
      timeoutMs: 10_000,
    },
  )
  invariant(!blob.error && blob.signal === null && blob.status === 0 && Buffer.isBuffer(blob.stdout),
    `Current HEAD evidence blob read failed: ${reference}`)
  invariant(blob.stdout.equals(artifact.bytes), `Evidence worktree bytes differ from the exact current HEAD blob: ${reference}`)
  const expectedExecutable = match[1] === '100755'
  invariant(
    ((artifact.mode & 0o111) !== 0) === expectedExecutable
      && (artifact.mode & 0o022) === 0,
    `Evidence worktree executable/write authority differs from the current HEAD blob contract: ${reference}`,
  )
  return artifact
}

export function validateExternalCertificationCarrierAfterImage({
  baselineLedger,
  currentLedger,
  repoRoot = DEFAULT_REPO_ROOT,
  inventory,
  desired,
  matrix,
  runtimeProfile,
  roleSurfacePolicy,
  issuerRegistry,
  runtimeIdentity,
  now = new Date(),
} = {}) {
  return guarded('EXTERNAL_CERTIFICATION_CARRIER_INVALID', () => {
    invariant(now instanceof Date && Number.isFinite(now.getTime()), 'External certification carrier validation time is invalid')
    exactKeys(baselineLedger, ['$schema', 'schemaVersion', 'certifications'], 'External certification baseline ledger')
    exactKeys(currentLedger, ['$schema', 'schemaVersion', 'certifications'], 'External certification current ledger')
    invariant(baselineLedger.$schema === '../schemas/provider-surface-certification.schema.json'
      && currentLedger.$schema === baselineLedger.$schema
      && baselineLedger.schemaVersion === 2
      && currentLedger.schemaVersion === 2,
    'External certification carrier ledger identity/version is invalid')
    invariant(Array.isArray(baselineLedger.certifications)
      && Array.isArray(currentLedger.certifications)
      && baselineLedger.certifications.length === currentLedger.certifications.length,
    'External certification carrier record closure differs from its immutable baseline')

    const models = currentModels({
      repoRoot,
      certifications: clone(baselineLedger),
      inventory,
      desired,
      matrix,
      runtimeProfile,
      roleSurfacePolicy,
      issuerRegistry,
      runtimeIdentity,
    })
    const carrierHead = currentHeadIdentity(models.repoRoot, 'External certification carrier')
    const accumulator = clone(baselineLedger)
    const authoritySubjects = new Set()
    const validatedArtifacts = new Map()
    for (let recordIndex = 0; recordIndex < currentLedger.certifications.length; recordIndex += 1) {
      const baseline = baselineLedger.certifications[recordIndex]
      const current = currentLedger.certifications[recordIndex]
      invariant(baseline?.id === current?.id, `External certification record order/id drifted at index ${recordIndex}`)
      invariant(baseline.runtimeEvidence === undefined && current.runtimeEvidence === undefined,
        `External certification ${current.id} record-level runtimeEvidence is unsupported; migrate it in a reviewed source update`)
      certificationVersionAxis(baseline, `External certification baseline ${baseline.id}`)
      certificationVersionAxis(current, `External certification current ${current.id}`)
      validateCertificationPlatformMatrix(baseline, baseline.id, { now })
      validateCertificationPlatformMatrix(current, current.id, { now })

      for (let targetIndex = 0; targetIndex < current.platformMatrix.length; targetIndex += 1) {
        const baselineTarget = baseline.platformMatrix[targetIndex]
        const currentTarget = current.platformMatrix[targetIndex]
        invariant(baselineTarget?.id === currentTarget?.id,
          `External certification ${current.id} target order/id drifted at index ${targetIndex}`)
        if (currentTarget.status !== 'certified') {
          invariant(stableStringify(currentTarget, 0) === stableStringify(baselineTarget, 0),
            `External certification ${current.id}/${currentTarget.id} changed without a certified external after-image`)
          continue
        }
        const binding = currentTarget.runtimeEvidence
        invariant(binding?.evidenceKind === 'external-runtime-surface-conformance',
          `External certification ${current.id}/${currentTarget.id} is not backed by the production external certification writer`)
        const artifact = readCurrentHeadEvidenceArtifact(
          models.repoRoot,
          binding.reference,
          binding.artifactSha256,
          carrierHead,
        )
        const priorArtifact = validatedArtifacts.get(binding.reference)
        if (priorArtifact) {
          invariant(
            priorArtifact.artifactSha256 === binding.artifactSha256
              && priorArtifact.bytes.equals(artifact.bytes),
            `External certification artifact reference was rebound during replay: ${binding.reference}`,
          )
        } else {
          validatedArtifacts.set(binding.reference, {
            artifactSha256: binding.artifactSha256,
            bytes: Buffer.from(artifact.bytes),
          })
        }
        const inspected = inspectExternalSurfaceReceipt(artifact.bytes, {
          runtimeProfile: models.runtimeProfile,
          issuerRegistry: models.issuerRegistry,
          now,
        })
        models.certifications = accumulator
        const candidate = candidateCertification(
          models,
          inspected.evidence,
          binding.reference,
          binding.artifactSha256,
          {
            certifiedAt: currentTarget.certifiedAt,
            expiresAt: currentTarget.expiresAt,
            now,
          },
        )
        invariant(candidate.certification.id === current.id && candidate.target.id === currentTarget.id,
          `External certification ${current.id}/${currentTarget.id} evidence resolves to another ledger tuple`)
        validateCandidateCertification(candidate, models, inspected.evidence, now)
        const accumulatorIndex = accumulator.certifications.findIndex(item => item.id === current.id)
        invariant(accumulatorIndex >= 0, `External certification accumulator lost record ${current.id}`)
        accumulator.certifications[accumulatorIndex] = candidate.certification
        if (current.repositoryRole === 'authority') authoritySubjects.add(inspected.evidence.subject.gitCommit)
      }
    }
    invariant(stableStringify(accumulator, 0) === stableStringify(currentLedger, 0),
      'External certification current ledger is not the exact replay of signed production candidate transitions')

    if (authoritySubjects.size > 0) {
      const authority = resolveCertificationCanary(models.inventory, 'authority')
      resolveLocalRepositoryIdentity({
        repoRoot: models.repoRoot,
        repository: authority,
        subjectCommits: [...authoritySubjects].sort(compareUtf8Bytes),
        carrierPolicy: certificationCarrierPolicyForRole(models.roleSurfacePolicy, 'authority'),
      })
    }
    const finalHead = currentHeadIdentity(models.repoRoot, 'External certification carrier final readback')
    invariant(finalHead.commit === carrierHead.commit && finalHead.tree === carrierHead.tree,
      'External certification carrier HEAD changed while evidence after-images were being replayed')
    for (const [reference, artifact] of validatedArtifacts) {
      const finalArtifact = readCurrentHeadEvidenceArtifact(
        models.repoRoot,
        reference,
        artifact.artifactSha256,
        carrierHead,
      )
      invariant(
        finalArtifact.bytes.equals(artifact.bytes),
        `External certification artifact changed after replay validation: ${reference}`,
      )
    }
    return true
  })
}

export function validateProviderReviewCapabilityCertificationCarrierAfterImage({
  baselineProviderCertifications,
  currentProviderCertifications,
  baselineReviewCapabilityCertifications,
  currentReviewCapabilityCertifications,
  repoRoot = externalOperatorPaths.repoRoot,
  now = new Date(),
  ...overrides
} = {}) {
  return guarded('PROVIDER_REVIEW_CERTIFICATION_CARRIER_INVALID', () => {
    invariant(
      baselineProviderCertifications?.schemaVersion === 2
        && currentProviderCertifications?.schemaVersion === 2
        && Array.isArray(baselineProviderCertifications.certifications)
        && Array.isArray(currentProviderCertifications.certifications)
        && baselineReviewCapabilityCertifications?.schemaVersion === 1
        && currentReviewCapabilityCertifications?.schemaVersion === 1
        && baselineReviewCapabilityCertifications.kind
          === 'review-capability-certification-ledger'
        && currentReviewCapabilityCertifications.kind
          === 'review-capability-certification-ledger'
        && Array.isArray(baselineReviewCapabilityCertifications.certifications)
        && Array.isArray(currentReviewCapabilityCertifications.certifications),
      'Provider review certification carrier ledgers are invalid',
    )
    invariant(
      baselineProviderCertifications.certifications.length
        === currentProviderCertifications.certifications.length,
      'Provider review certification carrier changed provider certification cardinality',
    )
    const changedRuntimeRecords = []
    for (let index = 0;
      index < currentProviderCertifications.certifications.length;
      index += 1) {
      const baseline = baselineProviderCertifications.certifications[index]
      const current = currentProviderCertifications.certifications[index]
      invariant(baseline?.id === current?.id,
        `Provider review certification carrier reordered runtime record:${index}`)
      if (stableStringify(baseline, 0) !== stableStringify(current, 0)) {
        changedRuntimeRecords.push(current)
      }
    }
    invariant(changedRuntimeRecords.length === 1,
      'Provider review certification carrier must change exactly one runtime record')
    const baselineCapabilityById = new Map(
      baselineReviewCapabilityCertifications.certifications
        .map(record => [record.id, record]),
    )
    const addedCapabilityRecords = []
    for (const current of currentReviewCapabilityCertifications.certifications) {
      const baseline = baselineCapabilityById.get(current.id)
      if (!baseline) addedCapabilityRecords.push(current)
      else invariant(
        stableStringify(baseline, 0) === stableStringify(current, 0),
        `Provider review certification carrier modified existing capability record:${current.id}`,
      )
    }
    invariant(
      addedCapabilityRecords.length === 1
        && currentReviewCapabilityCertifications.certifications.length
          === baselineReviewCapabilityCertifications.certifications.length + 1,
      'Provider review certification carrier must add exactly one capability record',
    )
    const capabilityRecord = addedCapabilityRecords[0]
    invariant(
      capabilityRecord.evidence?.reference
        === `${REVIEW_CAPABILITY_EVIDENCE_PREFIX}/${capabilityRecord.evidence?.sha256}.json`
        && SHA256.test(capabilityRecord.evidence?.sha256 ?? ''),
      'Provider review certification carrier capability evidence is not content-addressed',
    )
    const carrierHead = currentHeadIdentity(repoRoot,
      'Provider review certification carrier')
    const capabilityArtifact = readCurrentHeadEvidenceArtifact(
      repoRoot,
      capabilityRecord.evidence.reference,
      capabilityRecord.evidence.sha256,
      carrierHead,
    )
    const capabilityEvidence = parseCanonicalExternalOperatorArtifact(
      capabilityArtifact.bytes,
      'Provider review certification carrier capability evidence',
    )
    const runtimeRecord = changedRuntimeRecords[0]
    invariant(
      capabilityEvidence.runtimeBinding?.certificationId === runtimeRecord.id,
      'Provider review certification carrier capability/runtime record binding differs',
    )
    const runtimeReference = capabilityEvidence.runtimeBinding.evidenceReference
    const runtimeSha256 = capabilityEvidence.runtimeBinding.evidenceSha256
    const runtimeArtifact = readCurrentHeadEvidenceArtifact(
      repoRoot,
      runtimeReference,
      runtimeSha256,
      carrierHead,
    )
    const proposal = createProviderReviewCapabilityCertificationProposal({
      ...overrides,
      repoRoot,
      certifications: clone(baselineProviderCertifications),
      reviewCapabilityCertifications:
        clone(baselineReviewCapabilityCertifications),
      runtimeCertification: runtimeRecord,
      runtimeEvidenceArtifactBytes: runtimeArtifact.bytes,
      capabilityPrepared: {
        evidence: capabilityEvidence,
        evidenceBytes: capabilityArtifact.bytes,
        evidenceSha256: capabilityRecord.evidence.sha256,
        evidenceReference: capabilityRecord.evidence.reference,
        certification: capabilityRecord,
      },
      now,
    })
    invariant(
      stableStringify(proposal.ledgerAfters.providerCertifications, 0)
        === stableStringify(currentProviderCertifications, 0)
        && stableStringify(
          proposal.ledgerAfters.reviewCapabilityCertifications,
          0,
        ) === stableStringify(currentReviewCapabilityCertifications, 0),
      'Provider review certification carrier ledgers are not one exact atomic replay',
    )
    const finalHead = currentHeadIdentity(repoRoot,
      'Provider review certification carrier final readback')
    invariant(
      finalHead.commit === carrierHead.commit && finalHead.tree === carrierHead.tree,
      'Provider review certification carrier HEAD changed during after-image validation',
    )
    return {
      operation: 'provider-review-capability-certification',
      carrierCommit: carrierHead.commit,
      carrierTree: carrierHead.tree,
      requiredChangedPaths: clone(proposal.requiredChangedPaths),
      proposalDigest: proposal.proposalDigest,
    }
  })
}

function readCanonicalEvidenceArtifact(repoRoot, reference, artifactSha256) {
  invariant(reference === `${EXTERNAL_EVIDENCE_PREFIX}/${artifactSha256}.json` && SHA256.test(artifactSha256),
    'External surface artifact binding is invalid')
  const root = resolve(repoRoot)
  const directory = resolve(root, EXTERNAL_EVIDENCE_PREFIX)
  const read = readExternalOperatorArtifact(resolve(root, reference), {
    boundary: directory,
    label: 'Content-addressed external surface artifact',
  })
  invariant(sha256(read.bytes) === artifactSha256, 'External surface artifact content address is invalid')
  return read
}

function contentAddressedEvidenceArtifact(
  reference,
  artifactSha256,
  bytes,
  prefix,
  label,
) {
  invariant(Buffer.isBuffer(bytes)
    && bytes.length > 0
    && bytes.length <= MAX_ARTIFACT_BYTES
    && reference === `${prefix}/${artifactSha256}.json`
    && SHA256.test(artifactSha256)
    && sha256(bytes) === artifactSha256,
  `${label} identity is invalid`)
  parseCanonicalJson(bytes, label)
  return {
    path: reference,
    sha256: artifactSha256,
    canonicalBase64: bytes.toString('base64'),
  }
}

function certificationEvidenceArtifact(reference, artifactSha256, bytes) {
  return contentAddressedEvidenceArtifact(
    reference,
    artifactSha256,
    bytes,
    EXTERNAL_EVIDENCE_PREFIX,
    'External certification embedded evidence artifact',
  )
}

function providerRuntimeEvidenceArtifact(reference, artifactSha256, bytes) {
  return contentAddressedEvidenceArtifact(
    reference,
    artifactSha256,
    bytes,
    PROVIDER_RUNTIME_EVIDENCE_PREFIX,
    'Provider runtime embedded evidence artifact',
  )
}

function reviewCapabilityEvidenceArtifact(reference, artifactSha256, bytes) {
  return contentAddressedEvidenceArtifact(
    reference,
    artifactSha256,
    bytes,
    REVIEW_CAPABILITY_EVIDENCE_PREFIX,
    'Review capability embedded evidence artifact',
  )
}

function decodeCertificationEvidenceArtifact(
  value,
  reference,
  artifactSha256,
  prefix = EXTERNAL_EVIDENCE_PREFIX,
  label = 'External certification embedded evidence artifact',
) {
  exactKeys(value, ['path', 'sha256', 'canonicalBase64'], label)
  invariant(typeof value.canonicalBase64 === 'string'
    && value.canonicalBase64.length > 0
    && value.canonicalBase64.length <= Math.ceil(MAX_ARTIFACT_BYTES / 3) * 4
    && /^[A-Za-z0-9+/]+={0,2}$/.test(value.canonicalBase64),
  `${label} encoding is invalid or oversized`)
  const bytes = Buffer.from(value.canonicalBase64, 'base64')
  invariant(bytes.toString('base64') === value.canonicalBase64,
    `${label} base64 is not canonical`)
  const expected = contentAddressedEvidenceArtifact(
    reference,
    artifactSha256,
    bytes,
    prefix,
    label,
  )
  invariant(stableStringify(value, 0) === stableStringify(expected, 0),
    `${label} is detached or non-canonical`)
  return bytes
}

function providerCertificationStaticProjection(certification) {
  return {
    id: certification.id,
    provider: certification.provider,
    runtimeKind: certification.runtimeKind,
    providerVersion: certification.providerVersion,
    adapterVersion: certification.adapterVersion,
    surface: certification.surface,
    repositoryRole: certification.repositoryRole,
    platformMatrix: certification.platformMatrix.map(target => ({
      id: target.id,
      operatingSystem: target.operatingSystem,
      platform: target.platform,
      arch: target.arch,
      executionEnvironment: target.executionEnvironment,
      distributionVersion: target.distributionVersion,
      pathClass: target.pathClass,
      certificationClass: target.status === 'unsupported' ? 'unsupported' : 'certifiable',
      ...(target.status === 'unsupported' ? { limitations: clone(target.limitations) } : {}),
    })),
  }
}

function providerRuntimeCertificationTransition(
  models,
  runtimeCertification,
  capabilityEvidence,
  now,
  suppliedRuntimeEvidenceBytes = null,
) {
  invariant(runtimeCertification && typeof runtimeCertification === 'object' && !Array.isArray(runtimeCertification),
    'Provider review certification runtime record is missing')
  const baselineMatches = models.certifications.certifications
    .map((record, index) => ({ record, index }))
    .filter(item => item.record.id === runtimeCertification.id)
  invariant(baselineMatches.length === 1,
    `Provider review certification runtime record is not a unique canonical tuple:${String(runtimeCertification.id)}`)
  const { record: baseline, index } = baselineMatches[0]
  invariant(
    stableStringify(providerCertificationStaticProjection(runtimeCertification), 0)
      === stableStringify(providerCertificationStaticProjection(baseline), 0),
    `Provider review certification changed immutable runtime tuple semantics:${runtimeCertification.id}`,
  )
  const runtimeBinding = capabilityEvidence?.runtimeBinding
  invariant(runtimeBinding?.certificationId === runtimeCertification.id,
    'Review capability evidence binds another runtime certification record')
  const matchingTargets = runtimeCertification.platformMatrix.filter(target => (
    target.id === runtimeBinding.target?.id
      && target.status === 'certified'
      && (target.runtimeEvidence ?? runtimeCertification.runtimeEvidence)?.reference
        === runtimeBinding.evidenceReference
  ))
  invariant(matchingTargets.length === 1,
    `Provider review certification lacks one exact certified runtime target:${runtimeCertification.id}`)
  const target = matchingTargets[0]
  const binding = target.runtimeEvidence ?? runtimeCertification.runtimeEvidence
  invariant(
    typeof binding?.reference === 'string'
      && binding.reference.startsWith(`${PROVIDER_RUNTIME_EVIDENCE_PREFIX}/`)
      && SHA256.test(binding.artifactSha256 ?? '')
      && binding.reference === `${PROVIDER_RUNTIME_EVIDENCE_PREFIX}/${binding.artifactSha256}.json`,
    'Provider review certification runtime evidence is not content-addressed',
  )
  invariant(
    runtimeBinding.evidenceReference === binding.reference
      && runtimeBinding.evidenceSha256 === binding.artifactSha256
      && runtimeBinding.targetDigest === binding.targetDigest,
    'Review capability evidence/runtime certification content binding differs',
  )
  const runtimeArtifact = suppliedRuntimeEvidenceBytes === null
    ? readCanonicalEvidenceArtifact(
        models.repoRoot,
        binding.reference,
        binding.artifactSha256,
      )
    : { bytes: Buffer.from(suppliedRuntimeEvidenceBytes) }
  invariant(
    runtimeArtifact.bytes.length > 0
      && runtimeArtifact.bytes.length <= MAX_ARTIFACT_BYTES
      && sha256(runtimeArtifact.bytes) === binding.artifactSha256,
    'Provider runtime certification supplied evidence bytes/content address are invalid',
  )
  const runtimeEvidence = parseCanonicalExternalOperatorArtifact(
    runtimeArtifact.bytes,
    'Provider runtime certification evidence',
  )
  invariant(
    Buffer.from(`${stableStringify(runtimeEvidence)}\n`, 'utf8').equals(runtimeArtifact.bytes),
    'Provider runtime certification evidence bytes are not canonical',
  )
  invariant(
    runtimeEvidence.subject?.gitHead === binding.gitCommit
      && runtimeEvidence.subject?.gitTree === binding.gitTree,
    'Provider runtime certification evidence subject binding differs',
  )
  const repository = resolveCertificationCanary(models.inventory, runtimeCertification.repositoryRole)
  const carrierPolicy = certificationCarrierPolicyForRole(
    models.roleSurfacePolicy,
    runtimeCertification.repositoryRole,
  )
  const repositoryIdentity = resolveLocalRepositoryIdentity({
    repoRoot: models.repoRoot,
    repository,
    subjectCommits: [binding.gitCommit],
    carrierPolicy,
  })
  validateCertificationRuntimeEvidence(runtimeCertification, {
    repoRoot: models.repoRoot,
    identity: runtimeIdentityFor(models),
    matrix: models.matrix,
    runtimeProfile: models.runtimeProfile,
    issuerRegistry: models.issuerRegistry,
    repositoryTarget: repository,
    repositoryIdentity,
    carrierPolicy,
    desiredGithub: models.desired,
    now,
    targetId: target.id,
    runtimeEvidenceBytes: runtimeArtifact.bytes,
  })
  const ledgerAfter = clone(models.certifications)
  ledgerAfter.certifications[index] = clone(runtimeCertification)
  return {
    ledgerAfter,
    runtimeArtifact,
    runtimeEvidence,
    target,
    binding,
  }
}

function normalizePreparedCapabilityCertification(models, supplied, runtimeLedgerAfter, runtimeEvidenceBytes, now) {
  invariant(supplied && typeof supplied === 'object' && !Array.isArray(supplied),
    'Prepared review capability certification is missing')
  const evidenceBytes = Buffer.from(supplied.evidenceBytes ?? [])
  invariant(evidenceBytes.length > 0 && evidenceBytes.length <= MAX_ARTIFACT_BYTES,
    'Prepared review capability evidence bytes are missing or oversized')
  const evidence = parseCanonicalExternalOperatorArtifact(
    evidenceBytes,
    'Prepared review capability evidence',
  )
  invariant(
    Buffer.from(`${stableStringify(evidence)}\n`, 'utf8').equals(evidenceBytes),
    'Prepared review capability evidence bytes are not canonical',
  )
  const expected = prepareReviewCapabilityCertification({
    registry: models.providerRegistry,
    capabilityRegistry: models.reviewCapabilityRegistry,
    invocationRegistry: models.modelInvocationProfiles,
    modelReleaseRegistry: models.modelReleaseRegistry,
    runtimeCertificationLedger: runtimeLedgerAfter,
    reviewProfileId: evidence.reviewProfileId,
    certificationId: evidence.certificationId,
    capability: evidence.capability,
    target: evidence.runtimeBinding?.target,
    expectedGitTree: evidence.runtimeBinding?.target
      ? JSON.parse(Buffer.from(runtimeEvidenceBytes).toString('utf8')).subject?.gitTree
      : null,
    runtimeEvidenceBytes,
    certifiedAt: evidence.certifiedAt,
    expiresAt: evidence.expiresAt,
    now,
  })
  invariant(
    expected.evidenceBytes.equals(evidenceBytes)
      && expected.evidenceSha256 === supplied.evidenceSha256
      && expected.evidenceReference === supplied.evidenceReference
      && stableStringify(expected.certification, 0)
        === stableStringify(supplied.certification, 0),
    'Prepared review capability certification is stale, substituted, or non-canonical',
  )
  return expected
}

export function createProviderReviewCapabilityCertificationProposal({
  runtimeCertification,
  runtimeEvidenceArtifactBytes = null,
  capabilityPrepared,
  now = new Date(),
  ...overrides
} = {}) {
  return guarded('PROVIDER_REVIEW_CERTIFICATION_PROPOSAL_BLOCKED', () => {
    invariant(now instanceof Date && Number.isFinite(now.getTime()),
      'Provider review certification proposal time is invalid')
    const models = currentModels(overrides)
    const suppliedCapabilityEvidence = parseCanonicalExternalOperatorArtifact(
      Buffer.from(capabilityPrepared?.evidenceBytes ?? []),
      'Provider review capability evidence',
    )
    const runtime = providerRuntimeCertificationTransition(
      models,
      runtimeCertification,
      suppliedCapabilityEvidence,
      now,
      runtimeEvidenceArtifactBytes,
    )
    const capability = normalizePreparedCapabilityCertification(
      models,
      capabilityPrepared,
      runtime.ledgerAfter,
      runtime.runtimeArtifact.bytes,
      now,
    )
    const capabilityLedgerAfter = materializeReviewCapabilityCertification({
      capabilityCertificationLedger: models.reviewCapabilityCertifications,
      prepared: capability,
    })
    const runtimeArtifact = providerRuntimeEvidenceArtifact(
      runtime.binding.reference,
      runtime.binding.artifactSha256,
      runtime.runtimeArtifact.bytes,
    )
    const capabilityArtifact = reviewCapabilityEvidenceArtifact(
      capability.evidenceReference,
      capability.evidenceSha256,
      capability.evidenceBytes,
    )
    invariant(
      capability.evidenceReference
        === `${REVIEW_CAPABILITY_EVIDENCE_PREFIX}/${capability.evidenceSha256}.json`,
      'Provider review capability evidence reference is not canonical',
    )
    const ledgers = [
      {
        path: CANONICAL_CERTIFICATION_LEDGER_PATH,
        beforeSha256: digestValue(models.certifications),
        afterSha256: digestValue(runtime.ledgerAfter),
      },
      {
        path: CANONICAL_REVIEW_CAPABILITY_LEDGER_PATH,
        beforeSha256: digestValue(models.reviewCapabilityCertifications),
        afterSha256: digestValue(capabilityLedgerAfter),
      },
    ]
    const requiredChangedPaths = [
      runtimeArtifact.path,
      CANONICAL_CERTIFICATION_LEDGER_PATH,
      capabilityArtifact.path,
      CANONICAL_REVIEW_CAPABILITY_LEDGER_PATH,
    ]
    invariant(new Set(requiredChangedPaths).size === 4,
      'Provider review certification four-path closure contains duplicates')
    const core = {
      $schema: PROVIDER_REVIEW_CERTIFICATION_PROPOSAL_SCHEMA,
      schemaVersion: 1,
      kind: 'provider-review-capability-certification-review-proposal',
      applicationMode: 'local-candidate-preparation-only',
      authorizationStatus: 'signed-runtime-and-capability-transition-verified',
      externalMutationAuthorized: false,
      ledgers,
      models: reviewCertificationModelDigests(models),
      runtime: {
        certificationId: runtimeCertification.id,
        targetId: runtime.target.id,
        recordSha256: digestValue(runtimeCertification),
        evidenceDigest: runtime.runtimeEvidence.evidenceDigest,
        validUntil: runtime.runtimeEvidence.run.validUntil,
      },
      reviewCapability: {
        certificationId: capability.certification.id,
        reviewProfileId: capability.certification.reviewProfileId,
        recordSha256: digestValue(capability.certification),
        evidenceDigest: capability.evidence.evidenceDigest,
        expiresAt: capability.certification.expiresAt,
        runtimeCertificationId: runtimeCertification.id,
        runtimeCertificationSha256: digestValue(runtimeCertification),
      },
      evidenceArtifacts: [runtimeArtifact, capabilityArtifact],
      requiredChangedPaths,
      ledgerAfters: {
        providerCertifications: runtime.ledgerAfter,
        reviewCapabilityCertifications: capabilityLedgerAfter,
      },
    }
    return { ...core, proposalDigest: digestValue(core) }
  })
}

export function validateProviderReviewCapabilityCertificationProposal(proposal, {
  now = new Date(),
  ...overrides
} = {}) {
  return guarded('PROVIDER_REVIEW_CERTIFICATION_PROPOSAL_INVALID', () => {
    exactKeys(proposal, [
      '$schema', 'schemaVersion', 'kind', 'applicationMode', 'authorizationStatus',
      'externalMutationAuthorized', 'ledgers', 'models', 'runtime',
      'reviewCapability', 'evidenceArtifacts', 'requiredChangedPaths',
      'ledgerAfters', 'proposalDigest',
    ], 'Provider review certification proposal')
    invariant(
      proposal.$schema === PROVIDER_REVIEW_CERTIFICATION_PROPOSAL_SCHEMA
        && proposal.schemaVersion === 1
        && proposal.kind === 'provider-review-capability-certification-review-proposal'
        && proposal.applicationMode === 'local-candidate-preparation-only'
        && proposal.authorizationStatus === 'signed-runtime-and-capability-transition-verified'
        && proposal.externalMutationAuthorized === false,
      'Provider review certification proposal identity is invalid',
    )
    invariant(Array.isArray(proposal.ledgers) && proposal.ledgers.length === 2,
      'Provider review certification proposal ledger closure is invalid')
    const models = currentModels(overrides)
    validateReviewCertificationModelDigests(proposal.models, models)
    const runtimeArtifactRecord = proposal.evidenceArtifacts?.[0]
    const capabilityArtifactRecord = proposal.evidenceArtifacts?.[1]
    const runtimeBytes = decodeCertificationEvidenceArtifact(
      runtimeArtifactRecord,
      runtimeArtifactRecord?.path,
      runtimeArtifactRecord?.sha256,
      PROVIDER_RUNTIME_EVIDENCE_PREFIX,
      'Provider runtime embedded evidence artifact',
    )
    const capabilityBytes = decodeCertificationEvidenceArtifact(
      capabilityArtifactRecord,
      capabilityArtifactRecord?.path,
      capabilityArtifactRecord?.sha256,
      REVIEW_CAPABILITY_EVIDENCE_PREFIX,
      'Review capability embedded evidence artifact',
    )
    const runtimeCertification = proposal.ledgerAfters?.providerCertifications
      ?.certifications?.find(record => record.id === proposal.runtime?.certificationId)
    const capabilityEvidence = parseCanonicalExternalOperatorArtifact(
      capabilityBytes,
      'Provider review capability evidence',
    )
    const expected = createProviderReviewCapabilityCertificationProposal({
      ...overrides,
      runtimeCertification,
      runtimeEvidenceArtifactBytes: runtimeBytes,
      capabilityPrepared: {
        evidence: capabilityEvidence,
        evidenceBytes: capabilityBytes,
        evidenceSha256: capabilityArtifactRecord.sha256,
        evidenceReference: capabilityArtifactRecord.path,
        certification: proposal.ledgerAfters?.reviewCapabilityCertifications
          ?.certifications?.find(record => record.id === proposal.reviewCapability?.certificationId),
      },
      now,
    })
    invariant(runtimeBytes.equals(Buffer.from(expected.evidenceArtifacts[0].canonicalBase64, 'base64')),
      'Provider review runtime evidence artifact is substituted')
    invariant(
      stableStringify(proposal, 0) === stableStringify(expected, 0),
      'Provider review certification proposal is stale, substituted, or non-canonical',
    )
    return expected
  })
}

export function createExternalCertificationProposal({
  reference,
  artifactSha256,
  evidenceArtifactBytes = null,
  certifiedAt,
  expiresAt,
  now = new Date(),
  ...overrides
} = {}) {
  return guarded('EXTERNAL_CERTIFICATION_PROPOSAL_BLOCKED', () => {
    invariant(now instanceof Date && Number.isFinite(now.getTime()), 'External certification proposal time is invalid')
    const models = currentModels(overrides)
    const artifact = evidenceArtifactBytes === null
      ? readCanonicalEvidenceArtifact(models.repoRoot, reference, artifactSha256)
      : { bytes: Buffer.from(evidenceArtifactBytes) }
    const embeddedArtifact = certificationEvidenceArtifact(reference, artifactSha256, artifact.bytes)
    const inspected = inspectExternalSurfaceReceipt(artifact.bytes, {
      runtimeProfile: models.runtimeProfile,
      issuerRegistry: models.issuerRegistry,
      now,
    })
    const candidate = candidateCertification(models, inspected.evidence, reference, artifactSha256, {
      certifiedAt,
      expiresAt,
      now,
    })
    validateCandidateCertification(candidate, models, inspected.evidence, now)
    const ledgerAfter = clone(models.certifications)
    const index = ledgerAfter.certifications.findIndex(item => item.id === candidate.certification.id)
    invariant(index >= 0, `Certification ledger entry disappeared: ${candidate.certification.id}`)
    ledgerAfter.certifications[index] = candidate.certification
    const core = {
      $schema: CERTIFICATION_PROPOSAL_SCHEMA,
      schemaVersion: 1,
      kind: 'external-runtime-certification-review-proposal',
      applicationMode: 'local-candidate-preparation-only',
      authorizationStatus: 'external-runtime-attestation-verified',
      externalMutationAuthorized: false,
      ledger: {
        path: CANONICAL_CERTIFICATION_LEDGER_PATH,
        beforeSha256: digestValue(models.certifications),
        afterSha256: digestValue(ledgerAfter),
      },
      models: {
        inventorySha256: digestValue(models.inventory),
        desiredSha256: digestValue(models.desired),
        compatibilityMatrixSha256: digestValue(models.matrix),
        runtimeProfileSha256: digestValue(models.runtimeProfile),
        roleSurfacePolicySha256: digestValue(models.roleSurfacePolicy),
        issuerRegistrySha256: digestValue(models.issuerRegistry),
      },
      evidence: {
        reference,
        artifactSha256,
        evidenceDigest: inspected.evidence.evidenceDigest,
        profileId: inspected.evidence.profile.id,
        runId: inspected.evidence.run.runId,
        targetId: inspected.evidence.run.targetId,
        validUntil: inspected.evidence.run.validUntil,
      },
      evidenceArtifact: embeddedArtifact,
      certification: {
        id: candidate.certification.id,
        targetId: candidate.target.id,
        certifiedAt,
        expiresAt,
        recordSha256: digestValue(candidate.certification),
      },
      requiredChangedPaths: [reference, CANONICAL_CERTIFICATION_LEDGER_PATH],
      ledgerAfter,
    }
    return { ...core, proposalDigest: digestValue(core) }
  })
}

export function validateExternalCertificationProposal(proposal, {
  now = new Date(),
  ...overrides
} = {}) {
  return guarded('EXTERNAL_CERTIFICATION_PROPOSAL_INVALID', () => {
    exactKeys(proposal, [
      '$schema', 'schemaVersion', 'kind', 'applicationMode', 'authorizationStatus',
      'externalMutationAuthorized', 'ledger', 'models', 'evidence', 'certification',
      'evidenceArtifact', 'requiredChangedPaths', 'ledgerAfter', 'proposalDigest',
    ], 'External certification proposal')
    invariant(proposal.$schema === CERTIFICATION_PROPOSAL_SCHEMA
      && proposal.schemaVersion === 1
      && proposal.kind === 'external-runtime-certification-review-proposal'
      && proposal.applicationMode === 'local-candidate-preparation-only'
      && proposal.authorizationStatus === 'external-runtime-attestation-verified'
      && proposal.externalMutationAuthorized === false,
    'External certification proposal identity is invalid')
    exactKeys(proposal.ledger, ['path', 'beforeSha256', 'afterSha256'], 'External certification proposal ledger binding')
    invariant(proposal.ledger.path === CANONICAL_CERTIFICATION_LEDGER_PATH
      && SHA256.test(proposal.ledger.beforeSha256)
      && SHA256.test(proposal.ledger.afterSha256), 'External certification proposal ledger binding is invalid')
    validateBaselineDigests(proposal.models, currentModels(overrides))
    exactKeys(proposal.evidence, ['reference', 'artifactSha256', 'evidenceDigest', 'profileId', 'runId', 'targetId', 'validUntil'], 'External certification proposal evidence binding')
    exactKeys(proposal.certification, ['id', 'targetId', 'certifiedAt', 'expiresAt', 'recordSha256'], 'External certification proposal record binding')
    const evidenceArtifactBytes = decodeCertificationEvidenceArtifact(
      proposal.evidenceArtifact,
      proposal.evidence.reference,
      proposal.evidence.artifactSha256,
    )
    invariant(Array.isArray(proposal.requiredChangedPaths)
      && proposal.requiredChangedPaths.length === 2
      && proposal.requiredChangedPaths[0] === proposal.evidence.reference
      && proposal.requiredChangedPaths[1] === CANONICAL_CERTIFICATION_LEDGER_PATH,
    'External certification proposal changed-path closure is invalid')
    invariant(proposal.proposalDigest === proposalDigest(proposal), 'External certification proposal digest is invalid')
    const models = currentModels(overrides)
    invariant(proposal.ledger.beforeSha256 === digestValue(models.certifications), 'External certification ledger changed after proposal review')
    const expected = createExternalCertificationProposal({
      ...overrides,
      reference: proposal.evidence.reference,
      artifactSha256: proposal.evidence.artifactSha256,
      evidenceArtifactBytes,
      certifiedAt: proposal.certification.certifiedAt,
      expiresAt: proposal.certification.expiresAt,
      now,
    })
    invariant(stableStringify(proposal, 0) === stableStringify(expected, 0), 'External certification proposal is stale, substituted, or non-canonical')
    return expected
  })
}

export function createReviewedExternalCertificationHandoff({
  reviewedProposal,
  expectedProposalDigest,
  expectedBaseCommit,
  currentBaseCommit,
  expectedBaseTree,
  currentBaseTree,
  baseLedgerSha256,
  now = new Date(),
  ...overrides
} = {}) {
  return guarded('EXTERNAL_CERTIFICATION_HANDOFF_BLOCKED', () => {
    const preparedAt = validClockValue(now, 'External certification handoff preparation time')
    invariant(expectedProposalDigest === reviewedProposal?.proposalDigest && SHA256.test(expectedProposalDigest ?? ''),
      'Reviewed certification proposal digest acknowledgement does not match')
    const models = currentModels(overrides)
    const proposal = validateExternalCertificationProposal(reviewedProposal, {
      ...overrides,
      now: preparedAt,
    })
    const validUntil = [
      canonicalUtc(proposal.evidence.validUntil, 'External certification evidence validUntil'),
      canonicalUtc(proposal.certification.expiresAt, 'External certification expiresAt'),
    ].sort((left, right) => left - right)[0].toISOString()
    const core = transactionHandoffCore({
      operation: 'external-runtime-certification',
      models,
      reviewedProposal: proposal,
      signingRequest: null,
      expectedBaseCommit,
      currentBaseCommit,
      expectedBaseTree,
      currentBaseTree,
      baseLedgerSha256,
      preparedAt,
      validUntil,
    })
    return { ...core, handoffDigest: digestValue(core) }
  })
}

function validateProviderReviewBaseLedgers(baseLedgerSha256s, ledgers) {
  exactKeys(
    baseLedgerSha256s,
    [CANONICAL_CERTIFICATION_LEDGER_PATH, CANONICAL_REVIEW_CAPABILITY_LEDGER_PATH],
    'Provider review certification protected-base ledgers',
  )
  invariant(Array.isArray(ledgers) && ledgers.length === 2,
    'Provider review certification reviewed ledgers are incomplete')
  for (const ledger of ledgers) {
    invariant(
      SHA256.test(baseLedgerSha256s[ledger.path] ?? '')
        && baseLedgerSha256s[ledger.path] === ledger.beforeSha256,
      `Provider review certification protected-base ledger differs:${String(ledger.path)}`,
    )
  }
}

export function createReviewedProviderReviewCapabilityCertificationHandoff({
  reviewedProposal,
  expectedProposalDigest,
  expectedBaseCommit,
  currentBaseCommit,
  expectedBaseTree,
  currentBaseTree,
  baseLedgerSha256s,
  now = new Date(),
  ...overrides
} = {}) {
  return guarded('PROVIDER_REVIEW_CERTIFICATION_HANDOFF_BLOCKED', () => {
    const preparedAt = validClockValue(now, 'Provider review certification handoff preparation time')
    invariant(
      expectedProposalDigest === reviewedProposal?.proposalDigest
        && SHA256.test(expectedProposalDigest ?? ''),
      'Reviewed provider review certification proposal digest acknowledgement does not match',
    )
    const proposal = validateProviderReviewCapabilityCertificationProposal(reviewedProposal, {
      ...overrides,
      now: preparedAt,
    })
    validateGitTransactionInputs({
      expectedBaseCommit,
      currentBaseCommit,
      expectedBaseTree,
      currentBaseTree,
      baseLedgerSha256: proposal.ledgers[0].beforeSha256,
      ledgerBeforeSha256: proposal.ledgers[0].beforeSha256,
    })
    validateProviderReviewBaseLedgers(baseLedgerSha256s, proposal.ledgers)
    const validUntil = [
      canonicalUtc(proposal.runtime.validUntil, 'Provider runtime evidence validUntil'),
      canonicalUtc(proposal.reviewCapability.expiresAt, 'Review capability certification expiresAt'),
    ].sort((left, right) => left - right)[0].toISOString()
    assertRemainingHandoffValidity(validUntil, preparedAt, 'Provider review certification handoff')
    const repository = authorityRepository(currentModels(overrides))
    const core = {
      $schema: TRANSACTION_HANDOFF_SCHEMA,
      schemaVersion: 2,
      kind: 'external-ledger-transaction-handoff',
      operation: 'provider-review-capability-certification',
      applicationMode: 'protected-git-expected-base-pr-transaction-only',
      canonicalLedgerMutationPerformed: false,
      externalMutationAuthorized: false,
      preparedAt: preparedAt.toISOString(),
      validUntil,
      minimumRemainingValiditySeconds: EXTERNAL_HANDOFF_MINIMUM_VALIDITY_SECONDS,
      repository,
      gitTransaction: {
        expectedBaseCommit,
        expectedBaseTree,
        expectedBaseRef: `refs/heads/${repository.defaultBranch}`,
        expectedBaseLedgers: proposal.ledgers.map(ledger => ({
          path: ledger.path,
          semanticSha256: ledger.beforeSha256,
        })),
        liveProtectedBaseVerificationRequired: true,
        requiredReviewFlow: 'protected-pull-request',
        requiredPromotionPrimitive: 'atomic-expected-old-git-ref-cas',
        directCanonicalWriteAllowed: false,
      },
      reviewedProposalDigest: proposal.proposalDigest,
      signingRequest: null,
      reviewedProposal: clone(proposal),
      ledgers: clone(proposal.ledgers),
      requiredChangedPaths: [...proposal.requiredChangedPaths],
      evidenceArtifacts: clone(proposal.evidenceArtifacts),
      ledgerAfters: clone(proposal.ledgerAfters),
    }
    return { ...core, handoffDigest: digestValue(core) }
  })
}

export function applyReviewedExternalCertificationProposal() {
  return block(
    'EXTERNAL_DIRECT_CANONICAL_LEDGER_APPLY_DEPRECATED',
    'Direct certification ledger apply is disabled; create a protected Git expected-base transaction handoff instead',
  )
}

function eligibleActivationSigners(models, observedAt, expiresAt, now) {
  validateAttestationPolicy(models.rings.attestationPolicy, {
    issuerRegistry: models.issuerRegistry,
    now,
    allowUnactivated: false,
  })
  const issued = canonicalUtc(observedAt, 'External activation observedAt')
  const expires = canonicalUtc(expiresAt, 'External activation expiresAt')
  invariant(
    issued.getTime() <= now.getTime() + models.rings.attestationPolicy.clockSkewSeconds * 1000,
    'External activation observation is in the future',
  )
  invariant(expires > issued && expires > now, 'External activation signing window is invalid or expired')
  invariant(expires.getTime() - issued.getTime() <= models.rings.attestationPolicy.maxCompletionTtlMinutes * 60_000,
    'External activation signing window exceeds the completion-attestation TTL')
  const eligible = []
  for (const keyId of models.rings.attestationPolicy.allowedKeyIds) {
    try {
      const issuer = resolvePolicyIssuer(models.rings.attestationPolicy, models.issuerRegistry, keyId, {
        role: 'completion-attestor',
        at: issued,
        validThrough: expires,
      })
      resolvePolicyIssuer(models.rings.attestationPolicy, models.issuerRegistry, keyId, {
        role: 'completion-attestor',
        at: now,
        validThrough: now,
      })
      eligible.push({ signerKeyId: issuer.keyId, subject: issuer.subject })
    } catch {
      // The final validator reports malformed trust. This projection only lists
      // keys that can sign this exact requested window.
    }
  }
  invariant(new Set(eligible.map(item => item.subject)).size >= models.rings.attestationPolicy.completionAttestationQuorum,
    `External activation lacks ${models.rings.attestationPolicy.completionAttestationQuorum} eligible completion-attestor subjects`)
  return eligible.sort((left, right) => compareUtf8Bytes(left.signerKeyId, right.signerKeyId))
}

export function createExternalActivationSigningRequest({
  requirementId,
  observedResource,
  observedAt,
  expiresAt,
  now = new Date(),
  ...overrides
} = {}) {
  return guarded('EXTERNAL_ACTIVATION_SIGNING_REQUEST_BLOCKED', () => {
    const models = currentModels(overrides)
    invariant(externalActivationPolicyDigest(models.activationPolicy) === EXTERNAL_ACTIVATION_POLICY_DIGEST,
      'External activation policy differs from the immutable reviewed catalog')
    const matches = models.activationLedger.requirements.filter(requirement => requirement.id === requirementId)
    invariant(matches.length === 1, `External activation requirement is not unique: ${requirementId}`)
    invariant(matches[0].status === 'not-activated', `External activation requirement is already active: ${requirementId}`)
    const eligibleSigners = eligibleActivationSigners(models, observedAt, expiresAt, now)
    const requirement = clone(matches[0])
    requirement.status = 'activated'
    requirement.observedAt = observedAt
    requirement.expiresAt = expiresAt
    requirement.evidence = createExternalActivationEvidence(requirement, {
      policyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
      issuerRegistryDigest: issuerRegistryDigest(models.issuerRegistry),
      observedResource,
    })
    const payload = externalActivationPayload(requirement)
    const requirementBytes = canonicalBytes(requirement)
    invariant(payload.length > 0 && payload.length <= MAX_ARTIFACT_BYTES, 'External activation signing payload is missing or oversized')
    const core = {
      $schema: ACTIVATION_SIGNING_REQUEST_SCHEMA,
      schemaVersion: 1,
      kind: 'external-activation-signing-request',
      readOnly: true,
      externalMutationAuthorized: false,
      algorithm: 'ed25519',
      signatureDomain: ACTIVATION_SIGNATURE_DOMAIN,
      requiredRole: 'completion-attestor',
      requiredQuorum: models.rings.attestationPolicy.completionAttestationQuorum,
      ledger: {
        path: CANONICAL_ACTIVATION_LEDGER_PATH,
        beforeSha256: digestValue(models.activationLedger),
      },
      models: {
        inventorySha256: digestValue(models.inventory),
        desiredSha256: digestValue(models.desired),
        compatibilityMatrixSha256: digestValue(models.matrix),
        runtimeProfileSha256: digestValue(models.runtimeProfile),
        roleSurfacePolicySha256: digestValue(models.roleSurfacePolicy),
        releaseRingsSha256: digestValue(models.rings),
        issuerRegistrySha256: digestValue(models.issuerRegistry),
        activationPolicySha256: digestValue(models.activationPolicy),
        mutationBoundaryContractSha256: digestValue(models.mutationBoundaryContract),
      },
      requirementId,
      eligibleSigners,
      requirementCanonicalBase64: requirementBytes.toString('base64'),
      requirementSha256: sha256(requirementBytes),
      signingPayloadBase64: payload.toString('base64'),
      signingPayloadSha256: sha256(payload),
    }
    return { ...core, requestDigest: digestValue(core) }
  })
}

function signingRequestRequirement(request) {
  invariant(typeof request.requirementCanonicalBase64 === 'string'
    && request.requirementCanonicalBase64.length <= Math.ceil(MAX_ARTIFACT_BYTES / 3) * 4
    && /^[A-Za-z0-9+/]+={0,2}$/.test(request.requirementCanonicalBase64),
  'External activation unsigned requirement encoding is invalid or oversized')
  const bytes = Buffer.from(request.requirementCanonicalBase64, 'base64')
  invariant(bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES
    && bytes.toString('base64') === request.requirementCanonicalBase64,
  'External activation unsigned requirement bytes are not canonical bounded base64')
  invariant(SHA256.test(request.requirementSha256 ?? '') && sha256(bytes) === request.requirementSha256,
    'External activation unsigned requirement digest is invalid')
  return parseCanonicalJson(bytes, 'External activation unsigned requirement')
}

export function validateExternalActivationSigningRequest(request, {
  now = new Date(),
  ...overrides
} = {}) {
  return guarded('EXTERNAL_ACTIVATION_SIGNING_REQUEST_INVALID', () => {
    exactKeys(request, [
      '$schema', 'schemaVersion', 'kind', 'readOnly', 'externalMutationAuthorized',
      'algorithm', 'signatureDomain', 'requiredRole', 'requiredQuorum', 'ledger',
      'models', 'requirementId', 'eligibleSigners', 'requirementCanonicalBase64',
      'requirementSha256',
      'signingPayloadBase64', 'signingPayloadSha256', 'requestDigest',
    ], 'External activation signing request')
    invariant(request.$schema === ACTIVATION_SIGNING_REQUEST_SCHEMA
      && request.schemaVersion === 1
      && request.kind === 'external-activation-signing-request'
      && request.readOnly === true
      && request.externalMutationAuthorized === false
      && request.algorithm === 'ed25519'
      && request.signatureDomain === ACTIVATION_SIGNATURE_DOMAIN
      && request.requiredRole === 'completion-attestor',
    'External activation signing request identity is invalid')
    exactKeys(request.ledger, ['path', 'beforeSha256'], 'External activation signing request ledger binding')
    invariant(request.ledger.path === CANONICAL_ACTIVATION_LEDGER_PATH && SHA256.test(request.ledger.beforeSha256),
      'External activation signing request ledger binding is invalid')
    const models = currentModels(overrides)
    validateBaselineDigests(request.models, models, { includeActivation: true })
    invariant(request.ledger.beforeSha256 === digestValue(models.activationLedger), 'External activation ledger changed after signing request creation')
    invariant(request.requestDigest === requestDigest(request), 'External activation signing request digest is invalid')
    invariant(typeof request.signingPayloadBase64 === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(request.signingPayloadBase64),
      'External activation signing payload encoding is invalid')
    const requirement = signingRequestRequirement(request)
    const payload = externalActivationPayload(requirement)
    invariant(payload.toString('base64') === request.signingPayloadBase64
      && request.signingPayloadSha256 === sha256(payload), 'External activation signing payload is stale')
    const expected = createExternalActivationSigningRequest({
      ...overrides,
      requirementId: request.requirementId,
      observedResource: requirement.evidence.payload.observedResource,
      observedAt: requirement.observedAt,
      expiresAt: requirement.expiresAt,
      now,
    })
    invariant(stableStringify(request, 0) === stableStringify(expected, 0), 'External activation signing request is stale, substituted, or non-canonical')
    return expected
  })
}

function applySignatures(requirement, signatures, requiredQuorum) {
  invariant(Array.isArray(signatures) && signatures.length === requiredQuorum,
    `External activation proposal requires exactly ${requiredQuorum} external signatures`)
  const normalized = signatures.map((item, index) => {
    exactKeys(item, ['signerKeyId', 'subject', 'signature'], `External activation signature[${index}]`)
    invariant(typeof item.signerKeyId === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(item.signerKeyId),
      `External activation signature[${index}] signer key is invalid`)
    invariant(typeof item.subject === 'string' && item.subject.length > 0 && item.subject.length <= 512,
      `External activation signature[${index}] subject is invalid`)
    invariant(typeof item.signature === 'string' && /^[A-Za-z0-9_-]{86}$/.test(item.signature),
      `External activation signature[${index}] is not canonical Ed25519 base64url`)
    return clone(item)
  }).sort((left, right) => compareUtf8Bytes(left.signerKeyId, right.signerKeyId))
  invariant(new Set(normalized.map(item => item.signerKeyId)).size === normalized.length,
    'External activation signer key IDs must be distinct')
  invariant(new Set(normalized.map(item => item.subject)).size === normalized.length,
    'External activation signer subjects must be distinct')
  const signed = clone(requirement)
  signed.evidence.signerKeyId = normalized[0].signerKeyId
  signed.evidence.subject = normalized[0].subject
  signed.evidence.signature = normalized[0].signature
  signed.evidence.coSignatures = normalized.slice(1)
  return signed
}

export function validateExternalActivationSignatureBundle(bundle, signingRequest) {
  return guarded('EXTERNAL_ACTIVATION_SIGNATURE_BUNDLE_INVALID', () => {
    exactKeys(bundle, ['$schema', 'schemaVersion', 'kind', 'requestDigest', 'signatures'], 'External activation signature bundle')
    invariant(bundle.$schema === SIGNATURE_BUNDLE_SCHEMA
      && bundle.schemaVersion === 1
      && bundle.kind === 'external-activation-signature-bundle',
    'External activation signature bundle identity is invalid')
    invariant(bundle.requestDigest === signingRequest?.requestDigest && SHA256.test(bundle.requestDigest ?? ''),
      'External activation signature bundle is detached from its signing request')
    const signed = applySignatures(signingRequestRequirement(signingRequest), bundle.signatures, signingRequest.requiredQuorum)
    const normalized = [{
      signerKeyId: signed.evidence.signerKeyId,
      subject: signed.evidence.subject,
      signature: signed.evidence.signature,
    }, ...signed.evidence.coSignatures]
    invariant(stableStringify(bundle.signatures, 0) === stableStringify(normalized, 0),
      'External activation signature bundle must use canonical signer-key order')
    return normalized
  })
}

function validateProspectiveActivationLedger(ledger, models, now, managedCiValidationContext) {
  validateExternalActivationRequirements(ledger, {
    inventory: models.inventory,
    desired: models.desired,
    rings: models.rings,
    issuerRegistry: models.issuerRegistry,
    policy: models.activationPolicy,
    expectedPolicyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
    mutationBoundaryContract: models.mutationBoundaryContract,
    expectedMutationBoundaryContractDigest: GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
    now,
    managedCiValidationContext,
  })
}

export function createExternalActivationProposal({
  signingRequest,
  signatures,
  now = new Date(),
  managedCiValidationContext,
  ...overrides
} = {}) {
  return guarded('EXTERNAL_ACTIVATION_PROPOSAL_BLOCKED', () => {
    const models = currentModels(overrides)
    const request = validateExternalActivationSigningRequest(signingRequest, { ...overrides, now })
    const reviewedRequirement = applySignatures(signingRequestRequirement(request), signatures, request.requiredQuorum)
    const ledgerAfter = clone(models.activationLedger)
    const index = ledgerAfter.requirements.findIndex(requirement => requirement.id === request.requirementId)
    invariant(index >= 0, `External activation requirement disappeared: ${request.requirementId}`)
    ledgerAfter.requirements[index] = reviewedRequirement
    validateProspectiveActivationLedger(ledgerAfter, models, now, managedCiValidationContext)
    const core = {
      $schema: ACTIVATION_PROPOSAL_SCHEMA,
      schemaVersion: 1,
      kind: 'external-activation-review-proposal',
      applicationMode: 'local-candidate-preparation-only',
      authorizationStatus: 'external-completion-attestor-quorum-verified',
      externalMutationAuthorized: false,
      ledger: {
        path: CANONICAL_ACTIVATION_LEDGER_PATH,
        beforeSha256: request.ledger.beforeSha256,
        afterSha256: digestValue(ledgerAfter),
      },
      models: clone(request.models),
      requirementId: request.requirementId,
      signingRequestDigest: request.requestDigest,
      reviewedRequirement,
      requiredChangedPaths: [CANONICAL_ACTIVATION_LEDGER_PATH],
      ledgerAfter,
    }
    return { ...core, proposalDigest: digestValue(core) }
  })
}

export function validateExternalActivationProposal(proposal, {
  signingRequest = null,
  now = new Date(),
  managedCiValidationContext,
  ...overrides
} = {}) {
  return guarded('EXTERNAL_ACTIVATION_PROPOSAL_INVALID', () => {
    exactKeys(proposal, [
      '$schema', 'schemaVersion', 'kind', 'applicationMode', 'authorizationStatus',
      'externalMutationAuthorized', 'ledger', 'models', 'requirementId',
      'signingRequestDigest', 'reviewedRequirement', 'requiredChangedPaths',
      'ledgerAfter', 'proposalDigest',
    ], 'External activation proposal')
    invariant(proposal.$schema === ACTIVATION_PROPOSAL_SCHEMA
      && proposal.schemaVersion === 1
      && proposal.kind === 'external-activation-review-proposal'
      && proposal.applicationMode === 'local-candidate-preparation-only'
      && proposal.authorizationStatus === 'external-completion-attestor-quorum-verified'
      && proposal.externalMutationAuthorized === false,
    'External activation proposal identity is invalid')
    exactKeys(proposal.ledger, ['path', 'beforeSha256', 'afterSha256'], 'External activation proposal ledger binding')
    invariant(proposal.ledger.path === CANONICAL_ACTIVATION_LEDGER_PATH
      && SHA256.test(proposal.ledger.beforeSha256)
      && SHA256.test(proposal.ledger.afterSha256), 'External activation proposal ledger binding is invalid')
    const models = currentModels(overrides)
    validateBaselineDigests(proposal.models, models, { includeActivation: true })
    invariant(proposal.ledger.beforeSha256 === digestValue(models.activationLedger), 'External activation ledger changed after proposal review')
    invariant(Array.isArray(proposal.requiredChangedPaths)
      && proposal.requiredChangedPaths.length === 1
      && proposal.requiredChangedPaths[0] === CANONICAL_ACTIVATION_LEDGER_PATH,
    'External activation proposal changed-path closure is invalid')
    invariant(proposal.proposalDigest === proposalDigest(proposal), 'External activation proposal digest is invalid')
    invariant(proposal.ledger.afterSha256 === digestValue(proposal.ledgerAfter), 'External activation proposal after-image digest is invalid')
    const matches = proposal.ledgerAfter.requirements.filter(requirement => requirement.id === proposal.requirementId)
    invariant(matches.length === 1
      && stableStringify(matches[0], 0) === stableStringify(proposal.reviewedRequirement, 0),
    'External activation proposal reviewed requirement is detached from its ledger after-image')
    validateProspectiveActivationLedger(proposal.ledgerAfter, models, now, managedCiValidationContext)
    if (signingRequest) {
      const request = validateExternalActivationSigningRequest(signingRequest, { ...overrides, now })
      invariant(proposal.signingRequestDigest === request.requestDigest, 'External activation proposal is detached from its signing request')
      const signatures = [{
        signerKeyId: proposal.reviewedRequirement.evidence.signerKeyId,
        subject: proposal.reviewedRequirement.evidence.subject,
        signature: proposal.reviewedRequirement.evidence.signature,
      }, ...proposal.reviewedRequirement.evidence.coSignatures]
      const expected = createExternalActivationProposal({
        ...overrides,
        signingRequest: request,
        signatures,
        now,
        managedCiValidationContext,
      })
      invariant(stableStringify(proposal, 0) === stableStringify(expected, 0),
        'External activation proposal is stale, substituted, or non-canonical')
    }
    return proposal
  })
}

export function createReviewedExternalActivationHandoff({
  reviewedProposal,
  signingRequest,
  expectedProposalDigest,
  expectedBaseCommit,
  currentBaseCommit,
  expectedBaseTree,
  currentBaseTree,
  baseLedgerSha256,
  now = new Date(),
  managedCiValidationContext,
  ...overrides
} = {}) {
  return guarded('EXTERNAL_ACTIVATION_HANDOFF_BLOCKED', () => {
    const preparedAt = validClockValue(now, 'External activation handoff preparation time')
    invariant(signingRequest, 'Reviewed activation apply requires the exact canonical signing request')
    invariant(expectedProposalDigest === reviewedProposal?.proposalDigest && SHA256.test(expectedProposalDigest ?? ''),
      'Reviewed activation proposal digest acknowledgement does not match')
    const models = currentModels(overrides)
    const proposal = validateExternalActivationProposal(reviewedProposal, {
      ...overrides,
      signingRequest,
      now: preparedAt,
      managedCiValidationContext,
    })
    const validUntil = canonicalUtc(
      proposal.reviewedRequirement.expiresAt,
      'External activation reviewed requirement expiresAt',
    ).toISOString()
    const core = transactionHandoffCore({
      operation: 'external-activation',
      models,
      reviewedProposal: proposal,
      signingRequest: clone(signingRequest),
      expectedBaseCommit,
      currentBaseCommit,
      expectedBaseTree,
      currentBaseTree,
      baseLedgerSha256,
      preparedAt,
      validUntil,
    })
    return { ...core, handoffDigest: digestValue(core) }
  })
}

export function validateExternalLedgerTransactionHandoff(handoff, {
  currentBaseCommit,
  currentBaseTree,
  baseLedgerSha256,
  baseLedgerSha256s = null,
  now = new Date(),
  managedCiValidationContext,
  ...overrides
} = {}) {
  return guarded('EXTERNAL_LEDGER_TRANSACTION_HANDOFF_INVALID', () => {
    if (handoff?.operation === 'provider-review-capability-certification') {
      exactKeys(handoff, [
        '$schema', 'schemaVersion', 'kind', 'operation', 'applicationMode',
        'canonicalLedgerMutationPerformed', 'externalMutationAuthorized',
        'preparedAt', 'validUntil', 'minimumRemainingValiditySeconds',
        'repository', 'gitTransaction', 'reviewedProposalDigest',
        'signingRequest', 'reviewedProposal', 'ledgers', 'requiredChangedPaths',
        'evidenceArtifacts', 'ledgerAfters', 'handoffDigest',
      ], 'Provider review certification transaction handoff')
      invariant(
        handoff.$schema === TRANSACTION_HANDOFF_SCHEMA
          && handoff.schemaVersion === 2
          && handoff.kind === 'external-ledger-transaction-handoff'
          && handoff.applicationMode === 'protected-git-expected-base-pr-transaction-only'
          && handoff.canonicalLedgerMutationPerformed === false
          && handoff.externalMutationAuthorized === false
          && handoff.minimumRemainingValiditySeconds
            === EXTERNAL_HANDOFF_MINIMUM_VALIDITY_SECONDS
          && handoff.signingRequest === null,
        'Provider review certification handoff identity or mutation boundary is invalid',
      )
      exactKeys(handoff.repository, ['id', 'github', 'defaultBranch'],
        'Provider review certification handoff repository')
      exactKeys(handoff.gitTransaction, [
        'expectedBaseCommit', 'expectedBaseTree', 'expectedBaseRef',
        'expectedBaseLedgers', 'liveProtectedBaseVerificationRequired',
        'requiredReviewFlow', 'requiredPromotionPrimitive',
        'directCanonicalWriteAllowed',
      ], 'Provider review certification handoff Git transaction')
      invariant(
        handoff.gitTransaction.liveProtectedBaseVerificationRequired === true
          && handoff.gitTransaction.requiredReviewFlow === 'protected-pull-request'
          && handoff.gitTransaction.requiredPromotionPrimitive
            === 'atomic-expected-old-git-ref-cas'
          && handoff.gitTransaction.directCanonicalWriteAllowed === false,
        'Provider review certification handoff does not require protected Git CAS promotion',
      )
      validateGitTransactionInputs({
        expectedBaseCommit: handoff.gitTransaction.expectedBaseCommit,
        currentBaseCommit,
        expectedBaseTree: handoff.gitTransaction.expectedBaseTree,
        currentBaseTree,
        baseLedgerSha256: baseLedgerSha256s?.[CANONICAL_CERTIFICATION_LEDGER_PATH],
        ledgerBeforeSha256: handoff.ledgers?.[0]?.beforeSha256,
      })
      validateProviderReviewBaseLedgers(baseLedgerSha256s, handoff.ledgers)
      invariant(
        stableStringify(handoff.gitTransaction.expectedBaseLedgers, 0)
          === stableStringify(handoff.ledgers.map(ledger => ({
            path: ledger.path,
            semanticSha256: ledger.beforeSha256,
          })), 0),
        'Provider review certification protected-base ledger set changed',
      )
      invariant(handoff.handoffDigest === handoffDigest(handoff),
        'Provider review certification handoff digest is invalid')
      const current = validClockValue(now,
        'Provider review certification handoff validation time')
      const preparedAt = canonicalUtc(
        handoff.preparedAt,
        'Provider review certification handoff preparedAt',
      )
      invariant(preparedAt <= current,
        'Provider review certification handoff was prepared in the future')
      assertRemainingHandoffValidity(
        handoff.validUntil,
        current,
        'Provider review certification handoff',
      )
      const models = currentModels(overrides)
      invariant(
        stableStringify(handoff.repository, 0)
          === stableStringify(authorityRepository(models), 0)
          && handoff.gitTransaction.expectedBaseRef
            === `refs/heads/${handoff.repository.defaultBranch}`,
        'Provider review certification handoff authority repository changed',
      )
      invariant(
        handoff.reviewedProposalDigest === handoff.reviewedProposal?.proposalDigest
          && stableStringify(handoff.ledgers, 0)
            === stableStringify(handoff.reviewedProposal?.ledgers, 0)
          && stableStringify(handoff.requiredChangedPaths, 0)
            === stableStringify(handoff.reviewedProposal?.requiredChangedPaths, 0)
          && stableStringify(handoff.evidenceArtifacts, 0)
            === stableStringify(handoff.reviewedProposal?.evidenceArtifacts, 0)
          && stableStringify(handoff.ledgerAfters, 0)
            === stableStringify(handoff.reviewedProposal?.ledgerAfters, 0),
        'Provider review certification handoff is detached from its reviewed after-images',
      )
      validateProviderReviewCapabilityCertificationProposal(
        handoff.reviewedProposal,
        { ...overrides, now: current },
      )
      const expected = createReviewedProviderReviewCapabilityCertificationHandoff({
        ...overrides,
        reviewedProposal: handoff.reviewedProposal,
        expectedProposalDigest: handoff.reviewedProposalDigest,
        expectedBaseCommit: handoff.gitTransaction.expectedBaseCommit,
        currentBaseCommit,
        expectedBaseTree: handoff.gitTransaction.expectedBaseTree,
        currentBaseTree,
        baseLedgerSha256s,
        now: preparedAt,
      })
      invariant(
        stableStringify(handoff, 0) === stableStringify(expected, 0),
        'Provider review certification handoff is stale, substituted, or non-canonical',
      )
      return expected
    }
    exactKeys(handoff, [
      '$schema', 'schemaVersion', 'kind', 'operation', 'applicationMode',
      'canonicalLedgerMutationPerformed', 'externalMutationAuthorized',
      'preparedAt', 'validUntil', 'minimumRemainingValiditySeconds',
      'repository', 'gitTransaction', 'reviewedProposalDigest',
      'signingRequest', 'reviewedProposal', 'ledger', 'requiredChangedPaths',
      'evidenceArtifact', 'ledgerAfter', 'handoffDigest',
    ], 'External ledger transaction handoff')
    invariant(handoff.$schema === TRANSACTION_HANDOFF_SCHEMA
      && handoff.schemaVersion === 1
      && handoff.kind === 'external-ledger-transaction-handoff'
      && ['external-runtime-certification', 'external-activation'].includes(handoff.operation)
      && handoff.applicationMode === 'protected-git-expected-base-pr-transaction-only'
      && handoff.canonicalLedgerMutationPerformed === false
      && handoff.externalMutationAuthorized === false
      && handoff.minimumRemainingValiditySeconds === EXTERNAL_HANDOFF_MINIMUM_VALIDITY_SECONDS,
    'External ledger transaction handoff identity or mutation boundary is invalid')
    exactKeys(handoff.repository, ['id', 'github', 'defaultBranch'], 'External ledger transaction handoff repository')
    exactKeys(handoff.gitTransaction, [
      'expectedBaseCommit', 'expectedBaseTree', 'expectedBaseRef',
      'expectedBaseLedgerSha256', 'liveProtectedBaseVerificationRequired',
      'requiredReviewFlow', 'requiredPromotionPrimitive',
      'directCanonicalWriteAllowed',
    ], 'External ledger transaction handoff Git transaction')
    invariant(handoff.gitTransaction.liveProtectedBaseVerificationRequired === true
      && handoff.gitTransaction.requiredReviewFlow === 'protected-pull-request'
      && handoff.gitTransaction.requiredPromotionPrimitive === 'atomic-expected-old-git-ref-cas'
      && handoff.gitTransaction.directCanonicalWriteAllowed === false,
    'External ledger transaction handoff does not require protected Git CAS promotion')
    exactKeys(handoff.ledger, ['path', 'beforeSha256', 'afterSha256'], 'External ledger transaction handoff ledger')
    invariant(handoff.handoffDigest === handoffDigest(handoff), 'External ledger transaction handoff digest is invalid')
    const current = validClockValue(now, 'External ledger transaction handoff validation time')
    const preparedAt = canonicalUtc(handoff.preparedAt, 'External ledger transaction handoff preparedAt')
    invariant(preparedAt <= current, 'External ledger transaction handoff was prepared in the future')
    assertRemainingHandoffValidity(handoff.validUntil, current, 'External ledger transaction handoff')
    validateGitTransactionInputs({
      expectedBaseCommit: handoff.gitTransaction.expectedBaseCommit,
      currentBaseCommit,
      expectedBaseTree: handoff.gitTransaction.expectedBaseTree,
      currentBaseTree,
      baseLedgerSha256,
      ledgerBeforeSha256: handoff.ledger.beforeSha256,
    })
    invariant(handoff.gitTransaction.expectedBaseLedgerSha256 === baseLedgerSha256,
      'External ledger transaction handoff protected-base ledger binding changed')
    const models = currentModels(overrides)
    invariant(stableStringify(handoff.repository, 0) === stableStringify(authorityRepository(models), 0)
      && handoff.gitTransaction.expectedBaseRef === `refs/heads/${handoff.repository.defaultBranch}`,
    'External ledger transaction handoff authority repository changed')
    invariant(handoff.reviewedProposalDigest === handoff.reviewedProposal?.proposalDigest
      && stableStringify(handoff.ledger, 0) === stableStringify(handoff.reviewedProposal?.ledger, 0)
      && stableStringify(handoff.requiredChangedPaths, 0) === stableStringify(handoff.reviewedProposal?.requiredChangedPaths, 0)
      && stableStringify(handoff.evidenceArtifact, 0) === stableStringify(handoff.reviewedProposal?.evidenceArtifact ?? null, 0)
      && stableStringify(handoff.ledgerAfter, 0) === stableStringify(handoff.reviewedProposal?.ledgerAfter, 0),
    'External ledger transaction handoff is detached from its reviewed after-image')

    let expected
    if (handoff.operation === 'external-runtime-certification') {
      invariant(handoff.signingRequest === null
        && handoff.ledger.path === CANONICAL_CERTIFICATION_LEDGER_PATH
        && handoff.evidenceArtifact !== null,
      'External certification handoff has an activation-only binding')
      validateExternalCertificationProposal(handoff.reviewedProposal, { ...overrides, now: current })
      expected = createReviewedExternalCertificationHandoff({
        ...overrides,
        reviewedProposal: handoff.reviewedProposal,
        expectedProposalDigest: handoff.reviewedProposalDigest,
        expectedBaseCommit: handoff.gitTransaction.expectedBaseCommit,
        currentBaseCommit,
        expectedBaseTree: handoff.gitTransaction.expectedBaseTree,
        currentBaseTree,
        baseLedgerSha256,
        now: preparedAt,
      })
    } else {
      invariant(handoff.signingRequest !== null
        && handoff.ledger.path === CANONICAL_ACTIVATION_LEDGER_PATH
        && handoff.evidenceArtifact === null,
      'External activation handoff lacks its exact signing request')
      validateExternalActivationProposal(handoff.reviewedProposal, {
        ...overrides,
        signingRequest: handoff.signingRequest,
        now: current,
        managedCiValidationContext,
      })
      expected = createReviewedExternalActivationHandoff({
        ...overrides,
        reviewedProposal: handoff.reviewedProposal,
        signingRequest: handoff.signingRequest,
        expectedProposalDigest: handoff.reviewedProposalDigest,
        expectedBaseCommit: handoff.gitTransaction.expectedBaseCommit,
        currentBaseCommit,
        expectedBaseTree: handoff.gitTransaction.expectedBaseTree,
        currentBaseTree,
        baseLedgerSha256,
        now: preparedAt,
        managedCiValidationContext,
      })
    }
    invariant(stableStringify(handoff, 0) === stableStringify(expected, 0),
      'External ledger transaction handoff is stale, substituted, or non-canonical')
    return expected
  })
}

export function applyReviewedExternalActivationProposal() {
  return block(
    'EXTERNAL_DIRECT_CANONICAL_LEDGER_APPLY_DEPRECATED',
    'Direct activation ledger apply is disabled; create a protected Git expected-base transaction handoff instead',
  )
}

export function externalOperatorBlockResult(error) {
  const typed = error instanceof ExternalOperatorBlockedError
    ? error
    : new ExternalOperatorBlockedError('EXTERNAL_OPERATOR_UNEXPECTED_BLOCKER', error.message, { cause: error })
  return {
    $schema: BLOCK_RESULT_SCHEMA,
    schemaVersion: 1,
    kind: 'external-operator-block-result',
    ready: false,
    externalMutationPerformed: false,
    blockers: [{ code: typed.code, detail: typed.detail }],
  }
}

export const externalOperatorTestHarness = Object.freeze({
  canonicalBytes,
  digestValue,
  parseCanonicalJson,
})

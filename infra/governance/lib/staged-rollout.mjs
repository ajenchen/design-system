import { createHash, randomUUID, verify } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { compareUtf8Bytes, invariant, readJson, runClosedGit, sha256, stableStringify } from './common.mjs'
import {
  assertIssuerActive,
  DEFAULT_ISSUER_REGISTRY_PATH,
  issuerRegistryDigest,
  loadIssuerRegistry,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
  validateRegistryPolicyBinding,
} from './issuer-registry.mjs'
import { validateCandidateRelease, validateVerifiedReleaseEvidence } from './release-evidence.mjs'
import { validateReleaseTrustPreflightEvidence } from './release-trust-preflight.mjs'
import {
  EXTERNAL_ACTIVATION_POLICY_DIGEST,
  GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH,
  externalActivationProfileDigest,
  externalActivationReadiness,
  loadExternalActivationPolicy,
  resolveExternalActivationProfile,
  validateExternalActivationCarrierAfterImage,
} from './external-activation.mjs'
import { releaseTagAuthorizationProfileDigest } from './release-tag-authorization.mjs'
import { validateRepositorySubjectProof } from './repository-subject-proof.mjs'
import { verifyCompletionAttestation } from './rollout-state-machine.mjs'
import { verifyFleetRecoveryAuthorization } from './fleet-recovery-authorization.mjs'
import {
  AUTHORITY_BOOTSTRAP_REPLAY_RECEIPT_RELATIVE_ROOT,
  validateAuthorityBootstrapDurableReplayReceipt,
  validateTransactionJournal,
} from '../bin/reconcile-github.mjs'
import { validateRequiredCheckProducer } from './check-run-trust.mjs'
import { materializeProfile } from '../bin/reconcile-github.mjs'
import { validateDeterministicGovernanceModel } from './model-validation.mjs'
import { validateReleaseBom } from '../../../scripts/release-bom-contract.mjs'
import {
  captureDeepAuditSnapshot,
  digestSandboxVerification,
  loadActiveDeepAuditRun,
  validateDeepAuditEvidenceEnvelope,
  validateDeepAuditModelTranscriptArtifact,
  validateDeepAuditRunProviderBindings,
  validateDeepAuditRunManifest,
} from '../../../scripts/lib/deep-audit-evidence-contract.mjs'
import { verifyDeepAuditCoverage } from '../../../scripts/verify-deep-audit-coverage.mjs'
import { validateManagedCiSandboxReceipt } from '../../../scripts/lib/managed-ci-sandbox-receipt.mjs'
import {
  ALL_HARNESS_RECEIPT_RELATIVE_PATH,
  ALL_HARNESS_RUNNER_ARGV,
  sanitizeHarnessEnvironment,
  validateAllHarnessReceipt,
  validateAllHarnessReceiptEvidence,
} from './harness-runner.mjs'
import {
  ensureRuntimeEvidenceDirectory,
  prepareRuntimeEvidenceFile,
  resolveRuntimeEvidencePath,
} from '../../../scripts/lib/governance-runtime-evidence.mjs'
import {
  NETLIFY_LIVE_UNOBSERVED_REASON,
  assertDeterministicMatrixParity,
  deterministicCapabilitiesForDimension,
  loadDeterministicDeepAuditPlan,
} from '../../../scripts/lib/deep-audit-deterministic-plan.mjs'
import { loadHookEvidencePlan } from '../../../scripts/lib/hook-evidence-plan.mjs'
import { loadCiEvidencePlan } from '../../../scripts/lib/ci-evidence-plan.mjs'
import {
  loadManagedCiTrustedExecutionPlan,
  managedCiActivationTrustProjection,
  managedCiExpectedAttestedRunnerEnvironment,
  managedCiExpectedFrozenSubjectArtifactBinding,
  managedCiExpectedFrozenSubjectClassReadback,
  managedCiExpectedHostSandboxPolicyBinding,
  managedCiExpectedImageSupplyChainBinding,
  managedCiExpectedModelReleaseAuthorityBinding,
  managedCiExpectedRawReceiptBinding,
  managedCiExpectedReceiptBinding,
  managedCiExpectedReceiptSignerAuthorityBinding,
  managedCiFinalizationTransportReadbackDigest,
  managedCiFinalizedReceiptSetDigest,
  managedCiProvenanceBinding,
  managedCiSignerAuditEvent,
  managedCiValidateFinalizationTransportReadback,
  managedCiVerifyReceiptSigningPayloadProjection,
} from '../../../scripts/lib/managed-ci-trusted-execution-plan.mjs'
import {
  loadConsumerUpgradeProtocol,
  protocolSourceDigests,
  upgradeProfile,
  validateConsumerBootstrapReadback,
} from './consumer-upgrade-protocol.mjs'

const MODULE_PATH = fileURLToPath(import.meta.url)
export const GOVERNANCE_ROOT = resolve(dirname(MODULE_PATH), '..')
export const REPOSITORY_ROOT = resolve(GOVERNANCE_ROOT, '../..')
export const DEFAULT_STAGED_ROLLOUT_PLAN_PATH = resolve(GOVERNANCE_ROOT, 'staged-rollout-plan.json')
export const DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH = resolve(GOVERNANCE_ROOT, 'schemas/staged-rollout.schema.json')

const SHA256 = /^[a-f0-9]{64}$/
const EXACT_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-(beta|next|rc)\.(\d+))?$/
const CANDIDATE_FREEZE_BUNDLE_MAGIC = Buffer.from('qijenchen-candidate-freeze-content-v1\0', 'utf8')
const CANDIDATE_FREEZE_ARTIFACT_FORMAT = 'qijenchen-candidate-freeze-content-v1'
const CANDIDATE_FREEZE_COMMIT_IDENTITY = 'Qijenchen Governance Freeze <governance-freeze@qijenchen.dev>'
const AUTHORITY_BOOTSTRAP_MIRROR_REQUIREMENT_ID = 'activate-off-host-append-only-reconcile-evidence-mirror'
const CANDIDATE_FREEZE_BUILD_GRAPH_STAGES = Object.freeze([
  'release-version',
  'provider-adapters',
  'plugin-aliases',
  'fork-template',
  'baseline-mirrors',
  'governance-metadata',
  'control-plane',
])
export const CANDIDATE_FREEZE_CHECKS = Object.freeze([
  Object.freeze({
    id: 'all-harness',
    producer: 'infra/governance/bin/run-harnesses.mjs',
    argv: Object.freeze([...ALL_HARNESS_RUNNER_ARGV]),
    resultKind: 'all-harness-receipt-validation',
  }),
  Object.freeze({
    id: 'governance-build-graph',
    producer: 'scripts/governance-build-graph.mjs',
    argv: Object.freeze(['node', 'scripts/governance-build-graph.mjs', '--check']),
    resultKind: 'governance-build-graph-validation',
  }),
])
const MANAGED_CI_EXECUTION_CLASSES = Object.freeze([
  'dependency-acquisition', 'deterministic-hook-audit', 'model-broker', 'github-observer',
])
const MANAGED_CI_ACTIVATION_CLOSURE_SCALAR_KEYS = Object.freeze([
  'frozenSubjectArtifactBindingDigest', 'receiptSignerAuthorityBindingDigest',
  'receiptSignerIssuerMappingDigest', 'modelReleaseAuthorityBindingDigest',
  'finalizationRequestDigest', 'finalizationRawReceiptSetDigest',
  'finalizationReceiptSetDigest', 'finalizationTransportReadbackDigest',
  'readbackReceiptDigest',
])
const MANAGED_CI_ACTIVATION_CLOSURE_MAP_KEYS = Object.freeze([
  'executionClassReceiptProvenanceDigests', 'executionClassOidcClaimsDigests',
  'executionClassOidcProvenanceDigests', 'executionClassImageSupplyChainDigests',
  'executionClassHostSandboxReadbackDigests', 'executionClassFrozenSubjectReadbackDigests',
  'executionClassReceiptSigningPayloadDigests', 'executionClassSignerAuditEventDigests',
])
const MANAGED_CI_ACTIVATION_CLOSURE_KEYS = Object.freeze([
  ...MANAGED_CI_ACTIVATION_CLOSURE_SCALAR_KEYS, ...MANAGED_CI_ACTIVATION_CLOSURE_MAP_KEYS,
])
const PRODUCTION_GRADE_PROFILE_ID = 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM'
const MAXIMUM_ASSURANCE_PROFILE_ID = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
const DEPLOYMENT_PROFILE_IDS = Object.freeze([
  PRODUCTION_GRADE_PROFILE_ID,
  MAXIMUM_ASSURANCE_PROFILE_ID,
])
const DEPLOYMENT_PROFILE_POLICY_PATH = 'infra/governance/external-activation-policy.json'
const RELEASE_TAG_AUTHORIZATION_POLICY_PATH = 'infra/governance/release-tag-authorization-policy.json'
const CANDIDATE_VALIDATION_LIFECYCLE = Object.freeze({
  targetAuthority: 'immutable-active-run-manifest-and-git-projection',
  targetCreationOrder: 'generation-then-freeze-before-all-harness',
  allHarnessCardinality: 'exactly-once-per-frozen-target',
  receiptCompletionGate: 'same-target-all-harness-pass',
  sourceChangeBehavior: 'invalidate-target-validation-and-rebind',
})

const BASE_BOOTSTRAP_BOUNDARY = Object.freeze({
  bootstrapChange: 'protected-main-control-plane-only',
  bootstrapReleaseAllowed: false,
  candidateMustUseDistinctPr: true,
  candidateSelfCertificationAllowed: false,
  githubPolicyConvergence: Object.freeze({
    kind: 'authority-github-policy-bootstrap-convergence-v1',
    transactionClass: 'authority-policy-bootstrap',
    repositoryId: 'design-system',
    repository: 'ajenchen/design-system',
    profile: 'design-system-authority',
    actionsWorkflowPermissions: true,
    rulesets: Object.freeze(['fleet/base-integrity', 'fleet/verified-main']),
    // 1B(2026-07-29):governance-check-verdict 環境隨 App verdict 層拆除。
    environments: Object.freeze(['governance-external-ledger']),
    irreversibleActionsAllowed: false,
    staleResourceDeletionAllowed: false,
    exactReadbackRequired: true,
    crashRecoveryRequired: true,
    rollbackRequired: true,
  }),
})
const BOOTSTRAP_BOUNDARIES = Object.freeze({
  [PRODUCTION_GRADE_PROFILE_ID]: Object.freeze({
    ...BASE_BOOTSTRAP_BOUNDARY,
    kind: 'profile-gated-protected-pr-bootstrap',
    bootstrapMustPreexistCandidateFreeze: false,
    githubPolicyConvergence: Object.freeze({
      ...BASE_BOOTSTRAP_BOUNDARY.githubPolicyConvergence,
      position: 'after-candidate-freeze-before-protected-pr',
    }),
  }),
  [MAXIMUM_ASSURANCE_PROFILE_ID]: Object.freeze({
    ...BASE_BOOTSTRAP_BOUNDARY,
    kind: 'managed-ci-two-pr-bootstrap',
    bootstrapMustPreexistCandidateFreeze: true,
    githubPolicyConvergence: Object.freeze({
      ...BASE_BOOTSTRAP_BOUNDARY.githubPolicyConvergence,
      position: 'before-candidate-freeze',
    }),
  }),
})
const BASE_EXTERNAL_LEDGER_BOOTSTRAP_BOUNDARY = Object.freeze({
  kind: 'protected-default-external-ledger-pr-chain-v1',
  writerCodeSource: 'protected-default-only',
  handoffValidity: 'signed-expiring-exact-base-cas',
  handoffValidityScope: 'writer-branch-and-pr-materialization-only',
  dispatchCardinality: 'one-reviewed-handoff-per-run',
  openPullRequestCardinality: 'at-most-one',
  credential: 'dedicated-governance-writer-app',
  candidateCodeExecutionAllowed: false,
  directDefaultBranchWriteAllowed: false,
  mergeAllowed: false,
  certificationChangedPaths: Object.freeze([
    'infra/governance/evidence/external-runtime/<sha256>.json',
    'infra/governance/providers/certifications.json',
  ]),
  reviewCapabilityCertificationChangedPaths: Object.freeze([
    'infra/governance/evidence/provider-runtime/<sha256>.json',
    'infra/governance/providers/certifications.json',
    'infra/governance/evidence/review-capability/<sha256>.json',
    'infra/governance/providers/review-capability-certifications.json',
  ]),
  activationChangedPaths: Object.freeze([
    'infra/governance/external-activation-requirements.json',
  ]),
  requiredMergeGate: 'protected-base-governance-anchor',
  postMaterializationMergeAuthority: 'branch-protection-review-and-independently-signed-ledger-content',
  expiredTransportHandoffMergeAuthority: 'none',
  greenCheckMeaning: 'exact-head-validation-not-merge-time-handoff-ttl',
  workflowReceiptAuthority: 'transient-reconstructable-non-authority',
  durableAuthority: 'protected-git-object-and-merged-ledger-readback',
})
const EXTERNAL_LEDGER_BOOTSTRAP_BOUNDARIES = Object.freeze({
  [PRODUCTION_GRADE_PROFILE_ID]: Object.freeze({
    ...BASE_EXTERNAL_LEDGER_BOOTSTRAP_BOUNDARY,
    position: 'after-candidate-freeze-before-protected-pr',
  }),
  [MAXIMUM_ASSURANCE_PROFILE_ID]: Object.freeze({
    ...BASE_EXTERNAL_LEDGER_BOOTSTRAP_BOUNDARY,
    position: 'before-candidate-freeze',
  }),
})
const CONSUMER_BOOTSTRAP_BOUNDARY = Object.freeze({
  kind: 'legacy-consumer-reviewed-full-snapshot',
  protocolId: 'protected-base-reconstruction-v2',
  bootstrapMode: 'one-time-reviewed-full-snapshot-pr',
  planningMutationAuthorized: false,
  legacySelfUpdateCompletionAllowed: false,
  bootstrapEvidenceContract: 'consumer-governance-bootstrap-readback-v1',
  ordinarySyncRequiresReadback: true,
  postAcceptanceProfile: 'reviewed-bootstrap-established-v2',
  acceptedReadbackInventoryBindingRequired: true,
})
const CONSUMER_BOOTSTRAP_MECHANISM_REFS = Object.freeze([
  'infra/governance/inventory/managed-repos.json',
  'infra/governance/consumer-upgrade-protocol.json',
  'infra/governance/schemas/consumer-upgrade-protocol.schema.json',
  'infra/governance/lib/consumer-upgrade-protocol.mjs',
  'infra/governance/lib/consumer-bootstrap.mjs',
  'infra/governance/schemas/consumer-bootstrap-plan.schema.json',
  'infra/governance/schemas/consumer-bootstrap-snapshot-verification.schema.json',
  'infra/governance/schemas/consumer-bootstrap-readback-verification.schema.json',
  'infra/governance/schemas/consumer-bootstrap-promotion-proposal.schema.json',
  'infra/governance/schemas/consumer-control-plane-baseline-receipt.schema.json',
  'infra/governance/schemas/consumer-control-plane-update-plan.schema.json',
  'infra/governance/schemas/consumer-control-plane-update-snapshot-verification.schema.json',
  'infra/governance/schemas/consumer-control-plane-update-readback.schema.json',
  'infra/governance/schemas/consumer-control-plane-update-readback-verification.schema.json',
  'infra/governance/schemas/consumer-control-plane-update-acceptance-proposal.schema.json',
  'infra/governance/schemas/managed-repos.schema.json',
  'infra/governance/schemas/consumer-fanout-dispatch-evidence.schema.json',
  'infra/governance/schemas/consumer-fanout-review.schema.json',
  'infra/governance/bin/consumerctl.mjs',
  'scripts/lib/consumer-control-plane-policy.mjs',
])
const EXTERNAL_LEDGER_BOOTSTRAP_MECHANISM_REFS = Object.freeze([
  'infra/governance/lib/external-activation.mjs',
  'infra/governance/lib/external-operator.mjs',
  'infra/governance/bin/external-operator.mjs',
  '.github/workflows/external-ledger-writer.yml',
  'infra/governance/lib/external-ledger-writer.mjs',
  'infra/governance/bin/external-ledger-writer.mjs',
  'infra/governance/schemas/external-surface-import-receipt.schema.json',
  'infra/governance/schemas/external-runtime-certification-proposal.schema.json',
  'infra/governance/schemas/external-ledger-transaction-handoff.schema.json',
  'infra/governance/schemas/external-ledger-writer-dispatch.schema.json',
  'infra/governance/schemas/external-ledger-writer-plan.schema.json',
  'infra/governance/schemas/external-ledger-artifact-identity.schema.json',
  'infra/governance/schemas/external-ledger-writer-receipt.schema.json',
  'infra/governance/schemas/external-activation-signing-request.schema.json',
  'infra/governance/schemas/external-activation-signature-bundle.schema.json',
  'infra/governance/schemas/external-activation-proposal.schema.json',
  'infra/governance/schemas/external-operator-block-result.schema.json',
  '.github/workflows/governance-anchor.yml',
  'scripts/governance-anchor-preflight.mjs',
  'scripts/verify-privileged-change.mjs',
])
const AUTHORITY_POLICY_BOOTSTRAP_MECHANISM_REFS = Object.freeze([
  'infra/governance/bin/reconcile-github.mjs',
  'infra/governance/lib/fleet-reconcile-mirror.mjs',
  'infra/governance/schemas/fleet-reconcile-journal.schema.json',
  'infra/governance/schemas/fleet-reconcile-bootstrap-transaction.schema.json',
  'infra/governance/schemas/fleet-reconcile-bootstrap-replay-receipt.schema.json',
  'scripts/verify-privileged-change.mjs',
])
const PR_HEAD_CERTIFICATION_BOUNDARY = Object.freeze({
  kind: 'managed-ci-envelope-transcript-closure',
  coverageTopology: 'frozen-canonical-91-dimension-matrix-and-plans',
  dependencyClosure: 'one-acquisition-bundle-across-all-execution-classes',
  modelArtifactMode: 'envelope-and-content-addressed-transcript',
  modelReceiptCardinality: 'exactly-once',
  canonicalTranscriptValidationRequired: true,
})
const REQUIRED_DIMENSION_COUNT = 91
const SUPPORTED_DIMENSION_TIERS = Object.freeze(['DETERMINISTIC', 'PURE-JUDGMENT', 'HOOK-ENFORCED', 'CI-ENFORCED'])
const PHASE_IDS = Object.freeze([
  'candidate-freeze',
  'github-policy-bootstrap',
  'commit-pr-open',
  'pr-head-certification',
  'merge-post-gates',
  'immutable-release-bom',
  'template-fleet-rollout',
  'wm-canary',
  'rollout-completion',
  'soak-72h',
  'promotion-or-rollback',
])

const PHASE_POLICY = Object.freeze({
  'candidate-freeze': {
    scope: 'local',
    standardCapabilities: ['local-evidence-write'],
    standardEvidence: ['staged-rollout-prepare-verification-v4'],
  },
  'github-policy-bootstrap': {
    scope: 'external',
    standardCapabilities: ['github-admin-write'],
    standardEvidence: ['github-policy-bootstrap-readback-v1'],
  },
  'commit-pr-open': {
    scope: 'external',
    standardCapabilities: ['git-commit-write', 'github-pr-write'],
    standardEvidence: ['protected-pr-readback-v1'],
  },
  'pr-head-certification': {
    scope: 'local',
    standardCapabilities: ['managed-ci-readback', 'model-broker-readback', 'trusted-dependency-materialization'],
    standardEvidence: ['pr-head-certification-v1'],
  },
  'merge-post-gates': {
    scope: 'external',
    standardCapabilities: ['github-pr-merge', 'github-readback'],
    standardEvidence: ['github-hard-gates-readback-v1'],
  },
  'immutable-release-bom': {
    scope: 'external',
    standardCapabilities: ['github-tag-write', 'github-release-write', 'npm-publish'],
    standardEvidence: ['release-trust-preflight-v4', 'release-bom-v5', 'verified-immutable-release-v2'],
  },
  'template-fleet-rollout': {
    scope: 'external',
    standardCapabilities: ['github-pr-write', 'fleet-rollout'],
    standardEvidence: ['template-exact-version-upgrade-v2', 'rollout-completion-attestation-v1'],
  },
  'wm-canary': {
    scope: 'external',
    standardCapabilities: ['github-pr-write', 'wm-canary'],
    standardEvidence: ['consumer-governance-bootstrap-readback-v1', 'wm-exact-version-canary-v2', 'rollout-completion-attestation-v1'],
  },
  'rollout-completion': {
    scope: 'local',
    standardCapabilities: ['managed-ci-import', 'model-broker-readback', 'local-evidence-write'],
    standardEvidence: ['full-deep-audit-verification-v1'],
  },
  'soak-72h': {
    scope: 'local',
    standardCapabilities: ['soak-observation'],
    standardEvidence: ['candidate-bound-soak-72h-v1'],
  },
  'promotion-or-rollback': {
    scope: 'external',
    standardCapabilities: [],
    standardEvidence: [],
    promotionCapabilities: ['fleet-promotion'],
    promotionEvidence: ['rollout-completion-attestation-v1'],
    rollbackCapabilities: ['fleet-rollback'],
    rollbackEvidence: ['previous-good-release-v1', 'fleet-recovery-authorization-v2', 'fleet-reconcile-journal-v6'],
  },
})

const CONTRACT_ORIGINS = new Map([
  ['staged-rollout-prepare-verification-v4', 'closed-local-verifier'],
  ['github-policy-bootstrap-readback-v1', 'github-api-readback'],
  ['pr-head-certification-v1', 'closed-local-verifier'],
  ['full-deep-audit-verification-v1', 'closed-local-verifier'],
  ['protected-pr-readback-v1', 'github-api-readback'],
  ['github-hard-gates-readback-v1', 'github-api-readback'],
  ['release-trust-preflight-v4', 'github-api-readback'],
  ['release-bom-v5', 'immutable-release-asset'],
  ['verified-immutable-release-v2', 'github-api-readback'],
  ['template-exact-version-upgrade-v2', 'github-api-readback'],
  ['consumer-governance-bootstrap-readback-v1', 'github-api-readback'],
  ['wm-exact-version-canary-v2', 'github-api-readback'],
  ['rollout-completion-attestation-v1', 'signed-attestation'],
  ['candidate-bound-soak-72h-v1', 'rollout-state-machine'],
  ['previous-good-release-v1', 'immutable-release-asset'],
  ['fleet-recovery-authorization-v2', 'signed-attestation'],
  ['fleet-reconcile-journal-v6', 'durable-off-host-journal'],
])
const VALIDATED_LEDGER_CAPABILITY = Symbol('validated-staged-rollout-ledger')
const CANONICAL_VALIDATION_AUTHORITY = Object.freeze({ kind: 'canonical-staged-rollout-validation-authority' })
const CANONICAL_INPUT_PATHS = Object.freeze([
  'infra/governance/staged-rollout-plan.json',
  'infra/governance/schemas/staged-rollout.schema.json',
  'infra/governance/release-rings.json',
  'infra/governance/trust/issuers.json',
  'infra/governance/inventory/managed-repos.json',
  'infra/governance/consumer-upgrade-protocol.json',
  'infra/governance/schemas/consumer-upgrade-protocol.schema.json',
  'infra/governance/lib/consumer-upgrade-protocol.mjs',
  'infra/governance/desired/github.json',
  'infra/governance/external-activation-policy.json',
  'infra/governance/external-activation-requirements.json',
  'infra/governance/release-tag-authorization-policy.json',
  'infra/governance/privileged-trust-roots.json',
  'infra/governance/providers/certifications.json',
  'infra/governance/providers/compatibility-matrix.json',
  'infra/governance/providers/runtime-conformance.json',
  'infra/governance/waivers.json',
])

let schemaValidator = null

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function exactList(actual, expected, label) {
  invariant(Array.isArray(actual), `${label} must be an array`)
  invariant(stableStringify(actual, 0) === stableStringify(expected, 0), `${label} differs from the executable staged-rollout contract`)
}

function canonicalDate(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be a canonical UTC timestamp`)
  return parsed
}

function compileSchema(schemaPath = DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH) {
  if (schemaValidator && schemaPath === DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH) return schemaValidator
  const schema = readJson(resolve(schemaPath))
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true })
  addFormats(ajv)
  for (const dependency of [
    'release-rings.schema.json',
    'external-activation-requirements.schema.json',
    'external-activation-policy.schema.json',
    'managed-repos.schema.json',
    'github-desired.schema.json',
    'github-mutation-boundary-contract.schema.json',
    'issuer-registry.schema.json',
    'fleet-reconcile-journal.schema.json',
    'fleet-reconcile-bootstrap-transaction.schema.json',
    'fleet-reconcile-bootstrap-replay-receipt.schema.json',
  ]) ajv.addSchema(readJson(resolve(GOVERNANCE_ROOT, 'schemas', dependency)))
  const validate = ajv.compile(schema)
  if (schemaPath === DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH) schemaValidator = validate
  return validate
}

function assertSchema(value, label, schemaPath) {
  const validate = compileSchema(schemaPath)
  invariant(validate(value), `${label} schema validation failed: ${validate.errors?.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
}

function safeMechanismPath(repoRoot, repoPath) {
  invariant(typeof repoPath === 'string' && repoPath.length > 0 && !isAbsolute(repoPath), `staged-rollout mechanism path is unsafe: ${String(repoPath)}`)
  const segments = repoPath.split('/')
  invariant(!segments.includes('..') && !segments.includes('.') && !segments.includes(''), `staged-rollout mechanism path is unsafe: ${repoPath}`)
  const root = realpathSync(resolve(repoRoot))
  const absolute = resolve(root, repoPath)
  const rel = relative(root, absolute)
  invariant(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `staged-rollout mechanism path escapes repository: ${repoPath}`)
  const info = lstatSync(absolute)
  invariant(info.isFile() && !info.isSymbolicLink(), `staged-rollout mechanism must be a regular no-symlink file: ${repoPath}`)
  invariant(info.nlink === 1, `staged-rollout mechanism must not be hard-linked: ${repoPath}`)
  const real = realpathSync(absolute)
  const realRel = relative(root, real)
  invariant(realRel && realRel !== '..' && !realRel.startsWith(`..${sep}`) && !isAbsolute(realRel), `staged-rollout mechanism resolves outside repository: ${repoPath}`)
  return absolute
}

export function stagedRolloutPlanDigest(plan) {
  return sha256(stableStringify(plan, 0))
}

function expectedCandidateFreezeActivationOrder(profileId) {
  invariant(DEPLOYMENT_PROFILE_IDS.includes(profileId), `Unknown staged-rollout deployment profile ${profileId ?? '<missing>'}`)
  return profileId === PRODUCTION_GRADE_PROFILE_ID
    ? 'freeze-before-profile-activation'
    : 'profile-activation-before-freeze'
}

export function stagedRolloutProfileLifecycle(profileId) {
  invariant(DEPLOYMENT_PROFILE_IDS.includes(profileId), `Unknown staged-rollout deployment profile ${profileId ?? '<missing>'}`)
  const productionGrade = profileId === PRODUCTION_GRADE_PROFILE_ID
  return clone({
    profileId,
    candidateValidationLifecycle: CANDIDATE_VALIDATION_LIFECYCLE,
    bootstrapBoundary: BOOTSTRAP_BOUNDARIES[profileId],
    externalLedgerBootstrapBoundary: EXTERNAL_LEDGER_BOOTSTRAP_BOUNDARIES[profileId],
    activationRequiredBeforeCandidateFreeze: !productionGrade,
    activationReadbackPhase: productionGrade ? 'github-policy-bootstrap' : 'candidate-freeze',
    candidateCarrierRelationship: productionGrade ? 'ledger-carrier-descendant' : 'exact-subject',
    managedCiBootstrapRequiredBeforeCandidateFreeze: !productionGrade,
  })
}

export function stagedRolloutCandidateCarrierPolicy(plan, {
  repoRoot = REPOSITORY_ROOT,
} = {}) {
  const profile = resolveStagedRolloutDeploymentProfile(plan, { repoRoot })
  if (profile.id === MAXIMUM_ASSURANCE_PROFILE_ID) {
    return { relationship: 'exact-subject', allowedChangedPaths: [] }
  }
  const boundary = plan.externalLedgerBootstrapBoundary
  const allowedChangedPaths = [...new Set([
    ...boundary.activationChangedPaths,
    ...boundary.certificationChangedPaths.map(path => path.replace('<sha256>', '*')),
    ...boundary.reviewCapabilityCertificationChangedPaths
      .map(path => path.replace('<sha256>', '*')),
  ])].sort(compareUtf8Bytes)
  invariant(
    allowedChangedPaths.length > 0
      && new Set(allowedChangedPaths).size === allowedChangedPaths.length,
    'production-grade candidate carrier policy lacks a closed changed-path allowlist',
  )
  return { relationship: 'ledger-carrier-descendant', allowedChangedPaths }
}

export function resolveStagedRolloutDeploymentProfile(plan, {
  repoRoot = REPOSITORY_ROOT,
  activationPolicy = null,
  releaseTagAuthorizationPolicy = null,
} = {}) {
  const binding = plan?.deploymentProfileBinding
  exactObjectKeys(binding, [
    'externalActivationPolicy',
    'profile',
    'releaseAuthorization',
    'releaseAuthorizationSha256',
    'releaseTagAuthorizationProfileSha256',
    'candidateFreezeActivationOrder',
    'activationReadbackPhase',
  ], 'staged-rollout deployment profile binding')
  exactObjectKeys(binding.externalActivationPolicy, ['path', 'sha256'], 'staged-rollout external activation policy binding')
  exactObjectKeys(binding.profile, ['id', 'sha256'], 'staged-rollout deployment profile identity')
  exactObjectKeys(binding.releaseAuthorization, ['minimumSignerQuorum', 'maximumSignerQuorum'], 'staged-rollout release authorization projection')
  invariant(binding.externalActivationPolicy.path === DEPLOYMENT_PROFILE_POLICY_PATH
    && binding.externalActivationPolicy.sha256 === EXTERNAL_ACTIVATION_POLICY_DIGEST,
  'staged-rollout deployment profile references another external activation policy')
  const policy = activationPolicy ?? loadExternalActivationPolicy(
    resolve(repoRoot, DEPLOYMENT_PROFILE_POLICY_PATH),
  )
  const profile = resolveExternalActivationProfile(policy, {
    expectedPolicyDigest: binding.externalActivationPolicy.sha256,
  })
  invariant(
    binding.profile.id === profile.id
      && binding.profile.sha256 === profile.sha256
      && binding.profile.sha256 === externalActivationProfileDigest(
        Object.fromEntries(Object.entries(profile).filter(([key]) => key !== 'sha256')),
      ),
    'staged-rollout deployment profile ID/digest differs from the canonical external activation active profile',
  )
  invariant(
    stableStringify(binding.releaseAuthorization, 0) === stableStringify(profile.releaseAuthorization, 0)
      && binding.releaseAuthorizationSha256 === sha256(stableStringify(profile.releaseAuthorization, 0)),
    'staged-rollout release authorization projection is stale or substituted',
  )
  const releasePolicy = releaseTagAuthorizationPolicy ?? readJson(
    resolve(repoRoot, RELEASE_TAG_AUTHORIZATION_POLICY_PATH),
  )
  invariant(
    releasePolicy.authorizationProfileId === profile.id
      && releasePolicy.authorizationProfileDigest === releaseTagAuthorizationProfileDigest(profile.id)
      && binding.releaseTagAuthorizationProfileSha256 === releasePolicy.authorizationProfileDigest,
    'staged-rollout, external activation, and release-tag authorization profiles differ',
  )
  invariant(
    Number.isInteger(releasePolicy.requiredSignerQuorum)
      && releasePolicy.requiredSignerQuorum >= binding.releaseAuthorization.minimumSignerQuorum
      && releasePolicy.requiredSignerQuorum <= binding.releaseAuthorization.maximumSignerQuorum,
    'staged-rollout release-tag signer quorum is outside the active deployment profile projection',
  )
  invariant(
    binding.releaseAuthorization.minimumSignerQuorum !== binding.releaseAuthorization.maximumSignerQuorum
      || releasePolicy.requiredSignerQuorum === binding.releaseAuthorization.minimumSignerQuorum,
    'staged-rollout exact release-tag signer quorum was substituted',
  )
  invariant(
    binding.candidateFreezeActivationOrder === expectedCandidateFreezeActivationOrder(profile.id)
      && binding.activationReadbackPhase === 'github-policy-bootstrap',
    'staged-rollout candidate-freeze/activation ordering is stale or substituted',
  )
  return {
    id: profile.id,
    sha256: profile.sha256,
    releaseAuthorization: clone(profile.releaseAuthorization),
    releaseAuthorizationSha256: binding.releaseAuthorizationSha256,
    releaseTagAuthorizationProfileSha256: binding.releaseTagAuthorizationProfileSha256,
    candidateFreezeActivationOrder: binding.candidateFreezeActivationOrder,
    activationReadbackPhase: binding.activationReadbackPhase,
  }
}

export function validateStagedRolloutPlan(plan, {
  repoRoot = REPOSITORY_ROOT,
  schemaPath = DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH,
  verifyMechanisms = true,
} = {}) {
  assertSchema(plan, 'staged-rollout plan', schemaPath)
  invariant(plan.kind === 'staged-rollout-plan', 'staged-rollout document is not a plan')
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(plan, { repoRoot })
  invariant(
    stableStringify(plan.candidateValidationLifecycle, 0) === stableStringify(CANDIDATE_VALIDATION_LIFECYCLE, 0),
    'staged-rollout candidate target/All-Harness lifecycle is invalid or weakened',
  )
  invariant(stableStringify(plan.bootstrapBoundary, 0) === stableStringify(BOOTSTRAP_BOUNDARIES[deploymentProfile.id], 0), 'staged-rollout profile-specific protected bootstrap boundary is invalid or weakened')
  invariant(stableStringify(plan.externalLedgerBootstrapBoundary, 0) === stableStringify(EXTERNAL_LEDGER_BOOTSTRAP_BOUNDARIES[deploymentProfile.id], 0), 'staged-rollout profile-specific protected external-ledger bootstrap boundary is invalid or weakened')
  invariant(stableStringify(plan.consumerBootstrapBoundary, 0) === stableStringify(CONSUMER_BOOTSTRAP_BOUNDARY, 0), 'staged-rollout legacy-consumer full-snapshot bootstrap boundary is invalid or weakened')
  invariant(stableStringify(plan.prHeadCertificationBoundary, 0) === stableStringify(PR_HEAD_CERTIFICATION_BOUNDARY, 0), 'staged-rollout PR-head transcript/dependency/coverage boundary is invalid or weakened')
  exactList(plan.phaseOrder, PHASE_IDS, 'staged-rollout phaseOrder')
  invariant(plan.phases.length === PHASE_IDS.length, 'staged-rollout phase count is invalid')
  for (const [index, phase] of plan.phases.entries()) {
    const id = PHASE_IDS[index]
    const policy = PHASE_POLICY[id]
    invariant(phase.id === id && phase.index === index, `staged-rollout phase ${index} identity is invalid`)
    invariant(phase.predecessor === (index === 0 ? null : PHASE_IDS[index - 1]), `staged-rollout phase ${id} predecessor is invalid`)
    invariant(phase.scope === policy.scope, `staged-rollout phase ${id} scope is invalid`)
    exactList(phase.capabilities.standard, policy.standardCapabilities, `${id} standard capabilities`)
    exactList(phase.capabilities.promotion, policy.promotionCapabilities ?? [], `${id} promotion capabilities`)
    exactList(phase.capabilities.rollback, policy.rollbackCapabilities ?? [], `${id} rollback capabilities`)
    exactList(phase.evidenceContracts.standard, policy.standardEvidence, `${id} standard evidence contracts`)
    exactList(phase.evidenceContracts.promotion, policy.promotionEvidence ?? [], `${id} promotion evidence contracts`)
    exactList(phase.evidenceContracts.rollback, policy.rollbackEvidence ?? [], `${id} rollback evidence contracts`)
    for (const contract of [...phase.evidenceContracts.standard, ...phase.evidenceContracts.promotion, ...phase.evidenceContracts.rollback]) {
      invariant(CONTRACT_ORIGINS.has(contract), `${id} references unknown evidence contract ${contract}`)
    }
    invariant(phase.mechanismRefs.every(path => !/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.test\.[^/]+$/.test(path)), `${id} uses a test-only file as a production mechanism`)
    if (id === 'candidate-freeze') {
      for (const mechanismRef of AUTHORITY_POLICY_BOOTSTRAP_MECHANISM_REFS) {
        invariant(phase.mechanismRefs.includes(mechanismRef), `candidate-freeze omits required authority-policy bootstrap mechanism reference ${mechanismRef}`)
      }
      for (const mechanismRef of EXTERNAL_LEDGER_BOOTSTRAP_MECHANISM_REFS) {
        invariant(phase.mechanismRefs.includes(mechanismRef), `candidate-freeze omits required external-ledger bootstrap mechanism reference ${mechanismRef}`)
      }
    }
    if (id === 'wm-canary') {
      for (const mechanismRef of CONSUMER_BOOTSTRAP_MECHANISM_REFS) {
        invariant(phase.mechanismRefs.includes(mechanismRef), `wm-canary omits required consumer bootstrap mechanism reference ${mechanismRef}`)
      }
    }
    if (verifyMechanisms) phase.mechanismRefs.forEach(repoPath => safeMechanismPath(repoRoot, repoPath))
  }
  return { valid: true, planSha256: stagedRolloutPlanDigest(plan), phaseCount: plan.phases.length }
}

export function loadStagedRolloutPlan(path = DEFAULT_STAGED_ROLLOUT_PLAN_PATH, options = {}) {
  const plan = readJson(resolve(path))
  validateStagedRolloutPlan(plan, options)
  return plan
}

function readUniqueJson(path, label) {
  const absolute = resolve(path)
  const info = lstatSync(absolute)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} must be a unique regular no-symlink file`)
  invariant(realpathSync(absolute) === absolute, `${label} resolves through an unsafe alias`)
  const before = readFileSync(absolute)
  let value
  try { value = JSON.parse(before.toString('utf8')) } catch (error) { throw new Error(`${label} is invalid JSON: ${error.message}`) }
  const after = readFileSync(absolute)
  invariant(before.equals(after), `${label} changed while it was being read`)
  return { absolute, bytes: before, value }
}

function canonicalGovernanceInputPaths(plan) {
  invariant(plan?.kind === 'staged-rollout-plan' && Array.isArray(plan.phases), 'canonical input binding requires a staged-rollout plan')
  return [...new Set([
    ...CANONICAL_INPUT_PATHS,
    ...plan.phases.flatMap(phase => phase.mechanismRefs),
  ])].sort(compareUtf8Bytes)
}

export function stagedRolloutCanonicalGovernanceInputPaths(plan) {
  return clone(canonicalGovernanceInputPaths(plan))
}

function canonicalInputBindings({ currentRun, freezeRun, certificationRun }, plan) {
  const governanceInputs = canonicalGovernanceInputPaths(plan).map(path => {
    const absolute = safeMechanismPath(REPOSITORY_ROOT, path)
    return { path, sha256: sha256(readFileSync(absolute)) }
  })
  invariant(currentRun?.activePath && freezeRun?.manifestPath, 'canonical active run loader did not return immutable evidence paths')
  const pointerInfo = lstatSync(currentRun.activePath)
  const manifestInfo = lstatSync(freezeRun.manifestPath)
  invariant(pointerInfo.isFile() && !pointerInfo.isSymbolicLink() && pointerInfo.nlink === 1, 'canonical active run pointer is unsafe')
  invariant(manifestInfo.isFile() && !manifestInfo.isSymbolicLink() && manifestInfo.nlink === 1, 'canonical active run manifest is unsafe')
  invariant(sha256(readFileSync(freezeRun.manifestPath)) === freezeRun.manifestSha256, 'canonical freeze manifest bytes changed after loading')
  if (certificationRun) invariant(sha256(readFileSync(certificationRun.manifestPath)) === certificationRun.manifestSha256, 'canonical certification manifest bytes changed after loading')
  return {
    schemaVersion: 1,
    kind: 'canonical-staged-rollout-bindings',
    governanceInputs,
    activeRunPointerSha256: sha256(readFileSync(currentRun.activePath)),
    runManifests: [
      { role: 'candidate-freeze', runId: freezeRun.manifest.runId, sha256: freezeRun.manifestSha256 },
      ...(certificationRun ? [{ role: 'pr-head-certification', runId: certificationRun.manifest.runId, sha256: certificationRun.manifestSha256 }] : []),
    ],
  }
}

function loadArchivedRun(currentRun, binding, label) {
  const root = realpathSync(currentRun.deepAuditRoot)
  const manifestPath = resolve(root, 'runs', binding.runId, 'run-manifest.json')
  const rel = relative(root, manifestPath)
  invariant(rel && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} manifest escapes the evidence root`)
  const info = lstatSync(manifestPath)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(manifestPath) === manifestPath, `${label} manifest is not a unique no-symlink file`)
  const bytes = readFileSync(manifestPath)
  invariant(sha256(bytes) === binding.manifestSha256, `${label} archived manifest digest mismatch`)
  let manifest
  try { manifest = JSON.parse(bytes.toString('utf8')) } catch (error) { throw new Error(`${label} archived manifest is invalid JSON: ${error.message}`) }
  validateDeepAuditRunManifest(manifest)
  validateActiveRun(binding, { manifest, manifestSha256: binding.manifestSha256 }, `${label} archived manifest`)
  return { ...currentRun, manifestPath, runRoot: dirname(manifestPath), manifest, manifestSha256: binding.manifestSha256 }
}

function loadCanonicalRuns(ledger, evidenceRoot) {
  const args = { repoRoot: REPOSITORY_ROOT, explicitRoot: evidenceRoot ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null }
  let currentRun
  try { currentRun = loadActiveDeepAuditRun({ ...args, requireCurrent: true }) }
  catch (currentError) {
    if (!ledger || ledger.receipts.length === 0) throw currentError
    currentRun = loadActiveDeepAuditRun({ ...args, requireCurrent: false })
  }
  if (!ledger) {
    try { validateDeepAuditRunProviderBindings(currentRun.manifest, { repoRoot: REPOSITORY_ROOT }) }
    catch (error) { invariant(false, `candidate-freeze provider binding is stale: ${error.message}`) }
    return { currentRun, freezeRun: currentRun, certificationRun: null }
  }
  const currentBinding = activeRunBinding(currentRun)
  const freezeRun = stableStringify(currentBinding, 0) === stableStringify(ledger.activeRun, 0)
    ? currentRun : loadArchivedRun(currentRun, ledger.activeRun, 'candidate-freeze')
  let certificationRun = null
  if (ledger.certificationRun) {
    invariant(stableStringify(currentBinding, 0) === stableStringify(ledger.certificationRun, 0), 'active pointer must identify the exact ledger PR-head certification run; a third/substituted run is forbidden')
    certificationRun = currentRun
  } else invariant(stableStringify(currentBinding, 0) === stableStringify(ledger.activeRun, 0), 'active pointer changed before PR-head certification')
  try { validateDeepAuditRunProviderBindings(freezeRun.manifest, { repoRoot: REPOSITORY_ROOT }) }
  catch (error) { invariant(false, `candidate-freeze provider binding is stale: ${error.message}`) }
  if (certificationRun) {
    try { validateDeepAuditRunProviderBindings(certificationRun.manifest, { repoRoot: REPOSITORY_ROOT }) }
    catch (error) { invariant(false, `PR-head certification provider binding is stale: ${error.message}`) }
  }
  return { currentRun, freezeRun, certificationRun }
}

export function loadCanonicalStagedRolloutRunBindings({ ledger = null, evidenceRoot = null } = {}) {
  const runs = loadCanonicalRuns(ledger, evidenceRoot)
  return {
    current: activeRunBinding(runs.currentRun),
    freeze: activeRunBinding(runs.freezeRun),
    certification: runs.certificationRun ? activeRunBinding(runs.certificationRun) : null,
  }
}

export function initializeCanonicalStagedRolloutLedger({ evidenceRoot = null } = {}) {
  const plan = loadStagedRolloutPlan(DEFAULT_STAGED_ROLLOUT_PLAN_PATH, { repoRoot: REPOSITORY_ROOT })
  const { freezeRun: activeRun } = loadCanonicalRuns(null, evidenceRoot)
  return {
    $schema: 'schemas/staged-rollout.schema.json',
    schemaVersion: 1,
    kind: 'staged-rollout-ledger',
    planSha256: stagedRolloutPlanDigest(plan),
    activeRun: activeRunBinding(activeRun),
    certificationRun: null,
    prepareVerification: null,
    releaseTrain: { candidate: null, previousGood: null },
    receipts: [],
  }
}

export function activeRunBinding(activeRun) {
  const manifest = activeRun?.manifest ?? activeRun
  const manifestSha256 = activeRun?.manifestSha256 ?? manifest?.manifestSha256
  const binding = {
    runId: manifest?.runId,
    head: manifest?.head,
    tree: manifest?.tree,
    worktreeFingerprint: manifest?.worktreeFingerprint,
    manifestSha256,
  }
  invariant(typeof binding.runId === 'string' && typeof binding.head === 'string' && typeof binding.tree === 'string', 'active run binding is incomplete')
  invariant(SHA256.test(binding.worktreeFingerprint ?? '') && SHA256.test(binding.manifestSha256 ?? ''), 'active run content address is incomplete')
  return binding
}

function validateActiveRun(expected, actual, label = 'ledger active run') {
  const binding = activeRunBinding(actual)
  invariant(stableStringify(expected, 0) === stableStringify(binding, 0), `${label} does not match the current active run HEAD/tree/worktree/manifest`)
  return binding
}

function canonicalBase64(value, label) {
  invariant(typeof value === 'string' && value.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value), `${label} is not base64`)
  const bytes = Buffer.from(value, 'base64')
  invariant(bytes.length > 0 && bytes.toString('base64') === value, `${label} is not canonical base64`)
  return bytes
}

function exactObjectKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort(compareUtf8Bytes)
  const wanted = [...expected].sort(compareUtf8Bytes)
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

export function stagedRolloutArtifact(value, { trailingNewline = true } = {}) {
  const bytes = Buffer.from(`${stableStringify(value, 0)}${trailingNewline ? '\n' : ''}`, 'utf8')
  return { encoding: 'base64', bytes: bytes.toString('base64'), sha256: sha256(bytes) }
}

function readEvidenceArtifact(reference, label) {
  invariant(reference.artifact?.encoding === 'base64', `${label} artifact encoding is invalid`)
  const bytes = canonicalBase64(reference.artifact.bytes, `${label} artifact bytes`)
  invariant(sha256(bytes) === reference.sha256, `${label} artifact bytes do not match their content address`)
  let value
  try { value = JSON.parse(bytes.toString('utf8')) }
  catch (error) { throw new Error(`${label} artifact is invalid JSON: ${error.message}`) }
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} artifact must contain a JSON object`)
  return { bytes, value }
}

function releaseRecordDigest(record) {
  return sha256(stableStringify({
    candidateRelease: record.candidateRelease,
    bomSha256: record.bom.sha256,
    verifiedReleaseEvidenceSha256: record.verifiedReleaseEvidence.sha256,
  }, 0))
}

export function stagedRolloutReleaseRecordDigest(record) {
  return releaseRecordDigest(record)
}

function validateReleaseRecord(record, label) {
  validateCandidateRelease(record.candidateRelease)
  const bomBytes = canonicalBase64(record.bom.bytes, `${label} BOM bytes`)
  invariant(sha256(bomBytes) === record.bom.sha256, `${label} BOM byte digest mismatch`)
  invariant(record.bom.sha256 === record.candidateRelease.bomSha256, `${label} BOM digest does not match candidate release`)
  let bom
  try { bom = JSON.parse(bomBytes.toString('utf8')) }
  catch (error) { throw new Error(`${label} BOM is invalid JSON: ${error.message}`) }
  validateReleaseBom(bom, { requireSbom: true })
  invariant(bom.releaseVersion === record.candidateRelease.version, `${label} BOM version mismatch`)
  invariant(bom.source.gitCommit === record.candidateRelease.sourceCommit && bom.source.gitTree === record.candidateRelease.sourceTree, `${label} BOM source commit/tree mismatch`)
  const bomPackages = bom.packages.map(item => ({ name: item.name, version: item.version, integrity: item.integrity }))
  invariant(stableStringify(bomPackages, 0) === stableStringify(record.candidateRelease.packages, 0), `${label} BOM package versions/SRI mismatch`)
  validateVerifiedReleaseEvidence(record.verifiedReleaseEvidence.value, record.candidateRelease)
  invariant(
    sha256(stableStringify(record.verifiedReleaseEvidence.value, 0)) === record.verifiedReleaseEvidence.sha256,
    `${label} verified release evidence digest mismatch`,
  )
  return { bom, digest: releaseRecordDigest(record) }
}

export function stagedRolloutPrepareVerificationDigest(verification) {
  return sha256(stableStringify(verification, 0))
}

function proofValueDigest(value) {
  return sha256(stableStringify(value, 0))
}

function exactNumberSet(actual, expected, label) {
  invariant(Array.isArray(actual) && actual.every(Number.isSafeInteger), `${label} must be an integer array`)
  const normalized = [...actual].sort((left, right) => left - right)
  invariant(new Set(normalized).size === normalized.length
    && stableStringify(normalized, 0) === stableStringify(expected, 0), `${label} differs from the frozen canonical dimension set`)
}

export function loadStagedRolloutCoverageTopology({
  repoRoot = REPOSITORY_ROOT,
  manifest = null,
  requireFrozen = false,
} = {}) {
  const root = realpathSync(resolve(repoRoot))
  const matrixPath = 'scripts/audit-coverage-matrix.mjs'
  const matrixBytes = readFileSync(safeMechanismPath(root, matrixPath))
  const entries = [...matrixBytes.toString('utf8').matchAll(/(\d+):\s*\{\s*tier:\s*'([^']+)'/g)]
    .map(match => ({ dim: Number(match[1]), tier: match[2] }))
  const expectedDims = Array.from({ length: REQUIRED_DIMENSION_COUNT }, (_, index) => index + 1)
  const observedDims = entries.map(item => item.dim).sort((left, right) => left - right)
  invariant(entries.length === REQUIRED_DIMENSION_COUNT
    && new Set(observedDims).size === REQUIRED_DIMENSION_COUNT
    && stableStringify(observedDims, 0) === stableStringify(expectedDims, 0)
    && entries.every(item => SUPPORTED_DIMENSION_TIERS.includes(item.tier)), 'staged-rollout canonical coverage matrix must enumerate dimensions 1..91 exactly once')
  const byTier = Object.fromEntries(SUPPORTED_DIMENSION_TIERS.map(tier => [tier, []]))
  for (const entry of entries) byTier[entry.tier].push(entry.dim)
  for (const values of Object.values(byTier)) values.sort((left, right) => left - right)

  const deterministicState = loadDeterministicDeepAuditPlan({ repoRoot: root })
  assertDeterministicMatrixParity(deterministicState, { repoRoot: root })
  exactNumberSet([...deterministicState.dimensionByNumber.keys()], byTier.DETERMINISTIC, 'staged-rollout deterministic plan dimensions')
  const hookState = loadHookEvidencePlan({ repoRoot: root })
  exactNumberSet(hookState.hookDimensions.map(item => item.dim), byTier['HOOK-ENFORCED'], 'staged-rollout hook plan dimensions')
  const ciState = loadCiEvidencePlan({ repoRoot: root })
  exactNumberSet([...ciState.dimensionByNumber.keys()], byTier['CI-ENFORCED'], 'staged-rollout CI plan dimensions')
  invariant(stableStringify(byTier['CI-ENFORCED'], 0) === stableStringify([64, 66], 0), 'staged-rollout post-release CI dimension set differs from 64/66')

  const frozenInputs = [
    matrixPath,
    'scripts/deep-audit-deterministic-plan.json',
    'infra/governance/hook-evidence-plan.json',
    'scripts/ci-evidence-plan.json',
  ]
  if (requireFrozen) {
    invariant(manifest && Array.isArray(manifest.inventory) && Array.isArray(manifest.rubricPaths), 'staged-rollout frozen coverage topology lacks the committed run manifest')
    for (const path of frozenInputs) {
      const row = manifest.inventory.find(item => item.path === path)
      invariant(row?.kind === 'file' && row.sha256 === sha256(readFileSync(safeMechanismPath(root, path))), `staged-rollout coverage topology is not frozen to the candidate manifest:${path}`)
      if (path !== 'scripts/ci-evidence-plan.json') invariant(manifest.rubricPaths.includes(path), `staged-rollout coverage topology is outside the frozen rubric:${path}`)
    }
  }
  return Object.freeze({
    deterministic: Object.freeze([...byTier.DETERMINISTIC]),
    pureJudgment: Object.freeze([...byTier['PURE-JUDGMENT']]),
    hookEnforced: Object.freeze([...byTier['HOOK-ENFORCED']]),
    ciEnforced: Object.freeze([...byTier['CI-ENFORCED']]),
    sourceDigests: Object.freeze({
      matrixSha256: sha256(matrixBytes),
      deterministicPlanSha256: deterministicState.planDigest,
      hookPlanSha256: hookState.digests.planSha256,
      ciPlanSha256: ciState.planDigest,
    }),
  })
}

function validateCoverageTopology(value, activeRun, label, { repoRoot = REPOSITORY_ROOT, requireFrozen = false } = {}) {
  exactObjectKeys(value.providers, ['self', 'peer'], `${label} providers`)
  const manifestProviders = activeRun.manifest.providers
  const secondOpinionWaived = activeRun.manifest.reviewSelection?.kind === 'provider-review-capability-selection-waived'
  const expectedPeer = secondOpinionWaived ? null : manifestProviders?.peer?.id
  invariant(
    typeof value.providers.self === 'string'
      && (secondOpinionWaived
        ? value.providers.peer === null
        : typeof value.providers.peer === 'string' && value.providers.self !== value.providers.peer),
    `${label} providers are invalid`,
  )
  invariant(
    value.secondOpinion === (secondOpinionWaived ? 'waived-by-user' : 'completed'),
    `${label} second-opinion disposition differs from the immutable run`,
  )
  if (manifestProviders) {
    invariant(value.providers.self === manifestProviders.self.id && value.providers.peer === expectedPeer, `${label} providers differ from the committed run`)
    invariant(activeRun.manifest.authorProvider === manifestProviders.self.id
      && (expectedPeer === null || activeRun.manifest.authorProvider !== expectedPeer), `${label} committed author provider is invalid or not independent from the peer`)
    invariant(value.authorProvider === activeRun.manifest.authorProvider, `${label} author provider differs from the committed run`)
    invariant(value.providerIdentityDigest === activeRun.manifest.providerIdentityDigest, `${label} provider identity digest differs from the committed run`)
  }
  exactObjectKeys(value.tiers, ['deterministic', 'pureJudgment', 'hookEnforced', 'ciEnforced'], `${label} tier counts`)
  const topology = loadStagedRolloutCoverageTopology({ repoRoot, manifest: activeRun.manifest, requireFrozen })
  const expectedTierCounts = {
    deterministic: topology.deterministic.length,
    pureJudgment: topology.pureJudgment.length,
    hookEnforced: topology.hookEnforced.length,
    ciEnforced: topology.ciEnforced.length,
  }
  invariant(stableStringify(value.tiers, 0) === stableStringify(expectedTierCounts, 0), `${label} tier counts differ from the frozen canonical 91-dimension topology`)
  invariant(Object.values(expectedTierCounts).reduce((sum, count) => sum + count, 0) === REQUIRED_DIMENSION_COUNT, `${label} canonical tier projection does not close all 91 dimensions`)
  invariant(Number.isSafeInteger(value.componentCount) && value.componentCount > 0, `${label} component count is invalid`)
  if (Array.isArray(activeRun.manifest.components)) invariant(value.componentCount === activeRun.manifest.components.length, `${label} component count differs from the committed run`)
  exactObjectKeys(value.gaps, ['deterministic', 'judgment', 'hookResidue', 'ciEnforced', 'componentA1b'], `${label} gaps`)
  const providerIds = [value.providers.self, value.providers.peer].filter(provider => provider !== null)
  exactObjectKeys(value.gaps.judgment, providerIds, `${label} judgment gaps`)
  exactObjectKeys(value.gaps.componentA1b, providerIds, `${label} component A1b gaps`)
  exactObjectKeys(value.unobserved, ['deterministic'], `${label} unobserved evidence`)
  invariant(Array.isArray(value.unobserved.deterministic), `${label} deterministic unobserved evidence must be an array`)
  for (const [index, item] of value.unobserved.deterministic.entries()) {
    exactObjectKeys(item, ['dim', 'capability', 'reasonCode'], `${label} deterministic unobserved evidence ${index}`)
    invariant(
      item.dim === 83
        && stableStringify(item.capability, 0) === stableStringify(deterministicCapabilitiesForDimension(
          loadDeterministicDeepAuditPlan({ repoRoot }),
          item.dim,
        ), 0)
        && item.reasonCode === NETLIFY_LIVE_UNOBSERVED_REASON,
      `${label} deterministic unobserved evidence ${index} is not the canonical credential-gated dim 83 route`,
    )
  }
  return topology
}

function validateFullCoverageProof(value, activeRun, options = {}) {
  exactObjectKeys(value, [
    'schemaVersion', 'evidenceKind', 'runId', 'manifestSha256', 'head', 'tree', 'inventoryDigest',
    'rubricDigest', 'worktreeFingerprint', 'authorProvider', 'providerIdentityDigest', 'providers', 'secondOpinion', 'tiers', 'componentCount', 'gaps',
    'totalGaps', 'coverageStatus', 'complianceStatus', 'promotionEligible', 'status',
    'findings', 'trustDowngrades', 'unobserved',
  ], 'deep-audit coverage proof')
  invariant(value.schemaVersion === 4 && value.evidenceKind === 'deep-audit-coverage-verification', 'deep-audit coverage proof identity is invalid or stale')
  const binding = activeRunBinding(activeRun)
  for (const field of ['runId', 'manifestSha256', 'head', 'tree', 'worktreeFingerprint']) invariant(value[field] === binding[field], `deep-audit coverage proof ${field} differs from the active run`)
  invariant(value.inventoryDigest === activeRun.manifest.inventoryDigest && value.rubricDigest === activeRun.manifest.rubricDigest, 'deep-audit coverage proof inventory/rubric differs from the frozen manifest')
  const topology = validateCoverageTopology(value, activeRun, 'deep-audit coverage proof', options)
  invariant(
    value.coverageStatus === 'complete'
      && value.complianceStatus === 'clean'
      && value.promotionEligible === true
      && value.status === 'complete-clean'
      && value.totalGaps === 0,
    'deep-audit coverage proof is incomplete, non-clean, or not promotion-eligible',
  )
  const gapLists = [value.gaps?.deterministic, value.gaps?.hookResidue, value.gaps?.ciEnforced]
  for (const providerGaps of [value.gaps?.judgment, value.gaps?.componentA1b]) gapLists.push(...Object.values(providerGaps ?? {}))
  invariant(gapLists.length > 3 && gapLists.every(list => Array.isArray(list) && list.length === 0), 'deep-audit coverage proof hides unresolved gaps')
  exactObjectKeys(value.findings, ['judgment', 'componentA1b', 'hookWarnings', 'hookBlocking'], 'deep-audit coverage findings')
  exactObjectKeys(value.trustDowngrades, ['untrustedDependencies', 'unverifiedContainment', 'unverifiedModelCoverage', 'unobservedDeterministicCoverage'], 'deep-audit coverage trust downgrades')
  invariant(value.trustDowngrades.unobservedDeterministicCoverage === value.unobserved.deterministic.length, 'deep-audit coverage proof unobserved evidence/trust downgrade counts differ')
  invariant(Object.values(value.findings).every(count => Number.isSafeInteger(count) && count === 0), 'deep-audit coverage proof contains compliance findings')
  invariant(Object.values(value.trustDowngrades).every(count => Number.isSafeInteger(count) && count === 0), 'deep-audit coverage proof contains trust downgrades')
  return topology
}

export function stagedRolloutCandidateTargetBinding(activeRun) {
  const manifest = activeRun?.manifest ?? activeRun
  const binding = activeRunBinding(activeRun)
  const frozenAt = canonicalDate(manifest?.createdAt, 'candidate freeze target frozenAt').toISOString()
  invariant(SHA256.test(manifest?.indexDigest ?? '') && SHA256.test(manifest?.inventoryDigest ?? ''), 'candidate freeze target lacks index/inventory content addresses')
  return {
    runId: binding.runId,
    manifestSha256: binding.manifestSha256,
    head: binding.head,
    tree: binding.tree,
    indexDigest: manifest.indexDigest,
    inventoryDigest: manifest.inventoryDigest,
    worktreeFingerprint: binding.worktreeFingerprint,
    frozenAt,
  }
}

function candidateFreezeSnapshotBinding(activeRun) {
  const target = stagedRolloutCandidateTargetBinding(activeRun)
  const { frozenAt, ...snapshot } = target
  return snapshot
}

function canonicalJsonArtifact(bytes, label) {
  let value
  try { value = JSON.parse(bytes.toString('utf8')) } catch (error) { throw new Error(`${label} is invalid JSON: ${error.message}`) }
  invariant(bytes.equals(Buffer.from(stableStringify(value, 0), 'utf8')), `${label} must be canonical JSON without whitespace or trailing data`)
  return value
}

function validateCandidateFreezeCheck(check, expected, activeRun) {
  exactObjectKeys(check, [
    'id', 'producer', 'mode', 'argv', 'entrypointSha256', 'exitCode', 'signal',
    'startedAt', 'finishedAt', 'snapshotBefore', 'snapshotAfter', 'result',
    'evidenceSha256', 'artifact',
  ], `candidate freeze check ${expected.id}`)
  invariant(check.id === expected.id && check.producer === expected.producer, `candidate freeze check ${expected.id} identity/producer is substituted`)
  invariant(check.mode === (expected.id === 'all-harness' ? 'completed-receipt-readback' : 'isolated-local-process'), `candidate freeze check ${expected.id} mode is invalid`)
  exactList(check.argv, expected.argv, `candidate freeze check ${expected.id} argv`)
  const producerRow = activeRun.manifest.inventory.find(row => row.path === expected.producer)
  invariant(producerRow?.kind === 'file' && check.entrypointSha256 === producerRow.sha256, `candidate freeze check ${expected.id} entrypoint differs from the frozen producer bytes`)
  invariant(check.exitCode === 0 && check.signal === null, `candidate freeze check ${expected.id} process/readback did not complete successfully`)
  const startedAt = canonicalDate(check.startedAt, `candidate freeze check ${expected.id} startedAt`)
  const finishedAt = canonicalDate(check.finishedAt, `candidate freeze check ${expected.id} finishedAt`)
  invariant(finishedAt >= startedAt, `candidate freeze check ${expected.id} finished before it started`)
  const expectedSnapshot = candidateFreezeSnapshotBinding(activeRun)
  invariant(stableStringify(check.snapshotBefore, 0) === stableStringify(expectedSnapshot, 0)
    && stableStringify(check.snapshotAfter, 0) === stableStringify(expectedSnapshot, 0), `candidate freeze check ${expected.id} was not executed against the exact frozen snapshot`)
  exactObjectKeys(check.artifact, ['encoding', 'bytes'], `candidate freeze check ${expected.id} artifact`)
  invariant(check.artifact.encoding === 'base64', `candidate freeze check ${expected.id} artifact encoding is invalid`)
  const bytes = canonicalArtifactBytes(check.artifact.bytes, `candidate freeze check ${expected.id} artifact bytes`)
  invariant(SHA256.test(check.evidenceSha256 ?? '') && sha256(bytes) === check.evidenceSha256, `candidate freeze check ${expected.id} artifact content address is invalid`)
  exactObjectKeys(check.result, ['schemaVersion', 'kind', 'status', 'artifactSha256', 'detail'], `candidate freeze check ${expected.id} result`)
  invariant(check.result.schemaVersion === 1 && check.result.kind === expected.resultKind && check.result.status === 'passed'
    && check.result.artifactSha256 === check.evidenceSha256, `candidate freeze check ${expected.id} result is not a typed passing result`)

  let subjectStartedAt = startedAt
  if (expected.id === 'all-harness') {
    let receipt
    try { receipt = JSON.parse(bytes.toString('utf8')) } catch (error) { throw new Error(`candidate freeze All-Harness receipt is invalid JSON: ${error.message}`) }
    validateAllHarnessReceiptEvidence(receipt, { now: finishedAt })
    subjectStartedAt = canonicalDate(receipt.startedAt, 'candidate freeze All-Harness startedAt')
    invariant(receipt.subject.head === activeRun.manifest.head && receipt.subject.tree === activeRun.manifest.tree, 'candidate freeze All-Harness receipt targets another HEAD/tree')
    exactObjectKeys(check.result.detail, [
      'receiptSha256', 'completedAt', 'expiresAt', 'registeredLocalSourceCount',
      'localSourceProjectionSha256', 'gitVisibleWorktreeDigest',
    ], 'candidate freeze All-Harness result detail')
    invariant(stableStringify(check.result.detail, 0) === stableStringify({
      receiptSha256: receipt.receiptSha256,
      completedAt: receipt.completedAt,
      expiresAt: receipt.expiresAt,
      registeredLocalSourceCount: receipt.runner.registeredLocalSourceCount,
      localSourceProjectionSha256: receipt.result.localSourceProjectionSha256,
      gitVisibleWorktreeDigest: receipt.subject.gitVisibleWorktree.digest,
    }, 0), 'candidate freeze All-Harness result differs from the exact receipt')
  } else {
    const transcript = canonicalJsonArtifact(bytes, 'candidate freeze governance build-graph transcript')
    exactObjectKeys(transcript, ['schemaVersion', 'kind', 'stdout', 'stderr'], 'candidate freeze governance build-graph transcript')
    invariant(transcript.schemaVersion === 1 && transcript.kind === 'governance-build-graph-check-transcript'
      && typeof transcript.stdout === 'string' && typeof transcript.stderr === 'string', 'candidate freeze governance build-graph transcript identity is invalid')
    const stages = [...transcript.stdout.matchAll(/^\u2192 governance build graph check:([a-z0-9-]+)$/gm)].map(match => match[1])
    exactObjectKeys(check.result.detail, ['stageIds'], 'candidate freeze governance build-graph result detail')
    exactList(stages, CANDIDATE_FREEZE_BUILD_GRAPH_STAGES, 'candidate freeze governance build-graph transcript stages')
    exactList(check.result.detail.stageIds, CANDIDATE_FREEZE_BUILD_GRAPH_STAGES, 'candidate freeze governance build-graph result stages')
  }
  return { startedAt, finishedAt, subjectStartedAt }
}

function validateCandidateFreezeProof(value, activeRun, { requireExternalArtifact = false } = {}) {
  exactObjectKeys(value, ['schemaVersion', 'kind', 'activeRun', 'inventoryDigest', 'inventory', 'gitObjectProof', 'targetFrozenAt', 'preparedAt', 'status', 'promotionEligible', 'checks'], 'candidate freeze proof')
  invariant(value.schemaVersion === 2 && value.kind === 'candidate-freeze-verification', 'candidate freeze proof identity is invalid or stale')
  validateActiveRun(value.activeRun, activeRun, 'candidate freeze active run')
  const target = stagedRolloutCandidateTargetBinding(activeRun)
  const targetFrozenAt = canonicalDate(value.targetFrozenAt, 'candidate freeze targetFrozenAt')
  invariant(
    value.targetFrozenAt === target.frozenAt,
    'candidate freeze target creation time differs from the immutable active-run manifest',
  )
  const preparedAt = canonicalDate(value.preparedAt, 'candidate freeze preparedAt')
  invariant(preparedAt >= targetFrozenAt, 'candidate freeze validation receipt predates immutable target creation')
  invariant(value.inventoryDigest === activeRun.manifest.inventoryDigest && value.status === 'frozen' && value.promotionEligible === false, 'candidate freeze proof does not bind the full frozen worktree inventory or incorrectly claims promotion eligibility')
  invariant(stableStringify(value.inventory, 0) === stableStringify(activeRun.manifest.inventory, 0), 'candidate freeze proof inventory differs from the entire tracked plus nonignored-untracked worktree')
  validateFrozenGitObjectProof(value.gitObjectProof, activeRun, { requireExternalArtifact })
  invariant(Array.isArray(value.checks) && value.checks.length === CANDIDATE_FREEZE_CHECKS.length, 'candidate freeze requires exactly the registered All-Harness and build-graph checks')
  for (const [index, expected] of CANDIDATE_FREEZE_CHECKS.entries()) {
    const check = validateCandidateFreezeCheck(value.checks[index], expected, activeRun)
    invariant(check.startedAt >= targetFrozenAt && check.subjectStartedAt >= targetFrozenAt,
      `candidate freeze check ${expected.id} started before immutable target creation`)
    invariant(check.finishedAt <= preparedAt, `candidate freeze check ${expected.id} finished after the validation receipt was prepared`)
  }
  return value
}

function validatePremergeCoverageProof(value, activeRun, options = {}) {
  exactObjectKeys(value, [
    'schemaVersion', 'evidenceKind', 'runId', 'manifestSha256', 'head', 'tree', 'inventoryDigest',
    'rubricDigest', 'worktreeFingerprint', 'authorProvider', 'providerIdentityDigest', 'providers', 'secondOpinion', 'tiers', 'componentCount', 'gaps',
    'totalGaps', 'coverageStatus', 'complianceStatus', 'promotionEligible', 'status',
    'findings', 'trustDowngrades', 'unobserved',
  ], 'PR-head certification coverage proof')
  invariant(value.schemaVersion === 4 && value.evidenceKind === 'deep-audit-coverage-verification', 'PR-head certification coverage identity is invalid')
  const binding = activeRunBinding(activeRun)
  for (const field of ['runId', 'manifestSha256', 'head', 'tree', 'worktreeFingerprint']) invariant(value[field] === binding[field], `PR-head certification coverage ${field} differs from the committed active run`)
  invariant(value.inventoryDigest === activeRun.manifest.inventoryDigest && value.rubricDigest === activeRun.manifest.rubricDigest, 'PR-head certification inventory/rubric differs from the committed active run')
  const topology = validateCoverageTopology(value, activeRun, 'PR-head certification coverage', options)
  invariant(value.coverageStatus === 'incomplete' && value.complianceStatus === 'clean' && value.promotionEligible === false && value.status === 'incomplete' && value.totalGaps === 2, 'PR-head certification must be clean with only the typed post-release gap set pending')
  const emptyLists = [value.gaps?.deterministic, value.gaps?.hookResidue, ...Object.values(value.gaps?.judgment ?? {}), ...Object.values(value.gaps?.componentA1b ?? {})]
  invariant(emptyLists.length > 3 && emptyLists.every(list => Array.isArray(list) && list.length === 0), 'PR-head certification has unexpected pre-merge gaps')
  invariant(stableStringify(value.gaps?.ciEnforced, 0) === stableStringify(topology.ciEnforced, 0), 'PR-head certification pending CI dimensions must be exactly post-release dims 64 and 66 from the frozen set')
  exactObjectKeys(value.findings, ['judgment', 'componentA1b', 'hookWarnings', 'hookBlocking'], 'PR-head certification findings')
  exactObjectKeys(value.trustDowngrades, ['untrustedDependencies', 'unverifiedContainment', 'unverifiedModelCoverage', 'unobservedDeterministicCoverage'], 'PR-head certification trust downgrades')
  invariant(value.trustDowngrades.unobservedDeterministicCoverage === value.unobserved.deterministic.length, 'PR-head certification unobserved evidence/trust downgrade counts differ')
  invariant(Object.values(value.findings).every(count => count === 0) && Object.values(value.trustDowngrades).every(count => count === 0), 'PR-head certification contains findings or trust downgrades')
  return topology
}

function validateDependencyProof(value, activeRun) {
  exactObjectKeys(value, [
    'schemaVersion', 'kind', 'activeRun', 'status', 'materialization', 'lockfileSha256',
    'installedDependencyIdentityDigest', 'registryIntegrityDigest', 'installTranscriptSha256', 'cleanup',
  ], 'frozen dependency trust proof')
  invariant(value.schemaVersion === 1 && value.kind === 'frozen-dependency-trust', 'frozen dependency trust proof identity is invalid')
  validateActiveRun(value.activeRun, activeRun, 'frozen dependency proof active run')
  invariant(value.status === 'trusted' && value.materialization === 'clean-npm-ci-from-frozen-lockfile', 'dependency proof is not a trusted clean install')
  const lockfile = activeRun.manifest.inventory.find(item => item.path === 'package-lock.json' && item.kind === 'file')
  invariant(lockfile && value.lockfileSha256 === lockfile.sha256, 'dependency proof lockfile differs from the frozen manifest')
  for (const field of ['installedDependencyIdentityDigest', 'registryIntegrityDigest', 'installTranscriptSha256']) invariant(SHA256.test(value[field] ?? ''), `dependency proof ${field} is invalid`)
  invariant(value.cleanup === true, 'dependency proof sandbox cleanup is incomplete')
  return value
}

const PREMERGE_EVIDENCE_KINDS = Object.freeze([
  'deep-audit-deterministic',
  'deep-audit-hook-residue',
  'deep-audit-judgment',
  'deep-audit-component-a1b',
])

function managedCiIndexUnsigned(value) {
  const unsigned = clone(value)
  delete unsigned.indexSha256
  return unsigned
}

export function stagedRolloutManagedCiIndexDigest(value) {
  return proofValueDigest(managedCiIndexUnsigned(value))
}

export function validateStagedCandidateManagedCiTrust(candidateState, observed) {
  invariant(candidateState?.active === true && candidateState.activationTrustBundle?.lockCurrent === true, 'PR-head candidate managed CI control plane is not atomically active/current')
  invariant(observed && typeof observed === 'object' && !Array.isArray(observed), 'PR-head candidate managed CI lacks signed activation readback')
  for (const key of [
    'finalizationRequestDigest',
    'finalizationRawReceiptSetDigest',
    'finalizationReceiptSetDigest',
    'finalizationTransportReadbackDigest',
  ]) invariant(SHA256.test(observed[key] ?? ''), `PR-head candidate managed CI ${key} is invalid`)
  const projection = managedCiActivationTrustProjection(candidateState)
  exactObjectKeys(observed.activationTrustFileDigests, Object.keys(projection.fileDigests), 'PR-head candidate activation trust file digests')
  invariant(stableStringify(observed.activationTrustFileDigests, 0) === stableStringify(projection.fileDigests, 0), 'PR-head candidate changed an activated trust-file byte or file set')
  invariant(observed.planDigest === candidateState.planDigest
    && observed.planSchemaDigest === candidateState.schemaDigest
    && observed.workflowIdentityDigest === candidateState.workflow.workflowIdentityDigest
    && observed.trustProfileDigest === candidateState.trust.digest
    && observed.activationTrustBundleDigest === projection.bindingDigest
    && observed.governanceManifestDigest === projection.manifest.sha256
    && observed.controlPlaneLockDigest === projection.controlPlaneLock.sha256
    && observed.controlPlaneContractDigest === projection.controlPlaneLock.contractDigest
    && observed.controlPlaneInputDigest === projection.controlPlaneLock.inputDigest
    && observed.controlPlaneSnapshotDigest === projection.controlPlaneLock.snapshotDigest
    && observed.controlPlaneManifestId === projection.controlPlaneLock.manifestId, 'PR-head candidate changed the signed managed CI plan/schema/workflow/trust/control-plane bundle')
  const brokerPolicyDigests = Object.fromEntries(['model-broker', 'github-observer'].map(id => [id, candidateState.classes.get(id)?.oidcBrokerPolicyDigest]))
  invariant(stableStringify(observed.secretBrokerPolicyDigests, 0) === stableStringify(brokerPolicyDigests, 0), 'PR-head candidate changed the canonical OIDC secret-broker policy')
  const executionClasses = MANAGED_CI_EXECUTION_CLASSES
  const candidateBoundary = candidateState.trustedAuthority?.policy?.candidateBoundary
  invariant(stableStringify(candidateBoundary?.jobs, 0) === stableStringify(executionClasses, 0)
    && candidateBoundary.idTokenPermission === 'none'
    && candidateBoundary.environment === null
    && candidateBoundary.executesCandidateCode === true
    && candidateBoundary.credentials === 'none-secretless-egress-proxy-only'
    && candidateBoundary.processBoundary?.procMode === 'private-hidepid2'
    && candidateBoundary.processBoundary?.hostPid === false
    && candidateBoundary.processBoundary?.parentEnvironmentReadable === false
    && ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'receipt-signer-binary', 'secret-broker-binary', 'secret-broker-credential', 'sandbox-daemon-socket', 'container-engine-socket', 'host-parent-proc'].every(item => candidateBoundary.prohibitedExposures?.includes(item)), 'PR-head candidate changed the secretless/tokenless candidate execution boundary')
  exactObjectKeys(observed.executionClassImageSupplyChainBindings, executionClasses, 'PR-head candidate image supply-chain bindings')
  exactObjectKeys(observed.executionClassHostSandboxReadbacks, executionClasses, 'PR-head candidate host-sandbox readbacks')
  exactObjectKeys(observed.executionClassFrozenSubjectReadbacks, executionClasses, 'PR-head candidate frozen-subject readbacks')
  exactObjectKeys(observed.executionClassRawReceiptValidationReadbacks, executionClasses, 'PR-head candidate raw-receipt validation readbacks')
  exactObjectKeys(observed.executionClassRawReceiptValidationDigests, executionClasses, 'PR-head candidate raw-receipt validation digests')
  exactObjectKeys(observed.executionClassEvidenceEnvelopeDigests, executionClasses, 'PR-head candidate evidence-envelope digests')
  exactObjectKeys(observed.executionClassGeneratedOutputClosureDigests, executionClasses, 'PR-head candidate generated-output closure digests')
  exactObjectKeys(observed.executionClassReceiptSigningPayloads, executionClasses, 'PR-head candidate finalized receipt signing payloads')
  exactObjectKeys(observed.executionClassSignerAuditEvents, executionClasses, 'PR-head candidate signer audit events')
  let expectedFrozenSubject
  try {
    const frozen = observed.frozenSubjectArtifactBinding
    expectedFrozenSubject = managedCiExpectedFrozenSubjectArtifactBinding(candidateState, {
      ...frozen,
      subjectCommit: frozen?.sourceCommit,
      subjectTree: frozen?.sourceTree,
    })
  } catch (error) {
    invariant(false, `PR-head candidate frozen-subject authority binding is invalid: ${error.message}`)
  }
  invariant(stableStringify(observed.frozenSubjectArtifactBinding, 0) === stableStringify(expectedFrozenSubject, 0), 'PR-head candidate changed the authority-frozen subject artifact/manifest/lineage')
  let provenance
  try {
    provenance = managedCiProvenanceBinding(candidateState, {
      workflowDefinitionRef: observed.workflowDefinitionRef,
      workflowDefinitionCommit: observed.workflowDefinitionCommit,
      workflowDefinitionTree: observed.workflowDefinitionTree,
      workflowRunId: observed.workflowRunId,
      runAttempt: observed.runAttempt,
      subjectCommit: observed.auditedSubjectCommit,
      subjectTree: observed.auditedSubjectTree,
      manifestSha256: observed.auditedManifestSha256,
      subjectRunId: observed.auditedSubjectRunId,
      frozenSubject: observed.frozenSubjectArtifactBinding,
    })
  } catch (error) {
    invariant(false, `PR-head candidate protected-main/audited-subject provenance is invalid: ${error.message}`)
  }
  invariant(observed.workflowDefinitionProtectedMain === true
    && observed.provenanceBindingDigest === provenance.provenanceBindingDigest,
  'PR-head candidate changed the protected-main workflow or audited-subject provenance binding')
  for (const executionClass of executionClasses) {
    const classState = candidateState.classes.get(executionClass)
    invariant(classState?.executionClass?.permissions?.['id-token'] === 'none', `PR-head candidate ${executionClass} can mint an OIDC token`)
    const expectedImage = managedCiExpectedImageSupplyChainBinding(candidateState, executionClass)
    const expectedHostPolicy = managedCiExpectedHostSandboxPolicyBinding(candidateState, executionClass)
    const host = observed.executionClassHostSandboxReadbacks[executionClass]
    const frozenReadback = observed.executionClassFrozenSubjectReadbacks[executionClass]
    const signerEvent = observed.executionClassSignerAuditEvents[executionClass]
    invariant(stableStringify(observed.executionClassImageSupplyChainBindings[executionClass], 0) === stableStringify(expectedImage, 0), `PR-head candidate changed ${executionClass} image source/build/SBOM/SLSA/signature binding`)
    invariant(host?.executionClass === executionClass
      && host.workflowRunId === observed.workflowRunId
      && host.runAttempt === observed.runAttempt
      && stableStringify(host.policyBinding, 0) === stableStringify(expectedHostPolicy, 0), `PR-head candidate changed ${executionClass} independent host-sandbox policy/run binding`)
    let expectedFrozenReadback
    try {
      expectedFrozenReadback = managedCiExpectedFrozenSubjectClassReadback(candidateState, {
        executionClass,
        frozenSubject: observed.frozenSubjectArtifactBinding,
        recomputedArtifactSha256: frozenReadback?.recomputedArtifactSha256,
        recomputedManifestBytesSha256: frozenReadback?.recomputedManifestBytesSha256,
        downloadedAt: frozenReadback?.downloadedAt,
        hostObservationReceiptDigest: frozenReadback?.hostObservationReceiptDigest,
      })
    } catch (error) {
      invariant(false, `PR-head candidate ${executionClass} frozen-subject readback is invalid: ${error.message}`)
    }
    invariant(stableStringify(frozenReadback, 0) === stableStringify(expectedFrozenReadback, 0)
      && frozenReadback.hostObservationReceiptDigest === host.receiptDigest, `PR-head candidate ${executionClass} substituted the authority-frozen artifact or manifest bytes`)
    exactObjectKeys(signerEvent, [
      'eventId', 'tenantId', 'keyIdentity', 'policyDigest', 'payloadDigest', 'signature',
      'workflowRunId', 'runAttempt', 'environment', 'signedAt', 'executionClass',
      'rawReceiptDigest', 'signerAuthorityBindingDigest', 'issuerMappingDigest',
    ], `PR-head candidate ${executionClass} signer audit event`)
    invariant(signerEvent.executionClass === executionClass
      && signerEvent.workflowRunId === observed.workflowRunId
      && signerEvent.runAttempt === observed.runAttempt
      && signerEvent.rawReceiptDigest === observed.executionClassReceiptDigests[executionClass], `PR-head candidate ${executionClass} signer audit event is detached from the signed run/receipt`)
  }
  const expectedSigner = managedCiExpectedReceiptSignerAuthorityBinding(candidateState)
  invariant(stableStringify(observed.receiptSignerAuthorityBinding, 0) === stableStringify(expectedSigner, 0)
    && observed.receiptSignerIssuerMapping?.issuerRegistryDigest === observed.issuerRegistryDigest
    && observed.receiptSignerIssuerMapping?.issuerRole === expectedSigner.issuerRole
    && observed.receiptSignerIssuerMapping?.keyIdentity === expectedSigner.keyIdentity
    && observed.receiptSignerIssuerMapping?.certificateIdentity === expectedSigner.certificateIdentity
    && observed.receiptSignerIssuerMapping?.issuerSubject === expectedSigner.certificateIdentity, 'PR-head candidate changed the external receipt signer authority or issuer-registry mapping')
  const signerAuthorityBindingDigest = expectedSigner.bindingDigest
  const signerIssuerMappingDigest = sha256(stableStringify(observed.receiptSignerIssuerMapping, 0))
  invariant(executionClasses.every(executionClass => {
    const event = observed.executionClassSignerAuditEvents[executionClass]
    return event.tenantId === expectedSigner.tenantId
      && event.keyIdentity === expectedSigner.keyIdentity
      && event.policyDigest === expectedSigner.receiptSignerPolicyDigest
      && event.environment === expectedSigner.allowedEnvironment
      && event.signerAuthorityBindingDigest === signerAuthorityBindingDigest
      && event.issuerMappingDigest === signerIssuerMappingDigest
  }), 'PR-head candidate changed the external signer audit authority/policy/issuer binding')
  let expectedModelRelease
  try { expectedModelRelease = managedCiExpectedModelReleaseAuthorityBinding(candidateState, observed.modelReleaseAuthorityBinding) } catch (error) {
    invariant(false, `PR-head candidate model release authority binding is invalid: ${error.message}`)
  }
  invariant(stableStringify(observed.modelReleaseAuthorityBinding, 0) === stableStringify(expectedModelRelease.binding, 0), 'PR-head candidate changed the exact four-document model release identity/revocation/audit/invocation authority')
  const signerEventIds = new Set()
  let latestSignedAt = null
  for (const executionClass of executionClasses) {
    const payload = observed.executionClassReceiptSigningPayloads[executionClass]
    const rawReceiptValidationReadback = observed.executionClassRawReceiptValidationReadbacks[executionClass]
    const event = observed.executionClassSignerAuditEvents[executionClass]
    exactObjectKeys(payload, [
      'schemaVersion', 'kind', 'executionClass', 'evidenceKind', 'workflowRunId', 'runAttempt',
      'rawReceiptDigest', 'rawReceiptSchemaDigest', 'rawReceiptValidationDigest',
      'provenanceBindingDigest', 'receiptBindingDigest',
      'frozenSubjectReadbackDigest', 'hostObservationReceiptDigest', 'imageSupplyChainBindingDigest',
      'signerAuthorityBindingDigest', 'issuerMappingDigest', 'signedAt',
    ], `PR-head candidate ${executionClass} finalized receipt signing payload`)
    let expectedPayload
    let expectedEvent
    try {
      const selectedProvider = executionClass === 'model-broker'
        ? observed.modelReleaseAuthorityBinding.modelReleaseId.split('/', 1)[0]
        : null
      const modelRelease = executionClass === 'model-broker' ? observed.modelReleaseAuthorityBinding : null
      const receiptBinding = managedCiExpectedReceiptBinding(candidateState, {
        evidenceKind: payload.evidenceKind,
        selectedProvider,
        modelRelease,
      })
      expectedPayload = managedCiVerifyReceiptSigningPayloadProjection(candidateState, {
        receiptSigningPayload: payload,
        rawReceiptValidationReadback,
        evidenceKind: payload.evidenceKind,
        workflowRunId: observed.workflowRunId,
        runAttempt: observed.runAttempt,
        provenanceBinding: provenance,
        receiptBinding,
        frozenSubjectReadback: observed.executionClassFrozenSubjectReadbacks[executionClass],
        hostObservation: observed.executionClassHostSandboxReadbacks[executionClass],
        imageSupplyChainBinding: observed.executionClassImageSupplyChainBindings[executionClass],
        issuerMapping: observed.receiptSignerIssuerMapping,
        rawReceiptProjection: {
          evidenceEnvelopeDigest: observed.executionClassEvidenceEnvelopeDigests[executionClass],
          oidcClaimsDigest: observed.executionClassOidcClaimsDigests[executionClass],
          generatedOutputClosureDigest: observed.executionClassGeneratedOutputClosureDigests[executionClass],
        },
        signedAt: payload.signedAt,
        selectedProvider,
        modelRelease,
      })
      expectedEvent = managedCiSignerAuditEvent(candidateState, {
        eventId: event.eventId,
        signature: event.signature,
        receiptSigningPayload: expectedPayload,
        issuerMapping: observed.receiptSignerIssuerMapping,
      })
    } catch (error) {
      invariant(false, `PR-head candidate ${executionClass} finalized receipt/signature/audit readback is invalid: ${error.message}`)
    }
    invariant(stableStringify(payload, 0) === stableStringify(expectedPayload, 0), `PR-head candidate ${executionClass} signer payload is detached from raw receipt/schema/provenance/class/image/freeze/host/model authority`)
    invariant(rawReceiptValidationReadback.rawReceiptDigest === observed.executionClassReceiptDigests[executionClass]
      && rawReceiptValidationReadback.evidenceEnvelopeDigest === observed.executionClassEvidenceEnvelopeDigests[executionClass]
      && rawReceiptValidationReadback.oidcClaimsDigest === observed.executionClassOidcClaimsDigests[executionClass]
      && rawReceiptValidationReadback.generatedOutputClosureDigest === observed.executionClassGeneratedOutputClosureDigests[executionClass]
      && payload.rawReceiptValidationDigest === sha256(stableStringify(rawReceiptValidationReadback, 0))
      && payload.rawReceiptValidationDigest === observed.executionClassRawReceiptValidationDigests?.[executionClass],
    `PR-head candidate ${executionClass} raw receipt validation readback is detached from bytes/signer payload`)
    invariant(stableStringify(event, 0) === stableStringify(expectedEvent, 0), `PR-head candidate ${executionClass} signer audit event/signature is detached from the canonical finalized receipt payload`)
    invariant(!signerEventIds.has(event.eventId), `PR-head candidate signer audit event id is replayed:${event.eventId}`)
    signerEventIds.add(event.eventId)
    const signedAt = new Date(event.signedAt)
    if (latestSignedAt === null || signedAt > latestSignedAt) latestSignedAt = signedAt
  }
  const finalizedReceiptSet = {
    schemaVersion: 1,
    kind: 'managed-ci-finalized-receipt-set-v1',
    requestSha256: observed.finalizationRequestDigest,
    workflowRunId: observed.workflowRunId,
    runAttempt: observed.runAttempt,
    rawReceiptSetDigest: observed.finalizationRawReceiptSetDigest,
    signerIssuerMapping: observed.receiptSignerIssuerMapping,
    receipts: Object.fromEntries(executionClasses.map(executionClass => [executionClass, {
      rawReceiptPath: `${executionClass}.json`,
      rawReceiptDigest: observed.executionClassReceiptDigests[executionClass],
      rawReceiptValidationReadback: observed.executionClassRawReceiptValidationReadbacks[executionClass],
      receiptSigningPayload: observed.executionClassReceiptSigningPayloads[executionClass],
      signerAuditEvent: observed.executionClassSignerAuditEvents[executionClass],
    }])),
    setDigest: observed.finalizationReceiptSetDigest,
  }
  let reconstructedReceiptSetDigest
  let transportReadbackDigest
  try {
    reconstructedReceiptSetDigest = managedCiFinalizedReceiptSetDigest(finalizedReceiptSet)
    transportReadbackDigest = managedCiFinalizationTransportReadbackDigest(observed.finalizationTransportReadback)
    managedCiValidateFinalizationTransportReadback(
      candidateState,
      observed.finalizationTransportReadback,
      {
        requestSha256: observed.finalizationRequestDigest,
        finalizedReceiptSetDigest: observed.finalizationReceiptSetDigest,
        latestSignedAt: latestSignedAt?.toISOString(),
        signerIssuerMapping: observed.receiptSignerIssuerMapping,
      },
    )
  } catch (error) {
    invariant(false, `PR-head candidate finalization request/set/transport closure is invalid: ${error.message}`)
  }
  invariant(reconstructedReceiptSetDigest === observed.finalizationReceiptSetDigest,
    'PR-head candidate finalized receipt set digest is detached from the exact request/raw receipts/signer closure')
  invariant(transportReadbackDigest === observed.finalizationTransportReadbackDigest,
    'PR-head candidate finalization transport readback digest is detached from the exact TLS/mTLS authority readback')
  return true
}

function validateManagedCiActivationClosure(value, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} is missing`)
  for (const key of MANAGED_CI_ACTIVATION_CLOSURE_SCALAR_KEYS) {
    invariant(SHA256.test(value[key] ?? ''), `${label}.${key} is invalid`)
  }
  for (const key of MANAGED_CI_ACTIVATION_CLOSURE_MAP_KEYS) {
    exactObjectKeys(value[key], MANAGED_CI_EXECUTION_CLASSES, `${label}.${key}`)
    invariant(Object.values(value[key]).every(digest => SHA256.test(digest ?? '')), `${label}.${key} contains an invalid digest`)
  }
  return Object.fromEntries(MANAGED_CI_ACTIVATION_CLOSURE_KEYS.map(key => [key, value[key]]))
}

function validateManagedCiBootstrapReadback(value, {
  activation,
  activeRun,
  candidateFreezeReceipt,
  prepareVerification,
  deploymentProfileId = MAXIMUM_ASSURANCE_PROFILE_ID,
}) {
  exactObjectKeys(value, [
    'schemaVersion', 'kind', 'requirementId', 'repository', 'workflowPath', 'workflowRef',
    'controlPlaneCommit', 'controlPlaneTree', 'workflowIdentityDigest', 'workflowRunId', 'runAttempt',
    'activationEvidenceSha256', 'protectedMainMergedAt', 'activationObservedAt', 'releaseMutationsObserved',
    'candidateSelfCertificationAllowed', 'executionClassReceiptDigests', ...MANAGED_CI_ACTIVATION_CLOSURE_KEYS,
  ], 'managed CI two-PR bootstrap readback')
  invariant(value.schemaVersion === 1 && value.kind === 'managed-ci-two-pr-bootstrap-readback', 'managed CI bootstrap readback identity is invalid')
  invariant(value.requirementId === 'activate-managed-ci-trusted-execution'
    && value.repository === 'ajenchen/design-system'
    && value.workflowPath === '.github/workflows/deep-audit-managed.yml'
    && value.workflowRef === 'refs/heads/main', 'managed CI bootstrap readback workflow identity is invalid')
  invariant(/^[a-f0-9]{40}$/.test(value.controlPlaneCommit ?? '')
    && /^[a-f0-9]{40}$/.test(value.controlPlaneTree ?? '')
    && SHA256.test(value.workflowIdentityDigest ?? '')
    && /^[1-9][0-9]*$/.test(value.workflowRunId ?? '')
    && Number.isSafeInteger(value.runAttempt) && value.runAttempt >= 1, 'managed CI bootstrap readback source/run identity is invalid')
  invariant(value.releaseMutationsObserved === false && value.candidateSelfCertificationAllowed === false, 'managed CI bootstrap PR gained release authority or permits candidate self-certification')
  exactObjectKeys(value.executionClassReceiptDigests, MANAGED_CI_EXECUTION_CLASSES, 'managed CI bootstrap execution-class receipt digests')
  invariant(Object.values(value.executionClassReceiptDigests).every(digest => SHA256.test(digest)), 'managed CI bootstrap execution-class receipt digest is invalid')
  const bootstrapClosure = validateManagedCiActivationClosure(value, 'managed CI bootstrap activation closure')
  invariant(candidateFreezeReceipt, 'managed CI bootstrap readback lacks the candidate-freeze predecessor')
  invariant(prepareVerification?.bootstrapPrerequisite, 'managed CI bootstrap readback lacks the closed candidate-freeze bootstrap prerequisite')
  const preparedAt = canonicalDate(prepareVerification.preparedAt, 'candidate-freeze preparedAt')
  const mergedAt = canonicalDate(value.protectedMainMergedAt, 'managed CI bootstrap protectedMainMergedAt')
  const activatedAt = canonicalDate(value.activationObservedAt, 'managed CI bootstrap activationObservedAt')
  invariant(mergedAt <= activatedAt, 'managed CI control plane activation predates its protected-main merge')
  invariant(
    canonicalDate(candidateFreezeReceipt.observedAt, 'candidate-freeze receipt observedAt').getTime() === preparedAt.getTime(),
    'candidate-freeze receipt observation differs from the actual prepared freeze',
  )
  if (deploymentProfileId === PRODUCTION_GRADE_PROFILE_ID) {
    invariant(
      activatedAt > preparedAt,
      'production-grade managed CI control plane activation must follow the immutable candidate freeze',
    )
  } else {
    invariant(activatedAt < preparedAt, 'managed CI control plane was not activated before the prepared candidate freeze')
    const managedCiPrerequisite = prepareVerification.bootstrapPrerequisite.releaseActivations
      .find(item => item.id === 'activate-managed-ci-trusted-execution')
    invariant(managedCiPrerequisite
      && managedCiPrerequisite.kind === 'managed-ci-attestation'
      && managedCiPrerequisite.observedAt === value.activationObservedAt
      && managedCiPrerequisite.evidenceSha256 === value.activationEvidenceSha256,
    'managed CI bootstrap readback differs from the signed candidate-freeze prerequisite')
  }
  const requirement = activation?.requirements?.find(item => item.id === value.requirementId)
  invariant(requirement?.kind === 'managed-ci-attestation' && requirement.status === 'activated' && requirement.evidence, 'managed CI bootstrap activation requirement is null or not activated')
  const observed = requirement.evidence.payload?.observedResource
  invariant(requirement.evidence.sha256 === value.activationEvidenceSha256
    && requirement.observedAt === value.activationObservedAt
    && observed?.workflowRepository === value.repository
    && observed?.workflowPath === value.workflowPath
    && observed?.workflowRef === value.workflowRef
    && observed?.workflowDefinitionCommit === value.controlPlaneCommit
    && observed?.workflowDefinitionTree === value.controlPlaneTree
    && observed?.workflowIdentityDigest === value.workflowIdentityDigest
    && observed?.workflowRunId === value.workflowRunId
    && observed?.runAttempt === value.runAttempt
    && observed?.bootstrapMode === 'protected-main-control-plane-only'
    && observed?.protectedMainMergedAt === value.protectedMainMergedAt
    && observed?.releaseMutationsObserved === false
    && observed?.candidateSelfCertificationAllowed === false, 'managed CI bootstrap readback is detached from the signed activation evidence')
  invariant(stableStringify(observed?.executionClassReceiptDigests, 0) === stableStringify(value.executionClassReceiptDigests, 0), 'managed CI bootstrap execution-class receipts differ from signed activation evidence')
  const observedClosure = validateManagedCiActivationClosure(observed, 'signed managed CI activation closure')
  invariant(stableStringify(observedClosure, 0) === stableStringify(bootstrapClosure, 0), 'managed CI bootstrap image/freeze/host/signer/model/receipt closure differs from signed activation evidence')
  invariant(activeRun?.manifest, 'managed CI bootstrap validation lacks the re-frozen candidate run')
  return value
}

function expectedPremergeArtifactPath(item) {
  if (item.evidenceKind === 'deep-audit-deterministic') return `deterministic/dim-${item.dimension}.json`
  if (item.evidenceKind === 'deep-audit-hook-residue') return `hook-residue/dim-${item.dimension}.json`
  if (item.evidenceKind === 'deep-audit-judgment') return `judgment/${item.providerId}/dim-${item.dimension}.json`
  if (item.evidenceKind === 'deep-audit-component-a1b') return `component-a1b/${item.providerId}/${item.component}.json`
  throw new Error(`unsupported PR-head managed CI evidence kind ${item.evidenceKind}`)
}

function collectManagedReceiptBindings(value, output = []) {
  if (!value || typeof value !== 'object') return output
  if (!Array.isArray(value)
    && value.workflow && typeof value.workflow === 'object' && !Array.isArray(value.workflow)
    && typeof value.workflowIdentityDigest === 'string'
    && typeof value.executionClass === 'string'
    && typeof value.evidenceKind === 'string') output.push(value)
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectManagedReceiptBindings(child, output)
  return output
}

function premergeArtifactIdentity(item) {
  return stableStringify([item.evidenceKind, item.providerId, item.dimension, item.component, item.path], 0)
}

function expectedPremergeArtifactIdentities({ topology, providers, components }) {
  const expected = []
  for (const dimension of topology.deterministic) expected.push({ evidenceKind: 'deep-audit-deterministic', providerId: null, dimension, component: null, path: `deterministic/dim-${dimension}.json` })
  for (const dimension of topology.hookEnforced) expected.push({ evidenceKind: 'deep-audit-hook-residue', providerId: null, dimension, component: null, path: `hook-residue/dim-${dimension}.json` })
  for (const providerId of providers) {
    for (const dimension of topology.pureJudgment) expected.push({ evidenceKind: 'deep-audit-judgment', providerId, dimension, component: null, path: `judgment/${providerId}/dim-${dimension}.json` })
    for (const component of components) expected.push({ evidenceKind: 'deep-audit-component-a1b', providerId, dimension: null, component, path: `component-a1b/${providerId}/${component}.json` })
  }
  return expected.map(premergeArtifactIdentity).sort(compareUtf8Bytes)
}

function canonicalRunArtifact(root, relativePath, label) {
  invariant(typeof relativePath === 'string' && relativePath.length > 0 && !isAbsolute(relativePath)
    && !relativePath.split('/').some(segment => !segment || segment === '.' || segment === '..'), `${label} path is unsafe:${String(relativePath)}`)
  const absolute = resolve(root, relativePath)
  const rel = relative(root, absolute)
  invariant(rel === relativePath && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes the committed run:${relativePath}`)
  const info = lstatSync(absolute)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(absolute) === absolute, `${label} is not a unique no-symlink file:${relativePath}`)
  return readFileSync(absolute)
}

function discoveredTranscriptArtifacts(root) {
  const paths = []
  const visit = (directory, relativeDirectory = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const absolute = resolve(directory, entry.name)
      invariant(!entry.isSymbolicLink() && realpathSync(absolute) === absolute, `PR-head committed run contains an aliased transcript path:${relativePath}`)
      if (entry.isDirectory()) visit(absolute, relativePath)
      else if (relativePath.split('/').includes('_transcripts')) {
        invariant(entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name), `PR-head committed run contains a malformed model transcript artifact:${relativePath}`)
        paths.push(relativePath)
      }
    }
  }
  visit(root)
  return paths.sort(compareUtf8Bytes)
}

function brokerEvidenceProjection(rows, modelArtifacts) {
  invariant(rows.length > 0, 'PR-head broker evidence lacks model transcript artifacts')
  const brokerPlans = new Set(rows.map(row => row.brokerPlanDigest))
  const invocationRegistries = new Set(rows.map(row => row.invocationRegistryDigest))
  invariant(brokerPlans.size === 1 && invocationRegistries.size === 1, 'PR-head model transcripts mix broker plans or invocation registries')
  const modelIdentityIndex = rows.map(row => ({
    providerId: row.providerId,
    requestModelId: row.requestModelId,
    observedResponseModelId: row.observedResponseModelId,
    modelIdentityPolicyDigest: row.modelIdentityPolicyDigest,
  }))
  const modelReleaseIndex = rows.map(row => ({
    providerId: row.providerId,
    modelReleaseId: row.modelReleaseId,
    modelReleaseBindingDigest: row.modelReleaseBindingDigest,
    modelReleaseRegistryDigest: row.modelReleaseRegistryDigest,
  }))
  const modelAuthorityIndex = rows.map(row => ({
    providerId: row.providerId,
    modelReleaseAuthorityBindingDigest: row.modelReleaseAuthorityBindingDigest,
    effectivePromotionBindingDigest: row.effectivePromotionBindingDigest,
    modelReleaseValidFrom: row.modelReleaseValidFrom,
    modelReleaseValidUntil: row.modelReleaseValidUntil,
    providerInvocationWindow: row.providerInvocationWindow,
    exchangeInvocationObservations: row.exchangeInvocationObservations,
    modelAuthorityReceiptDigest: row.modelAuthorityReceiptDigest,
    modelAuthorityReadbackDigest: row.modelAuthorityReadbackDigest,
    modelAuthorityRevocationRegistryDigest: row.modelAuthorityRevocationRegistryDigest,
    modelAuthorityRevocationReadbackDigest: row.modelAuthorityRevocationReadbackDigest,
    modelAuthorityAuditReadbackDigest: row.modelAuthorityAuditReadbackDigest,
    modelAuthorityReplayLedgerReceiptDigest: row.modelAuthorityReplayLedgerReceiptDigest,
    providerInvocationWindowDigest: row.providerInvocationWindowDigest,
    exchangeInvocationObservationsDigest: row.exchangeInvocationObservationsDigest,
    modelAuthorityPolicyDigest: row.modelAuthorityPolicyDigest,
    modelAuthorityBindingSchemaDigest: row.modelAuthorityBindingSchemaDigest,
    modelAuthorityIssuerRegistryDigest: row.modelAuthorityIssuerRegistryDigest,
  }))
  return {
    brokerPlanDigest: rows[0].brokerPlanDigest,
    invocationProfileRegistryDigest: rows[0].invocationRegistryDigest,
    modelIdentityIndexDigest: proofValueDigest(modelIdentityIndex),
    modelReleaseIndexDigest: proofValueDigest(modelReleaseIndex),
    modelAuthorityIndexDigest: proofValueDigest(modelAuthorityIndex),
    promptIndexDigest: proofValueDigest(rows.map(row => row.shardSetDigest)),
    resultIndexDigest: proofValueDigest(rows.map(row => row.shardResultDigest)),
    dependencySourceInventoryDigest: proofValueDigest(rows.map(row => row.dependencySourceInventoryDigest).filter(value => value !== null)),
    managedReceiptSetDigest: proofValueDigest(modelArtifacts.map(item => item.receiptBindingSha256)),
    transcriptIndexDigest: proofValueDigest(rows),
    brokerReceiptSetDigest: proofValueDigest(rows.map(row => row.brokerReceiptSha256)),
    claimReceiptSetDigest: proofValueDigest(rows.map(row => row.claimReceiptDigest).filter(value => value !== null)),
  }
}

function validateDependencyBundleManifest(value, dependencyEvidence, certificationRun) {
  exactObjectKeys(value, [
    'schemaVersion', 'kind', 'runId', 'manifestSha256', 'head', 'tree', 'lockfileSha256',
    'installedLockfileSha256', 'installedDependencyIdentityDigest', 'installedPackageCount',
    'registryIntegrityDigest', 'installTranscriptSha256', 'dependencyBundleDigest',
  ], 'PR-head dependency bundle manifest')
  invariant(value.schemaVersion === 1 && value.kind === 'managed-ci-dependency-bundle-manifest'
    && value.runId === certificationRun.manifest.runId
    && value.manifestSha256 === certificationRun.manifestSha256
    && value.head === certificationRun.manifest.head
    && value.tree === certificationRun.manifest.tree, 'PR-head dependency bundle manifest run identity is invalid')
  for (const key of [
    'lockfileSha256', 'installedLockfileSha256', 'installedDependencyIdentityDigest',
    'registryIntegrityDigest', 'installTranscriptSha256', 'dependencyBundleDigest',
  ]) invariant(value[key] === dependencyEvidence[key], `PR-head dependency bundle manifest substituted ${key}`)
  invariant(value.installedPackageCount === dependencyEvidence.installedPackageCount, 'PR-head dependency bundle manifest substituted installedPackageCount')
  return value
}

function validateDependencyAcquisitionReceipt(receiptValue, {
  rawBytes,
  rawReceiptPath,
  dependencyEvidence,
  bundleManifest,
  certificationRun,
  executor,
  repoRoot,
  observedAt,
}) {
  const binding = receiptValue.attestation.binding
  const expectedDependency = {
    lockfileSha256: dependencyEvidence.lockfileSha256,
    installedLockfileSha256: dependencyEvidence.installedLockfileSha256,
    installedDependencyIdentityDigest: dependencyEvidence.installedDependencyIdentityDigest,
    installedPackageCount: dependencyEvidence.installedPackageCount,
  }
  const managedState = loadManagedCiTrustedExecutionPlan({ repoRoot, requireActivated: true })
  const expectedManaged = managedCiExpectedRawReceiptBinding(managedState, {
    evidenceKind: 'dependency-bundle',
    selectedProvider: null,
  })
  validateManagedCiSandboxReceipt({
    rawBytes,
    receipt: receiptValue,
    rawReceiptPath,
    repoRoot,
    now: canonicalDate(observedAt, 'PR-head dependency-acquisition certification time'),
    expected: {
      manifestVerificationDigest: digestSandboxVerification(certificationRun.manifest),
      dependencyLockfileSha256: expectedDependency.lockfileSha256,
      dependencyBundleDigest: dependencyEvidence.dependencyBundleDigest,
      activeRun: {
        runId: certificationRun.manifest.runId,
        manifestSha256: certificationRun.manifestSha256,
        head: certificationRun.manifest.head,
        tree: certificationRun.manifest.tree,
      },
      receiptBinding: expectedManaged,
      workflow: {
        repository: executor.repository,
        path: executor.workflowPath,
        runId: executor.workflowRunId,
        runAttempt: executor.runAttempt,
        event: executor.event,
        head: executor.subjectCommit,
        tree: executor.subjectTree,
      },
      runnerEnvironment: managedCiExpectedAttestedRunnerEnvironment(managedState),
      evidenceEnvelopeDigest: dependencyEvidence.bundleArtifact.bindingSha256,
      maxAgeSeconds: managedState.plan.observation.maxAgeSeconds,
    },
  })
  invariant(stableStringify(binding.dependency, 0) === stableStringify(expectedDependency, 0)
    && receiptValue.dependencyLockfileSha256 === expectedDependency.lockfileSha256
    && receiptValue.installedLockfileSha256 === expectedDependency.installedLockfileSha256
    && receiptValue.installedDependencyIdentityDigest === expectedDependency.installedDependencyIdentityDigest
    && receiptValue.installedPackageCount === expectedDependency.installedPackageCount, 'PR-head dependency-acquisition receipt substituted lock/install identity')
  invariant(binding.dependencyBundleDigest === dependencyEvidence.dependencyBundleDigest
    && binding.dependencyBundleDigest === proofValueDigest(expectedDependency), 'PR-head dependency-acquisition bundle digest is absent or irreproducible')
  invariant(binding.evidenceEnvelopeDigest === dependencyEvidence.bundleArtifact.bindingSha256
    && binding.evidenceEnvelopeDigest === proofValueDigest(bundleManifest), 'PR-head dependency-acquisition receipt is detached from its SRI/install manifest')
  return binding
}

function validateManagedCiEvidenceIndex(index, {
  certificationRun,
  coverage,
  dependencies,
  topology,
  bootstrap,
  receipt,
  issuerRegistry,
  requireCanonicalFileReadback,
}) {
  exactObjectKeys(index, [
    'schemaVersion', 'kind', 'source', 'executor', 'activation', 'dependencyEvidence',
    'brokerEvidence', 'artifacts', 'artifactSetSha256', 'modelTranscriptArtifacts',
    'modelTranscriptSetSha256', 'observedAt', 'indexSha256',
  ], 'PR-head managed CI evidence index')
  invariant(index.schemaVersion === 1 && index.kind === 'managed-ci-pr-head-evidence-index', 'PR-head managed CI evidence index identity is invalid')
  exactObjectKeys(index.source, ['runId', 'manifestSha256', 'head', 'tree'], 'PR-head managed CI evidence source')
  invariant(index.source.runId === certificationRun.manifest.runId
    && index.source.manifestSha256 === certificationRun.manifestSha256
    && index.source.head === certificationRun.manifest.head
    && index.source.tree === certificationRun.manifest.tree, 'PR-head managed CI evidence index is replayed from a different candidate run')
  exactObjectKeys(index.executor, [
    'repository', 'workflowPath', 'workflowRef', 'event', 'controlPlaneCommit', 'controlPlaneTree',
    'workflowIdentityDigest', 'workflowRunId', 'runAttempt', 'subjectCommit', 'subjectTree',
  ], 'PR-head managed CI executor')
  invariant(index.executor.repository === bootstrap.repository
    && index.executor.workflowPath === bootstrap.workflowPath
    && index.executor.workflowRef === bootstrap.workflowRef
    && index.executor.event === 'workflow_dispatch'
    && index.executor.controlPlaneCommit === bootstrap.controlPlaneCommit
    && index.executor.controlPlaneTree === bootstrap.controlPlaneTree
    && index.executor.workflowIdentityDigest === bootstrap.workflowIdentityDigest
    && index.executor.subjectCommit === certificationRun.manifest.head
    && index.executor.subjectTree === certificationRun.manifest.tree
    && index.executor.controlPlaneCommit !== index.executor.subjectCommit, 'candidate bytes were self-certified by a workflow introduced in the same PR')
  invariant(/^[1-9][0-9]*$/.test(index.executor.workflowRunId ?? '')
    && Number.isSafeInteger(index.executor.runAttempt) && index.executor.runAttempt >= 1, 'PR-head managed CI executor run identity is invalid')
  exactObjectKeys(index.activation, ['requirementId', 'evidenceSha256', 'observedAt', 'executionClassReceiptDigests', ...MANAGED_CI_ACTIVATION_CLOSURE_KEYS], 'PR-head managed CI activation binding')
  invariant(index.activation.requirementId === bootstrap.requirementId
    && index.activation.evidenceSha256 === bootstrap.activationEvidenceSha256
    && index.activation.observedAt === bootstrap.activationObservedAt
    && stableStringify(index.activation.executionClassReceiptDigests, 0) === stableStringify(bootstrap.executionClassReceiptDigests, 0)
    && stableStringify(validateManagedCiActivationClosure(index.activation, 'PR-head managed CI activation closure'), 0)
      === stableStringify(validateManagedCiActivationClosure(bootstrap, 'bootstrap managed CI activation closure'), 0), 'PR-head managed CI evidence index substituted its activation')
  exactObjectKeys(index.activation.executionClassReceiptDigests, MANAGED_CI_EXECUTION_CLASSES, 'PR-head managed CI activation receipt digests')
  invariant(Object.values(index.activation.executionClassReceiptDigests).every(value => SHA256.test(value)), 'PR-head managed CI activation receipt digest is invalid')
  exactObjectKeys(index.dependencyEvidence, [
    'proofSha256', 'lockfileSha256', 'installedLockfileSha256', 'installedDependencyIdentityDigest',
    'installedPackageCount', 'registryIntegrityDigest', 'installTranscriptSha256', 'dependencyBundleDigest',
    'acquisitionReceipt', 'bundleArtifact', 'managedReceiptSetDigest',
  ], 'PR-head dependency evidence binding')
  invariant(index.dependencyEvidence.proofSha256 === proofValueDigest(dependencies)
    && index.dependencyEvidence.lockfileSha256 === dependencies.lockfileSha256
    && index.dependencyEvidence.installedLockfileSha256 === dependencies.lockfileSha256
    && index.dependencyEvidence.installedDependencyIdentityDigest === dependencies.installedDependencyIdentityDigest
    && index.dependencyEvidence.registryIntegrityDigest === dependencies.registryIntegrityDigest
    && index.dependencyEvidence.installTranscriptSha256 === dependencies.installTranscriptSha256, 'PR-head dependency evidence digest substitution detected')
  invariant(Number.isSafeInteger(index.dependencyEvidence.installedPackageCount) && index.dependencyEvidence.installedPackageCount > 0, 'PR-head dependency evidence installed package count is invalid')
  const dependencyIdentity = {
    lockfileSha256: index.dependencyEvidence.lockfileSha256,
    installedLockfileSha256: index.dependencyEvidence.installedLockfileSha256,
    installedDependencyIdentityDigest: index.dependencyEvidence.installedDependencyIdentityDigest,
    installedPackageCount: index.dependencyEvidence.installedPackageCount,
  }
  invariant(index.dependencyEvidence.dependencyBundleDigest === proofValueDigest(dependencyIdentity), 'PR-head dependency bundle digest is not reproducible from lock/install identity')
  for (const key of [
    'proofSha256', 'lockfileSha256', 'installedLockfileSha256', 'installedDependencyIdentityDigest',
    'registryIntegrityDigest', 'installTranscriptSha256', 'dependencyBundleDigest', 'managedReceiptSetDigest',
  ]) invariant(SHA256.test(index.dependencyEvidence[key] ?? ''), `PR-head dependency evidence ${key} is invalid`)
  exactObjectKeys(index.dependencyEvidence.acquisitionReceipt, [
    'executionClass', 'evidenceKind', 'path', 'sha256', 'receiptBindingSha256',
  ], 'PR-head dependency-acquisition receipt index')
  invariant(index.dependencyEvidence.acquisitionReceipt.executionClass === 'dependency-acquisition'
    && index.dependencyEvidence.acquisitionReceipt.evidenceKind === 'dependency-bundle'
    && index.dependencyEvidence.acquisitionReceipt.path === 'dependency-acquisition/receipt.json'
    && SHA256.test(index.dependencyEvidence.acquisitionReceipt.sha256 ?? '')
    && SHA256.test(index.dependencyEvidence.acquisitionReceipt.receiptBindingSha256 ?? ''), 'PR-head dependency-acquisition receipt index is shallow or invalid')
  exactObjectKeys(index.dependencyEvidence.bundleArtifact, ['kind', 'path', 'sha256', 'bindingSha256'], 'PR-head dependency bundle artifact index')
  invariant(index.dependencyEvidence.bundleArtifact.kind === 'managed-ci-dependency-bundle-manifest'
    && index.dependencyEvidence.bundleArtifact.path === 'dependency-acquisition/bundle-manifest.json'
    && SHA256.test(index.dependencyEvidence.bundleArtifact.sha256 ?? '')
    && SHA256.test(index.dependencyEvidence.bundleArtifact.bindingSha256 ?? ''), 'PR-head dependency bundle artifact index is shallow or invalid')
  exactObjectKeys(index.brokerEvidence, [
    'brokerPlanDigest', 'invocationProfileRegistryDigest', 'modelIdentityIndexDigest', 'modelReleaseIndexDigest',
    'modelAuthorityIndexDigest', 'promptIndexDigest', 'resultIndexDigest',
    'dependencySourceInventoryDigest', 'managedReceiptSetDigest', 'transcriptIndexDigest',
    'brokerReceiptSetDigest', 'claimReceiptSetDigest',
  ], 'PR-head broker evidence binding')
  invariant(Object.values(index.brokerEvidence).every(value => SHA256.test(value)), 'PR-head broker evidence contains an invalid digest')
  invariant(Array.isArray(index.artifacts) && index.artifacts.length > 0, 'PR-head managed CI evidence index cannot be a shallow signed summary without typed artifacts')
  const providers = [coverage.providers.self, coverage.providers.peer].filter(provider => provider !== null)
  const components = certificationRun.manifest.components.map(item => item.name)
  const keys = new Set()
  for (const item of index.artifacts) {
    exactObjectKeys(item, ['evidenceKind', 'executionClass', 'providerId', 'dimension', 'component', 'path', 'sha256', 'receiptBindingSha256', 'dependencyBundleDigest'], 'PR-head managed CI evidence artifact')
    invariant(PREMERGE_EVIDENCE_KINDS.includes(item.evidenceKind)
      && SHA256.test(item.sha256 ?? '') && SHA256.test(item.receiptBindingSha256 ?? '')
      && item.dependencyBundleDigest === index.dependencyEvidence.dependencyBundleDigest, 'PR-head managed CI evidence artifact identity/digest or dependency bundle is invalid')
    const isModel = ['deep-audit-judgment', 'deep-audit-component-a1b'].includes(item.evidenceKind)
    invariant(item.executionClass === (isModel ? 'model-broker' : 'deterministic-hook-audit'), 'PR-head managed CI evidence artifact execution class is invalid')
    invariant(isModel ? providers.includes(item.providerId) : item.providerId === null, 'PR-head managed CI evidence artifact provider is invalid')
    const dimensionKind = item.evidenceKind !== 'deep-audit-component-a1b'
    invariant(dimensionKind ? Number.isSafeInteger(item.dimension) && item.dimension > 0 && item.component === null
      : item.dimension === null && typeof item.component === 'string' && components.includes(item.component), 'PR-head managed CI evidence artifact subject is invalid')
    invariant(item.path === expectedPremergeArtifactPath(item), 'PR-head managed CI evidence artifact path does not match its typed identity')
    const key = stableStringify([item.evidenceKind, item.providerId, item.dimension, item.component], 0)
    invariant(!keys.has(key), 'PR-head managed CI evidence index contains a duplicate typed artifact')
    keys.add(key)
  }
  const expectedArtifactIdentities = expectedPremergeArtifactIdentities({ topology, providers, components })
  const observedArtifactIdentities = index.artifacts.map(premergeArtifactIdentity).sort(compareUtf8Bytes)
  invariant(stableStringify(observedArtifactIdentities, 0) === stableStringify(expectedArtifactIdentities, 0), 'PR-head managed CI typed artifact set differs from the frozen canonical dimension/provider/component set')
  invariant(index.artifactSetSha256 === proofValueDigest(index.artifacts), 'PR-head managed CI artifact-set digest mismatch')
  const allManagedReceipts = [index.dependencyEvidence.acquisitionReceipt.receiptBindingSha256, ...index.artifacts.map(item => item.receiptBindingSha256)]
  const modelReceipts = index.artifacts.filter(item => item.executionClass === 'model-broker').map(item => item.receiptBindingSha256)
  invariant(index.dependencyEvidence.managedReceiptSetDigest === proofValueDigest(allManagedReceipts), 'PR-head dependency/downstream broker receipt-set digest substitution detected')

  const modelArtifacts = index.artifacts.filter(item => item.executionClass === 'model-broker')
  invariant(Array.isArray(index.modelTranscriptArtifacts) && index.modelTranscriptArtifacts.length === modelArtifacts.length, 'PR-head model transcript index does not close every required model receipt exactly once')
  const transcriptPaths = new Set()
  const brokerReceipts = new Set()
  const providerModelIdentities = new Map()
  const providerReleaseIdentities = new Map()
  const releaseBindingOwners = new Map()
  const modelAuthorityBindings = new Set()
  const replayLedgerReceipts = new Set()
  for (const [rowIndex, row] of index.modelTranscriptArtifacts.entries()) {
    exactObjectKeys(row, [
      'evidencePath', 'evidenceSha256', 'evidenceKind', 'providerId', 'providerRuntime',
      'requestModelId', 'observedResponseModelId', 'modelIdentityPolicyDigest',
      'modelReleaseId', 'modelReleaseBindingDigest', 'modelReleaseRegistryDigest',
      'modelReleaseAuthorityBindingDigest', 'effectivePromotionBindingDigest',
      'modelReleaseValidFrom', 'modelReleaseValidUntil', 'providerInvocationWindow', 'exchangeInvocationObservations',
      'modelAuthorityReceiptDigest', 'modelAuthorityReadbackDigest', 'modelAuthorityRevocationRegistryDigest',
      'modelAuthorityRevocationReadbackDigest', 'modelAuthorityAuditReadbackDigest',
      'modelAuthorityReplayLedgerReceiptDigest', 'providerInvocationWindowDigest',
      'exchangeInvocationObservationsDigest', 'modelAuthorityPolicyDigest',
      'modelAuthorityBindingSchemaDigest', 'modelAuthorityIssuerRegistryDigest',
      'runtimeCertificationDigest', 'profileDigest', 'runId', 'manifestSha256', 'taskKind', 'subject',
      'transcriptPath', 'transcriptSha256', 'transcriptBytes', 'coverageInventoryDigest',
      'brokerPlanDigest', 'invocationRegistryDigest', 'brokerProfileDigest', 'resultSchemaSha256',
      'shardSetDigest', 'shardCount', 'shardResultDigest', 'reductionDigest', 'managedAttestationDigest',
      'dependencyBundleDigest', 'dependencySourceInventoryDigest', 'claimReceiptDigest', 'brokerReceiptSha256',
    ], `PR-head model transcript artifact[${rowIndex}]`)
    const artifact = modelArtifacts[rowIndex]
    invariant(artifact && row.evidencePath === artifact.path && row.evidenceSha256 === artifact.sha256
      && row.evidenceKind === artifact.evidenceKind && row.providerId === artifact.providerId
      && row.dependencyBundleDigest === artifact.dependencyBundleDigest, `PR-head model transcript artifact[${rowIndex}] does not match its envelope artifact`)
    const taskKind = artifact.evidenceKind === 'deep-audit-judgment' ? 'judgment' : 'component-a1b'
    const subject = taskKind === 'judgment' ? artifact.dimension : artifact.component
    invariant(row.taskKind === taskKind && row.subject === subject
      && row.runId === certificationRun.manifest.runId && row.manifestSha256 === certificationRun.manifestSha256, `PR-head model transcript artifact[${rowIndex}] run/task identity is substituted`)
    invariant(typeof row.providerRuntime === 'string' && row.providerRuntime.length > 0
      && typeof row.requestModelId === 'string' && row.requestModelId.length > 0
      && row.observedResponseModelId === row.requestModelId
      && row.modelReleaseId === `${row.providerId}/${row.requestModelId}`
      && Number.isSafeInteger(row.transcriptBytes) && row.transcriptBytes > 0
      && Number.isSafeInteger(row.shardCount) && row.shardCount > 0, `PR-head model transcript artifact[${rowIndex}] provider/size identity is invalid`)
    for (const key of [
      'modelIdentityPolicyDigest', 'modelReleaseBindingDigest', 'modelReleaseRegistryDigest',
      'modelReleaseAuthorityBindingDigest', 'effectivePromotionBindingDigest',
      'modelAuthorityReceiptDigest', 'modelAuthorityReadbackDigest', 'modelAuthorityRevocationRegistryDigest',
      'modelAuthorityRevocationReadbackDigest', 'modelAuthorityAuditReadbackDigest',
      'modelAuthorityReplayLedgerReceiptDigest', 'providerInvocationWindowDigest',
      'exchangeInvocationObservationsDigest', 'modelAuthorityPolicyDigest',
      'modelAuthorityBindingSchemaDigest', 'modelAuthorityIssuerRegistryDigest',
      'runtimeCertificationDigest', 'profileDigest', 'transcriptSha256', 'coverageInventoryDigest',
      'brokerPlanDigest', 'invocationRegistryDigest', 'brokerProfileDigest', 'resultSchemaSha256',
      'shardSetDigest', 'shardResultDigest', 'reductionDigest', 'managedAttestationDigest',
      'dependencyBundleDigest', 'brokerReceiptSha256',
    ]) invariant(SHA256.test(row[key] ?? ''), `PR-head model transcript artifact[${rowIndex}].${key} is invalid`)
    const authorityStartedAt = canonicalDate(row.providerInvocationWindow?.startedAt, `PR-head model transcript artifact[${rowIndex}] provider invocation start`)
    const authorityFinishedAt = canonicalDate(row.providerInvocationWindow?.finishedAt, `PR-head model transcript artifact[${rowIndex}] provider invocation finish`)
    const releaseValidFrom = canonicalDate(row.modelReleaseValidFrom, `PR-head model transcript artifact[${rowIndex}] model release validFrom`)
    const releaseValidUntil = canonicalDate(row.modelReleaseValidUntil, `PR-head model transcript artifact[${rowIndex}] model release validUntil`)
    invariant(releaseValidFrom <= authorityStartedAt && authorityStartedAt < authorityFinishedAt && authorityFinishedAt <= releaseValidUntil
      && row.providerInvocationWindowDigest === proofValueDigest(row.providerInvocationWindow)
      && Array.isArray(row.exchangeInvocationObservations)
      && row.exchangeInvocationObservations.length === row.shardCount
      && row.exchangeInvocationObservationsDigest === proofValueDigest(row.exchangeInvocationObservations), `PR-head model transcript artifact[${rowIndex}] authority validity/window/exchange projection is invalid`)
    const authorityShardIds = new Set()
    const authorityProviderRunIds = new Set()
    for (const observation of row.exchangeInvocationObservations) {
      canonicalDate(observation?.observedAt, `PR-head model transcript artifact[${rowIndex}] authority exchange observedAt`)
      invariant(SHA256.test(observation?.shardId ?? '') && SHA256.test(observation?.responseSha256 ?? '')
        && typeof observation?.providerRunId === 'string' && observation.providerRunId.length > 0
        && !authorityShardIds.has(observation.shardId) && !authorityProviderRunIds.has(observation.providerRunId), `PR-head model transcript artifact[${rowIndex}] authority exchange identity is invalid/replayed`)
      authorityShardIds.add(observation.shardId)
      authorityProviderRunIds.add(observation.providerRunId)
    }
    const prefix = `${taskKind}/${row.providerId}/_transcripts`
    invariant(row.transcriptPath === `${prefix}/${row.transcriptSha256}.json`, `PR-head model transcript artifact[${rowIndex}] is not content-addressed`)
    if (taskKind === 'judgment') invariant(row.dependencySourceInventoryDigest === null && row.claimReceiptDigest === null, 'PR-head judgment transcript cannot claim A1b dependency/claim closure')
    else invariant(SHA256.test(row.dependencySourceInventoryDigest ?? '') && SHA256.test(row.claimReceiptDigest ?? ''), 'PR-head A1b transcript lacks dependency/claim closure')
    invariant(!transcriptPaths.has(row.transcriptPath) && !brokerReceipts.has(row.brokerReceiptSha256), 'PR-head model transcript index contains a duplicate transcript or broker receipt')
    invariant(!modelAuthorityBindings.has(row.modelReleaseAuthorityBindingDigest)
      && !replayLedgerReceipts.has(row.modelAuthorityReplayLedgerReceiptDigest), 'PR-head model transcript index reuses a model authority binding or external replay-ledger receipt')
    transcriptPaths.add(row.transcriptPath)
    brokerReceipts.add(row.brokerReceiptSha256)
    modelAuthorityBindings.add(row.modelReleaseAuthorityBindingDigest)
    replayLedgerReceipts.add(row.modelAuthorityReplayLedgerReceiptDigest)
    const modelIdentity = stableStringify({
      providerRuntime: row.providerRuntime,
      requestModelId: row.requestModelId,
      observedResponseModelId: row.observedResponseModelId,
      modelIdentityPolicyDigest: row.modelIdentityPolicyDigest,
      runtimeCertificationDigest: row.runtimeCertificationDigest,
      profileDigest: row.profileDigest,
    }, 0)
    const releaseIdentity = stableStringify({
      modelReleaseId: row.modelReleaseId,
      modelReleaseBindingDigest: row.modelReleaseBindingDigest,
      modelReleaseRegistryDigest: row.modelReleaseRegistryDigest,
    }, 0)
    invariant(!providerModelIdentities.has(row.providerId) || providerModelIdentities.get(row.providerId) === modelIdentity,
      `PR-head ${row.providerId} transcripts mix requested/resolved model or model identity policy`)
    invariant(!providerReleaseIdentities.has(row.providerId) || providerReleaseIdentities.get(row.providerId) === releaseIdentity,
      `PR-head ${row.providerId} transcripts mix protected model release identities`)
    invariant(!releaseBindingOwners.has(row.modelReleaseBindingDigest) || releaseBindingOwners.get(row.modelReleaseBindingDigest) === row.providerId,
      'PR-head model release binding is aliased across providers')
    providerModelIdentities.set(row.providerId, modelIdentity)
    providerReleaseIdentities.set(row.providerId, releaseIdentity)
    releaseBindingOwners.set(row.modelReleaseBindingDigest, row.providerId)
  }
  invariant(index.modelTranscriptSetSha256 === proofValueDigest(index.modelTranscriptArtifacts), 'PR-head model transcript-set digest mismatch')
  invariant(stableStringify(index.brokerEvidence, 0) === stableStringify(brokerEvidenceProjection(index.modelTranscriptArtifacts, modelArtifacts), 0), 'PR-head broker summary is not reproducible from typed transcript artifacts')
  invariant(index.observedAt === receipt.observedAt, 'PR-head managed CI evidence index observation differs from its signed receipt')
  canonicalDate(index.observedAt, 'PR-head managed CI evidence index observedAt')
  invariant(index.indexSha256 === stagedRolloutManagedCiIndexDigest(index), 'PR-head managed CI evidence index content address is invalid')

  let canonicalReceiptsValidated = false
  if (requireCanonicalFileReadback) {
    invariant(certificationRun.runRoot && certificationRun.repository, 'canonical PR-head managed CI evidence validation lacks immutable run paths')
    const root = realpathSync(certificationRun.runRoot)
    const bundleBytes = canonicalRunArtifact(root, index.dependencyEvidence.bundleArtifact.path, 'PR-head dependency bundle artifact')
    invariant(sha256(bundleBytes) === index.dependencyEvidence.bundleArtifact.sha256, 'PR-head dependency bundle artifact digest substitution detected')
    let bundleManifest
    try { bundleManifest = JSON.parse(bundleBytes.toString('utf8')) } catch (error) { throw new Error(`PR-head dependency bundle artifact is invalid JSON:${error.message}`) }
    validateDependencyBundleManifest(bundleManifest, index.dependencyEvidence, certificationRun)
    invariant(proofValueDigest(bundleManifest) === index.dependencyEvidence.bundleArtifact.bindingSha256, 'PR-head dependency bundle artifact signed binding digest mismatch')
    const acquisitionBytes = canonicalRunArtifact(root, index.dependencyEvidence.acquisitionReceipt.path, 'PR-head dependency-acquisition receipt')
    invariant(sha256(acquisitionBytes) === index.dependencyEvidence.acquisitionReceipt.sha256, 'PR-head dependency-acquisition receipt digest substitution detected')
    let acquisitionReceipt
    try { acquisitionReceipt = JSON.parse(acquisitionBytes.toString('utf8')) } catch (error) { throw new Error(`PR-head dependency-acquisition receipt is invalid JSON:${error.message}`) }
    const acquisitionBinding = validateDependencyAcquisitionReceipt(acquisitionReceipt, {
      rawBytes: acquisitionBytes,
      rawReceiptPath: index.dependencyEvidence.acquisitionReceipt.path,
      dependencyEvidence: index.dependencyEvidence,
      bundleManifest,
      certificationRun,
      executor: index.executor,
      repoRoot: certificationRun.repository,
      observedAt: receipt.observedAt,
    })
    invariant(proofValueDigest(acquisitionBinding) === index.dependencyEvidence.acquisitionReceipt.receiptBindingSha256, 'PR-head dependency-acquisition receipt binding digest mismatch')
    const envelopes = new Map()
    const observedFindings = { judgment: 0, componentA1b: 0, hookWarnings: 0, hookBlocking: 0 }
    for (const item of index.artifacts) {
      const bytes = canonicalRunArtifact(root, item.path, 'PR-head managed CI evidence artifact')
      invariant(sha256(bytes) === item.sha256, `PR-head managed CI evidence artifact digest substitution detected: ${item.path}`)
      let envelope
      try { envelope = JSON.parse(bytes.toString('utf8')) } catch (error) { throw new Error(`PR-head managed CI evidence artifact is invalid JSON: ${item.path}: ${error.message}`) }
      validateDeepAuditEvidenceEnvelope(envelope, {
        manifest: certificationRun.manifest,
        manifestSha256: certificationRun.manifestSha256,
        relativePath: item.path,
        requireCurrentEnvironment: false,
        repoRoot: certificationRun.repository,
        now: new Date(receipt.observedAt),
      })
      invariant(envelope.evidenceKind === item.evidenceKind
        && envelope.producer.providerId === (item.providerId ?? 'generic'), `PR-head managed CI evidence artifact typed identity mismatch: ${item.path}`)
      if (item.dimension !== null) invariant(envelope.payload.dim === item.dimension, `PR-head managed CI evidence artifact dimension mismatch: ${item.path}`)
      if (item.component !== null) invariant(envelope.payload.component === item.component, `PR-head managed CI evidence artifact component mismatch: ${item.path}`)
      const bindings = collectManagedReceiptBindings(envelope.payload).filter(binding => {
        const workflow = binding.workflow
        return binding.executionClass === item.executionClass
          && binding.evidenceKind === item.evidenceKind
          && binding.selectedProvider === item.providerId
          && binding.workflowIdentityDigest === index.executor.workflowIdentityDigest
          && workflow.repository === index.executor.repository
          && workflow.path === index.executor.workflowPath
          && workflow.runId === index.executor.workflowRunId
          && workflow.runAttempt === index.executor.runAttempt
          && workflow.event === index.executor.event
          && workflow.head === index.executor.subjectCommit
          && workflow.tree === index.executor.subjectTree
      })
      invariant(bindings.length === 1
        && bindings[0].dependencyBundleDigest === index.dependencyEvidence.dependencyBundleDigest
        && stableStringify(bindings[0].dependency, 0) === stableStringify(acquisitionBinding.dependency, 0)
        && proofValueDigest(bindings[0]) === item.receiptBindingSha256, `PR-head managed CI receipt identity/digest/dependency-bundle mismatch: ${item.path}`)
      envelopes.set(item.path, envelope)
      if (item.evidenceKind === 'deep-audit-judgment') observedFindings.judgment += envelope.payload.findings.length
      if (item.evidenceKind === 'deep-audit-component-a1b') observedFindings.componentA1b += envelope.payload.falseClaims.length
      if (item.evidenceKind === 'deep-audit-hook-residue') {
        observedFindings.hookWarnings += envelope.payload.replayReceipt.warningCount
        observedFindings.hookBlocking += envelope.payload.replayReceipt.blockingCount
      }
    }
    invariant(stableStringify(observedFindings, 0) === stableStringify(coverage.findings, 0), 'PR-head coverage finding summary is not reproducible from validated envelopes')
    const indexedTranscriptPaths = index.modelTranscriptArtifacts.map(row => row.transcriptPath).sort(compareUtf8Bytes)
    invariant(stableStringify(discoveredTranscriptArtifacts(root), 0) === stableStringify(indexedTranscriptPaths, 0), 'PR-head model transcript artifact set contains a missing or orphan transcript')
    const validatedTranscriptRows = []
    for (const row of index.modelTranscriptArtifacts) {
      const envelope = envelopes.get(row.evidencePath)
      invariant(envelope, `PR-head model transcript lacks its exact envelope:${row.evidencePath}`)
      const brokerReceipt = envelope.payload?.brokerReceipt
      invariant(brokerReceipt && proofValueDigest(brokerReceipt) === row.brokerReceiptSha256, `PR-head model broker receipt digest mismatch:${row.evidencePath}`)
      const transcriptBytes = canonicalRunArtifact(root, row.transcriptPath, 'PR-head model transcript artifact')
      invariant(sha256(transcriptBytes) === row.transcriptSha256 && transcriptBytes.length === row.transcriptBytes, `PR-head model transcript bytes/hash/size mismatch:${row.transcriptPath}`)
      const transcript = validateDeepAuditModelTranscriptArtifact({
        bytes: transcriptBytes,
        relativePath: row.transcriptPath,
        envelope,
        repoRoot: certificationRun.repository,
        manifest: certificationRun.manifest,
      })
      const dependencySourceInventoryDigest = transcript.shardSet.identity.dependencySourceInventoryDigest
      const claimReceiptDigest = row.taskKind === 'component-a1b' ? proofValueDigest(transcript.outcome.claimReceipt) : null
      const projected = {
        evidencePath: row.evidencePath,
        evidenceSha256: row.evidenceSha256,
        evidenceKind: envelope.evidenceKind,
        providerId: transcript.provider.providerId,
        providerRuntime: transcript.provider.runtime,
        requestModelId: transcript.provider.requestModelId,
        observedResponseModelId: brokerReceipt.observedResponseModelId,
        modelIdentityPolicyDigest: transcript.broker.modelIdentityPolicyDigest,
        modelReleaseId: transcript.provider.modelReleaseId,
        modelReleaseBindingDigest: transcript.provider.modelReleaseBindingDigest,
        modelReleaseRegistryDigest: transcript.provider.modelReleaseRegistryDigest,
        modelReleaseAuthorityBindingDigest: brokerReceipt.modelReleaseAuthorityBindingDigest,
        effectivePromotionBindingDigest: brokerReceipt.effectivePromotionBindingDigest,
        modelReleaseValidFrom: brokerReceipt.modelReleaseValidFrom,
        modelReleaseValidUntil: brokerReceipt.modelReleaseValidUntil,
        providerInvocationWindow: brokerReceipt.providerInvocationWindow,
        exchangeInvocationObservations: brokerReceipt.exchangeInvocationObservations,
        modelAuthorityReceiptDigest: brokerReceipt.modelAuthorityReceiptDigest,
        modelAuthorityReadbackDigest: brokerReceipt.modelAuthorityReadbackDigest,
        modelAuthorityRevocationRegistryDigest: brokerReceipt.modelAuthorityRevocationRegistryDigest,
        modelAuthorityRevocationReadbackDigest: brokerReceipt.modelAuthorityRevocationReadbackDigest,
        modelAuthorityAuditReadbackDigest: brokerReceipt.modelAuthorityAuditReadbackDigest,
        modelAuthorityReplayLedgerReceiptDigest: brokerReceipt.modelAuthorityReplayLedgerReceiptDigest,
        providerInvocationWindowDigest: brokerReceipt.providerInvocationWindowDigest,
        exchangeInvocationObservationsDigest: brokerReceipt.exchangeInvocationObservationsDigest,
        modelAuthorityPolicyDigest: brokerReceipt.modelAuthorityPolicyDigest,
        modelAuthorityBindingSchemaDigest: brokerReceipt.modelAuthorityBindingSchemaDigest,
        modelAuthorityIssuerRegistryDigest: brokerReceipt.modelAuthorityIssuerRegistryDigest,
        runtimeCertificationDigest: transcript.provider.runtimeCertificationDigest,
        profileDigest: transcript.broker.selectedProfileDigest,
        runId: transcript.runId,
        manifestSha256: transcript.manifestSha256,
        taskKind: transcript.task.kind,
        subject: transcript.task.subject,
        transcriptPath: brokerReceipt.transcriptReference,
        transcriptSha256: brokerReceipt.transcriptSha256,
        transcriptBytes: brokerReceipt.transcriptBytes,
        coverageInventoryDigest: brokerReceipt.coverageInventoryDigest,
        brokerPlanDigest: brokerReceipt.brokerPlanDigest,
        invocationRegistryDigest: brokerReceipt.invocationRegistryDigest,
        brokerProfileDigest: brokerReceipt.brokerProfileDigest,
        resultSchemaSha256: brokerReceipt.resultSchemaSha256,
        shardSetDigest: brokerReceipt.shardSetDigest,
        shardCount: brokerReceipt.shardCount,
        shardResultDigest: transcript.reduction.shardResultDigest,
        reductionDigest: brokerReceipt.reductionDigest,
        managedAttestationDigest: brokerReceipt.managedAttestationDigest,
        dependencyBundleDigest: envelope.payload.sandboxReceipt.attestation.binding.dependencyBundleDigest,
        dependencySourceInventoryDigest,
        claimReceiptDigest,
        brokerReceiptSha256: proofValueDigest(brokerReceipt),
      }
      invariant(stableStringify(projected, 0) === stableStringify(row, 0), `PR-head model transcript index differs from canonical transcript/receipt closure:${row.transcriptPath}`)
      validatedTranscriptRows.push(projected)
    }
    invariant(stableStringify(index.brokerEvidence, 0) === stableStringify(brokerEvidenceProjection(validatedTranscriptRows, modelArtifacts), 0), 'PR-head broker prompt/result/dependency summaries differ from validated transcripts')
    canonicalReceiptsValidated = true
  }
  return { indexSha256: index.indexSha256, canonicalReceiptsValidated }
}

function inventoryRowPresent(row) {
  return row !== undefined && row.kind !== 'missing'
}

export function validateStagedRolloutCandidateCarrier(plan, {
  activeRun,
  certificationRun,
  sourceTransition,
  repoRoot = REPOSITORY_ROOT,
}) {
  invariant(activeRun?.manifest && certificationRun?.manifest && sourceTransition, 'candidate carrier validation lacks frozen/certification run context')
  invariant(
    certificationRun.manifest.inventoryDigest
      === sha256(stableStringify(certificationRun.manifest.inventory, 0)),
    'candidate carrier certification inventory digest is stale or substituted',
  )
  const projected = validateFrozenGitObjectProof(sourceTransition.gitObjectProof, activeRun)
  const inventory = readJson(resolve(repoRoot, 'infra/governance/inventory/managed-repos.json'))
  const repository = inventory.repositories.find(candidate => candidate.id === 'design-system')
  invariant(repository?.github === sourceTransition.repository, 'candidate carrier validation is outside the managed authority repository')
  const carrierPolicy = stagedRolloutCandidateCarrierPolicy(plan, { repoRoot })
  validateRepositorySubjectProof(
    repository,
    sourceTransition.repositoryIdentity,
    { subjectCommit: projected.sourceCommit, subjectTree: projected.sourceTree },
    { carrierPolicy },
  )
  invariant(
    certificationRun.manifest.head === sourceTransition.repositoryIdentity.gitCommit
      && certificationRun.manifest.tree === sourceTransition.repositoryIdentity.gitTree
      && certificationRun.manifest.head === sourceTransition.sourceCommit
      && certificationRun.manifest.tree === sourceTransition.sourceTree,
    'PR-head certification run is not bound to the exact validated candidate carrier',
  )
  const proof = sourceTransition.repositoryIdentity.subjectProofs[projected.sourceCommit]
  const changed = new Map(proof.changedFiles.map(file => [file.path, file.status]))
  const frozenRows = new Map(activeRun.manifest.inventory.map(row => [row.path, row]))
  const carrierRows = new Map(certificationRun.manifest.inventory.map(row => [row.path, row]))
  const allPaths = [...new Set([...frozenRows.keys(), ...carrierRows.keys()])].sort(compareUtf8Bytes)
  for (const path of allPaths) {
    const before = frozenRows.get(path)
    const after = carrierRows.get(path)
    const status = changed.get(path)
    if (status === undefined) {
      invariant(
        stableStringify(before, 0) === stableStringify(after, 0),
        `candidate carrier changed unlisted frozen source path ${path}`,
      )
      continue
    }
    if (status === 'added') invariant(!inventoryRowPresent(before) && inventoryRowPresent(after), `candidate carrier added-path inventory mismatch:${path}`)
    else if (status === 'removed') invariant(inventoryRowPresent(before) && !inventoryRowPresent(after), `candidate carrier removed-path inventory mismatch:${path}`)
    else invariant(
      inventoryRowPresent(before)
        && inventoryRowPresent(after)
        && stableStringify(before, 0) !== stableStringify(after, 0),
      `candidate carrier modified-path inventory mismatch:${path}`,
    )
  }
  invariant(
    [...changed.keys()].every(path => allPaths.includes(path)),
    'candidate carrier proof contains a changed path outside both frozen and certification inventories',
  )
  return {
    relationship: proof.relationship,
    changedPaths: clone(proof.changedPaths),
    changedPathsSha256: proof.changedPathsSha256,
    carrierCommit: proof.carrierCommit,
    carrierTree: proof.carrierTree,
  }
}

function validatePrHeadCertification(value, {
  plan,
  certificationRun,
  sourceTransition,
  activeRun,
  bootstrapTransition,
  receipt,
  issuerRegistry,
  repoRoot,
  requireCanonicalFileReadback,
  deploymentProfile,
}) {
  exactObjectKeys(value, ['schemaVersion', 'kind', 'certificationRun', 'sourceCommit', 'sourceTree', 'coverage', 'dependencies', 'managedCiEvidenceIndex', 'observedAt'], 'PR-head certification')
  invariant(value.schemaVersion === 1 && value.kind === 'pr-head-certification', 'PR-head certification identity is invalid')
  invariant(certificationRun && sourceTransition, 'PR-head certification lacks committed PR-head/run context')
  validateActiveRun(value.certificationRun, certificationRun, 'PR-head certification active run')
  invariant(value.sourceCommit === sourceTransition.sourceCommit && value.sourceTree === sourceTransition.sourceTree, 'PR-head certification does not bind the committed PR head/tree')
  invariant(certificationRun.manifest.head === value.sourceCommit && certificationRun.manifest.tree === value.sourceTree, 'PR-head certification active run was not created on the exact committed PR head/tree')
  invariant(value.certificationRun.manifestSha256 !== activeRunBinding(activeRun).manifestSha256, 'dirty pre-commit active run cannot be reused as PR-head certification')
  validateStagedRolloutCandidateCarrier(plan, {
    activeRun,
    certificationRun,
    sourceTransition,
    repoRoot,
  })
  const topology = validatePremergeCoverageProof(value.coverage, certificationRun, { repoRoot, requireFrozen: requireCanonicalFileReadback })
  validateDependencyProof(value.dependencies, certificationRun)
  invariant(deploymentProfile?.id, 'PR-head certification lacks the canonical deployment profile')
  let canonicalReceiptsValidated = false
  let evidenceMode
  if (deploymentProfile.id === PRODUCTION_GRADE_PROFILE_ID) {
    invariant(
      Boolean(bootstrapTransition?.managedCiBootstrap) === Boolean(value.managedCiEvidenceIndex),
      'production-grade PR-head certification has a partial optional managed-CI wrapper',
    )
    if (bootstrapTransition?.managedCiBootstrap) {
      if (requireCanonicalFileReadback) {
        invariant(certificationRun.repository, 'canonical PR-head certification lacks the candidate repository root')
        let candidateManagedCi
        try {
          candidateManagedCi = loadManagedCiTrustedExecutionPlan({ repoRoot: certificationRun.repository, requireActivated: true })
        } catch (error) {
          invariant(false, `optional production-grade managed CI activation trust cannot be loaded: ${error.message}`)
        }
        const activationRequirement = bootstrapTransition.activation?.requirements?.find(item => item.id === bootstrapTransition.managedCiBootstrap.requirementId)
        validateStagedCandidateManagedCiTrust(candidateManagedCi, activationRequirement?.evidence?.payload?.observedResource)
      }
      const managedCiValidation = validateManagedCiEvidenceIndex(value.managedCiEvidenceIndex, {
        certificationRun,
        coverage: value.coverage,
        dependencies: value.dependencies,
        topology,
        bootstrap: bootstrapTransition.managedCiBootstrap,
        receipt,
        issuerRegistry,
        requireCanonicalFileReadback,
      })
      canonicalReceiptsValidated = managedCiValidation.canonicalReceiptsValidated
      evidenceMode = 'managed-ci-attested'
    } else {
      if (requireCanonicalFileReadback) {
        invariant(
          certificationRun.repository && certificationRun.runRoot,
          'canonical production-grade PR-head certification lacks immutable run paths',
        )
        let recomputed
        try {
          recomputed = verifyDeepAuditCoverage({
            repoRoot: certificationRun.repository,
            explicitRoot: dirname(certificationRun.deepAuditRoot),
            selfProvider: value.coverage.providers.self,
            peerProvider: value.coverage.providers.peer,
            authorProvider: value.coverage.authorProvider,
          })
        } catch (error) {
          invariant(false, `production-grade PR-head evidence cannot be recomputed: ${error.message}`)
        }
        invariant(
          stableStringify(recomputed, 0) === stableStringify(value.coverage, 0),
          'production-grade PR-head coverage differs from canonical immutable evidence readback',
        )
        canonicalReceiptsValidated = true
      }
      evidenceMode = 'portable-content-addressed-exact-run'
    }
  } else {
    invariant(bootstrapTransition?.managedCiBootstrap, 'maximum-assurance PR-head certification lacks the independently pre-existing managed CI bootstrap')
    if (requireCanonicalFileReadback) {
      invariant(certificationRun.repository, 'canonical PR-head certification lacks the candidate repository root')
      let candidateManagedCi
      try {
        candidateManagedCi = loadManagedCiTrustedExecutionPlan({ repoRoot: certificationRun.repository, requireActivated: true })
      } catch (error) {
        invariant(false, `PR-head candidate managed CI activation trust cannot be loaded: ${error.message}`)
      }
      const activationRequirement = bootstrapTransition.activation?.requirements?.find(item => item.id === bootstrapTransition.managedCiBootstrap.requirementId)
      validateStagedCandidateManagedCiTrust(candidateManagedCi, activationRequirement?.evidence?.payload?.observedResource)
    }
    const managedCiValidation = validateManagedCiEvidenceIndex(value.managedCiEvidenceIndex, {
      certificationRun,
      coverage: value.coverage,
      dependencies: value.dependencies,
      topology,
      bootstrap: bootstrapTransition.managedCiBootstrap,
      receipt,
      issuerRegistry,
      requireCanonicalFileReadback,
    })
    canonicalReceiptsValidated = managedCiValidation.canonicalReceiptsValidated
    evidenceMode = 'managed-ci-attested'
  }
  invariant(value.observedAt === receipt.observedAt, 'PR-head certification observation differs from its signed receipt')
  canonicalDate(value.observedAt, 'PR-head certification observedAt')
  return {
    canonicalReceiptsValidated,
    evidenceMode,
  }
}

function validateManagedCiImport(value, { certificationRun, coverage, receipt, requireCanonicalFileReadback }) {
  exactObjectKeys(value, [
    'schemaVersion', 'kind', 'producer', 'sourceWorkflow', 'workflowRunId', 'workflowRunAttempt',
    'sourceHead', 'sourceTree', 'dimensions', 'artifacts', 'coverageSha256', 'importedAt',
  ], 'managed CI evidence import')
  invariant(value.schemaVersion === 1 && value.kind === 'managed-ci-evidence-import' && value.producer === 'verify-deep-audit-coverage', 'managed CI evidence import identity/producer is invalid')
  invariant(value.sourceWorkflow === '.github/workflows/ci.yml' && /^[1-9][0-9]*$/.test(value.workflowRunId ?? '') && Number.isSafeInteger(value.workflowRunAttempt) && value.workflowRunAttempt > 0, 'managed CI evidence import workflow identity is invalid')
  invariant(value.sourceHead === certificationRun.manifest.head && value.sourceTree === certificationRun.manifest.tree, 'managed CI evidence import source differs from the committed certification run')
  exactList(value.dimensions, [64, 66], 'managed CI imported dimensions')
  invariant(value.coverageSha256 === proofValueDigest(coverage), 'managed CI evidence import does not bind the full coverage result')
  invariant(value.importedAt === receipt.observedAt, 'managed CI evidence import time differs from its signed rollout-completion receipt')
  canonicalDate(value.importedAt, 'managed CI evidence importedAt')
  invariant(Array.isArray(value.artifacts) && value.artifacts.length === 2, 'managed CI evidence import artifacts are incomplete')
  for (const [index, artifact] of value.artifacts.entries()) {
    const dimension = value.dimensions[index]
    exactObjectKeys(artifact, ['dimension', 'path', 'sha256'], `managed CI dim ${dimension} artifact`)
    invariant(artifact.dimension === dimension && artifact.path === `ci-enforced/dim-${dimension}.json` && SHA256.test(artifact.sha256 ?? ''), `managed CI dim ${dimension} artifact identity is invalid`)
    if (requireCanonicalFileReadback) {
      invariant(certificationRun.runRoot && certificationRun.repository, 'canonical managed CI import lacks immutable run paths')
      const root = realpathSync(certificationRun.runRoot)
      const absolute = resolve(root, artifact.path)
      const rel = relative(root, absolute)
      invariant(rel === artifact.path && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `managed CI dim ${dimension} artifact escapes the committed run`)
      const info = lstatSync(absolute)
      invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(absolute) === absolute, `managed CI dim ${dimension} artifact is not a unique no-symlink file`)
      const bytes = readFileSync(absolute)
      invariant(sha256(bytes) === artifact.sha256, `managed CI dim ${dimension} artifact bytes differ from the signed import digest`)
      let envelope
      try { envelope = JSON.parse(bytes.toString('utf8')) } catch (error) { throw new Error(`managed CI dim ${dimension} artifact is invalid JSON: ${error.message}`) }
      validateDeepAuditEvidenceEnvelope(envelope, {
        manifest: certificationRun.manifest,
        manifestSha256: certificationRun.manifestSha256,
        relativePath: artifact.path,
        requireCurrentEnvironment: false,
        repoRoot: certificationRun.repository,
      })
      invariant(envelope.evidenceKind === 'deep-audit-ci-enforced' && envelope.payload.dim === dimension, `managed CI dim ${dimension} artifact is the wrong evidence envelope`)
    }
  }
  return value
}

function validateFullDeepAudit(value, { certificationRun, receipt, repoRoot, requireCanonicalFileReadback = false }) {
  invariant(certificationRun, 'full rollout completion lacks the committed certification run')
  exactObjectKeys(value, ['schemaVersion', 'kind', 'certificationRun', 'coverage', 'ciImport', 'observedAt'], 'full rollout-completion deep audit')
  invariant(value.schemaVersion === 1 && value.kind === 'full-deep-audit-verification', 'full rollout-completion deep audit identity is invalid')
  validateActiveRun(value.certificationRun, certificationRun, 'full rollout-completion certification run')
  validateFullCoverageProof(value.coverage, certificationRun, { repoRoot, requireFrozen: requireCanonicalFileReadback })
  validateManagedCiImport(value.ciImport, { certificationRun, coverage: value.coverage, receipt, requireCanonicalFileReadback })
  invariant(value.observedAt === receipt.observedAt, 'full rollout-completion observation differs from its signed receipt')
  canonicalDate(value.observedAt, 'full deep-audit receipt observedAt')
  return value
}

function validatePrepareVerification(verification, ledgerActiveRun, loadedActiveRun, {
  plan,
  attestationPolicy = null,
  issuerRegistry = null,
  authorityBootstrapActivationRequirement = null,
  repoRoot = null,
  requireExternalArtifact = false,
} = {}) {
  invariant(verification, 'candidate freeze cannot complete from a manifest-only assertion; closed verification receipt is missing')
  exactObjectKeys(verification, [
    'schemaVersion', 'kind', 'activeRun', 'preparedAt', 'bootstrapPrerequisite',
    'authorityBootstrapReplay', 'freeze',
  ], 'candidate freeze verification')
  invariant(verification.schemaVersion === 4 && verification.kind === 'staged-rollout-prepare-verification', 'candidate freeze verification identity is invalid or stale')
  validateActiveRun(verification.activeRun, loadedActiveRun, 'prepare verification active run')
  invariant(stableStringify(verification.activeRun, 0) === stableStringify(ledgerActiveRun, 0), 'prepare verification and ledger active run differ')
  exactObjectKeys(verification.freeze, ['contract', 'status', 'promotionEligible', 'sha256', 'value'], 'candidate freeze artifact')
  invariant(verification.freeze.contract === 'candidate-freeze-verification-v2' && verification.freeze.status === 'frozen' && verification.freeze.promotionEligible === false, 'candidate freeze artifact identity/status is invalid')
  invariant(verification.preparedAt === verification.freeze.value?.preparedAt, 'candidate freeze verification time differs from its proof')
  validateCandidateFreezeProof(verification.freeze.value, loadedActiveRun, { requireExternalArtifact })
  invariant(verification.freeze.sha256 === proofValueDigest(verification.freeze.value), 'candidate freeze proof bytes do not match their content address')
  const freezeAt = canonicalDate(verification.preparedAt, 'candidate freeze verification preparedAt')
  validatePersistedCandidateFreezeBootstrapPrerequisite(verification.bootstrapPrerequisite, {
    plan,
    freezeAt,
    attestationPolicy,
    issuerRegistry,
    repoRoot: repoRoot ?? REPOSITORY_ROOT,
  })
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(plan, {
    repoRoot: repoRoot ?? REPOSITORY_ROOT,
  })
  if (deploymentProfile.id === MAXIMUM_ASSURANCE_PROFILE_ID) {
    validateCandidateFreezeAuthorityBootstrapReplay(verification.authorityBootstrapReplay, {
      plan,
      freezeAt,
      bootstrapPrerequisite: verification.bootstrapPrerequisite,
      authorityBootstrapActivationRequirement,
      repoRoot,
      requireCanonicalBindings: requireExternalArtifact,
    })
  } else invariant(
    verification.authorityBootstrapReplay === null,
    'production-grade local candidate freeze must not carry or depend on maximum-assurance durable replay evidence',
  )
  return {
    digest: stagedRolloutPrepareVerificationDigest(verification),
    bootstrapPrerequisiteSha256: verification.bootstrapPrerequisite.prerequisiteSha256,
    deploymentProfileId: deploymentProfile.id,
    deploymentProfileSha256: deploymentProfile.sha256,
    authorityBootstrapReplaySha256: verification.authorityBootstrapReplay?.sha256 ?? null,
    authorityBootstrapReplayReceiptDigest: verification.authorityBootstrapReplay?.value?.receiptDigest ?? null,
  }
}

function safeEvidenceArtifact(evidenceRoot, relativePath, label) {
  invariant(typeof relativePath === 'string' && relativePath.length > 0 && !isAbsolute(relativePath), `${label} path is unsafe`)
  invariant(!relativePath.split('/').some(segment => !segment || segment === '.' || segment === '..'), `${label} path is unsafe`)
  const root = realpathSync(resolve(evidenceRoot))
  const absolute = resolve(root, relativePath)
  const rel = relative(root, absolute)
  invariant(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} path escapes the evidence root`)
  const info = lstatSync(absolute)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} must be a unique regular no-symlink file`)
  invariant(realpathSync(absolute) === absolute, `${label} resolves through an unsafe alias`)
  const bytes = readFileSync(absolute)
  let value
  try { value = JSON.parse(bytes.toString('utf8')) } catch (error) { throw new Error(`${label} is invalid JSON: ${error.message}`) }
  const canonical = Buffer.from(stableStringify(value, 0), 'utf8')
  invariant(bytes.equals(canonical), `${label} must use canonical JSON bytes without whitespace or trailing data`)
  return value
}

function safeAuthorityBootstrapReplayEvidenceArtifact(evidenceRoot, relativePath, label) {
  invariant(
    typeof relativePath === 'string'
      && relativePath.startsWith(`${AUTHORITY_BOOTSTRAP_REPLAY_RECEIPT_RELATIVE_ROOT}/`)
      && !isAbsolute(relativePath)
      && !relativePath.split('/').some(segment => !segment || segment === '.' || segment === '..'),
    `${label} path is unsafe or outside the canonical replay CAS`,
  )
  const root = realpathSync(resolve(evidenceRoot))
  const absolute = resolve(root, relativePath)
  const rel = relative(root, absolute)
  invariant(rel === relativePath && !rel.startsWith(`..${sep}`) && !isAbsolute(rel),
    `${label} path escapes the evidence root`)
  const read = readUniqueJson(absolute, label)
  invariant(
    dirname(read.absolute) === resolve(root, AUTHORITY_BOOTSTRAP_REPLAY_RECEIPT_RELATIVE_ROOT),
    `${label} is outside the canonical replay CAS`,
  )
  invariant(
    read.bytes.equals(Buffer.from(`${stableStringify(read.value)}\n`, 'utf8')),
    `${label} must use canonical content-addressed receipt bytes`,
  )
  invariant(
    /^[a-f0-9]{64}$/.test(read.value?.receiptDigest ?? '')
      && basename(read.absolute) === `${read.value.receiptDigest}.json`,
    `${label} filename differs from its receipt digest`,
  )
  return read.value
}

function readAuthorityBootstrapReplayReceipt(path, {
  repoRoot = REPOSITORY_ROOT,
  evidenceRoot = null,
  label = 'authority policy bootstrap durable replay receipt',
} = {}) {
  invariant(typeof path === 'string' && path.length > 0, `${label} path is missing`)
  const read = readUniqueJson(resolve(path), label)
  const canonicalRoot = resolveRuntimeEvidencePath({
    repoRoot,
    explicitRoot: evidenceRoot,
    relativePath: AUTHORITY_BOOTSTRAP_REPLAY_RECEIPT_RELATIVE_ROOT,
  })
  invariant(dirname(read.absolute) === canonicalRoot,
    `${label} is outside the canonical Git-owned replay CAS`)
  invariant(
    read.bytes.equals(Buffer.from(`${stableStringify(read.value)}\n`, 'utf8')),
    `${label} must use the canonical content-addressed receipt encoding`,
  )
  invariant(
    /^[a-f0-9]{64}$/.test(read.value?.receiptDigest ?? '')
      && basename(read.absolute) === `${read.value.receiptDigest}.json`,
    `${label} filename differs from its receipt digest`,
  )
  return read.value
}

function validateCandidateFreezeAuthorityBootstrapReplay(evidence, {
  plan,
  freezeAt,
  bootstrapPrerequisite,
  authorityBootstrapActivationRequirement = null,
  repoRoot = null,
  requireCanonicalBindings = false,
}) {
  exactObjectKeys(evidence, [
    'contract', 'status', 'promotionEligible', 'managedEvidence', 'sha256', 'value',
  ], 'candidate freeze authority policy bootstrap replay')
  invariant(
    evidence.contract === 'authority-policy-bootstrap-durable-replay-v1'
      && evidence.status === 'durably-replayed'
      && evidence.promotionEligible === false
      && evidence.managedEvidence === true,
    'candidate freeze authority policy bootstrap replay identity/status is invalid',
  )
  invariant(evidence.sha256 === proofValueDigest(evidence.value),
    'candidate freeze authority policy bootstrap replay bytes differ from its content address')
  const receipt = validateAuthorityBootstrapDurableReplayReceipt(evidence.value, {
    activationRequirement: authorityBootstrapActivationRequirement,
    requiredRetentionAt: freezeAt,
    requireTrustedActivation: requireCanonicalBindings,
  })
  invariant(
    canonicalDate(receipt.replayedAt, 'candidate freeze authority bootstrap replayedAt') < freezeAt,
    'candidate freeze authority policy bootstrap durable replay must predate the freeze',
  )
  invariant(
    receipt.sourceJournal.plan.stagedRolloutPlanDigest === sha256(stableStringify(plan, 0)),
    'candidate freeze authority policy bootstrap replay references another staged-rollout plan',
  )
  invariant(
    bootstrapPrerequisite.releaseRequirementIds.includes(receipt.requirementId),
    'candidate freeze bootstrap prerequisite omits the durable replay activation requirement',
  )
  const activationSummary = bootstrapPrerequisite.releaseActivations.find(
    item => item.id === receipt.requirementId,
  )
  invariant(
    activationSummary
      && (!authorityBootstrapActivationRequirement
        || activationSummary.evidenceSha256 === authorityBootstrapActivationRequirement.evidence?.sha256),
    'candidate freeze durable replay activation differs from its signed bootstrap prerequisite',
  )
  if (requireCanonicalBindings) {
    invariant(repoRoot, 'canonical candidate freeze durable replay validation requires the repository root')
    const inventory = readJson(resolve(repoRoot, 'infra/governance/inventory/managed-repos.json'))
    const desired = readJson(resolve(repoRoot, 'infra/governance/desired/github.json'))
    invariant(
      receipt.sourceJournal.plan.inventoryDigest === sha256(stableStringify(inventory, 0))
        && receipt.sourceJournal.plan.desiredDigest === sha256(stableStringify(desired, 0))
        && receipt.sourceJournal.plan.authorityPolicyDigest === sha256(readFileSync(resolve(repoRoot, 'AGENTS.md'))),
      'candidate freeze authority policy bootstrap replay differs from current canonical authority inputs',
    )
  }
  return receipt
}

export function buildStagedRolloutPrepareVerification({
  activeRun,
  freeze,
  bootstrapPrerequisite,
  authorityBootstrapReplayReceipt,
  plan,
  attestationPolicy = null,
  issuerRegistry = null,
  authorityBootstrapActivationRequirement = null,
  repoRoot = null,
  requireExternalArtifact = false,
}) {
  const binding = activeRunBinding(activeRun)
  validateCandidateFreezeProof(freeze, activeRun, { requireExternalArtifact })
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(plan, {
    repoRoot: repoRoot ?? REPOSITORY_ROOT,
  })
  if (deploymentProfile.id === PRODUCTION_GRADE_PROFILE_ID) {
    invariant(
      authorityBootstrapReplayReceipt === null || authorityBootstrapReplayReceipt === undefined,
      'production-grade local candidate freeze refuses maximum-assurance replay input',
    )
    invariant(
      authorityBootstrapActivationRequirement === null,
      'production-grade local candidate freeze refuses a maximum-assurance mirror activation prerequisite',
    )
  } else invariant(
    authorityBootstrapReplayReceipt && authorityBootstrapActivationRequirement,
    'maximum-assurance candidate freeze requires durable replay and its activated mirror requirement',
  )
  const verification = {
    schemaVersion: 4,
    kind: 'staged-rollout-prepare-verification',
    activeRun: binding,
    preparedAt: freeze.preparedAt,
    bootstrapPrerequisite: clone(bootstrapPrerequisite),
    authorityBootstrapReplay: deploymentProfile.id === PRODUCTION_GRADE_PROFILE_ID
      ? null
      : {
          contract: 'authority-policy-bootstrap-durable-replay-v1',
          status: 'durably-replayed',
          promotionEligible: false,
          managedEvidence: true,
          sha256: proofValueDigest(authorityBootstrapReplayReceipt),
          value: clone(authorityBootstrapReplayReceipt),
        },
    freeze: { contract: 'candidate-freeze-verification-v2', status: 'frozen', promotionEligible: false, sha256: proofValueDigest(freeze), value: clone(freeze) },
  }
  validatePrepareVerification(verification, binding, activeRun, {
    plan,
    attestationPolicy,
    issuerRegistry,
    authorityBootstrapActivationRequirement,
    repoRoot,
    requireExternalArtifact,
  })
  return verification
}

export function loadAndBuildStagedRolloutPrepareVerification({ evidenceRoot, paths, ...options }) {
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(options.plan, {
    repoRoot: options.repoRoot ?? REPOSITORY_ROOT,
  })
  exactObjectKeys(
    paths,
    deploymentProfile.id === PRODUCTION_GRADE_PROFILE_ID
      ? ['freeze']
      : ['freeze', 'authorityBootstrapReplay'],
    'candidate freeze evidence paths',
  )
  return buildStagedRolloutPrepareVerification({
    ...options,
    freeze: safeEvidenceArtifact(evidenceRoot, paths.freeze, 'candidate freeze artifact'),
    authorityBootstrapReplayReceipt: deploymentProfile.id === PRODUCTION_GRADE_PROFILE_ID
      ? null
      : safeAuthorityBootstrapReplayEvidenceArtifact(
          evidenceRoot,
          paths.authorityBootstrapReplay,
          'candidate freeze authority policy bootstrap replay receipt',
        ),
  })
}

function compareExactVersions(left, right) {
  const a = EXACT_VERSION.exec(left)
  const b = EXACT_VERSION.exec(right)
  invariant(a && b, 'release comparison requires exact versions')
  for (let index = 1; index <= 3; index += 1) {
    const delta = Number(a[index]) - Number(b[index])
    if (delta !== 0) return Math.sign(delta)
  }
  if (!a[4] && !b[4]) return 0
  if (!a[4]) return 1
  if (!b[4]) return -1
  const rank = new Map([['beta', 0], ['next', 1], ['rc', 2]])
  const channelDelta = rank.get(a[4]) - rank.get(b[4])
  if (channelDelta !== 0) return Math.sign(channelDelta)
  return Math.sign(Number(a[5]) - Number(b[5]))
}

export function phaseReceiptSigningPayload(receipt) {
  const unsigned = clone(receipt)
  unsigned.authority.signatures = []
  return Buffer.from(`qijenchen-staged-rollout-phase-receipt-v1\n${stableStringify(unsigned, 0)}`, 'utf8')
}

export function stagedRolloutReceiptDigest(receipt) {
  return sha256(stableStringify(receipt, 0))
}

function stagedRolloutSigningRequestDigest(request) {
  const unsigned = clone(request)
  delete unsigned.requestSha256
  return sha256(`qijenchen-staged-rollout-signing-request-v1\n${stableStringify(unsigned, 0)}`)
}

function canonicalRuntimeJson(activeRun, evidenceRoot, relativePath, label) {
  const absolute = resolveRuntimeEvidencePath({
    repoRoot: activeRun.repository,
    explicitRoot: evidenceRoot,
    relativePath,
  })
  const read = readUniqueJson(absolute, label)
  invariant(read.bytes.equals(Buffer.from(stableStringify(read.value, 0), 'utf8')), `${label} must use canonical JSON bytes without whitespace or trailing data`)
  return { ...read, relativePath }
}

function candidateFreezeRuntimePaths(runId) {
  return {
    preparedLedger: `staged-rollout/runs/${runId}/ledger.prepared.json`,
    signingRequest: `staged-rollout/runs/${runId}/candidate-freeze-signing-request.json`,
    signatureBundle: `staged-rollout/runs/${runId}/candidate-freeze-signatures.json`,
    completedLedger: `staged-rollout/runs/${runId}/ledger.candidate-freeze.json`,
  }
}

function candidateFreezeBootstrapPrerequisiteDigest(prerequisite) {
  const unsigned = clone(prerequisite)
  delete unsigned.prerequisiteSha256
  const version = prerequisite?.schemaVersion === 2 ? 'v2' : 'v1'
  return sha256(`qijenchen-candidate-freeze-bootstrap-prerequisite-${version}\n${stableStringify(unsigned, 0)}`)
}

function validatePersistedCandidateFreezeBootstrapPrerequisite(prerequisite, {
  plan,
  freezeAt,
  attestationPolicy = null,
  issuerRegistry = null,
  repoRoot = REPOSITORY_ROOT,
}) {
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(plan, { repoRoot })
  if (deploymentProfile.id === PRODUCTION_GRADE_PROFILE_ID) {
    exactObjectKeys(prerequisite, [
      'schemaVersion', 'kind', 'ready', 'planSha256', 'deploymentProfileBinding',
      'freezeAt', 'activationRequiredBeforeFreeze', 'activationGatePhase',
      'activationBaseline', 'prerequisiteSha256',
    ], 'candidate-freeze production-grade profile prerequisite')
    invariant(
      prerequisite.schemaVersion === 2
        && prerequisite.kind === 'candidate-freeze-profile-prerequisite'
        && prerequisite.ready === true,
      'candidate-freeze production-grade profile prerequisite identity/status is invalid',
    )
    invariant(
      prerequisite.planSha256 === stagedRolloutPlanDigest(plan)
        && stableStringify(prerequisite.deploymentProfileBinding, 0)
          === stableStringify(plan.deploymentProfileBinding, 0),
      'candidate-freeze production-grade profile prerequisite references another plan/profile',
    )
    const boundFreezeAt = canonicalDate(prerequisite.freezeAt, 'candidate-freeze profile prerequisite freezeAt')
    invariant(
      freezeAt instanceof Date
        && Number.isFinite(freezeAt.getTime())
        && boundFreezeAt.getTime() === freezeAt.getTime(),
      'candidate-freeze production-grade profile prerequisite is detached from the prepared freeze',
    )
    invariant(
      prerequisite.activationRequiredBeforeFreeze === false
        && prerequisite.activationGatePhase === deploymentProfile.activationReadbackPhase
        && plan.bootstrapBoundary.bootstrapMustPreexistCandidateFreeze === false,
      'candidate-freeze production-grade profile incorrectly requires pre-freeze activation',
    )
    exactObjectKeys(prerequisite.activationBaseline, ['sha256', 'value'], 'candidate-freeze activation baseline')
    invariant(
      prerequisite.activationBaseline.value
        && typeof prerequisite.activationBaseline.value === 'object'
        && !Array.isArray(prerequisite.activationBaseline.value)
        && prerequisite.activationBaseline.sha256 === proofValueDigest(prerequisite.activationBaseline.value),
      'candidate-freeze activation baseline is missing, stale, or not content-addressed',
    )
    invariant(
      prerequisite.prerequisiteSha256 === candidateFreezeBootstrapPrerequisiteDigest(prerequisite),
      'candidate-freeze production-grade profile prerequisite content address is invalid',
    )
    return prerequisite
  }
  exactObjectKeys(prerequisite, [
    'schemaVersion', 'kind', 'ready', 'planSha256', 'deploymentProfileBinding', 'externalActivationPolicyDigest',
    'activationDigest', 'attestationPolicySha256', 'issuerRegistryDigest', 'freezeAt',
    'releaseRequirementIds', 'releaseActivations', 'latestActivationObservedAt',
    'earliestActivationExpiresAt', 'managedCiRequirementId', 'managedCiActivationObservedAt',
    'requiredRole', 'quorum', 'prerequisiteSha256',
  ], 'candidate-freeze bootstrap prerequisite')
  invariant(prerequisite.schemaVersion === 1
    && prerequisite.kind === 'candidate-freeze-bootstrap-prerequisite'
    && prerequisite.ready === true, 'candidate-freeze bootstrap prerequisite identity/status is invalid')
  invariant(deploymentProfile.id === MAXIMUM_ASSURANCE_PROFILE_ID
    && plan?.bootstrapBoundary?.bootstrapMustPreexistCandidateFreeze === true
    && prerequisite.planSha256 === stagedRolloutPlanDigest(plan)
    && stableStringify(prerequisite.deploymentProfileBinding, 0)
      === stableStringify(plan.deploymentProfileBinding, 0),
  'candidate-freeze bootstrap prerequisite references another or weakened maximum-assurance plan/profile')
  invariant(prerequisite.externalActivationPolicyDigest === EXTERNAL_ACTIVATION_POLICY_DIGEST
    && SHA256.test(prerequisite.activationDigest ?? '')
    && SHA256.test(prerequisite.attestationPolicySha256 ?? '')
    && SHA256.test(prerequisite.issuerRegistryDigest ?? ''), 'candidate-freeze bootstrap prerequisite authority digest is invalid')
  const boundFreezeAt = canonicalDate(prerequisite.freezeAt, 'candidate-freeze bootstrap prerequisite freezeAt')
  invariant(freezeAt instanceof Date && Number.isFinite(freezeAt.getTime())
    && boundFreezeAt.getTime() === freezeAt.getTime(), 'candidate-freeze bootstrap prerequisite is detached from the prepared freeze')
  invariant(Array.isArray(prerequisite.releaseActivations)
    && prerequisite.releaseActivations.length > 0
    && prerequisite.releaseActivations.length <= 64, 'candidate-freeze bootstrap prerequisite activation set is invalid')
  const releaseActivations = prerequisite.releaseActivations.map((activation, index) => {
    exactObjectKeys(activation, ['id', 'kind', 'observedAt', 'expiresAt', 'evidenceSha256'], `candidate-freeze bootstrap activation[${index}]`)
    invariant(typeof activation.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(activation.id)
      && typeof activation.kind === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(activation.kind)
      && SHA256.test(activation.evidenceSha256 ?? ''), `candidate-freeze bootstrap activation[${index}] identity is invalid`)
    const observedAt = canonicalDate(activation.observedAt, `candidate-freeze ${activation.id} activation observedAt`)
    const expiresAt = canonicalDate(activation.expiresAt, `candidate-freeze ${activation.id} activation expiresAt`)
    invariant(observedAt < boundFreezeAt, `candidate-freeze ${activation.id} activation must predate the prepared freeze`)
    invariant(expiresAt > boundFreezeAt, `candidate-freeze ${activation.id} activation was not valid through the prepared freeze`)
    return { ...activation, observedAt, expiresAt }
  })
  const sortedIds = releaseActivations.map(item => item.id).sort(compareUtf8Bytes)
  invariant(new Set(sortedIds).size === sortedIds.length, 'candidate-freeze bootstrap prerequisite contains duplicate release requirements')
  invariant(stableStringify(prerequisite.releaseActivations.map(item => item.id), 0) === stableStringify(sortedIds, 0),
    'candidate-freeze bootstrap prerequisite activations are not canonically ordered')
  exactList(prerequisite.releaseRequirementIds, sortedIds, 'candidate-freeze bootstrap prerequisite release requirement IDs')
  const latestActivationObservedAt = releaseActivations
    .map(item => item.observedAt)
    .sort((left, right) => right.getTime() - left.getTime())[0]
    .toISOString()
  const earliestActivationExpiresAt = releaseActivations
    .map(item => item.expiresAt)
    .sort((left, right) => left.getTime() - right.getTime())[0]
    .toISOString()
  invariant(prerequisite.latestActivationObservedAt === latestActivationObservedAt
    && prerequisite.earliestActivationExpiresAt === earliestActivationExpiresAt,
  'candidate-freeze bootstrap prerequisite activation horizon is invalid')
  const managedCi = releaseActivations.filter(item => item.id === 'activate-managed-ci-trusted-execution')
  invariant(managedCi.length === 1
    && managedCi[0].kind === 'managed-ci-attestation'
    && prerequisite.managedCiRequirementId === managedCi[0].id
    && prerequisite.managedCiActivationObservedAt === managedCi[0].observedAt.toISOString(),
  'candidate-freeze bootstrap prerequisite lacks the exact managed-CI activation')
  invariant(prerequisite.requiredRole === 'completion-attestor'
    && Number.isInteger(prerequisite.quorum)
    && prerequisite.quorum >= 1
    && prerequisite.quorum <= 5, 'candidate-freeze bootstrap prerequisite completion authority is invalid')
  if (attestationPolicy !== null || issuerRegistry !== null) {
    invariant(attestationPolicy && issuerRegistry, 'candidate-freeze bootstrap prerequisite validation requires policy and registry together')
    invariant(prerequisite.attestationPolicySha256 === sha256(stableStringify(attestationPolicy, 0))
      && prerequisite.issuerRegistryDigest === issuerRegistryDigest(issuerRegistry)
      && prerequisite.quorum === attestationPolicy.completionAttestationQuorum,
    'candidate-freeze bootstrap prerequisite authority policy is stale')
    validateRegistryPolicyBinding(attestationPolicy, issuerRegistry, {
      role: prerequisite.requiredRole,
      quorum: prerequisite.quorum,
      now: boundFreezeAt,
      allowUnactivated: false,
    })
  }
  invariant(prerequisite.prerequisiteSha256 === candidateFreezeBootstrapPrerequisiteDigest(prerequisite),
    'candidate-freeze bootstrap prerequisite content address is invalid')
  return prerequisite
}

export function validateCandidateFreezeBootstrapPrerequisites({
  plan,
  activationRequirements,
  readiness,
  attestationPolicy,
  issuerRegistry,
  now,
  freezeAt = now,
}) {
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'candidate-freeze bootstrap validation time is invalid')
  invariant(freezeAt instanceof Date && Number.isFinite(freezeAt.getTime()), 'candidate-freeze preparation time is invalid')
  invariant(activationRequirements && Array.isArray(activationRequirements.requirements), 'candidate-freeze external activation ledger is missing')
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(plan)
  if (deploymentProfile.id === PRODUCTION_GRADE_PROFILE_ID) {
    invariant(
      plan.bootstrapBoundary.bootstrapMustPreexistCandidateFreeze === false
        && readiness?.scope === 'release'
        && readiness.profileId === deploymentProfile.id
        && readiness.profileDigest === deploymentProfile.sha256
        && readiness.policyDigest === plan.deploymentProfileBinding.externalActivationPolicy.sha256
        && readiness.digest === proofValueDigest(activationRequirements),
      'candidate-freeze production-grade activation baseline/profile binding is stale or substituted',
    )
    const prerequisite = {
      schemaVersion: 2,
      kind: 'candidate-freeze-profile-prerequisite',
      ready: true,
      planSha256: stagedRolloutPlanDigest(plan),
      deploymentProfileBinding: clone(plan.deploymentProfileBinding),
      freezeAt: freezeAt.toISOString(),
      activationRequiredBeforeFreeze: false,
      activationGatePhase: deploymentProfile.activationReadbackPhase,
      activationBaseline: {
        sha256: proofValueDigest(activationRequirements),
        value: clone(activationRequirements),
      },
      prerequisiteSha256: '',
    }
    prerequisite.prerequisiteSha256 = candidateFreezeBootstrapPrerequisiteDigest(prerequisite)
    return validatePersistedCandidateFreezeBootstrapPrerequisite(prerequisite, {
      plan,
      freezeAt,
    })
  }
  invariant(plan?.bootstrapBoundary?.bootstrapMustPreexistCandidateFreeze === true, 'candidate-freeze maximum-assurance plan does not require managed-CI bootstrap to preexist the freeze')
  const releaseRequirements = activationRequirements.requirements.filter(requirement => requirement.requiredFor?.includes('release'))
  invariant(releaseRequirements.length > 0, 'candidate-freeze has no release-scope external activation requirements')
  const blockerIds = Array.isArray(readiness?.blockers) ? readiness.blockers.map(item => item.id).filter(Boolean) : []
  invariant(
    readiness?.scope === 'release'
      && readiness.ready === true
      && readiness.requiredCount === releaseRequirements.length
      && readiness.activatedCount === releaseRequirements.length
      && blockerIds.length === 0
      && readiness.digest === sha256(stableStringify(activationRequirements, 0)),
    `candidate-freeze requires current release-scope external activation before preparation/signing:${blockerIds.join(',') || 'unproven-readiness'}`,
  )
  invariant(releaseRequirements.every(requirement => requirement.status === 'activated'), 'candidate-freeze release-scope activation contains a non-activated requirement')
  const releaseActivations = releaseRequirements.map(requirement => {
    const observedAt = canonicalDate(requirement.observedAt, `candidate-freeze ${requirement.id} activation observedAt`)
    const expiresAt = canonicalDate(requirement.expiresAt, `candidate-freeze ${requirement.id} activation expiresAt`)
    invariant(observedAt < freezeAt, `candidate-freeze ${requirement.id} activation must predate the prepared freeze`)
    invariant(expiresAt > freezeAt, `candidate-freeze ${requirement.id} activation was not valid through the prepared freeze`)
    invariant(SHA256.test(requirement.evidence?.sha256 ?? ''), `candidate-freeze ${requirement.id} activation evidence digest is invalid`)
    return {
      id: requirement.id,
      kind: requirement.kind,
      observedAt: observedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      evidenceSha256: requirement.evidence.sha256,
    }
  }).sort((left, right) => compareUtf8Bytes(left.id, right.id))
  const managedCi = releaseActivations.filter(requirement => requirement.id === 'activate-managed-ci-trusted-execution')
  invariant(managedCi.length === 1 && managedCi[0].kind === 'managed-ci-attestation', 'candidate-freeze lacks the exact managed-CI activation prerequisite')
  validateRegistryPolicyBinding(attestationPolicy, issuerRegistry, {
    role: 'completion-attestor',
    quorum: attestationPolicy.completionAttestationQuorum,
    now,
    allowUnactivated: false,
  })
  const prerequisite = {
    schemaVersion: 1,
    kind: 'candidate-freeze-bootstrap-prerequisite',
    ready: true,
    planSha256: stagedRolloutPlanDigest(plan),
    deploymentProfileBinding: clone(plan.deploymentProfileBinding),
    externalActivationPolicyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
    activationDigest: readiness.digest,
    attestationPolicySha256: sha256(stableStringify(attestationPolicy, 0)),
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    freezeAt: freezeAt.toISOString(),
    releaseRequirementIds: releaseActivations.map(requirement => requirement.id),
    releaseActivations,
    latestActivationObservedAt: releaseActivations
      .map(item => item.observedAt)
      .sort((left, right) => compareUtf8Bytes(right, left))[0],
    earliestActivationExpiresAt: releaseActivations
      .map(item => item.expiresAt)
      .sort(compareUtf8Bytes)[0],
    managedCiRequirementId: managedCi[0].id,
    managedCiActivationObservedAt: managedCi[0].observedAt,
    requiredRole: 'completion-attestor',
    quorum: attestationPolicy.completionAttestationQuorum,
    prerequisiteSha256: '',
  }
  prerequisite.prerequisiteSha256 = candidateFreezeBootstrapPrerequisiteDigest(prerequisite)
  return validatePersistedCandidateFreezeBootstrapPrerequisite(prerequisite, {
    plan,
    freezeAt,
    attestationPolicy,
    issuerRegistry,
  })
}

function authorityBootstrapMirrorActivationRequirement(activationRequirements) {
  invariant(activationRequirements && Array.isArray(activationRequirements.requirements),
    'candidate freeze durable replay requires the canonical activation ledger')
  const matches = activationRequirements.requirements.filter(requirement => (
    requirement.id === AUTHORITY_BOOTSTRAP_MIRROR_REQUIREMENT_ID
      && requirement.kind === 'durable-evidence-mirror'
      && requirement.repository === 'ajenchen/design-system'
  ))
  invariant(matches.length === 1 && matches[0].status === 'activated',
    'candidate freeze durable replay requires one activated canonical mirror requirement')
  return matches[0]
}

function canonicalCandidateFreezeBootstrapPrerequisites({
  plan,
  now,
  freezeAt = now,
  repoRoot = REPOSITORY_ROOT,
}) {
  const {
    activationInventory,
    activationDesired,
    rings,
    activationRequirements,
    activationPolicy,
    mutationBoundaryContract,
  } = loadReleaseTrustActivationInputs(repoRoot)
  const issuerRegistry = loadIssuerRegistry(resolve(repoRoot, 'infra/governance/trust/issuers.json'))
  const runtimeProfile = readJson(resolve(repoRoot, 'infra/governance/providers/runtime-conformance.json'))
  const readiness = externalActivationReadiness(activationRequirements, {
    scope: 'release',
    inventory: activationInventory,
    desired: activationDesired,
    rings,
    issuerRegistry,
    policy: activationPolicy,
    expectedPolicyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
    mutationBoundaryContract,
    now,
    managedCiValidationContext: { repoRoot, runtimeProfile },
  })
  return validateCandidateFreezeBootstrapPrerequisites({
    plan,
    activationRequirements,
    readiness,
    attestationPolicy: rings.attestationPolicy,
    issuerRegistry,
    now,
    freezeAt,
  })
}

function candidateFreezeUnsignedReceipt({ ledger, plan, policy, actor, issuedAt, expiresAt }) {
  const artifact = stagedRolloutArtifact(ledger.prepareVerification, { trailingNewline: false })
  return {
    schemaVersion: 1,
    kind: 'staged-rollout-phase-receipt',
    phaseId: 'candidate-freeze',
    phaseIndex: 0,
    decision: null,
    planSha256: stagedRolloutPlanDigest(plan),
    priorReceiptSha256: null,
    activeRun: clone(ledger.activeRun),
    actor: clone(actor),
    authority: {
      issuerRegistryDigest: policy.issuerRegistryDigest,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      signatures: [],
    },
    candidateReleaseDigest: null,
    observedAt: ledger.prepareVerification.preparedAt,
    evidence: [{
      contract: 'staged-rollout-prepare-verification-v4',
      origin: 'closed-local-verifier',
      sha256: artifact.sha256,
      uri: `urn:sha256:${artifact.sha256}`,
      artifact: { encoding: artifact.encoding, bytes: artifact.bytes },
    }],
  }
}

function validateCandidateFreezeSigningRequest(request, {
  ledger,
  ledgerRelativePath,
  ledgerSha256,
  plan,
  policy,
  issuerRegistry,
  now,
  requireFresh = true,
}) {
  exactObjectKeys(request, [
    'schemaVersion', 'kind', 'ledger', 'phaseId', 'phaseIndex', 'planSha256', 'activeRun',
    'actor', 'authority', 'unsignedReceipt', 'signingPayload', 'requestSha256',
  ], 'candidate-freeze signing request')
  invariant(request.schemaVersion === 1 && request.kind === 'staged-rollout-signing-request'
    && request.phaseId === 'candidate-freeze' && request.phaseIndex === 0, 'candidate-freeze signing request identity is invalid')
  exactObjectKeys(request.ledger, ['path', 'sha256'], 'candidate-freeze signing request ledger')
  invariant(request.ledger.path === ledgerRelativePath && request.ledger.sha256 === ledgerSha256, 'candidate-freeze signing request references another ledger')
  invariant(request.planSha256 === stagedRolloutPlanDigest(plan) && request.planSha256 === ledger.planSha256, 'candidate-freeze signing request references another plan')
  invariant(stableStringify(request.activeRun, 0) === stableStringify(ledger.activeRun, 0), 'candidate-freeze signing request active run differs from the ledger')
  exactObjectKeys(request.actor, ['id', 'kind', 'authorityRole'], 'candidate-freeze signing request actor')
  invariant(typeof request.actor.id === 'string' && request.actor.id.length > 0
    && ['human', 'workload'].includes(request.actor.kind)
    && request.actor.authorityRole === 'completion-attestor', 'candidate-freeze signing request actor is invalid')
  exactObjectKeys(request.authority, ['issuerRegistryDigest', 'issuedAt', 'expiresAt', 'requiredRole', 'quorum'], 'candidate-freeze signing request authority')
  const issuedAt = canonicalDate(request.authority.issuedAt, 'candidate-freeze signing request issuedAt')
  const expiresAt = canonicalDate(request.authority.expiresAt, 'candidate-freeze signing request expiresAt')
  invariant(request.authority.issuerRegistryDigest === policy.issuerRegistryDigest
    && request.authority.issuerRegistryDigest === issuerRegistryDigest(issuerRegistry)
    && request.authority.requiredRole === 'completion-attestor'
    && request.authority.quorum === policy.completionAttestationQuorum, 'candidate-freeze signing request authority policy is stale')
  invariant(expiresAt > issuedAt
    && expiresAt.getTime() - issuedAt.getTime() <= policy.maxCompletionTtlMinutes * 60 * 1000, 'candidate-freeze signing request TTL is invalid')
  if (requireFresh) invariant(issuedAt.getTime() <= now.getTime() + policy.clockSkewSeconds * 1000 && expiresAt > now, 'candidate-freeze signing request is not currently fresh')
  validateRegistryPolicyBinding(policy, issuerRegistry, {
    role: 'completion-attestor',
    quorum: policy.completionAttestationQuorum,
    now: issuedAt,
    allowUnactivated: false,
  })
  const eligibleSubjects = new Set(policy.allowedKeyIds.map(keyId => resolvePolicyIssuer(policy, issuerRegistry, keyId, {
    role: 'completion-attestor', at: issuedAt, validThrough: expiresAt,
  }).subject))
  invariant(eligibleSubjects.has(request.actor.id), 'candidate-freeze signing request actor is not an eligible completion-attestor subject')
  const expectedReceipt = candidateFreezeUnsignedReceipt({ ledger, plan, policy, actor: request.actor, issuedAt, expiresAt })
  invariant(stableStringify(request.unsignedReceipt, 0) === stableStringify(expectedReceipt, 0), 'candidate-freeze signing request receipt template is substituted')
  exactObjectKeys(request.signingPayload, ['domain', 'encoding', 'bytes', 'sha256'], 'candidate-freeze signing request payload')
  const payload = phaseReceiptSigningPayload(expectedReceipt)
  invariant(request.signingPayload.domain === 'qijenchen-staged-rollout-phase-receipt-v1'
    && request.signingPayload.encoding === 'base64'
    && request.signingPayload.bytes === payload.toString('base64')
    && request.signingPayload.sha256 === sha256(payload), 'candidate-freeze signing request payload is not derived from the exact receipt')
  invariant(request.requestSha256 === stagedRolloutSigningRequestDigest(request), 'candidate-freeze signing request content address is invalid')
  return { issuedAt, expiresAt, receipt: expectedReceipt }
}

export function createCanonicalCandidateFreezeSigningRequest(options = {}) {
  rejectCanonicalClockInjection(options, 'canonical candidate-freeze signing request')
  const allowedKeys = new Set(['evidenceRoot', 'actorId', 'actorKind'])
  invariant(Object.keys(options).every(key => allowedKeys.has(key)), 'canonical candidate-freeze signing request has unsupported/injectable options')
  const evidenceRoot = options.evidenceRoot ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null
  const activeRun = loadActiveDeepAuditRun({ repoRoot: REPOSITORY_ROOT, explicitRoot: evidenceRoot, requireCurrent: true })
  const paths = candidateFreezeRuntimePaths(activeRun.manifest.runId)
  const ledgerRead = canonicalRuntimeJson(activeRun, evidenceRoot, paths.preparedLedger, 'prepared staged-rollout ledger')
  const context = loadCanonicalStagedRolloutContext({ ledgerPath: ledgerRead.absolute, evidenceRoot, now: new Date() })
  invariant(context.validation.nextPhase === 'candidate-freeze' && context.ledger.receipts.length === 0 && context.ledger.prepareVerification, 'candidate-freeze signing request requires one prepared zero-receipt ledger')
  const freezeAt = canonicalDate(context.ledger.prepareVerification.preparedAt, 'candidate-freeze preparedAt')
  const prerequisite = canonicalCandidateFreezeBootstrapPrerequisites({ plan: context.plan, now: new Date(), freezeAt })
  invariant(
    prerequisite.prerequisiteSha256 === context.ledger.prepareVerification.bootstrapPrerequisite.prerequisiteSha256,
    'candidate-freeze signing request bootstrap prerequisite differs from the prepared freeze',
  )
  const policy = readUniqueJson(resolve(GOVERNANCE_ROOT, 'release-rings.json'), 'canonical release rings').value.attestationPolicy
  const issuerRegistry = loadIssuerRegistry(DEFAULT_ISSUER_REGISTRY_PATH)
  const now = new Date()
  validateRegistryPolicyBinding(policy, issuerRegistry, {
    role: 'completion-attestor', quorum: policy.completionAttestationQuorum, now, allowUnactivated: false,
  })
  const eligible = policy.allowedKeyIds.map(keyId => resolvePolicyIssuer(policy, issuerRegistry, keyId, {
    role: 'completion-attestor', at: now, validThrough: now,
  }))
  const actorId = options.actorId ?? (new Set(eligible.map(item => item.subject)).size === 1 ? eligible[0].subject : null)
  invariant(typeof actorId === 'string' && eligible.some(item => item.subject === actorId), 'candidate-freeze signing request requires one explicit eligible completion-attestor actor')
  const actor = { id: actorId, kind: options.actorKind ?? 'workload', authorityRole: 'completion-attestor' }
  invariant(['human', 'workload'].includes(actor.kind), 'candidate-freeze signing request actor kind is invalid')
  const expiresAt = new Date(now.getTime() + Math.min(60, policy.maxCompletionTtlMinutes) * 60 * 1000)
  const unsignedReceipt = candidateFreezeUnsignedReceipt({ ledger: context.ledger, plan: context.plan, policy, actor, issuedAt: now, expiresAt })
  const payload = phaseReceiptSigningPayload(unsignedReceipt)
  const request = {
    schemaVersion: 1,
    kind: 'staged-rollout-signing-request',
    ledger: { path: paths.preparedLedger, sha256: sha256(ledgerRead.bytes) },
    phaseId: 'candidate-freeze',
    phaseIndex: 0,
    planSha256: context.ledger.planSha256,
    activeRun: clone(context.ledger.activeRun),
    actor,
    authority: {
      issuerRegistryDigest: policy.issuerRegistryDigest,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      requiredRole: 'completion-attestor',
      quorum: policy.completionAttestationQuorum,
    },
    unsignedReceipt,
    signingPayload: {
      domain: 'qijenchen-staged-rollout-phase-receipt-v1',
      encoding: 'base64',
      bytes: payload.toString('base64'),
      sha256: sha256(payload),
    },
    requestSha256: '',
  }
  request.requestSha256 = stagedRolloutSigningRequestDigest(request)
  validateCandidateFreezeSigningRequest(request, {
    ledger: context.ledger, ledgerRelativePath: paths.preparedLedger, ledgerSha256: sha256(ledgerRead.bytes),
    plan: context.plan, policy, issuerRegistry, now, requireFresh: true,
  })
  const finalPrerequisite = canonicalCandidateFreezeBootstrapPrerequisites({ plan: context.plan, now: new Date(), freezeAt })
  invariant(finalPrerequisite.prerequisiteSha256 === prerequisite.prerequisiteSha256, 'candidate-freeze bootstrap prerequisites changed while the signing request was prepared')
  currentSnapshotBinding(activeRun)
  const requestPath = prepareRuntimeEvidenceFile({ repoRoot: activeRun.repository, explicitRoot: evidenceRoot, relativePath: paths.signingRequest })
  const bytes = Buffer.from(stableStringify(request, 0), 'utf8')
  writeExclusiveRuntimeBytes(requestPath, bytes, 'candidate-freeze signing request')
  return {
    schemaVersion: 1,
    kind: 'staged-rollout-signing-request-report',
    mutatesExternalState: false,
    path: requestPath,
    relativePath: paths.signingRequest,
    requestSha256: request.requestSha256,
    signingPayloadSha256: request.signingPayload.sha256,
    expiresAt: request.authority.expiresAt,
    requiredRole: request.authority.requiredRole,
    quorum: request.authority.quorum,
    signatureBundlePath: paths.signatureBundle,
  }
}

export function appendCanonicalCandidateFreezeReceipt(options = {}) {
  rejectCanonicalClockInjection(options, 'canonical candidate-freeze receipt append')
  const allowedKeys = new Set(['evidenceRoot'])
  invariant(Object.keys(options).every(key => allowedKeys.has(key)), 'canonical candidate-freeze receipt append has unsupported/injectable options')
  const evidenceRoot = options.evidenceRoot ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null
  const activeRun = loadActiveDeepAuditRun({ repoRoot: REPOSITORY_ROOT, explicitRoot: evidenceRoot, requireCurrent: true })
  const paths = candidateFreezeRuntimePaths(activeRun.manifest.runId)
  const ledgerRead = canonicalRuntimeJson(activeRun, evidenceRoot, paths.preparedLedger, 'prepared staged-rollout ledger')
  const requestRead = canonicalRuntimeJson(activeRun, evidenceRoot, paths.signingRequest, 'candidate-freeze signing request')
  const bundleRead = canonicalRuntimeJson(activeRun, evidenceRoot, paths.signatureBundle, 'candidate-freeze signature bundle')
  const context = loadCanonicalStagedRolloutContext({ ledgerPath: ledgerRead.absolute, evidenceRoot, now: new Date() })
  invariant(context.validation.nextPhase === 'candidate-freeze' && context.ledger.receipts.length === 0, 'candidate-freeze append requires the prepared zero-receipt ledger')
  const freezeAt = canonicalDate(context.ledger.prepareVerification.preparedAt, 'candidate-freeze preparedAt')
  const prerequisite = canonicalCandidateFreezeBootstrapPrerequisites({ plan: context.plan, now: new Date(), freezeAt })
  invariant(
    prerequisite.prerequisiteSha256 === context.ledger.prepareVerification.bootstrapPrerequisite.prerequisiteSha256,
    'candidate-freeze append bootstrap prerequisite differs from the prepared freeze',
  )
  const policy = readUniqueJson(resolve(GOVERNANCE_ROOT, 'release-rings.json'), 'canonical release rings').value.attestationPolicy
  const issuerRegistry = loadIssuerRegistry(DEFAULT_ISSUER_REGISTRY_PATH)
  const now = new Date()
  const requestValidation = validateCandidateFreezeSigningRequest(requestRead.value, {
    ledger: context.ledger, ledgerRelativePath: paths.preparedLedger, ledgerSha256: sha256(ledgerRead.bytes),
    plan: context.plan, policy, issuerRegistry, now, requireFresh: true,
  })
  exactObjectKeys(bundleRead.value, ['schemaVersion', 'kind', 'requestSha256', 'signatures'], 'candidate-freeze signature bundle')
  invariant(bundleRead.value.schemaVersion === 1 && bundleRead.value.kind === 'staged-rollout-signature-bundle'
    && bundleRead.value.requestSha256 === requestRead.value.requestSha256, 'candidate-freeze signature bundle targets another request')
  invariant(Array.isArray(bundleRead.value.signatures) && bundleRead.value.signatures.length >= policy.completionAttestationQuorum
    && bundleRead.value.signatures.length <= 5, 'candidate-freeze signature bundle has invalid cardinality')
  const receipt = clone(requestValidation.receipt)
  receipt.authority.signatures = clone(bundleRead.value.signatures)
  invariant(requestValidation.expiresAt > now, 'candidate-freeze signing request expired before append')
  verifyReceiptAuthority(receipt, policy, issuerRegistry, now)
  const ledger = clone(context.ledger)
  ledger.receipts.push(receipt)
  const runs = loadCanonicalRuns(ledger, evidenceRoot)
  const canonicalBindings = canonicalInputBindings(runs, context.plan)
  const validation = validateStagedRolloutLedger(context.plan, ledger, {
    activeRun: runs.freezeRun,
    certificationRun: runs.certificationRun,
    issuerRegistry,
    attestationPolicy: policy,
    now,
    repoRoot: REPOSITORY_ROOT,
    schemaPath: DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH,
    verifyMechanisms: true,
    activationReadinessResolver: externalActivationReadiness,
    contractValidators: null,
    canonicalAuthority: CANONICAL_VALIDATION_AUTHORITY,
    canonicalBindings,
  })
  invariant(validation.productionEligible && validation.completedPhases.length === 1
    && validation.completedPhases[0] === 'candidate-freeze' && validation.nextPhase === 'github-policy-bootstrap', 'candidate-freeze append did not produce the exact one-phase canonical transition')
  const finalPrerequisite = canonicalCandidateFreezeBootstrapPrerequisites({ plan: context.plan, now: new Date(), freezeAt })
  invariant(finalPrerequisite.prerequisiteSha256 === prerequisite.prerequisiteSha256, 'candidate-freeze bootstrap prerequisites changed while the signed receipt was appended')
  currentSnapshotBinding(activeRun)
  const output = prepareRuntimeEvidenceFile({ repoRoot: activeRun.repository, explicitRoot: evidenceRoot, relativePath: paths.completedLedger })
  const bytes = Buffer.from(stableStringify(ledger, 0), 'utf8')
  writeExclusiveRuntimeBytes(output, bytes, 'candidate-freeze completed ledger')
  return {
    schemaVersion: 1,
    kind: 'staged-rollout-receipt-append-report',
    mutatesExternalState: false,
    sourceLedgerSha256: sha256(ledgerRead.bytes),
    requestSha256: requestRead.value.requestSha256,
    signatureBundleSha256: sha256(bundleRead.bytes),
    path: output,
    relativePath: paths.completedLedger,
    ledgerSha256: sha256(bytes),
    receiptSha256: stagedRolloutReceiptDigest(receipt),
    completedPhases: validation.completedPhases,
    nextPhase: validation.nextPhase,
  }
}

function verifyReceiptAuthority(receipt, policy, issuerRegistry, now) {
  const issuedAt = canonicalDate(receipt.authority.issuedAt, `${receipt.phaseId} receipt issuedAt`)
  const expiresAt = canonicalDate(receipt.authority.expiresAt, `${receipt.phaseId} receipt expiresAt`)
  const observedAt = canonicalDate(receipt.observedAt, `${receipt.phaseId} receipt observedAt`)
  validateRegistryPolicyBinding(policy, issuerRegistry, {
    role: 'completion-attestor',
    quorum: policy.completionAttestationQuorum,
    now: issuedAt,
    allowUnactivated: false,
  })
  invariant(receipt.authority.issuerRegistryDigest === policy.issuerRegistryDigest, `${receipt.phaseId} receipt authority policy digest mismatch`)
  invariant(receipt.authority.issuerRegistryDigest === issuerRegistryDigest(issuerRegistry), `${receipt.phaseId} receipt issuer registry digest mismatch`)
  invariant(expiresAt > issuedAt, `${receipt.phaseId} receipt expiry must follow issuance`)
  invariant(issuedAt >= observedAt, `${receipt.phaseId} receipt cannot be signed before its readback was observed`)
  invariant(expiresAt.getTime() - issuedAt.getTime() <= policy.maxCompletionTtlMinutes * 60 * 1000, `${receipt.phaseId} receipt exceeds completion-attestation TTL`)
  invariant(issuedAt.getTime() <= now.getTime() + policy.clockSkewSeconds * 1000, `${receipt.phaseId} receipt was issued in the future`)
  const signatures = receipt.authority.signatures
  invariant(new Set(signatures.map(item => item.signerKeyId)).size === signatures.length, `${receipt.phaseId} receipt signer keys must be distinct`)
  invariant(new Set(signatures.map(item => item.subject)).size === signatures.length, `${receipt.phaseId} receipt signer subjects must be distinct`)
  invariant(signatures.some(item => item.subject === receipt.actor.id), `${receipt.phaseId} receipt actor must be one of the authorized signer subjects`)
  let verified = 0
  for (const item of signatures) {
    const issuer = resolvePolicyIssuer(policy, issuerRegistry, item.signerKeyId, {
      role: 'completion-attestor',
      at: issuedAt,
      validThrough: expiresAt,
    })
    invariant(issuer.subject === item.subject, `${receipt.phaseId} receipt signer subject is not registered for the key`)
    const signature = Buffer.from(item.signature, 'base64url')
    invariant(signature.length === 64 && signature.toString('base64url') === item.signature, `${receipt.phaseId} receipt signature encoding is invalid`)
    invariant(verify(null, phaseReceiptSigningPayload(receipt), publicKeyFromIssuer(issuer), signature), `${receipt.phaseId} receipt signature is invalid`)
    verified += 1
  }
  invariant(verified >= policy.completionAttestationQuorum, `${receipt.phaseId} receipt lacks completion-attestor quorum ${policy.completionAttestationQuorum}`)
}

function selectedVariant(phase, decision) {
  if (phase.id !== 'promotion-or-rollback') {
    invariant(decision === null || decision === undefined, `${phase.id} cannot select a promotion/rollback decision`)
    return {
      capabilities: phase.capabilities.standard,
      evidenceContracts: phase.evidenceContracts.standard,
    }
  }
  invariant(decision === 'promotion' || decision === 'rollback', 'final phase must select exactly promotion or rollback')
  return {
    capabilities: phase.capabilities[decision],
    evidenceContracts: phase.evidenceContracts[decision],
  }
}

function authorityDesired(repoRoot, at) {
  const desired = readJson(resolve(repoRoot, 'infra/governance/desired/github.json'))
  const inventory = readJson(resolve(repoRoot, 'infra/governance/inventory/managed-repos.json'))
  const rings = readJson(resolve(repoRoot, 'infra/governance/release-rings.json'))
  const runtimeProfile = readJson(resolve(repoRoot, 'infra/governance/providers/runtime-conformance.json'))
  validateDeterministicGovernanceModel({
    inventory,
    desired,
    rings,
    runtimeProfile,
    issuerRegistry: loadIssuerRegistry(DEFAULT_ISSUER_REGISTRY_PATH),
    now: at,
  })
  const profile = desired.profiles['design-system-authority']
  invariant(profile, 'design-system authority desired profile is missing')
  const repo = inventory.repositories.find(item => item.id === 'design-system')
  invariant(repo?.github === 'ajenchen/design-system' && repo.desiredProfile === 'design-system-authority', 'design-system authority inventory identity is invalid')
  return { desired, profile, inventory, rings, repo }
}

function gitObjectId(kind, bytes) {
  invariant(Buffer.isBuffer(bytes), `Git ${kind} bytes must be a buffer`)
  return createHash('sha1').update(Buffer.from(`${kind} ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex')
}

function candidateFreezeCommitBytes(treeOid, activeRun, artifactSha256) {
  const manifest = activeRun.manifest
  const timestamp = canonicalDate(manifest.createdAt, 'candidate freeze active-run createdAt')
  const epochSeconds = Math.floor(timestamp.getTime() / 1000)
  return Buffer.from([
    `tree ${treeOid}`,
    `parent ${manifest.head}`,
    `author ${CANDIDATE_FREEZE_COMMIT_IDENTITY} ${epochSeconds} +0000`,
    `committer ${CANDIDATE_FREEZE_COMMIT_IDENTITY} ${epochSeconds} +0000`,
    '',
    `candidate freeze ${manifest.runId}`,
    `manifest-sha256 ${activeRun.manifestSha256}`,
    `inventory-sha256 ${manifest.inventoryDigest}`,
    `artifact-sha256 ${artifactSha256}`,
    '',
  ].join('\n'), 'utf8')
}

function canonicalArtifactBytes(value, label) {
  invariant(typeof value === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(value), `${label} is not base64`)
  const bytes = Buffer.from(value, 'base64')
  invariant(bytes.toString('base64') === value, `${label} is not canonical base64`)
  return bytes
}

function gitTreeOid(entries) {
  const root = { files: new Map(), directories: new Map() }
  for (const entry of entries) {
    const segments = entry.path.split('/')
    let cursor = root
    for (const segment of segments.slice(0, -1)) {
      if (!cursor.directories.has(segment)) cursor.directories.set(segment, { files: new Map(), directories: new Map() })
      cursor = cursor.directories.get(segment)
    }
    const name = segments.at(-1)
    invariant(!cursor.files.has(name) && !cursor.directories.has(name), `Git tree projection has a path collision at ${entry.path}`)
    cursor.files.set(name, entry)
  }
  const hashTree = node => {
    const children = [
      ...[...node.files].map(([name, entry]) => ({ name, sort: Buffer.from(name), mode: entry.mode, oid: entry.blobOid })),
      ...[...node.directories].map(([name, child]) => ({ name, sort: Buffer.from(`${name}/`), mode: '40000', oid: hashTree(child) })),
    ].sort((left, right) => Buffer.compare(left.sort, right.sort))
    const bytes = Buffer.concat(children.map(child => Buffer.concat([
      Buffer.from(`${child.mode} ${child.name}\0`, 'utf8'),
      Buffer.from(child.oid, 'hex'),
    ])))
    return gitObjectId('tree', bytes)
  }
  return hashTree(root)
}

function frozenArtifactBytes(proof, activeRun, { requireExternalArtifact }) {
  exactObjectKeys(proof.artifact, ['format', 'storage', 'path', 'bytes', 'sha256', 'contentBase64'], 'candidate freeze content artifact')
  const artifact = proof.artifact
  invariant(artifact.format === CANDIDATE_FREEZE_ARTIFACT_FORMAT && Number.isSafeInteger(artifact.bytes) && artifact.bytes >= CANDIDATE_FREEZE_BUNDLE_MAGIC.length
    && SHA256.test(artifact.sha256 ?? ''), 'candidate freeze content artifact identity is invalid')
  let bytes
  if (artifact.storage === 'embedded-fixture') {
    invariant(!requireExternalArtifact, 'canonical candidate freeze forbids an embedded content artifact')
    invariant(artifact.path === null && typeof artifact.contentBase64 === 'string', 'embedded candidate freeze artifact locator is invalid')
    bytes = canonicalArtifactBytes(artifact.contentBase64, 'embedded candidate freeze content artifact')
  } else {
    invariant(artifact.storage === 'git-runtime-evidence' && artifact.contentBase64 === null, 'candidate freeze artifact storage is unregistered')
    invariant(artifact.path === `staged-rollout/artifacts/sha256/${artifact.sha256}.freeze`, 'candidate freeze content artifact path is not derived from its digest')
    invariant(activeRun?.repository && activeRun?.evidenceRoot, 'external candidate freeze artifact lacks canonical runtime-evidence authority')
    const absolute = resolveRuntimeEvidencePath({
      repoRoot: activeRun.repository,
      explicitRoot: activeRun.evidenceRoot,
      relativePath: artifact.path,
    })
    const before = lstatSync(absolute)
    invariant(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && realpathSync(absolute) === absolute, 'candidate freeze content artifact must be a unique regular no-symlink file')
    bytes = readFileSync(absolute)
    const after = lstatSync(absolute)
    invariant(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, 'candidate freeze content artifact changed while it was read')
  }
  invariant(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256, 'candidate freeze content artifact bytes differ from their descriptor')
  invariant(bytes.subarray(0, CANDIDATE_FREEZE_BUNDLE_MAGIC.length).equals(CANDIDATE_FREEZE_BUNDLE_MAGIC), 'candidate freeze content artifact magic/version is invalid')
  return bytes
}

function validateFrozenGitObjectProof(proof, activeRun, { requireExternalArtifact = false } = {}) {
  exactObjectKeys(proof, ['schemaVersion', 'kind', 'objectFormat', 'artifact', 'entries', 'treeOid', 'commit'], 'protected PR Git object proof')
  invariant(proof.schemaVersion === 2 && proof.kind === 'frozen-git-object-proof' && proof.objectFormat === 'sha1', 'protected PR Git object proof identity/object format is invalid or stale')
  const expectedRows = activeRun.manifest.inventory.filter(row => row.kind !== 'missing')
  invariant(expectedRows.length > 0, 'protected PR frozen Git projection is empty')
  invariant(Array.isArray(proof.entries) && proof.entries.length === expectedRows.length, 'protected PR Git projection omits or adds frozen paths')
  invariant(stableStringify(proof.entries.map(item => item.path), 0) === stableStringify(expectedRows.map(item => item.path), 0), 'protected PR Git projection path order/set differs from the frozen manifest')
  const artifactBytes = frozenArtifactBytes(proof, activeRun, { requireExternalArtifact })
  let nextOffset = CANDIDATE_FREEZE_BUNDLE_MAGIC.length
  const blobs = new Map()
  for (const [index, entry] of proof.entries.entries()) {
    const row = expectedRows[index]
    exactObjectKeys(entry, ['path', 'kind', 'mode', 'bytes', 'sha256', 'blobOid', 'offset'], `protected PR Git entry ${row.path}`)
    invariant(entry.path === row.path && entry.kind === row.kind, `protected PR Git entry ${row.path} identity differs from the frozen row`)
    invariant(['file', 'symlink'].includes(row.kind), `protected PR frozen row ${row.path} has unsupported Git kind ${row.kind}`)
    const expectedMode = row.kind === 'symlink' ? '120000' : row.mode === '100755' ? '100755' : '100644'
    invariant(entry.mode === expectedMode && row.mode === expectedMode, `protected PR Git entry ${row.path} mode differs from the frozen row`)
    invariant(entry.bytes === row.bytes && entry.sha256 === row.sha256 && Number.isSafeInteger(entry.offset), `protected PR Git entry ${row.path} metadata differs from the frozen row`)
    const blobKey = `${entry.sha256}:${entry.blobOid}:${entry.bytes}`
    const priorOffset = blobs.get(blobKey)
    if (priorOffset === undefined) {
      invariant(entry.offset === nextOffset && entry.offset + entry.bytes <= artifactBytes.length, `protected PR Git entry ${row.path} artifact offset is non-canonical or out of bounds`)
      blobs.set(blobKey, entry.offset)
      nextOffset += entry.bytes
    } else invariant(entry.offset === priorOffset, `protected PR duplicate blob ${row.path} does not reuse its canonical artifact offset`)
    const bytes = artifactBytes.subarray(entry.offset, entry.offset + entry.bytes)
    invariant(bytes.length === row.bytes && sha256(bytes) === row.sha256, `protected PR Git entry ${row.path} bytes differ from the frozen row SHA-256`)
    invariant(entry.blobOid === gitObjectId('blob', bytes), `protected PR Git entry ${row.path} blob OID is invalid`)
  }
  invariant(nextOffset === artifactBytes.length, 'candidate freeze content artifact contains unreferenced or trailing bytes')
  const treeOid = gitTreeOid(proof.entries)
  invariant(proof.treeOid === treeOid, 'protected PR recursive Git tree OID does not match the frozen projection')
  exactObjectKeys(proof.commit, ['encoding', 'bytes', 'oid'], 'protected PR Git commit object')
  invariant(proof.commit.encoding === 'base64', 'protected PR Git commit object encoding is invalid')
  const commitBytes = canonicalArtifactBytes(proof.commit.bytes, 'protected PR Git commit object bytes')
  invariant(proof.commit.oid === gitObjectId('commit', commitBytes), 'protected PR Git commit OID is invalid')
  const expectedCommitBytes = candidateFreezeCommitBytes(treeOid, activeRun, proof.artifact.sha256)
  invariant(commitBytes.equals(expectedCommitBytes), 'protected PR Git commit object parent/identity/time/message is not the canonical candidate-freeze projection')
  return { sourceCommit: proof.commit.oid, sourceTree: treeOid }
}

function sameFileIdentity(before, after) {
  return before.dev === after.dev
    && before.ino === after.ino
    && before.mode === after.mode
    && before.nlink === after.nlink
    && before.size === after.size
    && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs
}

function assertFrozenPathAncestors(repository, repoPath) {
  const root = realpathSync(repository)
  const segments = repoPath.split('/')
  let cursor = root
  for (const segment of segments.slice(0, -1)) {
    cursor = resolve(cursor, segment)
    const info = lstatSync(cursor)
    invariant(info.isDirectory() && !info.isSymbolicLink(), `candidate freeze path crosses a non-directory or symlink ancestor:${repoPath}`)
  }
  return resolve(root, ...segments)
}

function readFrozenRowBytes(repository, row) {
  invariant(row.kind === 'file' || row.kind === 'symlink', `candidate freeze cannot read unsupported inventory kind:${row.path}:${row.kind}`)
  const absolute = assertFrozenPathAncestors(repository, row.path)
  if (row.kind === 'symlink') {
    const before = lstatSync(absolute)
    invariant(before.isSymbolicLink() && before.nlink === 1 && row.mode === '120000', `candidate freeze symlink identity/mode is unsafe:${row.path}`)
    const bytes = Buffer.from(readlinkSync(absolute, { encoding: 'buffer' }))
    const after = lstatSync(absolute)
    invariant(sameFileIdentity(before, after), `candidate freeze symlink changed while being read:${row.path}`)
    invariant(bytes.length === row.bytes && sha256(bytes) === row.sha256, `candidate freeze symlink bytes differ from the active inventory:${row.path}`)
    return bytes
  }
  let descriptor
  try {
    descriptor = openSync(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const before = fstatSync(descriptor)
    invariant(before.isFile() && before.nlink === 1, `candidate freeze file must be one unique regular file:${row.path}`)
    invariant(before.size === row.bytes && before.size <= 32 * 1024 * 1024, `candidate freeze file size is invalid or exceeds 32 MiB:${row.path}`)
    const expectedMode = (before.mode & 0o111) !== 0 ? '100755' : '100644'
    invariant(row.mode === expectedMode, `candidate freeze executable mode differs from the active inventory:${row.path}`)
    const bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor)
    invariant(sameFileIdentity(before, after), `candidate freeze file changed while being read:${row.path}`)
    invariant(bytes.length === row.bytes && sha256(bytes) === row.sha256, `candidate freeze file bytes differ from the active inventory:${row.path}`)
    return bytes
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function currentSnapshotBinding(activeRun) {
  const observed = captureDeepAuditSnapshot(activeRun.repository)
  const expected = candidateFreezeSnapshotBinding(activeRun)
  const binding = {
    runId: expected.runId,
    manifestSha256: expected.manifestSha256,
    head: observed.head,
    tree: observed.tree,
    indexDigest: observed.indexDigest,
    inventoryDigest: observed.inventoryDigest,
    worktreeFingerprint: observed.worktreeFingerprint,
  }
  invariant(stableStringify(binding, 0) === stableStringify(expected, 0), 'candidate freeze worktree/index changed during proof production')
  return binding
}

function checkEntrypointSha(activeRun, producer) {
  const row = activeRun.manifest.inventory.find(item => item.path === producer)
  invariant(row?.kind === 'file', `candidate freeze producer is absent from the active inventory:${producer}`)
  const current = readFrozenRowBytes(activeRun.repository, row)
  invariant(sha256(current) === row.sha256, `candidate freeze producer changed:${producer}`)
  return row.sha256
}

function allHarnessCheck(activeRun) {
  invariant(process.env.GOVERNANCE_HARNESS_ACTIVE !== '1', 'candidate freeze cannot run inside All-Harness; consume the receipt only after All-Harness completes')
  const expected = CANDIDATE_FREEZE_CHECKS[0]
  const snapshotBefore = currentSnapshotBinding(activeRun)
  const entrypointSha256 = checkEntrypointSha(activeRun, expected.producer)
  const path = resolve(activeRun.repository, ALL_HARNESS_RECEIPT_RELATIVE_PATH)
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(path) === path, 'candidate freeze All-Harness receipt must be a unique regular no-symlink file')
  const startedAt = new Date()
  const before = readFileSync(path)
  let receipt
  try { receipt = JSON.parse(before.toString('utf8')) } catch (error) { throw new Error(`candidate freeze All-Harness receipt is invalid JSON: ${error.message}`) }
  validateAllHarnessReceipt(receipt, { repoRoot: activeRun.repository, now: startedAt })
  const after = readFileSync(path)
  invariant(before.equals(after), 'candidate freeze All-Harness receipt changed during readback')
  const finishedAt = new Date()
  validateAllHarnessReceipt(receipt, { repoRoot: activeRun.repository, now: finishedAt })
  const snapshotAfter = currentSnapshotBinding(activeRun)
  const evidenceSha256 = sha256(before)
  return {
    id: expected.id,
    producer: expected.producer,
    mode: 'completed-receipt-readback',
    argv: [...expected.argv],
    entrypointSha256,
    exitCode: 0,
    signal: null,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    snapshotBefore,
    snapshotAfter,
    result: {
      schemaVersion: 1,
      kind: expected.resultKind,
      status: 'passed',
      artifactSha256: evidenceSha256,
      detail: {
        receiptSha256: receipt.receiptSha256,
        completedAt: receipt.completedAt,
        expiresAt: receipt.expiresAt,
        registeredLocalSourceCount: receipt.runner.registeredLocalSourceCount,
        localSourceProjectionSha256: receipt.result.localSourceProjectionSha256,
        gitVisibleWorktreeDigest: receipt.subject.gitVisibleWorktree.digest,
      },
    },
    evidenceSha256,
    artifact: { encoding: 'base64', bytes: before.toString('base64') },
  }
}

function buildGraphCheck(activeRun) {
  const expected = CANDIDATE_FREEZE_CHECKS[1]
  const snapshotBefore = currentSnapshotBinding(activeRun)
  const entrypointSha256 = checkEntrypointSha(activeRun, expected.producer)
  const isolatedHome = mkdtempSync(resolve(tmpdir(), 'candidate-freeze-build-graph-'))
  const startedAt = new Date()
  let execution
  try {
    const environment = sanitizeHarnessEnvironment(process.env, { isolatedHome })
    environment.GOVERNANCE_READ_ONLY = '1'
    execution = spawnSync(process.execPath, expected.argv.slice(1), {
      cwd: activeRun.repository,
      env: environment,
      encoding: 'utf8',
      shell: false,
      timeout: 15 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } finally {
    rmSync(isolatedHome, { recursive: true, force: true })
  }
  const finishedAt = new Date()
  const snapshotAfter = currentSnapshotBinding(activeRun)
  invariant(!execution.error && execution.status === 0 && execution.signal === null, `candidate freeze governance build graph failed:${execution.error?.message ?? execution.status ?? execution.signal ?? 'unknown'}`)
  const transcript = {
    schemaVersion: 1,
    kind: 'governance-build-graph-check-transcript',
    stdout: execution.stdout ?? '',
    stderr: execution.stderr ?? '',
  }
  const bytes = Buffer.from(stableStringify(transcript, 0), 'utf8')
  const stages = [...transcript.stdout.matchAll(/^\u2192 governance build graph check:([a-z0-9-]+)$/gm)].map(match => match[1])
  exactList(stages, CANDIDATE_FREEZE_BUILD_GRAPH_STAGES, 'candidate freeze production governance build-graph stages')
  const evidenceSha256 = sha256(bytes)
  return {
    id: expected.id,
    producer: expected.producer,
    mode: 'isolated-local-process',
    argv: [...expected.argv],
    entrypointSha256,
    exitCode: execution.status,
    signal: execution.signal,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    snapshotBefore,
    snapshotAfter,
    result: {
      schemaVersion: 1,
      kind: expected.resultKind,
      status: 'passed',
      artifactSha256: evidenceSha256,
      detail: { stageIds: [...CANDIDATE_FREEZE_BUILD_GRAPH_STAGES] },
    },
    evidenceSha256,
    artifact: { encoding: 'base64', bytes: bytes.toString('base64') },
  }
}

function writeExclusiveRuntimeBytes(path, bytes, label) {
  const parent = dirname(path)
  const temporary = resolve(parent, `.${path.split(sep).at(-1)}.${process.pid}.${randomUUID()}.tmp`)
  let descriptor
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    linkSync(temporary, path)
    unlinkSync(temporary)
    const directory = openSync(parent, 'r')
    try { fsyncSync(directory) } finally { closeSync(directory) }
  } catch (error) {
    throw new Error(`${label} cannot be created atomically without clobbering:${error.message}`)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  return path
}

function buildAndWriteCandidateFreezeGitProof(activeRun, evidenceRoot) {
  const format = runClosedGit(['rev-parse', '--show-object-format'], {
    cwd: resolve(activeRun.repository),
    timeoutMs: 5000,
  })
  invariant(format.status === 0 && format.stdout.trim() === 'sha1', 'candidate freeze currently supports only an explicitly identified SHA-1 Git object format')
  const rows = activeRun.manifest.inventory.filter(row => row.kind !== 'missing')
  invariant(rows.length > 0 && rows.length <= 10_000, 'candidate freeze inventory row count is empty or exceeds 10,000')
  invariant(rows.reduce((sum, row) => sum + row.bytes, 0) <= 128 * 1024 * 1024, 'candidate freeze raw inventory exceeds 128 MiB')
  const chunks = [CANDIDATE_FREEZE_BUNDLE_MAGIC]
  const blobs = new Map()
  const entries = []
  let offset = CANDIDATE_FREEZE_BUNDLE_MAGIC.length
  for (const row of rows) {
    const bytes = readFrozenRowBytes(activeRun.repository, row)
    const blobOid = gitObjectId('blob', bytes)
    const key = `${row.sha256}:${blobOid}:${row.bytes}`
    let blob = blobs.get(key)
    if (!blob) {
      blob = { offset, bytes }
      blobs.set(key, blob)
      chunks.push(bytes)
      offset += bytes.length
    } else invariant(blob.bytes.equals(bytes), `candidate freeze duplicate blob digest collision:${row.path}`)
    entries.push({
      path: row.path,
      kind: row.kind,
      mode: row.mode,
      bytes: row.bytes,
      sha256: row.sha256,
      blobOid,
      offset: blob.offset,
    })
  }
  const content = Buffer.concat(chunks, offset)
  const artifactSha256 = sha256(content)
  ensureRuntimeEvidenceDirectory({ repoRoot: activeRun.repository, explicitRoot: evidenceRoot, relativePath: 'staged-rollout/artifacts/sha256' })
  const artifactPath = `staged-rollout/artifacts/sha256/${artifactSha256}.freeze`
  const absolute = prepareRuntimeEvidenceFile({ repoRoot: activeRun.repository, explicitRoot: evidenceRoot, relativePath: artifactPath })
  if (existsSync(absolute)) {
    const info = lstatSync(absolute)
    invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && sha256(readFileSync(absolute)) === artifactSha256, 'existing candidate freeze content artifact is unsafe or differs from its digest')
  } else writeExclusiveRuntimeBytes(absolute, content, 'candidate freeze content artifact')
  currentSnapshotBinding(activeRun)
  const artifact = {
    format: CANDIDATE_FREEZE_ARTIFACT_FORMAT,
    storage: 'git-runtime-evidence',
    path: artifactPath,
    bytes: content.length,
    sha256: artifactSha256,
    contentBase64: null,
  }
  const treeOid = gitTreeOid(entries)
  const commitBytes = candidateFreezeCommitBytes(treeOid, activeRun, artifactSha256)
  return {
    schemaVersion: 2,
    kind: 'frozen-git-object-proof',
    objectFormat: 'sha1',
    artifact,
    entries,
    treeOid,
    commit: { encoding: 'base64', bytes: commitBytes.toString('base64'), oid: gitObjectId('commit', commitBytes) },
  }
}

export function prepareCanonicalStagedRolloutLedger(options = {}) {
  rejectCanonicalClockInjection(options, 'canonical candidate-freeze preparation')
  const allowedOptionKeys = [
    ...(Object.prototype.hasOwnProperty.call(options, 'evidenceRoot') ? ['evidenceRoot'] : []),
    ...(Object.prototype.hasOwnProperty.call(options, 'authorityBootstrapReplayReceiptPath')
      ? ['authorityBootstrapReplayReceiptPath'] : []),
  ]
  exactObjectKeys(options, allowedOptionKeys, 'canonical candidate-freeze preparation options')
  invariant(process.env.GOVERNANCE_READ_ONLY !== '1', 'GOVERNANCE_READ_ONLY forbids canonical candidate-freeze evidence writes')
  const evidenceRoot = options.evidenceRoot ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null
  const plan = loadStagedRolloutPlan(DEFAULT_STAGED_ROLLOUT_PLAN_PATH, { repoRoot: REPOSITORY_ROOT })
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(plan, { repoRoot: REPOSITORY_ROOT })
  const authorityBootstrapReplayReceiptPath = options.authorityBootstrapReplayReceiptPath
    ?? process.env.GOVERNANCE_AUTHORITY_BOOTSTRAP_REPLAY_RECEIPT
  if (deploymentProfile.id === MAXIMUM_ASSURANCE_PROFILE_ID) invariant(
    typeof authorityBootstrapReplayReceiptPath === 'string'
      && authorityBootstrapReplayReceiptPath.length > 0,
    'maximum-assurance candidate-freeze preparation requires the exact authority bootstrap durable replay receipt path',
  )
  else invariant(
    authorityBootstrapReplayReceiptPath === null
      || authorityBootstrapReplayReceiptPath === undefined,
    'production-grade local candidate freeze refuses a maximum-assurance durable replay path',
  )
  const authorityBootstrapReplayReceipt = deploymentProfile.id === MAXIMUM_ASSURANCE_PROFILE_ID
    ? readAuthorityBootstrapReplayReceipt(
        authorityBootstrapReplayReceiptPath,
        { repoRoot: REPOSITORY_ROOT, evidenceRoot },
      )
    : null
  const initialActivationInputs = loadReleaseTrustActivationInputs(REPOSITORY_ROOT)
  const initialIssuerRegistry = loadIssuerRegistry(
    resolve(REPOSITORY_ROOT, 'infra/governance/trust/issuers.json'),
  )
  const authorityBootstrapActivationRequirement = deploymentProfile.id === MAXIMUM_ASSURANCE_PROFILE_ID
    ? authorityBootstrapMirrorActivationRequirement(initialActivationInputs.activationRequirements)
    : null
  canonicalCandidateFreezeBootstrapPrerequisites({ plan, now: new Date() })
  const activeRun = loadActiveDeepAuditRun({ repoRoot: REPOSITORY_ROOT, explicitRoot: evidenceRoot, requireCurrent: true })
  validateDeepAuditRunProviderBindings(activeRun.manifest, { repoRoot: REPOSITORY_ROOT })
  const candidateTarget = stagedRolloutCandidateTargetBinding(activeRun)
  currentSnapshotBinding(activeRun)
  const checks = [allHarnessCheck(activeRun), buildGraphCheck(activeRun)]
  const gitObjectProof = buildAndWriteCandidateFreezeGitProof(activeRun, evidenceRoot)
  const preparedAtDate = new Date()
  const finalPrerequisite = canonicalCandidateFreezeBootstrapPrerequisites({ plan, now: preparedAtDate, freezeAt: preparedAtDate })
  const finalActivationInputs = loadReleaseTrustActivationInputs(REPOSITORY_ROOT)
  const finalIssuerRegistry = loadIssuerRegistry(
    resolve(REPOSITORY_ROOT, 'infra/governance/trust/issuers.json'),
  )
  invariant(
    stableStringify(finalActivationInputs, 0) === stableStringify(initialActivationInputs, 0)
      && stableStringify(finalIssuerRegistry, 0) === stableStringify(initialIssuerRegistry, 0),
    'candidate-freeze activation or issuer trust inputs changed while the freeze was prepared',
  )
  const finalAuthorityBootstrapActivationRequirement = deploymentProfile.id === MAXIMUM_ASSURANCE_PROFILE_ID
    ? authorityBootstrapMirrorActivationRequirement(finalActivationInputs.activationRequirements)
    : null
  invariant(
    stableStringify(finalAuthorityBootstrapActivationRequirement, 0)
      === stableStringify(authorityBootstrapActivationRequirement, 0),
    'candidate-freeze durable replay activation requirement changed while the freeze was prepared',
  )
  const finalAuthorityBootstrapReplayReceipt = deploymentProfile.id === MAXIMUM_ASSURANCE_PROFILE_ID
    ? readAuthorityBootstrapReplayReceipt(
        authorityBootstrapReplayReceiptPath,
        { repoRoot: REPOSITORY_ROOT, evidenceRoot },
      )
    : null
  invariant(
    stableStringify(finalAuthorityBootstrapReplayReceipt, 0)
      === stableStringify(authorityBootstrapReplayReceipt, 0),
    'candidate-freeze durable replay receipt changed while the freeze was prepared',
  )
  currentSnapshotBinding(activeRun)
  const preparedAt = preparedAtDate.toISOString()
  const freeze = {
    schemaVersion: 2,
    kind: 'candidate-freeze-verification',
    activeRun: activeRunBinding(activeRun),
    inventoryDigest: activeRun.manifest.inventoryDigest,
    inventory: clone(activeRun.manifest.inventory),
    gitObjectProof,
    targetFrozenAt: candidateTarget.frozenAt,
    preparedAt,
    status: 'frozen',
    promotionEligible: false,
    checks,
  }
  const prepareVerification = buildStagedRolloutPrepareVerification({
    activeRun,
    freeze,
    bootstrapPrerequisite: finalPrerequisite,
    authorityBootstrapReplayReceipt: finalAuthorityBootstrapReplayReceipt,
    plan,
    authorityBootstrapActivationRequirement: finalAuthorityBootstrapActivationRequirement,
    repoRoot: REPOSITORY_ROOT,
    requireExternalArtifact: true,
  })
  const ledger = initializeCanonicalStagedRolloutLedger({ evidenceRoot })
  invariant(stableStringify(ledger.activeRun, 0) === stableStringify(activeRunBinding(activeRun), 0), 'candidate freeze active run changed while the ledger was prepared')
  ledger.prepareVerification = prepareVerification
  assertSchema(ledger, 'prepared staged-rollout ledger', DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH)
  ensureRuntimeEvidenceDirectory({ repoRoot: activeRun.repository, explicitRoot: evidenceRoot, relativePath: `staged-rollout/runs/${activeRun.manifest.runId}` })
  const ledgerRelativePath = `staged-rollout/runs/${activeRun.manifest.runId}/ledger.prepared.json`
  const ledgerPath = prepareRuntimeEvidenceFile({ repoRoot: activeRun.repository, explicitRoot: evidenceRoot, relativePath: ledgerRelativePath })
  const bytes = Buffer.from(stableStringify(ledger, 0), 'utf8')
  writeExclusiveRuntimeBytes(ledgerPath, bytes, 'prepared staged-rollout ledger')
  return {
    schemaVersion: 1,
    kind: 'staged-rollout-ledger-prepare-report',
    mode: 'local-evidence-write',
    mutatesExternalState: false,
    path: ledgerPath,
    relativePath: ledgerRelativePath,
    ledgerSha256: sha256(bytes),
    bytes: bytes.length,
    activeRun: activeRunBinding(activeRun),
    prepareVerificationSha256: stagedRolloutPrepareVerificationDigest(prepareVerification),
    candidateTarget,
    candidateValidationLifecycle: clone(plan.candidateValidationLifecycle),
    deploymentProfileId: deploymentProfile.id,
    deploymentProfileSha256: deploymentProfile.sha256,
    bootstrapPrerequisiteSha256: finalPrerequisite.prerequisiteSha256,
    authorityBootstrapReplaySha256: prepareVerification.authorityBootstrapReplay?.sha256 ?? null,
    authorityBootstrapReplayReceiptDigest: finalAuthorityBootstrapReplayReceipt?.receiptDigest ?? null,
    sourceArtifact: clone(gitObjectProof.artifact),
    completedPhases: [],
    nextPhase: 'candidate-freeze',
  }
}

function validateProtectedPrReadback(value, {
  activeRun,
  repoRoot,
  plan,
  bootstrapTransition,
  bootstrapReceipt,
  receipt,
}) {
  exactObjectKeys(value, [
    'schemaVersion', 'kind', 'repository', 'pullRequestNumber', 'baseBranch', 'status',
    'sourceCommit', 'sourceTree', 'mergeCommit', 'preparedRun', 'preparedInventoryDigest',
    'gitObjectProof', 'repositoryIdentity', 'observedAt',
  ], 'protected PR readback')
  invariant(value.schemaVersion === 1 && value.kind === 'protected-pr-readback', 'protected PR readback identity is invalid')
  invariant(value.repository === 'ajenchen/design-system' && value.baseBranch === 'main', 'protected PR readback repository/base is invalid')
  invariant(Number.isSafeInteger(value.pullRequestNumber) && value.pullRequestNumber > 0, 'protected PR readback number is invalid')
  invariant(value.status === 'open' && value.mergeCommit === null, 'commit/PR-open phase must not merge before PR-head certification')
  invariant(/^[a-f0-9]{40}$/.test(value.sourceCommit ?? '') && /^[a-f0-9]{40}$/.test(value.sourceTree ?? ''), 'protected PR source commit/tree is invalid')
  validateActiveRun(value.preparedRun, activeRun, 'protected PR prepared run')
  invariant(value.preparedInventoryDigest === activeRun.manifest.inventoryDigest, 'protected PR prepared inventory digest differs from the frozen manifest')
  const projected = validateFrozenGitObjectProof(value.gitObjectProof, activeRun)
  const inventory = readJson(resolve(repoRoot, 'infra/governance/inventory/managed-repos.json'))
  const repository = inventory.repositories.find(candidate => candidate.id === 'design-system')
  invariant(repository?.github === value.repository, 'protected PR readback is outside the managed authority repository')
  const carrierPolicy = stagedRolloutCandidateCarrierPolicy(plan, { repoRoot })
  validateRepositorySubjectProof(
    repository,
    value.repositoryIdentity,
    { subjectCommit: projected.sourceCommit, subjectTree: projected.sourceTree },
    { carrierPolicy },
  )
  invariant(
    value.sourceCommit === value.repositoryIdentity.gitCommit
      && value.sourceTree === value.repositoryIdentity.gitTree,
    'protected PR head/tree differs from the validated candidate carrier',
  )
  invariant(bootstrapTransition && bootstrapReceipt, 'protected PR merge lacks a signed predecessor policy-bootstrap receipt')
  const observedAt = canonicalDate(value.observedAt, 'protected PR observedAt')
  invariant(canonicalDate(bootstrapReceipt.observedAt, 'policy bootstrap receipt observedAt') < observedAt, 'protected PR opened before the signed GitHub policy bootstrap')
  invariant(receipt.observedAt === value.observedAt, 'protected PR readback differs from its signed receipt')
  return value
}

function normalizedRuleset(source, requiredChecks, integrations) {
  const ruleset = clone(source)
  delete ruleset.rollout
  ruleset.rules = ruleset.rules.map(rule => {
    if (rule.type !== 'required_status_checks') return rule
    const parameters = clone(rule.parameters)
    if (parameters?.fromProfile) {
      delete parameters.fromProfile
      parameters.required_status_checks = requiredChecks.map(check => ({
        context: check.context,
        integration_id: integrations[check.integration].id,
      }))
    }
    parameters.required_status_checks = clone(parameters.required_status_checks ?? []).sort((left, right) => compareUtf8Bytes(left.context, right.context))
    return { ...rule, parameters }
  }).sort((left, right) => compareUtf8Bytes(`${left.type}:${stableStringify(left, 0)}`, `${right.type}:${stableStringify(right, 0)}`))
  ruleset.bypass_actors = clone(ruleset.bypass_actors ?? []).sort((left, right) => compareUtf8Bytes(stableStringify(left, 0), stableStringify(right, 0)))
  return ruleset
}

function validateResolvedIntegrations(value, desired) {
  exactObjectKeys(value, Object.keys(desired.integrations), 'GitHub hard-gates resolved integrations')
  const resolved = clone(desired.integrations)
  for (const [name, integration] of Object.entries(value)) {
    exactObjectKeys(integration, ['id', 'slug'], `GitHub hard-gates integration ${name}`)
    invariant(Number.isSafeInteger(integration.id) && integration.id > 0, `GitHub hard-gates integration ${name} id is unresolved`)
    invariant(integration.slug === desired.integrations[name].slug, `GitHub hard-gates integration ${name} slug differs from desired state`)
    if (Number.isInteger(desired.integrations[name].id)) invariant(integration.id === desired.integrations[name].id, `GitHub hard-gates integration ${name} id differs from desired state`)
    resolved[name].id = integration.id
  }
  return resolved
}

function validateCheckReadbacks(checks, { profile, integrations, repo, headSha, openedAt, mergedAt, label }) {
  const expectedContexts = profile.requiredChecks.map(item => item.context)
  invariant(Array.isArray(checks) && checks.length === expectedContexts.length, `${label} required-check readbacks are incomplete`)
  invariant(stableStringify(checks.map(item => item.context), 0) === stableStringify(expectedContexts, 0), `${label} required-check contexts differ from desired state`)
  const observed = { defaultBranchHeadSha: headSha }
  for (let index = 0; index < checks.length; index += 1) {
    const item = checks[index]
    const expected = profile.requiredChecks[index]
    exactObjectKeys(item, ['context', 'checkRunId', 'completedAt', 'producer', 'producerBindingDigest'], `${label} required-check readback`)
    invariant(item.context === expected.context && /^[1-9][0-9]*$/.test(item.checkRunId), `${label} required-check identity is invalid`)
    exactObjectKeys(item.producer, ['name', 'head_sha', 'status', 'conclusion', 'app', 'external_id', 'details_url', 'workflowRun'], `${label} required-check producer`)
    exactObjectKeys(item.producer.app, ['id', 'slug'], `${label} required-check App`)
    invariant(item.producerBindingDigest === sha256(stableStringify(item.producer, 0)), `${label} required check ${item.context} producer digest is not derived from the full producer identity`)
    invariant(item.producer.status === 'completed' && item.producer.conclusion === 'success' && item.producer.head_sha === headSha, `${label} required check ${item.context} is not successful on the exact merge head`)
    const completedAt = canonicalDate(item.completedAt, `${label} required check ${item.context} completedAt`)
    invariant(item.completedAt === item.producer.completed_at || item.producer.completed_at === undefined, `${label} required check ${item.context} completion time differs from its producer`)
    invariant(completedAt >= openedAt && completedAt <= mergedAt, `${label} required check ${item.context} completed outside the protected PR window`)
    const integration = integrations[expected.integration]
    invariant(item.producer.app.id === integration.id && item.producer.app.slug === integration.slug, `${label} required check ${item.context} App identity is wrong`)
    const failures = validateRequiredCheckProducer({ run: item.producer, check: expected, integration, repo, observed })
    invariant(failures.length === 0, `${label} required check ${item.context} producer is invalid: ${failures.join('; ')}`)
  }
}

function validatePolicySnapshot(snapshot, { profile, resolvedDesired, repo, rings, sourceCommit = null, label }) {
  exactObjectKeys(snapshot, ['observedAt', 'repositoryMetadata', 'rulesets', 'rulesetsDigest'], `${label} policy snapshot`)
  canonicalDate(snapshot.observedAt, `${label} policy snapshot observedAt`)
  exactObjectKeys(snapshot.repositoryMetadata, ['fullName', 'defaultBranch', 'visibility', 'headSha'], `${label} repository metadata`)
  invariant(snapshot.repositoryMetadata.fullName === repo.github && snapshot.repositoryMetadata.defaultBranch === repo.defaultBranch && snapshot.repositoryMetadata.visibility === repo.visibility, `${label} repository metadata differs from inventory`)
  invariant(/^[a-f0-9]{40}$/.test(snapshot.repositoryMetadata.headSha ?? ''), `${label} repository head is invalid`)
  if (sourceCommit !== null) invariant(snapshot.repositoryMetadata.headSha === sourceCommit, `${label} repository head differs from the governed source commit`)
  const assignment = rings.assignments[repo.id]
  const materialized = materializeProfile(repo, resolvedDesired, rings, { eligible: true, promoted: true, ring: assignment.ring, wave: assignment.wave, blockers: [] })
  const expectedRulesets = materialized.rulesets.map(item => normalizedRuleset(item, profile.requiredChecks, resolvedDesired.integrations)).sort((left, right) => compareUtf8Bytes(left.name, right.name))
  invariant(stableStringify(snapshot.rulesets, 0) === stableStringify(expectedRulesets, 0), `${label} normalized ruleset snapshot differs from exact materialized desired state`)
  invariant(snapshot.rulesets.every(item => item.enforcement === 'active' && (item.bypass_actors ?? []).length === 0), `${label} rulesets are not active or contain bypass actors`)
  invariant(snapshot.rulesetsDigest === sha256(stableStringify(snapshot.rulesets, 0)), `${label} ruleset digest is invalid`)
  return snapshot
}

function validateGithubPolicyBootstrap(value, {
  repoRoot,
  plan,
  issuerRegistry,
  attestationPolicy,
  activationReadinessResolver,
  activationCarrierValidator,
  now,
  receipt,
  activeRun,
  candidateFreezeReceipt,
  prepareVerificationValue,
}) {
  exactObjectKeys(value, [
    'schemaVersion', 'kind', 'repository', 'desiredStateDigest', 'resolvedIntegrations', 'policySnapshot',
    'deploymentProfileBinding', 'activationBaselineSha256', 'activation', 'activationDigest',
    'managedCiBootstrap', 'eligible', 'observedAt',
  ], 'GitHub policy bootstrap readback')
  invariant(value.schemaVersion === 1 && value.kind === 'github-policy-bootstrap-readback', 'GitHub policy bootstrap readback identity is invalid')
  invariant(value.repository === 'ajenchen/design-system' && value.eligible === true, 'GitHub policy bootstrap is not eligible')
  const { desired, profile, rings, repo } = authorityDesired(repoRoot, now)
  invariant(value.desiredStateDigest === sha256(stableStringify(desired, 0)), 'GitHub policy bootstrap desired-state digest is not canonical')
  const resolvedIntegrations = validateResolvedIntegrations(value.resolvedIntegrations, desired)
  const resolvedDesired = clone(desired)
  for (const [name, integration] of Object.entries(resolvedIntegrations)) resolvedDesired.integrations[name].id = integration.id
  const policy = validatePolicySnapshot(value.policySnapshot, { profile, resolvedDesired, repo, rings, label: 'pre-merge bootstrap' })
  invariant(canonicalDate(policy.observedAt, 'policy bootstrap observedAt') <= canonicalDate(value.observedAt, 'GitHub policy bootstrap observedAt'), 'GitHub policy bootstrap snapshot is newer than its receipt')
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(plan, { repoRoot })
  invariant(
    stableStringify(value.deploymentProfileBinding, 0) === stableStringify(plan.deploymentProfileBinding, 0),
    'GitHub policy bootstrap deployment profile binding is stale or substituted',
  )
  const {
    activationInventory: inventory,
    activationDesired,
    activationPolicy,
    mutationBoundaryContract,
  } = loadReleaseTrustActivationInputs(repoRoot)
  const readinessOptions = {
    scope: 'release',
    inventory,
    desired: activationDesired,
    rings: { attestationPolicy },
    issuerRegistry,
    policy: activationPolicy,
    expectedPolicyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
    mutationBoundaryContract,
    now,
  }
  const readiness = activationReadinessResolver(value.activation, {
    ...readinessOptions,
  })
  invariant(readiness?.ready === true && readiness.blockers?.length === 0, 'GitHub policy bootstrap external activation is not ready')
  invariant(
    readiness.scope === 'release'
      && readiness.profileId === deploymentProfile.id
      && readiness.profileDigest === deploymentProfile.sha256
      && readiness.policyDigest === EXTERNAL_ACTIVATION_POLICY_DIGEST,
    'GitHub policy bootstrap activation readiness is bound to another profile or policy',
  )
  invariant(value.activationDigest === readiness.digest && value.activationDigest === proofValueDigest(value.activation), 'GitHub policy bootstrap activation artifact digest is invalid')
  if (deploymentProfile.id === PRODUCTION_GRADE_PROFILE_ID) {
    const baseline = prepareVerificationValue.bootstrapPrerequisite.activationBaseline
    invariant(
      value.activationBaselineSha256 === baseline.sha256
        && baseline.sha256 === proofValueDigest(baseline.value),
      'GitHub policy bootstrap activation baseline differs from the frozen candidate target',
    )
    activationCarrierValidator(baseline.value, value.activation, readinessOptions)
    if (value.managedCiBootstrap !== null) {
      validateManagedCiBootstrapReadback(value.managedCiBootstrap, {
        activation: value.activation,
        activeRun,
        candidateFreezeReceipt,
        prepareVerification: prepareVerificationValue,
        deploymentProfileId: deploymentProfile.id,
      })
    }
    invariant(
      canonicalDate(candidateFreezeReceipt.observedAt, 'candidate-freeze receipt observedAt')
        < canonicalDate(value.observedAt, 'GitHub policy bootstrap observedAt'),
      'production-grade external activation readback must follow candidate-freeze receipt completion',
    )
  } else {
    invariant(
      value.activationBaselineSha256 === prepareVerificationValue.bootstrapPrerequisite.activationDigest,
      'maximum-assurance GitHub policy bootstrap activation baseline differs from the signed pre-freeze activation',
    )
    validateManagedCiBootstrapReadback(value.managedCiBootstrap, {
      activation: value.activation,
      activeRun,
      candidateFreezeReceipt,
      prepareVerification: prepareVerificationValue,
      deploymentProfileId: deploymentProfile.id,
    })
    invariant(
      value.activationDigest === prepareVerificationValue.bootstrapPrerequisite.activationDigest,
      'maximum-assurance GitHub policy bootstrap activation differs from the signed candidate-freeze prerequisite',
    )
  }
  invariant(receipt.observedAt === value.observedAt, 'GitHub policy bootstrap artifact time differs from its signed receipt')
  return value
}

function validateGithubHardGates(value, { sourceTransition, certificationTransition, certificationReceipt, bootstrapTransition, repoRoot, now, receipt }) {
  exactObjectKeys(value, [
    'schemaVersion', 'kind', 'repository', 'pullRequestNumber', 'headCommit', 'sourceCommit', 'sourceTree', 'mergedAt',
    'desiredStateDigest', 'resolvedIntegrations', 'postMergePolicy', 'requiredChecks', 'requiredChecksDigest',
    'eligible', 'observedAt',
  ], 'post-merge GitHub hard-gates readback')
  invariant(value.schemaVersion === 1 && value.kind === 'github-hard-gates-readback', 'post-merge GitHub hard-gates readback identity is invalid')
  invariant(value.repository === 'ajenchen/design-system' && value.eligible === true, 'post-merge GitHub hard gates are not eligible')
  invariant(sourceTransition && certificationTransition && certificationReceipt && bootstrapTransition, 'post-merge GitHub hard gates lack bootstrap/PR/certification predecessors')
  invariant(value.pullRequestNumber === sourceTransition.pullRequestNumber && value.headCommit === sourceTransition.sourceCommit, 'post-merge GitHub hard gates do not bind the certified open PR')
  invariant(value.headCommit === certificationTransition.sourceCommit && value.sourceTree === sourceTransition.sourceTree && value.sourceTree === certificationTransition.sourceTree && /^[a-f0-9]{40}$/.test(value.sourceCommit ?? ''), 'post-merge GitHub hard gates changed the certified frozen source tree or lack a merge commit')
  const mergedAt = canonicalDate(value.mergedAt, 'protected PR mergedAt')
  invariant(mergedAt > canonicalDate(bootstrapTransition.policySnapshot.observedAt, 'policy bootstrap snapshot observedAt'), 'protected PR merged before the signed policy bootstrap was active')
  invariant(mergedAt > canonicalDate(certificationReceipt.observedAt, 'PR-head certification receipt observedAt'), 'protected PR merged before signed PR-head certification')
  invariant(canonicalDate(receipt.observedAt, 'merge/post-gates receipt observedAt') >= mergedAt, 'merge/post-gates receipt predates merge')
  const { desired, profile, rings, repo } = authorityDesired(repoRoot, now)
  invariant(value.desiredStateDigest === sha256(stableStringify(desired, 0)), 'post-merge GitHub hard-gates desired-state digest is not canonical')
  invariant(stableStringify(value.resolvedIntegrations, 0) === stableStringify(bootstrapTransition.resolvedIntegrations, 0), 'post-merge GitHub hard gates changed resolved integration identities')
  const resolvedIntegrations = validateResolvedIntegrations(value.resolvedIntegrations, desired)
  const resolvedDesired = clone(desired)
  for (const [name, integration] of Object.entries(resolvedIntegrations)) resolvedDesired.integrations[name].id = integration.id
  const post = validatePolicySnapshot(value.postMergePolicy, { profile, resolvedDesired, repo, rings, sourceCommit: value.sourceCommit, label: 'post-merge' })
  invariant(canonicalDate(post.observedAt, 'post-merge policy observedAt') > mergedAt, 'post-merge policy was observed before merge')
  invariant(stableStringify(post.rulesets, 0) === stableStringify(bootstrapTransition.policySnapshot.rulesets, 0), 'GitHub protections changed between signed bootstrap and post-merge readback')
  validateCheckReadbacks(value.requiredChecks, {
    profile,
    integrations: resolvedIntegrations,
    repo,
    headSha: value.headCommit,
    openedAt: canonicalDate(sourceTransition.observedAt, 'protected PR openedAt'),
    mergedAt,
    label: 'protected PR merge',
  })
  invariant(value.requiredChecksDigest === sha256(stableStringify(value.requiredChecks, 0)), 'merge/post-gates required-check digest is invalid')
  const observedAt = canonicalDate(value.observedAt, 'post-merge GitHub hard-gates observedAt')
  invariant(observedAt >= canonicalDate(post.observedAt, 'post-merge policy observedAt') && receipt.observedAt === value.observedAt, 'post-merge GitHub hard-gates receipt predates or differs from readback')
  return value
}

function consumerUpgradeContext(repoRoot) {
  const path = resolve(repoRoot, 'infra/governance/consumer-upgrade-protocol.json')
  const schemaPath = resolve(repoRoot, 'infra/governance/schemas/consumer-upgrade-protocol.schema.json')
  const implementationPath = resolve(repoRoot, 'infra/governance/lib/consumer-upgrade-protocol.mjs')
  const loaded = loadConsumerUpgradeProtocol(path, schemaPath, implementationPath)
  return { ...loaded, sourceDigests: protocolSourceDigests(loaded) }
}

function candidateReleaseBom(candidateRecord) {
  invariant(candidateRecord?.bom?.encoding === 'base64', 'consumer upgrade candidate BOM is missing')
  const bom = JSON.parse(canonicalBase64(candidateRecord.bom.bytes, 'consumer upgrade candidate BOM bytes').toString('utf8'))
  validateReleaseBom(bom, { requireSbom: true })
  invariant(bom.releaseVersion === candidateRecord.candidateRelease?.version, 'consumer upgrade candidate BOM version is stale')
  return bom
}

function resolveConsumerBootstrapBinding(repository, upgrade, receipt) {
  invariant(repository?.role === 'product-consumer', 'consumer bootstrap evidence does not target a product consumer')
  const assignedProfile = upgradeProfile(upgrade.protocol, repository.upgradeProtocolProfile)
  invariant(
    assignedProfile.bootstrapEvidenceContract === 'consumer-governance-bootstrap-readback-v1',
    'consumer bootstrap evidence contract/profile binding is invalid',
  )
  const reference = receipt?.evidence?.find(item => item.contract === assignedProfile.bootstrapEvidenceContract)
  invariant(reference && SHA256.test(reference.sha256 ?? ''), 'consumer bootstrap receipt lacks its exact content-addressed evidence reference')

  if (assignedProfile.bootstrapRequired === true) {
    invariant(
      assignedProfile.entryMode === 'one-time-reviewed-full-snapshot-pr'
        && assignedProfile.acceptedBootstrapBindingRequired === false
        && repository.acceptedBootstrapReadbackSha256 === undefined,
      'legacy consumer bootstrap profile or accepted-readback state is invalid',
    )
    return { assignedProfile, reference, validationRepository: repository, established: false }
  }

  invariant(
    assignedProfile.bootstrapRequired === false
      && assignedProfile.acceptedBootstrapBindingRequired === true
      && SHA256.test(repository.acceptedBootstrapReadbackSha256 ?? '')
      && repository.acceptedBootstrapReadbackSha256 === reference.sha256,
    'established consumer inventory does not bind the exact receipt bootstrap readback',
  )
  const predecessors = Object.entries(upgrade.protocol.profiles).filter(([, profile]) => (
    profile.bootstrapRequired === true
      && profile.bootstrapEvidenceContract === assignedProfile.bootstrapEvidenceContract
      && profile.postAcceptanceProfile === repository.upgradeProtocolProfile
  ))
  invariant(predecessors.length === 1, 'established consumer bootstrap profile does not have one exact legacy predecessor')
  const validationRepository = { ...repository, upgradeProtocolProfile: predecessors[0][0] }
  delete validationRepository.acceptedBootstrapReadbackSha256
  return {
    assignedProfile,
    reference,
    validationRepository,
    established: true,
  }
}

function validateBootstrapReadback(value, { candidateRecord, repoRoot, receipt }) {
  const inventory = readJson(resolve(repoRoot, 'infra/governance/inventory/managed-repos.json'))
  const repository = inventory.repositories.find(item => item.id === value?.repositoryId)
  const upgrade = consumerUpgradeContext(repoRoot)
  const binding = resolveConsumerBootstrapBinding(repository, upgrade, receipt)
  return validateConsumerBootstrapReadback(value, {
    repository: binding.validationRepository,
    candidateRelease: candidateRecord?.candidateRelease,
    releaseBom: candidateReleaseBom(candidateRecord),
    protocol: upgrade.protocol,
    sourceDigests: upgrade.sourceDigests,
  })
}

function validateExactVersionReadback(value, { candidateRecord, contract, repoRoot, receipt }) {
  exactObjectKeys(value, [
    'schemaVersion', 'kind', 'repositoryId', 'repository', 'role', 'sourceCommit', 'sourceTree',
    'version', 'packages', 'defaultBranchHeadSha', 'provenanceDigest', 'lockfileDigest',
    'upgradeProtocol', 'bootstrapReadbackSha256', 'observedAt',
  ], `${contract} readback`)
  invariant(value.schemaVersion === 2 && value.kind === 'exact-version-upgrade-readback-v2', `${contract} readback identity is invalid`)
  const inventory = readJson(resolve(repoRoot, 'infra/governance/inventory/managed-repos.json'))
  const template = contract === 'template-exact-version-upgrade-v2'
  const expectedId = template ? 'ds-product-template' : 'work-management'
  const expectedRole = template ? 'template-mirror' : 'product-consumer'
  const repo = inventory.repositories.find(item => item.id === expectedId)
  invariant(repo && value.repositoryId === repo.id && value.repository === repo.github && value.role === expectedRole, `${contract} targets the wrong managed repository/role`)
  const upgrade = consumerUpgradeContext(repoRoot)
  const profile = upgradeProfile(upgrade.protocol, repo.upgradeProtocolProfile)
  exactObjectKeys(value.upgradeProtocol, [
    'protocolId', 'specificationSha256', 'schemaSha256', 'implementationSha256', 'profileId', 'entryMode', 'consumerLockSha256',
    'forkCorpusLockSha256', 'templateStaticTreeSha256',
  ], `${contract} upgrade protocol`)
  invariant(
    value.upgradeProtocol.protocolId === upgrade.protocol.protocolId
    && value.upgradeProtocol.specificationSha256 === upgrade.sourceDigests.specificationSha256
    && value.upgradeProtocol.schemaSha256 === upgrade.sourceDigests.schemaSha256
    && value.upgradeProtocol.implementationSha256 === upgrade.sourceDigests.implementationSha256
    && value.upgradeProtocol.profileId === repo.upgradeProtocolProfile
    && value.upgradeProtocol.entryMode === profile.entryMode,
    `${contract} upgrade protocol/profile binding is stale`,
  )
  const candidate = candidateRecord?.candidateRelease
  const releaseBom = candidateReleaseBom(candidateRecord)
  invariant(candidate && value.sourceCommit === candidate.sourceCommit && value.sourceTree === candidate.sourceTree, `${contract} source commit/tree differs from the immutable candidate`)
  invariant(value.version === candidate.version && EXACT_VERSION.test(value.version), `${contract} uses a floating or wrong version`)
  invariant(stableStringify(value.packages, 0) === stableStringify(candidate.packages, 0), `${contract} package versions/SRI differ from the immutable candidate`)
  invariant(
    value.upgradeProtocol.consumerLockSha256 === releaseBom.governance.consumer.sha256
    && value.upgradeProtocol.forkCorpusLockSha256 === releaseBom.governance.forkCorpus.sha256
    && value.upgradeProtocol.templateStaticTreeSha256 === releaseBom.governance.productTemplateScaffold.staticTreeSha256,
    `${contract} consumer lock/corpus/template snapshot differs from the immutable release BOM`,
  )
  invariant(/^[a-f0-9]{40}$/.test(value.defaultBranchHeadSha ?? ''), `${contract} default-branch head is invalid`)
  invariant(SHA256.test(value.provenanceDigest ?? '') && SHA256.test(value.lockfileDigest ?? ''), `${contract} provenance/lockfile digest is invalid`)
  if (template) {
    invariant(
      profile.bootstrapRequired === false
        && profile.bootstrapEvidenceContract === null
        && profile.acceptedBootstrapBindingRequired === false
        && repo.acceptedBootstrapReadbackSha256 === undefined
        && value.bootstrapReadbackSha256 === null,
      `${contract} new-snapshot profile incorrectly claims a legacy bootstrap receipt`,
    )
  } else {
    const binding = resolveConsumerBootstrapBinding(repo, upgrade, receipt)
    const { reference } = binding
    invariant(reference && value.bootstrapReadbackSha256 === reference.sha256, `${contract} does not bind the exact bootstrap readback artifact`)
    const bootstrap = readEvidenceArtifact(reference, `${contract} bootstrap predecessor`).value
    validateBootstrapReadback(bootstrap, { candidateRecord, repoRoot, receipt })
    if (!binding.established) {
      invariant(value.defaultBranchHeadSha === bootstrap.defaultBranchHeadSha, `${contract} default branch differs from the reviewed bootstrap merge`)
    }
  }
  canonicalDate(value.observedAt, `${contract} observedAt`)
  return value
}

function validateSoakArtifact(value, { candidateDigest, wmReceipt, rolloutCompletionReceipt }) {
  exactObjectKeys(value, ['schemaVersion', 'kind', 'candidateReleaseDigest', 'startedAt', 'completedAt', 'minimumHours', 'elapsedHours'], 'candidate-bound soak')
  invariant(value.schemaVersion === 1 && value.kind === 'candidate-bound-soak', 'candidate-bound soak identity is invalid')
  invariant(value.candidateReleaseDigest === candidateDigest, 'soak artifact is bound to a different candidate')
  const startedAt = canonicalDate(value.startedAt, 'candidate-bound soak startedAt')
  const completedAt = canonicalDate(value.completedAt, 'candidate-bound soak completedAt')
  invariant(wmReceipt && rolloutCompletionReceipt, 'candidate-bound soak lacks WM canary or full rollout-completion predecessor')
  const expectedStart = new Date(wmReceipt.observedAt) > new Date(rolloutCompletionReceipt.observedAt) ? wmReceipt.observedAt : rolloutCompletionReceipt.observedAt
  invariant(value.startedAt === expectedStart, 'candidate-bound soak does not start at the later of WM canary and full rollout completion')
  invariant(value.minimumHours === 72 && value.elapsedHours >= 72, 'candidate-bound soak does not declare the governed 72-hour duration')
  invariant(completedAt.getTime() - startedAt.getTime() >= 72 * 60 * 60 * 1000, 'candidate-bound soak proof is shorter than 72 hours')
  return value
}

function validateRolloutCompletion(value, { candidateRecord, issuerRegistry, attestationPolicy, now }) {
  exactObjectKeys(value, ['attestation', 'context'], 'rollout completion proof')
  exactObjectKeys(value.context, [
    'repoId', 'github', 'ringId', 'waveId', 'candidateRelease', 'verifiedReleaseEvidenceDigest',
    'candidatePlanDigest', 'predicateDigest', 'stateDigest', 'defaultBranchHeadSha', 'actionsDigest',
    'issuerRegistryDigest',
  ], 'rollout completion context')
  invariant(stableStringify(value.context.candidateRelease, 0) === stableStringify(candidateRecord?.candidateRelease, 0), 'rollout completion candidate differs from the immutable release')
  invariant(value.context.verifiedReleaseEvidenceDigest === candidateRecord.verifiedReleaseEvidence.sha256, 'rollout completion verified release digest mismatch')
  const verified = verifyCompletionAttestation(value.attestation, { ...value.context, attestationPolicy }, { issuerRegistry, now })
  invariant(verified.valid, `rollout completion attestation is invalid: ${verified.failures.join('; ')}`)
  return value
}

export function loadReleaseTrustActivationInputs(repoRoot) {
  const activationInventory = readJson(resolve(repoRoot, 'infra/governance/inventory/managed-repos.json'))
  const activationDesired = readJson(resolve(repoRoot, 'infra/governance/desired/github.json'))
  const rings = readJson(resolve(repoRoot, 'infra/governance/release-rings.json'))
  const activationRequirementsPath = resolve(repoRoot, 'infra/governance/external-activation-requirements.json')
  const activationRequirements = readJson(activationRequirementsPath)
  const activationPolicy = loadExternalActivationPolicy(resolve(repoRoot, 'infra/governance/external-activation-policy.json'))
  const mutationBoundaryContract = readJson(resolve(repoRoot, GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH))
  const releaseTagAuthorizationPolicy = readJson(resolve(repoRoot, 'infra/governance/release-tag-authorization-policy.json'))
  return {
    activationInventory,
    activationDesired,
    rings,
    activationRequirementsPath,
    activationRequirements,
    activationPolicy,
    mutationBoundaryContract,
    releaseTagAuthorizationPolicy,
  }
}

function validateReleaseTrust(value, {
  candidateRecord,
  repoRoot,
  issuerRegistry,
  observedAt,
  managedCiValidationContext,
}) {
  const {
    activationInventory,
    activationDesired,
    rings,
    activationRequirementsPath,
    activationRequirements,
    activationPolicy,
    mutationBoundaryContract,
    releaseTagAuthorizationPolicy,
  } = loadReleaseTrustActivationInputs(repoRoot)
  const candidate = candidateRecord?.candidateRelease
  invariant(candidate, 'release trust proof requires the immutable candidate')
  return validateReleaseTrustPreflightEvidence(value, {
    repository: 'ajenchen/design-system',
    releaseTag: `v${candidate.version}`,
    releaseCommit: candidate.sourceCommit,
    releaseTree: candidate.sourceTree,
    desired: activationDesired,
    inventory: activationInventory,
    activationRequirements,
    activationInventory,
    activationDesired,
    activationPolicy,
    mutationBoundaryContract,
    expectedActivationPolicyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
    rings,
    requirementsSha256: sha256(readFileSync(activationRequirementsPath)),
    releaseTagAuthorizationPolicy,
    issuerRegistry,
    runId: value?.workflow?.runId,
    runAttempt: value?.workflow?.runAttempt,
    now: new Date(observedAt),
    managedCiValidationContext,
  })
}

function validateEvidenceValue(contract, value, context) {
  if (Object.prototype.hasOwnProperty.call(value, 'observedAt')) {
    invariant(value.observedAt === context.receipt.observedAt, `${contract} artifact observation time differs from its signed phase receipt`)
  }
  const override = context.contractValidators?.[contract]
  if (override) {
    invariant(override(value, context) !== false, `${contract} injected validator rejected the artifact`)
    return value
  }
  if (contract === 'staged-rollout-prepare-verification-v4') {
    invariant(stableStringify(value, 0) === stableStringify(context.prepareVerificationValue, 0), 'prepare evidence bytes differ from the validated closed verification')
    return value
  }
  if (contract === 'github-policy-bootstrap-readback-v1') return validateGithubPolicyBootstrap(value, context)
  if (contract === 'pr-head-certification-v1') return validatePrHeadCertification(value, context)
  if (contract === 'full-deep-audit-verification-v1') return validateFullDeepAudit(value, context)
  if (contract === 'protected-pr-readback-v1') return validateProtectedPrReadback(value, context)
  if (contract === 'github-hard-gates-readback-v1') return validateGithubHardGates(value, context)
  if (contract === 'release-trust-preflight-v4') return validateReleaseTrust(value, context)
  if (contract === 'release-bom-v5') {
    validateReleaseBom(value, { requireSbom: true })
    invariant(value.releaseVersion === context.candidateRecord?.candidateRelease.version, 'release BOM artifact version differs from the candidate')
    return value
  }
  if (contract === 'verified-immutable-release-v2') {
    return validateVerifiedReleaseEvidence(value, context.candidateRecord?.candidateRelease)
  }
  if (contract === 'consumer-governance-bootstrap-readback-v1') return validateBootstrapReadback(value, context)
  if (contract === 'template-exact-version-upgrade-v2' || contract === 'wm-exact-version-canary-v2') return validateExactVersionReadback(value, { ...context, contract })
  if (contract === 'rollout-completion-attestation-v1') return validateRolloutCompletion(value, context)
  if (contract === 'candidate-bound-soak-72h-v1') return validateSoakArtifact(value, context)
  if (contract === 'previous-good-release-v1') {
    validateReleaseRecord(value, 'previous-good rollback artifact')
    invariant(stableStringify(value, 0) === stableStringify(context.previousGoodRecord, 0), 'rollback artifact substitutes a different previous-good release')
    return value
  }
  if (contract === 'fleet-reconcile-journal-v6') {
    validateTransactionJournal(value, { mode: 'historical-observation', issuerRegistry: context.issuerRegistry })
    return value
  }
  if (contract === 'fleet-recovery-authorization-v2') {
    invariant(value && typeof value === 'object' && !Array.isArray(value), 'fleet recovery authorization artifact is invalid')
    return value
  }
  throw new Error(`No strict validator is registered for evidence contract ${contract}`)
}

// Keep the public release-trust validation surface on the same dispatcher used
// by signed receipts without exposing the receipt validator-override mechanism.
export function validateStagedReleaseTrustEvidence(value, context) {
  invariant(!context?.contractValidators, 'strict staged release-trust validation forbids injected contract validators')
  return validateEvidenceValue('release-trust-preflight-v4', value, { ...context, contractValidators: null })
}

function validateEvidence(receipt, expectedContracts, context) {
  exactList(receipt.evidence.map(item => item.contract), expectedContracts, `${receipt.phaseId} receipt evidence contracts`)
  const values = new Map()
  for (const item of receipt.evidence) {
    invariant(item.origin === CONTRACT_ORIGINS.get(item.contract), `${receipt.phaseId} evidence ${item.contract} has an untrusted origin`)
    invariant(item.uri === `urn:sha256:${item.sha256}`, `${receipt.phaseId} evidence ${item.contract} is not content-addressed`)
    const artifact = readEvidenceArtifact(item, `${receipt.phaseId} evidence ${item.contract}`)
    const validation = validateEvidenceValue(item.contract, artifact.value, { ...context, receipt })
    values.set(item.contract, { ...artifact, validation })
  }
  return values
}

function releaseEvidenceByContract(receipt, contract) {
  return receipt.evidence.find(item => item.contract === contract)
}

export function validateStagedRolloutLedger(plan, ledger, {
  activeRun,
  certificationRun = null,
  issuerRegistry,
  attestationPolicy,
  now = new Date(),
  schemaPath = DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH,
  repoRoot = REPOSITORY_ROOT,
  verifyMechanisms = true,
  activationReadinessResolver = externalActivationReadiness,
  activationCarrierValidator = validateExternalActivationCarrierAfterImage,
  contractValidators = null,
  canonicalAuthority = null,
  canonicalBindings = null,
} = {}) {
  validateStagedRolloutPlan(plan, { repoRoot, schemaPath, verifyMechanisms })
  assertSchema(ledger, 'staged-rollout ledger', schemaPath)
  invariant(ledger.kind === 'staged-rollout-ledger', 'staged-rollout document is not a ledger')
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'staged-rollout verification time is invalid')
  invariant(issuerRegistry, 'staged-rollout ledger verification requires the issuer registry')
  invariant(attestationPolicy, 'staged-rollout ledger verification requires the attestation policy')
  const planSha256 = stagedRolloutPlanDigest(plan)
  invariant(ledger.planSha256 === planSha256, 'staged-rollout ledger references a different plan digest')
  validateActiveRun(ledger.activeRun, activeRun, 'ledger active run')
  if (canonicalAuthority === CANONICAL_VALIDATION_AUTHORITY) {
    try {
      validateDeepAuditRunProviderBindings(activeRun.manifest, { repoRoot, now })
    } catch (error) {
      invariant(false, `candidate-freeze provider binding is stale: ${error.message}`)
    }
  }
  if (ledger.receipts.length < 3) invariant(ledger.certificationRun === null, 'PR-head certification run cannot replace the candidate-freeze pointer before the protected PR exists')
  else invariant(ledger.certificationRun !== null, 'PR-head certification and later phases require a distinct committed active run')
  if (ledger.certificationRun !== null) {
    invariant(certificationRun, 'ledger certification run requires the committed PR-head active run')
    validateActiveRun(ledger.certificationRun, certificationRun, 'ledger certification run')
    invariant(ledger.certificationRun.manifestSha256 !== ledger.activeRun.manifestSha256, 'dirty candidate-freeze run cannot be reused as PR-head certification')
    if (canonicalAuthority === CANONICAL_VALIDATION_AUTHORITY) {
      try {
        validateDeepAuditRunProviderBindings(certificationRun.manifest, { repoRoot, now })
      } catch (error) {
        invariant(false, `PR-head certification provider binding is stale: ${error.message}`)
      }
    }
  }

  let prepareVerification = null
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(plan, { repoRoot })
  const authorityBootstrapActivationRequirement = canonicalAuthority === CANONICAL_VALIDATION_AUTHORITY
      && deploymentProfile.id === MAXIMUM_ASSURANCE_PROFILE_ID
    ? authorityBootstrapMirrorActivationRequirement(
        loadReleaseTrustActivationInputs(repoRoot).activationRequirements,
      )
    : null
  if (ledger.prepareVerification) prepareVerification = validatePrepareVerification(ledger.prepareVerification, ledger.activeRun, activeRun, {
    plan,
    issuerRegistry,
    attestationPolicy,
    authorityBootstrapActivationRequirement,
    repoRoot,
    requireExternalArtifact: canonicalAuthority === CANONICAL_VALIDATION_AUTHORITY,
  })
  if (ledger.prepareVerification && activationReadinessResolver === externalActivationReadiness) {
    const freezeAt = canonicalDate(ledger.prepareVerification.preparedAt, 'candidate-freeze preparedAt')
    const canonicalPrerequisite = canonicalCandidateFreezeBootstrapPrerequisites({
      plan,
      now: freezeAt,
      freezeAt,
      repoRoot,
    })
    invariant(
      canonicalPrerequisite.prerequisiteSha256 === ledger.prepareVerification.bootstrapPrerequisite.prerequisiteSha256,
      'candidate-freeze bootstrap prerequisite differs from canonical activation and authority inputs',
    )
  }
  if (ledger.receipts.length > 0) invariant(prepareVerification, 'prepare receipt cannot exist without the closed prepare verification receipt')

  let candidate = null
  let previousGood = null
  if (ledger.releaseTrain.candidate) candidate = validateReleaseRecord(ledger.releaseTrain.candidate, 'candidate release')
  if (ledger.releaseTrain.previousGood) previousGood = validateReleaseRecord(ledger.releaseTrain.previousGood, 'previous-good release')
  if (ledger.receipts.length < 5) invariant(candidate === null && previousGood === null, 'immutable candidate/previous-good records cannot appear before protected merge completion')
  if (previousGood) {
    invariant(candidate, 'previous-good release cannot be asserted without the current candidate release')
    invariant(previousGood.digest !== candidate.digest, 'previous-good release is identical to the candidate release')
    invariant(
      compareExactVersions(ledger.releaseTrain.previousGood.candidateRelease.version, ledger.releaseTrain.candidate.candidateRelease.version) < 0,
      'previous-good release version must be strictly older than the candidate version',
    )
    invariant(
      new Date(ledger.releaseTrain.previousGood.candidateRelease.observedAt) < new Date(ledger.releaseTrain.candidate.candidateRelease.observedAt),
      'previous-good immutable release must predate the candidate release',
    )
  }

  let previousReceipt = null
  let bootstrapTransition = null
  let bootstrapReceipt = null
  let sourceTransition = null
  let certificationTransition = null
  let certificationReceipt = null
  let certificationValidation = null
  let hardGateTransition = null
  for (const [index, receipt] of ledger.receipts.entries()) {
    const phase = plan.phases[index]
    invariant(receipt.phaseId === phase.id && receipt.phaseIndex === index, `staged-rollout receipt ${index} skips, reorders, or substitutes a phase`)
    invariant(receipt.planSha256 === planSha256, `${phase.id} receipt references a different plan`)
    const phaseActiveRun = index < 3 ? activeRun : certificationRun
    invariant(phaseActiveRun, `${phase.id} lacks its required active run`)
    validateActiveRun(receipt.activeRun, phaseActiveRun, `${phase.id} receipt active run`)
    const expectedPrior = previousReceipt ? stagedRolloutReceiptDigest(previousReceipt) : null
    invariant(receipt.priorReceiptSha256 === expectedPrior, `${phase.id} receipt prior content address is stale or missing`)
    if (previousReceipt) {
      invariant(new Date(receipt.observedAt) > new Date(previousReceipt.observedAt), `${phase.id} receipt must be observed after its predecessor`)
    }
    const variant = selectedVariant(phase, receipt.decision)
    if (phase.id === 'promotion-or-rollback' && receipt.decision === 'rollback') {
      invariant(previousGood, 'rollback requires a verified previous-good release/BOM/version')
    }
    const evidenceValues = validateEvidence(receipt, variant.evidenceContracts, {
      plan,
      activeRun,
      certificationRun,
      prepareVerificationValue: ledger.prepareVerification,
      bootstrapTransition,
      bootstrapReceipt,
      sourceTransition,
      certificationTransition,
      certificationReceipt,
      candidateRecord: ledger.releaseTrain.candidate,
      candidateDigest: candidate?.digest ?? null,
      previousGoodRecord: ledger.releaseTrain.previousGood,
      issuerRegistry,
      attestationPolicy,
      now: new Date(receipt.observedAt),
      observedAt: receipt.observedAt,
      repoRoot,
      wmReceipt: ledger.receipts[7] ?? null,
      rolloutCompletionReceipt: ledger.receipts[8] ?? null,
      contractValidators,
      activationReadinessResolver,
      activationCarrierValidator,
      candidateFreezeReceipt: ledger.receipts[0] ?? null,
      requireCanonicalFileReadback: canonicalAuthority === CANONICAL_VALIDATION_AUTHORITY,
      deploymentProfile,
    })
    verifyReceiptAuthority(receipt, attestationPolicy, issuerRegistry, now)
    if (index < 5) invariant(receipt.candidateReleaseDigest === null, `${phase.id} must not self-assert an unreleased candidate`)
    else {
      invariant(candidate, `${phase.id} requires an inline, verified immutable candidate release/BOM`)
      invariant(receipt.candidateReleaseDigest === candidate.digest, `${phase.id} receipt is not bound to the current candidate release`)
    }
    if (phase.id === 'candidate-freeze') {
      invariant(prepareVerification, 'prepare receipt cannot exist without the closed prepare verification receipt')
      invariant(
        canonicalDate(receipt.observedAt, 'candidate-freeze receipt observedAt').getTime()
          === canonicalDate(ledger.prepareVerification.preparedAt, 'candidate-freeze preparedAt').getTime(),
        'candidate-freeze receipt observation must equal the completed local prepare verification time',
      )
      invariant(
        releaseEvidenceByContract(receipt, 'staged-rollout-prepare-verification-v4').sha256 === prepareVerification.digest,
        'prepare receipt does not content-address the closed verification result',
      )
    }
    if (phase.id === 'github-policy-bootstrap') {
      bootstrapTransition = evidenceValues.get('github-policy-bootstrap-readback-v1').value
      bootstrapReceipt = receipt
    }
    if (phase.id === 'commit-pr-open') {
      sourceTransition = evidenceValues.get('protected-pr-readback-v1').value
    }
    if (phase.id === 'pr-head-certification') {
      invariant(ledger.certificationRun !== null, 'PR-head certification receipt lacks ledger certification run binding')
      certificationTransition = evidenceValues.get('pr-head-certification-v1').value
      certificationReceipt = receipt
      certificationValidation = evidenceValues.get('pr-head-certification-v1').validation
    }
    if (phase.id === 'merge-post-gates') {
      hardGateTransition = evidenceValues.get('github-hard-gates-readback-v1').value
      if (ledger.releaseTrain.candidate) invariant(
        hardGateTransition.sourceCommit === ledger.releaseTrain.candidate.candidateRelease.sourceCommit
          && hardGateTransition.sourceTree === ledger.releaseTrain.candidate.candidateRelease.sourceTree,
        'immutable release candidate source commit/tree differs from the exact protected merge transition',
      )
    }
    if (phase.id === 'immutable-release-bom') {
      invariant(hardGateTransition, 'immutable release requires the exact protected merge transition')
      if (canonicalAuthority === CANONICAL_VALIDATION_AUTHORITY) {
        invariant(
          certificationValidation?.canonicalReceiptsValidated === true,
          'immutable release is blocked until the exact profile-appropriate PR-head evidence passes canonical readback validation',
        )
      }
      invariant(releaseEvidenceByContract(receipt, 'release-bom-v5').sha256 === ledger.releaseTrain.candidate.bom.sha256, 'release receipt BOM evidence differs from inline immutable BOM bytes')
      invariant(releaseEvidenceByContract(receipt, 'verified-immutable-release-v2').sha256 === ledger.releaseTrain.candidate.verifiedReleaseEvidence.sha256, 'release receipt immutable release evidence differs from inline verified evidence')
    }
    if (phase.id === 'soak-72h') {
      const wmReceipt = ledger.receipts[7]
      const completionReceipt = ledger.receipts[8]
      invariant(wmReceipt && completionReceipt, '72-hour soak cannot start without both WM canary and full rollout-completion receipts')
      const soakStartedAt = Math.max(new Date(wmReceipt.observedAt).getTime(), new Date(completionReceipt.observedAt).getTime())
      invariant(new Date(receipt.observedAt).getTime() >= soakStartedAt + 72 * 60 * 60 * 1000, 'WM candidate-bound soak is shorter than 72 hours from the later canary/completion observation')
      invariant(new Date(ledger.releaseTrain.candidate.candidateRelease.observedAt) <= new Date(wmReceipt.observedAt), 'WM canary predates the immutable candidate release observation')
    }
    if (phase.id === 'promotion-or-rollback' && receipt.decision === 'rollback') {
      invariant(previousGood, 'rollback requires a verified previous-good release/BOM/version')
      if (!contractValidators?.['fleet-recovery-authorization-v2'] && !contractValidators?.['fleet-reconcile-journal-v6']) {
        const journal = evidenceValues.get('fleet-reconcile-journal-v6').value
        const authorization = evidenceValues.get('fleet-recovery-authorization-v2').value
        const inventory = readJson(resolve(repoRoot, 'infra/governance/inventory/managed-repos.json'))
        const desired = readJson(resolve(repoRoot, 'infra/governance/desired/github.json'))
        const privilegedPolicy = readJson(resolve(repoRoot, 'infra/governance/privileged-trust-roots.json'))
        verifyFleetRecoveryAuthorization(authorization, {
          journal,
          inventory,
          desired,
          attestationPolicy,
          privilegedPolicy,
          issuerRegistry,
          now: new Date(receipt.observedAt),
        })
      }
    }
    previousReceipt = receipt
  }
  if (ledger.certificationRun !== null) {
    invariant(sourceTransition, 'PR-head certification run lacks the protected PR predecessor')
    invariant(certificationRun.manifest.head === sourceTransition.sourceCommit && certificationRun.manifest.tree === sourceTransition.sourceTree, 'PR-head certification run is not the exact committed PR head/tree')
  }
  if (ledger.receipts.length >= 6) invariant(candidate, 'immutable release phase requires a candidate release record')
  const nextPhase = ledger.receipts.length < plan.phases.length ? plan.phases[ledger.receipts.length].id : null
  const completedPhaseIds = new Set(ledger.receipts.map(receipt => receipt.phaseId))
  const finalDecision = completedPhaseIds.has('promotion-or-rollback')
    ? ledger.receipts.at(-1).decision
    : null
  const releaseStatus = !completedPhaseIds.has('immutable-release-bom')
    ? 'NOT_RELEASED'
    : !completedPhaseIds.has('rollout-completion')
      ? 'RELEASED_VALIDATION_IN_PROGRESS'
      : !completedPhaseIds.has('soak-72h')
        ? 'RELEASED_VALIDATED_SOAK_DEFERRED'
        : !completedPhaseIds.has('promotion-or-rollback')
          ? 'RELEASED_VALIDATED_SOAK_COMPLETE'
          : finalDecision === 'rollback'
            ? 'ROLLED_BACK_TO_PREVIOUS_GOOD'
            : 'RELEASED_PROMOTED'
  const ledgerSha256 = sha256(stableStringify(ledger, 0))
  const candidateReleaseDigest = candidate?.digest ?? null
  const deferredExecutionPackageBinding = releaseStatus === 'RELEASED_VALIDATED_SOAK_DEFERRED'
    ? {
        phaseId: 'soak-72h',
        ledgerSha256,
        prerequisiteReceiptSha256: stagedRolloutReceiptDigest(ledger.receipts.at(-1)),
        candidateReleaseDigest,
      }
    : null
  const productionEligible = canonicalAuthority === CANONICAL_VALIDATION_AUTHORITY
    && canonicalBindings !== null
    && repoRoot === REPOSITORY_ROOT
    && schemaPath === DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH
    && verifyMechanisms === true
    && contractValidators === null
    && activationReadinessResolver === externalActivationReadiness
    && activationCarrierValidator === validateExternalActivationCarrierAfterImage
  const report = {
    valid: true,
    productionEligible,
    planSha256,
    completedPhases: ledger.receipts.map(receipt => receipt.phaseId),
    nextPhase,
    releaseStatus,
    candidateReleaseDigest,
    deferredExecutionPackageBinding,
    candidateVersion: ledger.releaseTrain.candidate?.candidateRelease.version ?? null,
    previousGoodVersion: ledger.releaseTrain.previousGood?.candidateRelease.version ?? null,
    rollbackReady: Boolean(previousGood),
  }
  Object.defineProperty(report, VALIDATED_LEDGER_CAPABILITY, {
    enumerable: false,
    value: {
      planSha256,
      ledgerSha256,
      candidateReleaseDigest,
      productionEligible: report.productionEligible,
      canonicalBindings: productionEligible ? clone(canonicalBindings) : null,
    },
  })
  return report
}

export function stagedRolloutExecutionTransition({
  plan,
  ledger,
  phaseId,
  decision = null,
  validation,
}) {
  invariant(validation?.valid, 'execution transition requires a successfully validated staged-rollout ledger')
  invariant(validation.nextPhase !== null, 'staged rollout is already complete')
  const ledgerSha256 = sha256(stableStringify(ledger, 0))
  const prerequisiteReceiptSha256 = ledger.receipts.length
    ? stagedRolloutReceiptDigest(ledger.receipts.at(-1))
    : null
  const candidateReleaseDigest = ledger.releaseTrain.candidate
    ? stagedRolloutReleaseRecordDigest(ledger.releaseTrain.candidate)
    : null
  const previousGoodReleaseDigest = ledger.releaseTrain.previousGood
    ? stagedRolloutReleaseRecordDigest(ledger.releaseTrain.previousGood)
    : null
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(plan)
  const emergencyRollback = (
    deploymentProfile.id === PRODUCTION_GRADE_PROFILE_ID
      && validation.releaseStatus === 'RELEASED_VALIDATED_SOAK_DEFERRED'
      && validation.nextPhase === 'soak-72h'
      && phaseId === 'promotion-or-rollback'
      && decision === 'rollback'
  )
  invariant(
    phaseId === validation.nextPhase || emergencyRollback,
    `execution package may target only the next phase ${validation.nextPhase}`,
  )
  if (!emergencyRollback) return { emergencyRollbackBinding: null }
  invariant(
    validation.rollbackReady === true
      && previousGoodReleaseDigest !== null
      && candidateReleaseDigest !== null
      && validation.candidateReleaseDigest === candidateReleaseDigest
      && validation.deferredExecutionPackageBinding?.phaseId === 'soak-72h'
      && validation.deferredExecutionPackageBinding.ledgerSha256 === ledgerSha256
      && validation.deferredExecutionPackageBinding.prerequisiteReceiptSha256 === prerequisiteReceiptSha256
      && validation.deferredExecutionPackageBinding.candidateReleaseDigest === candidateReleaseDigest,
    'deferred-release emergency rollback requires the exact released candidate, previous-good release, and rollout-completion predecessor',
  )
  return {
    emergencyRollbackBinding: {
      schemaVersion: 1,
      kind: 'production-grade-deferred-soak-emergency-rollback',
      releaseStatus: 'RELEASED_VALIDATED_SOAK_DEFERRED',
      deploymentProfile: {
        id: deploymentProfile.id,
        sha256: deploymentProfile.sha256,
      },
      ledgerSha256,
      prerequisiteReceiptSha256,
      candidateReleaseDigest,
      previousGoodReleaseDigest,
      deferredPhaseId: 'soak-72h',
      soakCompleted: false,
      promotionEligible: false,
    },
  }
}

export function buildStagedRolloutExecutionPackage({
  plan,
  ledger,
  phaseId,
  capabilities,
  decision = null,
  validation,
}) {
  invariant(validation?.valid, 'execution package requires a successfully validated staged-rollout ledger')
  const capability = validation[VALIDATED_LEDGER_CAPABILITY]
  invariant(capability, 'execution package requires the non-serializable validator capability')
  invariant(capability.productionEligible, 'execution package refuses fixture or injected validators')
  invariant(capability.canonicalBindings, 'execution package requires canonical loader and file bindings')
  invariant(capability.planSha256 === stagedRolloutPlanDigest(plan), 'execution package validator capability references another plan')
  const ledgerSha256 = sha256(stableStringify(ledger, 0))
  const candidateReleaseDigest = ledger.releaseTrain.candidate
    ? stagedRolloutReleaseRecordDigest(ledger.releaseTrain.candidate)
    : null
  invariant(capability.ledgerSha256 === ledgerSha256, 'execution package validator capability references another ledger')
  invariant(
    capability.candidateReleaseDigest === candidateReleaseDigest
      && validation.candidateReleaseDigest === candidateReleaseDigest,
    'execution package validator capability references another candidate release',
  )
  const transition = stagedRolloutExecutionTransition({
    plan,
    ledger,
    phaseId,
    decision,
    validation,
  })
  if (validation.releaseStatus === 'RELEASED_VALIDATED_SOAK_DEFERRED'
    && transition.emergencyRollbackBinding === null) {
    invariant(
      phaseId === 'soak-72h'
        && validation.deferredExecutionPackageBinding?.phaseId === phaseId
        && validation.deferredExecutionPackageBinding.ledgerSha256 === ledgerSha256
        && validation.deferredExecutionPackageBinding.prerequisiteReceiptSha256
          === stagedRolloutReceiptDigest(ledger.receipts.at(-1))
        && validation.deferredExecutionPackageBinding.candidateReleaseDigest === candidateReleaseDigest,
      'deferred soak execution package is not bound to the exact released candidate and predecessor receipt',
    )
  }
  const phase = plan.phases.find(item => item.id === phaseId)
  const variant = selectedVariant(phase, decision)
  exactList(capabilities, variant.capabilities, `${phaseId} explicit capability flags`)
  if (phaseId === 'promotion-or-rollback' && decision === 'rollback') {
    invariant(validation.rollbackReady, 'rollback package requires a verified previous-good release/BOM/version')
  }
  const unsigned = {
    $schema: 'schemas/staged-rollout.schema.json',
    schemaVersion: 1,
    kind: 'staged-rollout-execution-package',
    mode: 'authorized-handoff-only',
    mutatesExternalState: false,
    phaseId,
    phaseIndex: phase.index,
    decision,
    planSha256: validation.planSha256,
    ledgerSha256,
    prerequisiteReceiptSha256: ledger.receipts.length ? stagedRolloutReceiptDigest(ledger.receipts.at(-1)) : null,
    activeRun: clone(ledger.activeRun),
    candidateVersion: validation.candidateVersion,
    previousGoodVersion: decision === 'rollback' ? validation.previousGoodVersion : null,
    emergencyRollbackBinding: transition.emergencyRollbackBinding,
    capabilities: clone(variant.capabilities),
    requiredEvidenceContracts: clone(variant.evidenceContracts),
    mechanismRefs: clone(phase.mechanismRefs),
    canonicalBindings: clone(capability.canonicalBindings),
  }
  const executionPackage = { ...unsigned, packageSha256: sha256(stableStringify(unsigned, 0)) }
  validateStagedRolloutExecutionPackage(executionPackage, { plan })
  return executionPackage
}

export function validateStagedRolloutExecutionPackage(executionPackage, { plan, schemaPath = DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH } = {}) {
  assertSchema(executionPackage, 'staged-rollout execution package', schemaPath)
  invariant(plan, 'execution package validation requires the staged-rollout plan')
  validateStagedRolloutPlan(plan)
  const unsigned = clone(executionPackage)
  delete unsigned.packageSha256
  invariant(executionPackage.packageSha256 === sha256(stableStringify(unsigned, 0)), 'execution package content address is invalid')
  invariant(executionPackage.planSha256 === stagedRolloutPlanDigest(plan), 'execution package plan digest mismatch')
  const phase = plan.phases[executionPackage.phaseIndex]
  invariant(phase?.id === executionPackage.phaseId, 'execution package phase identity mismatch')
  const variant = selectedVariant(phase, executionPackage.decision)
  const deploymentProfile = resolveStagedRolloutDeploymentProfile(plan)
  if (executionPackage.emergencyRollbackBinding !== null) {
    const binding = executionPackage.emergencyRollbackBinding
    exactObjectKeys(binding, [
      'schemaVersion', 'kind', 'releaseStatus', 'deploymentProfile',
      'ledgerSha256', 'prerequisiteReceiptSha256', 'candidateReleaseDigest',
      'previousGoodReleaseDigest', 'deferredPhaseId', 'soakCompleted',
      'promotionEligible',
    ], 'deferred-release emergency rollback binding')
    exactObjectKeys(binding.deploymentProfile, ['id', 'sha256'], 'deferred-release emergency rollback profile')
    invariant(
      deploymentProfile.id === PRODUCTION_GRADE_PROFILE_ID
        && binding.schemaVersion === 1
        && binding.kind === 'production-grade-deferred-soak-emergency-rollback'
        && binding.releaseStatus === 'RELEASED_VALIDATED_SOAK_DEFERRED'
        && binding.deploymentProfile.id === deploymentProfile.id
        && binding.deploymentProfile.sha256 === deploymentProfile.sha256
        && binding.ledgerSha256 === executionPackage.ledgerSha256
        && binding.prerequisiteReceiptSha256 === executionPackage.prerequisiteReceiptSha256
        && SHA256.test(binding.candidateReleaseDigest ?? '')
        && SHA256.test(binding.previousGoodReleaseDigest ?? '')
        && binding.deferredPhaseId === 'soak-72h'
        && binding.soakCompleted === false
        && binding.promotionEligible === false
        && executionPackage.phaseId === 'promotion-or-rollback'
        && executionPackage.decision === 'rollback',
      'deferred-release emergency rollback binding is stale, substituted, or claims promotion/soak completion',
    )
  }
  exactList(executionPackage.capabilities, variant.capabilities, 'execution package capabilities')
  exactList(executionPackage.requiredEvidenceContracts, variant.evidenceContracts, 'execution package evidence contracts')
  exactList(executionPackage.mechanismRefs, phase.mechanismRefs, 'execution package mechanism references')
  exactObjectKeys(executionPackage.canonicalBindings, [
    'schemaVersion', 'kind', 'governanceInputs', 'activeRunPointerSha256', 'runManifests',
  ], 'execution package canonical bindings')
  invariant(executionPackage.canonicalBindings.schemaVersion === 1 && executionPackage.canonicalBindings.kind === 'canonical-staged-rollout-bindings', 'execution package canonical binding identity is invalid')
  exactList(
    executionPackage.canonicalBindings.governanceInputs.map(item => item.path),
    canonicalGovernanceInputPaths(plan),
    'execution package canonical governance input paths',
  )
  for (const item of executionPackage.canonicalBindings.governanceInputs) {
    exactObjectKeys(item, ['path', 'sha256'], `execution package canonical input ${item.path}`)
    invariant(SHA256.test(item.sha256 ?? ''), `execution package canonical input ${item.path} digest is invalid`)
  }
  invariant(Array.isArray(executionPackage.canonicalBindings.runManifests) && [1, 2].includes(executionPackage.canonicalBindings.runManifests.length), 'execution package canonical run-manifest bindings are invalid')
  for (const [index, item] of executionPackage.canonicalBindings.runManifests.entries()) {
    exactObjectKeys(item, ['role', 'runId', 'sha256'], 'execution package canonical run manifest')
    invariant(item.role === (index === 0 ? 'candidate-freeze' : 'pr-head-certification') && SHA256.test(item.sha256 ?? ''), 'execution package canonical run-manifest role/digest is invalid')
  }
  invariant(executionPackage.canonicalBindings.runManifests[0].runId === executionPackage.activeRun.runId && executionPackage.canonicalBindings.runManifests[0].sha256 === executionPackage.activeRun.manifestSha256, 'execution package canonical freeze manifest binding differs from the ledger active run')
  return true
}

function loadCanonicalStagedRolloutContext({ ledgerPath, evidenceRoot = null, now = new Date() } = {}) {
  invariant(ledgerPath, 'canonical staged-rollout validation requires --ledger')
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'canonical staged-rollout validation time is invalid')
  const planRead = readUniqueJson(DEFAULT_STAGED_ROLLOUT_PLAN_PATH, 'canonical staged-rollout plan')
  const plan = planRead.value
  validateStagedRolloutPlan(plan, { repoRoot: REPOSITORY_ROOT })
  const ledgerRead = readUniqueJson(ledgerPath, 'staged-rollout ledger')
  const ledger = ledgerRead.value
  const ringsRead = readUniqueJson(resolve(GOVERNANCE_ROOT, 'release-rings.json'), 'canonical release rings')
  const registryRead = readUniqueJson(DEFAULT_ISSUER_REGISTRY_PATH, 'canonical issuer registry')
  const issuerRegistry = loadIssuerRegistry(registryRead.absolute)
  const runs = loadCanonicalRuns(ledger, evidenceRoot)
  const before = canonicalInputBindings(runs, plan)
  const validation = validateStagedRolloutLedger(plan, ledger, {
    activeRun: runs.freezeRun,
    certificationRun: runs.certificationRun,
    issuerRegistry,
    attestationPolicy: ringsRead.value.attestationPolicy,
    now,
    repoRoot: REPOSITORY_ROOT,
    schemaPath: DEFAULT_STAGED_ROLLOUT_SCHEMA_PATH,
    verifyMechanisms: true,
    activationReadinessResolver: externalActivationReadiness,
    contractValidators: null,
    canonicalAuthority: CANONICAL_VALIDATION_AUTHORITY,
    canonicalBindings: before,
  })
  const after = canonicalInputBindings(runs, plan)
  invariant(stableStringify(before, 0) === stableStringify(after, 0), 'canonical governance inputs or active run changed during validation')
  invariant(sha256(readFileSync(planRead.absolute)) === before.governanceInputs.find(item => item.path === 'infra/governance/staged-rollout-plan.json').sha256, 'canonical plan changed during validation')
  invariant(sha256(readFileSync(ledgerRead.absolute)) === sha256(ledgerRead.bytes), 'staged-rollout ledger changed during validation')
  return { plan, ledger, validation }
}

function rejectCanonicalClockInjection(options, label) {
  invariant(options && typeof options === 'object' && !Array.isArray(options), `${label} options are invalid`)
  invariant(!Object.hasOwn(options, 'now'), `${label} forbids a caller-controlled production clock`)
}

export function validateCanonicalStagedRolloutLedger(options = {}) {
  rejectCanonicalClockInjection(options, 'canonical staged-rollout validation')
  return loadCanonicalStagedRolloutContext({ ...options, now: new Date() }).validation
}

export function mintCanonicalStagedRolloutExecutionPackage(options = {}) {
  rejectCanonicalClockInjection(options, 'canonical staged-rollout package mint')
  const {
    ledgerPath,
    evidenceRoot = null,
    phaseId,
    capabilities,
    decision = null,
  } = options
  const context = loadCanonicalStagedRolloutContext({ ledgerPath, evidenceRoot, now: new Date() })
  return buildStagedRolloutExecutionPackage({
    plan: context.plan,
    ledger: context.ledger,
    phaseId,
    capabilities,
    decision,
    validation: context.validation,
  })
}

export function validateCanonicalStagedRolloutExecutionPackage(executionPackage, options = {}) {
  rejectCanonicalClockInjection(options, 'canonical staged-rollout package validation')
  const { ledgerPath, evidenceRoot = null } = options
  const context = loadCanonicalStagedRolloutContext({ ledgerPath, evidenceRoot, now: new Date() })
  const expected = buildStagedRolloutExecutionPackage({
    plan: context.plan,
    ledger: context.ledger,
    phaseId: executionPackage?.phaseId,
    capabilities: executionPackage?.capabilities,
    decision: executionPackage?.decision ?? null,
    validation: context.validation,
  })
  invariant(stableStringify(executionPackage, 0) === stableStringify(expected, 0), 'execution package differs from canonical ledger, active run, authority, or governance file bindings')
  return true
}

export const stagedRolloutContract = Object.freeze({
  phaseIds: PHASE_IDS,
  contractOrigins: CONTRACT_ORIGINS,
})

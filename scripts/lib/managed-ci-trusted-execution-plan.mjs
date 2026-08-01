import { createHash, verify } from 'node:crypto'
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from 'node:fs'
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { dump as dumpYaml, load as loadYaml } from 'js-yaml'
import {
  issuerRegistryDigest,
  publicKeyFromIssuer,
  validateIssuerRegistry,
} from '../../infra/governance/lib/issuer-registry.mjs'
import { workflowIdentity } from '../../infra/governance/lib/workflow-trust.mjs'
import {
  loadModelReleaseAuthorityPolicy,
  validateModelReleaseAuthorityBinding,
} from './model-release-authority.mjs'
import { loadModelInvocationProfiles } from './model-evidence-plan.mjs'
import {
  validateManagedCiRawReceiptValidationReadback,
  validateManagedCiSandboxReceipt,
} from './managed-ci-sandbox-receipt.mjs'
import {
  finalizationTransportReadbackDigest as authorityFinalizationTransportReadbackDigest,
  finalizationTransportContract as authorityFinalizationTransportContract,
  finalizedReceiptSetDigest as authorityFinalizedReceiptSetDigest,
  validateFinalizationTransportReadback as validateAuthorityFinalizationTransportReadback,
} from '../../infra/governance/managed-ci-executor/authority/managed-ci-authority-client.mjs'
import { runClosedGit } from '../../packages/governance/src/closed-tool-execution.mjs'
import {
  assertCanonicalGovernanceCarrierProjectionMap,
  GOVERNANCE_CARRIER_MAX_BYTES,
  governanceCarrierProjectionMap,
  governanceCarrierProjectionsForSource,
  projectGovernanceCarrierBytes,
  REVIEW_CAPABILITY_CERTIFICATION_CARRIER_PATH,
} from '../../packages/governance/src/carrier-projection.mjs'
import {
  validateExternalCertificationCarrierAfterImage,
  validateProviderReviewCapabilityCertificationCarrierAfterImage,
} from '../../infra/governance/lib/external-operator.mjs'
import {
  runtimeHarnessIdentityFromRepository,
} from '../../infra/governance/lib/provider-runtime-conformance.mjs'

export const MANAGED_CI_PLAN_PATH = 'scripts/managed-ci-trusted-execution-plan.json'
export const MANAGED_CI_PLAN_SCHEMA_PATH = 'scripts/schemas/managed-ci-trusted-execution-plan.schema.json'
export const MANAGED_CI_ACTIVATED_WORKFLOW_CONTRACT_PATH = 'scripts/managed-ci-activated-workflow-contract.json'
export const MANAGED_CI_ACTIVATED_WORKFLOW_CONTRACT_SCHEMA_PATH = 'scripts/schemas/managed-ci-activated-workflow-contract.schema.json'
export const MANAGED_CI_OIDC_BROKER_POLICY_PATH = 'infra/governance/providers/managed-ci-oidc-broker-policy.json'
export const MANAGED_CI_OIDC_BROKER_POLICY_SCHEMA_PATH = 'infra/governance/schemas/managed-ci-oidc-broker-policy.schema.json'
export const MANAGED_CI_EXECUTOR_SUPPLY_CHAIN_POLICY_PATH = 'infra/governance/providers/managed-ci-executor-supply-chain.json'
export const MANAGED_CI_EXECUTOR_SUPPLY_CHAIN_POLICY_SCHEMA_PATH = 'infra/governance/schemas/managed-ci-executor-supply-chain.schema.json'
export const MANAGED_CI_TRUSTED_AUTHORITY_POLICY_PATH = 'infra/governance/providers/managed-ci-trusted-authority-policy.json'
export const MANAGED_CI_TRUSTED_AUTHORITY_POLICY_SCHEMA_PATH = 'infra/governance/schemas/managed-ci-trusted-authority-policy.schema.json'
export const MANAGED_CI_FINALIZED_RECEIPT_SCHEMA_PATH = 'scripts/schemas/managed-ci-finalized-receipt.schema.json'
export const MANAGED_CI_RAW_RECEIPT_SCHEMA_PATH = 'scripts/schemas/managed-ci-sandbox-receipt.schema.json'
const EXTERNAL_ACTIVATION_CARRIER_PATH = 'infra/governance/external-activation-requirements.json'
const PROVIDER_CERTIFICATION_CARRIER_PATH = 'infra/governance/providers/certifications.json'
const EXPECTED_CLASSES = Object.freeze([
  'dependency-acquisition',
  'deterministic-hook-audit',
  'model-broker',
  'github-observer',
])
const MANAGED_CI_EXECUTOR_BUILDER_WORKFLOW_SHA256 = '907599cb201de7c14f370de0d87c7856b5169bcd59f88b0e689026b5e6e4856b'
const JSON_SCHEMA_VALIDATOR_CACHE_LIMIT = 32
const jsonSchemaValidatorCache = new Map()
const managedCiCarrierValidationContexts = new WeakMap()
const managedCiTrustedExecutionCoreDigests = new WeakMap()
const managedCiTrustedExecutionCoreContexts = new WeakMap()

function managedCiTrustedCoreDigestValue(value, ancestors = new WeakSet()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value
  if (typeof value === 'bigint') return { $bigint: value.toString() }
  if (typeof value === 'undefined') return { $undefined: true }
  if (typeof value === 'function') {
    return { $functionSha256: managedCiSha256(Function.prototype.toString.call(value)) }
  }
  if (typeof value === 'symbol') return { $symbol: String(value) }
  if (typeof value !== 'object') fail('managed CI trusted core contains a non-data value')
  if (ancestors.has(value)) fail('managed CI trusted core contains a cycle')
  ancestors.add(value)
  let normalized
  if (Buffer.isBuffer(value)) {
    normalized = { $bufferSha256: managedCiSha256(value), size: value.length }
  } else if (value instanceof Date) {
    normalized = { $date: value.toISOString() }
  } else if (Array.isArray(value)) {
    normalized = value.map(item => managedCiTrustedCoreDigestValue(item, ancestors))
  } else if (value instanceof Map) {
    normalized = {
      $map: [...value.entries()]
        .map(([key, item]) => [
          managedCiTrustedCoreDigestValue(key, ancestors),
          managedCiTrustedCoreDigestValue(item, ancestors),
        ])
        .sort((left, right) => managedCiStableStringify(left[0]).localeCompare(
          managedCiStableStringify(right[0]),
          'en',
        )),
    }
  } else if (value instanceof Set) {
    normalized = {
      $set: [...value].map(item => managedCiTrustedCoreDigestValue(item, ancestors))
        .sort((left, right) => managedCiStableStringify(left).localeCompare(
          managedCiStableStringify(right),
          'en',
        )),
    }
  } else {
    normalized = Object.fromEntries(
      Object.keys(value).sort(compareSnapshotPaths).map(key => [
        key,
        managedCiTrustedCoreDigestValue(value[key], ancestors),
      ]),
    )
  }
  ancestors.delete(value)
  return normalized
}

function managedCiTrustedExecutionCoreDigest(core) {
  return managedCiSha256(managedCiStableStringify(managedCiTrustedCoreDigestValue(core)))
}
export const MANAGED_CI_PERMISSION_KEYS = Object.freeze([
  'actions',
  'artifact-metadata',
  'attestations',
  'checks',
  'code-quality',
  'contents',
  'deployments',
  'discussions',
  'id-token',
  'issues',
  'models',
  'packages',
  'pages',
  'pull-requests',
  'security-events',
  'statuses',
  'vulnerability-alerts',
])

const ACTIONS = Object.freeze({
  checkout: 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
  download: 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
  upload: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
})
const EXPECTED_DAG = Object.freeze({
  'dependency-acquisition': ['freeze-subject-authority', 'sandbox-session-authority'],
  'deterministic-hook-audit': ['freeze-subject-authority', 'sandbox-session-authority', 'dependency-acquisition'],
  'model-broker': ['freeze-subject-authority', 'sandbox-session-authority', 'deterministic-hook-audit'],
  'github-observer': ['freeze-subject-authority', 'sandbox-session-authority', 'dependency-acquisition', 'deterministic-hook-audit', 'model-broker'],
})
const CONTAINER_REPOSITORIES = Object.freeze(Object.fromEntries(EXPECTED_CLASSES.map(id => [id, `ghcr.io/ajenchen/managed-ci-${id}`])))
const READ_ONLY_CONTAINER_OPTIONS = '--user 65532:65532 --read-only --cap-drop=ALL --security-opt=no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,nodev,size=512m'
const EPHEMERAL_CONTAINER_OPTIONS = '--user 65532:65532 --cap-drop=ALL --security-opt=no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,nodev,size=512m'
const CHECKOUT_WITH = Object.freeze({
  ref: '${{ inputs.subjectCommit }}',
  'persist-credentials': false,
  'fetch-depth': 1,
  'fetch-tags': false,
  lfs: false,
  submodules: false,
  clean: true,
})
const JOB_PROVENANCE_ENV = Object.freeze({
  MANAGED_WORKFLOW_DEFINITION_REF: '${{ github.workflow_ref }}',
  MANAGED_WORKFLOW_DEFINITION_COMMIT: '${{ github.workflow_sha }}',
  MANAGED_WORKFLOW_DEFINITION_TREE: '${{ inputs.workflowDefinitionTree }}',
  MANAGED_SUBJECT_COMMIT: '${{ inputs.subjectCommit }}',
  MANAGED_SUBJECT_TREE: '${{ inputs.subjectTree }}',
  MANAGED_MANIFEST_SHA256: '${{ needs.freeze-subject-authority.outputs.manifestSha256 }}',
  MANAGED_SUBJECT_RUN_ID: '${{ needs.freeze-subject-authority.outputs.freezeRunId }}',
  MANAGED_FROZEN_ARTIFACT_NAME: '${{ needs.freeze-subject-authority.outputs.artifactName }}',
  MANAGED_FROZEN_ARTIFACT_ID: '${{ needs.freeze-subject-authority.outputs.artifactId }}',
  MANAGED_FROZEN_ARTIFACT_LOCATOR: '${{ needs.freeze-subject-authority.outputs.artifactStorageLocator }}',
  MANAGED_FROZEN_ARTIFACT_SHA256: '${{ needs.freeze-subject-authority.outputs.artifactSha256 }}',
  MANAGED_FROZEN_ARTIFACT_SIZE: '${{ needs.freeze-subject-authority.outputs.artifactSize }}',
  MANAGED_FROZEN_LINEAGE_DIGEST: '${{ needs.freeze-subject-authority.outputs.lineageDigest }}',
  MANAGED_WORKFLOW_RUN_ID: '${{ github.run_id }}',
  MANAGED_WORKFLOW_RUN_ATTEMPT: '${{ github.run_attempt }}',
  MANAGED_HOST_SANDBOX_POLICY_SHA256: '${{ needs.sandbox-session-authority.outputs.hostSandboxPolicyDigest }}',
})
const WORKFLOW_DISPATCH_INPUTS = Object.freeze({
  workflowDefinitionTree: Object.freeze({
    description: 'Exact protected-main workflow-definition Git tree SHA (40 lowercase hexadecimal characters)',
    required: true,
    type: 'string',
  }),
  subjectCommit: Object.freeze({
    description: 'Exact audited subject commit SHA (40 lowercase hexadecimal characters)',
    required: true,
    type: 'string',
  }),
  subjectTree: Object.freeze({
    description: 'Exact audited subject Git tree SHA (40 lowercase hexadecimal characters)',
    required: true,
    type: 'string',
  }),
})
const PROVENANCE_ARGUMENTS = '--workflow-definition-ref "$MANAGED_WORKFLOW_DEFINITION_REF" --workflow-definition-commit "$MANAGED_WORKFLOW_DEFINITION_COMMIT" --workflow-definition-tree "$MANAGED_WORKFLOW_DEFINITION_TREE" --subject-commit "$MANAGED_SUBJECT_COMMIT" --subject-tree "$MANAGED_SUBJECT_TREE" --manifest-sha256 "$MANAGED_MANIFEST_SHA256" --subject-run-id "$MANAGED_SUBJECT_RUN_ID" --frozen-artifact-name "$MANAGED_FROZEN_ARTIFACT_NAME" --frozen-artifact-id "$MANAGED_FROZEN_ARTIFACT_ID" --frozen-artifact-locator "$MANAGED_FROZEN_ARTIFACT_LOCATOR" --frozen-artifact-sha256 "$MANAGED_FROZEN_ARTIFACT_SHA256" --frozen-artifact-size "$MANAGED_FROZEN_ARTIFACT_SIZE" --frozen-lineage-digest "$MANAGED_FROZEN_LINEAGE_DIGEST"'
const TRUSTED_CONTROL_PLANE_ARGUMENT = '--trusted-control-plane-root /opt/qijenchen/managed-ci/control-plane'
const OIDC_POLICY_ARGUMENTS = '--oidc-broker-policy /opt/qijenchen/managed-ci/control-plane/infra/governance/providers/managed-ci-oidc-broker-policy.json --oidc-audience qijenchen-managed-deep-audit-authority-v1 --subject-trust-mode exact-mounted-activation-bundle'

const SAFE_SCAFFOLD_DOCUMENT = Object.freeze({
  name: 'Managed deep-audit activation gate',
  on: { workflow_dispatch: null },
  permissions: { contents: 'read' },
  jobs: {
    'activation-blocked': {
      'runs-on': 'ubuntu-24.04',
      'timeout-minutes': 5,
      steps: [
        { uses: ACTIONS.checkout, with: { 'persist-credentials': false } },
        {
          name: 'Refuse execution until every managed class is externally activated',
          run: 'node scripts/verify-managed-ci-trusted-execution.mjs --check',
        },
      ],
    },
  },
})

function fail(message) {
  throw new Error(`managed CI trusted execution blocked:${message}`)
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
}

export const managedCiStableStringify = value => JSON.stringify(normalize(value))
export const managedCiSha256 = value => createHash('sha256').update(value).digest('hex')

// Content-addressed order is exact UTF-8 byte order. It deliberately preserves the repository's
// code points instead of applying host-dependent locale collation or implicit Unicode
// normalization, so the same valid Git paths produce identical digests in every runtime.
function compareUtf8Bytes(left, right) {
  return Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'))
}

function managedCiActivationDeclaration(plan) {
  if (!plan?.activation || typeof plan.activation !== 'object' || Array.isArray(plan.activation)) {
    fail('activation declaration is missing')
  }
  const declaration = structuredClone(plan.activation)
  delete declaration.verificationReceipt
  return declaration
}

export function managedCiActivationDeclarationDigest(plan) {
  return managedCiSha256(managedCiStableStringify(managedCiActivationDeclaration(plan)))
}

function unsignedActivationVerificationReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    fail('activation verification receipt is missing')
  }
  const unsigned = structuredClone(receipt)
  delete unsigned.signatures
  return unsigned
}

export function managedCiActivationVerificationReceiptSigningBytes(plan, receipt) {
  const unsigned = unsignedActivationVerificationReceipt(receipt)
  if (unsigned.schemaVersion !== 2 || unsigned.kind !== 'managed-ci-activation-verification-receipt-v2') {
    fail('activation verification receipt signing contract is not v2')
  }
  if (unsigned.declarationDigest !== managedCiActivationDeclarationDigest(plan)) {
    fail('activation verification receipt declaration digest differs from the exact activation declaration')
  }
  return Buffer.from(
    `qijenchen-managed-ci-activation-verification-v2\n${managedCiStableStringify(unsigned)}\n`,
    'utf8',
  )
}

function safeRegularFile(repoRoot, path, label) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || isAbsolute(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) fail(`${label} path is unsafe:${String(path)}`)
  const root = realpathSync(resolve(repoRoot))
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes repository:${path}`)
  let cursor = root
  for (const segment of rel.split(sep)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor)) fail(`${label} is missing:${path}`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link:${path}`)
    if (cursor === target && (!info.isFile() || info.nlink !== 1)) fail(`${label} must be one unique regular file:${path}`)
  }
  return target
}

function readJsonFile(repoRoot, path, label) {
  const absolute = safeRegularFile(repoRoot, path, label)
  const bytes = readFileSync(absolute)
  if (bytes.length === 0) fail(`${label} is empty:${path}`)
  try { return { value: JSON.parse(bytes), bytes, absolute } } catch (error) { fail(`${label} is invalid JSON:${error.message}`) }
}

function validateJson(value, schema, label) {
  // Loading the managed-CI state is intentionally repeated at every mutation
  // guard. Recompiling the same closed schemas at every guard adds substantial
  // CPU cost without adding a fresh trust observation: the schema bytes are
  // still re-read and content-addressed before this cache is consulted.
  const schemaDigest = managedCiSha256(managedCiStableStringify(schema))
  let compiled = jsonSchemaValidatorCache.get(schemaDigest)
  if (!compiled) {
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    addFormats(ajv)
    compiled = { ajv, validate: ajv.compile(schema) }
    if (jsonSchemaValidatorCache.size >= JSON_SCHEMA_VALIDATOR_CACHE_LIMIT) {
      jsonSchemaValidatorCache.delete(jsonSchemaValidatorCache.keys().next().value)
    }
    jsonSchemaValidatorCache.set(schemaDigest, compiled)
  }
  const { ajv, validate } = compiled
  if (!validate(value)) fail(`${label} schema validation failed:${ajv.errorsText(validate.errors, { separator: '; ' })}`)
}

function identityProjection(identity) {
  return {
    contentSha256: identity.contentSha256,
    gitBlobSha: identity.gitBlobSha,
    semanticVersion: identity.semanticVersion,
    semanticSha256: identity.semanticSha256,
  }
}

function exactArray(value, expected, label) {
  if (managedCiStableStringify(value) !== managedCiStableStringify(expected)) fail(`${label} differs from the closed canonical value`)
}

function exactValue(value, expected, label) {
  if (managedCiStableStringify(value) !== managedCiStableStringify(expected)) fail(`${label} differs from the closed canonical value`)
}

function exactObjectKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is not an object`)
  exactArray(Object.keys(value), expected, `${label} key closure/order`)
}

function canonicalUtcTimestamp(value) {
  if (typeof value !== 'string') return false
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
}

function expectedPermissions(observer = false) {
  return Object.fromEntries(MANAGED_CI_PERMISSION_KEYS.map(key => [key,
    key === 'contents' ? 'read'
      : key === 'id-token' ? 'none'
        : observer && ['actions', 'checks', 'pull-requests'].includes(key) ? 'read'
          : 'none',
  ]))
}

function assertPermissionMap(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} permissions must be an explicit mapping`)
  const keys = Object.keys(value).sort()
  exactArray(keys, [...MANAGED_CI_PERMISSION_KEYS], `${label} permission-key closure`)
  exactValue(value, expected, `${label} permissions`)
}

function artifactName(id) {
  return `managed-ci-${id}-` + '${{ github.run_id }}-${{ github.run_attempt }}'
}

function uploadWith(id) {
  return {
    name: artifactName(id),
    path: `.managed-ci/output/${id}\n.managed-ci/receipts/${id}.json`,
    'if-no-files-found': 'error',
    'retention-days': 14,
    'compression-level': 0,
    overwrite: false,
    'include-hidden-files': true,
  }
}

function downloadWith(id) {
  return { name: artifactName(id), path: `.managed-ci/input/${id}` }
}

function managedClassCommand(id) {
  const repositoryRoot = id === 'model-broker' ? 'none' : '\"$GITHUB_WORKSPACE/.managed-ci/frozen-subject/repository\"'
  const inputRoot = id === 'dependency-acquisition' ? 'none'
    : id === 'deterministic-hook-audit' ? '\"$GITHUB_WORKSPACE/.managed-ci/input/dependency-acquisition\"'
      : id === 'model-broker' ? '\"$GITHUB_WORKSPACE/.managed-ci/input/deterministic-hook-audit\"'
        : '\"$GITHUB_WORKSPACE/.managed-ci/input\"'
  return `/opt/qijenchen/managed-ci-host/bin/sandbox-launch --class ${id} --image ${CONTAINER_REPOSITORIES[id]}@{{image:${id}}} --policy /opt/qijenchen/managed-ci-host/policies/managed-ci-executor-supply-chain.json --policy-sha256 \"$MANAGED_HOST_SANDBOX_POLICY_SHA256\" --repository-root ${repositoryRoot} --input-root ${inputRoot} --output-root \"$GITHUB_WORKSPACE/.managed-ci/output/${id}\" --receipt-root \"$GITHUB_WORKSPACE/.managed-ci/receipts\" --observation-receipt \"$GITHUB_WORKSPACE/.managed-ci/host-observations/${id}.json\" --request \"$GITHUB_WORKSPACE/.managed-ci/sandbox-session/${id}.json\"`
}

function expectedContractSteps(id) {
  const downloads = id === 'deterministic-hook-audit' ? ['dependency-acquisition']
    : id === 'model-broker' ? ['deterministic-hook-audit']
      : id === 'github-observer' ? ['dependency-acquisition', 'deterministic-hook-audit', 'model-broker']
        : []
  const downloadNames = {
    'dependency-acquisition': id === 'deterministic-hook-audit' ? 'Fetch exact dependency bundle' : 'Fetch dependency acquisition receipt',
    'deterministic-hook-audit': id === 'model-broker' ? 'Fetch exact bounded signed shards' : 'Fetch deterministic and hook receipt',
    'model-broker': 'Fetch model broker receipt',
  }
  const runNames = {
    'dependency-acquisition': 'Execute dependency acquisition class',
    'deterministic-hook-audit': 'Execute deterministic and hook audit class',
    'model-broker': 'Execute content-only model broker class',
    'github-observer': 'Execute read-only GitHub observer class',
  }
  const uploadNames = {
    'dependency-acquisition': 'Retain dependency acquisition output and signed receipt',
    'deterministic-hook-audit': 'Retain deterministic and hook output and signed receipt',
    'model-broker': 'Retain model output and signed receipt',
    'github-observer': 'Retain GitHub observation and signed receipt',
  }
  return [
    {
      name: 'Download the exact authority-frozen subject artifact',
      uses: ACTIONS.download,
      with: { name: '${{ needs.freeze-subject-authority.outputs.artifactName }}', path: '.managed-ci/frozen-subject' },
    },
    {
      name: 'Download opaque sandbox session handles',
      uses: ACTIONS.download,
      with: { name: 'managed-ci-sandbox-session-${{ github.run_id }}-${{ github.run_attempt }}', path: '.managed-ci/sandbox-session' },
    },
    ...downloads.map(source => ({ name: downloadNames[source], uses: ACTIONS.download, with: downloadWith(source) })),
    { name: `${runNames[id]} in the externally enforced sandbox`, run: managedClassCommand(id), shell: 'bash --noprofile --norc -euo pipefail {0}' },
    { name: uploadNames[id], uses: ACTIONS.upload, with: uploadWith(id) },
    {
      name: 'Retain independently signed host-containment observation',
      uses: ACTIONS.upload,
      with: {
        name: `managed-ci-host-observation-${id}-` + '${{ github.run_id }}-${{ github.run_attempt }}',
        path: `.managed-ci/host-observations/${id}.json`,
        'if-no-files-found': 'error', 'retention-days': 14, 'compression-level': 0, overwrite: false, 'include-hidden-files': true,
      },
    },
  ]
}

function semanticPlanChecks(plan) {
  exactArray(plan.executionClasses.map(item => item.id), EXPECTED_CLASSES, 'execution class closure/order')
  if (plan.activatedWorkflowContract.path !== MANAGED_CI_ACTIVATED_WORKFLOW_CONTRACT_PATH
    || plan.activatedWorkflowContract.schemaPath !== MANAGED_CI_ACTIVATED_WORKFLOW_CONTRACT_SCHEMA_PATH) {
    fail('activated workflow contract pointers differ from the canonical closed files')
  }
  exactValue(plan.oidcBrokerPolicy, {
    path: MANAGED_CI_OIDC_BROKER_POLICY_PATH,
    schemaPath: MANAGED_CI_OIDC_BROKER_POLICY_SCHEMA_PATH,
  }, 'managed CI OIDC broker policy pointers')
  exactValue(plan.executorSupplyChainPolicy, {
    path: MANAGED_CI_EXECUTOR_SUPPLY_CHAIN_POLICY_PATH,
    schemaPath: MANAGED_CI_EXECUTOR_SUPPLY_CHAIN_POLICY_SCHEMA_PATH,
  }, 'managed CI executor supply-chain policy pointers')
  exactValue(plan.trustedAuthorityPolicy, {
    path: MANAGED_CI_TRUSTED_AUTHORITY_POLICY_PATH,
    schemaPath: MANAGED_CI_TRUSTED_AUTHORITY_POLICY_SCHEMA_PATH,
  }, 'managed CI trusted authority policy pointers')
  exactValue(plan.workflow.subjectInputs, {
    commit: 'subjectCommit',
    tree: 'subjectTree',
    manifestSha256: 'manifestSha256',
    runId: 'subjectRunId',
  }, 'managed CI audited-subject input map')
  if (plan.workflow.definitionTreeInput !== 'workflowDefinitionTree') fail('managed CI workflow-definition tree input differs from the closed canonical input')
  exactValue(plan.activationTrustBundle, {
    manifestPath: 'packages/governance/canonical/manifest.json',
    buildGraphPath: 'scripts/governance-build-graph.json',
    buildGraphSchemaPath: 'scripts/schemas/governance-build-graph.schema.json',
    stageId: 'control-plane',
    sourceResolvers: ['governance-manifest', 'root-provider-views'],
    controlPlaneLockPath: 'governance/control-plane.lock.json',
    controlPlaneLockSchemaPath: 'packages/governance/canonical/schemas/lock.schema.json',
  }, 'managed CI activation trust bundle')
  exactValue(plan.trust, {
    issuerRegistryPath: 'infra/governance/trust/issuers.json',
    issuerPolicyPath: 'infra/governance/release-rings.json',
    issuerPolicyPointer: 'attestationPolicy',
    runtimeEvidencePolicyPath: 'infra/governance/providers/runtime-conformance.json',
    issuerRole: 'completion-attestor',
    allowedKeyIdsField: 'allowedKeyIds',
    quorumField: 'completionAttestationQuorum',
    maxTtlMinutesField: 'maxCompletionTtlMinutes',
    clockSkewSecondsField: 'clockSkewSeconds',
    replay: {
      ledger: 'external-atomic-ttl-replay-ledger',
      minimumRetentionSeconds: 31_536_120,
    },
    retention: {
      minimumSeconds: 31_536_000,
      authority: 'offline-evidence-archive-compliance-object-lock',
    },
  }, 'managed CI activation receipt trust policy')
  const seenKinds = new Set()
  for (const item of plan.executionClasses) {
    if (item.job !== item.id) fail(`execution class job identity differs:${item.id}`)
    for (const kind of item.evidenceKinds) {
      if (seenKinds.has(kind)) fail(`evidence kind is assigned to multiple execution classes:${kind}`)
      seenKinds.add(kind)
    }
    if (item.network.mode === 'none' && item.network.allowedHosts.length !== 0) fail(`${item.id} network-none class retains allowed hosts`)
    if (item.network.mode !== 'none' && item.network.tlsRequired !== true) fail(`${item.id} network class does not require TLS`)
    if (item.isolation.backend !== 'externally-managed-rootless-podman-sandbox' || item.isolation.rootless !== true
      || item.isolation.runAsUser !== 65532 || item.isolation.runAsGroup !== 65532
      || item.isolation.noNewPrivileges !== true || item.isolation.capabilities.length !== 0
      || item.isolation.hostSocketMounted !== false) fail(`${item.id} isolation is not the closed externally managed rootless sandbox policy`)
    assertPermissionMap(item.permissions, expectedPermissions(item.id === 'github-observer'), item.id)
  }
  const dependency = plan.executionClasses[0]
  if (dependency.network.allowedHosts.length !== 1 || dependency.network.allowedHosts[0] !== 'registry.npmjs.org'
    || !dependency.install.command.includes('--ignore-scripts')
    || dependency.install.command.find(token => token.startsWith('--registry=')) !== '--registry=https://registry.npmjs.org/'
    || dependency.install.lifecycleScripts !== false || dependency.install.requireLockfileSri !== true) {
    fail('dependency acquisition network/install policy is internally inconsistent')
  }
  const audit = plan.executionClasses[1]
  if (audit.network.mode !== 'none' || audit.secretMode !== 'none' || audit.filesystem.rootFilesystem !== 'read-only') {
    fail('deterministic/hook audit must be network-none, secretless, and read-only')
  }
  const model = plan.executionClasses[2]
  if (model.network.mode !== 'provider-selected-tls-host-allowlist' || model.network.allowedHosts.length !== 0
    || model.selectedProviderRequired !== true || model.filesystem.repository !== 'not-mounted'
    || model.providerEgressRegistry.path !== 'infra/governance/providers/model-invocation-profiles.json'
    || !model.profilePaths.includes(model.providerEgressRegistry.path)) {
    fail('model broker provider-selected egress/shard policy is invalid')
  }
  const observer = plan.executionClasses[3]
  if (managedCiStableStringify(observer.network.allowedHosts) !== managedCiStableStringify(['api.github.com'])
    || observer.permissions.actions !== 'read' || observer.permissions.checks !== 'read'
    || observer.permissions['pull-requests'] !== 'read') fail('GitHub observer read-only policy is invalid')
  for (const item of plan.executionClasses.slice(0, 3)) {
    if (item.permissions.actions !== 'none' || item.permissions.checks !== 'none' || item.permissions['pull-requests'] !== 'none') {
      fail(`${item.id} has permissions reserved for the GitHub observer`)
    }
  }
  const activationDeclarationValues = [
    plan.activation.workflowIdentity,
    plan.activation.repositoryId,
    plan.activation.repositoryOwnerId,
    plan.activation.executorSourceCommit,
    plan.activation.executorSourceTree,
    plan.activation.builderWorkflowSha,
    plan.activation.executorBuildRunId,
    plan.activation.executorBuildRunAttempt,
    plan.activation.imageSetArtifactId,
    plan.activation.imageSetArtifactDigest,
    plan.activation.imageSetManifestSha256,
    plan.activation.imageSetInventorySha256,
    plan.activation.imageSetInventoryEntryCount,
    plan.activation.imageSetArtifactRetentionDays,
    plan.activation.verifiedAt,
    plan.activation.trustedAuthorityAttestationDigest,
    plan.activation.hostSandboxAttestationDigest,
    plan.activation.receiptSignerTrustReadbackDigest,
    ...Object.values(plan.activation.offlineEvidenceArchive),
    ...EXPECTED_CLASSES.flatMap(id => Object.values(plan.activation.executionClasses[id])),
  ]
  const allNull = activationDeclarationValues.every(value => value === null)
  const allBound = activationDeclarationValues.every(value => value !== null)
  if (!allNull && !allBound) {
    fail('workflow, repository, executor supply chain, trusted authority, host sandbox, signer readback, durable offline archive, and four closed image evidence sets must activate atomically')
  }
  if (allNull && plan.activation.verificationReceipt !== null) {
    fail('activation verification receipt cannot exist before the activation declaration is complete')
  }
  if (allBound) {
    const verifiedAt = new Date(plan.activation.verifiedAt)
    const retentionUntil = new Date(plan.activation.offlineEvidenceArchive.retentionUntil)
    if (!Number.isFinite(verifiedAt.getTime()) || !Number.isFinite(retentionUntil.getTime())
      || retentionUntil <= verifiedAt) {
      fail('managed CI offline evidence archive retention must extend beyond the external verification time')
    }
    if (plan.activation.offlineEvidenceArchive.writerPrincipal
      === plan.activation.offlineEvidenceArchive.verifierPrincipal) {
      fail('managed CI offline evidence archive writer and verifier principals must be independent')
    }
    let archiveUrl
    try {
      archiveUrl = new URL(plan.activation.offlineEvidenceArchive.locator)
    } catch {
      fail('managed CI offline evidence archive locator is invalid')
    }
    if (archiveUrl.protocol !== 'https:' || archiveUrl.username || archiveUrl.password
      || archiveUrl.search || archiveUrl.hash
      || (archiveUrl.hostname === 'github.com' && /\/actions\/runs\//.test(archiveUrl.pathname))
      || (archiveUrl.hostname === 'api.github.com' && /\/actions\/artifacts\//.test(archiveUrl.pathname))) {
      fail('managed CI offline evidence archive must use a stable credential-free HTTPS locator, not an ephemeral Actions artifact')
    }
    const attestationIds = new Set()
    for (const id of EXPECTED_CLASSES) {
      const activation = plan.activation.executionClasses[id]
      for (const kind of ['provenance', 'sbom', 'handoff']) {
        const attestationId = activation[`${kind}AttestationId`]
        const attestationUrl = activation[`${kind}AttestationUrl`]
        if (attestationUrl !== `https://github.com/ajenchen/design-system/attestations/${attestationId}`) {
          fail(`managed CI ${id} ${kind} attestation URL does not bind its exact attestation ID`)
        }
        if (attestationIds.has(attestationId)) {
          fail(`managed CI attestation ID is reused across the closed evidence set:${attestationId}`)
        }
        attestationIds.add(attestationId)
      }
    }
    if (plan.activation.verificationReceipt !== null) {
      const receipt = plan.activation.verificationReceipt
      exactValue(receipt.declarationDigest, managedCiActivationDeclarationDigest(plan), 'activation verification receipt declaration digest')
      exactValue(receipt.archive, {
        digest: plan.activation.offlineEvidenceArchive.digest,
        size: plan.activation.offlineEvidenceArchive.size,
        inventoryDigest: plan.activation.offlineEvidenceArchive.inventoryDigest,
        objectVersionId: plan.activation.offlineEvidenceArchive.objectVersionId,
        retentionMode: plan.activation.offlineEvidenceArchive.retentionMode,
        retentionUntil: plan.activation.offlineEvidenceArchive.retentionUntil,
        readbackDigest: plan.activation.offlineEvidenceArchive.readbackDigest,
      }, 'activation verification receipt archive binding')
      exactValue(receipt.aggregateHandoff, {
        executionClassCount: EXPECTED_CLASSES.length,
        artifactId: plan.activation.imageSetArtifactId,
        artifactDigest: plan.activation.imageSetArtifactDigest,
        manifestSha256: plan.activation.imageSetManifestSha256,
        inventorySha256: plan.activation.imageSetInventorySha256,
        inventoryEntryCount: plan.activation.imageSetInventoryEntryCount,
        artifactFileCount: 19,
        artifactRetentionDays: plan.activation.imageSetArtifactRetentionDays,
        storageClass: 'github-actions-artifact-non-worm',
      }, 'activation verification receipt deterministic four-class handoff')
      exactValue(receipt.imageDigests, Object.fromEntries(EXPECTED_CLASSES.map(id => [
        id,
        plan.activation.executionClasses[id].imageDigest,
      ])), 'activation verification receipt image digests')
      exactValue(receipt.runtimeSourceDigests, Object.fromEntries(EXPECTED_CLASSES.map(id => [
        id,
        plan.activation.executionClasses[id].runtimeSourceSha256,
      ])), 'activation verification receipt runtime source digests')
      exactValue(receipt.runtimeInventoryDigests, Object.fromEntries(EXPECTED_CLASSES.map(id => [
        id,
        plan.activation.executionClasses[id].runtimeInventoryDigest,
      ])), 'activation verification receipt runtime inventory digests')
      exactValue(receipt.evidenceSetDigests, Object.fromEntries(EXPECTED_CLASSES.map(id => [
        id,
        plan.activation.executionClasses[id].evidenceSetDigest,
      ])), 'activation verification receipt evidence-set digests')
      exactValue(receipt.issuedAt, plan.activation.verifiedAt, 'activation verification receipt issue time')
      exactValue(receipt.replay.ledger, plan.trust.replay.ledger, 'activation verification receipt replay ledger')
      if (receipt.replay.reservationId !== receipt.receiptId
        || receipt.nonce === receipt.receiptId
        || receipt.replay.committedAt !== receipt.issuedAt) {
        fail('activation verification receipt replay reservation does not bind the exact receipt and issue time')
      }
      const issuedAt = new Date(receipt.issuedAt)
      const expiresAt = new Date(receipt.expiresAt)
      const replayRetention = new Date(receipt.replay.retentionUntil)
      const archiveRetention = new Date(plan.activation.offlineEvidenceArchive.retentionUntil)
      if (!Number.isFinite(issuedAt.getTime()) || !Number.isFinite(expiresAt.getTime())
        || !Number.isFinite(replayRetention.getTime()) || !Number.isFinite(archiveRetention.getTime())
        || expiresAt <= issuedAt
        || expiresAt.getTime() - issuedAt.getTime() > 10_080 * 60_000
        || replayRetention.getTime() - issuedAt.getTime() < plan.trust.replay.minimumRetentionSeconds * 1000
        || archiveRetention.getTime() - issuedAt.getTime() < plan.trust.retention.minimumSeconds * 1000
        || archiveRetention < replayRetention) {
        fail('activation verification receipt TTL/replay/archive retention lifecycle is invalid')
      }
      if (new Set(receipt.signatures.map(item => item.issuerKeyId)).size !== receipt.signatures.length
        || new Set(receipt.signatures.map(item => item.issuerSubject)).size !== receipt.signatures.length) {
        fail('activation verification receipt signatures must use distinct issuer keys and subjects')
      }
    }
  }
  return true
}

export function validateManagedCiTrustedExecutionPlan(plan, { repoRoot = process.cwd() } = {}) {
  const schema = readJsonFile(repoRoot, MANAGED_CI_PLAN_SCHEMA_PATH, 'managed CI plan schema').value
  validateJson(plan, schema, 'plan')
  semanticPlanChecks(plan)
  return true
}

function closedPermissions(value, label) {
  if (value === null || value === undefined) value = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} permissions must be a mapping`)
  for (const [key, permission] of Object.entries(value)) {
    if (!MANAGED_CI_PERMISSION_KEYS.includes(key)) fail(`${label} contains an unknown permission key:${key}`)
    const allowed = key === 'id-token' ? ['none', 'write']
      : ['models', 'vulnerability-alerts'].includes(key) ? ['none', 'read']
        : ['none', 'read', 'write']
    if (!allowed.includes(permission)) fail(`${label} contains an invalid ${key} permission:${String(permission)}`)
  }
  return Object.fromEntries(MANAGED_CI_PERMISSION_KEYS.map(key => [key, value[key] ?? 'none']))
}

function effectivePermissions(workflowPermissions, jobPermissions) {
  // GitHub job-level permissions replace the workflow-level map; unspecified keys
  // become none. Merging these maps would silently preserve broader workflow grants.
  return jobPermissions === null || jobPermissions === undefined
    ? closedPermissions(workflowPermissions, 'workflow')
    : closedPermissions(jobPermissions, 'job')
}

function authorityPermissions({ contents = 'none', actions = 'none' } = {}) {
  return Object.fromEntries(MANAGED_CI_PERMISSION_KEYS.map(key => [key,
    key === 'id-token' ? 'write'
      : key === 'contents' ? contents
        : key === 'actions' ? actions
          : 'none',
  ]))
}

const FREEZE_OUTPUT_NAMES = Object.freeze([
  'artifactName', 'artifactId', 'artifactStorageLocator', 'artifactSha256', 'artifactSize',
  'freezeRunId', 'manifestSha256', 'manifestBytesSha256', 'coverageDigest', 'shardSetDigest',
  'authorityOidcProjectionDigest', 'lineageDigest',
])

function freezeAuthorityJob(plan, contract) {
  const outputs = Object.fromEntries(FREEZE_OUTPUT_NAMES.map(name => [name, '${{ steps.freeze.outputs.' + name + ' }}']))
  return {
    'runs-on': [...plan.workflow.runnerLabels],
    'timeout-minutes': 30,
    environment: contract.authority.freezeEnvironment,
    permissions: authorityPermissions(),
    outputs,
    env: {
      MANAGED_CI_AUTHORITY_ENVIRONMENT: contract.authority.freezeEnvironment,
      MANAGED_WORKFLOW_DEFINITION_REF: '${{ github.workflow_ref }}',
      MANAGED_WORKFLOW_DEFINITION_COMMIT: '${{ github.workflow_sha }}',
      MANAGED_WORKFLOW_DEFINITION_TREE: '${{ inputs.workflowDefinitionTree }}',
      MANAGED_SUBJECT_COMMIT: '${{ inputs.subjectCommit }}',
      MANAGED_SUBJECT_TREE: '${{ inputs.subjectTree }}',
      MANAGED_WORKFLOW_RUN_ID: '${{ github.run_id }}',
      MANAGED_WORKFLOW_RUN_ATTEMPT: '${{ github.run_attempt }}',
    },
    steps: [
      {
        name: 'Freeze canonical manifest, coverage, shards, bytes, and lineage without executing candidate files',
        id: 'freeze',
        run: `${contract.authority.client} --operation freeze-subject --response "$RUNNER_TEMP/managed-ci-freeze-response.json"`,
        shell: 'bash --noprofile --norc -euo pipefail {0}',
      },
    ],
  }
}

function sandboxAuthorityJob(plan, contract) {
  return {
    needs: 'freeze-subject-authority',
    'runs-on': [...plan.workflow.runnerLabels],
    'timeout-minutes': 15,
    environment: contract.authority.sandboxEnvironment,
    permissions: authorityPermissions({ actions: 'read' }),
    outputs: { hostSandboxPolicyDigest: '${{ steps.authorize.outputs.hostSandboxPolicyDigest }}' },
    env: {
      MANAGED_CI_AUTHORITY_ENVIRONMENT: contract.authority.sandboxEnvironment,
      MANAGED_SUBJECT_COMMIT: '${{ inputs.subjectCommit }}',
      MANAGED_SUBJECT_TREE: '${{ inputs.subjectTree }}',
      MANAGED_FROZEN_ARTIFACT_NAME: '${{ needs.freeze-subject-authority.outputs.artifactName }}',
      MANAGED_FROZEN_ARTIFACT_ID: '${{ needs.freeze-subject-authority.outputs.artifactId }}',
      MANAGED_FROZEN_ARTIFACT_LOCATOR: '${{ needs.freeze-subject-authority.outputs.artifactStorageLocator }}',
      MANAGED_FROZEN_ARTIFACT_SHA256: '${{ needs.freeze-subject-authority.outputs.artifactSha256 }}',
      MANAGED_FROZEN_ARTIFACT_SIZE: '${{ needs.freeze-subject-authority.outputs.artifactSize }}',
      MANAGED_FROZEN_LINEAGE_DIGEST: '${{ needs.freeze-subject-authority.outputs.lineageDigest }}',
    },
    steps: [
      {
        name: 'Authorize opaque per-class sandbox and egress sessions outside candidate namespaces',
        id: 'authorize',
        run: `${contract.authority.client} --operation authorize-sandbox-session --response "$RUNNER_TEMP/managed-ci-session-response.json"`,
        shell: 'bash --noprofile --norc -euo pipefail {0}',
      },
      {
        name: 'Upload non-secret opaque sandbox session handles',
        uses: ACTIONS.upload,
        with: {
          name: 'managed-ci-sandbox-session-${{ github.run_id }}-${{ github.run_attempt }}',
          path: '.managed-ci/sandbox-session', 'if-no-files-found': 'error', 'retention-days': 1,
          'compression-level': 0, overwrite: false, 'include-hidden-files': true,
        },
      },
    ],
  }
}

function finalizerAuthorityJob(plan, contract) {
  return {
    needs: [...EXPECTED_CLASSES],
    'runs-on': [...plan.workflow.runnerLabels],
    'timeout-minutes': 20,
    environment: contract.authority.finalizerEnvironment,
    permissions: authorityPermissions({ actions: 'read' }),
    env: { MANAGED_CI_AUTHORITY_ENVIRONMENT: contract.authority.finalizerEnvironment },
    steps: [
      ...EXPECTED_CLASSES.flatMap(id => [
        { name: `Download ${id} class result`, uses: ACTIONS.download, with: downloadWith(id) },
        { name: `Download ${id} host observation`, uses: ACTIONS.download, with: { name: `managed-ci-host-observation-${id}-` + '${{ github.run_id }}-${{ github.run_attempt }}', path: `.managed-ci/finalize/${id}/host` } },
      ]),
      {
        name: 'Finalize receipts through the external signer without executing candidate bytes',
        run: `${contract.authority.client} --operation finalize-receipts --response "$RUNNER_TEMP/managed-ci-finalize-response.json"`,
        shell: 'bash --noprofile --norc -euo pipefail {0}',
      },
      {
        name: 'Retain finalized signed receipt set and signer audit readback',
        uses: ACTIONS.upload,
        with: {
          name: 'managed-ci-finalized-receipts-${{ github.run_id }}-${{ github.run_attempt }}',
          path: '.managed-ci/finalized', 'if-no-files-found': 'error', 'retention-days': 14,
          'compression-level': 0, overwrite: false, 'include-hidden-files': true,
        },
      },
    ],
  }
}

function expectedActivatedWorkflowDocument(plan, contract) {
  const jobs = {
    'freeze-subject-authority': freezeAuthorityJob(plan, contract),
    'sandbox-session-authority': sandboxAuthorityJob(plan, contract),
  }
  const expectedTimeouts = { 'dependency-acquisition': 30, 'deterministic-hook-audit': 45, 'model-broker': 60, 'github-observer': 20 }
  for (const id of EXPECTED_CLASSES) {
    const executionClass = plan.executionClasses.find(item => item.id === id)
    jobs[id] = {
      needs: EXPECTED_DAG[id],
      'runs-on': [...plan.workflow.runnerLabels],
      'timeout-minutes': expectedTimeouts[id],
      permissions: structuredClone(executionClass.permissions),
      env: { ...JOB_PROVENANCE_ENV },
      steps: expectedContractSteps(id),
    }
  }
  jobs['receipt-finalizer-authority'] = finalizerAuthorityJob(plan, contract)
  return { name: 'Managed deep-audit trusted execution', on: { workflow_dispatch: { inputs: WORKFLOW_DISPATCH_INPUTS } }, permissions: {}, jobs }
}

function validateActivatedWorkflowContract(contract, plan) {
  exactValue(contract.authority, {
    client: '/opt/qijenchen/managed-ci-authority/bin/managed-ci-authority-client',
    freezeEnvironment: 'managed-ci-freeze-authority-v1',
    sandboxEnvironment: 'managed-ci-sandbox-authority-v1',
    finalizerEnvironment: 'managed-ci-receipt-finalizer-v1',
    audience: 'qijenchen-managed-deep-audit-authority-v1',
  }, 'activated workflow trusted authority contract')
  exactValue(contract.sandbox, {
    launcher: '/opt/qijenchen/managed-ci-host/bin/sandbox-launch',
    policy: '/opt/qijenchen/managed-ci-host/policies/managed-ci-executor-supply-chain.json',
    candidateIdTokenPermission: 'none', candidateCredentials: 'none',
    candidateProcessBoundary: 'private-hidepid2', secretAndSignerBoundary: 'external-authority-only',
  }, 'activated workflow sandbox contract')
  exactValue(contract.frozenSubject, {
    kind: 'managed-ci-frozen-subject-v1',
    artifactNameTemplate: 'managed-ci-frozen-subject-${{ github.run_id }}-${{ github.run_attempt }}',
    downloadPath: '.managed-ci/frozen-subject', sameArtifactRequiredForAllClasses: true,
    recomputeSha256ForAllClasses: true,
  }, 'activated workflow frozen-subject contract')
  const document = expectedActivatedWorkflowDocument(plan, contract)
  exactArray(Object.keys(document.jobs).sort(), [...EXPECTED_CLASSES, 'freeze-subject-authority', 'sandbox-session-authority', 'receipt-finalizer-authority'].sort(), 'activated workflow contract job closure')
  exactValue(document.on, { workflow_dispatch: { inputs: WORKFLOW_DISPATCH_INPUTS } }, 'activated workflow contract trigger')
  exactValue(document.permissions, {}, 'activated workflow contract top-level permissions')
  for (const id of EXPECTED_CLASSES) {
    const job = document.jobs[id]
    const executionClass = plan.executionClasses.find(item => item.id === id)
    if (!job || !executionClass) fail(`activated workflow contract class is missing:${id}`)
    exactValue(job.needs, EXPECTED_DAG[id], `${id} needs DAG`)
    exactValue(job['runs-on'], plan.workflow.runnerLabels, `${id} externally managed runner labels`)
    exactValue(job.env, JOB_PROVENANCE_ENV, `${id} provenance environment`)
    assertPermissionMap(job.permissions, executionClass.permissions, `${id} activated job`)
    if (job.permissions['id-token'] !== 'none' || job.environment !== undefined || job.container !== undefined) fail(`${id} candidate job can mint OIDC, use an environment, or bypass the host sandbox`)
    const token = `{{image:${id}}}`
    if (contract.imageDigestTokens[token] !== id) fail(`${id} image activation token is invalid`)
    exactValue(job.steps, expectedContractSteps(id), `${id} activated steps/commands`)
  }
  const serialized = JSON.stringify(document)
  if (serialized.includes('github.sha') || serialized.includes('inputs.manifestSha256') || serialized.includes('inputs.subjectRunId')) fail('activated workflow trusts a mutable caller subject or github.sha')
  for (const forbidden of ['/opt/qijenchen/managed-ci/bin/oidc-receipt-signer', '/opt/qijenchen/managed-ci/bin/oidc-model-secret-broker', '/opt/qijenchen/managed-ci/bin/oidc-github-readonly-token-broker']) {
    if (serialized.includes(forbidden)) fail(`candidate workflow exposes trusted authority binary:${forbidden}`)
  }
  for (const id of EXPECTED_CLASSES) {
    const token = `{{image:${id}}}`
    if (serialized.split(token).length - 1 !== 1) fail(`${id} image activation token must occur exactly once`)
  }
  const expressions = serialized.match(/\$\{\{[^}]+\}\}/g) ?? []
  const allowedExpressions = new Set([
    '${{ github.workflow_ref }}',
    '${{ github.workflow_sha }}',
    '${{ inputs.workflowDefinitionTree }}',
    '${{ inputs.subjectCommit }}',
    '${{ inputs.subjectTree }}',
    '${{ github.run_id }}',
    '${{ github.run_attempt }}',
    ...FREEZE_OUTPUT_NAMES.map(name => '${{ needs.freeze-subject-authority.outputs.' + name + ' }}'),
    '${{ needs.sandbox-session-authority.outputs.hostSandboxPolicyDigest }}',
    '${{ steps.authorize.outputs.hostSandboxPolicyDigest }}',
    ...FREEZE_OUTPUT_NAMES.map(name => '${{ steps.freeze.outputs.' + name + ' }}'),
  ])
  if (expressions.some(expression => !allowedExpressions.has(expression))) fail('activated workflow contract contains an unreviewed GitHub expression')
  return true
}

export function loadManagedCiActivatedWorkflowContract({ repoRoot = process.cwd(), plan } = {}) {
  const contractRead = readJsonFile(repoRoot, plan.activatedWorkflowContract.path, 'activated workflow contract')
  const schemaRead = readJsonFile(repoRoot, plan.activatedWorkflowContract.schemaPath, 'activated workflow contract schema')
  validateJson(contractRead.value, schemaRead.value, 'activated workflow contract')
  validateActivatedWorkflowContract(contractRead.value, plan)
  return {
    contract: contractRead.value,
    digest: managedCiSha256(contractRead.bytes),
    schemaDigest: managedCiSha256(schemaRead.bytes),
  }
}

function substituteImageActivation(value, plan, contract) {
  if (Array.isArray(value)) return value.map(item => substituteImageActivation(item, plan, contract))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteImageActivation(item, plan, contract)]))
  if (typeof value !== 'string') return value
  let rendered = value
  for (const [token, id] of Object.entries(contract.imageDigestTokens)) {
    const digest = plan.activation.executionClasses[id].imageDigest
    if (digest === null) fail(`cannot render activated workflow with a null image digest:${id}`)
    rendered = rendered.split(token).join(digest)
  }
  if (rendered.includes('{{image:')) fail('activated workflow retains an unresolved image token')
  return rendered
}

export function managedCiActivatedWorkflowDocument(plan, contract) {
  validateActivatedWorkflowContract(contract, plan)
  return substituteImageActivation(expectedActivatedWorkflowDocument(plan, contract), plan, contract)
}

export function renderManagedCiActivatedWorkflow(plan, contract) {
  return dumpYaml(managedCiActivatedWorkflowDocument(plan, contract), {
    noRefs: true,
    noCompatMode: true,
    lineWidth: -1,
    sortKeys: false,
  })
}

export function inspectManagedCiWorkflowMechanism({ repoRoot = process.cwd(), plan, contractState } = {}) {
  const path = plan?.workflow?.path
  const absolute = safeRegularFile(repoRoot, path, 'managed CI workflow')
  const content = readFileSync(absolute, 'utf8')
  let identity
  let document
  try {
    identity = workflowIdentity(content)
    document = loadYaml(content, { json: false })
  } catch (error) {
    fail(`managed CI workflow cannot be parsed:${error.message}`)
  }
  const observedIdentity = identityProjection(identity)
  const blockers = []
  const activationComplete = plan.activation.workflowIdentity !== null
    && plan.activation.repositoryId !== null
    && plan.activation.repositoryOwnerId !== null
    && plan.activation.executorSourceCommit !== null
    && plan.activation.executorSourceTree !== null
    && plan.activation.builderWorkflowSha !== null
    && plan.activation.executorBuildRunId !== null
    && plan.activation.executorBuildRunAttempt !== null
    && plan.activation.imageSetArtifactId !== null
    && plan.activation.imageSetArtifactDigest !== null
    && plan.activation.imageSetManifestSha256 !== null
    && plan.activation.imageSetInventorySha256 !== null
    && plan.activation.imageSetInventoryEntryCount !== null
    && plan.activation.imageSetArtifactRetentionDays !== null
    && plan.activation.verifiedAt !== null
    && plan.activation.trustedAuthorityAttestationDigest !== null
    && plan.activation.hostSandboxAttestationDigest !== null
    && plan.activation.receiptSignerTrustReadbackDigest !== null
    && Object.values(plan.activation.offlineEvidenceArchive).every(value => value !== null)
    && Object.values(plan.activation.executionClasses).every(item => Object.values(item).every(value => value !== null))
  if (!activationComplete) {
    if (managedCiStableStringify(document) !== managedCiStableStringify(SAFE_SCAFFOLD_DOCUMENT)) {
      fail('inactive workflow differs from the exact pinned manual refusal scaffold')
    }
    if (plan.activation.workflowIdentity === null) blockers.push('workflow identity activation is null')
    for (const field of [
      'repositoryId',
      'repositoryOwnerId',
      'executorSourceCommit',
      'executorSourceTree',
      'builderWorkflowSha',
      'executorBuildRunId',
      'executorBuildRunAttempt',
      'imageSetArtifactId',
      'imageSetArtifactDigest',
      'imageSetManifestSha256',
      'imageSetInventorySha256',
      'imageSetInventoryEntryCount',
      'imageSetArtifactRetentionDays',
      'verifiedAt',
      'trustedAuthorityAttestationDigest',
      'hostSandboxAttestationDigest',
      'receiptSignerTrustReadbackDigest',
    ]) {
      if (plan.activation[field] === null) blockers.push(`managed CI activation is null:${field}`)
    }
    for (const [field, value] of Object.entries(plan.activation.offlineEvidenceArchive)) {
      if (value === null) blockers.push(`offline evidence archive activation is null:${field}`)
    }
    for (const id of EXPECTED_CLASSES) {
      for (const [field, value] of Object.entries(plan.activation.executionClasses[id])) {
        if (value === null) blockers.push(`container image activation is null:${id}:${field}`)
      }
    }
  } else {
    const expectedDocument = managedCiActivatedWorkflowDocument(plan, contractState.contract)
    if (managedCiStableStringify(document) !== managedCiStableStringify(expectedDocument)) {
      fail('activated workflow document differs from the closed reviewed contract')
    }
    if (managedCiStableStringify(plan.activation.workflowIdentity) !== managedCiStableStringify(observedIdentity)) {
      fail('activated workflow identity differs from the exact reviewed workflow bytes')
    }
    for (const executionClass of plan.executionClasses) {
      const job = identity.semantics.jobs[executionClass.id]
      if (!job || managedCiStableStringify(effectivePermissions(identity.semantics.permissions, job.permissions))
        !== managedCiStableStringify(executionClass.permissions)) fail(`activated workflow permissions differ:${executionClass.id}`)
    }
  }
  return {
    content,
    identity: observedIdentity,
    workflowIdentityDigest: managedCiSha256(managedCiStableStringify(observedIdentity)),
    contractDigest: contractState.digest,
    blockers,
  }
}

function profileBindings(repoRoot, executionClass) {
  return executionClass.profilePaths.map(path => {
    const bytes = readFileSync(safeRegularFile(repoRoot, path, `${executionClass.id} profile`))
    return { path, sha256: managedCiSha256(bytes) }
  })
}

function modelEgressBindings(repoRoot, executionClass) {
  const registryState = loadModelInvocationProfiles({
    repoRoot,
    profilePath: executionClass.providerEgressRegistry.path,
  })
  const profiles = Object.entries(registryState.profiles).map(([selectedProvider, profile]) => ({
    selectedProvider,
    allowedHosts: [...profile.egressAllowedHosts],
    modelIdentityPolicyDigest: managedCiSha256(managedCiStableStringify(profile.modelIdentity)),
    allowedModelReleaseIds: [...profile.modelIdentity.allowedModelReleaseIds],
  }))
  if (profiles.length === 0) fail('model egress registry has no providers')
  return {
    registrySha256: registryState.profileDigest,
    brokerProfilesSha256: registryState.brokerProfileDigest,
    modelReleaseRegistrySha256: registryState.releaseState.registryDigest,
    profiles,
    digest: managedCiSha256(managedCiStableStringify({
      registryPath: executionClass.providerEgressRegistry.path,
      registrySha256: registryState.profileDigest,
      brokerProfilesSha256: registryState.brokerProfileDigest,
      modelReleaseRegistrySha256: registryState.releaseState.registryDigest,
      profiles,
    })),
    profileState: registryState,
    releaseState: registryState.releaseState,
  }
}

function trustBindings(repoRoot, trust, now) {
  const registryRead = readJsonFile(repoRoot, trust.issuerRegistryPath, 'managed CI activation issuer registry')
  validateIssuerRegistry(registryRead.value)
  const policyRead = readJsonFile(repoRoot, trust.issuerPolicyPath, 'managed CI activation receipt policy')
  const policySchemaPath = pointerPath(
    repoRoot,
    trust.issuerPolicyPath,
    policyRead.value?.$schema,
    'managed CI activation receipt policy schema',
  )
  validateJson(
    policyRead.value,
    readJsonFile(repoRoot, policySchemaPath, 'managed CI activation receipt policy schema').value,
    'managed CI activation receipt policy',
  )
  const policy = policyRead.value?.[trust.issuerPolicyPointer]
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    fail(`managed CI activation receipt policy pointer is missing:${trust.issuerPolicyPointer}`)
  }
  const allowedKeyIds = policy[trust.allowedKeyIdsField]
  const quorum = policy[trust.quorumField]
  const maxTtlMinutes = policy[trust.maxTtlMinutesField]
  const clockSkewSeconds = policy[trust.clockSkewSecondsField]
  if (policy.algorithm !== 'ed25519'
    || !Array.isArray(allowedKeyIds)
    || new Set(allowedKeyIds).size !== allowedKeyIds.length
    || managedCiStableStringify(allowedKeyIds) !== managedCiStableStringify([...allowedKeyIds].sort())
    || !allowedKeyIds.every(keyId => /^[a-z0-9][a-z0-9._-]*$/.test(keyId))
    || !Number.isInteger(quorum) || quorum < 1 || quorum > 5
    || !Number.isInteger(maxTtlMinutes) || maxTtlMinutes < 1
    || !Number.isInteger(clockSkewSeconds) || clockSkewSeconds < 0 || clockSkewSeconds > 600) {
    fail('managed CI activation receipt policy has an invalid allowed-key/quorum/lifecycle shape')
  }
  const registryDigest = issuerRegistryDigest(registryRead.value)
  if (policy.issuerRegistryDigest !== registryDigest) {
    fail('managed CI activation receipt policy issuer registry digest is stale')
  }
  const runtimePolicyBytes = readFileSync(safeRegularFile(
    repoRoot,
    trust.runtimeEvidencePolicyPath,
    'managed CI runtime evidence policy',
  ))
  const bindings = [
    { path: trust.issuerRegistryPath, sha256: managedCiSha256(registryRead.bytes) },
    { path: trust.issuerPolicyPath, sha256: managedCiSha256(policyRead.bytes) },
    { path: trust.runtimeEvidencePolicyPath, sha256: managedCiSha256(runtimePolicyBytes) },
  ]
  const receiptPolicy = {
    algorithm: policy.algorithm,
    issuerRegistryDigest: registryDigest,
    allowedKeyIds: [...allowedKeyIds],
    quorum,
    maxTtlMinutes,
    clockSkewSeconds,
    issuerRole: trust.issuerRole,
    replay: { ...trust.replay },
    retention: { ...trust.retention },
  }
  const current = now instanceof Date ? now : new Date(now)
  if (!Number.isFinite(current.getTime())) fail('managed CI trust policy verification time is invalid')
  const issuerById = new Map(registryRead.value.issuers.map(issuer => [issuer.keyId, issuer]))
  const eligibleSubjects = new Set()
  const policyBlockers = []
  for (const keyId of allowedKeyIds) {
    const issuer = issuerById.get(keyId)
    const notBefore = new Date(issuer?.notBefore)
    const notAfter = new Date(issuer?.notAfter)
    if (!issuer
      || issuer.status !== 'active'
      || issuer.revokedAt !== null
      || !issuer.roles.includes(trust.issuerRole)
      || !Number.isFinite(notBefore.getTime())
      || !Number.isFinite(notAfter.getTime())
      || notBefore > current
      || notAfter <= current) {
      policyBlockers.push(`activation allowed issuer is not a current ${trust.issuerRole}:${keyId}`)
    } else {
      eligibleSubjects.add(issuer.subject)
    }
  }
  if (eligibleSubjects.size < quorum) {
    policyBlockers.push(`activation allowed-key policy lacks current distinct-subject quorum ${quorum}`)
  }
  return {
    bindings,
    digest: managedCiSha256(managedCiStableStringify(bindings)),
    registry: registryRead.value,
    registryDigest,
    receiptPolicy,
    receiptPolicyDigest: managedCiSha256(managedCiStableStringify(receiptPolicy)),
    eligibleSubjects: [...eligibleSubjects].sort(),
    policyBlockers,
    policyActive: policyBlockers.length === 0,
  }
}

function loadOidcBrokerPolicy(repoRoot, plan) {
  const policyRead = readJsonFile(repoRoot, plan.oidcBrokerPolicy.path, 'managed CI OIDC broker policy')
  const schemaRead = readJsonFile(repoRoot, plan.oidcBrokerPolicy.schemaPath, 'managed CI OIDC broker policy schema')
  validateJson(policyRead.value, schemaRead.value, 'managed CI OIDC broker policy')
  const policy = policyRead.value
  exactValue(policy.workflowIdentity, {
    repository: plan.workflow.repository,
    workflow: 'Managed deep-audit trusted execution',
    workflowPath: plan.workflow.path,
    workflowRef: managedCiWorkflowDefinitionRef(plan),
    eventName: plan.workflow.event,
    ref: plan.workflow.ref,
    refType: 'branch',
    runnerEnvironment: plan.workflow.runnerEnvironment,
  }, 'managed CI OIDC workflow identity')
  if (policy.token.issuer !== plan.observation.oidcIssuer || policy.token.audience !== plan.observation.oidcAudience
    || policy.token.temporal.maxAgeSeconds !== plan.observation.maxAgeSeconds
    || policy.token.temporal.clockSkewSeconds !== plan.observation.clockSkewSeconds) {
    fail('managed CI OIDC issuer/audience/temporal policy differs from the managed plan')
  }
  const claimPolicyDigest = managedCiSha256(managedCiStableStringify({
    workflowIdentity: policy.workflowIdentity,
    token: policy.token,
    brokerRequest: policy.brokerRequest,
  }))
  const receiptSigningPolicyDigest = managedCiSha256(managedCiStableStringify({
    token: policy.token,
    brokerRequest: policy.brokerRequest,
    receiptSigning: policy.receiptSigning,
  }))
  const brokerPolicyDigests = Object.fromEntries(Object.entries(policy.brokers).map(([id, broker]) => [id,
    managedCiSha256(managedCiStableStringify({ token: policy.token, brokerRequest: policy.brokerRequest, broker })),
  ]))
  return {
    policy,
    digest: managedCiSha256(policyRead.bytes),
    schemaDigest: managedCiSha256(schemaRead.bytes),
    claimPolicyDigest,
    receiptSigningPolicyDigest,
    brokerPolicyDigests,
  }
}

function digestCanonicalFiles(repoRoot, paths, label) {
  const files = paths.map(path => {
    const bytes = readFileSync(safeRegularFile(repoRoot, path, label))
    return { path, sha256: managedCiSha256(bytes), size: bytes.length }
  })
  return { files, digest: managedCiSha256(managedCiStableStringify(files)) }
}

function digestWorkflowGitFileSet(repoRoot, paths, label) {
  const files = paths.map(path => {
    const absolute = safeRegularFile(repoRoot, path, label)
    const bytes = readFileSync(absolute)
    const mode = (lstatSync(absolute).mode & 0o111) === 0 ? '100644' : '100755'
    return { mode, path, sha256: managedCiSha256(bytes), size: bytes.length }
  })
  return {
    files,
    digest: managedCiSha256(`${managedCiStableStringify(files)}\n`),
  }
}

const MANAGED_CI_DOCKERIGNORE = '**\n!.dockerignore\n!Containerfile\n!runtime/\n!runtime/managed-ci-runtime.mjs\n'
const MANAGED_CI_CONTEXT_RELATIVE_FILES = Object.freeze([
  '.dockerignore',
  'Containerfile',
  'runtime/managed-ci-runtime.mjs',
])

function scanManagedCiContext(contextRoot, relativeRoot = '') {
  const directory = resolve(contextRoot, relativeRoot)
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name
    const absolute = resolve(contextRoot, path)
    const stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) fail(`managed CI executor build context contains a symlink:${path}`)
    if (stat.isDirectory()) files.push(...scanManagedCiContext(contextRoot, path))
    else if (stat.isFile()) files.push(path)
    else fail(`managed CI executor build context contains a non-regular entry:${path}`)
  }
  return files.sort()
}

export function validateManagedCiExecutorBuildContext({
  builder,
  source,
  recipeSource,
  dockerignoreSource,
  contextFiles,
}) {
  if (!builder || !source || typeof recipeSource !== 'string' || typeof dockerignoreSource !== 'string'
    || !Array.isArray(contextFiles)) fail('managed CI executor build-context validation inputs are incomplete')
  exactValue(dockerignoreSource, MANAGED_CI_DOCKERIGNORE, 'managed CI executor .dockerignore bytes')
  const declared = source.buildContextFiles.map(path => relative(source.contextRoot, path).split(sep).join('/'))
  exactArray(declared, MANAGED_CI_CONTEXT_RELATIVE_FILES, 'managed CI executor declared build context')
  const included = contextFiles.filter(path => MANAGED_CI_CONTEXT_RELATIVE_FILES.includes(path)).sort()
  exactArray(included, [...MANAGED_CI_CONTEXT_RELATIVE_FILES].sort(), 'managed CI executor effective build context')

  const syntax = `# syntax=docker/dockerfile:${builder.dockerfileFrontend.version}@${builder.dockerfileFrontend.subjectDigest}`
  const from = `FROM ${builder.baseImage.subjectName}@${builder.baseImage.subjectDigest} AS runtime`
  const lines = recipeSource.split(/\r?\n/)
  exactValue(lines[0], syntax, 'managed CI executor immutable Dockerfile frontend')
  const fromLines = lines.filter(line => /^\s*FROM\s+/i.test(line))
  exactArray(fromLines, [from], 'managed CI executor immutable base image')
  if (lines.some(line => /^\s*ADD\s+/i.test(line))) fail('managed CI executor recipe may not use ADD')
  exactArray(
    lines.filter(line => /^\s*COPY\s+/i.test(line)),
    ['COPY --chmod=0555 runtime/managed-ci-runtime.mjs /opt/qijenchen/managed-ci/bin/managed-ci-runtime'],
    'managed CI executor recipe copy closure',
  )
  return true
}

export function validateManagedCiExecutorBuilderTrigger({
  builder,
  attestations,
  protectedRef,
  workflowSource,
}) {
  if (!builder?.trigger || !attestations || typeof workflowSource !== 'string' || !workflowSource.trim()) {
    fail('managed CI executor builder trigger inputs are incomplete')
  }
  const trigger = builder.trigger
  if (trigger.eventName !== 'repository_dispatch'
    || trigger.workflowSourceMode !== 'default-branch-head'
    || trigger.branchSelectable !== false) {
    fail('managed CI executor builder trigger is not protected-default repository dispatch')
  }
  if (typeof trigger.activityType !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(trigger.activityType)) {
    fail('managed CI executor builder repository-dispatch activity type is invalid')
  }
  exactValue(
    builder.workflowSourceSha256,
    MANAGED_CI_EXECUTOR_BUILDER_WORKFLOW_SHA256,
    'managed CI executor builder workflow source SHA-256 policy',
  )
  const separation = builder.privilegeSeparation
  exactValue(separation, {
    buildAndPushJob: 'build-and-push',
    sbomJob: 'generate-sbom',
    digestBindingJob: 'bind-image-set',
    attestationJob: 'attest-image',
    handoffMode: 'same-run-immutable-artifact-id-digest-and-content-sha256',
    combinedRegistryAndOidcAuthorityForbidden: true,
    registryAttestationPushForbidden: true,
  }, 'managed CI executor builder privilege separation')
  exactValue({
    buildType: builder.buildType,
    provenancePredicateType: attestations.provenance?.predicateType,
    sbomPredicateType: attestations.sbom?.predicateType,
    sbomFormat: attestations.sbom?.format,
    independentSbom: attestations.sbom?.independentPredicateRequired,
    buildContextArchiveMtimeRequired: attestations.provenance?.buildContextArchiveMtimeRequired,
    buildContextArchiveDigestRequired: attestations.provenance?.buildContextArchiveDigestRequired,
    prePushContextValidationRequired: attestations.provenance?.prePushContextValidationRequired,
    toolchainDigestRequired: attestations.provenance?.toolchainDigestRequired,
    baseImageDigestRequired: attestations.provenance?.baseImageDigestRequired,
    dockerfileFrontendDigestRequired: attestations.provenance?.dockerfileFrontendDigestRequired,
    buildxBinaryDigestRequired: attestations.provenance?.buildxBinaryDigestRequired,
    buildkitImageDigestRequired: attestations.provenance?.buildkitImageDigestRequired,
    syftArchiveDigestRequired: attestations.provenance?.syftArchiveDigestRequired,
    syftBinaryDigestRequired: attestations.provenance?.syftBinaryDigestRequired,
    sbomGeneratorArchiveDigestRequired: attestations.sbom?.generatorArchiveDigestRequired,
    sbomGeneratorBinaryDigestRequired: attestations.sbom?.generatorBinaryDigestRequired,
    sbomRegistryCredentialAuthority: attestations.sbom?.registryCredentialAuthority,
    sbomRegistryCredentialPermission: attestations.sbom?.registryCredentialPermission,
    signatureBundleFormat: attestations.signature?.bundleFormat,
    attestationIdRequired: attestations.signature?.attestationIdRequired,
    attestationUrlRequired: attestations.signature?.attestationUrlRequired,
    perPredicateBundleRequired: attestations.signature?.perPredicateBundleRequired,
    closedEvidenceSetRequired: attestations.signature?.closedEvidenceSetRequired,
    coveredPredicates: attestations.signature?.coveredPredicates,
    freshSourceAttesterReadbackRequired: attestations.verification?.freshSourceAttesterReadbackRequired,
    durableOfflineArchiveRequired: attestations.verification?.durableOfflineArchiveRequired,
    offlineArchiveReadbackRequired: attestations.verification?.offlineArchiveReadbackRequired,
  }, {
    buildType: 'https://actions.github.io/buildtypes/workflow/v1',
    provenancePredicateType: 'https://slsa.dev/provenance/v1',
    sbomPredicateType: 'https://cyclonedx.org/bom',
    sbomFormat: 'cyclonedx-json-1.6',
    independentSbom: true,
    buildContextArchiveMtimeRequired: true,
    buildContextArchiveDigestRequired: true,
    prePushContextValidationRequired: true,
    toolchainDigestRequired: true,
    baseImageDigestRequired: true,
    dockerfileFrontendDigestRequired: true,
    buildxBinaryDigestRequired: true,
    buildkitImageDigestRequired: true,
    syftArchiveDigestRequired: true,
    syftBinaryDigestRequired: true,
    sbomGeneratorArchiveDigestRequired: true,
    sbomGeneratorBinaryDigestRequired: true,
    sbomRegistryCredentialAuthority: 'ghcr.io',
    sbomRegistryCredentialPermission: 'packages-read-only',
    signatureBundleFormat: 'sigstore-bundle-v0.3',
    attestationIdRequired: true,
    attestationUrlRequired: true,
    perPredicateBundleRequired: true,
    closedEvidenceSetRequired: true,
    coveredPredicates: [
      'https://slsa.dev/provenance/v1',
      'https://cyclonedx.org/bom',
      'https://qijenchen.dev/attestations/managed-ci-image-handoff/v2',
    ],
    freshSourceAttesterReadbackRequired: true,
    durableOfflineArchiveRequired: true,
    offlineArchiveReadbackRequired: true,
  }, 'managed CI executor builder attestation projection')
  exactValue({
    baseImage: builder.baseImage,
    dockerfileFrontend: builder.dockerfileFrontend,
    buildx: builder.buildx,
    buildkit: builder.buildkit,
    syft: builder.syft,
    buildNetwork: builder.buildNetwork,
    runnerArchitecture: builder.runnerArchitecture,
  }, {
    baseImage: {
      subjectName: 'docker.io/library/node',
      version: '24.14.0-bookworm-slim',
      subjectDigest: 'sha256:4bd6219054c8bebcd26a66bfd8ca0bd6e1024b4b97474c59bb7ee3bbcbef4fe8',
    },
    dockerfileFrontend: {
      subjectName: 'docker.io/docker/dockerfile',
      version: '1.7',
      subjectDigest: 'sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e',
    },
    buildx: {
      version: 'v0.35.0',
      linuxAmd64Sha256: 'd41ece72044243b4f58b343441ae37446d9c29a7d6b5e11c61847bbcf8f7dfda',
    },
    buildkit: {
      version: 'v0.31.2',
      driver: 'docker-container',
      daemonFlags: '--debug=false',
      subjectName: 'docker.io/moby/buildkit',
      subjectDigest: 'sha256:2f5adac4ecd194d9f8c10b7b5d7bceb5186853db1b26e5abd3a657af0b7e26ec',
    },
    syft: {
      version: 'v1.42.3',
      linuxAmd64ArchiveUrl: 'https://github.com/anchore/syft/releases/download/v1.42.3/syft_1.42.3_linux_amd64.tar.gz',
      linuxAmd64ArchiveSha256: '0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509',
      linuxAmd64BinarySha256: '6c1eb5c6f15c177fa3dd727ee186c61a660a3939a4e1dc1bc4b3e00eafec098e',
    },
    buildNetwork: 'none',
    runnerArchitecture: 'x86_64',
  }, 'managed CI executor immutable build toolchain')
  exactValue(builder.workflowIdentity, {
    repository: 'ajenchen/design-system',
    path: '.github/workflows/build-managed-ci-executors.yml',
    ref: 'ajenchen/design-system/.github/workflows/build-managed-ci-executors.yml@refs/heads/main',
    workflowShaClaim: 'github.workflow_sha',
    sourceCommitClaim: 'github.sha',
    sourceTreeDerivation: 'git-rev-parse-source-commit-tree',
    separateWorkflowAndSourceFieldsRequired: true,
    sameProtectedRevisionRequired: true,
  }, 'managed CI executor observed workflow/source identity contract')
  exactValue(builder.runtimeByteReadback, {
    readbackMode: 'docker-pull-create-cp-without-start',
    imageExecutionForbidden: true,
    nodeVersion: '24.14.0',
    nodeInstallPath: '/usr/local/bin/node',
    nodeBinaryFormat: 'elf64-little-endian-x86-64',
    nodeBinarySha256Required: true,
    managedRuntimeSourcePath: 'infra/governance/managed-ci-executor/runtime/managed-ci-runtime.mjs',
    launcherInstallPaths: [
      '/opt/qijenchen/managed-ci/bin/managed-ci-runtime',
      '/opt/qijenchen/managed-ci/bin/run-class',
      '/opt/qijenchen/managed-ci/bin/validate-provenance',
    ],
    perLauncherByteSha256Required: true,
    launcherBytesMustEqualManagedRuntimeSource: true,
  }, 'managed CI executor final runtime byte-readback contract')
  exactValue(builder.aggregateHandoff, {
    imageSetSchemaVersion: 2,
    imageSetKind: 'managed-ci-image-set-v2',
    handoffPredicateType: 'https://qijenchen.dev/attestations/managed-ci-image-handoff/v2',
    executionClassCount: 4,
    inventoryEntryCount: 18,
    artifactFileCount: 19,
    retentionDays: 90,
    githubArtifactStorageClass: 'github-actions-artifact-non-worm',
    githubArtifactIsWorm: false,
    externalWormArchiveRequired: true,
  }, 'managed CI executor deterministic aggregate-handoff contract')

  let workflow
  try { workflow = loadYaml(workflowSource, { json: false }) } catch (error) {
    fail(`managed CI executor builder workflow cannot be parsed:${error.message}`)
  }
  exactObjectKeys(
    workflow,
    ['name', 'on', 'permissions', 'concurrency', 'jobs'],
    'managed CI executor builder workflow',
  )
  exactValue(workflow.name, 'Build managed CI executors', 'managed CI executor builder workflow name')
  exactValue(workflow?.on, {
    [trigger.eventName]: { types: [trigger.activityType] },
  }, 'managed CI executor builder trigger projection')
  exactValue(workflow?.permissions, {}, 'managed CI executor builder top-level permissions')
  exactValue(workflow?.concurrency, {
    group: 'build-managed-ci-executors-${{ github.sha }}',
    'cancel-in-progress': false,
  }, 'managed CI executor builder concurrency')
  exactArray(
    Object.keys(workflow?.jobs ?? {}),
    [separation.buildAndPushJob, separation.sbomJob, separation.digestBindingJob, separation.attestationJob],
    'managed CI executor builder job closure/order',
  )
  const build = workflow.jobs[separation.buildAndPushJob]
  const sbom = workflow.jobs[separation.sbomJob]
  const bind = workflow.jobs[separation.digestBindingJob]
  const attest = workflow.jobs[separation.attestationJob]
  exactObjectKeys(
    sbom,
    ['if', 'needs', 'runs-on', 'timeout-minutes', 'permissions', 'strategy', 'steps'],
    'managed CI SBOM generator job',
  )
  exactObjectKeys(
    build,
    ['if', 'runs-on', 'timeout-minutes', 'permissions', 'strategy', 'steps'],
    'managed CI image builder job',
  )
  exactObjectKeys(
    bind,
    ['if', 'needs', 'runs-on', 'timeout-minutes', 'permissions', 'outputs', 'steps'],
    'managed CI image binding job',
  )
  exactObjectKeys(
    attest,
    ['if', 'needs', 'runs-on', 'timeout-minutes', 'permissions', 'strategy', 'steps'],
    'managed CI image attestation job',
  )
  for (const [id, job] of Object.entries({
    [separation.buildAndPushJob]: build,
    [separation.sbomJob]: sbom,
    [separation.digestBindingJob]: bind,
    [separation.attestationJob]: attest,
  })) {
    if (job?.if !== `github.ref == '${protectedRef}'`) {
      fail(`managed CI executor builder job lacks the exact protected-default ref guard:${id}`)
    }
    if (job?.['runs-on'] !== 'ubuntu-24.04') fail(`managed CI executor builder job runner is not exact:${id}`)
  }
  exactValue(build.permissions, { contents: 'read', packages: 'write' }, 'managed CI image builder permissions')
  exactValue(sbom.permissions, { actions: 'read', packages: 'read' }, 'managed CI SBOM generator permissions')
  exactValue(bind.permissions, { actions: 'read' }, 'managed CI image binding permissions')
  exactValue(attest.permissions, {
    actions: 'read',
    contents: 'read',
    'id-token': 'write',
    attestations: 'write',
  }, 'managed CI image attestation permissions')
  exactValue(build['timeout-minutes'], 45, 'managed CI image builder timeout')
  exactValue(sbom['timeout-minutes'], 15, 'managed CI SBOM generator timeout')
  exactValue(bind['timeout-minutes'], 10, 'managed CI image binding timeout')
  exactValue(attest['timeout-minutes'], 15, 'managed CI image attestation timeout')
  if (sbom.needs !== separation.buildAndPushJob
    || bind.needs !== separation.sbomJob
    || attest.needs !== separation.digestBindingJob) {
    fail('managed CI executor builder privilege DAG differs from the exact digest-binding chain')
  }
  const exactMatrix = {
    'fail-fast': true,
    matrix: { 'execution-class': EXPECTED_CLASSES },
  }
  exactValue(build.strategy, exactMatrix, 'managed CI image builder class matrix')
  exactValue(sbom.strategy, exactMatrix, 'managed CI SBOM generator class matrix')
  exactValue(attest.strategy, exactMatrix, 'managed CI image attestation class matrix')
  exactValue(bind.outputs, {
    artifact_id: '${{ steps.retain.outputs.artifact-id }}',
    artifact_digest: '${{ steps.retain.outputs.artifact-digest }}',
    inventory_sha256: '${{ steps.bind.outputs.inventory_sha256 }}',
    manifest_sha256: '${{ steps.bind.outputs.manifest_sha256 }}',
  }, 'managed CI image binding outputs')

  for (const [id, job] of Object.entries(workflow.jobs)) {
    const permissions = job.permissions ?? {}
    const registryWrite = permissions.packages === 'write'
    const oidcAuthority = permissions['id-token'] === 'write' || permissions.attestations === 'write'
    if (registryWrite && oidcAuthority) fail(`managed CI executor job combines registry write and OIDC/attestation authority:${id}`)
  }

  const builderActions = Object.freeze({
    checkout: 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
    buildx: 'docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f',
    login: 'docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9',
    upload: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    download: 'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
    attest: 'actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6',
  })
  const validateStep = (step, expected, label) => {
    exactObjectKeys(step, expected.keys, label)
    for (const key of ['name', 'id', 'if', 'uses', 'with', 'env']) {
      if (Object.hasOwn(expected, key)) exactValue(step[key], expected[key], `${label} ${key}`)
    }
    if (expected.runMarkers) {
      if (typeof step.run !== 'string' || !step.run.trim()) fail(`${label} run program is empty`)
      for (const marker of expected.runMarkers) {
        if (!step.run.includes(marker)) fail(`${label} run program lacks canonical binding:${marker}`)
      }
    }
    if (expected.runSha256) {
      if (typeof step.run !== 'string' || !step.run.trim()) fail(`${label} run program is empty`)
      if (managedCiSha256(step.run) !== expected.runSha256) {
        fail(`${label} run program differs from the exact canonical SHA-256`)
      }
    }
  }

  if (!Array.isArray(build.steps) || build.steps.length !== 11) {
    fail('managed CI image builder step closure differs from the canonical eleven steps')
  }
  // GitHub does not expose the runner context to job-level `env`, so DOCKER_CONFIG is bound by the
  // first step through $GITHUB_ENV instead. The isolation guarantee therefore lives in this step.
  validateStep(build.steps[0], {
    keys: ['name', 'run'],
    name: 'Bind DOCKER_CONFIG to the runner-scoped temp directory',
    runMarkers: [
      'test -d "$RUNNER_TEMP"',
      'DOCKER_CONFIG=%s/managed-ci-docker-config',
      '>> "$GITHUB_ENV"',
    ],
  }, 'managed CI image builder isolated Docker configuration step')
  const builderSteps = build.steps.slice(1)
  validateStep(builderSteps[0], {
    keys: ['name', 'uses', 'with'],
    name: 'Checkout exact protected-main builder source',
    uses: builderActions.checkout,
    with: {
      ref: '${{ github.sha }}',
      'persist-credentials': false,
      'fetch-depth': 1,
      'fetch-tags': false,
      lfs: false,
      submodules: false,
      clean: true,
    },
  }, 'managed CI image builder checkout step')
  validateStep(builderSteps[1], {
    keys: ['name', 'env', 'run'],
    name: 'Fail closed unless the observed workflow and source identities are exact',
    env: {
      SOURCE_COMMIT: '${{ github.sha }}',
      WORKFLOW_REF: '${{ github.workflow_ref }}',
      WORKFLOW_REPOSITORY: '${{ github.repository }}',
      WORKFLOW_SHA: '${{ github.workflow_sha }}',
    },
    runMarkers: [
      'test "$WORKFLOW_SHA" = "$SOURCE_COMMIT"',
      'git cat-file -t "$WORKFLOW_SHA:.github/workflows/build-managed-ci-executors.yml"',
    ],
    runSha256: builder.closedBuilderRunSha256.workflowAndSourceIdentityPreflight,
  }, 'managed CI image builder workflow/source identity preflight step')
  validateStep(builderSteps[2], {
    keys: ['name', 'run'],
    name: 'Materialize the exact Buildx binary before any execution',
    runMarkers: [
      'env -i',
      'https://github.com/docker/buildx/releases/download/v0.35.0/buildx-v0.35.0.linux-amd64',
      builder.buildx.linuxAmd64Sha256,
      'install -m 0555',
    ],
    runSha256: builder.closedBuilderRunSha256.materializeBuildx,
  }, 'managed CI image builder Buildx materialization step')
  validateStep(builderSteps[3], {
    keys: ['name', 'id', 'uses', 'with'],
    name: 'Set up exact BuildKit from the preverified Buildx plugin',
    id: 'buildx',
    uses: builderActions.buildx,
    with: {
      driver: builder.buildkit.driver,
      'driver-opts': `image=moby/buildkit:${builder.buildkit.version}@${builder.buildkit.subjectDigest}`,
      'buildkitd-flags': builder.buildkit.daemonFlags,
      install: false,
      use: true,
      'keep-state': false,
      'cache-binary': false,
      cleanup: true,
    },
  }, 'managed CI image builder BuildKit step')
  validateStep(builderSteps[4], {
    keys: ['name', 'env', 'run'],
    name: 'Verify the exact Buildx binary and BuildKit daemon',
    env: {
      BUILDX_DRIVER: '${{ steps.buildx.outputs.driver }}',
      BUILDX_NODES: '${{ steps.buildx.outputs.nodes }}',
      BUILDKITD_FLAGS: '${{ steps.buildx.outputs.flags }}',
    },
    runMarkers: [
      builder.buildx.linuxAmd64Sha256,
      `github.com/docker/buildx ${builder.buildx.version}`,
      builder.buildkit.version,
      builder.buildkit.daemonFlags,
      'docker-container',
    ],
    runSha256: builder.closedBuilderRunSha256.verifyToolchain,
  }, 'managed CI image builder toolchain verification step')
  validateStep(builderSteps[5], {
    keys: ['name', 'uses', 'with'],
    name: 'Authenticate only to GHCR',
    uses: builderActions.login,
    with: {
      registry: 'ghcr.io',
      username: '${{ github.actor }}',
      password: '${{ secrets.GITHUB_TOKEN }}',
    },
  }, 'managed CI image builder registry login step')
  validateStep(builderSteps[6], {
    keys: ['name', 'id', 'env', 'run'],
    name: 'Build and push without OIDC or attestation authority',
    id: 'build',
    env: {
      BUILDX_BUILDER: '${{ steps.buildx.outputs.name }}',
      EXECUTION_CLASS: '${{ matrix.execution-class }}',
      SOURCE_COMMIT: '${{ github.sha }}',
      WORKFLOW_RUN_ID: '${{ github.run_id }}',
      WORKFLOW_RUN_ATTEMPT: '${{ github.run_attempt }}',
    },
    runMarkers: [
      '/usr/bin/git -c tar.umask=0022 archive --format=tar --mtime="@$SOURCE_COMMIT_TIME"',
      '> "$CONTEXT_ARCHIVE"',
      '/usr/bin/python3 - "$CONTEXT_ARCHIVE"',
      '("runtime/managed-ci-runtime.mjs", "file", 0o644, 0, 0)',
      'chmod 0400 "$CONTEXT_ARCHIVE"',
      '/usr/bin/docker buildx build',
      '--builder "$BUILDX_BUILDER"',
      '--network none',
      '--provenance=false',
      '--sbom=false',
      'verify_archived_blob',
      'context-archive-mtime-epoch',
      'context-archive-sha256',
      'CONTEXT_ARCHIVE_IDENTITY',
      'CONTEXT_ARCHIVE_FD',
      '."containerimage.digest"',
    ],
    runSha256: builder.closedBuilderRunSha256.buildFromExactGitArchive,
  }, 'managed CI image builder build/push step')
  const buildProgram = builderSteps[6].run
  const archiveMaterializeAt = buildProgram.indexOf(
    '/usr/bin/git -c tar.umask=0022 archive --format=tar --mtime="@$SOURCE_COMMIT_TIME"',
  )
  const archiveMemberClosureAt = buildProgram.indexOf('test "$(tar -tf "$CONTEXT_ARCHIVE")"')
  const archiveModeClosureAt = buildProgram.indexOf('/usr/bin/python3 - "$CONTEXT_ARCHIVE"')
  const archiveBlobClosureAt = buildProgram.indexOf('verify_archived_blob runtime/managed-ci-runtime.mjs')
  const archiveDigestAt = buildProgram.indexOf('CONTEXT_ARCHIVE_SHA256="$(sha256sum "$CONTEXT_ARCHIVE"')
  const archiveReadOnlyAt = buildProgram.indexOf('chmod 0400 "$CONTEXT_ARCHIVE"')
  const registryPushAt = buildProgram.indexOf('/usr/bin/docker buildx build')
  const imageDigestAt = buildProgram.indexOf('IMAGE_DIGEST="$(jq -er')
  const outputAt = buildProgram.indexOf('printf \'digest=%s\\n\' "$IMAGE_DIGEST" >> "$GITHUB_OUTPUT"')
  if (!(archiveMaterializeAt >= 0
    && archiveMaterializeAt < archiveMemberClosureAt
    && archiveMemberClosureAt < archiveModeClosureAt
    && archiveModeClosureAt < archiveBlobClosureAt
    && archiveBlobClosureAt < archiveDigestAt
    && archiveDigestAt < archiveReadOnlyAt
    && archiveReadOnlyAt < registryPushAt
    && registryPushAt < imageDigestAt
    && imageDigestAt < outputAt)
    || (buildProgram.match(/\/usr\/bin\/docker buildx build/g) ?? []).length !== 1
    || buildProgram.includes('| /usr/bin/docker buildx build')
    || !buildProgram.slice(archiveMaterializeAt, archiveMemberClosureAt).includes('> "$CONTEXT_ARCHIVE"')
    || !buildProgram.slice(registryPushAt, imageDigestAt).includes('- 0<&"$CONTEXT_ARCHIVE_FD"')) {
    fail('managed CI image builder can mutate the registry before exact context archive member, mode, blob, and digest validation')
  }
  validateStep(builderSteps[7], {
    keys: ['name', 'if', 'run'],
    name: 'Revoke GHCR write credentials before any binding or artifact step',
    if: 'always()',
    runMarkers: [
      '/usr/bin/docker logout ghcr.io',
      'keys == ["auths"] and .auths == {}',
    ],
    runSha256: builder.closedBuilderRunSha256.revokeRegistryCredential,
  }, 'managed CI image builder registry credential revocation step')
  validateStep(builderSteps[8], {
    keys: ['name', 'env', 'run'],
    name: 'Validate and freeze the exact pushed subject before read-only scanning',
    env: {
      EXECUTION_CLASS: '${{ matrix.execution-class }}',
      CONTEXT_ARCHIVE_MTIME_EPOCH: '${{ steps.build.outputs.context-archive-mtime-epoch }}',
      CONTEXT_ARCHIVE_SHA256: '${{ steps.build.outputs.context-archive-sha256 }}',
      IMAGE_DIGEST: '${{ steps.build.outputs.digest }}',
      SOURCE_COMMIT: '${{ github.sha }}',
      WORKFLOW_REF: '${{ github.workflow_ref }}',
      WORKFLOW_REPOSITORY: '${{ github.repository }}',
      WORKFLOW_SHA: '${{ github.workflow_sha }}',
      WORKFLOW_RUN_ID: '${{ github.run_id }}',
      WORKFLOW_RUN_ATTEMPT: '${{ github.run_attempt }}',
    },
    runMarkers: [
      'managed-ci-image-binding',
      'https://actions.github.io/buildtypes/workflow/v1',
      'infra/governance/managed-ci-executor/Containerfile',
      'infra/governance/providers/managed-ci-executor-supply-chain.json',
      'CONTEXT_DIGEST',
      'CONTEXT_ARCHIVE_MTIME_EPOCH',
      'CONTEXT_ARCHIVE_SHA256',
      'CONTEXT_ARCHIVE_SOURCE',
      'MATERIALS_DIGEST',
      'TOOLCHAIN_DIGEST',
      builder.baseImage.subjectDigest,
      builder.dockerfileFrontend.subjectDigest,
      builder.buildx.linuxAmd64Sha256,
      builder.buildkit.subjectDigest,
      builder.buildkit.daemonFlags,
      builder.syft.linuxAmd64ArchiveSha256,
      builder.syft.linuxAmd64BinarySha256,
    ],
    runSha256: builder.closedBuilderRunSha256.freezePreScanBinding,
  }, 'managed CI image builder subject-binding step')
  validateStep(builderSteps[9], {
    keys: ['name', 'uses', 'with'],
    name: 'Retain the pre-scan image binding as a non-WORM GitHub handoff',
    uses: builderActions.upload,
    with: {
      name: 'managed-ci-image-build-${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.execution-class }}',
      path: '${{ runner.temp }}/managed-ci-image-binding/${{ matrix.execution-class }}.json\n${{ runner.temp }}/managed-ci-image-binding/${{ matrix.execution-class }}.tar\n',
      'if-no-files-found': 'error',
      'retention-days': 90,
      'compression-level': 0,
      overwrite: false,
      'include-hidden-files': false,
    },
  }, 'managed CI image builder binding upload step')

  if (!Array.isArray(sbom.steps) || sbom.steps.length !== 8) {
    fail('managed CI SBOM generator step closure differs from the canonical eight steps')
  }
  validateStep(sbom.steps[0], {
    keys: ['name', 'env', 'run'],
    name: 'Fail closed unless the observed workflow identity is exact',
    env: {
      SOURCE_COMMIT: '${{ github.sha }}',
      WORKFLOW_REF: '${{ github.workflow_ref }}',
      WORKFLOW_REPOSITORY: '${{ github.repository }}',
      WORKFLOW_SHA: '${{ github.workflow_sha }}',
    },
    runMarkers: ['test "$WORKFLOW_SHA" = "$SOURCE_COMMIT"'],
    runSha256: builder.closedSbomRunSha256.workflowIdentityPreflight,
  }, 'managed CI SBOM workflow identity preflight step')
  validateStep(sbom.steps[1], {
    keys: ['name', 'uses', 'with'],
    name: 'Download the exact pre-scan image binding',
    uses: builderActions.download,
    with: {
      name: 'managed-ci-image-build-${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.execution-class }}',
      path: '${{ runner.temp }}/managed-ci-image-build',
      'digest-mismatch': 'error',
    },
  }, 'managed CI SBOM pre-scan binding download step')
  validateStep(sbom.steps[2], {
    keys: ['name', 'run'],
    name: 'Materialize exact Syft bytes without any registry credential',
    runMarkers: [
      'env -i',
      builder.syft.linuxAmd64ArchiveUrl,
      builder.syft.linuxAmd64ArchiveSha256,
      builder.syft.linuxAmd64BinarySha256,
      'install -m 0555',
      'uname -m',
    ],
    runSha256: builder.closedSbomRunSha256.materializeSyft,
  }, 'managed CI SBOM Syft materialization step')
  validateStep(sbom.steps[3], {
    keys: ['name', 'env', 'run'],
    name: 'Validate the exact binding and prepare the verified Syft invocation',
    env: {
      EXECUTION_CLASS: '${{ matrix.execution-class }}',
      SOURCE_COMMIT: '${{ github.sha }}',
      WORKFLOW_REF: '${{ github.workflow_ref }}',
      WORKFLOW_REPOSITORY: '${{ github.repository }}',
      WORKFLOW_SHA: '${{ github.workflow_sha }}',
      WORKFLOW_RUN_ID: '${{ github.run_id }}',
      WORKFLOW_RUN_ATTEMPT: '${{ github.run_attempt }}',
    },
    runMarkers: [
      'managed-ci-image-build',
      builder.syft.linuxAmd64ArchiveSha256,
      builder.syft.linuxAmd64BinarySha256,
      'archiveMtimeEpoch',
      'archiveSha256',
      'managed-ci-syft-image-ref',
      'chmod 0400',
    ],
    runSha256: builder.closedSbomRunSha256.prepareInvocation,
  }, 'managed CI SBOM invocation preparation step')
  validateStep(sbom.steps[4], {
    keys: ['name', 'env', 'run'],
    name: 'Execute only verified Syft with read-only registry authority',
    env: {
      GHCR_READ_USERNAME: '${{ github.actor }}',
      GHCR_READ_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
    },
    runMarkers: [
      'exec /usr/bin/env -i',
      'SYFT_REGISTRY_AUTH_AUTHORITY',
      'SYFT_REGISTRY_AUTH_USERNAME',
      'SYFT_REGISTRY_AUTH_PASSWORD',
      'managed-ci-tools/syft',
      'cyclonedx-json=',
    ],
    runSha256: builder.closedSbomRunSha256.executeSyft,
  }, 'managed CI SBOM credential-scoped Syft step')
  validateStep(sbom.steps[5], {
    keys: ['name', 'env', 'run'],
    name: 'Extract and hash the final runtime bytes without executing the image',
    env: {
      EXECUTION_CLASS: '${{ matrix.execution-class }}',
      GHCR_READ_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
      GHCR_READ_USERNAME: '${{ github.actor }}',
    },
    runMarkers: [
      '/usr/bin/docker create',
      'created false 0',
      '/usr/local/bin/node',
      'node runtime is not a little-endian ELF64 binary',
      'managed-ci-image-runtime-files-v1',
      'cmp -s "$BYTE_ROOT/managed-ci-runtime" "$BYTE_ROOT/run-class"',
      'runtimeSourceSha256',
    ],
    runSha256: builder.closedSbomRunSha256.runtimeByteReadback,
  }, 'managed CI SBOM final runtime byte-readback step')
  validateStep(sbom.steps[6], {
    keys: ['name', 'env', 'run'],
    name: 'Validate and close the exact independent CycloneDX SBOM',
    env: {
      EXECUTION_CLASS: '${{ matrix.execution-class }}',
    },
    runMarkers: [
      'CycloneDX',
      'SBOM_DIGEST',
      'cyclonedx-json-1.6',
      'managed-ci-image-binding',
      'CONTEXT_ARCHIVE_SOURCE',
      'RUNTIME_FILES_DIGEST',
      'managedRuntimeSourceSha256',
      'node.version == "24.14.0"',
      '--arg imageSubject "$IMAGE_SUBJECT"',
      '.metadata.component.name == $imageSubject',
    ],
    runSha256: builder.closedSbomRunSha256.closeBinding,
  }, 'managed CI SBOM closure step')
  validateStep(sbom.steps[7], {
    keys: ['name', 'uses', 'with'],
    name: 'Retain the scanned image binding as a non-WORM GitHub handoff',
    uses: builderActions.upload,
    with: {
      name: 'managed-ci-image-binding-${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.execution-class }}',
      path: '${{ runner.temp }}/managed-ci-image-binding/${{ matrix.execution-class }}.json\n${{ runner.temp }}/managed-ci-image-binding/${{ matrix.execution-class }}.cdx.json\n${{ runner.temp }}/managed-ci-image-binding/${{ matrix.execution-class }}.context.tar\n${{ runner.temp }}/managed-ci-image-binding/${{ matrix.execution-class }}.runtime-files.json\n',
      'if-no-files-found': 'error',
      'retention-days': 90,
      'compression-level': 0,
      overwrite: false,
      'include-hidden-files': false,
    },
  }, 'managed CI SBOM binding upload step')

  if (!Array.isArray(bind.steps) || bind.steps.length !== 7) {
    fail('managed CI image binding step closure differs from the canonical seven steps')
  }
  validateStep(bind.steps[0], {
    keys: ['name', 'env', 'run'],
    name: 'Fail closed unless the observed workflow identity is exact',
    env: {
      SOURCE_COMMIT: '${{ github.sha }}',
      WORKFLOW_REF: '${{ github.workflow_ref }}',
      WORKFLOW_REPOSITORY: '${{ github.repository }}',
      WORKFLOW_SHA: '${{ github.workflow_sha }}',
    },
    runMarkers: ['test "$WORKFLOW_SHA" = "$SOURCE_COMMIT"'],
    runSha256: builder.closedBindingRunSha256.workflowIdentityPreflight,
  }, 'managed CI image binding workflow identity preflight step')
  EXPECTED_CLASSES.forEach((executionClass, index) => validateStep(bind.steps[index + 1], {
    keys: ['name', 'uses', 'with'],
    name: `Download ${executionClass} binding by exact immutable name`,
    uses: builderActions.download,
    with: {
      name: `managed-ci-image-binding-\${{ github.run_id }}-\${{ github.run_attempt }}-${executionClass}`,
      path: `\${{ runner.temp }}/managed-ci-image-bindings/${executionClass}`,
      'digest-mismatch': 'error',
    },
  }, `managed CI image binding download step:${executionClass}`))
  validateStep(bind.steps[5], {
    keys: ['name', 'id', 'env', 'run'],
    name: 'Close and content-address the four-image handoff',
    id: 'bind',
    env: {
      SOURCE_COMMIT: '${{ github.sha }}',
      WORKFLOW_REF: '${{ github.workflow_ref }}',
      WORKFLOW_REPOSITORY: '${{ github.repository }}',
      WORKFLOW_SHA: '${{ github.workflow_sha }}',
      WORKFLOW_RUN_ID: '${{ github.run_id }}',
      WORKFLOW_RUN_ATTEMPT: '${{ github.run_attempt }}',
    },
    runMarkers: [
      'managed-ci-image-set-v2',
      'managed-ci-image-set-inventory-v1',
      'CycloneDX',
      'manifest_sha256=',
      'inventory_sha256=',
      '.entries | length == 18',
      'classCount: 4',
      'source tree mismatch',
      'bindings/$EXECUTION_CLASS.json',
      'contexts/$EXECUTION_CLASS.tar',
      'runtime-files/$EXECUTION_CLASS.json',
      'sboms/$EXECUTION_CLASS.cdx.json',
      'cmp -s',
    ],
    runSha256: builder.closedBindingRunSha256.closeImageSet,
  }, 'managed CI image binding closure step')
  validateStep(bind.steps[6], {
    keys: ['name', 'id', 'uses', 'with'],
    name: 'Retain one content-addressed image-set as a non-WORM GitHub handoff',
    id: 'retain',
    uses: builderActions.upload,
    with: {
      name: 'managed-ci-image-set-${{ github.run_id }}-${{ github.run_attempt }}',
      path: '${{ runner.temp }}/managed-ci-image-set/',
      'if-no-files-found': 'error',
      'retention-days': 90,
      'compression-level': 0,
      overwrite: false,
      'include-hidden-files': false,
    },
  }, 'managed CI image-set upload step')

  if (!Array.isArray(attest.steps) || attest.steps.length !== 11) {
    fail('managed CI image attestation step closure differs from the canonical eleven steps')
  }
  validateStep(attest.steps[0], {
    keys: ['name', 'uses', 'with'],
    name: 'Checkout exact protected-main source for independent attester readback',
    uses: builderActions.checkout,
    with: {
      ref: '${{ github.sha }}',
      'persist-credentials': false,
      'fetch-depth': 1,
      'fetch-tags': false,
      lfs: false,
      submodules: false,
      clean: true,
    },
  }, 'managed CI image attestation checkout step')
  validateStep(attest.steps[1], {
    keys: ['name', 'env', 'run'],
    name: 'Fail closed unless the observed workflow and source identities are exact',
    env: {
      SOURCE_COMMIT: '${{ github.sha }}',
      WORKFLOW_REF: '${{ github.workflow_ref }}',
      WORKFLOW_REPOSITORY: '${{ github.repository }}',
      WORKFLOW_SHA: '${{ github.workflow_sha }}',
    },
    runMarkers: [
      'test "$WORKFLOW_SHA" = "$SOURCE_COMMIT"',
      'git cat-file -t "$WORKFLOW_SHA:.github/workflows/build-managed-ci-executors.yml"',
    ],
    runSha256: builder.closedAttestationRunSha256.workflowAndSourceIdentityPreflight,
  }, 'managed CI image attestation workflow/source identity preflight step')
  validateStep(attest.steps[2], {
    keys: ['name', 'uses', 'with'],
    name: 'Download the exact immutable image-set artifact ID',
    uses: builderActions.download,
    with: {
      'artifact-ids': '${{ needs.bind-image-set.outputs.artifact_id }}',
      path: '${{ runner.temp }}/managed-ci-image-set',
      'digest-mismatch': 'error',
    },
  }, 'managed CI image attestation artifact download step')
  validateStep(attest.steps[3], {
    keys: ['name', 'id', 'env', 'run'],
    name: 'Rebind artifact ID, archive digest, manifest bytes, and image digest',
    id: 'image',
    env: {
      EXECUTION_CLASS: '${{ matrix.execution-class }}',
      EXPECTED_ARTIFACT_ID: '${{ needs.bind-image-set.outputs.artifact_id }}',
      EXPECTED_ARTIFACT_DIGEST: '${{ needs.bind-image-set.outputs.artifact_digest }}',
      EXPECTED_INVENTORY_SHA256: '${{ needs.bind-image-set.outputs.inventory_sha256 }}',
      EXPECTED_MANIFEST_SHA256: '${{ needs.bind-image-set.outputs.manifest_sha256 }}',
      SOURCE_COMMIT: '${{ github.sha }}',
      WORKFLOW_REF: '${{ github.workflow_ref }}',
      WORKFLOW_REPOSITORY: '${{ github.repository }}',
      WORKFLOW_SHA: '${{ github.workflow_sha }}',
      WORKFLOW_RUN_ID: '${{ github.run_id }}',
      WORKFLOW_RUN_ATTEMPT: '${{ github.run_attempt }}',
    },
    runMarkers: [
      'managed-ci-image-set-v2',
      'managed-ci-image-set-inventory-v1',
      'managed-ci-image-handoff-v2',
      'https://cyclonedx.org/bom',
      'https://actions.github.io/buildtypes/workflow/v1',
      'EXPECTED_ARTIFACT_DIGEST',
      'EXPECTED_INVENTORY_SHA256',
      'EXPECTED_MANIFEST_SHA256',
      'runtimeFilesSha256',
      'managedRuntimeSourceSha256',
      'ORIGINAL_CONTEXT_ARCHIVE',
      'cmp -s "$ORIGINAL_CONTEXT_ARCHIVE" "$FRESH_CONTEXT_ARCHIVE"',
      '/usr/bin/git -c tar.umask=0022 archive --format=tar --mtime="@$SOURCE_COMMIT_TIME"',
      'sourceTree',
      'buildContextArchiveMtimeEpoch',
      'materialsDigest',
      'toolchainDigest',
      'dockerfileFrontendDigest',
      'buildxBinarySha256',
      'buildkitImageDigest',
      '--arg imageSubject "$IMAGE_SUBJECT"',
      '.metadata.component.name == $imageSubject',
      'projectionCanonical="$(jq -cS',
      'printf \'%s\\n\' "$projectionCanonical" > "$projectionFile"',
    ],
    runSha256: builder.closedAttestationRunSha256.rebindImage,
  }, 'managed CI image attestation rebinding step')
  const subjectInputs = {
    'subject-name': '${{ steps.image.outputs.subject }}',
    'subject-digest': '${{ steps.image.outputs.digest }}',
  }
  validateStep(attest.steps[4], {
    keys: ['name', 'id', 'uses', 'with'],
    name: 'Attest SLSA provenance without registry mutation authority',
    id: 'provenance',
    uses: builderActions.attest,
    with: {
      ...subjectInputs,
      'predicate-type': attestations.provenance.predicateType,
      'predicate-path': '${{ steps.image.outputs.provenance }}',
      'push-to-registry': false,
      'create-storage-record': false,
    },
  }, 'managed CI SLSA provenance attestation step')
  validateStep(attest.steps[5], {
    keys: ['name', 'env', 'run'],
    name: 'Freeze provenance bundle before the next attestation',
    env: {
      BUNDLE_PATH: '${{ steps.provenance.outputs.bundle-path }}',
      EXECUTION_CLASS: '${{ matrix.execution-class }}',
    },
    runMarkers: ['managed-ci-provenance-$EXECUTION_CLASS.sigstore.json'],
    runSha256: builder.closedAttestationRunSha256.freezeProvenance,
  }, 'managed CI SLSA bundle freeze step')
  validateStep(attest.steps[6], {
    keys: ['name', 'id', 'uses', 'with'],
    name: 'Attest the independent CycloneDX SBOM without registry mutation authority',
    id: 'sbom',
    uses: builderActions.attest,
    with: {
      ...subjectInputs,
      'sbom-path': '${{ steps.image.outputs.sbom }}',
      'push-to-registry': false,
      'create-storage-record': false,
    },
  }, 'managed CI CycloneDX attestation step')
  validateStep(attest.steps[7], {
    keys: ['name', 'env', 'run'],
    name: 'Freeze SBOM bundle before the next attestation',
    env: {
      BUNDLE_PATH: '${{ steps.sbom.outputs.bundle-path }}',
      EXECUTION_CLASS: '${{ matrix.execution-class }}',
    },
    runMarkers: ['managed-ci-sbom-$EXECUTION_CLASS.sigstore.json'],
    runSha256: builder.closedAttestationRunSha256.freezeSbom,
  }, 'managed CI SBOM bundle freeze step')
  validateStep(attest.steps[8], {
    keys: ['name', 'id', 'uses', 'with'],
    name: 'Attest the exact immutable handoff without registry mutation authority',
    id: 'handoff',
    uses: builderActions.attest,
    with: {
      ...subjectInputs,
      'predicate-type': 'https://qijenchen.dev/attestations/managed-ci-image-handoff/v2',
      'predicate-path': '${{ steps.image.outputs.predicate }}',
      'push-to-registry': false,
      'create-storage-record': false,
    },
  }, 'managed CI immutable handoff attestation step')
  validateStep(attest.steps[9], {
    keys: ['name', 'env', 'run'],
    name: 'Close exact offline attestation evidence set',
    env: {
      ARTIFACT_DIGEST: '${{ steps.image.outputs.artifact_digest }}',
      ARTIFACT_ID: '${{ steps.image.outputs.artifact_id }}',
      EXECUTION_CLASS: '${{ matrix.execution-class }}',
      HANDOFF_ATTESTATION_ID: '${{ steps.handoff.outputs.attestation-id }}',
      HANDOFF_ATTESTATION_URL: '${{ steps.handoff.outputs.attestation-url }}',
      HANDOFF_BUNDLE_PATH: '${{ steps.handoff.outputs.bundle-path }}',
      IMAGE_DIGEST: '${{ steps.image.outputs.digest }}',
      IMAGE_SUBJECT: '${{ steps.image.outputs.subject }}',
      INVENTORY_SHA256: '${{ steps.image.outputs.inventory_sha256 }}',
      MANIFEST_SHA256: '${{ steps.image.outputs.manifest_sha256 }}',
      PROVENANCE_ATTESTATION_ID: '${{ steps.provenance.outputs.attestation-id }}',
      PROVENANCE_ATTESTATION_URL: '${{ steps.provenance.outputs.attestation-url }}',
      SBOM_ATTESTATION_ID: '${{ steps.sbom.outputs.attestation-id }}',
      SBOM_ATTESTATION_URL: '${{ steps.sbom.outputs.attestation-url }}',
      SBOM_DIGEST: '${{ steps.image.outputs.sbom_digest }}',
      SOURCE_COMMIT: '${{ github.sha }}',
      SOURCE_TREE: '${{ steps.image.outputs.source_tree }}',
      WORKFLOW_REF: '${{ github.workflow_ref }}',
      WORKFLOW_REPOSITORY: '${{ github.repository }}',
      WORKFLOW_SHA: '${{ github.workflow_sha }}',
      WORKFLOW_RUN_ATTEMPT: '${{ github.run_attempt }}',
      WORKFLOW_RUN_ID: '${{ github.run_id }}',
    },
    runMarkers: [
      'managed-ci-handoff-$EXECUTION_CLASS.sigstore.json',
      'managed-ci-provenance-$EXECUTION_CLASS.sigstore.json',
      'managed-ci-sbom-$EXECUTION_CLASS.sigstore.json',
      'managed-ci-image-handoff-$EXECUTION_CLASS.json',
      '$EXECUTION_CLASS.cdx.json',
      'managed-ci-evidence-set-$EXECUTION_CLASS.json',
      'managed-ci-image-evidence-set-v2',
      'attestationUrl',
    ],
    runSha256: builder.closedAttestationRunSha256.closeEvidenceSet,
  }, 'managed CI closed offline evidence-set step')
  validateStep(attest.steps[10], {
    keys: ['name', 'uses', 'with'],
    name: 'Upload the exact offline evidence as a non-WORM GitHub handoff',
    uses: builderActions.upload,
    with: {
      name: 'managed-ci-image-attestations-${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.execution-class }}',
      path: '${{ runner.temp }}/managed-ci-provenance-${{ matrix.execution-class }}.sigstore.json\n${{ runner.temp }}/managed-ci-sbom-${{ matrix.execution-class }}.sigstore.json\n${{ runner.temp }}/managed-ci-handoff-${{ matrix.execution-class }}.sigstore.json\n${{ runner.temp }}/managed-ci-provenance-${{ matrix.execution-class }}.json\n${{ runner.temp }}/managed-ci-image-handoff-${{ matrix.execution-class }}.json\n${{ runner.temp }}/managed-ci-image-set/bindings/${{ matrix.execution-class }}.json\n${{ runner.temp }}/managed-ci-image-set/contexts/${{ matrix.execution-class }}.tar\n${{ runner.temp }}/managed-ci-image-set/inventory.json\n${{ runner.temp }}/managed-ci-image-set/manifest.json\n${{ runner.temp }}/managed-ci-image-set/manifest.preimage.json\n${{ runner.temp }}/managed-ci-image-set/runtime-files/${{ matrix.execution-class }}.json\n${{ runner.temp }}/managed-ci-image-set/sboms/${{ matrix.execution-class }}.cdx.json\n${{ runner.temp }}/managed-ci-evidence-set-${{ matrix.execution-class }}.json\n',
      'if-no-files-found': 'error',
      'retention-days': 90,
      'compression-level': 0,
      overwrite: false,
      'include-hidden-files': false,
    },
  }, 'managed CI offline evidence upload step')

  const serializedBuild = JSON.stringify(build)
  const serializedBind = JSON.stringify(bind)
  const serializedAttest = JSON.stringify(attest)
  if (serializedBuild.includes('"id-token":"write"')
    || serializedBuild.includes('"attestations":"write"')
    || /\bsecrets\./.test(serializedBind)
    || /\bsecrets\./.test(serializedAttest)
    || /docker\/(?:login|build-push)-action@/.test(serializedAttest)
    || /"(?:container|services)":/.test(serializedAttest)) {
    fail('managed CI builder privilege jobs expose authority outside the closed registry-writer and OIDC-only boundaries')
  }
  if (managedCiSha256(workflowSource) !== builder.workflowSourceSha256) {
    fail('managed CI executor builder workflow bytes differ from the exact canonical SHA-256')
  }
  return true
}

function loadExecutorSupplyChainPolicy(repoRoot, plan) {
  const policyRead = readJsonFile(repoRoot, plan.executorSupplyChainPolicy.path, 'managed CI executor supply-chain policy')
  const schemaRead = readJsonFile(repoRoot, plan.executorSupplyChainPolicy.schemaPath, 'managed CI executor supply-chain policy schema')
  validateJson(policyRead.value, schemaRead.value, 'managed CI executor supply-chain policy')
  const policy = policyRead.value
  if (policy.source.repository !== plan.workflow.repository || policy.source.protectedRef !== plan.workflow.ref
    || policy.hostSandbox.runnerEnvironment !== plan.workflow.runnerEnvironment) {
    fail('managed CI executor source/host identity differs from the managed workflow plan')
  }
  if (plan.activation.builderWorkflowSha !== null
    && plan.activation.executorSourceCommit !== null
    && policy.builder.workflowIdentity.sameProtectedRevisionRequired
    && plan.activation.builderWorkflowSha !== plan.activation.executorSourceCommit) {
    fail('managed CI observed github.workflow_sha and github.sha do not identify the same protected revision')
  }
  const builderWorkflowSource = readFileSync(safeRegularFile(
    repoRoot,
    policy.builder.workflowPath,
    'managed CI executor builder workflow',
  ), 'utf8')
  validateManagedCiExecutorBuilderTrigger({
    builder: policy.builder,
    attestations: policy.attestations,
    protectedRef: policy.source.protectedRef,
    workflowSource: builderWorkflowSource,
  })
  exactValue(policy.hostSandbox.runnerLabels, plan.workflow.runnerLabels, 'managed CI externally managed runner labels')
  const context = digestWorkflowGitFileSet(
    repoRoot,
    policy.source.buildContextFiles,
    'managed CI executor build context',
  )
  const materials = digestWorkflowGitFileSet(
    repoRoot,
    policy.source.imageMaterialsFiles,
    'managed CI executor image materials',
  )
  const controlPlane = digestCanonicalFiles(repoRoot, policy.source.controlPlaneFiles, 'managed CI executor class-adapter control plane')
  const recipeBytes = readFileSync(safeRegularFile(repoRoot, policy.source.recipePath, 'managed CI executor recipe'))
  const dockerignoreBytes = readFileSync(safeRegularFile(repoRoot, policy.source.dockerignorePath, 'managed CI executor .dockerignore'))
  const contextRoot = realpathSync(resolve(repoRoot, policy.source.contextRoot))
  validateManagedCiExecutorBuildContext({
    builder: policy.builder,
    source: policy.source,
    recipeSource: recipeBytes.toString('utf8'),
    dockerignoreSource: dockerignoreBytes.toString('utf8'),
    contextFiles: scanManagedCiContext(contextRoot),
  })
  const executorBinarySources = Object.fromEntries(Object.entries(policy.source.executorBinarySources).map(([id, source]) => {
    const bytes = readFileSync(safeRegularFile(repoRoot, source.sourcePath, `managed CI executor binary source:${id}`))
    return [id, { ...source, sourceSha256: managedCiSha256(bytes) }]
  }))
  const externalDeployments = Object.fromEntries(Object.entries(policy.externalDeployments).map(([id, deployment]) => {
    const bytes = readFileSync(safeRegularFile(repoRoot, deployment.sourcePath, `managed CI external deployment source:${id}`))
    const supportFiles = deployment.supportFiles.map((supportFile, index) => {
      const supportBytes = readFileSync(safeRegularFile(
        repoRoot,
        supportFile.sourcePath,
        `managed CI external deployment support file:${id}:${index}`,
      ))
      return { ...supportFile, sourceSha256: managedCiSha256(supportBytes) }
    })
    return [id, {
      ...deployment,
      supportFiles,
      sourceSha256: managedCiSha256(bytes),
    }]
  }))
  const containerRecipe = recipeBytes.toString('utf8')
  for (const forbidden of ['oidc-receipt-signer', 'oidc-model-secret-broker', 'oidc-github-readonly-token-broker']) {
    if (containerRecipe.includes(forbidden)) fail(`candidate executor image recipe exposes trusted authority binary:${forbidden}`)
  }
  const imageBindings = Object.fromEntries(EXPECTED_CLASSES.map(id => [id, {
    ...policy.images[id],
    policyDigest: managedCiSha256(managedCiStableStringify({
      source: policy.source,
      builder: policy.builder,
      attestations: policy.attestations,
      image: policy.images[id],
    })),
  }]))
  return {
    policy,
    digest: managedCiSha256(policyRead.bytes),
    schemaDigest: managedCiSha256(schemaRead.bytes),
    recipeDigest: managedCiSha256(recipeBytes),
    buildContext: context,
    materials,
    controlPlane,
    executorBinarySources,
    externalDeployments,
    imageBindings,
    hostSandboxPolicyDigest: managedCiSha256(managedCiStableStringify(policy.hostSandbox)),
  }
}

function loadTrustedAuthorityPolicy(repoRoot, plan, oidcBrokerPolicy) {
  const policyRead = readJsonFile(repoRoot, plan.trustedAuthorityPolicy.path, 'managed CI trusted authority policy')
  const schemaRead = readJsonFile(repoRoot, plan.trustedAuthorityPolicy.schemaPath, 'managed CI trusted authority policy schema')
  validateJson(policyRead.value, schemaRead.value, 'managed CI trusted authority policy')
  const policy = policyRead.value
  exactValue(policy.workflow, {
    repository: plan.workflow.repository,
    path: plan.workflow.path,
    ref: plan.workflow.ref,
    event: plan.workflow.event,
  }, 'managed CI trusted authority workflow')
  exactArray(policy.candidateBoundary.jobs, EXPECTED_CLASSES, 'candidate-running job boundary')
  if (policy.candidateBoundary.idTokenPermission !== 'none' || policy.candidateBoundary.environment !== null
    || policy.candidateBoundary.credentials !== 'none-secretless-egress-proxy-only'
    || policy.candidateBoundary.processBoundary.procMode !== 'private-hidepid2'
    || policy.candidateBoundary.processBoundary.parentEnvironmentReadable !== false) {
    fail('candidate-running jobs are not tokenless, secretless, and process-isolated')
  }
  if (policy.oidc.issuer !== plan.observation.oidcIssuer || policy.oidc.audience !== plan.observation.oidcAudience
    || policy.oidc.candidateJobsCanMint !== false) fail('trusted authority OIDC policy differs from the managed plan')
  exactValue(oidcBrokerPolicy.policy.receiptSigning.serviceId, policy.receiptSigner.serviceId, 'receipt signer service identity')
  exactValue(oidcBrokerPolicy.policy.receiptSigning.keyIdentity, policy.receiptSigner.keyIdentity, 'receipt signer key identity')
  exactValue(oidcBrokerPolicy.policy.receiptSigning.certificateIdentity, policy.receiptSigner.certificateIdentity, 'receipt signer certificate identity')
  exactValue(oidcBrokerPolicy.policy.receiptSigning.allowedEnvironment, policy.receiptSigner.allowedEnvironment, 'receipt signer protected environment')
  return {
    policy,
    digest: managedCiSha256(policyRead.bytes),
    schemaDigest: managedCiSha256(schemaRead.bytes),
    candidateBoundaryDigest: managedCiSha256(managedCiStableStringify(policy.candidateBoundary)),
    oidcAuthorityDigest: managedCiSha256(managedCiStableStringify(policy.oidc)),
    frozenSubjectPolicyDigest: managedCiSha256(managedCiStableStringify(policy.frozenSubjectArtifact)),
    receiptSignerPolicyDigest: managedCiSha256(managedCiStableStringify(policy.receiptSigner)),
    hostObservationContractDigest: managedCiSha256(managedCiStableStringify(policy.hostObservation)),
  }
}

function governanceStableJson(value) {
  return `${JSON.stringify(normalize(value), null, 2)}\n`
}

function governanceDigest(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === 'string' ? value : governanceStableJson(value))
  return `sha256:${managedCiSha256(bytes)}`
}

function governanceMode(mode) {
  return (mode & 0o777).toString(8).padStart(4, '0')
}

function closedImmutableGitCommand(repoRoot, args, label, {
  input,
  maxBuffer = 64 * 1024 * 1024,
} = {}) {
  const result = runClosedGit(['--no-replace-objects', ...args], {
    cwd: repoRoot,
    input,
    maxInputBytes: 64 * 1024 * 1024,
    maxOutputBytes: maxBuffer,
    output: 'buffer',
    timeoutMs: 30_000,
  })
  if (!result.error && result.signal === null && result.status === 0 && Buffer.isBuffer(result.stdout)) {
    return result.stdout
  }
  const detail = Buffer.isBuffer(result.stderr)
    ? result.stderr.toString('utf8').trim()
    : String(result.error?.message ?? result.signal ?? result.status ?? 'unknown Git failure')
  fail(`${label} Git object read failed:${detail}`)
}

function immutableGitSingleLine(repoRoot, args, label) {
  const bytes = closedImmutableGitCommand(repoRoot, args, label)
  const text = strictGitUtf8(bytes, label)
  const line = text.endsWith('\n') ? text.slice(0, -1) : text
  if (!line || /[\0\r\n]/.test(line)) fail(`${label} returned an invalid single-line identity`)
  return line
}

function sameImmutableGitPathIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.uid === right.uid
    && left.gid === right.gid
}

function verifiedImmutableGitRepository(repoRoot, label) {
  const root = realpathSync(resolve(repoRoot))
  const rootInfo = lstatSync(root, { bigint: true })
  if (root !== resolve(repoRoot) || !rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    fail(`${label} repository root is not one canonical real directory`)
  }
  const gitDir = resolve(root, '.git')
  if (!existsSync(gitDir)) fail(`${label} repository has no in-tree Git directory`)
  const gitDirInfo = lstatSync(gitDir, { bigint: true })
  if (!gitDirInfo.isDirectory() || gitDirInfo.isSymbolicLink() || realpathSync(gitDir) !== gitDir) {
    fail(`${label} repository Git directory is external, redirected, or unsafe`)
  }
  const topLevel = immutableGitSingleLine(
    root,
    ['rev-parse', '--show-toplevel'],
    `${label} repository top-level`,
  )
  const observedGitDir = immutableGitSingleLine(
    root,
    ['rev-parse', '--absolute-git-dir'],
    `${label} repository Git directory`,
  )
  const objectFormat = immutableGitSingleLine(
    root,
    ['rev-parse', '--show-object-format'],
    `${label} repository object format`,
  )
  const insideWorkTree = immutableGitSingleLine(
    root,
    ['rev-parse', '--is-inside-work-tree'],
    `${label} repository work-tree identity`,
  )
  if (realpathSync(resolve(topLevel)) !== root
    || realpathSync(resolve(observedGitDir)) !== gitDir
    || objectFormat !== 'sha1'
    || insideWorkTree !== 'true') {
    fail(`${label} Git repository identity does not equal the requested SHA-1 work tree`)
  }
  for (const redirectedPath of ['commondir', 'objects/info/alternates']) {
    if (existsSync(resolve(gitDir, redirectedPath))) {
      fail(`${label} Git repository uses an external object/common-directory redirect:${redirectedPath}`)
    }
  }
  const indexPath = resolve(gitDir, 'index')
  const objectsPath = resolve(gitDir, 'objects')
  const indexInfo = lstatSync(indexPath, { bigint: true })
  const objectsInfo = lstatSync(objectsPath, { bigint: true })
  if (!indexInfo.isFile() || indexInfo.isSymbolicLink() || indexInfo.nlink !== 1n
    || realpathSync(indexPath) !== indexPath
    || !objectsInfo.isDirectory() || objectsInfo.isSymbolicLink()
    || realpathSync(objectsPath) !== objectsPath) {
    fail(`${label} Git index/object database is redirected or unsafe`)
  }
  return Object.freeze({
    root,
    rootInfo,
    gitDir,
    gitDirInfo,
    indexPath,
    indexInfo,
    objectsPath,
    objectsInfo,
  })
}

function assertImmutableGitRepositoryIdentity(repository, label) {
  const rootInfo = lstatSync(repository.root, { bigint: true })
  const gitDirInfo = lstatSync(repository.gitDir, { bigint: true })
  const indexInfo = lstatSync(repository.indexPath, { bigint: true })
  const objectsInfo = lstatSync(repository.objectsPath, { bigint: true })
  if (!sameImmutableGitPathIdentity(rootInfo, repository.rootInfo)
    || !sameImmutableGitPathIdentity(gitDirInfo, repository.gitDirInfo)
    || !sameImmutableGitPathIdentity(indexInfo, repository.indexInfo)
    || indexInfo.size !== repository.indexInfo.size
    || indexInfo.mtimeNs !== repository.indexInfo.mtimeNs
    || indexInfo.ctimeNs !== repository.indexInfo.ctimeNs
    || !sameImmutableGitPathIdentity(objectsInfo, repository.objectsInfo)) {
    fail(`${label} Git repository identity changed during immutable verification`)
  }
}

function immutableGitCommand(repoRoot, args, label, options = {}) {
  const repository = verifiedImmutableGitRepository(repoRoot, label)
  const output = closedImmutableGitCommand(
    repository.root,
    [
      `--git-dir=${repository.gitDir}`,
      `--work-tree=${repository.root}`,
      ...args,
    ],
    label,
    options,
  )
  assertImmutableGitRepositoryIdentity(repository, label)
  return output
}

function immutableGitObjectArchive(repoRoot, objectIds, objectType, label, {
  maxBuffer = 256 * 1024 * 1024,
} = {}) {
  if (!['blob', 'tree'].includes(objectType)) fail(`${label} requested an unsupported Git object type`)
  const ids = [...new Set(objectIds)]
  if (ids.length === 0) return new Map()
  const output = immutableGitCommand(
    repoRoot,
    ['cat-file', '--batch'],
    label,
    {
      input: Buffer.from(`${ids.join('\n')}\n`, 'utf8'),
      maxBuffer,
    },
  )
  const blobs = new Map()
  let offset = 0
  for (const expectedId of ids) {
    const headerEnd = output.indexOf(0x0a, offset)
    if (headerEnd < 0) fail(`${label} batch output is truncated`)
    const header = output.subarray(offset, headerEnd).toString('utf8')
    const match = /^([a-f0-9]{40}) (blob|tree) ([1-9][0-9]*|0)$/.exec(header)
    if (!match || match[1] !== expectedId || match[2] !== objectType) {
      fail(`${label} batch output has an invalid object header`)
    }
    const size = Number(match[3])
    const start = headerEnd + 1
    const end = start + size
    if (!Number.isSafeInteger(size) || size < 0 || end >= output.length || output[end] !== 0x0a) {
      fail(`${label} batch output has invalid object framing:${expectedId}`)
    }
    const bytes = Buffer.from(output.subarray(start, end))
    const observedObjectId = createHash('sha1')
      .update(Buffer.from(`${objectType} ${bytes.length}\0`, 'utf8'))
      .update(bytes)
      .digest('hex')
    if (observedObjectId !== expectedId) {
      fail(`${label} Git object bytes do not match the captured object ID:${expectedId}`)
    }
    blobs.set(expectedId, bytes)
    offset = end + 1
  }
  if (offset !== output.length) fail(`${label} batch output contains trailing objects`)
  return blobs
}

function immutableGitBlobArchive(repoRoot, objectIds, label) {
  const blobs = immutableGitObjectArchive(repoRoot, objectIds, 'blob', label)
  if (blobs.size === 0) fail(`${label} has no regular Git blobs`)
  return blobs
}

function strictGitUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    fail(`${label} is not valid UTF-8:${error.message}`)
  }
}

function immutableGitText(repoRoot, args, label) {
  return immutableGitCommand(repoRoot, args, label).toString('utf8').trim()
}

function canonicalGitSnapshotPath(path, label, { directory = false } = {}) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0')
    || /[\u0000-\u001f\u007f]/.test(path)
    || path.startsWith('/') || path.replace(/\/+$/, '').split('/').some(part => !part || part === '.' || part === '..')) {
    fail(`${label} path is unsafe:${String(path)}`)
  }
  const normalized = path.replace(/\/+$/, '')
  if (!directory && normalized !== path) fail(`${label} file path has a trailing separator:${path}`)
  return normalized
}

function gitModeToGovernanceMode(mode, path, label) {
  if (mode === '100644') return '0644'
  if (mode === '100755') return '0755'
  fail(`${label} contains a non-regular Git tree entry:${path}:${mode}`)
}

function compareSnapshotPaths(left, right) {
  const leftParts = left.split('/')
  const rightParts = right.split('/')
  const count = Math.min(leftParts.length, rightParts.length)
  for (let index = 0; index < count; index += 1) {
    const compared = compareUtf8Bytes(leftParts[index], rightParts[index])
    if (compared !== 0) return compared
  }
  return leftParts.length - rightParts.length
}

function parseRecursiveGitTreeInventory(rawTree, label) {
  const records = []
  let offset = 0
  while (offset < rawTree.length) {
    const end = rawTree.indexOf(0x00, offset)
    if (end < 0) fail(`${label} is missing its final NUL delimiter`)
    if (end === offset) fail(`${label} contains an empty record`)
    const record = strictGitUtf8(rawTree.subarray(offset, end), `${label} record`)
    const separator = record.indexOf('\t')
    if (separator < 0) fail(`${label} record is malformed`)
    const header = /^([0-9]{6}) (blob|tree|commit) ([a-f0-9]{40})$/.exec(
      record.slice(0, separator),
    )
    if (!header) fail(`${label} record has an invalid header`)
    const entry = {
      mode: header[1],
      type: header[2],
      objectId: header[3],
      path: canonicalGitSnapshotPath(record.slice(separator + 1), `${label} path`),
    }
    const expectedType = entry.mode === '040000' ? 'tree'
      : entry.mode === '160000' ? 'commit'
        : ['100644', '100755', '120000'].includes(entry.mode) ? 'blob'
          : null
    if (expectedType === null || entry.type !== expectedType) {
      fail(`${label} record has an invalid mode/type pair:${entry.path}:${entry.mode}:${entry.type}`)
    }
    records.push(entry)
    offset = end + 1
  }
  return records
}

function verifiedGitTreeProjection(rootTree, treeObjects, label) {
  const projection = []
  const visit = (treeId, prefix, ancestors) => {
    if (ancestors.has(treeId)) fail(`${label} contains a recursive tree object cycle:${treeId}`)
    const bytes = treeObjects.get(treeId)
    if (!bytes) fail(`${label} is missing a captured recursive tree object:${treeId}`)
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(treeId)
    const names = new Set()
    let offset = 0
    while (offset < bytes.length) {
      const modeEnd = bytes.indexOf(0x20, offset)
      const nameEnd = modeEnd < 0 ? -1 : bytes.indexOf(0x00, modeEnd + 1)
      if (modeEnd < 0 || nameEnd < 0 || nameEnd + 21 > bytes.length) {
        fail(`${label} tree object has invalid binary framing:${treeId}`)
      }
      const mode = strictGitUtf8(bytes.subarray(offset, modeEnd), `${label} tree mode`)
      const name = strictGitUtf8(bytes.subarray(modeEnd + 1, nameEnd), `${label} tree name`)
      if (name.includes('/') || names.has(name)) {
        fail(`${label} tree object contains an unsafe or duplicate entry name:${treeId}`)
      }
      canonicalGitSnapshotPath(name, `${label} tree entry name`)
      names.add(name)
      const objectId = bytes.subarray(nameEnd + 1, nameEnd + 21).toString('hex')
      const type = mode === '40000' ? 'tree'
        : mode === '160000' ? 'commit'
          : ['100644', '100755', '120000'].includes(mode) ? 'blob'
            : null
      if (type === null || !/^[a-f0-9]{40}$/.test(objectId)) {
        fail(`${label} tree object contains an invalid mode/object ID:${treeId}:${mode}`)
      }
      const path = canonicalGitSnapshotPath(
        prefix ? `${prefix}/${name}` : name,
        `${label} projected path`,
      )
      const entry = {
        mode: mode === '40000' ? '040000' : mode,
        type,
        objectId,
        path,
      }
      projection.push(entry)
      if (type === 'tree') visit(objectId, path, nextAncestors)
      offset = nameEnd + 21
    }
  }
  visit(rootTree, '', new Set())
  return projection
}

function immutableGitTreeSnapshot(repoRoot, {
  executorSourceCommit,
  executorSourceTree,
  label = 'activation trust bundle',
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(executorSourceCommit ?? '')
    || !/^[a-f0-9]{40}$/.test(executorSourceTree ?? '')) {
    fail(`${label} requires exact lowercase SHA-1 executor source commit/tree identities`)
  }
  const commit = immutableGitText(
    repoRoot,
    ['rev-parse', '--verify', `${executorSourceCommit}^{commit}`],
    `${label} executor source commit`,
  )
  if (commit !== executorSourceCommit) {
    fail(`${label} executorSourceCommit does not resolve to the exact declared commit`)
  }
  const commitBytes = immutableGitCommand(
    repoRoot,
    ['cat-file', 'commit', executorSourceCommit],
    `${label} executor source commit bytes`,
  )
  const observedCommit = createHash('sha1')
    .update(Buffer.from(`commit ${commitBytes.length}\0`, 'utf8'))
    .update(commitBytes)
    .digest('hex')
  if (observedCommit !== executorSourceCommit) {
    fail(`${label} executor source commit bytes do not match the declared commit object ID`)
  }
  const treeHeader = commitBytes.toString('utf8').split('\n', 1)[0]
  const tree = /^tree ([a-f0-9]{40})$/.exec(treeHeader)?.[1] ?? null
  if (tree === null) fail(`${label} executor source commit has no canonical tree header`)
  if (tree !== executorSourceTree) {
    fail(`${label} executorSourceTree does not equal the exact declared commit tree`)
  }

  const rootTreeObjects = immutableGitObjectArchive(
    repoRoot,
    [executorSourceTree],
    'tree',
    `${label} root tree object`,
    { maxBuffer: 64 * 1024 * 1024 },
  )
  const rawTree = immutableGitCommand(
    repoRoot,
    ['ls-tree', '-rzt', '--full-tree', executorSourceTree],
    `${label} recursive tree inventory`,
  )
  const inventoryRecords = parseRecursiveGitTreeInventory(
    rawTree,
    `${label} recursive tree inventory`,
  )
  const recursiveTreeObjects = immutableGitObjectArchive(
    repoRoot,
    inventoryRecords.filter(entry => entry.type === 'tree').map(entry => entry.objectId),
    'tree',
    `${label} recursive tree objects`,
    { maxBuffer: 64 * 1024 * 1024 },
  )
  const treeObjects = new Map([...rootTreeObjects, ...recursiveTreeObjects])
  const verifiedProjection = verifiedGitTreeProjection(
    executorSourceTree,
    treeObjects,
    `${label} verified tree closure`,
  )
  if (managedCiStableStringify(verifiedProjection) !== managedCiStableStringify(inventoryRecords)) {
    fail(`${label} recursive ls-tree inventory differs from the verified tree-object closure`)
  }
  const entries = new Map()
  const treeEntryOrder = new Map()
  const directories = new Set()
  for (const entry of verifiedProjection) {
    if (entry.type === 'tree') {
      if (directories.has(entry.path)) {
        fail(`${label} recursive tree inventory contains a duplicate directory:${entry.path}`)
      }
      directories.add(entry.path)
      continue
    }
    if (entries.has(entry.path)) {
      fail(`${label} recursive tree inventory contains a duplicate entry:${entry.path}`)
    }
    entries.set(entry.path, Object.freeze(entry))
    treeEntryOrder.set(entry.path, treeEntryOrder.size)
    const parts = entry.path.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join('/'))
    }
  }
  if (entries.size === 0) fail(`${label} executor source tree is empty`)

  const blobCache = immutableGitBlobArchive(
    repoRoot,
    [...entries.values()]
      .filter(entry => entry.type === 'blob')
      .map(entry => entry.objectId),
    `${label} frozen Git blob archive`,
  )
  const usedEntries = new Map()
  const fileEntry = (path, entryLabel) => {
    const normalized = canonicalGitSnapshotPath(path, entryLabel)
    const entry = entries.get(normalized)
    if (!entry) fail(`${entryLabel} is missing from executor source tree:${normalized}`)
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
      fail(`${entryLabel} must be a regular file in executor source tree:${normalized}:${entry.mode}:${entry.type}`)
    }
    usedEntries.set(normalized, entry)
    return entry
  }
  const readBlob = (entry, entryLabel) => {
    const bytes = blobCache.get(entry.objectId)
    if (!bytes) fail(`${entryLabel} Git blob is absent from the frozen tree archive:${entry.path}`)
    return bytes
  }
  const readFile = (path, entryLabel) => {
    const entry = fileEntry(path, entryLabel)
    return Buffer.from(readBlob(entry, entryLabel))
  }
  const readJson = (path, entryLabel) => {
    const bytes = readFile(path, entryLabel)
    if (bytes.length === 0) fail(`${entryLabel} is empty:${path}`)
    try {
      return { value: JSON.parse(bytes), bytes, entry: fileEntry(path, entryLabel) }
    } catch (error) {
      fail(`${entryLabel} is invalid JSON:${error.message}`)
    }
  }
  const requireDirectory = (path, entryLabel) => {
    const normalized = canonicalGitSnapshotPath(path, entryLabel, { directory: true })
    if (!directories.has(normalized)) fail(`${entryLabel} is missing from executor source tree:${normalized}`)
    return normalized
  }
  const inventory = (directoryPath, excludes = [], fileByteOverrides = new Map(), entryLabel = label) => {
    const directory = requireDirectory(directoryPath, entryLabel)
    const prefix = `${directory}/`
    const excluded = new Set(excludes)
    const isExcluded = path => [...excluded].some(root => path === root || path.startsWith(`${root}/`))
    return [...entries.values()]
      .filter(entry => entry.path.startsWith(prefix))
      .map(entry => ({ entry, relativePath: entry.path.slice(prefix.length) }))
      .filter(({ relativePath }) => !isExcluded(relativePath))
      .sort((left, right) => compareSnapshotPaths(left.relativePath, right.relativePath))
      .map(({ entry, relativePath }) => {
        usedEntries.set(entry.path, entry)
        const bytes = fileByteOverrides.get(relativePath) ?? readBlob(entry, entryLabel)
        return {
          path: relativePath,
          type: 'file',
          mode: gitModeToGovernanceMode(entry.mode, entry.path, entryLabel),
          hash: governanceDigest(bytes),
          size: bytes.length,
        }
      })
  }
  const directoryNamesWithEntry = (directoryPath, entryFile, entryLabel) => {
    const directory = requireDirectory(directoryPath, entryLabel)
    const prefix = `${directory}/`
    const names = new Set()
    for (const path of entries.keys()) {
      if (!path.startsWith(prefix)) continue
      const suffix = path.slice(prefix.length)
      const separator = suffix.indexOf('/')
      if (separator <= 0 || suffix.slice(separator + 1) !== entryFile) continue
      fileEntry(path, `${entryLabel} skill entry:${suffix.slice(0, separator)}`)
      names.add(suffix.slice(0, separator))
    }
    return [...names].sort(compareUtf8Bytes)
  }
  const identity = path => {
    const entry = fileEntry(path, `${label} file identity`)
    const bytes = readBlob(entry, `${label} file identity`)
    return {
      path: entry.path,
      mode: entry.mode,
      blobSha: entry.objectId,
      sha256: managedCiSha256(bytes),
      size: bytes.length,
    }
  }
  const checkoutScope = (rootPaths, exclusions = []) => {
    const normalizedRoots = [...new Set(rootPaths.map(path => canonicalGitSnapshotPath(
      path,
      `${label} checkout root`,
      { directory: true },
    )))].sort(compareSnapshotPaths)
    const normalizedExclusions = [...new Set(exclusions.map(path => canonicalGitSnapshotPath(
      path,
      `${label} checkout exclusion`,
    )))].sort(compareSnapshotPaths)
    const isExcluded = path => normalizedExclusions.some(
      excluded => path === excluded || path.startsWith(`${excluded}/`),
    )
    const roots = normalizedRoots.map(path => {
      if (entries.has(path)) return { path, type: 'file' }
      requireDirectory(path, `${label} checkout root`)
      return { path, type: 'directory' }
    })
    const selected = new Map()
    for (const root of roots) {
      if (isExcluded(root.path)) continue
      if (root.type === 'file') {
        selected.set(root.path, fileEntry(root.path, `${label} checkout file`))
        continue
      }
      const prefix = `${root.path}/`
      for (const entry of entries.values()) {
        if (entry.path.startsWith(prefix) && !isExcluded(entry.path)) {
          selected.set(entry.path, entry)
        }
      }
    }
    const files = [...selected.values()]
      .sort((left, right) => compareSnapshotPaths(left.path, right.path))
      .map(entry => {
        if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
          fail(`${label} checkout scope contains a non-regular Git entry:${entry.path}:${entry.mode}:${entry.type}`)
        }
        const bytes = readBlob(entry, `${label} checkout scope`)
        return {
          path: entry.path,
          mode: gitModeToGovernanceMode(entry.mode, entry.path, `${label} checkout scope`),
          sha256: managedCiSha256(bytes),
          size: bytes.length,
        }
      })
    return Object.freeze({
      exclusions: Object.freeze(normalizedExclusions),
      files: Object.freeze(files.map(file => Object.freeze(file))),
      roots: Object.freeze(roots.map(root => Object.freeze(root))),
    })
  }
  const closure = () => [...usedEntries.values()]
    .sort((left, right) => treeEntryOrder.get(left.path) - treeEntryOrder.get(right.path))
    .map(entry => {
      const bytes = readBlob(entry, `${label} trust closure`)
      return {
        path: entry.path,
        mode: entry.mode,
        blobSha: entry.objectId,
        sha256: managedCiSha256(bytes),
        size: bytes.length,
      }
    })

  return Object.freeze({
    commit,
    tree,
    readFile,
    readJson,
    requireDirectory,
    inventory,
    directoryNamesWithEntry,
    identity,
    checkoutScope,
    closure,
  })
}

function immutableFilesystemDrift(repoRoot, snapshot, roots, exclusions, {
  carrierProjectionBindings = new Map(),
} = {}) {
  const root = realpathSync(resolve(repoRoot))
  if (root !== resolve(repoRoot)) fail('activation trust checkout root is not one canonical real directory')
  const scope = snapshot.checkoutScope(roots, exclusions)
  const expected = new Map(scope.files.map(file => [file.path, file]))
  const observed = new Set()
  const drift = new Set()
  const visitedDirectories = new Set()
  const carrierCaptures = new Map()
  const isExcluded = path => scope.exclusions.some(
    excluded => path === excluded || path.startsWith(`${excluded}/`),
  )
  const stableFilesystemIdentity = (left, right) => (
    sameImmutableGitPathIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
  )
  const absolutePath = path => resolve(root, ...path.split('/'))
  const filesystemIdentity = info => Object.freeze({
    dev: info.dev.toString(),
    ino: info.ino.toString(),
    mode: info.mode.toString(),
    nlink: info.nlink.toString(),
    size: info.size.toString(),
    mtimeNs: info.mtimeNs.toString(),
    ctimeNs: info.ctimeNs.toString(),
  })

  const inspectFile = (path, initialInfo = null) => {
    observed.add(path)
    const expectedFile = expected.get(path)
    if (!expectedFile) {
      drift.add(path)
      return
    }
    let pathInfo = initialInfo
    try {
      pathInfo ??= lstatSync(absolutePath(path), { bigint: true })
      const expectedMode = BigInt(Number.parseInt(expectedFile.mode, 8))
      const carrierProjection = carrierProjectionBindings.get(path)
      if (!pathInfo.isFile()
        || pathInfo.isSymbolicLink()
        || pathInfo.nlink !== 1n
        || (pathInfo.mode & 0o7777n) !== expectedMode
        || (carrierProjection && (pathInfo.size <= 0n || pathInfo.size > BigInt(GOVERNANCE_CARRIER_MAX_BYTES)))
        || (!carrierProjection && pathInfo.size !== BigInt(expectedFile.size))
        || realpathSync(absolutePath(path)) !== absolutePath(path)) {
        drift.add(path)
        return
      }
      if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
        fail('activation trust checkout cannot obtain no-follow file descriptors on this platform')
      }
      let descriptor
      try {
        descriptor = openSync(
          absolutePath(path),
          fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | (fsConstants.O_CLOEXEC ?? 0),
        )
        const before = fstatSync(descriptor, { bigint: true })
        if (!stableFilesystemIdentity(pathInfo, before)
          || (carrierProjection && (before.size <= 0n || before.size > BigInt(GOVERNANCE_CARRIER_MAX_BYTES)))) {
          drift.add(path)
          return
        }
        const bytes = readFileSync(descriptor)
        const after = fstatSync(descriptor, { bigint: true })
        const finalPathInfo = lstatSync(absolutePath(path), { bigint: true })
        if (!stableFilesystemIdentity(before, after)
          || !stableFilesystemIdentity(after, finalPathInfo)) {
          drift.add(path)
          return
        }
        if (carrierProjection) {
          const expectedBytes = snapshot.readFile(
            path,
            `activation trust projected checkout baseline ${path}`,
          )
          const expectedProjected = projectGovernanceCarrierBytes({
            path,
            projectionId: carrierProjection.projection,
            bytes: expectedBytes,
          })
          const observedProjected = projectGovernanceCarrierBytes({
            path,
            projectionId: carrierProjection.projection,
            bytes,
          })
          if (expectedProjected.length !== observedProjected.length
            || managedCiSha256(expectedProjected) !== managedCiSha256(observedProjected)) {
            drift.add(path)
            return
          }
          carrierCaptures.set(path, Object.freeze({
            path,
            projection: carrierProjection.projection,
            bytes: Buffer.from(bytes),
            rawSha256: managedCiSha256(bytes),
            identity: filesystemIdentity(after),
          }))
        } else if (bytes.length !== expectedFile.size
          || managedCiSha256(bytes) !== expectedFile.sha256) {
          drift.add(path)
        }
      } finally {
        if (descriptor !== undefined) closeSync(descriptor)
      }
    } catch {
      drift.add(path)
    }
  }

  const visitDirectory = path => {
    if (visitedDirectories.has(path) || isExcluded(path)) return
    visitedDirectories.add(path)
    const absolute = absolutePath(path)
    let before
    try {
      before = lstatSync(absolute, { bigint: true })
      if (!before.isDirectory() || before.isSymbolicLink() || realpathSync(absolute) !== absolute) {
        drift.add(path)
        return
      }
      const names = readdirSync(absolute, { encoding: 'utf8' }).sort(compareUtf8Bytes)
      for (const name of names) {
        const childPath = canonicalGitSnapshotPath(
          `${path}/${name}`,
          'activation trust live checkout path',
        )
        if (isExcluded(childPath)) continue
        let childInfo
        try {
          childInfo = lstatSync(absolutePath(childPath), { bigint: true })
        } catch {
          drift.add(childPath)
          continue
        }
        if (childInfo.isDirectory() && !childInfo.isSymbolicLink()) {
          if (expected.has(childPath)) {
            observed.add(childPath)
            drift.add(childPath)
          } else {
            visitDirectory(childPath)
          }
        } else {
          inspectFile(childPath, childInfo)
        }
      }
      const after = lstatSync(absolute, { bigint: true })
      if (!stableFilesystemIdentity(before, after)) drift.add(path)
    } catch {
      drift.add(path)
    }
  }

  for (const scopeRoot of scope.roots) {
    if (isExcluded(scopeRoot.path)) continue
    if (scopeRoot.type === 'file') {
      inspectFile(scopeRoot.path)
    } else {
      visitDirectory(scopeRoot.path)
    }
  }
  for (const path of expected.keys()) {
    if (!observed.has(path)) drift.add(path)
  }
  const paths = [...drift].sort(compareSnapshotPaths)
  return {
    paths,
    digest: managedCiSha256(Buffer.from(paths.join('\0'), 'utf8')),
    carrierCaptures,
  }
}

function secureCarrierFilesystemCapture(repoRoot, path, projection) {
  const root = realpathSync(resolve(repoRoot))
  if (root !== resolve(repoRoot)) fail('carrier checkout root is not one canonical real directory')
  const normalized = canonicalGitSnapshotPath(path, 'managed CI carrier checkout path')
  const absolute = resolve(root, ...normalized.split('/'))
  const identity = info => Object.freeze({
    dev: info.dev.toString(),
    ino: info.ino.toString(),
    mode: info.mode.toString(),
    nlink: info.nlink.toString(),
    size: info.size.toString(),
    mtimeNs: info.mtimeNs.toString(),
    ctimeNs: info.ctimeNs.toString(),
  })
  const stable = (left, right) => (
    sameImmutableGitPathIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
  )
  let descriptor
  try {
    const initial = lstatSync(absolute, { bigint: true })
    if (!initial.isFile()
      || initial.isSymbolicLink()
      || initial.nlink !== 1n
      || initial.size <= 0n
      || initial.size > BigInt(GOVERNANCE_CARRIER_MAX_BYTES)
      || realpathSync(absolute) !== absolute) {
      fail(`carrier checkout path is not one bounded unique regular file:${path}`)
    }
    if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
      fail('carrier checkout cannot obtain no-follow file descriptors on this platform')
    }
    descriptor = openSync(
      absolute,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | (fsConstants.O_CLOEXEC ?? 0),
    )
    const before = fstatSync(descriptor, { bigint: true })
    if (!stable(initial, before)
      || before.size <= 0n
      || before.size > BigInt(GOVERNANCE_CARRIER_MAX_BYTES)) {
      fail(`carrier checkout identity changed before read:${path}`)
    }
    const bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor, { bigint: true })
    const finalPath = lstatSync(absolute, { bigint: true })
    if (!stable(before, after) || !stable(after, finalPath)) {
      fail(`carrier checkout identity changed during read:${path}`)
    }
    projectGovernanceCarrierBytes({ path, projectionId: projection, bytes })
    return Object.freeze({
      path,
      projection,
      bytes: Buffer.from(bytes),
      rawSha256: managedCiSha256(bytes),
      identity: identity(after),
    })
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function currentHeadCarrierBinding(repoRoot, baselineSnapshot, captures) {
  const headCommit = immutableGitText(
    repoRoot,
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    'managed CI carrier current HEAD commit',
  )
  const headTree = immutableGitText(
    repoRoot,
    ['rev-parse', 'HEAD^{tree}'],
    'managed CI carrier current HEAD tree',
  )
  const ancestry = runClosedGit(
    ['merge-base', '--is-ancestor', baselineSnapshot.commit, headCommit],
    { cwd: repoRoot, output: 'ignore', timeoutMs: 10_000 },
  )
  if (ancestry.error || ancestry.signal !== null || ancestry.status !== 0) {
    fail('managed CI carrier current HEAD is not a descendant of the immutable executor source commit')
  }
  const headSnapshot = immutableGitTreeSnapshot(repoRoot, {
    executorSourceCommit: headCommit,
    executorSourceTree: headTree,
    label: 'managed CI current carrier HEAD',
  })
  for (const capture of captures.values()) {
    const headBytes = headSnapshot.readFile(capture.path, `managed CI current carrier HEAD ${capture.path}`)
    if (!headBytes.equals(capture.bytes)) {
      fail(`managed CI carrier worktree bytes are not the exact current HEAD blob:${capture.path}`)
    }
    const headIdentity = headSnapshot.identity(capture.path)
    const checkoutMode = BigInt(capture.identity.mode) & 0o7777n
    const gitMode = BigInt(Number.parseInt(
      gitModeToGovernanceMode(headIdentity.mode, capture.path, 'managed CI current carrier HEAD'),
      8,
    ))
    if (checkoutMode !== gitMode) {
      fail(`managed CI carrier worktree mode differs from the exact current HEAD mode:${capture.path}`)
    }
  }
  return Object.freeze({ commit: headCommit, tree: headTree })
}

function assertCarrierValidationContextCurrent(repoRoot, context, headBinding) {
  const currentCommit = immutableGitText(
    repoRoot,
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    'managed CI carrier final HEAD commit',
  )
  const currentTree = immutableGitText(
    repoRoot,
    ['rev-parse', 'HEAD^{tree}'],
    'managed CI carrier final HEAD tree',
  )
  if (currentCommit !== headBinding.commit || currentTree !== headBinding.tree) {
    fail('managed CI carrier HEAD changed while raw after-images were being validated')
  }
  for (const initial of context.carrierCaptures.values()) {
    const current = secureCarrierFilesystemCapture(repoRoot, initial.path, initial.projection)
    if (current.rawSha256 !== initial.rawSha256
      || managedCiStableStringify(current.identity) !== managedCiStableStringify(initial.identity)
      || !current.bytes.equals(initial.bytes)) {
      fail(`managed CI carrier raw bytes or filesystem identity changed during validation:${initial.path}`)
    }
  }
}

function governanceTreeDigest(entries) {
  return governanceDigest(entries.map(({ path, type, mode, hash, target }) => normalize({
    path, type, mode, hash, target,
  })))
}

function sourceRelativeExcludes(source) {
  const sourcePath = source.path.replace(/\/+$/, '')
  const values = source.excludes ?? []
  if (!Array.isArray(values)
    || managedCiStableStringify(values) !== managedCiStableStringify([...new Set(values)].sort())) {
    fail(`activation trust source exclusions are not sorted and unique:${source.id}`)
  }
  const normalizedValues = values.map(value => {
    const normalized = value.replace(/\/+$/, '')
    if (!value.endsWith('/') || normalized === sourcePath || !normalized.startsWith(`${sourcePath}/`)) {
      fail(`activation trust source exclusion escapes its source:${source.id}:${value}`)
    }
    return normalized.slice(sourcePath.length + 1)
  })
  for (let left = 0; left < normalizedValues.length; left += 1) {
    for (let right = left + 1; right < normalizedValues.length; right += 1) {
      if (normalizedValues[right].startsWith(`${normalizedValues[left]}/`)) {
        fail(`activation trust source exclusions overlap:${source.id}:${values[left]}:${values[right]}`)
      }
    }
  }
  return normalizedValues
}

function normalizedManagedCiPlanBytes(bytes) {
  const normalizedPlan = JSON.parse(bytes)
  normalizedPlan.activation.verificationReceipt = null
  return Buffer.from(governanceStableJson(normalizedPlan))
}

function governanceSourceRecord(snapshot, source, {
  normalizeReceipt = false,
  carrierProjectionBindings = new Map(),
} = {}) {
  const sourcePath = source.path.replace(/\/+$/, '')
  let directory = false
  try {
    snapshot.requireDirectory(sourcePath, `activation trust source ${source.id}`)
    directory = true
  } catch (error) {
    if (!String(error?.message ?? error).includes('is missing from executor source tree')) throw error
  }
  if (directory) {
    const planRelativePath = MANAGED_CI_PLAN_PATH.startsWith(`${sourcePath}/`)
      ? MANAGED_CI_PLAN_PATH.slice(sourcePath.length + 1)
      : null
    const overrides = new Map()
    const carrierProjections = governanceCarrierProjectionsForSource(
      source,
      carrierProjectionBindings,
    )
    for (const binding of carrierProjections) {
      const relativePath = binding.path.slice(sourcePath.length + 1)
      overrides.set(
        relativePath,
        projectGovernanceCarrierBytes({
          path: binding.path,
          projectionId: binding.projection,
          bytes: snapshot.readFile(
            binding.path,
            `activation trust carrier projection ${binding.path}`,
          ),
        }),
      )
    }
    if (normalizeReceipt && planRelativePath !== null) {
      if (overrides.has(planRelativePath)) {
        fail('activation trust managed CI plan cannot also be a governance carrier projection')
      }
      overrides.set(
        planRelativePath,
        normalizedManagedCiPlanBytes(snapshot.readFile(
          `${sourcePath}/${planRelativePath}`,
          'activation trust managed CI plan source',
        )),
      )
    }
    const entries = snapshot.inventory(
      sourcePath,
      sourceRelativeExcludes(source),
      overrides,
      `activation trust source ${source.id}`,
    )
    return {
      id: source.id,
      ownerRepo: source.ownerRepo,
      path: source.path,
      excludes: [...(source.excludes ?? [])],
      type: 'directory',
      mode: '0755',
      hash: governanceTreeDigest(entries),
      files: entries.length,
      carrierProjections,
    }
  }
  let bytes = snapshot.readFile(source.path, `activation trust source ${source.id}`)
  const carrierProjection = carrierProjectionBindings.get(source.path)
  if (carrierProjection) {
    bytes = projectGovernanceCarrierBytes({
      path: source.path,
      projectionId: carrierProjection.projection,
      bytes,
    })
  }
  if (normalizeReceipt && source.path === MANAGED_CI_PLAN_PATH) {
    if (carrierProjection) {
      fail('activation trust managed CI plan cannot also be a governance carrier projection')
    }
    bytes = normalizedManagedCiPlanBytes(bytes)
  }
  const identity = snapshot.identity(source.path)
  return {
    id: source.id,
    ownerRepo: source.ownerRepo,
    path: source.path,
    type: 'file',
    mode: gitModeToGovernanceMode(identity.mode, source.path, `activation trust source ${source.id}`),
    hash: governanceDigest(bytes),
    size: bytes.length,
    ...(carrierProjection ? { carrierProjection: carrierProjection.projection } : {}),
  }
}

function snapshotPointerPath(snapshot, ownerPath, pointer, label) {
  if (typeof pointer !== 'string' || !pointer || pointer.includes('\\') || pointer.includes('\0')
    || pointer.startsWith('/')) {
    fail(`${label} pointer is invalid`)
  }
  const path = posix.normalize(posix.join(posix.dirname(ownerPath), pointer))
  canonicalGitSnapshotPath(path, label)
  snapshot.identity(path)
  return path
}

function pointerPath(repoRoot, ownerPath, pointer, label) {
  if (typeof pointer !== 'string' || !pointer || pointer.includes('\\') || pointer.includes('\0')) {
    fail(`${label} pointer is invalid`)
  }
  const absolute = resolve(repoRoot, dirname(ownerPath), pointer)
  const path = relative(repoRoot, absolute).split(sep).join('/')
  safeRegularFile(repoRoot, path, label)
  return path
}

function governanceSkillNames(snapshot, directoryPath, entryFile, label) {
  if (typeof entryFile !== 'string' || !entryFile || entryFile.includes('/') || entryFile.includes('\\')) {
    fail(`${label} entry file is unsafe`)
  }
  return snapshot.directoryNamesWithEntry(directoryPath, entryFile, label)
}

function governanceSkillInventory(snapshot, directoryPath, label) {
  const inventory = snapshot.inventory(directoryPath, [], new Map(), label)
  for (const entry of inventory) {
    if (entry.type !== 'file') fail(`${label} contains a non-regular file:${entry.path}:${entry.type}`)
  }
  return inventory
}

function governanceProviderById(providerRegistry, providerId, label) {
  const matches = (providerRegistry.providers ?? []).filter(provider => provider?.id === providerId)
  if (matches.length !== 1) fail(`${label} provider is not registered exactly once:${providerId}`)
  return matches[0]
}

function governanceSkillByName(semantics, skillName) {
  const matches = (semantics.skills ?? []).filter(skill => skill?.name === skillName)
  if (matches.length !== 1) fail(`activation trust skill is not classified exactly once:${skillName}`)
  return matches[0]
}

function governanceSkillCompatibility(semantics, skill, providerId) {
  if (skill.classification === 'provider-neutral') return null
  const profile = semantics.bindingProfiles?.[skill.bindingProfile]
  const binding = profile?.providers?.[providerId]
  if (!profile || !binding || binding.status !== 'compatible') {
    fail(`activation trust skill projection is not compatible:${skill.name}:${providerId}`)
  }
  if (typeof binding.strategy !== 'string' || typeof binding.evidenceSource !== 'string') {
    fail(`activation trust skill projection binding is incomplete:${skill.name}:${providerId}`)
  }
  for (const assumption of skill.allowedAssumptions ?? []) {
    if (typeof binding.resolutions?.[assumption] !== 'string' || !binding.resolutions[assumption]) {
      fail(`activation trust skill projection assumption is unresolved:${skill.name}:${providerId}:${assumption}`)
    }
  }
  return { profile, binding }
}

function governanceReviewBinding(providerRegistry, skill, providerId) {
  const provider = governanceProviderById(providerRegistry, providerId, `activation trust ${skill.name}`)
  if (provider.providerKind && provider.providerKind !== 'concrete-runtime') {
    fail(`activation trust review provider is not a concrete runtime:${providerId}`)
  }
  const binding = provider.adapter?.skillBindings?.[skill.name]
  if (!binding || binding.self !== providerId
    || !/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(binding.selectionPolicy ?? '')
    || !/^[a-z][a-z0-9-]*$/.test(binding.reviewClass ?? '')
    || Object.hasOwn(binding, 'peer')
    || typeof binding.transport !== 'string' || !binding.transport) {
    fail(`activation trust review binding is incomplete:${skill.name}:${providerId}`)
  }
  if (['cross-provider-deep-audit', 'independent-product-review'].includes(skill.mode)
    && (binding.certificationContract !== 'exact-provider-runtime-surface-role-target-v1'
      || binding.transport !== 'content-addressed-model-broker-exchange-v1')) {
    fail(`activation trust review binding is not independently certified:${skill.name}:${providerId}`)
  }
  return binding
}

function governanceReviewModeInstructions(skill, binding) {
  if (skill.mode === 'cross-provider-collaboration') return [
    'Complete the current provider analysis before seeing peer conclusions.',
    'Dispatch the same evidence-complete brief through the bound transport.',
    'Verify peer claims against primary evidence, preserve disagreements, and synthesize only supported conclusions.',
  ]
  if (skill.mode === 'cross-provider-deep-audit') return [
    `Require explicit author provider identity; this binding is valid only when the author provider is ${binding.self}.`,
    'Freeze the inventory and run the complete no-sample primary audit first.',
    `Resolve the highest certified independent capability under ${binding.selectionPolicy}/${binding.reviewClass} at review prepare time, freeze the exact certified reviewer receipt, and run it in a separate read-only context against the identical rubric and inventory; it must differ from both author and primary.`,
    'Reconcile dimension by dimension; missing coverage, mutation, absent identity, or author/peer collision is REVIEW-BLOCKED.',
  ]
  if (skill.mode === 'canonical-read-only-review') return [
    `If the author provider is ${binding.self}, resolve ${binding.selectionPolicy}/${binding.reviewClass}; this context cannot claim independent review.`,
    'Use an immutable snapshot or denied write tools and fingerprint the worktree before and after.',
    'Answer every canonical review question with evidence; suggestions are text only.',
  ]
  if (skill.mode === 'independent-product-review') return [
    `Require the author provider to be ${binding.self} and resolve only a distinct reviewer through ${binding.selectionPolicy}/${binding.reviewClass}.`,
    'Verify an exact certified provider/runtime/surface/product-consumer target before claiming an independent second opinion.',
    'Freeze and digest the product scope, dispatch without author conclusions, and require a separate read-only context.',
    'Validate broker/transport evidence and before/after worktree fingerprints; emit findings only and never acquire DS-author, release, or mutation authority.',
  ]
  fail(`activation trust skill has an unsupported review mode:${skill.name}:${String(skill.mode)}`)
}

function governanceInvocationFrontmatter(binding) {
  if (binding.invocation?.strategy === 'main-context') return ''
  if (binding.invocation?.strategy === 'native-context-fork'
    && binding.invocation.context === 'fork'
    && /^[a-z][a-z0-9-]*$/.test(binding.invocation.agent ?? '')) {
    return `context: ${binding.invocation.context}\nagent: ${binding.invocation.agent}\n`
  }
  fail(`activation trust review invocation is unsupported:${binding.self}:${String(binding.invocation?.strategy)}`)
}

function governanceProviderSkillDriver(providerRegistry, semantics, skill, providerId) {
  const provider = governanceProviderById(providerRegistry, providerId, `activation trust ${skill.name}`)
  const compatibility = governanceSkillCompatibility(semantics, skill, providerId)
  if (skill.projection !== 'provider-thin-driver'
    || compatibility?.binding.strategy !== 'provider-thin-driver') {
    fail(`activation trust skill is not a provider thin driver:${skill.name}:${providerId}`)
  }
  const binding = governanceReviewBinding(providerRegistry, skill, providerId)
  const steps = governanceReviewModeInstructions(skill, binding)
    .map((line, index) => `${index + 1}. ${line}`)
    .join('\n')
  const requiredReferences = (skill.requiredReferences ?? []).length
    ? `\n## Required canonical references\n\n${skill.requiredReferences.map(path => `- \`${path}\``).join('\n')}\n`
    : ''
  return `---
name: ${skill.name}
description: ${JSON.stringify(skill.description)}
${governanceInvocationFrontmatter(binding)}---

<!-- _generated: scripts/gen-codex-adapter.mjs; source: ${skill.sourceWorkflow} + packages/governance/canonical/providers.json; do not edit this provider view. -->

# ${skill.name} — ${provider.displayName} adapter

Read and follow the complete provider-neutral workflow at \`${skill.sourceWorkflow}\`. This file only resolves the provider binding; it must not redefine workflow meaning.

## Resolved binding

- \`currentProvider: ${binding.self}\`
- \`reviewSelectionPolicy: ${binding.selectionPolicy}\`
- \`reviewClass: ${binding.reviewClass}\`
- \`independentPeerProvider: selected-and-frozen-at-review-prepare-time\`
- \`transport: ${binding.transport}\`
- \`targetCertificationContract: ${binding.certificationContract || 'not-declared'}\`
- \`sameProviderPeer: invalid\`
- \`authorProviderRequired: ${skill.requiresAuthorProvider}\`
${skill.requiresAuthorProvider ? '- `authorProviderMustEqualCurrentProvider: true`\n- `independentReviewerMustDifferFromAuthor: true`\n' : ''}- \`reviewIsolation: ${semantics.policy.reviewIsolation}\`
- \`reviewMutation: ${semantics.policy.reviewMutation}\`
- \`reviewWorkspace: ${semantics.policy.reviewWorkspace}\`
- \`mutationDetection: ${semantics.policy.mutationDetection}\`
- \`missingEvidenceOutcome: ${semantics.policy.missingEvidenceOutcome}\`
- \`compatibilityEvidence: ${compatibility.binding.evidenceSource}\`
${requiredReferences}

## Adapter execution

${steps}

Unavailable transport, same-provider execution, missing identity/evidence, incomplete coverage, absent isolation, or worktree drift is \`${semantics.policy.missingEvidenceOutcome}\`, never PASS.
`
}

function governanceProjectedSkillMarkdown(providerRegistry, semantics, skill, sourceContent, sourcePath, providerId) {
  if (skill.sourceWorkflow !== sourcePath) {
    fail(`activation trust skill source workflow differs from parity source:${skill.name}`)
  }
  if (skill.projection === 'provider-thin-driver') {
    return governanceProviderSkillDriver(providerRegistry, semantics, skill, providerId)
  }
  if (!['provider-copy', 'provider-bound-copy'].includes(skill.projection)) {
    fail(`activation trust skill projection is unsupported:${skill.name}:${String(skill.projection)}`)
  }
  const marker = `<!-- _generated: scripts/gen-codex-adapter.mjs; source: ${sourcePath}; provider: ${providerId}; do not edit this adapter view. -->\n`
  const compatibility = governanceSkillCompatibility(semantics, skill, providerId)
  const binding = compatibility
    ? `\n<!-- provider-binding: profile=${skill.bindingProfile}; provider=${providerId}; strategy=${compatibility.binding.strategy}; assumptionCount=${skill.assumptionFindingCount}; assumptionFingerprint=${skill.assumptionFingerprint}; evidence=${compatibility.binding.evidenceSource} -->\n\n## Provider binding contract\n\nThis canonical workflow contains a committed inventory of legacy assumptions. Resolve them exactly as follows; an unavailable resolution or inventory drift is \`${semantics.policy.semanticLeakOutcome}\`:\n\n${(skill.allowedAssumptions ?? []).map(kind => `- \`${kind}\`: ${compatibility.binding.resolutions[kind]}`).join('\n')}\n`
    : ''
  const frontmatter = sourceContent.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  return frontmatter
    ? `${frontmatter[0]}\n${marker}${binding}${sourceContent.slice(frontmatter[0].length)}`
    : `${marker}${binding}${sourceContent}`
}

function governanceInventoryDifferences(expected, actual, compare) {
  const expectedByPath = new Map(expected.map(entry => [entry.path, entry]))
  const actualByPath = new Map(actual.map(entry => [entry.path, entry]))
  const differences = []
  for (const [path, wanted] of expectedByPath) {
    const got = actualByPath.get(path)
    if (!got || got.type !== wanted.type || got.hash !== wanted.hash
      || (compare === 'content-and-mode' && got.mode !== wanted.mode)) differences.push(path)
  }
  for (const path of actualByPath.keys()) if (!expectedByPath.has(path)) differences.push(path)
  return differences.sort()
}

function governanceSkillParityRecords(snapshot, manifest, providerRegistry) {
  if (!Array.isArray(manifest.skillParityContracts) || manifest.skillParityContracts.length === 0) {
    fail('activation trust manifest has no skill-parity contracts')
  }
  const semanticsPath = providerRegistry.canonical?.skillSemantics
  const semanticsRead = snapshot.readJson(semanticsPath, 'activation trust provider skill semantics')
  const semanticsSchemaPath = snapshotPointerPath(
    snapshot,
    semanticsPath,
    semanticsRead.value.$schema,
    'activation trust provider skill semantics schema',
  )
  validateJson(
    semanticsRead.value,
    snapshot.readJson(semanticsSchemaPath, 'activation trust provider skill semantics schema').value,
    'activation trust provider skill semantics',
  )
  const semantics = semanticsRead.value
  const records = []
  const blockers = []
  for (const item of manifest.skillParityContracts) {
    if (item.targetSelection !== 'all-generated-skill-views') {
      fail(`activation trust skill-parity target selection is unsupported:${item.id}`)
    }
    if (item.projection && managedCiStableStringify(item.projection) !== managedCiStableStringify({
      module: 'scripts/gen-codex-adapter.mjs',
      export: 'projectSharedSkillMarkdown',
      files: ['SKILL.md'],
    })) {
      fail(`activation trust skill-parity projection is unsupported:${item.id}`)
    }
    const sourceNames = governanceSkillNames(
      snapshot,
      item.sourceDirectory,
      'SKILL.md',
      `activation trust skill-parity source:${item.id}`,
    )
    const targets = (providerRegistry.providers ?? [])
      .filter(provider => provider.adapter?.generate && provider.adapter?.skillView)
      .map(provider => {
        const materializer = providerRegistry.canonical?.materializers?.skillViews?.[
          provider.adapter.skillView.materializerId
        ]
        const entryFile = materializer?.entryFile
        if (typeof entryFile !== 'string' || !entryFile || entryFile.includes('/') || entryFile.includes('\\')) {
          fail(`activation trust skill-parity materializer is invalid:${item.id}:${provider.id}`)
        }
        return {
          provider,
          targetDirectory: provider.adapter.skillView.directory,
          entryFile,
          extras: [...new Set((provider.adapter.skillAliases ?? []).map(alias => alias.name))].sort(),
        }
      })
      .sort((left, right) => compareUtf8Bytes(left.provider.id, right.provider.id))
    if (targets.length === 0) fail(`activation trust skill-parity has no generated targets:${item.id}`)
    for (const target of targets) {
      const targetNames = governanceSkillNames(
        snapshot,
        target.targetDirectory,
        target.entryFile,
        `activation trust skill-parity target:${item.id}:${target.provider.id}`,
      )
      const requiredTargetNames = [...new Set([...sourceNames, ...target.extras])].sort()
      const missing = requiredTargetNames.filter(name => !targetNames.includes(name))
      const unexpected = targetNames.filter(name => !requiredTargetNames.includes(name))
      if (missing.length || unexpected.length) {
        blockers.push(`control-plane skill parity names differ:${item.id}:${target.provider.id}:missing=${missing.join(',')}:unexpected=${unexpected.join(',')}`)
      }
      const sharedDigests = []
      if (item.compare !== 'names') {
        for (const skillName of sourceNames.filter(name => targetNames.includes(name))) {
          const sourceDirectory = `${item.sourceDirectory}/${skillName}`
          const targetDirectory = `${target.targetDirectory}/${skillName}`
          const sourceInventory = governanceSkillInventory(
            snapshot,
            sourceDirectory,
            `activation trust skill-parity source tree:${item.id}:${skillName}`,
          )
          const expectedInventory = sourceInventory.map(entry => ({ ...entry }))
          for (const entry of expectedInventory) {
            if (entry.path === 'SKILL.md') entry.path = target.entryFile
            if (item.projection && item.projection.files.includes(entry.path === target.entryFile ? 'SKILL.md' : entry.path)) {
              const sourcePath = `${sourceDirectory}/SKILL.md`
              const projected = Buffer.from(governanceProjectedSkillMarkdown(
                providerRegistry,
                semantics,
                governanceSkillByName(semantics, skillName),
                snapshot.readFile(sourcePath, `activation trust skill source:${skillName}`).toString('utf8'),
                sourcePath,
                target.provider.id,
              ))
              entry.hash = governanceDigest(projected)
              entry.size = projected.length
            }
          }
          if (new Set(expectedInventory.map(entry => entry.path)).size !== expectedInventory.length) {
            fail(`activation trust projected skill inventory collides:${item.id}:${target.provider.id}:${skillName}`)
          }
          const targetInventory = governanceSkillInventory(
            snapshot,
            targetDirectory,
            `activation trust skill-parity target tree:${item.id}:${target.provider.id}:${skillName}`,
          )
          const differences = governanceInventoryDifferences(expectedInventory, targetInventory, item.compare)
          if (differences.length) {
            blockers.push(`control-plane skill parity content differs:${item.id}:${target.provider.id}:${skillName}:${differences.join(',')}`)
          }
          sharedDigests.push({
            name: skillName,
            sourceDigest: governanceTreeDigest(sourceInventory),
            expectedTargetDigest: governanceTreeDigest(expectedInventory),
            targetDigest: governanceTreeDigest(targetInventory),
          })
        }
      }
      records.push({
        id: `${item.id}:${target.provider.id}`,
        sourceProvider: 'canonical',
        targetProvider: target.provider.id,
        sourceDirectory: item.sourceDirectory,
        targetDirectory: target.targetDirectory,
        compare: item.compare,
        projection: item.projection ?? null,
        sourceSkills: sourceNames,
        targetSkills: targetNames,
        requiredTargetExtras: target.extras,
        targetEntryFile: target.entryFile,
        sharedDigests,
      })
    }
  }
  return { records, blockers }
}

function governanceApplicableRules(rulesRegistry, providers, roleId) {
  return (rulesRegistry.rules ?? [])
    .map(rule => ({
      ...rule,
      providerCoverage: rule.providerCoverage?.['*']
        ? Object.fromEntries(providers.map(provider => [
          provider.id,
          rule.providerCoverage['*'],
        ]).sort(([left], [right]) => compareUtf8Bytes(left, right)))
        : {},
    }))
    .filter(rule => rule.appliesToRoles?.includes('*') || rule.appliesToRoles?.includes(roleId))
    .map(rule => ({
      ruleId: rule.ruleId,
      severity: rule.severity,
      source: rule.source,
      blocking: rule.blocking,
      gateIds: rule.gateIds,
      providerCoverage: rule.providerCoverage,
    }))
    .sort((left, right) => compareUtf8Bytes(left.ruleId, right.ruleId))
}

function governanceExpectedSnapshotDocuments({
  manifest,
  registryBodies,
  registryDigests,
  schemaDigests,
  sources,
  skillParity,
  contractDigest,
  generatorVersion,
}) {
  const providers = registryBodies.providers.providers ?? []
  const roleMatches = (registryBodies.roles.roles ?? []).filter(role => role.id === manifest.defaultRole)
  if (roleMatches.length !== 1) fail('activation trust control-plane role is not registered exactly once')
  const role = roleMatches[0]
  const requiredProviderIds = role.providerSelection === 'all-registered'
    ? providers.map(provider => provider.id).sort()
    : [...(role.requiredProviders ?? [])]
  const roleProviders = requiredProviderIds.map(providerId => governanceProviderById(
    registryBodies.providers,
    providerId,
    'activation trust control-plane role',
  ))
  const gateIds = new Set((registryBodies.gates.gates ?? []).map(gate => gate.id))
  for (const gateId of role.requiredGateIds ?? []) {
    if (!gateIds.has(gateId)) fail(`activation trust control-plane role references an unknown gate:${gateId}`)
  }
  const applicableRules = governanceApplicableRules(registryBodies.rules, providers, manifest.defaultRole)
  const provenance = {
    generated: true,
    generator: '@qijenchen/governance',
    generatorVersion,
    manifestId: manifest.id,
    contractDigest,
    role: manifest.defaultRole,
  }
  const documents = [{
    path: `${manifest.outputDirectory}/control-plane.json`,
    content: governanceStableJson({
      _provenance: provenance,
      schemaVersion: 1,
      role: manifest.defaultRole,
      canonicalSources: sources,
      rules: applicableRules,
      providers: roleProviders.map(provider => provider.id),
      gates: [...(role.requiredGateIds ?? [])],
      skillParity,
      registryDigests,
      schemaDigests,
    }),
    mode: '0644',
  }]
  for (const provider of roleProviders) {
    documents.push({
      path: `${manifest.outputDirectory}/providers/${provider.id}.json`,
      content: governanceStableJson({
        _provenance: provenance,
        schemaVersion: 1,
        provider,
        applicableRules: applicableRules.map(rule => ({
          ruleId: rule.ruleId,
          coverage: rule.providerCoverage[provider.id],
        })),
      }),
      mode: '0644',
    })
    documents.push({
      path: `${manifest.outputDirectory}/adapters/${provider.id}-hook.mjs`,
      content: `#!/usr/bin/env node
// @generated by @qijenchen/governance ${generatorVersion}; role=${manifest.defaultRole}; contract=${contractDigest}; DO NOT EDIT.
import { runHookCli } from '@qijenchen/governance/hook'

await runHookCli({ provider: ${JSON.stringify(provider.id)}, role: ${JSON.stringify(manifest.defaultRole)} })
`,
      mode: '0755',
    })
  }
  const sourceRows = sources
    .map(source => `| ${source.id} | \`${source.path}\` | \`${source.hash}\` |`)
    .join('\n')
  const parityRows = skillParity
    .map(item => `| ${item.id} | ${item.sourceProvider} \`${item.sourceDirectory}\` | ${item.targetProvider} \`${item.targetDirectory}\` | ${item.sourceSkills.length} shared + ${item.requiredTargetExtras.length} target-only |`)
    .join('\n')
  documents.push({
    path: `${manifest.outputDirectory}/PROVENANCE.md`,
    content: `<!-- @generated by @qijenchen/governance ${generatorVersion}; role=${manifest.defaultRole}; contract=${contractDigest}; DO NOT EDIT. -->
# Governance snapshot provenance

- Manifest: \`${manifest.id}\`
- Role: \`${manifest.defaultRole}\`
- Contract digest: \`${contractDigest}\`
- Generator: \`@qijenchen/governance@${generatorVersion}\`

No rule prose is copied into this snapshot. Paths and digests point to their canonical owners.

## Canonical inputs

| ID | Owner path | Digest |
|---|---|---|
${sourceRows}

## Provider skill parity

| Contract | Source | Target | Expected surface |
|---|---|---|---|
${parityRows || '| — | — | — | — |'}
`,
    mode: '0644',
  })
  documents.sort((left, right) => compareUtf8Bytes(left.path, right.path))
  const outputPrefix = `${manifest.outputDirectory}/`
  const files = documents.map(document => {
    const bytes = Buffer.from(document.content)
    return {
      path: document.path.slice(outputPrefix.length),
      type: 'file',
      mode: document.mode,
      hash: governanceDigest(bytes),
      size: bytes.length,
    }
  })
  return { documents, files, snapshotDigest: governanceTreeDigest(files) }
}

function unboundActivationTrustBindings(bundle) {
  const binding = {
    files: [],
    sources: [],
    filesDigest: managedCiSha256(managedCiStableStringify([])),
    gitTree: {
      executorSourceCommit: null,
      executorSourceTree: null,
      fileCount: 0,
      filesDigest: null,
      files: [],
    },
    manifest: {
      path: bundle.manifestPath,
      sha256: null,
      blobSha: null,
      mode: null,
      id: null,
      schemaVersion: null,
    },
    controlPlaneLock: {
      path: bundle.controlPlaneLockPath,
      sha256: null,
      blobSha: null,
      mode: null,
      contractDigest: null,
      inputDigest: null,
      snapshotDigest: null,
      generatedSnapshotDigest: null,
      manifestId: null,
    },
    buildGraph: {
      path: bundle.buildGraphPath,
      sha256: null,
      blobSha: null,
      mode: null,
      stageId: bundle.stageId,
      sourceResolvers: structuredClone(bundle.sourceResolvers),
    },
  }
  const result = {
    ...binding,
    fileDigests: {},
    bindingDigest: managedCiSha256(managedCiStableStringify(binding)),
    receiptBinding: null,
    expectedControlPlaneLock: null,
    expectedControlPlaneSnapshotDocuments: [],
    checkoutCurrent: false,
    checkoutDriftDigest: null,
    checkoutDriftPaths: [],
    lockCurrent: false,
    blockers: ['activation trust bundle is not bound to an immutable executorSourceCommit/executorSourceTree'],
  }
  return result
}

function activationTrustBindings(repoRoot, bundle, sourceIdentity, {
  carrierPlan = null,
  workflowPath = '.github/workflows/deep-audit-managed.yml',
} = {}) {
  if (sourceIdentity?.executorSourceCommit === null && sourceIdentity?.executorSourceTree === null) {
    return unboundActivationTrustBindings(bundle)
  }
  const snapshot = immutableGitTreeSnapshot(repoRoot, {
    executorSourceCommit: sourceIdentity?.executorSourceCommit,
    executorSourceTree: sourceIdentity?.executorSourceTree,
  })
  const selectedPlan = snapshot.readJson(
    MANAGED_CI_PLAN_PATH,
    'activation trust selected executor source plan',
  ).value
  const selectedActivation = structuredClone(selectedPlan.activation)
  delete selectedActivation.verificationReceipt
  const selectedActivationLeaves = []
  const collectLeaves = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) collectLeaves(child)
    } else {
      selectedActivationLeaves.push(value)
    }
  }
  collectLeaves(selectedActivation)
  const selectedPlanInactive = selectedPlan.activation?.verificationReceipt === null
    && selectedActivationLeaves.length > 0
    && selectedActivationLeaves.every(value => value === null)
  const carrierPlanBaseCurrent = carrierPlan === null
    || (() => {
      const selectedBase = structuredClone(selectedPlan)
      const carrierBase = structuredClone(carrierPlan)
      delete selectedBase.activation
      delete carrierBase.activation
      return managedCiStableStringify(selectedBase) === managedCiStableStringify(carrierBase)
    })()
  const manifestRead = snapshot.readJson(bundle.manifestPath, 'activation trust bundle manifest')
  const manifest = manifestRead.value
  if (manifest.id !== 'qijenchen-provider-neutral-governance' || manifest.schemaVersion !== 3
    || manifest.defaultRole !== 'ds-author'
    || manifest.lockFile !== bundle.controlPlaneLockPath || !Array.isArray(manifest.sources)) {
    fail('activation trust bundle manifest identity/shape differs from the canonical governance manifest')
  }
  const manifestSchemaPath = snapshotPointerPath(
    snapshot,
    bundle.manifestPath,
    manifest.$schema,
    'activation trust manifest schema',
  )
  validateJson(
    manifest,
    snapshot.readJson(manifestSchemaPath, 'activation trust manifest schema').value,
    'activation trust manifest',
  )
  const checkoutRoots = new Set([
    bundle.manifestPath,
    manifestSchemaPath,
    bundle.buildGraphPath,
    bundle.buildGraphSchemaPath,
    bundle.controlPlaneLockPath,
    bundle.controlPlaneLockSchemaPath,
    'packages/governance/package.json',
    manifest.outputDirectory,
    ...manifest.sources.map(source => source.path),
    ...(manifest.skillParityContracts ?? []).map(item => item.sourceDirectory),
  ])

  const graphRead = snapshot.readJson(bundle.buildGraphPath, 'activation trust governance build graph')
  const graphSchemaRead = snapshot.readJson(
    bundle.buildGraphSchemaPath,
    'activation trust governance build graph schema',
  )
  validateJson(graphRead.value, graphSchemaRead.value, 'activation trust governance build graph')
  const graphStages = graphRead.value.stages.filter(stage => stage.id === bundle.stageId)
  if (graphStages.length !== 1) fail(`activation trust build graph does not contain exactly one stage:${bundle.stageId}`)
  const graphStage = graphStages[0]
  exactValue(graphStage.sourceResolvers, bundle.sourceResolvers, 'activation trust build-graph manifest resolver closure')
  if (!graphStage.outputs.includes(`${manifest.outputDirectory}/`) || !graphStage.outputs.includes(bundle.controlPlaneLockPath)) {
    fail('activation trust build-graph stage does not own the canonical control-plane outputs')
  }

  if (manifest.sources.length === 0
    || new Set(manifest.sources.map(source => source.id)).size !== manifest.sources.length
    || new Set(manifest.sources.map(source => source.path)).size !== manifest.sources.length) {
    fail('activation trust manifest source IDs/paths are empty or duplicated')
  }
  for (const source of manifest.sources) {
    if (source.ownerRepo !== 'design-system' || source.required !== true) {
      fail(`activation trust manifest contains a non-authoritative or optional source:${source.id}`)
    }
  }
  let carrierProjectionBindings
  try {
    carrierProjectionBindings = governanceCarrierProjectionMap(manifest.sources)
    assertCanonicalGovernanceCarrierProjectionMap(carrierProjectionBindings)
  } catch (error) {
    fail(`activation trust manifest carrier projection closure is invalid:${error.message}`)
  }
  const sources = manifest.sources
    .map(source => governanceSourceRecord(snapshot, source, { carrierProjectionBindings }))
    .sort((left, right) => compareUtf8Bytes(left.id, right.id))
  const receiptSources = sources.map(source => structuredClone(source))
  const planSource = manifest.sources.find(source => source.path === MANAGED_CI_PLAN_PATH)
  if (!planSource) fail('activation trust manifest does not contain the managed CI plan source')
  for (const source of manifest.sources) {
    const sourcePath = source.path.replace(/\/+$/, '')
    if (sourcePath !== MANAGED_CI_PLAN_PATH
      && !MANAGED_CI_PLAN_PATH.startsWith(`${sourcePath}/`)) continue
    const normalizedSource = governanceSourceRecord(snapshot, source, {
      normalizeReceipt: true,
      carrierProjectionBindings,
    })
    const normalizedSourceIndex = receiptSources.findIndex(item => item.id === normalizedSource.id)
    if (normalizedSourceIndex < 0) fail(`activation trust normalized managed CI plan container is missing:${source.id}`)
    receiptSources[normalizedSourceIndex] = normalizedSource
  }

  const lockRead = snapshot.readJson(
    bundle.controlPlaneLockPath,
    'activation trust bundle control-plane lock',
  )
  const lock = lockRead.value
  const lockSchemaRead = snapshot.readJson(
    bundle.controlPlaneLockSchemaPath,
    'activation trust control-plane lock schema',
  )
  validateJson(lock, lockSchemaRead.value, 'activation trust control-plane lock')
  const governancePackage = snapshot.readJson(
    'packages/governance/package.json',
    'activation trust governance package manifest',
  ).value
  const digestPattern = /^sha256:[a-f0-9]{64}$/
  if (lock?.schemaVersion !== 2 || lock.role !== 'ds-author' || lock.outputDirectory !== manifest.outputDirectory
    || !Array.isArray(lock.sources) || lock._provenance?.generated !== true
    || lock._provenance?.generator !== '@qijenchen/governance'
    || lock._provenance?.generatorVersion !== governancePackage.version
    || lock._provenance?.manifestId !== manifest.id || lock._provenance?.role !== lock.role
    || lock._provenance?.contractDigest !== lock.contractDigest
    || !digestPattern.test(lock.contractDigest ?? '') || !digestPattern.test(lock.inputDigest ?? '')
    || !digestPattern.test(lock.snapshotDigest ?? '')) {
    fail('activation trust bundle control-plane lock identity/shape is invalid')
  }

  const registryBodies = {}
  const registryDigests = {}
  const schemaDigests = {}
  schemaDigests.manifest = governanceDigest(snapshot.readJson(
    manifestSchemaPath,
    'activation trust manifest schema',
  ).value)
  for (const name of ['rules', 'roles', 'providers', 'gates']) {
    const registryPath = snapshotPointerPath(
      snapshot,
      bundle.manifestPath,
      manifest.registries[name],
      `activation trust ${name} registry`,
    )
    const registryRead = snapshot.readJson(registryPath, `activation trust ${name} registry`)
    const registrySchemaPath = snapshotPointerPath(
      snapshot,
      registryPath,
      registryRead.value.$schema,
      `activation trust ${name} schema`,
    )
    const registrySchema = snapshot.readJson(
      registrySchemaPath,
      `activation trust ${name} schema`,
    ).value
    checkoutRoots.add(registryPath)
    checkoutRoots.add(registrySchemaPath)
    validateJson(registryRead.value, registrySchema, `activation trust ${name} registry`)
    registryBodies[name] = registryRead.value
    registryDigests[name] = governanceDigest(registryRead.value)
    schemaDigests[name] = governanceDigest(registrySchema)
  }
  schemaDigests.artifacts = Object.fromEntries(Object.entries(manifest.artifactSchemas).map(([name, pointer]) => {
    const schemaPath = snapshotPointerPath(
      snapshot,
      bundle.manifestPath,
      pointer,
      `activation trust ${name} artifact schema`,
    )
    const schema = snapshot.readJson(schemaPath, `activation trust ${name} artifact schema`).value
    checkoutRoots.add(schemaPath)
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: false })
    addFormats(ajv)
    try { ajv.compile(schema) } catch (error) { fail(`activation trust ${name} artifact schema is invalid:${error.message}`) }
    return [name, governanceDigest(schema)]
  }))
  const contractDigest = governanceDigest({
    manifest,
    registries: registryBodies,
    role: manifest.defaultRole,
    outputDirectory: manifest.outputDirectory,
    lockFile: manifest.lockFile,
    schemaDigests,
  })
  const skillParity = governanceSkillParityRecords(snapshot, manifest, registryBodies.providers)
  for (const provider of registryBodies.providers.providers ?? []) {
    if (provider.adapter?.generate && provider.adapter?.skillView?.directory) {
      checkoutRoots.add(provider.adapter.skillView.directory)
    }
  }
  const inputDigest = governanceDigest({
    contractDigest,
    registryDigests,
    sources,
    skillParity: skillParity.records,
  })
  const receiptInputDigest = governanceDigest({
    contractDigest,
    registryDigests,
    sources: receiptSources,
    skillParity: skillParity.records,
  })
  const expectedSnapshot = governanceExpectedSnapshotDocuments({
    manifest,
    registryBodies,
    registryDigests,
    schemaDigests,
    sources,
    skillParity: skillParity.records,
    contractDigest,
    generatorVersion: governancePackage.version,
  })
  const outputFiles = snapshot.inventory(
    manifest.outputDirectory,
    [],
    new Map(),
    'activation trust generated control-plane output',
  )
  const snapshotDigest = expectedSnapshot.snapshotDigest
  const checkoutDrift = immutableFilesystemDrift(
    repoRoot,
    snapshot,
    [...checkoutRoots],
    [MANAGED_CI_PLAN_PATH, workflowPath],
    { carrierProjectionBindings },
  )

  const blockers = [...skillParity.blockers]
  if (!selectedPlanInactive) {
    blockers.push('executor source tree does not contain the required inactive protected managed CI plan')
  }
  if (!carrierPlanBaseCurrent) {
    blockers.push('carrier managed CI plan changes non-activation bytes relative to the immutable executor source tree')
  }
  if (checkoutDrift.paths.length !== 0) {
    blockers.push(`immutable executor source checkout has tracked or untracked trust-path drift:${checkoutDrift.paths.join(',')}`)
  }
  if (managedCiStableStringify(lock.sources) !== managedCiStableStringify(sources)) {
    blockers.push('control-plane lock source closure is stale or incomplete relative to the full canonical manifest')
  }
  if (managedCiStableStringify(lock.skillParity) !== managedCiStableStringify(skillParity.records)) {
    blockers.push('control-plane lock skill parity is not independently recomputable from canonical skills, provider contracts, and generated views')
  }
  if (lock.contractDigest !== contractDigest || lock._provenance.contractDigest !== contractDigest) {
    blockers.push('control-plane lock contract digest is not recomputable from the canonical manifest/registries/schemas')
  }
  if (lock.inputDigest !== inputDigest) {
    blockers.push('control-plane lock input digest is not recomputable from the complete source closure')
  }
  if (managedCiStableStringify(outputFiles) !== managedCiStableStringify(expectedSnapshot.files)) {
    blockers.push('generated control-plane bytes/modes/paths do not match the independently recomputed canonical snapshot')
  }
  if (managedCiStableStringify(lock.files) !== managedCiStableStringify(expectedSnapshot.files)
    || lock.snapshotDigest !== snapshotDigest) {
    blockers.push('control-plane lock snapshot digest/files do not match the independently recomputed canonical snapshot')
  }
  const files = sources.map(source => ({
    id: source.id,
    path: source.path,
    sha256: source.hash.slice('sha256:'.length),
    type: source.type,
  }))
  const fileDigests = Object.fromEntries(files.map(item => [item.id, item.sha256]))
  const treeFiles = snapshot.closure()
  const treeFilesDigest = managedCiSha256(managedCiStableStringify(treeFiles))
  const manifestIdentity = snapshot.identity(bundle.manifestPath)
  const lockIdentity = snapshot.identity(bundle.controlPlaneLockPath)
  const graphIdentity = snapshot.identity(bundle.buildGraphPath)
  const binding = {
    files,
    sources,
    filesDigest: managedCiSha256(managedCiStableStringify(sources)),
    gitTree: {
      executorSourceCommit: snapshot.commit,
      executorSourceTree: snapshot.tree,
      fileCount: treeFiles.length,
      filesDigest: treeFilesDigest,
      files: treeFiles,
    },
    manifest: {
      path: bundle.manifestPath,
      sha256: managedCiSha256(manifestRead.bytes),
      blobSha: manifestIdentity.blobSha,
      mode: manifestIdentity.mode,
      id: manifest.id,
      schemaVersion: manifest.schemaVersion,
    },
    controlPlaneLock: {
      path: bundle.controlPlaneLockPath,
      sha256: managedCiSha256(lockRead.bytes),
      blobSha: lockIdentity.blobSha,
      mode: lockIdentity.mode,
      contractDigest: lock.contractDigest,
      inputDigest: lock.inputDigest,
      snapshotDigest: lock.snapshotDigest,
      generatedSnapshotDigest: snapshotDigest,
      manifestId: lock._provenance.manifestId,
    },
    buildGraph: {
      path: bundle.buildGraphPath,
      sha256: managedCiSha256(graphRead.bytes),
      blobSha: graphIdentity.blobSha,
      mode: graphIdentity.mode,
      stageId: graphStage.id,
      sourceResolvers: structuredClone(bundle.sourceResolvers),
    },
  }
  const bindingDigest = managedCiSha256(managedCiStableStringify(binding))
  const receiptBinding = {
    activationTrustBundleDigest: bindingDigest,
    executorSourceCommit: snapshot.commit,
    executorSourceTree: snapshot.tree,
    trustTreeFilesDigest: treeFilesDigest,
    trustTreeFileCount: treeFiles.length,
    manifestDigest: managedCiSha256(manifestRead.bytes),
    buildGraphDigest: managedCiSha256(graphRead.bytes),
    sourceSetDigest: managedCiSha256(managedCiStableStringify(receiptSources)),
    sourceCount: receiptSources.length,
    controlPlaneLockSha256: managedCiSha256(lockRead.bytes),
    controlPlaneLockBlobSha: lockIdentity.blobSha,
    controlPlaneContractDigest: contractDigest,
    controlPlaneInputDigest: receiptInputDigest,
    controlPlaneSnapshotDigest: lock.snapshotDigest,
    generatedSnapshotDigest: snapshotDigest,
  }
  const expectedControlPlaneLock = {
    ...structuredClone(lock),
    _provenance: {
      ...structuredClone(lock._provenance),
      contractDigest,
      generatorVersion: governancePackage.version,
      manifestId: manifest.id,
      role: manifest.defaultRole,
    },
    role: manifest.defaultRole,
    outputDirectory: manifest.outputDirectory,
    contractDigest,
    inputDigest,
    snapshotDigest,
    sources,
    skillParity: skillParity.records,
    files: expectedSnapshot.files,
  }
  const result = {
    ...binding,
    fileDigests,
    bindingDigest,
    receiptBinding: {
      ...receiptBinding,
      bindingDigest: managedCiSha256(managedCiStableStringify(receiptBinding)),
    },
    expectedControlPlaneLock,
    expectedControlPlaneSnapshotDocuments: expectedSnapshot.documents,
    checkoutCurrent: checkoutDrift.paths.length === 0,
    checkoutDriftDigest: checkoutDrift.digest,
    checkoutDriftPaths: checkoutDrift.paths,
    lockCurrent: blockers.length === 0,
    blockers,
  }
  managedCiCarrierValidationContexts.set(result, Object.freeze({
    snapshot,
    carrierProjectionBindings,
    carrierCaptures: checkoutDrift.carrierCaptures,
  }))
  return result
}

function controlPlaneGenerationSourceIdentity(repoRoot, plan, sourceIdentity) {
  if (sourceIdentity?.executorSourceCommit !== undefined
    || sourceIdentity?.executorSourceTree !== undefined) {
    return sourceIdentity
  }
  if (plan.activation.executorSourceCommit !== null || plan.activation.executorSourceTree !== null) {
    return plan.activation
  }
  const executorSourceCommit = immutableGitText(
    repoRoot,
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    'control-plane generation HEAD commit',
  )
  const executorSourceTree = immutableGitText(
    repoRoot,
    ['rev-parse', 'HEAD^{tree}'],
    'control-plane generation HEAD tree',
  )
  return { executorSourceCommit, executorSourceTree }
}

export function managedCiExpectedControlPlaneLockDocument({
  repoRoot = process.cwd(),
  executorSourceCommit,
  executorSourceTree,
} = {}) {
  const root = realpathSync(resolve(repoRoot))
  const plan = readJsonFile(root, MANAGED_CI_PLAN_PATH, 'managed CI plan').value
  validateManagedCiTrustedExecutionPlan(plan, { repoRoot: root })
  const sourceIdentity = controlPlaneGenerationSourceIdentity(root, plan, {
    executorSourceCommit,
    executorSourceTree,
  })
  return structuredClone(activationTrustBindings(
    root,
    plan.activationTrustBundle,
    sourceIdentity,
    { carrierPlan: plan, workflowPath: plan.workflow.path },
  ).expectedControlPlaneLock)
}

export function managedCiExpectedControlPlaneSnapshotDocuments({
  repoRoot = process.cwd(),
  executorSourceCommit,
  executorSourceTree,
} = {}) {
  const root = realpathSync(resolve(repoRoot))
  const plan = readJsonFile(root, MANAGED_CI_PLAN_PATH, 'managed CI plan').value
  validateManagedCiTrustedExecutionPlan(plan, { repoRoot: root })
  const sourceIdentity = controlPlaneGenerationSourceIdentity(root, plan, {
    executorSourceCommit,
    executorSourceTree,
  })
  return structuredClone(activationTrustBindings(
    root,
    plan.activationTrustBundle,
    sourceIdentity,
    { carrierPlan: plan, workflowPath: plan.workflow.path },
  ).expectedControlPlaneSnapshotDocuments)
}

function managedCiExpectedActivationReceiptTrustBinding(activationTrustBundle, trust) {
  const { bindingDigest: _prePolicyDigest, ...prePolicy } = activationTrustBundle.receiptBinding
  const binding = {
    ...prePolicy,
    receiptPolicyDigest: trust.receiptPolicyDigest,
  }
  return {
    bindingDigest: managedCiSha256(managedCiStableStringify(binding)),
    ...binding,
  }
}

export function managedCiExpectedActivationVerificationReceiptTrustBinding(planState) {
  if (!planState?.activationTrustBundle || !planState?.trust) {
    fail('activation verification receipt trust binding requires loaded managed CI state')
  }
  return managedCiExpectedActivationReceiptTrustBinding(
    planState.activationTrustBundle,
    planState.trust,
  )
}

function verifyManagedCiActivationVerificationReceipt(plan, trust, activationTrustBundle, now) {
  const receipt = plan.activation.verificationReceipt
  if (receipt === null) {
    const blockers = ['external evidence bytes and Sigstore bindings are not cryptographically verified']
    if (!trust.policyActive) {
      blockers.push('activation completion-attestor allowed-key policy is not activated', ...trust.policyBlockers)
    }
    return {
      status: 'not-verified',
      receiptDigest: null,
      issuerKeyIds: [],
      issuerSubjects: [],
      blockers,
    }
  }

  const blockers = []
  const receiptDigest = managedCiSha256(managedCiStableStringify(receipt))
  if (!trust.policyActive) {
    blockers.push('activation completion-attestor allowed-key policy is not activated', ...trust.policyBlockers)
  }
  if (receipt.issuerRegistryDigest !== trust.registryDigest) {
    blockers.push('activation verification receipt issuer registry digest differs from the canonical registry')
  }
  const expectedTrustBinding = managedCiExpectedActivationReceiptTrustBinding(activationTrustBundle, trust)
  if (managedCiStableStringify(receipt.trustBinding) !== managedCiStableStringify(expectedTrustBinding)) {
    blockers.push('activation verification receipt does not bind the complete manifest/build-graph control-plane closure and current receipt policy')
  }

  const issuedAt = new Date(receipt.issuedAt)
  const expiresAt = new Date(receipt.expiresAt)
  const current = now instanceof Date ? now : new Date(now)
  const replayRetention = new Date(receipt.replay.retentionUntil)
  const clockSkewMs = trust.receiptPolicy.clockSkewSeconds * 1000
  const maxTtlMs = trust.receiptPolicy.maxTtlMinutes * 60_000
  if (!Number.isFinite(current.getTime())) fail('managed CI activation verification time is invalid')
  if (!Number.isFinite(issuedAt.getTime()) || !Number.isFinite(expiresAt.getTime())
    || !Number.isFinite(replayRetention.getTime())
    || expiresAt <= issuedAt || expiresAt.getTime() - issuedAt.getTime() > maxTtlMs) {
    blockers.push('activation verification receipt exceeds the current completion-attestation TTL policy')
  } else {
    if (current.getTime() + clockSkewMs < issuedAt.getTime()) {
      blockers.push('activation verification receipt is not current yet')
    }
    if (current.getTime() - clockSkewMs >= expiresAt.getTime()) {
      blockers.push('activation verification receipt is expired')
    }
    if (current >= replayRetention) {
      blockers.push('activation verification receipt replay reservation is no longer retained')
    }
  }
  const archiveRetention = new Date(receipt.archive.retentionUntil)
  if (!Number.isFinite(archiveRetention.getTime()) || current >= archiveRetention) {
    blockers.push('activation verification receipt offline evidence archive retention is no longer current')
  }

  const issuerById = new Map(trust.registry.issuers.map(issuer => [issuer.keyId, issuer]))
  const allowed = new Set(trust.receiptPolicy.allowedKeyIds)
  const verifiedKeys = new Set()
  const verifiedSubjects = new Set()
  let signingBytes = null
  try {
    signingBytes = managedCiActivationVerificationReceiptSigningBytes(plan, receipt)
  } catch (error) {
    blockers.push(`activation verification receipt cannot construct signing bytes:${error.message}`)
  }
  for (const signatureRecord of receipt.signatures) {
    const keyId = signatureRecord.issuerKeyId
    const issuer = issuerById.get(keyId)
    if (!allowed.has(keyId)) {
      blockers.push(`activation verification receipt issuer is not allowed by current policy:${keyId}`)
      continue
    }
    if (!issuer) {
      blockers.push(`activation verification receipt issuer is not registered:${keyId}`)
      continue
    }
    if (issuer.subject !== signatureRecord.issuerSubject) {
      blockers.push(`activation verification receipt issuer subject differs from the canonical registry:${keyId}`)
      continue
    }
    if (issuer.status !== 'active' || issuer.revokedAt !== null || !issuer.roles.includes(plan.trust.issuerRole)) {
      blockers.push(`activation verification receipt issuer is not a current ${plan.trust.issuerRole}:${keyId}`)
      continue
    }
    const notBefore = new Date(issuer.notBefore)
    const notAfter = new Date(issuer.notAfter)
    if (!Number.isFinite(notBefore.getTime()) || !Number.isFinite(notAfter.getTime())
      || notBefore > issuedAt || notAfter < expiresAt || notAfter <= current) {
      blockers.push(`activation verification receipt issuer lifecycle does not cover issue, expiry, and current verification:${keyId}`)
      continue
    }
    if (!/^[A-Za-z0-9_-]{86}$/.test(signatureRecord.signature)) {
      blockers.push(`activation verification receipt signature encoding is invalid:${keyId}`)
      continue
    }
    const signature = Buffer.from(signatureRecord.signature, 'base64url')
    if (signature.length !== 64 || signature.toString('base64url') !== signatureRecord.signature) {
      blockers.push(`activation verification receipt signature is not canonical Ed25519 base64url:${keyId}`)
      continue
    }
    if (signingBytes) {
      try {
        if (!verify(null, signingBytes, publicKeyFromIssuer(issuer), signature)) {
          blockers.push(`activation verification receipt signature is invalid:${keyId}`)
          continue
        }
      } catch (error) {
        blockers.push(`activation verification receipt signature cannot be verified:${keyId}:${error.message}`)
        continue
      }
    }
    verifiedKeys.add(keyId)
    verifiedSubjects.add(issuer.subject)
  }
  if (verifiedKeys.size < trust.receiptPolicy.quorum
    || verifiedSubjects.size < trust.receiptPolicy.quorum) {
    blockers.push(`activation verification receipt lacks current distinct-subject quorum ${trust.receiptPolicy.quorum}`)
  }

  return {
    status: blockers.length === 0 ? 'verified' : 'not-verified',
    receiptDigest,
    issuerKeyIds: [...verifiedKeys].sort(),
    issuerSubjects: [...verifiedSubjects].sort(),
    blockers,
  }
}

export function loadManagedCiTrustedExecutionCore({
  repoRoot = process.cwd(),
  now = new Date(),
} = {}) {
  const root = realpathSync(resolve(repoRoot))
  const read = readJsonFile(root, MANAGED_CI_PLAN_PATH, 'managed CI plan')
  validateManagedCiTrustedExecutionPlan(read.value, { repoRoot: root })
  const plan = read.value
  const planDigest = managedCiSha256(read.bytes)
  const schemaBytes = readFileSync(safeRegularFile(root, MANAGED_CI_PLAN_SCHEMA_PATH, 'managed CI plan schema'))
  const schemaDigest = managedCiSha256(schemaBytes)
  const contract = loadManagedCiActivatedWorkflowContract({ repoRoot: root, plan })
  const oidcBrokerPolicy = loadOidcBrokerPolicy(root, plan)
  const executorSupplyChain = loadExecutorSupplyChainPolicy(root, plan)
  const trustedAuthority = loadTrustedAuthorityPolicy(root, plan, oidcBrokerPolicy)
  const modelReleaseAuthority = loadModelReleaseAuthorityPolicy({ repoRoot: root })
  const classes = new Map()
  const blockers = []
  for (const executionClass of plan.executionClasses) {
    const bindings = profileBindings(root, executionClass)
    const modelEgress = executionClass.id === 'model-broker' ? modelEgressBindings(root, executionClass) : null
    const imageDigest = plan.activation.executionClasses[executionClass.id].imageDigest
    classes.set(executionClass.id, {
      executionClass,
      profileBindings: bindings,
      profileDigest: managedCiSha256(managedCiStableStringify(bindings)),
      modelEgress,
      networkPolicyCatalogDigest: managedCiSha256(managedCiStableStringify({
        network: executionClass.network,
        modelEgress: modelEgress === null ? null : {
          registrySha256: modelEgress.registrySha256,
          brokerProfilesSha256: modelEgress.brokerProfilesSha256,
          profiles: modelEgress.profiles,
        },
      })),
      isolationPolicyDigest: managedCiSha256(managedCiStableStringify(executionClass.isolation)),
      permissionsDigest: managedCiSha256(managedCiStableStringify(executionClass.permissions)),
      containerImageDigest: imageDigest,
      oidcClaimPolicyDigest: oidcBrokerPolicy.claimPolicyDigest,
      oidcBrokerPolicyDigest: oidcBrokerPolicy.brokerPolicyDigests[executionClass.id] ?? null,
      receiptSigningPolicyDigest: oidcBrokerPolicy.receiptSigningPolicyDigest,
    })
  }
  const workflow = inspectManagedCiWorkflowMechanism({ repoRoot: root, plan, contractState: contract })
  const trust = trustBindings(root, plan.trust, now)
  const activationTrustBundle = activationTrustBindings(
    root,
    plan.activationTrustBundle,
    plan.activation,
    { carrierPlan: plan, workflowPath: plan.workflow.path },
  )
  const declarationBlockers = [...workflow.blockers]
  if (plan.activation.repositoryId === null) declarationBlockers.push('immutable repository ID activation is null')
  if (plan.activation.repositoryOwnerId === null) declarationBlockers.push('immutable repository owner ID activation is null')
  declarationBlockers.push(...activationTrustBundle.blockers)
  const activationEvidence = verifyManagedCiActivationVerificationReceipt(
    plan,
    trust,
    activationTrustBundle,
    now,
  )
  blockers.push(...declarationBlockers, ...activationEvidence.blockers)
  const coreActive = declarationBlockers.length === 0 && activationEvidence.status === 'verified'
  const state = {
    root,
    plan,
    planDigest,
    schemaDigest,
    activatedWorkflowContract: contract,
    oidcBrokerPolicy,
    executorSupplyChain,
    trustedAuthority,
    modelReleaseAuthority,
    workflow,
    trust,
    activationTrustBundle,
    activationEvidence,
    classes,
    declarationsComplete: declarationBlockers.length === 0,
    coreActive,
    carrierValidated: false,
    active: false,
    blockers: [...new Set(blockers)],
  }
  managedCiTrustedExecutionCoreDigests.set(state, managedCiTrustedExecutionCoreDigest(state))
  const carrierContext = managedCiCarrierValidationContexts.get(activationTrustBundle)
  if (carrierContext) managedCiTrustedExecutionCoreContexts.set(state, carrierContext)
  return state
}

export function isManagedCiTrustedExecutionCore(value) {
  if (value === null || typeof value !== 'object') return false
  const expected = managedCiTrustedExecutionCoreDigests.get(value)
  if (expected === undefined) return false
  try {
    return managedCiTrustedExecutionCoreDigest(value) === expected
  } catch {
    return false
  }
}

export function managedCiImmutableValidationModels(core) {
  if (!isManagedCiTrustedExecutionCore(core)) {
    fail('immutable managed CI validation models require one branded trusted core')
  }
  const context = managedCiTrustedExecutionCoreContexts.get(core)
    ?? managedCiCarrierValidationContexts.get(core.activationTrustBundle)
  if (!context?.snapshot) {
    fail('immutable managed CI validation models have no executor-source snapshot capability')
  }
  const capture = (path, label) => Object.freeze({
    ...context.snapshot.identity(path),
    bytes: context.snapshot.readFile(path, label),
  })
  return Object.freeze({
    executorSourceCommit: context.snapshot.commit,
    executorSourceTree: context.snapshot.tree,
    runtimeProfile: capture(
      core.plan.trust.runtimeEvidencePolicyPath,
      'managed CI immutable runtime profile',
    ),
    issuerRegistry: capture(
      core.plan.trust.issuerRegistryPath,
      'managed CI immutable issuer registry',
    ),
    providerCliToolchain: capture(
      'infra/governance/providers/provider-cli-toolchain.json',
      'managed CI immutable provider CLI toolchain manifest',
    ),
  })
}

function parseCapturedGovernanceCarrier(capture, label) {
  if (!capture || !Buffer.isBuffer(capture.bytes)) {
    fail(`${label} raw carrier capture is missing`)
  }
  try {
    return JSON.parse(capture.bytes)
  } catch (error) {
    fail(`${label} raw carrier capture is invalid JSON:${error.message}`)
  }
}

function managedCiCoreRevalidationProjection(core) {
  return {
    planDigest: core.planDigest,
    schemaDigest: core.schemaDigest,
    activatedWorkflowContractDigest: core.activatedWorkflowContract?.digest ?? null,
    workflowIdentityDigest: core.workflow?.workflowIdentityDigest ?? null,
    workflowContractDigest: core.workflow?.contractDigest ?? null,
    workflowBlockers: core.workflow?.blockers ?? [],
    trustRegistryDigest: core.trust?.registryDigest ?? null,
    trustReceiptPolicyDigest: core.trust?.receiptPolicyDigest ?? null,
    trustPolicyActive: core.trust?.policyActive ?? false,
    trustPolicyBlockers: core.trust?.policyBlockers ?? [],
    activationTrustBundleDigest: core.activationTrustBundle?.bindingDigest ?? null,
    activationTrustCheckoutCurrent: core.activationTrustBundle?.checkoutCurrent ?? false,
    activationTrustCheckoutDriftDigest: core.activationTrustBundle?.checkoutDriftDigest ?? null,
    activationTrustLockCurrent: core.activationTrustBundle?.lockCurrent ?? false,
    activationTrustBlockers: core.activationTrustBundle?.blockers ?? [],
    activationEvidence: core.activationEvidence,
    classBindings: [...core.classes.entries()].map(([id, item]) => ({
      id,
      profileDigest: item.profileDigest,
      networkPolicyCatalogDigest: item.networkPolicyCatalogDigest,
      isolationPolicyDigest: item.isolationPolicyDigest,
      permissionsDigest: item.permissionsDigest,
      containerImageDigest: item.containerImageDigest,
      oidcClaimPolicyDigest: item.oidcClaimPolicyDigest,
      oidcBrokerPolicyDigest: item.oidcBrokerPolicyDigest,
      receiptSigningPolicyDigest: item.receiptSigningPolicyDigest,
    })),
    declarationsComplete: core.declarationsComplete,
    coreActive: core.coreActive,
    blockers: core.blockers,
  }
}

function assertManagedCiCoreContextCurrent(core, now) {
  const current = loadManagedCiTrustedExecutionCore({ repoRoot: core.root, now })
  try {
    if (managedCiStableStringify(managedCiCoreRevalidationProjection(current))
      !== managedCiStableStringify(managedCiCoreRevalidationProjection(core))) {
      fail('managed CI core trust closure changed while raw carrier after-images were being validated')
    }
  } finally {
    managedCiCarrierValidationContexts.delete(current.activationTrustBundle)
  }
}

function validateManagedCiGovernanceCarrierAfterImages(core, now) {
  const context = managedCiCarrierValidationContexts.get(core.activationTrustBundle)
  if (!core.coreActive) {
    managedCiCarrierValidationContexts.delete(core.activationTrustBundle)
    return {
      status: 'not-verified',
      baselineCommit: context?.snapshot?.commit ?? null,
      baselineTree: context?.snapshot?.tree ?? null,
      carrierCommit: null,
      carrierTree: null,
      carrierPaths: [],
      blockers: ['raw governance carrier validation requires a fully verified active managed CI core'],
    }
  }
  let headBinding = null
  try {
    if (!context) {
      fail('raw carrier validation has no immutable executor-source context')
    }
    assertCanonicalGovernanceCarrierProjectionMap(context.carrierProjectionBindings)
    const expectedCarrierPaths = [
      EXTERNAL_ACTIVATION_CARRIER_PATH,
      PROVIDER_CERTIFICATION_CARRIER_PATH,
      REVIEW_CAPABILITY_CERTIFICATION_CARRIER_PATH,
    ].sort(compareUtf8Bytes)
    const capturedCarrierPaths = [...context.carrierCaptures.keys()].sort(compareUtf8Bytes)
    if (capturedCarrierPaths.length !== expectedCarrierPaths.length
      || capturedCarrierPaths.some((path, index) => path !== expectedCarrierPaths[index])) {
      fail('raw carrier capture closure is incomplete or contains extra paths')
    }

    headBinding = currentHeadCarrierBinding(core.root, context.snapshot, context.carrierCaptures)
    const baselineCertifications = context.snapshot.readJson(
      PROVIDER_CERTIFICATION_CARRIER_PATH,
      'managed CI immutable provider certification carrier',
    ).value
    const baselineReviewCapabilityCertifications = context.snapshot.readJson(
      REVIEW_CAPABILITY_CERTIFICATION_CARRIER_PATH,
      'managed CI immutable review capability certification carrier',
    ).value
    const currentCertifications = parseCapturedGovernanceCarrier(
      context.carrierCaptures.get(PROVIDER_CERTIFICATION_CARRIER_PATH),
      'provider certification',
    )
    const currentReviewCapabilityCertifications = parseCapturedGovernanceCarrier(
      context.carrierCaptures.get(REVIEW_CAPABILITY_CERTIFICATION_CARRIER_PATH),
      'review capability certification',
    )
    const snapshotJson = (path, label) => context.snapshot.readJson(path, label).value
    const inventory = snapshotJson(
      'infra/governance/inventory/managed-repos.json',
      'managed CI immutable repository inventory',
    )
    const desired = snapshotJson(
      'infra/governance/desired/github.json',
      'managed CI immutable GitHub desired state',
    )
    const issuerRegistryRead = context.snapshot.readJson(
      'infra/governance/trust/issuers.json',
      'managed CI immutable issuer registry',
    )
    const issuerRegistry = issuerRegistryRead.value
    const matrix = snapshotJson(
      'infra/governance/providers/compatibility-matrix.json',
      'managed CI immutable provider compatibility matrix',
    )
    const runtimeProfileRead = context.snapshot.readJson(
      'infra/governance/providers/runtime-conformance.json',
      'managed CI immutable runtime profile',
    )
    const runtimeProfile = runtimeProfileRead.value
    const roleSurfacePolicy = snapshotJson(
      'infra/governance/providers/role-surface-policy.json',
      'managed CI immutable role-surface policy',
    )
    const readImmutableRuntimeFile = path => context.snapshot.readFile(
      path,
      `managed CI immutable runtime Harness input ${path}`,
    )
    const hasImmutableRuntimeFile = path => {
      try {
        context.snapshot.identity(path)
        return true
      } catch {
        return false
      }
    }
    const immutableRuntimeIdentity = {
      gitCommit: context.snapshot.commit,
      gitTree: context.snapshot.tree,
      ...runtimeHarnessIdentityFromRepository({
        repoRoot: core.root,
        profile: runtimeProfile,
        profilePath: 'infra/governance/providers/runtime-conformance.json',
        readRepoFile: readImmutableRuntimeFile,
        hasRepoFile: hasImmutableRuntimeFile,
      }),
    }

    // External activation remains a captured, committed carrier for enterprise evidence and
    // model-broker readback, but its retired release-finalizer ceremony is not a managed-CI
    // activation gate. Enterprise staged-rollout validation owns its semantic contract.
    const providerChanged = managedCiStableStringify(baselineCertifications)
      !== managedCiStableStringify(currentCertifications)
    const reviewCapabilityChanged =
      managedCiStableStringify(baselineReviewCapabilityCertifications)
        !== managedCiStableStringify(currentReviewCapabilityCertifications)
    if (reviewCapabilityChanged) {
      if (!providerChanged) {
        fail('review capability certification carrier changed without its atomic provider runtime ledger')
      }
      validateProviderReviewCapabilityCertificationCarrierAfterImage({
        baselineProviderCertifications: baselineCertifications,
        currentProviderCertifications: currentCertifications,
        baselineReviewCapabilityCertifications,
        currentReviewCapabilityCertifications,
        repoRoot: core.root,
        inventory,
        desired,
        matrix,
        runtimeProfile,
        roleSurfacePolicy,
        issuerRegistry,
        runtimeIdentity: immutableRuntimeIdentity,
        now,
      })
    } else if (providerChanged) {
      validateExternalCertificationCarrierAfterImage({
        baselineLedger: baselineCertifications,
        currentLedger: currentCertifications,
        repoRoot: core.root,
        inventory,
        desired,
        matrix,
        runtimeProfile,
        roleSurfacePolicy,
        issuerRegistry,
        runtimeIdentity: immutableRuntimeIdentity,
        now,
      })
    }
    assertManagedCiCoreContextCurrent(core, now)
    assertCarrierValidationContextCurrent(core.root, context, headBinding)
    return {
      status: 'verified',
      baselineCommit: context.snapshot.commit,
      baselineTree: context.snapshot.tree,
      carrierCommit: headBinding.commit,
      carrierTree: headBinding.tree,
      carrierPaths: expectedCarrierPaths,
      blockers: [],
    }
  } catch (error) {
    return {
      status: 'not-verified',
      baselineCommit: context?.snapshot?.commit ?? null,
      baselineTree: context?.snapshot?.tree ?? null,
      carrierCommit: headBinding?.commit ?? null,
      carrierTree: headBinding?.tree ?? null,
      carrierPaths: [],
      blockers: [error instanceof Error ? error.message : String(error)],
    }
  } finally {
    if (core?.activationTrustBundle) {
      managedCiCarrierValidationContexts.delete(core.activationTrustBundle)
    }
  }
}

export function loadManagedCiTrustedExecutionPlan({
  repoRoot = process.cwd(),
  requireActivated = false,
  now = new Date(),
} = {}) {
  const core = loadManagedCiTrustedExecutionCore({ repoRoot, now })
  const carrierValidation = validateManagedCiGovernanceCarrierAfterImages(core, now)
  const blockers = [...new Set([...core.blockers, ...carrierValidation.blockers])]
  const carrierValidated = carrierValidation.status === 'verified'
  const state = {
    ...core,
    carrierValidation,
    carrierValidated,
    active: core.coreActive && carrierValidated,
    blockers,
  }
  if (requireActivated && !state.active) {
    fail(`managed CI is not activated:${state.blockers.join('; ')}`)
  }
  return state
}

export function managedCiActivationTrustProjection(planState) {
  if (!planState?.activationTrustBundle) fail('activation trust projection requires loaded managed CI state')
  const trust = planState.activationTrustBundle
  return {
    bindingDigest: trust.bindingDigest,
    filesDigest: trust.filesDigest,
    files: trust.files.map(item => ({ ...item })),
    fileDigests: { ...trust.fileDigests },
    gitTree: {
      ...trust.gitTree,
      files: trust.gitTree.files.map(item => ({ ...item })),
    },
    manifest: { ...trust.manifest },
    buildGraph: { ...trust.buildGraph },
    controlPlaneLock: { ...trust.controlPlaneLock },
    receiptBinding: trust.receiptBinding === null ? null : { ...trust.receiptBinding },
  }
}

export function managedCiExpectedImageSupplyChainBinding(planState, executionClass) {
  if (!planState?.executorSupplyChain) fail('image supply-chain binding requires loaded managed CI state')
  const imagePolicy = planState.executorSupplyChain.imageBindings[executionClass]
  const activation = planState.plan?.activation?.executionClasses?.[executionClass]
  if (!imagePolicy || !activation) fail(`image supply-chain execution class is invalid:${String(executionClass)}`)
  const source = planState.plan.activation
  if (!/^[a-f0-9]{40}$/.test(source.executorSourceCommit ?? '')
    || !/^[a-f0-9]{40}$/.test(source.executorSourceTree ?? '')
    || !/^[a-f0-9]{40}$/.test(source.builderWorkflowSha ?? '')
    || !/^[1-9][0-9]*$/.test(source.executorBuildRunId ?? '')
    || !Number.isInteger(source.executorBuildRunAttempt)
    || source.executorBuildRunAttempt < 1
    || !/^[1-9][0-9]*$/.test(source.imageSetArtifactId ?? '')
    || !/^[a-f0-9]{64}$/.test(source.imageSetArtifactDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(source.imageSetManifestSha256 ?? '')
    || !/^[a-f0-9]{64}$/.test(source.imageSetInventorySha256 ?? '')
    || source.imageSetInventoryEntryCount !== 18
    || source.imageSetArtifactRetentionDays !== 90
    || typeof source.verifiedAt !== 'string'
    || source.verificationReceipt === null
    || planState.activationEvidence?.status !== 'verified') {
    fail('image supply-chain activation source/verification is null, invalid, or not externally verified')
  }
  const requiredActivationFields = [
    'imageDigest',
    'runtimeSourceSha256',
    'runtimeInventoryDigest',
    'contextArchiveDigest',
    'sbomDigest',
    'slsaProvenanceDigest',
    'handoffPredicateDigest',
    'evidenceSetDigest',
    'provenanceBundleDigest',
    'provenanceAttestationId',
    'provenanceAttestationUrl',
    'provenanceRecordReadbackDigest',
    'sbomBundleDigest',
    'sbomAttestationId',
    'sbomAttestationUrl',
    'sbomRecordReadbackDigest',
    'handoffBundleDigest',
    'handoffAttestationId',
    'handoffAttestationUrl',
    'handoffRecordReadbackDigest',
    'registryReadbackDigest',
  ]
  if (requiredActivationFields.some(key => activation[key] === null)
    || Object.values(source.offlineEvidenceArchive).some(value => value === null)) {
    fail(`image supply-chain activation is incomplete:${executionClass}`)
  }
  const policy = planState.executorSupplyChain.policy
  const runtimeSource = planState.executorSupplyChain.executorBinarySources['run-class']
  const runtimePolicy = policy.builder.runtimeByteReadback
  const handoffPolicy = policy.builder.aggregateHandoff
  if (policy.builder.baseImage.version !== '24.14.0-bookworm-slim'
    || runtimePolicy.nodeVersion !== '24.14.0'
    || runtimePolicy.managedRuntimeSourcePath !== runtimeSource?.sourcePath
    || handoffPolicy.executionClassCount !== EXPECTED_CLASSES.length
    || handoffPolicy.inventoryEntryCount !== source.imageSetInventoryEntryCount
    || handoffPolicy.artifactFileCount !== 19
    || handoffPolicy.retentionDays !== source.imageSetArtifactRetentionDays
    || !runtimeSource
    || activation.runtimeSourceSha256 !== runtimeSource.sourceSha256
    || planState.executorSupplyChain.executorBinarySources['validate-provenance']?.sourceSha256 !== runtimeSource.sourceSha256) {
    fail(`image/SBOM runtime identity does not bind Node 24.14.0 and the exact final runtime bytes:${executionClass}`)
  }
  const attestationBinding = (kind, predicateType, predicateDigest) => {
    const attestationId = activation[`${kind}AttestationId`]
    const attestationUrl = activation[`${kind}AttestationUrl`]
    if (!/^[1-9][0-9]*$/.test(attestationId)
      || attestationUrl !== `https://github.com/${policy.source.repository}/attestations/${attestationId}`) {
      fail(`image supply-chain ${kind} attestation identity is invalid:${executionClass}`)
    }
    return {
      predicateType,
      predicateDigest,
      bundleFormat: policy.attestations.signature.bundleFormat,
      bundleDigest: activation[`${kind}BundleDigest`],
      attestationId,
      attestationUrl,
      recordReadbackDigest: activation[`${kind}RecordReadbackDigest`],
    }
  }
  const binding = {
    schemaVersion: 2,
    kind: 'managed-ci-image-supply-chain-binding-v2',
    executionClass,
    image: { subjectName: imagePolicy.subjectName, subjectDigest: activation.imageDigest },
    source: {
      repository: policy.source.repository,
      ref: policy.source.protectedRef,
      commit: source.executorSourceCommit,
      tree: source.executorSourceTree,
    },
    builder: {
      workflowRef: policy.builder.workflowRef,
      workflowSha: source.builderWorkflowSha,
      runId: source.executorBuildRunId,
      runAttempt: source.executorBuildRunAttempt,
      event: policy.builder.trigger.eventName,
      activityType: policy.builder.trigger.activityType,
      runnerEnvironment: policy.builder.runnerEnvironment,
      buildType: policy.builder.buildType,
    },
    build: {
      platform: policy.builder.platform,
      runnerArchitecture: policy.builder.runnerArchitecture,
      network: policy.builder.buildNetwork,
      target: imagePolicy.target,
      baseImageSubjectName: policy.builder.baseImage.subjectName,
      baseImageSubjectDigest: policy.builder.baseImage.subjectDigest,
      dockerfileFrontend: structuredClone(policy.builder.dockerfileFrontend),
      buildx: structuredClone(policy.builder.buildx),
      buildkit: structuredClone(policy.builder.buildkit),
      syft: structuredClone(policy.builder.syft),
      recipePath: policy.source.recipePath,
      recipeDigest: planState.executorSupplyChain.recipeDigest,
      contextArchiveDigest: activation.contextArchiveDigest,
      contextDigest: planState.executorSupplyChain.buildContext.digest,
      materialsDigest: planState.executorSupplyChain.materials.digest,
    },
    runtime: {
      nodeVersion: runtimePolicy.nodeVersion,
      runtimeSourceSha256: activation.runtimeSourceSha256,
      runtimeInventoryDigest: activation.runtimeInventoryDigest,
    },
    attestations: {
      provenance: attestationBinding(
        'provenance',
        policy.attestations.provenance.predicateType,
        activation.slsaProvenanceDigest,
      ),
      sbom: attestationBinding('sbom', policy.attestations.sbom.predicateType, activation.sbomDigest),
      handoff: attestationBinding(
        'handoff',
        'https://qijenchen.dev/attestations/managed-ci-image-handoff/v2',
        activation.handoffPredicateDigest,
      ),
    },
    signatureIdentity: {
      certificateIssuer: policy.attestations.signature.certificateIssuer,
      certificateIdentity: policy.attestations.signature.certificateIdentity,
    },
    aggregateHandoff: {
      executionClassCount: handoffPolicy.executionClassCount,
      artifactId: source.imageSetArtifactId,
      artifactDigest: source.imageSetArtifactDigest,
      manifestSha256: source.imageSetManifestSha256,
      inventorySha256: source.imageSetInventorySha256,
      inventoryEntryCount: handoffPolicy.inventoryEntryCount,
      artifactFileCount: handoffPolicy.artifactFileCount,
      artifactRetentionDays: handoffPolicy.retentionDays,
      storageClass: handoffPolicy.githubArtifactStorageClass,
    },
    evidenceSet: {
      digest: activation.evidenceSetDigest,
      imageSetArtifact: {
        id: source.imageSetArtifactId,
        digest: source.imageSetArtifactDigest,
        manifestSha256: source.imageSetManifestSha256,
      },
      offlineArchive: structuredClone(source.offlineEvidenceArchive),
    },
    verification: {
      verifiedAt: source.verifiedAt,
      independentVerifierRequired: true,
      activationVerificationStatus: planState.activationEvidence.status,
      activationVerificationReceiptDigest: planState.activationEvidence.receiptDigest,
      activationVerificationIssuerKeyIds: [...planState.activationEvidence.issuerKeyIds].sort(),
      activationVerificationIssuerSubjects: [...planState.activationEvidence.issuerSubjects].sort(),
      activationVerificationQuorum: planState.trust.receiptPolicy.quorum,
      activationVerificationReceiptExpiresAt: source.verificationReceipt.expiresAt,
      activationVerificationReplayRetentionUntil: source.verificationReceipt.replay.retentionUntil,
      activationVerificationIssuerRegistryDigest: source.verificationReceipt.issuerRegistryDigest,
      activationVerificationTrustBindingDigest: source.verificationReceipt.trustBinding.bindingDigest,
      receiptSignerTrustReadbackDigest: source.receiptSignerTrustReadbackDigest,
      registryReadbackDigest: activation.registryReadbackDigest,
    },
  }
  return { ...binding, bindingDigest: managedCiSha256(managedCiStableStringify(binding)) }
}

export function managedCiExpectedHostSandboxPolicyBinding(planState, executionClass) {
  if (!planState?.executorSupplyChain || !planState?.trustedAuthority) fail('host sandbox binding requires loaded managed CI state')
  if (!EXPECTED_CLASSES.includes(executionClass)) fail(`host sandbox execution class is invalid:${String(executionClass)}`)
  const sandbox = planState.executorSupplyChain.policy.hostSandbox
  const binding = {
    schemaVersion: 1,
    kind: 'managed-ci-host-sandbox-policy-binding-v1',
    executionClass,
    policyDigest: planState.executorSupplyChain.hostSandboxPolicyDigest,
    authorityPolicyDigest: planState.trustedAuthority.digest,
    candidateBoundaryDigest: planState.trustedAuthority.candidateBoundaryDigest,
    launcherSourceDigest: planState.executorSupplyChain.externalDeployments.hostSandboxLauncher.sourceSha256,
    classAdapterControlPlaneDigest: planState.executorSupplyChain.controlPlane.digest,
    launcherDeployment: structuredClone(planState.executorSupplyChain.externalDeployments.hostSandboxLauncher),
    runnerLabels: [...sandbox.runnerLabels],
    enforcementAuthority: sandbox.enforcementAuthority,
    containerEngine: sandbox.containerEngine,
    mounts: {
      candidate: { ...sandbox.candidateMount },
      input: { ...sandbox.inputMount },
      output: { ...sandbox.outputMount },
      receipt: { ...sandbox.receiptMount },
      controlPlane: { ...sandbox.controlPlaneMount },
    },
    kernelControls: { ...sandbox.kernelControls },
    egress: {
      enforcement: sandbox.egress.enforcement,
      dnsThroughProxyOnly: sandbox.egress.dnsThroughProxyOnly,
      directInternetDenied: sandbox.egress.directInternetDenied,
      tlsRequired: sandbox.egress.tlsRequired,
      classPolicy: structuredClone(sandbox.egress.classPolicies[executionClass]),
    },
    negativeProbes: [...sandbox.independentNegativeProbes],
  }
  return { ...binding, bindingDigest: managedCiSha256(managedCiStableStringify(binding)) }
}

const HOST_OBSERVATION_PROBE_KEYS = Object.freeze([
  'candidateWriteDenied', 'undeclaredWriteDenied', 'rawSocketDenied', 'directInternetDenied',
  'unlistedHostDenied', 'containerEngineSocketAbsent', 'hostNamespaceDenied', 'ambientSecretAbsent',
])

export function managedCiHostSandboxObservationPayload(observation) {
  const expectedKeys = [
    'schemaVersion', 'kind', 'executionClass', 'workflowRunId', 'runAttempt', 'policyBinding',
    'receiptDigest', 'issuerKeyId', 'issuerSubject', 'signatureAlgorithm', 'signature', 'observedAt',
    'networkNamespaceDigest', 'firewallPolicyDigest', 'egressProxyPolicyDigest', 'mountTableDigest',
    'negativeProbeDigest', 'negativeProbes',
  ].sort()
  exactArray(Object.keys(observation ?? {}).sort(), expectedKeys, 'host sandbox observation shape')
  if (observation.schemaVersion !== 1 || observation.kind !== 'managed-ci-host-sandbox-independent-observation-v1'
    || !EXPECTED_CLASSES.includes(observation.executionClass) || observation.signatureAlgorithm !== 'Ed25519') {
    fail('host sandbox observation identity is invalid')
  }
  exactArray(Object.keys(observation.negativeProbes ?? {}).sort(), [...HOST_OBSERVATION_PROBE_KEYS].sort(), 'host sandbox negative-probe shape')
  if (HOST_OBSERVATION_PROBE_KEYS.some(key => observation.negativeProbes[key] !== true)) fail('host sandbox negative probe did not deny the capability')
  const digestFields = ['receiptDigest', 'networkNamespaceDigest', 'firewallPolicyDigest', 'egressProxyPolicyDigest', 'mountTableDigest', 'negativeProbeDigest']
  if (digestFields.some(key => !/^[a-f0-9]{64}$/.test(observation[key] ?? ''))) fail('host sandbox observation digest is invalid')
  const payload = Object.fromEntries(planHostObservationSignedFields(observation).map(key => [key, structuredClone(observation[key])]))
  return payload
}

function planHostObservationSignedFields(observation) {
  const expected = [
    'schemaVersion', 'kind', 'executionClass', 'workflowRunId', 'runAttempt', 'policyBinding',
    'observedAt', 'networkNamespaceDigest', 'firewallPolicyDigest', 'egressProxyPolicyDigest',
    'mountTableDigest', 'negativeProbeDigest', 'negativeProbes', 'issuerKeyId', 'issuerSubject',
  ]
  return expected.filter(key => key in observation)
}

export function managedCiHostSandboxObservationSigningBytes(planState, observation) {
  if (!planState?.trustedAuthority) fail('host observation signing requires loaded trusted authority state')
  exactArray(planState.trustedAuthority.policy.hostObservation.signedFields, planHostObservationSignedFields(observation), 'host observation signed-field contract')
  const payload = managedCiHostSandboxObservationPayload(observation)
  return Buffer.from(`${planState.trustedAuthority.policy.hostObservation.payloadDomainSeparator}\0${managedCiStableStringify(payload)}`, 'utf8')
}

export function managedCiHostSandboxObservationReceiptDigest(planState, observation) {
  return managedCiSha256(managedCiHostSandboxObservationSigningBytes(planState, observation))
}

export function managedCiVerifyHostSandboxObservation(planState, observation) {
  const receiptDigest = managedCiHostSandboxObservationReceiptDigest(planState, observation)
  if (observation.receiptDigest !== receiptDigest) fail('host sandbox observation receipt digest is detached')
  const signatureBytes = Buffer.from(observation.signature ?? '', 'base64url')
  if (signatureBytes.length !== 64 || signatureBytes.toString('base64url') !== observation.signature) {
    fail('host sandbox observation signature is not canonical Ed25519 base64url')
  }
  const registry = readJsonFile(planState.root, planState.plan.trust.issuerRegistryPath, 'host sandbox observation issuer registry').value
  validateIssuerRegistry(registry)
  const issuer = registry.issuers.find(candidate => candidate.keyId === observation.issuerKeyId)
  const role = planState.trustedAuthority.policy.hostObservation.issuerRole
  if (!issuer || issuer.subject !== observation.issuerSubject || !issuer.roles.includes(role)) {
    fail('host sandbox observation issuer is not exactly authorized')
  }
  const observedAt = Date.parse(observation.observedAt)
  const notBefore = Date.parse(issuer.notBefore)
  const notAfter = Date.parse(issuer.notAfter)
  const revokedAt = issuer.revokedAt === null ? null : Date.parse(issuer.revokedAt)
  if (!(notBefore <= observedAt && observedAt < notAfter) || (revokedAt !== null && revokedAt <= observedAt)) {
    fail('host sandbox observation issuer was not valid at the historical observation instant')
  }
  if (!verify(null, managedCiHostSandboxObservationSigningBytes(planState, observation), publicKeyFromIssuer(issuer), signatureBytes)) {
    fail('host sandbox observation signature is invalid')
  }
  const expectedPolicyBinding = managedCiExpectedHostSandboxPolicyBinding(planState, observation.executionClass)
  if (managedCiStableStringify(observation.policyBinding) !== managedCiStableStringify(expectedPolicyBinding)) {
    fail('host sandbox observation policy binding differs from the canonical execution-class policy')
  }
  return true
}

export function managedCiExpectedReceiptSignerAuthorityBinding(planState) {
  if (!planState?.trustedAuthority || !planState?.oidcBrokerPolicy || !planState?.executorSupplyChain) fail('receipt signer binding requires loaded managed CI state')
  const signer = planState.trustedAuthority.policy.receiptSigner
  const authorityClient = planState.executorSupplyChain.externalDeployments.authorityClient
  const payloadSchema = readFileSync(safeRegularFile(planState.root, signer.payloadSchemaPath, 'receipt signer payload schema'))
  const rawReceiptSchema = readFileSync(safeRegularFile(
    planState.root,
    signer.rawReceiptValidation.schemaPath,
    'receipt signer raw receipt schema',
  ))
  const finalizationProtocolSchema = readFileSync(safeRegularFile(
    planState.root,
    signer.finalizationProtocol.schemaPath,
    'receipt signer finalization protocol schema',
  ))
  const issuerRegistryBytes = readFileSync(safeRegularFile(
    planState.root,
    signer.issuerRegistryPath,
    'receipt signer issuer registry deployment source',
  ))
  const validatorSource = readFileSync(safeRegularFile(
    planState.root,
    signer.rawReceiptValidation.validatorSourcePath,
    'receipt signer raw receipt validator source',
  ))
  const validatorSourceSha256 = managedCiSha256(validatorSource)
  if (validatorSourceSha256 !== signer.rawReceiptValidation.validatorSourceSha256) {
    fail('receipt signer raw receipt validator source differs from the trusted policy SHA-256')
  }
  const finalizationProtocolSchemaSha256 = managedCiSha256(finalizationProtocolSchema)
  if (finalizationProtocolSchemaSha256 !== signer.finalizationProtocol.schemaSha256) {
    fail('receipt signer finalization protocol schema differs from the trusted policy SHA-256')
  }
  exactValue(authorityClient.supportFiles, [{
    sourcePath: signer.issuerRegistryPath,
    installPath: signer.issuerRegistryInstallPath,
    sourceSha256: managedCiSha256(issuerRegistryBytes),
  }], 'receipt signer content-addressed issuer registry deployment')
  exactValue(signer.transportAttestation, {
    domainSeparator: 'qijenchen:managed-ci:finalization-transport-attestation:v1',
    issuerRole: signer.issuerRole,
    requestBound: true,
    finalizedReceiptSetBound: true,
    signatureAlgorithm: signer.signatureAlgorithm,
    requiredBeforeMaterialization: true,
  }, 'receipt signer finalization transport attestation contract')
  const binding = {
    schemaVersion: 1,
    kind: 'managed-ci-receipt-signer-authority-binding-v1',
    serviceId: signer.serviceId,
    tenantId: signer.tenantId,
    endpointHost: signer.endpointHost,
    transport: signer.transport,
    keyIdentity: signer.keyIdentity,
    certificateIdentity: signer.certificateIdentity,
    signatureAlgorithm: signer.signatureAlgorithm,
    issuerRegistryPath: signer.issuerRegistryPath,
    issuerRegistryInstallPath: signer.issuerRegistryInstallPath,
    issuerRole: signer.issuerRole,
    oidcTrustPolicyPath: signer.oidcTrustPolicyPath,
    oidcTrustPolicyDigest: planState.oidcBrokerPolicy.digest,
    allowedWorkflowRef: signer.allowedWorkflowRef,
    allowedEnvironment: signer.allowedEnvironment,
    payloadSchemaPath: signer.payloadSchemaPath,
    payloadSchemaDigest: managedCiSha256(payloadSchema),
    payloadDomainSeparator: signer.payloadDomainSeparator,
    transportAttestation: structuredClone(signer.transportAttestation),
    finalizationProtocol: structuredClone(signer.finalizationProtocol),
    rawReceiptValidation: {
      ...structuredClone(signer.rawReceiptValidation),
      schemaDigest: managedCiSha256(rawReceiptSchema),
    },
    authorityClientDeployment: structuredClone(authorityClient),
    receiptSignerPolicyDigest: planState.trustedAuthority.receiptSignerPolicyDigest,
    auditLog: structuredClone(signer.auditLog),
  }
  return { ...binding, bindingDigest: managedCiSha256(managedCiStableStringify(binding)) }
}

export function managedCiExpectedFinalizationTransportContract(planState) {
  if (!planState?.trustedAuthority) fail('finalization transport contract requires loaded managed CI authority state')
  const protocol = planState.trustedAuthority.policy.receiptSigner.finalizationProtocol
  const expected = authorityFinalizationTransportContract()
  if (protocol.gatewayEndpointHost !== expected.clientToGateway.endpointHost
    || protocol.gatewayOperationPath !== expected.clientToGateway.operationPath
    || protocol.gatewayCertificateIdentity !== expected.gatewayToSigner.gatewayClientCertificateIdentity
    || protocol.requestKind !== 'managed-ci-authority-finalization-request-v1'
    || protocol.responseKind !== 'managed-ci-authority-finalization-response-v1'
    || protocol.finalizedReceiptSetKind !== 'managed-ci-finalized-receipt-set-v1'
    || protocol.transportContractKind !== expected.kind
    || protocol.transportReadbackKind !== 'managed-ci-finalization-transport-readback-v1') {
    fail('finalization protocol policy differs from the authority client two-hop transport contract')
  }
  return structuredClone(expected)
}

export function managedCiFinalizedReceiptSetDigest(value) {
  return authorityFinalizedReceiptSetDigest(value)
}

export function managedCiFinalizationTransportReadbackDigest(value) {
  return authorityFinalizationTransportReadbackDigest(value)
}

export function managedCiValidateFinalizationTransportReadback(planState, readback, {
  requestSha256,
  finalizedReceiptSetDigest,
  latestSignedAt,
  signerIssuerMapping,
} = {}) {
  if (!/^[a-f0-9]{64}$/.test(requestSha256 ?? '')
    || !/^[a-f0-9]{64}$/.test(finalizedReceiptSetDigest ?? '')
    || !canonicalUtcTimestamp(latestSignedAt)
    || !signerIssuerMapping) {
    fail('finalization transport validation context is invalid')
  }
  const authority = managedCiExpectedReceiptSignerAuthorityBinding(planState)
  const transportContract = managedCiExpectedFinalizationTransportContract(planState)
  const expectedIssuerMapping = managedCiExpectedReceiptSignerIssuerMapping(
    planState,
    signerIssuerMapping,
  )
  exactValue(
    signerIssuerMapping,
    expectedIssuerMapping,
    'finalization transport signer issuer mapping',
  )
  const signerIssuerRegistry = readJsonFile(
    planState.root,
    planState.trustedAuthority.policy.receiptSigner.issuerRegistryPath,
    'finalization transport signer issuer registry',
  ).value
  validateIssuerRegistry(signerIssuerRegistry)
  validateAuthorityFinalizationTransportReadback(readback, {
    request: { transportContract },
    requestSha256,
    finalizedReceiptSetDigest,
    signerAuthorityBindingDigest: authority.bindingDigest,
    signerIssuerMapping: expectedIssuerMapping,
    signerIssuerRegistry,
    latestSignedAt: new Date(latestSignedAt),
  })
  return true
}

export function managedCiExpectedReceiptSignerIssuerMapping(planState, { issuerKeyId, issuerSubject } = {}) {
  if (!planState?.trustedAuthority || !planState?.trust) fail('receipt signer issuer mapping requires loaded managed CI state')
  if (typeof issuerKeyId !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(issuerKeyId)
    || typeof issuerSubject !== 'string' || !issuerSubject) fail('receipt signer issuer identity is invalid')
  const signer = planState.trustedAuthority.policy.receiptSigner
  const registry = readJsonFile(planState.root, signer.issuerRegistryPath, 'receipt signer issuer registry').value
  const matches = registry.issuers.filter(issuer => issuer.keyId === issuerKeyId)
  if (matches.length !== 1 || matches[0].subject !== issuerSubject
    || !matches[0].roles.includes(signer.issuerRole)) fail('receipt signer issuer is not exactly mapped in the canonical registry')
  if (issuerSubject !== signer.certificateIdentity) fail('receipt signer issuer subject differs from the signer certificate identity')
  return {
    issuerKeyId,
    issuerSubject,
    issuerRegistryDigest: issuerRegistryDigest(registry),
    issuerRole: signer.issuerRole,
    keyIdentity: signer.keyIdentity,
    certificateIdentity: signer.certificateIdentity,
  }
}

function finalizedReceiptPayload(planState, payload, { issuerMapping } = {}) {
  if (!planState?.trustedAuthority || !planState?.root) fail('receipt signing payload requires loaded managed CI authority state')
  const signer = planState.trustedAuthority.policy.receiptSigner
  if (signer.payloadSchemaPath !== MANAGED_CI_FINALIZED_RECEIPT_SCHEMA_PATH) {
    fail('receipt signer payload schema differs from the canonical finalized-receipt schema')
  }
  const schema = readJsonFile(planState.root, signer.payloadSchemaPath, 'finalized receipt payload schema').value
  validateJson(payload, schema, 'finalized receipt payload')
  const rawSchemaDigest = managedCiSha256(readFileSync(safeRegularFile(
    planState.root,
    MANAGED_CI_RAW_RECEIPT_SCHEMA_PATH,
    'managed CI raw receipt schema',
  )))
  if (payload.rawReceiptSchemaDigest !== rawSchemaDigest) fail('finalized receipt raw schema digest differs from canonical bytes')
  if (!canonicalUtcTimestamp(payload.signedAt)) fail('finalized receipt signedAt is not canonical UTC')
  const classState = managedCiExecutionClassForEvidenceKind(planState, payload.evidenceKind)
  if (classState.executionClass.id !== payload.executionClass) fail('finalized receipt evidence kind is detached from its execution class')
  const authority = managedCiExpectedReceiptSignerAuthorityBinding(planState)
  if (payload.signerAuthorityBindingDigest !== authority.bindingDigest) fail('finalized receipt is detached from the canonical signer authority')
  const expectedMapping = managedCiExpectedReceiptSignerIssuerMapping(planState, issuerMapping)
  exactValue(issuerMapping, expectedMapping, 'finalized receipt signer issuer mapping')
  const mappingDigest = managedCiSha256(managedCiStableStringify(expectedMapping))
  if (payload.issuerMappingDigest !== mappingDigest) fail('finalized receipt is detached from the canonical signer issuer mapping')
  return structuredClone(payload)
}

function digestBoundObject(value, digestField, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is missing`)
  const { [digestField]: observedDigest, ...unsigned } = value
  const expectedDigest = managedCiSha256(managedCiStableStringify(unsigned))
  if (observedDigest !== expectedDigest) fail(`${label} ${digestField} differs from its canonical projection`)
  return observedDigest
}

function managedCiRawReceiptTrustExpectation(planState) {
  const registry = readJsonFile(
    planState.root,
    planState.plan.trust.issuerRegistryPath,
    'managed CI raw receipt issuer registry',
  ).value
  validateIssuerRegistry(registry)
  const runtimePolicy = readJsonFile(
    planState.root,
    planState.plan.trust.runtimeEvidencePolicyPath,
    'managed CI raw receipt runtime policy',
  )
  const runtimeBinding = planState.trust.bindings.find(
    item => item.path === planState.plan.trust.runtimeEvidencePolicyPath,
  )
  if (!runtimeBinding || runtimeBinding.sha256 !== managedCiSha256(runtimePolicy.bytes)
    || runtimePolicy.value.issuerRegistryDigest !== issuerRegistryDigest(registry)
    || !Number.isSafeInteger(runtimePolicy.value.requiredIssuerQuorum)
    || runtimePolicy.value.requiredIssuerQuorum < 1
    || runtimePolicy.value.requiredIssuerQuorum > 5) {
    fail('raw receipt runtime trust projection is invalid')
  }
  return {
    issuerRegistryDigest: issuerRegistryDigest(registry),
    runtimePolicyDigest: runtimeBinding.sha256,
    requiredIssuerQuorum: runtimePolicy.value.requiredIssuerQuorum,
    allowedIssuerKeyIds: [...runtimePolicy.value.allowedKeyIds],
    issuerSubjectsByKeyId: Object.fromEntries(
      registry.issuers.map(issuer => [issuer.keyId, issuer.subject]),
    ),
  }
}

export function managedCiExpectedAttestedRunnerEnvironment(planOrState) {
  const runnerEnvironment = planOrState?.plan?.workflow?.runnerEnvironment
    ?? planOrState?.workflow?.runnerEnvironment
  if (runnerEnvironment === 'self-hosted') return 'self-hosted-attested'
  if (runnerEnvironment === 'github-hosted') return 'github-hosted'
  fail(`managed CI runner environment cannot project to an attested receipt:${String(runnerEnvironment)}`)
}

function managedCiRawReceiptValidationExpected(planState, {
  evidenceKind,
  workflowRunId,
  runAttempt,
  provenanceBinding,
  rawReceiptContext,
  selectedProvider,
} = {}) {
  const contextKeys = [
    'manifestVerificationDigest',
    'dependencyLockfileSha256',
    'dependencyBundleDigest',
    'evidenceEnvelopeDigest',
    'oidcClaimsDigest',
    'generatedOutputClosureDigest',
  ]
  if (!rawReceiptContext || typeof rawReceiptContext !== 'object' || Array.isArray(rawReceiptContext)
    || managedCiStableStringify(Object.keys(rawReceiptContext).sort()) !== managedCiStableStringify(contextKeys.sort())
    || !/^[a-f0-9]{64}$/.test(rawReceiptContext.manifestVerificationDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(rawReceiptContext.dependencyLockfileSha256 ?? '')
    || (rawReceiptContext.dependencyBundleDigest !== null
      && !/^[a-f0-9]{64}$/.test(rawReceiptContext.dependencyBundleDigest ?? ''))
    || !/^[a-f0-9]{64}$/.test(rawReceiptContext.evidenceEnvelopeDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(rawReceiptContext.oidcClaimsDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(rawReceiptContext.generatedOutputClosureDigest ?? '')) {
    fail('raw receipt trusted validation context is invalid or open')
  }
  return {
    manifestVerificationDigest: rawReceiptContext.manifestVerificationDigest,
    dependencyLockfileSha256: rawReceiptContext.dependencyLockfileSha256,
    dependencyBundleDigest: rawReceiptContext.dependencyBundleDigest,
    activeRun: {
      runId: provenanceBinding.auditedSubjectRunId,
      manifestSha256: provenanceBinding.auditedManifestSha256,
      head: provenanceBinding.auditedSubjectCommit,
      tree: provenanceBinding.auditedSubjectTree,
    },
    receiptBinding: managedCiExpectedRawReceiptBinding(planState, {
      evidenceKind,
      selectedProvider,
    }),
    workflow: {
      repository: provenanceBinding.workflowRepository,
      path: provenanceBinding.workflowPath,
      runId: workflowRunId,
      runAttempt,
      event: provenanceBinding.workflowEvent,
      head: provenanceBinding.auditedSubjectCommit,
      tree: provenanceBinding.auditedSubjectTree,
    },
    runnerEnvironment: managedCiExpectedAttestedRunnerEnvironment(planState),
    evidenceEnvelopeDigest: rawReceiptContext.evidenceEnvelopeDigest,
    oidcClaimsDigest: rawReceiptContext.oidcClaimsDigest,
    generatedOutputClosureDigest: rawReceiptContext.generatedOutputClosureDigest,
    maxAgeSeconds: planState.plan.observation.maxAgeSeconds,
  }
}

function managedCiReceiptSigningPayloadFromValidation(planState, {
  evidenceKind,
  workflowRunId,
  runAttempt,
  rawReceiptValidationReadback,
  provenanceBinding,
  receiptBinding,
  frozenSubjectReadback,
  hostObservation,
  imageSupplyChainBinding,
  issuerMapping,
  signedAt,
  rawReceiptProjection,
  selectedProvider = null,
  modelRelease = null,
  allowTrustedActivationCore = false,
} = {}) {
  const classState = managedCiExecutionClassForEvidenceKind(planState, evidenceKind)
  const executionClass = classState.executionClass.id
  if (typeof workflowRunId !== 'string' || !/^[1-9][0-9]*$/.test(workflowRunId)
    || !Number.isSafeInteger(runAttempt) || runAttempt < 1
    || !canonicalUtcTimestamp(signedAt)) fail('receipt signing run/raw receipt/schema/time binding is invalid')

  const rawReceiptSchemaDigest = managedCiSha256(readFileSync(safeRegularFile(
    planState.root,
    MANAGED_CI_RAW_RECEIPT_SCHEMA_PATH,
    'managed CI raw receipt schema',
  )))
  const rawTrust = managedCiRawReceiptTrustExpectation(planState)
  const rawReceiptBindingDigest = managedCiSha256(managedCiStableStringify(
    managedCiExpectedRawReceiptBinding(planState, {
      evidenceKind,
      selectedProvider,
      allowTrustedActivationCore,
    }),
  ))
  if (!rawReceiptProjection || typeof rawReceiptProjection !== 'object'
    || Array.isArray(rawReceiptProjection)
    || managedCiStableStringify(Object.keys(rawReceiptProjection).sort())
      !== managedCiStableStringify(['evidenceEnvelopeDigest', 'generatedOutputClosureDigest', 'oidcClaimsDigest'])
    || !/^[a-f0-9]{64}$/.test(rawReceiptProjection.evidenceEnvelopeDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(rawReceiptProjection.oidcClaimsDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(rawReceiptProjection.generatedOutputClosureDigest ?? '')) {
    fail('raw receipt validation projection is invalid or open')
  }
  validateManagedCiRawReceiptValidationReadback(rawReceiptValidationReadback, {
    expected: {
      executionClass,
      evidenceKind,
      workflowRunId,
      runAttempt,
      rawReceiptPath: `${executionClass}.json`,
      rawReceiptSchemaDigest,
      issuerRegistryDigest: rawTrust.issuerRegistryDigest,
      runtimePolicyDigest: rawTrust.runtimePolicyDigest,
      requiredIssuerQuorum: rawTrust.requiredIssuerQuorum,
      verifiedAt: signedAt,
      evidenceEnvelopeDigest: rawReceiptProjection.evidenceEnvelopeDigest,
      oidcClaimsDigest: rawReceiptProjection.oidcClaimsDigest,
      generatedOutputClosureDigest: rawReceiptProjection.generatedOutputClosureDigest,
      rawReceiptBindingDigest,
    },
  })
  const rawReceiptValidationDigest = managedCiSha256(
    managedCiStableStringify(rawReceiptValidationReadback),
  )

  const provenanceBindingDigest = digestBoundObject(provenanceBinding, 'provenanceBindingDigest', 'receipt signing provenance binding')
  if (provenanceBinding.workflowRunId !== workflowRunId || provenanceBinding.runAttempt !== runAttempt) {
    fail('receipt signing provenance is detached from the workflow run')
  }
  const expectedReceiptBinding = managedCiExpectedReceiptBinding(planState, {
    evidenceKind,
    selectedProvider,
    modelRelease,
    allowTrustedActivationCore,
  })
  exactValue(receiptBinding, expectedReceiptBinding, 'receipt signing execution-class receipt binding')
  const receiptBindingDigest = managedCiSha256(managedCiStableStringify(expectedReceiptBinding))

  const frozenSubjectReadbackDigest = digestBoundObject(frozenSubjectReadback, 'readbackDigest', 'receipt signing frozen-subject readback')
  if (frozenSubjectReadback.executionClass !== executionClass) fail('receipt signing frozen-subject readback is detached from its execution class')

  managedCiVerifyHostSandboxObservation(planState, hostObservation)
  const hostObservationReceiptDigest = managedCiHostSandboxObservationReceiptDigest(planState, hostObservation)
  if (hostObservation.receiptDigest !== hostObservationReceiptDigest
    || hostObservation.executionClass !== executionClass
    || hostObservation.workflowRunId !== workflowRunId
    || hostObservation.runAttempt !== runAttempt
    || frozenSubjectReadback.hostObservationReceiptDigest !== hostObservationReceiptDigest) {
    fail('receipt signing host observation is detached from the class/run/frozen-subject readback')
  }

  const expectedImageBinding = managedCiExpectedImageSupplyChainBinding(planState, executionClass)
  exactValue(imageSupplyChainBinding, expectedImageBinding, 'receipt signing image supply-chain binding')
  const imageSupplyChainBindingDigest = expectedImageBinding.bindingDigest
  const authority = managedCiExpectedReceiptSignerAuthorityBinding(planState)
  const expectedMapping = managedCiExpectedReceiptSignerIssuerMapping(planState, issuerMapping)
  exactValue(issuerMapping, expectedMapping, 'receipt signing issuer mapping')
  const rawIssuerSubjects = rawReceiptValidationReadback.verifiedIssuerKeyIds.map(keyId => {
    if (!rawTrust.allowedIssuerKeyIds.includes(keyId)
      || typeof rawTrust.issuerSubjectsByKeyId[keyId] !== 'string') {
      fail('raw receipt validation readback contains an issuer outside the runtime policy')
    }
    return rawTrust.issuerSubjectsByKeyId[keyId]
  }).sort()
  if (managedCiStableStringify(rawIssuerSubjects)
      !== managedCiStableStringify(rawReceiptValidationReadback.verifiedIssuerSubjects)
    || rawReceiptValidationReadback.verifiedIssuerKeyIds.includes(expectedMapping.issuerKeyId)
    || rawReceiptValidationReadback.verifiedIssuerSubjects.includes(expectedMapping.issuerSubject)) {
    fail('raw receipt issuers are detached from the registry or not independent of the final receipt signer')
  }

  const payload = {
    schemaVersion: 1,
    kind: 'managed-ci-finalized-receipt-v1',
    executionClass,
    evidenceKind,
    workflowRunId,
    runAttempt,
    rawReceiptDigest: rawReceiptValidationReadback.rawReceiptDigest,
    rawReceiptSchemaDigest,
    rawReceiptValidationDigest,
    provenanceBindingDigest,
    receiptBindingDigest,
    frozenSubjectReadbackDigest,
    hostObservationReceiptDigest,
    imageSupplyChainBindingDigest,
    signerAuthorityBindingDigest: authority.bindingDigest,
    issuerMappingDigest: managedCiSha256(managedCiStableStringify(expectedMapping)),
    signedAt,
  }
  return finalizedReceiptPayload(planState, payload, { issuerMapping: expectedMapping })
}

/**
 * Builds the only material the external receipt signer is allowed to sign.
 * The raw receipt bytes are parsed and independently verified here; callers
 * cannot substitute a pre-hashed receipt or a caller-authored validation
 * readback while retaining the same signing payload.
 */
export function managedCiReceiptSigningMaterial(planState, {
  evidenceKind,
  workflowRunId,
  runAttempt,
  rawReceiptBytes,
  rawReceiptPath,
  rawReceiptContext,
  provenanceBinding,
  receiptBinding,
  frozenSubjectReadback,
  hostObservation,
  imageSupplyChainBinding,
  issuerMapping,
  signedAt,
  selectedProvider = null,
  modelRelease = null,
} = {}) {
  const classState = managedCiExecutionClassForEvidenceKind(planState, evidenceKind)
  const executionClass = classState.executionClass.id
  if (rawReceiptPath !== `${executionClass}.json`) {
    fail('raw receipt path differs from the canonical execution-class path')
  }
  const provenanceBindingDigest = digestBoundObject(
    provenanceBinding,
    'provenanceBindingDigest',
    'receipt signing provenance binding',
  )
  if (!provenanceBindingDigest
    || provenanceBinding.workflowRunId !== workflowRunId
    || provenanceBinding.runAttempt !== runAttempt) {
    fail('raw receipt provenance is detached from the workflow run')
  }
  const expected = managedCiRawReceiptValidationExpected(planState, {
    evidenceKind,
    workflowRunId,
    runAttempt,
    provenanceBinding,
    rawReceiptContext,
    selectedProvider,
  })
  const rawReceiptValidationReadback = validateManagedCiSandboxReceipt({
    rawBytes: rawReceiptBytes,
    rawReceiptPath,
    repoRoot: planState.root,
    now: new Date(signedAt),
    expected,
  })
  const payload = managedCiReceiptSigningPayloadFromValidation(planState, {
    evidenceKind,
    workflowRunId,
    runAttempt,
    rawReceiptValidationReadback,
    provenanceBinding,
    receiptBinding,
    frozenSubjectReadback,
    hostObservation,
    imageSupplyChainBinding,
    issuerMapping,
    signedAt,
    rawReceiptProjection: {
      evidenceEnvelopeDigest: rawReceiptContext.evidenceEnvelopeDigest,
      oidcClaimsDigest: rawReceiptContext.oidcClaimsDigest,
      generatedOutputClosureDigest: rawReceiptContext.generatedOutputClosureDigest,
    },
    selectedProvider,
    modelRelease,
  })
  return {
    payload,
    rawReceiptValidationReadback: structuredClone(rawReceiptValidationReadback),
  }
}

export function managedCiReceiptSigningPayload(planState, options = {}) {
  return managedCiReceiptSigningMaterial(planState, options).payload
}

/**
 * Verifies a trusted signer projection when the original bytes are not locally
 * available. The signer-signed validation-readback digest remains bound to the
 * exact payload; this function can never be used to originate a signing payload.
 */
export function managedCiVerifyReceiptSigningPayloadProjection(planState, {
  receiptSigningPayload,
  rawReceiptValidationReadback,
  evidenceKind,
  workflowRunId,
  runAttempt,
  provenanceBinding,
  receiptBinding,
  frozenSubjectReadback,
  hostObservation,
  imageSupplyChainBinding,
  issuerMapping,
  rawReceiptProjection,
  selectedProvider = null,
  modelRelease = null,
  allowTrustedActivationCore = false,
} = {}) {
  const expected = managedCiReceiptSigningPayloadFromValidation(planState, {
    evidenceKind,
    workflowRunId,
    runAttempt,
    rawReceiptValidationReadback,
    provenanceBinding,
    receiptBinding,
    frozenSubjectReadback,
    hostObservation,
    imageSupplyChainBinding,
    issuerMapping,
    signedAt: receiptSigningPayload?.signedAt,
    rawReceiptProjection,
    selectedProvider,
    modelRelease,
    allowTrustedActivationCore,
  })
  exactValue(receiptSigningPayload, expected, 'receipt signing payload/readback projection')
  return structuredClone(expected)
}

export function managedCiReceiptSigningBytes(planState, payload, { issuerMapping } = {}) {
  const canonical = finalizedReceiptPayload(planState, payload, { issuerMapping })
  const domain = planState.trustedAuthority.policy.receiptSigner.payloadDomainSeparator
  return Buffer.from(`${domain}\0${managedCiStableStringify(canonical)}`, 'utf8')
}

export function managedCiReceiptSigningPayloadDigest(planState, payload, { issuerMapping } = {}) {
  return managedCiSha256(managedCiReceiptSigningBytes(planState, payload, { issuerMapping }))
}

export function managedCiVerifyReceiptSignature(planState, payload, signature, { issuerMapping } = {}) {
  const bytes = managedCiReceiptSigningBytes(planState, payload, { issuerMapping })
  if (typeof signature !== 'string') fail('receipt signer signature is missing')
  const signatureBytes = Buffer.from(signature, 'base64url')
  if (signatureBytes.length !== 64 || signatureBytes.toString('base64url') !== signature) fail('receipt signer signature is not canonical Ed25519 base64url')
  const signer = planState.trustedAuthority.policy.receiptSigner
  const registry = readJsonFile(planState.root, signer.issuerRegistryPath, 'receipt signer issuer registry').value
  validateIssuerRegistry(registry)
  const issuer = registry.issuers.find(candidate => candidate.keyId === issuerMapping.issuerKeyId)
  if (!issuer || issuer.subject !== issuerMapping.issuerSubject || !issuer.roles.includes(signer.issuerRole)) {
    fail('receipt signer signature issuer is not exactly authorized')
  }
  const signedAt = Date.parse(payload.signedAt)
  const notBefore = Date.parse(issuer.notBefore)
  const notAfter = Date.parse(issuer.notAfter)
  const revokedAt = issuer.revokedAt === null ? null : Date.parse(issuer.revokedAt)
  if (!(notBefore <= signedAt && signedAt < notAfter) || (revokedAt !== null && revokedAt <= signedAt)) {
    fail('receipt signer issuer was not valid at the historical signing instant')
  }
  if (!verify(null, bytes, publicKeyFromIssuer(issuer), signatureBytes)) fail('receipt signer signature is invalid')
  return true
}

export function managedCiSignerAuditEvent(planState, {
  eventId,
  signature,
  receiptSigningPayload,
  issuerMapping,
} = {}) {
  if (typeof eventId !== 'string' || !/^[A-Za-z0-9._:-]{8,256}$/.test(eventId)) fail('signer audit event identity is invalid')
  const expectedMapping = managedCiExpectedReceiptSignerIssuerMapping(planState, issuerMapping)
  exactValue(issuerMapping, expectedMapping, 'receipt signer issuer mapping')
  const payload = finalizedReceiptPayload(planState, receiptSigningPayload, { issuerMapping: expectedMapping })
  managedCiVerifyReceiptSignature(planState, payload, signature, { issuerMapping: expectedMapping })
  const authority = managedCiExpectedReceiptSignerAuthorityBinding(planState)
  return {
    eventId,
    tenantId: authority.tenantId,
    keyIdentity: authority.keyIdentity,
    policyDigest: authority.receiptSignerPolicyDigest,
    payloadDigest: managedCiReceiptSigningPayloadDigest(planState, payload, { issuerMapping: expectedMapping }),
    signature,
    workflowRunId: payload.workflowRunId,
    runAttempt: payload.runAttempt,
    environment: authority.allowedEnvironment,
    signedAt: payload.signedAt,
    executionClass: payload.executionClass,
    rawReceiptDigest: payload.rawReceiptDigest,
    signerAuthorityBindingDigest: authority.bindingDigest,
    issuerMappingDigest: managedCiSha256(managedCiStableStringify(expectedMapping)),
  }
}

export function managedCiWorkflowDefinitionRef(planOrState) {
  const plan = planOrState?.plan ?? planOrState
  if (!plan?.workflow) fail('workflow-definition reference requires a managed CI plan')
  return `${plan.workflow.repository}/${plan.workflow.path}@${plan.workflow.ref}`
}

export function managedCiExpectedFrozenSubjectArtifactBinding(planState, {
  artifactName,
  artifactId,
  artifactStorageLocator,
  artifactSha256,
  artifactSize,
  subjectCommit,
  subjectTree,
  freezeRunId,
  manifestSha256,
  manifestBytesSha256,
  coverageDigest,
  shardSetDigest,
  workflowDefinitionCommit,
  workflowDefinitionTree,
  workflowRunId,
  runAttempt,
  authorityOidcProjectionDigest,
} = {}) {
  if (!planState?.trustedAuthority) fail('frozen subject binding requires loaded trusted authority state')
  const policy = planState.trustedAuthority.policy.frozenSubjectArtifact
  if (artifactName !== policy.nameTemplate.replace('{workflowRunId}', workflowRunId).replace('{runAttempt}', String(runAttempt))
    || typeof artifactId !== 'string' || !/^[1-9][0-9]*$/.test(artifactId)
    || typeof artifactStorageLocator !== 'string' || !/^github-actions-artifact:\/\/ajenchen\/design-system\/[1-9][0-9]*$/.test(artifactStorageLocator)
    || !/^[a-f0-9]{64}$/.test(artifactSha256 ?? '') || !Number.isSafeInteger(artifactSize) || artifactSize < 1) {
    fail('frozen subject artifact identity/locator/digest/size is invalid')
  }
  if (!/^[a-f0-9]{40}$/.test(subjectCommit ?? '') || !/^[a-f0-9]{40}$/.test(subjectTree ?? '')
    || !new RegExp(planState.plan.observation.noncePattern).test(freezeRunId ?? '')) fail('frozen subject source/run identity is invalid')
  for (const [label, digest] of Object.entries({ manifestSha256, manifestBytesSha256, coverageDigest, shardSetDigest, authorityOidcProjectionDigest })) {
    if (!/^[a-f0-9]{64}$/.test(digest ?? '')) fail(`frozen subject ${label} is invalid`)
  }
  if (!/^[a-f0-9]{40}$/.test(workflowDefinitionCommit ?? '') || !/^[a-f0-9]{40}$/.test(workflowDefinitionTree ?? '')
    || typeof workflowRunId !== 'string' || !/^[1-9][0-9]*$/.test(workflowRunId)
    || !Number.isSafeInteger(runAttempt) || runAttempt < 1) fail('frozen subject workflow identity is invalid')
  const lineage = {
    schemaVersion: policy.schemaVersion,
    kind: policy.kind,
    artifactName,
    artifactId,
    artifactStorageLocator,
    artifactSha256,
    artifactSize,
    sourceRepository: planState.plan.workflow.repository,
    sourceCommit: subjectCommit,
    sourceTree: subjectTree,
    freezeRunId,
    manifestSha256,
    manifestBytesSha256,
    coverageDigest,
    shardSetDigest,
    workflowDefinitionRef: managedCiWorkflowDefinitionRef(planState),
    workflowDefinitionCommit,
    workflowDefinitionTree,
    workflowRunId,
    runAttempt,
    authorityEnvironment: policy.createdByEnvironment,
    authorityOidcProjectionDigest,
  }
  return { ...lineage, lineageDigest: managedCiSha256(managedCiStableStringify(lineage)) }
}

export function managedCiExpectedFrozenSubjectClassReadback(planState, {
  executionClass,
  frozenSubject,
  recomputedArtifactSha256,
  recomputedManifestBytesSha256,
  downloadedAt,
  hostObservationReceiptDigest,
} = {}) {
  if (!EXPECTED_CLASSES.includes(executionClass)) fail(`frozen subject readback execution class is invalid:${String(executionClass)}`)
  const expectedFrozen = managedCiExpectedFrozenSubjectArtifactBinding(planState, {
    ...frozenSubject,
    subjectCommit: frozenSubject?.sourceCommit,
    subjectTree: frozenSubject?.sourceTree,
  })
  if (frozenSubject?.lineageDigest !== expectedFrozen.lineageDigest
    || recomputedArtifactSha256 !== expectedFrozen.artifactSha256
    || recomputedManifestBytesSha256 !== expectedFrozen.manifestBytesSha256) {
    fail('frozen subject class readback did not recompute the authority-frozen artifact/manifest bytes')
  }
  if (!canonicalUtcTimestamp(downloadedAt)
    || !/^[a-f0-9]{64}$/.test(hostObservationReceiptDigest ?? '')) fail('frozen subject class readback time/host observation is invalid')
  const readback = {
    schemaVersion: 1,
    kind: 'managed-ci-frozen-subject-class-readback-v1',
    executionClass,
    artifactName: expectedFrozen.artifactName,
    artifactId: expectedFrozen.artifactId,
    artifactStorageLocator: expectedFrozen.artifactStorageLocator,
    artifactSha256: expectedFrozen.artifactSha256,
    artifactSize: expectedFrozen.artifactSize,
    recomputedArtifactSha256,
    manifestSha256: expectedFrozen.manifestSha256,
    recomputedManifestBytesSha256,
    coverageDigest: expectedFrozen.coverageDigest,
    shardSetDigest: expectedFrozen.shardSetDigest,
    lineageDigest: expectedFrozen.lineageDigest,
    downloadedAt,
    hostObservationReceiptDigest,
  }
  return { ...readback, readbackDigest: managedCiSha256(managedCiStableStringify(readback)) }
}

export function managedCiProvenanceBinding(planOrState, {
  workflowDefinitionRef,
  workflowDefinitionCommit,
  workflowDefinitionTree,
  workflowRunId,
  runAttempt,
  subjectCommit,
  subjectTree,
  manifestSha256,
  subjectRunId,
  frozenSubject,
} = {}) {
  const plan = planOrState?.plan ?? planOrState
  if (!plan?.workflow) fail('provenance binding requires a managed CI plan')
  const workflowIdentityDigest = planOrState?.workflow?.workflowIdentityDigest
  if (!/^[a-f0-9]{64}$/.test(workflowIdentityDigest ?? '')) {
    fail('provenance binding requires the loaded workflow identity digest')
  }
  if (workflowDefinitionRef !== managedCiWorkflowDefinitionRef(plan)) fail('workflow-definition ref differs from protected main')
  if (!/^[a-f0-9]{40}$/.test(workflowDefinitionCommit ?? '')) fail('workflow-definition commit is invalid')
  if (!/^[a-f0-9]{40}$/.test(workflowDefinitionTree ?? '')) fail('workflow-definition tree is invalid')
  if (typeof workflowRunId !== 'string' || !/^[1-9][0-9]*$/.test(workflowRunId)
    || !Number.isSafeInteger(runAttempt) || runAttempt < 1) fail('workflow run identity is invalid')
  if (!/^[a-f0-9]{40}$/.test(subjectCommit ?? '') || !/^[a-f0-9]{40}$/.test(subjectTree ?? '')) {
    fail('audited-subject commit/tree is invalid')
  }
  if (!/^[a-f0-9]{64}$/.test(manifestSha256 ?? '')) fail('audited-subject manifest digest is invalid')
  if (!new RegExp(plan.observation.noncePattern).test(subjectRunId ?? '')) fail('audited-subject run id is invalid')
  if (workflowDefinitionCommit === subjectCommit) fail('workflow-definition commit and audited-subject commit must be distinct')
  const expectedFrozen = managedCiExpectedFrozenSubjectArtifactBinding(planOrState, {
    ...frozenSubject,
    subjectCommit,
    subjectTree,
    freezeRunId: subjectRunId,
    manifestSha256,
    workflowDefinitionCommit,
    workflowDefinitionTree,
    workflowRunId,
    runAttempt,
  })
  if (frozenSubject?.lineageDigest !== expectedFrozen.lineageDigest) fail('frozen subject lineage digest differs from the canonical projection')
  const dispatchInputs = { workflowDefinitionTree, subjectCommit, subjectTree }
  const trust = planOrState?.activationTrustBundle
  if (!trust) fail('provenance binding requires the loaded activation trust bundle')
  const binding = {
    kind: 'managed-ci-full-provenance-v2',
    workflowRepository: plan.workflow.repository,
    workflowPath: plan.workflow.path,
    workflowRef: plan.workflow.ref,
    workflowEvent: plan.workflow.event,
    runnerEnvironment: plan.workflow.runnerEnvironment,
    workflowIdentityDigest,
    workflowDefinitionRef,
    workflowDefinitionCommit,
    workflowDefinitionTree,
    workflowRunId,
    runAttempt,
    auditedSubjectCommit: subjectCommit,
    auditedSubjectTree: subjectTree,
    auditedManifestSha256: manifestSha256,
    auditedSubjectRunId: subjectRunId,
    frozenSubjectArtifactName: expectedFrozen.artifactName,
    frozenSubjectArtifactId: expectedFrozen.artifactId,
    frozenSubjectArtifactLocator: expectedFrozen.artifactStorageLocator,
    frozenSubjectArtifactSha256: expectedFrozen.artifactSha256,
    frozenSubjectArtifactSize: expectedFrozen.artifactSize,
    frozenSubjectManifestBytesSha256: expectedFrozen.manifestBytesSha256,
    frozenSubjectCoverageDigest: expectedFrozen.coverageDigest,
    frozenSubjectShardSetDigest: expectedFrozen.shardSetDigest,
    frozenSubjectAuthorityOidcProjectionDigest: expectedFrozen.authorityOidcProjectionDigest,
    frozenSubjectLineageDigest: expectedFrozen.lineageDigest,
    workflowDispatchInputsDigest: managedCiSha256(managedCiStableStringify(dispatchInputs)),
    activationTrustBundleDigest: trust.bindingDigest,
    governanceManifestDigest: trust.manifest.sha256,
    controlPlaneLockDigest: trust.controlPlaneLock.sha256,
    controlPlaneContractDigest: trust.controlPlaneLock.contractDigest,
    controlPlaneInputDigest: trust.controlPlaneLock.inputDigest,
    controlPlaneSnapshotDigest: trust.controlPlaneLock.snapshotDigest,
    controlPlaneManifestId: trust.controlPlaneLock.manifestId,
  }
  return { ...binding, provenanceBindingDigest: managedCiSha256(managedCiStableStringify(binding)) }
}

export function managedCiExpectedModelReleaseAuthorityBinding(planState, modelRelease, { selectedProvider = null } = {}) {
  if (!planState?.modelReleaseAuthority || !planState?.classes) fail('model release authority binding requires loaded managed CI state')
  const modelState = planState.classes.get('model-broker')?.modelEgress
  if (!modelState) fail('model release authority binding requires the managed model-broker profile state')
  const issuerRegistry = readJsonFile(planState.root, planState.plan.trust.issuerRegistryPath, 'model release authority issuer registry').value
  let validated
  try {
    validated = validateModelReleaseAuthorityBinding(modelRelease, {
      policyState: planState.modelReleaseAuthority,
      releaseState: modelState.releaseState,
      profileState: modelState.profileState,
      issuerRegistry,
    })
  } catch (error) {
    fail(error.message)
  }
  const providerId = validated.binding.modelReleaseId.split('/', 1)[0]
  if (selectedProvider !== null && selectedProvider !== providerId) fail('model release authority provider differs from selectedProvider')
  return validated
}

export function managedCiExpectedOidcBinding(planState, {
  executionClass,
  workflowDefinitionCommit,
  workflowDefinitionTree,
  workflowRunId,
  runAttempt,
  subjectCommit,
  subjectTree,
  manifestSha256,
  subjectRunId,
  frozenSubject,
  modelRelease = null,
  tokenRuntime,
  allowTrustedActivationCore = false,
} = {}) {
  if (!managedCiExecutionStateIsTrusted(planState, allowTrustedActivationCore)
    || !planState?.oidcBrokerPolicy) {
    fail('OIDC binding requires an activated managed CI plan')
  }
  const classState = planState.classes.get(executionClass)
  if (!classState || classState.executionClass.job !== executionClass) fail(`OIDC execution class is invalid:${String(executionClass)}`)
  if (typeof workflowRunId !== 'string' || !/^[1-9][0-9]*$/.test(workflowRunId)) fail('OIDC workflow run id is invalid')
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) fail('OIDC workflow run attempt is invalid')
  const provenance = managedCiProvenanceBinding(planState, {
    workflowDefinitionRef: managedCiWorkflowDefinitionRef(planState),
    workflowDefinitionCommit,
    workflowDefinitionTree,
    workflowRunId,
    runAttempt,
    subjectCommit,
    subjectTree,
    manifestSha256,
    subjectRunId,
    frozenSubject,
  })
  const { repositoryId, repositoryOwnerId } = planState.plan.activation
  if (!/^[1-9][0-9]*$/.test(repositoryId ?? '') || !/^[1-9][0-9]*$/.test(repositoryOwnerId ?? '')) {
    fail('OIDC immutable repository IDs are not activated')
  }
  if (!tokenRuntime || typeof tokenRuntime.jti !== 'string' || !/^[A-Za-z0-9._:-]{8,256}$/.test(tokenRuntime.jti)
    || !Number.isSafeInteger(tokenRuntime.iat) || !Number.isSafeInteger(tokenRuntime.nbf)
    || !Number.isSafeInteger(tokenRuntime.exp) || tokenRuntime.nbf > tokenRuntime.iat
    || tokenRuntime.exp <= tokenRuntime.iat
    || tokenRuntime.exp - tokenRuntime.iat > planState.oidcBrokerPolicy.policy.token.temporal.maxAgeSeconds) {
    fail('OIDC jti/temporal runtime is invalid')
  }
  const workflow = planState.oidcBrokerPolicy.policy.workflowIdentity
  let modelReleaseBinding = {
    requestModelId: null,
    observedResponseModelId: null,
    modelReleaseId: null,
    modelReleaseBindingDigest: null,
    modelReleaseRegistryDigest: null,
    modelIdentityPolicyDigest: null,
    modelAuthorityReceiptDigest: null,
    modelAuthorityReadbackDigest: null,
    modelAuthorityRevocationRegistryDigest: null,
    modelAuthorityRevocationReadbackDigest: null,
    modelAuthorityAuditReadbackDigest: null,
    modelReleaseValidFrom: null,
    modelReleaseValidUntil: null,
    providerInvocationWindowDigest: null,
    exchangeInvocationObservationsDigest: null,
  }
  if (executionClass === 'model-broker') {
    const canonicalModelRelease = managedCiExpectedModelReleaseAuthorityBinding(planState, modelRelease)
    const release = canonicalModelRelease.binding
    modelReleaseBinding = {
      requestModelId: release.requestModelId,
      observedResponseModelId: release.observedResponseModelId,
      modelReleaseId: release.modelReleaseId,
      modelReleaseBindingDigest: release.modelReleaseBindingDigest,
      modelReleaseRegistryDigest: release.modelReleaseRegistryDigest,
      modelIdentityPolicyDigest: release.modelIdentityPolicyDigest,
      modelAuthorityReceiptDigest: canonicalModelRelease.digests.modelAuthorityReceiptDigest,
      modelAuthorityReadbackDigest: canonicalModelRelease.digests.modelAuthorityReadbackDigest,
      modelAuthorityRevocationRegistryDigest: canonicalModelRelease.digests.modelAuthorityRevocationRegistryDigest,
      modelAuthorityRevocationReadbackDigest: canonicalModelRelease.digests.modelAuthorityRevocationReadbackDigest,
      modelAuthorityAuditReadbackDigest: canonicalModelRelease.digests.modelAuthorityAuditReadbackDigest,
      modelReleaseValidFrom: release.modelReleaseValidFrom,
      modelReleaseValidUntil: release.modelReleaseValidUntil,
      providerInvocationWindowDigest: canonicalModelRelease.digests.providerInvocationWindowDigest,
      exchangeInvocationObservationsDigest: canonicalModelRelease.digests.exchangeInvocationObservationsDigest,
    }
  } else if (modelRelease !== null) fail(`${executionClass} cannot bind model release authority evidence`)
  const [owner, repositoryName] = workflow.repository.split('/')
  const claimProjection = {
    iss: planState.plan.observation.oidcIssuer,
    aud: planState.plan.observation.oidcAudience,
    sub: `repo:${owner}@${repositoryOwnerId}/${repositoryName}@${repositoryId}:environment:managed-ci-sandbox-authority-v1`,
    repository: workflow.repository,
    repository_id: repositoryId,
    repository_owner_id: repositoryOwnerId,
    event_name: workflow.eventName,
    ref: workflow.ref,
    ref_type: workflow.refType,
    sha: workflowDefinitionCommit,
    run_id: workflowRunId,
    run_attempt: String(runAttempt),
    runner_environment: workflow.runnerEnvironment,
    workflow: workflow.workflow,
    workflow_ref: workflow.workflowRef,
    workflow_sha: workflowDefinitionCommit,
    environment: 'managed-ci-sandbox-authority-v1',
  }
  const brokerRequest = {
    authorityEnvironment: 'managed-ci-sandbox-authority-v1',
    authorityPurpose: 'authorize-external-sandbox-and-egress-sessions',
    executionClass,
    workflowDefinitionRef: workflow.workflowRef,
    workflowDefinitionCommit,
    workflowDefinitionTree,
    workflowRunId,
    runAttempt,
    subjectCommit,
    subjectTree,
    manifestSha256,
    subjectRunId,
    frozenSubjectArtifactName: provenance.frozenSubjectArtifactName,
    frozenSubjectArtifactId: provenance.frozenSubjectArtifactId,
    frozenSubjectArtifactLocator: provenance.frozenSubjectArtifactLocator,
    frozenSubjectArtifactSha256: provenance.frozenSubjectArtifactSha256,
    frozenSubjectArtifactSize: provenance.frozenSubjectArtifactSize,
    frozenSubjectLineageDigest: provenance.frozenSubjectLineageDigest,
    ...modelReleaseBinding,
    workflowDispatchInputsDigest: provenance.workflowDispatchInputsDigest,
    provenanceBindingDigest: provenance.provenanceBindingDigest,
    activationTrustBundleDigest: provenance.activationTrustBundleDigest,
    governanceManifestDigest: provenance.governanceManifestDigest,
    controlPlaneLockDigest: provenance.controlPlaneLockDigest,
    controlPlaneContractDigest: provenance.controlPlaneContractDigest,
    controlPlaneInputDigest: provenance.controlPlaneInputDigest,
    controlPlaneSnapshotDigest: provenance.controlPlaneSnapshotDigest,
    controlPlaneManifestId: provenance.controlPlaneManifestId,
  }
  const policyBinding = {
    path: planState.plan.oidcBrokerPolicy.path,
    digest: planState.oidcBrokerPolicy.digest,
    schemaPath: planState.plan.oidcBrokerPolicy.schemaPath,
    schemaDigest: planState.oidcBrokerPolicy.schemaDigest,
    claimPolicyDigest: classState.oidcClaimPolicyDigest,
    brokerPolicyDigest: classState.oidcBrokerPolicyDigest,
    receiptSigningPolicyDigest: classState.receiptSigningPolicyDigest,
    requiredClaims: [...planState.oidcBrokerPolicy.policy.token.requiredClaims],
    replay: { ...planState.oidcBrokerPolicy.policy.token.replay },
    temporal: { ...planState.oidcBrokerPolicy.policy.token.temporal },
  }
  const binding = { claimProjection, brokerRequest, policyBinding, tokenRuntime: { ...tokenRuntime } }
  return { ...binding, projectionDigest: managedCiSha256(managedCiStableStringify(binding)) }
}

export function validateManagedCiOidcBinding(planState, observed, inputs) {
  const expected = managedCiExpectedOidcBinding(planState, inputs)
  exactValue(observed, expected, 'managed CI OIDC claim/request/policy/runtime projection')
  return true
}

export function managedCiExecutionClassForEvidenceKind(planState, evidenceKind) {
  const matches = [...planState.classes.values()].filter(item => item.executionClass.evidenceKinds.includes(evidenceKind))
  if (matches.length !== 1) fail(`evidence kind does not map to exactly one execution class:${String(evidenceKind)}`)
  return matches[0]
}

export function managedCiModelBrokerActivationLifecycleStatus(planState) {
  if (!planState
    || typeof planState !== 'object'
    || typeof planState.declarationsComplete !== 'boolean'
    || typeof planState.coreActive !== 'boolean'
    || typeof planState.carrierValidated !== 'boolean'
    || typeof planState.active !== 'boolean'
    || !Array.isArray(planState.blockers)) {
    fail('model broker activation lifecycle requires one complete managed CI state')
  }
  const materializedVerified = planState.declarationsComplete === true
    && planState.activationEvidence?.status === 'verified'
  const externalReadbackVerified = planState.carrierValidation?.status === 'verified'
  const managedExecutionActive = materializedVerified && externalReadbackVerified
  if (planState.coreActive !== materializedVerified
    || planState.carrierValidated !== externalReadbackVerified
    || planState.active !== managedExecutionActive
    || (managedExecutionActive && planState.blockers.length !== 0)) {
    fail('model broker activation lifecycle state is internally inconsistent')
  }
  return {
    materializedState: materializedVerified ? 'verified' : 'not-verified',
    externalReadbackState: externalReadbackVerified ? 'verified' : 'not-verified',
    managedExecutionActive,
  }
}

function managedCiExecutionStateIsTrusted(planState, allowTrustedActivationCore) {
  if (planState?.active === true) return true
  return allowTrustedActivationCore === true
    && isManagedCiTrustedExecutionCore(planState)
    && planState.coreActive === true
    && planState.active === false
    && planState.carrierValidated === false
    && Array.isArray(planState.blockers)
    && planState.blockers.length === 0
    && planState.activationEvidence?.status === 'verified'
    && planState.activationTrustBundle?.lockCurrent === true
    && Array.isArray(planState.activationTrustBundle?.blockers)
    && planState.activationTrustBundle.blockers.length === 0
}

export function managedCiExpectedRawReceiptBinding(planState, {
  evidenceKind,
  selectedProvider = null,
  allowTrustedActivationCore = false,
} = {}) {
  if (!managedCiExecutionStateIsTrusted(planState, allowTrustedActivationCore)) {
    fail('trusted raw receipt binding requires an activated managed CI plan')
  }
  const state = managedCiExecutionClassForEvidenceKind(planState, evidenceKind)
  const executionClass = state.executionClass
  let selectedEgress = null
  if (executionClass.id === 'model-broker') {
    selectedEgress = state.modelEgress.profiles.find(item => item.selectedProvider === selectedProvider)
    if (!selectedEgress) fail(`model broker selectedProvider is invalid:${String(selectedProvider)}`)
  } else if (selectedProvider !== null) {
    fail(`${executionClass.id} cannot bind a model provider`)
  }
  return {
    planDigest: planState.planDigest,
    profileDigest: state.profileDigest,
    executionClass: executionClass.id,
    evidenceKind,
    selectedProvider,
    networkPolicyDigest: managedCiSha256(managedCiStableStringify(executionClass.id === 'model-broker'
      ? {
          mode: executionClass.network.mode,
          tlsRequired: executionClass.network.tlsRequired,
          registrySha256: state.modelEgress.registrySha256,
          brokerProfilesSha256: state.modelEgress.brokerProfilesSha256,
          selectedEgress,
        }
      : executionClass.network)),
    isolationPolicyDigest: state.isolationPolicyDigest,
    permissionsDigest: state.permissionsDigest,
    workflowIdentityDigest: planState.workflow.workflowIdentityDigest,
    containerImageDigest: state.containerImageDigest,
  }
}

const MODEL_BROKER_ACTIVATION_RECEIPT_BINDINGS = Object.freeze([
  'planDigest',
  'profileDigest',
  'executionClass',
  'evidenceKind',
  'selectedProvider',
  'networkPolicyDigest',
  'isolationPolicyDigest',
  'permissionsDigest',
  'workflowIdentityDigest',
  'containerImageDigest',
])

export function managedCiExpectedModelBrokerActivationBinding(planState, {
  evidenceKind,
  selectedProvider,
} = {}) {
  const receiptBinding = managedCiExpectedRawReceiptBinding(planState, {
    evidenceKind,
    selectedProvider,
  })
  const classState = planState.classes.get('model-broker')
  const oidcAudience = planState.plan?.observation?.oidcAudience
  if (!classState
    || !/^[a-f0-9]{64}$/.test(classState.oidcBrokerPolicyDigest ?? '')
    || typeof oidcAudience !== 'string'
    || oidcAudience.length === 0) {
    fail('model broker activation secret-broker or OIDC authority is unavailable')
  }
  const binding = {
    executionClass: receiptBinding.executionClass,
    providerEndpointAllowlistDigest: receiptBinding.networkPolicyDigest,
    secretBrokerPolicyDigest: classState.oidcBrokerPolicyDigest,
    managedExecutionPlanDigest: receiptBinding.planDigest,
    workflowIdentityDigest: receiptBinding.workflowIdentityDigest,
    containerImageDigest: receiptBinding.containerImageDigest,
    oidcAudience,
  }
  return {
    ...binding,
    bindingDigest: managedCiSha256(managedCiStableStringify(binding)),
  }
}

export function managedCiModelBrokerActivationConvergence(planState, activationContract, {
  evidenceKind,
  selectedProvider,
} = {}) {
  exactObjectKeys(activationContract, [
    'contract',
    'executionClass',
    'canonicalDesiredState',
    'materializedState',
    'externalReadback',
    'requiredReceiptBindings',
    'failureMode',
  ], 'model broker activation convergence contract')
  exactValue(activationContract.contract, 'managed-ci-activation-convergence-v1', 'model broker activation convergence protocol')
  exactValue(activationContract.executionClass, 'model-broker', 'model broker activation execution class')
  exactValue(activationContract.canonicalDesiredState, 'managed-execution-required', 'model broker canonical desired state')
  exactValue(activationContract.materializedState, {
    carrierPath: MANAGED_CI_PLAN_PATH,
    activationPointer: '/activation',
    verificationReceiptKind: 'managed-ci-activation-verification-receipt-v2',
  }, 'model broker activation materialized-state carrier')
  exactValue(activationContract.externalReadback, {
    carrierPath: EXTERNAL_ACTIVATION_CARRIER_PATH,
    carrierProjection: 'external-activation-state-v1',
    requiredStatus: 'verified',
  }, 'model broker activation external readback carrier')
  exactArray(
    activationContract.requiredReceiptBindings,
    MODEL_BROKER_ACTIVATION_RECEIPT_BINDINGS,
    'model broker activation receipt binding closure',
  )
  exactValue(activationContract.failureMode, 'fail-closed', 'model broker activation failure mode')

  if (planState?.active !== true
    || planState.coreActive !== true
    || planState.carrierValidated !== true
    || planState.activationEvidence?.status !== 'verified'
    || planState.carrierValidation?.status !== 'verified'
    || planState.activationTrustBundle?.lockCurrent !== true
    || planState.activationTrustBundle.blockers?.length !== 0
    || planState.blockers?.length !== 0) {
    fail('model broker activation has not converged through the verified managed carrier and external readback')
  }
  const receipt = planState.plan?.activation?.verificationReceipt
  if (receipt?.kind !== activationContract.materializedState.verificationReceiptKind
    || !/^[a-f0-9]{64}$/.test(planState.activationEvidence.receiptDigest ?? '')
    || !Array.isArray(planState.carrierValidation.carrierPaths)
    || !planState.carrierValidation.carrierPaths.includes(activationContract.externalReadback.carrierPath)
    || !/^[a-f0-9]{40}$/.test(planState.carrierValidation.baselineCommit ?? '')
    || !/^[a-f0-9]{40}$/.test(planState.carrierValidation.baselineTree ?? '')
    || !/^[a-f0-9]{40}$/.test(planState.carrierValidation.carrierCommit ?? '')
    || !/^[a-f0-9]{40}$/.test(planState.carrierValidation.carrierTree ?? '')) {
    fail('model broker activation materialized receipt or external readback identity is missing, stale, or invalid')
  }

  const receiptBinding = managedCiExpectedRawReceiptBinding(planState, {
    evidenceKind,
    selectedProvider,
  })
  exactArray(
    Object.keys(receiptBinding),
    activationContract.requiredReceiptBindings,
    'model broker materialized receipt binding keys',
  )
  if (receiptBinding.executionClass !== activationContract.executionClass
    || !/^[a-f0-9]{64}$/.test(receiptBinding.planDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(receiptBinding.profileDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(receiptBinding.networkPolicyDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(receiptBinding.isolationPolicyDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(receiptBinding.permissionsDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(receiptBinding.workflowIdentityDigest ?? '')
    || !/^sha256:[a-f0-9]{64}$/.test(receiptBinding.containerImageDigest ?? '')) {
    fail('model broker activation receipt binding is incomplete or invalid')
  }
  const activationBinding = managedCiExpectedModelBrokerActivationBinding(planState, {
    evidenceKind,
    selectedProvider,
  })

  const canonicalDesiredState = {
    contract: activationContract.contract,
    executionClass: activationContract.executionClass,
    status: activationContract.canonicalDesiredState,
    requiredReceiptBindings: [...activationContract.requiredReceiptBindings],
    failureMode: activationContract.failureMode,
  }
  canonicalDesiredState.digest = managedCiSha256(managedCiStableStringify(canonicalDesiredState))
  const materializedState = {
    carrierPath: activationContract.materializedState.carrierPath,
    activationPointer: activationContract.materializedState.activationPointer,
    planDigest: receiptBinding.planDigest,
    activationReceiptDigest: planState.activationEvidence.receiptDigest,
    receiptBindingDigest: managedCiSha256(managedCiStableStringify(receiptBinding)),
    activationBindingDigest: activationBinding.bindingDigest,
  }
  materializedState.digest = managedCiSha256(managedCiStableStringify(materializedState))
  const externalReadback = {
    carrierPath: activationContract.externalReadback.carrierPath,
    carrierProjection: activationContract.externalReadback.carrierProjection,
    status: planState.carrierValidation.status,
    baselineCommit: planState.carrierValidation.baselineCommit,
    baselineTree: planState.carrierValidation.baselineTree,
    carrierCommit: planState.carrierValidation.carrierCommit,
    carrierTree: planState.carrierValidation.carrierTree,
  }
  externalReadback.digest = managedCiSha256(managedCiStableStringify(externalReadback))
  const result = {
    schemaVersion: 1,
    kind: 'managed-ci-model-broker-activation-convergence',
    status: 'converged',
    canonicalDesiredState,
    materializedState,
    externalReadback,
    receiptBinding,
    activationBinding,
  }
  result.convergenceDigest = managedCiSha256(managedCiStableStringify(result))
  return result
}

export function managedCiExpectedReceiptBinding(planState, {
  evidenceKind,
  selectedProvider = null,
  modelRelease = null,
  allowTrustedActivationCore = false,
} = {}) {
  if (!managedCiExecutionStateIsTrusted(planState, allowTrustedActivationCore)) {
    fail('trusted receipt binding requires an activated managed CI plan')
  }
  const state = managedCiExecutionClassForEvidenceKind(planState, evidenceKind)
  const executionClass = state.executionClass
  const rawBinding = managedCiExpectedRawReceiptBinding(planState, {
    evidenceKind,
    selectedProvider,
    allowTrustedActivationCore,
  })
  let selectedEgress = null
  let validatedModelRelease = null
  if (executionClass.id === 'model-broker') {
    selectedEgress = state.modelEgress.profiles.find(item => item.selectedProvider === selectedProvider)
    if (!selectedEgress) fail(`model broker selectedProvider is invalid:${String(selectedProvider)}`)
    validatedModelRelease = managedCiExpectedModelReleaseAuthorityBinding(planState, modelRelease, { selectedProvider })
  } else if (selectedProvider !== null) fail(`${executionClass.id} cannot bind a model provider`)
  if (executionClass.id !== 'model-broker' && modelRelease !== null) fail(`${executionClass.id} cannot bind model release authority evidence`)
  const modelBinding = executionClass.id === 'model-broker'
    ? {
        requestModelId: validatedModelRelease.binding.requestModelId,
        observedResponseModelId: validatedModelRelease.binding.observedResponseModelId,
        modelReleaseId: validatedModelRelease.binding.modelReleaseId,
        modelReleaseBindingDigest: validatedModelRelease.binding.modelReleaseBindingDigest,
        modelReleaseRegistryDigest: validatedModelRelease.binding.modelReleaseRegistryDigest,
        modelIdentityPolicyDigest: validatedModelRelease.binding.modelIdentityPolicyDigest,
        modelAuthorityReceiptDigest: validatedModelRelease.digests.modelAuthorityReceiptDigest,
        modelAuthorityReadbackDigest: validatedModelRelease.digests.modelAuthorityReadbackDigest,
        modelAuthorityRevocationRegistryDigest: validatedModelRelease.digests.modelAuthorityRevocationRegistryDigest,
        modelAuthorityRevocationReadbackDigest: validatedModelRelease.digests.modelAuthorityRevocationReadbackDigest,
        modelAuthorityAuditReadbackDigest: validatedModelRelease.digests.modelAuthorityAuditReadbackDigest,
        modelAuthorityPolicyDigest: validatedModelRelease.digests.authorityPolicyDigest,
        modelAuthorityBindingSchemaDigest: validatedModelRelease.digests.authorityBindingSchemaDigest,
        modelAuthorityIssuerRegistryDigest: validatedModelRelease.digests.issuerRegistryDigest,
        modelAuthorityBindingDigest: managedCiSha256(managedCiStableStringify(validatedModelRelease.binding)),
        modelReleaseValidFrom: validatedModelRelease.binding.modelReleaseValidFrom,
        modelReleaseValidUntil: validatedModelRelease.binding.modelReleaseValidUntil,
        providerInvocationWindow: structuredClone(validatedModelRelease.binding.providerInvocationWindow),
        exchangeInvocationObservations: structuredClone(validatedModelRelease.exchangeInvocationObservations),
        providerInvocationWindowDigest: validatedModelRelease.digests.providerInvocationWindowDigest,
        exchangeInvocationObservationsDigest: validatedModelRelease.digests.exchangeInvocationObservationsDigest,
      }
    : {
        requestModelId: null, observedResponseModelId: null, modelReleaseId: null,
        modelReleaseBindingDigest: null, modelReleaseRegistryDigest: null, modelIdentityPolicyDigest: null,
        modelAuthorityReceiptDigest: null, modelAuthorityReadbackDigest: null,
        modelAuthorityRevocationRegistryDigest: null, modelAuthorityRevocationReadbackDigest: null,
        modelAuthorityAuditReadbackDigest: null, modelAuthorityPolicyDigest: null,
        modelAuthorityBindingSchemaDigest: null, modelAuthorityIssuerRegistryDigest: null,
        modelAuthorityBindingDigest: null, modelReleaseValidFrom: null, modelReleaseValidUntil: null,
        providerInvocationWindow: null, exchangeInvocationObservations: null,
        providerInvocationWindowDigest: null, exchangeInvocationObservationsDigest: null,
      }
  return {
    ...rawBinding,
    ...modelBinding,
  }
}

export { EXPECTED_CLASSES }

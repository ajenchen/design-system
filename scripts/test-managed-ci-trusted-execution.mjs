#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { load as loadYaml } from 'js-yaml'
import { createManagedCiActivationFixture } from '../infra/governance/test/fixtures/managed-ci-activation-fixture.mjs'
import {
  finalizationRequestEnvelope,
  finalizationTransportReadbackDigest,
  finalizedReceiptSetDigest,
  validateFinalizationRequest,
  validateFinalizationResponse,
} from '../infra/governance/managed-ci-executor/authority/managed-ci-authority-client.mjs'
import {
  MANAGED_CI_RAW_RECEIPT_SCHEMA_PATH,
  isManagedCiTrustedExecutionCore,
  loadManagedCiTrustedExecutionCore,
  loadManagedCiTrustedExecutionPlan,
  managedCiImmutableValidationModels,
  managedCiActivationDeclarationDigest,
  managedCiActivatedWorkflowDocument,
  managedCiExpectedFrozenSubjectArtifactBinding,
  managedCiExpectedFrozenSubjectClassReadback,
  managedCiExpectedHostSandboxPolicyBinding,
  managedCiExpectedImageSupplyChainBinding,
  managedCiExpectedModelBrokerActivationBinding,
  managedCiExpectedModelReleaseAuthorityBinding,
  managedCiExpectedReceiptBinding,
  managedCiModelBrokerActivationLifecycleStatus,
  managedCiModelBrokerActivationConvergence,
  managedCiExpectedReceiptSignerAuthorityBinding,
  managedCiExpectedReceiptSignerIssuerMapping,
  managedCiHostSandboxObservationReceiptDigest,
  managedCiHostSandboxObservationSigningBytes,
  managedCiProvenanceBinding,
  managedCiReceiptSigningBytes,
  managedCiReceiptSigningPayloadDigest,
  managedCiSha256,
  managedCiSignerAuditEvent,
  managedCiStableStringify,
  managedCiVerifyHostSandboxObservation,
  managedCiVerifyReceiptSigningPayloadProjection,
  managedCiVerifyReceiptSignature,
  managedCiWorkflowDefinitionRef,
  renderManagedCiActivatedWorkflow,
  validateManagedCiExecutorBuildContext,
  validateManagedCiExecutorBuilderTrigger,
  validateManagedCiTrustedExecutionPlan,
} from './lib/managed-ci-trusted-execution-plan.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IMMUTABLE_SNAPSHOT_PROBE = resolve(
  ROOT,
  'infra/governance/test/fixtures/managed-ci-immutable-snapshot-probe.mjs',
)
const CLASSES = ['dependency-acquisition', 'deterministic-hook-audit', 'model-broker', 'github-observer']
const SHA = label => managedCiSha256(label)
const MODEL_BROKER_ACTIVATION_CONTRACT = JSON.parse(readFileSync(
  resolve(ROOT, 'infra/governance/model-evidence-broker.json'),
  'utf8',
)).activation
const governanceNormalize = value => {
  if (Array.isArray(value)) return value.map(governanceNormalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, governanceNormalize(value[key])]))
}
const governanceDigest = value => `sha256:${createHash('sha256').update(
  Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === 'string' ? value : `${JSON.stringify(governanceNormalize(value), null, 2)}\n`),
).digest('hex')}`
const governanceTreeDigest = entries => governanceDigest(entries.map(({
  path, type, mode, hash, target,
}) => governanceNormalize({ path, type, mode, hash, target })))
const CLOSED_SUPPLY_CHAIN_POLICY = JSON.parse(readFileSync(
  resolve(ROOT, 'infra/governance/providers/managed-ci-executor-supply-chain.json'),
  'utf8',
))
const CLOSED_BUILDER_WORKFLOW = readFileSync(resolve(ROOT, CLOSED_SUPPLY_CHAIN_POLICY.builder.workflowPath), 'utf8')

function validateClosedBuilderWorkflow(workflowSource) {
  return validateManagedCiExecutorBuilderTrigger({
    builder: CLOSED_SUPPLY_CHAIN_POLICY.builder,
    attestations: CLOSED_SUPPLY_CHAIN_POLICY.attestations,
    protectedRef: CLOSED_SUPPLY_CHAIN_POLICY.source.protectedRef,
    workflowSource,
  })
}

function workflowGitFileSetBinding(paths) {
  const files = paths.map(path => {
    const absolute = resolve(ROOT, path)
    const bytes = readFileSync(absolute)
    const mode = (lstatSync(absolute).mode & 0o111) === 0 ? '100644' : '100755'
    return {
      mode,
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    }
  })
  return {
    files,
    digest: createHash('sha256').update(`${JSON.stringify(files)}\n`).digest('hex'),
  }
}

function poisonClosedBuilderWorkflow(source, before, after) {
  assert.notEqual(before, after)
  assert.equal(source.includes(before), true, `poison preimage is missing: ${before}`)
  const changed = source.replace(before, after)
  assert.notEqual(changed, source)
  return changed
}

function closedBuilderRunProgram(workflowSource) {
  const steps = loadYaml(workflowSource).jobs['build-and-push'].steps
  assert.equal(
    steps[0]?.name,
    'Bind DOCKER_CONFIG to the runner-scoped temp directory',
    'managed-CI builder isolation prelude moved without updating the test projection',
  )
  return steps.slice(1)[6]?.run
}

// Git >= 2.54 auto-maintenance ("geometric" strategy, 100-loose-object threshold) would
// otherwise let each fixture commit spawn a detached background repack that mutates
// .git/objects while the immutable identity gate is verifying — the gate then correctly
// fails closed ("Git repository identity changed during immutable verification").
// Fixture Git must never spawn asynchronous writers, so every commit disables all
// auto-maintenance routes (maintenance.auto / gc.auto / gc.autoDetach) inline.
function commitManagedCiFixture(root, message) {
  const environment = {
    ...process.env,
    GIT_AUTHOR_DATE: '2026-07-24T12:00:00Z',
    GIT_COMMITTER_DATE: '2026-07-24T12:00:00Z',
  }
  for (const args of [
    ['--no-replace-objects', 'add', '--all'],
    [
      '--no-replace-objects',
      '-c', 'maintenance.auto=false',
      '-c', 'gc.auto=0',
      '-c', 'gc.autoDetach=false',
      '-c', 'user.name=Managed CI Carrier Fixture',
      '-c', 'user.email=managed-ci-carrier@example.invalid',
      'commit', '--quiet', '--no-gpg-sign', '-m', message,
    ],
  ]) {
    const result = spawnSync('/usr/bin/git', args, {
      cwd: root,
      encoding: 'utf8',
      env: environment,
      shell: false,
    })
    assert.equal(result.status, 0, result.stderr)
  }
}

let activeFixture = null
function activeState(_base = null, root = null) {
  if (activeFixture === null) {
    activeFixture = createManagedCiActivationFixture({
      repoRoot: ROOT,
      issuerRegistry: JSON.parse(readFileSync(resolve(ROOT, 'infra/governance/trust/issuers.json'), 'utf8')),
      runtimeProfile: JSON.parse(readFileSync(resolve(ROOT, 'infra/governance/providers/runtime-conformance.json'), 'utf8')),
      observedAt: '2026-07-24T00:00:00.000Z',
    })
  }
  const state = activeFixture.managedCiState
  return root === null ? state : { ...state, root }
}

process.once('exit', () => activeFixture?.dispose())

function issuer(keyId, subject) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey,
    record: {
      keyId,
      subject,
      publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      roles: ['runtime-evidence-issuer'],
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2027-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}

function trustRoot(t, issuers) {
  const root = mkdtempSync(join(tmpdir(), 'managed-ci-trust-test-'))
  for (const path of [
    'infra/governance/trust/issuers.json',
    'scripts/schemas/managed-ci-finalized-receipt.schema.json',
    MANAGED_CI_RAW_RECEIPT_SCHEMA_PATH,
  ]) mkdirSync(dirname(resolve(root, path)), { recursive: true })
  writeFileSync(resolve(root, 'infra/governance/trust/issuers.json'), `${JSON.stringify({
    $schema: '../schemas/issuer-registry.schema.json', schemaVersion: 1, algorithm: 'ed25519', issuers,
  }, null, 2)}\n`)
  for (const path of ['scripts/schemas/managed-ci-finalized-receipt.schema.json', MANAGED_CI_RAW_RECEIPT_SCHEMA_PATH]) {
    copyFileSync(resolve(ROOT, path), resolve(root, path))
  }
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function validateSchema(schemaPath, value) {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const validate = ajv.compile(JSON.parse(readFileSync(resolve(ROOT, schemaPath), 'utf8')))
  return validate(value)
}

test('canonical managed execution remains atomically inactive but all trust contracts are closed', () => {
  const state = loadManagedCiTrustedExecutionPlan({ repoRoot: ROOT })
  assert.equal(state.active, false)
  assert.equal(state.declarationsComplete, false)
  assert.equal(state.activationEvidence.status, 'not-verified')
  assert.equal(state.activationEvidence.receiptDigest, null)
  assert(state.activationEvidence.blockers.some(item => item.includes('not cryptographically verified')))
  assert.deepEqual([...state.classes.keys()], CLASSES)
  const manifest = JSON.parse(readFileSync(resolve(ROOT, state.plan.activationTrustBundle.manifestPath), 'utf8'))
  assert.equal(manifest.sources.length > 300, true)
  assert.equal(state.activationTrustBundle.files.length, 0)
  assert.equal(state.activationTrustBundle.gitTree.executorSourceCommit, null)
  assert.equal(state.activationTrustBundle.gitTree.executorSourceTree, null)
  assert.equal(state.activationTrustBundle.receiptBinding, null)
  assert.equal(state.activationTrustBundle.lockCurrent, false)
  assert(state.activationTrustBundle.blockers.some(
    item => item.includes('not bound to an immutable executorSourceCommit/executorSourceTree'),
  ))
  assert.equal(state.activationTrustBundle.buildGraph.stageId, 'control-plane')
  assert.deepEqual(
    state.activationTrustBundle.buildGraph.sourceResolvers,
    ['governance-manifest', 'root-provider-views'],
  )
  assert.equal(state.trust.receiptPolicy.issuerRole, 'completion-attestor')
  assert.deepEqual(state.trust.receiptPolicy.allowedKeyIds, ['owner-governance-2026-464784a3db60'])
  assert.equal(state.trust.policyActive, true)
  assert.equal(state.executorSupplyChain.controlPlane.files.length, 6)
  assert.match(state.executorSupplyChain.controlPlane.digest, /^[a-f0-9]{64}$/)
  assert.deepEqual(state.executorSupplyChain.policy.builder.privilegeSeparation, {
    buildAndPushJob: 'build-and-push',
    sbomJob: 'generate-sbom',
    digestBindingJob: 'bind-image-set',
    attestationJob: 'attest-image',
    handoffMode: 'same-run-immutable-artifact-id-digest-and-content-sha256',
    combinedRegistryAndOidcAuthorityForbidden: true,
    registryAttestationPushForbidden: true,
  })
  assert.equal(state.trustedAuthority.policy.candidateBoundary.idTokenPermission, 'none')
  assert.equal(state.trustedAuthority.policy.candidateBoundary.environment, null)
  assert.equal(state.trustedAuthority.policy.receiptSigner.payloadSchemaPath, 'scripts/schemas/managed-ci-finalized-receipt.schema.json')
  assert.equal(state.trustedAuthority.policy.receiptSigner.auditLog.requiredFields.length, 14)
  assert.equal(state.modelReleaseAuthority.policy.replay.ledger, 'external-atomic-ttl-replay-ledger')
  assert(state.blockers.every(item => typeof item === 'string' && item.length > 0))
  assert.throws(() => loadManagedCiTrustedExecutionPlan({ repoRoot: ROOT, requireActivated: true }), /not activated/)

  for (const [id, classState] of state.classes) {
    assert.equal(classState.executionClass.permissions['id-token'], 'none', id)
    assert.equal(classState.containerImageDigest, null, id)
  }
})

test('model-broker activation converges only from the verified managed carrier and keeps desired, materialized, and external readback states distinct', () => {
  const active = activeState()
  assert.deepEqual(managedCiModelBrokerActivationLifecycleStatus(active), {
    materializedState: 'verified',
    externalReadbackState: 'verified',
    managedExecutionActive: true,
  })
  const claude = managedCiModelBrokerActivationConvergence(
    active,
    MODEL_BROKER_ACTIVATION_CONTRACT,
    { evidenceKind: 'deep-audit-judgment', selectedProvider: 'claude' },
  )
  const codex = managedCiModelBrokerActivationConvergence(
    active,
    MODEL_BROKER_ACTIVATION_CONTRACT,
    { evidenceKind: 'deep-audit-judgment', selectedProvider: 'codex' },
  )
  assert.equal(claude.status, 'converged')
  assert.equal(claude.canonicalDesiredState.status, 'managed-execution-required')
  assert.equal(claude.materializedState.carrierPath, 'scripts/managed-ci-trusted-execution-plan.json')
  assert.equal(claude.externalReadback.carrierPath, 'infra/governance/external-activation-requirements.json')
  assert.equal(claude.externalReadback.status, 'verified')
  assert.match(claude.convergenceDigest, /^[a-f0-9]{64}$/)
  assert.match(claude.activationBinding.bindingDigest, /^[a-f0-9]{64}$/)
  assert.deepEqual(
    claude.activationBinding,
    managedCiExpectedModelBrokerActivationBinding(active, {
      evidenceKind: 'deep-audit-judgment',
      selectedProvider: 'claude',
    }),
  )
  assert.notEqual(
    claude.activationBinding.secretBrokerPolicyDigest,
    claude.receiptBinding.isolationPolicyDigest,
    'secret-broker authority must not be substituted with the sandbox isolation policy',
  )
  assert.notEqual(
    claude.activationBinding.providerEndpointAllowlistDigest,
    codex.activationBinding.providerEndpointAllowlistDigest,
    'provider-specific egress bindings must not collapse across Claude and Codex',
  )
  assert.throws(
    () => managedCiModelBrokerActivationConvergence(
      active,
      MODEL_BROKER_ACTIVATION_CONTRACT,
      { evidenceKind: 'deep-audit-judgment', selectedProvider: 'unknown-provider' },
    ),
    /selectedProvider is invalid/,
  )
  const inactive = loadManagedCiTrustedExecutionPlan({ repoRoot: ROOT })
  assert.deepEqual(managedCiModelBrokerActivationLifecycleStatus(inactive), {
    materializedState: 'not-verified',
    externalReadbackState: 'not-verified',
    managedExecutionActive: false,
  })
  assert.throws(
    () => managedCiModelBrokerActivationConvergence(
      inactive,
      MODEL_BROKER_ACTIVATION_CONTRACT,
      { evidenceKind: 'deep-audit-judgment', selectedProvider: 'claude' },
    ),
    /has not converged/,
  )
  const substitutedContract = structuredClone(MODEL_BROKER_ACTIVATION_CONTRACT)
  substitutedContract.externalReadback.carrierPath = 'infra/governance/substituted.json'
  assert.throws(
    () => managedCiModelBrokerActivationConvergence(
      active,
      substitutedContract,
      { evidenceKind: 'deep-audit-judgment', selectedProvider: 'claude' },
    ),
    /external readback carrier/,
  )
})

test('projected governance carriers require committed raw after-images while retired activation semantics remain nonblocking', (t) => {
  const active = activeState()
  const root = mkdtempSync(join(tmpdir(), 'managed-ci-carrier-transition-'))
  cpSync(active.root, root, { recursive: true })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const now = new Date('2026-07-24T00:00:00.000Z')
  const activationPath = resolve(root, 'infra/governance/external-activation-requirements.json')
  const activation = JSON.parse(readFileSync(activationPath, 'utf8'))

  writeFileSync(activationPath, `${JSON.stringify(activation, null, 4)}\n`)
  commitManagedCiFixture(root, 'B1 committed state-carrier formatting transition')
  const b1 = loadManagedCiTrustedExecutionPlan({ repoRoot: root, requireActivated: true, now })
  assert.equal(b1.coreActive, true)
  assert.equal(b1.carrierValidated, true)
  assert.equal(b1.carrierValidation.status, 'verified')
  assert.notEqual(b1.carrierValidation.baselineCommit, b1.carrierValidation.carrierCommit)
  assert.equal(managedCiModelBrokerActivationConvergence(
    b1,
    MODEL_BROKER_ACTIVATION_CONTRACT,
    { evidenceKind: 'deep-audit-judgment', selectedProvider: 'claude' },
  ).status, 'converged')

  const b1Bytes = readFileSync(activationPath)
  writeFileSync(activationPath, JSON.stringify(activation))
  const dirty = loadManagedCiTrustedExecutionPlan({ repoRoot: root, now })
  assert.equal(dirty.coreActive, true)
  assert.equal(dirty.carrierValidated, false)
  assert.equal(dirty.active, false)
  assert.deepEqual(managedCiModelBrokerActivationLifecycleStatus(dirty), {
    materializedState: 'verified',
    externalReadbackState: 'not-verified',
    managedExecutionActive: false,
  })
  assert.throws(
    () => managedCiModelBrokerActivationLifecycleStatus({ ...dirty, active: true }),
    /lifecycle state is internally inconsistent/,
  )
  assert(dirty.carrierValidation.blockers.some(item => item.includes('exact current HEAD blob')))
  assert.throws(
    () => managedCiModelBrokerActivationConvergence(
      dirty,
      MODEL_BROKER_ACTIVATION_CONTRACT,
      { evidenceKind: 'deep-audit-judgment', selectedProvider: 'claude' },
    ),
    /has not converged/,
  )
  writeFileSync(activationPath, b1Bytes)
  assert.equal(managedCiModelBrokerActivationConvergence(
    loadManagedCiTrustedExecutionPlan({ repoRoot: root, requireActivated: true, now }),
    MODEL_BROKER_ACTIVATION_CONTRACT,
    { evidenceKind: 'deep-audit-judgment', selectedProvider: 'claude' },
  ).status, 'converged')

  for (const [kind, substitute] of [
    ['hardlink', (source, target) => linkSync(source, target)],
    ['symlink', (source, target) => symlinkSync(source, target)],
  ]) {
    const attackRoot = mkdtempSync(join(tmpdir(), `managed-ci-carrier-${kind}-`))
    cpSync(root, attackRoot, { recursive: true })
    t.after(() => rmSync(attackRoot, { recursive: true, force: true }))
    const target = resolve(attackRoot, 'infra/governance/external-activation-requirements.json')
    const source = resolve(attackRoot, `infra/governance/external-activation-${kind}-source.json`)
    writeFileSync(source, b1Bytes)
    rmSync(target)
    substitute(source, target)
    const attacked = loadManagedCiTrustedExecutionPlan({ repoRoot: attackRoot, now })
    assert.equal(attacked.active, false)
    assert(attacked.activationTrustBundle.checkoutDriftPaths.includes(
      'infra/governance/external-activation-requirements.json',
    ))
  }

  const retiredActivationChange = structuredClone(activation)
  Object.assign(retiredActivationChange.requirements[0], {
    status: 'activated',
    evidence: null,
    observedAt: null,
    expiresAt: null,
  })
  writeFileSync(activationPath, `${JSON.stringify(retiredActivationChange, null, 2)}\n`)
  commitManagedCiFixture(root, 'B2 committed retired activation carrier transition')
  const b2 = loadManagedCiTrustedExecutionPlan({ repoRoot: root, now })
  assert.equal(b2.coreActive, true)
  assert.equal(b2.carrierValidated, true)
  assert.equal(b2.active, true)
  assert.equal(managedCiModelBrokerActivationConvergence(
    b2,
    MODEL_BROKER_ACTIVATION_CONTRACT,
    { evidenceKind: 'deep-audit-judgment', selectedProvider: 'claude' },
  ).status, 'converged')

  writeFileSync(activationPath, b1Bytes)
  commitManagedCiFixture(root, 'B3 recover exact reviewed carrier after rejected partial activation')
  const recovered = loadManagedCiTrustedExecutionPlan({ repoRoot: root, requireActivated: true, now })
  assert.equal(managedCiModelBrokerActivationConvergence(
    recovered,
    MODEL_BROKER_ACTIVATION_CONTRACT,
    { evidenceKind: 'deep-audit-judgment', selectedProvider: 'claude' },
  ).status, 'converged')
})

test('managed CI consumes only branded B0 runtime models and final core recapture catches stable live drift', t => {
  const active = activeState()
  const root = mkdtempSync(join(tmpdir(), 'managed-ci-immutable-runtime-models-'))
  cpSync(active.root, root, { recursive: true })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const now = new Date('2026-07-24T00:00:00.000Z')
  const core = loadManagedCiTrustedExecutionCore({ repoRoot: root, now })
  assert.equal(core.coreActive, true)
  assert.equal(isManagedCiTrustedExecutionCore(core), true)

  const mutableModelPaths = [
    'infra/governance/providers/runtime-conformance.json',
    'infra/governance/providers/provider-cli-toolchain.json',
    'infra/governance/trust/issuers.json',
  ]
  const originals = new Map(mutableModelPaths.map(path => [path, readFileSync(resolve(root, path))]))
  const immutableBefore = managedCiImmutableValidationModels(core)
  for (const path of mutableModelPaths) {
    const original = originals.get(path).toString('utf8')
    writeFileSync(resolve(root, path), `${original.trimEnd()}\n\n`)
  }
  try {
    const immutableDuring = managedCiImmutableValidationModels(core)
    for (const [name, path] of [
      ['runtimeProfile', mutableModelPaths[0]],
      ['providerCliToolchain', mutableModelPaths[1]],
      ['issuerRegistry', mutableModelPaths[2]],
    ]) {
      assert.deepEqual(immutableDuring[name].bytes, originals.get(path))
      assert.deepEqual(immutableDuring[name].bytes, immutableBefore[name].bytes)
    }

    const drifted = loadManagedCiTrustedExecutionPlan({ repoRoot: root, now })
    assert.equal(drifted.active, false)
    for (const path of mutableModelPaths) {
      assert(drifted.activationTrustBundle.checkoutDriftPaths.includes(path), path)
    }
  } finally {
    for (const [path, bytes] of originals) writeFileSync(resolve(root, path), bytes)
  }
  assert.equal(loadManagedCiTrustedExecutionPlan({
    repoRoot: root,
    requireActivated: true,
    now,
  }).active, true)

  core.plan.trust.runtimeEvidencePolicyPath = 'infra/governance/providers/substituted.json'
  assert.equal(isManagedCiTrustedExecutionCore(core), false)
  assert.throws(
    () => managedCiImmutableValidationModels(core),
    /branded trusted core/,
  )
})

test('immutable activation snapshot is independent of ambient Git selectors and host locale', () => {
  const state = activeState()
  const cleanEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => (
      !name.startsWith('GIT_')
      && !['LANG', 'LC_ALL', 'LC_CTYPE'].includes(name)
    )),
  )
  const invoke = extraEnvironment => spawnSync(
    process.execPath,
    ['--', IMMUTABLE_SNAPSHOT_PROBE, state.root, '2026-07-24T00:00:00.000Z'],
    {
      cwd: state.root,
      encoding: 'utf8',
      env: { ...cleanEnvironment, ...extraEnvironment },
      maxBuffer: 1024 * 1024,
      shell: false,
      timeout: 30_000,
    },
  )
  const baseline = invoke({ LANG: 'C', LC_ALL: 'C' })
  assert.equal(baseline.status, 0, baseline.stderr)
  const expected = JSON.parse(baseline.stdout)
  assert.equal(expected.active, true)

  const nonexistent = resolve(state.root, '.ambient-git-selector-must-not-exist')
  const contaminated = invoke({
    LANG: 'tr_TR.UTF-8',
    LC_ALL: 'tr_TR.UTF-8',
    GIT_ALTERNATE_OBJECT_DIRECTORIES: nonexistent,
    GIT_CEILING_DIRECTORIES: state.root,
    GIT_COMMON_DIR: nonexistent,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_GLOBAL: nonexistent,
    GIT_CONFIG_KEY_0: 'core.worktree',
    GIT_CONFIG_SYSTEM: nonexistent,
    GIT_CONFIG_VALUE_0: nonexistent,
    GIT_DIR: nonexistent,
    GIT_INDEX_FILE: nonexistent,
    GIT_OBJECT_DIRECTORY: nonexistent,
    GIT_REPLACE_REF_BASE: 'refs/ambient-replace/',
    GIT_WORK_TREE: nonexistent,
  })
  assert.equal(contaminated.status, 0, contaminated.stderr)
  assert.deepEqual(JSON.parse(contaminated.stdout), expected)

  const alternateLocale = invoke({ LANG: 'ja_JP.UTF-8', LC_ALL: 'ja_JP.UTF-8' })
  assert.equal(alternateLocale.status, 0, alternateLocale.stderr)
  assert.deepEqual(JSON.parse(alternateLocale.stdout), expected)
})

test('Unicode trust paths and source IDs have identical activation digests across host locales', t => {
  const localeNames = ['中', 'Z', '😀', 'ب', 'あ']
  const fixture = createManagedCiActivationFixture({
    repoRoot: ROOT,
    issuerRegistry: JSON.parse(readFileSync(resolve(ROOT, 'infra/governance/trust/issuers.json'), 'utf8')),
    runtimeProfile: JSON.parse(readFileSync(resolve(ROOT, 'infra/governance/providers/runtime-conformance.json'), 'utf8')),
    observedAt: '2026-07-24T00:00:00.000Z',
    prepareRoot: root => {
      const directoryPath = 'governance/locale-order-fixture'
      mkdirSync(resolve(root, directoryPath), { recursive: true })
      for (const name of localeNames) {
        writeFileSync(
          resolve(root, directoryPath, `${name}.json`),
          `${JSON.stringify({ name })}\n`,
        )
      }
      const manifestPath = resolve(root, 'packages/governance/canonical/manifest.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      manifest.sources.push({
        id: 'locale-directory-排序',
        ownerRepo: 'design-system',
        path: directoryPath,
        required: true,
      })
      for (const name of localeNames) {
        manifest.sources.push({
          id: `locale-${name}-source`,
          ownerRepo: 'design-system',
          path: `${directoryPath}/${name}.json`,
          required: true,
        })
      }
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    },
  })
  t.after(() => fixture.dispose())
  assert.equal(fixture.managedCiState.active, true)
  assert(localeNames.every(name => (
    fixture.managedCiState.activationTrustBundle.sources.some(
      source => source.id === `locale-${name}-source`,
    )
  )))

  const cleanEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => (
      !name.startsWith('GIT_')
      && !['LANG', 'LC_ALL', 'LC_CTYPE'].includes(name)
    )),
  )
  const invoke = locale => spawnSync(
    process.execPath,
    ['--', IMMUTABLE_SNAPSHOT_PROBE, fixture.managedCiState.root, '2026-07-24T00:00:00.000Z'],
    {
      cwd: fixture.managedCiState.root,
      encoding: 'utf8',
      env: { ...cleanEnvironment, LANG: locale, LC_ALL: locale },
      maxBuffer: 1024 * 1024,
      shell: false,
      timeout: 30_000,
    },
  )
  const locales = ['C', 'en_US.UTF-8', 'tr_TR.UTF-8', 'sv_SE.UTF-8', 'ja_JP.UTF-8']
  const baseline = invoke(locales[0])
  assert.equal(baseline.status, 0, baseline.stderr)
  const expected = JSON.parse(baseline.stdout)
  assert.equal(expected.active, true)
  for (const locale of locales.slice(1)) {
    const observed = invoke(locale)
    assert.equal(observed.status, 0, `${locale}:${observed.stderr}`)
    assert.deepEqual(JSON.parse(observed.stdout), expected, locale)
  }
})

test('activation receipt v2 requires current policy quorum, exact closure, bounded TTL, nonce, replay, and durable retention', t => {
  const state = activeState()
  const receipt = state.plan.activation.verificationReceipt
  assert.equal(state.active, true)
  assert.equal(state.activationEvidence.status, 'verified')
  assert.equal(receipt.schemaVersion, 2)
  assert.equal(receipt.kind, 'managed-ci-activation-verification-receipt-v2')
  assert.equal(receipt.signatures.length, state.trust.receiptPolicy.quorum)
  assert.deepEqual(state.activationEvidence.issuerKeyIds, receipt.signatures.map(item => item.issuerKeyId))
  assert.equal(receipt.verification.controlPlaneClosureVerified, true)
  assert.equal(receipt.verification.replayLedgerCommitVerified, true)
  assert.equal(receipt.aggregateHandoff.executionClassCount, CLASSES.length)
  assert.equal(receipt.aggregateHandoff.inventoryEntryCount, 18)
  assert.equal(receipt.aggregateHandoff.artifactFileCount, 19)
  assert.equal(receipt.aggregateHandoff.artifactRetentionDays, 90)
  assert.equal(receipt.aggregateHandoff.storageClass, 'github-actions-artifact-non-worm')
  assert.equal(new Set(Object.values(receipt.runtimeSourceDigests)).size, 1)
  assert.equal(new Set(Object.values(receipt.runtimeInventoryDigests)).size, CLASSES.length)
  assert.equal(
    state.activationTrustBundle.gitTree.executorSourceCommit,
    state.plan.activation.executorSourceCommit,
  )
  assert.equal(
    state.activationTrustBundle.gitTree.executorSourceTree,
    state.plan.activation.executorSourceTree,
  )
  assert.equal(state.activationTrustBundle.gitTree.fileCount > state.activationTrustBundle.files.length, true)
  assert.match(state.activationTrustBundle.gitTree.filesDigest, /^[a-f0-9]{64}$/)
  assert.equal(
    receipt.trustBinding.activationTrustBundleDigest,
    state.activationTrustBundle.bindingDigest,
  )
  assert.equal(receipt.trustBinding.executorSourceCommit, state.plan.activation.executorSourceCommit)
  assert.equal(receipt.trustBinding.executorSourceTree, state.plan.activation.executorSourceTree)
  assert.equal(
    receipt.trustBinding.trustTreeFilesDigest,
    state.activationTrustBundle.gitTree.filesDigest,
  )
  assert.equal(
    receipt.trustBinding.controlPlaneLockSha256,
    state.activationTrustBundle.controlPlaneLock.sha256,
  )
  assert.equal(
    receipt.trustBinding.controlPlaneLockBlobSha,
    state.activationTrustBundle.controlPlaneLock.blobSha,
  )
  assert.equal(
    receipt.trustBinding.controlPlaneSnapshotDigest,
    state.activationTrustBundle.controlPlaneLock.snapshotDigest,
  )
  assert.equal(
    receipt.trustBinding.generatedSnapshotDigest,
    state.activationTrustBundle.controlPlaneLock.generatedSnapshotDigest,
  )

  for (const [label, mutate, pattern] of [
    ['nonce', value => { value.activation.verificationReceipt.nonce = 'replayed' }, /schema validation failed/],
    ['ttl', value => {
      value.activation.verificationReceipt.expiresAt = '2026-08-08T00:00:00.000Z'
    }, /TTL\/replay\/archive retention lifecycle is invalid/],
    ['replay retention', value => {
      value.activation.verificationReceipt.replay.retentionUntil = '2026-07-25T00:00:00.000Z'
    }, /TTL\/replay\/archive retention lifecycle is invalid/],
    ['signature subject uniqueness', value => {
      value.activation.verificationReceipt.signatures.push(structuredClone(value.activation.verificationReceipt.signatures[0]))
    }, /signatures must use distinct issuer keys and subjects/],
  ]) {
    const poisoned = structuredClone(state.plan)
    mutate(poisoned)
    assert.throws(
      () => validateManagedCiTrustedExecutionPlan(poisoned, { repoRoot: state.root }),
      pattern,
      label,
    )
  }

  const expired = loadManagedCiTrustedExecutionPlan({
    repoRoot: state.root,
    now: new Date('2026-08-01T00:00:00.000Z'),
  })
  assert.equal(expired.active, false)
  assert(expired.activationEvidence.blockers.some(item => item.includes('expired')))

  const root = mkdtempSync(join(tmpdir(), 'managed-ci-receipt-v2-attack-'))
  cpSync(state.root, root, { recursive: true })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const planPath = resolve(root, 'scripts/managed-ci-trusted-execution-plan.json')
  const closurePoison = JSON.parse(readFileSync(planPath, 'utf8'))
  closurePoison.activation.verificationReceipt.trustBinding.sourceSetDigest = SHA('substituted-control-plane')
  writeFileSync(planPath, `${JSON.stringify(closurePoison, null, 2)}\n`)
  const closureState = loadManagedCiTrustedExecutionPlan({
    repoRoot: root,
    now: new Date('2026-07-24T00:00:00.000Z'),
  })
  assert.equal(closureState.active, false)
  assert(closureState.activationEvidence.blockers.some(item => item.includes('complete manifest/build-graph control-plane closure')))

  const identityRoot = mkdtempSync(join(tmpdir(), 'managed-ci-workflow-source-identity-'))
  cpSync(state.root, identityRoot, { recursive: true })
  t.after(() => rmSync(identityRoot, { recursive: true, force: true }))
  const identityPlanPath = resolve(identityRoot, 'scripts/managed-ci-trusted-execution-plan.json')
  const identityPlan = JSON.parse(readFileSync(identityPlanPath, 'utf8'))
  identityPlan.activation.builderWorkflowSha = '3'.repeat(40)
  identityPlan.activation.verificationReceipt.declarationDigest = managedCiActivationDeclarationDigest(identityPlan)
  writeFileSync(identityPlanPath, `${JSON.stringify(identityPlan, null, 2)}\n`)
  assert.throws(
    () => loadManagedCiTrustedExecutionPlan({
      repoRoot: identityRoot,
      now: new Date('2026-07-24T00:00:00.000Z'),
    }),
    /github\.workflow_sha and github\.sha do not identify the same protected revision/,
  )

  const policyRoot = mkdtempSync(join(tmpdir(), 'managed-ci-receipt-v2-policy-'))
  cpSync(state.root, policyRoot, { recursive: true })
  t.after(() => rmSync(policyRoot, { recursive: true, force: true }))
  const ringsPath = resolve(policyRoot, 'infra/governance/release-rings.json')
  const rings = JSON.parse(readFileSync(ringsPath, 'utf8'))
  rings.attestationPolicy.allowedKeyIds = []
  writeFileSync(ringsPath, `${JSON.stringify(rings, null, 2)}\n`)
  const policyState = loadManagedCiTrustedExecutionPlan({
    repoRoot: policyRoot,
    now: new Date('2026-07-24T00:00:00.000Z'),
  })
  assert.equal(policyState.active, false)
  assert(policyState.activationEvidence.blockers.some(item => item.includes('allowed-key policy is not activated')))

  const quorumRoot = mkdtempSync(join(tmpdir(), 'managed-ci-receipt-v2-quorum-'))
  cpSync(state.root, quorumRoot, { recursive: true })
  t.after(() => rmSync(quorumRoot, { recursive: true, force: true }))
  const quorumRingsPath = resolve(quorumRoot, 'infra/governance/release-rings.json')
  const quorumRings = JSON.parse(readFileSync(quorumRingsPath, 'utf8'))
  quorumRings.attestationPolicy.completionAttestationQuorum = 2
  writeFileSync(quorumRingsPath, `${JSON.stringify(quorumRings, null, 2)}\n`)
  const quorumState = loadManagedCiTrustedExecutionPlan({
    repoRoot: quorumRoot,
    now: new Date('2026-07-24T00:00:00.000Z'),
  })
  assert.equal(quorumState.active, false)
  assert(quorumState.activationEvidence.blockers.some(item => item.includes('distinct-subject quorum 2')))

  for (const [label, poison] of [
    ['source closure', lock => { lock.sources.pop() }],
    ['skill parity', lock => { lock.skillParity[0].targetSkills.pop() }],
    ['contract header', lock => {
      lock.contractDigest = `sha256:${'a'.repeat(64)}`
      lock._provenance.contractDigest = lock.contractDigest
    }],
    ['snapshot', lock => { lock.snapshotDigest = `sha256:${'b'.repeat(64)}` }],
  ]) {
    const attackRoot = mkdtempSync(join(tmpdir(), `managed-ci-control-plane-${label.replace(' ', '-')}-`))
    cpSync(state.root, attackRoot, { recursive: true })
    t.after(() => rmSync(attackRoot, { recursive: true, force: true }))
    const attackPlan = JSON.parse(readFileSync(resolve(attackRoot, 'scripts/managed-ci-trusted-execution-plan.json'), 'utf8'))
    const lockPath = resolve(attackRoot, attackPlan.activationTrustBundle.controlPlaneLockPath)
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    poison(lock)
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
    const attacked = loadManagedCiTrustedExecutionPlan({
      repoRoot: attackRoot,
      now: new Date('2026-07-24T00:00:00.000Z'),
    })
    assert.equal(attacked.active, false, label)
    assert(attacked.activationTrustBundle.blockers.some(
      item => item.includes('tracked or untracked trust-path drift')
        && item.includes(attackPlan.activationTrustBundle.controlPlaneLockPath),
    ), label)
    assert.equal(attacked.activationTrustBundle.bindingDigest, state.activationTrustBundle.bindingDigest, label)
  }

  const synchronizedSnapshotRoot = mkdtempSync(join(tmpdir(), 'managed-ci-control-plane-synchronized-poison-'))
  cpSync(state.root, synchronizedSnapshotRoot, { recursive: true })
  t.after(() => rmSync(synchronizedSnapshotRoot, { recursive: true, force: true }))
  const synchronizedPlan = JSON.parse(readFileSync(
    resolve(synchronizedSnapshotRoot, 'scripts/managed-ci-trusted-execution-plan.json'),
    'utf8',
  ))
  const synchronizedManifest = JSON.parse(readFileSync(
    resolve(synchronizedSnapshotRoot, synchronizedPlan.activationTrustBundle.manifestPath),
    'utf8',
  ))
  const poisonedOutputPath = resolve(
    synchronizedSnapshotRoot,
    synchronizedManifest.outputDirectory,
    'PROVENANCE.md',
  )
  const poisonedOutput = Buffer.from(`${readFileSync(poisonedOutputPath, 'utf8')}\n<!-- synchronized poison -->\n`)
  writeFileSync(poisonedOutputPath, poisonedOutput)
  const synchronizedLockPath = resolve(
    synchronizedSnapshotRoot,
    synchronizedPlan.activationTrustBundle.controlPlaneLockPath,
  )
  const synchronizedLock = JSON.parse(readFileSync(synchronizedLockPath, 'utf8'))
  const synchronizedEntry = synchronizedLock.files.find(entry => entry.path === 'PROVENANCE.md')
  assert(synchronizedEntry)
  synchronizedEntry.hash = governanceDigest(poisonedOutput)
  synchronizedEntry.size = poisonedOutput.length
  synchronizedLock.snapshotDigest = governanceTreeDigest(synchronizedLock.files)
  writeFileSync(synchronizedLockPath, `${JSON.stringify(synchronizedLock, null, 2)}\n`)
  const synchronizedAttack = loadManagedCiTrustedExecutionPlan({
    repoRoot: synchronizedSnapshotRoot,
    now: new Date('2026-07-24T00:00:00.000Z'),
  })
  assert.equal(synchronizedAttack.active, false)
  assert(synchronizedAttack.activationTrustBundle.blockers.some(
    item => item.includes('tracked or untracked trust-path drift')
      && item.includes('governance/generated/PROVENANCE.md'),
  ))
  assert.equal(
    synchronizedAttack.activationTrustBundle.bindingDigest,
    state.activationTrustBundle.bindingDigest,
  )

  const untrackedRoot = mkdtempSync(join(tmpdir(), 'managed-ci-untracked-trust-source-'))
  cpSync(state.root, untrackedRoot, { recursive: true })
  t.after(() => rmSync(untrackedRoot, { recursive: true, force: true }))
  const directorySource = state.activationTrustBundle.sources.find(source => source.type === 'directory')
  assert(directorySource)
  const untrackedRelativePath = `${directorySource.path.replace(/\/+$/, '')}/untracked-activation-poison.txt`
  const untrackedPath = resolve(untrackedRoot, untrackedRelativePath)
  mkdirSync(dirname(untrackedPath), { recursive: true })
  writeFileSync(untrackedPath, 'untracked bytes must never enter activation trust\n')
  const untrackedAttack = loadManagedCiTrustedExecutionPlan({
    repoRoot: untrackedRoot,
    now: new Date('2026-07-24T00:00:00.000Z'),
  })
  assert.equal(untrackedAttack.active, false)
  assert(untrackedAttack.activationTrustBundle.blockers.some(
    item => item.includes('tracked or untracked trust-path drift')
      && item.includes(untrackedRelativePath),
  ))
  assert.equal(
    untrackedAttack.activationTrustBundle.bindingDigest,
    state.activationTrustBundle.bindingDigest,
  )
  assert.equal(
    untrackedAttack.activationTrustBundle.gitTree.filesDigest,
    state.activationTrustBundle.gitTree.filesDigest,
  )

  const hiddenIndexRoot = mkdtempSync(join(tmpdir(), 'managed-ci-assume-unchanged-trust-source-'))
  cpSync(state.root, hiddenIndexRoot, { recursive: true })
  t.after(() => rmSync(hiddenIndexRoot, { recursive: true, force: true }))
  const manifestRelativePath = 'packages/governance/canonical/manifest.json'
  const closedGitEnvironment = {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    HOME: '/dev/null',
    LANG: 'C',
    LC_ALL: 'C',
    PATH: '/usr/bin:/bin',
  }
  const assumeUnchanged = spawnSync(
    '/usr/bin/git',
    ['--no-replace-objects', 'update-index', '--assume-unchanged', '--', manifestRelativePath],
    {
      cwd: hiddenIndexRoot,
      encoding: 'utf8',
      env: closedGitEnvironment,
      shell: false,
    },
  )
  assert.equal(assumeUnchanged.status, 0, assumeUnchanged.stderr)
  const hiddenManifestPath = resolve(hiddenIndexRoot, manifestRelativePath)
  const hiddenManifestBytes = readFileSync(hiddenManifestPath)
  assert.equal(hiddenManifestBytes[0], 0x7b)
  assert.equal(hiddenManifestBytes[1], 0x0a)
  const hiddenManifestPoison = Buffer.from(hiddenManifestBytes)
  hiddenManifestPoison[1] = 0x20
  writeFileSync(hiddenManifestPath, hiddenManifestPoison)
  const indexMediatedDiff = spawnSync(
    '/usr/bin/git',
    [
      '--no-replace-objects',
      'diff',
      '--name-only',
      '--no-ext-diff',
      state.plan.activation.executorSourceCommit,
      '--',
      manifestRelativePath,
    ],
    {
      cwd: hiddenIndexRoot,
      encoding: 'utf8',
      env: closedGitEnvironment,
      shell: false,
    },
  )
  assert.equal(indexMediatedDiff.status, 0, indexMediatedDiff.stderr)
  assert.equal(indexMediatedDiff.stdout, '')
  const hiddenIndexAttack = loadManagedCiTrustedExecutionPlan({
    repoRoot: hiddenIndexRoot,
    now: new Date('2026-07-24T00:00:00.000Z'),
  })
  assert.equal(hiddenIndexAttack.active, false)
  assert(hiddenIndexAttack.activationTrustBundle.blockers.some(
    item => item.includes('tracked or untracked trust-path drift')
      && item.includes(manifestRelativePath),
  ))

  const filterAttackRoot = mkdtempSync(join(tmpdir(), 'managed-ci-clean-filter-trust-source-'))
  cpSync(state.root, filterAttackRoot, { recursive: true })
  t.after(() => rmSync(filterAttackRoot, { recursive: true, force: true }))
  const filterScriptPath = resolve(filterAttackRoot, '.git/activation-clean-filter.sh')
  const filterMarkerPath = resolve(filterAttackRoot, '.git/activation-clean-filter-ran')
  writeFileSync(
    filterScriptPath,
    `#!/bin/sh\n/usr/bin/touch '${filterMarkerPath}'\n/bin/cat\n`,
  )
  chmodSync(filterScriptPath, 0o700)
  writeFileSync(
    resolve(filterAttackRoot, '.git/info/attributes'),
    `${manifestRelativePath} filter=activation-mask\n`,
  )
  const configureFilter = spawnSync(
    '/usr/bin/git',
    ['--no-replace-objects', 'config', '--local', 'filter.activation-mask.clean', filterScriptPath],
    {
      cwd: filterAttackRoot,
      encoding: 'utf8',
      env: closedGitEnvironment,
      shell: false,
    },
  )
  assert.equal(configureFilter.status, 0, configureFilter.stderr)
  const filterManifestPath = resolve(filterAttackRoot, manifestRelativePath)
  const filterManifestBytes = readFileSync(filterManifestPath)
  const filterManifestPoison = Buffer.from(filterManifestBytes)
  filterManifestPoison[1] = filterManifestPoison[1] === 0x0a ? 0x20 : 0x0a
  writeFileSync(filterManifestPath, filterManifestPoison)
  assert.equal(existsSync(filterMarkerPath), false)
  const filterAttack = loadManagedCiTrustedExecutionPlan({
    repoRoot: filterAttackRoot,
    now: new Date('2026-07-24T00:00:00.000Z'),
  })
  assert.equal(filterAttack.active, false)
  assert(filterAttack.activationTrustBundle.blockers.some(
    item => item.includes('tracked or untracked trust-path drift')
      && item.includes(manifestRelativePath),
  ))
  assert.equal(existsSync(filterMarkerPath), false)

  const treeMismatchRoot = mkdtempSync(join(tmpdir(), 'managed-ci-executor-tree-mismatch-'))
  cpSync(state.root, treeMismatchRoot, { recursive: true })
  t.after(() => rmSync(treeMismatchRoot, { recursive: true, force: true }))
  const treeMismatchPlanPath = resolve(treeMismatchRoot, 'scripts/managed-ci-trusted-execution-plan.json')
  const treeMismatchPlan = JSON.parse(readFileSync(treeMismatchPlanPath, 'utf8'))
  treeMismatchPlan.activation.executorSourceTree = '0'.repeat(40)
  treeMismatchPlan.activation.verificationReceipt.declarationDigest =
    managedCiActivationDeclarationDigest(treeMismatchPlan)
  writeFileSync(treeMismatchPlanPath, `${JSON.stringify(treeMismatchPlan, null, 2)}\n`)
  assert.throws(
    () => loadManagedCiTrustedExecutionPlan({
      repoRoot: treeMismatchRoot,
      now: new Date('2026-07-24T00:00:00.000Z'),
    }),
    /executorSourceTree does not equal the exact declared commit tree/,
  )

  const corruptTreeRoot = mkdtempSync(join(tmpdir(), 'managed-ci-corrupt-tree-object-'))
  cpSync(state.root, corruptTreeRoot, { recursive: true })
  t.after(() => rmSync(corruptTreeRoot, { recursive: true, force: true }))
  const selectedTree = state.plan.activation.executorSourceTree
  const selectedTreeObjectPath = resolve(
    corruptTreeRoot,
    '.git',
    'objects',
    selectedTree.slice(0, 2),
    selectedTree.slice(2),
  )
  assert.equal(existsSync(selectedTreeObjectPath), true)
  const selectedTreeRead = spawnSync(
    '/usr/bin/git',
    ['--no-replace-objects', 'cat-file', 'tree', selectedTree],
    { cwd: corruptTreeRoot, encoding: null, shell: false },
  )
  assert.equal(selectedTreeRead.status, 0, selectedTreeRead.stderr?.toString())
  const corruptTreeBytes = Buffer.concat([selectedTreeRead.stdout, Buffer.from('corrupt-tree-object')])
  chmodSync(selectedTreeObjectPath, 0o600)
  writeFileSync(
    selectedTreeObjectPath,
    deflateSync(Buffer.concat([
      Buffer.from(`tree ${corruptTreeBytes.length}\0`, 'utf8'),
      corruptTreeBytes,
    ])),
  )
  assert.throws(
    () => loadManagedCiTrustedExecutionPlan({
      repoRoot: corruptTreeRoot,
      now: new Date('2026-07-24T00:00:00.000Z'),
    }),
    /root tree object Git object bytes do not match the captured object ID/,
  )

  const controlPathRoot = mkdtempSync(join(tmpdir(), 'managed-ci-control-path-tree-'))
  cpSync(state.root, controlPathRoot, { recursive: true })
  t.after(() => rmSync(controlPathRoot, { recursive: true, force: true }))
  const controlPath = 'invalid\nactivation-path'
  writeFileSync(resolve(controlPathRoot, controlPath), 'must be rejected before trust projection\n')
  const controlGitOptions = {
    cwd: controlPathRoot,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-07-24T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-07-24T00:00:00Z',
    },
  }
  const controlAdd = spawnSync(
    '/usr/bin/git',
    ['--no-replace-objects', 'add', '--', controlPath],
    controlGitOptions,
  )
  assert.equal(controlAdd.status, 0, controlAdd.stderr)
  const controlCommit = spawnSync('/usr/bin/git', [
    '--no-replace-objects',
    '-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0',
    '-c', 'gc.autoDetach=false',
    '-c', 'user.name=Managed CI Attack Test',
    '-c', 'user.email=managed-ci-attack@example.invalid',
    'commit', '--quiet', '--no-gpg-sign', '-m', 'control path attack',
  ], controlGitOptions)
  assert.equal(controlCommit.status, 0, controlCommit.stderr)
  const controlCommitSha = spawnSync(
    '/usr/bin/git',
    ['--no-replace-objects', 'rev-parse', '--verify', 'HEAD^{commit}'],
    controlGitOptions,
  ).stdout.trim()
  const controlTreeSha = spawnSync(
    '/usr/bin/git',
    ['--no-replace-objects', 'rev-parse', 'HEAD^{tree}'],
    controlGitOptions,
  ).stdout.trim()
  const controlPlanPath = resolve(controlPathRoot, 'scripts/managed-ci-trusted-execution-plan.json')
  const controlPlan = JSON.parse(readFileSync(controlPlanPath, 'utf8'))
  controlPlan.activation.executorSourceCommit = controlCommitSha
  controlPlan.activation.executorSourceTree = controlTreeSha
  controlPlan.activation.builderWorkflowSha = controlCommitSha
  controlPlan.activation.verificationReceipt.declarationDigest =
    managedCiActivationDeclarationDigest(controlPlan)
  writeFileSync(controlPlanPath, `${JSON.stringify(controlPlan, null, 2)}\n`)
  assert.throws(
    () => loadManagedCiTrustedExecutionPlan({
      repoRoot: controlPathRoot,
      now: new Date('2026-07-24T00:00:00.000Z'),
    }),
    /recursive tree inventory path path is unsafe/,
  )

  const receiptSourceMismatchRoot = mkdtempSync(join(tmpdir(), 'managed-ci-receipt-source-mismatch-'))
  cpSync(state.root, receiptSourceMismatchRoot, { recursive: true })
  t.after(() => rmSync(receiptSourceMismatchRoot, { recursive: true, force: true }))
  const receiptSourcePlanPath = resolve(
    receiptSourceMismatchRoot,
    'scripts/managed-ci-trusted-execution-plan.json',
  )
  const receiptSourcePlan = JSON.parse(readFileSync(receiptSourcePlanPath, 'utf8'))
  receiptSourcePlan.activation.verificationReceipt.trustBinding.executorSourceCommit = 'f'.repeat(40)
  writeFileSync(receiptSourcePlanPath, `${JSON.stringify(receiptSourcePlan, null, 2)}\n`)
  const receiptSourceAttack = loadManagedCiTrustedExecutionPlan({
    repoRoot: receiptSourceMismatchRoot,
    now: new Date('2026-07-24T00:00:00.000Z'),
  })
  assert.equal(receiptSourceAttack.active, false)
  assert(receiptSourceAttack.activationEvidence.blockers.some(
    item => item.includes('complete manifest/build-graph control-plane closure'),
  ))
})

test('managed executor builder trigger is an exact protected-default projection of canonical repository dispatch policy', () => {
  const state = loadManagedCiTrustedExecutionPlan({ repoRoot: ROOT })
  const builder = state.executorSupplyChain.policy.builder
  const attestations = state.executorSupplyChain.policy.attestations
  const workflowSource = readFileSync(resolve(ROOT, builder.workflowPath), 'utf8')
  assert.equal(createHash('sha256').update(workflowSource).digest('hex'), builder.workflowSourceSha256)
  assert.equal(builder.trigger.eventName, 'repository_dispatch')
  assert.equal(builder.trigger.workflowSourceMode, 'default-branch-head')
  assert.equal(builder.trigger.branchSelectable, false)
  assert.equal(attestations.provenance.buildContextArchiveMtimeRequired, true)
  assert.equal(attestations.provenance.buildContextArchiveDigestRequired, true)
  assert.equal(attestations.provenance.prePushContextValidationRequired, true)
  assert.equal(attestations.sbom.registryCredentialAuthority, 'ghcr.io')
  assert.equal(validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource,
  }), true)

  const postPushOnlyValidation = structuredClone(attestations)
  postPushOnlyValidation.provenance.prePushContextValidationRequired = false
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations: postPushOnlyValidation,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource,
  }), /attestation projection/,
  )

  const legacy = structuredClone(builder)
  legacy.trigger.eventName = 'workflow_dispatch'
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder: legacy,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource,
  }), /not protected-default repository dispatch/)

  const substitutedType = structuredClone(builder)
  substitutedType.trigger.activityType = 'substituted-request'
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder: substitutedType,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource,
  }), /workflow bytes differ|trigger projection differs/)

  const extraTrigger = workflowSource.replace(
    '  repository_dispatch:\n',
    '  workflow_dispatch:\n  repository_dispatch:\n',
  )
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: extraTrigger,
  }), /trigger projection differs/)

  const unguarded = workflowSource.replace("github.ref == 'refs/heads/main'", "github.ref == 'refs/heads/feature'")
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: unguarded,
  }), /workflow bytes differ|protected-default ref guard/)

  const combinedAuthority = workflowSource.replace(
    '      packages: write\n',
    '      packages: write\n      id-token: write\n',
  )
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: combinedAuthority,
  }), /image builder permissions|combines registry write/)

  const substitutedHandoff = workflowSource.replace(
    '          artifact-ids: ${{ needs.bind-image-set.outputs.artifact_id }}',
    '          name: managed-ci-image-set-${{ github.run_id }}-${{ github.run_attempt }}',
  )
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: substitutedHandoff,
  }), /artifact download step with|does not rebind the exact image-set artifact ID/)

  const registryMutation = workflowSource.replace('          push-to-registry: false', '          push-to-registry: true')
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: registryMutation,
  }), /provenance attestation step with|can mutate the registry/)

  const duplicateHandoff = workflowSource
    .replace('          predicate-type: https://slsa.dev/provenance/v1', '          predicate-type: https://qijenchen.dev/attestations/managed-ci-image-handoff/v2')
    .replace('          predicate-path: ${{ steps.image.outputs.provenance }}', '          predicate-path: ${{ steps.image.outputs.predicate }}')
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: duplicateHandoff,
  }), /SLSA provenance attestation step with/)

  const substitutedSbom = workflowSource.replace(
    '          sbom-path: ${{ steps.image.outputs.sbom }}',
    '          sbom-path: /tmp/unbound.cdx.json',
  )
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: substitutedSbom,
  }), /CycloneDX attestation step with/)

  const workflowSecret = workflowSource.replace(
    'permissions: {}\n',
    'permissions: {}\n\nenv:\n  CANDIDATE_SECRET: ${{ secrets.CANDIDATE_SECRET }}\n',
  )
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: workflowSecret,
  }), /workflow key closure/)

  const candidateContainer = workflowSource.replace(
    "  attest-image:\n    if: github.ref == 'refs/heads/main'\n    needs: bind-image-set\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n",
    "  attest-image:\n    if: github.ref == 'refs/heads/main'\n    needs: bind-image-set\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n    container: ghcr.io/example/candidate:latest\n",
  )
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: candidateContainer,
  }), /attestation job key closure/)

  const arbitraryAttesterStep = workflowSource.replace(
    '      - name: Upload the exact offline evidence as a non-WORM GitHub handoff\n',
    '      - name: Execute unreviewed local action\n        uses: ./candidate-action\n\n      - name: Upload the exact offline evidence as a non-WORM GitHub handoff\n',
  )
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: arbitraryAttesterStep,
  }), /attestation step closure/)

  const appendedOidcProgram = workflowSource.replace(
    '          echo "predicate=$PREDICATE" >> "$GITHUB_OUTPUT"',
    '          node ./candidate-owned.mjs\n          echo "predicate=$PREDICATE" >> "$GITHUB_OUTPUT"',
  )
  assert.notEqual(appendedOidcProgram, workflowSource)
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: appendedOidcProgram,
  }), /run program differs from the exact canonical SHA-256/)

  const substitutedProvenanceOutput = workflowSource.replace(
    '          echo "provenance=$PROVENANCE" >> "$GITHUB_OUTPUT"',
    '          echo "provenance=$PREDICATE" >> "$GITHUB_OUTPUT"',
  )
  assert.notEqual(substitutedProvenanceOutput, workflowSource)
  assert.throws(() => validateManagedCiExecutorBuilderTrigger({
    builder,
    attestations,
    protectedRef: state.executorSupplyChain.policy.source.protectedRef,
    workflowSource: substitutedProvenanceOutput,
  }), /run program differs from the exact canonical SHA-256/)

  const rejectMutatedWorkflow = (label, candidate) => {
    assert.notEqual(candidate, workflowSource, `${label}: fixture mutation did not apply`)
    assert.throws(() => validateManagedCiExecutorBuilderTrigger({
      builder,
      attestations,
      protectedRef: state.executorSupplyChain.policy.source.protectedRef,
      workflowSource: candidate,
    }), /managed CI trusted execution blocked:/, label)
  }
  const adversarialMutations = [
    [
      'build writer shell cannot append a post-logout registry command',
      workflowSource.replace(
        '          /usr/bin/docker logout ghcr.io\n',
        '          /usr/bin/docker logout ghcr.io\n          /usr/bin/docker login ghcr.io\n',
      ),
    ],
    [
      'SBOM shell cannot append a second credential-bearing process',
      workflowSource.replace(
        '              --output "cyclonedx-json=$RUNNER_TEMP/managed-ci-image-binding/${{ matrix.execution-class }}.cdx.json"\n',
        '              --output "cyclonedx-json=$RUNNER_TEMP/managed-ci-image-binding/${{ matrix.execution-class }}.cdx.json"\n          /usr/bin/docker pull "$IMAGE_REF"\n',
      ),
    ],
    [
      'digest binder shell cannot append an unreviewed command',
      workflowSource.replace(
        '          echo "manifest_sha256=$MANIFEST_SHA256" >> "$GITHUB_OUTPUT"\n',
        '          echo "manifest_sha256=$MANIFEST_SHA256" >> "$GITHUB_OUTPUT"\n          node ./candidate-owned.mjs\n',
      ),
    ],
    [
      'setup action cannot redownload Buildx through a version input',
      workflowSource.replace(
        '          driver: docker-container\n',
        '          version: v0.35.0\n          driver: docker-container\n',
      ),
    ],
    [
      'BuildKit cannot regain insecure entitlements',
      workflowSource.replace(
        '          buildkitd-flags: --debug=false\n',
        '          buildkitd-flags: --allow-insecure-entitlement security.insecure\n',
      ),
    ],
    [
      'image build cannot regain ambient network access',
      workflowSource.replace('            --network none \\\n', '            --network host \\\n'),
    ],
    [
      'build shell cannot emit its own provenance',
      workflowSource.replace('            --provenance=false \\\n', '            --provenance=mode=max \\\n'),
    ],
    [
      'build shell cannot emit its own SBOM',
      workflowSource.replace('            --sbom=false \\\n', '            --sbom=true \\\n'),
    ],
    [
      'Syft registry credentials cannot escape GHCR',
      workflowSource.replace(
        '            SYFT_REGISTRY_AUTH_AUTHORITY="ghcr.io" \\\n',
        '            SYFT_REGISTRY_AUTH_AUTHORITY="docker.io" \\\n',
      ),
    ],
    [
      'the exact build context archive cannot be dropped from the pre-scan handoff',
      workflowSource.replace(
        '            ${{ runner.temp }}/managed-ci-image-binding/${{ matrix.execution-class }}.tar\n',
        '',
      ),
    ],
    [
      'writer cannot use ambient Docker credentials',
      poisonClosedBuilderWorkflow(
        workflowSource,
        '          printf \'DOCKER_CONFIG=%s/managed-ci-docker-config\\n\' "$RUNNER_TEMP" >> "$GITHUB_ENV"\n',
        '          printf \'DOCKER_CONFIG=%s/.docker\\n\' "$HOME" >> "$GITHUB_ENV"\n',
      ),
    ],
    [
      'Buildx binary digest cannot be substituted',
      workflowSource.replace(
        'd41ece72044243b4f58b343441ae37446d9c29a7d6b5e11c61847bbcf8f7dfda',
        'a'.repeat(64),
      ),
    ],
    [
      'material file set cannot contain a duplicate canonical policy path',
      workflowSource.replace(
        '            infra/governance/providers/managed-ci-executor-supply-chain.json \\\n            infra/governance/schemas/managed-ci-executor-supply-chain.schema.json\n',
        '            infra/governance/providers/managed-ci-executor-supply-chain.json \\\n            infra/governance/providers/managed-ci-executor-supply-chain.json \\\n            infra/governance/schemas/managed-ci-executor-supply-chain.schema.json\n',
      ),
    ],
    [
      'Syft archive digest cannot be substituted',
      workflowSource.replace(
        '0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509',
        'b'.repeat(64),
      ),
    ],
    [
      'Syft binary digest cannot be substituted',
      workflowSource.replace(
        '6c1eb5c6f15c177fa3dd727ee186c61a660a3939a4e1dc1bc4b3e00eafec098e',
        'c'.repeat(64),
      ),
    ],
    [
      'Syft materialization cannot receive the registry token',
      workflowSource.replace(
        '      - name: Materialize exact Syft bytes without any registry credential\n        run: |\n',
        '      - name: Materialize exact Syft bytes without any registry credential\n        env:\n          GHCR_READ_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n        run: |\n',
      ),
    ],
    [
      'opaque third-party SBOM action cannot be reintroduced',
      workflowSource.replace(
        '      - name: Retain the scanned image binding as a non-WORM GitHub handoff\n',
        '      - name: Generate an opaque SBOM\n        uses: anchore/sbom-action@e22c389904149dbc22b58101806040fa8d37a610\n\n      - name: Retain the scanned image binding as a non-WORM GitHub handoff\n',
      ),
    ],
    [
      'even a nonsemantic workflow byte change requires explicit policy review',
      workflowSource.replace(
        'name: Build managed CI executors\n',
        'name: Build managed CI executors\n# reviewed-byte-set changed\n',
      ),
    ],
  ]
  for (const [label, candidate] of adversarialMutations) rejectMutatedWorkflow(label, candidate)
})

test('managed executor context closes Dockerfile frontend, base image, ignore semantics, and effective files', () => {
  const state = loadManagedCiTrustedExecutionPlan({ repoRoot: ROOT })
  const { builder, source } = state.executorSupplyChain.policy
  const recipeSource = readFileSync(resolve(ROOT, source.recipePath), 'utf8')
  const dockerignoreSource = readFileSync(resolve(ROOT, source.dockerignorePath), 'utf8')
  const contextFiles = [
    '.dockerignore',
    'Containerfile',
    'authority/managed-ci-authority-client.mjs',
    'host/managed-ci-sandbox-launch.mjs',
    'runtime/managed-ci-runtime.mjs',
  ]
  assert.equal(validateManagedCiExecutorBuildContext({
    builder, source, recipeSource, dockerignoreSource, contextFiles,
  }), true)
  assert.throws(() => validateManagedCiExecutorBuildContext({
    builder,
    source,
    recipeSource: recipeSource.replace(builder.baseImage.subjectDigest, `sha256:${'a'.repeat(64)}`),
    dockerignoreSource,
    contextFiles,
  }), /immutable base image differs/)
  assert.throws(() => validateManagedCiExecutorBuildContext({
    builder,
    source,
    recipeSource: recipeSource.replace(builder.dockerfileFrontend.subjectDigest, `sha256:${'b'.repeat(64)}`),
    dockerignoreSource,
    contextFiles,
  }), /immutable Dockerfile frontend differs/)
  assert.throws(() => validateManagedCiExecutorBuildContext({
    builder,
    source,
    recipeSource,
    dockerignoreSource: `${dockerignoreSource}!authority/\n`,
    contextFiles,
  }), /.dockerignore bytes differs/)
  assert.throws(() => validateManagedCiExecutorBuildContext({
    builder,
    source,
    recipeSource,
    dockerignoreSource,
    contextFiles: contextFiles.filter(path => path !== 'runtime/managed-ci-runtime.mjs'),
  }), /effective build context differs/)
})

test('plan and authority schemas reject permission, isolation, activation, and nested policy weakening', () => {
  const state = loadManagedCiTrustedExecutionPlan({ repoRoot: ROOT })
  const planPoisons = [
    value => { value.unexpected = true },
    value => { value.executionClasses[0].permissions.packages = 'write' },
    value => { value.executionClasses[1].network.allowedHosts = ['example.com'] },
    value => { value.executionClasses[2].isolation.hostSocketMounted = true },
    value => { value.activation.executionClasses['model-broker'].imageDigest = `sha256:${'a'.repeat(64)}` },
    value => { value.activation.repositoryId = '42' },
    value => { value.activationTrustBundle.sourceResolvers = ['provider-contract', 'root-provider-views'] },
  ]
  for (const poison of planPoisons) {
    const value = structuredClone(state.plan)
    poison(value)
    assert.throws(() => validateManagedCiTrustedExecutionPlan(value, { repoRoot: ROOT }), /blocked:/)
  }

  const authority = structuredClone(state.trustedAuthority.policy)
  assert.equal(validateSchema('infra/governance/schemas/managed-ci-trusted-authority-policy.schema.json', authority), true)
  authority.candidateBoundary.processBoundary.hostPid = true
  assert.equal(validateSchema('infra/governance/schemas/managed-ci-trusted-authority-policy.schema.json', authority), false)
  const validatorPathPoison = structuredClone(state.trustedAuthority.policy)
  validatorPathPoison.receiptSigner.rawReceiptValidation.validatorSourcePath = 'scripts/lib/substituted-validator.mjs'
  assert.equal(validateSchema('infra/governance/schemas/managed-ci-trusted-authority-policy.schema.json', validatorPathPoison), false)
  const validatorDigestPoison = structuredClone(state.trustedAuthority.policy)
  validatorDigestPoison.receiptSigner.rawReceiptValidation.validatorSourceSha256 = SHA('substituted-validator')
  assert.equal(validateSchema('infra/governance/schemas/managed-ci-trusted-authority-policy.schema.json', validatorDigestPoison), false)
  const protocolDigestPoison = structuredClone(state.trustedAuthority.policy)
  protocolDigestPoison.receiptSigner.finalizationProtocol.schemaSha256 = SHA('substituted-finalization-protocol')
  assert.equal(validateSchema('infra/governance/schemas/managed-ci-trusted-authority-policy.schema.json', protocolDigestPoison), false)

  const supplyChain = structuredClone(state.executorSupplyChain.policy)
  assert.equal(validateSchema('infra/governance/schemas/managed-ci-executor-supply-chain.schema.json', supplyChain), true)
  supplyChain.externalDeployments.authorityClient.includedInExecutorImages = true
  assert.equal(validateSchema('infra/governance/schemas/managed-ci-executor-supply-chain.schema.json', supplyChain), false)
  const privilegePoison = structuredClone(state.executorSupplyChain.policy)
  privilegePoison.builder.privilegeSeparation.combinedRegistryAndOidcAuthorityForbidden = false
  assert.equal(validateSchema('infra/governance/schemas/managed-ci-executor-supply-chain.schema.json', privilegePoison), false)
})

test('content-addressed schema reuse never accepts a changed same-ID schema', t => {
  const state = loadManagedCiTrustedExecutionPlan({ repoRoot: ROOT })
  const root = mkdtempSync(join(tmpdir(), 'managed-ci-schema-cache-test-'))
  const schemaPath = resolve(root, 'scripts/schemas/managed-ci-trusted-execution-plan.schema.json')
  mkdirSync(dirname(schemaPath), { recursive: true })
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const canonicalSchemaBytes = readFileSync(resolve(ROOT, 'scripts/schemas/managed-ci-trusted-execution-plan.schema.json'))
  writeFileSync(schemaPath, canonicalSchemaBytes)
  assert.equal(validateManagedCiTrustedExecutionPlan(state.plan, { repoRoot: root }), true)

  const poison = JSON.parse(canonicalSchemaBytes)
  poison.not = {}
  writeFileSync(schemaPath, `${JSON.stringify(poison)}\n`)
  assert.throws(
    () => validateManagedCiTrustedExecutionPlan(state.plan, { repoRoot: root }),
    /schema validation failed/,
    'a stale validator keyed only by schema ID would accept this same-ID poison',
  )

  writeFileSync(schemaPath, canonicalSchemaBytes)
  assert.equal(validateManagedCiTrustedExecutionPlan(state.plan, { repoRoot: root }), true)
})

test('activated workflow document has tokenless candidates and isolated OIDC authority jobs without phantom request files', () => {
  const base = loadManagedCiTrustedExecutionPlan({ repoRoot: ROOT })
  const state = activeState(base)
  const document = managedCiActivatedWorkflowDocument(state.plan, base.activatedWorkflowContract.contract)
  assert.deepEqual(Object.keys(document.jobs).sort(), [...CLASSES, 'freeze-subject-authority', 'sandbox-session-authority', 'receipt-finalizer-authority'].sort())
  for (const id of CLASSES) {
    const job = document.jobs[id]
    assert.equal(job.permissions['id-token'], 'none')
    assert.equal(job.environment, undefined)
    assert.equal(job.container, undefined)
    const run = job.steps.find(step => step.run)?.run
    assert.match(run, /^\/opt\/qijenchen\/managed-ci-host\/bin\/sandbox-launch /)
    assert.match(run, new RegExp(`--class ${id}(?: |$)`))
    assert.doesNotMatch(run, /ACTIONS_ID_TOKEN|secret|signer/)
  }
  for (const [id, environment] of [
    ['freeze-subject-authority', 'managed-ci-freeze-authority-v1'],
    ['sandbox-session-authority', 'managed-ci-sandbox-authority-v1'],
    ['receipt-finalizer-authority', 'managed-ci-receipt-finalizer-v1'],
  ]) {
    assert.equal(document.jobs[id].permissions['id-token'], 'write')
    assert.equal(document.jobs[id].environment, environment)
  }
  assert.equal(document.jobs['freeze-subject-authority'].steps.some(step => step.uses?.startsWith('actions/checkout@')), false)
  const authorityCommands = ['freeze-subject-authority', 'sandbox-session-authority', 'receipt-finalizer-authority']
    .flatMap(id => document.jobs[id].steps).filter(step => step.run).map(step => step.run)
  assert(authorityCommands.every(command => !command.includes('--request ')))
  assert(authorityCommands.every(command => command.includes('--response ')))
  const yaml = renderManagedCiActivatedWorkflow(state.plan, base.activatedWorkflowContract.contract)
  assert.deepEqual(loadYaml(yaml, { json: false }), document)
})

test('image and host bindings close source, recipe, control-plane adapters, external deployment, and independent readback', () => {
  const state = activeState()
  const expectedContext = workflowGitFileSetBinding(state.executorSupplyChain.policy.source.buildContextFiles)
  const expectedMaterials = workflowGitFileSetBinding(state.executorSupplyChain.policy.source.imageMaterialsFiles)
  const runtimeBytes = readFileSync(resolve(ROOT, 'infra/governance/managed-ci-executor/runtime/managed-ci-runtime.mjs'))
  const runtimeSha256 = createHash('sha256').update(runtimeBytes).digest('hex')
  assert.deepEqual(state.executorSupplyChain.buildContext, expectedContext)
  assert.deepEqual(state.executorSupplyChain.materials, expectedMaterials)
  assert.equal(state.executorSupplyChain.policy.builder.baseImage.version, '24.14.0-bookworm-slim')
  assert.equal(state.plan.activation.builderWorkflowSha, state.plan.activation.executorSourceCommit)
  assert.equal(state.executorSupplyChain.policy.builder.workflowIdentity.workflowShaClaim, 'github.workflow_sha')
  assert.equal(state.executorSupplyChain.policy.builder.workflowIdentity.sourceCommitClaim, 'github.sha')
  assert.equal(state.executorSupplyChain.policy.builder.workflowIdentity.separateWorkflowAndSourceFieldsRequired, true)
  assert.equal(state.plan.activation.imageSetInventoryEntryCount, 18)
  assert.equal(state.plan.activation.imageSetArtifactRetentionDays, 90)
  assert.match(state.plan.activation.imageSetInventorySha256, /^[a-f0-9]{64}$/)
  assert.equal(state.plan.activation.offlineEvidenceArchive.retentionMode, 'compliance-object-lock')
  assert.doesNotMatch(state.plan.activation.offlineEvidenceArchive.locator, /github\.com.*actions/)
  for (const id of CLASSES) {
    const image = managedCiExpectedImageSupplyChainBinding(state, id)
    assert.equal(image.executionClass, id)
    assert.equal(image.image.subjectDigest, state.plan.activation.executionClasses[id].imageDigest)
    assert.equal(image.builder.workflowSha, state.plan.activation.builderWorkflowSha)
    assert.equal(image.builder.runId, state.plan.activation.executorBuildRunId)
    assert.equal(image.builder.runAttempt, state.plan.activation.executorBuildRunAttempt)
    assert.equal(image.verification.independentVerifierRequired, true)
    assert.equal(image.verification.activationVerificationStatus, 'verified')
    assert.equal(
      image.verification.activationVerificationReceiptDigest,
      state.activationEvidence.receiptDigest,
    )
    assert.deepEqual(
      image.verification.activationVerificationIssuerKeyIds,
      state.activationEvidence.issuerKeyIds,
    )
    assert.deepEqual(
      image.verification.activationVerificationIssuerSubjects,
      state.activationEvidence.issuerSubjects,
    )
    assert.equal(image.verification.activationVerificationQuorum, state.trust.receiptPolicy.quorum)
    assert.equal(
      image.verification.activationVerificationReceiptExpiresAt,
      state.plan.activation.verificationReceipt.expiresAt,
    )
    assert.equal(
      image.verification.activationVerificationReplayRetentionUntil,
      state.plan.activation.verificationReceipt.replay.retentionUntil,
    )
    assert.equal(
      image.verification.activationVerificationIssuerRegistryDigest,
      state.plan.activation.verificationReceipt.issuerRegistryDigest,
    )
    assert.equal(
      image.verification.activationVerificationTrustBindingDigest,
      state.plan.activation.verificationReceipt.trustBinding.bindingDigest,
    )
    assert.equal(
      image.verification.receiptSignerTrustReadbackDigest,
      state.plan.activation.receiptSignerTrustReadbackDigest,
    )
    assert.deepEqual(image.runtime, {
      nodeVersion: '24.14.0',
      runtimeSourceSha256: state.plan.activation.executionClasses[id].runtimeSourceSha256,
      runtimeInventoryDigest: state.plan.activation.executionClasses[id].runtimeInventoryDigest,
    })
    assert.deepEqual(image.aggregateHandoff, {
      executionClassCount: CLASSES.length,
      artifactId: state.plan.activation.imageSetArtifactId,
      artifactDigest: state.plan.activation.imageSetArtifactDigest,
      manifestSha256: state.plan.activation.imageSetManifestSha256,
      inventorySha256: state.plan.activation.imageSetInventorySha256,
      inventoryEntryCount: 18,
      artifactFileCount: 19,
      artifactRetentionDays: 90,
      storageClass: 'github-actions-artifact-non-worm',
    })
    assert.equal(image.attestations.provenance.predicateDigest, state.plan.activation.executionClasses[id].slsaProvenanceDigest)
    assert.equal(image.attestations.sbom.predicateDigest, state.plan.activation.executionClasses[id].sbomDigest)
    assert.equal(image.attestations.handoff.predicateDigest, state.plan.activation.executionClasses[id].handoffPredicateDigest)
    assert.equal(image.attestations.provenance.bundleDigest, state.plan.activation.executionClasses[id].provenanceBundleDigest)
    assert.equal(
      image.attestations.provenance.recordReadbackDigest,
      state.plan.activation.executionClasses[id].provenanceRecordReadbackDigest,
    )
    assert.equal(image.attestations.sbom.bundleDigest, state.plan.activation.executionClasses[id].sbomBundleDigest)
    assert.equal(
      image.attestations.sbom.recordReadbackDigest,
      state.plan.activation.executionClasses[id].sbomRecordReadbackDigest,
    )
    assert.equal(image.attestations.handoff.bundleDigest, state.plan.activation.executionClasses[id].handoffBundleDigest)
    assert.equal(
      image.attestations.handoff.recordReadbackDigest,
      state.plan.activation.executionClasses[id].handoffRecordReadbackDigest,
    )
    assert.equal(image.evidenceSet.digest, state.plan.activation.executionClasses[id].evidenceSetDigest)
    assert.deepEqual(image.evidenceSet.imageSetArtifact, {
      id: state.plan.activation.imageSetArtifactId,
      digest: state.plan.activation.imageSetArtifactDigest,
      manifestSha256: state.plan.activation.imageSetManifestSha256,
    })
    assert.deepEqual(image.evidenceSet.offlineArchive, state.plan.activation.offlineEvidenceArchive)
    assert.match(image.build.recipeDigest, /^[a-f0-9]{64}$/)
    assert.equal(image.build.contextDigest, expectedContext.digest)
    assert.equal(image.build.materialsDigest, expectedMaterials.digest)
    assert.equal(state.plan.activation.executionClasses[id].runtimeSourceSha256, runtimeSha256)
    assert.match(state.plan.activation.executionClasses[id].runtimeInventoryDigest, /^[a-f0-9]{64}$/)
    const host = managedCiExpectedHostSandboxPolicyBinding(state, id)
    assert.equal(host.executionClass, id)
    assert.equal(host.launcherDeployment.includedInExecutorImages, false)
    assert.equal(host.classAdapterControlPlaneDigest, state.executorSupplyChain.controlPlane.digest)
    assert.equal(host.kernelControls.hostSocketMounted, false)
    assert.equal(host.egress.directInternetDenied, true)
  }
  assert.equal(state.executorSupplyChain.externalDeployments.authorityClient.includedInExecutorImages, false)
  assert.equal(state.executorSupplyChain.externalDeployments.hostSandboxLauncher.includedInExecutorImages, false)
  assert.equal(new Set(CLASSES.map(id => state.plan.activation.executionClasses[id].runtimeSourceSha256)).size, 1)
  assert.equal(new Set(CLASSES.map(id => state.plan.activation.executionClasses[id].runtimeInventoryDigest)).size, CLASSES.length)
  const workflow = readFileSync(resolve(ROOT, '.github/workflows/build-managed-ci-executors.yml'), 'utf8')
  assert.match(workflow, /WORKFLOW_SHA: \$\{\{ github\.workflow_sha \}\}/)
  assert.match(workflow, /managed-ci-image-set-inventory-v1/)
  assert.match(workflow, /managedRuntimeSourceSha256/)
  assert.match(workflow, /retention-days: 90/)
})

test('frozen artifact and every class readback bind the same authority bytes, lineage, and signed host observation', t => {
  const hostIssuer = issuer('fixture-host-observer-v1', 'spiffe://qijenchen.dev/fixture/managed-ci/host-observer')
  const root = trustRoot(t, [hostIssuer.record])
  const state = activeState(null, root)
  const run = {
    workflowDefinitionCommit: '4'.repeat(40), workflowDefinitionTree: '5'.repeat(40),
    workflowRunId: '7001', runAttempt: 1, subjectCommit: '6'.repeat(40), subjectTree: '7'.repeat(40),
    manifestSha256: SHA('manifest'), subjectRunId: '12345678-1234-4abc-8def-1234567890ab',
  }
  const frozen = managedCiExpectedFrozenSubjectArtifactBinding(state, {
    artifactName: 'managed-ci-frozen-subject-7001-1', artifactId: '9001',
    artifactStorageLocator: 'github-actions-artifact://ajenchen/design-system/9001', artifactSha256: SHA('frozen-artifact'),
    artifactSize: 4096, subjectCommit: run.subjectCommit, subjectTree: run.subjectTree, freezeRunId: run.subjectRunId,
    manifestSha256: run.manifestSha256, manifestBytesSha256: SHA('manifest-bytes'), coverageDigest: SHA('coverage'),
    shardSetDigest: SHA('shard-set'), workflowDefinitionCommit: run.workflowDefinitionCommit,
    workflowDefinitionTree: run.workflowDefinitionTree, workflowRunId: run.workflowRunId, runAttempt: run.runAttempt,
    authorityOidcProjectionDigest: SHA('freeze-oidc'),
  })
  const readbacks = []
  for (const id of CLASSES) {
    const observation = {
      schemaVersion: 1, kind: 'managed-ci-host-sandbox-independent-observation-v1', executionClass: id,
      workflowRunId: run.workflowRunId, runAttempt: run.runAttempt,
      policyBinding: managedCiExpectedHostSandboxPolicyBinding(state, id), receiptDigest: '0'.repeat(64),
      issuerKeyId: hostIssuer.record.keyId, issuerSubject: hostIssuer.record.subject,
      signatureAlgorithm: 'Ed25519', signature: 'A'.repeat(86), observedAt: '2026-07-21T00:20:00.000Z',
      networkNamespaceDigest: SHA(`net:${id}`), firewallPolicyDigest: SHA(`firewall:${id}`),
      egressProxyPolicyDigest: SHA(`proxy:${id}`), mountTableDigest: SHA(`mount:${id}`),
      negativeProbeDigest: SHA(`negative:${id}`),
      negativeProbes: { candidateWriteDenied: true, undeclaredWriteDenied: true, rawSocketDenied: true, directInternetDenied: true, unlistedHostDenied: true, containerEngineSocketAbsent: true, hostNamespaceDenied: true, ambientSecretAbsent: true },
    }
    observation.receiptDigest = managedCiHostSandboxObservationReceiptDigest(state, observation)
    observation.signature = sign(null, managedCiHostSandboxObservationSigningBytes(state, observation), hostIssuer.privateKey).toString('base64url')
    assert.equal(managedCiVerifyHostSandboxObservation(state, observation), true)
    const poisonedPolicyBinding = structuredClone(observation)
    poisonedPolicyBinding.policyBinding.egress.directInternetDenied = false
    const poisonedPolicyBindingCore = structuredClone(poisonedPolicyBinding.policyBinding)
    delete poisonedPolicyBindingCore.bindingDigest
    poisonedPolicyBinding.policyBinding.bindingDigest = managedCiSha256(
      managedCiStableStringify(poisonedPolicyBindingCore),
    )
    poisonedPolicyBinding.receiptDigest = managedCiHostSandboxObservationReceiptDigest(
      state,
      poisonedPolicyBinding,
    )
    poisonedPolicyBinding.signature = sign(
      null,
      managedCiHostSandboxObservationSigningBytes(state, poisonedPolicyBinding),
      hostIssuer.privateKey,
    ).toString('base64url')
    assert.throws(
      () => managedCiVerifyHostSandboxObservation(state, poisonedPolicyBinding),
      /policy binding differs from the canonical execution-class policy/,
    )
    const readback = managedCiExpectedFrozenSubjectClassReadback(state, {
      executionClass: id, frozenSubject: frozen, recomputedArtifactSha256: frozen.artifactSha256,
      recomputedManifestBytesSha256: frozen.manifestBytesSha256, downloadedAt: '2026-07-21T00:19:00.000Z',
      hostObservationReceiptDigest: observation.receiptDigest,
    })
    assert.equal(readback.artifactSha256, frozen.artifactSha256)
    assert.equal(readback.lineageDigest, frozen.lineageDigest)
    readbacks.push(readback)
    const bad = structuredClone(observation)
    bad.signature = `${bad.signature[0] === 'A' ? 'B' : 'A'}${bad.signature.slice(1)}`
    assert.throws(() => managedCiVerifyHostSandboxObservation(state, bad), /signature is invalid/)
  }
  assert.equal(new Set(readbacks.map(item => item.artifactSha256)).size, 1)
  assert.throws(() => managedCiExpectedFrozenSubjectClassReadback(state, {
    executionClass: 'dependency-acquisition', frozenSubject: frozen, recomputedArtifactSha256: SHA('substituted'),
    recomputedManifestBytesSha256: frozen.manifestBytesSha256, downloadedAt: '2026-07-21T00:19:00.000Z',
    hostObservationReceiptDigest: SHA('host'),
  }), /did not recompute/)
})

test('model authority helper validates the canonical signed overlay and rejects provider substitution', () => {
  const state = activeState()
  const binding = activeFixture.observedResource().modelReleaseAuthorityBinding
  const result = managedCiExpectedModelReleaseAuthorityBinding(state, binding, { selectedProvider: 'codex' })
  assert.equal(result.binding.modelReleaseId, 'codex/gpt-5.6-sol')
  assert.deepEqual(result.exchangeInvocationObservations, binding.exchangeInvocationObservations)
  assert.throws(() => managedCiExpectedModelReleaseAuthorityBinding(state, binding, { selectedProvider: 'claude' }), /provider differs/)
  const poison = structuredClone(binding)
  poison.exchangeInvocationObservations[0].responseSha256 = SHA('substituted-response')
  assert.throws(() => managedCiExpectedModelReleaseAuthorityBinding(state, poison, { selectedProvider: 'codex' }), /detached/)
})

test('final receipt signer derives every digest from validated raw bytes and emits a bound audit event', () => {
  const state = activeState()
  const observed = activeFixture.observedResource()
  const executionClass = 'dependency-acquisition'
  const payload = observed.executionClassReceiptSigningPayloads[executionClass]
  const readback = observed.executionClassRawReceiptValidationReadbacks[executionClass]
  const audit = observed.executionClassSignerAuditEvents[executionClass]
  const issuerMapping = observed.receiptSignerIssuerMapping
  const signerAuthority = managedCiExpectedReceiptSignerAuthorityBinding(state)
  const provenance = managedCiProvenanceBinding(state, {
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
  const receiptBinding = managedCiExpectedReceiptBinding(state, { evidenceKind: 'dependency-bundle' })
  const expected = managedCiVerifyReceiptSigningPayloadProjection(state, {
    receiptSigningPayload: payload,
    rawReceiptValidationReadback: readback,
    evidenceKind: 'dependency-bundle',
    workflowRunId: observed.workflowRunId,
    runAttempt: observed.runAttempt,
    provenanceBinding: provenance,
    receiptBinding,
    frozenSubjectReadback: observed.executionClassFrozenSubjectReadbacks[executionClass],
    hostObservation: observed.executionClassHostSandboxReadbacks[executionClass],
    imageSupplyChainBinding: observed.executionClassImageSupplyChainBindings[executionClass],
    issuerMapping,
    rawReceiptProjection: {
      evidenceEnvelopeDigest: observed.executionClassEvidenceEnvelopeDigests[executionClass],
      oidcClaimsDigest: observed.executionClassOidcClaimsDigests[executionClass],
      generatedOutputClosureDigest: observed.executionClassGeneratedOutputClosureDigests[executionClass],
    },
  })
  assert.deepEqual(expected, payload)
  assert.equal(
    managedCiVerifyReceiptSignature(state, payload, audit.signature, { issuerMapping }),
    true,
  )
  assert.equal(audit.payloadDigest, managedCiReceiptSigningPayloadDigest(state, payload, { issuerMapping }))
  assert.equal(audit.rawReceiptDigest, readback.rawReceiptDigest)
  assert.equal(payload.rawReceiptValidationDigest, SHA(JSON.stringify(governanceNormalize(readback))))
  assert.equal(audit.signerAuthorityBindingDigest, signerAuthority.bindingDigest)

  const schemaPoison = structuredClone(payload)
  schemaPoison.rawReceiptSchemaDigest = SHA('substituted-schema')
  assert.throws(() => managedCiReceiptSigningBytes(state, schemaPoison, { issuerMapping }), /raw schema digest differs/)
  const payloadPoison = structuredClone(payload)
  payloadPoison.rawReceiptDigest = SHA('substituted-raw-receipt')
  assert.throws(() => managedCiVerifyReceiptSignature(state, payloadPoison, audit.signature, { issuerMapping }), /signature is invalid/)
  const readbackPoison = structuredClone(readback)
  readbackPoison.evidenceEnvelopeDigest = SHA('substituted-envelope')
  assert.throws(() => managedCiVerifyReceiptSigningPayloadProjection(state, {
    receiptSigningPayload: payload,
    rawReceiptValidationReadback: readbackPoison,
    evidenceKind: 'dependency-bundle',
    workflowRunId: observed.workflowRunId,
    runAttempt: observed.runAttempt,
    provenanceBinding: provenance,
    receiptBinding,
    frozenSubjectReadback: observed.executionClassFrozenSubjectReadbacks[executionClass],
    hostObservation: observed.executionClassHostSandboxReadbacks[executionClass],
    imageSupplyChainBinding: observed.executionClassImageSupplyChainBindings[executionClass],
    issuerMapping,
    rawReceiptProjection: {
      evidenceEnvelopeDigest: observed.executionClassEvidenceEnvelopeDigests[executionClass],
      oidcClaimsDigest: observed.executionClassOidcClaimsDigests[executionClass],
      generatedOutputClosureDigest: observed.executionClassGeneratedOutputClosureDigests[executionClass],
    },
  }), /expected evidenceEnvelopeDigest mismatches/)
})

test('authority finalization protocol closes request, response, receipt-set, transport, and replay semantics', () => {
  activeState()
  const { requestEnvelope, request, response } = activeFixture.authorityFinalization()
  const schemaPath = 'infra/governance/schemas/managed-ci-authority-finalization-protocol.schema.json'

  assert.equal(validateSchema(schemaPath, requestEnvelope), true)
  assert.equal(validateSchema(schemaPath, response), true)
  assert.equal(validateFinalizationRequest(request), true)
  assert.equal(validateFinalizationResponse(response, {
    request,
    requestSha256: requestEnvelope.requestSha256,
  }), true)
  assert.equal(finalizationRequestEnvelope(request).requestSha256, requestEnvelope.requestSha256)
  assert.equal(finalizedReceiptSetDigest(response.finalizedReceiptSet), response.finalizedReceiptSet.setDigest)
  assert.equal(
    finalizationTransportReadbackDigest(response.transportReadback),
    response.transportReadback.readbackDigest,
  )

  const openEnvelope = structuredClone(requestEnvelope)
  openEnvelope.unexpected = true
  assert.equal(validateSchema(schemaPath, openEnvelope), false)

  const openResponse = structuredClone(response)
  openResponse.unexpected = true
  assert.equal(validateSchema(schemaPath, openResponse), false)

  const rawByteSubstitution = structuredClone(request)
  const rawInput = rawByteSubstitution.rawReceiptSet['dependency-acquisition']
  rawInput.contentBase64 = `${rawInput.contentBase64[0] === 'A' ? 'B' : 'A'}${rawInput.contentBase64.slice(1)}`
  assert.throws(
    () => validateFinalizationRequest(rawByteSubstitution),
    /managed CI trusted authority blocked:/,
  )

  const openRequest = structuredClone(request)
  openRequest.unexpected = true
  assert.throws(
    () => validateFinalizationRequest(openRequest),
    /managed CI trusted authority blocked:/,
  )

  const requestDigestSubstitution = structuredClone(response)
  requestDigestSubstitution.requestSha256 = SHA('substituted-finalization-request')
  assert.throws(
    () => validateFinalizationResponse(requestDigestSubstitution, {
      request,
      requestSha256: requestEnvelope.requestSha256,
    }),
    /managed CI trusted authority blocked:/,
  )

  const rawSetDigestSubstitution = structuredClone(response)
  rawSetDigestSubstitution.finalizedReceiptSet.rawReceiptSetDigest = SHA('substituted-raw-receipt-set')
  rawSetDigestSubstitution.finalizedReceiptSet.setDigest = finalizedReceiptSetDigest(
    rawSetDigestSubstitution.finalizedReceiptSet,
  )
  assert.throws(
    () => validateFinalizationResponse(rawSetDigestSubstitution, {
      request,
      requestSha256: requestEnvelope.requestSha256,
    }),
    /managed CI trusted authority blocked:/,
  )

  const receiptSetSubstitution = structuredClone(response)
  receiptSetSubstitution.finalizedReceiptSet.receipts['github-observer'].rawReceiptPath =
    'dependency-acquisition.json'
  receiptSetSubstitution.finalizedReceiptSet.setDigest = finalizedReceiptSetDigest(
    receiptSetSubstitution.finalizedReceiptSet,
  )
  assert.throws(
    () => validateFinalizationResponse(receiptSetSubstitution, {
      request,
      requestSha256: requestEnvelope.requestSha256,
    }),
    /managed CI trusted authority blocked:/,
  )

  const replayedSignerEvent = structuredClone(response)
  replayedSignerEvent.finalizedReceiptSet.receipts['github-observer'].signerAuditEvent.eventId =
    replayedSignerEvent.finalizedReceiptSet.receipts['dependency-acquisition'].signerAuditEvent.eventId
  replayedSignerEvent.finalizedReceiptSet.setDigest = finalizedReceiptSetDigest(
    replayedSignerEvent.finalizedReceiptSet,
  )
  assert.throws(
    () => validateFinalizationResponse(replayedSignerEvent, {
      request,
      requestSha256: requestEnvelope.requestSha256,
    }),
    /managed CI trusted authority blocked:/,
  )

  const forgedSignerSignature = structuredClone(response)
  forgedSignerSignature.finalizedReceiptSet.receipts['model-broker'].signerAuditEvent.signature =
    'A'.repeat(86)
  forgedSignerSignature.finalizedReceiptSet.setDigest = finalizedReceiptSetDigest(
    forgedSignerSignature.finalizedReceiptSet,
  )
  assert.throws(
    () => validateFinalizationResponse(forgedSignerSignature, {
      request,
      requestSha256: requestEnvelope.requestSha256,
    }),
    /signature is invalid/,
  )

  const detachedFinalizedSet = structuredClone(response)
  detachedFinalizedSet.transportReadback.finalizedReceiptSetDigest =
    SHA('substituted-finalized-receipt-set')
  detachedFinalizedSet.transportReadback.readbackDigest =
    finalizationTransportReadbackDigest(detachedFinalizedSet.transportReadback)
  assert.throws(
    () => validateFinalizationResponse(detachedFinalizedSet, {
      request,
      requestSha256: requestEnvelope.requestSha256,
    }),
    /transport readback is detached from the exact request contract/,
  )

  for (const mutate of [
    value => { value.clientToGateway.tlsVersion = 'TLSv1.2' },
    value => { value.clientToGateway.serverHostnameVerified = false },
    value => { value.gatewayToSigner.mutualTlsEstablished = false },
    value => { value.gatewayToSigner.gatewayHeldSignerPrivateKey = true },
    value => {
      value.gatewayToSigner.signerAuthorityBindingDigest =
        SHA('substituted-finalization-signer-authority')
    },
    value => { value.observedAt = '2026-07-23T00:00:00.000Z' },
  ]) {
    const transportPoison = structuredClone(response)
    mutate(transportPoison.transportReadback)
    transportPoison.transportReadback.readbackDigest =
      finalizationTransportReadbackDigest(transportPoison.transportReadback)
    assert.throws(
      () => validateFinalizationResponse(transportPoison, {
        request,
        requestSha256: requestEnvelope.requestSha256,
      }),
      /managed CI trusted authority blocked:/,
    )
  }

  const attestationPayloadDigestSubstitution = structuredClone(response)
  attestationPayloadDigestSubstitution.transportReadback.attestation.payloadDigest =
    SHA('substituted-finalization-transport-attestation-payload')
  attestationPayloadDigestSubstitution.transportReadback.readbackDigest =
    finalizationTransportReadbackDigest(attestationPayloadDigestSubstitution.transportReadback)
  assert.equal(validateSchema(schemaPath, attestationPayloadDigestSubstitution), true)
  assert.throws(
    () => validateFinalizationResponse(attestationPayloadDigestSubstitution, {
      request,
      requestSha256: requestEnvelope.requestSha256,
    }),
    /finalization transport readback attestation payload digest is not reproducible/,
  )

  const attestationSignatureSubstitution = structuredClone(response)
  const originalAttestationSignature =
    attestationSignatureSubstitution.transportReadback.attestation.signature
  attestationSignatureSubstitution.transportReadback.attestation.signature =
    `${originalAttestationSignature[0] === 'A' ? 'B' : 'A'}${originalAttestationSignature.slice(1)}`
  attestationSignatureSubstitution.transportReadback.readbackDigest =
    finalizationTransportReadbackDigest(attestationSignatureSubstitution.transportReadback)
  assert.equal(validateSchema(schemaPath, attestationSignatureSubstitution), true)
  assert.throws(
    () => validateFinalizationResponse(attestationSignatureSubstitution, {
      request,
      requestSha256: requestEnvelope.requestSha256,
    }),
    /finalization transport readback attestation signature is invalid/,
  )

  const readbackDigestSubstitution = structuredClone(response)
  readbackDigestSubstitution.transportReadback.readbackDigest =
    SHA('substituted-finalization-transport-readback')
  assert.throws(
    () => validateFinalizationResponse(readbackDigestSubstitution, {
      request,
      requestSha256: requestEnvelope.requestSha256,
    }),
    /managed CI trusted authority blocked:/,
  )
})

test('receipt signer authority binding fails closed when validator or protocol source bytes are tampered', t => {
  const root = mkdtempSync(join(tmpdir(), 'managed-ci-validator-source-tamper-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const fixtureState = activeState()
  for (const path of [
    'scripts/schemas/managed-ci-finalized-receipt.schema.json',
    MANAGED_CI_RAW_RECEIPT_SCHEMA_PATH,
    'infra/governance/schemas/managed-ci-authority-finalization-protocol.schema.json',
    'infra/governance/trust/issuers.json',
    'scripts/lib/managed-ci-sandbox-receipt.mjs',
  ]) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true })
    copyFileSync(resolve(fixtureState.root, path), resolve(root, path))
  }
  const state = { ...fixtureState, root }
  const validatorPath = resolve(root, 'scripts/lib/managed-ci-sandbox-receipt.mjs')
  const protocolSchemaPath = resolve(
    root,
    'infra/governance/schemas/managed-ci-authority-finalization-protocol.schema.json',
  )
  const issuerRegistryPath = resolve(root, 'infra/governance/trust/issuers.json')
  const validatorBytes = readFileSync(validatorPath)
  const protocolSchemaBytes = readFileSync(protocolSchemaPath)
  const issuerRegistryBytes = readFileSync(issuerRegistryPath)
  assert.match(
    managedCiExpectedReceiptSignerAuthorityBinding(state).rawReceiptValidation.validatorSourceSha256,
    /^[a-f0-9]{64}$/,
  )
  writeFileSync(
    validatorPath,
    `${validatorBytes.toString('utf8')}\n// tampered validator source\n`,
  )
  assert.throws(
    () => managedCiExpectedReceiptSignerAuthorityBinding(state),
    /validator source differs from the trusted policy SHA-256/,
  )
  writeFileSync(validatorPath, validatorBytes)
  writeFileSync(
    protocolSchemaPath,
    `${protocolSchemaBytes.toString('utf8')}\n`,
  )
  assert.throws(
    () => managedCiExpectedReceiptSignerAuthorityBinding(state),
    /finalization protocol schema differs from the trusted policy SHA-256/,
  )
  writeFileSync(protocolSchemaPath, protocolSchemaBytes)
  writeFileSync(issuerRegistryPath, Buffer.concat([issuerRegistryBytes, Buffer.from('\n')]))
  assert.throws(
    () => managedCiExpectedReceiptSignerAuthorityBinding(state),
    /content-addressed issuer registry deployment differs/,
  )
})

test('canonical managed-CI builder workflow satisfies the closed supply-chain contract', () => {
  assert.equal(
    (CLOSED_BUILDER_WORKFLOW.match(/\.metadata\.component\.name == \$imageSubject/g) || []).length,
    2,
  )
  assert.match(
    CLOSED_BUILDER_WORKFLOW,
    /CONTEXT_DIGEST="\$\(printf '%s\\n' "\$CONTEXT_CANONICAL" \| sha256sum \| cut -d' ' -f1\)"/,
  )
  assert.match(
    CLOSED_BUILDER_WORKFLOW,
    /MATERIALS_DIGEST="\$\(printf '%s\\n' "\$MATERIAL_CANONICAL" \| sha256sum \| cut -d' ' -f1\)"/,
  )
  assert.doesNotMatch(
    CLOSED_BUILDER_WORKFLOW,
    /(?:CONTEXT|MATERIALS)_DIGEST="\$\(printf '%s' "/,
  )
  assert.doesNotMatch(CLOSED_BUILDER_WORKFLOW, /\$imageInput|IMAGE_INPUT=/)
  assert.equal(
    (CLOSED_BUILDER_WORKFLOW.match(/git -c tar\.umask=0022 archive --format=tar --mtime="@\$SOURCE_COMMIT_TIME"/g) || []).length,
    2,
  )
  const buildProgram = closedBuilderRunProgram(CLOSED_BUILDER_WORKFLOW)
  const archiveAt = buildProgram.indexOf(
    '/usr/bin/git -c tar.umask=0022 archive --format=tar --mtime="@$SOURCE_COMMIT_TIME"',
  )
  const membersAt = buildProgram.indexOf('test "$(tar -tf "$CONTEXT_ARCHIVE")"')
  const metadataAt = buildProgram.indexOf('/usr/bin/python3 - "$CONTEXT_ARCHIVE"')
  const blobsAt = buildProgram.indexOf('verify_archived_blob runtime/managed-ci-runtime.mjs')
  const digestAt = buildProgram.indexOf('CONTEXT_ARCHIVE_SHA256="$(sha256sum "$CONTEXT_ARCHIVE"')
  const readOnlyAt = buildProgram.indexOf('chmod 0400 "$CONTEXT_ARCHIVE"')
  const pushAt = buildProgram.indexOf('/usr/bin/docker buildx build')
  assert(archiveAt < membersAt)
  assert(membersAt < metadataAt)
  assert(metadataAt < blobsAt)
  assert(blobsAt < digestAt)
  assert(digestAt < readOnlyAt)
  assert(readOnlyAt < pushAt)
  assert.match(buildProgram.slice(pushAt), /- 0<&"\$CONTEXT_ARCHIVE_FD"/)
  assert.doesNotMatch(buildProgram, /\| \/usr\/bin\/docker buildx build/)
  assert.match(CLOSED_BUILDER_WORKFLOW, /--builder "\$BUILDX_BUILDER"/)
  assert.match(CLOSED_BUILDER_WORKFLOW, /context-archive-mtime-epoch/)
  assert.match(CLOSED_BUILDER_WORKFLOW, /buildContextArchiveMtimeEpoch/)
  assert.match(CLOSED_BUILDER_WORKFLOW, /cmp -s "\$ORIGINAL_CONTEXT_ARCHIVE" "\$FRESH_CONTEXT_ARCHIVE"/)
  assert.match(CLOSED_BUILDER_WORKFLOW, /SYFT_REGISTRY_AUTH_AUTHORITY="ghcr\.io"/)
  assert.doesNotMatch(CLOSED_BUILDER_WORKFLOW, /docker\/build-push-action@/)
  assert.equal(validateClosedBuilderWorkflow(CLOSED_BUILDER_WORKFLOW), true)
})

test('registry mutation cannot occur before exact context member, metadata, blob, and digest validation', () => {
  const poisonedWorkflow = poisonClosedBuilderWorkflow(
    CLOSED_BUILDER_WORKFLOW,
    '          test "$(tar -tf "$CONTEXT_ARCHIVE")" = "$(printf \'%s\\n\' \\\n',
    '          /usr/bin/docker buildx build --push - < "$CONTEXT_ARCHIVE"\n'
      + '          test "$(tar -tf "$CONTEXT_ARCHIVE")" = "$(printf \'%s\\n\' \\\n',
  )
  const poisonedRun = closedBuilderRunProgram(poisonedWorkflow)
  const poisonedBuilder = structuredClone(CLOSED_SUPPLY_CHAIN_POLICY.builder)
  poisonedBuilder.closedBuilderRunSha256.buildFromExactGitArchive = managedCiSha256(poisonedRun)
  assert.throws(
    () => validateManagedCiExecutorBuilderTrigger({
      builder: poisonedBuilder,
      attestations: CLOSED_SUPPLY_CHAIN_POLICY.attestations,
      protectedRef: CLOSED_SUPPLY_CHAIN_POLICY.source.protectedRef,
      workflowSource: poisonedWorkflow,
    }),
    /mutate the registry before exact context archive/,
  )
})

test('commit-epoch Git archive bytes remain stable across wall-clock seconds', async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'managed-ci-git-archive-'))
  try {
    const contextRoot = join(fixtureRoot, 'infra/governance/managed-ci-executor')
    mkdirSync(join(contextRoot, 'runtime'), { recursive: true })
    writeFileSync(join(contextRoot, '.dockerignore'), '**\n!.dockerignore\n!Containerfile\n!runtime/\n!runtime/managed-ci-runtime.mjs\n')
    writeFileSync(join(contextRoot, 'Containerfile'), 'FROM scratch\nCOPY runtime/managed-ci-runtime.mjs /runtime.mjs\n')
    writeFileSync(join(contextRoot, 'runtime/managed-ci-runtime.mjs'), 'export default true\n')
    assert.equal(spawnSync('git', ['init', '--quiet'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      shell: false,
    }).status, 0)
    assert.equal(spawnSync('git', ['config', 'user.name', 'Managed CI Test'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      shell: false,
    }).status, 0)
    assert.equal(spawnSync('git', ['config', 'user.email', 'managed-ci@example.invalid'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      shell: false,
    }).status, 0)
    assert.equal(spawnSync('git', ['config', 'tar.umask', '0022'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      shell: false,
    }).status, 0)
    assert.equal(spawnSync('git', ['add', '.'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      shell: false,
    }).status, 0)
    const commit = spawnSync('git', ['commit', '--quiet', '-m', 'fixture'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      shell: false,
    })
    assert.equal(commit.status, 0, commit.stderr)
    const first = spawnSync('git', [
      'archive',
      '--format=tar',
      '--mtime=@1700000000',
      'HEAD:infra/governance/managed-ci-executor',
    ], {
      cwd: fixtureRoot,
      encoding: null,
      maxBuffer: 1024 * 1024,
      shell: false,
    })
    assert.equal(first.status, 0, first.stderr?.toString())
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_100))
    const second = spawnSync('git', [
      'archive',
      '--format=tar',
      '--mtime=@1700000000',
      'HEAD:infra/governance/managed-ci-executor',
    ], {
      cwd: fixtureRoot,
      encoding: null,
      maxBuffer: 1024 * 1024,
      shell: false,
    })
    assert.equal(second.status, 0, second.stderr?.toString())
    assert.equal(
      createHash('sha256').update(first.stdout).digest('hex'),
      createHash('sha256').update(second.stdout).digest('hex'),
    )

    const buildProgram = closedBuilderRunProgram(CLOSED_BUILDER_WORKFLOW)
    const verifierMatch = buildProgram.match(
      /\/usr\/bin\/python3 - "\$CONTEXT_ARCHIVE" <<'PY'\n([\s\S]*?)\nPY/,
    )
    assert(verifierMatch, 'inline archive metadata verifier is missing')
    writeFileSync(join(fixtureRoot, 'verify-context-archive.py'), verifierMatch[1])
    writeFileSync(join(fixtureRoot, 'verified-context.tar'), first.stdout)
    const verified = spawnSync('/usr/bin/python3', ['verify-context-archive.py', 'verified-context.tar'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      shell: false,
    })
    assert.equal(verified.status, 0, verified.stderr)

    chmodSync(join(contextRoot, 'runtime/managed-ci-runtime.mjs'), 0o755)
    assert.equal(spawnSync('git', ['add', 'infra/governance/managed-ci-executor/runtime/managed-ci-runtime.mjs'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      shell: false,
    }).status, 0)
    assert.equal(spawnSync('git', ['commit', '--quiet', '-m', 'poison context mode'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      shell: false,
    }).status, 0)
    const poisonedArchive = spawnSync('git', [
      'archive',
      '--format=tar',
      '--mtime=@1700000000',
      'HEAD:infra/governance/managed-ci-executor',
    ], {
      cwd: fixtureRoot,
      encoding: null,
      maxBuffer: 1024 * 1024,
      shell: false,
    })
    assert.equal(poisonedArchive.status, 0, poisonedArchive.stderr?.toString())
    writeFileSync(join(fixtureRoot, 'poisoned-context.tar'), poisonedArchive.stdout)
    assert.notEqual(spawnSync('/usr/bin/python3', ['verify-context-archive.py', 'poisoned-context.tar'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      shell: false,
    }).status, 0)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('registry writer cannot re-enable implicit BuildKit provenance or SBOM attestations', () => {
  for (const [before, after] of [
    ['            --provenance=false \\\n', '            --provenance=mode=max \\\n'],
    ['            --sbom=false \\\n', '            --sbom=true \\\n'],
  ]) {
    assert.throws(
      () => validateClosedBuilderWorkflow(poisonClosedBuilderWorkflow(CLOSED_BUILDER_WORKFLOW, before, after)),
      /managed CI trusted execution blocked:/,
    )
  }
})

test('SBOM scanner cannot gain registry write authority', () => {
  const before = '  generate-sbom:\n    if: github.ref == \'refs/heads/main\''
  const start = CLOSED_BUILDER_WORKFLOW.indexOf(before)
  assert.notEqual(start, -1)
  const suffix = CLOSED_BUILDER_WORKFLOW.slice(start)
  const changedSuffix = poisonClosedBuilderWorkflow(suffix, '      packages: read\n', '      packages: write\n')
  assert.throws(
    () => validateClosedBuilderWorkflow(`${CLOSED_BUILDER_WORKFLOW.slice(0, start)}${changedSuffix}`),
    /managed CI trusted execution blocked:/,
  )
})

test('source binding cannot substitute the mutable worktree for immutable Git objects', () => {
  for (const [before, after] of [
    [
      '          test "$(git rev-parse \'HEAD^{commit}\')" = "$SOURCE_COMMIT"\n',
      '          test -n "$SOURCE_COMMIT"\n',
    ],
    [
      '              sha="$(git cat-file blob "$blob" | sha256sum | cut -d\' \' -f1)"\n',
      '              sha="$(sha256sum "$path" | cut -d\' \' -f1)"\n',
    ],
    [
      '          /usr/bin/git -c tar.umask=0022 archive --format=tar --mtime="@$SOURCE_COMMIT_TIME" \\\n',
      '          /usr/bin/git archive --format=tar \\\n',
    ],
    [
      '            "$SOURCE_COMMIT:infra/governance/managed-ci-executor" \\\n',
      '            "infra/governance/managed-ci-executor" \\\n',
    ],
    [
      '            --builder "$BUILDX_BUILDER" \\\n',
      '            --builder default \\\n',
    ],
    [
      '            printf \'%s\\n\' "$projectionCanonical" > "$projectionFile"\n',
      '            printf \'%s\' "$projectionCanonical" > "$projectionFile"\n',
    ],
  ]) {
    assert.throws(
      () => validateClosedBuilderWorkflow(poisonClosedBuilderWorkflow(CLOSED_BUILDER_WORKFLOW, before, after)),
      /managed CI trusted execution blocked:/,
    )
  }
})

test('empty or detached CycloneDX output cannot satisfy the SBOM identity contract', () => {
  for (const [before, after] of [
    [
      '              and (.components | type == "array" and length > 0)\n',
      '              and (.components | type == "array")\n',
    ],
    [
      '              and .metadata.component.name == $imageSubject\n',
      '              and (.metadata.component.name | type == "string")\n',
    ],
    [
      '              and .metadata.component.version == $imageDigest\n',
      '              and (.metadata.component.version | type == "string")\n',
    ],
    [
      '                subject: "docker.io/library/node",\n                    digest: $baseImageDigest\n',
      '                subject: "docker.io/library/node",\n                    digest: $imageDigest\n',
    ],
    [
      '              and .sbom.identity.runtime.managedRuntimeSourceSha256 == $runtimeSourceSha256\n',
      '              and (.sbom.identity.runtime.managedRuntimeSourceSha256 | type == "string")\n',
    ],
  ]) {
    assert.throws(
      () => validateClosedBuilderWorkflow(poisonClosedBuilderWorkflow(CLOSED_BUILDER_WORKFLOW, before, after)),
      /managed CI trusted execution blocked:/,
    )
  }
})

test('closed evidence set cannot drop any attestation identity, bundle, predicate, or evidence-set file', () => {
  for (const [before, after] of [
    [
      '          PROVENANCE_ATTESTATION_ID: ${{ steps.provenance.outputs.attestation-id }}\n',
      '          PROVENANCE_ATTESTATION_ID: 1\n',
    ],
    [
      '          PROVENANCE_BUNDLE_SHA256="$(sha256sum "$PROVENANCE_BUNDLE" | cut -d\' \' -f1)"\n',
      '          PROVENANCE_BUNDLE_SHA256="$SBOM_BUNDLE_SHA256"\n',
    ],
    [
      '            ${{ runner.temp }}/managed-ci-evidence-set-${{ matrix.execution-class }}.json\n',
      '            ${{ runner.temp }}/managed-ci-image-handoff-${{ matrix.execution-class }}.json\n',
    ],
  ]) {
    assert.throws(
      () => validateClosedBuilderWorkflow(poisonClosedBuilderWorkflow(CLOSED_BUILDER_WORKFLOW, before, after)),
      /managed CI trusted execution blocked:/,
    )
  }
})

test('offline archive activation is atomic and never accepts an ephemeral Actions locator', () => {
  const canonical = loadManagedCiTrustedExecutionPlan({ repoRoot: ROOT }).plan
  assert.equal(validateManagedCiTrustedExecutionPlan(canonical, { repoRoot: ROOT }), true)
  const activated = activeState().plan
  assert.equal(validateManagedCiTrustedExecutionPlan(activated, { repoRoot: ROOT }), true)

  const partial = structuredClone(canonical)
  partial.activation.offlineEvidenceArchive.locator = 'https://archive.example.test/managed-ci/evidence.tar'
  assert.throws(
    () => validateManagedCiTrustedExecutionPlan(partial, { repoRoot: ROOT }),
    /managed CI trusted execution blocked:/,
  )

  const ephemeral = structuredClone(activated)
  ephemeral.activation.offlineEvidenceArchive.locator =
    'https://github.com/ajenchen/design-system/actions/runs/123/artifacts/456'
  assert.throws(
    () => validateManagedCiTrustedExecutionPlan(ephemeral, { repoRoot: ROOT }),
    /managed CI trusted execution blocked:/,
  )

  const mismatchedUrl = structuredClone(activated)
  mismatchedUrl.activation.executionClasses['dependency-acquisition'].provenanceAttestationUrl =
    'https://github.com/ajenchen/design-system/attestations/999'
  assert.throws(
    () => validateManagedCiTrustedExecutionPlan(mismatchedUrl, { repoRoot: ROOT }),
    /does not bind its exact attestation ID/,
  )

  const reusedId = structuredClone(activated)
  reusedId.activation.executionClasses['dependency-acquisition'].sbomAttestationId =
    reusedId.activation.executionClasses['dependency-acquisition'].provenanceAttestationId
  reusedId.activation.executionClasses['dependency-acquisition'].sbomAttestationUrl =
    reusedId.activation.executionClasses['dependency-acquisition'].provenanceAttestationUrl
  assert.throws(
    () => validateManagedCiTrustedExecutionPlan(reusedId, { repoRoot: ROOT }),
    /attestation ID is reused/,
  )

  const splitWorkflowSource = structuredClone(activated)
  splitWorkflowSource.activation.builderWorkflowSha = null
  assert.throws(
    () => validateManagedCiTrustedExecutionPlan(splitWorkflowSource, { repoRoot: ROOT }),
    /activate atomically/,
  )
})

test('runtime, authority client, and adapters have fixed operations and no candidate token/signer escape hatch', () => {
  const runtime = readFileSync(resolve(ROOT, 'infra/governance/managed-ci-executor/runtime/managed-ci-runtime.mjs'), 'utf8')
  const authority = readFileSync(resolve(ROOT, 'infra/governance/managed-ci-executor/authority/managed-ci-authority-client.mjs'), 'utf8')
  const adapter = readFileSync(resolve(ROOT, 'infra/governance/managed-ci-class-adapters/lib/verify-class-readback.mjs'), 'utf8')
  assert.match(runtime, /qijenchen-managed-deep-audit-authority-v1/)
  for (const field of ['--frozen-artifact-name', '--frozen-artifact-id', '--frozen-artifact-locator', '--frozen-artifact-sha256', '--frozen-artifact-size', '--frozen-lineage-digest']) assert(runtime.includes(field))
  assert.match(authority, /function fixedRequest\(operation\)/)
  assert.doesNotMatch(authority, /readFileSync\(args\['--request'\]\)/)
  assert.match(authority, /exactKeys\(args, \['--operation', '--response'\]/)
  assert.doesNotMatch(adapter, /node:child_process|spawnSync|execFile|--command|commandPath|executablePath/)
  assert.match(adapter, /ambient token or provider credential entered the candidate namespace/)
  for (const id of CLASSES) {
    const wrapper = readFileSync(resolve(ROOT, `infra/governance/managed-ci-class-adapters/${id}.mjs`), 'utf8')
    assert.match(wrapper, new RegExp(`verifyClassReadback\\('${id}'`))
  }
})

test('class adapter can verify only the exact raw receipt path uploaded for its execution class', async () => {
  const { assertCanonicalRawReceiptPath } = await import(
    '../infra/governance/managed-ci-class-adapters/lib/verify-class-readback.mjs'
  )
  for (const id of CLASSES) assert.equal(assertCanonicalRawReceiptPath(id, `${id}.json`), `${id}.json`)
  assert.throws(
    () => assertCanonicalRawReceiptPath('dependency-acquisition', 'verified.json'),
    /uploaded canonical artifact:dependency-acquisition\.json/,
  )
})

test('CLI reports the full inactive trust state and refuses execution', () => {
  const cli = resolve(ROOT, 'scripts/verify-managed-ci-trusted-execution.mjs')
  const plan = spawnSync(process.execPath, ['--', cli, '--plan', '--json'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(plan.status, 0, plan.stderr)
  const report = JSON.parse(plan.stdout)
  assert.equal(report.active, false)
  assert.match(report.activationTrustBundle.sha256, /^[a-f0-9]{64}$/)
  assert.match(report.executorSupplyChain.sha256, /^[a-f0-9]{64}$/)
  assert.match(report.trustedAuthorityPolicy.sha256, /^[a-f0-9]{64}$/)
  const check = spawnSync(process.execPath, ['--', cli, '--check'], { cwd: ROOT, encoding: 'utf8' })
  assert.notEqual(check.status, 0)
  assert.match(check.stderr, /not activated/)
})

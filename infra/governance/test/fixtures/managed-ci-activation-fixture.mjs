import { generateKeyPairSync, sign } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { buildModelReleaseAuthorityFixture } from '../../../../scripts/test-fixtures/model-release-authority-fixture.mjs'
import {
  loadManagedCiActivatedWorkflowContract,
  loadManagedCiTrustedExecutionPlan,
  managedCiActivationDeclarationDigest,
  managedCiActivationVerificationReceiptSigningBytes,
  managedCiExpectedActivationVerificationReceiptTrustBinding,
  managedCiExpectedControlPlaneLockDocument,
  managedCiExpectedControlPlaneSnapshotDocuments,
  managedCiExpectedFrozenSubjectArtifactBinding,
  managedCiExpectedFrozenSubjectClassReadback,
  managedCiExpectedFinalizationTransportContract,
  managedCiExpectedAttestedRunnerEnvironment,
  managedCiExpectedHostSandboxPolicyBinding,
  managedCiExpectedImageSupplyChainBinding,
  managedCiExpectedOidcBinding,
  managedCiExpectedRawReceiptBinding,
  managedCiExpectedReceiptBinding,
  managedCiExpectedReceiptSignerAuthorityBinding,
  managedCiExpectedReceiptSignerIssuerMapping,
  managedCiHostSandboxObservationReceiptDigest,
  managedCiHostSandboxObservationSigningBytes,
  managedCiProvenanceBinding,
  managedCiReceiptSigningBytes,
  managedCiReceiptSigningMaterial,
  managedCiFinalizedReceiptSetDigest,
  managedCiFinalizationTransportReadbackDigest,
  managedCiSignerAuditEvent,
  renderManagedCiActivatedWorkflow,
} from '../../../../scripts/lib/managed-ci-trusted-execution-plan.mjs'
import {
  finalizationRequestEnvelope,
  finalizationTransportAttestationPayloadDigest,
  finalizationTransportAttestationSigningBytes,
  finalizationTransportContractDigest,
  validateFinalizationResponse,
} from '../../managed-ci-executor/authority/managed-ci-authority-client.mjs'
import { managedCiDerivedReadbackBindings } from '../../lib/external-activation.mjs'
import { issuerRegistryDigest } from '../../lib/issuer-registry.mjs'
import { readJson, sha256, stableStringify } from '../../lib/common.mjs'
import { workflowIdentity } from '../../lib/workflow-trust.mjs'

const EXECUTION_CLASSES = Object.freeze([
  'dependency-acquisition',
  'deterministic-hook-audit',
  'model-broker',
  'github-observer',
])
const EVIDENCE_KINDS = Object.freeze({
  'dependency-acquisition': 'dependency-bundle',
  'deterministic-hook-audit': 'deep-audit-deterministic',
  'model-broker': 'deep-audit-judgment',
  'github-observer': 'deep-audit-ci-enforced',
})
const digest = label => sha256(`managed-ci-activation-fixture:${label}`)

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${stableStringify(value, 2)}\n`)
}

function fixtureIssuer(keyId, subject, roles = ['runtime-evidence-issuer']) {
  const keys = generateKeyPairSync('ed25519')
  return {
    ...keys,
    record: {
      keyId,
      subject,
      publicKeySpki: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles,
      status: 'active',
      notBefore: '2020-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}

function copyValidationRoot(sourceRoot, targetRoot) {
  for (const path of ['.github', 'scripts', 'infra/governance', 'packages/governance', 'governance']) {
    cpSync(resolve(sourceRoot, path), resolve(targetRoot, path), { recursive: true })
  }
  for (const path of ['.npmrc', 'package-lock.json']) {
    mkdirSync(dirname(resolve(targetRoot, path)), { recursive: true })
    cpSync(resolve(sourceRoot, path), resolve(targetRoot, path))
  }
  const manifestPath = resolve(sourceRoot, 'packages/governance/canonical/manifest.json')
  const manifest = readJson(manifestPath)
  const providerRegistry = readJson(resolve(dirname(manifestPath), manifest.registries.providers))
  for (const provider of providerRegistry.providers) {
    if (!provider.adapter?.generate) continue
    const generatedViews = new Set([
      provider.adapter?.skillView?.directory,
      provider.adapter?.hookView?.output,
      ...Object.values(provider.adapter?.repositoryManagedTrees ?? {}),
    ].filter(path => typeof path === 'string' && path.length > 0))
    for (const path of generatedViews) {
      if (!existsSync(resolve(sourceRoot, path))) continue
      mkdirSync(dirname(resolve(targetRoot, path)), { recursive: true })
      cpSync(resolve(sourceRoot, path), resolve(targetRoot, path), { recursive: true, force: true })
    }
  }
  for (const source of manifest.sources) {
    const destination = resolve(targetRoot, source.path)
    mkdirSync(dirname(destination), { recursive: true })
    // Manifest sources may intentionally overlap (for example, one required
    // file beneath a later required directory). Merge every declared source
    // so an earlier parent-directory creation cannot hide the rest of the
    // immutable runtime closure.
    cpSync(resolve(sourceRoot, source.path), destination, { recursive: true, force: true })
  }
}

function dateAt(base, offsetMs) {
  return new Date(base.getTime() + offsetMs).toISOString()
}

function compareCodepoints(left, right) {
  return left === right ? 0 : left < right ? -1 : 1
}

function fixtureFileInventory(files) {
  const sorted = [...files].sort((left, right) => compareCodepoints(left.path, right.path))
  return {
    files: sorted,
    inventoryDigest: sha256(Buffer.from(stableStringify(sorted, 0))),
  }
}

function workflowIdentityProjection(content) {
  const identity = workflowIdentity(content)
  return {
    contentSha256: identity.contentSha256,
    gitBlobSha: identity.gitBlobSha,
    semanticVersion: identity.semanticVersion,
    semanticSha256: identity.semanticSha256,
  }
}

// Git >= 2.54 runs the "geometric" auto-maintenance strategy by default
// (maintenance.geometric-repack.auto = 100 loose objects), so a fixture commit of this
// multi-thousand-file tree spawns a DETACHED background repack that deletes loose-object
// fan-out directories while loadManagedCiTrustedExecutionPlan is still verifying — the
// immutable Git repository identity gate then correctly fails closed ("identity changed
// during immutable verification"). The gate's invariant (no concurrent object-database
// mutation during verification) is intact; the fixture must simply never spawn an
// asynchronous writer. Disable every auto-maintenance route on fixture Git commands so
// fixture repositories stay byte- and inode-stable across all Git versions.
function fixtureGit(root, args) {
  return execFileSync('/usr/bin/git', [
    '--no-replace-objects',
    '-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0',
    '-c', 'gc.autoDetach=false',
    ...args,
  ], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-07-24T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-07-24T00:00:00Z',
    },
  }).trim()
}

function commitFixtureSourceSnapshot(root, message, { initialize = false } = {}) {
  if (initialize) fixtureGit(root, ['init', '--quiet', '--initial-branch=main'])
  fixtureGit(root, ['add', '--all'])
  fixtureGit(root, [
    '-c', 'user.name=Managed CI Fixture',
    '-c', 'user.email=managed-ci-fixture@example.invalid',
    'commit', '--quiet', '--no-gpg-sign', '--allow-empty', '-m', message,
  ])
  return {
    executorSourceCommit: fixtureGit(root, ['rev-parse', '--verify', 'HEAD^{commit}']),
    executorSourceTree: fixtureGit(root, ['rev-parse', 'HEAD^{tree}']),
  }
}

function activatePlan(root, observedAt, activationVerifier, sourceIdentity) {
  const path = resolve(root, 'scripts/managed-ci-trusted-execution-plan.json')
  const plan = readJson(path)
  const verifiedAt = dateAt(observedAt, -60 * 60 * 1000).replace('.000Z', 'Z')
  Object.assign(plan.activation, {
    repositoryId: '1191193806',
    repositoryOwnerId: '5268686',
    executorSourceCommit: sourceIdentity.executorSourceCommit,
    executorSourceTree: sourceIdentity.executorSourceTree,
    builderWorkflowSha: sourceIdentity.executorSourceCommit,
    executorBuildRunId: '5101',
    executorBuildRunAttempt: 1,
    imageSetArtifactId: '8101',
    imageSetArtifactDigest: digest('image-set-artifact'),
    imageSetManifestSha256: digest('image-set-manifest'),
    imageSetInventorySha256: digest('image-set-inventory'),
    imageSetInventoryEntryCount: 18,
    imageSetArtifactRetentionDays: 90,
    verifiedAt,
    trustedAuthorityAttestationDigest: digest('trusted-authority-attestation'),
    hostSandboxAttestationDigest: digest('host-sandbox-attestation'),
    receiptSignerTrustReadbackDigest: digest('receipt-signer-readback'),
    offlineEvidenceArchive: {
      locator: 'https://evidence.example.test/managed-ci/offline-evidence-archive',
      digest: digest('offline-evidence-archive'),
      size: 65_536,
      format: 'tar-pax-v1',
      inventoryDigest: digest('offline-evidence-archive-inventory'),
      objectVersionId: 'fixture-managed-ci-archive-v1',
      retentionMode: 'compliance-object-lock',
      retentionUntil: dateAt(observedAt, 365 * 24 * 60 * 60 * 1000),
      writerPrincipal: 'spiffe://qijenchen.dev/managed-ci/archive-writer',
      verifierPrincipal: activationVerifier.record.subject,
      readbackDigest: digest('offline-evidence-archive-readback'),
    },
  })
  EXECUTION_CLASSES.forEach((executionClass, index) => {
    const attestationIdBase = (index + 1) * 100
    plan.activation.executionClasses[executionClass] = {
      imageDigest: `sha256:${String(index + 1).repeat(64)}`,
      runtimeSourceSha256: sha256(readFileSync(resolve(root, 'infra/governance/managed-ci-executor/runtime/managed-ci-runtime.mjs'))),
      runtimeInventoryDigest: digest(`runtime-inventory:${executionClass}`),
      contextArchiveDigest: digest(`context-archive:${executionClass}`),
      sbomDigest: digest(`sbom:${executionClass}`),
      slsaProvenanceDigest: digest(`slsa:${executionClass}`),
      handoffPredicateDigest: digest(`handoff:${executionClass}`),
      evidenceSetDigest: digest(`evidence-set:${executionClass}`),
      provenanceBundleDigest: digest(`provenance-bundle:${executionClass}`),
      provenanceAttestationId: String(attestationIdBase + 1),
      provenanceAttestationUrl: `https://github.com/ajenchen/design-system/attestations/${attestationIdBase + 1}`,
      provenanceRecordReadbackDigest: digest(`provenance-record-readback:${executionClass}`),
      sbomBundleDigest: digest(`sbom-bundle:${executionClass}`),
      sbomAttestationId: String(attestationIdBase + 2),
      sbomAttestationUrl: `https://github.com/ajenchen/design-system/attestations/${attestationIdBase + 2}`,
      sbomRecordReadbackDigest: digest(`sbom-record-readback:${executionClass}`),
      handoffBundleDigest: digest(`handoff-bundle:${executionClass}`),
      handoffAttestationId: String(attestationIdBase + 3),
      handoffAttestationUrl: `https://github.com/ajenchen/design-system/attestations/${attestationIdBase + 3}`,
      handoffRecordReadbackDigest: digest(`handoff-record-readback:${executionClass}`),
      registryReadbackDigest: digest(`registry:${executionClass}`),
    }
  })
  const contract = loadManagedCiActivatedWorkflowContract({ repoRoot: root, plan })
  const workflow = renderManagedCiActivatedWorkflow(plan, contract.contract)
  plan.activation.workflowIdentity = workflowIdentityProjection(workflow)
  writeFileSync(resolve(root, plan.workflow.path), workflow)
  writeJson(path, plan)
  return plan
}

function attachActivationReceipt(root, plan, state, activationVerifier, issuerRegistry, observedAt) {
  const receipt = {
    schemaVersion: 2,
    kind: 'managed-ci-activation-verification-receipt-v2',
    receiptId: '11111111-1111-4111-8111-111111111111',
    declarationDigest: managedCiActivationDeclarationDigest(plan),
    trustBinding: managedCiExpectedActivationVerificationReceiptTrustBinding(state),
    archive: {
      digest: plan.activation.offlineEvidenceArchive.digest,
      size: plan.activation.offlineEvidenceArchive.size,
      inventoryDigest: plan.activation.offlineEvidenceArchive.inventoryDigest,
      objectVersionId: plan.activation.offlineEvidenceArchive.objectVersionId,
      retentionMode: plan.activation.offlineEvidenceArchive.retentionMode,
      retentionUntil: plan.activation.offlineEvidenceArchive.retentionUntil,
      readbackDigest: plan.activation.offlineEvidenceArchive.readbackDigest,
    },
    aggregateHandoff: {
      executionClassCount: EXECUTION_CLASSES.length,
      artifactId: plan.activation.imageSetArtifactId,
      artifactDigest: plan.activation.imageSetArtifactDigest,
      manifestSha256: plan.activation.imageSetManifestSha256,
      inventorySha256: plan.activation.imageSetInventorySha256,
      inventoryEntryCount: plan.activation.imageSetInventoryEntryCount,
      artifactFileCount: 19,
      artifactRetentionDays: plan.activation.imageSetArtifactRetentionDays,
      storageClass: 'github-actions-artifact-non-worm',
    },
    imageDigests: Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
      executionClass,
      plan.activation.executionClasses[executionClass].imageDigest,
    ])),
    runtimeSourceDigests: Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
      executionClass,
      plan.activation.executionClasses[executionClass].runtimeSourceSha256,
    ])),
    runtimeInventoryDigests: Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
      executionClass,
      plan.activation.executionClasses[executionClass].runtimeInventoryDigest,
    ])),
    evidenceSetDigests: Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
      executionClass,
      plan.activation.executionClasses[executionClass].evidenceSetDigest,
    ])),
    verification: {
      archiveBytesVerified: true,
      closedInventoryVerified: true,
      sigstoreBundlesVerified: true,
      certificateIdentityVerified: true,
      rekorInclusionVerified: true,
      githubAttestationReadbackVerified: true,
      registryReadbackVerified: true,
      wormReadbackVerified: true,
      controlPlaneClosureVerified: true,
      replayLedgerCommitVerified: true,
    },
    issuedAt: plan.activation.verifiedAt,
    expiresAt: dateAt(observedAt, 6 * 24 * 60 * 60 * 1000),
    nonce: '22222222-2222-4222-8222-222222222222',
    replay: {
      ledger: plan.trust.replay.ledger,
      reservationId: '11111111-1111-4111-8111-111111111111',
      ledgerReceiptDigest: digest('activation-replay-ledger-receipt'),
      committedAt: plan.activation.verifiedAt,
      retentionUntil: plan.activation.offlineEvidenceArchive.retentionUntil,
    },
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    signatures: [],
  }
  const signature = sign(
    null,
    managedCiActivationVerificationReceiptSigningBytes(plan, receipt),
    activationVerifier.privateKey,
  ).toString('base64url')
  receipt.signatures = [{
    issuerKeyId: activationVerifier.record.keyId,
    issuerSubject: activationVerifier.record.subject,
    signatureAlgorithm: 'Ed25519',
    signature,
  }]
  plan.activation.verificationReceipt = receipt
  writeJson(resolve(root, 'scripts/managed-ci-trusted-execution-plan.json'), plan)
  return plan
}

function bindActivationTrust(root, sourceIdentity = {}) {
  const plan = readJson(resolve(root, 'scripts/managed-ci-trusted-execution-plan.json'))
  const lockPath = resolve(root, plan.activationTrustBundle.controlPlaneLockPath)
  const snapshotDocuments = managedCiExpectedControlPlaneSnapshotDocuments({
    repoRoot: root,
    ...sourceIdentity,
  })
  const outputDirectory = resolve(
    root,
    readJson(resolve(root, plan.activationTrustBundle.manifestPath)).outputDirectory,
  )
  rmSync(outputDirectory, { recursive: true, force: true })
  for (const document of snapshotDocuments) {
    const path = resolve(root, document.path)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, document.content)
    chmodSync(path, Number.parseInt(document.mode, 8))
  }
  writeJson(lockPath, managedCiExpectedControlPlaneLockDocument({
    repoRoot: root,
    ...sourceIdentity,
  }))
}

function buildHostObservation(state, executionClass, workflowRunId, runAttempt, observedAt, issuer) {
  const negativeProbes = {
    candidateWriteDenied: true,
    undeclaredWriteDenied: true,
    rawSocketDenied: true,
    directInternetDenied: true,
    unlistedHostDenied: true,
    containerEngineSocketAbsent: true,
    hostNamespaceDenied: true,
    ambientSecretAbsent: true,
  }
  const observation = {
    schemaVersion: 1,
    kind: 'managed-ci-host-sandbox-independent-observation-v1',
    executionClass,
    workflowRunId,
    runAttempt,
    policyBinding: managedCiExpectedHostSandboxPolicyBinding(state, executionClass),
    receiptDigest: digest(`host-placeholder:${executionClass}`),
    issuerKeyId: issuer.record.keyId,
    issuerSubject: issuer.record.subject,
    signatureAlgorithm: 'Ed25519',
    signature: 'A'.repeat(86),
    observedAt,
    networkNamespaceDigest: digest(`host-network:${executionClass}`),
    firewallPolicyDigest: digest(`host-firewall:${executionClass}`),
    egressProxyPolicyDigest: digest(`host-proxy:${executionClass}`),
    mountTableDigest: digest(`host-mount:${executionClass}`),
    negativeProbeDigest: sha256(stableStringify(negativeProbes, 0)),
    negativeProbes,
  }
  observation.receiptDigest = managedCiHostSandboxObservationReceiptDigest(state, observation)
  observation.signature = sign(null, managedCiHostSandboxObservationSigningBytes(state, observation), issuer.privateKey).toString('base64url')
  return observation
}

function buildRawReceipt({
  state,
  executionClass,
  evidenceKind,
  selectedProvider,
  workflowRunId,
  runAttempt,
  provenance,
  issuerRegistry,
  rawIssuer,
  signedAt,
  oidcClaimsDigest,
  evidenceEnvelopeDigest,
  generatedOutputClosureDigest,
}) {
  const dependency = {
    lockfileSha256: digest('dependency-lockfile'),
    installedLockfileSha256: digest('installed-dependency-lockfile'),
    installedDependencyIdentityDigest: digest('installed-dependency-identity'),
    installedPackageCount: 17,
  }
  const dependencyBundleDigest = executionClass === 'github-observer'
    ? null
    : sha256(stableStringify(dependency, 0))
  const closure = label => ({
    beforeDigest: digest(`${label}:${executionClass}`),
    afterDigest: digest(`${label}:${executionClass}`),
  })
  const runtimePolicyDigest = state.trust.bindings.find(
    item => item.path === state.plan.trust.runtimeEvidencePolicyPath,
  )?.sha256
  const runnerEnvironment = managedCiExpectedAttestedRunnerEnvironment(state)
  const containmentBackend = runnerEnvironment === 'github-hosted'
    ? 'github-hosted-ephemeral-container'
    : 'self-hosted-attested-ephemeral-container'
  const binding = {
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    runtimePolicyDigest,
    observedAt: signedAt,
    expiresAt: dateAt(new Date(signedAt), 30 * 60 * 1000),
    nonce: `33333333-3333-4333-8${String(EXECUTION_CLASSES.indexOf(executionClass) + 1).padStart(3, '0')}-333333333333`,
    ...managedCiExpectedRawReceiptBinding(state, { evidenceKind, selectedProvider }),
    oidcClaimsDigest,
    dependencyBundleDigest,
    evidenceEnvelopeDigest,
    dependency,
    execution: {
      runnerEnvironment,
      runnerImageDigest: digest(`runner-image:${executionClass}`),
      containerImageDigest: state.classes.get(executionClass).containerImageDigest,
      containerIdDigest: digest(`container-id:${executionClass}`),
      oidcClaimsDigest,
      containmentBackend,
      externalWriteContainment: 'verified',
    },
    workflow: {
      repository: provenance.workflowRepository,
      path: provenance.workflowPath,
      runId: workflowRunId,
      runAttempt,
      event: provenance.workflowEvent,
      head: provenance.auditedSubjectCommit,
      tree: provenance.auditedSubjectTree,
    },
    activeRun: {
      runId: provenance.auditedSubjectRunId,
      manifestSha256: provenance.auditedManifestSha256,
      head: provenance.auditedSubjectCommit,
      tree: provenance.auditedSubjectTree,
    },
    callerClosure: closure('caller-closure'),
    manifestClosure: closure('manifest-verification'),
    dependencyClosure: closure('dependency-view'),
    generatedOutputClosureDigest,
    cleanup: true,
  }
  const signedBytes = Buffer.from(stableStringify(binding, 0))
  const receipt = {
    materialization: 'fresh-npm-ci-from-frozen-lockfile',
    manifestVerificationBeforeDigest: binding.manifestClosure.beforeDigest,
    manifestVerificationAfterDigest: binding.manifestClosure.afterDigest,
    callerFingerprintBeforeDigest: binding.callerClosure.beforeDigest,
    callerFingerprintAfterDigest: binding.callerClosure.afterDigest,
    dependencyViewBeforeDigest: binding.dependencyClosure.beforeDigest,
    dependencyViewAfterDigest: binding.dependencyClosure.afterDigest,
    dependencyLockfileSha256: dependency.lockfileSha256,
    installedLockfileSha256: dependency.installedLockfileSha256,
    installedDependencyIdentityDigest: dependency.installedDependencyIdentityDigest,
    dependencyProvenance: 'fresh-npm-ci',
    dependencyTrust: 'managed-ci-attested',
    executionIsolation: 'ephemeral-managed-ci-container',
    containmentBackend,
    externalWriteContainment: 'verified',
    cleanup: true,
    installedPackageCount: dependency.installedPackageCount,
    attestation: {
      schemaVersion: 1,
      contract: 'managed-ci-sandbox-attestation-v1',
      binding,
      signatures: [{
        issuerKeyId: rawIssuer.record.keyId,
        payloadSha256: sha256(signedBytes),
        signature: sign(null, signedBytes, rawIssuer.privateKey).toString('base64url'),
      }],
    },
  }
  return {
    bytes: Buffer.from(`${stableStringify(receipt, 2)}\n`),
    context: {
      manifestVerificationDigest: binding.manifestClosure.beforeDigest,
      dependencyLockfileSha256: dependency.lockfileSha256,
      dependencyBundleDigest,
      evidenceEnvelopeDigest,
      oidcClaimsDigest,
      generatedOutputClosureDigest,
    },
  }
}

function buildObservedResource({
  state,
  runtimeProfile,
  issuerRegistry,
  signerIssuer,
  rawIssuer,
  hostIssuer,
  modelAuthorityFixture,
  observedAt,
}) {
  const workflowRunId = '6101'
  const runAttempt = 1
  const workflowDefinitionCommit = '4'.repeat(40)
  const workflowDefinitionTree = '5'.repeat(40)
  const auditedSubjectCommit = '6'.repeat(40)
  const auditedSubjectTree = '7'.repeat(40)
  const auditedManifestSha256 = digest('audited-manifest')
  const auditedSubjectRunId = '12345678-1234-4123-8123-123456789abc'
  const hostObservedAt = dateAt(observedAt, -3 * 60 * 1000)
  const downloadedAt = dateAt(observedAt, -2 * 60 * 1000)
  const receiptSignedAt = dateAt(observedAt, -60 * 1000)
  const protectedMainMergedAt = dateAt(observedAt, -30 * 60 * 1000)

  const hostReadbacks = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
    executionClass,
    buildHostObservation(state, executionClass, workflowRunId, runAttempt, hostObservedAt, hostIssuer),
  ]))
  const frozenSubject = managedCiExpectedFrozenSubjectArtifactBinding(state, {
    artifactName: `managed-ci-frozen-subject-${workflowRunId}-${runAttempt}`,
    artifactId: '70101',
    artifactStorageLocator: 'github-actions-artifact://ajenchen/design-system/70101',
    artifactSha256: digest('frozen-artifact'),
    artifactSize: 4096,
    subjectCommit: auditedSubjectCommit,
    subjectTree: auditedSubjectTree,
    freezeRunId: auditedSubjectRunId,
    manifestSha256: auditedManifestSha256,
    manifestBytesSha256: digest('frozen-manifest-bytes'),
    coverageDigest: digest('frozen-coverage'),
    shardSetDigest: digest('frozen-shards'),
    workflowDefinitionCommit,
    workflowDefinitionTree,
    workflowRunId,
    runAttempt,
    authorityOidcProjectionDigest: digest('freeze-authority-oidc'),
  })
  const frozenReadbacks = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
    executionClass,
    managedCiExpectedFrozenSubjectClassReadback(state, {
      executionClass,
      frozenSubject,
      recomputedArtifactSha256: frozenSubject.artifactSha256,
      recomputedManifestBytesSha256: frozenSubject.manifestBytesSha256,
      downloadedAt,
      hostObservationReceiptDigest: hostReadbacks[executionClass].receiptDigest,
    }),
  ]))
  const provenance = managedCiProvenanceBinding(state, {
    workflowDefinitionRef: `${state.plan.workflow.repository}/${state.plan.workflow.path}@${state.plan.workflow.ref}`,
    workflowDefinitionCommit,
    workflowDefinitionTree,
    workflowRunId,
    runAttempt,
    subjectCommit: auditedSubjectCommit,
    subjectTree: auditedSubjectTree,
    manifestSha256: auditedManifestSha256,
    subjectRunId: auditedSubjectRunId,
    frozenSubject,
  })
  const modelReleaseAuthorityBinding = structuredClone(modelAuthorityFixture.binding)
  const imageBindings = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
    executionClass,
    managedCiExpectedImageSupplyChainBinding(state, executionClass),
  ]))
  const observedEpochSeconds = Math.floor(observedAt.getTime() / 1000)
  const oidcProjections = Object.fromEntries(EXECUTION_CLASSES.map((executionClass, index) => [
    executionClass,
    managedCiExpectedOidcBinding(state, {
      executionClass,
      workflowDefinitionCommit,
      workflowDefinitionTree,
      workflowRunId,
      runAttempt,
      subjectCommit: auditedSubjectCommit,
      subjectTree: auditedSubjectTree,
      manifestSha256: auditedManifestSha256,
      subjectRunId: auditedSubjectRunId,
      frozenSubject,
      modelRelease: executionClass === 'model-broker' ? modelReleaseAuthorityBinding : null,
      tokenRuntime: {
        jti: `fixture-oidc-jti-${index + 1}`,
        iat: observedEpochSeconds - 60,
        nbf: observedEpochSeconds - 60,
        exp: observedEpochSeconds + 300,
      },
    }),
  ]))
  const oidcClaimDigests = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
    executionClass,
    sha256(stableStringify(oidcProjections[executionClass], 0)),
  ]))
  const evidenceEnvelopeDigests = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
    executionClass,
    digest(`evidence-envelope:${executionClass}`),
  ]))
  const generatedOutputClosureDigests = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
    executionClass,
    digest(`generated-output-closure:${executionClass}`),
  ]))
  const signerAuthority = managedCiExpectedReceiptSignerAuthorityBinding(state)
  const signerIssuerMapping = managedCiExpectedReceiptSignerIssuerMapping(state, {
    issuerKeyId: signerIssuer.record.keyId,
    issuerSubject: signerIssuer.record.subject,
  })
  const finalizedReceipts = Object.fromEntries(EXECUTION_CLASSES.map((executionClass, index) => {
    const selectedProvider = executionClass === 'model-broker' ? 'codex' : null
    const modelRelease = executionClass === 'model-broker' ? modelReleaseAuthorityBinding : null
    const signedAt = dateAt(new Date(receiptSignedAt), index * 1000)
    const receiptBinding = managedCiExpectedReceiptBinding(state, {
      evidenceKind: EVIDENCE_KINDS[executionClass],
      selectedProvider,
      modelRelease,
    })
    const rawReceipt = buildRawReceipt({
      state,
      executionClass,
      evidenceKind: EVIDENCE_KINDS[executionClass],
      selectedProvider,
      workflowRunId,
      runAttempt,
      provenance,
      issuerRegistry,
      rawIssuer,
      signedAt,
      oidcClaimsDigest: oidcClaimDigests[executionClass],
      evidenceEnvelopeDigest: evidenceEnvelopeDigests[executionClass],
      generatedOutputClosureDigest: generatedOutputClosureDigests[executionClass],
    })
    const material = managedCiReceiptSigningMaterial(state, {
      evidenceKind: EVIDENCE_KINDS[executionClass],
      workflowRunId,
      runAttempt,
      rawReceiptBytes: rawReceipt.bytes,
      rawReceiptPath: `${executionClass}.json`,
      rawReceiptContext: rawReceipt.context,
      provenanceBinding: provenance,
      receiptBinding,
      frozenSubjectReadback: frozenReadbacks[executionClass],
      hostObservation: hostReadbacks[executionClass],
      imageSupplyChainBinding: imageBindings[executionClass],
      issuerMapping: signerIssuerMapping,
      signedAt,
      selectedProvider,
      modelRelease,
    })
    const payload = material.payload
    const signature = sign(null, managedCiReceiptSigningBytes(state, payload, { issuerMapping: signerIssuerMapping }), signerIssuer.privateKey).toString('base64url')
    const event = managedCiSignerAuditEvent(state, {
      eventId: `fixture-signer-event-${index + 1}`,
      signature,
      receiptSigningPayload: payload,
      issuerMapping: signerIssuerMapping,
    })
    return [executionClass, {
      payload,
      event,
      rawReceiptValidationReadback: material.rawReceiptValidationReadback,
      rawReceiptInput: {
        path: `${executionClass}.json`,
        sourceArtifactPath: `${executionClass}/receipts/${executionClass}.json`,
        sha256: sha256(rawReceipt.bytes),
        size: rawReceipt.bytes.length,
        contentBase64: rawReceipt.bytes.toString('base64'),
      },
    }]
  }))
  const receiptDigests = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
    executionClass,
    finalizedReceipts[executionClass].rawReceiptValidationReadback.rawReceiptDigest,
  ]))
  const rawReceiptValidationReadbacks = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
    executionClass,
    finalizedReceipts[executionClass].rawReceiptValidationReadback,
  ]))
  const receiptSigningPayloads = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [executionClass, finalizedReceipts[executionClass].payload]))
  const signerAuditEvents = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [executionClass, finalizedReceipts[executionClass].event]))
  const rawReceiptSet = Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [
    executionClass,
    finalizedReceipts[executionClass].rawReceiptInput,
  ]))
  const classResultInventory = fixtureFileInventory(EXECUTION_CLASSES.map(executionClass => ({
    path: rawReceiptSet[executionClass].sourceArtifactPath,
    sha256: rawReceiptSet[executionClass].sha256,
    size: rawReceiptSet[executionClass].size,
  })))
  const hostObservationInventory = fixtureFileInventory(EXECUTION_CLASSES.map(executionClass => {
    const bytes = Buffer.from(stableStringify(hostReadbacks[executionClass], 0))
    return {
      path: `${executionClass}/host/${executionClass}.json`,
      sha256: sha256(bytes),
      size: bytes.length,
    }
  }))
  const transportContract = managedCiExpectedFinalizationTransportContract(state)
  const finalizationRequest = {
    schemaVersion: 1,
    kind: 'managed-ci-authority-operation-request-v1',
    operation: 'finalize-receipts',
    repository: state.plan.workflow.repository,
    repositoryId: state.plan.activation.repositoryId,
    repositoryOwnerId: state.plan.activation.repositoryOwnerId,
    workflowRef: `${state.plan.workflow.repository}/${state.plan.workflow.path}@${state.plan.workflow.ref}`,
    workflowSha: workflowDefinitionCommit,
    workflowRunId,
    runAttempt,
    eventName: state.plan.workflow.event,
    protectedRef: state.plan.workflow.ref,
    classResultInventory,
    rawReceiptSet,
    hostObservationInventory,
    signerIssuerRegistry: structuredClone(issuerRegistry),
    transportContract,
    candidateBytesExecute: false,
  }
  const finalizationEnvelope = finalizationRequestEnvelope(finalizationRequest)
  const finalizationRawReceiptSetDigest = sha256(Buffer.from(stableStringify(rawReceiptSet, 0)))
  const finalizedReceiptSet = {
    schemaVersion: 1,
    kind: 'managed-ci-finalized-receipt-set-v1',
    requestSha256: finalizationEnvelope.requestSha256,
    workflowRunId,
    runAttempt,
    rawReceiptSetDigest: finalizationRawReceiptSetDigest,
    signerIssuerMapping: structuredClone(signerIssuerMapping),
    receipts: Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [executionClass, {
      rawReceiptPath: `${executionClass}.json`,
      rawReceiptDigest: receiptDigests[executionClass],
      rawReceiptValidationReadback: rawReceiptValidationReadbacks[executionClass],
      receiptSigningPayload: receiptSigningPayloads[executionClass],
      signerAuditEvent: signerAuditEvents[executionClass],
    }])),
  }
  finalizedReceiptSet.setDigest = managedCiFinalizedReceiptSetDigest(finalizedReceiptSet)
  const finalizationTransportReadback = {
    schemaVersion: 1,
    kind: 'managed-ci-finalization-transport-readback-v1',
    requestSha256: finalizationEnvelope.requestSha256,
    finalizedReceiptSetDigest: finalizedReceiptSet.setDigest,
    transportContractDigest: finalizationTransportContractDigest(transportContract),
    clientToGateway: {
      endpointHost: transportContract.clientToGateway.endpointHost,
      endpointPort: transportContract.clientToGateway.endpointPort,
      operationPath: transportContract.clientToGateway.operationPath,
      tlsVersion: 'TLSv1.3',
      serverHostnameVerified: true,
      clientAuthentication: transportContract.clientToGateway.clientAuthentication,
      oidcAudience: transportContract.clientToGateway.oidcAudience,
      oidcBearerVerified: true,
    },
    gatewayToSigner: {
      endpointHost: transportContract.gatewayToSigner.endpointHost,
      endpointPort: transportContract.gatewayToSigner.endpointPort,
      transport: transportContract.gatewayToSigner.transport,
      tlsVersion: 'TLSv1.3',
      mutualTlsEstablished: true,
      gatewayClientCertificateIdentity: transportContract.gatewayToSigner.gatewayClientCertificateIdentity,
      signerServerCertificateIdentity: transportContract.gatewayToSigner.signerServerCertificateIdentity,
      signerKeyIdentity: transportContract.gatewayToSigner.signerKeyIdentity,
      signerAuthorityBindingDigest: signerAuthority.bindingDigest,
      gatewayHeldSignerPrivateKey: false,
    },
    observedAt: dateAt(observedAt, -30 * 1000),
    attestation: {
      issuerMapping: structuredClone(signerIssuerMapping),
      signedAt: dateAt(observedAt, -30 * 1000),
      payloadDigest: null,
      signature: null,
    },
  }
  finalizationTransportReadback.attestation.payloadDigest =
    finalizationTransportAttestationPayloadDigest(finalizationTransportReadback)
  finalizationTransportReadback.attestation.signature = sign(
    null,
    finalizationTransportAttestationSigningBytes(finalizationTransportReadback),
    signerIssuer.privateKey,
  ).toString('base64url')
  finalizationTransportReadback.readbackDigest = managedCiFinalizationTransportReadbackDigest(finalizationTransportReadback)
  const finalizationResponse = {
    schemaVersion: 1,
    kind: 'managed-ci-authority-finalization-response-v1',
    operation: 'finalize-receipts',
    status: 'complete',
    requestSha256: finalizationEnvelope.requestSha256,
    finalizedReceiptSet,
    transportReadback: finalizationTransportReadback,
  }
  validateFinalizationResponse(finalizationResponse, {
    request: finalizationRequest,
    requestSha256: finalizationEnvelope.requestSha256,
  })
  const classValue = field => Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [executionClass, state.classes.get(executionClass)[field]]))
  const runtimeBinding = state.trust.bindings.find(item => item.path === state.plan.trust.runtimeEvidencePolicyPath)
  const modelEgress = state.classes.get('model-broker').modelEgress
  const claims = {
    planDigest: state.planDigest,
    planSchemaDigest: state.schemaDigest,
    workflowIdentityDigest: state.workflow.workflowIdentityDigest,
    activationTrustBundleDigest: state.activationTrustBundle.bindingDigest,
    activationTrustFileDigests: structuredClone(state.activationTrustBundle.fileDigests),
    governanceManifestDigest: state.activationTrustBundle.manifest.sha256,
    controlPlaneLockDigest: state.activationTrustBundle.controlPlaneLock.sha256,
    controlPlaneContractDigest: state.activationTrustBundle.controlPlaneLock.contractDigest,
    controlPlaneInputDigest: state.activationTrustBundle.controlPlaneLock.inputDigest,
    controlPlaneSnapshotDigest: state.activationTrustBundle.controlPlaneLock.snapshotDigest,
    controlPlaneManifestId: state.activationTrustBundle.controlPlaneLock.manifestId,
    workflowRepository: state.plan.workflow.repository,
    workflowPath: state.plan.workflow.path,
    workflowRef: state.plan.workflow.ref,
    workflowEvent: state.plan.workflow.event,
    runnerEnvironment: state.plan.workflow.runnerEnvironment,
    workflowDefinitionRef: provenance.workflowDefinitionRef,
    workflowDefinitionCommit,
    workflowDefinitionTree,
    workflowDefinitionProtectedMain: true,
    auditedSubjectCommit,
    auditedSubjectTree,
    auditedManifestSha256,
    auditedSubjectRunId,
    frozenSubjectArtifactBinding: frozenSubject,
    executionClassFrozenSubjectReadbacks: frozenReadbacks,
    modelReleaseAuthorityBinding,
    workflowDispatchInputsDigest: provenance.workflowDispatchInputsDigest,
    provenanceBindingDigest: provenance.provenanceBindingDigest,
    workflowRunId,
    runAttempt,
    bootstrapMode: 'protected-main-control-plane-only',
    protectedMainMergedAt,
    releaseMutationsObserved: false,
    candidateSelfCertificationAllowed: false,
    executionClassProfileDigests: classValue('profileDigest'),
    containerImageDigests: classValue('containerImageDigest'),
    networkPolicyDigests: classValue('networkPolicyCatalogDigest'),
    isolationPolicyDigests: classValue('isolationPolicyDigest'),
    permissionsDigests: classValue('permissionsDigest'),
    executionClassControlPlaneBundleDigests: Object.fromEntries(EXECUTION_CLASSES.map(executionClass => [executionClass, state.activationTrustBundle.bindingDigest])),
    executionClassReceiptDigests: receiptDigests,
    executionClassEvidenceEnvelopeDigests: evidenceEnvelopeDigests,
    executionClassGeneratedOutputClosureDigests: generatedOutputClosureDigests,
    executionClassOidcClaimProjections: oidcProjections,
    executionClassImageSupplyChainBindings: imageBindings,
    executionClassHostSandboxReadbacks: hostReadbacks,
    receiptSignerAuthorityBinding: signerAuthority,
    receiptSignerIssuerMapping: signerIssuerMapping,
    executionClassRawReceiptValidationReadbacks: rawReceiptValidationReadbacks,
    executionClassReceiptSigningPayloads: receiptSigningPayloads,
    executionClassSignerAuditEvents: signerAuditEvents,
    finalizationRequestDigest: finalizationEnvelope.requestSha256,
    finalizationRawReceiptSetDigest,
    finalizationReceiptSetDigest: finalizedReceiptSet.setDigest,
    finalizationTransportReadback,
    finalizationTransportReadbackDigest: finalizationTransportReadback.readbackDigest,
    trustProfileDigest: state.trust.digest,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    runtimePolicyDigest: runtimeBinding.sha256,
    issuerKeyIds: [...runtimeProfile.allowedKeyIds],
    issuerQuorum: runtimeProfile.requiredIssuerQuorum,
    oidcIssuer: state.plan.observation.oidcIssuer,
    oidcAudience: state.plan.observation.oidcAudience,
    oidcSubjectConfiguration: {
      useDefault: true,
      useImmutableSubject: true,
      includeClaimKeys: [],
      expectedSubject: oidcProjections[EXECUTION_CLASSES[0]].claimProjection.sub,
    },
    secretBrokerPolicyDigests: Object.fromEntries(['model-broker', 'github-observer'].map(executionClass => [executionClass, state.classes.get(executionClass).oidcBrokerPolicyDigest])),
    providerEgressRegistryDigest: modelEgress.registrySha256,
    providerEgressProfilesDigest: modelEgress.brokerProfilesSha256,
    providerEgressEnforcementDigests: Object.fromEntries(modelEgress.profiles.map(item => [item.selectedProvider, digest(`provider-egress:${item.selectedProvider}`)])),
  }
  return {
    observedResource: { ...claims, ...managedCiDerivedReadbackBindings(claims) },
    authorityFinalization: {
      requestEnvelope: finalizationEnvelope,
      request: finalizationRequest,
      response: finalizationResponse,
    },
  }
}

export function createManagedCiActivationFixture({
  repoRoot,
  issuerRegistry: baseIssuerRegistry,
  prepareRoot = null,
  runtimeProfile: baseRuntimeProfile,
  observedAt = '2026-07-20T00:00:00.000Z',
} = {}) {
  const observationTime = new Date(observedAt)
  if (!repoRoot
    || (prepareRoot !== null && typeof prepareRoot !== 'function')
    || !Number.isFinite(observationTime.getTime())
    || observationTime.toISOString() !== observedAt) {
    throw new Error('managed CI activation fixture inputs are invalid')
  }
  const root = mkdtempSync(resolve(tmpdir(), 'managed-ci-activation-root-'))
  try {
    copyValidationRoot(repoRoot, root)
    if (prepareRoot !== null) prepareRoot(root)
    const releaseRegistryPath = resolve(root, 'infra/governance/providers/model-release-registry.json')
    const releaseRegistry = readJson(releaseRegistryPath)
    const selectedRelease = releaseRegistry.records.find(item => item.id === 'codex/gpt-5.6-sol')
    if (!selectedRelease) throw new Error('managed CI activation fixture model release is missing')
    selectedRelease.validFrom = dateAt(observationTime, -24 * 60 * 60 * 1000)
    writeJson(releaseRegistryPath, releaseRegistry)

    const modelAuthorityFixture = buildModelReleaseAuthorityFixture({
      repoRoot: root,
      releaseId: selectedRelease.id,
      timeline: {
        sourceRetrievedAt: dateAt(observationTime, -20 * 60 * 1000),
        sourceExpiresAt: dateAt(observationTime, 30 * 60 * 1000),
        invocationStartedAt: dateAt(observationTime, -15 * 60 * 1000),
        invocationObservedAt: dateAt(observationTime, -14 * 60 * 1000),
        invocationFinishedAt: dateAt(observationTime, -13 * 60 * 1000),
        revocationCheckedAt: dateAt(observationTime, -14 * 60 * 1000),
        revocationExpiresAt: dateAt(observationTime, 30 * 60 * 1000),
        authorityIssuedAt: dateAt(observationTime, -11 * 60 * 1000),
        authorityExpiresAt: dateAt(observationTime, 30 * 60 * 1000),
        auditObservedAt: dateAt(observationTime, -10 * 60 * 1000),
        auditExpiresAt: dateAt(observationTime, 30 * 60 * 1000),
        modelReleaseValidUntil: dateAt(observationTime, 30 * 60 * 1000),
      },
    })
    const signerIssuer = fixtureIssuer('fixture-managed-ci-receipt-signer', 'spiffe://qijenchen.dev/managed-ci/receipt-signer')
    const rawIssuer = fixtureIssuer('fixture-managed-ci-raw-receipt-issuer', 'spiffe://qijenchen.dev/managed-ci/raw-receipt-issuer')
    const hostIssuer = fixtureIssuer('fixture-managed-ci-host-observer', 'spiffe://qijenchen.dev/managed-ci/host-observer')
    const activationVerifier = fixtureIssuer(
      'fixture-managed-ci-activation-verifier',
      'spiffe://qijenchen.dev/managed-ci/activation-verifier',
      ['apply-authorizer', 'completion-attestor'],
    )
    const issuerRegistry = structuredClone(baseIssuerRegistry)
    issuerRegistry.issuers.push(
      ...modelAuthorityFixture.issuerRegistry.issuers,
      signerIssuer.record,
      rawIssuer.record,
      hostIssuer.record,
      activationVerifier.record,
    )
    const keyIds = issuerRegistry.issuers.map(item => item.keyId)
    if (new Set(keyIds).size !== keyIds.length) throw new Error('managed CI activation fixture issuer keys collide')
    writeJson(resolve(root, 'infra/governance/trust/issuers.json'), issuerRegistry)

    const runtimeProfile = structuredClone(baseRuntimeProfile)
    runtimeProfile.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
    runtimeProfile.allowedKeyIds = [
      hostIssuer.record.keyId,
      rawIssuer.record.keyId,
      signerIssuer.record.keyId,
    ].sort()
    runtimeProfile.requiredIssuerQuorum = 1
    writeJson(resolve(root, 'infra/governance/providers/runtime-conformance.json'), runtimeProfile)

    const releaseRingsPath = resolve(root, 'infra/governance/release-rings.json')
    const releaseRings = readJson(releaseRingsPath)
    releaseRings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
    releaseRings.attestationPolicy.allowedKeyIds = [activationVerifier.record.keyId]
    releaseRings.attestationPolicy.completionAttestationQuorum = 1
    writeJson(releaseRingsPath, releaseRings)

    const provisionalSource = commitFixtureSourceSnapshot(
      root,
      'fixture inactive protected source',
      { initialize: true },
    )
    bindActivationTrust(root, provisionalSource)
    const protectedSource = commitFixtureSourceSnapshot(
      root,
      'fixture immutable activation trust snapshot',
    )
    const plan = activatePlan(
      root,
      observationTime,
      activationVerifier,
      protectedSource,
    )
    const preReceiptState = loadManagedCiTrustedExecutionPlan({
      repoRoot: root,
      now: observationTime,
    })
    attachActivationReceipt(root, plan, preReceiptState, activationVerifier, issuerRegistry, observationTime)
    bindActivationTrust(root)
    const state = loadManagedCiTrustedExecutionPlan({
      repoRoot: root,
      requireActivated: true,
      now: observationTime,
    })
    const finalizationFixture = buildObservedResource({
      state,
      runtimeProfile,
      issuerRegistry,
      signerIssuer,
      rawIssuer,
      hostIssuer,
      modelAuthorityFixture,
      observedAt: observationTime,
    })
    return {
      issuerRegistry,
      runtimeProfile,
      managedCiState: state,
      runtimeEvidenceSigner: { keyId: signerIssuer.record.keyId, privateKey: signerIssuer.privateKey },
      managedCiValidationContext: { repoRoot: root, runtimeProfile: structuredClone(runtimeProfile) },
      observedResource: () => structuredClone(finalizationFixture.observedResource),
      authorityFinalization: () => structuredClone(finalizationFixture.authorityFinalization),
      dispose: () => rmSync(root, { recursive: true, force: true }),
    }
  } catch (error) {
    rmSync(root, { recursive: true, force: true })
    throw error
  }
}

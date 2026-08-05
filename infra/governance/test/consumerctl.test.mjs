import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  CONSUMER_FANOUT_LIMITS,
  assertConsumerFanoutRuntimeIdentityCurrent,
  checkPackageCompatibility,
  createConsumerFanoutCheckReceipt,
  createConsumerFanoutReviewReceipt,
  createConsumerFanoutReviewSigningRequest,
  createConsumerRuntimeIdentitySnapshot,
  doctorRepository,
  executeConsumerFanout,
  main as consumerctlMain,
  planBootstrap,
  planConsumerFanout,
  planConsumerRegistration,
  planUpgrade,
  validateConsumerFanoutPlan,
  validateConsumerFanoutCheckReceipt,
  validateConsumerFanoutReviewReceipt,
  validateConsumerFanoutReviewSigningRequest,
  validateConsumerRegistrationProposal,
} from '../bin/consumerctl.mjs'
import { GhApiClient } from '../bin/reconcile-github.mjs'
import { readJson, resolveOwnership, sha256, stableStringify } from '../lib/common.mjs'
import {
  consumerBootstrapReadbackSha256,
  consumerControlPlaneExternalReceiptSigningPayload,
  createConsumerBootstrapMaterializationPlan,
  createConsumerBootstrapPromotionProposal,
  consumerControlPlaneUpdateReadbackSha256,
  createConsumerControlPlaneUpdateAcceptanceProposal,
  createConsumerControlPlaneUpdatePlan,
  inspectConsumerControlPlaneGitSnapshot,
  materializeConsumerBootstrapSnapshot,
  materializeConsumerControlPlaneUpdateSnapshot,
  validateConsumerBootstrapMaterializationPlan,
  validateConsumerBootstrapPromotionProposal,
  validateConsumerControlPlaneUpdateAcceptanceProposal,
  validateConsumerControlPlaneUpdatePlan,
  validateIndependentConsumerBootstrapReadback,
  validateIndependentConsumerControlPlaneUpdateReadback,
  verifyMaterializedConsumerBootstrapSnapshot,
  verifyContextualConsumerControlPlaneUpdateSnapshot,
  verifyMaterializedConsumerControlPlaneUpdateSnapshot,
} from '../lib/consumer-bootstrap.mjs'
import {
  loadConsumerUpgradeProtocol,
  protocolLockProjection,
  protocolSourceDigests,
  validateConsumerBootstrapReadback,
  validateConsumerControlPlaneUpdateReadback,
  validateProtocolLock,
} from '../lib/consumer-upgrade-protocol.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import { issueSignedAttestation } from '../lib/attestation.mjs'
import { createExternalRuntimeCertificationFixture } from './fixtures/external-runtime-certification-fixture.mjs'
import {
  RELEASE_PACKAGE_NAMES,
  RELEASE_PUBLISH_ORDER,
  RELEASE_SUPPLY_CHAIN,
} from '../../../scripts/release-bom-contract.mjs'
import { buildProductTemplateScaffoldLock } from '../../../scripts/product-template-scaffold-lock.mjs'

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/consumer')
const inventory = readJson(resolve(FIXTURES, 'inventory.json'))
const GOVERNANCE_ROOT = resolve(FIXTURES, '../../..')
const rootPackage = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))

function writeBootstrapTree(root, files) {
  mkdirSync(root, { recursive: true })
  for (const [path, specification] of Object.entries(files)) {
    const absolute = resolve(root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, specification.content)
    chmodSync(absolute, specification.mode ?? 0o644)
  }
}

function commitSnapshot(root) {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Control Plane Test'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'control-plane-test@example.invalid'], { cwd: root })
  execFileSync('git', ['add', '--all'], { cwd: root })
  execFileSync('git', ['commit', '-q', '-m', 'fixture snapshot'], {
    cwd: root,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-07-20T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-07-20T00:00:00Z',
    },
  })
}

function controlPlaneTrustFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const issuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [{
      keyId: 'control-plane-observer-1',
      subject: 'external-github-observer:test',
      publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      roles: ['apply-authorizer', 'completion-attestor'],
      status: 'active',
      notBefore: '2026-07-19T00:00:00.000Z',
      notAfter: '2027-07-20T00:00:00.000Z',
      revokedAt: null,
    }],
  }
  const attestationPolicy = {
    schemaVersion: 1,
    algorithm: 'ed25519',
    maxAuthorizationTtlMinutes: 60,
    maxCompletionTtlMinutes: 1440,
    clockSkewSeconds: 120,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    allowedKeyIds: ['control-plane-observer-1'],
    applyAuthorizationQuorum: 1,
    completionAttestationQuorum: 1,
  }
  return { privateKey, issuerRegistry, attestationPolicy }
}

function signControlPlaneReceipt(receipt, trust) {
  receipt.signatures = [{
    signerKeyId: 'control-plane-observer-1',
    subject: 'external-github-observer:test',
    signature: sign(
      null,
      consumerControlPlaneExternalReceiptSigningPayload(receipt),
      trust.privateKey,
    ).toString('base64url'),
  }]
  return receipt
}

test('every required product materialization path joins a non-default ownership rule', () => {
  const managed = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
  const manifest = JSON.parse(readFileSync(new URL('../../../packages/design-system/ds-canonical/fork/manifest.json', import.meta.url), 'utf8'))
  const policy = managed.ownershipPolicies['product-consumer']

  for (const path of manifest.consumer.materialization.exactPaths) {
    const ownership = resolveOwnership(policy, path)
    assert.notEqual(ownership.pattern, '<default>', `materialized path has no explicit ownership:${path}`)
  }
  assert.deepEqual(
    resolveOwnership(policy, 'npm-shrinkwrap.json'),
    {
      pattern: 'npm-shrinkwrap.json',
      mode: 'upstream-managed',
      owner: 'design-system-governance',
    },
    'npm shrinkwrap is an upstream-owned absence tombstone so package-lock remains the sole lock authority',
  )

  for (const prefix of manifest.consumer.materialization.pathPrefixes) {
    const ownership = resolveOwnership(policy, `${prefix}__ownership_probe__`)
    assert.notEqual(ownership.pattern, '<default>', `materialized prefix has no explicit ownership:${prefix}`)
    assert.equal(ownership.mode, 'upstream-managed', `materialized provider prefix is not upstream-managed:${prefix}`)
  }
  assert.deepEqual(
    resolveOwnership(policy, 'scripts/lib/consumer-control-plane-policy.mjs'),
    {
      pattern: 'scripts/lib/consumer-control-plane-policy.mjs',
      mode: 'upstream-managed',
      owner: 'design-system-governance',
    },
    'the reviewed-update path policy must itself be an explicitly upstream-managed delivery',
  )
})

test('recurring control-plane schemas close repository paths and the complete inventory after-image', () => {
  const planSchema = JSON.parse(readFileSync(new URL('../schemas/consumer-control-plane-update-plan.schema.json', import.meta.url), 'utf8'))
  const validateRepoPath = new Ajv2020({ strict: true }).compile(planSchema.$defs.repoPath)
  for (const poison of ['../escape', '/absolute', 'a//b', './relative', 'a/../b', 'a/./b']) {
    assert.equal(validateRepoPath(poison), false, `unsafe repository path must be rejected:${poison}`)
  }
  for (const safe of ['package.json', '.github/workflows/a.yml', 'scripts/lib/a.mjs']) {
    assert.equal(validateRepoPath(safe), true, `canonical repository path must remain valid:${safe}`)
  }
  const acceptanceSchema = JSON.parse(readFileSync(new URL('../schemas/consumer-control-plane-update-acceptance-proposal.schema.json', import.meta.url), 'utf8'))
  assert.deepEqual(
    acceptanceSchema.properties.proposedInventory,
    { $ref: 'https://qijenchen.dev/schemas/managed-repos.schema.json' },
  )
})

function bootstrapRelease(
  version = '1.2.3',
  sourceCommit = '1'.repeat(40),
  sourceTree = '2'.repeat(40),
  {
    consumerLockSha256 = 'e'.repeat(64),
    forkCorpusLockSha256 = 'f'.repeat(64),
    scaffoldLockBytes = null,
    scaffoldLock = null,
  } = {},
) {
  const packages = RELEASE_PACKAGE_NAMES.map((name, index) => ({
    name,
    version,
    file: `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`,
    size: 100 + index,
    entryCount: 2 + index,
    shasum: String(index + 1).repeat(40),
    sha256: String(index + 4).repeat(64),
    integrity: `sha512-${Buffer.alloc(64, index + 1).toString('base64')}`,
    packageJsonSha256: String(index + 7).repeat(64),
    sourceManifest: `packages/${name.split('/')[1]}/package.json`,
    sourceManifestSha256: String(index + 1).repeat(64),
  }))
  const releaseBom = {
    schemaVersion: 5,
    releaseVersion: version,
    npmDistTag: 'latest',
    publishOrder: [...RELEASE_PUBLISH_ORDER],
    source: {
      repository: 'ajenchen/design-system',
      repositoryUrl: 'git+https://github.com/ajenchen/design-system.git',
      gitCommit: sourceCommit,
      gitTree: sourceTree,
      tag: `v${version}`,
    },
    supplyChain: structuredClone(RELEASE_SUPPLY_CHAIN),
    packages,
    governance: {
      controlPlane: {
        path: 'governance/control-plane.lock.json',
        sha256: 'a'.repeat(64),
        role: 'ds-author',
        inputDigest: `sha256:${'b'.repeat(64)}`,
        contractDigest: `sha256:${'c'.repeat(64)}`,
        snapshotDigest: `sha256:${'d'.repeat(64)}`,
        generatorVersion: version,
      },
      consumer: {
        path: 'template/ds-product-template/governance/lock.json',
        sha256: consumerLockSha256,
        role: 'template-consumer',
        release: { designSystem: version, storybookConfig: version },
      },
      forkCorpus: {
        path: 'packages/design-system/ds-canonical/fork/governance.lock',
        sha256: forkCorpusLockSha256,
      },
      productTemplateScaffold: {
        path: 'product-template-scaffold.lock.json',
        size: scaffoldLockBytes?.length ?? 200,
        sha256: scaffoldLockBytes ? sha256(scaffoldLockBytes) : '1'.repeat(64),
        schemaVersion: 1,
        releaseVersion: version,
        staticTreeSha256: scaffoldLock?.staticTreeSha256 ?? '2'.repeat(64),
        publishedPathCount: scaffoldLock?.publishedPathCount ?? 3,
      },
    },
  }
  const releaseBomBytes = Buffer.from(JSON.stringify(releaseBom))
  const candidateRelease = {
    id: `ajenchen/design-system@v${version}`,
    version,
    sourceCommit: releaseBom.source.gitCommit,
    sourceTree: releaseBom.source.gitTree,
    bomSha256: sha256(releaseBomBytes),
    packages: packages.map(item => ({ name: item.name, version: item.version, integrity: item.integrity })),
    observedAt: '2026-07-20T00:00:00.000Z',
  }
  return { candidateRelease, releaseBom, releaseBomBytes }
}

function bootstrapFixture(t) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'consumer-bootstrap-'))
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }))
  const roots = {
    current: resolve(temporaryRoot, 'current'),
    base: resolve(temporaryRoot, 'base'),
    incoming: resolve(temporaryRoot, 'incoming'),
  }
  const marker = resolve(temporaryRoot, 'candidate-code-executed')
  writeBootstrapTree(roots.current, {
    '.claude/skills/a.txt': { content: 'locally modified managed file\n', mode: 0o644 },
    '.claude/settings.json': { content: '{"consumer":"local"}\n', mode: 0o640 },
    'apps/local.txt': { content: 'consumer product data\n', mode: 0o600 },
    'package.json': { content: '{"name":"consumer"}\n', mode: 0o644 },
  })
  writeBootstrapTree(roots.base, {
    '.claude/skills/a.txt': { content: 'old managed file\n', mode: 0o644 },
    '.claude/settings.json': { content: '{"consumer":"base"}\n', mode: 0o644 },
    'package.json': { content: '{"name":"consumer"}\n', mode: 0o644 },
  })
  writeBootstrapTree(roots.incoming, {
    '.claude/skills/a.txt': { content: 'reviewed managed file\n', mode: 0o755 },
    '.claude/skills/poison.mjs': {
      content: `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)}, 'executed')\n`,
      mode: 0o644,
    },
    '.claude/settings.json': { content: '{"consumer":"base"}\n', mode: 0o644 },
    'package.json': { content: '{"name":"consumer"}\n', mode: 0o644 },
  })
  const inventoryBytes = readFileSync(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
  const release = bootstrapRelease()
  const context = {
    inventoryBytes,
    repoId: 'work-management',
    roots,
    candidateRelease: release.candidateRelease,
    releaseBomBytes: release.releaseBomBytes,
    requiredChecksDigest: '3'.repeat(64),
  }
  const plan = createConsumerBootstrapMaterializationPlan(context)
  return {
    ...release,
    ...context,
    marker,
    outputRoot: resolve(temporaryRoot, 'materialized'),
    plan,
    expectedPlanDigest: plan.planDigest,
  }
}

function bootstrapReadback(fixture, materializedTreeSha256) {
  const loaded = loadConsumerUpgradeProtocol()
  const sourceDigests = protocolSourceDigests(loaded)
  return {
    schemaVersion: 1,
    kind: 'consumer-governance-bootstrap-readback',
    repositoryId: fixture.repoId,
    repository: 'ajenchen/work-management',
    protocolId: loaded.protocol.protocolId,
    protocolSpecificationSha256: sourceDigests.specificationSha256,
    protocolSchemaSha256: sourceDigests.schemaSha256,
    protocolImplementationSha256: sourceDigests.implementationSha256,
    bootstrapMode: 'one-time-reviewed-full-snapshot-pr',
    baseDefaultBranchHeadSha: '4'.repeat(40),
    pullRequestNumber: 42,
    pullRequestHeadSha: '5'.repeat(40),
    mergeCommitSha: '6'.repeat(40),
    mergeTreeSha: '7'.repeat(40),
    defaultBranchHeadSha: '6'.repeat(40),
    candidateSourceCommit: fixture.candidateRelease.sourceCommit,
    candidateSourceTree: fixture.candidateRelease.sourceTree,
    version: fixture.candidateRelease.version,
    consumerLockSha256: fixture.releaseBom.governance.consumer.sha256,
    forkCorpusLockSha256: fixture.releaseBom.governance.forkCorpus.sha256,
    templateStaticTreeSha256: fixture.releaseBom.governance.productTemplateScaffold.staticTreeSha256,
    fullSnapshotPlanDigest: fixture.plan.planDigest,
    materializedGovernanceTreeSha256: materializedTreeSha256,
    requiredChecksDigest: fixture.requiredChecksDigest,
    reviewAuthorization: {
      actorId: 'reviewer-1',
      authorizationDigest: '8'.repeat(64),
      authorizedAt: '2026-07-20T01:00:00.000Z',
      kind: 'independent-engineering-attestation',
    },
    legacySelfUpdateUsed: false,
    candidateCodeExecuted: false,
    eligible: true,
    mergedAt: '2026-07-20T02:00:00.000Z',
    observedAt: '2026-07-20T03:00:00.000Z',
  }
}

function controlPlaneFixture(t, {
  inventoryValue = null,
  version = '1.2.3',
  sourceCommit = 'a'.repeat(40),
  sourceTree = 'b'.repeat(40),
  baseSourceRoot = null,
  trust = null,
  ordinaryOnly = false,
} = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'consumer-control-plane-update-'))
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }))
  const roots = {
    current: resolve(temporaryRoot, 'current'),
    base: resolve(temporaryRoot, 'base'),
    incoming: resolve(temporaryRoot, 'incoming'),
  }
  const marker = resolve(temporaryRoot, 'candidate-code-executed')
  const oldPackage = JSON.stringify({
    name: 'consumer',
    scripts: { 'product:only': 'node product.mjs', 'sync-all': 'node scripts/old-sync.mjs' },
  })
  const incomingPackage = JSON.stringify({
    name: 'consumer',
    scripts: { 'product:only': 'node product.mjs', 'sync-all': 'node scripts/sync-all.mjs' },
  })
  const oldWorkflow = 'name: old protected workflow\n'
  writeBootstrapTree(roots.current, {
    '.github/workflows/audit.yml': { content: oldWorkflow },
    'scripts/sync-all.mjs': { content: 'export const version = "old"\n', mode: 0o755 },
    'package.json': { content: oldPackage },
    'apps/local.txt': { content: 'consumer product data\n', mode: 0o644 },
  })
  if (baseSourceRoot) cpSync(baseSourceRoot, roots.base, { recursive: true })
  else {
    writeBootstrapTree(roots.base, {
      '.github/workflows/audit.yml': { content: oldWorkflow },
      'scripts/sync-all.mjs': { content: 'export const version = "old"\n', mode: 0o755 },
      'package.json': { content: oldPackage },
    })
  }
  const forkCorpusLockSha256 = 'f'.repeat(64)
  const consumerLockBytes = Buffer.from(`${stableStringify({
    schemaVersion: 1,
    payload: { forkCorpusLockSha256 },
  }, 2)}\n`)
  writeBootstrapTree(roots.incoming, {
    '.github/workflows/audit.yml': { content: ordinaryOnly ? oldWorkflow : 'name: reviewed protected workflow\n' },
    'scripts/sync-all.mjs': {
      content: ordinaryOnly
        ? 'export const version = "old"\n'
        : `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)}, 'executed')\n`,
      mode: 0o755,
    },
    'package.json': { content: ordinaryOnly ? oldPackage : incomingPackage },
    'governance/lock.json': { content: consumerLockBytes },
  })
  commitSnapshot(roots.current)
  commitSnapshot(roots.base)
  const scaffoldLock = buildProductTemplateScaffoldLock({ root: roots.incoming, releaseVersion: version })
  const scaffoldLockBytes = Buffer.from(`${JSON.stringify(scaffoldLock, null, 2)}\n`)
  const managed = inventoryValue ?? (() => {
    const value = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
    const repository = structuredClone(value.repositories.find(item => item.id === 'work-management'))
    repository.id = 'new-product'
    repository.github = 'ajenchen/new-product'
    repository.localPathFromGovernanceRoot = '../../../new-product'
    repository.upgradeProtocolProfile = 'new-snapshot-v2'
    delete repository.acceptedBootstrapReadbackSha256
    delete repository.acceptedControlPlaneUpdate
    value.repositories.push(repository)
    return value
  })()
  const inventoryBytes = Buffer.from(`${stableStringify(managed, 2)}\n`)
  const release = bootstrapRelease(version, sourceCommit, sourceTree, {
    consumerLockSha256: sha256(consumerLockBytes),
    forkCorpusLockSha256,
    scaffoldLock,
    scaffoldLockBytes,
  })
  const activeTrust = trust ?? controlPlaneTrustFixture()
  const now = new Date('2026-07-20T04:00:00.000Z')
  const repository = managed.repositories.find(item => (
    item.role === 'product-consumer' && item.upgradeProtocolProfile !== 'legacy-bootstrap-v2'
  ))
  assert.ok(repository, 'control-plane fixture requires one enrolled product on a recurring update profile')
  let baselineReceipt
  if (repository.acceptedControlPlaneUpdate === undefined) {
    const base = inspectConsumerControlPlaneGitSnapshot(roots.base, 'test baseline Git snapshot')
    baselineReceipt = signControlPlaneReceipt({
      $schema: 'https://qijenchen.dev/schemas/consumer-control-plane-baseline-receipt-v1.schema.json',
      schemaVersion: 1,
      kind: 'consumer-control-plane-baseline-observer-receipt',
      repositoryId: repository.id,
      repository: repository.github,
      baseGitCommit: base.git.commit,
      baseGitTree: base.git.tree,
      baseSnapshotTreeSha256: base.manifest.treeSha256,
      baselineCandidateReleaseSha256: '1'.repeat(64),
      baselineReleaseBomSha256: '2'.repeat(64),
      baselineConsumerLockSha256: '3'.repeat(64),
      baselineForkCorpusLockSha256: '4'.repeat(64),
      baselineTemplateStaticTreeSha256: '5'.repeat(64),
      observedAt: '2026-07-20T01:00:00.000Z',
      issuerRegistryDigest: activeTrust.attestationPolicy.issuerRegistryDigest,
      quorum: 1,
      nonce: 'baseline-observation-0001',
      issuedAt: '2026-07-20T01:01:00.000Z',
      expiresAt: '2026-07-20T12:00:00.000Z',
      signatures: [],
    }, activeTrust)
  }
  const context = {
    inventoryBytes,
    repoId: repository.id,
    roots,
    candidateRelease: release.candidateRelease,
    releaseBomBytes: release.releaseBomBytes,
    scaffoldLockBytes,
    baselineReceipt,
    issuerRegistry: activeTrust.issuerRegistry,
    attestationPolicy: activeTrust.attestationPolicy,
    now,
  }
  const plan = createConsumerControlPlaneUpdatePlan(context)
  return {
    ...release,
    ...context,
    inventory: managed,
    trust: activeTrust,
    scaffoldLock,
    scaffoldLockBytes,
    marker,
    outputRoot: resolve(temporaryRoot, 'materialized'),
    plan,
    expectedPlanDigest: plan.planDigest,
  }
}

function controlPlaneReadback(fixture, materializedTreeSha256) {
  const plan = fixture.plan
  const snapshotVerification = verifyMaterializedConsumerControlPlaneUpdateSnapshot({
    plan,
    materializedRoot: fixture.outputRoot,
  })
  return signControlPlaneReceipt({
    $schema: 'https://qijenchen.dev/schemas/consumer-control-plane-update-readback-v1.schema.json',
    schemaVersion: 1,
    kind: 'consumer-governance-control-plane-update-readback',
    repositoryId: fixture.repoId,
    repository: fixture.inventory.repositories.find(item => item.id === fixture.repoId).github,
    protocolId: plan.protocol.protocolId,
    protocolSpecificationSha256: plan.protocol.specificationSha256,
    protocolSchemaSha256: plan.protocol.schemaSha256,
    protocolImplementationSha256: plan.protocol.implementationSha256,
    controlPlaneImplementationSha256: plan.protocol.controlPlaneImplementationSha256,
    controlPlanePolicySha256: plan.protocol.controlPlanePolicySha256,
    controlPlanePlanSchemaSha256: plan.protocol.controlPlanePlanSchemaSha256,
    controlPlaneSnapshotVerificationSchemaSha256: plan.protocol.controlPlaneSnapshotVerificationSchemaSha256,
    controlPlaneReadbackSchemaSha256: plan.protocol.controlPlaneReadbackSchemaSha256,
    controlPlaneReadbackVerificationSchemaSha256: plan.protocol.controlPlaneReadbackVerificationSchemaSha256,
    controlPlaneAcceptanceProposalSchemaSha256: plan.protocol.controlPlaneAcceptanceProposalSchemaSha256,
    controlPlaneBaselineReceiptSchemaSha256: plan.protocol.controlPlaneBaselineReceiptSchemaSha256,
    managedReposSchemaSha256: plan.protocol.managedReposSchemaSha256,
    engineClosureSha256: plan.protocol.engineClosureSha256,
    updateMode: 'recurring-reviewed-full-snapshot-pr',
    sourceProfile: plan.repository.sourceProfile,
    postUpdateProfile: plan.repository.postUpdateProfile,
    sequence: plan.repository.nextSequence,
    predecessorReadbackSha256: plan.repository.predecessorReadbackSha256,
    baseDefaultBranchHeadSha: plan.sourceBindings.currentGit.commit,
    pullRequestNumber: 43,
    pullRequestHeadSha: '5'.repeat(40),
    mergeCommitSha: '6'.repeat(40),
    mergeTreeSha: snapshotVerification.materializedGitTreeSha,
    defaultBranchHeadSha: '6'.repeat(40),
    candidateSourceCommit: fixture.candidateRelease.sourceCommit,
    candidateSourceTree: fixture.candidateRelease.sourceTree,
    version: fixture.candidateRelease.version,
    candidateReleaseSha256: plan.candidate.candidateReleaseSha256,
    releaseBomSha256: plan.candidate.releaseBomSha256,
    consumerLockSha256: fixture.releaseBom.governance.consumer.sha256,
    forkCorpusLockSha256: fixture.releaseBom.governance.forkCorpus.sha256,
    templateStaticTreeSha256: fixture.releaseBom.governance.productTemplateScaffold.staticTreeSha256,
    candidateCorpusReceiptSha256: plan.candidate.candidateCorpusReceiptSha256,
    fullSnapshotPlanDigest: plan.planDigest,
    currentSnapshotTreeSha256: plan.roots.current.treeSha256,
    baseSnapshotTreeSha256: plan.roots.base.treeSha256,
    incomingSnapshotTreeSha256: plan.roots.incoming.treeSha256,
    materializedGovernanceTreeSha256: materializedTreeSha256,
    snapshotVerificationDigest: snapshotVerification.verificationDigest,
    requiredChecks: [{
      context: 'governance / required',
      status: 'completed',
      conclusion: 'success',
      headSha: '5'.repeat(40),
      workflowIdentityDigest: '8'.repeat(64),
      runId: '1001',
      runAttempt: 1,
      completedAt: '2026-07-20T01:30:00.000Z',
    }],
    requiredChecksComplete: true,
    requiredApprovingReviewCount: 0,
    reviews: [],
    reviewsComplete: true,
    dismissStaleReviewsRequired: true,
    ordinaryUpdaterUsed: false,
    candidateCodeExecuted: false,
    eligible: true,
    mergedAt: '2026-07-20T02:00:00.000Z',
    observedAt: '2026-07-20T03:00:00.000Z',
    issuerRegistryDigest: fixture.attestationPolicy.issuerRegistryDigest,
    quorum: 1,
    nonce: `github-observation-${plan.repository.nextSequence.toString().padStart(4, '0')}`,
    issuedAt: '2026-07-20T03:01:00.000Z',
    expiresAt: '2026-07-20T12:00:00.000Z',
    signatures: [],
  }, fixture.trust)
}

test('fleet convenience aliases preserve the reviewed plan, check and digest-bound apply boundaries', () => {
  assert.deepEqual({
    plan: rootPackage.scripts['governance:fleet:plan'],
    prepareReview: rootPackage.scripts['governance:fleet:prepare-review'],
    assembleReview: rootPackage.scripts['governance:fleet:assemble-review'],
    check: rootPackage.scripts['governance:fleet:check'],
    applyReviewed: rootPackage.scripts['governance:fleet:apply-reviewed'],
  }, {
    plan: 'node infra/governance/bin/consumerctl.mjs plan-fanout',
    prepareReview: 'node infra/governance/bin/consumerctl.mjs prepare-fanout-review',
    assembleReview: 'node infra/governance/bin/consumerctl.mjs assemble-fanout-review',
    check: 'node infra/governance/bin/consumerctl.mjs check-fanout',
    applyReviewed: 'node infra/governance/bin/consumerctl.mjs apply-fanout',
  })
  assert.equal(rootPackage.scripts['governance:consumer:plan-registration'], 'node infra/governance/bin/consumerctl.mjs plan-registration')
  assert.equal(rootPackage.scripts['governance:consumer:check-registration'], 'node infra/governance/bin/consumerctl.mjs check-registration')
  assert.equal(Object.hasOwn(rootPackage.scripts, 'governance:fleet:apply'), false, 'there must be no blind fleet apply alias')
})

test('bootstrap convenience aliases expose only reviewed materialization and read-only verification/promotion boundaries', async () => {
  assert.deepEqual({
    plan: rootPackage.scripts['governance:bootstrap:plan'],
    materializeReviewed: rootPackage.scripts['governance:bootstrap:materialize-reviewed'],
    checkMaterialization: rootPackage.scripts['governance:bootstrap:check-materialization'],
    checkReadback: rootPackage.scripts['governance:bootstrap:check-readback'],
    planPromotion: rootPackage.scripts['governance:bootstrap:plan-promotion'],
    checkPromotion: rootPackage.scripts['governance:bootstrap:check-promotion'],
  }, {
    plan: 'node infra/governance/bin/consumerctl.mjs plan-bootstrap',
    materializeReviewed: 'node infra/governance/bin/consumerctl.mjs materialize-bootstrap',
    checkMaterialization: 'node infra/governance/bin/consumerctl.mjs check-bootstrap-materialization',
    checkReadback: 'node infra/governance/bin/consumerctl.mjs check-bootstrap-readback',
    planPromotion: 'node infra/governance/bin/consumerctl.mjs plan-bootstrap-promotion',
    checkPromotion: 'node infra/governance/bin/consumerctl.mjs check-bootstrap-promotion',
  })
  assert.equal(Object.hasOwn(rootPackage.scripts, 'governance:bootstrap:apply'), false, 'there must be no blind bootstrap apply alias')
  assert.equal(Object.hasOwn(rootPackage.scripts, 'governance:bootstrap:promotion:apply'), false, 'there must be no bootstrap promotion apply alias')
  await assert.rejects(
    () => consumerctlMain(['plan-bootstrap', '--to', 'latest']),
    /does not accept --to/,
  )
  await assert.rejects(
    () => consumerctlMain(['check-bootstrap-materialization', '--plan-file', 'one.json', '--plan-file', 'two.json']),
    /does not accept duplicate --plan-file/,
  )
})

test('recurring control-plane aliases expose only reviewed fresh-root materialization and acceptance proposals', async () => {
  assert.deepEqual({
    plan: rootPackage.scripts['governance:control-plane:plan'],
    materializeReviewed: rootPackage.scripts['governance:control-plane:materialize-reviewed'],
    checkMaterialization: rootPackage.scripts['governance:control-plane:check-materialization'],
    checkReadback: rootPackage.scripts['governance:control-plane:check-readback'],
    planAcceptance: rootPackage.scripts['governance:control-plane:plan-acceptance'],
    checkAcceptance: rootPackage.scripts['governance:control-plane:check-acceptance'],
  }, {
    plan: 'node infra/governance/bin/consumerctl.mjs plan-control-plane-update',
    materializeReviewed: 'node infra/governance/bin/consumerctl.mjs materialize-control-plane-update',
    checkMaterialization: 'node infra/governance/bin/consumerctl.mjs check-control-plane-materialization',
    checkReadback: 'node infra/governance/bin/consumerctl.mjs check-control-plane-readback',
    planAcceptance: 'node infra/governance/bin/consumerctl.mjs plan-control-plane-acceptance',
    checkAcceptance: 'node infra/governance/bin/consumerctl.mjs check-control-plane-acceptance',
  })
  assert.equal(Object.hasOwn(rootPackage.scripts, 'governance:control-plane:apply'), false)
  assert.equal(Object.hasOwn(rootPackage.scripts, 'governance:control-plane:acceptance:apply'), false)
  await assert.rejects(
    () => consumerctlMain(['plan-control-plane-update', '--to', 'latest']),
    /does not accept --to/,
  )
  await assert.rejects(
    () => consumerctlMain(['check-control-plane-materialization', '--plan-file', 'one.json', '--plan-file', 'two.json']),
    /does not accept duplicate --plan-file/,
  )
  await assert.rejects(
    () => consumerctlMain(['plan-control-plane-update', '--required-checks-digest', '3'.repeat(64)]),
    /does not accept --required-checks-digest/,
  )
})

test('consumerctl artifact reads reject symlink and hardlink substitution', async t => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'consumerctl-artifact-poison-'))
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }))
  const source = resolve(temporaryRoot, 'inventory-source.json')
  const symlink = resolve(temporaryRoot, 'inventory-symlink.json')
  const hardlink = resolve(temporaryRoot, 'inventory-hardlink.json')
  writeFileSync(source, readFileSync(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json')))
  symlinkSync(source, symlink)
  linkSync(source, hardlink)
  await assert.rejects(
    () => consumerctlMain(['inventory', '--inventory', symlink]),
    /regular non-symlink file|symbolic/i,
  )
  await assert.rejects(
    () => consumerctlMain(['inventory', '--inventory', hardlink]),
    /must not be hard-linked|regular non-linked/i,
  )
})

function fleetFixture({
  reviewSubject = 'fleet-independent-reviewer-subject',
  reviewSubjects = null,
  reviewQuorum = null,
} = {}) {
  const now = new Date('2026-07-20T01:30:00.000Z')
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const subjects = reviewSubjects ?? [reviewSubject]
  const reviewSigners = subjects.map((subject, index) => {
    const { publicKey: reviewPublicKey, privateKey: reviewPrivateKey } = generateKeyPairSync('ed25519')
    return {
      keyId: index === 0 ? 'fleet-independent-reviewer' : `fleet-independent-reviewer-${index + 1}`,
      subject,
      publicKey: reviewPublicKey,
      privateKey: reviewPrivateKey,
    }
  })
  const issuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [
      {
        keyId: 'fleet-authorizer',
        subject: 'fleet-authorizer-subject',
        publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
        roles: ['apply-authorizer'],
        status: 'active',
        notBefore: '2026-07-01T00:00:00.000Z',
        notAfter: '2027-07-01T00:00:00.000Z',
        revokedAt: null,
      },
      ...reviewSigners.map(signer => ({
        keyId: signer.keyId,
        subject: signer.subject,
        publicKeySpki: signer.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
        roles: ['completion-attestor'],
        status: 'active',
        notBefore: '2026-07-01T00:00:00.000Z',
        notAfter: '2027-07-01T00:00:00.000Z',
        revokedAt: null,
      })),
    ],
  }
  const attestationPolicy = {
    schemaVersion: 1,
    algorithm: 'ed25519',
    maxAuthorizationTtlMinutes: 60,
    maxCompletionTtlMinutes: 10080,
    clockSkewSeconds: 120,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    allowedKeyIds: ['fleet-authorizer', ...reviewSigners.map(signer => signer.keyId)],
    applyAuthorizationQuorum: 1,
    completionAttestationQuorum: reviewQuorum ?? reviewSigners.length,
  }
  const candidateRelease = {
    id: 'ajenchen/design-system@v1.2.3',
    version: '1.2.3',
    sourceCommit: '1'.repeat(40),
    sourceTree: '2'.repeat(40),
    bomSha256: '3'.repeat(64),
    packages: [
      { name: '@qijenchen/design-system', version: '1.2.3', integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}` },
      { name: '@qijenchen/governance', version: '1.2.3', integrity: `sha512-${Buffer.alloc(64, 2).toString('base64')}` },
      { name: '@qijenchen/storybook-config', version: '1.2.3', integrity: `sha512-${Buffer.alloc(64, 3).toString('base64')}` },
    ],
    observedAt: '2026-07-20T00:00:00.000Z',
  }
  const managed = structuredClone(inventory)
  managed.authority = 'ajenchen/design-system@infra/governance'
  managed.repositories[0].github = 'ajenchen/consumer'
  const assignment = {
    ring: 'ring-canary',
    wave: 'canary',
    enteredAt: '2026-07-20T00:00:00.000Z',
    candidateReleaseDigest: sha256(stableStringify(candidateRelease, 0)),
    applyAuthorization: null,
    completionAttestation: null,
    manualBlockers: [],
  }
  // The rollout-state-machine wrapper is retired; the fixture signs the same
  // attestation payload directly through the canonical attestation library.
  assignment.applyAuthorization = issueSignedAttestation({
    kind: 'apply-authorization',
    repoId: 'consumer',
    github: 'ajenchen/consumer',
    ring: assignment.ring,
    wave: assignment.wave,
    candidateRelease,
    verifiedReleaseEvidenceDigest: '6'.repeat(64),
    candidatePlanDigest: '4'.repeat(64),
    predicateDigest: '5'.repeat(64),
    stateDigest: '7'.repeat(64),
    defaultBranchHeadSha: '8'.repeat(40),
    actionsDigest: sha256(stableStringify([], 0)),
    issuerRegistryDigest: attestationPolicy.issuerRegistryDigest,
    signerKeyId: 'fleet-authorizer',
    subject: 'fleet-authorizer-subject',
    privateKey,
    issuedAt: '2026-07-20T01:00:00.000Z',
    expiresAt: '2026-07-20T02:00:00.000Z',
  })
  const rings = {
    schemaVersion: 3,
    attestationPolicy,
    candidateRelease,
    evidence: [],
    rings: [{
      id: 'ring-canary',
      order: 2,
      purpose: 'Fixture product wave.',
      maxParallel: 1,
      waves: [{ id: 'canary', order: 0, maxParallel: 1 }],
      promotionPredicates: [
        { id: 'upstream', type: 'upstream-waves-promoted' },
        { id: 'manual', type: 'manual-blockers-clear' },
        { id: 'checks', type: 'required-checks-green' },
        { id: 'surfaces', type: 'provider-surfaces-certified', surfaces: managed.repositories[0].providerSurfacesRequired },
        { id: 'waiver', type: 'no-active-waiver-at-or-above', risk: 'high' },
        { id: 'plan', type: 'plan-conflict-free' },
      ],
    }],
    assignments: { consumer: assignment },
  }
  return {
    inventory: managed,
    rings,
    issuerRegistry,
    now,
    reviewSigner: reviewSigners[0],
    reviewSigners,
  }
}

function fleetRuntimeContext(managed, overrides = {}) {
  const gitCharacters = '456789abcdef0123456789abcdef'
  return {
    repoRoot: resolve(GOVERNANCE_ROOT, '../..'),
    runtimeIdentity: {
      gitCommit: 'a'.repeat(40),
      gitTree: 'b'.repeat(40),
      profileDigest: `sha256:${'c'.repeat(64)}`,
      harnessDigest: `sha256:${'d'.repeat(64)}`,
      ...(overrides.runtimeIdentity ?? {}),
    },
    externalRepositoryIdentities: Object.fromEntries(managed.repositories.map((repository, index) => [
      repository.id,
      {
        gitCommit: gitCharacters[index * 2].repeat(40),
        gitTree: gitCharacters[(index * 2) + 1].repeat(40),
        subjectProofs: {},
        ...(overrides.externalRepositoryIdentities?.[repository.id] ?? {}),
      },
    ])),
  }
}

function fleetRuntimeSnapshot(managed, overrides = {}) {
  return createConsumerRuntimeIdentitySnapshot(fleetRuntimeContext(managed, overrides), managed)
}

function fleetGovernanceModels(fixture) {
  return {
    inventory: structuredClone(fixture.inventory),
    desired: { fixture: 'desired' },
    rings: structuredClone(fixture.rings),
    certifications: { fixture: 'certifications' },
    waivers: { fixture: 'waivers' },
    matrix: { fixture: 'matrix' },
    runtimeProfile: { fixture: 'runtime-profile' },
    issuerRegistry: structuredClone(fixture.issuerRegistry),
  }
}

function fleetGovernanceReload(fixture) {
  return () => fleetGovernanceModels(fixture)
}

function externalCertifiedConsumerFixture(t) {
  const githubFixtures = resolve(GOVERNANCE_ROOT, 'test/fixtures/github')
  const managed = readJson(resolve(githubFixtures, 'inventory.json'))
  const desired = readJson(resolve(githubFixtures, 'desired.json'))
  // The external-ledger writer environment is retired with its ceremony.
  desired.managedEnvironmentNames = ['npm-release', 'governance-upgrade']
  const rings = readJson(resolve(githubFixtures, 'rings-eligible.json'))
  const certificationSource = readJson(resolve(githubFixtures, 'certifications.json'))
  const canonicalManaged = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
  const canonicalDesired = readJson(resolve(GOVERNANCE_ROOT, 'desired/github.json'))
  const canonicalRings = readJson(resolve(GOVERNANCE_ROOT, 'release-rings.json'))
  const authorityRepository = structuredClone(
    canonicalManaged.repositories.find(repository => repository.id === 'design-system'),
  )
  const templateRepository = structuredClone(
    canonicalManaged.repositories.find(repository => repository.id === 'ds-product-template'),
  )
  const productRepository = managed.repositories[0]
  productRepository.github = 'ajenchen/consumer'
  productRepository.localPathFromGovernanceRoot = '../../../consumer'
  managed.authority = canonicalManaged.authority
  managed.workflowIdentitySources = structuredClone(canonicalManaged.workflowIdentitySources)
  managed.repositories = [authorityRepository, templateRepository, productRepository]
  managed.certificationCanaries = {
    authority: { repositoryId: authorityRepository.id },
    'template-mirror': { repositoryId: templateRepository.id },
    'product-consumer': { repositoryId: productRepository.id },
  }
  managed.ownershipPolicies = {
    'authority-repository': structuredClone(canonicalManaged.ownershipPolicies['authority-repository']),
    'published-template-mirror': structuredClone(canonicalManaged.ownershipPolicies['published-template-mirror']),
    'product-consumer': structuredClone(canonicalManaged.ownershipPolicies['product-consumer']),
  }
  desired.profiles = {
    'design-system-authority': structuredClone(canonicalDesired.profiles['design-system-authority']),
    'product-consumer': desired.profiles['product-consumer'],
    'published-template': structuredClone(canonicalDesired.profiles['published-template']),
  }
  const fixtureProductRing = rings.rings[0]
  const fixtureCandidateDigest = rings.assignments.consumer.candidateReleaseDigest
  rings.rings = [
    structuredClone(canonicalRings.rings.find(ring => ring.order === 0)),
    structuredClone(canonicalRings.rings.find(ring => ring.order === 1)),
    fixtureProductRing,
  ]
  rings.assignments = {
    'design-system': {
      ring: authorityRepository.releaseRing,
      wave: 'canary',
      enteredAt: '2020-01-01T00:00:00Z',
      candidateReleaseDigest: fixtureCandidateDigest,
      applyAuthorization: null,
      completionAttestation: null,
      manualBlockers: [],
    },
    'ds-product-template': {
      ring: templateRepository.releaseRing,
      wave: 'canary',
      enteredAt: '2020-01-01T00:00:00Z',
      candidateReleaseDigest: fixtureCandidateDigest,
      applyAuthorization: null,
      completionAttestation: null,
      manualBlockers: [],
    },
    consumer: rings.assignments.consumer,
  }
  const productCertifications = certificationSource.certifications
  const templateRequiredSurfaces = new Set(templateRepository.providerSurfacesRequired)
  const cloneCertificationRole = (record, role) => ({
    ...structuredClone(record),
    id: record.id.replace('-product-', `-${role.replace('-mirror', '')}-`),
    repositoryRole: role,
  })
  certificationSource.certifications = [
    ...productCertifications.map(record => cloneCertificationRole(record, 'authority')),
    ...productCertifications
      .filter(record => templateRequiredSurfaces.has(`${record.provider}/${record.runtimeKind}/${record.surface}`))
      .map(record => cloneCertificationRole(record, 'template-mirror')),
    ...productCertifications,
  ]
  const matrix = readJson(resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json'))
  const runtimeProfile = readJson(resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json'))
  const baseIssuerRegistry = readJson(resolve(githubFixtures, 'issuer-registry.json'))
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const runtimeIssuer = {
    keyId: 'consumerctl-runtime-evidence',
    subject: 'consumerctl-runtime-evidence',
    publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    roles: ['runtime-evidence-issuer', 'completion-attestor'],
    status: 'active',
    notBefore: '2020-01-01T00:00:00.000Z',
    notAfter: '2030-01-01T00:00:00.000Z',
    revokedAt: null,
  }
  const issuerRegistry = structuredClone(baseIssuerRegistry)
  issuerRegistry.issuers.push(runtimeIssuer)
  const certifiedRuntimeProfile = structuredClone(runtimeProfile)
  certifiedRuntimeProfile.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  certifiedRuntimeProfile.allowedKeyIds = [runtimeIssuer.keyId]
  certifiedRuntimeProfile.requiredIssuerQuorum = 1
  const certifiedRings = structuredClone(rings)
  certifiedRings.attestationPolicy.issuerRegistryDigest = certifiedRuntimeProfile.issuerRegistryDigest
  certifiedRings.attestationPolicy.allowedKeyIds = [...certifiedRings.attestationPolicy.allowedKeyIds, runtimeIssuer.keyId]
  const now = new Date('2026-07-20T00:00:00.000Z')
  const external = createExternalRuntimeCertificationFixture({
    inventory: managed,
    desired,
    certifications: certificationSource,
    matrix,
    runtimeProfile: certifiedRuntimeProfile,
    signer: { keyId: runtimeIssuer.keyId, privateKey },
    now,
  })
  t.after(() => external.dispose())
  const certificationsBefore = structuredClone(certificationSource)
  for (const certification of certificationsBefore.certifications) {
    if (certification.status !== 'certified') continue
    certification.status = 'not-certified'
    delete certification.certifiedAt
    delete certification.expiresAt
    certification.limitations = ['Runtime identity has not been certified.']
    for (const target of certification.platformMatrix) {
      target.status = 'not-certified'
      delete target.certifiedAt
      delete target.expiresAt
      delete target.runtimeEvidence
      target.limitations = ['Runtime identity has not been certified.']
    }
    delete certification.runtimeEvidence
  }
  const runtimeValidationContext = structuredClone(external.runtimeValidationContext)
  Object.assign(runtimeValidationContext.runtimeIdentity, {
    gitCommit: 'a'.repeat(40),
    gitTree: 'b'.repeat(40),
  })
  return {
    inventory: managed,
    desired,
    rings: certifiedRings,
    certificationsBefore,
    certificationsAfter: external.certifications,
    waivers: { schemaVersion: 1, waivers: [] },
    matrix,
    runtimeProfile: certifiedRuntimeProfile,
    issuerRegistry,
    runtimeValidationContext,
    now,
    reviewSigner: {
      keyId: runtimeIssuer.keyId,
      subject: runtimeIssuer.subject,
      privateKey,
    },
  }
}

function signedFleetReview(fixture, plan, {
  decision = 'approved',
  issuedAt = '2026-07-20T01:20:00.000Z',
  expiresAt = '2026-07-20T01:50:00.000Z',
  now = fixture.now,
  signer = fixture.reviewSigner,
  signers = fixture.reviewSigners ?? [signer],
} = {}) {
  const request = createConsumerFanoutReviewSigningRequest({
    plan,
    inventory: fixture.inventory,
    rings: fixture.rings,
    issuerRegistry: fixture.issuerRegistry,
    decision,
    issuedAt,
    expiresAt,
    now,
  })
  const signatures = signers.map(item => ({
    signerKeyId: item.keyId,
    subject: item.subject,
    signature: sign(null, Buffer.from(request.signingPayloadBase64, 'base64'), item.privateKey).toString('base64url'),
  }))
  const receipt = createConsumerFanoutReviewReceipt(request, signatures)
  return { request, receipt, signatures }
}

function writeJsonFixture(directory, name, value) {
  const path = resolve(directory, name)
  writeFileSync(path, `${stableStringify(value, 2)}\n`)
  return path
}

test('plan-upgrade preserves consumer three-way edits and plans managed replacement without writing', () => {
  const root = resolve(FIXTURES, 'clean/current')
  const managedPath = resolve(root, '.claude/skills/a.txt')
  const before = readFileSync(managedPath, 'utf8')
  const plan = planUpgrade({
    inventory,
    repoId: 'consumer',
    root,
    base: resolve(FIXTURES, 'clean/base'),
    incoming: resolve(FIXTURES, 'clean/incoming'),
  })

  assert.equal(plan.ok, true)
  assert.equal(plan.summary.actions, 1)
  assert.equal(plan.actions[0].path, '.claude/skills/a.txt')
  assert.equal(plan.actions[0].ownershipMode, 'upstream-managed')
  assert.ok(plan.preserved.some(item => item.path === 'SHARED.md' && item.reason === 'consumer-only-change'))
  assert.ok(plan.preserved.some(item => item.path === 'AGENTS.md' && item.reason === 'already-at-incoming'))
  assert.equal(readFileSync(managedPath, 'utf8'), before)
  assert.match(plan.planDigest, /^[a-f0-9]{64}$/)
})

test('divergent three-way content fails closed', () => {
  const plan = planUpgrade({
    inventory,
    repoId: 'consumer',
    root: resolve(FIXTURES, 'conflict/current'),
    base: resolve(FIXTURES, 'conflict/base'),
    incoming: resolve(FIXTURES, 'conflict/incoming'),
  })

  assert.equal(plan.ok, false)
  assert.equal(plan.summary.actions, 0)
  assert.deepEqual(
    plan.conflicts.map(conflict => [conflict.path, conflict.ownershipMode, conflict.reason]),
    [['SHARED.md', 'three-way', 'three-way-content-conflict']],
  )
})

test('overlapping ownership rules fail inventory validation before upgrade planning', () => {
  const ambiguous = structuredClone(inventory)
  ambiguous.ownershipPolicies['product-consumer'].rules.unshift({ pattern: '.claude/**', mode: 'three-way', owner: 'other-owner' })
  assert.throws(() => planUpgrade({
    inventory: ambiguous,
    repoId: 'consumer',
    root: resolve(FIXTURES, 'clean/current'),
    base: resolve(FIXTURES, 'clean/base'),
    incoming: resolve(FIXTURES, 'clean/incoming'),
  }), /Ambiguous ownership/)
})

test('package compatibility enforces accepted spec shape and minimum prerelease', () => {
  const repo = inventory.repositories[0]
  const matrix = {
    upgradeCompatibility: {
      governanceProtocol: 'protected-base-reconstruction-v2',
      packages: {
        '@qijenchen/design-system': {
          minimumVersion: '0.1.0-beta.84',
          acceptedSpecPatterns: ['^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$'],
        },
      },
    },
  }
  const below = checkPackageCompatibility({ dependencies: { '@qijenchen/design-system': '0.1.0-beta.83' } }, repo, matrix)
  const current = checkPackageCompatibility({ dependencies: { '@qijenchen/design-system': '0.1.0-beta.84' } }, repo, matrix)
  const range = checkPackageCompatibility({ dependencies: { '@qijenchen/design-system': '^0.1.0-beta.84' } }, repo, matrix)
  const channel = checkPackageCompatibility({ dependencies: { '@qijenchen/design-system': 'beta' } }, repo, matrix)

  assert.ok(below.some(finding => finding.code === 'package-below-minimum' && finding.severity === 'error'))
  assert.ok(current.some(finding => finding.code === 'package-compatible' && finding.severity === 'info'))
  assert.ok(range.some(finding => finding.code === 'floating-package-channel' && finding.severity === 'error'))
  assert.ok(channel.some(finding => finding.code === 'floating-package-channel' && finding.severity === 'error'))
})

test('legacy consumers are blocked from ordinary sync planning and receive a read-only reviewed-bootstrap plan', () => {
  const legacy = structuredClone(inventory)
  legacy.repositories[0].upgradeProtocolProfile = 'legacy-bootstrap-v2'
  const input = {
    inventory: legacy,
    repoId: 'consumer',
    root: resolve(FIXTURES, 'clean/current'),
    base: resolve(FIXTURES, 'clean/base'),
    incoming: resolve(FIXTURES, 'clean/incoming'),
  }

  const ordinary = planUpgrade(input)
  assert.equal(ordinary.ok, false)
  assert.equal(ordinary.ordinarySyncEligible, false)
  assert.equal(ordinary.rolloutCompletionEligible, false)
  assert.deepEqual(ordinary.blockers.map(item => item.code), ['legacy-bootstrap-required'])

  const bootstrap = planBootstrap(input)
  assert.equal(bootstrap.kind, 'consumer-reviewed-full-snapshot-bootstrap-plan')
  assert.equal(bootstrap.readOnly, true)
  assert.equal(bootstrap.mutationAuthorized, false)
  assert.equal(bootstrap.rolloutCompletionEligible, false)
  assert.equal(bootstrap.ordinarySyncEligible, false)
  assert.equal(bootstrap.reviewReady, true)
  assert.equal(bootstrap.upgradeProtocol.requiredEvidenceContract, 'consumer-governance-bootstrap-readback-v1')
  assert.equal(bootstrap.upgradeProtocol.postAcceptanceProfile, 'reviewed-bootstrap-established-v2')
  assert.match(bootstrap.upgradeProtocol.specificationSha256, /^[a-f0-9]{64}$/)
  assert.match(bootstrap.upgradeProtocol.schemaSha256, /^[a-f0-9]{64}$/)
  assert.match(bootstrap.upgradeProtocol.implementationSha256, /^[a-f0-9]{64}$/)
})

test('new-snapshot consumers cannot misuse the one-time legacy bootstrap planner', () => {
  assert.throws(() => planBootstrap({
    inventory,
    repoId: 'consumer',
    root: resolve(FIXTURES, 'clean/current'),
    base: resolve(FIXTURES, 'clean/base'),
    incoming: resolve(FIXTURES, 'clean/incoming'),
  }), /not assigned to the legacy reviewed-bootstrap profile/)
})

test('accepted legacy bootstrap has a distinct digest-bound profile before later ordinary sync-all', () => {
  const established = structuredClone(inventory)
  established.repositories[0].upgradeProtocolProfile = 'reviewed-bootstrap-established-v2'
  established.repositories[0].acceptedBootstrapReadbackSha256 = 'a'.repeat(64)
  const input = {
    inventory: established,
    repoId: 'consumer',
    root: resolve(FIXTURES, 'clean/current'),
    base: resolve(FIXTURES, 'clean/base'),
    incoming: resolve(FIXTURES, 'clean/incoming'),
  }
  const ordinary = planUpgrade(input)
  assert.equal(ordinary.ok, true)
  assert.equal(ordinary.ordinarySyncEligible, true)
  assert.equal(ordinary.upgradeProtocol.profileId, 'reviewed-bootstrap-established-v2')
  assert.equal(ordinary.upgradeProtocol.acceptedBootstrapReadbackSha256, 'a'.repeat(64))
  assert.throws(() => planBootstrap(input), /not assigned to the legacy reviewed-bootstrap profile/)

  delete established.repositories[0].acceptedBootstrapReadbackSha256
  assert.throws(() => planUpgrade({ ...input, inventory: established }), /accepted bootstrap readback binding does not match profile/)
})

test('consumer upgrade protocol has a closed schema and a digest-bound lock projection', () => {
  const loaded = loadConsumerUpgradeProtocol()
  const sourceDigests = protocolSourceDigests(loaded)
  const projection = protocolLockProjection(loaded.protocol, sourceDigests)
  assert.equal(validateProtocolLock(projection, loaded.protocol, sourceDigests).protocolId, 'protected-base-reconstruction-v2')

  const opened = { ...projection, candidateCodeExecutionAllowed: true }
  assert.throws(() => validateProtocolLock(opened, loaded.protocol, sourceDigests), /does not bind the exact protected-base reconstruction protocol/)
  assert.throws(
    () => validateProtocolLock({ ...projection, implementationSha256: '0'.repeat(64) }, loaded.protocol, sourceDigests),
    /does not bind the exact protected-base reconstruction protocol/,
  )
  assert.equal(loaded.protocol.planning.mutationAuthorized, false)
  assert.equal(loaded.protocol.planning.rolloutCompletionEligible, false)
  assert.equal(loaded.protocol.ordinaryUpgrade.legacySelfUpdateMayClaimCompletion, false)
  assert.equal(loaded.protocol.profiles['reviewed-bootstrap-established-v2'].acceptedBootstrapBindingRequired, true)
})

test('legacy bootstrap readback accepts any inventory-declared legacy product consumer', () => {
  const loaded = loadConsumerUpgradeProtocol()
  const sourceDigests = protocolSourceDigests(loaded)
  const repository = {
    id: 'legacy-orders',
    github: 'ajenchen/legacy-orders',
    role: 'product-consumer',
    upgradeProtocolProfile: 'legacy-bootstrap-v2',
  }
  const candidateRelease = { version: '1.2.3', sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40) }
  const releaseBom = {
    governance: {
      consumer: { sha256: '3'.repeat(64) },
      forkCorpus: { sha256: '4'.repeat(64) },
      productTemplateScaffold: { staticTreeSha256: '5'.repeat(64) },
    },
  }
  const value = {
    schemaVersion: 1,
    kind: 'consumer-governance-bootstrap-readback',
    repositoryId: repository.id,
    repository: repository.github,
    protocolId: loaded.protocol.protocolId,
    protocolSpecificationSha256: sourceDigests.specificationSha256,
    protocolSchemaSha256: sourceDigests.schemaSha256,
    protocolImplementationSha256: sourceDigests.implementationSha256,
    bootstrapMode: 'one-time-reviewed-full-snapshot-pr',
    baseDefaultBranchHeadSha: '6'.repeat(40),
    pullRequestNumber: 42,
    pullRequestHeadSha: '7'.repeat(40),
    mergeCommitSha: '8'.repeat(40),
    mergeTreeSha: '9'.repeat(40),
    defaultBranchHeadSha: '8'.repeat(40),
    candidateSourceCommit: candidateRelease.sourceCommit,
    candidateSourceTree: candidateRelease.sourceTree,
    version: candidateRelease.version,
    consumerLockSha256: releaseBom.governance.consumer.sha256,
    forkCorpusLockSha256: releaseBom.governance.forkCorpus.sha256,
    templateStaticTreeSha256: releaseBom.governance.productTemplateScaffold.staticTreeSha256,
    fullSnapshotPlanDigest: 'a'.repeat(64),
    materializedGovernanceTreeSha256: 'b'.repeat(64),
    requiredChecksDigest: 'c'.repeat(64),
    reviewAuthorization: {
      actorId: 'reviewer-1',
      authorizationDigest: 'd'.repeat(64),
      authorizedAt: '2026-07-20T01:00:00.000Z',
      kind: 'independent-engineering-attestation',
    },
    legacySelfUpdateUsed: false,
    candidateCodeExecuted: false,
    eligible: true,
    mergedAt: '2026-07-20T02:00:00.000Z',
    observedAt: '2026-07-20T03:00:00.000Z',
  }
  assert.equal(validateConsumerBootstrapReadback(value, { repository, candidateRelease, releaseBom, protocol: loaded.protocol, sourceDigests }), value)
  assert.throws(
    () => validateConsumerBootstrapReadback(value, { repository: { ...repository, upgradeProtocolProfile: 'new-snapshot-v2' }, candidateRelease, releaseBom, protocol: loaded.protocol, sourceDigests }),
    /not an inventory-declared legacy product consumer/,
  )
})

test('consumer registration is a closed, no-mutation proposal constrained to the inventory authority and product ring', () => {
  const managed = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
  const rings = readJson(resolve(GOVERNANCE_ROOT, 'release-rings.json'))
  const roleSurfacePolicy = readJson(resolve(GOVERNANCE_ROOT, 'providers/role-surface-policy.json'))
  const request = {
    repoId: 'pilot-product',
    github: 'ajenchen/pilot-product',
    visibility: 'private',
    defaultBranch: 'main',
    localPathFromGovernanceRoot: '../../../pilot-product',
    releaseRing: 'ring-2-product-canary',
    wave: 'canary',
    enteredAt: '2026-07-22T00:00:00.000Z',
  }
  const proposal = planConsumerRegistration({ inventory: managed, rings, request })
  assert.equal(proposal.mutationAuthorized, false)
  assert.equal(proposal.proposed.repository.upgradeProtocolProfile, 'new-snapshot-v2')
  assert.deepEqual(
    proposal.proposed.repository.providerSurfacesRequired,
    roleSurfacePolicy.roles['product-consumer'].requiredSurfaces,
    'registration must derive provider surfaces from the role policy rather than the first product consumer',
  )
  assert.equal(proposal.proposed.assignment.applyAuthorization, null)
  assert.equal(proposal.proposed.assignment.manualBlockers.length, 1)
  assert.equal(validateConsumerRegistrationProposal(proposal, { inventory: managed, rings }).proposalDigest, proposal.proposalDigest)
  assert.throws(
    () => planConsumerRegistration({ inventory: managed, rings, request: { ...request, github: 'outside/pilot-product' } }),
    /may not extend authority/,
  )
})

test('fleet fanout without a reviewed runtime identity snapshot is not ready and carries a typed blocker', () => {
  const fixture = fleetFixture()
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3' })
  assert.equal(plan.ready, false)
  assert.equal(plan.runtimeIdentitySnapshot, null)
  assert.equal(plan.runtimeIdentitySnapshotDigest, null)
  assert.deepEqual(plan.dispatches, [])
  assert.deepEqual(plan.blockers.map(blocker => ({
    severity: blocker.severity,
    code: blocker.code,
  })), [{
    severity: 'blocker',
    code: 'reviewed-runtime-identity-snapshot-required',
  }])
  assert.equal(plan.repositories[0].status, 'blocked')
  assert.ok(plan.repositories[0].blockers.includes('reviewed-runtime-identity-snapshot-required'))
  assert.equal(validateConsumerFanoutPlan(plan, fixture).planDigest, plan.planDigest)
  assert.throws(
    () => createConsumerFanoutReviewSigningRequest({
      ...fixture,
      plan,
      decision: 'approved',
      issuedAt: '2026-07-20T01:20:00.000Z',
      expiresAt: '2026-07-20T01:50:00.000Z',
    }),
    /requires a runtime identity snapshot bound to the canonical plan/,
  )
})

test('fleet fanout enumerates every registered opt-in product consumer without claiming global template-lineage discovery', () => {
  const propagationContract = readFileSync(new URL('../../../packages/design-system/ds-canonical/skills/knowledge-prune/references/phase-z-cross-repo-ssot-propagation.md', import.meta.url), 'utf8')
  assert.match(propagationContract, /owned only by `infra\/governance\/release-workflow\.json`/)
  assert.match(propagationContract, /reviewed exact-version PRs land in the template and WM/)
  assert.doesNotMatch(propagationContract, /every consumer receives an exact-version PR/i)

  const fixture = fleetFixture()
  const runtimeIdentitySnapshot = fleetRuntimeSnapshot(fixture.inventory)
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot })
  assert.equal(plan.coverage.registeredProductConsumers, 1)
  assert.equal(plan.coverage.enumeratedRegisteredProductConsumers, 1)
  assert.equal(plan.coverage.scope, 'registered-opt-in-inventory')
  assert.equal(plan.coverage.unregisteredTemplateDescendants, 'not-observable-without-opt-in')
  assert.equal(plan.coverage.globalTemplateLineageComplete, false)
  assert.equal(plan.dispatches.length, 1)
  assert.equal(plan.dispatches[0].endpoint, 'repos/ajenchen/consumer/dispatches')
  assert.equal(plan.runtimeIdentitySnapshotDigest, runtimeIdentitySnapshot.snapshotDigest)
  assert.equal(validateConsumerFanoutPlan(plan, fixture).planDigest, plan.planDigest)
  const { request, receipt } = signedFleetReview(fixture, plan)
  const reviewSchema = JSON.parse(readFileSync(resolve(GOVERNANCE_ROOT, 'schemas/consumer-fanout-review.schema.json'), 'utf8'))
  const validateReviewArtifact = new Ajv2020({ allErrors: true, strict: true }).compile(reviewSchema)
  const dispatchEvidenceSchema = JSON.parse(readFileSync(resolve(GOVERNANCE_ROOT, 'schemas/consumer-fanout-dispatch-evidence.schema.json'), 'utf8'))
  const validateDispatchEvidence = new Ajv2020({ allErrors: true, strict: true }).compile(dispatchEvidenceSchema)
  assert.equal(validateReviewArtifact(request), true, new Ajv2020().errorsText(validateReviewArtifact.errors))
  assert.equal(validateReviewArtifact(receipt), true, new Ajv2020().errorsText(validateReviewArtifact.errors))
  assert.equal(validateConsumerFanoutReviewSigningRequest(request, { ...fixture, plan }).requestDigest, request.requestDigest)
  assert.deepEqual(validateConsumerFanoutReviewReceipt(receipt, { ...fixture, plan }).signers, ['fleet-independent-reviewer-subject'])
  assert.equal(Buffer.from(request.claims.planCanonicalBase64, 'base64').toString('utf8'), stableStringify(plan, 0))

  const calls = []
  const timestamps = [
    '2026-07-20T01:30:00.000Z',
    '2026-07-20T01:31:00.000Z',
    '2026-07-20T01:32:00.000Z',
    '2026-07-20T01:33:00.000Z',
  ]
  const evidence = executeConsumerFanout({
    plan,
    expectedPlanDigest: plan.planDigest,
    reviewReceipt: receipt,
    inventory: fixture.inventory,
    rings: fixture.rings,
    issuerRegistry: fixture.issuerRegistry,
    governanceModels: fleetGovernanceModels(fixture),
    reloadCurrentGovernance: fleetGovernanceReload(fixture),
    runtimeIdentitySnapshotResolver: () => runtimeIdentitySnapshot,
    ghTransport: (args, options) => {
      calls.push({ args, input: options.input })
      return { status: 0 }
    },
    clock: () => new Date(timestamps.shift()),
  })
  assert.deepEqual(calls[0].args, ['api', '--method', 'POST', 'repos/ajenchen/consumer/dispatches', '--input', '-'])
  assert.equal(evidence.status, 'requests-accepted-readback-required')
  assert.equal(evidence.completionClaimed, false)
  assert.equal(evidence.reviewReceiptDigest, receipt.receiptDigest)
  assert.equal(evidence.requests[0].status, 'request-accepted-unverified')
  assert.deepEqual(evidence.runtimeRechecks, [{ repositoryId: 'consumer', snapshotDigest: runtimeIdentitySnapshot.snapshotDigest, status: 'current' }])
  assert.equal(evidence.authorityRechecks[0].status, 'current-at-mutation-boundary')
  assert.equal(validateDispatchEvidence(evidence), true, new Ajv2020().errorsText(validateDispatchEvidence.errors))

  const tampered = structuredClone(plan)
  tampered.dispatches[0].endpoint = 'repos/outside/arbitrary/dispatches'
  assert.throws(() => validateConsumerFanoutPlan(tampered, fixture), /stale, substituted, or not canonical/)
})

test('live fanout check returns a typed digest-bound read-only receipt instead of replaying the plan', () => {
  const fixture = fleetFixture()
  const reviewed = fleetRuntimeSnapshot(fixture.inventory)
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: reviewed })
  const { receipt } = signedFleetReview(fixture, plan)
  const check = createConsumerFanoutCheckReceipt({
    plan,
    reviewReceipt: receipt,
    inventory: fixture.inventory,
    checkedAt: new Date('2026-07-20T01:30:00.000Z'),
    observedRuntimeIdentitySnapshot: reviewed,
  })
  assert.equal(check.kind, 'consumer-fleet-fanout-check')
  assert.equal(check.status, 'ready')
  assert.equal(check.ready, true)
  assert.equal(check.readOnly, true)
  assert.equal(check.mutationAuthorized, false)
  assert.equal(check.completionClaimed, false)
  assert.equal(check.checkedAt, '2026-07-20T01:30:00.000Z')
  assert.equal(check.planDigest, plan.planDigest)
  assert.equal(check.reviewReceiptDigest, receipt.receiptDigest)
  assert.equal(check.reviewedRuntimeIdentitySnapshotDigest, reviewed.snapshotDigest)
  assert.equal(check.observedRuntimeIdentitySnapshotDigest, reviewed.snapshotDigest)
  assert.match(check.checkDigest, /^[a-f0-9]{64}$/)
  assert.equal(validateConsumerFanoutCheckReceipt(check), check)

  const stale = fleetRuntimeSnapshot(fixture.inventory, {
    externalRepositoryIdentities: { consumer: { gitTree: '9'.repeat(40) } },
  })
  assert.throws(
    () => createConsumerFanoutCheckReceipt({
      plan,
      reviewReceipt: receipt,
      inventory: fixture.inventory,
      checkedAt: new Date('2026-07-20T01:30:00.000Z'),
      observedRuntimeIdentitySnapshot: stale,
    }),
    /reviewed runtime identity snapshot is stale or replayed/,
  )
})

test('fanout runtime snapshot is content-addressed and rejects stale or replayed current identity', () => {
  const fixture = fleetFixture()
  const reviewed = fleetRuntimeSnapshot(fixture.inventory)
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: reviewed })
  assert.equal(assertConsumerFanoutRuntimeIdentityCurrent(plan, reviewed, fixture.inventory), reviewed)

  const tampered = structuredClone(plan)
  tampered.runtimeIdentitySnapshot.repositories[0].gitTree = '9'.repeat(40)
  assert.throws(() => validateConsumerFanoutPlan(tampered, fixture), /runtime identity snapshot digest is stale/)

  const replayedAgainstNewHead = fleetRuntimeSnapshot(fixture.inventory, {
    externalRepositoryIdentities: { consumer: { gitCommit: 'e'.repeat(40) } },
  })
  assert.throws(
    () => assertConsumerFanoutRuntimeIdentityCurrent(plan, replayedAgainstNewHead, fixture.inventory),
    /reviewed runtime identity snapshot is stale or replayed/,
  )
})

test('fanout apply performs zero writes and zero dispatches when the initial identity is stale', () => {
  const fixture = fleetFixture()
  const reviewed = fleetRuntimeSnapshot(fixture.inventory)
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: reviewed })
  const { receipt } = signedFleetReview(fixture, plan)
  const stale = fleetRuntimeSnapshot(fixture.inventory, { runtimeIdentity: { gitTree: '0'.repeat(40) } })
  const dispatches = []
  const evidenceWrites = []
  assert.throws(() => executeConsumerFanout({
    plan,
    expectedPlanDigest: plan.planDigest,
    reviewReceipt: receipt,
    inventory: fixture.inventory,
    rings: fixture.rings,
    issuerRegistry: fixture.issuerRegistry,
    governanceModels: fleetGovernanceModels(fixture),
    reloadCurrentGovernance: fleetGovernanceReload(fixture),
    runtimeIdentitySnapshotResolver: () => stale,
    ghTransport: (...args) => {
      dispatches.push(args)
      return { status: 0 }
    },
    clock: () => new Date('2026-07-20T01:30:00.000Z'),
    onEvidence: evidence => evidenceWrites.push(evidence),
  }), /changed before initial apply preflight/)
  assert.deepEqual(dispatches, [])
  assert.deepEqual(evidenceWrites, [])
})

test('fanout apply rechecks immediately before dispatch and returns typed evidence with zero POSTs on TOCTOU drift', () => {
  const fixture = fleetFixture()
  const reviewed = fleetRuntimeSnapshot(fixture.inventory)
  const stale = fleetRuntimeSnapshot(fixture.inventory, {
    externalRepositoryIdentities: { consumer: { gitTree: '0'.repeat(40) } },
  })
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: reviewed })
  const { receipt } = signedFleetReview(fixture, plan)
  const snapshots = [reviewed, stale]
  const dispatches = []
  const evidence = executeConsumerFanout({
    plan,
    expectedPlanDigest: plan.planDigest,
    reviewReceipt: receipt,
    inventory: fixture.inventory,
    rings: fixture.rings,
    issuerRegistry: fixture.issuerRegistry,
    governanceModels: fleetGovernanceModels(fixture),
    reloadCurrentGovernance: fleetGovernanceReload(fixture),
    runtimeIdentitySnapshotResolver: () => snapshots.shift(),
    ghTransport: (...args) => {
      dispatches.push(args)
      return { status: 0 }
    },
    clock: () => new Date('2026-07-20T01:30:00.000Z'),
  })
  assert.deepEqual(dispatches, [])
  assert.equal(evidence.status, 'blocked-runtime-identity-drift')
  assert.equal(evidence.requests.length, 0)
  assert.equal(evidence.runtimeValidationFailures[0].code, 'runtime-identity-drift')
})

test('fanout review binds canonical plan bytes and every authority digest, and rejects substitution or signer overlap', () => {
  const fixture = fleetFixture()
  const snapshot = fleetRuntimeSnapshot(fixture.inventory)
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: snapshot })
  const { request, receipt } = signedFleetReview(fixture, plan)
  assert.equal(request.claims.planDigest, plan.planDigest)
  assert.equal(request.claims.planCanonicalSha256, sha256(Buffer.from(stableStringify(plan, 0))))
  assert.equal(request.claims.inventorySha256, sha256(stableStringify(fixture.inventory, 0)))
  assert.equal(request.claims.releaseRingsSha256, sha256(stableStringify(fixture.rings, 0)))
  assert.equal(request.claims.candidateReleaseDigest, plan.candidateReleaseDigest)
  assert.equal(request.claims.runtimeIdentitySnapshotDigest, plan.runtimeIdentitySnapshotDigest)
  assert.equal(request.claims.issuerRegistryDigest, issuerRegistryDigest(fixture.issuerRegistry))

  const substituted = structuredClone(receipt)
  substituted.claims.planCanonicalBase64 = Buffer.from(`${stableStringify(plan, 0)} `).toString('base64')
  assert.throws(
    () => validateConsumerFanoutReviewReceipt(substituted, { ...fixture, plan }),
    /stale, substituted, or detached|canonical plan bytes digest is stale/,
  )

  const badSignature = structuredClone(receipt)
  badSignature.signatures[0].signature = `${badSignature.signatures[0].signature.slice(0, -1)}${badSignature.signatures[0].signature.endsWith('A') ? 'B' : 'A'}`
  assert.throws(() => validateConsumerFanoutReviewReceipt(badSignature, { ...fixture, plan }), /signature (?:is invalid|is not canonical)/)

  const overlapping = fleetFixture({ reviewSubject: 'fleet-authorizer-subject' })
  const overlappingPlan = planConsumerFanout({
    ...overlapping,
    version: '1.2.3',
    runtimeIdentitySnapshot: fleetRuntimeSnapshot(overlapping.inventory),
  })
  assert.throws(
    () => signedFleetReview(overlapping, overlappingPlan),
    /lacks 1 independent completion-attestor subjects distinct from apply authorizers/,
  )
})

test('fanout apply fails before evidence or network without a signed review receipt', () => {
  const fixture = fleetFixture()
  const snapshot = fleetRuntimeSnapshot(fixture.inventory)
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: snapshot })
  const dispatches = []
  const evidenceWrites = []
  assert.throws(() => executeConsumerFanout({
    plan,
    expectedPlanDigest: plan.planDigest,
    inventory: fixture.inventory,
    rings: fixture.rings,
    issuerRegistry: fixture.issuerRegistry,
    governanceModels: fleetGovernanceModels(fixture),
    reloadCurrentGovernance: fleetGovernanceReload(fixture),
    runtimeIdentitySnapshotResolver: () => snapshot,
    ghTransport: (...args) => {
      dispatches.push(args)
      return { status: 0 }
    },
    clock: () => fixture.now,
    onEvidence: value => evidenceWrites.push(value),
  }), /consumer fleet fanout review receipt/)
  assert.deepEqual(dispatches, [])
  assert.deepEqual(evidenceWrites, [])
})

test('fanout apply revalidates review receipt and apply authorization at each live dispatch decision', () => {
  const cases = [
    {
      name: 'review receipt expiry',
      reviewExpiresAt: '2026-07-20T01:31:00.000Z',
      decisionAt: '2026-07-20T01:31:00.000Z',
      expected: /review is expired/,
    },
    {
      name: 'apply authorization expiry',
      reviewExpiresAt: '2026-07-20T02:10:00.000Z',
      decisionAt: '2026-07-20T02:00:00.000Z',
      expected: /attestation is expired/,
    },
  ]
  for (const scenario of cases) {
    const fixture = fleetFixture()
    const snapshot = fleetRuntimeSnapshot(fixture.inventory)
    const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: snapshot })
    const { receipt } = signedFleetReview(fixture, plan, { expiresAt: scenario.reviewExpiresAt })
    const times = [fixture.now, new Date(scenario.decisionAt)]
    const dispatches = []
    const evidence = executeConsumerFanout({
      plan,
      expectedPlanDigest: plan.planDigest,
      reviewReceipt: receipt,
      inventory: fixture.inventory,
      rings: fixture.rings,
      issuerRegistry: fixture.issuerRegistry,
      governanceModels: fleetGovernanceModels(fixture),
      reloadCurrentGovernance: fleetGovernanceReload(fixture),
      runtimeIdentitySnapshotResolver: () => snapshot,
      ghTransport: (...args) => {
        dispatches.push(args)
        return { status: 0 }
      },
      clock: () => times.shift(),
    })
    assert.deepEqual(dispatches, [], scenario.name)
    assert.equal(evidence.status, 'blocked-reviewed-authority-drift', scenario.name)
    assert.equal(evidence.requests.length, 0, scenario.name)
    assert.match(evidence.authorityValidationFailures[0].message, scenario.expected, scenario.name)
  }
})

test('fanout mutation-boundary recheck catches receipt expiry while live runtime readback is in flight', () => {
  const fixture = fleetFixture()
  const snapshot = fleetRuntimeSnapshot(fixture.inventory)
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: snapshot })
  const { receipt } = signedFleetReview(fixture, plan, { expiresAt: '2026-07-20T01:31:00.000Z' })
  const times = [
    new Date('2026-07-20T01:30:00.000Z'),
    new Date('2026-07-20T01:30:30.000Z'),
    new Date('2026-07-20T01:31:00.000Z'),
  ]
  const dispatches = []
  const resolverTimes = []
  const evidence = executeConsumerFanout({
    plan,
    expectedPlanDigest: plan.planDigest,
    reviewReceipt: receipt,
    inventory: fixture.inventory,
    rings: fixture.rings,
    issuerRegistry: fixture.issuerRegistry,
    governanceModels: fleetGovernanceModels(fixture),
    reloadCurrentGovernance: fleetGovernanceReload(fixture),
    runtimeIdentitySnapshotResolver: context => {
      resolverTimes.push(context.now.toISOString())
      return snapshot
    },
    ghTransport: (...args) => {
      dispatches.push(args)
      return { status: 0 }
    },
    clock: () => times.shift(),
  })
  assert.deepEqual(resolverTimes, ['2026-07-20T01:30:00.000Z', '2026-07-20T01:30:30.000Z'])
  assert.deepEqual(dispatches, [])
  assert.equal(evidence.status, 'blocked-reviewed-authority-drift')
  assert.match(evidence.authorityValidationFailures[0].message, /review is expired/)
})

test('fanout live clock cannot regress and resurrect review or apply authority before POST', () => {
  const fixture = fleetFixture()
  const snapshot = fleetRuntimeSnapshot(fixture.inventory)
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: snapshot })
  const { receipt } = signedFleetReview(fixture, plan, { expiresAt: '2026-07-20T01:31:00.000Z' })
  const times = [
    new Date('2026-07-20T01:30:00.000Z'),
    new Date('2026-07-20T01:30:30.000Z'),
    new Date('2026-07-20T01:29:59.000Z'),
  ]
  const dispatches = []
  const evidence = executeConsumerFanout({
    plan,
    expectedPlanDigest: plan.planDigest,
    reviewReceipt: receipt,
    inventory: fixture.inventory,
    rings: fixture.rings,
    issuerRegistry: fixture.issuerRegistry,
    governanceModels: fleetGovernanceModels(fixture),
    reloadCurrentGovernance: fleetGovernanceReload(fixture),
    runtimeIdentitySnapshotResolver: () => snapshot,
    ghTransport: (...args) => {
      dispatches.push(args)
      return { status: 0 }
    },
    clock: () => times.shift(),
  })
  assert.deepEqual(dispatches, [])
  assert.equal(evidence.status, 'blocked-reviewed-authority-drift')
  assert.match(evidence.authorityValidationFailures[0].message, /clock regressed/)
})

test('fanout mutation boundary reloads every canonical governance input and CAS-blocks core or non-core drift', () => {
  for (const driftedKey of ['rings', 'runtimeProfile']) {
    const fixture = fleetFixture()
    const snapshot = fleetRuntimeSnapshot(fixture.inventory)
    const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: snapshot })
    const { receipt } = signedFleetReview(fixture, plan)
    let reloads = 0
    const dispatches = []
    const evidence = executeConsumerFanout({
      plan,
      expectedPlanDigest: plan.planDigest,
      reviewReceipt: receipt,
      inventory: fixture.inventory,
      rings: fixture.rings,
      issuerRegistry: fixture.issuerRegistry,
      governanceModels: fleetGovernanceModels(fixture),
      reloadCurrentGovernance: () => {
        reloads += 1
        const current = fleetGovernanceModels(fixture)
        if (reloads === 3) {
          if (driftedKey === 'rings') current.rings.assignments.consumer.manualBlockers.push('concurrent-canonical-drift')
          else current.runtimeProfile.concurrentCanonicalDrift = true
        }
        return current
      },
      runtimeIdentitySnapshotResolver: () => snapshot,
      ghTransport: (...args) => {
        dispatches.push(args)
        return { status: 0 }
      },
      clock: () => new Date('2026-07-20T01:30:00.000Z'),
    })
    assert.equal(reloads, 3, driftedKey)
    assert.deepEqual(dispatches, [], driftedKey)
    assert.equal(evidence.status, 'blocked-reviewed-authority-drift', driftedKey)
    assert.match(
      evidence.authorityValidationFailures[0].message,
      new RegExp(`canonical governance SSOT changed before mutation boundary for consumer: ${driftedKey}`),
      driftedKey,
    )
  }
})

test('fanout review signatures are exact-quorum, bounded and canonical independent of input order', () => {
  const fixture = fleetFixture({
    reviewSubjects: ['fleet-independent-reviewer-subject-a', 'fleet-independent-reviewer-subject-b', 'fleet-independent-reviewer-subject-c'],
    reviewQuorum: 2,
  })
  const snapshot = fleetRuntimeSnapshot(fixture.inventory)
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: snapshot })
  const request = createConsumerFanoutReviewSigningRequest({
    ...fixture,
    plan,
    decision: 'approved',
    issuedAt: '2026-07-20T01:20:00.000Z',
    expiresAt: '2026-07-20T01:50:00.000Z',
  })
  const payload = Buffer.from(request.signingPayloadBase64, 'base64')
  const signatures = fixture.reviewSigners.map(signer => ({
    signerKeyId: signer.keyId,
    subject: signer.subject,
    signature: sign(null, payload, signer.privateKey).toString('base64url'),
  }))
  assert.throws(() => createConsumerFanoutReviewReceipt(request, signatures), /requires exactly 2 external signatures/)
  const canonical = createConsumerFanoutReviewReceipt(request, signatures.slice(0, 2))
  const reorderedInput = createConsumerFanoutReviewReceipt(request, signatures.slice(0, 2).reverse())
  assert.deepEqual(reorderedInput, canonical)
  assert.deepEqual(canonical.signatures.map(item => item.signerKeyId), ['fleet-independent-reviewer', 'fleet-independent-reviewer-2'])

  const reorderedReceipt = structuredClone(canonical)
  reorderedReceipt.signatures.reverse()
  assert.throws(
    () => validateConsumerFanoutReviewReceipt(reorderedReceipt, { ...fixture, plan }),
    /not in canonical signer-key order/,
  )
  const oversizedSignature = structuredClone(signatures[0])
  oversizedSignature.signature = 'A'.repeat(87)
  assert.throws(
    () => createConsumerFanoutReviewReceipt(request, [oversizedSignature, signatures[1]]),
    /signature is invalid or non-canonical/,
  )
  const oversizedPlanBytes = structuredClone(request)
  oversizedPlanBytes.claims.planCanonicalBase64 = 'A'.repeat(Math.ceil(CONSUMER_FANOUT_LIMITS.maxPlanCanonicalBytes / 3) * 4 + 1)
  assert.throws(
    () => createConsumerFanoutReviewReceipt(oversizedPlanBytes, signatures.slice(0, 2)),
    /canonical plan bytes are invalid or oversized/,
  )
})

test('fanout CLI rejects oversized plan and review artifacts before parsing or API access', async t => {
  const fixture = fleetFixture()
  const snapshot = fleetRuntimeSnapshot(fixture.inventory)
  const plan = planConsumerFanout({ ...fixture, version: '1.2.3', runtimeIdentitySnapshot: snapshot })
  const directory = mkdtempSync(join(tmpdir(), 'consumerctl-bounded-artifacts-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const inventoryPath = writeJsonFixture(directory, 'inventory.json', fixture.inventory)
  const ringsPath = writeJsonFixture(directory, 'rings.json', fixture.rings)
  const planPath = writeJsonFixture(directory, 'plan.json', plan)
  const oversizedPlanPath = resolve(directory, 'oversized-plan.json')
  const oversizedReceiptPath = resolve(directory, 'oversized-receipt.json')
  writeFileSync(oversizedPlanPath, Buffer.alloc(CONSUMER_FANOUT_LIMITS.maxArtifactBytes + 1, 0x20))
  writeFileSync(oversizedReceiptPath, Buffer.alloc(CONSUMER_FANOUT_LIMITS.maxArtifactBytes + 1, 0x20))
  const client = { calls: [], request(...args) { this.calls.push(args); throw new Error('oversized artifacts must fail before API access') } }

  await assert.rejects(
    () => consumerctlMain([
      'prepare-fanout-review',
      '--inventory', inventoryPath,
      '--rings', ringsPath,
      '--plan-file', oversizedPlanPath,
      '--expected-plan-digest', plan.planDigest,
      '--decision', 'approved',
      '--issued-at', '2026-07-20T01:20:00.000Z',
      '--expires-at', '2026-07-20T01:50:00.000Z',
    ], { client, now: fixture.now, issuerRegistry: fixture.issuerRegistry }),
    /consumer fleet fanout plan exceeds the 8388608-byte artifact limit/,
  )
  await assert.rejects(
    () => consumerctlMain([
      'check-fanout',
      '--inventory', inventoryPath,
      '--rings', ringsPath,
      '--plan-file', planPath,
      '--review-receipt', oversizedReceiptPath,
      '--offline',
    ], { client, now: fixture.now, issuerRegistry: fixture.issuerRegistry }),
    /consumer fleet fanout review receipt exceeds the 8388608-byte artifact limit/,
  )
  assert.deepEqual(client.calls, [])
})

test('live consumerctl rejects injected runtime identity before API reads', async () => {
  class NoReadLiveClient extends GhApiClient {
    calls = []

    request(...args) {
      this.calls.push(args)
      throw new Error('API request must not occur')
    }
  }
  const client = new NoReadLiveClient()
  await assert.rejects(
    () => consumerctlMain([
      'doctor', '--repo-id', 'design-system', '--root', resolve(GOVERNANCE_ROOT, '../..'),
    ], {
      client,
      runtimeValidationContext: fleetRuntimeContext(fleetFixture().inventory),
    }),
    /Live GitHub runtime validation refuses an injected runtime validation identity/,
  )
  assert.deepEqual(client.calls, [])
})

test('consumer doctor returns a typed blocker when external certifications transition to certified without live identity', t => {
  const fixture = externalCertifiedConsumerFixture(t)
  const root = resolve(tmpdir(), 'consumerctl-checkout-that-does-not-exist')
  const input = (certifications, runtimeValidationContext = {}) => ({
    inventory: fixture.inventory,
    desired: fixture.desired,
    matrix: fixture.matrix,
    rings: fixture.rings,
    certifications,
    waivers: fixture.waivers,
    repoId: 'consumer',
    root,
    now: fixture.now,
    issuerRegistry: fixture.issuerRegistry,
    runtimeProfile: fixture.runtimeProfile,
    runtimeValidationContext,
  })

  const before = doctorRepository(input(fixture.certificationsBefore))
  assert.equal(before.findings.some(finding => finding.code === 'external-runtime-validation-context-unavailable'), false)

  const offline = doctorRepository(input(fixture.certificationsAfter))
  assert.equal(offline.findings.find(finding => finding.code === 'external-runtime-validation-context-unavailable')?.severity, 'blocker')
})

test('offline fanout check is always a typed blocker and performs no API read after external certification', async t => {
  const fixture = externalCertifiedConsumerFixture(t)
  const directory = mkdtempSync(join(tmpdir(), 'consumerctl-offline-check-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const snapshot = createConsumerRuntimeIdentitySnapshot(fixture.runtimeValidationContext, fixture.inventory)
  const plan = planConsumerFanout({
    inventory: fixture.inventory,
    rings: fixture.rings,
    version: fixture.rings.candidateRelease.version,
    now: fixture.now,
    issuerRegistry: fixture.issuerRegistry,
    runtimeIdentitySnapshot: snapshot,
  })
  const { request, receipt, signatures } = signedFleetReview(fixture, plan, {
    issuedAt: '2026-07-19T23:50:00.000Z',
    expiresAt: '2026-07-20T00:30:00.000Z',
  })
  const paths = {
    inventory: writeJsonFixture(directory, 'inventory.json', fixture.inventory),
    desired: writeJsonFixture(directory, 'desired.json', fixture.desired),
    matrix: writeJsonFixture(directory, 'matrix.json', fixture.matrix),
    rings: writeJsonFixture(directory, 'rings.json', fixture.rings),
    certificationsBefore: writeJsonFixture(directory, 'certifications-before.json', fixture.certificationsBefore),
    certificationsAfter: writeJsonFixture(directory, 'certifications-after.json', fixture.certificationsAfter),
    waivers: writeJsonFixture(directory, 'waivers.json', fixture.waivers),
    plan: writeJsonFixture(directory, 'plan.json', plan),
    signingRequest: writeJsonFixture(directory, 'signing-request.json', request),
    signatures: writeJsonFixture(directory, 'signatures.json', signatures),
    reviewReceipt: writeJsonFixture(directory, 'review-receipt.json', receipt),
  }
  const client = {
    calls: [],
    request(...args) {
      this.calls.push(args)
      throw new Error('offline check must not read the API')
    },
  }
  const argv = certifications => [
    'check-fanout',
    '--inventory', paths.inventory,
    '--desired', paths.desired,
    '--matrix', paths.matrix,
    '--rings', paths.rings,
    '--certifications', certifications,
    '--waivers', paths.waivers,
    '--plan-file', paths.plan,
    '--review-receipt', paths.reviewReceipt,
    '--offline',
  ]
  const previousExitCode = process.exitCode
  try {
    const prepared = await consumerctlMain([
      'prepare-fanout-review',
      '--inventory', paths.inventory,
      '--desired', paths.desired,
      '--matrix', paths.matrix,
      '--rings', paths.rings,
      '--certifications', paths.certificationsBefore,
      '--waivers', paths.waivers,
      '--plan-file', paths.plan,
      '--expected-plan-digest', plan.planDigest,
      '--decision', 'approved',
      '--issued-at', '2026-07-19T23:50:00.000Z',
      '--expires-at', '2026-07-20T00:30:00.000Z',
    ], {
      client,
      now: fixture.now,
      issuerRegistry: fixture.issuerRegistry,
      runtimeProfile: fixture.runtimeProfile,
    })
    assert.equal(prepared.requestDigest, request.requestDigest)
    assert.deepEqual(client.calls, [], 'review request preparation must be read-only and offline-safe')
    const assembled = await consumerctlMain([
      'assemble-fanout-review',
      '--inventory', paths.inventory,
      '--desired', paths.desired,
      '--matrix', paths.matrix,
      '--rings', paths.rings,
      '--certifications', paths.certificationsBefore,
      '--waivers', paths.waivers,
      '--plan-file', paths.plan,
      '--signing-request', paths.signingRequest,
      '--signatures', paths.signatures,
    ], {
      client,
      now: fixture.now,
      issuerRegistry: fixture.issuerRegistry,
      runtimeProfile: fixture.runtimeProfile,
    })
    assert.equal(assembled.receiptDigest, receipt.receiptDigest)
    assert.deepEqual(client.calls, [], 'receipt assembly must keep private keys external and remain offline-safe')
    const withoutReview = argv(paths.certificationsBefore)
    withoutReview.splice(withoutReview.indexOf('--review-receipt'), 2)
    await assert.rejects(
      () => consumerctlMain(withoutReview, {
        client,
        now: fixture.now,
        issuerRegistry: fixture.issuerRegistry,
        runtimeProfile: fixture.runtimeProfile,
      }),
      /check-fanout requires --review-receipt/,
    )
    const applyWithoutReview = [...withoutReview]
    applyWithoutReview[0] = 'apply-fanout'
    applyWithoutReview.splice(applyWithoutReview.indexOf('--offline'), 1)
    applyWithoutReview.push('--expected-plan-digest', plan.planDigest)
    await assert.rejects(
      () => consumerctlMain(applyWithoutReview, {
        client,
        now: fixture.now,
        issuerRegistry: fixture.issuerRegistry,
        runtimeProfile: fixture.runtimeProfile,
      }),
      /apply-fanout requires --review-receipt/,
    )
    const before = await consumerctlMain(argv(paths.certificationsBefore), {
      client,
      now: fixture.now,
      issuerRegistry: fixture.issuerRegistry,
      runtimeProfile: fixture.runtimeProfile,
    })
    assert.equal(before.status, 'blocked')
    assert.equal(before.ready, false)
    assert.equal(before.readOnly, true)
    assert.equal(before.checkedAt, fixture.now.toISOString())
    assert.equal(before.reviewReceiptDigest, receipt.receiptDigest)
    assert.equal(before.reviewedRuntimeIdentitySnapshotDigest, plan.runtimeIdentitySnapshotDigest)
    assert.equal(before.observedRuntimeIdentitySnapshotDigest, null)
    assert.equal(before.blockers[0].code, 'live-runtime-identity-readback-required')
    assert.equal(validateConsumerFanoutCheckReceipt(before), before)

    const after = await consumerctlMain(argv(paths.certificationsAfter), {
      client,
      now: fixture.now,
      issuerRegistry: fixture.issuerRegistry,
      runtimeProfile: fixture.runtimeProfile,
    })
    assert.equal(after.status, 'blocked')
    assert.equal(after.ready, false)
    assert.equal(after.reviewedRuntimeIdentitySnapshotDigest, plan.runtimeIdentitySnapshotDigest)
    assert.equal(after.observedRuntimeIdentitySnapshotDigest, null)
    assert.equal(after.blockers[0].code, 'external-runtime-validation-context-unavailable')
    assert.equal(validateConsumerFanoutCheckReceipt(after), after)
    assert.deepEqual(client.calls, [])
  } finally {
    process.exitCode = previousExitCode
  }
})

test('reviewed legacy bootstrap materializes only a fresh full snapshot, preserves modes, and never executes candidate code', t => {
  const fixture = bootstrapFixture(t)
  const bootstrapSourceDigests = {
    bootstrapPlanSchemaSha256: sha256(readFileSync(resolve(GOVERNANCE_ROOT, 'schemas/consumer-bootstrap-plan.schema.json'))),
    bootstrapSnapshotVerificationSchemaSha256: sha256(readFileSync(resolve(GOVERNANCE_ROOT, 'schemas/consumer-bootstrap-snapshot-verification.schema.json'))),
    bootstrapReadbackVerificationSchemaSha256: sha256(readFileSync(resolve(GOVERNANCE_ROOT, 'schemas/consumer-bootstrap-readback-verification.schema.json'))),
    bootstrapPromotionProposalSchemaSha256: sha256(readFileSync(resolve(GOVERNANCE_ROOT, 'schemas/consumer-bootstrap-promotion-proposal.schema.json'))),
    managedReposSchemaSha256: sha256(readFileSync(resolve(GOVERNANCE_ROOT, 'schemas/managed-repos.schema.json'))),
  }
  for (const [field, digest] of Object.entries(bootstrapSourceDigests)) {
    assert.equal(fixture.plan.protocol[field], digest, `bootstrap plan must bind exact ${field} bytes`)
  }
  const currentManagedBefore = readFileSync(resolve(fixture.roots.current, '.claude/skills/a.txt'), 'utf8')
  assert.equal(fixture.plan.reviewReady, true)
  assert.ok(fixture.plan.actions.some(action => action.path === '.claude/skills/a.txt' && action.operation === 'replace'))
  assert.ok(fixture.plan.preserved.some(item => item.path === 'apps/local.txt'))
  assert.throws(
    () => validateConsumerBootstrapMaterializationPlan({ ...fixture.plan, candidateCodeExecutionAllowed: true }),
    /schema validation failed/,
  )

  const verification = materializeConsumerBootstrapSnapshot(fixture)
  assert.equal(verification.materializedSnapshotTreeSha256, fixture.plan.expectedSnapshot.treeSha256)
  assert.equal(readFileSync(resolve(fixture.outputRoot, '.claude/skills/a.txt'), 'utf8'), 'reviewed managed file\n')
  assert.equal(readFileSync(resolve(fixture.outputRoot, 'apps/local.txt'), 'utf8'), 'consumer product data\n')
  assert.equal(statSync(resolve(fixture.outputRoot, '.claude/skills/a.txt')).mode & 0o777, 0o755)
  assert.equal(statSync(resolve(fixture.outputRoot, 'apps/local.txt')).mode & 0o777, 0o600)
  assert.equal(existsSync(fixture.marker), false, 'candidate bytes must be copied as data and never imported or executed')
  assert.equal(readFileSync(resolve(fixture.roots.current, '.claude/skills/a.txt'), 'utf8'), currentManagedBefore, 'live current repository must remain untouched')
  assert.equal(
    verifyMaterializedConsumerBootstrapSnapshot({ plan: fixture.plan, materializedRoot: fixture.outputRoot }).verificationDigest,
    verification.verificationDigest,
  )
})

test('reviewed legacy bootstrap rejects symbolic links, hard links, and output collisions', t => {
  const symbolic = bootstrapFixture(t)
  symlinkSync(resolve(symbolic.roots.incoming, '.claude/skills/a.txt'), resolve(symbolic.roots.incoming, '.claude/skills/link.txt'))
  assert.throws(
    () => createConsumerBootstrapMaterializationPlan(symbolic),
    /symbolic link/,
  )

  const hardLinked = bootstrapFixture(t)
  linkSync(resolve(hardLinked.roots.current, 'apps/local.txt'), resolve(hardLinked.roots.current, 'apps/linked.txt'))
  assert.throws(
    () => createConsumerBootstrapMaterializationPlan(hardLinked),
    /hard-linked/,
  )

  const collision = bootstrapFixture(t)
  mkdirSync(collision.outputRoot)
  writeFileSync(resolve(collision.outputRoot, 'sentinel'), 'do not replace\n')
  assert.throws(() => materializeConsumerBootstrapSnapshot(collision), /output already exists/)
  assert.equal(readFileSync(resolve(collision.outputRoot, 'sentinel'), 'utf8'), 'do not replace\n')
})

test('reviewed legacy bootstrap rejects stale plans before creating an output snapshot', t => {
  const fixture = bootstrapFixture(t)
  writeFileSync(resolve(fixture.roots.incoming, '.claude/skills/a.txt'), 'substituted after review\n')
  assert.throws(
    () => materializeConsumerBootstrapSnapshot(fixture),
    /stale for the exact roots or governance sources|substituted despite its digest binding/,
  )
  assert.equal(existsSync(fixture.outputRoot), false)
})

test('reviewed bootstrap rebinds every validator schema before materialization', t => {
  const fixture = bootstrapFixture(t)
  for (const field of [
    'bootstrapPlanSchemaSha256',
    'bootstrapSnapshotVerificationSchemaSha256',
    'bootstrapReadbackVerificationSchemaSha256',
    'bootstrapPromotionProposalSchemaSha256',
    'managedReposSchemaSha256',
  ]) {
    const tampered = structuredClone(fixture.plan)
    tampered.protocol[field] = tampered.protocol[field] === '9'.repeat(64) ? '8'.repeat(64) : '9'.repeat(64)
    const unsigned = structuredClone(tampered)
    delete unsigned.planDigest
    tampered.planDigest = sha256(`consumer-bootstrap-materialization-plan-v1\0${stableStringify(unsigned, 0)}`)
    assert.throws(
      () => materializeConsumerBootstrapSnapshot({ ...fixture, plan: tampered, expectedPlanDigest: tampered.planDigest }),
      /stale for the exact roots or governance sources|substituted despite its digest binding/,
      `${field} substitution must fail before materialization`,
    )
    assert.equal(existsSync(fixture.outputRoot), false)
  }
})

test('independent bootstrap readback and closed inventory promotion resist readback/proposal co-tampering', t => {
  const fixture = bootstrapFixture(t)
  const snapshot = materializeConsumerBootstrapSnapshot(fixture)
  const readback = bootstrapReadback(fixture, snapshot.materializedSnapshotTreeSha256)
  const readbackVerification = validateIndependentConsumerBootstrapReadback(readback, {
    ...fixture,
    materializedRoot: fixture.outputRoot,
  })
  assert.equal(readbackVerification.acceptedBootstrapReadbackSha256, consumerBootstrapReadbackSha256(readback))
  assert.equal(readbackVerification.acceptedBootstrapReadbackSha256, sha256(stableStringify(readback, 0)), 'accepted inventory binding must equal the staged-rollout artifact address')
  for (const field of [
    'bootstrapPlanSchemaSha256',
    'bootstrapSnapshotVerificationSchemaSha256',
    'bootstrapReadbackVerificationSchemaSha256',
    'bootstrapPromotionProposalSchemaSha256',
    'managedReposSchemaSha256',
  ]) assert.equal(readbackVerification[field], fixture.plan.protocol[field], `independent readback verification must carry ${field}`)

  const proposal = createConsumerBootstrapPromotionProposal(readback, {
    ...fixture,
    materializedRoot: fixture.outputRoot,
  })
  const managedReposSchema = JSON.parse(readFileSync(resolve(GOVERNANCE_ROOT, 'schemas/managed-repos.schema.json'), 'utf8'))
  const promotionProposalSchema = JSON.parse(readFileSync(resolve(GOVERNANCE_ROOT, 'schemas/consumer-bootstrap-promotion-proposal.schema.json'), 'utf8'))
  const proposalAjv = new Ajv2020({ allErrors: true, strict: false })
  proposalAjv.addSchema(managedReposSchema)
  const validatePublicProposalSchema = proposalAjv.compile(promotionProposalSchema)
  assert.equal(validatePublicProposalSchema(proposal), true, JSON.stringify(validatePublicProposalSchema.errors))
  const publicSchemaPoison = structuredClone(proposal)
  publicSchemaPoison.proposedInventory.unreviewed = 'poison'
  assert.equal(validatePublicProposalSchema(publicSchemaPoison), false, 'public promotion schema must close the complete proposed inventory after-image')
  const originalInventory = JSON.parse(fixture.inventoryBytes.toString('utf8'))
  const originalRepository = originalInventory.repositories.find(item => item.id === fixture.repoId)
  const proposedRepository = proposal.proposedInventory.repositories.find(item => item.id === fixture.repoId)
  assert.equal(originalRepository.upgradeProtocolProfile, 'legacy-bootstrap-v2')
  assert.equal(Object.hasOwn(originalRepository, 'acceptedBootstrapReadbackSha256'), false)
  assert.equal(proposedRepository.upgradeProtocolProfile, 'reviewed-bootstrap-established-v2')
  assert.equal(proposedRepository.acceptedBootstrapReadbackSha256, readbackVerification.acceptedBootstrapReadbackSha256)
  assert.equal(proposal.mutationAuthorized, false)
  assert.equal(
    validateConsumerBootstrapPromotionProposal(proposal, readback, {
      ...fixture,
      materializedRoot: fixture.outputRoot,
    }).proposalDigest,
    proposal.proposalDigest,
  )

  const coTamperedReadback = structuredClone(readback)
  coTamperedReadback.fullSnapshotPlanDigest = '9'.repeat(64)
  const coTamperedProposal = structuredClone(proposal)
  const substitutedReadbackDigest = consumerBootstrapReadbackSha256(coTamperedReadback)
  coTamperedProposal.binding.planDigest = coTamperedReadback.fullSnapshotPlanDigest
  coTamperedProposal.binding.acceptedBootstrapReadbackSha256 = substitutedReadbackDigest
  const coTamperedRepository = coTamperedProposal.proposedInventory.repositories.find(item => item.id === fixture.repoId)
  coTamperedRepository.acceptedBootstrapReadbackSha256 = substitutedReadbackDigest
  coTamperedProposal.proposedInventorySha256 = sha256(stableStringify(coTamperedProposal.proposedInventory, 0))
  const unsignedProposal = structuredClone(coTamperedProposal)
  delete unsignedProposal.proposalDigest
  coTamperedProposal.proposalDigest = sha256(`consumer-bootstrap-inventory-promotion-proposal-v1\0${stableStringify(unsignedProposal, 0)}`)
  assert.throws(
    () => validateConsumerBootstrapPromotionProposal(coTamperedProposal, coTamperedReadback, {
      ...fixture,
      materializedRoot: fixture.outputRoot,
    }),
    /stale or substituted materialization plan/,
  )
})

test('reviewed control-plane update materializes only a fresh full snapshot and acceptance establishes a chain-bound profile', t => {
  const fixture = controlPlaneFixture(t)
  assert.equal(
    fixture.plan.protocol.controlPlanePolicySha256,
    sha256(readFileSync(resolve(GOVERNANCE_ROOT, '../../scripts/lib/consumer-control-plane-policy.mjs'))),
    'reviewed plan must bind the exact shared protected-path policy bytes',
  )
  assert.equal(fixture.plan.reviewReady, true)
  assert.equal(fixture.plan.repository.sourceProfile, 'new-snapshot-v2')
  assert.equal(fixture.plan.repository.postUpdateProfile, 'new-snapshot-control-plane-established-v2')
  assert.equal(fixture.plan.repository.nextSequence, 1)
  assert.equal(fixture.plan.repository.predecessorReadbackSha256, null)
  assert.deepEqual(
    fixture.plan.protectedControlPlaneChanges,
    [
      { kind: 'package-scripts', path: 'package.json#scripts' },
      { kind: 'protected-path', path: '.github/' },
      { kind: 'protected-path', path: 'scripts/' },
    ],
  )
  assert.equal(validateConsumerControlPlaneUpdatePlan(fixture.plan).planDigest, fixture.plan.planDigest)
  const policySubstitution = structuredClone(fixture.plan)
  policySubstitution.protocol.controlPlanePolicySha256 = '9'.repeat(64)
  const unsignedPolicySubstitution = structuredClone(policySubstitution)
  delete unsignedPolicySubstitution.planDigest
  policySubstitution.planDigest = sha256(
    `consumer-control-plane-update-plan-v1\0${stableStringify(unsignedPolicySubstitution, 0)}`,
  )
  assert.throws(
    () => materializeConsumerControlPlaneUpdateSnapshot({
      ...fixture,
      plan: policySubstitution,
      expectedPlanDigest: policySubstitution.planDigest,
    }),
    /stale for the exact roots or governance sources|substituted despite its digest binding/,
  )
  assert.equal(existsSync(fixture.outputRoot), false)
  const beforeWorkflow = readFileSync(resolve(fixture.roots.current, '.github/workflows/audit.yml'), 'utf8')
  const snapshot = materializeConsumerControlPlaneUpdateSnapshot(fixture)
  assert.equal(snapshot.materializedSnapshotTreeSha256, fixture.plan.expectedSnapshot.treeSha256)
  const gitTreeCheckRoot = resolve(dirname(fixture.outputRoot), 'materialized-git-tree-check')
  cpSync(fixture.outputRoot, gitTreeCheckRoot, { recursive: true })
  commitSnapshot(gitTreeCheckRoot)
  assert.equal(
    snapshot.materializedGitTreeSha,
    execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: gitTreeCheckRoot, encoding: 'utf8' }).trim(),
  )
  assert.equal(existsSync(fixture.marker), false, 'candidate scripts are copied as data and never executed')
  assert.equal(readFileSync(resolve(fixture.roots.current, '.github/workflows/audit.yml'), 'utf8'), beforeWorkflow, 'live consumer root remains untouched')
  assert.equal(
    verifyMaterializedConsumerControlPlaneUpdateSnapshot({ plan: fixture.plan, materializedRoot: fixture.outputRoot }).verificationDigest,
    snapshot.verificationDigest,
  )

  const readback = controlPlaneReadback(fixture, snapshot.materializedSnapshotTreeSha256)
  const readbackVerification = validateIndependentConsumerControlPlaneUpdateReadback(readback, {
    ...fixture,
    materializedRoot: fixture.outputRoot,
  })
  assert.equal(readbackVerification.acceptedControlPlaneReadbackSha256, consumerControlPlaneUpdateReadbackSha256(readback))
  assert.equal(
    validateConsumerControlPlaneUpdateReadback(readback, {
      repository: fixture.inventory.repositories.find(item => item.id === fixture.repoId),
      candidateRelease: fixture.candidateRelease,
      releaseBom: fixture.releaseBom,
      protocol: loadConsumerUpgradeProtocol().protocol,
      sourceDigests: protocolSourceDigests(loadConsumerUpgradeProtocol()),
    }),
    readback,
  )
  const proposal = createConsumerControlPlaneUpdateAcceptanceProposal(readback, {
    ...fixture,
    materializedRoot: fixture.outputRoot,
  })
  const original = JSON.parse(fixture.inventoryBytes.toString('utf8')).repositories.find(item => item.id === fixture.repoId)
  const accepted = proposal.proposedInventory.repositories.find(item => item.id === fixture.repoId)
  assert.equal(original.upgradeProtocolProfile, 'new-snapshot-v2')
  assert.equal(Object.hasOwn(original, 'acceptedControlPlaneUpdate'), false)
  assert.equal(accepted.upgradeProtocolProfile, 'new-snapshot-control-plane-established-v2')
  assert.deepEqual(accepted.acceptedControlPlaneUpdate, {
    sequence: 1,
    readbackSha256: readbackVerification.acceptedControlPlaneReadbackSha256,
    predecessorReadbackSha256: null,
    candidateReleaseSha256: readbackVerification.candidateReleaseSha256,
    version: fixture.candidateRelease.version,
    baselineEvidenceSha256: readbackVerification.baselineEvidenceSha256,
    baseSnapshotTreeSha256: readbackVerification.baseSnapshotTreeSha256,
    incomingSnapshotTreeSha256: readbackVerification.incomingSnapshotTreeSha256,
    materializedSnapshotTreeSha256: snapshot.materializedSnapshotTreeSha256,
    candidateCorpusReceiptSha256: readbackVerification.candidateCorpusReceiptSha256,
    mergeCommitSha: readbackVerification.mergeCommitSha,
    mergeTreeSha: readbackVerification.mergeTreeSha,
    issuerRegistryDigest: readbackVerification.issuerRegistryDigest,
  })
  assert.equal(proposal.mutationAuthorized, false)
  assert.equal(
    validateConsumerControlPlaneUpdateAcceptanceProposal(proposal, readback, {
      ...fixture,
      materializedRoot: fixture.outputRoot,
    }).proposalDigest,
    proposal.proposalDigest,
  )
})

test('control-plane update repeats only by exact sequence/predecessor CAS and rejects replay, profile substitution, and ordinary-only work', t => {
  const first = controlPlaneFixture(t)
  const firstSnapshot = materializeConsumerControlPlaneUpdateSnapshot(first)
  const firstReadback = controlPlaneReadback(first, firstSnapshot.materializedSnapshotTreeSha256)
  const firstProposal = createConsumerControlPlaneUpdateAcceptanceProposal(firstReadback, {
    ...first,
    materializedRoot: first.outputRoot,
  })
  const second = controlPlaneFixture(t, {
    inventoryValue: firstProposal.proposedInventory,
    version: '1.2.4',
    sourceCommit: 'c'.repeat(40),
    sourceTree: 'd'.repeat(40),
    baseSourceRoot: first.roots.incoming,
    trust: first.trust,
  })
  assert.equal(second.plan.repository.sourceProfile, 'new-snapshot-control-plane-established-v2')
  assert.equal(second.plan.repository.postUpdateProfile, 'new-snapshot-control-plane-established-v2')
  assert.equal(second.plan.repository.nextSequence, 2)
  assert.equal(
    second.plan.repository.predecessorReadbackSha256,
    firstProposal.binding.acceptedControlPlaneReadbackSha256,
  )
  const secondSnapshot = materializeConsumerControlPlaneUpdateSnapshot(second)
  const secondReadback = controlPlaneReadback(second, secondSnapshot.materializedSnapshotTreeSha256)
  const secondProposal = createConsumerControlPlaneUpdateAcceptanceProposal(secondReadback, {
    ...second,
    materializedRoot: second.outputRoot,
  })
  assert.equal(secondProposal.proposedInventory.repositories.find(item => item.id === second.repoId).acceptedControlPlaneUpdate.sequence, 2)

  assert.throws(
    () => validateIndependentConsumerControlPlaneUpdateReadback(firstReadback, {
      ...second,
      materializedRoot: second.outputRoot,
    }),
    /profile transition|exact accepted chain head|immutable candidate|stale or substituted/,
  )
  const wrongPredecessor = structuredClone(secondReadback)
  wrongPredecessor.predecessorReadbackSha256 = 'f'.repeat(64)
  assert.throws(
    () => validateIndependentConsumerControlPlaneUpdateReadback(wrongPredecessor, {
      ...second,
      materializedRoot: second.outputRoot,
    }),
    /exact accepted chain head/,
  )
  const missingHead = structuredClone(firstProposal.proposedInventory)
  delete missingHead.repositories.find(item => item.id === second.repoId).acceptedControlPlaneUpdate
  assert.throws(
    () => createConsumerControlPlaneUpdatePlan({ ...second, inventoryBytes: Buffer.from(`${stableStringify(missingHead, 2)}\n`) }),
    /schema validation failed|accepted control-plane update binding/,
  )

  assert.throws(
    () => controlPlaneFixture(t, { ordinaryOnly: true }),
    /has no protected control-plane change; use ordinary sync-all/,
  )

  const ordinaryOnly = controlPlaneFixture(t)
  const legacy = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
  assert.throws(
    () => createConsumerControlPlaneUpdatePlan({
      ...ordinaryOnly,
      repoId: 'work-management',
      inventoryBytes: Buffer.from(`${stableStringify(legacy, 2)}\n`),
    }),
    /not assigned to the recurring reviewed control-plane update protocol/,
  )
})

test('reviewed-bootstrap lineage is preserved when it first enters the recurring control-plane chain', t => {
  const managed = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
  const repository = managed.repositories.find(item => item.id === 'work-management')
  repository.upgradeProtocolProfile = 'reviewed-bootstrap-established-v2'
  repository.acceptedBootstrapReadbackSha256 = '9'.repeat(64)
  delete repository.acceptedControlPlaneUpdate
  const fixture = controlPlaneFixture(t, { inventoryValue: managed })
  assert.equal(fixture.plan.repository.postUpdateProfile, 'reviewed-bootstrap-control-plane-established-v2')
  const snapshot = materializeConsumerControlPlaneUpdateSnapshot(fixture)
  writeFileSync(resolve(fixture.roots.current, '.env'), 'POST_PLAN_SECRET=poison\n')
  assert.equal(
    verifyMaterializedConsumerControlPlaneUpdateSnapshot({
      plan: fixture.plan,
      materializedRoot: fixture.outputRoot,
    }).materializedSnapshotTreeSha256,
    snapshot.materializedSnapshotTreeSha256,
    'plan-only verification demonstrates why the public standalone command must recompute full source context',
  )
  assert.throws(
    () => verifyContextualConsumerControlPlaneUpdateSnapshot({
      ...fixture,
      materializedRoot: fixture.outputRoot,
    }),
    /clean tracked-only snapshot/,
  )
  rmSync(resolve(fixture.roots.current, '.env'))
  const readback = controlPlaneReadback(fixture, snapshot.materializedSnapshotTreeSha256)
  const proposal = createConsumerControlPlaneUpdateAcceptanceProposal(readback, {
    ...fixture,
    materializedRoot: fixture.outputRoot,
  })
  const accepted = proposal.proposedInventory.repositories.find(item => item.id === fixture.repoId)
  assert.equal(accepted.upgradeProtocolProfile, 'reviewed-bootstrap-control-plane-established-v2')
  assert.equal(accepted.acceptedBootstrapReadbackSha256, '9'.repeat(64))
  assert.equal(accepted.acceptedControlPlaneUpdate.sequence, 1)
})

test('control-plane poison evidence is fail-closed before acceptance', t => {
  const fixture = controlPlaneFixture(t)
  assert.throws(
    () => createConsumerControlPlaneUpdatePlan({ ...fixture, baselineReceipt: undefined }),
    /first recurring control-plane update requires a verifiable signed baseline receipt/,
  )

  writeFileSync(resolve(fixture.roots.current, '.env'), 'SECRET=poison\n')
  assert.throws(
    () => createConsumerControlPlaneUpdatePlan(fixture),
    /clean tracked-only snapshot/,
  )
  rmSync(resolve(fixture.roots.current, '.env'))

  const incomingScript = resolve(fixture.roots.incoming, 'scripts/sync-all.mjs')
  const originalIncomingScript = readFileSync(incomingScript)
  writeFileSync(incomingScript, 'export const substituted = true\n')
  assert.throws(
    () => createConsumerControlPlaneUpdatePlan(fixture),
    /scaffold bytes\/mode drifted/,
  )
  writeFileSync(incomingScript, originalIncomingScript)
  chmodSync(incomingScript, 0o755)

  const snapshot = materializeConsumerControlPlaneUpdateSnapshot(fixture)
  const readback = controlPlaneReadback(fixture, snapshot.materializedSnapshotTreeSha256)
  const freeDigest = structuredClone(readback)
  freeDigest.requiredChecksDigest = '3'.repeat(64)
  assert.throws(
    () => validateIndependentConsumerControlPlaneUpdateReadback(freeDigest, {
      ...fixture,
      materializedRoot: fixture.outputRoot,
    }),
    /schema validation failed|invalid or open shape/,
  )

  const unexpectedHumanApproval = structuredClone(readback)
  unexpectedHumanApproval.requiredApprovingReviewCount = 1
  unexpectedHumanApproval.reviews = [{
    actorId: 'control-plane-reviewer-1',
    state: 'APPROVED',
    commitSha: '5'.repeat(40),
    reviewDigest: '9'.repeat(64),
    submittedAt: '2026-07-20T01:40:00.000Z',
  }]
  unexpectedHumanApproval.signatures = []
  signControlPlaneReceipt(unexpectedHumanApproval, fixture.trust)
  assert.throws(
    () => validateIndependentConsumerControlPlaneUpdateReadback(unexpectedHumanApproval, {
      ...fixture,
      materializedRoot: fixture.outputRoot,
    }),
    /schema validation failed|must not introduce a GitHub human-approval gate|approval set must be empty/,
  )

  const expired = structuredClone(readback)
  expired.expiresAt = '2026-07-20T03:30:00.000Z'
  expired.signatures = []
  signControlPlaneReceipt(expired, fixture.trust)
  assert.throws(
    () => validateIndependentConsumerControlPlaneUpdateReadback(expired, {
      ...fixture,
      materializedRoot: fixture.outputRoot,
    }),
    /is expired/,
  )

  const postSignatureSubstitution = structuredClone(readback)
  postSignatureSubstitution.mergeTreeSha = '8'.repeat(40)
  assert.throws(
    () => validateIndependentConsumerControlPlaneUpdateReadback(postSignatureSubstitution, {
      ...fixture,
      materializedRoot: fixture.outputRoot,
    }),
    /stale or substituted materialized snapshot/,
  )
})

test('recurring control-plane lineage rejects an independent second base even with a valid prior acceptance', t => {
  const first = controlPlaneFixture(t)
  const firstSnapshot = materializeConsumerControlPlaneUpdateSnapshot(first)
  const firstReadback = controlPlaneReadback(first, firstSnapshot.materializedSnapshotTreeSha256)
  const firstProposal = createConsumerControlPlaneUpdateAcceptanceProposal(firstReadback, {
    ...first,
    materializedRoot: first.outputRoot,
  })
  assert.throws(
    () => controlPlaneFixture(t, {
      inventoryValue: firstProposal.proposedInventory,
      version: '1.2.4',
      sourceCommit: 'c'.repeat(40),
      sourceTree: 'd'.repeat(40),
      trust: first.trust,
    }),
    /next base snapshot does not equal the previous accepted incoming candidate corpus/,
  )
})

import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  externalHardGateContractDigest,
  externalManagedControlPlaneDigest,
  externalManagedSessionDigest,
  externalRepositoryReadbackDigest,
  externalSurfaceDistributionIdentityDigest,
  externalSurfaceEvidenceSigningPayload,
} from '../lib/external-surface-evidence.mjs'
import {
  createExternalActivationProposal,
  createExternalActivationSigningRequest,
  createExternalCertificationProposal,
  createReviewedExternalActivationHandoff,
  createReviewedExternalCertificationHandoff,
  materializeExternalSurfaceReceipt,
  validateExternalActivationSignatureBundle,
} from '../lib/external-operator.mjs'
import { externalActivationPolicyDigest } from '../lib/external-activation.mjs'
import {
  createExternalLedgerRunArtifactIdentityReceipt,
  createExternalLedgerWriterDispatch,
  createExternalLedgerWriterPlan,
  executeExternalLedgerWriterTransaction,
  externalLedgerWriterTestHarness,
  parseExternalLedgerHandoffCommitMessage,
  validateExternalLedgerRunArtifactApiSnapshot,
} from '../lib/external-ledger-writer.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import { readJson, sha256, stableStringify } from '../lib/common.mjs'
import { runtimeTargetDigest } from '../lib/provider-runtime-conformance.mjs'
import {
  externalLedgerWriterCliTestHarness,
  run as runWriterCli,
} from '../bin/external-ledger-writer.mjs'

const GOVERNANCE_ROOT = resolve(import.meta.dirname, '..')
const REPO_ROOT = resolve(GOVERNANCE_ROOT, '..', '..')
const NOW = new Date('2026-07-23T00:10:00.000Z')
const GENERATED_AT = '2026-07-23T00:00:00.000Z'
const CERTIFIED_AT = '2026-07-23T00:05:00.000Z'
const EXPIRES_AT = '2026-07-23T12:00:00.000Z'
const EXPECTED_BASE_COMMIT = 'f'.repeat(40)
const EXPECTED_BASE_TREE = '1'.repeat(40)
const REPOSITORY = 'ajenchen/design-system'

function canonicalBytes(value) {
  return Buffer.from(`${stableStringify(value)}\n`)
}

function loadModels() {
  return {
    certifications: readJson(resolve(GOVERNANCE_ROOT, 'providers/certifications.json')),
    activationLedger: readJson(resolve(GOVERNANCE_ROOT, 'external-activation-requirements.json')),
    inventory: readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json')),
    desired: readJson(resolve(GOVERNANCE_ROOT, 'desired/github.json')),
    matrix: readJson(resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json')),
    runtimeProfile: readJson(resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json')),
    roleSurfacePolicy: readJson(resolve(GOVERNANCE_ROOT, 'providers/role-surface-policy.json')),
    rings: readJson(resolve(GOVERNANCE_ROOT, 'release-rings.json')),
    activationPolicy: readJson(resolve(GOVERNANCE_ROOT, 'external-activation-policy.json')),
    mutationBoundaryContract: readJson(resolve(
      GOVERNANCE_ROOT,
      'providers/github-mutation-boundary-contract.json',
    )),
  }
}

function fixtureContext() {
  const models = loadModels()
  models.activationLedger.policy.sha256 = externalActivationPolicyDigest(models.activationPolicy)
  const policyById = new Map(models.activationPolicy.requirements.map(item => [item.id, item]))
  for (const requirement of models.activationLedger.requirements) {
    const policy = policyById.get(requirement.id)
    assert(policy)
    for (const key of [
      'id',
      'kind',
      'repository',
      'desiredPath',
      'requiredFor',
      'condition',
      'reason',
    ]) requirement[key] = structuredClone(policy[key])
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const applyKeys = generateKeyPairSync('ed25519')
  const issuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [
      {
        keyId: 'activation-apply-fixture',
        subject: 'independent-activation-apply-authorizer',
        publicKeySpki: applyKeys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        roles: ['apply-authorizer'],
        status: 'active',
        notBefore: '2026-01-01T00:00:00.000Z',
        notAfter: '2030-01-01T00:00:00.000Z',
        revokedAt: null,
      },
      {
        keyId: 'external-writer-fixture',
        subject: 'independent-external-writer-fixture',
        publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        roles: ['runtime-evidence-issuer', 'completion-attestor'],
        status: 'active',
        notBefore: '2026-01-01T00:00:00.000Z',
        notAfter: '2030-01-01T00:00:00.000Z',
        revokedAt: null,
      },
    ],
  }
  models.runtimeProfile.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  models.runtimeProfile.allowedKeyIds = ['external-writer-fixture']
  models.runtimeProfile.requiredIssuerQuorum = 1
  models.rings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  models.rings.attestationPolicy.allowedKeyIds = [
    'activation-apply-fixture',
    'external-writer-fixture',
  ]
  models.rings.attestationPolicy.applyAuthorizationQuorum = 1
  models.rings.attestationPolicy.completionAttestationQuorum = 1
  const runtimeIdentity = {
    gitCommit: 'a'.repeat(40),
    gitTree: 'b'.repeat(40),
    profileDigest: `sha256:${sha256(stableStringify(models.runtimeProfile, 0))}`,
    harnessDigest: `sha256:${'c'.repeat(64)}`,
  }
  return { ...models, issuerRegistry, privateKey, runtimeIdentity }
}

function signedSurfaceReceipt(ctx) {
  const profile = ctx.runtimeProfile.providers.find(item => item.id === 'codex-cloud')
  const target = profile.certificationTargets[0]
  const repository = ctx.inventory.repositories.find(item => item.role === 'authority')
  const distribution = {
    authority: profile.distributionVersionAuthority.authority,
    productId: profile.distributionVersionAuthority.productId,
    version: profile.distributionVersionAuthority.version,
    identityDigest: null,
  }
  distribution.identityDigest = externalSurfaceDistributionIdentityDigest(distribution)
  const evidence = {
    schemaVersion: 1,
    kind: 'external-runtime-surface-conformance',
    status: 'pass',
    profile: {
      id: profile.id,
      adapterProviderId: profile.adapterProviderId,
      runtimeKind: profile.runtimeKind,
      surface: profile.certificationSurface,
      repositoryId: repository.id,
      repository: repository.github,
      repositoryRole: repository.role,
    },
    run: {
      runId: '10000000-0000-4000-8000-000000000001',
      generatedAt: GENERATED_AT,
      validUntil: new Date(
        new Date(GENERATED_AT).getTime() + ctx.runtimeProfile.maxEvidenceAgeSeconds * 1000,
      ).toISOString(),
      operatingSystem: target.operatingSystem,
      platform: target.platform,
      arch: target.arch,
      executionEnvironment: target.executionEnvironment,
      pathClass: target.pathClass,
      targetId: target.id,
      targetDigest: runtimeTargetDigest(target),
    },
    subject: {
      gitCommit: 'd'.repeat(40),
      gitTree: 'e'.repeat(40),
      profileDigest: ctx.runtimeIdentity.profileDigest,
      harnessDigest: ctx.runtimeIdentity.harnessDigest,
      hardGateContractDigest: externalHardGateContractDigest(ctx.matrix, repository.role),
    },
    distribution,
    checks: profile.checks.map(check => ({
      id: check.id,
      driver: check.driver,
      status: 'pass',
      receiptSha256: '0'.repeat(64),
    })),
    surfaceBinding: {
      kind: 'managed-runtime-readback',
      repositoryId: repository.id,
      repository: repository.github,
      repositoryRole: repository.role,
      defaultBranch: repository.defaultBranch,
      sessionIdentitySha256: '0'.repeat(64),
      repositoryReadbackSha256: '0'.repeat(64),
      distributionReadbackSha256: distribution.identityDigest.slice('sha256:'.length),
      hardGateReceiptSha256: sha256('external-writer-hard-gate'),
      controlPlaneReadbackSha256: '0'.repeat(64),
    },
    attestation: null,
    evidenceDigest: null,
  }
  const setReceipt = (driver, digest) => {
    const check = evidence.checks.find(item => item.driver === driver)
    assert(check)
    check.receiptSha256 = digest
  }
  evidence.surfaceBinding.repositoryReadbackSha256 = externalRepositoryReadbackDigest(
    repository,
    evidence.subject,
  )
  setReceipt('external-distribution-identity', evidence.surfaceBinding.distributionReadbackSha256)
  setReceipt('external-hard-gate-receipt', evidence.surfaceBinding.hardGateReceiptSha256)
  evidence.surfaceBinding.sessionIdentitySha256 = externalManagedSessionDigest(evidence)
  setReceipt('external-runtime-session-binding', evidence.surfaceBinding.sessionIdentitySha256)
  evidence.surfaceBinding.controlPlaneReadbackSha256 = externalManagedControlPlaneDigest(evidence)
  const { attestation: ignoredAttestation, evidenceDigest: ignoredDigest, ...unsigned } = evidence
  evidence.evidenceDigest = `sha256:${sha256(stableStringify(unsigned, 0))}`
  evidence.attestation = {
    schemaVersion: 1,
    kind: 'external-runtime-surface-evidence-attestation',
    status: 'verified',
    issuerId: 'external-writer-fixture',
    issuerRegistryDigest: ctx.runtimeProfile.issuerRegistryDigest,
    algorithm: 'ed25519',
    evidenceDigest: evidence.evidenceDigest,
    runId: evidence.run.runId,
    signature: '',
    coSignatures: [],
  }
  evidence.attestation.signature = sign(
    null,
    externalSurfaceEvidenceSigningPayload(evidence, evidence.attestation.issuerId),
    ctx.privateKey,
  ).toString('base64')
  return evidence
}

function makeRepoRoot(ctx) {
  const root = mkdtempSync(resolve(tmpdir(), 'external-ledger-writer-'))
  mkdirSync(resolve(root, 'infra/governance/providers'), { recursive: true })
  writeFileSync(
    resolve(root, 'infra/governance/providers/certifications.json'),
    canonicalBytes(ctx.certifications),
  )
  writeFileSync(
    resolve(root, 'infra/governance/external-activation-requirements.json'),
    canonicalBytes(ctx.activationLedger),
  )
  return root
}

function validationOptions(ctx, repoRoot) {
  return {
    repoRoot,
    certifications: ctx.certifications,
    activationLedger: ctx.activationLedger,
    inventory: ctx.inventory,
    desired: ctx.desired,
    matrix: ctx.matrix,
    runtimeProfile: ctx.runtimeProfile,
    roleSurfacePolicy: ctx.roleSurfacePolicy,
    rings: ctx.rings,
    issuerRegistry: ctx.issuerRegistry,
    activationPolicy: ctx.activationPolicy,
    mutationBoundaryContract: ctx.mutationBoundaryContract,
    runtimeIdentity: ctx.runtimeIdentity,
  }
}

function certificationFixture({
  baseCommit = EXPECTED_BASE_COMMIT,
  baseTree = EXPECTED_BASE_TREE,
} = {}) {
  const ctx = fixtureContext()
  const repoRoot = makeRepoRoot(ctx)
  const evidence = signedSurfaceReceipt(ctx)
  const imported = materializeExternalSurfaceReceipt(canonicalBytes(evidence), {
    repoRoot,
    runtimeProfile: ctx.runtimeProfile,
    issuerRegistry: ctx.issuerRegistry,
    now: NOW,
  })
  const options = validationOptions(ctx, repoRoot)
  const proposal = createExternalCertificationProposal({
    ...options,
    reference: imported.reference,
    artifactSha256: imported.artifactSha256,
    certifiedAt: CERTIFIED_AT,
    expiresAt: EXPIRES_AT,
    now: NOW,
  })
  const handoff = createReviewedExternalCertificationHandoff({
    ...options,
    reviewedProposal: proposal,
    expectedProposalDigest: proposal.proposalDigest,
    expectedBaseCommit: baseCommit,
    currentBaseCommit: baseCommit,
    expectedBaseTree: baseTree,
    currentBaseTree: baseTree,
    baseLedgerSha256: proposal.ledger.beforeSha256,
    now: NOW,
  })
  const dispatch = createExternalLedgerWriterDispatch({
    handoff,
    currentBaseCommit: baseCommit,
    currentBaseTree: baseTree,
    baseLedgerSha256: proposal.ledger.beforeSha256,
    now: NOW,
    validationOptions: options,
  })
  const planned = createExternalLedgerWriterPlan({
    request: dispatch,
    repository: REPOSITORY,
    currentBaseCommit: baseCommit,
    currentBaseTree: baseTree,
    baseLedgerSha256: proposal.ledger.beforeSha256,
    now: NOW,
    validationOptions: options,
  })
  return { ctx, repoRoot, options, proposal, handoff, dispatch, planned, imported }
}

function activationFixture() {
  const ctx = fixtureContext()
  const repoRoot = makeRepoRoot(ctx)
  const options = validationOptions(ctx, repoRoot)
  const signingRequest = createExternalActivationSigningRequest({
    ...options,
    requirementId: 'activate-independent-finalizer-signed-authority',
    observedResource: {
      allowedKeyIds: ['release-authorizer-a'],
      quorum: 1,
      issuerRegistryDigest: issuerRegistryDigest(ctx.issuerRegistry),
    },
    observedAt: '2026-07-23T00:00:00.000Z',
    expiresAt: '2026-07-24T00:00:00.000Z',
    now: NOW,
  })
  const bundle = {
    $schema: '../schemas/external-activation-signature-bundle.schema.json',
    schemaVersion: 1,
    kind: 'external-activation-signature-bundle',
    requestDigest: signingRequest.requestDigest,
    signatures: [{
      signerKeyId: 'external-writer-fixture',
      subject: 'independent-external-writer-fixture',
      signature: sign(
        null,
        Buffer.from(signingRequest.signingPayloadBase64, 'base64'),
        ctx.privateKey,
      ).toString('base64url'),
    }],
  }
  const signatures = validateExternalActivationSignatureBundle(bundle, signingRequest)
  const proposal = createExternalActivationProposal({
    ...options,
    signingRequest,
    signatures,
    now: NOW,
  })
  const handoff = createReviewedExternalActivationHandoff({
    ...options,
    reviewedProposal: proposal,
    signingRequest,
    expectedProposalDigest: proposal.proposalDigest,
    expectedBaseCommit: EXPECTED_BASE_COMMIT,
    currentBaseCommit: EXPECTED_BASE_COMMIT,
    expectedBaseTree: EXPECTED_BASE_TREE,
    currentBaseTree: EXPECTED_BASE_TREE,
    baseLedgerSha256: proposal.ledger.beforeSha256,
    now: NOW,
  })
  const dispatch = createExternalLedgerWriterDispatch({
    handoff,
    currentBaseCommit: EXPECTED_BASE_COMMIT,
    currentBaseTree: EXPECTED_BASE_TREE,
    baseLedgerSha256: proposal.ledger.beforeSha256,
    now: NOW,
    validationOptions: options,
  })
  const planned = createExternalLedgerWriterPlan({
    request: dispatch,
    repository: REPOSITORY,
    currentBaseCommit: EXPECTED_BASE_COMMIT,
    currentBaseTree: EXPECTED_BASE_TREE,
    baseLedgerSha256: proposal.ledger.beforeSha256,
    now: NOW,
    validationOptions: options,
  })
  return {
    ctx,
    repoRoot,
    options,
    proposal,
    signingRequest,
    handoff,
    dispatch,
    planned,
  }
}

function git(root, args, { env = {}, encoding = 'utf8' } = {}) {
  const result = spawnSync('/usr/bin/git', args, {
    cwd: root,
    encoding,
    env: { ...process.env, ...env },
  })
  assert.equal(result.status, 0, result.stderr?.toString() ?? '')
  return typeof result.stdout === 'string' ? result.stdout.trim() : result.stdout
}

function writerArtifactReceipt(handoff, {
  runId = '7001',
  runAttempt = '1',
  artifactId = '8001',
  artifactDigest = '9'.repeat(64),
  verifiedAt = NOW,
} = {}) {
  const identity = {
    repository: REPOSITORY,
    workflow: {
      path: '.github/workflows/external-ledger-writer.yml',
      event: 'repository_dispatch',
      headBranch: 'main',
      runId,
      runAttempt: Number(runAttempt),
      headSha: handoff.gitTransaction.expectedBaseCommit,
      status: 'in_progress',
      conclusion: null,
    },
    artifact: {
      id: artifactId,
      name: `external-ledger-${runId}-${runAttempt}`,
      digest: `sha256:${artifactDigest}`,
      sizeInBytes: 4096,
      createdAt: '2026-07-23T00:09:00.000Z',
      expiresAt: '2026-08-22T00:09:00.000Z',
    },
  }
  return {
    receipt: createExternalLedgerRunArtifactIdentityReceipt(identity, { now: verifiedAt }),
    binding: {
      runId,
      runAttempt,
      id: artifactId,
      digest: artifactDigest,
      name: identity.artifact.name,
    },
  }
}

function writerIdentity(overrides = {}) {
  return {
    appId: '202',
    appSlug: 'qijenchen-governance-writer',
    installationId: '2001',
    actionSha: 'fee1f7d63c2ff003460e3d139729b119787bc349',
    desiredAppId: '202',
    signedProbeAppId: '202',
    signedProbeInstallationId: '2001',
    signedActivationEvidenceSha256: '8'.repeat(64),
    signedActivationObservedAt: '2026-07-23T00:00:00.000Z',
    signedActivationExpiresAt: '2026-07-23T01:00:00.000Z',
    ...overrides,
  }
}

function gitObjectId(label) {
  return createHash('sha1').update(label).digest('hex')
}

function virtualTree(files, { rootSha, namespace }) {
  const root = { directories: new Map(), files: new Map() }
  for (const [path, file] of files) {
    const segments = path.split('/')
    let node = root
    for (const segment of segments.slice(0, -1)) {
      if (!node.directories.has(segment)) {
        node.directories.set(segment, { directories: new Map(), files: new Map() })
      }
      node = node.directories.get(segment)
    }
    node.files.set(segments.at(-1), file)
  }
  const trees = new Map()
  function visit(node, prefix = [], forcedSha = null) {
    const entries = []
    for (const [name, child] of [...node.directories].sort(([left], [right]) => (
      Buffer.compare(Buffer.from(left), Buffer.from(right))
    ))) {
      const childSha = visit(child, prefix.concat(name))
      entries.push({ path: name, mode: '040000', type: 'tree', sha: childSha })
    }
    for (const [name, file] of [...node.files].sort(([left], [right]) => (
      Buffer.compare(Buffer.from(left), Buffer.from(right))
    ))) entries.push({ path: name, ...file })
    const sha = forcedSha ?? gitObjectId(`${namespace}:${prefix.join('/')}:${stableStringify(entries, 0)}`)
    trees.set(sha, { sha, truncated: false, tree: entries })
    return sha
  }
  visit(root, [], rootSha)
  return trees
}

function contentResponse(path, bytes) {
  return {
    type: 'file',
    path,
    sha: externalLedgerWriterTestHarness.gitBlobSha(bytes),
    encoding: 'base64',
    content: bytes.toString('base64'),
  }
}

function createWriterRemote(fixture, {
  extraBaseFiles = new Map(),
  extraHeadFiles = new Map(),
  openPullRequests = [],
  installationRepositories = [REPOSITORY],
  poisonCommit = null,
  poisonPullRequest = null,
  advanceBaseBeforeRef = false,
} = {}) {
  const { planned, handoff } = fixture
  const baseCommit = handoff.gitTransaction.expectedBaseCommit
  const baseTree = handoff.gitTransaction.expectedBaseTree
  const headTree = '2'.repeat(40)
  const headCommit = '3'.repeat(40)
  const branch = planned.plan.gitTransaction.branch
  const ledgerBefore = handoff.ledger.path.endsWith('certifications.json')
    ? canonicalBytes(fixture.ctx.certifications)
    : canonicalBytes(fixture.ctx.activationLedger)
  const baseFiles = new Map([
    ['README.md', {
      mode: '100644',
      type: 'blob',
      sha: externalLedgerWriterTestHarness.gitBlobSha(Buffer.from('authority\n')),
    }],
    [handoff.ledger.path, {
      mode: '100644',
      type: 'blob',
      sha: externalLedgerWriterTestHarness.gitBlobSha(ledgerBefore),
    }],
  ])
  for (const [path, file] of extraBaseFiles) baseFiles.set(path, file)
  const headFiles = new Map(baseFiles)
  for (const change of planned.plan.changes) {
    headFiles.set(change.path, {
      mode: change.mode,
      type: change.type,
      sha: change.gitBlobSha,
    })
  }
  for (const [path, file] of extraHeadFiles) headFiles.set(path, file)
  const trees = new Map([
    ...virtualTree(baseFiles, { rootSha: baseTree, namespace: 'base' }),
    ...virtualTree(headFiles, { rootSha: headTree, namespace: 'head' }),
  ])
  const headContent = new Map(
    [...planned.changeBytes].map(([path, bytes]) => [path, Buffer.from(bytes)]),
  )
  const mutationLog = []
  const state = {
    main: baseCommit,
    branch: null,
    pullRequest: null,
    commits: new Map([[
      baseCommit,
      {
        sha: baseCommit,
        tree: { sha: baseTree },
        parents: [],
        message: 'protected base',
        author: null,
        committer: null,
      },
    ]]),
  }
  const repositoryPrefix = `/repos/${REPOSITORY}`

  function pullResponse(body, number = 1) {
    const response = {
      number,
      state: 'open',
      draft: false,
      title: body.title,
      body: body.body,
      maintainer_can_modify: false,
      base: {
        ref: body.base,
        sha: baseCommit,
        repo: { full_name: REPOSITORY },
      },
      head: {
        ref: body.head,
        sha: headCommit,
        repo: { full_name: REPOSITORY },
        user: { login: 'ajenchen' },
      },
      user: {
        login: 'qijenchen-governance-writer[bot]',
        type: 'Bot',
      },
      html_url: `https://github.com/${REPOSITORY}/pull/${number}`,
    }
    if (poisonPullRequest) poisonPullRequest(response)
    return response
  }

  async function requestJson(path, { allow404 = false } = {}) {
    if (path === repositoryPrefix) {
      return {
        full_name: REPOSITORY,
        default_branch: 'main',
        owner: { login: 'ajenchen' },
      }
    }
    if (path === '/installation/repositories?per_page=100') {
      return {
        total_count: installationRepositories.length,
        repositories: installationRepositories.map(repository => ({
          full_name: repository,
          owner: { login: repository.split('/')[0] },
        })),
      }
    }
    if (path === `${repositoryPrefix}/git/ref/heads/main`) {
      return {
        ref: 'refs/heads/main',
        object: { type: 'commit', sha: state.main },
      }
    }
    const encodedBranch = branch.split('/').map(encodeURIComponent).join('/')
    if (path === `${repositoryPrefix}/git/ref/heads/${encodedBranch}`) {
      if (state.branch === null && allow404) return null
      return {
        ref: `refs/heads/${branch}`,
        object: { type: 'commit', sha: state.branch },
      }
    }
    if (path.startsWith(`${repositoryPrefix}/git/commits/`)) {
      return structuredClone(state.commits.get(path.slice(path.lastIndexOf('/') + 1)))
    }
    if (path.startsWith(`${repositoryPrefix}/git/trees/`)) {
      return structuredClone(trees.get(path.slice(path.lastIndexOf('/') + 1)))
    }
    if (path.startsWith(`${repositoryPrefix}/contents/`)) {
      const url = new URL(`https://api.github.test${path}`)
      const relative = decodeURIComponent(
        url.pathname.slice(`${repositoryPrefix}/contents/`.length),
      )
      const ref = url.searchParams.get('ref')
      if (ref === baseCommit) {
        assert.equal(relative, handoff.ledger.path)
        return contentResponse(relative, ledgerBefore)
      }
      assert.equal(ref, headCommit)
      const bytes = headContent.get(relative)
      assert(bytes, `missing virtual head content: ${relative}`)
      return contentResponse(relative, bytes)
    }
    if (path === `${repositoryPrefix}/pulls?state=open&per_page=100`) {
      return state.pullRequest
        ? [structuredClone(state.pullRequest)]
        : structuredClone(openPullRequests)
    }
    if (path.startsWith(`${repositoryPrefix}/pulls/`)) {
      return structuredClone(state.pullRequest)
    }
    throw new Error(`Unexpected virtual GitHub read: ${path}`)
  }

  async function requestMutation(method, path, body) {
    mutationLog.push({ method, path, body: structuredClone(body) })
    assert.equal(method, 'POST')
    if (path === `${repositoryPrefix}/git/trees`) {
      assert.equal(body.base_tree, baseTree)
      assert.deepEqual(
        body.tree.map(entry => [entry.path, entry.mode, entry.type, entry.content]),
        planned.plan.changes.map(change => [
          change.path,
          change.mode,
          change.type,
          planned.changeBytes.get(change.path).toString('utf8'),
        ]),
      )
      return { sha: headTree }
    }
    if (path === `${repositoryPrefix}/git/commits`) {
      assert.equal(body.message, planned.commitMessage)
      assert.equal(body.tree, headTree)
      assert.deepEqual(body.parents, [baseCommit])
      const commit = {
        sha: headCommit,
        tree: { sha: headTree },
        parents: [{ sha: baseCommit }],
        message: body.message,
        author: structuredClone(body.author),
        committer: structuredClone(body.committer),
      }
      if (poisonCommit) poisonCommit(commit)
      state.commits.set(headCommit, commit)
      if (advanceBaseBeforeRef) state.main = '4'.repeat(40)
      return { sha: headCommit }
    }
    if (path === `${repositoryPrefix}/git/refs`) {
      assert.equal(body.ref, `refs/heads/${branch}`)
      assert.equal(body.sha, headCommit)
      state.branch = headCommit
      return {
        ref: body.ref,
        object: { type: 'commit', sha: headCommit },
      }
    }
    if (path === `${repositoryPrefix}/pulls`) {
      state.pullRequest = pullResponse(body)
      return structuredClone(state.pullRequest)
    }
    throw new Error(`Unexpected virtual GitHub mutation: ${method} ${path}`)
  }

  return {
    requestJson,
    requestMutation,
    mutationLog,
    state,
    headCommit,
    headTree,
    branch,
  }
}

test('certification and activation handoffs produce closed non-authorizing plans with exact atomic paths', () => {
  const certification = certificationFixture()
  const activation = activationFixture()
  try {
    assert.equal(certification.planned.plan.mutationAuthorized, false)
    assert.equal(certification.planned.plan.directDefaultBranchWriteAllowed, false)
    assert.equal(certification.planned.plan.mergeAllowed, false)
    assert.equal(certification.planned.plan.reviewAllowed, false)
    assert.deepEqual(
      certification.planned.plan.changes.map(change => [change.baseState, change.path]),
      [
        ['absent', certification.imported.reference],
        ['existing-different', 'infra/governance/providers/certifications.json'],
      ],
    )
    assert.deepEqual(
      activation.planned.plan.changes.map(change => [change.baseState, change.path]),
      [['existing-different', 'infra/governance/external-activation-requirements.json']],
    )
    assert.equal(certification.planned.plan.commit.handoffDigest, certification.handoff.handoffDigest)
    assert.match(
      certification.planned.plan.commit.subject,
      /^chore\(governance\): apply reviewed certification [a-f0-9]{12}$/,
    )
    assert.equal('message' in certification.planned.plan.commit, false)
    assert.equal(certification.planned.plan.pullRequest.maintainerCanModify, false)

    const ajv = new Ajv2020({ allErrors: true, strict: true })
    addFormats(ajv)
    const validatePlan = ajv.compile(readJson(resolve(
      GOVERNANCE_ROOT,
      'schemas/external-ledger-writer-plan.schema.json',
    )))
    assert.equal(
      validatePlan(certification.planned.plan),
      true,
      JSON.stringify(validatePlan.errors),
    )
    assert.equal(validatePlan(activation.planned.plan), true, JSON.stringify(validatePlan.errors))
  } finally {
    rmSync(certification.repoRoot, { recursive: true, force: true })
    rmSync(activation.repoRoot, { recursive: true, force: true })
  }
})

test('provider review certification uses one exact four-path transaction and one existing carrier protocol', () => {
  const runtimeEvidenceBytes = canonicalBytes({
    kind: 'provider-runtime-evidence-fixture',
    schemaVersion: 1,
  })
  const capabilityEvidenceBytes = canonicalBytes({
    kind: 'provider-review-capability-evidence-fixture',
    schemaVersion: 1,
  })
  const runtimeSha256 = sha256(runtimeEvidenceBytes)
  const capabilitySha256 = sha256(capabilityEvidenceBytes)
  const runtimePath =
    `infra/governance/evidence/provider-runtime/${runtimeSha256}.json`
  const capabilityPath =
    `infra/governance/evidence/review-capability/${capabilitySha256}.json`
  const providerLedgerPath = 'infra/governance/providers/certifications.json'
  const reviewLedgerPath =
    'infra/governance/providers/review-capability-certifications.json'
  const handoff = {
    operation: 'provider-review-capability-certification',
    handoffDigest: '9'.repeat(64),
    preparedAt: '2026-07-23T00:00:00.000Z',
    validUntil: '2026-07-23T12:00:00.000Z',
    repository: {
      id: 'design-system',
      github: REPOSITORY,
      defaultBranch: 'main',
    },
    gitTransaction: {
      expectedBaseCommit: EXPECTED_BASE_COMMIT,
    },
    evidenceArtifacts: [
      {
        path: runtimePath,
        sha256: runtimeSha256,
        canonicalBase64: runtimeEvidenceBytes.toString('base64'),
      },
      {
        path: capabilityPath,
        sha256: capabilitySha256,
        canonicalBase64: capabilityEvidenceBytes.toString('base64'),
      },
    ],
    ledgers: [
      {
        path: providerLedgerPath,
        beforeSha256: '1'.repeat(64),
        afterSha256: '2'.repeat(64),
      },
      {
        path: reviewLedgerPath,
        beforeSha256: '3'.repeat(64),
        afterSha256: '4'.repeat(64),
      },
    ],
    ledgerAfters: {
      providerCertifications: {
        schemaVersion: 2,
        certifications: [],
      },
      reviewCapabilityCertifications: {
        schemaVersion: 1,
        kind: 'review-capability-certification-ledger',
        certifications: [],
      },
    },
    requiredChangedPaths: [
      runtimePath,
      providerLedgerPath,
      capabilityPath,
      reviewLedgerPath,
    ],
  }
  const ledgerEntries =
    externalLedgerWriterTestHarness.canonicalLedgerAfterByteEntries(handoff)
  const changes = externalLedgerWriterTestHarness.plannedChanges(
    handoff,
    ledgerEntries,
  )
  assert.deepEqual(
    changes.map(change => change.path),
    handoff.requiredChangedPaths,
  )
  assert.deepEqual(
    changes.map(change => change.baseState),
    ['absent', 'existing-different', 'absent', 'existing-different'],
  )
  assert.equal(new Set(changes.map(change => change.path)).size, 4)

  const gzip = gzipSync(canonicalBytes(handoff), { level: 9, mtime: 0 })
  const commitMessage =
    externalLedgerWriterTestHarness.deterministicCommitMessage(handoff, {
      gzipSha256: sha256(gzip),
      gzipBase64: gzip.toString('base64'),
    })
  const parsed = parseExternalLedgerHandoffCommitMessage(commitMessage)
  assert.equal(parsed.handoff.operation,
    'provider-review-capability-certification')

  const reordered = structuredClone(handoff)
  ;[reordered.requiredChangedPaths[0], reordered.requiredChangedPaths[1]] = [
    reordered.requiredChangedPaths[1],
    reordered.requiredChangedPaths[0],
  ]
  assert.throws(
    () => externalLedgerWriterTestHarness.plannedChanges(
      reordered,
      ledgerEntries,
    ),
    /exact four materializations/,
  )

  const duplicate = structuredClone(handoff)
  duplicate.evidenceArtifacts[1] = structuredClone(
    duplicate.evidenceArtifacts[0],
  )
  assert.throws(
    () => externalLedgerWriterTestHarness.plannedChanges(
      duplicate,
      ledgerEntries,
    ),
    /artifact\[1\] is malformed/,
  )

  const substituted = structuredClone(handoff)
  substituted.evidenceArtifacts[1].canonicalBase64 =
    canonicalBytes({ substituted: true }).toString('base64')
  assert.throws(
    () => externalLedgerWriterTestHarness.plannedChanges(
      substituted,
      ledgerEntries,
    ),
    /content address is invalid/,
  )

  assert.throws(
    () => externalLedgerWriterTestHarness.plannedChanges(
      handoff,
      ledgerEntries.slice(0, 1),
    ),
    /after-image bytes are incomplete/,
  )
})

test('gzip carrier is portable across valid encodings but exact-byte tamper fails closed', () => {
  const fixture = certificationFixture()
  try {
    const alternate = structuredClone(fixture.dispatch)
    const canonical = canonicalBytes(fixture.handoff)
    const compressed = gzipSync(canonical, { level: 1, mtime: 0 })
    compressed[9] = compressed[9] === 3 ? 0 : 3
    assert.notEqual(
      compressed.toString('base64'),
      fixture.dispatch.client_payload.handoffGzipBase64,
    )
    alternate.client_payload.handoffGzipBase64 = compressed.toString('base64')
    alternate.client_payload.handoffGzipSha256 = sha256(compressed)
    const { dispatchDigest: ignored, ...dispatchCore } = alternate.client_payload
    alternate.client_payload.dispatchDigest = externalLedgerWriterTestHarness.digestValue(dispatchCore)
    const portable = createExternalLedgerWriterPlan({
      request: alternate,
      repository: REPOSITORY,
      currentBaseCommit: EXPECTED_BASE_COMMIT,
      currentBaseTree: EXPECTED_BASE_TREE,
      baseLedgerSha256: fixture.proposal.ledger.beforeSha256,
      now: NOW,
      validationOptions: fixture.options,
    })
    assert.equal(
      portable.plan.gitTransaction.branch,
      fixture.planned.plan.gitTransaction.branch,
    )
    assert.equal(portable.plan.commit.subject, fixture.planned.plan.commit.subject)
    assert.deepEqual(portable.plan.changes, fixture.planned.plan.changes)
    assert.notEqual(portable.plan.dispatchDigest, fixture.planned.plan.dispatchDigest)
    assert.notEqual(portable.commitMessage, fixture.planned.commitMessage)
    assert.deepEqual(
      parseExternalLedgerHandoffCommitMessage(portable.commitMessage).handoff,
      fixture.handoff,
    )

    const tampered = structuredClone(alternate)
    const tamperedBytes = Buffer.from(tampered.client_payload.handoffGzipBase64, 'base64')
    tamperedBytes[tamperedBytes.length - 1] ^= 1
    tampered.client_payload.handoffGzipBase64 = tamperedBytes.toString('base64')
    const { dispatchDigest: ignoredTampered, ...tamperedCore } = tampered.client_payload
    tampered.client_payload.dispatchDigest = externalLedgerWriterTestHarness.digestValue(tamperedCore)
    assert.throws(() => createExternalLedgerWriterPlan({
      request: tampered,
      repository: REPOSITORY,
      currentBaseCommit: EXPECTED_BASE_COMMIT,
      currentBaseTree: EXPECTED_BASE_TREE,
      baseLedgerSha256: fixture.proposal.ledger.beforeSha256,
      now: NOW,
      validationOptions: fixture.options,
    }), /compressed digest|decompression|digest/i)

    const messageTamper = portable.commitMessage.replace(
      portable.plan.commit.subject,
      portable.plan.commit.subject.replace('certification', 'activation'),
    )
    assert.throws(
      () => parseExternalLedgerHandoffCommitMessage(messageTamper),
      /substituted|detached|shape/i,
    )
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  }
})

test('same-run public artifact identity is exact, fresh, unexpired, and non-replayable', () => {
  const digest = '9'.repeat(64)
  const expected = {
    repository: REPOSITORY,
    headSha: EXPECTED_BASE_COMMIT,
    runId: '7001',
    runAttempt: '1',
    artifactId: '8001',
    artifactDigest: digest,
  }
  const run = {
    id: 7001,
    path: '.github/workflows/external-ledger-writer.yml@main',
    event: 'repository_dispatch',
    head_branch: 'main',
    head_sha: EXPECTED_BASE_COMMIT,
    status: 'in_progress',
    conclusion: null,
    run_attempt: 1,
    repository: { full_name: REPOSITORY },
    head_repository: { full_name: REPOSITORY },
  }
  const artifact = {
    id: 8001,
    name: 'external-ledger-7001-1',
    expired: false,
    digest: `sha256:${digest}`,
    workflow_run: {
      id: 7001,
      head_branch: 'main',
      head_sha: EXPECTED_BASE_COMMIT,
    },
    archive_download_url: `https://api.github.com/repos/${REPOSITORY}/actions/artifacts/8001/zip`,
    created_at: '2026-07-23T00:09:00.000Z',
    expires_at: '2026-08-22T00:09:00.000Z',
    size_in_bytes: 4096,
  }
  const identity = validateExternalLedgerRunArtifactApiSnapshot({
    run,
    artifacts: { total_count: 1, artifacts: [artifact] },
    expected,
    now: NOW,
  })
  assert.equal(identity.artifact.id, '8001')

  for (const [label, mutate] of [
    ['other run', ({ run: value }) => { value.id = 7002 }],
    ['other head', ({ run: value }) => { value.head_sha = 'e'.repeat(40) }],
    ['other artifact', ({ artifacts }) => { artifacts.artifacts[0].id = 8002 }],
    ['other digest', ({ artifacts }) => { artifacts.artifacts[0].digest = `sha256:${'7'.repeat(64)}` }],
    ['expired', ({ artifacts }) => { artifacts.artifacts[0].expired = true }],
    ['duplicate', ({ artifacts }) => {
      artifacts.artifacts.push(structuredClone(artifacts.artifacts[0]))
      artifacts.total_count = 2
    }],
  ]) {
    const poisoned = {
      run: structuredClone(run),
      artifacts: { total_count: 1, artifacts: [structuredClone(artifact)] },
    }
    mutate(poisoned)
    assert.throws(
      () => validateExternalLedgerRunArtifactApiSnapshot({
        ...poisoned,
        expected,
        now: NOW,
      }),
      undefined,
      label,
    )
  }
})

async function executeFixture(fixture, remote, {
  artifact = {},
  identity = {},
  clock = () => NOW,
} = {}) {
  const artifactEvidence = writerArtifactReceipt(fixture.handoff, artifact)
  return executeExternalLedgerWriterTransaction({
    plan: fixture.planned.plan,
    handoff: fixture.handoff,
    dispatch: fixture.dispatch,
    artifactIdentity: artifactEvidence.receipt,
    expectedArtifact: artifactEvidence.binding,
    writerIdentity: writerIdentity(identity),
    requestJson: remote.requestJson,
    requestMutation: remote.requestMutation,
    clock,
    validationOptions: fixture.options,
  })
}

test('Writer App transaction creates one exact branch and PR, then retries without mutation', async () => {
  const fixture = activationFixture()
  const remote = createWriterRemote(fixture)
  try {
    const first = await executeFixture(fixture, remote)
    assert.deepEqual(
      remote.mutationLog.map(item => `${item.method} ${item.path}`),
      [
        `POST /repos/${REPOSITORY}/git/trees`,
        `POST /repos/${REPOSITORY}/git/commits`,
        `POST /repos/${REPOSITORY}/git/refs`,
        `POST /repos/${REPOSITORY}/pulls`,
      ],
    )
    assert.equal(first.mutationBoundary.branchCreated, true)
    assert.equal(first.mutationBoundary.pullRequestCreated, true)
    assert.equal(first.mutationBoundary.directDefaultBranchWritePerformed, false)
    assert.equal(first.mutationBoundary.mergePerformed, false)
    assert.equal(first.mutationBoundary.reviewPerformed, false)
    assert.equal(first.mutationBoundary.candidateCodeExecuted, false)
    assert.deepEqual(first.writerApp.tokenRepositorySelection, [REPOSITORY])
    assert.deepEqual(first.writerApp.requestedPermissions, {
      contents: 'write',
      pullRequests: 'write',
    })
    assert.equal(first.head.parent, EXPECTED_BASE_COMMIT)
    assert.equal(first.head.files.length, 1)
    assert.equal(first.pullRequest.maintainerCanModify, false)
    assert.deepEqual(first.evidenceRole, {
      transientRunArtifact: true,
      retentionDays: 30,
      canonicalAuthority: false,
      mutationAuthority: false,
      mergeAuthority: false,
      reconstructableFromProtectedGit: true,
      durableTruth: 'protected-git-commit-pr-and-merged-ledger',
    })
    assert.equal(
      first.handoff.validitySemantics,
      'writer-materialization-envelope-only-not-merge-authorization',
    )

    const validateReceipt = new Ajv2020({
      allErrors: true,
      strict: true,
    })
    addFormats(validateReceipt)
    const receiptSchema = validateReceipt.compile(readJson(resolve(
      GOVERNANCE_ROOT,
      'schemas/external-ledger-writer-receipt.schema.json',
    )))
    assert.equal(receiptSchema(first), true, JSON.stringify(receiptSchema.errors))

    const mutationCount = remote.mutationLog.length
    const retry = await executeFixture(fixture, remote, {
      artifact: {
        runId: '7002',
        artifactId: '8002',
        artifactDigest: '7'.repeat(64),
      },
    })
    assert.equal(remote.mutationLog.length, mutationCount)
    assert.equal(retry.mutationBoundary.branchCreated, false)
    assert.equal(retry.mutationBoundary.pullRequestCreated, false)
    assert.equal(retry.head.commit, first.head.commit)
    assert.equal(retry.pullRequest.number, first.pullRequest.number)
    assert.equal(retry.artifact.runId, '7002')
    assert.notEqual(retry.artifactIdentityDigest, first.artifactIdentityDigest)

    remote.state.commits.get(remote.headCommit).message += '\n'
    await assert.rejects(
      executeFixture(fixture, remote, {
        artifact: {
          runId: '7003',
          artifactId: '8003',
          artifactDigest: '6'.repeat(64),
        },
      }),
      /message\/author\/committer|differs from the reviewed deterministic commit/i,
    )
    assert.equal(remote.mutationLog.length, mutationCount)
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  }
})

test('certification absent-subtree closure rejects siblings, pre-existing evidence, mode drift, and extra paths before a branch ref', async () => {
  const fixture = certificationFixture()
  const evidenceChange = fixture.planned.plan.changes.find(change => change.baseState === 'absent')
  const ledgerChange = fixture.planned.plan.changes.find(change => change.baseState === 'existing-different')
  const evilBytes = Buffer.from('evil\n')
  const evilFile = {
    mode: '100644',
    type: 'blob',
    sha: externalLedgerWriterTestHarness.gitBlobSha(evilBytes),
  }
  try {
    const poisons = [
      ['unauthorized added-tree sibling', {
        extraHeadFiles: new Map([[
          'infra/governance/evidence/external-runtime/evil.json',
          evilFile,
        ]]),
      }, /unauthorized sibling/],
      ['pre-existing content-addressed evidence', {
        extraBaseFiles: new Map([[
          evidenceChange.path,
          {
            mode: evidenceChange.mode,
            type: evidenceChange.type,
            sha: evidenceChange.gitBlobSha,
          },
        ]]),
      }, /already exists|base state is invalid/],
      ['mode drift', {
        extraHeadFiles: new Map([[
          ledgerChange.path,
          {
            mode: '100755',
            type: ledgerChange.type,
            sha: ledgerChange.gitBlobSha,
          },
        ]]),
      }, /mode differs|blob identity\/mode/],
      ['unrelated root file', {
        extraHeadFiles: new Map([['evil.txt', evilFile]]),
      }, /unauthorized tree entry/],
    ]
    for (const [label, options, pattern] of poisons) {
      const remote = createWriterRemote(fixture, options)
      await assert.rejects(executeFixture(fixture, remote), pattern, label)
      assert.deepEqual(
        remote.mutationLog.map(item => item.path),
        [`/repos/${REPOSITORY}/git/trees`],
        `${label} must fail before commit/ref/PR mutation`,
      )
      assert.equal(remote.state.branch, null)
    }
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  }
})

test('parent, base, App, installation, PR, and live-clock substitutions fail closed', async () => {
  const fixture = activationFixture()
  try {
    const wrongParent = createWriterRemote(fixture, {
      poisonCommit: commit => { commit.parents = [{ sha: '5'.repeat(40) }] },
    })
    await assert.rejects(
      executeFixture(fixture, wrongParent),
      /one-parent child/,
    )
    assert.equal(wrongParent.state.pullRequest, null)

    const baseRace = createWriterRemote(fixture, { advanceBaseBeforeRef: true })
    await assert.rejects(
      executeFixture(fixture, baseRace),
      /protected base advanced before the branch/,
    )
    assert.equal(baseRace.state.branch, null)

    for (const [label, identity, remoteOptions, pattern] of [
      ['wrong App id', { appId: '203' }, {}, /differs from protected desired/],
      ['wrong signed installation', { installationId: '2002' }, {}, /differs from protected desired/],
      ['extra installation repository', {}, {
        installationRepositories: [REPOSITORY, 'ajenchen/ds-product-template'],
      }, /not restricted to the exact authority repository/],
    ]) {
      const remote = createWriterRemote(fixture, remoteOptions)
      await assert.rejects(
        executeFixture(fixture, remote, { identity }),
        pattern,
        label,
      )
      assert.equal(remote.mutationLog.length, 0)
    }

    const poisonedPr = createWriterRemote(fixture, {
      poisonPullRequest: pull => { pull.maintainer_can_modify = true },
    })
    await assert.rejects(
      executeFixture(fixture, poisonedPr),
      /state\/title\/body boundary/,
    )

    let tick = 0
    const expiredAuthority = createWriterRemote(fixture)
    await assert.rejects(
      executeFixture(fixture, expiredAuthority, {
        clock: () => (
          tick++ === 0
            ? NOW
            : new Date('2026-07-23T01:00:00.000Z')
        ),
      }),
      /signed activation authority.*expired/i,
    )
    assert.equal(expiredAuthority.mutationLog.length, 0)

    tick = 0
    const backwardsClock = createWriterRemote(fixture)
    await assert.rejects(
      executeFixture(fixture, backwardsClock, {
        clock: () => (
          tick++ === 0
            ? NOW
            : new Date('2026-07-23T00:09:59.000Z')
        ),
      }),
      /clock moved backwards/,
    )
    assert.equal(backwardsClock.mutationLog.length, 0)
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  }
})

test('one-open-PR serialization and pagination limits stop before all Git mutations', async () => {
  const fixture = activationFixture()
  try {
    const other = {
      number: 99,
      base: { ref: 'main' },
      head: {
        ref: 'governance/external-ledger/activation-aaaaaaaaaaaa-bbbbbbbbbbbb',
        repo: { full_name: REPOSITORY },
      },
    }
    const blocked = createWriterRemote(fixture, { openPullRequests: [other] })
    await assert.rejects(
      executeFixture(fixture, blocked),
      /different external-ledger pull request is still open/,
    )
    assert.equal(blocked.mutationLog.length, 0)

    const page = Array.from({ length: 100 }, (_, index) => ({
      number: index + 1,
      base: { ref: 'main' },
      head: {
        ref: `ordinary-${index}`,
        repo: { full_name: REPOSITORY },
      },
    }))
    const paginated = createWriterRemote(fixture, { openPullRequests: page })
    await assert.rejects(
      executeFixture(fixture, paginated),
      /may be paginated/,
    )
    assert.equal(paginated.mutationLog.length, 0)
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  }
})

test('handoff validity is rechecked as a writer-materialization envelope before mutation', async () => {
  const fixture = certificationFixture()
  const remote = createWriterRemote(fixture)
  let tick = 0
  try {
    await assert.rejects(
      executeFixture(fixture, remote, {
        identity: {
          signedActivationExpiresAt: '2026-07-24T23:00:00.000Z',
        },
        clock: () => (
          tick++ === 0
            ? NOW
            : new Date(fixture.handoff.validUntil)
        ),
      }),
      /expired|validity horizon|validUntil/i,
    )
    assert.equal(remote.mutationLog.length, 0)
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  }
})

function certificationGitFixture() {
  const ctx = fixtureContext()
  const repoRoot = makeRepoRoot(ctx)
  git(repoRoot, ['init', '--quiet', '--initial-branch=main'])
  git(repoRoot, ['add', '--all'])
  git(repoRoot, [
    '-c',
    'user.name=Protected Base Fixture',
    '-c',
    'user.email=protected-base@example.invalid',
    'commit',
    '--quiet',
    '--no-gpg-sign',
    '-m',
    'protected base',
  ], {
    env: {
      GIT_AUTHOR_DATE: GENERATED_AT,
      GIT_COMMITTER_DATE: GENERATED_AT,
    },
  })
  const baseCommit = git(repoRoot, ['rev-parse', 'HEAD^{commit}'])
  const baseTree = git(repoRoot, ['rev-parse', 'HEAD^{tree}'])
  const evidence = signedSurfaceReceipt(ctx)
  const imported = materializeExternalSurfaceReceipt(canonicalBytes(evidence), {
    repoRoot,
    runtimeProfile: ctx.runtimeProfile,
    issuerRegistry: ctx.issuerRegistry,
    now: NOW,
  })
  const options = validationOptions(ctx, repoRoot)
  const proposal = createExternalCertificationProposal({
    ...options,
    reference: imported.reference,
    artifactSha256: imported.artifactSha256,
    certifiedAt: CERTIFIED_AT,
    expiresAt: EXPIRES_AT,
    now: NOW,
  })
  const handoff = createReviewedExternalCertificationHandoff({
    ...options,
    reviewedProposal: proposal,
    expectedProposalDigest: proposal.proposalDigest,
    expectedBaseCommit: baseCommit,
    currentBaseCommit: baseCommit,
    expectedBaseTree: baseTree,
    currentBaseTree: baseTree,
    baseLedgerSha256: proposal.ledger.beforeSha256,
    now: NOW,
  })
  const dispatch = createExternalLedgerWriterDispatch({
    handoff,
    currentBaseCommit: baseCommit,
    currentBaseTree: baseTree,
    baseLedgerSha256: proposal.ledger.beforeSha256,
    now: NOW,
    validationOptions: options,
  })
  const planned = createExternalLedgerWriterPlan({
    request: dispatch,
    repository: REPOSITORY,
    currentBaseCommit: baseCommit,
    currentBaseTree: baseTree,
    baseLedgerSha256: proposal.ledger.beforeSha256,
    now: NOW,
    validationOptions: options,
  })
  for (const change of planned.plan.changes) {
    const { path } = change
    const bytes = planned.changeBytes.get(path)
    const absolute = resolve(repoRoot, path)
    mkdirSync(resolve(absolute, '..'), { recursive: true })
    if (change.baseState === 'absent') assert.deepEqual(readFileSync(absolute), bytes)
    else writeFileSync(absolute, bytes)
  }
  git(repoRoot, ['add', '--', ...planned.plan.changes.map(change => change.path)])
  const messagePath = resolve(repoRoot, '.git/external-ledger-message.txt')
  writeFileSync(messagePath, planned.commitMessage)
  git(repoRoot, [
    '-c',
    'user.name=Qijenchen Governance Writer App',
    '-c',
    'user.email=qijenchen-governance-writer[bot]@users.noreply.github.com',
    'commit',
    '--quiet',
    '--no-gpg-sign',
    '-F',
    messagePath,
  ], {
    env: {
      GIT_AUTHOR_NAME: planned.plan.commit.author.name,
      GIT_AUTHOR_EMAIL: planned.plan.commit.author.email,
      GIT_AUTHOR_DATE: planned.plan.commit.author.date,
      GIT_COMMITTER_NAME: planned.plan.commit.committer.name,
      GIT_COMMITTER_EMAIL: planned.plan.commit.committer.email,
      GIT_COMMITTER_DATE: planned.plan.commit.committer.date,
    },
  })
  const headCommit = git(repoRoot, ['rev-parse', 'HEAD^{commit}'])
  const trustedRoot = mkdtempSync(resolve(tmpdir(), 'external-ledger-trusted-'))
  rmSync(trustedRoot, { recursive: true, force: true })
  const clone = spawnSync('/usr/bin/git', [
    'clone',
    '--quiet',
    '--no-local',
    repoRoot,
    trustedRoot,
  ], { encoding: 'utf8' })
  assert.equal(clone.status, 0, clone.stderr)
  git(trustedRoot, ['checkout', '--quiet', '--detach', baseCommit])
  return {
    ctx,
    repoRoot,
    trustedRoot,
    options,
    handoff,
    planned,
    baseCommit,
    headCommit,
  }
}

function protectedCliArgs(fixture, overrides = {}) {
  const values = {
    'trusted-root': fixture.trustedRoot,
    'candidate-root': fixture.repoRoot,
    repository: REPOSITORY,
    'base-sha': fixture.baseCommit,
    'base-ref': 'main',
    'head-sha': fixture.headCommit,
    'head-ref': fixture.planned.plan.gitTransaction.branch,
    'head-repository': REPOSITORY,
    'pr-author': 'qijenchen-governance-writer[bot]',
    'pr-author-type': 'Bot',
    'pr-number': '17',
    'pr-state': 'open',
    'pr-draft': 'false',
    'pr-title': fixture.planned.plan.pullRequest.title,
    'pr-body': fixture.planned.pullRequestBody,
    'maintainer-can-modify': 'false',
    ...overrides,
  }
  return [
    'verify-pr-head',
    ...Object.entries(values).flatMap(([flag, value]) => [`--${flag}`, String(value)]),
  ]
}

test('protected merge gate replays an exact real-Git carrier and rejects event/PR substitution', async () => {
  const fixture = certificationGitFixture()
  try {
    assert.equal(await runWriterCli(protectedCliArgs(fixture), {
      now: NOW,
      protectedValidationOptions: fixture.options,
    }), 0)
    for (const [label, override, pattern] of [
      ['wrong bot type', { 'pr-author-type': 'User' }, /author\/state identity/],
      ['cross-repository head', { 'head-repository': 'attacker/fork' }, /repository\/base\/tree/],
      ['maintainer mutation', { 'maintainer-can-modify': 'true' }, /author\/state identity/],
      ['draft substitution', { 'pr-draft': 'true' }, /author\/state identity/],
      ['title substitution', { 'pr-title': 'forged title' }, /title or body/],
      ['body substitution', { 'pr-body': 'forged body' }, /title or body/],
    ]) {
      await assert.rejects(
        runWriterCli(protectedCliArgs(fixture, override), {
          now: NOW,
          protectedValidationOptions: fixture.options,
        }),
        pattern,
        label,
      )
    }
    const marker = resolve(tmpdir(), `writer-ref-injection-${process.pid}`)
    rmSync(marker, { force: true })
    await assert.rejects(
      runWriterCli(protectedCliArgs(fixture, {
        'head-ref': `governance/external-ledger/"$(touch ${marker})"`,
      }), {
        now: NOW,
        protectedValidationOptions: fixture.options,
      }),
      /branch.*not deterministic|branch, commit carrier/i,
    )
    assert.equal(existsSync(marker), false)
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true })
    rmSync(fixture.trustedRoot, { recursive: true, force: true })
  }
})

test('Writer CLI token capture rejects ambient Actions, PAT, wrong-channel, and missing credentials', () => {
  const names = [
    'GOVERNANCE_WRITER_APP_TOKEN',
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'ORG_ADMIN_TOKEN',
  ]
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]))
  const restore = () => {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
  try {
    for (const name of names) delete process.env[name]
    assert.throws(
      () => externalLedgerWriterCliTestHarness.captureWriterToken('WRONG_TOKEN'),
      /only from GOVERNANCE_WRITER_APP_TOKEN/,
    )
    assert.throws(
      () => externalLedgerWriterCliTestHarness.captureWriterToken('GOVERNANCE_WRITER_APP_TOKEN'),
      /missing/,
    )
    process.env.GOVERNANCE_WRITER_APP_TOKEN = 'w'.repeat(40)
    process.env.GITHUB_TOKEN = 'actions-token'
    assert.throws(
      () => externalLedgerWriterCliTestHarness.captureWriterToken('GOVERNANCE_WRITER_APP_TOKEN'),
      /Ambient gh or GITHUB_TOKEN/,
    )
    delete process.env.GITHUB_TOKEN
    process.env.ORG_ADMIN_TOKEN = 'admin-token'
    assert.throws(
      () => externalLedgerWriterCliTestHarness.captureWriterToken('GOVERNANCE_WRITER_APP_TOKEN'),
      /PAT, personal access, and admin token channels/,
    )
    delete process.env.ORG_ADMIN_TOKEN
    assert.equal(
      externalLedgerWriterCliTestHarness.captureWriterToken('GOVERNANCE_WRITER_APP_TOKEN'),
      'w'.repeat(40),
    )
    assert.equal(process.env.GOVERNANCE_WRITER_APP_TOKEN, undefined)
  } finally {
    restore()
  }
})

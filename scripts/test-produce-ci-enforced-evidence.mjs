#!/usr/bin/env node

import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { issuerRegistryDigest } from '../infra/governance/lib/issuer-registry.mjs'
import {
  buildRepositorySubjectProof,
  validateRepositorySubjectProof,
} from '../infra/governance/lib/repository-subject-proof.mjs'
import { workflowIdentity } from '../infra/governance/lib/workflow-trust.mjs'
import {
  buildCiObservationDocument,
  buildCiObservationPayload,
  ciApiReadbackDigest,
  ciEvidenceImportTestHarness,
  ciEvidenceValidationTestHarness,
  ciObservationAttestationBytes,
  ciReceiptSigningBytes,
  importCiEvidence,
  readCiStagingPair,
  validateCiDetachedAttestation,
  validateCiObservationDocument,
} from './lib/ci-evidence-pipeline.mjs'
import { loadCiEvidencePlan, validateCiEvidencePlan } from './lib/ci-evidence-plan.mjs'
import {
  ciLiveObserverTestHarness,
  collectLiveCiObservation,
  observeLiveCiObservationToStaging,
} from './lib/ci-evidence-live-observer.mjs'
import { sha256, stableStringify } from './lib/deep-audit-evidence-contract.mjs'
import { parseCiEvidenceArgs } from './produce-ci-enforced-evidence.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HEAD = 'a'.repeat(40)
const MERGE_HEAD = '9'.repeat(40)
const TREE = 'b'.repeat(40)
const OBSERVED_AT = new Date('2026-07-21T00:00:00.000Z')
const NOW = new Date('2026-07-21T00:05:00.000Z')
const VERSION = '1.2.3'
const VERIFIED_DIGEST = '7'.repeat(64)
const TRUST_DIGEST = '8'.repeat(64)

const clone = value => structuredClone(value)
const ZIP_CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
  return value >>> 0
}))

function zipCrc32(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) value = ZIP_CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function exactStoredZip(name, bytes) {
  const filename = Buffer.from(name)
  const crc = zipCrc32(bytes)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6)
  local.writeUInt16LE(0, 8)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(bytes.length, 18)
  local.writeUInt32LE(bytes.length, 22)
  local.writeUInt16LE(filename.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(bytes.length, 20)
  central.writeUInt32LE(bytes.length, 24)
  central.writeUInt16LE(filename.length, 28)
  const centralOffset = local.length + filename.length + bytes.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(central.length + filename.length, 12)
  eocd.writeUInt32LE(centralOffset, 16)
  return Buffer.concat([local, filename, bytes, central, filename, eocd])
}

function signerFixture(name) {
  const keys = generateKeyPairSync('ed25519')
  return {
    keys,
    record: {
      keyId: `ci-${name}`,
      subject: `ci-authority-${name}`,
      publicKeySpki: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles: ['completion-attestor'],
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}

function issuerRegistry(signers) {
  return {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: signers.map(item => item.record),
  }
}

function workflowRun({ id, path, event, headSha = HEAD }) {
  return {
    id: String(id),
    runAttempt: 1,
    path,
    event,
    headBranch: 'main',
    headSha,
    status: 'completed',
    conclusion: 'success',
  }
}

function checkRun({ id, name, repository, head, workflow, completedAt }) {
  return {
    id: String(id),
    name,
    app: { id: 15368, slug: 'github-actions' },
    head_sha: head,
    external_id: null,
    details_url: `https://github.com/${repository}/actions/runs/${id}`,
    status: 'completed',
    conclusion: 'success',
    completed_at: completedAt,
    workflowRun: {
      id: String(id),
      path: workflow,
      head_sha: head,
      event: 'push',
      status: 'completed',
      conclusion: 'success',
    },
  }
}

function protectedAuthorityCheck({ baseSha }) {
  const runId = '7300'
  return {
    id: '7301',
    name: 'Immutable consumer snapshot',
    app: { id: 4242, slug: 'governance-check' },
    head_sha: HEAD,
    external_id: `governance-check-v1|acme/authority/.github/workflows/governance-anchor.yml@refs/heads/main|${baseSha}|${HEAD}|${runId}|1`,
    details_url: `https://github.com/acme/authority/actions/runs/${runId}`,
    status: 'completed',
    conclusion: 'success',
    completed_at: '2026-07-21T00:01:00.000Z',
    workflowRun: null,
  }
}

function reconciliation(repo, observed, assignment) {
  return {
    repoId: repo.id,
    github: repo.github,
    ring: assignment.ring,
    defaultBranchHeadSha: observed.defaultBranchHeadSha,
    observedStateDigest: sha256(stableStringify(observed)),
    requiredChecks: [],
    conflicts: [],
    actions: observed.rulesetPresent === true ? [] : [{ kind: 'restore-ruleset' }],
    deferredActions: [],
  }
}

function reseal(document) {
  const payload = document.payload
  payload.apiReadbackDigest = ciApiReadbackDigest(payload)
  return buildCiObservationDocument(payload)
}

function buildFixture({ additionalProductConsumer = false, certificationProof = null } = {}) {
  const planState = loadCiEvidencePlan({ repoRoot: ROOT })
  const requiredPaths = [...new Set(planState.plan.dimensions.flatMap(item => item.coverage.requiredPaths))].sort()
  const activeRun = {
    manifest: {
      runId: 'ci-fixture-run',
      head: HEAD,
      tree: TREE,
      rubricPaths: requiredPaths,
      inventory: requiredPaths.map(path => ({ path, kind: 'file' })),
    },
    manifestSha256: '9'.repeat(64),
  }
  const repositories = [
    { id: 'authority', github: 'acme/authority', role: 'authority', defaultBranch: 'main', desiredProfile: 'authority-profile', consumes: [] },
    { id: 'template', github: 'acme/template', role: 'template-mirror', defaultBranch: 'main', consumes: ['@qijenchen/design-system', '@qijenchen/storybook-config'] },
    { id: 'product', github: 'acme/product', role: 'product-consumer', defaultBranch: 'main', consumes: ['@qijenchen/design-system', '@qijenchen/storybook-config'] },
    ...(additionalProductConsumer ? [{ id: 'product-two', github: 'acme/product-two', role: 'product-consumer', defaultBranch: 'main', consumes: ['@qijenchen/design-system', '@qijenchen/storybook-config'] }] : []),
  ]
  const signers = [signerFixture('one'), signerFixture('two'), signerFixture('three')]
  const registry = issuerRegistry(signers)
  const policy = {
    schemaVersion: 1,
    algorithm: 'ed25519',
    maxAuthorizationTtlMinutes: 60,
    maxCompletionTtlMinutes: 10080,
    clockSkewSeconds: 120,
    issuerRegistryDigest: issuerRegistryDigest(registry),
    allowedKeyIds: signers.map(item => item.record.keyId),
    applyAuthorizationQuorum: 1,
    completionAttestationQuorum: 2,
  }
  const packages = [
    { name: '@qijenchen/design-system', version: VERSION, integrity: 'sha512-design-system' },
    { name: '@qijenchen/storybook-config', version: VERSION, integrity: 'sha512-storybook-config' },
  ]
  const candidateRelease = {
    version: VERSION,
    sourceCommit: MERGE_HEAD,
    sourceTree: TREE,
    bomSha256: '6'.repeat(64),
    packages,
  }
  const certificationSubjectCommit = certificationProof === 'self' ? MERGE_HEAD : HEAD
  const certificationSubjectTree = TREE
  const certifications = certificationProof ? [{
    id: 'ci-authority-runtime',
    provider: 'ci',
    runtimeKind: 'github-actions',
    surface: 'github-actions',
    repositoryRole: 'authority',
    status: 'certified',
    platformMatrix: [{
      id: 'ci-fixture-target',
      status: 'certified',
      runtimeEvidence: { gitCommit: certificationSubjectCommit, gitTree: certificationSubjectTree },
    }],
  }] : []
  const models = {
    inventory: {
      repositories,
      certificationCanaries: {
        authority: { repositoryId: 'authority' },
        'template-mirror': { repositoryId: 'template' },
        'product-consumer': { repositoryId: 'product' },
      },
    },
    desired: {
      integrations: {
        governanceWriterApp: { slug: 'governance-writer' },
        governanceCheckApp: { id: 4242, slug: 'governance-check' },
        githubActions: { id: 15368, slug: 'github-actions' },
      },
      profiles: {
        'authority-profile': {
          requiredChecks: [{
            context: 'Immutable consumer snapshot',
            integration: 'governanceCheckApp',
            trustSource: 'protected-base-workflow',
            workflow: '.github/workflows/governance-anchor.yml',
            requiredEvents: ['pull_request_target'],
          }],
        },
      },
    },
    rings: {
      candidateRelease,
      attestationPolicy: policy,
      assignments: Object.fromEntries(repositories.map((repo, index) => [repo.id, { ring: `ring-${index}`, wave: 'canary' }])),
    },
    certifications: { certifications },
    compatibility: {
      upgradeCompatibility: {
        packages: {
          '@qijenchen/design-system': { minimumVersion: '1.0.0', acceptedSpecPatterns: ['^\\d+\\.\\d+\\.\\d+$'] },
          '@qijenchen/storybook-config': { minimumVersion: '1.0.0', acceptedSpecPatterns: ['^\\d+\\.\\d+\\.\\d+$'] },
        },
        knownIncompatibilities: [],
      },
    },
    issuers: registry,
    waivers: {},
    runtimeProfile: {},
    externalActivationRequirements: {},
    externalActivationPolicy: {},
    githubMutationBoundaryContract: JSON.parse(readFileSync(join(ROOT, 'infra/governance/providers/github-mutation-boundary-contract.json'), 'utf8')),
    releaseTagAuthorizationPolicy: {},
  }
  const modelBindings = planState.plan.observation.canonicalInputs.map((item, index) => ({
    ...item,
    sha256: String(index + 1).padStart(64, '0'),
  }))
  const auditContent = readFileSync(join(ROOT, 'template/ds-product-template/.github/workflows/audit.yml'), 'utf8')
  const auditIdentity = workflowIdentity(auditContent)
  const heads = [MERGE_HEAD, 'c'.repeat(40), 'd'.repeat(40), '7'.repeat(40)]
  const trees = [TREE, 'e'.repeat(40), 'f'.repeat(40), '8'.repeat(40)]
  const readbacks = repositories.map((repo, index) => {
    const observed = {
      defaultBranchHeadSha: heads[index],
      defaultBranchTreeSha: trees[index],
      rulesetPresent: true,
      ...(repo.role === 'authority' ? {
        workflowContents: {
          '.github/workflows/release.yml': { identity: { contentSha256: '1'.repeat(64), gitBlobSha: '1'.repeat(40), semanticVersion: 2, semanticSha256: '2'.repeat(64) } },
          '.github/workflows/mirror-to-published-template.yml': { identity: { contentSha256: '3'.repeat(64), gitBlobSha: '3'.repeat(40), semanticVersion: 2, semanticSha256: '4'.repeat(64) } },
        },
      } : {}),
    }
    return {
      repositoryId: repo.id,
      repository: repo.github,
      role: repo.role,
      remoteTree: trees[index],
      certificationIdentity: {
        gitCommit: heads[index],
        gitTree: trees[index],
        subjectProofs: {},
      },
      observed,
      observedSha256: sha256(stableStringify(observed)),
      reconciliation: reconciliation(repo, observed, models.rings.assignments[repo.id]),
    }
  })
  if (certificationProof) {
    const authority = repositories[0]
    const carrier = readbacks[0].certificationIdentity
    const changedFiles = certificationProof === 'self'
      ? []
      : [{
          path: certificationProof === 'forbidden'
            ? 'src/product-runtime.ts'
            : 'infra/governance/providers/certifications.json',
          status: 'modified',
        }]
    carrier.subjectProofs[certificationSubjectCommit] = buildRepositorySubjectProof(authority, {
      subjectCommit: certificationSubjectCommit,
      subjectTree: certificationSubjectTree,
      carrierCommit: carrier.gitCommit,
      carrierTree: carrier.gitTree,
      changedFiles,
    })
  }
  const stageWorkflowRun = workflowRun({ id: 6401, path: '.github/workflows/release.yml', event: 'repository_dispatch', headSha: MERGE_HEAD })
  const mirrorWorkflowRun = workflowRun({ id: 6601, path: '.github/workflows/mirror-to-published-template.yml', event: 'workflow_run', headSha: MERGE_HEAD })
  const authorityBaseSha = '0'.repeat(40)
  const release = {
    candidateRelease,
    authorityTransition: {
      sourcePullRequest: {
        number: 100,
        state: 'closed',
        mergedAt: '2026-07-21T00:00:30.000Z',
        mergeCommitSha: MERGE_HEAD,
        baseRef: 'main',
        baseSha: authorityBaseSha,
        headSha: HEAD,
        authorLogin: 'maintainer',
      },
      candidateHeadTree: TREE,
      mergeCommitTree: TREE,
      requiredChecks: [protectedAuthorityCheck({ baseSha: authorityBaseSha })],
    },
    verifiedReleaseEvidence: { bomSha256: candidateRelease.bomSha256 },
    verifiedReleaseEvidenceDigest: VERIFIED_DIGEST,
    trustPreflightEvidence: { verdict: 'pass' },
    trustPreflightDigest: TRUST_DIGEST,
    stageWorkflowRun,
    mirrorWorkflowRun,
  }
  const propagation = repositories.slice(1).map((repo, index) => {
    const readback = readbacks[index + 1]
    const baseSha = index === 0 ? '1'.repeat(40) : '2'.repeat(40)
    const sync = repo.role === 'template-mirror'
      ? mirrorWorkflowRun
      : workflowRun({ id: 6701, path: '.github/workflows/sync-design-system.yml', event: 'repository_dispatch', headSha: baseSha })
    return {
      repositoryId: repo.id,
      repository: repo.github,
      role: repo.role,
      version: VERSION,
      remoteHead: readback.observed.defaultBranchHeadSha,
      remoteTree: readback.remoteTree,
      packageJson: { dependencies: Object.fromEntries(repo.consumes.map(name => [name, VERSION])) },
      packageLock: {
        packages: Object.fromEntries(repo.consumes.map(name => [`node_modules/${name}`, {
          version: VERSION,
          integrity: candidateRelease.packages.find(item => item.name === name).integrity,
        }])),
      },
      sourcePullRequest: {
        number: index + 1,
        state: 'closed',
        mergedAt: '2026-07-21T00:02:00.000Z',
        mergeCommitSha: readback.observed.defaultBranchHeadSha,
        baseRef: 'main',
        baseSha,
        headSha: String(index + 3).repeat(40),
        authorLogin: 'governance-writer[bot]',
      },
      sourceWorkflowRun: sync,
      auditWorkflow: {
        path: '.github/workflows/audit.yml',
        refHead: readback.observed.defaultBranchHeadSha,
        content: auditContent,
        declaredBlobSha: auditIdentity.gitBlobSha,
      },
      checks: [
        { id: 'audit', run: checkRun({ id: 7000 + index * 10, name: 'audit', repository: repo.github, head: readback.observed.defaultBranchHeadSha, workflow: '.github/workflows/audit.yml', completedAt: '2026-07-21T00:03:00.000Z' }) },
        { id: 'visual', run: checkRun({ id: 7001 + index * 10, name: 'visual', repository: repo.github, head: readback.observed.defaultBranchHeadSha, workflow: '.github/workflows/audit.yml', completedAt: '2026-07-21T00:03:00.000Z' }) },
      ],
    }
  })
  const payload = buildCiObservationPayload({
    planState,
    activeRun,
    modelBindings,
    repositories: readbacks,
    release,
    propagation,
    nonce: '123e4567-e89b-42d3-a456-426614174000',
    observedAt: OBSERVED_AT,
  })
  const document = buildCiObservationDocument(payload)
  const validators = {
    validateGovernanceModel(...args) {
      const runtimeValidationContext = args[8]
      assert.equal(runtimeValidationContext.repoRoot, ROOT)
      assert.match(runtimeValidationContext.runtimeIdentity.profileDigest, /^sha256:[a-f0-9]{64}$/)
      assert.match(runtimeValidationContext.runtimeIdentity.harnessDigest, /^sha256:[a-f0-9]{64}$/)
      assert.deepEqual(Object.keys(runtimeValidationContext.externalRepositoryIdentities), repositories.map(item => item.id))
      for (const [repositoryId, identity] of Object.entries(runtimeValidationContext.externalRepositoryIdentities)) {
        assert.match(identity.gitCommit, /^[a-f0-9]{40}$/)
        assert.match(identity.gitTree, /^[a-f0-9]{40}$/)
        assert.deepEqual(
          identity.subjectProofs,
          readbacks.find(item => item.repositoryId === repositoryId).certificationIdentity.subjectProofs,
        )
      }
      if (certificationProof) {
        validateRepositorySubjectProof(
          repositories[0],
          runtimeValidationContext.externalRepositoryIdentities.authority,
          { subjectCommit: certificationSubjectCommit, subjectTree: certificationSubjectTree },
          {
            carrierPolicy: {
              relationship: 'ledger-carrier-descendant',
              allowedChangedPaths: [
                'infra/governance/evidence/external-runtime/**',
                'infra/governance/evidence/provider-runtime/**',
                'infra/governance/providers/certifications.json',
              ],
            },
          },
        )
      }
    },
    materializeProfile() { return {} },
    diffRepository(repo, _profile, observed) {
      return reconciliation(repo, observed, models.rings.assignments[repo.id])
    },
    assertExternalActivationReady() {},
    validateVerifiedReleaseEvidence(evidence, candidate) {
      if (evidence.bomSha256 !== candidate.bomSha256) throw new Error('fixture BOM mismatch')
    },
    verifiedReleaseEvidenceDigest() { return VERIFIED_DIGEST },
    validateReleaseTrustPreflightEvidence() {},
    releaseTrustPreflightEvidenceDigest() { return TRUST_DIGEST },
    validateRequiredCheckProducer({ run, check, integration, repo, observed }) {
      const failures = []
      if (run.name !== check.context) failures.push('check name mismatch')
      if (run.app?.id !== integration.id || run.app?.slug !== integration.slug) failures.push('check app mismatch')
      if (run.head_sha !== (observed.candidateHeadSha ?? observed.defaultBranchHeadSha)) failures.push('check head mismatch')
      if (check.trustSource === 'protected-base-workflow') {
        const fields = String(run.external_id ?? '').split('|')
        if (fields[1] !== `${repo.github}/${check.workflow}@refs/heads/${repo.defaultBranch}`
          || fields[2] !== observed.protectedWorkflowSha || fields[3] !== run.head_sha) failures.push('protected check binding mismatch')
      } else {
        if (run.workflowRun?.head_sha !== observed.defaultBranchHeadSha) failures.push('check head mismatch')
        if (run.workflowRun?.path !== check.workflow) failures.push('check workflow mismatch')
        if (!check.requiredEvents.includes(run.workflowRun?.event)) failures.push('check event mismatch')
      }
      if (run.status !== 'completed' || run.conclusion !== 'success') failures.push('check verdict mismatch')
      return failures
    },
    checkPackageCompatibility() { return [] },
  }
  return { planState, activeRun, models, modelBindings, document, validators, signers }
}

function validateFixture(fixture, document = fixture.document, now = NOW) {
  return ciEvidenceValidationTestHarness.validateObservation(document, {
    repoRoot: ROOT,
    planState: fixture.planState,
    activeRun: fixture.activeRun,
    models: fixture.models,
    modelBindings: fixture.modelBindings,
    now,
  }, fixture.validators)
}

function signedAttestation(fixture) {
  const digest = issuerRegistryDigest(fixture.models.issuers)
  const signatures = []
  for (const dim of [64, 66]) {
    for (const signer of fixture.signers.slice(0, 2)) {
      const observationBytes = ciObservationAttestationBytes(fixture.document, dim, digest)
      const receiptBytes = ciReceiptSigningBytes(fixture.document, dim)
      signatures.push({
        dim,
        issuerKeyId: signer.record.keyId,
        observationPayloadSha256: sha256(observationBytes),
        observationSignature: sign(null, observationBytes, signer.keys.privateKey).toString('base64url'),
        receiptPayloadSha256: sha256(receiptBytes),
        receiptSignature: sign(null, receiptBytes, signer.keys.privateKey).toString('base64url'),
      })
    }
  }
  return {
    $schema: 'schemas/ci-evidence-attestation.schema.json',
    schemaVersion: 1,
    kind: 'ci-enforced-detached-attestation',
    observationSha256: fixture.document.payloadSha256,
    nonce: fixture.document.payload.nonce,
    issuerRegistryDigest: digest,
    signatures,
  }
}

function mutateDocument(fixture, mutation) {
  const document = clone(fixture.document)
  mutation(document.payload)
  return reseal(document)
}

test('DIM 64/66 frozen coverage is an exact reviewed closure and rejects both omission and injection', () => {
  const canonical = loadCiEvidencePlan({ repoRoot: ROOT }).plan
  for (const dim of [64, 66]) {
    const canonicalDimension = canonical.dimensions.find(item => item.dim === dim)
    for (const removedPath of canonicalDimension.coverage.requiredPaths) {
      const missing = clone(canonical)
      const missingDimension = missing.dimensions.find(item => item.dim === dim)
      missingDimension.coverage.requiredPaths = missingDimension.coverage.requiredPaths.filter(path => path !== removedPath)
      assert.throws(
        () => validateCiEvidencePlan(missing, { repoRoot: ROOT }),
        new RegExp(`dim ${dim} frozen coverage must exactly equal`),
        `dim ${dim} accepted removal of ${removedPath}`,
      )
    }

    const injected = clone(canonical)
    const injectedDimension = injected.dimensions.find(item => item.dim === dim)
    injectedDimension.coverage.requiredPaths.push('README.md')
    injectedDimension.coverage.requiredPaths.sort()
    assert.throws(
      () => validateCiEvidencePlan(injected, { repoRoot: ROOT }),
      new RegExp(`dim ${dim} frozen coverage must exactly equal`),
    )
  }
})

test('DIM 66 canonical guidance matches the immutable release, mirror, fleet and consumer evidence contract', () => {
  const plan = loadCiEvidencePlan({ repoRoot: ROOT }).plan
  const dimension = plan.dimensions.find(item => item.dim === 66)
  assert.equal(dimension?.tier, 'CI-ENFORCED')
  assert.equal(dimension?.capability, 'cross-repo-visual-parity')
  assert.equal(dimension?.subject?.workflow, '.github/workflows/mirror-to-published-template.yml')
  for (const requiredPath of [
    '.github/workflows/composition-fidelity.yml',
    '.github/workflows/mirror-to-published-template.yml',
    'infra/governance/bin/consumerctl.mjs',
    'scripts/dogfood-prepublish-verify.mjs',
    'scripts/visual-assertions.json',
    'template/ds-product-template/.github/workflows/sync-design-system.yml',
  ]) {
    assert.ok(dimension.coverage.requiredPaths.includes(requiredPath), `DIM 66 misses ${requiredPath}`)
  }

  const skill = readFileSync(
    resolve(ROOT, 'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md'),
    'utf8',
  )
  const prompts = readFileSync(
    resolve(ROOT, 'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md'),
    'utf8',
  )
  const skillRow = skill.split(/\r?\n/).find(line => /^\|\s*66\s*\|/.test(line)) ?? ''
  const promptStart = prompts.indexOf('## 66.')
  const promptEnd = prompts.indexOf('\n## 68.', promptStart)
  const promptSection = promptStart < 0
    ? ''
    : prompts.slice(promptStart, promptEnd < 0 ? prompts.length : promptEnd)
  for (const canonical of [skillRow, promptSection]) {
    assert.match(canonical, /CI-ENFORCED|CI evidence/i)
    assert.match(canonical, /mirror-to-published-template\.yml/)
    assert.match(canonical, /consumerctl/)
    assert.match(canonical, /governance-release/)
    assert.match(canonical, /PAT/)
    assert.match(canonical, /direct-main/)
    assert.doesNotMatch(canonical, /\b(?:design-system-published|ds-published|ssot-sync-dispatch|check_post_main_ssot_propagate)\b/)
  }
})

test('complete CI observation reruns all closed validators and embeds the full signed payload in each receipt', () => {
  const fixture = buildFixture()
  assert.doesNotThrow(() => validateFixture(fixture))
  const receipt = JSON.parse(ciReceiptSigningBytes(fixture.document, 64).toString('utf8'))
  assert.deepEqual(receipt.observationPayload, fixture.document.payload)
  assert.equal(receipt.observation.apiPayloadSha256, sha256(stableStringify(receipt.observationPayload)))
  assert.deepEqual(Object.keys(receipt).sort(), ['contract', 'observation', 'observationPayload', 'subject'])
})

test('offline validation rebuilds runtime identity only from signed repository rows and closes subject proofs to the canonical ledger', () => {
  const fixture = buildFixture()
  assert.doesNotThrow(() => validateFixture(fixture))

  const carrierSubstitution = mutateDocument(fixture, payload => {
    payload.repositories[1].certificationIdentity.gitTree = '0'.repeat(40)
  })
  assert.throws(
    () => validateFixture(fixture, carrierSubstitution),
    /certification carrier differs from the signed protected head\/tree/,
  )

  const observedTreeSubstitution = mutateDocument(fixture, payload => {
    const row = payload.repositories[1]
    row.observed.defaultBranchTreeSha = '0'.repeat(40)
    row.observedSha256 = sha256(stableStringify(row.observed))
    row.reconciliation.observedStateDigest = sha256(stableStringify(row.observed))
  })
  assert.throws(
    () => validateFixture(fixture, observedTreeSubstitution),
    /repository protected head\/tree binding is invalid/,
  )

  const extraSubject = '1'.repeat(40)
  const proofSubstitution = mutateDocument(fixture, payload => {
    const identity = payload.repositories[0].certificationIdentity
    identity.subjectProofs[extraSubject] = {
      subjectCommit: extraSubject,
      subjectTree: '2'.repeat(40),
      carrierCommit: identity.gitCommit,
      carrierTree: identity.gitTree,
      relationship: 'ancestor',
      changedFiles: [{ path: 'infra/governance/providers/certifications.json', status: 'modified' }],
      changedFilesSha256: '6'.repeat(64),
      changedPaths: ['infra/governance/providers/certifications.json'],
      changedPathsSha256: '3'.repeat(64),
      objectReadbackSha256: '4'.repeat(64),
      ancestryReadbackSha256: '5'.repeat(64),
    }
  })
  assert.throws(
    () => validateFixture(fixture, proofSubstitution),
    /subject-proof closure differs from the canonical ledger/,
  )
})

test('observation schema and canonical inventory close over more than one product consumer', () => {
  const fixture = buildFixture({ additionalProductConsumer: true })
  assert.equal(fixture.document.payload.repositories.length, 4)
  assert.equal(fixture.document.payload.propagation.length, 3)
  assert.doesNotThrow(() => validateFixture(fixture))

  const missingConsumer = mutateDocument(fixture, payload => { payload.propagation.pop() })
  assert.throws(() => validateFixture(fixture, missingConsumer), /propagation closure is incomplete/)

  const reorderedConsumers = mutateDocument(fixture, payload => {
    ;[payload.propagation[1], payload.propagation[2]] = [payload.propagation[2], payload.propagation[1]]
  })
  assert.throws(() => validateFixture(fixture, reorderedConsumers), /propagation identity\/order mismatch/)
})

test('CI evidence closes external activation over the explicit mutation-boundary model', () => {
  const fixture = buildFixture()
  let activationCalls = 0
  let releaseTrustCalls = 0
  fixture.validators.assertExternalActivationReady = (_ledger, options) => {
    activationCalls += 1
    assert.strictEqual(options.desired, fixture.models.desired)
    assert.strictEqual(options.mutationBoundaryContract, fixture.models.githubMutationBoundaryContract)
  }
  fixture.validators.validateReleaseTrustPreflightEvidence = (_evidence, expected) => {
    releaseTrustCalls += 1
    assert.strictEqual(expected.activationInventory, fixture.models.inventory)
    assert.strictEqual(expected.activationDesired, fixture.models.desired)
    assert.strictEqual(expected.mutationBoundaryContract, fixture.models.githubMutationBoundaryContract)
  }
  assert.doesNotThrow(() => validateFixture(fixture))
  assert.equal(activationCalls, 2)
  assert.equal(releaseTrustCalls, 1)

  const missingContractPlan = clone(fixture.planState.plan)
  missingContractPlan.observation.canonicalInputs = missingContractPlan.observation.canonicalInputs
    .filter(input => input.name !== 'githubMutationBoundaryContract')
  assert.throws(
    () => validateCiEvidencePlan(missingContractPlan, { repoRoot: ROOT }),
    /canonical input|schema validation/,
  )

  const poisoned = buildFixture()
  poisoned.models.githubMutationBoundaryContract = { schemaVersion: 999 }
  poisoned.validators.assertExternalActivationReady = (_ledger, options) => {
    if (options.mutationBoundaryContract?.schemaVersion === 999) throw new Error('explicit mutation-boundary contract substitution')
  }
  assert.throws(() => validateFixture(poisoned), /explicit mutation-boundary contract substitution/)
})

test('live runtime snapshot assertions reject initial-to-row and row-to-final identity drift', () => {
  const fixture = buildFixture()
  const identities = Object.fromEntries(fixture.document.payload.repositories.map(row => [
    row.repositoryId,
    clone(row.certificationIdentity),
  ]))
  const initial = {
    repoRoot: ROOT,
    runtimeIdentity: { profileDigest: `sha256:${'1'.repeat(64)}`, harnessDigest: `sha256:${'2'.repeat(64)}` },
    externalRepositoryIdentities: identities,
  }
  const repository = fixture.models.inventory.repositories[1]
  const row = fixture.document.payload.repositories[1]
  assert.deepEqual(
    ciLiveObserverTestHarness.assertRepositorySnapshot(initial, repository, row.observed, row.remoteTree),
    row.certificationIdentity,
  )

  const changedHead = clone(row.observed)
  changedHead.defaultBranchHeadSha = '0'.repeat(40)
  assert.throws(
    () => ciLiveObserverTestHarness.assertRepositorySnapshot(initial, repository, changedHead, row.remoteTree),
    /changed between runtime certification and CI observation/,
  )
  assert.throws(
    () => ciLiveObserverTestHarness.assertRepositorySnapshot(initial, repository, row.observed, '0'.repeat(40)),
    /changed between runtime certification and CI observation/,
  )

  assert.equal(ciLiveObserverTestHarness.assertSnapshotsStable(initial, clone(initial)), true)
  const final = clone(initial)
  final.externalRepositoryIdentities.template.gitTree = '0'.repeat(40)
  assert.throws(
    () => ciLiveObserverTestHarness.assertSnapshotsStable(initial, final),
    /identities changed during CI live observation/,
  )
})

test('certified observation context enforces real self/ancestor subject proofs and carrier path policy', () => {
  const self = buildFixture({ certificationProof: 'self' })
  assert.doesNotThrow(() => validateFixture(self))

  const ancestor = buildFixture({ certificationProof: 'ancestor' })
  assert.doesNotThrow(() => validateFixture(ancestor))

  const forbidden = buildFixture({ certificationProof: 'forbidden' })
  assert.throws(
    () => validateFixture(forbidden),
    /certification carrier changed forbidden path/,
  )
})

test('squash/rebase commit identity is accepted only through the exact same-tree authority PR transition', () => {
  const fixture = buildFixture()
  assert.notEqual(fixture.activeRun.manifest.head, fixture.document.payload.release.candidateRelease.sourceCommit)
  assert.equal(fixture.activeRun.manifest.tree, fixture.document.payload.release.candidateRelease.sourceTree)
  assert.doesNotThrow(() => validateFixture(fixture))

  const wrongPrHead = mutateDocument(fixture, payload => {
    payload.release.authorityTransition.sourcePullRequest.headSha = '8'.repeat(40)
  })
  assert.throws(() => validateFixture(fixture, wrongPrHead), /authority candidate PR/)

  const arbitrarySameTree = clone(fixture.document)
  const arbitraryCommit = '7'.repeat(40)
  arbitrarySameTree.payload.release.candidateRelease.sourceCommit = arbitraryCommit
  fixture.models.rings.candidateRelease.sourceCommit = arbitraryCommit
  arbitrarySameTree.payload.repositories[0].observed.defaultBranchHeadSha = arbitraryCommit
  arbitrarySameTree.payload.repositories[0].certificationIdentity.gitCommit = arbitraryCommit
  arbitrarySameTree.payload.repositories[0].observedSha256 = sha256(stableStringify(arbitrarySameTree.payload.repositories[0].observed))
  arbitrarySameTree.payload.repositories[0].reconciliation.defaultBranchHeadSha = arbitraryCommit
  arbitrarySameTree.payload.repositories[0].reconciliation.observedStateDigest = sha256(stableStringify(arbitrarySameTree.payload.repositories[0].observed))
  arbitrarySameTree.payload.release.stageWorkflowRun.headSha = arbitraryCommit
  arbitrarySameTree.payload.release.mirrorWorkflowRun.headSha = arbitraryCommit
  for (const dimension of arbitrarySameTree.payload.dimensions) dimension.head = arbitraryCommit
  const arbitraryDocument = reseal(arbitrarySameTree)
  assert.throws(() => validateFixture(fixture, arbitraryDocument), /authority candidate PR/)

  const treeDrift = mutateDocument(buildFixture(), payload => {
    payload.release.authorityTransition.mergeCommitTree = '0'.repeat(40)
  })
  const treeFixture = buildFixture()
  assert.throws(() => validateFixture(treeFixture, treeDrift), /authority candidate PR|candidate release tree/)
})

test('rulesets, audit/visual checks, producer identity, protected heads, release/BOM, and propagation are fail-closed', () => {
  const cases = [
    ['missing ruleset', payload => {
      payload.repositories[1].observed.rulesetPresent = false
      payload.repositories[1].observedSha256 = sha256(stableStringify(payload.repositories[1].observed))
      payload.repositories[1].reconciliation = reconciliation(
        buildFixture().models.inventory.repositories[1],
        payload.repositories[1].observed,
        buildFixture().models.rings.assignments.template,
      )
    }],
    ['missing visual check', payload => { payload.propagation[0].checks.pop() }],
    ['wrong GitHub App', payload => { payload.propagation[0].checks[0].run.app.id = 999 }],
    ['wrong workflow', payload => { payload.propagation[0].checks[0].run.workflowRun.path = '.github/workflows/fake.yml' }],
    ['wrong check head', payload => { payload.propagation[0].checks[0].run.head_sha = '0'.repeat(40) }],
    ['failed visual verdict', payload => { payload.propagation[0].checks[1].run.conclusion = 'failure' }],
    ['release substitution', payload => { payload.release.candidateRelease.version = '1.2.4' }],
    ['BOM substitution', payload => { payload.release.verifiedReleaseEvidence.bomSha256 = '5'.repeat(64) }],
    ['wrong PR actor', payload => { payload.propagation[1].sourcePullRequest.authorLogin = 'human' }],
    ['built-in GITHUB_TOKEN PR actor fake-green', payload => { payload.propagation[1].sourcePullRequest.authorLogin = 'github-actions[bot]' }],
    ['wrong sync event', payload => { payload.propagation[1].sourceWorkflowRun.event = 'workflow_dispatch' }],
    ['mixed dimension run', payload => { payload.dimensions[1].runId = payload.dimensions[0].runId }],
  ]
  for (const [label, mutation] of cases) {
    const fixture = buildFixture()
    const poisoned = mutateDocument(fixture, mutation)
    assert.throws(() => validateFixture(fixture, poisoned), undefined, label)
  }
})

test('nonce, freshness, payload digest, and inline observation completeness cannot be weakened', () => {
  const fixture = buildFixture()
  const invalidNonce = mutateDocument(fixture, payload => { payload.nonce = 'predictable' })
  assert.throws(() => validateFixture(fixture, invalidNonce), /schema validation|nonce/)
  assert.throws(
    () => validateFixture(fixture, fixture.document, new Date('2026-07-21T00:16:00.000Z')),
    /stale|expired/,
  )
  const digestSubstitution = clone(fixture.document)
  digestSubstitution.payload.repositories[0].observed.rulesetPresent = false
  assert.throws(() => validateFixture(fixture, digestSubstitution), /payload digest mismatch/)
  const signedReceipt = JSON.parse(ciReceiptSigningBytes(fixture.document, 64).toString('utf8'))
  delete signedReceipt.observationPayload
  assert.notEqual(sha256(stableStringify(signedReceipt)), sha256(ciReceiptSigningBytes(fixture.document, 64)))
})

test('detached per-dimension quorum verifies both observation binding and full receipt signatures', () => {
  const fixture = buildFixture()
  const attestation = signedAttestation(fixture)
  const validated = validateFixture(fixture)
  const options = {
    repoRoot: ROOT,
    models: fixture.models,
    observedAt: validated.observedAt,
    expiresAt: validated.expiresAt,
    now: NOW,
  }
  assert.equal(validateCiDetachedAttestation(attestation, fixture.document, options), true)

  const missingSecond = clone(attestation)
  missingSecond.signatures = missingSecond.signatures.filter((item, index) => !(item.dim === 64 && index === 1))
  assert.throws(() => validateCiDetachedAttestation(missingSecond, fixture.document, options), /lacks completion-attestor quorum/)

  const duplicate = clone(attestation)
  duplicate.signatures[1] = clone(duplicate.signatures[0])
  assert.throws(() => validateCiDetachedAttestation(duplicate, fixture.document, options), /duplicate attestor keys/)

  const wrongIssuer = clone(attestation)
  wrongIssuer.signatures[0].issuerKeyId = fixture.signers[2].record.keyId
  assert.throws(() => validateCiDetachedAttestation(wrongIssuer, fixture.document, options), /observation signature is invalid/)

  const mixedDimension = clone(attestation)
  mixedDimension.signatures[1].dim = 66
  assert.throws(() => validateCiDetachedAttestation(mixedDimension, fixture.document, options), /lacks completion-attestor quorum|duplicate attestor keys|signature is invalid/)

  const wrongSignature = clone(attestation)
  wrongSignature.signatures[0].receiptSignature = wrongSignature.signatures[1].receiptSignature
  assert.throws(() => validateCiDetachedAttestation(wrongSignature, fixture.document, options), /receipt signature is invalid/)
})

test('import validation completes before publication and invalid signature or runtime context performs zero writes', async () => {
  const fixture = buildFixture()
  const options = {
    repoRoot: ROOT,
    planState: fixture.planState,
    activeRun: fixture.activeRun,
    canonical: { models: fixture.models, bindings: fixture.modelBindings },
    now: NOW,
  }
  let publishCalls = 0
  const publish = () => { publishCalls += 1 }

  const badSignature = signedAttestation(fixture)
  badSignature.signatures[0].observationSignature = badSignature.signatures[1].observationSignature
  await assert.rejects(
    () => ciEvidenceImportTestHarness.importPair(
      { observation: fixture.document, attestation: badSignature },
      options,
      fixture.validators,
      publish,
    ),
    /observation signature is invalid/,
  )
  assert.equal(publishCalls, 0)

  const invalidContextDocument = mutateDocument(fixture, payload => {
    const row = payload.repositories[1]
    row.observed.defaultBranchTreeSha = '0'.repeat(40)
    row.observedSha256 = sha256(stableStringify(row.observed))
    row.reconciliation.observedStateDigest = sha256(stableStringify(row.observed))
  })
  await assert.rejects(
    () => ciEvidenceImportTestHarness.importPair(
      { observation: invalidContextDocument, attestation: signedAttestation(fixture) },
      options,
      fixture.validators,
      publish,
    ),
    /repository protected head\/tree binding is invalid/,
  )
  assert.equal(publishCalls, 0)
})

test('current registry revocation invalidates previously valid CI attestations', () => {
  const fixture = buildFixture()
  const attestation = signedAttestation(fixture)
  const validated = validateFixture(fixture)
  const revoked = clone(fixture.models)
  revoked.issuers.issuers[1].status = 'revoked'
  revoked.issuers.issuers[1].revokedAt = '2026-07-21T00:04:00.000Z'
  revoked.rings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(revoked.issuers)
  assert.throws(() => validateCiDetachedAttestation(attestation, fixture.document, {
    repoRoot: ROOT,
    models: revoked,
    observedAt: validated.observedAt,
    expiresAt: validated.expiresAt,
    now: NOW,
  }), /issuer registry substitution|revoked/)
})

test('release trust artifact transport accepts one exact digestable JSON file and rejects ZIP ambiguity', () => {
  const document = { kind: 'release-trust-preflight', schemaVersion: 1 }
  const filename = 'release-trust-preflight.json'
  const archive = exactStoredZip(filename, Buffer.from(JSON.stringify(document)))
  assert.deepEqual(ciLiveObserverTestHarness.extractReleaseTrustArtifact(archive), document)

  const trailed = Buffer.concat([archive, Buffer.from([0])])
  assert.throws(
    () => ciLiveObserverTestHarness.extractReleaseTrustArtifact(trailed),
    /no exact end-of-central-directory record/,
  )

  const corruptCrc = Buffer.from(archive)
  const centralOffset = corruptCrc.readUInt32LE(corruptCrc.length - 22 + 16)
  corruptCrc.writeUInt32LE((corruptCrc.readUInt32LE(centralOffset + 16) + 1) >>> 0, centralOffset + 16)
  assert.throws(
    () => ciLiveObserverTestHarness.extractReleaseTrustArtifact(corruptCrc),
    /local sizes or boundary differ|CRC32 differs/,
  )

  const wrongName = exactStoredZip('nested/release-trust-preflight.json', Buffer.from(JSON.stringify(document)))
  assert.throws(
    () => ciLiveObserverTestHarness.extractReleaseTrustArtifact(wrongName),
    /unexpected entry/,
  )
  const invalidJson = exactStoredZip(filename, Buffer.from('{'))
  assert.throws(
    () => ciLiveObserverTestHarness.extractReleaseTrustArtifact(invalidJson),
    /not strict UTF-8 JSON/,
  )
})

test('production APIs and CLI expose no validator, model, fixture, or repository override', async () => {
  const fixture = buildFixture()
  assert.throws(() => validateCiObservationDocument(fixture.document, { validators: fixture.validators }), /forbids override/)
  await assert.rejects(() => importCiEvidence({ dependencies: {} }), /forbids override/)
  await assert.rejects(() => collectLiveCiObservation({ client: { request() {} } }), /forbids override/)
  await assert.rejects(() => observeLiveCiObservationToStaging({
    stagingDirectory: '/tmp/forbidden-ci-output',
    client: { request() {} },
  }), /forbids override/)
  assert.deepEqual(
    Object.keys(ciLiveObserverTestHarness),
    ['collect', 'assertRepositorySnapshot', 'assertSnapshotsStable', 'extractReleaseTrustArtifact'],
  )
  for (const flag of ['--fixture=x', '--validator=x', '--repo-root=x', '--model=x']) {
    assert.throws(() => parseCiEvidenceArgs(['--plan', flag]), /unknown option/)
  }
})

test('staging pair is closed, same-directory, content-addressed, and rejects symlink/hardlink/extra-file poison', () => {
  const fixture = buildFixture()
  const attestation = signedAttestation(fixture)
  const root = mkdtempSync(join(tmpdir(), 'ci-evidence-staging-'))
  try {
    const observationBytes = Buffer.from(`${stableStringify(fixture.document, 2)}\n`)
    const attestationBytes = Buffer.from(`${stableStringify(attestation, 2)}\n`)
    const observationPath = join(root, `${fixture.document.payloadSha256}.json`)
    const attestationPath = join(root, `${sha256(attestationBytes)}.attestation.json`)
    writeFileSync(observationPath, observationBytes)
    writeFileSync(attestationPath, attestationBytes)
    assert.equal(readCiStagingPair(observationPath, attestationPath).observation.payloadSha256, fixture.document.payloadSha256)

    writeFileSync(join(root, 'orphan.json'), '{}\n')
    assert.throws(() => readCiStagingPair(observationPath, attestationPath), /unknown or partial files/)
    rmSync(join(root, 'orphan.json'))

    const hardlink = join(root, 'observation-hardlink')
    linkSync(observationPath, hardlink)
    assert.throws(() => readCiStagingPair(observationPath, attestationPath), /bounded, unlinked regular file/)
    rmSync(hardlink)

    const symlinkRoot = join(root, 'symlink-case')
    mkdirSync(symlinkRoot)
    const symlinkObservation = join(symlinkRoot, `${fixture.document.payloadSha256}.json`)
    const symlinkAttestation = join(symlinkRoot, `${sha256(attestationBytes)}.attestation.json`)
    symlinkSync(observationPath, symlinkObservation)
    writeFileSync(symlinkAttestation, attestationBytes)
    assert.throws(() => readCiStagingPair(symlinkObservation, symlinkAttestation), /cannot be read safely|bounded, unlinked regular file/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

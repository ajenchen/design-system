import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  buildStandardDimensionPayloads,
  buildStandardFiveStepReceipt,
  loadStandardCiEvidencePlan,
  validateStandardFiveStepObservation,
  validateStandardFiveStepReceipt,
} from './lib/standard-ci-evidence.mjs'
import { parseStandardCiEvidenceArgs } from './produce-standard-ci-evidence.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const oid = (value) => value.repeat(40)
const hash = (value) => value.repeat(64)
const integrity = (value) => `sha512-${Buffer.alloc(64, value).toString('base64')}`
const clone = (value) => JSON.parse(JSON.stringify(value))

function fixture() {
  const { plan, planSha256 } = loadStandardCiEvidencePlan({ repoRoot: ROOT })
  const inventory = JSON.parse(readFileSync(resolve(ROOT, 'infra/governance/inventory/managed-repos.json'), 'utf8'))
  const desired = JSON.parse(readFileSync(resolve(ROOT, 'infra/governance/desired/github.json'), 'utf8'))
  const workflow = JSON.parse(readFileSync(resolve(ROOT, plan.workflowPlan), 'utf8'))
  const head = oid('1')
  const tree = oid('2')
  const commit = oid('3')
  const baseHead = oid('4')
  const activeRun = {
    manifestSha256: hash('a'),
    manifest: { runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', head, tree },
  }
  const versionRows = Object.entries({
    '@qijenchen/design-system': 'packages/design-system/package.json',
    '@qijenchen/governance': 'packages/governance/package.json',
    '@qijenchen/storybook-config': 'packages/storybook-config/package.json',
  }).map(([name, manifestPath], index) => ({
    name,
    manifestPath,
    version: JSON.parse(readFileSync(resolve(ROOT, manifestPath), 'utf8')).version,
    integrity: integrity(index + 1),
    shasum: String(index + 1).repeat(40),
  }))
  const version = versionRows[0].version
  const authority = inventory.repositories.find((repo) => repo.id === plan.authority.repositoryId)
  const authorityProfile = desired.profiles[authority.desiredProfile]
  const authorityCheckPolicy = authorityProfile.requiredChecks[0]
  const action = desired.integrations.githubActions
  const workflowRun = (repository, path, event, runId, headSha) => ({
    repository, path, event, runId: String(runId), runAttempt: 1, headSha, status: 'completed', conclusion: 'success',
  })
  const check = (repository, policy, runId, checkHead, workflowHead = checkHead) => ({
    name: policy.context,
    headSha: checkHead,
    status: 'completed',
    conclusion: 'success',
    appId: action.id,
    appSlug: action.slug,
    workflowRun: workflowRun(repository, policy.workflow, policy.requiredEvents[0], runId, workflowHead),
  })
  const releaseRun = workflowRun(authority.github, plan.dimensions[0].workflow, 'repository_dispatch', 640, commit)
  const mirrorRun = workflowRun(authority.github, plan.dimensions[1].workflow, 'repository_dispatch', 660, commit)
  const mirrorBytes = readFileSync(resolve(ROOT, plan.dimensions[1].workflow))
  const mirrorBlob = createHash('sha1').update(`blob ${mirrorBytes.length}\0`).update(mirrorBytes).digest('hex')
  const npm = versionRows.map((item) => ({
    name: item.name,
    version,
    integrity: item.integrity,
    shasum: item.shasum,
    tarball: `https://registry.npmjs.org/${item.name.replace('/', '%2f')}/-/${item.name.split('/')[1]}-${version}.tgz`,
    attestationUrl: `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(item.name)}@${version}`,
    provenancePredicate: 'https://slsa.dev/provenance/v1',
    provenancePayloadSha256: hash(String(versionRows.indexOf(item) + 4)),
    repository: authority.github,
    workflow: '.github/workflows/release.yml',
    workflowRef: 'refs/heads/main',
    gitCommit: commit,
    builderId: 'https://github.com/actions/runner/github-hosted',
  }))
  const npmByName = new Map(npm.map((item) => [item.name, item]))
  const consumers = plan.consumers.map((planned, index) => {
    const repo = inventory.repositories.find((item) => item.id === planned.repositoryId)
    const profile = desired.profiles[repo.desiredProfile]
    const policy = profile.requiredChecks[0]
    const releaseTarget = workflow.automation.consumers.find((target) => target.repository === repo.github)
    const receiptPolicy = {
      context: releaseTarget.requiredCheck.context,
      workflow: releaseTarget.requiredCheck.producerWorkflow,
      requiredEvents: [releaseTarget.requiredCheck.producerEvent],
    }
    const prHead = oid(String(index + 5))
    const consumerCommit = oid(String(index + 7))
    const consumerTree = oid(index === 0 ? '9' : 'a')
    const consumerBase = oid(index === 0 ? 'b' : 'c')
    const packageNames = releaseTarget.packages
    return {
      repositoryId: repo.id,
      role: repo.role,
      repository: repo.github,
      defaultBranch: repo.defaultBranch,
      protectedMain: { head: consumerCommit, tree: consumerTree },
      sourcePullRequest: {
        number: index + 10,
        state: 'closed',
        mergedAt: '2026-08-02T00:00:00.000Z',
        head: prHead,
        headTree: oid(index === 0 ? 'd' : 'e'),
        mergeCommit: consumerCommit,
        mergeTree: consumerTree,
        baseRef: repo.defaultBranch,
        baseHead: consumerBase,
        title: `chore: release ${version}`,
        body: `Generated from ${version} at ${commit}.`,
      },
      sourceWorkflow: planned.role === 'template-mirror'
        ? mirrorRun
        : workflowRun(repo.github, planned.sourceWorkflow, 'repository_dispatch', 670, consumerBase),
      packageLock: {
        path: 'package-lock.json',
        sha256: hash(index === 0 ? 'd' : 'e'),
        packages: packageNames.map((name) => ({
          name,
          version,
          integrity: npmByName.get(name).integrity,
          resolved: npmByName.get(name).tarball,
        })),
      },
      auditWorkflow: { path: policy.workflow, contentSha256: policy.workflowIdentity.contentSha256, gitBlobSha: policy.workflowIdentity.gitBlobSha },
      requiredCheck: check(
        repo.github,
        receiptPolicy,
        index + 680,
        prHead,
        releaseTarget.requiredCheck.producerHead === 'pull-request-base' ? consumerBase : prHead,
      ),
    }
  })
  const observation = {
    schemaVersion: 1,
    kind: 'standard-five-step-live-ci-observation',
    profile: workflow.profile,
    planSha256,
    observedAt: '2026-08-02T00:00:00.000Z',
    runBinding: { runId: activeRun.manifest.runId, manifestSha256: activeRun.manifestSha256, head, tree },
    authority: {
      repository: authority.github,
      defaultBranch: authority.defaultBranch,
      pullRequest: { number: 1, state: 'closed', mergedAt: '2026-08-02T00:00:00.000Z', head, headTree: tree, mergeCommit: commit, mergeTree: tree, baseRef: authority.defaultBranch, baseHead, title: `release ${version}`, body: `release ${version}` },
      protectedMain: { head: commit, tree },
      requiredCheck: check(authority.github, authorityCheckPolicy, 600, head),
      releaseWorkflow: releaseRun,
      mirrorWorkflow: mirrorRun,
      workflowIdentities: [
        { path: authorityCheckPolicy.workflow, contentSha256: authorityCheckPolicy.workflowIdentity.contentSha256, gitBlobSha: authorityCheckPolicy.workflowIdentity.gitBlobSha },
        { path: plan.dimensions[0].workflow, contentSha256: authorityProfile.tagPolicy.sourceWorkflowIdentity.contentSha256, gitBlobSha: authorityProfile.tagPolicy.sourceWorkflowIdentity.gitBlobSha },
        { path: plan.dimensions[1].workflow, contentSha256: createHash('sha256').update(mirrorBytes).digest('hex'), gitBlobSha: mirrorBlob },
      ],
    },
    release: {
      version,
      tag: `v${version}`,
      tagObject: commit,
      commit,
      tree,
      bomSha256: hash('f'),
      releaseSetSha256: hash('0'),
      releaseTrustEvidenceSha256: null,
      finalizationReceiptSha256: null,
      assets: Array.from({ length: 6 }, (_, index) => ({ name: `asset-${index}`, digest: `sha256:${hash(String(index))}`, size: index + 1 })),
      packages: versionRows,
    },
    npm,
    consumers,
    dimensions: [
      { dim: 64, capability: plan.dimensions[0].capability, observationRunId: releaseRun.runId },
      { dim: 66, capability: plan.dimensions[1].capability, observationRunId: mirrorRun.runId },
    ],
  }
  return { observation, activeRun, plan }
}

test('standard route accepts the exact five-step repository_dispatch + Verify consumer reality', () => {
  const { observation, activeRun } = fixture()
  assert.equal(validateStandardFiveStepObservation(observation, { repoRoot: ROOT, activeRun }), true)
  assert.equal(observation.authority.mirrorWorkflow.event, 'repository_dispatch')
  assert.deepEqual(observation.consumers.map((item) => item.requiredCheck.name), ['Verify consumer', 'Verify consumer'])
  assert.equal(Object.hasOwn(observation, 'candidateRelease'), false)
  assert.equal(Object.hasOwn(observation, 'externalActivation'), false)
  assert.equal(Object.hasOwn(observation, 'completionAttestor'), false)
})

test('dim 64 and dim 66 share one exact observation digest', () => {
  const { observation, activeRun, plan } = fixture()
  const payloads = buildStandardDimensionPayloads(observation, plan.dimensions)
  assert.equal(payloads[0].receipt.observationSha256, payloads[1].receipt.observationSha256)
  assert.equal(validateStandardFiveStepReceipt(payloads[0].receipt, { repoRoot: ROOT, activeRun }), true)
  const poisoned = clone(payloads[1].receipt)
  poisoned.observation.authority.mirrorWorkflow.event = 'workflow_run'
  assert.throws(() => validateStandardFiveStepReceipt(poisoned, { repoRoot: ROOT, activeRun }), /digest\/shape differs/)
})

for (const [name, mutate, pattern] of [
  ['candidate/external/attestor residue', (value) => { value.candidateRelease = {}; value.externalActivation = {}; value.completionAttestor = {} }, /schema validation failed/],
  ['PR tree differs from tag tree', (value) => { value.authority.pullRequest.mergeTree = oid('9') }, /one exact identity/],
  ['mirror event regresses to workflow_run', (value) => { value.authority.mirrorWorkflow.event = 'workflow_run' }, /mirror workflow run identity differs/],
  ['consumer check regresses to audit', (value) => { value.consumers[0].requiredCheck.name = 'audit' }, /required check identity differs/],
  ['npm differs from BOM', (value) => { value.npm[0].integrity = integrity(9) }, /release\/BOM\/npm\/provenance identity differs/],
  ['consumer lock differs from npm', (value) => { value.consumers[1].packageLock.packages[0].resolved = 'https://registry.npmjs.org/wrong.tgz' }, /exact package lock differs/],
]) {
  test(`standard route rejects ${name}`, () => {
    const { observation, activeRun } = fixture()
    mutate(observation)
    assert.throws(() => validateStandardFiveStepObservation(observation, { repoRoot: ROOT, activeRun }), pattern)
  })
}

test('standard CLI has no staging or import ceremony', () => {
  assert.deepEqual(parseStandardCiEvidenceArgs(['--observe', '--allow-network']), { observe: true, 'allow-network': true })
  assert.throws(() => parseStandardCiEvidenceArgs(['--observe', '--allow-network', '--staging-dir']), /unknown/)
  assert.throws(() => parseStandardCiEvidenceArgs(['--import']), /unknown/)
  assert.throws(() => parseStandardCiEvidenceArgs(['--observe']), /requires --allow-network/)
})

test('standard receipt rejects unsigned post-observation substitution', () => {
  const { observation, activeRun } = fixture()
  const receipt = buildStandardFiveStepReceipt(observation)
  receipt.observation.release.bomSha256 = hash('8')
  assert.throws(() => validateStandardFiveStepReceipt(receipt, { repoRoot: ROOT, activeRun }), /digest\/shape differs/)
})

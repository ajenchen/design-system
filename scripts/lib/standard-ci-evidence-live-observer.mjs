import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GhApiClient } from '../../infra/governance/bin/reconcile-github.mjs'
import { loadActiveDeepAuditRun } from './deep-audit-evidence-contract.mjs'
import { loadStandardCiEvidencePlan, standardCiEvidence } from './standard-ci-evidence.mjs'
import { validateRegistryPackage } from '../release-npm-lib.mjs'
import {
  resolveImmutableReleaseSnapshot,
  validateImmutableReleaseSnapshot,
  TRUSTED_UPGRADE_POLICY,
} from '../verify-upgrade-provenance.mjs'

function fail(message) { throw new Error(`standard five-step live observation blocked:${message}`) }
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const PACKAGE_MANIFESTS = standardCiEvidence.PACKAGE_MANIFESTS

function decodeContent(response, label) {
  if (!response || response.type !== 'file' || response.encoding !== 'base64' || typeof response.content !== 'string') fail(`${label} content response is invalid`)
  const encoded = response.content.replaceAll(/\s/g, '')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded) fail(`${label} content is not canonical base64`)
  return bytes
}

function tree(client, repository, commit) {
  const response = client.request('GET', `/repos/${repository}/git/commits/${commit}`)
  if (!/^[a-f0-9]{40,64}$/.test(response?.tree?.sha ?? '')) fail(`${repository}@${commit} tree identity is invalid`)
  return response.tree.sha
}

function contentIdentity(client, repository, path, ref) {
  const response = client.request('GET', `/repos/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`)
  const bytes = decodeContent(response, `${repository}/${path}@${ref}`)
  return { path, contentSha256: sha256(bytes), gitBlobSha: response.sha, bytes }
}

function mergedPullRequest(client, repository, commit, defaultBranch, { byHead = false } = {}) {
  const response = client.request('GET', `/repos/${repository}/commits/${commit}/pulls?per_page=100`)
  if (!Array.isArray(response) || response.length > 100) fail(`${repository} merged PR readback is invalid`)
  const matches = response.filter((pr) => pr.state === 'closed' && pr.merged_at && pr.base?.ref === defaultBranch
    && (byHead ? pr.head?.sha === commit : pr.merge_commit_sha === commit))
  if (matches.length !== 1) fail(`${repository}@${commit} must map to exactly one merged PR`)
  const pr = matches[0]
  return {
    number: pr.number,
    state: pr.state,
    mergedAt: new Date(pr.merged_at).toISOString(),
    head: pr.head.sha,
    headTree: tree(client, repository, pr.head.sha),
    mergeCommit: pr.merge_commit_sha,
    mergeTree: tree(client, repository, pr.merge_commit_sha),
    baseRef: pr.base.ref,
    baseHead: pr.base.sha,
    title: pr.title,
    body: pr.body ?? '',
  }
}

function normalizeWorkflowPath(path) { return String(path ?? '').replace(/@[^@]+$/, '') }
function normalizeWorkflowRun(run, repository) {
  if (!Number.isSafeInteger(run?.id) || !Number.isSafeInteger(run?.run_attempt)) fail(`${repository} workflow run identity is invalid`)
  return {
    repository,
    path: normalizeWorkflowPath(run.path),
    event: run.event,
    runId: String(run.id),
    runAttempt: run.run_attempt,
    headSha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
  }
}

function workflowRun(client, repository, path, event, headSha) {
  const response = client.request('GET', `/repos/${repository}/actions/workflows/${encodeURIComponent(path)}/runs?event=${encodeURIComponent(event)}&status=completed&per_page=100`)
  if (!response || !Array.isArray(response.workflow_runs)) fail(`${repository}/${path} workflow run response is invalid`)
  const matches = response.workflow_runs.filter((run) => normalizeWorkflowPath(run.path) === path && run.event === event
    && run.head_sha === headSha && run.status === 'completed' && run.conclusion === 'success')
    .sort((left, right) => right.id - left.id)
  if (matches.length === 0) fail(`${repository}/${path} has no successful ${event} run for ${headSha}`)
  return normalizeWorkflowRun(matches[0], repository)
}

function checkRun(client, repository, headSha, expected) {
  const response = client.request('GET', `/repos/${repository}/commits/${headSha}/check-runs?per_page=100`)
  if (!response || !Array.isArray(response.check_runs)) fail(`${repository}@${headSha} check-run response is invalid`)
  const matches = response.check_runs.filter((run) => run.name === expected.context && run.head_sha === headSha
    && run.app?.id === expected.integration.id && run.app?.slug === expected.integration.slug
    && run.status === 'completed' && run.conclusion === 'success').sort((left, right) => right.id - left.id)
  if (matches.length === 0) fail(`${repository}@${headSha} lacks ${expected.context}`)
  for (const run of matches) {
    const match = String(run.details_url ?? '').match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/([1-9][0-9]*)(?:\/.*)?$/)
    if (!match) continue
    const workflow = normalizeWorkflowRun(client.request('GET', `/repos/${repository}/actions/runs/${match[1]}`), repository)
    if (expected.workflow && (workflow.path !== expected.workflow
      || workflow.event !== expected.event
      || workflow.headSha !== (expected.workflowHeadSha ?? headSha))) continue
    return {
      name: run.name,
      headSha: run.head_sha,
      status: run.status,
      conclusion: run.conclusion,
      appId: run.app.id,
      appSlug: run.app.slug,
      workflowRun: workflow,
    }
  }
  fail(`${repository} ${expected.context} does not bind the required GitHub Actions producer`)
}

function mainHead(client, repo) {
  const response = client.request('GET', `/repos/${repo.github}/commits/${encodeURIComponent(repo.defaultBranch)}`)
  if (!/^[a-f0-9]{40,64}$/.test(response?.sha ?? '')) fail(`${repo.id} protected-main head is invalid`)
  return { head: response.sha, tree: tree(client, repo.github, response.sha) }
}

function lockReadback(client, repo, head, packageNames) {
  const response = client.request('GET', `/repos/${repo.github}/contents/package-lock.json?ref=${encodeURIComponent(head)}`)
  const bytes = decodeContent(response, `${repo.id} package-lock.json`)
  let lock
  try { lock = JSON.parse(bytes.toString('utf8')) } catch { fail(`${repo.id} package-lock.json is invalid JSON`) }
  return {
    path: 'package-lock.json',
    sha256: sha256(bytes),
    packages: packageNames.map((name) => {
      const item = lock.packages?.[`node_modules/${name}`]
      if (!item) fail(`${repo.id} package-lock.json lacks ${name}`)
      return { name, version: item.version, integrity: item.integrity, resolved: item.resolved }
    }),
  }
}

export async function collectStandardFiveStepLiveObservation(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['repoRoot', 'client', 'releaseLookup', 'npmValidator', 'now'].includes(key))) {
    fail('observer options contain an unsupported override')
  }
  const repoRoot = resolve(options.repoRoot ?? process.cwd())
  const client = options.client ?? new GhApiClient()
  const now = options.now ?? new Date()
  const releaseLookup = options.releaseLookup ?? resolveImmutableReleaseSnapshot
  const npmValidator = options.npmValidator ?? validateRegistryPackage
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('observer clock is invalid')
  const activeRun = loadActiveDeepAuditRun({ repoRoot, requireCurrent: true })
  const { plan, planSha256 } = loadStandardCiEvidencePlan({ repoRoot })
  const workflow = JSON.parse(readFileSync(resolve(repoRoot, plan.workflowPlan), 'utf8'))
  const inventory = JSON.parse(readFileSync(resolve(repoRoot, 'infra/governance/inventory/managed-repos.json'), 'utf8'))
  const desired = JSON.parse(readFileSync(resolve(repoRoot, 'infra/governance/desired/github.json'), 'utf8'))
  const authorityRepo = inventory.repositories.find((repo) => repo.id === plan.authority.repositoryId)
  const authorityProfile = desired.profiles[authorityRepo.desiredProfile]
  const authorityCheckPolicy = authorityProfile.requiredChecks.find((item) => item.context === plan.authority.requiredCheck)
  const authorityPr = mergedPullRequest(client, authorityRepo.github, activeRun.manifest.head, authorityRepo.defaultBranch, { byHead: true })
  const releaseCommit = authorityPr.mergeCommit
  const protectedMain = mainHead(client, authorityRepo)
  const versionRows = Object.entries(PACKAGE_MANIFESTS).map(([name, manifestPath]) => ({
    name, manifestPath, version: JSON.parse(readFileSync(resolve(repoRoot, manifestPath), 'utf8')).version,
  }))
  const version = versionRows[0].version
  if (!versionRows.every((item) => item.version === version)) fail('local release package versions differ')
  const tag = `v${version}`
  const releaseWorkflow = workflowRun(client, authorityRepo.github, plan.dimensions[0].workflow, plan.dimensions[0].event, releaseCommit)
  const mirrorWorkflow = workflowRun(client, authorityRepo.github, plan.dimensions[1].workflow, plan.dimensions[1].event, releaseCommit)
  const snapshot = await releaseLookup({
    repository: authorityRepo.github,
    tag,
    assetName: TRUSTED_UPGRADE_POLICY.releaseBomAsset,
    ordinaryRelease: true,
  })
  let bom
  try { bom = JSON.parse(snapshot.assetBodies[TRUSTED_UPGRADE_POLICY.releaseBomAsset].toString('utf8')) } catch { fail('immutable release BOM is invalid JSON') }
  const npm = []
  for (const item of bom.packages) {
    npm.push(await npmValidator('npm', item, {
      repository: authorityRepo.github,
      workflow: TRUSTED_UPGRADE_POLICY.workflow,
      workflowRef: TRUSTED_UPGRADE_POLICY.workflowRef,
      builderId: TRUSTED_UPGRADE_POLICY.builderId,
      gitHead: releaseCommit,
    }))
  }
  const immutable = validateImmutableReleaseSnapshot({
    ...snapshot,
    packages: npm.map(({ name, version: itemVersion, integrity }) => ({ name, version: itemVersion, integrity })),
    version,
    policy: TRUSTED_UPGRADE_POLICY,
    ordinaryRelease: true,
  })
  const releasePackages = versionRows.map((local) => {
    const item = bom.packages.find((candidate) => candidate.name === local.name)
    if (!item) fail(`release BOM lacks ${local.name}`)
    return { ...local, integrity: item.integrity, shasum: item.shasum }
  })
  const authorityWorkflowIdentities = [authorityCheckPolicy.workflow, ...plan.dimensions.map((item) => item.workflow)].map((path) => {
    const ref = path === authorityCheckPolicy.workflow ? activeRun.manifest.head : releaseCommit
    const { bytes: _bytes, ...identity } = contentIdentity(client, authorityRepo.github, path, ref)
    return identity
  })
  const consumers = []
  for (const planned of plan.consumers) {
    const repo = inventory.repositories.find((item) => item.id === planned.repositoryId)
    const profile = desired.profiles[repo.desiredProfile]
    const checkPolicy = profile.requiredChecks.find((item) => item.context === planned.requiredCheck)
    const releaseTarget = workflow.automation.consumers.find((target) => target.repository === repo.github)
    if (!releaseTarget || releaseTarget.requiredCheck?.context !== checkPolicy?.context) fail(`${repo.id} release/check SSOT differs`)
    const consumerMain = mainHead(client, repo)
    const sourcePullRequest = mergedPullRequest(client, repo.github, consumerMain.head, repo.defaultBranch)
    const packageNames = releaseTarget.packages
    const audit = contentIdentity(client, repo.github, checkPolicy.workflow, consumerMain.head)
    consumers.push({
      repositoryId: repo.id,
      role: repo.role,
      repository: repo.github,
      defaultBranch: repo.defaultBranch,
      protectedMain: consumerMain,
      sourcePullRequest,
      sourceWorkflow: planned.role === 'template-mirror'
        ? mirrorWorkflow
        : workflowRun(client, repo.github, planned.sourceWorkflow, planned.sourceEvent, sourcePullRequest.baseHead),
      packageLock: lockReadback(client, repo, consumerMain.head, packageNames),
      auditWorkflow: { path: audit.path, contentSha256: audit.contentSha256, gitBlobSha: audit.gitBlobSha },
      requiredCheck: checkRun(client, repo.github, sourcePullRequest.head, {
        context: releaseTarget.requiredCheck.context,
        integration: desired.integrations[checkPolicy.integration],
        workflow: releaseTarget.requiredCheck.producerWorkflow,
        event: releaseTarget.requiredCheck.producerEvent,
        workflowHeadSha: releaseTarget.requiredCheck.producerHead === 'pull-request-base'
          ? sourcePullRequest.baseHead
          : sourcePullRequest.head,
      }),
    })
  }
  return {
    schemaVersion: 1,
    kind: 'standard-five-step-live-ci-observation',
    profile: workflow.profile,
    planSha256,
    observedAt: now.toISOString(),
    runBinding: {
      runId: activeRun.manifest.runId,
      manifestSha256: activeRun.manifestSha256,
      head: activeRun.manifest.head,
      tree: activeRun.manifest.tree,
    },
    authority: {
      repository: authorityRepo.github,
      defaultBranch: authorityRepo.defaultBranch,
      pullRequest: authorityPr,
      protectedMain,
      requiredCheck: checkRun(client, authorityRepo.github, activeRun.manifest.head, {
        context: authorityCheckPolicy.context,
        integration: desired.integrations[authorityCheckPolicy.integration],
        workflow: authorityCheckPolicy.workflow,
        event: 'pull_request',
      }),
      releaseWorkflow,
      mirrorWorkflow,
      workflowIdentities: authorityWorkflowIdentities,
    },
    release: {
      version,
      tag: immutable.tag,
      tagObject: immutable.tagObject,
      commit: immutable.gitCommit,
      tree: immutable.gitTree,
      bomSha256: immutable.bomSha256,
      releaseSetSha256: immutable.releaseSetSha256,
      releaseTrustEvidenceSha256: immutable.releaseTrustEvidenceSha256,
      finalizationReceiptSha256: immutable.finalizationReceiptSha256,
      assets: immutable.assets.map(({ name, digest: assetDigest, size }) => ({ name, digest: assetDigest, size })),
      packages: releasePackages,
    },
    npm,
    consumers,
    dimensions: plan.dimensions.map((item, index) => ({
      dim: item.dim,
      capability: item.capability,
      observationRunId: index === 0 ? releaseWorkflow.runId : mirrorWorkflow.runId,
    })),
  }
}

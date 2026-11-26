import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  CONSUMER_NOT_REQUESTED_STATUS,
  CONSUMER_OWNED_MERGE_STATUS,
  RELEASE_REQUESTED_CONSUMERS_ENV,
  consumerBlocksRelease,
  consumerMergeMode,
  consumerUpgradeMode,
  selectReleaseConsumers,
} from './release-consumer-selection.mjs'

const PLAN_PATH = 'scripts/standard-ci-evidence-plan.json'
const CONSUMER_SELECTION_IMPLEMENTATION = 'scripts/lib/release-consumer-selection.mjs'
const SCHEMA_PATH = 'scripts/schemas/standard-ci-evidence-observation.schema.json'
const PACKAGE_MANIFESTS = Object.freeze({
  '@qijenchen/design-system': 'packages/design-system/package.json',
  '@qijenchen/governance': 'packages/governance/package.json',
  '@qijenchen/storybook-config': 'packages/storybook-config/package.json',
})

function fail(message) { throw new Error(`standard five-step CI evidence blocked:${message}`) }
const stable = (value) => JSON.stringify(normalize(value))
const normalize = (value) => Array.isArray(value)
  ? value.map(normalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]))
    : value
const digest = (value) => createHash('sha256').update(value).digest('hex')
const same = (left, right) => stable(left) === stable(right)

export function loadStandardCiEvidencePlan({ repoRoot = process.cwd() } = {}) {
  const bytes = readFileSync(resolve(repoRoot, PLAN_PATH))
  const plan = JSON.parse(bytes)
  if (plan.schemaVersion !== 1 || plan.kind !== 'standard-five-step-ci-evidence-plan'
    || plan.profile !== 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM'
    || !same(plan.steps, ['pr-checks', 'merge', 'publish', 'readback', 'consumer'])
    || !same(plan.dimensions.map(({ dim, event }) => ({ dim, event })), [
      { dim: 64, event: 'repository_dispatch' },
      { dim: 66, event: 'repository_dispatch' },
    ])
    || plan.legacyMaximumAssurance?.blocking !== false) fail('canonical plan identity is invalid')
  // plan 裡對 consumer 選法的說明必須跟實作同一份,否則就是一段沒有執行面的註解
  if (plan.consumerSelection?.implementation !== CONSUMER_SELECTION_IMPLEMENTATION
    || plan.consumerSelection?.requestEnv !== RELEASE_REQUESTED_CONSUMERS_ENV
    || plan.consumerSelection?.notRequestedStatus !== CONSUMER_NOT_REQUESTED_STATUS
    || plan.consumerSelection?.consumerOwnedStatus !== CONSUMER_OWNED_MERGE_STATUS) fail('canonical plan consumer selection differs from the release orchestrator implementation')
  return { plan, planSha256: digest(bytes), path: PLAN_PATH }
}

/**
 * 這次發版的 consumer 證據範圍。選法只 import `release-consumer-selection.mjs`(orchestrator 用的同一支),三種去處:
 * - selected:被選中、而且是第五步完成條件的 consumer(合併由 orchestrator 負責)→ 必須有「已合併、已讀回」的升級證據。
 * - consumerOwned:被選中、但 `merge: consumer-owned`(產品 canary)→ 發版只替它開升級 PR,合不合由它自己決定;
 *   不得要求它的升級證據(否則稽核會逼人去合併別人的 PR),也不得讓它從 observation 裡默默消失。
 * - notRequested:沒被選中的(on-request 且 user 本次沒要求)→ 記成「本次未要求升級」,同樣不要求證據、不准消失。
 */
export function standardConsumerSelection({ plan, workflow, inventory, desired, requested }) {
  if (!Array.isArray(requested) || requested.some((item) => typeof item !== 'string' || item.length === 0)) fail('requested consumer list is invalid')
  const selectedRepositories = new Set(selectReleaseConsumers(workflow.automation.consumers, requested).map((target) => target.repository))
  const selected = []
  const notRequested = []
  const consumerOwned = []
  for (const planned of plan.consumers) {
    const repo = inventory.repositories.find((item) => item.id === planned.repositoryId)
    const profile = repo ? desired.profiles[repo.desiredProfile] : undefined
    const checkPolicy = profile?.requiredChecks.find((item) => item.context === planned.requiredCheck)
    const releaseTarget = repo ? workflow.automation.consumers.find((target) => target.repository === repo.github) : undefined
    if (!repo || !releaseTarget || releaseTarget.requiredCheck?.context !== checkPolicy?.context) fail(`${planned.repositoryId} release/check SSOT differs`)
    if (!selectedRepositories.has(repo.github)) {
      notRequested.push({
        repositoryId: repo.id,
        repository: repo.github,
        upgrade: consumerUpgradeMode(releaseTarget),
        status: CONSUMER_NOT_REQUESTED_STATUS,
      })
    } else if (consumerBlocksRelease(releaseTarget)) {
      selected.push({ planned, repo, checkPolicy, releaseTarget })
    } else {
      consumerOwned.push({
        repositoryId: repo.id,
        repository: repo.github,
        merge: consumerMergeMode(releaseTarget),
        status: CONSUMER_OWNED_MERGE_STATUS,
      })
    }
  }
  return { requested: [...requested], selected, notRequested, consumerOwned }
}

function expectedContext(repoRoot) {
  const { plan, planSha256 } = loadStandardCiEvidencePlan({ repoRoot })
  const workflow = JSON.parse(readFileSync(resolve(repoRoot, plan.workflowPlan), 'utf8'))
  const inventory = JSON.parse(readFileSync(resolve(repoRoot, 'infra/governance/inventory/managed-repos.json'), 'utf8'))
  const desired = JSON.parse(readFileSync(resolve(repoRoot, 'infra/governance/desired/github.json'), 'utf8'))
  if (workflow.profile !== plan.profile || !same(workflow.steps.map((step) => step.id), plan.steps)) fail('release workflow and evidence plan differ')
  return { plan, planSha256, workflow, inventory, desired }
}

function validateWorkflowRun(run, expected, label) {
  if (run.repository !== expected.repository || run.path !== expected.path || run.event !== expected.event
    || run.headSha !== expected.headSha || run.status !== 'completed' || run.conclusion !== 'success') {
    fail(`${label} workflow run identity differs`)
  }
}

function validateCheck(check, expected, label) {
  if (check.name !== expected.context || check.headSha !== expected.headSha || check.appId !== expected.integration.id
    || check.appSlug !== expected.integration.slug || check.status !== 'completed' || check.conclusion !== 'success') {
    fail(`${label} required check identity differs`)
  }
  validateWorkflowRun(check.workflowRun, {
    repository: expected.repository,
    path: expected.workflow,
    event: expected.event,
    headSha: expected.workflowHeadSha ?? expected.headSha,
  }, `${label} producer`)
}

function validateWorkflowIdentity(identity, expected, label) {
  if (identity.path !== expected.path || identity.contentSha256 !== expected.contentSha256
    || identity.gitBlobSha !== expected.gitBlobSha) fail(`${label} workflow bytes differ from SSOT`)
}

export function validateStandardFiveStepObservation(observation, {
  repoRoot = process.cwd(),
  activeRun,
} = {}) {
  const schema = JSON.parse(readFileSync(resolve(repoRoot, SCHEMA_PATH), 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  if (!validate(observation)) fail(`schema validation failed:${ajv.errorsText(validate.errors, { separator: '; ' })}`)
  if (!activeRun?.manifest || !activeRun.manifestSha256) fail('active immutable run is required')
  const { plan, planSha256, workflow, inventory, desired } = expectedContext(repoRoot)
  if (observation.planSha256 !== planSha256 || observation.profile !== workflow.profile) fail('observation plan/profile binding differs')
  const expectedRunBinding = {
    runId: activeRun.manifest.runId,
    manifestSha256: activeRun.manifestSha256,
    head: activeRun.manifest.head,
    tree: activeRun.manifest.tree,
  }
  if (!same(observation.runBinding, expectedRunBinding)) fail('observation belongs to a different immutable run')

  const version = observation.release.version
  const tag = `v${version}`
  const localPackages = Object.entries(PACKAGE_MANIFESTS).map(([name, manifestPath]) => {
    const manifest = JSON.parse(readFileSync(resolve(repoRoot, manifestPath), 'utf8'))
    return { name, manifestPath, version: manifest.version }
  })
  if (!localPackages.every((item) => item.version === version) || observation.release.tag !== tag) fail('local package version/tag identity differs')
  const authorityRepo = inventory.repositories.find((repo) => repo.id === plan.authority.repositoryId)
  const authorityProfile = desired.profiles[authorityRepo.desiredProfile]
  const authorityCheck = authorityProfile.requiredChecks.find((check) => check.context === plan.authority.requiredCheck)
  const integration = desired.integrations[authorityCheck.integration]
  const transition = observation.authority.pullRequest
  const exactTree = activeRun.manifest.tree
  if (observation.authority.repository !== authorityRepo.github || observation.authority.defaultBranch !== authorityRepo.defaultBranch
    || transition.head !== activeRun.manifest.head || transition.headTree !== exactTree
    || transition.mergeTree !== exactTree || observation.release.tree !== exactTree
    || transition.mergeCommit !== observation.release.commit
    || observation.authority.protectedMain.head !== observation.release.commit
    || observation.authority.protectedMain.tree !== exactTree || transition.baseRef !== authorityRepo.defaultBranch) {
    fail('active PR tree, squash-merge tree, protected main, and release tag tree are not one exact identity')
  }
  validateCheck(observation.authority.requiredCheck, {
    context: authorityCheck.context, integration, repository: authorityRepo.github,
    workflow: authorityCheck.workflow, event: 'pull_request', headSha: activeRun.manifest.head,
  }, 'authority')
  validateWorkflowRun(observation.authority.releaseWorkflow, {
    repository: authorityRepo.github, path: plan.dimensions[0].workflow,
    event: plan.dimensions[0].event, headSha: observation.release.commit,
  }, 'release')
  validateWorkflowRun(observation.authority.mirrorWorkflow, {
    repository: authorityRepo.github, path: plan.dimensions[1].workflow,
    event: plan.dimensions[1].event, headSha: observation.release.commit,
  }, 'mirror')
  const workflowIdentities = new Map(observation.authority.workflowIdentities.map((item) => [item.path, item]))
  validateWorkflowIdentity(workflowIdentities.get(authorityCheck.workflow), { path: authorityCheck.workflow, ...authorityCheck.workflowIdentity }, 'authority check')
  validateWorkflowIdentity(workflowIdentities.get(plan.dimensions[0].workflow), { path: plan.dimensions[0].workflow, ...authorityProfile.tagPolicy.sourceWorkflowIdentity }, 'release')
  const mirrorBytes = readFileSync(resolve(repoRoot, plan.dimensions[1].workflow))
  const mirrorBlob = createHash('sha1').update(`blob ${mirrorBytes.length}\0`).update(mirrorBytes).digest('hex')
  validateWorkflowIdentity(workflowIdentities.get(plan.dimensions[1].workflow), {
    path: plan.dimensions[1].workflow, contentSha256: digest(mirrorBytes), gitBlobSha: mirrorBlob,
  }, 'mirror')

  if (!same(observation.release.packages.map(({ name, manifestPath, version: itemVersion }) => ({ name, manifestPath, version: itemVersion })), localPackages)) {
    fail('release BOM package manifests do not match local SSOT')
  }
  const releaseByName = new Map(observation.release.packages.map((item) => [item.name, item]))
  const npmByName = new Map(observation.npm.map((item) => [item.name, item]))
  if (releaseByName.size !== 3 || npmByName.size !== 3) fail('release/npm package closure is incomplete')
  for (const local of localPackages) {
    const releasePackage = releaseByName.get(local.name)
    const npmPackage = npmByName.get(local.name)
    if (!releasePackage || !npmPackage || npmPackage.version !== version
      || npmPackage.integrity !== releasePackage.integrity || npmPackage.shasum !== releasePackage.shasum
      || npmPackage.repository !== authorityRepo.github || npmPackage.workflow !== plan.dimensions[0].workflow
      || npmPackage.gitCommit !== observation.release.commit) fail(`release/BOM/npm/provenance identity differs:${local.name}`)
  }

  // 只要求「這次發版實際被選中、而且是第五步完成條件的 consumer」的證據;選法與 orchestrator 第五步同一支實作
  const selection = standardConsumerSelection({ plan, workflow, inventory, desired, requested: observation.consumerSelection.requested })
  const consumerById = new Map(observation.consumers.map((item) => [item.repositoryId, item]))
  if (consumerById.size !== observation.consumers.length) fail('consumer closure contains a duplicate repository')
  for (const skipped of selection.notRequested) {
    if (consumerById.has(skipped.repositoryId)) fail(`${skipped.repositoryId} was not requested for this release but carries consumer upgrade evidence`)
  }
  if (!same(observation.consumerSelection.notRequested, selection.notRequested)) {
    fail('not-requested consumer record differs from the release selection; an unselected consumer must be recorded as not-requested-this-release, never dropped')
  }
  for (const owned of selection.consumerOwned) {
    if (consumerById.has(owned.repositoryId)) fail(`${owned.repositoryId} merges its own upgrade PR (consumer-owned) but carries consumer upgrade evidence; its merge is not a completion condition of this release`)
  }
  if (!same(observation.consumerSelection.consumerOwned, selection.consumerOwned)) {
    fail('consumer-owned consumer record differs from the release selection; a consumer whose merge is consumer-owned must be recorded as pull-request-only, never dropped and never required to be merged')
  }
  for (const { planned: expectedConsumer, repo, checkPolicy: check, releaseTarget } of selection.selected) {
    const item = consumerById.get(repo.id)
    if (!item) fail(`${repo.id} is selected for this release (${consumerUpgradeMode(releaseTarget)}) but has no consumer upgrade evidence`)
    if (item.role !== repo.role || item.repository !== repo.github || item.defaultBranch !== repo.defaultBranch
      || item.sourcePullRequest.mergeCommit !== item.protectedMain.head || item.sourcePullRequest.mergeTree !== item.protectedMain.tree
      || item.sourcePullRequest.baseRef !== repo.defaultBranch
      || !`${item.sourcePullRequest.title}\n${item.sourcePullRequest.body}`.includes(version)
      || !`${item.sourcePullRequest.title}\n${item.sourcePullRequest.body}`.includes(observation.release.commit)) {
      fail(`${repo.id} source PR/protected-main release binding differs`)
    }
    validateWorkflowRun(item.sourceWorkflow, {
      repository: expectedConsumer.role === 'template-mirror' ? authorityRepo.github : repo.github,
      path: expectedConsumer.sourceWorkflow, event: expectedConsumer.sourceEvent,
      headSha: expectedConsumer.role === 'template-mirror' ? observation.release.commit : item.sourcePullRequest.baseHead,
    }, `${repo.id} source`)
    validateWorkflowIdentity(item.auditWorkflow, { path: check.workflow, ...check.workflowIdentity }, `${repo.id} audit`)
    validateCheck(item.requiredCheck, {
      context: check.context, integration: desired.integrations[check.integration], repository: repo.github,
      workflow: releaseTarget.requiredCheck.producerWorkflow,
      event: releaseTarget.requiredCheck.producerEvent,
      headSha: item.sourcePullRequest.head,
      workflowHeadSha: releaseTarget.requiredCheck.producerHead === 'pull-request-base'
        ? item.sourcePullRequest.baseHead
        : item.sourcePullRequest.head,
    }, repo.id)
    const locks = new Map(item.packageLock.packages.map((entry) => [entry.name, entry]))
    for (const name of releaseTarget.packages) {
      const locked = locks.get(name)
      const published = npmByName.get(name)
      if (!locked || !published || locked.version !== version || locked.integrity !== published.integrity
        || locked.resolved !== published.tarball) fail(`${repo.id} exact package lock differs:${name}`)
    }
  }
  if (consumerById.size !== selection.selected.length) fail('consumer closure contains an unknown, unselected, or duplicate repository')
  const dimensions = observation.dimensions.map((item) => ({ dim: item.dim, capability: item.capability, observationRunId: item.observationRunId }))
  const expectedDimensions = plan.dimensions.map((item, index) => ({
    dim: item.dim, capability: item.capability,
    observationRunId: index === 0 ? observation.authority.releaseWorkflow.runId : observation.authority.mirrorWorkflow.runId,
  }))
  if (!same(dimensions, expectedDimensions)) fail('dimension workflow bindings differ')
  return true
}

export function buildStandardFiveStepReceipt(observation) {
  return {
    contract: 'standard-five-step-live-observation-v1',
    observationSha256: digest(stable(observation)),
    observation,
  }
}

export function buildStandardDimensionPayloads(observation, dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length !== 2) fail('standard dimension closure must contain exactly two dimensions')
  const receipt = buildStandardFiveStepReceipt(observation)
  return dimensions.map(({ dim, capability }) => ({ dim, capability, receipt }))
}

export function validateStandardFiveStepReceipt(receipt, options = {}) {
  if (!receipt || Object.keys(receipt).sort().join(',') !== 'contract,observation,observationSha256'
    || receipt.contract !== 'standard-five-step-live-observation-v1'
    || receipt.observationSha256 !== digest(stable(receipt.observation))) fail('standard receipt digest/shape differs')
  validateStandardFiveStepObservation(receipt.observation, options)
  return true
}

export const standardCiEvidence = Object.freeze({ PLAN_PATH, SCHEMA_PATH, PACKAGE_MANIFESTS })

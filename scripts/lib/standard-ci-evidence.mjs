import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const PLAN_PATH = 'scripts/standard-ci-evidence-plan.json'
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
  return { plan, planSha256: digest(bytes), path: PLAN_PATH }
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

  const consumerById = new Map(observation.consumers.map((item) => [item.repositoryId, item]))
  for (const expectedConsumer of plan.consumers) {
    const repo = inventory.repositories.find((item) => item.id === expectedConsumer.repositoryId)
    const item = consumerById.get(repo.id)
    const profile = desired.profiles[repo.desiredProfile]
    const check = profile.requiredChecks.find((candidate) => candidate.context === expectedConsumer.requiredCheck)
    if (!item || item.role !== repo.role || item.repository !== repo.github || item.defaultBranch !== repo.defaultBranch
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
      workflow: check.workflow, event: check.requiredEvents[0], headSha: item.sourcePullRequest.head,
      workflowHeadSha: check.requiredEvents[0] === 'repository_dispatch'
        ? item.sourcePullRequest.baseHead
        : item.sourcePullRequest.head,
    }, repo.id)
    const locks = new Map(item.packageLock.packages.map((entry) => [entry.name, entry]))
    for (const name of workflow.automation.consumers.find((target) => target.repository === repo.github).packages) {
      const locked = locks.get(name)
      const published = npmByName.get(name)
      if (!locked || !published || locked.version !== version || locked.integrity !== published.integrity
        || locked.resolved !== published.tarball) fail(`${repo.id} exact package lock differs:${name}`)
    }
  }
  if (consumerById.size !== plan.consumers.length) fail('consumer closure contains an unknown or duplicate repository')
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

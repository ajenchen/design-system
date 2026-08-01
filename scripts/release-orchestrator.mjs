#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW_PATH = resolve(ROOT, 'infra/governance/release-workflow.json')
const PACKAGE_PATHS = Object.freeze({
  '@qijenchen/design-system': 'packages/design-system/package.json',
  '@qijenchen/governance': 'packages/governance/package.json',
  '@qijenchen/storybook-config': 'packages/storybook-config/package.json',
})
const SUCCESS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped'])
const PENDING_STATUSES = new Set(['queued', 'in_progress', 'pending', 'requested', 'waiting'])

export class HumanBoundaryError extends Error {
  constructor(boundary, message) {
    super(message)
    this.name = 'HumanBoundaryError'
    this.boundary = boundary
  }
}

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function validateReleaseWorkflow(workflow) {
  invariant(workflow?.schemaVersion === 1, 'release workflow schemaVersion must be 1')
  invariant(workflow.profile === 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM', 'release workflow must use the standard small-team profile')
  invariant(workflow.decisionAuthority?.engineering === 'AUTO', 'release engineering authority must be AUTO')
  invariant(workflow.decisionAuthority?.ask === 'unresolved-product-ui-ux-ssot-choice', 'only unresolved product/UI/UX SSOT choices may ASK')
  invariant(
    JSON.stringify(workflow.decisionAuthority?.humanOnly) === JSON.stringify(['login', 'mfa', 'oauth', 'credential-reference']),
    'human-only boundaries must be exactly login/MFA/OAuth/credential-reference',
  )
  invariant(workflow.decisionAuthority?.resumeAfterHumanAction === 'AUTO', 'release must resume automatically after a human-only action')
  invariant(
    JSON.stringify(workflow.steps?.map(step => step.id)) === JSON.stringify(['pr-checks', 'merge', 'publish', 'readback', 'consumer']),
    'release workflow must contain exactly the canonical five steps in order',
  )
  invariant(workflow.steps.every(step => step.authority === 'AUTO'), 'every release step must be AUTO')
  invariant(workflow.legacyMechanisms.every(item => item.standardRelease === 'non-blocking' || item.standardRelease === 'retired'), 'legacy mechanisms must not block standard release')
  return workflow
}

export function loadReleaseWorkflow(path = WORKFLOW_PATH) {
  return validateReleaseWorkflow(readJson(path))
}

function run(command, args, { allowFailure = false, input } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    const detail = `${result.stderr || result.stdout}`.trim()
    if (/authentication|not logged|login|oauth|token.*required|HTTP 401/i.test(detail)) {
      throw new HumanBoundaryError('login/oauth/credential-reference', detail || `${command} authentication is required`)
    }
    if (/two.factor|2fa|mfa/i.test(detail)) {
      throw new HumanBoundaryError('mfa', detail)
    }
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() }
}

function gh(args, options) {
  return run('gh', args, options)
}

function ghJson(args, { allowFailure = false, input } = {}) {
  const result = gh(args, { allowFailure, input })
  if (!result.ok || result.stdout === '') return null
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`gh returned non-JSON output for ${args.join(' ')}`)
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function packageVersion(workflow) {
  const versions = workflow.automation.packages.map(name => {
    const path = PACKAGE_PATHS[name]
    invariant(path, `no local manifest is registered for ${name}`)
    return readJson(resolve(ROOT, path)).version
  })
  invariant(versions.every(version => version === versions[0]), `release package versions differ: ${versions.join(', ')}`)
  invariant(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(versions[0]), `invalid release version: ${versions[0]}`)
  return versions[0]
}

function checkRollupStatus(rollup = []) {
  if (rollup.length === 0) return 'pending'
  if (rollup.some(item => {
    const bucket = `${item.bucket || ''}`.toLowerCase()
    const state = `${item.state || ''}`.toLowerCase()
    const conclusion = `${item.conclusion || ''}`.toLowerCase()
    return bucket === 'fail' || bucket === 'cancel'
      || ['error', 'failure'].includes(state)
      || ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(conclusion)
  })) return 'failed'
  if (rollup.some(item => {
    const bucket = `${item.bucket || ''}`.toLowerCase()
    const state = `${item.state || ''}`.toLowerCase()
    return bucket === 'pending' || ['expected', 'pending'].includes(state)
      || PENDING_STATUSES.has(`${item.status || ''}`.toLowerCase())
  })) return 'pending'
  return rollup.every(item => {
    const bucket = `${item.bucket || ''}`.toLowerCase()
    const state = `${item.state || ''}`.toLowerCase()
    return bucket === 'pass' || bucket === 'skipping' || state === 'success'
      || SUCCESS_CONCLUSIONS.has(`${item.conclusion || ''}`.toLowerCase())
  }) ? 'complete' : 'pending'
}

export function selectPublishRun(rows, protectedMainSha) {
  return Array.isArray(rows)
    ? rows.find(row => row.event === 'repository_dispatch' && row.headSha === protectedMainSha) || null
    : null
}

function latestRun(repository, workflowFile, protectedMainSha) {
  const rows = ghJson([
    'run', 'list', '--repo', repository, '--workflow', workflowFile, '--limit', '20',
    '--json', 'databaseId,status,conclusion,headSha,event,createdAt,url',
  ], { allowFailure: true })
  return selectPublishRun(rows, protectedMainSha)
}

export function buildPullRequestLookupArgs(repository, branch) {
  const fields = 'number,state,mergeStateStatus,mergeable,headRefOid,statusCheckRollup,url'
  return {
    view: ['pr', 'view', '--repo', repository, branch, '--json', fields],
    allStates: ['pr', 'list', '--repo', repository, '--state', 'all', '--head', branch, '--limit', '1', '--json', fields],
  }
}

function currentPullRequest(repository, branch, defaultBranch) {
  if (branch === defaultBranch) return null
  const lookup = buildPullRequestLookupArgs(repository, branch)
  const viewed = ghJson(lookup.view, { allowFailure: true })
  if (viewed) return withRequiredChecks(repository, viewed)
  const rows = ghJson(lookup.allStates, { allowFailure: true })
  return Array.isArray(rows) && rows[0] ? withRequiredChecks(repository, rows[0]) : null
}

function requiredPullRequestChecks(repository, number) {
  const result = gh([
    'pr', 'checks', `${number}`, '--repo', repository, '--required',
    '--json', 'bucket,name,state,workflow',
  ], { allowFailure: true })
  if (result.stdout === '') {
    if (!result.ok && !/no (?:required )?checks reported/i.test(result.stderr)) {
      throw new Error(`cannot read required checks for ${repository}#${number}: ${result.stderr}`)
    }
    return []
  }
  try {
    const rows = JSON.parse(result.stdout)
    return Array.isArray(rows) ? rows : []
  } catch {
    throw new Error(`required check readback for ${repository}#${number} was not JSON`)
  }
}

function withRequiredChecks(repository, pullRequest) {
  return { ...pullRequest, requiredChecks: requiredPullRequestChecks(repository, pullRequest.number) }
}

function matchingConsumerPullRequest(repository, version) {
  const rows = ghJson([
    'pr', 'list', '--repo', repository, '--state', 'open', '--limit', '50',
    '--json', 'number,title,headRefName,headRefOid,statusCheckRollup,url',
  ], { allowFailure: true })
  if (!Array.isArray(rows)) return null
  const found = rows.find(row => `${row.title}\n${row.headRefName}`.includes(version)) || null
  return found ? withRequiredChecks(repository, found) : null
}

export function buildPublishedTemplatePullRequestCreateArgs(target, { version, commit }) {
  invariant(target.delivery === 'release-published-pr', `consumer ${target.repository} is not published-template driven`)
  invariant(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version), `invalid published-template version: ${version}`)
  invariant(/^[a-f0-9]{40}$/.test(commit), `invalid published-template release commit: ${commit}`)
  const tag = `v${version}`
  const branch = `automation/release-${tag}`
  return {
    branch,
    args: [
      'pr', 'create', '--repo', target.repository,
      '--head', branch, '--base', target.defaultBranch,
      '--title', `chore: mirror design system ${tag}`,
      '--body', `Generated from published design-system release ${tag} at ${commit}.`,
    ],
  }
}

function publishedTemplateBranchExists(target, version) {
  const branch = `automation/release-v${version}`
  return Boolean(ghJson([
    'api', `repos/${target.repository}/branches/${encodeURIComponent(branch)}`,
  ], { allowFailure: true }))
}

function readConsumerLock(target) {
  const result = gh([
    'api', `repos/${target.repository}/contents/${target.readbackPath}?ref=${encodeURIComponent(target.defaultBranch)}`,
    '-H', 'Accept: application/vnd.github.raw+json',
  ], { allowFailure: true })
  if (!result.ok || result.stdout === '') return null
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

function consumerPackageReadback(target, version) {
  const lock = readConsumerLock(target)
  const packages = lock?.packages
  if (!packages || typeof packages !== 'object') return false
  return target.packages.every(name => packages[`node_modules/${name}`]?.version === version)
}

function npmPackageReadback(name, version) {
  const result = run('npm', ['view', `${name}@${version}`, 'version', '--json'], { allowFailure: true })
  if (!result.ok || result.stdout === '') return false
  try {
    return JSON.parse(result.stdout) === version
  } catch {
    return false
  }
}

export function buildFiveStepStatus(workflow, observation) {
  validateReleaseWorkflow(workflow)
  const prChecks = observation.onProtectedMain
    ? 'complete'
    : observation.pullRequest
      ? checkRollupStatus(observation.pullRequest.requiredChecks)
      : 'blocked'
  const merge = observation.onProtectedMain || observation.pullRequest?.state === 'MERGED' ? 'complete' : 'pending'
  const publishedRelease = Boolean(
    observation.release
      && !observation.release.isDraft
      && observation.release.publishedAt
      && /^[a-f0-9]{40}$/.test(observation.releaseCommitSha || ''),
  )
  const publish = publishedRelease
    ? 'complete'
    : observation.publishRun && PENDING_STATUSES.has(`${observation.publishRun.status}`.toLowerCase())
      ? 'running'
      : merge === 'complete' ? 'ready' : 'pending'
  const readback = publishedRelease && observation.npmPackages.every(item => item.exactVersion) ? 'complete' : publish === 'complete' ? 'pending' : 'blocked'
  const consumer = readback === 'complete'
    ? observation.consumers.every(item => item.exactVersion) ? 'complete' : 'pending'
    : 'blocked'
  return [
    { id: 'pr-checks', authority: 'AUTO', status: prChecks },
    { id: 'merge', authority: 'AUTO', status: merge },
    { id: 'publish', authority: 'AUTO', status: publish },
    { id: 'readback', authority: 'AUTO', status: readback },
    { id: 'consumer', authority: 'AUTO', status: consumer },
  ]
}

export function collectLiveObservation(workflow = loadReleaseWorkflow()) {
  gh(['auth', 'status'])
  const { repository, defaultBranch, publishWorkflow, packages, consumers } = workflow.automation
  const branch = run('git', ['branch', '--show-current']).stdout
  const headSha = run('git', ['rev-parse', 'HEAD^{commit}']).stdout
  const main = ghJson(['api', `repos/${repository}/commits/${defaultBranch}`])
  const version = packageVersion(workflow)
  const tag = `v${version}`
  const pullRequest = currentPullRequest(repository, branch, defaultBranch)
  const tagRef = ghJson(['api', `repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`], { allowFailure: true })
  const tagCommitSha = tagRef?.object?.sha || null
  const releaseCommitSha = tagCommitSha || main?.sha || null
  const release = ghJson(['release', 'view', tag, '--repo', repository, '--json', 'tagName,isDraft,isPrerelease,publishedAt,url'], { allowFailure: true })
  return {
    repository,
    branch,
    headSha,
    protectedMainSha: main?.sha || null,
    onProtectedMain: branch === defaultBranch && headSha === main?.sha,
    version,
    tag,
    pullRequest,
    tagCommitSha,
    releaseCommitSha,
    release,
    publishRun: latestRun(repository, publishWorkflow.file, releaseCommitSha),
    npmPackages: packages.map(name => ({ name, exactVersion: release ? npmPackageReadback(name, version) : false })),
    consumers: consumers.map(target => ({
      ...target,
      exactVersion: release ? consumerPackageReadback(target, version) : false,
      pullRequest: release ? matchingConsumerPullRequest(target.repository, version) : null,
    })),
  }
}

function printReport(workflow, observation, json) {
  const report = {
    schemaVersion: 1,
    authority: workflow.decisionAuthority,
    release: { repository: observation.repository, version: observation.version, tag: observation.tag, commit: observation.releaseCommitSha },
    steps: buildFiveStepStatus(workflow, observation),
    legacyMechanisms: workflow.legacyMechanisms,
  }
  if (json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`${observation.repository} ${observation.tag}`)
    for (const step of report.steps) console.log(`${step.id.padEnd(10)} ${step.status} (${step.authority})`)
  }
  return report
}

function waitForRun(repository, workflowFile, protectedMainSha, previousRunId = null) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const found = latestRun(repository, workflowFile, protectedMainSha)
    if (found && `${found.databaseId}` !== `${previousRunId || ''}`) return found
    sleep(2000)
  }
  throw new Error(`dispatch was accepted but ${workflowFile} was not observable; release:auto is safe to rerun`)
}

function watchRun(repository, run) {
  gh(['run', 'watch', `${run.databaseId}`, '--repo', repository, '--exit-status'])
}

export function buildConsumerDispatch(target, { version, tag, commit }) {
  invariant(target.delivery === 'repository-dispatch-pr', `consumer ${target.repository} is not repository-dispatch driven`)
  invariant(tag === `v${version}`, `consumer dispatch tag ${tag} does not match version ${version}`)
  invariant(/^[a-f0-9]{40}$/.test(commit), `invalid consumer release commit: ${commit}`)
  return {
    args: ['api', '--method', 'POST', `repos/${target.repository}/dispatches`, '--input', '-'],
    input: `${JSON.stringify({ event_type: target.dispatchEvent, client_payload: { version, tag, commit } })}\n`,
  }
}

function dispatchConsumer(target, release) {
  const operation = buildConsumerDispatch(target, release)
  gh(operation.args, { input: operation.input })
}

export function buildPullRequestCreateArgs(workflow, branch) {
  invariant(branch && branch !== workflow.automation.defaultBranch, 'a working branch is required to create a release PR')
  return [
    'pr', 'create', '--repo', workflow.automation.repository,
    '--base', workflow.automation.defaultBranch, '--head', branch, '--fill',
  ]
}

export function buildPublishMutationPlan(workflow, { tag, protectedMainSha, existingTagSha = null }) {
  validateReleaseWorkflow(workflow)
  invariant(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag), `invalid exact release tag: ${tag}`)
  invariant(/^[a-f0-9]{40}$/.test(protectedMainSha), `invalid protected main SHA: ${protectedMainSha}`)
  invariant(!existingTagSha || /^[a-f0-9]{40}$/.test(existingTagSha), `existing ${tag} has an invalid commit SHA`)
  const releaseCommitSha = existingTagSha || protectedMainSha
  const operations = []
  if (!existingTagSha) {
    operations.push({
      args: ['api', '--method', 'POST', `repos/${workflow.automation.repository}/git/refs`, '--input', '-'],
      input: `${JSON.stringify({ ref: `refs/tags/${tag}`, sha: protectedMainSha })}\n`,
    })
  }
  operations.push({
    args: ['api', '--method', 'POST', `repos/${workflow.automation.repository}/dispatches`, '--input', '-'],
    input: `${JSON.stringify({ event_type: workflow.automation.publishWorkflow.dispatchEvent, client_payload: { tag } })}\n`,
  })
  return { releaseCommitSha, operations }
}

export function executeAutomaticRelease({ json = false, noWait = false, maxWaitMs = 45 * 60 * 1000 } = {}) {
  const workflow = loadReleaseWorkflow()
  const deadline = Date.now() + maxWaitMs
  const dispatchedConsumers = new Set()
  for (;;) {
    invariant(noWait || Date.now() <= deadline, 'release:auto did not converge within 45 minutes; live state is preserved and the command is safe to rerun')
    const observation = collectLiveObservation(workflow)
    const report = printReport(workflow, observation, json)
    const incomplete = report.steps.find(step => step.status !== 'complete')
    if (!incomplete) return report

    if (incomplete.id === 'pr-checks') {
      if (!observation.pullRequest) {
        gh(buildPullRequestCreateArgs(workflow, observation.branch))
        continue
      }
      invariant(incomplete.status !== 'failed', `PR #${observation.pullRequest.number} has failed checks; remediate the same PR and rerun release:auto`)
      if (noWait) return report
      if (observation.pullRequest.requiredChecks.length === 0) {
        sleep(2000)
        continue
      }
      gh(['pr', 'checks', `${observation.pullRequest.number}`, '--repo', observation.repository, '--required', '--watch', '--interval', '10'])
      continue
    }

    if (incomplete.id === 'merge') {
      invariant(observation.pullRequest, 'merge readback is incomplete and no current-branch PR was found')
      gh([
        'pr', 'merge', `${observation.pullRequest.number}`, '--repo', observation.repository,
        '--squash', '--delete-branch', '--match-head-commit', observation.pullRequest.headRefOid,
      ])
      continue
    }

    if (incomplete.id === 'publish') {
      if (incomplete.status === 'running') {
        if (noWait) return report
        watchRun(observation.repository, observation.publishRun)
        continue
      }
      const previousRunId = observation.publishRun?.databaseId || null
      const publishPlan = buildPublishMutationPlan(workflow, {
        tag: observation.tag,
        protectedMainSha: observation.protectedMainSha,
        existingTagSha: observation.tagCommitSha,
      })
      for (const operation of publishPlan.operations) gh(operation.args, { input: operation.input })
      if (noWait) return report
      watchRun(observation.repository, waitForRun(
        observation.repository,
        workflow.automation.publishWorkflow.file,
        publishPlan.releaseCommitSha,
        previousRunId,
      ))
      continue
    }

    if (incomplete.id === 'readback') {
      if (noWait) return report
      sleep(5000)
      continue
    }

    for (const target of observation.consumers.filter(item => !item.exactVersion)) {
      if (target.pullRequest) {
        const checks = checkRollupStatus(target.pullRequest.requiredChecks)
        invariant(checks !== 'failed', `consumer PR failed checks: ${target.pullRequest.url}`)
        if (checks === 'pending') {
          if (!noWait) gh(['pr', 'checks', `${target.pullRequest.number}`, '--repo', target.repository, '--required', '--watch', '--interval', '10'])
          continue
        }
        gh([
          'pr', 'merge', `${target.pullRequest.number}`, '--repo', target.repository,
          '--squash', '--delete-branch', '--match-head-commit', target.pullRequest.headRefOid,
        ])
      } else if (target.delivery === 'repository-dispatch-pr' && !dispatchedConsumers.has(target.repository)) {
        dispatchConsumer(target, {
          version: observation.version,
          tag: observation.tag,
          commit: observation.releaseCommitSha,
        })
        dispatchedConsumers.add(target.repository)
      } else if (target.delivery === 'release-published-pr'
        && !dispatchedConsumers.has(target.repository)
        && publishedTemplateBranchExists(target, observation.version)) {
        const operation = buildPublishedTemplatePullRequestCreateArgs(target, {
          version: observation.version,
          commit: observation.releaseCommitSha,
        })
        gh(operation.args)
        dispatchedConsumers.add(target.repository)
      }
    }
    if (noWait) return report
    sleep(5000)
  }
}

function parseCli(argv) {
  const [command, ...flags] = argv
  invariant(command === 'auto' || command === 'status', 'Usage: release-orchestrator.mjs <auto|status> [--json] [--no-wait]')
  invariant(flags.every(flag => flag === '--json' || flag === '--no-wait'), 'unsupported release orchestrator option')
  invariant(command === 'auto' || !flags.includes('--no-wait'), '--no-wait is only valid with auto')
  return { command, json: flags.includes('--json'), noWait: flags.includes('--no-wait') }
}

function main() {
  try {
    const options = parseCli(process.argv.slice(2))
    if (options.command === 'status') {
      const workflow = loadReleaseWorkflow()
      printReport(workflow, collectLiveObservation(workflow), options.json)
    } else {
      executeAutomaticRelease(options)
    }
  } catch (error) {
    if (error instanceof HumanBoundaryError) {
      console.error(JSON.stringify({ status: 'HUMAN_ONLY', boundary: error.boundary, action: error.message, resume: 'npm run release:auto' }, null, 2))
      process.exitCode = 3
      return
    }
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

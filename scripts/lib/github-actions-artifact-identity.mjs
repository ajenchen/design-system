// Transport-neutral validation and resolution for immutable GitHub Actions
// workflow-run and v4 artifact identities. Callers own their domain schema and
// inject the authenticated JSON transport through requestJson.

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const GIT_SHA = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const POSITIVE_INTEGER = /^[1-9][0-9]*$/

export const GITHUB_ACTIONS_RUN_LIFECYCLES = Object.freeze({
  COMPLETED_SUCCESS: 'completed-success',
  SAME_RUN_IN_PROGRESS: 'same-run-in-progress',
})

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an open or incomplete shape`)
}

function canonicalDate(value, label) {
  invariant(
    typeof value === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value),
    `${label} must be a canonical UTC timestamp`,
  )
  const parsed = new Date(value)
  const normalized = value.includes('.')
    ? value.replace(/\.(\d{1,3})Z$/, (_, fraction) => `.${fraction.padEnd(3, '0')}Z`)
    : value.replace(/Z$/, '.000Z')
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === normalized, `${label} must be a canonical UTC timestamp`)
  return parsed
}

function positiveIntegerString(value, label) {
  const normalized = String(value ?? '')
  invariant(POSITIVE_INTEGER.test(normalized), `${label} must be a positive integer`)
  return normalized
}

function canonicalArtifactUrl(value, repository, artifactId) {
  const expected = `https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`
  if (value !== expected) return false
  let url
  try { url = new URL(value) } catch { return false }
  return url.origin === 'https://api.github.com'
    && !url.username
    && !url.password
    && url.pathname === `/repos/${repository}/actions/artifacts/${artifactId}/zip`
    && !url.search
    && !url.hash
}

function validateRunLifecycle({ status, conclusion }, lifecycle, runLabel, {
  completedFailure = `${runLabel} must be completed successfully`,
} = {}) {
  invariant(
    Object.values(GITHUB_ACTIONS_RUN_LIFECYCLES).includes(lifecycle),
    `${runLabel} lifecycle policy is invalid`,
  )
  if (lifecycle === GITHUB_ACTIONS_RUN_LIFECYCLES.COMPLETED_SUCCESS) {
    invariant(status === 'completed' && conclusion === 'success', completedFailure)
  } else {
    invariant(status === 'in_progress' && conclusion === null, `${runLabel} must be the same run in progress`)
  }
}

function validateContract(expected, artifactExpectations, { runLabel, artifactSetLabel }) {
  invariant(expected && typeof expected === 'object' && !Array.isArray(expected), `expected GitHub Actions ${runLabel} identity is missing`)
  invariant(REPOSITORY.test(expected.repository || ''), `GitHub Actions ${runLabel} repository is invalid`)
  invariant(typeof expected.workflowPath === 'string' && expected.workflowPath.length > 0 && !expected.workflowPath.includes('@'), `GitHub Actions ${runLabel} workflow path is invalid`)
  invariant(typeof expected.workflowEvent === 'string' && expected.workflowEvent.length > 0, `GitHub Actions ${runLabel} event is invalid`)
  invariant(typeof expected.headBranch === 'string' && expected.headBranch.length > 0, `GitHub Actions ${runLabel} head branch is invalid`)
  invariant(GIT_SHA.test(expected.headSha || ''), `GitHub Actions ${runLabel} head SHA is invalid`)
  const runId = positiveIntegerString(expected.runId, `${runLabel} id`)
  const runAttempt = positiveIntegerString(expected.runAttempt, `${runLabel} attempt`)
  invariant(Array.isArray(artifactExpectations) && artifactExpectations.length > 0, `GitHub Actions ${artifactSetLabel} expectations are missing`)
  const normalizedArtifacts = artifactExpectations.map((artifact, index) => {
    invariant(artifact && typeof artifact === 'object' && !Array.isArray(artifact), `GitHub Actions artifact expectation ${index} is invalid`)
    invariant(typeof artifact.label === 'string' && artifact.label.length > 0, `GitHub Actions artifact expectation ${index} label is invalid`)
    invariant(typeof artifact.name === 'string' && artifact.name.length > 0, `GitHub Actions ${artifact.label} name is invalid`)
    invariant(SHA256.test(artifact.digest || ''), `GitHub Actions ${artifact.label} digest is invalid`)
    return { label: artifact.label, name: artifact.name, digest: artifact.digest }
  })
  invariant(new Set(normalizedArtifacts.map((artifact) => artifact.name)).size === normalizedArtifacts.length, 'GitHub Actions artifact expectations contain duplicate names')
  return {
    repository: expected.repository,
    workflowPath: expected.workflowPath,
    workflowEvent: expected.workflowEvent,
    headBranch: expected.headBranch,
    headSha: expected.headSha,
    runId,
    runAttempt,
    artifactExpectations: normalizedArtifacts,
  }
}

function normalizeWorkflowPath(value, workflowPath, headBranch) {
  // GitHub documents `path` as `<workflow>@<ref>` but some responses expose
  // the bare workflow path. Only the expected workflow and protected ref pass.
  if (value === workflowPath || value === `${workflowPath}@${headBranch}`) return workflowPath
  return null
}

export function validateGitHubActionsRunIdentityDocument(workflow, expected, {
  identityLabel = 'GitHub Actions workflow identity',
  runLabel = 'workflow run',
  runLifecycle = GITHUB_ACTIONS_RUN_LIFECYCLES.COMPLETED_SUCCESS,
} = {}) {
  exactKeys(workflow, ['path', 'event', 'headBranch', 'runId', 'runAttempt', 'headSha', 'status', 'conclusion'], identityLabel)
  invariant(workflow.path === expected.workflowPath, `${runLabel} workflow must be ${expected.workflowPath}`)
  invariant(workflow.event === expected.workflowEvent, `${runLabel} event must be ${expected.workflowEvent}`)
  invariant(workflow.headBranch === expected.headBranch, `${runLabel} branch must be ${expected.headBranch}`)
  invariant(workflow.runId === String(expected.runId), `${runLabel} id mismatch`)
  invariant(String(workflow.runAttempt) === String(expected.runAttempt), `${runLabel} attempt mismatch`)
  invariant(workflow.headSha === expected.headSha, `${runLabel} head SHA mismatch`)
  validateRunLifecycle(workflow, runLifecycle, runLabel)
  return workflow
}

export function validateGitHubActionsArtifactIdentityDocument(artifact, {
  label,
  name,
  digest,
  now = new Date(),
}) {
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'GitHub Actions artifact identity validation time is invalid')
  exactKeys(artifact, ['id', 'name', 'digest', 'sizeInBytes', 'createdAt', 'expiresAt'], `${label} identity`)
  invariant(POSITIVE_INTEGER.test(artifact.id || ''), `${label} id is invalid`)
  invariant(artifact.name === name, `${label} name mismatch`)
  invariant(artifact.digest === `sha256:${digest}`, `${label} digest mismatch`)
  invariant(Number.isSafeInteger(artifact.sizeInBytes) && artifact.sizeInBytes > 0, `${label} size is invalid`)
  const createdAt = canonicalDate(artifact.createdAt, `${label} createdAt`)
  const expiresAt = canonicalDate(artifact.expiresAt, `${label} expiresAt`)
  invariant(createdAt <= now, `${label} was created in the future`)
  invariant(createdAt < expiresAt && now < expiresAt, `${label} is expired`)
  return artifact
}

function selectArtifact(artifacts, expected, artifactExpectation, { runLabel, now }) {
  const { label, name, digest } = artifactExpectation
  const matches = artifacts.artifacts.filter((artifact) => artifact?.name === name)
  invariant(matches.length === 1, `GitHub ${runLabel} must contain exactly one artifact named ${name}`)
  const artifact = matches[0]
  invariant(Number.isSafeInteger(artifact.id) && artifact.id > 0, `GitHub ${label} id is outside the safe integer range`)
  const artifactId = positiveIntegerString(artifact.id, `${label} id`)
  invariant(artifact.expired === false, `GitHub ${label} is expired`)
  invariant(artifact.digest === `sha256:${digest}`, `GitHub ${label} digest differs from the v4 upload digest`)
  invariant(artifact.workflow_run?.id !== undefined && String(artifact.workflow_run.id) === expected.runId, `GitHub ${label} belongs to a different workflow run`)
  invariant(artifact.workflow_run?.head_branch === expected.headBranch, `GitHub ${label} head branch mismatch`)
  invariant(artifact.workflow_run?.head_sha === expected.headSha, `GitHub ${label} head SHA mismatch`)
  invariant(canonicalArtifactUrl(artifact.archive_download_url, expected.repository, artifactId), `GitHub ${label} download URL is non-canonical`)
  const createdAt = canonicalDate(artifact.created_at, `GitHub ${label} createdAt`)
  const expiresAt = canonicalDate(artifact.expires_at, `GitHub ${label} expiresAt`)
  const identity = {
    id: artifactId,
    name: artifact.name,
    digest: artifact.digest,
    sizeInBytes: artifact.size_in_bytes,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }
  return validateGitHubActionsArtifactIdentityDocument(identity, { ...artifactExpectation, now })
}

export function validateGitHubActionsRunArtifactsApiSnapshot({
  run,
  artifacts,
  expected,
  artifactExpectations,
  now = new Date(),
  runLabel = 'workflow run',
  artifactSetLabel = 'workflow artifact',
  runLifecycle = GITHUB_ACTIONS_RUN_LIFECYCLES.COMPLETED_SUCCESS,
}) {
  const claim = validateContract(expected, artifactExpectations, { runLabel, artifactSetLabel })
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'GitHub Actions identity validation time is invalid')
  invariant(run && typeof run === 'object' && !Array.isArray(run), `GitHub ${runLabel} response is invalid`)
  invariant(Number.isSafeInteger(run.id) && run.id > 0, `GitHub ${runLabel} id is outside the safe integer range`)
  invariant(String(run.id ?? '') === claim.runId, `GitHub ${runLabel} id mismatch`)
  const workflowPath = normalizeWorkflowPath(run.path, claim.workflowPath, claim.headBranch)
  invariant(workflowPath !== null, `GitHub ${runLabel} has wrong workflow path: ${run.path || '<missing>'}`)
  invariant(run.event === claim.workflowEvent, `GitHub ${runLabel} has wrong event: ${run.event || '<missing>'}`)
  invariant(run.head_branch === claim.headBranch, `GitHub ${runLabel} has wrong head branch: ${run.head_branch || '<missing>'}`)
  invariant(run.head_sha === claim.headSha, `GitHub ${runLabel} head SHA differs from the expected commit`)
  validateRunLifecycle(run, runLifecycle, `GitHub ${runLabel}`, {
    completedFailure: `GitHub ${runLabel} did not complete successfully`,
  })
  invariant(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, `GitHub ${runLabel} attempt is invalid`)
  invariant(String(run.run_attempt ?? '') === claim.runAttempt, `GitHub ${runLabel} attempt mismatch`)
  invariant(run.repository?.full_name === claim.repository, `GitHub ${runLabel} repository mismatch`)
  invariant(run.head_repository?.full_name === claim.repository, `GitHub ${runLabel} head repository mismatch`)

  invariant(artifacts && typeof artifacts === 'object' && !Array.isArray(artifacts), `GitHub ${artifactSetLabel} response is invalid`)
  invariant(Number.isSafeInteger(artifacts.total_count) && artifacts.total_count >= 0 && artifacts.total_count <= 100, `GitHub ${artifactSetLabel} response requires unsupported pagination`)
  invariant(Array.isArray(artifacts.artifacts) && artifacts.artifacts.length === artifacts.total_count, `GitHub ${artifactSetLabel} response is incomplete`)

  const workflow = {
    path: workflowPath,
    event: run.event,
    headBranch: run.head_branch,
    runId: claim.runId,
    runAttempt: Number(claim.runAttempt),
    headSha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
  }
  validateGitHubActionsRunIdentityDocument(workflow, claim, { runLabel, runLifecycle })
  return {
    repository: claim.repository,
    workflow,
    artifacts: claim.artifactExpectations.map((artifact) => selectArtifact(artifacts, claim, artifact, { runLabel, now })),
  }
}

export async function resolveGitHubActionsRunArtifacts({
  expected,
  artifactExpectations,
  requestJson,
  now = new Date(),
  runLabel = 'workflow run',
  artifactSetLabel = 'workflow artifact',
  runLifecycle = GITHUB_ACTIONS_RUN_LIFECYCLES.COMPLETED_SUCCESS,
}) {
  const claim = validateContract(expected, artifactExpectations, { runLabel, artifactSetLabel })
  invariant(typeof requestJson === 'function', 'GitHub Actions identity request function is required')
  const run = await requestJson(`/repos/${claim.repository}/actions/runs/${claim.runId}`)
  const artifacts = await requestJson(`/repos/${claim.repository}/actions/runs/${claim.runId}/artifacts?per_page=100`)
  return validateGitHubActionsRunArtifactsApiSnapshot({
    run,
    artifacts,
    expected: claim,
    artifactExpectations: claim.artifactExpectations,
    now,
    runLabel,
    artifactSetLabel,
    runLifecycle,
  })
}

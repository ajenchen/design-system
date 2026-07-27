const ID_PREFIX = 'governance-check-v1'

function expectedWorkflowRef(repo, workflow) {
  return `${repo.github}/${workflow}@refs/heads/${repo.defaultBranch}`
}

export function checkRunExternalId({ workflowRef, workflowSha, candidateHeadSha, runId, runAttempt }) {
  return [ID_PREFIX, workflowRef, workflowSha, candidateHeadSha, String(runId), String(runAttempt)].join('|')
}

export function validateRequiredCheckProducer({ run, check, integration, repo, observed }) {
  const failures = []
  const candidateHeadSha = observed?.candidateHeadSha ?? observed?.defaultBranchHeadSha
  const protectedWorkflowSha = observed?.protectedWorkflowSha ?? observed?.defaultBranchHeadSha
  if (!run) return ['required check run is missing']
  if (run.name !== check.context) failures.push('required check context mismatch')
  if (run.app?.id !== integration.id) failures.push('required check integration mismatch')
  if (run.head_sha !== candidateHeadSha) failures.push('required check head mismatch')

  if (check.trustSource === 'protected-base-workflow') {
    const fields = typeof run.external_id === 'string' ? run.external_id.split('|') : []
    if (fields.length !== 6 || fields[0] !== ID_PREFIX) failures.push('Governance App verdict external identity is missing or malformed')
    else {
      const [, workflowRef, workflowSha, candidateHeadSha, runId, runAttempt] = fields
      if (workflowRef !== expectedWorkflowRef(repo, check.workflow)) failures.push('Governance App verdict workflow path/ref mismatch')
      if (workflowSha !== protectedWorkflowSha) failures.push('Governance App verdict protected workflow SHA mismatch')
      if (candidateHeadSha !== run.head_sha) failures.push('Governance App verdict candidate head binding mismatch')
      if (!/^[1-9][0-9]*$/.test(runId) || !/^[1-9][0-9]*$/.test(runAttempt)) failures.push('Governance App verdict run identity is invalid')
      const expectedDetails = `https://github.com/${repo.github}/actions/runs/${runId}`
      if (run.details_url !== expectedDetails) failures.push('Governance App verdict details URL does not bind the declared workflow run')
    }
  } else if (check.trustSource === 'repository-workflow') {
    const workflowRun = run.workflowRun
    if (!workflowRun) failures.push('GitHub Actions check has no resolved workflow-run producer')
    else {
      if (workflowRun.path !== check.workflow) failures.push('GitHub Actions check was produced by the wrong workflow path')
      if (workflowRun.head_sha !== run.head_sha) failures.push('GitHub Actions workflow-run head mismatch')
      if (!check.requiredEvents.includes(workflowRun.event)) failures.push('GitHub Actions check was produced by an unapproved event')
      if (workflowRun.status !== 'completed' || workflowRun.conclusion !== 'success') failures.push('GitHub Actions workflow run is not successful and complete')
    }
  }
  return failures
}

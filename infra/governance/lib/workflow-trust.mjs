import { createHash } from 'node:crypto'
import { load } from 'js-yaml'
import { compareUtf8Bytes, invariant, sha256, stableStringify } from './common.mjs'

const clone = value => JSON.parse(JSON.stringify(value))
const WORKFLOW_IDENTITY_FIELDS = Object.freeze(['contentSha256', 'gitBlobSha', 'semanticSha256'])

export function assertReviewedWorkflowIdentity(identity, label = 'Workflow') {
  invariant(identity && typeof identity === 'object' && !Array.isArray(identity), `${label} must bind a reviewed workflow identity`)
  const expectedKeys = identity.semanticVersion === undefined
    ? 'contentSha256,gitBlobSha,semanticSha256'
    : 'contentSha256,gitBlobSha,semanticSha256,semanticVersion'
  invariant(Object.keys(identity).sort().join(',') === expectedKeys, `${label} workflow identity has an invalid or open shape`)
  invariant(identity.semanticVersion === undefined || identity.semanticVersion === 1 || identity.semanticVersion === 2, `${label} workflow semanticVersion is invalid`)
  invariant(/^[a-f0-9]{64}$/.test(identity.contentSha256 ?? '') && /^[a-f0-9]{64}$/.test(identity.semanticSha256 ?? '') && /^[a-f0-9]{40}$/.test(identity.gitBlobSha ?? ''), `${label} workflow identity digest is invalid`)
  return true
}

function gitBlobSha(content) {
  const bytes = Buffer.from(content, 'utf8')
  return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex')
}

function normalizeTriggers(value) {
  if (typeof value === 'string') return { [value]: null }
  if (Array.isArray(value)) return Object.fromEntries([...new Set(value)].sort().map(event => [event, null]))
  invariant(value && typeof value === 'object', 'Workflow on trigger must be a mapping, string, or array')
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareUtf8Bytes(left, right)).map(([event, config]) => [event, config ?? null]))
}

function semanticStepV1(step) {
  invariant(step && typeof step === 'object' && !Array.isArray(step), 'Workflow step must be an object')
  return {
    name: step.name ?? null,
    id: step.id ?? null,
    uses: step.uses ?? null,
    if: step.if ?? null,
    with: clone(step.with ?? null),
    env: clone(step.env ?? null),
    workingDirectory: step['working-directory'] ?? null,
    runSha256: typeof step.run === 'string' ? sha256(step.run) : null,
  }
}

function loadWorkflow(content) {
  invariant(typeof content === 'string' && content.length > 0, 'Workflow content is missing')
  const document = load(content, { json: false })
  invariant(document && typeof document === 'object' && !Array.isArray(document), 'Workflow YAML root must be an object')
  invariant(document.on !== undefined, 'Workflow YAML has no on trigger')
  invariant(document.jobs && typeof document.jobs === 'object' && !Array.isArray(document.jobs), 'Workflow YAML has no jobs mapping')
  return document
}

// This projection is intentionally frozen. Existing reviewed identities that omitted a
// semanticVersion were produced from these exact fields and remain acceptable only when
// their exact content and Git blob digests also match.
export function parseWorkflowSemanticsV1(content) {
  const document = loadWorkflow(content)
  const jobs = Object.fromEntries(Object.entries(document.jobs).sort(([left], [right]) => compareUtf8Bytes(left, right)).map(([id, job]) => {
    invariant(job && typeof job === 'object' && !Array.isArray(job), `Workflow job ${id} must be an object`)
    invariant(Array.isArray(job.steps), `Workflow job ${id} must define steps`)
    return [id, {
      name: job.name ?? null,
      if: job.if ?? null,
      needs: Array.isArray(job.needs) ? [...job.needs].sort() : (job.needs ?? null),
      permissions: clone(job.permissions ?? null),
      environment: clone(job.environment ?? null),
      runsOn: clone(job['runs-on'] ?? null),
      steps: job.steps.map(semanticStepV1),
    }]
  }))
  return {
    name: document.name ?? null,
    on: normalizeTriggers(document.on),
    permissions: clone(document.permissions ?? null),
    concurrency: clone(document.concurrency ?? null),
    jobs,
  }
}

function semanticStepV2(step) {
  invariant(step && typeof step === 'object' && !Array.isArray(step), 'Workflow step must be an object')
  return {
    name: step.name ?? null,
    id: step.id ?? null,
    uses: step.uses ?? null,
    if: step.if ?? null,
    with: clone(step.with ?? null),
    env: clone(step.env ?? null),
    workingDirectory: step['working-directory'] ?? null,
    shell: step.shell ?? null,
    timeoutMinutes: clone(step['timeout-minutes'] ?? null),
    continueOnError: clone(step['continue-on-error'] ?? null),
    runSha256: typeof step.run === 'string' ? sha256(step.run) : null,
  }
}

export function parseWorkflowSemantics(content) {
  const document = loadWorkflow(content)
  const jobs = Object.fromEntries(Object.entries(document.jobs).sort(([left], [right]) => compareUtf8Bytes(left, right)).map(([id, job]) => {
    invariant(job && typeof job === 'object' && !Array.isArray(job), `Workflow job ${id} must be an object`)
    const hasSteps = Array.isArray(job.steps)
    const callsReusableWorkflow = typeof job.uses === 'string' && job.uses.length > 0
    invariant(hasSteps !== callsReusableWorkflow, `Workflow job ${id} must define exactly one of steps or reusable-workflow uses`)
    return [id, {
      name: job.name ?? null,
      if: job.if ?? null,
      needs: clone(job.needs ?? null),
      permissions: clone(job.permissions ?? null),
      environment: clone(job.environment ?? null),
      runsOn: clone(job['runs-on'] ?? null),
      concurrency: clone(job.concurrency ?? null),
      strategy: clone(job.strategy ?? null),
      env: clone(job.env ?? null),
      services: clone(job.services ?? null),
      container: clone(job.container ?? null),
      defaults: clone(job.defaults ?? null),
      timeoutMinutes: clone(job['timeout-minutes'] ?? null),
      continueOnError: clone(job['continue-on-error'] ?? null),
      outputs: clone(job.outputs ?? null),
      uses: job.uses ?? null,
      with: clone(job.with ?? null),
      secrets: clone(job.secrets ?? null),
      steps: hasSteps ? job.steps.map(semanticStepV2) : null,
    }]
  }))
  return {
    name: document.name ?? null,
    runName: document['run-name'] ?? null,
    on: normalizeTriggers(document.on),
    permissions: clone(document.permissions ?? null),
    concurrency: clone(document.concurrency ?? null),
    env: clone(document.env ?? null),
    defaults: clone(document.defaults ?? null),
    jobs,
  }
}

export function workflowIdentity(content, declaredBlobSha = null) {
  const computedBlobSha = gitBlobSha(content)
  const semantics = parseWorkflowSemantics(content)
  let legacySemanticSha256 = null
  try {
    legacySemanticSha256 = sha256(stableStringify(parseWorkflowSemanticsV1(content), 0))
  } catch {
    // V1 did not support reusable-workflow jobs. Such workflows can only be approved as V2.
  }
  return {
    contentSha256: sha256(content),
    gitBlobSha: computedBlobSha,
    semanticVersion: 2,
    semanticSha256: sha256(stableStringify({ semanticVersion: 2, semantics }, 0)),
    legacySemanticSha256,
    declaredBlobMatches: declaredBlobSha === null ? null : declaredBlobSha === computedBlobSha,
    semantics,
  }
}

export function validateWorkflowIdentity(expected, observed) {
  const failures = []
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) return ['workflow trust identity is missing']
  const keys = Object.keys(expected).sort()
  const allowedKeys = expected.semanticVersion === undefined
    ? WORKFLOW_IDENTITY_FIELDS
    : [...WORKFLOW_IDENTITY_FIELDS, 'semanticVersion']
  if (keys.length !== allowedKeys.length || keys.some((key, index) => key !== [...allowedKeys].sort()[index])) failures.push('workflow trust identity has an invalid or open shape')
  const semanticVersion = expected.semanticVersion ?? 1
  if (semanticVersion !== 1 && semanticVersion !== 2) failures.push('workflow expected semanticVersion is invalid')
  for (const field of ['contentSha256', 'semanticSha256']) if (!/^[a-f0-9]{64}$/.test(expected[field] ?? '')) failures.push(`workflow expected ${field} is invalid`)
  if (!/^[a-f0-9]{40}$/.test(expected.gitBlobSha ?? '')) failures.push('workflow expected gitBlobSha is invalid')
  if (!observed) return [...new Set([...failures, 'workflow observation is missing'])]
  if (observed.declaredBlobMatches !== true) failures.push('GitHub content blob SHA does not match the fetched bytes')
  for (const field of ['contentSha256', 'gitBlobSha']) if (expected[field] !== observed[field]) failures.push(`workflow ${field} differs from the reviewed protected-base identity`)
  const observedSemantic = semanticVersion === 1 ? observed.legacySemanticSha256 : observed.semanticSha256
  if (semanticVersion === 2 && observed.semanticVersion !== 2) failures.push('workflow semanticVersion differs from the reviewed protected-base identity')
  if (expected.semanticSha256 !== observedSemantic) failures.push(`workflow semanticSha256 differs from the reviewed protected-base identity (v${semanticVersion})`)
  return [...new Set(failures)]
}

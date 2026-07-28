#!/usr/bin/env node
// Resolve and validate the immutable GitHub Actions identity of the native-stage handoff.
// The dispatch payload is only a claim: this verifier re-reads the original workflow run
// and both v4 artifacts (trust preflight + stage receipt) from GitHub before any
// receipt download or npm registry certification.

import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requestGitHubJson } from './release-remote-tag.mjs'
import {
  resolveGitHubActionsRunArtifacts,
  validateGitHubActionsArtifactIdentityDocument,
  validateGitHubActionsRunArtifactsApiSnapshot,
  validateGitHubActionsRunIdentityDocument,
} from './lib/github-actions-artifact-identity.mjs'

export const STAGE_WORKFLOW_PATH = '.github/workflows/release.yml'
export const STAGE_WORKFLOW_EVENT = 'repository_dispatch'
export const STAGE_HEAD_BRANCH = 'main'

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const TAG = /^v\d+\.\d+\.\d+(?:-(?:beta|next|rc)\.\d+)?$/
const GIT_SHA = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const POSITIVE_INTEGER = /^[1-9][0-9]*$/

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an open or incomplete shape`)
}

function positiveIntegerString(value, label) {
  const normalized = String(value ?? '')
  invariant(POSITIVE_INTEGER.test(normalized), `${label} must be a positive integer`)
  return normalized
}

export function expectedStageArtifactName({ tag, runId, runAttempt }) {
  invariant(TAG.test(tag || ''), 'stage identity tag is invalid')
  return `npm-stage-${tag}-${positiveIntegerString(runId, 'stage run id')}-${positiveIntegerString(runAttempt, 'stage run attempt')}`
}

export function expectedReleaseTrustArtifactName({ runId, runAttempt }) {
  return `release-trust-${positiveIntegerString(runId, 'stage run id')}-${positiveIntegerString(runAttempt, 'stage run attempt')}`
}

function validateExpected(expected) {
  invariant(expected && typeof expected === 'object' && !Array.isArray(expected), 'expected stage run identity is missing')
  invariant(REPOSITORY.test(expected.repository || ''), 'stage identity repository is invalid')
  invariant(TAG.test(expected.tag || ''), 'stage identity tag is invalid')
  invariant(GIT_SHA.test(expected.gitHead || ''), 'stage identity release commit must be a full SHA-1')
  invariant(SHA256.test(expected.artifactDigest || ''), 'stage artifact digest must be a lowercase SHA-256')
  invariant(SHA256.test(expected.releaseTrustArtifactDigest || ''), 'release trust artifact digest must be a lowercase SHA-256')
  return {
    repository: expected.repository,
    tag: expected.tag,
    gitHead: expected.gitHead,
    runId: positiveIntegerString(expected.runId, 'stage run id'),
    runAttempt: positiveIntegerString(expected.runAttempt, 'stage run attempt'),
    artifactDigest: expected.artifactDigest,
    releaseTrustArtifactDigest: expected.releaseTrustArtifactDigest,
  }
}

export function validateStageRunIdentityDocument(identity, expected, { now = new Date() } = {}) {
  const claim = validateExpected(expected)
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'stage identity validation time is invalid')
  exactKeys(identity, ['schemaVersion', 'repository', 'workflow', 'artifact', 'releaseTrustArtifact'], 'stage run identity')
  invariant(identity.schemaVersion === 2 && identity.repository === claim.repository, 'stage run identity repository/schema mismatch')
  validateGitHubActionsRunIdentityDocument(identity.workflow, {
    workflowPath: STAGE_WORKFLOW_PATH,
    workflowEvent: STAGE_WORKFLOW_EVENT,
    headBranch: STAGE_HEAD_BRANCH,
    headSha: claim.gitHead,
    runId: claim.runId,
    runAttempt: claim.runAttempt,
  }, {
    identityLabel: 'stage workflow identity',
    runLabel: 'stage run',
  })
  validateGitHubActionsArtifactIdentityDocument(identity.artifact, {
    label: 'stage artifact',
    name: expectedStageArtifactName(claim),
    digest: claim.artifactDigest,
    now,
  })
  validateGitHubActionsArtifactIdentityDocument(identity.releaseTrustArtifact, {
    label: 'release trust artifact',
    name: expectedReleaseTrustArtifactName(claim),
    digest: claim.releaseTrustArtifactDigest,
    now,
  })
  return identity
}

function stageRunContract(claim) {
  return {
    expected: {
      repository: claim.repository,
      workflowPath: STAGE_WORKFLOW_PATH,
      workflowEvent: STAGE_WORKFLOW_EVENT,
      headBranch: STAGE_HEAD_BRANCH,
      headSha: claim.gitHead,
      runId: claim.runId,
      runAttempt: claim.runAttempt,
    },
    artifactExpectations: [
      {
        label: 'stage artifact',
        name: expectedStageArtifactName(claim),
        digest: claim.artifactDigest,
      },
      {
        label: 'release trust artifact',
        name: expectedReleaseTrustArtifactName(claim),
        digest: claim.releaseTrustArtifactDigest,
      },
    ],
    runLabel: 'stage run',
    artifactSetLabel: 'stage artifact',
  }
}

function stageIdentityFromGitHubActions(identity, claim, now) {
  const [artifact, releaseTrustArtifact] = identity.artifacts
  return validateStageRunIdentityDocument({
    schemaVersion: 2,
    repository: identity.repository,
    workflow: identity.workflow,
    artifact,
    releaseTrustArtifact,
  }, claim, { now })
}

export function validateStageRunApiSnapshot({ run, artifacts, expected, now = new Date() }) {
  const claim = validateExpected(expected)
  const contract = stageRunContract(claim)
  const identity = validateGitHubActionsRunArtifactsApiSnapshot({
    run,
    artifacts,
    now,
    ...contract,
  })
  return stageIdentityFromGitHubActions(identity, claim, now)
}

export async function resolveStageRunIdentity({
  repository,
  tag,
  gitHead,
  runId,
  runAttempt,
  artifactDigest,
  releaseTrustArtifactDigest,
  requestJson,
  now = new Date(),
}) {
  const expected = validateExpected({ repository, tag, gitHead, runId, runAttempt, artifactDigest, releaseTrustArtifactDigest })
  invariant(typeof requestJson === 'function', 'stage identity GitHub request function is required')
  const identity = await resolveGitHubActionsRunArtifacts({
    requestJson,
    now,
    ...stageRunContract(expected),
  })
  return stageIdentityFromGitHubActions(identity, expected, now)
}

function parseArgs(argv) {
  const allowed = new Set([
    '--repository', '--tag', '--git-head', '--run-id', '--run-attempt', '--artifact-digest',
    '--release-trust-artifact-digest', '--token-env', '--output',
  ])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of allowed) if (!values[required]) throw new Error(`${required} is required`)
  validateExpected({
    repository: values['--repository'],
    tag: values['--tag'],
    gitHead: values['--git-head'],
    runId: values['--run-id'],
    runAttempt: values['--run-attempt'],
    artifactDigest: values['--artifact-digest'],
    releaseTrustArtifactDigest: values['--release-trust-artifact-digest'],
  })
  return values
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const token = process.env[args['--token-env']]
  invariant(token, `GitHub token environment variable is empty: ${args['--token-env']}`)
  const identity = await resolveStageRunIdentity({
    repository: args['--repository'],
    tag: args['--tag'],
    gitHead: args['--git-head'],
    runId: args['--run-id'],
    runAttempt: args['--run-attempt'],
    artifactDigest: args['--artifact-digest'],
    releaseTrustArtifactDigest: args['--release-trust-artifact-digest'],
    requestJson: (path) => requestGitHubJson({ token, path }),
  })
  const output = resolve(args['--output'])
  invariant(!existsSync(output), 'stage run identity output already exists')
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 })
  invariant(!lstatSync(dirname(output)).isSymbolicLink(), 'stage run identity output directory must not be a symlink')
  writeFileSync(output, `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  console.log(`✅ original successful stage run and both v4 artifact identities verified: ${identity.workflow.runId}/${identity.workflow.runAttempt}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

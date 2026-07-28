#!/usr/bin/env node
// Resolve the immutable GitHub Actions identity of one mirror evidence artifact.
// The upload-artifact outputs are claims: this adapter re-reads the exact run
// and artifact from GitHub before a credentialed mirror writer may trust them.

import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GITHUB_ACTIONS_RUN_LIFECYCLES,
  resolveGitHubActionsRunArtifacts,
  validateGitHubActionsArtifactIdentityDocument,
  validateGitHubActionsRunArtifactsApiSnapshot,
  validateGitHubActionsRunIdentityDocument,
} from './lib/github-actions-artifact-identity.mjs'

export const MIRROR_WORKFLOW_PATH = '.github/workflows/mirror-to-published-template.yml'
export const MIRROR_HEAD_BRANCH = 'main'
export const MIRROR_WORKFLOW_EVENTS = Object.freeze(['workflow_run', 'repository_dispatch'])
export const MIRROR_RUN_LIFECYCLE = GITHUB_ACTIONS_RUN_LIFECYCLES.SAME_RUN_IN_PROGRESS

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
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

function positiveSafeIntegerString(value, label) {
  const normalized = String(value ?? '')
  invariant(POSITIVE_INTEGER.test(normalized), `${label} must be a positive integer`)
  const numeric = Number(normalized)
  invariant(Number.isSafeInteger(numeric), `${label} is outside the safe integer range`)
  return normalized
}

export function expectedMirrorArtifactName({ runId, runAttempt }) {
  return `mirror-${positiveSafeIntegerString(runId, 'mirror run id')}-${positiveSafeIntegerString(runAttempt, 'mirror run attempt')}`
}

function validateExpected(expected) {
  exactKeys(expected, [
    'repository', 'workflowEvent', 'headSha', 'runId', 'runAttempt', 'artifactId', 'artifactDigest',
  ], 'expected mirror run identity')
  invariant(REPOSITORY.test(expected.repository || ''), 'mirror identity repository is invalid')
  invariant(MIRROR_WORKFLOW_EVENTS.includes(expected.workflowEvent), 'mirror identity event must be workflow_run or repository_dispatch')
  invariant(GIT_SHA.test(expected.headSha || ''), 'mirror identity head SHA must be a full lowercase SHA-1')
  invariant(SHA256.test(expected.artifactDigest || ''), 'mirror upload artifact digest must be a lowercase SHA-256')
  return {
    repository: expected.repository,
    workflowEvent: expected.workflowEvent,
    headSha: expected.headSha,
    runId: positiveSafeIntegerString(expected.runId, 'mirror run id'),
    runAttempt: positiveSafeIntegerString(expected.runAttempt, 'mirror run attempt'),
    artifactId: positiveSafeIntegerString(expected.artifactId, 'mirror upload artifact id'),
    artifactDigest: expected.artifactDigest,
  }
}

function mirrorRunContract(claim) {
  return {
    expected: {
      repository: claim.repository,
      workflowPath: MIRROR_WORKFLOW_PATH,
      workflowEvent: claim.workflowEvent,
      headBranch: MIRROR_HEAD_BRANCH,
      headSha: claim.headSha,
      runId: claim.runId,
      runAttempt: claim.runAttempt,
    },
    artifactExpectations: [{
      label: 'mirror evidence artifact',
      name: expectedMirrorArtifactName(claim),
      digest: claim.artifactDigest,
    }],
    runLabel: 'mirror run',
    artifactSetLabel: 'mirror artifact',
    runLifecycle: MIRROR_RUN_LIFECYCLE,
  }
}

export function validateMirrorRunArtifactIdentityDocument(identity, expected, { now = new Date() } = {}) {
  const claim = validateExpected(expected)
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'mirror identity validation time is invalid')
  exactKeys(identity, ['schemaVersion', 'repository', 'workflow', 'artifact'], 'mirror run artifact identity')
  invariant(identity.schemaVersion === 1 && identity.repository === claim.repository, 'mirror run identity repository/schema mismatch')
  validateGitHubActionsRunIdentityDocument(identity.workflow, {
    workflowPath: MIRROR_WORKFLOW_PATH,
    workflowEvent: claim.workflowEvent,
    headBranch: MIRROR_HEAD_BRANCH,
    headSha: claim.headSha,
    runId: claim.runId,
    runAttempt: claim.runAttempt,
  }, {
    identityLabel: 'mirror workflow identity',
    runLabel: 'mirror run',
    runLifecycle: MIRROR_RUN_LIFECYCLE,
  })
  validateGitHubActionsArtifactIdentityDocument(identity.artifact, {
    label: 'mirror evidence artifact',
    name: expectedMirrorArtifactName(claim),
    digest: claim.artifactDigest,
    now,
  })
  invariant(identity.artifact.id === claim.artifactId, 'mirror artifact id differs from the v4 upload output')
  return identity
}

function mirrorIdentityFromGitHubActions(identity, claim, now) {
  invariant(identity.artifacts.length === 1, 'mirror run identity must resolve exactly one expected artifact')
  return validateMirrorRunArtifactIdentityDocument({
    schemaVersion: 1,
    repository: identity.repository,
    workflow: identity.workflow,
    artifact: identity.artifacts[0],
  }, claim, { now })
}

export function validateMirrorRunArtifactApiSnapshot({ run, artifacts, expected, now = new Date() }) {
  const claim = validateExpected(expected)
  const identity = validateGitHubActionsRunArtifactsApiSnapshot({
    run,
    artifacts,
    now,
    ...mirrorRunContract(claim),
  })
  return mirrorIdentityFromGitHubActions(identity, claim, now)
}

export async function resolveMirrorRunArtifactIdentity({
  repository,
  workflowEvent,
  headSha,
  runId,
  runAttempt,
  artifactId,
  artifactDigest,
  requestJson,
  now = new Date(),
}) {
  const expected = validateExpected({ repository, workflowEvent, headSha, runId, runAttempt, artifactId, artifactDigest })
  invariant(typeof requestJson === 'function', 'mirror identity GitHub request function is required')
  const identity = await resolveGitHubActionsRunArtifacts({
    requestJson,
    now,
    ...mirrorRunContract(expected),
  })
  return mirrorIdentityFromGitHubActions(identity, expected, now)
}

export function writeMirrorRunArtifactIdentity({ output, identity, expected, now = new Date() }) {
  validateMirrorRunArtifactIdentityDocument(identity, expected, { now })
  const target = resolve(output)
  invariant(!existsSync(target), 'mirror run identity output already exists')
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  const parent = lstatSync(dirname(target))
  invariant(parent.isDirectory() && !parent.isSymbolicLink(), 'mirror run identity output directory must be a real directory')
  writeFileSync(target, `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return target
}

function parseArgs(argv) {
  const allowed = new Set([
    '--repository', '--event', '--head-sha', '--run-id', '--run-attempt', '--artifact-id',
    '--artifact-digest', '--token-env', '--output',
  ])
  const values = {}
  invariant(argv.length % 2 === 0, 'mirror identity arguments must be name/value pairs')
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    invariant(allowed.has(name) && value && !value.startsWith('--'), `invalid argument: ${name || '<missing>'}`)
    invariant(values[name] === undefined, `duplicate argument: ${name}`)
    values[name] = value
  }
  for (const required of allowed) invariant(values[required], `${required} is required`)
  validateExpected({
    repository: values['--repository'],
    workflowEvent: values['--event'],
    headSha: values['--head-sha'],
    runId: values['--run-id'],
    runAttempt: values['--run-attempt'],
    artifactId: values['--artifact-id'],
    artifactDigest: values['--artifact-digest'],
  })
  return values
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const token = process.env[args['--token-env']]
  invariant(token, `GitHub token environment variable is empty: ${args['--token-env']}`)
  // Keep the pure validator import-safe for credential-free tests; only the
  // executable CLI loads the authenticated GitHub transport.
  const { requestGitHubJson } = await import('./release-remote-tag.mjs')
  const expected = {
    repository: args['--repository'],
    workflowEvent: args['--event'],
    headSha: args['--head-sha'],
    runId: args['--run-id'],
    runAttempt: args['--run-attempt'],
    artifactId: args['--artifact-id'],
    artifactDigest: args['--artifact-digest'],
  }
  const identity = await resolveMirrorRunArtifactIdentity({
    ...expected,
    requestJson: path => requestGitHubJson({ token, path }),
  })
  writeMirrorRunArtifactIdentity({ output: args['--output'], identity, expected })
  console.log(`✅ active same-run mirror identity and exact v4 artifact verified: ${identity.workflow.runId}/${identity.workflow.runAttempt}/${identity.artifact.id}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

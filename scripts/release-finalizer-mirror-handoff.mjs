#!/usr/bin/env node
// Derive the mirror handoff from one successful finalizer run and the live
// immutable Release. No dispatch payload, tag, commit, or digest is trusted as
// input: the finalizer artifact name selects the canonical tag, and the
// retained finalization receipt must bind that exact run/attempt.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateGitHubActionsArtifactIdentityDocument,
  validateGitHubActionsRunArtifactsApiSnapshot,
} from './lib/github-actions-artifact-identity.mjs'
import {
  TRUSTED_UPGRADE_POLICY,
  resolveImmutableReleaseSnapshot,
  validateImmutableReleaseSnapshot,
} from './verify-upgrade-provenance.mjs'

export const FINALIZER_WORKFLOW_PATH = '.github/workflows/release-finalize.yml'
export const FINALIZER_WORKFLOW_EVENT = 'repository_dispatch'
export const FINALIZER_HEAD_BRANCH = 'main'
export const FINALIZER_MIRROR_HANDOFF_KIND = 'qijenchen-release-finalizer-mirror-handoff'

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const TAG = /^v(\d+\.\d+\.\d+(?:-(?:beta|next|rc)\.\d+)?)$/
const GIT_SHA = /^[a-f0-9]{40}$/
const GIT_OBJECT = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/
const SHA256 = /^[a-f0-9]{64}$/
const POSITIVE_INTEGER = /^[1-9][0-9]*$/
const TOKEN_ENV = /^[A-Z_][A-Z0-9_]*$/

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

function canonicalTimestamp(value, label) {
  invariant(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value), `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  const normalized = value.includes('.')
    ? value.replace(/\.(\d{1,3})Z$/, (_, fraction) => `.${fraction.padEnd(3, '0')}Z`)
    : value.replace(/Z$/, '.000Z')
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === normalized, `${label} must be a canonical UTC timestamp`)
  return value
}

function artifactNamePattern(runId, runAttempt) {
  return new RegExp(`^release-finalize-(v\\d+\\.\\d+\\.\\d+(?:-(?:beta|next|rc)\\.\\d+)?)-${runId}-${runAttempt}$`)
}

function validateExpectedInput({ repository, finalizerRunId, finalizerRunAttempt }) {
  invariant(REPOSITORY.test(repository || ''), 'finalizer handoff repository is invalid')
  return {
    repository,
    finalizerRunId: positiveIntegerString(finalizerRunId, 'finalizer run id'),
    finalizerRunAttempt: positiveIntegerString(finalizerRunAttempt, 'finalizer run attempt'),
  }
}

function selectFinalizerArtifact(artifacts, expected) {
  invariant(artifacts && typeof artifacts === 'object' && !Array.isArray(artifacts), 'GitHub finalizer artifact response is invalid')
  invariant(Array.isArray(artifacts.artifacts), 'GitHub finalizer artifact inventory is missing')
  const pattern = artifactNamePattern(expected.finalizerRunId, expected.finalizerRunAttempt)
  const candidates = artifacts.artifacts.filter((artifact) => pattern.test(artifact?.name || ''))
  invariant(candidates.length === 1, 'GitHub finalizer run must contain exactly one attempt-bound release-finalize artifact')
  const candidate = candidates[0]
  invariant(candidate.expired === false, 'GitHub finalizer artifact is expired')
  invariant(/^sha256:[a-f0-9]{64}$/.test(candidate.digest || ''), 'GitHub finalizer artifact digest is invalid')
  const match = candidate.name.match(pattern)
  invariant(match && TAG.test(match[1]), 'GitHub finalizer artifact does not encode a canonical release tag')
  return { candidate, tag: match[1], digest: candidate.digest.slice('sha256:'.length) }
}

function packagesFromReleaseSnapshot(snapshot, policy) {
  let bom
  try {
    bom = JSON.parse(Buffer.from(snapshot?.assetBodies?.[policy.releaseBomAsset] || '').toString('utf8'))
  } catch {
    throw new Error('immutable release BOM is invalid JSON')
  }
  invariant(Array.isArray(bom?.packages), 'immutable release BOM package inventory is missing')
  return policy.releasePackages.map((name) => {
    const matches = bom.packages.filter((item) => item?.name === name)
    invariant(matches.length === 1, `immutable release BOM must contain exactly one ${name} package`)
    return { name, version: matches[0].version, integrity: matches[0].integrity }
  })
}

async function requestGitHubActionsJson({ token, path }) {
  invariant(token, 'GitHub token is required for finalizer handoff resolution')
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'design-system-finalizer-mirror-handoff',
      'X-GitHub-Api-Version': '2026-03-10',
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const body = (await response.text()).slice(0, 1000)
    throw new Error(`GitHub Actions API ${path} failed with HTTP ${response.status}: ${body}`)
  }
  return response.json()
}

export function validateFinalizerMirrorHandoffDocument(document, { now = new Date() } = {}) {
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'finalizer handoff validation time is invalid')
  exactKeys(document, [
    'schemaVersion', 'kind', 'repository', 'workflowSourceSha', 'finalizerRun', 'artifact', 'release',
  ], 'finalizer mirror handoff')
  invariant(document.schemaVersion === 1 && document.kind === FINALIZER_MIRROR_HANDOFF_KIND, 'finalizer mirror handoff kind/version mismatch')
  invariant(REPOSITORY.test(document.repository || ''), 'finalizer mirror handoff repository is invalid')
  invariant(document.repository === TRUSTED_UPGRADE_POLICY.repository, 'finalizer mirror handoff repository differs from the trusted release authority')
  invariant(GIT_SHA.test(document.workflowSourceSha || ''), 'finalizer mirror handoff workflow source SHA is invalid')

  exactKeys(document.finalizerRun, [
    'workflow', 'event', 'headBranch', 'runId', 'runAttempt', 'status', 'conclusion',
  ], 'finalizer mirror handoff run')
  invariant(document.finalizerRun.workflow === FINALIZER_WORKFLOW_PATH
    && document.finalizerRun.event === FINALIZER_WORKFLOW_EVENT
    && document.finalizerRun.headBranch === FINALIZER_HEAD_BRANCH,
  'finalizer mirror handoff workflow identity mismatch')
  invariant(typeof document.finalizerRun.runId === 'string', 'finalizer handoff run id must be a string')
  invariant(Number.isSafeInteger(document.finalizerRun.runAttempt), 'finalizer handoff run attempt must be an integer')
  const runId = positiveIntegerString(document.finalizerRun.runId, 'finalizer handoff run id')
  const runAttempt = positiveIntegerString(document.finalizerRun.runAttempt, 'finalizer handoff run attempt')
  invariant(document.finalizerRun.status === 'completed' && document.finalizerRun.conclusion === 'success', 'finalizer mirror handoff run is not completed successfully')

  exactKeys(document.release, [
    'releaseId', 'tag', 'version', 'tagObject', 'releaseCommit', 'releaseTree', 'tagVerification',
    'releaseSetSha256', 'bomSha256', 'finalizationReceiptSha256', 'releaseTrustEvidenceSha256',
    'externalActivationRequirementsSha256',
  ], 'finalizer mirror handoff release')
  const tagMatch = document.release.tag?.match(TAG)
  invariant(tagMatch && document.release.version === tagMatch[1], 'finalizer mirror handoff tag/version mismatch')
  invariant(typeof document.release.releaseId === 'string' && POSITIVE_INTEGER.test(document.release.releaseId), 'finalizer mirror handoff release id is invalid')
  for (const field of ['tagObject', 'releaseCommit', 'releaseTree']) {
    invariant(GIT_OBJECT.test(document.release[field] || ''), `finalizer mirror handoff ${field} is invalid`)
  }
  for (const field of [
    'releaseSetSha256', 'bomSha256', 'finalizationReceiptSha256',
    'releaseTrustEvidenceSha256', 'externalActivationRequirementsSha256',
  ]) {
    invariant(SHA256.test(document.release[field] || ''), `finalizer mirror handoff ${field} is invalid`)
  }
  exactKeys(document.release.tagVerification, [
    'verified', 'reason', 'verifiedAt', 'signatureSha256', 'payloadSha256',
  ], 'finalizer mirror handoff tag verification')
  invariant(document.release.tagVerification.verified === true && document.release.tagVerification.reason === 'valid', 'finalizer mirror handoff tag verification is not valid')
  canonicalTimestamp(document.release.tagVerification.verifiedAt, 'finalizer mirror handoff tag verifiedAt')
  invariant(SHA256.test(document.release.tagVerification.signatureSha256 || '')
    && SHA256.test(document.release.tagVerification.payloadSha256 || ''),
  'finalizer mirror handoff tag verification digests are invalid')

  const artifactName = `release-finalize-${document.release.tag}-${runId}-${runAttempt}`
  const artifactDigest = String(document.artifact?.digest || '').replace(/^sha256:/, '')
  invariant(SHA256.test(artifactDigest), 'finalizer mirror handoff artifact digest is invalid')
  validateGitHubActionsArtifactIdentityDocument(document.artifact, {
    label: 'finalizer artifact',
    name: artifactName,
    digest: artifactDigest,
    now,
  })
  return document
}

export async function resolveFinalizerMirrorHandoff({
  repository,
  finalizerRunId,
  finalizerRunAttempt,
  requestJson,
  releaseLookup = resolveImmutableReleaseSnapshot,
  policy = TRUSTED_UPGRADE_POLICY,
  now = new Date(),
}) {
  const expected = validateExpectedInput({ repository, finalizerRunId, finalizerRunAttempt })
  invariant(repository === TRUSTED_UPGRADE_POLICY.repository && policy.repository === TRUSTED_UPGRADE_POLICY.repository,
    'finalizer handoff repository differs from the trusted immutable release authority')
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'finalizer handoff resolution time is invalid')
  invariant(typeof requestJson === 'function', 'finalizer handoff GitHub request function is required')
  invariant(typeof releaseLookup === 'function', 'finalizer handoff immutable release resolver is required')

  const run = await requestJson(`/repos/${repository}/actions/runs/${expected.finalizerRunId}`)
  const artifacts = await requestJson(`/repos/${repository}/actions/runs/${expected.finalizerRunId}/artifacts?per_page=100`)
  const selected = selectFinalizerArtifact(artifacts, expected)
  const actionsIdentity = validateGitHubActionsRunArtifactsApiSnapshot({
    run,
    artifacts,
    expected: {
      repository,
      workflowPath: FINALIZER_WORKFLOW_PATH,
      workflowEvent: FINALIZER_WORKFLOW_EVENT,
      headBranch: FINALIZER_HEAD_BRANCH,
      headSha: run?.head_sha,
      runId: expected.finalizerRunId,
      runAttempt: expected.finalizerRunAttempt,
    },
    artifactExpectations: [{
      label: 'finalizer artifact',
      name: selected.candidate.name,
      digest: selected.digest,
    }],
    now,
    runLabel: 'finalizer run',
    artifactSetLabel: 'finalizer artifact',
  })

  const version = selected.tag.slice(1)
  const snapshot = await releaseLookup({ repository, tag: selected.tag, assetName: policy.releaseBomAsset })
  const immutable = validateImmutableReleaseSnapshot({
    ...snapshot,
    packages: packagesFromReleaseSnapshot(snapshot, policy),
    version,
    policy,
    expectedFinalizerRun: {
      workflow: FINALIZER_WORKFLOW_PATH,
      event: FINALIZER_WORKFLOW_EVENT,
      runId: expected.finalizerRunId,
      runAttempt: Number(expected.finalizerRunAttempt),
    },
  })
  invariant(immutable.tag === selected.tag, 'finalizer artifact tag differs from the immutable release')
  invariant(POSITIVE_INTEGER.test(String(snapshot.release?.id ?? '')), 'immutable GitHub Release id is invalid')

  return validateFinalizerMirrorHandoffDocument({
    schemaVersion: 1,
    kind: FINALIZER_MIRROR_HANDOFF_KIND,
    repository,
    workflowSourceSha: actionsIdentity.workflow.headSha,
    finalizerRun: {
      workflow: actionsIdentity.workflow.path,
      event: actionsIdentity.workflow.event,
      headBranch: actionsIdentity.workflow.headBranch,
      runId: actionsIdentity.workflow.runId,
      runAttempt: actionsIdentity.workflow.runAttempt,
      status: actionsIdentity.workflow.status,
      conclusion: actionsIdentity.workflow.conclusion,
    },
    artifact: actionsIdentity.artifacts[0],
    release: {
      releaseId: String(snapshot.release.id),
      tag: immutable.tag,
      version,
      tagObject: immutable.tagObject,
      releaseCommit: immutable.gitCommit,
      releaseTree: immutable.gitTree,
      tagVerification: { ...immutable.tagVerification },
      releaseSetSha256: immutable.releaseSetSha256,
      bomSha256: immutable.bomSha256,
      finalizationReceiptSha256: immutable.finalizationReceiptSha256,
      releaseTrustEvidenceSha256: immutable.releaseTrustEvidenceSha256,
      externalActivationRequirementsSha256: immutable.externalActivationRequirementsSha256,
    },
  }, { now })
}

export function writeFinalizerMirrorHandoff(outputPath, document) {
  validateFinalizerMirrorHandoffDocument(document)
  const output = resolve(outputPath)
  invariant(!existsSync(output), 'finalizer mirror handoff output already exists')
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 })
  writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return output
}

export function parseFinalizerMirrorHandoffArgs(argv) {
  const allowed = new Set([
    '--repository', '--finalizer-run-id', '--finalizer-run-attempt', '--token-env', '--output',
  ])
  invariant(argv.length % 2 === 0, 'finalizer handoff arguments must be flag/value pairs')
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    invariant(allowed.has(name) && value && !value.startsWith('--'), `invalid argument: ${name || '<missing>'}`)
    invariant(values[name] === undefined, `duplicate argument: ${name}`)
    values[name] = value
  }
  for (const required of allowed) invariant(values[required], `${required} is required`)
  validateExpectedInput({
    repository: values['--repository'],
    finalizerRunId: values['--finalizer-run-id'],
    finalizerRunAttempt: values['--finalizer-run-attempt'],
  })
  invariant(TOKEN_ENV.test(values['--token-env']), '--token-env must name an uppercase environment variable')
  return values
}

async function main() {
  const args = parseFinalizerMirrorHandoffArgs(process.argv.slice(2))
  const tokenEnv = args['--token-env']
  const token = process.env[tokenEnv]
  invariant(token, `GitHub token environment variable is empty: ${tokenEnv}`)
  const document = await resolveFinalizerMirrorHandoff({
    repository: args['--repository'],
    finalizerRunId: args['--finalizer-run-id'],
    finalizerRunAttempt: args['--finalizer-run-attempt'],
    requestJson: (path) => requestGitHubActionsJson({ token, path }),
    releaseLookup: (input) => resolveImmutableReleaseSnapshot({ ...input, token }),
  })
  writeFinalizerMirrorHandoff(args['--output'], document)
  console.log(`✅ finalizer→mirror handoff is bound to ${document.release.tag} and run ${document.finalizerRun.runId}/${document.finalizerRun.runAttempt}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

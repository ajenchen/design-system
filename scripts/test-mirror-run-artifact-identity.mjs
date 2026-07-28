#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  GITHUB_ACTIONS_RUN_LIFECYCLES,
  validateGitHubActionsRunArtifactsApiSnapshot,
} from './lib/github-actions-artifact-identity.mjs'
import {
  MIRROR_HEAD_BRANCH,
  MIRROR_WORKFLOW_EVENTS,
  MIRROR_WORKFLOW_PATH,
  expectedMirrorArtifactName,
  resolveMirrorRunArtifactIdentity,
  validateMirrorRunArtifactApiSnapshot,
  validateMirrorRunArtifactIdentityDocument,
  writeMirrorRunArtifactIdentity,
} from './mirror-run-artifact-identity.mjs'

const repository = 'ajenchen/design-system'
const headSha = 'a'.repeat(40)
const now = new Date('2026-07-23T00:00:00.000Z')
const temporary = []

test.after(() => {
  for (const path of temporary) rmSync(path, { recursive: true, force: true })
})

function fixture(workflowEvent = 'workflow_run') {
  const expected = {
    repository,
    workflowEvent,
    headSha,
    runId: '123456789',
    runAttempt: '2',
    artifactId: '987654321',
    artifactDigest: 'b'.repeat(64),
  }
  const run = {
    id: Number(expected.runId),
    path: `${MIRROR_WORKFLOW_PATH}@${MIRROR_HEAD_BRANCH}`,
    event: workflowEvent,
    head_branch: MIRROR_HEAD_BRANCH,
    head_sha: headSha,
    status: 'in_progress',
    conclusion: null,
    run_attempt: Number(expected.runAttempt),
    repository: { full_name: repository },
    head_repository: { full_name: repository },
  }
  const artifact = {
    id: Number(expected.artifactId),
    name: expectedMirrorArtifactName(expected),
    size_in_bytes: 4096,
    expired: false,
    digest: `sha256:${expected.artifactDigest}`,
    created_at: '2026-07-22T00:00:00.12Z',
    expires_at: '2026-08-05T00:00:00.1Z',
    archive_download_url: `https://api.github.com/repos/${repository}/actions/artifacts/${expected.artifactId}/zip`,
    workflow_run: { id: Number(expected.runId), head_branch: MIRROR_HEAD_BRANCH, head_sha: headSha },
  }
  return { expected, run, artifact, artifacts: { total_count: 1, artifacts: [artifact] } }
}

function expectedDocument(context) {
  return {
    schemaVersion: 1,
    repository,
    workflow: {
      path: MIRROR_WORKFLOW_PATH,
      event: context.expected.workflowEvent,
      headBranch: MIRROR_HEAD_BRANCH,
      runId: context.expected.runId,
      runAttempt: Number(context.expected.runAttempt),
      headSha,
      status: 'in_progress',
      conclusion: null,
    },
    artifact: {
      id: context.expected.artifactId,
      name: expectedMirrorArtifactName(context.expected),
      digest: `sha256:${context.expected.artifactDigest}`,
      sizeInBytes: 4096,
      createdAt: '2026-07-22T00:00:00.120Z',
      expiresAt: '2026-08-05T00:00:00.100Z',
    },
  }
}

test('derives an attempt-unique artifact name from safe integer upload identity', () => {
  assert.equal(expectedMirrorArtifactName({ runId: '123', runAttempt: 4 }), 'mirror-123-4')
  assert.throws(() => expectedMirrorArtifactName({ runId: '0', runAttempt: 1 }), /positive integer/)
  assert.throws(() => expectedMirrorArtifactName({ runId: `${Number.MAX_SAFE_INTEGER}0`, runAttempt: 1 }), /safe integer range/)
})

for (const workflowEvent of MIRROR_WORKFLOW_EVENTS) {
  test(`binds the active protected-main ${workflowEvent} run to exact upload outputs`, () => {
    const context = fixture(workflowEvent)
    const identity = validateMirrorRunArtifactApiSnapshot({
      run: context.run,
      artifacts: context.artifacts,
      expected: context.expected,
      now,
    })
    assert.deepEqual(identity, expectedDocument(context))
    assert.equal(validateMirrorRunArtifactIdentityDocument(identity, context.expected, { now }), identity)
  })
}

test('normalizes GitHub bare workflow paths without weakening the protected workflow binding', () => {
  const context = fixture()
  context.run.path = MIRROR_WORKFLOW_PATH
  assert.equal(validateMirrorRunArtifactApiSnapshot({
    run: context.run,
    artifacts: context.artifacts,
    expected: context.expected,
    now,
  }).workflow.path, MIRROR_WORKFLOW_PATH)
})

for (const [label, mutate, pattern] of [
  ['repository', context => { context.run.repository.full_name = 'attacker/fork' }, /repository mismatch/],
  ['head repository', context => { context.run.head_repository.full_name = 'attacker/fork' }, /head repository mismatch/],
  ['workflow path', context => { context.run.path = '.github/workflows/ci.yml@main' }, /wrong workflow path/],
  ['workflow ref', context => { context.run.path = `${MIRROR_WORKFLOW_PATH}@develop` }, /wrong workflow path/],
  ['event', context => { context.run.event = 'workflow_dispatch' }, /wrong event/],
  ['branch', context => { context.run.head_branch = 'develop' }, /wrong head branch/],
  ['head SHA', context => { context.run.head_sha = 'c'.repeat(40) }, /head SHA differs/],
  ['run ID', context => { context.run.id += 1 }, /id mismatch/],
  ['run attempt', context => { context.run.run_attempt += 1 }, /attempt mismatch/],
  ['queued status', context => { context.run.status = 'queued' }, /must be the same run in progress/],
  ['failure conclusion', context => { context.run.conclusion = 'failure' }, /must be the same run in progress/],
  ['premature completed-success lifecycle', context => { context.run.status = 'completed'; context.run.conclusion = 'success' }, /must be the same run in progress/],
]) {
  test(`rejects wrong mirror run ${label}`, () => {
    const context = fixture()
    mutate(context)
    assert.throws(() => validateMirrorRunArtifactApiSnapshot({
      run: context.run,
      artifacts: context.artifacts,
      expected: context.expected,
      now,
    }), pattern)
  })
}

for (const [label, mutate, pattern] of [
  ['upload ID substitution', context => { context.expected.artifactId = '987654322' }, /id differs from the v4 upload output/],
  ['upload digest substitution', context => { context.expected.artifactDigest = 'c'.repeat(64) }, /digest differs from the v4 upload digest/],
  ['duplicate expected name', context => { context.artifacts.artifacts.push(structuredClone(context.artifact)); context.artifacts.total_count = 2 }, /exactly one artifact named/],
  ['cross-run replay', context => { context.artifact.workflow_run.id += 1 }, /different workflow run/],
  ['cross-branch replay', context => { context.artifact.workflow_run.head_branch = 'develop' }, /head branch mismatch/],
  ['cross-commit replay', context => { context.artifact.workflow_run.head_sha = 'c'.repeat(40) }, /head SHA mismatch/],
  ['expired flag', context => { context.artifact.expired = true }, /artifact is expired/],
  ['expired timestamp', context => { context.artifact.expires_at = '2026-07-22T12:00:00Z' }, /artifact is expired/],
  ['non-canonical host', context => { context.artifact.archive_download_url = `https://evil.invalid/repos/${repository}/actions/artifacts/${context.expected.artifactId}/zip` }, /download URL is non-canonical/],
  ['non-canonical artifact path', context => { context.artifact.archive_download_url = `https://api.github.com/repos/${repository}/actions/artifacts/1/zip` }, /download URL is non-canonical/],
  ['canonical URL query injection', context => { context.artifact.archive_download_url += '?token=secret' }, /download URL is non-canonical/],
  ['canonical URL embedded credentials', context => { context.artifact.archive_download_url = context.artifact.archive_download_url.replace('https://', 'https://attacker:secret@') }, /download URL is non-canonical/],
  ['non-canonical default port spelling', context => { context.artifact.archive_download_url = context.artifact.archive_download_url.replace('api.github.com', 'api.github.com:443') }, /download URL is non-canonical/],
]) {
  test(`rejects mirror artifact ${label}`, () => {
    const context = fixture()
    mutate(context)
    assert.throws(() => validateMirrorRunArtifactApiSnapshot({
      run: context.run,
      artifacts: context.artifacts,
      expected: context.expected,
      now,
    }), pattern)
  })
}

test('rejects open claims, unsupported events, unsafe upload IDs, and open identity documents', () => {
  const context = fixture()
  assert.throws(() => validateMirrorRunArtifactApiSnapshot({
    run: context.run,
    artifacts: context.artifacts,
    expected: { ...context.expected, extra: true },
    now,
  }), /open or incomplete shape/)
  assert.throws(() => validateMirrorRunArtifactApiSnapshot({
    run: { ...context.run, event: 'push' },
    artifacts: context.artifacts,
    expected: { ...context.expected, workflowEvent: 'push' },
    now,
  }), /event must be workflow_run or repository_dispatch/)
  assert.throws(() => validateMirrorRunArtifactApiSnapshot({
    run: context.run,
    artifacts: context.artifacts,
    expected: { ...context.expected, artifactId: `${Number.MAX_SAFE_INTEGER}0` },
    now,
  }), /safe integer range/)
  assert.throws(() => validateMirrorRunArtifactIdentityDocument({
    ...expectedDocument(context),
    extra: true,
  }, context.expected, { now }), /open or incomplete shape/)
})

test('shared helper keeps completed-success default closed and rejects credential-bearing URLs', () => {
  const context = fixture()
  const expected = {
    repository,
    workflowPath: MIRROR_WORKFLOW_PATH,
    workflowEvent: context.expected.workflowEvent,
    headBranch: MIRROR_HEAD_BRANCH,
    headSha,
    runId: context.expected.runId,
    runAttempt: context.expected.runAttempt,
  }
  const artifactExpectations = [{
    label: 'mirror evidence artifact',
    name: expectedMirrorArtifactName(context.expected),
    digest: context.expected.artifactDigest,
  }]
  assert.throws(() => validateGitHubActionsRunArtifactsApiSnapshot({
    run: context.run,
    artifacts: context.artifacts,
    expected,
    artifactExpectations,
    now,
  }), /did not complete successfully/)

  context.run.status = 'completed'
  context.run.conclusion = 'success'
  context.artifact.archive_download_url = context.artifact.archive_download_url.replace('https://', 'https://attacker:secret@')
  assert.throws(() => validateGitHubActionsRunArtifactsApiSnapshot({
    run: context.run,
    artifacts: context.artifacts,
    expected,
    artifactExpectations,
    now,
    runLifecycle: GITHUB_ACTIONS_RUN_LIFECYCLES.COMPLETED_SUCCESS,
  }), /download URL is non-canonical/)
})

test('live resolver calls only the exact run and bounded artifact-list endpoints', async () => {
  const context = fixture('repository_dispatch')
  const paths = []
  const identity = await resolveMirrorRunArtifactIdentity({
    ...context.expected,
    now,
    requestJson: async path => {
      paths.push(path)
      return path.includes('/artifacts?') ? context.artifacts : context.run
    },
  })
  assert.deepEqual(identity, expectedDocument(context))
  assert.deepEqual(paths, [
    `/repos/${repository}/actions/runs/${context.expected.runId}`,
    `/repos/${repository}/actions/runs/${context.expected.runId}/artifacts?per_page=100`,
  ])
  await assert.rejects(resolveMirrorRunArtifactIdentity({ ...context.expected }), /request function is required/)
})

test('no-clobber writer validates, writes canonical JSON mode, and rejects file or directory replay', () => {
  const context = fixture('workflow_run')
  const identity = validateMirrorRunArtifactApiSnapshot({
    run: context.run,
    artifacts: context.artifacts,
    expected: context.expected,
    now,
  })
  const root = mkdtempSync(join(tmpdir(), 'mirror-run-identity-'))
  temporary.push(root)
  const output = join(root, 'evidence', 'identity.json')
  assert.equal(writeMirrorRunArtifactIdentity({ output, identity, expected: context.expected, now }), output)
  assert.equal(readFileSync(output, 'utf8'), `${JSON.stringify(identity, null, 2)}\n`)
  assert.equal(statSync(output).mode & 0o777, 0o600)
  assert.throws(
    () => writeMirrorRunArtifactIdentity({ output, identity, expected: context.expected, now }),
    /output already exists/,
  )

  const realDirectory = join(root, 'real-directory')
  const linkedDirectory = join(root, 'linked-directory')
  mkdirSync(realDirectory)
  symlinkSync(realDirectory, linkedDirectory, 'dir')
  assert.throws(() => writeMirrorRunArtifactIdentity({
    output: join(linkedDirectory, 'identity.json'),
    identity,
    expected: context.expected,
    now,
  }), /output directory must be a real directory/)

  const invalidOutput = join(root, 'invalid.json')
  writeFileSync(invalidOutput, 'sentinel\n')
  const invalidIdentity = structuredClone(identity)
  invalidIdentity.artifact.id = '1'
  assert.throws(() => writeMirrorRunArtifactIdentity({
    output: invalidOutput,
    identity: invalidIdentity,
    expected: context.expected,
    now,
  }), /artifact id differs/)
  assert.equal(readFileSync(invalidOutput, 'utf8'), 'sentinel\n')
})

test('CLI validates the closed claim before loading authenticated transport or touching output', () => {
  const context = fixture()
  const root = mkdtempSync(join(tmpdir(), 'mirror-run-cli-'))
  temporary.push(root)
  const output = join(root, 'identity.json')
  const args = [
    'scripts/mirror-run-artifact-identity.mjs',
    '--repository', context.expected.repository,
    '--event', context.expected.workflowEvent,
    '--head-sha', context.expected.headSha,
    '--run-id', context.expected.runId,
    '--run-attempt', context.expected.runAttempt,
    '--artifact-id', context.expected.artifactId,
    '--artifact-digest', context.expected.artifactDigest,
    '--token-env', 'MIRROR_IDENTITY_TEST_TOKEN',
    '--output', output,
  ]
  const missingToken = spawnSync(process.execPath, ['--', ...args], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'MIRROR_IDENTITY_TEST_TOKEN')),
  })
  assert.notEqual(missingToken.status, 0)
  assert.match(`${missingToken.stdout}${missingToken.stderr}`, /GitHub token environment variable is empty/)
  assert.equal(existsSync(output), false)

  const duplicateArgument = spawnSync(process.execPath, ['--', ...args, '--event', 'repository_dispatch'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
  assert.notEqual(duplicateArgument.status, 0)
  assert.match(`${duplicateArgument.stdout}${duplicateArgument.stderr}`, /duplicate argument: --event/)
  assert.equal(existsSync(output), false)
})

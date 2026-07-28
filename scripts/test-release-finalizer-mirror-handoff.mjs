#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  RELEASE_PACKAGE_NAMES,
  RELEASE_PUBLISH_ORDER,
  RELEASE_SUPPLY_CHAIN,
} from './release-bom-contract.mjs'
import {
  parseFinalizerMirrorHandoffArgs,
  resolveFinalizerMirrorHandoff,
  validateFinalizerMirrorHandoffDocument,
  writeFinalizerMirrorHandoff,
} from './release-finalizer-mirror-handoff.mjs'
import {
  PRODUCT_TEMPLATE_GENERATED_ENTRIES,
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
  scaffoldTreeSha256,
} from './product-template-scaffold-lock.mjs'
import { immutableReleaseFixture } from './test-fixtures/immutable-release-fixture.mjs'
import {
  NPM_FINALIZATION_RECEIPT_ASSET,
  resolveImmutableReleaseSnapshot,
} from './verify-upgrade-provenance.mjs'

const repository = 'ajenchen/design-system'
const version = '1.2.3'
const tag = `v${version}`
const finalizerRunId = '7002'
const finalizerRunAttempt = '1'
const sourceCommit = 'a'.repeat(40)
const sourceTree = 'b'.repeat(40)
const workflowSourceSha = 'c'.repeat(40)
const hex = 'd'.repeat(64)
const artifactDigest = 'e'.repeat(64)
const sri = `sha512-${Buffer.alloc(64, 9).toString('base64')}`
const now = new Date('2026-07-23T00:00:00.000Z')
const sha256 = value => createHash('sha256').update(value).digest('hex')

const scaffoldEntries = [{ path: 'README.md', mode: '644', size: 1, sha256: hex }]
const scaffoldLock = {
  schemaVersion: 1,
  kind: 'qijenchen-product-template-scaffold',
  releaseVersion: version,
  staticTreeSha256: scaffoldTreeSha256(scaffoldEntries),
  publishedPathCount: 2,
  entries: scaffoldEntries,
  generatedEntries: PRODUCT_TEMPLATE_GENERATED_ENTRIES,
}
const scaffoldLockBody = Buffer.from(`${JSON.stringify(scaffoldLock, null, 2)}\n`)
const scaffoldLockDigest = sha256(scaffoldLockBody)
const bom = {
  schemaVersion: 5,
  releaseVersion: version,
  npmDistTag: 'latest',
  publishOrder: RELEASE_PUBLISH_ORDER,
  source: {
    repository,
    repositoryUrl: `git+https://github.com/${repository}.git`,
    gitCommit: sourceCommit,
    gitTree: sourceTree,
    tag,
  },
  supplyChain: RELEASE_SUPPLY_CHAIN,
  packages: RELEASE_PACKAGE_NAMES.map(name => ({
    name,
    version,
    file: `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`,
    size: 1,
    entryCount: 1,
    shasum: 'f'.repeat(40),
    sha256: hex,
    integrity: sri,
    packageJsonSha256: hex,
    sourceManifest: `packages/${name.split('/')[1]}/package.json`,
    sourceManifestSha256: hex,
  })),
  governance: {
    controlPlane: {
      path: 'governance/control-plane.lock.json',
      sha256: hex,
      role: 'ds-author',
      inputDigest: `sha256:${hex}`,
      contractDigest: `sha256:${hex}`,
      snapshotDigest: `sha256:${hex}`,
      generatorVersion: version,
    },
    consumer: {
      path: 'template/ds-product-template/governance/lock.json',
      sha256: hex,
      role: 'template-consumer',
      release: { designSystem: version, storybookConfig: version },
    },
    forkCorpus: { path: 'packages/design-system/ds-canonical/fork/governance.lock', sha256: hex },
    productTemplateScaffold: {
      path: PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
      size: scaffoldLockBody.length,
      sha256: scaffoldLockDigest,
      schemaVersion: scaffoldLock.schemaVersion,
      releaseVersion: version,
      staticTreeSha256: scaffoldLock.staticTreeSha256,
      publishedPathCount: scaffoldLock.publishedPathCount,
    },
  },
  sbom: { file: 'release.sbom.cdx.json', size: 1, sha256: hex },
}

function snapshot() {
  return immutableReleaseFixture({
    repository,
    version,
    commit: sourceCommit,
    tree: sourceTree,
    bom,
    scaffoldLockBody,
  })
}

function runApi(overrides = {}) {
  return {
    id: Number(finalizerRunId),
    path: '.github/workflows/release-finalize.yml',
    event: 'repository_dispatch',
    head_branch: 'main',
    head_sha: workflowSourceSha,
    status: 'completed',
    conclusion: 'success',
    run_attempt: Number(finalizerRunAttempt),
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    ...overrides,
  }
}

function artifactApi(overrides = {}) {
  return {
    id: 8100,
    name: `release-finalize-${tag}-${finalizerRunId}-${finalizerRunAttempt}`,
    digest: `sha256:${artifactDigest}`,
    expired: false,
    size_in_bytes: 2048,
    archive_download_url: `https://api.github.com/repos/${repository}/actions/artifacts/8100/zip`,
    created_at: '2026-07-22T00:00:00.000Z',
    expires_at: '2099-07-22T00:00:00.000Z',
    workflow_run: { id: Number(finalizerRunId), head_branch: 'main', head_sha: workflowSourceSha },
    ...overrides,
  }
}

function artifactsApi(artifacts = [artifactApi()]) {
  return { total_count: artifacts.length, artifacts }
}

async function resolveWith({ run = runApi(), artifacts = artifactsApi(), release = snapshot() } = {}) {
  const calls = []
  const document = await resolveFinalizerMirrorHandoff({
    repository,
    finalizerRunId,
    finalizerRunAttempt,
    now,
    requestJson: async path => {
      calls.push(path)
      if (path.endsWith(`/actions/runs/${finalizerRunId}`)) return run
      if (path.endsWith(`/actions/runs/${finalizerRunId}/artifacts?per_page=100`)) return artifacts
      throw new Error(`unexpected GitHub request: ${path}`)
    },
    releaseLookup: async input => {
      calls.push(`release:${input.repository}:${input.tag}:${input.assetName}`)
      return release
    },
  })
  return { document, calls }
}

test('derives one closed mirror handoff from the successful finalizer run and immutable release', async () => {
  const { document, calls } = await resolveWith()
  assert.deepEqual(calls, [
    `/repos/${repository}/actions/runs/${finalizerRunId}`,
    `/repos/${repository}/actions/runs/${finalizerRunId}/artifacts?per_page=100`,
    `release:${repository}:${tag}:release-bom.json`,
  ])
  assert.equal(document.workflowSourceSha, workflowSourceSha)
  assert.equal(document.artifact.id, '8100')
  assert.equal(document.artifact.digest, `sha256:${artifactDigest}`)
  assert.equal(document.release.tag, tag)
  assert.equal(document.release.version, version)
  assert.equal(document.release.releaseCommit, sourceCommit)
  assert.equal(document.release.releaseTree, sourceTree)
  assert.match(document.release.tagObject, /^[a-f0-9]{40}$/)
  for (const field of [
    'releaseSetSha256', 'bomSha256', 'finalizationReceiptSha256',
    'releaseTrustEvidenceSha256', 'externalActivationRequirementsSha256',
  ]) {
    assert.match(document.release[field], /^[a-f0-9]{64}$/)
  }
  assert.equal(validateFinalizerMirrorHandoffDocument(document, { now }), document)
})

test('fails closed for a different workflow, event, branch, repository, conclusion, or attempt', async () => {
  for (const [label, overrides, pattern] of [
    ['workflow', { path: '.github/workflows/release.yml' }, /wrong workflow path/],
    ['event', { event: 'workflow_dispatch' }, /wrong event/],
    ['branch', { head_branch: 'feature' }, /wrong head branch/],
    ['repository', { repository: { full_name: 'attacker/design-system' } }, /repository mismatch/],
    ['conclusion', { conclusion: 'failure' }, /complet.*successfully/],
    ['attempt', { run_attempt: 2 }, /attempt mismatch/],
  ]) {
    await assert.rejects(resolveWith({ run: runApi(overrides) }), pattern, label)
  }
})

test('requires one non-expired attempt-bound artifact with a v4 digest', async () => {
  const duplicate = artifactApi({
    id: 8101,
    archive_download_url: `https://api.github.com/repos/${repository}/actions/artifacts/8101/zip`,
  })
  await assert.rejects(resolveWith({ artifacts: artifactsApi([artifactApi(), duplicate]) }), /exactly one attempt-bound/)
  await assert.rejects(resolveWith({ artifacts: artifactsApi([artifactApi({ expired: true })]) }), /artifact is expired/)
  await assert.rejects(resolveWith({ artifacts: artifactsApi([artifactApi({ digest: null })]) }), /artifact digest is invalid/)
  await assert.rejects(resolveWith({ artifacts: artifactsApi([artifactApi({ name: `release-finalize-v1.2.3-7002-2` })]) }), /exactly one attempt-bound/)
})

test('derives the tag only from the artifact name and rejects a different immutable release', async () => {
  const artifact = artifactApi({ name: `release-finalize-v1.2.4-${finalizerRunId}-${finalizerRunAttempt}` })
  await assert.rejects(resolveWith({ artifacts: artifactsApi([artifact]) }), /GitHub Release v1\.2\.4 is missing, draft, mutable, or has the wrong exact identity/)
})

test('binds the retained finalization receipt explicitly to the selected run and attempt', async () => {
  const release = snapshot()
  const receipt = structuredClone(release.receipt)
  receipt.finalizerRun.runId = '7999'
  const body = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`)
  release.assetBodies[NPM_FINALIZATION_RECEIPT_ASSET] = body
  const asset = release.release.assets.find(item => item.name === NPM_FINALIZATION_RECEIPT_ASSET)
  asset.size = body.length
  asset.digest = `sha256:${sha256(body)}`
  await assert.rejects(resolveWith({ release }), /belongs to a different finalizer run/)
})

test('forwards the selected token to every immutable-release GitHub API read', async () => {
  const release = snapshot()
  const apiHeaders = []
  const fetchImpl = async (url, options = {}) => {
    if (url.startsWith('https://api.github.com/')) apiHeaders.push(options.headers)
    if (url.endsWith(`/releases/tags/${tag}`)) return { ok: true, json: async () => release.release }
    const asset = release.release.assets.find(item => item.browser_download_url === url)
    if (asset) return { ok: true, arrayBuffer: async () => release.assetBodies[asset.name] }
    if (url.endsWith(`/git/ref/tags/${tag}`)) return { ok: true, json: async () => release.tagApi.reference }
    if (url.endsWith(`/git/tags/${release.tagIdentity.tagObject}`)) return { ok: true, json: async () => release.tagApi.tagObject }
    if (url.endsWith(`/git/commits/${sourceCommit}`)) {
      return { ok: true, json: async () => ({ sha: sourceCommit, tree: { sha: sourceTree } }) }
    }
    return { ok: false, status: 404, text: async () => 'not found' }
  }
  await resolveImmutableReleaseSnapshot({
    repository,
    tag,
    assetName: 'release-bom.json',
    token: 'fixture-read-token',
    fetchImpl,
  })
  assert.ok(apiHeaders.length >= 5)
  assert.ok(apiHeaders.every(headers => headers.Authorization === 'Bearer fixture-read-token'))
})

test('the handoff document is closed and the output is no-clobber', async () => {
  const { document } = await resolveWith()
  assert.throws(
    () => validateFinalizerMirrorHandoffDocument({ ...document, injected: true }, { now }),
    /open or incomplete shape/,
  )
  const directory = mkdtempSync(join(tmpdir(), 'release-finalizer-handoff-'))
  try {
    const output = join(directory, 'handoff.json')
    writeFinalizerMirrorHandoff(output, document)
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), document)
    assert.throws(() => writeFinalizerMirrorHandoff(output, document), /output already exists/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the CLI accepts only repository, finalizer run identity, token env, and output', () => {
  const args = [
    '--repository', repository,
    '--finalizer-run-id', finalizerRunId,
    '--finalizer-run-attempt', finalizerRunAttempt,
    '--token-env', 'GH_TOKEN',
    '--output', '/tmp/finalizer-handoff.json',
  ]
  assert.equal(parseFinalizerMirrorHandoffArgs(args)['--finalizer-run-id'], finalizerRunId)
  assert.throws(() => parseFinalizerMirrorHandoffArgs([...args, '--tag', tag]), /invalid argument: --tag/)
  assert.throws(() => parseFinalizerMirrorHandoffArgs([...args, '--repository', repository]), /duplicate argument: --repository/)
})

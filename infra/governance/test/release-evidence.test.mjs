import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  createVerifiedReleaseEvidence,
  resolveVerifiedCandidateRelease,
  validateVerifiedReleaseEvidence,
  verifiedReleaseEvidenceDigest,
} from '../lib/release-evidence.mjs'
import {
  RELEASE_PACKAGE_NAMES,
  RELEASE_PUBLISH_ORDER,
  RELEASE_SUPPLY_CHAIN,
} from '../../../scripts/release-bom-contract.mjs'
import {
  TRUSTED_UPGRADE_POLICY,
  resolveImmutableReleaseSnapshot,
} from '../../../scripts/verify-upgrade-provenance.mjs'
import {
  PRODUCT_TEMPLATE_GENERATED_ENTRIES,
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
  scaffoldTreeSha256,
} from '../../../scripts/product-template-scaffold-lock.mjs'
import { immutableReleaseFixture } from '../../../scripts/test-fixtures/immutable-release-fixture.mjs'

const repository = TRUSTED_UPGRADE_POLICY.repository
const version = '1.2.3'
const tag = `v${version}`
const commit = '1'.repeat(40)
const tree = '2'.repeat(40)
const hex = '3'.repeat(64)
const sri = byte => `sha512-${Buffer.alloc(64, byte).toString('base64')}`

function fixture() {
  const scaffoldEntries = [{ path: 'README.md', mode: '644', size: 1, sha256: hex }]
  const scaffoldLock = {
    schemaVersion: 1, kind: 'qijenchen-product-template-scaffold', releaseVersion: version,
    staticTreeSha256: scaffoldTreeSha256(scaffoldEntries), publishedPathCount: 2,
    entries: scaffoldEntries, generatedEntries: PRODUCT_TEMPLATE_GENERATED_ENTRIES,
  }
  const scaffoldLockBody = Buffer.from(`${JSON.stringify(scaffoldLock, null, 2)}\n`)
  const scaffoldLockSha256 = createHash('sha256').update(scaffoldLockBody).digest('hex')
  const packages = RELEASE_PACKAGE_NAMES.map((name, index) => ({
    name,
    version,
    file: `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`,
    size: 100 + index,
    entryCount: 2,
    shasum: String(index + 4).repeat(40),
    sha256: hex,
    integrity: sri(index + 1),
    packageJsonSha256: hex,
    sourceManifest: `packages/${name.split('/')[1]}/package.json`,
    sourceManifestSha256: hex,
  }))
  const bom = {
    schemaVersion: 5,
    releaseVersion: version,
    npmDistTag: 'latest',
    publishOrder: RELEASE_PUBLISH_ORDER,
    source: { repository, repositoryUrl: `git+https://github.com/${repository}.git`, gitCommit: commit, gitTree: tree, tag },
    supplyChain: RELEASE_SUPPLY_CHAIN,
    packages,
    governance: {
      controlPlane: { path: 'governance/control-plane.lock.json', sha256: hex, role: 'ds-author', inputDigest: `sha256:${hex}`, contractDigest: `sha256:${hex}`, snapshotDigest: `sha256:${hex}`, generatorVersion: version },
      consumer: { path: 'template/ds-product-template/governance/lock.json', sha256: hex, role: 'template-consumer', release: { designSystem: version, storybookConfig: version } },
      forkCorpus: { path: 'packages/design-system/ds-canonical/fork/governance.lock', sha256: hex },
      productTemplateScaffold: {
        path: PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET, size: scaffoldLockBody.length, sha256: scaffoldLockSha256,
        schemaVersion: 1, releaseVersion: version, staticTreeSha256: scaffoldLock.staticTreeSha256, publishedPathCount: 2,
      },
    },
    sbom: { file: 'release.sbom.cdx.json', size: 10, sha256: hex },
  }
  const snapshot = immutableReleaseFixture({ repository, version, commit, tree, bom, scaffoldLockBody })
  const bomSha256 = createHash('sha256').update(snapshot.bomBody).digest('hex')
  const candidateRelease = {
    id: `${repository}@${tag}`,
    version,
    sourceCommit: commit,
    sourceTree: tree,
    bomSha256,
    packages: packages.map(item => ({ name: item.name, version: item.version, integrity: item.integrity })),
    observedAt: '2026-07-20T00:00:00.000Z',
  }
  return { candidateRelease, snapshot }
}

test('candidate release evidence binds the immutable release, exact source tree, asset bytes, and npm SRI set', () => {
  const value = fixture()
  const evidence = createVerifiedReleaseEvidence(value)
  assert.equal(evidence.sourceCommit, commit)
  assert.equal(evidence.sourceTree, tree)
  assert.equal(evidence.assets.length, 8)
  assert.equal(evidence.tagObject, value.snapshot.tagIdentity.tagObject)
  assert.match(verifiedReleaseEvidenceDigest(evidence, value.candidateRelease), /^[a-f0-9]{64}$/)
})

test('live resolver requests the release, BOM, peeled tag, and exact commit tree before producing evidence', async () => {
  const value = fixture()
  const calls = []
  const fetchImpl = async url => {
    calls.push(url)
    if (url.endsWith(`/releases/tags/${tag}`)) return { ok: true, json: async () => value.snapshot.release }
    const releaseAsset = value.snapshot.release.assets.find(asset => asset.browser_download_url === url)
    if (releaseAsset) return { ok: true, arrayBuffer: async () => value.snapshot.assetBodies[releaseAsset.name] }
    if (url.endsWith(`/git/ref/tags/${tag}`)) return { ok: true, json: async () => value.snapshot.tagApi.reference }
    if (url.endsWith(`/git/tags/${value.snapshot.tagIdentity.tagObject}`)) return { ok: true, json: async () => value.snapshot.tagApi.tagObject }
    if (url.endsWith(`/git/commits/${commit}`)) return { ok: true, json: async () => ({ sha: commit, tree: { sha: tree } }) }
    return { ok: false, status: 404 }
  }
  const snapshot = await resolveImmutableReleaseSnapshot({ repository, tag, assetName: TRUSTED_UPGRADE_POLICY.releaseBomAsset, fetchImpl })
  const evidence = await resolveVerifiedCandidateRelease(value.candidateRelease, { releaseLookup: async () => snapshot })
  assert.equal(evidence.assets.find(item => item.name === 'release-bom.json').digest, `sha256:${value.candidateRelease.bomSha256}`)
  assert.ok(calls.at(-1).endsWith(`/git/commits/${commit}`))
})

test('missing release or BOM fails closed before plan materialization', async () => {
  const value = fixture()
  await assert.rejects(
    resolveVerifiedCandidateRelease(value.candidateRelease, { releaseLookup: async () => { throw new Error('GitHub Release readback failed with HTTP 404') } }),
    /HTTP 404/,
  )
  const missingBom = {
    ...value.snapshot,
    release: {
      ...value.snapshot.release,
      assets: value.snapshot.release.assets.filter(item => item.name !== 'release-bom.json'),
    },
  }
  await assert.rejects(
    resolveVerifiedCandidateRelease(value.candidateRelease, { releaseLookup: async () => missingBom }),
    /closed eight-asset set/,
  )
})

for (const [label, mutate, pattern] of [
  ['wrong asset digest', value => { value.snapshot.release.assets.find(item => item.name === 'release-bom.json').digest = `sha256:${'0'.repeat(64)}` }, /failed exact metadata\/byte readback/],
  ['wrong asset size', value => { value.snapshot.release.assets.find(item => item.name === 'release-bom.json').size += 1 }, /failed exact metadata\/byte readback/],
  ['wrong peeled commit', value => { value.snapshot.tagIdentity.commit = '4'.repeat(40) }, /repository, tag object, commit, and tree/],
  ['wrong commit tree', value => { value.snapshot.tagIdentity.tree = '5'.repeat(40) }, /repository, tag object, commit, and tree/],
  ['wrong npm SRI', value => { value.candidateRelease.packages[0].integrity = sri(42) }, /npm SRI does not match/],
  ['missing scaffold-lock asset', value => { value.snapshot.release.assets = value.snapshot.release.assets.filter(item => item.name !== PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET) }, /closed eight-asset set/],
  ['scaffold-lock byte substitution', value => { value.snapshot.assetBodies[PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET] = Buffer.from('{}\n') }, /failed exact metadata\/byte readback/],
  ['cross-repository replay', value => {
    value.snapshot.release.assets.find(item => item.name === 'release-bom.json').browser_download_url = `https://github.com/attacker/design-system/releases/download/${tag}/release-bom.json`
  }, /failed exact metadata\/byte readback/],
  ['cross-version replay', value => { value.snapshot.release.tag_name = 'v9.9.9' }, /wrong exact identity/],
]) {
  test(`rejects ${label}`, () => {
    const value = fixture()
    mutate(value)
    assert.throws(() => createVerifiedReleaseEvidence(value), pattern)
  })
}

test('verification for an older candidate cannot authorize a changed candidate', () => {
  const value = fixture()
  const evidence = createVerifiedReleaseEvidence(value)
  const changed = structuredClone(value.candidateRelease)
  changed.observedAt = '2026-07-20T00:00:01.000Z'
  assert.throws(() => validateVerifiedReleaseEvidence(evidence, changed), /stale for the current candidate/)
})

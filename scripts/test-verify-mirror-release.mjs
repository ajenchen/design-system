#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { RELEASE_PACKAGE_NAMES, RELEASE_PUBLISH_ORDER, RELEASE_SUPPLY_CHAIN } from './release-bom-contract.mjs'
import { verifyMirrorRelease } from './verify-mirror-release.mjs'
import {
  PRODUCT_TEMPLATE_GENERATED_ENTRIES,
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
  scaffoldTreeSha256,
} from './product-template-scaffold-lock.mjs'
import { immutableReleaseFixture } from './test-fixtures/immutable-release-fixture.mjs'

const repository = 'ajenchen/design-system'
const version = '1.2.3'
const sourceSha = 'a'.repeat(40)
const sourceTree = 'b'.repeat(40)
const hex = 'c'.repeat(64)
const sri = `sha512-${Buffer.alloc(64, 7).toString('base64')}`
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
const scaffoldLockBytes = Buffer.from(`${JSON.stringify(scaffoldLock, null, 2)}\n`)
const scaffoldLockDigest = createHash('sha256').update(scaffoldLockBytes).digest('hex')
const bom = {
  schemaVersion: 5,
  releaseVersion: version,
  npmDistTag: 'latest',
  publishOrder: RELEASE_PUBLISH_ORDER,
  source: { repository, repositoryUrl: `git+https://github.com/${repository}.git`, gitCommit: sourceSha, gitTree: sourceTree, tag: `v${version}` },
  supplyChain: RELEASE_SUPPLY_CHAIN,
  packages: RELEASE_PACKAGE_NAMES.map(name => ({
    name, version, file: `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`, size: 1, entryCount: 1,
    shasum: 'd'.repeat(40), sha256: hex, integrity: sri, packageJsonSha256: hex,
    sourceManifest: `packages/${name.split('/')[1]}/package.json`, sourceManifestSha256: hex,
  })),
  governance: {
    controlPlane: { path: 'governance/control-plane.lock.json', sha256: hex, role: 'ds-author', inputDigest: `sha256:${hex}`, contractDigest: `sha256:${hex}`, snapshotDigest: `sha256:${hex}`, generatorVersion: version },
    consumer: { path: 'template/ds-product-template/governance/lock.json', sha256: hex, role: 'template-consumer', release: { designSystem: version, storybookConfig: version } },
    forkCorpus: { path: 'packages/design-system/ds-canonical/fork/governance.lock', sha256: hex },
    productTemplateScaffold: {
      path: PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
      size: scaffoldLockBytes.length,
      sha256: scaffoldLockDigest,
      schemaVersion: 1,
      releaseVersion: version,
      staticTreeSha256: scaffoldLock.staticTreeSha256,
      publishedPathCount: scaffoldLock.publishedPathCount,
    },
  },
  sbom: { file: 'release.sbom.cdx.json', size: 1, sha256: hex },
}
const fixture = () => {
  const snapshot = immutableReleaseFixture({
    repository,
    version,
    commit: sourceSha,
    tree: sourceTree,
    bom,
    scaffoldLockBody: scaffoldLockBytes,
  })
  return {
    bomBytes: snapshot.bomBody,
    scaffoldLockBytes,
    snapshot,
    repository,
    version,
    sourceSha,
    sourceTree,
    npmPackages: snapshot.bom.packages.filter(item => ['@qijenchen/design-system', '@qijenchen/storybook-config'].includes(item.name)),
  }
}

test('binds mirror source to closed BOM, peeled tag and immutable release asset bytes', () => {
  assert.equal(verifyMirrorRelease(fixture()).sourceSha, sourceSha)
})

for (const [label, mutate, pattern] of [
  ['wrong asset digest', value => { value.snapshot.release.assets.find(item => item.name === 'release-bom.json').digest = `sha256:${'0'.repeat(64)}` }, /failed exact metadata\/byte readback/],
  ['wrong signed annotated tag commit', value => { value.snapshot.tagIdentity.commit = 'e'.repeat(40) }, /repository, tag object, commit, and tree/],
  ['cross-repository BOM replay', value => { value.repository = 'attacker/design-system' }, /differs from trusted release authority/],
  ['post-release source commit', value => { value.sourceSha = 'f'.repeat(40) }, /source, verified annotated tag/],
]) {
  test(`rejects ${label} before mirror writer authority`, () => {
    const value = fixture()
    mutate(value)
    assert.throws(() => verifyMirrorRelease(value), pattern)
  })
}

test('rejects scaffold lock byte or immutable asset substitution before writer authority', () => {
  const substituted = fixture()
  substituted.scaffoldLockBytes = Buffer.concat([scaffoldLockBytes, Buffer.from('\n')])
  assert.throws(() => verifyMirrorRelease(substituted), /downloaded scaffold lock differs/)
  const altered = fixture()
  altered.snapshot.release.assets.find(item => item.name === PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET).digest = `sha256:${'0'.repeat(64)}`
  assert.throws(() => verifyMirrorRelease(altered), /failed exact metadata\/byte readback/)
})

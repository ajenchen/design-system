#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { compareReleaseAssets } from './release-github-release.mjs'
import { assertTokenlessNpmEnvironment, clearSetupNodeRegistryPlaceholder } from './release-npm-lib.mjs'

const workflow = readFileSync('.github/workflows/release.yml', 'utf8')
const npmPublisher = readFileSync('scripts/release-npm-publish.mjs', 'utf8')
const githubPublisher = readFileSync('scripts/release-github-release.mjs', 'utf8')

test('release is a protected-default three-job workflow', () => {
  assert.match(workflow, /on:\n  repository_dispatch:\n[\s\S]*types: \[stage-protected-release\]/)
  assert.doesNotMatch(workflow, /^  (?:push|workflow_dispatch|pull_request):/m)
  const jobs = [...workflow.matchAll(/^  ([a-z][a-z0-9-]+):\n    name:/gm)].map(match => match[1])
  assert.deepEqual(jobs, ['resolve-release-request', 'build-and-publish-npm', 'publish-github-release'])
  assert.match(workflow, /test "\$event_commit" = "\$main_commit"/)
  assert.match(workflow, /test "\$tag_commit" = "\$main_commit"/)
})

test('release separates npm OIDC from GitHub contents authority', () => {
  const npmJob = workflow.slice(workflow.indexOf('  build-and-publish-npm:'), workflow.indexOf('  publish-github-release:'))
  const githubJob = workflow.slice(workflow.indexOf('  publish-github-release:'))
  assert.match(npmJob, /environment:\n      name: npm-release/)
  assert.match(npmJob, /contents: read/)
  assert.match(npmJob, /id-token: write/)
  assert.doesNotMatch(npmJob, /contents: write|attestations: write/)
  assert.match(githubJob, /actions: read/)
  assert.match(githubJob, /contents: write/)
  assert.doesNotMatch(githubJob, /id-token: write|attestations: write/)
})

test('release builds and binds exactly six artifacts once', () => {
  assert.equal((workflow.match(/run-verified-npm\.mjs -- pack \.\/packages\//g) || []).length, 3)
  assert.equal((workflow.match(/node scripts\/release-sbom\.mjs/g) || []).length, 1)
  assert.match(workflow, /product-template-scaffold-lock\.mjs[\s\S]*build-release-bom\.mjs/)
  assert.match(workflow, /release_set_sha256: \$\{\{ steps\.release_set\.outputs\.sha256 \}\}/)
  assert.match(workflow, /release-set\.mjs[\s\S]*--expected "\$\{\{ needs\.build-and-publish-npm\.outputs\.release_set_sha256 \}\}"/)
})

test('npm publisher is tokenless, direct, resumable, and closes all three packages', () => {
  assert.match(npmPublisher, /assertTokenlessNpmEnvironment/)
  assert.match(npmPublisher, /npmResult\(npmCli, \[[\s\S]*'publish', archive,[\s\S]*'--provenance'/)
  assert.match(npmPublisher, /existing\.kind === 'found'[\s\S]*validateRegistryPackage[\s\S]*continue/)
  assert.match(npmPublisher, /existing\.kind !== 'missing'/)
  assert.match(npmPublisher, /waitForPublishedPackage/)
  assert.match(npmPublisher, /for \(const item of context\.ordered\) await validateRegistryPackage/)
  assert.match(npmPublisher, /readTagVersions\(npmCli, context\.ordered, context\.targetTag\)/)
  assert.doesNotMatch(npmPublisher, /git\/ref\/heads\/main|protected main moved/, 'main may advance after the immutable release tag is bound')
  assert.doesNotMatch(npmPublisher, /NPM_TOKEN|NODE_AUTH_TOKEN|_authToken|stage publish/)
})

test('setup-node registry placeholder is cleared without allowing a real npm credential', () => {
  const placeholder = { NODE_AUTH_TOKEN: 'XXXXX-XXXXX-XXXXX-XXXXX' }
  assert.equal(clearSetupNodeRegistryPlaceholder(placeholder), true)
  assert.equal(placeholder.NODE_AUTH_TOKEN, '')
  assert.doesNotThrow(() => assertTokenlessNpmEnvironment(placeholder))
  assert.throws(
    () => assertTokenlessNpmEnvironment({ NODE_AUTH_TOKEN: 'npm_real_credential' }),
    /NODE_AUTH_TOKEN/,
  )
})

test('retired staging and finalizer gates are absent from release', () => {
  assert.equal(existsSync('.github/workflows/release-finalize.yml'), false)
  assert.doesNotMatch(workflow, /trust-preflight|release-finalize|release-npm-(?:approve|promote)|actions\/attest@|test:governance-harnesses|build-storybook/)
})

test('GitHub Release helper reads back the exact asset name, size, and digest', () => {
  assert.match(githubPublisher, /release', 'create'/)
  assert.match(githubPublisher, /release', 'upload'/)
  assert.match(githubPublisher, /release', 'edit'/)
  assert.match(githubPublisher, /observed\.digest !== wanted\.digest \|\| observed\.size !== wanted\.size/)
  assert.doesNotMatch(githubPublisher, /immutable releases setting|requires immutable/i)

  const files = Array.from({ length: 6 }, (_, index) => ({
    name: `asset-${index}`,
    size: 100 + index,
    sha256: `${index}`.repeat(64),
  }))
  const state = {
    assets: files.map(item => ({ name: item.name, size: item.size, digest: `sha256:${item.sha256}` })),
  }
  assert.deepEqual(compareReleaseAssets(state, files), [])
  assert.deepEqual(compareReleaseAssets({ assets: state.assets.slice(1) }, files), [files[0]])
  assert.throws(() => compareReleaseAssets({ assets: [{ ...state.assets[0], size: 999 }, ...state.assets.slice(1)] }, files), /readback differs/)
  assert.throws(() => compareReleaseAssets({ assets: [{ ...state.assets[0], digest: 'sha256:bad' }, ...state.assets.slice(1)] }, files), /readback differs/)
  assert.throws(() => compareReleaseAssets({ assets: [...state.assets, { name: 'extra', size: 1, digest: 'sha256:x' }] }, files), /unexpected assets/)
})

#!/usr/bin/env node
// Meta-test for check-src-republish.mjs.
//
// Safety invariant: the probe repository is always an isolated mkdtemp fixture.
// This test must never stage, commit, clean, or reset the caller's repository.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  publishedVersionFromRegistry,
  releaseDistTag,
  runRepublishGate,
  selectPublishedTagCommit,
} from './check-src-republish.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CALLER_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: HERE,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()
const CHECKER = join(HERE, 'check-src-republish.mjs')

const callerFingerprint = () => ({
  head: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: CALLER_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim(),
  status: execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    cwd: CALLER_ROOT,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString('base64'),
})

const before = callerFingerprint()
const fixture = mkdtempSync(join(tmpdir(), 'ds-republish-meta-'))
const fixturePackage = join(fixture, 'packages', 'design-system', 'package.json')
const fixtureSource = join(fixture, 'packages', 'design-system', 'src', 'index.ts')
const fixtureProbe = join(fixture, 'packages', 'design-system', 'src', '__republish_meta_probe__.tsx')

const git = (...args) => execFileSync('git', args, {
  cwd: fixture,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()

let publishedCommit = null
const gate = async ({
  baselineCommitResolver = () => publishedCommit,
  publishedVersionResolver = async () => '1.2.3',
} = {}) => {
  try {
    const result = await runRepublishGate({
      baselineCommitResolver,
      publishedVersionResolver,
      repoRoot: fixture,
    })
    return { result, status: 0 }
  } catch (error) {
    return { error, status: 1 }
  }
}

const packageJson = (version) => `${JSON.stringify({
  name: '@qijenchen/design-system',
  version,
  files: ['src/**/*.ts', 'src/**/*.tsx'],
}, null, 2)}\n`

let ok = true
try {
  const registryRequests = []
  const registryFetch = async (url) => {
    registryRequests.push(url)
    const version = url.endsWith('/beta') ? '1.2.3-beta.103' : '1.2.3'
    return new Response(JSON.stringify({ name: '@qijenchen/design-system', version }), { status: 200 })
  }
  const betaBaseline = await publishedVersionFromRegistry({ releaseVersion: '1.2.3-beta.104', fetcher: registryFetch })
  const stableBaseline = await publishedVersionFromRegistry({ releaseVersion: '1.2.4', fetcher: registryFetch })
  if (
    releaseDistTag('1.2.3-beta.104') !== 'beta'
      || releaseDistTag('1.2.4') !== 'latest'
      || betaBaseline !== '1.2.3-beta.103'
      || stableBaseline !== '1.2.3'
      || !registryRequests[0].endsWith('/beta')
      || !registryRequests[1].endsWith('/latest')
  ) {
    console.error('✗ registry baseline did not follow the current release channel')
    ok = false
  } else {
    console.log('✓ registry baseline follows beta/latest release channels')
  }

  const lightweightSha = '1'.repeat(40)
  const tagObjectSha = '2'.repeat(40)
  const annotatedCommitSha = '3'.repeat(40)
  if (
    selectPublishedTagCommit(`${lightweightSha}\trefs/tags/v1.2.3\n`, 'v1.2.3') !== lightweightSha
      || selectPublishedTagCommit(
        `${tagObjectSha}\trefs/tags/v1.2.3\n${annotatedCommitSha}\trefs/tags/v1.2.3^{}\n`,
        'v1.2.3',
      ) !== annotatedCommitSha
  ) {
    console.error('✗ remote tag resolver did not accept exact lightweight and annotated forms')
    ok = false
  } else {
    console.log('✓ remote tag resolver accepts exact lightweight and annotated forms')
  }

  mkdirSync(dirname(fixtureSource), { recursive: true })
  writeFileSync(fixturePackage, packageJson('1.2.3'))
  writeFileSync(fixtureSource, 'export const baseline = true\n')

  git('init', '-q')
  git('config', 'user.name', 'Republish Meta Test')
  git('config', 'user.email', 'republish-meta-test@example.invalid')
  git('add', '--', 'packages/design-system/package.json', 'packages/design-system/src/index.ts')
  git('commit', '--no-verify', '-q', '-m', 'fixture: published baseline')
  git('tag', 'v1.2.3')
  publishedCommit = git('rev-parse', 'v1.2.3^{commit}')

  const originalPath = process.env.PATH
  const originalNodeOptions = process.env.NODE_OPTIONS
  process.env.PATH = '/republish-test-poison-path'
  process.env.NODE_OPTIONS = '--import=/republish-test-poison-import.mjs'
  const baseline = await gate()
  if (originalPath === undefined) delete process.env.PATH
  else process.env.PATH = originalPath
  if (originalNodeOptions === undefined) delete process.env.NODE_OPTIONS
  else process.env.NODE_OPTIONS = originalNodeOptions
  if (baseline.status !== 0) {
    console.error('✗ isolated baseline should pass')
    console.error(baseline.error?.message)
    ok = false
  } else {
    console.log('✓ isolated baseline PASS with poisoned PATH/NODE_OPTIONS ignored')
  }

  const unavailableRegistry = await gate({
    publishedVersionResolver: async () => { throw new Error('fixture registry unavailable') },
  })
  if (unavailableRegistry.status === 0) {
    console.error('✗ unavailable published baseline transport failed open')
    ok = false
  } else {
    console.log('✓ unavailable published baseline transport blocked')
  }
  const unavailableTag = await gate({
    baselineCommitResolver: () => { throw new Error('fixture remote tag unavailable') },
  })
  if (unavailableTag.status === 0) {
    console.error('✗ unavailable published baseline tag failed open')
    ok = false
  } else {
    console.log('✓ unavailable published baseline tag blocked')
  }

  writeFileSync(fixtureProbe, 'export const __republishMetaProbe = 1\n')
  git('add', '--', 'packages/design-system/src/__republish_meta_probe__.tsx')
  git('commit', '--no-verify', '-q', '-m', 'fixture: unversioned publish-surface change')
  const violation = await gate()
  if (violation.status === 0) {
    console.error('✗ unversioned publish-surface commit was not blocked')
    ok = false
  } else {
    console.log(`✓ isolated violation blocked (exit ${violation.status})`)
  }

  writeFileSync(fixturePackage, packageJson('1.2.2'))
  const downgrade = await gate()
  if (downgrade.status === 0) {
    console.error('✗ downgraded publish-surface change was not blocked')
    ok = false
  } else {
    console.log('✓ isolated downgrade blocked')
  }

  writeFileSync(fixturePackage, packageJson('1.2.4'))
  git('add', '--', 'packages/design-system/package.json')
  git('commit', '--no-verify', '-q', '-m', 'fixture: bump package version')
  const bumped = await gate()
  if (bumped.status !== 0) {
    console.error('✗ version-bumped publish-surface change should pass')
    console.error(bumped.error?.message)
    ok = false
  } else {
    console.log('✓ isolated version bump PASS')
  }
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

const after = callerFingerprint()
if (after.head !== before.head || after.status !== before.status) {
  console.error('✗ safety invariant failed: caller repository changed during isolated meta-test')
  ok = false
} else {
  console.log('✓ caller repository remained byte-for-byte unchanged at HEAD/status boundary')
}

// The copied checker must remain exactly the source under test; this read also
// fails loudly if future refactors move it without updating the fixture.
if (readFileSync(CHECKER).length === 0) {
  console.error('✗ checker source is unexpectedly empty')
  ok = false
}

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)

#!/usr/bin/env node
// Create or safely resume an exact GitHub draft, then require immutable release verification.

import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  captureClosedGitHubToken,
  runClosedGh,
} from './lib/closed-tool-execution.mjs'
import { inspectDigestBoundEvidenceFile } from './release-npm-lib.mjs'
import { inspectReleaseSet } from './release-set.mjs'
import {
  assertVerifiedReleaseTag,
  requestGitHubJson,
  resolveRemoteTagIdentity,
} from './release-remote-tag.mjs'

const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

function parseArgs(argv) {
  const allowed = new Set([
    '--artifacts', '--repository', '--tag', '--git-head', '--tag-object', '--tag-token-env',
    '--audit-evidence', '--audit-evidence-sha256',
    '--release-trust-evidence', '--release-trust-evidence-sha256', '--gh',
  ])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of [
    '--artifacts', '--repository', '--tag', '--git-head', '--tag-object', '--tag-token-env',
    '--audit-evidence', '--audit-evidence-sha256', '--release-trust-evidence', '--release-trust-evidence-sha256',
  ]) {
    if (!values[required]) throw new Error(`${required} is required`)
  }
  for (const name of ['--audit-evidence-sha256', '--release-trust-evidence-sha256']) {
    if (!/^[a-f0-9]{64}$/.test(values[name])) throw new Error(`${name} must be a lowercase SHA-256`)
  }
  return values
}

function ghResult(ghContext, args, options = {}) {
  return runClosedGh(args, {
    cwd: ROOT,
    environment: {},
    executable: ghContext.executable,
    maxOutputBytes: 16 * 1024 * 1024,
    repoRoot: ROOT,
    token: ghContext.token,
    ...options,
  })
}

function ghRun(ghContext, args) {
  const result = ghResult(ghContext, args)
  if (result.status !== 0) {
    throw new Error(`gh ${args.slice(0, 3).join(' ')} failed (exit ${result.status}): ${(result.stderr || result.stdout || '').trim().slice(0, 1500)}`)
  }
  return result.stdout
}

function viewRelease(ghContext, repository, tag) {
  const result = ghResult(ghContext, [
    'release', 'view', tag, '--repo', repository,
    '--json', 'tagName,name,isDraft,isImmutable,isPrerelease,targetCommitish,assets',
  ])
  if (result.status === 0) return JSON.parse(result.stdout)
  const message = `${result.stderr || ''}${result.stdout || ''}`
  if (/release not found|HTTP 404/i.test(message)) return null
  throw new Error(`cannot inspect GitHub Release ${tag}: ${message.trim().slice(0, 1500)}`)
}

async function recheckRemoteTag(expected, tagReadToken) {
  const actual = await resolveRemoteTagIdentity({
    repository: expected.repository,
    tag: expected.tag,
    requestJson: path => requestGitHubJson({ token: tagReadToken, path }),
  })
  assertVerifiedReleaseTag({ identity: actual, expectedCommit: expected.gitHead, expectedTagObject: expected.tagObject })
}

export function assertImmutableReleasesEnabled(ghContext, repository, phase) {
  const result = ghResult(ghContext, [
    'api', `repos/${repository}/immutable-releases`, '--method', 'GET',
    '--header', 'Accept: application/vnd.github+json',
    '--header', 'X-GitHub-Api-Version: 2026-03-10',
  ])
  if (result.status !== 0) {
    throw new Error(`immutable releases are not enabled/readable ${phase}; refusing GitHub Release mutation: ${(result.stderr || result.stdout || '').trim().slice(0, 800)}`)
  }
  let state = null
  try { state = JSON.parse(result.stdout) } catch { /* fail closed below */ }
  if (state?.enabled !== true) throw new Error(`immutable releases are not enabled ${phase}; refusing GitHub Release mutation`)
  return state
}

export function compareReleaseAssets(state, expectedFiles) {
  const expected = new Map(expectedFiles.map((item) => [item.name, `sha256:${item.sha256}`]))
  if (expected.size !== expectedFiles.length) throw new Error('expected GitHub Release asset set contains duplicate names')
  const actualAssets = state?.assets || []
  const actual = new Map()
  for (const asset of actualAssets) {
    if (!asset?.name || actual.has(asset.name)) throw new Error('GitHub Release contains duplicate/invalid asset names')
    actual.set(asset.name, asset.digest)
  }
  const unexpected = [...actual.keys()].filter((name) => !expected.has(name))
  if (unexpected.length) throw new Error(`GitHub Release contains unexpected assets: ${unexpected.sort().join(', ')}`)
  for (const [name, digest] of actual) {
    if (digest !== expected.get(name)) throw new Error(`GitHub Release asset ${name} has digest ${digest || '<missing>'}, expected ${expected.get(name)}`)
  }
  return expectedFiles.filter((item) => !actual.has(item.name))
}

function validateIdentity(state, expected, { published }) {
  if (state.tagName !== expected.tag) throw new Error(`GitHub Release tag mismatch: ${state.tagName} != ${expected.tag}`)
  if (state.name !== expected.tag) throw new Error(`GitHub Release title mismatch: ${state.name || '<empty>'} != ${expected.tag}`)
  // targetCommitish is not a commit identity when a release uses a pre-existing
  // tag (GitHub commonly returns the default branch). The exact GitHub-verified
  // annotated tag object is rechecked at every mutation/verification boundary.
  if (published) {
    if (state.isDraft) throw new Error('GitHub Release remained a draft')
    if (!state.isImmutable) throw new Error('GitHub Release was published without immutable-release enforcement')
    if (Boolean(state.isPrerelease) !== expected.prerelease) throw new Error('GitHub Release prerelease state is incorrect')
  } else if (!state.isDraft) {
    throw new Error('existing GitHub Release is published but not in an accepted immutable final state')
  }
}

async function verifyPublishedRelease(ghContext, repository, tag, expected, expectedFiles, tagReadToken) {
  let state
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    state = viewRelease(ghContext, repository, tag)
    if (state?.isImmutable) break
    if (attempt < 12) await sleep(5_000)
  }
  if (!state) throw new Error(`GitHub Release disappeared after publish: ${tag}`)
  validateIdentity(state, expected, { published: true })
  await recheckRemoteTag(expected, tagReadToken)
  const missing = compareReleaseAssets(state, expectedFiles)
  if (missing.length) throw new Error(`published GitHub Release is missing assets: ${missing.map((item) => item.name).join(', ')}`)
  ghRun(ghContext, ['release', 'verify', tag, '--repo', repository])
  for (const item of expectedFiles) {
    ghRun(ghContext, ['release', 'verify-asset', tag, item.path, '--repo', repository])
  }
  console.log(`✅ immutable GitHub Release, exact six-file release set, and two permanent evidence assets verified: ${tag}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const writerToken = captureClosedGitHubToken({
    environment: process.env,
    tokenEnvironmentName: 'GH_TOKEN',
  })
  const tagTokenEnvironmentName = args['--tag-token-env']
  if (
    !/^[A-Z][A-Z0-9_]{0,127}$/.test(tagTokenEnvironmentName)
      || ['GH_TOKEN', 'GITHUB_TOKEN'].includes(tagTokenEnvironmentName)
  ) throw new Error('--tag-token-env must name a separate explicit read-only token authority')
  const tagReadToken = process.env[tagTokenEnvironmentName]
  if (
    typeof tagReadToken !== 'string'
      || tagReadToken.length < 8
      || tagReadToken.length > 4096
      || /[\0\r\n]/.test(tagReadToken)
  ) throw new Error(`GitHub tag-read token environment variable is empty or malformed: ${tagTokenEnvironmentName}`)
  if (tagReadToken === writerToken) throw new Error('GitHub release writer and tag-read authorities must be distinct')
  const ghContext = Object.freeze({
    executable: args['--gh'],
    token: writerToken,
  })
  const releaseSet = inspectReleaseSet(args['--artifacts'])
  const auditEvidence = inspectDigestBoundEvidenceFile(args['--audit-evidence'], {
    expectedSha256: args['--audit-evidence-sha256'],
    expectedName: 'npm-finalization-receipt.json',
    label: 'release audit evidence',
  })
  const releaseTrustEvidence = inspectDigestBoundEvidenceFile(args['--release-trust-evidence'], {
    expectedSha256: args['--release-trust-evidence-sha256'],
    expectedName: 'release-trust-preflight.json',
    label: 'release trust evidence',
  })
  const expectedFiles = [
    ...releaseSet.files.map((item) => ({ ...item, path: join(releaseSet.artifacts, item.name) })),
    auditEvidence,
    releaseTrustEvidence,
  ]
  const expected = {
    artifacts: releaseSet.artifacts,
    repository: args['--repository'],
    tag: args['--tag'],
    gitHead: args['--git-head'],
    tagObject: args['--tag-object'],
    prerelease: args['--tag'].includes('-'),
  }
  await recheckRemoteTag(expected, tagReadToken)
  assertImmutableReleasesEnabled(ghContext, expected.repository, 'before release inspection')
  let state = viewRelease(ghContext, expected.repository, expected.tag)
  if (state && !state.isDraft) {
    validateIdentity(state, expected, { published: true })
    const missing = compareReleaseAssets(state, expectedFiles)
    if (missing.length) throw new Error(`published GitHub Release is missing assets: ${missing.map((item) => item.name).join(', ')}`)
    await verifyPublishedRelease(ghContext, expected.repository, expected.tag, expected, expectedFiles, tagReadToken)
    console.log('ℹ️ exact immutable GitHub Release already existed; no mutation performed')
    return
  }

  if (!state) {
    assertImmutableReleasesEnabled(ghContext, expected.repository, 'immediately before draft creation')
    await recheckRemoteTag(expected, tagReadToken)
    ghRun(ghContext, [
      'release', 'create', expected.tag, '--repo', expected.repository, '--verify-tag',
      '--target', expected.gitHead, '--generate-notes', '--title', expected.tag, '--draft',
    ])
    state = viewRelease(ghContext, expected.repository, expected.tag)
    if (!state) throw new Error('GitHub draft creation returned success but the draft is unavailable')
  }

  validateIdentity(state, expected, { published: false })
  const missing = compareReleaseAssets(state, expectedFiles)
  for (const item of missing) {
    assertImmutableReleasesEnabled(ghContext, expected.repository, `immediately before uploading ${item.name}`)
    await recheckRemoteTag(expected, tagReadToken)
    ghRun(ghContext, [
      'release', 'upload', expected.tag, item.path,
      '--repo', expected.repository,
    ])
  }
  state = viewRelease(ghContext, expected.repository, expected.tag)
  validateIdentity(state, expected, { published: false })
  const stillMissing = compareReleaseAssets(state, expectedFiles)
  if (stillMissing.length) throw new Error(`GitHub draft upload is incomplete: ${stillMissing.map((item) => item.name).join(', ')}`)

  assertImmutableReleasesEnabled(ghContext, expected.repository, 'immediately before publication')
  await recheckRemoteTag(expected, tagReadToken)
  ghRun(ghContext, [
    'release', 'edit', expected.tag, '--repo', expected.repository, '--verify-tag',
    '--target', expected.gitHead, '--draft=false', `--prerelease=${expected.prerelease}`,
  ])
  await verifyPublishedRelease(ghContext, expected.repository, expected.tag, expected, expectedFiles, tagReadToken)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

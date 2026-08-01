#!/usr/bin/env node
// Create or resume the exact GitHub Release, then require published asset readback.

import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureClosedGitHubToken, runClosedGh } from './lib/closed-tool-execution.mjs'
import { inspectReleaseSet } from './release-set.mjs'

const sleep = milliseconds => new Promise(done => setTimeout(done, milliseconds))
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

function parseArgs(argv) {
  const allowed = new Set(['--artifacts', '--repository', '--tag', '--git-head', '--gh'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of ['--artifacts', '--repository', '--tag', '--git-head']) {
    if (!values[required]) throw new Error(`${required} is required`)
  }
  if (!OBJECT_ID.test(values['--git-head'])) throw new Error('--git-head must be a full Git object ID')
  return values
}

function ghResult(ghContext, args) {
  return runClosedGh(args, {
    cwd: ROOT,
    environment: {},
    executable: ghContext.executable,
    maxOutputBytes: 16 * 1024 * 1024,
    repoRoot: ROOT,
    token: ghContext.token,
  })
}

function ghRun(ghContext, args) {
  const result = ghResult(ghContext, args)
  if (result.status !== 0) {
    throw new Error(`gh ${args.slice(0, 3).join(' ')} failed (exit ${result.status}): ${(result.stderr || result.stdout || '').trim().slice(0, 1500)}`)
  }
  return result.stdout
}

function ghJson(ghContext, args) {
  return JSON.parse(ghRun(ghContext, args))
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

function resolveTagCommit(ghContext, repository, tag) {
  const encoded = tag.split('/').map(encodeURIComponent).join('/')
  const path = `repos/${repository}/git/ref/tags/${encoded}`
  const reference = ghJson(ghContext, ['api', path])
  let commit
  if (reference?.object?.type === 'commit') {
    commit = reference.object.sha
  } else if (reference?.object?.type === 'tag' && OBJECT_ID.test(reference.object.sha || '')) {
    const tagObject = ghJson(ghContext, ['api', `repos/${repository}/git/tags/${reference.object.sha}`])
    if (tagObject?.tag !== tag || tagObject?.object?.type !== 'commit') {
      throw new Error(`release tag ${tag} does not directly target a commit`)
    }
    commit = tagObject.object.sha
  } else {
    throw new Error(`release tag ${tag} has an unsupported Git object type`)
  }
  const confirmed = ghJson(ghContext, ['api', path])
  if (confirmed?.object?.type !== reference.object.type || confirmed?.object?.sha !== reference.object.sha) {
    throw new Error(`release tag ${tag} moved during remote verification`)
  }
  return commit
}

function recheckRemoteTag(ghContext, expected) {
  const commit = resolveTagCommit(ghContext, expected.repository, expected.tag)
  if (commit !== expected.gitHead) throw new Error(`release tag ${expected.tag} targets ${commit}, expected ${expected.gitHead}`)
}

export function compareReleaseAssets(state, expectedFiles) {
  const expected = new Map(expectedFiles.map(item => [item.name, {
    digest: `sha256:${item.sha256}`,
    size: item.size,
  }]))
  if (expected.size !== expectedFiles.length) throw new Error('expected GitHub Release asset set contains duplicate names')
  const actual = new Map()
  for (const asset of state?.assets || []) {
    if (!asset?.name || actual.has(asset.name)) throw new Error('GitHub Release contains duplicate or invalid asset names')
    actual.set(asset.name, { digest: asset.digest, size: asset.size })
  }
  const unexpected = [...actual.keys()].filter(name => !expected.has(name))
  if (unexpected.length) throw new Error(`GitHub Release contains unexpected assets: ${unexpected.sort().join(', ')}`)
  for (const [name, observed] of actual) {
    const wanted = expected.get(name)
    if (observed.digest !== wanted.digest || observed.size !== wanted.size) {
      throw new Error(
        `GitHub Release asset ${name} readback differs: `
        + `digest=${observed.digest || '<missing>'} size=${observed.size ?? '<missing>'}, `
        + `expected digest=${wanted.digest} size=${wanted.size}`,
      )
    }
  }
  return expectedFiles.filter(item => !actual.has(item.name))
}

function validateIdentity(state, expected, { published }) {
  if (state.tagName !== expected.tag || state.name !== expected.tag) throw new Error('GitHub Release tag/title identity mismatch')
  if (published) {
    if (state.isDraft) throw new Error('GitHub Release remained a draft')
    if (Boolean(state.isPrerelease) !== expected.prerelease) throw new Error('GitHub Release prerelease state is incorrect')
  } else if (!state.isDraft) {
    throw new Error('GitHub Release unexpectedly became published during draft preparation')
  }
}

async function verifyPublishedRelease(ghContext, expected, expectedFiles) {
  let state
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    state = viewRelease(ghContext, expected.repository, expected.tag)
    if (state && !state.isDraft) break
    if (attempt < 12) await sleep(5_000)
  }
  if (!state) throw new Error(`GitHub Release disappeared after publish: ${expected.tag}`)
  validateIdentity(state, expected, { published: true })
  recheckRemoteTag(ghContext, expected)
  const missing = compareReleaseAssets(state, expectedFiles)
  if (missing.length) throw new Error(`published GitHub Release is missing assets: ${missing.map(item => item.name).join(', ')}`)
  console.log(
    `✅ published GitHub Release and exact six-file name/size/digest readback verified: ${expected.tag}`
    + (state.isImmutable ? ' (immutable)' : ''),
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const ghContext = Object.freeze({
    executable: args['--gh'],
    token: captureClosedGitHubToken({ environment: process.env, tokenEnvironmentName: 'GH_TOKEN' }),
  })
  const releaseSet = inspectReleaseSet(args['--artifacts'])
  const expectedFiles = releaseSet.files.map(item => ({ ...item, path: join(releaseSet.artifacts, item.name) }))
  const expected = {
    repository: args['--repository'],
    tag: args['--tag'],
    gitHead: args['--git-head'],
    prerelease: args['--tag'].includes('-'),
  }

  recheckRemoteTag(ghContext, expected)
  let state = viewRelease(ghContext, expected.repository, expected.tag)
  if (state && !state.isDraft) {
    validateIdentity(state, expected, { published: true })
    const missing = compareReleaseAssets(state, expectedFiles)
    if (missing.length) throw new Error(`published GitHub Release is missing assets: ${missing.map(item => item.name).join(', ')}`)
    await verifyPublishedRelease(ghContext, expected, expectedFiles)
    console.log(
      'ℹ️ exact published GitHub Release already existed; no mutation performed'
      + (state.isImmutable ? ' (immutable)' : ''),
    )
    return
  }

  if (!state) {
    recheckRemoteTag(ghContext, expected)
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
    recheckRemoteTag(ghContext, expected)
    ghRun(ghContext, ['release', 'upload', expected.tag, item.path, '--repo', expected.repository])
  }
  state = viewRelease(ghContext, expected.repository, expected.tag)
  validateIdentity(state, expected, { published: false })
  const stillMissing = compareReleaseAssets(state, expectedFiles)
  if (stillMissing.length) throw new Error(`GitHub draft upload is incomplete: ${stillMissing.map(item => item.name).join(', ')}`)

  recheckRemoteTag(ghContext, expected)
  ghRun(ghContext, [
    'release', 'edit', expected.tag, '--repo', expected.repository, '--verify-tag',
    '--target', expected.gitHead, '--draft=false', `--prerelease=${expected.prerelease}`,
  ])
  await verifyPublishedRelease(ghContext, expected, expectedFiles)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}

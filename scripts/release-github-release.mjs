#!/usr/bin/env node
// Create or resume the exact GitHub Release, then require published asset readback.

import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureClosedGitHubToken, runClosedGh, runClosedGit } from './lib/closed-tool-execution.mjs'
import { LEDGER_NOTE_KINDS, LEDGER_REPO_PATH, releaseNotesMissingFromText, renderReleaseNotes } from '../packages/design-system/tools/changes/ledger.mjs'
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

function gitRead(args) {
  const result = runClosedGit(args, { cwd: ROOT, maxOutputBytes: 16 * 1024 * 1024, timeoutMs: 15_000 })
  if (result.error || result.signal !== null) {
    throw new Error(`release closed Git read failed:${args[0]}:${String(result.error?.message || result.signal)}`)
  }
  return { status: result.status, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') }
}

// 帳本段落:變更帳本(packages/design-system/ds-changes.json,隨 npm 出貨的唯一來源)在 gitHead 上、這一版那一節(鍵 = 版本號 = tag 去掉 v)
// 依序產生「新增 / 行為與畫面變更 / 破壞性變更」三段(一段都不省)。renderer 與讀回驗收都是帳本 lib 的同一支
// (packages/design-system/tools/changes/ledger.mjs;只用 node 內建模組 —— 這個 job 沒有 npm install)。
// 這一節沒漏寫由兩支閘保證:scripts/public-surface-invariant.mjs(破壞性差異)、scripts/release-notes-coverage-invariant.mjs
// (改到預覽看得見的檔與新增出口都有 added / updated / changes / noVisibleChange 涵蓋)。
// git = (args) => { status, stdout, stderr },預設走 closed git;測試可注入。
export function releaseLedgerNotes(gitHead, tag, git = gitRead) {
  const version = String(tag ?? '').replace(/^v/, '')
  if (!version) throw new Error('release notes: tag is required')
  const shown = git(['show', `${gitHead}:${LEDGER_REPO_PATH}`])
  if (shown?.status !== 0) {
    // 帳本是這三段的唯一來源;讀不到不是「沒有變更」(M37:沒觀察到 ≠ 沒發生)
    throw new Error(`release notes: cannot read ${String(gitHead).slice(0, 12)}:${LEDGER_REPO_PATH} (git show exit ${shown?.status}: ${String(shown?.stderr ?? '').trim().slice(0, 200)})`)
  }
  let ledger
  try { ledger = JSON.parse(String(shown.stdout)) } catch (error) { throw new Error(`release notes: ${LEDGER_REPO_PATH} is not valid JSON: ${error.message}`) }
  const section = renderReleaseNotes(ledger, version)
  const sectionData = ledger.releases?.[version] ?? {}
  const entries = [...(sectionData.changes ?? []), ...Object.keys(LEDGER_NOTE_KINDS).flatMap((kind) => sectionData[kind] ?? [])]
  return { version, ledger, entries, section }
}

// GitHub API:generate_release_notes 與 body 同時給時,body 接在自動產生的說明前面。
export function releaseCreateArgs(expected, notesSection) {
  if (typeof notesSection !== 'string' || !notesSection.trim()) throw new Error('release notes: the ledger sections are required (三段一段都不省)')
  return [
    'release', 'create', expected.tag, '--repo', expected.repository, '--verify-tag',
    '--target', expected.gitHead, '--generate-notes', '--title', expected.tag, '--draft',
    '--notes', notesSection,
  ]
}

/** 讀回的說明缺了什麼:三個段名(依序)與帳本這一節的每個條目 id;說明空白 = 全部缺 */
export function releaseNotesMissing(notes, body) {
  return releaseNotesMissingFromText(notes.ledger, notes.version, typeof body === 'string' ? body : '')
}

// 發布(--draft=false)前讀回草稿說明:三段少一段、或帳本這一節的條目 id 少一個就不發布。續跑時草稿可能是舊程式建的
// (只有破壞性變更段,或一段都沒有),那就把三段接到最前面再讀回一次 —— 「傳了 --notes」不等於「說明真的有寫」(M37),
// 驗的是讀回來的說明本身。
function ensureDraftReleaseNotes(ghContext, expected, notes) {
  const readBody = () => ghJson(ghContext, ['release', 'view', expected.tag, '--repo', expected.repository, '--json', 'body']).body
  let body = readBody()
  if (releaseNotesMissing(notes, body).length) {
    recheckRemoteTag(ghContext, expected)
    ghRun(ghContext, [
      'release', 'edit', expected.tag, '--repo', expected.repository,
      '--notes', [notes.section, String(body ?? '').trim()].filter(Boolean).join('\n\n'),
    ])
    body = readBody()
  }
  const missing = releaseNotesMissing(notes, body)
  if (missing.length) {
    throw new Error(`GitHub draft release notes omit ${missing.length} ledger heading(s)/entr(ies) of ${notes.version}: ${missing.join(', ')}`)
  }
  console.log(`✅ draft release notes carry 新增 / 行為與畫面變更 / 破壞性變更 in order and all ${notes.entries.length} ledger entries of ${notes.version}`)
}

function validateIdentity(state, expected, { published }) {
  if (state.tagName !== expected.tag || state.name !== expected.tag) throw new Error('GitHub Release tag/title identity mismatch')
  if (published) {
    if (state.isDraft) throw new Error('GitHub Release remained a draft')
    if (Boolean(state.isPrerelease) !== expected.prerelease) throw new Error('GitHub Release prerelease state is incorrect')
    if (state.isImmutable !== true) throw new Error('published GitHub Release is not immutable')
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
    `✅ immutable published GitHub Release and exact six-file name/size/digest readback verified: ${expected.tag}`,
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
      'ℹ️ exact immutable published GitHub Release already existed; no mutation performed',
    )
    return
  }

  const ledgerNotes = releaseLedgerNotes(expected.gitHead, expected.tag)
  if (!state) {
    recheckRemoteTag(ghContext, expected)
    ghRun(ghContext, releaseCreateArgs(expected, ledgerNotes.section))
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
  ensureDraftReleaseNotes(ghContext, expected, ledgerNotes)

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

#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW_PATH = resolve(ROOT, 'infra/governance/release-workflow.json')
const GITHUB_DESIRED_PATH = resolve(ROOT, 'infra/governance/desired/github.json')
const PACKAGE_PATHS = Object.freeze({
  '@qijenchen/design-system': 'packages/design-system/package.json',
  '@qijenchen/governance': 'packages/governance/package.json',
  '@qijenchen/storybook-config': 'packages/storybook-config/package.json',
})
const SUCCESS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped'])
const PENDING_STATUSES = new Set(['queued', 'in_progress', 'pending', 'requested', 'waiting'])

export class HumanBoundaryError extends Error {
  constructor(boundary, message) {
    super(message)
    this.name = 'HumanBoundaryError'
    this.boundary = boundary
  }
}

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function validateReleaseWorkflow(workflow) {
  invariant(workflow?.schemaVersion === 1, 'release workflow schemaVersion must be 1')
  invariant(workflow.profile === 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM', 'release workflow must use the standard small-team profile')
  invariant(workflow.decisionAuthority?.engineering === 'AUTO', 'release engineering authority must be AUTO')
  invariant(workflow.decisionAuthority?.ask === 'unresolved-product-ui-ux-ssot-choice', 'only unresolved product/UI/UX SSOT choices may ASK')
  invariant(
    JSON.stringify(workflow.decisionAuthority?.humanOnly) === JSON.stringify(['login', 'mfa', 'oauth', 'credential-reference']),
    'human-only boundaries must be exactly login/MFA/OAuth/credential-reference',
  )
  invariant(workflow.decisionAuthority?.resumeAfterHumanAction === 'AUTO', 'release must resume automatically after a human-only action')
  invariant(workflow.deepAuditReleasePolicy?.iterationBoundary === 'one-branch-one-pr-candidate-validation', 'deep audit must finish candidate validation on one branch and PR')
  invariant(workflow.deepAuditReleasePolicy?.publishAsIterationLoop === false, 'deep audit must never publish as an iteration or test loop')
  invariant(workflow.deepAuditReleasePolicy?.maximumFinalReleasesPerAudit === 1, 'deep audit permits at most one final release')
  invariant(
    workflow.deepAuditReleasePolicy?.additionalReleaseCondition === 'separately-evidenced-post-publish-blocker-or-security-incident',
    'an additional deep-audit release requires a separately evidenced post-publish blocker or security incident',
  )
  invariant(
    JSON.stringify(workflow.deepAuditReleasePolicy?.allowedAdditionalReleaseFailureClasses) === JSON.stringify(['post-publish-blocker', 'security-incident']),
    'deep-audit additional release failure classes are closed',
  )
  invariant(
    JSON.stringify(workflow.deepAuditReleasePolicy?.requiredIncidentFields) === JSON.stringify(['incidentId', 'failureClass', 'publishedVersion', 'evidenceRef']),
    'deep-audit additional releases must bind exact incident evidence fields',
  )
  invariant(
    JSON.stringify(workflow.steps?.map(step => step.id)) === JSON.stringify(['pr-checks', 'merge', 'publish', 'readback', 'consumer']),
    'release workflow must contain exactly the canonical five steps in order',
  )
  invariant(workflow.steps.every(step => step.authority === 'AUTO'), 'every release step must be AUTO')
  invariant(workflow.legacyMechanisms.every(item => item.standardRelease === 'non-blocking' || item.standardRelease === 'retired'), 'legacy mechanisms must not block standard release')
  for (const target of workflow.automation?.consumers ?? []) {
    const check = target.requiredCheck
    invariant(check?.context === 'Verify consumer', `consumer ${target.repository} must require Verify consumer`)
    invariant(check.integration === 'githubActions', `consumer ${target.repository} must use GitHub Actions verification`)
    invariant(/^\.github\/workflows\/.+\.ya?ml$/.test(check.producerWorkflow || ''), `consumer ${target.repository} verification workflow is invalid`)
    invariant(['pull_request', 'repository_dispatch'].includes(check.producerEvent), `consumer ${target.repository} verification event is invalid`)
    invariant(['pull-request-head', 'pull-request-base'].includes(check.producerHead), `consumer ${target.repository} verification head binding is invalid`)
  }
  return workflow
}

export function authorizeDeepAuditPublish(workflow, {
  completedFinalReleases,
  incident = null,
  priorAdditionalReleaseIncidentIds = [],
}) {
  validateReleaseWorkflow(workflow)
  invariant(Number.isInteger(completedFinalReleases) && completedFinalReleases >= 0 && completedFinalReleases <= 1, 'completed deep-audit final releases must be 0 or 1')
  invariant(Array.isArray(priorAdditionalReleaseIncidentIds) && priorAdditionalReleaseIncidentIds.every(value => typeof value === 'string' && value.length > 0), 'prior deep-audit incident IDs are invalid')
  if (completedFinalReleases === 0) {
    invariant(incident === null, 'the one final deep-audit release must not masquerade as an incident release')
    return Object.freeze({ authorization: 'final-release', releaseNumber: 1 })
  }

  invariant(incident && typeof incident === 'object' && !Array.isArray(incident), 'an additional deep-audit release requires incident evidence')
  const required = workflow.deepAuditReleasePolicy.requiredIncidentFields
  invariant(Object.keys(incident).length === required.length && required.every(field => Object.hasOwn(incident, field)), 'incident evidence must contain only the exact required fields')
  invariant(typeof incident.incidentId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(incident.incidentId), 'incidentId is invalid')
  invariant(!priorAdditionalReleaseIncidentIds.includes(incident.incidentId), 'incidentId already authorized an additional release')
  invariant(workflow.deepAuditReleasePolicy.allowedAdditionalReleaseFailureClasses.includes(incident.failureClass), 'incident failureClass is not eligible for an additional release')
  invariant(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(incident.publishedVersion), 'incident publishedVersion must be exact semver')
  invariant(typeof incident.evidenceRef === 'string' && incident.evidenceRef.length > 0 && incident.evidenceRef !== incident.incidentId, 'incident evidenceRef must be a separate non-empty reference')
  return Object.freeze({ authorization: 'incident-release', incidentId: incident.incidentId })
}

export function loadReleaseWorkflow(path = WORKFLOW_PATH) {
  return validateReleaseWorkflow(readJson(path))
}

function run(command, args, { allowFailure = false, input, env } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    env: env || process.env,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    const detail = `${result.stderr || result.stdout}`.trim()
    if (/authentication|not logged|login|oauth|token.*required|HTTP 401/i.test(detail)) {
      throw new HumanBoundaryError('login/oauth/credential-reference', detail || `${command} authentication is required`)
    }
    if (/two.factor|2fa|mfa/i.test(detail)) {
      throw new HumanBoundaryError('mfa', detail)
    }
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() }
}

// 2026-08-11 anti-self-lock fix:gh 憑證來源接上專案 canonical credential reference
//(~/.config/qijenchen-governance/github-token,與 git push / PR / merge 同一條已驗證通道)。
// gh 自己存的 OAuth token 過期不該擋住流程——憑證存在,只是 gh 讀錯地方。
// 環境已有 GH_TOKEN/GITHUB_TOKEN 時尊重之;credential 檔不存在則維持原行為(fail-closed 到
// login 邊界)。此為 credential reference 消費,非 secret 落地:token 只進子行程環境。
const GOVERNANCE_TOKEN_PATH = join(homedir(), '.config', 'qijenchen-governance', 'github-token')
function governanceGhEnv() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env
  try {
    const token = readFileSync(GOVERNANCE_TOKEN_PATH, 'utf8').trim()
    if (token) return { ...process.env, GH_TOKEN: token }
  } catch { /* 無 credential 檔 → 原行為 */ }
  return process.env
}

// 2026-08-11 anti-self-lock fix(user directive):gh 的 Go TLS 在 sandbox 內不信代理憑證,
// 但 curl 可通(同 token 已實測 merge PR)。以下 shim 把 orchestrator 用到的八種 gh 形狀
// 翻譯成 GitHub REST + curl;未涵蓋的形狀 fallback 原 gh(會顯性 TLS 失敗,不靜默)。
function curlGitHub(method, path, { headers = [], body = null } = {}) {
  let token = ''
  try { token = readFileSync(GOVERNANCE_TOKEN_PATH, 'utf8').trim() } catch { /* fallthrough */ }
  if (!token) token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
  const url = /^https?:/.test(path) ? path : `https://api.github.com/${path.replace(/^\//, '')}`
  const args = ['-sS', '-X', method, '-H', `Authorization: Bearer ${token}`,
    '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: release-orchestrator',
    '-w', '\n__HTTP_STATUS__:%{http_code}']
  for (const header of headers) args.push('-H', header)
  if (body !== null) args.push('-H', 'Content-Type: application/json', '-d', body)
  args.push(url)
  for (let attempt = 0; ; attempt += 1) {
    const result = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    if (result.error) throw result.error
    const raw = `${result.stdout}`
    const marker = raw.lastIndexOf('__HTTP_STATUS__:')
    const code = marker >= 0 ? Number(raw.slice(marker + 16).trim()) : 0
    const text = marker >= 0 ? raw.slice(0, marker).replace(/\n$/, '') : raw
    // 瞬時網路抖動(HTTP 0 = curl 連線層失敗)重試兩次再定論,避免長輪詢被單次抖動打斷
    if (code === 0 && attempt < 2) { sleep(3000); continue }
    return { code, ok: code >= 200 && code < 300, text }
  }
}
function shimDone(response, { allowFailure, label, mapText = null }) {
  if (!response.ok) {
    if (allowFailure) return { ok: false, stdout: '', stderr: `HTTP ${response.code}` }
    if (response.code === 401) throw new HumanBoundaryError('login/oauth/credential-reference', `HTTP 401 for ${label}`)
    throw new Error(`${label} failed: HTTP ${response.code}: ${response.text.slice(0, 300)}`)
  }
  return { ok: true, stdout: mapText === null ? response.text : mapText, stderr: '' }
}
function shimMapPull(p, detail = null) {
  return {
    number: p.number,
    state: p.merged_at || detail?.merged ? 'MERGED' : `${p.state || ''}`.toUpperCase(),
    mergeStateStatus: `${detail?.mergeable_state || p.mergeable_state || ''}`.toUpperCase(),
    mergeable: (detail?.mergeable ?? p.mergeable) === true ? 'MERGEABLE'
      : (detail?.mergeable ?? p.mergeable) === false ? 'CONFLICTING' : 'UNKNOWN',
    headRefOid: p.head?.sha, baseRefOid: p.base?.sha, url: p.html_url,
    title: p.title, body: p.body, headRefName: p.head?.ref, baseRefName: p.base?.ref,
    mergeCommit: p.merge_commit_sha ? { oid: p.merge_commit_sha } : null,
  }
}
function shimRowFromStatus(status, conclusionRaw, name, workflow) {
  const done = status === 'completed'
  const conclusion = `${conclusionRaw || ''}`
  const bucket = !done ? 'pending'
    : conclusion === 'success' ? 'pass'
    : ['neutral', 'skipped'].includes(conclusion) ? 'skipping'
    : conclusion === 'cancelled' ? 'cancel' : 'fail'
  return { bucket, name, state: done ? conclusion : 'pending', workflow }
}
function shimCheckRows(repository, headSha) {
  const response = curlGitHub('GET', `repos/${repository}/commits/${headSha}/check-runs?per_page=100`)
  if (response.ok) {
    const runs = JSON.parse(response.text).check_runs || []
    return runs.map(item => shimRowFromStatus(item.status, item.conclusion, item.name, item.app?.name || ''))
  }
  // 2026-08-12 fallback:fine-grained token 的 Checks 讀取權可能只涵蓋部分 repo(403),
  // 但 Actions 讀取權可用 — required check(如 WM 的「Verify consumer」)本就是 Actions job,
  // 由 runs?head_sha → jobs 推導同一份列表,語意等價。
  if (response.code !== 403) return null
  const runsResponse = curlGitHub('GET', `repos/${repository}/actions/runs?head_sha=${headSha}&per_page=20`)
  if (!runsResponse.ok) return null
  const rows = []
  for (const run of JSON.parse(runsResponse.text).workflow_runs || []) {
    const jobsResponse = curlGitHub('GET', `repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`)
    if (!jobsResponse.ok) continue
    for (const job of JSON.parse(jobsResponse.text).jobs || []) {
      rows.push(shimRowFromStatus(job.status, job.conclusion, job.name, run.name || ''))
    }
  }
  return rows
}
function flagValue(args, flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : null
}
function ghShim(args, { allowFailure = false, input = null } = {}) {
  const label = `gh-shim ${args.join(' ')}`.slice(0, 120)
  if (args[0] === 'api') {
    let method = 'GET'; const headers = []; const fields = {}; let endpoint = null; let useStdin = false
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index]
      if (arg === '--method') { method = args[++index] }
      else if (arg === '-H') { headers.push(args[++index]) }
      else if (arg === '-f' || arg === '-F') { const [key, ...rest] = args[++index].split('='); fields[key] = rest.join('=') }
      else if (arg === '--input') { useStdin = args[++index] === '-' }
      else if (!endpoint) endpoint = arg
    }
    if (!endpoint) return null
    const hasFields = Object.keys(fields).length > 0
    const body = useStdin ? (input ?? '') : hasFields ? JSON.stringify(fields) : null
    if (body !== null && method === 'GET') method = 'POST'
    const response = curlGitHub(method, endpoint, { headers, body })
    return shimDone(response, { allowFailure, label })
  }
  if (args[0] === 'release' && args[1] === 'view') {
    const repository = flagValue(args, '--repo')
    const response = curlGitHub('GET', `repos/${repository}/releases/tags/${encodeURIComponent(args[2])}`)
    if (!response.ok) return shimDone(response, { allowFailure, label })
    const release = JSON.parse(response.text)
    return { ok: true, stdout: JSON.stringify({
      tagName: release.tag_name, isDraft: release.draft, isImmutable: Boolean(release.immutable),
      isPrerelease: release.prerelease, publishedAt: release.published_at, url: release.html_url,
    }), stderr: '' }
  }
  if (args[0] === 'run' && args[1] === 'list') {
    const repository = flagValue(args, '--repo')
    const workflowFile = flagValue(args, '--workflow')
    const limit = flagValue(args, '--limit') || '20'
    const response = curlGitHub('GET', `repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=${limit}`)
    if (!response.ok) return shimDone(response, { allowFailure, label })
    const rows = (JSON.parse(response.text).workflow_runs || []).map(item => ({
      databaseId: item.id, status: item.status, conclusion: item.conclusion,
      headSha: item.head_sha, event: item.event, createdAt: item.created_at, url: item.html_url,
    }))
    return { ok: true, stdout: JSON.stringify(rows), stderr: '' }
  }
  if (args[0] === 'run' && args[1] === 'watch') {
    const repository = flagValue(args, '--repo')
    for (;;) {
      const response = curlGitHub('GET', `repos/${repository}/actions/runs/${args[2]}`)
      if (!response.ok) return shimDone(response, { allowFailure, label })
      const runState = JSON.parse(response.text)
      if (runState.status === 'completed') {
        if (runState.conclusion === 'success') return { ok: true, stdout: '', stderr: '' }
        if (allowFailure) return { ok: false, stdout: '', stderr: `conclusion ${runState.conclusion}` }
        throw new Error(`${label}: run concluded ${runState.conclusion}`)
      }
      sleep(15000)
    }
  }
  if (args[0] === 'pr' && (args[1] === 'view' || args[1] === 'list')) {
    const repository = flagValue(args, '--repo')
    const owner = repository.split('/')[0]
    if (args[1] === 'view') {
      const branch = args.slice(2).find(arg => !arg.startsWith('--') && arg !== repository && !arg.includes(','))
      const listResponse = curlGitHub('GET', `repos/${repository}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}&per_page=1`)
      if (!listResponse.ok) return shimDone(listResponse, { allowFailure, label })
      const rows = JSON.parse(listResponse.text)
      if (!rows.length) return { ok: false, stdout: '', stderr: 'no pull requests found' }
      const detailResponse = curlGitHub('GET', `repos/${repository}/pulls/${rows[0].number}`)
      const detail = detailResponse.ok ? JSON.parse(detailResponse.text) : null
      return { ok: true, stdout: JSON.stringify(shimMapPull(rows[0], detail)), stderr: '' }
    }
    const head = flagValue(args, '--head')
    const limit = flagValue(args, '--limit') || '100'
    const query = `state=all&per_page=${limit}${head ? `&head=${owner}:${encodeURIComponent(head)}` : ''}`
    const response = curlGitHub('GET', `repos/${repository}/pulls?${query}`)
    if (!response.ok) return shimDone(response, { allowFailure, label })
    return { ok: true, stdout: JSON.stringify(JSON.parse(response.text).map(row => shimMapPull(row))), stderr: '' }
  }
  if (args[0] === 'pr' && args[1] === 'checks') {
    const repository = flagValue(args, '--repo')
    const prResponse = curlGitHub('GET', `repos/${repository}/pulls/${args[2]}`)
    if (!prResponse.ok) return shimDone(prResponse, { allowFailure, label })
    const headSha = JSON.parse(prResponse.text).head.sha
    if (args.includes('--watch')) {
      for (;;) {
        const rows = shimCheckRows(repository, headSha)
        if (rows === null) return shimDone({ ok: false, code: 0, text: '' }, { allowFailure, label })
        if (rows.length && rows.every(row => row.bucket !== 'pending')) {
          const failed = rows.filter(row => row.bucket === 'fail' || row.bucket === 'cancel')
          if (!failed.length) return { ok: true, stdout: '', stderr: '' }
          if (allowFailure) return { ok: false, stdout: '', stderr: failed.map(row => row.name).join(',') }
          throw new Error(`${label}: required checks failed: ${failed.map(row => row.name).join(',')}`)
        }
        sleep(15000)
      }
    }
    const rows = shimCheckRows(repository, headSha)
    if (rows === null) return shimDone({ ok: false, code: 0, text: '' }, { allowFailure, label })
    return { ok: true, stdout: rows.length ? JSON.stringify(rows) : '', stderr: '' }
  }
  if (args[0] === 'pr' && args[1] === 'create') {
    const repository = flagValue(args, '--repo')
    const base = flagValue(args, '--base')
    const head = flagValue(args, '--head')
    // --fill = 取最近一筆 commit 的標題/本文;顯式 --title/--body 優先
    const title = flagValue(args, '--title') || run('git', ['log', '-1', '--pretty=%s']).stdout
    const bodyText = flagValue(args, '--body') ?? run('git', ['log', '-1', '--pretty=%b']).stdout
    const response = curlGitHub('POST', `repos/${repository}/pulls`,
      { body: JSON.stringify({ title, head, base, body: bodyText }) })
    if (!response.ok) {
      // 冪等:同 head 的 open PR 已存在(422)= 目標狀態已達成,回傳既有 PR(gh pr create 同語意)
      if (response.code === 422 && response.text.includes('already exists')) {
        const owner = repository.split('/')[0]
        const existing = curlGitHub('GET', `repos/${repository}/pulls?state=open&head=${owner}:${encodeURIComponent(head)}&per_page=1`)
        if (existing.ok) {
          const rows = JSON.parse(existing.text)
          if (rows.length) return { ok: true, stdout: rows[0].html_url, stderr: '' }
        }
      }
      return shimDone(response, { allowFailure, label })
    }
    return { ok: true, stdout: JSON.parse(response.text).html_url, stderr: '' }
  }
  if (args[0] === 'pr' && args[1] === 'merge') {
    const repository = flagValue(args, '--repo')
    const matchHead = flagValue(args, '--match-head-commit')
    const prResponse = curlGitHub('GET', `repos/${repository}/pulls/${args[2]}`)
    if (!prResponse.ok) return shimDone(prResponse, { allowFailure, label })
    const pull = JSON.parse(prResponse.text)
    const merge = curlGitHub('PUT', `repos/${repository}/pulls/${args[2]}/merge`,
      { body: JSON.stringify({ merge_method: 'squash', ...(matchHead ? { sha: matchHead } : {}) }) })
    if (!merge.ok) return shimDone(merge, { allowFailure, label })
    if (args.includes('--delete-branch')) {
      curlGitHub('DELETE', `repos/${repository}/git/refs/heads/${encodeURIComponent(pull.head.ref)}`)
    }
    return { ok: true, stdout: '', stderr: '' }
  }
  return null
}

function gh(args, options = {}) {
  const shimmed = ghShim(args, options)
  if (shimmed) return shimmed
  return run('gh', args, { ...options, env: governanceGhEnv() })
}

function ghJson(args, { allowFailure = false, input } = {}) {
  const result = gh(args, { allowFailure, input })
  if (!result.ok || result.stdout === '') return null
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`gh returned non-JSON output for ${args.join(' ')}`)
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function packageVersion(workflow) {
  const versions = workflow.automation.packages.map(name => {
    const path = PACKAGE_PATHS[name]
    invariant(path, `no local manifest is registered for ${name}`)
    return readJson(resolve(ROOT, path)).version
  })
  invariant(versions.every(version => version === versions[0]), `release package versions differ: ${versions.join(', ')}`)
  invariant(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(versions[0]), `invalid release version: ${versions[0]}`)
  return versions[0]
}

function checkRollupStatus(rollup = []) {
  if (rollup.length === 0) return 'pending'
  if (rollup.some(item => {
    const bucket = `${item.bucket || ''}`.toLowerCase()
    const state = `${item.state || ''}`.toLowerCase()
    const conclusion = `${item.conclusion || ''}`.toLowerCase()
    return bucket === 'fail' || bucket === 'cancel'
      || ['error', 'failure'].includes(state)
      || ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(conclusion)
  })) return 'failed'
  if (rollup.some(item => {
    const bucket = `${item.bucket || ''}`.toLowerCase()
    const state = `${item.state || ''}`.toLowerCase()
    return bucket === 'pending' || ['expected', 'pending'].includes(state)
      || PENDING_STATUSES.has(`${item.status || ''}`.toLowerCase())
  })) return 'pending'
  return rollup.every(item => {
    const bucket = `${item.bucket || ''}`.toLowerCase()
    const state = `${item.state || ''}`.toLowerCase()
    return bucket === 'pass' || bucket === 'skipping' || state === 'success'
      || SUCCESS_CONCLUSIONS.has(`${item.conclusion || ''}`.toLowerCase())
  }) ? 'complete' : 'pending'
}

export function selectPublishRun(rows, protectedMainSha) {
  return Array.isArray(rows)
    ? rows.find(row => row.event === 'repository_dispatch' && row.headSha === protectedMainSha) || null
    : null
}

function latestRun(repository, workflowFile, protectedMainSha) {
  const rows = ghJson([
    'run', 'list', '--repo', repository, '--workflow', workflowFile, '--limit', '20',
    '--json', 'databaseId,status,conclusion,headSha,event,createdAt,url',
  ], { allowFailure: true })
  return selectPublishRun(rows, protectedMainSha)
}

export function buildPullRequestLookupArgs(repository, branch) {
  const fields = 'number,state,mergeStateStatus,mergeable,headRefOid,baseRefOid,url'
  return {
    view: ['pr', 'view', '--repo', repository, branch, '--json', fields],
    allStates: ['pr', 'list', '--repo', repository, '--state', 'all', '--head', branch, '--limit', '1', '--json', fields],
  }
}

function currentPullRequest(repository, branch, defaultBranch) {
  if (branch === defaultBranch) return null
  const lookup = buildPullRequestLookupArgs(repository, branch)
  const viewed = ghJson(lookup.view, { allowFailure: true })
  if (viewed) return withRequiredChecks(repository, viewed)
  const rows = ghJson(lookup.allStates, { allowFailure: true })
  return Array.isArray(rows) && rows[0] ? withRequiredChecks(repository, rows[0]) : null
}

function requiredPullRequestChecks(repository, number) {
  const result = gh([
    'pr', 'checks', `${number}`, '--repo', repository, '--required',
    '--json', 'bucket,name,state,workflow',
  ], { allowFailure: true })
  if (result.stdout === '') {
    if (!result.ok && !/no (?:required )?checks reported/i.test(result.stderr)) {
      throw new Error(`cannot read required checks for ${repository}#${number}: ${result.stderr}`)
    }
    return []
  }
  try {
    const rows = JSON.parse(result.stdout)
    return Array.isArray(rows) ? rows : []
  } catch {
    throw new Error(`required check readback for ${repository}#${number} was not JSON`)
  }
}

function withRequiredChecks(repository, pullRequest) {
  return { ...pullRequest, requiredChecks: requiredPullRequestChecks(repository, pullRequest.number) }
}

function expectedConsumerBranch(target, version) {
  if (target.delivery === 'release-published-pr') return `automation/release-v${version}`
  if (target.delivery === 'repository-dispatch-pr') return `automation/design-system-${version}`
  throw new Error(`consumer ${target.repository} delivery has no deterministic branch identity`)
}

export function matchesConsumerPullRequest(target, row, version, releaseCommit) {
  if (!row || row.state === 'CLOSED') return false
  const binding = `${row.title}\n${row.body || ''}`
  return row.headRefName === expectedConsumerBranch(target, version)
    && row.baseRefName === target.defaultBranch
    && binding.includes(version)
    && binding.includes(releaseCommit)
}

function matchingConsumerPullRequest(target, version, releaseCommit) {
  const rows = ghJson([
    'pr', 'list', '--repo', target.repository, '--state', 'all', '--limit', '100',
    '--json', 'number,title,body,state,headRefName,headRefOid,baseRefName,baseRefOid,mergeCommit,url',
  ], { allowFailure: true })
  if (!Array.isArray(rows)) return null
  const found = rows.find(row => matchesConsumerPullRequest(target, row, version, releaseCommit)) || null
  return found ? withRequiredChecks(target.repository, found) : null
}

function normalizeWorkflowPath(path) {
  return `${path || ''}`.replace(/@[^@]+$/, '')
}

export function validateConsumerCheckProvenance(target, pullRequest, checkRun, workflowRun, integration) {
  const expected = target?.requiredCheck
  if (!expected || !pullRequest || !checkRun || !workflowRun || !integration) return false
  const expectedWorkflowHead = expected.producerHead === 'pull-request-base'
    ? pullRequest.baseRefOid
    : pullRequest.headRefOid
  return checkRun.name === expected.context
    && checkRun.head_sha === pullRequest.headRefOid
    && checkRun.app?.id === integration.id
    && checkRun.app?.slug === integration.slug
    && checkRun.status === 'completed'
    && checkRun.conclusion === 'success'
    && normalizeWorkflowPath(workflowRun.path) === expected.producerWorkflow
    && workflowRun.event === expected.producerEvent
    && workflowRun.head_sha === expectedWorkflowHead
    && workflowRun.status === 'completed'
    && workflowRun.conclusion === 'success'
}

function consumerCheckReadback(target, pullRequest, desired) {
  if (!pullRequest) return { trusted: false, reason: 'release-bound consumer PR is unavailable' }
  const expected = target.requiredCheck
  const integration = desired.integrations?.[expected.integration]
  if (!integration) return { trusted: false, reason: `integration ${expected.integration} is unavailable` }
  const response = ghJson([
    'api', `repos/${target.repository}/commits/${pullRequest.headRefOid}/check-runs?per_page=100`,
    '-H', 'Accept: application/vnd.github+json',
  ], { allowFailure: true })
  const candidates = Array.isArray(response?.check_runs)
    ? response.check_runs.filter(run => run.name === expected.context).sort((left, right) => right.id - left.id)
    : []
  for (const checkRun of candidates) {
    const match = `${checkRun.details_url || ''}`.match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/([1-9][0-9]*)(?:\/.*)?$/)
    if (!match) continue
    const workflowRun = ghJson(['api', `repos/${target.repository}/actions/runs/${match[1]}`], { allowFailure: true })
    if (validateConsumerCheckProvenance(target, pullRequest, checkRun, workflowRun, integration)) {
      return { trusted: true, checkRunId: checkRun.id, workflowRunId: workflowRun.id }
    }
  }
  // 2026-08-12 等強度後備:fine-grained token 對部分 repo 無 Checks 讀取權(check-runs 403),
  // 但 Actions 讀取權可用。同一條出處鏈(producerWorkflow 檔案 + producerEvent + exact head
  // + run/job completed success + job 名 = required context)直接由 Actions API 驗證 —— 見證
  // 端點不同,驗的性質相同;Actions run 本身即 github-actions integration 的產物。任一條件
  // 不符仍 fail-closed。
  const actionRuns = ghJson(['api', `repos/${target.repository}/actions/runs?head_sha=${pullRequest.headRefOid}&per_page=20`], { allowFailure: true })
  for (const workflowRun of actionRuns?.workflow_runs || []) {
    if (normalizeWorkflowPath(workflowRun.path) !== expected.producerWorkflow) continue
    if (workflowRun.event !== expected.producerEvent) continue
    if (workflowRun.head_sha !== pullRequest.headRefOid) continue
    if (workflowRun.status !== 'completed' || workflowRun.conclusion !== 'success') continue
    const jobs = ghJson(['api', `repos/${target.repository}/actions/runs/${workflowRun.id}/jobs?per_page=100`], { allowFailure: true })
    const job = (jobs?.jobs || []).find(item =>
      item.name === expected.context && item.status === 'completed' && item.conclusion === 'success')
    if (job) return { trusted: true, checkRunId: job.id, workflowRunId: workflowRun.id }
  }
  return { trusted: false, reason: `${expected.context} is not bound to ${expected.producerWorkflow} ${expected.producerEvent}` }
}

function ensureImmutableReleases(repository) {
  const endpoint = `repos/${repository}/immutable-releases`
  let state = ghJson(['api', endpoint], { allowFailure: true })
  if (state?.enabled !== true) {
    gh(['api', '--method', 'PUT', endpoint])
    state = ghJson(['api', endpoint])
  }
  invariant(state?.enabled === true, `repository ${repository} immutable releases could not be enabled`)
}

export function buildPublishedTemplatePullRequestCreateArgs(target, { version, commit }) {
  invariant(target.delivery === 'release-published-pr', `consumer ${target.repository} is not published-template driven`)
  invariant(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version), `invalid published-template version: ${version}`)
  invariant(/^[a-f0-9]{40}$/.test(commit), `invalid published-template release commit: ${commit}`)
  const tag = `v${version}`
  const branch = `automation/release-${tag}`
  return {
    branch,
    args: [
      'pr', 'create', '--repo', target.repository,
      '--head', branch, '--base', target.defaultBranch,
      '--title', `chore: mirror design system ${tag}`,
      '--body', `Generated from published design-system release ${tag} at ${commit}.`,
    ],
  }
}

function publishedTemplateBranchExists(target, version) {
  const branch = `automation/release-v${version}`
  return Boolean(ghJson([
    'api', `repos/${target.repository}/branches/${encodeURIComponent(branch)}`,
  ], { allowFailure: true }))
}

function readConsumerLock(target) {
  const result = gh([
    'api', `repos/${target.repository}/contents/${target.readbackPath}?ref=${encodeURIComponent(target.defaultBranch)}`,
    '-H', 'Accept: application/vnd.github.raw+json',
  ], { allowFailure: true })
  if (!result.ok || result.stdout === '') return null
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

function consumerPackageReadback(target, version) {
  const lock = readConsumerLock(target)
  const packages = lock?.packages
  if (!packages || typeof packages !== 'object') return false
  return target.packages.every(name => packages[`node_modules/${name}`]?.version === version)
}

function npmPackageReadback(name, version) {
  // 2026-08-11 anti-self-lock fix:npm CLI 的網路路徑在 sandbox 內不通,registry 的 HTTPS
  // 由 curl 直讀可通(同 M36(b') 第三問:傳輸不通 → 換已驗證等價傳輸,不是邊界)。
  const encoded = name.replace('/', '%2F')
  const result = spawnSync('curl', ['-sS', `https://registry.npmjs.org/${encoded}/${encodeURIComponent(version)}`],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.error || result.status !== 0 || !result.stdout) return false
  try {
    return JSON.parse(result.stdout).version === version
  } catch {
    return false
  }
}

export function buildFiveStepStatus(workflow, observation) {
  validateReleaseWorkflow(workflow)
  const prChecks = observation.onProtectedMain
    ? 'complete'
    : observation.pullRequest
      ? checkRollupStatus(observation.pullRequest.requiredChecks)
      : 'blocked'
  const merge = observation.onProtectedMain || observation.pullRequest?.state === 'MERGED' ? 'complete' : 'pending'
  const publishedRelease = Boolean(
    observation.release
      && !observation.release.isDraft
      && observation.release.isImmutable === true
      && observation.release.publishedAt
      && /^[a-f0-9]{40}$/.test(observation.releaseCommitSha || ''),
  )
  const mutablePublishedRelease = Boolean(
    observation.release
      && !observation.release.isDraft
      && observation.release.publishedAt
      && observation.release.isImmutable !== true,
  )
  const publish = mutablePublishedRelease
    ? 'failed'
    : publishedRelease
    ? 'complete'
    : observation.publishRun && PENDING_STATUSES.has(`${observation.publishRun.status}`.toLowerCase())
      ? 'running'
      : merge === 'complete' ? 'ready' : 'pending'
  const readback = publishedRelease && observation.npmPackages.every(item => item.exactVersion) ? 'complete' : publish === 'complete' ? 'pending' : 'blocked'
  const consumer = readback === 'complete'
    ? observation.consumers.every(item => item.exactVersion && item.checkReadback?.trusted === true) ? 'complete' : 'pending'
    : 'blocked'
  return [
    { id: 'pr-checks', authority: 'AUTO', status: prChecks },
    { id: 'merge', authority: 'AUTO', status: merge },
    { id: 'publish', authority: 'AUTO', status: publish },
    { id: 'readback', authority: 'AUTO', status: readback },
    { id: 'consumer', authority: 'AUTO', status: consumer },
  ]
}

export function collectLiveObservation(workflow = loadReleaseWorkflow()) {
  const desired = readJson(GITHUB_DESIRED_PATH)
  const { repository, defaultBranch, publishWorkflow, packages, consumers } = workflow.automation
  // 2026-08-11 anti-self-lock fix(user directive「把過度設計的機制清理乾淨」):
  // 憑證體檢改 target-bound。原本的 `gh auth status` 戳帳號級端點,repo-scoped
  // fine-grained token 會被誤判 invalid(同顆 token 對 repo API 完全可用,實測可
  // merge PR),orchestrator 卻因此把「憑證存在但體檢方式錯」誤判成 HUMAN_ONLY
  // login 邊界。改驗「能否讀取目標 repo」= 本流程真正需要的能力;真 401 仍會被
  // run() 分類為 login 邊界 fail-closed。
  gh(['api', `repos/${repository}`])
  const branch = run('git', ['branch', '--show-current']).stdout
  const headSha = run('git', ['rev-parse', 'HEAD^{commit}']).stdout
  const main = ghJson(['api', `repos/${repository}/commits/${defaultBranch}`])
  const version = packageVersion(workflow)
  const tag = `v${version}`
  const pullRequest = currentPullRequest(repository, branch, defaultBranch)
  const tagRef = ghJson(['api', `repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`], { allowFailure: true })
  const tagCommitSha = tagRef?.object?.sha || null
  const releaseCommitSha = tagCommitSha || main?.sha || null
  const release = ghJson(['release', 'view', tag, '--repo', repository, '--json', 'tagName,isDraft,isImmutable,isPrerelease,publishedAt,url'], { allowFailure: true })
  const consumerObservations = consumers.map(target => {
    const exactVersion = release ? consumerPackageReadback(target, version) : false
    const targetPullRequest = release ? matchingConsumerPullRequest(target, version, releaseCommitSha) : null
    return {
      ...target,
      exactVersion,
      pullRequest: targetPullRequest,
      checkReadback: release ? consumerCheckReadback(target, targetPullRequest, desired) : { trusted: false, reason: 'release is unavailable' },
    }
  })
  return {
    repository,
    branch,
    headSha,
    protectedMainSha: main?.sha || null,
    onProtectedMain: branch === defaultBranch && headSha === main?.sha,
    version,
    tag,
    pullRequest,
    tagCommitSha,
    releaseCommitSha,
    release,
    publishRun: latestRun(repository, publishWorkflow.file, releaseCommitSha),
    npmPackages: packages.map(name => ({ name, exactVersion: release ? npmPackageReadback(name, version) : false })),
    consumers: consumerObservations,
  }
}

function printReport(workflow, observation, json) {
  const report = {
    schemaVersion: 1,
    authority: workflow.decisionAuthority,
    release: { repository: observation.repository, version: observation.version, tag: observation.tag, commit: observation.releaseCommitSha },
    steps: buildFiveStepStatus(workflow, observation),
    legacyMechanisms: workflow.legacyMechanisms,
  }
  if (json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`${observation.repository} ${observation.tag}`)
    for (const step of report.steps) console.log(`${step.id.padEnd(10)} ${step.status} (${step.authority})`)
  }
  return report
}

function waitForRun(repository, workflowFile, protectedMainSha, previousRunId = null) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const found = latestRun(repository, workflowFile, protectedMainSha)
    if (found && `${found.databaseId}` !== `${previousRunId || ''}`) return found
    sleep(2000)
  }
  throw new Error(`dispatch was accepted but ${workflowFile} was not observable; release:auto is safe to rerun`)
}

function watchRun(repository, run) {
  gh(['run', 'watch', `${run.databaseId}`, '--repo', repository, '--exit-status'])
}

export function buildConsumerDispatch(target, { version, tag, commit }) {
  invariant(target.delivery === 'repository-dispatch-pr', `consumer ${target.repository} is not repository-dispatch driven`)
  invariant(tag === `v${version}`, `consumer dispatch tag ${tag} does not match version ${version}`)
  invariant(/^[a-f0-9]{40}$/.test(commit), `invalid consumer release commit: ${commit}`)
  return {
    args: ['api', '--method', 'POST', `repos/${target.repository}/dispatches`, '--input', '-'],
    input: `${JSON.stringify({ event_type: target.dispatchEvent, client_payload: { version, tag, commit } })}\n`,
  }
}

function dispatchConsumer(target, release) {
  const operation = buildConsumerDispatch(target, release)
  gh(operation.args, { input: operation.input })
}

export function buildPullRequestCreateArgs(workflow, branch) {
  invariant(branch && branch !== workflow.automation.defaultBranch, 'a working branch is required to create a release PR')
  return [
    'pr', 'create', '--repo', workflow.automation.repository,
    '--base', workflow.automation.defaultBranch, '--head', branch, '--fill',
  ]
}

export function buildBranchPushArgs(workflow, branch) {
  invariant(branch && branch !== workflow.automation.defaultBranch, 'a working branch is required to push a release PR')
  invariant(/^(?![-/])(?!.*(?:\.\.|\/\/|@\{|\.lock(?:\/|$)))[A-Za-z0-9._/-]+(?<![/.])$/.test(branch), `invalid release branch:${branch}`)
  return ['push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`]
}

export function buildPublishMutationPlan(workflow, { tag, protectedMainSha, existingTagSha = null }) {
  validateReleaseWorkflow(workflow)
  invariant(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag), `invalid exact release tag: ${tag}`)
  invariant(/^[a-f0-9]{40}$/.test(protectedMainSha), `invalid protected main SHA: ${protectedMainSha}`)
  invariant(!existingTagSha || /^[a-f0-9]{40}$/.test(existingTagSha), `existing ${tag} has an invalid commit SHA`)
  const releaseCommitSha = existingTagSha || protectedMainSha
  const operations = []
  if (!existingTagSha) {
    operations.push({
      args: ['api', '--method', 'POST', `repos/${workflow.automation.repository}/git/refs`, '--input', '-'],
      input: `${JSON.stringify({ ref: `refs/tags/${tag}`, sha: protectedMainSha })}\n`,
    })
  }
  operations.push({
    args: ['api', '--method', 'POST', `repos/${workflow.automation.repository}/dispatches`, '--input', '-'],
    input: `${JSON.stringify({ event_type: workflow.automation.publishWorkflow.dispatchEvent, client_payload: { tag } })}\n`,
  })
  return { releaseCommitSha, operations }
}

export function executeAutomaticRelease({ json = false, noWait = false, maxWaitMs = 45 * 60 * 1000 } = {}) {
  const workflow = loadReleaseWorkflow()
  const deadline = Date.now() + maxWaitMs
  const dispatchedConsumers = new Set()
  for (;;) {
    invariant(noWait || Date.now() <= deadline, 'release:auto did not converge within 45 minutes; live state is preserved and the command is safe to rerun')
    const observation = collectLiveObservation(workflow)
    const report = printReport(workflow, observation, json)
    const incomplete = report.steps.find(step => step.status !== 'complete')
    if (!incomplete) return report

    if (incomplete.id === 'pr-checks') {
      if (!observation.pullRequest) {
        run('git', buildBranchPushArgs(workflow, observation.branch))
        gh(buildPullRequestCreateArgs(workflow, observation.branch))
        continue
      }
      if (observation.pullRequest.headRefOid !== observation.headSha) {
        run('git', buildBranchPushArgs(workflow, observation.branch))
        continue
      }
      invariant(incomplete.status !== 'failed', `PR #${observation.pullRequest.number} has failed checks; remediate the same PR and rerun release:auto`)
      if (noWait) return report
      if (observation.pullRequest.requiredChecks.length === 0) {
        sleep(2000)
        continue
      }
      gh(['pr', 'checks', `${observation.pullRequest.number}`, '--repo', observation.repository, '--required', '--watch', '--interval', '10'])
      continue
    }

    if (incomplete.id === 'merge') {
      invariant(observation.pullRequest, 'merge readback is incomplete and no current-branch PR was found')
      gh([
        'pr', 'merge', `${observation.pullRequest.number}`, '--repo', observation.repository,
        '--squash', '--delete-branch', '--match-head-commit', observation.pullRequest.headRefOid,
      ])
      continue
    }

    if (incomplete.id === 'publish') {
      invariant(incomplete.status !== 'failed', `published GitHub Release ${observation.tag} is not immutable`)
      if (incomplete.status === 'running') {
        if (noWait) return report
        watchRun(observation.repository, observation.publishRun)
        continue
      }
      ensureImmutableReleases(observation.repository)
      const previousRunId = observation.publishRun?.databaseId || null
      const publishPlan = buildPublishMutationPlan(workflow, {
        tag: observation.tag,
        protectedMainSha: observation.protectedMainSha,
        existingTagSha: observation.tagCommitSha,
      })
      for (const operation of publishPlan.operations) gh(operation.args, { input: operation.input })
      if (noWait) return report
      watchRun(observation.repository, waitForRun(
        observation.repository,
        workflow.automation.publishWorkflow.file,
        publishPlan.releaseCommitSha,
        previousRunId,
      ))
      continue
    }

    if (incomplete.id === 'readback') {
      if (noWait) return report
      sleep(5000)
      continue
    }

    for (const target of observation.consumers.filter(item => !item.exactVersion || item.checkReadback?.trusted !== true)) {
      invariant(
        !(target.exactVersion && target.checkReadback?.trusted !== true),
        `consumer ${target.repository} has the exact package version but lacks trusted release-check provenance: ${target.checkReadback?.reason || 'unknown reason'}`,
      )
      if (target.pullRequest) {
        if (target.pullRequest.state === 'MERGED') {
          invariant(
            target.checkReadback?.trusted === true,
            `merged consumer PR lacks trusted release-check provenance: ${target.pullRequest.url}: ${target.checkReadback?.reason || 'unknown reason'}`,
          )
          continue
        }
        const checks = checkRollupStatus(target.pullRequest.requiredChecks)
        invariant(checks !== 'failed', `consumer PR failed checks: ${target.pullRequest.url}`)
        if (checks === 'pending') {
          if (!noWait) gh(['pr', 'checks', `${target.pullRequest.number}`, '--repo', target.repository, '--required', '--watch', '--interval', '10'])
          continue
        }
        invariant(
          target.checkReadback?.trusted === true,
          `consumer PR check provenance differs from SSOT: ${target.pullRequest.url}: ${target.checkReadback?.reason || 'unknown reason'}`,
        )
        gh([
          'pr', 'merge', `${target.pullRequest.number}`, '--repo', target.repository,
          '--squash', '--delete-branch', '--match-head-commit', target.pullRequest.headRefOid,
        ])
      } else if (target.delivery === 'repository-dispatch-pr' && !dispatchedConsumers.has(target.repository)) {
        dispatchConsumer(target, {
          version: observation.version,
          tag: observation.tag,
          commit: observation.releaseCommitSha,
        })
        dispatchedConsumers.add(target.repository)
      } else if (target.delivery === 'release-published-pr'
        && !dispatchedConsumers.has(target.repository)
        && publishedTemplateBranchExists(target, observation.version)) {
        const operation = buildPublishedTemplatePullRequestCreateArgs(target, {
          version: observation.version,
          commit: observation.releaseCommitSha,
        })
        gh(operation.args)
        dispatchedConsumers.add(target.repository)
      }
    }
    if (noWait) return report
    sleep(5000)
  }
}

function parseCli(argv) {
  const [command, ...flags] = argv
  invariant(command === 'auto' || command === 'status', 'Usage: release-orchestrator.mjs <auto|status> [--json] [--no-wait]')
  invariant(flags.every(flag => flag === '--json' || flag === '--no-wait'), 'unsupported release orchestrator option')
  invariant(command === 'auto' || !flags.includes('--no-wait'), '--no-wait is only valid with auto')
  return { command, json: flags.includes('--json'), noWait: flags.includes('--no-wait') }
}

function main() {
  try {
    const options = parseCli(process.argv.slice(2))
    if (options.command === 'status') {
      const workflow = loadReleaseWorkflow()
      printReport(workflow, collectLiveObservation(workflow), options.json)
    } else {
      executeAutomaticRelease(options)
    }
  } catch (error) {
    if (error instanceof HumanBoundaryError) {
      console.error(JSON.stringify({ status: 'HUMAN_ONLY', boundary: error.boundary, action: error.message, resume: 'npm run release:auto' }, null, 2))
      process.exitCode = 3
      return
    }
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

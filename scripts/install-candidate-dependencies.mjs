#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { lstatSync, realpathSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import {
  assertClosedProjectNpmConfig,
  assertNoRootNpmShrinkwrap,
  createIsolatedGovernanceNpmEnvironment,
  GOVERNANCE_AUDIT_TRANSIENT_BACKOFF_MS,
  GOVERNANCE_AUDIT_TRANSIENT_RETRY_LIMIT,
  GOVERNANCE_CLOSED_PROJECT_NPM_CONFIG_LINES,
  isTransientAdvisoryEndpointFailure,
} from './lib/governance-dependency-bootstrap.mjs'
import {
  assertVerifiedExactNpmRuntimeCapability,
  prepareVerifiedExactNpmRuntime,
  resolveExactNpmRuntimeContract,
} from './lib/verified-exact-npm-runtime.mjs'
import {
  assertGitVisibleWorktreeUnchanged,
  captureGitVisibleWorktree,
} from './lib/worktree-fingerprint.mjs'

const TRUSTED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = 'https://registry.npmjs.org/'

function invariant(condition, message) {
  if (!condition) throw new Error(`GOV-CANDIDATE-DEPS-001:${message}`)
}

function inside(parent, child) {
  return child !== parent && child.startsWith(`${parent}${sep}`)
}

function runNpm(cli, args, { candidate, environment, runner }) {
  const result = runner(process.execPath, [cli, ...args], {
    cwd: candidate,
    env: {
      ...environment,
      NPM_CONFIG_REGISTRY: REGISTRY,
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      NPM_CONFIG_STRICT_SSL: 'true',
    },
    shell: false,
    stdio: 'inherit',
    timeout: 30 * 60 * 1_000,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(Number.isInteger(result?.status) && result.status === 0, `verified npm ${args.join(' ')} failed with exit ${String(result?.status)}`)
}

// ── 差集式弱點稽核(2026-09-29,待辦總帳 OE6)────────────────────────────────────────────────
//
// 原本這裡對候選跑 enforce 稽核(exact-shape 認列;任何新 advisory 一律 fail closed)。那道判準的 owner 是 protected main
// 自己的 CI(lib/governance-dependency-bootstrap.mjs);放在 anchor 裡有一個結構性後果:anchor 執行的是 **base 的**腳本,
// base 不可能認得之後才登記的 advisory —— 上游 2026-09-28 對 npm 內建 ip-address / undici 發新通報那天,每個 PR 的 anchor 都紅,
// 連「把新形狀認列進 bootstrap」的修復 PR 也被 anchor 擋住(它的候選樹跟 main 一模一樣,只是 base 的 exact-shape 不認得)。
// anchor 要回答的問題只有一個:**候選相對 protected main 有沒有新增弱點**。所以改成兩棵樹各跑一次同樣的 `npm audit --json`
// (同一時刻、同一份 advisory 資料庫、同一個 verified npm),取差集:
//   · 候選有、base 沒有的(套件 × advisory)→ 擋(GOV-CANDIDATE-DEPS-002,逐筆點名 advisory URL);
//   · 兩邊都有的 → 繼承自 main,印出、進 receipt、不擋(main 的既有狀態由 main 自己的 CI 與 OE15 認列 / overlay 負責);
//   · base 有、候選沒有的 → 修好了,印出。
// **任一邊的稽核結果不是合格的報告(非 JSON / advisory 端點錯誤 / schema 不對 / 退出碼不是 0|1)→ 一律紅**:
// base 壞掉不得讀成「base 沒有弱點」(那會把候選的每一筆都判成新增),也不得讀成略過(M37)。
// 差集只用本檔(base 的腳本)算;候選程式碼一行都不執行(它只是被 audit 的資料)。
const AUDIT_ARGS = Object.freeze(['audit', '--audit-level=high', '--json', `--registry=${REGISTRY}`])
const DIFF_PREFIX = 'GOV-CANDIDATE-DEPS-002'

/** 純函式:`npm audit --json`(auditReportVersion 2)→ Map<套件, {severity, range, advisories:Set<advisory URL 或 source>}>。 */
export function parseAuditFindings(stdout, label = 'candidate') {
  let report
  try { report = JSON.parse(String(stdout || '')) } catch {
    throw new Error(`${DIFF_PREFIX}:${label} npm audit did not produce JSON`)
  }
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error(`${DIFF_PREFIX}:${label} npm audit did not produce a JSON object`)
  if (report.auditReportVersion === undefined) {
    // registry 的 advisory 服務掛掉時吐的是錯誤物件(parse 得過、沒有 auditReportVersion);訊息形狀對齊 bootstrap,
    // 讓 isTransientAdvisoryEndpointFailure 認得出「暫時性網路錯誤」而重試。
    const summary = typeof report.message === 'string'
      ? `advisory endpoint failed:${report.message.slice(0, 200)}`
      : `unrecognised audit payload(keys:${Object.keys(report).slice(0, 12).join(',') || '<none>'})`
    throw new Error(`${DIFF_PREFIX}:${label} npm audit ${summary}`)
  }
  if (report.auditReportVersion !== 2 || !report.vulnerabilities || typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities)) {
    throw new Error(`${DIFF_PREFIX}:${label} npm audit JSON schema is unsupported`)
  }
  const findings = new Map()
  for (const [name, finding] of Object.entries(report.vulnerabilities)) {
    if (!finding || typeof finding !== 'object' || finding.name !== name || !Array.isArray(finding.via)) {
      throw new Error(`${DIFF_PREFIX}:${label} npm audit finding is malformed:${name}`)
    }
    const advisories = new Set()
    for (const via of finding.via) {
      if (typeof via === 'string') continue // 經由別的套件傳染:那個套件自己有一筆,advisory 記在它那裡
      if (!via || typeof via !== 'object' || (!Number.isInteger(via.source) && typeof via.url !== 'string')) {
        throw new Error(`${DIFF_PREFIX}:${label} npm audit advisory is malformed:${name}`)
      }
      advisories.add(typeof via.url === 'string' && via.url ? via.url : `source:${via.source}`)
    }
    findings.set(name, { severity: String(finding.severity ?? 'unknown'), range: String(finding.range ?? ''), advisories })
  }
  return findings
}

/** 純函式:候選相對 base 的差集。只有 introduced 會擋。 */
export function diffAuditFindings(base, candidate) {
  const byName = (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
  const introduced = []
  const inherited = []
  for (const [name, finding] of candidate) {
    const baseline = base.get(name)
    const advisories = [...finding.advisories].sort()
    if (!baseline) {
      introduced.push({ name, severity: finding.severity, range: finding.range, advisories, reason: 'package-not-vulnerable-in-base' })
      continue
    }
    const fresh = advisories.filter((advisory) => !baseline.advisories.has(advisory))
    if (fresh.length) introduced.push({ name, severity: finding.severity, range: finding.range, advisories: fresh, reason: 'new-advisory' })
    else inherited.push({ name, severity: finding.severity, range: finding.range, advisories })
  }
  const resolved = [...base.keys()].filter((name) => !candidate.has(name)).sort()
  return Object.freeze({ introduced: introduced.sort(byName), inherited: inherited.sort(byName), resolved })
}

function runAuditJson(cli, root, { environment, runner, label, retryLimit, backoffMs, sleep, report }) {
  for (let attempt = 1; ; attempt += 1) {
    const result = runner(process.execPath, [cli, ...AUDIT_ARGS], {
      cwd: root,
      env: { ...environment, NPM_CONFIG_REGISTRY: REGISTRY, NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_STRICT_SSL: 'true' },
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30 * 60 * 1_000,
      windowsHide: true,
    })
    if (result?.error) throw result.error
    if (!Number.isInteger(result?.status) || (result.status !== 0 && result.status !== 1)) {
      throw new Error(`${DIFF_PREFIX}:${label} npm audit returned an invalid exit status:${String(result?.status)}`)
    }
    try {
      const findings = parseAuditFindings(result.stdout, label)
      return { findings, rawAuditSha256: createHash('sha256').update(Buffer.from(String(result.stdout || ''))).digest('hex') }
    } catch (error) {
      if (!isTransientAdvisoryEndpointFailure(error) || attempt >= retryLimit) throw error
      const wait = backoffMs * attempt
      report(`⚠️  ${DIFF_PREFIX}:${label} npm audit advisory endpoint transient failure(attempt ${attempt}/${retryLimit}),retrying in ${wait}ms`)
      sleep(wait)
    }
  }
}

const sleepSync = (ms) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }

export function runDifferentialVulnerabilityAudit({
  cli,
  trustedRoot,
  candidate,
  environment,
  runner = spawnSync,
  retryLimit = GOVERNANCE_AUDIT_TRANSIENT_RETRY_LIMIT,
  backoffMs = GOVERNANCE_AUDIT_TRANSIENT_BACKOFF_MS,
  sleep = sleepSync,
  report = (line) => console.error(line),
} = {}) {
  const common = { environment, runner, retryLimit, backoffMs, sleep, report }
  const base = runAuditJson(cli, trustedRoot, { ...common, label: 'protected-base' })
  const head = runAuditJson(cli, candidate, { ...common, label: 'candidate' })
  const diff = diffAuditFindings(base.findings, head.findings)
  for (const item of diff.inherited) report(`·  繼承自 protected main(不擋;owner 是 main 自己的 CI):${item.name} ${item.severity} ${item.range} ← ${item.advisories.join(', ')}`)
  for (const name of diff.resolved) report(`·  候選已修掉:${name}`)
  if (diff.introduced.length) {
    const lines = diff.introduced.map((item) => `${item.name} ${item.severity} ${item.range}(${item.reason})← ${item.advisories.join(', ') || '(經由其他套件)'}`)
    throw new Error(`${DIFF_PREFIX}:candidate introduces ${diff.introduced.length} vulnerability finding(s) that protected main does not have:\n  ${lines.join('\n  ')}`)
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'candidate-differential-vulnerability-audit-receipt',
    status: 'passed',
    policy: 'block-only-findings-introduced-relative-to-protected-base',
    base: Object.freeze({ root: trustedRoot, findings: base.findings.size, rawAuditSha256: base.rawAuditSha256 }),
    candidate: Object.freeze({ root: candidate, findings: head.findings.size, rawAuditSha256: head.rawAuditSha256 }),
    introduced: Object.freeze([]),
    inherited: Object.freeze(diff.inherited.map((item) => Object.freeze({ ...item, advisories: Object.freeze(item.advisories) }))),
    resolved: Object.freeze(diff.resolved),
  })
}

export async function installCandidateDependencies({
  trustedRoot: requestedTrustedRoot = TRUSTED_ROOT,
  workspaceRoot: requestedWorkspaceRoot = process.env.GITHUB_WORKSPACE,
  candidatePath,
  environment = process.env,
  runner = spawnSync,
  runtimeFactory = prepareVerifiedExactNpmRuntime,
} = {}) {
  invariant(typeof requestedWorkspaceRoot === 'string' && requestedWorkspaceRoot.length > 0, 'GITHUB_WORKSPACE is required')
  invariant(typeof candidatePath === 'string' && candidatePath.length > 0 && !candidatePath.includes('\0'), 'candidate path is required')
  const trustedRoot = realpathSync(resolve(requestedTrustedRoot))
  const workspaceRoot = realpathSync(resolve(requestedWorkspaceRoot))
  const candidateLexical = resolve(workspaceRoot, candidatePath)
  const candidateInfo = lstatSync(candidateLexical)
  const candidate = realpathSync(candidateLexical)
  invariant(candidateInfo.isDirectory() && !candidateInfo.isSymbolicLink() && candidate === candidateLexical, 'candidate must be a real directory with no symlink ancestry')
  invariant(inside(workspaceRoot, candidate), 'candidate escapes GITHUB_WORKSPACE')
  invariant(candidate !== trustedRoot, 'candidate must be distinct from trusted verifier source')
  assertNoRootNpmShrinkwrap(candidate, { errorPrefix: 'GOV-CANDIDATE-DEPS-001' })
  assertClosedProjectNpmConfig(
    candidate,
    GOVERNANCE_CLOSED_PROJECT_NPM_CONFIG_LINES,
    { errorPrefix: 'GOV-CANDIDATE-DEPS-001' },
  )

  const trustedBefore = captureGitVisibleWorktree(trustedRoot)
  const candidateBefore = captureGitVisibleWorktree(candidate)
  const expectedNpm = resolveExactNpmRuntimeContract(trustedRoot)
  const isolated = createIsolatedGovernanceNpmEnvironment(environment, {
    errorPrefix: 'GOV-CANDIDATE-DEPS-001',
  })
  let runtime = null
  let installedOverlayReceipt = null
  let auditReceipt = null
  try {
    runtime = await runtimeFactory({ repositoryRoot: trustedRoot, env: isolated.env, runner })
    try {
      assertVerifiedExactNpmRuntimeCapability(runtime, expectedNpm)
    } catch {
      invariant(false, `verified npm ${expectedNpm.version} capability with the exact security overlay is required`)
    }
    runNpm(runtime.cli, ['ci', '--legacy-peer-deps', '--ignore-scripts', `--registry=${REGISTRY}`], { candidate, environment: isolated.env, runner })
    runtime.applyInstalledSecurityOverlay(candidate)
    installedOverlayReceipt = runtime.verifyInstalledSecurityOverlay(candidate)
    assertClosedProjectNpmConfig(candidate, GOVERNANCE_CLOSED_PROJECT_NPM_CONFIG_LINES, { errorPrefix: 'GOV-CANDIDATE-DEPS-001' })
    assertGitVisibleWorktreeUnchanged(trustedRoot, trustedBefore, { label: 'trusted verifier after candidate install' })
    assertGitVisibleWorktreeUnchanged(candidate, candidateBefore, { label: 'candidate after dependency install' })
    runNpm(runtime.cli, ['audit', 'signatures', `--registry=${REGISTRY}`], { candidate, environment: isolated.env, runner })
    // 差集式弱點稽核(見檔頭「差集式弱點稽核」):base 與候選各跑一次同樣的 npm audit --json,只擋候選新增的。
    auditReceipt = runDifferentialVulnerabilityAudit({
      cli: runtime.cli,
      trustedRoot,
      candidate,
      environment: isolated.env,
      runner,
    })
    assertClosedProjectNpmConfig(candidate, GOVERNANCE_CLOSED_PROJECT_NPM_CONFIG_LINES, { errorPrefix: 'GOV-CANDIDATE-DEPS-001' })
    assertGitVisibleWorktreeUnchanged(trustedRoot, trustedBefore, { label: 'trusted verifier after candidate audit' })
    assertGitVisibleWorktreeUnchanged(candidate, candidateBefore, { label: 'candidate after dependency audit' })
    return {
      candidate,
      npm: runtime.toolchain.npm,
      securityOverlay: installedOverlayReceipt,
      vulnerabilityAudit: auditReceipt,
      status: 'passed',
    }
  } finally {
    try { runtime?.cleanup?.() } finally { isolated.cleanup() }
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2)
    invariant(args.length === 2 && args[0] === '--candidate', 'usage: install-candidate-dependencies.mjs --candidate <workspace-relative-path>')
    const result = await installCandidateDependencies({ candidatePath: args[1] })
    console.log(`✅ candidate dependencies verified with npm ${result.npm}`)
  } catch (error) {
    console.error(`❌ candidate dependency verification failed:${error.message}`)
    process.exit(1)
  }
}

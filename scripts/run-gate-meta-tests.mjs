#!/usr/bin/env node
/**
 * Execute gate mutation tests in a disposable repository snapshot, one declared lane at a time.
 *
 * The snapshot preserves HEAD, the caller index (including staged bytes),
 * current working-tree bytes/types/modes and untracked non-ignored artifacts.
 * Ignored data is never traversed or copied: Git's frozen tracked + untracked
 * non-ignored inventory is the only worktree read authority.
 * Installed dependencies are copied into the snapshot with copy-on-write when
 * the filesystem supports it (portable byte-copy fallback; never hard links).
 * Workspace-package symlinks consequently resolve back into snapshot packages,
 * never the caller. Every mutation, failed restore, or crashed child therefore
 * dies with the disposable repository. This is mutation detection and cleanup,
 * not an OS sandbox and not proof that external writes were contained.
 *
 * Lanes(2026-10-14,待辦總帳 SM2): 每支 meta-test 屬於 `infra/governance/providers/harness-source-inventory.json`
 * `pairedMeta.lanes` 裡恰好一個 lane(契約與驗證:scripts/lib/gate-meta-test-inventory.mjs)。harness 逐 lane 呼叫
 *   node scripts/run-gate-meta-tests.mjs --lane <id>
 * 每個 lane 一個快照、一個明文 lane 預算(含建快照 / build storybook / 收尾保留),每支一個明文單支預算。
 * 每支開始與結束(含用時)**當下**就印出;超過單支預算 → 終止那支的整個行程群組並點名;lane 預算用完 →
 * 點名當時在跑的那支與沒跑到的清單。harness 外層上限 = lane 預算 + 60 秒,所以外層砍殺不會比這裡的判定先到。
 * 不帶 --lane = 依序跑全部 lane(本機用)。
 *
 * 快照裡的 storybook-static 只有一個建置者:`storybook: "lane-build"` 的 lane 在跑任何成員前先 build
 * (build:lib + build-storybook),並宣告 GOVERNANCE_BROWSER_REQUIRED=1。`storybook: "absent"` 的 lane 保證沒有建置;
 * 在那裡印「缺 storybook-static」的 meta-test 是放錯 lane,判紅並指名(不再計成 pass 的略過)。
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createDisposableRepositorySnapshot,
  captureFrozenRepositoryManifest,
  diffRepositoryFingerprints,
  disposableSnapshotEnvironment,
  fingerprintCallerRepository,
  removeDisposableRepositorySnapshot,
  verifyDisposableSnapshotToolProfile,
} from './lib/disposable-repository-snapshot.mjs'
import {
  createGateMetaTestInventory,
  GATE_META_LANE_CLEANUP_RESERVE_MS,
  gateMetaLaneMemberBudgets,
  validateGateMetaLanes,
} from './lib/gate-meta-test-inventory.mjs'

export { createDisposableRepositorySnapshot, fingerprintCallerRepository }

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DEFAULT_ROOT = realpathSync(resolve(dirname(SCRIPT_PATH), '..'))
export const GATE_META_LANE_DOCUMENT = 'infra/governance/providers/harness-source-inventory.json'
// 「略過」只認包裝自己印的標記(lib/gate-selftest-meta.mjs 的「· 略過:」)。
const SKIP_LINE = /^· 略過:/u
const MISSING_STORYBOOK_SKIP = /^· 略過:.*缺 storybook-static/u
const STORYBOOK_HINT = /MISSING-BUILD|STALE-BUILD|storybook-static/u
const TAIL_BYTES = 64 * 1024
const KILL_GRACE_MS = 2_000
const STRAGGLER_REAP_MS = 100
const STORYBOOK_BUILD_STEPS = Object.freeze([
  ['library prerequisite', ['run', '--silent', 'build:lib']],
  ['Storybook', ['run', '--silent', 'build-storybook']],
])
const UTILIZATION_WARNING = 0.8

// CLI 收到 SIGTERM / SIGINT 時要知道「當下在跑誰」才能點名並收掉它的行程群組(各 member 是 detached 群組,
// 外層對 runner 群組送的訊號不會自己傳過去)。
const runtime = { child: null, snapshot: null, laneId: null, member: null, memberStartedAt: 0 }

function fail(message) {
  throw new Error(`gate meta-test snapshot blocked:${message}`)
}

export function collectGateMetaTestInventory(root, options = {}) {
  return createGateMetaTestInventory({ root, ...options })
}

export function collectGateMetaTests(root, options = {}) {
  return collectGateMetaTestInventory(root, options).runnable
}

export function formatDuration(ms) {
  const value = Math.max(0, Math.round(Number(ms) || 0))
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`
  const totalSeconds = Math.round(value / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`
    : `${minutes}m${String(seconds).padStart(2, '0')}s`
}

export function readGateMetaLaneDocument(root) {
  const path = join(root, GATE_META_LANE_DOCUMENT)
  let document
  try {
    document = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${GATE_META_LANE_DOCUMENT} is unreadable:${error.message}`)
  }
  return document?.pairedMeta
}

function selectLane(pairedMeta, laneId) {
  if (laneId === undefined || laneId === null) {
    if (pairedMeta.lanes.length !== 1) fail(`a lane id is required;declared lanes:${pairedMeta.lanes.map(lane => lane.id).join(', ')}`)
    return pairedMeta.lanes[0]
  }
  const lane = pairedMeta.lanes.find(candidate => candidate.id === laneId)
  if (!lane) fail(`unknown gate meta-test lane:${laneId};declared lanes:${pairedMeta.lanes.map(candidate => candidate.id).join(', ')}`)
  return lane
}

function killGroup(child, signal) {
  if (!child?.pid) return
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {}
  }
  try { child.kill(signal) } catch {}
}

function createOutputCollector() {
  const chunks = []
  let bytes = 0
  let carry = ''
  const skipLines = []
  const scan = (text, final = false) => {
    const lines = `${carry}${text}`.split('\n')
    carry = final ? '' : lines.pop()
    for (const line of lines) if (SKIP_LINE.test(line) && skipLines.length < 8) skipLines.push(line)
  }
  return {
    push(stream, chunk) {
      chunks.push(chunk)
      bytes += chunk.length
      while (bytes - chunks[0].length >= TAIL_BYTES) bytes -= chunks.shift().length
      if (stream === 'stdout') scan(chunk.toString('utf8'))
    },
    finish() {
      scan('', true)
      const text = Buffer.concat(chunks).toString('utf8')
      return { tail: text.length > TAIL_BYTES ? text.slice(-TAIL_BYTES) : text, skipLines }
    },
  }
}

/**
 * 跑一支子行程(獨立行程群組),在 timeoutMs 時終止整個群組(SIGTERM → KILL_GRACE_MS 後 SIGKILL);
 * 領頭行程結束後也收掉群組裡的殘留(Chromium、build worker),不讓它們抓著 pipe 讓這支「結束不了」。
 */
function runChild(command, args, { cwd, env, timeoutMs, member = null }) {
  return new Promise((complete) => {
    const started = Date.now()
    const output = createOutputCollector()
    let child
    try {
      child = spawn(command, args, {
        cwd,
        env,
        detached: process.platform !== 'win32',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      complete({ exitCode: null, signal: null, timedOut: false, launchError: error, durationMs: 0, tail: '', skipLines: [] })
      return
    }
    runtime.child = child
    runtime.member = member
    runtime.memberStartedAt = started
    let timedOut = false
    let launchError = null
    let escalate = null
    let reap = null
    child.stdout.on('data', chunk => output.push('stdout', chunk))
    child.stderr.on('data', chunk => output.push('stderr', chunk))
    child.once('error', (error) => { launchError = error })
    const timer = setTimeout(() => {
      timedOut = true
      killGroup(child, 'SIGTERM')
      escalate = setTimeout(() => killGroup(child, 'SIGKILL'), KILL_GRACE_MS)
    }, timeoutMs)
    child.once('exit', () => {
      killGroup(child, 'SIGTERM')
      reap = setTimeout(() => killGroup(child, 'SIGKILL'), STRAGGLER_REAP_MS)
    })
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer)
      if (escalate) clearTimeout(escalate)
      if (reap) clearTimeout(reap)
      killGroup(child, 'SIGKILL')
      runtime.child = null
      runtime.member = null
      complete({ exitCode, signal, timedOut, launchError, durationMs: Date.now() - started, ...output.finish() })
    })
  })
}

function tailLines(text, count) {
  return `${text ?? ''}`.trim().split('\n').slice(-count).join('\n')
}

function indent(text) {
  return text.split('\n').map(line => `       ${line}`).join('\n')
}

async function buildStorybookInSnapshot({ snapshot, environment, budgetMs, deadlineAt, log, prefix }) {
  const started = Date.now()
  const buildDeadline = Math.min(started + budgetMs, deadlineAt)
  for (const [label, args] of STORYBOOK_BUILD_STEPS) {
    const remaining = buildDeadline - Date.now()
    if (remaining < 1_000) {
      return { status: 'timed-out', durationMs: Date.now() - started, detail: `storybook build budget ${formatDuration(budgetMs)} exhausted before the ${label} step` }
    }
    log(`${prefix} ▶ build ${label}(npm ${args.join(' ')};剩餘建置預算 ${formatDuration(remaining)})`)
    const step = await runChild('npm', args, { cwd: snapshot.snapshotRoot, env: environment, timeoutMs: remaining, member: `build ${label}` })
    if (step.timedOut) {
      return { status: 'timed-out', durationMs: Date.now() - started, detail: `${label} build exceeded the lane storybook build budget ${formatDuration(budgetMs)}\n${tailLines(step.tail, 20)}` }
    }
    if (step.launchError || step.exitCode !== 0) {
      const reason = step.launchError?.message ?? `exit ${step.exitCode ?? step.signal}`
      return { status: 'failed', durationMs: Date.now() - started, detail: `${label} build failed(${reason})\n${tailLines(step.tail, 20)}` }
    }
    log(`${prefix} ✓ build ${label} ${formatDuration(step.durationMs)}`)
  }
  const missing = ['storybook-static/iframe.html', 'storybook-static/index.json']
    .filter(path => !existsSync(join(snapshot.snapshotRoot, path)))
  if (missing.length) {
    return { status: 'failed', durationMs: Date.now() - started, detail: `INSTRUMENT-FAIL:build exited 0 but did not produce ${missing.join(', ')}` }
  }
  return { status: 'passed', durationMs: Date.now() - started, detail: '' }
}

/**
 * 跑一個 lane。`lane` 省略時文件必須恰好只有一個 lane。
 * @returns {Promise<object>} lane 結果(pass / failed / notRun / timings / callerDrift / cleaned …)
 */
export async function runGateMetaTests({
  root = DEFAULT_ROOT,
  dependencyRoot = root,
  exclusionDocument,
  pairedMetaDocument,
  lane: laneId,
  log = line => console.log(line),
} = {}) {
  const started = Date.now()
  const callerRoot = realpathSync(resolve(root))
  const before = fingerprintCallerRepository(callerRoot)
  const manifest = captureFrozenRepositoryManifest(callerRoot)
  let snapshot
  let result
  try {
    snapshot = createDisposableRepositorySnapshot({ root: callerRoot, dependencyRoot, manifest })
    runtime.snapshot = snapshot
    const inventory = collectGateMetaTestInventory(snapshot.snapshotRoot, { exclusionDocument })
    const runnablePaths = inventory.runnable.map(({ file }) => `scripts/${file}`)
    const pairedMeta = pairedMetaDocument ?? readGateMetaLaneDocument(snapshot.snapshotRoot)
    try {
      validateGateMetaLanes(pairedMeta, { runnablePaths })
    } catch (error) {
      fail(`${error.message}(lane 宣告住 ${GATE_META_LANE_DOCUMENT} pairedMeta.lanes;改完跑 npm run governance:generate)`)
    }
    const lane = selectLane(pairedMeta, laneId)
    runtime.laneId = lane.id
    const deadlineAt = started + lane.totalTimeoutMs - GATE_META_LANE_CLEANUP_RESERVE_MS
    const environment = disposableSnapshotEnvironment(snapshot)
    if (lane.storybook === 'lane-build') environment.GOVERNANCE_BROWSER_REQUIRED = '1'
    else delete environment.GOVERNANCE_BROWSER_REQUIRED
    const members = gateMetaLaneMemberBudgets(lane)
    const prefix = `[gate-meta ${lane.id}]`
    log(`${prefix} lane 開始:${members.length} 支,storybook=${lane.storybook},單支預算預設 ${formatDuration(lane.memberTimeoutMs)}`
      + `(另 ${lane.memberTimeoutOverrides.length} 支明文另訂),lane 預算 ${formatDuration(lane.totalTimeoutMs)}`
      + `(含收尾保留 ${formatDuration(GATE_META_LANE_CLEANUP_RESERVE_MS)};建快照用了 ${formatDuration(Date.now() - started)})`)

    const timings = []
    const failed = []
    const skipped = []
    const notRun = []
    let pass = 0
    let laneDeadlineReached = false
    let storybookBuild = null
    if (lane.storybook === 'lane-build') {
      storybookBuild = await buildStorybookInSnapshot({
        snapshot,
        environment,
        budgetMs: lane.storybookBuildTimeoutMs,
        deadlineAt,
        log,
        prefix,
      })
      if (storybookBuild.status !== 'passed') {
        log(`${prefix} ✗ storybook build ${storybookBuild.status}(${formatDuration(storybookBuild.durationMs)};建置預算 ${formatDuration(lane.storybookBuildTimeoutMs)})`)
        if (storybookBuild.detail) log(indent(storybookBuild.detail))
        for (const { path } of members) notRun.push(path.replace(/^scripts\//, ''))
        log(`${prefix} ⛔ 沒有建置,這個 lane 的 ${notRun.length} 支一支都沒跑:${notRun.join(', ')}`)
      } else {
        log(`${prefix} ✓ storybook build 完成 ${formatDuration(storybookBuild.durationMs)}(建置預算 ${formatDuration(lane.storybookBuildTimeoutMs)})`)
      }
    }

    for (const [index, { path, budgetMs }] of members.entries()) {
      if (storybookBuild && storybookBuild.status !== 'passed') break
      const file = path.replace(/^scripts\//, '')
      const stem = file.replace(/^test-/, '').replace(/\.mjs$/, '')
      const position = `[gate-meta ${lane.id} ${index + 1}/${members.length}]`
      const remaining = deadlineAt - Date.now()
      if (remaining < 1_000) {
        laneDeadlineReached = true
        for (const rest of members.slice(index)) notRun.push(rest.path.replace(/^scripts\//, ''))
        log(`${prefix} ⛔ lane 預算 ${formatDuration(lane.totalTimeoutMs)} 用完,沒跑到 ${notRun.length} 支:${notRun.join(', ')}`)
        break
      }
      const timeoutMs = Math.min(budgetMs, remaining)
      const stopReason = timeoutMs < budgetMs ? 'lane-deadline' : 'member-budget'
      log(`${position} ▶ ${file}(單支預算 ${formatDuration(budgetMs)}${stopReason === 'lane-deadline' ? `;lane 只剩 ${formatDuration(remaining)}` : ''})`)
      verifyDisposableSnapshotToolProfile(snapshot)
      const child = await runChild(process.execPath, [join(snapshot.snapshotRoot, 'scripts', file)], {
        cwd: snapshot.snapshotRoot,
        env: environment,
        timeoutMs,
        member: file,
      })
      verifyDisposableSnapshotToolProfile(snapshot)
      const record = { stem, file, budgetMs, durationMs: child.durationMs }
      let status
      let message
      if (child.timedOut && stopReason === 'lane-deadline') {
        laneDeadlineReached = true
        status = 'lane-deadline'
        message = `${position} ⏱ ${file} 在 lane 預算用完時被終止:lane ${lane.id} 的 ${formatDuration(lane.totalTimeoutMs)} 在這支跑到 ${formatDuration(child.durationMs)} 時用完(單支預算 ${formatDuration(budgetMs)})`
      } else if (child.timedOut) {
        status = 'timed-out'
        message = `${position} ⏱ ${file} 超過單支預算 ${formatDuration(budgetMs)},已終止它的整個行程群組(用時 ${formatDuration(child.durationMs)})`
      } else if (child.launchError) {
        status = 'failed'
        message = `${position} ✗ ${file} 起不來:${child.launchError.message}`
      } else if (child.exitCode === 0 && lane.storybook === 'absent' && child.skipLines.some(line => MISSING_STORYBOOK_SKIP.test(line))) {
        status = 'misassigned'
        message = `${position} ✗ ${file} ${formatDuration(child.durationMs)} 放錯 lane:它需要 storybook-static,而 lane ${lane.id} 保證沒有建置 —— 把它宣告到 storybook: "lane-build" 的 lane(${GATE_META_LANE_DOCUMENT} pairedMeta.lanes)`
      } else if (child.exitCode === 0 && lane.storybook === 'lane-build' && child.skipLines.length) {
        status = 'skipped-in-browser-lane'
        message = `${position} ✗ ${file} ${formatDuration(child.durationMs)} 在已建置、必需瀏覽器的 lane 裡仍然「略過」—— 這次什麼都沒驗,不得算通過`
      } else if (child.exitCode === 0 && child.skipLines.length) {
        status = 'skipped'
        message = `${position} · ${file} ${formatDuration(child.durationMs)} 略過(計在 pass,但沒驗到東西):${child.skipLines[0]}`
      } else if (child.exitCode === 0) {
        status = 'passed'
        message = `${position} ✓ ${file} ${formatDuration(child.durationMs)}`
      } else {
        status = 'failed'
        message = `${position} ✗ ${file} ${formatDuration(child.durationMs)}(exit ${child.exitCode ?? child.signal ?? 'unknown'})`
          + (lane.storybook === 'absent' && STORYBOOK_HINT.test(child.tail) ? ` —— 輸出提到 storybook-static:若它需要建置,宣告到 lane-build 的 lane` : '')
      }
      record.status = status
      timings.push(record)
      log(message)
      if (status === 'passed' || status === 'skipped') {
        pass += 1
        if (status === 'skipped') skipped.push(stem)
        continue
      }
      const detail = tailLines(child.tail || child.launchError?.message || '', 12)
      if (detail) log(indent(detail))
      failed.push({
        stem,
        status,
        code: status === 'timed-out' || status === 'lane-deadline' ? status : (child.exitCode ?? child.signal ?? child.launchError?.code ?? 'unknown'),
        durationMs: child.durationMs,
        budgetMs,
        detail: tailLines(child.tail || child.launchError?.message || '', 8),
      })
      if (status === 'lane-deadline') {
        for (const rest of members.slice(index + 1)) notRun.push(rest.path.replace(/^scripts\//, ''))
        if (notRun.length) log(`${prefix} ⛔ lane 預算用完,沒跑到 ${notRun.length} 支:${notRun.join(', ')}`)
        break
      }
    }
    const durationMs = Date.now() - started
    const utilization = durationMs / lane.totalTimeoutMs
    log(`${prefix} lane 結束:通過 ${pass - skipped.length}、略過 ${skipped.length}、紅 ${failed.length}、沒跑到 ${notRun.length};`
      + `用時 ${formatDuration(durationMs)} / 預算 ${formatDuration(lane.totalTimeoutMs)}(${Math.round(utilization * 100)}%)`)
    if (utilization >= UTILIZATION_WARNING && !laneDeadlineReached) {
      log(`${prefix} ⚠️  已用掉 lane 預算的 ${Math.round(utilization * 100)}% —— 把幾支搬到別的 lane 或開新 lane(${GATE_META_LANE_DOCUMENT} pairedMeta.lanes),不要只把上限調大`)
    }
    result = {
      lane: {
        id: lane.id,
        storybook: lane.storybook,
        memberTimeoutMs: lane.memberTimeoutMs,
        totalTimeoutMs: lane.totalTimeoutMs,
        ...(lane.storybook === 'lane-build' ? { storybookBuildTimeoutMs: lane.storybookBuildTimeoutMs } : {}),
      },
      pass,
      total: members.length,
      discoverable: inventory.discoverable.length,
      ran: pass + failed.length,
      // 計在 pass 裡(exit 0),但單獨列出:「略過」不是「驗過」
      skipped,
      failed,
      notRun,
      timings,
      storybookBuild,
      laneDeadlineReached,
      durationMs,
      excluded: inventory.excluded.map(({ stem, executionClass }) => ({ stem, executionClass })),
      excludedByClass: Object.fromEntries(
        Object.entries(inventory.excludedByClass).map(([name, entries]) => [name, entries.map(({ stem }) => stem)]),
      ),
      snapshotRoot: snapshot.snapshotRoot,
      snapshotParent: snapshot.parent,
    }
  } finally {
    removeDisposableRepositorySnapshot(snapshot)
    runtime.snapshot = null
    runtime.laneId = null
  }
  const after = fingerprintCallerRepository(callerRoot)
  const callerDrift = diffRepositoryFingerprints(before, after)
  return { ...result, callerDrift, cleaned: snapshot ? !existsSync(snapshot.parent) : true }
}

function printResult(result) {
  const excluded = Object.entries(result.excludedByClass)
    .map(([name, stems]) => `${name}:${stems.length}[${stems.join(',')}]`)
    .join(',')
  const skipped = result.skipped ?? []
  console.log(`gate meta-tests(snapshot, lane=${result.lane.id}): discoverable=${result.discoverable} lane-members=${result.total} ran=${result.ran} pass=${result.pass} skipped=${skipped.length} failed=${result.failed.length} not-run=${result.notRun.length} duration=${formatDuration(result.durationMs)}/${formatDuration(result.lane.totalTimeoutMs)} excluded-by-class={${excluded}}`)
  if (skipped.length) {
    console.log('· 略過(計在 pass 但沒驗到任何東西;它們的對照組由 ci.yml 瀏覽器 job 跑,scripts/ci-gate-coverage.mjs 守):')
    console.log(`  ${skipped.map((stem) => `test-${stem}.mjs`).join(', ')}`)
  }
  if (result.callerDrift.length) {
    console.error('❌ caller repository changed while disposable meta-tests ran:')
    result.callerDrift.slice(0, 100).forEach((path) => console.error(`   - ${path}`))
  }
  if (result.failed.length) {
    console.error(`❌ ${result.failed.length} gate meta-test(s) failed in lane ${result.lane.id}:`)
    for (const failure of result.failed) {
      console.error(`   - test-${failure.stem}.mjs(${failure.status}${failure.status === 'failed' ? ` ${failure.code}` : ''};${formatDuration(failure.durationMs)} / 單支預算 ${formatDuration(failure.budgetMs)})`)
    }
  }
  if (result.notRun.length) console.error(`❌ ${result.notRun.length} gate meta-test(s) never ran in lane ${result.lane.id}:${result.notRun.join(', ')}`)
  if (!result.cleaned) console.error('❌ disposable repository cleanup failed')
}

export function laneResultFailed(result) {
  return Boolean(result.failed.length || result.notRun.length || result.callerDrift.length || !result.cleaned)
}

export function parseGateMetaArguments(argv) {
  if (argv.length === 0) return { lane: null }
  if (argv.length === 2 && argv[0] === '--lane' && /^[a-z][a-z0-9-]*$/.test(argv[1])) return { lane: argv[1] }
  return null
}

const IS_MAIN = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH) } catch { return false }
})()

function installSignalHandlers() {
  for (const [signal, number] of [['SIGTERM', 15], ['SIGINT', 2], ['SIGHUP', 1]]) {
    process.once(signal, () => {
      const running = runtime.member
        ? `${runtime.member}(已跑 ${formatDuration(Date.now() - runtime.memberStartedAt)})`
        : '(建快照 / 收尾,沒有成員在跑)'
      console.error(`[gate-meta ${runtime.laneId ?? '?'}] ⛔ 收到 ${signal}:當時在跑 ${running};收掉它的行程群組、移除快照後結束`)
      if (runtime.child) killGroup(runtime.child, 'SIGKILL')
      try { removeDisposableRepositorySnapshot(runtime.snapshot) } catch (error) {
        console.error(`   快照移除失敗(外層 harness 會補擁有者權限再刪):${error.message}`)
      }
      process.exit(128 + number)
    })
  }
}

if (IS_MAIN) {
  const parsed = parseGateMetaArguments(process.argv.slice(2))
  if (!parsed) {
    console.error('usage: node scripts/run-gate-meta-tests.mjs [--lane <id>]  (不帶 --lane = 依序跑全部 lane)')
    process.exit(2)
  }
  installSignalHandlers()
  try {
    const declared = (readGateMetaLaneDocument(DEFAULT_ROOT)?.lanes ?? []).map(lane => lane.id)
    if (declared.length === 0) fail(`no lanes declared in ${GATE_META_LANE_DOCUMENT}`)
    // 打錯 lane 名在建快照之前就擋(建快照本身要幾分鐘);快照裡的文件仍會再驗一次
    if (parsed.lane && !declared.includes(parsed.lane)) fail(`unknown gate meta-test lane:${parsed.lane};declared lanes:${declared.join(', ')}`)
    const laneIds = parsed.lane ? [parsed.lane] : declared
    let failedLanes = 0
    for (const lane of laneIds) {
      const result = await runGateMetaTests({ lane })
      printResult(result)
      if (laneResultFailed(result)) failedLanes += 1
    }
    // exitCode 而不是 process.exit:stdout 是 pipe 時(macOS 非同步)不截掉還沒寫出去的逐支行
    if (failedLanes) process.exitCode = 1
    else console.log(`✅ all gate mutation tests passed in ${laneIds.length === 1 ? `lane ${laneIds[0]}` : `${laneIds.length} lanes`} (isolated repository); caller stayed byte/mode/type identical`)
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  }
}

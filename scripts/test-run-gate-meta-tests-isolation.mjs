#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { laneResultFailed, runGateMetaTests } from './run-gate-meta-tests.mjs'
import {
  captureFrozenRepositoryManifest,
  createDisposableRepositorySnapshot,
  removeDisposableRepositorySnapshot,
  verifySnapshotAgainstManifest,
} from './lib/disposable-repository-snapshot.mjs'
import { captureDeepAuditSnapshot } from './lib/deep-audit-evidence-contract.mjs'

const NO_EXCLUSIONS = Object.freeze({ schemaVersion: 2, entries: [] })
const RUNNER = 'scripts/run-gate-meta-tests.mjs'

// 單一 remainder lane(storybook absent)的 lane 文件:fixture 的全部 meta-test 都在這一條。
function singleLane(members, { memberTimeoutMs = 30_000, totalTimeoutMs = 150_000, memberTimeoutOverrides = [] } = {}) {
  return {
    runner: RUNNER,
    lanes: [{
      id: 'core',
      storybook: 'absent',
      membership: 'remainder',
      memberTimeoutMs,
      memberTimeoutOverrides,
      totalTimeoutMs,
      members: members.map(stem => `scripts/test-${stem}.mjs`).sort(),
    }],
  }
}

async function withBrowserlessNestedFixtureEnvironment(callback) {
  const hadExplicitRuntime = Object.hasOwn(process.env, 'PLAYWRIGHT_BROWSERS_PATH')
  const explicitRuntime = process.env.PLAYWRIGHT_BROWSERS_PATH
  delete process.env.PLAYWRIGHT_BROWSERS_PATH
  assert.equal(Object.hasOwn(process.env, 'PLAYWRIGHT_BROWSERS_PATH'), false)
  try {
    return await callback()
  } finally {
    if (hadExplicitRuntime) process.env.PLAYWRIGHT_BROWSERS_PATH = explicitRuntime
    else delete process.env.PLAYWRIGHT_BROWSERS_PATH
    assert.equal(Object.hasOwn(process.env, 'PLAYWRIGHT_BROWSERS_PATH'), hadExplicitRuntime)
    assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, explicitRuntime)
  }
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
}

function write(root, path, value, mode = 0o644) {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, value)
  chmodSync(target, mode)
}

function tree(root, current = root) {
  const rows = []
  for (const name of readdirSync(current).sort()) {
    const path = join(current, name)
    const rel = relative(root, path).split('\\').join('/')
    const info = lstatSync(path)
    const mode = (info.mode & 0o7777).toString(8)
    if (info.isSymbolicLink()) rows.push(['link', rel, mode, readlinkSync(path)])
    else if (info.isDirectory()) rows.push(['dir', rel, mode], ...tree(root, path))
    else if (info.isFile()) rows.push(['file', rel, mode, readFileSync(path).toString('base64')])
    else rows.push(['special', rel, mode])
  }
  return rows
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gate-meta-caller-'))
  git(root, ['init', '-q'])
  git(root, ['config', 'user.name', 'Gate Meta Test'])
  git(root, ['config', 'user.email', 'gate-meta@example.invalid'])
  write(root, '.gitignore', 'node_modules/\nignored-secret/\n')
  mkdirSync(join(root, 'ignored-secret'), { recursive: true })
  write(root, 'ignored-secret/credential.txt', 'must-never-enter-snapshot\n')
  symlinkSync('/definitely-not-a-snapshot-input', join(root, 'ignored-secret', 'escape-link'))
  execFileSync('mkfifo', [join(root, 'ignored-secret', 'special-pipe')])
  write(root, 'target.txt', 'committed\n')
  write(root, 'authority-baseline/visual.txt', 'canonical-authority-bytes\n')
  write(root, 'mirror-baseline/visual.txt', 'legacy-mirror-bytes-must-not-be-read-through-link\n')
  write(root, 'packages/workspace/workspace.txt', 'workspace-caller\n')
  write(root, 'packages/workspace/node_modules/workspace-only/sentinel.txt', 'workspace-dependency-caller\n')
  write(root, 'node_modules/probe/sentinel.txt', 'dependency-caller\n')
  write(root, 'node_modules/probe/node_modules/nested-cli/bin.mjs', 'nested-cli-caller\n')
  mkdirSync(join(root, 'node_modules/probe/node_modules/.bin'), { recursive: true })
  symlinkSync('../nested-cli/bin.mjs', join(root, 'node_modules/probe/node_modules/.bin/nested-cli'))
  write(root, 'node_modules/.package-lock.json', JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'node_modules/probe': { version: '1.0.0' },
      'node_modules/probe/node_modules/nested-cli': { version: '1.0.0' },
      'node_modules/@fixture/workspace': { link: true, resolved: 'packages/workspace' },
      'packages/workspace/node_modules/workspace-only': { version: '1.0.0' },
    },
  }))
  mkdirSync(join(root, 'node_modules/@fixture'), { recursive: true })
  symlinkSync('../../packages/workspace', join(root, 'node_modules/@fixture/workspace'))
  write(root, 'scripts/crash-probe.mjs', 'process.exit(0)\n')
  write(root, 'scripts/test-crash-probe.mjs', `
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
const callerHome = ${JSON.stringify(process.env.HOME ?? '')}
assert.equal(process.env.INIT_CWD, process.env.GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT)
const runtimeParent = dirname(process.env.GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT)
assert.notEqual(process.env.HOME ?? '', callerHome)
assert.notEqual(process.env.HOME, process.env.GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT)
assert.equal(resolve(process.env.HOME), join(runtimeParent, 'runtime', 'home'))
for (const key of ['TMPDIR', 'TMP', 'TEMP', 'XDG_CACHE_HOME', 'npm_config_cache', 'NPM_CONFIG_CACHE', 'COREPACK_HOME']) {
  const target = resolve(process.env[key])
  const rel = relative(runtimeParent, target)
  assert.equal(isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep), false, key + ' escaped disposable runtime')
}
assert.equal(readFileSync('target.txt', 'utf8'), 'working\\n')
assert.equal(execFileSync('git', ['show', ':target.txt'], { encoding: 'utf8' }), 'staged\\n')
assert.equal(execFileSync('git', ['show', 'HEAD:target.txt'], { encoding: 'utf8' }), 'committed\\n')
assert.match(execFileSync('git', ['ls-files', '-s', '--', 'target.txt'], { encoding: 'utf8' }), /^100644 /)
assert.equal(lstatSync('target.txt').mode & 0o777, 0o755)
assert.equal(existsSync('untracked.txt'), true)
assert.equal(existsSync('ignored-secret'), false)
assert.equal(readFileSync('node_modules/probe/sentinel.txt', 'utf8'), 'dependency-caller\\n')
assert.equal(readFileSync('node_modules/probe/node_modules/.bin/nested-cli', 'utf8'), 'nested-cli-caller\\n')
assert.equal(readFileSync('packages/workspace/node_modules/workspace-only/sentinel.txt', 'utf8'), 'workspace-dependency-caller\\n')
assert.equal(realpathSync('node_modules/@fixture/workspace'), realpathSync('packages/workspace'))
writeFileSync('target.txt', 'MUTATED-IN-SNAPSHOT\\n')
chmodSync('target.txt', 0o644)
writeFileSync('node_modules/probe/sentinel.txt', 'MUTATED-DEPENDENCY-VIEW\\n')
writeFileSync('node_modules/probe/node_modules/nested-cli/bin.mjs', 'MUTATED-NESTED-DEPENDENCY\\n')
writeFileSync('packages/workspace/node_modules/workspace-only/sentinel.txt', 'MUTATED-WORKSPACE-DEPENDENCY\\n')
writeFileSync('node_modules/@fixture/workspace/workspace.txt', 'MUTATED-WORKSPACE-VIA-DEPENDENCY\\n')
writeFileSync('crash-residue.txt', 'must die with snapshot\\n')
writeFileSync(join(tmpdir(), 'crash-temp-residue.txt'), 'must die with snapshot runtime\\n')
process.kill(process.pid, 'SIGKILL')
`)
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'fixture'])
  write(root, 'target.txt', 'staged\n')
  git(root, ['add', 'target.txt'])
  write(root, 'target.txt', 'working\n')
  chmodSync(join(root, 'target.txt'), 0o755)
  write(root, 'untracked.txt', 'untracked-current-bytes\n', 0o600)
  rmSync(join(root, 'mirror-baseline'), { recursive: true, force: true })
  symlinkSync('authority-baseline', join(root, 'mirror-baseline'))
  return root
}

{
  const root = fixture()
  try {
    const before = tree(root)
    const frozen = captureDeepAuditSnapshot(root)
    assert.equal(frozen.inventory.find((row) => row.path === 'target.txt')?.mode, '100755')
    assert.equal(frozen.inventory.find((row) => row.path === 'mirror-baseline')?.kind, 'symlink')
    const shadowed = frozen.inventory.find((row) => row.path === 'mirror-baseline/visual.txt')
    assert.deepEqual(shadowed, {
      path: 'mirror-baseline/visual.txt',
      kind: 'missing',
      mode: '100644',
      bytes: 0,
      sha256: shadowed.sha256,
    })
    assert.notEqual(shadowed.sha256, frozen.inventory.find((row) => row.path === 'authority-baseline/visual.txt')?.sha256)
    const result = await withBrowserlessNestedFixtureEnvironment(() => runGateMetaTests({
      root,
      dependencyRoot: root,
      exclusionDocument: NO_EXCLUSIONS,
      pairedMetaDocument: singleLane(['crash-probe']),
      log: () => {},
    }))
    assert.equal(result.total, 1)
    assert.equal(result.discoverable, 1)
    assert.equal(result.ran, 1)
    assert.deepEqual(result.excludedByClass, {
      'deterministic-isolated': [],
      'environmental-observation': [],
    })
    assert.equal(result.pass, 0)
    assert.equal(result.failed.length, 1)
    assert.equal(result.failed[0].status, 'failed')
    assert.match(String(result.failed[0].code), /SIGKILL|unknown/)
    assert.deepEqual(result.callerDrift, [])
    assert.equal(result.cleaned, true)
    assert.deepEqual(tree(root), before, 'crashed mutation probe changed caller bytes/modes/types or Git state')
    assert.equal(readFileSync(join(root, 'target.txt'), 'utf8'), 'working\n')
    assert.equal((lstatSync(join(root, 'target.txt')).mode & 0o777), 0o755)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  let snapshot = null
  try {
    const frozen = captureFrozenRepositoryManifest(root)
    assert.equal(frozen.inventory.find((row) => row.path === 'target.txt')?.mode, '100755')
    chmodSync(join(root, 'target.txt'), 0o644)
    assert.throws(
      () => {
        snapshot = createDisposableRepositorySnapshot({ root, dependencyRoot: root, manifest: frozen })
      },
      /manifest path executable mode changed before materialization:target\.txt/,
    )
    assert.equal(snapshot, null)
  } finally {
    removeDisposableRepositorySnapshot(snapshot)
    rmSync(root, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'dependency-root-outside-'))
  let snapshot = null
  try {
    const frozen = captureFrozenRepositoryManifest(root)
    snapshot = createDisposableRepositorySnapshot({ root, dependencyRoot: root, manifest: frozen })
    const dependencyRoots = snapshot.dependencyViews.map(({ label }) => label)
    assert.deepEqual(dependencyRoots, ['node_modules', 'packages/workspace/node_modules'])
    assert.throws(
      () => verifySnapshotAgainstManifest(snapshot.snapshotRoot, frozen, { dependencyRoots: ['node_modules'] }),
      /snapshot contains a path outside the frozen manifest:packages\/workspace\/node_modules/,
    )
    const verified = verifySnapshotAgainstManifest(snapshot.snapshotRoot, frozen, { dependencyRoots })
    assert.equal(verified.inventoryEntries, frozen.inventory.length)

    write(outside, 'sentinel.txt', 'outside-unchanged\n')
    const workspaceDependencies = join(snapshot.snapshotRoot, 'packages/workspace/node_modules')
    rmSync(workspaceDependencies, { recursive: true, force: true })
    symlinkSync(relative(dirname(workspaceDependencies), outside), workspaceDependencies)
    assert.throws(
      () => verifySnapshotAgainstManifest(snapshot.snapshotRoot, frozen, { dependencyRoots }),
      /dependency root is not a real directory:packages\/workspace\/node_modules/,
    )
    assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'), 'outside-unchanged\n')
  } finally {
    removeDisposableRepositorySnapshot(snapshot)
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  const root = mkdtempSync(join(tmpdir(), 'snapshot-invalid-shadow-topology-'))
  try {
    symlinkSync('target', join(root, 'alias'))
    assert.throws(() => verifySnapshotAgainstManifest(root, {
      inventory: [
        { path: 'alias', kind: 'symlink', mode: '120000', bytes: 6, sha256: '0'.repeat(64) },
        { path: 'alias/child', kind: 'file', mode: '100644', bytes: 1, sha256: '1'.repeat(64) },
      ],
    }), /non-missing descendant below symlink leaf/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'gate-meta-outside-'))
  try {
    write(outside, 'sentinel.txt', 'outside-unchanged\n')
    symlinkSync(relative(join(root, 'node_modules'), outside), join(root, 'node_modules/escape-parent'))
    const before = tree(root)
    await assert.rejects(
      () => withBrowserlessNestedFixtureEnvironment(() => runGateMetaTests({
        root,
        dependencyRoot: root,
        exclusionDocument: NO_EXCLUSIONS,
        pairedMetaDocument: singleLane(['crash-probe']),
        log: () => {},
      })),
      /symbolic link escapes repository/,
    )
    assert.deepEqual(tree(root), before)
    assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'), 'outside-unchanged\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  const root = mkdtempSync(join(tmpdir(), 'snapshot-missing-symlink-'))
  try {
    symlinkSync('does-not-exist', join(root, 'expected-missing'))
    assert.throws(() => verifySnapshotAgainstManifest(root, {
      inventory: [{ path: 'expected-missing', kind: 'missing', mode: '100644', bytes: 0, sha256: '0'.repeat(64) }],
    }), /tracked-missing path materialized unexpectedly/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// ── Lanes(2026-10-14,待辦總帳 SM2):逐支即時印出、單支預算點名、lane 預算點名、storybook 只由 lane 建 ──
// 最小 lane fixture:每個成員 = scripts/<stem>.mjs(閘,恆綠)+ scripts/test-<stem>.mjs(給定的 meta-test 原始碼)。
function laneFixture(members, { npm = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gate-meta-lane-'))
  git(root, ['init', '-q'])
  git(root, ['config', 'user.name', 'Gate Meta Test'])
  git(root, ['config', 'user.email', 'gate-meta@example.invalid'])
  write(root, '.gitignore', 'node_modules/\nstorybook-static/\n*.marker\n')
  write(root, 'package.json', '{"name":"gate-meta-lane-fixture","private":true}\n')
  write(root, 'node_modules/.package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: {} }))
  if (npm) write(root, 'node_modules/.bin/npm', npm, 0o755)
  for (const [stem, source] of Object.entries(members)) {
    write(root, `scripts/${stem}.mjs`, 'process.exit(0)\n')
    write(root, `scripts/test-${stem}.mjs`, source)
  }
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'lane fixture'])
  return root
}

const sleep = (ms) => new Promise(done => setTimeout(done, ms))

{
  // (1) 開始 / 結束行當下就印(handshake:成員要等「開始」那行被印出來才會結束 —— 輸出若照舊存到最後才印,這支會卡到逾時而紅)
  // (2) 超過單支預算 → 點名、而且整個行程群組(含孫行程)被收掉;(3) storybook absent 的 lane 裡「缺 storybook-static」的略過 = 放錯 lane;
  // (4) 環境略過照舊計 pass 但列出;(5) 成員在快照裡留下 0o500 目錄,快照照樣移得掉
  const outside = mkdtempSync(join(tmpdir(), 'gate-meta-lane-outside-'))
  const release = join(outside, 'release')
  const sentinel = join(outside, 'grandchild-survived')
  const grandchild = join(outside, 'grandchild.mjs')
  writeFileSync(grandchild, `import { writeFileSync } from 'node:fs'\nsetTimeout(() => writeFileSync(${JSON.stringify(sentinel)}, 'survived\\n'), 3000)\n`)
  const root = laneFixture({
    'a-handshake': `import { existsSync } from 'node:fs'\nconst started = Date.now()\nconst wait = setInterval(() => {\n  if (existsSync(${JSON.stringify(release)})) { clearInterval(wait); process.exit(0) }\n  if (Date.now() - started > 15000) { clearInterval(wait); console.error('start line never streamed'); process.exit(7) }\n}, 25)\n`,
    'b-hang-with-grandchild': `import { spawn } from 'node:child_process'\nspawn(process.execPath, ['--', ${JSON.stringify(grandchild)}], { stdio: 'ignore' })\nsetInterval(() => {}, 1000)\n`,
    'c-needs-storybook': `console.log('· 略過:scripts/c-needs-storybook.mjs 缺 storybook-static(exit 2)—— 這是缺前置,不是產品壞掉;')\nprocess.exit(0)\n`,
    'd-env-skip': `console.log('· 略過:scripts/d-env-skip.mjs 起不了環境(exit 0;閘印了 SKIPPED-ENV 或 Playwright 啟動失敗)')\nprocess.exit(0)\n`,
    'e-readonly-residue': `import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'\nimport { tmpdir } from 'node:os'\nimport { join } from 'node:path'\nconst locked = join(tmpdir(), 'locked')\nmkdirSync(join(locked, 'inner'), { recursive: true })\nwriteFileSync(join(locked, 'inner', 'residue.txt'), 'x')\nchmodSync(locked, 0o500)\nprocess.exit(0)\n`,
  })
  try {
    const before = tree(root)
    const lines = []
    let killedAt = 0
    const result = await withBrowserlessNestedFixtureEnvironment(() => runGateMetaTests({
      root,
      dependencyRoot: root,
      exclusionDocument: NO_EXCLUSIONS,
      pairedMetaDocument: singleLane(['a-handshake', 'b-hang-with-grandchild', 'c-needs-storybook', 'd-env-skip', 'e-readonly-residue'], {
        memberTimeoutMs: 20_000,
        totalTimeoutMs: 200_000,
        memberTimeoutOverrides: [{ path: 'scripts/test-b-hang-with-grandchild.mjs', timeoutMs: 1_500 }],
      }),
      log: (line) => {
        lines.push(line)
        if (line.includes('▶ test-a-handshake.mjs')) writeFileSync(release, 'go\n')
        if (line.includes('⏱ test-b-hang-with-grandchild.mjs')) killedAt = Date.now()
      },
    }))
    const statuses = Object.fromEntries(result.timings.map(timing => [timing.stem, timing.status]))
    assert.deepEqual(statuses, {
      'a-handshake': 'passed',
      'b-hang-with-grandchild': 'timed-out',
      'c-needs-storybook': 'misassigned',
      'd-env-skip': 'skipped',
      'e-readonly-residue': 'passed',
    }, lines.join('\n'))
    assert.deepEqual(result.failed.map(({ stem, status }) => [stem, status]), [
      ['b-hang-with-grandchild', 'timed-out'],
      ['c-needs-storybook', 'misassigned'],
    ])
    assert.equal(result.failed[0].budgetMs, 1_500)
    assert.ok(result.failed[0].durationMs < 1_500 + 2_000 + 5_000, `budget kill took ${result.failed[0].durationMs}ms`)
    assert.deepEqual(result.skipped, ['d-env-skip'])
    assert.equal(result.pass, 3)
    assert.deepEqual(result.notRun, [])
    assert.equal(laneResultFailed(result), true)
    // 每支都是「開始」在前、「結束」在後,而且下一支的開始在上一支的結束之後 —— 逐支即時,不是最後一次倒出來
    const marks = lines.filter(line => /\[gate-meta core \d\/5\] [▶✓✗⏱·]/u.test(line)).map(line => line.replace(/^.*\] (\S) (test-[^ (]+).*$/u, '$1 $2'))
    assert.deepEqual(marks, [
      '▶ test-a-handshake.mjs', '✓ test-a-handshake.mjs',
      '▶ test-b-hang-with-grandchild.mjs', '⏱ test-b-hang-with-grandchild.mjs',
      '▶ test-c-needs-storybook.mjs', '✗ test-c-needs-storybook.mjs',
      '▶ test-d-env-skip.mjs', '· test-d-env-skip.mjs',
      '▶ test-e-readonly-residue.mjs', '✓ test-e-readonly-residue.mjs',
    ], lines.join('\n'))
    assert.match(lines.find(line => line.includes('⏱ test-b-hang-with-grandchild.mjs')), /超過單支預算 1\.5s/)
    assert.match(lines.find(line => line.includes('✗ test-c-needs-storybook.mjs')), /放錯 lane/)
    assert.match(lines.at(-1), /lane 結束:通過 2、略過 1、紅 2、沒跑到 0/)
    assert.deepEqual(result.callerDrift, [])
    assert.equal(result.cleaned, true, 'a 0o500 directory left inside the snapshot must not keep the snapshot on disk')
    assert.deepEqual(tree(root), before)
    // 孫行程排在 3 秒後寫檔;單支預算到點時整個行程群組被終止,所以它永遠寫不出來
    await sleep(Math.max(0, killedAt + 3_500 - Date.now()))
    assert.equal(existsSync(sentinel), false, 'a grandchild of a timed-out meta-test survived the process-group kill')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  // lane 預算(含建快照)用完:點名當時在跑的那支(或在開始前就用完)與沒跑到的清單;outer 上限永遠不會先到
  const root = laneFixture({
    'a-quick': 'process.exit(0)\n',
    'b-sleeper': 'setInterval(() => {}, 1000)\n',
    'c-never': 'process.exit(0)\n',
  })
  try {
    const lines = []
    const result = await withBrowserlessNestedFixtureEnvironment(() => runGateMetaTests({
      root,
      dependencyRoot: root,
      exclusionDocument: NO_EXCLUSIONS,
      // 可用時間 = 130s − 收尾保留 120s = 10s = 單支預算 → 第二支拿到的一定少於自己的單支預算 → 判 lane-deadline
      pairedMetaDocument: singleLane(['a-quick', 'b-sleeper', 'c-never'], { memberTimeoutMs: 10_000, totalTimeoutMs: 130_000 }),
      log: line => lines.push(line),
    }))
    assert.equal(result.laneDeadlineReached, true, lines.join('\n'))
    assert.ok(result.notRun.includes('test-c-never.mjs'), lines.join('\n'))
    const sleeper = result.failed.find(({ stem }) => stem === 'b-sleeper')
    assert.ok(sleeper?.status === 'lane-deadline' || result.notRun.includes('test-b-sleeper.mjs'), lines.join('\n'))
    if (sleeper) assert.ok(lines.some(line => /⏱ test-b-sleeper\.mjs 在 lane 預算用完時被終止/u.test(line)), lines.join('\n'))
    assert.ok(lines.some(line => /⛔ lane 預算.*沒跑到 \d+ 支:.*test-c-never\.mjs/u.test(line)), lines.join('\n'))
    assert.ok(result.durationMs < 130_000, `lane overran its own budget:${result.durationMs}ms`)
    assert.equal(laneResultFailed(result), true)
    assert.equal(result.cleaned, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

{
  // storybook: "lane-build":runner 先在快照裡 build(假 npm 照 build:lib / build-storybook 產生建置),成員拿到
  // GOVERNANCE_BROWSER_REQUIRED=1 與 storybook-static;在這種 lane 裡「略過」= 紅。build 失敗 → 一支都不跑、全部點名。
  const npm = (failStorybook) => [
    '#!/usr/bin/env node',
    "const fs = require('node:fs')",
    'const [command, , script] = process.argv.slice(2)',
    "if (command !== 'run') process.exit(64)",
    "if (script === 'build:lib') { fs.writeFileSync('lib.marker', 'ok'); process.exit(0) }",
    "if (script === 'build-storybook') {",
    failStorybook ? "  console.error('storybook build exploded'); process.exit(1)" : "  if (!fs.existsSync('lib.marker')) process.exit(66)",
    "  fs.mkdirSync('storybook-static', { recursive: true })",
    "  fs.writeFileSync('storybook-static/iframe.html', '<!doctype html>')",
    "  fs.writeFileSync('storybook-static/index.json', '{}')",
    '  process.exit(0)',
    '}',
    'process.exit(65)',
    '',
  ].join('\n')
  const members = {
    'a-browser': "import { existsSync } from 'node:fs'\nif (process.env.GOVERNANCE_BROWSER_REQUIRED !== '1') process.exit(8)\nif (!existsSync('storybook-static/iframe.html')) process.exit(9)\nprocess.exit(0)\n",
    'b-skips-anyway': "console.log('· 略過:scripts/b-skips-anyway.mjs 起不了環境(exit 0)')\nprocess.exit(0)\n",
  }
  const document = {
    runner: RUNNER,
    lanes: [
      {
        id: 'browser-1',
        storybook: 'lane-build',
        storybookBuildTimeoutMs: 30_000,
        membership: 'declared',
        memberTimeoutMs: 20_000,
        memberTimeoutOverrides: [],
        totalTimeoutMs: 200_000,
        members: ['scripts/test-a-browser.mjs', 'scripts/test-b-skips-anyway.mjs'],
      },
      { id: 'core', storybook: 'absent', membership: 'remainder', memberTimeoutMs: 20_000, memberTimeoutOverrides: [], totalTimeoutMs: 200_000, members: [] },
    ],
  }
  for (const failStorybook of [false, true]) {
    const root = laneFixture(members, { npm: npm(failStorybook) })
    try {
      const before = tree(root)
      const lines = []
      const result = await withBrowserlessNestedFixtureEnvironment(() => runGateMetaTests({
        root,
        dependencyRoot: root,
        exclusionDocument: NO_EXCLUSIONS,
        pairedMetaDocument: document,
        lane: 'browser-1',
        log: line => lines.push(line),
      }))
      if (failStorybook) {
        assert.equal(result.storybookBuild.status, 'failed', lines.join('\n'))
        assert.deepEqual(result.timings, [])
        assert.deepEqual(result.notRun, ['test-a-browser.mjs', 'test-b-skips-anyway.mjs'])
        assert.ok(lines.some(line => /storybook build exploded/u.test(line)), 'the build failure tail must be printed')
      } else {
        assert.equal(result.storybookBuild.status, 'passed', lines.join('\n'))
        assert.deepEqual(result.timings.map(({ stem, status }) => [stem, status]), [
          ['a-browser', 'passed'],
          ['b-skips-anyway', 'skipped-in-browser-lane'],
        ], lines.join('\n'))
        assert.deepEqual(result.notRun, [])
      }
      assert.equal(laneResultFailed(result), true)
      assert.equal(result.cleaned, true)
      assert.deepEqual(result.callerDrift, [])
      assert.deepEqual(tree(root), before, 'the lane build must stay inside the disposable snapshot')
      await assert.rejects(
        () => withBrowserlessNestedFixtureEnvironment(() => runGateMetaTests({
          root,
          dependencyRoot: root,
          exclusionDocument: NO_EXCLUSIONS,
          pairedMetaDocument: document,
          log: () => {},
        })),
        /a lane id is required/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

console.log('✓ disposable gate meta-test snapshot preserves Git/worktree/dependencies, nested .bin links and crash containment; lanes stream per-test lines, enforce explicit per-test and lane budgets, own the Storybook build and clean read-only residue')

#!/usr/bin/env node
/**
 * meta-test for hook-test-fixture-guard-invariant —— 靜態閘兩面 + 「mktemp -d 真的失敗」時整條路的兩面。
 *
 * (A) 靜態閘:現況必綠;`--selftest`(每種壞法一個合成檔、必須逐一被點名;每種合法寫法必須放行)必綠。
 *
 * (B) 真實失敗(全程在 $TMPDIR 底下的複製樹裡,不碰 repo 樹):
 *     把 hooks 樹與本閘複製進一個驗證過的暫存目錄,git init + commit;PATH 最前面放一支假 mktemp ——
 *     第 1 次 `-d` 照常建目錄(讓 run-all.sh 的 probe 通過),之後每次 `-d` 回空字串並 exit 1,
 *     就是 2026-11-17 / 11-18 那種「TMPDIR 不能用,mktemp 靜靜回空」。
 *   B1 紅面(防護都在):複製每一支有 `mktemp -d` 的 suite 跑 run-all.sh ——
 *      run-all 必須非 0;每一支 suite 都列在 Failed suites;每一支**恰好**吃到一次拒絕(停在第一個 mktemp -d,
 *      沒有帶著空字串往下跑到第二個);run-all 不得報「wrote into the repository」;複製樹跑完與跑前逐位元相同。
 *   B2 反向 · 靜態閘:拿掉 test_log_governance_fires.sh 的防護 —— run-all 必須在跑任何 suite 之前就拒絕,並點名那一行。
 *   B3 反向 · 寫入偵測:同一支拿掉防護,再把複製樹裡的靜態閘換成恆綠的替身(模擬「靜態閘看不出的寫法」)——
 *      這支會在 suite 目錄裡 `git init`(就是那兩次事故的形狀),run-all 必須紅、點名這支、指出新出現的 .git。
 *   B4 綠面 · 寫入偵測不亂指控:B3 原封不動,只把 mktemp 換回正常 —— 同一支照樣跑完,run-all 不得報寫入。
 *      B3 與 B4 只差「mktemp 有沒有失敗」一個變數,所以 B3 的紅不是偵測器對這支 suite 本身過敏。
 *   B3 只量得到寫入偵測的「巢狀 .git」那一半;另一半(hooks 樹的 git status --porcelain --ignored)由 B5–B7 量:
 *   B5 紅面 · git status 半邊:一支不碰 mktemp 的替身 suite 往 hooks 樹寫一個普通檔(沒有 .git,find 那一半看不到)——
 *      run-all 必須紅、點名這支,並列出 `+ ?? <hooks 樹>/zz-written-by-suite.txt`(這一行只可能來自 git status)。
 *   B6 綠面:同一支只把寫入目標換成 $TMPDIR —— 照跑、通過、檔真的寫出來了,寫入偵測不得報。B5 與 B6 只差「寫到哪裡」。
 *   B7 量具失效:複製樹的 run-all 把 git status 換成必定出錯的寫法(--porcelain=v9)。git 出錯時前後印出同一段錯誤、
 *      比對恆等,這一半會瞎而且不出聲 —— run-all 必須以「偵測器不可用」紅,一支 suite 都不跑(那支會寫入的替身沒機會跑)。
 *   B8 / B9 stdin(2026-11-20):hook 用 `INPUT=$(cat)` 讀 payload,測試叫 hook 沒餵 payload 就繼承 runner 的 stdin;
 *      呼叫端的 stdin 一直開著(代理的背景殼層)就永遠等(2026-11-18 test_stop_capture_metrics.sh 卡過 40 多分鐘)。
 *      run-all 的 stdin 接一條本測試自己握著寫端的 FIFO(讀的人永遠等不到 EOF),時限到就砍整個行程群組:
 *   B8 綠面:一支像 hook 一樣 `$(cat)` 的替身照樣跑完、讀到 0 bytes(suite 的 stdin 是 /dev/null)。
 *   B9 對照組:同一棵只把 run-all 的 `< /dev/null` 拿掉 —— 必須卡住、被時限砍掉(證明 B8 的綠不是因為 FIFO 根本沒擋住)。
 *   B10–B13 子集參數(2026-11-20;`npm run hooks:test -- test_x.sh`):
 *   B10 只跑點名的那支(檔名或指進本目錄的路徑都收),總結標 SUBSET 與「幾支沒跑」,覆蓋率閉包照跑。
 *   B11 點錯(沒有這支 / 不是 test_*.sh / 路徑指到別的目錄)→ 一支 suite 都不跑就拒絕(打錯字不能變成 0 支 suite 的綠)。
 *   B12 子集照跑靜態閘:只點名沒問題的那支,另一支拿掉防護 —— 照樣在跑任何 suite 之前拒絕並點名那一行。
 *   B13 子集照跑寫入偵測:點名的那支往 hooks 樹寫檔 —— 照樣紅並點名。
 *   B14 覆蓋率閉包不靠外部工具(2026-11-20):PATH 最前面放一支必定失敗的 comm(模擬 /dev/fd 被沙箱擋)。
 *      複製樹只留一支 suite,其他 hook 都沒有測試 —— 閉包必須照樣紅、印出沒測試的數量。舊寫法 `comm -23 <(…) <(…)`
 *      在 comm 失敗時 UNTESTED 是空字串 =「每支 hook 都有測試」,零報錯。
 *
 * 假 mktemp 拒絕時往 fd 3 寫一個標記;fd 1 / 2 / 3 是同一個檔,所以標記按時間序落在各 suite 的輸出段落裡,
 * 連把 stderr 丟進 /dev/null 的那一支(test_record_release_consent.sh)也數得到。
 * 允許的呼叫一律自帶模板(與沙箱的 mktemp 替身同一個作法),所以本測試在 macOS 沙箱、Linux CI、拋棄式快照裡結果相同。
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync,
  readdirSync, realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanHookTests } from './hook-test-fixture-guard-invariant.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GATE = 'scripts/hook-test-fixture-guard-invariant.mjs'
const HOOKS = 'packages/design-system/ds-canonical/hooks'
const TESTS = `${HOOKS}/tests`
const VICTIM = 'test_log_governance_fires.sh'
const REFUSED = 'FAKE-MKTEMP-REFUSED'
const WROTE = 'wrote into the repository'
const DETECTOR_DOWN = 'repository-write detector unavailable'
const PROBE = 'test_zz_write_probe.sh'
const PROBE_FILE = 'zz-written-by-suite.txt'

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${!ok && detail ? `\n${detail}` : ''}`)
  if (!ok) failures++
}
const tail = (text, n = 40) => text.split('\n').slice(-n).map(l => `    ${l}`).join('\n')

// 子行程環境:不讓呼叫端的 Git 綁定把指令導回真 repo
const cleanEnv = (extra = {}) => {
  const env = { ...process.env, ...extra }
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR']) delete env[k]
  return env
}
// ── (A) 靜態閘兩面 ──────────────────────────────────────────────────────────
//(argv 寫成字面陣列:harness 來源政策要能逐項審 Node 的 script 運算元,包成 helper 傳參數會被判成看不出來)
{
  const base = spawnSync(process.execPath, [GATE], { cwd: ROOT, encoding: 'utf8', env: cleanEnv() })
  check(base.status === 0, `A1 現況:${GATE} 綠`, tail(base.stdout + base.stderr))
  const self = spawnSync(process.execPath, [GATE, '--selftest'], { cwd: ROOT, encoding: 'utf8', env: cleanEnv() })
  check(self.status === 0 && /selftest:每一種壞法都被指名/.test(self.stdout), `A2 對照組:${GATE} --selftest 綠`, tail(self.stdout + self.stderr))
}

// ── (B) 真實失敗兩面 ────────────────────────────────────────────────────────
if (typeof process.getuid === 'function' && process.getuid() === 0) {
  // B3 讓一支沒有防護的 suite 帶著空字串往下跑,它之後的 `"$TMP/x"` 會變成 `/x`;非 root 寫不進根目錄,root 寫得進去。
  check(false, 'B 以 root 執行 —— 拒跑(B3 會讓空字串路徑寫進 / );請用一般使用者跑')
  process.exit(1)
}

const work = mkdtempSync(join(tmpdir(), 'hook-fixture-guard-meta-'))
if (!work || !existsSync(work) || !statSync(work).isDirectory()) {
  console.error(`✗ 暫存目錄不可用(${work});不准往下跑`)
  process.exit(1)
}
const T = realpathSync(work)
try {
  const sites = scanHookTests(ROOT)
  const suitesWithSites = [...new Set(sites.map(s => s.file.split('/').pop()).filter(f => /^test_.*\.sh$/.test(f)))].sort()
  check(suitesWithSites.includes(VICTIM), `B0 ${VICTIM} 在有 mktemp -d 的 suite 清單裡(共 ${suitesWithSites.length} 支)`)

  const bin = join(T, 'bin')
  mkdirSync(bin)
  const state = join(T, 'state')
  mkdirSync(state)
  // 假 mktemp:允許的呼叫自帶模板交給真的 mktemp;`-d` 超過 limit 次就回空字串 + exit 1,並往 fd 3 寫標記
  writeFileSync(join(bin, 'mktemp'), [
    '#!/bin/sh',
    `STATE='${state}'`,
    'dir=0; tpl=0',
    'for a in "$@"; do case "$a" in --directory) dir=1;; --*) ;; -*d*) dir=1;; -*) ;; *) tpl=1;; esac; done',
    'if [ "$dir" = 1 ]; then',
    '  n=$(( $(cat "$STATE/count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STATE/count"',
    '  limit=$(cat "$STATE/limit")',
    `  if [ "$n" -gt "$limit" ]; then { echo "${REFUSED} #$n" >&3; } 2>/dev/null || echo "${REFUSED} #$n" >&2; exit 1; fi`,
    'fi',
    `PATH='${process.env.PATH}'`,
    'export PATH',
    'if [ "$tpl" = 1 ]; then exec mktemp "$@"; fi',
    'exec mktemp "$@" "${TMPDIR:-/tmp}/tmp.XXXXXXXXXX"',
    '',
  ].join('\n'))
  chmodSync(join(bin, 'mktemp'), 0o755)

  const git = (cwd, args) => spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
    '-c', 'user.name=hook-fixture-guard-meta', '-c', 'user.email=hook-fixture-guard-meta@example.invalid',
    '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8', env: cleanEnv() })

  /** 建一棵複製樹:hooks 樹 + 靜態閘(或替身);tests 只留指定的 suite;git commit 成乾淨基準。 */
  const makeCopy = (name, { suites, mutate = () => {}, stubGate = false }) => {
    const repo = join(T, name)
    cpSync(join(ROOT, HOOKS), join(repo, HOOKS), { recursive: true })
    for (const f of readdirSync(join(repo, TESTS))) {
      if (/^test_.*\.sh$/.test(f) && !suites.includes(f)) rmSync(join(repo, TESTS, f))
    }
    mkdirSync(join(repo, 'scripts'))
    if (stubGate) writeFileSync(join(repo, GATE), '// 替身:模擬靜態閘看不出的寫法(恆綠)\nprocess.exit(0)\n')
    else cpSync(join(ROOT, GATE), join(repo, GATE))
    mutate(repo)
    const init = git(repo, ['init', '-q'])
    const add = git(repo, ['add', '-A'])
    const commit = git(repo, ['commit', '-qm', 'base'])
    if (init.status || add.status || commit.status) throw new Error(`複製樹 ${name} 建不起來:${init.stderr}${add.stderr}${commit.stderr}`)
    return repo
  }
  const snapshotOf = (repo) => {
    const status = git(repo, ['--no-optional-locks', 'status', '--porcelain', '--ignored', '--untracked-files=all'])
    const nested = []
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name)
        if (e.name === '.git' && full !== join(repo, '.git')) nested.push(full)
        else if (e.isDirectory()) walk(full)
      }
    }
    walk(repo)
    return `${status.stdout}${status.stderr}\n${nested.sort().join('\n')}`
  }
  const runAll = (repo, limit) => {
    writeFileSync(join(state, 'count'), '0')
    writeFileSync(join(state, 'limit'), String(limit))
    const tmp = join(T, `tmp-${repo.split('/').pop()}`)
    mkdirSync(tmp, { recursive: true })
    const log = join(T, `${repo.split('/').pop()}.log`)
    const fd = openSync(log, 'w')
    // `--` 先結束 bash 的選項:腳本路徑是算出來的,來源政策要能確定它不是 `-c` 之類的命令字串
    const r = spawnSync('bash', ['--', join(repo, TESTS, 'run-all.sh')], {
      cwd: repo,
      stdio: ['ignore', fd, fd, fd],
      env: cleanEnv({ PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp }),
      timeout: 150_000,
    })
    closeSync(fd)
    return { status: r.status, signal: r.signal, out: readFileSync(log, 'utf8'), tmp }
  }
  const sections = (out) => {
    const map = new Map()
    let current = null
    for (const line of out.split('\n')) {
      const m = /^▶ Running: (\S+)/.exec(line)
      if (m) { current = m[1]; map.set(current, []); continue }
      if (/^════/.test(line)) { current = null; continue } // run-all 的總結不屬於最後一支
      if (current) map.get(current).push(line)
    }
    return map
  }
  // 「停在被拒的那一刻」:最後一次拒絕之後,只准出現防護自己的訊息(都含 mktemp 字樣),
  // 不准再有任何測項輸出 —— 有的話就是帶著空字串往下跑了。回傳 null = 有停;否則回傳原因。
  //(拒絕次數不要求恰好 1:有幾支 suite 測的 hook 自己也呼叫 mktemp -d,那幾次拒絕發生在 suite 自己的 mktemp 之前。)
  // B3 拿同一個判定去量一支沒防護的 suite,必須判成「沒停」—— 這個判定才不是恆真。
  const keptGoingAfterRefusal = (lines) => {
    const last = lines.map(l => l.includes(REFUSED)).lastIndexOf(true)
    if (last < 0) return '一次拒絕都沒吃到'
    const afterwards = lines.slice(last + 1).filter(l => l.trim() && !/mktemp/.test(l))
    return afterwards.length ? `拒絕之後還跑了:${afterwards.slice(0, 2).join(' / ')}` : null
  }
  const failedList = (out) => {
    const at = out.lastIndexOf('Failed suites:')
    return at < 0 ? [] : [...out.slice(at).matchAll(/^\s+- (test_\S+\.sh)$/gm)].map(m => m[1])
  }
  const unguard = (repo) => {
    const file = join(repo, TESTS, VICTIM)
    const lines = readFileSync(file, 'utf8').split('\n')
    const i = lines.findIndex(l => /^TMP=\$\(mktemp -d\)$/.test(l))
    if (i < 0 || !/\[ -n "\$\{TMP:-\}" \] && \[ -d "\$TMP" \]/.test(lines[i + 1] ?? '')) throw new Error(`${VICTIM} 找不到 TMP=$(mktemp -d) + 防護那兩行 —— 對照組前提不成立`)
    lines.splice(i + 1, 1)
    writeFileSync(file, lines.join('\n'))
    return i + 1
  }
  // 替身 suite:不用 mktemp -d(靜態閘照樣放行),只往 target 寫一個普通檔
  const writeProbe = (target) => (repo) => writeFileSync(join(repo, TESTS, PROBE), [
    '#!/bin/bash',
    '# meta-test 替身:往指定位置寫一個普通檔,量 run-all 寫入偵測的 git status 半邊',
    `echo x > ${target}`,
    'echo "✓ probe file written"',
    '',
  ].join('\n'))
  const INTO_HOOK_TREE = `"$(dirname "$0")/../${PROBE_FILE}"`
  const INTO_TMPDIR = `"\${TMPDIR:?}/${PROBE_FILE}"`

  // B1 紅面:防護都在、mktemp -d 失敗
  {
    const repo = makeCopy('b1', { suites: suitesWithSites })
    const before = snapshotOf(repo)
    const r = runAll(repo, 1)
    const after = snapshotOf(repo)
    const sec = sections(r.out)
    const failed = failedList(r.out)
    check(r.status !== 0 && r.signal === null, `B1 run-all 非 0(實得 ${r.status}${r.signal ? ` / ${r.signal}` : ''})`, tail(r.out))
    const notRun = suitesWithSites.filter(s => !sec.has(s))
    check(notRun.length === 0, `B1 每一支都有跑到(${sec.size} / ${suitesWithSites.length})`, `    沒跑到:${notRun.join(', ')}`)
    const notFailed = suitesWithSites.filter(s => !failed.includes(s))
    check(notFailed.length === 0, 'B1 每一支都列在 Failed suites', `    沒被列為失敗:${notFailed.join(', ')}`)
    const kept = suitesWithSites.filter(s => sec.has(s)).map(s => [s, keptGoingAfterRefusal(sec.get(s))]).filter(([, why]) => why)
    check(kept.length === 0, 'B1 每一支都停在被拒的那個 mktemp -d(之後只有防護訊息)',
      kept.map(([s, why]) => `    ${s}:${why}`).join('\n'))
    check(/mktemp -d failed\(/.test(r.out), 'B1 防護訊息有印出來')
    check(!r.out.includes(WROTE), 'B1 寫入偵測沒有報(防護擋在寫入之前)', tail(r.out))
    check(before === after, 'B1 複製樹跑完與跑前相同(git status --ignored + 巢狀 .git)', `    跑前:\n${before}\n    跑後:\n${after}`)
  }

  // B2 反向 · 靜態閘:拿掉一支的防護 → 整輪不跑
  {
    let line = 0
    const repo = makeCopy('b2', { suites: [VICTIM], mutate: (r) => { line = unguard(r) } })
    const before = snapshotOf(repo)
    const r = runAll(repo, 1)
    check(r.status !== 0, `B2 run-all 非 0(實得 ${r.status})`, tail(r.out))
    check(r.out.includes(`${VICTIM}:${line} TMP`), `B2 靜態閘點名 ${VICTIM}:${line}`, tail(r.out))
    check(!r.out.includes('▶ Running'), 'B2 一支 suite 都沒有跑', tail(r.out))
    check(before === snapshotOf(repo), 'B2 複製樹不變')
  }

  // B3 反向 · 寫入偵測:防護拿掉 + 靜態閘替身 + mktemp -d 失敗
  {
    const repo = makeCopy('b3', { suites: [VICTIM], mutate: unguard, stubGate: true })
    const r = runAll(repo, 1)
    check(r.status !== 0 && !r.out.includes('Suites:'), `B3 run-all 非 0(實得 ${r.status}),而且停在那支之後、沒走到總結`, tail(r.out))
    check(r.out.includes(`FATAL: ${VICTIM} ${WROTE}`), `B3 寫入偵測點名 ${VICTIM}`, tail(r.out))
    check(r.out.includes(`${TESTS}/.git`), 'B3 指出 suite 目錄裡新出現的 .git', tail(r.out))
    const victim = sections(r.out).get(VICTIM) ?? []
    check(keptGoingAfterRefusal(victim) !== null, 'B3 B1 的「停在被拒那一刻」判定對沒防護的這支判成沒停(判定不是恆真)', tail(victim.join('\n')))
  }

  // B4 綠面 · 寫入偵測不亂指控:跟 B3 同一棵(防護拿掉 + 替身),只差 mktemp 正常
  {
    const repo = makeCopy('b4', { suites: [VICTIM], mutate: unguard, stubGate: true })
    const before = snapshotOf(repo)
    const r = runAll(repo, 1_000_000) // 等於不設上限(sh 的整數比較用一般大小的數就好)
    const sec = sections(r.out)
    check(sec.has(VICTIM), `B4 ${VICTIM} 有跑`, tail(r.out))
    check(!r.out.includes(WROTE), 'B4 寫入偵測沒有報', tail(r.out))
    check(!r.out.includes(REFUSED), 'B4 沒有任何 mktemp 被拒(變數只差這一個)')
    check(before === snapshotOf(repo), 'B4 複製樹不變')
  }

  // B5 紅面 · 寫入偵測的 git status 半邊:替身 suite 往 hooks 樹寫普通檔(不產生 .git)
  {
    const repo = makeCopy('b5', { suites: [PROBE], mutate: writeProbe(INTO_HOOK_TREE) })
    const r = runAll(repo, 1_000_000)
    // 複製樹只留一支 suite,覆蓋率那段本來就會紅,所以只看結束碼分不出來;要看它停在那支之後、沒走到總結
    check(r.status !== 0 && !r.out.includes('Suites:'), `B5 run-all 非 0(實得 ${r.status}),而且停在那支之後、沒走到總結`, tail(r.out))
    check(r.out.includes(`FATAL: ${PROBE} ${WROTE}`), `B5 寫入偵測點名 ${PROBE}`, tail(r.out))
    check(r.out.includes(`+ ?? ${HOOKS}/${PROBE_FILE}`), `B5 差異列出 + ?? ${HOOKS}/${PROBE_FILE}(只可能來自 git status 半邊)`, tail(r.out))
  }

  // B6 綠面:同一支只把寫入目標換成 $TMPDIR
  {
    const repo = makeCopy('b6', { suites: [PROBE], mutate: writeProbe(INTO_TMPDIR) })
    const before = snapshotOf(repo)
    const r = runAll(repo, 1_000_000)
    check(sections(r.out).has(PROBE) && !failedList(r.out).includes(PROBE), `B6 ${PROBE} 有跑而且通過`, tail(r.out))
    check(existsSync(join(r.tmp, PROBE_FILE)), 'B6 檔真的寫進 $TMPDIR(綠不是因為替身什麼都沒寫)')
    check(!r.out.includes(WROTE) && !r.out.includes(DETECTOR_DOWN), 'B6 寫入偵測沒有報、也沒有報偵測器不可用', tail(r.out))
    check(before === snapshotOf(repo), 'B6 複製樹不變')
  }

  // B7 量具失效:git status 必定出錯 → 必須以「偵測器不可用」紅,而不是前後同一段錯誤字串比成相等
  {
    const breakGitStatus = (repo) => {
      const file = join(repo, TESTS, 'run-all.sh')
      const text = readFileSync(file, 'utf8')
      const from = 'status --porcelain --ignored'
      if (text.split(from).length !== 2) throw new Error(`run-all.sh 裡「${from}」不是恰好一處 —— 對照組前提不成立`)
      writeFileSync(file, text.replace(from, 'status --porcelain=v9 --ignored'))
    }
    const repo = makeCopy('b7', { suites: [PROBE], mutate: (r) => { writeProbe(INTO_HOOK_TREE)(r); breakGitStatus(r) } })
    const before = snapshotOf(repo)
    const r = runAll(repo, 1_000_000)
    check(r.status !== 0, `B7 run-all 非 0(實得 ${r.status})`, tail(r.out))
    check(r.out.includes(DETECTOR_DOWN), 'B7 以「偵測器不可用」紅', tail(r.out))
    check(!r.out.includes('▶ Running'), 'B7 一支 suite 都沒有跑', tail(r.out))
    check(before === snapshotOf(repo), 'B7 複製樹不變(那支會往 hooks 樹寫檔的替身沒有機會跑)')
  }

  // B8 / B9 stdin:run-all 的 stdin 接一條本測試自己同時握著讀寫端的 FIFO —— 讀它的人永遠等不到 EOF。
  // 子行程開成自己的行程群組(detached),時限到就整群 SIGKILL(run-all、suite、卡住的 cat 一起),不留孤兒。
  const STDIN_PROBE = 'test_zz_stdin_probe.sh'
  const STDIN_MARK = 'stdin-probe read'
  const stdinProbe = (repo) => writeFileSync(join(repo, TESTS, STDIN_PROBE), [
    '#!/bin/bash',
    '# meta-test 替身:像 hook 一樣用 $(cat) 讀 stdin;stdin 沒被關掉就會一直等',
    'IN=$(cat)',
    `echo "${STDIN_MARK} \${#IN} bytes"`,
    '',
  ].join('\n'))
  const runAllHoldingStdin = async (repo, timeoutMs) => {
    const name = repo.split('/').pop()
    const fifo = join(T, `${name}.stdin`)
    const made = spawnSync('mkfifo', [fifo], { encoding: 'utf8' })
    if (made.status !== 0) throw new Error(`mkfifo 失敗(${made.status}):${made.stderr}`)
    const hold = openSync(fifo, 'r+')
    writeFileSync(join(state, 'count'), '0')
    writeFileSync(join(state, 'limit'), '1000000')
    const tmp = join(T, `tmp-${name}`)
    mkdirSync(tmp, { recursive: true })
    const log = join(T, `${name}.log`)
    const fd = openSync(log, 'w')
    const child = spawn('bash', ['--', join(repo, TESTS, 'run-all.sh')], {
      cwd: repo,
      stdio: [hold, fd, fd, fd],
      detached: true,
      env: cleanEnv({ PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp }),
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
    }, timeoutMs)
    const exit = await new Promise((done) => child.on('close', (status, signal) => done({ status, signal })))
    clearTimeout(timer)
    closeSync(hold)
    closeSync(fd)
    return { ...exit, timedOut, out: readFileSync(log, 'utf8') }
  }

  // B8 綠面:stdin 一直開著,讀 stdin 的替身照樣跑完、讀到 0 bytes
  {
    const repo = makeCopy('b8', { suites: [STDIN_PROBE], mutate: stdinProbe })
    const r = await runAllHoldingStdin(repo, 60_000)
    check(!r.timedOut && sections(r.out).has(STDIN_PROBE), `B8 stdin 一直開著,${STDIN_PROBE} 照樣跑完(沒有卡到時限)`, tail(r.out))
    check(r.out.includes(`${STDIN_MARK} 0 bytes`), 'B8 替身讀到 0 bytes —— suite 的 stdin 是 /dev/null,不是呼叫端那條', tail(r.out))
  }

  // B9 對照組:同一棵只把 run-all 的 `< /dev/null` 拿掉 → 必須卡住、被時限砍掉
  {
    const dropDevNull = (repo) => {
      const file = join(repo, TESTS, 'run-all.sh')
      const text = readFileSync(file, 'utf8')
      const from = 'bash "$test_file" < /dev/null'
      if (text.split(from).length !== 2) throw new Error(`run-all.sh 裡「${from}」不是恰好一處 —— 對照組前提不成立`)
      writeFileSync(file, text.replace(from, 'bash "$test_file"'))
    }
    const repo = makeCopy('b9', { suites: [STDIN_PROBE], mutate: (r) => { stdinProbe(r); dropDevNull(r) } })
    const r = await runAllHoldingStdin(repo, 10_000)
    check(r.timedOut, 'B9 拿掉 `< /dev/null` 後,讀 stdin 的替身卡住、被 10 秒時限砍掉(量具看得到「卡住」)', tail(r.out))
    check(!r.out.includes(STDIN_MARK), 'B9 替身沒有讀完(停在 $(cat))', tail(r.out))
  }

  // B10–B13 子集參數:run-all 後面帶一個 suite 參數(argv 寫成字面陣列,理由同 runAll)
  const OTHER_PROBE = 'test_zz_other_probe.sh'
  const otherProbe = (repo) => writeFileSync(join(repo, TESTS, OTHER_PROBE), ['#!/bin/bash', 'echo "other probe ran"', ''].join('\n'))
  const runSubset = (repo, suiteArg) => {
    writeFileSync(join(state, 'count'), '0')
    writeFileSync(join(state, 'limit'), '1000000')
    const tmp = join(T, `tmp-${repo.split('/').pop()}`)
    mkdirSync(tmp, { recursive: true })
    const log = join(T, `${repo.split('/').pop()}-subset.log`)
    const fd = openSync(log, 'w')
    const r = spawnSync('bash', ['--', join(repo, TESTS, 'run-all.sh'), suiteArg], {
      cwd: repo,
      stdio: ['ignore', fd, fd, fd],
      env: cleanEnv({ PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp }),
      timeout: 150_000,
    })
    closeSync(fd)
    return { status: r.status, signal: r.signal, out: readFileSync(log, 'utf8') }
  }

  // B10 只跑點名的那支
  {
    const repo = makeCopy('b10', { suites: [PROBE, OTHER_PROBE], mutate: (r) => { writeProbe(INTO_TMPDIR)(r); otherProbe(r) } })
    const byName = runSubset(repo, PROBE)
    const sec = sections(byName.out)
    check(sec.has(PROBE) && !sec.has(OTHER_PROBE), `B10 只跑點名的 ${PROBE},沒跑 ${OTHER_PROBE}`, tail(byName.out))
    check(byName.out.includes('SUBSET:1 of 2 suites') && byName.out.includes('1 did not run'), 'B10 總結標明 SUBSET、跑了幾支 / 共幾支、幾支沒跑', tail(byName.out))
    check(byName.out.includes('📊 Coverage:'), 'B10 覆蓋率閉包照跑', tail(byName.out))
    const byPath = runSubset(repo, join(repo, TESTS, PROBE))
    check(sections(byPath.out).has(PROBE) && !sections(byPath.out).has(OTHER_PROBE), 'B10 指進本目錄的路徑也收,一樣只跑那一支', tail(byPath.out))
  }

  // B11 點錯 → 一支都不跑就拒絕
  {
    const repo = makeCopy('b11', { suites: [PROBE], mutate: writeProbe(INTO_TMPDIR) })
    for (const [arg, why] of [['test_no_such_suite.sh', 'no suite named'], ['run-all.sh', 'is not a suite name'], [join(T, PROBE), 'is not in']]) {
      const r = runSubset(repo, arg)
      check(r.status !== 0 && !r.out.includes('▶ Running') && r.out.includes(why), `B11 「${arg}」→ 拒絕(${why}),一支 suite 都沒跑`, tail(r.out))
    }
  }

  // B12 子集照跑靜態閘
  {
    let line = 0
    const repo = makeCopy('b12', { suites: [VICTIM, PROBE], mutate: (r) => { line = unguard(r); writeProbe(INTO_TMPDIR)(r) } })
    const r = runSubset(repo, PROBE)
    check(r.status !== 0 && r.out.includes(`${VICTIM}:${line} TMP`) && !r.out.includes('▶ Running'),
      `B12 只點名 ${PROBE},靜態閘照樣點名 ${VICTIM}:${line} 並整輪不跑`, tail(r.out))
  }

  // B13 子集照跑寫入偵測
  {
    const repo = makeCopy('b13', { suites: [PROBE, OTHER_PROBE], mutate: (r) => { writeProbe(INTO_HOOK_TREE)(r); otherProbe(r) } })
    const r = runSubset(repo, PROBE)
    check(r.status !== 0 && r.out.includes(`FATAL: ${PROBE} ${WROTE}`), `B13 子集裡寫入偵測照樣點名 ${PROBE}`, tail(r.out))
  }

  // B14 覆蓋率閉包不靠外部工具:PATH 最前面放一支必定失敗的 comm
  {
    const brokenBin = join(T, 'broken-comm-bin')
    mkdirSync(brokenBin)
    writeFileSync(join(brokenBin, 'comm'), '#!/bin/sh\necho "comm: /dev/fd/63: Operation not permitted" >&2\nexit 1\n')
    chmodSync(join(brokenBin, 'comm'), 0o755)
    const repo = makeCopy('b14', { suites: [PROBE], mutate: writeProbe(INTO_TMPDIR) })
    writeFileSync(join(state, 'count'), '0')
    writeFileSync(join(state, 'limit'), '1000000')
    const tmp = join(T, 'tmp-b14')
    mkdirSync(tmp, { recursive: true })
    const log = join(T, 'b14.log')
    const fd = openSync(log, 'w')
    const r = spawnSync('bash', ['--', join(repo, TESTS, 'run-all.sh')], {
      cwd: repo,
      stdio: ['ignore', fd, fd, fd],
      env: cleanEnv({ PATH: `${brokenBin}:${bin}:${process.env.PATH}`, TMPDIR: tmp }),
      timeout: 150_000,
    })
    closeSync(fd)
    const out = readFileSync(log, 'utf8')
    check(r.status !== 0 && /Without:\s+[1-9]/.test(out) && /active-hook-test-closure\(\d+ untested\)/.test(out),
      'B14 comm 壞掉時覆蓋率閉包照樣紅,印出沒測試的 hook 數(不是「Without: 0」)', tail(out))
  }
} catch (error) {
  check(false, `meta-test 本身出錯:${error.stack ?? error}`)
} finally {
  rmSync(T, { recursive: true, force: true })
}

if (failures) {
  console.error(`✗ test-hook-test-fixture-guard-invariant:${failures} 項不符`)
  process.exit(1)
}
console.log('✓ test-hook-test-fixture-guard-invariant:靜態閘兩面 + 真實 mktemp 失敗的紅面 / 反向 / 綠面 + 寫入偵測兩半(巢狀 .git、git status)與量具失效 + suite 的 stdin 接 /dev/null(開著的 stdin 不會卡住,拿掉就卡住)+ 子集參數(只跑點名的、點錯就拒絕、靜態閘與寫入偵測照跑)+ 覆蓋率閉包不靠 comm / /dev/fd 全部成立')

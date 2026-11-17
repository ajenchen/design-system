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
 *
 * 假 mktemp 拒絕時往 fd 3 寫一個標記;fd 1 / 2 / 3 是同一個檔,所以標記按時間序落在各 suite 的輸出段落裡,
 * 連把 stderr 丟進 /dev/null 的那一支(test_record_release_consent.sh)也數得到。
 * 允許的呼叫一律自帶模板(與沙箱的 mktemp 替身同一個作法),所以本測試在 macOS 沙箱、Linux CI、拋棄式快照裡結果相同。
 */
import { spawnSync } from 'node:child_process'
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
    return { status: r.status, signal: r.signal, out: readFileSync(log, 'utf8') }
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
    check(r.status !== 0, `B3 run-all 非 0(實得 ${r.status})`, tail(r.out))
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
} catch (error) {
  check(false, `meta-test 本身出錯:${error.stack ?? error}`)
} finally {
  rmSync(T, { recursive: true, force: true })
}

if (failures) {
  console.error(`✗ test-hook-test-fixture-guard-invariant:${failures} 項不符`)
  process.exit(1)
}
console.log('✓ test-hook-test-fixture-guard-invariant:靜態閘兩面 + 真實 mktemp 失敗的紅面 / 反向 / 綠面全部成立')

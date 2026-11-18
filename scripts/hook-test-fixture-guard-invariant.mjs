#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: hook 測試(packages/design-system/ds-canonical/hooks/tests/*.sh)裡每一個 `mktemp -d` 都存進變數,
 *         而且緊接著的下一個敘述就驗「非空、而且是目錄」,驗不過就 exit 整支測試 —— 空字串永遠沒有機會被拿去 cd / git init / rm
 *   紅: 任一處 `mktemp -d` 沒有緊接防護(或防護只驗非空不驗目錄、用 return 不用 exit、驗的是別的變數、
 *       中間夾了別的敘述、結果沒存進變數)→ 指名 檔案:行號 與變數並紅;selftest 每種壞法各一個合成檔,必須逐一被點名
 *   綠: 全部 `mktemp -d` 都有緊接防護時綠;selftest 的合成檔涵蓋 if 區塊、單行 `||`、同一行 `&&` 接續、
 *       函式單行寫法、以及註解 / 字串 / heredoc / 單引號腳本裡的 `mktemp -d` 字樣(不是程式,不算)—— 必須全部放行
 *
 * ── 為什麼有這支 ──
 *
 * `mktemp -d` 失敗時回的是**空字串**(macOS 沙箱裡裸 `mktemp` 不吃 TMPDIR,常態失敗;Linux 在 TMPDIR 不可寫時也一樣)。
 * 空字串接下去的用法全都會落回「目前目錄」—— 而 run-all.sh 已經把目前目錄設成 hook 測試語料本身:
 *   `cd ""`            → 留在原地,之後的 `git init` 就在 repo 樹裡長出巢狀 .git
 *   `git -C "" init`   → 同上(-C 給空字串 = 不切換)
 *   `cd "" && pwd -P`  → 正規化成語料目錄,EXIT trap 的 `rm -rf` 就是刪語料
 * 2026-11-17 與 11-18 各發生一次:直接跑 hooks/tests/*.sh 在 repo 樹裡 git init。
 * 本閘落地前(2026-11-18)hook 測試裡有 89 處 `mktemp -d`,只有 10 處有驗,而且防護寫法各自一套
 *(有的驗了、有的只寫 `|| exit 1`、有的放在兩行之後)。
 *
 * 失敗記憶索引早就寫著「`mktemp -d` 失敗回空,mktemp 後驗非空」—— 規則有、靠人記,記不住。本檔把它機械化,
 * run-all.sh 開頭先跑本閘,沒防護就整輪不跑。另一層(run-all.sh 每支 suite 跑完比對 hooks 樹)直接量
 * 「repo 樹被寫了」這個性質本身,不管原因是不是 mktemp —— 本閘是寫入當下最早的回饋,那一層才是最後判定。
 *
 * ── 判準(為什麼這麼嚴)──
 *
 * 「下一個敘述就是防護」而不是「檔案裡某處有防護」:中間只要夾一個 `trap` / `mkdir` / `cd`,空字串就已經被用掉了。
 * 防護必須同時驗**非空**(`-n` / `-z`)與**是目錄**(`-d`),並且用 `exit`:
 *   只驗非空 —— mktemp 若回了一個不存在的路徑仍會放行;
 *   用 `return` —— 函式回來後呼叫端照樣往下跑,空字串照樣被用。
 * 中間允許空行與註解(test_check_solo_workflow.sh 的寫法:先寫一段說明再驗)。
 *
 * ── 範圍 ──
 *
 * 只管 `mktemp -d`(建 fixture 根目錄的那一種)。檔案型 `mktemp`(擷取 stdout / stderr 用)失敗時,
 * 之後的 `> "$F"` 會直接報錯、寫不出任何東西。2026-11-18 WP-03 反駁複查時全掃:206 處、120 行、59 支檔
 *(量法:對 listHookTestFiles 列出的每支檔,用 maskShellSource 遮掉註解 / 字串 / heredoc 後,
 * 數所有不帶 -d / --directory 旗標的 mktemp 指令),沒有任何一個被拿去當目錄或路徑前綴
 *(`cd "$F"`、`-C "$F"`、`"$F/…"`、`"$F.…"`)。萬一以後有,run-all.sh 的汙染偵測會當場點名。
 * 只看會執行的程式:註解、字串字面(含防護訊息裡的「mktemp -d failed」)、單引號腳本、heredoc 內容都不算。
 *
 * 用法:
 *   node scripts/hook-test-fixture-guard-invariant.mjs              判定(run-all.sh 開頭也跑這一行)
 *   node scripts/hook-test-fixture-guard-invariant.mjs --list       列出每一處 `mktemp -d` 與判定
 *   node scripts/hook-test-fixture-guard-invariant.mjs --json       判定結果(機器讀;meta-test 用它挑要複製的 suite)
 *   node scripts/hook-test-fixture-guard-invariant.mjs --selftest   對照組(合成檔逐一驗紅綠)
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const HOOK_TEST_DIR = 'packages/design-system/ds-canonical/hooks/tests'

// ── 1. 把原始碼遮成「只剩會執行的程式」──────────────────────────────────────────
// 輸出與原文等長、換行位置不變;字面內容換成空白。保留:程式字元、引號本身、雙引號裡的 `$VAR` / `${…}` / `$(…)`。
// 這樣後面的比對可以直接拿遮罩後的位移換回原文的行號。
export function maskShellSource(source) {
  const out = source.split('')
  const blank = (i) => { if (out[i] !== '\n') out[i] = ' ' }
  const stack = ['code'] // code | dq | cmd(深度在 depth 陣列)| bt
  const depth = []
  const pendingHeredocs = []
  const isWordStart = (i) => i === 0 || /[\s;&|()]/.test(source[i - 1])
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const top = stack[stack.length - 1]
    if (top === 'code' || top === 'cmd' || top === 'bt') {
      if (ch === '\n') {
        if (pendingHeredocs.length && top === 'code') {
          // heredoc 內容:一直遮到終止行
          let j = i + 1
          while (pendingHeredocs.length && j < source.length) {
            const { word, strip } = pendingHeredocs[0]
            const end = source.indexOf('\n', j)
            const lineEnd = end < 0 ? source.length : end
            const line = source.slice(j, lineEnd)
            const candidate = strip ? line.replace(/^\t+/, '') : line
            for (let k = j; k < lineEnd; k++) blank(k)
            if (candidate === word) pendingHeredocs.shift()
            j = lineEnd + 1
          }
          i = j
          continue
        }
        i++; continue
      }
      if (ch === '\\') { i += 2; continue }
      if (ch === '#' && isWordStart(i)) {
        const end = source.indexOf('\n', i)
        const stop = end < 0 ? source.length : end
        for (let k = i; k < stop; k++) blank(k)
        i = stop; continue
      }
      if (ch === "'") {
        const ansi = i > 0 && source[i - 1] === '$'
        let j = i + 1
        while (j < source.length && source[j] !== "'") { if (ansi && source[j] === '\\') { blank(j); j++ } blank(j); j++ }
        i = j + 1; continue
      }
      if (ch === '"') { stack.push('dq'); i++; continue }
      if (ch === '`') {
        if (top === 'bt') { stack.pop(); i++; continue }
        stack.push('bt'); i++; continue
      }
      if (ch === '$' && source[i + 1] === '(') { stack.push('cmd'); depth.push(0); i += 2; continue }
      if (top === 'cmd' && ch === '(') { depth[depth.length - 1]++; i++; continue }
      if (top === 'cmd' && ch === ')') {
        if (depth[depth.length - 1] === 0) { stack.pop(); depth.pop() } else depth[depth.length - 1]--
        i++; continue
      }
      if (ch === '<' && source[i + 1] === '<' && source[i + 2] !== '<') {
        const m = /^<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(source.slice(i))
        if (m) { pendingHeredocs.push({ word: m[3], strip: m[1] === '-' }); i += m[0].length; continue }
      }
      i++; continue
    }
    if (top === 'dq') {
      if (ch === '"') { stack.pop(); i++; continue }
      if (ch === '\\') { blank(i); blank(i + 1); i += 2; continue }
      if (ch === '$' && source[i + 1] === '(') { stack.push('cmd'); depth.push(0); i += 2; continue }
      if (ch === '`') { stack.push('bt'); i++; continue }
      if (ch === '$' && source[i + 1] === '{') {
        const close = source.indexOf('}', i)
        i = close < 0 ? source.length : close + 1; continue
      }
      if (ch === '$' && /[A-Za-z_]/.test(source[i + 1] ?? '')) {
        let j = i + 1
        while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++
        i = j; continue
      }
      blank(i); i++; continue
    }
  }
  return out.join('')
}

// ── 2. 找出每一個 `mktemp -d` 與它緊接的下一個敘述 ─────────────────────────────
const DIR_FLAG = /^(?:--directory|-[A-Za-z]*d[A-Za-z]*)$/
const lineOf = (text, offset) => text.slice(0, offset).split('\n').length
const escapeName = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function closeOfSubstitution(masked, openAt) {
  // openAt 指向 `$(` 的 `$`;回傳對應 `)` 之後的位移
  let d = 0
  for (let i = openAt + 2; i < masked.length; i++) {
    if (masked[i] === '(') d++
    else if (masked[i] === ')') { if (d === 0) return i + 1; d-- }
  }
  return masked.length
}

/**
 * 從 offset 起讀一個敘述,回傳 [起, 迄) 位移:`if` 讀到對應的 `fi`;其他讀到深度 0 的 `;` / 換行
 *(反斜線續行與未閉合的 `{` 會延長)。回傳位移而不是字串,錯誤訊息才能引原文(遮罩後的字串字面是空白)。
 */
function readStatement(masked, offset) {
  let i = offset
  while (i < masked.length && /[ \t]/.test(masked[i])) i++
  const start = i
  if (/^if\b/.test(masked.slice(start))) {
    let nest = 0
    const word = /\b(if|fi)\b/g
    word.lastIndex = start
    let m
    while ((m = word.exec(masked))) {
      const before = masked[m.index - 1]
      if (m.index > 0 && before && !/[\s;&|()]/.test(before)) continue
      if (m[1] === 'if') nest++
      else if (--nest === 0) return [start, m.index + 2]
    }
    return [start, masked.length]
  }
  let brace = 0
  let paren = 0
  for (; i < masked.length; i++) {
    const ch = masked[i]
    if (ch === '\\' && masked[i + 1] === '\n') { i++; continue }
    // `${VAR:-x}` 的大括號不是指令群組;不跳過的話防護訊息裡的 `${TMPDIR:-unset}` 會把 `{ …; exit 1; }` 提早關掉
    if (ch === '$' && masked[i + 1] === '{') {
      const close = masked.indexOf('}', i)
      if (close < 0) break
      i = close
      continue
    }
    if (ch === '{' && /[\s;&|]/.test(masked[i - 1] ?? ' ')) brace++
    else if (ch === '}' && brace > 0) brace--
    else if (ch === '(') paren++
    else if (ch === ')' && paren > 0) paren--
    else if ((ch === ';' || ch === '\n') && brace === 0 && paren === 0) {
      // `||` / `&&` 接在下一行開頭的寫法不存在於本 repo;換行即敘述結束
      return [start, i]
    }
  }
  return [start, masked.length]
}

/** 跳過空白、`;`、空行與(已被遮成空白的)註解行,回傳下一個敘述的起點。 */
function nextStatementStart(masked, offset) {
  let i = offset
  for (;;) {
    while (i < masked.length && /[ \t]/.test(masked[i])) i++
    if (masked[i] === ';' && masked[i + 1] !== ';') { i++; continue }
    if (masked[i] === '\\' && masked[i + 1] === '\n') { i += 2; continue }
    if (masked[i] === '\n') { i++; continue }
    return i
  }
}

/**
 * 防護驗不過時真的會結束整支測試嗎:要有一個**不在子 shell 裡**的 `exit <非 0>`。
 *   `( …; exit 1 )` / `$( … exit 1 )` 只結束子 shell,測試照樣帶著空字串往下跑;
 *   `exit` / `exit 0` 讓「沒有 fixture」被記成通過。
 */
function exitsWholeSuite(statement) {
  let depth = 0
  for (let i = 0; i < statement.length; i++) {
    const ch = statement[i]
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && /^exit\s+[1-9]/.test(statement.slice(i)) && /(^|[\s;&|{])$/.test(statement.slice(0, i))) return true
  }
  return false
}

export function isFixtureGuard(statement, name) {
  const v = escapeName(name)
  const ref = `"?(?:\\$${v}\\b|\\$\\{${v}(?::-[^}]*)?\\})"?`
  const empty = new RegExp(`-[nz]\\s+${ref}`)
  const dir = new RegExp(`-d\\s+${ref}`)
  return empty.test(statement) && dir.test(statement) && exitsWholeSuite(statement)
}

export function scanSource(source, file = '<source>') {
  const masked = maskShellSource(source)
  const sites = []
  const re = /(^|[^\w.-])mktemp(?=[\s);&|`]|$)/g
  let m
  while ((m = re.exec(masked))) {
    const at = m.index + m[1].length
    const argsEnd = masked.slice(at + 6).search(/[);&|`\n]/)
    const args = masked.slice(at + 6, argsEnd < 0 ? masked.length : at + 6 + argsEnd).trim().split(/\s+/).filter(Boolean)
    if (!args.some(a => DIR_FLAG.test(a))) continue
    const line = lineOf(masked, at)
    const lineStart = masked.lastIndexOf('\n', at - 1) + 1
    const before = masked.slice(lineStart, at)
    const assign = /(?:^|[\s;&|({])(?:(?:local|export|readonly|declare(?:\s+-[A-Za-z]+)*)\s+)?([A-Za-z_][A-Za-z0-9_]*)=\s*"?\s*(\$\(|`)\s*$/.exec(before)
    if (!assign) {
      sites.push({ file, line, variable: null, guarded: false, reason: 'mktemp -d 的結果沒有存進變數 —— 無從在使用前驗證' })
      continue
    }
    const variable = assign[1]
    let after
    if (assign[2] === '$(') {
      const open = lineStart + before.lastIndexOf('$(')
      after = closeOfSubstitution(masked, open)
    } else {
      const close = masked.indexOf('`', at)
      after = close < 0 ? masked.length : close + 1
    }
    if (masked[after] === '"') after++
    // 同一行用 `&&` / `||` 直接接防護:把那串當成防護敘述本身
    const tail = readStatement(masked, after)
    const span = /^\s*(?:&&|\|\|)/.test(masked.slice(...tail)) ? tail : readStatement(masked, nextStatementStart(masked, after))
    const guard = masked.slice(...span)
    const guarded = isFixtureGuard(guard, variable)
    sites.push({
      file,
      line,
      variable,
      guarded,
      reason: guarded ? null : describeMissingGuard(guard, variable, source.slice(...span)),
    })
  }
  return sites
}

function describeMissingGuard(statement, name, original) {
  const v = escapeName(name)
  const ref = `"?(?:\\$${v}\\b|\\$\\{${v}(?::-[^}]*)?\\})"?`
  const hasEmpty = new RegExp(`-[nz]\\s+${ref}`).test(statement)
  const hasDir = new RegExp(`-d\\s+${ref}`).test(statement)
  const first = original.split('\n')[0].trim().slice(0, 80) || '(檔尾)'
  if (!hasEmpty && !hasDir) return `下一個敘述不是 ${name} 的防護(是:${first})`
  if (!hasEmpty) return `防護沒有驗 ${name} 非空(-n / -z)`
  if (!hasDir) return `防護沒有驗 ${name} 是目錄(-d)`
  return '防護驗不過時沒有結束整支測試(要 exit <非 0>;return 只離開函式、子 shell 裡的 exit 只離開子 shell、exit 0 會被記成通過)'
}

export function listHookTestFiles(testDir) {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      const info = statSync(full)
      if (info.isDirectory()) { if (name !== 'fixtures' && name !== 'node_modules' && name !== '.git') walk(full) }
      else if (name.endsWith('.sh')) out.push(full)
    }
  }
  walk(testDir)
  return out
}

export function scanHookTests(root = ROOT, testDir = join(root, HOOK_TEST_DIR)) {
  const sites = []
  for (const full of listHookTestFiles(testDir)) {
    sites.push(...scanSource(readFileSync(full, 'utf8'), relative(root, full)))
  }
  return sites
}

function report(sites) {
  const bad = sites.filter(s => !s.guarded)
  const files = new Set(sites.map(s => s.file))
  if (bad.length === 0) {
    console.log(`✓ hook-test-fixture-guard:${sites.length} 處 mktemp -d(${files.size} 支檔)全部緊接防護`)
    return 0
  }
  console.error(`✗ hook-test-fixture-guard:${bad.length} / ${sites.length} 處 mktemp -d 沒有緊接防護(${new Set(bad.map(s => s.file)).size} 支檔)`)
  for (const s of bad) console.error(`  ${s.file}:${s.line}${s.variable ? ` ${s.variable}` : ''} —— ${s.reason}`)
  console.error('  緊接在 mktemp -d 之後加(寫在函式裡也一樣用 exit):')
  console.error('    [ -n "${VAR:-}" ] && [ -d "$VAR" ] || { echo "❌ mktemp -d failed(VAR;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }')
  return 1
}

// ── 3. 對照組 ───────────────────────────────────────────────────────────────
const GUARD = (v) => `[ -n "\${${v}:-}" ] && [ -d "$${v}" ] || { echo "❌ mktemp -d failed(${v});fixture unavailable" >&2; exit 1; }`
const SELFTEST_CASES = [
  // 放行(green):各種合法的防護寫法 + 不是程式的 mktemp -d 字樣
  { name: 'green-if-block.sh', expect: [], source: [
    '#!/bin/bash', 'TMP_DIR=$(mktemp -d)', '# A failed mktemp leaves TMP_DIR empty.', '',
    'if [ -z "${TMP_DIR:-}" ] || [ ! -d "$TMP_DIR" ]; then', '  echo "❌ mktemp -d failed" >&2', '  exit 1', 'fi', 'cd "$TMP_DIR"'] },
  { name: 'green-one-line.sh', expect: [], source: ['#!/bin/bash', 'FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/x.XXXXXX" 2>/dev/null || true)"', GUARD('FIXTURE'), 'git -C "$FIXTURE" init -q'] },
  { name: 'green-same-line-chain.sh', expect: [], source: ['#!/bin/bash', 'FAULT_DIR=$(mktemp -d "${TMPDIR:-/tmp}/t.XXXXXX") && [ -n "$FAULT_DIR" ] && [ -d "$FAULT_DIR" ] \\', '  || { echo "SUB-FAIL: mktemp -d failed"; exit 1; }'] },
  { name: 'green-function-one-liner.sh', expect: [], source: ['#!/bin/bash', `setup() { TMP=$(mktemp -d); ${GUARD('TMP')}; mkdir -p "$TMP/.claude/hooks"; }`, 'setup'] },
  { name: 'green-local-and-dt.sh', expect: [], source: ['#!/bin/bash', 'make() {', '  local D=$(mktemp -dt fixture)', `  ${GUARD('D')}`, '  echo "$D"', '}'] },
  { name: 'green-not-code.sh', expect: [], source: [
    '#!/bin/bash', '# TMP=$(mktemp -d) 只是註解', 'echo "❌ mktemp -d failed(TMPDIR=${TMPDIR:-unset})"',
    "awk '", '  /x/ { system("mktemp -d") }', "'", 'cat > "$OUT" <<\'EOF\'', 'X=$(mktemp -d)', 'cd "$X"', 'EOF',
    'STDOUT=$(mktemp); STDERR=$(mktemp)'] },
  // 必紅(red):每一種壞法一個檔,必須指名到那一行與變數
  { name: 'red-unguarded.sh', expect: [[2, 'TMP_DIR']], source: ['#!/bin/bash', 'TMP_DIR=$(mktemp -d)', 'trap \'rm -rf "$TMP_DIR"\' EXIT', 'git -C "$TMP_DIR" init -q'] },
  { name: 'red-only-nonempty.sh', expect: [[2, 'TMP']], source: ['#!/bin/bash', 'TMP=$(mktemp -d)', '[ -n "$TMP" ] || exit 1'] },
  { name: 'red-return-in-function.sh', expect: [[3, 'TMP']], source: ['#!/bin/bash', 'setup() {', '  TMP=$(mktemp -d)', '  [ -n "$TMP" ] && [ -d "$TMP" ] || return 1', '}'] },
  { name: 'red-subshell-exit.sh', expect: [[2, 'TMP']], source: ['#!/bin/bash', 'TMP=$(mktemp -d)', '[ -n "$TMP" ] && [ -d "$TMP" ] || ( echo "mktemp -d failed" >&2; exit 1 )', 'cd "$TMP"'] },
  { name: 'red-exit-zero.sh', expect: [[2, 'TMP']], source: ['#!/bin/bash', 'TMP=$(mktemp -d)', 'if [ -z "$TMP" ] || [ ! -d "$TMP" ]; then echo "skip"; exit 0; fi'] },
  { name: 'red-bare-exit.sh', expect: [[2, 'TMP']], source: ['#!/bin/bash', 'TMP=$(mktemp -d)', '[ -n "$TMP" ] && [ -d "$TMP" ] || { echo "no fixture"; exit; }'] },
  // A 的下一個敘述是 B 的 mktemp(兩個一起建、再一起驗 = A 在被驗之前就已經可以被用掉);B 的下一個敘述驗的是 A
  { name: 'red-other-variable.sh', expect: [[2, 'A'], [3, 'B']], source: ['#!/bin/bash', 'A=$(mktemp -d)', 'B=$(mktemp -d)', GUARD('A'), GUARD('B')] },
  { name: 'red-statement-in-between.sh', expect: [[2, 'TMP']], source: ['#!/bin/bash', 'TMP=$(mktemp -d)', 'mkdir -p "$TMP/x"', GUARD('TMP')] },
  { name: 'red-cd-or-exit.sh', expect: [[2, 'TMP_PROJ']], source: ['#!/bin/bash', 'TMP_PROJ=$(mktemp -d)', 'cd "$TMP_PROJ" || exit 1', 'git init --quiet'] },
  { name: 'red-inline-next-command.sh', expect: [[2, 'TMP']], source: ['#!/bin/bash', 'TMP=$(mktemp -d); mkdir -p "$TMP/packages"'] },
  { name: 'red-unassigned.sh', expect: [[2, null]], source: ['#!/bin/bash', 'cd "$(mktemp -d)" && git init -q'] },
  { name: 'red-local-combined-flag.sh', expect: [[3, 'D']], source: ['#!/bin/bash', 'f() {', '  local D=$(mktemp -qd)', '  touch "$D/x"', '}'] },
]

function selftest() {
  const dir = mkdtempSync(join(tmpdir(), 'hook-test-fixture-guard-selftest-'))
  let failures = 0
  try {
    for (const c of SELFTEST_CASES) writeFileSync(join(dir, c.name), `${c.source.join('\n')}\n`)
    const sites = scanHookTests(dir, dir)
    for (const c of SELFTEST_CASES) {
      const got = sites.filter(s => s.file === c.name && !s.guarded).map(s => [s.line, s.variable])
      const ok = JSON.stringify(got) === JSON.stringify(c.expect)
      const counted = sites.filter(s => s.file === c.name).length
      if (!ok) failures++
      console.log(`${ok ? '✓' : '✗'} ${c.name}:期望 ${JSON.stringify(c.expect)},實得 ${JSON.stringify(got)}(本檔計到 ${counted} 處 mktemp -d)`)
    }
    // 不是程式的那一檔:一處都不能算進來(否則「綠」可能只是因為它把字串當成有防護的程式)
    const notCode = sites.filter(s => s.file === 'green-not-code.sh').length
    if (notCode !== 0) { failures++; console.log(`✗ green-not-code.sh 計到 ${notCode} 處,期望 0`) }
    // 整體判定也必須紅:只看單檔會被「判定函式對、但 report 沒把它算進結束碼」矇過去
    const exitCode = report(sites)
    if (exitCode !== 1) { failures++; console.log('✗ 合成語料整體判定沒有紅') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  if (failures) {
    console.error(`✗ selftest:${failures} 項不符 —— 量具不可信`)
    return 1
  }
  console.log('✓ selftest:每一種壞法都被指名,每一種合法寫法都放行')
  return 0
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest())
  const sites = scanHookTests()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ root: ROOT, sites }, null, 2))
    process.exit(sites.every(s => s.guarded) ? 0 : 1)
  }
  if (process.argv.includes('--list')) {
    for (const s of sites) console.log(`${s.guarded ? 'ok  ' : 'MISS'} ${s.file}:${s.line} ${s.variable ?? '(未存進變數)'}${s.reason ? ` —— ${s.reason}` : ''}`)
  }
  process.exit(report(sites))
}

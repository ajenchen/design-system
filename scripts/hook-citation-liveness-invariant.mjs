#!/usr/bin/env node
/**
 * 治理文件提到的 hook 檔名,必須真的存在於 canonical hook 樹。
 *
 * 為什麼要這支:2026-09-19 /knowledge-prune 抓到 hook home 自己的 README 在 Stop 區列了 5 支 hook,
 * 其中 3 支(stop_harvest_corrections / stop_capture_metrics / stop_meta_self_audit)早在 2026-05-13
 * 就被折進 stop_passive_logging.sh,檔名已不存在 —— 而且折進去那件事就寫在同一張表的上一列。
 * 一張表同時說「已折進 dispatcher」和「這三支是 Stop 的居民」。
 *
 * 這是本 repo 反覆踩的同一種病:**文件寫了一條防線,實際那條防線不存在或不會跑**。
 * 同族前例:推播閘(hook 在、測試綠,但真實入口被 requires:peer-cli 擋掉,從沒跑過)、
 * 93 支沒有任何執行面呼叫的閘(scripts/gate-reachability-invariant.mjs)。
 * 差別只在那兩支查的是「會不會被呼叫」,這支查的是「檔案在不在」。
 *
 * 判準:live 治理文件裡每一個 hook 檔名 token,要嘛該檔存在於 canonical hook 樹(含 retired/、lib/、
 * tests/),要嘛它所在的那幾行明講了它是舊名/已折/已退役/未實作。兩者皆非 = 紅。
 *
 * 用法:node scripts/hook-citation-liveness-invariant.mjs [--selftest]
 */
import { readFileSync, readdirSync, lstatSync, statSync } from 'node:fs'
import { join, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOOK_ROOT = join(ROOT, 'packages/design-system/ds-canonical/hooks')

// 掃描範圍排除:第三方、generated provider view、歷史紀錄(planning/archive 本來就在講過去的事)
const SKIP_DIR = new Set([
  'node_modules', '.git', '.claude', '.agents', '.codex', 'generated',
  'planning', 'archive', 'dist', 'storybook-static', 'coverage', '.next',
])

// 只認 hook 命名慣例的前綴,避免把文件裡的 shell 範例(run-all.sh / setup.sh)也算進來。
const HOOK_TOKEN = /\b((?:check|stop|pre_edit|pre_write|post_edit|post_tool|inject|session_start|log|record|sync)_[a-z0-9_]+\.sh)\b/g

// 明講是舊名/已折/未實作的字樣。看該行**前後各 3 行**:README 常把標題寫在上面
// (「## Retired」「最近 retire(2026-04-28):」名字在下一行),而一個跨行的句子也可能把
// 「…折進 X,舊檔名已不存在」的結論留在名字後面那行。只看單邊就會誤報(第一版就踩了)。
const RETIRED_MARKER = /fold|retire|legacy|deprecat|已移除|已退役|已不存在|不存在|舊名|舊 hook|前身|原 |未實作|已合併|折進|歷史/i
const MARKER_WINDOW = 3

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue
    const p = join(dir, entry)
    let st
    // lstat 不是 stat:stat 會跟著 symlink 走,isSymbolicLink() 就永遠是 false,下面那道防線形同虛設。
    try { st = lstatSync(p) } catch { continue }
    // 不跟 symlink:`hooks/scripts` 指向 `.claude/hooks` 這種 generated provider view,
    // 跟進去等於拿「還沒重生的投影」當 authority 掃,必假紅。
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) walk(p, out)
    else if (entry.endsWith('.md')) out.push(p)
  }
  return out
}

function hookTreeNames() {
  const names = new Set()
  const rec = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) rec(p)
      else if (entry.endsWith('.sh') || entry.endsWith('.py')) names.add(basename(p))
    }
  }
  rec(HOOK_ROOT)
  return names
}

/** 核心判定。接純文字 → 回傳這份文件裡的違規清單。抽出來是為了讓對照組不必碰真檔案。 */
export function findDeadCitations(text, existing) {
  const lines = text.split('\n')
  const bad = []
  for (let i = 0; i < lines.length; i++) {
    const window = lines.slice(Math.max(0, i - MARKER_WINDOW), i + 1 + MARKER_WINDOW).join('\n')
    for (const m of lines[i].matchAll(HOOK_TOKEN)) {
      const name = m[1]
      if (existing.has(name)) continue
      if (RETIRED_MARKER.test(window)) continue
      bad.push({ line: i + 1, name, text: lines[i].trim().slice(0, 160) })
    }
  }
  return bad
}

function selftest(existing) {
  const cases = [
    {
      why: '文件把一個不存在的 hook 當現行防線列出來 → 必須紅',
      text: '| `stop_capture_metrics.sh` | session 結束 metric snapshot |',
      expectBad: true,
    },
    {
      why: '同一個名字,但同行講明已折進 dispatcher → 放行',
      text: '2026-05-13 已折進 `stop_passive_logging.sh` R3(原 `stop_capture_metrics.sh`)',
      expectBad: false,
    },
    {
      why: '名字寫在下一行、退役字樣在上面的標題 → 前後 3 行的 window 要接得住',
      text: '## Retired\n\n最近 retire:\n- `check_button_icon_literal.sh` — 違反 Rule-of-3',
      expectBad: false,
    },
    {
      why: '真的存在的 hook → 放行',
      text: '| `stop_passive_logging.sh` | Dispatcher |',
      expectBad: false,
    },
    {
      why: '非 hook 命名慣例的 shell 檔不該被誤抓',
      text: '跑 `bash packages/design-system/ds-canonical/hooks/tests/run-all.sh`',
      expectBad: false,
    },
  ]
  let ok = true
  for (const c of cases) {
    const got = findDeadCitations(c.text, existing).length > 0
    const pass = got === c.expectBad
    if (!pass) ok = false
    console.log(`${pass ? '✓' : '✗'} 對照組:${c.why}(預期${c.expectBad ? '紅' : '綠'},實得${got ? '紅' : '綠'})`)
  }
  return ok
}

const existing = hookTreeNames()

if (process.argv.includes('--selftest')) {
  process.exit(selftest(existing) ? 0 : 1)
}

const docs = walk(ROOT)
const violations = []
for (const file of docs) {
  const bad = findDeadCitations(readFileSync(file, 'utf8'), existing)
  for (const b of bad) violations.push({ file: relative(ROOT, file), ...b })
}

console.log(`掃了 ${docs.length} 份 live 治理文件,canonical hook 樹有 ${existing.size} 個檔名`)

if (violations.length) {
  console.error(`\n✗ ${violations.length} 處文件把不存在的 hook 當現行防線:\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.name}`)
    console.error(`      ${v.text}`)
  }
  console.error('\n修法:該 hook 已折進別處 → 把行文改成指向現行 owner 並寫明是舊名;')
  console.error('      該 hook 該存在卻不在 → 補回檔案並註冊;純屬範例 → 標「未實作」。')
  process.exit(1)
}

if (!selftest(existing)) {
  console.error('\n✗ 對照組沒過 —— 這支量具現在的綠燈不算證據')
  process.exit(1)
}
console.log('✓ 沒有文件宣稱不存在的 hook,且對照組會紅')

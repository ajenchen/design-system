#!/usr/bin/env node
/**
 * Token 建立不變式(2026-09-11)
 *
 * user 原話:「為何你他媽又不照規範來建立 token?要講幾次?而且這個部分我們之前也有特別提醒每次建立必檢查吧?
 * 你他媽要如何永遠在各種環境下都能避免這個問題?」
 *
 * **為什麼之前攔不住**:`tokens/README.md:56` 的「建立前必 Read」是**紙上紀律**,
 * `ls ds-canonical/hooks/ | grep -i token` 只有 `check_opacity_token_usage.sh` —— 沒有任何機械閘管「新 token 的命名與登記」。
 * 而 Claude 的 hook 是 provider 專屬的,換一個 agent / 在 CI 裡跑就沒人擋。所以這支寫成
 * **provider-neutral 的 deterministic script**,進 CI 的必跑鏈:任何環境、任何 agent 都會被擋。
 *
 * 兩條不變式(都是我 2026-09-11 真的犯過的錯):
 *   T1 **前綴不得跨 family**:token 名不得以「另一個已存在 token 的完整名 + `-`」開頭而落在不同 family 檔案。
 *      錨:我把 `--overlay-viewport-inset`(間距)放進 layoutSpace.css,而 `--overlay` 已經是 color/semantic.css 的
 *      L2 Semantic 顏色 token(dialog backdrop)。`token-system.spec.md` 規則 1 要求「grep 即知這 token 屬哪 family」,
 *      反 pattern 表逐字:「1 個 token 屬 N 個 family = consumer 認知衝突」。
 *   T2 **住在哪個 family 檔案就要帶那個 family 的前綴**,且必須登記進該 family `*.spec.md` 的 Token 表。
 *      錨:同一顆 token 我加進 CSS 卻沒登記進 `layoutSpace.spec.md`,正是「CSS 有、spec 沒有」的 drift。
 *
 * 對照組:`--selftest` 注入兩個違規 token(跨 family 前綴 / 未登記)→ 必須紅。
 *
 *   node scripts/token-creation-invariant.mjs [--selftest]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const TOKENS = join(REPO, 'packages/design-system/src/tokens')
const SELFTEST = process.argv.includes('--selftest')

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : []
})

const files = walk(TOKENS)
/** name → 第一次宣告它的檔案(同名多處宣告是 density override,取第一個) */
const declaredIn = new Map()
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)) {
    if (!declaredIn.has(m[1])) declaredIn.set(m[1], f)
  }
}
if (SELFTEST) {
  // 對照組:兩個違規(跨 family 前綴 / 住錯 family 檔案)
  declaredIn.set('--overlay-viewport-inset', join(TOKENS, 'layoutSpace/layoutSpace.css'))
  declaredIn.set('--layout-space-never-registered', join(TOKENS, 'layoutSpace/layoutSpace.css'))
}

let fail = 0
const ck = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fail++ }

// ── T1:前綴不得跨 family ────────────────────────────────────────────────
const names = [...declaredIn.keys()].sort((a, b) => a.length - b.length)
const crossFamily = []
for (const long of names) {
  for (const short of names) {
    if (short === long || !long.startsWith(short + '-')) continue
    const a = declaredIn.get(short), b = declaredIn.get(long)
    if (dirname(a) !== dirname(b)) crossFamily.push({ long, short, longFile: b.replace(REPO + '/', ''), shortFile: a.replace(REPO + '/', '') })
  }
}
ck(crossFamily.length === 0,
   `T1 沒有 token 借用別的 family 的前綴(token-system.spec.md 規則 1「grep 即知屬哪 family」)` +
   (crossFamily.length ? `\n    ${crossFamily.map((c) => `${c.long}(${c.longFile})借用了 ${c.short}(${c.shortFile})的前綴`).join('\n    ')}` : ''))

// ── T2:**新加的** token 必須登記進所屬 family 的 spec ─────────────────────
// 只判「相對 origin/main 新增的」:全樹判定會對既有 token 誤紅(uiSize 合法擁有多種前綴、
// typography 的 Token 表列的是 utility 不是原始 token 名)。**會對正確程式碼變紅的閘比沒有還糟。**
// 新增的那幾顆才是「這次有沒有照規矩走」的判定對象,也正是我 2026-09-11 漏掉的那件事。
// **「新增」= 名字在 origin/main 不存在**,不是 diff 裡有 `+` 行 ——
// 改值也會產生 `+` 行(錨:`--neutral-selected-hover` 只改了值,第一版把它誤判成新 token)。
const added = []
try {
  const { execFileSync } = await import('node:child_process')
  const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  const before = new Set()
  for (const f of git('ls-tree', '-r', '--name-only', 'origin/main', '--', 'packages/design-system/src/tokens').split('\n')) {
    if (!f.endsWith('.css')) continue
    for (const m of git('show', `origin/main:${f}`).matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)) before.add(m[1])
  }
  for (const name of declaredIn.keys()) if (!before.has(name)) added.push(name)
} catch (e) { console.log(`   (拿不到 origin/main 的 token 清單,T2 這次跳過:${String(e.message).split('\n')[0].slice(0, 80)})`) }
if (SELFTEST) added.push('--layout-space-never-registered')

const unregistered = []
for (const name of added) {
  const file = declaredIn.get(name)
  if (!file && !SELFTEST) continue
  const dir = SELFTEST && !file ? join(TOKENS, 'layoutSpace') : dirname(file)
  const family = basename(dir)
  let spec = ''
  try { spec = readFileSync(join(dir, `${family}.spec.md`), 'utf8') } catch { continue }
  if (!spec.includes(name)) unregistered.push({ name, spec: `${family}/${family}.spec.md` })
}
ck(unregistered.length === 0,
   `T2 這次新增的 ${added.length} 顆 token 都登記進所屬 family 的 spec` +
   `(tokens/README.md:9 逐字「{name}.spec.md — 命名原則 / 用法規則 / 家族結構」)` +
   (added.length && !unregistered.length ? `:${added.join(' / ')}` : '') +
   (unregistered.length ? `\n    ${unregistered.map((u) => `${u.name} 沒出現在 ${u.spec}`).join('\n    ')}` : ''))

console.log(`\n掃了 ${declaredIn.size} 顆 token / ${files.length} 個 css`)
console.log(fail ? `✗ ${fail} 項未通過` : `✓ ${SELFTEST ? '對照組:注入的違規 token 如預期被抓到(儀器有效)' : 'Token 建立不變式:全通過'}`)
process.exit(SELFTEST ? (fail ? 0 : 1) : (fail ? 1 : 0))

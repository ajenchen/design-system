#!/usr/bin/env node
// check-dangling-infra-ref.mjs — infra-self integrity lint(2026-05-30 ship per user「讓 deep-audit 真正含所有 infra」)
//
// Why: 2026-05-30 session 抓出 13 處 check_token_hygiene.sh 死引用 + env-smoke set-e bug,
// 都是「doc 引用的 hook/script 在磁碟上不存在 / 名字改了沒同步」這類 infra-self drift,
// 而沒有任何機械防線抓(M7/M34 broad-vs-narrow gap)。本 lint = deep-audit Group Q dim 的執行 SSOT。
//
// 掃 governance docs 引用的 hook/script/path 名,assert 每個 target 存在磁碟 OR 同行有 retired/未實作 標註。
// 3-bucket: A=annotated-retired(OK) / B=dangling-LIVE(FAIL,--check exit 1) / C=path-deadref。
// Usage: node scripts/check-dangling-infra-ref.mjs [--check]
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')

// ── scan scope(live governance docs;排除 mirror / 歷史凍結檔)──
const SCAN_DIRS = ['.claude/skills', '.claude/rules', '.claude/references', '.claude/commands']
const SCAN_FILES = ['CLAUDE.md', 'packages/design-system/CLAUDE.md', '.claude/settings.json', '.claude/settings.local.json']
const EXCLUDE = /ds-canonical|\/planning\/|\/scratch\/|\/retired\/|\/tmp\/|node_modules/

// ── annotation = 同行標明「此 ref 故意不對應 live 檔」──
const ANNOTATED = /retired|未實作|planned|待\s*ship|deprecated|mindset enforcement|@[a-z-]+-skip|@[a-z-]+-allow|folded|rename →|範例|example|e\.g\.|不存在/i

// ── infra name patterns(hook / script)──
const HOOK_RE = /\b((?:check|stop|inject|pre_edit|post_edit|enforce|auto_regen|block)_[a-z0-9_]+\.(?:sh|py))\b/g
const MJS_RE = /\b([a-z0-9][a-z0-9-]*\.mjs)\b/g

// ── where a referenced name could legitimately live on disk ──
// 含 hook-consolidation lib form:`check_X.sh`/`stop_X.sh` 的 logic 常被搬成 `_X.sh`
// lib helper(被 post_edit_dispatcher / chrome_header_dispatcher source,降 hook count),
// 跟 `check_token_hygiene→_token_hygiene` 同 pattern。視 lib form 為 live(functionally 存在)。
function resolvesOnDisk(name) {
  const variants = [name]
  const libForm = name.replace(/^(?:check|stop|inject|pre_edit|post_edit|enforce|auto_regen|block)_/, '_')
  if (libForm !== name) variants.push(libForm)
  const dirs = name.endsWith('.mjs')
    ? ['scripts', '.claude/hooks', '.']
    : ['.claude/hooks', '.claude/hooks/lib', '.claude/hooks/tests', 'hooks/scripts', '.']
  return variants.some((v) => dirs.some((d) => existsSync(join(ROOT, d, v))))
}

function walk(dir, acc) {
  let ents
  try { ents = readdirSync(join(ROOT, dir), { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    const rel = `${dir}/${e.name}`
    if (EXCLUDE.test(rel)) continue
    if (e.isDirectory()) walk(rel, acc)
    else if (/\.(md|json)$/.test(e.name)) acc.push(rel)
  }
}

const files = []
for (const d of SCAN_DIRS) walk(d, files)
for (const f of SCAN_FILES) if (existsSync(join(ROOT, f))) files.push(f)

const bucketB = [] // dangling-live(no annotation)= FAIL
const bucketA = [] // annotated-retired = disclosed OK
const seen = new Set()

for (const f of files) {
  let lines
  try { lines = readFileSync(join(ROOT, f), 'utf8').split('\n') } catch { continue }
  lines.forEach((line, i) => {
    const refs = [...line.matchAll(HOOK_RE), ...line.matchAll(MJS_RE)].map((m) => m[1])
    for (const name of refs) {
      // skip self-evidently-non-infra mjs(config / vendor)
      if (name.endsWith('.mjs') && !/^(check|sync|audit|dispatch|verify|build|setup|test|deploy|create|lint|score|extract|compose|dogfood|plugin)/.test(name)) continue
      if (resolvesOnDisk(name)) continue
      const key = `${f}:${i + 1}:${name}`
      if (seen.has(key)) continue
      seen.add(key)
      const entry = { file: f, line: i + 1, name, text: line.trim().slice(0, 120) }
      if (ANNOTATED.test(line)) bucketA.push(entry)
      else bucketB.push(entry)
    }
  })
}

console.log('═══════════════════════════════════════════════════')
console.log('▶ Infra-ref integrity(dangling hook/script reference scan)')
console.log(`   Scanned ${files.length} governance docs`)
console.log(`   Bucket A(annotated retired/未實作/example — OK): ${bucketA.length}`)
console.log(`   Bucket B(dangling LIVE — no annotation, FAIL):   ${bucketB.length}`)
console.log('═══════════════════════════════════════════════════')

if (bucketB.length) {
  console.error('\n🚨 Bucket B — dangling LIVE infra refs(修:repoint live 檔 OR 同行加 retired/未實作 標註):')
  for (const e of bucketB) console.error(`   ${e.file}:${e.line}  →  ${e.name}\n      « ${e.text} »`)
}

if (bucketB.length && CHECK) process.exit(1)
console.log(bucketB.length ? '\n⚠️  dangling-live refs present(non-check mode)' : '\n✅ No dangling-live infra refs')
process.exit(0)

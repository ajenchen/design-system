#!/usr/bin/env node
// refresh-fork-launchers.mjs — C-prime 接線骨架刷新(sync-all 呼叫 + harness 可測)
//
// 既有 fork 的「接線骨架」(committed .claude/settings.json hooks 區塊 + 3 個 thin 啟動器)原本
// 不隨 npm 同步 → DS 改接線層後 user fork 拿不到(2026-06-17 user 抓:完全同步不偏移未達成)。
// 本模組從 npm-current 的 ds-canonical/fork/launchers/ 把骨架 idempotent 刷新進 fork:
//   1. copy 3 啟動器 .sh → .claude/hooks/(官方控管,覆蓋)
//   2. merge settings-hooks.json 進 .claude/settings.json:
//      - strip 所有 event 裡「引用 3 啟動器」的舊註冊(去重)
//      - append canonical 啟動器註冊
//      - union permissions.allow(只加治理所需、不移除 user 既有)
//      → 不 clobber user 自有「非治理」hook;重跑結果一致(idempotent)
// 安全:.github/no-governance-sync opt-out → 整段 skip;launchers 未 ship(舊 npm)→ skip 不報錯。
//
// 抽成獨立模組 = sync-all 呼叫 + test-fork-governance.mjs 直接測(不需真跑 npm install)。

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Claude Code 的 .claude/settings.json 允許 JSONC(// 行註解 / block 註解)→ JSON.parse 會炸。
// string-aware strip 註解後再 parse(fork user 若註解過 settings,skeleton 刷新才不會默默 no-op)。
function parseJsonc(text, label) {
  let out = '', inStr = false, inLine = false, inBlock = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1]
    if (inLine) { if (c === '\n') { inLine = false; out += c } continue }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++ } continue }
    if (inStr) { out += c; if (c === '\\') out += text[++i] ?? ''; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === '/' && n === '/') { inLine = true; i++; continue }
    if (c === '/' && n === '*') { inBlock = true; i++; continue }
    out += c
  }
  try { return JSON.parse(out) } catch (e) { throw new Error(`${label} JSONC strip 後仍非法 JSON:${e.message}`) }
}

const LAUNCHERS = ['fork-governance-dispatcher.sh', 'inject_fork_governance_preamble.sh']
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// path-segment 比對:啟動器必以 `/<name>` 出現(它一律在 .claude/hooks/ 路徑下)且後接邊界(引號/空白/結尾)。
// 避免 loose substring 誤刪「command 只是『含』啟動器名為子字串」的 user hook(adversarial FINDING 2b)。
const refsLauncher = (cmd) => LAUNCHERS.some((l) => new RegExp(`/${escRe(l)}(?=["'\\s]|$)`).test(cmd || ''))

// 2026-06-17 BLOCKER fix(adversarial run 3,實證既有 6 個 downstream fork):
// 既有 beta.69 fork 帶 plugin-era committed hook;C-prime 叫 user 拿掉 plugin →
// block_production_edit_without_plugin.sh(PreToolUse)exit 2 擋掉所有 apps/** 編輯 = brick。
// 故 migration 必「移除」這些 obsolete(從 disk + settings 註冊),非只「新增」launcher。
// check_governance_bootstrap.sh:C-prime 早期 bootstrap,2026-06-17 install 邏輯併進 inject(消除 SessionStart 並行 race)→ obsolete。
const OBSOLETE_HOOKS = ['block_production_edit_without_plugin.sh', 'check_plugin_bootstrap.sh', 'check_governance_bootstrap.sh']
const refsObsolete = (cmd) => OBSOLETE_HOOKS.some((o) => new RegExp(`/${escRe(o)}(?=["'\\s]|$)`).test(cmd || ''))

// 刷新 projectDir 的接線骨架;回傳 {copied, settingsMerged, skipped}
export function refreshLaunchers(projectDir) {
  const result = { copied: [], removed: [], settingsMerged: false, skills: [], commands: [], agents: [], skipped: null }

  // opt-out:fork user 明確不要官方覆蓋骨架
  if (existsSync(join(projectDir, '.github/no-governance-sync'))) {
    result.skipped = 'opt-out(.github/no-governance-sync 存在)'
    return result
  }

  const src = join(projectDir, 'node_modules/@qijenchen/design-system/ds-canonical/fork/launchers')
  if (!existsSync(join(src, 'settings-hooks.json'))) {
    result.skipped = 'launchers 未 ship(npm 套件版本過舊或治理本體未安裝)'
    return result
  }

  // 1. copy 啟動器 .sh → .claude/hooks/
  const hooksDir = join(projectDir, '.claude/hooks')
  mkdirSync(hooksDir, { recursive: true })
  for (const f of readdirSync(src).filter((f) => f.endsWith('.sh'))) {
    copyFileSync(join(src, f), join(hooksDir, f))
    result.copied.push(f)
  }
  // 移除 obsolete plugin-era committed hooks(brick 來源:block_production_edit_without_plugin.sh 等)
  for (const o of OBSOLETE_HOOKS) {
    const f = join(hooksDir, o)
    if (existsSync(f)) { rmSync(f); result.removed.push(o) }
  }

  // 2. idempotent merge settings hooks + permissions
  const canonical = JSON.parse(readFileSync(join(src, 'settings-hooks.json'), 'utf8'))
  const settingsPath = join(projectDir, '.claude/settings.json')
  const s = existsSync(settingsPath) ? parseJsonc(readFileSync(settingsPath, 'utf8'), '.claude/settings.json') : {}
  s.hooks = s.hooks || {}

  // strip 舊 launcher 註冊(去重,重跑不疊加)+ obsolete plugin-era 註冊(移除,不 re-add)
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = (s.hooks[ev] || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !refsLauncher(h.command) && !refsObsolete(h.command)) }))
      .filter((g) => (g.hooks || []).length > 0)
    if (s.hooks[ev].length === 0) delete s.hooks[ev]
  }
  // append canonical 啟動器註冊
  for (const ev of Object.keys(canonical.hooks || {})) {
    s.hooks[ev] = (s.hooks[ev] || []).concat(canonical.hooks[ev])
  }
  // union permissions.allow(治理需要 npm/git;只加不刪 user 既有)
  if (canonical.permissions && Array.isArray(canonical.permissions.allow)) {
    s.permissions = s.permissions || {}
    s.permissions.allow = Array.from(new Set([...(s.permissions.allow || []), ...canonical.permissions.allow]))
  }

  writeFileSync(settingsPath, JSON.stringify(s, null, 2) + '\n')
  result.settingsMerged = true

  // 3. 刷新必-committed 類別(skills/commands/agents)— Claude Code 不掃 node_modules,須有實檔在 .claude/<cat>/ 才能叫用。
  // clobber 只覆寫「治理擁有的名」(manifest 清單);使用者自有 skill/command/agent 名不在清單內 → 完全不碰(scope 精準,
  // 同 launcher 的 path-segment 精準刪)。clobber = 官方控管不可客製(改動下次 sync 被還原;要 diverge 走 .github/no-governance-sync)。
  const forkRoot = join(projectDir, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  const manifestPath = join(forkRoot, 'manifest.json')
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    for (const cat of ['skills', 'commands', 'agents']) {
      const names = manifest[cat] || []
      const catSrc = join(forkRoot, cat)
      const catDest = join(projectDir, '.claude', cat)
      for (const name of names) {
        const s2 = join(catSrc, name)
        if (!existsSync(s2)) continue
        const d2 = join(catDest, name)
        mkdirSync(catDest, { recursive: true })
        if (existsSync(d2)) rmSync(d2, { recursive: true, force: true }) // clobber:還原使用者對治理單元的改動
        cpSync(s2, d2, { recursive: true })
        result[cat].push(name)
      }
    }
  }
  return result
}

// 允許直接 `node scripts/refresh-fork-launchers.mjs`(inject hook self-heal 用);被 import(sync-all)時不執行。
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = refreshLaunchers(process.cwd())
  if (r.skipped) console.log(`refresh-fork-launchers: skip(${r.skipped})`)
  else console.log(`refresh-fork-launchers: launchers ${r.copied.length} / skills ${(r.skills || []).length} / settings ${r.settingsMerged ? 'merged' : '-'}`)
}

#!/usr/bin/env node
// test-fork-governance.mjs — 假 fork 測試 harness(C-prime 缺點3「假生效」的機械保證)
//
// 合成一個 Scenario-B fork(apps/** 產品 code + node_modules/@qijenchen/design-system/src specs+tokens,
// NO packages/design-system),把生成的 fork-mode hook 逐個對「違規 / 乾淨」樣本跑,斷言:
//   - 該 enforce 的 hook:違規樣本要有反應(exit 2 BLOCKER 或 stderr 提示),乾淨樣本要放行
//   - 絕不「對違規也靜默 exit 0 無輸出」= false-green(這正是 opacity registry 漂移那類陷阱)
//   - REPLACE 的 fork-quality hook:對任何 apps/** 都不得 exit 2(不得 brick)
//   - 全部 hook 不得 crash(exit 127 / syntax error)
//
// 用法:node scripts/test-fork-governance.mjs   (CI / preflight 跑;非 0 = fail)

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { refreshLaunchers } from './refresh-fork-launchers.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORK_HOOKS = join(ROOT, 'packages/design-system/ds-canonical/fork/hooks')
const FIX = '/tmp/ds-fork-fixture'

// ── 合成 fork 佈局 ──
function buildFixture() {
  if (existsSync(FIX)) rmSync(FIX, { recursive: true, force: true })
  mkdirSync(join(FIX, 'apps/demo/src'), { recursive: true })
  const dsSpecDir = join(FIX, 'node_modules/@qijenchen/design-system/src')
  mkdirSync(join(dsSpecDir, 'tokens'), { recursive: true })
  mkdirSync(join(dsSpecDir, 'components/CircularProgress'), { recursive: true })
  // 帶上真實 token registry(opacity hook SHIP_REWRITTEN 後讀這個路徑)
  const realReg = join(ROOT, 'packages/design-system/src/tokens/utility-registry.json')
  if (existsSync(realReg)) copyFileSync(realReg, join(dsSpecDir, 'tokens/utility-registry.json'))
  writeFileSync(join(dsSpecDir, 'components/CircularProgress/circular-progress.spec.md'), '# CircularProgress\nsize 預設 24\n')
  writeFileSync(join(FIX, 'apps/demo/src/App.tsx'), 'export const App = () => <div>x</div>\n')
}

// run a hook with a synthetic tool_input; returns {exit, stderr}
// spawnSync 同時拿 status + stderr + stdout(不管 exit code)→ 避免「exit 0 但有 stderr 警告」被漏判 false-green。
function runHook(hookFile, toolName, filePath, content) {
  const payload = JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath, content, new_string: content } })
  // 依副檔名選 interpreter,對齊 dispatcher(用 bash 跑 .py 會 syntax-error exit 2 = false-block;
  // harness 若也用 bash 跑 .py 就會 false-green 漏掉 dispatcher 的同 bug,故必對齊)。
  const interp = hookFile.endsWith('.py') ? 'python3' : 'bash'
  const r = spawnSync(interp, [join(FORK_HOOKS, hookFile)], {
    input: payload, encoding: 'utf8', cwd: FIX, env: { ...process.env, CLAUDE_PROJECT_DIR: FIX },
  })
  if (r.error) return { exit: 127, stderr: String(r.error.message || r.error) }
  return { exit: r.status == null ? 127 : r.status, stderr: (r.stderr || '') + (r.stdout || '') }
}

// ── 高風險 enforce 案例:violation 必有反應 / clean 必放行 ──
// 每個 fork-relevant 品質 hook 一組(違規 + 乾淨)。
const A = 'apps/demo/src/App.tsx'
const CASES = [
  { hook: 'check_consumer_app_invariants.sh', tool: 'Write', enforce: true,
    violation: 'export const X=()=><table><thead><th>a</th></thead></table>',
    clean: 'import {DataTable} from "@qijenchen/design-system"\nexport const X=()=><DataTable columns={c} data={d}/>' },
  // 2026-07-10 隊列 14:偽表格(R4 分支)專屬 case — 防該分支 regress 靜默(raw <table> case 蓋不到它)
  { hook: 'check_consumer_app_invariants.sh', tool: 'Write', enforce: true,
    violation: 'const MINI_TABLE_ROW_PAD="px-3 py-2"\nexport const X=()=><div className="grid grid-cols-[88px_72px_1fr] bg-muted font-medium">h</div>',
    clean: 'import {DataTable} from "@qijenchen/design-system"\nexport const X=()=><DataTable size="sm" height="auto" columns={c} data={d}/>' },
  { hook: 'check_layout_space_magic_numbers.sh', tool: 'Write', enforce: true,
    violation: 'export const X=()=><div className="gap-13 mt-7">x</div>',
    clean: 'export const X=()=><div className="gap-[var(--layout-space-tight)]">x</div>' },
  { hook: 'check_opacity_token_usage.sh', tool: 'Write', enforce: true,
    violation: 'export const X=()=><div className="bg-[#ff0000] text-[14px] shadow-md">x</div>',
    clean: 'export const X=()=><div className="bg-surface text-body">x</div>' },
  { hook: 'check_fork_product_quality.sh', tool: 'Write', enforce: false, neverBrick: true,
    violation: 'export const X=()=><table><thead><th>a</th></thead></table>',
    clean: 'export const X=()=><div>ok</div>' },
  // PNG P2.4:codex-projected hook(fork/codex/hooks.json 唯一投影)— 違規必擋 / 乾淨必放
  { hook: 'check_tailwind_wildcard_in_docs.sh', tool: 'Write', enforce: true,
    violation: 'docs shorthand: `shadow-[var(--elevation-*)]`',
    clean: 'math notation: var(--elevation-N) N∈{100,200}' },
]

buildFixture()
let fail = 0
const results = []

// 1) 高風險案例:enforce 行為
for (const c of CASES) {
  const v = runHook(c.hook, c.tool, A, c.violation)
  const cl = runHook(c.hook, c.tool, A, c.clean)
  let verdict = 'ok'
  if (c.neverBrick) {
    // 不得 exit 2(brick);違規時可有提示(stderr)但不得擋
    if (v.exit === 2 || cl.exit === 2) { verdict = `❌ BRICK: exit 2 on apps/** (v=${v.exit} c=${cl.exit})`; fail++ }
    else verdict = `✅ never-brick (v.exit=${v.exit} c.exit=${cl.exit})`
  } else if (c.enforce) {
    const reacted = v.exit === 2 || v.stderr.trim().length > 0
    const passedClean = cl.exit === 0 && cl.stderr.trim().length === 0
    if (!reacted) { verdict = `❌ FALSE-GREEN: 違規樣本靜默放行(exit=${v.exit}, 無 stderr)`; fail++ }
    else if (!passedClean) { verdict = `⚠️ clean 樣本未乾淨放行(exit=${cl.exit}) — 檢查` ; /* not hard fail */ }
    else verdict = `✅ enforce (violation→exit ${v.exit}/stderr / clean→pass)`
  }
  results.push(`  ${c.hook}: ${verdict}`)
}

// 2) 全 15 hook crash 檢查(語法 + 不得 127)
const allHooks = readdirSync(FORK_HOOKS).filter((f) => f.endsWith('.sh') || f.endsWith('.py'))
const crashed = []
for (const h of allHooks) {
  if (h.endsWith('.sh')) {
    try { execSync(`bash -n '${join(FORK_HOOKS, h)}'`, { stdio: 'pipe' }) }
    catch (e) { crashed.push(`${h}: syntax error`); fail++ }
  }
  if (h.endsWith('.py')) {
    try { execSync(`python3 -m py_compile '${join(FORK_HOOKS, h)}'`, { stdio: 'pipe' }) }
    catch (e) { crashed.push(`${h}: python syntax error`); fail++ }
  }
  // 跑一次 generic CLEAN apps edit:不得 127(crash)且不得 2(false-block 乾淨檔)。
  // exit 2 on clean = B1 那類「dispatcher 用 bash 跑 .py 誤 exit 2 brick 編輯」的源頭,必擋。
  const r = runHook(h, 'Write', A, 'export const X=()=><div>x</div>')
  if (r.exit === 127) { crashed.push(`${h}: exit 127 (missing dep/file)`); fail++ }
  if (r.exit === 2) { crashed.push(`${h}: exit 2 on CLEAN file = false-block(會誤擋乾淨編輯)`); fail++ }
}

// 3) committed 模板治理流程(#6 codex C3:測 dispatcher/bootstrap/injection,不只 fork hook 本體)
// 合成「完整 fork」:committed template .claude/hooks + npm fork corpus,跑 3 個 committed 啟動器。
const TPL_HOOKS = join(ROOT, 'template/ds-product-template/.claude/hooks')
const FULL = '/tmp/ds-fork-full'
const flowResults = []
function buildFullFixture() {
  if (existsSync(FULL)) rmSync(FULL, { recursive: true, force: true })
  mkdirSync(join(FULL, 'apps/demo/src'), { recursive: true })
  mkdirSync(join(FULL, '.claude/hooks'), { recursive: true })
  const npmFork = join(FULL, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  mkdirSync(npmFork, { recursive: true })
  // committed 啟動器
  for (const h of readdirSync(TPL_HOOKS).filter((f) => f.endsWith('.sh'))) copyFileSync(join(TPL_HOOKS, h), join(FULL, '.claude/hooks', h))
  // npm fork corpus(hooks + manifest + preamble)
  execSync(`cp -R '${join(ROOT, 'packages/design-system/ds-canonical/fork')}/.' '${npmFork}/'`)
  writeFileSync(join(FULL, 'apps/demo/src/App.tsx'), 'export const App = () => <div>x</div>\n')
}
function runTpl(hookFile, payload) {
  const r = spawnSync('bash', [join(FULL, '.claude/hooks', hookFile)], { input: payload, encoding: 'utf8', cwd: FULL, env: { ...process.env, CLAUDE_PROJECT_DIR: FULL } })
  return { exit: r.status == null ? 127 : r.status, out: (r.stdout || ''), err: (r.stderr || '') }
}
buildFullFixture()
// injection:preamble 在 → 輸出 valid additionalContext 含設計紀律
{
  const r = runTpl('inject_fork_governance_preamble.sh', '{"hook_event_name":"SessionStart"}')
  let ok = false
  try { const j = JSON.parse(r.out); ok = (j.hookSpecificOutput.additionalContext || '').includes('item-anatomy') } catch (e) { ok = false }
  if (!ok) { flowResults.push('  inject_preamble: ❌ 未輸出含 item-anatomy 的 valid additionalContext'); fail++ }
  else flowResults.push('  inject_preamble: ✅ 注入 valid additionalContext(含設計紀律)')
}
// dispatcher:PostToolUse 違規(手刻 table)→ 轉發 exit 2
{
  const v = runTpl('fork-governance-dispatcher.sh', JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'apps/demo/src/App.tsx', new_string: 'export const X=()=><table><thead><th>a</th></thead></table>' } }))
  if (v.exit !== 2) { flowResults.push(`  dispatcher(PostToolUse 違規): ❌ 未轉發攔截(exit=${v.exit})`); fail++ }
  else flowResults.push('  dispatcher(PostToolUse 違規): ✅ 轉發 exit 2')
}
// dispatcher:PostToolUse CLEAN 檔 → 必 exit 0(B1 回歸鎖:用 bash 跑 .py hook 會 syntax-error exit 2 → 誤擋所有乾淨編輯 = brick)
{
  const c = runTpl('fork-governance-dispatcher.sh', JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'apps/demo/src/Clean.tsx', new_string: 'export const Clean = () => null' } }))
  if (c.exit !== 0) { flowResults.push(`  dispatcher(PostToolUse CLEAN 檔): ❌ exit ${c.exit}(應 0;B1 brick 回歸 = 用 bash 跑 .py)`); fail++ }
  else flowResults.push('  dispatcher(PostToolUse CLEAN 檔): ✅ exit 0 不誤擋乾淨編輯')
}
// dispatcher:PostToolUse Bash git-push → exit 0(deploy-url 修:matcher 補 Bash 後,dispatcher 會在 git push 跑;
// file-hooks 在 Bash payload 必自守 no-op,不得誤擋每次 push = brick。此為 deploy-url-relay 修正的安全鎖)
{
  const b = runTpl('fork-governance-dispatcher.sh', JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'git push origin main' } }))
  if (b.exit !== 0) { flowResults.push(`  dispatcher(Bash git-push): ❌ exit ${b.exit}(應 0;file-hook 在 Bash 誤擋 = 每次 push 被 brick)`); fail++ }
  else flowResults.push('  dispatcher(Bash git-push): ✅ exit 0(deploy-url 路徑可跑 + file-hooks 在 Bash 自守不誤擋)')
}
// dispatcher:manifest 缺 → 不 brick(exit 0)
{
  rmSync(join(FULL, 'node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json'), { force: true })
  const v = runTpl('fork-governance-dispatcher.sh', JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'apps/demo/src/App.tsx', new_string: 'x' } }))
  if (v.exit !== 0) { flowResults.push(`  dispatcher(manifest 缺): ❌ brick(exit=${v.exit},應 0)`); fail++ }
  else flowResults.push('  dispatcher(manifest 缺): ✅ exit 0 不 brick')
  // inject(SessionStart init,已併入 bootstrap install)在「本體缺 + 無 package.json」→ exit 0 fail-open(不 brick、不嘗試 install)
  rmSync(join(FULL, 'node_modules/@qijenchen/design-system/ds-canonical/fork/preamble.md'), { force: true })
  const b = runTpl('inject_fork_governance_preamble.sh', '{"hook_event_name":"SessionStart"}')
  if (b.exit !== 0) { flowResults.push(`  inject(本體缺 fail-open): ❌ exit ${b.exit}(應 0)`); fail++ }
  else flowResults.push('  inject(本體缺 fail-open): ✅ exit 0 不 brick(notice;install+inject 已 sequential 合一,消除並行 race)')
}

// 4) sync-all 接線骨架刷新(refresh-fork-launchers:idempotent + 不 clobber user hook + opt-out)
// 既有 fork 的「接線層完全同步」命脈。模擬既有 fork(有 user 自有 hook + 舊 launcher 註冊)+ npm-current launchers。
const skelResults = []
const SKEL = '/tmp/ds-fork-skel'
function buildSkelFixture(withOptOut) {
  if (existsSync(SKEL)) rmSync(SKEL, { recursive: true, force: true })
  mkdirSync(join(SKEL, '.claude/hooks'), { recursive: true })
  if (withOptOut) { mkdirSync(join(SKEL, '.github'), { recursive: true }); writeFileSync(join(SKEL, '.github/no-governance-sync'), '') }
  const npmFork = join(SKEL, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  const npmLaunchers = join(npmFork, 'launchers')
  mkdirSync(npmLaunchers, { recursive: true })
  execSync(`cp -R '${join(ROOT, 'packages/design-system/ds-canonical/fork/launchers')}/.' '${npmLaunchers}/'`)
  // 2026-06-18:帶 fork skills + manifest(測 skill 送達 / clobber scope）
  execSync(`cp -R '${join(ROOT, 'packages/design-system/ds-canonical/fork/skills')}' '${npmFork}/'`)
  copyFileSync(join(ROOT, 'packages/design-system/ds-canonical/fork/manifest.json'), join(npmFork, 'manifest.json'))
  // PNG P2.4b:帶 codex surface corpus(AGENTS.md + codex/,測 4h 送達 / marker 政策 / dry-run)
  copyFileSync(join(ROOT, 'packages/design-system/ds-canonical/fork/AGENTS.md'), join(npmFork, 'AGENTS.md'))
  execSync(`cp -R '${join(ROOT, 'packages/design-system/ds-canonical/fork/codex')}' '${npmFork}/'`)
  // 既有 fork settings:user 自有「非治理」hook + 一個「舊版 launcher 註冊」(模擬 pre-update,測去重)
  writeFileSync(join(SKEL, '.claude/settings.json'), JSON.stringify({
    defaultMode: 'auto',
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'bash my-own-hook.sh' }, { type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/inject_fork_governance_preamble.sh"' }] }],
      // PostToolUse:user 自有 lint + 一個「含啟動器名為子字串但不是啟動器」的 hook(adversarial FINDING 2b 不得誤刪)
      PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'bash user-lint.sh' }, { type: 'command', command: 'bash ".claude/hooks/my-fork-governance-dispatcher.sh.bak"' }] }],
    },
  }, null, 2))
}
// 4a 正常刷新
buildSkelFixture(false)
const r1 = refreshLaunchers(SKEL)
{
  const launchersCopied = r1.copied?.length === 2 && existsSync(join(SKEL, '.claude/hooks/fork-governance-dispatcher.sh'))
  const s = JSON.parse(readFileSync(join(SKEL, '.claude/settings.json'), 'utf8'))
  const cmds = JSON.stringify(s.hooks)
  const hasAllLaunchers = ['fork-governance-dispatcher.sh', 'inject_fork_governance_preamble.sh'].every((l) => cmds.includes(l))
  const events4 = ['SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit'].every((ev) => s.hooks[ev])
  const userHookKept = cmds.includes('my-own-hook.sh') && cmds.includes('user-lint.sh')
  const substringHookKept = cmds.includes('my-fork-governance-dispatcher.sh.bak') // FINDING 2b:子字串碰撞不得誤刪
  const noDupInject = (cmds.match(/\/inject_fork_governance_preamble\.sh/g) || []).length === 1
  const permUnioned = (s.permissions?.allow || []).length >= 5
  if (!launchersCopied) { skelResults.push('  refresh: ❌ 啟動器未全 copy(應 2 個:dispatcher + inject)'); fail++ }
  else if (!hasAllLaunchers || !events4) { skelResults.push('  refresh: ❌ settings 缺啟動器註冊 / 缺 4-event'); fail++ }
  else if (!userHookKept) { skelResults.push('  refresh: ❌ clobber 了 user 自有非治理 hook'); fail++ }
  else if (!substringHookKept) { skelResults.push('  refresh: ❌ 子字串碰撞 hook 被誤刪(FINDING 2b 回歸)'); fail++ }
  else if (!noDupInject) { skelResults.push('  refresh: ❌ 舊 launcher 註冊沒去重(inject 重複)'); fail++ }
  else if (!permUnioned) { skelResults.push('  refresh: ❌ permissions.allow 未 union'); fail++ }
  else skelResults.push('  refresh: ✅ 啟動器 copy(2)+ 4-event 註冊 + user hook 保留 + 子字串不誤刪 + 去重 + perm union')
}
// 4b idempotent
{
  const before = readFileSync(join(SKEL, '.claude/settings.json'), 'utf8')
  refreshLaunchers(SKEL)
  const after = readFileSync(join(SKEL, '.claude/settings.json'), 'utf8')
  if (before !== after) { skelResults.push('  idempotent: ❌ 第二次刷新改了 settings(非冪等 → 重跑會疊加)'); fail++ }
  else skelResults.push('  idempotent: ✅ 重跑 settings 完全一致')
}
// 4c opt-out
{
  buildSkelFixture(true)
  const r = refreshLaunchers(SKEL)
  if (!r.skipped) { skelResults.push('  opt-out: ❌ 有 .github/no-governance-sync 仍刷新(應 skip)'); fail++ }
  else skelResults.push(`  opt-out: ✅ skip(${r.skipped})`)
}
// 4d JSONC settings(// 註解,Claude Code 允許)→ 仍能容忍 + merge(MINOR 2 回歸鎖)
{
  buildSkelFixture(false)
  writeFileSync(join(SKEL, '.claude/settings.json'), '{\n  // fork user 自己加的註解\n  "defaultMode": "auto",\n  "hooks": {} /* block 註解 */\n}')
  let r, threw = false
  try { r = refreshLaunchers(SKEL) } catch (e) { threw = true }
  const s = (!threw && r?.settingsMerged) ? JSON.parse(readFileSync(join(SKEL, '.claude/settings.json'), 'utf8')) : null
  const hasLauncher = s && JSON.stringify(s.hooks).includes('inject_fork_governance_preamble.sh')
  if (threw || !hasLauncher) { skelResults.push(`  JSONC settings: ❌ // 註解的 settings 沒容忍/沒 merge(threw=${threw})`); fail++ }
  else skelResults.push('  JSONC settings: ✅ // + block 註解容忍 + merge 成功')
}
// 4e obsolete plugin-era hook 移除(BLOCKER run-3 回歸鎖:既有 fork 的 block_production_edit_without_plugin 必被移除,否則 C-prime 拿掉 plugin 後它 exit 2 brick 所有編輯)
{
  buildSkelFixture(false)
  writeFileSync(join(SKEL, '.claude/hooks/block_production_edit_without_plugin.sh'), '#!/bin/bash\nexit 2\n')
  writeFileSync(join(SKEL, '.claude/settings.json'), JSON.stringify({
    hooks: { PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/block_production_edit_without_plugin.sh"' }] }] },
  }, null, 2))
  const r = refreshLaunchers(SKEL)
  const fileGone = !existsSync(join(SKEL, '.claude/hooks/block_production_edit_without_plugin.sh'))
  const s = JSON.parse(readFileSync(join(SKEL, '.claude/settings.json'), 'utf8'))
  const regGone = !JSON.stringify(s.hooks).includes('block_production_edit_without_plugin')
  if (!fileGone || !regGone) { skelResults.push(`  obsolete 移除: ❌ block_production_edit 殘留(file 在=${!fileGone}/reg 在=${!regGone})`); fail++ }
  else skelResults.push(`  obsolete 移除: ✅ block_production_edit 從 disk + settings 清掉(防 brick;removed=${(r.removed || []).join(',')})`)
}
// 4f skill 送達(2026-06-18:C-prime 補 skill 送達 → fork 可叫用 /prototype;根治 root cause)
{
  buildSkelFixture(false)
  // user 自有非治理 skill(不得被 clobber)
  mkdirSync(join(SKEL, '.claude/skills/my-team-skill'), { recursive: true })
  writeFileSync(join(SKEL, '.claude/skills/my-team-skill/SKILL.md'), '---\nname: my-team-skill\n---\nmine')
  const r = refreshLaunchers(SKEL)
  const protoPath = join(SKEL, '.claude/skills/prototype/SKILL.md')
  const protoThere = existsSync(protoPath)
  const fmValid = protoThere && /^---[\s\S]*?\bname:\s*prototype\b[\s\S]*?^---/m.test(readFileSync(protoPath, 'utf8'))
  const tenSkills = (r.skills || []).length === 10 && (r.skills || []).includes('prototype')
  const noDropSkill = !existsSync(join(SKEL, '.claude/skills/design-system-audit')) // DROP 的 DS-internal 不得誤送
  const userSkillKept = existsSync(join(SKEL, '.claude/skills/my-team-skill/SKILL.md'))
  // clobber proof:竄改治理 skill → 再 refresh → 還原
  writeFileSync(protoPath, 'tampered')
  refreshLaunchers(SKEL)
  const reverted = existsSync(protoPath) && readFileSync(protoPath, 'utf8') !== 'tampered'
  // idempotent:第二次 refresh skill byte 不變
  const b = readFileSync(protoPath, 'utf8'); refreshLaunchers(SKEL); const idem = readFileSync(protoPath, 'utf8') === b
  if (!protoThere) { skelResults.push('  skill 送達: ❌ /prototype 未複製進 .claude/skills/'); fail++ }
  else if (!fmValid) { skelResults.push('  skill 送達: ❌ prototype SKILL.md frontmatter name 不合法(Claude Code 會靜默不載)'); fail++ }
  else if (!tenSkills) { skelResults.push(`  skill 送達: ❌ 應送 10 skill 含 prototype(實得 ${(r.skills || []).length})`); fail++ }
  else if (!noDropSkill) { skelResults.push('  skill 送達: ❌ DROP 的 DS-internal skill(design-system-audit)被誤送'); fail++ }
  else if (!userSkillKept) { skelResults.push('  skill 送達: ❌ clobber 了 user 自有 skill(my-team-skill)'); fail++ }
  else if (!reverted) { skelResults.push('  skill 送達: ❌ 竄改的治理 skill 沒被還原(clobber 失效)'); fail++ }
  else if (!idem) { skelResults.push('  skill 送達: ❌ 重跑 skill 內容變動(非冪等)'); fail++ }
  else skelResults.push('  skill 送達: ✅ /prototype 等 10 skill 送達 + frontmatter 合法 + 無 DROP 誤送 + user skill 保留 + clobber 還原 + 冪等')
}
// 4g committed scaffold == generated(drift lock:stale scaffold → CI 紅,同 ds-canonical/fork 一致)
{
  const genSkills = join(ROOT, 'packages/design-system/ds-canonical/fork/skills')
  const scaffoldSkills = join(ROOT, 'template/ds-product-template/.claude/skills')
  let drift = false
  try { execSync(`diff -r '${genSkills}' '${scaffoldSkills}'`, { stdio: 'pipe' }) } catch { drift = true }
  if (drift) { skelResults.push('  scaffold drift: ❌ template/.claude/skills ≠ ds-canonical/fork/skills(重跑 build-fork-governance + commit)'); fail++ }
  else skelResults.push('  scaffold drift: ✅ committed scaffold == 生成物(byte-equal)')
}
// 4h codex surface 送達(PNG P2.4b:sync-all 把 AGENTS.md / .codex/hooks.json / .agents/skills 裝進既有 fork root)
{
  buildSkelFixture(false)
  // user 自有 .agents skill(治理名以外,不得被 clobber)
  mkdirSync(join(SKEL, '.agents/skills/my-own-review'), { recursive: true })
  writeFileSync(join(SKEL, '.agents/skills/my-own-review/SKILL.md'), 'mine')
  const r = refreshLaunchers(SKEL)
  const agentsMd = join(SKEL, 'AGENTS.md')
  const codexHooks = join(SKEL, '.codex/hooks.json')
  const irSkill = join(SKEL, '.agents/skills/independent-review/SKILL.md')
  const corpusAgents = readFileSync(join(SKEL, 'node_modules/@qijenchen/design-system/ds-canonical/fork/AGENTS.md'), 'utf8')
  const created = existsSync(agentsMd) && existsSync(codexHooks) && existsSync(irSkill)
  const reported = (r.codex || []).length === 3
  const userAgentsSkillKept = readFileSync(join(SKEL, '.agents/skills/my-own-review/SKILL.md'), 'utf8') === 'mine'
  // clobber proof:竄改 generated AGENTS.md(留 marker)→ 再 refresh → 還原 byte-equal corpus
  writeFileSync(agentsMd, '> stale generated by build-fork-governance.mjs\ntampered')
  refreshLaunchers(SKEL)
  const reverted = readFileSync(agentsMd, 'utf8') === corpusAgents
  // consumer-owned(無 marker:cli-init stub / user 手寫)→ 不 clobber + codexSkipped 回報
  writeFileSync(agentsMd, '# My own agents doc\n')
  const r2 = refreshLaunchers(SKEL)
  const ownKept = readFileSync(agentsMd, 'utf8') === '# My own agents doc\n'
  const skipReported = (r2.codexSkipped || []).some((x) => x.includes('AGENTS.md'))
  // 還原 generated 後:冪等(重跑三檔 byte 不變)
  writeFileSync(agentsMd, corpusAgents)
  const b1 = readFileSync(agentsMd, 'utf8'); const b2 = readFileSync(codexHooks, 'utf8'); const b3 = readFileSync(irSkill, 'utf8')
  refreshLaunchers(SKEL)
  const idem = readFileSync(agentsMd, 'utf8') === b1 && readFileSync(codexHooks, 'utf8') === b2 && readFileSync(irSkill, 'utf8') === b3
  // dry-run(§15):刪 .codex → dryRun 報 would-install 但 disk 不寫
  rmSync(join(SKEL, '.codex'), { recursive: true, force: true })
  const rd = refreshLaunchers(SKEL, { dryRun: true })
  const dryOk = (rd.codex || []).includes('.codex/hooks.json') && !existsSync(codexHooks) && rd.dryRun === true
  if (!created || !reported) { skelResults.push(`  codex 送達: ❌ AGENTS.md/.codex/.agents 未全裝(created=${created} / reported=${(r.codex || []).join(',')})`); fail++ }
  else if (!userAgentsSkillKept) { skelResults.push('  codex 送達: ❌ clobber 了 user 自有 .agents/skills(my-own-review)'); fail++ }
  else if (!reverted) { skelResults.push('  codex 送達: ❌ 竄改的 generated AGENTS.md 沒被還原(clobber 失效)'); fail++ }
  else if (!ownKept || !skipReported) { skelResults.push(`  codex 送達: ❌ consumer-owned AGENTS.md 被動了(kept=${ownKept})或沒回報 skip(${skipReported})`); fail++ }
  else if (!idem) { skelResults.push('  codex 送達: ❌ 重跑內容變動(非冪等)'); fail++ }
  else if (!dryOk) { skelResults.push(`  codex 送達: ❌ dry-run 失契(codex=${(rd.codex || []).join(',')} / 寫了檔=${existsSync(codexHooks)})`); fail++ }
  else skelResults.push('  codex 送達: ✅ 三件套裝進 fork root + user .agents 保留 + 竄改還原 + consumer-owned 不碰 + 冪等 + dry-run 只算不寫')
}

// 5) codex surface(PNG P2.4:AGENTS.md / codex/hooks.json / independent-review 投影「真生效」斷言)
const codexResults = []
{
  const FORK_OUT = join(ROOT, 'packages/design-system/ds-canonical/fork')
  const NM_PREFIX = 'node_modules/@qijenchen/design-system/ds-canonical/fork/hooks/'
  // 5a fork AGENTS.md:存在 + fork-context banner + rules pointer 已 node_modules 化(死指標 = 投影失敗)
  const agentsPath = join(FORK_OUT, 'AGENTS.md')
  if (!existsSync(agentsPath)) { codexResults.push('  codex AGENTS.md: ❌ fork/AGENTS.md 不存在'); fail++ }
  else {
    const a = readFileSync(agentsPath, 'utf8')
    const banner = a.includes('FORK PRODUCT')
    const rewritten = a.includes('node_modules/@qijenchen/design-system/ds-canonical/rules/meta-patterns.md')
    if (!banner || !rewritten) { codexResults.push(`  codex AGENTS.md: ❌ banner=${banner} / rules-path node_modules 化=${rewritten}`); fail++ }
    else codexResults.push('  codex AGENTS.md: ✅ fork-context banner + pointer node_modules 化')
  }
  // 5b template committed AGENTS.md == fork/AGENTS.md(byte-equal;stale scaffold → 紅)
  const tplAgents = join(ROOT, 'template/ds-product-template/AGENTS.md')
  if (!existsSync(tplAgents) || readFileSync(tplAgents, 'utf8') !== readFileSync(agentsPath, 'utf8')) {
    codexResults.push('  template AGENTS.md: ❌ 缺檔或 ≠ fork/AGENTS.md(重跑 build-fork-governance + commit)'); fail++
  } else codexResults.push('  template AGENTS.md: ✅ committed scaffold == 生成物(byte-equal)')
  // 5c codex/hooks.json:可 parse + 每 command 指向 npm fork hooks 且 hook 實檔存在(死指標 = codex 靜默無治理)
  const hj = join(FORK_OUT, 'codex/hooks.json')
  if (!existsSync(hj)) { codexResults.push('  codex hooks.json: ❌ fork/codex/hooks.json 不存在'); fail++ }
  else {
    let parsed = null
    try { parsed = JSON.parse(readFileSync(hj, 'utf8')) } catch { /* parse fail ↓ */ }
    const cmds = parsed ? Object.values(parsed.hooks || {}).flatMap((groups) => groups.flatMap((g) => (g.hooks || []).map((h) => h.command || ''))) : []
    const badPath = cmds.filter((c) => !c.includes(NM_PREFIX) || !existsSync(join(FORK_OUT, 'hooks', (c.split(NM_PREFIX)[1] || '').replace(/"$/, ''))))
    if (!parsed) { codexResults.push('  codex hooks.json: ❌ JSON parse fail'); fail++ }
    else if (!cmds.length || badPath.length) { codexResults.push(`  codex hooks.json: ❌ command ${cmds.length} 條 / 死指標 ${badPath.length} 條`); fail++ }
    else codexResults.push(`  codex hooks.json: ✅ parse + ${cmds.length} command 全指向存在的 npm fork hook`)
  }
  // 5d independent-review skill:frontmatter 合法 + rubric path 已 node_modules 化且 rubric 實檔在 shipped mirror
  const ir = join(FORK_OUT, 'codex/agents/skills/independent-review/SKILL.md')
  if (!existsSync(ir)) { codexResults.push('  independent-review: ❌ SKILL.md 不存在'); fail++ }
  else {
    const s = readFileSync(ir, 'utf8')
    const fm = /^---[\s\S]*?\bname:\s*independent-review\b[\s\S]*?^---/m.test(s)
    const rubricRel = 'skills/design-system-audit/references/audit-prompts.md'
    const rubricRewritten = s.includes(`node_modules/@qijenchen/design-system/ds-canonical/${rubricRel}`)
    const rubricShipped = existsSync(join(ROOT, 'packages/design-system/ds-canonical', rubricRel))
    if (!fm || !rubricRewritten || !rubricShipped) { codexResults.push(`  independent-review: ❌ frontmatter=${fm} / rubric node_modules 化=${rubricRewritten} / rubric shipped=${rubricShipped}`); fail++ }
    else codexResults.push('  independent-review: ✅ frontmatter 合法 + rubric 指向 shipped mirror 實檔')
  }
}

console.log('=== 假 fork 測試 harness 結果 ===')
console.log(`fixture: ${FIX}(apps/** + node_modules/@qijenchen/design-system/src,NO packages/design-system)`)
console.log(results.join('\n'))
console.log('\n=== committed 模板治理流程(dispatcher/bootstrap/injection)===')
console.log(flowResults.join('\n'))
console.log('\n=== 接線骨架刷新(sync-all refresh-fork-launchers:idempotent / 不 clobber / opt-out)===')
console.log(skelResults.join('\n'))
console.log('\n=== codex surface(PNG P2.4:AGENTS.md / hooks.json / independent-review)===')
console.log(codexResults.join('\n'))
console.log(`\ncrash 檢查(${allHooks.length} hook):${crashed.length ? '\n  ' + crashed.join('\n  ') : '✅ 無 syntax error / 無 exit-127'}`)
console.log(`\n${fail === 0 ? '✅ FORK-GOVERNANCE HARNESS PASS — 無 false-green / 無 brick / 無 crash' : `❌ ${fail} 項 fail(見上）`}`)
process.exit(fail === 0 ? 0 : 1)

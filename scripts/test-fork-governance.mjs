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

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync, readdirSync, lstatSync, readlinkSync, symlinkSync, cpSync, mkdtempSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  authorizeDisposableProviderRefreshTransaction,
  refreshLaunchers,
  validateInstalledForkCorpus,
  validateInstalledProviderTransition,
} from './refresh-fork-launchers.mjs'
import { buildProviderHookLaunchArgv } from './lib/provider-hook-output-transport.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORK_HOOKS = join(ROOT, 'packages/design-system/ds-canonical/fork/hooks')
const CANONICAL_UTILITY_REGISTRY = join(ROOT, 'packages/design-system/src/tokens/utility-registry.json')
const CANONICAL_STORY_REGISTRY = join(
  ROOT,
  'packages/design-system/ds-canonical/references/story-baseline-registry.json',
)
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'ds-fork-governance-'))
try {
const RUNTIME_TEMP = join(TEST_ROOT, 'runtime')
const FIX = join(TEST_ROOT, 'fixture')
const FIX_CORPUS = join(FIX, 'private-fork-corpus')
const FULL = join(TEST_ROOT, 'full')
const SKEL = join(TEST_ROOT, 'skeleton')
mkdirSync(RUNTIME_TEMP)

const childEnvironment = (overrides = {}) => ({
  ...process.env,
  TMPDIR: RUNTIME_TEMP,
  NODE_COMPILE_CACHE: join(RUNTIME_TEMP, 'node-compile-cache'),
  ...overrides,
})

// ── 合成 fork 佈局 ──
function buildFixture() {
  if (existsSync(FIX)) rmSync(FIX, { recursive: true, force: true })
  mkdirSync(join(FIX, 'apps/demo/src'), { recursive: true })
  const dsSpecDir = join(FIX, 'node_modules/@qijenchen/design-system/src')
  mkdirSync(join(dsSpecDir, 'tokens'), { recursive: true })
  mkdirSync(join(dsSpecDir, 'components/CircularProgress'), { recursive: true })
  mkdirSync(join(FIX_CORPUS, 'references'), { recursive: true })
  // Direct hook probes receive an explicit mini corpus matching the authenticated runtime snapshot.
  // The installed package copy is only consumer application material; governance must never treat
  // that mutable dependency view as the authority or rediscover this repository through git.
  copyFileSync(CANONICAL_UTILITY_REGISTRY, join(dsSpecDir, 'tokens/utility-registry.json'))
  copyFileSync(CANONICAL_UTILITY_REGISTRY, join(FIX_CORPUS, 'references/utility-registry.json'))
  copyFileSync(CANONICAL_STORY_REGISTRY, join(FIX_CORPUS, 'references/story-baseline-registry.json'))
  writeFileSync(join(dsSpecDir, 'components/CircularProgress/circular-progress.spec.md'), '# CircularProgress\nsize 預設 24\n')
  writeFileSync(join(FIX, 'apps/demo/src/App.tsx'), 'export const App = () => <div>x</div>\n')
}

// run a hook with a synthetic tool_input; returns {exit, stderr}
// spawnSync 同時拿 status + stderr + stdout(不管 exit code)→ 避免「exit 0 但有 stderr 警告」被漏判 false-green。
function runHook(hookFile, toolName, filePath, content) {
  const payload = JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath, content, new_string: content } })
  // 依副檔名選 interpreter,對齊 dispatcher(用 bash 跑 .py 會 syntax-error exit 2 = false-block;
  // harness 若也用 bash 跑 .py 就會 false-green 漏掉 dispatcher 的同 bug,故必對齊)。
  const env = childEnvironment({
    GOVERNANCE_CORPUS_ROOT: FIX_CORPUS,
    GOVERNANCE_PROJECT_DIR: FIX,
    GOVERNANCE_PROVIDER: 'generic',
  })
  delete env.CLAUDE_PROJECT_DIR
  const args = ['--', join(FORK_HOOKS, hookFile)]
  const options = { input: payload, encoding: 'utf8', cwd: FIX, env }
  const r = hookFile.endsWith('.py')
    ? spawnSync('python3', args, options)
    : spawnSync('bash', args, options)
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
    else if (!passedClean) {
      verdict = `❌ FALSE-POSITIVE: clean 樣本未乾淨放行(exit=${cl.exit}, stderr=${JSON.stringify(cl.stderr.trim())})`
      fail++
    }
    else verdict = `✅ enforce (violation→exit ${v.exit}/stderr / clean→pass)`
  }
  results.push(`  ${c.hook}: ${verdict}`)
}

// block_prototype_imports reads the post-edit file from disk. Prove the shipped fork hook covers
// the real consumer layout (`apps/<app>/src/**`), not only the legacy root `src/**` layout.
{
  const appPath = join(FIX, A)
  const original = readFileSync(appPath, 'utf8')
  writeFileSync(appPath, "import { Proto } from './explorations/prototype'\nexport const App = () => <Proto />\n")
  const violation = runHook('block_prototype_imports.py', 'Write', A, '')
  writeFileSync(appPath, original)
  if (violation.exit !== 2 || !violation.stderr.includes('Blocked')) {
    results.push(`  block_prototype_imports.py(apps/*/src): ❌ FALSE-GREEN(exit=${violation.exit})`); fail++
  } else results.push('  block_prototype_imports.py(apps/*/src): ✅ real consumer production import blocked')
}

// 2) 全 15 hook crash 檢查(語法 + 不得 127)
const allHooks = readdirSync(FORK_HOOKS).filter((f) => f.endsWith('.sh') || f.endsWith('.py'))
const crashed = []
for (const h of allHooks) {
  if (h.endsWith('.sh')) {
    try { execFileSync('bash', ['-n', '--', join(FORK_HOOKS, h)], { stdio: 'pipe' }) }
    catch (e) { crashed.push(`${h}: syntax error`); fail++ }
  }
  if (h.endsWith('.py')) {
    try {
      execFileSync('python3', ['-m', 'py_compile', join(FORK_HOOKS, h)], {
        stdio: 'pipe',
        env: childEnvironment({ PYTHONPYCACHEPREFIX: join(RUNTIME_TEMP, 'python-cache') }),
      })
    }
    catch (e) { crashed.push(`${h}: python syntax error`); fail++ }
  }
  // 跑一次 generic CLEAN apps edit:任何非 0 都是 crash 或 false-block。
  // Warning-only hook 仍必須 exit 0；這能防止 exit 1/3/其他錯誤碼被假當成放行。
  const r = runHook(h, 'Write', A, 'export const X=()=><div>x</div>')
  if (r.exit !== 0) { crashed.push(`${h}: exit ${r.exit} on CLEAN file = crash/false-block`); fail++ }
}

// 3) committed 模板治理流程(#6 codex C3:測 dispatcher/bootstrap/injection,不只 fork hook 本體)
// 合成「完整 fork」:committed provider-neutral governance/bin + npm fork corpus,跑 shared 啟動器。
const TPL_LAUNCHERS = join(ROOT, 'template/ds-product-template/governance/bin')
const flowResults = []
function buildFullFixture() {
  if (existsSync(FULL)) rmSync(FULL, { recursive: true, force: true })
  mkdirSync(join(FULL, 'apps/demo/src'), { recursive: true })
  mkdirSync(join(FULL, 'governance/bin'), { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: FULL, stdio: 'pipe' })
  const npmFork = join(FULL, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  mkdirSync(dirname(npmFork), { recursive: true })
  // committed 啟動器
  for (const h of readdirSync(TPL_LAUNCHERS).filter((f) => f.endsWith('.sh') || f.endsWith('.mjs'))) copyFileSync(join(TPL_LAUNCHERS, h), join(FULL, 'governance/bin', h))
  // npm fork corpus(hooks + manifest + provider/common instruction artifacts)
  cpSync(join(ROOT, 'packages/design-system/ds-canonical/fork'), npmFork, { recursive: true })
  mkdirSync(join(FULL, 'node_modules/@qijenchen/design-system/src/tokens'), { recursive: true })
  copyFileSync(
    join(ROOT, 'packages/design-system/src/tokens/utility-registry.json'),
    join(FULL, 'node_modules/@qijenchen/design-system/src/tokens/utility-registry.json'),
  )
  // Day-0 committed bootstrap + immutable governance lock. SessionStart 只驗證，絕不建立它們。
  copyFileSync(join(ROOT, 'template/ds-product-template/AGENTS.md'), join(FULL, 'AGENTS.md'))
  mkdirSync(join(FULL, 'governance'), { recursive: true })
  writeFileSync(join(FULL, 'governance/lock.json'), '{"schemaVersion":1,"governanceVersion":"fixture"}\n')
  writeFileSync(join(FULL, 'node_modules/@qijenchen/design-system/package.json'), '{"name":"@qijenchen/design-system","version":"0.0.0-fixture"}\n')
  writeFileSync(join(FULL, 'apps/demo/src/App.tsx'), 'export const App = () => <div>x</div>\n')
}
function runTpl(hookFile, payload, extraEnv = {}) {
  const r = spawnSync('bash', ['--', join(FULL, 'governance/bin', hookFile)], {
    input: payload,
    encoding: 'utf8',
    cwd: FULL,
    env: childEnvironment({ CLAUDE_PROJECT_DIR: FULL, ...extraEnv }),
  })
  return { exit: r.status == null ? 127 : r.status, out: (r.stdout || ''), err: (r.stderr || '') }
}

// SessionStart 的核心契約是 zero-workspace-mutation。比較完整樹狀內容、mode 與 symlink target，
// 防止未來又偷偷恢復 npm install / launcher refresh / lockfile rewrite。
function fixtureSnapshot(root) {
  const rows = []
  function walk(abs, rel = '') {
    for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))) {
      const path = join(abs, entry.name)
      const key = rel ? `${rel}/${entry.name}` : entry.name
      const st = lstatSync(path)
      if (entry.isDirectory()) {
        rows.push(['dir', key, st.mode & 0o777])
        walk(path, key)
      } else if (entry.isSymbolicLink()) {
        rows.push(['link', key, st.mode & 0o777, readlinkSync(path)])
      } else {
        rows.push(['file', key, st.mode & 0o777, createHash('sha256').update(readFileSync(path)).digest('hex')])
      }
    }
  }
  walk(root)
  return JSON.stringify(rows)
}
buildFullFixture()
// injection:輸出短狀態，且完整工作區 byte-for-byte 不變。
{
  const before = fixtureSnapshot(FULL)
  const r = runTpl('inject_fork_governance_preamble.sh', '{"hook_event_name":"SessionStart"}')
  const after = fixtureSnapshot(FULL)
  let ok = false
  try {
    const j = JSON.parse(r.out)
    const context = j.hookSpecificOutput.additionalContext || ''
    ok = context.includes('committed AGENTS.md') && context.includes('唯讀驗證')
  } catch (e) { ok = false }
  if (!ok) { flowResults.push('  inject_verify_only: ❌ 未輸出 committed AGENTS.md + 唯讀驗證狀態'); fail++ }
  else if (before !== after) { flowResults.push('  inject_verify_only: ❌ SessionStart 改寫了工作區'); fail++ }
  else flowResults.push('  inject_verify_only: ✅ valid status + zero workspace mutation')

  const neutral = runTpl('inject_fork_governance_preamble.sh', '{"event":"SessionStart"}', {
    CLAUDE_PROJECT_DIR: '', GOVERNANCE_PROJECT_DIR: FULL, GOVERNANCE_PROVIDER: 'codex',
  })
  if (neutral.exit !== 0 || !neutral.out.includes('systemMessage')) {
    flowResults.push(`  inject neutral root: ❌ Codex/future adapter root 未生效(exit=${neutral.exit})`); fail++
  } else flowResults.push('  inject neutral root: ✅ GOVERNANCE_PROJECT_DIR works without Claude env')
}
// dispatcher:PostToolUse 違規(手刻 table)→ 轉發 exit 2
{
  const v = runTpl('fork-governance-dispatcher.sh', JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: {
      file_path: 'apps/demo/src/App.tsx',
      content: 'export const X=()=><table><thead><th>a</th></thead></table>',
    },
  }))
  if (v.exit !== 2) { flowResults.push(`  dispatcher(PostToolUse 違規): ❌ 未轉發攔截(exit=${v.exit})`); fail++ }
  else flowResults.push('  dispatcher(PostToolUse 違規): ✅ 轉發 exit 2')
}
// Provider adapter parity:true Codex event/tool/patch fields must normalize into exactly the same
// canonical predicate corpus as Claude. This locks the prior false-green where apply_patch exited 0.
{
  const violation = 'export const X=()=><div className="gap-13 mt-7">x</div>'
  const claude = runTpl('fork-governance-dispatcher.sh', JSON.stringify({
    hook_event_name: 'PostToolUse', tool_name: 'Write',
    tool_input: { file_path: 'apps/demo/src/App.tsx', content: violation },
  }), { GOVERNANCE_PROVIDER: 'claude' })
  const codex = runTpl('fork-governance-dispatcher.sh', JSON.stringify({
    event: 'PostToolUse', tool: 'apply_patch',
    tool_input: {
      command: `*** Begin Patch\n*** Update File: apps/demo/src/App.tsx\n@@\n-export const App = () => <div>x</div>\n+${violation}\n*** End Patch`,
    },
  }), { GOVERNANCE_PROVIDER: 'codex' })
  const codexClean = runTpl('fork-governance-dispatcher.sh', JSON.stringify({
    event: 'PostToolUse', tool: 'apply_patch',
    tool_input: {
      command: '*** Begin Patch\n*** Update File: apps/demo/src/App.tsx\n@@\n-export const App = () => <div>x</div>\n+export const Clean = () => null\n*** End Patch',
    },
  }), { GOVERNANCE_PROVIDER: 'codex' })
  if (claude.exit !== 2 || codex.exit !== 2 || codexClean.exit !== 0) {
    flowResults.push(`  provider normalization parity: ❌ Claude=${claude.exit} Codex=${codex.exit} Codex-clean=${codexClean.exit}; clean-stderr=${JSON.stringify(codexClean.err.trim())}`); fail++
  } else flowResults.push('  provider normalization parity: ✅ Claude Write = Codex apply_patch; both block, clean passes')
}
// An undeclared provider has no normalization/environment contract and must not silently reuse one.
{
  const unknown = runTpl('fork-governance-dispatcher.sh', JSON.stringify({
    event: 'PostToolUse', operation: 'write_file', path: 'apps/demo/src/Clean.tsx', content: 'clean',
  }), { GOVERNANCE_PROVIDER: 'undeclared-provider' })
  if (unknown.exit !== 70 || !unknown.err.includes('GOVERNANCE_INTEGRITY:ADAPTER_UNKNOWN:undeclared-provider')) {
    flowResults.push(`  unknown provider fail-closed: ❌ exit=${unknown.exit}`); fail++
  } else flowResults.push('  unknown provider fail-closed: ✅ integrity-class machine-readable adapter rejection')
}
// dispatcher:PostToolUse CLEAN 檔 → 必 exit 0(B1 回歸鎖:用 bash 跑 .py hook 會 syntax-error exit 2 → 誤擋所有乾淨編輯 = brick)
{
  const c = runTpl('fork-governance-dispatcher.sh', JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: {
      file_path: 'apps/demo/src/App.tsx',
      content: 'export const Clean = () => null',
    },
  }))
  if (c.exit !== 0) { flowResults.push(`  dispatcher(PostToolUse CLEAN 檔): ❌ exit ${c.exit}(應 0;B1 brick 回歸 = 用 bash 跑 .py); stderr=${JSON.stringify(c.err.trim())}`); fail++ }
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
  // committed bootstrap 缺失時只報 degraded；不得自動安裝或修補工作區。
  copyFileSync(join(ROOT, 'packages/design-system/ds-canonical/fork/manifest.json'), join(FULL, 'node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json'))
  rmSync(join(FULL, 'AGENTS.md'), { force: true })
  const before = fixtureSnapshot(FULL)
  const b = runTpl('inject_fork_governance_preamble.sh', '{"hook_event_name":"SessionStart"}')
  const after = fixtureSnapshot(FULL)
  if (b.exit !== 0) { flowResults.push(`  inject(本體缺 fail-open): ❌ exit ${b.exit}(應 0)`); fail++ }
  else if (!b.err.includes('GOVERNANCE-BOOTSTRAP-MISSING')) { flowResults.push('  inject(bootstrap 缺): ❌ 未輸出可機器辨識 degraded code'); fail++ }
  else if (before !== after) { flowResults.push('  inject(bootstrap 缺): ❌ 自動改寫了工作區'); fail++ }
  else flowResults.push('  inject(bootstrap 缺): ✅ exit 0 + degraded notice + zero workspace mutation')
}

// 4) sync-all 接線骨架刷新(refresh-fork-launchers:idempotent + 不 clobber user hook + opt-out)
// 既有 fork 的「接線層完全同步」命脈。模擬既有 fork(有 user 自有 hook + 舊 launcher 註冊)+ npm-current launchers。
const skelResults = []
function buildSkelFixture(withOptOut) {
  if (existsSync(SKEL)) rmSync(SKEL, { recursive: true, force: true })
  mkdirSync(join(SKEL, '.claude/hooks'), { recursive: true })
  const executionRuntime = JSON.parse(readFileSync(join(ROOT, 'packages/design-system/ds-canonical/fork/manifest.json'), 'utf8')).consumer.executionRuntime
  const fixturePackage = {
    name: 'ds-fork-skel',
    private: true,
    scripts: { build: 'vite build' },
    devDependencies: { npm: executionRuntime.exactNpmVersion },
    engines: { node: `>=${executionRuntime.minimumNodeVersion}` },
  }
  writeFileSync(join(SKEL, 'package.json'), `${JSON.stringify(fixturePackage, null, 2)}\n`)
  writeFileSync(join(SKEL, 'package-lock.json'), `${JSON.stringify({
    name: fixturePackage.name,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: fixturePackage.name,
        devDependencies: fixturePackage.devDependencies,
        engines: fixturePackage.engines,
      },
      'node_modules/npm': {
        version: executionRuntime.exactNpmVersion,
        resolved: `https://registry.npmjs.org/npm/-/npm-${executionRuntime.exactNpmVersion}.tgz`,
        integrity: 'sha512-A3eSBeF7eSqCa3kuXymOstWCI9uLMcNxZY7glJosUTnvLJMsV9w6V8Ikirx08w6ch5bYT6BbUsQmJMyEkCfdDA==',
        dev: true,
        bin: { npm: 'bin/npm-cli.js' },
      },
    },
  }, null, 2)}\n`)
  if (withOptOut) { mkdirSync(join(SKEL, '.github'), { recursive: true }); writeFileSync(join(SKEL, '.github/no-governance-sync'), '') }
  const npmFork = join(SKEL, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  const installedDsRoot = join(SKEL, 'node_modules/@qijenchen/design-system')
  mkdirSync(installedDsRoot, { recursive: true })
  copyFileSync(join(ROOT, 'packages/design-system/package.json'), join(installedDsRoot, 'package.json'))
  // Refresh now authenticates the complete installed corpus before its first write. Copy the exact
  // packed layout so this fixture cannot accidentally test a weaker, hand-picked subset.
  cpSync(join(ROOT, 'packages/design-system/ds-canonical/fork'), npmFork, { recursive: true })
  mkdirSync(join(installedDsRoot, 'src/tokens'), { recursive: true })
  copyFileSync(
    join(ROOT, 'packages/design-system/src/tokens/utility-registry.json'),
    join(installedDsRoot, 'src/tokens/utility-registry.json'),
  )
  // 既有 fork settings:user 自有「非治理」hook + 一個「舊版 launcher 註冊」(模擬 pre-update,測去重)
  writeFileSync(join(SKEL, '.claude/settings.json'), JSON.stringify({
    defaultMode: 'auto',
    disableAutoMode: 'disable',
    permissions: {
      allow: [
        'Bash(npm install)',
        'Bash(npm ci)',
        'Bash(npm run *)',
        'Bash(npx *)',
        'Bash(git *)',
        'Bash(my-consumer-owned-safe-tool *)',
      ],
      ask: [
        'Bash(git push *)',
        'Bash(npm publish *)',
        'Bash(my-consumer-owned-sensitive-tool *)',
      ],
    },
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'bash my-own-hook.sh' }, { type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/inject_fork_governance_preamble.sh"' }] }],
      // PostToolUse:user 自有 lint + 一個「含啟動器名為子字串但不是啟動器」的 hook(adversarial FINDING 2b 不得誤刪)
      PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'bash user-lint.sh' }, { type: 'command', command: 'bash ".claude/hooks/my-fork-governance-dispatcher.sh.bak"' }] }],
    },
  }, null, 2))
}
function authorizedRefresh(projectDir, opts = {}) {
  // A dry run and an explicit repository opt-out cannot mutate provider surfaces, so neither
  // needs a durable journal capability. Every real refresh below proves the same trust chain
  // used by sync-all: installed BOM/corpus -> lifecycle transition -> durable journal snapshot.
  if (opts.dryRun || existsSync(join(projectDir, '.github/no-governance-sync'))) {
    return refreshLaunchers(projectDir, opts)
  }
  const verifiedCorpus = validateInstalledForkCorpus(projectDir)
  const providerTransition = validateInstalledProviderTransition(verifiedCorpus, verifiedCorpus)
  const transactionCapability = authorizeDisposableProviderRefreshTransaction({
    projectDir,
    verifiedCorpus,
    providerTransition,
  })
  return refreshLaunchers(projectDir, {
    ...opts,
    verifiedCorpus,
    providerTransition,
    transactionCapability,
  })
}
// 4a 正常刷新
buildSkelFixture(false)
const r1 = authorizedRefresh(SKEL)
{
  const installedNpmFork = join(SKEL, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  const installedForkManifest = JSON.parse(readFileSync(
    join(installedNpmFork, 'manifest.json'),
    'utf8',
  ))
  const expectedLaunchers = installedForkManifest.launchers
  const launchersCopied = JSON.stringify(r1.copied) === JSON.stringify(expectedLaunchers)
    && expectedLaunchers.every((launcher) => existsSync(join(SKEL, installedForkManifest.consumer.launcherDestination, launcher)))
  const s = JSON.parse(readFileSync(join(SKEL, '.claude/settings.json'), 'utf8'))
  const cmds = JSON.stringify(s.hooks)
  const hasAllLaunchers = ['fork-governance-dispatcher.sh', 'inject_fork_governance_preamble.sh'].every((l) => cmds.includes(l))
  const events5 = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'UserPromptSubmit'].every((ev) => s.hooks[ev])
  const userHookKept = cmds.includes('my-own-hook.sh') && cmds.includes('user-lint.sh')
  const substringHookKept = cmds.includes('my-fork-governance-dispatcher.sh.bak') // FINDING 2b:子字串碰撞不得誤刪
  const noDupInject = (cmds.match(/\/inject_fork_governance_preamble\.sh/g) || []).length === 1
  const retiredUnsafeAllows = ['Bash(npm install)', 'Bash(npm ci)', 'Bash(npm run *)', 'Bash(npx *)', 'Bash(git *)']
  const retiredUnsafeAllowsGone = retiredUnsafeAllows.every((rule) => !(s.permissions?.allow || []).includes(rule))
  const canonicalClaudeConfig = JSON.parse(readFileSync(
    join(installedNpmFork, installedForkManifest.providerSurfaces.claude.hookArtifact),
    'utf8',
  ))
  const consumerSafeAllowKept = (s.permissions?.allow || []).includes('Bash(my-consumer-owned-safe-tool *)')
  const staleConsumerAsksRetired = [
    'Bash(git push *)',
    'Bash(npm publish *)',
    'Bash(my-consumer-owned-sensitive-tool *)',
  ].every((rule) => !(s.permissions?.ask || []).includes(rule))
  const canonicalAskApplied =
    JSON.stringify(s.permissions?.ask || []) === JSON.stringify(canonicalClaudeConfig.permissions?.ask || [])
  const unsafeModesDisabled = !Object.hasOwn(s, 'disableAutoMode')
    && !Object.hasOwn(canonicalClaudeConfig, 'disableAutoMode')
    && s.permissions?.defaultMode === canonicalClaudeConfig.permissions?.defaultMode
    && s.permissions?.disableBypassPermissionsMode === canonicalClaudeConfig.permissions?.disableBypassPermissionsMode
    && !Object.hasOwn(s.permissions || {}, 'disableAutoMode')
    && !Object.hasOwn(s, 'defaultMode')
  if (!launchersCopied) { skelResults.push(`  refresh: ❌ 啟動器未依 authenticated manifest 全量 copy(expected=${expectedLaunchers.length}, actual=${r1.copied?.length ?? 0})`); fail++ }
  else if (!hasAllLaunchers || !events5) { skelResults.push('  refresh: ❌ settings 缺啟動器註冊 / 缺 5-event'); fail++ }
  else if (!userHookKept) { skelResults.push('  refresh: ❌ clobber 了 user 自有非治理 hook'); fail++ }
  else if (!substringHookKept) { skelResults.push('  refresh: ❌ 子字串碰撞 hook 被誤刪(FINDING 2b 回歸)'); fail++ }
  else if (!noDupInject) { skelResults.push('  refresh: ❌ 舊 launcher 註冊沒去重(inject 重複)'); fail++ }
  else if (!retiredUnsafeAllowsGone || !consumerSafeAllowKept || !staleConsumerAsksRetired || !canonicalAskApplied || !unsafeModesDisabled) { skelResults.push('  refresh: ❌ unsafe allow/ask 退役 / consumer safe allow 保留 / canonical ask / safe mode 不完整'); fail++ }
  else skelResults.push(`  refresh: ✅ authenticated launcher inventory copy(${expectedLaunchers.length})+ 5-event 註冊 + user hook/safe allow 保留 + 子字串不誤刪 + 去重 + stale engineering ask 退役 + canonical ask/safe-mode 強制`)
}
// 4b idempotent
{
  const before = readFileSync(join(SKEL, '.claude/settings.json'), 'utf8')
  authorizedRefresh(SKEL)
  const after = readFileSync(join(SKEL, '.claude/settings.json'), 'utf8')
  if (before !== after) { skelResults.push('  idempotent: ❌ 第二次刷新改了 settings(非冪等 → 重跑會疊加)'); fail++ }
  else skelResults.push('  idempotent: ✅ 重跑 settings 完全一致')
}
// 4c opt-out
{
  buildSkelFixture(true)
  const r = authorizedRefresh(SKEL)
  if (!r.skipped) { skelResults.push('  opt-out: ❌ 有 .github/no-governance-sync 仍刷新(應 skip)'); fail++ }
  else skelResults.push(`  opt-out: ✅ skip(${r.skipped})`)
}
// 4d JSONC settings(// 註解,Claude Code 允許)→ 仍能容忍 + merge(MINOR 2 回歸鎖)
{
  buildSkelFixture(false)
  writeFileSync(join(SKEL, '.claude/settings.json'), '{\n  // fork user 自己加的註解\n  "defaultMode": "auto",\n  "hooks": {} /* block 註解 */\n}')
  let r, threw = false
  try { r = authorizedRefresh(SKEL) } catch (e) { threw = true }
  const s = (!threw && r?.settingsMerged) ? JSON.parse(readFileSync(join(SKEL, '.claude/settings.json'), 'utf8')) : null
  const hasLauncher = s && JSON.stringify(s.hooks).includes('inject_fork_governance_preamble.sh')
  if (threw || !hasLauncher) { skelResults.push(`  JSONC settings: ❌ // 註解的 settings 沒容忍/沒 merge(threw=${threw})`); fail++ }
  else skelResults.push('  JSONC settings: ✅ // + block 註解容忍 + merge 成功')
}
// 4e obsolete plugin-era registration 移除(BLOCKER run-3 回歸鎖:舊 blocker 不得再被執行)。
// 不刪同名檔:consumer 可能已自行修改；只移除 BOM/corpus-bound 的 exact registration。
{
  buildSkelFixture(false)
  writeFileSync(join(SKEL, '.claude/hooks/block_production_edit_without_plugin.sh'), '#!/bin/bash\nexit 2\n')
  writeFileSync(join(SKEL, '.claude/settings.json'), JSON.stringify({
    hooks: { PreToolUse: [{ matcher: 'Edit|Write', hooks: [
      { type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/block_production_edit_without_plugin.sh"' },
      { type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/my-block_production_edit_without_plugin.sh.bak"' },
    ] }] },
  }, null, 2))
  const r = authorizedRefresh(SKEL)
  const fileKept = existsSync(join(SKEL, '.claude/hooks/block_production_edit_without_plugin.sh'))
  const s = JSON.parse(readFileSync(join(SKEL, '.claude/settings.json'), 'utf8'))
  const serializedHooks = JSON.stringify(s.hooks)
  const exactRegistrationGone = !serializedHooks.includes('/block_production_edit_without_plugin.sh"')
  const substringHookKept = serializedHooks.includes('my-block_production_edit_without_plugin.sh.bak')
  const reported = (r.removed || []).includes('claude-plugin-bootstrap-blocker')
  if (!fileKept || !exactRegistrationGone || !substringHookKept || !reported) {
    skelResults.push(`  obsolete registration: ❌ fileKept=${fileKept}/exactGone=${exactRegistrationGone}/substringKept=${substringHookKept}/reported=${reported}`); fail++
  } else skelResults.push('  obsolete registration: ✅ 舊 blocker 停用；相似 user hook + 同名檔保留；migration 可稽核')
}
// 4f skill 送達(2026-06-18:C-prime 補 skill 送達 → fork 可叫用 /prototype;根治 root cause)
{
  buildSkelFixture(false)
  // user 自有非治理 skill(不得被 clobber)
  mkdirSync(join(SKEL, '.claude/skills/my-team-skill'), { recursive: true })
  writeFileSync(join(SKEL, '.claude/skills/my-team-skill/SKILL.md'), '---\nname: my-team-skill\n---\nmine')
  const r = authorizedRefresh(SKEL)
  const protoPath = join(SKEL, '.claude/skills/prototype/SKILL.md')
  const protoThere = existsSync(protoPath)
  const fmValid = protoThere && /^---[\s\S]*?\bname:\s*prototype\b[\s\S]*?^---/m.test(readFileSync(protoPath, 'utf8'))
  const forkManifest = JSON.parse(readFileSync(join(SKEL, 'node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json'), 'utf8'))
  const claudeSurface = forkManifest.providerSurfaces.claude
  const expectedClaudeSkillPaths = claudeSurface.skills.map((name) => `${claudeSurface.skillDestination}/${name}`)
  const reportedClaudeSkills = (r.providers?.claude?.installed || []).filter((path) => path.startsWith(`${claudeSurface.skillDestination}/`))
  const allSkillsReported = JSON.stringify(reportedClaudeSkills.sort()) === JSON.stringify(expectedClaudeSkillPaths.sort())
  const expectedSummarySkills = [...new Set(Object.values(forkManifest.providerSurfaces).flatMap((surface) => surface.skills || []))].sort()
  const skillSummaryReported = JSON.stringify((r.skills || []).sort()) === JSON.stringify(expectedSummarySkills)
  const noDropSkill = !existsSync(join(SKEL, '.claude/skills/design-system-audit')) // DROP 的 DS-internal 不得誤送
  const userSkillKept = existsSync(join(SKEL, '.claude/skills/my-team-skill/SKILL.md'))
  // clobber proof:竄改治理 skill → 再 refresh → 還原
  writeFileSync(protoPath, 'tampered')
  authorizedRefresh(SKEL)
  const reverted = existsSync(protoPath) && readFileSync(protoPath, 'utf8') !== 'tampered'
  // idempotent:第二次 refresh skill byte 不變
  const b = readFileSync(protoPath, 'utf8'); authorizedRefresh(SKEL); const idem = readFileSync(protoPath, 'utf8') === b
  if (!protoThere) { skelResults.push('  skill 送達: ❌ /prototype 未複製進 .claude/skills/'); fail++ }
  else if (!fmValid) { skelResults.push('  skill 送達: ❌ prototype SKILL.md frontmatter name 不合法(Claude Code 會靜默不載)'); fail++ }
  else if (!allSkillsReported || !skillSummaryReported) { skelResults.push(`  skill 送達: ❌ manifest 宣告 ${expectedClaudeSkillPaths.length} 個，provider report 實得 ${reportedClaudeSkills.length}，union summary=${skillSummaryReported}`); fail++ }
  else if (!noDropSkill) { skelResults.push('  skill 送達: ❌ DROP 的 DS-internal skill(design-system-audit)被誤送'); fail++ }
  else if (!userSkillKept) { skelResults.push('  skill 送達: ❌ clobber 了 user 自有 skill(my-team-skill)'); fail++ }
  else if (!reverted) { skelResults.push('  skill 送達: ❌ 竄改的治理 skill 沒被還原(clobber 失效)'); fail++ }
  else if (!idem) { skelResults.push('  skill 送達: ❌ 重跑 skill 內容變動(非冪等)'); fail++ }
  else skelResults.push(`  skill 送達: ✅ /prototype 等 ${expectedClaudeSkillPaths.length} skill 由 provider manifest 完整送達 + frontmatter 合法 + 無 DROP 誤送 + user skill 保留 + clobber 還原 + 冪等`)
}
// 4g committed scaffold == generated(drift lock:stale scaffold → CI 紅,同 ds-canonical/fork 一致)
{
  const genSkills = join(ROOT, 'packages/design-system/ds-canonical/fork/providers/claude/skills')
  const scaffoldSkills = join(ROOT, 'template/ds-product-template/.claude/skills')
  const drift = fixtureSnapshot(genSkills) !== fixtureSnapshot(scaffoldSkills)
  if (drift) { skelResults.push('  scaffold drift: ❌ template/.claude/skills ≠ fork/providers/claude/skills(重跑 build-fork-governance + commit)'); fail++ }
  else skelResults.push('  scaffold drift: ✅ committed Claude scaffold == provider projection(byte-equal)')
}
// 4h codex surface 送達(PNG P2.4b:sync-all 把 AGENTS.md / .codex/hooks.json / .agents/skills 裝進既有 fork root)
{
  buildSkelFixture(false)
  // user 自有 .agents skill(治理名以外,不得被 clobber)
  mkdirSync(join(SKEL, '.agents/skills/my-own-review'), { recursive: true })
  writeFileSync(join(SKEL, '.agents/skills/my-own-review/SKILL.md'), 'mine')
  mkdirSync(join(SKEL, 'governance'), { recursive: true })
  writeFileSync(join(SKEL, 'governance/overlay.md'), '# Product-owned policy\n')
  const r = authorizedRefresh(SKEL)
  const agentsMd = join(SKEL, 'AGENTS.md')
  const codexHooks = join(SKEL, '.codex/hooks.json')
  const codexPrototypeSkill = join(SKEL, '.agents/skills/prototype/SKILL.md')
  const governanceLock = join(SKEL, 'governance/lock.json')
  const governanceCheck = join(SKEL, 'scripts/governance-check.mjs')
  const forkManifest = JSON.parse(readFileSync(join(SKEL, 'node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json'), 'utf8'))
  const codexSurface = forkManifest.providerSurfaces.codex
  const expectedCodex = [codexSurface.hookDestination, ...codexSurface.skills.map((name) => `${codexSurface.skillDestination}/${name}`)]
  const corpusAgents = readFileSync(join(SKEL, 'node_modules/@qijenchen/design-system/ds-canonical/fork/AGENTS.md'), 'utf8')
  const created = existsSync(agentsMd) && existsSync(codexHooks) && existsSync(codexPrototypeSkill) && existsSync(governanceLock) && existsSync(governanceCheck) &&
    codexSurface.skills.every((name) => existsSync(join(SKEL, `${codexSurface.skillDestination}/${name}/SKILL.md`)))
  const reported = expectedCodex.length === (r.providers?.codex?.installed || []).length && expectedCodex.every((path) => (r.providers?.codex?.installed || []).includes(path))
  const codexPrototype = readFileSync(join(SKEL, '.agents/skills/prototype/SKILL.md'), 'utf8')
  const claudePrototype = readFileSync(join(SKEL, '.claude/skills/prototype/SKILL.md'), 'utf8')
  const stripProjectionProvenance = (body) => body.replace(
    /<!-- _generated: canonical provider skill projection; source:[^>]*; provider:[^>]*; do not edit this adapter view\. -->\r?\n/g,
    '',
  )
  const sharedSkillParity = stripProjectionProvenance(codexPrototype) === stripProjectionProvenance(claudePrototype) &&
    /provider: codex;/.test(codexPrototype) && /provider: claude;/.test(claudePrototype)
  const governanceReported = JSON.stringify((r.governance || []).sort()) === JSON.stringify(['AGENTS.md', 'governance/lock.json', 'governance/lock.schema.json', 'scripts/governance-check.mjs'])
  const corpusGovernanceLock = readFileSync(join(SKEL, 'node_modules/@qijenchen/design-system/ds-canonical/fork/consumer/lock.json'), 'utf8')
  const corpusGovernanceCheck = readFileSync(join(SKEL, 'node_modules/@qijenchen/design-system/ds-canonical/fork/consumer/governance-check.mjs'), 'utf8')
  writeFileSync(governanceLock, '{"tampered":true}\n')
  writeFileSync(governanceCheck, 'tampered\n')
  authorizedRefresh(SKEL)
  const governanceReverted = readFileSync(governanceLock, 'utf8') === corpusGovernanceLock &&
    readFileSync(governanceCheck, 'utf8') === corpusGovernanceCheck
  const userAgentsSkillKept = readFileSync(join(SKEL, '.agents/skills/my-own-review/SKILL.md'), 'utf8') === 'mine'
  // clobber proof:竄改 generated AGENTS.md(留 marker)→ 再 refresh → 還原 byte-equal corpus
  writeFileSync(agentsMd, '> stale generated by build-fork-governance.mjs\ntampered')
  authorizedRefresh(SKEL)
  const reverted = readFileSync(agentsMd, 'utf8') === corpusAgents
  // AGENTS.md 是 BOM-bound governance authority，無論 marker 都必須 clobber；product 只可放 overlay。
  writeFileSync(agentsMd, '# My own agents doc\n')
  const r2 = authorizedRefresh(SKEL)
  const unmanagedAgentsClobbered = readFileSync(agentsMd, 'utf8') === corpusAgents
  const managedAgentsReported = (r2.governance || []).includes('AGENTS.md')
  const overlayKept = readFileSync(join(SKEL, 'governance/overlay.md'), 'utf8') === '# Product-owned policy\n'
  // 還原 generated 後:冪等(重跑三檔 byte 不變)
  writeFileSync(agentsMd, corpusAgents)
  const b1 = readFileSync(agentsMd, 'utf8'); const b2 = readFileSync(codexHooks, 'utf8'); const b3 = readFileSync(codexPrototypeSkill, 'utf8')
  authorizedRefresh(SKEL)
  const idem = readFileSync(agentsMd, 'utf8') === b1 && readFileSync(codexHooks, 'utf8') === b2 && readFileSync(codexPrototypeSkill, 'utf8') === b3
  // dry-run(§15):刪 .codex → dryRun 報 would-install 但 disk 不寫
  rmSync(join(SKEL, '.codex'), { recursive: true, force: true })
  const rd = authorizedRefresh(SKEL, { dryRun: true })
  const dryOk = (rd.codex || []).includes('.codex/hooks.json') && !existsSync(codexHooks) && rd.dryRun === true
  if (!created || !reported) { skelResults.push(`  codex 送達: ❌ AGENTS.md/.codex/.agents 未全裝(created=${created} / reported=${(r.codex || []).join(',')})`); fail++ }
  else if (!sharedSkillParity) { skelResults.push('  codex 送達: ❌ prototype provider views 未保留同一 semantic body + 獨立 provenance'); fail++ }
  else if (!userAgentsSkillKept) { skelResults.push('  codex 送達: ❌ clobber 了 user 自有 .agents/skills(my-own-review)'); fail++ }
  else if (!reverted) { skelResults.push('  codex 送達: ❌ 竄改的 generated AGENTS.md 沒被還原(clobber 失效)'); fail++ }
  else if (!unmanagedAgentsClobbered || !managedAgentsReported || !overlayKept) { skelResults.push(`  codex 送達: ❌ immutable AGENTS/overlay 邊界失效(clobbered=${unmanagedAgentsClobbered} / reported=${managedAgentsReported} / overlay=${overlayKept})`); fail++ }
  else if (!idem) { skelResults.push('  codex 送達: ❌ 重跑內容變動(非冪等)'); fail++ }
  else if (!dryOk) { skelResults.push(`  codex 送達: ❌ dry-run 失契(codex=${(rd.codex || []).join(',')} / 寫了檔=${existsSync(codexHooks)})`); fail++ }
  else skelResults.push(`  codex 送達: ✅ bootstrap + ${codexSurface.skills.length} skills + immutable BOM 全裝；Claude/Codex parity + tamper restore + dry-run`)
}

// An attacker-controlled parent symlink must never redirect a managed copy outside the consumer.
// Exercise both the earliest provider surface and a later managed workflow destination.
for (const targetName of ['governance', '.claude', '.github']) {
  buildSkelFixture(false)
  const external = join(TEST_ROOT, `symlink-external-${targetName.replace(/^\./, '')}`)
  mkdirSync(external, { recursive: true })
  const canary = join(external, 'DO-NOT-TOUCH.txt')
  writeFileSync(canary, 'external canary')
  rmSync(join(SKEL, targetName), { recursive: true, force: true })
  symlinkSync(external, join(SKEL, targetName))
  let rejected = false
  try { authorizedRefresh(SKEL) } catch (error) { rejected = /symlink/.test(String(error?.message || error)) }
  const externalNames = readdirSync(external).sort()
  if (!rejected || readFileSync(canary, 'utf8') !== 'external canary' || externalNames.join(',') !== 'DO-NOT-TOUCH.txt') {
    skelResults.push(`  symlink containment(${targetName}): ❌ 未在 external mutation 前 fail closed`); fail++
  } else skelResults.push(`  symlink containment(${targetName}): ✅ parent symlink rejected; external canary unchanged`)
  rmSync(join(SKEL, targetName), { force: true })
  rmSync(external, { recursive: true, force: true })
}

// 5) codex surface(PNG P2.4:AGENTS.md / codex/hooks.json / product-role skill parity)
const codexResults = []
{
  const FORK_OUT = join(ROOT, 'packages/design-system/ds-canonical/fork')
  // 5a fork AGENTS.md:存在 + true product-role authority + installed canonical pointers;
  // DS-author-only release/preflight/local-tool instructions must never leak into consumers.
  const agentsPath = join(FORK_OUT, 'AGENTS.md')
  if (!existsSync(agentsPath)) { codexResults.push('  codex AGENTS.md: ❌ fork/AGENTS.md 不存在'); fail++ }
  else {
    const a = readFileSync(agentsPath, 'utf8')
    const productRole = a.includes('Product consumer AI governance') && a.includes('npm run governance:check')
    const installedPointers = a.includes('node_modules/@qijenchen/design-system/src/')
    const authorLeak = /release:preflight|npm publish|scripts\/codex-run-guarded\.mjs|check_file_size_budget\.sh|sync-governance-counters\.mjs/.test(a)
    const rootAgents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')
    const authorityStart = '<!-- canonical-decision-authority:start -->'
    const authorityEnd = '<!-- canonical-decision-authority:end -->'
    const startOffset = rootAgents.indexOf(authorityStart)
    const endOffset = rootAgents.indexOf(authorityEnd)
    const authorityProjection = startOffset >= 0 && endOffset > startOffset
      ? rootAgents.slice(startOffset, endOffset + authorityEnd.length)
      : ''
    const productRoleSource = readFileSync(join(ROOT, 'scripts/fork-role-sources/AGENTS.product.md'), 'utf8')
    const projectionBound = authorityProjection.length > 0
      && rootAgents.lastIndexOf(authorityStart) === startOffset
      && rootAgents.lastIndexOf(authorityEnd) === endOffset
      && (a.split(authorityProjection).length - 1) === 1
      && (productRoleSource.split('<!-- canonical-decision-authority:inject -->').length - 1) === 1
      && !a.includes('<!-- canonical-decision-authority:inject -->')
    const corpusLock = JSON.parse(readFileSync(join(FORK_OUT, 'governance.lock'), 'utf8'))
    const instructionLock = corpusLock.entries.find((entry) => entry.file === 'common/instruction.md')
    const projectionProvenance = instructionLock?.source ===
      'scripts/fork-role-sources/AGENTS.product.md + AGENTS.md#canonical-decision-authority'
    if (!productRole || !installedPointers || authorLeak || !projectionBound || !projectionProvenance) {
      codexResults.push(`  codex AGENTS.md: ❌ product=${productRole} / installed=${installedPointers} / authorLeak=${authorLeak} / authorityProjection=${projectionBound} / provenance=${projectionProvenance}`); fail++
    } else codexResults.push('  codex AGENTS.md: ✅ product-role content + exact root Decision Authority projection + installed pointers + zero DS-author command leakage')
  }
  // 5b template committed AGENTS.md == fork/AGENTS.md(byte-equal;stale scaffold → 紅)
  const tplAgents = join(ROOT, 'template/ds-product-template/AGENTS.md')
  if (!existsSync(tplAgents) || readFileSync(tplAgents, 'utf8') !== readFileSync(agentsPath, 'utf8')) {
    codexResults.push('  template AGENTS.md: ❌ 缺檔或 ≠ fork/AGENTS.md(重跑 build-fork-governance + commit)'); fail++
  } else codexResults.push('  template AGENTS.md: ✅ committed scaffold == 生成物(byte-equal)')
  // 5c codex/hooks.json:可 parse + event wiring 與 Claude settings 同源 + 每 command 指向
  // provider-neutral shared adapter。兩 provider 因而進同一 dispatcher/manifest/corpus，不維護第二份 rule mapping。
  const hj = join(FORK_OUT, 'codex/hooks.json')
  if (!existsSync(hj)) { codexResults.push('  codex hooks.json: ❌ fork/codex/hooks.json 不存在'); fail++ }
  else {
    let parsed = null
    try { parsed = JSON.parse(readFileSync(hj, 'utf8')) } catch { /* parse fail ↓ */ }
    const cmds = parsed ? Object.values(parsed.hooks || {}).flatMap((groups) => groups.flatMap((g) => (g.hooks || []).map((h) => h.command || ''))) : []
    const tplSettings = JSON.parse(readFileSync(join(ROOT, 'template/ds-product-template/.claude/settings.json'), 'utf8'))
    const expectedEvents = Object.keys(tplSettings.hooks || {}).sort()
    const actualEvents = Object.keys(parsed?.hooks || {}).sort()
    const launcherNames = cmds.map((c) => c.match(/governance\/bin\/([a-z0-9_-]+\.sh)/)?.[1]).filter(Boolean)
    const badPath = launcherNames.filter((name) => !existsSync(join(ROOT, 'template/ds-product-template/governance/bin', name)))
    const rootPinned = cmds.every((command) => {
      const launcher = command.match(/governance\/bin\/([a-z0-9_-]+\.sh) codex$/)?.[1]
      if (!launcher) return false
      const expected = buildProviderHookLaunchArgv([
        '/bin/bash',
        '--',
        `governance/bin/${launcher}`,
        'codex',
      ]).join(' ')
      return command === expected
        && !/\$\(|bash\s+-lc|GOVERNANCE_PROJECT_DIR=|GOVERNANCE_PROVIDER=/.test(command)
    })
    const sameEvents = JSON.stringify(expectedEvents) === JSON.stringify(actualEvents)
    const manifestLaunchers = JSON.parse(readFileSync(join(FORK_OUT, 'manifest.json'), 'utf8')).codex.hooksJson || []
    const sameLaunchers = JSON.stringify([...new Set(launcherNames)].sort()) === JSON.stringify([...manifestLaunchers].sort())
    if (!parsed) { codexResults.push('  codex hooks.json: ❌ JSON parse fail'); fail++ }
    else if (!cmds.length || launcherNames.length !== cmds.length || badPath.length || !rootPinned || !sameEvents || !sameLaunchers) {
      codexResults.push(`  codex hooks.json: ❌ commands=${cmds.length} / unresolved=${badPath.length} / structured-relative=${rootPinned} / events=${sameEvents} / manifest=${sameLaunchers}`); fail++
    } else codexResults.push(`  codex hooks.json: ✅ ${actualEvents.length} events → fixed env-clean command / zero shell interpolation → governance/bin 的 ${manifestLaunchers.length} shared thin adapters`)
  }
  // 5d Product-role skill inventory must be provider-symmetric. The product-safe reviewer is
  // present for both providers while the DS-author canonical reviewer stays excluded.
  const codexIndependent = join(FORK_OUT, 'providers/codex/skills/independent-review/SKILL.md')
  const claudeIndependent = join(FORK_OUT, 'providers/claude/skills/independent-review/SKILL.md')
  const canonicalReviewers = [
    join(FORK_OUT, 'providers/codex/skills/canonical-reviewer/SKILL.md'),
    join(FORK_OUT, 'providers/claude/skills/canonical-reviewer/SKILL.md'),
  ]
  const surfaceManifest = JSON.parse(readFileSync(join(FORK_OUT, 'manifest.json'), 'utf8')).providerSurfaces
  const claudeProductSkills = surfaceManifest.claude.skills || []
  const codexProductSkills = surfaceManifest.codex.skills || []
  const symmetricProductSkills = JSON.stringify(claudeProductSkills) === JSON.stringify(codexProductSkills)
  const productReviewerPresent = existsSync(codexIndependent) && existsSync(claudeIndependent)
  const authorReviewerAbsent = canonicalReviewers.every((path) => !existsSync(path))
  const reviewerRoleSafe = productReviewerPresent
    && [codexIndependent, claudeIndependent].every((path) => {
      const body = readFileSync(path, 'utf8')
      return body.includes('targetCertificationContract: exact-provider-runtime-surface-role-target-v1')
        && body.includes('reviewMutation: read-only')
        && body.includes('never acquire DS-author, release, or mutation authority')
    })
  if (!reviewerRoleSafe || !authorReviewerAbsent || !symmetricProductSkills) {
    codexResults.push(`  product skill role boundary: ❌ product-review=${productReviewerPresent}/${reviewerRoleSafe} / author-review-absent=${authorReviewerAbsent} / provider parity=${symmetricProductSkills}`); fail++
  } else codexResults.push('  product skill role boundary: ✅ Claude/Codex independent-review parity; read-only/certified-target contract; DS-author reviewer excluded')
  // Product-role rewriting must not treat a `.sh` substring inside a hostname
  // as a shell-hook reference. This previously changed
  // `polaris.shopify.com` into `the installed immutable governance
  // checkeropify.com` in every Claude/Codex product skill projection.
  const benchmarkCopies = [
    join(FORK_OUT, 'skills/prototype/references/benchmark-sources.md'),
    join(FORK_OUT, 'providers/claude/skills/prototype/references/benchmark-sources.md'),
    join(FORK_OUT, 'providers/codex/skills/prototype/references/benchmark-sources.md'),
    join(ROOT, 'template/ds-product-template/.claude/skills/prototype/references/benchmark-sources.md'),
    join(ROOT, 'template/ds-product-template/.agents/skills/prototype/references/benchmark-sources.md'),
  ]
  const hostnamePreserved = benchmarkCopies.every((path) => existsSync(path)
    && readFileSync(path, 'utf8').includes('polaris.shopify.com')
    && !readFileSync(path, 'utf8').includes('checkeropify.com'))
  if (!hostnamePreserved) { codexResults.push('  skill prose integrity: ❌ product projection corrupted a non-hook hostname'); fail++ }
  else codexResults.push('  skill prose integrity: ✅ hook rewriting preserves ordinary hostnames across shared/Claude/Codex views')
}

// 6) Retire-Claude dependency closure. Removing the entire Claude discovery/runtime surface must
// not remove any byte or path needed by Codex. This is stronger than checking config strings: the
// post-retirement Codex dispatcher must still execute the shared corpus and block a real violation.
{
  buildSkelFixture(false)
  mkdirSync(join(SKEL, 'apps/demo/src'), { recursive: true })
  writeFileSync(join(SKEL, 'apps/demo/src/App.tsx'), 'export const App = () => null\n')
  execFileSync('git', ['init', '-q'], { cwd: SKEL, stdio: 'pipe' })
  authorizedRefresh(SKEL)
  const forkManifest = JSON.parse(readFileSync(join(SKEL, 'node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json'), 'utf8'))
  const codexConfig = JSON.parse(readFileSync(join(SKEL, '.codex/hooks.json'), 'utf8'))
  const commands = Object.values(codexConfig.hooks || {}).flatMap((groups) => groups.flatMap((group) => (group.hooks || []).map((hook) => hook.command || '')))
  const launcherDestination = forkManifest.consumer.launcherDestination
  const sharedOwnedByProvider = Object.entries(forkManifest.providerSurfaces).some(([, surface]) =>
    (surface.managedSurfaces || []).some((managed) => managed.path === launcherDestination || managed.path.startsWith(`${launcherDestination}/`)))
  const codexDependsOnClaude = commands.some((command) => command.includes('/.claude/'))
  const neutralLauncherCommands = new Set((forkManifest.codex.hooksJson || []).map((name) =>
    buildProviderHookLaunchArgv(['/bin/bash', '--', `${launcherDestination}/${name}`, 'codex']).join(' ')))
  const codexUsesNeutral = commands.length > 0 && commands.every((command) => neutralLauncherCommands.has(command))
  rmSync(join(SKEL, '.claude'), { recursive: true, force: true })
  const runCodex = (payload) => spawnSync('bash', ['--', join(SKEL, launcherDestination, 'fork-governance-dispatcher.sh')], {
    input: JSON.stringify(payload), encoding: 'utf8', cwd: SKEL,
    env: childEnvironment({ GOVERNANCE_PROVIDER: 'codex', GOVERNANCE_PROJECT_DIR: SKEL }),
  })
  const clean = runCodex({
    event: 'PostToolUse',
    tool: 'apply_patch',
    tool_input: {
      command: '*** Begin Patch\n*** Update File: apps/demo/src/App.tsx\n@@\n-export const App = () => null\n+export const Clean = () => null\n*** End Patch',
    },
  })
  const violation = runCodex({
    event: 'PostToolUse', tool: 'apply_patch',
    tool_input: {
      command: '*** Begin Patch\n*** Update File: apps/demo/src/App.tsx\n@@\n-export const App = () => null\n+export const X=()=><table><thead><th>a</th></thead></table>\n*** End Patch',
    },
  })
  const claudeStillAbsent = !existsSync(join(SKEL, '.claude'))
  if (sharedOwnedByProvider || codexDependsOnClaude || !codexUsesNeutral || clean.status !== 0 || violation.status !== 2 || !claudeStillAbsent) {
    codexResults.push(`  retire-Claude closure: ❌ sharedOwned=${sharedOwnedByProvider}/claudeDependency=${codexDependsOnClaude}/neutral=${codexUsesNeutral}/clean=${clean.status}/violation=${violation.status}/claudeAbsent=${claudeStillAbsent}; clean-stderr=${JSON.stringify((clean.stderr || '').trim())}`); fail++
  } else codexResults.push('  retire-Claude closure: ✅ 刪除整個 .claude 後，Codex 仍由 governance/bin 執行同一 corpus（clean pass / violation block）')
}

console.log('=== 假 fork 測試 harness 結果 ===')
console.log(`fixture: ${FIX}(apps/** + node_modules/@qijenchen/design-system/src,NO packages/design-system)`)
console.log(results.join('\n'))
console.log('\n=== committed 模板治理流程(dispatcher/bootstrap/injection)===')
console.log(flowResults.join('\n'))
console.log('\n=== 接線骨架刷新(sync-all refresh-fork-launchers:idempotent / 不 clobber / opt-out)===')
console.log(skelResults.join('\n'))
console.log('\n=== codex surface(PNG P2.4:AGENTS.md / hooks.json / product-role skill parity)===')
console.log(codexResults.join('\n'))
console.log(`\ncrash 檢查(${allHooks.length} hook):${crashed.length ? '\n  ' + crashed.join('\n  ') : '✅ 無 syntax error / 無 exit-127'}`)
console.log(`\n${fail === 0 ? '✅ FORK-GOVERNANCE HARNESS PASS — 無 false-green / 無 brick / 無 crash' : `❌ ${fail} 項 fail(見上）`}`)
if (fail !== 0) process.exitCode = 1
} finally {
  rmSync(TEST_ROOT, { recursive: true, force: true })
}

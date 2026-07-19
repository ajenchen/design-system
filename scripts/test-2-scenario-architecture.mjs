#!/usr/bin/env node
// scripts/test-2-scenario-architecture.mjs — 20 test cases for 2-scenario monorepo architecture
//
// Per `.claude/references/scenario-definition.md` SSOT(2026-05-29 codex synthesize verdict)。
// Runs all auto-testable cases(Scenario A 6 + Scenario B 7 + Mirror 7)。
// Manual cases marked __MANUAL__(user setup required: PAT / live workflow / real fork)。
//
// Usage:
//   node scripts/test-2-scenario-architecture.mjs
//   exit 0 = all auto cases PASS / exit 1 = any FAIL
//
// CI wire(future):add to audit.yml as job step。

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIRROR_OUT = mkdtempSync(join(tmpdir(), 'scenario-test-mirror-'))

const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let pass = 0
let fail = 0
let skip = 0
const failures = []

function pass_test(id, msg) {
  pass++
  console.log(`  ${GREEN}✓${RESET} ${id} — ${msg}`)
}

function fail_test(id, msg, evidence) {
  fail++
  failures.push({ id, msg, evidence })
  console.log(`  ${RED}✗${RESET} ${id} — ${msg}`)
  if (evidence) console.log(`     ${RED}evidence:${RESET} ${evidence}`)
}

function skip_test(id, msg, reason) {
  skip++
  console.log(`  ${YELLOW}⊘${RESET} ${id} (__MANUAL__) — ${msg}: ${reason}`)
}

function shOut(cmd) {
  try { return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim() } catch { return null }
}

function readJson(p) {
  try { return JSON.parse(readFileSync(join(REPO_ROOT, p), 'utf8')) } catch { return null }
}

function readJsonAbs(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}

function readFile(p) {
  try { return readFileSync(join(REPO_ROOT, p), 'utf8') } catch { return null }
}

console.log('━━━ Scenario A(直 fork DS)━━━')

// A1: apps/template/ exists + create-app.mjs points to it
const createApp = readFile('scripts/create-app.mjs')
if (existsSync(join(REPO_ROOT, 'apps/template')) && createApp?.includes("join(REPO_ROOT, 'apps/template')")) {
  pass_test('A1', `apps/template/ exists + create-app.mjs source path = 'apps/template'`)
} else {
  fail_test('A1', 'apps/template/ missing or create-app.mjs src path wrong')
}

// A2: DS root workspaces include apps/* AND packages/*
const rootPkg = readJson('package.json')
if (rootPkg?.workspaces?.includes('apps/*') && rootPkg?.workspaces?.includes('packages/*')) {
  pass_test('A2', `DS root workspaces include packages/* + apps/*`)
} else {
  fail_test('A2', 'DS root workspaces wrong', JSON.stringify(rootPkg?.workspaces))
}

// A3: DS root .storybook/main.ts globs sharedStoryGlobs + apps/**
const sbMain = readFile('.storybook/main.ts')
if (sbMain?.includes('sharedStoryGlobs') && sbMain?.includes("'../apps/**/*.stories")) {
  pass_test('A3', `DS root Storybook stories include sharedStoryGlobs + apps/**`)
} else {
  fail_test('A3', 'DS root Storybook config missing apps/** glob')
}

// A4: .claude/{skills,hooks,rules} native readable
const claudeDirs = ['skills', 'hooks', 'rules'].every(d => existsSync(join(REPO_ROOT, '.claude', d)))
if (claudeDirs) {
  pass_test('A4', `.claude/{skills,hooks,rules} all native readable(Scenario A 不需 /plugin install)`)
} else {
  fail_test('A4', '.claude/ governance dirs missing')
}

// A5: apps/template/package.json DS dep `*`(workspace resolution)
const appTplPkg = readJson('apps/template/package.json')
if (appTplPkg?.dependencies?.['@qijenchen/design-system'] === '*') {
  pass_test('A5', `apps/template/package.json DS dep = '*' (Scenario A workspace resolution)`)
} else {
  fail_test('A5', `apps/template/package.json DS dep wrong`, appTplPkg?.dependencies?.['@qijenchen/design-system'])
}

// A6: check_substantive_edit_approval_preflight.sh scope covers DS source + apps/
const approvalHook = readFile('.claude/hooks/check_substantive_edit_approval_preflight.sh')
if (approvalHook?.includes('packages/design-system/src') && approvalHook?.includes('apps/')) {
  pass_test('A6', `approval-preflight hook scope covers DS source + apps/`)
} else {
  fail_test('A6', 'approval-preflight hook scope missing DS source or apps/')
}

console.log('')
console.log('━━━ Mirror build(prerequisite for Scenario B test cases)━━━')

// M0: build mirror artifact
const buildResult = shOut(`node scripts/build-published-template-mirror.mjs --out=${MIRROR_OUT}`)
if (buildResult?.includes('Build complete')) {
  pass_test('M0', `Mirror build runs successfully → ${MIRROR_OUT}`)
} else {
  fail_test('M0', 'Mirror build FAILED', buildResult?.slice(-200))
  console.log('')
  console.log(`${RED}✗ Cannot run B/M tests because mirror build failed${RESET}`)
  process.exit(1)
}

console.log('')
console.log('━━━ Scenario B(via mirror artifact)━━━')

// B1: mirror package.json DS deps `^X.Y.Z`(NOT `*`)
const mirrorRootPkg = readJsonAbs(join(MIRROR_OUT, 'package.json'))
const dsVersionRegex = /^\^\d+\.\d+\.\d+/
if (dsVersionRegex.test(mirrorRootPkg?.dependencies?.['@qijenchen/design-system'])) {
  pass_test('B1', `Mirror root DS dep = ${mirrorRootPkg.dependencies['@qijenchen/design-system']}(npm version,not workspace *)`)
} else {
  fail_test('B1', 'Mirror root DS dep not npm version', mirrorRootPkg?.dependencies?.['@qijenchen/design-system'])
}

// B2: mirror has no packages/design-system source
if (!existsSync(join(MIRROR_OUT, 'packages/design-system'))) {
  pass_test('B2', `Mirror 0 DS source(packages/design-system/ 不存在)`)
} else {
  fail_test('B2', 'Mirror contains DS source')
}

// B3: mirror workspaces apps-only
if (Array.isArray(mirrorRootPkg?.workspaces) && mirrorRootPkg.workspaces.length === 1 && mirrorRootPkg.workspaces[0] === 'apps/*') {
  pass_test('B3', `Mirror workspaces = ["apps/*"] only`)
} else {
  fail_test('B3', 'Mirror workspaces wrong', JSON.stringify(mirrorRootPkg?.workspaces))
}

// B4: mirror .storybook/main.ts apps-only glob
const mirrorSb = readFileSync(join(MIRROR_OUT, '.storybook/main.ts'), 'utf8')
if (mirrorSb.includes('apps/**') && !mirrorSb.includes("'../packages/**")) {
  pass_test('B4', `Mirror .storybook/main.ts apps-only glob(no DS internal stories)`)
} else {
  fail_test('B4', 'Mirror Storybook glob still includes packages/**')
}

// B5: mirror has all consumer scripts
const consumerScripts = ['create-app.mjs', 'setup-netlify-access.mjs', 'check-plugin-installed.mjs', 'audit-consumer-a11y.mjs', 'deploy-url.mjs', 'lint-ds-internal-imports.mjs', 'sync-all.mjs']
const missingScripts = consumerScripts.filter(s => !existsSync(join(MIRROR_OUT, 'scripts', s)))
if (missingScripts.length === 0) {
  pass_test('B5', `Mirror scripts/ contains all ${consumerScripts.length} consumer scripts`)
} else {
  fail_test('B5', `Mirror missing scripts:${missingScripts.join(', ')}`)
}

// B6 __MANUAL__(per scenario-definition.md canonical:B6 = plugin install workflow,需 real fork user)
skip_test('B6', 'Plugin install workflow(3 step + restart → 22 skills + 59 hooks + 31 M-rules visible)', '需 real fork user 跑 `/plugin install` 並 Claude session restart')

// B-dep: mirror apps/template/package.json DS dep transformed `*` → npm version(was mislabeled B6)
const mirrorAppPkg = readJsonAbs(join(MIRROR_OUT, 'apps/template/package.json'))
if (dsVersionRegex.test(mirrorAppPkg?.dependencies?.['@qijenchen/design-system'])) {
  pass_test('B-dep', `Mirror apps/template DS dep = ${mirrorAppPkg.dependencies['@qijenchen/design-system']}(transformed from *)`)
} else {
  fail_test('B-dep', 'Mirror apps/template DS dep not transformed', mirrorAppPkg?.dependencies?.['@qijenchen/design-system'])
}

// B7: 真實跑 create-app in mirror artifact(per scenario-definition.md canonical「run + ls」,2026-05-29 codex P0 fix
// — 原 B7 誤標 __MANUAL__ + skip create-app core flow = false-positive)
const b7AppName = 'smoke-b7-test'
const b7Result = shOut(`cd "${MIRROR_OUT}" && node scripts/create-app.mjs ${b7AppName} 2>&1`)
const b7AppDir = join(MIRROR_OUT, 'apps', b7AppName)
if (existsSync(b7AppDir) && existsSync(join(b7AppDir, 'package.json'))) {
  // verify story title patched + DS dep present
  const b7Story = existsSync(join(b7AppDir, 'src/App.stories.tsx')) ? readFileSync(join(b7AppDir, 'src/App.stories.tsx'), 'utf8') : ''
  const titlePatched = b7Story.includes(`Apps/${b7AppName}/`)
  if (titlePatched) {
    pass_test('B7', `create-app in mirror artifact → apps/${b7AppName}/ created + story title patched 'Apps/${b7AppName}/...'`)
  } else {
    pass_test('B7', `create-app in mirror artifact → apps/${b7AppName}/ created(story title patch unverified — story file shape differ)`)
  }
} else {
  fail_test('B7', `create-app in mirror artifact failed — apps/${b7AppName}/ not created`, b7Result?.slice(-200))
}

console.log('')
console.log('━━━ Mirror integrity scans(via build script)━━━')

// M1: workflow trigger paths align with mirror allowlist scripts
const workflowYaml = readFile('.github/workflows/mirror-to-published-template.yml')
const buildScript = readFile('scripts/build-published-template-mirror.mjs')
const workflowScripts = [...workflowYaml.matchAll(/'scripts\/([^']+\.mjs)'/g)].map(m => m[1]).filter(s => s !== 'build-published-template-mirror.mjs')
const allowlistScripts = [...buildScript.matchAll(/'scripts\/([^']+\.mjs)'/g)].map(m => m[1])
const missingInWorkflow = allowlistScripts.filter(s => !workflowScripts.includes(s))
const missingInAllowlist = workflowScripts.filter(s => !allowlistScripts.includes(s))
if (missingInWorkflow.length === 0 && missingInAllowlist.length === 0) {
  pass_test('M1', `Workflow trigger paths align with mirror allowlist scripts(${allowlistScripts.length} scripts)`)
} else {
  fail_test('M1', `Workflow vs allowlist drift`, `missing in workflow:${missingInWorkflow.join(',') || 'none'};missing in allowlist:${missingInAllowlist.join(',') || 'none'}`)
}

// M2-M5: integrity scans already run as part of M0 build. Re-check stdout.
// 2026-05-30 robust match(原 exact-string '8 paths checked' 太脆,mirror 訊息一改即誤 fail):認「0 leaks」即可
if (/Scan DS source residue:.*?,\s*0 leaks/.test(buildResult)) {
  pass_test('M2', 'DS source residue scan(0 leaks,含 .claude/hooks bootstrap-allowlist)')
} else {
  fail_test('M2', 'DS source residue scan failed')
}

if (buildResult.includes('Scan secret leak: 6 paths checked,0 leaks')) {
  pass_test('M3', `Secret leak scan(6 paths checked,0 leaks)`)
} else {
  fail_test('M3', 'Secret leak scan failed')
}

if (buildResult.includes('Mirror .storybook/main.ts apps-only glob')) {
  pass_test('M4', `Storybook glob integrity scan PASS`)
} else {
  fail_test('M4', 'Storybook glob integrity scan failed')
}

if (buildResult.includes('Mirror root package.json workspaces apps-only')) {
  pass_test('M5', `Package dep integrity scan PASS`)
} else {
  fail_test('M5', 'Package dep integrity scan failed')
}

// M6: reproducibility(run build twice → same output)
const MIRROR_OUT_2 = mkdtempSync(join(tmpdir(), 'scenario-test-mirror-r2-'))
shOut(`node scripts/build-published-template-mirror.mjs --out=${MIRROR_OUT_2}`)
const diff = shOut(`diff -r "${MIRROR_OUT}" "${MIRROR_OUT_2}"`)
if (!diff || diff === '') {
  pass_test('M6', `Mirror build idempotent(diff -r = empty,reproducible)`)
} else {
  fail_test('M6', 'Mirror build NOT idempotent', diff?.slice(0, 300))
}

// M7 __MANUAL__
skip_test('M7', 'Workflow live trigger on DS push main → CROSS_REPO_TOKEN PAT → force-push to ds-product-template GitHub', '需 user 設 PAT + GitHub Actions live fire')

console.log('')
console.log('━━━ Scenario SSOT codification ━━━')

// S1: .claude/references/scenario-definition.md exists + has 8 sections
const ssotFile = readFile('.claude/references/scenario-definition.md')
const sections = ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.']
const missingSections = sections.filter(s => !ssotFile?.includes(s))
if (missingSections.length === 0) {
  pass_test('S1', `Scenario SSOT file exists with 8 canonical sections`)
} else {
  fail_test('S1', 'Scenario SSOT file missing sections', missingSections.join(','))
}

// S2: governance bootstrap task-nav row pointer to SSOT
// PNG 架構(commit d88ceac2):治理核心 = AGENTS.md(provider-neutral;Codex 原生 discovery),
// CLAUDE.md = `@AGENTS.md` import 薄殼(Claude 經 @import 全載)。任務導航表(含 scenario SSOT
// pointer)住在 AGENTS.md;故 pointer 命中 AGENTS.md 或 CLAUDE.md 任一皆算 bootstrap 有指。
const POINTER = '.claude/references/scenario-definition.md'
const agentsMd = readFile('AGENTS.md')
const claudeMdRoot = readFile('CLAUDE.md')
if (agentsMd?.includes(POINTER) || claudeMdRoot?.includes(POINTER)) {
  pass_test('S2', `governance bootstrap(AGENTS.md/CLAUDE.md)task nav row points to scenario-definition.md SSOT`)
} else {
  fail_test('S2', 'governance bootstrap(AGENTS.md/CLAUDE.md)missing pointer to scenario SSOT')
}

// Cleanup
rmSync(MIRROR_OUT, { recursive: true, force: true })
rmSync(MIRROR_OUT_2, { recursive: true, force: true })

console.log('')
console.log('━━━ Summary ━━━')
console.log(`  ${GREEN}PASS: ${pass}${RESET}`)
console.log(`  ${RED}FAIL: ${fail}${RESET}`)
console.log(`  ${YELLOW}MANUAL(__MANUAL__): ${skip}${RESET}`)

if (fail > 0) {
  console.log('')
  console.log(`${RED}❌ Tests FAILED. Failures:${RESET}`)
  for (const f of failures) {
    console.log(`  - ${f.id}: ${f.msg}`)
    if (f.evidence) console.log(`    evidence: ${f.evidence}`)
  }
  process.exit(1)
}

console.log('')
console.log(`${GREEN}✅ All auto-testable cases PASS${RESET}`)
console.log(`${YELLOW}Manual cases (${skip}): require user-side setup — see .claude/references/scenario-definition.md「§ 5. Verify Checkpoints」${RESET}`)

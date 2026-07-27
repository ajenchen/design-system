#!/usr/bin/env node
// @preflight-transition(from-revision:1 from:c6b693dfabe8080b056136c5d3909b48adb92a372cf02885e8fdcf4abb19518d to:0de935282c46790db59fcb87f4cd385eaa81264be3f01ef7add2cf47d8c816f8 audit-ref:candidate:386536327e91eb58d78ffd4420936891512eeac983992dbfedda7f73709b3900 reason:signed-finalizer-trust-boundary-wording)
// release-preflight.mjs — 單一指令跑本機可重播的 release gate，並以 live GitHub policy
// readback 收口；npm/OIDC/environment/independent signed finalizer 等外部 trust 仍只由 release.yml 的
// protected trust-preflight 與 completion-readiness 證明，不宣稱本機與整個 release workflow 1:1。
//
// ROOT CAUSE FIX(2026-06-02):beta.43/45 連續多次 push 失敗,根因全相同 ——
//   「發版前靠手動記得逐道跑 sync / check → 一定會漏」(beta.43 漏 version-sync + ds-canonical;
//    beta.45 又漏 ds-canonical re-sync)。release CI gate 是對的,是本地 preflight 不完整。
//
// 本指令 = ① 先跑 SYNCS(version 5-manifest + ds-canonical → 修 drift,CI 抓不到)
//          ② 跑全部可在本機重播的 deterministic gate + fail-closed branch-policy readback
//          ③ build + FULL story smoke + dogfood(packaging + runtime gate)
//          ④ 5-manifest version 一致性 verify
//          ⑤ 全過才寫 pass-marker(<git-dir>/governance-runtime/evidence/release/,綁 commit + Git tree,
//             per-machine untracked 產物 —— 不入 git / 不入 CI,僅供本機 PreToolUse 比對)
//
// protected-default release dispatch 機械強制:payload tag 必須等於當下 protected main，
// check_solo_workflow.sh 的 R4 另驗 commit 相同，或 squash 後 Git tree byte-identical。
//   → 把「靠人記得跑 preflight」變「機械保證」。(無獨立 check_tag_preflight.sh — 用 R4 復用既有 hook)
//
// 用法:npm run release:preflight  (bump 版本後、建立 exact tag 與送出 protected-default dispatch 前跑)

import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertClosedGitLocalConfiguration,
  captureClosedGitHubToken,
  materializeClosedHookToolProfile,
  runClosedGit,
} from './lib/closed-tool-execution.mjs'
import { prepareRuntimeEvidenceFile, resolveRuntimeEvidencePath } from './lib/governance-runtime-evidence.mjs'

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
if (realpathSync(resolve(process.cwd())) !== ROOT) {
  throw new Error('release preflight must start from the exact repository root')
}
const TOOL_PROFILE = materializeClosedHookToolProfile({ repoRoot: ROOT })
const BASE_CHILD_ENVIRONMENT = Object.freeze({
  HOME: TOOL_PROFILE.homeDirectory,
  LANG: 'C',
  LC_ALL: 'C',
  NO_COLOR: '1',
  PATH: TOOL_PROFILE.executablePath,
  TMPDIR: TOOL_PROFILE.tempDirectory,
  TZ: 'UTC',
  XDG_CONFIG_HOME: TOOL_PROFILE.homeDirectory,
})
const WORKSPACES = Object.freeze({
  '@qijenchen/design-system': join(ROOT, 'packages/design-system'),
  '@qijenchen/governance': join(ROOT, 'packages/governance'),
  '@qijenchen/storybook-config': join(ROOT, 'packages/storybook-config'),
})
const LOCAL_NODE_BINS = new Set(['storybook', 'tsc', 'tsc-alias', 'vite'])
const PACKAGE_SCRIPT_SNAPSHOTS = new Map()

const RELEASE_MARKER_RELATIVE = 'release/release-preflight-pass.json'
const RELEASE_EVIDENCE_OPTIONS = {
  repoRoot: ROOT,
  explicitRoot: process.env.GOVERNANCE_EVIDENCE_ROOT || null,
  relativePath: RELEASE_MARKER_RELATIVE,
}
// Reject a redirected/malformed evidence root before running the expensive gate chain.
resolveRuntimeEvidencePath(RELEASE_EVIDENCE_OPTIONS)

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function inside(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
}

const sha256Bytes = bytes => createHash('sha256').update(bytes).digest('hex')

function readPackageScripts(directory) {
  const packagePath = join(directory, 'package.json')
  const info = lstatSync(packagePath)
  invariant(
    info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(packagePath) === packagePath,
    `release package script registry is unsafe:${packagePath}`,
  )
  const bytes = readFileSync(packagePath, 'utf8')
  invariant(sameFileIdentity(info, lstatSync(packagePath)), `release package script registry changed while it was read:${packagePath}`)
  const document = JSON.parse(bytes)
  invariant(document.scripts && typeof document.scripts === 'object' && !Array.isArray(document.scripts), `release package script registry is missing:${packagePath}`)
  const serialized = JSON.stringify(document.scripts)
  const cached = PACKAGE_SCRIPT_SNAPSHOTS.get(directory)
  invariant(!cached || cached.serialized === serialized, `release package script registry changed during preflight:${packagePath}`)
  if (cached) return cached.scripts
  const snapshot = Object.freeze({
    scripts: Object.freeze({ ...document.scripts }),
    serialized,
  })
  PACKAGE_SCRIPT_SNAPSHOTS.set(directory, snapshot)
  return snapshot.scripts
}

function closedGithubReadEnvironment() {
  const names = ['GH_TOKEN', 'GITHUB_TOKEN'].filter(name => typeof process.env[name] === 'string' && process.env[name] !== '')
  invariant(names.length === 1, 'live branch-policy readback requires exactly one GH_TOKEN or GITHUB_TOKEN authority')
  const token = captureClosedGitHubToken({
    environment: process.env,
    tokenEnvironmentName: names[0],
  })
  return { GH_TOKEN: token }
}

function childEnvironment(authority) {
  if (authority === undefined) return { ...BASE_CHILD_ENVIRONMENT }
  invariant(authority === 'github-read', `release child requested an unsupported authority:${authority}`)
  return { ...BASE_CHILD_ENVIRONMENT, ...closedGithubReadEnvironment() }
}

function expandClosedGlob(token, cwd) {
  if (!token.includes('*')) return [token]
  const match = /^(.+)\/\*\.test\.mjs$/.exec(token)
  invariant(match, `release command contains an unsupported glob:${token}`)
  const directory = realpathSync(resolve(cwd, match[1]))
  invariant(inside(ROOT, directory), `release command glob escapes the repository:${token}`)
  const files = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.test.mjs'))
    .map(entry => join(directory, entry.name))
    .sort()
  invariant(files.length > 0, `release command glob matched no tests:${token}`)
  return files
}

function spawnClosedNode(args, {
  authority,
  cwd,
} = {}) {
  const expanded = args.flatMap(token => expandClosedGlob(token, cwd))
  const optionPrefix = expanded[0]?.startsWith('-') ? expanded.shift() : null
  invariant(optionPrefix === null || optionPrefix === '--test', `release Node option is unsupported:${optionPrefix}`)
  const entrypoint = expanded[0]
  invariant(typeof entrypoint === 'string' && entrypoint.length > 0 && !entrypoint.startsWith('-'), 'release Node entrypoint is missing')
  const absoluteEntrypoint = realpathSync(resolve(cwd, entrypoint))
  const entryInfo = lstatSync(absoluteEntrypoint)
  invariant(
    inside(ROOT, absoluteEntrypoint)
      && entryInfo.isFile()
      && !entryInfo.isSymbolicLink()
      && entryInfo.nlink === 1,
    `release Node entrypoint is unsafe:${entrypoint}`,
  )
  const entrypointSha256 = sha256Bytes(readFileSync(absoluteEntrypoint))
  const finalArgs = [...(optionPrefix ? [optionPrefix] : []), absoluteEntrypoint, ...expanded.slice(1)]
  TOOL_PROFILE.verify()
  const result = spawnSync(TOOL_PROFILE.executables.node, finalArgs, {
    cwd,
    env: childEnvironment(authority),
    shell: false,
    stdio: 'inherit',
    timeout: 60 * 60 * 1000,
    windowsHide: true,
  })
  TOOL_PROFILE.verify()
  invariant(
    sameFileIdentity(entryInfo, lstatSync(absoluteEntrypoint))
      && sha256Bytes(readFileSync(absoluteEntrypoint)) === entrypointSha256,
    `release Node entrypoint changed while it executed:${entrypoint}`,
  )
  if (result.error || result.signal !== null || result.status !== 0) {
    throw new Error(`closed Node command failed (${result.error?.message || result.signal || result.status})`)
  }
}

function spawnClosedLocalBin(name, args, {
  authority,
  cwd,
} = {}) {
  invariant(LOCAL_NODE_BINS.has(name), `release local binary is unsupported:${name}`)
  const link = join(ROOT, 'node_modules/.bin', name)
  const executable = realpathSync(link)
  const before = lstatSync(executable)
  invariant(
    inside(join(ROOT, 'node_modules'), executable)
      && before.isFile()
      && !before.isSymbolicLink()
      && before.nlink === 1
      && (before.mode & 0o022) === 0,
    `release local binary is unsafe:${name}`,
  )
  const executableSha256 = sha256Bytes(readFileSync(executable))
  TOOL_PROFILE.verify()
  const result = spawnSync(TOOL_PROFILE.executables.node, [executable, ...args], {
    cwd,
    env: childEnvironment(authority),
    shell: false,
    stdio: 'inherit',
    timeout: 60 * 60 * 1000,
    windowsHide: true,
  })
  TOOL_PROFILE.verify()
  invariant(
    sameFileIdentity(before, lstatSync(executable))
      && sha256Bytes(readFileSync(executable)) === executableSha256,
    `release local binary changed while it executed:${name}`,
  )
  if (result.error || result.signal !== null || result.status !== 0) {
    throw new Error(`closed ${name} command failed (${result.error?.message || result.signal || result.status})`)
  }
}

function tokenizeClosedCommand(command) {
  invariant(typeof command === 'string' && command.trim() === command && command.length > 0, 'release command must be non-empty text')
  invariant(!/[\0\r\n|&;<>`"'\\]|\$\(/.test(command), `release command contains shell syntax:${command}`)
  return command.split(/\s+/)
}

function executePackageScript(scriptName, {
  args = [],
  authority,
  cwd,
  stack,
} = {}) {
  const key = `${cwd}\0${scriptName}`
  invariant(!stack.includes(key) && stack.length < 64, `release package script recursion is cyclic:${scriptName}`)
  const body = readPackageScripts(cwd)[scriptName]
  invariant(typeof body === 'string' && body.trim(), `release package script is missing:${scriptName}`)
  invariant(!/[\0\r\n|;<>`"'\\]|\$\(|\|\|/.test(body), `release package script contains unsupported shell syntax:${scriptName}`)
  const segments = body.split(/\s+&&\s+/)
  invariant(!segments.some(segment => segment.includes('&')), `release package script contains unsupported background syntax:${scriptName}`)
  invariant(args.length === 0 || segments.length === 1, `release package script cannot forward args across a command chain:${scriptName}`)
  for (const [index, segment] of segments.entries()) {
    executeCommandTokens([
      ...segment.trim().split(/\s+/),
      ...(index === segments.length - 1 ? args : []),
    ], { authority, cwd, stack: [...stack, key] })
  }
}

function executeNpm(tokens, options) {
  let index = 1
  let cwd = options.cwd
  if (tokens[index] === '-w' || tokens[index] === '--workspace') {
    const workspace = tokens[index + 1]
    invariant(WORKSPACES[workspace], `release npm workspace is unsupported:${workspace}`)
    cwd = WORKSPACES[workspace]
    index += 2
  }
  if (tokens[index] === 'run') index += 1
  if (tokens[index] === '--silent') index += 1
  const scriptName = tokens[index]
  invariant(typeof scriptName === 'string' && /^[A-Za-z0-9:_-]+$/.test(scriptName), 'release npm script name is invalid')
  index += 1
  let forwarded = []
  if (tokens[index] === '--') {
    forwarded = tokens.slice(index + 1)
    index = tokens.length
  }
  invariant(index === tokens.length, `release npm invocation contains unsupported arguments:${tokens.slice(index).join(' ')}`)
  executePackageScript(scriptName, {
    args: forwarded,
    authority: options.authority,
    cwd,
    stack: options.stack,
  })
}

function executeCommandTokens(tokens, {
  authority,
  cwd = ROOT,
  stack = [],
} = {}) {
  invariant(Array.isArray(tokens) && tokens.length > 0 && tokens.every(token => typeof token === 'string' && token && !/[\0\r\n]/.test(token)), 'release command argv is invalid')
  if (tokens[0] === 'node') return spawnClosedNode(tokens.slice(1), { authority, cwd })
  if (tokens[0] === 'npm') return executeNpm(tokens, { authority, cwd, stack })
  if (tokens[0] === 'npx') {
    invariant(tokens[1] === '--no-install' && LOCAL_NODE_BINS.has(tokens[2]), 'release npx invocation is not closed')
    return spawnClosedLocalBin(tokens[2], tokens.slice(3), { authority, cwd })
  }
  if (LOCAL_NODE_BINS.has(tokens[0])) return spawnClosedLocalBin(tokens[0], tokens.slice(1), { authority, cwd })
  throw new Error(`release command executable is unsupported:${tokens[0]}`)
}

function clearStorybookSmokePort() {
  const executable = process.platform === 'darwin' ? '/usr/sbin/lsof' : '/usr/bin/lsof'
  if (!existsSync(executable)) return
  TOOL_PROFILE.verify()
  const probe = spawnSync(executable, ['-nP', '-tiTCP:8920', '-sTCP:LISTEN'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...BASE_CHILD_ENVIRONMENT },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
    windowsHide: true,
  })
  TOOL_PROFILE.verify()
  if (probe.status === 1 && !probe.stdout.trim()) return
  invariant(!probe.error && probe.signal === null && probe.status === 0, 'cannot inspect the Storybook smoke port')
  const pids = probe.stdout.trim().split(/\s+/).filter(Boolean)
  invariant(pids.every(pid => /^[1-9]\d*$/.test(pid)), 'Storybook smoke port observer returned an invalid PID')
  for (const pid of pids) process.kill(Number(pid), 'SIGKILL')
}

function runStorybookSmokeShards() {
  for (let shard = 1; shard <= 8; shard += 1) {
    clearStorybookSmokePort()
    executeCommandTokens([
      'node',
      'scripts/storybook-smoke-test.mjs',
      '--full',
      `--shard=${shard}/8`,
    ])
  }
}

let stepNum = 0
function run(label, command, {
  authority,
  cwd = ROOT,
} = {}) {
  stepNum++
  const display = typeof command === 'string' ? command : 'closed Storybook smoke shard plan'
  process.stdout.write(`\n▶ [${stepNum}] ${label}\n    $ ${display}\n`)
  try {
    if (command?.kind === 'storybook-smoke-shards') runStorybookSmokeShards()
    else executeCommandTokens(tokenizeClosedCommand(command), { authority, cwd })
  } catch (error) {
    console.error(`\n❌ RELEASE PREFLIGHT FAIL at step ${stepNum}: ${label}`)
    console.error(`   ${error.message}`)
    console.error('   修掉上面的錯,re-run `npm run release:preflight`。release dispatch 前必全過。')
    process.exit(1)
  }
}

function closedGitText(args, { maxOutputBytes = 16 * 1024 * 1024 } = {}) {
  const result = runClosedGit(args, {
    cwd: ROOT,
    maxOutputBytes,
    timeoutMs: 30_000,
  })
  invariant(
    !result.error && result.signal === null && result.status === 0 && typeof result.stdout === 'string',
    `release closed Git ${args[0]} failed:${result.error?.message || result.signal || result.status}`,
  )
  return result.stdout
}

assertClosedGitLocalConfiguration(ROOT)
const observedTopLevel = closedGitText(['rev-parse', '--show-toplevel']).trim()
invariant(observedTopLevel === ROOT, `release Git top-level differs from the exact repository root:${observedTopLevel}`)

console.log('═══ Release Preflight — local replay + live branch-policy readback,fail-fast ═══')

// ① SYNCS first(修 drift,讓 CI 抓不到)
run('sync version → release manifests + workspace lock entries', 'node scripts/sync-version-to-all-manifests.mjs')
run('sync provider adapters + fork/template + governance control-plane from one build graph', 'node scripts/governance-build-graph.mjs --generate')
// llms.txt/llms-full.txt 從 spec frontmatter build-time 重生(deterministic,禁手維護;對齊 Mantine
// 「每 release 從 source 重生」)。SYNCS 段重生 → 下方 drift gate 驗 + commit 進 tag。
run('sync llms.txt + llms-full.txt(從 spec frontmatter)', 'node scripts/gen-llms-txt.mjs')
run('sync template canonical App(dashboard-app.tsx ← apps/template App.tsx)', 'node scripts/sync-template-canonical-app.mjs')

// ② Deterministic audit gates(== release.yml「Audit gates」step + story type-check)
run(
  'provision exact Playwright Chromium runtime',
  process.platform === 'linux'
    ? 'npm run --silent setup:playwright -- --with-deps'
    : 'npm run --silent setup:playwright',
)
run('all registered local Harness commands(deduplicated; external claims stay pending)', 'npm run --silent test:governance-harnesses')
run('workflow security audit(pinned actions + privileged workflow closure)', 'npm run --silent audit:workflow-security')
run('reviewed workflow identity bindings', 'npm run --silent governance:workflow-identities:check')
run('workflow security adversarial tests', 'npm run --silent test:workflow-security')
run('governance anchor trust tests', 'npm run --silent test:governance-anchor')
run('privileged change authorization + bootstrap/rotation tests', 'npm run --silent test:privileged-change-authorization')
run('exhaustive consumer-source harness', 'npm run --silent test:consumer-source-harness')
run('fresh-writer evidence + immutable mirror release tests', 'npm run --silent test:writer-evidence')
run('fleet/runtime/release-ring control-plane tests', 'node --test infra/governance/test/*.test.mjs')
run('tsc -b', 'npx --no-install tsc -b')
run('typecheck:stories', 'npm run --silent typecheck:stories')
run('audit-orphan-tokens', 'node scripts/audit-orphan-tokens.mjs --check')
run('categorical-color-invariants', 'node scripts/categorical-color-invariants.mjs')
run('motion-delay-invariants', 'node scripts/audit-motion-delay-invariants.mjs')
run('status-color-invariant(progress/step/in-progress → --info)', 'node scripts/status-color-invariant.mjs')
run('layout-space-utility-invariant(裸 px-loose silent-fail)', 'node scripts/layout-space-utility-invariant.mjs')
run('category-classification-invariant(分類三訊號一致)', 'node scripts/category-classification-invariant.mjs')
run('item-content-leading-coherence(防 reading-gap+compact-行高 off-grid 偏移,Notice 2026-06-15 anchor)', 'node scripts/item-content-leading-coherence.mjs')
run('checkbox-group-handcraft(防手刻 div 包選項 Checkbox,2026-06-15 popover/sheet/coachmark anchor)', 'node scripts/checkbox-group-handcraft-invariant.mjs')
run('layout-space-story-coherence(防 token overview story 顯示值 drift,2026-06-15 tight 8≠12 anchor)', 'node scripts/layout-space-story-coherence.mjs')
run('overlay-density-lock-placement(防 density lock 設在 header 非 surface 根,FileViewer 圖二 anchor)', 'node scripts/overlay-density-lock-placement.mjs')
run('code-quality-audit', 'node scripts/code-quality-audit.mjs --scope=packages/design-system/src/components --check')
run('content-quality', 'node scripts/audit-content-quality.mjs --check')
run('governance-counters', 'node scripts/sync-governance-counters.mjs --check')
// 2026-07-10 user「每類病根必有防線,稽核應確認這個基本原則」→ dim 91 常設閘進發版鏈:
// registry 每 failure class 必 protected / remediating+plan / judgment+auditDim,缺 = 擋發版。
run('failure-class coverage(dim 91,每類病根必有防線)', 'node scripts/audit-failure-class-coverage.mjs --check')
run('hook-test coverage(BLOCKER hook 必有 test 檔)', 'node scripts/audit-hook-test-coverage.mjs --check')
run('gate meta-test coverage(checker gate 必有 meta-test;ratchet 只擋新洞)', 'node scripts/audit-gate-meta-test-coverage.mjs --check')
// §8 執行層:實跑全部 gate meta-test(inject 真違規 → 斷言 gate exit≠0 → restore),自證每支 gate 偵測活性。
// coverage 只驗檔存在;本步驗「meta-test 真跑得過」,防某 gate 偵測邏輯被改壞卻靜默 exit 0。
run('gate meta-tests 實跑(§8:每支 gate inject-真違規偵測活性自證)', 'node scripts/run-gate-meta-tests.mjs')
// PNG §14-17/§31:published package 無 consumer-install lifecycle script → --ignore-scripts / 離線安裝恆等普通安裝
run('clean-install-safety(§14-17/§31:published package 無 preinstall/install/postinstall)', 'node scripts/check-clean-install-safety.mjs --check')
run('gen-figma-make-artifacts', 'node scripts/gen-figma-make-artifacts.mjs --check')
run('root barrel internal-exclusion(dim-72)', 'node scripts/gen-design-system-barrel.mjs --check')
run('plugin-structure-validate', 'node scripts/plugin-structure-validate.mjs')
run('story-quality', 'npm run --silent story-quality:check')
run('three-layer stories(每 public 元件必備 anatomy+principles;取代 dim-11 AI 假證據)', 'node scripts/check-three-layer-stories.mjs --check')
run('LinkTo integrity(story 改名/retire 反向引用斷鏈;DA3 C.0b 謂詞化)', 'node scripts/audit-linkto-integrity.mjs --check')
run('agents-bootstrap(PNG:root→cwd AGENTS chain ≤32KiB + Claude @import + Rule Index 零死鏈 + scoped npm instructions)', 'node scripts/check-agents-bootstrap.mjs --check')
// One graph checks every generated provider/fork/control-plane view and its instruction mirrors.
run('governance build graph drift check(all provider/fork/control-plane outputs)', 'node scripts/governance-build-graph.mjs --check')
run('provider/fork portability safety(build graph + symlink/recovery/atomicity/memory + future provider)', 'npm run --silent test:governance-portability-safety')
run('governance control-plane tests', 'npm -w @qijenchen/governance test')
// Branch policy is part of release trust. Missing observation authority, unresolved App IDs, or
// drift must block the marker; an informational probe would create a locally green false claim.
run(
  'branch-protection exact live readback(fail-closed)',
  'node scripts/check-branch-protection.mjs --check --repository ajenchen/design-system',
  { authority: 'github-read' },
)
run('governance-tamper(preflight gate-count ratchet + time-boxed waiver 過期)', 'node scripts/check-governance-tamper.mjs --check')
run('rule coverage(91 dim 全分類 + 機制檔案存在 + rule-ID;PNG P3.3)', 'npm run --silent audit:coverage-matrix')
run('inline-edit view geometry invariant(多行 py == Textarea edit py,read↔edit 零跳鎖)', 'node scripts/inline-edit-view-geometry-invariant.mjs')
// C-prime #5(2026-06-17 codex 共識 C3 future-SSOT 閘):fork 治理 corpus 必過(a) classify 漏接閘
// (新增 hook 未分類 = FAIL)+(b) 生成物 vs SSOT drift gate,且(c) 假 fork harness 防假生效。
// 這把「未來 DS 治理增刪改 → fork 同步」從『靠記得』變『機械強制』(漏分類/drift/假生效 = 擋發版)。
run('fork-governance harness(假 fork 防 false-green/brick/crash)', 'node scripts/test-fork-governance.mjs')
run('consumer governance clean-room(hooks-off + immutable BOM + Claude/Codex parity + tamper negatives)', 'node scripts/test-consumer-governance.mjs')
run('consumer exact-upgrade transaction(post-check + tracked rollback)', 'node scripts/test-sync-all-transaction.mjs')
run('release BOM + supply-chain adversarial tests', 'npm run --silent test:release-supply-chain')
run('template canonical App drift check(防 receiver 覆寫 scaffold App.tsx)', 'node scripts/sync-template-canonical-app.mjs --check')
// 2026-06-08:DS src 改了必 bump 才 republish(補「republish 靠 AI 記得 bump」非機械斷點)。
// preflight 此時 version 已 bump → gate 見「bumped → OK」綠;若忘 bump 直 push 則 ci.yml 同道 gate 擋。
run('DS src republish gate(src 改了必 bump,防 ship stale)', 'node scripts/check-src-republish.mjs --check')
run('llms.txt drift check(build-time derive,禁手維護)', 'node scripts/gen-llms-txt.mjs --check')
run('Field cascade-resolve gate(防新控件漏讀 size/mode/disabled context — 統一 SSOT)', 'node scripts/check-field-cascade-resolve.mjs')

// ③ Build + smoke + dogfood(== release.yml publish job + smoke-shard job)
run('build:lib', 'npm run --silent build:lib')
// bundle-size gate(2026-07-07 治理進化收尾:performance-audit 自認缺口補上;budget SSOT =
// packages/design-system/bundle-budget.json,蓄意增大 → --init 更新 + commit 說明)
run('bundle-size gate', 'node scripts/check-bundle-size.mjs --check')
run('naming-structure invariant', 'node scripts/naming-structure-invariant.mjs')
// 2026-06-16 root-cause gate:apps/template 是 React 19 workspace,root tsc -b references 不含它 → React19
// 專屬錯(@types/react 移除全域 JSX namespace → `JSX.Element` TS2503)只在 receiver `cd apps/template &&
// npm run build` 才炸,DS preflight 一路假綠 ship(bde81e7e 2026-06-12 brick ds-product-template receiver +
// 自身 Audit + Dependabot PR,連敗到 beta.67)。跑 receiver 同款 build command 在 tag 前攔下此 class。
run(
  'build apps/template(React19 receiver build — 防 root tsc 漏掉的 receiver-only TS2503)',
  'npm run build',
  { cwd: join(ROOT, 'apps/template') },
)
run('build-storybook', 'npm run --silent build-storybook')
// FULL story runtime smoke == release.yml smoke-shard job(被 `needs:` 硬 gate)。這是唯一能攔
// SizeMatrix 那類 {var}-undefined / runtime crash 的 gate;build-storybook 是 compile-time、dogfood
// 只 render 2 個 component,都攔不到。漏此道 = preflight marker 綠但 CI smoke 仍會紅(2026-06-02 audit
// iceberg)。
// 2026-07-18 root-cause fix:本機原「單次串跑全 961」在 ~60 story 後 python http.server + chromium 資源
// 累積把後續 probe 拖垮(false hang;非程式錯)。改為本機也分 8 shard 串跑(全 961 零抽樣、每 shard 重起
// server + browser 即資源歸零 → 不再拖垮),對齊 CI smoke-shard matrix 本來就分片的作法。任一 shard 非 0 →
// 整步 fail。每 shard 前清 port 殘留 server 避免 bind 衝突 false-fail。
// ⚙️ GATE RETIRE 理由(governance-tamper R1 ratchet,baseline 52→51,同 commit 更新 preflight-gate-baseline.json):
//   原獨立 `run('clear smoke port 8920', ...)` step 併入下方 shard 迴圈內(每 shard 前清 port,比原「跑前清一次」
//   更正確)→ run() 呼叫數 -1。非移除防線:清 port 邏輯仍在(移進迴圈)、smoke 覆蓋零損失(全 961)。
run('FULL storybook runtime smoke — 分 8 shard 串跑(全 961 story 零抽樣;每 shard 資源歸零防拖垮)',
  { kind: 'storybook-smoke-shards' })
// InlineEdit 對齊 + blur exit pixel invariant(2026-07-17 root cause 修的機械鎖):委派控件 view 左緣落 label
// x=0(Δ≤1.5px)+ 點 Status 進 edit→blur→editing=0 回 display 無殘留。需 storybook-static(build 後才跑)。
run('InlineEdit 對齊 + blur exit pixel invariant', 'node scripts/probe-inline-edit-align.mjs')
run('dogfood pre-publish verify', 'node scripts/dogfood-prepublish-verify.mjs')

// ④ Release-version entry consistency verify(== release.yml version blocker)
process.stdout.write(`\n▶ [${++stepNum}] release-version entries 一致性\n`)
const versions = {
  'design-system': JSON.parse(readFileSync(join(ROOT, 'packages/design-system/package.json'), 'utf8')).version,
  'storybook-config': JSON.parse(readFileSync(join(ROOT, 'packages/storybook-config/package.json'), 'utf8')).version,
  'governance': JSON.parse(readFileSync(join(ROOT, 'packages/governance/package.json'), 'utf8')).version,
  'plugin.json': JSON.parse(readFileSync(join(ROOT, '.claude-plugin/plugin.json'), 'utf8')).version,
}
const mk = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'))
versions['marketplace.metadata'] = mk.metadata.version
versions['marketplace.plugins[ds]'] = (mk.plugins.find((p) => p.name === 'design-system') || {}).version
const workspaceLock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'))
for (const workspacePath of ['packages/design-system', 'packages/storybook-config', 'packages/governance']) {
  versions[`package-lock:${workspacePath}`] = workspaceLock.packages?.[workspacePath]?.version
}
const uniq = [...new Set(Object.values(versions))]
if (uniq.length !== 1) {
  console.error('❌ release-surface version 不一致:', JSON.stringify(versions, null, 2))
  console.error('   修:node scripts/sync-version-to-all-manifests.mjs')
  process.exit(1)
}
console.log(`    ✓ ${Object.keys(versions).length} release-version entries 全一致 = ${uniq[0]}`)

// ④.5 template consumer dep 一致性(2026-06-08:防 template DS dep 落後 DS version 再現「beta.32」)
// sync-version-to-all-manifests.mjs 已把 template DS+sb dep 改寫成 exact DS version;此處 fail-closed 斷言
// 「沒同步就不准 tag」。注:apps/template 的 `*` workspace dep 由 mirror 處理,不在此驗。
const tmplPkg = JSON.parse(readFileSync(join(ROOT, 'template/ds-product-template/package.json'), 'utf8'))
const tmplExpected = uniq[0]
const tmplDeps = {
  '@qijenchen/design-system': tmplPkg.dependencies?.['@qijenchen/design-system'],
  '@qijenchen/storybook-config': tmplPkg.dependencies?.['@qijenchen/storybook-config'],
}
const tmplDrift = Object.entries(tmplDeps).filter(([, v]) => v !== tmplExpected)
if (tmplDrift.length) {
  console.error(`❌ template consumer dep 落後 DS version(應 ${tmplExpected}):`, JSON.stringify(tmplDeps, null, 2))
  console.error('   修:node scripts/sync-version-to-all-manifests.mjs')
  process.exit(1)
}
console.log(`    ✓ template consumer dep 對齊 ${tmplExpected}`)

// ④.9 worktree-clean 終局 gate(2026-06-12 beta.66 CI 紅燈根治):上方 sync 步驟(ds-canonical /
// llms / template canonical App / release surfaces)會「重生」working tree 檔案 — 若有未 commit 的重生產物,
// pass-marker 綁的 HEAD 不含它們 → tag 的乾淨 checkout 在 CI 同道 drift gate 必紅(local 綠 / CI 紅)。
// 故 marker 寫入前 worktree 必乾淨;dirty → fail-fast 列檔要求先 commit 再重跑。
{
  const dirty = closedGitText(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    .split('\0')
    .filter(Boolean)
  if (dirty.length) {
    console.error('\n❌ RELEASE PREFLIGHT FAIL: sync 步驟產生未 commit 的重生檔案(tag 會缺它們 → CI drift gate 必紅):')
    console.error(dirty.map((line) => `   ${JSON.stringify(line)}`).join('\n'))
    console.error('   修:git add -A && git commit(訊息註明 preflight sync 產物)→ 重跑 npm run release:preflight')
    process.exit(1)
  }
}

// ⑤ pass-marker(綁 commit + Git tree)— squash merge 可改 commit ID，但不可改已驗內容。
const [head, tree] = closedGitText(['rev-parse', 'HEAD', 'HEAD^{tree}']).trim().split('\n')
invariant(/^[0-9a-f]{40,64}$/.test(head) && /^[0-9a-f]{40,64}$/.test(tree), 'release Git identity is malformed')
const releaseRepository = process.env.GOVERNANCE_RELEASE_REPOSITORY || 'ajenchen/design-system'
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(releaseRepository)) {
  throw new Error('GOVERNANCE_RELEASE_REPOSITORY must be an owner/repository identifier')
}
const sha256 = (f) => { try { return sha256Bytes(readFileSync(join(ROOT, f))) } catch { return null } }
const governanceDigest = {
  agentsMd: sha256('AGENTS.md'),
  providerRegistry: sha256('packages/governance/canonical/providers.json'),
  coverageMatrix: sha256('generated/governance/audit-coverage-matrix.json'),
  preflightGateBaseline: sha256('packages/design-system/ds-canonical/references/preflight-gate-baseline.json'),
}
if (!Object.values(governanceDigest).every((value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value))) {
  throw new Error('release governance digest inputs are unavailable')
}
const markerPath = prepareRuntimeEvidenceFile(RELEASE_EVIDENCE_OPTIONS)
const markerBytes = JSON.stringify({
    schemaVersion: 1,
    evidenceKind: 'release-preflight-attestation',
    head, tree, version: uniq[0], ts: new Date().toISOString(),
    repo: releaseRepository,
    governanceDigest,
    gatesPassed: stepNum,
    surface: process.env.CLAUDECODE ? 'claude-code-local' : process.env.CODEX_SANDBOX ? 'codex' : 'shell',
    ruleIds: 'DS-DIM-001..091(coverage → generated/governance/audit-coverage-matrix.json)',
  }, null, 2) + '\n'
// Atomic replace prevents a pre-positioned hardlink from turning evidence emission into a write to
// an inode outside the runtime tree. The shared resolver already rejects symlink/escape parents.
const markerTemporary = `${markerPath}.${process.pid}.${randomUUID()}.tmp`
let markerDescriptor = null
try {
  markerDescriptor = openSync(markerTemporary, 'wx', 0o600)
  writeFileSync(markerDescriptor, markerBytes)
  fsyncSync(markerDescriptor)
  closeSync(markerDescriptor)
  markerDescriptor = null
  renameSync(markerTemporary, markerPath)
} finally {
  if (markerDescriptor !== null) closeSync(markerDescriptor)
  if (existsSync(markerTemporary)) unlinkSync(markerTemporary)
}
console.log(`\n✅ RELEASE PREFLIGHT PASS @ ${head.slice(0, 8)}  version=${uniq[0]}`)
console.log(`   pass-marker 已寫 ${markerPath}(綁此 commit + Git tree)→ reviewed squash merge 後僅 byte-identical tree 可 tag。`)
console.log('   ⚠️ 建立 exact tag 或送出 protected-default release dispatch 前若內容有任何變動，須重跑 preflight。')

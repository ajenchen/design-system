#!/usr/bin/env node
// scripts/build-published-template-mirror.mjs — Build published `ds-product-template` repo content from DS repo
//
// Per 2026-05-29 monorepo 2-scenario architecture(codex r5 synthesize verdict):
//   - DS repo = SSOT
//   - Published `ajenchen/ds-product-template` repo = subset mirror(non-SSOT,build artifact)
//
// Strategy: ALLOWLIST not denylist(per codex r5 insight「`rm -rf packages/design-system/src` 太 narrow,
// 會漏 DS governance/log/planning artifacts」)。
//
// Output dir contains:
//   - apps/template/                       (from DS root apps/template)
//   - scripts/{create-app,setup-netlify-access,check-plugin-installed,lint-ds-internal-imports,deploy-url,sync-all,audit-consumer-a11y,verify-consumer-css-entry}.mjs(以 ALLOWLIST 常數為準)
//   - .devcontainer/                       (Codespaces cloud-dev path)
//   - .storybook/                          (from template/ds-product-template/.storybook,apps-only glob)
//   - .github/{workflows,CODEOWNERS,dependabot.yml}
//   - .gitignore, .npmrc
//   - netlify.toml                         (Storybook Netlify deploy + access headers)
//   - README.md + common/provider instructions (consumer-facing; destinations derive from the
//     authenticated fork manifest instead of a Claude/Codex allowlist)
//   - package.json                         (TRANSFORMED:workspaces=apps/* only,DS dep=npm version)
//   - docs/                                (consumer onboarding)
//
// Excluded(absent from allowlist):
//   - packages/design-system/**           (DS source,Scenario B 看不到)
//   - packages/storybook-config/**         (DS internal addons preset source)
//   - provider-local state outside manifest managedSurfaces; authenticated provider adapters,
//     product-role skills, and explicit product trees are copied for every generated provider.
//   - .claude-plugin/**                    (marketplace metadata,DS-side only)
//   - hooks/hooks.json                     (plugin hook registration)
//   - tools/scripts not in scaffold list
//
// Usage:
//   node scripts/build-published-template-mirror.mjs --out=/tmp/mirror-build
//
// Invoked by:
//   .github/workflows/mirror-to-published-template.yml after an immutable release finalizer

import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateMirrorRoot } from './verify-mirror-evidence.mjs'
import { assertRuntimeDependencyClosureDirectory } from './lib/runtime-dependency-closure.mjs'
import {
  copyVerifiedForkManagedSurfaces,
  loadVerifiedForkSurfaceAuthority,
  publishedCompatibilitySourcePaths,
} from './lib/published-template-provider-surfaces.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function buildPublishedTemplateMirror({ outDir = '/tmp/published-template-mirror' } = {}) {
const OUT_DIR = outDir
console.log(`▶ Building published template mirror`)
console.log(`  Source: ${REPO_ROOT}`)
console.log(`  Output: ${OUT_DIR}`)
console.log('')

// Clean output
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const forkSurfaceAuthority = loadVerifiedForkSurfaceAuthority({
  authorityRoot: REPO_ROOT,
  manifestPath: 'packages/design-system/ds-canonical/fork/manifest.json',
  lockPath: 'packages/design-system/ds-canonical/fork/governance.lock',
})
const compatibilityAllowlist = publishedCompatibilitySourcePaths(forkSurfaceAuthority.manifest)

// ━━━ ALLOWLIST(per codex r5「allowlist not denylist」)━━━

const ALLOWLIST = [
  // Product app seed(create-app source)
  'apps/template',
  // Shared scripts for product workflow
  'scripts/create-app.mjs',
  'scripts/setup-netlify-access.mjs',
  'scripts/check-plugin-installed.mjs',
  'scripts/consumer-source-harness.mjs',
  // Consumer-side scripts(Phase 4 moved from template/ds-product-template/scripts/)
  'scripts/audit-consumer-a11y.mjs',
  'scripts/deploy-url.mjs',
  'scripts/lint-ds-internal-imports.mjs',
  'scripts/lib/a11y-static-server.mjs',
  'scripts/lib/canonical-path-containment.mjs',
  'scripts/lib/consumer-control-plane-policy.mjs',
  'scripts/lib/provider-lifecycle.mjs',
  'scripts/lib/verified-exact-npm-runtime.mjs',
  'scripts/lib/governance-dependency-bootstrap.mjs',
  'scripts/lib/worktree-fingerprint.mjs',
  'scripts/lib/workspace-post-create.mjs',
  'scripts/setup-governance.mjs',
  'scripts/setup-provider-cli-toolchain.mjs',
  'scripts/setup-workspace.mjs',
  'scripts/workflow-static-validation.mjs',
  'scripts/sync-all.mjs',
  'scripts/refresh-fork-launchers.mjs', // sync-all import 此模組刷新接線骨架 → 必隨 mirror ship,否則 fork sync-all 炸 module-not-found
  'scripts/release-bom-contract.mjs', // upgrade provenance imports the shared closed release BOM validator
  'scripts/product-template-scaffold-lock.mjs', // release BOM + upgrade provenance bind the complete published scaffold
  'scripts/schemas/release-bom.schema.json',
  'scripts/schemas/product-template-scaffold-lock.schema.json',
  'scripts/schemas/upgrade-evidence-receipt.schema.json',
  'scripts/governance-check.mjs',       // provider-neutral hard gate(native hooks off 仍完整驗證)
  'scripts/governance-anchor-preflight.mjs', // base-trusted pull_request_target preflight; candidate is data
  'scripts/verify-upgrade-provenance.mjs', // current trusted client binds incoming npm/Sigstore evidence to immutable GitHub Release BOM
  'scripts/verify-consumer-css-entry.mjs',
  'scripts/verify-upgrade-evidence.mjs',
  // Cloud-dev path — 2026-05-30 codex Phase B P-bug fix:source 從 template 的 Scenario-B 版,
  // 非 DS-root 的 Scenario-A 版。否則 fork user 拿到「不需 /plugin install」的錯 banner + 錯 npm 命令
  // (`npm ci` vs consumer 該用的 `npm install --legacy-peer-deps`)。FLATTEN 後 dest = mirror root .devcontainer。
  'template/ds-product-template/.devcontainer',
  // Consumer-facing scaffold(template/ds-product-template/ 內)
  'template/ds-product-template/.storybook',
  'template/ds-product-template/.github',
  'template/ds-product-template/.gitignore',
  'template/ds-product-template/.npmrc',
  'template/ds-product-template/.env.example',
  'template/ds-product-template/netlify.toml',
  'template/ds-product-template/netlify/edge-functions',  // FREE 密碼保護 edge function(basic-auth.ts);netlify.toml [[edge_functions]] 引用,必隨 mirror ship 否則 deploy 認證失效
  'template/ds-product-template/README.md',
  'template/ds-product-template/docs',
  'template/ds-product-template/governance', // immutable release BOM + schema
  'template/ds-product-template/schemas', // schema bound by the consumer provider CLI manifest
  'template/ds-product-template/tsconfig.json',
  // Provider-owned instruction/hook/skill/tree surfaces are copied below from the authenticated
  // fork manifest. Compatibility discovery leaves are exact manifest entries: an empty category
  // needs no unshippable empty directory, while every nonempty leaf remains a required allowlist
  // source and therefore fails closed when absent.
  ...compatibilityAllowlist,
]

// Files within template/ds-product-template/ get "flattened" to mirror root
const FLATTEN_PREFIX = 'template/ds-product-template/'

// Allowlisted directories are copied from a developer worktree, not a clean Git tree. Never let
// local dependency/build caches or filesystem links become release inputs. These artifacts are
// reconstructed by `npm ci`/build in the credential-free certification job.
const TRANSIENT_DIRECTORY_NAMES = new Set([
  'node_modules', 'dist', 'coverage', 'storybook-static', '.turbo', '.cache', '.vite',
])
const TRANSIENT_FILE = /(?:^|\/)\.DS_Store$|\.tsbuildinfo$/

function allowMirrorCopy(source) {
  const rel = relative(REPO_ROOT, source).split('\\').join('/')
  const segments = rel.split('/')
  if (segments.some((segment) => TRANSIENT_DIRECTORY_NAMES.has(segment)) || TRANSIENT_FILE.test(rel)) return false
  const stat = lstatSync(source)
  if (stat.isSymbolicLink()) throw new Error(`mirror source contains a forbidden symlink: ${rel}`)
  if (!stat.isDirectory() && !stat.isFile()) throw new Error(`mirror source contains a special file: ${rel}`)
  return true
}

// 2026-06-04 fix(gate-not-wired 假綠):allowlist entry 缺失原本只 warn + skip → mirror 靜默不完整、
// 沒人知道(published template 少檔 = consumer 拿到壞的 scaffold)。改 fail-closed:收集所有缺失 → 結尾 exit 1。
// allowlist 是「該複製什麼」的契約,缺 = 要嘛 allowlist stale 要嘛真檔不見,兩者都該擋下要求修。
const missingEntries = []
for (const path of ALLOWLIST) {
  const src = join(REPO_ROOT, path)
  if (!existsSync(src)) {
    console.error(`  ❌ allowlist entry missing: ${path}`)
    missingEntries.push(path)
    continue
  }
  const dest = join(OUT_DIR, path.startsWith(FLATTEN_PREFIX) ? path.slice(FLATTEN_PREFIX.length) : path)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true, filter: allowMirrorCopy })
  console.log(`  ✓ ${path}${path.startsWith(FLATTEN_PREFIX) ? ' → ' + dest.replace(OUT_DIR + '/', '') : ''}`)
}
if (missingEntries.length > 0) {
  console.error(`\n❌ ${missingEntries.length} allowlist entry(ies) missing — published-template mirror 會不完整。修:更新 ALLOWLIST 或補回缺檔。`)
  console.error(`   缺:${missingEntries.join(', ')}`)
  process.exit(1)
}

// Root scripts import a thin authority adapter, while a standalone product cannot resolve the
// monorepo package path behind that adapter. Vendor the canonical package implementation at the
// same consumer-relative destination; the fork corpus and product scaffold use the identical
// source-to-destination mapping.
{
  const sourcePath = 'packages/governance/src/closed-tool-execution.mjs'
  const destinationPath = 'scripts/lib/closed-tool-execution.mjs'
  const source = join(REPO_ROOT, sourcePath)
  if (!existsSync(source)) {
    console.error(`\n❌ canonical closed-tool runtime is missing: ${sourcePath}`)
    process.exit(1)
  }
  const destination = join(OUT_DIR, destinationPath)
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination)
  console.log(`  ✓ ${sourcePath} → ${destinationPath}`)
}

copyVerifiedForkManagedSurfaces({
  templateRoot: join(REPO_ROOT, 'template/ds-product-template'),
  mirrorRoot: OUT_DIR,
  authority: forkSurfaceAuthority,
})
console.log(`  ✓ ${forkSurfaceAuthority.declarations.length} authenticated common/provider managed surfaces`)

// ━━━ 2026-06-05 fail-closed guard:netlify.toml 引用的 script / edge function 必在 mirror output 存在 ━━━
// P0 anchor:netlify.toml build command 曾串 `node scripts/inject-basic-auth.mjs` 但該檔沒進 ALLOWLIST →
// fork user mirror 缺檔 → 每次 deploy build fail。本 guard 解析 mirror netlify.toml 的引用,缺即 exit 1。
{
  const mirrorToml = join(OUT_DIR, 'netlify.toml')
  if (existsSync(mirrorToml)) {
    const toml = readFileSync(mirrorToml, 'utf8')
    const refMissing = []
    for (const m of toml.matchAll(/node\s+([\w./-]+\.mjs)/g)) {
      if (!existsSync(join(OUT_DIR, m[1]))) refMissing.push(`build script ${m[1]}`)
    }
    for (const m of toml.matchAll(/function\s*=\s*["']([\w-]+)["']/g)) {
      const found = ['ts', 'js', 'mjs', 'mts'].some((ext) => existsSync(join(OUT_DIR, `netlify/edge-functions/${m[1]}.${ext}`)))
      if (!found) refMissing.push(`edge function ${m[1]} (netlify/edge-functions/${m[1]}.ts)`)
    }
    if (refMissing.length) {
      console.error(`\n❌ netlify.toml 引用但 mirror 缺檔(fork deploy 會掛):${refMissing.join(', ')}。修:加進 ALLOWLIST。`)
      process.exit(1)
    }
    console.log(`  ✓ netlify.toml 引用的 script/edge-function 全在 mirror`)
  }
}

// ━━━ 2026-06-05 fail-closed guard:package.json scripts 引用的 `node scripts/X.mjs` 必在 mirror 存在 ━━━
// Gap anchor:fork user 拿到的 package.json scripts(setup:netlify / create-app / deploy-url / postinstall…)
// 都跑 `node scripts/X.mjs`;若某 script 加進 package.json 但忘了進 ALLOWLIST → fork user `npm run X` 炸,
// 沒人擋(netlify.toml guard 只管 build/edge-function ref,不管 package.json scripts)。本 guard 補洞。
{
  const tmplPkgPath = join(REPO_ROOT, 'template/ds-product-template/package.json')
  if (existsSync(tmplPkgPath)) {
    const scripts = JSON.parse(readFileSync(tmplPkgPath, 'utf8')).scripts ?? {}
    const refMissing = []
    for (const [name, cmd] of Object.entries(scripts)) {
      for (const m of String(cmd).matchAll(/node\s+(scripts\/[\w./-]+\.mjs)/g)) {
        if (!existsSync(join(OUT_DIR, m[1]))) refMissing.push(`npm run ${name} → ${m[1]}`)
      }
    }
    if (refMissing.length) {
      console.error(`\n❌ package.json scripts 引用但 mirror 缺檔(fork user 跑 npm run 會炸):${refMissing.join(', ')}。修:加進 ALLOWLIST。`)
      process.exit(1)
    }
    console.log(`  ✓ package.json scripts 引用的 node scripts/*.mjs 全在 mirror`)
  }
}

// Scan the complete recursive runtime closure, including scripts/lib and provider-neutral
// launchers. Targets are resolved against delivered output paths, never against the richer source
// worktree, so an omitted nested module cannot borrow a false green from DS-author files.
try {
  const report = assertRuntimeDependencyClosureDirectory(OUT_DIR, {
    label: 'published-template runtime delivery',
    scanRoots: ['scripts', forkSurfaceAuthority.manifest.consumer.launcherDestination],
  })
  console.log(`  ✓ Published runtime dependency closure:${report.runtimeModuleCount} modules/${report.edgeCount} relative edges`)
} catch (error) {
  console.error(`\n❌ ${error.message}`)
  process.exit(1)
}

// ━━━ Transform root package.json ━━━

// dsRootPkg removed 2026-05-29(codex caught dead var)— mirror root uses templatePkg as base
const templatePkg = JSON.parse(readFileSync(join(REPO_ROOT, 'template/ds-product-template/package.json'), 'utf8'))

// Get current DS version for npm dep transform
const dsPkgJson = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/design-system/package.json'), 'utf8'))
const sbPkgJson = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/storybook-config/package.json'), 'utf8'))
const dsVersion = dsPkgJson.version
const sbVersion = sbPkgJson.version

console.log('')
console.log(`▶ Transform package.json(npm dep version sync)`)
console.log(`  DS version: ${dsVersion}`)
console.log(`  Storybook config version: ${sbVersion}`)

// Use template's package.json as base(consumer-facing)+ patch versions
const finalPkg = { ...templatePkg }
finalPkg.dependencies = {
  ...finalPkg.dependencies,
  // Consumer releases are immutable snapshots. Upgrade is an explicit reviewed PR,
  // never an install-time semver re-resolution to a different governance payload.
  '@qijenchen/design-system': dsVersion,
  '@qijenchen/storybook-config': sbVersion,
}
// Ensure workspaces is only `apps/*`(per codex Gap 2)
finalPkg.workspaces = ['apps/*']

writeFileSync(join(OUT_DIR, 'package.json'), JSON.stringify(finalPkg, null, 2) + '\n')
console.log(`  ✓ Written ${OUT_DIR}/package.json`)

// ━━━ Transform apps/template/package.json(workspace * → exact npm version)━━━

// 2026-05-29 codex P0 fix:unconditional update(原 `=== '*'` 太 narrow — 若 apps/template
// DS dep 改成 explicit version,mirror 不會更新到最新 → Scenario B stale。改 always sync。)
const appTplPkgPath = join(OUT_DIR, 'apps/template/package.json')
if (existsSync(appTplPkgPath)) {
  const appPkg = JSON.parse(readFileSync(appTplPkgPath, 'utf8'))
  if (appPkg.dependencies?.['@qijenchen/design-system']) {
    const before = appPkg.dependencies['@qijenchen/design-system']
    appPkg.dependencies['@qijenchen/design-system'] = dsVersion
    writeFileSync(appTplPkgPath, JSON.stringify(appPkg, null, 2) + '\n')
    console.log(`  ✓ apps/template/package.json DS dep: ${before} → ${dsVersion}(exact)`)
  }
}

// ━━━ Integrity scans(per codex Test case Mirror integrity 2-5)━━━

console.log('')
console.log(`▶ Integrity scans(mirror integrity)`)

let scanFail = 0

// Scan 0: the archive input must consist only of regular files/directories and may not contain
// local dependency/build caches. This duplicates the workflow archive guard at the builder layer,
// preventing a misleading local green result.
{
  const violations = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      const rel = relative(OUT_DIR, absolute).split('\\').join('/')
      if (entry.isSymbolicLink()) violations.push(`${rel}:symlink`)
      else if (entry.isDirectory()) {
        if (TRANSIENT_DIRECTORY_NAMES.has(entry.name)) violations.push(`${rel}:transient-directory`)
        else walk(absolute)
      } else if (!entry.isFile()) violations.push(`${rel}:special-file`)
      else if (TRANSIENT_FILE.test(rel)) violations.push(`${rel}:transient-file`)
    }
  }
  walk(OUT_DIR)
  if (violations.length) {
    console.error(`  ❌ mirror contains forbidden filesystem artifacts: ${violations.join(', ')}`)
    scanFail += violations.length
  } else {
    console.log('  ✓ Mirror contains only regular source files/directories(0 symlink/cache/build artifacts)')
  }
}

// Scan 1: DS source residue prevention(per Test case M3)
// .claude/skills|commands|agents 移出 blanket 封鎖 → 改下方 name-aware allowlist(2026-06-18 C-prime skill delivery):
// fork-relevant 子集合法該 committed 進 mirror(use-template/fork session-1 可叫用 /prototype),非 fork 的仍擋。
// rules/memory/planning 維持封鎖：product role 只載入 provider-neutral common instruction，
// canonical rules/references 留在 exact npm package 供明示 on-demand read；memory/planning 刻意不送。
const dsSourceCheck = ['packages/design-system/src', 'packages/storybook-config/addons', '.claude/rules', 'governance/memory', 'governance/planning', '.claude-plugin']
for (const p of dsSourceCheck) {
  if (existsSync(join(OUT_DIR, p))) {
    console.error(`  ❌ DS internal path leaked into mirror: ${p}`)
    scanFail++
  }
}
// Shared launchers live once under the manifest-declared provider-neutral governance substrate.
// No launcher may remain under `.claude/hooks`: that would make Codex/future adapters depend on a
// Claude-owned lifecycle surface. The allowlist and destination both come from the fork manifest.
// 退役舊名:check_plugin_bootstrap.sh / block_production_edit_without_plugin.sh(plugin-first 時代移除)/
// check_governance_bootstrap.sh；現行相容 launcher 不安裝，只做唯讀驗證與短狀態輸出。
const forkManifest = forkSurfaceAuthority.manifest
const FORK_BOOTSTRAP_HOOKS = new Set(forkManifest.launchers || [])
if (!FORK_BOOTSTRAP_HOOKS.size) {
  console.error('  ❌ fork manifest has no committed launcher allowlist')
  scanFail++
}
const legacyClaudeHooksDir = join(OUT_DIR, '.claude/hooks')
if (existsSync(legacyClaudeHooksDir)) {
  console.error('  ❌ provider-neutral launcher migration incomplete: mirror still contains .claude/hooks')
  scanFail++
}
const launcherDestination = forkManifest?.consumer?.launcherDestination
const mirrorLauncherDir = typeof launcherDestination === 'string' ? join(OUT_DIR, launcherDestination) : null
if (!mirrorLauncherDir || !existsSync(mirrorLauncherDir)) {
  console.error('  ❌ manifest-declared provider-neutral launcher directory is missing from mirror')
  scanFail++
} else {
  const actual = readdirSync(mirrorLauncherDir).sort()
  const expected = [...FORK_BOOTSTRAP_HOOKS].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`  ❌ provider-neutral launcher inventory drift: actual=${actual.join(',')} expected=${expected.join(',')}`)
    scanFail++
  }
}
// name-aware allowlist:.claude/{skills,commands,agents} 只准 fork manifest 列的 fork-relevant 名;其餘 = DS-author-only 洩漏。
// allowed 名單 SSOT = ds-canonical/fork/manifest.json(build-fork-governance.mjs 產出)→ mirror guard 與 corpus 永不背離。
for (const cat of ['skills', 'commands', 'agents']) {
  const allowed = new Set([...(forkManifest[cat] || []), 'README.md'])
  const mirrorCatDir = join(OUT_DIR, '.claude', cat)
  if (existsSync(mirrorCatDir)) {
    const leaked = readdirSync(mirrorCatDir).filter((f) => !allowed.has(f))
    if (leaked.length) {
      console.error(`  ❌ non-fork-relevant .claude/${cat} leaked into mirror: ${leaked.join(', ')}(只准 fork manifest 列的 fork-relevant 名)`)
      scanFail += leaked.length
    }
  }
}
console.log(`  ✓ Scan DS source residue: ${dsSourceCheck.length} paths + provider-neutral launcher allowlist + skills/commands/agents name-allowlist checked,${scanFail} leaks`)

// Scan 2: secret leak prevention(per Test case M2)
const secretCheck = ['.env', '.env.local', '.npmrc.local', 'tmp/codex-stdout', '.claude/logs', '.claude/snapshots']
let secretLeaks = 0
for (const p of secretCheck) {
  if (existsSync(join(OUT_DIR, p))) {
    console.error(`  ❌ secret-class path leaked into mirror: ${p}`)
    secretLeaks++
    scanFail++
  }
}
console.log(`  ✓ Scan secret leak: ${secretCheck.length} paths checked,${secretLeaks} leaks`)

// Scan 3: Storybook integrity(per Test case M5 / codex Gap 4)
const sbMain = join(OUT_DIR, '.storybook/main.ts')
if (existsSync(sbMain)) {
  const sbContent = readFileSync(sbMain, 'utf8')
  if (sbContent.includes("'../packages/**/*.stories")) {
    console.error(`  ❌ Mirror .storybook/main.ts still has '../packages/**' glob`)
    scanFail++
  } else {
    console.log(`  ✓ Mirror .storybook/main.ts apps-only glob`)
  }
}

// Scan 4: Package dependency integrity(per Test case M4)
const finalRootPkg = JSON.parse(readFileSync(join(OUT_DIR, 'package.json'), 'utf8'))
if (finalRootPkg.workspaces?.includes('packages/*')) {
  console.error(`  ❌ Mirror root package.json workspaces still has 'packages/*'`)
  scanFail++
} else {
  console.log(`  ✓ Mirror root package.json workspaces apps-only`)
}

const appPkgFinal = existsSync(join(OUT_DIR, 'apps/template/package.json'))
  ? JSON.parse(readFileSync(join(OUT_DIR, 'apps/template/package.json'), 'utf8'))
  : null
if (appPkgFinal?.dependencies?.['@qijenchen/design-system'] === '*') {
  console.error(`  ❌ Mirror apps/template DS dep still '*'(not transformed to npm version)`)
  scanFail++
} else if (appPkgFinal) {
  const appVersion = appPkgFinal.dependencies['@qijenchen/design-system']
  if (appVersion !== dsVersion) {
    console.error(`  ❌ Mirror apps/template DS dep 非 exact release version:${appVersion}(expected ${dsVersion})`)
    scanFail++
  } else {
    console.log(`  ✓ Mirror apps/template DS dep exact:${appVersion}`)
  }
}

for (const [name, expected] of [['@qijenchen/design-system', dsVersion], ['@qijenchen/storybook-config', sbVersion]]) {
  const actual = finalRootPkg.dependencies?.[name]
  if (actual !== expected) {
    console.error(`  ❌ Mirror root ${name} 必須 exact:${actual}(expected ${expected})`)
    scanFail++
  }
}

// The same protected-base closed output policy is re-evaluated by the fresh
// writer.  Keeping builder and writer on one policy makes an allowlist change a
// deliberate authority change instead of two hand-maintained interpretations.
try {
  const mirrorPolicy = JSON.parse(readFileSync(join(REPO_ROOT, 'scripts/published-template-mirror-policy.json'), 'utf8'))
  validateMirrorRoot({ mirrorRoot: OUT_DIR, policy: mirrorPolicy, requireGenerated: false, authorityRoot: REPO_ROOT })
  console.log('  ✓ Protected-base published-template output policy')
} catch (error) {
  console.error(`  ❌ Published-template output policy:${error.message}`)
  scanFail++
}

console.log('')
if (scanFail > 0) {
  throw new Error(`Build FAILED with ${scanFail} integrity scan failures`)
}

console.log(`✅ Build complete: ${OUT_DIR}`)
console.log(`   Next: workflow uses a short-lived GitHub App token to open a protected upgrade PR`)
return Object.freeze({ outDir: OUT_DIR })
}

const isMain = Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.startsWith('--') ? a.slice(2).split('=') : [a, true]))
  try {
    buildPublishedTemplateMirror({ outDir: args.out || '/tmp/published-template-mirror' })
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  }
}

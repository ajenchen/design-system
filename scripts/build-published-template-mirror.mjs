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
//   - README.md, CLAUDE.md                 (consumer-facing,from template/ds-product-template/)
//   - package.json                         (TRANSFORMED:workspaces=apps/* only,DS dep=npm version)
//   - docs/                                (consumer onboarding)
//
// Excluded(absent from allowlist):
//   - packages/design-system/**           (DS source,Scenario B 看不到)
//   - packages/storybook-config/**         (DS internal addons preset source)
//   - .claude/{rules,hooks,skills,memory,planning,logs,benchmarks,...}  (governance via plugin install instead)
//   - .claude-plugin/**                    (marketplace metadata,DS-side only)
//   - hooks/hooks.json                     (plugin hook registration)
//   - tools/scripts not in scaffold list
//
// Usage:
//   node scripts/build-published-template-mirror.mjs --out=/tmp/mirror-build
//
// Invoked by:
//   .github/workflows/mirror-to-published-template.yml on push main

import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = Object.fromEntries(process.argv.slice(2).map(a => a.startsWith('--') ? a.slice(2).split('=') : [a, true]))
const OUT_DIR = args.out || '/tmp/published-template-mirror'

console.log(`▶ Building published template mirror`)
console.log(`  Source: ${REPO_ROOT}`)
console.log(`  Output: ${OUT_DIR}`)
console.log('')

// Clean output
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

// ━━━ ALLOWLIST(per codex r5「allowlist not denylist」)━━━

const ALLOWLIST = [
  // Product app seed(create-app source)
  'apps/template',
  // Shared scripts for product workflow
  'scripts/create-app.mjs',
  'scripts/setup-netlify-access.mjs',
  'scripts/check-plugin-installed.mjs',
  // Consumer-side scripts(Phase 4 moved from template/ds-product-template/scripts/)
  'scripts/audit-consumer-a11y.mjs',
  'scripts/deploy-url.mjs',
  'scripts/lint-ds-internal-imports.mjs',
  'scripts/sync-all.mjs',
  'scripts/verify-consumer-css-entry.mjs',
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
  'template/ds-product-template/CLAUDE.md',
  'template/ds-product-template/docs',
  'template/ds-product-template/tsconfig.json',
  'template/ds-product-template/.claude',  // settings.json with plugin marketplace flow
]

// Files within template/ds-product-template/ get "flattened" to mirror root
const FLATTEN_PREFIX = 'template/ds-product-template/'

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
  cpSync(src, dest, { recursive: true })
  console.log(`  ✓ ${path}${path.startsWith(FLATTEN_PREFIX) ? ' → ' + dest.replace(OUT_DIR + '/', '') : ''}`)
}
if (missingEntries.length > 0) {
  console.error(`\n❌ ${missingEntries.length} allowlist entry(ies) missing — published-template mirror 會不完整。修:更新 ALLOWLIST 或補回缺檔。`)
  console.error(`   缺:${missingEntries.join(', ')}`)
  process.exit(1)
}

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
  '@qijenchen/design-system': `^${dsVersion}`,
  '@qijenchen/storybook-config': `^${sbVersion}`,
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
    appPkg.dependencies['@qijenchen/design-system'] = `^${dsVersion}`
    writeFileSync(appTplPkgPath, JSON.stringify(appPkg, null, 2) + '\n')
    console.log(`  ✓ apps/template/package.json DS dep: ${before} → ^${dsVersion}`)
  }
}

// ━━━ Integrity scans(per codex Test case Mirror integrity 2-5)━━━

console.log('')
console.log(`▶ Integrity scans(mirror integrity)`)

let scanFail = 0

// Scan 1: DS source residue prevention(per Test case M3)
const dsSourceCheck = ['packages/design-system/src', 'packages/storybook-config/addons', '.claude/rules', '.claude/skills', '.claude/memory', '.claude/planning', '.claude-plugin']
for (const p of dsSourceCheck) {
  if (existsSync(join(OUT_DIR, p))) {
    console.error(`  ❌ DS internal path leaked into mirror: ${p}`)
    scanFail++
  }
}
// .claude/hooks 特例(2026-05-30):fork-committed bootstrap hooks 合法該在 mirror(補 plugin chicken-egg);
// 只准這 2 個,其餘 = DS governance hook 洩漏(governance 走 plugin install,不該進 mirror)。
const FORK_BOOTSTRAP_HOOKS = new Set(['check_plugin_bootstrap.sh', 'block_production_edit_without_plugin.sh'])
const mirrorHooksDir = join(OUT_DIR, '.claude/hooks')
if (existsSync(mirrorHooksDir)) {
  const leaked = readdirSync(mirrorHooksDir).filter((f) => !FORK_BOOTSTRAP_HOOKS.has(f))
  if (leaked.length) {
    console.error(`  ❌ DS governance hook leaked into mirror .claude/hooks: ${leaked.join(', ')}(governance 應走 plugin install)`)
    scanFail += leaked.length
  }
}
console.log(`  ✓ Scan DS source residue: ${dsSourceCheck.length} paths + .claude/hooks bootstrap-allowlist checked,${scanFail} leaks`)

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
  console.log(`  ✓ Mirror apps/template DS dep: ${appPkgFinal.dependencies['@qijenchen/design-system']}`)
}

console.log('')
if (scanFail > 0) {
  console.error(`❌ Build FAILED with ${scanFail} integrity scan failures`)
  process.exit(1)
}

console.log(`✅ Build complete: ${OUT_DIR}`)
console.log(`   Next: workflow uses CROSS_REPO_TOKEN to git push to ajenchen/ds-product-template main`)

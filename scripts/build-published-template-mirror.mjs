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
//   - scripts/{create-app,setup-netlify-access,check-plugin-installed,lint-ds-internal-imports,deploy-url,sync-all}.mjs
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

import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
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
  // Cloud-dev path
  '.devcontainer',
  // Consumer-facing scaffold(template/ds-product-template/ 內)
  'template/ds-product-template/.storybook',
  'template/ds-product-template/.github',
  'template/ds-product-template/.gitignore',
  'template/ds-product-template/.npmrc',
  'template/ds-product-template/.env.example',
  'template/ds-product-template/netlify.toml',
  'template/ds-product-template/README.md',
  'template/ds-product-template/CLAUDE.md',
  'template/ds-product-template/docs',
  'template/ds-product-template/tsconfig.json',
  'template/ds-product-template/.claude',  // settings.json with plugin marketplace flow
]

// Files within template/ds-product-template/ get "flattened" to mirror root
const FLATTEN_PREFIX = 'template/ds-product-template/'

for (const path of ALLOWLIST) {
  const src = join(REPO_ROOT, path)
  if (!existsSync(src)) {
    console.warn(`  ⚠️ allowlist entry missing: ${path}(skip)`)
    continue
  }
  const dest = join(OUT_DIR, path.startsWith(FLATTEN_PREFIX) ? path.slice(FLATTEN_PREFIX.length) : path)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
  console.log(`  ✓ ${path}${path.startsWith(FLATTEN_PREFIX) ? ' → ' + dest.replace(OUT_DIR + '/', '') : ''}`)
}

// ━━━ Transform root package.json ━━━

const dsRootPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
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

const appTplPkgPath = join(OUT_DIR, 'apps/template/package.json')
if (existsSync(appTplPkgPath)) {
  const appPkg = JSON.parse(readFileSync(appTplPkgPath, 'utf8'))
  if (appPkg.dependencies?.['@qijenchen/design-system'] === '*') {
    appPkg.dependencies['@qijenchen/design-system'] = `^${dsVersion}`
    writeFileSync(appTplPkgPath, JSON.stringify(appPkg, null, 2) + '\n')
    console.log(`  ✓ apps/template/package.json DS dep: * → ^${dsVersion}`)
  }
}

// ━━━ Integrity scans(per codex Test case Mirror integrity 2-5)━━━

console.log('')
console.log(`▶ Integrity scans(mirror integrity)`)

let scanFail = 0

// Scan 1: DS source residue prevention(per Test case M3)
const dsSourceCheck = ['packages/design-system/src', 'packages/storybook-config/addons', '.claude/rules', '.claude/hooks', '.claude/skills', '.claude/memory', '.claude/planning', '.claude-plugin']
for (const p of dsSourceCheck) {
  if (existsSync(join(OUT_DIR, p))) {
    console.error(`  ❌ DS internal path leaked into mirror: ${p}`)
    scanFail++
  }
}
console.log(`  ✓ Scan DS source residue: ${dsSourceCheck.length} paths checked,${scanFail} leaks`)

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

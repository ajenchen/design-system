#!/usr/bin/env node
// scripts/create-app.mjs — bootstrap a new product app from apps/template/
//
// Usage: npm run create-app <kebab-case-name>
//
// Copies apps/template/ → apps/<name>/ + patches:
//   - package.json `name` → @product/<name>
//   - package.json 受管套件(@qijenchen/design-system / storybook-config)版號 → 與根目錄同版
//   - index.html `<title>` → <name>
//   - story `title:` field 從 `Apps/template/...` → `Apps/<name>/...`(防 Storybook id 撞)
// 排除 build artifacts(node_modules / dist / *.tsbuildinfo / .turbo / .next)

import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const name = process.argv[2]
if (!name) {
  console.error('Usage: npm run create-app <kebab-case-name>')
  console.error('Example: npm run create-app order-dashboard')
  process.exit(1)
}
if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error(`Name must be kebab-case lowercase: ${name}`)
  process.exit(1)
}
if (name === 'template') {
  console.error(`Cannot use 'template' as app name(reserved for skeleton)`)
  process.exit(1)
}

const src = join(REPO_ROOT, 'apps/template')
const dest = join(REPO_ROOT, 'apps', name)

if (existsSync(dest)) {
  console.error(`apps/${name}/ already exists`)
  process.exit(1)
}

// Exclude build artifacts + caches when copying(2026-05-28 anchor:cpSync 預設帶走 dist
// + tsconfig.tsbuildinfo 等 stale build cache → 新 app 帶舊 path,即髒
// build artifact 還在 sidebar 顯重複 story id)
const EXCLUDED_NAMES = new Set([
  'node_modules', 'dist', 'storybook-static', '.turbo', '.next', '.cache',
  'tsconfig.tsbuildinfo',
])
cpSync(src, dest, {
  recursive: true,
  filter: (srcPath) => {
    const rel = relative(src, srcPath)
    // 第一層 entry name match → exclude(eg. src/apps/template/dist/foo.js
    // 的 rel = 'dist/foo.js',頂層 'dist' 在 EXCLUDED_NAMES → skip 整 subtree)
    const topLevel = rel.split('/')[0] || rel
    if (EXCLUDED_NAMES.has(topLevel)) return false
    return true
  },
})

// Patch package.json name
const pkgPath = join(dest, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.name = `@product/${name}`
// 受管套件跟根目錄同版(2026-11-26 產品 canary 缺陷 1):apps/template 的版號可能是建 repo 當時的版,
// 照抄會讓新 app 鎖舊版、lock 替它裝一份舊版巢狀副本。根目錄宣告的 exact 版號就是 lock 解析到的版號。
const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const alignedDeclarations = []
for (const packageName of ['@qijenchen/design-system', '@qijenchen/storybook-config']) {
  const rootVersion = rootPkg.dependencies?.[packageName] ?? rootPkg.devDependencies?.[packageName]
  if (!EXACT_SEMVER.test(rootVersion || '')) continue
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (pkg[section]?.[packageName] === undefined || pkg[section][packageName] === rootVersion) continue
    pkg[section][packageName] = rootVersion
    alignedDeclarations.push(`${section}.${packageName}=${rootVersion}`)
  }
}
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

// Patch index.html title
const htmlPath = join(dest, 'index.html')
const html = readFileSync(htmlPath, 'utf8').replace(
  /<title>Template<\/title>/,
  `<title>${name}</title>`,
)
writeFileSync(htmlPath, html)

// Patch story titles `Apps/template/...` → `Apps/<name>/...`(防 Storybook id 撞 collide
// 與 template 的 stories — 否則 build 出 duplicate id warning + 只顯 template,新 product
// 在 sidebar 不可見。anchor 2026-05-28 verify-flow-test e2e test 抓到 4 duplicate ids)
function patchStoryTitles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      patchStoryTitles(full)
    } else if (entry.endsWith('.stories.tsx') || entry.endsWith('.stories.ts') || entry.endsWith('.mdx')) {
      const content = readFileSync(full, 'utf8')
      // Match `title: 'Apps/template/...'` AND `title: "Apps/template/..."`
      const patched = content.replace(
        /(title:\s*['"`])Apps\/template\//g,
        `$1Apps/${name}/`,
      )
      if (patched !== content) {
        writeFileSync(full, patched)
      }
    }
  }
}
patchStoryTitles(join(dest, 'src'))

// Verify critical files copied(若 template 改名 / 重構 → 防 silent miss)
const REQUIRED = ['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'src']
for (const f of REQUIRED) {
  if (!existsSync(join(dest, f))) {
    console.error(`✗ Missing required file after copy: ${f}`)
    console.error(`  Likely template restructure — fix create-app.mjs REQUIRED list`)
    process.exit(1)
  }
}

// Safety net:rm dist + tsbuildinfo if any slipped past filter
for (const cache of ['dist', 'tsconfig.tsbuildinfo', 'storybook-static']) {
  const cachePath = join(dest, cache)
  if (existsSync(cachePath)) {
    rmSync(cachePath, { recursive: true, force: true })
  }
}

console.log(`✓ Created apps/${name}/`)
if (alignedDeclarations.length) console.log(`✓ Aligned design-system packages with the root: ${alignedDeclarations.join(', ')}`)
console.log(`✓ Patched story titles → Apps/${name}/...(防 Storybook id 撞 template)`)
console.log(`✓ Excluded build artifacts(node_modules / dist / *.tsbuildinfo / .turbo / .next / .cache)`)
console.log(``)
console.log(`Next steps:`)
console.log(`  npm install            # ← 必跑:重新 link workspace symlinks 讓 apps/${name}/node_modules 拿 DS deps`)
console.log(`  cd apps/${name}`)
console.log(`  npm run dev            # start dev server`)
console.log(``)
console.log(`Verify in Storybook(from repo root):`)
console.log(`  npm run build-storybook  # auto-picks apps/${name}/**/*.stories.tsx`)
console.log(`  npx storybook dev -p 6006  # open http://localhost:6006/?path=/story/apps-${name}-...`)

#!/usr/bin/env node
// dogfood-prepublish-verify.mjs — pre-publish 真實 consumer install + vite build verify
//
// Why: beta.1-10 連 ship 多次「裝完才發現少 transitive peer dep」class bug
//   (lucide-react / react-is / etc.) — release.yml audit gates 沒 catch,只有 Netlify
//   consumer build 才炸。
//   本 script 在 publish 前 simulate fresh consumer install + vite build,
//   提前 catch missing peer dep。
//
// 流程:
//   1. npm pack DS + storybook-config to tmp
//   2. mkdtemp 全新 consumer project
//   3. npm install 兩 tarball + react + react-dom + vite
//   4. 寫 minimal App.tsx import 各 component + vite build
//   5. 0 error pass / 任一 error fail with full log
//
// 加進 release.yml audit gates → fail 該 block publish。

import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DS = join(REPO_ROOT, 'packages/design-system')
const SB = join(REPO_ROOT, 'packages/storybook-config')

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`)
  return execSync(cmd, { stdio: 'inherit', ...opts })
}

function runCapture(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim()
}

// Step 0: canonical/provider projection drift gate (canonical ds-canonical sources own policy;
// npm mirrors and provider homes are deterministic outputs only).
console.log('=== Step 0: ds-canonical mirror drift check ===')
try {
  run('node scripts/sync-ds-canonical.mjs --check', { cwd: REPO_ROOT, stdio: 'inherit' })
} catch {
  console.error('❌ ds-canonical mirror drift — run `npm run sync:ds-canonical` then re-commit before publish')
  process.exit(1)
}

// Step 1: pack
console.log('=== Step 1: pack DS + storybook-config ===')
const packDir = mkdtempSync(join(tmpdir(), 'ds-dogfood-pack-'))
const dsTgz = runCapture(`cd ${DS} && npm pack --pack-destination ${packDir}`)
const sbTgz = runCapture(`cd ${SB} && npm pack --pack-destination ${packDir}`)
console.log('  packed:', dsTgz, sbTgz)

// Step 2: fresh consumer project
console.log('=== Step 2: fresh consumer project ===')
const consumerDir = mkdtempSync(join(tmpdir(), 'ds-dogfood-consumer-'))
console.log('  consumer:', consumerDir)
run(`cd ${consumerDir} && npm init -y`)

// Step 3: install
console.log('=== Step 3: install ===')
run(`cd ${consumerDir} && npm install --no-audit --no-fund ${packDir}/${dsTgz} ${packDir}/${sbTgz} react@19 react-dom@19 vite@7 @vitejs/plugin-react@5 tailwindcss@4 @tailwindcss/vite@4 typescript@5`)

// Step 4: write minimal App.tsx + index.html + vite.config + globals.css
console.log('=== Step 4: write consumer app ===')
const srcDir = join(consumerDir, 'src')
mkdirSync(srcDir, { recursive: true })

writeFileSync(join(consumerDir, 'index.html'), `<!doctype html>
<html><head><title>Dogfood</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
`)

writeFileSync(join(consumerDir, 'vite.config.ts'), `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({ plugins: [react(), tailwindcss()] })
`)

writeFileSync(join(consumerDir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM'],
    module: 'ESNext',
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    isolatedModules: true,
    noEmit: false,
  },
  include: ['src'],
}, null, 2))

writeFileSync(join(srcDir, 'globals.css'), `@import 'tailwindcss';
@import '@qijenchen/design-system/styles/tokens';
@source '../node_modules/@qijenchen/design-system/src/**/*.{js,ts,jsx,tsx}';
`)

// Cover MAJOR component families to surface missing peer deps:
//   Button(lucide-react)/ Chart(recharts → react-is)/ DataTable(tanstack)/
//   Dialog(radix)/ Sortable(dnd-kit)/ DatePicker(react-day-picker)
writeFileSync(join(srcDir, 'main.tsx'), `import { createRoot } from 'react-dom/client'
import { TooltipProvider, Button, Avatar, Dialog, Chart, DataTable } from '@qijenchen/design-system'
import './globals.css'
createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <Button variant="primary">Hello</Button>
    <Avatar name="W" />
  </TooltipProvider>
)
`)

// Step 4.5: verify ds-canonical + scoped AGENTS/CLAUDE instructions + spec.md ship
console.log('=== Step 4.5: verify ds-canonical + scoped AGENTS/CLAUDE instructions ship ===')
const dsRoot = join(consumerDir, 'node_modules/@qijenchen/design-system')
const canonicalChecks = [
  ['AGENTS.md', 'scoped package AGENTS.md'],
  ['CLAUDE.md', 'CLAUDE.md'],
  ['ds-canonical/skills', 'ds-canonical/skills/'],
  ['ds-canonical/hooks', 'ds-canonical/hooks/'],
  ['ds-canonical/rules', 'ds-canonical/rules/'],
  ['ds-canonical/references', 'ds-canonical/references/'],
  ['ds-canonical/commands', 'ds-canonical/commands/'],
  ['src/components/Button/button.spec.md', 'Button spec.md'],
  // C-prime fork 治理 corpus(fork 取得治理的命脈;漏 ship = fork 完全拿不到治理)
  ['ds-canonical/fork/manifest.json', 'fork manifest(dispatcher 清單)'],
  ['ds-canonical/fork/hooks', 'fork hook bodies(機械強制)'],
  ['ds-canonical/fork/launchers/fork-governance-dispatcher.sh', 'fork 接線骨架(sync-all 刷新源)'],
  ['ds-canonical/fork/launchers/settings-hooks.json', 'fork settings hooks 模板'],
  // fork hook 依賴的 registry(漏 ship → opacity/layout-space hook 在 fork 降級 fallback、失去 radius/typography/elevation block-list)
  ['src/tokens/utility-registry.json', 'utility-registry(fork opacity/layout-space hook 依賴)'],
]
for (const [path, label] of canonicalChecks) {
  if (!existsSync(join(dsRoot, path))) {
    console.error(`❌ ${label} NOT shipped to npm pack(${path})`)
    process.exit(1)
  }
  console.log(`✓ ${label} shipped`)
}

// Step 4.6: verify CLI bin
console.log('=== Step 4.6: verify bin qijenchen-ds-init ===')
const binPath = join(consumerDir, 'node_modules/.bin/qijenchen-ds-init')
if (!existsSync(binPath)) {
  console.error('❌ qijenchen-ds-init bin not installed')
  process.exit(1)
}
console.log('✓ qijenchen-ds-init bin available')

// Step 5: vite build
console.log('=== Step 5: vite build(catches missing peer deps)===')
try {
  run(`cd ${consumerDir} && npx vite build`)
  console.log('')
  console.log('✅ DOGFOOD PASS — consumer install + canonical ship + vite build success')
} catch (e) {
  console.error('')
  console.error('❌ DOGFOOD FAIL — consumer build broke. Likely missing transitive peer dep.')
  console.error('   Check vite build output above for `Rollup failed to resolve` errors.')
  process.exit(1)
} finally {
  // Cleanup
  try { rmSync(packDir, { recursive: true, force: true }) } catch {}
  try { rmSync(consumerDir, { recursive: true, force: true }) } catch {}
}

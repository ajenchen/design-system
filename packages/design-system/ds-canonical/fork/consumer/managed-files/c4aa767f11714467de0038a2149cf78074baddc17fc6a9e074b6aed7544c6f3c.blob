#!/usr/bin/env node
// verify-consumer-css-entry.mjs — 機械保證 consumer CSS 入口完整,防 globals.css「掉東掉西」drift
//
// Why(2026-05-29,user「為何 globals.css 老讓 template 掉東西?怎麼永遠避免?」):
//   consumer(apps + storybook)的 CSS 入口必須含 3 片段才能正確消費 DS,缺任一就 drift:
//     1. `@import 'tailwindcss'`            — Tailwind v4 引擎(缺 → 完全沒 utility class)
//     2. `@import '@qijenchen/design-system/styles/tokens'` — tokens + base 層(缺 → 字體/底色/間距退預設,即字體 drift bug)
//        (base 層 2026-05-29 已併入 tokens aggregator,故單一 import 即拿 tokens+base)
//     3. `@source '...design-system...src...'` — Tailwind scan DS 元件原始碼產對應 utility(缺 → DS 元件 unstyled「沒吃到元件」bug)
//   過去這 3 個都各 drift 過(font / 沒吃到元件)。本 script = 那層缺失的機械保證。
//
// Scan:遞迴掃 apps/ + .storybook/ + template/ + src/ 全部 .css,抓所有 Tailwind 入口(`@import 'tailwindcss'`),
//   排除 DS-internal dev 入口(用相對 workspace path import DS 的 repo-root globals.css),其餘視為 consumer 入口必檢。
//   2026-05-29 加固:從固定候選路徑改遞迴掃描 → 非標準路徑/檔名的 consumer 入口也抓得到(codex Q4 boundary #1 閉合)。
// 用法:node scripts/verify-consumer-css-entry.mjs(CI / 手動)。fork repo 同 script 自驗。

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const TAILWIND_ENTRY = /@import\s+['"]tailwindcss['"]/
// DS-internal dev 入口(repo-root src/globals.css)用相對 workspace path import DS,合法用個別 token import + 相對 base.css,
// 非 consumer 路徑 → 排除,不要求 npm-path 的 tokens aggregator import。
const DS_INTERNAL = /@import\s+['"]\.\.?\/[^'"]*packages\/(design-system|storybook-config)/

// 2026-05-29 加固(user「做到完美」+ codex Q4 boundary #1):不再只掃固定候選路徑,
// 改遞迴掃 consumer 領域全部 .css → 抓所有 Tailwind 入口(含非標準路徑檔名)→ 排除 DS-internal → 其餘必須完整。
// 用手寫 walker 而非 fs.globSync:後者 `**` 不匹配 dot 目錄(.storybook)→ 會漏 storybook 入口。
const SKIP_DIR = new Set(['node_modules', 'dist', 'storybook-static', '.git'])
function walkCss(rel) {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) return []
  const out = []
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue
    const child = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walkCss(child))
    else if (e.name.endsWith('.css')) out.push(child)
  }
  return out
}
const SCAN_DIRS = ['apps', '.storybook', 'template', 'src']
const allCss = SCAN_DIRS.flatMap(walkCss)

// Consumer 入口 = Tailwind 入口 且 非 DS-internal dev 入口。
const candidates = allCss.filter((p) => {
  const css = readFileSync(join(ROOT, p), 'utf8')
  return TAILWIND_ENTRY.test(css) && !DS_INTERNAL.test(css)
})

const REQUIRED = [
  { name: "@import 'tailwindcss'", re: /@import\s+['"]tailwindcss['"]/ },
  { name: "@import '@qijenchen/design-system/styles/tokens'", re: /@import\s+['"]@qijenchen\/design-system\/styles\/tokens['"]/ },
  { name: "@source '...design-system...src...'", re: /@source\s+['"][^'"]*@qijenchen\/design-system\/src/ },
]

let failed = false
for (const rel of candidates) {
  const css = readFileSync(join(ROOT, rel), 'utf8')
  const missing = REQUIRED.filter((r) => !r.re.test(css))
  if (missing.length) {
    failed = true
    console.error(`❌ ${rel} 缺 consumer CSS 必要片段:`)
    for (const m of missing) console.error(`   - ${m.name}`)
  } else {
    console.log(`✓ ${rel}(tailwind + tokens+base + @source 齊全)`)
  }
}

if (candidates.length === 0) {
  console.log('（無 consumer CSS 入口可檢 — 非 consumer repo 或無 apps/storybook）')
  process.exit(0)
}
if (failed) {
  console.error('\n消費端 CSS 入口不完整 → DS 元件會 drift(字體/底色/unstyled)。補齊上述片段。')
  process.exit(1)
}
console.log('\n✅ 所有 consumer CSS 入口完整(tailwind + tokens+base + DS @source）— globals.css drift 防線通過')

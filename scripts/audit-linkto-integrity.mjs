#!/usr/bin/env node
/**
 * audit-linkto-integrity.mjs — LinkTo 斷鏈 deterministic 偵測(DA3 C.0b 判準化 harvest,2026-07-16)。
 *
 * 為何存在:story 改名 / retire 不會自動掃「反向引用」,principles/stories 的 <LinkTo kind name>
 *   斷鏈只有點擊才發現。DA3 round 抓到 4 家(Alert ×4 / Separator / Toast / Tooltip)全是同 class:
 *   story 更名(humanize)或 retire 後 LinkTo 指向不存在的 (kind,name)。本 script 把這類漂移謂詞化:
 *   全庫 LinkTo → 對照 source-of-truth(stories 檔的 title + name/export)→ 缺 = exit 1。
 *
 * 機制:掃 packages/design-system/src(+ apps)所有 *.stories.tsx:
 *   (1) 收集每檔 meta title + 每個 story 的 display name(name: '...' 優先,否則 export 名);
 *   (2) 收集所有 <LinkTo kind="X" name="Y">(name 可省略);
 *   (3) 每個 LinkTo 的 kind 必存在於 titles;帶 name 者,name 必存在於該 kind 的 story names。
 *
 * 用法:node scripts/audit-linkto-integrity.mjs [--check]
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!/node_modules|storybook-static|dist/.test(e.name)) walk(p, out) }
    else if (e.name.endsWith('.stories.tsx')) out.push(p)
  }
  return out
}
const files = [
  ...walk(path.join(ROOT, 'packages/design-system/src')),
  ...(fs.existsSync(path.join(ROOT, 'apps')) ? walk(path.join(ROOT, 'apps')) : []),
]

// (1) source of truth:title → Set(story display names)
const kinds = new Map()
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  // title 錨定 namespace 前綴(避免撿到資料物件的 title: 欄位)
  const t = src.match(/title:\s*['"`]((?:Design System|Apps)\/[^'"`]+)['"`]/)
  if (!t) continue
  const title = t[1]
  if (!kinds.has(title)) kinds.set(title, new Set())
  const set = kinds.get(title)
  // 保守全收:全檔 name: '...' 欄位 + 全部 export const 名(over-inclusive 但 integrity 檢查安全側)
  for (const m of src.matchAll(/^\s*name:\s*['"`]([^'"`]+)['"`]/gm)) set.add(m[1])
  for (const m of src.matchAll(/export const (\w+)/g)) set.add(m[1])
}

// (2)(3) LinkTo 掃描 + 驗證
const broken = []
let total = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/<LinkTo\s+kind=["']([^"']+)["'](?:[^>]*?name=["']([^"']+)["'])?/g)) {
      total++
      const [, kind, name] = m
      const rel = path.relative(ROOT, f) + ':' + (i + 1)
      if (!kinds.has(kind)) { broken.push({ at: rel, kind, name, why: 'kind(title)不存在' }); continue }
      if (name && !kinds.get(kind).has(name)) broken.push({ at: rel, kind, name, why: 'name 不在該 kind 的 stories' })
    }
  }
}

console.log(`═══ LinkTo integrity — 掃 ${files.length} stories 檔,${total} 個 LinkTo ═══`)
if (broken.length) {
  console.error(`❌ ${broken.length} 斷鏈:`)
  for (const b of broken) console.error(`   ${b.at} — kind="${b.kind}"${b.name ? ` name="${b.name}"` : ''}(${b.why})`)
  if (CHECK) process.exit(1)
} else console.log('✅ 0 斷鏈')
process.exit(0)

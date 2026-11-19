#!/usr/bin/env node
/**
 * check-story-linkto-targets.mjs — deterministic stale-LinkTo detector(2026-05-30)
 *
 * 根因:principles.stories.tsx 的 `<LinkTo kind name>` 用 name 字串精確匹配 showcase story 的 name:;
 * showcase name 中文人話化(eg. Fallback→備援顯示)後,principles LinkTo name 沒同步 → @storybook/addon-links
 * 找不到 target → dead-end nav。82-finding Storybook 稽核發現這是 ~13 元件的系統性問題(之前無機械防線)。
 *
 * 本 script = SSOT 機械防線:驗每個 LinkTo(kind, name)的 name 真的命中該 kind(title)底下某個 story 的
 * name(explicit `name:` OR export-derived)。對齊 user 2026-05-30「不抽樣 / 該 SSOT 就 SSOT / 全部世界級」。
 *
 * 2026-11-20(A121-F9):同時認 `<StoryLink kind name>`(stories-helpers/examples/tutorial-page.tsx 包 LinkTo 的元件,repo 的連結幾乎全用它)。
 * 之前只認 `<LinkTo`,而 `<LinkTo` 字面只剩 StoryLink 自己那一處(kind={kind}),本閘恆綠、meta-test 注入抓不到。
 *
 * Usage: node scripts/check-story-linkto-targets.mjs [--check]
 */
import fs from 'node:fs'
import { globSync } from 'node:fs'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')
const files = globSync('packages/design-system/src/**/*.stories.tsx', { cwd: ROOT })

// storyNameFromExport(對齊 Storybook:PascalCase/camelCase → 空格 Title Case;底線→空格)
const deriveName = (exp) =>
  exp.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim()

// 1) 建 title → Set<story name>(explicit name: + export-derived)
const titleToNames = new Map()
for (const rel of files) {
  const c = fs.readFileSync(rel, 'utf8')
  // meta.title 只認 namespace-prefixed canonical(story-rules.md 2-namespace SSOT);
  // 避免被 data-object `title:` 欄位(eg. `title: '電子郵件通知'`)誤當 meta title。
  const titleM = c.match(/title:\s*['"]((?:Design System|Apps)\/[^'"]+)['"]/)
  if (!titleM) continue
  const title = titleM[1]
  if (!titleToNames.has(title)) titleToNames.set(title, new Set())
  const set = titleToNames.get(title)
  for (const m of c.matchAll(/^\s*name:\s*['"]([^'"]+)['"]/gm)) set.add(m[1])
  for (const m of c.matchAll(/export const (\w+)\s*[:=]/g)) {
    if (m[1] === 'meta' || m[1] === 'default') continue
    set.add(deriveName(m[1]))
  }
}

// 2) 驗每個 LinkTo
const stale = []
const unknownKind = []
for (const rel of files) {
  const lines = fs.readFileSync(rel, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/<(?:LinkTo|StoryLink)\b[^>]*?\bkind=["']([^"']+)["'][^>]*?\bname=["']([^"']+)["']/g)) {
      const [, kind, name] = m
      if (!titleToNames.has(kind)) { unknownKind.push(`${rel}:${i + 1}  kind="${kind}"(無此 title 的 stories)`); continue }
      if (!titleToNames.get(kind).has(name)) {
        const avail = [...titleToNames.get(kind)].join(' / ')
        stale.push(`${rel}:${i + 1}  LinkTo name="${name}" 在 "${kind}" 找不到 → 可選:${avail}`)
      }
    }
  })
}

console.log(`=== Story LinkTo target check ===`)
console.log(`stories scanned: ${files.length} | titles: ${titleToNames.size}`)
console.log(`stale LinkTo(name 對不到 target story): ${stale.length}`)
console.log(`unknown kind(title 不存在): ${unknownKind.length}`)
if (stale.length) { console.log('\n⚠️  STALE LinkTo:'); stale.forEach((s) => console.log(`  ${s}`)) }
if (unknownKind.length) { console.log('\n⚠️  UNKNOWN kind:'); unknownKind.forEach((s) => console.log(`  ${s}`)) }
if (!stale.length && !unknownKind.length) console.log('\n✅ All LinkTo targets resolve.')
if (CHECK && (stale.length || unknownKind.length)) process.exit(1)

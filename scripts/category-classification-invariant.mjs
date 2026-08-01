#!/usr/bin/env node
// category-classification-invariant.mjs — 「放對地方了嗎」機械檢查(2026-06-05 RFC P1)。
//
// Why(上一輪稽核抓到 5/68 borderline,且**沒有任何稽核在檢查分類一致性**):
//   每個 DS 單元的 category 由三訊號決定:folder / storybook title prefix / frontmatter isInternal。
//   三訊號必須**互相一致**(都指同一 category),且 reader-facing Autodocs 必符合該
//   category 的 policy。不一致 = 分類 / 文件可見性漂移。
//   SSOT = packages/design-system/src/story-governance/category-matrix.json。
//
// 注意分工:本檢查只管「三訊號一致」(deterministic)。「該單元『本質上』該不該是這 category」
//   (機械 render test 判斷,如 element-anatomy 本質是 internal)屬 judgment audit dim,不在此(P3 遷移處理)。
//
// 逃生:`// category-classify-allow: <理由>` 寫在該 unit 的 spec.md 檔首。
// Run: `node scripts/category-classification-invariant.mjs`(release-preflight chain)。fail → exit 1。

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'packages/design-system/src')

const matrix = JSON.parse(readFileSync(join(SRC, 'story-governance/category-matrix.json'), 'utf8'))
const KNOWN = Object.keys(matrix.categories) // token/component/pattern/internal/template

function fromFolder(relDir) {
  if (relDir.startsWith('tokens/')) return 'token'
  if (relDir.startsWith('components/Internal/')) return 'internal'
  if (relDir.startsWith('components/')) return 'component'
  if (relDir.startsWith('patterns/')) return 'pattern'
  return null
}
function fromTitle(title) {
  if (!title) return null
  if (/Design System\/Internal Patterns\//.test(title)) return 'internal'
  if (/Design System\/Internal\//.test(title)) return 'internal'
  if (/Design System\/Components\//.test(title)) return 'component'
  if (/Design System\/Patterns\//.test(title)) return 'pattern'
  if (/Design System\/Tokens\//.test(title)) return 'token'
  if (/^['"]?Apps\//.test(title)) return 'template'
  return null
}

const failures = []
const seen = []

// storySort is a runtime projection of matrix.sidebarOrder. Keep the shared
// Storybook package in the same order without introducing a second authority.
const previewSource = readFileSync(join(ROOT, 'packages/storybook-config/preview.tsx'), 'utf8')
const storySortStart = previewSource.indexOf('storySort:')
const sidebarLabels = Object.values(matrix.categories)
  .sort((a, b) => a.sidebarOrder - b.sidebarOrder)
  .map(rule => rule.titlePrefix.split('/').at(-1))
const internalIndex = sidebarLabels.indexOf('Internal')
if (internalIndex >= 0) sidebarLabels.splice(internalIndex + 1, 0, 'Internal Patterns')
let previousSidebarPosition = storySortStart
for (const label of sidebarLabels) {
  const position = storySortStart >= 0 ? previewSource.indexOf(`'${label}'`, storySortStart) : -1
  if (position < 0 || position <= previousSidebarPosition) {
    failures.push(`✗ packages/storybook-config/preview.tsx: storySort 未依 category-matrix sidebarOrder 排列(${sidebarLabels.join(' → ')})`)
    break
  }
  previousSidebarPosition = position
}

// 列舉 unit 目錄
const unitDirs = []
for (const base of ['components', 'patterns', 'tokens']) {
  const baseDir = join(SRC, base)
  if (!existsSync(baseDir)) continue
  for (const e of readdirSync(baseDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    if (base === 'components' && e.name === 'Internal') {
      for (const inner of readdirSync(join(baseDir, e.name), { withFileTypes: true })) {
        if (inner.isDirectory()) unitDirs.push(`components/Internal/${inner.name}`)
      }
    } else {
      unitDirs.push(`${base}/${e.name}`)
    }
  }
}

for (const relDir of unitDirs) {
  const absDir = join(SRC, relDir)
  const files = readdirSync(absDir)
  const specFile = files.find((f) => f.endsWith('.spec.md'))
  const storyFiles = files.filter((f) => f.endsWith('.stories.tsx'))
  if (!specFile && storyFiles.length === 0) continue // 非 unit(helper 等)

  const specSrc = specFile ? readFileSync(join(absDir, specFile), 'utf8') : ''
  if (/category-classify-allow:/.test(specSrc)) { seen.push(`${relDir} (allowlisted)`); continue }

  const isInternal = /(?:^|\n)\s*-?\s*isInternal\b|(?:^|\n)\s*internal:\s*true/.test(specSrc)
  const folderBase = fromFolder(relDir) // token / component / pattern(folder 只分大類,不分 internal)
  // resolveCategory(對齊 category-matrix.ts):isInternal frontmatter 是 internal 的權威訊號,
  // folder 是扁平的(internal 元件仍住 components/<Name>/,靠 frontmatter+title 標記,非實體 Internal/ 子夾)。
  const resolvedCat = isInternal ? 'internal' : folderBase
  // 掃**每一個** story file 的 title(同 unit 全部 story 必同 category;不可只看第一個)
  const titleCats = []
  const storySources = new Map()
  for (const sf of storyFiles) {
    const storySource = readFileSync(join(absDir, sf), 'utf8')
    storySources.set(sf, storySource)
    const m = storySource.match(/title:\s*(['"][^'"]+['"])/)
    const t = m ? fromTitle(m[1]) : null
    if (t) titleCats.push({ sf, t })
  }
  seen.push(relDir)

  // Invariant 1:每個 story title 反映的 category 必 === resolveCategory(frontmatter+folder)
  for (const { sf, t } of titleCats) {
    if (resolvedCat && t !== resolvedCat) {
      failures.push(`✗ ${relDir}/${sf}: 解析 category=[${resolvedCat}](isInternal=${isInternal}, folder=${folderBase})但 title 說 [${t}] — 訊號不一致`)
    }
    // Invariant 2:title 標 Internal 但 frontmatter 沒 isInternal = internal 權威訊號缺
    if (t === 'internal' && !isInternal) {
      failures.push(`✗ ${relDir}/${sf}: title 是 Internal/ 但 spec.md 無 frontmatter isInternal 標記(internal 權威訊號缺)`)
    }
  }
  // Invariant 3:同 unit 的多個 story 不可彼此 category 打架
  const distinct = [...new Set(titleCats.map((x) => x.t))]
  if (distinct.length > 1) {
    failures.push(`✗ ${relDir}: 同 unit 的 story titles 跨 category 不一致(${distinct.join(' vs ')})`)
  }

  // Invariant 4:public category 的 reader-facing owner story 必開 Autodocs;
  // internal/reference category 必維持關閉。Anatomy / principles 已各自是文件頁,
  // 所以 tag 只由 main `*.stories.tsx` owner 持有,避免三層各多一份重複 Docs。
  const expectedAutodocs = matrix.categories[resolvedCat]?.autodocs
  for (const sf of storyFiles.filter(name => !name.endsWith('.anatomy.stories.tsx') && !name.endsWith('.principles.stories.tsx'))) {
    const storySource = storySources.get(sf)
    const metaEnd = storySource.indexOf('export default')
    const metaSource = metaEnd >= 0 ? storySource.slice(0, metaEnd) : storySource
    const hasAutodocs = /tags:\s*\[[^\]]*['"]autodocs['"]/.test(metaSource)
    if (expectedAutodocs === true && !hasAutodocs) {
      failures.push(`✗ ${relDir}/${sf}: category=[${resolvedCat}]要求 main story 啟用 tags:['autodocs']`)
    }
    if (expectedAutodocs === false && hasAutodocs) {
      failures.push(`✗ ${relDir}/${sf}: category=[${resolvedCat}]禁止 main story 啟用 Autodocs`)
    }
  }
}

console.log('\n=== Category Classification Invariant(分類訊號 + Autodocs + sidebar order)===')
console.log(`Scanned: ${seen.length} units   FAIL: ${failures.length}\n`)
if (failures.length) {
  console.log(failures.join('\n'))
  console.error(`\n✗ ${failures.length} 個單元分類訊號不一致(放錯地方 / 標記漂移)。`)
  console.error(`  修:對齊 folder + storybook title + frontmatter isInternal 三者(SSOT: story-governance/category-matrix.json 決策樹)。`)
  console.error(`  確為刻意 → spec.md 檔首加 \`<!-- category-classify-allow: <理由> -->\`。`)
  process.exit(1)
}
console.log(`✓ ${seen.length} 個單元三訊號全一致(無分類漂移).`)
process.exit(0)

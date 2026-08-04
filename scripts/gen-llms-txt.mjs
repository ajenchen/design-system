#!/usr/bin/env node
/**
 * gen-llms-txt.mjs — build-time 從 spec.md frontmatter + storybook index 生成
 *   packages/design-system/llms.txt(精簡 index)+ llms-full.txt(全文,含 variants/sizes/禁止事項)。
 *
 * 對齊 llmstxt.org(H1 + blockquote summary + H2 file-list)+ Mantine「每 release 從 source
 * 自動生成、禁手維護」。隨 npm ship(files + exports),consumer / AI coding assistant 取用
 * `@qijenchen/design-system/llms.txt` 當設計參考 SSOT。
 *
 * Source = 已存在的結構化 canonical(spec.md frontmatter:component/pattern/family/variants.when/
 * sizes.when/禁止事項)+ storybook-static/index.json(story id → URL)。**禁手維護** —— CI / preflight
 * 用 --check drift gate 強制每 release 從 source 重生(對齊 ds-story-manifest pattern)。
 *
 * Run:postbuild-storybook + ci.yml --check + release.yml audit gate。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const DS = join(REPO_ROOT, 'packages/design-system')
const SRC = join(DS, 'src')
const LLMS = join(DS, 'llms.txt')
const LLMS_FULL = join(DS, 'llms-full.txt')
const SB_BASE = 'https://ajenchen-design-system.netlify.app'  // DS canonical public Storybook(同 AllDsComponents portal)
const CHECK = process.argv.includes('--check')

const version = JSON.parse(readFileSync(join(DS, 'package.json'), 'utf8')).version

// ── 1. 蒐集 component + pattern spec.md(遞迴 walk,避免 glob 依賴)──
function walkSpecs(root, kind) {
  const out = []
  for (const dir of readdirSync(root)) {
    const full = join(root, dir)
    if (!statSync(full).isDirectory()) continue
    // 遞迴一層(components/Internal/<Name> 也要進,但稍後 frontmatter / 路徑判 internal 排除)
    for (const f of readdirSync(full)) {
      const fp = join(full, f)
      if (statSync(fp).isDirectory()) {
        for (const f2 of readdirSync(fp)) if (f2.endsWith('.spec.md')) out.push({ kind, file: join(fp, f2), dirName: f })
      } else if (f.endsWith('.spec.md')) {
        out.push({ kind, file: fp, dirName: dir })
      }
    }
  }
  return out
}
const specFiles = [
  ...walkSpecs(join(SRC, 'components'), 'component'),
  ...walkSpecs(join(SRC, 'patterns'), 'pattern'),
]

// ── 2. parse frontmatter(robust:無 frontmatter / parse fail → 仍收錄,用 basename)──
function parseSpec({ kind, file, dirName }) {
  const raw = readFileSync(file, 'utf8')
  let fm = {}
  const m = raw.match(/^---\n([\s\S]*?)\n---/)
  const fmRaw = m ? m[1] : ''
  if (m) { try { fm = yaml.load(fmRaw) || {} } catch { fm = {} } }
  const name = fm.component || fm.pattern || dirName
  // internal 判定對齊 gen-design-system-barrel.mjs SSOT:frontmatter `- isInternal`(traits 列)/ `internal: true` / 路徑 Internal/
  const isInternal = /^\s*-\s*isInternal\s*$/m.test(fmRaw) || /^\s*internal:\s*true\s*$/m.test(fmRaw) ||
    fm.isInternal === true || /\/Internal\//.test(file)
  const obj = (v) => (v && typeof v === 'object' && Object.keys(v).length) ? v : null  // 空 {} 視同無
  return {
    kind, file, dirName, name, isInternal,
    family: fm.family != null ? String(fm.family) : null,
    variants: obj(fm.variants),
    sizes: obj(fm.sizes),
    bans: Array.isArray(fm['禁止事項']) && fm['禁止事項'].length ? fm['禁止事項'] : null,
  }
}
// dedup by name(同 dir 多 spec.md,如 DataTable 的 data-table + filter-operators 撞名)→ 留 frontmatter 最豐富者
const parsed = specFiles.map(parseSpec).filter((s) => !s.isInternal)  // internal 不入 public llms
const richness = (s) => (s.variants ? 1 : 0) + (s.sizes ? 1 : 0) + (s.family ? 1 : 0) + (s.bans ? 1 : 0)
const byName = new Map()
for (const s of parsed) {
  const cur = byName.get(s.name)
  if (!cur || richness(s) > richness(cur)) byName.set(s.name, s)
}
const specs = [...byName.values()].sort((a, b) => compareUtf8Bytes(a.name, b.name))

// ── 3. URL + source 路徑(deterministic,不讀 storybook index → generator 純 spec-frontmatter 驅動,
//        --check 任何順序/無 storybook 也能跑;rendered 看 Storybook、AI 讀 node_modules src 範例)──
const srcDir = (s) => `${s.kind === 'pattern' ? 'patterns' : 'components'}/${s.dirName}`
const urlFor = () => SB_BASE  // 統一連 Storybook 首頁(per-story slug 非 spec 可確定性導出,故不嵌)

// ── 4. 一行摘要(取 variants 名列 or family)──
function oneLiner(s) {
  const parts = []
  if (s.variants) parts.push(`variants:${Object.keys(s.variants).join('/')}`)
  if (s.sizes) parts.push(`sizes:${Object.keys(s.sizes).join('/')}`)
  if (parts.length) return (s.kind === 'pattern' ? 'Pattern。' : '') + parts.join(';')
  return s.kind === 'pattern' ? '跨元件 anatomy / 設計參照 pattern' : '見 Storybook / spec'
}

// ── 5. 組 llms.txt(index)──
const components = specs.filter((s) => s.kind === 'component')
const patterns = specs.filter((s) => s.kind === 'pattern')
const llms = [
  `# @qijenchen/design-system`,
  ``,
  `> World-class React design system(Radix/shadcn + Tailwind v4 + 自訂 design token)。`,
  `> ${components.length} components + ${patterns.length} public patterns + design tokens。v${version}。`,
  ``,
  `本檔由 source(spec.md frontmatter + Storybook index)build-time 自動生成,**禁手改**(CI --check drift gate 守)。`,
  `每元件 / pattern 的完整 variants / sizes / 禁止事項 全文見 [llms-full.txt](./llms-full.txt)。`,
  `元件原始範例 source:node_modules/@qijenchen/design-system/src/<dir>/*.stories.tsx;rendered:Storybook 連結。`,
  ``,
  `## Components`,
  ...components.map((s) => `- [${s.name}](${urlFor()}): ${oneLiner(s)} — src:${srcDir(s)}`),
  ``,
  `## Patterns`,
  ...patterns.map((s) => `- [${s.name}](${urlFor()}): ${oneLiner(s)} — src:${srcDir(s)}`),
  ``,
].join('\n')

// ── 6. 組 llms-full.txt(全文)──
function fullSection(s) {
  const lines = [`## ${s.name}${s.family ? `(family ${s.family})` : ''}`, ``, `Storybook: ${urlFor()}`, `Source(AI 讀此看官方範例): src/${srcDir(s)}/`, ``]
  if (s.variants) {
    lines.push(`### Variants`)
    for (const [name, v] of Object.entries(s.variants)) {
      const when = (v && typeof v === 'object' && v.when) ? String(v.when).replace(/\s+/g, ' ') : ''
      lines.push(`- **${name}**: ${when}`)
    }
    lines.push(``)
  }
  if (s.sizes) {
    lines.push(`### Sizes`)
    for (const [name, v] of Object.entries(s.sizes)) {
      const when = (v && typeof v === 'object' && v.when) ? String(v.when).replace(/\s+/g, ' ') : (typeof v === 'string' ? v : '')
      lines.push(`- **${name}**: ${when}`)
    }
    lines.push(``)
  }
  if (s.bans) {
    lines.push(`### 禁止事項(when NOT / anti-pattern)`)
    for (const b of s.bans) {
      if (b && typeof b === 'object') lines.push(`- ${b.rule || ''}${b.reason ? ` — ${b.reason}` : ''}`)
      else if (typeof b === 'string') lines.push(`- ${b}`)
    }
    lines.push(``)
  }
  return lines.join('\n')
}
const llmsFull = [
  `# @qijenchen/design-system — 完整設計參考(llms-full)`,
  ``,
  `> 全 component / pattern 的 variants / sizes / 禁止事項。build-time 從 spec.md frontmatter 生成,禁手改。v${version}。`,
  ``,
  `# Components`,
  ``,
  ...components.map(fullSection),
  `# Patterns`,
  ``,
  ...patterns.map(fullSection),
].join('\n')

// ── 7. write / --check ──
function emit(path, content) {
  if (CHECK) {
    if (!existsSync(path)) { console.error(`❌ DRIFT: ${basename(path)} 不存在。Run: node scripts/gen-llms-txt.mjs`); process.exit(1) }
    if (readFileSync(path, 'utf8') !== content) { console.error(`❌ DRIFT: ${basename(path)} 與 source 不同步。Run: node scripts/gen-llms-txt.mjs`); process.exit(1) }
    return
  }
  // idempotent:內容相同則不寫(避免 git churn)。內容含 version(deterministic),無隨機時戳。
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return
  writeFileSync(path, content)
}
emit(LLMS, llms)
emit(LLMS_FULL, llmsFull)
if (CHECK) console.log(`✓ llms.txt + llms-full.txt in sync(${components.length} components / ${patterns.length} patterns)`)
else console.log(`✓ llms.txt + llms-full.txt → ${components.length} components / ${patterns.length} patterns(v${version})`)

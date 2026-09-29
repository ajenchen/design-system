#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 隨 npm 出貨的 `packages/design-system/llms.txt` / `llms-full.txt`(package `files` + `exports` 的公開資產)
 *         永遠等於「從全部 component / pattern 的 spec.md frontmatter 重新生成」的結果 —— 不會出貨一份過期的設計參考。
 *   紅: `--check` 下任一檔不存在、或內容與重新生成的結果有一個位元組不同 → 印 DRIFT 指名檔案並 exit 1。
 *       歷史紅燈(2026-09-29 OE18 盤點時抓到):檔頭寫「Run:postbuild-storybook + ci.yml --check」但三處都沒接
 *       (「寫了閘卻沒人呼叫」,失敗記憶索引),提交的檔停在 beta.132、線上已到 beta.146。
 *   綠: 內容逐位元組相同;純檔案比對,無時序、無瀏覽器,重複跑恆等。對照組:`--selftest` 把任一輸出檔改一個字元
 *       → 必紅並指名該檔;還原後必綠。
 *
 * gen-llms-txt.mjs — 從 spec.md frontmatter 生成 llms.txt(精簡 index)+ llms-full.txt(全文,含 variants/sizes/禁止事項)。
 *
 * 對齊 llmstxt.org(H1 + blockquote summary + H2 file-list)+ Mantine「每 release 從 source
 * 自動生成、禁手維護」。隨 npm ship(files + exports),consumer / AI coding assistant 取用
 * `@qijenchen/design-system/llms.txt` 當設計參考 SSOT。
 *
 * Source = 已存在的結構化 canonical(spec.md frontmatter:component/pattern/family/variants.when/
 * sizes.when/禁止事項)。**禁手維護**;內容**不含版號**:這兩個檔只隨 npm 包出貨,包的版號就是它們的版號,
 * 再抄一份進檔裡等於同一個值兩個住所,而且每次 bump 都要重生(2026-09-29 之前就是這樣過期了 14 個版)。
 *
 * Run:`npm run build-storybook` 鏈尾自動重生(同 ds-story-manifest);ci.yml verify-static 跑 `--check`。
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
const SELFTEST = process.argv.includes('--selftest')

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
  `> ${components.length} components + ${patterns.length} public patterns + design tokens。版號 = 本 npm 包的 package.json version。`,
  ``,
  `本檔由 source(spec.md frontmatter)build-time 自動生成,**禁手改**(CI --check drift gate 守)。`,
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
  `> 全 component / pattern 的 variants / sizes / 禁止事項。build-time 從 spec.md frontmatter 生成,禁手改。版號 = 本 npm 包的 package.json version。`,
  ``,
  `# Components`,
  ``,
  ...components.map(fullSection),
  `# Patterns`,
  ``,
  ...patterns.map(fullSection),
].join('\n')

// ── 7. write / --check / --selftest ──
/** 純函式:已提交內容(null = 檔不存在)vs 重新生成的內容 → 漂移訊息或 null。呼叫端與 selftest 共用同一個判定。 */
export function driftOf(name, committed, generated) {
  if (committed === null) return `❌ DRIFT: ${name} 不存在。Run: node scripts/gen-llms-txt.mjs`
  if (committed !== generated) return `❌ DRIFT: ${name} 與 source 不同步。Run: node scripts/gen-llms-txt.mjs`
  return null
}

function emit(path, content) {
  const committed = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (CHECK) {
    const drift = driftOf(basename(path), committed, content)
    if (drift) { console.error(drift); process.exit(1) }
    return
  }
  // idempotent:內容相同則不寫(避免 git churn)。內容只由 spec frontmatter 決定,無版號、無隨機時戳。
  if (committed === content) return
  writeFileSync(path, content)
}

function selftest() {
  // 對照組(M32「儀器要先有對照組」):同內容必綠;缺檔必紅並指名;改一個字元必紅並指名。不碰真實檔案。
  const failures = []
  if (driftOf('llms.txt', llms, llms) !== null) failures.push('相同內容應綠')
  if (!/llms\.txt 不存在/.test(driftOf('llms.txt', null, llms) ?? '')) failures.push('缺檔應紅並指名 llms.txt')
  if (!/llms-full\.txt 與 source 不同步/.test(driftOf('llms-full.txt', llmsFull + 'x', llmsFull) ?? '')) failures.push('改一個字元應紅並指名 llms-full.txt')
  if (/\bv\d+\.\d+\.\d+/.test(llms) || /\bv\d+\.\d+\.\d+/.test(llmsFull)) failures.push('輸出不得含版號(版號住 package.json,再抄一份就是第二個住所)')
  if (failures.length) { console.error('❌ gen-llms-txt selftest FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
  console.log('✅ gen-llms-txt selftest PASS(同內容綠 / 缺檔紅 / 改一字元紅 / 無版號)')
}

if (SELFTEST) selftest()
else {
  emit(LLMS, llms)
  emit(LLMS_FULL, llmsFull)
  if (CHECK) console.log(`✓ llms.txt + llms-full.txt in sync(${components.length} components / ${patterns.length} patterns)`)
  else console.log(`✓ llms.txt + llms-full.txt → ${components.length} components / ${patterns.length} patterns`)
}

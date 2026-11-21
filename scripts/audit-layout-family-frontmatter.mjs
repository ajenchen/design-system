#!/usr/bin/env node
/**
 * audit-layout-family-frontmatter.mjs — Dim 16 deterministic backstop(2026-05-30)
 *
 * CLAUDE.md「每元件 spec 第一段必聲明 Layout Family」+ 4-Family Layout Model。Dim 16 原被誤分
 * PURE-JUDGMENT(可被 orchestrator 跳過),但「primary spec 有沒有 family: frontmatter」是純 grep。
 * 本 script 把它變 DETERMINISTIC backstop:primary component/pattern spec 缺 family → exit 1。
 *
 * Primary spec = basename 配 folder 名(eg. components/Button/button.spec.md)。sub-spec(field-controls /
 * form-validation 等非 primary)豁免。真要豁免 primary 用同檔 `<!-- @no-layout-family: <reason> -->`。
 *
 * Usage: node scripts/audit-layout-family-frontmatter.mjs [--check]
 *
 * @gate-contract
 *   保證: packages/design-system/src/{components,patterns}/<資料夾>/ 底下的主 spec(檔名 = 資料夾名或它的 kebab 寫法)
 *         都宣告了 Layout Family —— frontmatter `family:`,或內文「Layout Family」後 120 字內出現 self-contained / Family 1–4 / composite,
 *         或同檔明寫 `@no-layout-family:` 豁免
 *   紅: --check 下有任一份缺宣告 → 列出檔名並 exit 1;配對測試把 button.spec.md 換成沒有宣告的內容,本閘必須紅
 *   綠: 全部有宣告時 exit 0 並印出主 spec 數;只讀檔,不讀時間,重複跑結果相同
 */
import fs from 'node:fs'
import { globSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')
const specs = globSync('packages/design-system/src/{components,patterns}/*/*.spec.md', { cwd: ROOT })

const toKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

const missing = []
let primaryCount = 0
for (const rel of specs) {
  const folder = path.basename(path.dirname(rel)) // eg. Button / element-anatomy
  const base = path.basename(rel, '.spec.md') // eg. button / element-anatomy
  // primary spec = basename === kebab(folder)(component PascalCase folder)OR === folder(pattern kebab folder)
  const isPrimary = base === toKebab(folder) || base === folder
  if (!isPrimary) continue
  primaryCount++
  const c = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  if (/@no-layout-family:/.test(c)) continue // explicit exemption
  // family: 在 frontmatter OR 文中「Layout Family」聲明段
  if (!/^family:\s*\S/m.test(c) && !/Layout Family[^]{0,120}(self-contained|Family\s*[1-4]|composite)/i.test(c)) {
    missing.push(rel)
  }
}

console.log(`=== Dim 16 — Layout Family frontmatter ===`)
console.log(`primary specs: ${primaryCount} | missing family 宣告: ${missing.length}`)
if (missing.length) {
  console.error('\n⚠️  缺 Layout Family 宣告(加 `family: N` frontmatter,或 `<!-- @no-layout-family: 理由 -->`):')
  missing.forEach((m) => console.error(`  ${m}`))
}
console.log(missing.length ? '' : '\n✅ 全 primary spec 都有 Layout Family 宣告.')
if (CHECK && missing.length) process.exit(1)

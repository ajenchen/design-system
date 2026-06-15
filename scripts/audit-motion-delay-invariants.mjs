#!/usr/bin/env node
/**
 * Motion hover-delay invariants(2026-06-11,user verbatim「確保有SSOT且未來不會再偏移」)
 *
 * SSOT 鏈:tokens/motion/motion.spec.md(canonical)→ motion.css(CSS 值)→ motion.ts(JS mirror)
 * → consumer(tooltip / hover-card / avatar / overflow-indicator)。
 *
 * 歷史 drift(本 script 的存在理由):
 *   - hover-card.tsx 裸 re-export Radix Root(close 300 ≠ canonical 200),spec 宣稱有預設 = 假
 *   - overflow-indicator.tsx 2026-05-18 token 遷移把 hardcode 200/300 誤挑 rich(spec 表明文 plain)
 *
 * R1 production code 禁 numeric literal delay(必走 HOVER_DELAY_*_MS;escape: @motion-delay-allow)
 * R2 tier freeze:已 codify 的 consumer tier 凍結(改 tier = 必先改 motion.spec 對照表 + 本表,diff 可見)
 * R3 cross-home 同值:motion.ts(JS)與 motion.css(CSS)三值必一致
 *
 * Exit 1 on violation(release:preflight gate)。
 */
import { readFileSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DS = join(ROOT, 'packages/design-system/src')
const fails = []

// ── R1:production tsx/ts 禁 numeric literal delay ──
const prodFiles = globSync('**/*.{tsx,ts}', { cwd: DS })
  .filter((p) => !/stories|test|spec/.test(p))
  .map((p) => join(DS, p))
for (const f of prodFiles) {
  const src = readFileSync(f, 'utf-8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return // 註解不是 code
    if (/(openDelay|closeDelay|delayDuration)\s*[=:]\s*\{?\s*\d+/.test(line)) {
      const prev = lines[i - 1] ?? ''
      if (line.includes('@motion-delay-allow') || prev.includes('@motion-delay-allow')) return
      fails.push(`R1 ${f.replace(ROOT + '/', '')}:${i + 1} — numeric literal delay(必走 HOVER_DELAY_*_MS token;escape: @motion-delay-allow: <理由>)`)
    }
  })
}

// ── R2:tier freeze(consumer → 必含的 token 引用;改 tier 必先動 motion.spec 對照表 + 本表)──
const TIER_FREEZE = [
  ['components/Tooltip/tooltip.tsx', ['delayDuration = HOVER_DELAY_PLAIN_MS']],
  ['components/HoverCard/hover-card.tsx', ['openDelay = HOVER_DELAY_RICH_MS', 'closeDelay = HOVER_DELAY_CLOSE_MS']],
  ['components/Avatar/avatar.tsx', ['openDelay={HOVER_DELAY_RICH_MS}', 'closeDelay={HOVER_DELAY_CLOSE_MS}']],
  ['components/OverflowIndicator/overflow-indicator.tsx', ['openDelay={HOVER_DELAY_PLAIN_MS}', 'closeDelay={HOVER_DELAY_CLOSE_MS}']],
]
for (const [rel, needles] of TIER_FREEZE) {
  const src = readFileSync(join(DS, rel), 'utf-8')
  for (const n of needles) {
    if (!src.includes(n)) fails.push(`R2 ${rel} — tier freeze 斷言失敗:找不到「${n}」(若是有意改 tier,先改 motion.spec.md 對照表,再同步本 script TIER_FREEZE)`)
  }
}

// ── R3:JS mirror 與 CSS 同值 ──
const ts = readFileSync(join(DS, 'tokens/motion/motion.ts'), 'utf-8')
const css = readFileSync(join(DS, 'tokens/motion/motion.css'), 'utf-8')
const pairs = [
  ['HOVER_DELAY_PLAIN_MS', '--hover-delay-plain'],
  ['HOVER_DELAY_RICH_MS', '--hover-delay-rich'],
  ['HOVER_DELAY_CLOSE_MS', '--hover-delay-close'],
]
for (const [jsName, cssName] of pairs) {
  const jsVal = ts.match(new RegExp(`${jsName}\\s*=\\s*(\\d+)`))?.[1]
  const cssVal = css.match(new RegExp(`${cssName.replace(/[-]/g, '\\-')}:\\s*(\\d+)ms`))?.[1]
  if (!jsVal || !cssVal || jsVal !== cssVal) {
    fails.push(`R3 ${jsName}(${jsVal})≠ ${cssName}(${cssVal})— JS mirror 與 CSS 必同值`)
  }
}

if (fails.length) {
  console.error(`\n❌ Motion hover-delay invariants:${fails.length} violation(s)`)
  for (const f of fails) console.error('  ' + f)
  console.error('\nSSOT:tokens/motion/motion.spec.md「適用對照表」;修法見各行指引。')
  process.exit(1)
}
console.log('✅ Motion hover-delay invariants:R1 無 literal / R2 tier freeze 4 consumer PASS / R3 JS-CSS 同值')

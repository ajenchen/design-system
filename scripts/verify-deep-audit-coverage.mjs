#!/usr/bin/env node
// verify-deep-audit-coverage.mjs — 機械閘:deep audit「完成」前必證 91 dim 每個都有證據(Claude + codex 雙軌)。
//
// 為何存在(2026-07-12 user verbatim「不抽樣不偷懶不是老早就跟你講過了…現在和未來可以確保嗎」):
//   deep-audit-cross-codex 有 91-dim SSOT + 反抽樣契約,但**無 gate 擋「宣稱完成卻漏跑 dim」**。
//   AI 自律不可靠(本 session 實證漏跑 deterministic 24 + judgment 27 + hook 40)。此 gate = 唯一可靠保證:
//   宣稱「deep audit / Phase A 完成」前必跑本 script,任何 dim 缺證據 → exit 1 BLOCK,機械上偷懶不了。
//
// 證據定義(per tier,SSOT = scripts/audit-coverage-matrix.mjs):
//   DETERMINISTIC(24):`.claude/logs/dim-audit/_deterministic-results.txt` 含「dim <N>:」跑過行 + exit 記錄。
//   PURE-JUDGMENT(27):Claude = `.claude/logs/dim-audit/dim-<N>.json`;codex = `.claude/logs/codex-dim-audit/dim-<N>.json`。**雙軌都要**。
//   HOOK-ENFORCED(40):`.claude/logs/dim-audit/_hook-residue-verified.json` 列出已驗 residue 的 dim。
//
// 用法:node scripts/verify-deep-audit-coverage.mjs [--json]
//   exit 0 = 91 dim 全有證據(Claude+codex 雙軌完整);exit 1 = 有 gap(印缺哪些)。

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const L = (p) => join(ROOT, '.claude/logs', p)
const JSON_OUT = process.argv.includes('--json')

// tier map from SSOT (audit-coverage-matrix.mjs)
const src = readFileSync(join(ROOT, 'scripts/audit-coverage-matrix.mjs'), 'utf8')
const tiers = {}
for (const m of src.matchAll(/(\d+):\s*\{\s*tier:\s*'([^']+)'/g)) tiers[+m[1]] = m[2]
const DET = Object.keys(tiers).filter((n) => tiers[n] === 'DETERMINISTIC').map(Number)
const PJ = Object.keys(tiers).filter((n) => tiers[n] === 'PURE-JUDGMENT').map(Number)
const HOOK = Object.keys(tiers).filter((n) => tiers[n] === 'HOOK-ENFORCED').map(Number)

// evidence readers
const detLog = existsSync(L('dim-audit/_deterministic-results.txt')) ? readFileSync(L('dim-audit/_deterministic-results.txt'), 'utf8') : ''
// 「ran」= 有 dim 行 AND 該行下方結果非 node-crash(Cannot find module / SyntaxError = 我的 runner bug,非真跑,不可信 2026-07-12)
const detRan = (n) => {
  const m = detLog.match(new RegExp(`── dim ${n}(b|:| )[^\\n]*\\n[^\\n]*`))
  if (!m) return false
  return !/Cannot find module|SyntaxError|ReferenceError|is not a function/.test(m[0])
}
const claudeJudged = (n) => existsSync(L(`dim-audit/dim-${n}.json`))
const codexJudged = (n) => existsSync(L(`codex-dim-audit/dim-${n}.json`))
// hook residue evidence: per-dim file .claude/logs/hook-residue/dim-<N>.json(verified: true)
const hookVerifiedDim = (n) => existsSync(L(`hook-residue/dim-${n}.json`))

// A.1b dual-model per-component tracks(2026-07-12 user「所有 timeout 都要重跑完整」— Phase B / Claude-deep 也 gate,
// 不只 91 dim。timeout→無 genuine json→gap→gate 擋 done,任何 track 的 timeout 都無法被靜默當完成)
const COMPONENTS = readdirSync(join(ROOT, 'packages/design-system/src/components')).filter((c) => !c.includes('.'))
const PRIOR_A1B = new Set(['Tooltip', 'HoverCard', 'Popover', 'Accordion', 'Alert', 'AppShell']) // 前期 codex batch,不在 codex-phaseB dir
const claudeA1bGap = COMPONENTS.filter((c) => !existsSync(L(`claude-a1b-deep/${c}.json`)))
const codexA1bGap = COMPONENTS.filter((c) => !existsSync(L(`codex-phaseB/${c}.json`)) && !PRIOR_A1B.has(c))

const gaps = { deterministic: [], judgmentClaude: [], judgmentCodex: [], hookResidue: [], claudeA1b: claudeA1bGap, codexA1b: codexA1bGap }
for (const n of DET) if (!detRan(n)) gaps.deterministic.push(n)
for (const n of PJ) { if (!claudeJudged(n)) gaps.judgmentClaude.push(n); if (!codexJudged(n)) gaps.judgmentCodex.push(n) }
for (const n of HOOK) if (!hookVerifiedDim(n)) gaps.hookResidue.push(n)

const totalGaps = gaps.deterministic.length + gaps.judgmentClaude.length + gaps.judgmentCodex.length + gaps.hookResidue.length + gaps.claudeA1b.length + gaps.codexA1b.length

if (JSON_OUT) { console.log(JSON.stringify({ tiers: { DET: DET.length, PJ: PJ.length, HOOK: HOOK.length }, gaps, totalGaps }, null, 1)); process.exit(totalGaps ? 1 : 0) }

console.log('═══ Deep-Audit Coverage Ledger(91 dim × Claude+codex 雙軌)═══')
console.log(`DETERMINISTIC(${DET.length}): ran ${DET.length - gaps.deterministic.length}/${DET.length}` + (gaps.deterministic.length ? `  ❌ 缺跑: ${gaps.deterministic.join(',')}` : '  ✅'))
console.log(`PURE-JUDGMENT Claude(${PJ.length}): ${PJ.length - gaps.judgmentClaude.length}/${PJ.length}` + (gaps.judgmentClaude.length ? `  ❌ 缺: ${gaps.judgmentClaude.join(',')}` : '  ✅'))
console.log(`PURE-JUDGMENT codex(${PJ.length}): ${PJ.length - gaps.judgmentCodex.length}/${PJ.length}` + (gaps.judgmentCodex.length ? `  ❌ 缺: ${gaps.judgmentCodex.join(',')}` : '  ✅'))
console.log(`HOOK-ENFORCED residue-verify(${HOOK.length}): ${HOOK.length - gaps.hookResidue.length}/${HOOK.length}` + (gaps.hookResidue.length ? `  ❌ 缺: ${gaps.hookResidue.join(',')}` : '  ✅'))
console.log(`A.1b Claude-deep(${COMPONENTS.length} 元件): ${COMPONENTS.length - gaps.claudeA1b.length}/${COMPONENTS.length}` + (gaps.claudeA1b.length ? `  ❌ 缺: ${gaps.claudeA1b.join(',')}` : '  ✅'))
console.log(`A.1b codex Phase B(${COMPONENTS.length} 元件): ${COMPONENTS.length - gaps.codexA1b.length}/${COMPONENTS.length}` + (gaps.codexA1b.length ? `  ❌ 缺: ${gaps.codexA1b.join(',')}` : '  ✅'))
console.log('───────────────────────────────────────────')
if (totalGaps) {
  console.log(`❌ ${totalGaps} 個 dim-證據缺口 → deep audit **未完成**,禁宣稱 done。填完所有缺口才可宣稱。`)
  process.exit(1)
}
console.log('✅ 91 dim × 雙軌全有證據 — deep audit 覆蓋完整,可宣稱 done。')
process.exit(0)

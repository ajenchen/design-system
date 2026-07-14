#!/usr/bin/env node
/**
 * run-codex-judgment-dims.mjs — codex 獨立跑全 27 PURE-JUDGMENT audit dim(2026-07-12 user「獨立全跑 27 dim 最嚴格」)。
 *
 * 為何:deep-audit Phase B codex 只做了 claim-vs-code(A.1b),27 個判準維度一個沒跑(ledger codex 欄 0/27)。
 *   本 driver 讓 codex 對每個判準 dim DS-wide 獨立稽核(= Claude 27-agent Workflow 的 codex 版),
 *   findings 落 .claude/logs/codex-dim-audit/dim-<N>.json → verify-deep-audit-coverage.mjs 的 codex 欄補滿。
 *   順序跑、最強推理、40-min/dim、quota-halt exit 3(給 autoresume wrapper 穿越重置)、resumable。
 */
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, '.claude/logs/codex-dim-audit')
mkdirSync(OUT, { recursive: true })
const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); try { writeFileSync(join(OUT, '_driver.log'), line + '\n', { flag: 'a' }) } catch {} }

// 27 PURE-JUDGMENT dims + mechanism(SSOT = audit-coverage-matrix.mjs;與 Claude Workflow 同一份)
const DIMS = [
  { n: 6, title: 'Spec Rule A 文字品質', mech: 'Spec 文字品質 AI judgment;DS-wide 全 82 spec.md,禁 sample;抓描述視覺形狀/實作細節、術語不一致、禁止事項不全' },
  { n: 7, title: 'Spec Rule B 邊界案例', mech: '每 spec 過 7-dim 邊界覆蓋(空值/驗證/loading/a11y/近親分界/常見誤解/links);DS-wide 全 spec.md' },
  { n: 8, title: '7-維度 對標覆蓋', mech: '每 spec 7-維對標(Polaris/Material/Ant/Atlassian/Carbon/Apple HIG):何時用/不用/近親/誤解/links/空值/驗證;DS-wide' },
  { n: 9, title: 'shadcn passthrough 完整度', mech: 'DS-wide 全掃 components/*.tsx 驗 forwardRef/displayName/asChild/...props/data-state 齊全' },
  { n: 10, title: 'a11y 基本覆蓋', mech: 'DS-wide 全 components grep aria-label/role/keyboard coverage;icon-only 必 aria-label' },
  { n: 12, title: 'Story 人話範例', mech: 'DS-wide 全 stories 過 placeholder/jargon test — 範例是否真實業務場景' },
  { n: 14, title: '命名一致性', mech: '語義命名 DS-wide:hook naming/章名中文/identifier 語言一致/跨元件詞彙衝突' },
  { n: 17, title: 'Prop value 跨元件認知衝突', mech: 'grep prop literal DS-wide;同字串在不同元件是否有衝突語義(如 variant="text")' },
  { n: 19, title: 'Home-name-vs-scope 一致性', mech: 'DS-wide enumerate folder/檔名 vs 實際 scope 是否一致' },
  { n: 20, title: 'Spec 硬寫機械化值檢查', mech: 'grep DS-wide spec.md 找硬寫 px/hex/Tailwind class lists — 該引 token 卻硬寫' },
  { n: 22, title: '視覺容器 inner breathing', mech: 'DS-wide 全掃有邊界容器(card/panel/overlay)是否缺 inner padding' },
  { n: 24, title: 'Story 範例重複性', mech: 'per-component DS-wide 列 stories scenario matrix — 重複/冗餘 story' },
  { n: 25, title: 'Story 必要性 grounding', mech: 'per-component 全掃 過 2-test(spec-tied/removal-degrade)— 每 story 有存在理由' },
  { n: 26, title: 'Controlled/Uncontrolled dual-mode', mech: 'DS-wide form-like+overlay-like enumerate dual-mode pair — 兩模式行為一致' },
  { n: 28, title: 'Manual story 拆分原則', mech: 'per-component grep stories.tsx WithStartIcon/WithEndIcon 拆分 anti-pattern' },
  { n: 32, title: 'Filter operator registry SSOT', mech: 'grep consumer hardcode filter op string DS-wide — 該消費 registry 卻硬寫' },
  { n: 33, title: 'Component classification + abstraction', mech: '5 sub-dims per-component 全掃:分類/抽象層級/prop-vs-separate-component 紀律' },
  { n: 38, title: 'Inline-action gap canonical', mech: 'grep ItemInlineAction sibling gap DS-wide — inline action 間距對齊 canonical' },
  { n: 43, title: 'Rule note 品質', mech: 'DS-wide 全 principles.stories rule notes per-component 讀 — note 品質/正確/人話' },
  { n: 44, title: 'Public vs Internal classification', mech: 'intent-based(是否想讓 consumer 直接 import);enumerate ALL Internal folder + components,per row 判(讀 .claude/rules/ui-development.md Public-vs-Internal 段)' },
  { n: 46, title: 'Manual vs Mechanical boundary', mech: 'grep DS-wide stories trait-derived 手寫 exports — 該機械生成卻手寫' },
  { n: 55, title: 'Token cross-namespace mapping integrity', mech: 'DS-wide 全掃 semantic.css 12-hue mapping 逐 hue 驗 →primitive step 正確' },
  { n: 62, title: 'Fork-user Netlify onboarding canonical', mech: 'DS-wide enumerate netlify.toml/manager-head/setup-netlify/CLAUDE.md Access-control 段完整' },
  { n: 66, title: 'Immediate cross-repo dispatch + visual parity', mech: 'DS-wide enumerate release.yml dispatch step + sync workflow + visual-assertions coverage manifest' },
  { n: 68, title: 'Stories-vs-spec canonical drift', mech: 'DS-wide 全 stories/anatomy/principles grep anti-spec pattern — story 示範違反自家 spec' },
  { n: 72, title: 'DS API surface tightening', mech: 'per-component review;DS-wide enumerate ALL component API surface — 過寬 API 該收' },
  { n: 90, title: 'Layout-space macro 合規 sweep', mech: 'LLM layout-space macro DS-wide NO-SAMPLE;判準 layoutSpace.spec.md 該用 token vs 刻意固定 邊界段;每 finding 對抗二次驗證(只抓 macro 結構違規,禁 flag 合法 magic number)' },
]

const remaining = DIMS.filter((d) => !existsSync(join(OUT, `dim-${d.n}.json`)))
log(`codex judgment driver start — ${remaining.length}/${DIMS.length} dims remaining, MAX reasoning, 60-min/dim, sequential`)

// timeout 後 spawnSync 只殺 guard,codex 孫程序脫離變 ppid=1 孤兒空燒(2026-07-12 dim 25 反覆) → 每 dim 後主動 sweep
function killCodexOrphans() {
  try {
    const ps = execSync('ps -o pid,ppid,command -ax', { encoding: 'utf8' })
    for (const line of ps.split('\n')) {
      const m = line.match(/^\s*(\d+)\s+1\s+.*(vendor\/aarch64-apple-darwin\/bin\/codex|codex exec)/)
      if (m) { try { process.kill(+m[1], 'SIGKILL'); log(`  🧹 killed orphan codex pid ${m[1]}`) } catch {} }
    }
  } catch {}
}
killCodexOrphans()

function brief(d) {
  return `# Codex 判準維度稽核 — dim ${d.n}:${d.title}

你是「另一個 Claude Code」,跑設計系統 deep-audit 的**單一判準維度**,只跑這個 dim,DS-wide,**NO-SAMPLE**(user verbatim「所有稽核都要完整執行不要再抽樣」)。判準 SSOT = .claude/skills/design-system-audit/references/audit-prompts.md 對應 dim + 下方 mech。

## ⚠️ 輸出紀律(防 echo 全檔燒 turn)
- **禁把讀到的檔案內容貼進輸出**(禁 echo source / 禁 cat 整檔)。靜默讀,只輸出 findings。
- **禁列檔**:禁 rg --files / find 全 repo;直接出 verdict。
- 只回一段 JSON:{"dim":${d.n},"filesScanned":N,"findings":[{"fileLine":"...","問題":"...","severity":"material|marginal","建議":"..."}]}。

## 判準 context(讀為判準,禁 echo)
先快速消費 CLAUDE.md + .claude/rules/meta-patterns.md(M23/M29/M32)+ .claude/rules/ui-development.md + .claude/references/naming-conventions.md 作為判準。

## Dim ${d.n} 稽核機制(NO-SAMPLE 全掃)
${d.mech}

## 規則
- **禁抽樣**:此 dim 涵蓋的全部單元(全 82 spec.md / 全 64 components / 全 stories,視 mech)都要掃到,禁只看 top N。
- 每 finding:cite file:line + 具體問題 + severity(material/marginal)+ 中文人話建議。
- triple-verify 殺假陽性:合法 magic number / documented exception / 合理設計 = 不報。
- 0 finding 合理(該 dim 乾淨),誠實回報,禁湊數。`
}

function runDim(d) {
  const briefPath = `/tmp/codex-dim-${d.n}.md`
  const outPath = `/tmp/codex-dim-${d.n}-out.txt`
  writeFileSync(briefPath, brief(d))
  // 60-min:heavy DS-wide judgment dim(a11y 全 64 元件 / prop-value DS-wide / story-necessity 全掃)40-min 不夠(2026-07-12 dim 10/17/25 timeout)
  const r = spawnSync('node', ['scripts/codex-run-guarded.mjs', '--brief', briefPath, '--out', outPath, '--log', `${outPath}.log`], { cwd: ROOT, encoding: 'utf8', timeout: 60 * 60 * 1000 })
  const outcome = (r.stdout || '') + (r.stderr || '')
  if (/CODEX-OUTCOME:\s*QUOTA/i.test(outcome)) {
    log(`  🛑 QUOTA on dim ${d.n} — HALT`)
    writeFileSync(join(OUT, '_QUOTA_HALT.json'), JSON.stringify({ ts: new Date().toISOString(), haltedAt: `dim-${d.n}`, outcome: outcome.slice(0, 400) }, null, 1))
    process.exit(3)
  }
  if (r.status !== 0) { log(`  ⚠ dim ${d.n} guard exit=${r.status}`); return null }
  const txt = existsSync(outPath) ? readFileSync(outPath, 'utf8') : ''
  const m = txt.match(/\{[\s\S]*"dim"[\s\S]*"findings"[\s\S]*\]\s*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch { return { dim: d.n, _rawUnparsed: m[0].slice(0, 4000) } } }
  return null
}

for (const d of remaining) {
  log(`── dim ${d.n}: ${d.title}`)
  const res = runDim(d)
  if (res) { writeFileSync(join(OUT, `dim-${d.n}.json`), JSON.stringify(res, null, 1)); log(`  ✓ dim ${d.n}: ${(res.findings || []).length} findings`) }
  else { writeFileSync(join(OUT, `dim-${d.n}.SKIP.json`), JSON.stringify({ dim: d.n, skipped: true }, null, 1)); log(`  ✗ dim ${d.n}: EMPTY/unparseable — SKIP`) }
  killCodexOrphans()  // timeout 後清孤兒,防空燒
}
log(`✅ codex judgment driver DONE`)

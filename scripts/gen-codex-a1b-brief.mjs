#!/usr/bin/env node
/**
 * gen-codex-a1b-brief.mjs — 產生 codex A.1b tight brief(過 check_codex_brief_invariants 7-invariant 閘)
 *
 * 用法:node scripts/gen-codex-a1b-brief.mjs Tooltip HoverCard Popover > /tmp/brief.md
 *   (component dir 名,逗號或空白分隔)。每 brief 建議 1-3 元件(>3 易 EMPTY,codex echo 燒 turn)。
 *
 * 為何要 generator:62 元件 marathon 手寫 brief 不可行 + 易漏 invariant。此 script 保證每 brief:
 *   1️⃣全盤閱讀 2️⃣triple-verify 3️⃣禁抽樣 4️⃣禁列檔 5️⃣輸入對等(meta-patterns+MEMORY.md)
 *   6️⃣判準對等(audit-prompts) 7️⃣A.1b — 且帶「禁 echo 全檔」紀律(防 EMPTY 死局)。
 */
import fs from 'node:fs'
import path from 'node:path'

const DS = 'packages/design-system/src/components'
const comps = process.argv.slice(2).flatMap((a) => a.split(/[,\s]+/)).filter(Boolean)
if (!comps.length) { console.error('need component dir names, e.g. Tooltip HoverCard'); process.exit(2) }
if (comps.length > 3) console.error(`⚠️ ${comps.length} 元件 > 3,codex 易 EMPTY;建議拆批`)

const fileList = comps.map((c, i) => {
  const dir = path.join(DS, c)
  if (!fs.existsSync(dir)) { console.error(`⚠️ ${dir} 不存在`); return null }
  const files = fs.readdirSync(dir)
  const pick = (re) => files.filter((f) => re.test(f)).map((f) => path.join(dir, f))
  const tsx = pick(/\.tsx$/).filter((f) => !/\.stories\.|\.test\./.test(f))
  const spec = pick(/\.spec\.md$/)
  const anat = pick(/\.anatomy\.stories\.tsx$/)
  const prin = pick(/\.principles\.stories\.tsx$/)
  const main = pick(/\.stories\.tsx$/).filter((f) => !/\.(anatomy|principles)\.stories\.tsx$/.test(f))
  return { c, lines: [
    `${i + 1}. **${c}** — code: ${tsx.join(', ') || '(無)'}`,
    `   spec: ${spec.join(', ') || '(無)'}`,
    `   宣稱來源(全 stories,無抽樣): ${[...anat, ...prin, ...main].join(', ') || '(無 stories)'}`,
  ].join('\n') }
}).filter(Boolean)

const wrapped = comps.map((c) => `${c}`).join(' / ')

process.stdout.write(`# Codex A.1b — ${wrapped} claim-vs-code 對抗驗證

你是「另一個 Claude Code」,做一模一樣的稽核,只差模型。**任務/判準 SSOT** = \`.claude/skills/deep-audit-cross-codex/SKILL.md\` A.1b 段 + \`.claude/skills/design-system-audit/references/audit-prompts.md\` rubric,逐字遵循。

## ⚠️ 輸出紀律(關鍵 — 防 echo 全檔燒光 turn)
- **禁把讀到的檔案內容貼進輸出**(禁 echo source / 禁 cat 整檔)。靜默讀,只輸出 findings。
- **禁列檔**:禁 \`rg --files\` / 禁 \`find\` 全 repo;只讀下方明列檔,直接出 verdict,不報探索過程。
- 每元件只回一段 JSON:\`{component, claimsVerified:N, falseClaims:[{fileLine, 宣稱, 真實code行為}]}\` + 一行總結。

## 判準 context(輸入對等 — 讀為判準,不 echo;鏡射 Claude A.0)
先快速消費作為「判準/命名/紀律」context(讀,禁 echo,禁逐條複述):
- \`CLAUDE.md\` + \`.claude/rules/meta-patterns.md\`(31 M-rules,尤其 M23/M29/M32)+ \`.claude/rules/self-verify.md\`
- \`.claude/references/naming-conventions.md\` + memory \`MEMORY.md\` index(專案脈絡)
這套 = 你的判準,與 Claude 一致。

## 全盤閱讀(本批元件,禁憑記憶、禁抽樣 NO-SAMPLE)
只深讀這些檔(全文,但不 echo):
${fileList.map((f) => f.lines).join('\n')}
+ 對照各元件 wrap 的 lib(Radix / cmdk / react-day-picker / sonner 等)真實行為。

## A.1b 對抗驗證(triple-verify + 判準對等 + 禁抽樣)
對**每個**元件的 spec/anatomy/principles/docblock **每一句宣稱**逐句比對真實 code(**NO-SAMPLE 全查**):
鍵盤 map / ARIA role / **focus 行為(是否宣稱 focus trap?— 常見 FALSE_CLAIM 熱點)** / prop 存在性 / 預設值 / native-vs-custom / token。
每條發現前 triple-verify:grep 確認 + Read code 確認 + 對照 audit-prompts rubric。宣稱與 code 一致 = 不報(禁無病呻吟)。
輸出每元件 falseClaims(cite file:line + 宣稱原文 + 真實 code 行為);全對則 \`falseClaims:[]\` + 說明。
`)

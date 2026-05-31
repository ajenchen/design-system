---
name: Propose discipline (2-in-1 consolidated 2026-05-28) — 中文人話 + file:line cite
description: User 決策 propose 必過 2 規則:(1) 用中文具體人話講(發生什麼/影響/選項 outcome)禁 jargon(2) 含「規定/必配/canonical 寫」claim 必附 file:line cite,沒 cite = 瞎掰自動撤回
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# Propose Discipline — 2 rules consolidated

User 2026-05-15 + 2026-05-27 系列 directives codified per Rule-of-3 absorb principle.
原 2 file(`feedback_propose_in_plain_chinese.md` + `feedback_propose_without_cite_fabrication_2026_05_27.md`)合併本檔。

## Sub-rule 1 — 中文人話(原 propose_in_plain_chinese;2026-05-31 擴大至所有 reply)

**Rule**:propose 給 user 拍板的決策必用中文具體人話講,禁術語 jargon。**2026-05-31 擴大**:不只 propose —— **所有給 user 的 reply / 清單 / summary** 都必繁中人話。User 看不懂英文,整段/整句英文 = reply 對 user 無效 = 白做。唯一例外:不可避免的識別碼(檔名 / token 名 / commit hash / 指令)出現時必緊跟中文解釋。工具輸出(CI log / git output)要引用 → 摘成中文重點,禁貼原始英文 dump。

**Anchor(2026-05-31)**:user verbatim「你他媽問題後面一長串英文是怎樣?我看不懂英文」。

**Format**:
```
### 決策 N:<一句話標題,zero jargon>

**現況**:<目前 code/spec 行為,人話>
**影響**:<不改會怎樣 / 改了會怎樣,具體>
**選項**:
- A. <做法 1>(後果:...)
- B. <做法 2>(後果:...)
- C. <不動>(後果:...)
**我推**:<A / B / C> 因 <理由>
```

**禁止**:`L1-L7` / `canonical` / `primitive` / `SSOT` / `M-rule` / `cva` 等內部術語 propose 內裸用。改翻成人話:
- canonical → 「主檔/標準寫法」
- primitive → 「共用零件」
- SSOT → 「單一資料源」
- spec → 「規格檔」

**Anchor**:2026-05-15 user verbatim「要 user 決策必中文具體人話講(發生什麼/影響/選項 outcome)」。

**Mechanical enforcement**:`.claude/hooks/check_propose_plain_chinese.sh` PreToolUse Edit/Write 偵測 propose pattern + jargon keyword → BLOCKER。

## Sub-rule 2 — file:line cite(原 propose_without_cite_fabrication)

**Rule**:propose 含 claim「規定 / 必配 / canonical 寫 / spec 說 / 文件規定」必附 inline file:line cite。沒 cite = 視為瞎掰,自動撤回。

**Format**:
```
**現況 + cite**:per `<file path>:<line>` 「<verbatim quote>」 → <implication>
```

**禁止**:
- 「DS canonical 規定 X」 沒 cite
- 「spec 寫 Y」沒 cite
- 「per 規範 Z」沒 cite

**Anchor**:2026-05-27 user verbatim「誰跟你說的?」— 我曾 cite「caption + muted SSOT 規定」但 grep `semantic.css:49` 是 use-case 描述非 rule。建議 propose 全 retract。

**Mechanical enforcement**:`.claude/hooks/check_propose_cite_required.sh` PreToolUse Edit/Write 偵測 propose pattern + canonical claim 但無 file:line cite → BLOCKER。

## How to apply

每次 propose / 列 option 前 inline 跑 4-test(per M18 Q0):
1. **plain Chinese** ✓ — 0 jargon?
2. **cite present** ✓ — 「規定/必配」claim 有 file:line?
3. **option matrix** ✓ — A/B/C + outcome?
4. **我推 reason** ✓ — 推薦 + 理由?

任一 NO → 自動撤回,不送 user。

## Anti-pattern(永久 ban)

- ❌ Propose 用 jargon(canonical / SSOT / primitive 等)裸用
- ❌「DS 規定 X」「spec 寫 Y」沒 file:line cite
- ❌ 列 N options 無 outcome 描述
- ❌ 沒「我推」推薦 + 理由
- ❌「per memory」「per 規範」當 cite(memory 不是 SSOT,需指向 spec.md / code)

## 對齊原則

- M18 Q0 propose 前 6-題自檢(本 rule 是 Q0「人話」+ Q1「cite」具體化)
- M22 benchmark cite mandate
- mindset #1 不取巧:propose 用 jargon = 取巧;沒 cite = 取巧
- Linux kernel patch:每 claim cite source / Atlassian RFC discipline

# Codex DISCUSS-ONLY Brief Template

Brief format invariant(2026-05-07 user 拍板,禁短 format)。
**禁**:Brief ≤ 220 字 / Reply ≤ 200 字 / 「結論→原因→下一步」3-line / 為 cloud 速度 truncate。
**強制**:不限字 + Q1-QN multi-question + ≥3 world-class source cite per Q + counter-proposal request。

```markdown
@codex DISCUSS-ONLY (no commit) — <topic>

## User 原話(verbatim,Step 0.05)
<不 paraphrase / 標點 / 圖文 ref 全保>

## 請獨立解讀 user 原話(Step 0.05)
<不被下面 Claude 框架限制,自己解讀>

## Claude 理解 + own-version v1(Step 0.5)
<paraphrase + file:line + 已驗 source + hypothesis + 不確定點>
**我 v1 = X 因為 Y**(Step 0.6:禁只列 options 求 codex pick)

## Benchmark Cited (M22/M26, ≥3)
- <DS source 1 + URL/path>
- <DS source 2 + URL/path>
- <DS source 3 + URL/path>

## DS Internal Canonical Consulted (M23)
- <既有 token / variant / spec.md path>

## Specific Questions for Codex(Q1-QN)
1. <root cause 對嗎?還有 alternative?>
2. <benchmark 是否漏掉 world-class case?>
N. <SSOT 是否該抽到更上層 primitive?>

## Constraints
- DS 原則 M1-M32 全適用(31 active;M27/M33/M34/M35 retired,折入 M20/M7/M23(c)(d);尤其 M8 / M17 / M22 / M23)
- 不可 commit,純文字討論
- 程式碼建議須 cite world-class DS source
- Counter-proposal request:挑戰我的 hypothesis,提第 4 條路
- 必產 3-column cite table(claim / path:line / reasoning)

## 🚨 七 invariant — 2026-05-23 user 永久 directive + 2026-07-10「任務/資訊/判準對等」directive(缺一 = brief 不合格,hook check_codex_brief_invariants.sh BLOCK)
1. **全盤閱讀全部 source**(CLAUDE.md / 31 active M-rules / 5 rules/*.md / 91 audit dims SKILL.md / 全部 spec.md / 全部 stories / 全部 components / tokens / patterns / hooks / 全部 memory files / planning),**禁憑記憶**(spec/story/component/memory 數量隨時變動,故不硬編數字 — 一律「全部」;M-rule / audit-dim 數由 sync-governance-counters 機械守住)
2. **Triple-verify per finding**:(a) grep DS-wide 確認 pattern 存在 (b) Read 對應 spec.md / tsx 確認 problem 真存在 (c) 對照既有 canonical 確認非 documented exception。任一 NO → 自動撤回,**禁無病呻吟**
3. **禁抽樣** — DS-wide ALL files 全掃,context 不夠拆 stage 全跑完;sub-agent admission「I sampled / spot-check / representative」= audit incomplete reject
4. **禁列檔** — 禁 `rg --files` / 禁 find 全 repo 列檔燒 reasoning(2026-05-27 codex 2× token-burn anchor);只讀 brief 列的 file(targeted rg / Read),不需報告探索過程,直接出 verdict
5. **輸入對等**(2026-07-10「codex 擁有的資訊要跟 Claude 一模一樣」)— 閱讀清單逐字鏡射 Claude Phase A.0 六項,**必具名含** `.claude/rules/meta-patterns.md`(31 active M-rules)+ `.claude/memory/MEMORY.md` index(泛 glob ≠ 對等)
6. **判準對等**(2026-07-10「兩邊用同樣完美標準稽核」)— brief 必附 `design-system-audit/references/audit-prompts.md` 每-dim rubric 並要求逐 dim 套用同一判準;只給 dim 編號 = codex 憑己意判 = 標準不對稱
7. **A.1b 對等** — brief 必要求 codex 做 A.1b per-component claim-vs-code 對抗驗證(讀每元件 .tsx + wrap lib source 逐句驗宣稱);漏 = codex 少做 Claude 最高產出 pass(2026-05-30 抓 403 findings)= 任務不對等
```

## 歷史錨點

2026-05-07 我嘗試「短 format 加速 codex」(brief ≤220 字 / reply ≤200 字),user 糾正:「我要 codex 完全深度評估給完整 2nd opinion,即使慢」。撤回短 format,本 SKILL 永久禁。

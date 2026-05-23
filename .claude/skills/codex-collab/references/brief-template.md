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
```

## 歷史錨點

2026-05-07 我嘗試「短 format 加速 codex」(brief ≤220 字 / reply ≤200 字),user 糾正:「我要 codex 完全深度評估給完整 2nd opinion,即使慢」。撤回短 format,本 SKILL 永久禁。

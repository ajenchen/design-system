---
name: audit-must-be-full-sweep-not-sample
description: 稽核必全盤掃 DS-wide,禁 sub-agent prompt 「sample top N」/「subset」當理由跳全盤。違 = hook BLOCKER
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# 稽核全盤 not sample canonical

## Rule

**任何 audit dim 跑 `/design-system-audit --deep` 時,sub-agent 必須掃 DS-wide 全元件(non-Internal + Internal 全部 ~60+),禁 sample subset。**

❌ **絕禁 sub-agent prompt 寫**:
- 「Sample top N components by export-count」
- 「Sampled top 5 to deep verify」
- 「subset」「pick top X」「top hot」
- 「too many to scan all, doing top X」

✅ **必**:
- DS-wide grep / glob 全 `src/design-system/components/*/`
- Per-component dim verify ALL,不挑樣本
- Context budget 不夠 → 拆 N stages(每 stage 10-15 元件),不 sample

## User 原話 SSOT(2026-05-15)

> 「稽核**並非既往不咎**,稽核要**全盤稽核,不能只抽樣,要全盤**,請你務必增刪改看要怎麼確保這件事永遠發生」

## Anti-pattern 錨例(本 session)

**2026-05-15 Dim 12+24+25 sub-agent prompt**:
> "Sample top 5-10 components 深查;不需全 21 元件 exhaustive"
> "Sampled top components by export-count: DataTable (32), DatePicker (14)..."

結果:**只覆蓋 22 / 190 stories ≈ 12% coverage**,剩 168 stories 漏掃。User 抓「還是有很多 story 和範例都沒有被整理過」。

## 既有 NO-SKIP invariant 補強(2026-05-15)

design-system-audit SKILL `--deep` mode 既有「NO-SKIP」directive(2026-05-15 上輪 codify)
攔「跳 dim」,但**沒攔 sample subset**。本 invariant 補:
- NO-SKIP = 每 dim 必跑
- **NO-SAMPLE**(本檔)= 每 dim 內每元件必跑,不挑樣本

兩者並列;hook 都 mechanical 強制。

## Mechanical strength

- `stop_self_audit.sh` 升級:偵測 sub-agent prompt 含「sample」/「subset」/「top N」/「pick top」/「too many」keyword + `--deep` mode 雙條件 → BLOCKER inject
- design-system-audit SKILL Phase 1 加 NO-SAMPLE 明文 directive
- `references/audit-prompts.md` sub-agent prompt template 必含「**Coverage: DS-wide all components, NOT sample**」

## How to apply

Sub-agent dispatch 時 prompt 必含:
```
**Coverage requirement (NO-SAMPLE per memory/feedback_audit_full_sweep_not_sample.md)**:
DS-wide ALL components,不挑樣本。Context 不夠 → 拆 stage(分批 10-15 元件 each batch),
不可寫「sample top N」/「subset」當理由縮 scope。
```

違反 = stop hook detect → BLOCKER + 必 user 重 dispatch 全盤掃。

## Related

- design-system-audit/SKILL.md Phase 1 NO-SKIP invariant(2026-05-15)
- `feedback_propose_in_plain_chinese.md`(同樣 mechanical 強制 anti-pattern)
- CLAUDE.md `# 自主執行 canonical`(完整完美 not 省工)

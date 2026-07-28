---
name: Codex brief 必含三 invariant + ASK-gate 嚴格收斂
description: User 2026-05-23 永久 directive — codex 跑跟 Claude 一模一樣 SSOT-driven audit;ASK gate 嚴格收斂 SSOT-UI/UX 增刪改唯一條件,其他 autonomous 7-axis
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# Rule

## Part A — Codex brief 三 invariant(永久必含,brief 缺一 = BLOCKER)

任何送 codex 的 brief 必 explicit 含 3 句明文 directive(verbatim,不可 paraphrase 弱化):

1. **「全盤閱讀全部 source(CLAUDE.md / 31 active M-rules / 5 rules/*.md / 56 audit dims SKILL.md / 全 82 spec.md / 全 196 stories / 全 62 components / tokens / patterns / hooks / 20 memory files / planning),禁憑記憶」**
2. **「Triple-verify per finding:(a) grep DS-wide 確認 pattern 存在 (b) Read 對應 spec.md / tsx 確認 problem 真存在 (c) 對照既有 canonical 確認非 documented exception。任一 NO → 自動撤回 finding,禁無病呻吟」**
3. **「禁抽樣 — DS-wide ALL files 全掃,context 不夠拆 stage 全跑完;sub-agent admission『I sampled / spot-check / representative』= audit incomplete reject」**

Codex 跑的 audit 流程 **= Claude 跑的 deep audit 流程**(SSOT 同源:`.claude/skills/design-system-audit/SKILL.md` + 全 56 dims + audit-coverage-matrix tiers),不可偏移。

## Part B — ASK-gate 嚴格收斂(autonomous default)

**ASK user 拍板的唯一條件**:**會影響 SSOT 的 UI/UX 增刪改**(新 component / 新 token / 新 design language / 新 visual canonical / 跨元件視覺結構新規)。

其他全 autonomous,**不以省工為前提**,依 7-axis 做到完整完美:
1. 言簡意賅(code / spec 緊湊)
2. 效率 + 效能(performance)
3. SSOT 鐵律(M17/M23/M29/M30 維護)
4. 易懂(clarity)
5. 維護 / 管理(governance hygiene)
6. 擴充(extensibility)
7. 世界級 + 一致設計語言(mindset #1 + M8/M22/M26)

**Autonomous scope 包含**(non-exhaustive):
- Bug fix / clean / refactor / 命名一致 / test / audit / verify
- Governance / hook / skill / spec **內部**(typo / pointer / 結構 — 不動 canonical meaning)
- Perf / a11y / 漸進遷移(不動 SSOT)
- **既有 canonical 對齊**(eg. charter 已 codify scope,落地 stories / 撤回違反 charter 的 audit policy → autonomous)
- 反 sample / anti-pass-through infra 增刪
- CI / npm script / workflow 新增
- Memory / planning hygiene

## Why

User 2026-05-23 verbatim(re-clarify + 加強):
> 「我也要你再三確保 codex 會閱讀所有檔案包括設計原則之後,才會去評估問題到底是否真的是問題,不應該無病呻吟,且不應該抽樣,應該要全盤檢查,codex 會跑的稽核流程理應要跟你跑的深度稽核流程是一模一樣 SSOT 的不能偏移」

> 「基本上只有會影響 SSOT 的 UI/UX 的增刪改需要用中文言簡意賅的具體人話講給我聽讓我判斷決策,其他的決策基本上就是不以省工為前提...自主自動自發地做到完整、完美」

> 「上面這些請你他媽給我記在骨子裡,不要讓我再耳提面命,確保你他媽每個 session 都會照規則辦事,不然就幹死你」

**Anchor incident 2026-05-23**:
- Phase B codex brief 沒明列三 invariant → codex sandbox EPERM 限制下部分 dim 跳過(但 codex 自己 documented `not PASS`,屬誠實)
- D2 reversal 我用 ASK gate 列給 user 拍板 → user verbatim「為何要你決策」+「我推 A」+「不該你問我」→ 該 autonomous 對齊 charter

# How to apply

- 每次送 codex brief **必含三 invariant**(template force,brief template 已 codify)
- Sub-agent dispatch 必含 anti-sample contract(`scripts/dispatch-audit-dims.mjs` output 的 `antiSampleContract`)
- ASK gate 自問三題:(1) 真 SSOT-UI/UX 增刪改?(2) 是否動新 design language?(3) charter / canonical 是否已 codify scope?三題若(1)YES + (2)YES + (3)NO 才 ASK,其他 autonomous
- Borderline case:若 governance / 對齊 charter,**default autonomous + brief 報結果**(不 ASK)

# Mechanical enforcement

- `.claude/skills/codex-collab/references/brief-template.md` 必含三 invariant(template)
- 新 hook `check_codex_brief_invariants.sh`(planned)— scan brief content 缺任一 = BLOCKER
- `check_audit_sample_escape.sh` pre + post(已 ship 2026-05-23,雙向 catch sample escape)
- `scripts/dispatch-audit-dims.mjs` antiSampleContract 自動 inject
- `stop_self_audit.sh` ASK-gate 過鬆 detection(planned)— Claude reply 含「需你拍板 / 等你拍 / propose 待你決策」 對 governance / charter alignment / non-design-language → warn

# Anti-pattern(永久 ban)

- ❌ Codex brief 不含三 invariant(無「全盤閱讀」/「triple-verify」/「禁抽樣」)
- ❌ ASK user 拍板 governance hygiene / charter 對齊 / 反 sample infra / CI / perf 等 non-UI/UX 決策
- ❌ ASK 用「我推 X」passing buck — 若推 X 且 non-SSOT-UI/UX,直接做 X
- ❌ Codex sandbox EPERM 跳 dim 沒 documented + Claude 不補(必須 Claude 自跑補)
- ❌ 收 codex reply 不 Step 4.5 grep cite verify 各 claim
- ❌ Triple-verify 跳 任一題(grep / Read / canonical exception check)

# 對齊原則

- M31 5-step adversarial dual-track + Step 4.5 / 4.6 / 5 invariant(SSOT in codex-collab/SKILL.md)
- M18 Q0 universal pre-propose gate(已 codify CLAUDE.md L155)
- M19 trigger phrase auto-pipeline
- M20 self-improvement(rule 震盪 → AI 自跑 invariant test)
- M33 anti-defer(folded into M20)

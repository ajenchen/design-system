---
name: codex-collab
description: Structured discussion-mode collaboration with OpenAI Codex (via @codex GitHub mention) for visual/SSOT/canonical decisions and deep audit. Codex acts as second-opinion gatekeeper; Claude is synthesizer + implementer. Discussion-first (no auto-commit), persists across sessions via this SSOT. Invoke via /codex-collab when user asks to "與 codex 討論 / 跟 codex 確認 / let's get codex's take".
---

# Codex Collaboration Workflow

**生態位**:Claude(本 agent)在 DS canonical / 視覺 SSOT 決策上**容易忽略既有原則**(M14/M20 累積 evidence)。Codex 作 **第二把關 AI**,以**討論模式**(非 commit handoff)介入,讓兩個 model 互相 cross-check,降低單一 model bias。

**Claude vs Codex 分工**:
| 角色 | Claude (我) | Codex (@codex on GitHub) |
|------|------------|---------------------------|
| 主要職責 | synthesizer + implementer | reviewer + second opinion |
| 寫 code | YES(在 user approve 後) | NO(本 workflow 禁止 commit,純討論) |
| 跑 hook / skill | YES(本 repo CLAUDE.md / hook / skill 全載入) | NO(在 GitHub sandbox 看不到 hook) |
| 對 user 負責 | YES(最終結論由我 report) | NO(透過我轉述) |
| Benchmark cite | M22 mandate | 也須 cite source(我 enforce) |

**核心原則**:Codex 不直接 commit。所有結論由 Claude 收斂、跑完 M1-M27 自檢、user approve 後由我落地。

---

## When to invoke

明確 trigger:
1. **User 要求**:「跟 codex 討論」/「與 codex 確認」/「let's get codex's take on X」
2. **Visual / SSOT / canonical 多輪震盪**:同一視覺主題被糾正 ≥ 2 次(M13 trigger 升級成 codex 介入)
3. **Deep audit (`/design-system-audit --deep`)**:Phase 4.5 必呼叫 codex 做 second-pass
4. **Cross-component canonical 訂立**(M8 benchmark 後)需獨立 reviewer

**禁止 invoke**:單純 typo / 機械 lint / user 已給明確指示的 implementation

---

## Discussion mode workflow(7 步)

### Step 0:user 觸發

User 說「跟 codex 討論 X」或本 skill 自動 trigger condition 滿足。

### Step 1:Claude 草擬 Discussion Brief

格式(必含 6 段,**禁略**):

```markdown
@codex DISCUSS-ONLY (no commit) — <topic>

## Problem
<1-2 句客觀描述,含 reproduce path>

## My Hypothesis (Claude)
<我目前判斷的 root cause + 提議方向>

## Benchmark Cited (M22/M26)
- <DS source 1 + URL/path>
- <DS source 2 + URL/path>
- <DS source 3 + URL/path>

## DS Internal Canonical Consulted (M23)
- <既有 token / variant / spec.md path>

## Specific Questions for Codex
1. <root cause 對嗎?還有 alternative?>
2. <benchmark 是否漏掉 world-class case?>
3. <SSOT 是否該抽到更上層 primitive?>

## Constraints
- DS 原則 M1-M27 全適用(尤其 M8 benchmark / M17 SSOT / M22 cite / M23 DS-first / M27 namespace)
- 不可 commit,純文字討論
- 程式碼建議須 cite world-class DS source
```

### Step 2:Post to PR via mcp__github__add_issue_comment

target PR:當前 working branch 的 PR(`mcp__github__list_pull_requests` 找到 head=current branch)。

### Step 3:Subscribe + wait

`mcp__github__subscribe_pr_activity` → 等 webhook event,**不 poll**(Anthropic best-practice,等推送)。

### Step 4:Codex 回覆 → Claude 自檢

收到 codex reply 必跑 4 題自檢(避免 codex 也犯 M1/M22 錯):
1. **M22 cite check**:codex 引的 benchmark 有 inline source?無 → reply 要求補
2. **M23 DS-first**:codex 建議是否覆蓋 DS 既有 canonical?有 → 我手動驗 DS spec/token
3. **M27 namespace**:codex 建議 prop name 是否撞 DS 既有?
4. **M8 ≥3 source**:codex 只引 1 家 → reply 要求補到 3 家

任一題失敗 → Step 5 不送 user,先回 codex 補。

### Step 5:Synthesize → report user

格式:
```
## Codex 討論結論(主題)

**Claude initial hypothesis**:...
**Codex feedback**:... (cite codex comment URL)
**Cross-check**:M22 ✓ / M23 ✓ / M27 ✓ / M8 ✓ (or 哪題失敗)
**Recommended action**:...
**還未 commit。等你 approve.**
```

### Step 6:User approve → Claude 實作

由我(非 codex)實作,跑完整 stop hook (`stop_meta_self_audit.sh`)+ M14 5-layer pipeline。

### Step 7:Implementation 完 → 回 codex 結案

PR comment:`@codex 結論已 land at <commit>. 感謝 review.`

---

## Guardrails

**Hook 檢查**:本 skill 不需新 hook,沿用既有 `check_benchmark_citation.sh` / `stop_meta_self_audit.sh`。Codex reply 只是 input 不入 commit,所有 hook 仍對 Claude 的 final commit 強制。

**禁止**:
- Codex commit 直接 push(本 workflow 純討論)
- 跳過 Step 4 自檢直接送 user codex 原文
- 把 codex reply 當 ground truth(我仍是 gatekeeper)

**Self-improvement(M20)**:每跑完一輪 codex-collab,若 codex 抓出我漏的 M-rule violation → 該 rule 沒落地好,加進 `.claude/memory/codex-caught-violations.md`(L6 home),讓下次 prune 升級成 hook。

---

## Deep Audit 整合

`/design-system-audit --deep` Phase 4.5 自動 invoke 本 skill:
- Brief 內容:「請 review 本次 audit Phase 1-4 findings,有遺漏的 systemic issue 嗎?」
- Codex reply 進 Phase 5 報告
- 對齊 M14:不靠 user 催,deep audit 自動 chain

---

## Cross-session persistence

新 session 開啟,只要 user 說「跟 codex 討論」→ 我必查本 SKILL.md → 按 Step 0-7 走。本 SSOT 是 single source of truth,**禁止憑記憶簡化流程**。

CLAUDE.md「任務導航表」已 anchor「**跟 codex 討論 / 多輪震盪**」row → 本 SKILL.md。

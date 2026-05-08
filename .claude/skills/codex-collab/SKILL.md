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

**Codex 輸出全來源 invariant(2026-05-07 user 拍板)**:
任何 codex 輸出 — **DISCUSS-ONLY 深 reply / bot 自動 PR review(`chatgpt-codex-connector[bot]`)/ PR comment / inline review thread** — 統一視為 **2nd-opinion 輸入,非 directive**。任何來源都必過完整 Step 4.5 verify + Step 5 比稿 才動 code。**禁止「bot review = 直接修」短路**。歷史錨例:2026-05-07 commit `775d879` 我把 codex bot 兩條 P2 直接修沒做 own-version + 比稿,user 糾正 → commit `f24998f` 補上完整 own-version + 比稿 documentation。本 invariant 永久 codified。

---

## When to invoke

**主原則(2026-05-07 user directive)**:**Claude 自己先嘗試解**,確認自己解不好 / 不確定 root cause 時才 invoke codex。**禁止**「user 提了新 bug → 自動丟 codex」,user 沒明確說「跟 codex 討論」就不塞給他。

明確 trigger(滿足任一才 invoke):
1. **User 明確要求**:「跟 codex 討論 X」/「與 codex 確認」/「let's get codex's take on X」
2. **Claude 自認 stuck**:investigate root cause 後仍不確定 / 多 hypothesis 沒 evidence 收斂 / 跨 framework 不熟悉(eg. Windows-specific bug 但本地是 Linux)
3. **Deep audit (`/design-system-audit --deep`)**:Phase 4.5 second-pass(audit 是 explicit benchmark 場景)
4. **Cross-component canonical 訂立**(M8 benchmark 後)需獨立 reviewer

**禁止 invoke**:
- 單純 typo / 機械 lint
- User 已給明確指示的 implementation
- User 提新 bug 但沒說「跟 codex 討論」(預設 Claude 自己處理)
- Claude 還沒做 grep / read source 就丟 codex(等於把工作外包,違反主原則)

---

## Discussion mode workflow(7 步)

### Step 0:user 觸發

User 說「跟 codex 討論 X」或本 skill 自動 trigger condition 滿足。

### Step 0.5:**Claude 自己先跑一遍完整版**(不可省 — anti-pass-through invariant)

**User 拍板 directive(2026-05-07)**:「**我跑一版 → codex 跑一版 → 我比稿 → 取優棄劣 → final 最佳方案**。每次 collab 都這樣,不可只當守門員」。

**Why this exists**:之前 SKILL 只有「draft brief → send codex → self-check reply」,我容易退化成 pass-through(直接 paste codex 結論問 user 拍 A/B/C)。User invariant:
- 品質 100% 不打折 + 要完美 + 世界級 + 符合 DS SSOT
- **不以省工為前提**(2-AI dual-track 是 cost,不是 cost reduction tool)
- 我要當 synthesizer 不是 dispatcher

**強制動作**(在 Step 1 寫 brief 前必跑):
1. **我自己跑一版完整分析**(eg. 同題若是 audit → 我自己跑 /knowledge-prune 全 phase,grep / read / verify 走完;若是 design decision → 我自己跑 propose-options 4-Q + WebFetch 3 source)
2. **記錄 my own findings** 在 brief 內(讓 codex 知道我已查到什麼,他補我沒查到的角度,不重複 grep)
3. **明確列我自己的 hypothesis + recommendation**(不只 question)— codex 回時針對我具體 propose challenge

**禁止**:用「請 codex 幫我看 X」的問句送 brief,沒附我自己的 own-version 結論。違反 = pass-through 退化。

### Step 1:Claude 草擬 Discussion Brief(以 Step 0.5 own-version 為基礎)

**Brief format invariant(2026-05-07 user 拍板,絕對禁短 format)**:

> 「我要你找他的時候都是希望他完全深度評估並用自己的模型給出完整的 2nd opinion」
> 「品質 100% 不打折 + 不以省工為前提」

**禁止**(violates user invariant):
- ❌ Brief ≤ 220 字 1-Q 短 format(品質打折:cite 廣度 / counter-example / A/B/C trade-off 全失)
- ❌ Reply ≤ 200 字限字(codex 模型沒空間給深度)
- ❌ 「結論→原因→下一步」3-line 模板(失去 architectural depth)
- ❌ 為了 codex Cloud 速度刻意 truncate(用戶接受 15-30 min 等)

**強制**:
- ✅ Deep brief 不限字 + Q1-Q5+ multi-question if needed
- ✅ ≥ 3 world-class DS source cite per benchmark Q(M22 mandate)
- ✅ A/B/C trade-off matrix + counter-example scan(M9)
- ✅ Counter-proposal request(挑戰我的 hypothesis,要 codex 提第 4 條路)
- ✅ Reply 不限字 + DS-first verify(M23)+ namespace check(M27)

歷史錨點:2026-05-07 我嘗試「短 format 加速 codex」(brief ≤220 字 / reply ≤200 字),user 糾正:「我要 codex 完全深度評估給完整 2nd opinion,即使慢」。撤回短 format,本 SKILL 永久禁。

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

**投遞成功率 invariant(2026-05-07 codex 自診斷,絕對遵守)**:

歷史錨點:同日我送 5 條 brief 連發 → codex Cloud queue dedup skip 4 條(只回 1 條)。Codex 自己診斷 root cause = **interval too short**(短時間連送 → 後端 dedup)。

**強制規則(2026-05-08 user-tuned interval + serial gating)**:
- ✅ **Brief 間隔 ≥ 3 min**(2026-05-08 改;前 5 min 過保守,user 拍板對齊 codex 原建議 2-3 min 中位)。trade-off:dedup window 風險微增,由下一條 serial gating 補強。
- ✅ **Serial gating — 同時最多 1 brief in-flight**:有 pending(未 reply / 未 exhausted)brief 時,**禁止送新 brief**;其他排隊到 queue file,前一條 reply / exhausted 才送下一條。避免 codex queue 兩條混淆 / dedup window 撞。
- ✅ **Auto-followup 10 min**(前 15 min):pending brief 過 10 min 無 reply → 自動 new comment `@codex follow-up to brief <id>`。第 2 次 followup 再 +10 min(20 min mark)。第 3 次 +10 min(30 min mark)。3 次 followup 仍無 reply → mark `exhausted`,user-handoff,不再自動送。
- ✅ **每條 brief 用新 `add_issue_comment`,不要 edit 既有 comment**(webhook 不把 edit 當新 task)
- ✅ **Opener canonical**:`@codex DISCUSS-ONLY` 或 `@codex IMPLEMENT`(明確 mode signal)
- ✅ Brief content **保留 deep format**(unchanged, per L1 Step 1 invariant)— interval rule 跟 depth invariant 不衝突
- ✅ 漏接補救:**新 comment** with `@codex follow-up to brief <id> ...`(不要只「請看上面」)

**Queue 跨 session 持久化(2026-05-08 user 拍板)**:
- SSOT:`.claude/memory/codex-brief-queue.jsonl`,JSONL 一行一 brief
- Schema:`{ id, url, topic, sentAt, status, followupCount, lastFollowupAt?, repliedAt?, deferredAt?, deferReason?, planRef?, queuedAfter? }` — status ∈ `pending` (active 等 reply 可 auto-followup) / `deferred` (user 明示「之後再/晚點/先放著」**不 auto-followup**,等 explicit re-invoke 轉 pending)/ `replied` / `exhausted`
- **每 session start 必讀**(本 SKILL invariant — 載入掃 queue 找 pending resume tracking;`deferred` 不送 followup)
- 事件:send brief = append;reply 來 = `replied` + repliedAt + unblock queued;followup auto = ++count + lastFollowupAt;3 round 無 reply = `exhausted` + handoff prompt;user defer trigger = `deferred` + deferredAt + deferReason + planRef
- TodoWrite 仍用(session-scoped 視覺呈現),但 ground truth 在此 file

**Quality-fail re-mention**:reply 來但有 commit / doc 沒 push / Missing Q / M22 無 cite URL / Off-topic / 短 format truncate 任一 → 自動 new comment「previous reply quality issue,需要 X」(逐條列 fail + 重申 deep / cite ≥3 / Q1-QN)。

**禁止**:Send brief 後 forget(queue file 是 SSOT)/ Edit 既有 comment 期待重 trigger / 為投遞率 truncate 深度。

### Step 3:Subscribe + wait

`mcp__github__subscribe_pr_activity` → 等 webhook event,**不 poll**(Anthropic best-practice,等推送)。

### Step 4:Codex 回覆 → Claude 自檢(M22/M23/M27/M8)

收到 codex reply 必跑 4 題自檢(避免 codex 也犯 M1/M22 錯):
1. **M22 cite check**:codex 引的 benchmark 有 inline source?無 → reply 要求補
2. **M23 DS-first**:codex 建議是否覆蓋 DS 既有 canonical?有 → 我手動驗 DS spec/token
3. **M27 namespace**:codex 建議 prop name 是否撞 DS 既有?
4. **M8 ≥3 source**:codex 只引 1 家 → reply 要求補到 3 家

任一題失敗 → Step 4.5 仍要跑(自檢結果記下),Step 5 一併 report。

### Step 4.5:**獨立 verify codex 具體 claim**(不可省 — anti-pass-through)

**Why this exists**:Step 4 只 check 表面 cite / namespace,**不 verify codex 結論本身對不對**。
歷史:2026-05-07 codex infra audit reply 給「7 anti-bloat 機制重疊」結論,我直接列 A/B/C 給 user 拍板,沒 grep verify → user 發現我退化成 pass-through。**Step 4.5 強制 verify 阻止這個 anti-pattern**。

**強制動作**(逐條 codex 具體 claim 過):
1. **Grep DS-internal**:codex 指的 file / token / pattern 真存在?用 `grep -rn "${claim}"` 確認
2. **WebFetch external**(若 codex cite world-class):URL 真有寫 codex 引用的內容?(對 high-stakes claim 必跑)
3. **Run script**(若 codex 給數字):codex 給「28→16 hooks」這種具體 target,我自己跑分析腳本核對 reachable 數字
4. **Counter-example scan**:codex 說「X 是 anti-pattern」→ 我 grep 看 DS 是否已用此 pattern 且 work fine(反證)
5. **記錄 verification result**:每條 claim 標 `✅ verified` / `❌ FALSE` / `⚠️ partial`,理由附旁

**禁止**:跳過 Step 4.5 直接列 A/B/C 給 user 拍板 = pass-through 退化,違反本 SKILL invariant。

### Step 4.6:**Regression / 連動 scan on 我自己 proposed fix**(2026-05-08 user 拍板,絕對禁省)

**Why this exists**:Step 4.5 只 verify codex 的 claim 真不真;不 verify **我自己 propose 的 fix 是否會造成連動非預期錯誤**。歷史:2026-05-07 commit `775d879` 我把 `tableRoot` 改 optional + document fallback,自以為 backward-compatible 但**沒 grep callers** + 沒想 future caller 不傳會仍 cross-instance — codex round 2 抓出來才修成 strict required(`f24998f`)。Step 4.6 強制 regression scan 阻 anti-pattern。

**強制動作**(逐條 propose 動 code 前必過):
1. **Grep all callers / consumers**:動 API / symbol / token / hook / variant → grep DS-wide 找所有 consumer,每個 consumer 行為變化?有 break case?
2. **Type contract impact**:optional → required 是 breaking;default value 改 是 breaking;param order 改 是 breaking;return type 縮窄 是 breaking — 列出每條 breaking change 的 mitigation
3. **Edge cases**:boundary conditions / null path / empty input / race / concurrent state / a11y(keyboard / screen-reader) / dark mode / density / RWD viewport — 至少跑 5 條
4. **Cross-component impact**:這 fix 動的東西其他 sibling component / pattern / token 有間接消費?(SSOT chain 反向)
5. **Run existing tests**:`npx tsc -b` + `node scripts/data-table-invariants.mjs`(若動 DataTable)+ 相關 stories 互動驗
6. **記錄 scan result**:每項標 ✅ safe / ⚠️ partial / ❌ break + 證據;任一 ❌ → re-design 不 commit

**禁止**:propose fix 後直接 Edit / Write / commit 沒跑 4.6;靠「應該沒問題」直覺 ship — 違反 = anti-pattern。

### Step 5:**比稿 my own-version vs codex-version → final synthesized 方案**

**Anti-pattern**:把 codex reply 整段 paste 給 user 然後問「拍 A/B/C?」。這是 pass-through,不是 collab。

**User directive(2026-05-07)**:「**比稿** — 取優點去缺點 → final 最佳方案。確保品質 100% 不打折」。

**強制比稿過程**:
1. 把 Step 0.5 own-version + Step 4.5 verified codex-version 並列成 matrix
2. 逐條決定:
   - **接受 codex**(我沒想到 + verified 對)
   - **接受我自己**(codex 漏掉 / 過度激進 / verified FALSE)
   - **修正(取兩邊優點)**(eg. codex 提 -12 hooks,我 verify 只 -5 reachable → final -8 兼顧 codex aggressive 跟我 conservative)
   - **重啟**(兩邊都不對 → 重新做)
3. 列 final 方案,不再列 A/B/C 給 user 拍 unless 真歧義

**強制 reply format**:Step 4 self-check(M22/M23/M27/M8)+ 4.5 verify 表 + 4.6 regression scan 表 + 5 接受/拒絕/修正 + final action(僅真歧義列 options)。錨例 `029b647` `f24998f` `775d879`。

### Step 6:User approve → Claude 實作

由我(非 codex)實作,跑完整 stop hook (`stop_meta_self_audit.sh`)+ M14 5-layer pipeline。

**Joint test case planning(D-class architectural change 必走,2026-05-07 user 拍板)**:

當實作屬「architectural change 加新 primitive / 動 layer 系統 / 動 SSOT owner」(eg. P1 D 路徑 `<CellInteractiveOverlay>`),Step 6 升級成 **dual-track 實作** + **joint test case planning**:

> 「到時候要做的時候你跟 codex 一起協作實作,然後兩者同時一起列 test case 確保所有情境都能被驗證無誤」

**強制流程**:
1. **Implementation dual-track**:Claude 寫 v1 + codex 寫 v1 → 比稿 final
2. **Test case 同時列**(joint planning,**非依序**):
   - Claude 列 Q1-QN test scenarios
   - Codex 列 Q1-QN test scenarios(獨立)
   - 比稿合併 → final test plan(union — 防漏單邊)
3. **Min coverage 框架**(per architectural change scope):
   - 4 大 stories regression(virtual / autoRow / inline / pinned)若觸 DataTable
   - State combinations(size × mode × pinned 狀態)
   - Visual pixel-level Playwright probe
   - Hit test(pointer-events 不破 click chain)
   - Z-index / portal context(DragOverlay / HoverCard popup 不破)

**禁止**:
- ❌ 只 Claude 列 test case(防漏)
- ❌ 只 codex 列 test case(防 codex bias)
- ❌ 依序列 test(必須兩邊獨立 → 比稿 union)
- ❌ skip joint planning 直接 implement(architectural change 規模需要 test case 全 coverage)

### Step 7:Implementation 完 → 回 codex 結案

PR comment:`@codex 結論已 land at <commit>. 感謝 review.`

---

## Guardrails

沿用既有 hook(`check_benchmark_citation.sh` / `stop_meta_self_audit.sh`),codex reply 不入 commit,hook 對 final commit 強制。**禁止**:codex commit 直接 push / 跳過 Step 4 送 user 原文 / 把 codex reply 當 ground truth。**M20 self-improvement**:codex 抓的 M-rule violation → 加 `.claude/memory/codex-caught-violations.md`。**Auto-codify(2026-05-07)**:任何 collab 新發現 → 立刻 5-layer(SKILL + memory + CLAUDE.md + planning),trigger「確保記錄起來」「不需要再對你耳提面命」「自然就知道」。

## Deep Audit 整合 + Cross-session persistence

`/design-system-audit --deep` Phase 4.5 自動 invoke 本 skill(brief「review Phase 1-4 findings,有 systemic issue 嗎?」→ Codex reply 進 Phase 5,M14 chain)。新 session user 說「跟 codex 討論」→ 必查本 SKILL.md 按 Step 0-7 走;CLAUDE.md 任務導航表已 anchor;**禁憑記憶簡化流程**。

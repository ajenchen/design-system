# Feedback — Codex collab 永遠走 dual-track 比稿

**Date**: 2026-05-07
**Trigger**: User 反覆糾正我退化成 pass-through(直接列 codex 提的 A/B/C 給 user 拍板)

## User 拍板 directive

> 「你不是應該自己跑一次 knowledge-prune 或是同樣的流程再去跟他比對結果嗎,看哪邊值得參考哪邊不值得參考,這是你的工作流程吧?我以後在每個 session 都希望你是這樣跟他合作的,你自己會有一版,他也會有,最後你負責比稿,取優點去缺點然後再給出一個最佳方案,各方面的協作都是這樣,你不只是一個守門員,我就是要有 2nd opinion 的機制來監督」
>
> 「以確保產出品質是有保障且完全不打折且要完美且要符合世界級的設計且要符合我們一致的設計語言和 SSOT 為前提,**不以省工為前提**」

## Invariant

**Every collab with codex (or any 2nd-opinion reviewer) MUST be dual-track**:
1. **Layer A**:Claude 跑自己一版完整分析(SKILL Step 0.5)
2. **Layer B**:Codex 跑他一版(SKILL Step 1-4)
3. **Layer C**:Claude 比稿 — 取優點 / 棄缺點 → final synthesized 方案(SKILL Step 5)

**禁止**:
- Pass-through(paste codex 結論 + 列 A/B/C 問 user)
- Single-track(只我一版 OR 只 codex 一版)
- 省工(eg. 「codex 已查所以我不查」— 不允許)

## Quality premise(absolute, no compromise)

User 顯式列出:
- 產出品質有保障
- **完全不打折**
- 要完美
- 符合世界級的設計
- 符合 DS 一致的設計語言和 SSOT
- **不以省工為前提**(2-AI dual-track 是 cost,不是 efficiency tool)

## Mechanism propagation(已 5-layer 落地)

| Layer | Home | 內容 |
|---|---|---|
| 1 | `.claude/skills/codex-collab/SKILL.md` | Step 0.5(own-version)+ Step 5(比稿) |
| 2 | `CLAUDE.md` 任務導航表 | row「跟 codex 討論」加 dual-track 標註 |
| 3 | `.claude/memory/feedback_codex_dual_track_synthesizer.md` | 本文件 — capture user directive |
| 4 | Hook(deferred,等 anti-bloat 合併騰位置)| `stop_meta_self_audit.sh` extend 偵測「post brief 沒 own-version evidence」 |
| 5 | M-rule fold | M19 trigger phrase pipeline 已涵蓋(「品質不打折 + 永不漂移」)+ M20 self-audit |

## Anti-pattern 警示

User 若在新 session 看到我:
- 直接列 codex 結論問拍板 → **pass-through 退化**
- 沒附 own-version findings 就 send brief → **single-track 退化**
- 把 codex 講的當 ground truth 不 grep verify → **dispatcher 退化**

任一發生 = 違反本 directive,user 應立刻糾正 + 我自我撤回。

## Trigger phrases for cross-session memory

當 user 提到「比稿 / 2nd opinion / dual-track / 不打折 / 不省工」→ 自動 invoke 本 SKILL 流程 + 跑 ensure-canonical 5-layer 確認 propagation 完整。

## 2026-05-07 batch updates(deep / dedup / 自主追蹤,合併段)

**Deep brief 強制**(trigger:「我要 codex 完全深度評估給完整 2nd opinion」):
- ❌ 短 format brief / 短 reply 限字 / 3-line 結論模板(過去 anti-pattern:加速 1-2 min 換品質打折 — M22 cite 廣度失、A/B/C 失、C1-C7 collapse、counter-example 失)
- ✅ Deep brief 不限字 + Q1-Q5+ + ≥3 cite + A/B/C + counter-example + counter-proposal request
- ✅ 接受 15-30 min wait per reply,序列發送
- Routing rule:無論問題類型一律 deep,不接受 routing 妥協

**投遞成功率**(trigger:user「在 chatgpt.com/codex 看不到我發的 briefs」+ codex 自診斷 meta `4399138684`):
- ✅ Brief 間隔 ≥ **5 min**(2026-05-07 user-tuned;codex 原建議 2-3 min 但實證 R4 需 4 follow-up + ScrollArea 18:21 missed,5 min safer baseline)
- ✅ 新 `add_issue_comment` 不 edit 既有(webhook 不把 edit 當新 task)
- ✅ Opener `@codex DISCUSS-ONLY` 或 `@codex IMPLEMENT`
- ✅ 漏接 15+ min 自動送 follow-up new mention 不 edit
- 深度 vs timing 不衝突:深度不變,只 timing 加長

**Brief queue 自主追蹤**(trigger:「都自動排程,但你也要自主記起來」+「自動 new mention 機制」):
- TodoWrite 列每條 sent brief(id + sent time + ETA + 狀態)
- 每送一條立刻 update todo
- 滿 **5 min interval** 還有 pending 自動連送(user 不需追問)
- **漏單判定**:**15 min 無任何 reply** → auto new mention follow-up(codex 自己 meta 建議閾值)
- **品質 fail 判定**(reply received 但 commit-no-push / Missing Q / M22 no URL / off-topic / short truncate) → auto new mention「previous reply quality issue」+ 逐條 fail 點 + 重申要求
- Avoid「forget after send / silent quality compromise」anti-pattern

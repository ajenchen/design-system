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

## 2026-05-07 update — Deep brief format 強制(撤回短 format)

**Trigger**:user 反問「你確保 codex 回覆有確保品質且完全沒打折嗎?」+ 後續確認:
> 「但我認為我要你找他的時候都是希望他完全深度評估並用自己的模型給出完整的 2nd opinion」

**Anti-pattern history**(violation):
- 2026-05-07 我為了「加速 codex reply」採用短 format(brief ≤220 字 / reply ≤200 字 / 「結論→原因→下一步」模板)
- 反例:速度 1-2 min ≪ 15-20 min,但**品質打折**:
  - M22 cite 廣度失(只 fit 1-2 cite,canonical 要求 ≥3)
  - A/B/C trade-off matrix 失
  - C1-C7 逐條 architectural blocker 評估 collapse 成 1 句
  - Counter-example / alternative path 探討失
- User 糾正:「我要 codex 完全深度評估給完整 2nd opinion」,撤回短 format

**Invariant(永久禁)**:
- ❌ 短 format brief / 短 reply 限字 / 3-line 結論模板
- ✅ Deep brief 不限字 + Q1-Q5+ + ≥3 cite + A/B/C + counter-example + counter-proposal request
- ✅ 接受 15-30 min wait per reply(品質優先)
- ✅ 序列發送(避免 codex 並送被 skip,但每條都 deep)

**Routing rule**:無論問題類型(simple verdict / deep architectural)— 一律 deep brief。User 不接受 routing 妥協,因為「2nd opinion 的價值在 codex 自己的 model 深度評估」,不是只拿 verdict 收斂。

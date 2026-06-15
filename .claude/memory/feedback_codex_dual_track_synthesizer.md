# Feedback — Codex collab dual-track + autonomous 紀律(M31 provenance + 2026-05-23 directives 合併)

**Date**: 2026-05-07 起;2026-06-11 合併 feedback_codex_collab_2026_05_23_directives.md(prune D8,142→98 行零保護損失)
**5-step 操作細則 SSOT** = `.claude/skills/codex-collab/SKILL.md` + meta-patterns M31 row。本檔 = provenance(user verbatim)+ 紀律 invariants。

## User 拍板 verbatim(M31 anchor)

> 「你跟 codex 都要各自驗證過並視覺稽核過,最後你整合出完美完整的版本」+「你是可以跟 codex 辯論的…都要各自熟讀所有檔案」+「避免你完全被 codex 的錯誤解法牽著走」(2026-05-10)

> 「你自己會有一版,他也會有,最後你負責比稿,取優點去缺點然後再給出一個最佳方案…我就是要有 2nd opinion 的機制來監督」+「以確保產出品質…完全不打折且要完美且符合世界級的設計…SSOT 為前提,**不以省工為前提**」

## Invariant — dual-track 三層(hook `stop_self_audit.sh` 強制)

**Layer A**(Claude own 完整分析)+ **Layer B**(codex own)+ **Layer C**(比稿 synthesize)。缺一 = 違反。
**禁止**:pass-through(paste codex 結論列 A/B/C 問 user)/ single-track / 省工(「codex 已查所以我不查」)。
**起源實證**:Issue 8 cell border pass-through ship → user「被 codex 牽著走」;Issue 11 完整 5-step cite battle = 正確錨。

## Codex-first for root-cause-elusive bug(2026-05-10)

自查窮盡(grep + read + 1 hypothesis)仍找不到根因(CSS quirk / browser / async / cross-component)→ 立刻丟 codex deep-dive,不苦撐 N turn。anchor:scrollbar thumb hover,Claude 2 turn cope-out vs codex 1 reply(Chrome 121+ scrollbar-color)。純 grep 可找 → 自查 OK。

## Sub-rule 1 — ASK gate 嚴格收斂 + autonomous 7-axis

- **ASK 唯一條件** = 會影響 SSOT 的 UI/UX 增刪改(新 component / token / design language / visual canonical / 跨元件視覺結構新規)
- 其他全 autonomous(7-axis:言簡意賅 / 效率效能 / SSOT 鐵律 / 易懂 / 維護 / 擴充 / 世界級一致)
- SSOT auto-sync:跨 file 數字必 reference SSOT 或 `sync-governance-counters.mjs` 機械對齊
- **User 原話**:「只有會影響 SSOT 的 UI/UX 的增刪改需要用中文具體言簡意賅的人話講給我聽讓我判斷決策,其他…自主自動自發地做到完整、完美」+「所有有 ssot 的東西都要給我自動同步更新,避免他媽給我偏移」

## Sub-rule 2 — Triple-verify before bothering user

Propose / 列 option / 報 problem(含 codex 抓的)前必 3-test:(1) grep DS-wide(2) Read spec/tsx 確認真存在(3) 對照 canonical exception。任一 NO → 撤回不煩 user。
**User 原話**:「你他媽都要給我再三全盤確認…到底是不是真的問題還是只是無病呻吟」
**False-positive anchors**:2026-05-18 Sheet/inline-action/SurfaceBody 三題全誤報;2026-05-23 Badge text-[10px] 是 documented exception。

## Sub-rule 3 — Codex brief 三 invariant +「trust 自己」真意

**Brief 必含**(缺一 BLOCKER,hook `check_codex_brief_invariants.sh`):(1) 全盤閱讀全部 source 禁憑記憶(2) triple-verify per finding(3) 禁抽樣 NO-SAMPLE(sample admission = reject)。codex 流程 = Claude 流程同 SSOT,不可偏移。
**「trust 自己」真意** = 完整 M31 adversarial dual-track,**永不可**解讀為 skip codex。「不被牽著鼻子走」(反 pass-through)≠「不用 codex」— 180° 相反。
**User verbatim 2026-05-23**:「你們各自都要全盤閱讀過所有檔案據理力爭辯論討論,不要被 codex 牽著鼻子走,要再三確認問題真的是問題而不是無病呻吟」(+ 曲解被怒糾 anchor)

## Sub-rule 3C — Phase-A-first:codex = second opinion 非 primary(2026-05-29)

啟 codex 前必先跑完整自己 Phase A(**跑 deterministic script ≠ Phase A**;= 獨立深度 audit 列 P0/P1/P2)。anchor:2026-05-29 跳 Phase A 被抓,補做後 Claude 獨抓 3 個 P0。Mechanical:stop_self_audit soft warn。

## Sub-rule 3D — Auto-mode 不為 non-SSOT 決策 ASK

只有 SSOT-UI/UX substantive 才 ASK;non-SSOT(refactor 方向 / sync / governance home / 命名 / test 策略)→ 自己 pick best execute,**禁列 A/B/C**。**deep-audit auto-chain /knowledge-prune 也自動跑不問**(in-flow SSOT → deep-audit-cross-codex SKILL C.0a)。
**Anchors**:2026-05-29 ds-canonical sync 列 A/B/C 被怒糾「不是 auto mode 嗎」;**2026-06-11 又問「要不要跑 knowledge-prune」被怒糾**(規則在本檔但 SKILL 無 → C.0a 補進執行時 home + hook 提示語改「必 AUTO-RUN 禁問」+ report-validator 機械兜底)。

## How to apply

brief 含三 invariant(template `codex-collab/references/brief-template.md`)→ reply 走 Step 4→4.5→5 禁 pass-through;Phase-A-first;ASK 前自問 3 題(真 SSOT-UI/UX?新 design language?未 codify canonical?)全 YES 才問。

## Mechanical enforcement

`check_propose_pre_grep_verify.sh` / `check_substantive_edit_approval_preflight.sh` / `stop_self_audit.sh`(M4/M5/Phase-A-first)/ `check_codex_collab_5step.sh` / `check_codex_brief_invariants.sh` / `check_audit_sample_escape.sh`(pre+post,2026-06-11 擴 Workflow 派發)/ `sync-governance-counters.mjs`。

## Anti-pattern(永久 ban)

- ❌ pass-through / single-track / 省工跳 verify / brief 缺三 invariant
- ❌ ASK non-SSOT(governance / sync / CI / perf / 跑不跑 prune)或「我推 X」passing buck
- ❌「trust 自己」解讀成 skip codex / 跑 script 當 Phase A
- ❌ 「省工 / 下次 / 下個 session」defer / SSOT hardcode 多處

## Trigger phrases

「比稿 / 2nd opinion / dual-track / 不打折 / 不省工」→ auto invoke codex-collab SKILL。

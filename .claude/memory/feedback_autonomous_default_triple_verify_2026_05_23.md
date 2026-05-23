---
name: Autonomous default + triple-verify before bothering user (2026-05-23 永久 directive)
description: User SSOT directive — only SSOT-UI/UX 增刪改 ASK in 中文人話; everything else autonomous on 7 axes; all proposes/codex disagreements triple-verify before bothering user
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# Rule

(a) **ASK gate = SSOT-UI/UX 增刪改唯一條件**。其餘 autonomous,不以省工為前提,依 7 軸完整完美:言簡意賅 / 效率+效能 / SSOT 鐵律 / 易懂 / 維護 / 擴充 / 世界級+一致設計語言。

(b) **Triple-verify before bothering user**:任何 propose / 列 option / 發現 problem(包括 codex 抓的、deep audit P0/P1/P2),propose 前必先 inline 跑:
1. `grep` DS-wide consumer / spec / hook
2. Read 對應 `*.spec.md` / `*.tsx` 確認 problem 真存在
3. 對照既有 canonical 確認非 false positive(eg. documented exception)

Triple-verify 三題全過才 propose;任一 NO → 自動撤回,不煩 user。

(c) **SSOT auto-sync invariant**:所有跨 file 同概念數字(M-rule count / hook count / audit dim count / npm scope / version / pluginName)有 SSOT,其他 file 必 reference 或由 `sync-governance-counters.mjs` 機械對齊。Drift 偵測 → 自動 fix + commit,無需 user trigger。

# Why

User verbatim 2026-05-23:
> 「你他媽這些所有有ssot的東西都要給我自動同步更新，避免他媽給我偏移」
> 「所有工作流程，基本上只有會影響SSOT的UI/UX的增刪改需要用中文具體言簡意賅的人話講給我聽讓我判斷決策，其他的決策基本上就是不以省工為前提...依此為前提來照你的建議來自主自動自發地做到完整、完美」
> 「所有問題，包括跟codex討論辯論出來的問題，你他媽都要給我再三全盤確認所有檔案包括設計原則看到底是不是真的問題還是只是無病呻吟，不要明明不是問題卻一直煩我」
> 「請確保上述你他媽永遠都會自動做不需要我耳提面命且永遠不會忘記」

**False-positive anchors**(不該 propose 給 user):
- 2026-05-18:Sheet / inline-action / SurfaceBody 三題 migration propose 全是 false positive(grep verify 後 0 個真 gap)
- 2026-05-23:Badge `text-[10px]` / OverflowIndicator `text-[10px]` 被 deep audit 誤判為 drift,實際是 `badge.spec.md` L161-167 explicitly documented sub-footnote exception(Badge / OverflowIndicator 兩處合法,not drift)

# How to apply

- 每次 propose / report finding 前 inline 跑 triple-verify(三題寫出來)
- 全過 → 列 propose;任一 NO → 自動撤回,不報 user
- SSOT-UI/UX 增刪改才中文人話 ASK;其他 autonomous batch fix + verify

# Mechanical enforcement

- `check_propose_pre_grep_verify.sh`(P0 PreToolUse;propose without grep evidence → BLOCK)
- `check_substantive_edit_approval_preflight.sh`(PreToolUse Edit/Write production code;無 approval → BLOCK)
- `stop_self_audit.sh`(spec/canonical 補位 post-action)
- `scripts/sync-governance-counters.mjs`(SSOT auto-sync;session-start 偵測 drift → 自動 propose update)
- `scripts/ssot-sync-check.mjs`(全 SSOT scope check;CI gate)
- CLAUDE.md `# 自主執行 canonical` 2026-05-23 段(永久 codified directive)

# Anti-pattern

- ❌ Propose 給 user 前沒 grep / 沒 read spec 就斷言「N 元件缺 X」
- ❌ 把 deep audit P0 finding pass-through 給 user 沒 triple-verify
- ❌ 把 codex disagreement pass-through 給 user 沒 cite-battle
- ❌ 過度 ASK(「OK 嗎?」/「你想怎麼處理?」on non-SSOT-UI/UX)
- ❌ 「省工」/「下次再做」/「下個 session」defer 措辭
- ❌ SSOT hardcode 多處(M-rule count / hook count 等)不走 sync-governance-counters

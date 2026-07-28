---
name: AI self-audit unreliable — mechanical ground-truth = primary, AI judgement = supplementary, new layer always EXPAND never REPLACE
description: 2026-05-27 user verbatim「你他媽每次都要叫你截圖你才能發現自己錯,那我怎麼可能相信你只透過比對 HTML 就能發現自己錯?你很常無法發現自己錯在哪才是重大的問題所在吧」+ session 多次印證 anchor → fundamental audit infra design principle
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# Rule

**AI cannot reliably self-audit own output**。所有 canonical defense layer 必遵守:

1. **Mechanical ground-truth checks(primary defense)**: pixel diff / playwright DOM probe / pixelmatch / computed style / tsc / lint / playwright runtime — 這些是 ground truth,永遠不可被 AI judgement 取代
2. **AI judgement-based checks(supplementary only)**: sub-agent dim 12/24/25 等主觀判斷 → only as supplementary layer,never primary
3. **New layer always EXPAND never REPLACE**(M17 SSOT 鐵律延伸): 加 DOM diff 必 keep pixel diff,加 lint 必 keep tsc,加 visual-audit 必 keep mechanical hooks。**禁** AI judgement 取代 mechanical
4. **Visual / perceptual ambiguity → user-with-screenshot escalation**: AI 自決 perceptual 設計判斷 = fail mode;ambiguous case 必 escalate user + screenshot,never AI 自己拍板
5. **Audit infra design test**: 新 propose audit mechanism 前 inline 問「這 catch AI 自己看不到的 case 嗎?還是依靠 AI 看自己 code 判斷自己錯?」後者 = reject

## Why

User 2026-05-27 verbatim:
> 「你他媽每次都要叫你截圖你才能發現自己錯,那我怎麼可能相信你只透過比對 HTML 就能發現自己錯?你很常無法發現自己錯在哪才是重大的問題所在吧」

直接 challenge 我 propose 的「DOM diff 取代 pixel diff」設計 → 暴露 AI self-audit blind spot 的 fundamental limitation。

**Session-proven anchors**(每條都是本 session 內 reproducible 證據):
- **2026-05-27 DataTable padding**: Claude playwright probe 報「12px ok」,user 抓 Netlify 顯示 0px,Claude 自己驗才發現是 stale deploy / token --table-cell-px empty。AI self-probe 不可信
- **2026-05-27 deep-audit-cross-codex L228「正交」wording**: 存在 N 個月,Claude grep + read 多次都沒 catch contradiction with L9+L29,直到 user 質疑才發現
- **2026-05-27 #2 design flaw**: Claude propose「DOM diff 取代 pixel diff」 ship 差點;user 一句反駁就抓 design flaw 是 SSOT-weakening。Claude 自己沒 catch
- **2026-05-27 v1 over-engineering**: Claude propose 6-layer fix(Phase D + dim 79 + new hook + memory + ...);user challenge「確定簡潔乾淨?」才 reduce 到 v2 2-edit minimal
- **歷史 M13**: user 第 2 次問同問題 = 必截圖 verify(過往 multiple incidents accumulated)
- **本 session 不斷 hook over-fire**: AI 用 keyword regex heuristic 自審 own context,反覆 false-positive — heuristic-based AI self-judgement 系統性不可靠

## How to apply

**新 audit propose 必過 ground-truth test**:
- (a) 這 catch 的 case 是「AI 看自己 code 判斷」還是「runtime / pixel / DOM / tsc / lint 給 ground truth」?
- (b) 若 AI judgement-based → 標 supplementary,不可作 primary defense
- (c) 若取代 existing mechanical → reject(M17 SSOT「永遠 expand never replace」延伸)
- (d) Visual / perceptual ambiguity → 必 escalate user-screenshot,不可 AI 自己拍板

**現有 audit layer 健檢**:
- Pixel diff(playwright + pixelmatch)= primary ✅
- DOM probe(playwright runtime)= primary ✅
- tsc + lint = primary ✅
- Anti-pattern hooks(check_*.sh regex / grep over source)= primary(grep over source = ground truth check,非 AI judgement)
- Sub-agent dim 12/24/25 AI judgement = supplementary,需 mechanical chain confirm
- Codex M31 dual-track = 2-AI 比稿仍是 AI judgement(per session 2x token-burn fail 已 demonstrate不可靠),需 mechanical verify

## Mechanical enforcement

- **Audit propose review gate**: 任何新 audit dim / hook propose 前必 inline 答「ground-truth test」3 題。違反 = reject。Codify in propose-options skill check
- **New layer principle**: extend `.claude/skills/design-system-audit/SKILL.md` workflow Phase 0 baseline 加「mechanical-vs-AI-judgement layer classification」column for each dim
- **Visual ambiguity escalation**: visual-audit skill 加「ambiguous → user screenshot escalate」mandatory step,never AI 自決

## Anti-pattern(永久 ban)

- ❌ Propose「AI X-check 取代 mechanical Y」(無論 X 看似多 elegant)
- ❌ AI self-audit own output 為 primary verdict source(per session-proven blind spot)
- ❌ 跳 ground-truth test 直接 ship propose
- ❌ Visual perceptual decision AI 自決(必 user-screenshot)
- ❌ 把「兩 AI 比稿」當 ground truth(M31 codex collab 是 supplementary 2nd opinion,不是 mechanical truth)

## 對齊原則

- M13 user 第 2 次問 = 必截圖 verify(本 rule 通用化)
- M17 SSOT 鐵律(新 layer always expand never replace 是延伸)
- M20 self-improve(audit blind spot 是 M20 最大 catch 範圍)
- M22 benchmark 必 cite(AI 印象不可信延伸)
- mindset #1 不取巧(AI 自審 = 取巧 shortcut)
- Toyota TPS Jidoka(機器自停 不靠 human / AI 自決)
- Linux kernel pre-submit checkpatch.pl(deterministic script,non-AI)

---
name: AI self-audit unreliable — mechanical ground-truth primary; AI judgement supplementary; new layer EXPAND never REPLACE
description: 2-in-1 consolidated 2026-05-28(AI-self-audit canonical + composition-fidelity pixel-vs-structural specific application)。AI 不可信自審 own output,pixel/DOM/tsc/lint/playwright runtime = primary;AI judgement = supplementary only;new audit layer 永遠 expand never replace
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# AI Ground-Truth Canonical — Self-Audit Unreliable, Mechanical Primary

2-in-1 consolidated 2026-05-28 per Rule-of-3 absorb。原 2 file:
- `feedback_ai_self_audit_unreliable_mechanical_primary_2026_05_27.md`(general canonical)
- `feedback_composition_fidelity_pixel_vs_structural_2026_05_27.md`(specific application to composition fidelity)

## Core Rule

**AI cannot reliably self-audit own output**。All canonical defense layers must:

1. **Mechanical ground-truth = primary**:pixel diff / playwright DOM probe / pixelmatch / computed style / tsc / lint / playwright runtime — ground truth,**永遠不可被 AI judgement 取代**
2. **AI judgement = supplementary only**:sub-agent dim 12/24/25 等主觀判斷 only as supplementary,never primary
3. **New layer always EXPAND never REPLACE**(M17 SSOT 鐵律延伸):加 DOM diff 必 keep pixel diff,加 lint 必 keep tsc。**禁** AI judgement 取代 mechanical
4. **Visual / perceptual ambiguity → user-screenshot escalation**:AI 自決 perceptual 設計判斷 = fail mode;ambiguous case 必 escalate user + screenshot
5. **Audit infra design test**:propose 新 audit mechanism 前 inline 答「這 catch AI 自己看不到的 case 嗎?還是依靠 AI 看自己 code 判斷自己錯?」後者 = reject

## Specific application 1 — Composition fidelity(pixel vs structural)

**Architecture-level render fidelity 由架構保障,不靠 pixel diff**:
- Consumer(product-workspace)`@qijenchen/design-system` = workspace link `file:.../packages/design-system`(local)OR npm tag(deployed)
- 兩端 = 同一份 DS source,**code-level drift 不可能**
- "Drift" 只能來自:(a) consumer wraps DS w/ broken pattern → anti-pattern hooks 攔 (b) Netlify stale deploy → operational fix

**Pixel diff scope**:
- ✅ **適用**:同內容 story re-render 一致性(eg. button#Default 多次跑像素 ≤ 0.5%)
- ❌ **不適用**:template-vs-canonical 內容差異 by design(nav items / brand text / page widgets / chrome rightSlot 全 differ),pixel diff 1.4% = noise 而非 drift

**真機制**(supplementary to architecture,not replacement):
1. **Anti-pattern static hooks**(primary):
   - `check_sidebar_menu_button_implicit_wrap.sh` — SidebarMenuButton wrap pattern
   - `check_chrome_header_avatar_canonical.sh` — chrome header raw Avatar 24
   - `check_consumer_app_invariants.sh(r3,2026-06-11 merge)` — 7 anti-pattern(含 2026-06-02 Pattern 8:硬寫色值/字級/shadow 繞 token)
   - `check_consumer_app_invariants.sh(r2,2026-06-11 merge)` — @story-baseline marker enforce
   - `check_consumer_app_invariants.sh(r1,2026-06-11 merge)` — 禁 PW 重寫 DS catalog
2. **架構保障**:npm workspace link / portal pattern(AllDsComponents iframe to DS Storybook)— consumer 不可能 fork DS source
3. **Visual diff = identity opt-in(2026-06-02 修正,原無條件 UNION dual-track 已廢)**:`scripts/composition-fidelity-visual-diff.mjs` 的 pixel/DOM identity 只比標 `@composition-fidelity-mode` 的 mapping(忠實複製 replica / same-story 跨版本回歸);單獨 `@story-baseline` = conformance 意圖,不做 identity diff(交上述靜態 hook 驗);shell-only 模式 skip DOM diff(DOM 仍含被遮內容會 false-positive,只比遮罩後 pixel)。對齊 Polaris/Atlassian/Carbon「consumer 用對 token 靠 static lint」模型(SSOT: `.claude/references/composition-fidelity.md`)

## Session-proven anchors(reproducible evidence)

1. **2026-05-27 DataTable padding**:Claude playwright probe 報「12px ok」,user 抓 Netlify 0px,Claude verify 才發現 stale deploy。AI self-probe 不可信
2. **2026-05-27 L228「正交」wording**:存在 N 個月,grep + read 多次 沒 catch,user 質疑 才發現
3. **2026-05-27 #2 design flaw**:Claude propose「DOM diff 取代 pixel diff」差點 ship,user 反駁就抓 design weak SSOT
4. **2026-05-27 v1 over-engineering**:Claude 6-layer fix,user challenge「確定簡潔?」才 reduce 到 v2 2-edit
5. **歷史 M13**:user 第 2 次問同問題 = 必截圖 verify
6. **本 session hook over-fire**:AI keyword regex heuristic 反覆 false-positive — heuristic-based AI self-judgement 系統性不可靠
7. **2026-05-28 beta.27 release 7 CI iterations**:6 次解症狀(Tailwind wildcard)後第 7 才抓 root cause(addon subdir 漏 ship)。AI 自審不可信,需 mechanical CI feedback loop
8. **2026-06-02 SizeMatrix crash + 多層誤判鏈(本 session,user 追問逼出)**:`{size}` JSX-undefined story crash 隨 beta.44 ship。每層誤判都靠**機械覆核**才更正,證明 agent prose / 單一假設禁 pass-through:(a) workflow Explore agents 把 jsDoc 註解 / meta 物件當 render 改動 — Tabs/DateGrid 誤判「視覺改了」、Rating 誤歸因全域 lucide → **非註解 `git diff` + `git show <anchor>:file` baseline-state** 機械覆核才抓出全是註解/既有規則;(b)「smoke SAMPLE 才漏」誤判 → 實測 smoke `--full` 只 probed **59/945**(886 靜默 skip + 不關 page)= 假綠燈,「Failures 0」≠「全掃過」;(c)「GDrive 掛載慢」誤判 → `/tmp` vs GDrive serve 對照**兩邊 945/945** → 實為 port 殭屍。**fix(shipped beta.45)= deterministic 機械 gate**:`typecheck:stories`(stories 被主 tsc exclude → 補此 noEmit type-check;**deterministic 抓 {var}-undefined,SizeMatrix crash 真防線**)+ ci.yml gate + deep-audit A.1b step 0。**smoke 全覆蓋 coverage-gate(防靜默-skip 假綠燈)attempted 但 CI 撞牆**:no-skip + retry 讓 server 在 ~60 story 後降級 timeout → 20-min job budget 跑不完 → release run cancelled(beta.45 第 1 次發版失敗)→ **revert smoke 回原版 + defer coverage-gate**(需 robust-server / browser-recycle + 可靠測試環境;本機環境噪音〔port 殭屍 / IO〕無法可靠測 smoke = 也是「機械測試環境本身要乾淨可信」的延伸)。教訓:(1) 每「結論 / 根因」前用機械(diff / baseline / 對照實測)覆核,**禁憑 agent prose 或單一假設下結論**;(2) **改 CI gate 不能本機驗 = 禁 ship**(broken gate 比 imperfect gate 更糟,會卡 release);(3) 環境噪音會讓「機械驗證」也失準 → 測前先確保環境乾淨(殺 port 殭屍 / 隔離)。

## How to apply

**新 audit propose 必過 ground-truth test**:
- (a) catch 的 case 是「AI 看自己 code 判斷」還是「runtime / pixel / DOM / tsc / lint」ground truth?
- (b) AI judgement-based → 標 supplementary,不可作 primary defense
- (c) 取代 existing mechanical → reject(M17 SSOT 延伸)
- (d) Visual / perceptual ambiguity → 必 escalate user-screenshot

## Anti-pattern(永久 ban)

- ❌ Propose「AI X-check 取代 mechanical Y」(無論 X 看似多 elegant)
- ❌ AI self-audit own output 為 primary verdict source
- ❌ 跳 ground-truth test 直接 ship propose
- ❌ Visual perceptual decision AI 自決(必 user-screenshot)
- ❌ 把「兩 AI 比稿」當 ground truth(M31 codex collab 是 supplementary 2nd opinion,不是 mechanical truth)
- ❌ 把 template-vs-canonical pixel diff 當 SSOT drift verdict(false positive)
- ❌ 為通過 pixel diff 修 consumer 內容(違反 template demo 性質)

## 對齊原則

- M13 user 第 2 次問 = 必截圖 verify(本 rule 通用化)
- M17 SSOT 鐵律(新 layer always expand never replace)
- M20 self-improve(audit blind spot 是 M20 最大 catch 範圍)
- M22 benchmark 必 cite(AI 印象不可信延伸)
- M23 DS canonical 優先(anti-pattern hooks 攔 consumer 偏離)
- mindset #1 不取巧(AI 自審 = 取巧 shortcut)
- Toyota TPS Jidoka(機器自停 不靠 human / AI 自決)
- Linux kernel pre-submit checkpatch.pl(deterministic script,non-AI)

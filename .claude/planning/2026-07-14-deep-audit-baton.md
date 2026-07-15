# Deep-Audit 接棒總帳(baton ledger)— 2026-07-14

## 🏁 CAMPAIGN CLOSED(2026-07-14)

**全流程收官,無殘項**:待做 1-7 全 ✅(見下表)。**beta.84 已發版**(npm `latest`+`beta` = 0.1.0-beta.84;戰役 commit `9b7234bd` + internal 型別通道補完 `b7466895`)/ **WM 真綠**(lockfile bump beta.84 + CellSelect 包裝 WM `2979dc9`,verify.mjs 13/13 對 published DS)/ **本批收尾治理落盤**(Validator K + SKILL 瘦身 + knowledge-prune P0-P2 處置 + checkbox/select spec SSOT-heavy 例外標註)。唯一戰役外殘留:WM branch `2026-07-08-ds-alignment` merge/push main 由 user(solo-workflow gate,非本 ledger 範圍)。本檔轉歷史紀錄,不再更新。

**目的**:全流程狀態 SSOT。任何 session / 額度中斷後,讀本檔即可無損接續。每完成一項就更新本檔。
**規則**:所有產出必落盤(禁只在對話記憶);本檔 + `.claude/logs/` artifacts = 完整可恢復狀態。

## ✅ 已完成(全部落盤,有驗證)

| 項 | Artifact(SSOT)| 驗證 |
|---|---|---|
| 稽核覆蓋 100%(91 dim × 雙軌 + A.1b 64×2)| `node scripts/verify-deep-audit-coverage.mjs` → **exit 0** | ledger 機械驗證 |
| codex Phase B(A.1b 64 元件)| `.claude/logs/codex-phaseB/*.json`(58)+ 前期 6 | 全 genuine,零 SKIP |
| codex 判準 27 dim | `.claude/logs/codex-dim-audit/dim-*.json`(27/27)| 自癒 wrapper 4 cycles 補完 |
| codex 判準比稿裁定(259 raw→104 confirmed)| `.claude/logs/codex-judgment-reconcile/dim-*.json`(27)| M31 no-pass-through |
| A.1b 比稿(12 batches,全 64 元件)| `.claude/logs/codex-reconcile-batch{1..12}.json` | 逐條 adjudicated |
| Claude 判準 27 dim / hook residue 40 / deterministic 24 | `.claude/logs/dim-audit/` + `hook-residue/` | ledger 各 tier ✅ |
| 語言品質稽核(205 storybook 檔,23 material)| `.claude/logs/storybook-language-findings.json` | 無抽樣 |
| **Master material 總表(367 條)** | `.claude/logs/master-material.json` | consolidate script 可重生 |
| 決策研究(四要件)| `.claude/logs/audit-decisions-researched.json` + `codex-d2-debate-verdict.txt` | 世界級 cite + codex 辯論 |
| 修復 batch 1(119 條)| commit `87c22447`(working branch `2026-07-08-wm-rootcause-fixes`)| tsc 0 / build:lib 0 / stories 0 |

## 🎯 User 已拍板(不可重問)

- **D1**:DataTable `totalCount` **移除**;Calendar 週/日檢視 **保留**(標 roadmap)— *✅ 已實作(beta.84)*
- **D2**:Select 桌面 **A = 補 MUI 式 hidden input mirror**(`.claude/logs/D2-decision.txt`)— *✅ 已實作(select.tsx hidden input mirror + spec 新段,beta.84)*
- D3(ItemIcon/ItemAvatar=public slot)/ D4(範例改 `<Checkbox label>`)/ D5(spec 對齊 selected-active 加深)/ D6(Coachmark asChild 型別)= **autonomous 對齊** — *✅ 已實作(beta.84)*
- 歷史拍板(禁牴觸):MenuItem internal 可 subpath 消費(2026-06-05 Q2)/ menu selected×hover=neutral-selected(2026-07-04 Q2,僅 hover case)/ readonly 空值顯 `-`(2026-07-08)

## ⏳ 待做(2026-07-14 終更;**1-8 全完成,CAMPAIGN CLOSED**)

1. ✅ **15 條 approval-blocked 全修**(主迴圈,commit `c69334b7`;+M10 掃描抓 ScrollArea spec ×3 loose end 即修)。
2. ✅ **fix-g3 + fix-g8 + 122 dim 層全修**(finish Workflow 183 fixes,commit `9f63cc43`;驗證 tsc/build/stories/content-quality 全綠 ×2 次〔agent + 我複跑〕)。
3. ✅ **D1/D2/D3/D4/D5/D6 全落地**(D2 = select.tsx:631 hidden input mirror + spec 新段含 cite)。
4. ✅ **R1/R2/R3 世界級研究完成**(`.claude/logs/new-decisions-researched.json`)→ codex 辯論完(bq7cxq4g1),四要件齊,連同 held-8 決策項一次列 user。
5. ✅ **給 user 的最終決策清單已列 + user 全拍板 + 全落地**(beta.84 commit `9b7234bd` 記錄「全部 user 拍板決策落地」):R1 AppShell 手機 Sheet 焦點還原(WCAG 2.4.3)/ R2 Input+Textarea readonly resolved-value SSOT / R3 DateGrid weekday 密度對齊 + held-8(API 策展 A-E user 拍板「全部收窄」:tokens/* 只出編譯品 / *Meta 收 barrel / SelectProps allowlist / naked union 拆型別 / internal 退 front-door + TreeView 鍵盤拖曳修飾鍵派 v1)。
6. ✅ **收尾治理**(2026-07-14):Validator **K**(決策四要件機械閘;hook 內 letter I 已被 D3/D4/D5 chain 佔用故定 K,SKILL C.1 已對齊)/ deep-audit SKILL 288→243 行(Phase 0 detail→phase-a-workflow.md、C.1 template→triage-rubric.md,canonical 全保留)/ knowledge-prune P0+P1(P2 候選 → `.claude/logs/prune-p2-candidates.md`)/ checkbox.spec + select.spec 行數收斂。
7. ✅ **beta.84 已發版 + WM 真綠**(task #104;user push trigger 2026-07-14「確保所有任務都完美做到完整完美就push」):npm `latest`+`beta` = 0.1.0-beta.84(`npm view` 驗);internal 型別通道補完(`b7466895`,Field subpath += field-types / root barrel Internal 過濾);WM lockfile bump beta.82→beta.84 + CellSelect naked 合法化包裝(WM `2979dc9`)→ verify.mjs **13/13 真綠對 published DS**(07-10「--no-save tarball 假綠」根治)。剩 WM main push 由 user。
8. ✅ **收官文檔批(2026-07-14 末批)**:checkbox/select spec 檔頭 `@spec-budget-exception` SSOT-heavy 例外標註(cite prune-p2)/ prune-p2 spec 項標「已處置:例外標註」/ codify-principle+codify-corrections 合併案 resolved: keep separate(依 meta-patterns 既有分析)/ WM campaign memory 收官態 + `npm run sync-memory` mirror / 本 ledger 標 CAMPAIGN CLOSED。

## 附錄:approval-blocked 15 條(from wdzddtdv1 held[])

- TreeView tree-view.tsx:949 multi-selected 掉 fg-secondary(TV-1)/ :529 disabled 可鍵盤選(TV-2)/ :534+626 無 onFocus init + ArrowL/R 不 init(TV-4)/ :626 props spread 順序 footgun(TV-10)/ :643 stale 註解 + meta.sizes 空(TV-11)
- Avatar avatar.tsx:252 hoverCard role=img 吃掉 badgeCount SR(aria-label 併入 count)
- Checkbox checkbox.tsx:281 uncontrolled indeterminate 渲 Check 非 Minus(讀 data-state)
- TimePicker scroll-area.tsx:58 Viewport tabIndex=0 雙 tab stop + 鍵盤失效 / time-columns.tsx:155 懸空 aria-activedescendant
- Dialog dialog.tsx:27 docblock height=auto→autoHeight / :135 stale justify-between / :137+sheet.tsx:127 不存在 lockDensity
- AppShell app-shell.tsx:35 必傳→應傳 / _demo-helpers.tsx:196 hover 註解
- Input input.tsx:21 stale rename 註解 / :63 min-width 註解 / :25 naked 註解
- TimePicker time-picker.tsx:207 draft 註解

## 額度中斷 SOP

- codex 額度盡:driver 偵測 `CODEX-OUTCOME: QUOTA` → exit 3 → autoresume wrapper 睡 45min 續跑(自癒到滿)。
- Claude agent 額度盡:Workflow agent fail → 產出已落盤的不受影響;讀本檔「待做」+ 對應 artifact 續跑;主迴圈(Bash/Edit)不受 agent 限額影響,可手做。
- 任何新產出:**必寫檔到 `.claude/logs/` 或 commit**,禁只留對話。

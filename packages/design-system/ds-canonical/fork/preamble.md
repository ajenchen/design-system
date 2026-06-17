# DS Fork 治理 preamble(SessionStart 注入;source-generated,禁手改)

> 本檔由 build-fork-governance.mjs 從 .claude/{rules,references} SSOT 生成,path 已改 node_modules 視角。


> **你是 FORK PRODUCT 開發者**:遵循下方設計紀律(item-anatomy / SSOT 消費 / Tailwind / 命名 / 4-Family Layout)。**git 節奏照 fork 的「預覽 → 確認 → 上線」**:做完推草稿分支 → Netlify 出預覽 → user 確認 → 才合 main(詳本 repo CLAUDE.md「預覽→確認→上線」段)。**忽略的是 DS-author 的【發版/治理維護】鏈**(`build:lib` / `release:preflight` / `npm publish` / tag / GitHub Pages / codex-collab / `scripts/*.mjs` gate — 那些是 DS 維護者的,fork 不發套件、用不到)。Deep detail 看 `node_modules/@qijenchen/design-system/ds-canonical/{rules,references}` + 元件 `.spec.md`。
> **4-Family Layout**:Family 1+2(列表/選單項)見下方 item-anatomy;Family 3(Pill)見 `Button` 的 `.spec.md`;Family 4(可編輯 Field 控件)見 `field-controls.spec.md`(都在 node_modules/@qijenchen/design-system/src)。


# 設計紀律(rules,寫產品 code 前主動遵循)


---
## rules/meta-patterns.md

# Meta-Pattern 預警(31 active M-rules)

**mindset #6 的具體化**。每條吸收數十個具體 bug,是失敗記憶索引上游。任務前先過全部 M-rules(M1-M32,M27 retired 2026-05-15 → M23(c) child / M33-M35 retired 2026-05-22 → folded into M20/M7/M23(d) per `/knowledge-prune` deep audit Lens 1+2)。

## 2026-05-10 cluster cross-link(per codex Q-13 deep prune audit + 2026-05-22 fold update)

31 M-rules(M1-M32,M27/M33/M34/M35 retired)分 6 cluster(舉一反三 grouping):

| Cluster | M-rules | 共同主軸 |
|---|---|---|
| **A. SSOT-first / DS-anchor preflight** | M1 / M23(含 M27+M35 子規則)/ M29 / M30 | 視覺決策前必消費既有 SSOT;DS canonical 優先;spec.md 先 grep 找 owner;wrapper schema extends primitive;nearest same-purpose canonical wins |
| **B. Benchmark discipline stages** | M8 / M22 / M26 | 訂 rule ≥3 家對照 / 寫 spec 含 cite / propose 前 WebFetch |
| **C. Auto-integrate pipeline** | M14 / M19 / M31 | 對話結論 5-layer / trigger phrase auto-pipeline / claude-codex 5-step |
| **D. Verify / similar-bug / visual coverage** | M10 / M13 / M15 | proactive scan / user 第 2 次截圖 / visual-audit-coverable |
| **E. Propose-time discipline** | M18 / M21@watch | 4-Q 自檢 / 新元件抽象前 prop variant test |
| **F. Sharp invariants(各自獨立)** | M2 / M3 / M4 / M5 / M6 / M7(含 M34 子規則)/ M9 / M11 / M12 / M16@watch / M17 / M20(含 M33 子規則)/ M24 / M25@watch / M28 / M30@watch / M32 | sharp invariant |

`@watch` 標記(2026-05-15)= 該 M-rule 目前 absorbs 1-2 bugs(charter 要 ≥3)。1 quarter 觀察:無新 bug → demote 為既有 M-rule 子規則;有新 bug → 升 sharp keep。**2026-05-22 fold prune**:M33/M34/M35 各 absorb 1 bug → folded into parent cluster home(M33→M20 / M34→M7 / M35→M23(d)),減 3 條 M-rule 同時保留全部 invariants。Velocity 修正:本季 net add 12 rules(15 new − 3 fold)= 18 → 12 趨近 charter ≤3/quarter target,持續觀察。

**Why no merge content**:per codex Q-13「Keep M24/M25 because they are sharp, reusable state/chain invariants」+ Layer A own 認 cluster headers 是檢索輔助,不該強行 merge content(各 M-rule 已 1-line tight)。Cluster headers help 「舉一反三」without 削減 M-rule 數量。**Task #19 M21-M29 meta-merge analysis(2026-05-10 closed)**:re-audit M21-M31 全部,verdict **無 merge candidate**,各 rule sharp invariant 覆蓋 distinct failure mode(M22 implement-time cite vs M26 propose-time cite / M30 wrapper-primitive 跟 M27 framework-vs-DS / M31 collab discipline 跟 M14 / M19 auto-pipeline 各 unique scope)。Cluster table 已 cross-link,不需 merge。

## 2026-05-10 skills consolidation analysis(Task #20 closed)

**Per Anthropic「~10 sweet spot」benchmark**:DS 現有 20 skills(`node_modules/@qijenchen/design-system/ds-canonical/skills/` minus README),約 2x Anthropic typical recommend。**Verdict:無 aggressive merge candidate**,維持 20 skills justified:

| 類別 | Skills | 為何不 merge |
|---|---|---|
| Core audit | design-system-audit / visual-audit / component-quality-gate / knowledge-prune | 各 sharp trigger,invoke logs 顯示高頻(design-system-audit 6 / knowledge-prune 7) |
| Domain audit | ux-audit / performance-audit / code-quality-audit / product-ui-audit | D2/D3/D4/consumer-code dim 已 chain 進 design-system-audit |
| Workflow | prototype / new-component / delivery-handoff / story-writing / story-auto-compile-migrate | create / prototype / final-handoff / story 各 phase distinct rare-event(per knowledge-prune retire rule 例外) |
| Discipline | ensure-canonical / propose-options / codify-principle / codify-corrections / scan-similar-bugs / governance-health | trigger phrase / 4-Q gate / 5-layer artifact gen / batch log / post-fix scan / monthly metric 各 unique |
| Collab | codex-collab | M31 5-step home,unique |

**Marginal merge candidate**(留 user 後續 explicit approve):`codify-principle` + `codify-corrections` 都產 5-layer artifact,trigger 不同(live propose vs batch log)— 可合 `codify` 一統 skill。**不執行原因**:codex Q-13 sharp-rule preference + auto-mode 不 destructive 風險 + 兩 skill SKILL.md 各自 250 lines budget 內。User 後續 invoke `/knowledge-prune` 並 explicit approve 才動。

**RFC**:Anthropic「~10 sweet spot」是 typical CRUD app benchmark;DS governance complexity(31 active M-rules + 全 dim audit per design-system-audit SSOT + dual-track codex collab + 8-home 治理)justified higher skill count。每 skill 都過 knowledge-prune retire rule(6 月 fire 或 rare-event 豁免)。


| # | Meta-Principle | 能吸收的 bug 類型(舉例,非窮舉) |
|---|---|---|
| **M1** | **視覺決策前必消費 SSOT**(元件 / token / pattern / spec)。強制跑 `# SSOT 消費 canonical` 清單,沒列出 = 自創。 | `variant="bare"` 自發明 / chrome-header token 漏用 / Row 沒用 item-anatomy(詳 historical-bugs.md) |
| **M2** | **消費 3rd-party lib 必驗 rendered DOM**(不信 docs)。任何 `[&\[data-...\]]:` attribute selector 針對第三方元件前,inspect 真實 DOM 有無該 attribute。Library API(fit / zoom / wheel step)先寫 3 行 POC 驗證行為,再寫到元件裡。 | react-day-picker `data-range-*` 不存在 / react-zoom-pan-pinch fit-to-page 算錯(詳 historical-bugs.md) |
| **M3** | **Portal 逃逸 subtree context**(theme / density / provider)。任何 overlay 元件(DropdownMenu / Popover / Dialog / HoverCard)走 Portal 到 document body **不繼承觸發點的 subtree attribute**;theme 預設從 `<html data-theme>` 經 CSS 繼承(Portal 後 CSS chain 從 app root 起算)— 需要 override 才顯式 set `data-theme` on Portal Content;`data-density` 部分 overlay 刻意 lock `md`(詳 `density.spec.md`)。 | DropdownMenu 在 dark subtree 變亮 / Avatar HoverCard NameCard 文字白色(詳 historical-bugs.md) |
| **M4** | **`_Group` 元件必隔離單 item 的 fieldCtx**。當 Group 元件(CheckboxGroup / RadioGroup / SwitchGroup)包在 Field 內,其 child items **不可共用 fieldCtx.id / fieldCtx.hasFieldWrapper**;Group 必建自己的 Context 告訴 items「你在 group 裡」。 | CheckboxGroup 共 fieldCtx.id,label 全抑制 / 點擊只 toggle 第一個(詳 historical-bugs.md) |
| **M5** | **視覺 canonical 必 spec 聲明所有 state 疊加組合**。單一 state(today / selected / hover / disabled)有視覺定義不夠;**所有兩兩疊加、三疊加組合也要在 spec 有明文**。 | DatePicker today+selected 隱形 / hover+disabled ring 仍顯示(詳 historical-bugs.md) |
| **M6** | **Stakeholder-visible 產出 → 強制進階稽核才出稿**(不是 merge 後補)。任何「有視覺可以給 stakeholder 看」的產出(新元件 / 元件新功能 / 新產品頁 / 比稿)**必過進階完整稽核**(6 維 + 全截圖視覺驗證)。日常 dev 可用高效模式,stakeholder gate 不可。 | FileViewer 初版 8+ 項給人看才發現(詳 historical-bugs.md) |
| **M7** | **新 protocol / skill / rule 寫完,必反向 cross-check 既有 Meta-Principle 是否該套用**。尤其:consistency-class 的 protocol 必走「一致性類稽核必先全掃再判」(本章節);audit skill 必加「Self-improvement capture」Phase F step;Rule 觸及「canonical」「SSOT」「rationale」keyword → 必明示 substantive vs 表達層分權。**+ Sub-rule M34 (folded 2026-05-22)**:Hook detection regex 必對齊 spec wording 廣度。Triple test before merge new hook — (1) Spec rule wording 是「一般類別」(broad)還是「特定 keyword」(narrow)?(2) Hook regex 匹配「一般類別」還是只「特定 keyword subset」?(3) Spec broad + Hook narrow → **gap**,必擴 hook regex(unicode pattern / negative-list approach / counter-example DS-wide scan)。Propose 新 hook 必先寫 3-column table:`Spec wording` / `Hook regex` / `Gap?(broad-vs-narrow)`。 | principle-audit-protocol v1 漏套既有 Phase 0 全掃;2026-05-17 story name `照妳` `決策N` 等中英人話 detection regex 漏 |
| **M8** | **訂立 / 修改 cross-component canonical 前必 world-class benchmark**。任何 predicate / decision tree / taxonomy 類 spec,**必先 grep 至少 3 家世界級 DS**(Polaris / Material / Atlassian / Ant Design / Carbon / Apple HIG / VS Code / Figma 等)列對照表,再訂 rule。**絕對禁止**憑直覺開場寫 predicate,user 問才補對照。每個 category / variant / case 必附世界級 reference(實作名或 API 指向),沒有對照的 rule 視同未成熟,走 Checkpoint 3。 | item-anatomy Inline Action 疊代 4 次才有世界級對照 |
| **M9** | **Predicate / decision tree 寫完,present 前必 4 題自測**,防 membership drift。(a) 每 example 回跑決策樹;(b) cap / constraint cross-check;(c) 每 example 對 ≥3 家 world-class DS;(d) 每 category ≥1 example。任一題失敗 → 重收斂,**禁止 present**。 | Cat 1 IA 塞 endAction / FileItem sm 違 ≤24 cap |
| **M10** | **Proactive exhaustive scan**:canonical migration 完成前禁止只改「直覺相關」元件;final report 前禁止省略「我知道但沒講」的 tech debt。**Mechanical 落地**:每 fix commit 後 `/scan-similar-bugs` skill 強制 grep DS-wide。 | dismiss migration 漏 FileViewer / 7 題 silent tech debt user 一次炸 |
| **M11** | **User-perspective interactive state walk**:改完 UI 後 present 前必親自走 7 題 self-test(static / hover / focus-visible / active / keyboard / 範例真實性 / CSS 對稱)。每 UI 改動未跑 7 題就 commit = 違反。 | ListBody 修完 user 連抓 5 波 |
| **M12** | **Binary strict rule + fix-time root-invariant pre-question(「必 X」/「禁 Y」/ bug fix)前必 benchmark + invariant test**。3 題自測:≥3 家世界級一致 / counter-example scan / root invariant vs surface observation。震盪症狀(A→not A→A)= meta invariant 沒抓到,**停下 present**。**Fix-time 延伸**(2026-05-12 absorbs 原 M32(b)):visual / behavior bug 改前必 inline 答 3 題 — Q1「root invariant 是什麼?」Q2「symptom 在哪 layer?」Q3「fix 是 root-layer 還是 surface-layer?」。surface-only 修(改 symptom 不動 invariant)違反。對齊 5-whys / Toyota TPS / Linux kernel「fix the root not symptom」canonical。 | hover bg 震盪 4 次(bg-edge vs content-padding invariant);2026-05-12 cell-align fix surface-modify Field padding 不動 inline-flex `!h-full` root invariant |
| **M13** | **User 第 2 次提相關問題 → 自動截圖 verify**。當 user 就同一視覺 / 行為主題第 2 次問 / 糾正,AI 必 invoke 截圖 verify(`visual-audit.mjs --scope=component:XXX`)。第 3 次才 verify = 違反。**Corollary**:user 指定「所有 X 都要 Y」,同 session 全部做完 + 建 hook 防線。 | avatar-NameCard migration 分批拖延 user 第 2 次催才全改 |
| **M14** | **對話結論 → AUTO integrate pipeline**(不等 user 催)。每次 canonical / 設計決策 / 新 rule 結論時必執行 5-layer pipeline ≥ 3 層落地:M8 benchmark / SSOT home 識別 / spec / code / hook / CLAUDE.md / memory / 驗證。User 問「有沒有整合到 X」= M14 violation。**Governance auto-trigger**:`session_start_governance_check.sh` 檢查 hook / memory / CLAUDE.md / 上次 prune 達標 → 自動 inject /knowledge-prune directive(soft 提示;hard cap 升 BLOCKER;**deep-audit 收尾例外 = 必自動跑、禁問 user**,SSOT → deep-audit-cross-codex SKILL C.0a,2026-06-11 user 糾正 codify)。**數值 SSOT**:`session_start_governance_check.sh`(檔頭「Checks + thresholds」註解 + Check 7)+ CLAUDE.md `# 治理 canonical` 行數預算表;本 M-rule 不重述,避免 drift。 | chrome-header / dismiss / hoverCard 每個都 user 提醒才整合 |
| **M15** | **Product UI flow 必須 visual-audit coverable**。任何 stakeholder-facing flow 必含 OpenSnapshot 類 stories(`defaultOpen` / `useState(true)` / `play()`)。禁留「需真人點擊才能看到的 state」未截圖。 | Sheet / FileViewer 只截 trigger 缺 OpenSnapshot |
| **M16** | **訂 standalone card/pill 容器 canonical 必同步訂 multi-instance gap canonical**(`@watch` 2026-05-22)。3 條公式:同類 standalone → 必 gap;同類 permanent flush → 0 gap OK;混合語言 → 必取最保守 gap。Hook `check_item_list_gap.sh` 預警 + audit dim verify。**@watch 2026-05-22**:單 bug source(FileItem rich/compact)— 1 quarter 觀察是否 absorb ≥3 同類 bug,否則 demote 為 item-anatomy.spec.md 子規則。 | FileItem rich card + compact bg 連續相連 |
| **M17** | **SSOT 必可傳播**(非僅 markdown)。同值 / 同公式 hard-code 在 3+ consumer = 必抽成 token / primitive / utility class。**兩層 SSOT 架構**:底層 token(值可調)+ primitive(結構封裝 + 消費 token);世界級對照 Material/Carbon/Ant/Polaris 共識。 | mt-0.5 canonical 13 consumer hard-code 假 SSOT |
| **M18** | **Propose-time 6 題自檢 gate**(2026-05-18 升 4→6 加 Q0 + Q5)。列 option / 建議前必 inline 跑 **Q0 Pre-ASK self-verify problem 真存在**(2026-05-18 加,absorbs Sheet/inline-action/SurfaceBody 三題誤判)/ Q1 M8 benchmark / Q1' M23 DS canonical / Q2 M17 SSOT / Q3 Rule-of-3 / Q4 M10 下游吸收 / Q5 Issue 100% mapped。Reject 不列出,通過寫 6-Q 證據表。**Q0 強制動作**:propose 給 user 拍板前必 grep DS-wide + Read 相關 spec.md + Read consumer usage 確認 problem 真存在,沒 grep 就斷言「N 元件缺 X / 該 migrate」= 撤回 propose。SSOT → `node_modules/@qijenchen/design-system/ds-canonical/skills/propose-options/SKILL.md`。Hook `check_propose_pre_grep_verify.sh` 機械強制 Q0。 | 2026-05-18:Sheet 補 / 5 元件 inline-action migrate / 5 元件 SurfaceBody migrate 三題全錯誤 propose 給 user 拍板,grep 後 0 個真 gap(Sheet 已完整 / 6 元件全消費 inline action / Dialog 走 ScrollArea canonical 不該用 SurfaceBody / HoverCard 是 behavior primitive / DatePicker TimePicker 是專用 layout / Sidebar 是 chrome 不是浮層)。User verbatim「不是老早就跟你說過要我決策前請先基於我們所有的檔案包括設計原則包括 ssot 包括所有實作代碼,自主自動驗證這些問題是否真的是問題」 |
| **M19** | **Trigger phrase auto-pipeline**。「確保 / 一定 / 永不漂移 / ensure / always」trigger → 自動 5-layer ≥ 3 層落地 + M8 + M17 + M10。Substantive 走 STOP。SSOT → `node_modules/@qijenchen/design-system/ds-canonical/skills/ensure-canonical/SKILL.md`。 | story splitting 2026-04-26 user 第 N 次強調才落地 |
| **M20** | **AI 自問 best-practice + 自動 self-improve**(不靠 user 提醒)。Stop hook `rule_infra_best_practice_score`(R5 in `stop_passive_logging.sh`,2026-05-13 folded from retired `stop_meta_self_audit.sh`)每 turn 跑 score → < 80 / regression ≥ 5 log to `score-history.jsonl`;next-turn UserPromptSubmit `inject_pending_self_audit.sh` 注入 BLOCKER prompt。**Threshold 數值 SSOT**:`session_start_governance_check.sh`(檔頭「Checks + thresholds」註解 + Check 7)+ CLAUDE.md `# 治理 canonical` 行數預算表;本 M-rule 不重述具體 cap,避免多 home 漂移(2026-05-22 prune codify per Rule-of-3 violation fix)。**+ Sub-rule M33 (folded 2026-05-22)**:Stop hook overfire → AI conservative-defer 反 pattern。同 stop hook fire ≥ 5 次 within session → AI 自動 hedge / 撤回 claim / 「下個 session」defer **可做工作**。真理由 vs 偽 prereq 區辨 — (a)真 prereq 缺(cross-frame test fixture 等)= 具體 deliverable need;(b)偽 prereq(「context budget」「省工」「下個 session」)= conditioned hedge,user 反覆催 = 真理由不存在。**Rule**:AI reply 含「下個 session」「context budget」「省工」keyword 且前 1 turn user 已拍板「全部做完」/「繼續」/「沒理由不做」→ BLOCKER。對齊 Atlassian「stop using vague defer」+ Linux kernel patch review。 | user 10 次問「best-practice 嗎」直到外部 benchmark 確認真 gap;2026-05-13 claim-verify-gap stop hook fire 12+ 次 → 我每 reply 自動 hedge → user 多次糾正「沒理由不做」 |
| **M21** | **新元件 / 新 sub-component 抽象前必過 prop variant test**。當新元件名 = `<Existing>+suffix`(Time / Range / Color / Light / Dark / Filled / Outline / Compact / Rich)→ 強烈 signal 應為 prop variant on `<Existing>`。3-test 通過才能分(全失敗 → prop):(1) `<Existing>` 加 prop 無法達成同 DOM/behavior?(2) ≥3 家 world-class DS 用分離元件而非 prop(必 cite source)?(3) value 結構或 contract 真的不同(如 Range = [start, end])?Hook check_premature_abstraction(retired/未實作;mindset enforcement)。 | DateTimePicker 從 DatePicker 拆 → 撤回合併 `<DatePicker showTime>`(2026-05-02);DataTableFilterPanel 5-file → 撤回 sub-file pattern |
| **M22** | **Benchmark claim 必附 inline source citation**(不可憑印象)。寫 spec / tsx 含「Ant / Material / Polaris / Atlassian / Carbon / shadcn / Radix」等 world-class DS claim,必同段附:(a) inline URL(domain 對應 DS 官網 / GitHub source);(b) GitHub source path + line ref `#L42`;(c) screenshot reference `snapshots/...`;(d) 顯式撤回 `@benchmark-unverified`。Hook `check_benchmark_citation.sh` 機械化警告(P1 soft)。每次 implement 前跑 WebFetch 取真 source,不憑印象解碼。 | claim「Ant showTime range = 2 calendars」憑印象,實證 source code `multiplePanel = false` = 1 calendar(2026-05-02 鬼話事件)|
| **M23** | **DS 內既有 canonical 優先於外部 benchmark**。寫 visual decision(color / size / spacing / typography / state)/ prop name namespace 前必先 grep DS 既有 codified token / variant / pattern / prop;命中 → 必對齊;沒命中 → 才引 world-class + 同步補 canonical。**禁止**:外部 benchmark(M22 cite OK)直接覆蓋 DS 內已有 canonical。Mindset #2「優先消費既有」的 visual layer。判斷流程:(a) grep 該屬性 / prop 既有 token/variant/usage;(b) 命中 canonical?有 → 用,沒 → 走 M22 cite 然後 codify;(c) **prop name conflict 子規則**(former M27,2026-05-15 collapsed):外部 framework prop name(TanStack `size` / Radix `disabled` / dnd-kit attrs 等)跟 DS 既有 prop 同字不同義 → wrap-and-rename(DS-internal naming + pre-process map);(d) **nearest same-purpose canonical wins 子規則**(former M35,2026-05-22 folded):寫 stories / UI composition wrap 既有 primitive 前必先 grep + Read primitive 的「完整佈局」production canonical story(eg. `sidebar.stories.tsx#IconCollapse`)抄 archetype 結構 / helper / variant — 不准憑記憶寫 simplified mock。**Cite 存在 ≠ consume 落實**(codex 2026-05-20 verdict)。最相近同目的 canonical 用法 > 泛用 component spec / 寬鬆 pattern wording。**手刻浮層 / chrome header 子規則(2026-06-04 加)**:做「像 popover / dialog 的浮層面板」前必先 grep + Read `patterns/overlay-surface`(SurfaceHeader/Body/Footer)+ `Popover`(chrome token + PopoverHeader/PopoverTitle)SSOT;**手刻 `<div px-loose border-b border-divider>` header 或 `<div rounded bg-surface shadow-elevation>` 殼 = drift**,必消費 primitive。Registry SSOT `node_modules/@qijenchen/design-system/ds-canonical/references/story-baseline-registry.json` + hook `check_story_invariants.sh R8 story_archetype_registry` **+ R9 hand_craft_overlay_header(零誤判 px-loose+border-divider 簽名,BLOCKER)**。**forcing-function 教訓**:M1/M23(d) 是 mindset,但 mindset 沒有完整 hook 兜底 = 紙老虎(會憑印象手刻);新場景若既有 hook 無 antiPattern 覆蓋 → 補 hook rule 才算落地。 | 2026-05-03 chevron color:DS `text-foreground` (icon-only Button neutral-9 85%) vs 我憑「Ant 5 家 muted」覆蓋 → 自開新 tier 違反一致設計語言。2026-05-06 column width:DS 49+ 處 `size: 'sm'\|'md'\|'lg'` density vs TanStack `size: 280` px = 同 prop 不同義 → `meta.width` wrap。2026-05-20 AppShell-vs-Sidebar drift:simplified mock + jargon + wrong variant + 不消費 primitive props。**2026-06-04 upload-manager 面板手刻 header + 殼**(`py-2`≠`py-tight` / `rounded-md`≠`lg` / `border-divider`≠`border` / `bg-surface`≠`raised`),既有 3 道網全漏(R1-C 要 absolute+dismiss / `_chrome_header_handcraft` skip stories / R7-R8 只比已註冊 primitive 名)→ adversarial workflow 抓 + 加 R9 補洞。Hook `check_datatable_invariants.sh(r2 folded,2026-06-11)` + `check_story_invariants.sh R8/R9` |
| **M24** | **State 顯著性 precedence:disabled > muted > emphasis**。元件在 disabled state 時,內部所有文字載體(label / value / placeholder / icon)統一切 disabled token(`text-fg-disabled` neutral-6),**不**繼續 muted token(`text-fg-muted` neutral-7)。muted 是裝飾,disabled 是語意 state — state 勝 emphasis。同理:error / warning state 內 placeholder 應對應 state token。Hook `check_field_family_invariants.sh` A.4(原 check_disabled_placeholder_color folded,live P1 stderr)。 | 2026-05-04 5+ violation:`bareInputStyles` 永遠 muted / `select.tsx` 3 處 plain&tag empty 不分 mode / `textarea.tsx` 同;Input.tsx 唯一做對。User 5+ 次糾正才 codify |
| **M25** | **Layered chain invariant 必整鏈 forward(viewport-aware overlay scroll 範例)**。Overlay surface(Popover / HoverCard / Dialog / Sheet)的 viewport-aware scroll 機制要求 root → SurfaceBody 之間**所有中間 wrapper 都 forward `flex flex-col h-full`**;任何中間 div 沒 forward → SurfaceBody flex-1 失效 → body 不 scroll。同類 chain pattern:density 透傳 / fieldCtx 鏈 / theme subtree(M3 portal 逃逸對偶)。Hook `check_pattern_invariants.sh` C.1(原 check_overlay_panel_scroll_chain folded,live P1 WARN)。 | 2026-05-04:Filter / Sort panel root `<div w-[640px]>` 無 flex-col → user 縮 viewport 時 body 不 scroll。NameCard 因自設 max-h flex-col 才繞過(無中間 wrapper) |
| **M26** | **Behavior / visual canonical decision 前必跑 WebFetch + WebSearch 取 ≥ 3 source,不可憑印象 propose**。M22 升級版 — M22 管「寫 spec / tsx 含 claim 必附 cite」(實作後),M26 管「propose / 決策前必先 fetch」(實作前)。Pipeline:(1) WebFetch 3 家世界級 source(Atlassian / Material / Polaris / Ant / Carbon / Apple HIG / shadcn / Radix);(2) 全 403 → WebSearch fallback 用 snippet,**明示「search-only confidence」**;(3) WebFetch + WebSearch 都失敗 → STOP propose,告知 user「無法 verify,要看 screenshot/實機」。Hook `check_propose_without_benchmark.sh`(2026-05-26 backfill — 前期 doc claim 但 file missing;UserPromptSubmit 偵測 user prompt 含 propose / visual / behavior decision keyword + 近 20 turn WebFetch/WebSearch < 2 → soft inject 提醒)。 | 2026-05-05:user 反覆糾「為什麼每次都沒 webfetch 只憑印象」— Jira drag handle / cell display 兩題我憑印象 propose 多輪;升級成硬規範 |
<!-- M27 retired 2026-05-15(per /knowledge-prune D3 audit):self-flagged「M23 子規則」 → collapsed into M23 sub-bullet (c) "framework prop name namespace conflict"。Original case (TanStack size vs DS density) + hook `check_datatable_invariants.sh(r2 folded,2026-06-11)` retained 在 M23 children。 -->

| **M28** | **Solo-work git ops 必先 grep canonical**(mindset #2 AI-ops 子規則)。AI 自己 git/branch/PR/merge ops(`git checkout -b` / `gh pr create` / `git push origin main` / `mcp__github__create_pull_request` / `mcp__github__merge_pull_request`)前必 grep `.claude/memory/feedback_solo_dev_workflow.md` + CLAUDE.md `# Git solo-work canonical`,**不憑直覺反射開新 branch / 開 PR / 自決 merge**。Solo work 鐵律:1 chat = 1 working branch / no PR / 等 user「push」 trigger 才 merge main。Hook `check_solo_workflow.sh` 機械化攔(R1 第 2 個 branch / R2 PR creation / R3 merge 無 user trigger keyword)+ override `CLAUDE_BYPASS_SOLO_WORKFLOW=1` audit-logged。 | 2026-05-08:同 session AI 開 5 branch + 2 PR (#7 #8),user 第 3 次糾正才升 mechanical;memory file 2026-05-04 codified 但 markdown 級 + AI 沒 grep 直接憑印象 = mindset #2 違反 |
| **M29** | **DS Anchor Preflight invariant — 視覺 / 結構 propose 前必 grep `*.spec.md` 找 owner SSOT**。動 component / pattern / token 視覺結構前,**必先**:(a) `rg <touched component> + <behavior keyword>` in `node_modules/@qijenchen/design-system/src/**/*.spec.md` (b) 出 **3-column owner table**(`candidate owner spec` / `canonical sentence/table row` / `conflicting code/comment if any`)(c) 若 spec ≠ code → STOP 寫 RFC 不直接 propose implementation。沒 3-column = anti-pattern,提案不被接受。SSOT index `node_modules/@qijenchen/design-system/ds-canonical/references/ssot-index.md`(high-risk interface owner mapping)Step 0.1 先查再 grep verify。Hook `check_ds_anchor_preflight.sh` soft warn。codex-collab/SKILL.md Step 0.1 mandatory pre-grep。對齊 Carbon「design spec is source of truth」+ Atlassian「system-wide coordination first」。 | 2026-05-08:Claude+Codex 連 5 round 跳過 spec anchor pre-grep,直覺加 primitive(D path / Path A);user 抓「為何沒研讀設計原則」 |
| **M30** | **Wrapper-vs-primitive schema unify invariant — wrapper API option / config schema 必 `extends` primitive SSOT,且 wrapper 內部轉換 mapping 必 forward 全 primitive surface field**。Primitive(`SelectMenuOption` / `MenuItemProps` / `ItemAnatomyProps` 等)宣告 SSOT 後,所有 wrapper(`Select.SelectOption` / `Combobox.SelectOption` / `PeoplePicker` 等)若有同類 schema,(a) 用 TypeScript `extends primitive` 機械繼承,**不可平行 declare** weak schema(同名 / 部分欄位)(b) wrapper 內部 `xxxToYyy()` mapping 必 forward 全 primitive surface field(不可只 forward `value` + `label`,silently drop avatar / description / disabled 等)(c) wrapper-only field 加在 `extends body`(不污染 primitive)。Hook `check_wrapper_primitive_schema_drift.sh` 機械強制(P0 BLOCKER):grep `export interface .*Option \{` cross components/,同名 ≥ 2 處且未 `extends` primitive → BLOCK。對齊 Polaris ChoiceList / Material Autocomplete / Carbon Dropdown wrapper-vs-primitive schema-extension idiom。 | 2026-05-10 PeoplePicker multi-mode 漏 avatar:`Combobox.SelectOption = { value, label }` weak schema(跟 `Select.SelectOption` 同名不同 fields)+ `Combobox.menuOptions` mapping 只 forward 2 fields → dropdown rows 永遠純文字。user 抓「為什麼之前會把 people picker 改壞 + 還有沒有其他東西也改壞」。Round 1 commit `561945b` 修(Combobox extends + forward 全 field)+ Round 2 codify。 |
| **M32** | **Audit script 必 pixel-quantified verify ≠ attribute existence**(2026-05-12)。Audit 必驗 `rect.top / .left / .height` numeric pixel,**不**可只驗 `getAttribute('data-state')` / `class.includes(...)` = false-positive trap(DOM-pass ≠ visual-pass)。對齊 Material X-DataGrid / AG Grid playwright pixel snapshot / Polaris visual diff canonical。Hook `check_pixel_quantified_audit.sh` 機械強制(scans `getAttribute(` without paired `getBoundingClientRect(`)。**+ Sub-invariant(2026-05-30,doc-claim layer)**:story/anatomy/a11y/spec 的**文字宣稱 ≠ code 真實**——audit 必 adversarial **讀元件 .tsx +(其 wrap 的 Radix/cmdk/react-day-picker 等 lib)source**,逐句驗 keyboard map/ARIA role/focus 行為/prop 存在性/native-vs-custom;prose-skim「looks fine」= false-pass(prose-pass ≠ source-verified)。**「無 code 改動」≠ 可跳過**。`/deep-audit-cross-codex` A.1b + CP-A1b + report-validator F 機械強制。Anchor:2026-05-30 獨立 adversarial 抓 403 findings/64 單元/202 FALSE_CLAIM(前期 prose-skim story dim 全漏);prop-existence deterministic detector 因 passthrough over-flag 證實此類本質需 LLM 讀 source → 用 mandatory-dim + report-validator 保證真跑。**Split note**:原 mega 8 sub-invariants 拆 4 home — (b) fix-time root-invariant → M12 extension / (c)(d)(h) batch + parallel + claim-verify → `/bug-fix-rhythm` skill / (e) tool preflight(CLI binary 必跑 4-test discovery:which / npx / package.json / auth.json,禁短路「not installed」假警報)— 原 memory `feedback_tool_binary_preflight_sweep.md` 已 retire,invariant 一行收容於此 / (f) ship gate → CLAUDE.md `# 稽核 canonical` / (g) Layer marker → M31 + hook。git blame 2026-05-12 commit 留 audit trail。 | 2026-05-12 4 audit-vs-visual gap absorbed:cell-align / divider 2px / breadcrumb tooltip / row-alignment 全 audit「Δ=0 ALL PASS」但 user 抓視覺壞(詳 historical-bugs.md)。|
| **M31** | **Adversarial dual-track 5-step canonical**(2026-05-10 user directive,verbatim quotes → `memory/feedback_codex_dual_track_synthesizer.md`)。**Step 0 入口 gate**:Claude 自試(grep / read source / cite DS canonical / WebFetch)完;啟 codex collab criteria 兩種:(a)自試卡 root cause / design tradeoff,OR(b)user 明確 keyword「跟 codex 討論 / 比稿 / 辯論 / dual-track」。**禁** auto-fire。**Step 1-5**(啟動後每題必過):(1)各自熟讀 spec/canonical/source(M29 anchor pre-grep + M23 既有 canonical 優先)(2)各自驗證(`tsc -b` + invariant + audit;codex `exec -s read-only`)— **不可只一方 verify**(M20)(3)各自視覺稽核(playwright + DOM inspect + pixel-level)(4)各自 3-column cite propose(`spec.md path:line / 引文 quote / reasoning`)— hand-wave 無 cite 自動撤回(5)整合「完美完整版本」**not pass-through**:agree → synthesize 補對方缺漏;disagree → cite battle,evidence stronger 勝。**禁**:pass-through codex propose(M28「被牽著走」);commit 無 3-column cite verdict。Hook `check_codex_collab_5step.sh` 機械化攔(P1 soft)。對齊 RFC 學術同儕審查 / Linux kernel-mailinglist cite source / Google ML eng-design-review。 | 2026-05-10 Issue 8 cell border:codex propose「Field edit border 透明」Claude pass-through ship → user「被 codex 牽著走」→ cite battle: `field-controls.spec.md` state machine + `item-anatomy.spec.md` cell 4-edge grid not in Field scope → 落地雙 owner;Issue 11 同 pattern cite battle ship retire + RFC backfill。 |
<!-- M33 retired 2026-05-22(per /knowledge-prune deep audit Lens 1+2):folded into M20 as sub-rule「Stop hook overfire defer anti-pattern」。Original session context(2026-05-13 claim-verify-gap)+ hook `stop_self_audit.sh` P0 detection retained at M20 entry。Single-bug rule → 與 M20 同類「AI self-correction under feedback signals」合併。 -->

<!-- M34 retired 2026-05-22(per /knowledge-prune deep audit Lens 1+2):folded into M7 as sub-rule「Hook detection regex 必對齊 spec wording 廣度」。Original Triple test + 錨例(story-rules.md name field detection)retained at M7 entry。Single-bug rule + same-class「rule-authoring hygiene」與 M7 合併。 -->

<!-- M35 retired 2026-05-22(per /knowledge-prune deep audit Lens 1+2):folded into M23(d) as sub-rule「Nearest same-purpose canonical wins」。Original verdict(codex 2026-05-20「Cite 存在 ≠ consume 落實」)+ Triple test + registry SSOT + hook R8 retained at M23(d)。Single-bug rule + same-class「優先消費既有」與 M23 合併。 -->

## 判斷 meta-principle 是否漏寫的 test

- 同類 bug 一年內被糾正 3 次 → meta-principle 漏寫或沒執行,檢討本清單
- 某 bug 跟現有 M-rules 任一條對不上 → **先評估 meta-merge 既有 M-rule(velocity ≤ 3/quarter,單 M-rule 必吸收 ≥ 3 prior bugs)**;真無上游覆蓋才考慮新增 M-rule。M-rule 不該無限膨脹

## 與失敗記憶索引的關係

Meta-principle 是**上游**(預防);具體 bug 歷史詳解移到 `node_modules/@qijenchen/design-system/ds-canonical/skills/design-system-audit/references/historical-bugs.md`。CLAUDE.md 只留 meta-principle one-liner anchor + pointer。


---
## rules/ui-development.md

---
paths:
  - "**/*.tsx"
  - "**/*.ts"
  - "node_modules/@qijenchen/design-system/src/**"
  - "src/explorations/**"
  - "src/app/**"
---

# UI 開發 + Tailwind + Token + Props 命名規則(path-scoped)

僅在編 `.tsx` / `.ts` 或 DS / explorations / app code 時 load。

## Public component vs Internal primitive canonical(SSOT,2026-05-23 user 拍板;**2026-06-06 refine 為 intent-based,retire 舊「空 render 測試」**)

**唯一判準 = 「DS 是否想讓 consumer 直接 import 來用它」(public-API intent)** —— **不是**「空 `<X/>` 能不能 render 出有意義 UI」。世界級實證:MUI Base 官方「**requiring composition and styling does NOT make something internal — these are explicitly public primitives**」;Atlassian Primitives(Box/Stack/Inline)/ Bootstrap input-group / Ant Space.Compact 皆 public 卻需 compose。

**Public**(consumer-facing):DS 想讓 consumer 直接用的東西,**包含**:(a) 成品元件 `<Button>` / `<Avatar>` / `<Dialog>` / `<DataTable>` / `<Select>`;(b) **組合 primitive —— consumer 把自己內容塞進去 / 自接 callback 才完整**:`<FieldControlGroup>`(塞 field controls = Bootstrap input-group idiom)/ `<ResizeHandle>`(接 drag math = VS Code/Figma resize idiom)/ `<ChromeHeader>`(自建 chrome header chrome,follow `header-canonical` anatomy = 對標 item-anatomy 的公開 anatomy primitive)。**「需要 children / 接線 / 組合」是正常 public 用法,不是 internal**。判斷訊號:benchmark 對標 consumer-facing primitive / spec「何時用」是 consumer 場景 / 有 standalone 用法 / export 給 consumer。

**Internal primitive**:**只有 DS 內部其他元件會用、consumer 永遠不碰**(consumer 用 wrapper 而非它)。Examples:`<SurfaceHeader/Body/Footer>`(只 Dialog 內部)/ `useOverflowItems` hook / `<ItemIcon>` / `<ItemAvatar>`(只 MenuItem 內部 slot,consumer 用 `<MenuItem>` 不用裸 slot)。判斷訊號:無 consumer 場景 / 只被其他 DS 元件 import / 是別元件的 sub-part/slot/chrome。

**決策(verifiable)**:
- 問:DS 想讓 end-user 在自己 app 直接 import 並用它嗎(看 benchmark / 何時用 / 是否 export 給 consumer)?
  - YES(**即使需要 compose/wire**)→ **public**
  - 只有 DS 內部元件用、consumer 用 wrapper 不碰它 → **internal**
- ⚠️ **禁用舊「空 render 測試」當判準**(2026-06-06 retire):它把 composition primitive(`<FieldControlGroup>` 空 = 透明 div)誤判 internal。anchor:2026-06-06 我用機械測試(空 render / 0-current-usage / 需接線)連環誤判 FieldControlGroup·ResizeHandle 為 internal,user 抓「它明明是 Bootstrap input-group / VS Code resize 那種 consumer 直接用的 primitive」。**「現在 DS 自家沒用到」≠ internal**。
- **note(pattern guidance / anatomy 參照)**:`action-bar`(組合指南,**無 component**)、`item-anatomy`(anatomy 參照 doc)不是「元件」,不走本判準 —— 它們是**可見的設計參照 Pattern**(per `patterns/README.md` charter)。

**Folder + storybook canonical**:
- public:`components/<Name>/` OR `patterns/<name>/`(frontmatter 無 `internal: true`),storybook title `Design System/Components/<Name>/...` OR `Design System/Patterns/<Name>`
- internal:in-place `components/<Name>/` 或 `patterns/<name>/` + frontmatter `internal: true` / `- isInternal`(主路徑;現行 11 個 internal 單元全走 frontmatter,`components/Internal/<Name>/` folder 路線同樣支援但目前無住戶),storybook title `Design System/Internal/<Name>/...` OR `Design System/Internal Patterns/<Name>`(end-user 設計師 default 過濾掉,DS contributor 看 reference 用)
- export jsDoc 加 `@internal` marker(IDE intellisense 警示 end-user)
- **Root barrel front-door 排除(2026-06-05 dim-72 SSOT,user Q2 拍板)**:internal 元件/pattern **不進** `node_modules/@qijenchen/design-system/src/index.ts`(root barrel = 直接 front-door),**只**經 per-component subpath `@qijenchen/design-system/{components,patterns}/<Dir>` 取用 —— 對應 user 原則「internal 要**另外包裝過 + 自行確認**才可用,不得直接 front-door 使用;public 才可直接用」。SSOT = spec frontmatter isInternal;機械 = `gen-design-system-barrel.mjs`(生成時自動排除)+ `--check`(release:preflight drift gate)。改 public/internal → 改 frontmatter 後重跑 generator。

**對齊世界級**:Polaris 「Building blocks」(public) vs「layout primitives」(internal)/ Material UI `@mui/material`(public)vs `@mui/utils` `@mui/system`(internal hooks/primitives)/ Atlassian `@atlaskit/<component>`(public)vs internal `<unstyled>` primitives / Carbon turnkey components + internal utilities / Apple HIG「Presented controls」vs「implementation primitives」 共識。

## 建立 UI 前必讀

**先 `ls node_modules/@qijenchen/design-system/src/{components,patterns}/`**。必查 spec:Tokens(`tokens/{color|typography|density|uiSize|layoutSpace|elevation|radius}/*.spec.md`)/ Row + List item(`item-anatomy.spec.md` Family 1+2 SSOT)/ Action bar / Overflow / Overlay(`patterns/{action-bar,horizontal-overflow,overlay-surface}/*.spec.md`)/ Field(`components/Field/*.spec.md`)。

**既有 primitive 優先消費**:命中既有 → 必消費不 hand-craft。**自我檢查**:icon+text 垂直 → `<Empty>`;橫向 row → `<MenuItem>` + slot(消費 item-anatomy);chrome header(toolbar / page top bar / panel 標題列)→ `<ChromeHeader>`(消費 header-canonical,讀其 spec + `Patterns/Header Anatomy` story);浮層 → `overlay-surface`;跨 OS 捲軸 → `<ScrollArea>`;鎖長寬比 → `<AspectRatio>`。完整對照 → `node_modules/@qijenchen/design-system/ds-canonical/references/build-ui-canonicals.md`。

## UI 開發 4 條核心

必重用既有 `components/` / 必用 design tokens(禁硬寫色/字/間距/圓角)/ 建新 UI 前查 pattern / 用 `cn()`(`@/lib/utils`)合併 Tailwind class。

深度規則 → `node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md`(slot 幾何 / Padding source / Icon size 3 層)。

**一句話 pointer**:
- 新 row 元件 → `patterns/element-anatomy/item-anatomy.spec.md`「自我檢查」
- 清 unused imports / export 異動後:`npx tsc -b` → grep `export {}` → `npm run storybook` → 互動驗
- Inline Action vs Button → item-anatomy.spec.md「Inline Action 設計規格」
- 陰影:必 `--elevation-*`;禁 `shadow-sm/md/lg/xl/2xl`
- 視覺容器 breathing:有邊界 → 必 inner padding

## Tailwind 5 條核心(每條過真實 bug,詳 `node_modules/@qijenchen/design-system/ds-canonical/references/tailwind-gotchas.md`)

1. **CSS variable 必 `var()` 包覆** — `w-[var(--foo)]` 而非 `w-[--foo]`(v4 silent 失效)
2. **自訂 utility 必在 `lib/utils.ts` 註冊 group** — 否則 tailwind-merge 誤判 strip
3. **禁 `shadow-sm/md/lg` / `text-xs/sm/base` / 硬寫色值** — 用 `shadow-[var(--elevation-N)]` (N ∈ {100,200},+`-hover` 變體) / `text-body`
4. **禁 shadcn compat alias**(`bg-popover` / `text-muted-foreground` / `bg-accent` 等)— 用 direct token
5. **禁 primitive 色名作 utility**(`bg-neutral-3` / `text-blue-6`)— 用 semantic utility 或 `bg-[var(--color-blue-6)]`

## Token 命名 4 條硬規則

1. **對齊既有 family**(不孤立發明)— 詳 `tokens/color/color.spec.md`
2. **不混語義與色名**:Tag/Avatar 用 primitive(`var(--color-deep-orange-1)`);Button/Checkbox 用 semantic(`var(--error-subtle)`)
3. **新增語意色相**走 `tokens/color/color.spec.md`「新增語意色相流程」SSOT。本系統採 **Atlassian-style Semantic State Token**
4. **禁止**:籠統命名 / 孤立命名 / 自創縮寫 / Primitive 帶語意 / Semantic 帶色相 / Categorical 中間層(已廢除)

## 元件 Props 命名

**按「是什麼」命名,不按「在哪裡」命名**(Material Chip / Ant Tag idiom):
- slot 只接 icon → `startIcon` / `endIcon`(型別 `LucideIcon`,元件控尺寸)
- slot 接任意視覺 → 描述內容類型(`avatar`,型別 `ReactNode`)
- slot 是行為 → callback(`onDismiss`,元件渲染互動 + 樣式)
- ❌ 禁 `prefix` / `suffix` / `left` / `right`(位置名不傳達本質)

**4 名關閉 / 移除 callback**(詳 `node_modules/@qijenchen/design-system/ds-canonical/references/props-naming.md`):
`onClose` / `onDismiss` / `onRemove` / `onClear` 各有語意不合併。

**Badge 命名按放置**:`badge`(inline)/ `overlayBadge`(疊視覺重心 iconOnly)/ `badgeCount`(Avatar count)/ `status`(Avatar presence dot)。

**Icon canonical**:Overflow `MoreVertical` / Breadcrumb ellipsis `MoreHorizontal` / Close `X` / 成功 `Check` / 警告 `TriangleAlert` / 資訊 `Info`。

## shadcn 元件規範

**結構**:每元件 `{name}.{tsx,spec.md,stories.tsx,anatomy.stories.tsx,principles.stories.tsx}`。tsx 用 forwardRef + cva + VariantProps + cn() + `{Component, componentVariants}` export。Import `@/design-system/components/{Name}/{name}`(無 barrel)。`npx shadcn add` 後**立刻 grep 移除 shadcn compat alias**。

**cva 適用**:className-only 差異 → cva;style 物件 → object map + `style={{}}`;不同 JSX 樹 → conditional rendering。

**元件不得自包全域 Provider**(Tooltip / Theme / Toast / Portal)— 由應用層統一設定。**判斷**:Context 是行為狀態(open / size)→ 可包;全域外觀配置(delay / theme / portal / variant defaults)→ 禁止。


---
## rules/story-rules.md

---
paths:
  - "**/*.stories.tsx"
---

# Story 規則(path-scoped)

僅在編 `*.stories.tsx`(showcase / anatomy / principles 三層)時 load。
**完整 workflow → `/story-writing` skill**。

## 三層定位

| 層 | 檔案 | Canonical | Hook | Audit Dim |
|---|------|-----------|------|-----------|
| 1 展示 | `*.stories.tsx` | trait-based v2 | `check_story_invariants.sh` R3 category | 29 |
| 2 設計規格 | `*.anatomy.stories.tsx` | 6-canonical(Overview / Inspector / ColorMatrix / SizeMatrix / StateBehavior / Accessibility)| `check_story_invariants.sh` R1 anatomy | 13 |
| 3 設計原則 | `*.principles.stories.tsx` | Polaris-aligned ≥ 2 of {WhenToUse / WhenNotToUse / Vs*Rule / ContentGuidelines};v3 預設整合 `UsageGuidance` 單一 export(Polaris/Material/Ant 共識) | `check_canonical_propagation.sh` E.1 principles | 30 |

## Title 命名

**2 namespace canonical**(2026-05-28 codify per template create-app duplicate-id bug anchor):

| Repo / Path | Title pattern | 用途 |
|---|---|---|
| **DS repo** `packages/design-system/**/*.stories.tsx` | `Design System/{Tokens|Patterns|Components|Internal}/{Name}/{展示|設計規格|設計原則}` | DS 元件 / token / pattern building block |
| **Consumer apps**(template / fork repos)`apps/**/*.stories.tsx` | `Apps/{app-kebab-name}/{Page Purpose}` | 產品 UI composition demo(eg. `Apps/order-dashboard/AppShell Dashboard`)|

**Why 不統一**:DS 是 building block library(可重用元件),consumer apps 是 product UI 真實 composition demo(整頁、整 flow)。Namespace 不同 = Storybook sidebar 兩塊清楚分區。

**Universal rule**:第一層英 / PascalCase 或 kebab-name / 子頁中文 / 子頁前不加元件名(❌ `MenuItem 展示` → ✅ `展示`)。

**Template create-app 機械強制**(2026-05-28 ship):`scripts/create-app.mjs:patchStoryTitles()` 遞迴改 copied apps 內所有 `*.stories.{tsx,ts,mdx}` 的 `title: 'Apps/template/...'` → `Apps/<new-name>/...`,**防 Storybook duplicate id**(e2e verify-flow-test anchor 抓到 4 collisions)。

**Internal vs Components 三 test**:(1) 有預設視覺?(2) 直接 `<X>` 有視覺?(3) 所有消費者都包 wrapper?三題傾向 Internal → `Internal/`。**例外:compound-component public API**(`Dialog.Root/Trigger/Content` / `Field + FieldLabel + FieldError + FieldDescription` 等定義 sub-component 給 consumer 拼的 documented composition pattern)豁免三-test — 它**定義** sub-components,不是被 wrap 的零件。對齊 Radix Dialog / MUI FormControl + InputLabel + FormHelperText / Mantine Input.Wrapper compound idiom。

**Title canonical 4-part exemption**(2026-05-16 codified):**Tokens / Patterns** 為 single-file showcase(無 anatomy/principles 對應)→ 3-part title 是 intentional convention(`Design System/Tokens/{Name}` / `Design System/Patterns/{Name}`),不是違反。**Components / Internal** 必 4-part(`/{Name}/{展示|設計規格|設計原則}`)因有 3 stories 對應 file 需 subpage 分流。

**Patterns `{Name}` 必 spaced Title Case**(2026-06-12 codify,命名 3 重 test 全過):多字 pattern title 用人話 spaced(`Action Bar` / `Item Anatomy` / `Resize Handle`),非 PascalCase — title 是 reader-facing label,與 code identifier(`ResizeHandle`)雙軌分工;對齊 Atlassian「Avatar group」/ Polaris「Empty state」/ Carbon「Date picker」catalog spaced idiom。Tokens 第三層維持與 token 資料夾同名構詞(`LayoutSpace` ← `layoutSpace/`),不在此 rule scope。

**MenuItem-as-listbox-child 鍵盤 delegation 例外**(2026-05-16 codified per Combobox spec.md L130-142):MenuItem `<div role="option">` 不需自帶 Enter/Space handler — 由 parent listbox(Combobox / SelectMenu / DropdownMenu)的 hidden native `<select>` handle 鍵盤導覽(對齊 Material/Atlassian/GitHub mixed-control「單 native tab stop + 多 mouse click surface」 canonical)。MenuItem 為 building block 不該重複 handler。

**Story `name:` field 必中文人話**(no auto-compile 豁免):`compile-stories.mjs` auto-generate 已產生中文 name(如 `'元件總覽'`)。Manually-written stories `name:` 用純英文 implementation label(`'Default'` / `'Pressed'` / `'SizeMatrix'`)= drift,**必 humanize 中文**。Export const 維持 PascalCase(英)為 code identifier,**`name:` field 為 reader-facing 必中文**(術語例外:`FAQ` / 元件名 `Avatar/Tooltip` 等專有可保英)。

## 範例最高準則

精簡幹練、0 重複、每 story earn its existence(audit Dim 24/25/28/29/30 抓)。

**Earn-existence 2 test**:(a) 教別 story 沒教的原則?(b) 移除後 spec 理解 degrade?兩題皆 NO → retire。

**Production-grade composition fidelity**(2026-05-20 codify per codex anti-drift D2):
- 寫 stories wrap **既有 primitive**(`<Sidebar>` / `<ChromeHeader>` / `<Dialog>` / `<DataTable>` 等)時,**必先 grep 該 primitive `*.stories.tsx` 找「完整佈局」類 story**(eg. `sidebar.stories.tsx IconCollapse` / `data-table.stories.tsx WithBulkActions`),Read 其 helper(`WorkspaceBrand` / `UserFooter` / `PageContent` / toolbar pattern 等)**當 baseline reference**
- 禁直接寫 simplified mock(`<SidebarHeader><span>name</span>` / `<SidebarMenuButton><Icon className="size-4">` / `<ChromeHeader><span flex-1>title</span>`)= drift
- 標 `// @story-baseline: <path>#<StoryName>` 在 stories.tsx 檔頭,reference 哪個 baseline。Hook `check_story_invariants.sh R7` 攔 drift(2026-05-20 ship)。

**拆分原則**(對齊 Polaris / Carbon / Storybook):
- 不同 affordance 必分(IconOnly / FullWidth)
- AllVariants & AllSizes 對照各 1
- 同 affordance 內 prop variations 用 Controls 不另開(❌ `WithStartIcon`+`WithEndIcon` → ✓ `WithIcon` grid)
- Compound 有 new constraint 才分

**展示 v2 trait-based**:spec.md frontmatter `traits:` array → required core stories 衍生 + hook `check_story_invariants.sh` R3 category 攔。

**Principles canonical**(Polaris-aligned):universal core ≥ 2 of `WhenToUse`/`WhenNotToUse`/`Vs*Rule`/`ContentGuidelines` + hook 攔。SSOT → `/story-writing` skill `references/category-templates.md`。

## 禁止

❌ 佔位符 / 抽象代號 / 極端不現實 / 視覺符號 / spec 內部代號。詳 → `/story-writing` skill。


---
## rules/self-verify.md

# Self-verify canonical(path-scoped)

僅在編輯任何 file(`src/**` / `.claude/**` / `*.spec.md` / `*.tsx` / `*.css`)時 load。

**Why**:M10/M11/M20/M32 散在 meta-patterns,缺單一「改檔前中後該驗什麼」canonical。本 rule SSOT。對齊 Linux kernel patch checklist / Toyota TPS 自働化 / Google CL pre-submit。

## 4 階段強制(每階段 fail 任一 → STOP)

| 階段 | 動作 | 工具 / cmd |
|---|---|---|
| **Pre-edit** | (1) M29 3-column owner table(grep `*.spec.md` 找 anchor)(2) M23 既有 canonical 優先(`# SSOT 消費 canonical` 清單)(3) Touched file inventory + Read 真讀(非憑記憶)(4) 若 SSOT-UI/UX substantive → STOP 用中文 propose 等 user 拍板 | grep / Read / propose-options skill |
| **Mid-edit** | (1) 每 5-8 個檔案或跨新 domain 跑 scoped invariant grep(2) 發現 spec/code 衝突 STOP,不選邊(3) Hook 自動 intercept(check_substantive_edit_approval_preflight / check_solo_workflow / check_story_invariants 等)| auto-fire hooks |
| **Post-edit** | (1) `npx tsc -b`(任何 tsx/ts 改);**⚠️ 動 export/型別 surface(interface/type/cva variant union/discriminated union/新 export)必加跑 `npm run build:lib`** —— `tsc -b`(composite/build mode)**不做 declaration emit**,漏 TS4023「cannot be named」等 declaration-emit 錯;Netlify build.command = `build:lib && build-storybook`(`build:lib` 含 `build:dts` = `tsc -p` emit .d.ts)才會炸。**tsc -b PASS ≠ deploy-safe**(2026-06-05 anchor:Badge discriminated union BadgeDotProps 沒 export → Sidebar SidebarMenuBadge .d.ts TS4023 → Netlify build 連掛 3 commit,tsc -b 全綠騙過)。type-surface deploy-safety 證明 = `build:lib` exit 0,非 tsc -b。(2) 相關 invariant script(`node scripts/data-table-invariants.mjs` 若動 DataTable / `node scripts/audit-content-quality.mjs --check` 若動 spec)(3) M10 proactive scan(`/scan-similar-bugs` 或 manual grep 同 pattern DS-wide)(4) UI 改動加 visual probe(`/visual-audit --scope=changed` 或 Playwright screenshot)(5) M14 5-layer pipeline(spec / hook / SKILL / CLAUDE.md / memory 該動的同步)| `tsc` / `*.mjs` 腳本 / visual-audit |
| **Pre-commit / Pre-final** | (1) Claim-verify table:每「已修」「已驗」對應具體 command + artifact + file:line(2) 過 `scripts/audit-content-quality.mjs --check`(3) Stop hook BLOCKER 紅燈通過(claim-verify-gap / codex-verify / codex-transport)(4) Commit message 含 cite + verdict keyword 滿足 `check_codex_collab_5step.sh` | claim-verify table + content-quality + stop hook |

## 強制 trigger condition(滿足任一 → 整 4 階段必跑)

- 動 `node_modules/@qijenchen/design-system/src/**`(production code)
- 動 `*.spec.md`(canonical text)
- 動 `.claude/{rules,skills,hooks,memory,commands}/**`(governance)
- 動 `CLAUDE.md`
- 動 token(`node_modules/@qijenchen/design-system/src/tokens/**`)
- 動 component primitive consumer 行為

## 例外 escape(明寫,**不**靠記憶)

- Typo fix(無語意改變)→ Pre-edit + tsc 即可
- 純 markdown layout / 標點 → tsc + content-quality 即可
- Hook script 內部 logic refactor(無 BLOCKER 邏輯變)→ Pre-edit + smoke test(`bash -n` + `echo {} | bash hook.sh`)
- Audit / explore agent dispatch(不動 file)→ Pre-edit 即可

## Mechanical enforcement

- **Pre-edit**:`check_substantive_edit_approval_preflight.sh`(production code)+ `stop_self_audit.sh`(spec/canonical 補位)+ `check_ds_anchor_preflight.sh`(M29 anchor)
- **Post-edit**:`stop_self_audit.sh` Mechanism 1(claim-verify-gap)BLOCKER
- **Pre-final(宣告完成前)**:`stop_self_audit.sh` Mechanism 7(完整性宣告閘)BLOCKER — 宣告「全做完 / 全部完成」+ 本 turn 實質改動但**無全庫 stale-ref 掃描證據** → block。**觸發器 = 「宣告完成」本身,非等 user 問第二次**(2026-06-03 user-authorized,根治重複 failure)
- **Pre-final(重大 / SSOT / 模型 / 跨多檔改動)**:除 M7 自掃外,**宣告完成前必跑「獨立對抗稽核」**(multi-agent Workflow,每路假設「還有 loose end」主動去找 + cite 證據)。**理由**:self-grep 系統性漏(self-assessment unreliable,對齊 `feedback_ai_ground_truth_unreliable_mechanical_primary`)+ 信任機械閘(preflight / R4 / hook BLOCKER)勝於自評。**小改 = M7 自掃即可**,不需對抗稽核(避免過度)。2026-06-03 user-authorized,根治「宣告做完 → user 問第 N 次 → 才補掃出 loose end」
- **Pre-commit**:`scripts/audit-content-quality.mjs --check` + `scripts/extract-canonical-rules.mjs` 各 fail = block

## Anti-pattern(永久 ban)

- ❌「我感覺修好了」沒跑 tsc / invariant 就 claim done
- ❌ 動 export/型別 surface 只跑 `tsc -b` 就宣告 deploy-safe(必 `npm run build:lib`,詳上方 Post-edit row — 單一住所)
- ❌ 動 spec / src 沒先 grep owner anchor(M29 違反)
- ❌ 改 hook 沒跑 syntax check + smoke test
- ❌「下個 session 補」defer 可做的 verify(M33 違反)
- ❌ pass-through Explore / codex propose 沒 own-version 比稿
- ❌ 宣告「全做完 / 全部完成」前沒自己跑 M10「改一處看三處」全庫 stale-ref 掃描 → 等 user 問「真的做完?」才補掃出 loose end(M7 BLOCKER;anchor:CF model 改完漏 3 ref / iceberg)
- ❌ **重大 / SSOT / 模型改動只靠自 grep 就宣告完成** → 漏 fragility / 沒貫徹到 consumer。2026-06-03 anchor:R8 用相對路徑讀 registry 非 root cwd 靜默失效、CF 模型修沒貫徹到 App.tsx marker — **全是 4-agent 對抗稽核 + preflight/R4 機械閘抓到,自 grep 漏了**。重大改動宣告前必跑獨立對抗稽核 + 信任機械 preflight 勝於自評

- Linux kernel:`scripts/checkpatch.pl` pre-submit + `git log --oneline | head -3` 後 sign-off
- Toyota TPS:Jidoka(自働化)— 機器發現異常自己停,人別繼續(對應 hook BLOCKER)
- Google CL:LGTM + 必跑 presubmit(對應 Pre-commit table)
- Atlassian RFC:cite + counter-example scan 必過 reviewer round

對應 CLAUDE.md `# 自主執行 canonical` + meta-patterns M10/M11/M20/M32。


# SSOT 消費對照(references)


---
## references/build-ui-canonicals.md

# 建立 UI 前的 DS canonical 對照(從 CLAUDE.md 拆出的完整對照)

本檔是 `node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「建立 UI 前必讀」的**完整對照表**。Rule 主章只留「超級規則 + 自我檢查腳本」,遇到具體情境要查對照時讀本檔。

---

## 既有 DS 元件 / primitive 優先消費(完整表)

**超級規則**:**`ls node_modules/@qijenchen/design-system/src/components/` + `ls node_modules/@qijenchen/design-system/src/patterns/` 看一次。任何視覺 / 行為命中既有元件 → 必消費,不 hand-craft raw HTML 繞過**。

### 常見手刻 vs canonical 對照

| 情境 | ❌ anti-pattern(手刻) | ✅ canonical(用 DS) |
|------|---------------------|---------------------|
| Select / 下拉選單 | `<Popover><PopoverContent><button className="flex items-center px-2">...</button></PopoverContent></Popover>` | `<Select options={...} />` or `<DropdownMenu><DropdownMenuItem>` |
| Input 欄位 | `<input className="h-field-sm w-20 pl-3 pr-7 border ..." />` | `<Input size="sm" />` or `<NumberInput />` |
| 列表項目 row(icon + text + action) | `<div className="flex items-center gap-2"><Icon/><span/><Button/></div>` | `<MenuItem>` + slot components(`<ItemIcon>` / `<ItemLabel>` / `<ItemSuffix>`) |
| 資料表格(含 header / sorting / sticky) | `<table><thead>...</thead><tbody>...</tbody></table>` | `<DataTable columns={...} data={...} />` |
| 檔案上傳列表 | `<div>filename</div><ProgressBar /><Paperclip />` | `<FileItem mode="compact" />` or `<FileUpload>` |
| 表單欄位(label + control + error) | `<label>...</label><input/><span className="text-error">...</span>` | `<Field><FieldLabel>...<Input />...<FieldError/>` |
| 全頁 / 區域 loading | `<div className="absolute inset-0 flex center"><Spinner /></div>` | `<Empty icon={<CircularProgress />} description="..." />` |
| 確認對話框 | raw `<div className="fixed inset-0 bg-black/50">...<button>OK</button>` | `<Dialog>` + `<DialogHeader>` etc |
| 分隔線 | `<hr className="..." />` or `<div className="h-px bg-..."/>` | `<Separator />`(必要時)or CSS border(見 separator.spec) |
| 標籤分類 / 狀態 chip | `<span className="inline-flex px-2 py-0.5 bg-... rounded">...</span>` | `<Tag variant="..." />` or `<Badge />` |
| 使用者頭像 | `<img className="w-8 h-8 rounded-full" />` | `<Avatar>` |
| 浮層(彈出資訊) | `<div className="absolute bg-white shadow p-3">...</div>` | `<Popover>` / `<HoverCard>` / `<Tooltip>`(視語義選) |
| 浮層 media + title + description + actions | 自組 `<div>` 結構 | `<Coachmark>` 或 `<Dialog>`(視是否阻斷) |
| 固定高度 chrome header(toolbar / page top bar / panel 標題列)| 自組 `<div className="flex h-12 items-center border-b px-4">...</div>` | `<ChromeHeader>`(消費 header-canonical;或在 `<AppShell header={...}>` slot 傳它)|

**Story 特別提醒**:**stories 也是 code**。如果 story 在 label / comment 說「DataTable cell 用法」「Table 配額」「Menu 選單」等,**要 render 真的該元件 demo,不可用 raw `<table>` / raw `<button>` 假裝**。否則 story 教壞 consumer、自己也在破壞 DS 訓練資料。

`check_story_invariants.sh` hook(R1 anatomy,原 `check_story_anatomy.sh` folded 折入)會在 Write/Edit 階段攔下這類手刻;allowlist `// @anatomy-exempt: <reason>`(檔首)/ `// @anatomy-exempt-next`(下一行)可豁免教學用 raw primitive。

---

## Layout primitive 特別子集(建立 pattern-level 新元件前 mechanical 掃)

以下是 **pattern-level** primitives(跨元件共用的視覺結構),建立新元件前必查。若新元件的視覺結構命中任一 row 的 pattern → **必消費該 primitive**,不自己重寫一套。漏掉 = 雙邊漂移 bug(改一邊另一邊失效)。

| 視覺 pattern | 既有 primitive | 典型觸發情境 |
|------|---------|---------|
| 單列 row:prefix(icon/avatar) + content + suffix(action) | `patterns/element-anatomy/item-anatomy.*` — `<MenuItem>` canonical + slot components | 任何「列表項目」元件(Menu/Tree/Sidebar/TableRow/StepItem/FileItem...) |
| 浮層容器的 Header + Body + Footer(border-b/t + padding token) | `patterns/overlay-surface/` — `SurfaceHeader/Body/Footer` | Dialog / Popover / Drawer / Sheet / 任何 elevation-200 浮層的結構化 sub-components |
| **固定高度 chrome header(toolbar / page top bar / panel 標題列,border-b + px-loose + 高度 token)** | `patterns/header-canonical/` — `<ChromeHeader>`(`withTabs` / `leadingRail` / `lockDensity`)+ `header-canonical.spec.md` 設計契約 + `Patterns/Header Anatomy` story | Sidebar header / FileViewer Toolbar+InfoPanel / AppShell `header` slot / 未來 Drawer top bar |
| **垂直居中 icon + title + description(+ action)** | `components/Empty/` — `<Empty>` 元件 | **「告訴使用者狀態」的 surface**:空資料 / 拖放邀請(FileUpload)/ 錯誤 / 首次引導 / 無權限 / 載入佔位(非 Skeleton)|
| 橫向操作按鈕列（gap-2 分組）| `patterns/action-bar/` | Toolbar、page header actions、form footer buttons |
| 水平溢出處理(捲動/收合,**隱藏捲軸+ fade-mask** UX)| `patterns/horizontal-overflow/` | Tabs / ChipGroup / 未來 Steps 的溢出(刻意隱藏 scrollbar) |
| **跨 OS 一致 overlay 捲軸(顯示捲軸但不吃寬度)** | `components/ScrollArea/` | DataTable 水平捲動 / Sheet / Dialog body / Sidebar 長 nav 等需要使用者知道有捲軸又要跨 OS 視覺一致 |
| **固定長寬比容器(防 CLS 坍塌,多張圖統一 ratio)** | `components/AspectRatio/` | Coachmark media / Carousel item image / Card thumbnail / Chart container(override default 16:9) |
| Field wrapper（border + padding + startIcon + endAction 結構) | `components/Field/field-wrapper.tsx` + `field-controls.spec.md` | 所有單行可編輯欄位元件 |

### 自我檢查腳本(node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md「建立 UI 前必讀」保留這節的精簡版,完整對照在本檔上表)

- 新元件有 icon+text 垂直堆疊? → 用 `<Empty>`,不自己畫 icon + title + desc
- 新元件有橫向 row 結構(prefix/content/suffix)? → 用 `element-anatomy/item-anatomy` 的 `<MenuItem>` + slot components(`<ItemIcon>` / `<ItemAvatar>` / `<ItemLabel>` / `<ItemSuffix>` / `<ItemInlineAction>`)
- 新元件是浮層 + 有 header/body/footer? → 用 `overlay-surface`
- 新元件是 **固定高度 chrome header(toolbar / page top bar / panel 標題列)**? → 用 `header-canonical` 的 `<ChromeHeader>`(border/padding/高度/tabs/dismiss 全契約;或在 `<AppShell header={...}>` slot 傳 `<ChromeHeader>`),**先讀 `header-canonical.spec.md` + `Patterns/Header Anatomy` story**,不自刻 `<div className="flex h-12 items-center border-b px-4">`
- 新元件內容**可能溢出容器且需要使用者捲動**? → 用 `ScrollArea`(跨 OS 一致 overlay 捲軸);若是刻意隱藏捲軸 + fade-mask → 用 `horizontal-overflow` pattern
- 新元件有**圖像 / media 容器需要鎖定長寬比**(防 CLS、統一多張圖比例)? → 用 `AspectRatio` primitive,不硬寫 `aspect-video` / `aspect-square` class
- 以上都沒命中 → 才可自建,但 **建完要立刻回來加行**(防下一個人又重造輪子)
- **本規則同樣適用 story / consumer / exploration code**:不 hand-craft 已有 prop 能做的事(如 Input loading 走 `loading` prop 不自刻 `<div className="relative"><input/><div className="absolute">` / 全頁 loading 走 `<Empty icon={<CircularProgress/>}/>` 不自刻 `absolute inset-0`)。遇缺口**回元件 spec 擴 API**,不自刻繞過 — hand-craft 視覺對齊 bug 上游

具體 anti-pattern signals → `/design-system-audit` Dim 21;pixel-level 視覺 regression(API 用對但視覺仍跑掉)→ `/visual-audit`(D5)抓(原 memory `project_pending_tasks` 已 retire)。

---

## overflow 使用三規則(避免跨 OS 跑版)

1. Design-system 元件 `.tsx` 內**禁止** raw `overflow-auto / overflow-scroll / overflow-{x,y}-{auto,scroll}`(hook `lib/_token_hygiene.sh` Check 5 守衛)
2. 需捲軸且跨 OS 一致 → 用 `ScrollArea`
3. 刻意隱藏捲軸 + fade-mask → 用 `horizontal-overflow` pattern
4. 例外:`overlay-surface` spec 明文允許 Dialog body `flex-1 overflow-y-auto`(viewport-fill 特殊 context);若未來此場景需跨 OS 一致,遷移 ScrollArea 再更新 spec


---
## references/ssot-consultation.md

# SSOT 消費 canonical — 完整對照 + 反例

CLAUDE.md `# SSOT 消費 canonical` 的詳表 + 反例。主章留核心 + pointer,本檔放大對照表 + 禁止清單 + tsx 註解模板。

## 視覺決策 → 必查清單(完整)

| 決策 | 必查的 SSOT 家 |
|------|---------------|
| **元件選擇**(這該用哪個既有元件?)| `ls node_modules/@qijenchen/design-system/src/components/` + `ls node_modules/@qijenchen/design-system/src/patterns/` + 近親元件 spec |
| **Token / 值**(padding / gap / height / color)| 對應 `tokens/{name}/spec.md` + `tokens/README.md` |
| **Padding / spacing**(chrome vs 元件內 vs 精確幾何)| `node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md`「Padding source 分層規則」+ `tokens/layoutSpace/layoutSpace.spec.md` |
| **Row / item 結構**(prefix / content / suffix slot)| `patterns/element-anatomy/item-anatomy.spec.md`(Family 1+2 SSOT) |
| **連續 item list wrapper gap** | `patterns/element-anatomy/item-anatomy.spec.md`「連續 item 貼邊合法性」— 公式:permanent standalone card/pill → 必 gap;permanent flush / transparent → 0 gap。元件專屬 gap 值 + mixed 混合情境決策表查該元件 spec「List wrapper canonical」節 |
| **視覺容器 breathing**(自建或 override 帶 bg/border/shadow 的 div)| `patterns/element-anatomy/element-anatomy.spec.md`「視覺容器 breathing invariant」— 有視覺邊界容器必有 inner padding。責任在父容器,子元件 w-full responsive 不變 |
| **Label ↔ Description gap**(2px)| Token `--item-gap-label-desc` + Primitive `<ItemContent>` — 改 token 一處 → 全 DS 同步。Consumer 2 擇 1:(a) token:`mt-[var(--item-gap-label-desc)]`(b) primitive:`<ItemContent label description descriptionTone>`。偏離必 spec 明文 rationale |
| **Dismiss / inline action / overflow menu**| `patterns/element-anatomy/item-anatomy.spec.md`「Dismiss 按鈕 canonical」+「Inline Action 設計規格」+「常用 icon canonical」 |
| **按鈕排列 / 群組 / 分隔**| `patterns/action-bar/action-bar.spec.md` |
| **Header 高度 / chrome padding**| `tokens/uiSize/uiSize.spec.md`(`--chrome-header-height`)+ `tokens/layoutSpace/layoutSpace.spec.md` |
| **Chrome header 選型**(fixed-h vs padding-based)| `tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」— decision tree + 8 家世界級對照 + checklist |
| **Header 跨家族視覺契約**(border / padding / withTabs / dismiss size 連動)| `patterns/header-canonical/header-canonical.spec.md` — SSOT for chrome + overlay header 兩家族;含 withTabs 6 lockstep rules(W1 border auto-suppress / W2 padding align / W3 tabs size 對應 / W4 flush stack / W5 md future tier / W6 default sm)|
| **Overlay chrome dismiss / unbounded button**| `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical v5」 |
| **Overlay title size**(modal 16 vs non-modal 14)| `patterns/overlay-surface/overlay-surface.spec.md`「Overlay title typography canonical」 |
| **Form field gap**| `components/Field/field.spec.md` +「layoutSpace 規則 3:跟 block 相鄰 = tight,inline ↔ inline = loose」 |
| **Icon 選擇 / 尺寸**| `node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「元件 Props 命名」「Icon canonical」+ `ui-dev-rules.md`「Icon size 來源分層規則」 |
| **浮層 header / body / footer**| `patterns/overlay-surface/overlay-surface.spec.md` |
| **Scrollbar / 滾動**| `components/ScrollArea/scroll-area.spec.md` +「horizontal-overflow pattern」 |
| **Variant / prop 命名**| 既有元件 `variant=` 值 grep + `# 命名與語言一致性`「命名必過三重 test」 |
| **State 視覺**(selected / disabled / hover)| `patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」 |

## 強制 Checklist — 新 tsx 檔 top-of-file 註解

新元件 / 新 feature 的 tsx 開頭**必須**有註解段落:

```tsx
/**
 * {Component} — {定位一句話}
 *
 * ── 定位 ──
 * {...}
 *
 * ── 實作基礎 ──
 * 消費:{List components / primitives used}
 * 對應 pattern:{patterns/xxx}
 *
 * ── 消費的 SSOT ──
 * - components: [Button, Input, ItemInlineAction, ...]
 * - patterns: [item-anatomy, action-bar, overlay-surface]
 * - tokens: [--layout-space-loose, --chrome-header-height, --field-height-md]
 * - spec refs: {近親 spec 清單}
 */
```

Hook `check_ssot_consultation.sh`(retired;改靠 mindset #2 + `check_canonical_propagation.sh`)(原 Write 新 tsx 到 `node_modules/@qijenchen/design-system/src/components/` 或 `src/explorations/` → 若檔內無上述註解區 → warn 要求補齊)。

## 禁止:隱性自創

下列行為等同自創(就算沒宣告新命名):
- 自寫 `h-14` / `h-12` 等 chrome 高度(應用 `--chrome-header-height` token)
- 自寫 `gap-3` 當 toolbar 按鈕群 gap(應查 `patterns/action-bar` canonical)
- 自寫 `<button aria-label="Close"><X /></button>` 作 dismiss(應用 `ItemInlineAction`)
- 自寫 Row `<div><Icon /><span>label</span><Button /></div>`(應用 `<MenuItem>` + slot)
- 自訂 Input `variant="custom-name"` 未先 grep 既有 variant 值
- 在 Toolbar 用 `<input className="bg-transparent border-0 ...">`(應用 `<Input variant="bare">` 若既有;無 → Ambiguity Protocol)


- 需要時 Read:node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md(flex slot 幾何/Padding 3 層/Icon size 3 類,fork 寫 .tsx 通用)

- 需要時 Read:node_modules/@qijenchen/design-system/ds-canonical/references/naming-conventions.md(命名慣例 + 禁止清單,fork 命名通用)

- 需要時 Read:node_modules/@qijenchen/design-system/ds-canonical/references/tailwind-gotchas.md(Tailwind v4 var()/tailwind-merge/shadcn alias,fork 同套會踩)

- 需要時 Read:node_modules/@qijenchen/design-system/ds-canonical/references/props-naming.md(onClose/onDismiss 分層 + icon canonical,fork 自寫元件用)

- 需要時 Read:node_modules/@qijenchen/design-system/ds-canonical/references/cva-patterns.md(cva 適用/例外,fork 寫 className 變體元件用(低頻 pointer))

- 需要時 Read:node_modules/@qijenchen/design-system/ds-canonical/references/composition-fidelity.md(fork 視角短版(為何標 marker/禁硬寫 token);DS-side CF gate workflow 路徑 )

- 需要時 Read:node_modules/@qijenchen/design-system/ds-canonical/references/scenario-definition.md(fork 需知 Scenario B 禁忌(禁 import src/dist)+ E2E(pointer 即可))

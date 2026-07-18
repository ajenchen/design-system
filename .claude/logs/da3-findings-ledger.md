# DA3(deep-audit round 3)findings ledger — 累積 triage 用(batch-at-end)

## A.3 批修進度(commit bde8973c 保全;F2-F5 撞額度 10pm 重置)
- ✅ F1 完成(20 檔 47 處);✅ F2/F4/F5 大部落地(gate 全綠證實);✅ F3 部分(Checkbox defaultChecked ✓ / tag.spec ✓)
- ✅ 全 gate 綠:tsc/typecheck:stories/content-quality/story-quality/compile-stories 62 aligned/invariants 39/39/6 hooks bash -n

### A.3 殘項(додати額度後收尾;abort 時從此接續)
> ✅ **2026-07-18 RECONCILE:本段下列 F3/F2/F4/F5 殘項全數已於 A.3 收尾第二波(commit 5c28dfbe 等)落地並隨 beta.86 發版。** spot-驗證坐實(date-picker/link-input `export const View`、rating.spec Tag、Steps controlled 等);工作 log 未逐條翻 [x],以權威收官檔 `da3-c1-final-report.md` 為準。下列打勾框保留為歷史軌跡。
F3 剩(原記「spot-check 證實未做」→ 已全 ship,見上 RECONCILE):
- [ ] TimePicker view 分支 spread props(照 switch.tsx restDomProps 同型)+ M10 掃其他控件 view 分支
- [ ] color.spec.md:275 --on-emphasis 白名單刪 turquoise
- [ ] select.tsx :144/:157/:3/:381 display docblock → view;RadioGroup tsx :16/:30/:277;Switch tsx docblock;boolean-value :1/:26
- [ ] Story Modes 卡標題/aria-label display 殘留(Select:47/RadioGroup:33-34/Switch/Checkbox/Combobox/DatePicker/Input:31/NumberInput:35/TimePicker:42)
- [ ] export const Display → View ×2(date-picker.stories:319 / link-input.stories:123)+ grep LinkTo 舊名
- [ ] anatomy 不存在 token 修(RadioGroup:172-174 / Select:260-263 → var(--color-magenta-6) 等,照 ProgressBar 已修版)
- [ ] Rating stories InField touched-gating;Rating spec:39/:213 Badge→Tag
- [ ] PeoplePicker anatomy ColorMatrix 重寫(bg-neutral-selected 無勾號)
- [ ] DateGrid anatomy weekday h-field-sm + ring-primary-hover ×3
- [ ] Switch anatomy ×2 + principles + DatePicker anatomy:251 + Textarea anatomy:37 + Select anatomy:325-326/:48 display 殘留
- [ ] tag.tsx docblock ×2 + tag.anatomy prose ×2 + tag.principles 深字清單
F2/F4/F5 待驗收項(gate 綠但未逐項確認):
- [ ] F2 的 8 項(field-controls contract d / inline-edit.spec 大修 / LinkInput VERIFY 結論)逐項 spot-check
- [ ] F4 的 dim74 存量 15 檔清單(agent 應回報但被額度吞)→ 重掃
- [ ] F5 的 32 項 spot-check(SKILL 死引用 / LinkTo / 雜項)
- [ ] deterministic 5 dims 標記補跑(23/41/42/45/48)→ coverage ledger Claude 側 100%

規則:全掃完才 triage;非-SSOT = AUTO 批修;SSOT-UI/UX = C.1 拍板清單(四要件)。

## A.0 governance 層(agent aa5873,done)
- [AUTO] ssot-index.md:23 — 三重 stale:mode="display" 已不存在 /「仍 bare-span」vs Model A 矛盾 /「documented deferral」已兌現(select.tsx:3)
- [AUTO] ssot-index.md:15 — row 用 display 措辭 ×4(mode 語彙 stale;showDisplayEndIcon prop 名不算)
- [AUTO] ssot-index.md:23 — canonical quote 引 owner spec 舊 display 語彙

## A.0 specs 前半 A-I(agent a6b6c9,done;36 files)
高嚴重(現在式 canonical 矛盾):
- [AUTO] field-controls.spec.md:394 — 共享 contract (d)「display = zero chrome + !px-0 !py-0」整段與同檔 L67 Model A 正面矛盾;cva key 仍寫 'display'。⚠️ 牽動 hook check_field_controls_contracts.sh (contract d) — 改 spec 同時檢查 hook regex
- [AUTO] inline-edit.spec.md:41-56 — 「幾何典範(2026-07-09)」宣告自帶外框幾何(無 py token),與 Model A 委派矛盾;整檔缺 editable 閘記載;:26-33 自稱「read/hover/edit 三態」+ read/view 混用
- [AUTO] field.spec.md:209 — FieldContext 表 mode 欄仍列 display
- [AUTO] checkbox.spec.md:249 — union 已 view 但 bullet 仍以 display 為現行名(同段自相矛盾)
- [AUTO] checkbox.spec.md:251 — disabled bullet 現在式引「DataTable disabled cell」(已廢)
- [AUTO] data-table.spec.md:495 — Keyboard「非 disabled」gate 引已刪概念
中嚴重(display 現在式 terminology / stale 行號):
- [AUTO] date-picker.spec.md:314(display+disabled 同傳 / L227 行號 stale→L266-276)+ :287(display 模式)
- [AUTO] field.spec.md:421 — Naked L6 列「display 態」×4
- [AUTO] field-controls.spec.md:186(display = ✓/— ×3)+ :383(contract (a) display path ×3;(e) L396 同)+ :416(「Display 元件」禁止事項 vs L57 矛盾)
- [AUTO] data-table.spec.md:123(display↔edit invariant 命名)+ :167(段名 Display 態)
- [AUTO] input.spec.md:95-99(段名 ## Display + display/readonly)+ :105(L70-115 行號漂移→~L93-138)
色值:0 suspicions(A-I)

## A.1 DETERMINISTIC(light battery done;14 dims fresh)
- 全 exit 0(dim 84 22/22 PASS 等);heavy battery(49/50/51/77/83/87)排隊中(等 storybook 重建)

## A.0 SKILLs+memory(agent ae615a,done;43 files)
死引用(全 AUTO — 改成指向現存合併後檔案或刪 pointer):
- [AUTO] codex-collab/SKILL.md:46(feedback_codex_local_transport_node_modules→已併 exec_transport_canonical)/:111(feedback_ds_anchor_preflight 不存在)/:169(codex_collab_backfill 不存在)/:67(references/phase-b-codex-brief.md 在 deep-audit-cross-codex/references/ 非本 skill)
- [AUTO] design-system-audit/SKILL.md:244(feedback_audit_preflight_全盤查→已 3-in-1 併)/:290 + deep-audit-cross-codex/SKILL.md:62(feedback_audit_full_sweep_not_sample→同併)/:134(feedback_layout_v6_canonical 不存在)/:182(netlify_basic_password→已併 reference_deploy_targets)/:368(project_audit_progress 不存在)
- [AUTO] visual-audit/SKILL.md:253(project_pending_tasks 不存在)
SKILL 宣稱矛盾:
- [AUTO] ux-audit/SKILL.md:74 — hover delay 寫反(真值 tooltip 500 / hover-card 700,motion.spec:32-33,89)
- [AUTO] codex-collab:157-163 + deep-audit-cross-codex:155-156 — M27 當現行(已 retire 折 M23(c))
- [AUTO] product-ui-audit:88-97(「5 條 mindset」實 6 條 + M1-M5 撞名)/:134(6-dim 實 7)
- [AUTO] component-quality-gate:47-54 — Ship 6 項實列 7;checklist.md:74 Ship 4/4;35=12+13+6+4 三數矛盾
- [AUTO] deep-audit-cross-codex:232 — CP-A2「4-Q」vs A.2「7-Q」vs M18「6 題」三數;:188,190 C.0b 撞編號
memory stale:
- [AUTO] MEMORY.md:8(WM push 已完成仍寫「唯一剩」)/:17(low reasoning 已禁仍寫);兩處 harness 端同步改
- [AUTO] reference_deploy_targets.md:81 — 寫 effort=low 與自指 SSOT(禁降檔)矛盾
- [AUTO] project_wm_ds_alignment_campaign.md:12,14 — 「cell display 態」術語層 stale(campaign 記錄邊界,輕改)

## A.0 specs 後半 J-Z + tokens + patterns(agent ad1ad5,done;50 files)
turquoise 深字未同步(昨日 M10 掃漏 Tag spec):
- [AUTO] tag.spec.md:138 / :162(Solid 表 turquoise 寫 --on-emphasis 白,與 code 矛盾)/ :167(「四個」應五個)/ :223 — 4 處補 turquoise 入深字清單
- [AUTO] color.spec.md:275 — --on-emphasis 白字適用清單仍含 turquoise(L276 已加深字,L275 漏刪 = 自相矛盾)
display 更名殘留(後半):
- [AUTO] switch.spec.md:138(bullet 用 display,L136 型別已 view)
- [AUTO] number-input.spec.md:128 / :106,108(Display mode 現在式)
- [AUTO] link-input.spec.md:88 / textarea.spec.md:111 / time-picker.spec.md:202,275,277
naked 死格殘留:
- [AUTO] textarea.spec.md:74(「naked 四 mode」→ 僅 edit/view)/ :107(readonly×naked 已刪,主詞錯)
- [VERIFY] people-picker.spec.md:252 — naked×disabled 組合低信度,需對 tsx 驗證
行號/pointer 漂移:
- [AUTO] color.spec.md:652(data-table HEADER_BG :312→:350 / calendar :316→:368)/ :653(steps :698,715→:706-728)
- [AUTO] opacity.spec.md:67 — 消費者清單漏 person-display.tsx:137
- [P2/低] elevation.spec.md:20 — 「唯一 consumer」vs command.stories 3 處(stories 非 production,borderline)
- [AUTO] uiSize.spec.md:342 — pointer 指 layoutSpace「規則 1.1」實為「規則 6」
色值 ✓ 0 hit(舊值全清);InlineEdit 後半 0 矛盾 ✓

## HOOK residue 59-71(agent aaba41,done;10 dims 全落 JSON)
- [P1/AUTO-治理] dim 59 — `CLAUDE_BYPASS_DESIGN_APPROVAL=1` 長駐本 session 進程 env(settings.local.json 已刪但進程繼承留存)→ approval P0 BLOCKER 本 session 靜默失效。處置:(a) settings 已清,下 session 自然消失(驗證過);(b) A.3 加 session-start 長駐 bypass env 偵測告警(agent 建議採納);(c) C.1 report 誠實記載
- [AUTO] dim 64 — check_post_main_ssot_propagate 兩 gap:(a) matcher 漏 `git -C`/`--force-with-lease origin main`/`HEAD:main` refspec(sibling deploy hook 已硬化本 hook 未同步);(b) diff 只看 HEAD~1..HEAD,fast-forward 多 commit push 漏早期 SSOT 檔
- [P3/觀察] dim 65/67 — fork 路徑 bypass 累計 77/74 條(fork 側疑未修 drift;67 未 port comment-strip 修正 → false-positive class)。fork 側非本 repo scope,記 C.1
- residue 0:dim 60/61/63/69/70/71(e2e 驗過)

## A.1b batch 2(Button..Coachmark,agent a9432b,done;11 false)
- [AUTO-code] **Checkbox mode='view' 分支只讀 `checked===true` 忽略 `defaultChecked`**(readonly 分支有讀)→ `mode="view" defaultChecked` 渲染叉 / indeterminate 渲染叉。medium,對齊 readonly 分支讀法
- [AUTO] Checkbox display 殘留 ×3(tsx jsDoc L114 + spec L249 + Modes story 標題)
- [AUTO] Button:buttonMeta fg 漏 --primary-hover/-active(:583)/ argTypes danger 理由與 spec L416 矛盾 / spec L276 tooltip 無條件宣稱(code 排除 asChild)
- [AUTO] Calendar spec L270 focus ring 宣稱 outline 實為 ring-2(box-shadow)
- [AUTO] Carousel carouselMeta.tokens 空但 dots 消費 bg-on-emphasis
- [AUTO] Coachmark anatomy children 型別 stale(ReactNode→ReactElement)/ principles 單步示範漏 isLastStep(默演 anti-pattern)
- 0 false:Chart / Chip / CircularProgress

## HOOK residue 73-89(agent af1adf,done;10 dims 全落 JSON)
- [P1/AUTO] dim 78 — brief-template.md 只 codify 3 invariants,缺 4(禁列檔)/5(輸入對等)/6(audit-prompts 判準對等)/7(A.1b)→ 照母版生成的 brief 必被 hook BLOCK(template-vs-hook SSOT 不同步);hook BLOCK 訊息自寫「三 invariant」也 stale
- [AUTO] dim 74 — 15 檔存量 overlay story 無 open 機制(13 trigger-only + 2 useState(false))+ hook regex 廣度 gap(只認 open={true|isOpen|isVisible},漏 controlled open={<var>} 與 bare open)
- [P2/AUTO] dim 75 — r2 指引 `npm run sync-all` root 無此 script;coverage-matrix fork-user 描述過時(P3)
- [P3] dim 73(歷史 snapshot artifact)/ dim 81(.storybook/main.ts:25 dead no-op preset.ts 載入,檔頭宣稱不實)
- residue 0:76/79/80/82/89;10 hook 全無 display 舊 regex ✓

## HOOK residue 35-58(agent a4201b,done;10 dims)
- [AUTO-高] dim 54 — story-baseline-registry DataTable `unlessRegex mode=["']display` **更名後 stale**(0 hit vs view 28 hit,豁免失效會誤殺合法 story)→ 改 view;+ overflow-indicator.stories:243 wrap DataTable 無 @story-baseline marker;+ dim 54(d) buttonCanonical registry 無 key = 紙防線
- [AUTO-高] dim 57 — check_ds_anchor_preflight DS_PRIMITIVES_RE stale:含已改名 NameCard + 缺 34 現役元件(**含 InlineEdit**)→ 名單改機械生成(從 components/ dir 派生)
- [AUTO] dim 52 — uiSize.css:122 md-reset 重設 --tab-height-lg 但漏 --chrome-header-height(md-lock subtree W3 破)+ hook 只 assert 前 2 出現
- [AUTO] dim 39 — file-item.tsx:139,184-190 手刻 suffix slot 未消費 ItemSuffix 無 marker + hook 只抓字面 className 漏 cn(+變數) 形態
- [P3] dim 53 兩偵測 gap(h-NN only / 單檔配對)
- residue 0:35/37/47/56/58

## A.1b batch 1(Accordion..BulkActionBar,agent afb0d6;287 claims/9 false,1 material)
- [AUTO-material] Alert principles 4/5 LinkTo 指 2026-07-14 已改名 story(低調單行等)→ 導航斷鏈
- [AUTO] Accordion 末位 border-b 宣稱 / AppShell 回焦宣稱+2 行號 / Avatar 行號 / Badge status span+漏列 story
- 0 false:AspectRatio / Breadcrumb / BulkActionBar

## A.1b batch 4(Empty..InlineEdit,agent a0aee9;16 false:P1×3 P2×4 P3×9)
P1 全是 round16/F2 後 spec 未同步(code+anatomy 一致是新的一方):
- [AUTO-P1] field-controls.spec.md:394 contract (d) zero-chrome(A.0 已抓,雙證確認)
- [AUTO-P1] inline-edit.spec.md:45 幾何表 -mx 無條件宣稱(code = fieldCtx&&vertical 才 -mx)
- [AUTO-P1] inline-edit.spec.md:39/:141 「任一路徑結算後 focus 回 read 按鈕」與 code 分流相反 + **inline-edit.tsx:173 註解引用已不存在的 spec 條文(幻影 cite,code 註解也要修)**
- [AUTO-P2] inline-edit.spec.md:47 「無 py token」vs multiline py-2 / inline-edit.stories.tsx:81 States 註解「px 抵銷 -mx」失效 / field.spec.md:209(雙證)/ file-viewer.spec.md:143 index 保留宣稱(code 重置 initialIndex)
- [AUTO-P3] ×9(行號 drift / meta 註記誤 / renderRead 無 data-empty 未標 / 自家 story renderEdit 未傳 mode="edit" 違自家鐵律示範)
- CLEAN:Empty / FieldControlGroup / FileItem / FileUpload;HoverCard 近 clean(P3×2)

## Judgment dims 20-38(agent a03ee5,done;1 material + 4 marginal,JSON 落齊)
- [AUTO-material] dim 20 — field-controls.spec.md:394 contract (d)(三證確認:A.0 + a1b + dim20)
- [AUTO] dim 25 — `export const Display` story 名殘留 ×2(date-picker.stories:319 / link-input.stories:123;Select DisplayMode 是 display prop 教學,排除)
- [AUTO] dim 26 — InlineEdit spec 缺 Field 家族慣例「Controlled-only rationale」段(其他 7 個 controlled-only 全有)
- [AUTO] dim 33 — story-rules.md:25 taxonomy 漏「Internal Patterns」bucket(enum drift,4 處認可它)
- [P2] dim 24 — DataTable EmptyState anatomy/展示雙檔同 scenario(retire/merge 候選)
- 0:dim 22/28/32/38

## HOOK residue 1-34(agent ade7bb,done → residue 40/40 全收)
- [AUTO-高] dim 1 — **Notice noticeMeta.variants={} vs spec 5 variants → compile-stories --check 現行 FAIL(live 紅燈)**;+ display 更名 spec 漏網 ×3(field.spec:209 / checkbox.spec:249-250 / switch.spec:138,與前述雙證)
- [AUTO] dim 29 — 4 marker 濫用(Combobox/NumberInput/Select/PeoplePicker @story-trait-rationale「tracked separately」但無 tracking artifact)+ 3 缺 Default/AllVariants rationale(Empty/InlineEdit/DescriptionList)
- [P2] dim 31 — 4 檔合法 different-row 混用缺 marker(WARN 噪音)/ dim 13 meta:coverage-matrix 對 dim 13 mechanism 描述 stale
- residue 0:dim 4/11/13/18/21/30/31/34

## A.1b batch 7(SelectionControl..Steps,agent aec947,done)
- [AUTO-P1] Separator principles LinkTo 指 2026-07-14 已 retire 的 DropdownMenu 展示 story(斷鏈;retire 漏反向引用掃)
- [AUTO-P1] slider.spec:132 API 段列 orientation prop 但 code 已 Omit(07-07 修後 spec stale)
- [AUTO-P2] boolean-value.tsx:1,26 docblock「display / readonly 態」更名殘留 / Sidebar spec family:1 vs meta null(SelectMenu 同構已修此未同步)+ Slider meta family 雙軌
- [AUTO-P3] SelectMenu tsx:34 檔頭圖 CommandInput / Sheet 行號 / Steps caption
- 0 false:Skeleton;近 0:SelectMenu/Sheet/Sidebar/Steps(cosmetic)

## A.1b batch 8(Switch..TreeView,agent a58f2c,done;27 FALSE)
- [AUTO-code] **TimePicker view 分支不 spread props → aria-label 靜默丟失**(Switch 同型 2026-07-04 已修,TimePicker 漏;M10 同型掃描:其他控件 view 分支全查)
- [AUTO-major] Tag turquoise 深字 stale ×8(spec L162 白字表 + 四個清單 ×3 + tsx docblock ×2 + anatomy prose ×2 + principles「深底白字」自相矛盾)
- [AUTO] Switch display 殘留 ×5(tsx docblock 列不存在 union 值 + spec L138 + anatomy ×2 + 展示/principles)+「display 不暴露 aria-label」已被 07-04 修反證
- [AUTO-major] Textarea spec L107 readonly×naked 宣稱(compound 已刪)+ docblock display ×2 + 空值 disabled unreachable
- [AUTO] TimePicker spec「view+disabled 切 disabled token」unreachable + display 殘留
- [AUTO] Tooltip spec「跟頁面主題反轉」與 code 不符(固定 dark;anatomy 正確,spec↔anatomy 矛盾)+ LinkTo 斷鏈(方向,已 retire)+「Inspector delay 試玩」不存在
- [AUTO] Toast principles LinkTo「互動測試」斷鏈(story 已更名「點擊觸發通知」← 我昨天 humanize 改名漏反向引用!)+ 行號 ±3
- [AUTO-P3] Tabs tsx L2 行數 stale / TreeView frontmatter lg 幾何 + drag-visual.ts 檔頭 opacity-30 drift
橫向 pattern:display 殘留跨 3 元件 10+ 處 / turquoise ×8 / LinkTo 斷鏈 ×2(改名+retire 未掃反向引用)/ view props 轉發 M10 掃描候選

## Judgment dims 43-90(agent a110f1,done;3 marginal,JSON 落齊)
- [AUTO] dim 44 — ui-development.md:31「11 個 internal 單元」stale(實際 10)
- [AUTO] dim 68 — display 更名 prose 殘留 10 處(RadioGroup/TimePicker/Input aria-label「display mode demo」等 — 併橫向 pattern 1 批修)+ field-controls:394 impl cite(N 證)
- 0:dim 43/46/55(dark 色改經公式衍生不破 mapping ✓)/62/66/72/90(InlineEdit stories 正向確認消費 layout-space ✓)

## A.1b batch 5(Input..PeoplePicker,agent ae481a,done)
- [AUTO-major] PeoplePicker anatomy ColorMatrix 整表(Check icon 16px / selected 無 bg / selected+hover)與 user 拍板 canonical(bg-neutral-selected、不用勾號)+ select-menu.tsx:441 實作**完全相反**
- [AUTO-major] input.principles:131「view 無左右 padding」違 Model A + :134 推薦不存在的 mode="display" + anatomy:246 naked 宣稱與 edit×naked 自畫相反
- [VERIFY→再判] LinkInput 預設 view = 裸 span 不消費 fieldWrapperStyles?(agent 宣稱與 Model A 衝突未載明例外 — 需開 link-input.tsx 驗證兩條 view 路徑,決定:補例外文檔 or 對齊 code)
- [AUTO] LinkInput/PeoplePicker「showDisplayEndIcon=true 走 naked」docblock drift 同款 ×2
- [AUTO] display 殘留:Input/LinkInput/NumberInput/PeoplePicker showcase 標題 + docblock(併橫向 pattern 1)
- [AUTO] OverflowIndicator 把「Breadcrumb 收合」列 consumer 場景(canonical = BreadcrumbEllipsis+DropdownMenu,自家 spec:118 明文無關係)×3 檔 + principles:46「點開」vs hover-only
- [AUTO-P3] NumberInput anatomy 行號 / a11y 機制歸屬 / Notice title font 條件 / Menu startContent 漏列 / Pagination DOM 層 / PeoplePicker cite 漂移 ~10 處
- hover delay tier 三方一致 ✓(dim 68 舊 anchor 已癒合)

## A.1b batch 6(Popover..Select,agent adb42a,done;221✓/23✗)
- [AUTO-code] **Rating stories InField:108 `rating===0 && <FieldError>` = spec:100 明文禁止的初始即紅框 anti-pattern**(story 犯自家 spec)
- [AUTO-code] **RadioGroup anatomy:172-174 + Select anatomy:260-263 用不存在 token `var(--magenta)`/`--magenta-subtle`/`--turquoise)` → silent transparent**(dim-55 class;ProgressBar 同款已修)
- [AUTO] Select tsx display docblock ×4(:144/:157/:3/:381 含公開 prop)+ stories:47 Modes 卡 + anatomy:325-326 自相矛盾 + anatomy:48 focus 宣稱 stale(readonly ring 已加)+ spec:252 mobile-only 寫通用
- [AUTO] RadioGroup tsx:30 公開 docblock 列 display + :16/:277 + stories:33-34 Modes 卡
- [AUTO] SegmentedControl tsx:18「切 view → Tabs」舊二分法(spec:40/:67 已推翻,自家 canonical story 即 ViewSwitcher)
- [AUTO] ScrollArea「DataTable 主要 consumer」×3 處 vs spec:42 例外 + data-table native overflow(0 import)
- [AUTO] Rating spec:39/:213 教用 Badge 做分類標籤(違 badge.spec;Tag owns)+ readOnly aria 無條件宣稱
- [AUTO-P3] Popover stale cite ×2(round-1 已報未修)/ ProfileCard wrong-home cite / ProgressBar principles 教學載體互斥
- Model A view 幾何 Select 宣稱一致 ✓;display prop 未誤列 ✓

## Judgment dims 6-19(agent a289d8,done → judgment 27/27 全收)
- [AUTO-material] dim 14 — display/view 混用 6 spec(去重:全與 A.0/a1b 既有 findings 重疊)+ select.anatomy:326(重疊)+ data-table:495(重疊)+ story-rules:25 Internal Patterns(重疊 dim 33)
- [AUTO] dim 8 — form-validation / filter-operators 缺 N/A 行 ×2 / dim 9 — InlineEdit spec 漏「passthrough 例外說明」段(併 InlineEdit spec 大修)/ dim 6 — date-picker:235 重述 range stadium
- [ASK 候選] dim 19 — header-canonical folder vs「Header Anatomy」title 異名(rename = SSOT-affecting;C.1 四要件評估後決定送不送)
- 0:dim 7/10/12/17

## 待收:a1b ×1(batch 3 Combobox..DropdownMenu);codex ×2;heavy battery

## B.2 Step 4.5 — codex judgment findings 對抗驗證(2026-07-17,workflow wf_d320bda8 28 agents)

**機械驗收**:360/360 verdicts 完整無漏(scripts 內聯 coverage check)。**Verdict**:VERIFIED 338 / PARTIAL 18 / STALE 4 / **FALSE 0**(codex 事實層極準,僅 4 條已被 A.3 批修先修掉)。**分流**:AUTO 282(非 SSOT:story 文案 / spec N/A 段 / a11y label / doc-code 對齊 / 命名一致)/ ASK 60(SSOT-UI/UX 候選 — C.1 前需 consolidation:同類合併 + SSOT-check 先行,寫不出 SSOT 理由者降回 AUTO)/ REJECT 14(true-but-canonical-exception,均已 cite)。dupWithClaude 12。

| dim | V/P/F/S | AUTO/ASK/REJECT |
|---|---|---|
| 6 | 6/1/0/0 | 7/0/0 |
| 7 | 23/1/0/4 | 19/5/0 |
| 8 | 21/0/0/0 | 18/3/0 |
| 9 | 34/1/0/0 | 17/18/0 |
| 10 | 34/1/0/0 | 33/1/1 |
| 12 | 82/3/0/0 | 80/1/4 |
| 14 | 12/2/0/0 | 11/3/0 |
| 17 | 2/0/0/0 | 1/1/0 |
| 19 | 0/1/0/0 | 1/0/0 |
| 20 | 3/1/0/0 | 4/0/0 |
| 22 | 1/0/0/0 | 0/1/0 |
| 24 | 28/4/0/0 | 20/3/9 |
| 25 | 1/0/0/0 | 1/0/0 |
| 26 | 7/0/0/0 | 5/2/0 |
| 33 | 6/0/0/0 | 4/2/0 |
| 38 | 1/0/0/0 | 1/0/0 |
| 43 | 21/2/0/0 | 22/1/0 |
| 44 | 7/0/0/0 | 2/5/0 |
| 62 | 8/0/0/0 | 8/0/0 |
| 66 | 6/0/0/0 | 6/0/0 |
| 68 | 19/1/0/0 | 19/1/0 |
| 72 | 14/0/0/0 | 1/13/0 |
| 90 | 2/0/0/0 | 2/0/0 |

ASK 60 條原始清單(consolidation 前)存 verdict files;verdict SSOT = `.claude/logs/codex-judgment-verify/dim-*.json`。

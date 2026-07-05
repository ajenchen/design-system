# Deep Audit Solo Run — C.1 完整報告(2026-07-05)

Run:2026-07-03 啟動之 canonical solo mode(Phase B 撤回 codex:solo mode)。
Branch:`2026-07-04-solo-audit-fixes`(16 commits,全數 push;Netlify preview 200)。

## Phase A 結果

- **Step-0 機械閘**:typecheck:stories ✅ + storybook smoke 947 stories 0 error ✅(2026-07-03)
- **A.0 全盤閱讀**:134 files / 94 drift 嫌疑(phaseA-preflight-checklist.md)
- **A.1 全 dim dispatch**:90/90 dims(dispatch-audit-dims.mjs 動態 plan),~60 findings
- **A.1b per-unit adversarial**:77 units(7 早波 + 70 殘餘 20 chunks)/ **3,762+ 句宣稱逐句比對**
  / 151 FALSE_CLAIM + 155 gap / 僅 2 單元全乾淨
- **A.3 落地**(全數驗證後 commit):
  - 治理批:dim 50 Tailwind @source root 修 / dim 54 R8 registry 引擎 / dim 58 C-prime 對齊
    / dim 59 allowlist / dim 47 radius arbitrary / dim 24 story dedup / Validator I(D3/D4/D5
    chain 證據閘)/ approval regex 補「核可|批准」(user 拍板)
  - 修復波:128 處 doc-to-code 對齊(20 agents,103 檔)
  - 核可批 A:77 條 tsx 註解/docblock 對齊(77/77 M7 完整性掃描)
  - 核可批 B:14 bug(Button asChild 必炸 / LinkInput hooks / Badge undefined / Chart 0 值
    / DateGrid aria-label dead code / SegmentedControl deselect / 選取三件組 display 轉發
    / DataTable opacity+rounded / aria-label 中文化 ×4 …)
  - 拍板 10 題全落地(每題 3-4 家世界級實查):Q1 error 紅框(cva error 變體 SSOT,12 sites)
    / Q2 selected 勝 hover / Q3 loading 措辭 / Q4 emptyText 三層接線 / Q5 group export
    / Q6 日期 filter 日級(行為測試 4 案)/ Q7 Empty 容器級權限 / Q8 ProfileCard 升 public
    / Q9 DL 互動邊界 / Q10 dark 4 色 alpha 統一

## D3 元件效能(首跑;17 confirmed / 12 refuted,每 finding 對抗驗證)

**已修(本 run)**:
- **P0** PeoplePicker hooks-after-early-return(React #310 家族第 3 例)→ hoist ✅
- **P1** MultiPersonDisplay 同家族 → hoist ✅(M10 全庫掃:僅此 2 處真中)
- **P1** react-hook-form 漏 rollup external(beta.80 fallout,dist inline 15.3KB gzip)→ 補 ✅

**待核可修(P1,行為不變 perf 修 — 「核可 C」批)**:
1. DataTable cell memo 全滅:renderCellContent 每 render 3 個新 closure → 100-300 個 Field
   subtree 全重渲(捲動/resize/keystroke 熱路徑)→ MemoCellSlot 中介層
2. Filter 求值 per-row 重複解析(dateMs 常數側重 parse + registry 線性掃 + TanStack per-column
   放大 ~10×;5,370 rows canonical story 實跑數十-上百 ms)→ prepared-condition cache
3. 拖曳/spreadsheet state 全在 root + RowDragHandle ctx/setPos churn → 收斂

**P2 backlog(10 項)**:Sidebar/TreeView context 粒度、500-item menu 無虛擬化、Calendar
O(42×N) 掃描、Avatar per-instance MutationObserver、FileViewer lazy 機會、dead deps
(next-themes/@babel/runtime)等 — 詳 d3-results.json。

## D4 UX 行為(11 confirmed P1 + 55 P2 未驗 + 21 P0/P1 verify 被 spend-limit 殺)

**Confirmed P1(待核可修 — 「核可 C」批)**:
1. **Coachmark 鍵盤路徑機制性斷裂**:Tab 離 trigger 即 focus-outside dismiss → CTA 鍵盤永遠
   到不了(WCAG 2.1.1;spec 宣稱與 Radix runtime 機制矛盾)→ 拍板題(改焦點行為)
2. **Toast 計時器不因鍵盤焦點暫停**:4 秒倒數賽跑按 復原/重試(WCAG 2.2.1)→ 拍板題(duration 預設)
3. FileUpload ×3:同檔重選無反應(input.value 未 reset)/ dragleave 閃爍(無 relatedTarget
   guard)/ disabled 時 drop 讓瀏覽器直接開檔(未 preventDefault)
4. Tabs inlineAction = button 巢 button(HTML validity)
5. TreeView ×2:aria-hidden 但可聚焦的 checkbox / dnd-kit 注入 role=button 破壞 tree 語意
6. Sidebar icon-collapse 模式 menu button 無 accessible name
7. FileItem hover-swap action 鍵盤聚焦時 opacity-0(可聚焦不可見)

**未驗 backlog(額度恢復後補跑)**:leaf 組全滅 + 21 筆 verify 死亡 — 內含與本輪改動相關的重要
候選:error+focus 紅框零 focus delta(聚焦無第二視覺通道)、spreadsheet 鍵盤進入、SelectMenu
鍵盤 cursor、NumberInput draft state 等。

## D5 視覺(Layer A 111 scenarios + Layer B 32 diff 歸因)

- **Layer A**:0 contrast / 0 geometry / 0 WCAG-a11y 違規 ✅
- **Layer B**:32 個 baseline diff — 絕大多數 = **字型環境噪音**(baseline 為 beta.68 ubuntu
  刻意校準,本機 macOS 渲染)⇒ 本機 full-scope 無法對 ubuntu baseline 做像素級判定
- **真 findings**:(a) DataTable pinned 欄列高疑不與資料列同步(字型變高時 action 欄錯位累積)
  — 待複查;(b) baseline provenance 不準(slider/badge 基線圖早於 beta.68 tag 內容);
  (c) item-anatomy Q3 決策樹 vs FileItem 列矛盾 — 已補 2026-04-23 拍板例外註記 ✅

## C.0a 治理 prune(quality-first)

- Dead-hook 偵測:47 hot / 24 warm / 7 cool(全為 retired 殘影或 SessionStart logging 盲點)
  → **0 真死鉤,0 retire**(上輪 2026-06-11 剛 prune 59→52;本輪 rationale = 成熟無冗餘,
  不湊 retire 率 per skill 核心前提)
- Hook 總數 53 > soft 26:結構性,無 quality-safe 合併候選 → 留待下次真信號
- Memory 18/20:上輪剛整併,無 urgent 合併

## 待拍板清單(SSOT-affecting)

1. **Coachmark 焦點行為**(SSOT 理由:改元件開啟時焦點 canonical + spec 行為宣稱)
   建議:preventDefault + focus content 容器(對齊 dialog fallback;Tab 第一下即達 CTA,
   Enter 不誤推進)+ 同步修 spec
2. **Toast 帶 action 的 duration 預設**(SSOT 理由:toast() API 預設值,跨產品行為)
   建議:action 存在 → 10000ms(Polaris ≥10s / Carbon persistent / Material 加長共識)
3. **error+focus 第二視覺通道**(SSOT 理由:Field 家族 focus 指示視覺;D4 未驗但機制明確 —
   紅框聚焦前後零視覺差)選項:(a) MUI 式聚焦加粗 2px(b) Polaris 式外圈藍 focus ring 與紅框並存
4. **「核可 C」批**:D3 效能三修 + D4 confirmed bug 七修(上列;全部行為修正非設計改動)
5. **Baseline 重截**:在 ubuntu 環境(CI)以現版本重截 + 校準(消字型噪音 + provenance 修正)

## 殘餘 backlog(不阻擋)

- A.1b propose 未拍板殘項 ~10(focusFirstError DOM 序 / TimePicker handleNow 對齊 / LinkInput
  defaultValue Omit / Tag 互斥 dev-warn / Chip cloneElement ref / Input meta 空殼 / Calendar
  CTA hardcode / DateGrid RDP premise ×2 / DL vertical text-foreground / textarea opacity 混用)
- D4 未驗 21 + leaf 組 + D3 P2 ×10 — 額度恢復後補跑
- motion/uiSize swatch stories、overlay-surface/horizontal-overflow internal reference
  stories(dim 11 backlog)

## Verify artifact

全批:fresh tsc --noEmit 0 / typecheck:stories 0 / storybook smoke 368/368(或 947 full)
/ DataTable invariants 37/37 / content-quality ✅ / build:lib 0(export surface 批)
/ Q6 行為測試 4 案 / R8+approval regex 等 hook 行為測試逐案。
approval-bypass audit log:.claude/logs/approval-bypass.jsonl(4 entries,全附 user verbatim)。


---

## 2026-07-05 補驗定稿(resume 後最終帳)

### D3 定稿:17 confirmed(1 P0 + 4 P1 + 12 P2)/ 12 refuted
- **已修**:P0 PeoplePicker hooks(React #310 家族)/ P1 MultiPersonDisplay 同家族 / P1 RHF external
- **餘 2 P1 效能修 → 核可 C**:DataTable cell memo 中介層 / 拖曳+spreadsheet state 收斂
- filter 求值降 P2(驗證者實證 demo 規模毫秒級;10k rows 才顯著 → backlog 帶量化)

### D4 定稿:36 confirmed(2 P0 + 33 P1 + 1 P2)/ 62 P2 未驗 backlog / 1 refuted
- **P0 ×2 已修 + playwright 真 build 行為驗證**:
  1. SelectMenu 鍵盤 cursor 零視覺回饋(bg-transparent 蓋掉 cmdk 唯一 highlight;全家中招)
     → 鏡射 DropdownMenu bg 所有權模式;tailwind-merge 機械證明 + 5 步驟鍵盤 probe 全過
  2. searchable Select/Combobox/PeoplePicker 開啟後方向鍵+Enter 全 no-op(跨 DOM 子樹)
     → select-menu.tsx `forwardKeyToListbox`(APG re-dispatch)+ 雙 wrapper 接線
- **本輪自身缺口 ×5 已修**(已核可工作補完):Q4 stack 分支漏接 / Q1 textarea naked 漏鏡射
  / Q2 selected×cursor 加深一階(bg-neutral-selected-active,M23 nearest = Button toggle)
  / Badge null 整顆不渲染 / Button asChild 補 aria-busy/aria-disabled + click guard
- **餘 26 項 P1 → 核可 C**(全為行為修非設計改動):Coachmark 焦點、Toast duration(此兩項升格
  拍板題)、FileUpload ×3、Tabs 巢 button、TreeView ×2、Sidebar aria、FileItem focus 隱形、
  DatePicker needConfirm 死路、DatePickerRange 焦點掉 body、NumberInput draft、LinkInput
  invalid 接線、readOnly label 繞過、useFormValidation double-submit、spreadsheet 鍵盤 ×4、
  SelectMenu 巢狀 role/aria-live ×2、多選 select-all footer 鍵盤 ×2、Steps aria、Avatar
  imgError、Alert/Notice 死 X、DropdownMenu(已修)等 — 完整清單 d4-results.json

### 基建自抓包(已修 + codify)
- **storybook-smoke 驗舊 build 假綠**:本 arc 歷次 smoke 宣稱實驗 7/3 舊 build → smoke script
  加 stale-build guard(fail-loud,雙分支行為測試)+ CLAUDE.md 失敗記憶索引 1 行

### 拍板清單更新(取代原 5 題)
1. Coachmark 焦點行為(同前)
2. Toast 帶 action duration 預設(同前)
3. error+focus 第二視覺通道(D4 未驗項中有同主題 candidate,已在 backlog;仍待選 (a) 加粗 / (b) ring)
4. **核可 C**:D3 效能 2 修 + D4 confirmed P1 ~26 修(逐項 file:line + 修法在 d3/d4-results.json)
5. Baseline 重截(ubuntu CI 環境)


### 拍板題 3 結案(2026-07-05)
error+focus 第二視覺通道:user 拍板「照 Mantine」= 完全不變。現行 code 已符合,零改動;canonical 寫入 field.spec.md state machine 段(含已知代價與未來重議條件)。D4 backlog 同主題 candidate 據此結案。

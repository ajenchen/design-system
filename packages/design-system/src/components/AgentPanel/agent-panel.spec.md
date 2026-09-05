---
component: AgentPanel
family: self-contained
traits:
  - hasInteractiveStates
  - isStructural
---

# AgentPanel 家族(智慧代理面板)

> 來源:提案規格 v4(2026-09-01 核心互動全數定案 + 2026-09-02 各單項拍板;Figma「Task-Desktop」
> 智慧代理頁 30:306094 六畫面 + 54:174061 附件,間距皆節點實測)。本檔為入庫後唯一 SSOT。

## 定位

- 產品右側智慧代理面板:一個家族資料夾、9 個元件 + 2 個附屬資產(AgentLogo / AgentFab),
  同 Sidebar 前例(單一 `agent-panel.tsx` 家族檔;標誌與 FAB 因 SVG 幾何量體獨立成
  `agent-panel-logo.tsx` / `agent-panel-fab.tsx`)。
- **實作基礎**:組合式——消費 ChromeHeader(header-canonical)、overlay-surface(SurfaceHeader/
  Footer)、Popover surface 配方、SelectMenu 同源 primitives(Popover+Command+MenuItem)、
  Radix Collapsible(經 animate-accordion)、RadioGroup、Chip(assist 分支)、Tag、
  OverflowIndicator、CircularProgress、Dialog、Empty、Button 家族。無自建 primitive;
  唯一自建=AgentLogo/AgentFab 的品牌 SVG 資產(無既有 primitive 可對應)。
- **Layout Family**:self-contained 容器家族(面板=容器;各子元件按其節聲明消費對應 anatomy)。
- **世界級對照**:GitHub Copilot Chat panel(VS Code 右側欄)/ Notion AI side panel /
  Intercom Fin 面板同型:右欄固定寬 + chrome header + 卷軸訊息區 + 底部複合輸入。

## Token(本家族新增 4 個)

| Token | 值 | 家 | 出處 |
|---|---|---|---|
| `--agent-panel-width` | 25rem(400) | uiSize.css「Sidebar / Layout primitive sizing」段 | 稿全六畫面 rightSider 實測 400;命名同 `--sidebar-width` L4 layout 前例 |
| `--motion-easing-swell` | cubic-bezier(0.4,0.14,0.3,1) | motion.css (C) 循環動態 | 循環「起」;Carbon expressive 參考 |
| `--motion-easing-settle` | cubic-bezier(0.2,0,0.38,0.9) | motion.css (C) 循環動態 | 循環「收」;Carbon productive 參考 |
| `--motion-duration-shimmer` | 2s | motion.css (C) 循環動態 | shadcn shimmer 逐字(2026-09-02 實開頁複核) |

標誌/FAB 環的漸層停駐色=**品牌資產常數**(oklch 內嵌,色相落於 DS 藍 252-268 /
紫家族(2026-09-02 user 拍板由藍→土耳其藍改為藍→紫,再依「所有顏色都要根據我們的設計語言」改為
**逐階取自自家 primitives.css light 色階**:藍緞帶 blue-3→7、紫緞帶 purple-3→7、紫底面陰影 purple-8、
藍提亮 blue-2、招喚波 blue-5→indigo-5→purple-5、FAB 環/光圈 blue-4 / purple-4;色相固定 258 / 294,
兩緞帶明度各跨 .37 保留原稿立體感,尾端停在 -7 使 dark `--surface-raised` 上仍可辨);品牌色不隨主題
(`tokens/color/color.spec.md`「品牌」段),資產內嵌 light 數值而非 var(),每個常數行尾 `// = --color-xxx-N`
由 `scripts/agent-logo-brand-scale-invariant.mjs` 機械比對(容差 .01);FAB 環/光圈只 import `AGENT_BRAND`。
SMIL keySplines 無法消費 CSS var,`agent-panel-logo.tsx` 內常數為 swell/settle token 值的
逐字鏡像(檔頭註記;改 token 必同步)。

## 何時用

- 產品頁右側需要常駐可開合的智慧代理對話(任務助理、資料問答、批次操作代理)。
- 代理需要人類拍板時(AgentDecisionCard)、需要回顧歷史對話時(歷史浮層)。
- 頁面需要一顆全域入口喚起代理(AgentFab,含有新訊招喚)。

## 何時不用

| 情境 | 改用 | 原因 |
|---|---|---|
| 單次確認/破壞性確認 | Dialog | 阻擋語意屬 modal,非代理協作卡 |
| 靜態說明/導覽提示 | Coachmark / Tooltip | 無對話回合 |
| 全螢幕沉浸式對話產品 | 產品自建頁面 | 面板定位=側欄輔助,非主畫面 |
| 一般表單輸入 | Field 家族 | AgentPromptInput 是代理複合輸入盒,非通用欄位 |

## 元件規格

### 1. AgentPanel(容器)

- 寬 `--agent-panel-width`、全高;面=`bg-surface`;左緣分隔線**只有一個 owner**:可拖時由
  ResizeHandle 的 1px line 擁有(idle divider / hover border-hover / 拖曳中 primary;DataTable 欄間同款),
  `resizable=false` 才由容器畫 `border-l border-divider`(app-shell aside 前例)。兩者並存 = 2px 粗線
  (2026-09-02 user 抓到「比 aside 粗」;第二輪雙層 -3px 偏移已由單一元件收斂)。
- Anatomy:`[AgentPanelHeader][AgentConversation flex-1][AgentPromptInput]`;
  AgentDecisionCard 出現時絕對定位貼底覆蓋輸入區。
- 開合=淡入+自右滑入 `--motion-duration-surface`(模態面板級);減動作停。
- **可調寬**(`resizable`,預設開):左緣 `<ResizeHandle direction="horizontal" position="start">`
  (`patterns/resize-handle` 視覺 primitive:熱區 7、線 1、idle divider / hover border-hover / 拖曳中 primary,
  與 DataTable 欄寬把手同視覺;DataTable 尚未 migrate 到此 primitive,resize-handle.spec.md Roadmap);寬度夾在 `--agent-panel-width-min` 360 ~ `--agent-panel-width-max` 640
  且 ≤ 視窗寬 50%(較小者勝);預設 `--agent-panel-width` 400。受控 `width` +`onWidthChange`(拖曳中每格都發,
  受控端才有即時回饋)/ `onWidthCommit`(放開或鍵盤一步發一次,要落地儲存接這個);或
  非受控 `defaultWidth`。**無雙擊重設**(2026-09-02 拍板);以 Sheet 承載時同樣可拖(不衝突)。
  鍵盤:把手為 `role="separator"`(`aria-orientation="vertical"` + valuemin/max/now),
  ←/→ 每步 16、Home=最窄、End=最寬(DataTable 欄寬把手同語意:箭頭往哪、邊緣就往哪);
  聚焦可見=DataTable 同款 outline;減動作不影響(無動畫)。
- A11y:`role="complementary"` + `aria-label="智慧代理"`。
- 面板與 app 的推擠/斷點=backlog(本輪僅元件內規格)。

### 2. AgentPanelHeader(標題列)

- chrome header 家族:消費 `<ChromeHeader>`(固定高 `--chrome-header-height`:md 48 / lg 56 隨 density);
  標題=chrome typography `text-body-lg font-medium`(16;`header-canonical.spec.md`「Title typography」)。
  **標題群 ↔ 動作群間距 = `--layout-space-loose`**(2026-09-02 user 拍板「chevron 至少與其右方按鈕距離 loose」):
  ChromeHeader 根層預設 `gap-2` 在長標題截斷時會讓 chevron 貼到 28px 圖示鈕(8px)、被讀成同一群;本面板以
  className 覆寫根層 gap 為 loose,其餘 ChromeHeader 消費者(Dialog / AppShell)不受影響。
  **不取 14**(2026-09-02 user 問「可否客製選 14」→ 判定維持 16):14 是 non-modal 浮層(Popover / Coachmark /
  Tooltip)的專屬檔(`popover.spec.md` Modal / Non-modal 字級表),AgentPanel 是與 AppShell aside 同級的常駐面板,
  改 14 = 與相鄰 aside 標題不同級,且標誌 24 / 箭頭 20 是照 16 字配的 tier(縮字後箭頭偏大);垂直置中不受影響。
- Anatomy:`[AgentLogo 24][gap-2][標題+chevron 複合觸發]…[新對話 +][ButtonDivider][關閉 ×]`。
  - 標誌+標題=側欄品牌區前例逐字(gap-2 + 24 標誌);標誌隨代理狀態動畫(思考=think 態)。
  - **標題+chevron 是同一顆觸發**(原生 button,幾何逐字沿用品牌區前例:`gap-2`、標題
    `text-body-lg font-medium` 單行截斷(消費 `<TruncatedText>`:截斷時才顯 tooltip 補全,
    owner `tooltip.spec.md:32` / 引擎 `truncated-text.spec.md`;禁手刻 truncate span)、零 padding、無懸停底;focus-visible ring 同 AgentThinking
    標題列):點標題或 chevron 都開歷史浮層;chevron 只是指示,**與 Select 觸發器 chevron 逐字同款**:
    色 `text-fg-muted`(neutral-7,`../Field/field-controls.spec.md` icon 純指示方向)、線粗同全域 1.75、
    尺寸走「字級↔icon tier」= 標題 text-body-lg 對應 `ICON_SIZE.lg` 20(select.tsx lg 同款)、
    開啟時 `rotate-180`(select.tsx / AgentThinking 同款);第二輪覆核:禁用 Button 殼——會多出
    左 9 / 右 5 內距與 28 高懸停底,破壞品牌區間距;第三輪:16 改 20 是 tier 對齊,非新值。
  - 關閉=`<Button dismiss size="sm">`(header 專屬 sm);新對話=Button text sm iconOnly。
  - **固定 anatomy 恆渲染**:標題觸發、新對話 +、關閉 × 不因缺 callback 而消失——
    `onNewConversation`/`onClose` 為必填 prop;歷史相關 callback 可省略但列仍顯示
    (2026-09-02 根因:以 callback 有無決定渲染 → 各 story 面板長相不一)。
  - **新對話停用**:`conversationEmpty`(目前對話尚無已送出訊息)→ + 鈕 `disabled`,
    避免堆疊空對話(Claude / ChatGPT 同行為)。
  - ButtonDivider 置於自動高度 actions cluster(gap-2)內(action-bar 規則 3 誤觸保護;
    直接放固定高 chrome header 會退化為容器高)。
- A11y:每鈕 `aria-label`;標題觸發 `aria-haspopup="dialog"` + `aria-expanded`;
  改名/刪除 Dialog 關閉後焦點回到標題觸發。

### 3. AgentConversation(訊息卷軸區)

- ScrollArea(跨 OS 一致捲軸;Dialog body 同法)包 `flex-1`;內距 16(--layout-space-loose);**輪距 40**(我方↔代理)=
  8+24(工具列 xs 高)+8,懸停工具列絕對定位於輪距內,出現不推擠。
- **底部內距 = `--layout-space-bottom` 48**:最後內容(常駐工具列)→ 輸入盒的送出動作 = layoutSpace 規則 4
  「內容 → action button = bottom」(`tokens/layoutSpace/layoutSpace.spec.md` L118;2026-09-02 user 抓工具列貼輸入盒)。
- **常駐判定 = 本元件**:直接子 `AgentMessage` 中最後一則 `role="agent"` 的工具列常駐(在流內佔位),
  其餘懸停/鍵盤聚焦淡入(絕對定位,零推擠);consumer 不設 `pinned`(SSOT,各 agent 一致)。
- **自動捲到最新**:掛載與訊息數增加時捲到底;使用者往上捲離底部 > 40px 時不搶捲(ChatGPT / Claude
  「貼底跟隨、離底不擾」同款);由本元件實作,consumer 不自接。
- A11y:`role="log"` + `aria-live="polite"`。

### 4. AgentMessage(訊息)

- 我方:氣泡 `bg-secondary`、`rounded-md`、內距 8/12、max-width 85%、靠右;
  進場=淡入+下滑 8、0.15s。代理:無氣泡、全寬、text-body;內文連結由代理層樣式提供(`text-primary` / hover `text-primary-hover` + 底線,長文閱讀需要底線可掃描),**不是** Button link variant。
- 附件列(氣泡內文字上方):**`<Chip variant="assist">`**(按鈕語意;位置距氣泡緣左 12/
  上 8、與文字距 8;**chip 相互垂直/水平間距 4**=與 Combobox 內 Tag 區間距一致
  (combobox.tsx Tag area gap 預設 4;2026-09-02 拍板,非 ChipGroup filter 的 gap-2))。A11y:`aria-label="附件:{檔名}"`。

### 5. AgentThinking(思考塊)

- Anatomy:`[標題+chevron][內文:border-l border-divider + 左縮排 12 + 上距 8 之步驟串流]`。
- 標題狀態換字:進行中「思考中」/完成「思考過程」;AI 回覆中自動展開、回覆完自動收合。
- Chevron=accordion 慣例(Suffix 位、rotate-180、150ms、motion-reduce 0);色=`text-fg-muted`
  恆定(同 Select/Combobox 觸發器 chevron:select.tsx `text-fg-muted`),**不吃微光、不隨懸停變色**
  (Accordion 亦僅 chevron 靜色;2026-09-02 拍板)。
- 微光:**僅文字**(標題字+正在寫入的最新一行);shadcn shimmer 參數(帶寬 3ch+40px、斜 20°、
  `--motion-duration-shimmer` linear);色階=基 fg-muted、亮帶 neutral-6(同一條中性階梯);
  reduced-motion 自停。**完成步驟靜態、色 `text-fg-secondary`**(次要層級,非 muted)。
- 開合=Radix Collapsible + `animate-accordion-down/up`(200ms ease-out)。
- A11y:標題=button + `aria-expanded`;內文不另設 aria-live(容器已是 live region)。

### 6. AgentToolbar(訊息工具列)

- 高 24;代理**最後一則**常駐(由 AgentConversation 判定,在流內佔位);其他訊息懸停/焦點 0.15s 淡入,
  絕對定位於輪距內、不推擠版面。
- `[複製][ButtonDivider][讚][倒讚]`=Button text xs + Tooltip;各鈕 aria-label。

### 7. AgentPromptInput(複合輸入盒)

- Anatomy:`[附件列?][值(多行)][工具列:+ … 送出/停止]`;外框 = **Textarea edit×default 同一組字串**
  (`components/Field/field-wrapper.tsx` 的 `fieldChromeStyles({ mode: 'edit', variant: 'default' })`:border-border、
  hover 一階 border-hover、focus-within 主色;radius 4 —— 單行欄位 / Textarea / 本輸入盒三種宿主同一份)。
  2026-09-02 user 抓「跟 Textarea 互動不同」→ 收斂為單一住所,禁自刻。
- 內距=欄位家族:上 `--field-control-py-md`、左右 `--field-px`、text-body;
  單行=32 等高鐵律。總高驗算:1+28(附件列)+32+40(工具列)+1=102=稿。
- 附件列=**Tag md 恆帶 ×**(`onRemoveAttachment` 必填;相互間距 4、距內緣 4);單列不換行,
  超寬=`useOverflowIndices` 量測 + `<OverflowIndicator shape="tag">`(+N,浮層列出被藏 Tag)。
  分工:輸入中 Tag(可 dismiss)、送出後 Chip assist 視覺(2026-09-01 拍板之本家族分工)。
- 工具列高 40、鈕 xs、內距 8;`+`(`onAddAttachment` 必填)恆渲染;送出=Button primary xs;
  **送出↔停止**:代理進行中同鈕同位換實心正方,0.15s 淡切;停止態 `aria-label="停止生成"`。
  實心正方=**12/24 grid 自繪**(8px @ icon 16;= Material Symbols `stop` 480/960 比例,
  https://fonts.google.com/icons?icon.query=stop;lucide Square 填滿為 20/24 = 13.3px,較
  ArrowUp/Plus 線稿(14/24)視覺偏重,2026-09-02 user 抓「太巨大」後改自繪)。
- textarea `aria-label="訊息"`。

### 8. AgentDecisionCard(決策卡)

- 僅代理被阻擋、需人決策時出現;完全覆蓋輸入區、貼面板底。
- 繼承 Popover surface(rounded-lg、border、elevation-200、compact header 45)+SurfaceFooter;
  改寫:無下圓角;header 下、footer 上無分隔線;body 上下無內距、左右 `--layout-space-loose`。
- Header:`[小標「n / N」(僅 N>1)][題目 text-body font-medium][×=跳過]`,items-start。
- 選項卡(拍板樣張 2026-09-02):每個選項=灰底卡 `bg-secondary rounded-md px-3 py-2`,
  **整卡可點**;卡片組合 `SelectionItem`(**py 0**:卡的 py 8 是唯一行距 owner,SelectionItem 自帶
  (32−1lh)/2 歸零,避免 double padding——`../Checkbox/checkbox.spec.md`「零外部 gap」鐵律的反向)
  + RadioGroupItem md(複選=Checkbox md);radio↔label 8、label↔description 2;卡間距 8。
  「其他」卡永遠最後、**常駐 Input**(md 32;label 行框↔Input 8;左縮排 24 = radio 16 + gap 8 對齊 label,
  [Polaris ChoiceChildren 同款](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/Choice/Choice.module.css);
  距卡右/下各 12);聚焦即選中「其他」;**滑鼠/觸控點整張「其他」卡 → 自動聚焦 Input**(明確指向意圖),
  鍵盤方向鍵選中不搶焦點(APG radio roving,Tab 一步即到);radio `aria-controls` 指向 Input。
  幾何:一般卡 8+21+2+21+8 = 60;「其他」卡 8+21+8+32+12 = 81。
- 關閉:header × 恆為跳過;第一題另有跳過鈕(第二題起左鈕換成上一題),兩者同一行為=跳過;無 Esc、無外點關閉(阻擋語意)。
- 步進:**一題一步**,footer 左鈕=第一題「跳過」(用預設繼續)、第二題起「上一題」(答案保留;
  [Material Stepper Back](https://m1.material.io/components/steppers.html) / [GOV.UK Back link](https://design-system.service.gov.uk/components/back-link/) 同款,
  2026-09-02 user 拍板);右鈕=「下一題」、末步「送出」;header × 恆為跳過。
  「其他」選中而文字為空 → 下一題/送出 disabled。
- 選項=**RadioGroup md 包裝不改造**(Popover all-sm 律之顯式拍板豁免;footer 鈕維持 sm 守律);
  預選項(`defaultValue`,省略=第一項)由元件在 label 後加「(建議)」。
- 進出=淡入+下滑 8、`--motion-duration-overlay`。
- A11y:`role="group"` + `aria-labelledby`;radiogroup / checkbox 原生鍵盤。

#### 產題守則(約束代理出題品質;標 ⚙ 者由元件 DEV 警告或渲染邏輯機械強制)

1. ⚙ **題數 1–3,每題必須改變代理下一步**;能一題就不問兩題;禁「計畫可以嗎?」類空問。
   ([Claude Agent SDK AskUserQuestion 1–4 題/次](https://code.claude.com/docs/en/agent-sdk/user-input),
   本 DS 收緊為 ≤3;[GOV.UK one thing per page](https://design-system.service.gov.uk/patterns/question-pages/))
2. ⚙ **一題一步**:一次只顯示一題;N≥2 才顯示小標「n / N」;第二題起可「上一題」回頭改答(答案保留),不可跳題。
   ([GOV.UK 需要才加簡單「Question 3 of 9」](https://design-system.service.gov.uk/patterns/question-pages/);
   [NN/g wizards 標出目前步、強制順序](https://www.nngroup.com/articles/wizards/))
3. ⚙ **題目=一句完整問句、以「?」結尾、句內點名決策對象**(「公告要用哪種語氣?」);禁「確定嗎?」「注意!」。
   ([Material 對話框標題=問句或陳述、禁 Are you sure?](https://m1.material.io/components/dialogs.html))
4. ⚙ **具名選項 2–4 個**(不含「其他」);>4 → 拆題。
   ([SDK 2–4 options](https://code.claude.com/docs/en/agent-sdk/user-input);
   [NN/g ≤5 用 radio](https://www.nngroup.com/articles/listbox-dropdown/);`../RadioGroup/radio-group.spec.md`「2-5 且全部可見」)
5. ⚙ **選項標籤單行、≤10 字、無句尾標點、同題平行結構**;標籤說「選了會怎樣」,禁 A/B/C、「方案一」。
   ([Polaris ChoiceList:label based on what the option will do、無句尾標點](https://github.com/Shopify/polaris/blob/main/polaris.shopify.com/content/components/selection-and-input/choice-list.mdx))
6. ⚙ **每個具名選項附一行差異描述**:單句、無句號、不重複標籤、同題各選項比同一個維度(後果/取捨)。
   ([GOV.UK hint 單句無句號](https://design-system.service.gov.uk/components/radios/))
7. ⚙ **「其他」由元件附加、永遠最後**;代理不得自列「其他」;送出值=使用者文字(非「其他」二字);空字串不得前進。
   ([SDK:custom text as the answer value, not the word 'Other'](https://code.claude.com/docs/en/agent-sdk/user-input);
   [GOV.UK none 選項放最後](https://design-system.service.gov.uk/components/checkboxes/))
8. ⚙ **單選題必預選推薦解、推薦解排第一、「(建議)」由元件標**(代理不寫該字樣);推薦必是代理有證據的最佳解。
   例外:不可逆/安全/法律/身分稱謂類題 `noDefault` 不預選,把後果寫進描述。
   ([NN/g:pre-select the recommended when confident;例外 legal/presumptuous](https://www.nngroup.com/articles/radio-buttons-default-selection/);
   反例 [GOV.UK do not pre-select](https://design-system.service.gov.uk/components/radios/) 的顧慮是漏答/交錯答,本卡一題一步且 Skip 明示用預設繼續,故取 NN/g 立場)
9. **排序**:推薦第一;其餘常見→少見或邏輯序(小→大、保守→激進),禁字母序;「其他」最後。
   ([GOV.UK most-to-least common](https://design-system.service.gov.uk/components/radios/))
10. ⚙ **單選為預設;答案本質可複選才 `multiSelect`**(「要包含哪些章節?」):複選改 CheckboxGroup、選項不得互斥、
    **不預選**、仍附「其他」。([SDK multiSelect](https://code.claude.com/docs/en/agent-sdk/user-input);
    [GOV.UK checkboxes 不預選](https://design-system.service.gov.uk/components/checkboxes/))
11. ⚙ **Skip=「全部用預設繼續」**(非取消、非關對話);header × 恆為 Skip;footer 只有兩鈕(第一題 跳過/下一題,之後 上一題/下一題|送出)。
    ([Material ≤2 actions、肯定右否定左](https://m1.material.io/components/dialogs.html);[NN/g wizards allow exit midway](https://www.nngroup.com/articles/wizards/))
12. **題與題互不依賴**:後題不因前題答案改變;需要分支 → 下一回合另開一張卡。
    ([NN/g wizards self-sufficient steps](https://www.nngroup.com/articles/wizards/))
13. **每步不需捲動即可讀完**(面板寬內 4 選項+描述皆單行);描述過長=精簡,不截斷
    (`../Checkbox/checkbox.spec.md`「Clamp 政策」;ScrollArea 僅兜底)。
14. **內容真實**:題目與選項必是可辨識業務情境(檔名、頻道、客戶名);禁 Option A/B/C、Lorem(`AGENTS.md` mindset #4)。

### 9. AgentDecisionSummary(決策回執)

- 決策完成後在對話流中的靜態回執:`border-border rounded-md`;問題=fg-secondary、
  答案=foreground。無互動。

### 附:歷史浮層(消費現成,不新增公開元件)

- **寬度 = Popover canonical `w-72`(288)**,不另訂(2026-09-02 user 問「寬度訂多少」:實測 ChatGPT 側欄 260、
  Claude 側欄 290,DS 既有 rich-popover 288 落在其間;面板最窄 360 時自標題左緣起仍有 312 可容)。
- **與觸發點距 = `OVERLAY_SIDE_OFFSET` 8**(`tokens/elevation/overlay-geometry.ts`;實測 popper wrapper
  translateY = 觸發鈕底 + 8;量測時分頁必在前景,背景分頁會凍在 slide-in 起點量到 0.5)。

- 可搜尋單選選單:SelectMenu 同源 primitives 之 DS 內部組合(Popover+Command+MenuItem;
  SelectMenu 資料驅動 API 放不下列級行內動作與進度圖示替換,故同源組裝——metrics 全同:
  容器 p-0/rounded-lg/elevation-200/minWidth 240、搜尋列 40、列 32/px-12/gap-8、組標 py-2)。
- 錨=標題觸發下緣+8(OVERLAY_SIDE_OFFSET);列=CommandItem `p-0 rounded-none` 包 MenuItem
  (select-menu.tsx 同源:選中列 `bg-neutral-selected`;標題單行截斷 `labelMaxLines={1}`,SelectMenu 列同款;
  後綴=MenuItem endContent slot 內 ItemSuffix hoverReveal + ItemInlineAction 16/18、gap 8、距列右緣 12,
  逐項對齊 inline-action.spec.md);組標=CommandGroup `heading`(MenuItem header,
  今天/昨天/更早)+ CommandSeparator;無結果=`<Empty>`(CommandEmpty);搜尋列 `h-8 py-0`(列高 40 守 SelectMenu)。
- 懸停/聚焦浮出「改名/刪除」(ItemSuffix `hoverReveal` + ItemInlineAction 16/18,150ms 淡入;
  鍵盤 Tab 可達、focus-visible 同樣顯示;**Enter / Space 在行內動作上 = 啟動該動作**,不是選列
  ——cmdk 的 Enter=選列在此以 stopPropagation 擋掉,2026-09-02 實測補);思考中列首圖示原地換 **CircularProgress 16**,等寬等高不動版面。
- 改名=Dialog(`autoHeight` 隨內容、寬 440 = DS 確認框/短表單慣例;Field「名稱」+Input 預填全選、`required`;
  空白 → `invalid` + FieldError「名稱不可空白」,儲存停用;Enter=儲存;Esc=Dialog 原生關閉=回復);
  刪除=Dialog 危險樣式(`primary + danger`,同 autoHeight/440)。
  **刪當前對話契約**(consumer 實作,spec 定義):切到最近一則;全空→空狀態(NewConversation)。
- 選定→切換對話、標題同步、浮層關閉;Dialog 關閉後焦點:浮層仍開 → 回觸發它的行內動作(改名/刪除),浮層已關 → 回標題觸發。
- 所有 callback(`onSelectConversation` / `onRenameConversation` / `onDeleteConversation`)可省略,列與動作仍渲染(固定 anatomy 律)。

### 附:空狀態

- 問候區圖示位=`<AgentLogo state="attract" size={48}>`(招喚態邀請開始);
  其餘照既有 Empty 元件(icon slot)。

## AgentLogo(標誌;附屬資產)

- 造型=user 提供黃金比例莫比烏斯 SVG 定稿(內橢圓長短軸比 φ、軸角 121.717°);
  產品用尺寸 16-48(展示 story 放大到 72 以便逐格檢視動畫,不是新的產品級距);**所有尺寸同一造型**(4 層:面 + 底面陰影 + 面 + 提亮;2026-09-02 user 拍板:
  形狀規則、不設簡化檔;原「≤24 自動簡化」與 `detail` prop 已移除)。
- 一息 3 秒家族(文字微光 2s 另計);緩動=swell(吸/起)/ settle(呼/收)/ exit(加速起步)token 值。
- **呼吸包絡(招喚與思考共用)**:0 靜 → **35% 吸頂**(脹 1.07、白疊層 14%)→ **85% 回落到底** →
  **85–100% 靜止空拍**;呼出去的波 0–35% 貼邊聚亮 → 35% 離體 → **90% 散盡**(比本體多 0.15s 餘韻)。
  依據:靜息呼吸 12–20 次/分 → 一息 3–5s([NCBI StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK537306/));
  靜息 I:E ≈ 1:2、呼氣為被動回彈且呼氣末有停頓([Deranged Physiology](https://derangedphysiology.com/main/cicm-primary-exam/respiratory-system/Chapter-539/inspiratory-pause-ie-ratio-and-inspiratory-rise-time));
  脹=吸氣([Apple Watch Breathe](https://support.apple.com/guide/watch/start-a-reflect-or-breathe-session-apd371dfe3d7/watchos))。
  **亮度包絡取代透明度包絡**:吸氣亮(白疊層)、呼氣暗;本體不透明度恆 1——白面上變淡=像停用,
  且與 shrink/scale 疊加屬前庭誘因([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion));
  2026-09-02 user 問「呼吸是否搭配透明度」→ 研究結論採亮度包絡 + 靜止空拍,不加透明度。
- **每次進入狀態從靜止起跑**:SMIL `begin="indefinite"` + 掛載當下 `beginElement()`(文件時間軸的
  `begin="0s"` 會讓晚掛的動畫從半途起跑、加速段直接凍在終點);同一 commit 掛上的標誌本體與 FAB 光圈同相。
  **起跑鍵必含 exit 段**:think → 減速段新掛的洞形變與亮度淡出同樣是 `begin="indefinite"`,鍵不含該段 = 7 個
  animate 永不起跑(整段減速洞持圓、停定瞬間跳回橢圓;2026-09-03 逐格實測的斷層根因);已起跑的呼吸疊層
  由 `data-begun` 守衛不重啟。機械驗證 = `scripts/agent-logo-continuity-invariant.mjs` C6。
  同一支腳本的 **C7/C8 是純原始碼靜態檢查、不開瀏覽器**,所以任何環境都真的跑(不會被 SKIPPED-ENV 蓋掉):
  C7 從定稿 path 反解外輪廓圓心並比對 `LOGO_CX/LOGO_CY`,同時掃 tsx 內是否還有把 627 當中心用的殘留
  (扣掉註解後全掃,不列舉寫法);C8 擋轉速寫死 —— ω 必須由 `BREATH_S / SPIN_TURNS_PER_BREATH` 推出,
  且一息必須切成整數圈。
- 狀態(prop `state`;「招喚/漣漪」為本家族新造狀態名,定義唯一住所=本節):
  - **still 靜止(=待機)**:完全不動。2026-09-02 拍板:待機一律靜止,不另立呼吸態,狀態分類收斂為三態。
  - **attract 招喚**(空狀態/FAB 有新訊):呼吸包絡上的脹 1.07+吸氣微亮(白疊層 0→14%→0→0)
    +遮罩單波(雙色放射盤內藍 .5→靛 .44→紫 .34→邊緣 0;行程 560→830;0–35% 貼邊聚亮(swell)、
    35% 離體擴散(settle)、90% 散盡;遮罩護負空間、無模糊)。`ripple={false}` 供 FAB 光圈代位。
  - **think 思考**(=回覆中):靜止起步 → 加速 0.25s(=半圈,exit 曲線,位移 126° 使交接速度連續)
    → 等速 **720°/s(0.5s/圈 = 一息/6)**,linear,**持續到離開思考,一直思考就不停**;離開思考 →
    **減速段**:從當下角度以 exit 曲線的時間鏡像 (0,0,0.7,1) 續轉最小 ≥252° 且落回正位 0° 的角度
    (時長 Δ/(ω·0.7) ∈ 0.50–1.21s,交接速度連續、停定即正位),**停定即接靜止、不淡入**(見「轉場」)。
    轉速依據(2026-09-04 修訂;取代 2026-09-02 版):比較對象一律取**出貨值**、逐檔讀第一手原始碼,
    由快到慢 —— [Chakra v2 0.45s](https://github.com/chakra-ui/chakra-ui/blob/v2/packages/components/src/spinner/spinner.tsx#L68)、
    [Carbon 690ms](https://github.com/carbon-design-system/carbon/blob/main/packages/styles/scss/components/loading/_animation.scss#L13)、
    [Bootstrap .75s](https://github.com/twbs/bootstrap/blob/main/scss/_variables.scss#L1694)、
    [Radix Themes 800ms](https://github.com/radix-ui/themes/blob/main/packages/radix-ui-themes/src/components/spinner.css#L2)、
    [Primer 1000ms](https://github.com/primer/react/blob/main/packages/react/src/Spinner/Spinner.tsx#L10)、
    [Ant 1.2s](https://github.com/ant-design/ant-design/blob/master/components/spin/style/index.ts#L196)、
    [Fluent 1.5s](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-spinner/library/src/components/Spinner/useSpinnerStyles.styles.ts#L58)、
    [VS Code 1.5s](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css#L23)、
    [Material 3 ≈1568ms](https://github.com/material-components/material-web/blob/main/progress/internal/_circular-progress.scss#L47)
    (單層等速旋轉的常數是 `$linear-rotate-duration: calc($arc-duration * 360 / 306)` = 1333 × 360 / 306 ≈ 1568ms;
    `#L43` 的 `$arc-duration: 1333ms` 是弧長形變週期、不是轉速 —— 2026-09-05 更正,2026-09-02 版原本寫對,
    Material 因此移到「由快到慢」最慢端)。
    取 **0.5s/圈**:落在最快檔 0.45–0.69s 之內,不是自創的更快值;唯一更快的出貨值 0.45s 只多 11% 速度,
    卻讓「一息 = N 圈」斷掉(3 ÷ 0.45 = 6.67),故不取。實心雙緞帶比細弧線更吃轉速,取最快檔而非中性帶。
    **閃爍**:造型無 C2 對稱(洞心繞轉軸轉 180° 不落回自身)→ 整圈才重複一次 = 2.0 Hz,低於
    [WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) 的 3 次/秒;
    且 24px 全圖僅 576 px²,遠低於其面積門檻 341×256 = 87,296 px²。
    (2026-09-02 版曾以「600ms = urgent/frantic」定上限,來源是一篇 Jetpack Compose 教學、無研究方法,
    且被誤記為「實測」;2026-09-04 撤除該引用,改以出貨值定範圍。)
    加速未完即離開 → 等加速段結束再減速;<1 影格直接切。+**負空間形變耦合轉速**(起步 0.25s 洞
    橢圓→正圓、同 exit 曲線,轉到最快時洞正好圓;等速持圓;減速段正圓→橢圓、同 DECEL 曲線與時長,停定 0°
    時洞正好回定稿形。2026-09-02 user 問「形變是否用在高速」→ 由 6s 呼吸圓化改為速度耦合:形狀說速度、
    亮度說呼吸;對齊 squash-and-stretch「形變跟著速度」與 Dynamic Island「形隨動作」)+吸氣微亮(亮度
    6s=2 息,峰值 14% 與招喚統一)+色流動(色場定錨畫布=漸層同構逆轉,減速段同步)。
- **轉心 = 外輪廓圓心 (634.671, 604.106),不是 viewBox 中心 (627, 627)**(2026-09-04 修訂):
  墨色區 = 圓盤(r=505.300)減內橢圓;圓盤圓心由外弧端點反解(SVG 1.1 §F.6.5)得上值,與 viewBox 中心
  差 24.145 單位 = 外半徑的 4.78%。旋轉/縮放/波源全部用它。繞 viewBox 中心會出兩個瑕疵:
  (a) 思考態外緣每圈進出一次,24px 下**峰對峰 0.924px**,讀起來像動畫沒對正、不是轉速;
  (b) 招喚態遮罩(r=512)原想留 6.7 單位等寬餘量,偏心後一側超出本體 17.4、對側多切 30.8,
  光暈與本體邊緣之間出現不對稱死環。三個轉心選項覆算:外輪廓圓心對 viewBox 中心是 **Pareto 支配**
  (外緣晃動 24.145→0,洞公轉半徑 65.051→43.487);移到洞心則外緣晃動反增到 43.487,更糟。
- **負空間不置中**(2026-09-04;回答「最快速時洞是否該回到標誌中心」):**不要**。最快速時洞已是正圓,
  正圓與圓盤同心 = 完美圓環 = 旋轉不變,輪廓運動歸零 —— 恰好在最需要速度感的一刻把速度訊號關掉;
  且洞心與圓盤心相距 43.487 單位是定稿造型的**剛體不變量**(任何轉心選擇都不改變),要歸零只能改寫
  定稿路徑,等於在最被注視的一刻把黃金比例莫比烏斯換成泛用同心圓環。速度訊號維持由 2026-09-02 拍板的
  「形狀說速度」(橢圓→正圓)承擔,不另加位移通道。
- 轉場:狀態切換=新狀態 0.15s 淡入(`--motion-duration-overlay`,只動 opacity),禁跳切;**例外:still ↔ think
  不淡入**——兩邊在交接那一刻本來就長得一模一樣(定稿形、0°、無疊層),淡入會讓整顆先變透明再回來 = 斷層
  (2026-09-03 user「最後沒有流暢地把負空間以及色彩回復」根因之一);淡入只留給形態真的不同的交接(招喚 ↔ 其他)。
  減速段的色場基底亦設為當下角度,否則起跑前一影格會閃回 0°。**減動作**:
  互動觸發必可停(WCAG 2.3.3);常駐 loop 全停(嚴於條文),一律回靜止、淡入亦停。
- 多實例安全:漸層/遮罩 id 以 useId 唯一化。

## AgentFab(浮動開關鈕;附屬資產)

- 40 圓=`--field-height-lg` 於 lg 密度;圓形 iconOnly;面=`bg-surface-raised`+
  `--elevation-200`(不寫死白色);內置 24 標誌(同一造型)。
- 外框=AI 觸發鈕特調:錐形(環向)漸層描邊 2px(整數寬+環向漸層=正圓對稱);
  兩極=`AGENT_BRAND` 藍 258 / 紫 294(= `--color-blue-4` / `--color-purple-4`;品牌資產常數,agent-panel-logo.tsx 唯一數值來源;各落於兩緞帶
  色相家族內;2026-09-02 藍→紫改色)。
- 動畫:待機=靜止(=標誌 still 態;2026-09-02 拍板全家族待機一律靜止);
  有新訊=招喚態(標誌蓄勢;漣漪由邊框光圈代位:0–35% 貼邊聚亮至 .35(swell)→ 35% 呼氣起點
  自邊框射出 r 21→27(settle)→ 90% 散盡 → 靜止空拍;寬 2.5;與標誌同 dur/keyTimes/曲線、同一
  commit 掛載故同相;光圈漸層=環同兩極同方位);懸停=陰影升一級+微放大;點擊=開面板。
- 減動作:光圈屬位移 loop → 全停(標誌內部自回靜止)。
- **標誌狀態跟著面板裡的代理走**(prop `logoState`,與 `AgentPanelHeader.logoState` 同名 —— 產品端同一個變數餵兩邊;
  2026-09-03 user 拍板「若開啟的 session 是思考中,FAB 的 logo 也應該是思考中」):入口鈕 = 那個對話**收起來的樣子**,
  不是另一個獨立的東西 —— 代理在回覆時即使面板關著,入口鈕標誌照樣轉(`think`);有新訊 = 招喚(`attract`,標誌蓄勢
  + 邊框光圈);閒置 = 靜止(`still`)。兩種形態(40 圓 / 28 貼邊)都跟,尺寸變、狀態不變。光圈只給招喚態:思考態的
  訊號是標誌自己在轉,再加光圈會變成兩個 loop 互相打架。對照:[Android Bubbles 收合後仍以圖示承載該對話的動態](https://developer.android.com/develop/ui/views/notifications/bubbles)。
- **放置與互斥**(2026-09-02 拍板;2026-09-03 抽成元件):FAB 為 opt-in 浮動入口,固定於舞台右下、內距
  `--layout-space-loose`(16/24;Material FAB 最小邊距同值);**面板開 → FAB 隱藏、面板關 → FAB 回來**
  (兩者互斥,開面板的入口與關面板的 × 不並存)。互斥、位置記憶與標誌狀態的**唯一住所 = `AgentPanelDock`**
  (`<AgentPanelDock logoState={s}>{({ close, logoState }) => <AgentPanel>…</AgentPanel>}</AgentPanelDock>`,
  外層容器需 `relative`):開時只渲染面板(× 接 `close`)、關時只渲染入口鈕(點一下開回來);產品端與所有 story
  都用它,不各自寫一份 `open ? panel : fab`(「入口鈕三態」那個 story 例外:它展示的是獨立 `AgentFab` 的三種標誌狀態,沒有面板可互斥)。
  **一個舞台一個 Dock**:家的座標只有一組(右下角離邊 loose),同一個 relative 容器內放兩個 `AgentPanelDock` 會像素級重疊;
  要在同一頁擺兩個代理入口,請各自給不同的 relative 舞台(2026-09-03 稽核補上的不變式)。
- **遮擋與貼邊**(`AgentFabDock`;演進:2026-09-02 拖到邊 → hover 小鈕 → 拖曳自由座標 → 2026-09-03 user 拍板
  「只有家與貼邊兩種位置」→ 帶的幾何(寬 36、下半部)→ 帶的樣式(drop-target 底 + 三邊虛線框)。**用語統一**:
  位置叫「家 / 貼邊」、區域叫「帶」、動作文案叫「縮小按鈕 / 放大按鈕」,不再用「收到邊 / 收合 / 小鈕 / 藍框」):40 外徑 + loose 內距 = 佔右下 56×56(md)/ 64×64(lg),
  與表格分頁列「操作右」必撞 → 主鈕可拖到右緣貼邊:
  - **命中區 = 可視形狀本身**(2026-09-04 user 拍板原話:「按鈕的視覺 = 觸發事件的範圍 = 會觸發 tooltip 的範圍」;
    「當我點擊按鈕的任何地方包括左側靠近邊邊的地方,只要還在按鈕範圍內就應該觸發事件」)。
    三者**恆等**,沒有例外可以解釋:看得到的每一點都點得到、點得到的每一點都看得到、會出 tooltip 的範圍就是這一塊。
    作法:語意 `<button>` 的尺寸與圓角**都等於可視形狀**(貼邊 28 + `rounded-l-full`、在家 40 + `rounded-full`);
    漸層環是這一層自己的 2px padding,內層 span 只負責面色,所以按鈕的 border box 邊緣就是使用者看到的邊緣。
    **DOM 盒 / 無障礙 target / 命中區 / Radix 錨點四者是同一個形狀。**
    - **不外推**(2026-09-03 曾外推到 40×40,2026-09-04 撤回):外推會生出隱形帶,搶走底下內容的點擊,
      並把 Radix 錨點推遠(tooltip 離可視形狀 20px 而不是 8px)。tooltip 與觸發點的距離恆為 8px(`OVERLAY_SIDE_OFFSET`),
      兩者不重疊 —— 所以「點 tooltip 觸發按鈕」不是需求,也不該發生。
    - **「會出 tooltip 的範圍」指的是觸發範圍,不是「tooltip 保持開著的範圍」**(2026-09-05 更正敘述):Radix Tooltip
      未設 `disableHoverableContent` 時,游標離開鈕、穿過那 8px 空隙移向 tooltip 的期間 tooltip 不關
      ([Radix Tooltip `disableHoverableContent` / hoverable content](https://www.radix-ui.com/primitives/docs/components/tooltip)),
      這是**刻意保留**的 —— [WCAG 1.4.13 Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)
      要求懸停內容可被指標到達(hoverable)。空隙上的點擊落到底下內容是正確的,tooltip 開著不代表那裡屬於鈕。
      定位殼改 `w-fit`(2026-09-04)拿掉的是殼比鈕寬 12px 的**結構鬆弛**(殼一直是 `pointer-events-none`,從未參與命中);
      它對「空隙上 tooltip 仍開著」沒有、也不可能有影響 —— 先前把「殼的帶讓 tooltip 開著」記為此症狀的根因是誤判,撤回。
      命中區 ≡ 可視形狀仍是唯一契約。
    - **也不內縮**:先前寫成「按鈕保持矩形、圓角只畫內層,角落才點得到」,那是把**多**當成修正 ——
      使用者要的是相等。(同時撤回一條誤判:2026-09-03 記錄「貼邊態 dy=±12 時最左 1–3px 點不到」並歸因於圓角命中;
      複核幾何後,D 形在該高度的左緣本來就在 x≈6.8 而非 x=0,那幾點原本就在**視覺之外**,不是死區。)
    - **貼邊鈕壓在別人的捲軸上時,鈕贏**(2026-09-04 user 拍板原話:「按鈕可能已經蓋到了表格的捲軸,
      但點按鈕仍應該觸發按鈕的事件而不應該是捲動捲軸,因為按鈕是蓋在表格上,fab 通常也都是 z-index 最上面的東西」)。
      入口鈕是浮在內容之上的全域入口,不是內容的一部分;它蓋到什麼,那一塊就歸它。
      實測(真實滑鼠,非 `elementFromPoint`):貼邊鈕 x=1179–1207 與 DataTable 垂直捲軸 x≈1175–1190 重疊約 11px,
      在重疊區點擊 → 面板開啟、`scrollTop` 不變。
      **注意**:`document.elementFromPoint` **看不到原生捲軸**(它不是 DOM 元素),所以這一條只能用真實指標事件驗,
      不能用命中圖 —— 先前的「每一點都命中」驗證對這個場景是盲的。
      (本條取代 2026-09-03 的舊立場「捲軸露出的那幾 px 不屬於鈕,點在那裡捲動內容是正確行為」。)
    - **懸停微放大掛在按鈕上**(不是內層):命中盒與可視形狀一起放大,兩者永遠同步;掛在內層的話
      放大後可視會比命中盒大一圈。陰影升一級畫在內層(陰影屬於那個看得見的形狀)。值與獨立
      `AgentFab` 同一組(`scale-[1.04]` + `--elevation-200-hover`),沒有另訂。
    - **已登記未修**(2026-09-04 對抗式稽核):(a) `AgentPanelDock` 開面板時整顆 `AgentFabDock` 被卸載,
      關回來是全新掛載 → 首格 `size` 為 0,`placementStyle` 在 `s.h === 0` 時不夾 y,若面板開著期間視窗
      變矮,記住的貼邊 y 會先畫在超出合法範圍的位置再跳回;同一格的 `inset` 也還是 fallback 16。
      (b) `resizable` 把手改用 `patterns/resize-handle` 後 pointerdown 多了 `preventDefault()`,
      理論上會讓「拖欄寬時編輯中的 cell 自動結算」的時機改變 —— **未實測**(本機沙箱起不了 Chromium),
      不寫成已知行為。
    - **機械閘**:`scripts/agent-fab-hit-area-invariant.mjs` 掃 `elementFromPoint().closest('button')` 的
      **真實命中測試**(不是 class 或 rect 的字面值),逐點分類「在可視形狀內/外」(圓角半徑直接讀
      computed style,所以任何形態都適用),斷言 **H1 可視形狀內每一點都點得到(0 個死點)/
      H4 可視形狀外不得點得到(只容 1.5px 次像素,再多就是隱形帶)/ H5 定位殼不得大於鈕 /
      H2 不越舞台右下緣 / H3 舞台零溢出**;
      **注意此閘驗不到「鈕壓在原生捲軸上」那一條** —— `elementFromPoint` 看不到捲軸(它不是 DOM 元素),
      那條只能用真實指標事件驗;
      併在 `npm run test:agent-panel-invariants`。最小點擊尺寸的世界級對照
      ([Apple HIG 44pt](https://developer.apple.com/design/human-interface-guidelines/buttons) /
      [WCAG 2.5.5 Target Size (Enhanced) 44 CSS px](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html))
      是**尺寸建議**,不是「命中要大於視覺」的依據 —— 要滿足它應該把**可視形狀**做大,而不是加隱形邊。
  - **只有兩種合法位置**:「家」= 圓鈕 40,位置唯一在右下角(離右、下各 loose;[Android FAB 官方範例
    `layout_margin` 16dp](https://developer.android.com/develop/ui/views/components/floating-action-button)、Teambition 16,
    lg 密度 24)/「貼邊」= 收合鈕 `--field-height-sm` 28 貼右緣半圓(只留內側圓角、環只畫露出三邊、內置 16 標誌;
    招喚態同款蓄勢、光圈省略),只有 y 可變、夾在右緣帶內。沒有第三種位置,使用者不可能把鈕拖到難用的地方。
    **兩種形態點一下都直接開面板**(一段);< 8px 位移視為點擊。
  - **右緣帶**(磁吸區;2026-09-03 user 留言拍板幾何):寬 36(= `--field-height-md`;游標離右緣 ≤ 36 即進帶,已在帶內時
    再多 16px 才算離開,遲滯防抖);上緣 = 貼邊鈕圓心落在視窗中線(鈕頂 = 舞台高 ÷ 2 − 14);下緣 = 貼邊鈕底離家頂一個
    loose(鈕頂 = 舞台高 − 2·loose − 68)。貼邊鈕只能從中線往下拖到家上方,永不與家重疊、不壓分頁列;矮視窗放不下時整帶
    收成中線一點。帶(底色)= 這個矩形 = 貼邊鈕合法 y 範圍。判定用**指標**位置(意圖在指尖)。
  - **拖 40 圓鈕(所見即所得)**:鈕全程跟著游標;整段拖曳期間右緣帶以**底色 + 三邊虛線框**標出(見下「帶的樣式」);
    游標一進帶內,預覽當場變成貼邊鈕**貼在右緣、停在放開會落的高度**(帶內所見即所得,不預告在游標下);
    放開在帶內 → 落定;放開在帶外 → 飛回家。
  - **拖 28 貼邊鈕**:不顯示帶;帶內沿 y 移動維持貼邊鈕;一出帶外當場變回 40 圓鈕、放開飛回家。
  - **帶的樣式**(2026-09-03 user 拍板;SSOT = `color.spec.md`「Drop target」段):消費 DS「可放下的區域」配對 ——
    底 `bg-drop-target`(`--primary` @ 15% **兩模式都半透明**:覆蓋在頁面內容上就不能不透明,VS Code theme-color 鐵律;
    15% = DS alpha 階梯上的既有階,且落在世界級區間 Material dragged 0.16 / VS Code 0.18 / Atlassian ≈0.20)+ **三邊 2px dashed**
    `border-drop-target-border`(= `--primary-hover`;dashed = DS「可放下的暫時目標」語彙,與 FileUpload 拖入區同一組 token)。
    **貼右緣那側不畫線、不留圓角**(`border-r-0 rounded-l-md`;Sheet / Sidebar / AppShell 側欄 / 貼邊鈕「環只畫露出三邊」同語言)。
    與 FileUpload 常駐拖入區的分工:那邊靜止就看得見、進入合法區只換邊框不填色;這裡憑空出現、需要整區底色才讀得出範圍,
    落點回饋由鈕自己的所見即所得預覽承擔(對照表在 color.spec.md)。
  - **等價路徑**:鍵盤 家 → `→` 貼邊(停在帶底 = 家頂上方一個 loose);貼邊 `↑↓` 16px、`←` / Home 回家;右鍵 / Shift+F10
    DropdownMenu 依狀態只給一項(家:「縮小按鈕」`ArrowRightToLine` / 貼邊:「放大按鈕」`ArrowLeftFromLine` —— 線 = 右緣、
    箭頭方向 = 鍵盤 → / ← 等價路徑,[lucide 官方 tags collapse / expand 鏡像對](https://github.com/lucide-icons/lucide/blob/main/icons/arrow-right-to-line.json);
    Maximize2 家族在 DS = 全螢幕、Panel 家族 = 面板本身,故不用;2026-09-03 user 拍板「縮小按鈕與放大按鈕
    + 前綴 icon」——「按鈕」點名對象,與 FileViewer 內容縮放的「放大 / 縮小」不混淆;DS 無 ContextMenu,以受控 DropdownMenu 代);
    拖曳中 Esc 取消回原位。Tooltip 兩態不同:家「問我或推走我」(2026-09-03 user 文案,邀請拖曳)/ 貼邊
    「開啟智慧代理」(2026-09-03 user 留言:小鈕只寫開啟;= aria-label);拖曳中不顯示。
  - **動作**(依 motion.spec.md;2026-09-03 對照四家後定):形態切換 `--motion-duration-overlay` 150ms
    ([Carbon moderate-01 150ms「小型展開、短距離移動」](https://carbondesignsystem.com/elements/motion/overview/))/
    飛回家與落點修正 `--motion-duration-surface` 250ms + enter 曲線([Atlassian transitions 150–400ms「較長時長幫助
    追蹤空間變化」](https://atlassian.design/foundations/motion);拖曳中跟指標不過渡)/ 帶底色淡入淡出 150ms;
    prefers-reduced-motion 三者全部直接落定([Atlassian「全部停用仍可用」](https://atlassian.design/foundations/motion)、
    [Fluent「提供 no motion 設定」](https://fluent2.microsoft.design/motion)、WCAG 2.3.3)。
  - **區域 → 落點表(可擴充)**:磁吸邏輯 = 依序判定指標所在區域,命中即決定「預覽 = 落點」;沒命中 = 圓鈕跟游標、
    放開回家;要加磁吸點(鏡像左緣、四角)只在 `agent-panel-fab.tsx` `SNAP_ZONES` 加一列(區域矩形同時就是帶的底色範圍),流程不變。
    判準:以指標判定、一區一落點一形狀、邊界 16px 遲滯、區域不重疊且邊帶優先於角落、無命中不做「最近磁吸點」
    (會從放開處跳走)。上緣 / 下緣永不設區(標題列 / 分頁列)。**指標 x 夾在舞台內再判區(超出右緣讀作右緣;y 不夾)**:
    拖曳用 pointer capture,`clientX` 可以越過視窗右緣,夾回舞台後仍落在右緣帶內 → 拖過頭一樣算貼邊;y 不夾,越過上下緣就是沒命中。
  - 位置由 consumer 受控/非受控(`placement / defaultPlacement / onPlacementChange`,`{kind:'home'}` /
    `{kind:'dock',y}`),DS 不寫 storage;要跨 session 記憶由 consumer 存。
  - 對照:[Copilot DAB 可拖到內容區側邊變小圖示、拖回畫布即展開](https://support.microsoft.com/en-us/office/foundations-experiences/copilot-dab/the-copilot-dynamic-action-button-in-word-excel-and-powerpoint)、
    [Windows Snap「拖到螢幕邊時 Snap 框當場顯示」= 拖曳中預告落點](https://support.microsoft.com/en-us/windows/snap-your-windows-885a9b1e-a983-a3b1-16cd-c531795e6241)、
    [Android Bubbles 任意拖、拖到底部才出現關閉區](https://developer.android.com/develop/ui/views/notifications/bubbles)、
    [Teambition 專案頁 hover「−」收到右緣、點圓弧先展開](https://www.teambition.com/)(2026-09-02 實測;本 DS 收合後
    一段即開、且形態在拖曳中就切換,比它少一步、回饋更早);Material 明文 FAB 不移動
    ([M3 FAB](https://m3.material.io/components/floating-action-button/guidelines))→ 可拖在 DS 為 opt-in。
- A11y:`aria-label="開啟智慧代理"`。

## 附:anatomy 分層 rationale(2026-09-03 稽核補)

設計規格層提供 Overview / 尺寸對照表 / 色彩對照表 / 狀態行為 / 無障礙五節。**Inspector 判 N/A** 並寫在這裡(而不是只寫在
story 檔頭):本家族沒有可切換的視覺 variant/size prop —— 面板寬是連續值(拖拉/鍵盤即所見)、標誌狀態已由展示層
「標誌三態」與「思考起步與減速停止」承載、入口鈕形態由位置決定而非 prop,即時預覽面板會退化成一個沒有旋鈕的空殼。
其餘五節齊備,尺寸與色彩皆標 token 來源。

## 動畫總表

| 場景 | 動畫 | 級距 |
|---|---|---|
| 面板開合 | 淡入+右滑 | `--motion-duration-surface` 250ms |
| 訊息/決策卡/工具列/送出↔停止 | 淡入(+`--motion-enter-distance` 8) | `--motion-duration-overlay` 150ms |
| 思考塊開合 | Radix Collapsible+animate-accordion | 200ms ease-out |
| 歷史浮層 | 照選單元件 | — |
| 標誌招喚呼吸(本體/疊層/單波/FAB 光圈) | 一息 3s;35% 吸頂 / 85% 到底 / 90% 波散盡 / 靜止空拍 | swell → settle → 停 |
| 標誌思考旋轉 | 起步 0.25s(=半圈,exit)→ 0.5s/圈 linear | 一息/12、一息/6 |
| 標誌思考洞形變 | 起步 0.25s 橢圓→圓(exit)/ 減速段圓→橢圓(0,0,0.7,1) | 與轉速同拍;等速持圓 |
| 標誌思考吸氣微亮 | 6s = 2 息 | swell → settle → 停 |
| 標誌思考減速停止 | 從當下角度以 exit 鏡像曲線續轉至正位 | 0.50–1.21s(Δ/(720°/s·0.7)) |
| 標誌狀態切換 | 新狀態淡入 | `--motion-duration-overlay` 150ms |
| 入口鈕吸邊 / 放回 | top / inset 位移 | `--motion-duration-surface` 250ms + enter |
| 思考 chevron / 輸入框邊框 | transition | `--motion-duration-overlay` 150ms |
| 減動作 | 互動觸發必可停;常駐 loop 全停、淡入停 | 見 AgentLogo 節 |

## 禁止事項

- ❌ 手刻 chrome header / 浮層殼 / row 結構(必消費 ChromeHeader / overlay-surface /
  MenuItem 家族)。
- ❌ AgentDecisionCard 加 Esc / 外點關閉(阻擋語意)。
- ❌ 標誌動畫另立第三種本體語言(蓄勢=招喚態同款;「變淡」已於 2026-09-02 收斂棄用)。
- ❌ 附件在氣泡內用 Tag 或 FileItem(送出後=Chip assist 視覺;輸入中才是 Tag)。
- ❌ 思考塊微光套到已完成步驟(僅標題+最新一行)。
- ❌ 繞過 `--agent-panel-width` 寫死面板寬。

## 邊界案例 scope

- `hasVariants=false`:家族各元件無視覺 variant 軸(結構分支如 Chip assist 屬 Chip 元件)。
- `hasSizes=false`:面板寬/列高/鈕尺寸全由消費的 primitive/token 決定,無獨立 size 軸。
- Field 家族空值/驗證:AgentPromptInput 空值時送出鈕不可按;改名 Dialog 走
  form-validation 更新類規則(未異動停用/dirty 亮/還原再停;**空白時一併停用**,避免可按卻無反應)。

## Loading / 無障礙預設

- 代理回覆中:列首 CircularProgress 16(歷史列)、送出鈕變停止、AgentThinking 展開+微光。
- 全家族鍵盤:chevron/工具列/決策卡各自獨立焦點站;focus-visible 藍框;
  radiogroup/menu 原生方向鍵。
- 螢幕閱讀:面板 complementary、對話 log/polite、決策卡 group、停止態改名 aria-label。

## 相關

- `components/Sidebar/sidebar.spec.md`(家族資料夾前例)/ `patterns/header-canonical`
  / `patterns/overlay-surface` / `components/Chip/chip.spec.md`(assist 分支)
  / `components/Tag` / `components/OverflowIndicator` / `components/CircularProgress`
  / `components/Empty` / `components/RadioGroup` / `components/Dialog`
  / `tokens/motion/motion.css` / `tokens/uiSize/uiSize.css`。

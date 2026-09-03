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
  `agent-logo.tsx` / `agent-fab.tsx`)。
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
SMIL keySplines 無法消費 CSS var,`agent-logo.tsx` 內常數為 swell/settle token 值的
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
  且 ≤ 視窗寬 50%(較小者勝);預設 `--agent-panel-width` 400。受控 `width`/`onWidthChange` 或
  非受控 `defaultWidth`。**無雙擊重設**(2026-09-02 拍板);以 Sheet 承載時同樣可拖(不衝突)。
  鍵盤:把手為 `role="separator"`(`aria-orientation="vertical"` + valuemin/max/now),
  ←/→ 每步 16、Home=最窄、End=最寬(DataTable 欄寬把手同語意:箭頭往哪、邊緣就往哪);
  聚焦可見=DataTable 同款 outline;減動作不影響(無動畫)。
- A11y:`role="complementary"` + `aria-label="智慧代理"`。
- 面板與 app 的推擠/斷點=backlog(本輪僅元件內規格)。

### 2. AgentPanelHeader(標題列)

- chrome header 家族:消費 `<ChromeHeader>`(padding-based 不鎖高:md 48 / lg 56 隨 page tier);
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
  進場=淡入+下滑 8、0.15s。代理:無氣泡、全寬、text-body;內文連結=Button link variant。
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
  (`textarea.tsx` `TEXTAREA_EDIT_CHROME` / `TEXTAREA_EDIT_FOCUS`:border-border、hover 一階 border-hover、
  focus-within 主色;radius 4)。2026-09-02 user 抓「跟 Textarea 互動不同」→ 收斂為單一住所,禁自刻。
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
- 關閉:僅 Skip 鈕與 header ×,兩者同一行為=跳過;無 Esc、無外點關閉(阻擋語意)。
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
- 所有 callback(`onSelect/onRename/onDeleteConversation`)可省略,列與動作仍渲染(固定 anatomy 律)。

### 附:空狀態

- 問候區圖示位=`<AgentLogo state="attract" size={48}>`(招喚態邀請開始);
  其餘照既有 Empty 元件(icon slot)。

## AgentLogo(標誌;附屬資產)

- 造型=user 提供黃金比例莫比烏斯 SVG 定稿(內橢圓長短軸比 φ、軸角 121.717°);
  尺寸 16-48;**所有尺寸同一造型**(4 層:面 + 底面陰影 + 面 + 提亮;2026-09-02 user 拍板:
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
- 狀態(prop `state`;「招喚/漣漪」為本家族新造狀態名,定義唯一住所=本節):
  - **still 靜止(=待機)**:完全不動。2026-09-02 拍板:待機一律靜止,不另立呼吸態,狀態分類收斂為三態。
  - **attract 招喚**(空狀態/FAB 有新訊):呼吸包絡上的脹 1.07+吸氣微亮(白疊層 0→14%→0→0)
    +遮罩單波(雙色放射盤內藍 .5→靛 .44→紫 .34→邊緣 0;行程 560→830;0–35% 貼邊聚亮(swell)、
    35% 離體擴散(settle)、90% 散盡;遮罩護負空間、無模糊)。`ripple={false}` 供 FAB 光圈代位。
  - **think 思考**(=回覆中):靜止起步 → 加速 0.375s(=半圈=一息/8,exit 曲線,位移 126° 使交接速度連續)
    → 等速 **480°/s(0.75s/圈=一息/4)**,linear,**持續到離開思考,一直思考就不停**;離開思考 →
    **減速段**:從當下角度以 exit 曲線的時間鏡像 (0,0,0.7,1) 續轉最小 ≥252° 且落回正位 0° 的角度
    (時長 Δ/(ω·0.7) ∈ 0.75–1.82s,交接速度連續、停定即正位),停定後才 0.15s 淡入下一狀態。
    轉速依據(2026-09-02 研究):主流平滑轉圈 1.0–1.57s/圈([MDC 1568ms](https://raw.githubusercontent.com/material-components/material-components-web/master/packages/mdc-circular-progress/_circular-progress.scss)、
    [Fluent 1.5s](https://raw.githubusercontent.com/microsoft/fluentui/master/packages/react-components/react-spinner/library/src/components/Spinner/useSpinnerStyles.styles.ts)、[Ant 1.2s](https://raw.githubusercontent.com/ant-design/ant-design/master/components/spin/style/index.ts));
    快檔 0.69–0.75s([Carbon](https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/styles/scss/components/loading/_animation.scss)、[Bootstrap](https://getbootstrap.com/docs/5.3/components/spinners/));
    [600ms 讀成 urgent/frantic、1000–1800ms 中性](https://doveletter.dev/docs/compose-animations/custom-loading-spinner)→ 取快檔上緣 0.75s:有幹勁不慌,且實心雙緞帶比細弧線更吃轉速;
    加速未完即離開 → 等加速段結束再減速;<1 影格直接切。+**負空間形變耦合轉速**(起步 0.375s 洞
    橢圓→正圓、同 exit 曲線,轉到最快時洞正好圓;等速持圓;減速段正圓→橢圓、同 DECEL 曲線與時長,停定 0°
    時洞正好回定稿形。2026-09-02 user 問「形變是否用在高速」→ 由 6s 呼吸圓化改為速度耦合:形狀說速度、
    亮度說呼吸;對齊 squash-and-stretch「形變跟著速度」與 Dynamic Island「形隨動作」)+吸氣微亮(亮度
    6s=2 息,峰值 14% 與招喚統一)+色流動(色場定錨畫布=漸層同構逆轉,減速段同步)。
- 轉場:狀態切換=新狀態 0.15s 淡入(`--motion-duration-overlay`,只動 opacity),禁跳切;**減動作**:
  互動觸發必可停(WCAG 2.3.3);常駐 loop 全停(嚴於條文),一律回靜止、淡入亦停。
- 多實例安全:漸層/遮罩 id 以 useId 唯一化。

## AgentFab(浮動開關鈕;附屬資產)

- 40 圓=`--field-height-lg` 於 lg 密度;圓形 iconOnly;面=`bg-surface-raised`+
  `--elevation-200`(不寫死白色);內置 24 標誌(同一造型)。
- 外框=AI 觸發鈕特調:錐形(環向)漸層描邊 2px(整數寬+環向漸層=正圓對稱);
  兩極=`AGENT_BRAND` 藍 254 / 紫 300(品牌資產常數,agent-logo.tsx 唯一數值來源;各落於兩緞帶
  色相家族內;2026-09-02 藍→紫改色)。
- 動畫:待機=靜止(=標誌 still 態;2026-09-02 拍板全家族待機一律靜止);
  有新訊=招喚態(標誌蓄勢;漣漪由邊框光圈代位:0–35% 貼邊聚亮至 .35(swell)→ 35% 呼氣起點
  自邊框射出 r 21→27(settle)→ 90% 散盡 → 靜止空拍;寬 2.5;與標誌同 dur/keyTimes/曲線、同一
  commit 掛載故同相;光圈漸層=環同兩極同方位);懸停=陰影升一級+微放大;點擊=開面板。
- 減動作:光圈屬位移 loop → 全停(標誌內部自回靜止)。
- **放置與互斥**(2026-09-02 拍板):FAB 為 opt-in 浮動入口,固定於舞台右下、內距
  `--layout-space-loose`(16/24;Material FAB 最小邊距同值);**面板開 → FAB 隱藏、面板關 → FAB 回來**
  (兩者互斥,開面板的入口與關面板的 × 不並存)。DS 預設入口仍是全域頂列右側鈕
  (`governance/planning/2026-08-11-agent-ui-panel-spec.md` 已裁),含滿高表格/分頁列的頁面一律用頂列入口。
- **遮擋與收到邊**(`AgentFabDock`;2026-09-02 第一輪方案 C 拖到邊 → 第二輪 hover 小鈕 → 第三輪拖曳自由座標 →
  2026-09-03 第四輪 user 拍板「只有家與貼邊兩種位置」):40 外徑 + loose 內距 = 佔右下 56×56(md)/ 64×64(lg),
  與表格分頁列「操作右」必撞 → 主鈕可拖到右緣貼邊:
  - **只有兩種合法位置**:「家」= 圓鈕 40,位置唯一在右下角(離右、下各 loose;[Android FAB 官方範例
    `layout_margin` 16dp](https://developer.android.com/develop/ui/views/components/floating-action-button)、Teambition 16,
    lg 密度 24)/「貼邊」= 收合鈕 `--field-height-sm` 28 貼右緣半圓(只留內側圓角、環只畫露出三邊、內置 16 標誌;
    招喚態同款蓄勢、光圈省略),只有 y 可變、夾在右緣帶內。沒有第三種位置,使用者不可能把鈕拖到難用的地方。
    **兩種形態點一下都直接開面板**(一段);< 8px 位移視為點擊。
  - **右緣帶**(磁吸區;2026-09-03 user 留言拍板幾何):寬 36(= `--field-height-md`;游標離右緣 ≤ 36 即進帶,已在帶內時
    再多 16px 才算離開,遲滯防抖);上緣 = 貼邊鈕圓心落在視窗中線(鈕頂 = 舞台高 ÷ 2 − 14);下緣 = 貼邊鈕底離家頂一個
    loose(鈕頂 = 舞台高 − 2·loose − 68)。貼邊鈕只能從中線往下拖到家上方,永不與家重疊、不壓分頁列;矮視窗放不下時整帶
    收成中線一點。帶(底色)= 這個矩形 = 貼邊鈕合法 y 範圍。判定用**指標**位置(意圖在指尖)。
  - **拖 40 圓鈕(所見即所得)**:鈕全程跟著游標;整段拖曳期間右緣帶以**底色**標出(`bg-primary-subtle`、貼邊側無框
    無圓角、內側圓角 md、不畫線;見下「帶的樣式」);
    游標一進帶內,預覽當場變成貼邊鈕**貼在右緣、停在放開會落的高度**(帶內所見即所得,不預告在游標下);
    放開在帶內 → 落定;放開在帶外 → 飛回家。
  - **拖 28 貼邊鈕**:不顯示帶;帶內沿 y 移動維持貼邊鈕;一出帶外當場變回 40 圓鈕、放開飛回家。
  - **帶的樣式**(2026-09-03 user 問「要不要上底色、右邊要不要邊框」→ 四路研究後定):底色 = `--primary-subtle`,消費 DS
    「區域內就是目標」的兩個既有 canonical —— `lib/drag-visual.ts` inside-drop highlight 與 DataTable 範圍選取(user
    2026-05-10 原話「range 的 cell 本來就有顏色變化,那樣就夠了,不需要再有 2px 藍色的框」);light 為不透明 blue-1、dark 由
    primitives 公式成 alpha ≈ .19,同一個 token 兩模式,不自創 alpha(color.spec.md 已拒 Material state-layer 流派、
    `--text-selection` 禁借)。貼邊側不畫線、不留圓角(Sheet / Sidebar / 貼邊鈕「環只畫露出三邊」同語言);不用虛線框
    (dashed 是 FileUpload 靜止可見的常駐拖入區語彙;拖曳中才出現的停靠區各家一律填色無框:
    [Windows Snap「translucent overlay」](https://support.microsoft.com/en-us/windows/snap-your-windows-885a9b1e-a983-a3b1-16cd-c531795e6241)、
    [macOS 視窗並排「highlighted area」](https://support.apple.com/guide/mac-help/tile-app-windows-mchlef287e5d/mac)、
    [Atlassian「droppable area 換底色、線只表相對位置」](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines)、
    [VS Code `editorGroup.dropBackground` 半透明無框](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/common/theme.ts))。
    light 若要像 Windows / VS Code 那樣透出底下內容,需新增 primary alpha 階(token 決策,未拍板前用 `--primary-subtle`)。
  - **等價路徑**:鍵盤 家 → `→` 貼邊(停在帶底 = 家的高度);貼邊 `↑↓` 16px、`←` / Home 回家;右鍵 / Shift+F10
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
    放開回家;要加磁吸點(鏡像左緣、四角)只在 `agent-fab.tsx` `SNAP_ZONES` 加一列(區域矩形同時就是帶的底色範圍),流程不變。
    判準:以指標判定、一區一落點一形狀、邊界 16px 遲滯、區域不重疊且邊帶優先於角落、無命中不做「最近磁吸點」
    (會從放開處跳走)。上緣 / 下緣永不設區(標題列 / 分頁列)。
  - 位置由 consumer 受控/非受控(`placement / defaultPlacement / onPlacementChange`,`{kind:'home'}` /
    `{kind:'dock',y}`),DS 不寫 storage;要跨 session 記憶由 consumer 存。
  - 對照:[Copilot DAB 可拖到內容區側邊變小圖示、拖回畫布即展開](https://support.microsoft.com/en-us/office/foundations-experiences/copilot-dab/the-copilot-dynamic-action-button-in-word-excel-and-powerpoint)、
    [Windows Snap「拖到螢幕邊時 Snap 框當場顯示」= 拖曳中預告落點](https://support.microsoft.com/en-us/windows/snap-your-windows-885a9b1e-a983-a3b1-16cd-c531795e6241)、
    [Android Bubbles 任意拖、拖到底部才出現關閉區](https://developer.android.com/develop/ui/views/notifications/bubbles)、
    [Teambition 專案頁 hover「−」收到右緣、點圓弧先展開](https://www.teambition.com/)(2026-09-02 實測;本 DS 收合後
    一段即開、且形態在拖曳中就切換,比它少一步、回饋更早);Material 明文 FAB 不移動
    ([M3 FAB](https://m3.material.io/components/floating-action-button/guidelines))→ 可拖在 DS 為 opt-in。
- A11y:`aria-label="開啟智慧代理"`。

## 動畫總表

| 場景 | 動畫 | 級距 |
|---|---|---|
| 面板開合 | 淡入+右滑 | `--motion-duration-surface` 250ms |
| 訊息/決策卡/工具列/送出↔停止 | 淡入(+`--motion-enter-distance` 8) | `--motion-duration-overlay` 150ms |
| 思考塊開合 | Radix Collapsible+animate-accordion | 200ms ease-out |
| 歷史浮層 | 照選單元件 | — |
| 標誌招喚呼吸(本體/疊層/單波/FAB 光圈) | 一息 3s;35% 吸頂 / 85% 到底 / 90% 波散盡 / 靜止空拍 | swell → settle → 停 |
| 標誌思考旋轉 | 起步 0.375s(=半圈,exit)→ 0.75s/圈 linear | 一息/8、一息/4 |
| 標誌思考洞形變 | 起步 0.375s 橢圓→圓(exit)/ 減速段圓→橢圓(0,0,0.7,1) | 與轉速同拍;等速持圓 |
| 標誌思考吸氣微亮 | 6s = 2 息 | swell → settle → 停 |
| 標誌思考減速停止 | 從當下角度以 exit 鏡像曲線續轉至正位 | 0.75–1.82s(Δ/(480°/s·0.7)) |
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
  form-validation 更新類規則(未異動停用/dirty 亮/還原再停)。

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

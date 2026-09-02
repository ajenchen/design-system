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
紫 294-304 家族(對應 primitives blue-6 258 / purple-6 294;2026-09-02 user 拍板由藍→土耳其藍改為
藍→紫,研究候選 C:兩緞帶明度各跨 .38、彩度中段峰值貼 sRGB 色域不越界、最近處相距 ≥38°;
[GitHub Copilot Purple 296](https://brand.github.com/foundations/color) 同一帶);非 semantic token——
資產色不進 token 系統,同品牌 SVG 慣例;FAB 環/光圈只 import `AGENT_BRAND`(agent-logo.tsx 唯一數值來源)。
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

- 寬 `--agent-panel-width`、全高;面=`bg-surface`;左緣 `border-l border-divider`
  (右側欄同目的 canonical:app-shell.tsx aside 前例)。
- Anatomy:`[AgentPanelHeader][AgentConversation flex-1][AgentPromptInput]`;
  AgentDecisionCard 出現時絕對定位貼底覆蓋輸入區。
- 開合=淡入+自右滑入 `--motion-duration-surface`(模態面板級);減動作停。
- **可調寬**(`resizable`,預設開):左緣 `<ResizeHandle direction="horizontal" position="start">`
  (app-shell aside 同款);寬度夾在 `--agent-panel-width-min` 360 ~ `--agent-panel-width-max` 640
  且 ≤ 視窗寬 50%(較小者勝);預設 `--agent-panel-width` 400。受控 `width`/`onWidthChange` 或
  非受控 `defaultWidth`。**無雙擊重設**(2026-09-02 拍板);以 Sheet 承載時同樣可拖(不衝突)。
  鍵盤:把手為 `role="separator"`(`aria-orientation="vertical"` + valuemin/max/now),
  ←/→ 每步 16、Home=最窄、End=最寬;減動作不影響(無動畫)。
- A11y:`role="complementary"` + `aria-label="智慧代理"`。
- 面板與 app 的推擠/斷點=backlog(本輪僅元件內規格)。

### 2. AgentPanelHeader(標題列)

- chrome header 家族:消費 `<ChromeHeader>`(padding-based 不鎖高:md 48 / lg 56 隨 page tier);
  標題=chrome typography `text-body-lg font-medium`。
- Anatomy:`[AgentLogo 24][gap-2][標題+chevron 複合觸發]…[新對話 +][ButtonDivider][關閉 ×]`。
  - 標誌+標題=側欄品牌區前例逐字(gap-2 + 24 標誌);標誌隨代理狀態動畫(思考=think 態)。
  - **標題+chevron 是同一顆觸發**(`<Button variant="text" size="sm" endIcon={ChevronDown}>`,
    標題 truncate):點標題或 chevron 都開歷史浮層;chevron 只是指示(同 AgentThinking 標題列與
    Select 觸發器慣例),恆向下、不隨開合旋轉(2026-09-02 拍板)。
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
  8+24(工具列 xs 高)+8,工具列絕對定位於輪距內,出現不推擠。
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

- 高 24;代理**最後一則**常駐;其他訊息懸停 0.15s 淡入;絕對定位於輪距內。
- `[複製][ButtonDivider][讚][倒讚]`=Button text xs + Tooltip;各鈕 aria-label。

### 7. AgentPromptInput(複合輸入盒)

- Anatomy:`[附件列?][值(多行)][工具列:+ … 送出/停止]`;外框 border-border、radius 4。
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
  **整卡可點**(卡片含 RadioGroupItem md label+description);卡間距 8;「其他」卡永遠最後、
  **常駐 Input**(md 32,左縮排 24 對齊 label,距卡右/下各 12),聚焦即選中「其他」。
- 關閉:僅 Skip 鈕與 header ×,兩者同一行為=跳過;無 Esc、無外點關閉(阻擋語意)。
- 步進:**一題一步**,footer=`[跳過(tertiary sm)][下一題|送出(primary sm)]`,末步才「送出」;
  不設「上一題」(NN/g wizards 強制順序)。「其他」選中而文字為空 → 下一題/送出 disabled。
- 選項=**RadioGroup md 包裝不改造**(Popover all-sm 律之顯式拍板豁免;footer 鈕維持 sm 守律);
  預選項(`defaultValue`,省略=第一項)由元件在 label 後加「(建議)」。
- 進出=淡入+下滑 8、`--motion-duration-overlay`。
- A11y:`role="group"` + `aria-labelledby`;radiogroup / checkbox 原生鍵盤。

#### 產題守則(約束代理出題品質;標 ⚙ 者由元件 DEV 警告或渲染邏輯機械強制)

1. ⚙ **題數 1–3,每題必須改變代理下一步**;能一題就不問兩題;禁「計畫可以嗎?」類空問。
   ([Claude Agent SDK AskUserQuestion 1–4 題/次](https://code.claude.com/docs/en/agent-sdk/user-input),
   本 DS 收緊為 ≤3;[GOV.UK one thing per page](https://design-system.service.gov.uk/patterns/question-pages/))
2. ⚙ **一題一步**:一次只顯示一題;N≥2 才顯示小標「n / N」;不可回頭改題(改答案走「其他」或下一回合)。
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
11. ⚙ **Skip=「全部用預設繼續」**(非取消、非關對話);Skip 鈕與 header × 同一行為;footer 只有兩鈕。
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

- 可搜尋單選選單:SelectMenu 同源 primitives 之 DS 內部組合(Popover+Command+MenuItem;
  SelectMenu 資料驅動 API 放不下列級行內動作與進度圖示替換,故同源組裝——metrics 全同:
  容器 p-0/rounded-lg/elevation-200/minWidth 240、搜尋列 40、列 32/px-12/gap-8、組標 py-2)。
- 錨=標題觸發下緣+8(OVERLAY_SIDE_OFFSET);列=CommandItem `p-0 rounded-none` 包 MenuItem
  (select-menu.tsx 同源:選中列 `bg-neutral-selected`);組標=CommandGroup `heading`(MenuItem header,
  今天/昨天/更早)+ CommandSeparator;無結果=`<Empty>`(CommandEmpty);搜尋列 `h-8 py-0`(列高 40 守 SelectMenu)。
- 懸停/聚焦浮出「改名/刪除」(ItemSuffix `hoverReveal` + ItemInlineAction 16/18,150ms 淡入;
  鍵盤 Tab 可達、focus-visible 同樣顯示);思考中列首圖示原地換 **CircularProgress 16**,等寬等高不動版面。
- 改名=Dialog(Field「名稱」+Input 預填全選、`required`;空白 → `invalid` + FieldError「名稱不可空白」,
  儲存停用;Enter=儲存;Esc=Dialog 原生關閉=回復);刪除=Dialog 危險樣式(`primary + danger`)。
  **刪當前對話契約**(consumer 實作,spec 定義):切到最近一則;全空→空狀態(NewConversation)。
- 選定→切換對話、標題同步、浮層關閉;Dialog 關閉後焦點回標題觸發。
- 所有 callback(`onSelect/onRename/onDeleteConversation`)可省略,列與動作仍渲染(固定 anatomy 律)。

### 附:空狀態

- 問候區圖示位=`<AgentLogo state="attract" size={48} detail="full">`(招喚態邀請開始);
  其餘照既有 Empty 元件(icon slot)。

## AgentLogo(標誌;附屬資產)

- 造型=user 提供黃金比例莫比烏斯 SVG 定稿(內橢圓長短軸比 φ、軸角 121.717°);
  尺寸 16-48;**≤24 自動簡化**(去陰影提亮、兩停駐高對比=圖標光學校正慣例;
  `detail` 可強制);>96 hero 用全細節。
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
  - **think 思考**(=回覆中):啟動加速 0.3s(=一息/10,exit 曲線)→等速 0.6s/圈(=一息/5,linear)
    (SMIL loop 無終點,結束由 0.15s 狀態切換淡入承接);+負空間呼吸(洞橢圓↔正圓 6s=2 息,
    同一條呼吸包絡)+吸氣微亮(與圓化同拍,峰值 14% 與招喚統一)+色流動(色場定錨畫布=漸層同構逆轉)。
- 轉場:狀態切換=新狀態 0.15s 淡入(`--motion-duration-overlay`,只動 opacity),禁跳切;**減動作**:
  互動觸發必可停(WCAG 2.3.3);常駐 loop 全停(嚴於條文),一律回靜止、淡入亦停。
- 多實例安全:漸層/遮罩 id 以 useId 唯一化。

## AgentFab(浮動開關鈕;附屬資產)

- 40 圓=`--field-height-lg` 於 lg 密度;圓形 iconOnly;面=`bg-surface-raised`+
  `--elevation-200`(不寫死白色);內置 24 標誌(簡化檔自動生效)。
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
- **遮擋**:44 外徑 + loose 內距 = 佔右下 60×60(md)/ 68×68(lg),與表格分頁列「操作右」必撞;
  收起機制(拖到右緣 dock / 角落縮小鈕 / 移到頂列)為未決 UI pattern → 見 story `FabPanelToggle`
  與本輪報告,拍板後再入 spec。
- A11y:`aria-label="開啟智慧代理"`。

## 動畫總表

| 場景 | 動畫 | 級距 |
|---|---|---|
| 面板開合 | 淡入+右滑 | `--motion-duration-surface` 250ms |
| 訊息/決策卡/工具列/送出↔停止 | 淡入(+`--motion-enter-distance` 8) | `--motion-duration-overlay` 150ms |
| 思考塊開合 | Radix Collapsible+animate-accordion | 200ms ease-out |
| 歷史浮層 | 照選單元件 | — |
| 標誌招喚呼吸(本體/疊層/單波/FAB 光圈) | 一息 3s;35% 吸頂 / 85% 到底 / 90% 波散盡 / 靜止空拍 | swell → settle → 停 |
| 標誌思考旋轉 | 起步 0.3s(exit)→ 0.6s/圈 linear | 一息/10、一息/5 |
| 標誌思考洞形變+疊層 | 6s = 2 息,同一條呼吸包絡 | swell → settle → 停 |
| 標誌狀態切換 | 新狀態淡入 | `--motion-duration-overlay` 150ms |
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

---
component: Steps
family: 2
variants: {}
sizes:
  sm:
    px: 8
    when: "Sidebar / 緊湊 onboarding;indicator 8px dot(外面 24px 是排版盒,不是命中區),無內部 icon。對齊 INDICATOR_SIZE.sm + INDICATOR_ICON_SIZE.sm=0(steps.tsx:20-30)"
    world-class: ["Ant Design Steps small", "MUI Stepper compact"]
  md:
    px: 24
    when: "預設 — 主流程 wizard / checkout / 註冊;indicator 24px circle,內部 icon 16px(對齊 uiSize Icon Tier sm/md)"
    world-class: ["Ant Design Steps default", "MUI Stepper default", "Linear setup wizard"]
  lg:
    px: 32
    when: "Marketing / 重要 onboarding;indicator 32px circle,內部 icon 20px(對齊 uiSize Icon Tier lg)"
    world-class: ["Material 3 large step indicator"]
traits:
  - hasSizes
  - hasInteractiveStates
  - isStructural
benchmark:
  - Ant Design Steps: github.com/ant-design/ant-design/tree/master/components/steps
  - MUI Stepper: github.com/mui/material-ui/tree/master/packages/mui-material/src/Stepper
---

# Steps 設計原則

**流程進度指示器**:把多步驟任務的「現在走到哪、完成了哪些、還剩哪些」視覺化為一條有序的 indicator + label 序列。

**實作基礎**：本 DS 自建的組合元件——Icon / number indicator + Text 有序序列，由 parent 統一推導進度與 focus state。

**Layout Family**：本元件是 `patterns/element-anatomy/item-anatomy.spec.md` 所擁有的 **Family 2（List item layout）** 消費者。結構繼承其「List item layout」章節的 **scanning-mode** 規格——跟 MenuItem / TreeItem 同 scanning-family：label `text-body`、description 縮 `text-caption`（sm/md）+ `leading-compact`（非 reading-mode 的 body + default leading），consume `--item-gap-label-desc-scanning` token。Steps 有明文例外：indicator inline 對齊 label 第一行（不走 24px 閾值）。

> 命名選 `Steps`(複數)而非 `Stepper`——`stepper` 在 web 也常指 HTML `<input type="number">` 的數值增減控件，`Steps` 更精確地表達「一組有序步驟」，避免 API 語意衝突。

---

## 何時用

- **多步驟表單 / 精靈流程**:註冊流程、訂單結帳、設定引導(step 1 → 2 → 3)
- **訂單 / 任務進度**:物流追蹤(已下單 → 揀貨 → 出貨 → 送達)、審批流程
- **入職 / onboarding 進度**:教學性流程,明確告知使用者「還剩幾步」
- **CI / build 的 pipeline 狀態**:有序步驟且每步有明確完成 / 進行中 / 失敗狀態
- **步驟數量有限且已知**(3–7 個最佳;超過 7 個考慮改為 section + progress bar)

**判斷準則**:有**順序**、有**離散進度狀態**、步驟數量**有限且已知** → Steps;否則用其他元件。

## 何時不用

Steps 只解決「有順序、有進度、步數有限且明確」的場景。下列情境**都不該用 Steps**:

| 場景 | 改用 | 原因 |
|------|------|------|
| 跳頁面 / 切 view | `Tabs` / `Breadcrumb` | Tabs 平行切換、Breadcrumb 表達位置,Steps 表達進度 |
| 選一個值 | `RadioGroup` / `SegmentedControl` / `Select` | Steps 不是選擇器,是進度指示 |
| 時間軸歷史事件 | `Timeline`(未來獨立元件)| Steps 表達「任務進度」,Timeline 表達「時序紀錄」,語意不同 |
| 分段表單佈局(不需進度感)| Form layout pattern + heading | 純分段不等於有進度順序 |
| 無限 / 動態步數 | ProgressBar + 步驟計數文字 | Steps 需步數有限且已知 |
| 使用者可自由跳步（非線性流程）| Tabs | Steps 強調線性順序,跳步破壞 mental model |

---

## 與 `item-layout` 的關係

Steps 是 `patterns/element-anatomy/item-anatomy.spec.md` 的 row primitive **consumer**,跟 MenuItem / TreeItem / SidebarMenuButton / DropdownMenuItem 屬於同一家族。每個 `StepItem` 結構上等同 row item:

| Row primitive 角色 | StepItem 對應 |
|---|---|
| Prefix | `StepIndicator`(圓形 + 數字 / icon)|
| Label | `StepLabel` |
| Description | `StepDescription`(永遠可選)|
| Suffix | 展開 chevron(僅 `expansion="multiple"` 且該 step 有 content 時渲染;消費 item-anatomy `<ItemSuffix>`)|
| Content | `StepContent`(垂直模式特有)|

### 從 item-layout **繼承**的規則(不重複定義)

- **字體 tier**:label `text-body` (sm/md) / `text-body-lg` (lg);description `text-caption` (sm/md) / `text-body` (lg)。跟 MenuItem / TreeItem 同一套。
- **字重**:`font-medium`(含 label,不隨 focus 變)
- **預設文字色**:`text-fg-secondary`;`value` 指向的 step(focused)為 `text-foreground`
- **Icon tier**:`INDICATOR_ICON_SIZE = { sm: 0, md: 16, lg: 20 }`(sm 為純圓點無內部 icon,見 size table)
- **Description 永遠可選**,任何 size 都不強制
- **Indicator 欄寬**:sm 的 8px 圓點放在 24px 排版盒裡(與 md 的 24px 圓同寬;lg 圓本身 32px,`steps.tsx` `INDICATOR_BOX_WIDTH`);這個盒不是命中區 —— 可點的是整列 header(見本檔「指示點不是命中目標」)

---

## ⚠️ 對 item-layout 的明文例外:Indicator 永遠 inline 對齊 label 第一行

**這是 Steps 刻意打破 `item-anatomy.spec.md` 24px 閾值規則的特例,不是疏漏。**

### 原規則

`item-anatomy.spec.md` 24px 閾值:
- Prefix ≤ 24px → `h-[1lh]` inline 對齊 label 第一行
- Prefix > 24px + 有 description → `h-[block calc]` 對齊 label + description 文字塊中心

### Steps 的例外

**Steps 所有 size 的 indicator 一律 inline 對齊 label 第一行,不管 indicator 尺寸,也不管有無 description。**

### 為什麼必須打破

Steps 的視覺身分是「一條直/橫排列的 circle indicator 序列」——這條 **indicator column(或 row)的 x/y rhythm 是這個元件的 mental model 核心**。

如果遵守 24px 閾值:
- `size="lg"` 的 indicator 是 32px(> 24 閾值)
- 同一個 `<Steps size="lg">` 內,有些 item 有 description、有些沒有
- 有 description 的 item 走 block 對齊 → indicator 中心降到 label + description 中間
- 沒 description 的 item 走 inline 對齊 → indicator 中心在 label 第一行
- **同一 Steps 內 indicator 對齊不一致會破壞縱向節奏——進度路徑的視覺契約依賴 indicator 精確對齊同一水平線**

Column rhythm **優先於**「大 prefix 視覺重量平衡文字塊」的需求。這是 Steps 跟其他 row primitive 的本質差異:
- MenuItem / SidebarMenuButton 是「一堆選項的列表」——每個 row 獨立,視覺重量平衡是主要考量
- Steps 是「一條有連接關係的進度路徑」——column/row rhythm 是元件本身,任何破壞 rhythm 的對齊都不可接受

### 對齊不變量

**Indicator 固定 anchored to label 第一行**。這是連接線能夠穿過同一節奏軸的前提；如果依 description 有無改為對齊文字塊中心，同一組 Steps 的 indicators 就會上下漂移。

### 對齊公式

所有 size 統一:

```
indicator 容器 = h-[1lh](label 第一行行高)
indicator 圓形 flex items-center 居中
→ 圓形垂直中心 = label 第一行垂直中心
→ description 從第二行自然往下
→ indicator 位置完全不受 description 有無影響
```

實作:indicator 容器(垂直 / 水平)與展開 chevron 一律消費 `patterns/element-anatomy` 的 `<ItemPrefix>` / `<ItemSuffix>` primitive(`h-[1lh] shrink-0 flex items-center` 的 SSOT),不手刻 wrapper(M17)。

---

## Size

| Size | Indicator 直徑 | 內部 icon | 內部數字字體 | Label 字體 | Description 字體 |
|---|---|---|---|---|---|
| `sm` | 8px dot(排版盒 24px)| 純圓點,不放數字/icon | — | `text-body` (14px) | `text-caption` (12px) |
| `md` | 24px circle | 16px | `text-body` (14px) | `text-body` (14px) | `text-caption` (12px) |
| `lg` | 32px circle | 20px | `text-body-lg` (16px) | `text-body-lg` (16px) | `text-body` (14px) |

### 為什麼 indicator 內數字字體跟 label 同級(不是小一號)

數字**本身就是 step 的 label**(「第 2 步」),跟側邊的 `StepLabel` 是同一個資訊層級,應該用同樣字體 tier。之前寫小一號(md=12, lg=14)是錯的——讓數字變得像配角,但它實際上是「這個 step 是第幾步」的主要識別符。同級字體讓數字跟 label 視覺權重平衡。

### Size 的何時用 / 不用

**`sm`(小點)**
- ✅ 用在 sidebar 內 nested 流程、緊湊空間、次要進度指示
- ❌ 步驟需要 icon 或要使用者明確數到「第幾步」時不用(sm 沒有數字/icon,辨識度不足)
- sm 的圓點視覺是 8px,外面那個 24×24 是**排版盒**(sm 的 indicator 欄因此與 md 同為 24px;lg 為 32px),`steps.tsx:43` 常數名即 `INDICATOR_BOX_WIDTH`(`SM_INDICATOR_BOX` 在 `:41`)。它掛在 `aria-hidden` 的裝飾 span 上,**不是任何東西的命中區** —— 可點的是整列 header,所以這裡沒有「視覺小、命中大」這回事,也不需要拿最小尺寸規則來背書(見本檔「指示點不是命中目標」)

**`md`(預設)**
- ✅ 絕大多數場景:checkout、註冊、設定精靈
- ✅ 主畫面主流程、對話框內流程

**`lg`**
- ✅ 重要主流程,使用者需要清楚感受到「現在在做什麼」(onboarding、KYC 驗證、重要申請表單)
- ❌ 容器寬度 < 480px(垂直模式)或步驟 > 6(水平模式)時,lg 太霸佔空間 → 降到 md

### Size 對齊 Avatar tier 的依據

`md=24px` 對應 `AVATAR_SIZE.inline.md`;`lg=32px` 對應 `AVATAR_SIZE.block.sm/md`(32px)。`lg` 的 32px 選這個值是跟 Avatar 預設一致——但**對齊模式不跟 Avatar 的 block mode 一樣**(見上方例外)。

---

## State(Content state,跟 Focus 正交)→ `steps-state-visuals.spec.md`(2026-09-27 抽出,獨立 SSOT)

狀態表(upcoming / current / completed / reachable / error)、sm 的 state 視覺、自動推導順序(`computeState`)、非 linear 的 current 為何不 filled 藍、焦點外環(outline + offset、State × Focus 視覺矩陣、間隙為何必須透明、Non-linear 被選中 ≠ filled 藍)、Label 色彩優先序、Connector 路徑色 —— 整段住在 `./steps-state-visuals.spec.md`;本檔只留這個指標。下一小節講的是命中區、不是狀態,留在本檔。

### 指示點不是命中目標 —— 命中區 = 整列 header(2026-09-24 逐案裁定)

**可點的是整列 header,不是那顆點。** 圓點掛在 `aria-hidden` 的裝飾 `<span>` 上(`steps.tsx:775-778`),
真正帶 `role="button"` / `tabIndex` / `onClick` / `onKeyDown` 的是 `StepItemHeader`(`steps.tsx:526-534`)。
指標落在圓點上時,收到事件的一樣是那一列 —— 圓點只是列裡的一個子元素。

**所以這裡沒有任何外擴**,跨元件契約(`../../ds-canonical/references/hit-area-canonical.md`
「懸停回饋的形狀 ≡ 命中區」)要禁的是「在元素之外長出一圈吃指標的東西」,本元件不存在這種東西:
命中區就是 header 自己的盒,一個 `-inset` / `hitSlop` / 透明 border 都沒有。
header 沒有懸停底色,所以依同一份契約的退化條款,判準回到**可視形狀本身**(那一列的內容),兩者同一個盒。

**sm 的 8px 圓點外面那個 24×24 的盒是排版欄寬,不是命中區。** 它讓 sm 的 indicator 欄與 md 同為 24px(lg 為 32px)、同一列表內各步的
label 起點對齊(`INDICATOR_BOX_WIDTH`,`steps.tsx:43-47`)。這個常數 2026-09-24 之前叫 `SM_HIT_AREA`,
已正名為 `SM_INDICATOR_BOX` —— 舊名字會讓人以為「視覺 8 / 命中 24」是一條刻意的外擴,於是跑去
hit-area-canonical 找例外理由,但根本沒有外擴這回事。

**實測(2026-09-24,`elementFromPoint` 逐點掃描,storybook 設計規格--尺寸對照表)**:

| 量的東西 | 結果 |
|---|---|
| 24×24 裝飾盒的 `aria-hidden` | `true`;內含 8×8 的點 |
| 指標打在點的正中心,收到的是誰 | **`role="button"` 的整列 header**(不是那顆點) |
| 整列 header 的盒 | 1214×18.2 @ (33,121.1) —— 命中就是這個盒 |
| header 的懸停底色 | `rgba(0,0,0,0)`(hover 前後都是)→ 無懸停回饋,判準回到可視形狀 |
| 對照組 | 沒有 `role="button"` 祖先的那些 step(不可點的列),同一個點打下去收到的是裝飾 `span` 自己、沒有任何處理器 —— 證明這支探針分得出「可點」與「不可點」 |


---

## Linear vs Non-linear

| Mode | 點擊規則 |
|---|---|
| `linear=true`(預設) | 可點:`completed` / `current` / `error` / `reachable`(下一個未完成)。**不可點**:`upcoming`(尚未解鎖)。 |
| `linear=false` | 所有非 `disabled` 的 step 都可點。適合 setting wizard、教學目錄等「步驟之間無強依賴」的場景。 |

兩種模式共同的例外:**預設展開模式(`follow-active`)下 `value` 指到的那一步不可點** —— 見下方「Expansion」的「目前那一步可不可以點」。

不可點分兩種,游標不同(`steps.tsx` `isLocked` / `isClickable`):**鎖住**(`disabled`、linear 的 `upcoming`)= 禁止游標 `cursor-not-allowed`;**你就在這裡**(上述目前那一步)= 一般箭頭,它沒有被禁止,只是點了不會發生任何事。兩種都沒有 `role="button"`、不進 Tab 序;差別在焦點框:鎖住的步不可聚焦(`outline-none`),目前那一步保留 `tabIndex=-1`、焦點框照畫(理由見「Expansion」的「目前那一步可不可以點」)。

### 點擊 completed step 的行為

`linear=true` 下使用者點 completed step:

1. Steps 觸發 `onValueChange(thatStep)`——**僅此而已**
2. **`completedValues` 維持不變**,不自動 mutate
3. 如果應用層驗證使用者改錯某欄位需要 block 後續步驟,應用層自己從 `completedValues` 移除該 step 及其後所有 step(這是 business logic,不是元件責任)

這條規則的核心是:**Steps 從不偷偷改 parent state**——進度狀態(`completedValues` / `errorValues`)全由 parent own;`value` 為 controlled / uncontrolled(`defaultValue`)雙模,uncontrolled 僅內部記住 focus,不碰進度。所有進度 mutation 都經過 parent 的 state setter,讓應用層完整掌控推進邏輯。

---

## Expansion(垂直模式 content 區的展開行為)

| 模式 | 行為 |
|---|---|
| `follow-active`(預設) | 只有 `value` 指向的 step 渲染 `<StepContent>`。value 切換時 content 跟著切。其他 step 即使寫了 `<StepContent>` 也不顯示。 |
| `multiple` | 每個 step 獨立管理展開狀態,**可同時展開多個**。點 step header 永遠先更新 `value`(focus),並額外切換該 step 的展開。`defaultExpanded` 接 `"all" \| "none" \| string[]`,預設 `"none"`。 |

### 目前那一步可不可以點(2026-09-26,待辦總帳 N44)

| 模式 | 點 `value` 指到的那一步會發生什麼 | 所以 |
|---|---|---|
| `follow-active`(預設) | 什麼都不會發生:`onValueChange` 收到同一個值,展開又綁在 `value` 上(實測點了 DOM 0 變化) | **不可點**:不是按鈕、不進 Tab 序、一般箭頭游標(不是手形、也不是禁止符號) |
| `multiple` | 收合 / 展開它自己的內容(`aria-expanded` true ↔ false) | 可點,照舊是按鈕 |

2026-09-25 以前兩種模式都把它做成按鈕,預設模式因此出現「手形游標 + 可以 Tab 停上去,按下去卻沒有任何反應」。判準就是本元件自己的鍵盤規則「Tab — focus 每個 **clickable** step」:點了不會發生事的東西不是 clickable。

**它仍保留 `tabIndex=-1`**(不進 Tab 序,但能持有焦點):鍵盤使用者在某一步按 Enter / Space 跳過去時,焦點所在的那一列正好變成「目前那一步」;若它同時變成完全不可聚焦,瀏覽器依 HTML 的 focus fixup 會把焦點丟回頁首,下一個 Tab 得從頭來。`-1` 讓焦點留在原地、Tab / Shift+Tab 照常往前後走,焦點框照全域 `:focus-visible` 畫(用滑鼠點過去不會出現框)。
世界級對照:[Atlassian progress-tracker `stage.js#L69-L73`](https://cdn.jsdelivr.net/npm/@atlaskit/progress-tracker@11.4.4/dist/es2019/internal/stage.js)(只有 `status === 'visited'` 的步才渲染成連結,目前那一步不是連結 → 不是停靠點);[Carbon `ProgressIndicator.tsx#L315-L323`](https://github.com/carbon-design-system/carbon/blob/v11.117.0/packages/react/src/components/ProgressIndicator/ProgressIndicator.tsx#L315-L323)(目前那一步 `onClick={!current ? onClick : undefined}`、加 `--unclickable`,樣式 [`_progress-indicator.scss#L228-L231`](https://github.com/carbon-design-system/carbon/blob/v11.117.0/packages/styles/scss/components/progress-indicator/_progress-indicator.scss#L228-L231) `cursor: default`,但仍 `tabIndex={0}`);[Ant Design `steps/style/index.ts#L183-L185`](https://github.com/ant-design/ant-design/blob/6.6.5/components/steps/style/index.ts#L183-L185)(手形游標只給 `[role='button']:not(-active)`,目前那一步是一般箭頭)。三家一致的是「目前那一步不給手形游標」;Tab 停不停,Atlassian 不停、Carbon / Ant 仍停 —— 本 DS 取不停,理由是上面那條本元件自己的鍵盤規則(停上去按 Enter / Space 沒有任何事可做)。

### 為什麼 `all` 隸屬於 `multiple`

`all`(全部展開)跟 `none`(全部收合)**本質上都是「使用者可以同時展開多個」的行為**——差別只在初始狀態。把它們並列在同一個 mode 下、用 `defaultExpanded` 決定初始狀態,是比「三個平行 enum 值」更乾淨的結構。`follow-active` 則是完全不同的 mental model(展開狀態綁定 `value`,使用者不能獨立切換),所以拆成獨立 mode。

### 水平模式無 content

`orientation="horizontal"` 時 `<StepContent>` 一律不渲染,`expansion` prop 被忽略。水平空間不夠塞 content 區,強塞會破壞 stepper 的掃視節奏。Consumer 可以共用同一份 JSX 在兩種 orientation 間切換,不會報錯。

**展開 controlled/uncontrolled(2026-07-18 user 拍板補完整雙向)**:`multiple` 模式支援 controlled `expanded: string[]` + `onExpandedChange`(與 `defaultExpanded` uncontrolled 二選一)。理由:Steps 整體 API 哲學是 **parent 掌控狀態**(`value` / `completedValues` / `errorValues` 全 parent-controlled),唯獨展開狀態原只 uncontrolled 自相矛盾;且最近親 `TreeView` 就是完整雙向(`expandedIds` + `onExpandedChange` + `defaultExpandedIds`)。對齊 Radix/MUI/Ant Accordion 全數雙向。傳 `expanded` 時展開狀態由 consumer 掌控,toggle step 經 `onExpandedChange` 回寫新陣列。

---

## Orientation

| Orientation | Indicator 序列 | Connector | Label 位置 | Content 區 |
|---|---|---|---|---|
| `vertical`(預設) | 上 → 下 | 垂直線,穿過 description / content | indicator 右側 | 支援 |
| `horizontal` | 左 → 右 | 水平線 | indicator 右側(同行) | 不支援(忽略) |

**可點範圍 = 整列 header,兩種排列都包含描述**(2026-09-26,待辦總帳 N51):垂直版的描述本來就在 header 裡;水平版的描述在連接線下方另起一列,2026-09-25 以前那一列放在 header 外面 —— 滑到描述上游標不是手形、點了也不會跳到那一步(實測 4/4)。現在水平版 header 是直向兩列(第一列 indicator + label + connector,第二列描述),描述一樣點得到;描述那一列的行高照舊(`leading-normal`,= 搬家前從 li 根繼承的值),畫面不變。

### Connector 幾何(2026-09-29,待辦總帳 N52;user 09-26 裁「兩者都是」= 規格沒定義 + bug)

- **線寬 1px,x = 指示欄中心**(垂直)/ y = label 第一行中線(水平)。
- **圓到線的縫兩端各 8px**,兩端對稱。一手區間:MUI `StepLabel` vertical `padding: '8px 0'`(每側 8;[StepLabel.js#L65-L68](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/StepLabel/StepLabel.js#L65-L68))、Ant `marginXXS × 1.5` = 6([steps/style/vertical.ts#L25-L29](https://github.com/ant-design/ant-design/blob/5.27.4/components/steps/style/vertical.ts#L25-L29))、Chakra `--steps-gutter = spacing.3` = 12([recipes/steps.ts#L15](https://github.com/chakra-ui/chakra-ui/blob/main/packages/react/src/theme/recipes/steps.ts#L15));DS 取 8 = 區間正中,與列內 prefix / suffix 的 `gap-2` 同一個數。
- **線最短 24px,長度不隨說明文字有無變動**。唯一一手明文地板:MUI `StepConnector` vertical `minHeight: 24`([StepConnector.js#L50](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/StepConnector/StepConnector.js#L50));Ant / Chakra 沒有地板(線是列高的餘數,無說明時 Ant 32px 圓只剩 ≈ 4px),Carbon 是另一種模型(1px 線貼左緣全高連續)。24 也等於本元件的步間距 `pb-6`,可讀成「線至少一個步間距」。
- **落地**:非末項垂直 `li` 的最小高度 = 圓 + 兩端縫 + 線地板(sm 48 / md 64 / lg 72;`steps.tsx` `verticalItemMinHeight`);有說明時列自然更高、不受影響。水平線的最短寬吃同一個 24(先前 `min-w-4` 16px 沒入規格;同元件同概念只准一個地板)。
- **為什麼是根層修**:線長原本 = li 高 − 2r − 16(餘數),沒有說明時 md 只剩 2.2px、lg 是 0 —— 違反上方「對齊不變量」:指示欄節奏是元件本體,不得隨說明有無變動。
- **閘**:`scripts/steps-connector-geometry-invariant.mjs`(量三尺寸無說明的垂直線高 ≥ 24、兩端縫 = 8;selftest 用修法前的實測 2.2 / 0 當對照組必紅)。

**何時用 horizontal**:步驟 ≤ 5、重視「進度條」感、水平空間充足、不需要 per-step content 區。
**何時用 vertical**:步驟 > 5、需要 description 或 content、行動裝置、主流程精靈。

---

## API(parent-controlled)

```tsx
<Steps
  value={string}                               // 當前 focused step(ring 跟這個走)
  defaultValue={string}                        // uncontrolled 初始值
  onValueChange={(value: string) => void}
  completedValues={string[]}                   // 已完成(✓ + 藍底 + 藍 connector)
  errorValues={string[]}                       // 錯誤(✕ + 紅底)
  linear={boolean}                             // 預設 true
  size="sm" | "md" | "lg"                      // 預設 md ★ cva default
  orientation="vertical" | "horizontal"        // 預設 vertical
  expansion="follow-active" | "multiple"       // 預設 follow-active
  defaultExpanded="all" | "none" | string[]    // 只在 expansion=multiple 有效
>
  <StepItem value="info" disabled?={boolean} state?="error">
    <StepLabel>基本資料</StepLabel>
    <StepDescription>填寫姓名與聯絡方式</StepDescription>  {/* 可選 */}
    <StepContent>                                          {/* 可選;水平模式忽略 */}
      <p>當前步驟的動作指引、表單欄位或按鈕</p>
    </StepContent>
  </StepItem>
</Steps>
```

### 為什麼使用 parent-controlled

1. **Single source of truth**:所有狀態集中在 parent,不可能發生「多個 step 同時是 current」「completedValues 跟 item state 互相矛盾」這類 bug。
2. **Derived state**:每個 step 的 state 由 parent props 推導,consumer 不手算,不會漂移。
3. **無 side effect**:Steps 不偷偷 mutate 進度狀態(completedValues / errorValues),進度變動都走 parent 的 state setter,讓應用層完整掌控推進邏輯(驗證 → 加入 completedValues → 推進 value)。
4. **API 一致**:`value` / `completedValues` / `errorValues` 都是明確的 parent inputs，與本 DS 其他 controlled composite 的狀態所有權相同，開發者不需猜測 item 內部狀態。

### Per-item `state` escape hatch

`<StepItem state="error">` 可單獨覆蓋該 step 的 content state,**僅限於**在 inline JSX 想直接宣告錯誤且不想維護 `errorValues` array 的場景。一般情況不要混用兩種方式——單一來源優於兩個競爭來源。

---

## Do / Don't

✅ **Do**
- 用 Steps 表達「有順序、有進度、步數有限且已知」的任務流程
- linear 模式下允許點擊 completed step,讓使用者回看 / 修改
- 用 parent props 管理狀態,讓 Steps 自動推導每個 step 的視覺
- 垂直 content 放 form 欄位、指引、按鈕等「使用者當前需要互動」的內容
- 水平模式用在步驟 ≤ 5、不需要 per-step content 的場景

❌ **Don't**
- 用 Steps 做 navigation(用 Tabs / Breadcrumb)
- 用 Steps 做 selection(用 Radio / SegmentedControl / SelectMenu)
- 水平模式塞 `<StepContent>`(會被忽略)
- 每個 StepItem 手動傳 state 管理狀態(用 parent `completedValues` / `errorValues`)
- 點 completed step 時自動從 completedValues 移除(應用層責任,Steps 不 mutate)
- 讓 indicator 對齊模式隨 description 有無變動(破壞 column rhythm)
- 把 ring 用在非 `value` 的 step(ring 是 focus marker,不是 decoration)
- sm size 的 indicator 試圖塞數字或 icon(空間不足,降低辨識度)
- 用 `bg-neutral-selected` 表達 Steps 的 focused step(那是 selection 語意,Steps 用 ring)

---

## Inspector 與矩陣分工

Steps 的決策是「展示所有步驟進度」,需要一整條鏈才能呈現設計——關鍵維度由 `OrientationMatrix` / `ColorMatrix`(含 4 狀態色)/ `SizeMatrix` / `StateBehavior`(進度流轉 / linear / error interrupt)/ 元件特有 `IndentAlignment` 五張 side-by-side 矩陣 story 完整覆蓋;`Inspector`(元件檢閱器)另補單一互動 playground(Controls 切 value / completedValues / errorValues / size / orientation / linear / expansion,對齊 anatomy 6-canonical)。矩陣是設計比對主路徑,Inspector 供即時 prop 試切。

## StateBehavior 說明(Steps 層級特有)

Item-level **內容狀態色彩**(completed / current / upcoming / error indicator + label + connector)由 `ColorMatrix` 作為結構性 state-driven 色彩矩陣呈現;`StateBehavior` story 則展示**進度流轉行為**——current → completed 連鎖變化、`linear` 控制 upcoming step 可否點擊、`errorValues` 中斷流程——這些是 Steps 元件層級特有的動態行為,不存在於任何 item primitive。

---

## 邊界案例

- **Disabled step**:`disabled` step 視覺繼承 SelectionItem disabled token(`text-fg-disabled`,M24),click 不觸發 navigate;`linear` mode 下 upcoming steps 預設不可點(non-clickable:無 `role="button"` / 不進 Tab 順序 / cursor-not-allowed,SR 念 sr-only「未開始」;與 `disabled` prop 不同,**不**設 `aria-disabled` / `data-disabled`)直到前面 completed 解鎖。
- **Loading(async step state fetch)**:Steps primitive 為 sync render,async data fetch 應由 consumer 在外層 Skeleton 取代整個 Steps;Steps 內部不獨立 own loading prop,**也無 per-step loading state**(content state 集合不含 loading)— 單一步驟 async 進行中即 current,進度細節由 consumer 在 `StepContent` 內呈現。
- **Empty(0 steps)**:無任何 `<StepItem>` children 時無進度可呈現;consumer 應條件性不渲 Steps 或渲 `<Empty>` 替代,不渲空 Steps container。
- **Single step / `value` 指向第一步**:合法初始狀態,第一個 step 渲染 current,後續依推導為 reachable / upcoming。
- **Error state(`errorValues`)**:由元件層級 own — 對應 step indicator 切 error token、label 切 `text-error-text`(見 `steps-state-visuals.spec.md`「Label 色彩」);connector **不**變色,仍按 `steps-state-visuals.spec.md`「Connector 路徑色」規則(前一步 completed 才藍,否則灰);後續 step 仍 upcoming。
- **Dark mode**:走 semantic token + Primary token 自動 adapt。
- **Density**:Step indicator 32px 對齊 `AVATAR_SIZE.block.sm/md`,connector 細線跨 density 不變(進度視覺對 density 不敏感)。

---

## 相關

- `../../patterns/element-anatomy/item-anatomy.spec.md` — Row primitive 繼承規則（字體 / icon tier / 列高）
- `../Tabs/tabs.spec.md` — 平行視圖切換（非進度場景）
- `../Breadcrumb/breadcrumb.spec.md` — 位置路徑（非進度場景）
- `../RadioGroup/radio-group.spec.md` — 選值（非進度場景）
- `../../patterns/element-anatomy/item-anatomy.tsx` — Indicator 32px 尺寸依據（`AVATAR_SIZE.block.sm/md = 32`;`AVATAR_SIZE` 常數住 item-anatomy,非 avatar.tsx — Avatar 本身 size 為任意 number）
- `../../tokens/uiSize/uiSize.spec.md` — `field-height-xs` 地板規則 + Icon 尺寸 Tier
- `../../tokens/color/color.spec.md` — Primary token
- `patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」— Steps 不用 `bg-neutral-selected` 的理由

## A11y 預設

**ARIA / Pattern**:[W3C APG](https://www.w3.org/WAI/ARIA/apg/patterns/) **無**正式 stepper pattern(2026-06-01 M26 source-verified:APG 31 patterns 無 stepper / wizard / progress)。本元件採 **Carbon ProgressIndicator 模型** — root `<ol>` + clickable step `role="button"` + focused step `aria-current="step"` + indicator `aria-hidden`(純視覺)。

- **root `aria-label`**:consumer 透過 `<Steps aria-label="註冊流程進度">` 提供(透傳到 `<ol>`),命名此流程。對齊 Angular Material「stepper 必須有 label」。
- **sr-only 狀態文字**:每個 step header 含 visually-hidden `<span>`「第 N 步,共 M 步,{已完成 / 進行中 / 錯誤 / 未開始}」——indicator 是 `aria-hidden` 純視覺,故 sr-only 是螢幕報讀器**唯一**狀態來源(對齊 Carbon `--assistive-text` 慣例)。
- **展開狀態 ARIA**(2026-07-05 D4 加):垂直模式 step 含 `<StepContent>` 時,clickable header(`role="button"`)輸出 `aria-expanded`(反映 content 展開狀態;`multiple` toggle 與 `follow-active` 皆同步;`follow-active` 下目前那一步不是按鈕、沒有 `aria-expanded`,它的內容恆展開 —— 見「Expansion」的「目前那一步可不可以點」),並在 content 實際渲染(展開)時以 `aria-controls` 指向 content 區(收合時 content 不在 DOM,不輸出避免 dangling reference)——對齊 WAI-ARIA disclosure pattern trigger 最低要求。chevron 維持 `aria-hidden` 純視覺。
- **StepContent 內的 consumer-owned scroll region**:Steps 不替任意 children 猜測捲動語意。consumer 若在 StepContent 放 `overflow-x-auto` / `overflow-y-auto`,實際會 overflow 的 wrapper 必須是鍵盤可達的具名區域(`tabIndex={0}` + `role="region"` + `aria-label`)並使用 DS 內描邊焦點框(`focus-visible:focus-ring-inset`)。tab stop 必須落在真正控制 `scrollLeft` / `scrollTop` 的 wrapper,不可放在內層 `<pre>`。展示層 `MultipleExpansion` 以 play assertion 驗證該節點確實 overflow、可聚焦。

**Keyboard 行為**(Carbon 模型 — sequential Tab,非 tablist roving):

- Tab — focus 每個 clickable step(各自 tab stop);鎖住的步與預設展開模式下的目前那一步不是 clickable,不停(見「Expansion」的「目前那一步可不可以點」)
- Enter / Space — navigate to step(`role=button` 元素必同時支援)
- **不提供方向鍵 roving**:採 native button sequential Tab(對齊 Carbon ProgressIndicator);MUI / Angular Material 的「tablist + 方向鍵 roving」是另一派世界級做法,本 DS 不採(避免把 `role=button` 改寫成 `role=tab` 的語義改動)。

**Focus**:focus-visible ring 對齊 DS canonical(`outline: 2px solid var(--ring)`);focus management 由元件 own。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `horizontal-overflow.spec.md`
- `item-anatomy.spec.md`
- `pagination.spec.md`
- `progress-bar.spec.md`
- `steps-state-visuals.spec.md`

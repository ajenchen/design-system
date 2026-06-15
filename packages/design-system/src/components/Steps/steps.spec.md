---
component: Steps
family: 2
variants: {}
sizes:
  sm:
    px: 8
    when: "Sidebar / 緊湊 onboarding;indicator 8px dot(hit area 24px),無內部 icon。對齊 INDICATOR_SIZE.sm + INDICATOR_ICON_SIZE.sm=0(steps.tsx:18-28)"
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

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Steps 設計原則

**流程進度指示器**:把多步驟任務的「現在走到哪、完成了哪些、還剩哪些」視覺化為一條有序的 indicator + label 序列。

**實作基礎**：組合元件——Icon / number indicator + Text 有序序列，無 external primitive base。Radix / shadcn 無對應 Steps primitive。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**Layout Family**：CLAUDE.md 4-Family Model **Family 2（List item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「List item layout」章節的 **scanning-mode** 規格——跟 MenuItem / TreeItem 同 scanning-family：label `text-body`、description 縮 `text-caption`（sm/md）+ `leading-compact`（非 reading-mode 的 body + default leading），consume `--item-gap-label-desc-scanning` token。Steps 有明文例外：indicator inline 對齊 label 第一行（不走 24px 閾值）。

> 命名選 `Steps`(複數)而非 `Stepper`——`stepper` 在 web 有 HTML `<input type="number">` 計數器的歷史包袱(spinbutton 也叫 stepper),`Steps` 更精確地表達「一組有序步驟」。對齊 Ant Design 的命名慣例。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

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
- **Icon tier**:`ICON_SIZE = { sm: 16, md: 16, lg: 20 }`
- **Description 永遠可選**,任何 size 都不強制
- **Hit area 地板**:可點擊的 indicator 至少 `field-height-xs`(24px),不足者用透明 padding 撐開

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

### 業界共識

Material Stepper、Ant Design Steps、GitHub Workflows、Linear、Notion Checklist——**全部**走「indicator anchored to label 第一行」,**沒有任何世界級 stepper 把 indicator 對齊到文字塊中心**。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

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
| `sm` | 8px dot(hit area 24px)| 純圓點,不放數字/icon | — | `text-body` (14px) | `text-caption` (12px) |
| `md` | 24px circle | 16px | `text-body` (14px) | `text-body` (14px) | `text-caption` (12px) |
| `lg` | 32px circle | 20px | `text-body-lg` (16px) | `text-body-lg` (16px) | `text-body` (14px) |

### 為什麼 indicator 內數字字體跟 label 同級(不是小一號)

數字**本身就是 step 的 label**(「第 2 步」),跟側邊的 `StepLabel` 是同一個資訊層級,應該用同樣字體 tier。之前寫小一號(md=12, lg=14)是錯的——讓數字變得像配角,但它實際上是「這個 step 是第幾步」的主要識別符。同級字體讓數字跟 label 視覺權重平衡。

### Size 的何時用 / 不用

**`sm`(小點)**
- ✅ 用在 sidebar 內 nested 流程、緊湊空間、次要進度指示
- ❌ 步驟需要 icon 或要使用者明確數到「第幾步」時不用(sm 沒有數字/icon,辨識度不足)
- sm 的 indicator 視覺只有 8px,但 hit area 撐到 24px(`field-height-xs` 地板),可點擊時不違反互動元件最小尺寸規則

**`md`(預設)**
- ✅ 絕大多數場景:checkout、註冊、設定精靈
- ✅ 主畫面主流程、對話框內流程

**`lg`**
- ✅ 重要主流程,使用者需要清楚感受到「現在在做什麼」(onboarding、KYC 驗證、重要申請表單)
- ❌ 容器寬度 < 480px(垂直模式)或步驟 > 6(水平模式)時,lg 太霸佔空間 → 降到 md

### Size 對齊 Avatar tier 的依據

`md=24px` 對應 `AVATAR_SIZE.inline.md`;`lg=32px` 對應 `AVATAR_SIZE.block.sm/md`(32px)。`lg` 的 32px 選這個值是跟 Avatar 預設一致——但**對齊模式不跟 Avatar 的 block mode 一樣**(見上方例外)。

---

## State(Content state,跟 Focus 正交)

| State | 視覺 | 觸發 |
|---|---|---|
| `upcoming` | 灰底(`bg-muted`)+ 灰字(`text-fg-disabled`)| 未走到 |
| `current` | 藍底(`bg-info`)+ 白字數字 | step === `value` 且不在 completedValues / errorValues |
| `completed` | 藍底(`bg-info`)+ 白色 ✓ | step 在 `completedValues` 內 |
| `reachable` | 藍底(`bg-info`)+ 白字數字(僅 linear;sm 為空心環)| linear 下「下一個未完成」step(非 current / completed / error),可點 |
| `error` | 紅底(`bg-error`)+ 白色 ✕ | step 在 `errorValues` 內(或單項 `state="error"` override)|

### Sm size 的 state 視覺

sm 沒有 icon 空間,用色塊表達:
- `upcoming` → 灰實心點(`bg-fg-disabled`)
- `current`(linear)→ 藍色**空心**環(`border: 2px solid var(--info-hover)`);non-linear current 走灰實心點(`bg-fg-disabled`)。`reachable` 也是空心環
- `completed` → 藍實心點(`bg-info`)
- `error` → 紅實心點(`bg-error`)

### 自動推導(順序即優先級,對齊 `computeState`)

**Consumer 不手寫每個 step 的 state**。State 由 Steps root 的 props 依下列順序推導(`steps.tsx` `computeState`):

```
per-item state override(escape hatch)              → 直接採用
step 在 errorValues                                 → error(優先於 completed;交集一律 error)
step 在 completedValues                             → completed
step === value                                      → current(linear / non-linear 都成立)
linear && step 在 reachable(completed ∪ 首個未完成)→ reachable
其他                                                → upcoming
```

**關鍵**:`value` 命中的 step 在兩種模式下 content state 都是 `current`,但 **filled 藍的「正在做」視覺只屬於 linear**。非 linear 的 current 渲染中性 `bg-secondary` + `foreground` 數字(見「Non-linear 被選中 ≠ filled 藍」),focus 由 box-shadow 外環表達,**不會**出現 filled 藍。

### 為什麼非 linear 的 current 不渲染 filled 藍

非 linear 模式讓使用者跳著點 step(例如設定頁、教學目錄),value 的語意是「使用者在看哪一步」,**不是**「使用者在做哪一步」。如果非 linear 也渲染 filled 藍,會造成:

- 使用者點 upcoming step 想預覽 → step 立刻變 filled 藍,像是「標記為正在做」
- 跟 mental model「我只是在看,這步還沒做」衝突
- completedValues 沒有變化,前一個 filled 藍 step 突然不見

正確做法:focus 視覺跟「進度視覺」完全解耦——focus 透過 box-shadow 外環表達,filled 藍由 linear / completedValues 決定。filled「正在做」視覺是 linear 的概念。

Per-item `state="error"` prop 存在但是 **escape hatch**,僅用在 inline JSX 想直接宣告錯誤的罕見場景;一般情況用 `errorValues` array 統一管理,不要混用。

---

## Focus marker — Outer ring(box-shadow,bounding box 永遠不變)

**`value` 指向的 step,透過「box-shadow 外圈環」視覺表達 focus**。

### Outer ring 的關鍵設計

- **Bounding box 固定**:box-shadow 不佔 layout(zero layout impact),focused / non-focused 的 indicator 佔用完全相同的寬高(md=24px,lg=32px,sm=24px hit area)
- **Surface gap + ring 兩層 box-shadow 實作**:`0 0 0 2px var(--surface), 0 0 0 4px <ringColor>`——內圈先用 surface 色拉開 2px gap,外圈再疊 2px ring 色,形成「indicator 外有一圈帶間隙的環」(對齊 Polaris / shadcn focus-ring surface-gap idiom)
- **Ring 色由 state 決定**:`error` → `--error-hover`;non-linear `current` → `--border-hover`;其餘(含 linear current / completed / upcoming / reachable)→ `--info-hover`

### State × Focus 視覺矩陣(md/lg)

filled 底色與內容色**完全由 content state 決定,不因 focused 改變**;focused 只額外疊一圈 box-shadow 外環。

| State | 底色 + 內容(focused / non-focused 相同) | Focused 額外疊加 |
|---|---|---|
| upcoming(linear)| `bg-muted` + `fg-disabled` 數字 | `--info-hover` 外環 |
| upcoming(non-linear)| `bg-secondary` + `foreground` 數字 | `--info-hover` 外環 |
| current(linear)| `bg-info` + white 數字 | `--info-hover` 外環 |
| current(non-linear)| `bg-secondary` + `foreground` 數字 | `--border-hover` 外環 |
| completed | `bg-info` + white ✓ | `--info-hover` 外環 |
| error | `bg-error` + white ✕ | `--error-hover` 外環 |

> **linear vs non-linear upcoming 底色刻意不同**:linear upcoming 用 `bg-muted` + `fg-disabled`(灰、弱字 = 「還到不了/鎖住」);non-linear upcoming 用 `bg-secondary` + `foreground`(中性、可讀 = 「可導覽但非當前」)。因為 non-linear 模式所有 step 都可點(reachable),upcoming 不該呈現 linear 那種「鎖住」的 muted 感。
>
> **為何 upcoming 用 `--muted`(locked surface)而非 `--bg-disabled`(互動元件 disabled)**:indicator 是 `aria-hidden` 狀態圖示(非互動 control),填色是「狀態色盤」不是「互動元件背景」;linear upcoming 恰是不可點(`isClickable`=false、無 `role=button`)的 locked 狀態。世界級 source-verified(2026-06-01 M26 benchmark):Atlassian Progress Tracker `unvisited`(`--ds-background-neutral-bold`)≠ `disabled`(`--ds-background-disabled`)為兩個獨立 status;Carbon `incomplete`(`$border-subtle`)≠ `disabled`(`$icon-disabled`);Ant Steps `wait` 用 `colorFillContent`/`colorTextLabel` 刻意避開 `colorTextDisabled`。4/5 家以 neutral/locked 語義處理 upcoming。元件真正的 disabled(`disabled` prop)走 `opacity-disabled` 疊加(保留狀態色不換 token)。

**注意 linear mode 的 current 永遠 focused**,所以 linear mode 下 current step 永遠帶外環(底色仍是 filled 藍,只是多疊一圈 ring)。

### Sm 尺寸的 focus 處理

sm 的 8px dot 用同一套 `getOuterRingShadow` box-shadow halo 在 dot 外圍繞圈——**但仍在 24px hit area 內**,所以 bounding 不變。

### 為什麼 bounding 不變這麼重要

連結線幾何依賴 indicator 的邊緣位置。如果 focus 改變 bounding box,連結線的起點/終點會跟著變,造成「focused step 的連結線比別的短一點點」的視覺不齊感。**box-shadow 外環不佔 layout**——focus 狀態變化時外部幾何完全不變——連結線可以用統一公式,自然一致。

### 為什麼用 surface-gap 而非單純貼邊 ring

直接在 filled circle 外貼一圈同色 ring 會讀成「雙圈」很醜;先用 `var(--surface)` 拉一圈 2px gap 再疊 ring,讓環跟 indicator 之間有底色間隙,視覺乾淨且各 state 都清楚(對齊 shadcn `ring-offset` / Polaris focus indicator surface-gap canonical)。

### Non-linear 被選中 ≠ filled 藍(關鍵規則)

非 linear 模式使用者點 upcoming step 瀏覽時,step 的 content state 變為 `current`(`computeState` 對 value 命中者一律回 current),但渲染**刻意中性**。視覺上會是(md/lg):
- 底色:`bg-secondary`(**刻意不同於 linear upcoming 的 `bg-muted`**——non-linear 所有 step 都可點,不該像 linear upcoming 那樣呈現「鎖住/還到不了」的 muted 灰;secondary 傳達「可導覽但非當前」)
- 數字:`foreground`(可讀,非 disabled 弱字——呼應 step 可達)
- 外環:`--border-hover` box-shadow ring(focus marker,表達「你在看這一步」;`resolveRingColor` 對 non-linear current)

**不會**出現 linear current 的 filled 藍——這對齊使用者 mental model「我只是在看,這步還沒做」。non-linear current 與 upcoming 同為 `bg-secondary` 底,被選中(focused)的 step 以 `--border-hover` 外環標示。sm 尺寸的 dot 在 non-linear current 仍用 `fg-disabled` 灰點(8px dot 最小化呈現)。

**Ring 不是 selection marker**。Steps 不是 SelectMenu / DropdownMenu 這類 selection control;ring 是 focus marker 單一語意。`CLAUDE.md` 的「選擇 / 狀態視覺」規則 B 指出的 `bg-neutral-selected`、radio 圓圈等 selection 視覺**都不適用 Steps**——Steps 用 box-shadow 外環表達「you are here」,不是「你選中了這個」。

---

## Label 色彩(error state 例外)

Label 色彩優先順序:

```
disabled > error > focused > default
```

- `disabled` → `text-fg-disabled`(最優先,覆蓋所有其他狀態)
- `error` → **`text-error-text`**(error state 時 label 變紅,跟 indicator 的紅 ✕ 協調表達「這步出錯」)
- `focused`(非 disabled 非 error)→ `text-foreground`(使用者當前在看這步,加強)
- `default` → `text-fg-secondary`(一般狀態)

### 為什麼 error label 要跟 indicator 同色

Steps 的 step 本身是「狀態載體」,跟 Field 的「label 只是欄位名,error 靠 help text 表達」不同。Steps 的 label 在視覺上屬於 indicator 的延伸資訊,兩者應該一起講故事:紅 ✕ indicator + 紅 label + 紅 description(如有)形成一致的 error visual language,讓使用者一眼看出這步出了什麼錯。

這跟 `CLAUDE.md` 的「Label 永遠 foreground」原則不衝突——那是 Field 家族的規則(edit / readonly / disabled 三態的欄位容器)。Steps 是**進度指示器**不是**輸入容器**,label 色彩跟著 step state 走是正確做法。

### Description 沒有 error 變色

Description 在 error state 下維持 `text-fg-secondary`(跟其他 state 一樣)。理由:
1. Error 的「為什麼出錯」訊息該放在 `<StepContent>` 內(可以用 `text-error-text` 寫錯誤詳情),description 只是輔助說明
2. 太多紅字會造成視覺壓迫,三層紅(indicator + label + description + content)過多
3. 保留 description 為 secondary 給 consumer 一個「寫冷靜說明」的空間

---

## Connector 路徑色

連接 `stepA → stepB` 的 connector:**當且僅當 stepA 是 completed 時,該 connector 為藍色**(`bg-info`),其他一律灰(`bg-border`)。connector 是一條 `w-px`(vertical)/ `h-px`(horizontal)的有底色 div line,故用 `bg-*` 而非 `border-*`。

### 為什麼藍色只跟 completedValues 走,不跟 value 走

藍色代表「實際走過的進度路徑」,必須跟 `completedValues` 一對一對應,才能跟 step 本身的底色邏輯保持一致。非線性模式下:

- 使用者把 `value` 跳到中間未完成的 step 5
- step 1-4 仍為 upcoming(灰底)
- 若藍色延伸到 step 5 前面,會產生「藍線連灰 step」的矛盾視覺
- 正確做法:藍色 connector 跟 step 的 bg 同步,都只在 completed 區段出現

---

## Linear vs Non-linear

| Mode | 點擊規則 |
|---|---|
| `linear=true`(預設) | 可點:`completed` / `current` / `error` / `reachable`(下一個未完成)。**不可點**:`upcoming`(尚未解鎖)。 |
| `linear=false` | 所有非 `disabled` 的 step 都可點。適合 setting wizard、教學目錄等「步驟之間無強依賴」的場景。 |

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

### 為什麼 `all` 隸屬於 `multiple`

`all`(全部展開)跟 `none`(全部收合)**本質上都是「使用者可以同時展開多個」的行為**——差別只在初始狀態。把它們並列在同一個 mode 下、用 `defaultExpanded` 決定初始狀態,是比「三個平行 enum 值」更乾淨的結構。`follow-active` 則是完全不同的 mental model(展開狀態綁定 `value`,使用者不能獨立切換),所以拆成獨立 mode。

### 水平模式無 content

`orientation="horizontal"` 時 `<StepContent>` 一律不渲染,`expansion` prop 被忽略。水平空間不夠塞 content 區,強塞會破壞 stepper 的掃視節奏。Consumer 可以共用同一份 JSX 在兩種 orientation 間切換,不會報錯。

---

## Orientation

| Orientation | Indicator 序列 | Connector | Label 位置 | Content 區 |
|---|---|---|---|---|
| `vertical`(預設) | 上 → 下 | 垂直線,穿過 description / content | indicator 右側 | 支援 |
| `horizontal` | 左 → 右 | 水平線 | indicator 右側(同行) | 不支援(忽略) |

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

### 為什麼 parent-controlled 是世界級做法

1. **Single source of truth**:所有狀態集中在 parent,不可能發生「多個 step 同時是 current」「completedValues 跟 item state 互相矛盾」這類 bug。
2. **Derived state**:每個 step 的 state 由 parent props 推導,consumer 不手算,不會漂移。
3. **無 side effect**:Steps 不偷偷 mutate 進度狀態(completedValues / errorValues),進度變動都走 parent 的 state setter,讓應用層完整掌控推進邏輯(驗證 → 加入 completedValues → 推進 value)。
4. **對齊業界**:Ant Design Steps(`current` + `status`)、Material Stepper(`activeStep`)、Radix Tabs(`value`)全部用此模式。開發者從這些系統來的直覺可直接套用,學習曲線接近零。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

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

## 為何無 Inspector

Steps 的決策是「展示所有步驟進度」,需要一整條鏈才能呈現設計——單互動切換 value 不如 side-by-side 矩陣清楚。關鍵維度由 `OrientationMatrix` / `ColorMatrix`(含 4 狀態色)/ `SizeMatrix` / `StateBehavior`(進度流轉 / linear / error interrupt)/ 元件特有 `IndentAlignment` 五張 story 完整覆蓋。

## StateBehavior 說明(Steps 層級特有)

Item-level **內容狀態色彩**(completed / current / upcoming / error indicator + label + connector)由 `ColorMatrix` 作為結構性 state-driven 色彩矩陣呈現;`StateBehavior` story 則展示**進度流轉行為**——current → completed 連鎖變化、`linear` 控制 upcoming step 可否點擊、`errorValues` 中斷流程——這些是 Steps 元件層級特有的動態行為,不存在於任何 item primitive。

---

## 邊界案例

- **Disabled step**:`disabled` step 視覺繼承 SelectionItem disabled token(`text-fg-disabled`,M24),click 不觸發 navigate;`linear` mode 下 upcoming steps 預設 disabled 直到前面 completed。
- **Loading(async step state fetch)**:Steps primitive 為 sync render,async data fetch 應由 consumer 在外層 Skeleton 取代整個 Steps;Steps 內部不獨立 own loading prop,**也無 per-step loading state**(content state 集合不含 loading)— 單一步驟 async 進行中即 current,進度細節由 consumer 在 `StepContent` 內呈現。
- **Empty(0 steps)**:無任何 `<StepItem>` children 時無進度可呈現;consumer 應條件性不渲 Steps 或渲 `<Empty>` 替代,不渲空 Steps container。
- **Single step / `value` 指向第一步**:合法初始狀態,第一個 step 渲染 current,後續依推導為 reachable / upcoming。
- **Error state(`errorValues`)**:由元件層級 own — 對應 step indicator 切 error token、label 切 `text-error-text`(見「Label 色彩」);connector **不**變色,仍按「Connector 路徑色」規則(前一步 completed 才藍,否則灰);後續 step 仍 upcoming。
- **Dark mode**:走 semantic token + Primary token 自動 adapt。
- **Density**:Step indicator 32px 對齊 `AVATAR_SIZE.block.sm/md`,connector 細線跨 density 不變(進度視覺對 density 不敏感)。

---

## 相關

- `../../patterns/element-anatomy/item-anatomy.spec.md` — Row primitive 繼承規則（字體 / icon tier / hit area 地板）
- `../Tabs/tabs.spec.md` — 平行視圖切換（非進度場景）
- `../Breadcrumb/breadcrumb.spec.md` — 位置路徑（非進度場景）
- `../RadioGroup/radio-group.spec.md` — 選值（非進度場景）
- `../Avatar/avatar.tsx` — Indicator 32px 尺寸依據（`AVATAR_SIZE.block.sm/md = 32`）
- `../../tokens/uiSize/uiSize.spec.md` — `field-height-xs` 地板規則 + Icon 尺寸 Tier
- `../../tokens/color/color.spec.md` — Primary token
- CLAUDE.md「選擇 / 狀態視覺必須對齊既有 canonical」— Steps 不用 `bg-neutral-selected` 的理由

## A11y 預設

**ARIA / Pattern**:[W3C APG](https://www.w3.org/WAI/ARIA/apg/patterns/) **無**正式 stepper pattern(2026-06-01 M26 source-verified:APG 31 patterns 無 stepper / wizard / progress)。本元件採 **Carbon ProgressIndicator 模型** — root `<ol>` + clickable step `role="button"` + focused step `aria-current="step"` + indicator `aria-hidden`(純視覺)。

- **root `aria-label`**:consumer 透過 `<Steps aria-label="註冊流程進度">` 提供(透傳到 `<ol>`),命名此流程。對齊 Angular Material「stepper 必須有 label」。
- **sr-only 狀態文字**:每個 step header 含 visually-hidden `<span>`「第 N 步,共 M 步,{已完成 / 進行中 / 錯誤 / 未開始}」——indicator 是 `aria-hidden` 純視覺,故 sr-only 是螢幕報讀器**唯一**狀態來源(對齊 Carbon `--assistive-text` 慣例)。

**Keyboard 行為**(Carbon 模型 — sequential Tab,非 tablist roving):

- Tab — focus 每個 clickable step(各自 tab stop)
- Enter / Space — navigate to step(`role=button` 元素必同時支援)
- **不提供方向鍵 roving**:採 native button sequential Tab(對齊 Carbon ProgressIndicator);MUI / Angular Material 的「tablist + 方向鍵 roving」是另一派世界級做法,本 DS 不採(避免把 `role=button` 改寫成 `role=tab` 的語義改動)。

**Focus**:focus-visible ring 對齊 DS canonical(`outline: 2px solid var(--ring)`);focus management 由元件 own。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `horizontal-overflow.spec.md`
- `item-anatomy.spec.md`
- `progress-bar.spec.md`

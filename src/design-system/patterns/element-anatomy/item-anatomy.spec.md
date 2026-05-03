<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Item Anatomy 設計原則(Family 1 + Family 2 row 結構 SSOT)

> **Super-foundational SSOT rationale**(2026-04-24 approved,cap 1200 例外):
> 涵蓋 Family 1 + Family 2 跨 10+ row primitive 的 SSOT(結構 canonical、slot 規則、24px 閾值對齊公式、選擇狀態視覺、新 primitive 建立指南、Inline Action 分家)。本 spec 是**全 DS 最大 SSOT**,前次 prune 嘗試搬 canonical 搬到 references 後 user 確認違反 2-home,restored。長期收斂路徑:`.claude/planning/row-primitive-consolidation.md`(SidebarMenuButton / TreeItem 消費 menuItemVariants 後可搬「獨立實作風險」節,估縮 ~100 行)。

## 定位

本 spec 是 design system **row anatomy(Family 1 + Family 2)的深度 SSOT**——包含:

- **Family 1: Menu item anatomy**(scanning mode,menu 容器內緊湊單列)深度規格
- **Family 2: List item anatomy**(reading mode,頁面上閱讀式單列)深度規格
- **runtime primitive**:`<MenuItem>`(canonical F1 wrapper in `components/Menu/`)+ slot components `<ItemPrefix>` / `<ItemIcon>` / `<ItemAvatar>` / `<ItemLabel>` / `<ItemInlineAction>` / `<ItemSuffix>` + `RowSizeProvider` / `useRowSize` context(實作於 `item-anatomy.tsx`)
- F1 + F2 共用結構骨架:`[prefix] [content] [suffix]` + `items-start` + `h-[1lh]` wrapper + 24px 閾值 / card header 規則

**不包含**(去其他 SSOT):
- **4-Family Model taxonomy** → 同 folder `element-anatomy.spec.md`(cross-pattern/cross-component governance doc)
- **Family 3: Pill anatomy** → `components/Button/button.spec.md`「Pill Layout」章節
- **Family 4: Field control anatomy** → `components/Field/field-controls.spec.md`

**命名**: folder `item-anatomy/` = spec `item-anatomy.spec.md` = tsx `item-anatomy.tsx`,scope = F1/F2 row anatomy。「item」對齊世界級 idiom(Material `ListItem` / Polaris `ResourceItem` / Ant `List.Item`);slot components 用 `Item{Slot}` 命名(`ItemIcon` / `ItemAvatar` / `ItemLabel` / `ItemSuffix` / `ItemInlineAction`)—— 對齊 Radix compound-component 風格。無 `ItemLayout` 這種帶「Layout」後綴的 export(違反「element-level 不用 layout 字」鐵律)。

---

## Family 1: Menu item anatomy(scanning mode,SSOT)

**用途**：Menu 容器內的掃視單列。使用者眼睛快速移動、選項密集、tight density。

**結構**：`[small icon/avatar 16-20px] [content: label 單行 + desc 選用] [small suffix action/chevron]`，leading-compact，字體偏小。

**消費者**：

| 元件 | 所在檔案 | 備註 |
|------|---------|------|
| `MenuItem`（含 `header` 模式） | `components/Menu/menu-item.tsx` | **Canonical 實作** |
| `TreeItem` | `components/TreeView/tree-view.tsx` | 階層結構 |
| `SidebarMenuButton` / `SidebarGroupLabel` | `components/Sidebar/sidebar.tsx` | Sidebar 專用 menu item |
| `DropdownMenuItem` | 重用 MenuItem | `components/DropdownMenu/dropdown-menu.tsx` |
| `SelectMenu`（→ `Select` searchable / `Combobox` searchable / `PeoplePicker`） | `components/SelectMenu/select-menu.tsx` | internal primitive，內部 CommandGroup > MenuItem 走 Family 1 |

**`MenuItem` 的 `menuItemVariants` cva 是 Family 1 canonical**——寫任何新 menu-context row 元件前,先讀它,複製 padding 公式 + variant 結構,不要自己發明。

### 部分繼承者（partial consumer）— 非 Family 1 正式消費者

以下元件**只繼承 Family 1 的部分規則**（如 gap-2 slot 間距 / 字體 tier / hover 行為），結構上不是 row primitive。列在此保持 reciprocal 完整,但不強制 follow 全部 Family 1 規格:

| 元件 | 繼承的部分 | 不繼承的部分 |
|------|----------|-----------|
| `Tabs`（Trigger） | gap-2 slot 間距、scanning 字體 tier、hover 行為 | 結構是**橫向 inline**（非垂直 row）, 高度系統對標 Button, 無 prefix/content/suffix column | 詳細對標分析見 `components/Tabs/tabs.spec.md`「Tabs 不完全屬於 item-layout」段 |

---

## Family 2: List item layout（reading mode，SSOT）

**用途**：頁面上的閱讀式單列。使用者讀取內容、需要 description 多行、looser density。

**結構**：`[larger icon/avatar 20-24px] [content: label + multi-line description OK] [suffix action/button/counter]`，reading typography（default leading），字體略大於 Family 1。

**消費者**：

| 元件 | 所在檔案 | 備註 |
|------|---------|------|
| `StepItem` / `StepLabel` / `StepDescription` | `components/Steps/steps.tsx` | **明文例外**：indicator inline 對齊 label 第一行，不走 24px 閾值（見 `components/Steps/steps.spec.md` 的「對 item-layout 的明文例外」節） |
| `FileItem`（rich mode） | `components/FileItem/file-item.tsx` | icon/avatar 作 item boundary,不只是 prefix |
| `Notice`（→ `Alert` / `Toast`） | `components/Notice/notice.tsx` | 語意為 notification 而非 row collection,但**視覺排版遵循 Family 2**確保跨元件視覺語言一致 |
| `SelectionItem` variant | `components/SelectionControl/selection-item.tsx` | Prefix 是 selection control（Checkbox / Radio indicator），用於頁面 RadioGroup / Checkbox group |

**為什麼 Notice 是 Family 2（即使語意不同）**：Notice / Alert / Toast 的 `[icon] [title + description] [action buttons / dismiss]` 結構就是 List item layout 的 prefix / content / suffix——語意不同（通知 vs 列表），但**結構和排版原則必須一致**，否則同個系統內會產生兩套表面形式相同但規則不同的版面,跨元件視覺語言漂移。

**SelectionItem variant 特徵**：prefix slot 放 Checkbox/Radio indicator（而非 icon/avatar），其餘結構完全遵循 Family 2。RadioGroup / Checkbox group 在頁面上直接展開使用時走此 variant。

---

## List item 範疇的必消費 primitive canonical(2026-04-22)

**鐵律**:只要判斷內容屬於 **list item 範疇**(不管一行兩行、不管有沒有 icon、不管 overlay 內還是頁面上),**預設先按照 item-anatomy 的方式消費既有 primitive**——不准 hand-craft `<div className="flex py-3">...</div>` 繞過 anatomy canonical。

### 世界級對照(所有世界級 DS 都有統一的 item primitive,不讓 consumer 自刻)

| DS | Primitive 名稱 | 對應 slot API |
|----|--------------|---------------|
| **Material M3** | `ListItem` + `ListItemText` + `ListItemAvatar` + `ListItemIcon` + `ListItemSecondaryAction` | avatar / icon / primary text / secondary text / trailing action |
| **Shopify Polaris** | `ResourceItem` + `ResourceList` | media(avatar / thumbnail)/ name / accessibilityLabel / shortcutActions |
| **Atlassian(ADG)** | `Item` / `ItemGroup`(primitive + composition) | elemBefore / elemAfter / description |
| **Ant Design** | `List.Item` + `List.Item.Meta` | avatar / title / description / actions |
| **GitHub Primer** | `ActionList.Item`(+ `LeadingVisual` / `TrailingVisual` / `Description`) | leadingVisual / trailingVisual / description |
| **Apple HIG(UIKit)** | `UIListContentConfiguration`(system-provided cell layout) | image / text / secondaryText |

**共識**:每家 DS 都 ship list item primitive + slot API,禁止 consumer 自刻 — 自刻 = 跨產品視覺語言斷裂。

### 判斷流程(content 類型 → primitive 選擇)

```
這段內容是什麼?

├─ list item 範疇(一筆資料一列、重複 N 次的結構化條目)?
│   │
│   ├─ 緊湊掃視(menu 容器 / cmd palette / dropdown)?
│   │   → <MenuItem>(Family 1 scanning,SSOT) + slot components
│   │
│   ├─ 閱讀式(頁面上、overlay body 內、avatar+title+desc)?
│   │   → Family 2(reading) — 目前沒有單一 <ListItem> primitive,
│   │     先 compose:使用 slot components(<ItemIcon> / <ItemAvatar> /
│   │     <ItemLabel> / <ItemSuffix> / <ItemInlineAction>)照 Family 2
│   │     結構 + tokens 組裝;或直接消費既有 Family 2 consumer
│   │     (FileItem rich / SelectionItem / Notice 的 anatomy)
│   │
│   └─ Key-Value 配對(Label: Value 形式的屬性展示 / metadata 列)?
│       → <DescriptionList> + <DescriptionItem>(horizontal / vertical)
│         SSOT: components/DescriptionList/description-list.spec.md
│
└─ 非 list item 範疇(form / prose / single block / illustration)?
    → 不走 item primitive,走 Field / 文字 / 自訂 layout
```

### Key-Value(DescriptionList)vs List item(MenuItem / Family 2)的邊界

| Content shape | 消費 | 理由 |
|---------------|------|------|
| `[avatar] Title\nSubtitle` / `[icon] Label` | **MenuItem / Family 2** | 語意是「一個實體 / 一筆資料」,title 是 item 識別 |
| `Email:user@x.com` / `Created: 2026-04-22` | **DescriptionList** | 語意是「同一實體的 N 個屬性」,label 是 key,不是 item 識別 |
| 一排 `[status dot] Project name [count]` | **MenuItem / Family 2** | 實體列表(每個 project 是獨立 item) |
| NameCard 裡 profile 的「職稱 / 部門 / 到期日」 | **DescriptionList(horizontal)** | 同一人的多個 metadata 屬性 |

### ❌ 禁止(自刻 = 繞過 anatomy canonical)

- ❌ overlay body 裡 `<div className="flex items-center gap-3 py-3 hover:bg-neutral-hover">...</div>` 當 list item(應用 MenuItem / ItemAvatar + ItemLabel + ItemSuffix slot components)
- ❌ 頁面上 key-value 自刻 `<div className="grid grid-cols-[120px_1fr]"><span>Email</span><span>...</span></div>`(應用 DescriptionList + DescriptionItem)
- ❌ 為「就一兩行」偷懶不消費 primitive(一行也是 list item,照走 MenuItem)
- ❌ 自發明 row 結構(勿用 `prefix` / `suffix` / `left` / `right` 命名,勿自刻 24px item 閾值)

### 消費前的 4-step check

1. `ls src/design-system/patterns/element-anatomy/`(確認 item-anatomy primitive 存在)
2. grep 近親 consumer(MenuItem / FileItem / SelectionItem / Notice)看 slot 怎麼用
3. 判斷 key-value vs list item(見上表)選對 primitive
4. 內部結構不命中既有 slot → 回 item-anatomy.spec.md 擴 API,**不自刻繞過**

### 寫任何 list / key-value UI 前 grep 自檢

```bash
# 看有沒有繞過 item-anatomy 的手刻 list item
rg "className=\"flex.*py-[0-9].*hover:bg" src/design-system src/hooks --type tsx
# 看有沒有繞過 DescriptionList 的手刻 key-value grid
rg "grid-cols-\[[0-9]+px_1fr\]" src/design-system src/hooks --type tsx
```

非空 = drift,要改用 primitive。

---

## 任何未來的 row 元件

必須先判斷屬於 Family 1 或 Family 2，然後照對應章節的規則做。**不要自己發明新規格**——發明前必先讀本 spec 全文 + CLAUDE.md「4-Family Model」。

---

## Row primitives 必須共用的結構規格（跨 Family 1 + 2 共用）

### Row primitives 必須共用的規格

- **水平 padding**: `px-[var(--layout-space-loose)]`(sidebar context) / `px-3`(menu context),由 consumer 脈絡決定
- **垂直 padding**: `py-[calc((var(--field-height-*)-1lh)/2)]` 的 item-layout 公式
- **字重**: `font-medium`(500),**不隨 selected 變**
- **預設文字色**: `text-fg-secondary`(neutral-8);icon 透過 currentColor 繼承
- **Hover**: `bg-neutral-hover` + `text-foreground`
- **Active / selected**: `bg-neutral-selected` + `text-foreground`(不加字重,避免跳動)
- **無 rounded**: full-width fill
- **無 gap 在 items 之間**: items 緊貼(SidebarMenu / TreeView / DropdownMenuGroup 容器不設 flex gap)
- **Size variants**: sm / md / lg 跟 `--field-height-*` family 一致
- **Icon 尺寸控制**: 用 `ICON_SIZE` 常數 `{ sm: 16, md: 16, lg: 20 }` 對齊 `--field-height-*`,並**透過 `size` prop 直接傳給 Lucide icon**(不要用 CSS selector 如 `[&>svg]:size-4`——當 icon 被包在 `h-[1lh]` wrapper 裡時,`>` 直接子選擇器失效,Lucide 會 fallback 到 24px 預設)。MenuItem / TreeView / SidebarMenuButton 都這樣做,新元件照抄
- **Row header(分組標題)**: 用 `MenuItem header={true}` 模式,`font-medium text-fg-muted pointer-events-none` + 與 items **完全相同**的 row geometry(同 px / 同 py / 同 text size)

### Prefix 垂直對齊:`items-start` + `h-[1lh]` wrapper(**永遠這樣**,不要做例外)

所有 row primitives 的 outer flex 用 **`items-start`** + prefix(icon / avatar / checkbox / indicator)包在 **`h-[1lh] shrink-0 flex items-center`** 容器。這是**底層規則,不可跳過**。

```tsx
// ✅ 正確(TreeItem / SidebarMenuButton / MenuItem 都這樣)
<div className="flex items-start gap-2">
  <span className="h-[1lh] shrink-0 flex items-center">
    <Icon size={16} />  {/* 或 Avatar / Checkbox */}
  </span>
  <span className="min-w-0 flex-1 truncate">{label}</span>
</div>
```

**為什麼**:
- **單行 label**(`truncate` = `line-clamp-1`,絕大多數情境):prefix 透過 `h-[1lh]` 對齊第一行文字中線 → **視覺效果等同 `items-center`**,垂直置中完美
- **多行 label**(罕見但可能發生):prefix 仍然留在第一行,不隨文字下移

**禁止**:
- ❌ 用 `items-center` 取代 `items-start`——看似單行簡化,但多行時 prefix 會飄移,且**會讓你之後踩坑**時想不起「為什麼當初沒 follow pattern」
- ❌ 用 `items-start` 但不包 `h-[1lh]` wrapper——prefix 會對齊 label top 而非第一行 baseline,當 prefix 高度 ≠ 文字 line-height 時(例如 Avatar 24 vs text 18)視覺歪斜

**asChild 的 consumer 也必須遵守**:用 asChild 讓 SidebarMenuButton / TreeItem 接受自訂 children(例如塞 Avatar 而非 LucideIcon)時,consumer 必須**自己**把 prefix 包進 `h-[1lh] shrink-0 flex items-center` 容器,不能省略。

### Card header 大 prefix 對齊（avatar > text block）

Row primitive 的 24px 閾值規則適用於**列表行**（prefix 跟 text block 接近等高）。當 prefix 遠大於 text block 時（如 64px profile avatar 搭配 1-2 行文字），改用 **card header 模式**：

```tsx
<div className="flex items-start gap-3">
  <Avatar size={64} />
  <div className="flex flex-col justify-center min-w-0 flex-1" style={{ minHeight: 64 }}>
    <span>Name</span>
    <span>Subtitle</span>
  </div>
</div>
```

**規則**：text column 用 `justify-center` + `minHeight: prefix-size`。

| 情境 | 表現 |
|---|---|
| 短文字（< prefix 高度） | 文字垂直置中於 prefix 高度 |
| 長文字（> prefix 高度） | 文字自然撐高，`items-start` 讓 prefix 頂部對齊 |

適用場景：NameCard profile header、FileItem rich、未來的 profile page header。
不適用：row primitives（MenuItem / TreeItem / Sidebar）——那些走 24px 閾值。

---

## 垂直 padding 歸屬:row 集合不加 py,由外層容器負責

**Row 集合元件**(TreeView root、SidebarMenu ul、DropdownMenuGroup 內容)**自己不加垂直 padding**。上下呼吸空間**永遠由外層容器提供**:

| Row 集合 | 外層容器 | 容器 py |
|---|---|---|
| `SidebarMenu` | `SidebarGroup` | `py-2` |
| `TreeView`(在 sidebar 內) | `SidebarGroupContent`(父層 `SidebarGroup py-2`) | 繼承 `py-2` |
| `TreeView`(在 dropdown 浮層) | `DropdownMenuContent` | `py-2`(content 自帶) |
| `TreeView`(獨立使用,如 story demo) | consumer 自己的 wrapper div | **必須自己加** `py-2` |
| `MenuItem` 集合 | `MenuGroup` | `py-2` + `[&+&]:border-t` 自動分隔 |
| `DropdownMenuItem` 集合 | `DropdownMenuContent` | `py-2` |

### 為什麼

Row 集合是**內容(content)**,不是區段(region)。加 py 到 row 集合會在不同外層容器下「各加一層」導致雙重 padding,或「單獨使用時沒呼吸空間」貼邊。

**曾經發生的 bug**:TreeView 原本硬寫 `py-2`,放進 `SidebarGroup`(也有 `py-2`)導致 label 和 first tree item 之間多出 8px 無法解釋的 gap;後來改成「只有 menu context 加 py-2」,結果 story 的 bordered wrapper 不屬於 menu context,items 貼邊。最終解法:TreeView root 一律不加 py,所有外層容器自己負責。

### 實作規則

- 寫 row 集合元件(新 tree / menu / list)時,**root div 不加 py**
- 容器元件(group / section wrapper)**一定要加 `py-2`**
- Story demo 在 bordered container 展示 row 集合時,**wrapper 必須自己加 `py-2`**,否則 items 會貼邊
- 這條規則適用「所有 row 集合」,不只 TreeView——新增任何類似元件遵守

---

## Group auto-separation

**跨 Menu-like 元件統一設計語言**。SSOT 段落:`MenuGroup` / `DropdownMenuGroup` / 未來的 `ContextMenuGroup` 等 row group primitives 共享此設計語言。

### 設計語言

- **每個 group 上下各 8px padding**
- **相鄰 group 之間用 `border-divider` 分隔**
- **兩個 group 之間視覺 gap = 8(上 bottom)+ 8(下 top)= 16px + border**

Consumer 不需手動插 Separator——把同類 items 包進 Group,自動分隔。

### 兩種 CSS 實作(視覺等價,差別在 padding 住哪層)

| | **Pattern A**(Group 自帶 padding) | **Pattern B**(Container 提供邊界 padding) |
|---|---|---|
| 典型案例 | `MenuGroup`(menu-item.tsx) | `DropdownMenuGroup`(dropdown-menu.tsx) |
| 何時用 | 外層容器**無** `py-2`（例:`Command.List`) | 外層容器**已有** `py-2`（例:`DropdownMenuContent`) |
| CSS | `py-2 [&+&]:border-t [&+&]:border-divider` | `[&+&]:mt-2 [&+&]:pt-2 [&+&]:border-t [&+&]:border-divider` |
| 邊界 padding 來源 | Group 自己的 py-2 | Container 的 py-2 |
| Group 間 gap | 8 + 8 = 16 + border | 0 + 8 + 8 = 16 + border |

**視覺結果 100% 等價**——都是 Content 邊界 8px + 相鄰 group 間 16px + border。

### 為什麼不強制統一 CSS

不同外層容器(`Command.List` vs `DropdownMenuPrimitive.Content`)對 padding 的預期不同(Radix 的 Content 自帶 `py-2` 是為了鍵盤導覽 focus offset,移除會破壞行為)。**強行統一 CSS 會破壞外層 primitive 的預期**——所以允許兩種 Pattern,但**視覺結果必須等價**(16px gap + border)。

### 新增 group primitive 的檢查清單

建立新的 Menu-like group 元件(例 `ContextMenuGroup`、`CommandGroup` 擴充)時:

1. **確認外層容器有沒有 `py-2`**
   - 有 → 用 Pattern B(`[&+&]:mt-2 [&+&]:pt-2 [&+&]:border-t [&+&]:border-divider`)
   - 沒有 → 用 Pattern A(`py-2 [&+&]:border-t [&+&]:border-divider`)
2. **視覺驗證**:兩個相鄰 group 之間 gap **必須** = 16px + border。不可多、不可少
3. **加 cross-reference 註解**:tsx 檔裡指向本 spec 段落,讓未來維護者知道這是跨元件 SSOT
4. **不創新 CSS**:只能從 Pattern A / B 二選一,不自己發明第三種公式

### 歷史錯誤

本 session 曾寫過 `[&+&]:mt-1 [&+&]:pt-1`(只有 4+4 = 8px gap)——**錯誤**,少於設計語言的 16px。後修正為 `mt-2 pt-2`。

**避免方式**:新增 group primitive 時先檢查 MenuGroup 的視覺 gap,用同樣距離。

---

## 連續 item 貼邊合法性(2026-04-22 canonical)

**核心原則**(user 明示):連續 item 之間是否需要 gap,取決於**該 item 的永久視覺層會不會在視覺上跟相鄰 item 相連**——不是所有 item 都需要 gap,也不是所有 item 都可以貼邊。

### 公式(3 條)

```
1. 同類 standalone card/pill(bg + radius + inset)list
   → 必 gap(防 card/pill 融合失去 identity)

2. 同類 permanent flush / permanent transparent list
   → 0 gap 合法;分隔靠 border-b / 底部 progress bar / connector line

3. 混合視覺語言 list(standalone card + flush-with-separator,或任兩類混用)
   → 必取最保守 gap(= max(各類最小 gap))
   原因:相鄰兩類的 affordance 會互相吸收 —— 分隔線型 item 的底線 / progress bar
         緊貼 card 型 item 的 bg 邊時,分隔線被 card 邊界吸收,變成「card 的一部分」
         而不是「獨立分隔 affordance」。必 gap 讓各類保留自己的視覺語言。
```

**關鍵定義**:
- **standalone card/pill**:item 有 **permanent** visible container(bg 色塊 或 邊框)+ radius + **不貼父容器邊**(max-w / inset 讓 item 明顯是獨立輪廓)
- **flush full-width**:item 貼父容器邊、無 per-item radius、bg 透明或繼承父層。分隔靠 border-b / progress bar / separator(分隔線型 affordance)
- **permanent transparent**:item 靜態完全透明;有 radius 但只在 hover / selected / focus state 可見(M3 Nav drawer idiom)

**為什麼 state 不獨立列規則**:state 視覺(hover / focus / active / selected)跟隨 permanent layer 分類,不獨立觸發。瞬時 state(hover/focus/active)單一 item 啟用不會創造相鄰衝突;selected 的連續 bg 在 permanent flush / transparent item 上是 **multi-select feature**(Finder / Gmail / Notion idiom),在 permanent standalone card 上依然必 gap(card identity 保留)。

### 世界級 benchmark(2026-04-22 掃 6 家)

| DS | menu item | file/card list | table row | settings row |
|----|-----------|---------------|-----------|-------------|
| Polaris | flush + border-b,0 gap | ResourceList flush rows border-b;MediaCard standalone 才 card | IndexTable flush border-b 0 gap | Card.Section Divider 0 gap |
| Material M3 | flush 0 gap | Card `variant="outlined"` stack `gap 8–16dp` | DataTable flush border-b 0 gap | Nav drawer 有 radius 但 **permanent 透明 → 0 gap** |
| Atlassian | Menu flush 0 gap | `<Stack space="space.100">` 8px standalone cards | DynamicTable flush border-b 0 gap | Nav rounded 透明 bg 0 gap |
| Ant Design | default flush 0 gap | Upload picture-card **gap 8px**;text/picture flush 0 gap | Table flush border-b 0 gap | List bordered flush + divider 0 gap |
| Carbon | flush + 1px border-b 0 gap | FileUploaderItem flush 0 gap border-b | DataTable flush border-b 0 gap | Side-nav flush 0 gap |
| Apple HIG | N/A | Inset Grouped:**group radius / row permanent 透明 → 0 gap**;group 之間 gap | N/A | Settings Inset Grouped 同左 |

**6 家共識**:default list row = flush 0 gap + separator;升級 standalone card stack 才需 gap(Material Card / Ant picture-card / Atlassian Stack)。**關鍵反例**(M12 counter-example avoidance):M3 Nav drawer / Apple Inset Grouped 兩者都**有 radius**但 permanent 透明 → 仍 0 gap。證明「radius ≠ 必 gap」,真 trigger 是 **permanent standalone container**。

### 對照表

| Item 類型 | 永久視覺層 | gap | 依據 |
|-----------|-----------|-----|------|
| **MenuItem / Select / DropdownMenuItem / SidebarMenuButton / TreeItem** | permanent transparent(radius 只在 state 可見) | **0 gap 合法** | state 稀疏不創造永久相連 |
| **SelectionItem**(Radio / Checkbox row) | permanent transparent(code 驗證 `flex items-start gap-2`,無 bg/border/radius) | **0 gap 合法** | 選中靠 control 視覺非 row bg |
| **DataTable row** | flush + border-b 分隔線 | **0 gap 合法** | border-b 分隔線型 affordance |
| **FileItem compact + progress bar**(Type A upload manager) | flush + 底部 progress bar 分隔線 | **0 gap 合法** | 同 DataTable;progress bar 分隔線型 affordance(user 2026-04-22 確認) |
| **FileItem rich**(永遠 card) | `border + bg-surface + rounded-md + inset` → **standalone card** | **必 gap ≥ 8px** | Card 邊框融合失去 identity |
| **FileItem compact + bg-secondary**(Type B form attachment 靜態) | `bg-secondary + rounded-md + inset` → **standalone pill** | **必 gap ≥ 4px** | bg 塊融合消失 item 邊界 |
| **StepItem / Timeline item** | permanent transparent item + connector line | **0 gap 合法** | connector 提供連接(分隔線型 affordance 的連接版) |

### 新 item 元件 checklist

建新 row/item 元件時,開 spec 必自問:

1. 本元件**永久**視覺是:(a) standalone card/pill(bg + radius + inset)/ (b) flush full-width / (c) 完全 transparent?
2. 若 (a) → spec 必明寫「list wrapper 必 gap ≥ Xpx」+ rationale
3. 若 (b)(c) → spec 寫「list wrapper 可 0 gap」+(b)列出 separator affordance 來源

### 反例(本 session 修正)

- `file-upload.stories.tsx` compact list(Type B `bg-secondary` standalone pill)→ 改 `gap-1`
- `file-upload.stories.tsx` rich list(standalone card)→ 改 `gap-2` + 移除 `border overflow-hidden` 外框
- `file-item.stories.tsx` Rich / HoverSwap rich block / Clickable:同上

### 跟 Group auto-separation 的關係

本規則處理**單一 group 內 item 之間**;「Group auto-separation」處理**相鄰 group 之間**(自帶 16px + border 分隔)。

---

## 結構:四個獨立 slot

所有 item layout 元件共用一個 4-slot 結構,**每個 slot 各自獨立決定對齊**:

```
[control?] [prefix?] [content] [suffix?]
    ↑          ↑          ↑          ↑
  always    follows    flex-1    follows
  inline    24px       min-w-0   24px
            rule                  rule
```

| Slot | 用途 | 出現條件 | 對齊規則 |
|---|---|---|---|
| **control** | Selection 機制(Checkbox / RadioGroupItem) | 只有 SelectionItem 有 | **永遠 inline**(`h-[1lh]`) |
| **prefix** | 視覺輔助(icon / avatar / thumbnail) | 可選,在所有 item 元件 | 24px 閾值規則 |
| **content** | label + 可選 description | 永遠存在 | 佔滿剩餘空間,`flex-1 min-w-0` |
| **suffix** | label 的 metadata(tag、chevron、time、count) | 可選,在所有 item 元件 | **24px 閾值規則(跟 prefix 同公式但獨立)** |

**suffix 可以塞什麼**(支援 Switch 同時遵守 24px 閾值):

| Suffix 類型 | 可塞? | 對齊 | 說明 |
|-----------|------|------|------|
| ✅ 唯讀 metadata | Tag / Badge / time / count / value text | 24px 閾值 | 補充 label 資訊,不搶 row click target |
| ✅ 方向指示 | ChevronRight / ChevronDown | 24px 閾值 | 純視覺提示,row 本身仍整列可點 |
| ✅ Inline Action(單一副動作) | `ItemInlineAction`(⋯ 刪除、＋ 加入) | 24px 閾值 | 明確點擊靶子 ≤ 24px,`stopPropagation` 避免搶 row click |
| ✅ **互動 control(Switch / Checkbox / Select)** — **同樣走 24px 閾值 + 處理點擊語義** | 24px 閾值(大多符合:sm/md Switch 20×40、Checkbox 16/20) | 見下「互動 control 在 suffix」 |

### 互動 control 在 suffix(Switch / Checkbox / Select)

Menu item / dropdown item 的 suffix 是**可以**塞 Switch / Checkbox / Select 的——世界級 dropdown menu(macOS / Windows / VS Code 的 View menu、Notion 的 page options)普遍用 menu item + trailing toggle/checkmark 呈現「此項 on/off」。**條件**:必須遵守 item-anatomy 的對齊 + 點擊語義規則。

**視覺對齊**(跟 `Tag` / `Chevron` 共用規則):

- Switch sm/md = 20×40(高 20px ≤ 24)→ `h-[1lh]` inline 對齊 label 第一行
- Switch lg = 24×48(高 24px = 24)→ `h-[1lh]` inline(等號邊界)
- Checkbox sm/md = 16×16 / lg = 20×20 → 全部 `h-[1lh]` inline
- **高度全部 ≤ 24**,自然套用 24px 閾值 canonical,不需特殊邏輯

**點擊語義**(關鍵):

MenuItem 承載 Switch 時,**整列 row 的 click = toggle 這個 control**(不是另外導覽的動作)。語義是「這整列 row = 一個 toggle 行為」,row 本身 label + 尾端 Switch 共同構成 toggle 介面。避開「row click 做 A、suffix click 做 B」的歧義,因為 A 跟 B 都是 toggle 同一個狀態。

```tsx
// ✅ Canonical:row click 與 suffix Switch 同步 toggle(row 可點擊、Switch 視覺反映狀態)
<DropdownMenuItem
  suffix={<Switch checked={dark} tabIndex={-1} aria-hidden />}
  onClick={() => setDark(!dark)}
>
  Dark mode
</DropdownMenuItem>

// ❌ 錯:row 跟 Switch 各自獨立,兩個不同 action
<DropdownMenuItem onClick={navigate('/settings')}>
  Dark mode
  <Switch checked={dark} onCheckedChange={setDark} />  {/* Switch 有自己的 click,搶 row click */}
</DropdownMenuItem>
```

**Switch 實作細節**:放 suffix 時 Switch 應 `tabIndex={-1}` + `aria-hidden`(或去掉自己的 click handler),讓 **row 成為唯一互動靶子**、Switch 純視覺反映狀態。Radix `DropdownMenuCheckboxItem` 的 Checkbox 就是這模式(checkmark 是視覺,整列是 trigger)。Switch 類比採用同樣規則。

**何時用 suffix Switch vs Field horizontal**:

| 情境 | 用 | 原因 |
|------|---|------|
| **Menu / Dropdown 內的 toggle 清單**(View menu / Display options / Page toolbar filter menu) | `MenuItem` + suffix Switch | 已在 overlay 容器,menu 整列 row 就是 click target,Switch 是狀態視覺 |
| **Settings page 的獨立 toggle row**(不在 overlay,是 page layout) | `<Field orientation="horizontal">` + Switch 齊右 | 見 `components/Switch/switch.spec.md`「settings list canonical」 |

兩者**結構一致**(label 左 / toggle 右齊),差別只在**容器層級**(menu item = overlay row / Field horizontal = page row)。

**世界級對照**:macOS View menu「Show toolbar」+ ✓ / Figma View menu「Show layout grids」+ toggle / VS Code View menu「Toggle sidebar」+ ✓——都是 menu item + trailing toggle/check 的 canonical 應用。

**外層**:`flex items-start`——多行時 control / prefix / suffix 的 Y 不隨文字下移。

### Control 跟 prefix 是兩個不同的 slot

`control` 跟 `prefix` 不是同一件事,**可以同時存在**:

```
[checkbox] [avatar] [name + email]              ← Notion sharing modal
[checkbox] [icon]   [permission name]           ← Permission picker
[checkbox] [channel icon] [channel name]        ← Slack channel picker
```

`control` 是「selection 的機制」(必有,且永遠 inline,因為它是點擊靶子);`prefix` 是「視覺輔助」(可選,跟 label 內容相關)。兩者各自獨立對齊,不互相同步。

---


## 24px 閾值對齊規則(Prefix 與 Suffix 共用同一條公式)


**核心原則**:每個 slot 的對齊容器高度由**自己內容物的大小**決定。Prefix 和 suffix 用的是**完全一樣**的公式,只是各自獨立判斷,不互相同步。

### 公式

| 內容物高度 | 對齊容器 | 對齊目標 |
|---|---|---|
| ≤ 24px | `h-[1lh]` | 第一行 label 的垂直中心 |
| > 24px(+ 有 description) | `h-[calc(1lh + 2px + desc_1lh)]` | label + gap + description 文字塊的垂直中心 |
| > 24px(無 description) | `h-[1lh]` | 強制 inline(沒有文字塊可對齊) |

### 為什麼 prefix 和 suffix 各自獨立(不互相同步)

之前的版本說「suffix 永遠跟 prefix 使用相同的對齊容器高度」是錯的。Prefix 和 suffix **各自反映自己內容物的視覺重量**,不應該被綁在一起。

**1. Slot 內容物的本質不同**

- **Prefix** 是「item 的視覺主體」(avatar = 這個人是誰、icon = 這個東西是什麼)。當 prefix 是大 avatar 時,它的視覺重量平衡整個文字塊,所以對齊文字塊中心。
- **Suffix** 是「label 的 metadata」(Tag = 屬於哪一類、Chevron = 可展開、Time = 何時)。它修飾的對象是 label 第一行,所以對齊第一行。

兩個 slot 的視覺角色不同,被強迫同步反而違反它們各自的對齊邏輯。

**2. 業界 convention 全部如此**

Apple Mail / Gmail / iOS Settings / Material 3 / Atlassian DSP / Polaris ResourceItem——**全部**是「prefix 跟 suffix 各自獨立對齊」。沒有任何一個把小 suffix 強迫對齊到大 avatar 中心。

| 系統 | Prefix(大 avatar) | Suffix(小元素) |
|---|---|---|
| Apple Mail | Avatar 40px → 文字塊中心 | Date → Subject 第一行 |
| Gmail | Star icon → 第一行 | Time → Subject 第一行 |
| iOS Settings | Icon ≤24px → 第一行 | Chevron → Label 第一行 |
| Material 3 List | Leading icon → 第一行 | Trailing icon → top-aligned |

**3. 視覺重量平衡**

把小 suffix 強迫對齊大 avatar 中心,小 suffix 會「下沉」到 description 行,**視覺上跟 label 失聯**。對齊 label 第一行則讓 suffix 跟它修飾的對象在同一條基準線上,視覺重量自然分配。

### 大塊 suffix 的對待方式(symmetric 規則)

`suffix > 24px` 的場景雖然罕見,但**完全套用同一條公式**——當 suffix 是 thumbnail、stacked badge 等大塊內容時,自己的對齊容器走 block calc,對齊文字塊中心。

| 場景 | Prefix | Suffix | 結果 |
|---|---|---|---|
| 標準選單(MenuItem 大宗) | icon 16px / avatar 24px | Tag / Chevron(≤24px) | 兩邊都 inline |
| 用戶選單(avatar + name + role) | avatar 32px(block) | Chevron(≤24px) | Prefix block,suffix inline ← **各自獨立** |
| 帶縮圖列表(thumbnail + title + 縮圖) | icon 16px(inline) | thumbnail 40px(block) | Prefix inline,suffix block ← **各自獨立** |
| 雙視覺重的卡片 | avatar 40px(block) | thumbnail 40px(block) | 兩邊都 block |

**沒有「prefix 跟 suffix 必須同步」的情況。** 每個 slot 反映自己內容物的視覺重量,各自走公式。

### Avatar 尺寸選擇

**用於 prefix slot**。Avatar 尺寸是 **consumer 依視覺重量意圖決定**的——有兩組預設可選,對齊模式跟著 size 走,**不跟著 description 的有無走**。

**兩組預設尺寸**(依 row size):

| 預設組 | sm | md | lg | 視覺重量 | 典型用途 |
|---|---|---|---|---|---|
| **`AVATAR_SIZE.inline`** | 20 | 24 | 24 | 輕 | 扁平 row、footer user、單行選項、**小 avatar + 短 desc** |
| **`AVATAR_SIZE.block`** | 32 | 32 | 40 | 重 | 人物卡、顯著身份辨識、avatar 是 item 的主體 |

**對齊模式由 size 決定**(24px 閾值):

| Avatar size | 有無 description | 對齊容器 | 說明 |
|---|---|---|---|
| ≤ 24 | 無 | `h-[1lh]` inline | 單行,對齊第一行 label |
| **≤ 24** | **有** | **`h-[1lh]` inline** | **小 avatar 視覺輕,仍對齊第一行**——不強迫跨越兩行 |
| > 24 | 無 | `h-[1lh]` inline | 大 avatar 但無 desc,仍對齊第一行(block 沒意義) |
| > 24 | 有 | `h-[block calc]` block | 大 avatar 視覺重,平衡 label + desc 整個文字塊 |

**關鍵**:consumer 可以自由選擇「小 avatar + description」——那是完全合法的組合,此時 avatar inline 對齊第一行 label,description 從第二行自然往下。沒有「有 desc 就必須用 block 尺寸」的規則。

**程式化規則**:consumer **必須**用 `<ItemAvatar>` / `<ItemIcon>` helper 元件,**禁止** `import { AVATAR_SIZE }` 手動查表,更**禁止**硬寫 `<Avatar size={N} />`。

```tsx
import { ItemAvatar, ItemIcon } from "@/design-system/patterns/element-anatomy/item-anatomy"

// 案例 A:扁平 row,無 desc → ItemAvatar 預設 inline,自動查 AVATAR_SIZE.inline[rowSize]
<ItemAvatar alt="Alan" color="blue" />

// 案例 B:avatar 是 item 主體(人物卡)→ mode="block",跨文字塊對齊
<ItemAvatar mode="block" alt="Alan" color="blue" />
<span>Alan Chen</span>
<span className="text-caption">Design lead</span>

// 案例 C:icon prefix → ItemIcon 自動查 ICON_SIZE[rowSize]
<ItemIcon icon={Folder} />
```

`<ItemAvatar>` / `<ItemIcon>` 會:
1. 從 `RowSizeContext` 讀取當前 row size(由 row primitive 例如 `SidebarProvider` / `SelectMenu` 內部 propagate)
2. 查對應常數(`AVATAR_SIZE[mode][size]` / `ICON_SIZE[size]`)
3. 自動包在 `ItemPrefix`(`h-[1lh] shrink-0 flex items-center`)wrapper 內

**Consumer 完全看不到 size 數字、看不到 AVATAR_SIZE 常數、看不到 ItemPrefix wrapper——不可能寫錯。**

Canonical 對齊模式判斷:`MenuItem` 的 `isBlockAlign = avatarPx > 24 && !!description`——元件根據 24px 閾值**自動決定**對齊容器高度,不需要 consumer 額外指定 align prop。

### ❌ 為什麼不能硬寫 `size={24}`

硬寫會造成兩種漂移,兩種都是**真實發生過的 bug**:

1. **跨 size 漂移**:寫死 24 僅與 md 規格相符;sm 應為 20、lg 為 24,硬寫讓 sm 渲染出 24(比規格大 4px),Row size 變體 story 三欄並排時 sm 欄的 avatar 尺寸違反 canonical。
2. **跨 consumer 漂移**:每個 asChild consumer 各自硬寫,未來改 inline sm 從 20→18 就要全域搜改,漏一個就漂移。

**這條規則跟 `ICON_SIZE` 的程式化邏輯一致**——icon / avatar / inline action hover bg 都從 `item-layout` module 單一來源 import,row primitive 的任何尺寸常數永遠不在 consumer 側重新定義。

### asChild pattern 的責任——用 helper 元件免除全部負擔

普通 consumer(`<SidebarMenuButton startIcon={X}>{label}</SidebarMenuButton>`)不處理 prefix——元件內部自己渲染。

`asChild` pattern(Radix Slot)要求 consumer 自己組 children。**過去這代表 consumer 要處理全部尺寸查表**——曾發生 bug:三欄 sm/md/lg 並排時 avatar 全部寫 24,sm 欄應為 20 卻顯示 24。

**現在透過 `<ItemAvatar>` / `<ItemIcon>` helper,asChild consumer 零尺寸責任**:

```tsx
// ✅ 正確:helper 從 RowSizeContext 自動拿 size
<SidebarMenuButton asChild>
  <button type="button">
    <ItemAvatar alt="Alan Chen" color="blue" />
    <ItemLabel>Alan Chen</ItemLabel>
  </button>
</SidebarMenuButton>

// ❌ 錯誤:手動 Avatar + 硬寫 size,sm 欄會顯示錯誤尺寸
<SidebarMenuButton asChild>
  <button type="button">
    <span className="h-[1lh] shrink-0 flex items-center">
      <Avatar size={24} alt="Alan Chen" color="blue" />
    </span>
    <span data-sidebar="menu-label">Alan Chen</span>
  </button>
</SidebarMenuButton>
```

**Row primitive 實作者的責任**:元件內部必須用 `<RowSizeProvider value={size}>` 包裹整個子樹(包含 Slot children 的路徑),確保 descendant helper 能讀到 context。`SidebarProvider` 已內建這個——其他 row primitive 新增 asChild 支援時必須跟進。

**禁止事項**(違反的話 review 會擋):
- ❌ asChild consumer 裡出現 `<Avatar size={N} />`(用 `<ItemAvatar>`)
- ❌ asChild consumer 裡出現 `<Icon size={N} />`(用 `<ItemIcon>`)
- ❌ asChild consumer 裡出現 `import { AVATAR_SIZE, ICON_SIZE }` 手動查表(helper 已封裝)
- ❌ asChild consumer 裡手刻 `h-[1lh] shrink-0 flex items-center` wrapper(helper 內部已包)

Avatar 元件自身的規格(icon 模式、fallback、內部 icon 尺寸)見 `Avatar/avatar.spec.md`。

### Prefix 類型對齊:作用域是「同一 group 內」,不是整個元件

Label x 位置受 prefix 尺寸影響(icon 16 vs avatar 24,差 8px)。**對齊只在同一 group 內的多個 items 之間成立**——跨 group 本來就不該強求,每個 group 的 prefix 反映自己的語意重量。

| 情境 | 對齊要求 | 理由 |
|---|---|---|
| **同 group 多 items** | Prefix 類型必須一致(全 icon 或全 avatar) | 多個 label 需要齊左掃視,prefix 類型混用會讓 label x 跳動,破壞 row rhythm |
| **同 group 單一 item** | **無對齊負擔**,用 prefix 自然尺寸 | 沒有相鄰 label 可參照,縮小 prefix 只是為了對齊一個不存在的東西 |
| **跨 group** | **永不強求對齊** | 不同 group 的語意本來就不同(主導覽 icon / user identity avatar / thumbnail list),各自反映視覺重量 |

**範例**:Sidebar footer 只有一個 user row(Alan Chen)→ 用 inline avatar 24px 的自然預設,不需要縮成 16px 去對齊上方 main nav 的 icon。Main nav 和 footer 是不同 group,本來就該各自獨立。

**業界 convention**:Apple HIG list section、Material 3 list、Atlassian DSP 全部採用「section-scoped consistency」——同一 section 內 leading element 類型一致,跨 section 變化是正常的。沒有任何世界級系統要求整個 sidebar / menu 所有 prefix 強迫同尺寸。

❌ **錯誤示範**:為了讓 footer avatar 跟 main nav icon 齊左,把 avatar 從 24 改成 16——這是用錯誤方向修了一個根本不存在的問題,且違反 Avatar 尺寸公式。

### Uniform prefix slot

**Row-primitive 全域對齊(opt-in)**。機制:CSS `:has()` selector 在 row-primitive **頂層容器**(`<SidebarProvider uniformPrefix>` / 未來其他 row primitive 的 root)偵測整個子樹同時存在 `data-prefix-type="icon"` 和 `"avatar"` 後代(由 `<ItemIcon>` / `<ItemAvatar>` 自動標記)時,**全域**套用固定 prefix 槽——跨 menu / 跨 group 所有 label x 統一對齊。

**世界級兩派,我們把 A 設為預設、B 提供 opt-in**:

| School | 代表 | 行為 | 我們的預設? |
|---|---|---|---|
| A | Slack / VS Code Explorer / Discord | Per-section 獨立 prefix 寬度 | **✅ 預設** |
| B | Notion / Linear / Atlassian Confluence | 全域對齊 | 🟡 Opt-in via `uniformPrefix` |

兩派都是世界級慣例,沒有絕對對錯。**選 A 作為預設的理由**:

1. **Explicit > implicit**:auto-detect 是 CSS `:has()` 魔法,consumer 沒主動要求就在背後動排版,違反「程式行為應該從 source code 一眼看出」原則
2. **保留分組視覺語意**:不同 group / menu 在概念上代表不同層級,獨立的視覺節奏是 sectioning 的訊號
3. **Opt-in 成本極低**:想要 Notion 風格的 consumer,加 `uniformPrefix` 一個字就好

**Auto-detect 開啟後零成本**:CSS `:has()` 在不混用時完全 no-op,單一 prefix 類型的 sidebar 行為跟以前完全一樣。所以 opt-in 的代價只是「打那個 prop」,沒有 runtime perf 成本。

### 機制細節

- `<ItemIcon>` 渲染的 `<ItemPrefix>` 自動帶 `data-prefix-type="icon"`
- `<ItemAvatar>` 渲染的 `<ItemPrefix>` 自動帶 `data-prefix-type="avatar"`
- Row-primitive 頂層容器(`SidebarProvider` 的 wrapper div)在 inline style 預設一個 `--mixed-prefix-slot` 候選值(= `AVATAR_SIZE.inline[size]`,20/24/24 @ sm/md/lg)
- 同一個 wrapper 用 Tailwind variant `has-[[data-prefix-type=icon]]:has-[[data-prefix-type=avatar]]:[--item-prefix-slot:var(--mixed-prefix-slot)]` 條件化把候選值賦給 `--item-prefix-slot`
- `<ItemPrefix>` 讀取 `--item-prefix-slot`(預設 `auto`,有值則套槽 + center),自動套用

**單一類型時**:沒有任何一個後代有 `data-prefix-type=avatar`(或反過來),`:has()` 不命中,`--item-prefix-slot` 維持 `auto`,prefix 縮到自然寬度。**完全沒有 ghost spacing**。

### Per-row-primitive override(罕見 escape hatch)

`SidebarMenu` 的 `uniformPrefix` prop:

| 值 | 行為 |
|---|---|
| 不傳(預設) | 繼承 SidebarProvider 的全域 auto |
| `true` | 強制這個 menu 套槽,即使單一類型 |
| `false` | 強制關閉這個 menu 的對齊,即使全域偵測到混用 |

`uniformPrefix={false}` 用法極罕見——為「我刻意要這個 menu 跟其他 menu 視覺上不同步」的場景保留。

### 其他 row primitive 怎麼接

要對齊 Notion 模式,在 row primitive 的頂層 wrapper(例如 `<TreeView>` 的 root)加:

```tsx
const slotStyle = getUniformPrefixSlotStyle(size)
<div
  style={{ "--mixed-prefix-slot": slotStyle["--item-prefix-slot"], ...style }}
  className="has-[[data-prefix-type=icon]]:has-[[data-prefix-type=avatar]]:[--item-prefix-slot:var(--mixed-prefix-slot)]"
>
  {children}
</div>
```

`<ItemIcon>` / `<ItemAvatar>` 已自動標記 `data-prefix-type`,row primitive 實作者不用處理。

**禁止**:

- ❌ 拿 escape hatch `uniformPrefix={false}` 配合 mixed prefix 沒有設計理由——這違反使用者視覺直覺,只在「刻意製造視覺斷層」時才該用
- ❌ 在 row primitive 的某個中層元件再做一次 `:has()` 偵測——應該由頂層容器一次處理,中層不該重複 logic



## SelectionItem:Control 跟 Prefix 同高度(不歪斜)

`SelectionItem` 永遠有 **control** slot(checkbox / radio)。當 prefix(icon / avatar)也存在時,**兩者必須在同一條 baseline**——否則視覺歪斜。

### 規則:control 跟著 prefix 的對齊走

| prefix 模式 | Control 對齊 | Prefix 對齊 | 結果 |
|---|---|---|---|
| **inline**(icon / 小 avatar,≤24px) | `h-[1lh]` | `h-[1lh]` | 兩者都在 label 第一行 |
| **block**(大 avatar >24px + 有 desc) | **`h-[block calc]`** | `h-[block calc]` | 兩者都在 text block center |

```
Inline 模式:

[✓][avatar 24] Alice Chen
               Design lead

Block 模式:

         ┌──────┐
  [✓]    │  A   │  Alice Chen
         │ 32px │  Design lead
         └──────┘
```

Block 模式時 checkbox 不在 label 第一行——它跟 avatar 在同一高度(text block center)。這沒問題,因為 form picker 整列可點擊,checkbox 的位置不影響操作;checkbox 跟 avatar 構成「selection + identity」的視覺單元,應該同高。

### 為什麼不是「checkbox 固定在 label 第一行、avatar 自由 block」?

那樣會歪斜:

```
❌ 歪斜:checkbox 跟 avatar 在不同高度

[✓] ──── label 第一行
              ┌──────┐
              │avatar│  Alice Chen
              │  32  │  Design lead
              └──────┘
```

業界零個成功案例。只要左側有兩個元素(control + prefix),它們必須在同一條 baseline 上。

### 業界 form picker 對照

| 系統 | Avatar | 對齊 | 備註 |
|---|---|---|---|
| **GitHub** | 20px | inline | 小 avatar,不需要 block |
| **Linear** | 20px | inline | 同上 |
| **Microsoft Teams** | 24-28px | inline | 簡單列表 |
| **Notion sharing** | 28px | block(avatar center) | 無左 checkbox(click row 選取) |
| **Slack invite** | 36px | block(avatar center) | checkbox 在右側 suffix |

有 left checkbox 的(GitHub/Linear/Teams)都用 inline。想 block 的(Notion/Slack)則不用 left checkbox——要嘛 click row 選取,要嘛 checkbox 在右。

**我們的 SelectionItem 兩個都支援**:左 checkbox + block 時,checkbox 跟 avatar 同步下移到 text block center,不歪斜。

---

## 兩種閱讀模式

| | 掃描模式 | 閱讀模式 |
|---|---|---|
| **場景** | 浮層 / overlay（一掃而過） | 頁面 / 表單（仔細閱讀） |
| **Label 行高** | `leading-compact` (1.3) | 預設 (1.5) |
| **Description 字體** | 降一級（14→12px, 16→14px） | 最小 14px（14→14px, 16→14px） |
| **Description 顏色** | `fg-secondary` | `fg-secondary` |
| **Label ↔ Desc 間距** | 2px via `--item-gap-label-desc` token(SSOT)| 同左 |

**SSOT 架構(2026-04-23 更新)**:
- **Token**:`--item-gap-label-desc`(值 2px,定義於 `tokens/layoutSpace/layoutSpace.css`)
- **Primitive**:`<ItemContent label description descriptionTone>`(from `item-anatomy.tsx`,封裝 flex-col + token gap)
- **Consumer 消費 2 擇 1**:
  - 直接 token:`mt-[var(--item-gap-label-desc)]` / `gap-[var(--item-gap-label-desc)]`
  - 或 primitive:`<ItemContent label=... description=... descriptionTone=...>`
- **改值一處(token)→ 全 DS 同步**,不用 grep 手改 13+ 檔

**偏離 canonical 規則**:Consumer 若有明確合理理由不用 primitive / 自訂 label-desc typography,**必在該元件 `spec.md` 明文 rationale**。

### ItemContent primitive 消費表(2026-04-23 盤點)

| Consumer | Primitive 消費 | Rationale |
|----------|--------------|-----------|
| **FileItem**(rich + compact) | ✅ ItemContent + ItemPrefix + ItemInlineActionButton | 純 row-item layout,完美 fit |
| **Notice / Alert / Toast** | ✅ ItemContent + ItemPrefix | title+desc 標準 row-item 結構 |
| **NameCard** | ✅ ItemContent(+ `labelTruncate=false` + `labelClassName` escape hatch) | 偏離 rationale:card context 用 `text-body-lg font-medium`,非一般 body label |
| **MenuItem** | ✅ ItemContent(`mode="scanning"\|"scanning-lg"`)+ `itemPrefixAlignVariants` cva SSOT | Content 用 ItemContent 配合 size-aware scanning mode(sm/md = caption / lg = body-compact);label+desc clamp 透過 className escape hatch(MenuItem 特化 labelMaxLines / descMaxLines 語意) |
| **Sidebar / TreeView** | ✅ ItemPrefix(+ 其他 primitives) | Label-only(無 description),不需 ItemContent |
| **Empty** | ❌ token-direct only | **結構限制**:centered stack pattern(icon → title → desc → action 垂直居中),非 row-item 佈局。保持手刻 |
| **Dialog**(DialogTitle / DialogDescription) | ❌ token-direct only | **結構限制**:title 跟 desc 是獨立 Radix `<DialogTitle>` / `<DialogDescription>` component(aria-labelledby / aria-describedby 語義),非同層 span 配對 |
| **DescriptionList** | ❌ token-direct only | **語義限制**:用 `<dl>/<dt>/<dd>` HTML semantic elements,非 div+span |
| **SelectionItem** | ❌ token-direct only | **a11y 限制**:label 必為 `<label htmlFor={id}>` 表單 control 關聯(form association);ItemContent 渲染 `<span>` 會破壞 form a11y |
| **Switch**(standalone mode with label+desc) | ❌ token-direct only | **a11y 限制(同 SelectionItem)**:standalone mode 用 `<label htmlFor={inputId}>` 包 label+desc+switch,form control 關聯必要。Control-only mode(放 MenuItem suffix 等)不涉及 label+desc,不在 ItemContent scope |
| **Steps**(`StepDescription`) | ❌ token-direct only | **API 限制**:StepLabel 跟 StepDescription 是獨立 public forwardRef subcomponent,consumer 分開寫;遷 ItemContent(single-component API)= breaking API |

**共 5 consumer 消費 primitive(FileItem / Notice / NameCard / MenuItem / TreeView・Sidebar),5 consumer 保 token-direct 各有 a11y / semantic / API 結構限制**。Token 層 SSOT 100% 覆蓋(改 `--item-gap-label-desc` 全 DS 同步);primitive 層覆蓋結構能 fit 的 consumer。

**Switch 跟 SelectionItem 同 blocker**(2026-04-23 user 糾正):兩者都是 `<label htmlFor>` 表單 control 關聯結構,ItemContent 用 `<span>` 渲染 label 會破壞 form a11y。這類結構**只能 token-level SSOT**(實際已做)。

### `<ItemContent mode>` prop(2026-04-23 擴充)

Primitive 直接封裝 scanning / reading 兩種 typography:

```tsx
<ItemContent label="..." description="..." mode="reading" />  {/* 預設,繼承 text-body */}
<ItemContent label="..." description="..." mode="scanning" />  {/* desc 縮為 text-caption + leading-compact */}
```

World-class benchmark(6 家 DS):
- Material M3:`<List dense>` boolean
- Carbon:`size="sm\|md\|lg\|xl"` enum
- Ant:`size="small\|default\|large"` enum
- Polaris / Atlassian / Apple HIG:typography token 手選(無 density prop)
- 6 家共識:14/20 vs 16/24 兩擋 body 表達 scanning vs reading

本 DS 採 density-prop 派(A 派),跟 Material / Carbon / Ant 對齊。`mode` 比 `dense` 更 self-documenting。

**未來改 scanning typography(e.g. 從 caption 12 改到 caption 13)**:只改 `--font-caption-size` token 一處 → 所有 `mode="scanning"` 的 consumer 同步動。

### Suffix block formula 的 `2px` 也 tokenize(2026-04-23)

`h-[calc(1lh+2px+desc_1lh)]` 中的 `2px` 原 hard-code(item-anatomy.stories / MenuItem cva / SelectionItem cva),
2026-04-23 全改為 `var(--item-gap-label-desc)` — 同 token 傳播到 block 公式。改 gap 值一處,
inline 跟 block 兩層 formula 同步動。

**Enforcement**:
- Hook `check_item_content_primitive.sh`(2026-04-23)P1 warn:component .tsx 出現硬寫 `mt-0.5` / `gap-0.5` 提示改 token / primitive
- Consumer 刻意 hard-code 加 `// @item-gap-exempt: <reason>` 豁免 + rationale 在 spec
| **判斷標準** | 使用者快速掃描選擇 | 使用者停留閱讀 |

**兩種模式的唯一差異是行高。** Description 在所有模式都降一級字體——label 是要辨識的目標，description 是補充，尺寸差有助快速區分。

---

## Icon 色彩原則

一條統一規則，跨所有元件（詳見 `color.spec.md`）：

| 判斷 | 顏色 | 範例 |
|---|---|---|
| icon 代表內容或類別 | **與 label 同色** | Mail「電子郵件」、Settings「設定」 |
| icon 代表危險操作 | **與 label 同色**（text-error） | Trash2「刪除」 |
| icon 純指示方向/展開 | `fg-muted`（neutral-7） | ChevronRight、ChevronDown、ExternalLink |
| suffix value 文字 | `fg-muted`，**字體大小與 label 相同** | "深色"、"已啟用" |
| disabled 時 | `fg-disabled` | 全部統一 |

---

## 消費元件預設

每個消費元件根據場景自訂間距，但結構和對齊規則不變：

### MenuItem / DropdownMenuItem（浮層選單）

| 屬性 | 值 | 原因 |
|---|---|---|
| padding-y | `calc((field-height - 1lh) / 2)` | 單行高度 = field-height，對齊 Button / Input |
| padding-x | 12px (`px-3`) | 選單項目的標準水平間距 |
| prefix ↔ content gap | 8px (`gap-2`) | 緊湊但可辨識 |
| suffix 獨立後綴 gap | 8px (`gap-2`) | tag / badge / endIcon 間距 |
| suffix 子選單指示 gap | 4px (`gap-1`) | value / badge / ChevronRight 更緊湊 |
| 閱讀模式 | 掃描模式 | 浮層內一掃而過 |

### SelectionItem（表單 Checkbox / Radio）

| 屬性 | 值 | 原因 |
|---|---|---|
| padding-y | `calc((field-height - 1lh) / 2)` | 單行高度 = field-height，對齊同 size 的 Input |
| padding-x | 無（由外層容器決定） | 表單佈局各異 |
| prefix ↔ content gap | 8px (`gap-2`) | 控件與 label 的標準間距 |
| 閱讀模式 | 閱讀模式 | 表單內仔細閱讀 |

### ListItem（頁面列表，未來元件）

| 屬性 | 值 | 原因 |
|---|---|---|
| padding-y | 12px (`py-3`) | 舒適的列表行高，觸控友好 |
| padding-x | 16px (`px-4`) | 頁面內容的標準水平間距 |
| prefix ↔ content gap | 12px (`gap-3`) | 較寬鬆，適合較大的 avatar / thumbnail |
| 閱讀模式 | 閱讀模式 | 頁面內停留閱讀 |

---

## Chevron 方向慣例(位置決定旋轉公式)

世界級系統的 chevron 旋轉慣例**由位置決定**,不由「展開/收合」的語意決定。一個 UI 內兩種位置的 chevron 可以共存,各自遵守自己位置的規則不衝突。

| 位置 | Base icon | Open 時 | Rotate 量 | 慣例 | 語意 |
|---|---|---|---|---|---|
| **Prefix**(item 起始,tree disclosure) | `ChevronRight` (`>`) | `v` | `rotate-90` | Tree disclosure | 箭頭指向內容所在 |
| **Suffix**(header 尾端,section trigger) | `ChevronDown` (`v`) | `^` | `rotate-180` | Accordion / section header | 箭頭指示下一個可執行方向 |

**Canonical 引用**:

- **Prefix = rotate-90**:Finder、VS Code、Notion、Xcode、iOS Files、本系統 TreeView
- **Suffix = rotate-180**:Radix Accordion、shadcn Collapsible、Material Expansion Panel、Linear section header、Slack section header、本系統 SidebarGroup collapsible

**為什麼兩種慣例可以共存**:位置本身就是區分訊號。prefix chevron 緊貼 item icon,使用者讀作「這個 item 有子項」;suffix chevron 靠右 ml-auto,使用者讀作「點這裡展開/收合整個 section」。混用不會造成混淆——混用的是位置/角色,不是同一個角色兩種行為。

**禁止**:

- ❌ Prefix 位置用 `ChevronDown` + rotate-180——prefix 慣例是 tree / 子項展開,用 ChevronDown 把語意切到 accordion,位置與 icon 錯配
- ❌ Suffix 位置用 `ChevronRight` + rotate-90——suffix 慣例是 section accordion,用 ChevronRight 把語意切到 tree item,違反 accordion 慣例
- ❌ 用 ChevronUp / ChevronDown 兩個 icon 切換(用 transform rotate 就好,免去 state transition 的閃爍)

**實作範例**:

```tsx
// Prefix(TreeItem)
<ChevronRight className="transition-transform [data-expanded=true]_&:rotate-90" />

// Suffix(SidebarGroup collapsible trigger)
<ChevronDown className="transition-transform [[data-state=open]_&]:rotate-180" />
```

---


## Inline Action 設計規格 → `inline-action.spec.md`(2026-04-24 抽出,獨立 SSOT)

嵌入 Tag dismiss / Field endAction / Row suffix action 的 icon primitive。完整 265 行視覺規格 / API / predicate / Icon 色 / same-row consistency → 見 `patterns/element-anatomy/inline-action.spec.md`。

## 選擇 / 狀態視覺規則

這一節是曾經連續犯錯的類別,兩條互補規則。

### 規則 A: 用元件既有的 state prop,不要用 className 發明樣式

**任何元件既有的狀態 prop(`selected` / `checked` / `disabled` / `pressed` / `active` / `invalid` / `loading` 等),消費端必須用 prop,禁止用 `className` 疊加自創樣式表達同一個狀態**。

理由:
- 既有 prop 背後綁定 **canonical token**(`bg-neutral-selected` / `border-primary-hover` 等),一改全系統同步
- `className` 自創樣式繞過 canonical,導致「同一狀態在不同元件產生視覺分歧」的跨元件漂移
- 既有 prop 通常也綁 ARIA attributes(`aria-selected` / `aria-checked` 等),自創樣式會丟失 a11y 語意

#### 真實犯錯紀錄

> **Case**: Tabs overflow menu 的 active 項目。`DropdownMenuItem` 本來就有 `selected` prop 對應 `bg-neutral-selected`(跟 SelectMenu 單選 canonical 視覺完全一致),但繞過 prop 直接寫 `className={cn(isActive && 'font-medium text-primary-hover')}` 發明一套「粗體藍字」樣式。結果跟 SelectMenu 同類別的單選視覺完全不一致,使用者一眼看出「為什麼這個 dropdown 跟那個 dropdown 不一樣」。

#### 正確做法

```tsx
// ✅ 對: 用 DropdownMenuItem 的 selected prop(canonical bg-neutral-selected)
<DropdownMenuItem selected={isActive} onSelect={...}>{label}</DropdownMenuItem>

// ❌ 錯: 用 className 自創樣式
<DropdownMenuItem className={cn(isActive && 'font-medium text-primary-hover')}>{label}</DropdownMenuItem>

// ❌ 錯: 用錯 semantic 的 prop
<DropdownMenuCheckboxItem checked={isActive}>{label}</DropdownMenuCheckboxItem>
```

#### 檢查法(寫任何 selection / state 樣式前必做)

1. **grep 元件 props interface**,看它有沒有相關的 state prop(`selected`、`checked`、`disabled`、`active`、`pressed`、`invalid`...)
2. 有 → **一定用那個 prop**,不用 className
3. 沒有 → 先暫停,問「是不是該補這個 prop 到元件本身」,不要直接在 consumer 用 className 繞過
4. 確認沒必要補 prop 才用 className

### 規則 B: 選擇語意必須對應指示器視覺

Selection control(Dropdown / Menu / List / SegmentedControl / Chip)的 item 視覺指示器,必須對應該 control 的 selection model。使用者看一眼就應該能判斷「我可以選多個 vs 我只能選一個」。

| Selection Model | Canonical 視覺 | 禁止 |
|---|---|---|
| **多選**(checkbox semantic) | `DropdownMenuCheckboxItem`(方塊勾)、SelectionItem checkbox | radio 圓圈、bg 高亮(無方塊會誤以為單選) |
| **單選 in dropdown / menu** | `DropdownMenuItem` 的 `selected` prop → `bg-neutral-selected` 持續選中背景(跟 SelectMenu 單選同一套) | **checkbox 方塊**(暗示多選)、**radio 圓圈**(dropdown 不用 radio 指示器,RadioGroup 才用) |
| **單選 as always-visible form control** | `RadioGroup` + `RadioGroupItem`(圓圈) | — |

#### 為什麼 dropdown 單選不用 radio 圓圈

本系統(跟 macOS / Chrome / VS Code 一致)在「隱藏在 dropdown 內的單選」統一用**持續高亮背景**(`bg-neutral-selected`),不用 radio 圓圈指示器。radio 圓圈只用在**永遠可見的 form RadioGroup**。
兩者視覺完全不同但都是單選,差異來自「使用場景」:
- **Dropdown 單選(隱藏)**: 打開時視覺極簡,只高亮 current,點了就關、切換 context → SelectMenu / DropdownMenu 單選
- **Form RadioGroup(常駐)**: 永遠展開,使用者在填表時掃視所有選項 → radio 圓圈讓「這是一組互斥選項」一眼可辨

#### 新元件檢查法

設計或審查 selection control 時:
1. **單選 or 多選?** → 選對 primitive
2. **隱藏型(dropdown)or 常駐型(form control)?** → 選對視覺語言
3. **看 consumer 要用什麼 state prop,不要繞過 prop 用 className**(跟上面規則 A 合用)

**這兩條規則是曾經連續犯錯的原因**。違反規則 A 會造成「同狀態不同視覺」,違反規則 B 會造成「視覺誤導 mental model」。寫新元件或審查現有元件時兩條都檢查。

---

## 新元件 checklist

建立新的「prefix + content + suffix」元件時：

1. ✅ 確定閱讀模式（掃描 or 閱讀）→ 決定 typography 策略
2. ✅ 確定 padding-y（field-height 公式 or 固定值)
3. ✅ 確定 padding-x 和 gap
4. ✅ prefix 對齊容器遵循 24px 閾值(小→inline / 大+desc→block)
5. ✅ suffix 對齊容器**獨立判斷**(不跟 prefix 綁定,見「24px 閾值對齊規則」的 suffix 獨立說明)
6. ✅ 外層 `flex items-start`,prefix / suffix 各自包 `h-[1lh]`(或 block calc)wrapper
7. ✅ Prefix 用 `<ItemIcon>` / `<ItemAvatar>` helper,**禁止**硬寫 `<Avatar size={N} />` 或 `<Icon size={N} />`
8. ✅ Icon 尺寸用 `ICON_SIZE` 常數 + `size` prop 直接傳給 Lucide,不用 CSS `[&>svg]:size-*` selector
9. ✅ Label span 有 `min-w-0 flex-1 truncate`(或用 `<ItemLabel>` helper)
10. ✅ Suffix inline action 用 `<ItemInlineAction>` / `<ItemInlineActionButton>`,**禁止**複製 hover-bg 絕對定位 JSX
11. ✅ Row primitive 容器用 `<RowSizeProvider value={size}>` 包住所有 children,讓 helper 元件能讀到 size
12. ✅ icon 色彩遵循「代表內容 = label 同色,指示方向 = fg-muted」
13. ✅ description 字體遵循閱讀模式規則

---

## Recipe + 自我檢查 → `.claude/references/item-anatomy-recipe.md`

建立新 row primitive 的 7 步 workflow + audit grep guard + SidebarMenuButton 獨立實作風險,搬到 `.claude/references/item-anatomy-recipe.md`(spec 2026-04-24 prune 瘦身 — Recipe 是 workflow 類,搬 reference 減 spec 體積)。

本節僅保留 pointer。建 row primitive → 讀 reference + 本 spec 的結構 / padding / 24px 閾值 / slot 規範 / 選擇狀態視覺 / Inline Action spec 等 canonical。

---

## (下方舊有 Recipe + 自我檢查內容已搬到 reference,保留下游 SidebarMenuButton 風險註記不丟失)

**〜SidebarMenuButton 獨立實作風險〜(2026-04-24 retired — risk 已消除)**:前 SidebarMenuButton / TreeItem 的 cva size 公式獨立寫,drift risk 存在。2026-04-24 D Phase 1+2 consolidation 後,3 cva(menu / sidebar / tree)全消費 `rowPaddingBySize` 共享 SSOT(item-anatomy.tsx 導出)。改公式一處全同步,risk eliminated。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `alert.spec.md`
- `command.spec.md`
- `data-table.spec.md`
- `dropdown-menu.spec.md`
- `empty.spec.md`
- `field.spec.md`
- `file-item.spec.md`
- `menu-item.spec.md`
- `notice.spec.md`
- `overlay-surface.spec.md`
- `select-menu.spec.md`
- `select.spec.md`
- `selection-item.spec.md`
- `sidebar.spec.md`
- `tag.spec.md`
- `time-picker.spec.md`
- `toast.spec.md`
- `tree-view.spec.md`
- `typography.spec.md`

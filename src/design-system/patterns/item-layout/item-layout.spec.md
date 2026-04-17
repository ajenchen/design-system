# Item Layout 設計原則

## 定位

Item Layout 定義**結構和對齊系統**，不定義具體間距值。每個消費元件根據自身場景設定間距，但遵循相同的結構和對齊規則。

**這不是一個元件，是一套佈局原則。**

---

## 適用對象(哪些元件必須套用 item-layout)

以下所有 row-class 元件屬於**同一類 row primitive**,必須共用同一套 item-layout 規則——padding 公式、高度、hover / active、gap、font-medium、text color:

| Row primitive | 元件 | 所在檔案 | 備註 |
|---|---|---|---|
| Menu item(dropdown / select 浮層) | `MenuItem`(含 `header` 模式) | `components/Menu/menu-item.tsx` | **Canonical 實作** |
| Tree item(階層結構) | `TreeItem` | `components/TreeView/tree-view.tsx` | — |
| Sidebar menu button | `SidebarMenuButton` / `SidebarGroupLabel` | `components/Sidebar/sidebar.tsx` | — |
| Dropdown menu item | 重用 MenuItem | `components/DropdownMenu/dropdown-menu.tsx` | — |
| Step item(流程進度指示器)| `StepItem` / `StepLabel` / `StepDescription` | `components/Steps/steps.tsx` | **有明文例外** — indicator 永遠 inline 對齊 label 第一行,不論尺寸 / 有無 description。Column rhythm 優先於 24px 閾值規則。詳見 `components/Steps/steps.spec.md` 的「Indicator 對齊」節 |
| 任何未來的 row 元件 | — | 必須照此模式 | — |

**`MenuItem` 的 `menuItemVariants` cva 是 canonical 實作**——寫任何新 row 元件前,先讀它,複製 padding 公式 + variant 結構 + header 模式,不要自己發明新規格。

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

適用場景：NameCard profile header、FileItem detail、未來的 profile page header。
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

### Avatar 尺寸選擇(用於 prefix slot)

Avatar 尺寸是 **consumer 依視覺重量意圖決定**的——有兩組預設可選,對齊模式跟著 size 走,**不跟著 description 的有無走**。

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
import { ItemAvatar, ItemIcon } from "@/design-system/patterns/item-layout/item-layout"

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

1. **跨 size 漂移**:寫死 24 看起來在 md 對,但 sm 應該是 20、硬寫讓 sm 變 24——Row size 變體 story 三欄並排時,sm 欄的 avatar 比規格大 4px,視覺上破功。
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

### Uniform prefix slot:Row-primitive 全域對齊(opt-in)

**機制**:CSS `:has()` selector 在 row-primitive **頂層容器**(`<SidebarProvider uniformPrefix>` / 未來其他 row primitive 的 root)偵測整個子樹同時存在 `data-prefix-type="icon"` 和 `"avatar"` 後代(由 `<ItemIcon>` / `<ItemAvatar>` 自動標記)時,**全域**套用固定 prefix 槽——跨 menu / 跨 group 所有 label x 統一對齊。

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

---

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
| **Label ↔ Desc 間距** | 2px (`mt-0.5`) | 2px (`mt-0.5`) |
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

- ❌ Prefix 位置用 `ChevronDown` + rotate-180——看起來像 accordion,語意錯位
- ❌ Suffix 位置用 `ChevronRight` + rotate-90——看起來像 tree item,違反 accordion 慣例
- ❌ 用 ChevronUp / ChevronDown 兩個 icon 切換(用 transform rotate 就好,免去 state transition 的閃爍)

**實作範例**:

```tsx
// Prefix(TreeItem)
<ChevronRight className="transition-transform [data-expanded=true]_&:rotate-90" />

// Suffix(SidebarGroup collapsible trigger)
<ChevronDown className="transition-transform [[data-state=open]_&]:rotate-180" />
```

---

## Inline Action 設計規格

嵌入在其他元件內部的互動觸發點（Tag dismiss、Field endAction 等）。不是獨立的 Button，由宿主元件渲染和控制。

### 視覺規則

1. **Icon 視覺尺寸跟隨宿主 tier**，排版以 icon 為準
2. **平時透明**，視覺上等同靜態 icon
3. **Hover 時顯示背景色區域**，提示可點擊。背景色區域 = icon + 2px（直徑，即每邊 +1px），不影響排版（用 absolute positioning 或 negative margin 溢出）

### 互動狀態

與 Button text variant 一致：

| 狀態 | 背景 | 過渡 |
|---|---|---|
| 預設 | transparent | — |
| hover | `bg-neutral-hover` | transition-colors |
| active | `bg-neutral-active` | transition-colors |
| focus-visible | `outline: 2px solid var(--ring)` | — |
| 宿主 disabled | 不渲染 inline action | — |

### Icon 色彩

所有 inline action 統一行為：預設 `fg-muted`，hover / active 時變 `foreground`。不區分層級——utility icon 本質上都是輔助操作，預設退到背景，hover 時提示可操作。

### 尺寸對照

| 宿主 | Icon 視覺 | Hover 背景 | 圓角 | 排版佔位 |
|---|---|---|---|---|
| Tag sm (20px) | 16px | 18px | rounded-sm | 16px |
| Tag md/lg (24px) | 16px | 18px | rounded-sm | 16px |
| Field sm/md | 16px | 18px | rounded-sm | 16px |
| Field lg | 20px | 22px | rounded-md | 20px |
| TreeItem sm/md | 16px | 18px | rounded-sm | 16px |
| TreeItem lg | 20px | 22px | rounded-md | 20px |

### 多個 Inline Action 並排

當一個宿主有多個 inline action(如 Select 的 clear X + ChevronDown,或 TreeItem 的 ⋯ + ＋)時:

- **間距**:`gap-2`(8px)——跟 fieldWrapperStyles 的元素間距一致(Select 的 clear X 和 ChevronDown 就是 gap-2)
- **對齊**:全部垂直置中在同一行(`flex items-center`)
- **出現時機**:全部一起出現(TreeItem 的 hover-reveal 是同時淡入所有 action,不逐個)

### API 設計

Inline action 由宿主元件渲染，消費者只需宣告 intent：

```tsx
// ❌ 舊：消費者自行決定 Button size、icon size
<Input endAction={<Button size="xs" iconOnly startIcon={X} aria-label="清除" onClick={...} />} />

// ✅ 新：宣告式，Field 自己根據 size tier 渲染
<Input endAction={{ icon: X, label: '清除', onClick: handleClear }} />
```

Field 內部根據自己的 size 決定 icon 尺寸、hover 背景大小、視覺層級。消費者不需要知道這些。

### 實作要求

- 必須是 `<button>` 元素，不是 `<span>` + onClick
- 必須有 `aria-label`
- 必須有 `cursor-pointer`——可點擊的元素必須有明確的游標指引
- 必須有 Tooltip（`label` 欄位同時作為 `aria-label` 和 tooltip 內容）——icon-only 控件沒有可見文字，tooltip 是使用者理解功能的唯一視覺提示
- 宿主 disabled 時不渲染（不可操作就不該暗示可以操作）

### Predicate:什麼算 inline action

**命名無關**。下列三個條件同時成立 → **就是 inline action**,不准繞過 helper:

1. 在 row primitive 內(或其 suffix / label / prefix slot)
2. 是 icon(或主要視覺是 icon)
3. 可點擊(有 onClick / 是 Radix Trigger / 是 collapsible toggle)

**真實例子**(曾犯過的錯):

- SelectField 的 clear X
- Tag 的 dismiss X
- TreeView 的 hover-reveal 「⋯」/「＋」
- **SidebarGroup collapsible 的 chevron toggle**——曾經誤寫成裸 icon + rotate className,**它是可點擊的 icon 就是 inline action**,跟叫不叫 chevron 無關
- Popover / Dropdown trigger 如果主視覺是 icon

### Inline action 共用元件(`ItemInlineAction` / `ItemSuffix`)

**過去每個 host(Input / NumberInput / Tag / LinkField / Combobox)自己複製 ~18 行 JSX** 來渲染——重複、易漂移、任何規格調整都要改 5+ 處。

Canonical 實作搬到 `item-layout.tsx`,匯出兩個元件:

```tsx
import { ItemInlineAction, ItemSuffix, type InlineActionConfig } from "@/design-system/patterns/item-layout/item-layout"

// 單一 action
<ItemInlineAction action={{ icon: X, label: '清除', onClick: handleClear }} />

// 多個 action + hover-reveal(TreeView 模式)
<ItemSuffix hoverReveal>
  <ItemInlineAction action={{ icon: MoreHorizontal, label: '更多', onClick: ... }} />
  <ItemInlineAction action={{ icon: Plus, label: '新增', onClick: ... }} />
</ItemSuffix>
```

`ItemInlineAction` 自動從 `RowSizeContext` 查:

- Icon 尺寸 = `ICON_SIZE[size]`(16/16/20)
- Hover bg 尺寸 = `INLINE_ACTION_HOVER_BG_SIZE[size]`(18/18/22)
- 圓角 = `rounded-sm` (sm/md) / `rounded-md` (lg)
- Tooltip / aria-label / cursor-pointer / fg-muted → foreground 全部內建

**Host 的責任**(宣告式 API,不自己渲染 button JSX):

```tsx
// ✅ 正確:consumer 宣告 intent,host 用 ItemInlineAction 渲染
<SidebarMenuButton inlineActions={[{ icon: X, label: '...', onClick: ... }]} />

// ❌ 錯誤:host 自己複製 18 行 JSX
<button className="...">
  <span className="absolute ..." />
  <X size={16} />
</button>
```

**現況**:`SidebarMenuButton` 已遷移。**未來 refactor target**:Input、NumberInput、Tag、LinkField、Combobox 都有同一段重複 JSX,應該逐步改用 `ItemInlineAction`,讓 canonical 實作成為**單一 source of truth**。

任何 row primitive 要支援 suffix inline action,只要:
1. 接收 `inlineActions?: InlineActionConfig[]` prop
2. 在 suffix slot 用 `ItemInlineAction` 渲染
3. 用 `RowSizeProvider`(已由 SidebarProvider 等容器提供)確保 descendant 讀到對的 size

---

## 選擇 / 狀態視覺規則

這一節是曾經連續犯錯的類別,兩條互補規則。

### 規則 A: 用元件既有的 state prop,不要用 className 發明樣式

**任何元件既有的狀態 prop(`selected` / `checked` / `disabled` / `pressed` / `active` / `invalid` / `loading` 等),消費端必須用 prop,禁止用 `className` 疊加自創樣式表達同一個狀態**。

理由:
- 既有 prop 背後綁定 **canonical token**(`bg-neutral-selected` / `border-primary-hover` 等),一改全系統同步
- `className` 自創樣式繞過 canonical,導致「同一狀態在不同元件看起來不同」的視覺漂移
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

## Recipe:7 步建立新的 row primitive

要做一個跟 SidebarMenuButton / TreeItem / MenuItem / DropdownMenuItem 同套規格的全新 row primitive,**永遠按這 7 步**。整套花 30 分鐘以內,而且不會有任何漂移空間。

### Step 1 — Container 提供 `RowSizeContext`

在你的 row primitive 的「容器層」(Provider / Root / Menu 等),把整個子樹包進 `<RowSizeProvider>`:

```tsx
import { RowSizeProvider, type RowSize } from "@/design-system/patterns/item-layout/item-layout"

function MyMenuProvider({ size = "md", children }: { size?: RowSize, children: React.ReactNode }) {
  return (
    <MyMenuContext.Provider value={...}>
      <RowSizeProvider value={size}>
        {children}
      </RowSizeProvider>
    </MyMenuContext.Provider>
  )
}
```

**為什麼**:讓子樹的所有 `<ItemIcon>` / `<ItemAvatar>` / `<ItemInlineAction>` 自動拿到對的 size。沒這層,asChild consumer 就要自己手算 size,必定漂移。

### Step 2 — Item cva 用 item-layout 公式

不要自己發明 padding / typography 公式,複製 MenuItem / SidebarMenuButton 的 cva 結構:

```tsx
import { cva } from "class-variance-authority"

const myItemVariants = cva(
  [
    "flex w-full items-start gap-2 text-left",
    "px-[var(--layout-space-loose)]",  // ← 跨 row primitive 共用 padding
    "cursor-pointer select-none outline-none",
    "transition-colors",
    "hover:bg-neutral-hover focus-visible:bg-neutral-hover",
    "data-[active=true]:bg-neutral-selected",
  ],
  {
    variants: {
      size: {
        sm: "text-body leading-compact py-[calc((var(--field-height-sm)-1lh)/2)]",
        md: "text-body leading-compact py-[calc((var(--field-height-md)-1lh)/2)]",
        lg: "text-body-lg leading-compact py-[calc((var(--field-height-lg)-1lh)/2)]",
      },
    },
    defaultVariants: { size: "md" },
  }
)
```

**公式**:`py = (field-height - 1lh) / 2`,行高與 field-height 自動同步,density 切換無需手動調。

### Step 3 — Prefix 用 helper(不手刻)

```tsx
import { ItemIcon, ItemAvatar, ItemLabel } from "@/design-system/patterns/item-layout/item-layout"

// 帶 startIcon prop 的非 asChild 路徑:
<button className={myItemVariants({ size })}>
  <ItemIcon icon={Folder} />
  <ItemLabel>{label}</ItemLabel>
</button>

// asChild 路徑(consumer 自組 children):
<MyItem asChild>
  <button>
    <ItemAvatar alt="User" color="blue" />
    <ItemLabel>User Name</ItemLabel>
  </button>
</MyItem>
```

**禁止**手寫 `<Icon size={16} />` 或 `<Avatar size={24} />` ——helper 已從 `RowSizeContext` 自動查表。

### Step 4 — Suffix inline actions(如需)

```tsx
import { ItemInlineAction, type InlineActionConfig } from "@/design-system/patterns/item-layout/item-layout"

interface MyItemProps {
  // ... 其他 props
  inlineActions?: InlineActionConfig[]
  actionsReveal?: false | "hover"
}

// 在 render 內:
{inlineActions && inlineActions.length > 0 && (
  <span className={cn(
    "h-[1lh] shrink-0 ml-auto flex items-center gap-2",
    actionsReveal === "hover" &&
      "opacity-0 group-hover/my-item:opacity-100 group-has-[:focus-visible]/my-item:opacity-100 transition-opacity"
  )}>
    {inlineActions.map((action, i) => (
      <ItemInlineAction key={action.label + i} action={action} />
    ))}
  </span>
)}
```

**用 `group-has-[:focus-visible]`,不要用 `group-focus-within`**——後者會被 mouse click 觸發。

### Step 5 — Single selection(如需)

如果 row primitive 是「導覽」性質(每次只有一個 active),把 selection state 放 Provider:

```tsx
type MyMenuContextValue = {
  activeId: string | undefined
  setActiveId: (id: string) => void
}

// MyMenuProvider 接 controlled / uncontrolled props:
function MyMenuProvider({
  activeId: activeIdProp,
  defaultActiveId,
  onActiveChange,
  children,
}: {
  activeId?: string
  defaultActiveId?: string
  onActiveChange?: (id: string) => void
  children: React.ReactNode
}) {
  const [_id, _setId] = React.useState<string | undefined>(defaultActiveId)
  const activeId = activeIdProp ?? _id
  const setActiveId = (id: string) => {
    if (activeIdProp === undefined) _setId(id)
    onActiveChange?.(id)
  }
  return <MyMenuContext.Provider value={{ activeId, setActiveId }}>{children}</MyMenuContext.Provider>
}

// MyItem 接 id prop,自動算 isActive、自動 onClick 設 activeId:
function MyItem({ id, onClick, ...props }: { id?: string, onClick?: ... }) {
  const { activeId, setActiveId } = useMyMenu()
  const isActive = id !== undefined && activeId === id
  const handleClick = (e: React.MouseEvent) => {
    if (id !== undefined) setActiveId(id)
    onClick?.(e)
  }
  return <button data-active={isActive} onClick={handleClick} ... />
}
```

**Consumer 只需要傳 `id`**,無法寫出啞 item。

### Step 6 — Meta variant(如需「Show more」類命令)

如果有 section 底部需要放「查看更多」這類非導覽命令,加 `variant: "default" | "meta"`:

```tsx
const myItemVariants = cva([...], {
  variants: {
    size: { ... },
    variant: {
      default: "",
      meta: [
        "font-normal text-fg-muted",
        "data-[active=true]:bg-transparent data-[active=true]:text-fg-muted",
      ],
    },
  },
  defaultVariants: { size: "md", variant: "default" },
})

// MyItem 內部:meta 永不參與 single-selection
const isActive = variant === "meta" ? false : (... 同上)
```

### Step 7 — Spec + stories

1. 寫 `{name}.spec.md`,**只**寫元件特有的設計決策(variant 何時用、語意)+ 反向引用 `item-layout.spec.md`(共用部分不重寫)
2. 寫 `{name}.stories.tsx`,demo single-selection、inlineActions、variant=meta(如有)、uniformPrefix(如有)
3. 寫 `{name}.anatomy.stories.tsx` 設計規格,用 token-first 標註
4. 寫 `{name}.principles.stories.tsx` do/don't 範例

---

## 自我檢查:這個系統夠 reusable 嗎?

新人(或新 AI session)能不能在不問問題的情況下做完一個新的 row primitive?測試方式:

- 看 `item-layout.tsx` 的 export → 找到 `ICON_SIZE` / `AVATAR_SIZE` / `ItemPrefix` / `ItemLabel` / `ItemIcon` / `ItemAvatar` / `ItemInlineAction` / `ItemInlineActionButton` / `ItemSuffix` / `RowSizeProvider` / `useRowSize` / `getUniformPrefixSlotStyle` / `INLINE_ACTION_HOVER_BG_SIZE` ✓
- 看本 spec 的 Recipe → 7 步 copy-paste ✓
- 看 `MenuItem` / `SidebarMenuButton` / `TreeItem` 三個現成 row primitive → canonical 實作參考 ✓
- 跨檔案 grep 規則 → CLAUDE.md「Row primitives 共用 item-layout 公式」節列出禁止事項 ✓

如果以上四條任何一條斷掉,就是 spec / code drift,該補。

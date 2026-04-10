# TreeView 設計原則

## 定位

TreeView 是**階層結構的遞迴元件**。一個 TreeItem 就是一個 node——有 children 就可展開,沒有就是 leaf。沒有第二個概念。

TreeView 本身只負責三件事:
1. **遞迴渲染** + indent
2. **展開/收合**狀態管理
3. **鍵盤導覽** + ARIA tree

它不管 node 裡面長什麼樣——icon、badge、status indicator、inline action 等視覺都由 consumer 透過 props / slots 決定。不同使用情境(sidebar nav、file browser、stepper)是同一個 TreeView 的不同消費方式,不是不同元件。

---

## 結構

```tsx
<TreeView>
  <TreeItem label="Documents" icon={Folder}>
    <TreeItem label="Resume.pdf" icon={FileText} />
    <TreeItem label="Photos" icon={Folder}>
      <TreeItem label="beach.jpg" icon={Image} />
    </TreeItem>
  </TreeItem>
  <TreeItem label="Settings" icon={Settings} />
</TreeView>
```

- `TreeView`:外層容器,`role="tree"`,管理 expand state + focused node + keyboard
- `TreeItem`:唯一的 node 元件,`role="treeitem"`。**有 children = expandable,沒有 = leaf**

---

## Node 解剖

每個 TreeItem 是一個 item-layout 行,加上 indent:

```
[indent] [chevron?] [icon?] [label] [suffix?]
   ↑         ↑         ↑       ↑        ↑
 depth    expand    visual   content   badge /
 ×step   indicator  assist            action
```

| Slot | 說明 | 存在條件 |
|---|---|---|
| **indent** | `paddingLeft = depth × indentStep` | depth > 0 |
| **chevron** | `ChevronRight`(收合)/ `ChevronDown`(展開) | 有 children |
| **chevron placeholder** | 等寬空白,確保同層 leaf label 對齊 | 沒 children 但同層有 expandable siblings |
| **icon** | `LucideIcon`,跟 label 同色(內容 icon,不是指示 icon) | 可選 |
| **label** | 主要文字 | 必有 |
| **suffix** | badge / 計數 / inline action(⋯ menu trigger) | 可選 |

### Chevron 的特殊性

Chevron 不是一般的 prefix icon——它是**展開/收合的控件**:

- 視覺:`fg-muted`(指示用途,不是內容),hover 時 `foreground`
- 位置:在 indent 之後、icon 之前(item-layout 的 prefix slot)
- 互動:點擊 chevron 只 toggle expand,不觸發 selection
- 動畫:`rotate-90`(收合 → 展開)transition

### 佔位規則(chevron + icon)

同層 node 之間,**有元素的 slot 必須在沒元素的 sibling 上留等寬空白**,否則 label 不對齊。

| Slot | 觸發佔位的條件 | 佔位寬度 |
|---|---|---|
| **Chevron** | 同層有任何 expandable sibling | `w-[chevronSize]`(16/16/20 @ sm/md/lg) |
| **Icon** | 同層有任何 sibling 帶 icon | `w-[iconSize]`(16/16/20 @ sm/md/lg) |

```
✓ 有佔位,label 對齊

▶ 📁 Documents       ← chevron + icon
  __ 📄 Resume.pdf   ← chevron 佔位 + icon ✓
  __ __ Settings      ← chevron 佔位 + icon 佔位 + label ✓
```

```
❌ 缺佔位,label 不對齊

▶ 📁 Documents
  📄 Resume.pdf      ← label 往左偏
  Settings            ← label 更往左偏
```

**判斷是自動的**:TreeView 在 render 時掃描同層 siblings,決定是否需要 chevron / icon placeholder。Consumer 不需要手動指定。

---

## Indent

### 公式

```
paddingLeft = depth × indentStep
```

- `depth`:root node = 0,每往下一層 +1
- `indentStep`:固定值,跟 chevron 寬度對齊

### indentStep 的值

`indentStep = chevronSize + gap-2`(prefix-content gap,跟 SelectMenuItem / SelectionItem 同一個 gap token)

| Size | chevronSize | gap | indentStep |
|---|---|---|---|
| sm | 16px | 8px(gap-2) | **24px** |
| md | 16px | 8px(gap-2) | **24px** |
| lg | 20px | 8px(gap-2) | **28px** |

### 為什麼用 gap-2 而非其他值

- **跟系統一致**:`gap-2`(8px)是 SelectMenuItem / SelectionItem 的 prefix-content gap,不引入孤立的間距值
- **有意義的結構對齊**:子 node 的元素恰好對齊父 node 的下一個 slot(見下圖)
- **空間可接受**:3 層深在 240px sidebar 裡佔 72px,label 仍有 ~120px(中文 6-8 字、英文 15-20 char),而大部分 sidebar nav 只有 1-2 層

### 對齊關係(indentStep = chevronSize + gap 的數學)

```
Depth 0: [chev 16] [gap 8] [icon 16] [gap 8] [label...]
         0        16      24        40       48

Depth 1: [──── indent 24 ────] [chev 16] [gap 8] [icon 16] [gap 8] [label...]
         0                     24        40      48        64       72
```

| 子 node 元素 | 位置 | 對齊到父 node 的... |
|---|---|---|
| 子 chevron | 24px | 父 **icon** 起始位置(24px) |
| 子 icon | 48px | 父 **label** 起始位置(48px) |

**每一層的元素「接手」上一層下一個 slot 的位置。** 不是隨意的數字,是 item-layout 結構的自然延伸。

---

## Node 高度

TreeItem 的單行高度 = `field-height`(跟 Button / Input / SelectMenuItem 對齊)。

```
py = calc((field-height - 1lh) / 2)
```

同一條 padding 公式,跟 SelectMenuItem / SelectionItem 一致。多行 label(罕見)padding 不變,自然撐高。

---

## 展開/收合

### 行為

| 觸發 | 行為 |
|---|---|
| 點擊整行(label / icon / 空白) | **觸發 selection**——所有 node 預設都可被點擊選中 |
| 點擊 chevron | Toggle expand/collapse,**不觸發 selection** |
| 鍵盤 `→`(在收合的 expandable node 上) | Expand |
| 鍵盤 `←`(在展開的 expandable node 上) | Collapse |
| 鍵盤 `←`(在 leaf 或收合的 node 上) | 移動焦點到 parent node |

### 點擊 label 是否也 expand?

**預設不 expand**——chevron 是展開/收合的唯一控件。點擊 label 只 select。

理由:**select 和 expand 是兩個獨立的語意**。Sidebar nav 裡「Documents」是一個可導覽的頁面,也有子頁面。點 label 要去 Documents 頁面;只有 chevron 才是「展開子頁面列表」。如果混在一起,使用者無法只 select 不 expand。

**Consumer 可覆寫**:`expandOnSelect` prop 讓點擊整行同時 select + expand——適合 stepper 情境(「進入這個步驟」本身就意味著展開子步驟)。

### 動畫

展開:children 用 Radix `Collapsible` 的 height animation(`0 → auto`)。
Chevron:`transition-transform duration-150 rotate-0 → rotate-90`。

---

## 選取

### 單選(預設,nav tree / stepper)

- 焦點跟選取分離:`focus` 是鍵盤導覽的「目前在哪」,`selected` 是「使用者選了哪個」
- 一次只有一個 selected node
- `aria-selected="true"` 在 selected node 上
- 視覺:selected node 用 `bg-neutral-selected`(跟 SelectMenuItem 單選一致)

### 多選(file browser)

- 用 checkbox 表達選取,不用背景色
- `Shift+Click` 範圍選取
- `Ctrl/Cmd+Click` 切換個別選取
- `aria-multiselectable="true"` 在 TreeView 上

### 無選取(純展開/收合)

某些情境 tree 只做結構展示(如 JSON viewer),不需要 selection。`selectionMode="none"`。

---

## 鍵盤導覽

| 按鍵 | 行為 |
|---|---|
| `↑` | 焦點移到上一個可見 node |
| `↓` | 焦點移到下一個可見 node |
| `→` | 展開(若收合);移到第一個 child(若已展開) |
| `←` | 收合(若展開);移到 parent(若已收合或是 leaf) |
| `Home` | 焦點移到第一個 node |
| `End` | 焦點移到最後一個可見 node |
| `Enter` / `Space` | 觸發 selection(跟點擊 label 同效果) |
| `*` | 展開同層所有 siblings |

遵循 [WAI-ARIA TreeView pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)。

---

## ARIA

| 元素 | Role | 屬性 |
|---|---|---|
| TreeView 容器 | `role="tree"` | `aria-label`,`aria-multiselectable`(多選時) |
| TreeItem 外層 | `role="treeitem"` | `aria-expanded`(expandable 才有),`aria-selected`,`aria-level`,`aria-setsize`,`aria-posinset` |
| TreeItem children 容器 | `role="group"` | — |

---

## 視覺狀態

| 狀態 | 背景 | 文字 | 觸發 |
|---|---|---|---|
| default | transparent | foreground | — |
| hover | `neutral-hover` | foreground | 滑鼠 hover |
| focused | `neutral-hover` + `ring-2`(或 outline) | foreground | 鍵盤焦點 |
| selected | `neutral-selected` | foreground | 單選模式 |
| disabled | transparent | `fg-disabled` | disabled prop |

hover 和 selected 的視覺跟 SelectMenuItem 一致——因為 tree item 和 menu item 本質上是同一類互動行(用 item-layout 結構)。

---

## Icon 一致性原則

**有用 icon 就全面用,否則考慮 tree guide。**

| 策略 | 適用 | 視覺效果 |
|---|---|---|
| **全 icon** | node 有明確的類型差異(folder/file、page type、step status) | icon 是層級的主要視覺指引,每個 node 一眼可辨識 |
| **全無 icon** | node 類型單一(全部是「頁面」或「步驟」),不需要類型區分 | 靠 indent + chevron 表達層級;深層考慮開 tree guide |
| ❌ **混用** | — | 有 icon 的 node 和沒 icon 的 node label 起始位置不同(即使有 placeholder 佔位,視覺仍不一致) |

混用時 placeholder 雖然保證 label 水平對齊,但「有圖 / 無圖」的視覺節奏仍然不一致。如果確實有些 node 沒有合適的 icon,寧可全部不用 icon + 開 tree guide,也不要混用。

---

## Tree Guides(indent 連線)

**預設關閉。** 大部分 tree 使用情境(sidebar nav + 全 icon)不需要。

當 tree **沒有 icon** 且 **深度 ≥ 3** 時,建議開啟 guide 補充視覺層級線索。Consumer 可透過 `showGuides` prop 開啟。

啟用時的規則:
- 線條顏色:`border-divider`
- 線條位置:每層 indent 左側邊緣畫垂直線
- 預留為未來功能,初版不實作

---

## 使用脈絡(Context)與水平 Padding

TreeItem 填滿容器寬度(hover / selected bg 全幅)。水平 padding 由 `context` prop 決定:

| Context | Item padding-x | 容器 padding-y | 適用場景 |
|---|---|---|---|
| `'sidebar'`(預設) | `--layout-space-loose`(md=16px / lg=24px) | 無(容器自行決定) | 頁面側邊欄 |
| `'menu'` | `12px`(對齊 SelectMenuItem) | `py-2`(8px,跟 DropdownMenu group 一致) | 浮層選單 / tree select dropdown |

### 為什麼 menu 有 py-2

跟 DropdownMenu / SelectMenu 的 group 一致——浮層選單的 item group 上下都有 8px padding(`py-2`),讓選項跟容器邊框之間有呼吸空間。TreeView 在 `context='menu'` 時自動加上,consumer 不需要手動設。

### 為什麼 sidebar 用 layout-space-loose

Sidebar 是頁面級容器,padding 應該跟其他頁面區塊的間距一致(都用 `--layout-space-loose`)。用硬寫的 px 值會在 density 切換時跟其他區塊脫節。

### 為什麼 menu 用 px-3

浮層選單的 padding 跟觸發器(Input / Select)的 px-3 對齊——選單打開時,第一個選項的 label 起始位置跟 Input 裡的文字對齊。這是 SelectMenuItem / DropdownMenu 的既有規則。

---

## Hover-only Inline Actions

TreeItem 右側的 `actions` slot **只在 hover 該列時出現**(opacity 0 → 1 transition)。

### 為什麼 hover-only

1. **視覺清潔**:10+ 個 node 每個都顯示 2-3 個 action icon = 20-30 個灰色小 icon 同時在螢幕上,噪音極大
2. **業界一致**:Notion / VS Code / Figma 的 tree actions 都是 hover 才出現
3. **不影響操作**:使用者要操作時自然會 hover 到目標列

### Hover action 必須一致(uniform)

**Hover 出現的 action 必須在同類型的 node 之間完全一致。** 如果不同 node 有不同的 action,使用者無法預期 hover 後會看到什麼——discovery 失敗。

正確做法:
- **⋯ (more menu)**:所有 node 統一有。menu 內容依 node 類型動態變化(rename / delete / duplicate 等由 consumer 決定)
- **一個 shortcut action**(如 ＋ add child):只有支援的 node type 有,但同 type 統一有(如所有 folder 都有 ＋)
- **最多 2 個 hover action**:⋯ 必有 + 最多一個 shortcut。超過 2 個 → 全部塞進 ⋯ menu

| 內容 | 放哪裡 | 出現時機 |
|---|---|---|
| ⋯ 更多選單 | `actions` | hover |
| ＋ 新增子項(同 type 統一) | `actions` | hover |
| 刪除 / 重新命名 / 複製 | ⋯ **menu 內** | 點擊 ⋯ 後 |
| 狀態 toggle(visibility/lock) | **永遠可見**(不放 actions) | 永遠 |

### 為什麼狀態 toggle 永遠可見

狀態 toggle(Figma 的 visibility eye、lock icon)顯示的是**當前 state**,不是 action。使用者需要隨時看到「這個 node 是 visible 還是 hidden」,不能 hover 才看到——那就失去了狀態指示的意義。

狀態 toggle 不放在 `actions` slot(hover-only),而是放在 label 右側或另一個永遠可見的 slot(如果未來需要,再新增 `status` slot)。

### Inline action 視覺

- Icon 尺寸:跟 TreeView size 的 icon tier 一致(16/16/20 @ sm/md/lg)
- 色彩:`fg-muted`,hover `foreground`
- Hover 背景:`neutral-hover`,rounded-sm
- 每個 action 之間:`gap-2`(8px,跟 Select 的 clear X ↔ ChevronDown 間距一致)
- 包在 `h-[1lh]` 容器裡,對齊 label 第一行

程式化:TreeItem 自動處理 `opacity-0 → group-hover:opacity-100` transition。Consumer 只需傳 `actions={<><Button .../><Button .../></>}`,不用自己管 hover 邏輯。

---

## Drag and Drop

TreeView 支援 Figma 風格的拖曳排序。`draggable` prop 啟用後,整列可拖(無 grip handle),靠 `PointerSensor` 的 `distance: 5` 區分 click 與 drag。

### 互動模型

| 功能 | 說明 |
|---|---|
| 拖曳觸發 | 整列拖曳(Figma 風格),無 grip handle。滑鼠按住移動 5px 後啟動 |
| X + Y 雙軸偵測 | Y 軸決定在哪個 item 附近(上 25% = before,中 50% = inside,下 25% = after);X 軸決定 nesting 深度(越左越淺層,越右越深層) |
| Drop position | 三種:`before`(同層上方)、`after`(同層下方)、`inside`(成為子 node) |
| Drop indicator | 藍色細線(`bg-primary`,before/after)+ `bg-primary-subtle` 背景(inside folder) |
| Ghost | 半透明複本(`opacity-90`)+ 浮動陰影,含 icon + label |

### 依賴

- `@dnd-kit/core`(`useDraggable` + `useDroppable` + `DragOverlay`)
- State management:consumer 透過 `onDragEnd` callback 接收 `{ sourceId, targetId, position }`,自行更新 data

### X 軸 nesting 邏輯

滑鼠 X 座標相對於 tree 容器左邊界,除以 `indentStep` 得到 indent level:

- 指標在 folder 深度或更淺 → `after`(同層插入)
- 指標比 folder 更深 → `inside`(放進 folder)
- Leaf node 的 `after`:若指標比 target 更淺,自動提升到 parent 的 `after`

### 視覺狀態

| 元素 | 狀態 |
|---|---|
| 被拖曳的 node(原位) | `opacity-30`(半透明殘影) |
| Drop indicator(before/after) | `h-0.5 bg-primary`,left 跟隨 indent |
| Drop target(inside) | `bg-primary-subtle` 全行背景 |
| DragOverlay ghost | 圓角容器 + icon + label,`opacity-90` + shadow |

---

## Checkbox(多選模式)

多選 tree(如 file browser、permission picker)在 label 前方加 checkbox:

```
[indent][chevron][icon?][checkbox][label][suffix?]
```

Checkbox 位於 icon 之後、label 之前。跟 SelectMenuItem 的多選 checkbox 位置對齊。

單選模式不需要 checkbox——用 `bg-neutral-selected` 背景色表達選中。

---

## 閱讀模式

TreeView 同時服務**掃描**和**閱讀**兩種情境:

| 情境 | Label typography | 理由 |
|---|---|---|
| **Sidebar nav** | `text-body leading-compact`(掃描模式) | 選單快速掃視,label 短 |
| **File browser** | `text-body leading-compact`(掃描模式) | 檔名快速掃視 |
| **Stepper** | `text-body`(閱讀模式) | Step 名稱需要閱讀理解 |
| **Page tree** | `text-body leading-compact`(掃描模式) | 頁面標題快速掃視 |

大部分 tree 使用情境是**掃描模式**(快速找到目標 node),所以 TreeView 預設用 `leading-compact`。Consumer 可透過 prop 切換。

---

## Consumer 擴展點

TreeItem 透過 props 提供 slots,讓不同 consumer 決定 node 的視覺:

| Prop | 型別 | 說明 |
|---|---|---|
| `icon` | `LucideIcon` | 左側 icon(chevron 之後) |
| `label` | `ReactNode` | 主要文字(必填) |
| `actions` | `ReactNode` | 右側 hover-only inline action(⋯ menu、+、delete 等) |
| `status` | `'default' \| 'active' \| 'completed' \| 'error'` | Stepper 用,控制 node 的狀態視覺 |
| `indicator` | `ReactNode` | 取代 **icon** 的位置(不是 chevron——chevron 永遠存在)。Stepper 用 status dot / checkmark |

### Sidebar nav tree

```tsx
<TreeView selectionMode="single">
  <TreeItem icon={LayoutDashboard} label="Dashboard" />
  <TreeItem icon={Users} label="Team" badge={3}>
    <TreeItem label="Members" />
    <TreeItem label="Roles" />
  </TreeItem>
</TreeView>
```

### File browser

```tsx
<TreeView selectionMode="multiple" showGuides>
  <TreeItem icon={Folder} label="src">
    <TreeItem icon={FileCode} label="App.tsx" />
    <TreeItem icon={FileCode} label="index.ts" />
  </TreeItem>
</TreeView>
```

### Stepper

```tsx
<TreeView selectionMode="single" expandOnSelect>
  <TreeItem indicator={<CheckCircle />} label="個人資料" status="completed">
    <TreeItem indicator={<CheckCircle />} label="姓名" status="completed" />
    <TreeItem indicator={<CheckCircle />} label="地址" status="completed" />
  </TreeItem>
  <TreeItem indicator={<Circle />} label="付款方式" status="active">
    <TreeItem indicator={<Circle />} label="信用卡" status="active" />
    <TreeItem indicator={<Circle />} label="帳單地址" />
  </TreeItem>
</TreeView>
```

---

## 禁止事項

- ❌ 不得在 TreeItem 內嵌套非 TreeItem 的 children——children slot 只接受 TreeItem(遞迴結構)
- ❌ 不得把展開/收合和選取的語意混在一起——chevron 負責 expand,label 負責 select,兩者獨立(除非 consumer 顯式 opt-in `expandOnSelect`)
- ❌ 不得用 Accordion 取代 TreeView——Accordion 是「同時只開一個」的互斥模式,tree 是「任意多個都可以開」
- ❌ 不得省略 chevron / icon placeholder——同層 siblings 有元素差異時必須佔位,否則 label 不對齊(佔位由 TreeView 自動處理,consumer 不需介入)
- ❌ 不得用非 gap-2(8px)的值作為 indent 內部 gap——indentStep 必須等於 `chevronSize + gap-2`,跟 item-layout 的 prefix-content gap 一致

---
component: TreeView
family: 1
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isStructural
benchmark:
  - Carbon TreeView: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/TreeView
  - MUI X TreeView: github.com/mui/mui-x/tree/master/packages/x-tree-view
  - Ant Design Tree: github.com/ant-design/ant-design/tree/master/components/tree
---

# TreeView 設計原則

> **Foundational SSOT rationale**(2026-04-24 approved,cap 800):
> TreeView 有獨立 `treeItemVariants` cva + Tree-specific features SSOT(Indent 層級 / Tree Guides 連線 / 展開收合 chevron / 鍵盤導覽 arrow 展開 / 多選 checkbox / Drag-drop / Hover-only inline actions / Node 解剖 / Consumer 擴展點)。這些是 tree hierarchy 本質特徵,跟 MenuItem 的 flat list 語義本質不同,無法直接繼承。Long-term refactor 可行範圍只有 **visual base**(padding / typography / height 共用 menuItemVariants),tree-specific behavior 仍需獨立 SSOT。見 `.claude/planning/row-primitive-consolidation.md` Phase 0 評估。

## 定位

TreeView 是**階層結構的遞迴元件**。一個 TreeItem 就是一個 node——有 children 就可展開,沒有就是 leaf。沒有第二個概念。

**實作基礎**：基於 Radix Collapsible 實作展開 / 收合，自建 tree 結構與 ARIA tree 鍵盤導覽（Radix 沒有 Tree primitive）。

**Layout Family**：CLAUDE.md 4-Family Model **Family 1（Menu item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「Menu item layout」章節的 scanning-mode 規格。

TreeView 本身只負責三件事:
1. **遞迴渲染** + indent
2. **展開/收合**狀態管理
3. **鍵盤導覽** + ARIA tree

它不管 node 裡面長什麼樣——icon、badge、status indicator、inline action 等視覺都由 consumer 透過 props / slots 決定。不同使用情境(sidebar nav、file browser、stepper)是同一個 TreeView 的不同消費方式,不是不同元件。

---

## 何時用

- **階層結構資料**：檔案管理器資料夾樹、部門組織架構、專案 / 子專案 / 任務、權限群組
- **Sidebar 內的分層導覽**：workspace > channel > thread、product > category > item
- **可展開收合的清單**：FAQ（但多個可同時展開,非 Accordion 互斥）、程式碼 tree、JSON viewer
- **任意多層**：從 1 層到 N 層深度都由同一個 TreeView 承載

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 平面資料（無階層）| `DataTable` / 自訂 list | TreeView 為階層而設計，沒 children 的平面用 list |
| 同時只能展開一個（互斥）| `Accordion type="single"` | TreeView 允許任意多個展開,互斥模式語意不同 |
| 簡單 2 層 nav（主分類 + 子分類）| `Sidebar` + SidebarMenuSubButton | 輕量 2 層用 Sidebar 的內建結構,不需遞迴 |
| 選單式展開（點完就關）| `DropdownMenu` + sub-menu | DropdownMenu 的 sub menu 是 temporary,TreeView 是 persistent |
| 階層選擇但需要搜尋 / 快速找 | 自訂 tree + search filter（未來 TreeView 可加 search prop）| 基本 TreeView 不含 search |

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

每個 TreeItem 是 item-layout 行 + indent:`[indent] [chevron?] [icon?] [label] [suffix?]`。

| Slot | 說明 | 存在條件 |
|---|---|---|
| **indent** | `paddingLeft = depth × indentStep` | depth > 0 |
| **chevron** | `ChevronRight`(展開時 `rotate-90` transition,見「動畫」)| 有 children |
| **chevron placeholder** | 等寬空白,確保同層 leaf label 對齊 | 沒 children(每個 leaf 無條件留等寬空白,不檢查 siblings)|
| **icon** | `LucideIcon`,跟 label 同色(內容 icon) | 可選 |
| **label** | 主要文字 | 必有 |
| **suffix** | badge / 計數 / inline action(⋯ menu trigger) | 可選 |

### Chevron 的特殊性

Chevron 是**展開/收合控件**,不是 prefix icon:`fg-muted`(指示色,hover 時 foreground)/ 位置在 indent 之後 icon 之前 / 點擊只 toggle expand 不觸發 selection / `rotate-90` transition。

### 佔位規則(chevron + icon)

同層 node 間,label 需對齊。**Chevron 佔位**:每個無 children 的 leaf **無條件**渲染等寬 chevron placeholder(寬 16/16/20 @ sm/md/lg),不檢查 siblings——故有/無 expandable sibling 結果都對齊。**Icon 佔位**:icon slot 只在該 node 傳 `icon` prop 時渲染 `<ItemIcon>`,**無自動等寬 placeholder**(無 icon 的 leaf 不補空位);若要 icon 欄整齊,consumer 自行確保同層都傳 icon。

---

## Indent

**公式**:`paddingLeft = depth × indentStep`(depth: root=0,往下 +1)。
**indentStep = chevronSize + gap-2**(prefix-content gap,共用 MenuItem / SelectionItem token):sm/md = 16+8 = **24px**,lg = 20+8 = **28px**。

**為什麼 gap-2**:(a) 系統一致(MenuItem / SelectionItem 同 token,無孤立值);(b) 結構對齊——子 chevron(24px)= 父 icon 起始;子 icon(48px)= 父 label 起始;每層元素「接手」上層下一個 slot 位置,是 item-layout 結構的自然延伸,不是隨意數字;(c) 空間 ok(3 層在 240px sidebar 佔 72px,label 仍 ~120px,且多數 sidebar nav 只 1-2 層)。

---

## Node 高度

單行高度 = `field-height`(對齊 Button / Input / MenuItem),`py = calc((field-height - 1lh) / 2)` — 與 MenuItem / SelectionItem 同公式。多行 label 罕見,padding 不變自然撐高。

---

## 展開/收合

**行為**:點整行(label / icon / 空白)→ select(預設所有 node 可選);點 chevron → toggle expand,不 select;鍵盤 `→`(收合 expandable)→ expand;`←`(展開 expandable)→ collapse;`←`(leaf / 收合 node)→ 焦點到 parent。

**預設 label 不 expand**——chevron 是展開唯一控件。理由:select / expand 語意獨立(sidebar「Documents」點 label 進頁面,點 chevron 才展開子列表)。Consumer `expandOnSelect` prop 可讓整行同時 select + expand(適合 stepper)。

**動畫**:children 用 Radix `Collapsible` height animation(0 → auto);chevron `transition-transform duration-150 rotate-0 → rotate-90`。

---

## 選取

### 單選(預設,nav tree / stepper)

- 焦點跟選取分離:`focus` 是鍵盤導覽的「目前在哪」,`selected` 是「使用者選了哪個」
- 一次只有一個 selected node
- `aria-selected="true"` 在 selected node 上
- 視覺:selected node 用 `neutral-selected` state(跟 MenuItem 單選一致;完整 token 見 anatomy `ColorMatrix`)

### 多選(file browser / permission picker)

- **視覺 SSOT(2026-05-26 user explicit lock)**:對齊 `SelectMenu` multi pattern,checkbox 為**唯一** visual signal —
  - **Auto-render `<Checkbox>`**:`selectionMode="multiple"` 時 TreeItem 內建 render checkbox(reflect `selectedIds`),consumer **無需手動傳** `checkbox` prop
  - **Row 不套 `bg-neutral-selected`**(該 token 保留給 single mode 補無 checkbox 的視覺信號)
  - **Text 也不變 `text-foreground`**(已有 checkbox 強信號,text 變色會雙重 noise)→ 維持 `text-fg-secondary` muted
  - 對齊 cite:`menu-item.tsx:194-195`(MenuItem selected → bg only)+ `select-menu.tsx` option render `checkbox={multiple}` / `selected={!multiple && …}`(SelectMenu multi → checkbox only)
- API:`selectionMode="multiple"` 自動 render checkbox;consumer 傳 `checkbox={<Checkbox/>}` 可 override(parent-child cascade 等 advanced 場景)
- 多選互動:點擊逐項 toggle(`handleRowClick` → `select(id)`;**不支援** `Shift+Click` 範圍選取 / `Ctrl/Cmd+Click` 修飾鍵切換——`handleRowClick` 不讀 `shiftKey/metaKey/ctrlKey`)/ `aria-multiselectable="true"` 在 TreeView 上

### 視覺信號 SSOT 對照表(single vs multi)

| Mode | Default text | Selected text | Selected bg | Checkbox |
|---|---|---|---|---|
| `single` | `text-fg-secondary`(muted)| `text-foreground` ✅ | `bg-neutral-selected` ✅ | N/A |
| `multiple` | `text-fg-secondary`(muted)| 不變(維持 muted)| 不變 | auto `<Checkbox checked={isSelected} />` ✅ |

設計理由:single 沒 checkbox → text+bg 雙信號補;multi 有 checkbox 強信號 → text+bg 不再變化避 noise。

歷史錨例(2026-05-26):本 session 多次 revert + 對齊。User 明確「multi 已有 checkbox,text 不該再變色」→ 鎖 multi mode `text-foreground` apply 改 `selectionMode === 'single'` only。對齊 SelectMenu pattern,無偏移。

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

遵循 [WAI-ARIA TreeView pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)。

---

## ARIA

| 元素 | Role | 屬性 |
|---|---|---|
| TreeView 容器 | `role="tree"` | `aria-label`,`aria-multiselectable`(多選時) |
| TreeItem 外層 | `role="treeitem"` | `aria-expanded`(expandable 才有),`aria-selected`,`aria-level` |
| TreeItem children 容器 | `role="group"` | — |

---

## 視覺狀態

TreeItem row 有 5 種狀態:default / hover / focused(鍵盤) / selected / disabled。**hover 和 selected 的視覺跟 MenuItem 一致**——因為 tree item 和 menu item 本質上是同一類互動行(用 item-layout 結構),共用 `neutral-hover` / `neutral-selected` state token。

完整 state × token 對照見 anatomy `ColorMatrix` story(Row 四態色彩 Token)。

---

## Icon 一致性原則

**有用 icon 就全面用,否則考慮 tree guide。**

| 策略 | 適用 | 視覺效果 |
|---|---|---|
| **全 icon** | node 有明確的類型差異(folder/file、page type、step status) | icon 是層級的主要視覺指引,每個 node 一眼可辨識 |
| **全無 icon** | node 類型單一(全部是「頁面」或「步驟」),不需要類型區分 | 靠 indent + chevron 表達層級;深層考慮開 tree guide |
| ❌ **混用** | — | icon 無自動佔位(見「佔位規則」),有 icon / 無 icon 的 node label 起始位置直接錯開 |

Chevron placeholder 只保證 chevron 欄對齊;icon 無自動佔位,混用時「有圖 / 無圖」的 label 起點與視覺節奏都不一致。如果確實有些 node 沒有合適的 icon,寧可全部不用 icon + 開 tree guide,也不要混用。

---

## Tree Guides(indent 連線)

**預設關閉。** 大部分 tree 使用情境(sidebar nav + 全 icon)不需要。

當 tree **沒有 icon** 且 **深度 ≥ 3** 時,建議開啟 guide 補充視覺層級線索。未來將提供 `showGuides` prop(初版不實作,目前無此 prop)。

啟用時的規則:
- 線條顏色:`border-divider`
- 線條位置:每層 indent 左側邊緣畫垂直線
- 預留為未來功能,初版不實作

---

## 使用脈絡(Context)與水平 Padding

TreeItem 填滿容器寬度(hover / selected bg 全幅)。水平 padding 由 `context` prop 決定:

| Context | Item padding-x | 適用場景 |
|---|---|---|
| `'sidebar'`(預設) | `--layout-space-loose`(md=16px / lg=24px) | 頁面側邊欄 |
| `'menu'` | `12px`(對齊 MenuItem) | 浮層選單 / tree select dropdown |

**垂直 padding 的歸屬**——TreeView root 不加任何 py,呼吸空間由**外層容器負責**(SidebarGroup / DropdownMenuContent / story wrapper 自己加 `py-2`)。詳見 `item-anatomy.spec.md` 的「垂直 padding 歸屬」一節,這是 row primitive 的共同規則不是 TreeView 專屬。

### 為什麼 sidebar 用 layout-space-loose

Sidebar 是頁面級容器,padding 應該跟其他頁面區塊的間距一致(都用 `--layout-space-loose`)。用硬寫的 px 值會在 density 切換時跟其他區塊脫節。

### Sidebar icon 模式下 TreeView 的行為

當 TreeView 住在 `context="sidebar"` 且外層 Sidebar 處於 `collapsible="icon"` 的收合狀態時,**整個 TreeView 區塊必須隱藏**(而非嘗試 icon 化、flyout、popover)。

**為什麼**:tree 是任意深度的遞迴結構,沒有任何方式可以壓縮成單排 icon。Gmail / Linear / Notion 一致採取「隱藏」——使用者要看 tree 必須先展開 sidebar。詳見 `sidebar.spec.md` 的 icon 模式規則。

實作上由 Sidebar 元件透過 CSS `group-data-[collapsible=icon]:hidden` 自動隱藏,TreeView 本身不需特殊處理。

### 為什麼 menu 用 px-3

浮層選單的 padding 跟觸發器(Input / Select)的 px-3 對齊——選單打開時,第一個選項的 label 起始位置跟 Input 裡的文字對齊。這是 MenuItem / DropdownMenu 的既有規則。

---

## Hover-only Inline Actions

TreeItem 右側 `actions` slot 只在 hover 該列時出現(opacity 0→1 transition)。**為什麼**:(a) 視覺清潔(10+ node × 2-3 icon = 20-30 灰 icon 同屏噪音極大);(b) 業界一致(Notion / VS Code / Figma 都 hover-only);(c) 不影響操作(要操作自然會 hover)。

**Uniform 規則**:同類型 node 的 hover action 必須完全一致,否則 discovery 失敗。
- **⋯ (more menu)**:所有 node 統一有,menu 內容由 consumer 依 node type 動態(rename / delete / duplicate)
- **1 個 shortcut**(如 ＋ add child):只支援的 type 有,但同 type 統一(所有 folder 都有 ＋)
- **最多 2 個 hover action**(⋯ 必有 + 最多 1 shortcut),超過 → 全塞 ⋯ menu
- **狀態 toggle**(visibility eye / lock):永遠可見(顯示當前 state 不是 action;hover 才看到失去意義),不放 `actions` slot

### Inline action 視覺 + API

Icon 尺寸跟 size tier(sm/md=16, lg=20);色 `fg-muted` → hover `foreground`;hover bg `neutral-hover`;action 間距 / 高度對齊規則見 `item-anatomy.spec.md`「Inline Action 設計規格」(canonical SSOT)。

**宣告式 API**(對齊 `inline-action.spec.md` + `SidebarMenuButton.inlineActions`):`inlineActions: InlineActionConfig[]` + `actionsReveal: false | "hover"`(預設 `"hover"`,鍵盤 focus-visible 也顯)。內部用 `<ItemInlineAction>` helper 渲染,consumer **不可手刻 button JSX**(canonical 在 `item-anatomy.tsx`,共用 size 查表 / Tooltip / hover bg / aria)。Hover-reveal 用 `group-has-[:focus-visible]/tree-item:opacity-100` 而非 `group-focus-within`(後者 mouse click 會永久顯示)。

---

## Drag and Drop

`draggable` prop 啟用後 Figma 風格整列拖(無 grip handle),`PointerSensor distance: 5` 區分 click / drag。

**互動模型**:
- **X+Y 雙軸偵測**:Y 軸定位置(上 25% = before / 中 50% = inside / 下 25% = after);X 軸定 nesting 深度(滑鼠 X 相對 tree 左邊界 / `indentStep` = level)
- **Drop position 三種**:`before` / `after`(同層上下)、`inside`(成為子 node)
- **X 軸邏輯**:指標 ≤ folder 深度 → `after`;> folder 深度 → `inside`;leaf `after` 若指標較淺自動升到 parent 的 `after`
- **Auto-expand**:拖曳停留收合 folder 500ms → 自動展開(Figma 行為);離開或結束取消計時
- **依賴**:`@dnd-kit/core`(`useDraggable` + `useDroppable` + `DragOverlay`);state 由 consumer `onDragEnd({sourceId, targetId, position})` callback 自行更新

**視覺**(2026-05-06 v14.5 SSOT 抽 `lib/drag-visual.ts`):被拖 node 原位 `opacity-disabled`(45%)半透明殘影 / before-after drop indicator 為 2px primary 細線(`bg-primary` `h-0.5`,left 跟 indent 深度)/ inside drop target `bg-primary-subtle` 全行背景 / DragOverlay ghost 圓角 + icon + label + **不透明 `bg-surface`** + elevation shadow(跟 surface 拉開的視覺距離靠 shadow 不靠 opacity;半透明只用在上述原位殘影)。**TreeView 是 DS 內最早 codified 的 drag canonical**,DataTable row drag + column reorder 都 inherit 此 pattern via `drag-visual.ts` SSOT module。視覺校驗見 story `DragAndDrop`。

---

## Checkbox(多選模式)

多選 tree(如 file browser、permission picker)在 label 前方加 checkbox:

```
[indent][chevron][icon?][checkbox][label][suffix?]
```

Checkbox 位於 icon 之後、label 之前。跟 MenuItem 的多選 checkbox 位置對齊。

單選模式不需要 checkbox——用 `bg-neutral-selected` 背景色表達選中。

---

## Label typography(掃描模式)

Tree 本質是**掃描導覽**(快速找到目標 node),所以 TreeView label 一律走**掃描模式**——row typography 由 row primitive 的 `ROW_PADDING_BY_SIZE` SSOT 鎖定:sm/md = `text-body leading-compact`、lg = `text-body-lg leading-compact`。

| 情境 | Label typography | 理由 |
|---|---|---|
| **Sidebar nav** | `text-body leading-compact` | 選單快速掃視,label 短 |
| **File browser** | `text-body leading-compact` | 檔名快速掃視 |
| **Stepper** | `text-body leading-compact` | 跟其餘 node 一致,同走 row primitive |
| **Page tree** | `text-body leading-compact` | 頁面標題快速掃視 |

TreeView 目前**沒有**閱讀 / 掃描模式的切換 prop——所有 node 統一 `leading-compact`(對齊 `ROW_PADDING_BY_SIZE` 既定 SSOT,跨 row 元件視覺一致)。

---

## Consumer 擴展點

TreeItem props slots(consumer 決定 node 視覺):

| Prop | 型別 | 說明 |
|---|---|---|
| `icon` | `LucideIcon` | 左側 icon(chevron 之後) |
| `label` | `ReactNode` | 主要文字(必填) |
| `inlineActions` | `InlineActionConfig[]` | 右側 inline actions,詳見 `item-anatomy.spec.md` |
| `actionsReveal` | `false \| "hover"` | 預設 `"hover"`,`false` 常駐 |
| `indicator` | `ReactNode` | 取代 **icon** 位置(chevron 永存)。Stepper 狀態視覺由此傳 `<StepDone/>` / `<StepActive/>` / `<StepPending/>`(非 `status` prop——TreeItemProps 無 `status` 欄位)|

**情境消費範例**(Sidebar nav / File browser / Stepper)由 stories.tsx 承載,不在本 spec 重複貼 code。

**Drag preview 寬度**:`truncate max-w-[200px]` — 拖長檔名時防 preview 遮 drop target。200px 為 TreeView 專用 layout 常數(非跨元件 token);跟 Tag 的 max-w-40 相關但不同,tree label 通常比 tag 長需稍寬。

---

## 禁止事項

- ❌ 不得在 TreeItem 內嵌套非 TreeItem 的 children——children slot 只接受 TreeItem(遞迴結構)
- ❌ 不得把展開/收合和選取的語意混在一起——chevron 負責 expand,label 負責 select,兩者獨立(除非 consumer 顯式 opt-in `expandOnSelect`)
- ❌ 不得用 Accordion 取代 TreeView——Accordion 是平面 section 折疊(`type="single"` 互斥 / `type="multiple"` 多開,見 accordion.spec.md),tree 是階層 node 結構
- ❌ 不得省略 chevron placeholder——leaf 無條件佔位,由 TreeView 自動處理,consumer 不需介入;icon 無自動佔位,同層要嘛全傳 icon 要嘛全不傳(見「佔位規則」)
- ❌ 不得用非 gap-2(8px)的值作為 indent 內部 gap——indentStep 必須等於 `chevronSize + gap-2`,跟 item-layout 的 prefix-content gap 一致

---

## Anatomy story 涵蓋

TreeView 是**階層樹元件**,關鍵決策維度是 selection × expanded × indent × size × context(sidebar / panel / dialog)。`Inspector` 提供互動式 Controls(size / context / selectionMode / expandOnSelect)即時切換,搭配 `SizeMatrix` / `ColorMatrix` / 元件特有 `IndentMatrix`(縮排規則) / `StateBehavior`(selected vs expanded 語意分離) / `KeyboardMatrix` / `Accessibility` 完整覆蓋。

TreeView 真實展示需要**多層巢狀結構**才有意義(單節點無法體現樹形設計),故 `Inspector` 以真實的 Engineering 團隊檔案樹為 render 對象;`IndentMatrix`(縮排與 guide line 規則)、`StateBehavior`(selected + expanded 正交語意)這類需要完整樹形視覺才能傳達的設計則另以靜態矩陣呈現。

對應 anatomy story:`Overview` + `Inspector` + `SizeMatrix` + `ColorMatrix` + 元件特有 `IndentMatrix` + `StateBehavior` + `KeyboardMatrix` + `Accessibility`。

---

## 邊界狀態

- **Empty(無 items)**:TreeView 不自帶 empty state UI,由 consumer 在 items 為空時顯示 `<Empty>`(file browser 常見:「此資料夾是空的」+ 上傳 CTA)
- **Loading 整棵樹**:若資料異步載入,consumer 在 data 未到時顯示 `<CircularProgress>` 或 `<Skeleton>`,不在 TreeView 內建 loading
- **單一 leaf node**:結構上合法(不一定要多層),視覺跟多層無差別
- **Dark mode**:由 semantic token 自動切換,詳見 `../../tokens/color/color.spec.md`

---

## 相關

- `../Sidebar/sidebar.spec.md` — 常見的 TreeView 消費者（導覽場景）
- `../DataTable/data-table.spec.md` — 平面資料的對應元件
- `../DropdownMenu/dropdown-menu.spec.md` — 彈出式 sub-menu（TreeView 是 persistent）
- `../Empty/empty.spec.md` — no-data state 的 canonical placeholder
- `../../patterns/element-anatomy/item-anatomy.spec.md` — TreeItem 內部佈局共用規則

## A11y 預設

**ARIA / Pattern**:自建 ARIA tree(非沿用 Radix 預設)。容器 `role="tree"`(多選時加 `aria-multiselectable`),每個 node `role="treeitem"` + `aria-expanded`(expandable 才有)/ `aria-selected` / `aria-level`,皆由元件手動設定(`tree-view.tsx` L901-905)。Radix `collapsible` 僅用於 children 展開 / 收合的高度動畫,**不提供** tree 的 role / aria / 鍵盤導覽(Radix 沒有 Tree primitive,見「定位」段)。對齊 [WAI-ARIA TreeView pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)。`aria-setsize` / `aria-posinset` **刻意省略**:APG 規定只有當節點未全數 render 進 DOM(lazy load)或 DOM 序 ≠ 閱讀序時才必需;本元件全可見節點皆在 DOM(`querySelectorAll('[role="treeitem"]:not([hidden])')`)且 DOM 序 = 閱讀序,故非必需。

**Keyboard 行為**(自建 handler,`tree-view.tsx` L516-585):

- Tab — 焦點進入整棵 tree(單一 tab stop)
- ↑/↓ — 在可見 node 之間移動
- → — 展開 node,已展開則移到第一個 child
- ← — 收合 node,leaf 則跳回 parent
- Home / End — 跳到第一個 / 最後一個可見 node
- Enter / Space — 選取目前 node

**Focus**:焦點由元件自管(`aria-activedescendant` virtual focus,非 roving tabindex)——DOM focus 固定停在 tree 容器(單一 tab stop,root `tabIndex={0}`),鍵盤移動時 `aria-activedescendant` 指向目前 node,並用內描邊高亮標示(`ring-2 ring-ring ring-inset`,非 `outline`)。**無** focus trap、**無** focus restoration(tree 不是浮層,不需要)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `accordion.spec.md`
- `combobox.spec.md`
- `data-table.spec.md`
- `sidebar.spec.md`

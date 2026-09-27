---
component: TreeView
family: 1
variants: {}
sizes:
  sm: { when: "緊湊清單(與 md 同視覺,保留供密度語意)" }
  md: { when: "default 一般導覽樹" }   # ★ default
  lg: { when: "touch / 大字級" }
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

**實作基礎**：基於 Radix Collapsible（[`packages/react/collapsible`](https://github.com/radix-ui/primitives/tree/f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae/packages/react/collapsible)）實作展開 / 收合，自建樹狀結構與 ARIA **樹狀表格（`treegrid`）**鍵盤導覽（Radix 沒有 Tree / Treegrid primitive）。2026-09-25 由 `tree` 改為 `treegrid`,決定與理由見「鍵盤導覽」。

**Layout Family**：本元件是 `patterns/element-anatomy/item-anatomy.spec.md` 所擁有的 **Family 1（Menu item layout）** 消費者。結構繼承其「Menu item layout」章節的 scanning-mode 規格。

TreeView 本身只負責三件事:
1. **遞迴渲染** + indent
2. **展開/收合**狀態管理
3. **鍵盤導覽** + ARIA 樹狀表格(`treegrid`)

它不管 node 裡面長什麼樣——icon、badge、status indicator、inline action 等視覺都由 consumer 透過 props / slots 決定。不同使用情境(sidebar nav、file browser、stepper)是同一個 TreeView 的不同消費方式,不是不同元件。

---

## 何時用

- **階層結構資料**：檔案管理器資料夾樹、部門組織架構、專案 / 子專案 / 任務、權限群組
- **Sidebar 內的分層導覽**：workspace > channel > thread、product > category > item
- **可展開收合的階層清單**：程式碼檔案樹、JSON viewer、DOM inspector（遞迴巢狀結構;平面章節如 FAQ / 設定分組屬 Accordion,見「何時不用」）
- **任意多層**：從 1 層到 N 層深度都由同一個 TreeView 承載

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 平面資料（無階層）| `DataTable` / 自訂 list | TreeView 為階層而設計，沒 children 的平面用 list |
| 平面章節折疊（FAQ / 設定分組,無階層）| `Accordion`（`type="single"` 互斥 / `type="multiple"` 多開）| TreeView 是遞迴階層 node;平面章節不論單開或多開都屬 Accordion 範疇（accordion.spec.md「何時用」列 FAQ 為主要用途）|
| 純視覺分段 / 設計時可列舉的 1 層固定選單 | `SidebarGroup` / `SidebarMenu` | Sidebar 主選單只接受 1 層可列舉項目;任何真階層（深度 > 1、runtime 可新增、user data）一律 TreeView（見 sidebar.spec.md「判斷規則」）|
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

- `TreeView`:外層容器,`role="treegrid"`,管理 expand state + 唯一的 Tab 停靠點 + keyboard
- `TreeItem`:唯一的 node 元件。**有 children = expandable,沒有 = leaf**。DOM 是「無角色的 node 容器 → 一列 `role="row"`(主格 `gridcell` + 有按鈕時的動作格 `gridcell`)→ 子項容器」:樹狀表格的列只能擁有格、不能包住子列,所以層級 / 展開 / 選取屬性都在 `row` 上(見「ARIA」)

---

## Node 解剖

每個 TreeItem 是 item-layout 行 + indent:`[indent] [chevron?] [icon?] [label] [suffix?]`。

| Slot | 說明 | 存在條件 |
|---|---|---|
| **indent** | `paddingLeft = depth × indentStep` | depth > 0 |
| **chevron** | 共用行內小按鈕 `ItemInlineActionButton` + `ChevronRight`(展開時 `rotate-90` transition,見「動畫」)| 有 children |
| **chevron placeholder** | 等寬空白,確保同層 leaf label 對齊 | 沒 children(每個 leaf 無條件留等寬空白,不檢查 siblings)|
| **icon** | `LucideIcon`,跟 label 同色(內容 icon) | 可選 |
| **label** | 主要文字 | 必有 |
| **suffix** | badge / 計數 / inline action(⋯ menu trigger) | 可選 |

### Chevron 的特殊性

Chevron 是**展開/收合控件**,不是 prefix icon:`fg-muted`(指示色,hover 時 `fg-secondary`,只前進一階)/ 位置在 indent 之後 icon 之前 / 點擊只 toggle expand 不觸發 selection / `rotate-90` transition。

**消費共用行內小按鈕**(2026-09-26,待辦總帳 L5,user:「是改成inline action對吧？」):箭頭本身就是 `ItemInlineActionButton`(`../../patterns/element-anatomy/item-anatomy.tsx`),尺寸照 `../../patterns/element-anatomy/inline-action.spec.md`「尺寸對照」TreeItem 列 —— 圖示與排版佔位 16(lg 20)、**滑過底色 18(lg 22)= 點得到的範圍**(`../../../ds-canonical/references/hit-area-canonical.md`)、按下多一階 `neutral-active`。與 DataTable 巢狀列的展開箭頭同一顆(`../DataTable/data-table.tsx` nestedPrefix)。縮排不變:箭頭仍住 `ItemPrefix` 鎖寬的槽,多出的 1px 靠溢出不吃版位。2026-09-26 之前這裡手刻一顆 16×16 的按鈕,滑過底色與點擊範圍都只有 16、也沒有按下態。箭頭 `tabIndex=-1`、對讀屏隱藏(展開 / 收合的鍵盤與語意在列上:`→` / `←` 與 `aria-expanded`)。

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

**行為**:點整行(label / icon / 空白)→ select(預設所有 node 可選);點 chevron → toggle expand,不 select;鍵盤 `→`(收合 expandable)→ expand;`←`(展開 expandable)→ collapse;`←`(leaf / 收合 node)→ 焦點到 parent。(點列上的按鈕目前**也會**選取該列 —— 既有行為,本次未改,焦點則留在按鈕上。)

**預設 label 不 expand**——chevron 是展開唯一控件。理由:select / expand 語意獨立(sidebar「Documents」點 label 進頁面,點 chevron 才展開子列表)。Consumer `expandOnSelect` prop 可讓整行同時 select + expand(適合 stepper)——**此連帶展開僅限指標點擊(`handleRowClick`)**;鍵盤 `Enter` / `Space` 只觸發 select,展開 / 收合一律走 `→` / `←`(W3C 樹狀表格同樣是「方向鍵展開收合、`Enter` 執行預設動作」,[treegrid-pattern.html#L60-L80](https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/treegrid/treegrid-pattern.html#L60-L80))。

**動畫**:children 用 Radix `Collapsible` height animation(0 → auto);chevron 圖示(2026-09-26 起掛在 `ItemInlineActionButton` 的 `iconClassName`)`transition-transform duration-150 rotate-0 → rotate-90` —— 展開 / 收合是狀態切換的動畫,不是滑過回饋,保留(2026-09-10:原本是 `transition-all`,連 hover 底色一起過渡;hover 底色改成瞬間後只留旋轉,owner = `tokens/motion/motion.spec.md`「hover 回饋不做過渡」)。

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

**整棵樹在 Tab 路上只佔一站**:列上 roving tabindex —— 停靠點那一列 `tabIndex=0`,其餘列、所有列上的按鈕、展開箭頭、勾選框都是 `-1`。Tab 進來落在:上次焦點停的那一列 → 選中的列 → 第一個可用列(W3C 對樹狀表格「回到上次停的那一個」與對樹「落在選中項,沒有就第一項」兩條合在一起,[keyboard-interface-practice.html#L270-L284](https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/practices/keyboard-interface/keyboard-interface-practice.html#L270-L284))。

焦點在**列**上:

| 按鍵 | 行為 |
|---|---|
| `↑` / `↓` | 上 / 下一個可見、未停用的列 |
| `Home` / `End` | 第一個 / 最後一個可見列 |
| `→` | 收著的資料夾 → 展開(焦點不動);已展開的資料夾或葉節點 → 進**這一列**的第一顆按鈕;沒有按鈕 → 不動 |
| `←` | 展開的資料夾 → 收合;收著的資料夾或葉節點 → 回上一層;最外層 → 不動 |
| `Enter` / `Space` | 選取(等同點擊 label;`expandOnSelect` 的連帶展開僅限指標點擊) |
| `Tab` / `Shift+Tab` | **一下就離開整棵樹**(別列、本列的按鈕都不在 Tab 路上) |
| `Cmd/Ctrl+Shift+↑` / `↓` | 重排:同層上移 / 下移(僅 `draggable` 時;詳「Drag and Drop → 鍵盤重排」) |
| `Cmd/Ctrl+Shift+→` | 重排:移入上一個 sibling(需為 folder;收合時自動展開) |
| `Cmd/Ctrl+Shift+←` | 重排:移出,成為 parent 的下一個 sibling |

焦點在**列上的按鈕**上:

| 按鍵 | 行為 |
|---|---|
| `→` | 下一顆;已是最後一顆 → 不動 |
| `←` | 上一顆;已是第一顆 → 回到這一列 |
| `↑` / `↓` | 回到上 / 下一列(選單鈕也一樣;開選單用 `Enter` / `Space`) |
| `Home` / `End` | 第一個 / 最後一個可見列 |
| `Enter` / `Space` | 按鈕自己的動作(原生) |
| `Tab` / `Shift+Tab` | **一下就離開整棵樹**(焦點先回這一列,再由瀏覽器往下 / 往上走一站) |

**2026-09-26 統一成側欄做法的三格**(批次細節 X4 / X6 / X7,待辦總帳〇節「09-26 同意清單回覆」,user 逐字:「確保符合我們一致的設計語言且不違背世界級的設計且都有確保整個ds 是SSOT,避免漂移就照你建議做」):按鈕上 `Home` / `End` 原本不處理 → 換到第一 / 最後一列(X4);選單鈕上 `↓` 原本讓給按鈕開選單 → 換下一列(X6;同 `../Sidebar/sidebar.spec.md`「方向鍵整串歸清單」);按鈕上 `Shift+Tab` 原本先落回這一列、要按兩下 → 一下離開(X7,這一格原本就違反 B9「Tab 一下離開」)。

**滑過才出現的按鈕**(`actionsReveal="hover"`):焦點在這一列裡(列本身或列上的按鈕)時一定看得到;滑鼠點列不算(`:focus-visible` 判定)。

**決定來源**:總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` B9,user 原話「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」(附條件同意;條件經研究查證成立,同帳 A1)。與選單的同一套說法:Tab 換到下一區、方向鍵在區塊裡移動。

**一手依據**(路線本身;以下各格的細節 = AI 依這些來源對齊,不是 user 逐格裁示):
- 滑過才出現的東西用方向鍵走到、整組只佔一站:W3C grid [grid-pattern.html#L158](https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/grid/grid-pattern.html#L158)、[keyboard-interface-practice.html#L264](https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/practices/keyboard-interface/keyboard-interface-practice.html#L264)
- 樹狀表格的 `→`(收著先展開、展開後進列)、最右一格 `→` 不動、第一格 `←` 回列:[treegrid-pattern.html#L66-L80](https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/treegrid/treegrid-pattern.html#L66-L80)
- Adobe 正式版樹預設「方向鍵進列」:[s2 TreeView.mdx#L391](https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/dev/s2-docs/pages/s2/TreeView.mdx#L391);它的樹是 `treegrid`:[useTree.ts#L57](https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/tree/useTree.ts#L57);`→` 進列裡的按鈕、`↓` 換列、Tab 直接離開:[GridList.test.js#L1118-L1129](https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria-components/test/GridList.test.js#L1118-L1129)
- **AI 推導**(研究沒有明文要求的兩格):`←` 在收著 / 葉節點上回上一層 —— 樹的語意,Adobe 同([useGridListItem.ts#L501-L519](https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/gridlist/useGridListItem.ts#L501-L519));W3C 樹狀表格原文在這兩種列上是「不動」(#L78),本 DS 沿用樹的行為;按鈕上 `↑` / `↓` 換列 —— Adobe 方向鍵模式([useGridListItem.ts#L298-L309](https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/gridlist/useGridListItem.ts#L298-L309))。2026-09-26 前還有第三格「選單鈕的 `↓` 讓給按鈕」(對照微軟 Fluent 樹的例外 [useTreeItem.tsx#L201](https://github.com/microsoft/fluentui/blob/d27922755bebae866d9ffe86b7da44c27ec801ee/packages/react-components/react-tree/library/src/components/TreeItem/useTreeItem.tsx#L201)),已依 X6 統一成側欄做法(換下一列),理由是同一個 DS 裡「列上有小按鈕的一串」只有一張按鍵表。
- 判定與執行 = `../../lib/roving-list-keyboard.ts`(2026-09-26 由本元件的 `tree-keyboard-route.ts` 與 Sidebar / FileUpload / Command 四份合一),本元件只讀樹自己的狀態(哪一列、展開與否、上一層)與重排。判定表 `scripts/test-roving-list-keyboard.mjs`(全宿主)+ `scripts/test-tree-keyboard-route.mjs`(樹專屬格,含舊路線對照組);瀏覽器量測 `scripts/tree-view-keyboard-route-invariant.mjs`(R3 = X7、R4 = X4)。鍵盤處理掛在捕獲階段(同 Sidebar),所以選單鈕自己的 `↓` 搶不到。

重排鍵位在 modifier 層,與導覽鍵完全正交(W3C 沒有拖放 pattern,重排屬 application-level 鍵位)。

---

## ARIA

| 元素 | Role | 屬性 |
|---|---|---|
| TreeView 容器 | `role="treegrid"`(不可聚焦) | **`aria-label` 或 `aria-labelledby`(擇一必填 — accessible name)**,`aria-multiselectable`(多選時) |
| TreeItem 外層(node 容器) | 無角色 | — (只放內部用的 `data-tree-*`) |
| TreeItem 的列 | `role="row"`(`tabIndex` 0 = 停靠點 / -1) | `aria-level`,`aria-expanded`(expandable 才有),`aria-selected`(`selectionMode≠none`),`aria-disabled`,`aria-labelledby` → 自己的 label(列名只取 label,不併入按鈕名) |
| 主格 / 動作格 | `role="gridcell"` | 動作格裡每顆按鈕 `tabIndex=-1`、**必須有可讀名稱**(`inlineActions` 由 `label` 給 `aria-label`;`inlineActionsSlot` 缺名稱時 dev 模式 `console.warn`) |
| TreeItem children 容器 | 無角色(2026-09-25 前是 `group`;樹狀表格的列之間不允許 `group`) | — |

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

Sidebar 不會自動辨識任意 tree 容器；consumer 必須在承載 TreeView／可收合 tree group 的 wrapper 傳 `className="group-data-[collapsible=icon]:hidden"`，讓 Sidebar group state 在 icon 模式隱藏整塊 tree。TreeView 本身不改變資料或互動模式。

### 為什麼 menu 用 px-3

浮層選單的 padding 跟觸發器(Input / Select)的 px-3 對齊——選單打開時,第一個選項的 label 起始位置跟 Input 裡的文字對齊。這是 MenuItem / DropdownMenu 的既有規則。

---

## Hover-only Inline Actions

TreeItem 右側 inline actions（宣告式 `inlineActions: InlineActionConfig[]` 或 escape-hatch `inlineActionsSlot`，**非** `actions` prop）預設在 hover 該列**或鍵盤 focus-visible 該列**時出現(opacity 0→1)；`actionsReveal={false}` 則常駐不 hover-reveal。**為什麼**:(a) 視覺清潔(10+ node × 2-3 icon = 20-30 灰 icon 同屏噪音極大);(b) 業界一致(Notion / VS Code / Figma 都 hover-only);(c) 不影響操作(要操作自然會 hover)。

**出現是瞬間的、不淡入**(2026-09-26 待辦總帳 L9「全部瞬間」延伸到滑過才出現的按鈕,user:「確定這樣才是一致設計語言就做」;2026-09-26 前是 0.15 秒淡入)。出現規則只住 `ItemSuffix` 的 `hoverReveal`(`../../patterns/element-anatomy/item-anatomy.tsx`),SSOT = `../../tokens/motion/motion.spec.md`「hover 回饋不做過渡」。

**Uniform 規則**:同類型 node 的 hover action 必須完全一致,否則 discovery 失敗。
- **⋯ (more menu)**:所有 node 統一有,menu 內容由 consumer 依 node type 動態(rename / delete / duplicate)
- **1 個 shortcut**(如 ＋ add child):只支援的 type 有,但同 type 統一(所有 folder 都有 ＋)
- **最多 2 個 hover action**(⋯ 必有 + 最多 1 shortcut),超過 → 全塞 ⋯ menu
- **狀態 toggle**(visibility eye / lock):永遠可見(顯示當前 state 不是 action;hover 才看到失去意義),不放 `actions` slot

### Inline action 視覺 + API

Icon 尺寸跟 size tier(sm/md=16, lg=20);色 `fg-muted` → hover `fg-secondary`;hover bg `neutral-hover`;action 間距 / 高度對齊規則見 `../../patterns/element-anatomy/inline-action.spec.md`(canonical SSOT,2026-04-24 自 item-anatomy 抽出)。

**宣告式 API**(對齊 `inline-action.spec.md` + `SidebarMenuButton.inlineActions`):`inlineActions: InlineActionConfig[]` + `actionsReveal: false | "hover"`(預設 `"hover"`,鍵盤 focus-visible 也顯)。內部用 `<ItemInlineAction>` helper 渲染,consumer **不可手刻 button JSX**(canonical 在 `item-anatomy.tsx`,共用 size 查表 / Tooltip / hover bg / aria)。Hover-reveal 用 `group-has-[:focus-visible]/tree-item:opacity-100`(焦點在列上的按鈕)+ `group-focus-visible/tree-item:opacity-100`(焦點在列本身;2026-09-25 列改為真焦點後補,總帳 B9),而非 `group-focus-within`(後者 mouse click 會永久顯示)。鍵盤怎麼走到這些按鈕見「鍵盤導覽」。

---

## Drag and Drop

`draggable` prop 啟用後 Figma 風格整列拖(無 grip handle),`PointerSensor distance: 5` 區分 click / drag。

**互動模型**:
- **X+Y 雙軸偵測**:Y 軸定位置(上 25% = before / 中 50% = inside / 下 25% = after);X 軸定 nesting 深度(滑鼠 X 相對 tree 左邊界 / `indentStep` = level)
- **Drop position 三種**:`before` / `after`(同層上下)、`inside`(成為子 node)
- **X 軸邏輯**:指標 ≤ folder 深度 → `after`;> folder 深度 → `inside`;leaf `after` 若指標較淺自動升到 parent 的 `after`
- **Auto-expand**:拖曳停留收合 folder 500ms → 自動展開(Figma 行為);離開或結束取消計時
- **依賴**:`@dnd-kit/core`(`useDraggable` + `useDroppable` + `DragOverlay`);state 由 consumer `onDragEnd({sourceId, targetId, position})` callback 自行更新

**視覺**(2026-05-06 v14.5 SSOT 抽 `lib/drag-visual.ts`):被拖 node 原位 `opacity-disabled`(45%)半透明殘影 / before-after drop indicator 為 2px primary 細線(`bg-primary` `h-0.5`,left 跟 indent 深度)/ inside drop target `bg-drop-target` 全行背景 / DragOverlay ghost 圓角 + icon + label + **不透明 `bg-surface`** + elevation shadow(跟 surface 拉開的視覺距離靠 shadow 不靠 opacity;半透明只用在上述原位殘影)。**TreeView 是 DS 內最早 codified 的 drag canonical**,DataTable row drag + column reorder 都 inherit 此 pattern via `drag-visual.ts` SSOT module。視覺校驗見 story `DragAndDrop`。

**結構安全(2026-07-14 修)**:`handleDragOver` / `handleDragEnd` 有 descendant guard(`isInSubtree`)——drop target 落在被拖 node 自己的子樹內時視同無效目標(原實作只擋 `over.id === active.id` 未擋 descendants,會發出 `targetId ∈ source 子樹` 的非法事件;consumer 按 remove→insert 實作時整個子樹會靜默消失)。鍵盤重排路徑共用同一 guard。

### 鍵盤重排(2026-07-14 v1)

`draggable` 啟用後,鍵盤與指標同樣可重排(WCAG 2.1.1 keyboard parity——四鍵可組合出任何 pointer 可達的合法樹位置)。鍵位 `Cmd/Ctrl+Shift+方向鍵`(對齊 [Notion 移動 block 鍵位](https://www.notion.com/help/keyboard-shortcuts),WebFetch 驗證紀錄 `.claude/logs/treeview-keyboard-dnd-design.md#L25`;[Asana](https://keycombiner.com/collections/asana/) / [Todoist](https://www.todoist.com/help/articles/use-keyboard-shortcuts-in-todoist-Wyovn2) 同「modifier+方向鍵直接移動」派),對焦點所在的那一列操作(只從列上發動;焦點在列上的按鈕時不重排),**每按一下立即 commit**——無 grab-mode、無預覽、無 cancel(反向鍵即 undo)。**不用** dnd-kit `KeyboardSensor`:它是「按下開始 → 方向鍵搬 → 再按放下」的抓取模式,預設用 `Enter` / `Space` 開始([dnd-kit sensors 文件](https://dndkit.com/api-documentation/sensors/keyboard)),而本元件這兩個鍵是「選取」、重排語意又是每按即 commit,故為容器 `handleKeyDown` 的自建分支。(舊理由「列不可聚焦,與虛擬焦點結構性不相容」在 2026-09-25 列改為真焦點後不再成立,已撤回。)

| 按鍵 | 行為 | 發出事件 |
|---|---|---|
| `Cmd/Ctrl+Shift+↑` | 同層上移(整個子樹一起動) | `{sourceId, targetId: prevSibling, position: 'before'}` |
| `Cmd/Ctrl+Shift+↓` | 同層下移(跳過 sibling 的子樹,不會鑽進去) | `{sourceId, targetId: nextSibling, position: 'after'}` |
| `Cmd/Ctrl+Shift+→` | 移入上一個 sibling(需為 folder;collapsed 時自動展開——pointer 500ms hover auto-expand 的鍵盤對應物) | `{sourceId, targetId: prevSibling, position: 'inside'}` |
| `Cmd/Ctrl+Shift+←` | 移出,成為 parent 的下一個 sibling | `{sourceId, targetId: parentId, position: 'after'}` |

- **契約同 pointer**:同一個 `onDragEnd` + `TreeDragEndEvent`,consumer API 零改動。**頻率差異**:pointer 一手勢一次、keyboard 每步一次——有伺服器持久化的 consumer 建議 optimistic update(不建議 debounce batch,會破壞每按即 commit 語意)。
- **邊界 no-op**:已在最上方 / 最下方 / 最外層、無可移入的 folder → 不發事件,只 SR 播報原因。
- **disabled**:disabled node 不可移動,也不可當 target 錨點——相鄰 sibling disabled 時錨到最近 enabled sibling 表達同一插槽(可達位置與 pointer 一致;pointer 的 `useDroppable` 同樣 disable disabled node)。
- **視覺**:每按即 commit,節點真實移動即回饋——**不用** dropIndicator / DragOverlay(那是「預覽中」的視覺語言,用在已 commit 的操作上會說謊);保留 keyboard focus ring 跟隨 —— 移動後焦點還給被移動的那一列(React 搬動或重掛該列時瀏覽器會把焦點丟到 body,`tree-view.tsx` 在下一個影格把焦點放回去;2026-09-25 前靠 `aria-activedescendant` 自動跟上)+ 移動後 `scrollIntoView`。
- **互斥**:pointer 拖曳進行中忽略鍵盤重排;`draggable` 未啟用時整組鍵位 no-op(不落入導覽)。
- **SR 播報**:TreeView 自有 sr-only `role="status"` polite live region(消費 `select-menu.tsx` `SelectMenuLiveStatus` 先例;單一節點覆寫式更新,快速連按只播最新)。文案 zh-TW 預設(「已將『X』移到『Y』之後,第 n 項,共 m 項」/「已將『X』移入『Y』」/「已在最上方」等),`reorderAnnouncements` prop per-key 覆寫(i18n 覆寫點),含 `instructions` sr-only 操作說明(tree 容器 `aria-describedby` 指向,僅 `draggable` 渲染)。播報為 optimistic(事件發出即播,假設 consumer 依約 reorder);移入原本收合的 folder 時序數不可知,播報省略序數。

---

## Checkbox(多選模式)

多選 tree(如 file browser、permission picker)在 label 前方加 checkbox:

```
[indent][chevron][checkbox?][indicator|icon?][label][suffix?]
```

Checkbox 位於 chevron 之後、indicator / icon / label 之前（`tree-view.tsx` render 順序:chevron → checkbox → indicator / icon → label,見 tsx 內「Checkbox 在 icon 前」註解）。對齊 SelectMenu 多選 checkbox 慣例。

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

TreeView 是**階層樹元件**,關鍵決策維度是 selection × expanded × indent × size × context(`'sidebar'` / `'menu'`——`tree-view.tsx` `TreeContext` 僅此兩值)。`Inspector` 提供互動式 Controls(size / context / selectionMode / expandOnSelect)即時切換,搭配 `SizeMatrix` / `ColorMatrix` / 元件特有 `IndentMatrix`(縮排規則) / `StateBehavior`(selected vs expanded 語意分離) / `KeyboardMatrix` / `Accessibility` 完整覆蓋。

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

**ARIA / Pattern**:自建 ARIA **樹狀表格**(2026-09-25 由 `tree` 改,總帳 B9)。容器 `role="treegrid"`(多選時加 `aria-multiselectable`),每個 node 的列 `role="row"` + `aria-level` / `aria-expanded`(expandable 才有)/ `aria-selected` / `aria-labelledby`,列裡是 `gridcell`(主格 + 動作格),皆由元件手動設定(`tree-view.tsx` TreeItem render;完整對照見上方「ARIA」表)。Radix Collapsible([`packages/react/collapsible`](https://github.com/radix-ui/primitives/tree/f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae/packages/react/collapsible))僅用於 children 展開 / 收合的高度動畫,**不提供**任何角色 / aria / 鍵盤導覽。為什麼是樹狀表格:W3C 只在樹狀表格定義了「列裡有按鈕時鍵盤怎麼走」([treegrid-pattern.html#L62-L80](https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/treegrid/treegrid-pattern.html#L62-L80)),一般樹的頁面沒有;Adobe 的樹同樣是 `treegrid`([useTree.ts#L57](https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/tree/useTree.ts#L57))。讀螢幕軟體會念成「樹狀表格」—— **未用讀螢幕軟體實測**。`aria-setsize` / `aria-posinset` **刻意省略**:只有當列未全數 render 進 DOM(lazy load)或 DOM 序 ≠ 閱讀序時才必需;本元件可見列皆在 DOM 且 DOM 序 = 閱讀序。

**Accessible name(必填契約)**:`role="treegrid"` 的名稱無法從子節點內容推導,consumer **必須**提供 `aria-label`(直接字串)或 `aria-labelledby`(指向可見標題的 id)其中之一——有可見標題時優先 `aria-labelledby`,無則用 `aria-label`。兩者皆缺 → 螢幕閱讀器只讀出角色名、無法辨識用途。`tree-view.tsx` 於 `process.env.NODE_ENV !== 'production'` 時 `console.warn` 提示,避免上線後才發現無名稱樹(對齊 Button / Tag 的 dev-only 誤用警告 idiom)。列上的每顆按鈕也必須有名稱(見「ARIA」表)。

**Keyboard 行為**(`tree-view.tsx` handleKeyDownCapture → 共用純函式 `../../lib/roving-list-keyboard.ts` `resolveRovingKey`):完整按鍵表見「鍵盤導覽」段,此處不重複。

**Focus**:**列上的 roving tabindex、真 DOM 焦點**(2026-09-25 取代原本的 `aria-activedescendant` 虛擬焦點:`→` 要把焦點真的交給列裡的按鈕、`←` 再交回列,列若維持虛擬焦點,同一棵樹就有兩種焦點模型)。停靠點那一列 `tabIndex=0`,其餘 `-1`;容器不可聚焦。焦點框 = 列自己的 `focus-visible:focus-ring-inset`(瀏覽器 `:focus-visible` 決定畫不畫:滑鼠點列不畫、鍵盤畫;與 Sidebar 選單鈕同寫法);焦點在列上的按鈕時由按鈕自己畫框,列不再多畫。點列上的按鈕時焦點留在按鈕;點列的其他地方或展開箭頭時焦點給列。**無** focus trap、**無** focus restoration(樹不是浮層);唯一的「還焦點」是鍵盤重排後還給被移動的列(見「鍵盤重排」)。

**「單一 Tab 停靠點」包含列上的按鈕**:auto-render checkbox 與 consumer 傳入的 `checkbox` element 由 TreeItem 正規化為 `aria-hidden` + `tabIndex={-1}`(只鏡像列的 `aria-selected`);`inlineActions` / `inlineActionsSlot` 裡每一個可聚焦元素也都是 `tabIndex={-1}`,只能用 `→` / `←` 從自己那一列走到 —— 所以不論幾列有按鈕,Tab 一下就離開整棵樹。
2026-09-25 撤回原句「按鈕是各自獨立的 tab stop(對齊 GitHub / VS Code 檔案樹『row action 可 Tab』慣例)」:查證後 GitHub 的樹列按鈕根本不讓 Tab 到([TreeView.tsx#L843-L875](https://github.com/primer/react/blob/f2c075a5d4d0b51a279c39effa18226ad909929d/packages/react/src/TreeView/TreeView.tsx#L843-L875)),VS Code 只有**目前那一列**的按鈕走得到([listWidget.ts#L609-L659](https://github.com/microsoft/vscode/blob/d2dacb76b2f5c1cafcf24dc3c1906e6f4f47918e/src/vs/base/browser/ui/list/listWidget.ts#L609-L659)),那句「對齊」不成立;舊做法在「工程團隊樹」要按 5 下 Tab 才出得去,而且走過的全是別列的按鈕(總帳 B9 / C3)。

**SR 播報(重排)**:鍵盤重排結果經 TreeView 自有 sr-only `role="status"` polite live region 播報,容器 `aria-describedby` 指向 sr-only 操作說明(兩者僅 `draggable` 時渲染、皆在 `role="treegrid"` 之外——樹狀表格的合法 children 只有 row / rowgroup);文案可經 `reorderAnnouncements` prop 覆寫,詳「鍵盤重排」段。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作導覽 / 選取 / 展開收合 / 列上按鈕 / **拖曳重排**(無需滑鼠;重排走容器 handleKeyDown 的 `Cmd/Ctrl+Shift+方向鍵` 分支,非 dnd-kit `KeyboardSensor`,sensors 仍僅 `PointerSensor`,見「鍵盤重排」段)。鍵盤路線的機械驗證:`scripts/test-roving-list-keyboard.mjs` + `scripts/test-tree-keyboard-route.mjs`(判定表)+ `scripts/tree-view-keyboard-route-invariant.mjs`(瀏覽器實按,含對照組)+ 展示頁「列上的動作」story 的 play。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `accordion.spec.md`
- `combobox.spec.md`
- `data-table.spec.md`
- `sidebar.spec.md`

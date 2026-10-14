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

TreeView 本身負責四件事:
1. **遞迴渲染** + indent
2. **展開/收合**狀態管理
3. **鍵盤導覽** + ARIA 樹狀表格(`treegrid`)
4. **步驟導覽樹**(單選 + `expandOnSelect`)的點擊判斷與步驟結果的畫法(2026-10-07 起;見「步驟導覽樹」「步驟結果」)

它不管 node 裡面長什麼樣——icon、badge、inline action 等視覺都由 consumer 透過 props / slots 決定。**例外是第 4 件的步驟結果**:consumer 只給事實(每一頁的結果 `status`),列尾圖示、收起的大步驟替子步驟代顯什麼由本元件畫 —— 與 `../FileItem/file-item.tsx`(consumer 給 `status`、元件畫圖示)同一種分工。不同使用情境(sidebar nav、file browser、stepper)是同一個 TreeView 的不同消費方式,不是不同元件。

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

Chevron 是**展開/收合控件**,不是 prefix icon:`fg-muted`(指示色,hover 時 `fg-secondary`,只前進一階)/ 位置在 indent 之後 icon 之前 / 點擊只 toggle expand 不觸發 selection / `rotate-90`,旋轉時長與曲線跟子項同一份(見「動畫」)。

**消費共用行內小按鈕**(2026-09-26,待辦總帳 L5,user:「是改成inline action對吧？」):箭頭本身就是 `ItemInlineActionButton`(`../../patterns/element-anatomy/item-anatomy.tsx`),尺寸照 `../../patterns/element-anatomy/inline-action.spec.md`「尺寸對照」TreeItem 列 —— 圖示與排版佔位 16(lg 20)、**滑過底色 18(lg 22)= 點得到的範圍**(`../../../ds-canonical/references/hit-area-canonical.md`)、按下多一階 `neutral-active`。與 DataTable 巢狀列的展開箭頭同一顆(`../DataTable/data-table.tsx` nestedPrefix)。縮排不變:箭頭仍住 `ItemPrefix` 鎖寬的槽,多出的 1px 靠溢出不吃版位。2026-09-26 之前這裡手刻一顆 16×16 的按鈕,滑過底色與點擊範圍都只有 16、也沒有按下態。箭頭 `tabIndex=-1`(不佔 Tab 停靠點;展開 / 收合的鍵盤在列上:`→` / `←`),**但保留名字與角色、不 `aria-hidden`**(2026-09-29 更正,待辦總帳 N46):`aria-label` 展開 / 收合 + `aria-expanded`,語音控制使用者喊「展開」才按得到、讀屏在列裡也叫得到它;與 DataTable 巢狀列的展開箭頭同一種寫法(`../DataTable/data-table.tsx` nestedPrefix)。2026-09-29 前寫 `aria-hidden`,一顆能聚焦(`tabIndex=-1` 仍可被程式與滑鼠聚焦)的按鈕對讀屏隱藏是 axe `aria-hidden-focus` 那一族。

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

**行為**:點整行(label / icon / 空白)→ select(預設所有 node 可選;`selectable={false}` 的列除外,見「步驟導覽樹」);點 chevron → toggle expand,不 select;鍵盤 `→`(收合 expandable)→ expand;`←`(展開 expandable)→ collapse;`←`(leaf / 收合 node)→ 焦點到 parent。(點列上的按鈕目前**也會**選取該列 —— 既有行為,本次未改,焦點則留在按鈕上;2026-10-07 起不再觸發 `expandOnSelect` 的展開 / 開合。)

**預設 label 不 expand**——chevron 是展開唯一控件。理由:select / expand 語意獨立(sidebar「Documents」點 label 進頁面,點 chevron 才展開子列表)。Consumer `expandOnSelect` prop 讓點整行時**會改變選取就選取並只展開(永不收合),不會改變選取才開合**(適合 stepper;單選 + `expandOnSelect` = 「步驟導覽樹」,完整規則見該段)——**連帶的展開與開合僅限指標點擊列的文字(`handleRowClick`)**;鍵盤 `Enter` / `Space` 只做「選取」(步驟導覽樹的沒有自己頁面的大步驟另見該段),原地展開 / 收合一律走 `→` / `←`。W3C 樹的 `Enter`:「activates a node, i.e., performs its default action. For parent nodes, one possible default action is to open or close the node. In single-select trees where selection does not follow focus (see note below), the default action is typically to select the focused node.」([treeview-pattern.html#L112-L114](https://github.com/w3c/aria-practices/blob/0f765e4dc33e966026114ac12a8380db1de3b787/content/patterns/treeview/treeview-pattern.html#L112-L114);2026-10-07 前這裡引的是樹狀表格 `#L60-L80`,那一句的前提是「If cell-only focus is enabled」,本元件是列拿焦點,不適用,改引此句)。2026-10-07 前程式在 `expandOnSelect` 下一律開合(`toggleExpand`),從別處點已展開的大步驟會選它又把它收起 —— 與本段「select + expand」不符,已修(待辦總帳 T5)。

**動畫**:children 用 Radix `Collapsible` height animation(0 → auto),消費共用的 `disclosureMotion`(`tokens/motion/disclosure-motion.ts`:`--motion-duration-disclosure` 200ms、收起後保持高度 0 直到卸載、減少動態不播;owner = `tokens/motion/motion.spec.md`「開合動畫:何時播、怎麼收尾」);chevron 圖示(2026-09-26 起掛在 `ItemInlineActionButton` 的 `iconClassName`)`rotate-0 → rotate-90`,旋轉消費 `disclosureIndicatorMotion`(`tokens/motion/disclosure-motion.ts`)—— 與子項高度動畫同一個 `--motion-duration-disclosure` 200ms、同一個 `ease-out`,兩者一起開始、一起停;減少動態下直接換角度不轉(2026-10-13 起;原本 150ms、Tailwind 預設曲線,owner = `tokens/motion/motion.spec.md「展開箭頭跟它打開的東西同步」`)。展開 / 收合是狀態切換的動畫,不是滑過回饋,保留(2026-09-10:原本是 `transition-all`,連 hover 底色一起過渡;hover 底色改成瞬間後只留旋轉,owner = `tokens/motion/motion.spec.md`「hover 回饋不做過渡」)。

---

## 選取

### 單選(預設,nav tree / stepper)

- 焦點跟選取分離:`focus` 是鍵盤游標停在哪一列,`selected`(灰底)是「你在哪」—— user 2026-10-01T01:56:25Z 原話(該則其中一段,接在引用 AI 那句之後):「灰底代表你在哪裡，狀態代表目前步驟狀態，這個巢狀步驟的元件用途通常是作為左側菜單來被使用，點擊左側菜單選項右側body就會有對應內容」(待辦總帳 T1b (4);2026-10-07 前這句寫「`selected` 是『使用者選了哪個』」)。步驟導覽樹裡灰底還可能由收起的大步驟代顯,見「步驟結果 → 灰底」
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

## 步驟導覽樹(單選 + `expandOnSelect`)

**是什麼**:左邊一棵步驟樹、右邊是目前那一步的內容 —— user 2026-10-01 原話見上方「選取」(「…這個巢狀步驟的元件用途通常是作為左側菜單來被使用，點擊左側菜單選項右側body就會有對應內容」);巢狀步驟交給 TreeView 是 user 2026-10-01 的決定(`../Steps/steps.spec.md`「何時不用」)。開法:`selectionMode="single"`(預設)+ `expandOnSelect`。灰底 = 你在哪(目前那一步);列尾 = 步驟結果(見「步驟結果」)。**只有這種樹**有本段與「步驟結果」的行為(灰底代顯、列尾結果、`aria-current="step"`、點大步驟的文字開合);沒開 `expandOnSelect` 的檔案樹、側欄樹一個像素、一個行為都不變。

### 兩種大步驟(有子步驟的列)

| 種類 | 寫法 | 點它的文字去哪 | 收起、目前那一步在裡面時 |
|---|---|---|---|
| **沒有自己頁面**:只是把子步驟分組(表單、開通、設定精靈這一類幾乎都是這種)| `selectable={false}` | 它底下的子步驟(見下表)| 灰底與列尾結果一起移到它身上(代顯,見「步驟結果」)|
| **有自己頁面**:它自己也有一頁內容 | 預設(不寫 `selectable`)| 它自己那一頁 | 不代顯 —— 灰底、列尾都只講它自己(user 2026-10-06:「2. 我覺得每種做法都有缺點，不如此情境收起後不代顯」)|

- **同一棵步驟樹只用其中一種,不混用**(待辦總帳 T3b;user 2026-10-06 晚「3. 照你建議」)。混用時兩套代顯規則出現在同一棵樹裡,讀者分不出為什麼有的收起會灰、有的不會。開發模式偵測到(只看得到已掛載的列)會 `console.warn`。同樣的指引:UI5「To improve user experience do not mix unselectable parent items with selectable parent items in a single side navigation.」([SideNavigationSelectableItemBase.ts#L134-L135](https://github.com/UI5/webcomponents/blob/57be0294dd4b7aada63dd4b57ef95b852bdfcbff/packages/fiori/src/SideNavigationSelectableItemBase.ts#L134-L135))。
- **有自己頁面的大步驟很少見,本規格只寫規則、不做範例**:user 2026-10-07 原話:「2. 我覺得是這樣,確保不違背世界級的設計,此外,此情境若確認真的少之又少就不要展示範例避免讓讀者以為這是一個很常見的案例」;第八輪研究在表單 / 開通 / 設定精靈類找到的大步驟都沒有自己的頁,唯一的例外是自動建置的執行紀錄(一個「工作」有自己一頁、底下是它的小步驟)—— 研究紀錄在待辦總帳 T4。它的行為由 test-only 夾具與閘守住(見「閘」)。
- `selectable={false}` 的命名(預設 true,關掉 = 這一列不能被選):Ant Design TreeNode「selectable | Set whether the treeNode can be selected | boolean | true」([index.en-US.md#L104](https://github.com/ant-design/ant-design/blob/2d2d49cb6378b6b41c40cd331f63139017ced6e0/components/tree/index.en-US.md#L104))、PrimeReact TreeNode「Whether the node is selectable when selection mode is enabled.」([treenode.d.ts#L59-L61](https://github.com/primefaces/primereact/blob/5cd9b145ce7d8b498e745002624ba958f307897e/components/lib/treenode/treenode.d.ts#L59-L61));同一個概念 UI5 叫 `unselectable`([#L132](https://github.com/UI5/webcomponents/blob/57be0294dd4b7aada63dd4b57ef95b852bdfcbff/packages/fiori/src/SideNavigationSelectableItemBase.ts#L132))。DS 內 `DataTable` 的 `selectable` 是整張表開不開選取(表層級),同一個字同一個意思(能不能被選),只是層級不同。
- 只用在有子步驟的列:沒有子步驟又 `selectable={false}` = 沒有頁面、底下也沒有地方可去,點了沒反應(開發模式警告)。

### 點大步驟的文字(滑鼠 / 手指)

一句話:**會換位置 → 去那裡並只展開(永不收合);什麼都不會變 → 開 ↔ 合**。

| 情境 | 結果 | 決定來源 |
|---|---|---|
| 沒有自己頁面的大步驟,目前那一步**不在**裡面 | 到它底下**第一個能前往的子步驟**(畫面順序,跳過停用的分支);沿路收著的大步驟只展開;焦點跟過去 | A2:user 2026-10-06「C對吧」 |
| 沒有自己頁面的大步驟,目前那一步在裡面、**被收著**(含更深一層收著)| 只展開到看得到目前那一步;選取不變 | A2(同上);「展開到看得到」是 AI 推導 |
| 沒有自己頁面的大步驟,目前那一步在裡面、**看得到** | 什麼都不會變 → 開 ↔ 合(D) | D:user 2026-10-07「1. 做D,且確保不違背世界級的設計,若世界級設計有擋就擋」 |
| 有自己頁面的大步驟,它**不是**目前那一步(從別處、或從它的子步驟)| 選它(到它那一頁);收著就只展開,展開著就維持展開 | 本段「select + expand」(2026-10-07 前程式一律開合,總帳 T5) |
| 有自己頁面的大步驟,它**就是**目前那一步 | 什麼都不會變 → 開 ↔ 合(D) | D(同上) |
| 子步驟(沒有子步驟的列)| 選它;已是目前那一步 → 不動 | 既有 |

- 點**展開箭頭**:照舊每點一下開合一次、不選取(見「Chevron 的特殊性」),不受下面的連點保護管。
- 點**列上的按鈕**:只做按鈕自己的事,不開合、不跳步(2026-10-07 前 `expandOnSelect` 連點按鈕也會開合);能選的列照既有「點到按鈕也會選取該列」。
- 世界級的同一套:有自己頁面的分類「When already on the category's page, we collapse it」、從別處點過去「we always expand」—— Docusaurus([Category/index.tsx#L241-L262](https://github.com/facebook/docusaurus/blob/021ee05058b2df769306dd717246bd5967f4845a/packages/docusaurus-theme-classic/src/theme/DocSidebarItem/Category/index.tsx#L241-L262));VS Code 左側活動列:面板沒開 → 點了打開,已開著 → 點了收起側欄([paneCompositeBar.ts#L813-L826](https://github.com/microsoft/vscode/blob/3dabe9b5512f025eb64934ce456f4867ec6a11c9/src/vs/workbench/browser/parts/paneCompositeBar.ts#L813-L826))。沒有自己頁面的大步驟「去第一個子步驟」(A2)是 user 的決定,不是照抄某一家:UI5 的同類父項點了只開合([#L134](https://github.com/UI5/webcomponents/blob/57be0294dd4b7aada63dd4b57ef95b852bdfcbff/packages/fiori/src/SideNavigationSelectableItemBase.ts#L134))。

### 連點保護(D 才需要)

**為什麼要**:D 讓同一列的第二下意思跟第一下不同 —— 從別處雙擊沒有自己頁面的大步驟,第一下「到第一個子步驟並展開」、第二下就變成「已在裡面 → 收起」(右邊已換頁,樹上卻收著);在原地雙擊會「收起又打開」,閃一下。user 的條件是「若世界級設計有擋就擋」,世界級有擋:
- 微軟 VS Code 活動列(就是「沒開就打開、開著就收起」的 D):同一顆圖示 300 毫秒內的第二下不理,原始碼註解「prevent accident trigger on a doubleclick (to help nervous people)」([paneCompositeBar.ts#L767](https://github.com/microsoft/vscode/blob/3dabe9b5512f025eb64934ce456f4867ec6a11c9/src/vs/workbench/browser/parts/paneCompositeBar.ts#L767)、[#L801-L806](https://github.com/microsoft/vscode/blob/3dabe9b5512f025eb64934ce456f4867ec6a11c9/src/vs/workbench/browser/parts/paneCompositeBar.ts#L801-L806))。
- 微軟 Windows 設計指引:「If an object doesn't support double clicks but users are likely to assume it does, interpret a "double click" as one single click.」並且「Use the system double-click speed to distinguish between single and double clicks.」([inter-mouse.md#L242-L246](https://github.com/MicrosoftDocs/win32/blob/e103fa4e8810bd8d42c4777e17081e24dbe62dbd/desktop-src/uxguide/inter-mouse.md#L242-L246))。微軟 Raymond Chen:「Because many users double-click everything.」;XP 開始鈕「ignores the second click. Otherwise, when people double-click the Start button, the first click would open the Start menu and the second click would dismiss it!」([The Old New Thing, 2004-10-15](https://devblogs.microsoft.com/oldnewthing/20041015-00/?p=37553))。

**規則**:點列的文字時,這一下若是**同一列的連點**,只處理選取(冪等)、**不開合** —— 擋的是「這一下沒有換位置、卻會開或合」的兩種:D 的開合,以及「目前那一步在裡面但收著 → 展開」(原地雙擊時第一下收起、第二下本來會再展開,不擋就閃一下)。會換位置的那一下(到第一個子步驟、選別的列)不擋,它本來就要展開才看得到新的位置。同一列的連點 = 上一下也點在**這一列**的文字上(換列不算,換到別列的快點照常處理;中間點過展開箭頭也不算),而且:
- 瀏覽器回報的連點次數 ≥ 2(`MouseEvent.detail`;Windows / Mac 照使用者在系統設定的雙擊速度,調慢的人也照顧到 —— 上面微軟指引第二句),**或**
- 離上一下不到 **500 毫秒**(`STEP_REPEAT_CLICK_WINDOW_MS`)。

兩個條件缺一不可:WebKit(iPhone / iPad 上的每一個瀏覽器)手指**點一下**回報「第 1 下」(WebKit [WebPage.h#L1169](https://github.com/WebKit/WebKit/blob/b4363b9b36946b63017de1b6d8b8e924dbf23e56/Source/WebKit/WebProcess/WebPage/WebPage.h#L1169) `int clickCount = 1`、[WebPageCocoa.mm#L3290-L3296](https://github.com/WebKit/WebKit/blob/b4363b9b36946b63017de1b6d8b8e924dbf23e56/Source/WebKit/WebProcess/WebPage/Cocoa/WebPageCocoa.mm#L3290-L3296) 不傳次數、[EventHandler.cpp#L2168](https://github.com/WebKit/WebKit/blob/b4363b9b36946b63017de1b6d8b8e924dbf23e56/Source/WebCore/page/EventHandler.cpp#L2168) 直接取用);手指**快點兩下**時,只有頁面在那一點(或整個視窗)有在聽雙擊(`dblclick`)才會送出「第 2 下」(`handleDoubleTapForDoubleClickAtPoint` 送出次數 2 的按下與放開,[WebPageCocoa.mm#L3832-L3893](https://github.com/WebKit/WebKit/blob/b4363b9b36946b63017de1b6d8b8e924dbf23e56/Source/WebKit/WebProcess/WebPage/Cocoa/WebPageCocoa.mm#L3832-L3893);「有沒有在聽」= 從點到的元素往上找掛了 `dblclick` 的祖先,[LocalFrame.cpp#L1942-L1967](https://github.com/WebKit/WebKit/blob/b4363b9b36946b63017de1b6d8b8e924dbf23e56/Source/WebCore/page/LocalFrame.cpp#L1942-L1967);單點那條路只有自動化輸入、而且頁面有聽雙擊時才給 2,[WebPageCocoa.mm#L3530-L3541](https://github.com/WebKit/WebKit/blob/b4363b9b36946b63017de1b6d8b8e924dbf23e56/Source/WebKit/WebProcess/WebPage/Cocoa/WebPageCocoa.mm#L3530-L3541))。React 18 在根節點聽所有事件、雙擊也在內([DOMEventProperties.js#L130](https://github.com/facebook/react/blob/f1338f8080abd1386454a10bbf93d67bfe37ce85/packages/react-dom/src/events/DOMEventProperties.js#L130)、[DOMPluginEventSystem.js#L386-L398](https://github.com/facebook/react/blob/f1338f8080abd1386454a10bbf93d67bfe37ce85/packages/react-dom/src/events/DOMPluginEventSystem.js#L386-L398),v18.3.1),所以 React 頁面裡快點兩下**可能**回報 2,但那條路還有別的條件,**沒有在實機上量過**。結論:次數有時有、有時沒有,靠不住,只看次數等於沒擋 —— 所以要有時間判斷,跟 VS Code 一樣;只看時間又會忽略使用者調慢的雙擊速度。500 = Windows 預設雙擊時間(「the default double-click time of 500 milliseconds」,[nf-winuser-setdoubleclicktime.md#L62](https://github.com/MicrosoftDocs/sdk-api/blob/c12073e417d5780fe796278ada21b90cef1b0568/sdk-api-src/content/winuser/nf-winuser-setdoubleclicktime.md#L62))= Chromium 判斷連點的時間(`kDoubleClickTimeMs = 500`,[event_constants.h#L115](https://github.com/chromium/chromium/blob/147.0.7727.15/ui/events/event_constants.h#L115))—— 也就是系統眼中的「雙擊」;VS Code 的 300 比它短,間隔 300〜500 毫秒的雙擊系統仍算雙擊、300 會漏(AI 推導)。時間從**上一下**量起、每一下都更新:連續快點幾下都算同一串,跟系統數「第幾下」的方式一樣(Chromium 每一下都跟上一下比,[event.cc#L463-L488](https://github.com/chromium/chromium/blob/147.0.7727.15/ui/events/event.cc#L463-L488));VS Code 是從最後一次「有作用」的那一下量起(`lastRun` 只在沒被擋時更新,[#L803-L806](https://github.com/microsoft/vscode/blob/3dabe9b5512f025eb64934ce456f4867ec6a11c9/src/vs/workbench/browser/parts/paneCompositeBar.ts#L803-L806)),連續快點、總長超過它的時間窗時後面那一下會再動作,本 DS 不會。

**照實記下的殘留**(不是 bug,是這道保護的邊界):
- 兩下隔得比 500 毫秒久、而且系統沒把它算成雙擊 → 當成兩個動作:從別處「到那裡」之後再「收起」,或原地「收起」之後再「打開」。VS Code 也一樣:隔得比它的時間窗久的第二下照常動作([#L803](https://github.com/microsoft/vscode/blob/3dabe9b5512f025eb64934ce456f4867ec6a11c9/src/vs/workbench/browser/parts/paneCompositeBar.ts#L803))。
- 500 毫秒內**真的想**再點一次的人,第二下沒反應;要再等一下或改點展開箭頭 / 按 `←` `→`。VS Code 也接受這個代價。
- 展開箭頭不受保護:雙擊箭頭 = 開合兩次(箭頭本來就是「每點一下切一次」,W3C 與各家樹相同)。

### 鍵盤

- `Enter` / `空白鍵` = **到那一步**(選取),永遠不開合:原地展開 / 收合一律 `→` / `←`(見「鍵盤導覽」;W3C 樹 `Enter`「In single-select trees … the default action is typically to select the focused node」,出處見「展開/收合」)。
- 唯一多出來的:沒有自己頁面的大步驟、目前那一步**不在**裡面 → 跟點擊一樣到第一個子步驟,沿路收著的只展開、焦點跟過去(不展開的話,右邊已換成新的一步,樹上卻看不到它)。目前那一步已在裡面 → 不動。
- 連點保護只管指標;按住 `Enter` 的連發不會開合(鍵盤本來就不開合)。

### 焦點

到第一個子步驟(A2)時焦點跟到那一列 —— 讀屏念得出被帶到哪一步(待辦總帳 T1b (3);AI 推導)。那一列可能是這一下才展開出來的,元件等它掛上之後再放焦點。滑鼠點的不會畫鍵盤框(`:focus-visible` 由瀏覽器判斷)。

- **連點時焦點與單擊相同**:同一列被擋下的那幾下,焦點回到這一串第一下留下的位置(從別處雙擊沒有自己頁面的大步驟 → 焦點在第一個子步驟,不是大步驟)。第二下的按下會讓瀏覽器把焦點先交給被點的那一列,元件再還回去 —— 雙擊的結果與單擊一模一樣,焦點也是(微軟指引「interpret a "double click" as one single click」,出處見「連點保護」;2026-10-07 複審查到雙擊後焦點停在大步驟、與單擊不同,已修)。
- **捲動框裡也看得到**:樹在可捲的框裡(長的側欄)時,被帶到的那一列若在這一下才展開的子樹裡,元件等展開動畫結束再把它捲進框內(動畫開始那一刻子樹高度還在 0 附近,那時捲完列仍在框外;2026-10-07 複審查到,已修)。只讀動畫、不改動畫;減少動態效果時沒有動畫,第一次捲動就是終點。這一條對所有樹都成立(鍵盤 `→` 展開後馬上 `↓` 也會遇到),不只步驟導覽樹。

### 閘

- 判定(純函式 + 序列判定表 + 改壞版必紅):`./tree-step-navigation.ts` ← `scripts/test-tree-step-navigation.mjs`。
- 真瀏覽器(真的 DS TreeView,滑鼠雙擊 / 三擊、觸控快點、超過時間窗的兩下、連點後的焦點、捲動框裡被帶到的那一步看得到(含鍵盤 `→` 之後馬上 `↓`)、鍵盤、灰底、列尾結果與讀屏說明,淺色 / 深色):`scripts/tree-view-step-navigation-invariant.mjs`(`--selftest` 注入改壞版必紅)。

## 步驟結果(步驟導覽樹)

### 誰有結果

- 結果 = 某一頁做完之後的結果:成功(`'completed'`)、失敗(`'error'`),或不給(還沒有結果,不畫)。產品給、元件照畫,**元件不產生、也不改任何一列的結果**。
- **只有有自己頁面的列有結果**(子步驟、有自己頁面的大步驟)。沒有自己頁面的大步驟永遠沒有自己的結果:不給它 `status`;給了會被忽略(開發模式警告)。
- 有自己頁面的大步驟,結果含不含子步驟,是產品對「那一頁的結果」的定義(例:自動建置的一個工作,一步失敗整頁就寫失敗),產品算好再給;元件不替它算。
- 判斷法:點開這一列自己的頁,頁上看得到這個結果 → 它自己的;沒有頁可開 → 畫在它身上的只能是代顯。
- 「誰有結果」與「代顯由元件算」兩條是 AI 依本 DS 既有分工推導(FileItem:consumer 給 `status`、元件畫圖示),不是 user 逐字裁示。

### 列尾畫什麼

| 列 | 展開時 | 收起時 | 畫的是誰的 |
|---|---|---|---|
| 子步驟 | 自己的結果 | (看不到)| 自己的 |
| 沒有自己頁面的大步驟 | **不畫**(子步驟各自看得到)| **代顯**:底下任一失敗 → 失敗;每一個都明確成功 → 成功;其他(含還沒有結果)→ 不畫 | 藏起來的子步驟的 |
| 有自己頁面的大步驟 | 自己的結果 | **跟展開一模一樣**(永不代顯)| 自己的 |

- 決定來源:列尾、只畫成功 / 失敗、沒做完不畫、圖示顏色沿用 FileItem、沒有自己頁面的大步驟收起畫彙總而展開不畫 —— user 2026-10-06 第 4 點「4. 照你建議，但我覺得下述非常奇怪：…」(「但」之後是對「有內容的大步驟」那一句的異議,由 10-07 第 2 點收斂成本段最後一句;原話全文見待辦總帳 T4);彙總 = user 2026-10-01 提的 AND(「我覺得收起來之後大步驟的狀態顯示是所有子步驟的and 運算結果就夠了吧？仔細研究世界級的設計，看到底要怎樣，確認我說是否正確」),再加上「還沒有結果」那一種(沒給的永遠不會被算成成功);有自己頁面的大步驟只畫自己、展開收起不變 —— user 2026-10-07「2. 我覺得是這樣…」(全文見上方「兩種大步驟」)。
- **「底下」= 所有有自己頁面的子孫**(任意深;中間的沒有自己頁面的大步驟沒有結果,跳過它往下找)。
- **圖示與顏色**:成功 `CircleCheck` + `text-success`、失敗 `XCircle` + `text-error`,與 FileItem 是同一份(`../FileItem/file-item-status.ts`,owner = FileItem);尺寸跟這一列的圖示一樣(sm / md 16、lg 20)。樹的步驟結果**不**沿用 Steps 的藍色完成點:用綠勾是 user 第 4 點「沿用 FileItem」的決定(待辦總帳 N72 ④)。
- **位置**:列尾、常駐(不隨滑過隱藏;「顯示當前 state 不是 action」,見「Hover-only Inline Actions」狀態 toggle 那條),跟滑過才出現的按鈕**並排**(結果在主格最後、按鈕在動作格,間距 = 列的 `gap-2`)。步驟導覽樹每一列都保留這一格(寬 = 這一列的圖示尺寸,與行內按鈕同一個盒,`ui-dev-rules.md`「同 flex 列的互動 slot 幾何鐵律」),步驟從「還沒有結果」變成完成 / 失敗時,標題的截斷位置不跳(AI 推導)。
- **停用的列**:圖示一律 `text-fg-disabled`(M24「disabled > 其他」),靠形狀(勾 / 叉)分辨。
- **讀屏**:列名只有標題(`aria-labelledby`),結果掛在列的 `aria-describedby`:自己的結果念「已完成」/「錯誤」(與 `../Steps/steps.tsx` 的讀屏字相同);代顯念「全部已完成」/「其中有錯誤」(文案 AI 推導)。

### 灰底(「你在哪」)與代顯

| 情境 | 灰底(`bg-neutral-selected` + `aria-current="step"`)在哪一列 |
|---|---|
| 目前那一步看得到 | 它自己(另有 `aria-selected="true"`)|
| 目前那一步藏在收起的、**沒有自己頁面**的大步驟裡 | **看得到的最近那一層**這種大步驟(更深的也收著時,落在最外面那一層看得到的)|
| 目前那一步藏在收起的、**有自己頁面**的大步驟裡 | 哪裡都不畫(user 2026-10-06「不如此情境收起後不代顯」)|

- 代顯 = 列上畫的不是它自己的東西,而是替藏起來的子步驟說話;**只有收起的、沒有自己頁面的大步驟會代顯**,而且灰底與列尾結果兩件一起;展開時都不代顯。沒有自己頁面的大步驟收起時灰底與列尾結果一起移上:user 2026-10-07 原話「3. 好」(回覆 AI 2026-10-07 列的第 3 點,原文:「沒有自己頁的大步驟：收起時如果你在裡面，灰底和列尾圖示一起移到大步驟上（圖 2 中排第 ③ 格）。」;待辦總帳 T4)。
- 世界級的同一做法(收起的父項替藏起來的目前項亮起,父項沒有自己的頁):Primer NavList `active={!isOpen && containsCurrentItem}`([NavList.tsx#L273](https://github.com/primer/react/blob/c4189aa896eaf53b7ce41a71150df10d757732f1/packages/react/src/NavList/NavList.tsx#L273))、Carbon SideNavMenu `hasActiveDescendant(children) && !isExpanded`([SideNavMenu.tsx#L102](https://github.com/carbon-design-system/carbon/blob/35ba5d638be2075bd4b65805a29fe6a7ad490491/packages/react/src/components/UIShell/SideNavMenu.tsx#L102))、Fluent Nav `selected = selectedCategoryValue === value && !open` 且 `aria-current`([useNavCategoryItem.tsx#L90-L92](https://github.com/microsoft/fluentui/blob/d27922755bebae866d9ffe86b7da44c27ec801ee/packages/react-components/react-nav/library/src/components/NavCategoryItem/useNavCategoryItem.tsx#L90-L92))。(Carbon TreeView 的同類指引講的是**有自己頁面**的父項,見下方「已知代價」。)
- 代顯的那一列不帶 `aria-selected`(它不能被選),帶 `aria-current="step"`;整棵樹的 Tab 停靠點在沒有記住的列時落在它(「落在選中項」的那一項)。
- 收起動畫期間,正在收起的子列已不算「看得到」,灰底不會同時出現在兩列。

### 已知代價(照實記下)

- 有自己頁面的大步驟收著時,裡面的失敗看不到;在它底下的失敗子步驟上把它收起時,位置與失敗都要展開才看得到(user 第 2 點本來就接受「收起後不代顯」)。
- **有自己頁面的大步驟不代顯,與下面兩家不同 —— 但世界級沒有共識**(2026-10-07 複審查到這兩家;同日再查 12 套,行為照 user 10-06 / 10-07 的決定,沒有改):
  - Carbon TreeView:父項(branch node)可以被選 ——「To select a branch node the user can click anywhere on the node excluding the caret icon bounding box.」([usage.mdx#L280-L283](https://github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/components/tree-view/usage.mdx#L280-L283)),也就是本規格說的「有自己頁面」;同一頁又寫「If the branch node of a selected child node is collapsed, the parent node should inherit the selected state so the user does not lose the context of what is selected, even if it is out of view.」([#L240-L242](https://github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/components/tree-view/usage.mdx#L240-L242))—— 收起時代顯。
  - Docusaurus 側欄:有自己頁面(`href`)的分類,只要目前那一頁在它底下就標成 active(`isActive(item.href, activePath) || containsActiveSidebarItem(item.items, activePath)`,[docsUtils.tsx#L164-L180](https://github.com/facebook/docusaurus/blob/021ee05058b2df769306dd717246bd5967f4845a/packages/docusaurus-plugin-content-docs/src/client/docsUtils.tsx#L164-L180);套用在分類連結上 `'menu__link--active': isActive`,[Category/index.tsx#L199](https://github.com/facebook/docusaurus/blob/021ee05058b2df769306dd717246bd5967f4845a/packages/docusaurus-theme-classic/src/theme/DocSidebarItem/Category/index.tsx#L199)、[#L283](https://github.com/facebook/docusaurus/blob/021ee05058b2df769306dd717246bd5967f4845a/packages/docusaurus-theme-classic/src/theme/DocSidebarItem/Category/index.tsx#L283))—— 收起、展開都標。
  - 反例(父項同樣有自己的頁,收起後只有目前那一列帶標示、父項不接手):Primer TreeView `aria-current={isCurrentItem ? 'true' : undefined}` 只看自己([TreeView.tsx#L393](https://github.com/primer/react/blob/da3be09cc9b28cd95e9117db0a422ab08a7e37b2/packages/react/src/TreeView/TreeView.tsx#L393));Ant Design Tree(rc-tree)`selected: selectedKeys.indexOf(key) !== -1` 只看自己的 key([treeUtil.ts#L396](https://github.com/react-component/tree/blob/b31625a1c219c980056d473fe189dfa4334c2712/src/utils/treeUtil.ts#L396))。同日共查 12 套「父項有自己的頁」的實作:依實作只有 Docusaurus 與 VitePress 兩個文件站框架會標,而且用比目前那一頁弱的樣式;上面 Carbon 那句只寫在規範、它的元件沒有做;其餘多數不標,另一套不讓這種父項收起(逐套出處與行號記在待辦總帳 T3)。所以「不代顯」是世界級做法之一,不構成違背;本規格「不代顯」來自 user 2026-10-06「2. 我覺得每種做法都有缺點，不如此情境收起後不代顯」與 10-07「2. 我覺得是這樣,確保不違背世界級的設計…」。
- 選填、可以跳過的子步驟沒有結果 → 它所在的大步驟收起後永遠不會變成功勾。產品不要為了讓它變綠把跳過的步驟交成「成功」(那會在子步驟上畫一個沒做的勾)。

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
| `Enter` / `Space` | 選取 =「到那一步」(等同點擊 label 會去的地方;`expandOnSelect` 連帶的展開與開合僅限指標點擊)。步驟導覽樹:沒有自己頁面的大步驟、目前那一步不在裡面 → 到第一個能前往的子步驟,沿路收著的大步驟只展開(永不收合)、焦點跟過去;目前那一步已在裡面 → 不動(原地展開 / 收合一律 `→` / `←`)。見「步驟導覽樹」 |
| `Tab` / `Shift+Tab` | **一下就離開整棵樹**(別列、本列的按鈕都不在 Tab 路上) |
| 打字(可見字元) | **打字跳位**(2026-09-29,待辦總帳 N46;`ds-canonical/references/keyboard-model-canonical.md` 五條判準第 2 條把「打字前導」列為樹必備):焦點移到**下一個**名字以該字開頭的可見列(從目前這一列的下一列往後找,到底繞回第一列;折疊大小寫);1 秒內連打多個字 = 以整串比對(「fr」→ Frontend);連打同一個字母而沒有名字以「bb」開頭時退回單字循環(在同字母的列之間輪流)。`Space` 不算(它是選取)。一手:W3C APG Tree View 逐字 "Type a character: focus moves to the next node with a name that starts with the typed character." / "Type multiple characters in rapid succession: focus moves to the next node with a name that starts with the string of characters typed."(<https://www.w3.org/WAI/ARIA/apg/patterns/treeview/>);1 秒的累積窗與同字母退回是 AI 推導。閘:`scripts/tree-view-keyboard-route-invariant.mjs` K1(真按鍵)+ `scripts/test-tree-keyboard-route.mjs`(判定表) |
| `Cmd/Ctrl+Shift+↑` / `↓` | 重排:同層上移 / 下移(僅 `draggable` 時;詳「Drag and Drop → 鍵盤重排」) |
| `Cmd/Ctrl+Shift+→` | 重排:移入上一個 sibling(需為 folder;收合時自動展開) |
| `Cmd/Ctrl+Shift+←` | 重排:移出,成為 parent 的下一個 sibling |

**列被刪掉時焦點接力**(2026-09-29,待辦總帳 N46「刪除 / 消失後焦點去下一項」):consumer 從資料裡拿掉節點時,焦點若在那一列(或它的按鈕)上,接力到畫面順序的**下一個可見列**(可能是下一個頂層節點);沒有下一列 → **上一個可見列**(可能就是父節點);禁止掉到 `body`。落點順序同 `../FileUpload/file-upload.spec.md`「移除焦點」(下一個 → 上一個 → 擁有者)。收合中的分支不算候選(整段子樹一起卸載,落點是收合的那個父節點)。實作 = `tree-view.tsx` TreeItem 的 layout-effect cleanup(節點拆掉前鄰列都還在);驗證 = `tree-view.stories.tsx`「刪除後焦點接力」(play 實刪四次)。

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
| TreeItem 的列 | `role="row"`(`tabIndex` 0 = 停靠點 / -1) | `aria-level`,`aria-expanded`(expandable 才有),`aria-selected`(`selectionMode≠none`;`selectable={false}` 的列不帶),`aria-disabled`,`aria-labelledby` → 自己的 label(列名只取 label,不併入按鈕名);步驟導覽樹另有 `aria-current="step"`(灰底那一列,含收起時代顯的大步驟)與 `aria-describedby` → 步驟結果的讀屏文字(見「步驟結果」)|
| 主格 / 動作格 | `role="gridcell"` | 動作格裡每顆按鈕 `tabIndex=-1`、**必須有可讀名稱**(`inlineActions` 由 `label` 給 `aria-label`;`inlineActionsSlot` 缺名稱時 dev 模式 `console.warn`)。步驟結果住在主格最後(圖示 `aria-hidden` + sr-only 文字,列的 `aria-describedby` 指過去) |
| TreeItem children 容器 | 無角色(2026-09-25 前是 `group`;樹狀表格的列之間不允許 `group`) | — |

---

## 視覺狀態

TreeItem row 有 5 種狀態:default / hover / focused(鍵盤) / selected / disabled。**hover 和 selected 的視覺跟 MenuItem 一致**——因為 tree item 和 menu item 本質上是同一類互動行(用 item-layout 結構),共用 `neutral-hover` / `neutral-selected` state token。

完整 state × token 對照見 anatomy `ColorMatrix` story(Row 四態色彩 Token)。

步驟導覽樹裡 selected 的灰底就是「你在哪」;目前那一步藏在收起的、沒有自己頁面的大步驟裡時,那個大步驟用同一組 selected 視覺代顯(見「步驟結果 → 灰底」)。

---

## Icon 一致性原則

**有用 icon 就全面用,否則考慮 tree guide。**

| 策略 | 適用 | 視覺效果 |
|---|---|---|
| **全 icon** | node 有明確的類型差異(folder/file、page type) | icon 是層級的主要視覺指引,每個 node 一眼可辨識 |
| **全無 icon** | node 類型單一(全部是「頁面」或「步驟」),不需要類型區分 | 靠 indent + chevron 表達層級;深層考慮開 tree guide |
| ❌ **混用** | — | icon 無自動佔位(見「佔位規則」),有 icon / 無 icon 的 node label 起始位置直接錯開 |

步驟結果不是類型 icon,不放列首(放列尾,見「步驟結果」):只有部分列有結果,放列首就成了本表禁止的混用(2026-10-07 前本表「全 icon」列寫著 step status)。

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
| `indicator` | `ReactNode` | 取代 **icon** 位置(chevron 永存),consumer 自訂的前方記號。**步驟結果不走這裡**(2026-10-07 前這一列寫「Stepper 狀態視覺由此傳」,範例用它畫了三種前方狀態,已改為下面的 `status`)|
| `selectable` | `boolean`(預設 `true`)| `false` = 這一列不能被選。步驟導覽樹的**沒有自己頁面的大步驟**(見「步驟導覽樹」);只用在有子步驟的列 |
| `status` | `'completed' \| 'error'` | 步驟導覽樹:這一列**自己那一頁**的結果;不給 = 還沒有結果(不畫)。只給有自己頁面的列(見「步驟結果」)。與 FileItem `status` 同一組字(`ds-canonical/references/props-naming.md`「lifecycle」那一族)|

**情境消費範例**(Sidebar nav / File browser / Stepper)由 stories.tsx 承載,不在本 spec 重複貼 code。

**Drag preview 寬度**:`truncate max-w-[200px]` — 拖長檔名時防 preview 遮 drop target。200px 為 TreeView 專用 layout 常數(非跨元件 token);跟 Tag 的 max-w-40 相關但不同,tree label 通常比 tag 長需稍寬。

---

## 禁止事項

- ❌ 不得在 TreeItem 內嵌套非 TreeItem 的 children——children slot 只接受 TreeItem(遞迴結構)。步驟導覽樹尤其如此:收起的子樹不掛載,沒有自己頁面的大步驟是從 children 讀出子步驟的(TreeItem、Fragment、陣列、條件渲染讀得到);包一層元件的子步驟讀不到 —— 它的失敗不會算進收起時的代顯、點大步驟也找不到它(開發模式 `console.warn`)
- ❌ 不得用 `indicator` 畫步驟結果——用 `status`(列尾、只畫成功 / 失敗,見「步驟結果」)
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

**ARIA / Pattern**:自建 ARIA **樹狀表格**(2026-09-25 由 `tree` 改,總帳 B9)。容器 `role="treegrid"`(多選時加 `aria-multiselectable`),每個 node 的列 `role="row"` + `aria-level` / `aria-expanded`(expandable 才有)/ `aria-selected` / `aria-labelledby`(步驟導覽樹另有 `aria-current="step"` 與步驟結果的 `aria-describedby`),列裡是 `gridcell`(主格 + 動作格),皆由元件手動設定(`tree-view.tsx` TreeItem render;完整對照見上方「ARIA」表)。Radix Collapsible([`packages/react/collapsible`](https://github.com/radix-ui/primitives/tree/f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae/packages/react/collapsible))僅用於 children 展開 / 收合的高度動畫,**不提供**任何角色 / aria / 鍵盤導覽。為什麼是樹狀表格:W3C 只在樹狀表格定義了「列裡有按鈕時鍵盤怎麼走」([treegrid-pattern.html#L62-L80](https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/treegrid/treegrid-pattern.html#L62-L80)),一般樹的頁面沒有;Adobe 的樹同樣是 `treegrid`([useTree.ts#L57](https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/tree/useTree.ts#L57))。讀螢幕軟體會念成「樹狀表格」—— **未用讀螢幕軟體實測**。`aria-setsize` / `aria-posinset` **刻意省略**:只有當列未全數 render 進 DOM(lazy load)或 DOM 序 ≠ 閱讀序時才必需;本元件可見列皆在 DOM 且 DOM 序 = 閱讀序。

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

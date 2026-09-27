# Keyboard Model Canonical(一串東西該怎麼用鍵盤走)

跨元件 SSOT:**一串並排的東西,使用者是用 Tab 一個一個走,還是 Tab 一次進去、再用方向鍵在裡面走。**

起因是 user 2026-09-24 的追問:「這個也要追根究底不一樣的合理理由吧?世界級的設計是怎樣?真的需要不同的鍵盤操作?
為何一個是按 tab 上下移動一個是按上下?這樣鍵盤的操作方式是否不一致?同一套世界級的設計系統會這樣不一致嗎?」

## Authority boundary

本檔擁有**「這一串該用哪一種鍵盤模型」的判準**,以及該判準的一手出處;
2026-09-25 起也是**「彈出框開著時按 `Tab` / `Esc` 做什麼、關了之後焦點去哪」的單一住所**(「彈出框開著時的 Tab 與 Esc」一節;`focus-canonical.md` 只放指標)。
它不擁有:焦點框長什麼樣、畫在哪(owner = `focus-canonical.md`)、命中區多大(owner = `hit-area-canonical.md`)、
各元件的實際按鍵表(owner = 各元件 `spec.md` 的「A11y 預設」段)、
列裡誰當那顆控件(owner = `patterns/element-anatomy/item-anatomy.spec.md`「整列可點時,誰當那顆控件」)。

**兩份文件合起來是一條完整的鎖**:建新列元件時走該節的**四題判定程序**,
而那個程序的**第 1 題就是本檔的五條判準**(這一串是 N 個獨立的東西,還是 1 個控件的內部)。
先前兩份文件各自正確卻沒接起來,2026-09-24 補上。
與 `focus-canonical.md` / `hit-area-canonical.md` / `drag-canonical.md` 同層級、同形狀(一個能力、一份跨元件契約)。

## 先講結論:兩種模型並存是世界級的常態,不是不一致

同一個側邊欄裡同時出現兩種鍵盤模型,**不是漂移,是業界標準做法**,而且可以在原始碼層驗:

VS Code 的側邊區在同一個畫面裡就有三種模型並存 ——
活動列是 `ariaRole: 'tablist'`(`src/vs/workbench/browser/parts/compositeBar.ts`,<https://github.com/microsoft/vscode/blob/c94d3d7ed24463a41ab03d629b4ee76f6cd901f2/src/vs/workbench/browser/parts/compositeBar.ts#L308>;釘 2026-09-27 抓到的 main HEAD),item 只有將被聚焦時才拿到 `tabIndex = 0`,
整條是**一個 Tab 停靠點 + 方向鍵**;
檢視區段標題每一條自己 `setAttribute('tabindex','0')` + `role="button"`(`src/vs/base/browser/ui/splitview/paneview.ts`,<https://github.com/microsoft/vscode/blob/c94d3d7ed24463a41ab03d629b4ee76f6cd901f2/src/vs/base/browser/ui/splitview/paneview.ts#L260-L262>;同上釘 commit),
所以**每一條都是獨立 Tab 停靠點**;
區段裡的檔案樹容器 `tabIndex = 0` + `role="tree"` + `aria-activedescendant`(`src/vs/base/browser/ui/list/listWidget.ts`,<https://github.com/microsoft/vscode/blob/c94d3d7ed24463a41ab03d629b4ee76f6cd901f2/src/vs/base/browser/ui/list/listWidget.ts#L2081>;同上釘 commit),
又回到**一個停靠點 + 方向鍵**。

而且 VS Code 官方文件把取捨講得很白(`docs/configure/accessibility/accessibility.md`,<https://github.com/microsoft/vscode-docs/blob/f54680b98bd1c3da7227cf0fa837b3c4c90f5075/docs/configure/accessibility/accessibility.md#L129>;釘 2026-09-27 抓到的 main HEAD,逐字):

> "All elements in the workbench support tab navigation. To avoid having too many tab stops, workbench toolbars and tab lists each have only one. Once a toolbar or a tab list has focus, you can use the arrow keys to navigate within them."

讀出來就是:**預設每個東西都可以 Tab,只有為了避免停靠點太多才把某些東西收成一個。**
所以「收成一個」是需要理由的那一邊。

**本 DS 收成一個的理由只有兩種**(2026-09-25 改寫;原句「『各自一個』才是預設」是支持「側欄每項一站」的推論,已隨 user 拍板的路線乙撤回):

1. **它是一個 composite 小工具** —— 樹、選單、表格、單選組…(下方「五條判準」與「套到本 DS」表)。
2. **一串項目的列上帶小按鈕**(側欄、樹、檔案清單的 ⋯ / ＋)—— 每一項、每一顆按鈕都各佔一站時,W3C 的原話是鍵盤使用者「等於被困在清單裡」:
   "If elements in a list like this were in the tab sequence, keyboard users are effectively trapped in the list. If any elements in the group also have associated elements that appear on hover, the `grid` pattern is also useful for providing keyboard access to those contextual elements"
   (<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/grid/grid-pattern.html#L157-L158>)。
   規則見下方「列上有小按鈕的一串」(user 2026-09-25 拍板「路線乙」;側欄「混合內容」範例實測今天要按 19 下才出得去)。

GitHub 同一個 repo 頁面上也是並存:左邊檔案樹是 `role="tree"` 的 roving tabindex 單一停靠點,
同一頁的 repo 導覽(Code / Issues / PRs)是純連結、帶 `aria-current="page"`、每個各自一個停靠點。
**並存本身仍是常態**:沒有列上按鈕、也不是 composite 的一排東西(頁面導覽連結、工具列外的獨立按鈕)照舊各自一站。

## 判準

### ⚠️ 先講規範**沒有**給的東西(這一段比判準本身重要)

WAI-ARIA 只給了**後件**:一旦你宣告 `role="tree"` / `listbox` / `menu` …,
§4.3.1 就是 "Authors MUST manage focus on the following container roles"、
`composite` 就是 "SHOULD ensure that a composite widget exists as a single navigation stop"。

**前件 —— 什麼時候該宣告成 tree —— 規範完全沒有寫公式。**
所以任何「規範規定這種東西要用方向鍵」的說法都是假的。規範規定的是:
**你說它是 tree,它就必須是單一停靠點。**

下面三問是**本檔從三家原文歸納出來的**(APG 的 Caution + GitHub 的量級論證 + Primer 的三前提),
三家沒有任何一家把它們並列寫成一張表。引文都是真的,**組裝成判準是本檔的動作**,
不得寫成「規範規定」。

### ⛔ 「是不是連結」與焦點模型**完全無關**(2026-09-24 撤回錯判準)

我先前寫過兩版判準,兩版都錯,而且都是倒推的:

1. 「有沒有『目前選到哪一個』的狀態」—— 側欄純連結本來就有(`aria-current`),照這條判會把所有導覽誤判成方向鍵。
2. 「右鍵能不能『在新分頁開啟』」—— **這條錯得更徹底。**

user 逐字戳破第 2 條:「你他媽每個節點也有可能有自己的連結啊,你他媽不要再導果為因」。

**一手反證就在 W3C APG 自己的範例裡**(<https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-navigation/>):

```html
<ul class="treeview-navigation" role="tree" aria-label="Mythical University">
  <li role="none">
    <a role="treeitem" href="#home" aria-current="page"><span class="label">Home</span></a>
```

`role="treeitem"` 直接**覆寫在 `<a>` 上**,`<li>` 反而被 `role="none"` 抹掉 ——
也就是說,**連結本身就是 treeitem**。而同一頁的屬性表逐字:

> "The tree element is not focusable because it implements the practice described in Managing Focus Within Components Using a Roving tabindex."
> "Only one `treeitem` in the `tree` has `tabindex="0"`." / "In this implementation `tabindex="0"` is always on the `treeitem` with `aria-current="page"`."

**一串貨真價實的連結,照樣是單一 Tab 停靠點 + 方向鍵。**
連結性決定的是「按下去會發生什麼」與「瀏覽器附送什麼」(複製網址、開新分頁、右鍵選單),
跟「焦點怎麼移動」是兩條正交的軸。

Primer 的 TreeView 也支援 `as="a" href=…`(`packages/react/src/TreeView/TreeView.tsx` 的 polymorphic 分支,<https://github.com/primer/react/blob/67945828439898ace865bd5f7417c562033bcbc2/packages/react/src/TreeView/TreeView.tsx#L132> 是 `useRovingTabIndex` 的呼叫點
+ `TreeView.features.stories.tsx` 的 `AsProp` story,<https://github.com/primer/react/blob/67945828439898ace865bd5f7417c562033bcbc2/packages/react/src/TreeView/TreeView.features.stories.tsx#L1114>;釘 2026-09-27 抓到的 main HEAD),焦點仍走 `useRovingTabIndex`。

### ⛔ 「在不在側邊欄」不是分界(2026-09-24 撤回一次誤讀)

**側邊欄是一塊版面,不是一種語意。** 同一塊側邊欄裡可以有數種語意不同的區段,各取各的角色。

我先前引 Primer 的兩句話,寫得像「側邊欄不能有樹」。**那是誤讀,而且是兩層誤讀:**

1. 原文是 "global sidebar navigation"(**全站主導覽**),我只記住了 "sidebar navigation"(`content/components/tree-view.mdx`,<https://github.com/primer/design/blob/87f799f202ec95df15c99f473c9c0c803da8e6b3/content/components/tree-view.mdx#L280>;釘 2026-09-27 抓到的 main HEAD)。
2. 原文是 "Do not replace your NavList with a tree view **to support a deeply nested navigation
   structure**"(禁的是「為了突破 4 層上限而換成樹」),我只記住了後半句(`content/components/nav-list.mdx`,<https://github.com/primer/design/blob/87f799f202ec95df15c99f473c9c0c803da8e6b3/content/components/nav-list.mdx#L142-L144>;同上釘 commit)。

⚠️ **這個形狀 2026-09-24 一天內差點發生三次**(Primer 兩句 + 差點裸引 Carbon 的「As the primary navigation」)。這不是鍵盤專屬的毛病,**通則住在 meta-patterns M22 的「引用『不要拿 X 當 Y』必須帶 Y 的範圍」子款**,本檔不重述判準,只留這三筆實例。

**Primer 同一個 repo 的另一份文件正面寫著相反的話** —— `content/ui-patterns/navigation.mdx`
(<https://github.com/primer/design/blob/87f799f202ec95df15c99f473c9c0c803da8e6b3/content/ui-patterns/navigation.mdx#L127>、`#L150`;同上釘 commit)
把 Tree view 與 Nav list 並列在同一章,兩者的句子**一模一樣**:

> Tree view:"it's often used to implement a parent-detail navigation pattern.
> **It's often used in the sidebar of a split page layout.**"
> Nav list:"A vertical list of links... **It's often used in the sidebar of a split page layout.**"

`tree-view.mdx` 的 Composition 章再講一次:"A common pattern is to render a tree view in a
**split page layout where the tree view is in the left pane**"(<https://github.com/primer/design/blob/87f799f202ec95df15c99f473c9c0c803da8e6b3/content/components/tree-view.mdx#L423>);它列的「好的使用情境」第一條就是
"navigating the file structure of a repo"(同檔 `#L270`)—— 那正是 GitHub code view 的左側 pane。

### 真正的軸:landmark 與 widget 是兩條不互斥的軸

WAI-ARIA 逐字:

> `navigation` — "**A landmark** containing a collection of navigational elements (usually links)…" (Superclass: `landmark`)
> `tree` — "A widget that allows the user to **select** one or more items from a hierarchically organized collection." (Superclass: **`select`** → `composite`)

**一個是 landmark、一個是 widget,所以可以嵌套。** GitHub 就是這樣做的:
`<nav aria-label="File Tree Navigation">` 裡面包 `<ul role="tree" aria-label="Files">`。
「側邊欄能不能有樹」是錯的問法;正確問法是 **「這一段是不是一個階層式的選取小工具」**。

### 五條判準(同時滿足才是樹)

| # | 判準 | 一手依據 |
|---|---|---|
| 1 | **節點是被選取並被施加動作的對象**,不只是目的地(改名 / 搬移 / 刪除 / 多選批次)| ARIA `tree` 的 superclass 就是 `select`;W3C APG 逐字 "select any number of files **for an action, such as copy or move**";Primer "navigate through, **select, and take action on** one or more items" |
| 2 | **確實需要 tree 那一整套鍵盤模型**(打字前導、Home/End、任意深度 ArrowLeft 回父節點、多選)| APG Navigation Treeview 的 Caution 逐字:"**few sites need the additional keyboard functionality required to support the ARIA `tree` role**";不需要 → 用 **disclosure pattern** |
| 3 | **深度說不出上界** | Primer NavList "**Up to 4 levels of nesting are supported**";Apple HIG "**no more than two levels of hierarchy in a sidebar**";Carbon「只有一層 → 用 accordion」。對照:Notion "nest pages inside other pages **with no limit**" |
| 4 | **內容由使用者產生,且可以就地被改動**(改名 / 拖曳重排 / 新增 / 刪除)| Apple HIG Outline views "**let people reorder, add, and remove rows**";VS Code Explorer 開了 `dnd` 與 `isEditable`;Notion 拖曳巢狀 + hover `+` 建子頁 + `•••` 刪除 |
| 5 | **啟動節點不保證換 URL** | Primer 逐字:NavList "Activating a nav list item **should change the URL**" vs TreeView "**may or may not** change the URL" |

**反過來,某一段該是導覽清單**:項目是產品自己定義的**固定目的地**、啟動一定換 URL、
深度有界(2–4 層,用 disclosure 收合)、使用者只能前往不能改動項目本身。

**量級不是判準**(這是本檔先前的第三問,已降級)。查無任何一手來源拿項目數當 tree/nav 的分界;
APG 的 ">7 root nodes" 是「樹**要不要**加打字前導」的門檻,不是「該不該用樹」的門檻。
量級只決定後續設計要求:樹要加打字前導與搜尋,清單要加分組與分隔線。

### 三個實例

| | 導覽清單那一段 | 樹那一段 |
|---|---|---|
| **Notion** | Search / Home / Inbox / Meetings / Library —— 官方稱 "top-level tabs","Each tab has its own icon, contents, and purpose",動詞一律 "Click to …" | Teamspaces / Shared / Private 的頁面階層 —— 無限層、拖曳重排、hover `+` 建子頁、`•••` 刪除 |
| **VS Code** | 活動列 `role="tablist"`;區段標題 `role="button"` + `aria-expanded` | Explorer `role="tree"` + `aria-level`,且開了多選、打字前導、拖曳、就地改名 |
| **GitHub** | repo 導覽 `<nav aria-label="Repository">` 的 UnderlineNav(Code / Issues / PRs)| code view 檔案樹 `<nav aria-label="File Tree Navigation">` 內含 `<ul role="tree">` |

**三個實例都成立同一件事**:上半段是「產品定義的固定目的地」→ 導覽語意;
下半段是「使用者自己長出來、自己能改的階層」→ 樹語意。
**中間那道線是「誰產生這些項目、使用者能不能改動它們」,不是「離側邊欄頂端多遠」。**

### 套到本 DS 的側欄

我們的 `sidebar.spec.md` 決策樹本來就寫對了:
「designer 1 層固定導覽 → SidebarMenu」「user data / 階層 / 可新增 → TreeView」
「兩者都有 → SidebarMenu + TreeView 分區」。**那正是上面五條的機械版本**,
只是先前沒有寫出依據。本節補上依據,決策樹不變。

### `aria-current` 與 `aria-selected` 是兩件事,而且可以同時出現

WAI-ARIA 1.2 `aria-current` 定義裡的 Note 逐字(<https://www.w3.org/TR/wai-aria-1.2/#aria-current>):

> "In some use cases for widgets that support aria-selected, current and selected can have different meanings and can both be used within the same set of elements. For example, aria-current=\"page\" can be used in a navigation tree to indicate which page is currently displayed, while aria-selected=\"true\" indicates which page will be displayed if the user activates the treeitem."

同段另寫:"Authors SHOULD NOT use the aria-current attribute as a substitute for aria-selected in widgets where aria-selected has the same meaning"。

講人話:
- `aria-current="page"` = **你現在人在這一頁**(已經發生的事實)
- `aria-selected` = **這個控件裡目前被挑中的那一項**(你按 Enter 會去的地方 / 鍵盤游標所在)

W3C APG「Focus VS Selection and the Perception of Dual Focus」逐字:
"Focus and selection are quite different. From the keyboard user's perspective, focus is a pointer, like a mouse pointer; it tracks the path of navigation."

Primer TreeView 的原始碼就是照這條寫的:同一個 treeitem 上
`aria-current={isCurrentItem ? 'true' : undefined}` 與 `aria-selected={isFocused ? 'true' : 'false'}` 兩個屬性並列
(<https://github.com/primer/react/blob/67945828439898ace865bd5f7417c562033bcbc2/packages/react/src/TreeView/TreeView.tsx#L393-L394>)。
它的 roving tabindex `focusInStrategy` 第一順位是「Focus the aria-current item if it exists」——
從外面 Tab 進樹時,焦點直接落在「你現在在的那一頁」。W3C APG Navigation Treeview 範例原始碼註記同樣寫著
"Only one treeitem in the tree has tabindex=\"0\"" / "In this implementation tabindex=\"0\" is always on the treeitem with aria-current=\"page\""。

## 套到本 DS

| 元件 | 五條裡命中哪幾條 | 模型 |
|---|---|---|
| `SidebarMenu` / `SidebarMenuButton` | **一條都不命中** —— designer 定義的固定目的地、啟動一定換頁、層數有界、使用者不能改動項目本身 → **語意仍是導覽清單,不是樹** | **一串(一個 `SidebarMenu`)一個 Tab 停靠點** + `↑` `↓` 換項 + `→` 進這一項的小按鈕、`←` 回項目,`Tab` 一下離開這一串(2026-09-25 user 拍板路線乙,理由是「列上有小按鈕」而**不是**五條判準,見下方「列上有小按鈕的一串」;2026-09-24 版為「每項一個 Tab 停靠點,無方向鍵」,已撤回)|
| `TreeView` | **五條全中** —— 節點可選取並施加動作、需要打字前導與任意深度回父節點、深度無上界、使用者自己新增與拖曳重排、啟動不保證換 URL | **樹狀表格(`role="treegrid"`)身分,整棵樹一個 Tab 停靠點(列上的 roving tabindex,容器不可聚焦)+ 方向鍵**;列上的小按鈕用 `→` 進(收著的資料夾先展開)、`Tab` 一下離開(2026-09-25 路線乙,見下方「列上有小按鈕的一串」;2026-09-24 版身分為 `role="tree"`、DOM focus 永遠停在容器(`aria-activedescendant`),別列的隱藏按鈕仍在 Tab 路上 —— 已隨 B9 改掉)|
| `FileUpload` 內的 FileItem 清單 | 不適用(不是階層,也不是 composite 小工具) | **一串一站** + `↑` `↓` 換項 + `→` 進這一項的按鈕,`Tab` 一下離開(路線乙,同上)|
| `SelectMenu` / `DropdownMenu` / `TimePicker` 的欄 | 命中 1、2、5 —— 選單項是該選單的值 | **容器單一停靠點 + 方向鍵 / `aria-activedescendant`** |
| `DataTable`(`role="grid"`)| 命中 1、2 —— 格是表格的值 | **容器單一停靠點 + 方向鍵** |

**注意這張表沒有「是不是連結」也沒有「在不在側邊欄」那兩列** —— 兩者對結論都零貢獻(見上方兩個 ⛔ 段)。
側欄導覽項是連結,W3C APG Navigation Treeview 的 treeitem 也是連結;側欄可以同時裝這兩種,Notion / VS Code / GitHub 都是。

**兩者在同一個側欄並存完全合規**,`sidebar.spec.md` 的決策樹「兩者都有 → SidebarMenu + TreeView 分區」對齊 VS Code 的三模型並存。

## 列上有小按鈕的一串:一串一站 + 方向鍵(2026-09-25 user 拍板「路線乙」)

**user 原話(逐字,附條件同意)**:「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」
(待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` B9)。
條件(世界級 + DS 一致)的查證是 **AI 研究**,結論記在同一列:乙 = Adobe 正式版樹 / 清單的預設、W3C 對「滑過才出現的按鈕」的建議、
微軟側欄 Tab 一下離開;**乙不是唯一做法**(GitHub / IBM / Atlassian 的側欄是每項一站),但不違背世界級。

### 規則

| 鍵 | 焦點在項目上 | 焦點在這一項的小按鈕上 |
|---|---|---|
| `↑` `↓` | 上一項 / 下一項;到頭尾停住,不繞回 | 回到上一項 / 下一項(焦點落在項目上)—— **AI 推導**,依 Adobe 方向鍵模式與 Fluent List(見下);**會開選單的小按鈕也一樣**,開選單用 `Enter` / 空白鍵(樹與側欄原本不一致,統一成側欄做法 —— 待辦總帳〇節 X6) |
| `Home` / `End` | 第一項 / 最後一項 | 同左(焦點落在項目上)—— 三處原本不一致,統一成側欄做法(待辦總帳〇節 X4) |
| `→` | 樹裡收著的資料夾 → 先展開(待辦總帳 B9);否則 → 進這一項的第一顆小按鈕(沒有按鈕就不動) | 下一顆小按鈕 |
| `←` | 樹:照樹的規則(展開的先收合、否則回父節點);平面清單:不動 | 上一顆;已在第一顆 → 回項目 |
| `Tab` / `Shift+Tab` | **一下就離開這一串**(往下 / 往上一站) | 同左 —— 一下就離開這一串(焦點先回項目、再由瀏覽器往外走一站;樹的 `Shift+Tab` 原本要兩下,統一成側欄做法 —— 待辦總帳〇節 X7) |
| `Esc` | 不是離開這一串的鍵(查到的每一家都不是) | **本檔不規定**(未拍板;Fluent List 的做法是回項目:「`Esc` focuses the parent list item」)|

- **別項的小按鈕一律不在 Tab 路上**(`tabIndex=-1` 或不渲染);**鍵盤走到的那顆按鈕必須看得見**(滑過才出現的按鈕,焦點進來時要顯示 —— AI 推導,依 Fluent / VS Code 的樹)。
- **從外面 Tab 回來,落在上次停的那一項**;沒停過 → 目前這一頁那一項(有 `aria-current` 時;樹是選中的那一列)或第一項
  (W3C:"The element that had focus the last time the composite contained focus. Or, if the composite has not yet contained the focus, the first element." <https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/practices/keyboard-interface/keyboard-interface-practice.html#L270-L277>;
  導覽樹範例 "when tabbing into the tree, focus always lands on the item representing the current page." <https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/treeview/examples/treeview-navigation.html#L344-L345>)。
- **一鍵跳出整個側欄(F6 那一類)另談**,不在本條(見下方「還沒做」)。
- **實作只有一份**:按鍵判定 + 落點 + Tab 停靠點 + 真焦點宿主的執行 = `src/lib/roving-list-keyboard.ts`(2026-09-26 由 `SidebarMenu`、`FileUpload` 檔案清單、`TreeView`、`Command` 四份平行實作合一,待辦總帳〇節「按鍵規則合併」);
  各宿主只讀自己的 DOM(誰是項目、項目裡有哪些東西)。判定表 `scripts/test-roving-list-keyboard.mjs`(含合併前 X4 / X6 / X7 不一致的對照組)。
  宿主一律在**捕獲階段**接鍵,所以項目裡的選單鈕自己的 `↓` 搶不到(上表 X6);項目裡的輸入框保留自己的方向鍵與打字,`Tab` 仍一下離開。

### 適用範圍 —— 只有這些

- `SidebarMenu`(每個 `SidebarMenu` 是一串)與側欄捲動區多出來的那一站(改傳 `viewportTabIndex={-1}`,`components/ScrollArea/scroll-area.spec.md`「鍵盤捲動」段的 `viewportTabIndex={-1}` opt-out)。
- `TreeView`(身分改樹狀表格,見下節)與「樹裡別項的隱藏按鈕也在 Tab 路上」這個既有缺陷。
- `FileUpload` 內的 FileItem 清單。
- 待辦總帳 B9 點名的:AgentPanel 對話紀錄的每一列(改名 / 刪除)、PeoplePicker 多選清單裡每個人的頭像(今天各佔一站)。
- **其他元件都不在本條**。把「一串一站 + → 進按鈕」套到別類東西(資料表格的列、分頁、Chip 列、月曆事件、工具列…)
  是一個新的設計主張(meta-patterns M8「跨類別外推本身就是新主張」),要重新查證、由 user 拍板,不得以「同一條規則」直接搬過去。

### 一手依據

- W3C 通則:"the tab sequence should include only one focusable element of a composite UI component."
  (<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/practices/keyboard-interface/keyboard-interface-practice.html#L264>)
- W3C grid:整串只佔一站,滑過才出現的按鈕用方向鍵摸到(上方「先講結論」引文,`grid-pattern.html#L157-L158`)。
- Adobe(正式版樹 / 清單的預設就是乙):"By default, TreeView uses arrow key navigation to move focus into rows. Set `keyboardNavigationBehavior="tab"` to have Tab move focus in and out of a row. Use this when rows contain interactive elements such as text fields…"
  (<https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/dev/s2-docs/pages/s2/TreeView.mdx#L391-L392>);
  測試:→ 進列內按鈕、↓ 換列、Tab 整串離開(<https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria-components/test/GridList.test.js#L1090-L1130>)。
- Fluent List(微軟):"`Right arrow` enters the first focusable element inside the current list item"、"`Tab` goes to the next focusable item after the List"、"`Esc` focuses the parent list item"
  (<https://github.com/microsoft/fluentui/blob/d27922755bebae866d9ffe86b7da44c27ec801ee/packages/react-components/react-list/stories/src/List/ListDescription.md#L66-L75>)。
  微軟自己的側欄(Fluent Nav)實測 Tab 一下就離開(官方線上 Storybook「Components/Nav → Split Nav Items」,2026-09-25 實測,未釘版本)。
- **反例(誠實列出)**:IBM Carbon 側欄 "All items can be reached by Tab"(<https://carbondesignsystem.com/components/UI-shell-left-panel/accessibility/>);GitHub、Atlassian 的側欄也是每項一站。乙不是唯一做法。
- **跟 DS 一致**:月曆日期格、分頁、單選組早已是「一站 + 方向鍵」;選單的新規則(下方「彈出框開著時的 Tab 與 Esc」)是同一句話 ——
  **Tab 換到下一區,方向鍵在區裡移動,Esc 往回退一步**(這句話是 AI 的歸納,不是任何一家的原文)。

### `TreeView` 改用樹狀表格(treegrid)身分

- 理由:W3C 只在樹狀表格定義了「列上的按鈕」,一般的「樹」那一頁 Tab 鍵出現 0 次;Adobe 正式版的樹也是這個身分
  (`gridProps.role = 'treegrid'`,<https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/tree/useTree.ts#L57>)。
- 樹狀表格的 `→`:"If focus is on a collapsed row, expands the row. If focus is on an expanded row or is on a row that does not have child rows, moves focus to the first cell in the row."
  (<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/treegrid/treegrid-pattern.html#L66-L69>)——
  也就是**在已展開的資料夾上按 `→`,走進這一列的小按鈕,不再跳到第一個子項**(第一個子項照樣用 `↓` 到得了)。
  這一點改掉 `components/TreeView/tree-view.spec.md` 現行的「→ 到第一個子節點」,由 TreeView 的 owner 落地。
- 鐵律照舊(下方「宣告了 composite 角色,就必須真的實作那套鍵盤」):寫上 `treegrid` 就要實作樹狀表格的鍵盤,
  `scripts/composite-role-keyboard-invariant.mjs` 把關。讀螢幕軟體會念成「樹狀表格」—— 未用讀屏實測。

## 彈出框開著時的 Tab 與 Esc(2026-09-25 user 拍板;跨元件單一住所)

`focus-canonical.md` 只管焦點框怎麼畫;**彈出框開著時按 `Tab` / `Esc` 做什麼、關了之後焦點去哪,住在這一節**,其他文件只放指標。

**user 原話(逐字,附條件同意)**:選單 Tab:「你確定這個符合我們一致的設計語言且不違背世界級的設計就這樣做」;
子選單 Esc:「你確定這符合我們一致的設計語言且不違背世界級的設計就這樣做」;
追問:「看最後是怎樣定義，選單類應該要一致吧？這樣才符合世界級的設計？」
(待辦總帳 B10 / B11)。條件的查證是 AI 研究;單選下拉一併收起是 AI 為了滿足「選單類要一致」這個條件而做的延伸,已在回覆明寫,**user 可在預覽否決**(待辦總帳 B11)。

### 彈出框開著時按 `Tab`

先分兩類 —— W3C 就是這樣分的:彈出來的是**一串選項**,`Tab` 收起並離開;彈出來的是**一個有好幾個東西要填、要按的小面板**,`Tab` 在裡面輪流。

| 類 | 本 DS 的例子 | 開著按 `Tab` / `Shift+Tab` | 一手依據 |
|---|---|---|---|
| **選單** | `DropdownMenu`(含子選單,以及用它的帳號選單、麵包屑、分頁溢出、Chip 溢出、表格欄位選單、檔案檢視器縮放、AI 浮鈕右鍵選單)| **收起全部層**,焦點從**觸發鈕**往下 / 往上走一站 | W3C:"When focus is on a `menuitem` in a `menu` or `menubar`, move focus out of the `menu` or `menubar`, and close all menus and submenus."(<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/menubar/menu-and-menubar-pattern.html#L82>);Fluent 測試 "should be able to tab to next element after the root trigger"(<https://github.com/microsoft/fluentui/blob/d27922755bebae866d9ffe86b7da44c27ec801ee/packages/react-components/react-menu/library/src/components/Menu/Menu.cy.tsx#L579>);Primer "When Tab or Shift+Tab is pressed, the menu should close and the focus should naturally move to the next item"(<https://github.com/primer/react/blob/f2c075a5d4d0b51a279c39effa18226ad909929d/packages/react/src/hooks/useMenuKeyboardNavigation.ts#L29-L30>)|
| **不能打字搜尋的單選下拉** | `Select`(不可搜尋)、`SelectMenu` 單選 | **選定反白的那一項**、收起、從觸發欄位往下 / 往上走 | W3C 單選下拉範例:"Tab: Sets the value to the content of the focused option in the listbox. / Closes the listbox. / Performs the default action, moving focus to the next focusable element."(<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/examples/combobox-select-only.html#L188-L199>);Fluent:`case 'Tab': !multiselect && activeOption && selectOption(e, activeOption);`(<https://github.com/microsoft/fluentui/blob/d27922755bebae866d9ffe86b7da44c27ec801ee/packages/react-components/react-combobox/library/src/utils/useTriggerSlot.ts#L198-L200>)|
| **可打字搜尋的單選下拉** | `Select`(可搜尋)、`PeoplePicker` 單選 | 今天已會收起、往下走;**補「選定反白的那一項」** | W3C 可打字下拉範例 `case 'Tab': this.close(true); … this.setValue(this.option.textContent)`(<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/examples/js/combobox-autocomplete.js#L388-L395>)|
| **面板** | 多選下拉(底部有「全選」)、`DatePicker`、`TimePicker`、`DataTable` 的篩選 / 欄位 / 排序面板、AgentPanel 對話紀錄浮層 | **在面板裡輪流**(維持現狀);離開面板靠 `Esc` 或點外面 | W3C:"Like non-modal dialogs, modal dialogs contain their tab sequence."(<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/dialog-modal/dialog-modal-pattern.html#L28-L31>);W3C 選日期範例就是對話框、Tab 在裡面輪流(<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/dialog-modal/examples/datepicker-dialog.html#L244-L252>)|

- **下一站一律從觸發點算**:彈出內容掛在頁面最末端(Portal),從選單項往下走會掉到頁尾。實作只有一份:`src/lib/focus-after-trigger.ts`(`DropdownMenu` 與 `SelectMenu` 共用;2026-09-26 兩份合一,待辦總帳〇節「按鍵規則合併」)。
  觸發點在對話框 / 面板裡時,照那個框的規則在框內繞圈;頁面上已經沒有下一站時,焦點留在觸發點。
- **多選下拉**行為不變,但觸發欄位今天宣告自己是「下拉清單」(`aria-haspopup="listbox"`),實際是面板 —— 宣告要改成跟實際一樣(待辦總帳 B11,由 Select / Combobox 的 owner 落地)。
- **世界級在這題不一致,誠實列出**:「按了不動 / 焦點鎖在選單裡」那一派有 Radix(本 DS 底層,"menus should not be navigated using tab key so we prevent it",<https://github.com/radix-ui/primitives/blob/f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae/packages/react/menu/src/menu.tsx#L570-L572>)、
  Adobe React Aria(測試 "contains focus within the menu",<https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria-components/test/Menu.test.tsx#L1842-L1877>)、
  VS Code("// Stop tab navigation of menus",<https://github.com/microsoft/vscode/blob/2ec783d855253a817b5787fb48bc6c3d8d31c0c5/src/vs/base/browser/ui/menu/menu.ts#L132-L139>)。
  本 DS 選 W3C 這一派,因為它跟本檔「Tab 換區、方向鍵在區裡走」同一句話(AI 推導)。

### 不能打字的選項清單:`Enter` 與空白鍵都是選這一項(2026-09-26 user 同意)

**不能打字的選項清單,`Enter` 與空白鍵都是選這一項** —— 選定反白的那一項、收起、焦點回觸發欄位;兩個鍵同一個結果。

- 適用:上表「不能打字搜尋的單選下拉」那一類(`Select` 不可搜尋、`SelectMenu` 單選)—— 清單裡沒有可以打字的地方,空白鍵沒有別的用途。
- 不適用:可打字搜尋的下拉(`Select` 可搜尋、`PeoplePicker`、`Combobox`)—— 空白鍵是打進搜尋框的一個字,選用 `Enter`;多選下拉是面板型(上表),不在本條。
- 一手依據:W3C 單選下拉範例清單按鍵表的 `Space` 列:"Sets the value to the content of the focused option in the listbox. / Closes the listbox. / Sets visual focus on the combobox."(<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/examples/combobox-select-only.html#L177-L186>,與同表 `Enter` 列 `#L167-L176` 三句逐字相同);
  Fluent:`code === keys.Enter || (!multiselect && code === keys.Space)` → `'CloseSelect'`(<https://github.com/microsoft/fluentui/blob/d27922755bebae866d9ffe86b7da44c27ec801ee/packages/react-components/react-combobox/library/src/utils/dropdownKeyActions.ts#L55-L57>);
  可打字的那一類:W3C 可打字下拉範例的清單按鍵表沒有 `Space` 列,"Printable Characters: … Types the character in the textbox."(<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/examples/combobox-autocomplete-list.html#L295-L300>)。
- 來源:這句是 AI 的白話(待辦總帳 L7 第 2 條);user 2026-09-26 同意清單回覆逐字「確保符合我們一致的設計語言且不違背世界級的設計且都有確保整個ds 是SSOT,避免漂移就照你建議做」。
  各元件的按鍵表(`SelectMenu` / `Select` spec「A11y 預設」)只寫指標回到本節。同一條 L7 的另一句「滑鼠點到哪一格,鍵盤位置就跟到哪一格」**不在本條**:它只管表格的試算表模式(點任何格,格游標都跟過去,含唯讀格、開關格與連結格的空白),住 `components/DataTable/data-table.spec.md`「試算表模式」;2026-09-26 AI 建議、user 在「其餘建議」未另提(AI 判讀),同日 user 對寫入清單選「同意，寫入」。

### `Esc` 一次只關最內層(全 DS 規則)

**一次 `Esc` 只關焦點所在的那一個暫時性浮層**:子選單 → 只關這一層、焦點回上一層打開它的那一項(與 `←` 同效果);
浮層疊浮層(檢視器裡的選單、篩選面板裡的下拉、對話框上的確認框)→ 一層一層關。**每按一次少一層。**
`Esc` 不是用來離開常駐區塊(側欄、樹、清單)的鍵。

- W3C:"Escape: Close the menu that contains focus and return focus to the element or context, e.g., menu button or parent `menuitem`, from which the menu was opened."
  (<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/menubar/menu-and-menubar-pattern.html#L153>)
- 同派(有一手的 9 家裡 8 家):Adobe(<https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/menu/useSubmenuTrigger.ts#L161-L171>)、
  Fluent(<https://github.com/microsoft/fluentui/blob/d27922755bebae866d9ffe86b7da44c27ec801ee/packages/react-components/react-menu/library/src/components/Menu/Menu.cy.tsx#L952-L964>)、
  Primer "closes top menu on escape or left arrow key press"(<https://github.com/primer/react/blob/f2c075a5d4d0b51a279c39effa18226ad909929d/packages/react/src/ActionMenu/ActionMenu.test.tsx#L626-L649>)、
  VS Code(<https://github.com/microsoft/vscode/blob/2ec783d855253a817b5787fb48bc6c3d8d31c0c5/src/vs/base/browser/ui/menu/menu.ts#L953-L957>)、
  Windows 桌面選單(<https://github.com/microsoft/microsoft-ui-xaml/blob/258a2e9b0852b69c98162e6daf9906ec8fe5161a/dxaml/xcp/dxaml/lib/MenuFlyoutPresenter_Partial.cpp#L232-L235>)、
  Chrome(<https://github.com/chromium/chromium/blob/c53fe9e04b2856967d1f2f716b99b0911251e521/ui/views/controls/menu/menu_controller.cc#L2155-L2167>)、
  Firefox "Pressing Escape hides one level of menus only."(<https://github.com/mozilla-firefox/firefox/blob/0a5c5bffebd796cedba281419efd2f8f3cc7c85d/layout/xul/nsXULPopupManager.cpp#L2642-L2648>)。
  唯一例外 Radix(子選單 Esc 關整棵,<https://github.com/radix-ui/primitives/blob/f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae/packages/react/menu/src/menu.tsx#L1262-L1266>),`DropdownMenu` 已改寫。Mac 與舊式 Windows 程式找不到官方文字。
- DS 內部早已這樣寫:`components/Dialog/dialog.spec.md`(確認框「Esc 只關最上層」)、`components/Sheet/sheet.spec.md`(「關閉由上而下逐層」)、
  `components/AgentPanel/agent-panel.spec.md`(「只關焦點所在那一區裡最內層」);機制是 Radix DismissableLayer 只讓最上層處理 Esc。

### 關了之後焦點去哪

| 怎麼關的 | 焦點 |
|---|---|
| `Esc` | 回打開它的那一個(按鈕;子選單 → 上一層那一項) |
| 選了一項(一般動作) | 回打開它的那一個 |
| 點外面 | **留在點的地方**,不搶回來 |
| `Tab` / `Shift+Tab` | 打開它的那一個的下一站 / 上一站 |

`Esc` 那一列是 W3C 原文(上引 `#L153`);其餘三列是 **AI 研究的歸納**(待辦總帳 A1 列的研究結論;非 modal 選單點外面不搶焦點 = Radix `hasInteractedOutsideRef` 的既有行為)。
既有偏差與修法:AI 浮鈕的右鍵選單原本關閉時一律把焦點搶回浮鈕(點外面也搶),改成只有 `Esc` / 選了項目才回(`AgentPanel/agent-panel-fab.tsx`,待辦總帳 B11)。


## 焦點放在格上還是格裡的控件上,以及進格用什麼鍵(跨元件規則,2026-09-24 訂)

### 先講:`Enter` 其實是一致的

`Enter` 永遠是「**啟動目前焦點上的那個東西**」,這條沒有例外。
看起來不一致的其實是**上一層**:焦點放在**格**上,還是放在**格裡那個控件**上。

**W3C APG Grid Pattern 有一整節在講這件事**,小標題逐字是
"Whether to Focus on a Cell Or an Element Inside It",它列出兩種**最優設計**:

> "A cell contains **one widget whose operation does not require arrow keys** and grid navigation keys set focus on **that widget**."
>
> "A cell contains **text or a single graphic** and grid navigation keys set focus on **the cell**."

**我們的兩個元件剛好各落一邊,而且理由就是規範寫的那個理由:**

| 元件 | 格裡裝什麼 | 依 APG 焦點放哪 | `Enter` 於是等於 |
|---|---|---|---|
| `DataTable` 檢視態儲存格 | **文字**(資料) | **格** | 「進去」—— 因為格被啟動就是進編輯 |
| `Calendar` 月檢視格 | **一個不需要方向鍵操作的控件**(日期鈕) | **那個控件** | 「選這一天」—— 因為被啟動的是那顆鈕 |

所以 `Enter` 沒有兩套語意,它兩邊都是「啟動焦點上的東西」。

### `F2` 為什麼一定要有

APG 同一份文件的 "Editing and Navigating Inside a Cell" 把 `Enter` 與 `F2` 的進格敘述寫成**同一句**:

> `Enter`:"If the cell contains one or more widgets, places focus on the first widget."
> `F2`:"If the cell contains one or more widgets, places focus on the first widget.
> **A subsequent press of F2 restores grid navigation functions.**"

差別只在 `F2` 多了「再按一次回到格導覽」。

**但焦點在控件上時,`Enter` 已經被那個控件的動作佔走**(月曆的「選這一天」),
於是要抵達格裡**其他**的東西(事件方塊)就只剩 `F2`。這不是我們挑的,是 APG 兩條慣例裡剩下的那條。

### 規則

> **焦點放哪**:格裡是文字/圖形 → 焦點放格;格裡是一個不需要方向鍵的控件 → 焦點放那個控件(APG 兩種最優設計)。
>
> **`F2` 恆為「進到格裡的控件」,再按一次回到格導覽。**
> **`Enter` 恆為「啟動焦點上的東西」** —— 焦點在格上時那就等於進格,焦點在控件上時那就是控件自己的動作。
>
> 出格一律 `Escape`(APG 逐字:"Escape: restores grid navigation."),`F2` 亦可。

### 本 DS 的兩個消費者

| 元件 | 焦點在 | `Enter` | `F2` | 出格 |
|---|---|---|---|---|
| `DataTable`(inline edit / spreadsheet)| **格** | 進編輯 | 進編輯 | `Escape` |
| `Calendar` 月檢視 | **日期鈕**(格裡唯一不需方向鍵的控件)| 選這一天(`onDateClick`)| 進格,焦點落到第一個事件方塊 | `Escape` / `F2` |
| `Calendar` 月檢視,日期格唯讀(`readOnlyDates`,2026-09-26)| **格**(日期數字不是按鈕,格裡沒有那一個控件)| 進格(格沒有主要動作)| 進格 | `Escape` / `F2` |

**新元件照這條判,不要再逐案挑鍵。** 兩句話:
**(1) 這一格裡裝的是文字還是一個控件?** 決定焦點放哪。
**(2) 焦點上那個東西被 `Enter` 啟動時做什麼?** 那就是 `Enter` 的意思。`F2` 永遠是進去。


## 「鍵盤操作可以不一致嗎」—— 可以,但不是免費的(2026-09-24,user 追問到底才查出來的一層)

user 逐字:「所以這代表鍵盤操作可以不一致?世界級的設計也是如此?你為何都要我追問問題的根本?」

先前本檔只答到「世界級也這樣做」(VS Code 三種模型並存、GitHub nav + tree)。
**那是現象,不是回答。** 下面是根。

### 分工本身是跨平台慣例,四家正面論證

W3C APG 逐字:「**A primary keyboard navigation convention common across all platforms** is that
the tab and shift + tab keys move focus from one UI component to another while other keys,
primarily the arrow keys, move focus inside of components that include multiple focusable elements.」
同頁另一句講設計意圖:ARIA design patterns「**borrow user expectations and keyboard conventions
from those platforms** … with the aim of facilitating easy learning and efficient operation」。

Microsoft WinUI:「**Users expect** support for arrow key navigation when there is a group of
similar, related controls in a UI region.」
Apple(WWDC21 Session 10260):「**The tab key navigates between significant areas in an app.
The arrow keys navigate within an area.**」而且 UIKit **自動從階層推導 focus group**,
使用者只要學一次 —— **網頁沒有這個東西**,每個元件作者各自決定。
MDN 把它寫成通則。

**所以「按鍵不同」不是「規則不同」,是那兩段東西在結構上一個是 N 個元件、一個是 1 個元件。**

### 但可預期性有兩個明文前提,少一個就不成立

**前提一:那個群組必須是使用者**已經認得**的 pattern。**
Microsoft WinUI 逐字:「Assign single tab stop to **familiar UI patterns** …
In cases where your layout follows a **well-known UI pattern** for control groups,
assigning a single tab stop to the group can improve navigation efficiency for users.」
它列的例子是 RadioButtons、看起來像單一 ListView 的多個 ListView、磚塊格陣。
**反過來說:你自己發明的群組,不該收成單一停靠點。**

**前提二:你必須**完整**實作那個 pattern。**
APG 逐字:「**All this is only possible if** the tree implements the GUI keyboard conventions
as described in the Tree View Pattern.」
**做半套的 tree 會讓 role 這個訊號說謊,成本比不用 tree 更高** ——
這正是本檔「鐵律:宣告了 composite 角色,就必須真的實作那套鍵盤」那一節的理由來源。

### 三個族群拿到的訊號強度不對稱,而且第三格規範層是空的

APG 有一句同時點名了兩條 discovery 管道(逐字):

> 「**Just as familiar visual styling helps users discover how to expand a tree branch with a mouse**,
> ARIA attributes give the tree the sound and feel of a tree in a desktop application. …
> **Because the screen reader knows the element is a tree, it also has the ability to instruct
> a novice user how to operate it.**」

| 族群 | 訊號 | 依據 |
|---|---|---|
| 螢幕閱讀器使用者 | **role 本身**,而且 AT 能主動教新手怎麼操作 | 上引 APG |
| 滑鼠使用者 | **視覺樣式** | 上引 APG 同一句 |
| **看得見畫面、但只用鍵盤** | **規範層沒有給** | 見下 |

**第三格是真的空的,而且 W3C 自己知道。** APG 有一節就叫
〈Discernible and Predictable Keyboard Focus〉—— 標題就是這個問題 —— 而它的第一行逐字是:

> 「**Work to complete this section is tracked by issue 217.**」

`w3c/aria-practices` issue #217 標題「Finish drafting section "Discernable and Predictable
Keyboard Focus"」,**2016-12-13 開,至今 open**。body 逐字:「The section … is **incomplete**.」
**九年多沒寫完。**

WCAG 也沒補上:SC 3.2.3 Consistent Navigation 的範圍逐字是
「within a **set of web pages**」—— **跨頁,不是同頁**。
**WCAG 沒有任何一條要求同一頁內鍵盤模型一致。**

**注意**:「第三個族群沒有訊號」這句話 APG **沒有說**,是本檔從那一句的句子結構指出它沒被涵蓋
(它同時點名 mouse↔visual、AT↔ARIA,唯獨漏掉中間那一格)。這是本檔的推論,不是原文。

### 明文承認困惑成本的是 DS,不是 W3C

APG 那兩個常被引用的警告框,講的都**不是**「並存讓人搞混」:
Navigation Treeview 的 Caution 講的是 **實作複雜度**(「requires implementation of complex
functionality」),Disclosure Navigation 的 Important 講的是 **AT 期待落空**。
唯一明文講 confusion 的是 Primer:「may cause **confusion or an unusable experience**,
especially if the user cannot see the screen」—— 但它歸因於**誤用**,不是並存。

APG 另有一段雖然字面在講 keyboard shortcuts,論證結構卻直接打到「靠文件去學按鍵」這件事:

> 「**The primary means of making functions and their shortcuts discoverable is by making the
> target elements focusable and revealing key assignments on the element itself.**
> If people who rely on the keyboard have to read documentation to learn which keys are required
> to use an interface, the interface **may technically meet some accessibility standards but in
> practice is only accessible to the small subset of them** who have the knowledge that such
> documentation exists, have the extra time available, and the ability to retain the necessary information.」

**把這段套到方向鍵模型上是本檔做的類比,不是 APG 說的** —— 但它直接否定了「按 `?` 看快捷鍵就夠了」這類緩解。

### 緩解手段(各有一手出處)

| 緩解 | 出處 |
|---|---|
| **模稜兩可時兩種都支援**(既是 tab stop、也吃方向鍵) | Microsoft WinUI 逐字:「Accessibility users rely on well-established keyboard navigation rules, which do not typically use arrow keys… However, users without visual impairments might feel that the behavior is natural.」其 `ContentDialog`「**While arrow keys can be used to navigate between buttons, each button is also a tab stop.**」 |
| 只在 **well-known pattern** 上收單一停靠點 | Microsoft WinUI(前提一) |
| 區段層級導覽鍵(F6 / Focus Next Part) | Microsoft WinUI:「The **F6** key lets a user cycle between panes or important sections」;VS Code docs 同款 |
| 把按鍵**寫在元素本身**而非文件 | APG 上引原則;Primer 的 `KeybindingHint` 元件把快捷鍵寫進 `aria-label`;ARIA 的 `aria-keyshortcuts` |
| 情境式 accessibility help | VS Code 的 Open Accessibility Help —— **但官方清單只含編輯器 / 終端機 / 筆記本 / 聊天,不含側邊欄與檔案樹** |
| 平台層統一 focus group | Apple UIKit 自動推導 —— **網頁無對應物** |

### 套到本 DS 的結論

**我們每一個收成單一停靠點的東西,都是 Microsoft 所說的 well-known pattern**:
`TreeView`(樹 / 樹狀表格)、`SelectMenu` / `DropdownMenu`(選單)、`TimePicker` 的欄(選項清單)、
`DataTable`(表格)、`Calendar` 月檢視(表格)、`RadioGroup`(單選組),
以及 2026-09-25 起的 `SidebarMenu` 與 `FileUpload` 檔案清單(側欄導覽 / 清單:Fluent Nav、Fluent List、Adobe GridList 都是一站 + 方向鍵,見「列上有小按鈕的一串」)。
**沒有一個是自己發明的群組** —— 前提一成立。

前提二由本檔的鐵律與 `scripts/composite-role-keyboard-invariant.mjs` 強制:
宣告了 composite 角色就必須真的實作那套鍵盤,否則 CI 紅。

**還沒做、而且證據支持它值得做的一項**:區段層級導覽鍵(F6 那一類)。
Microsoft 與 VS Code 都有,我們沒有。這會是產品層決策,不在本檔自行決定。

## 鐵律:宣告了 composite 角色,就必須真的實作那套鍵盤

`role="grid"` / `role="listbox"` / `role="tree"` / `role="tablist"` 一旦寫上去,
規範就要求「單一停靠點 + 另一套內部導覽機制」。**只寫角色、不接方向鍵 = 對輔助科技的空頭承諾**,
比不寫角色更糟:螢幕閱讀器會宣告「表格,可用方向鍵瀏覽」,而使用者按下去沒有任何反應。

判準一句話:**寫 composite 角色之前,先問「方向鍵的處理程式在哪一行」**;答不出行號就不要寫那個角色。
這是 M37 的形狀之一 —— 用「角色屬性存在」代替「那套互動真的存在」。

**機械強制**:`scripts/composite-role-keyboard-invariant.mjs`(required CI,`npm run test:composite-role-keyboard`)——
掃 `packages/design-system/src` 內每一個 composite 角色宣告,要求同檔拿得出 keydown / roving tabindex /
`aria-activedescendant` 的證據,否則紅。真的有第三方接管鍵盤時,在該行或上一行寫
`@composite-role-allow: <理由>`。它的 selftest 有八格雙向對照組,其中四格是**誤抓的對照**
(寫在 JSDoc / `//` 註解 / `<code>` 展示 / 另一個屬性的字串裡的 `role="listbox"` 不得被當成違規)——
這四格是因為閘的第一版真的對真檔誤報了 7 筆才補的。

**而這條鐵律本身是 2026-09-24 跨元件掃出來的**:`Calendar` 宣告 `role="grid"` 卻整檔零 keydown、
每顆日期鈕都是 `tabIndex={0}`(一個月 35 格 = 幾十個 Tab 停靠點);同一輪還有多個 story 容器
把 `role="listbox"` 當裝飾寫 —— 而示範程式碼是消費者會照抄的。兩者都已修。

## 來源總帳(M36:區分 user 拍板與 AI 推導)

| 內容 | 來源 | 性質 |
|---|---|---|
| 追問「兩種鍵盤操作是否不一致 / 世界級會這樣嗎」 | user 2026-09-24 逐字(見本檔開頭) | **user 提出的問題**,不是裁示 |
| 指出「treeview 用在 sidebar 也會有目前選到哪一個的狀態」 | user 2026-09-24 逐字:「我他媽看不懂你講什麼,我們的 treeview 不是有可以用在 sidebar嗎?那不就也是會有目前選到哪一個的狀態?仔細全盤研究查查」 | **user 的反證**,直接推翻了下一列那條 AI 判準 |
| 「有沒有目前選到哪一個的狀態」當分界 | AI 2026-09-24 推導 | **已撤回**,一手反證見上方 ⚠️ 段 |
| 「能不能右鍵『在新分頁開啟』」當分界 | AI 2026-09-24 推導 | **已撤回** —— user 逐字戳破:「你他媽每個節點也有可能有自己的連結啊,你他媽不要再導果為因,仔細研究世界級的設計看到底要怎麼設計」。一手反證:APG Navigation Treeview 的 treeitem 就是 `<a href>` |
| 「Primer 把 global sidebar navigation 列在 tree 不適合的清單裡」被寫成像禁令 | AI 2026-09-24 **誤讀** | **已撤回** —— user 逐字:「Sidebar 就是有可能會用到 treeview 啊,你自己看 notion 不也是嗎?憑什麼禁止?應該基於此去研究到底該怎麼定義吧?」兩層誤讀:(1) 原文是 **global** sidebar navigation(全站主導覽),我只記住 sidebar navigation;(2) 原文是「不要**為了突破四層上限**而把 NavList 換成 tree」,我只記住後半句。**Primer 同一個 repo 的 `ui-patterns/navigation.mdx` 正面寫著 TreeView "It's often used in the sidebar of a split page layout"**,跟 NavList 同一句。這是 M36 那一類:把自己讀出來的範圍當成原文寫的範圍 |
| 五條判準(選取並施加動作 / 鍵盤需求 / 深度無上界 / 使用者產生且可改動 / 不保證換 URL) | 從 ARIA 角色譜系、APG Caution、Primer、Apple HIG、Carbon、Ant 歸納 | **AI 的組裝動作** —— 每一條都有一手引文,但**沒有任何一家把五條寫成一張判定表**。第 4 條的方向性(能改動 → 該用樹)是 AI 加的,Apple 只說「outline view 可以讓人編輯/重排/增刪」 |
| 「量級」當判準 | AI 2026-09-24 推導 | **已降級** —— 查無任何一手來源拿項目數當 tree/nav 分界;APG 的 ">7 root nodes" 是「樹要不要加打字前導」的門檻,不是「該不該用樹」 |
| 「三個族群訊號不對稱」 | 從 APG 那一句的**句子結構**指出(它同時點名 mouse↔visual、AT↔ARIA,唯獨漏掉中間那一格) | **AI 的推論** —— APG 沒有說「所以第三個族群沒有訊號」 |
| 把 APG 講 keyboard shortcuts 的 discoverability 論證套到方向鍵模型上 | 類比 | **AI 的類比** —— 那段的字面主題是 shortcuts。兩者都是「非預設鍵、要先知道才會用」,我認為類比成立,但它是類比不是原文 |
| 「兩個前提」(已認得的 pattern + 完整實作) | 從 Microsoft 的 "familiar UI patterns" 與 APG 的 "only possible if" 歸納 | **AI 的組裝** —— 沒有任何一家把它寫成這兩條 |
| 「Primer 那句 never 的精確範圍」 | 讀 `nav-list.mdx` 緊接兩行的上下文 | **AI 的解讀** —— 原文字面的 never 讀起來更絕對 |
| 「GitHub 的檔案樹節點就是 `<a href>`」 | AI 2026-09-24 對話中的斷言 | **已撤回,無法證實** —— GitHub 2025-01 官方文章逐字寫「Nodes on tree view constructs are tree items, not links」,且把「Supporting links inside a node」列為未來工作。本檔的反證改用 APG 官方範例(那個確實是 `<a href>`) |
| 「兩種模型並存是常態」 | VS Code 原始碼 + 官方 accessibility 文件 + GitHub/Primer 原始碼與文件 | **一手實證** |
| 「『各自一個』才是預設」→ `SidebarMenu`「每項一個 Tab 停靠點,無方向鍵」 | AI 2026-09-24 從 VS Code 那句話推出 | **已撤回(2026-09-25)** —— user 選了路線乙(下一列);VS Code 那句話只支持「收成一個要有理由」,本檔現在寫明理由 |
| 側欄、樹、FileUpload 檔案清單走路線乙(一串一站、`→` 進列上小按鈕、`Tab` 一下離開) | **user 2026-09-25 附條件同意**,逐字:「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」;條件查證 = AI 研究(待辦總帳 B9) | user 拍板(附條件,條件已查證成立) |
| 路線乙表格裡「按鈕上 `↑` `↓` 回到上下一項」「鍵盤走到的按鈕要看得見」「頭尾不繞回」「按鈕上 `Home` / `End`」「會開選單的小按鈕 `↓` 也是換項」 | 依 Adobe / Fluent / VS Code 一手;後兩條是三處實作不一致時統一成側欄做法 | **AI 推導**,user 2026-09-26 以同意清單(35 個細節,含 X4 / X6)整批同意;「按鈕上按 `Esc`」刻意不規定(未拍板) |
| 不能打字的選項清單 `Enter` 與空白鍵都是選這一項 | 句子是 AI 的白話(待辦總帳 L7 第 2 條);一手 = W3C 單選下拉範例、Fluent Dropdown | user 2026-09-26 同意(附條件,逐字見該節);L7 另一句「滑鼠點到哪一格,鍵盤位置就跟到哪一格」只管試算表模式,住 `data-table.spec.md`「試算表模式」(2026-09-26 寫入) |
| `TreeView` 改用 `treegrid` 身分 | 待辦總帳 B9「樹改用樹狀表格身分」;理由(W3C 只在樹狀表格定義列上按鈕)是 AI 研究 | 隨路線乙拍板 |
| 選單開著按 `Tab` = 收起全部、從觸發鈕往下走;子選單 `Esc` 只關一層 | **user 2026-09-25 附條件同意**,逐字見「彈出框開著時的 Tab 與 Esc」;條件查證 = AI 研究(待辦總帳 B10 / B11) | user 拍板(附條件,條件已查證成立) |
| 不能打字的單選下拉同樣收起並選定反白項、可打字的補「選定」 | user 追問:「看最後是怎樣定義，選單類應該要一致吧？這樣才符合世界級的設計？」——問句 + 一致性原則;AI 為滿足「選單類一致」而延伸,回覆已明寫 | **AI 延伸,user 可在預覽否決**(待辦總帳 B11) |
| 「Tab 換區、方向鍵在區裡走、Esc 退一步」這句總結 | 從 W3C 通則、Apple WWDC、本檔各節歸納 | **AI 的歸納**,不是任何一家的原文 |
| 關閉後焦點去哪(`Esc` 之外的三列) | 待辦總帳 A1 列的研究結論 | **AI 研究的歸納**;`Esc` 那一列是 W3C 原文 |

本檔 2026-09-24 版的規範引文皆為逐字,只記檔案路徑(上游 main 會漂移,不記行號);2026-09-25 新增的各節一律釘 commit + 行號。

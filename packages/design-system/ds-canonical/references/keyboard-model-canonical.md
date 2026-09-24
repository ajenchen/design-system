# Keyboard Model Canonical(一串東西該怎麼用鍵盤走)

跨元件 SSOT:**一串並排的東西,使用者是用 Tab 一個一個走,還是 Tab 一次進去、再用方向鍵在裡面走。**

起因是 user 2026-09-24 的追問:「這個也要追根究底不一樣的合理理由吧?世界級的設計是怎樣?真的需要不同的鍵盤操作?
為何一個是按 tab 上下移動一個是按上下?這樣鍵盤的操作方式是否不一致?同一套世界級的設計系統會這樣不一致嗎?」

## Authority boundary

本檔擁有**「這一串該用哪一種鍵盤模型」的判準**,以及該判準的一手出處。
它不擁有:焦點框長什麼樣、畫在哪(owner = `focus-canonical.md`)、命中區多大(owner = `hit-area-canonical.md`)、
各元件的實際按鍵表(owner = 各元件 `spec.md` 的「A11y 預設」段)、
列裡誰當那顆控件(owner = `patterns/element-anatomy/item-anatomy.spec.md`「整列可點時,誰當那顆控件」)。
與 `focus-canonical.md` / `hit-area-canonical.md` / `drag-canonical.md` 同層級、同形狀(一個能力、一份跨元件契約)。

## 先講結論:兩種模型並存是世界級的常態,不是不一致

同一個側邊欄裡同時出現兩種鍵盤模型,**不是漂移,是業界標準做法**,而且可以在原始碼層驗:

VS Code 的側邊區在同一個畫面裡就有三種模型並存 ——
活動列是 `ariaRole: 'tablist'`(`src/vs/workbench/browser/parts/compositeBar.ts`),item 只有將被聚焦時才拿到 `tabIndex = 0`,
整條是**一個 Tab 停靠點 + 方向鍵**;
檢視區段標題每一條自己 `setAttribute('tabindex','0')` + `role="button"`(`src/vs/base/browser/ui/splitview/paneview.ts`),
所以**每一條都是獨立 Tab 停靠點**;
區段裡的檔案樹容器 `tabIndex = 0` + `role="tree"` + `aria-activedescendant`(`src/vs/base/browser/ui/list/listWidget.ts`),
又回到**一個停靠點 + 方向鍵**。

而且 VS Code 官方文件把取捨講得很白(`docs/configure/accessibility/accessibility.md`,逐字):

> "All elements in the workbench support tab navigation. To avoid having too many tab stops, workbench toolbars and tab lists each have only one. Once a toolbar or a tab list has focus, you can use the arrow keys to navigate within them."

讀出來就是:**預設每個東西都可以 Tab,只有為了避免停靠點太多才把某些東西收成一個。**
所以「收成一個」是需要理由的那一邊,「各自一個」才是預設。

GitHub 同一個 repo 頁面上也是並存:左邊檔案樹是 `role="tree"` 的 roving tabindex 單一停靠點,
同一頁的 repo 導覽(Code / Issues / PRs)是純連結、帶 `aria-current="page"`、每個各自一個停靠點。

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

Primer 的 TreeView 也支援 `as="a" href=…`(`packages/react/src/TreeView/TreeView.tsx` 的 polymorphic 分支
+ `TreeView.features.stories.tsx` 的 `AsProp` story),焦點仍走 `useRovingTabIndex`。

### ⛔ 「在不在側邊欄」不是分界(2026-09-24 撤回一次誤讀)

**側邊欄是一塊版面,不是一種語意。** 同一塊側邊欄裡可以有數種語意不同的區段,各取各的角色。

我先前引 Primer 的兩句話,寫得像「側邊欄不能有樹」。**那是誤讀,而且是兩層誤讀:**

1. 原文是 "global sidebar navigation"(**全站主導覽**),我只記住了 "sidebar navigation"。
2. 原文是 "Do not replace your NavList with a tree view **to support a deeply nested navigation
   structure**"(禁的是「為了突破 4 層上限而換成樹」),我只記住了後半句。

**Primer 同一個 repo 的另一份文件正面寫著相反的話** —— `content/ui-patterns/navigation.mdx`
把 Tree view 與 Nav list 並列在同一章,兩者的句子**一模一樣**:

> Tree view:"it's often used to implement a parent-detail navigation pattern.
> **It's often used in the sidebar of a split page layout.**"
> Nav list:"A vertical list of links... **It's often used in the sidebar of a split page layout.**"

`tree-view.mdx` 的 Composition 章再講一次:"A common pattern is to render a tree view in a
**split page layout where the tree view is in the left pane**";它列的「好的使用情境」第一條就是
"navigating the file structure of a repo" —— 那正是 GitHub code view 的左側 pane。

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
`aria-current={isCurrentItem ? 'true' : undefined}` 與 `aria-selected={isFocused ? 'true' : 'false'}` 兩個屬性並列。
它的 roving tabindex `focusInStrategy` 第一順位是「Focus the aria-current item if it exists」——
從外面 Tab 進樹時,焦點直接落在「你現在在的那一頁」。W3C APG Navigation Treeview 範例原始碼註記同樣寫著
"Only one treeitem in the tree has tabindex=\"0\"" / "In this implementation tabindex=\"0\" is always on the treeitem with aria-current=\"page\""。

## 套到本 DS

| 元件 | 五條裡命中哪幾條 | 模型 |
|---|---|---|
| `SidebarMenu` / `SidebarMenuButton` | **一條都不命中** —— designer 定義的固定目的地、啟動一定換頁、層數有界、使用者不能改動項目本身 | **每項一個 Tab 停靠點**,無方向鍵 |
| `TreeView` | **五條全中** —— 節點可選取並施加動作、需要打字前導與任意深度回父節點、深度無上界、使用者自己新增與拖曳重排、啟動不保證換 URL | **容器單一 Tab 停靠點 + 方向鍵**(`components/TreeView/tree-view.tsx`,DOM focus 永遠停在 `role="tree"` 容器)|
| `SelectMenu` / `DropdownMenu` / `TimePicker` 的欄 | 命中 1、2、5 —— 選單項是該選單的值 | **容器單一停靠點 + 方向鍵 / `aria-activedescendant`** |
| `DataTable`(`role="grid"`)| 命中 1、2 —— 格是表格的值 | **容器單一停靠點 + 方向鍵** |

**注意這張表沒有「是不是連結」也沒有「在不在側邊欄」那兩列** —— 兩者對結論都零貢獻(見上方兩個 ⛔ 段)。
側欄導覽項是連結,W3C APG Navigation Treeview 的 treeitem 也是連結;側欄可以同時裝這兩種,Notion / VS Code / GitHub 都是。

**兩者在同一個側欄並存完全合規**,`sidebar.spec.md` 的決策樹「兩者都有 → SidebarMenu + TreeView 分區」對齊 VS Code 的三模型並存。


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
`TreeView`(樹)、`SelectMenu` / `DropdownMenu`(選單)、`TimePicker` 的欄(選項清單)、
`DataTable`(表格)、`Calendar` 月檢視(表格)、`RadioGroup`(單選組)。
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

本檔的規範引文皆為逐字;行號會隨上游 main 漂移,故只記檔案路徑不記行號。

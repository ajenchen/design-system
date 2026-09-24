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

### 三問(都要過才算 composite)

**問 1 — 操作模型是「選取並施加動作」,還是「前往」?**

ARIA 的角色譜系就是答案:`tree` 的 superclass 是 `select`,而 `select` 逐字是
"A **form widget** that allows the user to make **selections from a set of choices**";
`treeitem` 逐字是 "An **option item** of a tree"。對照 `link` 逐字是
"causes the user agent to **navigate to that resource**"。
Primer 講同一件事:tree 是 "allow a user to navigate through, **select, and take action on** one or more items"。

**問 2 — 使用者真的需要 tree 那一整套鍵盤功能嗎?**

APG Navigation Treeview 的 Caution 框逐字:
> "Correct implementation of the `tree` role requires implementation of complex functionality that is **not needed for typical site navigation**."
> "A pattern more suited for typical site navigation with expandable groups of links is the disclosure pattern."

同頁內文:"**few sites need the additional keyboard functionality required to support the ARIA `tree` role**"。

那一整套是:Home / End、任意深度的 ArrowLeft 回父節點、**打字前導跳節點**、
ArrowRight 展開但不移動焦點。用不到就不要宣告成 tree。

**問 3 — 量級會不會讓逐項 Tab 變成負擔?**

GitHub 官方文章逐字(這是**量級論證,不是語意論證**):
> "Consider a file tree for a repository that contains 500+ files in 20+ directories. Without a composite widget treatment, someone may have to press Tab far too many times to bypass the file tree component and get what they need."

對偶:Primer NavList 的上限是 4 層巢狀,超過就叫你重新設計導覽,而不是換成 tree。

### 三問跑四個案例

| | 側欄固定導覽 | GitHub repo 檔案樹 | APG Disclosure Navigation | 下拉選單 / 選項清單 |
|---|---|---|---|---|
| 問 1 操作模型 | 只有「前往」,無選取狀態、不對項目施加其他動作 | 有 `aria-selected`,且對選取節點施加動作 | 只有「前往」 | 選取 |
| 問 2 鍵盤需求 | 不需要打字前導 / Home / End / 任意深度 | 需要,直接對標 Windows 檔案總管 | 不需要 | 需要 |
| 問 3 量級 | 固定、有限、作者窮舉得完 | 500+ 檔、20+ 目錄、動態載入 | 有限 | 有限但需快速定位 |
| **是不是連結** | 是 | APG 版是 | 是 | 通常不是 |
| **結論** | **每項一個 Tab 停靠點** | **整棵樹一個停靠點 + 方向鍵** | **Tab 為主,方向鍵是 APG 明標的 Optional** | **整組一個停靠點 + 方向鍵** |

**「是不是連結」那一列是唯一四格幾乎都相同、卻對結論零貢獻的一列** —— 這就是它不能當判準的證明。

### Primer 對我們側欄這個 case 有明文

`tree-view.mdx` 把 "**global sidebar navigation**" 逐字列在 tree view **不適合**的清單裡;
`nav-list.mdx` 逐字:"Do not replace your NavList with a tree view to support a deeply nested navigation structure.
A tree view is **never** an accessible replacement for navigation."

### 一個必須講出來的張力(不要粉飾)

Primer 說「tree 永遠不能取代導覽」,但 W3C APG 有一個官方範例就叫 **Navigation** Treeview,
而 GitHub 把自己的檔案樹包進 `nav` landmark。三者並不矛盾,但要分開兩個問句:

1. **這東西在「功能上」是不是導覽?** → 決定要不要包 `nav` landmark。GitHub 的檔案樹是,所以包了。
2. **這東西在「操作上」是不是一個 select widget?** → 決定焦點模型。是,所以 roving tabindex。

GitHub 自己的話:"This does not mean every tree view component should be a landmark, however!
We made this decision for the file tree because it is frequently interacted with as a way to navigate."

Primer 那句 "never" 的精確範圍是**反對「為了支援更深的巢狀而拿 tree 當技術解法」**
(原文 L142 談巢狀上限、L144 緊接著講 never),不是「導覽內容永遠不能是 tree」。
**這句範圍界定是本檔的解讀,不是 Primer 原文** —— 字面上的 "never" 讀起來更絕對。

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

| 元件 | 問 1 操作模型 | 問 2 鍵盤需求 | 問 3 量級 | 模型 |
|---|---|---|---|---|
| `SidebarMenu` / `SidebarMenuButton` | 只有「前往」,無選取狀態、不對項目施加其他動作 | 不需要打字前導 / Home / End / 任意深度 | designer 定義、有限、窮舉得完 | **每項一個 Tab 停靠點**,無方向鍵。Primer 把 "global sidebar navigation" 逐字列在 tree 不適合的清單裡 |
| `TreeView` | 承載 user data,有選取狀態 + 展開收合 / 多選 / 拖曳重排 | 需要 | 使用者自己新增,任意深度 | **容器單一 Tab 停靠點 + 方向鍵**(`components/TreeView/tree-view.tsx`,DOM focus 永遠停在 `role="tree"` 容器) |
| `SelectMenu` / `DropdownMenu` / `TimePicker` 的欄 | 選單項是該選單的值 | 需要(打字前導、迴圈) | 需快速定位 | **容器單一停靠點 + 方向鍵 / `aria-activedescendant`** |
| `DataTable`(`role="grid"`) | 格是表格的值 | 需要 | 列數不可窮舉 | **容器單一停靠點 + 方向鍵** |

**注意這張表沒有「是不是連結」那一列** —— 因為它對結論零貢獻(見上方 ⛔ 段)。
側欄導覽項是連結,APG Navigation Treeview 的 treeitem 也是連結,兩者模型卻相反。

**兩者在同一個側欄並存完全合規**,`sidebar.spec.md` 的決策樹「兩者都有 → SidebarMenu + TreeView 分區」對齊 VS Code 的三模型並存。

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
| 三問判準(操作模型 / 鍵盤需求 / 量級) | 從 APG Caution、GitHub 量級論證、Primer 三前提**歸納** | **AI 的組裝動作** —— 引文都是真的,但三家沒有任何一家把這三問並列寫成一張表。**不得寫成「規範規定」** |
| 「Primer 那句 never 的精確範圍」 | 讀 `nav-list.mdx` 緊接兩行的上下文 | **AI 的解讀** —— 原文字面的 never 讀起來更絕對 |
| 「GitHub 的檔案樹節點就是 `<a href>`」 | AI 2026-09-24 對話中的斷言 | **已撤回,無法證實** —— GitHub 2025-01 官方文章逐字寫「Nodes on tree view constructs are tree items, not links」,且把「Supporting links inside a node」列為未來工作。本檔的反證改用 APG 官方範例(那個確實是 `<a href>`) |
| 「兩種模型並存是常態」 | VS Code 原始碼 + 官方 accessibility 文件 + GitHub/Primer 原始碼與文件 | **一手實證** |

本檔的規範引文皆為逐字;行號會隨上游 main 漂移,故只記檔案路徑不記行號。

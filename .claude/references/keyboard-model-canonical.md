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

## 判準(兩題,都要過)

### 第 1 題(語意):這一串的每一項,是獨立的控件,還是同一個控件的值?

- **是獨立控件**(每一項各自能被啟動、啟動後帶你去別的地方 —— 連結、按鈕)
  → **每一項各一個 Tab 停靠點**,不用方向鍵。
- **是同一個控件的值**(那個控件自己有選取狀態,還有展開收合 / 多選 / 型別前導搜尋 / 鍵盤搬移這些內部操作)
  → 它是 **composite widget**,整組**一個 Tab 停靠點 + 方向鍵**。

規範依據,WAI-ARIA 1.2 `composite` 角色逐字(<https://www.w3.org/TR/wai-aria-1.2/#composite>):

> "A widget that may contain navigable descendants or owned children. Authors SHOULD ensure that a composite widget exists as a single navigation stop within the larger navigation system of the web page. Once the composite widget has focus, authors SHOULD provide a separate navigation mechanism for users to navigate to elements that are descendants or owned children of the composite element."

`composite` 的子角色只有 `grid` / `select` / `spinbutton` / `tablist`;`tree` 的 superclass 是 `select`、`select` 的 superclass 是 `composite`,
所以樹是 composite。反過來 `navigation` 是 landmark、`link` 是 widget 但**不是** composite、`list` 是 structure —— 三者都不套單一停靠點規則。

W3C APG「Developing a Keyboard Interface」列出需要 managing focus 的 pattern 清單是:
Combobox、Grid、Listbox、Menu and Menubar、Radio Group、Tabs、Toolbar、Treegrid、Tree View。
**清單裡沒有導覽,也沒有連結清單。**

### 第 2 題(必要性):就算它長得像樹,你真的需要樹那套鍵盤功能嗎?

W3C APG 在 Navigation Treeview 範例頁的警告框裡逐字:

> "Correct implementation of the tree role requires implementation of complex functionality that is not needed for typical site navigation that is styled to look like a tree with expandable sections."

> "A pattern more suited for typical site navigation with expandable groups of links is the disclosure pattern."

不需要 →/← 展開收合、多選、型別前導搜尋、鍵盤搬移節點 → **不要用 tree**,
改成「disclosure 按鈕 + 一串連結」,每個連結照樣是 Tab 停靠點。

GitHub 自家設計系統 Primer 的 NavList 文件把這件事寫成禁令,逐字:

> "Do not replace your NavList with a TreeView to support a deeply nested navigation structure. A TreeView is never an accessible replacement for navigation, as it serves a different purpose and is not recognized as navigation by assistive technologies."

同一份文件的無障礙頁另寫:"Each navigation item must receive focus when navigating with the Tab key"。

## ⚠️ 被推翻的錯判準:「有沒有目前選到哪一個的狀態」

**2026-09-24 我先前的判準是:「有沒有一個『目前選到哪一個』的整體狀態 → 有就整組一個 Tab 停靠點 + 方向鍵」。這條是錯的,已撤回。**

錯在哪:**側欄導覽本來就有「目前在哪一頁」**,照這條判會把所有導覽誤判成方向鍵。
user 當場就指出了這個洞:「我們的 treeview 不是有可以用在 sidebar 嗎?那不就也是會有目前選到哪一個的狀態?」

一手反證:W3C APG 的 Disclosure Navigation 範例,連結上明明帶著 `aria-current="page"`,
但它的 Keyboard Support 表寫的是
"Tab / Shift + Tab: Move keyboard focus among top-level buttons, and if a dropdown is open, into and through links in the dropdown",
方向鍵在該範例裡標示為 **Optional** 的加值,不是主要模型。**有 current 狀態 ≠ 要用方向鍵。**

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

| 元件 | 第 1 題 | 第 2 題 | 模型 |
|---|---|---|---|
| `SidebarMenu` / `SidebarMenuButton` | 每條通往不同頁面 = **獨立控件** | 不需要樹功能 | **每項一個 Tab 停靠點**,無方向鍵 |
| `TreeView` | 承載 user data,有展開收合 / 多選 / 拖曳重排 = **同一個控件的值** | 需要 | **容器單一 Tab 停靠點 + 方向鍵**(`components/TreeView/tree-view.tsx`,DOM focus 永遠停在 `role="tree"` 容器) |
| `SelectMenu` / `DropdownMenu` / `TimePicker` 的欄 | 選單項是該選單的值 | 需要(型別前導、迴圈) | **容器單一停靠點 + 方向鍵 / `aria-activedescendant`** |
| `DataTable`(`role="grid"`) | 格是表格的值 | 需要 | **容器單一停靠點 + 方向鍵** |

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
| 兩題判準(語意題 + 必要性題) | 依 WAI-ARIA 1.2 `composite` 定義 + W3C APG pattern 清單 + APG Navigation Treeview 警告框推導 | **AI 依一手規範推導**,每句都附得出原文;非 user 拍板 |
| 「兩種模型並存是常態」 | VS Code 原始碼 + 官方 accessibility 文件 + GitHub/Primer 原始碼與文件 | **一手實證** |

本檔的規範引文皆為逐字;行號會隨上游 main 漂移,故只記檔案路徑不記行號。

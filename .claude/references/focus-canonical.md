# Focus Canonical(鍵盤游標與焦點指示)

跨元件 SSOT:**誰能移動鍵盤游標**,以及**游標長什麼樣**。
起因是 user 2026-09-06 的問題:「那到底為何明明就有藍色外框在做同樣的事了還要加深底色?我們整個 ds 有多少類似這樣的設計?SSOT到底是什麼?」

## Authority boundary

本檔擁有**跨元件的一致性規則**。它不擁有:token 的值(owner = `tokens/color/color.spec.md`)、
單一元件的 anatomy(owner = 各元件 `*.spec.md`)、列/項目的疊加語意(owner =
`patterns/element-anatomy/item-anatomy.spec.md`)。本檔不重述那些值,只在它們之間定分工。
與 `drag-canonical.md` 同層級、同形狀(一個能力、一份跨元件契約)。

## 一句話

**鍵盤游標只由鍵盤移動;滑鼠只上色,不搬游標。**(唯一例外:已開啟的暫時性彈出層,沿用不外擴)
**鍵盤游標一律畫框(DS 的焦點框),不上底色;底色只屬於滑鼠 hover 與「選中」。**
唯一不畫框的例外是**插入點控件**(文字輸入框那類,閃動的 caret 就是指示)—— **user 2026-09-09 拍板**,原話見來源總帳。幾何走「框怎麼畫」。
**會搶反白的浮層選單(cmdk / Radix Menu)裡,反白就是唯一的游標:滑鼠與鍵盤搶的是同一個東西,誰最後搬動它就用誰的畫法
(滑鼠移過 → 底色;鍵盤 → 框),兩種畫法永遠不同時出現;滑鼠停著不算搶,只有移動才算。常駐清單(TreeView / Sidebar / Tabs /
DataTable / TimePicker 欄)不搶反白:hover 底色與鍵盤框是兩個獨立狀態,可以同時出現。**(2026-09-09 下午 user 三問;
結論由 AI 依一手來源證實,見規則一「兩類元件」、規則二疊加表與來源總帳)

## 為什麼要拆成兩個問題

因為原本的混亂來自把它們混在一起。user 的原話把這件事講得比規格書清楚:

> 「鍵盤焦點對我來說的概念很像是我讓使者者透過鍵盤去移動滑鼠…所以鍵盤焦點若在在選單選項上會同時有焦點框以及滑鼠hover上去的底色吧?但像是文字輸入框在鍵盤操作上不會有懸停再選中的兩段式行為所以可以簡單共用元件本身的 focus 狀態?」

前半句是**問題一(誰移動游標)**,後半句是**問題二(游標長什麼樣)**。

分開之後,**問題一有唯一答案**(規則一),**問題二自 2026-09-09 起也只剩一個答案**(規則二:一律畫框、不上底色;唯一例外是插入點控件)。
2026-09-06〜09-08 之間問題二曾被寫成「看底色有沒有被選中佔走」的兩段式判準 —— 那是 AI 從 Radix / cmdk / shadcn 慣例推導出來的,
**不是 user 的決定**,2026-09-09 已撤回(來源總帳)。

上面引文裡「選單選項會同時有焦點框以及滑鼠 hover 上去的底色」這半句,現在要分兩類看(規則一「兩類元件」):
**常駐清單**(不搶反白)裡框恆在(那是鍵盤游標)、底色只在滑鼠真的停在那一列時才出現(那是 hover),兩者互不依賴、可以同時存在;
**浮層選單**(會搶反白)裡兩者**不會同時出現** —— 反白只有一個主人,鍵盤把反白搬走時滑鼠停留列的底色跟著消失,滑鼠停著不算搶
(user 2026-09-09 下午原話:「搶回去之後原本滑鼠的 hover 樣式即會消失直到滑鼠又搶回來才會再出現」,來源總帳)。
本檔舊版曾在這裡「勘誤」說選單沒有焦點框、游標就是 hover 底色本身 —— 那個勘誤的依據只是既有
`menu-item.spec.md` 抄自 Material / Radix / cmdk 的慣例,不是 user 的話,已一併撤回。

---

## 規則一:誰能移動鍵盤游標

**只有鍵盤,以及使用者主動的點擊/敲擊。滑鼠移過去(hover)一律不移動游標。**

滑鼠經過時只做一件事:用 CSS `:hover` 上色。不呼叫 `.focus()`、不改 `aria-activedescendant`、不寫游標 state。

**唯一例外**:**已經打開的**暫時性彈出層(下拉選單、選單列的子選單)沿用業界既有行為 —— 打開後滑鼠移到哪一項,反白就跟到哪一項。
這是**沿用,不外擴**:常駐的清單、樹狀、表格、側欄一律照上面的通則,不得因為「選單是這樣」就跟著做。

### 為什麼例外不能外擴(user 問「理想上應該都要跟 radix一樣吧?」的正面回答)

不能。而且理由比預期的強 —— **W3C 自己正在把這個行為從選單規範裡拿掉**:

- APG 選單列範例的正文明講這是通則的例外,不是通則:「In general, moving focus in response to mouse hover is avoided in accessible widgets; it causes unexpected context changes for keyboard users.」([APG Editor Menubar](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-editor/),2026-09-06 實測仍在線)
- [w3c/aria-practices#3238](https://github.com/w3c/aria-practices/issues/3238)(2025-02-14 由 smhigley 開,**今天仍 OPEN**)標題就是「moving focus on hover often triggers problematic focus jumps」,內文寫此行為當初「largely added for parity with desktop behavior rather than for any specific accessibility benefit on its own merit」。
- 2025-02-18 的 APG Task Force 會議紀錄(貼在同一個 issue 內):主持該議程者問「Is there anybody that has any objection to removing automatically having focus follow hover?」,結論是 Hearing none。同一份紀錄裡有實際使用者的證詞:「I frequently have to move my mouse to a corner of the screen to get rid of these negative side effects.」

也就是說,把選單的行為往外複製,是**朝著 W3C 正在撤退的方向前進**。

其次,主流函式庫**在同一個團隊內部就把線畫在同一個地方**,不是各家風格差異:

| | 滑鼠會移動游標 | 滑鼠不移動游標 |
|---|---|---|
| Radix | Menu、Select | Tabs、Toolbar、NavigationMenu、RovingFocusGroup |
| React Aria | `useMenuItem`(硬寫死,無關閉開關) | `useOption`(要 `shouldFocusOnHover` 才開,**預設關,且現已標 @deprecated**)、grid/table/gridlist 諸 hook(連 `useHover` 都沒 import)|
| 其他 | — | AG Grid、MUI X DataGrid、rc-table、VS Code 清單 |

分界線是**「滑鼠是在挑一個值」還是「滑鼠是在瀏覽一個集合」**,不是元件長得像不像清單。
Headless UI 更直接:它整包 66 個元件**根本沒有出樹狀、表格、grid 或常駐清單**(GitHub API 清點)。

第三,常駐清單若讓 hover 移游標,會壞掉三件具體的事(全部有 APG 明文對應):
多選清單的 shift/ctrl 範圍選取以「目前游標」為錨點,滑鼠掃過去就會毀掉既有選取;
type-ahead 的起點會跟著滑鼠亂跳;grid 內「打字即進入編輯」會編到錯的那一列。

### 兩類元件:會搶反白的浮層選單 vs 不搶的常駐清單(2026-09-09 下午,user 三問)

user 原話(問句):「滑鼠會搶反白的元件,搶完之後,那鍵盤是否可以再搶回?且搶回去之後原本滑鼠的 hover 樣式即會消失直到滑鼠又搶回來才會再出現,
且滑鼠的搶應該是包括鍵盤焦點一起搶吧?換言之,是滑鼠操控的時候鍵盤焦點就會消失,是鍵盤操控的時候滑鼠的 hover 樣式就會消失,你明白我的意思嗎?這樣是否合理?」

三題的答案都是「對」,而且理由是同一個:**在會搶反白的元件裡,反白(cmdk `data-selected` / Radix `data-highlighted`)是唯一的游標,滑鼠與鍵盤搶的是同一個 state。**
每一家的一手來源都只有**一個** highlight 狀態,沒有「hover」與「鍵盤焦點」兩個並存的通道:

| 來源 | 一個 state | 滑鼠怎麼搶 | 鍵盤怎麼搶回 | 滑鼠停留處在鍵盤搶回後 |
|---|---|---|---|---|
| [cmdk `cmdk/src/index.tsx`](https://github.com/pacocoursey/cmdk/blob/main/cmdk/src/index.tsx)(本 repo 1.1.1 `dist/index.mjs` 逐字對驗) | `data-selected={Boolean(selected)}`,`selected = state.value === value.current` | `onPointerMove={disabled \|\| disablePointerSelection ? undefined : select}`,`select()` = `store.setState('value', …)`;**沒有任何 onMouseEnter / hover handler** | ArrowUp/Down `updateSelectedByItem(±1)` 只改同一個 `value` | 舊列失去 `data-selected`,cmdk 本身不畫任何東西;[cmdk 官網樣式](https://github.com/pacocoursey/cmdk/blob/main/website/styles/cmdk/vercel.scss)與 [shadcn CommandItem](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/command.tsx) 都**只畫 `data-selected`,沒有 `:hover` 規則** |
| [Radix Menu `menu.tsx`](https://github.com/radix-ui/primitives/blob/main/packages/react/menu/src/menu.tsx)(本 repo 2.1.16 `dist/index.mjs:439-460`) | `data-highlighted={isFocused ? '' : undefined}`,`isFocused` = DOM focus(onFocus/onBlur) | `onPointerMove` 包 `whenMouse` → `item.focus({ preventScroll: true })`;`onPointerLeave` → `contentContext.onItemLeave` → 焦點回容器、反白清空 | 方向鍵 `focusFirst(candidateNodes)` 搬 DOM 焦點 | 舊列 blur → 反白清空;[shadcn DropdownMenuItem](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/dropdown-menu.tsx) 只有 `focus:bg-accent`,**沒有 `hover:`** |
| [Radix Select `select.tsx`](https://github.com/radix-ui/primitives/blob/main/packages/react/select/src/select.tsx) | 同上 `data-highlighted` = `isFocused` | `onPointerMove`:`pointerTypeRef.current === 'mouse'` 才 `focus({ preventScroll: true })`;`onPointerLeave` 若自己是 activeElement → `onItemLeave` | `setTimeout(() => focusFirst(candidateNodes))` | 同上 |
| [React Aria `useMenuItem.ts`](https://cdn.jsdelivr.net/npm/@react-aria/menu/src/useMenuItem.ts) | 回傳 `isFocused` / `isFocusVisible`(= `isFocused && selectionManager.isFocused && isFocusVisible() && !isTriggerExpanded`),**不回傳 `isHovered`** | `useHover` `onHoverStart`:`if (!isFocusVisible() && !(isTriggerExpanded && hasPopup)) { selectionManager.setFocused(true); selectionManager.setFocusedKey(key) }` —— hover 就是搬同一個 focusedKey | 方向鍵搬 `focusedKey` | 只有一個 `focusedKey`;對照 [`useOption.ts`](https://cdn.jsdelivr.net/npm/@react-aria/listbox/src/useOption.ts) 的 `shouldFocusOnHover` 標 `@deprecated`(常駐清單那邊正在退掉 hover 搬焦點) |
| [Headless UI Menu](https://headlessui.com/react/menu) | `data-focus`:「Whether or not the menu item is focused」,文件明講「focused via the mouse or keyboard」;MenuItem 的 states 表**沒有 hover** | 同一個 focus | 同一個 focus | — |
| macOS AppKit [`NSMenu.highlightedItem`](https://developer.apple.com/documentation/appkit/nsmenu/highlighteditem) | 「Indicates the currently highlighted item in the menu… If no menu is highlighted, this property has a value of nil」—— 單一 `NSMenuItem?` | 滑鼠 / 鍵盤都改同一個 highlightedItem | 同左 | 單一狀態,不可能兩個 |
| Windows WPF [`MenuItem.IsHighlighted`](https://learn.microsoft.com/en-us/dotnet/api/system.windows.controls.menuitem.ishighlighted) | 「Gets a value that indicates whether a MenuItem is highlighted」—— 單一 boolean,不分滑鼠 / 鍵盤 | 同一個 IsHighlighted | 同左 | 單一狀態 |

反過來,**不搶反白的常駐清單**用的是兩個獨立通道,所以 hover 底色與鍵盤框可以同時出現:

| 來源 | hover | 鍵盤焦點 | 兩者關係 |
|---|---|---|---|
| 瀏覽器 `:hover` / `:focus-visible`(DS 的 Sidebar / Tabs / DataTable / TimePicker 欄走真焦點) | pseudo-class | pseudo-class | 兩個獨立 pseudo-class,同一元素可同時 match(每一顆網頁上的按鈕都是這樣) |
| Material 3 / [material-web `_menu-item.scss`](https://raw.githubusercontent.com/material-components/material-web/main/menu/internal/menuitem/_menu-item.scss) | `md-ripple` 的 `hover-state-layer-*`([`_md-sys-state.scss`](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-sys-state.scss):hover 0.08 / focus 0.12 / pressed 0.12) | `md-focus-ring`(獨立元素) | 兩個獨立元素,各畫各的 |
| [VS Code `listWidget.ts`](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/base/browser/ui/list/listWidget.ts) `DefaultStyleController.style()` | `.monaco-list-row:hover:not(.selected):not(.focused) { background-color: listHoverBackground }` | `.monaco-list:focus .monaco-list-row.focused { outline: 1px solid listFocusOutline; outline-offset: -1px }` + `listFocusBackground` | **部分反例**:焦點列自帶 `listFocusBackground`(底色通道已被焦點佔走),所以 hover 底色在焦點列上被 `:not(.focused)` 排除;hover 別列時兩者同時可見。DS 的鍵盤框不佔底色通道,所以同一列上底色 + 框可疊(AI 推導,見來源總帳) |
| TreeView(DS 自家,`aria-activedescendant` 虛擬游標) | CSS `:hover` | `showRing`(`useInputModality`) | 獨立;`scripts/virtual-cursor-modality-invariant.mjs` E1/E2 實測同一列底色 + 框都在 |

**兩類怎麼分**:滑鼠移過去反白會不會跟過來(規則一的例外)。會 → 反白是唯一游標,適用本節;不會 → 常駐清單,hover 與框獨立。
DS 內屬於前者的:`CommandItem`(Select / SelectMenu / Combobox / PeoplePicker / Command inline+dialog / AgentPanel 歷史清單都經它)與
DropdownMenu 四種項目(Item / SubTrigger / CheckboxItem / RadioItem)。其餘全是後者。

**所以修改範疇只有會搶反白的元件**(user 問「這個更改範疇應該只有會搶反白的元件吧?」——對):把它們項目上的 `hover:` 樣式全部拿掉、
畫法改由「反白來歷」決定(`hooks/use-input-modality.ts` `useCursorMover` + `markPointerGrab`),常駐清單一行都不用改。
唯一順手修的常駐項是 TimePicker:滑鼠點開後 DOM 焦點落在第一顆選項鈕而不是 listbox,方向鍵之後框留在舊鈕上(見「已知未收斂」)。

---

## 規則二:游標長什麼樣 —— 一律畫框,不上底色

**判準只有一題:它是不是插入點控件?不是 → 畫框。**
(user 2026-09-09 逐字:「就是基本上都是畫框,唯一不畫框的例外就是你所謂“單一狀態控制項(文字輸入框、Textarea、Field 內的輸入)”」)

| 情況 | 指示器 | 依據 |
|---|---|---|
| **鍵盤游標**停在任何可操作的東西上 —— 按鈕、選單／清單項(選中與否都一樣)、樹節點、表格格、tab、分頁鈕…;真 DOM 焦點或虛擬游標皆同 | **畫框**(DS 焦點框:2px `--ring`,外或內描邊由「框怎麼畫」決定);**不上底色** | **user 2026-09-09 拍板**:「我基本上都說以畫框為主」「甚至我現在覺得都要畫框,但都不需要上底色,這樣反而更乾淨簡單吧?」 |
| **插入點控件**(`<input>` 文字類 / `<textarea>` / `[contenteditable]`;Field 家族控件另由 wrapper 邊框轉色承擔) | **不畫框**;指示 = 閃動的 caret(+ 欄位邊框轉 primary,`field-wrapper.tsx:49`) | user 同上;可機械判別的定義見「問題一之二」B 類 |

**底色只有兩個主人:滑鼠 hover 與「選中」。** 鍵盤游標不借用它們的顏色
(user 2026-09-07:「不要一下用底色一下用邊框來標示焦點」;2026-09-09:「都不需要上底色」)。疊加時各說各的:

| 疊加 | 長相 | 說明 |
|---|---|---|
| **選中 × 游標** | **框疊在選中底色上**(`bg-neutral-selected` + 框) | 底色說「這是選中的」,框說「游標在這裡」,兩個通道互不取消 |
| **hover × 游標 —— 不搶反白的常駐清單**(TreeView / Sidebar / Tabs / DataTable / TimePicker 欄;滑鼠停在鍵盤游標所在的那一列) | **底色 + 框都在** | 底色照 hover 規則出現、框照游標規則出現,兩個獨立狀態(瀏覽器 `:hover` / `:focus-visible` 本來就獨立;規則一「兩類元件」第二表) |
| **hover × 游標 —— 會搶反白的浮層選單**(cmdk / Radix Menu) | **沒有這一格**:反白只有一個主人,只會是「滑鼠搬的 → 底色」或「鍵盤搬的 → 框」其中一種 | 滑鼠移過就把反白搶走(那就是 hover 的樣子);鍵盤搬走反白後,滑鼠停留列**不再有底色**(項目上沒有任何 `hover:` 樣式;滑鼠停著不算搶,只有 pointer move 才算);滑鼠再動就連框一起搶回來。規則一「兩類元件」第一表逐家對驗 |
| 選中 × hover | 選中底色釘住不變 | owner = `item-anatomy.spec.md`「選中 × 互動疊加」,本檔不重述 |

**虛擬游標的框只在「鍵盤」下畫(2026-09-08;常駐清單看輸入模態,會搶反白的浮層選單看反白來歷 —— 兩個訊號,下詳)。** 真 DOM 焦點有瀏覽器的 `:focus-visible` 決定
「這次要不要畫」;虛擬游標(`aria-activedescendant` / cmdk `data-selected` / Radix `data-highlighted`)
的框畫在**沒有真焦點**(或焦點由程式搬動)的那一項上,瀏覽器幫不了,要自己判斷模態。判準逐字對齊
[WICG focus-visible explainer「Example heuristic」](https://github.com/WICG/focus-visible/blob/main/explainer.md):
「if the most recent user interaction was via the keyboard; and the key press did not include a meta,
alt/option, or control key; then the modality is keyboard. Otherwise, the modality is not keyboard.」
機械載體 = `hooks/use-input-modality.ts`(document capture 監聽、**模組載入即安裝**;第一版的「引用計數安裝」實測會漏掉開啟前的按鍵,見該檔註解)。
**這個判準只給不搶反白的常駐虛擬游標用(TreeView `showRing`)**:WICG polyfill 只把 keydown / mousedown / pointerdown / touchstart 當輸入,
**滑鼠移動不算**(mousemove 只在載入時用來判初始模態、第一次移動後就移除 listener —— [`src/focus-visible.js`](https://github.com/WICG/focus-visible/blob/main/src/focus-visible.js) `onInitialPointerMove`),
所以常駐清單的鍵盤框不會被滑鼠一晃就抹掉,跟瀏覽器對真焦點的行為一致。

**會搶反白的浮層選單用另一個訊號:反白來歷(`useCursorMover` + `markPointerGrab`,同一檔)。** 這裡「滑鼠移過項目」本身就是搶
(cmdk `onPointerMove → select()` / Radix `onPointerMove → item.focus()`),必須算;停著不動沒有 pointermove,自然不算。
兩個訊號不能共用:拿 WICG 模態畫反白,滑鼠搶走反白後模態仍是鍵盤,被搶到的列會畫框而不是底色(2026-09-09 下午閘 D3 抓到);
拿反白來歷畫 TreeView,滑鼠一晃鍵盤框就消失。反白因此只有兩種長相:
**滑鼠搬的**反白 = hover → 底色、無框;**鍵盤搬的**反白 = 游標 → 框、無底色,而且滑鼠停留列的底色一起消失(項目上沒有 `hover:` 樣式)。
開啟時的落點(cmdk 放在已選項或第一項、Radix 不放)沒有人搬過,用開啟那一下的輸入畫:滑鼠點開 → 底色、鍵盤開 → 框。
消費者:`CommandItem`(SelectMenu / Select / Combobox / PeoplePicker / Command / AgentPanel 歷史清單都經它)/ DropdownMenu 四種項目(`radixCursorClass`);
TreeView(`showRing`)仍走 `useInputModality`。
錨:user 2026-09-08「為何我用滑鼠一開 select 選單明明就沒有鍵盤操作,卻會直接出現鍵盤焦點?」——
cmdk 開啟時把游標放在已選項上(`select-menu.tsx` `defaultValue={selectedOption?.value}`),
畫框規則沒有模態條件,滑鼠一點開就畫。閘:`scripts/virtual-cursor-modality-invariant.mjs`
(A 滑鼠開不畫 / A2 指標 hover 有底色無框 / B 鍵盤移回必畫 / B2 鍵盤游標列有框且底色 = 非游標列 / C 純鍵盤開立刻畫 /
**D 搶來搶去四步**:滑鼠到 A(底色)→ ↓ 到 B(B 框、B 無底色、A 底色消失)→ 滑鼠到 C(B 框消失、C 底色無框)→ 停在 C 按 ↑(C 底色消失、B 框),
11 個會搶反白的目標 + SubTrigger / **E 常駐清單**:鍵盤框在時 hover 同列或別列,底色與框同時存在;`--selftest` 對照組把兩類都釘回舊行為,全部 'new' 斷言必紅)。

**按鈕不屬於例外列。** 按鈕用滑鼠點下去不顯示焦點框(`:focus-visible` 啟發式:指標點按鈕不視覺化焦點,
文字輸入框取得焦點要視覺化)。真正「滑鼠鍵盤共用」的只有插入點控件。

### 一個項目只有一個指示器

**「指示器」不限於框。** 底色深一階、邊框變色、選取框、外描邊 —— 都算。
所以「外描邊 + 邊框變色」也是兩個,不是只有「框 + 底色」才算
(2026-09-07 錨:Slider 改用全域外描邊時,原本的 `focus-visible:border-primary-hover`
忘了一起刪,同一顆把手上就有了兩個;而且那個變色與 hover 同色,反而讓
「鍵盤在這裡」與「滑鼠經過」長得一樣)。

同一個元素上不得同時出現兩種焦點指示(框 + 底色深一階)。
刻意不畫的唯一合法理由是**指示器畫在別的元素上**,而且必須指得出承擔者(file:line)。
指不出來就是 WCAG 2.4.7 違規。

### `--neutral-selected-focus` 的處置

**已於 2026-09-07 退役**(`semantic.css`「`-focus` 已於 2026-09-07 退役」註解、`color.spec.md:704`)。
它原本表示「鍵盤焦點停在選中列 → 底色深一階」;順序是先補框、再刪 token,沒有顛倒。
2026-09-09 全 repo 只剩歷史敘述,無活用法。

## 框怎麼畫(幾何與顏色的一張表)

下面每一列都已經在「問題二」或「遷移完成紀錄」裡各自成立,這裡只是把它們排在一起,方便一眼查:

| 項目 | 值 | 住在哪 / 依據 |
|---|---|---|
| 線 | `outline: 2px solid var(--ring)` | `styles/base.css` `:focus-visible` 全域規則(外描邊)與 `@utility focus-ring-inset`(內描邊),值只寫這兩處 |
| 顏色 | `--ring`(= primary) | token owner `tokens/color/color.spec.md`;本檔不定值 |
| 位置(預設) | **往外** `outline-offset: 2px`;元件**什麼都不用寫** | 「問題二」:預設就是往外長(user 2026-09-07 逐字) |
| 位置(被裁切／貼鄰居) | **往內** `outline-offset: -2px`,寫 `focus-visible:focus-ring-inset`(真焦點)或 `focus-ring-inset`(虛擬游標,由元件 state 掛上) | 「問題二」:被聚焦元素四周最小淨空 < 4px 才往內;撐滿容器寬度的列(選單項 / 側欄鈕 / tab)都屬此類 |
| 圓角 | 跟著元素的 `border-radius` | `outline` 原生行為,不必特別處理(「不需要為它開分支」) |
| 只准兩種幾何 | 全域外描邊 / `focus-ring-inset`;禁 `ring-offset-*`、禁 `focus-visible:ring-*`、禁手寫三件組 | `scripts/focus-geometry-invariant.mjs` R1–R5 |
| 什麼時候畫(真焦點) | 瀏覽器 `:focus-visible` | 元件不判斷模態 |
| 什麼時候畫(常駐清單的虛擬游標,TreeView) | `useInputModality() === 'keyboard'` 才掛 `focus-ring-inset`(WICG 模態:keydown / pointerdown,滑鼠移動不算) | 上一節;`scripts/virtual-cursor-modality-invariant.mjs` |
| 什麼時候畫(會搶反白的浮層選單,cmdk / Radix) | `useCursorMover() === 'keyboard'` 才掛 `focus-ring-inset`,否則反白上 `bg-neutral-hover`(反白來歷:鍵盤鍵 / 滑鼠移過項目 `markPointerGrab`;停著不算) | 上一節;同一支閘 D 段 |
| **選中 × 游標** | 框疊在 `bg-neutral-selected` 上 | 規則二疊加表 |
| **hover × 游標(常駐清單)** | `bg-neutral-hover` + 框都在 | 規則二疊加表 |
| **hover × 游標(浮層選單)** | 不存在:反白只有一個主人,底色與框擇一;項目上不寫任何 `hover:` | 規則二疊加表 |
| 游標**不**帶什麼 | 不帶底色、不帶邊框變色、不帶文字變色 | 「一個項目只有一個指示器」+ user「都不需要上底色」 |

## 現行盤點(2026-09-06 實測;2026-09-09 更新兩列)

| 指標 | 數字 |
|---|---|
| 用 `focus-visible:` 的元件檔 | 47 |
| `ring-ring` 出現次數 | 85 |
| 用 `focus-within:`(即共用 focus 那類)的元件 | 8 — AgentPanel / Carousel / DataTable / Field / FileViewer / LinkInput / PeoplePicker / Select |
| `ring-inset` | 2(DataTable、TreeView)|
| `--neutral-selected-focus` 的用法 | **0**(2026-09-07 退役;2026-09-06 當時是 4 活 + 1 死)|
| 用底色當鍵盤游標的地方(`focus-visible:bg-` / 反白底色不分模態)| **0**(2026-09-09 清完:MenuItem / CommandItem / DropdownMenu / Sidebar;2026-09-08 當時 4 檔)|
| 會搶反白的項目上的 `hover:` 樣式(CommandItem / DropdownMenu 四種項目)| **0**(2026-09-09 下午清完;之前鍵盤分支各帶 `hover:bg-neutral-hover`、選中列另帶 `hover:bg-neutral-selected`,共 5 條)|
| `hover:bg-` 全 DS(非 stories)| 16 檔 / 40 處 —— 其餘全是常駐元素(Sidebar 選單鈕與動作鈕 / TreeView 列與動作 / TimePicker 欄 / Calendar / DateGrid / InlineEdit / Button / Switch / Checkbox / Carousel / ScrollArea / PersonDisplay / DataTable 工具列),hover 與焦點框獨立,不在本節範疇 |
| `data-[highlighted]` / `data-[selected=true]` 的 owner | 各只有一檔:`dropdown-menu.tsx` / `command.tsx`(反白畫法的單一來源) |
| `focus-visible:` 的用法歸類 | `focus-visible:focus-ring-inset` 20(真焦點內描邊)/ `focus-visible:outline-none` 7(全部登記在 `focus-suppression-registry`)/ `focus-visible:underline` 2(DatePicker 範圍模式共用承擔者的區分)/ `focus-visible:!border-primary` `focus-visible:hover:!border-primary` 各 1(Textarea naked 模式,C 類邊框轉色)/ `focus-visible:z-20` 1(SegmentedControl 疊層順序,不是指示器)/ 其餘出現在註解 |

`bg-neutral-hover` 橫跨 131 處 / 56 檔,所以底色語彙本身是全 DS 共用的 —— 這正是它只能表達「滑鼠在這裡」與「選中」、不能再借給鍵盤游標當第三個意義的原因。

## 已知未收斂(不得當成已定案)

- **DataTable 列游標**:目前完全沒有列層級的鍵盤游標。要補之前有三個前提要先解 ——
  `role="table"` 不能合法帶 `aria-activedescendant`(需遷 `grid`/`treegrid`);虛擬捲動下 activedescendant 指向的元素必須真實存在;
  同一列在三個面板各渲染一次,IDREF 該歸誰未定。
- **Sidebar 選單鈕(已收斂 2026-09-09)**:`sidebarMenuButtonVariants` 原本鍵盤焦點只有底色(非當前項 hover 色 / 當前項深一階),
  2026-09-07 先補當前項的框,2026-09-09 依 user 拍板改成**所有項目都畫框**(`focus-visible:focus-ring-inset`)、
  焦點不再上底色;底色只剩 hover 與 `data-active`。留在本節只為對照。
- **Slider(已收斂 2026-09-07)**:原本 `slider.tsx` 註解明寫「不加 ring 或 halo」、以邊框變色當焦點;C6 修後改用全域外描邊,並把殘留的 `focus-visible:border-primary-hover` 一併刪除(`slider.tsx:174-182` 註解記錄兩次修正)。留在本節只為對照,不再是未收斂項。
- **DataTable 的 hover 機制與 TreeView 不同**:TreeView 用 CSS `:hover`,DataTable 用指令式寫入的 `data-[hovered]` 屬性。
  兩者在規則一下結論相同(都不移動游標),但 DataTable 那條路沒有捲動時的重新計算。
- **TimePicker 欄(2026-09-09 下午通盤複查抓到,修法與「兩類元件」同一批落地)**:滑鼠點開後 DOM 焦點落在第一顆選項鈕(`Popover` 預設抓第一個 `<button>`),不是 listbox;
  之後按方向鍵,值照常換(事件冒泡到 listbox),但瀏覽器的 `:focus-visible` 框留在那顆停在原地的舊鈕上,游標(`aria-activedescendant`)其實已經走了
  (真瀏覽器實測:`activeElement = BUTTON[role=option]`、↓ 後選中格 `outline=none`)。修法是 `time-picker.tsx` 的 `PopoverContent` 傳 `onOpenAutoFocus`
  把焦點放在 listbox 上 —— A 類「框畫在被指到的那一格」才成立。
- **cmdk 對捲動後補發的 pointermove 不設防(上游行為,未驗證)**:Chromium 在內容捲動後可能補發一個座標不變的 pointermove 讓 `:hover` 重算;
  cmdk 的 `onPointerMove` 不分真假一律 `select()`,鍵盤捲動時反白理論上可能跳回滑鼠停留格。DS 的 `markPointerGrab` 已忽略座標不變的事件
  (不會被畫成底色),但反白跳動本身要改 cmdk。本 repo 的閘用短清單驗證,沒有覆蓋這個情境。

## Sources

一手來源,2026-09-06 逐條重新抓取並對驗(MD5 或逐字比對):

- [W3C APG — Editor Menubar Example](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-editor/) — hover 移焦點是**例外**的原句
- [W3C APG — Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) — 指標互動應與鍵盤設定同一個 tabindex / activedescendant
- [w3c/aria-practices#3238](https://github.com/w3c/aria-practices/issues/3238) — 提議把 hover 移焦點從選單規範移除;含 2025-02-18 Task Force 會議紀錄全文
- [Radix `react-menu`](https://github.com/radix-ui/primitives) `dist/index.mjs:444-457` — `onPointerMove` → `item.focus({preventScroll:true})`,以 `whenMouse` 包住
- [React Aria `useMenuItem.ts` / `useOption.ts`](https://github.com/adobe/react-spectrum/tree/main/packages/%40react-aria) — 同一團隊內部的 A/B:選單硬寫死、選項要 opt-in 且已 deprecated
- [Headless UI #3769](https://github.com/tailwindlabs/headlessui/pull/3769) — hover 移焦點造成的實際 bug 與維護者診斷(2025-07-30 合併)
- [Sarah Higley, "aria-activedescendant is not focus"](https://sarahmhigley.com/writing/activedescendant/)
- WAI-ARIA 1.2 §4.3.2 / Core-AAM 1.2 §3.8.3 — 這兩份才是 normative;APG 是 authoring guidance,本檔不稱其為規範

2026-09-09 下午補抓(規則一「兩類元件」兩張表的一手來源,全部 WebFetch 逐字;本 repo 的 cmdk 1.1.1 / Radix Menu 2.1.16 另以 `node_modules/*/dist/index.mjs` 對驗):

- [cmdk `cmdk/src/index.tsx`](https://github.com/pacocoursey/cmdk/blob/main/cmdk/src/index.tsx) — `data-selected` 單一來源、`onPointerMove → select()`、`updateSelectedByItem`、`disablePointerSelection` JSDoc「Optionally set to `true` to disable selection via pointer events」
- [cmdk 官網樣式 `vercel.scss`](https://github.com/pacocoursey/cmdk/blob/main/website/styles/cmdk/vercel.scss) — `[cmdk-item]` 只有 `&[data-selected='true']` / `&[data-disabled='true']` / `&:active`,沒有 `:hover`
- [shadcn `command.tsx`](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/command.tsx) / [`dropdown-menu.tsx`](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/dropdown-menu.tsx) — CommandItem `data-[selected=true]:bg-accent`、DropdownMenuItem `focus:bg-accent`,兩者都沒有 `hover:`
- [Radix Menu `menu.tsx`](https://github.com/radix-ui/primitives/blob/main/packages/react/menu/src/menu.tsx) — `data-highlighted={isFocused ? '' : undefined}`、`onPointerMove` + `whenMouse` → `item.focus({ preventScroll: true })`、`onPointerLeave → onItemLeave`(焦點回容器)
- [Radix Select `select.tsx`](https://github.com/radix-ui/primitives/blob/main/packages/react/select/src/select.tsx) — 同構;`pointerTypeRef.current === 'mouse'` 才 focus
- [React Aria `useMenuItem.ts`](https://cdn.jsdelivr.net/npm/@react-aria/menu/src/useMenuItem.ts) — `onHoverStart` 在 `!isFocusVisible()` 時 `setFocused(true); setFocusedKey(key)`;回傳無 `isHovered`;[`useOption.ts`](https://cdn.jsdelivr.net/npm/@react-aria/listbox/src/useOption.ts) `shouldFocusOnHover` 標 `@deprecated`
- [Headless UI Menu](https://headlessui.com/react/menu) — `data-focus`「Whether or not the menu item is focused」,「focused via the mouse or keyboard」
- [AppKit `NSMenu.highlightedItem`](https://developer.apple.com/documentation/appkit/nsmenu/highlighteditem) — 單一 highlighted item(nil 表示沒有)
- [WPF `MenuItem.IsHighlighted`](https://learn.microsoft.com/en-us/dotnet/api/system.windows.controls.menuitem.ishighlighted) — 單一 boolean
- [VS Code `listWidget.ts`](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/base/browser/ui/list/listWidget.ts) `DefaultStyleController.style()` + [theme-color 參考](https://code.visualstudio.com/api/references/theme-color) — `list.hoverBackground`「background when hovering over items using the mouse」/ `list.focusOutline`「outline color for the focused item when the list/tree is active」/ hover 規則 `:hover:not(.selected):not(.focused)`
- [material-web `_menu-item.scss`](https://raw.githubusercontent.com/material-components/material-web/main/menu/internal/menuitem/_menu-item.scss) + [`_md-sys-state.scss`](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-sys-state.scss) — `md-ripple`(hover 0.08 / pressed 0.12)與 `md-focus-ring` 是兩個獨立元素
- [WICG focus-visible polyfill `src/focus-visible.js`](https://github.com/WICG/focus-visible/blob/main/src/focus-visible.js) — `onPointerDown` 掛 mousedown / pointerdown / touchstart;`onKeyDown` 排除 meta / alt / ctrl;mousemove 只做初始判定(`onInitialPointerMove` 觸發後 `removeInitialPointerMoveListeners()`)
- 抓不到正文(JS 渲染,只回標題)、不列為依據:Apple HIG「Menus」頁、m3.material.io「Menus」與「States」頁;Material 的數值改引 material-web 原始碼

## 來源總帳(M36:區分 user 拍板與 AI 推導)

| 條目 | 出處 |
|---|---|
| **「會搶反白的元件裡,反白是唯一游標:鍵盤可以搶回;搶回後滑鼠停留處的 hover 底色消失;滑鼠搶時連鍵盤框一起搶」(規則一「兩類元件」)** | **user 2026-09-09 下午原話是問句 + 委託研究**,逐字:「滑鼠會搶反白的元件,搶完之後,那鍵盤是否可以再搶回?且搶回去之後原本滑鼠的 hover 樣式即會消失直到滑鼠又搶回來才會再出現,且滑鼠的搶應該是包括鍵盤焦點一起搶吧?換言之,是滑鼠操控的時候鍵盤焦點就會消失,是鍵盤操控的時候滑鼠的 hover 樣式就會消失,你明白我的意思嗎?這樣是否合理?仔細研究查查,包括我們所使用的套件以及世界級的設計,確保我們有一致的設計語言且不違背世界級的設計且有 SSOT,有結論之後要確保整個 DS 都有遵循 SSOT 沒有偏移」。**問句 ≠ 拍板(M36(a))**:三題的「對」是 **AI 依一手來源證實**(規則一第一表七家全部單一 highlight),方向與 user 提問一致;程式落地是依這個結論的機械執行 |
| 「滑鼠停著不算搶,只有 pointer move 才算」「兩種畫法永遠不同時出現」「開啟時的落點用開啟那一下的輸入畫」 | **AI 依 cmdk `onPointerMove` / Radix `onPointerMove` 一手來源歸納**(搶的動作就是 pointermove 事件本身);主 session 的先驗判斷,非 user 決定 |
| 「不搶反白的常駐清單裡 hover 底色與鍵盤框是兩個獨立狀態,可以同時出現」 | **AI 歸納**:瀏覽器 `:hover` / `:focus-visible` 獨立、Material 3 hover state layer 與 focus ring 是兩個元素;VS Code 因焦點列自帶 focusBackground 才排除 hover(部分反例,DS 焦點不佔底色通道所以可疊)。user 2026-09-06 原話「鍵盤焦點若在在選單選項上會同時有焦點框以及滑鼠hover上去的底色吧?」是問句,且 2026-09-09 下午已把浮層選單那半邊改成「不同時出現」 |
| 「修改範疇只有會搶反白的元件;TimePicker 焦點落點順手修」 | user 問「這個更改範疇應該只有會搶反白的元件吧?還是還有其他相關地方要修正?」(問句);**AI 依 DS-wide grep 回答**:`hover:` 只在 CommandItem / DropdownMenu 需要拿掉,常駐清單一行不改;TimePicker 是通盤複查抓到的既有缺口(A 類框畫錯元素),與本題無關但同屬「框畫在哪」 |
| **「鍵盤游標一律畫框、不上底色;唯一不畫框的例外是插入點控件」(規則二現行版)** | **user 2026-09-09 拍板**,逐字:「我基本上都說以畫框為主」「會搶反白的,我當時只有說“除了畫框還要上底色來模擬滑鼠”,那就表示都要畫框吧?」「甚至我現在覺得都要畫框,但都不需要上底色,這樣反而更乾淨簡單吧?」「就是基本上都是畫框,唯一不畫框的例外就是你所謂“單一狀態控制項(文字輸入框、Textarea、Field 內的輸入)”」 |
| ~~「底色空著(選單／清單選項,未被選中)→ 用 hover 同色底當游標,不畫框」(舊規則二第一列、舊 D 類、舊判斷程序第 6 步)~~ | **AI 推導自 Radix / cmdk / shadcn 慣例**(經 `menu-item.spec.md` 舊句「以背景高亮而非畫 outline ring」),**不是 user 決定**。**2026-09-09 user 撤回**,逐字:「“底色空著(選單／清單選項,未被選中) 用 hover 同色底當游標,不畫框”我們他媽到底哪有定義過這個?」「此外鍵盤焦點框怎麼畫的原則呢?“單一狀態控制項”這個又是如何具體判別?鍵盤焦點框的整理根本不完整」。本檔 2026-09-06〜09-08 三版都把這條當成「既有 canonical 本來就有的答案」寫進規則,那是把 AI 推論升格成定案(M36(a)),一併撤回 |
| 「會搶反白的地方,鍵盤焦點 = hover 樣式 + 藍框」 | **user 2026-09-07 原話**:「反正就是會搶反白的地方的鍵盤焦點會有hover的樣式+藍框?你確認是這樣的話,那我可以接受」——這句已經是「都要畫框」;「+hover 樣式」的部分由 user 2026-09-09 自己收斂成「都不需要上底色」(底色只在滑鼠真的停在那一列時,照 hover 規則出現) |
| 「一個藍色 focus ring 就已經夠顯眼了,同時要再加上其他樣式根本畫蛇添足」「不要一下用底色一下用邊框來標示焦點」 | **user 2026-09-06〜09-07 原話**,「一個項目只有一個指示器」與「不上底色」的立檔依據 |
| 「按照 TreeView 的模型」 | **user 拍板**,原話「當然是按照 tree view 啊,我們不就是要確保整個ds 有SSOT有一致的設計語言嗎?」 |
| 刪掉沒用到的焦點底色 token | **user 拍板**,原話「題一照你建議,把焦點底色那些沒用到的token該刪的就刪一刪」「我甚至覺得不要底色只留邊框更通用,然後可以刪掉沒用到的token?」 |
| 「能 SSOT 就要 SSOT,不夠用就擴充 SSOT,但也要以世界級的設計擴充」「這個 SSOT 本身也不能違背世界級的設計」 | **user 原話**,本檔的立檔依據 |
| 焦點框的粗細/顏色/圓角至少要一致;不顯示焦點也要有合理理由 | **user 原話**(「我認為焦點的邊框的基本樣式包括邊框粗細顏色圓角等等至少要是一致的」「若不顯示焦點標示也要有合理理由」)|
| ~~「兩段式行為」作為規則二的判準~~ | **2026-09-06 撤回**。user 原話是問句(「…文字輸入框在鍵盤操作上不會有懸停再選中的兩段式行為所以可以簡單共用元件本身的 focus 狀態?」),我把問句當成判準並外推到選單與按鈕。撤回後改成的「底色有沒有被選中佔走」判準,也於 2026-09-09 撤回(上表第二列)。現行判準只剩「是不是插入點控件」 |
| `--neutral-selected-focus` 退役 | 2026-09-06 我曾放大 user 原話(user 說的是刪「沒用到的」)並撤回;2026-09-07 user 拍板「A5畫框」後補完框、token 沒人用 → 已於 2026-09-07 退役(`semantic.css` 註解 / `color.spec.md:704`)。順序沒有顛倒 |
| 內描邊/外描邊「不統一但寫下規則」 | **AI 轉述 user 2026-09-06 裁示**,未逐字留存;規則內容(預設外描邊、祖先裁切改內描邊)為 AI 依現況歸納 |
| 規則一及其唯一例外、不外擴的理由 | **AI 依上列一手來源歸納**,非 user 決定 |
| A / B / C / E 四類的切法、六步判斷程序、B 類的機械判別(標籤名 + `contenteditable`) | **AI 歸納**(2026-09-07 逐站分類、2026-09-09 依 user 拍板改寫),user 拍板的只有「都畫框、例外是插入點控件、要可具體判別」 |

---

# 焦點框決定程序(2026-09-07 user 拍板,可機械執行)

三個問題,依序問完就有唯一答案。

## 問題一:要不要畫?

**根本判準是「這個東西可不可以被操作」,不是「能不能被 Tab 到」。**
(user 2026-09-07 逐字:「要不要畫的根本決定因素是該元件可不可以被操作吧?不能被操作就不用畫,可以被操作才畫」)

| 可操作? | 該可聚焦? | 該畫框? |
|---|---|---|
| 可以 | **必須**(WCAG 2.1.1) | **要** |
| 不可以 | **不該**(它不該出現在 Tab 順序裡) | 不要 |

**「能不能 Tab 到」是果,不是因。** 兩者不一致時,是**可聚焦性**要改,不是靠畫框補救:

- **可操作但 Tab 不到** → WCAG 2.1.1 違規。修法是讓它可聚焦,然後它自然就要畫框。
- **Tab 得到但其實不能操作** → 它是一個「什麼都不會發生的焦點站」。修法是**拿掉 tabIndex**,不是給它畫框。
  給一個沒有作用的東西畫焦點框,等於對鍵盤使用者說謊。

唯一的例外是「指示器由別的元素承擔」—— 而且**必須指得出承擔者是誰**(file:line)。指不出來就是要畫。

判「Tab 到得了」看三件事,不是用猜的:原生可聚焦元素 / `tabIndex >= 0` / 該檔有沒有 `.focus()` 把焦點送過去。
**`tabIndex={-1}` 是「可程式聚焦、可點擊聚焦」,不是「不可聚焦」。**

## 問題一之二:**框由誰畫**(2026-09-07 補;2026-09-09 依 user 拍板改寫)

問題一給的是判準(可不可以被操作),但「可以操作、卻不是自己畫瀏覽器那圈外框」的情況一直只寫成一句
「指示器畫在別的元素上」,太抽象、每次都要重新想。下面把它拆成**四類**,是 2026-09-07
用真瀏覽器逐站 Tab 過去、把全 DS 所有「聚焦了但自己沒畫框」的站點分類出來的結果
(`scripts/focus-geometry-browser-audit.mjs`)。**2026-09-09 改寫**:表的意思從「誰可以不畫」
改成「**框由誰畫**」——四類裡只有 B 是真的不畫,其餘三類都有框,只是畫的人不是瀏覽器預設那圈。
舊表的 **D 類(選單未選中項用 hover 同色底當游標)已整類撤回**(來源總帳),沒有替代品:那些列現在就是畫框。

**共同前提**:四類都要指得出**承擔者是誰**(file:line)。指不出來就是要畫,沒有第五類。

| 類 | 判準(**看什麼**) | 框由誰畫 | 實例 |
|---|---|---|---|
| **A. 虛擬游標／程式游標** | 它身上有 `aria-activedescendant`;或它是函式庫管理游標的項目(cmdk `data-selected` / Radix `data-highlighted`),而瀏覽器的 `:focus-visible` 看不到那個游標 | **元件自己**,畫在**被指到的那一項**上(`focus-ring-inset`;常駐清單看 `useInputModality`、會搶反白的選單看反白來歷 `useCursorMover`;容器／項目抑制瀏覽器預設外框) | TreeView 根(`tree-view.tsx:1394` showRing)/ DataTable 根 / TimePicker 欄(`time-columns.tsx` 被指到的 option)/ DropdownMenu 項(`dropdown-menu.tsx` `radixCursorClass`)/ CommandItem(`command.tsx`) |
| **B. 插入點控件** | **可機械判別**:標籤名是 `input`(`type` 為文字類:未指定 / text / search / email / url / tel / password / number)或 `textarea`,或元素帶 `contenteditable`。Field 家族控件在此之上另有 wrapper 邊框轉色(`field-wrapper.tsx:49` `focus-within:!border-primary`)。grep 判準 = `scripts/focus-suppression-registry.mjs:125-127`(往上 40 行找得到 `<input>` / `<textarea>`,或共用 style 常數所服務的檔案真的渲染該標籤) | **唯一不畫框的例外**。指示 = 閃動的插入點(caret);Field 家族再加欄位邊框轉 primary | Input / Textarea / Combobox / DatePicker / Command 與 SelectMenu 搜尋框 / AgentPromptInput |
| **C. 祖先畫框(邊框轉色)** | 從**自己往上**找,有元素在聚焦時改邊框(`focus-within:` / `:has(…:focus-visible)` / `focus-visible:border-`) | **那個元素**(可以是自己這圈外框,也可以是祖先);它就是這個 tab stop 的框 | 欄位外框自己(`combobox.tsx:857` / `time-picker.tsx:379`)/ 祖先畫(`inline-edit.tsx:396`)/ DatePicker 範圍模式兩顆鈕(另加底線區分,見下) |
| **E. 浮層程式落點** | 它 `tabIndex=-1`,而且是浮層開啟時被程式 `.focus()` 的殼 | **回規則一(問題一)**:殼本身不可操作 → 不畫;它不在 Tab 順序裡(`-1` 是 Radix 設的,不必也不能拿掉)。若某個殼是 `tabIndex≥0` 的空焦點站,修法是**拿掉 tabIndex**,不是畫框。內部控件各自有指示 | Popover / HoverCard / DropdownMenuContent / FileViewer |

> **這張表只收「可操作、但瀏覽器預設那圈不是它的框」的情況。**
> 「**不可操作**的東西」不在這裡 —— 問題一已經答完了:它根本不該可聚焦,自然也不用畫。
> 那類寫 `outline-none` 純粹是消瀏覽器預設外框的防禦。**遇到這種先回問題一,不要來這張表找位置。**
> 「選單／清單項」也不在這裡 —— 它們就是要畫(A 類或真焦點),沒有「用底色代替」這一格。

### B 類為什麼是「元素種類」而不是「元件族」

**2026-09-07 第一版把 B 寫成「Field 家族的輸入控件」,那是錯的層次。**
拿 28 個抑制點去對時當場撞牆:AgentPromptInput 的 textarea、Command 與 SelectMenu 的搜尋框
都不是 Field 家族,但它們同樣不該自己畫框 —— 而 Command / SelectMenu 的殼**根本沒有**
`focus-within` 樣式(只有一條靜態 `border-b border-divider`),連「祖先承擔」都不成立。

它們共同的、真正的指示器是**文字插入點**。文字輸入框一取得焦點就有閃動的 caret,
那本身就是「我在這裡」——這也是 WCAG 對文字欄位不另外要求外框的原因。
所以判準應該是**「它是不是 `<input>` 文字類 / `<textarea>` / `[contenteditable]`」**(看標籤名與屬性,一眼可答),
不是「它屬不屬於某個元件族」(要認得出來)。user 2026-09-09 追問「『單一狀態控制項』這個又是如何具體判別?」——
答案就是這三個標籤／屬性,而且 `scripts/focus-suppression-registry.mjs` 的 B 類證據檢查(`:112-114`)就是照這個判的。

Field 家族在此之上**額外**有欄位邊框轉 primary(`field-wrapper.tsx:49`),那是加成不是必要條件。
**`type="checkbox"` / `"radio"` / `"range"` 的 `<input>` 不是插入點控件**——沒有 caret,照規則二畫框(DS 的 Checkbox / Radio / Slider 都畫)。

### 一個承擔者只能服務一個 tab stop

判斷程序問「有沒有人畫」,但沒問「**畫的那一個分不分得出是誰**」。
`combobox.tsx:857` 那種自己畫的情況沒問題(一個元素一個 tab stop),
但 **DatePicker 的範圍模式**是兩顆 button 罩在同一圈欄位邊框裡 ——
邊框只會說「焦點在這個欄位」,不會說「在起日還是迄日」。

**規則:同一個承擔者被兩個以上 tab stop 共用時,每一顆必須另有自己的區分指示。**

DatePicker 自己早就有那個指示 —— 作用端下方一條主色粗線
(`decoration-primary decoration-2 underline-offset-4`),對照
[Ant Design RangePicker 的 `-active-bar`](https://raw.githubusercontent.com/ant-design/ant-design/master/components/date-picker/style/index.ts)
(`height: lineWidthBold, background: colorPrimary, bottom: -lineWidth`,一手 source)。
問題只是那條線原本掛在 `data-active-end`(帶 `open &&` 條件),
所以**面板關著用 Tab 在起訖之間移動時,兩顆長得一模一樣**。
2026-09-08 補上 `focus-visible:underline` —— 用的是同一條線,不是第二種指示。

機械強制:`scripts/focus-suppression-registry.mjs` 把同檔內承擔者字串相同的 C 類分組,
≥2 個就要求每一處後 8 行內有 `focus-visible:` 的非 `outline-none` 樣式。
對照組驗過:拿掉 `focus-visible:underline` → 閘紅並指名兩行;補回 → 綠。

### C 類為什麼是「從自己往上」而不是「往上」

同一次對照又撞到第二面牆:`combobox.tsx:857`、`time-picker.tsx:379` 這兩行,
**元素本身就是那圈欄位外框**(`fieldWrapperStyles` + `focus-within:!border-primary`)。
`:focus-within` 在元素自己取得焦點時也會命中,所以它們其實**有畫**,只是用邊框轉色而不是外框。
寫成「往上找祖先」會把這種情況判成無承擔者 —— 但它是全 Field 家族觸發器的標準寫法。
所以檢查範圍含自己:**問的是「這圈指示存不存在」,不是「畫在誰身上」**。

### 判斷程序:六個**查得到答案**的問題,照順序問,問到 yes 就停

刻意不用「它是哪一類」這種要靠認知的分類題 —— 那正是舊規則失效的原因(見下一節)。
每一步都指定**要去看哪個東西**,看了就有答案:

| 步 | 問題(去看什麼) | yes → | 承擔者寫什麼 |
|---|---|---|---|
| 1 | **它可以被操作嗎?**(有 onClick / onKeyDown / 是原生互動元素?) | **否 → 不畫**,而且要拿掉 tabIndex。這張表不適用 | `N`,寫「不可操作」 |
| 2 | **它的 `tabIndex` 是 `-1`,而且是某個浮層開啟時被程式 `.focus()` 的殼嗎?** | **E** — 不畫(回問題一) | 「浮層開啟時的程式落點;內部控件各自有指示」 |
| 3 | **它身上有 `aria-activedescendant`,或它是 cmdk / Radix 管理游標的項目嗎?** | **A** — 容器不畫瀏覽器那圈,框由元件畫在被指到的那個元素上(常駐清單:鍵盤模態 `useInputModality`;會搶反白的選單:鍵盤來歷 `useCursorMover`) | 那個元素／那條 class 的 file:line(例:`tree-view.tsx:1394` 的 `showRing`)|
| 4 | **它的標籤名是 `input`(文字類)或 `textarea`,或帶 `contenteditable` 嗎?** | **B** — 不畫,插入點(caret)就是指示 | 「caret」,外框另有 focus 樣式時一併寫上 |
| 5 | **從自己往上找,有沒有元素在聚焦時改邊框?**(`focus-within:` / `:has(…:focus-visible)` / `focus-visible:border-`) | **C** — 不另外畫外框,那圈邊框就是指示 | 那個元素的 file:line 與 class(自己也算)|
| 6 | **以上皆否** | **要畫**(幾何走「框怎麼畫」) | — |

**沒有第七條。** 走到第 6 步就是要畫,不能再發明理由。
**2026-09-09 刪掉的那一步**是舊第 6 步「它是選單／清單項且沒被選中 → 用 hover 同色底不畫框」——
它從來不是 user 的決定(來源總帳),而且跟規則二直接矛盾。

三個刻意的設計:

1. **每一步都可以用 grep 或 DevTools 當場回答**,不需要判斷者「認得出」這是哪一族元件。
   第 4 步尤其重要 —— 舊規則要讀者自己認出「這是 Field 家族的輸入控件」,
   現在改成看標籤名與屬性,連沒看過這個 DS 的人也答得出來。
2. **順序不可調換**:先問「能不能操作」(問題一),再問四類,最後才是「要畫」。
   浮層落點排第 2 是因為它最容易被誤判成 A(兩者都是「容器拿到焦點」)——
   差別是浮層那個沒有 `aria-activedescendant`,一查就分得開。
3. **每一類都要求寫出承擔者是誰**,而且承擔者是**具體的 file:line 或 class**,不是「別的元素」。
   寫不出來就代表判斷錯了 —— `scripts/focus-suppression-registry.mjs` 機械強制這一點。

### 這張表之前是怎麼寫的(2026-09-07 user 問「未修改前到底怎麼定義」,原文保留)

**沒有這張表。** 全文只有兩處抽象的例外句(內容相同):

> 刻意不畫的唯一合法理由是**指示器畫在別的元素上**,而且必須指得出承擔者(file:line)。

**文字輸入這一類**(B 類)當時是靠 **規則二第三列**間接涵蓋的,原文逐字:

> | **單一狀態控制項**(文字輸入框、Textarea、Field 內的輸入)| 滑鼠與鍵盤**共用同一套 focus 樣式** | 這類沒有「懸停候選 → 確認選它」的中間態 |

**那句話說了什麼、沒說什麼** —— 這是它後來出事的原因:

| 它說了 | 它**沒**說 |
|---|---|
| 文字輸入的滑鼠與鍵盤共用**同一套** focus 樣式 | 那一套**是什麼**(我們的答案是「整個欄位的邊框轉 primary」,寫在 `field-wrapper.tsx:49`,但規則裡沒提) |
| | 所以**輸入框自己不畫框** |

也就是說,「文字編輯器不用特別畫框」**從來沒有被寫下來過** ——
讀的人要自己走三步推論:共用一套 → 那一套是外框邊框 → 所以裡面的 input 不畫。
三步都沒寫,於是:

- **Combobox 的根節點漏寫 `focus-visible:outline-none`**,全域外描邊一直畫在它上面,
  成為 Field 家族裡唯一的例外 —— 而且沒有人發現,因為規則裡本來就沒有一句話可以拿來對照它。
- 每次遇到新的輸入類控件,都要重走那三步推論一次。

現在 B 類把三步全部寫出來了:**誰承擔(`field-wrapper.tsx:49`)、憑什麼合法(實測 5.19:1 / 5.35:1 過 AA)、
以及「所以輸入框自己不畫」**,而且 `scripts/focus-suppression-registry.mjs` 要求每一處都在現場寫明承擔者。

### B 類為什麼合法 —— 有量過,不是宣稱

1px 邊框轉色**通過 WCAG AA**:實測聚焦邊框對頁面底色 **淺色 5.19:1 / 深色 5.35:1**,
遠高於 [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast) 要求的 3:1;
[2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible) 只要求「看得見」,沒有尺寸要求。

**「焦點指示器面積至少相當於 2px 厚周長」那條是 [2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance),
在 WCAG 2.2 定案版是 AAA,不是 AA。**(2026-09-07 勘誤:我先前把條號與等級都講錯,
並據此建議「全 Field 家族加 2px 內描邊」—— 那個建議的前提不成立,已撤回。)

所以 B 類**不需要**再加一個框;加了反而違反下一節「一個項目只有一個指示器」。
2026-09-07 抓到的唯一例外是 Combobox 的根節點漏寫 `focus-visible:outline-none`,
全域外描邊一直畫在它上面 —— 已補上,家族恢復一致。

---

## 問題二:畫在外面還是裡面?

**先講清楚:規則講的一直是「拿到焦點的那個元素」,不是它住的容器。**
(user 2026-09-07 指出我先前沒講明,造成「SelectMenu 自己往裡畫」的誤解。)
用 SelectMenu 舉例:規則管的是**選項**,不是那個會捲動的清單。

**判準(user 2026-09-07 逐字定調):**

> **預設就是往外長。**
> **只有當元素「可能合法地被塞在四周沒有足夠視覺空間的地方」,才往內長。**

機械化的量法:量「被聚焦的那個元素」四邊到最近**正當障礙**的距離,取最小值。
**≥ 4px → 往外**(`outline-offset: 2px`)/ **< 4px → 往裡**(`outline-offset: -2px`)。

### 「正當障礙」—— 這是本判準最容易做錯的地方

障礙 = 會碰撞的鄰居 **或** 會切掉框的邊界。但**它必須是設計上真的存在的邊界,不是一個 bug 造出來的**。

**量到 < 4px 時,第一個問題永遠是「這個障礙為什麼在這裡」,不是「那就往內畫」。**

實際踩過的坑(2026-09-07,user 質疑「四周視覺明明是空的,為何要往內描邊」後查出):
DataTable 的 boolean 儲存格,量到勾選框四邊淨空 0px → 先前判「往內」。
但**到儲存格邊其實有 11.5 / 62 / 11.5 / 12 px 空白** —— 卡住它的是一個
`truncate min-w-0`(padding 0、`overflow:hidden`)的**文字截斷** wrapper,
而勾選框永遠不需要文字截斷。**那不是正當障礙,是 bug。**
正解是修 wrapper(`data-table.tsx:2085` 的 `isKnownCompound` 補 `boolean`),
不是讓焦點框改成內描邊去遷就它。

**判斷「正當」的問句**:如果這個障礙消失,畫面會不會壞?
- 會壞(例:Tabs 的 tab 高度就等於分頁列高、Calendar 事件 tile 之間的 2px gap 就是格線)→ **正當,往內**(2026-09-09 訂正:原例「Avatar 的 16px 槽剛好包住」是錯的 —— 移除 × 是 12px 鈕、旁邊是疊在一起的頭像,不算鄰居,實測往外)
- 不會壞、甚至更好(例:勾選框外面那層文字截斷 span)→ **不正當,去修它,然後往外**

### `overflow` / 可捲動與否**完全不進判準**(2026-09-07 三次訂正)

先前兩版都把 `overflow` 寫進判準,兩次都是錯的:
- 第一版「祖先 overflow 不是 visible 就往裡」→ **看寫法不看設計**(user 抓)
- 第二版「可捲動容器該軸淨空視為 0,改用 `scroll-margin`」→ **過度設計而且沒必要**(user 追問後自查)

**為什麼不必要**:元素四周的空間會**跟著元素一起捲**。一顆在列內上下各留 6px 的圖示鈕,
不論被捲到哪裡,框都畫在那 6px 裡面,不會超出去被裁。
**裁切邊只有在元素本來就貼著它時才成為障礙 —— 而那種情況「四周淨空 < 4px」本來就已經涵蓋。**

所以不需要 `scroll-margin`、不需要判斷容器會不會捲、也不需要看 `overflow` 寫了什麼。**量距離而已。**

### 驗算(五個案例,各自唯一解)

| 被聚焦的元素 | 四周最小淨空 | 結論 |
|---|---|---|
| **SelectMenu 的選項**(不是 SelectMenu)| **0** —— 滿版貼齊、選項間無 gap、清單 `overflow-x-hidden` | **往裡** |
| **側邊欄列右邊那顆 20px 圖示鈕**(不是側邊欄)| **6px** —— 列高 md 32、鈕 20,上下各 6 | **往外** |
| **單一個 tab**(不是 tab 列)| **0** —— tab 高 = 列高(`tabs.tsx:502-504`)| **往裡** |
| **PeoplePicker 的移除 ×**(不是頭像)| 12px 鈕;左右 1.64 / −0.02px 是**疊在一起的頭像**,不算鄰居;無裁切祖先 | **往外**(2026-09-09 訂正:原寫「填滿 16px 槽 → 往裡」與下方實測表、實作 `person-display.tsx` 外框 +2px 三者矛盾,以實測為準)|
| **單張縮圖**(不是縮圖列)| 依縮圖間距,待實測 | 量了才知道 |

**五列都是「元素」不是「容器」。** 容器不是被聚焦的東西,自然不畫框 ——
除非容器自己有 `tabIndex`,那它就是被聚焦的元素,一樣套同一條判準。

### 同一個元件會不會有兩種畫法?(2026-09-09 user 問;AI 依既有判準推導,無新取捨)

**一個元件一種畫法。** 判準量的是「這個元素在它**設計上的位置**四周有多少正當淨空」,不是拿最極端的情況、
也不是執行期逐個實例去量。所以:

- 每個元件(元素種類)在規格裡只有一個答案:按鈕、DateGrid 日期格、SidebarMenuAction、PeoplePicker 的移除 ×(12px 鈕,左右是疊在一起的頭像,不算鄰居)往外;選單項、tab、Calendar 事件 tile(tile 之間 gap 2px)往內。
  答案寫在該元件的 class 上(往外 = 什麼都不寫;往內 = `focus-ring-inset`),閘 `scripts/focus-suppression-registry.mjs` 對著 class 查。
- 同一個底層元件被**另一個元件**放進貼邊的位置(例:Calendar 把事件 tile 排成 gap 2px 的格子),往內的決定由**那個外層元件**的規格與 class 承擔,
  底層元件本身維持預設往外 —— 不是底層元件自己長兩套。驗算表裡的「Calendar 事件 tile」(gap 2px → 內)與「SidebarMenuAction」(四周有餘 → 外)
  就是同一種可聚焦元素在兩個宿主裡各有一個答案,而各自的答案都只有一個。
- 「可能合法地被塞在四周沒有足夠視覺空間的地方」(判準原句)指的就是「規格允許的位置裡有一種是貼邊的」,那個元件就整個往內
  (選單項永遠撐滿列、tab 永遠等於列高),不是「大多數時候有空、偶爾貼邊就兩種都畫」。真的有兩種正當位置、淨空又不同,
  那是兩個元件(或一個 variant),在規格裡分開命名,不在執行期量。

### 附帶要問的 root cause(user 2026-09-07 指出)

> 「甚至其實可能值得討論的是這種元件到底為何要設定 overflow 吧?」

**對。** 若一個容器**永遠不會捲、四周也很空**,那個 `overflow` 通常是防禦性地加上去、沒有真正用途的。
遇到這種情況,**先問它為什麼存在**,而不是讓焦點框去遷就它。
把不必要的 `overflow` 拿掉,常常同時解掉焦點框、陰影被切、浮層被裁三件事。
掃修時發現這類容器,列進 root-cause 清單,不要只改焦點框。

## 套回實測值驗證(六組各自只得到一個答案)

| 元件 | 實測 | 判準命中 | 結論 |
|---|---|---|---|
| PeoplePicker 移除 × | 左右鄰居 1.64px / −0.02px,**但都是疊在一起的頭像** | 疊層不算鄰居 → 無限制;無裁切祖先 | **外 +2px** |
| AgentPanel 思考過程 | 下方鄰距 **0.00px**(正常流內容) | A(0 < 4) | **內 −2px** |
| DateGrid 日期格 | 上右下三面各 **4.00px** | 都不命中(4 ≥ 4、無裁切祖先) | **外 +2px** |
| Calendar 事件 tile | 上方 4.00px,但 **tile 之間 `gap-0.5` = 2px** | A(取最小 2 < 4) | **內 −2px** |
| Field 唯讀三兄弟 | 上方 FieldLabel **4.00px** | 都不命中 | **外 +2px** |
| SidebarMenuAction | 四周有餘 | 淨空 ≥ 4 | **外 +2px** |
| Tabs trigger | tab 高 = 分頁列高(`tabs.tsx:502-504`)→ 上下淨空 **0** | 淨空 < 4 | **內 −2px** |
| Avatar 內的 × | 12px 鈕,疊在一起的頭像不算鄰居 → 無限制 | 都不命中 | **外 +2px**(2026-09-09 訂正,與上表 PeoplePicker 列一致)|

> **2026-09-07 訂正**:上面這三列原本是用「判準 B(祖先有非-visible overflow)」判的,
> 而判準 B 在同一份文件上一節已經被**撤回**(v3 把 `overflow` 完全踢出判準)——
> 文件裡同時存在「overflow 不進判準」與「因為 overflow 所以往內」兩個結論,兩兩不相容。
> 改用 v3 的唯一判準(量淨空)重判:Tabs 結論不變(本來就淨空 0);Avatar 的 × 於 2026-09-09 再訂正為往外(疊在一起的頭像不算鄰居,見實測表),
> **SidebarMenuAction 反轉為外描邊** —— 它四周有餘,先前純粹是被撤回的判準判進去的。

### 判準演進紀錄(三次訂正,全部由 user 抓出)

| 版本 | 判準 | 為什麼錯 |
|---|---|---|
| v1 | 祖先 `overflow` 不是 `visible` 就往裡 | **看寫法不看設計**。永遠不捲、四周又空的容器,框根本不會被切,硬判往裡會造成「明明有空間卻縮在裡面」 |
| v2 | 可捲動容器該軸淨空視為 0,配 `scroll-margin` | **過度設計**。元素四周的空間會跟著元素一起捲,框畫在那個空間裡就不會被裁 |
| **v3(現行)** | **只量被聚焦元素四周最小淨空,`≥ 4px` 往外、`< 4px` 往裡** | — |

v3 之所以能把 `overflow` 完全踢出判準,是因為**裁切邊只有在元素貼著它時才成為障礙**,
而那種情況「淨空 < 4px」本來就涵蓋了。一條尺量到底。

**v3 上線時漏做的一件事(2026-09-07 補)**:換判準之後,**先前用舊判準判過的結論必須整批重判**,
不能只改判準的敘述。實際漏了三列(SidebarMenuAction / Tabs / Avatar),其中一列結論因此是錯的。
往後任何判準改版,一律連帶重跑既有結論表 —— 判準與結論不同步 = 文件自我矛盾,
而矛盾在單句層級恆為隱形(每一句單看都成立)。

## 不需要為它開分支的兩件事

- **元素太小畫不了內描邊**:DS 內不存在。最小是 12×12 的移除鈕,內描邊往內 2px 仍留 8px 核心。
  (幾何上限:元素 < 8px 時內描邊會吃掉本體。若未來出現,那是設計問題不是幾何問題,單獨處理。)
- **圓角**:`outline` 跟隨 `border-radius`,不必特別處理。
- **元素自己有 `overflow: hidden`**:實測不裁 outline(裁的只有祖先),不影響判準。

## 這條規則的來源總帳(M36)

| 條目 | 出處 |
|---|---|
| 「預設外 +2px,放不下就內 −2px,只有兩種」 | **user 2026-09-07 拍板**:「A5畫框」+「關於t2如果內描邊沒問題就內描邊,這樣至少不會又多一種」 |
| 4.00px 算放得下(`≥ 4` 不是 `> 4`) | **user 2026-09-07 逐字**:「算啊」 |
| 祖先有 overflow 就算會被裁,不問實際會不會捲 | **user 2026-09-07 逐字**:「確認實際不會被捲就算是會被裁啊」 |
| 疊層/徽章不算鄰居 | **user 2026-09-07 逐字**:「這種堆疊起來的不算是有被堆疊的相關元素限制吧?換言之 avatar 的 x 應該是往外畫框吧?」 |
| 「取四周最小值、不逐邊混搭」 | **AI 推導**,為了讓判準有唯一解;user 未逐字裁示 |
| 「元素 < 8px 不開分支」 | **AI 依實測**:DS 內不存在該尺寸的可聚焦元素 |

---

# 遷移完成紀錄(2026-09-07)

user 2026-09-07 拍板「A9用甲啊」(全域 `outline`),附條件是「確保在做到理想狀態後都沒有缺點
且不會改壞任何東西」。下面是那個條件的交代。

## 收斂結果:5 種幾何 → 2 種,而且兩種都不用元件自己寫值

| | 怎麼寫 | 住在哪 |
|---|---|---|
| **外描邊**(預設) | **什麼都不寫** | `styles/base.css` 的 `:focus-visible` |
| **內描邊** | `focus-visible:focus-ring-inset`(真焦點)/ `focus-ring-inset`(虛擬游標) | `styles/base.css` 的 `@utility` |

遷移前是:全域 outline + `ring-offset-1`(17 處)+ `ring-offset-2`(6 處)+ `ring-2` 無 offset(15 處)
+ `ring-inset`(2 處)。**絕大多數元件的改法是「刪掉那串 class」**,不是新增樣式。

## 順帶修掉的三件事(都不是為了修它們才做,是遷移的必然結果)

1. **深色主題露白邊**:`--tw-ring-offset-color` 預設 `#fff` 且 `inherits:false`
   (寫進 `:root` 完全不生效、還靜默無錯),全 repo 0 處覆寫 → 那 22 處在深色下都露一圈不透明白。
   遷移後間隙是透明的。實測:遷移前 22 站有白邊,遷移後 **0 站**(唯一剩下的 box-shadow 是
   skip link 的正當投影)。
2. **高對比模式下完全沒有焦點框**:`box-shadow` 在 forced-colors 下被強制 `none`(MDN 明文),
   而 `outline` 會照畫。原本 20 個「`outline-none` + ring」的元件在那個模式是全裸的。
3. **`--neutral-selected-focus` 退役**:user 拍板畫框之後它自然沒人用(5 處全遷),token 已刪。
   順序是「先補框、再退役」——先刪會讓 4 處退化。

## 「不會改壞」是怎麼驗的

不是逐站用眼睛看,是兩支機械閘:

- **靜態** `scripts/focus-geometry-invariant.mjs`(selftest 9/9):守「只准兩種幾何」。
  R1 禁 `ring-offset-*` / R2 禁 `focus-visible:ring-*` / R3 禁 `outline-none` 與
  `focus-ring-inset` 同字串打架 / R4 禁抄全域 / R5 禁手寫內描邊三件組(必須消費 utility)。
- **動態** `scripts/focus-geometry-browser-audit.mjs`:真 Playwright、真 Tab、逐站算出框實際
  佔到的外框,再檢查它有沒有越過**會裁切的**祖先、或壓到不重疊的鄰居。
  結果:**72 站外描邊正確 / 1 站已知殘留 / 10 站無框且指示器都在別的元素上**。

### 量法踩過的坑(記著,不然下次還會犯)

第一版把「祖先的內容邊」一律當障礙,結果全 DS 每一站都量到淨空 0 —— 因為 flex 容器的內容框
本來就剛好包住子元素。**錯在:不裁切的祖先根本不會切到框**,框畫過它的內容邊什麼事都不會發生。
修正成「只有會裁切的祖先才算障礙」之後,分佈才合理(72 外 / 1 內)。

這也反過來印證了判準把 `overflow` 踢出去是對的:需要的不是「有沒有 overflow」這個布林,
而是「框畫出去會不會真的被切」這個量測。

## 一件留給 user 拍板的事 —— **2026-09-07 已撤回,不需要拍板**

我先前在這裡寫「Field 家族只有 1px 邊框,不過 WCAG 2.2 AA,建議全家加 2px 內描邊」。
**那個前提是錯的,整條建議撤回**:

- 條號與等級都講錯了 —— 「焦點指示器面積至少相當於 2px 厚周長」是
  **2.4.13 Focus Appearance,在 WCAG 2.2 定案版是 AAA**,不是 2.4.11、也不是 AA。
  AA 層級適用的是 2.4.7(要有可見指示,無尺寸要求)與 1.4.11(對比 ≥ 3:1)。
- 而且實測是過的:聚焦邊框對頁面底色 **淺色 5.19:1 / 深色 5.35:1**,遠高於 3:1。

所以 Field 家族的 1px 邊框語言**本來就合規**,不需要改。
真正的問題只有一個而且已修:**Combobox 的根節點漏寫 `focus-visible:outline-none`**,
全域外描邊一直畫在它上面,是家族裡唯一的例外(user 2026-09-07 抓到:
「combobox 不用有內描邊吧?到底為何突然加 combobox 內描邊?」——
查證後那圈框在遷移前就存在且是往外的,我只是把它改成往內;正解是跟家族一樣抑制掉)。

判準已寫進 `focus-canonical.md`「問題一之二:框由誰畫」的 B 類。

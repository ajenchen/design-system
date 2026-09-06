# Focus Canonical(鍵盤游標與焦點指示)

跨元件 SSOT:**誰能移動鍵盤游標**,以及**游標長什麼樣**。
起因是 user 2026-09-06 的問題:「那到底為何明明就有藍色外框在做同樣的事了還要加深底色?我們整個 ds 有多少類似這樣的設計?SSOT到底是什麼?」

## Authority boundary

本檔擁有**跨元件的一致性規則**。它不擁有:token 的值(owner = `tokens/color/color.spec.md`)、
單一元件的 anatomy(owner = 各元件 `*.spec.md`)、列/項目的疊加語意(owner =
`patterns/element-anatomy/item-anatomy.spec.md`)。本檔不重述那些值,只在它們之間定分工。
與 `drag-canonical.md` 同層級、同形狀(一個能力、一份跨元件契約)。

## 一句話

**鍵盤游標只由鍵盤移動;滑鼠只上色,不搬游標。**
指示器怎麼畫,由「這個元件有沒有『先懸停、再選中』的兩段式行為」決定 —— 沒有的共用一套 focus,有的必須另外畫一圈框。

## 為什麼要拆成兩個問題

因為原本的混亂來自把它們混在一起。user 的原話把這件事講得比規格書清楚:

> 「鍵盤焦點對我來說的概念很像是我讓使者者透過鍵盤去移動滑鼠…所以鍵盤焦點若在在選單選項上會同時有焦點框以及滑鼠hover上去的底色吧?但像是文字輸入框在鍵盤操作上不會有懸停再選中的兩段式行為所以可以簡單共用元件本身的 focus 狀態?」

前半句是**問題一(誰移動游標)**,後半句是**問題二(游標長什麼樣)**。分開之後兩題都只有一個答案。

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

---

## 規則二:游標長什麼樣

**判準:這個元件有沒有「先懸停、再選中」的兩段式行為?**

| 情況 | 指示器 | 為什麼 |
|---|---|---|
| **沒有兩段式**(文字輸入框、Textarea、Select 觸發器、Switch、Slider、按鈕)| **滑鼠與鍵盤共用同一套 focus 樣式**,不另外定義鍵盤版 | 這類元件沒有「hover 一個候選、再確認選它」的中間態,focus 就是唯一的互動態。DS 現況即如此:8 個元件用 `focus-within:` —— 它根本不在乎焦點怎麼來的 |
| **有兩段式**(清單列、樹狀節點、表格列、選單項)| **鍵盤游標必須是一圈框(`ring-2 ring-ring`)**;底色留給 hover 與選中 | 底色已經被兩個意義佔滿(滑鼠在這 / 這個被選中)。再拿底色深一階去表達第三個意義,三者就分不出來,而且鍵盤游標與滑鼠指標可以同時存在於不同兩列 |

**底色不表達鍵盤焦點。** 這是規則二的硬邊界,也是 `--neutral-selected-focus` 該退場的原因(見下)。

### 一律只有一個指示器

同一個元素上不得同時出現兩種焦點指示(框 + 底色深一階)。
若某元件刻意不顯示焦點指示,必須是因為**指示器畫在別的元素上**(例:`agent-panel-fab.tsx` 自身 `outline-none`,指示器由外層畫)——
這是合法的;單純沒有任何可見焦點指示則是 WCAG 2.4.7 違規。

### 內描邊 vs 外描邊

**預設外描邊**(`ring-2 ring-ring`)。**祖先會裁切時改內描邊**(`ring-inset`):捲動容器、`overflow-hidden` 面板、表格列。
理由是外描邊會被裁掉一半,視覺上變成「只有三邊」。
不統一是刻意的 —— 統一成單一種會讓其中一半的場景畫不出完整的框。
現況:`ring-inset` 只有 DataTable 與 TreeView 各 1 處,兩者都在裁切容器內,符合本規則。

---

## 現行盤點(2026-09-06 實測)

| 指標 | 數字 |
|---|---|
| 用 `focus-visible:` 的元件檔 | 47 |
| `ring-ring` 出現次數 | 85 |
| 用 `focus-within:`(即共用 focus 那類)的元件 | 8 — AgentPanel / Carousel / DataTable / Field / FileViewer / LinkInput / PeoplePicker / Select |
| `ring-inset` | 2(DataTable、TreeView)|
| `--neutral-selected-focus` 的活用法 | 5 —— DropdownMenu、SelectMenu、Sidebar、TimePicker、AgentPanel |

`bg-neutral-hover` 橫跨 131 處 / 56 檔,所以底色語彙本身是全 DS 共用的 —— 這正是不能再拿它加一階去表達第三個意義的原因。

### `--neutral-selected-focus` 的退役順序

user 已拍板刪除(原話:「題一照你建議,把焦點底色那些沒用到的token該刪的就刪一刪」)。
**但順序不能顛倒**:那 5 個活用法全在 Radix 系元件上,而 Radix 的 hover 會移動真焦點,
所以在那裡「選中 × 焦點」確實需要跟「選中 × 只是滑過」分得開 —— **先把 ring 補上,深一階底色才變成多餘**。
先刪 token 會讓這 5 處退化,是典型的改 A 壞 B。

已完成的是另外兩處**永遠不會觸發**的死用法(2026-09-06):
TreeView 的列(虛擬焦點,該列永遠不是 DOM 焦點)與 MenuItem(root 是 `<div role="option">`),
兩處的 `focus-visible:` 自加入起從未 match 過。

---

## 已知未收斂(不得當成已定案)

- **DataTable 列游標**:目前完全沒有列層級的鍵盤游標。要補之前有三個前提要先解 ——
  `role="table"` 不能合法帶 `aria-activedescendant`(需遷 `grid`/`treegrid`);虛擬捲動下 activedescendant 指向的元素必須真實存在;
  同一列在三個面板各渲染一次,IDREF 該歸誰未定。
- **Slider**:`slider.tsx:167-168` 註解明寫「不加 ring 或 halo」,以邊框變色當焦點。它不是文字輸入,在規則二下需要豁免理由或改掉。
- **DataTable 的 hover 機制與 TreeView 不同**:TreeView 用 CSS `:hover`,DataTable 用指令式寫入的 `data-[hovered]` 屬性。
  兩者在規則一下結論相同(都不移動游標),但 DataTable 那條路沒有捲動時的重新計算。

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

## 來源總帳(M36:區分 user 拍板與 AI 推導)

| 條目 | 出處 |
|---|---|
| 「按照 TreeView 的模型」 | **user 拍板**,原話「當然是按照 tree view 啊,我們不就是要確保整個ds 有SSOT有一致的設計語言嗎?」 |
| 刪掉沒用到的焦點底色 token | **user 拍板**,原話「題一照你建議,把焦點底色那些沒用到的token該刪的就刪一刪」 |
| 「能 SSOT 就要 SSOT,不夠用就擴充 SSOT,但也要以世界級的設計擴充」「這個 SSOT 本身也不能違背世界級的設計」 | **user 原話**,本檔的立檔依據 |
| 焦點框的粗細/顏色/圓角至少要一致;不顯示焦點也要有合理理由 | **user 原話**(「我認為焦點的邊框的基本樣式包括邊框粗細顏色圓角等等至少要是一致的」「若不顯示焦點標示也要有合理理由」)|
| 「兩段式行為」作為規則二的判準 | **user 提出、AI 採納**。user 原話是問句:「…文字輸入框在鍵盤操作上不會有懸停再選中的兩段式行為所以可以簡單共用元件本身的 focus 狀態?」 |
| 內描邊/外描邊「不統一但寫下規則」 | **AI 轉述 user 2026-09-06 裁示**,未逐字留存;規則內容(預設外描邊、祖先裁切改內描邊)為 AI 依現況歸納 |
| 規則一及其唯一例外、不外擴的理由 | **AI 依上列一手來源歸納**,非 user 決定 |

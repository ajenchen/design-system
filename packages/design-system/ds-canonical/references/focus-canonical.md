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
**指示器怎麼畫,看這個項目的底色有沒有被「選中」佔走** —— 沒佔走就用 hover 同色底(不畫框),
佔走了才需要第二個通道 —— **user 2026-09-07 拍板:畫框**(原話「A5畫框」)。幾何走「決定程序」。

## 為什麼要拆成兩個問題

因為原本的混亂來自把它們混在一起。user 的原話把這件事講得比規格書清楚:

> 「鍵盤焦點對我來說的概念很像是我讓使者者透過鍵盤去移動滑鼠…所以鍵盤焦點若在在選單選項上會同時有焦點框以及滑鼠hover上去的底色吧?但像是文字輸入框在鍵盤操作上不會有懸停再選中的兩段式行為所以可以簡單共用元件本身的 focus 狀態?」

前半句是**問題一(誰移動游標)**,後半句是**問題二(游標長什麼樣)**。

分開之後,**問題一有唯一答案**(規則一),**問題二只有一半有答案**(規則二前兩列),
剩下的「選中 × 游標」那格是真取捨,列在下面等拍板。

一處要對這段引文誠實勘誤:引文假設選單選項會「同時有焦點框以及滑鼠 hover 上去的底色」。
查證後**選單沒有焦點框** —— DS 既有 canonical(`menu-item.spec.md:301`)與 Material / Radix / cmdk
一致,選單選項的鍵盤焦點就是那個 hover 底色本身,不另外畫框。引文的直覺(鍵盤在幫我移動滑鼠)是對的,
「還會多一個框」這半不成立。

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

## 規則二:游標用哪個通道

**判準:這個項目的底色有沒有被「選中」佔走?**

| 情況 | 指示器 | 依據 |
|---|---|---|
| **底色空著**(選單／清單選項,未被選中)| **用 hover 同色底,不畫框** | 既有 owner `menu-item.spec.md:301`「以 `bg-neutral-hover` 背景高亮…而非畫 outline ring」,附 Material / Radix / cmdk 三家對照 |
| **底色被佔走**(該項同時是選中的)| **畫框** | **user 2026-09-07 拍板**,原話「A5畫框」。幾何走下方「決定程序」 |
| **單一狀態控制項**(文字輸入框、Textarea、Field 內的輸入)| 滑鼠與鍵盤**共用同一套 focus 樣式** | 這類沒有「懸停候選 → 確認選它」的中間態 |

**按鈕不屬於第三列。** 按鈕用滑鼠點下去不顯示焦點框(`:focus-visible` 啟發式:指標點按鈕不視覺化焦點,
文字輸入框取得焦點要視覺化)。真正「滑鼠鍵盤共用」的只有文字輸入類。

### 一個項目只有一個指示器

同一個元素上不得同時出現兩種焦點指示(框 + 底色深一階)。
刻意不畫的唯一合法理由是**指示器畫在別的元素上**,而且必須指得出承擔者(file:line)。
指不出來就是 WCAG 2.4.7 違規。

### `--neutral-selected-focus` 的處置

user 2026-09-07 拍板畫框之後,「選中 × 鍵盤游標」不再用深一階底色。
**順序**:先把框補上,那個 token 才變成沒人用;**先刪會讓 4 處退化**(DropdownMenu `:321`/`:513`、
SelectMenu `:490`、AgentPanel `:280`、Sidebar `:949`)。補完框再退役。

## 現行盤點(2026-09-06 實測)

| 指標 | 數字 |
|---|---|
| 用 `focus-visible:` 的元件檔 | 47 |
| `ring-ring` 出現次數 | 85 |
| 用 `focus-within:`(即共用 focus 那類)的元件 | 8 — AgentPanel / Carousel / DataTable / Field / FileViewer / LinkInput / PeoplePicker / Select |
| `ring-inset` | 2(DataTable、TreeView)|
| `--neutral-selected-focus` 的用法 | **4 活 + 1 死** —— 活:DropdownMenu / SelectMenu / AgentPanel(皆虛擬游標)、Sidebar(真 DOM 焦點且無 ring);死:TimePicker |

`bg-neutral-hover` 橫跨 131 處 / 56 檔,所以底色語彙本身是全 DS 共用的 —— 這正是不能再拿它加一階去表達第三個意義的原因。

## 已知未收斂(不得當成已定案)

- **DataTable 列游標**:目前完全沒有列層級的鍵盤游標。要補之前有三個前提要先解 ——
  `role="table"` 不能合法帶 `aria-activedescendant`(需遷 `grid`/`treegrid`);虛擬捲動下 activedescendant 指向的元素必須真實存在;
  同一列在三個面板各渲染一次,IDREF 該歸誰未定。
- **Sidebar 選單鈕沒有 ring(依 2026-09-07 拍板應補框)**:`sidebarMenuButtonVariants`(`sidebar.tsx:913-`)全段無 `focus-visible:ring`,鍵盤焦點**只有底色**(`:939` 非當前項用 hover 色 / `:949` 當前項深一階)。它是真 `<button>`、真 DOM 焦點,卻是全 DS 唯一「真焦點但只用底色」的地方。同檔 `SidebarGroupAction`(`:850`)反而有 ring。要不要補 ring 屬上節那題,未拍板。
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
| ~~「兩段式行為」作為規則二的判準~~ | **2026-09-06 撤回**。user 原話是問句(「…文字輸入框在鍵盤操作上不會有懸停再選中的兩段式行為所以可以簡單共用元件本身的 focus 狀態?」),我把問句當成判準並外推到選單與按鈕,結果與既有 owner `menu-item.spec.md:301` 相反。現行判準改為「底色有沒有被選中佔走」,那是**既有 canonical 本來就有的答案**,不是新規則 |
| `--neutral-selected-focus` 退役 | 2026-09-06 我曾放大 user 原話(user 說的是刪「沒用到的」)並撤回;**2026-09-07 user 拍板「A5畫框」後,補完框它才會沒人用 → 屆時退役**。順序不可顛倒 |
| 內描邊/外描邊「不統一但寫下規則」 | **AI 轉述 user 2026-09-06 裁示**,未逐字留存;規則內容(預設外描邊、祖先裁切改內描邊)為 AI 依現況歸納 |
| 規則一及其唯一例外、不外擴的理由 | **AI 依上列一手來源歸納**,非 user 決定 |

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

## 問題二:畫在外面還是裡面?

**預設外描邊**:`outline: 2px solid var(--ring)` + `outline-offset: 2px`(對外佔 **4px**)。
這就是全域 `styles/base.css:44-47`,所以多數元件是**刪掉自己那串 class** 讓全域接手,不是新增樣式。

**改內描邊**(`outline-offset: -2px`)只有兩個理由,滿足任一即改:

| 理由 | 判準 |
|---|---|
| **A. 空間不夠** | 四周**最小**淨空 **< 4px** |
| **B. 會被裁** | 任何祖先的 `overflow` 不是 `visible` |

理由 B **不問它實際會不會捲**(user 2026-09-07 逐字:「確認實際不會被捲就算是會被裁啊」)。
寫了就算 —— 這樣判準不必在執行期評估捲動狀態,靜態就能決定。

## 問題三:淨空怎麼算?

- **取四周最小值**。任一邊不足就整個改內描邊,不做逐邊混搭。
- **正好 4.00px 算放得下**(user 2026-09-07 逐字:「算啊」)。判準是 `≥ 4`,不是 `> 4`。
- **只算同層、正常流、會真的碰撞的鄰居。**
- **不算**:疊在上面的裝飾或徽章(例:頭像角上的移除 ×)、絕對定位的疊層。
  user 2026-09-07 逐字:「這種堆疊起來的不算是有被堆疊的相關元素限制吧?換言之 avatar 的 x 應該是往外畫框吧?」

**只有兩種幾何,不得出現第三種。** 沒有 0 間隙、沒有 1px。

## 套回實測值驗證(六組各自只得到一個答案)

| 元件 | 實測 | 判準命中 | 結論 |
|---|---|---|---|
| PeoplePicker 移除 × | 左右鄰居 1.64px / −0.02px,**但都是疊在一起的頭像** | 疊層不算鄰居 → 無限制;無裁切祖先 | **外 +2px** |
| AgentPanel 思考過程 | 下方鄰距 **0.00px**(正常流內容) | A(0 < 4) | **內 −2px** |
| DateGrid 日期格 | 上右下三面各 **4.00px** | 都不命中(4 ≥ 4、無裁切祖先) | **外 +2px** |
| Calendar 事件 tile | 上方 4.00px,但 **tile 之間 `gap-0.5` = 2px** | A(取最小 2 < 4) | **內 −2px** |
| Field 唯讀三兄弟 | 上方 FieldLabel **4.00px** | 都不命中 | **外 +2px** |
| SidebarMenuAction | 四周有餘,**但住在 `SidebarContent` 的 ScrollArea 內**(`sidebar.tsx:613-616`,Root 為 `overflow-hidden`)| **B** | **內 −2px** |
| Tabs trigger | 捲動殼 `overflow-y-hidden` | **B** | **內 −2px** |
| Avatar 內的 × | 槽 `w-4 h-4 overflow-hidden` | **B** | **內 −2px** |

### 一條容易漏判的推論(2026-09-07 訂正)

判準 B 是**祖先鏈全掃**,不是只看最近一層,也**不看元素離裁切邊多遠**。
先前 SidebarMenuAction 被判「四周有餘 → 外描邊」是錯的 —— 它住在 `SidebarContent` 的
ScrollArea 內(`sidebar.tsx:613-616`,Root 是 `overflow-hidden`),命中 B 就該內描邊。
理由正是 user 的裁示:**寫了就算,不問實際會不會捲**。
這也順帶消化掉「元素被捲到容器邊緣時淨空歸零」那個情境 —— 判準 B 先命中,根本不會走到量淨空那一步。

**兩條判準的優先序:先問 B(有沒有裁切祖先),命中就結束;沒命中才問 A(量淨空)。**
這樣既不會漏判,也不需要在執行期評估捲動位置。

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


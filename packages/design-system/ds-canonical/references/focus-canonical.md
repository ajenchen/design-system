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

**「指示器」不限於框。** 底色深一階、邊框變色、選取框、外描邊 —— 都算。
所以「外描邊 + 邊框變色」也是兩個,不是只有「框 + 底色」才算
(2026-09-07 錨:Slider 改用全域外描邊時,原本的 `focus-visible:border-primary-hover`
忘了一起刪,同一顆把手上就有了兩個;而且那個變色與 hover 同色,反而讓
「鍵盤在這裡」與「滑鼠經過」長得一樣)。

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

## 問題一之二:**什麼情況明確不用畫框**(2026-09-07 補;user 要求「應該明確不用畫鍵盤焦點框的原則吧」)

問題一給的是判準(可不可以被操作),但「可以操作卻不用自己畫框」的合法情況一直只寫成一句
「指示器畫在別的元素上」,太抽象、每次都要重新想。下面把它拆成**四類**,是 2026-09-07
用真瀏覽器逐站 Tab 過去、把全 DS 所有「聚焦了但自己沒畫框」的站點分類出來的結果
(`scripts/focus-geometry-browser-audit.mjs`,當次 10 站,全部落在這四類內)。

**共同前提**:四類都要指得出**承擔者是誰**(file:line)。指不出來就是要畫,沒有第五類。

| 類 | 什麼情況 | 指示器在哪 | 實例 |
|---|---|---|---|
| **A. 虛擬游標** | DOM 焦點停在容器,「目前是哪一個」由 `aria-activedescendant` 指出 | 畫在被指到的那一列上 | TreeView 根容器(`tree-view.tsx:958` 抑制自己)/ TimePicker 欄 |
| **B. Field 家族的輸入控件** | 文字輸入、Textarea、以及 `role=combobox` 的觸發器 | **整個欄位的邊框轉 primary**(`field-wrapper.tsx:49` `focus-within:!border-primary`)—— 這是規則二第三列「滑鼠與鍵盤共用同一套 focus 樣式」的落地 | Input / DatePicker / TimePicker / Select / Combobox |
| **C. 隱形的整列觸發器** | 為了讓整列可用鍵盤啟動而疊一顆 `opacity-0` 的滿版鈕 | 畫在**列**上,由該鈕觸發 | FileItem(`file-item.tsx` 的 `data-row-focus-target`)/ InlineEdit(`:409`,承擔者在 `:402` 註明的外層) |
| **D. 選單／清單的未選中項** | 底色空著,就用底色當游標 | `bg-neutral-hover` 本身 | MenuItem / DropdownMenu / cmdk / SidebarMenuButton 的非當前項(規則二第一列)|
| **E. 浮層開啟時的程式聚焦落點** | 浮層打開時把焦點送進容器本身(讓 AT 讀到),使用者**不是**自己 Tab 過去的 | 不畫。容器內每個可操作元素各自有自己的指示器 | Popover / HoverCard / DropdownMenuContent / FileViewer 的 dialog 殼(皆 `tabIndex=-1`)|

> **這張表只收「可操作、但自己不畫」的情況。**
> 「**不可操作**的東西」不在這裡 —— 問題一已經答完了:它根本不該可聚焦,自然也不用畫。
> 那類寫 `outline-none` 純粹是消瀏覽器預設外框的防禦(例如 `pointer-events-none` 的分組標題、
> 不可點的步驟、圖表內層的 SVG group)。**遇到這種先回問題一,不要來這張表找位置。**

### 判斷程序(照順序問,問到有答案就停)

1. **它可以被操作嗎?** 不行 → 不畫,而且要**拿掉 tabIndex**(問題一)。這張表不適用。
2. **它是浮層被打開時的程式落點嗎?**(`tabIndex=-1` + 開啟時 `.focus()`)→ **E**,不畫。
3. **焦點停在容器、由 `aria-activedescendant` 指出目前是哪一個嗎?** → **A**,容器不畫、那一列畫。
4. **它是 Field 家族的輸入控件嗎?**(整個欄位的邊框轉 primary 就是指示)→ **B**,不畫。
5. **它是為了整列可鍵盤啟動而疊的隱形滿版鈕嗎?** → **C**,自己不畫、列上畫。
6. **它是選單/清單裡**未被選中**的項嗎?**(底色空著)→ **D**,用 hover 同色底當游標。
7. **以上都不是** → **要畫**。沒有第八條。

每一步都是「看得出來就答得出來」的問句,不需要判斷者自行權衡。
落在 A–E 任一類時,**必須在該處寫下承擔者是誰**(file:line 或 class 名)——
寫不出來就代表其實不屬於那一類。

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
- 會壞(例:Tabs 的 tab 高度就等於分頁列高、Avatar 的 16px 槽本來就設計成剛好包住)→ **正當,往內**
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
| **頭像角上的 ×**(不是頭像)| **0** —— 填滿 `w-4 h-4` 槽 | **往裡** |
| **單張縮圖**(不是縮圖列)| 依縮圖間距,待實測 | 量了才知道 |

**五列都是「元素」不是「容器」。** 容器不是被聚焦的東西,自然不畫框 ——
除非容器自己有 `tabIndex`,那它就是被聚焦的元素,一樣套同一條判準。

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
| Avatar 內的 × | 填滿 `w-4 h-4` 槽 → 四周淨空 **0** | 淨空 < 4 | **內 −2px** |

> **2026-09-07 訂正**:上面這三列原本是用「判準 B(祖先有非-visible overflow)」判的,
> 而判準 B 在同一份文件上一節已經被**撤回**(v3 把 `overflow` 完全踢出判準)——
> 文件裡同時存在「overflow 不進判準」與「因為 overflow 所以往內」兩個結論,兩兩不相容。
> 改用 v3 的唯一判準(量淨空)重判:Tabs 與 Avatar 結論不變(它們本來就淨空 0),
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

判準已寫進 `focus-canonical.md`「問題一之二:什麼情況明確不用畫框」的 B 類。

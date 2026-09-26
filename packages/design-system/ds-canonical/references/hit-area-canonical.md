# Hit Area Canonical(可點範圍)

跨元件 SSOT:**滑鼠點得到的那塊,跟眼睛看得到的那塊,是不是同一塊。**
起因是 user 2026-09-24 的裁示:「重點是要讓 inline action 的可點擊範圍跟其 hover 底色一樣吧?都是 18*18」。
這件事 2026-09-04 已經在 AgentPanel 入口鈕上被拍板過一次,本檔把它從「那一顆鈕的規格」升成**全 DS 預設**。

## Authority boundary

本檔擁有**跨元件的一致性規則**:可點範圍與可視形狀的關係、唯一例外的形狀分類、外擴的硬限制。
它不擁有:各元件的實際尺寸值(owner = 各元件 `*.spec.md` 與 `patterns/element-anatomy/inline-action.spec.md`)、
焦點框怎麼畫(owner = `focus-canonical.md`)、拖曳把手的行為契約(owner = `drag-canonical.md` + `patterns/resize-handle/resize-handle.spec.md`)。
本檔不重述那些值,只在它們之間定分工。與 `focus-canonical.md`、`drag-canonical.md` 同層級、同形狀(一個能力、一份跨元件契約)。

**焦點框與命中區是兩件事**:焦點框是鍵盤游標的指示器(畫在哪、往內往外 → `focus-canonical.md`),
命中區是滑鼠指標的目標(有多大 → 本檔)。同一顆鈕可以焦點框往內畫、命中區照樣等於可視形狀,兩者互不決定。

## 一句話

**控件的懸停回饋形狀 ≡ 它的命中區。** 會亮起來告訴你「指標在目標上」的那一塊,必須**剛好**就是那個目標。

圖示與文字是裝在裡面的**內容**,內容可以比命中區小,**不得比它大**。

⚠️ **主詞是「控件」,不是「任何可點的東西」。** 這一句的出處是 user 對**行內動作按鈕**的裁示;2026-09-24 我把它外推到資料表格的 cell 上,四家一手原始碼 0/4 支持,當天撤回。邊界見下方「適用範圍」節。

**巢狀時要逐個控件讀**(2026-09-25 對齊 user 決定;待辦總帳 C12④):可點的宿主(卡片、列、分頁)裡有自己的按鈕時,指到按鈕上會**同時亮兩塊** ——
宿主保留自己的滑過色,按鈕自己的滑過色疊在上面、沿同一把灰階再往上一階(user 選「卡片保留、按鈕再亮一層 (Recommended)」;
規則全文與措辭只住在 `packages/design-system/src/tokens/color/color.spec.md`「Hover 換色配對總則」的巢狀滑過段,本檔不重述)。
本條照樣成立:**按鈕那一塊 ≡ 按鈕的命中區**(例:行內動作鈕 18×18),而且它畫在最上面;兩塊重疊的地方,這一下點到的就是最上面那一塊。
宿主那一塊回答的是「你還在這張卡片裡」,點下去一定打到最上面亮著的那個控件 —— 所以不構成本條要防的「看到亮起來卻點不到」。
(「重疊處以最上面那一塊為準」是 AI 推導的讀法;user 的決定只到「卡片保留、按鈕再亮一層」。)

唯一例外:**先天無法當目標的線與點**(1px 分隔線、6px 指示點這一類 —— 它們連懸停回饋都畫不出可用的形狀)。
例外必須逐案在該元件 `spec.md` 寫明外擴量與世界級對照,而且外擴不得越出宿主、不得蓋住別的可點目標。

### 為什麼不寫成「命中區 = 可視形狀」(2026-09-24 user 指出這句不夠精確)

因為多數小目標**平時沒有可視邊界**。inline action 在 rest 狀態你只看得到一個 16px 圖示,那塊 18px 底色要**懸停才出現**
(`patterns/element-anatomy/item-anatomy.tsx` 的 `group-hover/action:bg-neutral-hover`)。
「可視形狀」在 rest 與 hover 兩個狀態下是兩個不同的東西,拿它當判準**等於沒定義**。

改用「懸停回饋」就精確了:它只有一個形狀,而且它本來就是用來回答「我在不在目標上」的那個訊號 —— 讓訊號與事實相等,
正是這條規則要保證的性質。

而且它要防的失敗是**單向**的:**看到亮起來卻點不到**(使用者已經收到「你在目標上」的訊號,點下去卻沒反應)。
反過來「圖示比命中區小」不構成失敗 —— 你瞄著圖示按下去一定打得中。所以規則寫成「內容 ≤ 命中區 = 懸停回饋」,
不寫成三者全等。

**沒有懸停回饋的目標怎麼辦**:那它的可視形狀本身就是唯一的訊號(例如 AgentPanel 入口鈕、一般 `Button`),
此時「懸停回饋」退化成「可視形狀」,結論不變。這也是 2026-09-04 那次裁示成立的情境。


### 適用範圍:這條規則管**控件**,不管**表格的格**(2026-09-24 撤回一次過度外推)

本條的出處是 user 對**行內動作按鈕**的裁示(「都是 18*18」)。它在控件層成立:
一顆按鈕的懸停底色會亮起來告訴你「指標在目標上」,那塊就必須剛好是命中區。

**它不適用於資料表格的 cell,而我曾經把它外推過去,那是錯的。** 2026-09-24 我用這條規則
把 DataTable 選取格的 `onClick` 拿掉,理由寫「那一格自己沒有懸停回饋」。user 當場反問
「checkbox 所在的 cell 一整個就是可以被點擊的視覺範圍啊,為何要把可觸控範圍改到只剩 checkbox?」,
去查四家一手原始碼後,**我那條前提在四家裡 0/4 成立**:

| | cell 是點擊目標? | hover 回饋畫在哪? | 垂直格線 |
|---|---|---|---|
| **AG Grid** | 是(cell DOM 掛 click / mousedown,點了就 `focusCell`) | **列**(`.ag-row-hover`)+ 選配的欄;**零條 `.ag-cell:hover`** | `columnBorder` 預設 `color: 'transparent'` |
| **MUI X Data Grid** | 是(cell 掛 6 種事件,`:focus` 有 outline) | **列**(`.row:hover`);cell 只有 `:focus` | `showCellVerticalBorder` 預設 false,純 class → 純 border,零行為 |
| **react-data-grid** | 是(mousedown → active cell) | **列**;cell 唯一的 `:hover` 是拖曳把手 | **永遠四邊都有**,無開關 |
| **Glide Data Grid** | 是(canvas 命中測試) | **格**(per col/row) | canvas 自繪 |

**「hover 畫在列、點擊目標卻是格」是常態,不是 bug。** react-data-grid 是最乾淨的反例:
每個 cell 四邊都有格線、hover 在列、選取欄 checkbox 只有 20px —— 三者形狀全不一致,而那是它的正式設計。

而且**四家沒有任何一家讓選取格的空白處變成死區**:AG Grid 聚焦該 cell(原始碼註解逐字
"we need to make sure the cell wrapping that checkbox is focused")、MUI X 該 cell 出現 focus outline、
rdg 該 cell 變 active、Glide 直接選列。

**⛔ 一併撤回我讀錯的那句 cite。** 我先前引 MUI 的
「click on checkbox should not trigger row selection」當作「整格不可點」的依據 —— 讀反了。
那句住在 `handleRowClick` 裡,跟 detail panel、actions 欄的 early-return 並列,
擋的是「這一欄已經有自己的控制項,別讓列點擊再觸發一次」。同一個檔案仍照常發 cell 事件。

**⛔ 也撤回「有格線 → 整格可點」這條因果。** 查無一手依據。真正切的那一刀是 `cellSelection`
這個 feature flag,不是格線畫不畫 —— AG Grid 的 `columnBorder` 預設就是透明色,**同一份 DOM、
同一份 JS,只差上不上色**。所以本 DS 也不依「有沒有畫格線」分流。

### 所以這條規則的邊界寫死如下

| 適用 | 不適用 |
|---|---|
| **控件**(按鈕、行內動作、指示點、把手):可見回饋形狀 ≡ 命中區,禁止可見形狀之外**沒有任何回饋**的隱形帶 | **資料表格的 cell**:格本來就是互動單位(聚焦 / range / active / 選列),它的回饋畫在列上是世界級常態 |

**列的懸停底色是掃視輔助**(IBM Carbon 逐字:row hover "should always be enabled ... even if the row
is not interactive"),它既不宣告「這一列可點」,也不用來推導「格內留白不可點」。
我先前從它推出「列不可點時,格內留白不得掛 onClick」—— **那一步是我自己加的,四家全否證,已撤回。**

## user 的兩次原話(逐字,標明哪句是哪次)

**2026-09-04(AgentPanel 入口鈕,拍板 = 首次立規)** —— 原文住在 `packages/design-system/src/components/AgentPanel/agent-panel.spec.md:443-444`:

> 「按鈕的視覺 = 觸發事件的範圍 = 會觸發 tooltip 的範圍」
>
> 「當我點擊按鈕的任何地方包括左側靠近邊邊的地方,只要還在按鈕範圍內就應該觸發事件」

同段第 445 行的「看得到的每一點都點得到、點得到的每一點都看得到」**是本 DS 規格自己的措辭,不是 user 逐字**(M36(a):
引不出原話就不得標成 user 原話)。它是上面兩句的等價改寫,本檔沿用它當口訣,但出處記在這裡。

**2026-09-24(inline action,升成全 DS 預設)** —— 對話裁示,本檔為首次落地,逐字轉錄(原話為問句語氣,依 M36 不得刪語氣詞):

> 「重點是要讓 inline action 的可點擊範圍跟其 hover 底色一樣吧?都是 18*18」

也就是:inline action 的**懸停回饋就是那塊底色**,所以命中區 = 懸停底色 = sm/md 18、lg 22;
裡面那顆 16(lg 20)的圖示是**內容**,比命中區小是正常的,不需要對齊。

## 為什麼是「相等」,不是「命中比較大一點就好」

因為命中比可視大,等於在畫面上生出一條**看不見的帶子**。`agent-panel.spec.md:449` 記的是實際踩過的後果:

> 外推會生出隱形帶,搶走底下內容的點擊,並把 Radix 錨點推遠(tooltip 離可視形狀 20px 而不是 8px)。

兩個代價都不是理論:底下內容的點擊被吃掉(使用者點的是別的東西,卻觸發了這顆鈕),以及任何掛在這顆鈕上的浮層
(tooltip / popover / dropdown)錨點跟著外推的盒子跑,距離就不再是 canonical 的那個值。
所以「多給一點好點」在 web 上不是善意,是把兩個 bug 換成一個手感。

反過來,命中比**懸停回饋**小也同罪 —— 那是使用者已經看到「你在目標上」的訊號、點下去卻沒反應
(2026-09-24 的 inline action 就是這一邊:底色 18,盒子 16,實測側欄點在底色下緣觸發的是整列導覽)。
**兩邊都錯,只有相等是對的。**

注意這一節講的「相等」兩端是**命中區**與**懸停回饋**,不是命中區與圖示。圖示是內容,本來就可以小
(見上方「為什麼不寫成『命中區 = 可視形狀』」)。把圖示也拉到 18 會讓 16px 的 icon 家族整個變形,不在本規則要求之內。

## 本 DS 不採納觸控尺寸建議(user 2026-09-24 裁示)

> 「我們在做的是 web component,不要一直拿觸控裝置的設計原則來規範,滑鼠的指標是可以比手指頭精細很多的」

這是**我們的立場**,不是對外部準則的評價:本 DS 的目標裝置是滑鼠指標,指標的落點精度遠高於指腹,
所以**不以「手指要多大才點得到」當作命中區的依據**。

已知的外部準則有這些,列在這裡是為了讓後來的人知道我們看過而且**明確不採納它們當依據**,不是拿它們背書:
[WCAG 2.5.5 Target Size (Enhanced) 44 CSS px](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)、
[WCAG 2.5.8 Target Size (Minimum) 24 CSS px](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)、
[Apple HIG buttons(44pt)](https://developer.apple.com/design/human-interface-guidelines/buttons)。

**它們是尺寸建議,不是「命中要大於可視」的授權**。同樣的話 `agent-panel.spec.md:487-490` 已經寫過一次:
要滿足這類尺寸建議,正確作法是**把可視形狀做大**,而不是在小圖示外面加一圈看不見的邊。
所以「WCAG 2.5.8 ≥24 所以命中撐到 24」這種寫法,在本 DS 一律不成立 —— 它把一條尺寸建議當成了破壞相等契約的理由。

## 唯一例外:可視形狀先天無法當目標的線與點

**判準只有一題:這個東西的可視形狀,本身有沒有可能被指標瞄準?**
1px 的線、6px 的點,不是「有點難點」,是**幾乎不可能點**——這種情況下堅持相等等於宣告它不可用。
只有這一類准許外擴。**「小」不等於「線或點」**:16px 的圖示鈕不在此列,它的可視形狀(懸停底色)完全可以當目標。

例外的四個條件,缺一不可:

1. 可視形狀是**線或點**(一個維度或兩個維度都退化到指標難以瞄準)。
2. 外擴量與**世界級對照**逐案寫在該元件自己的 `spec.md`(不是寫在本檔,也不是只寫在 tsx 註解)。
3. 外擴**不得越出宿主**。
4. 外擴**不得蓋住別的可點目標**。

### 外擴的硬限制(3 與 4 的具體檢查)

- **不得越出宿主**:外擴後的盒子仍必須落在它所屬的容器內。越界的那一截會蓋在別人的內容上,就是上面說的隱形帶。
- **不得蓋住別的可點目標**:同類目標並排時,外擴量以**相切零重疊**為上限。現成的算法在 `carousel.tsx:408`:
  點 6px + 間距 6px → 中心距 12px,所以水平只能各外擴 3px,「再寬必互搶點擊」。
- **不得蓋住別人的把手**:反過來也成立 —— 鄰居不得蓋住外擴出去的那一截。`resize-handle.spec.md:97` 已經寫明
  鄰格不得蓋住把手外側,`resize-handle.spec.md:67` 給了 `z-index: 1` 的機械作法與閘。
- **不得推遠浮層錨點**:掛 tooltip / popover 的目標,外擴會把浮層的錨點跟著推走(`agent-panel.spec.md:449`)。
  這種目標基本上就不該外擴。

## 現況盤點(2026-09-24 自行 grep;方法見末節)

「可視」= 使用者眼睛看得到的那塊(對圖示鈕而言就是懸停底色,不是圖示字面);「命中」= 真正收得到 pointer 事件的盒子。

| # | 目標 | 可視形狀 | 命中區 | 關係 | 判定 |
|---|---|---|---|---|---|
| 1 | `ItemInlineActionButton`(Tag dismiss / Field endAction / TreeItem / Menu / DropdownMenu / DataTable 巢狀 chevron / 各 panel 列 / **Sidebar 列鈕與群組鈕**全走它)| 懸停底色 18 / 18 / 22(`item-anatomy.tsx:128-132`)| 同一塊 —— 底色 span **刻意沒有** `pointer-events-none`,溢出的 1px 自己接住點擊再冒泡到 button(`item-anatomy.tsx:730`)| 相等 | ✅ **2026-09-24 依 user 裁示修正並實測**:側欄列鈕量到 按鈕盒 16×16 / 懸停底色 18×18 / 圖示 16×16;底色邊緣**內** 1px 四面探針全打到它自己,邊緣**外** 2px 四面分別打到列鈕與列文字(沒有隱形帶)。修前命中 16.75×16.75,右緣與下緣各短約 1.25px |
| 2 | `Button iconOnly`(Pagination 上下頁等)| 整個 button 盒(底色填滿)| 同一個盒 —— `aspect-square p-0`(`button.tsx:327` `ICON_ONLY_BASE`,`:487` 套用)| 相等 | ✅ |
| 3 | `AgentFabDock` 主鈕(家 40 / 貼邊 28)| button 的 border box(圓角也在 button 上)| 同一個盒,並有機械閘逐點驗(`agent-panel.spec.md:443-490`,`scripts/agent-fab-hit-area-invariant.mjs` H1/H4/H5)| 相等 | ✅ 本規則的原點 |
| 4 | `Slider` thumb | `h-4 w-4 rounded-full`(`slider.tsx:164`)| 同一個盒,無外擴 | 相等 | ✅ |
| 5 | `FileItem` 整列主動作 | 整列 | 整列;透明覆蓋 button 是 `pointer-events-none`,只收鍵盤(`file-item.tsx:251`,理由在 `file-item.spec.md:421`)| 相等 | ✅ |
| 6 | `ResizeHandle` 的 1px 線 | 1px 線(距外緣 3px)| 7px 命中區,外推 3px(`resize-handle.tsx:15`,`resize-handle.spec.md:65` `:67`)| 命中 > 可視 | ✅ **線的例外,理由與世界級對照(含 URL)已在該 spec** |
| 7 | `CarouselDots` 指示點 | 6×6 圓點(現張 24×6)| 12×24(現張 30×24);垂直 ±9、水平 ±3(`carousel.tsx:410`)| 命中 > 可視 | ✅ **點的例外,2026-09-24 逐案裁定並實測**:理由 / 外擴量 / 三家原始碼對照 / 實測數字都在 `carousel.spec.md`「指示點的命中區」。相鄰命中盒間隙 **0.00px**(相切零重疊);命中盒下緣在 carousel 根之內 3px(不越出宿主);帶底下是 carousel 視窗 div(非可點目標)。對照組:關掉 `::before` 命中收回 6×6 |
| 8 | `DateGrid` 日期格 | 28×28(md)的**圓**(`rounded-full`;懸停 1.5px 藍圈畫在它身上,`date-grid.tsx:324`)| 同一個圓(`date-grid.tsx:315` 起的 `day_button`,已無 `::before`)| 相等 | ✅ **2026-09-24 修正**:原 `before:-inset-[2px]` 名義 2px、**實測最遠外推 9.33px**(`::before` 是方的,把圓四角外面也吃進去),非線非點吃不到例外 → 移除,改用根因層作法「只在指標真的離開整張格陣時才清停留日」(MUI 同款,`date-grid.tsx:146` `data-day-grid` + `:202` / `:215`)。修後圓內 2188 點全命中 0 漏、圓外最遠 1.10px(抗鋸齒容差內);跨格不閃實測框最少 17 格,對照組拔錨點掉到 0。全文 → `date-grid.spec.md`「日期格的命中區 = 可視形狀」 |
| 9 | `Calendar` 月檢視的日期數字鈕 | 今天:24 高的 `bg-info` pill;平日:只有數字字面,沒有任何形狀(`calendar.tsx:562` 起的日期鈕)| `min-w-6 h-6` = 24×24(同上)| 相等(真正的目標是**整格**)| ✅ **2026-09-24 逐案裁定 + 實測**:懸停回饋是整格 `hover:bg-neutral-hover`,而整格正是命中區(cell div 的 onClick)。右上角數字鈕不是第二個目標,是同一目標的鍵盤入口 —— 自己零 hover 樣式(掃全 stylesheet 命中它的 `:hover` 規則 = 0 條)、平日底色恆透明、完全落在格內。24px 圓盒是**今天 pill 的高度 + 焦點框幾何**,不是最小點擊尺寸;原註解「WCAG 2.5.8 ≥24」已撤回(`calendar.tsx:550`)。全文 → `calendar.spec.md:145` |
| 10 | `SidebarGroupAction` / `SidebarMenuAction` | 懸停底色 **18×18**(實測) | 同一塊 18×18 | 相等 | ✅ **2026-09-24 兩次修正**:(1) 拿掉 `after:-inset-2 after:md:hidden` 那圈只在 `<md` 生效、每邊 8px 的隱形帶 —— 實測上下各越出宿主 `<li>` 2px 並蓋掉緊貼的下一列列鈕(兩列間距實測 0.00px);(2) 發現它們本來就是 **shadcn 原樣帶進來的手刻品**(`b7b34721`),寫死 `w-5` = **16 圖示裝在 20 盒裡**,而 `inline-action.spec.md` 的尺寸表只有 16/18 與 20/22 兩種組合,**20 兩種都不是** —— 同一個檔案 `:814` 的收合箭頭早就在消費 `ItemInlineActionButton`。依 M23 / M30 改為委派 primitive,API 隨之從 children 改成 `icon` prop(breaking,刻意不留 children 後備:M23(f))。全文 → `sidebar.spec.md`「行內動作的命中區 = 可視形狀」
| 11 | `Steps` sm 指示點 | 8×8 圓點(`steps.tsx:19-23` `INDICATOR_SIZE.sm`)| **它不是命中目標** —— 24 的盒掛在 `aria-hidden` 的 `<span>` 上(`steps.tsx:718-722`),真正可點的是整列 header(`steps.tsx:486`,`role="button"`);實測打在點正中心,收到事件的就是那一列 | 無外擴可言 | ✅ **2026-09-24 正名 + 逐案裁定**:`SM_HIT_AREA` → `SM_INDICATOR_BOX`(`steps.tsx:40`),它是排版欄寬(`INDICATOR_BOX_WIDTH`,`steps.tsx:42-46`)不是命中區。header 無懸停底色 → 依契約退化條款,判準回到可視形狀:命中 = header 自己的盒,一個 `-inset` 都沒有。全文 → `steps.spec.md`「指示點不是命中目標」 |
| 12 | `Rating` 整星 / 半星 | 每顆星自己的 24×24(md)盒;星形 glyph 是裝在裡面的**內容** | 同一個盒(整星 `rating.tsx:245-259`);半星是同一個盒左右各半(`rating.tsx:279`、`:286`)| 相等,**零外擴** | ✅ **2026-09-24 逐案裁定**:實測命中盒 = icon 盒 24×24,兩個半星區 12+12 相切零重疊、逐點擁有者地圖無一點漏接,星與星之間的 4px `gap-1` 沒有人宣稱(對照組:點下去值不變)。glyph 比盒小是契約明文允許的「內容」;若改成貼星形輪廓,星角凹口會變成點不到的死區 = 踩到契約的另一邊。MUI / rc-rate 的半星判定同樣是**盒寬的 x 比例**。全文 → `rating.spec.md`「命中區 = 每顆星自己的盒」 |
| 13 | `DataTable` 選取欄(列身格 + 表頭全選格)| checkbox 本體 16×16;懸停回饋在**整列** | **整格**(約 40px),容器 div 掛 `onClick` + `cursor-pointer` | 命中 ≠ 懸停回饋形狀 | ✅ **不適用本規則**。2026-09-24 我曾拿本規則把這格的 `onClick` 拿掉,**當天改回來** —— 四家一手原始碼顯示「hover 畫在列、點擊目標卻是格」是常態(0/4 支持我的前提),且**沒有任何一家讓選取格的留白變成死區**。完整經過寫在 `data-table.tsx` 該段長註解與上方「適用範圍」節 |
| 14 | `DataTable` 排序表頭左區 | 整個左區,懸停回饋是 `hover:text-foreground` | 同一個左區(`role="button"` + `tabIndex` 就掛在它身上) | 相等 | ✅ 同上，表格不適用本規則;這一列本來就沒有隱形帶 |

**第 4 輪掃描的完整結果(16 處非互動元素上的 onClick,逐處判定)**:合規 13 處 —— `FileUpload:278`(`role="button"` 的投放區,整區就是可視邊框內)、`FileViewer:1107`(lightbox 暗底點擊關閉,暗底本身可見)、`MenuItem:286`(整列懸停底色 = 整列命中)、`AgentPanel:1496` `:1539`(選項卡 `bg-secondary` 常駐可見,整張卡即命中;內含真 `Checkbox` + `label` 故鍵盤可達)、`Rating` ×3 / `Calendar` ×3 / `Steps` / `FileItem` 皆已在上表逐案結案。待判 3 處即本列。

**盤點方法**(可複驗,**四輪**):`grep -rn "HIT_AREA\|hitArea\|hit-area\|hitSlop"`、
`grep -rn -- "-inset-\|before:absolute\|after:absolute"`、
`grep -rn "pointer-events-none"`、
**`grep -rn "onClick" | grep -v "<button\|<Button"`(掛在非 button 容器上的點擊委派)**,
四輪掃 `packages/design-system/src`(排除 `*.stories.tsx`),
再逐檔 Read 確認「誰是 button、誰是 `aria-hidden` 的裝飾層」。第 11 列就是只靠字串會誤判、要 Read 才看得出來的那種。

⚠️ **第 4 輪是 2026-09-24 補的,補之前這份盤點是不完整的**:原本三輪全在找「元素外面長出一圈」的字串簽名,
但「把 onClick 掛到父層容器」這種形狀一個簽名都不含 —— 於是第 13 列(DataTable 選取格)整個看不見,
而「12 列」被當成「全部」。這是 M37 第八種形狀:**「沒觀察到」被當成「沒發生」**。
任何時候說這張表掃完了,先問一句:**我的儀器看得到這種形狀嗎?**

## 這條規則的來源總帳(M36:區分 user 拍板與 AI 推導)

| 內容 | 來源 | 性質 |
|---|---|---|
| 命中區 = 可視形狀(AgentPanel 入口鈕) | user 2026-09-04,原文 `agent-panel.spec.md:443-444` | **user 拍板** |
| 「看得到的每一點都點得到、點得到的每一點都看得到」這個措辭 | `agent-panel.spec.md:445` | **本 DS 規格的改寫**,不是 user 逐字 |
| 升成全 DS 預設(不只 AgentPanel) | user 2026-09-24 第 3 項裁示 | **user 拍板** |
| inline action 命中 = 懸停底色(18 / 18 / 22) | user 2026-09-24 逐字:「重點是要讓 inline action 的可點擊範圍跟其 hover 底色一樣吧?都是 18*18」 | **user 拍板**(問句語氣逐字保留) |
| 不以觸控尺寸建議當依據 | user 2026-09-24 逐字:「我們在做的是 web component,不要一直拿觸控裝置的設計原則來規範,滑鼠的指標是可以比手指頭精細很多的」 | **user 拍板** |
| 「線與點」是唯一例外形狀 | user 2026-09-24 第 3 項裁示 | **user 拍板** |
| 外擴不得越出宿主 / 不得蓋住別的可點目標 | user 2026-09-04,原文 `agent-panel.spec.md:449`(「外推會生出隱形帶,搶走底下內容的點擊」) | **user 拍板的後果敘述**,條文化由本檔完成 |
| 相切零重疊的上限算法 | `carousel.tsx:408` 既有實作 | **既有 code 的既成作法**,本檔只是引用 |
| 上表的**初次盤點**(當時 12 列) | 2026-09-24 grep + Read(三輪字串簽名) | **AI 盤點,且不完整** —— 第 13 列證明三輪掃不到「父層掛 onClick」這種形狀,已補第 4 輪 |
| 第 7 / 8 / 10 / 11 / 12 列的**逐案裁定與修正** | 2026-09-24 逐列實測(真 `page.mouse.click` + `elementFromPoint` 逐點掃描,每一條都附「該紅會紅」的對照組),依上方三條 user 裁示機械落地 | **AI 依既有裁示執行**;判定理由與實測數字住在各元件自己的 `spec.md`,本檔只記結論 |
| 第 9 列(`Calendar`) | 2026-09-24 逐案裁定 + 實測,結論在 `calendar.spec.md:145` | **AI 依既有裁示執行**;已結案改判 ✅ |
| 第 13 / 14 列(`DataTable`) | 2026-09-24 先改錯、當天依四家一手原始碼改回 | **AI 錯誤外推後撤回** —— 原因是拿控件層的規則套到表格的格,沒做 M8/M26 benchmark |
| 「列不可點時,格內留白不得掛 onClick」 | AI 2026-09-24 從 Carbon 的 row hover 句子推導 | **已撤回** —— 四家一手原始碼全否證;那一步是我自己加的 |
| 「有格線 → 整格可點」這條因果 | 推導 | **查無一手依據,不採納** —— AG Grid 的 `columnBorder` 預設就是透明色,同一份 DOM、同一份 JS,只差上不上色 |

2026-09-24 的兩段 user 原話目前**沒有 repo 內的檔案出處**(本檔是首次落地),所以逐字轉錄在上表;
日後若有人要引用,引本檔這一節,不要再改寫。

## 交叉指向

- 焦點框(鍵盤游標長什麼樣、往內往外)→ `focus-canonical.md`。**與本檔互不決定**。
- inline action 的實際尺寸表(含「可點範圍」欄)→ `packages/design-system/src/patterns/element-anatomy/inline-action.spec.md`「尺寸對照」。
- AgentPanel 入口鈕的完整推導與機械閘 → `packages/design-system/src/components/AgentPanel/agent-panel.spec.md`。
- 拖曳把手(線的例外的既有範本)→ `packages/design-system/src/patterns/resize-handle/resize-handle.spec.md`。

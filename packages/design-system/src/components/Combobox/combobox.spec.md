---
component: Combobox
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
benchmark:
  - Ant Design AutoComplete: github.com/ant-design/ant-design/tree/master/components/auto-complete
  - MUI Autocomplete: github.com/mui/material-ui/tree/master/packages/mui-material/src/Autocomplete
  - Polaris Combobox: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Combobox
---


# Combobox 設計原則

## 定位

Combobox 是**多選下拉**的輸入與顯示元件。選中值以 Tag 陣列呈現，支援單行溢出與多行換行兩種版面。**只有一條實作,不分裝置**：自建浮層選單（SelectMenu → Popover + Command（cmdk））。詳見「單一路徑（不分裝置）」段。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 Combobox 特有的原則。

**Layout Family**：本元件是 `components/Field/field-controls.spec.md` 所擁有的 **Family 4（Field control layout）** 消費者。結構繼承其 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

---

## Controlled-only rationale(Dim 26)

本元件刻意採 **controlled-only** 模式:`value` + `onChange` 為唯一狀態來源(canonical 用法必同傳;型別 optional、無 runtime 強制),不支援 `defaultValue` uncontrolled fallback。

**為什麼**:
- 內部狀態複雜(search filter / range / menu open state)跟 `value` 雙向 sync 會產生 race condition
- Consumer 幾乎一定有外部 state(form library / app state),強制 controlled 消除 ambiguity
- 本 API 目前採 controlled-only；query、value 與 async options 的 ownership 由 consumer 明確持有，避免元件內外同時維護來源不明的選取狀態

**若未來要改 dual-mode**:需引入 `useControllableState` helper + 測試 controlled↔uncontrolled switch 場景,屬 major API 擴充,目前不在 scope。

### Open-pair rationale:defaultOpen + onOpenChange,無 controlled open(2026-06-12 deep-audit R2 補)

value 軸 controlled-only;open 軸方向相反 — **uncontrolled-only**:`defaultOpen`(初始開)+ `onOpenChange`(通知 callback),無 controlled `open` prop。

**為什麼**:
- 已知需求只要「初始開 + 知道何時關」:(1) 視覺快照 — Storybook OpenSnapshot / visual-audit(M15)`defaultOpen` 一行達成;(2) DataTable cell-as-input(`DataTable/cell-registry.tsx`)— `defaultOpen` 1-step 開選單,`onOpenChange(false)` → cell exit edit mode
- open 綁內部行為:關閉自動清 search(`../SelectMenu/select-menu.tsx`「浮層關閉 → 清空搜尋關鍵字」,經 `onSearchChange('')` 叫本元件清;`searchIn='trigger'` 另在清單裡每選 / 取消一項時清,規則 `../SelectMenu/select-menu.spec.md`「搜尋關鍵字何時保留、何時清空」)/ Enter / Space / ArrowDown opener + Esc dismiss / trigger 內 inline input click 開啟、關著時在裡面打字也開啟。controlled `open` 要 consumer 忠實 echo 每一條內部 intent,漏接任一 → 卡開 / 卡關 / search 殘留
- 世界級對照:Radix Popover([radix-ui.com/primitives/docs/components/popover](https://www.radix-ui.com/primitives/docs/components/popover))/ Ant Select([ant.design/components/select](https://ant.design/components/select))/ MUI Select([mui.com/material-ui/api/select](https://mui.com/material-ui/api/select/))皆提供 controlled `open` — 它們是泛用 primitive / library,必須支援任意 orchestration;本 DS 是 opinionated form control,無真實 consumer 需求前不為「可能性」付受控成本(Rule-of-3)

**若未來要開 controlled open**:同 value 軸引入 `useControllableState` helper + 測 controlled↔uncontrolled switch,屬 major API 擴充,目前不在 scope。

---

## 何時用

- **多選場景**（使用者可選 0 個或多個）：Tag、分類、協作成員、通知訂閱
- **選項數 6+**（少於 6 且 2-5 可見的多選，用 Checkbox stack 更有效）
- **空間受限**：Table cell、toolbar filter、窄欄位 Form
- **需要搜尋或大量選項**：searchable 後可處理 50+ 選項

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 單選 | `Select` | Combobox 永遠多選；單選場景強迫使用者每次手動清除再選新的 |
| 2-5 個選項且全部可見 | Checkbox stack（`SelectionItem` 垂直排列）| 全可見 + 掃視快 + 支援描述文字 |
| 階層結構（父/子節點）| `TreeView` | Combobox 是平面選項，沒有層級概念 |
| 布林群組（多個獨立 on/off） | 多個 `Switch` | 每個開關是獨立功能，不是「從清單選」 |

### 與 Checkbox stack 的分界

兩者都能「2-5 個選項裡多選」，判斷與 Select vs RadioGroup 同構（詳見 `../Select/select.spec.md`「與 RadioGroup 的分界」），核心三角度：

- **Progressive disclosure 成本**：Combobox 藏（多一次點擊），Checkbox stack 全露
- **視覺重量**：Combobox O(1)，Checkbox stack O(n) 每個選項各一行
- **評估深度**：Checkbox stack 適合「需要仔細讀選項 / 連帶 description」（權限授予、條款勾選），Combobox 適合「label 自帶語意、快速添加」（tag、分類）

**Fallback**：表單中法律 / 權限類多選一律 Checkbox stack（完整閱讀優先，見 `../Checkbox/checkbox.spec.md`「Clamp 政策」）；Tag / 分類 / 協作成員用 Combobox。

---

## 版面模式（`wrap` prop）

| 模式 | 行為 | 適用場景 |
|------|------|---------|
| 單行（預設） | 固定高度，溢出的 Tag 隱藏，顯示 +N 指示器 | Table cell、空間受限的 Form |
| 多行（`wrap`） | 高度隨內容展開，Tag 自然換行 | 空間充裕的 Form |

### 單行溢出

- 以量測為基礎：計算可用寬度，依序放入 Tag，放不下的隱藏
- 溢出指示器 `+N` 顯示被隱藏的數量
- Hover 溢出指示器時，popover 顯示完整的隱藏 Tag 清單
- **一次掛載只量一次(2026-09-10)**:同步量一趟即定案;只有那一趟量到 0 寬(容器或任一標籤 —— 批次渲染時版面還沒算完的症狀)
  才補跑雙 rAF 的第二趟。兩個 ResizeObserver 各自吞掉 `observe()` 必送的**初始觀測**(它回報的就是同步那趟剛量過的同一個版面),
  之後每一發都是真的尺寸變了,照常重算。
  由來:虛擬捲動時每個新進視窗的儲存格都掛一次 Combobox,原本固定量兩趟 —— DataTable 全功能範例一次 40 步滾輪手勢跑 180 趟 calc、
  1,080 次幾何讀取,佔當時全表捲動幾何讀取的 45%,第二趟幾乎總是同結果。守法後同一手勢降到 540 次。
  **不可改成「捲動中延後量測」**:`ready` 早已不是視覺閘(`combobox.tsx` 的 `void ready`),初始狀態是**全部標籤都顯示**,
  延後會讓標籤在捲動中溢出儲存格。機械閘 = `scripts/overflow-indicator-containment.mjs`(11 個 story × 6 種容器寬度)。

---

## Tag 操作

### 個別移除

每個 Tag 有 dismiss 按鈕（X），點擊移除該選項。

Keyboard focus 在移除後依序交給下一個可見 Tag remove button；沒有下一個則前一個；最後一個移除後回 owner:`searchable` + `searchIn='trigger'` 時是欄位內的搜尋框(它恆在,見「邊界案例」Empty),其餘是 combobox 觸發區。焦點不可因 DOM unmount 掉到 `body`；PeoplePicker 的自訂 avatar Tag 亦走相同 `data-collection-remove` contract。**只在焦點會跟著被移除的東西一起消失時才接力**(焦點在某顆 × 或 Tag 區裡別的東西上);焦點不在 Tag 區(浮層內搜尋框握著焦點、Safari 點按鈕不給焦點)→ 不動焦點(`combobox.tsx` `focusAfterTagRemoval`;2026-09-30 前不論焦點在哪一律搬到下一顆 × 或 owner,浮層內搜尋框握著焦點時會被拉回觸發區)。**「+N」浮出清單裡的 ×** 走同一條移除路徑:焦點在那顆 × 上(滑鼠按下、搜尋框沒握著焦點時)→ 移除後交回 owner(卡片裡的 × 不在欄位的接力序上),不掉到 `body`;consumer 自訂的隱藏項(`renderHiddenTag`)一律用它的第二個參數 `onRemove` 移除 —— 自己呼叫 `onChange` 會跳過焦點接力(PeoplePicker 2026-09-30 前就是這樣,焦點掉到 body,實測)。

**搜尋框握著焦點時用滑鼠按 ×**(浮層開著、欄位內或浮層內的搜尋框都算):移除那一項,焦點與關鍵字都留在搜尋框、浮層不關 —— 觸發區 `onMouseDown` 擋預設、click 照常(判準共用 `../../lib/pointer-press.ts` `keepFocusOnPointerPress`)。同一條也管一鍵清空 ×、Tag 本體、欄位空白處,以及「+N」浮出清單裡的 Tag ×(浮出清單在另一個 portal,本元件在那張卡上掛同一支判準:`../OverflowIndicator/overflow-indicator.tsx` `onContentMouseDown` ← `combobox.tsx` `keepSearchFocus`)。世界級同做法:rc-select 選取區按在輸入框以外就擋預設(<https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/SelectInput/index.tsx#L182-L209>)、MUI Autocomplete 根元素 `handleMouseDown` 同(<https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L1316-L1329>)。四種搜尋框位置的完整焦點表住 `../SelectMenu/select-menu.spec.md`「A11y 預設」Focus 段「按清單以外的地方」。2026-09-30 前:浮層開著、打了關鍵字,按 Tag × 焦點被搬到下一顆 ×(Chrome 按鈕在 mousedown 就拿到焦點),之後打的字全部丟掉(實測)。

### 全部清除

`clearable` 在有值時顯示 clear all 按鈕，一次清除所有選項。位於最右側，ChevronDown 左邊。

**清空後焦點**:按鈕隨清空卸載 —— 焦點在它身上(鍵盤 Tab 到它按 `Enter` / 空白、或 Chrome 滑鼠按下給了焦點)時先交給 owner:`searchable` + `searchIn='trigger'` 是欄位內的搜尋框,其餘是觸發區;不掉到 `body`(與上一段 Tag × 同一個 owner,交接只有一支 `../Field/field-wrapper.tsx` `keepFieldFocusBeforeUnmount`,Select / TimePicker / DatePicker 同用)。搜尋框握著焦點、浮層開著時按它,焦點留在搜尋框(上一段)。打到一半的關鍵字一起清(兩種搜尋框位置都是;2026-09-30 起,規則與三家查證住 `../SelectMenu/select-menu.spec.md`「搜尋關鍵字何時保留、何時清空」一鍵清空列)。世界級:rc-select 清空後聚焦容器(<https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/BaseSelect/index.tsx#L711-L721>)。2026-09-30 前:鍵盤按「清除全部」後焦點落在 `body`(實測,PeoplePicker 多選「一鍵清空」)。

### 新增選擇

(2026-09-18 移除)此段原本描述觸控裝置的原生 `<select>` 只列未選中選項;該路徑已整個移除,見「單一路徑（不分裝置）」。

### 欄位內搜尋框的寬度(`searchIn='trigger'`;2026-09-30 取代 60px 固定下限)

**規則**:欄位內搜尋框的最小寬 = **打的字的寬 + 插入點**,空的時候只剩插入點;它仍吃掉這一列剩下的空間(點那裡照樣是點輸入處),最寬到整列(字比整列還長時停在整列寬、在框裡捲動,同一般文字欄位)。「使用者永遠看得到自己打的字」這個理由不變,由下面兩條保證:

- `wrap`:打的字放不下這一列剩下的寬時,搜尋框整個換到下一列;空的時候不會自己佔一整列 —— **關著的欄位不會多出一列空白**。換到下一列時字從那一列的起點開始,與 Tag 盒的左緣同一條線(Tag 內距公式 `../Field/field-wrapper.tsx` `fieldTagInsetX` 那條邊;見下方「世界級」最後一條)。
- 單行(+N):搜尋框要的寬算進「看得見幾個 Tag」—— 放不下時把最後幾個 Tag 收進 +N,讓出打字的位置。Combobox 的 DOM 量測(`combobox.tsx` `useOverflowCount`)與 PeoplePicker 頭像堆疊的公式(`../PeoplePicker/people-picker.tsx`)讀同一支量尺(`combobox.tsx` `findInlineSearchMirror`),打字變寬就重算。

**作法**:外層一格 grid,裡面一顆看不見的量尺(內容 = 打的字 + 一個空白)與輸入框疊在同一格;量尺撐出這一格要的寬、輸入框填滿這一格;外層 `flex: 1 1 auto` —— 基準寬 = 量尺寬(決定放不放得下這一列),再吃掉這一列剩下的空間。**那一格的欄寬上限是整列**(`grid-template-columns: minmax(0, 100%)`):字比整列還長時框停在整列寬、輸入框自己捲動。輸入框自己不帶寬(`width: 0`、`min-width: 100%`):原生輸入框就算 `size=1` 也有約 14px 的固有寬,會被算進 flex 基準寬 —— 三顆 Tag 排滿、這一列只剩 11px 時空的輸入框就自己擠到下一列(2026-10-01 實測);不帶寬之後基準寬只剩量尺,排版時再撐滿那一格(`combobox.tsx`)。不用 JS 量字寬、不訂任何 px 常數。2026-09-30 第三輪只寫了外層 `max-w-full`:它只管得到外框,管不到隱含的 auto 欄 —— 欄寬跟著量尺(不換行)長,輸入框就跟著字長出欄位、插入點被切在欄位外(2026-10-01 實測 67 字時超出欄位 135–218px、單行全選收進 +N 之後仍超出 110px;main 上沒有這個問題);`scripts/searchable-menu-focus-invariant.mjs` `[typed-visible]` 另量一串比整列還長的字(框的右緣不超出欄位、框真的捲過去)。輸入框其餘樣式消費 `../Field/field-wrapper.tsx` `bareInputStyles`(字級與行高繼承欄位:sm/md `text-body`、lg `text-body-lg`;placeholder `text-fg-muted`;截斷省略;停用色;焦點抑制宣告),與 Select 觸發欄位內的搜尋框同一份;本元件只另加文字游標(`FIELD_TEXT_ENTRY_CURSOR`)與一列 Tag 高(`TAG_HEIGHT_PX`:與 Tag 同列、或換到下一列時,那一列都照「列數 × Tag 高」公式,`../Field/field-controls.spec.md`「Tag 自己的 y」)。

**世界級**:

- react-select 同一招:輸入框外層 `flex: 1 1 auto`、`display: inline-grid`,以 `::after { content: attr(data-value) " " }` 當看不見的量尺,輸入框 `minWidth: 2px`、`width: 100%`(<https://github.com/JedWatson/react-select/blob/052e864b4990a67c4ee416851c34d1eb7b58267b/packages/react-select/src/components/Input.tsx#L63-L94>)。
- Ant Design(rc-select)多選:輸入框寬 = 量到的字寬(先把寬設 0 讀 `scrollWidth`,<https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/SelectInput/Input.tsx#L144-L159>),樣式 `width: calc(var(--select-input-width, 0) * 1px)`、`minWidth: 4`、`maxWidth: 100%`(<https://github.com/ant-design/ant-design/blob/bde03c864b2e9feb7f86f86d8a4b4451f8aefa6a/components/select/style/select-input-multiple.ts#L135-L144>);單行 responsive 由 rc-overflow 把輸入框(suffix)的寬算進可見數(<https://github.com/react-component/overflow/blob/f1c801c98d76af8763448d3c55f88a7fc40ab5bc/src/Overflow.tsx#L238-L300>)。
- MUI Autocomplete 不同:輸入框 `width: 0`、`minWidth: 30`(<https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/Autocomplete/Autocomplete.js#L112-L115>)、`flexGrow: 1`(同檔 <https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/Autocomplete/Autocomplete.js#L192-L196>)—— 固定下限,這一列剩不到 30px 時同樣會自己換到一列空白。本 DS 取前兩家。
- 換到下一列時字從哪裡開始(AI 推導 —— 本 DS 的規格沒有寫過「搜尋框單獨一列」的內距,照世界級實測寫):Ant 的輸入框換列後從那一列的起點開始,只有它是整個欄位第一格時才另加內距(<https://github.com/ant-design/ant-design/blob/bde03c864b2e9feb7f86f86d8a4b4451f8aefa6a/components/select/style/select-input-multiple.ts#L88-L91>);react-select 的輸入框是值容器(`display: flex`、`flexWrap: 'wrap'`,<https://github.com/JedWatson/react-select/blob/052e864b4990a67c4ee416851c34d1eb7b58267b/packages/react-select/src/components/containers.tsx#L90-L93>)裡的一般項目,只帶自己的外距 `baseUnit / 2`(<https://github.com/JedWatson/react-select/blob/052e864b4990a67c4ee416851c34d1eb7b58267b/packages/react-select/src/components/Input.tsx#L53-L60>),換列後同樣從列首排起。本 DS 的 flex 換列天然就是這樣:列首 = Tag 區的內距邊 = Tag 盒左緣。空值時(沒有 Tag)欄位內距退回 `--field-px`,提示字的左緣與不可搜尋的欄位相同(見「邊界案例」Empty)。

**2026-09-30 前**:`flex-1 min-w-[60px]`(60px 固定下限,「低於 60px 使用者看不到自己打什麼」)。兩個後果(2026-09-30 實測):(a) `wrap` 時這一列剩不到 60px,**空的**搜尋框就自己換到下一列 —— 關著的欄位多一列空白(Combobox「欄位內搜尋 × 換行」320px 三顆 Tag、PeoplePicker「多人 × 欄位內搜尋」每人一顆標籤那一格;同一個版面在 main 上那一列 18px、2026-09-30 第一版 24px);(b) 單行時 Tag 的可見數沒有扣它的位,Tag 排滿後 60px 的框有 32px 被裁在欄位外,打的字只看得到最後幾個(main 就有)。「看得到打的字」寫成固定 px,在兩種版面都沒有真的保證到。範例:`combobox.stories.tsx`「欄位內搜尋 × 換行」(一開始三顆 Tag 排滿第一列 —— 正是 (a) 的版面;空的搜尋框接在第三顆後面、欄位只有一列,打字放不下才換到第二列)、`../PeoplePicker/people-picker.stories.tsx`「多人 × 欄位內搜尋」;`scripts/visual-assertions.json` 量 Tag 與搜尋框等高、列距 4px、搜尋框不單獨佔一列。

---

## readonly / disabled 的 Tag

- 沒有 dismiss 按鈕——不可操作
- ChevronDown:**readonly 不顯示**(純值、不可開下拉)/ **disabled 保留**(類型身份 indicator,`fg-disabled`,`pointer-events-none`)/ naked cell 依 `showDisplayEndIcon`(2026-06-26)
- 沒有 clear 按鈕——不可清除
- 溢出行為與 edit 模式相同（+N 指示器）

---

## Loading(2026-09-09 user 拍板:兩個字、兩件事)

| Prop | 意思 | 指示 | SSOT |
|---|---|---|---|
| `loading?: boolean` | **這個值**在讀取 / 驗證 / 儲存(與 Input `loading` 同義) | 觸發點右側、ChevronDown 左邊放列圖示尺寸的 `CircularProgress`(`combobox.tsx` `chevronEl`;`iconSize` sm/md 16 / lg 20)+ 觸發點 `aria-busy`;選單照常可開可選、與選項多寡 / 搜尋位置無關 | `../Field/field-controls.spec.md`「Loading state」 |
| `optionsLoading?: boolean` | **選項清單**在抓(2026-09-09 改名自 `loading`) | forward 給 SelectMenu:只在選單內,沒有可顯示選項時一列「載入選項中」訊息列 + listbox `aria-busy`;**觸發點與浮層搜尋列都不轉圈**(2026-09-08 的搜尋列轉圈與 `CommandInput loading` 已退役)。本機過濾已有選項時保留、遠端搜尋抓資料中舊選項不顯示 | `../SelectMenu/select-menu.spec.md`「Loading」 |

歷史:2026-05-15 audit B 補 → 2026-07-04 Q3「不清空 stale options」→ 2026-09-08 兩處轉圈 → **2026-09-09 拆成兩個 prop、選項載入指示只在選單內**。

**遠端搜尋**:`filterOption?: boolean`(預設 true)與 `onSearchChange?: (value: string) => void`(2026-09-08 user 拍板「併」):遠端搜尋時 `filterOption={false}` 不在本機二次過濾(trigger / menu 兩種搜尋位置都不過濾),搜尋字經 `onSearchChange` 回呼(含清空:關閉時、欄位內多選挑選後、一鍵清空都會收到 '')。**可搜尋時搜尋字一律由本元件持有**、以受控 `search` 交給 SelectMenu,兩種搜尋框位置都是(`searchIn='trigger'` 自 2026-09-09,順帶讓 trigger 模式的 creatable 建立列真的會出現;`searchIn='menu'` 自 2026-09-30,欄位上的一鍵清空才碰得到浮層內搜尋框的字);清空規則住 SelectMenu、經 `onSearchChange('')` 叫本元件清(`select-menu.spec.md`「搜尋關鍵字何時保留、何時清空」實作條)。`suggestions?: ComboboxOption[]` / `suggestionsLabel?: string`(預設「建議」)/ `searchHintText?: string`(預設「輸入關鍵字搜尋」)機械 forward(2026-09-09):關鍵字空時列建議群組(必有標題)、抓資料中舊清單不顯示、沒建議也沒在載入時顯示提示列;已選 tag 的 label 同時回查 `options` 與 `suggestions`(`combobox.tsx` `items`)。遠端模式多選 footer 的全選不渲(部分清單)。SSOT `select-menu.spec.md`「遠端搜尋」「Suggestions」。

---

## 邊界案例

- **Disabled**:Field SSOT own(`Field/field-controls.spec.md`)。trigger / tag dismiss / 搜尋 input 全部 disabled,token 走 M24 state precedence(`text-fg-disabled`);已選 Tag 的 dismiss X 自動隱藏(見「readonly / disabled 的 Tag」段)。
- **Loading**:已 codify(見「Loading」段):`loading` = 值處理中(觸發點轉圈)/ `optionsLoading` = 選項在抓(只在選單內)。
- **Empty(no search results)**:dropdown body 內渲 `emptyText`(Combobox 暴露 `emptyText` prop 並 forward 給 SelectMenu;未傳時走 SelectMenu 預設「沒有選項」;渲成一列 `MenuItem message`,與 1 筆結果等高、無最小高度、不用 `Empty`,SSOT `select-menu.spec.md`「Empty state」)——只在真的沒有任何可選時;遠端搜尋還沒打字是建議群組或「輸入關鍵字搜尋」提示列(`select-menu.spec.md`「Suggestions」)。Combobox **暴露 `creatable` / `onCreate` / `createLabel` prop 並 forward 給 SelectMenu**(2026-07-18 user 拍板;搜尋非空且無完全同名既有選項時,dropdown 顯 create row `Plus + createLabel`)——邏輯/顯示/互動 SSOT 住在 SelectMenu(`select-menu.tsx` :271-275 顯隱 / render)。(2026-09-18 起不分裝置皆生效;原本只在桌機路徑生效的限制隨原生路徑一起移除。)對齊 Ant tags / react-select Creatable。
- **Empty(no value selected)**:`value=[]` 時不渲 Tag 區,欄位內距退回標準 `--field-px`(同一個 `hasTags` 判斷式)。提示文字一律是 `placeholder`(未傳時「選擇…」;`emptyPlaceholder` 已 deprecated,見 `../Field/field-controls.spec.md`「共享 contract」(b))。**由誰顯示它,看搜尋框在哪**:
  - 不可搜尋 / `searchIn='menu'`:一顆 placeholder span(`text-fg-muted`、單行省略)。
  - `searchable` + `searchIn='trigger'`:**欄位內的搜尋框恆在**,不論有無已選、浮層開或關都渲染,永遠是 Tag 區的最後一格。空值時它佔滿 Tag 區,由自己的 `placeholder` 屬性顯示同一句字(字級、顏色、左緣與上一條的 span 逐像素相同,sm / md / lg 實測 0 差異);開啟後插入點就在這裡,打字即過濾,關著時打字也會把清單打開。有值時(Tag 或只選「不限」)接在後面、不顯示提示字(`../PeoplePicker/people-picker.spec.md` §E「Avatar-presence → placeholder」)。狀態轉換時不換輸入框:第一次選(空 → 有值)、在清單裡取消最後一項或按最後一個 Tag 的 ×(有值 → 空)都不卸載;焦點與關鍵字照 `../SelectMenu/select-menu.spec.md`「A11y 預設」Focus 段與「搜尋關鍵字何時保留、何時清空」走。它不是另一個 Tab 停靠點(`tabIndex=-1`,見「禁止事項」單一鍵盤聚焦點):開啟時由 `onOpenAutoFocus` 把焦點交給它,滑鼠點它也會聚焦。
  - 2026-09-30 之前,`searchIn='trigger'` 的輸入框只掛在「有 Tag」那一支(`combobox.tsx` `OverflowTagList` 的 `trailing`,該 prop 已移除)。後果(實測):空值時打字沒有任何反應;在清單裡取消最後一項,還在過濾清單的關鍵字跟輸入框一起消失、清單仍被看不見的字過濾;用鍵盤開啟時焦點停在觸發區、吞掉接著打的字;而且它自己多佔一個 Tab 停靠點。「搜尋」範例的第二個欄位一開始就帶著 Electronics,所以只有把它清空後才看得到這個問題。
  - 機械閘:`scripts/searchable-menu-focus-invariant.mjs` 對每一個欄位內搜尋 × 多選,按 Tag 的 × 移到 value=[] 後量搜尋框看得見、點得到、打得進字、`Enter` 選得到且清空關鍵字(規則與整支閘的範圍見 `../SelectMenu/select-menu.spec.md`「A11y 預設」Focus 段)。
- **Dark mode / density**:走 Field + SelectMenu SSOT 自動 adapt。

## 驗證時機

走 Field SSOT(`Field/form-validation.spec.md`)。Combobox 為 form control,validation 行為:

- `required` + `value=[] / null` → submit 時 trigger error,`aria-invalid="true"` + error border
- `errorMessage` prop 由 Field wrapper 顯示於下方
- multi mode 可附 `min` / `max` selected count 限制(consumer 自驗,Combobox 不獨立 own validation rules)
- Validation timing:預設 onBlur + onSubmit,onChange 不立即 validate(避免邊選邊紅)

## Ref 契約(cross-mode 例外,2026-07-17 user 拍板)

Combobox 是 **4-mode field**(edit / view / readonly / disabled),各 mode 渲染**本質不同的 subtree**(edit = trigger + hidden select;view/readonly = `ReadonlyMultiSelect`)。**`ref` 只保證在 edit mode 指向 trigger root(`__triggerRef`)**;view / readonly / disabled mode **不保證穩定 root**(對齊 React「avoid over-exposing DOM nodes in higher-level components」)。需在任意 mode 取穩定 DOM root 的 consumer 應在外層自包一層容器,不依賴 Combobox `ref` 跨 mode 一致。與 T1 RadioGroup / Switch 的跨 mode 缺口採同一哲學(記錄例外,不硬造統一 host)。

---

## 禁止事項

- ❌ 不在已選中的選項上再顯示 dismiss 以外的互動——Tag 只能被移除，不能被編輯或重新排序
- ❌ 溢出指示器 `+N` 不可省略——使用者需要知道有多少被隱藏的項目
- ❌ 不破壞「單一鍵盤聚焦點 + 多滑鼠點擊區」無障礙——浮層選單（`role="combobox"` 容器 + 選單鍵盤導覽）提供完整鍵盤可達性，欄位內 `onClick` 點擊區不可加 `tabIndex` 搶 focus（見「A11y 預設」段）
- ❌ 欄位內搜尋框跟著「有沒有 Tag」掛載 / 卸載 —— 空值時沒有地方打字、取消最後一項會讓關鍵字看不見卻仍在過濾(見「邊界案例」Empty,2026-09-30)
- ❌ 單選場景用 Combobox——使用者每次需手動清除再選新的，改用 `Select`
- ❌ 法律 / 權限類多選用 Combobox——完整閱讀優先，改用 Checkbox stack（見 Checkbox spec「Clamp 政策」）
- ❌ 「多選就一律用 Combobox」——2-5 個選項且全可見時 Checkbox stack 更有效（掃視快 + 支援描述文字），Combobox 從 6+ 選項才開始划算（見「與 Checkbox stack 的分界」）

---

## Internal API（PeoplePicker stack wrapper 私用，end-user 勿用）

`tagWrapperClassName` / `overflowWrapperClassName` / `tagAreaGapPx` / `tagAreaPaddingLeftPx` / `visibleCountOverride` 是 Combobox overflow 量測層的內部 hook,只供 DS-internal wrapper(PeoplePicker avatar stack)用,已標 `@internal`。`tagAreaPaddingLeftPx` 目前無 active consumer(PeoplePicker 走 `!px-[var(--field-px)]` 路徑,`people-picker.tsx:371`),保留供未來精準 padding 但新 consumer 請先評估。`overflowShape` 是 public typed enum(矩形/圓形 +N),不在此列。

---

## A11y 預設

**Focus**:Field 家族的焦點指示 = **欄位邊框轉主色 1px**,不畫全域 2px 外框,**不分開著關著、不分滑鼠鍵盤**(owner = `ds-canonical/references/focus-canonical.md` 規則二「Field 家族控件本身」列;開啟時焦點在裡面的插入點控件、關閉時觸發器 wrapper 自己是焦點站,兩種都只有邊框轉色 —— 全域 `:focus-visible` 由 `fieldWrapperStyles` 的 `focus-visible:outline-none` 抑制,@focus-suppress C)。唯讀態例外:邊框透明無可染,改由全域外描邊畫在被聚焦的控件上(`field-controls.spec.md`「Focus 行為」readonly 段)。閘:`virtual-cursor-modality-invariant.mjs` G / H 段。 觸發區(`role="combobox"` 容器)不分裝置都吃同一條規則:邊框轉色(2026-09-18 起單一路徑,原本行動路徑那顆原生 `<select>` 的 OS 系統框已不存在)。

### 單一路徑（不分裝置）

**2026-09-18 user 拍板逐字**:「我完全不想要為了手機客製化元件,我希望就是 SSOT,直接用桌機版的,
什麼都完全不動,就只是讓手機跟桌機同步而已」。

Combobox **只有一條實作**:觸發區是一個 `role="combobox"` 的容器（`aria-expanded` / `aria-controls`
指向選單 / `tabIndex={0}` 可 tab 聚焦），開啟後是自建浮層選單（內含搜尋 + 選項清單）。鍵盤路徑：
Tab 聚焦觸發區，方向鍵在選項間移動，Enter 選取，Esc 關閉。**觸控裝置看到的跟桌機完全一樣。**

**開著時按 Tab + 觸發區宣告的彈出型別**(2026-09-25 待辦總帳 B11「多選下拉(有全選)行為不變、只改宣告」):
`searchIn='menu'`(預設,可搜尋與否皆同)時,開啟後 DOM 焦點進到浮層,Tab / Shift+Tab 在面板裡繞圈(浮層內搜尋框(有的話)→ 清單 → 全選鈕),
觸發區宣告 `aria-haspopup="dialog"`;`searchIn='trigger'` 時焦點留在觸發區(可搜尋時在欄位內的搜尋框;它恆在,空值也一樣)、清單靠該輸入框上的 `aria-activedescendant`,
宣告 `aria-haspopup="listbox"`;Tab 照 DOM 順序走 —— 頁面上觸發區後面還有可 Tab 的元素就走到那裡、浮層隨之收起,觸發區已是頁面最後一格時會走進掛在 body 最後的浮層(清單捲動區、全選鈕)並在裡面繞圈(2026-09-30 實測;完整說明與已登記的結構工作見 `../SelectMenu/select-menu.spec.md`「A11y 預設」Keyboard 多選 Tab 列)。宣告與 `onOpenAutoFocus` 用同一個條件(`combobox.tsx`)。
滑鼠點選與 `Enter` 選完,焦點都不離開開啟時的落點(兩種 `searchIn` 皆同)。
輸入法組字中的 `Enter` / 空白 / 方向鍵 / `Esc` 是在選字:觸發區 `onKeyDown` 開頭先問 `../../lib/ime-composition.ts` `isImeComposing`,不開關選單、不轉送給清單;`Esc` 另有 Radix 在 document 捕獲階段那一條(只看 `event.key`,<https://github.com/radix-ui/primitives/blob/d8b1ffadc6fe0bd2486816751953dfadf14b3357/packages/react/use-escape-keydown/src/use-escape-keydown.tsx#L14-L19>),由浮層 `PopoverContent` 的 `onEscapeKeyDown` 經同一支模組的 `withImeSafeEscape` 擋掉(2026-10-01 前組字中按 `Esc` 仍會把選單連同關鍵字一起關掉,實測)。
以上規則與 W3C 出處的單一住所 = `../SelectMenu/select-menu.spec.md`「A11y 預設」(Focus 段)。

#### 為什麼移除原本的觸控分支

在此之前 Combobox 依 `(pointer: coarse)` 分流到一個隱藏原生 `<select>` 的實作。移除的依據是證據:

| 證據 | 內容 |
|---|---|
| 技術前提不成立 | 原生 `<select multiple>` 在任何裝置上都**不是下拉** —— 加了 `multiple` 瀏覽器改渲染成常駐捲動清單、沒有展開收合。所以那條路徑只能用**單選** `<select>`「一次加一個」繞,先天做不到多選選單 |
| 靜默失效 | `ComboboxProps` 46 個 prop,**20 個**在觸控路徑完全沒被讀取(沒有 rest-spread、TypeScript 不報錯、零 warning),而 36 個呼叫點正在傳。搜尋 / 全選 / 分組 / 遠端搜尋 / 可建立 /「不限」在觸控上全部無效 |
| a11y 好處沒兌現 | 該 `<select>` 的 `value` 恆為空字串、也沒有 `multiple`,輔助科技從被命名的控件上讀不到已選了什麼;已選值只活在 `<select>` 之外的 Tag 區 |
| 世界級無人這樣做 | [Base UI](https://base-ui.com/) 明文「同一元件 + `multiple`,觸控只調定位與 modal 行為」/ [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons) pop-up button「iOS 無額外考量」/ Polaris、Atlassian、Radix、react-select 文件對裝置零分支。[W3C APG](https://www.w3.org/WAI/ARIA/apg/) 另把「需按住 modifier 才能多選」列為不推薦,而原生 multiple 正是該模型、觸控又沒有 Ctrl/Shift |

**刻意不為觸控加大尺寸**:390px 寬下浮層實測 356px、不溢出、高度放得下;列高 32px 高於 DS 自己的
24px 地板(owner = `tokens/uiSize/uiSize.spec.md`「元件高度地板」:169;`patterns/overlay-surface/overlay-surface.spec.md` 只是在括號裡順帶提到這個數字,不是它的 owner —— 2026-09-24 改指真正的 owner)。為手機另訂一套
尺寸會製造第二套規格,正是這次要消滅的東西。**依據不是觸控尺寸建議**:先前這裡寫的「過 WCAG 2.2 AA
(24×24)」已於 2026-09-24 撤回 —— 本 DS 以滑鼠指標的精度為前提,不拿觸控門檻當尺寸依據
(owner = `ds-canonical/references/hit-area-canonical.md`「本 DS 不採納觸控尺寸建議」)。

**連帶影響**:`PeoplePicker` 內部就是包 `<Combobox>`(自己沒有原生 picker),所以它的觸控選單一併
變成同一套浮層;`DataTable` 的多選儲存格靠 `defaultOpen` / `onOpenChange` 進出編輯,這兩個 prop
在舊的觸控路徑不被消費,現在恢復作用。`Select` 有自己的 `NativeSelect`(單選退原生 picker),
**不在本次範圍**,維持不變。

**閘**:`scripts/combobox-single-path-invariant.mjs` —— 在 `hasTouch + isMobile`(`(pointer: coarse)`
為真)的瀏覽器 context 下確認欄位裡沒有原生 `<select>`、點下去開的是 cmdk 浮層、且搜尋 / 全選 footer /
「不限」列 / 分組分隔線都在、浮層不溢出。對照組把浮層拔掉並塞回原生 `<select>`,必須紅。
**這是全 repo 第一支會開觸控模擬的斷言型閘**(在此之前唯一會帶 `--touch` 的腳本只截圖、不做斷言,
且其 workflow 自述非 required check)。


**為什麼這些 click target 不加 `role="button" tabIndex`**: 若每個點擊區都加 `tabIndex={0}` 會搶走真正聚焦目標（桌機的 combobox 容器 / 手機的原生 select）的 tab focus，反而破壞鍵盤體驗。「單一鍵盤聚焦點 + 多個滑鼠點擊區」是混合型控制項的世界級 canonical pattern（Material / Atlassian / GitHub issue filter 共識）。

**結論**: Combobox 多處 `onClick` 在非 button 元素上**是經過評估的 acceptable a11y 模式**,不是需要修復的 bug。

---

## 相關

- `../Select/select.spec.md` — 單選對應元件；「與 RadioGroup 的分界」是 Combobox vs Checkbox stack 的 framework 來源
- `../Checkbox/checkbox.spec.md` — Checkbox stack（多選全可見場景）
- `../TreeView/tree-view.spec.md` — 階層式選擇
- `../Switch/switch.spec.md` — 布林開關群組
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `checkbox.spec.md`
- `overflow-indicator.spec.md`
- `people-picker.spec.md`
- `select-menu.spec.md`
- `select.spec.md`
- `tag.spec.md`

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
- open 綁內部行為:關閉自動清 search(combobox.tsx `if (!open) setSearch('')`)/ Enter / Space / ArrowDown opener + Esc dismiss / trigger 內 inline input click 開啟。controlled `open` 要 consumer 忠實 echo 每一條內部 intent,漏接任一 → 卡開 / 卡關 / search 殘留
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

Keyboard focus 在移除後依序交給下一個可見 Tag remove button；沒有下一個則前一個；最後一個移除後回 owner select/combobox trigger。焦點不可因 DOM unmount 掉到 `body`；PeoplePicker 的自訂 avatar Tag 亦走相同 `data-collection-remove` contract。

### 全部清除

`clearable` 在有值時顯示 clear all 按鈕，一次清除所有選項。位於最右側，ChevronDown 左邊。

### 新增選擇

(2026-09-18 移除)此段原本描述觸控裝置的原生 `<select>` 只列未選中選項;該路徑已整個移除,見「單一路徑（不分裝置）」。

### Search input 最小寬度 `min-w-[60px]`（documented constant）

多選時 tag 跟 search input 共擠在 `fieldWrapperStyles` 內；input 以 `flex-1 min-w-[60px]` 確保**最少 60px 可打字空間**。低於 60px 會讓 search 輸入變得無法用（使用者看不到自己打什麼）。這是 Combobox 專用 layout 常數，非跨元件 token。

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

**遠端搜尋**:`filterOption?: boolean`(預設 true)與 `onSearchChange?: (value: string) => void`(2026-09-08 user 拍板「併」):遠端搜尋時 `filterOption={false}` 不在本機二次過濾(trigger / menu 兩種搜尋位置都不過濾),搜尋字經 `onSearchChange` 回呼;`searchIn='trigger'` 時搜尋字另以受控 `search` 交給 SelectMenu(2026-09-09;順帶讓 trigger 模式的 creatable 建立列真的會出現)。`suggestions?: ComboboxOption[]` / `suggestionsLabel?: string`(預設「建議」)/ `searchHintText?: string`(預設「輸入關鍵字搜尋」)機械 forward(2026-09-09):關鍵字空時列建議群組(必有標題)、抓資料中舊清單不顯示、沒建議也沒在載入時顯示提示列;已選 tag 的 label 同時回查 `options` 與 `suggestions`(`combobox.tsx` `items`)。遠端模式多選 footer 的全選不渲(部分清單)。SSOT `select-menu.spec.md`「遠端搜尋」「Suggestions」。

---

## 邊界案例

- **Disabled**:Field SSOT own(`Field/field-controls.spec.md`)。trigger / tag dismiss / 搜尋 input 全部 disabled,token 走 M24 state precedence(`text-fg-disabled`);已選 Tag 的 dismiss X 自動隱藏(見「readonly / disabled 的 Tag」段)。
- **Loading**:已 codify(見「Loading」段):`loading` = 值處理中(觸發點轉圈)/ `optionsLoading` = 選項在抓(只在選單內)。
- **Empty(no search results)**:dropdown body 內渲 `emptyText`(Combobox 暴露 `emptyText` prop 並 forward 給 SelectMenu;未傳時走 SelectMenu 預設「沒有選項」;渲成一列 `MenuItem message`,與 1 筆結果等高、無最小高度、不用 `Empty`,SSOT `select-menu.spec.md`「Empty state」)——只在真的沒有任何可選時;遠端搜尋還沒打字是建議群組或「輸入關鍵字搜尋」提示列(`select-menu.spec.md`「Suggestions」)。Combobox **暴露 `creatable` / `onCreate` / `createLabel` prop 並 forward 給 SelectMenu**(2026-07-18 user 拍板;搜尋非空且無完全同名既有選項時,dropdown 顯 create row `Plus + createLabel`)——邏輯/顯示/互動 SSOT 住在 SelectMenu(`select-menu.tsx` :271-275 顯隱 / render)。(2026-09-18 起不分裝置皆生效;原本只在桌機路徑生效的限制隨原生路徑一起移除。)對齊 Ant tags / react-select Creatable。
- **Empty(no value selected)**:multi mode `value=[]` 時 trigger 顯 placeholder(如「請選擇」);empty state 不渲 tag 區。
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
觸發區宣告 `aria-haspopup="dialog"`;`searchIn='trigger'` 時焦點留在觸發區(可搜尋時在欄位內的輸入框)、清單靠 `aria-activedescendant`,
Tab 照頁面順序離開,宣告 `aria-haspopup="listbox"`。宣告與 `onOpenAutoFocus` 用同一個條件(`combobox.tsx`),
規則與 W3C 出處的單一住所 = `../SelectMenu/select-menu.spec.md`「A11y 預設」。

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

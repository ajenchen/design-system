---
component: Select
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
benchmark:
  - Radix Select primitive: github.com/radix-ui/primitives/tree/main/packages/react/select
  - Ant Design Select: github.com/ant-design/ant-design/tree/master/components/select
  - MUI Select: github.com/mui/material-ui/tree/master/packages/mui-material/src/Select
  - Polaris Select: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Select
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Select 設計原則

## 定位

Select 是**單選下拉的表單 control**——從 3+ 選項中挑恰好一個，選項收在 dropdown 內展開。**裝置自適應雙路徑**:觸控裝置(`pointer: coarse`)走原生 `<select>` 取平台原生 picker;桌機走自建 combobox(`role="combobox"` + Radix Popover + Command 渲染 SelectMenu)。詳下方「實作:裝置自適應雙路徑」段。

共用規則見 `field-controls.spec.md`。本文件只記錄 Select 特有的原則。

**Layout Family**：CLAUDE.md 4-Family Model **Family 4（Field control layout）** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

## 實作：裝置自適應雙路徑

`Select` public component 在 render 時用 `useIsTouchDevice()`（內部 `matchMedia('(pointer: coarse)')`）分流（`select.tsx`）：

| 裝置 | 路徑 | 實作 | 為什麼 |
|---|---|---|---|
| 觸控（`pointer: coarse`，手機 / 平板）| `NativeSelect` | 真原生 `<select>` + CSS 客製 trigger | 行動裝置的原生 picker（iOS wheel / Android dialog）是平台最佳 a11y + 操作體驗，自建選單無法取代 |
| 桌機（精確指標）| `CustomSelect` | 自建 combobox（`role="combobox"` + Radix Popover + Command + SelectMenu）| 桌機需可控渲染：搜尋輸入、選項內頭像 / 描述 / 分組、自訂鍵盤導覽——原生 `<select>` 都做不到 |

**此分流是「裝置」軸，與 `searchable` 正交**：`searchable` 只決定桌機 combobox 的 trigger 要不要顯搜尋輸入框，**不**決定走原生還是 combobox。一個不可搜尋的桌機 Select 仍是完整自建 combobox（可捲動 / 點選，只是沒搜尋框）。

---

## Controlled / Uncontrolled dual-mode(Dim 26,2026-05-21 D3 audit ship)

本元件支援 **dual-mode**:consumer 可選 controlled OR uncontrolled,對齊 React `<input>` / Radix Select / shadcn Select 共識。**互斥規則**:同時傳 `value` + `defaultValue` 走 controlled(value 勝),`defaultValue` 僅 first-mount 用。

### Controlled 模式(consumer 自管 state)

傳 `value` + `onChange`,Select **不**自管 state:

```tsx
const [country, setCountry] = useState('tw')
<Select value={country} onChange={setCountry} options={...} />
```

**何時用**:Form library(react-hook-form / Formik)/ Redux / 跨元件 sync / server-state driven。

### Uncontrolled 模式(Select 自管 state)

不傳 `value`(可傳 `defaultValue` 設初始值),Select 內部 `useState`,變更時 fire `onChange` callback 通知 consumer:

```tsx
<Select defaultValue="tw" onChange={(v) => console.log('changed:', v)} options={...} />
```

**何時用**:純展示 / 一次性表單 submit / consumer 不需要 read 當前值。

### 為什麼支援 dual-mode(非 controlled-only)

- **React canonical**:`<input>` / `<select>` 原生兩模式並存,Radix / shadcn / MUI / Ant 共識 form-like primitive 必支援 dual-mode
- **Consumer ergonomics**:簡單場景不該強制管 state(prototype / 一次性 form / a11y testing)
- **互斥規則消除 ambiguity**:`value !== undefined` 為 controlled signal,decisive 不模糊

### 歷史

- **2026-05-21 前**:刻意 controlled-only,理由「內部狀態複雜易 race」
- **2026-05-21 D3 audit**:per Dim 26 verify + user 拍板(「決策三照妳建議」),補 `defaultValue` + 互斥 signal。NativeSelect / CustomSelect 統一走既有 `useControllable` hook,`valueProp !== undefined` 為 controlled signal(對齊 M17 SSOT)

### Open-pair 例外:open 軸維持 uncontrolled-only(2026-06-12 deep-audit R2 補)

value 軸 dual-mode,open 軸**刻意只有** `defaultOpen`(初始開)+ `onOpenChange`(通知 callback),無 controlled `open` prop:

- **已知需求只要「初始開 + 知道何時關」**:(1) 視覺快照 — Storybook OpenSnapshot / visual-audit(M15)需「免互動即開」state,`defaultOpen` 一行達成;(2) DataTable cell-as-input(`DataTable/cell-registry.tsx`)— click → 1-step 開選單靠 `defaultOpen`,dismiss 後 `onOpenChange(false)` → cell exit edit mode
- **受控成本高**:open 是內部 interaction state machine 的一環 — 關閉自動清 search(select.tsx「關閉時清搜尋」effect)/ searchable trigger 在 open 時切 input 顯示模式 / Enter / Space / ArrowDown opener + Esc dismiss 全是內部 intent。controlled `open` 要 consumer 忠實 echo 每一條,漏接任一 → 卡開 / 卡關 / search 殘留
- **世界級對照**:Radix Popover([radix-ui.com/primitives/docs/components/popover](https://www.radix-ui.com/primitives/docs/components/popover))/ Ant Select([ant.design/components/select](https://ant.design/components/select))/ MUI Select([mui.com/material-ui/api/select](https://mui.com/material-ui/api/select/))皆提供 controlled `open` — 它們是泛用 primitive / library,必須支援任意 orchestration;本 DS 是 opinionated form control,無真實 consumer 需求前不為「可能性」付受控成本(Rule-of-3)

**若未來要開 controlled open**:同 value 軸走既有 `useControllable` hook(M17 SSOT)+ 測 controlled↔uncontrolled switch,屬 major API 擴充,目前不在 scope。

---

## 何時用

- **表單中節省垂直空間**：create user 的 role、profile settings 的 timezone、product form 的 category
- **Toolbar / filter 的選擇**：table 上方的 category filter、sort by、狀態篩選
- **Table cell 的 inline edit**：Jira-style task 的 status / priority / assignee（見下文「即時 vs on-submit」）
- **選項 label 自帶語意**：國家、類別、時區——使用者看 label 就知道要選什麼，不需要額外 description
- **選項 10+ 且不需搜尋**：時區、國家這類使用者熟悉的清單，靠捲動瀏覽即可定位（type-to-jump 逐字定位只有手機原生 `<select>` 才有；桌機是自建 combobox，非搜尋模式無逐字定位，選項偏多時建議直接開 searchable）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 2-5 個選項且選擇是「決策節點」 | `RadioGroup` | 使用者需要看到全部選項比較——見下「與 RadioGroup 的分界」 |
| 2-5 個緊湊切換（filter / view mode） | `SegmentedControl` | 更 compact，跟 Button / Input 並排不違和。詳見 `segmented-control.spec.md` |
| 選項需要多行描述或圖文並列 | `RadioGroup` | Select option 是單行純文字，無法承載複雜排版 |
| 多選 | `Combobox` | Select 永遠單選 |
| 布林切換（on / off） | `Switch` | 布林不需要「選一個」的心智模型 |

---

## 與 RadioGroup 的分界

兩者都能「從 N 個選項中挑一個」，在 2-5 個選項的範圍內常被誤用互換。判斷**不是數量**，而是以下三個角度——**任何一個明確傾向哪邊就選哪邊**：

### 1. Progressive disclosure 成本

- **Select**：選項隱藏，使用者多一次點擊才看到。適合「label 本身就夠清楚」的場景（國家、類別、角色）——使用者已經知道自己要選什麼，只是需要一個 picker
- **RadioGroup**：全部選項一次可見。適合「使用者需要看完所有選項才能決定」——付款方式、訂閱方案、票種，選擇本身是決策動作

### 2. 視覺重量

- **Select**：O(1)——永遠佔 field height 一格空間，無論 3 個或 300 個選項
- **RadioGroup**：O(n)——每個選項各佔一行（block 模式），總高度隨選項數線性增加。超過 5 個 option 會開始主導 form 的視覺節奏

### 3. 評估深度

- **Select**：使用者已經知道要選什麼，label 只是確認。例：我知道我要選「Electronics」，dropdown 只是找到它的工具
- **RadioGroup**：使用者需要仔細讀每個選項的 label（有時連帶 description 比較價格 / 權限 / 時長），評估才做選擇

### Fallback heuristic

- **表單中要節省垂直空間 / label 自帶語意 / 使用者熟悉選項 → Select**
- **選擇本身是決策節點（使用者需要對比評估） → RadioGroup**
- **灰色地帶時，問：「使用者看一眼 label 就能下決定嗎？」** 能 → Select；不能、需要閱讀 → RadioGroup

### 情境對照表

| 場景 | 選哪個 | 原因 |
|------|-------|------|
| 國家 / 時區選擇 | Select（可配 searchable） | label 自帶語意、使用者熟悉、選項數多 |
| Table cell 的 status 切換 | Select | 空間受限、使用者熟悉 status 名 |
| 類別（Electronics / Furniture / Food）| Select 或 RadioGroup | 看容器空間；3-4 個且在 form 中傾向 RadioGroup |
| **付款方式**（信用卡 / 轉帳 / 現金）| RadioGroup | 決策節點、通常連帶手續費或處理時間 description |
| **訂閱方案**（Basic / Pro / Enterprise）| RadioGroup | 決策節點、通常連帶價格比較與 feature list |
| **票種**（成人 / 兒童 / 敬老）| RadioGroup | 決策節點、通常連帶價格 |
| 使用者角色（Admin / Editor / Viewer）| Select 或 RadioGroup | 新手用 RadioGroup（要解釋權限）、熟悉使用者 Select |
| 時區選擇 | Select + searchable | 選項 > 100 個、使用者記得時區名 |

**本節是 Select vs RadioGroup 的 SSOT**，`radio-group.spec.md` 和 `checkbox.spec.md` 點回本節，不重複書寫。

---

## 即時 vs on-submit

Select 的值套用時機是**由 onChange handler 的副作用決定**，不是 Select 本身的屬性——兩種場景都是正當用法：

### 即時套用（change → API）

選值一變就直接觸發外部動作，不經 form submit：

- **Jira-style view/edit**：task 的 status / priority / assignee 欄位，改了立刻寫回 DB
- **篩選器**：table 上方的 category / status filter，改了立刻篩 table
- **即時設定**：notification preference、theme dropdown
- **URL param 綁定**：改 value 立刻 push URL（deep-linkable）

這類場景的 onChange 通常呼叫 mutation / API / setState 更新父層。**沒有「取消」的概念**——改了就是改了。

### 隨 form 送出（change → local state → submit）

選值先寫進 local state，等 form submit 才套用：

- **建立 / 編輯表單**：create project 裡的 type、edit user 的 role
- **對話框設定**：dialog 內的選項，按確認才生效
- **精靈流程**：多步驟表單的中間選擇

這類場景 onChange 只更新 React state，直到 submit handler 才送出。**有「取消」可回復**。

### 設計規則

- 即時場景：用 `aria-label` 或旁邊的 label 明確告知「這個改了會立刻套用」
- on-submit 場景：搭配 `<Field>` 容器 + submit button，使用者清楚哪個動作觸發儲存
- **不要讓使用者搞不清楚是哪種**——這是 DS 最常見的信任破壞點

---

## Searchable 開啟判斷

`searchable` 啟用後 field 變 input，打字即篩選 options。判斷依以下順序：

### 主判準：label 性質

- ✅ **需要 searchable**：label 是獨特關鍵字 / 代碼 / 非自然語言，使用者**無法靠捲動快速定位**
  - 產品代碼：`SKU-4837`、`ORDER-2024-001`
  - 郵遞區號、機場代碼（TPE / NRT / JFK）
  - 使用者 ID、專案 slug、ticket number
  - 中文姓名（同姓大量集中，字母跳不動）
- ❌ **不需要 searchable**：label 是流暢自然語言、品類名稱，且選項數量在捲動可輕鬆掃完的範圍
  - `Electronics`、`Furniture`、`Food`
  - `Draft` / `In progress` / `Done`
  - 國家英文名（清單不長時捲動即可；注意桌機自建 combobox 無逐字定位，國家這類長清單仍建議開 searchable）

### 次要啟發：選項數量

數量只是啟發，主判準永遠是 label 性質。

- **< 10** + 自然語言 label → 不開
- **10-50** → 往搜尋傾斜（但仍看 label 性質）
- **> 50** → 幾乎必開

### 為什麼不用純數量 threshold

- 100 個 `a` / `b` / `c` / ... 因 label 有序好掃，捲動定位心智成本低（手機原生 `<select>` 另有 type-to-jump 加成；桌機若清單真的很長仍可開 searchable）
- 5 個 `SKU-4837` / `SKU-8210` / ... 需要搜尋（使用者記不起哪個代碼對應哪個產品）

純量化規則會誤判這兩端。label 性質是唯一可靠的主判準。

---

## 顯示模式（`display` prop）

| 模式 | 何時使用 |
|------|---------|
| `plain`（預設） | 選項語意靠文字表達（類別、國家、角色） |
| `tag` | 選項有色彩語意，顏色加速掃視（狀態：紅黃綠） |

**命名 rationale**(2026-05-01 從 `'text'` 改 `'plain'`):跨元件 prop value 衝突防避 — `Button variant="text"` 表「無 chrome 文字按鈕」,跟 Select.display 的「純文字呈現」是兩個不同概念,共用 `'text'` 字面值會造成 consumer 認知衝突(命名三 test 第 3 條)。改 `'plain'` 後語意專屬:plain = 樸素文字呈現,對立 tag = 用 Tag 元件呈現。

### plain 模式

- 原生 select 純文字 + ChevronDown
- **Icon-binding 矩陣**(icon kind canonical,2026-05-09 clarified):

| Icon 角色 | Prop | 語意 | 色彩 | 優先序 |
|---|---|---|---|---|
| **Indicator icon**(field-level leading hint)| `startIcon` | 提示 field 類型 / 屬性(`Mail` / `Globe` / `Lock` / `Flag`),與選中值無關 | muted(對齊 `Input.startIcon` search-icon pattern)| 設定時恆顯,優先 |
| **Value icon**(代表選中項)| `option.icon`(per-option)| 隨 selected option 變動 | fg-default(對齊 `MenuItem.startIcon` 跨元件 SSOT)| `startIcon` unset 時 fallback |

兩 prop 不互斥——同時設定時 `startIcon` 勝(渲染分支見 `select.tsx`)。

### tag 模式

- Tag 元件呈現選中值 + 隱藏的原生 select overlay
- Tag 設為 `pointer-events-none`，點擊穿透到底層 select
- edit 模式：Tag + ChevronDown + 可選 clear
- readonly / disabled：Tag 顯示 + ChevronDown 恆顯(類型身份 indicator;readonly fg-muted / disabled fg-disabled),不可開選單

---

## Clearable

`clearable` 在有值時顯示 clear 按鈕。

- Clear 按鈕在 ChevronDown 左側
- 清除後回到 placeholder 狀態
- 只在 edit 模式顯示

**何時開 clearable**：
- 「無選擇」是有效狀態（選填欄位、可清除的 filter）→ 開
- 必須有選擇（每個項目都必須有 status）→ 不開

---

## 常見誤解

**誤解**：「Select 只用於表單送出，即時套用應該用別的元件」。
**事實**：Select 的表單送出與即時套用都是正當用法。Jira、Linear、Notion 的 inline status dropdown 都是 Select + 即時 onChange。關鍵是 onChange 的副作用清楚，不是 Select 本身。

**誤解**：「3-5 個選項一定要用 RadioGroup」。
**事實**：看容器與決策性質，不看數量。Toolbar 的 3 個 filter 必須是 Select / SegmentedControl（RadioGroup 不符 toolbar 視覺）；form 中 3 個付款方式用 RadioGroup（決策節點）。見「與 RadioGroup 的分界」。

**誤解**：「選項超過 N 個一定要開 searchable」。
**事實**：主判準是 label 性質，不是數量。見「Searchable 開啟判斷」。

---

## Loading

`loading?: boolean`(forward 給 SelectMenu SSOT,2026-05-15 audit B 補):dropdown body 內取代 options 顯 `<Empty icon={<CircularProgress size={48}/>}/>`(消費 既有 empty.spec.md「現有消費者」SelectMenu loading row SSOT)+ `aria-busy`。Trigger 不變(chevron 保留,user 隨時可開)。對齊 MUI Autocomplete `loadingText` 雙層 + Ant Select loading,反 trigger spinner 派。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 邊界案例

- **搜尋結果空**:dropdown 顯 `<Empty>`(`emptyText` 預設「沒有符合的選項」,可覆寫)——SSOT `select-menu.spec.md`
- **disabled 選項**:`option.disabled` forward 至 menu item——不可點選,鍵盤導覽自動跳過(cmdk `aria-disabled` 行為)
- **大量選項**:選單固定最大高度內捲動(`--menu-max-height` 預設 300px),無分頁 / 虛擬捲動——長清單開 `searchable`(見「Searchable 開啟判斷」)
- **空值**:無選擇時顯 placeholder;「無選擇是有效狀態」場景開 `clearable`(見「Clearable」)

---

## 禁止事項

- ❌ `startIcon` 不可用於 tag 模式——Tag 本身已有視覺標記，startIcon 是冗餘的
- ❌ 在**觸控裝置**自建 dropdown——手機 / 平板必走原生 `<select>`（平台 picker 的 a11y + 操作體驗最佳）；桌機才走自建 combobox（見「實作：裝置自適應雙路徑」）
- ❌ 讓使用者搞不清楚是即時還是 on-submit——用 label / 按鈕位置明確傳達
- ❌ 把「決策節點」選擇塞進 Select（付款方式、訂閱方案）——使用者需要對比評估，用 RadioGroup

---

## 為何無 StateBehavior

Select 是 **Field Controls family 成員**——互動狀態(focus / invalid / disabled / readonly)完全繼承 `../Field/field-controls.spec.md` SSOT「Mode 狀態」。dropdown 開啟時的 MenuItem hover / selected 狀態由 MenuItem primitive own(`patterns/element-anatomy/item-anatomy.spec.md`)。Select 層級無自有 state 行為。重寫 StateBehavior = 複製 Field Controls + MenuItem SSOT 內容,雙邊漂移風險。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix` + `SizeMatrix`。Field-level state 見 Input `StateBehavior` + field-controls.spec.md;item-level state 見 MenuItem `ColorMatrix`。

---

## 相關

- `segmented-control.spec.md` — 2-5 個緊湊互斥切換；「何時不用」的主要去處
- `../Checkbox/checkbox.spec.md`（含 RadioGroup 設計原則）— RadioGroup 共用規則
- `combobox.spec.md` — 多選的對應元件
- `../Switch/switch.spec.md` — 布林切換
- `../Field/field-controls.spec.md` — Select 作為 Field control 時的共用規則（mode、size、endAction）

## A11y 預設

**ARIA / Pattern**:依裝置分兩條路徑。桌機(非觸控)觸發點是容器 `<div>`,標記 `role="combobox"` + `aria-expanded` / `aria-haspopup="listbox"`,選項在浮層 listbox 裡;searchable 模式時容器內另放可打字篩選的 `<input>`。手機(觸控)改用瀏覽器原生 `<select>` element,直接取得作業系統內建的無障礙與 picker。兩路徑皆由 Field wrapper 補 `aria-invalid` / `aria-required` / `aria-describedby` / `aria-errormessage`。

**Keyboard 行為**:

- Tab — 聚焦到觸發點
- Enter / Space — 展開選單(searchable 模式則直接進入打字篩選)
- ↑ / ↓ — 選單展開後在選項間移動
- Esc — 關閉選單(清除值走右側 clear 按鈕,非 Esc)

**Focus**:DS focus 藍框(`focus-within:!border-primary`)由 Field wrapper 提供;手機原生 `<select>` 另有系統 focus ring。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `checkbox.spec.md`
- `combobox.spec.md`
- `people-picker.spec.md`
- `radio-group.spec.md`
- `select-menu.spec.md`

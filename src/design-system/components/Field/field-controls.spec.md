---
component: field-controls
traits:
  - hasVariants
  - hasSizes
  - hasInteractiveStates
  - isStructural
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Field Controls 設計原則

> **Foundational SSOT rationale**(cap 800,2026-04-25 approved):
> Family 4 (Field Control Layout) SSOT owner。Input / NumberInput / DatePicker / Select / Combobox / LinkInput / TimePicker / Textarea / PeoplePicker 等皆消費 `fieldWrapperStyles` / edit-readonly-disabled 三態 mode architecture / endAction 處理 / Display 子元件 pattern / Inline Action canonical(後者也 cascade 到 Sidebar / TreeView / DropdownMenu)。scope 本質 > 單一元件。

> **注意**：此文件是 Field Controls（Input / NumberInput / DatePicker / Select / Combobox / LinkInput / PeoplePicker 等)**共用**的設計原則，與 `Field/field.spec.md`（表單 Layout 容器）**不是同一個東西**。
>
> - **Field Controls**（本文件）：具體的資料型別輸入元件，內部含 edit/readonly/disabled 三態 + 格式化 + DataTable Display 共用
> - **Field**（`Field/field.spec.md`）：shadcn 風格的表單 Layout 容器（label + description + error），wrap 上述 Field Controls 元件

**Layout Family**：本 spec 是 CLAUDE.md 4-Family Model **Family 4（Field Control Layout）的 SSOT**。結構 `fieldWrapperStyles + [startIcon?] [<editable content>] [endAction?]`，**視覺對齊 Family 1（Menu item layout）**——Select trigger 的高度 / 字體 / icon size 必須跟其 SelectMenu options 連續一致。Consumers: Input（canonical）, NumberInput, DatePicker, Select, Combobox, LinkInput, PeoplePicker。

## 定位

Field Controls 是資料輸入與顯示的基礎元件。每種資料類型（text、number、date、select...）對應一個元件，同時服務 Form 和 DataTable：

- **Form**：用 Field Controls 的 edit / readonly / disabled 三態（在 Field 容器內）
- **DataTable**：用 Field Controls 的 Display 子元件渲染 cell

每個元件擁有該類型的格式化邏輯（唯一真實來源），Form 和 DataTable 消費同一份 code。

---

## 架構

```
Field/
├── field.tsx               ← Field 佈局容器（label + control + desc + error）
├── field.spec.md           ← Field 佈局容器設計原則
├── field-controls.spec.md  ← 本文件
├── field-types.ts          ← FieldMode、InlineActionConfig 共用型別
├── field-wrapper.tsx       ← 共用 wrapper 樣式、bareInputStyles、EMPTY_DISPLAY
├── Input/                  ← Input + InputDisplay
├── NumberInput/            ← NumberInput + NumberInputDisplay + formatNumber
├── DatePicker/             ← DatePicker + DatePickerDisplay + formatDate
├── Select/                 ← Select + SelectDisplay
├── Combobox/               ← Combobox + ComboboxDisplay
├── LinkInput/              ← LinkInput + LinkInputDisplay
├── PeoplePicker/           ← PeoplePicker + PersonDisplay
└── Textarea/               ← Textarea（多行）
```

每個元件 export 兩樣東西：
1. **主元件**（如 `Input`）— Form 用，有 edit / readonly / disabled 三種模式
2. **Display 子元件**（如 `InputDisplay`）— DataTable cell 用，純格式化顯示

---

## Mode — 三種模式

| Mode | 底色 | 邊框 | 文字色 | 用途 |
|------|------|------|--------|------|
| `edit` | surface | border（hover 深一階、focus primary） | foreground | 表單可編輯欄位 |
| `readonly` | neutral-2 | 無 | foreground | 表單中不可編輯但可見的欄位 |
| `disabled` | neutral-2 | 無 | fg-disabled | 表單中被停用的欄位 |

三種模式共用同一個 wrapper 結構（`fieldWrapperStyles`），只有底色、邊框、文字色不同。

### Loading state(async 驗證 / debounce fetch 中)

Loading **不是第四個 mode**,是 `edit` mode 的子狀態,語義 = **editable 仍可輸入**(UX「邊改邊讀」:debounce search / async validation 場景中 user 常需要繼續打字修正,凍結輸入反而破壞心流)。

**世界級流派選擇**(editable 派 vs readonly 派):

| DS | Loading input 做法 | 流派 |
|----|-------------------|------|
| Ant Input.Search | **input 仍 editable**,suffix spinner;submit 另鎖 | editable |
| Material TextField | readonly + suffix adornment loader | readonly |
| Polaris TextField | readonly + helpText 提示 | readonly |
| Carbon TextInput | readonly + inline Loading | readonly |
| Atlassian TextField | disabled | disabled(少數派) |
| Apple HIG UITextField | visual overlay only,不阻礙輸入 | editable |

**本 DS 採 editable 派**(Ant / Apple HIG):
- **UX 理由**:debounce 搜尋場景,user 邊打邊看建議,凍結一格會卡節奏;async validation 若第一次失敗,user 該能立即改,不是等 spinner 完才能動
- **對照 readonly 派**:readonly 派適合「提交後驗證」的場景(e.g. 表單 submit → 驗證),本 DS 的 `loading` prop 用在 debounce / inline validation,editable 更 fit

**實作 canonical(Input / NumberInput / Combobox 等 Field 元件)**:
- API:`loading?: boolean` prop
- 內部:`loading=true` → wrapper `aria-busy="true"` + **endAction slot 自動塞 `<CircularProgress size={iconSize}/>`**(與 `endAction` prop 互斥,loading 優先)
- input **不進 readonly / disabled**,保持可編輯
- CircularProgress 尺寸:程式化 `iconSize`(sm/md=16, lg=20),消費者不用再傳
- CircularProgress 顏色:走預設 `text-primary`(表達「正在處理,請注意」)
- startIcon(Search 等語義 icon)**不受 loading 影響**,保留原位置

```tsx
// 世界級 canonical:search field 在 loading 中,user 仍可修改關鍵字
<Input startIcon={Search} loading placeholder="搜尋..." />
// → search icon 在 prefix(保留語義身分)
// → CircularProgress 在 endAction 位置(暫時狀態)
// → input editable + aria-busy,user 可繼續輸入 / 修改
```

❌ 禁止手刻路線:
```tsx
// 絕對不寫
<div className="relative">
  <Input startIcon={Search} />
  <div className="absolute right-3 top-1/2 -translate-y-1/2">
    <CircularProgress size={16} />
  </div>
</div>
```
手刻 absolute 對齊容易跑掉(Field 元件內 loading 指示與既有 endAction 垂直對齊不一致)。一律用 `loading` prop。

### disabled 的停用原因

停用原因由外部承擔，不在 input 內放 info icon：
- **Tooltip**：包住整個 Field 元件（wrapper `<div>` 不是 disabled 元素，可正常接收 hover）
- **Form help text**：在 input 下方說明（Form 層負責）

### 原生屬性覆蓋

`disabled` 和 `readOnly` 原生 HTML 屬性會自動覆蓋 `mode` prop，避免衝突。

---

## Error — 正交於 mode

Error 是 boolean prop，獨立於 mode。只在 `edit` 模式下有視覺效果（`border-error`）。

- Error 視覺在 Field（input）層級：紅色邊框 + `aria-invalid`
- Error 訊息在 Form 層級：help text 顯示在 input 下方
- Field 不在尾部放狀態 icon（如 ⚠️）——邊框顏色已經傳達了 error 狀態

Form wrapper 可透過 context 注入 `error` prop，消費者不需要在每個 Field 上手動傳。

---

## Size — 與 Button 對齊

| Size | 高度 token | Tailwind | 字體 |
|------|-----------|----------|------|
| `sm` | `--field-height-sm` | `h-field-sm` | text-body |
| `md` | `--field-height-md` | `h-field-md` | text-body |
| `lg` | `--field-height-lg` | `h-field-lg` | text-body-lg |

高度使用 `--field-height-*` semantic token（rem 單位），與 Button 共用同一組 token，同 size 的 Field 和 Button 並排時高度一致。

---

## Focus 行為

`<input>` 元素在點擊和鍵盤 Tab 時都觸發 `:focus-visible`（瀏覽器規範：文字輸入永遠 focus-visible），CSS 無法區分。

統一使用 `border-primary`（1px），不加 ring、不加粗。

---

## 點擊與游標原則

### 點擊穿透

Field 內部所有不會觸發獨立 action 的元素必須 `pointer-events-none`，讓點擊穿透到底層的 input/select，確保使用者點擊 Field 內任何位置都能 focus/activate。

穿透（`pointer-events-none`）：startIcon、ChevronDown 下拉箭頭、tag 文字區域。
不穿透：endAction（clear、toggle password）、tag dismiss button——這些有自己的 action。

### 游標指引

可點擊的元素必須有明確的 cursor 變化：
- endAction、dismiss button → `cursor-pointer`
- input / select → `cursor-text` / `cursor-pointer`（原生行為）
- disabled → `cursor-not-allowed`

## Icon 色彩原則

跨元件統一規則（詳見 `item-anatomy.spec.md`）：**icon 代表內容/類別 → 與 label 同色；icon 純指示方向 → fg-muted（neutral-7）。**

Field 內的具體套用：

- **startIcon**（Search、Calendar）：`fg-muted`——指示 field 用途，不是 value
- **ChevronDown 下拉箭頭**：`fg-muted`——指示可下拉
- **代表 value 的 icon**（如狀態 icon）：**foreground**——icon 本身就是 value 的一部分
- **disabled 時**：所有 icon 統一 `fg-disabled`

## startIcon

左側靜態 icon，輔助使用者理解 input 的用途（如 Search icon）。屬於 input 的視覺提示，不屬於 value。

- 顏色 `fg-muted`（disabled 時 `fg-disabled`）
- `aria-hidden`——純裝飾
- 命名與 Button 的 `startIcon` 一致

## 下拉箭頭（Select / Combobox）

Select 和 Combobox 的最右側固定顯示 ChevronDown icon，指示可下拉選擇。

- 顏色 `fg-muted`——指示意圖，不是 value
- 不可互動（`pointer-events-none`）——下拉由 select 元素本身觸發
- clearable 有值時：clear X 在左，ChevronDown 在右
- 右側元素(clear + chevron)水平間距對齊 Field container padding token(具體值見 `field-wrapper.tsx`),跟 Input 一致

## Select 顯示模式

Select 支援兩種顯示模式（`display` prop）：

| 模式 | edit | readonly / disabled | 適用場景 |
|------|------|---------------------|---------|
| `text`（預設） | 原生 select 純文字 + ChevronDown | 跟 Input 一致（純文字 + 標準 padding） | 狀態、類別等文字選項 |
| `tag` | Tag + 隱藏 select overlay + ChevronDown | Tag + tagPadding | 需要視覺標記的選項（顏色標籤等） |

`text` 模式可搭配 `startIcon`（代表 value 的圖示，如狀態 icon）。

`tag` 模式的 edit 用 hidden select overlay(跟 Combobox 同模式),Tag 用 `pointer-events-none`,點擊穿透到 select。右側元素水平間距對齊 Field container padding token(見 `field-wrapper.tsx`)。

tagPadding 只在有 Tag 時才套用。Placeholder/空值狀態使用 fieldWrapper 的標準 px-3 padding，確保文字與邊框有足夠間距。

---

## endAction（Inline Action）

右側可互動元素，用於操作動作（清除內容、顯示密碼等）。

使用宣告式 API：

```tsx
<Input endAction={{ icon: X, label: '清除', onClick: handleClear }} />
```

Field 內部用 `<ItemInlineAction>`(`item-layout.tsx` 共用元件)渲染 — 跟 Sidebar / TreeView / DropdownMenu 的 inline action **完全同一套** canonical 實作,不再有「每個 host 自己複製 18 行 button JSX」的漂移。

- 共用規則見 `patterns/element-anatomy/item-anatomy.spec.md`「Inline Action 設計規格」節
- Helper 規格與 API 見 `item-anatomy.spec.md` 的「Inline action 共用元件」節
- Field host 必須傳 `size={size}` 給 `<ItemInlineAction>`(field 不在 `RowSizeContext` 內,需明確覆寫)

Icon 色彩遵循 Inline Action 統一規則:預設 `fg-muted`,hover 時 `foreground`。

- disabled / readonly 模式不渲染 endAction
- 條件渲染即可——消失後不佔位,input 自然擴展
- 下拉箭頭不屬於 endAction,屬於 Select / Combobox

**特例:Tag dismiss**——Tag 的 dismiss button 需要 chromatic hover bg(跟 tag 的 solid variant 色相一致),不是中性的 neutral-hover,因此**沒有**用 `ItemInlineAction`,維持自己的內部 JSX。這是合理特例,見 `tag.tsx:104` 的詳細註解。

**Escape hatch**(10% case config 表達不出時):每 Field host 提供 `endSlot?: React.ReactNode`,規則 SSOT 見 `patterns/element-anatomy/inline-action.spec.md`「Escape hatch」節。

---

## Display — 格式化顯示

每個 Field 元件 export 一個 Display 子元件，負責把 raw value 格式化為可讀文字或 ReactNode。

Display 的消費者：
- **DataTable cell**：根據 `meta.type` 自動選擇對應的 Display 元件
- **Field readonly 模式**：內部使用相同的格式化邏輯

### null / undefined 值

Display 模式統一顯示 em dash `—`，顏色 `text-fg-muted`。edit 模式顯示空白。

此規則適用於所有 Field 類型，boolean 例外（顯示 unchecked 狀態）。

### DataTable 整合

DataTable 根據 column 的 `meta.type` 自動選擇 Display 元件：

```tsx
// 自動渲染——不需要手寫 cell
col.accessor('price', {
  header: 'Price',
  meta: { type: 'currency', prefix: '$' },
})

// 客製化——有自訂 cell 時完全跳過 type → Display
col.accessor('status', {
  header: 'Status',
  cell: (info) => <MyCustomBadge status={info.getValue()} />,
})
```

兩者可在同一張 table 混用。

---

## 表單驗證原則

詳見 `Field/form-validation.spec.md`。

## 禁止事項

- ❌ 不在 disabled input 內放 info icon——停用原因由外部 Tooltip 或 Form help text 承擔
- ❌ 不在 input 尾部放 error 狀態 icon——邊框顏色已傳達 error
- ❌ endAction 不可傳入 ReactNode——使用 InlineActionConfig 宣告式 API
- ❌ endAction 的 inline action 不可省略 `aria-label`（即 `label` 欄位）
- ❌ Display 的 null 值不可顯示空白——統一使用 `—`（em dash）+ `text-fg-muted`
- ❌ Field 的 readonly 模式不可用於 DataTable cell——readonly 有底色和 wrapper 開銷，table cell 用 Display 元件

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `checkbox.spec.md`
- `circular-progress.spec.md`
- `combobox.spec.md`
- `data-table.spec.md`
- `date-picker.spec.md`
- `element-anatomy.spec.md`
- `input.spec.md`
- `link-input.spec.md`
- `number-input.spec.md`
- `people-picker.spec.md`
- `rating.spec.md`
- `segmented-control.spec.md`
- `select.spec.md`
- `slider.spec.md`
- `switch.spec.md`
- `textarea.spec.md`
- `time-picker.spec.md`

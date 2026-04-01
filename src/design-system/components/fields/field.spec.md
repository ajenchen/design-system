# Field 共用設計原則

## 定位

Field 是資料輸入與顯示的基礎元件。每種資料類型（text、number、date、select...）對應一個 Field 元件，同時服務 Form 和 DataTable：

- **Form**：用 Field 的 edit / readonly / disabled 模式
- **DataTable**：用 Field 的 Display 子元件渲染 cell

Field 擁有該類型的格式化邏輯（唯一真實來源），Form 和 DataTable 消費同一份 code。

---

## 架構

```
fields/
├── field-types.ts        ← FieldMode 共用型別
├── field-wrapper.tsx     ← 共用 wrapper 樣式、bareInputStyles、EMPTY_DISPLAY
├── TextField/            ← TextField + TextFieldDisplay
├── NumberField/          ← NumberField + NumberFieldDisplay + formatNumber
└── (未來) DateField/, SelectField/, ...
```

每個 Field 元件 export 兩樣東西：
1. **Field 元件**（`TextField`）— Form 用，有 edit / readonly / disabled 三種模式
2. **Display 元件**（`TextFieldDisplay`）— DataTable cell 用，純格式化顯示

---

## Mode — 三種模式

| Mode | 底色 | 邊框 | 文字色 | 用途 |
|------|------|------|--------|------|
| `edit` | surface | border（hover 深一階、focus primary） | foreground | 表單可編輯欄位 |
| `readonly` | neutral-2 | 無 | foreground | 表單中不可編輯但可見的欄位 |
| `disabled` | neutral-2 | 無 | fg-disabled | 表單中被停用的欄位 |

三種模式共用同一個 wrapper 結構（`fieldWrapperStyles`），只有底色、邊框、文字色不同。

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

Field 內的 icon 色彩取決於它的角色：

- **指示用途的 icon**（startIcon、ChevronDown 下拉箭頭）：`fg-muted`——它描述 input 的性質，不是 value 本身，視覺上退到背景
- **代表 value 或屬性的 icon**：繼承文字色——當 icon 本身就是 value 的一部分（如狀態 icon），不需要弱化
- **disabled 時**：所有 icon 統一 `fg-disabled`

## startIcon

左側靜態 icon，輔助使用者理解 input 的用途（如 Search icon）。屬於 input 的視覺提示，不屬於 value。

- 顏色 `fg-muted`（disabled 時 `fg-disabled`）
- `aria-hidden`——純裝飾
- 命名與 Button 的 `startIcon` 一致

## 下拉箭頭（Select / MultiSelect）

Select 和 MultiSelect 的最右側固定顯示 ChevronDown icon，指示可下拉選擇。

- 顏色 `fg-muted`——指示意圖，不是 value
- 不可互動（`pointer-events-none`）——下拉由 select 元素本身觸發
- clearable 有值時：clear X 在左，ChevronDown 在右

---

## endAction（Inline Action）

右側可互動元素，用於操作動作（清除內容、顯示密碼等）。

使用宣告式 API：

```tsx
<TextField endAction={{ icon: X, label: '清除', onClick: handleClear }} />
```

Field 內部根據 size tier 自動決定 icon 尺寸和 hover 背景大小，消費者不需要指定。共用規則見 `uiSize.spec.md` 的 Inline Action 段落。

Icon 色彩遵循 Inline Action 統一規則：預設 `fg-muted`，hover 時 `foreground`。

- disabled / readonly 模式不渲染 endAction
- 條件渲染即可——消失後不佔位，input 自然擴展
- 下拉箭頭不屬於 endAction，屬於 Select / Combobox

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

## 禁止事項

- ❌ 不在 disabled input 內放 info icon——停用原因由外部 Tooltip 或 Form help text 承擔
- ❌ 不在 input 尾部放 error 狀態 icon——邊框顏色已傳達 error
- ❌ endAction 不可傳入 ReactNode——使用 InlineActionConfig 宣告式 API
- ❌ endAction 的 inline action 不可省略 `aria-label`（即 `label` 欄位）
- ❌ Display 的 null 值不可顯示空白——統一使用 `—`（em dash）+ `text-fg-muted`
- ❌ Field 的 readonly 模式不可用於 DataTable cell——readonly 有底色和 wrapper 開銷，table cell 用 Display 元件

# DataTableFilterPanel(advanced filter)

## 定位

DataTable 的 advanced filter panel — **flat 或 1-level nested boolean expression builder**,藉 `mode` prop 二選一。

- `mode="flat"`:root 下只能裝 condition(無 group 概念)
- `mode="nested"`:root 下裝 1+ group,每個 group 內 1+ condition,**剛好 1 層 nest**

**實作基礎**:自建 + 消費 `Popover` / `Select` / `Combobox` / `Input` / `NumberInput` / `DatePicker` / `DateTimePicker` 等 DS primitive。底層求值用 TanStack `globalFilter` + 自訂 `globalFilterFn`(棄 `columnFilters`,因 N 條同 column AND-chain 不能 OR)。

**Layout Family**:self-contained(panel 為複合 UI;非 Family 1-4)。

**M8 對標**:ClickUp 為主 + Notion / Airtable / Coda / Linear 對照。Image ref:user 提供 ClickUp-style 截圖(2026-05-02)。

## 何時用

- DataTable 顯示「進階篩選」按鈕時(對齊 ClickUp / Notion / Airtable AND/OR 多 condition expression)
- 需要在多欄之間 **AND/OR 混合**(`columnFilters` 無法表達)
- 需要 **1-level group**(`(A AND B) OR (C AND D)`)

## 何時不用

- ❌ 單欄文字 quick search → 用 DataTable 內建 `globalFilter` text input
- ❌ 單一 column 對單一 op 比對(只用 1 條 condition)→ 太重,直接給 column header 一個下拉
- ❌ 複雜 SQL-like 條件(任意層 nest / function call)→ 此 panel 鎖死 1-level,該情境另尋
- ❌ Saved view / shared filter URL 持久化 → 屬 DataTable 上層業務邏輯,本 panel 只負責 controlled state

## 近親分界

| 元件 | 用於 |
|---|---|
| `DataTableFilterPanel`(本)| 進階多 condition + AND/OR + 1-level group |
| `DataTable globalFilter` text input | 單一文字 quick-search,跨欄 |
| Column header 下拉(目前未實作)| 單欄 inline filter(常見於試算表 idiom) |
| `Combobox`(獨立)| 單欄 multi-select 值挑選(非「filter 多 condition」場景) |

## 常見誤解

- ❌ 「`mode` 可動態切換」:flat ↔ nested 切換會丟失 group 結構,consumer 應在 mount 前決定
- ❌ 「同 group 可混 AND / OR」:boolean logic 會 ambiguous,業界共識每個 group 內所有 row 共用同一 conjunction(toggle 任一 row → flip 整個 group)
- ❌ 「filter 順序影響結果」:AND / OR 各自滿足交換律,**不提供 drag handle**(對齊 ClickUp / Airtable / Notion)
- ❌ 「composite column 可 filter」:資料 atomic + render composite 是業界共識(Notion / Airtable / TanStack)。要 filter `person.name` 必須拆 `name` accessor column,不在 panel 另設 composite-filter 機制
- ❌ 「`is_set` / `is_not_set` 也要 value picker」:`ValueShape='none'` op,直接不渲

## Data Model — `FilterTree`

```ts
export type Conjunction = 'and' | 'or'

export interface FilterCondition {
  kind: 'cond'
  id: string                  // unique per row
  field: string               // column id
  op: string                  // operator key(對齊 OPERATOR_REGISTRY)
  value: unknown              // 依 ValueShape 解讀
}

export interface FilterGroup {
  kind: 'group'
  id: string
  conjunction: Conjunction
  children: FilterCondition[]  // ⚠️ 型別鎖死「children 只能 condition」— 1-level
}

export type FilterTreeFlat   = { mode: 'flat';   conjunction: Conjunction; children: FilterCondition[] }
export type FilterTreeNested = { mode: 'nested'; conjunction: Conjunction; children: FilterGroup[] }
export type FilterTree       = FilterTreeFlat | FilterTreeNested
```

**型別 enforce 1-level**:`FilterGroup['children']` 只能 `FilterCondition[]`。**TypeScript 編譯就拒絕 over-nest**,不靠 runtime check。

**同 field 可重複 condition**(對齊 ClickUp):`children` 沒做 `field` dedup;e.g. `Status is Open OR Status is Review` 由兩條同 field 條件 OR-joined 表達。

## 求值算法(globalFilter approach)

```ts
useReactTable({
  state: { globalFilter: tree },
  onGlobalFilterChange: setTree,
  globalFilterFn: (row, _, t: FilterTree) => evaluateTree(t, row.original),
  getFilteredRowModel: getFilteredRowModel(),
  // 不用 columnFilters
})
```

`evaluateTree` / `evaluateGroup` / `evaluateCondition` / `matchOperator` SSOT 在 `filter-tree.ts`。`is_relative` op 將 relative key(`today` / `this_week` / `last_30_days` ...)轉成 [start, end] 區間後做 in-range test(由 `relativeKeyToRange` 處理)。

**ms-precision when `meta.includeTime=true`**:`matchOperator` 對 datetime 比對需檢查 column meta;`true` 走 ms 比對(避開 Airtable 知名「day-precision 漏邊界」地雷)。

## Props

```ts
export interface DataTableFilterPanelProps<TData> {
  mode: 'flat' | 'nested'
  columns: ColumnDef<TData, any>[]
  value: FilterTree
  onChange: (next: FilterTree) => void
  defaultValue?: FilterTree              // refresh icon 顯示判定 baseline
  prefilledColumnId?: string             // 從 cell ⌄ menu「Filter by this」帶入
  onPrefillConsumed?: () => void
  onClose?: () => void
  className?: string
}
```

| Prop | 行為 |
|---|---|
| `mode` | mount 後不可動態切換 |
| `value` / `onChange` | controlled-only(對齊 DataTable 其他 state 慣例) |
| `defaultValue` | 跟 `value` deep-equal 比較,不等 → 顯示 refresh icon |
| `prefilledColumnId` | 開啟 panel 自動 add 該 column 一條空 condition |

## Filterable column 判定 + Composite

| 條件 | 是否出現在 filter UI |
|---|---|
| Display column(無 `accessorKey`)| ❌ 永不(TanStack 內建限制) |
| Accessor column + 有 `meta.type` | ✅ 預設出現 |
| Accessor column + `meta.filterable: false` | ❌ 顯式 opt-out |
| Accessor column + 無 `meta.type` | ❌ 不列(無 type 無法決定 op set) |

**強制**:filterable column 必設 `meta.type`(對齊 Notion / Airtable / Linear:每 property 強制 type)。

**Composite column**(兩 field 合一欄):**資料 atomic,僅 render composite**(業界共識)。要 filter 細顆粒 → 拆 atomic column。

## UI 結構

```
┌─ Popover Surface ────────────────────────────────────┐
│ Header  「篩選」    [refresh-when-modified] [X]      │
├──────────────────────────────────────────────────────┤
│ Body(scrollable)                                     │
│   flat:                                              │
│     [Where|And ⌄] [field ⌄] [op ⌄] [value] [🗑]    │
│   nested:                                            │
│     ┌─ Group(灰底) ─────────────────────────────┐  │
│     │ [Where] [field] [op] [value] [🗑]           │  │
│     │ [Or ⌄]  [field] [op] [value] [🗑]           │  │
│     │ [+ Add nested filter]                        │  │
│     └──────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│ Footer  [+ Add filter]                               │
└──────────────────────────────────────────────────────┘
```

**消費**:`overlay-surface` `<SurfaceHeader/Body/Footer>` / `Select` / `Combobox` / `Button` / `ItemInlineActionButton` / `FilterValuePicker`(內 dispatch by ValueShape)。

**互動規則**:
- 第 1 row 的 `Where` 是靜態 label(不可 toggle)
- field 未選 → operator + value picker disabled
- `is_set` / `is_not_set` / `is_true` / `is_false`(`ValueShape='none'`)→ 不渲 value picker
- panel 開啟自動加 1 條空 row(對齊 ref 圖,不顯「尚未設定」字串)

## DataTable trigger button checked state

獨立於 panel header refresh icon(兩者邏輯不同):

| 狀態 | 何時 | 用意 |
|---|---|---|
| Trigger button checked(`aria-pressed=true`)| `value` 有 ≥ 1 active condition | 讓 user 知「資料被過濾、不完整」 |
| Refresh icon visible | `value` ≠ `defaultValue` | 讓 user 知「目前不是管理員預設,可一鍵 reset」 |

## 空值 / 驗證 / Loading

- **空值**:`value.children = []` 時 panel 仍會自動加 1 條空 row(empty-but-editable;對齊 ClickUp);`evaluateTree` 對全空 tree 回 `true`(pass-through)
- **驗證**:condition 必須 `field && op` 才會被計入求值;`ValueShape ≠ 'none'` 時 value 必非空。incomplete condition 視為 pass-through(不報錯)
- **Loading**:panel 本身無 loading state(同步 UI);若 column options(select_single / select_multi)需 async 載入由 consumer 預先解,panel 不負責

## A11y 預設

| 面向 | 規範 |
|---|---|
| Panel role | `role="dialog"`(Popover 提供) |
| 操作標籤 | conjunction / field / op / value picker 各自 `aria-label` |
| 鍵盤流 | Tab:conjunction → field → op → value → trash → 下一 row → ... → add-filter |
| Esc | 關 panel(Popover 處理) |
| Open focus | panel 開啟時 focus 第 1 row 的 field selector |

## 禁止事項

- ❌ 混 AND / OR in same group(model 不該存,UI 也不允許)
- ❌ 動態切換 `mode`(會丟 group 結構)
- ❌ 1+ 層 nest(型別禁;UI 不提供 add-group-inside-group button)
- ❌ 為 filter 順序加 drag handle(無業務意義)
- ❌ `is_set` / `is_not_set` 配 value picker(邏輯衝突)
- ❌ Composite column 直接 filter(拆 atomic column)

## 相關 links

- `filter-operators.ts` — operator registry(per columnType op set + ValueShape)
- `filter-tree.ts` — FilterTree types + evaluator + relative date matcher
- `filter-value-picker.tsx` — ValueShape → DS picker 元件 dispatch
- `column-types.ts` — `ColumnType` + `meta.includeTime` / `meta.filterable`
- `date-time-picker.tsx` — DateTimePicker / DateTimeRangePicker(`includeTime=true` 用)
- `advanced-filter-operators.draft.md` — operator registry 對照表 + benchmark 紀錄

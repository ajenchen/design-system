# Advanced Filter — Panel Spec(DRAFT v1)

> **狀態**:Phase B 交付物。配合 `advanced-filter-operators.draft.md` v3 一起 review。
> **位置**:`src/design-system/components/DataTable/data-table-filter-panel.tsx`(目前位置,不抽 patterns/)
> **M8 benchmark**:ClickUp 為主 + Notion / Airtable 對照。Image ref:user 提供的 ClickUp-style 截圖(2026-05-02)。

## 1. 定位

DataTable 的 advanced filter panel — **flat 或 1-level nested boolean expression builder**。Consumer 透過 `mode` prop 二選一:

- `mode="flat"`:root 下只能裝 condition(無 group 概念)
- `mode="nested"`:root 下裝 1+ group,每個 group 內 1+ condition,**剛好 1 層 nest**

UX 對齊 ClickUp / Notion / Airtable / Coda / Linear advanced filter 派(parenthesized boolean expression)。

## 2. Data Model — FilterTree

### TypeScript types

```ts
// 共用
export type Conjunction = 'and' | 'or'

// 單一 condition(field + op + value)
export interface FilterCondition {
  kind: 'cond'
  id: string                  // unique per row(stable across renders)
  field: string               // column id
  op: string                  // operator key(e.g. 'contains', 'is_between')
  value: unknown              // 依 ValueShape 的值
}

// Group:1 層含 1+ conditions
export interface FilterGroup {
  kind: 'group'
  id: string
  conjunction: Conjunction    // group 內 conditions 的 join(全 AND 或全 OR)
  children: FilterCondition[] // ⚠️ 型別鎖死「children 只能 condition」— 從型別 enforce 1-level 限制
}

// Tree root(因 mode 不同有兩種)
export type FilterTree =
  | {                          // flat mode
      mode: 'flat'
      conjunction: Conjunction
      children: FilterCondition[]
    }
  | {                          // nested mode
      mode: 'nested'
      conjunction: Conjunction // root 下 groups 之間的 join
      children: FilterGroup[]
    }
```

**型別鎖 1-level**:`FilterGroup['children']` 只允許 `FilterCondition[]`,`FilterTree.children`(nested)只允許 `FilterGroup[]`。**TypeScript 編譯就拒絕 over-nest**,不靠 runtime check。

### 同 field 可重複 condition(對齊 ClickUp)

Model 天然支援 — `children` 沒做 `field` dedup。例:
```ts
{
  mode: 'nested',
  conjunction: 'and',
  children: [
    {
      kind: 'group',
      id: 'g1',
      conjunction: 'or',
      children: [
        { kind: 'cond', id: 'c1', field: 'status', op: 'is', value: ['Open'] },
        { kind: 'cond', id: 'c2', field: 'status', op: 'is', value: ['Review'] },
        // ↑ 同 field 兩條 OR-joined
      ]
    }
  ]
}
// 等價:Status is Open OR Status is Review
```

### Group conjunction 共用 state(M5 互動 canonical)

UI 上每 row 顯示 `Where / And / Or` 標籤,但**同一 group 內所有 row 的 conjunction 共用一個 state**(`group.conjunction`)。toggle 任一 row → flip 整個 group。

- 第 1 個 row:固定 `Where`(只是 label 不可改)
- 第 2 個起:`And` 或 `Or`(由 `group.conjunction` 決定)
- 同一 group 不允許混 AND/OR(boolean logic 會 ambiguous,業界共識)

## 3. 求值算法(globalFilter approach)

棄用 TanStack `columnFilters`(N 條同 column AND-chain 不能 OR),改用 `globalFilter` + 自訂 `globalFilterFn`:

```ts
// useReactTable consumer
const table = useReactTable({
  data,
  columns,
  state: { globalFilter: filterTree },
  onGlobalFilterChange: setFilterTree,
  globalFilterFn: (row, _columnId, tree: FilterTree) => evaluateTree(tree, row.original),
  getFilteredRowModel: getFilteredRowModel(),
  // 禁用 columnFilters
})

// 求值
function evaluateTree(tree: FilterTree, row: unknown): boolean {
  const conj = tree.conjunction
  const results = tree.children.map(child =>
    child.kind === 'cond' ? evaluateCondition(child, row) : evaluateGroup(child, row)
  )
  return conj === 'and' ? results.every(Boolean) : results.some(Boolean)
}

function evaluateGroup(group: FilterGroup, row: unknown): boolean {
  const results = group.children.map(c => evaluateCondition(c, row))
  return group.conjunction === 'and' ? results.every(Boolean) : results.some(Boolean)
}

function evaluateCondition(cond: FilterCondition, row: unknown): boolean {
  const cellValue = row[cond.field]  // 簡化,實際依 column accessor
  return matchOperator(cond.op, cellValue, cond.value)  // dispatch by op
}
```

**ms-precision when includeTime=true**:`matchOperator` 對 datetime 比對需檢查 column meta `includeTime`,true 走 ms 比對(避開 Airtable 地雷)。

## 4. Panel Props

```ts
export interface DataTableFilterPanelProps<TData> {
  /** flat 或 1-level nested */
  mode: 'flat' | 'nested'

  /** 可被 filter 的 columns(filter UI 從這列出 field 選項) */
  columns: ColumnDef<TData, any>[]

  /** 當前 FilterTree state(controlled) */
  value: FilterTree

  /** state 變更 callback */
  onChange: (next: FilterTree) => void

  /** 管理員 set-as-default 的 baseline value(refresh icon 顯示判定用) */
  defaultValue?: FilterTree

  /** 從 cell ⌄ menu「Filter by this」帶入的 column id */
  prefilledColumnId?: string
  onPrefillConsumed?: () => void

  /** 關閉 panel(由 Popover container 控制) */
  onClose?: () => void

  className?: string
}
```

### 重要 props 行為

| Prop | 行為 |
|---|---|
| `mode` | 一旦設定不可動態切換(切換會丟失 group 結構)|
| `value` / `onChange` | controlled-only(對齊 DataTable 其他 state 慣例) |
| `defaultValue` | 跟 `value` deep equal 比較,不等 → 顯示 refresh icon |
| `prefilledColumnId` | 開啟 panel 自動 add 該 column 一條空 condition(filter-by-this UX) |

## 5. UI 結構(對齊 ref 圖)

```
┌─ Popover Surface ──────────────────────────────────────┐
│ Header                                                 │
│   "篩選"            [refresh-when-modified] [X close]  │
├────────────────────────────────────────────────────────┤
│ Body(scrollable)                                       │
│  flat mode:                                            │
│    [Where|And ⌄] [field ⌄] [op ⌄] [value picker] [🗑] │
│    [And ⌄]      [field ⌄] [op ⌄] [value picker] [🗑] │
│    ...                                                 │
│                                                        │
│  nested mode:                                          │
│    ┌─ Group ──────────────────────────────────────┐   │
│    │ [Where] [field ⌄] [op ⌄] [value] [🗑]        │   │
│    │ [Or ⌄]  [field ⌄] [op ⌄] [value] [🗑]        │   │
│    │ [+ Add nested filter]                         │   │
│    └────────────────────────────────────────────────┘  │
│    ┌─ Group ──────────────────────────────────────┐   │
│    │ ...                                           │   │
│    └────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────┤
│ Footer                                                 │
│   [+ Add filter]                                       │
└────────────────────────────────────────────────────────┘
```

### 各區段元件消費

| 區段 | 消費 |
|---|---|
| Surface | `patterns/overlay-surface/` `<SurfaceHeader>` `<SurfaceBody>` `<SurfaceFooter>` |
| Title + close | `<PopoverTitle>` + `<Button iconOnly dismiss>` |
| Refresh icon | `<Button iconOnly>` + `RefreshCcw` lucide icon(只在 `value` ≠ `defaultValue` 時 render)|
| Conjunction label | `<Select>` for And/Or;靜態 text for Where(第 1 row)|
| Field selector | `<Select>` from filterable columns |
| Op selector | `<Select>` from `OPERATOR_REGISTRY[columnType]` |
| Value picker | data-driven by ValueShape — `<Input>` / `<NumberInput>` / `<DatePicker>` / `<DatePickerRange>` / `<DateTimePicker>` / `<DateTimeRangePicker>` / `<SelectMenu multiple>` / `<PeoplePicker multiple>` |
| Delete row | `<ItemInlineActionButton icon={Trash2}>` |
| Group container | 灰底 div(消費 `--surface-3` 或對應 token)+ `--radius-md` |
| Add filter button | `<Button variant="tertiary" size="sm" startIcon={Plus}>` |

### 互動規則

- **第 1 row 的 Where 是靜態 label**(不可 toggle)
- **field 未選 → operator + value picker disabled**(無法決定 op set + ValueShape)
- **op 為 `is_set` / `is_not_set` / `is_true` / `is_false` → value picker 不渲**(ValueShape `none`)
- **flat mode 的「+ Add filter」**:加 1 個 condition 到 root.children
- **nested mode 的「+ Add filter」(panel 底部)**:加 1 個 group(內含 1 個空 condition)到 root.children
- **nested mode 的「+ Add nested filter」(group 內)**:加 1 個 condition 到該 group.children
- **panel 開啟自動加 1 條空 row**(對齊 ref 圖,不顯示「尚未設定」字串)
- **沒有 drag handle**(對齊 ClickUp / Airtable / Notion;filter 順序不影響結果)

## 6. DataTable trigger button checked state

**獨立於 panel header refresh icon**(兩者邏輯不同):

| 狀態 | 何時 | Visual |
|---|---|---|
| Trigger button checked | `value` 有 ≥ 1 active condition(不論是否 = defaultValue) | `aria-pressed=true` + accent variant |
| Refresh icon visible | `value` ≠ `defaultValue` | 顯示 / 隱藏 |

兩者目的不同:
- **Trigger button checked**:讓 user 知道「資料被過濾、不完整」
- **Refresh icon**:讓 user 知道「目前不是管理員預設,可一鍵 reset」

## 6.5 Filterable column 判定 + Composite column

對齊 Notion / Airtable / Linear 派 + TanStack 內建 accessor vs display column 區分。

### Filterable column 判定規則

| Column 條件 | 是否出現在 filter UI |
|---|---|
| Display column(無 `accessorKey` / `accessorFn`)| ❌ 永不(TanStack 內建限制) |
| Accessor column + 有 `meta.type` | ✅ 預設出現 |
| Accessor column + 有 `meta.type` + `meta.filterable: false` | ❌ 顯式 opt-out |
| Accessor column + 無 `meta.type` | ❌ 不列(無 type 無法決定 op set) |

**強制**:**filterable column 必須設 `meta.type`**。對齊 Notion / Airtable / Linear:每 property 強制有 type(創建時必選)。
**強制**:filter UI 列 column 邏輯一句話 — `accessorKey && meta.type && meta.filterable !== false`。

### Composite column(兩 field 合一欄,如換行顯示)

對齊 TanStack 官方 idiom + Notion / Airtable / Linear:**資料保持 atomic,僅 render 層 composite**。

#### Pattern A(推薦,clean)— atomic columns + display column 合成

```ts
// 3 個 accessor column 給 filter 用,1 個 display column 給視覺合成
{ accessorKey: 'name',     meta: { type: 'string' } }                  // filter target
{ accessorKey: 'email',    meta: { type: 'string' } }                  // filter target
{ accessorKey: 'avatar',   meta: { filterable: false } }               // accessor but opt-out
{
  id: 'person',                                                        // display only(無 accessorKey)
  cell: ({ row }) => <NameCard {...row.original} />,                   // 視覺合 3 field
  // 自動不出現在 filter UI(TanStack 內建限制)
}
```

Filter UI:列 `name` / `email`(`avatar` opt-out,`person` 是 display 不列)。User 加 2 條 condition 對 atomic field 過濾。

#### Pattern B(compact)— 1 column 帶 type + 物件 accessor

```ts
{
  id: 'person',
  accessorFn: (row) => row,                                            // accessor function 回傳 user 物件
  meta: { type: 'person' },                                            // filter UI 用 PeoplePicker
  cell: ({ row }) => <NameCard {...row.original} />,
}
```

Filter UI:列 `person` 用 PeoplePicker。對「整個 person 物件」比對。**細顆粒**(只 by name)→ 退回 Pattern A。

#### 為什麼不另設 composite-column 機制

業界共識(Notion / Airtable / Linear / TanStack)— **filter 永遠對 atomic field**,composite 屬 cell render 範疇。另設機制會違反 TanStack 內建模型 + 增加複雜度,**不採用**。

## 7. A11y

| 面向 | 規範 |
|---|---|
| Panel role | `role="dialog"`(由 Popover 提供) |
| 操作標籤 | conjunction Select / field Select / op Select / value picker — 各自 aria-label |
| 鍵盤流 | Tab 順序:conjunction → field → op → value → trash → 下一 row → ... → add-filter button |
| Esc | 關 panel(由 Popover 處理) |
| Empty | panel 開啟時 focus 在第 1 row 的 field selector |

## 8. Edge cases & 禁止事項

- ❌ **混 AND/OR in same group**:UI 不允許,model 也不該存(toggle 任一 row → 翻整 group)
- ❌ **動態切換 `mode`**:會丟失 group 結構;consumer 應在 mount 前決定
- ❌ **1+ 層 nest**:型別禁止;UI 也不提供 add-group-inside-group button
- ❌ **drag handle**:對齊業界,filter 順序對結果無影響不需 drag
- ❌ **`is_set` / `is_not_set` 配 value picker**:邏輯衝突,直接不渲 picker

## 9. 開發 phase 銜接

**Phase C 主架構**(本 spec → code):
- C.1 `filter-operators.ts` registry(純 data,先做)
- C.2 `column-types.ts` 加 `meta.includeTime: boolean`
- C.3 `data-table-filter-panel.tsx` 重構(mode + group + per-row conjunction + data-driven picker)
- C.4 `dataTableFilterMatch` rewrite(globalFilter approach + tree eval + ms-precision)
- C.5 trigger button checked state + refresh icon
- C.6 auto-add 1 empty row + field-未選-disabled
- C.7 砍 GripVertical + dnd-kit

**Phase D 平行**(`datetime-picker.draft.md` 詳):
- D.1 DateTimePicker
- D.2 DateTimeRangePicker
- D.3 filter panel `includeTime=true` 渲 datetime picker

**Phase E**(stories + audit)— 詳 `advanced-filter-operators.draft.md` Section 8。

## 10. 待 review

- [ ] FilterTree types(尤其 1-level 鎖死設計)
- [ ] globalFilter approach 是否能 cover edge cases(下 Phase C 寫 50 行 POC 驗)
- [ ] Trigger button checked vs refresh icon 雙邏輯分離 OK?
- [ ] 灰底 group container 顏色 token 用 `--surface-3` 還是另設(下 visual review)

// @principles-canonical: Polaris-aligned UsageGuidance + Rule blocks
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTableFilterPanel, type FilterTree } from './data-table-filter-panel'

interface Row {
  sku: string
  category: string
  stock: number
}
const COLUMNS: ColumnDef<Row>[] = [
  { accessorKey: 'sku', header: 'SKU', meta: { type: 'string', filterable: true } },
  {
    accessorKey: 'category', header: '類別',
    meta: { type: 'select', filterable: true, options: [
      { value: 'Electronics', label: 'Electronics' }, { value: 'Furniture', label: 'Furniture' },
    ] },
  },
  { accessorKey: 'stock', header: '庫存', meta: { type: 'number', filterable: true } },
]

const meta: Meta = {
  title: 'Design System/Components/DataTableFilterPanel/設計原則',
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj

/** UsageGuidance — 何時用 / 何時不用 */
export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="max-w-[680px] flex flex-col gap-6 text-body">
      <section>
        <h3 className="font-bold text-foreground mb-2">何時用</h3>
        <ul className="ml-4 list-disc text-fg-muted">
          <li>DataTable 顯示「進階篩選」按鈕(對齊 ClickUp / Notion / Airtable AND/OR 多 condition expression)</li>
          <li>需要在多欄之間 AND/OR 混合(<code>columnFilters</code> 無法表達)</li>
          <li>需要 1-level group(<code>(A AND B) OR (C AND D)</code>)</li>
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-foreground mb-2">何時不用</h3>
        <ul className="ml-4 list-disc text-fg-muted">
          <li>單欄文字 quick search → 用 DataTable 內建 <code>globalFilter</code> text input</li>
          <li>單一 column 對單一 op(只 1 條 condition)→ 太重,給 column header 下拉</li>
          <li>複雜 SQL-like(任意層 nest / function call)→ 此 panel 鎖死 1-level</li>
          <li>Saved view / shared filter URL 持久化 → 屬上層業務邏輯</li>
        </ul>
      </section>
    </div>
  ),
}

/** Rule:1-level nest 鎖死(型別 enforce) */
export const Rule1LevelNestType: Story = {
  name: 'Rule:1-level nest 由型別鎖死',
  render: () => (
    <div className="max-w-[680px] flex flex-col gap-3 text-body">
      <p className="text-fg-muted">
        <code>FilterGroup['children']</code> 型別只允許 <code>FilterCondition[]</code>。**TypeScript 編譯就拒絕 over-nest**,
        不靠 runtime check;UI 也不提供 add-group-inside-group button。
      </p>
      <p className="text-fg-muted">
        對齊 ClickUp / Notion / Linear — 業界共識「進階 filter ≤ 1 層 nest」。多層 nest 看起來強大,
        但 user 99% 用不到 + UX 變難理解(parenthesis 巢狀深 = 認知負擔)。
      </p>
    </div>
  ),
}

/** Rule:同 group 不混 AND/OR(boolean ambiguity) */
export const RuleNoMixedConjunction: Story = {
  name: 'Rule:同 group 不混 AND/OR',
  render: () => (
    <div className="max-w-[680px] flex flex-col gap-3 text-body">
      <p className="text-fg-muted">
        Boolean logic 中,<code>A AND B OR C</code> 沒明確 precedence。
        業界共識:**同一 group 內所有 row 共用同一 conjunction**(toggle 任一 row → flip 整 group)。
        要表達 <code>(A AND B) OR C</code> 必走 nested mode 把 A, B 包成一個 AND group。
      </p>
    </div>
  ),
}

/** Rule:filter 順序不影響結果 — 不提供 drag handle */
export const RuleNoDragHandle: Story = {
  name: 'Rule:不提供 drag handle',
  render: () => (
    <div className="max-w-[680px] flex flex-col gap-3 text-body">
      <p className="text-fg-muted">
        AND / OR 滿足交換律 — filter 順序對結果無影響。對齊 ClickUp / Airtable / Notion,**不提供 drag handle**。
        加 drag = 增加 UI 複雜度但無業務意義。
      </p>
    </div>
  ),
}

/** Rule:globalFilter approach,不用 columnFilters */
export const RuleGlobalFilterApproach: Story = {
  name: 'Rule:globalFilter approach,棄 columnFilters',
  render: () => (
    <div className="max-w-[680px] flex flex-col gap-3 text-body">
      <p className="text-fg-muted">
        TanStack <code>columnFilters</code> 對單欄多 condition 只能 AND-chain,不能 OR。
        改用 <code>globalFilter + globalFilterFn</code> 自訂 tree 求值,可表達任意 boolean expression
        (包含跨欄 OR / 同欄 OR / nested group)。
      </p>
      <pre className="bg-[var(--color-neutral-1)] p-3 rounded text-caption font-mono overflow-x-auto">
{`useReactTable({
  state: { globalFilter: tree },
  onGlobalFilterChange: setTree,
  globalFilterFn: (row, _, t) => evaluateTree(t, row.original),
  getFilteredRowModel: getFilteredRowModel(),
})`}
      </pre>
    </div>
  ),
}

/** Visual demo 用 ClickUp Notion idiom 對照 */
export const VsClickUpNotionAirtable: Story = {
  name: 'Vs ClickUp / Notion / Airtable',
  render: () => {
    const [v, setV] = React.useState<FilterTree>({
      mode: 'nested',
      conjunction: 'or',
      children: [
        {
          kind: 'group', id: 'g1', conjunction: 'and',
          children: [
            { kind: 'cond', id: 'c1', field: 'category', op: 'is', value: ['Electronics'] },
            { kind: 'cond', id: 'c2', field: 'stock', op: 'gt', value: 0 },
          ],
        },
        {
          kind: 'group', id: 'g2', conjunction: 'and',
          children: [
            { kind: 'cond', id: 'c3', field: 'category', op: 'is', value: ['Furniture'] },
            { kind: 'cond', id: 'c4', field: 'stock', op: 'gte', value: 5 },
          ],
        },
      ],
    })
    return (
      <div className="max-w-[680px] flex flex-col gap-4">
        <p className="text-body text-fg-muted">
          (Electronics AND stock&gt;0) OR (Furniture AND stock≥5) — ClickUp / Notion / Airtable 通行 idiom。
        </p>
        <DataTableFilterPanel<Row> mode="nested" columns={COLUMNS} value={v} onChange={setV} />
      </div>
    )
  },
}

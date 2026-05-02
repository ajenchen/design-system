import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { type ColumnDef } from '@tanstack/react-table'
import {
  DataTableFilterPanel,
  type FilterTree,
} from './data-table-filter-panel'
import { createEmptyFilterTree, evaluateTree } from './filter-tree'

interface Product {
  sku: string
  name: string
  category: string
  stock: number
  price: number
  active: boolean
  releasedAt: string
}

const columns: ColumnDef<Product>[] = [
  { accessorKey: 'sku', header: 'SKU', meta: { type: 'string', filterable: true } },
  { accessorKey: 'name', header: '名稱', meta: { type: 'string', filterable: true } },
  {
    accessorKey: 'category',
    header: '類別',
    meta: {
      type: 'select',
      filterable: true,
      options: [
        { value: 'Electronics', label: 'Electronics' },
        { value: 'Furniture', label: 'Furniture' },
        { value: 'Food', label: 'Food' },
        { value: 'Lifestyle', label: 'Lifestyle' },
      ],
    },
  },
  { accessorKey: 'stock', header: '庫存', meta: { type: 'number', filterable: true } },
  { accessorKey: 'price', header: '價格', meta: { type: 'number', filterable: true } },
  { accessorKey: 'active', header: '上架', meta: { type: 'boolean', filterable: true } },
  {
    accessorKey: 'releasedAt',
    header: '上架時間',
    meta: { type: 'date', filterable: true, includeTime: true },
  },
]

// Title 走 `DataTable/進階篩選` 子 namespace(canonical 2026-05-02):FilterPanel 是 DataTable
// 的 sub-file primitive(同 SortManager pattern),不該以 first-class component 呈現於 Storybook sidebar。
// spec 段在 `data-table.spec.md` 「L4:Advanced Filter」。
const meta: Meta<typeof DataTableFilterPanel<Product>> = {
  title: 'Design System/Components/DataTable/進階篩選',
  component: DataTableFilterPanel<Product>,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'DataTable 進階 filter panel — flat 或 1-level nested boolean expression builder。' +
          '對齊 ClickUp / Notion / Airtable AND/OR 多 condition idiom。詳 `data-table.spec.md` L4 段。',
      },
    },
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof DataTableFilterPanel<Product>>

/* ── Flat ── */

export const FlatEmpty: Story = {
  name: 'Flat — 空狀態',
  render: () => {
    const [value, setValue] = React.useState<FilterTree>(() => createEmptyFilterTree('flat'))
    return (
      <div className="w-full max-w-[640px]">
        <DataTableFilterPanel<Product>
          mode="flat"
          columns={columns}
          value={value}
          onChange={setValue}
        />
      </div>
    )
  },
}

export const FlatWithConditions: Story = {
  name: 'Flat — 已填條件',
  render: () => {
    const [value, setValue] = React.useState<FilterTree>(() => ({
      mode: 'flat',
      conjunction: 'and',
      children: [
        // category 'is' op 走 select_multi shape(可同時選多值)— value 用 array
        { kind: 'cond', id: 'c1', field: 'name',     op: 'contains', value: 'phone' },
        { kind: 'cond', id: 'c2', field: 'category', op: 'is',       value: ['Electronics'] },
        { kind: 'cond', id: 'c3', field: 'stock',    op: 'gt',       value: 10 },
      ],
    }))
    return (
      <div className="w-full max-w-[640px]">
        <DataTableFilterPanel<Product>
          mode="flat"
          columns={columns}
          value={value}
          onChange={setValue}
        />
      </div>
    )
  },
}

/* ── Nested ── */

export const NestedTwoGroups: Story = {
  name: 'Nested — 兩個 group',
  render: () => {
    const [value, setValue] = React.useState<FilterTree>(() => ({
      mode: 'nested',
      conjunction: 'or',
      children: [
        {
          kind: 'group',
          id: 'g1',
          conjunction: 'and',
          children: [
            { kind: 'cond', id: 'c1', field: 'category', op: 'is',  value: ['Electronics'] },
            { kind: 'cond', id: 'c2', field: 'price',    op: 'lt',  value: 5000 },
          ],
        },
        {
          kind: 'group',
          id: 'g2',
          conjunction: 'and',
          children: [
            { kind: 'cond', id: 'c3', field: 'category', op: 'is',  value: ['Furniture'] },
            { kind: 'cond', id: 'c4', field: 'stock',    op: 'gte', value: 5 },
          ],
        },
      ],
    }))
    return (
      <div className="w-full max-w-[680px]">
        <DataTableFilterPanel<Product>
          mode="nested"
          columns={columns}
          value={value}
          onChange={setValue}
        />
      </div>
    )
  },
}

/* ── Refresh icon visible(value ≠ defaultValue)── */

export const ModifiedFromDefault: Story = {
  name: 'Refresh icon — 已改動',
  render: () => {
    const initial: FilterTree = {
      mode: 'flat',
      conjunction: 'and',
      children: [
        { kind: 'cond', id: 'c1', field: 'category', op: 'is', value: ['Electronics'] },
      ],
    }
    const modified: FilterTree = {
      mode: 'flat',
      conjunction: 'and',
      children: [
        { kind: 'cond', id: 'c1', field: 'category', op: 'is', value: ['Furniture'] },
      ],
    }
    const [value, setValue] = React.useState<FilterTree>(modified)
    return (
      <div className="w-full max-w-[640px]">
        <DataTableFilterPanel<Product>
          mode="flat"
          columns={columns}
          value={value}
          defaultValue={initial}
          onChange={setValue}
        />
        <p className="mt-3 text-caption text-fg-muted">
          panel header 應顯示 ↻ refresh icon — 點擊回 default。
        </p>
      </div>
    )
  },
}

/* ── Datetime column(includeTime=true)── */

export const DatetimeColumn: Story = {
  name: 'Datetime column(includeTime)',
  render: () => {
    const [value, setValue] = React.useState<FilterTree>(() => ({
      mode: 'flat',
      conjunction: 'and',
      children: [
        { kind: 'cond', id: 'c1', field: 'releasedAt', op: 'is_after', value: '2026-01-01T00:00:00' },
      ],
    }))
    return (
      <div className="w-full max-w-[680px]">
        <DataTableFilterPanel<Product>
          mode="flat"
          columns={columns}
          value={value}
          onChange={setValue}
        />
      </div>
    )
  },
}

/* ── Relative date(today / this_week / last_30_days)+ live row count ── */

export const RelativeDateFilter: Story = {
  name: 'Relative date — today / this_week / last_30_days',
  render: () => {
    // 含「今天 / 上週 / 30 天前」3 種樣本(以今天 = 2026-05-02 為錨點)
    const sampleRows: Product[] = [
      { sku: 'PRD-001', name: 'Released today',     category: 'Electronics', stock: 10, price: 1000, active: true,  releasedAt: '2026-05-02T10:00:00' },
      { sku: 'PRD-002', name: 'Released yesterday', category: 'Electronics', stock: 5,  price: 2000, active: true,  releasedAt: '2026-05-01T15:00:00' },
      { sku: 'PRD-003', name: 'Released this week', category: 'Electronics', stock: 8,  price: 3000, active: true,  releasedAt: '2026-04-29T09:00:00' },
      { sku: 'PRD-004', name: 'Released last week', category: 'Electronics', stock: 3,  price: 4000, active: true,  releasedAt: '2026-04-22T11:00:00' },
      { sku: 'PRD-005', name: 'Released 20 days ago', category: 'Electronics', stock: 2, price: 5000, active: false, releasedAt: '2026-04-12T14:00:00' },
      { sku: 'PRD-006', name: 'Released 60 days ago', category: 'Electronics', stock: 1, price: 6000, active: false, releasedAt: '2026-03-03T08:00:00' },
    ]
    const [value, setValue] = React.useState<FilterTree>(() => ({
      mode: 'flat',
      conjunction: 'and',
      children: [
        { kind: 'cond', id: 'c1', field: 'releasedAt', op: 'is_relative', value: 'past_7_days' },
      ],
    }))
    // Live evaluate 套樣本 row 數
    const matched = React.useMemo(
      () => sampleRows.filter((r) => evaluateTree(value, r)),
      [value],
    )
    return (
      <div className="flex flex-col gap-4 w-full max-w-[680px]">
        <DataTableFilterPanel<Product>
          mode="flat"
          columns={columns}
          value={value}
          onChange={setValue}
        />
        <div className="text-caption text-fg-muted">
          切「今天 / 本週 / 上週 / 過去 7 天 / 過去 30 天」應分別命中對應的 row。
        </div>
        <ul className="text-body border border-divider rounded-md p-3">
          <li className="font-bold mb-1">命中 {matched.length} / {sampleRows.length} 筆:</li>
          {matched.map((r) => (
            <li key={r.sku} className="text-fg-muted">
              {r.sku} — {r.name}({r.releasedAt})
            </li>
          ))}
          {matched.length === 0 && <li className="text-fg-muted italic">(無符合 row)</li>}
        </ul>
      </div>
    )
  },
}

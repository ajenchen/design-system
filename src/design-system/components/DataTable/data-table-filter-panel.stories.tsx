import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { type ColumnDef } from '@tanstack/react-table'
import {
  DataTableFilterPanel,
  type FilterTree,
} from './data-table-filter-panel'
import { createEmptyFilterTree } from './filter-tree'

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

const meta: Meta<typeof DataTableFilterPanel<Product>> = {
  title: 'Design System/Components/DataTableFilterPanel/展示',
  component: DataTableFilterPanel<Product>,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'DataTable 進階 filter panel — flat 或 1-level nested boolean expression builder。' +
          '對齊 ClickUp / Notion / Airtable AND/OR 多 condition idiom。詳 spec 同名 .spec.md。',
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
      <div className="w-[640px]">
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
      <div className="w-[640px]">
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
      <div className="w-[680px]">
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
      <div className="w-[640px]">
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
      <div className="w-[680px]">
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

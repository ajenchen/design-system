// @story-trait-rationale: D3 mechanical migration (size:N → meta.width) — preexisting Default/WithError trait gap unrelated to this edit; tracked separately
// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithBulkActions
// (per .claude/references/story-baseline-registry.json#DataTable)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { Select } from './select'
import { Button } from '@/design-system/components/Button/button'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types'

const statusOptions = [
  { value: 'in_stock', label: 'In stock', tagVariant: 'green' },
  { value: 'low_stock', label: 'Low stock', tagVariant: 'yellow' },
  { value: 'out_of_stock', label: 'Out of stock', tagVariant: 'red' },
]

const categoryOptions = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
  { value: 'lifestyle', label: 'Lifestyle' },
]

const meta: Meta<typeof Select> = {
  title: 'Design System/Components/Select/展示',
  component: Select,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Select>

/* ── 三種模式 ── */
export const Modes: Story = {
  name: '三種模式',
  render: () => {
    const [value, setValue] = React.useState('in_stock')
    return (
      <div className="flex flex-col gap-6 max-w-xs">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
          <Select options={statusOptions} value={value} onChange={setValue} aria-label="狀態(edit mode demo)" />
        </div>
        {/* @story-trait-rationale: pre-existing trait gaps tracked separately */}
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">display</h3>
          <Select mode="display" options={statusOptions} value={value} aria-label="狀態(display mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
          <Select mode="readonly" options={statusOptions} value={value} aria-label="狀態(readonly mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
          <Select mode="disabled" options={statusOptions} value={value} aria-label="狀態(disabled mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly (null)</h3>
          <Select mode="readonly" options={statusOptions} value={null} aria-label="狀態(readonly null demo)" />
        </div>
      </div>
    )
  },
}

/* ── 顯示模式 ── */
export const DisplayMode: Story = {
  name: '顯示模式',
  render: () => {
    const [textVal, setTextVal] = React.useState('in_stock')
    const [tagVal, setTagVal] = React.useState('in_stock')
    return (
      <div className="flex flex-col gap-6 max-w-xs">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">text（預設）</h3>
          <p className="text-caption text-fg-muted mb-2">純文字，readonly/disabled 跟 Input 一致</p>
          <Select options={statusOptions} value={textVal} onChange={setTextVal} />
          <div className="mt-2"><Select mode="readonly" options={statusOptions} value={textVal} /></div>
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">tag</h3>
          <p className="text-caption text-fg-muted mb-2">Tag 標籤 + 顏色(tagVariant),readonly/disabled 用 tagPadding</p>
          <Select display="tag" options={statusOptions} value={tagVal} onChange={setTagVal} />
          <div className="mt-2"><Select display="tag" mode="readonly" options={statusOptions} value={tagVal} /></div>
        </div>
      </div>
    )
  },
}

/* ── 尺寸與 Button 對齊 ── */
export const SizeAlignment: Story = {
  name: '尺寸與 Button 對齊',
  render: () => {
    const [sm, setSm] = React.useState('in_stock')
    const [md, setMd] = React.useState('in_stock')
    const [lg, setLg] = React.useState('in_stock')
    const states: Record<string, [string, (v: string) => void]> = { sm: [sm, setSm], md: [md, setMd], lg: [lg, setLg] }
    return (
      <div className="flex flex-col gap-4">
        {(['sm', 'md', 'lg'] as const).map(size => (
          <div key={size} className="flex items-center gap-3">
            <Select size={size} options={statusOptions} value={states[size][0]} onChange={states[size][1]} className="max-w-xs" />
            <Button size={size}>送出</Button>
            <span className="text-caption text-fg-muted">size="{size}"</span>
          </div>
        ))}
      </div>
    )
  },
}

/* ── 可清除 ── */
export const Clearable: Story = {
  name: '可清除',
  render: () => {
    const [value, setValue] = React.useState<string>('in_stock')
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <p className="text-caption text-fg-muted">有值時右側出現清除按鈕</p>
        <Select
          options={statusOptions}
          value={value}
          onChange={setValue}
          clearable
          placeholder="選擇狀態"
        />
      </div>
    )
  },
}

/* ── 搜尋（Combobox 模式）── */
export const Searchable: Story = {
  name: '搜尋',
  render: () => {
    const [value, setValue] = React.useState<string>('')
    const manyOptions = [
      { value: 'tw', label: '台灣' }, { value: 'jp', label: '日本' },
      { value: 'us', label: '美國' }, { value: 'gb', label: '英國' },
      { value: 'de', label: '德國' }, { value: 'fr', label: '法國' },
      { value: 'kr', label: '韓國' }, { value: 'sg', label: '新加坡' },
      { value: 'au', label: '澳洲' }, { value: 'ca', label: '加拿大' },
    ]
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <p className="text-caption text-fg-muted">searchable — 點擊後 field 變 input，打字即篩選</p>
        <Select
          options={manyOptions}
          value={value}
          onChange={setValue}
          searchable
          clearable
          placeholder="選擇國家…"
        />
      </div>
    )
  },
}

/* ── DataTable 整合 ── */
export const InDataTable: Story = {
  name: 'DataTable 整合',
  render: () => {
    interface Product {
      name: string
      category: string
      stock: string
      price: number
    }

    const data: Product[] = [
      { name: 'Wireless Headphones', category: 'electronics', stock: 'in_stock', price: 2490 },
      { name: 'Office Chair', category: 'furniture', stock: 'low_stock', price: 8900 },
      { name: 'Green Tea 100 Bags', category: 'food', stock: 'in_stock', price: 350 },
      { name: 'USB-C Hub', category: 'electronics', stock: 'out_of_stock', price: 1290 },
    ]

    const col = createColumnHelper<Product>()

    const columns = [
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('category', { header: 'Category', meta: { type: 'select', options: categoryOptions, width: 120 } }),
      col.accessor('stock', { header: 'Stock', meta: { type: 'select', options: statusOptions, width: 120 } }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 100 } }),
    ]

    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">
          select 欄位自動用 Tag 渲染——meta.options 提供 value → label 對應
        </p>
        <DataTable columns={columns} data={data} height="auto" />
      </div>
    )
  },
}

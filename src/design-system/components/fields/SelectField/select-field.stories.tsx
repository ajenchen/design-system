import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { SelectField } from './select-field'
import { Button } from '@/design-system/components/Button/button'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types'

const statusOptions = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
]

const categoryOptions = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
  { value: 'lifestyle', label: 'Lifestyle' },
]

const meta: Meta<typeof SelectField> = {
  title: 'Design System/Components/Fields/SelectField',
  component: SelectField,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof SelectField>

/* ── 三種模式 ── */
export const Modes: Story = {
  name: '三種模式',
  render: () => {
    const [value, setValue] = React.useState('in_stock')
    return (
      <div className="flex flex-col gap-6 max-w-xs">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
          <SelectField options={statusOptions} value={value} onChange={setValue} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
          <SelectField mode="readonly" options={statusOptions} value={value} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
          <SelectField mode="disabled" options={statusOptions} value={value} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly (null)</h3>
          <SelectField mode="readonly" options={statusOptions} value={null} />
        </div>
      </div>
    )
  },
}

/* ── 尺寸與 Button 對齊 ── */
export const SizeAlignment: Story = {
  name: '尺寸與 Button 對齊',
  render: () => (
    <div className="flex flex-col gap-4">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size} className="flex items-center gap-3">
          <SelectField size={size} options={statusOptions} value="in_stock" className="max-w-xs" />
          <Button size={size}>送出</Button>
          <span className="text-caption text-fg-muted">size="{size}"</span>
        </div>
      ))}
    </div>
  ),
}

/* ── 可清除 ── */
export const Clearable: Story = {
  name: '可清除',
  render: () => {
    const [value, setValue] = React.useState<string>('in_stock')
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <p className="text-caption text-fg-muted">有值時右側出現清除按鈕</p>
        <SelectField
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
      col.accessor('name', { header: 'Product', size: 200, meta: { type: 'text' } }),
      col.accessor('category', { header: 'Category', size: 120, meta: { type: 'select', options: categoryOptions } }),
      col.accessor('stock', { header: 'Stock', size: 120, meta: { type: 'select', options: statusOptions } }),
      col.accessor('price', { header: 'Price', size: 100, meta: { type: 'currency', prefix: '$' } }),
    ]

    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">
          select 欄位自動用 Badge 渲染——meta.options 提供 value → label 對應
        </p>
        <DataTable columns={columns} data={data} height="auto" />
      </div>
    )
  },
}

import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { NumberField } from './number-field'
import { Button } from '@/design-system/components/Button/button'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types'

const meta: Meta<typeof NumberField> = {
  title: 'Design System/Components/Fields/NumberField',
  component: NumberField,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof NumberField>

/* ── 三種模式 ── */
export const Modes: Story = {
  name: '三種模式',
  render: () => {
    const [value, setValue] = React.useState<number | null>(2490)
    return (
      <div className="flex flex-col gap-6 max-w-xs">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
          <NumberField value={value} onChange={setValue} prefix="$" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
          <NumberField mode="readonly" value={value} prefix="$" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
          <NumberField mode="disabled" value={value} prefix="$" />
        </div>
      </div>
    )
  },
}

/* ── 尺寸與 Button 對齊 ── */
export const SizeAlignment: Story = {
  name: '尺寸與 Button 對齊',
  render: () => {
    const [sm, setSm] = React.useState<number | null>(2490)
    const [md, setMd] = React.useState<number | null>(2490)
    const [lg, setLg] = React.useState<number | null>(2490)
    const states: Record<string, [number | null, (v: number | null) => void]> = { sm: [sm, setSm], md: [md, setMd], lg: [lg, setLg] }
    return (
      <div className="flex flex-col gap-4">
        {(['sm', 'md', 'lg'] as const).map(size => (
          <div key={size} className="flex items-center gap-3">
            <NumberField size={size} value={states[size][0]} onChange={states[size][1]} prefix="$" className="max-w-xs" />
            <Button size={size}>送出</Button>
            <span className="text-caption text-fg-muted">size="{size}"</span>
          </div>
        ))}
      </div>
    )
  },
}

/* ── 格式化選項 ── */
export const FormatOptions: Story = {
  name: '格式化選項',
  render: () => (
    <div className="flex flex-col gap-4 max-w-xs">
      <div>
        <p className="text-caption text-fg-muted mb-1">prefix="$"</p>
        <NumberField mode="readonly" value={2490} prefix="$" />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">suffix="%" precision={1}</p>
        <NumberField mode="readonly" value={85.5} suffix="%" precision={1} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">prefix="NT$" precision={0}</p>
        <NumberField mode="readonly" value={12500} prefix="NT$" precision={0} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">null value</p>
        <NumberField mode="readonly" value={null} prefix="$" />
      </div>
    </div>
  ),
}

/* ── Display in DataTable ── */
export const InDataTable: Story = {
  name: 'DataTable 整合',
  render: () => {
    interface Product {
      name: string
      price: number
      stock: number
      discount: number
    }

    const data: Product[] = [
      { name: 'Wireless Headphones', price: 2490, stock: 142, discount: 15 },
      { name: 'Office Chair', price: 8900, stock: 38, discount: 0 },
      { name: 'Green Tea 100 Bags', price: 350, stock: 520, discount: 10.5 },
      { name: 'USB-C Hub', price: 1290, stock: 0, discount: 20 },
    ]

    const col = createColumnHelper<Product>()

    const columns = [
      col.accessor('name', { header: 'Product', size: 200, meta: { type: 'text' } }),
      col.accessor('price', {
        header: 'Price',
        size: 120,
        meta: { type: 'currency', prefix: '$' },
      }),
      col.accessor('stock', {
        header: 'Stock',
        size: 100,
        meta: { type: 'number' },
      }),
      col.accessor('discount', {
        header: 'Discount',
        size: 100,
        meta: { type: 'number', suffix: '%' },
      }),
    ]

    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">
          不需要手寫 cell renderer——meta.type + 格式化參數自動套用 Display 元件
        </p>
        <DataTable columns={columns} data={data} height="auto" />
      </div>
    )
  },
}

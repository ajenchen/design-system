import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { BooleanField } from './boolean-field'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types'

const meta: Meta<typeof BooleanField> = {
  title: 'Design System/Components/Fields/BooleanField',
  component: BooleanField,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof BooleanField>

/* ── 三種模式 ── */
export const Modes: Story = {
  name: '三種模式',
  render: () => {
    const [checked, setChecked] = React.useState(true)
    return (
      <div className="flex flex-col gap-6 max-w-xs">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
          <BooleanField value={checked} onChange={setChecked} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly (true)</h3>
          <BooleanField mode="readonly" value={true} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly (false)</h3>
          <BooleanField mode="readonly" value={false} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
          <BooleanField mode="disabled" value={true} />
        </div>
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
      price: number
      inStock: boolean
      featured: boolean
    }

    const data: Product[] = [
      { name: 'Wireless Headphones', price: 2490, inStock: true, featured: true },
      { name: 'Office Chair', price: 8900, inStock: true, featured: false },
      { name: 'Green Tea 100 Bags', price: 350, inStock: false, featured: false },
      { name: 'USB-C Hub', price: 1290, inStock: true, featured: true },
    ]

    const col = createColumnHelper<Product>()

    const columns = [
      col.accessor('name', { header: 'Product', size: 200, meta: { type: 'text' } }),
      col.accessor('price', { header: 'Price', size: 100, meta: { type: 'currency', prefix: '$' } }),
      col.accessor('inStock', { header: 'In Stock', size: 80, meta: { type: 'boolean' } }),
      col.accessor('featured', { header: 'Featured', size: 80, meta: { type: 'boolean' } }),
    ]

    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">boolean 欄位靠左對齊，自動用 BooleanFieldDisplay 渲染（✓ 或 —）</p>
        <DataTable columns={columns} data={data} height="auto" />
      </div>
    )
  },
}

import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { MultiSelectField, MultiSelectFieldDisplay } from './multi-select-field'
import { Button } from '@/design-system/components/Button/button'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types'

const categoryOptions = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'clothing', label: 'Clothing' },
]

const meta: Meta<typeof MultiSelectField> = {
  title: 'Design System/Components/Fields/MultiSelectField',
  component: MultiSelectField,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof MultiSelectField>

/* ── 三種模式 ── */
export const Modes: Story = {
  name: '三種模式',
  render: () => {
    const [value, setValue] = React.useState(['electronics', 'food'])
    return (
      <div className="flex flex-col gap-6 max-w-sm">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
          <MultiSelectField options={categoryOptions} value={value} onChange={setValue} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
          <MultiSelectField mode="readonly" options={categoryOptions} value={value} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
          <MultiSelectField mode="disabled" options={categoryOptions} value={value} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly (empty)</h3>
          <MultiSelectField mode="readonly" options={categoryOptions} value={[]} />
        </div>
      </div>
    )
  },
}

/* ── 尺寸與 Button 對齊 ── */
export const SizeAlignment: Story = {
  name: '尺寸與 Button 對齊',
  render: () => {
    const [sm, setSm] = React.useState(['electronics', 'food', 'lifestyle'])
    const [md, setMd] = React.useState(['electronics', 'food', 'lifestyle'])
    const [lg, setLg] = React.useState(['electronics', 'food', 'lifestyle'])
    const states: Record<string, [string[], (v: string[]) => void]> = { sm: [sm, setSm], md: [md, setMd], lg: [lg, setLg] }
    return (
      <div className="flex flex-col gap-4">
        {(['sm', 'md', 'lg'] as const).map(size => (
          <div key={size} className="flex items-center gap-3">
            <MultiSelectField size={size} options={categoryOptions} value={states[size][0]} onChange={states[size][1]} className="max-w-xs" />
            <Button size={size}>送出</Button>
            <span className="text-caption text-fg-muted">size="{size}"</span>
          </div>
        ))}
      </div>
    )
  },
}

/* ── 單行 vs 換行 ── */
export const WrapModes: Story = {
  name: '單行 vs 換行',
  render: () => {
    const init = ['electronics', 'food', 'lifestyle', 'clothing', 'furniture']
    const [v1, setV1] = React.useState(init)
    const [v2, setV2] = React.useState(init)
    return (
      <div className="flex flex-col gap-6 w-72">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">單行（預設）</h3>
          <p className="text-caption text-fg-muted mb-3">塞不下的自動收進 +N，hover 顯示隱藏項</p>
          <MultiSelectField options={categoryOptions} value={v1} onChange={setV1} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">單行 readonly</h3>
          <MultiSelectField mode="readonly" options={categoryOptions} value={init} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">換行（wrap）</h3>
          <p className="text-caption text-fg-muted mb-3">高度隨內容長，badges 自動換行</p>
          <MultiSelectField options={categoryOptions} value={v2} onChange={setV2} wrap />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">換行 readonly</h3>
          <MultiSelectField mode="readonly" options={categoryOptions} value={init} wrap />
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
      categories: string[]
      price: number
    }

    const data: Product[] = [
      { name: 'Wireless Headphones', categories: ['electronics', 'lifestyle'], price: 2490 },
      { name: 'Office Chair', categories: ['furniture'], price: 8900 },
      { name: 'Green Tea', categories: ['food'], price: 350 },
      { name: 'USB-C Hub', categories: ['electronics'], price: 1290 },
    ]

    const col = createColumnHelper<Product>()
    const columns = [
      col.accessor('name', { header: 'Product', size: 200, meta: { type: 'text' } }),
      col.accessor('categories', {
        header: 'Categories',
        size: 200,
        meta: { type: 'multiSelect', options: categoryOptions },
      }),
      col.accessor('price', { header: 'Price', size: 100, meta: { type: 'currency', prefix: '$' } }),
    ]

    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">multiSelect 欄位自動用多個 Tag 渲染</p>
        <DataTable columns={columns} data={data} height="auto" />
      </div>
    )
  },
}

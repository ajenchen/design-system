import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { MultiSelectField, MultiSelectFieldDisplay } from './multi-select-field'
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

/* ── 單行 vs 換行 ── */
export const WrapModes: Story = {
  name: '單行 vs 換行',
  render: () => {
    const [values, setValues] = React.useState(['electronics', 'food', 'lifestyle', 'clothing', 'furniture'])
    return (
      <div className="flex flex-col gap-6 max-w-xs">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">單行（預設）</h3>
          <p className="text-caption text-fg-muted mb-3">固定高度，badges 超出時 truncate</p>
          <MultiSelectField options={categoryOptions} value={values} onChange={setValues} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">單行 + maxVisible=2</h3>
          <p className="text-caption text-fg-muted mb-3">最多顯示 2 個 badge，其餘 +N</p>
          <MultiSelectField options={categoryOptions} value={values} onChange={setValues} maxVisible={2} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">換行（wrap）</h3>
          <p className="text-caption text-fg-muted mb-3">高度隨內容長，badges 自動換行</p>
          <MultiSelectField options={categoryOptions} value={values} onChange={setValues} wrap />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">換行 readonly</h3>
          <MultiSelectField mode="readonly" options={categoryOptions} value={values} wrap />
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
        <p className="text-caption text-fg-muted mb-3">multiSelect 欄位自動用多個 Badge 渲染</p>
        <DataTable columns={columns} data={data} height="auto" />
      </div>
    )
  },
}

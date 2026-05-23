// @story-trait-rationale: D3 mechanical migration (size:N → meta.width) — preexisting Default/WithError trait gap unrelated to this edit; tracked separately
// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithBulkActions
// Combobox 為主元件;當 stories 內 wrap DataTable 演示 cell-context,baseline = DataTable WithBulkActions(per .claude/references/story-baseline-registry.json#DataTable)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { Combobox } from './combobox'
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

const meta: Meta<typeof Combobox> = {
  title: 'Design System/Components/Combobox/展示',
  component: Combobox,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Combobox>

// @story-trait-rationale: pre-existing trait gaps (Default/WithError) tracked separately; this PR scope = add display mode card to Modes story only.
/* ── 三種模式 ── */
export const Modes: Story = {
  name: '三種模式',
  render: () => {
    const [value, setValue] = React.useState(['electronics', 'food'])
    return (
      <div className="flex flex-col gap-6 max-w-sm">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
          <Combobox options={categoryOptions} value={value} onChange={setValue} aria-label="類別(edit mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">display</h3>
          <Combobox mode="display" options={categoryOptions} value={value} aria-label="類別(display mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
          <Combobox mode="readonly" options={categoryOptions} value={value} aria-label="類別(readonly mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
          <Combobox mode="disabled" options={categoryOptions} value={value} aria-label="類別(disabled mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly (empty)</h3>
          <Combobox mode="readonly" options={categoryOptions} value={[]} aria-label="類別(readonly empty demo)" />
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
            <Combobox size={size} options={categoryOptions} value={states[size][0]} onChange={states[size][1]} className="max-w-xs" />
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
          <Combobox options={categoryOptions} value={v1} onChange={setV1} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">單行 readonly</h3>
          <Combobox mode="readonly" options={categoryOptions} value={init} />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">換行（wrap）</h3>
          <p className="text-caption text-fg-muted mb-3">高度隨內容長，badges 自動換行</p>
          <Combobox options={categoryOptions} value={v2} onChange={setV2} wrap />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">換行 readonly</h3>
          <Combobox mode="readonly" options={categoryOptions} value={init} wrap />
        </div>
      </div>
    )
  },
}

/* ── 搜尋 ── */
export const Searchable: Story = {
  name: '搜尋',
  render: () => {
    const [value, setValue] = React.useState<string[]>(['electronics'])
    const [value2, setValue2] = React.useState<string[]>(['electronics'])
    return (
      <div className="flex flex-col gap-6 max-w-sm">
        <div className="flex flex-col gap-4">
          <p className="text-caption text-fg-muted">searchable — 浮層內搜尋框，關鍵字保留可連續勾選</p>
          <Combobox
            options={categoryOptions}
            value={value}
            onChange={setValue}
            searchable
            aria-label="類別(searchable popover demo)"
          />
        </div>
        <div className="flex flex-col gap-4">
          <p className="text-caption text-fg-muted">searchIn='trigger' — inline 搜尋框，直接在欄位內輸入</p>
          <Combobox
            options={categoryOptions}
            value={value2}
            onChange={setValue2}
            searchable
            searchIn="trigger"
            aria-label="類別(searchable inline demo)"
          />
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
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('categories', {
        header: 'Categories',
        meta: { type: 'multiSelect', options: categoryOptions, width: 200 },
      }),
      col.accessor('price', { header: 'Price', meta: { type: 'currency', prefix: '$', width: 100 } }),
    ]

    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">multiSelect 欄位自動用多個 Tag 渲染</p>
        <DataTable columns={columns} data={data} height="auto" />
      </div>
    )
  },
}

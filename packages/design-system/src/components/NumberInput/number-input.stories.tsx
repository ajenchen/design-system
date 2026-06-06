// @story-trait-rationale: D3 mechanical migration (size:N → meta.width) — preexisting Default/WithError trait gap unrelated to this edit; tracked separately
// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithBulkActions
// (per .claude/references/story-baseline-registry.json#DataTable)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { NumberInput } from './number-input'
import { Button } from '@/design-system/components/Button/button'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types'

const meta: Meta<typeof NumberInput> = {
  title: 'Design System/Components/NumberInput/展示',
  component: NumberInput,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof NumberInput>

// @story-trait-rationale: pre-existing trait gaps (Default/WithError) tracked separately; this PR scope = add display mode card to Modes story only.
/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => {
    const [value, setValue] = React.useState<number | null>(2490)
    return (
      <div className="flex flex-col gap-6 max-w-xs">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
          <NumberInput value={value} onChange={setValue} prefix="$" aria-label="價格(edit mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">display</h3>
          <NumberInput mode="display" value={value} prefix="$" aria-label="價格(display mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
          <NumberInput mode="readonly" value={value} prefix="$" aria-label="價格(readonly mode demo)" />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
          <NumberInput mode="disabled" value={value} prefix="$" aria-label="價格(disabled mode demo)" />
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
            <NumberInput size={size} value={states[size][0]} onChange={states[size][1]} prefix="$" className="max-w-xs" />
            <Button variant="primary" size={size}>送出</Button>
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
        <NumberInput mode="readonly" value={2490} prefix="$" />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">suffix="%" precision={1}</p>
        <NumberInput mode="readonly" value={85.5} suffix="%" precision={1} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">prefix="NT$" precision={0}</p>
        <NumberInput mode="readonly" value={12500} prefix="NT$" precision={0} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">null value</p>
        <NumberInput mode="readonly" value={null} prefix="$" />
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
      col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
      col.accessor('price', {
        header: 'Price',
        meta: { type: 'currency', prefix: '$', width: 120 },
      }),
      col.accessor('stock', {
        header: 'Stock',
        meta: { type: 'number', width: 100 },
      }),
      col.accessor('discount', {
        header: 'Discount',
        meta: { type: 'number', suffix: '%', width: 100 },
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

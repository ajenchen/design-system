// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithBulkActions
// (per .claude/references/story-baseline-registry.json#DataTable)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { NumberInput } from './number-input'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import { Field, FieldError, FieldLabel } from '@/design-system/components/Field/field'
import { ExampleSection, ExampleStack } from '@/design-system/stories-helpers/examples/tutorial-page'
import '@/design-system/components/DataTable/column-types'

const meta: Meta<typeof NumberInput> = {
  title: 'Design System/Components/NumberInput/展示',
  component: NumberInput,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: '輸入精確數值並依 prefix / suffix / precision 格式化顯示;純值輸入、不提供步進按鈕。只需大致調整且即時預覽時改用 Slider。' } },
  },
}

export default meta
type Story = StoryObj<typeof NumberInput>

/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => {
    const [value, setValue] = React.useState<number | null>(2490)
    return (
      <ExampleStack className="max-w-xs">
        <ExampleSection title="edit">
          <NumberInput value={value} onChange={setValue} prefix="$" aria-label="價格(edit mode demo)" />
        </ExampleSection>
        <ExampleSection title="view">
          <NumberInput mode="view" value={value} prefix="$" aria-label="價格(view 模式示範)" />
        </ExampleSection>
        <ExampleSection title="readonly">
          <NumberInput mode="readonly" value={value} prefix="$" aria-label="價格(readonly mode demo)" />
        </ExampleSection>
        <ExampleSection title="disabled">
          <NumberInput mode="disabled" value={value} prefix="$" aria-label="價格(disabled mode demo)" />
        </ExampleSection>
      </ExampleStack>
    )
  },
}

// 只示範錯誤長相:固定 invalid + 固定錯誤字,不隨值變(稽核 L008:隨值即時切換 = 邊打邊驗,違反 form-validation.spec.md「Blur 時驗證」)
function NumberInputErrorExample() {
  const [value, setValue] = React.useState<number | null>(null)
  return (
    <Field required invalid className="max-w-xs">
      <FieldLabel>採購數量</FieldLabel>
      <NumberInput value={value} onChange={setValue} aria-label="採購數量" />
      <FieldError>請輸入至少 1 件商品</FieldError>
    </Field>
  )
}

export const WithError: Story = {
  name: '驗證錯誤',
  parameters: { docs: { description: { story: '只示範錯誤的長相(紅框 + 錯誤訊息,固定顯示)。實際表單在使用者離開欄位或按送出時才驗證。' } } },
  render: () => <NumberInputErrorExample />,
}

// @story-history: 三種尺寸(SizeAlignment)退役 2026-10-28 —— 高度對照由設計規格「尺寸對照表」負責(稽核 L079 / L101)。

/* ── 格式化選項 ── */
export const FormatOptions: Story = {
  name: '格式化選項',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-xs">
      <div>
        <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">prefix="$"</p>
        <NumberInput mode="readonly" value={2490} prefix="$" aria-label="美元價格" />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">suffix="%" precision={1}</p>
        <NumberInput mode="readonly" value={85.5} suffix="%" precision={1} aria-label="百分比" />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">prefix="NT$" precision={0}</p>
        <NumberInput mode="readonly" value={12500} prefix="NT$" precision={0} aria-label="新台幣價格" />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">null value</p>
        <NumberInput mode="readonly" value={null} prefix="$" aria-label="空白美元價格" />
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
        <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">
          不需要手寫 cell renderer——meta.type + 格式化參數自動套用 Display 元件
        </p>
        <DataTable columns={columns} data={data} height="auto" />
      </div>
    )
  },
}

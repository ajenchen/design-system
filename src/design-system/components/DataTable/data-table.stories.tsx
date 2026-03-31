import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from './data-table'
import './column-types' // ColumnMeta declaration merging

// ── Sample Data ──────────────────────────────────────────────────────────────

interface Product {
  sku: string
  name: string
  category: string
  stock: string
  seller: string
  updatedAt: string
  price?: number
  note?: string
}

const sampleData: Product[] = [
  { sku: 'PRD-001', name: 'Wireless Bluetooth Headphones', category: 'Electronics', stock: 'In stock', seller: 'Alice Wang', updatedAt: '2025/03/12', price: 2490 },
  { sku: 'PRD-002', name: 'Ergonomic Office Chair with Lumbar Support', category: 'Furniture', stock: 'Low stock', seller: 'Bob Chen', updatedAt: '2025/03/14', price: 8900 },
  { sku: 'PRD-003', name: 'Organic Green Tea 100 Bags', category: 'Food', stock: 'In stock', seller: 'Carol Liu', updatedAt: '2025/03/15', price: 350 },
  { sku: 'PRD-004', name: 'USB-C Hub 7-in-1 Adapter', category: 'Electronics', stock: 'Out of stock', seller: 'Alice Wang', updatedAt: '2025/03/16', price: 1290 },
  { sku: 'PRD-005', name: 'Stainless Steel Water Bottle 750ml', category: 'Lifestyle', stock: 'In stock', seller: 'David Wu', updatedAt: '2025/03/18', price: 680 },
  { sku: 'PRD-006', name: 'Mechanical Keyboard with Cherry MX Brown Switches and RGB Backlight', category: 'Electronics', stock: 'In stock', seller: 'Bob Chen', updatedAt: '2025/03/20', price: 3200 },
]

const dataWithNotes: Product[] = sampleData.map((p, i) => ({
  ...p,
  note: i % 2 === 0
    ? 'This product requires special packaging for international shipping. Please verify customs documentation before dispatch.'
    : 'Standard delivery.',
}))

function generateLargeData(count: number): Product[] {
  const categories = ['Electronics', 'Furniture', 'Food', 'Lifestyle']
  const stocks = ['In stock', 'Low stock', 'Out of stock', 'Pre-order']
  const sellers = ['Alice Wang', 'Bob Chen', 'Carol Liu', 'David Wu']
  return Array.from({ length: count }, (_, i) => ({
    sku: `PRD-${String(i + 1).padStart(4, '0')}`,
    name: `Product item ${i + 1} — ${categories[i % 4]}`,
    category: categories[i % 4],
    stock: stocks[i % 4],
    seller: sellers[i % 4],
    updatedAt: `2025/03/${String(1 + (i % 28)).padStart(2, '0')}`,
    price: Math.round(100 + Math.random() * 9900),
  }))
}

// ── Column Definitions ───────────────────────────────────────────────────────

const col = createColumnHelper<Product>()

const baseColumns = [
  col.accessor('sku', { header: 'SKU', size: 100, minSize: 80, meta: { type: 'text' } }),
  col.accessor('name', { header: 'Product', size: 280, minSize: 120, meta: { type: 'text' } }),
  col.accessor('category', { header: 'Category', size: 120, meta: { type: 'select' } }),
  col.accessor('stock', { header: 'Stock', size: 110, meta: { type: 'select' } }),
  col.accessor('seller', { header: 'Seller', size: 120, meta: { type: 'person' } }),
  col.accessor('updatedAt', { header: 'Updated', size: 120, meta: { type: 'date' } }),
]

const columnsWithPrice = [
  ...baseColumns,
  col.accessor('price', {
    header: 'Price',
    size: 120,
    meta: { type: 'number' },
    cell: (info) => {
      const val = info.getValue()
      return val != null ? `$${val.toLocaleString()}` : '—'
    },
  }),
]

const columnsWithNote = [
  col.accessor('sku', { header: 'SKU', size: 100, meta: { type: 'text' } }),
  col.accessor('name', { header: 'Product', size: 200, meta: { type: 'text' } }),
  col.accessor('note', {
    header: 'Note',
    size: 300,
    meta: { type: 'text', wrap: true },
  }),
  col.accessor('category', { header: 'Category', size: 120, meta: { type: 'select' } }),
  col.accessor('seller', { header: 'Seller', size: 120, meta: { type: 'person' } }),
]

// ── Stories ───────────────────────────────────────────────────────────────────

const meta: Meta<typeof DataTable> = {
  title: 'Design System/Components/DataTable/展示',
  component: DataTable as any,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '基於 TanStack Table 的資料表格，支援虛擬捲動、排序、多種尺寸。',
      },
    },
  },
}

export default meta
type Story = StoryObj

/* ── Column Types ── */
export const ColumnTypes: Story = {
  name: 'Column Types',
  render: () => {
    interface TypeDemo {
      label: string
      textVal: string
      numberVal: number
      currencyVal: number
      dateVal: string
      boolVal: boolean
    }

    const typeCol = createColumnHelper<TypeDemo>()
    const typeCols = [
      typeCol.accessor('label', { header: 'Label', size: 120, meta: { type: 'text' } }),
      typeCol.accessor('textVal', { header: 'Text', size: 180, meta: { type: 'text' } }),
      typeCol.accessor('numberVal', { header: 'Number', size: 100, meta: { type: 'number' } }),
      typeCol.accessor('currencyVal', {
        header: 'Currency', size: 120, meta: { type: 'currency' },
        cell: (info) => `$${info.getValue().toLocaleString()}`,
      }),
      typeCol.accessor('dateVal', { header: 'Date', size: 120, meta: { type: 'date' } }),
      typeCol.accessor('boolVal', {
        header: 'Active', size: 80, meta: { type: 'boolean' },
        cell: (info) => info.getValue() ? '✓' : '—',
      }),
    ]
    const typeData: TypeDemo[] = [
      { label: 'Row A', textVal: 'Wireless Headphones', numberVal: 142, currencyVal: 2490, dateVal: '2025/03/12', boolVal: true },
      { label: 'Row B', textVal: 'Office Chair', numberVal: 38, currencyVal: 8900, dateVal: '2025/03/14', boolVal: false },
      { label: 'Row C', textVal: 'Green Tea 100 Bags', numberVal: 520, currencyVal: 350, dateVal: '2025/03/15', boolVal: true },
    ]

    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">每個欄位指定 type，對齊由 type 自動決定（text 靠左、number/currency 靠右、boolean 置中）</p>
        <DataTable columns={typeCols} data={typeData} height="auto" />
      </div>
    )
  },
}

/* ── 三種尺寸 ── */
export const Sizes: Story = {
  name: '尺寸',
  render: () => (
    <div className="flex flex-col gap-8">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <h3 className="text-body font-bold text-foreground mb-2">size="{size}"</h3>
          <DataTable columns={baseColumns} data={sampleData.slice(0, 3)} size={size} height="auto" />
        </div>
      ))}
    </div>
  ),
}

/* ── 數字靠右對齊 ── */
export const NumberAlignment: Story = {
  name: '數字靠右對齊',
  render: () => (
    <DataTable columns={columnsWithPrice} data={sampleData} height="auto" />
  ),
}

/* ── 行高模式 ── */
export const RowHeightModes: Story = {
  name: '行高模式',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">固定行高（預設）</h3>
        <p className="text-caption text-fg-muted mb-3">所有內容垂直置中，文字截斷</p>
        <DataTable columns={baseColumns} data={sampleData} height="auto" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">自動行高（autoRowHeight）</h3>
        <p className="text-caption text-fg-muted mb-3">內容頂部對齊，wrap 欄位可撐高 row</p>
        <DataTable columns={columnsWithNote} data={dataWithNotes} height="auto" autoRowHeight />
      </div>
    </div>
  ),
}

/* ── Empty State ── */
export const EmptyState: Story = {
  name: '空狀態',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">預設空狀態</h3>
        <DataTable columns={baseColumns} data={[]} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">自訂空狀態</h3>
        <DataTable
          columns={baseColumns}
          data={[]}
          emptyState={
            <div className="text-center">
              <p className="text-body text-fg-muted mb-1">尚無商品</p>
              <p className="text-caption text-fg-muted">點擊上方「新增」開始建立</p>
            </div>
          }
        />
      </div>
    </div>
  ),
}

/* ── 外框規則 ── */
export const Bordered: Story = {
  name: '外框',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">有外框（預設）</h3>
        <DataTable columns={baseColumns} data={sampleData.slice(0, 3)} height="auto" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">無外框</h3>
        <p className="text-caption text-fg-muted mb-3">少數嵌入式場景可關閉外框</p>
        <DataTable columns={baseColumns} data={sampleData.slice(0, 3)} height="auto" bordered={false} />
      </div>
    </div>
  ),
}

/* ── 高度模式 ── */
export const HeightModes: Story = {
  name: '高度模式',
  render: () => {
    const manyRows = React.useMemo(() => generateLargeData(50), [])
    return (
      <div className="flex flex-col gap-10">
        <div>
          <h3 className="text-body font-bold text-foreground mb-1">無約束</h3>
          <p className="text-caption text-fg-muted mb-3">height="auto"，table 高度完全取決於內容，不出現捲軸</p>
          <DataTable columns={baseColumns} data={sampleData} height="auto" />
        </div>

        <div>
          <h3 className="text-body font-bold text-foreground mb-1">有約束</h3>
          <p className="text-caption text-fg-muted mb-3">height="300px"，兩張 table 在同樣的高度上限內。資料少時只佔內容高度，資料多時撐到上限後出現捲軸</p>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-neutral-active rounded-lg p-4">
              <p className="text-footnote text-fg-muted mb-3">3 筆資料</p>
              <DataTable columns={baseColumns} data={sampleData.slice(0, 3)} height="300px" />
            </div>
            <div className="bg-neutral-active rounded-lg p-4">
              <p className="text-footnote text-fg-muted mb-3">50 筆資料</p>
              <DataTable columns={baseColumns} data={manyRows} height="300px" />
            </div>
          </div>
        </div>
      </div>
    )
  },
}

/* ── 虛擬捲動（大量資料）── */
export const VirtualScroll: Story = {
  name: '虛擬捲動（10,000 行）',
  render: () => {
    const largeData = React.useMemo(() => generateLargeData(10000), [])
    return (
      <DataTable
        columns={columnsWithPrice}
        data={largeData}
        height="500px"
        overscan={10}
      />
    )
  },
}

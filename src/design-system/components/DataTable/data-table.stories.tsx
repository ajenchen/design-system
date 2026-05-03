// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// same-row-mixed-allow: file 含 toolbar Button iconOnly + row ItemInlineActionButton,但兩者在不同 row(toolbar 跟 panel row 分離)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { Pencil, Trash2, MoreVertical, Search, Filter, Eye, EyeOff, Lock, GripVertical, RotateCcw, Download, Plus, ArrowUpDown, X as XIcon } from 'lucide-react'
import { DataTable } from './data-table'
import { DataTableSortManager } from './data-table-sort-manager'
import { DataTableFilterPanel, evaluateTree, createEmptyFilterTree, isFilterTreeActive, type FilterTree } from './data-table-filter-panel'
import { getFilteredRowModel, type SortingState } from '@tanstack/react-table'
import { Button } from '@/design-system/components/Button/button'
import { Empty } from '@/design-system/components/Empty/empty'
import { Input } from '@/design-system/components/Input/input'
import { BulkActionBar } from '@/design-system/components/BulkActionBar/bulk-action-bar'
import { Alert } from '@/design-system/components/Alert/alert'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverFooter, PopoverTitle, PopoverClose } from '@/design-system/components/Popover/popover'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { ButtonDivider } from '@/design-system/components/Button/button-group'
import { ItemPrefix, ItemLabel, ItemInlineActionButton, ROW_PADDING_BY_SIZE } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { cn } from '@/lib/utils'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './column-types' // ColumnMeta declaration merging

// ── Sample Data ──────────────────────────────────────────────────────────────

// ── Person sample data canonical ──
// 對齊 NameCard.stories「Default」預設呈現:name + subtitle + status + statusMessage + fields
// avatar.spec.md DS-wide:所有 person avatar hover 必出現 NameCard,展示資訊一致(不可精簡)
import type { PersonData } from '@/design-system/components/PeoplePicker/person-display'

const SELLERS: PersonData[] = [
  { name: 'Alice Wonderland Wang', avatarUrl: 'https://i.pravatar.cc/128?u=alice', description: 'Sales｜Tokyo｜EMP-1001', status: 'online', statusMessage: '出差中,週四回。緊急請聯絡 @bob 代理。', fields: [{ label: 'ID', value: 'AWW001' }, { label: '部門', value: 'Sales / APAC' }, { label: '時區', value: 'JST (GMT+9)' }] },
  { name: 'Bob Christopher Chen', avatarUrl: 'https://i.pravatar.cc/128?u=bob', description: 'Sales｜Taipei｜EMP-1002', status: 'busy', statusMessage: '會議中,訊息我會儘快回。', fields: [{ label: 'ID', value: 'BCC002' }, { label: '部門', value: 'Sales / APAC' }, { label: '時區', value: 'TST (GMT+8)' }] },
  { name: 'Carol Liu', avatarUrl: 'https://i.pravatar.cc/128?u=carol', description: 'Sales｜Singapore｜EMP-1003', status: 'online', statusMessage: '今日彈性工作。', fields: [{ label: 'ID', value: 'CL003' }, { label: '部門', value: 'Sales / APAC' }, { label: '時區', value: 'SGT (GMT+8)' }] },
  { name: 'Alexander Hamilton Zhang', avatarUrl: 'https://i.pravatar.cc/128?u=alex', description: 'Sales｜Shanghai｜EMP-1004', status: 'away', statusMessage: '已離開辦公室,週一回。', fields: [{ label: 'ID', value: 'AHZ004' }, { label: '部門', value: 'Sales / APAC' }, { label: '時區', value: 'CST (GMT+8)' }] },
  { name: 'David Wu', avatarUrl: 'https://i.pravatar.cc/128?u=david', description: 'Sales｜Hong Kong｜EMP-1005', status: 'online', statusMessage: '可線上協助。', fields: [{ label: 'ID', value: 'DW005' }, { label: '部門', value: 'Sales / APAC' }, { label: '時區', value: 'HKT (GMT+8)' }] },
  { name: 'Elizabeth Montgomery Johnson', avatarUrl: 'https://i.pravatar.cc/128?u=elizabeth', description: 'Sales｜Sydney｜EMP-1006', status: 'offline', statusMessage: '已下線,明早 9:00 上線。', fields: [{ label: 'ID', value: 'EMJ006' }, { label: '部門', value: 'Sales / APAC' }, { label: '時區', value: 'AEST (GMT+10)' }] },
]

interface Product {
  sku: string
  name: string
  category: string
  stock: string
  seller: PersonData
  updatedAt: string
  price?: number
  note?: string
}

const sampleData: Product[] = [
  { sku: 'PRD-001', name: 'Wireless Bluetooth Headphones', category: 'Electronics', stock: 'In stock', seller: SELLERS[0], updatedAt: '2025/03/12', price: 2490 },
  { sku: 'PRD-002', name: 'Ergonomic Office Chair with Lumbar Support', category: 'Furniture', stock: 'Low stock', seller: SELLERS[1], updatedAt: '2025/03/14', price: 8900 },
  { sku: 'PRD-003', name: 'Organic Green Tea 100 Bags', category: 'Food', stock: 'In stock', seller: SELLERS[2], updatedAt: '2025/03/15', price: 350 },
  { sku: 'PRD-004', name: 'USB-C Hub 7-in-1 Adapter', category: 'Electronics', stock: 'Out of stock', seller: SELLERS[3], updatedAt: '2025/03/16', price: 1290 },
  { sku: 'PRD-005', name: 'Stainless Steel Water Bottle 750ml', category: 'Lifestyle', stock: 'In stock', seller: SELLERS[4], updatedAt: '2025/03/18', price: 680 },
  { sku: 'PRD-006', name: 'Mechanical Keyboard with Cherry MX Brown Switches and RGB Backlight', category: 'Electronics', stock: 'In stock', seller: SELLERS[5], updatedAt: '2025/03/20', price: 3200 },
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
  return Array.from({ length: count }, (_, i) => ({
    sku: `PRD-${String(i + 1).padStart(4, '0')}`,
    name: `Product item ${i + 1} — ${categories[i % 4]}`,
    category: categories[i % 4],
    stock: stocks[i % 4],
    seller: SELLERS[i % SELLERS.length],
    updatedAt: `2025/03/${String(1 + (i % 28)).padStart(2, '0')}`,
    price: Math.round(100 + Math.random() * 9900),
  }))
}

// ── Column Definitions ───────────────────────────────────────────────────────

const col = createColumnHelper<Product>()

const baseColumns = [
  col.accessor('sku', { header: 'SKU', size: 100, minSize: 80, meta: { type: 'string' } }),
  col.accessor('name', { header: 'Product', size: 280, minSize: 120, meta: { type: 'string' } }),
  col.accessor('category', { header: 'Category', size: 120, meta: { type: 'select' } }),
  col.accessor('stock', { header: 'Stock', size: 110, meta: { type: 'select' } }),
  col.accessor('seller', { header: 'Seller', size: 150, meta: { type: 'person' } }),
  col.accessor('updatedAt', { header: 'Updated', size: 120, meta: { type: 'date' } }),
]

const columnsWithPrice = [
  ...baseColumns,
  col.accessor('price', {
    header: 'Price',
    size: 120,
    meta: { type: 'currency', prefix: '$' },
  }),
]

const columnsWithNote = [
  col.accessor('sku', { header: 'SKU', size: 100, meta: { type: 'string' } }),
  col.accessor('name', { header: 'Product', size: 200, meta: { type: 'string' } }),
  col.accessor('note', {
    header: 'Note',
    size: 300,
    meta: { type: 'string', wrap: true },
  }),
  col.accessor('category', { header: 'Category', size: 120, meta: { type: 'select' } }),
  col.accessor('seller', { header: 'Seller', size: 150, meta: { type: 'person' } }),
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
      name: string
      quantity: number
      price: number
      date: string
      active: boolean
      status: string
      tags: string[]
      seller: PersonData
      url: string
    }

    const typeCol = createColumnHelper<TypeDemo>()
    const statusOptions = [
      { value: 'in_stock', label: 'In stock' },
      { value: 'low_stock', label: 'Low stock' },
      { value: 'out_of_stock', label: 'Out of stock' },
    ]
    const tagOptions = [
      { value: 'electronics', label: 'Electronics' },
      { value: 'lifestyle', label: 'Lifestyle' },
      { value: 'food', label: 'Food' },
    ]
    const typeCols = [
      typeCol.accessor('name', { header: 'Text', size: 160, meta: { type: 'string' } }),
      typeCol.accessor('quantity', { header: 'Number', size: 90, meta: { type: 'number' } }),
      typeCol.accessor('price', { header: 'Currency', size: 100, meta: { type: 'currency', prefix: '$' } }),
      typeCol.accessor('date', { header: 'Date', size: 110, meta: { type: 'date' } }),
      typeCol.accessor('active', { header: 'Boolean', size: 80, meta: { type: 'boolean' } }),
      typeCol.accessor('status', { header: 'Select', size: 110, meta: { type: 'select', options: statusOptions } }),
      typeCol.accessor('tags', { header: 'MultiSelect', size: 180, meta: { type: 'multiSelect', options: tagOptions } }),
      typeCol.accessor('seller', { header: 'Person', size: 140, meta: { type: 'person' } }),
      typeCol.accessor('url', { header: 'Link', size: 160, meta: { type: 'url' } }),
    ]
    const typeData: TypeDemo[] = [
      { name: 'Wireless Headphones', quantity: 142, price: 2490, date: '2025-03-12', active: true, status: 'in_stock', tags: ['electronics', 'lifestyle'], seller: SELLERS[0], url: 'https://example.com/headphones' },
      { name: 'Office Chair', quantity: 38, price: 8900, date: '2025-03-14', active: false, status: 'low_stock', tags: ['lifestyle'], seller: SELLERS[1], url: 'https://example.com/chair' },
      { name: 'Green Tea 100 Bags', quantity: 520, price: 350, date: '2025-03-15', active: true, status: 'in_stock', tags: ['food', 'lifestyle', 'electronics'], seller: SELLERS[2], url: 'https://example.com/tea' },
    ]

    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">所有 9 種 column type 的自動渲染——指定 meta.type 即可，不需要自訂 cell renderer</p>
        <DataTable columns={typeCols} data={typeData} height="auto" />
      </div>
    )
  },
}

/* ── 三種尺寸 ── */
export const AllSizes: Story = {
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

/* ── 行高模式 — autoRowHeight prop(每 row 內容驅動高度) ── */
export const RowAutoHeight: Story = {
  name: 'Row 行高 — autoRowHeight',
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
            <Empty title="尚無商品" description="點擊上方「新增」開始建立" />
          }
        />
      </div>
    </div>
  ),
}

/* ── Container 高度模式 — height prop(table 容器約束) ── */
// Bordered showcase retired — anatomy.BorderedProp 已 canonical 涵蓋(prop table + 何時用 false 的 rationale + 對照),showcase 純重複
export const ContainerHeight: Story = {
  name: 'Container 高度 — height prop',
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
            <div className="bg-muted rounded-lg p-4">
              <p className="text-footnote text-fg-muted mb-3">3 筆資料</p>
              <DataTable columns={baseColumns} data={sampleData.slice(0, 3)} height="300px" />
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-footnote text-fg-muted mb-3">50 筆資料</p>
              <DataTable columns={baseColumns} data={manyRows} height="300px" />
            </div>
          </div>
        </div>
      </div>
    )
  },
}

/* ── Row Actions ── */
export const RowActions: Story = {
  name: 'Row Actions',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">Row Actions（常駐）</h3>
        <p className="text-caption text-fg-muted mb-3">actions 在獨立的右側固定欄位，常駐顯示。full-height 分隔線標示 frozen 邊界。</p>
        <DataTable
          columns={baseColumns}
          data={sampleData}
          height="auto"
          rowActions={() => (
            <>
              <Button variant="text" size="xs" iconOnly startIcon={Pencil} aria-label="編輯" />
              <Button variant="text" size="xs" iconOnly startIcon={Trash2} aria-label="刪除" />
            </>
          )}
        />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">3+ actions：MoreVertical 收納</h3>
        <p className="text-caption text-fg-muted mb-3">前 1-2 個高頻 action inline + MoreVertical dropdown</p>
        <DataTable
          columns={baseColumns}
          data={sampleData.slice(0, 3)}
          height="auto"
          rowActions={() => (
            <>
              <Button variant="text" size="xs" iconOnly startIcon={Pencil} aria-label="編輯" />
              <Button variant="text" size="xs" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
            </>
          )}
        />
      </div>
    </div>
  ),
}

/* ── Pinned Columns ── */
export const PinnedColumns: Story = {
  name: 'Pinned Columns',
  render: () => {
    const manyRows = React.useMemo(() => generateLargeData(50), [])
    return (
      <div className="flex flex-col gap-8">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">Left pinned + Row Actions（水平捲動）</h3>
          <p className="text-caption text-fg-muted mb-3">SKU 固定左側，actions 固定右側，中間水平捲動。</p>
          <div style={{ maxWidth: 700 }}>
            <DataTable
              columns={columnsWithPrice}
              data={sampleData}
              height="auto"
              pinnedLeftColumns={['sku']}
              rowActions={() => (
                <>
                  <Button variant="text" size="xs" iconOnly startIcon={Pencil} aria-label="編輯" />
                  <Button variant="text" size="xs" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
                </>
              )}
            />
          </div>
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">垂直捲動 + Pinned + Row Actions</h3>
          <p className="text-caption text-fg-muted mb-3">header 固定頂部，SKU 固定左側，actions 固定右側，50 筆資料垂直捲動。</p>
          <div style={{ maxWidth: 700 }}>
            <DataTable
              columns={columnsWithPrice}
              data={manyRows}
              height="300px"
              pinnedLeftColumns={['sku']}
              rowActions={() => (
                <>
                  <Button variant="text" size="xs" iconOnly startIcon={Pencil} aria-label="編輯" />
                  <Button variant="text" size="xs" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
                </>
              )}
            />
          </div>
        </div>
      </div>
    )
  },
}

/* ── Inline Edit（視覺模式）── */
export const InlineEdit: Story = {
  name: 'Inline Edit',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">Inline Edit 模式</h3>
        <p className="text-caption text-fg-muted mb-3">Cell 間有垂直分隔線，select 類欄位顯示 ChevronDown / Calendar 指示器。</p>
        <DataTable
          columns={columnsWithPrice}
          data={sampleData}
          height="auto"
          inlineEdit
          rowActions={() => (
            <>
              <Button variant="text" size="xs" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
            </>
          )}
        />
      </div>
    </div>
  ),
}

/* ── 虛擬捲動（大量資料）── */
export const VirtualScroll: Story = {
  name: '虛擬捲動',
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

/* ── L2 Selection — DataTable + BulkActionBar inline composition(canonical) ──
   保留 toolbar 功能(filter / sort / search 在選取期間仍可用)— 對齊 Linear / Notion /
   Apple Mail / iOS Files / ref 圖 additive 派

   排版 canonical(本 showcase):
   - Toolbar:左 search input / 右 ops 群(Gmail / Linear / Notion idiom)
   - 各 chrome 元件 self-pad px-loose;table mx-loose 對齊 chrome 內容左右邊界
   - bordered=true(height="100%" 為垂直滾動 trigger,per spec)
   - Alert variant="neutral"(資訊性 hint,非 info hue) */
// VisibilityRow:DnD-enabled row(GripVertical 為 drag handle / locked 顯示 Lock)。
function VisibilityRow({
  id, label, visible, locked, onToggle,
}: {
  id: string
  label: string
  visible: boolean
  locked: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: locked })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-2 w-full px-[var(--layout-space-loose)]',
        ROW_PADDING_BY_SIZE.md,
      )}
    >
      <ItemPrefix>
        {locked
          ? <Lock size={14} className="text-fg-muted" aria-hidden />
          : <ItemInlineActionButton
              icon={GripVertical}
              size="md"
              aria-label="拖曳重排"
              className="cursor-grab active:cursor-grabbing"
              {...attributes}
              {...listeners}
            />}
      </ItemPrefix>
      <ItemLabel className={locked ? 'text-fg-disabled' : undefined}>{label}</ItemLabel>
      {/* Eye toggle 走 ItemInlineActionButton(對齊 same-row consistency canonical:同 row 不混
          Inline Action + Button — 消除 box size 不一致 gap 斷裂)。size=md = 16+18 hover bg */}
      <ItemInlineActionButton
        icon={visible ? Eye : EyeOff}
        size="md"
        aria-label={visible ? '隱藏此欄' : '顯示此欄'}
        disabled={locked}
        onClick={onToggle}
        className={locked ? 'cursor-not-allowed opacity-30' : ''}
      />
    </div>
  )
}

export const WithBulkActions: Story = {
  name: '選取 + 批次操作',
  parameters: { layout: 'fullscreen' },
  render: () => {
    const [selection, setSelection] = React.useState<string[]>([])
    const [allSelected, setAllSelected] = React.useState(false)
    const [search, setSearch] = React.useState('')
    const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({})
    const [columnSearch, setColumnSearch] = React.useState('')
    const [columnOrder, setColumnOrder] = React.useState<string[]>(() =>
      baseColumns.map((c) => (c as any).accessorKey ?? (c as any).id)
    )
    const [sorting, setSorting] = React.useState<SortingState>([])
    const [filterTree, setFilterTree] = React.useState<FilterTree>(() => createEmptyFilterTree('flat'))
    const [filterPrefilledId, setFilterPrefilledId] = React.useState<string | undefined>(undefined)
    const [filterOpen, setFilterOpen] = React.useState(false)
    const [sortOpen, setSortOpen] = React.useState(false)
    const TOTAL = 5370
    const filteredData = React.useMemo(
      () => search ? sampleData.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())) : sampleData,
      [search]
    )
    const VISIBLE = filteredData.length
    const showHint = !allSelected
      ? selection.length === VISIBLE && VISIBLE > 0 && TOTAL > VISIBLE
      : true

    return (
      // 撐滿 parent(layout=fullscreen);
      // toolbar 自帶 py = toolbar→table 間距(無父 gap);table→底部 chrome group = loose(footer 呼吸 canonical)
      <div className="flex flex-col w-full h-screen bg-canvas">
        {/* Toolbar — 左 search / 右 ops(Gmail / Linear / Notion idiom)*/}
        <div className="flex items-center justify-between gap-2 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
          <div className="flex-1 max-w-sm">
            <Input
              size="sm"
              placeholder="搜尋商品 / SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              startIcon={Search}
            />
          </div>
          <div className="flex items-center gap-2">
            {/* L3 Filter:global panel(ClickUp / Airtable / Notion 派 — flat conditions MVP)
                pressed prop:套用條件後 trigger 維持 active 視覺(toggle pressed,Button canonical) */}
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="text" size="sm" iconOnly startIcon={Filter} aria-label="篩選" pressed={isFilterTreeActive(filterTree)} />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <DataTableFilterPanel
                  mode="flat"
                  columns={baseColumns}
                  value={filterTree}
                  onChange={setFilterTree}
                  prefilledColumnId={filterPrefilledId}
                  onPrefillConsumed={() => setFilterPrefilledId(undefined)}
                  onClose={() => setFilterOpen(false)}
                />
              </PopoverContent>
            </Popover>
            {/* L3 Sort:global panel(Notion-style 多欄條件)
                pressed prop:套用條件後 trigger 維持 active 視覺 */}
            <Popover open={sortOpen} onOpenChange={setSortOpen}>
              <PopoverTrigger asChild>
                <Button variant="text" size="sm" iconOnly startIcon={ArrowUpDown} aria-label="排序" pressed={sorting.length > 0} />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <DataTableSortManager
                  columns={baseColumns}
                  sorting={sorting}
                  onSortingChange={setSorting}
                  onReset={() => setSorting([])}
                  onClose={() => setSortOpen(false)}
                />
              </PopoverContent>
            </Popover>
            {/* L3 column visibility:Popover panel(對齊 Notion / Airtable column-settings panel)
                標題 / search input / column list with Checkbox / Show all
                drag-reorder 留 A.4(跟 column reorder 一起做)*/}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="text" size="sm" iconOnly startIcon={Eye} aria-label="欄位顯示" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                {/* B 派(Notion-style):視覺 primitive 自組 panel list row(非 MenuItem)
                    依據:MenuItem 是 menu specialization(px-3 menu-style + icon 色繼承),
                    panel list 需對齊 chrome `loose` + drag/lock icon utility-color(neutral-7)。
                    對齊 user 洞察「panel 場景繼承視覺 primitive 而非 MenuItem」。
                    Row click ≠ Eye click(對齊 Notion / ClickUp / Linear,row 不互動 = 不顯 hover bg)。
                    Drag 暫隱 — A.4 phase 接 DnD 才 show(避免騙人視覺)。 */}
                <PopoverHeader hideClose>
                  {/* hideClose + 自管 close X 進同一 flex 容器 → ButtonDivider 兩側 mx-1 對稱
                      對齊 button-group.tsx ButtonDivider canonical「自身左右各 4px 對稱距離」 */}
                  <div className="flex items-center gap-1 w-full min-w-0">
                    <PopoverTitle className="flex-1">欄位顯示</PopoverTitle>
                    {Object.values(columnVisibility).some(v => v === false) && (
                      <>
                        <Button
                          variant="text" size="sm" iconOnly startIcon={RotateCcw}
                          aria-label="恢復預設"
                          onClick={() => setColumnVisibility({})}
                        />
                        <ButtonDivider />
                      </>
                    )}
                    <PopoverClose asChild>
                      <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" />
                    </PopoverClose>
                  </div>
                </PopoverHeader>
                {/* Q2 對稱:控件 wrapper pt-tight 省 pb,list py-2 + item py-1.5 接管下方
                    (layoutSpace.spec.md 規則 3 補充:List 場景 inline → block 累加) */}
                <div className="px-[var(--layout-space-loose)] pt-[var(--layout-space-tight)]">
                  <Input
                    size="md"
                    placeholder="搜尋欄位…"
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                    startIcon={Search}
                  />
                </div>
                <ScrollArea className="max-h-72">
                  {/* DnD column reorder via @dnd-kit + columnOrder state to DataTable。
                      Drag handle 取代 lock 位置(locked → Lock,unlocked → drag handle)— 對齊 ref 圖。 */}
                  <div className="py-2 flex flex-col" style={{ '--item-prefix-slot': '16px' } as React.CSSProperties}>
                    <DndContext collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                      const { active, over } = e
                      if (!over || active.id === over.id) return
                      const oldIdx = columnOrder.indexOf(active.id as string)
                      const newIdx = columnOrder.indexOf(over.id as string)
                      if (oldIdx < 0 || newIdx < 0) return
                      // SKU(locked)鎖在第一位,不允許 reorder 動到
                      if (columnOrder[0] === 'sku' && (oldIdx === 0 || newIdx === 0)) return
                      const next = [...columnOrder]
                      const [m] = next.splice(oldIdx, 1)
                      next.splice(newIdx, 0, m)
                      setColumnOrder(next)
                    }}>
                      <SortableContext items={columnOrder.filter(id => id !== 'sku')} strategy={verticalListSortingStrategy}>
                        {columnOrder
                          .map((id) => {
                            const col = baseColumns.find(c => ((c as any).accessorKey ?? (c as any).id) === id)
                            const headerLabel = typeof (col as any)?.header === 'string' ? (col as any).header : id
                            return { id, headerLabel }
                          })
                          .filter(({ headerLabel }) =>
                            columnSearch ? headerLabel.toLowerCase().includes(columnSearch.toLowerCase()) : true
                          )
                          .map(({ id, headerLabel }) => {
                            const visible = columnVisibility[id] !== false
                            const locked = id === 'sku'
                            return (
                              <VisibilityRow
                                key={id}
                                id={id}
                                label={headerLabel}
                                visible={visible}
                                locked={locked}
                                onToggle={() => setColumnVisibility(prev => ({ ...prev, [id]: !visible }))}
                              />
                            )
                          })}
                      </SortableContext>
                    </DndContext>
                  </div>
                </ScrollArea>
                {/* 對齊 Linear / Airtable / Material X-Grid:bidirectional toggle —
                    任何欄位隱藏 → 「顯示全部」;全部可見 → 「全部隱藏」(locked 欄保留)。
                    Notion 派(disabled when all visible)語義較弱,Linear 派教育性更高。 */}
                <PopoverFooter className="justify-start">
                  {(() => {
                    const togglableIds = baseColumns
                      .map((c) => ((c as any).accessorKey ?? (c as any).id) as string)
                      .filter((id) => id !== 'sku')
                    const allVisible = togglableIds.every((id) => columnVisibility[id] !== false)
                    return (
                      <Button
                        variant="tertiary"
                        size="sm"
                        onClick={() => {
                          if (allVisible) {
                            const next: Record<string, boolean> = {}
                            togglableIds.forEach((id) => { next[id] = false })
                            setColumnVisibility(next)
                          } else {
                            setColumnVisibility({})
                          }
                        }}
                      >
                        {allVisible ? '全部隱藏' : '顯示全部'}
                      </Button>
                    )
                  })()}
                </PopoverFooter>
              </PopoverContent>
            </Popover>
            <Button variant="primary" size="sm" startIcon={Plus}>新增商品</Button>
            <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多" />
          </div>
        </div>

        {/* DataTable — bordered=true(height 約束 = 垂直滾動 trigger,per spec line 150)
            mx-loose:水平 padding(規則 1)
            mb-loose:fw → 容器底 / viewport 底 / 底部 chrome 都是 loose(規則 4)— 永遠保留底部呼吸,不貼邊 */}
        <div className="flex-1 min-h-0 mx-[var(--layout-space-loose)] mb-[var(--layout-space-loose)]">
          <DataTable
            columns={baseColumns}
            data={filteredData}
            height="100%"
            selectable
            selection={selection}
            onSelectionChange={setSelection}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            getRowId={(row) => row.sku}
            onColumnFilterTrigger={(columnId) => {
              setFilterPrefilledId(columnId)
              setFilterOpen(true)
            }}
            tableOptions={{
              state: { sorting, globalFilter: filterTree, columnOrder },
              onColumnOrderChange: (updater) => {
                setColumnOrder(typeof updater === 'function' ? updater(columnOrder) : updater)
              },
              onSortingChange: (updater) => {
                setSorting(typeof updater === 'function' ? updater(sorting) : updater)
              },
              onGlobalFilterChange: setFilterTree,
              globalFilterFn: (row, _columnId, t: FilterTree) => evaluateTree(t, row.original),
              getFilteredRowModel: getFilteredRowModel(),
            }}
          />
        </div>

        {/* 底部 chrome group:Alert hint(全選提示)+ BulkActionBar — wrapper mb-loose 已提供間距 */}
        {(showHint || selection.length > 0) && (
          <div className="flex flex-col">
            {showHint && (
              <Alert
                variant="neutral"
                placement="fixed"
                dismissible={false}
                title={
                  allSelected ? (
                    <>
                      已選取全部 {TOTAL} 個項目。{' '}
                      <button
                        type="button"
                        onClick={() => { setSelection([]); setAllSelected(false) }}
                        className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      >
                        清除選取項目
                      </button>
                    </>
                  ) : (
                    <>
                      已選取本頁全部 {selection.length} 個。{' '}
                      <button
                        type="button"
                        onClick={() => setAllSelected(true)}
                        className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      >
                        點此選取全部 {TOTAL} 個項目
                      </button>
                    </>
                  )
                }
              />
            )}
            {selection.length > 0 && (
              <BulkActionBar
                selection={selection}
                onClear={() => { setSelection([]); setAllSelected(false) }}
                actions={
                  <>
                    <Button variant="tertiary" size="sm" startIcon={Download}>下載</Button>
                    <Button variant="tertiary" size="sm" startIcon={Trash2} danger>移除</Button>
                  </>
                }
              />
            )}
          </div>
        )}
      </div>
    )
  },
}

/* ── L2 Selection — Shift-click + 鍵盤(Cmd+A / Esc)── */
export const SelectionKeyboardAndShift: Story = {
  name: '區間選取與鍵盤操作',
  render: () => {
    const [selection, setSelection] = React.useState<string[]>([])
    const data = generateLargeData(15)
    return (
      <div className="flex flex-col gap-2 max-w-4xl">
        <p className="text-caption text-fg-muted">
          試試:點第一 row checkbox → <kbd>Shift</kbd>+點第五 row → 1-5 全選 ·
          整 table 點任意 row 後按 <kbd>Cmd/Ctrl+A</kbd> 全選 · 按 <kbd>Esc</kbd> 清除 ·
          checkbox focus 時按 <kbd>Space</kbd> 帶 <kbd>Shift</kbd> 也能擴選。
        </p>
        <div className="text-caption font-mono text-fg-muted">selection: {JSON.stringify(selection)}</div>
        <DataTable
          columns={baseColumns}
          data={data}
          height="400px"
          selectable
          selection={selection}
          onSelectionChange={setSelection}
          getRowId={(row) => row.sku}
        />
      </div>
    )
  },
}

/* ── L2 Selection — Single mode(每次只選一個)── */
export const SelectionSingleMode: Story = {
  name: '單選模式',
  render: () => {
    const [selection, setSelection] = React.useState<string[]>([])
    return (
      <div className="flex flex-col gap-2 max-w-4xl">
        <p className="text-caption text-fg-muted">
          <code>selectable=&quot;single&quot;</code>:每次只選一個,點新 row 自動清舊 row。
          視覺用 <strong>Radio</strong>(對齊 Material DataGrid / Polaris IndexTable 共識),
          header checkbox 抑制(single 沒「全選」概念)。
        </p>
        <div className="text-caption font-mono text-fg-muted">selected: {selection[0] ?? '(none)'}</div>
        <DataTable
          columns={baseColumns}
          data={sampleData}
          height="auto"
          selectable="single"
          selection={selection}
          onSelectionChange={setSelection}
          getRowId={(row) => row.sku}
        />
      </div>
    )
  },
}

/* ── L2 Selection — disabled rows + filter 互動 ── */
export const SelectionDisabledRows: Story = {
  name: '不可選取的列',
  render: () => {
    const [selection, setSelection] = React.useState<string[]>([])
    return (
      <div className="flex flex-col gap-2 max-w-4xl">
        <p className="text-caption text-fg-muted">
          Out of stock 商品不可選 — 只 disable checkbox,row 內容正常 render(對齊 spec L2 五)。
        </p>
        <DataTable
          columns={baseColumns}
          data={sampleData}
          height="auto"
          selectable
          selection={selection}
          onSelectionChange={setSelection}
          getRowId={(row) => row.sku}
          isRowSelectable={(row) => row.stock !== 'Out of stock'}
        />
      </div>
    )
  },
}

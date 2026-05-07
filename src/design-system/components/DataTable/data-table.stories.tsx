// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// same-row-mixed-allow: file 含 toolbar Button iconOnly + row ItemInlineActionButton,但兩者在不同 row(toolbar 跟 panel row 分離)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
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
import { dragSourceStyle } from '@/design-system/lib/drag-visual'
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

// 2026-05-06 v14.3 DS canonical:column 寬度走 `meta.width` / `meta.minWidth`
// (避開 `size: 'sm'|'md'|'lg'` density 命名衝突)。內部 pre-process copy 到 TanStack root size。
const baseColumns = [
  col.accessor('sku', { header: 'SKU', meta: { type: 'string', width: 100, minWidth: 80 } }),
  col.accessor('name', { header: 'Product', meta: { type: 'string', width: 280, minWidth: 120 } }),
  col.accessor('category', { header: 'Category', meta: { type: 'select', width: 120 } }),
  col.accessor('stock', { header: 'Stock', meta: { type: 'select', width: 110 } }),
  col.accessor('seller', { header: 'Seller', meta: { type: 'person', width: 150 } }),
  col.accessor('updatedAt', { header: 'Updated', meta: { type: 'date', width: 120 } }),
]

const columnsWithPrice = [
  ...baseColumns,
  col.accessor('price', {
    header: 'Price',
    meta: { type: 'currency', prefix: '$', width: 120 },
  }),
]

const columnsWithNote = [
  col.accessor('sku', { header: 'SKU', meta: { type: 'string', width: 100 } }),
  col.accessor('name', { header: 'Product', meta: { type: 'string', width: 200 } }),
  col.accessor('note', {
    header: 'Note', meta: { type: 'string', wrap: true, width: 300 } }),
  col.accessor('category', { header: 'Category', meta: { type: 'select', width: 120 } }),
  col.accessor('seller', { header: 'Seller', meta: { type: 'person', width: 150 } }),
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
  name: '欄位型別',
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
      typeCol.accessor('name', { header: 'Text', meta: { type: 'string', width: 160 } }),
      typeCol.accessor('quantity', { header: 'Number', meta: { type: 'number', width: 90 } }),
      typeCol.accessor('price', { header: 'Currency', meta: { type: 'currency', prefix: '$', width: 100 } }),
      typeCol.accessor('date', { header: 'Date', meta: { type: 'date', width: 110 } }),
      typeCol.accessor('active', { header: 'Boolean', meta: { type: 'boolean', width: 80 } }),
      typeCol.accessor('status', { header: 'Select', meta: { type: 'select', options: statusOptions, width: 110 } }),
      typeCol.accessor('tags', { header: 'MultiSelect', meta: { type: 'multiSelect', options: tagOptions, width: 180 } }),
      typeCol.accessor('seller', { header: 'Person', meta: { type: 'person', width: 140 } }),
      typeCol.accessor('url', { header: 'Link', meta: { type: 'url', width: 160 } }),
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

/* ── Column resize(2026-05-06 v11):table 層級開關 + handle hover 變色 ── */
export const ColumnResize: Story = {
  name: '欄寬調整',
  render: () => {
    const [widths, setWidths] = React.useState<Record<string, number>>({})
    return (
      <div className="flex flex-col gap-3 max-w-5xl">
        <p className="text-caption text-fg-muted">
          enableColumnResize=true:所有 data column 可拖 header 右邊分隔線調整寬度。
          <br />
          - Hover handle:分隔線從 divider(淡灰)變 border-hover(深灰),cursor: col-resize
          <br />
          - 拖動中:column 即時跟動 cursor(<code>columnResizeMode: 'onChange'</code>),分隔線變 primary(藍)
          <br />
          - more 選單「自動調整寬度」:scan column 內容 max scrollWidth + buffer 自動 fit
          <br />
          - System columns(__select__ 等)永遠 fixed,不在 resize 集合
          <br />
          目前 widths:{JSON.stringify(widths)}
        </p>
        <DataTable
          columns={columnsWithPrice}
          data={sampleData}
          height="auto"
          enableColumnResize
          onColumnResize={(id, w) => setWidths(prev => ({ ...prev, [id]: w }))}
        />
      </div>
    )
  },
}

/* ── 欄拖曳重排 — enableColumnReorder + columnDef.meta.locked ──
   對齊 Notion / Linear / Airtable canonical:header 任一 reorderable cell 可拖,
   drop indicator 在 target column 邊緣。SKU 標 `meta.locked=true` 鎖定不可拖,亦不可
   接受 drop(Notion 「primary column」pattern)。System column(__select__)永遠鎖。
   Pinned column 仍可 reorder 但只在自己 region 內(left/center/right 不跨 region)。 */
export const ColumnReorder: Story = {
  name: '欄位拖曳重排',
  render: () => {
    const initialOrder = ['sku', 'name', 'category', 'price', 'stock', 'updatedAt']
    const [columnOrder, setColumnOrder] = React.useState<string[]>(initialOrder)
    const lockedCols = columnsWithPrice.map((c) => {
      const ak = (c as { accessorKey?: string }).accessorKey
      return ak === 'sku' ? { ...c, meta: { ...(c.meta ?? {}), locked: true } } : c
    }) as ColumnDef<Product>[]
    const handleColumnReorder = (sourceId: string, targetId: string, position: 'before' | 'after') => {
      setColumnOrder((prev) => {
        const next = prev.filter((id) => id !== sourceId)
        const targetIdx = next.indexOf(targetId)
        if (targetIdx === -1) return prev
        const insertAt = position === 'before' ? targetIdx : targetIdx + 1
        next.splice(insertAt, 0, sourceId)
        return next
      })
    }
    return (
      <div className="flex flex-col gap-3 max-w-5xl">
        <p className="text-caption text-fg-muted">
          enableColumnReorder=true:hover header → grab cursor;拖曳期間 DragOverlay portal 顯示 ghost,
          target column 邊緣顯 drop indicator(before/after 由 cursor 位置判定)。
          <br />
          - <strong>SKU 鎖定</strong>(<code>meta.locked=true</code>):無 grab cursor、被拖過不顯 drop
          indicator(Notion primary column pattern)
          <br />
          - System columns(__select__)永遠鎖
          <br />
          目前 order:{columnOrder.join(' → ')}
        </p>
        <DataTable
          columns={lockedCols}
          data={sampleData}
          height="auto"
          tableOptions={{ state: { columnOrder } }}
          enableColumnReorder
          onColumnReorder={handleColumnReorder}
        />
      </div>
    )
  },
}

/* ── 行高模式 — autoRowHeight prop(每 row 內容驅動高度) ── */
export const RowAutoHeightInlineEdit: Story = {
  name: '自動行高 × 內聯編輯(verify display↔edit position)',
  render: () => {
    const [list, setList] = React.useState<Product[]>(generateLargeData(4))
    const cols: ColumnDef<Product & { note: string }>[] = [
      // 2026-05-06 v14.3 DS canonical: column 寬度走 `meta.width`(避開 `size: 'sm'|'md'|'lg'`
      // density 命名衝突)。內部 pre-process copy 到 TanStack root size,resize feature 仍正常。
      { accessorKey: 'sku', header: 'SKU', meta: { type: 'string', width: 100 } },
      { accessorKey: 'name', header: 'Product', meta: { type: 'string', editable: true, width: 240 } },
      { accessorKey: 'category', header: 'Category', meta: { type: 'select', editable: true, width: 160, options: [
        { value: 'Electronics', label: 'Electronics' },
        { value: 'Furniture', label: 'Furniture' },
        { value: 'Food', label: 'Food' },
        { value: 'Lifestyle', label: 'Lifestyle' },
      ] } },
      { accessorKey: 'note', header: 'Note (wrap text)', meta: { type: 'string', editable: true, width: 360 } },
      { accessorKey: 'price', header: 'Price', meta: { type: 'currency', editable: true, width: 100 } },
    ]
    const dataWithNotes = list.map((r, i) => ({
      ...r,
      note: i % 2 === 0
        ? 'This product requires special packaging for international shipping. Please verify customs documentation before dispatch.'
        : 'Standard delivery.',
    }))
    return (
      <div className="max-w-5xl">
        <p className="text-caption text-fg-muted mb-2">
          autoRowHeight=true。Note 欄位 wrap text 撐高 row。其他單行 cell 在高 row 中應**頂對齊**。
          Click 任一 cell 進 edit:文字位置 display↔edit 不偏移(仍頂對齊),
          frame 填 cell,Field 自帶 state ring(focus-within → primary)。
        </p>
        <DataTable
          columns={cols} data={dataWithNotes} height="auto" autoRowHeight inlineEdit
          onCellCommit={(rowId, col, val) => {
            setList((prev) => prev.map((r) => r.sku === rowId ? { ...r, [col]: val as never } : r))
          }}
          getRowId={(r) => r.sku}
        />
      </div>
    )
  },
}

export const RowAutoHeight: Story = {
  name: '自動行高',
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
  name: '容器高度',
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
  name: '列操作',
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
  name: '欄位釘選',
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
/* ── Inline Edit canonical(2026-05-05 v3 user 統一):單一 story 覆蓋全 11 cell type ── */
const CATEGORY_OPTIONS = [
  { value: 'Electronics', label: 'Electronics' },
  { value: 'Furniture', label: 'Furniture' },
  { value: 'Food', label: 'Food' },
  { value: 'Lifestyle', label: 'Lifestyle' },
]
const STOCK_OPTIONS = [
  { value: 'In stock', label: 'In stock' },
  { value: 'Low stock', label: 'Low stock' },
  { value: 'Out of stock', label: 'Out of stock' },
]
// 11 cell type 全覆蓋 sample(對齊 cell-registry types):string / number / currency /
// date / time / select / multiSelect / person / multiPerson / boolean / url。
const TAG_OPTIONS = [
  { value: 'urgent', label: '緊急' },
  { value: 'review', label: '待審' },
  { value: 'archived', label: '已封存' },
]
// SAMPLE_PEOPLE 完整 PersonData(2026-05-06 v11):每筆都有 default field values(email/phone/
// department/location)+ status + statusMessage,讓 NameCard hoverCard 永遠完整顯示一致。
// 對齊 NameCard always-render canonical(NAMECARD_DEFAULT_FIELD_KEYS SSOT)。
// **2026-05-07 v15.7**:NameCard default fields 改 ['id', 'employeeNumber'] only。
// Email / Phone / Department / Location 透過 `fields` array opt-in。
const SAMPLE_PEOPLE: PersonData[] = [
  {
    name: 'Alice Chen', avatarUrl: 'https://i.pravatar.cc/48?u=alice', description: 'Design',
    id: 'AC001', employeeNumber: 'EMP-1001',
    status: 'online', statusMessage: '本週設計評審,週四前 standup 移到 4pm',
    fields: [
      { label: 'Email', value: 'alice.chen@example.com' },
      { label: 'Phone', value: '+886-2-2700-0001' },
      { label: 'Department', value: 'Design / APAC' },
      { label: 'Location', value: 'Taipei' },
    ],
  },
  {
    name: 'Bob Lin', avatarUrl: 'https://i.pravatar.cc/48?u=bob', description: 'Engineering',
    id: 'BL002', employeeNumber: 'EMP-1002',
    status: 'busy', statusMessage: 'Code review 中,訊息我會晚點回',
    fields: [
      { label: 'Email', value: 'bob.lin@example.com' },
      { label: 'Phone', value: '+886-2-2700-0002' },
      { label: 'Department', value: 'Engineering / Platform' },
      { label: 'Location', value: 'Taipei' },
    ],
  },
  {
    name: 'Charlie Wu', avatarUrl: 'https://i.pravatar.cc/48?u=charlie', description: 'Product',
    id: 'CWU003', employeeNumber: 'EMP-1003',
    status: 'online', statusMessage: '今日 OKR 規劃日,可線上協助',
    fields: [
      { label: 'Email', value: 'charlie.wu@example.com' },
      { label: 'Phone', value: '+852-2700-0003' },
      { label: 'Department', value: 'Product / Growth' },
      { label: 'Location', value: 'Hong Kong' },
    ],
  },
  {
    name: 'Diana Huang', avatarUrl: 'https://i.pravatar.cc/48?u=diana', description: 'Marketing',
    id: 'DH004', employeeNumber: 'EMP-1004',
    status: 'away', statusMessage: '客戶會議中,週四上午回辦公室',
    fields: [
      { label: 'Email', value: 'diana.huang@example.com' },
      { label: 'Phone', value: '+65-6700-0004' },
      { label: 'Department', value: 'Marketing / Brand' },
      { label: 'Location', value: 'Singapore' },
    ],
  },
]
interface EditableProduct {
  sku: string
  name: string
  qty: number
  category: string
  stock: string
  tags: string[]
  owner: PersonData | null
  reviewers: PersonData[]
  inStock: boolean
  url: string
  price: number
  releaseDate: string
  reminderTime: string
}
const editableSampleData: EditableProduct[] = sampleData.slice(0, 4).map((p, i) => ({
  sku: p.sku,
  name: p.name,
  qty: 100 + i * 12,
  category: p.category,
  stock: p.stock,
  tags: i === 0 ? ['urgent'] : i === 1 ? ['review', 'urgent'] : i === 2 ? [] : ['archived'],
  owner: SAMPLE_PEOPLE[i],
  reviewers: i % 2 === 0 ? [SAMPLE_PEOPLE[(i + 1) % 4], SAMPLE_PEOPLE[(i + 2) % 4]] : [SAMPLE_PEOPLE[(i + 3) % 4]],
  inStock: p.stock === 'In stock',
  url: 'https://shop.example.com/' + p.sku.toLowerCase(),
  price: p.price ?? 0,
  releaseDate: `2025-0${(i % 9) + 1}-15`,
  reminderTime: `0${9 + i}:30`,
}))

export const InlineEdit: Story = {
  name: '就地編輯',
  render: () => {
    const [data, setData] = React.useState(editableSampleData)
    const editCol = createColumnHelper<EditableProduct>()
    const editableColumns = React.useMemo(
      () => [
        editCol.accessor('sku', { header: 'SKU', meta: { type: 'string', width: 100 } }),  // 唯讀
        editCol.accessor('name', { header: 'Product (string)', meta: { type: 'string', editable: true, width: 200 } }),
        editCol.accessor('qty', { header: 'Qty (number)', meta: { type: 'number', editable: true, width: 110 } }),
        editCol.accessor('category', { header: 'Category (select)', meta: { type: 'select', options: CATEGORY_OPTIONS, editable: true, width: 150 } }),
        editCol.accessor('stock', { header: 'Stock (select)', meta: { type: 'select', options: STOCK_OPTIONS, editable: true, width: 140 } }),
        editCol.accessor('tags', { header: 'Tags (multiSelect)', meta: { type: 'multiSelect', options: TAG_OPTIONS, editable: true, width: 180 } }),
        editCol.accessor('owner', { header: 'Owner (person)', meta: { type: 'person', people: SAMPLE_PEOPLE, editable: true, width: 160 } }),
        editCol.accessor('reviewers', { header: 'Reviewers (multiPerson)', meta: { type: 'multiPerson', people: SAMPLE_PEOPLE, editable: true, width: 180 } }),
        editCol.accessor('inStock', { header: 'In (boolean)', meta: { type: 'boolean', editable: true, width: 90 } }),
        editCol.accessor('url', { header: 'URL', meta: { type: 'url', editable: true, width: 180 } }),
        editCol.accessor('price', { header: 'Price (currency)', meta: { type: 'currency', prefix: '$', editable: true, width: 130 } }),
        editCol.accessor('releaseDate', { header: 'Release (date)', meta: { type: 'date', editable: true, width: 140 } }),
        editCol.accessor('reminderTime', { header: 'Reminder (time)', meta: { type: 'time', editable: true, width: 130 } }),
      ],
      []
    )
    const handleCommit = (rowId: string, colId: string, value: unknown) => {
      setData((prev) => prev.map((row) => row.sku === rowId ? { ...row, [colId]: value } : row))
    }
    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">
          11 cell type 全覆蓋:string / number / currency / date / time / select / multiSelect / person / multiPerson / boolean / url。
          SKU 唯讀;boolean=點 Checkbox 即時 toggle;url=hover cell 顯示 Pencil → click;其他 click cell 進 edit → Enter/blur commit / Esc cancel。
        </p>
        <DataTable
          columns={editableColumns}
          data={data}
          height="auto"
          inlineEdit
          tableOptions={{ getRowId: (row) => row.sku }}
          getRowId={(row) => row.sku}
          onCellCommit={handleCommit}
        />
      </div>
    )
  },
}

/* ── Nested rows (tree-table) ── */
interface TaskRow {
  id: string
  task: string
  owner: string
  status: string
  children?: TaskRow[]
}
const NESTED_DATA: TaskRow[] = [
  {
    id: 'task-1',
    task: 'Q1 行銷活動',
    owner: 'Alice Wang',
    status: 'In progress',
    children: [
      {
        id: 'task-1-1',
        task: '社群素材設計',
        owner: 'Bob Chen',
        status: 'Done',
        children: [
          { id: 'task-1-1-1', task: 'Instagram post 設計', owner: 'Bob Chen', status: 'Done' },
          { id: 'task-1-1-2', task: 'Facebook cover 設計', owner: 'Bob Chen', status: 'Done' },
        ],
      },
      { id: 'task-1-2', task: 'KOL 合作協調', owner: 'Carol Liu', status: 'In progress' },
      { id: 'task-1-3', task: '預算審核', owner: 'Alice Wang', status: 'Blocked' },
    ],
  },
  {
    id: 'task-2',
    task: 'Q2 產品上架',
    owner: 'David Wu',
    status: 'Not started',
    children: [
      { id: 'task-2-1', task: '產品文案撰寫', owner: 'Carol Liu', status: 'Not started' },
      { id: 'task-2-2', task: 'SKU 設定', owner: 'David Wu', status: 'Not started' },
    ],
  },
]

export const NestedRows: Story = {
  name: '巢狀 row(tree-table)',
  render: () => {
    const [expanded, setExpanded] = React.useState<Record<string, boolean>>({ 'task-1': true, 'task-1-1': true })
    const STATUS_OPTIONS = [
      { value: 'Not started', label: 'Not started' },
      { value: 'In progress', label: 'In progress' },
      { value: 'Blocked', label: 'Blocked' },
      { value: 'Done', label: 'Done' },
    ]
    const taskCol = createColumnHelper<TaskRow>()
    const taskColumns = React.useMemo(
      () => [
        taskCol.accessor('task', { header: '任務', meta: { type: 'string', width: 360 } }),
        taskCol.accessor('owner', { header: '負責人', meta: { type: 'string', width: 160 } }),
        taskCol.accessor('status', { header: '狀態', meta: { type: 'select', options: STATUS_OPTIONS, width: 140 } }),
      ],
      []
    )
    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">
          forward TanStack <code>getSubRows</code> + 共用 token <code>--tree-indent-{'{sm,md,lg}'}</code>(跨 TreeView 設計語言)。Click chevron 展/收;chevron click stopPropagation 不 fire row select。
        </p>
        <DataTable
          columns={taskColumns}
          data={NESTED_DATA}
          height="auto"
          getRowId={(row) => row.id}
          selectable
          tableOptions={{
            getSubRows: (row: TaskRow) => row.children,
            getRowCanExpand: (row) => Boolean(row.original.children?.length),
            state: { expanded },
            onExpandedChange: setExpanded as any,
          }}
        />
      </div>
    )
  },
}

/* ── 巢狀 row × 拖曳重排(tree-table drag)──
   Tree drag canonical(2026-05-06 v14.7,對齊 spec.md「Cross-parent drop 禁止」)
   - **Top-level rows**:有 drag handle(absolute pinned to row left edge),可拖重排
   - **Sub-rows**(`row.depth > 0`):**無 handle**,不可拖(設計保守對齊 Notion)
   - **Cross-parent drop**:過濾,顯 invalid signal(handle cursor `not-allowed`)
   - **Drop indicator**:水平 2px primary line(top/bottom)— SSOT 對齊 TreeView */
export const NestedRowsWithDrag: Story = {
  name: '巢狀 row × 拖曳重排',
  render: () => {
    const [expanded, setExpanded] = React.useState<Record<string, boolean>>({ 'task-1': true })
    const [list, setList] = React.useState<TaskRow[]>(NESTED_DATA)
    const STATUS_OPTIONS = [
      { value: 'Not started', label: 'Not started' },
      { value: 'In progress', label: 'In progress' },
      { value: 'Blocked', label: 'Blocked' },
      { value: 'Done', label: 'Done' },
    ]
    const taskCol = createColumnHelper<TaskRow>()
    const taskColumns = React.useMemo(
      () => [
        taskCol.accessor('task', { header: '任務', meta: { type: 'string', width: 360 } }),
        taskCol.accessor('owner', { header: '負責人', meta: { type: 'string', width: 160 } }),
        taskCol.accessor('status', { header: '狀態', meta: { type: 'select', options: STATUS_OPTIONS, width: 140 } }),
      ],
      []
    )
    const handleReorder = (sourceId: string, targetId: string, position: 'before' | 'after') => {
      setList((prev) => {
        // top-level reorder only(sub-rows 不可拖)
        const sourceIdx = prev.findIndex((r) => r.id === sourceId)
        const targetIdx = prev.findIndex((r) => r.id === targetId)
        if (sourceIdx === -1 || targetIdx === -1) return prev
        const next = [...prev]
        const [moved] = next.splice(sourceIdx, 1)
        const adjustedTarget = next.findIndex((r) => r.id === targetId)
        const insertAt = position === 'before' ? adjustedTarget : adjustedTarget + 1
        next.splice(insertAt, 0, moved)
        return next
      })
    }
    return (
      <div className="flex flex-col gap-3 max-w-3xl">
        <p className="text-caption text-fg-muted">
          Tree-table drag canonical:**top-level rows 可拖**(handle 浮在 row 左緣),
          **sub-rows 無 handle 不可拖**(對齊 Notion 保守)。Cross-parent drop 過濾,
          顯 invalid signal。Drop indicator 水平 2px primary line — SSOT 對齊 TreeView。
        </p>
        <DataTable
          columns={taskColumns}
          data={list}
          height="auto"
          getRowId={(row) => row.id}
          enableRowDrag
          onRowReorder={handleReorder}
          tableOptions={{
            getSubRows: (row: TaskRow) => row.children,
            getRowCanExpand: (row) => Boolean(row.original.children?.length),
            state: { expanded },
            onExpandedChange: setExpanded as any,
          }}
        />
      </div>
    )
  },
}

/* ── 虛擬捲動（大量資料）── */
export const VirtualScroll: Story = {
  name: '大量資料',
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
  // 對齊 lib/drag-visual.ts SSOT(--opacity-disabled token)
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...dragSourceStyle(isDragging),
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
    // **NEW fix(2026-05-04)**:showHint 必含 selection.length > 0 前提,否則「清除選取」後 allSelected
    // 還是 true 邏輯走「: true」branch → Alert 仍 render「已選取全部 N 個」 → 怪 state
    const showHint = selection.length > 0 && (
      !allSelected
        ? selection.length === VISIBLE && VISIBLE > 0 && TOTAL > VISIBLE
        : true
    )

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

        {/* 底部 chrome group(撤回前一版 absolute overlay,2026-05-04 user 抓 BulkActionBar 沒底色 + 蓋表底列 regression):
            回 flex flow 自然推 table。Q7 mount-time growth 真因 = virtualizer estimateRowHeight ≠ token,已在 DataTable 內修(estimate size-aware) */}
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
                    <Button variant="tertiary" size="md" startIcon={Download}>下載</Button>
                    <Button variant="tertiary" size="md" startIcon={Trash2} danger>移除</Button>
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
  name: '範圍選取與鍵盤',
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

/* ────────────────────────────────────────────────────────────────────────────
   進階篩選(Filter Panel)— 2026-05-04 從 data-table-filter-panel.stories.tsx
   inline 過來,sidebar 收斂於 DataTable/展示 同一層(Q1 canonical)
   ──────────────────────────────────────────────────────────────────────────── */

const FILTER_COLUMNS = [
  col.accessor('sku',      { header: 'SKU',      meta: { type: 'string', filterable: true } }),
  col.accessor('name',     { header: '名稱',     meta: { type: 'string', filterable: true } }),
  col.accessor('category', { header: '類別',     meta: {
    type: 'select', filterable: true,
    options: [
      { value: 'Electronics', label: 'Electronics' },
      { value: 'Furniture', label: 'Furniture' },
      { value: 'Food', label: 'Food' },
      { value: 'Lifestyle', label: 'Lifestyle' },
    ],
  }}),
  col.accessor('stock',     { header: '庫存',     meta: { type: 'select', filterable: true,
    options: [
      { value: 'In stock', label: 'In stock' },
      { value: 'Low stock', label: 'Low stock' },
      { value: 'Out of stock', label: 'Out of stock' },
    ],
  }}),
  // 2026-05-07 v15.3:加 seller(person column)demo,讓 user 在 FilterPanel demo 中
  // 看見 PeoplePicker filter UI 真實渲染(否則 picker render 但 people pool=undefined → 選項空)。
  col.accessor('seller',    { header: '負責人',   meta: { type: 'person', filterable: true, people: SELLERS } }),
  col.accessor('updatedAt', { header: '更新時間', meta: { type: 'date', filterable: true, includeTime: true } }),
] as const

/* ── 進階篩選 — 空狀態 ── */
export const FilterPanelEmpty: Story = {
  name: '進階篩選 — 空狀態',
  render: () => {
    const [value, setValue] = React.useState<FilterTree>(() => createEmptyFilterTree('flat'))
    return (
      <div className="w-full max-w-[680px]">
        <DataTableFilterPanel
          mode="flat"
          columns={[...FILTER_COLUMNS]}
          value={value}
          onChange={setValue}

        />
      </div>
    )
  },
}

/* ── 進階篩選 — 已填條件 ── */
export const FilterPanelWithConditions: Story = {
  name: '進階篩選 — 已填條件',
  render: () => {
    const [value, setValue] = React.useState<FilterTree>(() => ({
      mode: 'flat', conjunction: 'and',
      children: [
        { kind: 'cond', id: 'c1', field: 'name',     op: 'contains', value: 'phone' },
        { kind: 'cond', id: 'c2', field: 'category', op: 'is',       value: ['Electronics'] },
        { kind: 'cond', id: 'c3', field: 'stock',    op: 'is',       value: ['In stock'] },
      ],
    }))
    return (
      <div className="w-full max-w-[680px]">
        <DataTableFilterPanel
          mode="flat"
          columns={[...FILTER_COLUMNS]}
          value={value}
          onChange={setValue}

        />
      </div>
    )
  },
}

/* ── 進階篩選 — 巢狀群組 ── */
export const FilterPanelNested: Story = {
  name: '進階篩選 — 巢狀群組',
  render: () => {
    const [value, setValue] = React.useState<FilterTree>(() => ({
      mode: 'nested', conjunction: 'or',
      children: [
        {
          kind: 'group', id: 'g1', conjunction: 'and',
          children: [
            { kind: 'cond', id: 'c1', field: 'category', op: 'is', value: ['Electronics'] },
            { kind: 'cond', id: 'c2', field: 'stock',    op: 'is', value: ['In stock'] },
          ],
        },
        {
          kind: 'group', id: 'g2', conjunction: 'and',
          children: [
            { kind: 'cond', id: 'c3', field: 'category', op: 'is', value: ['Furniture'] },
            { kind: 'cond', id: 'c4', field: 'stock',    op: 'is', value: ['Low stock'] },
          ],
        },
      ],
    }))
    return (
      <div className="w-full max-w-[680px]">
        <DataTableFilterPanel
          mode="nested"
          columns={[...FILTER_COLUMNS]}
          value={value}
          onChange={setValue}

        />
      </div>
    )
  },
}

/* ── 進階篩選 — 相對時間群組 ── */
export const FilterPanelRelativeDate: Story = {
  name: '進階篩選 — 相對時間群組',
  render: () => {
    const [value, setValue] = React.useState<FilterTree>(() => ({
      mode: 'flat', conjunction: 'and',
      children: [
        { kind: 'cond', id: 'c1', field: 'updatedAt', op: 'is_relative', value: 'past_7_days' },
      ],
    }))
    return (
      <div className="w-full max-w-[680px]">
        <p className="text-caption text-fg-muted mb-3">時間下拉分 過去 / 目前 / 未來 三組（Linear/Notion 共識）。</p>
        <DataTableFilterPanel
          mode="flat"
          columns={[...FILTER_COLUMNS]}
          value={value}
          onChange={setValue}

        />
      </div>
    )
  },
}

/* ── 進階篩選 — 已改動(refresh icon)── */
export const FilterPanelModified: Story = {
  name: '進階篩選 — 已改動',
  render: () => {
    const initial: FilterTree = {
      mode: 'flat', conjunction: 'and',
      children: [{ kind: 'cond', id: 'c1', field: 'category', op: 'is', value: ['Electronics'] }],
    }
    const modified: FilterTree = {
      mode: 'flat', conjunction: 'and',
      children: [{ kind: 'cond', id: 'c1', field: 'category', op: 'is', value: ['Furniture'] }],
    }
    const [value, setValue] = React.useState<FilterTree>(modified)
    return (
      <div className="w-full max-w-[680px]">
        <p className="text-caption text-fg-muted mb-3">值偏離 default 時 header 出現 ↻ — 點擊 reset 回 default。</p>
        <DataTableFilterPanel
          mode="flat"
          columns={[...FILTER_COLUMNS]}
          value={value}
          defaultValue={initial}
          onChange={setValue}

        />
      </div>
    )
  },
}

/* ── 進階篩選 — 長 tag 溢出測試(A5 reproduce)── */
export const FilterPanelLongTagOverflow: Story = {
  name: '進階篩選 — 長 tag 溢出',
  render: () => {
    // 故意用 select_multi op + 多個長 label values,測試 Combobox tag overflow + +N indicator
    const longLabelColumns = [
      col.accessor('category', {
        header: '類別',
        meta: { type: 'select', filterable: true, options: [
          { value: 'Heavy Industrial Manufacturing Equipment', label: 'Heavy Industrial Manufacturing Equipment' },
          { value: 'Premium Consumer Electronics & Accessories', label: 'Premium Consumer Electronics & Accessories' },
          { value: 'Sustainable Organic Food & Beverage Products', label: 'Sustainable Organic Food & Beverage Products' },
          { value: 'Lifestyle Home & Garden Decoration', label: 'Lifestyle Home & Garden Decoration' },
        ] },
      }),
    ]
    const [value, setValue] = React.useState<FilterTree>(() => ({
      mode: 'flat', conjunction: 'and',
      children: [
        { kind: 'cond', id: 'c1', field: 'category', op: 'is', value: [
          'Heavy Industrial Manufacturing Equipment',
          'Premium Consumer Electronics & Accessories',
          'Sustainable Organic Food & Beverage Products',
        ]},
      ],
    }))
    return (
      <div className="w-full max-w-[680px]">
        <p className="text-caption text-fg-muted mb-3">A5 reproduce — 多個超長 label values 是否觸發 Combobox `+N` overflow indicator?</p>
        <DataTableFilterPanel
          mode="flat"
          columns={[...longLabelColumns]}
          value={value}
          onChange={setValue}
        />
      </div>
    )
  },
}

/* ── 列拖曳重排(Jira-style + 3-panel pinned columns)──────────────────────
   enableRowDrag + onRowReorder 整合範例(v3 Jira canonical):
   - handle absolute 浮在 row 左 border(Button tertiary iconOnly xs = elevated chip)
   - 不佔 column 空間 — table 看起來乾淨,沒有預留拖曳欄位
   - hover row → handle 浮現(opacity 0 → 100)
   - 拖曳 row → @dnd-kit/sortable 重排;放下 → onRowReorder(sourceId, targetId, 'before' | 'after')
   - consumer 自管 data array mutation(同 Notion / Airtable / Linear pattern)
   - sort 啟用時 drag handle 自動 disabled + Tooltip 解釋
   - pinned-left + pinned-right 同時存在 → mirror regions 跟動 transform(per-region useSortable
     共享同 SortableContext state) */
export const RowDragInteractive: Story = {
  name: '列拖曳重排（含釘選欄）',
  render: () => {
    const [list, setList] = React.useState<Product[]>(sampleData)
    const handleReorder = (sourceId: string, targetId: string, position: 'before' | 'after') => {
      setList((prev) => {
        const sourceIdx = prev.findIndex((r) => r.sku === sourceId)
        const targetIdx = prev.findIndex((r) => r.sku === targetId)
        if (sourceIdx === -1 || targetIdx === -1) return prev
        const next = [...prev]
        const [moved] = next.splice(sourceIdx, 1)
        // splice 後 target 可能位移,重算
        const adjustedTarget = next.findIndex((r) => r.sku === targetId)
        const insertAt = position === 'before' ? adjustedTarget : adjustedTarget + 1
        next.splice(insertAt, 0, moved)
        return next
      })
    }
    return (
      <div className="flex flex-col gap-3 max-w-3xl">
        <p className="text-caption text-fg-muted">
          handle 浮在 row 左緣（不佔 column 空間，Jira canonical）。pinned-left（SKU）+ pinned-right（Updated）+
          center 中段欄。拖曳任一列時，三個 region 的 row 會同步跟動 transform（per-region
          <code>useSortable</code> 共享同 SortableContext state）。
        </p>
        <DataTable
          columns={columnsWithPrice}
          data={list}
          height="auto"
          getRowId={(row) => row.sku}
          pinnedLeftColumns={['sku']}
          pinnedRightColumns={['updatedAt']}
          enableRowDrag
          onRowReorder={handleReorder}
        />
      </div>
    )
  },
}

/* ── 列拖曳 × 虛擬捲動（200 列）────────────────────────────────────────────
   v3 fix(2026-05-05)— scroll bug 修法:
   1. enableRowDrag 時 overscan 自動拉到 ≥ 10(避免 row unmount 時 useSortable subscription 跟著
      消失導致 dnd-kit stale lookup → 拖到該 id 視覺錯位)
   2. drag 進行中(activeDragId != null)整個略過 measureElement(任一 row 重新量測會跟 dnd-kit
      transform 競爭,長 list 累積錯位)
   3. DndContext modifier 鎖 Y 軸(restrictToVerticalAxis inline 實作)— row drag 是垂直語義,
      X 抖動會觸發水平 transform → 進而 measureElement loop
   - 200 列 + 固定高度 → virtualizer 啟用
   - 拖曳長距離 + 持續往下捲 → 視覺位置仍對齊,放下後 onRowReorder 收到正確 sourceId / targetId */
export const RowDragWithVirtualization: Story = {
  name: '列拖曳 × 虛擬捲動',
  render: () => {
    const [list, setList] = React.useState<Product[]>(() => generateLargeData(200))
    const handleReorder = (sourceId: string, targetId: string, position: 'before' | 'after') => {
      setList((prev) => {
        const sourceIdx = prev.findIndex((r) => r.sku === sourceId)
        const targetIdx = prev.findIndex((r) => r.sku === targetId)
        if (sourceIdx === -1 || targetIdx === -1) return prev
        const next = [...prev]
        const [moved] = next.splice(sourceIdx, 1)
        const adjustedTarget = next.findIndex((r) => r.sku === targetId)
        const insertAt = position === 'before' ? adjustedTarget : adjustedTarget + 1
        next.splice(insertAt, 0, moved)
        return next
      })
    }
    return (
      <div className="flex flex-col gap-3 max-w-3xl">
        <p className="text-caption text-fg-muted">
          200 列 + 虛擬捲動。v3 修正:enableRowDrag 自動拉高 overscan ≥ 10、drag 期間 freeze
          measureElement、modifier 鎖 Y 軸 — 拖曳 + 持續往下捲不再錯位。
        </p>
        <DataTable
          columns={baseColumns}
          data={list}
          height="500px"
          getRowId={(row) => row.sku}
          enableRowDrag
          onRowReorder={handleReorder}
        />
      </div>
    )
  },
}

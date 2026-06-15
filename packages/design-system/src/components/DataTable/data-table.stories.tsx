// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// same-row-mixed-allow: file 含 toolbar Button iconOnly + row ItemInlineActionButton,但兩者在不同 row(toolbar 跟 panel row 分離)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { Pencil, Trash2, MoreVertical, Search, Filter, Eye, Download, Plus, ArrowUpDown } from 'lucide-react'
import { DataTable } from './data-table'
import { DataTableSortManager } from './data-table-sort-manager'
import { DataTableColumnVisibilityPanel } from './data-table-column-visibility-panel'
import { DataTableFilterPanel, evaluateTree, createEmptyFilterTree, isFilterTreeActive, type FilterTree } from './data-table-filter-panel'
import { getFilteredRowModel, type SortingState } from '@tanstack/react-table'
import { Button } from '@/design-system/components/Button/button'
import { Empty } from '@/design-system/components/Empty/empty'
import { Input } from '@/design-system/components/Input/input'
import { BulkActionBar } from '@/design-system/components/BulkActionBar/bulk-action-bar'
import { Alert } from '@/design-system/components/Alert/alert'
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system/components/Popover/popover'
// Issue 3 cleanup(2026-05-10):ScrollArea / ButtonDivider / ItemPrefix / ItemLabel /
// ItemInlineActionButton / ROW_PADDING_BY_SIZE / cn / DnD / dragSourceStyle imports retired —
// 全 column visibility row state machine 移到 <DataTableColumnVisibilityPanel> primitive。
import './column-types' // ColumnMeta declaration merging

// ── Sample Data ──────────────────────────────────────────────────────────────

// ── Person sample data canonical ──
// 對齊 ProfileCard.stories「Default」預設呈現:name + subtitle + status + statusMessage + fields
// avatar.spec.md DS-wide:所有 person avatar hover 必出現 ProfileCard,展示資訊一致(不可精簡)
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

// Retired 2026-05-16 audit Dim 24:`ColumnTypes` 跟 anatomy.stories.tsx:167 重複(同 9-type 自動渲染 + col helper demo)。
// Anatomy 是 type-system structural canonical home(用 Product col helper 對齊其他 anatomy 範例);
// 本 showcase 版用 custom `TypeDemo` interface,不對齊 anatomy 通用 type → noise。Retire showcase 版,anatomy 保留。

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
    const [pinnedWidths, setPinnedWidths] = React.useState<Record<string, number>>({})
    return (
      <div className="flex flex-col gap-8 max-w-5xl">
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">基本 — 全 data column 可拖</h3>
          <p className="text-caption text-fg-muted mb-3">
            拖 header 右側分隔線可調整欄寬。滑到分隔線上會變色提示,拖動時會跟著游標即時調整。
            勾選欄等系統欄位寬度固定,不可調整。
            <br />目前各欄寬度:{JSON.stringify(widths)}
          </p>
          <DataTable
            columns={columnsWithPrice}
            data={sampleData}
            height="auto"
            enableColumnResize
            onColumnResize={(id, w) => setWidths(prev => ({ ...prev, [id]: w }))}
          />
        </div>
        <div>
          <h3 className="text-body font-bold text-foreground mb-2">欄位釘選與欄寬調整並存</h3>
          <p className="text-caption text-fg-muted mb-3">
            把 SKU 跟產品名稱固定在左側,依然可以拖動分隔線調整這兩欄的寬度。
            <br />目前各欄寬度:{JSON.stringify(pinnedWidths)}
          </p>
          <DataTable
            columns={columnsWithPrice}
            data={sampleData}
            height="auto"
            pinnedLeftColumns={['sku', 'name']}
            enableColumnResize
            onColumnResize={(id, w) => setPinnedWidths(prev => ({ ...prev, [id]: w }))}
          />
        </div>
      </div>
    )
  },
}

/* ── 欄拖曳重排 — enableColumnReorder + columnDef.meta.locked ──
   對齊 Notion / Linear / Airtable 設計準則:header 任一 reorderable cell 可拖,
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
  name: '自動行高 × 就地編輯（顯示與編輯位置驗證）',
  render: () => {
    // 2026-05-14 I7 fix(per codex verdict):note 初始化進 state 一次,commit 寫同一 state。
    // 原 `dataWithNotes = list.map(...)` 每 render derive 覆蓋 commit value → user 看似不能編。
    const [list, setList] = React.useState<(Product & { note: string })[]>(() =>
      generateLargeData(4).map((r, i) => ({
        ...r,
        note: i % 2 === 0
          ? 'This product requires special packaging for international shipping. Please verify customs documentation before dispatch.'
          : 'Standard delivery.',
      }))
    )
    const cols: ColumnDef<Product & { note: string }>[] = [
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
    return (
      <div className="max-w-5xl">
        <p className="text-caption text-fg-muted mb-2">
          autoRowHeight=true。Note 欄位 wrap text 撐高 row。其他單行 cell 在高 row 中應**頂對齊**。
          Click 任一 cell 進 edit:文字位置 display↔edit 不偏移(仍頂對齊),
          frame 填 cell,Field 自帶 state ring(focus-within → primary)。
        </p>
        <DataTable
          columns={cols} data={list} height="auto" autoRowHeight inlineEdit
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
// 「預設空狀態」pane = 「自訂空狀態」的對照基線;Empty primitive 消費教學 canonical → anatomy.EmptyState,此處不重複教學
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
// department/location)+ status + statusMessage,讓 ProfileCard hoverCard 永遠完整顯示一致。
// 對齊 ProfileCard always-render canonical(NAMECARD_DEFAULT_FIELD_KEYS SSOT)。
// **2026-05-07 v15.7**:ProfileCard default fields 改 ['id', 'employeeNumber'] only。
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
          所有資料型別都能就地編輯:文字、數字、金額、日期、時間、單/多選、人員、人員列表、開關、連結。
          SKU 是唯讀的;開關欄位直接點即可切換;連結欄位 hover 才顯示鉛筆改值,直接點開連結;
          其他點一下進編輯,Enter 或失焦存檔,Esc 取消。
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

/**
 * Slice D spreadsheet semantics + overlay 整合 demo(2026-05-10 Issue 7 移過來)。
 *
 * 啟 4 條 spreadsheet flag:
 *   1. `inlineEdit` — base inline edit
 *   2. `experimentalSpreadsheetOverlay` — hover/selected/range overlay layer(Contract 8 「one
 *      geometry owner, two paint owners」)
 *   3. `spreadsheetMode` — Excel-like cell selection: click 1=select / click 2=edit /
 *      Shift+click=range / ArrowKeys=nav
 *   4. `experimentalActiveEditorController` — portal Field active editor(Slice D Step 5 D.3,
 *      cell 永遠 mode="display" SSOT preserved + portal host renders mode="edit")
 *
 * 驗證點:
 *   - hover editable cell → 1px overlay 邊框 var(--border-hover)
 *   - sku(readonly)/ inStock(boolean)/ url(openAction)→ 不出現 hover overlay(Contract 15)
 *   - click 1 → cell selected(2px primary border outline)
 *   - click 2 / Enter / F2 → enter edit(portal Field, cell mode 不變)
 *   - Shift+click → range(focus = 2px primary outline + 內 cells `--primary-subtle` bg)
 *   - cell border-box 對齊(0.5px sub-pixel snap;dtCellGrid 4-edge inset divider 共軌)
 *   - Issue 6 viewport clip:H scroll cell out → overlay 被 panel ClipMask 裁切不溢出
 */
export const InlineEditWithSpreadsheetOverlay: Story = {
  name: '就地編輯 + 試算表浮層',
  render: () => {
    const [data, setData] = React.useState(editableSampleData)
    const editCol = createColumnHelper<EditableProduct>()
    const editableColumns = React.useMemo(
      () => [
        editCol.accessor('sku', { header: 'SKU', meta: { type: 'string', width: 100 } }),
        editCol.accessor('name', { header: 'Product', meta: { type: 'string', editable: true, width: 200 } }),
        editCol.accessor('qty', { header: 'Qty', meta: { type: 'number', editable: true, width: 110 } }),
        editCol.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, editable: true, width: 150 } }),
        editCol.accessor('inStock', { header: 'In', meta: { type: 'boolean', editable: true, width: 90 } }),
        editCol.accessor('url', { header: 'URL', meta: { type: 'url', editable: true, width: 180 } }),
      ],
      []
    )
    const handleCommit = (rowId: string, colId: string, value: unknown) => {
      setData((prev) => prev.map((row) => row.sku === rowId ? { ...row, [colId]: value } : row))
    }
    return (
      <div>
        <p className="text-caption text-fg-muted mb-3">
          試算表式操作:第一次點 cell 選取(藍框),第二次點才進編輯。Shift+點另一格選範圍,
          方向鍵移動。Hover 可編輯的 cell 會出現淺邊框提示;唯讀 / 開關 / 連結欄位沒有 hover 提示
          (這些格子不需編輯,點下去直接 toggle 或開連結)。
        </p>
        <DataTable
          columns={editableColumns}
          data={data}
          height="auto"
          inlineEdit
          experimentalSpreadsheetOverlay
          spreadsheetMode
          experimentalActiveEditorController
          tableOptions={{ getRowId: (row) => row.sku }}
          getRowId={(row) => row.sku}
          onCellCommit={handleCommit}
        />
      </div>
    )
  },
}

/**
 * Issue 9 cell error system(2026-05-10):consumer-supplied `cellErrors` map shows error message
 * 14px text-error 在 display content 下方,gap-1 spacing。Edit cell 自動 clear visual error。
 * Multi-error 用 array → ul li 分行。aria-describedby + aria-invalid for AT。
 *
 * 對齊 AG Grid `cellClassRules='ag-cell-error'` + Material X-DataGrid `errorMessage` cell prop +
 * Airtable record validation idiom。
 */
export const CellErrors: Story = {
  name: '欄位錯誤訊息',
  render: () => {
    const [data, setData] = React.useState(editableSampleData)
    const editCol = createColumnHelper<EditableProduct>()
    const editableColumns = React.useMemo(
      () => [
        editCol.accessor('sku', { header: 'SKU', meta: { type: 'string', width: 110 } }),
        editCol.accessor('name', { header: 'Product', meta: { type: 'string', editable: true, width: 240 } }),
        editCol.accessor('qty', { header: 'Qty', meta: { type: 'number', editable: true, width: 110 } }),
        editCol.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, editable: true, width: 160 } }),
      ],
      []
    )
    // Demo cellErrors map(consumer 自管 state;edit commit 後可清 / 加 error)
    const [cellErrors, setCellErrors] = React.useState<Record<string, string | string[]>>({
      'PRD-001:name': '必填欄位:Product 名稱不可為空白',
      'PRD-002:qty': ['必須 ≥ 0', '必須是整數(目前小數)'],
      'PRD-003:category': '選擇的分類已不在 active catalog,請改選有效項目',
    })
    const handleCommit = (rowId: string, colId: string, value: unknown) => {
      setData((prev) => prev.map((row) => row.sku === rowId ? { ...row, [colId]: value } : row))
      // 範例:commit 後 clear 該 cell error
      setCellErrors((prev) => {
        const next = { ...prev }
        delete next[`${rowId}:${colId}`]
        return next
      })
    }
    return (
      <div className="flex flex-col gap-3 max-w-4xl">
        <p className="text-caption text-fg-muted">
          欄位驗證錯誤直接顯示在內容下方,不蓋住資料。一格多個錯誤分行條列。點進該格編輯時暫時隱藏錯誤,
          交給使用者修正;commit 後由 app 端決定是否還要顯示。
        </p>
        {/* 2026-05-10 fix(user 第二次糾正):restore `autoRowHeight` — 原本 story 用全表
            auto-row 是正確 baseline,error row 自然撐高 + 其他 row 仍 auto(內容驅動)。 */}
        <DataTable
          columns={editableColumns}
          data={data}
          height="auto"
          inlineEdit
          autoRowHeight
          getRowId={(row) => row.sku}
          tableOptions={{ getRowId: (row) => row.sku }}
          onCellCommit={handleCommit}
          cellErrors={cellErrors}
        />
      </div>
    )
  },
}

/**
 * 固定行高表格遇到欄位錯誤時的特殊行為(2026-05-10 per user 確認 ask):
 * 整個 table 預設 fixed 行高,但**任一格出現錯誤訊息的那一 row 會自動撐高**(改成 auto)讓
 * 訊息完整顯示。其他沒錯誤的 row 維持 fixed 高度不受影響。錯誤被修掉之後該 row 自動回 fixed。
 * 這是 per-row 行為,不是整表切換 mode。
 */
export const CellErrorsFixedRowOverride: Story = {
  name: '欄位錯誤訊息（固定行高 + 逐列撐高）',
  render: () => {
    const [data, setData] = React.useState(editableSampleData)
    const editCol = createColumnHelper<EditableProduct>()
    const editableColumns = React.useMemo(
      () => [
        editCol.accessor('sku', { header: 'SKU', meta: { type: 'string', width: 110 } }),
        editCol.accessor('name', { header: 'Product', meta: { type: 'string', editable: true, width: 240 } }),
        editCol.accessor('qty', { header: 'Qty', meta: { type: 'number', editable: true, width: 110 } }),
        editCol.accessor('category', { header: 'Category', meta: { type: 'select', options: CATEGORY_OPTIONS, editable: true, width: 160 } }),
      ],
      []
    )
    const [cellErrors, setCellErrors] = React.useState<Record<string, string | string[]>>({
      'PRD-001:name': '必填欄位:Product 名稱不可為空白',
      'PRD-003:category': '選擇的分類已不在 active catalog,請改選有效項目',
    })
    const handleCommit = (rowId: string, colId: string, value: unknown) => {
      setData((prev) => prev.map((row) => row.sku === rowId ? { ...row, [colId]: value } : row))
      setCellErrors((prev) => {
        const next = { ...prev }
        delete next[`${rowId}:${colId}`]
        return next
      })
    }
    return (
      <div className="flex flex-col gap-3 max-w-4xl">
        <p className="text-caption text-fg-muted">
          表格本身是固定行高(沒開 autoRowHeight),但 PRD-001 跟 PRD-003 有錯誤訊息 → 這兩 row
          自動撐高顯示訊息;PRD-002、PRD-004 沒錯誤,維持原本的固定行高,內容垂直置中。
          觀察 row 之間高度差,以及同一 row 內所有 cell 對齊一致(撐高 row 全頂對齊,固定 row 全置中)。
        </p>
        <DataTable
          columns={editableColumns}
          data={data}
          height="auto"
          inlineEdit
          getRowId={(row) => row.sku}
          tableOptions={{ getRowId: (row) => row.sku }}
          onCellCommit={handleCommit}
          cellErrors={cellErrors}
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
  name: '巢狀列（樹狀表格）',
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
   Tree drag 設計準則(2026-05-06 v14.7,對齊 spec.md「Cross-parent drop 禁止」)
   - **Top-level rows**:有 drag handle(absolute pinned to row left edge),可拖重排
   - **Sub-rows**(`row.depth > 0`):**無 handle**,不可拖(設計保守對齊 Notion)
   - **Cross-parent drop**:過濾,顯 invalid signal(handle cursor `not-allowed`)
   - **Drop indicator**:水平 2px primary line(top/bottom)— 主檔對齊 TreeView */
export const NestedRowsWithDrag: Story = {
  name: '巢狀列 × 拖曳重排',
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
          Tree-table drag 設計準則:**top-level rows 可拖**(handle 浮在 row 左緣),
          **sub-rows 無 handle 不可拖**(對齊 Notion 保守)。Cross-parent drop 過濾,
          顯 invalid signal。Drop indicator 水平 2px primary line — 主檔對齊 TreeView。
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

   排版設計準則(本 showcase):
   - Toolbar:左 search input / 右 ops 群(Gmail / Linear / Notion idiom)
   - 各 chrome 元件 self-pad px-loose;table mx-loose 對齊 chrome 內容左右邊界
   - bordered=true(height="100%" 為垂直滾動 trigger,per spec)
   - Alert variant="neutral"(資訊性 hint,非 info hue) */
// Issue 3(2026-05-10):VisibilityRow inline helper retired — 移到
// `<DataTableColumnVisibilityPanel>` primitive 內部(SSOT)。

export const WithBulkActions: Story = {
  name: '選取 + 批次操作',
  parameters: { layout: 'fullscreen' },
  render: () => {
    const [selection, setSelection] = React.useState<string[]>([])
    const [allSelected, setAllSelected] = React.useState(false)
    const [search, setSearch] = React.useState('')
    const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({})
    // Issue 3(2026-05-10):columnSearch 移到 `<DataTableColumnVisibilityPanel>` 內 own,
    // story 不再 hold;columnOrder 仍 hold(table 跟 panel 共用同 state)。
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
                pressed prop:套用條件後 trigger 維持 active 視覺(toggle pressed,Button 設計準則) */}
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
                {/* Issue 3(2026-05-10):從 inline 149-line panel 改用 SSOT primitive
                    `<DataTableColumnVisibilityPanel>`(全 feature flag opt-in:search +
                    reset + DnD reorder + lock)。SKU 永遠鎖在第一位 = `lockedIds=['sku']`。 */}
                <DataTableColumnVisibilityPanel
                  columns={baseColumns.map((c) => ({
                    id: ((c as any).accessorKey ?? (c as any).id) as string,
                    label: typeof (c as any).header === 'string' ? (c as any).header : ((c as any).accessorKey ?? (c as any).id),
                  }))}
                  visibility={columnVisibility}
                  onVisibilityChange={setColumnVisibility}
                  columnOrder={columnOrder}
                  onColumnOrderChange={setColumnOrder}
                  lockedIds={['sku']}
                  searchable
                  resettable
                />
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
   inline 過來,sidebar 收斂於 DataTable/展示 同一層(Q1 設計準則)
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

/* ── 進階篩選 — 長標籤溢出 ── */
export const FilterPanelLongTagOverflow: Story = {
  name: '進階篩選 — 長標籤溢出',
  render: () => {
    // 製造業 ERP 的產品分類名稱普遍很長 — 示範多選後 Combobox tag 溢出時的 +N 摘要收斂
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
        <p className="text-caption text-fg-muted mb-3">產品分類名稱很長(製造業 ERP 常見)時,已選的多個標籤超出單行寬度,Combobox 自動收斂為 +N 摘要。</p>
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
   enableRowDrag + onRowReorder 整合範例(v3 Jira 設計準則):
   - handle 浮在 row 左緣(fixed-position;Button tertiary iconOnly xs = elevated chip)
   - 不佔 column 空間 — table 看起來乾淨,沒有預留拖曳欄位
   - hover row → handle 浮現(JS 控 opacity)
   - 拖曳 row → @dnd-kit/core useDraggable + useDroppable(v15.0 Path B);放下 → onRowReorder(sourceId, targetId, 'before' | 'after')
   - consumer 自管 data array mutation(同 Notion / Airtable / Linear pattern)
   - sort 啟用時 drag handle 自動 disabled + Tooltip 解釋
   - pinned-left + pinned-right 同時存在 → source 留原位,2px drop indicator 跨三 region 同步標示落點
     (per-region useDraggable / useDroppable,不 auto-shift) */
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
          handle 浮在 row 左緣（不佔 column 空間，Jira 設計準則）。pinned-left（SKU）+ pinned-right（Updated）+
          center 中段欄。拖曳時 source 列留在原位（壓住視覺），2px 主色 drop indicator 跨三個 region
          同步標示落點（per-region <code>useDraggable</code> / <code>useDroppable</code>，不 auto-shift）。
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
   1. enableRowDrag 時 overscan 自動拉到 Math.max(overscan, 5)(避免 row unmount 時 useDraggable/useDroppable subscription 跟著
      消失導致 dnd-kit stale lookup → 拖到該 id 視覺錯位)
   2. drag 進行中(activeDragId != null)整個略過 measureElement(任一 row 重新量測會跟 dnd-kit
      transform 競爭,長 list 累積錯位)
   3. DndContext modifier 用 snapToCursorModifier(ghost top-left 對齊 cursor,不鎖軸)— row drag
      期間 ghost 跟隨游標
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
          200 列 + 虛擬捲動。v3 修正:enableRowDrag 自動拉高 overscan ≥ 5、drag 期間 freeze
          measureElement、snapToCursorModifier ghost 對齊游標（不鎖軸）— 拖曳 + 持續往下捲不再錯位。
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

/* ────────────────────────────────────────────────────────────────────────────
 * RoadmapInteractive — Slice A RFC §Demo deliverable(per S5 codex feedback +
 * USER #50 verbatim「DataTable demo 就可以開始做了啊」+ codex 2026-05-10 review red-light fixes)。
 *
 * 場景:Product Initiative Roadmap(Q2 2026 PM OKR)。13 column 全 cell type 覆蓋。
 *
 * Cell type:string(readonly id + editable title)/ select(status / priority)/
 *            multiSelect(tags)/ person(owner)/ multiPerson(reviewers)/
 *            date(start / due)/ number(progress / hours)/ url(spec)/ boolean(shipped)
 *
 * World-class M22 cite(per codex review,2026-05-10):
 *   - Linear Display options: https://linear.app/docs/display-options
 *   - Asana Custom fields: https://developers.asana.com/docs/custom-fields-guide
 *   - Jira Product Discovery fields reference: https://support.atlassian.com/jira-product-discovery/docs/jira-product-discovery-fields-reference/
 * ──────────────────────────────────────────────────────────────────────────── */

interface RoadmapItem {
  id: string
  title: string
  status: 'not-started' | 'in-progress' | 'blocked' | 'done' | 'cancelled'
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  owner: PersonData
  reviewers: PersonData[]
  tags: string[]
  startDate: string
  dueDate: string
  progress: number
  spec: string
  hours: number
  /** Standup time(per user 2026-05-10 「補一個會出現 timepicker 的欄位」)。HH:MM 格式 */
  standup: string
  /** Nested sub-tasks(per Issue 7 nested rows requirement, 2026-05-10)*/
  children?: RoadmapItem[]
}

const STATUS_OPTIONS = [
  { value: 'not-started', label: '未開始' },
  { value: 'in-progress', label: '進行中' },
  { value: 'blocked', label: '受阻' },
  { value: 'done', label: '完成' },
  { value: 'cancelled', label: '取消' },
]

const PRIORITY_OPTIONS = [
  { value: 'P0', label: 'P0', tagVariant: 'red' as const },
  { value: 'P1', label: 'P1', tagVariant: 'orange' as const },
  { value: 'P2', label: 'P2', tagVariant: 'yellow' as const },
  { value: 'P3', label: 'P3', tagVariant: 'neutral' as const },
]

const TAG_LABELS = [
  { value: 'design', label: 'design' },
  { value: 'frontend', label: 'frontend' },
  { value: 'backend', label: 'backend' },
  { value: 'qa', label: 'qa' },
  { value: 'ops', label: 'ops' },
  { value: 'docs', label: 'docs' },
  { value: 'mobile', label: 'mobile' },
  { value: 'spike', label: 'spike' },
]

const ROADMAP_DATA: RoadmapItem[] = [
  { id: 'RDM-001', title: '結帳流程改版 v2', status: 'in-progress', priority: 'P0', owner: SELLERS[0], reviewers: [SELLERS[1], SELLERS[2]], tags: ['frontend', 'design'], startDate: '2026-04-01', dueDate: '2026-05-30', progress: 65, spec: 'https://notion.so/checkout-v2', hours: 120, standup: '10:00' },
  { id: 'RDM-002', title: '會員忠誠度系統', status: 'not-started', priority: 'P1', owner: SELLERS[1], reviewers: [SELLERS[3]], tags: ['backend', 'spike'], startDate: '2026-05-15', dueDate: '2026-07-30', progress: 0, spec: 'https://notion.so/loyalty', hours: 0, standup: '10:00' },
  { id: 'RDM-003', title: '行動端 push 通知', status: 'blocked', priority: 'P1', owner: SELLERS[2], reviewers: [SELLERS[0], SELLERS[4]], tags: ['mobile', 'backend'], startDate: '2026-04-15', dueDate: '2026-06-15', progress: 30, spec: 'https://notion.so/push', hours: 45, standup: '10:00' },
  { id: 'RDM-004', title: '搜尋 SEO 優化', status: 'done', priority: 'P2', owner: SELLERS[3], reviewers: [SELLERS[2]], tags: ['frontend', 'docs'], startDate: '2026-02-01', dueDate: '2026-04-01', progress: 100, spec: 'https://notion.so/seo', hours: 80, standup: '10:00' },
  { id: 'RDM-005', title: '客服 CSAT 儀表板', status: 'in-progress', priority: 'P2', owner: SELLERS[4], reviewers: [SELLERS[5]], tags: ['frontend', 'design', 'docs'], startDate: '2026-04-10', dueDate: '2026-05-25', progress: 50, spec: 'https://notion.so/csat-dashboard', hours: 65, standup: '10:00' },
  { id: 'RDM-006', title: '物流即時追蹤', status: 'not-started', priority: 'P3', owner: SELLERS[5], reviewers: [SELLERS[1]], tags: ['backend', 'qa'], startDate: '2026-06-01', dueDate: '2026-09-15', progress: 0, spec: 'https://notion.so/tracking', hours: 0, standup: '10:00' },
  { id: 'RDM-007', title: 'A/B 測試平台', status: 'cancelled', priority: 'P3', owner: SELLERS[0], reviewers: [], tags: ['ops', 'spike'], startDate: '2026-03-01', dueDate: '2026-05-01', progress: 15, spec: 'https://notion.so/ab-test', hours: 20, standup: '10:00' },
  { id: 'RDM-008', title: 'Dark mode 全站支援', status: 'in-progress', priority: 'P2', owner: SELLERS[1], reviewers: [SELLERS[0], SELLERS[3]], tags: ['frontend', 'design'], startDate: '2026-04-20', dueDate: '2026-06-10', progress: 75, spec: 'https://notion.so/dark-mode', hours: 90, standup: '10:00' },
]

// Roadmap shared columns helper(主 demo + 5 stress stories 共用)
function useRoadmapColumns() {
  const col = createColumnHelper<RoadmapItem>()
  return React.useMemo(
    () => [
      col.accessor('id', { header: 'ID', meta: { type: 'string', width: 100 } }),
      col.accessor('title', { header: '標題', meta: { type: 'string', editable: true, width: 240 } }),
      col.accessor('status', { header: '狀態', meta: { type: 'select', options: STATUS_OPTIONS, editable: true, width: 130 } }),
      col.accessor('priority', { header: '優先級', meta: { type: 'select', options: PRIORITY_OPTIONS, editable: true, width: 100 } }),
      col.accessor('owner', { header: '負責人', meta: { type: 'person', people: SELLERS, editable: true, width: 160 } }),
      col.accessor('reviewers', { header: '審核', meta: { type: 'multiPerson', people: SELLERS, editable: true, width: 140 } }),
      col.accessor('tags', { header: '標籤', meta: { type: 'multiSelect', options: TAG_LABELS, editable: true, width: 200 } }),
      col.accessor('startDate', { header: '開始', meta: { type: 'date', editable: true, width: 120 } }),
      col.accessor('dueDate', { header: '截止', meta: { type: 'date', editable: true, width: 120 } }),
      col.accessor('progress', { header: '進度%', meta: { type: 'number', editable: true, width: 100 } }),
      col.accessor('spec', { header: '規格', meta: { type: 'url', editable: true, width: 180 } }),
      col.accessor('hours', { header: '工時', meta: { type: 'number', editable: true, width: 90 } }),
      // 2026-05-10(per user 補 timepicker 欄位):time column type 用 standup HH:MM
      col.accessor('standup', { header: '站立', meta: { type: 'time', editable: true, width: 100 } }),
      // 已出(shipped boolean)retired per user directive 2026-05-10
    ],
    []
  )
}

/**
 * **單一整合 demo**(2026-05-10 user 拍板「全部合起來放在同一個範例方便我檢查」+ codex Layer B
 * 比稿 confirm「one primary integrated demo」):取代 6 個分散 stories(原 RoadmapInteractive +
 * 5 stress stories: Pinned / AllSizes / SpreadsheetOverlay / Selection / BigData)。
 *
 * 整合所有 DataTable 主功能,模擬真實 product UI(無 inner title / 無 demo description,
 * 對齊 user 圖4 reference「整個範例看起來是真實的」+ codex Q4.2 confirm):
 *   - Search(consumer-side filter via Input)
 *   - Filter panel(DataTableFilterPanel + evaluateTree)
 *   - Sort manager(DataTableSortManager 多欄條件)
 *   - Column visibility(Popover + checkbox per column)
 *   - Selection + bulk actions(BulkActionBar)
 *   - Pinned columns(left=id,right=shipped)
 *   - Spreadsheet overlay(experimentalSpreadsheetOverlay + Contract 8/15)
 *   - 500 rows + virtualization(per fold-in BigData)
 *   - Inline edit(per Contract 12)
 *
 * Play function assertion(virtualization invariant per codex Q-3):500 rows + 固定高 →
 * rendered rows ≤ 30(VIRTUAL_THRESHOLD + overscan;非全 500)。從原 RoadmapBigData fold 進。
 *
 * Layer C dissent vs codex Layer B:codex 建議 retain BigData 獨立,Layer A own DISAGREE
 * 採 user explicit「全部合起來」— play assertion fold 進整合 demo 不另留 separate story。
 */
export const RoadmapAllInOne: Story = {
  name: '專案排程全功能整合',
  parameters: { layout: 'fullscreen' },
  render: () => {
    // 500 top-level rows derived from ROADMAP_DATA(fold-in BigData per codex Q4.1 + user 整合 ask)。
    // **Issue 7(2026-05-10):前 8 rows 補 sub-tasks** 展示 nested row tree-table — 其餘 row 維持 flat
    // 確保 virtualization invariant 仍在 500-row scale 驗證。
    const bigData = React.useMemo(() => {
      const arr: RoadmapItem[] = []
      for (let i = 0; i < 500; i++) {
        const base = ROADMAP_DATA[i % ROADMAP_DATA.length]
        const id = `RDM-${String(i + 100).padStart(3, '0')}`
        const item: RoadmapItem = {
          ...base,
          id,
          title: `${base.title} (#${i + 1})`,
        }
        // 前 8 個 top row 補 sub-tasks(展示 nested row + drag canonical:top-level only)
        if (i < 8) {
          item.children = [
            { ...base, id: `${id}-1`, title: `${base.title} 子任務 A`, progress: Math.min(100, base.progress + 10), hours: Math.max(0, Math.floor(base.hours / 3)) },
            { ...base, id: `${id}-2`, title: `${base.title} 子任務 B`, progress: Math.max(0, base.progress - 10), hours: Math.max(0, Math.floor(base.hours / 4)) },
          ]
        }
        arr.push(item)
      }
      return arr
    }, [])
    const [data, setData] = React.useState(bigData)
    const columns = useRoadmapColumns()
    const [search, setSearch] = React.useState('')
    const [selection, setSelection] = React.useState<string[]>([])
    const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({})
    const [sorting, setSorting] = React.useState<SortingState>([])
    const [filterTree, setFilterTree] = React.useState<FilterTree>(() => createEmptyFilterTree('flat'))
    const [filterOpen, setFilterOpen] = React.useState(false)
    const [sortOpen, setSortOpen] = React.useState(false)
    // Issue 7:nested row expansion state(預設展開前 2 個 top-row 的 sub-tasks)
    const [expanded, setExpanded] = React.useState<Record<string, boolean>>({ 'RDM-100': true, 'RDM-101': true })
    // Issue 7:column order(enableColumnReorder 用 controlled state,DnD 後 setColumnOrder)
    const [columnOrder, setColumnOrder] = React.useState<string[]>([])

    // Search consumer-side filter(per codex Q4.3「Search not a DataTable prop;
    // story implements consumer-side filtering」)。Filter / sort 走 TanStack state。
    const filteredData = React.useMemo(
      () => search
        ? data.filter(r => r.title.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase()))
        : data,
      [data, search]
    )

    const handleCommit = (rowId: string, colId: string, value: unknown) => {
      const updateRow = (rows: RoadmapItem[]): RoadmapItem[] =>
        rows.map((r) => {
          if (r.id === rowId) return { ...r, [colId]: value }
          if (r.children) return { ...r, children: updateRow(r.children) }
          return r
        })
      setData((prev) => updateRow(prev))
    }

    // Issue 7:enableRowDrag handler — top-level only(nested children 不可拖,per NestedRowsWithDrag canonical)
    const handleRowReorder = (sourceId: string, targetId: string, position: 'before' | 'after') => {
      setData((prev) => {
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

    // Issue 7:enableColumnReorder handler(對齊 ColumnReorder canonical L256-265)
    const handleColumnReorder = (sourceId: string, targetId: string, position: 'before' | 'after') => {
      setColumnOrder((prev) => {
        // 用既有 column accessorKey 順序作 fallback initial
        const accessorKeys = columns.map((c) => (c as any).accessorKey ?? (c as any).id) as string[]
        const base = prev.length > 0 ? prev : accessorKeys
        const next = base.filter((id) => id !== sourceId)
        const targetIdx = next.indexOf(targetId)
        if (targetIdx === -1) return prev
        const insertAt = position === 'before' ? targetIdx : targetIdx + 1
        next.splice(insertAt, 0, sourceId)
        return next
      })
    }

    return (
      <div className="flex flex-col w-full h-screen bg-canvas">
        {/* Toolbar — 左 search / 右 ops(對齊 WithBulkActions canonical L922+ Gmail/Linear/Notion idiom)*/}
        <div className="flex items-center justify-between gap-2 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
          <div className="flex-1 max-w-sm">
            <Input
              size="sm"
              placeholder="搜尋 ID / 標題"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              startIcon={Search}
            />
          </div>
          <div className="flex items-center gap-2">
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="text" size="sm" iconOnly startIcon={Filter} aria-label="篩選" pressed={isFilterTreeActive(filterTree)} />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <DataTableFilterPanel
                  mode="flat"
                  columns={columns}
                  value={filterTree}
                  onChange={setFilterTree}
                  onClose={() => setFilterOpen(false)}
                />
              </PopoverContent>
            </Popover>
            <Popover open={sortOpen} onOpenChange={setSortOpen}>
              <PopoverTrigger asChild>
                <Button variant="text" size="sm" iconOnly startIcon={ArrowUpDown} aria-label="排序" pressed={sorting.length > 0} />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <DataTableSortManager
                  columns={columns}
                  sorting={sorting}
                  onSortingChange={setSorting}
                  onReset={() => setSorting([])}
                  onClose={() => setSortOpen(false)}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="text" size="sm" iconOnly startIcon={Eye} aria-label="欄位顯示" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                {/* Issue 3(2026-05-10)+ F1 fix(2026-05-10):primitive
                    `<DataTableColumnVisibilityPanel>` + columnOrder/onColumnOrderChange wired
                    →  panel 內啟 drag handle(per user 抓「為什麼還會有偏移?為什麼沒 drag?」)。
                    Roadmap 跟 WithBulkActions(L1050+ 設計準則)現在對齊 — panel 內 drag 是
                    primary reorder UX,DataTable header drag handle 是 secondary parallel
                    affordance。 */}
                <DataTableColumnVisibilityPanel
                  columns={columns.map((c) => ({
                    id: ((c as any).accessorKey ?? (c as any).id) as string,
                    label: typeof (c as any).header === 'string' ? (c as any).header : ((c as any).accessorKey ?? (c as any).id),
                  }))}
                  visibility={columnVisibility}
                  onVisibilityChange={setColumnVisibility}
                  columnOrder={columnOrder.length > 0 ? columnOrder : columns.map((c) => ((c as any).accessorKey ?? (c as any).id) as string)}
                  onColumnOrderChange={setColumnOrder}
                  searchable
                  resettable
                />
              </PopoverContent>
            </Popover>
            <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
            <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多" />
          </div>
        </div>

        {/* DataTable container — flex-1 min-h-0(撐滿 toolbar 跟 footer 之間 space) */}
        <div className="flex-1 min-h-0 mx-[var(--layout-space-loose)] mb-[var(--layout-space-loose)] flex flex-col">
          <DataTable
            columns={columns}
            data={filteredData}
            height="100%"
            inlineEdit
            selectable
            selection={selection}
            onSelectionChange={setSelection}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            pinnedLeftColumns={['id']}
            // 2026-05-10:retire pinnedRightColumns(原 shipped boolean,user 拿掉「已出」欄位)
            // 2026-05-10 B4:啟 enableColumnResize(per user「Roadmap demo 應該要有欄寬調整」)。
            // H2 fix:pinned 欄位右邊也可 resize(panel boundary col hot zone 可拖)。
            // H3:system cols + meta.resizable=false col 自動 lock 不允許拖。
            enableColumnResize
            enableRowDrag
            onRowReorder={handleRowReorder}
            enableColumnReorder
            onColumnReorder={handleColumnReorder}
            // 2026-05-10(per user「操作列只要 ⋯ 一個 action」):3 buttons → 1 MoreVertical
            rowActions={() => (
              <Button variant="text" size="xs" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
            )}
            getRowId={(row) => row.id}
            onCellCommit={handleCommit}
            tableOptions={{
              state: {
                sorting,
                globalFilter: filterTree,
                expanded,
                ...(columnOrder.length > 0 ? { columnOrder } : {}),
              },
              onSortingChange: (updater) => {
                setSorting(typeof updater === 'function' ? updater(sorting) : updater)
              },
              onGlobalFilterChange: setFilterTree,
              globalFilterFn: (row, _columnId, t: FilterTree) => evaluateTree(t, row.original),
              getFilteredRowModel: getFilteredRowModel(),
              // Issue 7 nested rows:tree-table 啟用
              getSubRows: (row: RoadmapItem) => row.children,
              getRowCanExpand: (row) => Boolean(row.original.children?.length),
              onExpandedChange: setExpanded as any,
            }}
          />
        </div>

        {/* Bulk action bar — 底部 chrome,只在 selection 有值時顯示 */}
        {selection.length > 0 && (
          <BulkActionBar
            selection={selection}
            onClear={() => setSelection([])}
            actions={
              <>
                <Button variant="tertiary" size="md" startIcon={Download}>匯出</Button>
                <Button variant="tertiary" size="md" startIcon={Trash2} danger>移除</Button>
              </>
            }
          />
        )}
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    // Virtualization perf invariant(fold-in 自原 RoadmapBigData play function,per codex Q-3):
    // 500 rows + height 100% → rendered rows 應 << 500(virtualizer 應只 render visible viewport
    // + overscan)。Threshold 100 height-aware:full-screen viewport(~1080px viewport)~ 25 visible
    // rows + overscan padding → 50-70 typical;遠 < 200 → virtualization work。
    await new Promise((r) => setTimeout(r, 300))
    const dataRows = canvasElement.querySelectorAll('[role="row"][data-row-index]')
    const visibleCount = dataRows.length
    if (visibleCount > 200) {
      throw new Error(`Virtualization broken:rendered ${visibleCount} rows,expected ≤ 200(viewport-aware)`)
    }
    if (visibleCount < 5) {
      throw new Error(`Virtualization too aggressive:rendered only ${visibleCount} rows`)
    }
  },
}

/* ── Feature-split perf budget story(2026-05-14 codex perf debate verdict;2026-06-12 deep-audit
   R2 重建 — 2026-05-17 stories 整併批次誤 retire,但 spec「六之三」Case B hard gate +
   scripts/runtime-perf-datatable.mjs:20 仍指向本 story,gate 形同不可跑):──────────────────
   獨立 perf 量測 story — 同 Roadmap 13 cols rich-cell data(useRoadmapColumns SSOT),但**禁用**
   row drag / column reorder / column resize / selection / spreadsheet overlay,只保 inline edit
   display。目的:隔離 feature-stack 疊加 cost(SortableRowProvider / filter / sort / columnOrder
   state),驗證 rich cell 本體 scroll budget(avg ≤ 50ms / p95 ≤ 80ms / long-task ≤ 1,CPU 4x
   throttle)。**不動** RoadmapAllInOne demo IA(user 2026-05-10 directive 全合一)。
   重建版去掉原手刻說明 banner(px-loose + border-b border-divider = R9 chrome-header drift
   簽名,且量測 story 不需 chrome;說明留本註解)。 */
export const RoadmapPerfBudget: Story = {
  name: '效能預算量測',
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
  render: () => {
    const bigData = React.useMemo(() => {
      const arr: RoadmapItem[] = []
      for (let i = 0; i < 500; i++) {
        const base = ROADMAP_DATA[i % ROADMAP_DATA.length]
        const id = `RDM-${String(i + 100).padStart(3, '0')}`
        arr.push({ ...base, id, title: `${base.title} (#${i + 1})` })
      }
      return arr
    }, [])
    const [data, setData] = React.useState(bigData)
    const columns = useRoadmapColumns()
    const handleCommit = (rowId: string, colId: string, value: unknown) => {
      setData((prev) => prev.map((r) => (r.id === rowId ? { ...r, [colId]: value } : r)))
    }
    return (
      <div className="mx-[var(--layout-space-loose)] mb-[var(--layout-space-loose)]">
        <DataTable
          columns={columns}
          data={data}
          height="600px"
          inlineEdit
          getRowId={(row) => row.id}
          onCellCommit={handleCommit}
        />
      </div>
    )
  },
}

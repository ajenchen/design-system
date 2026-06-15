// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#NumberAlignment
import type { Meta, StoryObj } from '@storybook/react'
import type { ColumnDef } from '@tanstack/react-table'
import { Skeleton } from './skeleton'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging

/**
 * Skeleton 展示——在資料載入完成前，用灰色色塊模擬真實內容的形狀與排版。
 * 何時用、何時改用近親元件，見「設計原則」頁；各種形狀與屬性，見「設計規格」頁。
 *
 * 展示範例均對標世界級產品的真實載入情境（Linear task detail、Stripe dashboard、
 * Notion sidebar、GitHub PR list），讓讀者能直接類推到自己產品的佈局。
 */

const meta: Meta = {
  title: 'Design System/Components/Skeleton/展示',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Default: Story = {
  name: '預設',
  render: () => (
    <div className="flex flex-col gap-2 max-w-md">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  ),
}

export const UserProfileCard: Story = {
  name: '個人資料卡載入',
  render: () => (
    <div className="border border-border rounded-lg p-4 max-w-sm flex items-center gap-3">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex flex-col gap-2 flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  ),
}

export const TaskListLoading: Story = {
  name: '任務列表載入',
  render: () => (
    <div className="flex flex-col gap-1 max-w-2xl border border-border rounded-lg divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-6 rounded-full" />
        </div>
      ))}
    </div>
  ),
}

/* ── 表格列載入 ──
   消費真 <DataTable>(per data-table.spec.md「狀態處理職責邊界」:DataTable 禁內建 loading prop,
   無資料載入由 consumer 渲 Skeleton placeholder rows;對齊 MUI X `noRowsVariant=skeleton` /
   Carbon DataTableSkeleton「header 可見 + body cell skeleton」派)。
   Columns 不設 meta.type → 走 consumer 自訂 cell 渲 Skeleton(meta.type 命中 registry 會繞過自訂 cell)。 */
interface LoadingRow {
  id: string
}

const LOADING_ROWS: LoadingRow[] = Array.from({ length: 4 }, (_, i) => ({ id: `loading-${i + 1}` }))

const loadingColumns: ColumnDef<LoadingRow>[] = [
  { id: 'txn', header: '交易編號', meta: { width: 160 }, cell: () => <Skeleton className="h-4 w-28" /> },
  { id: 'amount', header: '金額', meta: { width: 110, align: 'right' }, cell: () => <Skeleton className="h-4 w-16" /> },
  {
    id: 'customer',
    header: '客戶',
    meta: { width: 200 },
    cell: () => (
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    ),
  },
  { id: 'date', header: '日期', meta: { width: 130 }, cell: () => <Skeleton className="h-4 w-20" /> },
]

export const TableRowLoading: Story = {
  name: '表格列載入',
  render: () => (
    <div aria-busy="true" className="max-w-3xl">
      <DataTable columns={loadingColumns} data={LOADING_ROWS} getRowId={(r) => r.id} height="auto" />
    </div>
  ),
}

export const DocumentLoading: Story = {
  name: '文件載入',
  render: () => (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Skeleton className="h-8 w-1/2" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="flex flex-col gap-2 mt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex flex-col gap-2 mt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  ),
}

export const CardGridLoading: Story = {
  name: '卡片網格載入',
  render: () => (
    <div className="grid grid-cols-3 gap-4 max-w-4xl">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-3 flex flex-col gap-3">
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  ),
}

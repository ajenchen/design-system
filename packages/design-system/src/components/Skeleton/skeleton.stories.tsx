// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @story-baseline: packages/design-system/src/components/DataTable/data-table.anatomy.stories.tsx#AlignmentRule
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
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '在資料載入期間以接近最終內容的色塊保留版面，降低跳動並預告資訊結構。已知內容形狀且等待時間短時使用；未知進度工作改用進度指示。' } },
  },
}
export default meta
type Story = StoryObj

// Default retired 2026-07-14 per audit Dim 24(story 重複性):「預設」的三行文字骨架
// pattern 與 DocumentLoading 段落骨架完全同構,且抽象「預設」違「範例必真實業務場景」;
// 由 UserProfileCard / TaskListLoading / DocumentLoading 等真實情境 story 覆蓋。

export const UserProfileCard: Story = {
  name: '個人資料卡載入',
  render: () => (
    // @layout-space-magic-ok: 頭像骨架 ↔ 文字區 = 載入後那一列的 prefix ↔ content,item-anatomy.spec.md「ListItem（頁面列表，未來元件）」表「prefix ↔ content gap」12px(`gap-3`)(已發布同值)
    <div className="border border-border rounded-lg p-[var(--layout-space-loose)] max-w-sm flex items-center gap-3">
      <Skeleton className="h-12 w-12 rounded-full" />
      {/* @layout-space-magic-ok: 骨架文字區兩行(名稱 / 副標)之間 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(v0.1.0-beta.147 ec7466f5 同值) */}
      <div className="flex flex-col gap-2 flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  ),
}

/* ── 任務列表載入 ──
   任務列表本身就是一張 DataTable(編號 / 標題 / 狀態 / 負責人),載入時照下面「表格列載入」同一種做法:表頭可見、
   每一格放形狀相同的 Skeleton(data-table.spec.md「狀態處理職責邊界」:無資料載入由 consumer 渲 Skeleton placeholder rows)。
   2026-10-27 前這裡是手畫的外框 + 分隔線 + 自訂列內距(稽核 L049:不是 DS 清單或 DataTable 的形狀)。 */
interface TaskLoadingRow {
  id: string
}

const TASK_LOADING_ROWS: TaskLoadingRow[] = Array.from({ length: 5 }, (_, i) => ({ id: `task-loading-${i + 1}` }))

const taskLoadingColumns: ColumnDef<TaskLoadingRow>[] = [
  { id: 'key', header: '編號', meta: { width: 110 }, cell: () => <Skeleton className="h-4 w-16" /> },
  { id: 'title', header: '標題', meta: { width: 280 }, cell: () => <Skeleton className="h-4 w-56" /> },
  { id: 'status', header: '狀態', meta: { width: 120 }, cell: () => <Skeleton className="h-6 w-16 rounded-full" /> },
  { id: 'assignee', header: '負責人', meta: { width: 100 }, cell: () => <Skeleton className="h-6 w-6 rounded-full" /> },
]

export const TaskListLoading: Story = {
  name: '任務列表載入',
  render: () => (
    <div aria-busy="true" className="max-w-2xl">
      <DataTable columns={taskLoadingColumns} data={TASK_LOADING_ROWS} getRowId={(r) => r.id} height="auto" />
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
      // @layout-space-magic-ok: 表格儲存格骨架 頭像 ↔ 名稱 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(v0.1.0-beta.147 ec7466f5 同值)
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
    // 標題區(標題 + 作者列)→ 內文 = loose:標題是整份文件的標題,不是第一段的小標(user 2026-10-21 A4 甲;
    // layoutSpace.spec.md 規則 3「標題區 → 內容」:兩段以上並列 = loose);段與段並列 = loose。
    // 標題 → 作者列 = tight(同一個標題區,沿用)。2026-10-27 前整個標題區 → 內文也是 tight(註解寫「functional 鏈」)。
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-2xl">
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <Skeleton className="h-8 w-1/2" />
        {/* @layout-space-magic-ok: 作者列 頭像 ↔ 名字 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(v0.1.0-beta.147 ec7466f5 同值) */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      {/* @layout-space-magic-ok: 同一段的骨架文字行之間 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(v0.1.0-beta.147 ec7466f5 同值) */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      {/* @layout-space-magic-ok: 同一段的骨架文字行之間 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(v0.1.0-beta.147 ec7466f5 同值) */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  ),
}

export const CardGridLoading: Story = {
  name: '卡片網格載入',
  render: () => (
    <div className="grid grid-cols-3 gap-[var(--layout-space-loose)] max-w-4xl">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-[var(--layout-space-loose)] flex flex-col gap-[var(--layout-space-tight)]">
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  ),
}

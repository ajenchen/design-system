// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithBulkActions
// (per .claude/references/story-baseline-registry.json#DataTable)
import type { Meta, StoryObj } from '@storybook/react'
import { Search, Upload } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { CircularProgress } from './circular-progress'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'
import { Empty } from '@/design-system/components/Empty/empty'
import { DataTable } from '@/design-system/components/DataTable/data-table'

/**
 * CircularProgress 展示——整個設計系統 circular 形式進度的 SSOT。
 *
 * - 無 value → indeterminate 旋轉(取代舊 Spinner 用法)
 * - 有 value → determinate arc + track(可量化進度,如 inline 上傳 %)
 *
 * 範例均對標世界級產品的真實使用場景(Stripe 付款送出、GitHub PR merging、
 * Figma 雲端同步、Notion workspace loading、Google Drive 上傳)。
 * 設計規則詳見 `circular-progress.spec.md`。
 */

const meta: Meta = {
  title: 'Design System/Components/CircularProgress/展示',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Default: Story = {
  name: '預設',
  render: () => (
    <div className="flex items-center gap-6">
      {/* CircularProgress 只提供一種預設尺寸(24);其他尺寸由 consumer context 自動縮放
          (Button loading = iconSize / Input loading = iconSize / Empty = iconSize)。
          不 parallel 展示多 sizes 因為 DS 不「提供各種 sizes」讓 consumer 挑,而是透過原則
          在 consumer 端自動決定(見 spec.md「Size canonical」)。 */}
      <CircularProgress />
      <CircularProgress value={60} aria-label="進度 60%" />
      <CircularProgress value={90} affix="value" aria-label="進度 90%" />
    </div>
  ),
}

export const ButtonLoading: Story = {
  name: '按鈕載入中',
  render: () => (
    <div className="flex items-center gap-3">
      <Button variant="primary" loading>處理付款中</Button>
      <Button variant="secondary" loading>儲存草稿</Button>
      <Button variant="tertiary" loading>匯出 CSV</Button>
    </div>
  ),
}

export const InlineAction: Story = {
  name: '行內操作',
  render: () => {
    // 多檔上傳列(Google Drive / Dropbox 慣例):上傳中的檔案 determinate(value + affix
    // 顯示 %),尚在準備(壓縮 / 掃描)的檔案 indeterminate + label——兩態在同一真實佇列
    // 中對照。容器 text-body(14px)→ CircularProgress label 天然 inherit,無須
    // hand-craft label span。
    const uploads = [
      { file: 'Q3-revenue-report.xlsx', value: 28 },
      { file: 'product-roadmap.pdf', value: 64 },
      { file: 'presentation.pdf', value: undefined },
    ]
    return (
      <div className="flex flex-col gap-4 max-w-sm">
        <Input
          startIcon={Search}
          loading
          defaultValue="react-"
          placeholder="搜尋 GitHub repositories..."
        />

        <div className="flex flex-col gap-2">
          {uploads.map((u) => (
            <div
              key={u.file}
              className="flex items-center gap-3 border border-border rounded-md px-3 py-2 text-body"
            >
              <Upload size={16} className="text-fg-muted" />
              <span className="flex-1 truncate">{u.file}</span>
              {u.value != null ? (
                <CircularProgress size={16} value={u.value} affix="value" aria-label={`${u.file} 上傳 ${u.value}%`} />
              ) : (
                <CircularProgress size={16} label="準備中" />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  },
}

type SyncRow = { file: string; modified: string; sync: 'syncing' | 'synced' }

const syncColumns: ColumnDef<SyncRow>[] = [
  { accessorKey: 'file', header: '檔案' },
  {
    accessorKey: 'modified',
    header: '最後修改',
    cell: ({ row }) => <span className="text-fg-muted">{row.original.modified}</span>,
  },
  {
    accessorKey: 'sync',
    header: '同步狀態',
    cell: ({ row }) =>
      row.original.sync === 'syncing' ? (
        // DataTable cell vertical 對齊規則:cell 本體 `flex items-center` 已把內容垂直
        // 置中,consumer 的 inline 指示器外層也走 inline-flex items-center 即可,不要
        // 再加 leading-none 嘗試「壓縮行高」——那會讓 svg(16px) 與 text line box 互搶
        // 基線,反而歪掉。
        <span className="inline-flex items-center gap-2 text-fg-muted">
          <CircularProgress size={16} />
          同步中
        </span>
      ) : (
        <span className="text-fg-muted">已同步</span>
      ),
  },
]

const syncData: SyncRow[] = [
  { file: 'Design System v2', modified: '2 分鐘前', sync: 'syncing' },
  { file: 'Onboarding Flow', modified: '1 小時前', sync: 'synced' },
]

export const InlineCellLoading: Story = {
  name: '儲存格局部載入',
  render: () => (
    <div className="max-w-2xl">
      <DataTable columns={syncColumns} data={syncData} />
    </div>
  ),
}

export const FullScreenOverlay: Story = {
  name: '全頁浮層',
  render: () => (
    <div className="relative border border-border rounded-lg w-full h-80 overflow-hidden flex items-center justify-center">
      <Empty
        icon={<CircularProgress size={48} aria-label="切換 workspace 中" />}
        title="正在切換 workspace"
        description="切換到 Acme Inc. workspace,請稍候"
      />
    </div>
  ),
}


// @story-baseline: packages/design-system/src/components/DataTable/data-table.anatomy.stories.tsx#AlignmentRule
import type { Meta, StoryObj } from '@storybook/react'
import type { ColumnDef } from '@tanstack/react-table'
import { FileText, Table as TableIcon } from 'lucide-react'
import { ProgressBar } from './progress-bar'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging

const meta: Meta<typeof ProgressBar> = {
  title: 'Design System/Components/ProgressBar/展示',
  component: ProgressBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '量化 linear 進度(determinate progress)視覺 primitive。0–100% 已知進度、單向推進、可預期終點。未知進度或 inline 小空間改用 CircularProgress。',
      },
    },
  },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    status: { control: 'select', options: ['inProgress', 'success', 'error'] },
    affix: { control: 'select', options: [undefined, 'value', 'status-icon'] },
  },
}
export default meta
type Story = StoryObj<typeof ProgressBar>

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-body font-bold text-foreground mb-2">{children}</h3>
)
const SectionDesc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{children}</p>
)

// ── Default(基本範例) ──────────────────────────────────────────────────

export const Default: Story = {
  args: { value: 45, status: 'inProgress', affix: 'value' },
  render: (args) => (
    <div className="w-[360px]">
      <ProgressBar {...args} aria-label="進度 45%" />
    </div>
  ),
}

// ── 真實情境 1: 批次任務(Linear / Jira bulk action) ────────────────────
//
// ⚠️ 檔案上傳列表請改看 FileItem stories — ProgressBar 不是檔案上傳的 canonical
// consumer-facing primitive(見 spec「與 FileItem 的分界」)。

export const BatchTask: Story = {
  name: '批次任務進度',
  render: () => (
    <div className="flex flex-col gap-4 w-[460px]">
      <SectionTitle>CSV 匯入進度(Linear bulk import / Airtable 匯入)</SectionTitle>
      <SectionDesc>
        匯入 1,250 筆客戶資料。單一 prominent 進度條,使用者會盯著整個流程完成。
      </SectionDesc>
      <div className="flex flex-col gap-3 border border-border rounded-md p-5 bg-surface">
        <div className="flex items-center gap-2">
          <TableIcon size={18} className="text-primary shrink-0" />
          <span className="text-body-lg font-medium flex-1">匯入客戶名單</span>
          <span className="text-caption text-fg-muted tabular-nums">812 / 1,250 筆</span>
        </div>
        <ProgressBar value={65} status="inProgress" affix="value" />
        <p className="text-footnote text-fg-muted">
          處理中,請勿關閉此視窗。預計剩餘 28 秒。
        </p>
      </div>
    </div>
  ),
}

// ── 真實情境 3: DataTable cell inline 進度 ─────────────────────────────
// 2026-07-14 audit(R1 A.2):手刻 table markup → 消費真 <DataTable>(對齊 Skeleton
// TableRowLoading 同款 consumer-自訂-cell 模式;columns 不設 meta.type 走自訂 cell)。

interface QuotaRow {
  name: string
  quota: number
  status: 'inProgress' | 'success' | 'error'
}

const quotaRows: QuotaRow[] = [
  { name: 'Acme Corp 專案', quota: 45, status: 'inProgress' },
  { name: 'Globex 整合', quota: 78, status: 'inProgress' },
  { name: 'Initech 改版', quota: 100, status: 'success' },
  { name: 'Umbrella 導入', quota: 12, status: 'inProgress' },
  { name: 'Wonka 客製化', quota: 95, status: 'error' },
]

const quotaColumns: ColumnDef<QuotaRow>[] = [
  {
    id: 'name',
    header: '專案',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-fg-muted shrink-0" />
        {row.original.name}
      </div>
    ),
  },
  {
    id: 'quota',
    header: '配額使用率',
    meta: { width: 240 },
    cell: ({ row }) => (
      <ProgressBar value={row.original.quota} status={row.original.status} affix="value" />
    ),
  },
]

export const InlineTableCell: Story = {
  name: 'DataTable 儲存格內進度',
  render: () => (
    <div className="flex flex-col gap-4 w-[560px]">
      <SectionTitle>配額使用率(DataTable inline)</SectionTitle>
      <SectionDesc>
        Table cell 內顯示配額使用率(4px 細線不搶走主要欄位的閱讀重量)。value affix 讓使用者快速讀數字。
      </SectionDesc>
      <DataTable columns={quotaColumns} data={quotaRows} getRowId={(r) => r.name} height="auto" />
    </div>
  ),
}


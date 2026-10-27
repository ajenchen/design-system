// @story-baseline: packages/design-system/src/components/DataTable/data-table.anatomy.stories.tsx#AlignmentRule
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import type { ColumnDef } from '@tanstack/react-table'
import { FileText } from 'lucide-react'
import { ProgressBar } from './progress-bar'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import { Button } from '@/design-system/components/Button/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/design-system/components/Dialog/dialog'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { ExampleSection } from '@/design-system/stories-helpers/examples/tutorial-page'
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

// ── Default(基本範例) ──────────────────────────────────────────────────

export const Default: Story = {
  name: '預設',
  args: { value: 45, status: 'inProgress', affix: 'value' },
  render: (args) => (
    <div className="w-[360px]">
      <ProgressBar {...args} aria-label="進度 45%" />
    </div>
  ),
}

// ── 真實情境 1: 批次匯入 ──────────────────────────────────────────────
//
// ⚠️ 檔案上傳列表請改看 FileItem stories — ProgressBar 不是檔案上傳的 canonical
// consumer-facing primitive(見 spec「與 FileItem 的分界」)。
//
// 按「匯入客戶名單」打開對話框,裡面只放百分比進度(user 2026-10-21「d14 照你建議，不要顯示剩餘時間」;
// F10 ②「照你建議」:跑到 100% 關對話框、跳 Toast「已匯入 1,250 筆客戶資料」,拿掉「812 / 1,250 筆」)。
// 跑到一半關掉對話框(×、點遮罩、Esc)= 只把視窗收起來,匯入在背景繼續,完成照樣跳 Toast —— 關視窗不等於取消(取消在下面三家都是另一顆明確的按鈕)。
// 三家一致(2026-10-28 讀原文):
// - Windows 介面指引 Progress Bars:「Users often switch to other programs while waiting and don't want to be interrupted.
//   Background tasks must stay in the background.」;取消要給一顆指令按鈕:「Provide a command button to halt the operation if it takes
//   more than a few seconds to complete」(https://learn.microsoft.com/en-us/windows/win32/uxguide/progress-bars)
// - Carbon Loading pattern:「If the process is going to take more than a few minutes, consider including a notification.」
//   (https://carbondesignsystem.com/patterns/loading-pattern/)
// - Apple HIG Progress indicators:「A determinate progress indicator can help people decide whether to do something else while waiting
//   for the task to complete」;「If people can interrupt a process without causing negative side effects, include a Cancel button.」
//   (https://developer.apple.com/design/human-interface-guidelines/progress-indicators)
// 點遮罩 / 關閉 = 返回(user 2026-08-10「所有modal不是預設都是點遮罩會關閉嗎？包含警示也是，警示點旁邊就是返回的意思啊」)。
const IMPORT_TOTAL = 1250
const IMPORT_TICK_MS = 400

function CustomerImport() {
  const [open, setOpen] = React.useState(false)
  const [percent, setPercent] = React.useState<number | null>(null) // null = 沒有在匯入
  React.useEffect(() => {
    if (percent === null || percent >= 100) return
    const timer = window.setTimeout(() => setPercent((p) => Math.min(100, (p ?? 0) + 10)), IMPORT_TICK_MS)
    return () => window.clearTimeout(timer)
  }, [percent])
  React.useEffect(() => {
    if (percent !== 100) return
    setOpen(false)
    setPercent(null)
    toast({ variant: 'success', title: `已匯入 ${IMPORT_TOTAL.toLocaleString('en-US')} 筆客戶資料` })
  }, [percent])
  const start = () => {
    if (percent === null) setPercent(0)
    setOpen(true)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="tertiary" onClick={start}>匯入客戶名單</Button>
      </DialogTrigger>
      <DialogContent height="hug">
        <DialogHeader>
          <DialogTitle>匯入客戶名單</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {/* 說明 ↔ 進度條 = tight(說明替這條進度命名 = labeling,layoutSpace.spec.md「親疏 3 級」functional 交互) */}
          <div className="flex flex-col gap-[var(--layout-space-tight)]">
            <p className="text-body">正在匯入 {IMPORT_TOTAL.toLocaleString('en-US')} 筆客戶資料。可以關閉這個視窗,匯入會在背景繼續,完成時會通知你。</p>
            <ProgressBar value={percent ?? 0} status="inProgress" affix="value" aria-label="匯入客戶名單進度" />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export const BatchTask: Story = {
  name: '批次任務進度',
  render: () => (
    <>
      {/* Toaster:每個獨立 story root 掛一個(toast.spec.md「app-level-one 是強制合約」允許 Storybook 各 story root 一個) */}
      <Toaster />
      <ExampleSection
        title="批次匯入"
        description="匯入 1,250 筆客戶資料:進度放在對話框裡,只顯示百分比;跑完關閉對話框並跳通知。"
      >
        <div>
          <CustomerImport />
        </div>
      </ExampleSection>
    </>
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
      // @layout-space-magic-ok: 表格儲存格內 圖示 ↔ 專案名(layoutSpace.spec.md:166 micro)
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
      <ProgressBar
        value={row.original.quota}
        status={row.original.status}
        affix="value"
        aria-label={`${row.original.name} 配額使用率`}
      />
    ),
  },
]

export const InlineTableCell: Story = {
  name: 'DataTable 儲存格內進度',
  render: () => (
    <ExampleSection
      className="w-[560px]"
      title="配額使用率(DataTable inline)"
      description="Table cell 內顯示配額使用率(4px 細線不搶走主要欄位的閱讀重量)。value affix 讓使用者快速讀數字。"
    >
      <DataTable columns={quotaColumns} data={quotaRows} getRowId={(r) => r.name} height="auto" />
    </ExampleSection>
  ),
}


import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from './data-table'

// ── Sample Data ──────────────────────────────────────────────────────────────

interface Task {
  id: string
  title: string
  status: string
  priority: string
  assignee: string
  dueDate: string
  amount?: number
  description?: string
}

const sampleData: Task[] = [
  { id: 'TASK-1', title: 'Sticker feature needed', status: 'To do', priority: 'Low', assignee: 'Jeff Lin', dueDate: '2024/12/16', amount: 1200 },
  { id: 'TASK-2', title: 'Need to know who reported', status: 'To do', priority: 'Medium', assignee: 'Jeff Lin', dueDate: '2024/12/16', amount: 3400 },
  { id: 'TASK-3', title: 'Need to view task details', status: 'In progress', priority: 'High', assignee: 'Amy Chen', dueDate: '2024/12/18', amount: 560 },
  { id: 'TASK-4', title: 'Need priority column', status: 'To do', priority: 'Low', assignee: 'Jeff Lin', dueDate: '2024/12/20', amount: 8900 },
  { id: 'TASK-5', title: 'Need tag type column', status: 'Done', priority: 'Medium', assignee: 'Amy Chen', dueDate: '2024/12/22', amount: 230 },
  { id: 'TASK-6', title: 'Need to know who reported this issue and track it', status: 'To do', priority: 'Low', assignee: 'Jeff Lin', dueDate: '2024/12/16', amount: 4500 },
]

const longDescriptionData: Task[] = sampleData.map((t, i) => ({
  ...t,
  description: i % 2 === 0
    ? '這是一段較長的描述文字，用來測試多行換行的情境。當內容超過欄位寬度時應該自然換行而非截斷。'
    : '短描述',
}))

function generateLargeData(count: number): Task[] {
  const statuses = ['To do', 'In progress', 'Done', 'Cancelled']
  const priorities = ['Low', 'Medium', 'High', 'Critical']
  const assignees = ['Jeff Lin', 'Amy Chen', 'Bob Wang', 'Lisa Wu']
  return Array.from({ length: count }, (_, i) => ({
    id: `TASK-${i + 1}`,
    title: `Task item ${i + 1} — ${priorities[i % 4]} priority work`,
    status: statuses[i % 4],
    priority: priorities[i % 4],
    assignee: assignees[i % 4],
    dueDate: `2024/12/${String(16 + (i % 15)).padStart(2, '0')}`,
    amount: Math.round(Math.random() * 10000),
  }))
}

// ── Column Definitions ───────────────────────────────────────────────────────

const col = createColumnHelper<Task>()

const baseColumns = [
  col.accessor('id', { header: 'ID', size: 100, minSize: 80 }),
  col.accessor('title', { header: 'Title', size: 280, minSize: 120 }),
  col.accessor('status', { header: 'Status', size: 120 }),
  col.accessor('priority', { header: 'Priority', size: 100 }),
  col.accessor('assignee', { header: 'Assignee', size: 120 }),
  col.accessor('dueDate', { header: 'Due date', size: 120 }),
]

const columnsWithAmount = [
  ...baseColumns,
  col.accessor('amount', {
    header: 'Amount',
    size: 120,
    meta: { align: 'right' },
    cell: (info) => {
      const val = info.getValue()
      return val != null ? `$${val.toLocaleString()}` : '—'
    },
  }),
]

const columnsWithWrap = [
  col.accessor('id', { header: 'ID', size: 100 }),
  col.accessor('title', { header: 'Title', size: 200 }),
  col.accessor('description', {
    header: 'Description',
    size: 300,
    meta: { wrap: true },
  }),
  col.accessor('status', { header: 'Status', size: 120 }),
  col.accessor('assignee', { header: 'Assignee', size: 120 }),
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

/* ── 基本用法 ── */
export const Default: Story = {
  render: () => (
    <DataTable columns={baseColumns} data={sampleData} height="auto" />
  ),
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
    <DataTable columns={columnsWithAmount} data={sampleData} height="auto" />
  ),
}

/* ── 文字截斷 vs 換行 ── */
export const TextTruncation: Story = {
  name: '截斷 vs 換行',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">預設截斷（ellipsis）</h3>
        <p className="text-caption text-fg-muted mb-3">Title 欄位超出寬度會以 … 截斷</p>
        <DataTable columns={baseColumns} data={sampleData} height="auto" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">多行換行（wrap）</h3>
        <p className="text-caption text-fg-muted mb-3">Description 欄位設定 wrap: true，內容自然換行</p>
        <DataTable columns={columnsWithWrap} data={longDescriptionData} height="auto" />
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
              <p className="text-body text-fg-muted mb-1">尚無任務</p>
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
        <h3 className="text-body font-bold text-foreground mb-2">無外框（預設）</h3>
        <DataTable columns={baseColumns} data={sampleData.slice(0, 3)} height="auto" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">有外框</h3>
        <p className="text-caption text-fg-muted mb-3">當內容溢出、有 frozen column 或全表 inline edit 時加外框</p>
        <DataTable columns={baseColumns} data={sampleData.slice(0, 3)} height="auto" bordered />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">水平溢出 + 外框</h3>
        <p className="text-caption text-fg-muted mb-3">欄位總寬超過容器，水平捲動時邊框標記容器邊界</p>
        <div className="max-w-[500px]">
          <DataTable columns={columnsWithAmount} data={sampleData.slice(0, 3)} height="auto" bordered />
        </div>
      </div>
    </div>
  ),
}

/* ── 虛擬捲動（大量資料）── */
export const VirtualScroll: Story = {
  name: '虛擬捲動（10,000 行）',
  render: () => {
    const largeData = React.useMemo(() => generateLargeData(10000), [])
    return (
      <DataTable
        columns={columnsWithAmount}
        data={largeData}
        height="500px"
        overscan={10}
        bordered
      />
    )
  },
}

import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import type { ColumnDef } from '@tanstack/react-table'
import { SearchX, Lock, Inbox, Search } from 'lucide-react'
import { Empty } from './empty'
import { Button } from '@/design-system/components/Button/button'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import { Input } from '@/design-system/components/Input/input'
import { Field, FieldError, FieldLabel, useFormValidation } from '@/design-system/components/Field/field'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/design-system/components/Dialog/dialog'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { ORDER_ROWS, orderColumns } from '@/design-system/stories-helpers/data/order-table'

const meta: Meta<typeof Empty> = {
  title: 'Design System/Components/Empty/展示',
  component: Empty,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '用於容器內沒有資料、搜尋無結果、尚未開始或無權檢視的狀態，並說明原因與下一步。錯誤或失敗改用 Alert / Notice，載入中改用 Spinner / Skeleton，整頁 403 / 404 使用專屬錯誤頁。',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof Empty>

// 每一則的按鈕都做它說的那件事(稽核 L020:清除篩選 → 清單恢復、建立 → 開 Dialog;user 2026-09-08 F-S2 看得到的按鈕都要能動)。
// 前兩則放在 Empty 真正的住處 —— DataTable 的空狀態(empty.spec.md「現有消費者」DataTable 列,emptyState 收完整的 Empty)。

/* ── 搜尋無結果:訂單表搜客戶,清除搜尋 → 清單回來 ─────────────────────────── */
function OrderSearch() {
  const [query, setQuery] = React.useState('Hooli')
  const rows = ORDER_ROWS.slice(0, 6).filter((r) => r.customer.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    // 搜尋框 → 表格 = tight(搜尋的值驅動下面的清單 = functional 交互,layoutSpace.spec.md「具體推導 walkthrough」範例 2)
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xl">
      <div className="max-w-xs">
        <Input size="sm" aria-label="搜尋客戶" placeholder="搜尋客戶" startIcon={Search} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <DataTable
        columns={orderColumns}
        data={rows}
        getRowId={(r) => r.id}
        height="auto"
        emptyState={
          <Empty
            icon={SearchX}
            title="找不到相符的訂單"
            description="試試其他客戶名稱,或清除搜尋看全部訂單"
            action={<Button variant="tertiary" onClick={() => setQuery('')}>清除搜尋</Button>}
          />
        }
      />
    </div>
  )
}

export const SearchNoResults: Story = {
  name: '搜尋無結果',
  render: () => <OrderSearch />,
}

/* ── 空清單:這個 Sprint 還沒有任務,建立任務 → 表格出現第一筆 ───────────────── */
type SprintTask = { id: string; title: string; status: string }
const TASK_COLUMNS: ColumnDef<SprintTask>[] = [
  { accessorKey: 'title', header: '任務' },
  { accessorKey: 'status', header: '狀態' },
]

function SprintBacklog() {
  const [tasks, setTasks] = React.useState<SprintTask[]>([])
  const [open, setOpen] = React.useState(false)
  // 對話框裡的表單同 Dialog 展示「表單」:走 useFormValidation、沒有 <form>(footer 鈕呼叫 handleSubmit)、打開那一刻 reset、送出成功 Toast 再關
  const form = useFormValidation({
    initialValues: { title: '' },
    validate: { title: (v) => (String(v ?? '').trim() ? undefined : '任務名稱必填') },
    onSubmit: (values) => {
      setTasks((list) => [...list, { id: `task-${list.length + 1}`, title: String(values.title).trim(), status: '待處理' }])
      toast({ variant: 'success', title: '任務已建立' })
      setOpen(false)
    },
  })
  const handleOpenChange = (next: boolean) => {
    if (next) form.reset()
    setOpen(next)
  }
  // 建立第一筆之後,開對話框的那顆鈕跟著空狀態一起消失 —— 焦點改交給表格的捲動區(有資料時它是 Tab 停靠點),不掉到 <body>
  //(keyboard-model-canonical.md:焦點不可因 DOM 卸載掉到 body)。空狀態還在時照 DialogContent 預設還給那顆鈕。
  const tableRef = React.useRef<HTMLDivElement>(null)
  const ctaRef = React.useRef<HTMLButtonElement>(null)
  const focusTableIfCtaGone = (e: Event) => {
    if (ctaRef.current?.isConnected) return
    const region = tableRef.current?.querySelector<HTMLElement>('[tabindex="0"]')
    if (!region) return
    e.preventDefault()
    region.focus()
  }
  return (
    <div ref={tableRef} className="max-w-xl">
      <DataTable
        columns={TASK_COLUMNS}
        data={tasks}
        getRowId={(r) => r.id}
        height="auto"
        emptyState={
          <Empty
            icon={Inbox}
            title="這個 Sprint 還沒有任務"
            description="從 backlog 拖拉任務進來,或直接建立新任務"
            action={<Button ref={ctaRef} variant="primary" onClick={() => handleOpenChange(true)}>建立任務</Button>}
          />
        }
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent height="hug" onCloseAutoFocus={focusTableIfCtaGone}>
          <DialogHeader>
            <DialogTitle>建立任務</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field required invalid={!!form.errors.title}>
              <FieldLabel>任務名稱</FieldLabel>
              <Input placeholder="例:結帳頁加入 Apple Pay" {...form.getInputProps('title')} />
              <FieldError>{form.errors.title}</FieldError>
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="tertiary">取消</Button>
            </DialogClose>
            <Button variant="primary" loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>建立</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export const NoTasks: Story = {
  name: '空清單',
  render: () => (
    <>
      {/* Toaster:每個獨立 story root 掛一個(toast.spec.md「app-level-one 是強制合約」允許 Storybook 各 story root 一個) */}
      <Toaster />
      <SprintBacklog />
    </>
  ),
}

// Retired 2026-07-04 audit(Q 拍板):原 LoadFailure story 正面示範 spec 明文禁止的 error-state
// 用法(empty.spec.md「何時不用」+ 禁止事項「錯誤/失敗狀態 → 改用 Alert」)— showcase 不得把
// 反例當正例教。錯誤示範保留在 principles 的 ❌ 反例(empty.principles.stories.tsx)。

/* ── 權限不足 ─────────────────────────────────────────────────────── */
export const NoPermission: Story = {
  name: '權限不足',
  render: () => (
    <>
      <Toaster />
      {/* @layout-space-magic-ok: 有框容器包 Empty 的外框留白由容器決定且刻意不隨 density(empty.spec.md「間距」的「Outer padding 由 consumer 容器決定」)(layoutSpace.spec.md:113 同範疇 spec-own) */}
      <div className="border border-border rounded-lg p-8 max-w-md">
        <Empty
          icon={Lock}
          title="你沒有檢視這個專案的權限"
          description="請聯絡專案擁有者要求存取,或返回你有權限的工作區"
          action={<Button variant="tertiary" onClick={() => toast({ variant: 'success', title: '已通知專案擁有者,對方開放權限後會寄信給你' })}>聯絡擁有者</Button>}
        />
      </div>
    </>
  ),
}

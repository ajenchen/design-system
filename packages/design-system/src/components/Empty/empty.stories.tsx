import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import type { ColumnDef } from '@tanstack/react-table'
import { SearchX, Lock, Inbox, Search, X } from 'lucide-react'
import { Empty } from './empty'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
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
// 前兩則放在 Empty 真正的住處 —— DataTable 的空狀態(empty.spec.md「現有消費者」DataTable 列)。
// 動作放在表格上方(搜尋框的清除鈕、工具列的「建立任務」),空狀態只寫說明 —— 同 DataTable 設計原則「空 / 錯誤 / 載入中的對應元件」
// 那則正例的寫法(emptyState 的說明指向上方的「新增商品」)。
// 為什麼不把按鈕放進空狀態:這是 2026-10-28 a11y 閘的實測結果(AI 量的,不是規格原文)—— 按鈕放進 DataTable 空狀態,axe 判
// aria-required-children。data-table.spec.md 的 ARIA 段只寫到空表時 Empty 塊不掛 rowgroup、也不帶 tabIndex / 名稱,沒有講按鈕;
// 根因(空狀態能不能放動作)交 data 家族處理。

/* ── 搜尋無結果:訂單表搜客戶,清除搜尋 → 清單回來 ─────────────────────────── */
function OrderSearch() {
  const [query, setQuery] = React.useState('Hooli')
  const rows = ORDER_ROWS.slice(0, 6).filter((r) => r.customer.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    // 搜尋框 → 表格 = tight(搜尋的值驅動下面的清單 = functional 交互,layoutSpace.spec.md「具體推導 walkthrough」範例 2)
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xl">
      <div className="max-w-xs">
        {/* 清除鈕 = Input 的 endAction(input.spec.md「endAction 的常見模式」表的「清除內容」列:有值時出現、清空後消失) */}
        <Input
          size="sm"
          aria-label="搜尋客戶"
          placeholder="搜尋客戶"
          startIcon={Search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          endAction={query ? { icon: X, label: '清除搜尋', onClick: () => setQuery('') } : undefined}
        />
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
            description="試試其他客戶名稱,或清除搜尋框看全部訂單"
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
  return (
    // 工具列 → 表格 = tight(工具列的動作直接作用在這張表 = functional 交互,layoutSpace.spec.md「具體推導 walkthrough」toolbar → table)
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-xl">
      {/* 這一列沒有標題 → 靠左、primary 最左(action-bar.spec.md「對齊方向的決定」) */}
      <ButtonGroup>
        <Button variant="primary" onClick={() => handleOpenChange(true)}>建立任務</Button>
      </ButtonGroup>
      <DataTable
        columns={TASK_COLUMNS}
        data={tasks}
        getRowId={(r) => r.id}
        height="auto"
        emptyState={
          <Empty
            icon={Inbox}
            title="這個 Sprint 還沒有任務"
            description="從 backlog 拖拉任務進來,或點上方「建立任務」"
          />
        }
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent height="hug">
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
      {/* @layout-space-magic-ok: 有框容器包 Empty 的外框內距 32px —— empty.spec.md「間距」只寫「Outer padding 由 consumer 容器決定」、沒寫這個值,不由 AI 補進規格(F-S7),沿用已發布值(v0.1.0-beta.147 ec7466f5 同值) */}
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

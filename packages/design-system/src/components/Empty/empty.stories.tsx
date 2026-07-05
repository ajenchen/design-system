import type { Meta, StoryObj } from '@storybook/react'
import { SearchX, Lock, Inbox } from 'lucide-react'
import { Empty } from './empty'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof Empty> = {
  title: 'Design System/Components/Empty/展示',
  component: Empty,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '空狀態視覺元件——icon + title + description + action 的居中垂直堆疊。預設只需 description,其他皆可選。',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof Empty>

/* ── 搜尋無結果(Jira / Linear 慣例)─────────────────────────────────── */
export const SearchNoResults: Story = {
  name: '搜尋無結果',
  render: () => (
    <div className="border border-border rounded-lg p-8 max-w-md">
      <Empty
        icon={SearchX}
        title="找不到相符的任務"
        description="試試其他關鍵字,或調整篩選條件"
        action={<Button variant="tertiary">清除所有篩選</Button>}
      />
    </div>
  ),
}

/* ── 空清單 — Jira 無 task ────────────────────────────────────────── */
export const NoTasks: Story = {
  name: '空清單',
  render: () => (
    <div className="border border-border rounded-lg p-8 max-w-md">
      <Empty
        icon={Inbox}
        title="這個 Sprint 還沒有任務"
        description="從 backlog 拖拉任務進來,或直接建立新任務"
        action={<Button variant="primary">建立任務</Button>}
      />
    </div>
  ),
}

// Retired 2026-07-04 audit(Q 拍板):原 LoadFailure story 正面示範 spec 明文禁止的 error-state
// 用法(empty.spec.md「何時不用」+ 禁止事項「錯誤/失敗狀態 → 改用 Alert」)— showcase 不得把
// 反例當正例教。錯誤示範保留在 principles 的 ❌ 反例(empty.principles.stories.tsx)。

/* ── 權限不足 ─────────────────────────────────────────────────────── */
export const NoPermission: Story = {
  name: '權限不足',
  render: () => (
    <div className="border border-border rounded-lg p-8 max-w-md">
      <Empty
        icon={Lock}
        title="你沒有檢視這個專案的權限"
        description="請聯絡專案擁有者要求存取,或返回你有權限的工作區"
        action={<Button variant="tertiary">聯絡擁有者</Button>}
      />
    </div>
  ),
}

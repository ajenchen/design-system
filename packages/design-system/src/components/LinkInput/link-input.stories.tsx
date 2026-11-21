// @story-trait-rationale: isInputLike -> Validation — Validation 已示範 malformed URL 的錯誤邊框與修正流程；另開 error-only story 會重複同一驗證情境。
// @story-history: isInputLike WithError 由 Field 消費者處理(LinkInput 在 Field 內透過 fieldCtx.invalid 自動套 error border);showcase 不重複 Field state machine 覆蓋的 case。
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { LinkInput } from './link-input'
import { ExampleSection, ExampleStack } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta<typeof LinkInput> = {
  title: 'Design System/Components/LinkInput/展示',
  tags: ['autodocs'],
  component: LinkInput,
  // autodocs disabled — LinkInput 有 stateful render logic，Docs page 需要手動 stories
  parameters: {
    docs: {
      description: {
        component: '用於儲存、驗證與直接開啟單一外部 URL，在連結閱讀態與輸入編輯態間切換。Slug、Email 或內部 router path 改用 Input，需同時編輯顯示文字與 URL 時改用連結編輯器。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof LinkInput>

/* ── 基本用法 ── */
export const Default: Story = {
  name: '基本用法',
  render: () => {
    const [value, setValue] = React.useState('https://github.com')
    return (
      <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-sm">
        <div>
          <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">有值——藍色連結 + Pencil 編輯</p>
          <LinkInput value={value} onChange={setValue} />
        </div>
      </div>
    )
  },
}

/* ── 空值 ── */
export const Empty: Story = {
  name: '空值',
  render: () => {
    const [value, setValue] = React.useState('')
    return (
      <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-sm">
        <p className="text-caption text-fg-muted">空值直接顯示 input，不用先按 Pencil</p>
        <LinkInput value={value} onChange={setValue} />
      </div>
    )
  },
}

/* ── 格式驗證 ── */
export const Validation: Story = {
  name: '失焦驗證',
  render: () => {
    const [value, setValue] = React.useState('')
    return (
      <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-sm">
        <p className="text-caption text-fg-muted">輸入不是網址的字(信箱、中間有空白)後按 Tab 離開，會出現 error 邊框。輸入網址後離開即自動切為藍色連結(github.com 這種沒寫 https:// 的會自動補上)。</p>
        <LinkInput value={value} onChange={setValue} placeholder="輸入網址" />
      </div>
    )
  },
}

/* ── 可清除 ── */
// link-input.spec.md「可清除(clearable)」:選填的網址欄位開 clearable;× 只在打字狀態、框裡有字時出現,連結狀態照舊只有 Pencil。
export const Clearable: Story = {
  name: '可清除',
  render: () => <ClearableDemo />,
}

function ClearableDemo() {
  // 三個選填欄位各管各的值:有連結 / 貼錯的字(不合法、框裡有字)/ 還沒填
  const [designLink, setDesignLink] = React.useState('https://www.figma.com/design/checkout-flow')
  const [specLink, setSpecLink] = React.useState('結帳流程需求文件 v3')
  const [ticketLink, setTicketLink] = React.useState('')
  return (
    <ExampleStack className="max-w-sm">
      <ExampleSection title="有連結:沒有 ×" description="連結狀態不變,右側只有 Pencil。按 Pencil 進入打字狀態後,框裡有字才出現 ×。">
        <LinkInput clearable value={designLink} onChange={setDesignLink} aria-label="設計稿連結" />
      </ExampleSection>
      <ExampleSection title="打字狀態、框裡有字:出現 ×" description="貼錯的字不是網址,按 × 一鍵清掉重打;焦點留在輸入框,離開或按 Enter 才結算(空白 = 清值),Esc 還原。">
        <LinkInput clearable value={specLink} onChange={setSpecLink} aria-label="需求文件連結" />
      </ExampleSection>
      <ExampleSection title="空白:沒有 ×" description="開始打字後才出現。">
        <LinkInput clearable value={ticketLink} onChange={setTicketLink} placeholder="貼上 Jira 工單網址" aria-label="Jira 工單連結" />
      </ExampleSection>
    </ExampleStack>
  )
}

/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => <ModesDemo />,
}

function ModesDemo() {
  const [value, setValue] = React.useState('https://github.com')
  return (
    <ExampleStack className="max-w-sm">
      <ExampleSection title="edit">
        <LinkInput value={value} onChange={setValue} />
      </ExampleSection>
      <ExampleSection title="view">
        <LinkInput mode="view" value="https://github.com" />
      </ExampleSection>
      <ExampleSection title="readonly">
        <LinkInput mode="readonly" value="https://github.com" />
      </ExampleSection>
      <ExampleSection title="disabled">
        <LinkInput mode="disabled" value="https://github.com" />
      </ExampleSection>
      <ExampleSection title="readonly(空值)">
        <LinkInput mode="readonly" value={null} />
      </ExampleSection>
    </ExampleStack>
  )
}

/* ── View（DataTable cell 用）── */
export const View: Story = {
  name: '檢視樣式',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      <LinkInput mode="view" value="https://www.example.com/path/to/page" />
      <LinkInput mode="view" value="https://github.com/user/repo" label="GitHub Repo" />
      <LinkInput mode="view" value={null} />
    </div>
  ),
}

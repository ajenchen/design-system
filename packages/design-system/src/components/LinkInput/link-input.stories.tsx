// @story-trait-rationale: isInputLike WithError 由 Field 消費者處理(LinkInput 在 Field 內透過 fieldCtx.invalid 自動套 error border);showcase 不重複 Field state machine 覆蓋的 case。
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { LinkInput } from './link-input'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof LinkInput> = {
  title: 'Design System/Components/LinkInput/展示',
  component: LinkInput,
  // autodocs disabled — LinkInput 有 stateful render logic，Docs page 需要手動 stories
  parameters: {
    docs: {
      description: {
        component: 'URL 輸入元件。有合法 URL 時以藍色連結顯示，Pencil icon 觸發編輯。blur 時驗證格式。',
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
      <div className="flex flex-col gap-4 max-w-sm">
        <div>
          <p className="text-caption text-fg-muted mb-2">有值——藍色連結 + Pencil 編輯</p>
          <LinkInput value={value} onChange={setValue} />
        </div>
        <p className="text-caption text-fg-muted">目前值：{value || '(empty)'}</p>
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
      <div className="flex flex-col gap-4 max-w-sm">
        <p className="text-caption text-fg-muted">空值直接顯示 input，不用先按 Pencil</p>
        <LinkInput value={value} onChange={setValue} />
        <p className="text-caption text-fg-muted">目前值：{value || '(empty)'}</p>
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
      <div className="flex flex-col gap-4 max-w-sm">
        <p className="text-caption text-fg-muted">輸入不合法的 URL 後按 Tab 離開，會出現 error 邊框。輸入合法 URL 後離開即自動切為藍色連結。</p>
        <LinkInput value={value} onChange={setValue} placeholder="輸入 URL（需含 https://）" />
        <p className="text-caption text-fg-muted">目前值：{value || '(empty)'}</p>
      </div>
    )
  },
}

/* ── 尺寸與 Button 對齊 ── */
export const SizeAlignment: Story = {
  name: '尺寸',
  render: () => {
    const [sm, setSm] = React.useState('https://github.com')
    const [md, setMd] = React.useState('https://github.com')
    const [lg, setLg] = React.useState('https://github.com')
    const states: Record<string, [string, (v: string) => void]> = { sm: [sm, setSm], md: [md, setMd], lg: [lg, setLg] }
    return (
      <div className="flex flex-col gap-4">
        {(['sm', 'md', 'lg'] as const).map(size => (
          <div key={size} className="flex items-center gap-3">
            <LinkInput size={size} value={states[size][0]} onChange={states[size][1]} className="max-w-xs" />
            <Button variant="primary" size={size}>送出</Button>
            <span className="text-caption text-fg-muted">size="{size}"</span>
          </div>
        ))}
      </div>
    )
  },
}

/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => (
    <div className="flex flex-col gap-6 max-w-sm">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
        <LinkInput value="https://github.com" onChange={() => {}} />
      </div>
      {/* @story-trait-rationale: pre-existing trait gaps tracked separately */}
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">display</h3>
        <LinkInput mode="display" value="https://github.com" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <LinkInput mode="readonly" value="https://github.com" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        <LinkInput mode="disabled" value="https://github.com" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly (null)</h3>
        <LinkInput mode="readonly" value={null} />
      </div>
    </div>
  ),
}

/* ── Display（DataTable cell 用）── */
export const Display: Story = {
  name: '展示樣式',
  render: () => (
    <div className="flex flex-col gap-3">
      <LinkInput mode="display" value="https://www.example.com/path/to/page" />
      <LinkInput mode="display" value="https://github.com/user/repo" label="GitHub Repo" />
      <LinkInput mode="display" value={null} />
    </div>
  ),
}

import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { LinkField, LinkFieldDisplay } from './link-field'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof LinkField> = {
  title: 'Design System/Components/Fields/LinkField',
  component: LinkField,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'URL 輸入元件。有合法 URL 時以藍色連結顯示，Pencil icon 觸發編輯。blur 時驗證格式。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof LinkField>

/* ── 基本用法 ── */
export const Basic: Story = {
  name: '基本用法',
  render: () => {
    const [value, setValue] = React.useState('https://github.com')
    return (
      <div className="flex flex-col gap-4 max-w-sm">
        <div>
          <p className="text-caption text-fg-muted mb-2">有值——藍色連結 + Pencil 編輯</p>
          <LinkField value={value} onChange={setValue} />
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
        <LinkField value={value} onChange={setValue} />
        <p className="text-caption text-fg-muted">目前值：{value || '(empty)'}</p>
      </div>
    )
  },
}

/* ── 格式驗證 ── */
export const Validation: Story = {
  name: 'Blur 驗證',
  render: () => {
    const [value, setValue] = React.useState('')
    return (
      <div className="flex flex-col gap-4 max-w-sm">
        <p className="text-caption text-fg-muted">輸入不合法的 URL 後按 Tab 離開，會出現 error 邊框。輸入合法 URL 後離開即自動切為藍色連結。</p>
        <LinkField value={value} onChange={setValue} placeholder="輸入 URL（需含 https://）" />
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
            <LinkField size={size} value={states[size][0]} onChange={states[size][1]} className="max-w-xs" />
            <Button size={size}>送出</Button>
            <span className="text-caption text-fg-muted">size="{size}"</span>
          </div>
        ))}
      </div>
    )
  },
}

/* ── 三種模式 ── */
export const Modes: Story = {
  name: '三種模式',
  render: () => (
    <div className="flex flex-col gap-6 max-w-sm">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
        <LinkField value="https://github.com" onChange={() => {}} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <LinkField mode="readonly" value="https://github.com" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        <LinkField mode="disabled" value="https://github.com" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly (null)</h3>
        <LinkField mode="readonly" value={null} />
      </div>
    </div>
  ),
}

/* ── Display（DataTable cell 用）── */
export const Display: Story = {
  name: 'Display（cell 用）',
  render: () => (
    <div className="flex flex-col gap-3">
      <LinkFieldDisplay value="https://www.example.com/path/to/page" />
      <LinkFieldDisplay value="https://github.com/user/repo" label="GitHub Repo" />
      <LinkFieldDisplay value={null} />
    </div>
  ),
}

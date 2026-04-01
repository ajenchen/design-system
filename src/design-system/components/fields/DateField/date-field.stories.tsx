import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { DateField, DateFieldDisplay } from './date-field'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof DateField> = {
  title: 'Design System/Components/Fields/DateField',
  component: DateField,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '日期選擇元件。外觀同 SelectField，Calendar icon 取代 ChevronDown。支援 clearable 和格式化選項。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof DateField>

/* ── 基本用法 ── */
export const Basic: Story = {
  name: '基本用法',
  render: () => {
    const [value, setValue] = React.useState('2026-04-02')
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <DateField value={value} onChange={setValue} />
        <p className="text-caption text-fg-muted">目前值：{value || '(empty)'}</p>
      </div>
    )
  },
}

/* ── 三種模式 ── */
export const Modes: Story = {
  name: '三種模式',
  render: () => (
    <div className="flex flex-col gap-6 max-w-xs">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
        <DateField value="2026-04-02" onChange={() => {}} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <DateField mode="readonly" value="2026-04-02" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        <DateField mode="disabled" value="2026-04-02" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly (null)</h3>
        <DateField mode="readonly" value={null} />
      </div>
    </div>
  ),
}

/* ── 可清除 ── */
export const Clearable: Story = {
  name: '可清除',
  render: () => {
    const [value, setValue] = React.useState('2026-04-02')
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <p className="text-caption text-fg-muted">有值時右側出現清除按鈕</p>
        <DateField value={value} onChange={setValue} clearable />
      </div>
    )
  },
}

/* ── 尺寸與 Button 對齊 ── */
export const SizeAlignment: Story = {
  name: '尺寸',
  render: () => {
    const [sm, setSm] = React.useState('2026-04-02')
    const [md, setMd] = React.useState('2026-04-02')
    const [lg, setLg] = React.useState('2026-04-02')
    const states: Record<string, [string, (v: string) => void]> = { sm: [sm, setSm], md: [md, setMd], lg: [lg, setLg] }
    return (
      <div className="flex flex-col gap-4">
        {(['sm', 'md', 'lg'] as const).map(size => (
          <div key={size} className="flex items-center gap-3">
            <DateField size={size} value={states[size][0]} onChange={states[size][1]} className="max-w-xs" />
            <Button size={size}>送出</Button>
            <span className="text-caption text-fg-muted">size="{size}"</span>
          </div>
        ))}
      </div>
    )
  },
}

/* ── Display（DataTable cell 用）── */
export const Display: Story = {
  name: 'Display（cell 用）',
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">預設</span>
        <DateFieldDisplay value="2026-04-02" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">完整月份</span>
        <DateFieldDisplay value="2026-04-02" formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">zh-TW</span>
        <DateFieldDisplay value="2026-04-02" locale="zh-TW" formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">null</span>
        <DateFieldDisplay value={null} />
      </div>
    </div>
  ),
}

import type { Meta, StoryObj } from '@storybook/react'
import { DateFieldDisplay } from './date-field'

const meta: Meta<typeof DateFieldDisplay> = {
  title: 'Design System/Components/Fields/DateField',
  component: DateFieldDisplay,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '日期顯示元件，支援多種格式化選項。用於 DataTable cell 和 Form readonly。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof DateFieldDisplay>

/* ── 基本用法 ── */
export const Basic: Story = {
  name: '基本用法',
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">ISO string</span>
        <DateFieldDisplay value="2026-04-02" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">timestamp</span>
        <DateFieldDisplay value={1775145600000} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">Date 物件</span>
        <DateFieldDisplay value={new Date(2026, 3, 2)} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">null</span>
        <DateFieldDisplay value={null} />
      </div>
    </div>
  ),
}

/* ── 格式化選項 ── */
export const Formats: Story = {
  name: '格式化選項',
  render: () => {
    const date = '2026-04-02'
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-caption text-fg-muted w-32">預設（MM/DD/YYYY）</span>
          <DateFieldDisplay value={date} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-caption text-fg-muted w-32">完整月份</span>
          <DateFieldDisplay value={date} formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-caption text-fg-muted w-32">短月份</span>
          <DateFieldDisplay value={date} formatOptions={{ year: 'numeric', month: 'short', day: 'numeric' }} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-caption text-fg-muted w-32">含星期</span>
          <DateFieldDisplay value={date} formatOptions={{ weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-caption text-fg-muted w-32">zh-TW locale</span>
          <DateFieldDisplay value={date} locale="zh-TW" formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }} />
        </div>
      </div>
    )
  },
}

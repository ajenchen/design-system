import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { DateTimePicker, DateTimeRangePicker } from './date-time-picker'

const meta: Meta<typeof DateTimePicker> = {
  title: 'Design System/Components/DateTimePicker/展示',
  component: DateTimePicker,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Datetime 選擇元件 — 對齊 Ant Design DatePicker `showTime` / RangePicker `showTime`。' +
          '消費 DateGrid + TimeColumns primitive(M17 SSOT)。' +
          'datetime / range 預設 `needConfirm=true`,需按 OK 才提交。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof DateTimePicker>

/* ── Single ── */

export const Default: Story = {
  name: '基本用法',
  render: () => {
    const [value, setValue] = React.useState<string | null>('2026-04-02T10:30:00')
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <DateTimePicker value={value} onChange={setValue} />
        <p className="text-caption text-fg-muted">目前值：{value || '(empty)'}</p>
      </div>
    )
  },
}

export const WithSeconds: Story = {
  name: '秒精度',
  render: () => {
    const [value, setValue] = React.useState<string | null>('2026-04-02T10:30:45')
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <DateTimePicker value={value} onChange={setValue} showSeconds />
        <p className="text-caption text-fg-muted">目前值：{value || '(empty)'}</p>
      </div>
    )
  },
}

export const Clearable: Story = {
  name: '可清除',
  render: () => {
    const [value, setValue] = React.useState<string | null>('2026-04-02T10:30:00')
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <DateTimePicker value={value} onChange={setValue} clearable />
        <p className="text-caption text-fg-muted">目前值：{value || '(empty)'}</p>
      </div>
    )
  },
}

/* ── Range ── */

type RangeStory = StoryObj<typeof DateTimeRangePicker>

export const Range: RangeStory = {
  name: 'Range',
  render: () => {
    const [value, setValue] = React.useState<[string | null, string | null] | null>([
      '2026-04-02T09:00:00',
      '2026-04-05T18:00:00',
    ])
    return (
      <div className="flex flex-col gap-4 max-w-md">
        <DateTimeRangePicker value={value} onChange={setValue} />
        <p className="text-caption text-fg-muted">目前值：{JSON.stringify(value)}</p>
      </div>
    )
  },
}

/* ── OpenSnapshot — 給 visual-audit 截到展開狀態(M15)── */

export const SinglePopoverOpen: Story = {
  name: '展開狀態(visual-audit)',
  tags: ['!autodocs'],
  render: () => {
    const [value, setValue] = React.useState<string | null>('2026-04-02T10:30:00')
    return (
      <div className="p-12">
        <DateTimePicker value={value} onChange={setValue} aria-label="選擇 datetime" />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test')
    const canvas = within(canvasElement)
    const trigger = await canvas.findByLabelText('選擇 datetime')
    await userEvent.click(trigger)
    // Popover open animation + scroll-to-selected effect
    await new Promise((r) => setTimeout(r, 400))
  },
}

export const RangePopoverOpen: RangeStory = {
  name: 'Range 展開狀態(visual-audit)',
  tags: ['!autodocs'],
  render: () => {
    const [value, setValue] = React.useState<[string | null, string | null] | null>([
      '2026-04-02T09:00:00',
      '2026-04-05T18:00:00',
    ])
    return (
      <div className="p-12">
        <DateTimeRangePicker value={value} onChange={setValue} aria-label="選擇 datetime range" />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test')
    const canvas = within(canvasElement)
    const trigger = await canvas.findByLabelText('選擇 datetime range')
    await userEvent.click(trigger)
    await new Promise((r) => setTimeout(r, 400))
  },
}

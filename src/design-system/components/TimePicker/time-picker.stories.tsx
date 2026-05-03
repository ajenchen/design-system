// @benchmark-citation-allow: tracker .claude/tracker/m22-citation-backlog.md(2026-05-03 mass-mark,M22 hook 上線前 pre-existing,逐 file retrofit pending)
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { TimePicker } from './time-picker'
import { Field, FieldLabel } from '@/design-system/components/Field/field'

const meta: Meta<typeof TimePicker> = {
  title: 'Design System/Components/TimePicker/展示',
  component: TimePicker,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '單一時間輸入。對齊 Ant Design TimePicker API;視覺 / 互動走本 DS 設計語言。完整規格見 `time-picker.spec.md`。',
      },
    },
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    showSeconds: { control: 'boolean' },
    minuteStep: { control: 'inline-radio', options: [1, 5, 10, 15, 30] },
  },
}
export default meta

type Story = StoryObj<typeof TimePicker>

// ── 真實業務情境(禁用 Option A/B/C 或抽象場景)─────────────────────────────

/**
 * 會議排程 — 會議時間常以 15 分鐘為粒度,minuteStep=15 是世界級慣例
 * (Google Calendar / Outlook / Notion Calendar 預設皆是 15)。
 */
export const MeetingSlot: Story = {
  name: '會議時段',
  render: () => {
    const [start, setStart] = React.useState<string>('09:00')
    const [end, setEnd] = React.useState<string>('10:00')
    return (
      <div className="flex flex-col gap-4 w-80">
        <Field>
          <FieldLabel>會議開始</FieldLabel>
          <TimePicker value={start} onChange={setStart} minuteStep={15} />
        </Field>
        <Field>
          <FieldLabel>會議結束</FieldLabel>
          <TimePicker value={end} onChange={setEnd} minuteStep={15} />
        </Field>
      </div>
    )
  },
}

/**
 * 航班時刻 — HH:mm 格式,不需要秒。
 * 對照:Google Flights / Expedia / KAYAK 時間選擇都是分鐘粒度。
 */
export const FlightDepartureTime: Story = {
  name: '航班起飛時間',
  render: () => {
    const [time, setTime] = React.useState<string>('14:35')
    return (
      <Field>
        <FieldLabel>起飛時間</FieldLabel>
        <TimePicker value={time} onChange={setTime} placeholder="請選擇起飛時間" />
      </Field>
    )
  },
}

/**
 * 營業時間 — 兩個 TimePicker 組合達成 range 語意(MVP 不內建 Range;
 * 對齊 Ant composition 思路,見 spec「為何無 Range」段)。
 */
export const ShopBusinessHours: Story = {
  name: '店家營業時間',
  render: () => {
    const [open, setOpen] = React.useState<string>('10:00')
    const [close, setClose] = React.useState<string>('22:00')
    return (
      <Field>
        <FieldLabel>營業時段</FieldLabel>
        <div className="flex items-center gap-2">
          <TimePicker value={open} onChange={setOpen} placeholder="Open" />
          <span className="text-fg-muted">→</span>
          <TimePicker value={close} onChange={setClose} placeholder="Close" />
        </div>
      </Field>
    )
  },
}

/**
 * 精確 log 時間 — 需要秒時啟用 showSeconds,format 自動升級到 HH:mm:ss。
 * 對照:DevTools timeline / Datadog event timestamp 都秒級。
 */
export const EventTimestamp: Story = {
  name: '事件發生時間',
  render: () => {
    const [time, setTime] = React.useState<string>('14:35:22')
    return (
      <Field>
        <FieldLabel>Event timestamp</FieldLabel>
        <TimePicker value={time} onChange={setTime} showSeconds clearable />
      </Field>
    )
  },
}

/**
 * 上下班 disabled 示例:半夜 0-6 點不可選(`disabledTime` 動態禁)。
 * 對照:HR 排班系統 / 打卡 App 的時段限制。
 */
export const EmployeeShiftSchedule: Story = {
  name: '員工上班時段設定',
  render: () => {
    const [clockIn, setClockIn] = React.useState<string>('09:00')
    return (
      <Field>
        <FieldLabel>上班時間(0-5 點不可選)</FieldLabel>
        <TimePicker
          value={clockIn}
          onChange={setClockIn}
          minuteStep={5}
          disabledTime={() => ({
            disabledHours: [0, 1, 2, 3, 4, 5],
          })}
        />
      </Field>
    )
  },
}

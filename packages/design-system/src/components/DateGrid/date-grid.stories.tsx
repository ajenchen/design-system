// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { zhTW } from 'date-fns/locale/zh-TW'
import type { DateRange } from 'react-day-picker'
import { DateGrid } from './date-grid'

const meta: Meta = {
  title: 'Design System/Internal/DateGrid/展示',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// Fixed local date keeps rendered states deterministic across run dates and time zones.
const STORY_TODAY = new Date(2026, 6, 15)
const storyDate = (day: number, monthOffset = 0) =>
  new Date(STORY_TODAY.getFullYear(), STORY_TODAY.getMonth() + monthOffset, day)
// Preserve the end-of-month → next-month deadline scenario without wall-clock drift.
const INLINE_TODAY = new Date(2026, 6, 31)
const INLINE_DEADLINE = new Date(2026, 7, 5)

// ── Helpers ──────────────────────────────────────────────────────────────────

const Card = ({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: React.ReactNode
}) => (
  <div className="flex flex-col gap-3 mb-10">
    <div className="flex flex-col gap-1">
      <h3 className="text-body font-bold text-foreground">{title}</h3>
      {desc && <p className="text-caption text-fg-muted max-w-[640px] leading-relaxed">{desc}</p>}
    </div>
    <div className="inline-flex bg-surface-raised border border-border rounded-lg p-4 w-fit">
      {children}
    </div>
  </div>
)

const formatDate = (d: Date) =>
  new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' }).format(d)

const formatRange = (from?: Date, to?: Date) => {
  if (!from) return '尚未選擇'
  if (!to) return `${formatDate(from)} — 選擇結束日期`
  return `${formatDate(from)} → ${formatDate(to)}`
}

// ── Stories ──────────────────────────────────────────────────────────────────

/**
 * Single mode — 生日 / 到期日等單日選擇(Google Calendar 新增事件日期、
 * Stripe 發票到期日輸入)。最常用的 mode,DatePicker 消費此模式。
 */
export const Single: Story = {
  name: '單日 — 生日 / 到期日',
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date(1995, 5, 12))
    return (
      <div>
        <Card
          title="選擇生日"
          desc="使用者設定頁填寫個人資料時的生日欄位,對標 Notion / Google Account。單日選擇,點新日取代舊選。"
        >
          <div className="flex flex-col gap-3">
            <DateGrid
              mode="single"
              selected={date}
              onSelect={setDate}
              defaultMonth={date}
              today={STORY_TODAY}
              locale={zhTW}
              autoFocus
            />
            <div className="text-caption text-fg-secondary px-1">
              已選生日:<span className="font-medium text-foreground">{date ? formatDate(date) : '尚未選擇'}</span>
            </div>
          </div>
        </Card>
      </div>
    )
  },
}

/**
 * Multiple mode — event 報名多日(Luma RSVP 活動可參加日、
 * Notion project 可用日標記)。不連續多選。
 */
export const Multiple: Story = {
  name: '多日 — 活動可參加日期',
  render: () => {
    const [dates, setDates] = useState<Date[]>([
      storyDate(8),
      storyDate(15),
      storyDate(22),
    ])
    return (
      <div>
        <Card
          title="活動可參加日期"
          desc="參考 Luma / Calendly — 受邀者勾選所有能參加的日期,主辦方彙整後決定最終日期。不連續多選,點已選日即取消。"
        >
          <div className="flex flex-col gap-3">
            <DateGrid
              mode="multiple"
              selected={dates}
              onSelect={(d) => setDates(d ?? [])}
              defaultMonth={STORY_TODAY}
              today={STORY_TODAY}
              locale={zhTW}
            />
            <div className="text-caption text-fg-secondary px-1">
              已選 <span className="font-medium text-foreground">{dates.length}</span> 天:
              <span className="ml-1 text-fg-secondary">
                {dates.length ? dates.map(formatDate).join('、') : '尚未選擇'}
              </span>
            </div>
          </div>
        </Card>
      </div>
    )
  },
}

/**
 * Range mode — 訂單日期範圍(Stripe dashboard 分析時段、
 * Vercel Analytics 報表期間、Airbnb 訂房 check-in/check-out)。
 */
export const Range: Story = {
  name: '範圍 — 分析時段 / 訂單範圍',
  render: () => {
    const [range, setRange] = useState<DateRange | undefined>({
      from: storyDate(1),
      to: storyDate(14),
    })
    return (
      <div>
        <Card
          title="營收報表時段"
          desc="參考 Stripe Dashboard / Vercel Analytics — 選擇查詢的起訖日。第一次點擊設起日,第二次點擊設迄日,中間自動填滿。"
        >
          <div className="flex flex-col gap-3">
            <DateGrid
              mode="range"
              selected={range}
              onSelect={setRange}
              defaultMonth={range?.from ?? STORY_TODAY}
              today={STORY_TODAY}
              locale={zhTW}
              numberOfMonths={2}
            />
            <div className="text-caption text-fg-secondary px-1">
              查詢範圍:<span className="font-medium text-foreground">{formatRange(range?.from, range?.to)}</span>
            </div>
          </div>
        </Card>
      </div>
    )
  },
}

/**
 * Inline widget — 直接嵌在 dashboard card 內(Linear project deadline widget、
 * Notion sidebar 行事曆小卡)。不透過 popup,頁面常駐顯示。
 */
export const Inline: Story = {
  name: '行內 — 儀表板小卡',
  render: () => {
    const [deadline, setDeadline] = useState<Date | undefined>(
      INLINE_DEADLINE,
    )
    return (
      <div>
        <Card
          title="專案截止日 widget"
          desc="參考 Linear / Height — 專案側欄的 deadline 選擇器,常駐顯示不需點開浮層。DateGrid 是 inline primitive,不自包 Popover。"
        >
          <div className="flex flex-col gap-3 w-fit">
            <div className="flex items-center justify-between px-1">
              <span className="text-caption text-fg-muted">Project deadline</span>
              <span className="text-caption font-medium text-foreground">
                {deadline ? formatDate(deadline) : '未設定'}
              </span>
            </div>
            <DateGrid
              mode="single"
              selected={deadline}
              onSelect={setDeadline}
              defaultMonth={deadline ?? INLINE_TODAY}
              today={INLINE_TODAY}
              locale={zhTW}
              disabled={{ before: INLINE_TODAY }}
            />
          </div>
        </Card>
      </div>
    )
  },
}

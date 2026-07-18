// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { Calendar, type CalendarEvent } from './calendar'

const meta: Meta<typeof Calendar> = {
  title: 'Design System/Components/Calendar/展示',
  component: Calendar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '事件檢視 canvas(月 view MVP)。對齊 Notion Calendar / Google Calendar;與 DatePicker(選日期 form control)**職責不同**,見 spec。',
      },
    },
  },
}
export default meta

type Story = StoryObj<typeof Calendar>

// ── 真實業務情境 ─────────────────────────────────────────────────────

// 釘固定日期(2026-07-07 修 VR flake;2026-07-13 補傳 defaultReferenceDate 使 pin 真正生效):
// 只把 now 用來組事件日期字串「不會」pin 顯示月 —— Calendar 顯示月預設取即時 new Date()(tsx),
// 故必須把 now 傳給 defaultReferenceDate 才真正釘住顯示月(下方各 instance 已補)。
// 註:today 標記仍取真實日期(tsx 內 new Date(),無 today override prop)→ 落在被釘 7 月內時仍隨換日移格,屬已知殘留。
const now = new Date(2026, 6, 15)
const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')

/**
 * 團隊行事曆 — Notion / Google Calendar 替代品情境
 * 本月會議 / deadline / 休假,多事件類型用 color 區隔。
 */
export const TeamCalendar: Story = {
  name: '團隊行事曆',
  render: () => {
    const events: CalendarEvent[] = [
      { id: '1', title: 'Design review', start: `${thisMonth}-05`, end: `${thisMonth}-05`, color: 'blue' },
      { id: '2', title: 'Sprint planning', start: `${thisMonth}-08`, end: `${thisMonth}-08`, color: 'blue' },
      { id: '3', title: 'Project Orion deadline', start: `${thisMonth}-12`, end: `${thisMonth}-12`, color: 'red' },
      { id: '4', title: '1:1 w/ Sarah', start: `${thisMonth}-12`, end: `${thisMonth}-12`, color: 'purple' },
      { id: '5', title: 'Standup', start: `${thisMonth}-15`, end: `${thisMonth}-15`, color: 'blue' },
      { id: '6', title: 'Q2 OKR review', start: `${thisMonth}-18`, end: `${thisMonth}-18`, color: 'green' },
      { id: '7', title: 'Alex vacation', start: `${thisMonth}-20`, end: `${thisMonth}-22`, color: 'yellow', allDay: true },
      { id: '8', title: 'Customer meeting', start: `${thisMonth}-25`, end: `${thisMonth}-25`, color: 'orange' },
    ]
    return (
      <div className="h-screen p-4 bg-canvas">
        <Calendar
          defaultReferenceDate={now}
          events={events}
          onEventClick={(e) => alert(`點了事件:${e.title}`)}
          onDateClick={() => { /* demo:實際 app 在此開「當日新增事件」面板 */ }}
          onCreateEvent={() => alert('開啟新事件對話框')}
        />
      </div>
    )
  },
}

/**
 * 內容發佈排程 — Blog / 影片發布月曆
 */
export const ContentPublishingSchedule: Story = {
  name: '內容發佈月曆',
  render: () => {
    const events: CalendarEvent[] = [
      { id: 'p1', title: '週五 newsletter', start: `${thisMonth}-02`, end: `${thisMonth}-02`, color: 'blue' },
      { id: 'p2', title: 'Blog: 設計系統 v2', start: `${thisMonth}-07`, end: `${thisMonth}-07`, color: 'purple' },
      { id: 'p3', title: 'YouTube: tutorial ep 3', start: `${thisMonth}-10`, end: `${thisMonth}-10`, color: 'red' },
      { id: 'p4', title: 'Podcast: interview', start: `${thisMonth}-17`, end: `${thisMonth}-17`, color: 'green' },
      { id: 'p5', title: 'Product announcement', start: `${thisMonth}-28`, end: `${thisMonth}-28`, color: 'orange' },
    ]
    return (
      <div className="h-screen p-4 bg-canvas">
        <Calendar events={events} defaultReferenceDate={now} onCreateEvent={() => alert('排內容')} />
      </div>
    )
  },
}

/**
 * 空行事曆 — 無事件時 calendar 本身是空 canvas,不強制顯示 empty state
 */
export const EmptyCalendar: Story = {
  name: '空行事曆',
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <Calendar events={[]} defaultReferenceDate={now} onCreateEvent={() => alert('加第一個事件')} />
    </div>
  ),
}

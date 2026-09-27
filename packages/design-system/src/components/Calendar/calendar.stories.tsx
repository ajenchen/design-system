// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { Calendar, type CalendarEvent } from './calendar'

const meta: Meta<typeof Calendar> = {
  title: 'Design System/Components/Calendar/展示',
  tags: ['autodocs'],
  component: Calendar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '以月檢視瀏覽與安排多筆事件，適合團隊行程、內容排程與資源規劃。若使用者只需在表單中選一個日期，應使用 DatePicker；Calendar 不是日期輸入欄位。',
      },
    },
  },
}
export default meta

type Story = StoryObj<typeof Calendar>
const customTileActivated = fn()
// 日期格 / 事件方塊各自二擇一:可點就接回調(型別層必填),不可點就寫 readOnlyDates / readOnlyEvents
//(calendar.spec.md「日期格與事件方塊:可點或唯讀」;M23(f):不拿「有沒有傳」當渲染閘)。
// 可點的示範一律給**看得見的反應**,不給空函式 —— 空函式就是「點了沒反應」。真實 app 在這裡開「當日新增事件」面板 / 事件詳情;
// 示範用 alert 代替(與本檔 onCreateEvent 同一種示範手法)。
const demoAddOnDate = (date: Date) => alert(`在 ${date.getMonth() + 1}/${date.getDate()} 新增事件`)
const demoOpenEvent = (event: CalendarEvent) => alert(`點了事件:${event.title}`)

// ── 真實業務情境 ─────────────────────────────────────────────────────

// 視覺基線同時釘住顯示月與 today SSOT，避免跨月/換日造成 snapshot 漂移。
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
          today={now}
          events={events}
          onEventClick={demoOpenEvent}
          onDateClick={demoAddOnDate}
          onCreateEvent={() => alert('開啟新事件對話框')}
        />
      </div>
    )
  },
}

/**
 * 內容發佈排程 — Blog / 影片發布月曆
 * 排內容走右上角「排內容」,日子本身不能點來新增 → `readOnlyDates`(格子不亮、日期數字不是按鈕);
 * 已排好的內容點得開 → `onEventClick`。
 */
export const ContentPublishingSchedule: Story = {
  name: '內容發佈月曆',
  // 示範焦點是本則的主題(story-rules「示範 = 滑鼠使用者」):不放掉 play 造出的鍵盤焦點
  parameters: { demoFocus: 'keep' },
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
        <Calendar
          events={events}
          defaultReferenceDate={now}
          today={now}
          renderEventTile={(event) => <span className="block truncate rounded-md bg-secondary px-1.5 py-0.5 text-caption text-foreground">{event.title}</span>}
          onEventClick={customTileActivated}
          readOnlyDates
          onCreateEvent={() => alert('排內容')}
        />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    customTileActivated.mockClear()
    const canvas = within(canvasElement)
    // readOnlyDates:日期數字不是按鈕;格子本身是格陣的鍵盤停靠點(名字 = 日期 + 事件數),Tab 進來停今天(7/15)
    await expect(canvas.queryAllByRole('button', { name: /^2026-07-\d{2},/ })).toHaveLength(0)
    await expect(canvas.getByRole('gridcell', { name: '2026-07-15,0 個事件' })).toHaveAttribute('tabindex', '0')
    const tile = await canvas.findByRole('button', { name: '事件:週五 newsletter' })
    tile.focus()
    await userEvent.keyboard('{Enter}')
    await expect(customTileActivated).toHaveBeenCalledTimes(1)
  },
}

/**
 * 空行事曆 — 無事件時 calendar 本身是空 canvas,不強制顯示 empty state
 * 第一個事件從右上角「加第一個事件」建立,日子本身不能點來新增 → `readOnlyDates`;之後排進來的事件點得開 → `onEventClick`。
 */
export const EmptyCalendar: Story = {
  name: '空行事曆',
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <Calendar
        events={[]}
        defaultReferenceDate={now}
        today={now}
        onEventClick={demoOpenEvent}
        readOnlyDates
        onCreateEvent={() => alert('加第一個事件')}
      />
    </div>
  ),
}

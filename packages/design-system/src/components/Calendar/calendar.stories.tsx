// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { Calendar, type CalendarEvent } from './calendar'
import { CalendarDemo } from './_calendar-demo'
import { Tag } from '@/design-system/components/Tag/tag'

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
// 可點的示範一律給**真的結果**(CalendarDemo:點事件開 Popover、點日期 / 新事件開「新增事件」對話框、送出跳 Toast),不給空函式。

// ── 真實業務情境 ─────────────────────────────────────────────────────

// 視覺基線同時釘住顯示月與 today SSOT，避免跨月/換日造成 snapshot 漂移。
const now = new Date(2026, 6, 15)
const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
// 讀者看的情境都是中文產品:月份標題 / 星期名照中文排(元件的 locale 預設 2026-11-24 起是 'zh-TW'(calendar.tsx `locale = DEFAULT_DATE_LOCALE`),之前是 'en-US';
// 2026-11-18 前沒傳,畫面是「July 2026」「Sun–Sat」配中文介面 —— 稽核 A113,AGENTS.md「單一檔案不中英夾雜」)。
// test-only 的鍵盤夾具不是給人看的,照元件預設。
const LOCALE = 'zh-TW'
// 一格超過 3 筆時的計數文字跟著中文情境(元件預設 `+N more`,calendar.tsx `moreLabel`;2026-11-21 前元件寫死英文、換不掉)
const MORE_LABEL = (count: number) => `還有 ${count} 個事件`

/**
 * 團隊行事曆 — Notion / Google Calendar 替代品情境
 * 本月會議 / deadline / 休假,多事件類型用 color 區隔。
 */
export const TeamCalendar: Story = {
  name: '團隊行事曆',
  render: () => {
    const events: CalendarEvent[] = [
      { id: '1', title: '設計審查', start: `${thisMonth}-05`, end: `${thisMonth}-05`, color: 'blue' },
      { id: '2', title: '衝刺規劃會議', start: `${thisMonth}-08`, end: `${thisMonth}-08`, color: 'blue' },
      { id: '3', title: 'Orion 專案截止', start: `${thisMonth}-12`, end: `${thisMonth}-12`, color: 'red' },
      { id: '4', title: '與 Sarah 一對一', start: `${thisMonth}-12`, end: `${thisMonth}-12`, color: 'purple' },
      { id: '5', title: '每日站會', start: `${thisMonth}-15`, end: `${thisMonth}-15`, color: 'blue' },
      { id: '6', title: 'Q2 OKR 檢討', start: `${thisMonth}-18`, end: `${thisMonth}-18`, color: 'green' },
      { id: '7', title: 'Alex 休假', start: `${thisMonth}-20`, end: `${thisMonth}-22`, color: 'yellow', allDay: true },
      { id: '8', title: '客戶會議', start: `${thisMonth}-25`, end: `${thisMonth}-25`, color: 'orange' },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
        <CalendarDemo defaultReferenceDate={now} today={now} events={events} locale={LOCALE} moreLabel={MORE_LABEL} />
      </div>
    )
  },
}

/**
 * 產品上線週 — 上線日一天塞滿 5 件事(發版、客服待命、上線公告、監控輪值、慶功)。
 * 每格最多畫 3 筆,超出的以計數文字提示(這裡傳中文「還有 N 個事件」,元件預設「+N more」);這一則讓它在畫面上看得到。
 */
export const LaunchWeek: Story = {
  name: '產品上線週',
  render: () => {
    const events: CalendarEvent[] = [
      { id: 'l1', title: '程式碼凍結', start: `${thisMonth}-13`, end: `${thisMonth}-13`, color: 'red' },
      { id: 'l2', title: '發布 v2.0', start: `${thisMonth}-15`, end: `${thisMonth}-15`, color: 'blue' },
      { id: 'l3', title: '客服待命(全天)', start: `${thisMonth}-15`, end: `${thisMonth}-15`, color: 'yellow', allDay: true },
      { id: 'l4', title: '上線公告 10:00', start: `${thisMonth}-15`, end: `${thisMonth}-15`, color: 'green' },
      { id: 'l5', title: '監控輪值 14:00', start: `${thisMonth}-15`, end: `${thisMonth}-15`, color: 'purple' },
      { id: 'l6', title: '慶功 18:30', start: `${thisMonth}-15`, end: `${thisMonth}-15`, color: 'orange' },
      { id: 'l7', title: '上線檢討會', start: `${thisMonth}-17`, end: `${thisMonth}-17`, color: 'blue' },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
        <CalendarDemo defaultReferenceDate={now} today={now} events={events} locale={LOCALE} moreLabel={MORE_LABEL} />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    // 7/15 有 5 件事:只畫前 3 筆(全天事件排最前),其餘 2 筆以「還有 2 個事件」(moreLabel)提示、不進 DOM
    const canvas = within(canvasElement)
    await expect(canvas.getByText('還有 2 個事件')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: '事件:慶功 18:30' })).toBeNull()
  },
}

/**
 * 內容發佈排程 — Blog / 影片發布月曆
 * 排內容走右上角「新事件」,日子本身不能點來新增 → `readOnlyDates`(格子不亮、日期數字不是按鈕);
 * 已排好的內容點得開 → `onEventClick`。
 */
export const ContentPublishingSchedule: Story = {
  name: '內容發佈月曆',
  render: () => {
    // 五種內容各一色;只用字與底色對比 ≥ 4.5 的色相(green / orange 事件色的字對比 3.71 / 3.82,不到 WCAG AA 4.5;色票本身怎麼改是 tokens 的題目,不在範例裡處理)
    const events: CalendarEvent[] = [
      { id: 'p1', title: '週五電子報', start: `${thisMonth}-02`, end: `${thisMonth}-02`, color: 'blue' },
      { id: 'p2', title: '部落格:設計系統 v2', start: `${thisMonth}-07`, end: `${thisMonth}-07`, color: 'purple' },
      { id: 'p3', title: 'YouTube:教學影片第 3 集', start: `${thisMonth}-10`, end: `${thisMonth}-10`, color: 'red' },
      { id: 'p4', title: 'Podcast:來賓訪談', start: `${thisMonth}-17`, end: `${thisMonth}-17`, color: 'turquoise' },
      { id: 'p5', title: '產品發表', start: `${thisMonth}-28`, end: `${thisMonth}-28`, color: 'magenta' },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
        <CalendarDemo events={events} defaultReferenceDate={now} today={now} locale={LOCALE} moreLabel={MORE_LABEL} readOnlyDates />
      </div>
    )
  },
}

// 日期格唯讀 × 自訂事件方塊的鍵盤契約(test-only 夾具,原本寫在「內容發佈月曆」的 play):日期數字不是按鈕、格子本身是格陣的鍵盤停靠點;
// `renderEventTile` 的外層由元件擁有按鈕角色與 Enter 觸發(calendar.spec.md「renderEventTile 的鍵盤責任歸屬」)。story-demo-focus 閘載入每支 story 並跑 play,斷言不成立就紅。
export const ReadOnlyDatesCustomTileKeyboard: Story = {
  name: '唯讀日期 × 自訂事件方塊鍵盤',
  tags: ['test-only'],
  // @example-basis: packages/design-system/src/components/Calendar/calendar.spec.md:479「Enter/Space activation」
  parameters: { demoFocus: 'keep' },
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <Calendar
        events={[{ id: 'p1', title: '週五 newsletter', start: `${thisMonth}-02`, end: `${thisMonth}-02`, color: 'blue' }]}
        defaultReferenceDate={now}
        today={now}
        renderEventTile={(event) => <Tag size="sm">{event.title}</Tag>}
        onEventClick={customTileActivated}
        readOnlyDates
        onCreateEvent={fn()}
      />
    </div>
  ),
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
 * 第一個事件從右上角「新事件」建立,日子本身不能點來新增 → `readOnlyDates`;之後排進來的事件點得開 → `onEventClick`。
 */
export const EmptyCalendar: Story = {
  name: '空行事曆',
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <CalendarDemo events={[]} defaultReferenceDate={now} today={now} locale={LOCALE} moreLabel={MORE_LABEL} readOnlyDates />
    </div>
  ),
}

// 點格內空白也帶鍵盤位置(calendar.spec.md「Cell 規則 › 命中區」):
// 滑鼠點日期格的空白處(不是日期數字鈕、不是事件方塊)後,鍵盤停靠點與焦點都搬到這一天的日期鈕 ——
// 之後方向鍵從這一格出發,而不是從上一次鍵盤停的那一格。test-only:沒有既有月曆瀏覽器閘,以 play 當閘
// (story-demo-focus 閘會載入每支 story 並跑 play,斷言不成立就紅);對照組 = 先把停靠點放在別的日子,證明真的搬過來。
export const CellBlankClickMovesKeyboardStop: Story = {
  name: '點格內空白帶鍵盤位置',
  tags: ['test-only'],
  // @example-basis: packages/design-system/src/components/Calendar/calendar.spec.md:220「點格內空白處也把鍵盤位置帶過來」
  parameters: { demoFocus: 'keep' },
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <Calendar defaultReferenceDate={now} today={now} events={[]} onDateClick={fn()} onEventClick={fn()} onCreateEvent={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const cells = Array.from(canvasElement.querySelectorAll<HTMLElement>('[role="gridcell"]'))
    const dayOf = (c: HTMLElement) => c.querySelector('button')?.textContent?.trim()
    // 當月 22 號(上月末 / 下月初的非當月格都到不了 22,第一個就是當月)
    const cell = cells.find((c) => dayOf(c) === '22')
    if (!cell) throw new Error('找不到 22 號的格')
    const dateButton = cell.querySelector<HTMLButtonElement>('button')
    if (!dateButton) throw new Error('22 號的格沒有日期鈕')
    // 對照組:先把鍵盤停靠點放在別的日子
    const other = cells.find((c) => dayOf(c) === '1' && c !== cell)
    const otherButton = other?.querySelector<HTMLButtonElement>('button')
    if (!otherButton) throw new Error('找不到 1 號的日期鈕')
    otherButton.focus()
    await expect(document.activeElement).toBe(otherButton)
    await expect(dateButton).toHaveAttribute('tabindex', '-1')
    // 點格子本身(user-event 的 click 落在格子元素、不是日期鈕;格內沒有事件方塊)
    await userEvent.click(cell)
    await expect(document.activeElement).toBe(dateButton)
    await expect(dateButton).toHaveAttribute('tabindex', '0')
    await expect(otherButton).toHaveAttribute('tabindex', '-1')
  },
}

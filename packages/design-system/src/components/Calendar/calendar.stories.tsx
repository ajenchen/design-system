// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { Calendar, type CalendarEvent, type CalendarLabels } from './calendar'
import { CalendarDemo } from './_calendar-demo'
import { Tag } from '@/design-system/components/Tag/tag'
import { DataTable, type DataTableColumnDef } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging

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

/**
 * 客服排班 — 只看工作日(`hideWeekends`)
 * 客服中心週一到週五有人值班,週末轉給外包待命;排班主管只看工作日,週六、週日兩欄不畫,一週五欄、每格比較寬。
 */
export const CustomerSupportWeekdays: Story = {
  name: '客服排班(只看工作日)',
  parameters: {
    docs: {
      description: {
        story:
          '`hideWeekends`:週末 = 語系的週末(zh-TW 週六、週日),那兩欄與星期列一起拿掉;落在週末的事件(這裡的「週末外包待命」)不畫。方向鍵、Home / End 跳過被藏的日子,從週五按 → 到下週一。',
      },
    },
  },
  render: () => {
    const events: CalendarEvent[] = [
      { id: 's1', title: '早班:王小明、陳怡君', start: `${thisMonth}-06`, end: `${thisMonth}-06`, color: 'blue' },
      { id: 's2', title: '晚班:林志豪', start: `${thisMonth}-06`, end: `${thisMonth}-06`, color: 'purple' },
      { id: 's3', title: '新人帶班:黃雅婷', start: `${thisMonth}-08`, end: `${thisMonth}-08`, color: 'green' },
      { id: 's4', title: '早班:張家豪', start: `${thisMonth}-13`, end: `${thisMonth}-13`, color: 'blue' },
      { id: 's5', title: '客訴週報', start: `${thisMonth}-17`, end: `${thisMonth}-17`, color: 'orange' },
      { id: 's6', title: '週末外包待命', start: `${thisMonth}-18`, end: `${thisMonth}-18`, color: 'turquoise' },
      { id: 's7', title: '晚班:陳怡君', start: `${thisMonth}-21`, end: `${thisMonth}-21`, color: 'purple' },
      { id: 's8', title: '值班表檢討', start: `${thisMonth}-31`, end: `${thisMonth}-31`, color: 'orange' },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
        <CalendarDemo defaultReferenceDate={now} today={now} events={events} locale={LOCALE} moreLabel={MORE_LABEL} noun="班表" hideWeekends />
      </div>
    )
  },
}

/**
 * 生產排程 — 用週次溝通(`showWeekNumbers`)
 * 工廠的出貨與保養都說「第 29 週」:左側週數欄讓排程人員對得上 ERP 的週次。
 */
export const ManufacturingWeekNumbers: Story = {
  name: '生產排程(週次)',
  parameters: {
    docs: {
      description: {
        story:
          '`showWeekNumbers`:左側一欄週數,寬 = 2 × 格子內距 + 最寬的兩位數;週數怎麼算跟語系(zh-TW 週日起、含 1 月 1 日那一週是第 1 週;en-GB 照 ISO,年底那一週是第 53 週)。週數格不是按鈕、不進 Tab 順序,欄頭「週」可經 `labels.weekNumberHeader` 換字。',
      },
    },
  },
  render: () => {
    const events: CalendarEvent[] = [
      { id: 'm1', title: '二號產線模具保養', start: `${thisMonth}-06`, end: `${thisMonth}-06`, color: 'yellow' },
      { id: 'm2', title: '鋁板原料到貨', start: `${thisMonth}-09`, end: `${thisMonth}-09`, color: 'turquoise' },
      { id: 'm3', title: '出貨:宏達工業 PO-2607', start: `${thisMonth}-14`, end: `${thisMonth}-14`, color: 'blue' },
      { id: 'm4', title: '品保抽檢', start: `${thisMonth}-16`, end: `${thisMonth}-16`, color: 'green' },
      { id: 'm5', title: '出貨:禾豐電子 PO-2611', start: `${thisMonth}-23`, end: `${thisMonth}-23`, color: 'blue' },
      { id: 'm6', title: '月底盤點', start: `${thisMonth}-30`, end: `${thisMonth}-30`, color: 'orange' },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
        <CalendarDemo defaultReferenceDate={now} today={now} events={events} locale={LOCALE} moreLabel={MORE_LABEL} noun="排程" showWeekNumbers />
      </div>
    )
  },
}

/**
 * 切換月份時載入 — 事件還在向後端要(`loading`)
 * 團隊行事曆按 › 換到下一個月,那個月的事件還沒回來:格子與日期照畫,每格一條骨架。
 */
export const LoadingWhileSwitchingMonth: Story = {
  name: '切換月份時載入',
  parameters: {
    docs: {
      description: {
        story:
          '`loading`:工具列、星期列與日期數字照畫,每格的事件區換成一條與事件列同高的骨架(不畫事件與「+N」),格陣標 `aria-busy`。載入中仍可點空白新增、用鍵盤走格;日期的讀屏名稱先不念筆數。載入失敗由產品在月曆外放 Alert,元件不內建。',
      },
    },
  },
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <CalendarDemo defaultReferenceDate={now} today={now} events={[]} locale={LOCALE} moreLabel={MORE_LABEL} loading />
    </div>
  ),
}

// 分割畫面:左邊是這次改版的工作項目(DataTable,同 rating.stories.tsx「商品列表平均分」的精簡表格),右側欄是同一份工作的月曆
interface ReleaseTask { id: string; title: string; owner: string; due: string }
const releaseTasks: ReleaseTask[] = [
  { id: 't1', title: '結帳頁改版設計定稿', owner: '黃雅婷', due: '7月10日' },
  { id: 't2', title: '金流串接測試', owner: '張家豪', due: '7月17日' },
  { id: 't3', title: '客服常見問答更新', owner: '陳怡君', due: '7月22日' },
  { id: 't4', title: '結帳頁改版上線', owner: '王小明', due: '7月28日' },
]
const releaseTaskColumns: DataTableColumnDef<ReleaseTask>[] = [
  { accessorKey: 'title', header: '工作項目', meta: { width: 240 } },
  { accessorKey: 'owner', header: '負責人', meta: { width: 120 } },
  { accessorKey: 'due', header: '截止日', meta: { width: 120 } },
]

/**
 * 分割畫面側欄 — 窄寬度
 * 專案頁左邊是工作項目、右邊側欄放同一份工作的月曆;側欄窄,欄寬不到 60,月曆只縮內容、不換版面。
 */
export const SidePanelNarrow: Story = {
  name: '分割畫面側欄(窄寬)',
  parameters: {
    docs: {
      description: {
        story:
          '容器變窄時只縮內容、不換版面(桌機 RWD):欄寬 ≤ 60 時星期縮成一個字(「日」「一」)、每月 1 號只顯示「1」;斷點看的是月曆自己的欄寬,不是視窗寬。讀屏名稱不受影響(仍念完整日期)。',
      },
    },
  },
  render: () => {
    const events: CalendarEvent[] = [
      { id: 'n1', title: '設計定稿', start: `${thisMonth}-10`, end: `${thisMonth}-10`, color: 'purple' },
      { id: 'n2', title: '金流測試', start: `${thisMonth}-17`, end: `${thisMonth}-17`, color: 'blue' },
      { id: 'n3', title: '問答更新', start: `${thisMonth}-22`, end: `${thisMonth}-22`, color: 'green' },
      { id: 'n4', title: '改版上線', start: `${thisMonth}-28`, end: `${thisMonth}-28`, color: 'red' },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas flex gap-[var(--layout-space-loose)]">
        <div className="flex-1 min-w-0">
          <DataTable columns={releaseTaskColumns} data={releaseTasks} getRowId={(r) => r.id} maxHeight="none" />
        </div>
        {/* 側欄 400:月曆欄寬 (400 − 外框 2) ÷ 7 ≈ 56.9 ≤ 60 → 窄;工具列的「2026年7月」仍放得下 */}
        <aside aria-label="本月時程" className="w-[400px] shrink-0">
          <CalendarDemo defaultReferenceDate={now} today={now} events={events} locale={LOCALE} moreLabel={MORE_LABEL} />
        </aside>
      </div>
    )
  },
}

// 日期格唯讀 × 自訂事件方塊的鍵盤契約(test-only 夾具,原本寫在「內容發佈月曆」的 play):日期數字不是按鈕、格子本身是格陣的鍵盤停靠點;
// `renderEventTile` 的外層由元件擁有按鈕角色與 Enter 觸發(calendar.spec.md「renderEventTile 的鍵盤責任歸屬」)。story-demo-focus 閘載入每支 story 並跑 play,斷言不成立就紅。
export const ReadOnlyDatesCustomTileKeyboard: Story = {
  name: '唯讀日期 × 自訂事件方塊鍵盤',
  tags: ['test-only'],
  // @example-basis: packages/design-system/src/components/Calendar/calendar.spec.md:495「Enter/Space activation」
  parameters: { demoFocus: 'keep' },
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <Calendar
        events={[{ id: 'p1', title: '週五電子報', start: `${thisMonth}-02`, end: `${thisMonth}-02`, color: 'blue' }]}
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
    // readOnlyDates:日期數字不是按鈕;格子本身是格陣的鍵盤停靠點,Tab 進來停今天(7/15)。
    // 格子的名稱由內容來(calendar.spec.md「A11y 預設」):完整日期 + 筆數,今天加「今天,」;這天沒有事件,所以名稱就到筆數為止
    await expect(canvas.queryAllByRole('button', { name: /^(今天,)?2026年7月\d{1,2}日/ })).toHaveLength(0)
    const todayCell = canvas.getByRole('gridcell', { name: '今天,2026年7月15日 星期三,0 個事件' })
    await expect(todayCell).toHaveAttribute('tabindex', '0')
    await expect(todayCell).toHaveAttribute('aria-current', 'date')
    const tile = await canvas.findByRole('button', { name: '事件:週五電子報' })
    tile.focus()
    await userEvent.keyboard('{Enter}')
    await expect(customTileActivated).toHaveBeenCalledTimes(1)
  },
}

// 英文產品覆寫讀屏字串(test-only 夾具):`labels` 逐鍵換掉 DS 預設的繁中(calendar.spec.md「A11y 預設」字串可覆寫),
// 已有個別參數的字串(‹ › / 月份導覽 / 今天 / 新事件)照用那些參數。play 斷言覆寫真的生效、沒有一句預設中文漏出來;
// scripts/calendar-month-invariant.mjs 也開這一則量(對照組:把名稱改回預設中文 → 紅)。
const ENGLISH_LABELS: CalendarLabels = {
  grid: (monthTitle) => `Calendar, ${monthTitle}`,
  day: (fullDate, count) => `${fullDate}, ${count} ${count === 1 ? 'event' : 'events'}`,
  todayPrefix: 'Today, ',
  weekNumberHeader: 'W',
  weekNumber: (week) => `Week ${week}`,
}
export const EnglishLabelsOverride: Story = {
  name: '英文讀屏字串覆寫',
  tags: ['test-only'],
  // @example-basis: packages/design-system/src/components/Calendar/calendar.spec.md:476「字串可覆寫」
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <Calendar
        defaultReferenceDate={now}
        today={now}
        events={[]}
        locale="en-US"
        labels={ENGLISH_LABELS}
        prevAriaLabel="Previous month"
        nextAriaLabel="Next month"
        navAriaLabel="Month navigation"
        todayLabel="Today"
        createLabel="New event"
        onDateClick={fn()}
        onEventClick={fn()}
        onCreateEvent={fn()}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('grid', { name: 'Calendar, July 2026' })).toBeInTheDocument()
    const today = canvas.getByRole('button', { name: 'Today, Wednesday, July 15, 2026, 0 events' })
    await expect(today).toHaveAttribute('aria-current', 'date')
    await expect(canvas.getByRole('button', { name: 'Thursday, July 16, 2026, 0 events' })).not.toHaveAttribute('aria-current')
    // 預設的繁中一句都不出現(格陣名稱、日期名稱、今天前綴)
    await expect(canvas.queryAllByRole('grid', { name: /月行事曆/ })).toHaveLength(0)
    await expect(canvas.queryAllByRole('button', { name: /今天,|個事件|星期/ })).toHaveLength(0)
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
// 之後方向鍵從這一格出發,而不是從上一次鍵盤停的那一格。test-only:以 play 當閘
// (story-demo-focus 閘會載入每支 story 並跑 play,斷言不成立就紅);對照組 = 先把停靠點放在別的日子,證明真的搬過來。
// 點日期鈕本身、按「今天」搬停靠點兩條由 scripts/calendar-month-invariant.mjs 量(那支同時量月格的版面)。
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
    // 找格子用日期停靠點的屬性 data-calendar-day(不比對畫面上的字:每月 1 號顯示「7月1日」,calendar.spec.md「Cell 規則」Q15(定))
    const dayButton = (iso: string) => canvasElement.querySelector<HTMLButtonElement>(`button[data-calendar-day="${iso}"]`)
    const dateButton = dayButton(`${thisMonth}-22`)
    const cell = dateButton?.closest<HTMLElement>('[role="gridcell"]')
    if (!dateButton || !cell) throw new Error('找不到 22 號的格或日期鈕')
    // 對照組:先把鍵盤停靠點放在別的日子(當月 1 號)
    const otherButton = dayButton(`${thisMonth}-01`)
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

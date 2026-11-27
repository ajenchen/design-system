// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Calendar, type CalendarEvent, type CalendarLabels } from './calendar'
import { CalendarDemo } from './_calendar-demo'
import { Tag } from '@/design-system/components/Tag/tag'
import { Button } from '@/design-system/components/Button/button'
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
// 日期格二擇一、事件方塊三擇一:可點就接回調(型別層必填;事件方塊是 eventDetail 內建詳情或 onEventClick),不可點就寫 readOnlyDates / readOnlyEvents
//(calendar.spec.md「日期格與事件方塊:可點或唯讀」;M23(f):不拿「有沒有傳」當渲染閘)。
// 可點的示範一律給**真的結果**(CalendarDemo:點事件開內建詳情、點日期 / 新事件開「新增事件」對話框、送出跳 Toast),不給空函式。

// ── 真實業務情境 ─────────────────────────────────────────────────────

// 視覺基線同時釘住顯示月與 today SSOT，避免跨月/換日造成 snapshot 漂移。
const now = new Date(2026, 6, 15)
const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
const nextMonth = nextMonthStart.getFullYear() + '-' + String(nextMonthStart.getMonth() + 1).padStart(2, '0')
// 事件資料照 calendar.spec.md「資料語意」:end 一律不含 —— 全天事件寫到隔天(7/20–7/22 三天 = start 20、end 23),有時段的寫真的時間;
// 只有日期、start = end 的「含」寫法會被當成零長度並在開發期警告(scripts/calendar-render-contract-invariant.mjs 載入每則範例,有一句 [Calendar] 警告就紅)。
// 讀者看的情境都是中文產品:月份標題 / 星期名照中文排(元件的 locale 預設 2026-11-24 起是 'zh-TW'(calendar.tsx `locale = DEFAULT_DATE_LOCALE`),之前是 'en-US';
// 2026-11-18 前沒傳,畫面是「July 2026」「Sun–Sat」配中文介面 —— 稽核 A113,AGENTS.md「單一檔案不中英夾雜」)。
// test-only 的鍵盤夾具不是給人看的,照元件預設。
const LOCALE = 'zh-TW'

/**
 * 團隊行事曆 — Notion / Google Calendar 替代品情境
 * 本月會議 / deadline / 休假,多事件類型用 color 區隔。
 */
export const TeamCalendar: Story = {
  name: '團隊行事曆',
  parameters: {
    docs: {
      description: {
        story:
          '會議、截止與休假排在同一個月曆:有時段的事件是一列「色條 + 開始時間 + 標題」(無底),全天與跨日事件是淡底長條(Alex 休假 7/20–7/22)。顏色代表類別。7/3 的公司創立紀念日是單筆唯讀(`readOnly`):全公司的假日不屬於任何類別,用中性灰(`neutral`);它只是標記、沒有詳情可開,所以不是按鈕、滑過不亮、點了什麼都不發生(也不會在那天新增)。其他事件點開是內建詳情(`eventDetail`):標題、時間、全天、地點、說明、類別都能就地改,改了寫回月曆;右上「⋯」收「刪除」。',
      },
    },
  },
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <CalendarDemo defaultReferenceDate={now} today={now} events={teamEvents} locale={LOCALE} categories={TEAM_CATEGORIES} />
    </div>
  ),
}

// 團隊行事曆的類別(eventDetail.categories:{ id, name, color };詳情「類別」欄 = 類別名 Tag,選了類別事件顏色跟著換)【COLORFIELD(定)】
const TEAM_CATEGORIES = [
  { id: 'meeting', name: '內部會議', color: 'blue' },
  { id: 'deadline', name: '專案截止', color: 'red' },
  { id: 'one-on-one', name: '一對一', color: 'purple' },
  { id: 'review', name: '目標檢討', color: 'green' },
  { id: 'leave', name: '休假', color: 'yellow' },
  { id: 'customer', name: '客戶會議', color: 'orange' },
] as const satisfies readonly { id: string; name: string; color: CalendarEvent['color'] }[]

const teamEvents: CalendarEvent[] = [
  // 公司假日:團隊月曆裡只是標記、沒有詳情可開 → 單筆唯讀(calendar.spec.md「日期格與事件方塊:可點或唯讀」單筆事件那一列);
  // 全公司的假日不屬於任何類別 → 中性灰 neutral(calendar.spec.md「事件的兩種長相」neutral 那條)
  { id: '0', title: '公司創立紀念日', start: `${thisMonth}-03`, end: `${thisMonth}-04`, color: 'neutral', readOnly: true },
  { id: '1', title: '設計審查', start: `${thisMonth}-05T10:00`, end: `${thisMonth}-05T11:00`, color: 'blue', categoryId: 'meeting', location: '台北辦公室 3F 大會議室', description: '結帳頁改版第二輪:確認信用卡分期的金額顯示與錯誤訊息。' },
  { id: '2', title: '衝刺規劃會議', start: `${thisMonth}-08T14:00`, end: `${thisMonth}-08T15:30`, color: 'blue', categoryId: 'meeting', location: 'Google Meet' },
  // 截止是一個時刻(有時段的零長度:畫在那一天,不警告)
  { id: '3', title: 'Orion 專案截止', start: `${thisMonth}-12T18:00`, end: `${thisMonth}-12T18:00`, color: 'red', categoryId: 'deadline' },
  { id: '4', title: '與 Sarah 一對一', start: `${thisMonth}-12T10:00`, end: `${thisMonth}-12T10:30`, color: 'purple', categoryId: 'one-on-one', location: '小會議室 B' },
  { id: '5', title: '每日站會', start: `${thisMonth}-15T09:30`, end: `${thisMonth}-15T09:45`, color: 'blue', categoryId: 'meeting', location: 'Slack 語音頻道' },
  { id: '6', title: 'Q2 OKR 檢討', start: `${thisMonth}-18T14:00`, end: `${thisMonth}-18T16:00`, color: 'green', categoryId: 'review', location: '台北辦公室 3F 大會議室', description: '各組回顧 Q2 關鍵結果的達成率,並提出 Q3 的調整。' },
  // 休假 7/20–7/22 三天:end 不含 → 23(一條橫跨三格的長條)
  { id: '7', title: 'Alex 休假', start: `${thisMonth}-20`, end: `${thisMonth}-23`, color: 'yellow', allDay: true, categoryId: 'leave' },
  { id: '8', title: '客戶會議', start: `${thisMonth}-25T15:00`, end: `${thisMonth}-25T16:00`, color: 'orange', categoryId: 'customer', location: '宏達工業 新竹廠' },
]

/**
 * 團隊行事曆:共享進來的事件只能看 — 詳情照開、每一欄只能看(`eventDetail.isEditable`;calendar.spec.md「API(第一段)」eventDetail 那條)。
 * 能不能改由產品決定:這裡看事件 metadata 記的來源行事曆 —— 業務部共享進來、你只有檢視權限的那幾筆回 false。
 */
const SALES_CALENDAR = '業務部行事曆(只能檢視)'
const sharedEvents: CalendarEvent[] = [
  { id: 'own1', title: '設計審查', start: `${thisMonth}-05T10:00`, end: `${thisMonth}-05T11:00`, color: 'blue', categoryId: 'meeting', location: '台北辦公室 3F 大會議室' },
  { id: 'own2', title: '衝刺規劃會議', start: `${thisMonth}-08T14:00`, end: `${thisMonth}-08T15:30`, color: 'blue', categoryId: 'meeting', location: 'Google Meet' },
  { id: 'own3', title: '每日站會', start: `${thisMonth}-15T09:30`, end: `${thisMonth}-15T09:45`, color: 'blue', categoryId: 'meeting', location: 'Slack 語音頻道' },
  { id: 'sales1', title: '宏達工業季度回顧', start: `${thisMonth}-16T14:00`, end: `${thisMonth}-16T15:30`, color: 'orange', categoryId: 'customer', location: '宏達工業 新竹廠', description: '業務部主持:回顧 Q2 出貨與下一季報價,產品團隊列席回答結帳流程的問題。', metadata: { calendar: SALES_CALENDAR } },
  { id: 'sales2', title: '經銷商年度大會', start: `${thisMonth}-22`, end: `${thisMonth}-24`, color: 'orange', allDay: true, categoryId: 'customer', location: '台北國際會議中心', metadata: { calendar: SALES_CALENDAR } },
]
export const SharedViewOnlyEvents: Story = {
  name: '團隊行事曆:共享進來的事件只能看',
  parameters: {
    docs: {
      description: {
        story:
          '產品團隊的月曆裡也排著業務部共享過來的客戶行程(橘色)。你對業務部行事曆只有檢視權限,所以點開這兩筆,詳情照樣列出時間、地點、說明與類別,但每一欄都只能看、點了不會進編輯,標題列也沒有「刪除」;自己團隊的會議(藍色)照常就地改。能不能改由產品決定:`eventDetail.isEditable(event)` 看事件記在 `metadata` 的來源行事曆,業務部的回 false。這跟「團隊行事曆」裡公司假日的單筆唯讀(`readOnly`:沒有詳情可開、點了什麼都不發生)是兩件事。',
      },
    },
  },
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <CalendarDemo
        defaultReferenceDate={now}
        today={now}
        events={sharedEvents}
        locale={LOCALE}
        categories={TEAM_CATEGORIES}
        isEditable={(event) => event.metadata?.calendar !== SALES_CALENDAR}
      />
    </div>
  ),
}

/**
 * 產品自己的詳情 — `onEventClick` 帶 `{ anchor }`(被點的那一段 / 清單裡那一列),產品用 DS 的 Popover 錨在它上面開自己的內容。
 * 從「+N」清單點的,清單留著、詳情開在旁邊(錨點在清單那一列 → lib/overlay-nesting.ts 認得是清單開出來的那一層,點它不關清單)。
 */
export const ProductOwnDetail: Story = {
  name: '產品自己的詳情',
  parameters: {
    docs: {
      description: {
        story:
          '產品要顯示自己的事件內容(例:上線項目的負責人與檢查清單)時改用 `onEventClick`;這一則的產品浮層只放標題與日期,示範錨點怎麼接:點事件時拿到 `{ anchor }` = 被點的那一段 / 那一列,用 DS 的 `Popover` 錨在它上面開。從 7/15 的「+N」清單點事件,清單不關、產品的浮層開在旁邊;產品若用不是 DS 的浮層套件,清單會被關(沒登記的浮層一律不算清單開出來的那一層)。',
      },
    },
  },
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <CalendarDemo defaultReferenceDate={now} today={now} events={launchEvents} locale={LOCALE} productDetail />
    </div>
  ),
}

// 產品上線週的資料:程式碼凍結三天,上線日一天塞滿 6 件事;開始時間由元件依 start 畫在標題前,標題裡不另寫時間
const launchEvents: CalendarEvent[] = [
  // 凍結 7/13–7/15(上線當天解凍):end 不含 → 16
  { id: 'l1', title: '程式碼凍結', start: `${thisMonth}-13`, end: `${thisMonth}-16`, color: 'red', allDay: true },
  { id: 'l2', title: '發布 v2.0', start: `${thisMonth}-15T09:00`, end: `${thisMonth}-15T10:00`, color: 'blue' },
  { id: 'l3', title: '客服待命', start: `${thisMonth}-15`, end: `${thisMonth}-16`, color: 'yellow', allDay: true },
  { id: 'l4', title: '上線公告', start: `${thisMonth}-15T10:00`, end: `${thisMonth}-15T10:30`, color: 'green' },
  { id: 'l8', title: '合作夥伴通知', start: `${thisMonth}-15T11:00`, end: `${thisMonth}-15T11:30`, color: 'turquoise' },
  { id: 'l5', title: '監控輪值', start: `${thisMonth}-15T14:00`, end: `${thisMonth}-15T22:00`, color: 'purple' },
  { id: 'l6', title: '慶功', start: `${thisMonth}-15T18:30`, end: `${thisMonth}-15T20:30`, color: 'orange' },
  { id: 'l7', title: '上線檢討會', start: `${thisMonth}-17T14:00`, end: `${thisMonth}-17T15:00`, color: 'blue' },
]

export const LaunchWeek: Story = {
  name: '產品上線週',
  parameters: {
    docs: {
      description: {
        story:
          '程式碼凍結三天(7/13–7/15),上線日一天塞滿 6 件事:發版、客服待命、上線公告、合作夥伴通知、監控輪值、慶功。每格放幾列依格子高度決定;放不下時最後一列換成「+N」(與事件同高),點它在那一格上展開當天全部事件,清單裡點事件一樣開詳情,不會變成在這天新增。',
      },
    },
  },
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <CalendarDemo defaultReferenceDate={now} today={now} events={launchEvents} locale={LOCALE} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // 7/15 上線日共 7 筆:7/13 起的「程式碼凍結」長條 + 當天 6 件事。每格放幾列依格高(calendar.spec.md「每格筆數與「+N」」),
    // 所以不寫死畫幾筆;不論放幾列都要成立:畫出來的 + 「+N」藏起來的 = 7,而且放不下時一定有「+N」、排序最後的「慶功」不進 DOM
    //(格內排序:開始日期早的在上 → 全天先 → 依開始時間,慶功 18:30 最後)。找格子與計數用元件的屬性,不比對讀屏名稱與計數文字
    //(兩者都會隨事件長相 / 「+N」清單那幾包改字)。1280 × 900(story-demo-focus 閘的視窗)這一格放 4 列 → 畫 3 筆 +「+4」。
    // 點開清單的狀態在設計規格「狀態行為:「+N」清單開著」(這一則的 play 不打開浮層:月格閘量格高時不能有浮層蓋在格子上)。
    const launchDay = `${thisMonth}-15`
    const grid = within(canvasElement).getByRole('grid')
    const drawn = grid.querySelectorAll(`[data-calendar-covers~="${launchDay}"]`).length
    const cell = grid.querySelector(`[data-calendar-day="${launchDay}"]`)?.closest('[role="gridcell"]')
    const more = cell?.querySelector<HTMLElement>('[data-calendar-more]') ?? null
    const hidden = more ? Number(/\d+/.exec(more.textContent ?? '')?.[0]) : 0
    await expect(drawn + hidden).toBe(7)
    if (more) {
      await expect(more).toBeVisible()
      await expect(hidden).toBeGreaterThan(0)
      await expect(within(canvasElement).queryByText(/^慶功/)).toBeNull()
    }
  },
}

/**
 * 季度規劃 — 跨週、跨月的長條
 * 多天的工作畫成一條橫跨多格的長條:跨過週六 / 週日換週時切成兩段,第二段起重複標題;延續到下個月的那一段在月底那一端直角(還沒結束)。
 */
export const QuarterPlanning: Story = {
  name: '季度規劃(跨週長條)',
  parameters: {
    docs: {
      description: {
        story:
          '跨日事件畫成一條橫跨多格的長條(全天,或有時段且滿 24 小時):換週切段、第二段起重複標題;斷開的那一端一律直角,只有事件真正的起點與終點是圓角 —— 「設計衝刺」7/16–7/22 在週六收、週日起,「Q3 規劃週」7/29–8/4 在 8/1 那一端直角(畫面外還有)。點長條的任何一段都是開這個事件,不會在那一天新增。',
      },
    },
  },
  render: () => {
    const events: CalendarEvent[] = [
      { id: 'q1', title: '年度預算編列', start: `${thisMonth}-06`, end: `${thisMonth}-11`, color: 'blue', allDay: true },
      { id: 'q2', title: '預算定稿會議', start: `${thisMonth}-10T16:00`, end: `${thisMonth}-10T17:00`, color: 'blue' },
      { id: 'q3', title: '設計衝刺', start: `${thisMonth}-16`, end: `${thisMonth}-23`, color: 'purple', allDay: true },
      { id: 'q4', title: 'OKR 草案審查', start: `${thisMonth}-21T10:00`, end: `${thisMonth}-21T11:30`, color: 'green' },
      { id: 'q5', title: 'Q3 規劃週', start: `${thisMonth}-29`, end: `${nextMonth}-05`, color: 'orange', allDay: true },
      { id: 'q6', title: '跨部門對齊會', start: `${thisMonth}-30T14:00`, end: `${thisMonth}-30T15:00`, color: 'turquoise' },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
        <CalendarDemo defaultReferenceDate={now} today={now} events={events} locale={LOCALE} noun="工作項目" />
      </div>
    )
  },
}

/**
 * 內容發佈月曆 — 部落格 / 影片 / Podcast 的發布排程
 * 排內容走右上角「新事件」,日子本身不能點來新增 → `readOnlyDates`(格子不是點擊目標、游標是箭頭、日期數字不是按鈕);
 * 已排好的內容點了開內建詳情(`eventDetail`)。
 */
export const ContentPublishingSchedule: Story = {
  name: '內容發佈月曆',
  render: () => {
    // 五種內容各一色;唯一的全天長條(產品發表)用淡底上字對比 ≥ 4.5 的色相(淡底 step-7 的字有 5 個色相不到 4.5,calendar.spec.md 維持清單 U10)
    // 每一則是排定的發布時刻(有時段的零長度);產品發表是一整天的活動(全天,end 不含 → 隔天)
    const events: CalendarEvent[] = [
      { id: 'p1', title: '每週電子報', start: `${thisMonth}-02T08:00`, end: `${thisMonth}-02T08:00`, color: 'blue' },
      { id: 'p2', title: '部落格:設計系統 v2', start: `${thisMonth}-07T10:00`, end: `${thisMonth}-07T10:00`, color: 'purple' },
      { id: 'p3', title: 'YouTube:教學影片第 3 集', start: `${thisMonth}-10T18:00`, end: `${thisMonth}-10T18:00`, color: 'red' },
      { id: 'p4', title: 'Podcast:來賓訪談', start: `${thisMonth}-17T07:00`, end: `${thisMonth}-17T07:00`, color: 'turquoise' },
      { id: 'p5', title: '產品發表', start: `${thisMonth}-28`, end: `${thisMonth}-29`, color: 'magenta', allDay: true },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
        <CalendarDemo events={events} defaultReferenceDate={now} today={now} locale={LOCALE} readOnlyDates />
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
          '`hideWeekends`:週末 = 語系的週末(zh-TW 週六、週日),那兩欄與星期列一起拿掉;只落在週末的事件(這裡的「週末外包待命」)不畫、不佔列;跨過週末的長條(「電話系統移轉」週五到週一)在週五收、週一起,兩端直角。方向鍵、Home / End 跳過被藏的日子,從週五按 → 到下週一。',
      },
    },
  },
  render: () => {
    // 班表是有時段的(晚班 16:00 到午夜:end 不含,只畫在開始那天);外包待命是整個週末(全天,週六到週日 → end 週一);
    // 電話系統移轉從週五做到週一(全天,end 不含 → 週二)
    const events: CalendarEvent[] = [
      { id: 's1', title: '早班:王小明、陳怡君', start: `${thisMonth}-06T08:00`, end: `${thisMonth}-06T16:00`, color: 'blue' },
      { id: 's2', title: '晚班:林志豪', start: `${thisMonth}-06T16:00`, end: `${thisMonth}-07T00:00`, color: 'purple' },
      { id: 's3', title: '新人帶班:黃雅婷', start: `${thisMonth}-08T09:00`, end: `${thisMonth}-08T18:00`, color: 'green' },
      { id: 's4', title: '早班:張家豪', start: `${thisMonth}-13T08:00`, end: `${thisMonth}-13T16:00`, color: 'blue' },
      { id: 's5', title: '客訴週報', start: `${thisMonth}-17T16:00`, end: `${thisMonth}-17T17:00`, color: 'orange' },
      { id: 's9', title: '電話系統移轉', start: `${thisMonth}-17`, end: `${thisMonth}-21`, color: 'red', allDay: true },
      { id: 's6', title: '週末外包待命', start: `${thisMonth}-18`, end: `${thisMonth}-20`, color: 'turquoise', allDay: true },
      { id: 's7', title: '晚班:陳怡君', start: `${thisMonth}-21T16:00`, end: `${thisMonth}-22T00:00`, color: 'purple' },
      { id: 's8', title: '值班表檢討', start: `${thisMonth}-31T10:00`, end: `${thisMonth}-31T11:00`, color: 'orange' },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
        <CalendarDemo defaultReferenceDate={now} today={now} events={events} locale={LOCALE} noun="班表" hideWeekends />
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
          '`showWeekNumbers`:左側一欄週數,與日期格同一套 —— 週數放在與日期框同一個 24 寬的框裡置中,欄寬 = 格子內距 4 + 24 + 4 + 格線 1;週數怎麼算跟語系(zh-TW 週日起、含 1 月 1 日那一週是第 1 週;en-GB 照 ISO,年底那一週是第 53 週)。週數格不是按鈕、不進 Tab 順序,欄頭「週」可經 `labels.weekNumberHeader` 換字。',
      },
    },
  },
  render: () => {
    // 保養與盤點停線一整天以上(全天,end 不含 → 隔天);到貨、出貨、抽檢有時段
    const events: CalendarEvent[] = [
      { id: 'm1', title: '二號產線模具保養', start: `${thisMonth}-06`, end: `${thisMonth}-07`, color: 'yellow', allDay: true },
      { id: 'm2', title: '鋁板原料到貨', start: `${thisMonth}-09T10:00`, end: `${thisMonth}-09T11:00`, color: 'turquoise' },
      { id: 'm3', title: '出貨:宏達工業 PO-2607', start: `${thisMonth}-14T14:00`, end: `${thisMonth}-14T15:00`, color: 'blue' },
      { id: 'm4', title: '品保抽檢', start: `${thisMonth}-16T09:00`, end: `${thisMonth}-16T12:00`, color: 'green' },
      { id: 'm5', title: '出貨:禾豐電子 PO-2611', start: `${thisMonth}-23T14:00`, end: `${thisMonth}-23T15:00`, color: 'blue' },
      { id: 'm6', title: '月底盤點', start: `${thisMonth}-30`, end: `${nextMonth}-01`, color: 'orange', allDay: true },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
        <CalendarDemo defaultReferenceDate={now} today={now} events={events} locale={LOCALE} noun="排程" showWeekNumbers />
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
      <CalendarDemo defaultReferenceDate={now} today={now} events={[]} locale={LOCALE} loading />
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
          '容器變窄時只縮內容、不換版面(桌機 RWD):欄寬 ≤ 60 時星期縮成一個字(「日」「一」)、每月 1 號只顯示「1」、有時段的事件拿掉開始時間(只留色條與標題,例:7/27 的上線前審查);斷點看的是月曆自己的欄寬,不是視窗寬。讀屏名稱不受影響(仍念完整日期與事件的開始時間)。',
      },
    },
  },
  render: () => {
    // 工作項目的截止日(全天,end 不含 → 隔天;與左邊表格的截止日同一天),加上線前一天的審查會議(有時段)
    const events: CalendarEvent[] = [
      { id: 'n1', title: '設計定稿', start: `${thisMonth}-10`, end: `${thisMonth}-11`, color: 'purple', allDay: true },
      { id: 'n2', title: '金流測試', start: `${thisMonth}-17`, end: `${thisMonth}-18`, color: 'blue', allDay: true },
      { id: 'n3', title: '問答更新', start: `${thisMonth}-22`, end: `${thisMonth}-23`, color: 'green', allDay: true },
      { id: 'n5', title: '上線前審查', start: `${thisMonth}-27T14:00`, end: `${thisMonth}-27T15:00`, color: 'red' },
      { id: 'n4', title: '改版上線', start: `${thisMonth}-28`, end: `${thisMonth}-29`, color: 'red', allDay: true },
    ]
    return (
      <div className="h-screen p-[var(--layout-space-loose)] bg-canvas flex gap-[var(--layout-space-loose)]">
        <div className="flex-1 min-w-0">
          <DataTable columns={releaseTaskColumns} data={releaseTasks} getRowId={(r) => r.id} maxHeight="none" />
        </div>
        {/* 側欄 400:月曆欄寬 (400 − 外框 2) ÷ 7 ≈ 56.9 ≤ 60 → 窄;工具列的「2026年7月」仍放得下 */}
        <aside aria-label="本月時程" className="w-[400px] shrink-0">
          <CalendarDemo defaultReferenceDate={now} today={now} events={events} locale={LOCALE} />
        </aside>
      </div>
    )
  },
}

/**
 * 填滿主畫面:貼邊擺法 + 不加外框(`flush` + `bordered={false}`;calendar.spec.md「外殼」)。
 * 排班頁的主畫面只放這一個月曆、而且填滿:格子區左右下貼齊主畫面的邊,容器的邊就是捲動範圍的邊,外面再一圈框是多的。
 */
export const FillMainAreaBorderless: Story = {
  name: '填滿主畫面(貼邊、不加外框)',
  parameters: {
    docs: {
      description: {
        story:
          '排班頁的主畫面只放這一個月曆、填滿到邊:格子區的左、右、下貼齊主畫面的邊(主畫面那三邊不給內距),工具列自己帶左右內距,「‹ 今天 ›」與「+ 新事件」對齊內容的左右邊距;不加框,格線保留,最後一週照畫底線收尾(和表格不加框時的收尾一樣)。平常的月曆仍有框、工具列在框外 —— 和表格一樣,框標記捲動範圍的邊界,和其他內容並排時要留著。',
      },
    },
  },
  render: () => {
    // 門市排班:早班 / 晚班(有時段)與盤點日(全天,end 不含 → 隔天)。全天長條用淡底上字對比 ≥ 4.5 的色相
    //(淡底 step-7 的字有 5 個色相不到 4.5,calendar.spec.md「驗證」已知例外 (1)【維持 U10】;同「內容發佈月曆」的取法)
    const events: CalendarEvent[] = [
      { id: 's1', title: '早班:王小明', start: `${thisMonth}-06T08:00`, end: `${thisMonth}-06T16:00`, color: 'blue' },
      { id: 's2', title: '晚班:林佳穎', start: `${thisMonth}-06T16:00`, end: `${thisMonth}-06T23:00`, color: 'purple' },
      { id: 's3', title: '早班:陳志豪', start: `${thisMonth}-14T08:00`, end: `${thisMonth}-14T16:00`, color: 'blue' },
      { id: 's4', title: '季度盤點', start: `${thisMonth}-24`, end: `${thisMonth}-25`, color: 'turquoise', allDay: true },
    ]
    return (
      // 主畫面只給上方內距(左右下由月曆貼齊,工具列自己帶左右 loose —— 一段距離只有一個主人)
      <div className="h-screen bg-surface pt-[var(--layout-space-loose)]">
        <CalendarDemo flush bordered={false} defaultReferenceDate={now} today={now} events={events} locale={LOCALE} noun="班次" />
      </div>
    )
  },
}

// 日期格唯讀 × 自訂事件方塊的鍵盤契約(test-only 夾具,原本寫在「內容發佈月曆」的 play):日期數字不是按鈕、格子本身是格陣的鍵盤停靠點;
// `renderEventTile` 的外層由元件擁有按鈕角色與 Enter 觸發(calendar.spec.md「renderEventTile 的鍵盤責任歸屬」)。story-demo-focus 閘載入每支 story 並跑 play,斷言不成立就紅。
export const ReadOnlyDatesCustomTileKeyboard: Story = {
  name: '唯讀日期 × 自訂事件方塊鍵盤',
  tags: ['test-only'],
  // @example-basis: packages/design-system/src/components/Calendar/calendar.spec.md「A11y 預設」的「`renderEventTile` 的鍵盤責任歸屬」:「Enter/Space activation」
  parameters: { demoFocus: 'keep' },
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <Calendar
        events={[{ id: 'p1', title: '每週電子報', start: `${thisMonth}-02T08:00`, end: `${thisMonth}-02T08:00`, color: 'blue' }]}
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
    // 外層的讀屏名稱 =「{標題},{開始時間}」(calendar.spec.md「A11y 預設」事件列;自訂內容也一樣,名稱由元件給)
    const tile = await canvas.findByRole('button', { name: '每週電子報,上午8:00' })
    tile.focus()
    await userEvent.keyboard('{Enter}')
    await expect(customTileActivated).toHaveBeenCalledTimes(1)
  },
}

// onEventClick 的錨點(test-only 夾具;calendar.spec.md「API」`onEventClick={(event, { anchor }) => …}`【總帳更正 #4】):
// 第二個參數的 anchor = 被點的那一列 / 那一段 —— 產品拿它開自己的詳情浮層。「年中盤點」7/10(五)–7/13(一)在週日換週處切成兩段,
// 點哪一段、從哪一段 Enter,anchor 就是哪一段;最後一題是對照:程式化 click() 不搬焦點,焦點留在日期鈕上,anchor 仍是被點的那一段
//(從 document.activeElement 反推的寫法在這一題會交出日期鈕)。story-demo-focus 閘載入每支 story 並跑 play,斷言不成立就紅。
const eventClickAnchor = fn()
const ANCHOR_EVENTS: CalendarEvent[] = [
  // 全天 7/10–7/13:end 不含 → 14(calendar.spec.md「資料語意」)
  { id: 'ac1', title: '年中盤點', start: `${thisMonth}-10`, end: `${thisMonth}-14`, color: 'purple', allDay: true },
  { id: 'ac2', title: '供應商簽約', start: `${thisMonth}-16T14:00`, end: `${thisMonth}-16T15:00`, color: 'blue' },
]
export const EventClickAnchor: Story = {
  name: '點事件交出錨點',
  tags: ['test-only'],
  // @example-basis: packages/design-system/src/components/Calendar/calendar.spec.md:96「onEventClick={(event, { anchor }) => …}」
  parameters: { demoFocus: 'keep' },
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <Calendar
        defaultReferenceDate={now}
        today={now}
        locale={LOCALE}
        events={ANCHOR_EVENTS}
        onDateClick={fn()}
        onEventClick={eventClickAnchor}
        onCreateEvent={fn()}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    eventClickAnchor.mockClear()
    // 每一段事件的外層帶 data-calendar-covers(涵蓋的日子);可點的帶 data-calendar-tile
    const pieceOn = (iso: string) => canvasElement.querySelector<HTMLElement>(`[data-calendar-tile][data-calendar-covers~="${iso}"]`)
    const first = pieceOn(`${thisMonth}-10`)
    const second = pieceOn(`${thisMonth}-13`)
    const signing = pieceOn(`${thisMonth}-16`)
    const day13 = canvasElement.querySelector<HTMLButtonElement>(`button[data-calendar-day="${thisMonth}-13"]`)
    if (!first || !second || !signing || !day13 || first === second) throw new Error('「年中盤點」沒有切成兩段(7/10–7/11、7/12–7/13),或找不到 7/16 的事件 / 7/13 的日期鈕')
    const anchorOf = (call: number) => (eventClickAnchor.mock.calls[call]?.[1] as { anchor?: HTMLElement } | undefined)?.anchor
    // 滑鼠點長條的第二段 → anchor = 第二段(不是長條的第一段)
    await userEvent.click(second)
    await expect(eventClickAnchor).toHaveBeenCalledTimes(1)
    await expect(eventClickAnchor.mock.calls[0][0]).toMatchObject({ id: 'ac1' })
    await expect(anchorOf(0)).toBe(second)
    // 點第一段 → 第一段;點有時段的一列 → 那一列
    await userEvent.click(first)
    await expect(anchorOf(1)).toBe(first)
    await userEvent.click(signing)
    await expect(anchorOf(2)).toBe(signing)
    // 鍵盤:7/13 的日期鈕 F2 進格 → 焦點在第二段 → Enter → anchor = 第二段
    day13.focus()
    await userEvent.keyboard('{F2}')
    await expect(document.activeElement).toBe(second)
    await userEvent.keyboard('{Enter}')
    await expect(anchorOf(3)).toBe(second)
    // 對照:焦點在 7/13 的日期鈕上,程式化點第一段(click() 不搬焦點)→ anchor 仍是第一段,焦點仍在日期鈕
    day13.focus()
    first.click()
    await expect(document.activeElement).toBe(day13)
    await expect(anchorOf(4)).toBe(first)
  },
}

// 詳情只能看(test-only 夾具;calendar.spec.md「事件詳情浮層」內文欄位【AI 推導】「isEditable 為 false 時空欄位不列、各欄位 InlineEdit editable={false}」):
// 客戶端行事曆同步進來的會議,本產品不能改 → isEditable 一律 false。這一筆沒有地點、說明、類別,只能看時也不畫全天【ALLDAY-VIEW(定)】→ 詳情只列時間;
// 每一欄都不可點(沒有隱形的編輯鈕)。scripts/calendar-month-invariant.mjs DT-readonly 量這一則。
export const DetailViewOnly: Story = {
  name: '詳情只能看',
  tags: ['test-only'],
  // @example-basis: packages/design-system/src/components/Calendar/calendar.spec.md「事件詳情浮層」內文欄位最後一條(isEditable 為 false)
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <CalendarDemo
        defaultReferenceDate={now}
        today={now}
        locale={LOCALE}
        categories={TEAM_CATEGORIES}
        isEditable={() => false}
        events={[{ id: 'sync1', title: '宏達工業季度回顧(客戶行事曆同步)', start: `${thisMonth}-16T14:00`, end: `${thisMonth}-16T15:30`, color: 'orange' }]}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^宏達工業季度回顧/ }))
    await within(document.body).findByRole('dialog', { name: '宏達工業季度回顧(客戶行事曆同步)' })
  },
}

// 詳情交回的修改(test-only 夾具):onEventChange 每呼叫一次記一筆(畫在範例下方的紀錄列,閘從 DOM 讀),
// 標題故意長到在格子裡被截斷(關詳情後焦點回到截斷方塊時不跳提示的量測用,DT-tip)。標題列放產品自己的兩個操作「延後一週」「延到下個月」(eventDetail.actions;事件被移走時詳情跟到新位置 / 留在原位、焦點歸還的量測用)。
// scripts/calendar-month-invariant.mjs DT-commit / DT-move / DT-fallback 量這一則。
const shiftDays = (value: string | Date, days: number): string | Date => {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days, value.getHours(), value.getMinutes())
  const [date, time] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(y, m - 1, d + days)
  const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
  return time ? `${iso}T${time}` : iso
}
function DetailChangeLogDemo() {
  const [log, setLog] = React.useState<{ id: string; patch: Partial<CalendarEvent> }[]>([])
  return (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas flex flex-col gap-2">
      <output data-calendar-change-log={JSON.stringify(log)} className="text-body text-fg-secondary">
        onEventChange 呼叫 {log.length} 次{log.length ? `,最後一次:${JSON.stringify(log[log.length - 1].patch)}` : ''}
      </output>
      <div className="flex-1 min-h-0">
        <CalendarDemo
          defaultReferenceDate={now}
          today={now}
          locale={LOCALE}
          events={[{ id: 'mv1', title: '設計審查:結帳頁改版第二輪(信用卡分期顯示)', start: `${thisMonth}-05T10:00`, end: `${thisMonth}-05T11:00`, color: 'blue' }]}
          onEventChange={(event, patch) => setLog((prev) => [...prev, { id: event.id, patch }])}
          extraActions={(event, update) => (
            <>
              <Button variant="text" size="sm" onClick={() => update({ start: shiftDays(event.start, 7), end: shiftDays(event.end ?? event.start, 7) })}>延後一週</Button>
              <Button variant="text" size="sm" onClick={() => update({ start: shiftDays(event.start, 31), end: shiftDays(event.end ?? event.start, 31) })}>延到下個月</Button>
            </>
          )}
        />
      </div>
    </div>
  )
}
export const DetailChangeLog: Story = {
  name: '詳情交回的修改',
  tags: ['test-only'],
  // @example-basis: packages/design-system/src/components/Calendar/calendar.spec.md:117「eventDetail.onEventChange(event, patch) 必填;patch 只帶這一次改到的欄位」
  render: () => <DetailChangeLogDemo />,
}

// 英文產品覆寫讀屏字串(test-only 夾具):`labels` 逐鍵換掉 DS 預設的繁中(calendar.spec.md「A11y 預設」字串可覆寫),
// 已有個別參數的字串(‹ › / 月份導覽 / 今天 / 新事件)照用那些參數。play 斷言覆寫真的生效、沒有一句預設中文漏出來;
// scripts/calendar-month-invariant.mjs 也開這一則量(對照組:把名稱改回預設中文 → 紅)。
// 同一則也是 `eventTimeFormat` 的夾具:英文產品要 24 小時制(10:00,不是 en-US 預設的 10:00 AM;calendar.spec.md「資料語意」時間顯示「eventTimeFormat 可覆寫」)。
const ENGLISH_LABELS: CalendarLabels = {
  grid: (monthTitle) => `Calendar, ${monthTitle}`,
  day: (fullDate, count) => `${fullDate}, ${count} ${count === 1 ? 'event' : 'events'}`,
  todayPrefix: 'Today, ',
  weekNumberHeader: 'W',
  weekNumber: (week) => `Week ${week}`,
  event: (title, when, allDay) => `${title}, ${when}${allDay ? ', all day' : ''}`,
  more: (fullDate, count) => `${fullDate}, ${count} more ${count === 1 ? 'event' : 'events'}`,
  moreListClose: 'Close',
  // 事件詳情的字(這一則用 onEventClick、不開內建詳情;CalendarLabels 是整份型別,英文產品照樣要給)
  detailClose: 'Close',
  detailTitle: 'Title',
  detailTime: 'Time',
  detailAllDay: 'All day',
  detailLocation: 'Location',
  detailLocationPlaceholder: 'Add location…',
  detailDescription: 'Description',
  detailDescriptionPlaceholder: 'Add description…',
  detailCategory: 'Category',
  detailCategoryPlaceholder: 'Choose a category…',
}
const ENGLISH_EVENTS: CalendarEvent[] = [
  { id: 'en1', title: 'Design review', start: `${thisMonth}-07T10:00`, end: `${thisMonth}-07T11:00`, color: 'blue' },
  // 長條用字與淡底對比 ≥ 4.5 的色相(green 長條的字 3.71,不在範例新增 color-contrast 違規;同「內容發佈月曆」的選色)
  { id: 'en2', title: 'Offsite', start: `${thisMonth}-08`, end: `${thisMonth}-10`, color: 'purple', allDay: true },
]
export const EnglishLabelsOverride: Story = {
  name: '英文讀屏字串覆寫',
  tags: ['test-only'],
  // @example-basis: packages/design-system/src/components/Calendar/calendar.spec.md「A11y 預設」的「字串可覆寫」
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <Calendar
        defaultReferenceDate={now}
        today={now}
        events={ENGLISH_EVENTS}
        locale="en-US"
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }}
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
    // 事件名稱也用 consumer 的字;開始時間照 eventTimeFormat(24 小時制,不是 en-US 預設的「10:00 AM」),畫面與名稱同一個格式
    await expect(canvas.getByRole('button', { name: 'Design review, 10:00' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Offsite, July 8 – July 9, all day' })).toBeInTheDocument()
    await expect(canvas.getByText('10:00')).toBeInTheDocument()
    // 預設的繁中一句都不出現(格陣名稱、日期名稱、今天前綴、事件名稱)
    await expect(canvas.queryAllByRole('grid', { name: /月行事曆/ })).toHaveLength(0)
    await expect(canvas.queryAllByRole('button', { name: /今天,|個事件|星期|全天|上午|下午/ })).toHaveLength(0)
  },
}

/**
 * 空行事曆 — 整月沒有事件時月曆就是空白的畫布,不另外放空狀態提示(calendar.spec.md「狀態與邊界案例」沒有事件那條)
 * 第一個事件從右上角「新事件」建立,日子本身不能點來新增 → `readOnlyDates`;之後排進來的事件點了開內建詳情(`eventDetail`)。
 */
export const EmptyCalendar: Story = {
  name: '空行事曆',
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
      <CalendarDemo events={[]} defaultReferenceDate={now} today={now} locale={LOCALE} readOnlyDates />
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
  // @example-basis: packages/design-system/src/components/Calendar/calendar.spec.md「Cell 規則」的「點格內空白處也把鍵盤位置帶過來」
  parameters: { demoFocus: 'keep' },
  render: () => (
    <div className="h-screen p-[var(--layout-space-loose)] bg-canvas">
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

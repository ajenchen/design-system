// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   SizeMatrix N/A — Calendar 是單一 month canvas，沒有 size variant。
//   StateBehavior 已存在(today / outside month / hover / event tile 等狀態
//     已由 StateBehavior 5. 涵蓋)。
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from '@storybook/test'
import { Calendar, type CalendarEvent } from './calendar'
import { CATEGORICAL_HUES } from '@/design-system/tokens/categorical-color'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta<typeof Calendar> = {
  title: 'Design System/Components/Calendar/設計規格',
  component: Calendar,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof Calendar>

// 視覺基線同時釘住顯示月與 today SSOT，避免跨月/換日造成 snapshot 漂移。
const now = new Date(2026, 6, 15)
const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')

const sampleEvents: CalendarEvent[] = [
  { id: 'e1', title: 'Design review', start: `${thisMonth}-05`, end: `${thisMonth}-05`, color: 'blue' },
  { id: 'e2', title: 'Sprint planning', start: `${thisMonth}-08`, end: `${thisMonth}-08`, color: 'blue' },
  { id: 'e3', title: 'Release deadline', start: `${thisMonth}-12`, end: `${thisMonth}-12`, color: 'red' },
  { id: 'e4', title: 'Q review', start: `${thisMonth}-18`, end: `${thisMonth}-18`, color: 'green' },
  { id: 'e5', title: 'Alex vacation', start: `${thisMonth}-20`, end: `${thisMonth}-22`, color: 'yellow', allDay: true },
]

// 日期格 / 事件方塊各自二擇一:可點就接回調(型別層必填),不可點就寫 readOnlyDates / readOnlyEvents
//(calendar.spec.md「日期格與事件方塊:可點或唯讀」)。規格頁的可點範例也給**看得見的反應**,
// 不給空函式(空函式 = 點了沒反應);真實 app 在這裡開「當日新增事件」面板 / 事件詳情。與展示頁 calendar.stories.tsx 同一種示範手法。
const demoAddOnDate = (date: Date) => alert(`在 ${date.getMonth() + 1}/${date.getDate()} 新增事件`)
const demoOpenEvent = (event: CalendarEvent) => alert(`點了事件:${event.title}`)

// Keep dynamic-token documentation readable without presenting Tailwind's
// source scanner with an invalid literal arbitrary-value candidate.
const TIMED_EVENT_CLASS_GUIDE = [
  'bg-[var(--color-', '{color}', '-1)] · text-[var(--color-', '{color}',
  '-7)] · rounded-md · px-1.5 py-0.5 · text-caption · truncate',
].join('')
const ALL_DAY_EVENT_CLASS_GUIDE = [
  '同上 + border-l-[3px] border-[var(--color-', '{color}', '-6)] · font-medium',
].join('')
const HOVER_EVENT_CLASS_GUIDE = [
  'hover:bg-[var(--color-', '{color}', '-2)]',
].join('')

// ── 1. 元件總覽 ────────────────────────────────────────────────────────────────
export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <Calendar events={sampleEvents} defaultReferenceDate={now} today={now} onDateClick={demoAddOnDate} onEventClick={demoOpenEvent} />
    </div>
  ),
}

// ── 2. 元件檢閱器 ────────────────────────────────────────────────────────────
export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: { description: { story: '右側 Controls 切換 month canvas 的已實作 props；未實作的週/日與 size API 不暴露。' } },
    layout: 'fullscreen',
  },
  args: {
    weekStartsOn: 0,
    locale: 'en-US',
    events: sampleEvents,
    today: now,
    // 可點模式的回調(沒宣告唯讀就必填);檢閱器切 props 時照樣點得出反應
    onDateClick: demoAddOnDate,
    onEventClick: demoOpenEvent,
  },
  argTypes: {
    weekStartsOn: { control: 'radio', options: [0, 1] },
    locale: { control: 'select', options: ['en-US', 'zh-TW', 'ja-JP'] },
    events: { control: 'object' },
  },
  render: (args) => (
    <div className="h-screen p-4 bg-canvas">
      <Calendar defaultReferenceDate={now} {...args} />
    </div>
  ),
}

// ── 3. 色彩對照表(事件 color 類別 + Cell / Event tile token)─────────────────────
// 跳過 4. SizeMatrix：元件沒有 size API。
export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => {
    const colorEvents: CalendarEvent[] = CATEGORICAL_HUES.map((c, i) => ({
      id: `c-${c}`,
      title: `${c} category`,
      start: `${thisMonth}-${String(i + 2).padStart(2, '0')}`,
      end: `${thisMonth}-${String(i + 2).padStart(2, '0')}`,
      color: c,
    }))
    return (
      <div className="p-4 bg-canvas flex flex-col gap-10">
        <div>
          <H3>事件類別色</H3>
          <Desc>
            事件顏色用 12 種類別色,和 Tag / Avatar 共用同一套色盤
            (blue / green / deep-orange / yellow / red / orange / amber / lime / turquoise / indigo / purple / magenta)。
            顏色代表「這是哪一類事件」(同一個團隊 / 同一個專案),不是嚴重程度。每個色名對應一個色相,紅與橘各自獨立、可清楚區分。
          </Desc>
          <div className="h-[560px]">
            <Calendar events={colorEvents} defaultReferenceDate={now} today={now} onDateClick={demoAddOnDate} onEventClick={demoOpenEvent} />
          </div>
        </div>

        <div>
          <H3>Cell 視覺 token</H3>
          <Desc>月 view cell 的狀態色彩。Cell 最小高度 min-h-28 容納日期 header + 3 event tile,隨容器高度伸縮;7 欄等分。</Desc>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead>
                <tr>
                  <Th>區塊</Th>
                  <Th>Token / Class</Th>
                  <Th>說明</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>Cell 高度</Td>
                  <Td mono>min-h-28(112px)</Td>
                  <Td>容納 header + 3 event tile 的下限,隨容器高度伸縮(root h-full + grid flex-1)</Td>
                </tr>
                <tr>
                  <Td>Cell 寬度</Td>
                  <Td mono>1fr × 7</Td>
                  <Td>週 7 欄等分</Td>
                </tr>
                <tr>
                  <Td>日期 header</Td>
                  <Td mono>flex items-start justify-end · text-body · font-medium</Td>
                  <Td>右上角數字,wrapper 無固定高度(由內容 + cell min-h-28 決定),對齊 Google Calendar</Td>
                </tr>
                <tr>
                  <Td>Today cell(日期數字)</Td>
                  <Td mono>bg-info · text-on-emphasis · rounded-full · min-w-6 h-6 px-2 · text-body font-medium</Td>
                  <Td>info-filled pill,固定 h-6 + min-w-6 做 pill badge(對齊 Google Calendar today pill)</Td>
                </tr>
                <tr>
                  <Td>Outside day cell</Td>
                  <Td mono>text-fg-muted · 無底色</Td>
                  <Td>上/下月溢出日期只用淡字區分;格子跟當月一樣可點、一樣的滑過色(同 DateGrid 鄰月日子)</Td>
                </tr>
                <tr>
                  <Td>Hover cell</Td>
                  <Td mono>hover:bg-neutral-hover</Td>
                  <Td>提示可點擊新增入口(日期格可點時)</Td>
                </tr>
                <tr>
                  <Td>唯讀的格(readOnlyDates)</Td>
                  <Td mono>無 hover 底色 · 日期數字為 span(同字級、同今天 pill)· 格子 focus-visible:focus-ring-inset</Td>
                  <Td>沒有「點日子新增」時宣告:格子不亮、日期數字不是按鈕、游標不變;鍵盤停靠點改為格子本身,方向鍵照常</Td>
                </tr>
                <tr>
                  <Td>Weekend cell(後續增量)</Td>
                  <Td mono>待定(可點的格不可用 bg-muted)</Td>
                  <Td>目前不提供 weekend prop / isWeekend 樣式；未實作能力不預佔 API</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <H3>Event tile 視覺 token</H3>
          <Desc>事件 tile 的色彩由 event `color` 欄位決定,bg / text 走 subtle / text tier。</Desc>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead>
                <tr>
                  <Th>情境</Th>
                  <Th>Token / Class</Th>
                  <Th>說明</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>一般 event(timed)</Td>
                  <Td mono>{TIMED_EVENT_CLASS_GUIDE}</Td>
                  <Td>單行 tile,color 依事件類別(12 categorical 色相,消費 categorical-color SSOT,與 Tag / Avatar 共用)。對齊 Tag 色階(step-1 淺底 / step-7 文字)。色名必須 1:1 對應 <code>--color-{'{hue}'}-*</code>,零 offset(2026-06-04 修:原 red / orange 都誤接 deep-orange,改後 red→`--color-red-*`、orange→`--color-orange-*` 各自獨立)</Td>
                </tr>
                <tr>
                  <Td>All-day event</Td>
                  <Td mono>{ALL_DAY_EVENT_CLASS_GUIDE}</Td>
                  <Td>2026-06-01 補實作:淡底 + 左側實心 accent 條 + medium,排序在有時間事件之前(cell 頂端);多日全天事件以日精度 filter 在每個涵蓋日各顯示一條</Td>
                </tr>
                <tr>
                  <Td>Hover tile</Td>
                  <Td mono>{HOVER_EVENT_CLASS_GUIDE}</Td>
                  <Td>同色濃一階(淺色變深、深色變亮)表示可點擊(事件方塊可點時)</Td>
                </tr>
                <tr>
                  <Td>唯讀的事件(readOnlyEvents)</Td>
                  <Td mono>同上色、不帶 hover(CAT_SUBTLE)· 無 cursor-pointer</Td>
                  <Td>事件沒有詳情可開時宣告:方塊不亮、不是按鈕、不進格內導覽(F2 找不到它);截斷時仍有提示</Td>
                </tr>
                <tr>
                  <Td>超出 tile 限制</Td>
                  <Td mono>「+N more」純文字(text-fg-muted)</Td>
                  <Td>每格最多顯示 3 筆事件,超出顯示「+N more」弱化計數文字,目前不可點擊(展開列表為後續增量)</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  },
}

// ── 5. 狀態行為 ─────────────────────────────────────────────────────────────
export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <div className="mb-2 text-body text-fg-muted space-y-1">
        <div>• <b>today</b> cell:date 數字加 `bg-info text-on-emphasis rounded-full` 圓</div>
        <div>• <b>outside month</b>:前後月日期數字走淡字 `text-fg-muted`,cell 不加底色(跟當月格一樣可點、一樣的滑過色)</div>
        <div>• <b>多事件 cell</b>:超出 3 則的 event 顯示「+N more」</div>
        <div>• <b>event hover</b>:tile 切同色濃一階(淺色變深、深色變亮)`hover:bg-{`{color}`}-2`(如 blue → `--color-blue-2`)+ `cursor-pointer`</div>
        <div>• <b>empty cell</b>:無事件保持純底色,點擊觸發 onDateClick</div>
        <div>• <b>唯讀</b>(`readOnlyDates` / `readOnlyEvents`,各自宣告):格子 / 事件方塊不亮、不是按鈕、游標不變;鍵盤仍可在格陣內走動(見「設計原則 — 唯讀的日期格與事件」)</div>
      </div>
      <Calendar events={sampleEvents} defaultReferenceDate={now} today={now} onDateClick={demoAddOnDate} onEventClick={demoOpenEvent} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /^2026-07-15,/ })).toHaveClass('bg-info')
    await userEvent.click(canvas.getByRole('button', { name: '下個月' }))
    await expect(canvas.getByRole('heading', { level: 2 })).toHaveTextContent('August 2026')
    await userEvent.click(canvas.getByRole('button', { name: '今天' }))
    await expect(canvas.getByRole('heading', { level: 2 })).toHaveTextContent('July 2026')
  },
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙與鍵盤',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `calendar.spec.md` 「A11y 預設」段。摘要:\n\n  Grid role  :月格容器 `role=\"grid\"` + `aria-label`(月份),每列 `role=\"row\"`(`display:contents` 保 CSS grid 佈局),每格 `role=\"gridcell\"`(非互動容器),日期數字按鈕帶 `aria-label`(日期 + 事件數)。事件 tile `role=\"button\"` + `aria-label`(事件標題)。\n\n  Keyboard 行為(實作現況,2026-09-24 補齊 W3C APG Data Grid)  :\n\n- Tab — 整個月格陣只停一次(roving tabindex:只有目前焦點日的日期鈕進 Tab 序列,其餘日期鈕與全部事件方塊都不進);進來時停在今天,今天不在本月則停在該月 1 號\n- ←/→ — 前一天 / 後一天;↑/↓ — 上一週 / 下一週的同一天\n- Home / End — 該週的第一天 / 最後一天(依 weekStartsOn)\n- PageUp / PageDown — 上個月 / 下個月的同一個日號(該日號不存在則落當月最後一天);加 Shift 變成去年 / 明年\n- Enter / Space — 日期數字按鈕觸發 `onDateClick`\n- F2 — 進到這一格的事件方塊;格內用 ↑↓←→ 換方塊、Enter / Space 觸發 `onEventClick`、Escape 或 F2 回到日期數字按鈕\n- Toolbar 的 ◀ / 今天 / ▶ 在格陣外,是各自獨立的 Tab 停靠點\n- 日期格唯讀(readOnlyDates)時:格子裡只剩文字,焦點停在格子本身(帶同樣的「日期 + 事件數」名字),方向鍵照常;格子沒有主要動作,Enter 與 F2 都是進格\n- 事件方塊唯讀(readOnlyEvents)時:方塊不是按鈕、不進格內導覽\n\n  刻意不做  :Ctrl+Home / Ctrl+End、Shift+方向鍵切月切年(APG 把 Shift+方向鍵定義為延伸選取,本元件無選取模型)。逐字出處與理由見 spec。\n\n  Focus  :鍵盤焦點一律畫 outline 框(對齊 DS 焦點 canonical)。日期數字按鈕與預設事件 tile 走全域 `:focus-visible` 外描邊(`outline: 2px solid var(--ring)`,往外 2px;元件不寫任何 class);`renderEventTile` 自訂 tile 的外層 wrapper 因事件方塊之間只有 gap-0.5(2px)、往外會壓到相鄰方塊,改內描邊 `focus-visible:focus-ring-inset`(往內 2px)。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。"}</p>
    </div>
  ),
}

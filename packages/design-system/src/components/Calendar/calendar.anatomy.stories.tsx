// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   SizeMatrix N/A — MVP 只支援 view="month" + 固定 size="md",無多 size tier
//     (lg 為後續增量,見 calendar.spec.md「MVP vs 後續增量」)。
//   StateBehavior 已存在(today / outside month / hover / event tile 等狀態
//     已由 StateBehavior 5. 涵蓋)。
import type { Meta, StoryObj } from '@storybook/react'
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

const now = new Date()
const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')

const sampleEvents: CalendarEvent[] = [
  { id: 'e1', title: 'Design review', start: `${thisMonth}-05`, end: `${thisMonth}-05`, color: 'blue' },
  { id: 'e2', title: 'Sprint planning', start: `${thisMonth}-08`, end: `${thisMonth}-08`, color: 'blue' },
  { id: 'e3', title: 'Release deadline', start: `${thisMonth}-12`, end: `${thisMonth}-12`, color: 'red' },
  { id: 'e4', title: 'Q review', start: `${thisMonth}-18`, end: `${thisMonth}-18`, color: 'green' },
  { id: 'e5', title: 'Alex vacation', start: `${thisMonth}-20`, end: `${thisMonth}-22`, color: 'yellow', allDay: true },
]

// ── 1. 元件總覽 ────────────────────────────────────────────────────────────────
export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <Calendar events={sampleEvents} />
    </div>
  ),
}

// ── 2. 元件檢閱器 ────────────────────────────────────────────────────────────
export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: { description: { story: '右側 Controls 切換 props 即時預覽,取代 Figma 標註。檢視目前只支援「月」(週 / 日檢視尚未實作,為後續增量,選項已停用)。' } },
    layout: 'fullscreen',
  },
  args: {
    view: 'month',
    weekStartsOn: 0,
    locale: 'en-US',
    events: sampleEvents,
  },
  argTypes: {
    view: { control: 'radio', options: ['month', 'week', 'day'] },
    weekStartsOn: { control: 'radio', options: [0, 1] },
    locale: { control: 'select', options: ['en-US', 'zh-TW', 'ja-JP'] },
    size: { control: 'radio', options: ['md', 'lg'] },
    events: { control: 'object' },
  },
  render: (args) => (
    <div className="h-screen p-4 bg-canvas">
      <Calendar {...args} />
    </div>
  ),
}

// ── 3. 色彩對照表(事件 color 類別 + Cell / Event tile token)─────────────────────
// 跳過 4. SizeMatrix(rationale 見 calendar.spec.md「MVP vs 後續增量」,MVP 只 md;lg 為 tech debt)
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
            event color = 12 categorical 色相,**消費 categorical-color SSOT**,與 Tag / Avatar 共用同一組
            (blue / green / deep-orange / yellow / red / orange / amber / lime / turquoise / indigo / purple / magenta)。
            color 是**類別語意**(同 team / 同 project),非 severity。色名 1:1 對該色相的 `--color-*` primitive(零 offset);
            2026-06-04 修正前 red 與 orange 都誤接 deep-orange,現各自獨立可區分。
          </Desc>
          <div className="h-[560px]">
            <Calendar events={colorEvents} />
          </div>
        </div>

        <div>
          <H3>Cell 視覺 token</H3>
          <Desc>月 view cell 的狀態色彩。Cell 高度固定容納日期 header + 3 event tile;7 欄等分。</Desc>
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
                  <Td>容納 header + 3 event tile,MVP 月 view 固定</Td>
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
                  <Td>info-filled pill,固定 h-6 + min-w-6 做圓形 badge(對齊 Google Calendar today pill)</Td>
                </tr>
                <tr>
                  <Td>Outside day cell</Td>
                  <Td mono>text-fg-disabled · bg-muted</Td>
                  <Td>上/下月溢出日期弱化 + 背景略暗</Td>
                </tr>
                <tr>
                  <Td>Hover cell</Td>
                  <Td mono>hover:bg-neutral-hover</Td>
                  <Td>提示可點擊新增入口</Td>
                </tr>
                <tr>
                  <Td>Weekend cell(後續增量)</Td>
                  <Td mono>bg-muted</Td>
                  <Td>對齊 Google Calendar,MVP 未實作(無 weekend prop / 無 isWeekend 邏輯),列後續增量</Td>
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
                  <Td mono>bg-[var(--color-{`{color}`}-1)] · text-[var(--color-{`{color}`}-7)] · rounded-md · px-1.5 py-0.5 · text-caption · truncate</Td>
                  <Td>單行 tile,color 依事件類別(12 categorical 色相,消費 categorical-color SSOT,與 Tag / Avatar 共用)。對齊 Tag 色階(step-1 淺底 / step-7 文字)。**色名 1:1 對 `--color-{`{hue}`}-*`,零 offset**(2026-06-04 修:原 red / orange 都誤接 deep-orange,改後 red→`--color-red-*`、orange→`--color-orange-*` 各自獨立)</Td>
                </tr>
                <tr>
                  <Td>All-day event</Td>
                  <Td mono>同上 + border-l-[3px] border-[var(--color-{`{color}`}-6)] · font-medium</Td>
                  <Td>2026-06-01 補實作:淡底 + 左側實心 accent 條 + medium,排序在有時間事件之前(cell 頂端);多日全天事件以日精度 filter 在每個涵蓋日各顯示一條</Td>
                </tr>
                <tr>
                  <Td>Hover tile</Td>
                  <Td mono>hover:bg-[var(--color-{`{color}`}-2)]</Td>
                  <Td>同色深一階表示可點擊</Td>
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
        <div>• <b>outside month</b>:前後月日期數字走 `text-fg-disabled`,cell 底色 `bg-muted`</div>
        <div>• <b>多事件 cell</b>:超出 3 則的 event 顯示「+N more」</div>
        <div>• <b>event hover</b>:tile 切同色深一階 `hover:bg-{`{color}`}-2`(如 blue → `--color-blue-2`)+ `cursor-pointer`</div>
        <div>• <b>empty cell</b>:無事件保持純底色,點擊觸發 onDateClick</div>
      </div>
      <Calendar events={sampleEvents} />
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `calendar.spec.md` 「A11y 預設」段。摘要:\n\n  Grid role  :月格容器 `role=\"grid\"` + `aria-label`(月份),每列 `role=\"row\"`(`display:contents` 保 CSS grid 佈局),每格 `role=\"gridcell\"`(非互動容器),日期數字按鈕帶 `aria-label`(日期 + 事件數)。事件 tile `role=\"button\"` + `aria-label`(事件標題)。\n\n  Keyboard 行為(MVP 實作現況)  :\n\n- Tab — 逐一 focus 每格的日期數字按鈕與其中的事件 tile(cell 為非互動 gridcell 容器,滑鼠點空白處等同點日期)\n- Enter / Space — 日期數字按鈕觸發 `onDateClick`;事件 tile 觸發 `onEventClick`\n- Toolbar 的 ◀ / 今天 / ▶ / 檢視切換為標準可聚焦控件,Tab 可達\n\n  Keyboard tech debt(尚未實作,見 spec.md「MVP vs 後續增量」)  :\n\n- ↑/↓/←/→ 在日期格間 roving 移動、PageUp/Down 切月、Shift+PageUp/Down 切年、Esc 關閉 — 隨週 / 日 view 增量一併補上 roving tabindex\n\n  Focus  :focus-visible ring 對齊 DS 設計準則( outline: 2px solid var(--ring) );日期數字按鈕與事件 tile 皆有 ring。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。"}</p>
    </div>
  ),
}

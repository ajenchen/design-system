// @principles-rationale: Merged WhenToUse + WhenNotToUse + VsDatePicker into a single
// `UsageGuidance` story (3 sections) per 2026-04-26 user mandate to consolidate
// decision-related stories. ColorSemantic + MonthViewOnlyRule + ReadOnlyRule kept as separate principles.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'
import { Calendar, type CalendarEvent } from './calendar'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { Field, FieldLabel } from '@/design-system/components/Field/field'

const meta: Meta = {
  title: 'Design System/Components/Calendar/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// 視覺基線同時釘住顯示月與 today SSOT，避免跨月/換日造成 snapshot 漂移。
const now = new Date(2026, 6, 15)
const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
// 日期格 / 事件方塊各自二擇一:可點就接回調(型別層必填),不可點就寫 readOnlyDates / readOnlyEvents
//(calendar.spec.md「日期格與事件方塊:可點或唯讀」)。原則頁的可點範例也給**看得見的反應**,
// 不給空函式(空函式 = 點了沒反應)。與展示頁 calendar.stories.tsx 同一種示範手法。
const demoAddOnDate = (date: Date) => alert(`在 ${date.getMonth() + 1}/${date.getDate()} 新增事件`)
const demoOpenEvent = (event: CalendarEvent) => alert(`點了事件:${event.title}`)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-body-lg font-semibold text-foreground mb-3 pb-1 border-b border-divider">{title}</h2>
    <div>{children}</div>
  </section>
)

const Rule: React.FC<{ title: string; note: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <div className="mb-8 max-w-5xl">
    <div className="text-body-lg font-medium text-foreground mb-1">{title}</div>
    <div className="text-body text-fg-secondary mb-3">{note}</div>
    <div className="rounded-md border border-divider p-4 bg-surface">{children}</div>
  </div>
)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose">
          <p>適合 Calendar 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li>
              <LinkTo kind="Design System/Components/Calendar/展示" name="團隊行事曆"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">團隊行事曆</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/Calendar/展示" name="內容發佈月曆"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">內容發佈月曆</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/Calendar/展示" name="空行事曆"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">空行事曆</span></LinkTo>
            </li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方「vs 近親」)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代">
        <div className="space-y-4 text-body text-fg-secondary max-w-3xl">
          <ul className="list-disc pl-5 space-y-2">
            <li><b>選單一日期</b>(Due date / Birthday)→ 用 <code>DatePicker</code></li>
            <li><b>選日期範圍</b>(訂單 from-to)→ 用 <code>{'<DatePicker.Range>'}</code></li>
            <li><b>任務看板</b>(非時間軸 view)→ 用 <code>DataTable</code> + status column</li>
            <li><b>時段可用性</b>(會議訂房 slot picker)→ 獨立 time-slot picker(未來 primitive)</li>
            <li><b>Mini month widget</b>(sidebar 小月曆)→ 用 <code>DateGrid</code>(不 fullscreen)</li>
          </ul>
        </div>
      </Section>

      <Section title="vs 近親 — Calendar vs DatePicker">
        <Rule
          title="Calendar 是「看事件」的 page canvas,DatePicker 是「選日期」的 form control"
          note="名字相近,職責完全不同。Calendar 是月行事曆事件 canvas;DatePicker 是欄位,選單一日期寫入 form state。"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-body font-medium mb-2">DatePicker(form control)</div>
              <Field>
                <FieldLabel>Due date</FieldLabel>
                <DatePicker />
              </Field>
            </div>
            <div>
              <div className="text-body font-medium mb-2">Calendar(event canvas)</div>
              <div className="h-80 border border-divider rounded-md overflow-hidden">
                <Calendar
                  defaultReferenceDate={now}
                  today={now}
                  onDateClick={demoAddOnDate}
                  onEventClick={demoOpenEvent}
                  events={[
                    { id: 'a', title: 'Design review', start: `${thisMonth}-05`, end: `${thisMonth}-05`, color: 'blue' },
                  ] as CalendarEvent[]}
                />
              </div>
            </div>
          </div>
        </Rule>
      </Section>
    </div>
  ),
}

// ── 原則 — Event color 是類別語意,不是 severity ─────────────────────────────
export const ColorSemantic: Story = {
  name: '事件顏色類別語意',
  render: () => (
    <div className="space-y-6">
      <Rule
        title="事件的 color 是「這是哪一類事件」(團隊 / 專案),不是嚴重度"
        note="Calendar 的 color = 12 categorical 色相,與 Tag / Avatar 共用同一組 SSOT(blue / green / deep-orange / yellow / red / orange / amber / lime / turquoise / indigo / purple / magenta),色名 1:1 對 color token。色相本身無 severity 語義——紅色 ≠「緊急」、橙色 ≠「警告」,只是類別選擇。若要標示緊急,改用事件標題文字(例:「🚨 Release deadline」)。下例以藍 / 綠 / 橙 / 紫四種色相代表四個不同團隊或專案。"
      >
        <div className="h-80 border border-divider rounded-md overflow-hidden">
          <Calendar
            defaultReferenceDate={now}
            today={now}
            onDateClick={demoAddOnDate}
            onEventClick={demoOpenEvent}
            events={[
              { id: '1', title: 'Design review', start: `${thisMonth}-05`, end: `${thisMonth}-05`, color: 'blue' },
              { id: '2', title: 'Sprint planning', start: `${thisMonth}-08`, end: `${thisMonth}-08`, color: 'blue' },
              { id: '3', title: 'Release deadline', start: `${thisMonth}-12`, end: `${thisMonth}-12`, color: 'orange' },
              { id: '4', title: 'Q review', start: `${thisMonth}-18`, end: `${thisMonth}-18`, color: 'green' },
              { id: '5', title: 'Marketing sync', start: `${thisMonth}-22`, end: `${thisMonth}-22`, color: 'purple' },
            ] as CalendarEvent[]}
          />
        </div>
      </Rule>
    </div>
  ),
}

// ── 原則 — 支援範圍:月 view only(2026-07-14 rename MvpScope → MonthViewOnlyRule
//    per audit Dim 14 + category-templates.md「Canonical naming」:「MVP」為開發 roadmap
//    內部用語,reader-facing name 必人話;component-specific {Topic}Rule idiom 保留)──────
export const MonthViewOnlyRule: Story = {
  name: '僅支援月檢視',
  render: () => (
    <div className="space-y-6">
      <Rule
        title="只支援月檢視;週 / 日檢視、拖拉新增事件尚未實作"
        note="世界級行事曆(Google / Notion / Fantastical)最常用的是月檢視(8 成以上的使用情境是「看本月整體」)。本元件目前只實作月檢視,週 / 日檢視、拖拉新增事件、就地編輯都留待後續增量。若當下產品需要週檢視,可改用 DataTable(以橫向週為欄)搭配自訂事件樣式,不勉強套用 Calendar。"
      >
        <div className="h-80 border border-divider rounded-md overflow-hidden">
          <Calendar
            defaultReferenceDate={now}
            today={now}
            onDateClick={demoAddOnDate}
            onEventClick={demoOpenEvent}
            events={[
              { id: '1', title: 'Sprint planning', start: `${thisMonth}-08`, end: `${thisMonth}-08`, color: 'blue' },
            ] as CalendarEvent[]}
          />
        </div>
      </Rule>
    </div>
  ),
}

// ── 原則 — 日期格與事件方塊:可點就接回調,不可點就明說唯讀(2026-09-26,待辦總帳 L8 / C15)──────────────
export const ReadOnlyRule: Story = {
  name: '唯讀的日期格與事件',
  render: () => (
    <div className="space-y-6">
      <Rule
        title="點了沒反應的東西不長成可點的樣子:日期格、事件方塊各自宣告「可點」或「唯讀」"
        note="日期格(點一下 = 在這天新增)與事件方塊(點一下 = 打開事件)是兩個獨立的點擊目標。可點就傳回調 onDateClick / onEventClick —— 整格滑過變色、日期數字是按鈕、事件方塊是按鈕;沒有這個動作就寫 readOnlyDates / readOnlyEvents —— 不亮、不是按鈕、游標不變,鍵盤仍可用方向鍵在格陣裡走。兩者都不能省略不講:型別層要求二擇一,不會出現「看起來能點、點了沒反應」的格子。下例是公司假日行事曆:假日只是標記、沒有詳情可開,日子也不在這裡新增 → 兩者都唯讀。"
      >
        {/* 整月都要看得到(24 號第二個假日在第四週):高度同 calendar.anatomy.stories.tsx 整月示範 */}
        <div className="h-[560px] border border-divider rounded-md overflow-hidden">
          <Calendar
            defaultReferenceDate={now}
            today={now}
            readOnlyDates
            readOnlyEvents
            events={[
              { id: 'h1', title: '公司創立紀念日', start: `${thisMonth}-03`, end: `${thisMonth}-03`, color: 'green', allDay: true },
              { id: 'h2', title: '年中盤點(辦公室關閉)', start: `${thisMonth}-24`, end: `${thisMonth}-24`, color: 'green', allDay: true },
            ] as CalendarEvent[]}
          />
        </div>
      </Rule>
    </div>
  ),
}

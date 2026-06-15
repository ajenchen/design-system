// @principles-rationale: Merged WhenToUse + CalendarVsDatePickerRule + NotAnEventViewRule
// into a single `UsageGuidance` story (3 sections) per 2026-04-26 user mandate to
// consolidate decision-related stories. ModeRule / VisualTokenRule / LocaleRule kept.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'
import { useState } from 'react'
import { zhTW } from 'date-fns/locale/zh-TW'
import type { DateRange } from 'react-day-picker'
import { DateGrid } from './date-grid'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'

const meta: Meta = {
  title: 'Design System/Internal/DateGrid/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ──────────────────────────────────────────────────────────────────

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-body-lg font-semibold text-foreground mb-3 pb-1 border-b border-divider">{title}</h2>
    <div>{children}</div>
  </section>
)

const Rule = ({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-wrap gap-5 items-start">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p
    className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}
  >
    {children}
  </p>
)

const Demo = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-2 min-w-0">
    <span className="text-footnote text-fg-secondary font-medium">{title}</span>
    <div className="bg-surface-raised border border-border rounded-lg p-2 w-fit">{children}</div>
  </div>
)

// ── Stories ──────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [date, setDate] = useState<string | null>('2026-04-20')
    const [inline, setInline] = useState<Date | undefined>(new Date(2026, 3, 20))

    return (
      <div>
        <Section title="何時用">
          <div className="prose prose-sm max-w-prose">
            <p>適合 DateGrid 的真實業務場景(點擊跳轉「展示」頁範例):</p>
            <ul className="space-y-1">
              <li>
                <LinkTo kind="Design System/Internal/DateGrid/展示" name="單日 — 生日 / 到期日"><span className="text-primary hover:underline font-medium cursor-pointer">Single — 生日 / 到期日</span></LinkTo>
              </li>
              <li>
                <LinkTo kind="Design System/Internal/DateGrid/展示" name="多日 — 活動可參加日期"><span className="text-primary hover:underline font-medium cursor-pointer">Multiple — 活動可參加日期</span></LinkTo>
              </li>
              <li>
                <LinkTo kind="Design System/Internal/DateGrid/展示" name="範圍 — 分析時段 / 訂單範圍"><span className="text-primary hover:underline font-medium cursor-pointer">Range — 分析時段 / 訂單範圍</span></LinkTo>
              </li>
              <li>
                <LinkTo kind="Design System/Internal/DateGrid/展示" name="行內 — 儀表板小卡"><span className="text-primary hover:underline font-medium cursor-pointer">行內 — Linear 專案截止日小卡</span></LinkTo>
              </li>
            </ul>
            <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方「vs 近親」)。</p>
          </div>
        </Section>

        <Section title="何時不用 + 替代">
          <Rule
            title="DateGrid 是「日期 picker」,不是「事件日曆」"
            note="本元件只處理日期選擇(選一天、多天、範圍)。若需求是「顯示一個月內的事件清單、拖曳事件、切換 week / month / agenda view」——那是事件行事曆,需要專用元件(Google Calendar / Outlook 類),不屬於本元件範疇。"
          >
            <Demo title="✅ 正確用途:選日">
              <DateGrid mode="single" defaultMonth={new Date()} locale={zhTW} />
            </Demo>
          </Rule>

          <Rule
            title="事件行事曆需要的能力(本元件沒有)"
            note="判斷需求時看這幾個指標:一格日內要顯示多個事件、事件可拖曳移動、需要 week / day / agenda 視圖切換、事件跨多日的視覺連線。任一命中 → 需要專用行事曆元件。"
          >
            <Label warn>
              ❌ 事件 overlay(一格顯示「09:00 Standup · 14:00 Design review」)<br />
              ❌ Week / Day 視圖切換<br />
              ❌ 拖曳事件改時間<br />
              ❌ 跨日事件的連線 bar
            </Label>
          </Rule>

          <Rule
            title="判斷法 — 問「使用者產生的輸出是什麼」"
            note="輸出是「一個日期值 / 多個日期值 / 一段日期範圍」→ DateGrid;輸出是「操作了某個事件(建立 / 移動 / 編輯)」→ 事件行事曆。"
          >
            <Label>
              報表查詢時段、活動 RSVP 日、個資生日、訂房日期 → DateGrid<br />
              會議日程、任務日曆、月曆視圖瀏覽 → 事件行事曆(專用元件)
            </Label>
          </Rule>
        </Section>

        <Section title="vs 近親 — DateGrid(inline)vs DatePicker(field trigger)">
          <Rule
            title="DateGrid — inline 月曆,頁面上常駐可見"
            note="dashboard 小卡、側欄 widget、日期 filter bar。使用者一眼就看到整月,不需點開。DateGrid 是純 primitive,不自包 Popover。"
          >
            <Demo title="Linear 專案截止日 widget">
              <div className="flex flex-col gap-2 w-fit">
                <span className="text-caption text-fg-muted px-1">Project deadline</span>
                <DateGrid
                  mode="single"
                  selected={inline}
                  onSelect={setInline}
                  defaultMonth={inline}
                  locale={zhTW}
                />
              </div>
            </Demo>
          </Rule>

          <Rule
            title="DatePicker — field 風格 trigger,點開才顯示月曆"
            note="表單欄位、設定頁、table cell 編輯。使用者先看到日期值,需要改時才展開選擇器。DatePicker 內部消費 DateGrid 作為 popup 內容。"
          >
            <Demo title="Notion 設定頁:訂閱續約日">
              <div className="w-[220px]">
                <DatePicker value={date} onChange={setDate} clearable />
              </div>
            </Demo>
          </Rule>

          <Rule
            title="判斷法 — 看「頁面是否常駐顯示整月」"
            note="常駐(月曆是主要內容)→ DateGrid;輔助(主要是一個欄位,偶爾改)→ DatePicker。空間有限的表單永遠用 DatePicker,不要塞整個月曆進表單。"
          >
            <Label>
              常駐月曆 = 使用者「在選日的脈絡中」(排班、活動、分析時段篩選);
              DatePicker = 使用者「順手填一個日」(個資、發票、提醒)
            </Label>
          </Rule>
        </Section>
      </div>
    )
  },
}

export const ModeRule: Story = {
  name: '模式 選擇',
  render: () => {
    const ModeDemo = () => {
      const today = new Date()
      const [single, setSingle] = useState<Date | undefined>(
        new Date(today.getFullYear(), today.getMonth(), 10),
      )
      const [multiple, setMultiple] = useState<Date[]>([
        new Date(today.getFullYear(), today.getMonth(), 5),
        new Date(today.getFullYear(), today.getMonth(), 12),
        new Date(today.getFullYear(), today.getMonth(), 20),
      ])
      const [range, setRange] = useState<DateRange | undefined>({
        from: new Date(today.getFullYear(), today.getMonth(), 8),
        to: new Date(today.getFullYear(), today.getMonth(), 18),
      })

      return (
        <div className="flex flex-col gap-10">
          <Rule
            title="single — 單一日期(生日、到期日、截止日)"
            note="資料欄位只接受一個日期值。使用者心智模型:「我要選一個日」。點新日取代舊選。此 mode 是 DatePicker 內建行為,最常見。"
          >
            <Demo title="Stripe 發票到期日 / Notion 個人生日">
              <DateGrid
                mode="single"
                selected={single}
                onSelect={setSingle}
                defaultMonth={today}
                locale={zhTW}
              />
            </Demo>
          </Rule>

          <Rule
            title="multiple — 不連續多日(活動可參加日、排休日)"
            note="使用者要標記多個獨立日期,彼此不相關。參考 Luma RSVP 活動日標記、請假系統排休日。點已選日 = 取消。"
          >
            <Demo title="Luma 活動可參加日">
              <DateGrid
                mode="multiple"
                selected={multiple}
                onSelect={(d) => setMultiple(d ?? [])}
                defaultMonth={today}
                locale={zhTW}
              />
            </Demo>
          </Rule>

          <Rule
            title="range — 連續範圍(from → to)"
            note="資料語意是「一段時間」,start 與 end 有順序關係。參考 Stripe 分析時段、Vercel Analytics 期間、Airbnb 訂房 check-in/out。"
          >
            <Demo title="Stripe Dashboard 查詢時段">
              <DateGrid
                mode="range"
                selected={range}
                onSelect={setRange}
                defaultMonth={today}
                locale={zhTW}
              />
            </Demo>
          </Rule>

          <Rule
            title="❌ 用錯 mode 的常見誤用"
            note="mode 決定值的型別與鍵盤行為。用錯會讓 onSelect 收到不符預期的值型,也會誤導使用者對「可以選多少」的預期。"
          >
            <Label warn>
              ❌ 連續範圍用 multiple(使用者要點滿每一天)<br />
              ❌ 單一到期日用 range(使用者不知道要點第二次做什麼)<br />
              ❌ 不連續多日用 range(中間日期會被強制填入)
            </Label>
          </Rule>
        </div>
      )
    }
    return <ModeDemo />
  },
}

export const VisualTokenRule: Story = {
  name: '視覺設計變數 統一',
  render: () => (
    <div>
      <Rule
        title="selected = bg-primary · today = 數字下方藍色底線"
        note="選中日用 primary 實心填滿(和系統其他選中態如 Checkbox checked、Tab active 一致);今日但未選 = 數字下方藍色底線 bar(after pseudo,告訴使用者「這是今天」,但不搶選中視覺)。兩者同時成立時實心 selected 視覺優先,底線 bar 切 on-emphasis(白)保持可見。"
      >
        <Demo title="今日 + 已選他日">
          <DateGrid
            mode="single"
            selected={(() => {
              const d = new Date()
              d.setDate(d.getDate() + 3)
              return d
            })()}
            defaultMonth={new Date()}
            locale={zhTW}
          />
        </Demo>
      </Rule>

      <Rule
        title="前後月日期 = text-fg-muted(淡化,比 disabled 弱),禁用日 = text-fg-disabled(semantic)"
        note="前後月的補格讓使用者認得「跨月邊界」但不搶主要月份的閱讀焦點;disabled 日期保留可見(告訴使用者「這天存在但不能選」),套 `bg-disabled` + `text-fg-disabled` + `cursor-not-allowed`,點擊阻擋靠 react-day-picker 給 button 的 native `disabled` 屬性(對齊 Button disabled 設計準則,非 opacity)。"
      >
        <Demo title="showOutsideDays + disabled 過去日期">
          <DateGrid
            mode="single"
            defaultMonth={new Date()}
            locale={zhTW}
            disabled={{ before: new Date() }}
          />
        </Demo>
      </Rule>

      <Rule
        title="❌ 禁止硬寫色值繞過 token"
        note="bg-primary / text-fg-disabled / ring-primary 等全部來自 DS semantic token。dark mode / brand swap 會自動聯動,若改用 bg-blue-500 / text-gray-400 會在 dark mode 顯示錯誤顏色。"
      >
        <Label warn>
          ❌ bg-blue-500(硬色) → ✅ bg-primary(semantic)<br />
          ❌ text-gray-400 → ✅ text-fg-disabled<br />
          ❌ 自寫 box-shadow → ✅ ring-1 ring-primary<br />
          ❌ 直接操作 .rdp-* 原生 class → ✅ 透過 classNames prop 覆寫
        </Label>
      </Rule>
    </div>
  ),
}

export const LocaleRule: Story = {
  name: 'Locale 與週首日',
  render: () => (
    <div>
      <Rule
        title="locale prop 控制週首日與星期標頭語言"
        note="react-day-picker 接受 date-fns locale 物件。週首日由 locale 物件決定,不以語言籠統判斷:en-US 週日起、en-GB 週一起——同樣是英文,週首日就不同;zhTW / de / fr(date-fns 內建值)都是週一起。下方對照:zhTW 首欄是週一,en-US 首欄是週日。Consumer 決定傳哪個 locale,DateGrid 不內建語言。"
      >
        <Demo title="zhTW(繁體中文 · 週一起)">
          <DateGrid mode="single" defaultMonth={new Date(2026, 3, 1)} locale={zhTW} />
        </Demo>
        <Demo title="預設(en-US · 週日起)">
          <DateGrid mode="single" defaultMonth={new Date(2026, 3, 1)} />
        </Demo>
      </Rule>

      <Rule
        title="不自訂 i18n layer"
        note="DateGrid 不包 i18n context、不讀 app-level locale 設定。原因:date-fns locale 已是事實標準(Vercel / Stripe / Linear 都用),重新發明會綁架消費端的國際化策略。想全站同步週首日 → app 層統一傳 locale prop。"
      >
        <Label>
          ✅ 全站統一:app 層 createContext(locale) → 所有 DateGrid 消費端讀 context → 傳 locale prop<br />
          ❌ DateGrid 自包 i18nProvider(劫持 app-level 配置,違反「元件不自包 Provider」原則)
        </Label>
      </Rule>

      <Rule
        title="週首日不可在元件內硬寫"
        note="若需要強制週一起(德法慣例),從 locale 來,不用 weekStartsOn prop 硬覆蓋(會讓同一 locale 在不同頁不一致)。"
      >
        <Label warn>
          ❌ 元件內寫死 weekStartsOn={'{1}'}(破壞 locale 一致性)<br />
          ✅ 傳 locale={'{de}'} → 週首自動從 locale 決定
        </Label>
      </Rule>
    </div>
  ),
}

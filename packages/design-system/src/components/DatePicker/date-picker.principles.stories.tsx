// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: UsageGuidance merges WhenToUse + WhenNotToUse into single 使用指引 story per refactor task (2026-04-26)
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { DatePicker } from './date-picker'

const meta: Meta = {
  title: 'Design System/Components/DatePicker/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-xs">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-heading-3 font-bold text-foreground mb-4 pb-2 border-b border-border">{title}</h2>
    {children}
  </section>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose mb-8">
          <p>適合 DatePicker 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li><LinkTo kind="Design System/Components/DatePicker/展示" name="四模式"><span className="text-primary hover:underline font-medium cursor-pointer">請假單送審後日期欄位從可編輯轉唯讀/純展示(四模式)</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/DatePicker/展示" name="可清除"><span className="text-primary hover:underline font-medium cursor-pointer">篩選器的選填截止日,填錯一鍵清空(可清除)</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/DatePicker/展示" name="尺寸"><span className="text-primary hover:underline font-medium cursor-pointer">緊湊工具列與標準表單的尺寸對應(尺寸)</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/DatePicker/展示" name="範圍模式:訂房 / 訂機票情境"><span className="text-primary hover:underline font-medium cursor-pointer">Range:訂房 / 訂機票情境</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/DatePicker/展示" name="展示樣式"><span className="text-primary hover:underline font-medium cursor-pointer">審批詳情頁唯讀展示申請日期(展示樣式)</span></LinkTo></li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親 段)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代方案">
        <Rule
          title="❌ 不用 DatePicker 做純文字日期輸入(API debug)"
          note="API 表單不需 picker 互動 → 用 Input type='text'。開發者工具的日期欄用純文字"
        >
          <Label warn>純文字 ISO date → Input,不需 picker UI</Label>
        </Rule>

        <Rule
          title="❌ 不用其他 calendar library 平行實作"
          note="未來若需要 Date Range / DateTime,擴充本 DateGrid(`../DateGrid/date-grid.tsx`)而非引入第二個 library——避免兩套視覺語言在同一系統並存"
        >
          <Label>實作細節見 Design System / Components / DatePicker / 設計規格</Label>
        </Rule>

        <Rule
          title="❌ 不覆寫 Calendar token 為非 DS 色"
          note="Calendar 視覺 token(bg-primary / ring-primary / neutral-hover 等)必須來自 semantic token。硬寫 #xxx / bg-blue-500 會破壞 dark mode 聯動、跟其他浮層語言分岔"
        >
          <Label>token 表見設計規格 → Calendar 內部 token</Label>
        </Rule>
      </Section>

      <Section title="vs 近親元件">
        <Rule
          title="❌ 不用 DatePicker 選擇日期範圍(from-to)→ DatePicker.Range"
          note="日期範圍用 DatePicker.Range(雙 input + 共用 calendar,對齊 Ant DatePicker.RangePicker)。Stripe 的 date range filter 用雙 picker"
        >
          <Label warn>日期範圍 → DatePicker.Range,不是單一 DatePicker × 2</Label>
        </Rule>

        <Rule
          title="❌ 不用 DatePicker 選時間(時 / 分 / 秒)→ TimePicker"
          note="只選時間改用 TimePicker。如需同時選日期 + 時間 → DatePicker 加 showTime prop(canonical 2026-05-02,Ant idiom;非獨立並列組合,見 spec「showTime」段)。Notion calendar event 的 time 欄是獨立 TimePicker"
        >
          <Label warn>時間用 TimePicker,日期 + 時間用 showTime prop</Label>
        </Rule>

        <Rule
          title="❌ 不用 DatePicker 做月檢視 event calendar → Calendar 元件"
          note="Event 檢視(看某月有哪些事件)改用 Calendar 元件(是頁面 canvas 不是 form field)。Notion calendar 檢視用 Calendar,不用 DatePicker"
        >
          <Label warn>Event calendar 檢視 → Calendar 元件,DatePicker 只選日期</Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const CalendarRule: Story = {
  name: '自建 Calendar + 視覺一致性',
  render: () => {
    const [deadline, setDeadline] = React.useState('2026-05-15')
    const [releaseDate, setReleaseDate] = React.useState('2025-12-25')
    return (
      <div>
        <Rule
          title="Edit 用本 DS 自建 Calendar + Popover"
          note="點擊 trigger 開啟的 Calendar 使用本 DS 的 overlay-surface token(與 Dialog / SelectMenu / Combobox 相同)——浮層的圓角、陰影、間距、typography 跨元件視覺整齊。瀏覽器原生 picker 視覺不受控、跨 Chrome/Safari/Firefox 不一致,無法達成世界級設計系統的視覺連續性"
        >
          <DatePicker value={deadline} onChange={setDeadline} />
          <Label>↑ 專案截止日:點擊 trigger → Popover 打開 Calendar,視覺與 SelectMenu 一致</Label>
        </Rule>

        <Rule
          title="Calendar 內部 token 全由 DS 控制"
          note="Calendar 的月份 caption / nav 按鈕 / 星期標頭 / 日格 / hover / selected / today 全部由 DS token 驅動:hover 用 ring-primary 透明底圈、selected 用 primary 藍底白字圓、today 用 primary 底部 bar(after 偽元素)。切 dark mode 自動聯動,不需元件內重寫"
        >
          <DatePicker value={releaseDate} onChange={setReleaseDate} />
          <Label>↑ 發佈日:Calendar 所有視覺 token 來自 semantic.css</Label>
        </Rule>
      </div>
    )
  },
}

export const FormattingRule: Story = {
  name: '顯示格式化',
  render: () => (
    <div>
      <Rule
        title="格式化跨模式一致 — 預設 YYYY/MM/DD,傳 formatOptions / locale 走 Intl.DateTimeFormat"
        note="未傳格式 prop 時預設直接組 YYYY/MM/DD(locale-independent);傳 formatOptions + locale 才啟用 Intl.DateTimeFormat,同時控制 readonly / disabled 的 Display 文字與 edit trigger 顯示文字。跨模式一致、跨頁面可預期。Calendar popup 的月份語言由 Calendar 內部 locale 處理"
      >
        <DatePicker
          mode="readonly"
          value="2026-05-15"
          formatOptions={{ year: 'numeric', month: 'short', day: 'numeric' }}
        />
        <DatePicker
          mode="readonly"
          value="2026-05-15"
          locale="zh-TW"
          formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }}
        />
        <Label>↑ 專案截止日:formatOptions 控制格式;locale 控制語言</Label>
      </Rule>

      <Rule
        title="Edit trigger 文字也受 formatOptions / locale 控制"
        note={'原本原生 <input type="date"> 的 trigger 格式受瀏覽器 locale 控制無法干預;改自建後,edit trigger 顯示的已選日期也走 Intl.DateTimeFormat——跟 Display 模式完全一致'}
      >
        <DatePicker
          value="2026-05-15"
          onChange={() => {}}
          locale="zh-TW"
          formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }}
        />
        <Label>↑ 專案截止日:edit trigger 顯示「2026年5月15日」,與 readonly 一致</Label>
      </Rule>

      <Rule
        title="null 值統一顯示 em dash"
        note="Display 模式 null / undefined 顯示 —(fg-muted),與其他 Field 元件一致"
      >
        <DatePicker mode="readonly" value={null} />
      </Rule>
    </div>
  ),
}

export const ClearableRule: Story = {
  name: '可清空 使用',
  render: () => {
    const [value, setValue] = React.useState<string | null>('2026-05-15')
    return (
      <div>
        <Rule
          title="日期是選填時才開 clearable"
          note="必填的日期欄位(出生日、到期日)不該有 clear——避免使用者不小心清空後不知怎麼填回。選填日期(備註日期、提醒日)開啟 clearable 才合理"
        >
          <DatePicker value={value} onChange={setValue} clearable />
          <Label>↑ 選填情境:有值時右側出現 X,清除後回到空白</Label>
        </Rule>

        <Rule
          title="readonly / disabled 不顯示 clear"
          note="clear 是 edit 行為,readonly 的 field 邏輯上不可操作,clear 按鈕既無法點擊也造成視覺誤導"
        >
          <DatePicker mode="readonly" value="2026-05-15" clearable />
          <Label>↑ readonly 模式下即使傳 clearable 也不顯示 clear 按鈕</Label>
        </Rule>
      </div>
    )
  },
}

import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { DatePicker, DatePickerDisplay } from './date-picker'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof DatePicker> = {
  title: 'Design System/Components/DatePicker/展示',
  component: DatePicker,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '日期選擇元件。外觀同 Select，Calendar icon 取代 ChevronDown。支援 clearable 和格式化選項。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof DatePicker>

/* ── 基本用法 ── */
export const Default: Story = {
  name: '基本用法',
  render: () => {
    const [value, setValue] = React.useState('2026-04-02')
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <DatePicker value={value} onChange={setValue} />
        <p className="text-caption text-fg-muted">目前值：{value || '(empty)'}</p>
      </div>
    )
  },
}

/* ── 三種模式 ── */
export const Modes: Story = {
  name: '三種模式',
  render: () => (
    <div className="flex flex-col gap-6 max-w-xs">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
        <DatePicker value="2026-04-02" onChange={() => {}} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <DatePicker mode="readonly" value="2026-04-02" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        <DatePicker mode="disabled" value="2026-04-02" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly (null)</h3>
        <DatePicker mode="readonly" value={null} />
      </div>
    </div>
  ),
}

/* ── 可清除 ── */
export const Clearable: Story = {
  name: '可清除',
  render: () => {
    const [value, setValue] = React.useState('2026-04-02')
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <p className="text-caption text-fg-muted">有值時右側出現清除按鈕</p>
        <DatePicker value={value} onChange={setValue} clearable />
      </div>
    )
  },
}

/* ── 尺寸與 Button 對齊 ── */
export const SizeAlignment: Story = {
  name: '尺寸',
  render: () => {
    const [sm, setSm] = React.useState('2026-04-02')
    const [md, setMd] = React.useState('2026-04-02')
    const [lg, setLg] = React.useState('2026-04-02')
    const states: Record<string, [string, (v: string) => void]> = { sm: [sm, setSm], md: [md, setMd], lg: [lg, setLg] }
    return (
      <div className="flex flex-col gap-4">
        {(['sm', 'md', 'lg'] as const).map(size => (
          <div key={size} className="flex items-center gap-3">
            <DatePicker size={size} value={states[size][0]} onChange={states[size][1]} className="max-w-xs" />
            <Button size={size}>送出</Button>
            <span className="text-caption text-fg-muted">size="{size}"</span>
          </div>
        ))}
      </div>
    )
  },
}

/* ── DatePicker.Range — Ant-style 區間選擇(2026-04-21 新增)── */
export const RangePicker: Story = {
  name: 'Range:訂房 / 訂機票情境',
  render: () => {
    const [range, setRange] = React.useState<[string | null, string | null]>(['2026-04-15', '2026-04-20'])
    return (
      <div className="flex flex-col gap-4 max-w-md">
        <p className="text-caption text-fg-muted">
          雙 input + 中間箭頭。點 start input 開 popover + activeEnd='start';點 end input 同理。Auto-advance:選完 start 自動切 end。clearable=true → trigger 顯示 X 清空按鈕。
        </p>
        <DatePicker.Range value={range} onChange={setRange} clearable />
        <p className="text-caption text-fg-muted">
          目前值:from={range[0] ?? '(空)'} / to={range[1] ?? '(空)'}
        </p>
        <p className="text-caption text-fg-muted">Empty 初始狀態(無 X 因為沒值):</p>
        <DatePicker.Range
          value={[null, null]}
          onChange={() => {}}
          placeholder={['入住日期', '退房日期']}
          clearable
        />
      </div>
    )
  },
}

/* ── 錯誤狀態(form validation 表現)── */
export const WithError: Story = {
  name: '錯誤狀態',
  render: () => (
    <div className="flex flex-col gap-4 max-w-xs">
      <p className="text-caption text-fg-muted">
        error=true 時 trigger border 切 error palette,hover/focus 同步切 error-hover。
      </p>
      <DatePicker error value="2026-04-02" onChange={() => {}} />
      <DatePicker error value={null} onChange={() => {}} placeholder="必填日期" />
    </div>
  ),
}

/* ── showTime:datetime 模式(2026-05-02 新增,合併原 DateTimePicker)── */
export const ShowTime: Story = {
  name: 'showTime:會議排程',
  render: () => {
    const [single, setSingle] = React.useState<string>('2026-04-15T14:30:00')
    return (
      <div className="flex flex-col gap-4 max-w-xs">
        <p className="text-caption text-fg-muted">
          showTime 啟用後:popover 右側出現 H/M 滾選欄;footer「此刻 / 確定」(needConfirm=true 預設)。Value 變 ISO datetime。
        </p>
        <DatePicker showTime value={single} onChange={setSingle} clearable />
        <p className="text-caption text-fg-muted">目前值:{single || '(空)'}</p>
        <p className="text-caption text-fg-muted mt-4">會議常用 minuteStep=15:</p>
        <DatePicker showTime minuteStep={15} value={single} onChange={setSingle} />
      </div>
    )
  },
}

/* ── OpenSnapshot:Range popover 內 range track 視覺驗證(M15)── */
export const RangePopoverOpen: Story = {
  name: 'Range:浮層展開狀態',
  parameters: { docs: { description: { story: 'Visual-audit OpenSnapshot — popover 內 DateGrid mode=range,verify range track 高度 = button 高度(28×28 @ md),不留 cell 上下 2px 多餘空白(Q8 canonical 2026-05-02)。' } } },
  render: () => {
    const [range, setRange] = React.useState<[string | null, string | null]>(['2026-05-04', '2026-05-12'])
    return (
      <div style={{ paddingBottom: 480 }}>
        <DatePicker.Range value={range} onChange={setRange} className="max-w-md" />
        {/* play 函式自動 click trigger,讓 popover 開著截圖。沒有 play 可用 storybook controls。 */}
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
    trigger?.click()
    await new Promise((r) => setTimeout(r, 200))
  },
}

/* ── OpenSnapshot:showTime popover 內 TimePicker side panel(M15)── */
export const ShowTimePopoverOpen: Story = {
  name: 'showTime:浮層展開狀態',
  parameters: { docs: { description: { story: 'Visual-audit OpenSnapshot — popover 內 DateGrid + TimePickerSidePanel(header + 滾選欄)+ footer。Verify TimePicker 高度 = calendar 高度,header 對齊 calendar 的「年月」(canonical 2026-05-02)。' } } },
  render: () => {
    const [v, setV] = React.useState<string>('2026-04-15T14:30:00')
    return (
      <div style={{ paddingBottom: 480 }}>
        <DatePicker showTime value={v} onChange={setV} className="max-w-xs" />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLElement>('[role="combobox"]')
    trigger?.click()
    await new Promise((r) => setTimeout(r, 200))
  },
}

/* ── OpenSnapshot:showTime Range popover(activeEnd='start')── */
export const ShowTimeRangePopoverOpen: Story = {
  name: 'showTime Range:浮層展開狀態',
  parameters: { docs: { description: { story: 'Visual-audit — Range showTime popover:numberOfMonths=1(只渲 active end 月份)+ TimePickerSidePanel + footer。Verify Ant idiom「一次 edit 一端」(canonical 2026-05-02)。' } } },
  render: () => {
    const [range, setRange] = React.useState<[string | null, string | null]>([
      '2026-04-15T09:00:00',
      '2026-04-20T18:00:00',
    ])
    return (
      <div style={{ paddingBottom: 480 }}>
        <DatePicker.Range showTime value={range} onChange={setRange} className="max-w-md" />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const inputs = canvasElement.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')
    inputs[0]?.click()  // start input
    await new Promise((r) => setTimeout(r, 200))
  },
}

/* ── HoverState:Range middle hover blue ring 驗證(M11 + Bug C 真實截圖)── */
export const RangeMiddleHoverState: Story = {
  name: 'Range middle:hover 狀態',
  parameters: { docs: { description: { story: 'Visual-audit — 開 range popover 並 userEvent.hover 一個 range_middle date,verify 藍色 1.5px ring 顯示在 grey track 之上(Bug C canonical 2026-05-02)。CSS :hover 需真實 pointer event,用 storybook/test userEvent.hover 觸發。' } } },
  render: () => {
    const [range, setRange] = React.useState<[string | null, string | null]>(['2026-05-04', '2026-05-12'])
    return (
      <div style={{ paddingBottom: 480 }}>
        <DatePicker.Range value={range} onChange={setRange} className="max-w-md" />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const { userEvent } = await import('@storybook/test')
    // 1. Open popover via click on start input
    const trigger = canvasElement.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
    if (!trigger) return
    await userEvent.click(trigger)
    await new Promise((r) => setTimeout(r, 250))
    // 2. Hover a range_middle date(May 7,between May 4 start and May 12 end)
    // Popover 在 Portal — query document 而非 canvasElement
    const dayButtons = document.querySelectorAll<HTMLButtonElement>('.rdp-day_button')
    let target: HTMLButtonElement | null = null
    for (const btn of dayButtons) {
      if (btn.textContent?.trim() === '7') {
        const cell = btn.closest('td, [class*="rdp-day"]')
        if (cell?.className.includes('range_middle') || cell?.className.includes('rangeMiddle')) {
          target = btn
          break
        }
      }
    }
    // fallback:即使沒匹配到 range_middle class,也 hover 某個 May 7
    if (!target) {
      target = Array.from(dayButtons).find((b) => b.textContent?.trim() === '7') ?? null
    }
    if (target) await userEvent.hover(target)
    await new Promise((r) => setTimeout(r, 400))
  },
}

/* ── showTime + Range:活動時段 ── */
export const ShowTimeRange: Story = {
  name: 'showTime Range:活動時段',
  render: () => {
    const [range, setRange] = React.useState<[string | null, string | null]>([
      '2026-04-15T09:00:00',
      '2026-04-15T18:00:00',
    ])
    return (
      <div className="flex flex-col gap-4 max-w-lg">
        <p className="text-caption text-fg-muted">
          Range + showTime:點 start input → activeEnd='start' + TimeColumns 編 start 的時間;點 end input 同理。
          兩端都填好 + 按確定才 commit(needConfirm=true 預設)。
        </p>
        <DatePicker.Range
          showTime
          minuteStep={15}
          value={range}
          onChange={setRange}
          placeholder={['活動開始', '活動結束']}
          clearable
        />
        <p className="text-caption text-fg-muted">
          start={range[0] ?? '(空)'} / end={range[1] ?? '(空)'}
        </p>
      </div>
    )
  },
}

/* ── Display（DataTable cell 用）── */
export const Display: Story = {
  name: 'Display',
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">預設</span>
        <DatePickerDisplay value="2026-04-02" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">完整月份</span>
        <DatePickerDisplay value="2026-04-02" formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">zh-TW</span>
        <DatePickerDisplay value="2026-04-02" locale="zh-TW" formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-20">null</span>
        <DatePickerDisplay value={null} />
      </div>
    </div>
  ),
}

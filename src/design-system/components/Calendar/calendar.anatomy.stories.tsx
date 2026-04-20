import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { zhTW } from 'date-fns/locale/zh-TW'
import type { DateRange } from 'react-day-picker'
import { Calendar } from './calendar'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Calendar/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type PartKey =
  | 'caption'
  | 'nav'
  | 'weekday'
  | 'day'
  | 'daySelected'
  | 'dayToday'
  | 'dayHover'
  | 'dayOutside'
  | 'dayDisabled'
  | 'dayFocus'

interface PartSpec {
  label: string
  bg: string
  text: string
  border: string
  extra?: string
}

const PARTS: Record<PartKey, PartSpec> = {
  caption:      { label: '月份標題',    bg: 'transparent',     text: '--foreground',  border: 'transparent', extra: 'text-body font-medium' },
  nav:          { label: 'Nav 按鈕',    bg: 'transparent',     text: '--fg-muted',    border: 'transparent', extra: 'h-7 w-7 rounded-md · hover: bg-neutral-hover' },
  weekday:      { label: '星期標頭',    bg: 'transparent',     text: '--fg-muted',    border: 'transparent', extra: 'text-caption · w-9 h-8' },
  day:          { label: '日格(default)', bg: 'transparent',   text: '--foreground',  border: 'transparent', extra: 'h-9 w-9 rounded-md' },
  daySelected:  { label: 'Selected',     bg: '--primary',       text: 'white',         border: 'transparent' },
  dayToday:     { label: 'Today(未選)', bg: 'transparent',     text: '--foreground',  border: '--primary',   extra: 'ring-1 ring-primary' },
  dayHover:     { label: 'Hover',        bg: '--neutral-hover', text: '--foreground',  border: 'transparent' },
  dayOutside:   { label: 'Outside 月份', bg: 'transparent',     text: '--fg-disabled', border: 'transparent' },
  dayDisabled:  { label: 'Disabled',     bg: 'transparent',     text: '--fg-disabled', border: 'transparent', extra: 'opacity-50 · pointer-events-none' },
  dayFocus:     { label: 'Focus-visible',bg: 'transparent',     text: '--foreground',  border: '--ring',      extra: 'ring-2 ring-ring' },
}

const PART_ORDER: PartKey[] = [
  'day', 'daySelected', 'dayToday', 'dayHover', 'dayFocus', 'dayOutside', 'dayDisabled',
]

/* ═══════════════════════════════════════════════════════════════════════════
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

const AnatomyBox = ({
  label,
  color,
  children,
}: {
  label: string
  color: string
  children?: React.ReactNode
}) => (
  <div
    className="rounded-md px-2 py-1 text-[11px] font-mono border border-dashed flex items-center justify-center"
    style={{
      borderColor: `var(--${color})`,
      backgroundColor: `var(--${color}-subtle)`,
      color: `var(--${color})`,
    }}
  >
    {children ?? label}
  </div>
)

export const Overview = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>結構(Anatomy)</H3>
        <Desc>Calendar 由四個區塊組成:月份 caption、星期標頭、日期網格、左右 nav 按鈕。所有區塊透過 classNames prop 覆寫 react-day-picker 預設樣式,不引入原生 .rdp-* class。</Desc>

        <div className="inline-flex flex-col gap-2 border-2 border-dashed border-primary/30 rounded-lg p-4 bg-surface">
          <div className="flex items-center justify-between gap-2">
            <AnatomyBox label="button_previous" color="info" />
            <AnatomyBox label="caption_label" color="success" />
            <AnatomyBox label="button_next" color="info" />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
              <AnatomyBox key={d} label="weekday" color="warning">{d}</AnatomyBox>
            ))}
            {Array.from({ length: 14 }).map((_, i) => (
              <AnatomyBox key={i} label="day" color="magenta">{i + 1}</AnatomyBox>
            ))}
          </div>
        </div>
      </div>

      <div>
        <H3>視覺一覽</H3>
        <Desc>實際渲染 — single mode,已選今日的前一日展示 selected 視覺,today 以 ring 框定位。</Desc>
        <div className="inline-flex bg-surface-raised border border-border rounded-lg p-2 w-fit">
          <Calendar
            mode="single"
            selected={(() => {
              const d = new Date()
              d.setDate(d.getDate() - 1)
              return d
            })()}
            defaultMonth={new Date()}
            locale={zhTW}
          />
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead>
              <tr>
                <Th>Prop</Th>
                <Th>Type</Th>
                <Th>Default</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              {[
                ['mode', "'single' | 'multiple' | 'range'", "'single'", '選擇模式(react-day-picker v9)'],
                ['selected', 'Date | Date[] | { from; to? }', '—', '受控值,型別依 mode 決定'],
                ['onSelect', '(value) => void', '—', '值變動回呼,參數型別依 mode'],
                ['defaultMonth', 'Date', 'new Date()', '初始可見月份'],
                ['showOutsideDays', 'boolean', 'true', '顯示前後月的灰色日期補滿格'],
                ['numberOfMonths', 'number', '1', '同時顯示幾個月(range 建議 2)'],
                ['disabled', 'Matcher | Matcher[]', '—', '禁用日期(支援 before/after/Date[]/函式)'],
                ['locale', 'Locale', "'en-US'", "date-fns locale,控制週首日與星期標頭語言"],
                ['autoFocus', 'boolean', 'false', '掛載時聚焦到選中日(或今日)'],
                ['classNames', 'Partial<Record<Part, string>>', '—', '合併至本元件預設 classNames(覆寫而非取代)'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}>
                  <Td mono>{p}</Td>
                  <Td mono>{t}</Td>
                  <Td mono>{d}</Td>
                  <Td>{desc}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. 元件檢閱器
   ═══════════════════════════════════════════════════════════════════════════ */

const Z = {
  pad:   { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  grid:  { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  head:  { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  cell:  { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
}

const Legend = ({ c, label }: { c: typeof Z.pad; label: string }) => (
  <span className="inline-flex items-center gap-1 text-[10px]">
    <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
    <span className="font-medium" style={{ color: c.text }}>{label}</span>
  </span>
)

const PropRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
    <span className="text-[11px] text-fg-muted font-medium w-[84px] shrink-0 pt-0.5">{label}</span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

export const Inspector = {
  name: '元件檢閱器',
  render: () => {
    const InspectorInner = () => {
      const today = new Date()
      const [selected] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 15))

      return (
        <div className="flex gap-6 items-start flex-wrap">
          {/* Left: live preview + blueprint */}
          <div className="flex flex-col gap-5">
            <div className="px-6 py-6 rounded-lg bg-canvas border border-divider flex items-center justify-center">
              <div className="bg-surface-raised border border-border rounded-lg p-2">
                <Calendar
                  mode="single"
                  selected={selected}
                  defaultMonth={selected}
                  locale={zhTW}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Legend c={Z.pad} label="外層 p-3" />
                <Legend c={Z.head} label="月份 caption h-9" />
                <Legend c={Z.grid} label="日格 h-9 w-9" />
                <Legend c={Z.cell} label="星期標頭 h-8" />
              </div>

              <div className="inline-flex flex-col gap-0 rounded-md overflow-hidden" style={{ padding: 12, background: Z.pad.bg, border: `2px solid rgba(0,0,0,0.1)` }}>
                <div className="flex items-center justify-center font-mono text-[11px] font-bold" style={{ height: 36, background: Z.head.bg, color: Z.head.text, border: `1.5px dashed ${Z.head.border}` }}>
                  月份 caption · h-9
                </div>
                <div className="grid grid-cols-7 gap-0 mt-2">
                  {['M','T','W','T','F','S','S'].map((d, i) => (
                    <div key={i} className="flex items-center justify-center font-mono text-[10px]" style={{ width: 36, height: 32, background: Z.cell.bg, color: Z.cell.text, border: `1px dashed ${Z.cell.border}` }}>
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: 14 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-center font-mono text-[10px]" style={{ width: 36, height: 36, background: Z.grid.bg, color: Z.grid.text, border: `1px dashed ${Z.grid.border}` }}>
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-fg-muted">日格固定 36x36(h-9 w-9),不隨 density 變化。</p>
            </div>
          </div>

          {/* Right: Inspect panel */}
          <div className="w-[340px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
              <span className="text-[12px] font-semibold text-foreground">Inspect</span>
            </div>

            <div className="px-4 py-1">
              <div className="py-2 border-b border-divider">
                <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span>
              </div>
              <PropRow label="外層 padding">p-3 · 12px</PropRow>
              <PropRow label="月份 gap">gap-3 · 12px</PropRow>
              <PropRow label="日格尺寸">h-9 w-9 · 36×36</PropRow>
              <PropRow label="星期標頭">w-9 h-8 · 36×32</PropRow>
              <PropRow label="Nav 按鈕">h-7 w-7 · 28×28</PropRow>
              <PropRow label="週間距">mt-1 · 4px</PropRow>
            </div>

            <div className="px-4 py-1">
              <div className="py-2 border-b border-divider">
                <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Typography</span>
              </div>
              <PropRow label="月份標題">text-body · font-medium</PropRow>
              <PropRow label="星期標頭">text-caption · font-normal</PropRow>
              <PropRow label="日格">text-body · font-normal</PropRow>
            </div>

            <div className="px-4 py-1">
              <div className="py-2 border-b border-divider">
                <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color(今日)</span>
              </div>
              <PropRow label="Selected bg"><TokenCell token="--primary" /></PropRow>
              <PropRow label="Selected fg">white</PropRow>
              <PropRow label="Today ring"><TokenCell token="--primary" /></PropRow>
              <PropRow label="Hover bg"><TokenCell token="--neutral-hover" /></PropRow>
              <PropRow label="Outside fg"><TokenCell token="--fg-disabled" /></PropRow>
            </div>

            <div className="px-4 py-1 pb-3">
              <div className="py-2 border-b border-divider">
                <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span>
              </div>
              <PropRow label="日格 Radius">rounded-md · 4px</PropRow>
              <PropRow label="Focus">ring-2 ring-ring</PropRow>
              <PropRow label="Transition">transition-colors</PropRow>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-4">
        <H3>元件檢閱器</H3>
        <Desc>Calendar 的所有 layout token 一覽。theme / density 切換時色彩自動反轉,日格尺寸保持不變(浮層 / dashboard 專用,不配對 field-height family)。</Desc>
        <InspectorInner />
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 色彩對照 — Part × State Token Matrix
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>日格狀態 × Token 對照</H3>
        <Desc>日格的所有狀態對應 token。selected 為實心 primary、today 為 ring primary(框不填),兩者併存時 selected 視覺優先(實心覆蓋 ring)。</Desc>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead>
            <tr>
              <Th>狀態</Th>
              <Th>背景</Th>
              <Th>文字</Th>
              <Th>邊框 / 其他</Th>
            </tr>
          </thead>
          <tbody>
            {PART_ORDER.map((k) => {
              const p = PARTS[k]
              return (
                <tr key={k}>
                  <Td mono>{p.label}</Td>
                  <Td><TokenCell token={p.bg} /></Td>
                  <Td><TokenCell token={p.text} /></Td>
                  <Td mono>
                    <div className="flex flex-col gap-0.5">
                      <TokenCell token={p.border} />
                      {p.extra && <span className="text-fg-muted text-[10px]">{p.extra}</span>}
                    </div>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <H3>其他區塊 Token</H3>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead>
              <tr>
                <Th>區塊</Th>
                <Th>背景</Th>
                <Th>文字</Th>
                <Th>其他</Th>
              </tr>
            </thead>
            <tbody>
              {(['caption', 'nav', 'weekday'] as PartKey[]).map((k) => {
                const p = PARTS[k]
                return (
                  <tr key={k}>
                    <Td mono>{p.label}</Td>
                    <Td><TokenCell token={p.bg} /></Td>
                    <Td><TokenCell token={p.text} /></Td>
                    <Td mono>{p.extra ?? '—'}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. 尺寸對照 — Calendar 固定尺寸說明
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>固定尺寸 — 不隨 density 變化</H3>
        <Desc>
          Calendar 的日格固定 36×36(h-9 w-9),不隨 density token 切換而變化。
          原因:Calendar 是浮層內(DatePicker popup)或 dashboard 小卡中的 inline 元件,
          與 field-height family(輸入欄高度)無關。月曆格子需要固定尺寸確保數字對齊、
          週間視覺節奏一致,參考 shadcn / Google Calendar / Notion 的共識做法。
        </Desc>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead>
            <tr>
              <Th>區塊</Th>
              <Th>尺寸</Th>
              <Th>Token / class</Th>
              <Th>備註</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td mono>外層容器</Td>
              <Td mono>padding 12px</Td>
              <Td mono>p-3</Td>
              <Td>月曆四周留白,給 popup / card 邊距</Td>
            </tr>
            <tr>
              <Td mono>月份 caption</Td>
              <Td mono>h 36px</Td>
              <Td mono>h-9</Td>
              <Td>與日格同高,垂直節奏對齊</Td>
            </tr>
            <tr>
              <Td mono>Nav 按鈕</Td>
              <Td mono>28×28</Td>
              <Td mono>h-7 w-7</Td>
              <Td>比日格稍小,視覺次要</Td>
            </tr>
            <tr>
              <Td mono>星期標頭</Td>
              <Td mono>36×32</Td>
              <Td mono>w-9 h-8</Td>
              <Td>寬度對齊日格,高度略矮</Td>
            </tr>
            <tr>
              <Td mono>日格</Td>
              <Td mono>36×36</Td>
              <Td mono>h-9 w-9</Td>
              <Td><span className="text-error font-medium">固定</span>,不隨 density 變化</Td>
            </tr>
            <tr>
              <Td mono>月份 gap</Td>
              <Td mono>16px</Td>
              <Td mono>gap-4 (sm:flex-row)</Td>
              <Td>多月並排時(numberOfMonths ≥ 2)</Td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-fg-secondary">單月(預設)</span>
          <div className="bg-surface-raised border border-border rounded-lg p-2">
            <Calendar mode="single" defaultMonth={new Date()} locale={zhTW} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-fg-secondary">雙月並排(range 常用)</span>
          <div className="bg-surface-raised border border-border rounded-lg p-2">
            <Calendar mode="single" defaultMonth={new Date()} locale={zhTW} numberOfMonths={2} />
          </div>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. Mode 行為 — single / multiple / range
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior = {
  name: '狀態行為(Mode: single / range / multiple)',
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
        <div className="flex flex-wrap gap-6 items-start">
          <div className="flex flex-col gap-2 min-w-0">
            <span className="text-caption font-medium text-fg-secondary">mode="single"</span>
            <div className="bg-surface-raised border border-border rounded-lg p-2">
              <Calendar
                mode="single"
                selected={single}
                onSelect={setSingle}
                defaultMonth={today}
                locale={zhTW}
              />
            </div>
            <p className="text-[11px] text-fg-muted max-w-[260px] leading-relaxed">
              點擊設定唯一選擇。再次點已選日 = 保持(預設);點新日取代舊選。DatePicker 使用此 mode。
            </p>
          </div>

          <div className="flex flex-col gap-2 min-w-0">
            <span className="text-caption font-medium text-fg-secondary">mode="multiple"</span>
            <div className="bg-surface-raised border border-border rounded-lg p-2">
              <Calendar
                mode="multiple"
                selected={multiple}
                onSelect={(d) => setMultiple(d ?? [])}
                defaultMonth={today}
                locale={zhTW}
              />
            </div>
            <p className="text-[11px] text-fg-muted max-w-[260px] leading-relaxed">
              可勾選多個不連續日期。點已選日 = 取消。值型別為 Date[]。
            </p>
          </div>

          <div className="flex flex-col gap-2 min-w-0">
            <span className="text-caption font-medium text-fg-secondary">mode="range"</span>
            <div className="bg-surface-raised border border-border rounded-lg p-2">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                defaultMonth={today}
                locale={zhTW}
              />
            </div>
            <p className="text-[11px] text-fg-muted max-w-[260px] leading-relaxed">
              第一次點設 from、第二次點設 to,中間自動填滿。值型別 {'{ from; to? }'}。
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-6">
        <div>
          <H3>三種 selection mode</H3>
          <Desc>
            react-day-picker v9 三種內建模式,對應不同選擇需求。選完 mode 後元件內部會提供對應的鍵盤 / 滑鼠互動,
            消費端只需提供 selected + onSelect。
          </Desc>
        </div>
        <ModeDemo />
      </div>
    )
  },
}

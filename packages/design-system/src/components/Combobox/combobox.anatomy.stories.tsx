import type { Meta } from '@storybook/react'
import { useState, useEffect } from 'react'
import { Combobox } from './combobox'
import { SegmentedControl, SegmentedControlItem } from '@/design-system/components/SegmentedControl/segmented-control'
import { Tag } from '@/design-system/components/Tag/tag'

const meta: Meta = {
  title: 'Design System/Components/Combobox/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type ModeKey = 'edit' | 'readonly' | 'disabled'
type StateKey = 'default' | 'hover' | 'focus' | 'disabled'
type SizeKey = 'sm' | 'md' | 'lg'
type ColorSpec = { bg: string; text: string; border: string; icon: string }

const MODES: ModeKey[] = ['edit', 'readonly', 'disabled']
const SIZES: SizeKey[] = ['sm', 'md', 'lg']

const categoryOptions = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'clothing', label: 'Clothing' },
]

/** Mode x State token map — traced from field-wrapper.tsx cva + combobox.tsx */
const TOKEN_MAP: Record<ModeKey, Record<StateKey, ColorSpec>> = {
  edit: {
    default:  { bg: '--surface', text: '--foreground', border: '--border',       icon: '--fg-muted' },
    hover:    { bg: '--surface', text: '--foreground', border: '--border-hover',  icon: '--fg-muted' },
    focus:    { bg: '--surface', text: '--foreground', border: '--primary',       icon: '--fg-muted' },
    disabled: { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
  },
  readonly: {
    default:  { bg: '--bg-readonly', text: '--foreground', border: 'transparent', icon: '—' },
    hover:    { bg: '--bg-readonly', text: '--foreground', border: 'transparent', icon: '—' },
    focus:    { bg: '--bg-readonly', text: '--foreground', border: 'transparent', icon: '—' },
    disabled: { bg: '--bg-readonly', text: '--foreground', border: 'transparent', icon: '—' },
  },
  disabled: {
    default:  { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
    hover:    { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
    focus:    { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
    disabled: { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
  },
}

/** Error state overrides (edit mode only) — traced from combobox.tsx error classes */
const ERROR_COLORS: Record<StateKey, ColorSpec> = {
  default: { bg: '--surface', text: '--foreground', border: '--error',       icon: '--fg-muted' },
  hover:   { bg: '--surface', text: '--foreground', border: '--error-hover', icon: '--fg-muted' },
  focus:   { bg: '--surface', text: '--foreground', border: '--error',       icon: '--fg-muted' },
  disabled:{ bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
}

interface SizeSpec {
  heightToken: string; height: string
  fontToken: string; font: string
  icon: number
  tagSize: string; tagHeight: string
  tagPaddingCalc: string; tagInset: string
  tagGap: string
}

const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  sm: {
    heightToken: 'h-field-sm', height: '28px',
    fontToken: 'text-body', font: '14px',
    icon: 16,
    tagSize: 'tag-sm', tagHeight: '20px',
    // 公式 SSOT = Field/field-wrapper.tsx fieldTagInsetX/Y(扣 2px 邊框;閘 scripts/tag-field-vertical-inset.mjs)
    tagPaddingCalc: '(field-height-sm − 2px − tag-height-sm) / 2', tagInset: '3px',
    tagGap: '4px',
  },
  md: {
    heightToken: 'h-field-md', height: '32px',
    fontToken: 'text-body', font: '14px',
    icon: 16,
    tagSize: 'tag-md', tagHeight: '24px',
    tagPaddingCalc: '(field-height-md − 2px − tag-height-md) / 2', tagInset: '3px',
    tagGap: '4px',
  },
  lg: {
    heightToken: 'h-field-lg', height: '36px',
    fontToken: 'text-body-lg', font: '16px',
    icon: 20,
    tagSize: 'tag-lg (=md)', tagHeight: '24px',
    tagPaddingCalc: '(field-height-lg − 2px − tag-height-lg) / 2', tagInset: '5px',
    tagGap: '4px',
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared UI Components
   ═══════════════════════════════════════════════════════════════════════════ */

/*
 * NOTE: Kept local (not imported from `_anatomy/anatomy-utils`) because the
 * Button-family inspector layout diverges visually from the canonical helpers:
 * H3 `text-h6 font-semibold` (not `text-body font-bold mb-2`), Desc has no
 * bottom margin, Th/Td use `p-2 border-b border-divider` row style, and
 * Swatch defaults to `size="md"` for inline token chips.
 */
const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-h6 font-semibold text-foreground">{children}</h3>
)
const Desc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-caption text-fg-secondary max-w-[720px]">{children}</p>
)
const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium text-caption whitespace-nowrap">{children}</th>
)
const Td = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
  <td className={`p-2 border-b border-divider align-top whitespace-nowrap text-caption ${mono ? 'font-mono' : ''}`}>{children}</td>
)

const TkVal = ({ token, value }: { token: string; value?: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-mono text-[12px] text-fg-secondary">{token}</span>
    {value && <span className="font-mono text-[10px] text-fg-muted">{value}</span>}
  </div>
)

const Swatch = ({ value, size = 'md' }: { value: string; size?: 'sm' | 'md' }) => {
  const s = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  if (value === 'transparent' || value === '—') {
    return <span className={`${s} rounded-md shrink-0 border border-border`}
      style={{ backgroundImage: 'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0,3px 3px' }} />
  }
  return <span className={`${s} rounded-md shrink-0 border border-black/10`} style={{ backgroundColor: `var(${value})` }} />
}

const TokenAnnotation = ({ colors }: { colors: ColorSpec }) => (
  <div className="flex flex-col gap-0.5 mt-2">
    {([['bg', 'bg'], ['text', 'text'], ['border', 'bdr'], ['icon', 'icon']] as const).map(([key, label]) => (
      <span key={key} className="inline-flex items-center gap-1 text-[10px]">
        <Swatch value={colors[key]} size="sm" />
        <span className="text-fg-muted w-5 shrink-0">{label}</span>
        <span className="font-mono text-fg-secondary">{colors[key]}</span>
      </span>
    ))}
  </div>
)

const PropRow = ({ label, dot, children }: { label: string; dot?: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
    <span className="text-[11px] text-fg-secondary font-medium w-[72px] shrink-0 pt-0.5 flex items-center gap-1.5">
      {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
      {label}
    </span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

const TokenValue = ({ value }: { value: string }) => (
  <span className="inline-flex items-center gap-2"><Swatch value={value} /><span>{value}</span></span>
)

/* ═══════════════════════════════════════════════════════════════════════════
   Blueprint Zone helpers
   ═══════════════════════════════════════════════════════════════════════════ */

const Z = {
  pad:   { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  icon:  { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  gap:   { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  label: { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  tag:   { bg: 'rgba(255,199,199,0.6)', border: 'rgba(210,100,100,0.9)', text: '#a03030' },
  dim:   { text: '#d04040' },
}

const BpZone = ({ w, color, label, sub }: { w: number; color: typeof Z.pad; label: string; sub?: string }) => (
  <div className="flex flex-col items-center justify-center shrink-0 gap-0.5"
    style={{ width: w, height: '100%', background: color.bg, borderLeft: `1.5px dashed ${color.border}`, borderRight: `1.5px dashed ${color.border}` }}>
    <span className="text-[11px] font-mono font-bold leading-none" style={{ color: color.text }}>{label}</span>
    {sub && <span className="text-[9px] font-mono leading-none opacity-70" style={{ color: color.text }}>{sub}</span>}
  </div>
)

/* ═══════════════════════════════════════════════════════════════════════════
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-8">
      {/* Anatomy — edit mode single-line */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）— edit 單行</H3>
          <Desc>觸發區是一個可聚焦的容器（combobox 角色），內含 Tags 陣列 + ChevronDown，點擊開啟浮層選單（搜尋 + 選項清單）。無值時容器內顯示 placeholder。不分裝置只有這一條路徑 —— 觸控裝置看到的跟桌機完全一樣（2026-09-18 user 拍板，原本的隱藏原生 select 路徑已移除）。</Desc>
        </div>
        <div className="flex gap-8">
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-secondary font-medium">有值 + clearable</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-1">
              {[
                { name: 'combobox 容器', color: 'success' },
                { name: 'Tag', color: 'error' },
                { name: 'Tag', color: 'error' },
                { name: '+N', color: 'warning' },
                { name: 'clear', color: 'magenta' },
                { name: 'chevron', color: 'info' },
              ].map((s, i) => (
                <span key={`${s.name}-${i}`} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">role=combobox 觸發容器 · 點擊開浮層選單 · +N = OverflowIndicator</span>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-secondary font-medium">空值</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[
                { name: 'placeholder', color: 'success' },
                { name: 'chevron', color: 'info' },
              ].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">placeholder span（flex-1 min-w-0 truncate）</span>
          </div>
        </div>
      </div>

      {/* Anatomy — edit mode wrap */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）— edit 換行 (wrap)</H3>
          <Desc>高度隨內容展開，Tags 自然換行。右側控件 (clear + chevron) 以 self-start 固定在第一行高度位置。wrap 時上下內距 = (field-height − 2px − tag-height) / 2（sm/md 3px、lg 5px，與單行置中同值，第一行 Tag 不位移）。</Desc>
        </div>
        <div className="flex flex-col gap-2 items-start">
          <div className="inline-flex items-start border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-1 flex-wrap w-64">
            {[
              { name: 'Tag', color: 'error' },
              { name: 'Tag', color: 'error' },
              { name: 'Tag', color: 'error' },
              { name: 'Tag', color: 'error' },
            ].map((s, i) => (
              <span key={i} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
            ))}
            <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed self-start ml-auto"
              style={{ borderColor: 'var(--info)', backgroundColor: 'var(--info-subtle)', color: 'var(--info)' }}>chevron</span>
          </div>
          <span className="text-[10px] text-fg-muted font-mono">flex-wrap · height: auto · py = (field − 2 − tag) / 2</span>
        </div>
      </div>

      {/* Anatomy — readonly / disabled */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）— readonly / disabled</H3>
          <Desc>Tag 沒有 dismiss 按鈕、沒有 clear;readonly 不顯示 ChevronDown(純值、不可開下拉),disabled 保留為類型身份 indicator(pointer-events-none,fg-disabled)。溢出行為與 edit 相同(+N 指示器)。</Desc>
        </div>
        <div className="flex gap-8">
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-secondary font-medium">有值</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-1">
              {[
                { name: 'Tag', color: 'error' },
                { name: 'Tag', color: 'error' },
                { name: '+N?', color: 'warning' },
              ].map((s, i) => (
                <span key={i} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">無 dismiss · 無 clear · chevron:readonly 不顯示 / disabled 保留 · tagPadding</span>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-secondary font-medium">空值</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                style={{ borderColor: 'var(--info)', backgroundColor: 'var(--info-subtle)', color: 'var(--info)' }}>- (hyphen)</span>
            </div>
            <span className="text-[10px] text-fg-muted font-mono">text-foreground</span>
          </div>
        </div>
      </div>

      {/* Props table */}
      <div className="flex flex-col gap-3">
        <H3>Props</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['mode', "'edit'|'view'|'readonly'|'disabled'", "'edit'", 'FieldMode 四模式;顯式傳入時永遠最優先,不被 disabled 覆蓋'],
                ['size', "'sm'|'md'|'lg'", "'md'", '尺寸，與 Button 共用 field-height token'],
                ['options', 'ComboboxOption[]', '—', '選項列表（extends SelectMenuOption：value / label / icon / avatar / description / disabled / group）'],
                ['value', 'string[]', '[]', '已選中的值陣列'],
                ['onChange', '(value: string[]) => void', '—', '選值改變回呼'],
                ['error', 'boolean', 'false', '紅色邊框，只在 edit 模式有視覺效果'],
                ['wrap', 'boolean', 'false', '換行模式——高度隨內容展開，Tags 自然換行'],
                ['clearable', 'boolean', 'false', '有值時顯示 X clear all 按鈕'],
                ['loading', 'boolean', 'false', '這個值在讀取 / 驗證 / 儲存(Field 家族 SSOT):觸發點右側、箭頭左邊轉圈 + aria-busy;與選項有沒有載入無關'],
                ['optionsLoading', 'boolean', 'false', '選項清單載入中(2026-09-09 改名自 loading):指示只在選單內的「載入選項中」訊息列;觸發點 / 搜尋列不轉圈'],
                ['suggestions', 'ComboboxOption[]', '—', '遠端搜尋(filterOption=false)、關鍵字空時的建議清單;DS 自動包成標題「建議」的群組(suggestionsLabel 可覆寫);沒建議時提示列 searchHintText'],
                ['placeholder', 'string', '—', '無值時的提示文字；未傳時 fallback 到 emptyPlaceholder（預設「選擇…」全形省略號）'],
                ['disabled', 'boolean', 'false', '原生屬性；未傳 mode 時 resolve 為 disabled 樣式（顯式 mode prop 恆優先，見 useResolvedFieldMode）'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
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

const InspectorInner = () => {
  const [mode, setMode] = useState<ModeKey>('edit')
  const [size, setSize] = useState<SizeKey>('md')
  const [error, setError] = useState(false)
  const [wrap, setWrap] = useState(false)
  const [clearable, setClearable] = useState(false)
  const [value, setValue] = useState<string[]>(['electronics', 'food', 'lifestyle'])

  const isEdit = mode === 'edit'

  // error only visible in edit mode
  useEffect(() => { if (!isEdit) setError(false) }, [isEdit])

  const resolvedMode = mode
  const s = SIZE_SPECS[size]
  const colors = error ? ERROR_COLORS['default'] : TOKEN_MAP[resolvedMode]['default']

  return (
    <div className="flex flex-col gap-6">
      {/* Controls — 互斥切換消費 SegmentedControl(segmented-control.spec.md「何時用」2–5 個互斥選項;
          取代手刻 Tab:它靜止借 neutral-hover、hover 借 neutral-active,是 color.spec.md 成對 token 的錯配) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Mode</span>
          <SegmentedControl size="sm" aria-label="Mode" value={mode} onValueChange={(v) => setMode(v as ModeKey)}>
            {MODES.map((m) => <SegmentedControlItem key={m} value={m}>{m}</SegmentedControlItem>)}
          </SegmentedControl>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Size</span>
          <SegmentedControl size="sm" aria-label="Size" value={size} onValueChange={(v) => setSize(v as SizeKey)}>
            {SIZES.map((sz) => <SegmentedControlItem key={sz} value={sz}>{sz}</SegmentedControlItem>)}
          </SegmentedControl>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Error</span>
          {/* 停用項用元件自身 disabled(segmented-control.spec.md「disabled」);停用項不得是當前值 → value 取實際生效值 */}
          <SegmentedControl size="sm" aria-label="Error" value={error && isEdit ? 'on' : 'off'} onValueChange={(v) => setError(v === 'on')}>
            <SegmentedControlItem value="off">off</SegmentedControlItem>
            <SegmentedControlItem value="on" disabled={!isEdit}>on</SegmentedControlItem>
          </SegmentedControl>
          {!isEdit && <span className="text-[11px] text-fg-secondary">僅 edit 模式</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Wrap</span>
          <SegmentedControl size="sm" aria-label="Wrap" value={wrap ? 'on' : 'off'} onValueChange={(v) => setWrap(v === 'on')}>
            <SegmentedControlItem value="off">off</SegmentedControlItem>
            <SegmentedControlItem value="on">on</SegmentedControlItem>
          </SegmentedControl>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Clearable</span>
          <SegmentedControl size="sm" aria-label="Clearable" value={clearable ? 'on' : 'off'} onValueChange={(v) => setClearable(v === 'on')}>
            <SegmentedControlItem value="off">off</SegmentedControlItem>
            <SegmentedControlItem value="on">on</SegmentedControlItem>
          </SegmentedControl>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Value</span>
          {/* 「有值 (3)」再點一次 = 還原成 3 筆(預覽裡移除過 tag 時);已選中項再點不會觸發 onValueChange(spec「點擊已選中 item:不取消選取」),故另掛 onClick */}
          <SegmentedControl size="sm" aria-label="Value" value={value.length > 0 ? 'filled' : 'empty'} onValueChange={(v) => setValue(v === 'filled' ? ['electronics', 'food', 'lifestyle'] : [])}>
            <SegmentedControlItem value="filled" onClick={() => setValue(['electronics', 'food', 'lifestyle'])}>有值 (3)</SegmentedControlItem>
            <SegmentedControlItem value="empty">空值</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[340px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <Combobox
              mode={mode}
              size={size}
              error={error}
              wrap={wrap}
              clearable={clearable}
              options={categoryOptions}
              value={value}
              onChange={setValue}
              placeholder="選擇分類"
              aria-label="產品分類"
              className="w-72"
            />
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              {[
                { c: Z.pad, l: 'tagPadding' },
                { c: Z.tag, l: 'Tag (dismiss)' },
                { c: Z.gap, l: 'tag gap' },
                { c: Z.icon, l: 'chevron / clear' },
              ].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center">
              <div className="flex items-center rounded-md overflow-hidden" style={{ height: 52, outline: `2px solid ${Z.dim.text}22` }}>
                <BpZone w={36} color={Z.pad} label="tagPad" sub={s.tagPaddingCalc} />
                <BpZone w={64} color={Z.tag} label="Tag" sub={s.tagSize} />
                <BpZone w={24} color={Z.gap} label="gap" sub={s.tagGap} />
                <BpZone w={64} color={Z.tag} label="Tag" sub={s.tagSize} />
                <BpZone w={24} color={Z.gap} label="gap" sub={s.tagGap} />
                <BpZone w={36} color={Z.tag} label="+N" sub="overflow" />
                <BpZone w={24} color={Z.gap} label="gap" sub="8px" />
                <BpZone w={32} color={Z.icon} label={`${s.icon}px`} sub="chevron" />
                <BpZone w={36} color={Z.pad} label="pr" sub="12px" />
              </div>
              <div className="ml-3 flex items-center" style={{ height: 52 }}>
                <svg width="10" height="52" className="shrink-0">
                  <line x1="5" y1="2" x2="5" y2="50" stroke={Z.dim.text} strokeWidth="1" />
                  <line x1="1" y1="2" x2="9" y2="2" stroke={Z.dim.text} strokeWidth="1.5" />
                  <line x1="1" y1="50" x2="9" y2="50" stroke={Z.dim.text} strokeWidth="1.5" />
                </svg>
                <div className="ml-1.5"><TkVal token={s.heightToken} value={s.height} /></div>
              </div>
            </div>
            <p className="text-[10px] text-fg-muted">寬度為示意比例，實際由內容決定。wrap 模式時 height: auto，高度隨 Tag 數量展開</p>
          </div>
        </div>

        {/* Right: inspect panel */}
        <div className="w-[300px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          {/* COLOR */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span></div>
            <PropRow label="Fill"><TokenValue value={colors.bg} /></PropRow>
            <PropRow label="Text"><TokenValue value={colors.text} /></PropRow>
            <PropRow label="Stroke"><TokenValue value={colors.border} /></PropRow>
            {mode !== 'readonly' && <PropRow label="Icon"><TokenValue value={colors.icon} /></PropRow>}
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="高度" dot={Z.dim.text}>
              {wrap
                ? <span>auto (content)</span>
                : <TkVal token={s.heightToken} value={s.height} />
              }
            </PropRow>
            <PropRow label="tagPadding" dot={Z.pad.text}><TkVal token="calc()" value={s.tagPaddingCalc} /></PropRow>
            <PropRow label="右側內距">var(--field-px) (12px)</PropRow>
            <PropRow label="Tag 間距" dot={Z.gap.text}>{s.tagGap}</PropRow>
            <PropRow label="Icon 尺寸" dot={Z.icon.text}>{s.icon}px</PropRow>
            <PropRow label="Tag 高度" dot={Z.tag.text}>{s.tagHeight} ({s.tagSize})</PropRow>
            {wrap && <PropRow label="上下內距">{s.tagInset} ({s.tagPaddingCalc})</PropRow>}
          </div>

          {/* TYPOGRAPHY */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Typography</span></div>
            <PropRow label="Font"><TkVal token={s.fontToken} value={s.font} /></PropRow>
            <PropRow label="Weight"><TkVal token="font-normal" value="400" /></PropRow>
          </div>

          {/* STYLE */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span></div>
            <PropRow label="Radius"><TkVal token="rounded-md" value="4px" /></PropRow>
            <PropRow label="Border"><TkVal token="border" value="1px solid" /></PropRow>
            <PropRow label="Focus"><TkVal token="border-primary" value="1px" /></PropRow>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Inspector = {
  name: '元件檢閱器',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <H3>元件檢閱器</H3>
        <Desc>選擇任意組合，即時查看所有 token。開發只需確認 token 正確——theme / density 的值解析由系統處理。</Desc>
      </div>
      <InspectorInner />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 色彩對照表
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix = {
  name: '色彩對照表',
  render: () => {
    const editStates: StateKey[] = ['default', 'hover', 'focus', 'disabled']
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <H3>Mode x State 色彩對照</H3>
          <Desc>橫向看同 mode 的 state 變化，色塊即時渲染，切 dark mode 自動更新。wrapper 色彩與 Select 共用同一套 fieldWrapperStyles。</Desc>
        </div>

        {/* edit mode */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">edit 模式</span>
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <thead><tr><Th>State</Th>{editStates.map((st) => <Th key={st}>{st}</Th>)}</tr></thead>
              <tbody>
                <tr>
                  <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top">normal</td>
                  {editStates.map((st) => (
                    <td key={st} className="p-3 border-b border-divider align-top min-w-[180px]">
                      <Combobox
                        options={categoryOptions}
                        value={['electronics', 'food']}
                        size="sm"
                        disabled={st === 'disabled'}
                        onChange={() => {}}
                        aria-label={`產品分類(${st})`}
                      />
                      <TokenAnnotation colors={st === 'disabled' ? TOKEN_MAP.disabled.default : TOKEN_MAP.edit[st]} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top">error</td>
                  {editStates.map((st) => (
                    <td key={st} className="p-3 border-b border-divider align-top min-w-[180px]">
                      <Combobox
                        options={categoryOptions}
                        value={['electronics', 'food']}
                        size="sm"
                        error={st !== 'disabled'}
                        disabled={st === 'disabled'}
                        onChange={() => {}}
                        aria-label={`產品分類(錯誤態、${st})`}
                      />
                      <TokenAnnotation colors={st === 'disabled' ? TOKEN_MAP.disabled.default : ERROR_COLORS[st]} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* readonly & disabled */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">readonly / disabled</span>
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <thead><tr><Th>Mode</Th><Th>有值</Th><Th>空值</Th><Th>Token</Th></tr></thead>
              <tbody>
                {(['readonly', 'disabled'] as const).map((m) => (
                  <tr key={m}>
                    <Td mono>{m}</Td>
                    <td className="p-3 border-b border-divider align-top min-w-[180px]">
                      <Combobox mode={m} options={categoryOptions} value={['electronics', 'food']} size="sm" aria-label={`產品分類(${m})`} />
                    </td>
                    <td className="p-3 border-b border-divider align-top min-w-[160px]">
                      <Combobox mode={m} options={categoryOptions} value={[]} size="sm" aria-label={`產品分類(${m}、空值)`} />
                    </td>
                    <td className="p-3 border-b border-divider align-top min-w-[160px]">
                      <TokenAnnotation colors={TOKEN_MAP[m].default} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tag colors in disabled mode */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">disabled 模式的 Tag 色彩</span>
          <Desc>disabled 時 Tag 使用 bg-disabled (neutral-2) + text-fg-disabled (neutral-6)，品牌色完全移除。</Desc>
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1 items-start">
              <span className="text-[11px] text-fg-secondary">正常 Tag</span>
              <Tag size="sm">Electronics</Tag>
            </div>
            <span className="text-fg-muted text-caption">vs</span>
            <div className="flex flex-col gap-1 items-start">
              <span className="text-[11px] text-fg-secondary">disabled Tag</span>
              <Tag size="sm" className="bg-disabled text-fg-disabled">Electronics</Tag>
            </div>
          </div>
        </div>
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. 尺寸對照表
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Size Token 對照</H3>
        <Desc>每個 size 對應的 token 一覽。tagPadding 用 calc() 計算確保 Tag 四邊等距——公式為 (field-height − 2px 邊框 − tag-height) / 2，sm/md 3px、lg 5px（SSOT：Field/field-wrapper.tsx fieldTagInsetX/Y）。Tag 間距固定 4px (GAP constant)。</Desc>
      </div>

      {/* Token comparison table */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead><tr>
            <Th>屬性</Th>
            {SIZES.map((sz) => <Th key={sz}>{sz}{sz === 'md' ? '（預設）' : ''}</Th>)}
          </tr></thead>
          <tbody>
            <tr>
              <Td>高度</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">{SIZE_SPECS[sz].heightToken}</div>
                  <div className="text-fg-muted text-[10px]">{SIZE_SPECS[sz].height}</div>
                </Td>
              ))}
            </tr>
            <tr>
              <Td>Tag 尺寸</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">{SIZE_SPECS[sz].tagSize}</div>
                  <div className="text-fg-muted text-[10px]">{SIZE_SPECS[sz].tagHeight}</div>
                </Td>
              ))}
            </tr>
            <tr>
              <Td>tagPadding (x)</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">calc()</div>
                  <div className="text-fg-muted text-[10px]">{SIZE_SPECS[sz].tagPaddingCalc}</div>
                </Td>
              ))}
            </tr>
            <tr>
              <Td>右側內距</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">paddingRight</div>
                  <div className="text-fg-muted text-[10px]">var(--field-px) (12px)</div>
                </Td>
              ))}
            </tr>
            <tr>
              <Td>Tag 間距</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">GAP</div>
                  <div className="text-fg-muted text-[10px]">{SIZE_SPECS[sz].tagGap}</div>
                </Td>
              ))}
            </tr>
            <tr>
              <Td>字體</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">{SIZE_SPECS[sz].fontToken}</div>
                  <div className="text-fg-muted text-[10px]">{SIZE_SPECS[sz].font}</div>
                </Td>
              ))}
            </tr>
            <tr>
              <Td>Icon 尺寸</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-muted text-[10px]">{SIZE_SPECS[sz].icon}px</div>
                </Td>
              ))}
            </tr>
            <tr>
              <Td>wrap 上下內距</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">{SIZE_SPECS[sz].tagInset}</div>
                  <div className="text-fg-muted text-[10px]">(field − 2 − tag) / 2</div>
                  <div className="text-fg-muted text-[10px]">height: auto</div>
                </Td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Visual preview — edit */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽 — 各尺寸 edit</span>
        <div className="flex flex-col gap-3">
          {SIZES.map((sz) => (
            <div key={sz} className="flex items-center gap-3">
              <Combobox size={sz} options={categoryOptions} value={['electronics', 'food']} onChange={() => {}} className="w-64" aria-label={`產品分類(size=${sz})`} />
              <span className="text-caption text-fg-secondary font-mono">size=&quot;{sz}&quot;</span>
            </div>
          ))}
        </div>
      </div>

      {/* Visual preview — readonly */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽 — 各尺寸 readonly</span>
        <div className="flex flex-col gap-3">
          {SIZES.map((sz) => (
            <div key={sz} className="flex items-center gap-3">
              <Combobox mode="readonly" size={sz} options={categoryOptions} value={['electronics', 'food']} className="w-64" />
              <span className="text-caption text-fg-secondary font-mono">size=&quot;{sz}&quot;</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. 狀態行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior = {
  name: '狀態行為',
  render: () => {
    const allValues = ['electronics', 'furniture', 'food', 'lifestyle', 'clothing']
    const [overflowV, setOverflowV] = useState(allValues)
    const [wrapV, setWrapV] = useState(allValues)
    const [clearV, setClearV] = useState(['electronics', 'food', 'lifestyle'])
    const [dismissV, setDismissV] = useState(['electronics', 'food', 'lifestyle'])

    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <H3>狀態行為</H3>
          <Desc>Combobox 特有的溢出、換行、清除、個別移除行為。</Desc>
        </div>

        {/* Overflow +N */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">單行溢出 — +N 指示器</span>
          <Desc>以量測為基礎：計算容器可用寬度，依序放入 Tag，放不下的隱藏。+N 使用 OverflowIndicator 元件（tag shape），hover 顯示隱藏的 Tag 清單。</Desc>
          <div className="w-64">
            <Combobox
              options={categoryOptions}
              value={overflowV}
              onChange={setOverflowV}
              aria-label="產品分類(單行溢出 +N 範例)"
            />
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-fg-secondary">
            <span>1. useOverflowCount hook 量測 container 寬度與每個 tag 的自然寬度</span>
            <span>2. ResizeObserver 持續監聽容器變化</span>
            <span>3. 量測在 useEffect 內首次 paint 後執行（確保 nested 場景所有 ref 已 attach），double-rAF 保證 layout 完成才量測；代價是可能 1-2 frame 閃爍，由 value-equal setState guard 收斂</span>
            <span>4. 超出的 tag 以 DOM hidden attribute 隱藏（UA 樣式即 display:none；節點保留在 DOM，量測時先全部解除隱藏再計算）</span>
          </div>
        </div>

        {/* Overflow readonly */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">readonly 溢出 — 行為與 edit 相同</span>
          <div className="w-64">
            <Combobox
              mode="readonly"
              options={categoryOptions}
              value={allValues}
            />
          </div>
          <span className="text-[11px] text-fg-secondary">readonly 的 +N hover 一樣顯示隱藏項，但 Tag 沒有 dismiss 按鈕</span>
        </div>

        {/* Wrap mode */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">換行模式（wrap）</span>
          <Desc>Tags 自然換行，高度隨內容展開。無 +N 指示器——全部可見。右側控件 (clear + chevron) 用 self-start 固定在第一行的 tag 高度位置。</Desc>
          <div className="flex gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-secondary">edit wrap</span>
              <div className="w-56">
                <Combobox
                  options={categoryOptions}
                  value={wrapV}
                  onChange={setWrapV}
                  wrap
                  aria-label="產品分類(換行模式範例)"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-secondary">readonly wrap</span>
              <div className="w-56">
                <Combobox
                  mode="readonly"
                  options={categoryOptions}
                  value={allValues}
                  wrap
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-fg-secondary">
            <span>wrap 模式差異：flex-wrap · height: auto · 上下內距 (field − 2 − tag) / 2（sm/md 3px、lg 5px，與單行置中同值）</span>
            <span>chevron 的容器高度固定為 tag 高度 (sm:20px, md/lg:24px)，self-start 對齊</span>
          </div>
        </div>

        {/* Clearable */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">清除全部（clearable）</span>
          <Desc>clearable 在有值 + edit 模式時，在 ChevronDown 左側顯示 X 按鈕，一次清除所有選項。按鈕帶 Tooltip &quot;清除全部&quot;。</Desc>
          <div className="flex items-center gap-4">
            <Combobox
              options={categoryOptions}
              value={clearV}
              onChange={setClearV}
              clearable
              className="w-64"
              aria-label="產品分類(清除全部範例)"
            />
            <button
              type="button"
              onClick={() => setClearV(['electronics', 'food', 'lifestyle'])}
              className="text-caption text-primary cursor-pointer hover:text-primary-hover"
            >
              重設
            </button>
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-fg-secondary">
            <span>showClear = clearable && value.length &gt; 0 && isEditable</span>
            <span>X 按鈕尺寸：sm/md = 16px icon + 18px hover bg，lg = 20px icon + 22px hover bg</span>
            <span>clear 色彩：fg-muted → hover: foreground → active: foreground</span>
          </div>
        </div>

        {/* Tag dismiss */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">個別移除（Tag dismiss）</span>
          <Desc>每個 Tag 自帶 dismiss 按鈕（X），點擊移除該選項。已選項仍留在浮層清單中並以打勾標示，再點一次即取消（不分裝置）。</Desc>
          <div className="flex items-center gap-4">
            <Combobox
              options={categoryOptions}
              value={dismissV}
              onChange={setDismissV}
              className="w-72"
              aria-label="產品分類(個別移除 Tag 範例)"
            />
            <button
              type="button"
              onClick={() => setDismissV(['electronics', 'food', 'lifestyle'])}
              className="text-caption text-primary cursor-pointer hover:text-primary-hover"
            >
              重設
            </button>
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-fg-secondary">
            <span>Tag remove = Tag 元件的 onRemove prop，按鈕由 Tag 內部渲染</span>
            <span>dismiss icon: 16px X，hover bg: 18px rounded-md neutral-hover</span>
            <span>readonly / disabled 的 Tag 沒有 dismiss 按鈕</span>
          </div>
        </div>

        {/* Select behavior */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">新增選擇</span>
          <Desc>新增選擇只有一條機制，不分裝置：點擊欄位開啟自建浮層選單（SelectMenu），已選項仍留在清單中並以打勾標示，再點一次即取消。2026-09-18 user 拍板「手機跟桌機同步」後，原本觸控裝置的隱藏原生 select overlay 已整個移除。</Desc>
          <div className="flex flex-col gap-1 text-[11px] text-fg-secondary">
            <span>不分裝置: 點擊欄位 → 開 SelectMenu popover，已選項打勾保留，toggle 取消</span>
            <span>chevron / clear: relative z-10 · pointer-events-auto</span>
            <span>閘: scripts/combobox-single-path-invariant.mjs（觸控模擬下確認沒有原生 select、浮層與其內容都在）</span>
          </div>
        </div>
      </div>
    )
  },
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙與鍵盤',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"鍵盤可達性只有一條路徑，不分裝置：觸發區是一個 combobox 角色的容器，可用 Tab 聚焦，方向鍵在選項間移動，Enter 選取，Esc 關閉——由浮層選單的鍵盤導覽負責。\n\n開著時按 Tab:searchIn='menu'(預設,可不可搜尋都一樣)時焦點進到浮層,Tab / Shift+Tab 在面板裡繞圈(浮層內搜尋框(有的話)→ 清單 → 全選),觸發區宣告 aria-haspopup=\"dialog\";searchIn='trigger' 時焦點留在觸發區,Tab 照頁面順序離開,宣告 listbox(待辦總帳 B11「行為不變、只改宣告」)。\n\n2026-09-18 user 拍板「手機跟桌機同步」後移除了原本的觸控原生 select 路徑。該路徑當時宣稱的理由是「保留行動裝置的 screen reader、語音輸入與系統層整合」，但實作上並未兌現：那顆 select 的 value 恆為空字串、也沒有 multiple，輔助科技從被命名的控件上讀不到已選了什麼。\n\n欄位內 Tag 容器、ChevronDown、搜尋框上的點擊事件是滑鼠優化的點擊區，不是鍵盤介面——鍵盤使用者不經過它們。這些點擊區不加可聚焦角色，是為了不搶走真正聚焦目標的 Tab focus。"}</p>
    </div>
  ),
}

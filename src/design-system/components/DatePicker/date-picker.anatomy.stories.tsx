// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
import type { Meta } from '@storybook/react'
import { useState, useEffect } from 'react'
import { DatePicker } from './date-picker'
import { DateGrid as DSDateGrid } from '@/design-system/components/DateGrid/date-grid'

const meta: Meta = {
  title: 'Design System/Components/DatePicker/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type ModeKey = 'edit' | 'readonly' | 'disabled'
type StateKey = 'default' | 'hover' | 'focus' | 'error' | 'disabled'
type SizeKey = 'sm' | 'md' | 'lg'
type ColorSpec = { bg: string; text: string; border: string; icon: string }

const MODES: ModeKey[] = ['edit', 'readonly', 'disabled']
const EDIT_STATES: StateKey[] = ['default', 'hover', 'focus', 'error', 'disabled']
const SIZES: SizeKey[] = ['sm', 'md', 'lg']

const COLOR_MAP: Record<ModeKey, Partial<Record<StateKey, ColorSpec>>> = {
  edit: {
    default:  { bg: '--surface',     text: '--foreground',  border: '--border',       icon: '--fg-muted' },
    hover:    { bg: '--surface',     text: '--foreground',  border: '--border-hover',  icon: '--fg-muted' },
    focus:    { bg: '--surface',     text: '--foreground',  border: '--primary',       icon: '--fg-muted' },
    error:    { bg: '--surface',     text: '--foreground',  border: '--error',         icon: '--fg-muted' },
    disabled: { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent',     icon: '--fg-disabled' },
  },
  readonly: {
    default:  { bg: '--bg-disabled', text: '--foreground',  border: 'transparent',     icon: '--fg-muted' },
  },
  disabled: {
    default:  { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent',     icon: '--fg-disabled' },
  },
}

interface SizeSpec {
  heightToken: string; height: string
  pxToken: string; px: number
  gapToken: string; gap: number
  fontToken: string; font: string
  icon: number
  clearHover: number
}

const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  sm: { heightToken: 'h-field-sm', height: '28px', pxToken: 'px-3', px: 12, gapToken: 'gap-2', gap: 8, fontToken: 'text-body',    font: '14px', icon: 16, clearHover: 18 },
  md: { heightToken: 'h-field-md', height: '32px', pxToken: 'px-3', px: 12, gapToken: 'gap-2', gap: 8, fontToken: 'text-body',    font: '14px', icon: 16, clearHover: 18 },
  lg: { heightToken: 'h-field-lg', height: '36px', pxToken: 'px-3', px: 12, gapToken: 'gap-2', gap: 8, fontToken: 'text-body-lg', font: '16px', icon: 20, clearHover: 22 },
}

const MODE_DESC: Record<ModeKey, string> = {
  edit:     'button trigger + Calendar icon — bg-surface + border + hover/focus 回饋,點擊開啟 Calendar Popover',
  readonly: '格式化日期文字 — bg-disabled(neutral-2) + 無邊框 + 文字正常色',
  disabled: '格式化日期文字 — bg-disabled(neutral-2) + 無邊框 + 文字灰化',
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared UI Components

   NOTE: Kept local (not imported from `_anatomy/anatomy-utils`) because the
   Button-family inspector layout diverges visually from the canonical helpers:
   H3 `text-h6 font-semibold` (not `text-body font-bold mb-2`), Desc has no
   bottom margin, Th/Td use `p-2 border-b border-divider` row style, and
   Swatch defaults to `size="md"` for inline token chips.
   ═══════════════════════════════════════════════════════════════════════════ */

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-h6 font-semibold text-foreground">{children}</h3>
)
const Desc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-caption text-fg-muted max-w-[720px]">{children}</p>
)
const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium text-caption whitespace-nowrap">{children}</th>
)
const Td = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
  <td className={`p-2 border-b border-divider align-top whitespace-nowrap text-caption ${mono ? 'font-mono' : ''}`}>{children}</td>
)

/** Token name (primary) + resolved value (secondary) */
const TkVal = ({ token, value }: { token: string; value?: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-mono text-[12px] text-fg-secondary">{token}</span>
    {value && <span className="font-mono text-[10px] text-fg-muted">{value}</span>}
  </div>
)

const Swatch = ({ value, size = 'md' }: { value: string; size?: 'sm' | 'md' }) => {
  const s = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  if (value === 'transparent') {
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

const Tab = ({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) => {
  if (disabled) return <span className="px-2.5 py-1 text-[12px] font-mono rounded-md text-fg-disabled bg-neutral-hover cursor-not-allowed">{children}</span>
  return (
    <button type="button" onClick={onClick}
      className={`px-2.5 py-1 text-[12px] font-mono rounded-md cursor-pointer transition-colors ${
        active ? 'bg-primary text-white font-semibold' : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
      }`}>
      {children}
    </button>
  )
}

const PropRow = ({ label, dot, children }: { label: string; dot?: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
    <span className="text-[11px] text-fg-muted font-medium w-[72px] shrink-0 pt-0.5 flex items-center gap-1.5">
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
   Blueprint zone colors
   ═══════════════════════════════════════════════════════════════════════════ */

const Z = {
  pad:   { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  icon:  { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  gap:   { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  input: { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  action:{ bg: 'rgba(245,180,180,0.6)', border: 'rgba(210,100,100,0.9)', text: '#9f2d2d' },
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
      {/* Anatomy */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）</H3>
          <Desc>edit 模式：button trigger 顯示格式化文字 + Calendar icon（固定右側），點擊開啟 Calendar Popover。clearable 有值時額外顯示 X clear 按鈕。readonly / disabled 模式：Intl.DateTimeFormat 格式化文字，無 icon。</Desc>
        </div>
        <div className="flex gap-8">
          {/* Edit layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">edit</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[
                { name: 'button trigger text (flex-1)', color: 'success' },
                { name: 'Calendar icon', color: 'info' },
              ].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">&lt;button&gt; + fieldWrapperStyles(edit, size) → 點擊開啟 Popover&lt;Calendar&gt;</span>
          </div>
          {/* Edit + clearable layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">edit + clearable（有值）</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[
                { name: 'button trigger text (flex-1)', color: 'success' },
                { name: 'X clear', color: 'error' },
                { name: 'Calendar icon', color: 'info' },
              ].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">clearable && value → X 在 Calendar 左側</span>
          </div>
          {/* Readonly/Disabled layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">readonly / disabled</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5">
              <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>formatted text (flex-1)</span>
            </div>
            <span className="text-[10px] text-fg-muted font-mono">Intl.DateTimeFormat · null 顯示 — (em dash)</span>
          </div>
        </div>
      </div>

      {/* Mode catalog */}
      <div className="flex flex-col gap-3">
        <H3>FieldMode 一覽</H3>
        <div className="flex flex-col gap-2">
          {MODES.map((m) => (
            <div key={m} className="flex items-center gap-4">
              <div className="w-64 shrink-0">
                <DatePicker mode={m} value="2026-04-02" onChange={() => {}} />
              </div>
              <span className="text-caption text-fg-secondary">{MODE_DESC[m]}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-divider pt-2 mt-1 flex flex-col gap-2">
          <span className="text-[11px] text-fg-muted font-medium">+ error prop（僅 edit 模式生效）</span>
          <div className="flex items-center gap-4">
            <div className="w-64 shrink-0">
              <DatePicker error value="2026-04-02" onChange={() => {}} />
            </div>
            <span className="text-caption text-fg-secondary">border-error — 錯誤訊息由 Form help text 提供</span>
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
                ['mode', "'edit' | 'readonly' | 'disabled'", "'edit'", '顯示模式，disabled 原生屬性會自動覆蓋'],
                ['error', 'boolean', 'false', '紅色邊框 + aria-invalid，僅 edit 模式生效'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", '高度與字體，與 Button 共用 field-height token'],
                ['value', 'string | null', '—', 'ISO date string（YYYY-MM-DD）'],
                ['onChange', '(value: string) => void', '—', '值變更回調'],
                ['clearable', 'boolean', 'false', '有值時顯示 X 清除按鈕，僅 edit 模式'],
                ['formatOptions', 'Intl.DateTimeFormatOptions', "{ year: 'numeric', month: '2-digit', day: '2-digit' }", 'readonly / disabled 格式化選項'],
                ['locale', 'string', "'en-US'", 'Intl.DateTimeFormat locale'],
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
   2. 元件檢閱器 — Interactive Inspector
   ═══════════════════════════════════════════════════════════════════════════ */

const InspectorInner = () => {
  const [mode, setMode] = useState<ModeKey>('edit')
  const [size, setSize] = useState<SizeKey>('md')
  const [error, setError] = useState(false)
  const [clearable, setClearable] = useState(false)
  const [value, setValue] = useState('2026-04-02')

  const isEdit = mode === 'edit'
  useEffect(() => { if (!isEdit) { setError(false); setClearable(false) } }, [isEdit])

  const s = SIZE_SPECS[size]
  const colorState: StateKey = !isEdit ? 'default' : error ? 'error' : 'default'
  const colors = mode === 'disabled'
    ? COLOR_MAP.edit.disabled!
    : COLOR_MAP[mode][colorState]!

  const showClear = clearable && !!value && isEdit

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Mode</span>
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => <Tab key={m} active={mode === m} onClick={() => setMode(m)}>{m}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Size</span>
          <div className="flex gap-1.5">
            {SIZES.map((sz) => <Tab key={sz} active={size === sz} onClick={() => setSize(sz)}>{sz}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Error</span>
          <div className="flex gap-1.5">
            <Tab active={!error} onClick={() => setError(false)}>off</Tab>
            <Tab active={error} onClick={() => setError(true)} disabled={!isEdit}>on</Tab>
          </div>
          {!isEdit && <span className="text-[11px] text-fg-muted">僅 edit 模式</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Clearable</span>
          <div className="flex gap-1.5">
            <Tab active={!clearable} onClick={() => setClearable(false)}>off</Tab>
            <Tab active={clearable} onClick={() => setClearable(true)} disabled={!isEdit}>on</Tab>
          </div>
          {!isEdit && <span className="text-[11px] text-fg-muted">僅 edit 模式</span>}
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[380px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <DatePicker
              mode={mode}
              size={size}
              error={error}
              clearable={clearable}
              value={value}
              onChange={setValue}
              className="w-72"
            />
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              {[
                { c: Z.pad, l: '左右內距' },
                ...(isEdit ? [{ c: Z.input, l: 'trigger text' }] : [{ c: Z.input, l: 'formatted text' }]),
                ...(showClear ? [{ c: Z.action, l: 'X clear' }] : []),
                ...(isEdit ? [{ c: Z.icon, l: 'Calendar' }] : []),
              ].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center">
              <div className="flex items-center rounded-md overflow-hidden" style={{ height: 52, outline: `2px solid ${Z.dim.text}22` }}>
                <BpZone w={44} color={Z.pad} label={s.pxToken} sub={`${s.px}px`} />
                <BpZone w={80} color={Z.input} label="flex-1" sub={isEdit ? 'trigger text' : 'text'} />
                {showClear && (
                  <>
                    <BpZone w={32} color={Z.gap} label={s.gapToken} sub={`${s.gap}px`} />
                    <BpZone w={44} color={Z.action} label={`${s.icon}px`} sub="clear" />
                  </>
                )}
                {isEdit && (
                  <>
                    <BpZone w={32} color={Z.gap} label={s.gapToken} sub={`${s.gap}px`} />
                    <BpZone w={44} color={Z.icon} label={`${s.icon}px`} sub="Calendar" />
                  </>
                )}
                <BpZone w={44} color={Z.pad} label={s.pxToken} sub={`${s.px}px`} />
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
            <p className="text-[10px] text-fg-muted">寬度為示意比例，trigger 文字 span 實際 flex-1 填滿剩餘空間</p>
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
            <PropRow label="Border"><TokenValue value={colors.border} /></PropRow>
            {isEdit && (
              <PropRow label="Calendar">
                <TokenValue value={colors.icon} />
              </PropRow>
            )}
            {showClear && (
              <PropRow label="X clear">
                <span className="flex flex-col gap-0.5">
                  <span className="inline-flex items-center gap-1 text-[10px]">
                    <Swatch value="--fg-muted" size="sm" /><span className="font-mono text-fg-secondary">--fg-muted</span><span className="text-fg-muted">default</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px]">
                    <Swatch value="--foreground" size="sm" /><span className="font-mono text-fg-secondary">--foreground</span><span className="text-fg-muted">hover</span>
                  </span>
                </span>
              </PropRow>
            )}
            {!isEdit && mode === 'readonly' && !value && (
              <PropRow label="Empty">
                <TokenValue value="--fg-muted" />
                <span className="text-[10px] text-fg-muted ml-1">em dash —</span>
              </PropRow>
            )}
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="高度" dot={Z.dim.text}><TkVal token={s.heightToken} value={s.height} /></PropRow>
            <PropRow label="左右內距" dot={Z.pad.text}><TkVal token={s.pxToken} value={`${s.px}px`} /></PropRow>
            <PropRow label="元素間距" dot={Z.gap.text}><TkVal token={s.gapToken} value={`${s.gap}px`} /></PropRow>
            {isEdit && (
              <PropRow label="Calendar" dot={Z.icon.text}>{s.icon}px</PropRow>
            )}
            {showClear && (
              <>
                <PropRow label="Clear 尺寸" dot={Z.action.text}>{s.icon}px</PropRow>
                <PropRow label="Hover 背景">{s.clearHover}px (icon + 2)</PropRow>
              </>
            )}
            <PropRow label="Trigger text">flex-1 min-w-0 · truncate</PropRow>
          </div>

          {/* TYPOGRAPHY */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Typography</span></div>
            <PropRow label="Font"><TkVal token={s.fontToken} value={s.font} /></PropRow>
            <PropRow label="Inherit">text-[inherit] font-[inherit]</PropRow>
          </div>

          {/* STYLE */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span></div>
            <PropRow label="Radius"><TkVal token="rounded-md" value="4px" /></PropRow>
            <PropRow label="Border"><TkVal token="border" value="1px solid" /></PropRow>
            <PropRow label="Focus"><TkVal token="border-primary" value="1px — 無 ring" /></PropRow>
            <PropRow label="Transition"><TkVal token="transition-colors" value="150ms" /></PropRow>
            {isEdit && (
              <PropRow label="Popup"><TkVal token="<Popover align='start'>" value="w-auto p-0" /></PropRow>
            )}
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
        <Desc>選擇任意 mode / size / clearable 組合，即時查看所有 token。開發只需確認 token 正確——theme / density 的值解析由系統處理。</Desc>
      </div>
      <InspectorInner />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 色彩對照表 — Mode × State Token Matrix
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Mode × State 色彩對照</H3>
        <Desc>edit 模式有完整的狀態變化（default / hover / focus / error / disabled）。readonly 和 disabled 各只有一種視覺狀態。色塊即時渲染，切 dark mode 自動更新。</Desc>
      </div>

      {/* Edit mode states */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">edit 模式 — 狀態變化</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>State</Th><Th>預覽</Th><Th>色彩 Token</Th></tr></thead>
            <tbody>
              {EDIT_STATES.map((st) => {
                const colors = st === 'disabled' ? COLOR_MAP.edit.disabled! : COLOR_MAP.edit[st]!
                return (
                  <tr key={st}>
                    <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top w-24">{st}</td>
                    <td className="p-3 border-b border-divider align-top min-w-[240px]">
                      <DatePicker
                        mode={st === 'disabled' ? 'disabled' : 'edit'}
                        error={st === 'error'}
                        value="2026-04-02"
                        onChange={() => {}}
                      />
                    </td>
                    <td className="p-3 border-b border-divider align-top">
                      <TokenAnnotation colors={colors} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* readonly & disabled */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">readonly / disabled — 單一視覺狀態</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>Mode</Th><Th>預覽</Th><Th>色彩 Token</Th></tr></thead>
            <tbody>
              {(['readonly', 'disabled'] as const).map((m) => (
                <tr key={m}>
                  <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top w-24">{m}</td>
                  <td className="p-3 border-b border-divider align-top min-w-[240px]">
                    <DatePicker mode={m} value="2026-04-02" />
                  </td>
                  <td className="p-3 border-b border-divider align-top">
                    <TokenAnnotation colors={COLOR_MAP[m].default!} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Icon color rules */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Icon 色彩規則</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr><Th>元素</Th><Th>角色</Th><Th>default</Th><Th>hover</Th><Th>disabled</Th></tr></thead>
            <tbody>
              <tr>
                <Td mono>Calendar</Td>
                <Td>指示用途（開啟 picker）</Td>
                <Td><span className="inline-flex items-center gap-1"><Swatch value="--fg-muted" size="sm" /><span className="font-mono">--fg-muted</span></span></Td>
                <Td><span className="text-fg-muted">不變</span></Td>
                <Td><span className="text-fg-muted">不渲染（disabled 無 Calendar）</span></Td>
              </tr>
              <tr>
                <Td mono>X clear</Td>
                <Td>清除已選日期</Td>
                <Td><span className="inline-flex items-center gap-1"><Swatch value="--fg-muted" size="sm" /><span className="font-mono">--fg-muted</span></span></Td>
                <Td><span className="inline-flex items-center gap-1"><Swatch value="--foreground" size="sm" /><span className="font-mono">--foreground</span></span></Td>
                <Td><span className="text-fg-muted">不渲染</span></Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. 尺寸對照表 — Size Token Comparison
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Size Token 對照</H3>
        <Desc>每個 size 對應的 token 一覽。lg 是 icon 尺寸切換點（16px → 20px）。高度與 Button 共用 field-height token，同 size 並排時對齊。</Desc>
      </div>

      {/* Token comparison table */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead><tr>
            <Th>屬性</Th>
            {SIZES.map((sz) => <Th key={sz}>{sz}{sz === 'md' ? '（預設）' : ''}</Th>)}
          </tr></thead>
          <tbody>
            {([
              { label: '高度', key: 'heightToken' as const, subKey: 'height' as const },
              { label: '左右內距', key: 'pxToken' as const, subFn: (sp: SizeSpec) => `${sp.px}px` },
              { label: '元素間距', key: 'gapToken' as const, subFn: (sp: SizeSpec) => `${sp.gap}px` },
              { label: '字體', key: 'fontToken' as const, subFn: (sp: SizeSpec) => sp.font },
              { label: 'Icon 尺寸（Calendar / X）', subFn: (sp: SizeSpec) => `${sp.icon}px` },
              { label: 'Clear hover 背景', subFn: (sp: SizeSpec) => `${sp.clearHover}px (icon+2)` },
            ] as const).map((row) => (
              <tr key={row.label}>
                <Td>{row.label}</Td>
                {SIZES.map((sz) => {
                  const spec = SIZE_SPECS[sz]
                  const token = 'key' in row && row.key ? spec[row.key] as string : undefined
                  const sub = 'subKey' in row && row.subKey ? spec[row.subKey] as string : 'subFn' in row ? row.subFn?.(spec) : undefined
                  return (
                    <Td key={sz} mono>
                      {token && <div className="text-fg-secondary">{token}</div>}
                      {sub && <div className="text-fg-muted text-[10px]">{sub}</div>}
                    </Td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Visual preview — all sizes × all modes */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽 — Size × Mode</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr>
              <Th>Size</Th>
              {MODES.map((m) => <Th key={m}>{m}</Th>)}
              <Th>edit + clearable</Th>
            </tr></thead>
            <tbody>
              {SIZES.map((sz) => (
                <tr key={sz}>
                  <Td mono>{sz}</Td>
                  {MODES.map((m) => (
                    <td key={m} className="p-2 border-b border-divider">
                      <DatePicker mode={m} size={sz} value="2026-04-02" onChange={() => {}} className="w-48" />
                    </td>
                  ))}
                  <td className="p-2 border-b border-divider">
                    <DatePicker size={sz} value="2026-04-02" onChange={() => {}} clearable className="w-48" />
                  </td>
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
   5. 狀態行為 — Clearable / Format / Empty
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior = {
  name: '狀態行為',
  render: () => {
    const [clearVal, setClearVal] = useState('2026-05-15')

    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <H3>狀態行為</H3>
          <Desc>Clearable、格式化選項、空值顯示的視覺變化與互動規則。</Desc>
        </div>

        {/* Clearable behavior */}
        <div className="flex flex-col gap-4">
          <span className="text-caption font-medium text-fg-secondary">Clearable — 有值時顯示 X，清除後消失</span>
          <div className="flex flex-col gap-3 max-w-sm">
            <span className="text-[11px] text-fg-muted">點擊 X 清除日期。清除後 X 消失，Calendar icon 靠右。重新選日期後 X 恢復。</span>
            <DatePicker value={clearVal} onChange={setClearVal} clearable />
            <span className="text-[11px] text-fg-muted font-mono">value: {clearVal ? `"${clearVal}"` : 'empty'}</span>
          </div>
        </div>

        {/* Clearable only in edit */}
        <div className="flex flex-col gap-4">
          <span className="text-caption font-medium text-fg-secondary">Clearable — 僅 edit 模式渲染</span>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <DatePicker value="2026-04-02" onChange={() => {}} clearable className="w-56" />
              <span className="text-fg-muted text-caption">→</span>
              <DatePicker mode="readonly" value="2026-04-02" className="w-56" />
              <span className="text-fg-muted text-caption">→</span>
              <DatePicker mode="disabled" value="2026-04-02" className="w-56" />
            </div>
            <span className="text-[11px] text-fg-muted">左：edit（有 X）→ 中：readonly（無 X，無 Calendar）→ 右：disabled（無 X，無 Calendar，文字灰化）</span>
          </div>
        </div>

        {/* Trigger opens Calendar Popover */}
        <div className="flex flex-col gap-4">
          <span className="text-caption font-medium text-fg-secondary">Trigger — 點擊任意位置開啟 Calendar Popover</span>
          <div className="flex flex-col gap-2 max-w-sm">
            <span className="text-[11px] text-fg-muted">Trigger 是一個 &lt;button&gt;,Calendar icon 內建於 button 內。點擊 trigger 任意位置(含文字區與 icon)都會開啟 Popover 展開本 DS 自建的 Calendar。</span>
            <DatePicker value="2026-05-15" onChange={() => {}} />
          </div>
        </div>

        {/* Format options */}
        <div className="flex flex-col gap-4">
          <span className="text-caption font-medium text-fg-secondary">格式化 — readonly / disabled / Display 使用 Intl.DateTimeFormat</span>
          <div className="overflow-x-auto">
            <table className="border-collapse text-caption">
              <thead><tr><Th>設定</Th><Th>readonly 預覽</Th><Th>Display 預覽</Th></tr></thead>
              <tbody>
                <tr>
                  <Td>預設（MM/DD/YYYY）</Td>
                  <td className="p-2 border-b border-divider"><DatePicker mode="readonly" value="2026-04-02" /></td>
                  <td className="p-2 border-b border-divider"><DatePicker mode="display" value="2026-04-02" /></td>
                </tr>
                <tr>
                  <Td mono>month: 'short'</Td>
                  <td className="p-2 border-b border-divider">
                    <DatePicker mode="readonly" value="2026-04-02" formatOptions={{ year: 'numeric', month: 'short', day: 'numeric' }} />
                  </td>
                  <td className="p-2 border-b border-divider">
                    <DatePicker mode="display" value="2026-04-02" formatOptions={{ year: 'numeric', month: 'short', day: 'numeric' }} />
                  </td>
                </tr>
                <tr>
                  <Td mono>month: 'long'</Td>
                  <td className="p-2 border-b border-divider">
                    <DatePicker mode="readonly" value="2026-04-02" formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }} />
                  </td>
                  <td className="p-2 border-b border-divider">
                    <DatePicker mode="display" value="2026-04-02" formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }} />
                  </td>
                </tr>
                <tr>
                  <Td mono>locale: 'zh-TW'</Td>
                  <td className="p-2 border-b border-divider">
                    <DatePicker mode="readonly" value="2026-04-02" locale="zh-TW" formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }} />
                  </td>
                  <td className="p-2 border-b border-divider">
                    <DatePicker mode="display" value="2026-04-02" locale="zh-TW" formatOptions={{ year: 'numeric', month: 'long', day: 'numeric' }} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <span className="text-[11px] text-fg-muted">edit trigger 顯示文字與 Display 都用 Intl.DateTimeFormat 格式化（formatOptions / locale prop 對兩者皆生效,跨模式一致）。</span>
        </div>

        {/* Empty value display */}
        <div className="flex flex-col gap-4">
          <span className="text-caption font-medium text-fg-secondary">空值 — 統一 em dash（—）+ fg-muted</span>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-fg-muted w-20 shrink-0">readonly</span>
              <DatePicker mode="readonly" value={null} className="w-48" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-fg-muted w-20 shrink-0">disabled</span>
              <DatePicker mode="disabled" value={null} className="w-48" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-fg-muted w-20 shrink-0">Display</span>
              <DatePicker mode="display" value={null} />
            </div>
          </div>
        </div>
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. Calendar 內部 token — Popup 視覺規格
   ═══════════════════════════════════════════════════════════════════════════ */

export const CalendarTokens = {
  name: 'Calendar 內部 token',
  render: () => {
    const [selected, setSelected] = useState<Date | undefined>(new Date(2026, 4, 15)) // 2026-05-15 專案截止日
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <H3>Calendar Popup — 本 DS 自建</H3>
          <Desc>
            DatePicker 展開的 Calendar 使用 react-day-picker v9 + 本 DS token 覆寫預設視覺(見 ./calendar.tsx)。
            所有視覺 token 由 semantic token 驅動,切 dark mode 自動聯動,不需元件內重寫。
          </Desc>
        </div>

        {/* Live preview */}
        <div className="flex gap-8 items-start">
          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">實際渲染</span>
            <div className="border border-divider rounded-md bg-surface-raised shadow-[var(--elevation-200)] inline-block">
              <DSDateGrid
                mode="single"
                selected={selected}
                onSelect={setSelected}
                defaultMonth={new Date(2026, 4, 1)}
              />
            </div>
            <span className="text-[11px] text-fg-muted font-mono">selected: {selected ? selected.toISOString().slice(0, 10) : 'none'}</span>
          </div>

          {/* Token table */}
          <div className="flex-1 min-w-[420px]">
            <span className="text-caption font-medium text-fg-secondary block mb-2">Cell state token(5 種 canonical)</span>
            <div className="overflow-x-auto">
              <table className="border-collapse text-caption w-full">
                <thead><tr><Th>State</Th><Th>視覺</Th><Th>Token / Class</Th><Th>備註</Th></tr></thead>
                <tbody>
                  <tr>
                    <Td>正常(未 hover)</Td>
                    <Td>黑字透明底</Td>
                    <Td mono>text-foreground</Td>
                    <Td>base state</Td>
                  </tr>
                  <tr>
                    <Td>today</Td>
                    <Td>文字下方藍色底線</Td>
                    <Td mono>underline · decoration-primary · decoration-2 · underline-offset-4</Td>
                    <Td>非 ring circle(避免與 hover 混淆,對齊 Ant / Google Calendar / macOS Calendar)</Td>
                  </tr>
                  <tr>
                    <Td>disabled</Td>
                    <Td>灰底圓圈 + 淺灰字</Td>
                    <Td mono>bg-disabled · rounded-full · text-fg-disabled</Td>
                    <Td>與 outside month 視覺略有區隔</Td>
                  </tr>
                  <tr>
                    <Td>selected(single / range 端點)</Td>
                    <Td>藍底白字圓</Td>
                    <Td mono>bg-primary · text-on-emphasis · rounded-full</Td>
                    <Td>range_start / range_end 共用此視覺</Td>
                  </tr>
                  <tr>
                    <Td>range track(中間日期)</Td>
                    <Td>灰底矩形橫條</Td>
                    <Td mono>bg-[var(--color-neutral-3)](day 容器層)</Td>
                    <Td>與端點圓接縫形成連續 bar</Td>
                  </tr>
                  <tr>
                    <Td>hover(未選中)</Td>
                    <Td>藍圈 outline 無 fill</Td>
                    <Td mono>hover:ring-1 · hover:ring-primary · hover:bg-transparent</Td>
                    <Td>非 filled 避免跟 selected 混淆</Td>
                  </tr>
                  <tr>
                    <Td>outside month</Td>
                    <Td>弱化字色</Td>
                    <Td mono>text-fg-disabled</Td>
                    <Td>上下月溢出日期;不套 disabled 灰底圓(outside 只是「非當月」不是「禁選」)</Td>
                  </tr>
                </tbody>
              </table>
            </div>

            <span className="text-caption font-medium text-fg-secondary block mb-2 mt-6">其他區塊 token</span>
            <div className="overflow-x-auto">
              <table className="border-collapse text-caption w-full">
                <thead><tr><Th>區塊</Th><Th>Token / Class</Th><Th>說明</Th></tr></thead>
                <tbody>
                  <tr>
                    <Td>月份 caption</Td>
                    <Td mono>text-body · font-medium</Td>
                    <Td>如「May 2026」,視覺上與 SelectMenu 標題同一層級</Td>
                  </tr>
                  <tr>
                    <Td>Nav 按鈕(prev / next)</Td>
                    <Td mono>h-9 · w-9 · rounded-md · text-fg-muted · hover:bg-neutral-hover</Td>
                    <Td>Tertiary-style icon button,hover 才浮現背景。w-9 對齊 day cell 做左右對稱</Td>
                  </tr>
                  <tr>
                    <Td>星期標頭</Td>
                    <Td mono>h-8 · w-9 · text-caption · text-fg-muted · font-normal</Td>
                    <Td>Mon / Tue...弱化為輔助資訊</Td>
                  </tr>
                  <tr>
                    <Td>日格</Td>
                    <Td mono>h-9 · w-9</Td>
                    <Td>36×36,容納點擊區 + 視覺指示</Td>
                  </tr>
                  <tr>
                    <Td>Popover padding</Td>
                    <Td mono>p-3(12px 四邊對稱)</Td>
                    <Td>chevron 到 popover 邊距 = 最邊欄 day cell 到 popover 邊距</Td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-footnote text-fg-muted mt-4">
              <strong>State stacking</strong>:today + selected → selected 勝出(藍底白字圓);today + range-middle → track 灰底 + underline 仍可見。
            </p>
            <p className="text-footnote text-fg-muted mt-2">
              <strong>對照 TimePicker</strong>:TimePicker panel 選項 selected 用 `bg-neutral-selected`(「列表選中」語意,跟 SelectMenu 同流派);DatePicker 用 primary(「最終選定日期」強 affordance,對齊 Google / Notion / Ant)。
            </p>
          </div>
        </div>

        {/* Architecture */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">架構</span>
          <pre className="text-caption font-mono bg-neutral-hover rounded-md p-4 text-fg-secondary leading-relaxed">
{`<button fieldWrapperStyles>        ← 視覺仍是 Input wrapper(不變)
  <span>格式化的日期文字</span>
  <ItemInlineAction X />            ← 選用,clearable=true 時顯示
  <CalendarIcon />                   ← 右側固定
</button>
       │ 點擊開啟
       ▼
<Popover align="start">
  <Calendar />                      ← react-day-picker + 本 DS token
</Popover>`}
          </pre>
        </div>
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. Accessibility — ARIA roles + keyboard map
   ═══════════════════════════════════════════════════════════════════════════ */

export const Accessibility = {
  name: 'A11y',
  render: () => (
    <div className="flex flex-col gap-6 max-w-3xl text-body">
      <section>
        <h3 className="text-body font-bold mb-2">ARIA roles</h3>
        <ul className="list-disc list-inside text-caption text-fg-secondary space-y-1">
          <li>Trigger:<code>{`<div role="combobox" tabIndex={0}>`}</code> + <code>aria-haspopup="dialog"</code> + <code>aria-expanded={`{open}`}</code></li>
          <li>Trigger 必含 accessible name(<code>aria-label</code> / 外層 <code>{`<label>`}</code> / fieldCtx label)</li>
          <li>Popover content:<code>role="dialog"</code> + <code>aria-label="日期選擇"</code>(Range:<code>"日期區間選擇"</code>)</li>
          <li>Range 雙 trigger:<code>aria-expanded</code> 對應只當該 trigger active 時 true</li>
        </ul>
      </section>
      <section>
        <h3 className="text-body font-bold mb-2">鍵盤(Radix Popover + react-day-picker v9 內建)</h3>
        <ul className="list-disc list-inside text-caption text-fg-secondary space-y-1">
          <li>Trigger:<kbd>Space</kbd> / <kbd>Enter</kbd> 開 popover</li>
          <li>Popover 開啟:<kbd>Esc</kbd> 關閉 + focus return to trigger</li>
          <li>DateGrid:<kbd>←</kbd> <kbd>→</kbd> 切日 / <kbd>PgUp</kbd> <kbd>PgDn</kbd> 切月 / <kbd>Home</kbd> <kbd>End</kbd> 行首尾</li>
          <li>showTime:<kbd>Tab</kbd> 從 calendar 跳到右側 time panel,各 column <kbd>↑</kbd> <kbd>↓</kbd> 切 option</li>
        </ul>
      </section>
    </div>
  ),
}

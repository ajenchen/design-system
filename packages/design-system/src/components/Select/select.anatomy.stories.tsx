// @anatomy-rationale:
//   StateBehavior covered by ColorMatrix「Mode x State 色彩對照」段(3 mode ×
//     4 state + edit error 3 sub-states + text vs tag 模式色彩差異)。Select
//     的狀態本身就是 mode × state 的色彩 token 組合,集中於 ColorMatrix 比拆
//     5. 更直觀。
import type { Meta } from '@storybook/react'
import { useState, useEffect } from 'react'
import { Flag } from 'lucide-react'
import { Select } from './select'

const meta: Meta = {
  title: 'Design System/Components/Select/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type ModeKey = 'edit' | 'readonly' | 'disabled'
type DisplayKey = 'plain' | 'tag'
type SizeKey = 'sm' | 'md' | 'lg'
type StateKey = 'default' | 'hover' | 'focus' | 'error' | 'disabled'

const MODES: ModeKey[] = ['edit', 'readonly', 'disabled']
const DISPLAYS: DisplayKey[] = ['plain', 'tag']
const SIZES: SizeKey[] = ['sm', 'md', 'lg']

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'closed', label: 'Closed' },
]

interface ColorSpec { bg: string; text: string; border: string; icon: string }

// ── Token map: mode x state ────────────────────────────────────────────────
// Traced from field-wrapper.tsx cva (fieldWrapperStyles) + select.tsx
const TOKEN_MAP: Record<ModeKey, Record<StateKey, ColorSpec>> = {
  edit: {
    default:  { bg: '--surface',     text: '--foreground',  border: '--border',       icon: '--fg-muted' },
    hover:    { bg: '--surface',     text: '--foreground',  border: '--border-hover', icon: '--fg-muted' },
    focus:    { bg: '--surface',     text: '--foreground',  border: '--primary',      icon: '--fg-muted' },
    error:    { bg: '--surface',     text: '--foreground',  border: '--error',        icon: '--fg-muted' },
    disabled: { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent',    icon: '--fg-disabled' },
  },
  // readonly wrapper 為靜態 bg-readonly(field-wrapper.tsx 無 hover/focus 樣式;mode prop 勝 disabled)
  readonly: {
    default:  { bg: '--bg-readonly', text: '--foreground',  border: 'transparent', icon: '--fg-muted' },
    hover:    { bg: '--bg-readonly', text: '--foreground',  border: 'transparent', icon: '--fg-muted' },
    focus:    { bg: '--bg-readonly', text: '--foreground',  border: 'transparent', icon: '--fg-muted' },
    error:    { bg: '--bg-readonly', text: '--foreground',  border: 'transparent', icon: '--fg-muted' },
    disabled: { bg: '--bg-readonly', text: '--foreground',  border: 'transparent', icon: '--fg-muted' },
  },
  disabled: {
    default:  { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
    hover:    { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
    focus:    { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
    error:    { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
    disabled: { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
  },
}

// Error state tokens (edit only) — traced from select.tsx line 177-178
// border-error hover:border-error-hover, focus-within:border-error
const ERROR_TOKENS: Record<StateKey, ColorSpec> = {
  default:  { bg: '--surface', text: '--foreground', border: '--error',       icon: '--fg-muted' },
  hover:    { bg: '--surface', text: '--foreground', border: '--error-hover', icon: '--fg-muted' },
  focus:    { bg: '--surface', text: '--foreground', border: '--error',       icon: '--fg-muted' },
  error:    { bg: '--surface', text: '--foreground', border: '--error',       icon: '--fg-muted' },
  disabled: { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent', icon: '--fg-disabled' },
}

interface SizeSpec {
  heightToken: string; height: string
  pxToken: string; px: string
  gapToken: string; gap: string
  fontToken: string; font: string
  icon: number
  tagHeight: string
  tagPaddingFormula: string
}

// Traced from field-wrapper.tsx cva (size variants) + select.tsx tagPadding
const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  sm: {
    heightToken: 'h-field-sm', height: '28px',
    pxToken: 'px-3', px: '12px',
    gapToken: 'gap-2', gap: '8px',
    fontToken: 'text-body', font: '14px',
    icon: 16,
    tagHeight: '20px (tag-sm)',
    tagPaddingFormula: '(field-height-sm - 1.25rem) / 2',
  },
  md: {
    heightToken: 'h-field-md', height: '32px',
    pxToken: 'px-3', px: '12px',
    gapToken: 'gap-2', gap: '8px',
    fontToken: 'text-body', font: '14px',
    icon: 16,
    tagHeight: '24px (tag-md)',
    tagPaddingFormula: '(field-height-md - 1.5rem) / 2',
  },
  lg: {
    heightToken: 'h-field-lg', height: '36px',
    pxToken: 'px-3', px: '12px',
    gapToken: 'gap-2', gap: '8px',
    fontToken: 'text-body-lg', font: '16px',
    icon: 20,
    tagHeight: '24px (tag-lg)',
    tagPaddingFormula: '(field-height-lg - 1.5rem) / 2',
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared UI Components

   NOTE: Kept local (not imported from `_anatomy/anatomy-utils`) because the
   Button-family inspector layout diverges visually from the 通用 helpers:
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
        <span className="text-fg-muted w-6 shrink-0">{label}</span>
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
   Blueprint colors
   ═══════════════════════════════════════════════════════════════════════════ */

const Z = {
  pad:     { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  icon:    { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  gap:     { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  select:  { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  action:  { bg: 'rgba(245,180,180,0.6)', border: 'rgba(200,100,100,0.9)', text: '#a03030' },
  tag:     { bg: 'rgba(180,220,230,0.6)', border: 'rgba(80,160,180,0.9)', text: '#2a7a8a' },
  dim:     { text: '#d04040' },
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
      {/* ── Anatomy: text mode ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）— plain 模式</H3>
          <Desc>display="plain"（預設）。觸發點顯示選中值的純文字 + ChevronDown。可搭配 startIcon 代表 value 的圖示。clearable 有值時出現 clear 按鈕。「plain」表樸素文字呈現,跟 Button variant="text" 區隔(2026-05-01 從 'text' 改名,避免 prop value 跨元件衝突)。</Desc>
        </div>
        <div className="flex gap-8">
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">基本</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[{ name: 'select （文字）', color: 'success' }, { name: 'select （文字）', color: 'magenta' }].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">startIcon + clearable</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[{ name: 'startIcon', color: 'info' }, { name: 'startIcon', color: 'success' }, { name: 'startIcon', color: 'warning' }, { name: 'startIcon', color: 'magenta' }].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Anatomy: tag mode ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）— tag 模式</H3>
          <Desc>display="tag"。用一顆 Tag 元件呈現選中值,Tag 設為 pointer-events-none 讓點擊穿透到觸發點容器去開選單。startIcon 不可用於 tag 模式。</Desc>
        </div>
        <div className="flex gap-8">
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">edit</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[{ name: 'Tag', color: 'turquoise' }, { name: 'Tag', color: 'success' }, { name: 'Tag', color: 'info' }, { name: 'Tag', color: 'magenta' }].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">Tag: pointer-events-none · 點擊穿透到觸發點開選單</span>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">readonly / disabled</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                style={{ borderColor: 'var(--color-turquoise-6)', backgroundColor: 'var(--color-turquoise-1)', color: 'var(--color-turquoise-6)' }}>Tag</span>
            </div>
            <span className="text-[10px] text-fg-muted font-mono">chevron 恆顯(類型身份 indicator)· 不可開選單 · tagPadding 置中</span>
          </div>
        </div>
      </div>

      {/* ── Display prop catalog ── */}
      <div className="flex flex-col gap-3">
        <H3>display 模式一覽</H3>
        <div className="flex flex-col gap-2">
          {([
            { display: 'plain' as const, desc: '（預設）狀態、類別等純文字選項。原生 select 純文字 + ChevronDown' },
            { display: 'tag' as const, desc: '需要視覺標記的選項（顏色標籤、優先級等）。Tag 元件 + 隱藏 select overlay' },
          ]).map(({ display, desc }) => (
            <div key={display} className="flex items-center gap-4">
              <div className="w-52 shrink-0">
                <Select display={display} options={statusOptions} value="active" size="md" />
              </div>
              <span className="text-caption text-fg-secondary">
                <span className="font-mono font-medium">display="{display}"</span> — {desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Props table ── */}
      <div className="flex flex-col gap-3">
        <H3>Props</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['mode', "'edit'|'display'|'readonly'|'disabled'", "'edit'", 'FieldMode 四模式——edit 可編輯 / display 純展示 / readonly 顯示值不可改 / disabled 灰化'],
                ['variant', "'default'|'bare'|'naked'", "'default'", 'Field chrome variant(預設繼承 context.variant)'],
                ['display', "'plain'|'tag'", "'plain'", '顯示模式——plain 純文字，tag 用 Tag 元件呈現'],
                ['size', "'sm'|'md'|'lg'", "'md'", '尺寸，與 Button 同 size 並排高度一致'],
                ['options', 'SelectOption[]', '—', '選項列表 { value, label }'],
                ['groups', 'SelectGroupConfig[]', '—', '分組顯示(option.group 對應 groups[].key)'],
                ['value', 'string | null', '—', 'controlled 選中值'],
                ['defaultValue', 'string | null', '—', 'uncontrolled 初始值(同時傳 value 走 controlled)'],
                ['onChange', '(value: string) => void', '—', '值變更回呼'],
                ['placeholder', 'string', '—', '未選值時的提示文字'],
                ['clearable', 'boolean', 'false', '有值時顯示 clear 按鈕（僅 edit 模式）'],
                ['searchable', 'boolean', 'false', '啟用搜尋(desktop 時 field 變 input，打字即篩選)'],
                ['loading', 'boolean', 'false', 'dropdown 開啟時取代 options 顯 CircularProgress'],
                ['minRows', 'number', '3', 'menu list 最小列數(空 / 選項少時視覺一致)'],
                ['startIcon', 'LucideIcon', '—', '左側 field-level 指示 icon（muted，僅 plain 模式；代表 value 的圖示走 option.icon）'],
                ['error', 'boolean', 'false', '紅色邊框 + aria-invalid（僅 edit 模式有視覺效果）'],
                ['defaultOpen', 'boolean', 'false', 'uncontrolled 初始開啟(DataTable cell click→1 step open)'],
                ['onOpenChange', '(open: boolean) => void', '—', 'open 狀態變更 callback'],
                ['showDisplayEndIcon', 'boolean', 'false', 'display 模式渲 ChevronDown(DataTable cell 對齊)'],
                ['selectedItemRenderer', '(opt: SelectOption) => ReactNode', '—', 'trigger 已選項目客製 render(PeoplePicker 用)'],
                ['disabled', 'boolean', '—', '原生屬性，自動覆蓋 mode 為 disabled'],
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
  const [display, setDisplay] = useState<DisplayKey>('plain')
  const [size, setSize] = useState<SizeKey>('md')
  const [error, setError] = useState(false)
  const [clearable, setClearable] = useState(false)
  const [hasStartIcon, setHasStartIcon] = useState(false)
  const [value, setValue] = useState<string>('active')

  // startIcon only available in text mode — traced from spec: startIcon 不可用於 tag 模式
  useEffect(() => { if (display === 'tag') setHasStartIcon(false) }, [display])
  // error only visible in edit mode — traced from field.spec.md: 只在 edit 模式下有視覺效果
  useEffect(() => { if (mode !== 'edit') setError(false) }, [mode])

  const s = SIZE_SPECS[size]
  const colors = error ? ERROR_TOKENS.default : TOKEN_MAP[mode].default
  const isTag = display === 'tag'

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
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Display</span>
          <div className="flex gap-1.5">
            {DISPLAYS.map((d) => <Tab key={d} active={display === d} onClick={() => setDisplay(d)}>{d}</Tab>)}
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
            <Tab active={error} onClick={() => setError(true)} disabled={mode !== 'edit'}>on</Tab>
          </div>
          {mode !== 'edit' && <span className="text-[11px] text-fg-muted">僅 edit 模式有效</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Clearable</span>
          <div className="flex gap-1.5">
            <Tab active={!clearable} onClick={() => setClearable(false)}>off</Tab>
            <Tab active={clearable} onClick={() => setClearable(true)}>on</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">startIcon</span>
          <div className="flex gap-1.5">
            <Tab active={!hasStartIcon} onClick={() => setHasStartIcon(false)}>off</Tab>
            <Tab active={hasStartIcon} onClick={() => setHasStartIcon(true)} disabled={display === 'tag'}>on</Tab>
          </div>
          {display === 'tag' && <span className="text-[11px] text-fg-muted">tag 模式不支援 startIcon</span>}
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[340px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <Select
              mode={mode}
              display={display}
              size={size}
              error={error}
              clearable={clearable}
              startIcon={hasStartIcon ? Flag : undefined}
              options={statusOptions}
              value={value}
              onChange={setValue}
              placeholder="選擇狀態"
              className="w-52"
            />
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            {!isTag ? (
              /* ── text mode blueprint ── */
              <>
                <div className="flex items-center gap-4 text-[10px]">
                  {[
                    { c: Z.pad, l: '左右內距' },
                    ...(hasStartIcon ? [{ c: Z.icon, l: 'startIcon' }] : []),
                    { c: Z.gap, l: '元素間距' },
                    { c: Z.select, l: 'Select 文字' },
                    ...(clearable && value ? [{ c: Z.action, l: 'Clear' }] : []),
                    { c: Z.icon, l: 'Chevron' },
                  ].map(({ c, l }) => (
                    <span key={l} className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                      <span className="font-medium" style={{ color: c.text }}>{l}</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center">
                  <div className="flex items-center rounded-md overflow-hidden" style={{ height: 52, outline: `2px solid ${Z.dim.text}22` }}>
                    <BpZone w={44} color={Z.pad} label={s.pxToken} sub={s.px} />
                    {hasStartIcon && <BpZone w={44} color={Z.icon} label={`${s.icon}px`} sub="startIcon" />}
                    {hasStartIcon && <BpZone w={32} color={Z.gap} label={s.gapToken} sub={s.gap} />}
                    <BpZone w={80} color={Z.select} label="flex-1" sub="select 文字" />
                    {clearable && value && <BpZone w={36} color={Z.action} label={`${s.icon}px`} sub="clear" />}
                    <BpZone w={36} color={Z.icon} label={`${s.icon}px`} sub="chevron" />
                    <BpZone w={44} color={Z.pad} label={s.pxToken} sub={s.px} />
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
              </>
            ) : (
              /* ── tag mode blueprint ── */
              <>
                <div className="flex items-center gap-4 text-[10px]">
                  {[
                    { c: Z.pad, l: 'tagPadding' },
                    { c: Z.tag, l: 'Tag' },
                    { c: Z.select, l: 'Select (hidden)' },
                    { c: Z.gap, l: 'Spacer' },
                    ...(clearable && value ? [{ c: Z.action, l: 'Clear' }] : []),
                    { c: Z.icon, l: 'Chevron' },
                  ].map(({ c, l }) => (
                    <span key={l} className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                      <span className="font-medium" style={{ color: c.text }}>{l}</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center">
                  <div className="flex items-center rounded-md overflow-hidden" style={{ height: 52, outline: `2px solid ${Z.dim.text}22` }}>
                    <BpZone w={44} color={Z.pad} label="tagPad" sub="calc()" />
                    <BpZone w={56} color={Z.tag} label="Tag" sub={s.tagHeight} />
                    <BpZone w={40} color={Z.select} label="select" sub="hidden" />
                    <BpZone w={36} color={Z.gap} label="flex-1" sub="spacer" />
                    {clearable && value && <BpZone w={36} color={Z.action} label={`${s.icon}px`} sub="clear" />}
                    <BpZone w={36} color={Z.icon} label={`${s.icon}px`} sub="chevron" />
                    <BpZone w={44} color={Z.pad} label="12px" sub="pR fixed" />
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
              </>
            )}
            <p className="text-[10px] text-fg-muted">寬度為示意比例，實際由內容決定</p>
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
            <PropRow label="Icon"><TokenValue value={colors.icon} /></PropRow>
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="高度" dot={Z.dim.text}><TkVal token={s.heightToken} value={s.height} /></PropRow>
            {isTag ? (
              <>
                <PropRow label="tagPadding" dot={Z.pad.text}><TkVal token="calc()" value={s.tagPaddingFormula} /></PropRow>
                <PropRow label="右側 pR"><TkVal token="0.75rem" value="12px" /></PropRow>
                <PropRow label="Tag 高度" dot={Z.tag.text}>{s.tagHeight}</PropRow>
              </>
            ) : (
              <PropRow label="左右內距" dot={Z.pad.text}><TkVal token={s.pxToken} value={s.px} /></PropRow>
            )}
            <PropRow label="元素間距" dot={Z.gap.text}><TkVal token={s.gapToken} value={s.gap} /></PropRow>
            <PropRow label="Icon 尺寸" dot={Z.icon.text}>{s.icon}px</PropRow>
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
            <PropRow label="Focus"><TkVal token="border-primary" value="1px (no ring)" /></PropRow>
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
   3. 色彩對照表 — Mode × State Token Matrix
   ═══════════════════════════════════════════════════════════════════════════ */

const COLOR_STATES: StateKey[] = ['default', 'hover', 'focus', 'disabled']

export const ColorMatrix = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Mode x State 色彩對照</H3>
        <Desc>text 和 tag 模式共用同一組 wrapper 色彩 token（來自 fieldWrapperStyles）。差異在 tag 模式的 Tag 元件有自己的色彩（由 Tag variant 決定）。色塊即時渲染，切 dark mode 自動更新。</Desc>
      </div>

      {/* ── Normal: mode x state ── */}
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead><tr><Th>Mode</Th>{COLOR_STATES.map((st) => <Th key={st}>{st}</Th>)}</tr></thead>
          <tbody>
            {MODES.map((m) => (
              <tr key={m}>
                <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top">{m}</td>
                {COLOR_STATES.map((st) => {
                  const stateKey = m === 'disabled' ? 'disabled' : st
                  const resolvedMode = m === 'disabled' ? 'disabled' : m
                  return (
                    <td key={st} className="p-3 border-b border-divider align-top min-w-[180px]">
                      <Select
                        mode={resolvedMode}
                        options={statusOptions}
                        value="active"
                        size="sm"
                        disabled={m === 'disabled'}
                      />
                      <TokenAnnotation colors={TOKEN_MAP[resolvedMode][stateKey]} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Error state (edit only) ── */}
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-fg-secondary">error = true（僅 edit 模式有視覺效果）</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>State</Th>{(['default', 'hover', 'focus'] as const).map((st) => <Th key={st}>{st}</Th>)}</tr></thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top">edit + error</td>
                {(['default', 'hover', 'focus'] as const).map((st) => (
                  <td key={st} className="p-3 border-b border-divider align-top min-w-[180px]">
                    <Select options={statusOptions} value="active" size="sm" error />
                    <TokenAnnotation colors={ERROR_TOKENS[st]} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tag mode color comparison ── */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">text vs tag 模式色彩差異</span>
        <Desc>wrapper 色彩相同，tag 模式的 Tag 元件有自己的底色和文字色（neutral = bg-secondary + text-foreground，tagVariant 時用對應色相）。disabled 時 wrapper 變 bg-disabled，Tag 本身色彩不變（Tag 元件無 disabled 樣式）。</Desc>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>Mode</Th><Th>text 模式</Th><Th>tag 模式</Th><Th>差異說明</Th></tr></thead>
            <tbody>
              {MODES.map((m) => (
                <tr key={m}>
                  <Td mono>{m}</Td>
                  <Td>
                    <Select mode={m} display="plain" options={statusOptions} value="active" size="sm" disabled={m === 'disabled'} />
                  </Td>
                  <Td>
                    <Select mode={m} display="tag" options={statusOptions} value="active" size="sm" disabled={m === 'disabled'} />
                  </Td>
                  <Td>
                    {m === 'edit' && 'Wrapper 相同。Tag 用 Tag 元件色彩（neutral = bg-secondary + text-foreground）'}
                    {m === 'readonly' && 'Wrapper 相同（bg-readonly）。Tag 用 tagPadding 置中'}
                    {m === 'disabled' && 'Wrapper 變 bg-disabled。Tag 本身色彩不變（Tag 元件無 disabled 樣式）'}
                  </Td>
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
   4. 尺寸對照表 — Size Token Comparison
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Size Token 對照</H3>
        <Desc>每個 size 對應的 token 一覽。Field 高度使用 --field-height-* semantic token（rem），與 Button 共用。density 切換由系統自動處理。</Desc>
      </div>

      {/* ── text mode token table ── */}
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-fg-secondary">text 模式</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr>
              <Th>屬性</Th>
              {SIZES.map((sz) => <Th key={sz}>{sz}{sz === 'md' ? '（預設）' : ''}</Th>)}
            </tr></thead>
            <tbody>
              {([
                { label: '高度', get: (s: SizeSpec) => ({ token: s.heightToken, sub: s.height }) },
                { label: '左右內距', get: (s: SizeSpec) => ({ token: s.pxToken, sub: s.px }) },
                { label: '元素間距', get: (s: SizeSpec) => ({ token: s.gapToken, sub: s.gap }) },
                { label: '字體', get: (s: SizeSpec) => ({ token: s.fontToken, sub: s.font }) },
                { label: 'Icon 尺寸', get: (s: SizeSpec) => ({ token: undefined, sub: `${s.icon}px` }) },
              ]).map((row) => (
                <tr key={row.label}>
                  <Td>{row.label}</Td>
                  {SIZES.map((sz) => {
                    const { token, sub } = row.get(SIZE_SPECS[sz])
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
      </div>

      {/* ── tag mode additional tokens ── */}
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-fg-secondary">tag 模式額外 token</span>
        <Desc>tag 模式的 padding 用 calc() 公式置中 Tag：px = (field-height - tag-height) / 2。右側 paddingRight 固定 12px（0.75rem）。</Desc>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr>
              <Th>屬性</Th>
              {SIZES.map((sz) => <Th key={sz}>{sz}</Th>)}
            </tr></thead>
            <tbody>
              <tr>
                <Td>Tag 尺寸</Td>
                {SIZES.map((sz) => (
                  <Td key={sz} mono>
                    <div className="text-fg-secondary">{sz === 'sm' ? 'tag-sm' : sz === 'md' ? 'tag-md' : 'tag-lg'}</div>
                    <div className="text-fg-muted text-[10px]">{SIZE_SPECS[sz].tagHeight}</div>
                  </Td>
                ))}
              </tr>
              <tr>
                <Td>tagPadding (px)</Td>
                {SIZES.map((sz) => (
                  <Td key={sz} mono>
                    <div className="text-fg-secondary">calc()</div>
                    <div className="text-fg-muted text-[10px]">{SIZE_SPECS[sz].tagPaddingFormula}</div>
                  </Td>
                ))}
              </tr>
              <tr>
                <Td>paddingRight</Td>
                {SIZES.map((sz) => (
                  <Td key={sz} mono>
                    <div className="text-fg-secondary">0.75rem</div>
                    <div className="text-fg-muted text-[10px]">12px（固定）</div>
                  </Td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Visual preview: text mode ── */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽 — text 模式</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr>
              <Th>Mode</Th>
              {SIZES.map((sz) => <Th key={sz}>{sz}</Th>)}
            </tr></thead>
            <tbody>
              {MODES.map((m) => (
                <tr key={m}>
                  <Td mono>{m}</Td>
                  {SIZES.map((sz) => (
                    <Td key={sz}>
                      <Select mode={m} display="plain" size={sz} options={statusOptions} value="active" disabled={m === 'disabled'} />
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Visual preview: tag mode ── */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽 — tag 模式</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr>
              <Th>Mode</Th>
              {SIZES.map((sz) => <Th key={sz}>{sz}</Th>)}
            </tr></thead>
            <tbody>
              {MODES.map((m) => (
                <tr key={m}>
                  <Td mono>{m}</Td>
                  {SIZES.map((sz) => (
                    <Td key={sz}>
                      <Select mode={m} display="tag" size={sz} options={statusOptions} value="active" disabled={m === 'disabled'} />
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
      <p className="whitespace-pre-line">{"無障礙行為依裝置分兩條路徑:\n\n  ARIA / Pattern  :桌機(非觸控)觸發點是一個容器,標記  role=\"combobox\"  +  aria-expanded  /  aria-haspopup=\"listbox\" ,選項在浮層的 listbox 裡;searchable 模式時容器內另放一個可打字篩選的  <input> 。手機(觸控)改用瀏覽器原生的  <select>  element,直接取得作業系統內建的無障礙與 picker。Field wrapper 兩邊都補  aria-invalid  /  aria-required  /  aria-describedby  /  aria-errormessage ;手機原生  <select>  另由 FieldLabel 的  htmlFor  關聯取得 accessible name。\n\n  Keyboard 行為  :\n\n- Tab — 聚焦到觸發點\n- Enter / Space — 展開選單(searchable 模式則直接進入打字篩選)\n- ↑ / ↓ — 選單展開後在選項間移動\n- 字母鍵 — searchable 模式為打字篩選;手機原生 <select> 為平台內建 type-to-jump 逐字定位(桌機非 searchable combobox 無逐字定位)\n- Enter — 選定目前 highlight 的選項並關閉\n- Esc — 關閉選單(清除值走右側 clear 按鈕,非 Esc)\n\n  Focus  :DS focus 藍框( focus-within:!border-primary )由 Field wrapper 提供;手機原生  <select>  另有系統 focus ring。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。"}</p>
    </div>
  ),
}

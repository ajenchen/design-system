import type { Meta } from '@storybook/react'
import { useState, useEffect } from 'react'
import { Search, Mail, X, Eye, EyeOff } from 'lucide-react'
import { Input } from './input'

const meta: Meta = {
  title: 'Design System/Components/Input/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type ModeKey = 'edit' | 'display' | 'readonly' | 'disabled'
type StateKey = 'default' | 'hover' | 'focus' | 'error' | 'disabled'
type SizeKey = 'sm' | 'md' | 'lg'
type ColorSpec = { bg: string; text: string; border: string; placeholder: string }

const MODES: ModeKey[] = ['edit', 'display', 'readonly', 'disabled']
const EDIT_STATES: StateKey[] = ['default', 'hover', 'focus', 'error', 'disabled']
const SIZES: SizeKey[] = ['sm', 'md', 'lg']

const COLOR_MAP: Record<ModeKey, Partial<Record<StateKey, ColorSpec>>> = {
  edit: {
    default:  { bg: '--surface',      text: '--foreground',  border: '--border',        placeholder: '--fg-muted' },
    hover:    { bg: '--surface',      text: '--foreground',  border: '--border-hover',  placeholder: '--fg-muted' },
    focus:    { bg: '--surface',      text: '--foreground',  border: '--primary',       placeholder: '--fg-muted' },
    error:    { bg: '--surface',      text: '--foreground',  border: '--error',         placeholder: '--fg-muted' },
    disabled: { bg: '--bg-disabled',  text: '--fg-disabled', border: 'transparent',     placeholder: '--fg-disabled' },
  },
  display: {
    default:  { bg: 'transparent',    text: '--foreground',  border: 'transparent',     placeholder: '--fg-muted' },
  },
  readonly: {
    default:  { bg: '--bg-readonly',  text: '--foreground',  border: 'transparent',     placeholder: '--fg-muted' },
  },
  disabled: {
    default:  { bg: '--bg-disabled',  text: '--fg-disabled', border: 'transparent',     placeholder: '--fg-disabled' },
  },
}

interface SizeSpec {
  heightToken: string; height: string
  pxToken: string; px: number
  gapToken: string; gap: number
  fontToken: string; font: string
  icon: number
  actionHover: number
}

const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  sm: { heightToken: 'h-field-sm', height: '28px', pxToken: 'px-3', px: 12, gapToken: 'gap-2', gap: 8, fontToken: 'text-body',    font: '14px', icon: 16, actionHover: 18 },
  md: { heightToken: 'h-field-md', height: '32px', pxToken: 'px-3', px: 12, gapToken: 'gap-2', gap: 8, fontToken: 'text-body',    font: '14px', icon: 16, actionHover: 18 },
  lg: { heightToken: 'h-field-lg', height: '36px', pxToken: 'px-3', px: 12, gapToken: 'gap-2', gap: 8, fontToken: 'text-body-lg', font: '16px', icon: 20, actionHover: 22 },
}

const MODE_DESC: Record<ModeKey, string> = {
  edit:     '表單可編輯欄位 — bg-surface + border + hover/focus 回饋',
  display:  '純展示資料 — 無 chrome（transparent）+ 文字正常色，空值顯示 —（em dash）',
  readonly: '不可編輯但可見 — bg-readonly(neutral-2) + 無邊框 + 文字正常色',
  disabled: '被停用的欄位 — bg-disabled(neutral-2) + 無邊框 + 文字灰化',
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
    {([['bg', 'bg'], ['text', 'text'], ['border', 'bdr'], ['placeholder', 'plh']] as const).map(([key, label]) => (
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
          <Desc>field-wrapper 內含三個 slot：startIcon（靜態指示 icon）、input（flex-1 文字輸入）、endAction（inline action）。wrapper 由 fieldWrapperStyles cva 統一管理模式與尺寸。</Desc>
        </div>
        <div className="flex gap-8">
          {/* Full layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">完整結構</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[
                { name: 'startIcon', color: 'info' },
                { name: 'input （flex-1）', color: 'success' },
                { name: 'endAction', color: 'error' },
              ].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">fieldWrapperStyles(mode, size) · inline-flex · items-center · gap-2</span>
          </div>
          {/* Minimal layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">最小結構</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5">
              <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>input (flex-1)</span>
            </div>
            <span className="text-[10px] text-fg-muted font-mono">只有 input · startIcon / endAction 皆可選</span>
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
                {/* display mode 讀 value(非 defaultValue)渲染 <span>;其餘 mode 用 defaultValue 保持 uncontrolled */}
                {m === 'display' ? (
                  <Input mode={m} value="Wireless Bluetooth Headphones" size="md" />
                ) : (
                  <Input mode={m} defaultValue="Wireless Bluetooth Headphones" size="md" />
                )}
              </div>
              <span className="text-caption text-fg-secondary">{MODE_DESC[m]}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-divider pt-2 mt-1 flex flex-col gap-2">
          <span className="text-[11px] text-fg-muted font-medium">+ error prop（僅 edit 模式生效）</span>
          <div className="flex items-center gap-4">
            <div className="w-64 shrink-0">
              <Input error defaultValue="invalid-email@" size="md" />
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
                ['mode', "'edit' | 'display' | 'readonly' | 'disabled'", "'edit'", 'mode 未顯式指定時依序推導：有效 disabled（prop 或 <Field disabled>）→ fieldCtx.mode → native readOnly → edit；顯式 mode prop 永遠最優先（field-context.ts useResolvedFieldMode）'],
                ['variant', "'default' | 'bare'", "'default'", '視覺 chrome（正交於 mode）；bare = 透明、hover/focus 才出現 border，用於 toolbar inline editing'],
                ['error', 'boolean', 'false', '紅色邊框僅 edit 模式生效；aria-invalid 不分 mode（readonly / disabled 渲染的 input 同樣帶）'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", '高度與字體，與 Button 共用 field-height token'],
                ['startIcon', 'LucideIcon', '—', '左側靜態 icon，fg-muted，pointer-events-none'],
                ['endAction', 'InlineActionConfig', '—', '右側 inline action（宣告式 API），僅 edit 模式渲染；loading=true 或傳 endSlot 時被覆蓋'],
                ['endSlot', 'ReactNode', '—', '右側自訂 slot（escape hatch，如 DropdownMenuTrigger）；與 endAction 互斥，同時傳會優先'],
                ['loading', 'boolean', 'false', 'async 驗證中：endAction slot 自動塞 CircularProgress + aria-busy，input 仍可編輯'],
                ['autoWidth', 'boolean', 'false', '寬度隨內容（field-sizing:content）；用於 inline edit，禁用於表單 Field'],
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
  const [hasStartIcon, setHasStartIcon] = useState(true)
  const [hasEndAction, setHasEndAction] = useState(true)

  const isEdit = mode === 'edit'
  useEffect(() => { if (!isEdit) setError(false) }, [isEdit])

  const s = SIZE_SPECS[size]
  const colorState: StateKey = !isEdit ? 'default' : error ? 'error' : 'default'
  const colors = mode === 'disabled'
    ? COLOR_MAP.edit.disabled!
    : COLOR_MAP[mode][colorState]!

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
          <span className="text-[11px] text-fg-muted w-16 shrink-0">startIcon</span>
          <div className="flex gap-1.5">
            <Tab active={!hasStartIcon} onClick={() => setHasStartIcon(false)}>off</Tab>
            <Tab active={hasStartIcon} onClick={() => setHasStartIcon(true)}>on</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">endAction</span>
          <div className="flex gap-1.5">
            <Tab active={!hasEndAction} onClick={() => setHasEndAction(false)}>off</Tab>
            <Tab active={hasEndAction} onClick={() => setHasEndAction(true)} disabled={!isEdit}>on</Tab>
          </div>
          {!isEdit && <span className="text-[11px] text-fg-muted">僅 edit 模式</span>}
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[380px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <Input
              mode={mode}
              size={size}
              error={error}
              startIcon={hasStartIcon ? Search : undefined}
              endAction={hasEndAction && isEdit ? { icon: X, label: '清除', onClick: () => {} } : undefined}
              // display mode 讀 value 渲染 <span>;其餘 mode 用 defaultValue 保持 uncontrolled
              {...(mode === 'display'
                ? { value: 'Wireless Bluetooth Headphones' }
                : { defaultValue: 'Wireless Bluetooth Headphones' })}
              key={mode}
              className="w-72"
            />
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              {[
                { c: Z.pad, l: '左右內距' },
                ...(hasStartIcon ? [{ c: Z.icon, l: 'startIcon' }] : []),
                { c: Z.gap, l: '元素間距' },
                { c: Z.input, l: 'input' },
                ...(hasEndAction && isEdit ? [{ c: Z.action, l: 'endAction' }] : []),
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
                {hasStartIcon && (
                  <>
                    <BpZone w={44} color={Z.icon} label={`${s.icon}px`} sub="icon" />
                    <BpZone w={32} color={Z.gap} label={s.gapToken} sub={`${s.gap}px`} />
                  </>
                )}
                <BpZone w={80} color={Z.input} label="flex-1" sub="input" />
                {hasEndAction && isEdit && (
                  <>
                    <BpZone w={32} color={Z.gap} label={s.gapToken} sub={`${s.gap}px`} />
                    <BpZone w={44} color={Z.action} label={`${s.icon}px`} sub="action" />
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
            <p className="text-[10px] text-fg-muted">寬度為示意比例，input 實際 flex-1 填滿剩餘空間</p>
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
            <PropRow label="Placeholder"><TokenValue value={colors.placeholder} /></PropRow>
            {hasStartIcon && (
              <PropRow label="startIcon">
                <TokenValue value={mode === 'disabled' ? '--fg-disabled' : '--fg-muted'} />
              </PropRow>
            )}
            {hasEndAction && isEdit && (
              <PropRow label="endAction">
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
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="高度" dot={Z.dim.text}><TkVal token={s.heightToken} value={s.height} /></PropRow>
            <PropRow label="左右內距" dot={Z.pad.text}><TkVal token={s.pxToken} value={`${s.px}px`} /></PropRow>
            <PropRow label="元素間距" dot={Z.gap.text}><TkVal token={s.gapToken} value={`${s.gap}px`} /></PropRow>
            {hasStartIcon && (
              <PropRow label="Icon 尺寸" dot={Z.icon.text}>{s.icon}px</PropRow>
            )}
            {hasEndAction && isEdit && (
              <>
                <PropRow label="Action 尺寸" dot={Z.action.text}>{s.icon}px</PropRow>
                <PropRow label="Hover 背景">{s.actionHover}px (icon + 2)</PropRow>
              </>
            )}
            <PropRow label="Input">flex-1 min-w-0</PropRow>
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
        <Desc>選擇任意 mode / size / slot 組合，即時查看所有 token。開發只需確認 token 正確——theme / density 的值解析由系統處理。</Desc>
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
                      <Input
                        mode={st === 'disabled' ? 'disabled' : 'edit'}
                        error={st === 'error'}
                        defaultValue="Wireless Bluetooth Headphones"
                        size="md"
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
                    <Input mode={m} defaultValue="Wireless Bluetooth Headphones" size="md" />
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
                <Td mono>startIcon</Td>
                <Td>指示用途（如 Search）</Td>
                <Td><span className="inline-flex items-center gap-1"><Swatch value="--fg-muted" size="sm" /><span className="font-mono">--fg-muted</span></span></Td>
                <Td><span className="text-fg-muted">不變</span></Td>
                <Td><span className="inline-flex items-center gap-1"><Swatch value="--fg-disabled" size="sm" /><span className="font-mono">--fg-disabled</span></span></Td>
              </tr>
              <tr>
                <Td mono>endAction</Td>
                <Td>操作動作（如清除）</Td>
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
              { label: '左右內距', key: 'pxToken' as const, subFn: (s: SizeSpec) => `${s.px}px` },
              { label: '元素間距', key: 'gapToken' as const, subFn: (s: SizeSpec) => `${s.gap}px` },
              { label: '字體', key: 'fontToken' as const, subFn: (s: SizeSpec) => s.font },
              { label: 'Icon 尺寸', subFn: (s: SizeSpec) => `${s.icon}px` },
              { label: 'Action hover', subFn: (s: SizeSpec) => `${s.actionHover}px (icon+2)` },
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
              <Th>edit + startIcon + endAction</Th>
            </tr></thead>
            <tbody>
              {SIZES.map((sz) => (
                <tr key={sz}>
                  <Td mono>{sz}</Td>
                  {MODES.map((m) => (
                    <td key={m} className="p-2 border-b border-divider">
                      <Input mode={m} size={sz} defaultValue="Headphones" className="w-48" />
                    </td>
                  ))}
                  <td className="p-2 border-b border-divider">
                    <Input
                      size={sz}
                      startIcon={Search}
                      endAction={{ icon: X, label: '清除', onClick: () => {} }}
                      defaultValue="Headphones"
                      className="w-48"
                    />
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
   5. 狀態行為 — Focus / Error / Disabled
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior = {
  name: '狀態行為',
  render: () => {
    const [showPwd, setShowPwd] = useState(false)
    const [query, setQuery] = useState('Bluetooth')

    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <H3>狀態行為</H3>
          <Desc>Focus、error、disabled 的視覺變化與互動規則。</Desc>
        </div>

        {/* Focus behavior */}
        <div className="flex flex-col gap-4">
          <span className="text-caption font-medium text-fg-secondary">Focus — border-primary（1px），無 ring</span>
          <div className="flex flex-col gap-2 max-w-sm">
            <span className="text-[11px] text-fg-muted">文字輸入永遠 focus-visible（瀏覽器規範），click 和 Tab 觸發相同效果。點擊下方 input 或用 Tab 切換觀察。</span>
            <Input placeholder="點擊或 Tab 觀察 focus 邊框" />
            <Input placeholder="第二個，測試 Tab 切換" />
          </div>
        </div>

        {/* Error behavior */}
        <div className="flex flex-col gap-4">
          <span className="text-caption font-medium text-fg-secondary">Error — 正交於 mode，只在 edit 模式生效</span>
          <div className="flex flex-col gap-3 max-w-sm">
            <div>
              <span className="text-[11px] text-fg-muted block mb-1">border-error，hover 時 border-error-hover</span>
              <Input error defaultValue="invalid-email@" />
              <p className="text-caption text-error mt-1">請輸入有效的 email 地址</p>
            </div>
            <div>
              <span className="text-[11px] text-fg-muted block mb-1">focus 時 border-error（不切回 primary）</span>
              <Input error defaultValue="bad-url" startIcon={Search} />
            </div>
          </div>
        </div>

        {/* Click-through behavior */}
        <div className="flex flex-col gap-4">
          <span className="text-caption font-medium text-fg-secondary">點擊穿透 — startIcon pointer-events-none</span>
          <div className="flex flex-col gap-2 max-w-sm">
            <span className="text-[11px] text-fg-muted">點擊 icon 區域，focus 穿透到 input。endAction 有自己的點擊行為，不穿透。</span>
            <Input
              startIcon={Search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              endAction={query ? { icon: X, label: '清除搜尋', onClick: () => setQuery('') } : undefined}
            />
          </div>
        </div>

        {/* endAction conditional rendering */}
        <div className="flex flex-col gap-4">
          <span className="text-caption font-medium text-fg-secondary">endAction — 條件渲染，消失不佔位</span>
          <div className="flex flex-col gap-3 max-w-sm">
            <div>
              <span className="text-[11px] text-fg-muted block mb-1">密碼切換 — icon 隨狀態變化</span>
              <Input
                type={showPwd ? 'text' : 'password'}
                defaultValue="my-secret-123"
                endAction={{
                  icon: showPwd ? EyeOff : Eye,
                  label: showPwd ? '隱藏密碼' : '顯示密碼',
                  onClick: () => setShowPwd(!showPwd),
                }}
              />
            </div>
          </div>
        </div>

        {/* Disabled behavior */}
        <div className="flex flex-col gap-4">
          <span className="text-caption font-medium text-fg-secondary">Disabled — endAction 不渲染，停用原因由外部承擔</span>
          <div className="flex flex-col gap-3 max-w-sm">
            <div className="flex items-center gap-3">
              <Input mode="edit" startIcon={Mail} defaultValue="alice@example.com"
                endAction={{ icon: X, label: '清除', onClick: () => {} }} className="w-56" />
              <span className="text-fg-muted text-caption">→</span>
              <Input mode="disabled" startIcon={Mail} defaultValue="alice@example.com"
                endAction={{ icon: X, label: '清除', onClick: () => {} }} className="w-56" />
            </div>
            <span className="text-[11px] text-fg-muted">左：edit（有 endAction）→ 右：disabled（endAction 消失，icon 變 fg-disabled）</span>
          </div>
        </div>
      </div>
    )
  },
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳「無障礙設計」段摘要:\n\n  ARIA / Pattern  :採用原生  <input>  元素,自帶基本無障礙。Label 關聯走原生  <label htmlFor={fieldCtx.id}>  配 input  id (FieldLabel 提供,非 aria-labelledby)。Input 自身在  <input>  上設  aria-invalid (error 時)/  aria-required  /  aria-describedby (指向 FieldContext descriptionId)/  aria-errormessage (error 時指向 errorId)。\n\n  鍵盤行為  :\n\n- Tab — 聚焦到欄位\n- 字母鍵 — 輸入文字\n- 一般文字編輯鍵(方向鍵 / Backspace / Delete / 全選)由瀏覽器原生提供\n\n  聚焦樣式  :原生 input 的外框已被關閉(outline-none);聚焦時的視覺提示由外層 Field 容器的藍色邊框( focus-within 變 border-primary )提供。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA 對比 ≥ 4.5:1(文字)/ 3:1(UI)。"}</p>
    </div>
  ),
}

import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { X } from 'lucide-react'
import { NumberInput } from './number-input'
import type { FieldMode } from '@/design-system/components/Field/field-types'

const meta: Meta = {
  title: 'Design System/Components/NumberInput/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type ModeKey = FieldMode
type StateKey = 'default' | 'hover' | 'focus' | 'error' | 'disabled'
type SizeKey = 'sm' | 'md' | 'lg'
type ColorSpec = { bg: string; text: string; border: string }

const MODES: ModeKey[] = ['edit', 'display', 'readonly', 'disabled']
const SIZES: SizeKey[] = ['sm', 'md', 'lg']

const MODE_DESC: Record<ModeKey, string> = {
  edit: '表單可編輯欄位，有邊框、hover / focus 回饋',
  display: '純展示（read-only 內容），無 input chrome、無互動 affordance',
  readonly: '表單中不可編輯但可見，灰底、無邊框（input chrome 但鎖定）',
  disabled: '停用狀態，灰底、灰字、cursor-not-allowed',
}

const TOKEN_MAP: Record<ModeKey, Record<StateKey, ColorSpec>> = {
  edit: {
    default:  { bg: '--surface',      text: '--foreground',   border: '--border' },
    hover:    { bg: '--surface',      text: '--foreground',   border: '--border-hover' },
    focus:    { bg: '--surface',      text: '--foreground',   border: '--primary' },
    error:    { bg: '--surface',      text: '--foreground',   border: '--error' },
    disabled: { bg: '--bg-disabled',  text: '--fg-disabled',  border: 'transparent' },
  },
  display: {
    default:  { bg: 'transparent',    text: '--foreground',   border: 'transparent' },
    hover:    { bg: 'transparent',    text: '--foreground',   border: 'transparent' },
    focus:    { bg: 'transparent',    text: '--foreground',   border: 'transparent' },
    error:    { bg: 'transparent',    text: '--foreground',   border: 'transparent' },
    disabled: { bg: 'transparent',    text: '--fg-disabled',  border: 'transparent' },
  },
  readonly: {
    default:  { bg: '--bg-readonly',  text: '--foreground',   border: 'transparent' },
    hover:    { bg: '--bg-disabled',  text: '--foreground',   border: 'transparent' },
    focus:    { bg: '--bg-disabled',  text: '--foreground',   border: 'transparent' },
    error:    { bg: '--bg-disabled',  text: '--foreground',   border: 'transparent' },
    disabled: { bg: '--bg-disabled',  text: '--foreground',   border: 'transparent' },
  },
  disabled: {
    default:  { bg: '--bg-disabled',  text: '--fg-disabled',  border: 'transparent' },
    hover:    { bg: '--bg-disabled',  text: '--fg-disabled',  border: 'transparent' },
    focus:    { bg: '--bg-disabled',  text: '--fg-disabled',  border: 'transparent' },
    error:    { bg: '--bg-disabled',  text: '--fg-disabled',  border: 'transparent' },
    disabled: { bg: '--bg-disabled',  text: '--fg-disabled',  border: 'transparent' },
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

const Tab = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick}
    className={`px-2.5 py-1 text-[12px] font-mono rounded-md cursor-pointer transition-colors ${
      active ? 'bg-primary text-white font-semibold' : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
    }`}>
    {children}
  </button>
)

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
   Blueprint Zone
   ═══════════════════════════════════════════════════════════════════════════ */

const Z = {
  pad:   { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  input: { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  gap:   { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  action:{ bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
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
          <Desc>NumberInput 由 wrapper + input + 可選 endAction 組成。edit 模式輸入 raw 數值，readonly / disabled 顯示格式化結果。</Desc>
        </div>
        <div className="flex gap-8">
          {/* Edit layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">edit</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[{ name: 'wrapper', color: 'info' }, { name: 'wrapper', color: 'success' }, { name: 'wrapper', color: 'warning' }].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">input: type="text" inputMode="decimal"</span>
          </div>
          {/* Readonly/Disabled layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">readonly / disabled</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[{ name: 'wrapper', color: 'info' }, { name: 'wrapper', color: 'success' }].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">prefix + toLocaleString() + suffix</span>
          </div>
        </div>
      </div>

      {/* FieldMode catalog */}
      <div className="flex flex-col gap-3">
        <H3>Mode 一覽</H3>
        <div className="flex flex-col gap-2">
          {MODES.map((m) => (
            <div key={m} className="flex items-center gap-4">
              <div className="w-56 shrink-0">
                <NumberInput mode={m} value={2490} prefix="$" className="max-w-[200px]" />
              </div>
              <span className="font-mono text-caption text-fg-secondary w-20 shrink-0">{m}</span>
              <span className="text-caption text-fg-secondary">{MODE_DESC[m]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Format options */}
      <div className="flex flex-col gap-3">
        <H3>格式化選項</H3>
        <Desc>格式化在 readonly / disabled 和 `mode="display"` 生效。edit 模式輸入 raw 數值（不套格式），確保使用者能直覺地修改。</Desc>
        <div className="flex flex-col gap-2">
          {([
            { label: 'prefix="$"', props: { prefix: '$' }, value: 2490 },
            { label: 'suffix="%"  precision={1}', props: { suffix: '%', precision: 1 }, value: 85.5 },
            { label: 'prefix="NT$"  precision={0}', props: { prefix: 'NT$', precision: 0 }, value: 12500 },
            { label: 'null value', props: { prefix: '$' }, value: null },
          ] as const).map(({ label, props, value }) => (
            <div key={label} className="flex items-center gap-4">
              <div className="w-56 shrink-0">
                <NumberInput mode="readonly" value={value} {...props} className="max-w-[200px]" />
              </div>
              <span className="text-caption font-mono text-fg-secondary">{label}</span>
              {value === null && <span className="text-[11px] text-fg-muted">em dash + text-fg-muted</span>}
            </div>
          ))}
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
                ['mode', "'edit'|'display'|'readonly'|'disabled'", "'edit'", '顯示模式'],
                ['error', 'boolean', 'false', '紅色邊框 + aria-invalid（僅 edit 生效）'],
                ['size', "'sm'|'md'|'lg'", "'md'", '尺寸，與 Button 同 size 對齊'],
                ['value', 'number | null', '—', '數值'],
                ['onChange', '(value: number | null) => void', '—', '值變更 callback'],
                ['prefix', 'string', '—', '前綴字串（如 $ NT$）'],
                ['suffix', 'string', '—', '後綴字串（如 % 元）'],
                ['precision', 'number', '—', '小數位數'],
                ['locale', 'string', "'en-US'", '數字格式 locale'],
                ['endAction', 'InlineActionConfig', '—', '右側 inline action（宣告式 API）'],
                ['disabled', 'boolean', 'false', '原生屬性；mode 未顯式指定時解析為 disabled（顯式 mode prop 永遠最優先，useResolvedFieldMode SSOT）'],
                ['readOnly', 'boolean', 'false', '原生屬性；mode 未顯式指定且無 Field context mode 時解析為 readonly（優先序 mode > 有效 disabled > fieldCtx.mode > readOnly）'],
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
  const [hasEndAction, setHasEndAction] = useState(false)
  const [hasPrefix, setHasPrefix] = useState(true)
  const [value, setValue] = useState<number | null>(2490)

  const isEdit = mode === 'edit'
  const resolvedError = isEdit && error

  // Determine visible state for the inspect panel
  const visibleState: StateKey = mode === 'disabled' ? 'disabled' : resolvedError ? 'error' : 'default'
  const colors = TOKEN_MAP[mode][visibleState]
  const s = SIZE_SPECS[size]

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
            <Tab active={error} onClick={() => setError(true)}>on</Tab>
          </div>
          {!isEdit && error && <span className="text-[11px] text-fg-muted">僅 edit 模式可見</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Prefix</span>
          <div className="flex gap-1.5">
            <Tab active={!hasPrefix} onClick={() => setHasPrefix(false)}>off</Tab>
            <Tab active={hasPrefix} onClick={() => setHasPrefix(true)}>$</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">endAction</span>
          <div className="flex gap-1.5">
            <Tab active={!hasEndAction} onClick={() => setHasEndAction(false)}>off</Tab>
            <Tab active={hasEndAction} onClick={() => setHasEndAction(true)}>on</Tab>
          </div>
          {!isEdit && hasEndAction && <span className="text-[11px] text-fg-muted">僅 edit 模式渲染</span>}
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[340px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <NumberInput
              mode={mode}
              size={size}
              error={resolvedError}
              value={value}
              onChange={setValue}
              prefix={hasPrefix ? '$' : undefined}
              endAction={isEdit && hasEndAction ? { icon: X, label: '清除', onClick: () => setValue(null) } : undefined}
              className="max-w-[240px]"
            />
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              {[{ c: Z.pad, l: '左右內距' }, { c: Z.input, l: 'Input' }, ...(isEdit && hasEndAction ? [{ c: Z.gap, l: 'gap' }, { c: Z.action, l: 'endAction' }] : [])].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center">
              <div className="flex items-center rounded-md overflow-hidden" style={{ height: 52, outline: `2px solid ${Z.dim.text}22` }}>
                <BpZone w={44} color={Z.pad} label={s.pxToken} sub={`${s.px}px`} />
                <BpZone w={isEdit && hasEndAction ? 100 : 160} color={Z.input} label={isEdit ? 'input' : 'formatted'} sub={`flex-1 · ${s.fontToken}`} />
                {isEdit && hasEndAction && (
                  <>
                    <BpZone w={32} color={Z.gap} label={s.gapToken} sub={`${s.gap}px`} />
                    <BpZone w={44} color={Z.action} label={`${s.icon}px`} sub="endAction" />
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
            <p className="text-[10px] text-fg-muted">寬度為示意比例，實際由 w-full 撐滿父容器</p>
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
            {resolvedError && <PropRow label="Error bdr"><TokenValue value="--error" /></PropRow>}
            {isEdit && (
              <PropRow label="Placeholder">
                <span className="inline-flex items-center gap-2"><Swatch value="--fg-muted" /><span>--fg-muted</span></span>
              </PropRow>
            )}
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="高度" dot={Z.dim.text}><TkVal token={s.heightToken} value={s.height} /></PropRow>
            <PropRow label="寬度">w-full</PropRow>
            <PropRow label="左右內距" dot={Z.pad.text}><TkVal token={s.pxToken} value={`${s.px}px`} /></PropRow>
            <PropRow label="元素間距" dot={Z.gap.text}><TkVal token={s.gapToken} value={`${s.gap}px`} /></PropRow>
            {isEdit && hasEndAction && (
              <PropRow label="Action icon" dot={Z.action.text}>{s.icon}px (hover bg: {s.actionHover}px)</PropRow>
            )}
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
            <PropRow label="Border"><TkVal token={isEdit ? 'border' : 'border-transparent'} value={isEdit ? '1px solid' : 'none'} /></PropRow>
            {isEdit && <PropRow label="Focus"><TkVal token="border-primary" value="1px solid (no ring)" /></PropRow>}
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
        <Desc>選擇任意組合，即時查看所有 token。hover / focus 行為需在預覽區實際操作體驗。</Desc>
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
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Mode x State 色彩對照</H3>
        <Desc>edit 模式有完整的 state 變化（hover / focus / error），readonly 和 disabled 為靜態。色塊即時渲染，切 dark mode 自動更新。</Desc>
      </div>

      {/* Edit mode — full state progression */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">edit 模式</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <Th>State</Th>
                <Th>預覽</Th>
                <Th>Background</Th>
                <Th>Text</Th>
                <Th>Border</Th>
              </tr>
            </thead>
            <tbody>
              {(['default', 'hover', 'focus', 'error'] as const).map((st) => {
                const c = TOKEN_MAP.edit[st]
                return (
                  <tr key={st}>
                    <Td mono>{st}</Td>
                    <Td>
                      <div className="w-[180px]">
                        <NumberInput mode="edit" value={2490} prefix="$" error={st === 'error'} />
                      </div>
                    </Td>
                    <Td><span className="inline-flex items-center gap-1.5"><Swatch value={c.bg} size="sm" /><span className="font-mono text-[11px]">{c.bg}</span></span></Td>
                    <Td><span className="inline-flex items-center gap-1.5"><Swatch value={c.text} size="sm" /><span className="font-mono text-[11px]">{c.text}</span></span></Td>
                    <Td><span className="inline-flex items-center gap-1.5"><Swatch value={c.border} size="sm" /><span className="font-mono text-[11px]">{c.border}</span></span></Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <span className="text-[10px] text-fg-muted">hover / focus 為動態狀態，表中預覽為 default 和 error 靜態截圖。實際 hover / focus 請在檢閱器中操作。</span>
      </div>

      {/* Readonly + Disabled */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">readonly / disabled 模式</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <Th>Mode</Th>
                <Th>預覽</Th>
                <Th>Background</Th>
                <Th>Text</Th>
                <Th>Border</Th>
              </tr>
            </thead>
            <tbody>
              {(['readonly', 'disabled'] as ModeKey[]).map((m) => {
                const c = TOKEN_MAP[m].default
                return (
                  <tr key={m}>
                    <Td mono>{m}</Td>
                    <Td>
                      <div className="w-[180px]">
                        <NumberInput mode={m} value={2490} prefix="$" />
                      </div>
                    </Td>
                    <Td><span className="inline-flex items-center gap-1.5"><Swatch value={c.bg} size="sm" /><span className="font-mono text-[11px]">{c.bg}</span></span></Td>
                    <Td><span className="inline-flex items-center gap-1.5"><Swatch value={c.text} size="sm" /><span className="font-mono text-[11px]">{c.text}</span></span></Td>
                    <Td><span className="inline-flex items-center gap-1.5"><Swatch value={c.border} size="sm" /><span className="font-mono text-[11px]">{c.border}</span></span></Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* endAction icon colors */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">endAction icon 色彩</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>State</Th><Th>Icon 色</Th><Th>Hover bg</Th></tr></thead>
            <tbody>
              <tr>
                <Td mono>default</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--fg-muted" size="sm" /><span className="font-mono text-[11px]">--fg-muted</span></span></Td>
                <Td><span className="font-mono text-[11px]">transparent</span></Td>
              </tr>
              <tr>
                <Td mono>hover</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--foreground" size="sm" /><span className="font-mono text-[11px]">--foreground</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--neutral-hover" size="sm" /><span className="font-mono text-[11px]">--neutral-hover</span></span></Td>
              </tr>
              <tr>
                <Td mono>active</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--foreground" size="sm" /><span className="font-mono text-[11px]">--foreground</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--neutral-active" size="sm" /><span className="font-mono text-[11px]">--neutral-active</span></span></Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
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
        <Desc>每個 size 的 token 一覽。Field 與同 size 的 Button 並排時高度一致。density 切換由系統自動處理。</Desc>
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
              { label: 'Icon (endAction)', subFn: (sp: SizeSpec) => `${sp.icon}px` },
              { label: 'Action hover bg', subFn: (sp: SizeSpec) => `${sp.actionHover}px` },
            ] as const).map((row) => (
              <tr key={row.label}>
                <Td>{row.label}</Td>
                {SIZES.map((sz) => {
                  const spec = SIZE_SPECS[sz]
                  const token = 'key' in row && row.key ? spec[row.key] as string : undefined
                  const sub = 'subKey' in row && row.subKey ? spec[row.subKey] as string : 'subFn' in row && row.subFn ? row.subFn(spec) : undefined
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

      {/* Visual preview — all modes × sizes */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽 — 各 Size x Mode</span>
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
                      <div className="w-[180px]">
                        <NumberInput mode={m} size={sz} value={2490} prefix="$" />
                      </div>
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

/* ═══════════════════════════════════════════════════════════════════════════
   5. 狀態行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior = {
  name: '狀態行為',
  render: () => {
    const [focusValue, setFocusValue] = useState<number | null>(2490)
    const [clearValue, setClearValue] = useState<number | null>(1500)

    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <H3>狀態行為</H3>
          <Desc>Focus、error、格式化、endAction 的視覺變化與行為規則。</Desc>
        </div>

        {/* Focus behavior */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">Focus — border-primary，無 ring</span>
          <div className="flex items-center gap-4">
            <div className="w-[200px]">
              <NumberInput value={focusValue} onChange={setFocusValue} prefix="$" placeholder="點擊 focus" />
            </div>
            <span className="text-[11px] text-fg-muted">input outline-none；focus 時由 wrapper focus-within 觸發 border-primary 1px</span>
          </div>
        </div>

        {/* Error behavior */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">Error — 僅 edit 模式，border-error</span>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <div className="w-[200px]">
                <NumberInput value={-100} error prefix="$" />
              </div>
              <span className="text-[11px] text-fg-muted">edit + error: border-error + aria-invalid</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-[200px]">
                <NumberInput mode="readonly" value={-100} error prefix="$" />
              </div>
              <span className="text-[11px] text-fg-muted">readonly + error: error prop 被忽略，無紅框</span>
            </div>
          </div>
        </div>

        {/* endAction — clear example */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">endAction — 右側 inline action</span>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <div className="w-[200px]">
                <NumberInput
                  value={clearValue}
                  onChange={setClearValue}
                  prefix="$"
                  endAction={{ icon: X, label: '清除', onClick: () => setClearValue(null) }}
                />
              </div>
              <span className="text-[11px] text-fg-muted">icon: fg-muted → hover: foreground + neutral-hover bg</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-[200px]">
                <NumberInput mode="readonly" value={1500} prefix="$" />
              </div>
              <span className="text-[11px] text-fg-muted">readonly / disabled 不渲染 endAction</span>
            </div>
          </div>
        </div>

        {/* Formatting behavior */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">格式化行為</span>
          <div className="overflow-x-auto">
            <table className="border-collapse text-caption">
              <thead><tr><Th>情境</Th><Th>edit 模式</Th><Th>readonly / Display</Th></tr></thead>
              <tbody>
                {[
                  ['value = 2490, prefix="$"', '2490（raw 數值）', '$2,490（格式化）'],
                  ['value = 85.5, suffix="%", precision=1', '85.5（raw 數值）', '85.5%（格式化）'],
                  ['value = null', '空白', '— (em dash, fg-muted)'],
                  ['value = 12500, prefix="NT$"', '12500（raw 數值）', 'NT$12,500（格式化）'],
                ].map(([ctx, edit, display]) => (
                  <tr key={ctx}>
                    <Td mono>{ctx}</Td>
                    <Td>{edit}</Td>
                    <Td>{display}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="text-[10px] text-fg-muted">edit 模式不套用 toLocaleString()、prefix、suffix，確保使用者能直覺修改 raw 數值。</span>
        </div>

        {/* Null value display */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">Null 值顯示</span>
          <div className="flex items-center gap-6">
            {(['edit', 'readonly', 'disabled'] as const).map((m) => (
              <div key={m} className="flex flex-col gap-1 items-start">
                <span className="text-[11px] text-fg-muted font-mono">{m}</span>
                <div className="w-[160px]"><NumberInput mode={m} value={null} prefix="$" /></div>
                <span className="text-[10px] text-fg-muted">{m === 'edit' ? '空白 input' : 'em dash — + fg-muted'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Input behavior */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium text-fg-secondary">輸入行為</span>
          <div className="overflow-x-auto">
            <table className="border-collapse text-caption">
              <thead><tr><Th>規則</Th><Th>說明</Th></tr></thead>
              <tbody>
                {[
                  ['type="text" inputMode="decimal"', '用 text 而非 number，避免瀏覽器 spinner 干擾'],
                  ['空字串 / "-" → onChange(null)', '清空或只剩負號時回傳 null'],
                  ['NaN 忽略', '非數字輸入不觸發 onChange'],
                  ['disabled / readOnly 參與 mode 推導', 'mode 未顯式指定時：有效 disabled → "disabled"；readOnly 排在 Field context mode 之後 → "readonly"（顯式 mode prop 永遠最優先，useResolvedFieldMode）'],
                ].map(([rule, desc]) => (
                  <tr key={rule}><Td mono>{rule}</Td><Td>{desc}</Td></tr>
                ))}
              </tbody>
            </table>
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
      <p className="whitespace-pre-line">{"ARIA  :使用原生  <input type=\"text\" inputMode=\"decimal\">  ;外層 Field 自動補上標籤、錯誤狀態與描述的關聯。 inputMode=\"decimal\"  讓行動裝置彈出數字鍵盤。\n\n  鍵盤行為  :\n\n- Tab — 移入欄位\n- 數字鍵 — 輸入數值\n\n  焦點  :原生 input 焦點外框,聚焦時外框轉為主色,由外層 Field 提供。\n\n  驗證  :Storybook 無障礙檢查面板應為 0 項嚴重問題;不靠滑鼠也能完整操作。文字對比度至少 4.5:1、介面元件至少 3:1(WCAG AA)。"}</p>
    </div>
  ),
}

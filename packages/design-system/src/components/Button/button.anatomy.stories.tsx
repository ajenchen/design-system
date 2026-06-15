import type { Meta } from '@storybook/react'
import { useState, useEffect } from 'react'
import { Plus, ChevronDown, Download, Trash2, Settings } from 'lucide-react'
import { Button } from './button'

const meta: Meta = {
  title: 'Design System/Components/Button/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type VariantKey = 'primary' | 'secondary' | 'tertiary' | 'text' | 'link'
type PressedVariantKey = 'secondary' | 'tertiary' | 'text'  // 支援 toggle 的 variant 子集
type StateKey = 'default' | 'hover' | 'active' | 'disabled'
type SizeKey = 'xs' | 'sm' | 'md' | 'lg'
type ColorSpec = { bg: string; text: string; border: string }

const VARIANTS: VariantKey[] = ['primary', 'secondary', 'tertiary', 'text', 'link']
const PRESSED_VARIANTS: PressedVariantKey[] = ['secondary', 'tertiary', 'text']
const DANGER_VARIANTS: VariantKey[] = ['primary', 'secondary', 'text']
const STATES: StateKey[] = ['default', 'hover', 'active', 'disabled']

const TOKEN_MAP: Record<VariantKey, Record<StateKey, ColorSpec>> = {
  primary: {
    default: { bg: '--primary', text: 'white', border: 'transparent' },
    hover: { bg: '--primary-hover', text: 'white', border: 'transparent' },
    active: { bg: '--primary-active', text: 'white', border: 'transparent' },
    disabled: { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent' },
  },
  secondary: {
    default: { bg: '--surface', text: '--primary', border: '--primary' },
    hover: { bg: '--surface', text: '--primary-hover', border: '--primary-hover' },
    active: { bg: '--surface', text: '--primary-active', border: '--primary-active' },
    disabled: { bg: 'transparent', text: '--fg-disabled', border: '--border' },
  },
  tertiary: {
    default: { bg: '--surface', text: '--foreground', border: '--border' },
    hover: { bg: '--surface', text: '--primary-hover', border: '--primary-hover' },
    active: { bg: '--surface', text: '--primary-active', border: '--primary-active' },
    disabled: { bg: 'transparent', text: '--fg-disabled', border: '--border' },
  },
  text: {
    default: { bg: 'transparent', text: '--foreground', border: 'transparent' },
    hover: { bg: '--neutral-hover', text: '--foreground', border: 'transparent' },
    active: { bg: '--neutral-active', text: '--foreground', border: 'transparent' },
    disabled: { bg: 'transparent', text: '--fg-disabled', border: 'transparent' },
  },
  link: {
    default: { bg: 'transparent', text: '--primary', border: 'transparent' },
    hover: { bg: 'transparent', text: '--primary-hover', border: 'transparent' },
    active: { bg: 'transparent', text: '--primary-active', border: 'transparent' },
    disabled: { bg: 'transparent', text: '--fg-disabled', border: 'transparent' },
  },
}

const DANGER_MAP: Partial<Record<VariantKey, Record<StateKey, ColorSpec>>> = {
  primary: {
    default: { bg: '--error', text: 'white', border: 'transparent' },
    hover: { bg: '--error-hover', text: 'white', border: 'transparent' },
    active: { bg: '--error-active', text: 'white', border: 'transparent' },
    disabled: { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent' },
  },
  secondary: {
    default: { bg: '--surface', text: '--error', border: '--error' },
    hover: { bg: '--surface', text: '--error-hover', border: '--error-hover' },
    active: { bg: '--surface', text: '--error-active', border: '--error-active' },
    disabled: { bg: 'transparent', text: '--fg-disabled', border: '--border' },
  },
  text: {
    default: { bg: 'transparent', text: '--error', border: 'transparent' },
    hover: { bg: '--neutral-hover', text: '--error-hover', border: 'transparent' },
    active: { bg: '--neutral-active', text: '--error-active', border: 'transparent' },
    disabled: { bg: 'transparent', text: '--fg-disabled', border: 'transparent' },
  },
}

interface SizeSpec {
  heightToken: string; height: string
  pxToken: string; px: number
  gapToken: string; gap: number
  fontToken: string; font: string
  icon: number
  minWToken: string
}

const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  xs: { heightToken: 'h-field-xs', height: '24px', pxToken: 'px-2', px: 8,  gapToken: 'gap-0', gap: 0, fontToken: 'text-caption',  font: '12px', icon: 16, minWToken: '—' },
  sm: { heightToken: 'h-field-sm', height: '28px', pxToken: 'px-3', px: 12, gapToken: 'gap-1', gap: 4, fontToken: 'text-body',     font: '14px', icon: 16, minWToken: 'min-w-14' },
  md: { heightToken: 'h-field-md', height: '32px', pxToken: 'px-3', px: 12, gapToken: 'gap-1', gap: 4, fontToken: 'text-body',     font: '14px', icon: 16, minWToken: 'min-w-16' },
  lg: { heightToken: 'h-field-lg', height: '36px', pxToken: 'px-3', px: 12, gapToken: 'gap-1', gap: 4, fontToken: 'text-body-lg',  font: '16px', icon: 20, minWToken: 'min-w-20' },
}

const VARIANT_DESC: Record<VariantKey, string> = {
  primary: '最重要的單一主要動作，每個操作區最多一個',
  secondary: '正面與負面選項並存時，代表正面那個',
  tertiary: '最常用——取消、關閉、一般輔助操作',
  text: '低視覺權重，不需強調的輔助動作',
  link: '外觀像連結的按鈕，不用於操作列',
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared UI Components

   NOTE: This file keeps local H3 / Desc / Th / Td / Swatch because its visual
   style diverges from the 通用設計準則 in `@/design-system/stories-helpers/anatomy/anatomy-utils`:
   - H3 uses `text-h6 font-semibold` (shared: `text-body font-bold mb-2`)
   - Desc has no bottom margin / `leading-relaxed` (shared adds both)
   - Th/Td use `p-2 border-b border-divider` row style (shared: boxed cells)
   - Swatch defaults to `size="md"` and is consumed without explicit size in
     `TokenValue` below — changing default to `sm` would shrink inspector swatches
   Group A anatomy files (Slider-style) use the shared helpers.
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
  return <span className={`${s} rounded-md shrink-0 border border-black/10`} style={{ backgroundColor: value === 'white' ? '#fff' : `var(${value})` }} />
}

const TokenAnnotation = ({ colors }: { colors: ColorSpec }) => (
  <div className="flex flex-col gap-0.5 mt-2">
    {([['bg', 'bg'], ['text', 'text'], ['border', 'bdr']] as const).map(([key, label]) => (
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
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）</H3>
          <Desc>四個可選 slot。icon-only 模式只保留 startIcon，變正方形並自動 tooltip。</Desc>
        </div>
        <div className="flex gap-8">
          {/* Standard layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">標準</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[{ name: 'startIcon', color: 'info' }, { name: 'label', color: 'success' }, { name: 'badge', color: 'warning' }, { name: 'endIcon', color: 'magenta' }].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
          </div>
          {/* Icon-only layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">iconOnly</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5">
              <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                style={{ borderColor: 'var(--info)', backgroundColor: 'var(--info-subtle)', color: 'var(--info)' }}>startIcon</span>
            </div>
            <span className="text-[10px] text-fg-muted font-mono">p-0 + aspect-square · 自然正方形 · 自動 tooltip</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <H3>Variant 一覽</H3>
        <div className="flex flex-col gap-2">
          {VARIANTS.map((v) => (
            <div key={v} className="flex items-center gap-4">
              <div className="w-28 shrink-0"><Button variant={v} size="sm" startIcon={Plus}>{v}</Button></div>
              <span className="text-caption text-fg-secondary">{VARIANT_DESC[v]}</span>
            </div>
          ))}
          <div className="border-t border-divider pt-2 mt-1 flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted font-medium">+ danger prop</span>
            {DANGER_VARIANTS.map((v) => (
              <div key={v} className="flex items-center gap-4">
                <div className="w-28 shrink-0"><Button variant={v} danger size="sm" startIcon={Trash2}>{v}</Button></div>
                <span className="text-caption text-fg-secondary">
                  {v === 'primary' ? '立即不可逆——點下去就執行' : v === 'secondary' ? '有警示意圖，後面還有確認' : '低強調的危險操作'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <H3>Props</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['variant', "'primary'|'secondary'|'tertiary'|'text'|'link'", "'tertiary'（iconOnly 時 'text'）", '視覺強調等級；CTA 必 explicit primary'],
                ['danger', 'boolean', 'false', '套用紅色，與 variant 正交'],
                ['pressed', 'boolean', '—', 'Toggle 按下狀態（aria-pressed + data-state），僅 secondary/tertiary/text 有視覺效果'],
                ['pressedTone', "'emphasis'|'neutral'", "'emphasis'", 'pressed 視覺色調:emphasis 藍底 / neutral 灰底,context 決定'],
                ['size', "'xs'|'sm'|'md'|'lg'", "'md'", 'xs=icon-only toolbar utility（24px 固定）; sm/md/lg 配對 Field'],
                ['startIcon', 'LucideIcon', '—', '左側 icon，loading 時替換為 spinner'],
                ['endIcon', 'LucideIcon', '—', '右側 icon（方向指示，如 ChevronDown）'],
                ['badge', 'ReactNode', '—', '右側 badge（通知計數）'],
                ['overlayBadge', 'ReactNode', '—', '角標疊於 icon 右上（僅 iconOnly=true；對齊 Material BadgedBox）'],
                ['iconOnly', 'boolean', 'false', '正方形模式，需搭配 aria-label'],
                ['loading', 'boolean', 'false', 'CircularProgress(indeterminate)+ 自動 disabled + aria-busy'],
                ['fullWidth', 'boolean', 'false', '撐滿父容器'],
                ['dismiss', 'boolean', 'false', 'X close 視覺弱化（強制 variant=text + iconOnly=true）'],
                ['asChild', 'boolean', 'false', '透過 Radix Slot 套用至子元件'],
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
   2. 元件檢閱器 — Interactive Inspector (replaces Figma inspect)
   ═══════════════════════════════════════════════════════════════════════════ */

const Z = {
  pad:   { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  icon:  { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  gap:   { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  label: { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  dim:   { text: '#d04040' },
}

const BpZone = ({ w, color, label, sub }: { w: number; color: typeof Z.pad; label: string; sub?: string }) => (
  <div className="flex flex-col items-center justify-center shrink-0 gap-0.5"
    style={{ width: w, height: '100%', background: color.bg, borderLeft: `1.5px dashed ${color.border}`, borderRight: `1.5px dashed ${color.border}` }}>
    <span className="text-[11px] font-mono font-bold leading-none" style={{ color: color.text }}>{label}</span>
    {sub && <span className="text-[9px] font-mono leading-none opacity-70" style={{ color: color.text }}>{sub}</span>}
  </div>
)

const InspectorInner = () => {
  const [variant, setVariant] = useState<VariantKey>('primary')
  const [danger, setDanger] = useState(false)
  const [state, setState] = useState<StateKey>('default')
  const [size, setSize] = useState<SizeKey>('md')
  const [iconOnly, setIconOnly] = useState(false)

  const canDanger = DANGER_VARIANTS.includes(variant)
  useEffect(() => { if (!canDanger) setDanger(false) }, [canDanger])
  const hasDanger = danger && canDanger
  const colors = hasDanger ? DANGER_MAP[variant]![state] : TOKEN_MAP[variant][state]
  const s = SIZE_SPECS[size]

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Variant</span>
          <div className="flex flex-wrap gap-1.5">
            {VARIANTS.map((v) => <Tab key={v} active={variant === v} onClick={() => setVariant(v)}>{v}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Danger</span>
          <div className="flex gap-1.5">
            <Tab active={!danger} onClick={() => setDanger(false)}>off</Tab>
            <Tab active={danger} onClick={() => setDanger(true)} disabled={!canDanger}>on</Tab>
          </div>
          {!canDanger && <span className="text-[11px] text-fg-muted">此 variant 不支援</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">State</span>
          <div className="flex gap-1.5">
            {STATES.map((st) => <Tab key={st} active={state === st} onClick={() => setState(st)}>{st}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Size</span>
          <div className="flex gap-1.5">
            {(['xs', 'sm', 'md', 'lg'] as const).map((sz) => <Tab key={sz} active={size === sz} onClick={() => setSize(sz)}>{sz}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">iconOnly</span>
          <div className="flex gap-1.5">
            <Tab active={!iconOnly} onClick={() => setIconOnly(false)}>off</Tab>
            <Tab active={iconOnly} onClick={() => setIconOnly(true)}>on</Tab>
          </div>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[340px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            {iconOnly
              ? <Button variant={variant} danger={hasDanger} size={size} iconOnly
                  startIcon={hasDanger ? Trash2 : Plus} disabled={state === 'disabled'} aria-label={hasDanger ? '刪除任務' : '新增任務'} />
              : <Button variant={variant} danger={hasDanger} size={size}
                  startIcon={hasDanger ? Trash2 : Plus} disabled={state === 'disabled'}>{hasDanger ? '刪除任務' : '新增任務'}</Button>
            }
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            {!iconOnly ? (
              <>
                <div className="flex items-center gap-4 text-[10px]">
                  {[{ c: Z.pad, l: '左右內距' }, { c: Z.icon, l: 'Icon' }, { c: Z.gap, l: '元素間距' }, { c: Z.label, l: 'Label' }].map(({ c, l }) => (
                    <span key={l} className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                      <span className="font-medium" style={{ color: c.text }}>{l}</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center">
                  <div className="flex items-center rounded-md overflow-hidden" style={{ height: 52, outline: `2px solid ${Z.dim.text}22` }}>
                    <BpZone w={44} color={Z.pad} label={s.pxToken} sub={`${s.px}px`} />
                    <BpZone w={44} color={Z.icon} label={`${s.icon}px`} sub="icon" />
                    {s.gap > 0 && <BpZone w={32} color={Z.gap} label={s.gapToken} sub={`${s.gap}px`} />}
                    <BpZone w={24} color={Z.label} label="px-1" sub="4px" />
                    <BpZone w={56} color={Z.label} label="Label" sub={s.fontToken} />
                    <BpZone w={24} color={Z.label} label="px-1" sub="4px" />
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
              </>
            ) : (
              /* iconOnly blueprint */
              <div className="flex items-center">
                <div className="flex items-center justify-center rounded-md overflow-hidden"
                  style={{ width: 52, height: 52, background: Z.icon.bg, border: `2px solid ${Z.dim.text}22`, borderLeft: `1.5px dashed ${Z.icon.border}`, borderRight: `1.5px dashed ${Z.icon.border}` }}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[11px] font-mono font-bold" style={{ color: Z.icon.text }}>{s.icon}px</span>
                    <span className="text-[9px] font-mono opacity-70" style={{ color: Z.icon.text }}>icon</span>
                  </div>
                </div>
                <div className="ml-3 flex flex-col gap-0.5">
                  <TkVal token={s.heightToken} value={s.height} />
                  <span className="font-mono text-[10px] text-fg-muted">p-0 + aspect-square · min-w-0</span>
                </div>
              </div>
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
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="高度" dot={Z.dim.text}><TkVal token={s.heightToken} value={s.height} /></PropRow>
            {iconOnly ? (
              <>
                <PropRow label="內距">p-0(padding-free)</PropRow>
                <PropRow label="形狀">正方形(aspect-square + p-0 + flex-center)</PropRow>
                <PropRow label="Min Width">min-w-0</PropRow>
              </>
            ) : (
              <>
                <PropRow label="左右內距" dot={Z.pad.text}><TkVal token={s.pxToken} value={`${s.px}px`} /></PropRow>
                <PropRow label="元素間距" dot={Z.gap.text}><TkVal token={s.gapToken} value={`${s.gap}px`} /></PropRow>
                <PropRow label="Label 內距" dot={Z.label.text}><TkVal token="px-1" value="4px" /></PropRow>
                {s.minWToken !== '—' && <PropRow label="Min Width">{s.minWToken}</PropRow>}
              </>
            )}
            <PropRow label="Icon 尺寸" dot={Z.icon.text}>{s.icon}px</PropRow>
          </div>

          {/* TYPOGRAPHY */}
          {!iconOnly && (
            <div className="px-4 py-1">
              <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Typography</span></div>
              <PropRow label="Font"><TkVal token={s.fontToken} value={s.font} /></PropRow>
              <PropRow label="Line-h"><TkVal token="leading-compact" value="1.3" /></PropRow>
              <PropRow label="Weight"><TkVal token="font-medium" value="500" /></PropRow>
            </div>
          )}

          {/* STYLE */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span></div>
            <PropRow label="Radius"><TkVal token="rounded-md" value="4px" /></PropRow>
            <PropRow label="Border"><TkVal token="border" value="1px solid" /></PropRow>
            <PropRow label="Focus"><TkVal token="ring-2 ring-ring ring-offset-1" /></PropRow>
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
   3. 色彩對照表 — Variant × State Token Matrix
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Variant × State 色彩對照</H3>
        <Desc>橫向看同 variant 的 state 變化，縱向比較不同 variant 的設計邏輯。色塊即時渲染，切 dark mode 自動更新。</Desc>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead><tr><Th>Variant</Th>{STATES.map((st) => <Th key={st}>{st}</Th>)}</tr></thead>
          <tbody>
            {VARIANTS.map((v) => (
              <tr key={v}>
                <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top">{v}</td>
                {STATES.map((st) => (
                  <td key={st} className="p-3 border-b border-divider align-top min-w-[160px]">
                    <Button variant={v} size="sm" startIcon={Plus} disabled={st === 'disabled'}>{v}</Button>
                    <TokenAnnotation colors={TOKEN_MAP[v][st]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-fg-secondary">danger = true</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>Variant</Th>{STATES.map((st) => <Th key={st}>{st}</Th>)}</tr></thead>
            <tbody>
              {DANGER_VARIANTS.map((v) => (
                <tr key={v}>
                  <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top">{v} + danger</td>
                  {STATES.map((st) => (
                    <td key={st} className="p-3 border-b border-divider align-top min-w-[160px]">
                      <Button variant={v} danger size="sm" startIcon={Trash2} disabled={st === 'disabled'}>{v}</Button>
                      <TokenAnnotation colors={DANGER_MAP[v]![st]} />
                    </td>
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
   4. 尺寸對照表 — Size Token Comparison + Visual Matrix
   ═══════════════════════════════════════════════════════════════════════════ */

const SIZES: SizeKey[] = ['xs', 'sm', 'md', 'lg']

export const SizeMatrix = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Size Token 對照</H3>
        <Desc>每個 size 對應的 token 一覽。開發只需設 token，density 切換由系統自動處理。</Desc>
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
              { label: '高度', key: 'heightToken', sub: 'height', subFn: undefined as ((s: SizeSpec) => string) | undefined },
              { label: '左右內距', key: 'pxToken', sub: undefined, subFn: (s: SizeSpec) => `${s.px}px` },
              { label: '元素間距', key: 'gapToken', sub: undefined, subFn: (s: SizeSpec) => `${s.gap}px` },
              { label: '字體', key: 'fontToken', sub: undefined, subFn: (s: SizeSpec) => s.font },
              { label: 'Icon', key: undefined as string | undefined, sub: undefined, subFn: (s: SizeSpec) => `${s.icon}px` },
              { label: 'Min Width', key: 'minWToken', sub: undefined, subFn: undefined as ((s: SizeSpec) => string) | undefined },
            ] as const).map((row) => (
              <tr key={row.label}>
                <Td>{row.label}</Td>
                {SIZES.map((sz) => {
                  const spec = SIZE_SPECS[sz]
                  const token = row.key ? spec[row.key as keyof SizeSpec] as string : undefined
                  const sub = row.sub ? spec[row.sub as keyof SizeSpec] as string : row.subFn?.(spec)
                  return (
                    <Td key={sz} mono>
                      {token && <div className="text-fg-secondary">{token}</div>}
                      {sub && <div className="text-fg-muted text-[10px]">{sub}</div>}
                    </Td>
                  )
                })}
              </tr>
            ))}
            {/* iconOnly overrides */}
            <tr>
              <Td>iconOnly 覆寫</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">p-0 + aspect-square</div>
                  <div className="text-fg-muted text-[10px]">自然正方形 · min-w-0</div>
                </Td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Visual preview */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr>
              <Th>Variant</Th>
              {SIZES.map((sz) => <Th key={sz}>{sz}</Th>)}
              {SIZES.map((sz) => <Th key={`io-${sz}`}>{sz} iconOnly</Th>)}
            </tr></thead>
            <tbody>
              {VARIANTS.map((v) => (
                <tr key={v}>
                  <Td mono>{v}</Td>
                  {SIZES.map((sz) => (
                    <Td key={sz}><Button variant={v} size={sz} startIcon={Plus}>{v}</Button></Td>
                  ))}
                  {SIZES.map((sz) => (
                    <Td key={`io-${sz}`}><Button variant={v} size={sz} iconOnly startIcon={Plus} aria-label={v} /></Td>
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
   5. 狀態行為 — Loading / Disabled / Checked
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>狀態行為</H3>
        <Desc>Loading、disabled、pressed toggle 的視覺變化與行為規則。</Desc>
      </div>

      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">Loading — CircularProgress 替換規則</span>
        {[
          { label: '有 startIcon', before: <Button variant="primary" startIcon={Download}>匯出</Button>, after: <Button variant="primary" startIcon={Download} loading>匯出</Button>, desc: 'startIcon → CircularProgress(同位置)' },
          { label: '無 startIcon', before: <Button variant="primary">儲存</Button>, after: <Button variant="primary" loading>儲存</Button>, desc: 'CircularProgress 加在文字左側' },
          { label: 'iconOnly', before: <Button iconOnly startIcon={Download} aria-label="下載" />, after: <Button iconOnly startIcon={Download} loading aria-label="下載" />, desc: 'CircularProgress 替換 icon' },
          { label: '有 endIcon', before: <Button variant="primary" startIcon={Download} endIcon={ChevronDown}>匯出</Button>, after: <Button variant="primary" startIcon={Download} loading endIcon={ChevronDown}>匯出</Button>, desc: 'endIcon 維持顯示' },
        ].map(({ label, before, after, desc }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-[11px] text-fg-muted w-20 shrink-0">{label}</span>
            {before}<span className="text-fg-muted text-caption">→</span>{after}
            <span className="text-[11px] text-fg-muted">{desc}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Disabled — 品牌色移除，統一 neutral（含 danger）</span>
        <div className="flex flex-wrap gap-3">
          {VARIANTS.map((v) => (
            <div key={v} className="flex flex-col items-center gap-1">
              <Button variant={v} disabled startIcon={Plus}>{v}</Button>
              <span className="text-[10px] text-fg-muted">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {VARIANTS.map((v) => (
            <div key={v} className="flex flex-col items-center gap-1">
              <Button variant={v} disabled iconOnly startIcon={Plus} aria-label={v} />
              <span className="text-[10px] text-fg-muted">{v} iconOnly</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Pressed prop — binary toggle（on / off）</span>
        <p className="text-[11px] text-fg-muted">設定 pressed 時 Button 自動寫 aria-pressed + data-state，樣式由 variant 的 data-[state=on] 分支套用。僅 secondary/tertiary/text 有視覺效果。</p>
        <div className="flex flex-col gap-2">
          {PRESSED_VARIANTS.map((v) => (
            <div key={v} className="flex items-center gap-3">
              <span className="text-[11px] text-fg-muted w-20 font-mono">{v}</span>
              <Button variant={v} iconOnly startIcon={Settings} aria-label={`${v}（關）`} />
              <span className="text-fg-muted">⇄</span>
              <Button variant={v} pressed iconOnly startIcon={Settings} aria-label={`${v}（開）`} />
              <span className="text-[11px] text-fg-muted">
                {`${v} + pressed → primary-subtle 系列（預設 pressedTone="emphasis"；傳 pressedTone="neutral" 則為 neutral-selected 灰底）`}
              </span>
            </div>
          ))}
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
      <p className="whitespace-pre-line">{"無障礙設計摘要:\n\n  語意與鍵盤  :預設渲染原生 button 元素,自動帶有按鈕角色、Enter / 空白鍵觸發、Tab 聚焦等瀏覽器原生無障礙行為,無需額外設定。icon-only 按鈕請傳 aria-label 描述用途。\n\n  焦點外框  :鍵盤聚焦時(focus-visible)顯示一圈外框,讓鍵盤使用者看得到目前焦點落在哪顆按鈕;滑鼠點擊不會觸發這圈外框,避免視覺雜訊。\n\n  停用狀態  :disabled 時品牌 / 狀態色完全移除、統一回到 neutral 停用色,原生 disabled 屬性讓輔助技術讀出「已停用」;loading 中額外帶 aria-busy 告知處理中。\n\n  驗證  :Storybook a11y 面板應 0 項嚴重違規;全程鍵盤可操作(無需滑鼠);文字對比 ≥ 4.5:1、介面元素對比 ≥ 3:1(WCAG AA)。"}</p>
    </div>
  ),
}

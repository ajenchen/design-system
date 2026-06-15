import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { Checkbox } from './checkbox'
import { SelectionItem } from '@/design-system/components/SelectionControl/selection-item'

const meta: Meta = {
  title: 'Design System/Components/Checkbox/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type CheckedState = 'unchecked' | 'checked' | 'indeterminate'
type InteractionState = 'default' | 'hover' | 'disabled'
type SizeKey = 'sm' | 'md' | 'lg'
type ColorSpec = { bg: string; border: string; indicator: string }

const SIZES: SizeKey[] = ['sm', 'md', 'lg']
const CHECKED_STATES: CheckedState[] = ['unchecked', 'checked', 'indeterminate']
const INTERACTION_STATES: InteractionState[] = ['default', 'hover', 'disabled']

const TOKEN_MAP: Record<CheckedState, Record<InteractionState, ColorSpec>> = {
  unchecked: {
    default:  { bg: '--surface',     border: '--border',       indicator: 'none' },
    hover:    { bg: '--surface',     border: '--border-hover',  indicator: 'none' },
    disabled: { bg: '--bg-disabled', border: 'transparent',    indicator: 'none' },
  },
  checked: {
    default:  { bg: '--primary',       border: '--primary',       indicator: '--on-emphasis' },
    hover:    { bg: '--primary-hover',  border: '--primary-hover', indicator: '--on-emphasis' },
    disabled: { bg: '--bg-disabled',   border: 'transparent',    indicator: '--fg-disabled' },
  },
  indeterminate: {
    default:  { bg: '--primary',       border: '--primary',       indicator: '--on-emphasis' },
    hover:    { bg: '--primary-hover',  border: '--primary-hover', indicator: '--on-emphasis' },
    disabled: { bg: '--bg-disabled',   border: 'transparent',    indicator: '--fg-disabled' },
  },
}

interface SizeSpec {
  controlSize: string
  controlPx: number
  iconPx: number
  label: string
}

const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  sm: { controlSize: 'h-4 w-4', controlPx: 16, iconPx: 12, label: 'sm = md（16px 控件）' },
  md: { controlSize: 'h-4 w-4', controlPx: 16, iconPx: 12, label: 'md（16px 控件，預設）' },
  lg: { controlSize: 'h-5 w-5', controlPx: 20, iconPx: 16, label: 'lg（20px 控件）' },
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
  if (value === 'transparent' || value === 'none') {
    return <span className={`${s} rounded-md shrink-0 border border-border`}
      style={{ backgroundImage: 'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0,3px 3px' }} />
  }
  return <span className={`${s} rounded-md shrink-0 border border-black/10`} style={{ backgroundColor: value === 'white' ? '#fff' : `var(${value})` }} />
}

const TokenAnnotation = ({ colors }: { colors: ColorSpec }) => (
  <div className="flex flex-col gap-0.5 mt-2">
    {([['bg', 'bg'], ['border', 'bdr'], ['indicator', 'icon']] as const).map(([key, label]) => (
      <span key={key} className="inline-flex items-center gap-1 text-[10px]">
        <Swatch value={colors[key]} size="sm" />
        <span className="text-fg-muted w-5 shrink-0">{label}</span>
        <span className="font-mono text-fg-secondary">{colors[key]}</span>
      </span>
    ))}
  </div>
)

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
   Blueprint Components
   ═══════════════════════════════════════════════════════════════════════════ */

const Z = {
  control: { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  icon:    { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  gap:     { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  label:   { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  dim:     { text: '#d04040' },
}

const BpZone = ({ w, h, color, label, sub }: { w: number; h?: number; color: typeof Z.control; label: string; sub?: string }) => (
  <div className="flex flex-col items-center justify-center shrink-0 gap-0.5"
    style={{ width: w, height: h ?? '100%', background: color.bg, borderLeft: `1.5px dashed ${color.border}`, borderRight: `1.5px dashed ${color.border}` }}>
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
          <Desc>Checkbox 由兩層組成：indicator（方框 + check icon）和 label（透過 SelectionItem 組合）。Checkbox 本身不內建 label。</Desc>
        </div>
        <div className="flex gap-8">
          {/* Standalone checkbox */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">單獨使用</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md p-3 gap-2">
              <div className="flex flex-col items-center gap-1">
                <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: 'var(--info)', backgroundColor: 'var(--info-subtle)', color: 'var(--info)' }}>indicator</span>
                <span className="text-[9px] text-fg-muted font-mono">border + bg + check icon</span>
              </div>
            </div>
          </div>
          {/* With SelectionItem */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">搭配 SelectionItem</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md p-3 gap-2">
              {[{ name: 'control （Checkbox）', color: 'info' }, { name: 'control （Checkbox）', color: 'success' }].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">SelectionItem 處理 label 對齊與 padding</span>
          </div>
        </div>
      </div>

      {/* Size catalog */}
      <div className="flex flex-col gap-3">
        <H3>尺寸一覽</H3>
        <Desc>三種尺寸（sm/md = 16px，lg = 20px）。sm 和 md 視覺相同，純粹是命名 mapping 讓消費者直接傳同一個 size prop。</Desc>
        <div className="flex flex-col gap-3">
          {SIZES.map((sz) => (
            <div key={sz} className="flex items-center gap-4">
              <div className="w-12 shrink-0 flex justify-center">
                <Checkbox size={sz} defaultChecked />
              </div>
              <span className="text-caption text-fg-secondary">{SIZE_SPECS[sz].label}</span>
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
                ['size', "'sm'|'md'|'lg'", "'md'", '控件尺寸（sm = md = 16px，lg = 20px）'],
                ['checked', "boolean | 'indeterminate'", '—', '受控模式的選取狀態(Radix CheckedState,含 indeterminate)'],
                ['defaultChecked', 'boolean', 'false', '非受控模式的初始選取狀態'],
                ['onCheckedChange', "(checked: boolean | 'indeterminate') => void", '—', '選取狀態變更 callback'],
                ['disabled', 'boolean', 'false', '禁止互動'],
                ['required', 'boolean', 'false', '必填標記'],
                ['name', 'string', '—', '表單欄位名稱'],
                ['value', 'string', '—', '表單值'],
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
  const [checkedState, setCheckedState] = useState<CheckedState>('unchecked')
  const [interaction, setInteraction] = useState<InteractionState>('default')
  const [size, setSize] = useState<SizeKey>('md')
  const [withLabel, setWithLabel] = useState(false)
  const [withDescription, setWithDescription] = useState(false)

  const colors = TOKEN_MAP[checkedState][interaction]
  const spec = SIZE_SPECS[size]

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Checked</span>
          <div className="flex gap-1.5">
            {CHECKED_STATES.map((cs) => <Tab key={cs} active={checkedState === cs} onClick={() => setCheckedState(cs)}>{cs}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">State</span>
          <div className="flex gap-1.5">
            {INTERACTION_STATES.map((st) => <Tab key={st} active={interaction === st} onClick={() => setInteraction(st)}>{st}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Size</span>
          <div className="flex gap-1.5">
            {SIZES.map((sz) => <Tab key={sz} active={size === sz} onClick={() => setSize(sz)}>{sz}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Label</span>
          <div className="flex gap-1.5">
            <Tab active={!withLabel} onClick={() => setWithLabel(false)}>off</Tab>
            <Tab active={withLabel} onClick={() => setWithLabel(true)}>on</Tab>
          </div>
          <span className="text-[11px] text-fg-muted">搭配 SelectionItem</span>
        </div>
        {withLabel && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-fg-muted w-16 shrink-0">Description</span>
            <div className="flex gap-1.5">
              <Tab active={!withDescription} onClick={() => setWithDescription(false)}>off</Tab>
              <Tab active={withDescription} onClick={() => setWithDescription(true)}>on</Tab>
            </div>
            <span className="text-[11px] text-fg-muted">label 下方的次要說明</span>
          </div>
        )}
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[340px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            {withLabel ? (
              <SelectionItem
                size={size}
                control={
                  <Checkbox
                    id="inspector-cb"
                    size={size}
                    checked={checkedState === 'checked' ? true : checkedState === 'indeterminate' ? 'indeterminate' : false}
                    disabled={interaction === 'disabled'}
                  />
                }
                label="Label text"
                description={withDescription ? '次要說明文字,給使用者更多 context' : undefined}
                htmlFor="inspector-cb"
                disabled={interaction === 'disabled'}
              />
            ) : (
              <Checkbox
                size={size}
                checked={checkedState === 'checked' ? true : checkedState === 'indeterminate' ? 'indeterminate' : false}
                disabled={interaction === 'disabled'}
              />
            )}
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              {[{ c: Z.control, l: '控件' }, { c: Z.icon, l: 'Check Icon' }, ...(withLabel ? [{ c: Z.gap, l: 'Gap' }, { c: Z.label, l: 'Label' }] : [])].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center">
              <div className="flex items-center rounded-md overflow-hidden" style={{ height: 48, outline: `2px solid ${Z.dim.text}22` }}>
                <BpZone w={spec.controlPx * 2.5} color={Z.control} label={spec.controlSize.split(' ')[0]} sub={`${spec.controlPx}px`} />
                <BpZone w={40} color={Z.icon} label={`${spec.iconPx}px`} sub="check icon" />
                {withLabel && (
                  <>
                    <BpZone w={28} color={Z.gap} label="gap-2" sub="8px" />
                    <BpZone w={64} color={Z.label} label="Label" sub={size === 'lg' ? 'text-body-lg' : 'text-body'} />
                  </>
                )}
              </div>
              <div className="ml-3 flex items-center" style={{ height: 48 }}>
                <svg width="10" height="48" className="shrink-0">
                  <line x1="5" y1="2" x2="5" y2="46" stroke={Z.dim.text} strokeWidth="1" />
                  <line x1="1" y1="2" x2="9" y2="2" stroke={Z.dim.text} strokeWidth="1.5" />
                  <line x1="1" y1="46" x2="9" y2="46" stroke={Z.dim.text} strokeWidth="1.5" />
                </svg>
                <div className="ml-1.5"><TkVal token={`${spec.controlPx}px`} value={size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} /></div>
              </div>
            </div>
            <p className="text-[10px] text-fg-muted">控件為正方形，寬高相同</p>
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
            <PropRow label="Border"><TokenValue value={colors.border} /></PropRow>
            <PropRow label="Indicator">{colors.indicator === 'none' ? <span className="text-fg-muted">none</span> : <TokenValue value={colors.indicator} />}</PropRow>
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="控件尺寸" dot={Z.control.text}><TkVal token={spec.controlSize} value={`${spec.controlPx}px`} /></PropRow>
            <PropRow label="Icon 尺寸" dot={Z.icon.text}>{spec.iconPx}px</PropRow>
            {withLabel && (
              <>
                <PropRow label="控件—文字間距" dot={Z.gap.text}><TkVal token="gap-2" value="8px" /></PropRow>
                <PropRow label="字體" dot={Z.label.text}><TkVal token={size === 'lg' ? 'text-body-lg' : 'text-body'} value={size === 'lg' ? '16px' : '14px'} /></PropRow>
              </>
            )}
          </div>

          {/* STYLE */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span></div>
            <PropRow label="Radius"><TkVal token="rounded-md" value="4px" /></PropRow>
            <PropRow label="Border"><TkVal token="border" value="1px solid" /></PropRow>
            <PropRow label="Focus"><TkVal token="ring-2 ring-ring ring-offset-1" /></PropRow>
            <PropRow label="Transition"><TkVal token="duration-150" value="colors" /></PropRow>
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
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Checked State x Interaction State 色彩對照</H3>
        <Desc>橫向看同一選取狀態的互動變化，縱向比較 unchecked / checked 的設計邏輯。色塊即時渲染，切 dark mode 自動更新。</Desc>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead><tr><Th>State</Th>{INTERACTION_STATES.map((st) => <Th key={st}>{st}</Th>)}</tr></thead>
          <tbody>
            {CHECKED_STATES.map((cs) => (
              <tr key={cs}>
                <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top">{cs}</td>
                {INTERACTION_STATES.map((st) => (
                  <td key={st} className="p-3 border-b border-divider align-top min-w-[160px]">
                    <Checkbox
                      size="md"
                      checked={cs === 'checked' ? true : cs === 'indeterminate' ? 'indeterminate' : false}
                      disabled={st === 'disabled'}
                    />
                    <TokenAnnotation colors={TOKEN_MAP[cs][st]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
        <Desc>每個 size 對應的 token 一覽。sm 和 md 視覺完全相同（16px），純粹是命名 mapping。</Desc>
      </div>

      {/* Token comparison table */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead><tr>
            <Th>屬性</Th>
            {SIZES.map((sz) => <Th key={sz}>{sz}{sz === 'md' ? '（預設）' : ''}</Th>)}
          </tr></thead>
          <tbody>
            {[
              { label: '控件尺寸', key: 'controlSize' as const, sub: (s: SizeSpec) => `${s.controlPx}px` },
              { label: 'Check Icon', key: undefined, sub: (s: SizeSpec) => `${s.iconPx}px` },
            ].map((row) => (
              <tr key={row.label}>
                <Td>{row.label}</Td>
                {SIZES.map((sz) => {
                  const s = SIZE_SPECS[sz]
                  return (
                    <Td key={sz} mono>
                      {row.key && <div className="text-fg-secondary">{s[row.key]}</div>}
                      <div className="text-fg-muted text-[10px]">{row.sub(s)}</div>
                    </Td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Visual preview: unchecked + checked per size */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr>
              <Th>Size</Th>
              <Th>Unchecked</Th>
              <Th>Checked</Th>
              <Th>搭配 SelectionItem</Th>
            </tr></thead>
            <tbody>
              {SIZES.map((sz) => (
                <tr key={sz}>
                  <Td mono>{sz}</Td>
                  <Td><Checkbox size={sz} /></Td>
                  <Td><Checkbox size={sz} defaultChecked /></Td>
                  <Td>
                    <SelectionItem
                      size={sz}
                      control={<Checkbox id={`sz-${sz}`} size={sz} defaultChecked />}
                      label="Label text"
                      htmlFor={`sz-${sz}`}
                    />
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
   5. 狀態行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>狀態行為</H3>
        <Desc>Disabled、group 佈局、label 對齊的視覺變化與行為規則。</Desc>
      </div>

      {/* Disabled */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Disabled — 品牌色移除，統一 neutral</span>
        <div className="flex flex-wrap gap-6">
          {[
            { label: 'unchecked', checked: false },
            { label: 'checked', checked: true },
          ].map(({ label, checked }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <Checkbox disabled checked={checked} />
                  <span className="text-[10px] text-fg-muted">disabled</span>
                </div>
                <span className="text-fg-muted text-caption">vs</span>
                <div className="flex flex-col items-center gap-1">
                  <Checkbox checked={checked} />
                  <span className="text-[10px] text-fg-muted">enabled</span>
                </div>
              </div>
              <span className="text-[11px] text-fg-muted">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Vertical Group */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">垂直排列 — Item 間距由 padding 處理，不加 gap</span>
        <Desc>每個 SelectionItem 的 py = (field-height − 一行文字高度) / 2，單行高度剛好等於同 size 的 Input，多行時 padding 不變自然撐高。</Desc>
        <div className="flex gap-8">
          {(['md', 'lg'] as const).map((sz) => (
            <div key={sz} className="flex flex-col gap-1">
              <span className="text-[11px] text-fg-muted font-medium">size="{sz}"</span>
              <div className="grid border border-dashed border-divider rounded-md p-2">
                <SelectionItem size={sz} control={<Checkbox id={`vg-${sz}-a`} size={sz} />} label="Email 通知" htmlFor={`vg-${sz}-a`} />
                <SelectionItem size={sz} control={<Checkbox id={`vg-${sz}-b`} size={sz} />} label="SMS 通知" description="每則訊息可能有費用" htmlFor={`vg-${sz}-b`} />
                <SelectionItem size={sz} control={<Checkbox id={`vg-${sz}-c`} size={sz} />} label="Push 通知" htmlFor={`vg-${sz}-c`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Horizontal Group */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">水平排列 — Item 之間 gap-4（16px）</span>
        <div className="flex gap-4 border border-dashed border-divider rounded-md p-2">
          <SelectionItem control={<Checkbox id="hg-a" />} label="Email" htmlFor="hg-a" />
          <SelectionItem control={<Checkbox id="hg-b" />} label="SMS" htmlFor="hg-b" />
          <SelectionItem control={<Checkbox id="hg-c" />} label="Push" htmlFor="hg-c" />
        </div>
      </div>

      {/* Multiline alignment */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">多行對齊 — 控件對齊第一行文字中心</span>
        <Desc>控件包在一行文字高度的容器內，外層 flex items-start 確保多行時控件對齊第一行。字體改變時高度自動重算。</Desc>
        <div className="max-w-sm grid border border-dashed border-divider rounded-md">
          <SelectionItem
            control={<Checkbox id="ml-a" />}
            label="短標籤"
            htmlFor="ml-a"
          />
          <SelectionItem
            control={<Checkbox id="ml-b" />}
            label="這是一個比較長的標籤文字，會自動換行到第二行，控件始終對齊第一行的垂直中心"
            htmlFor="ml-b"
          />
          <SelectionItem
            control={<Checkbox id="ml-c" />}
            label="附帶說明"
            description="說明文字用 fg-secondary 色彩，排在 label 下方"
            htmlFor="ml-c"
          />
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
      <p className="whitespace-pre-line">{"角色與鍵盤:Checkbox 本身就是一個 checkbox 角色的可勾選控件,螢幕報讀器會唸出「核取方塊 / 已勾選 / 未勾選」。鍵盤上用 Tab 移動焦點、用空白鍵切換勾選狀態。\n\n焦點:用鍵盤移到 Checkbox 上時,會出現一圈藍色焦點外框(focus ring)讓使用者知道焦點在這裡。Checkbox 是單一控件,不像對話框那種會把焦點關在裡面;焦點外框只是視覺提示。\n\n驗證:Storybook 的 a11y 檢查面板應該沒有任何嚴重(critical)問題;不用滑鼠、只用鍵盤也能完整操作。文字對比度至少 4.5:1、控件對比度至少 3:1(WCAG AA)。"}</p>
    </div>
  ),
}

// @anatomy-rationale:
//   StateBehavior covered by Overview「互動流程」段(7 種觸發 → 效果對照)
//     + ColorMatrix「edit mode 三狀態 / readonly / disabled / hover 狀態」段。
//     LinkInput 的核心狀態是 edit 模式內的 link ↔ input ↔ error 三態切換以及
//     mode(edit / readonly / disabled)組合,集中於 ColorMatrix 比拆 5. 更直觀。
import type { Meta } from '@storybook/react'
import { useState, useEffect } from 'react'
import { LinkInput } from './link-input'

const meta: Meta = {
  title: 'Design System/Components/LinkInput/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type ModeKey = 'edit' | 'readonly' | 'disabled'
type EditStateKey = 'link' | 'input' | 'error'
type SizeKey = 'sm' | 'md' | 'lg'
type ColorSpec = { bg: string; text: string; border: string }

const MODES: ModeKey[] = ['edit', 'readonly', 'disabled']
const EDIT_STATES: EditStateKey[] = ['link', 'input', 'error']
const SIZES: SizeKey[] = ['sm', 'md', 'lg']

/* ── Mode × EditState color tokens ── */

interface ModeStateColors {
  wrapper: ColorSpec
  value: string
  placeholder: string
  pencil: string
  pencilHover: string
}

const COLOR_MAP: Record<ModeKey, Partial<Record<EditStateKey, ModeStateColors>>> = {
  edit: {
    link: {
      wrapper: { bg: '--surface', text: '--foreground', border: '--border' },
      value: '--primary',
      placeholder: '--fg-muted',
      pencil: '--fg-muted',
      pencilHover: '--foreground',
    },
    input: {
      wrapper: { bg: '--surface', text: '--foreground', border: '--border' },
      value: '--foreground',
      placeholder: '--fg-muted',
      pencil: '—',
      pencilHover: '—',
    },
    error: {
      wrapper: { bg: '--surface', text: '--foreground', border: '--error' },
      value: '--foreground',
      placeholder: '--fg-muted',
      pencil: '—',
      pencilHover: '—',
    },
  },
  readonly: {
    link: {
      wrapper: { bg: '--bg-readonly', text: '--foreground', border: 'transparent' },
      value: '--primary',
      placeholder: '--fg-muted',
      pencil: '—',
      pencilHover: '—',
    },
  },
  disabled: {
    link: {
      wrapper: { bg: '--bg-disabled', text: '--fg-disabled', border: 'transparent' },
      value: '--fg-disabled',
      placeholder: '--fg-muted',
      pencil: '—',
      pencilHover: '—',
    },
  },
}

/* ── Size specs ── */

interface SizeSpec {
  heightToken: string; height: string
  pxToken: string; px: number
  gapToken: string; gap: number
  fontToken: string; font: string
  icon: number
  actionHover: number
}

const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  sm: { heightToken: 'h-field-sm', height: '28px', pxToken: 'px-3', px: 12, gapToken: 'gap-2', gap: 8, fontToken: 'text-body', font: '14px', icon: 16, actionHover: 18 },
  md: { heightToken: 'h-field-md', height: '32px', pxToken: 'px-3', px: 12, gapToken: 'gap-2', gap: 8, fontToken: 'text-body', font: '14px', icon: 16, actionHover: 18 },
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
    {([['bg', 'bg'], ['text', 'text'], ['border', 'bdr']] as const).map(([key, label]) => (
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
   Blueprint components
   ═══════════════════════════════════════════════════════════════════════════ */

const Z = {
  pad:    { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  icon:   { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  gap:    { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  label:  { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  action: { bg: 'rgba(245,183,183,0.6)', border: 'rgba(210,100,100,0.9)', text: '#a03030' },
  dim:    { text: '#d04040' },
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）</H3>
          <Desc>LinkInput 是 URL 輸入與顯示元件。edit 模式在「link 狀態」與「input 狀態」之間切換——有合法 URL 時顯示藍色連結 + Pencil 編輯按鈕；無值或正在編輯時顯示文字輸入框。</Desc>
        </div>

        <div className="flex gap-8">
          {/* Link state anatomy */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">edit — link 狀態</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[
                { name: 'link text', color: 'info' },
                { name: 'Pencil action', color: 'error' },
              ].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">text-primary · hover:underline · 點擊開啟連結</span>
          </div>

          {/* Input state anatomy */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">edit — input 狀態</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[
                { name: 'bareInput', color: 'success' },
              ].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">無值 / 正在編輯 / URL 格式錯誤</span>
          </div>

          {/* Readonly */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">readonly</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5">
              <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                style={{ borderColor: 'var(--info)', backgroundColor: 'var(--info-subtle)', color: 'var(--info)' }}>link text</span>
            </div>
            <span className="text-[10px] text-fg-muted font-mono">藍色連結可點擊，無 Pencil</span>
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
                ['mode', "'edit' | 'display' | 'readonly' | 'disabled'", "'edit'", 'FieldMode 四模式'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", '尺寸，與 Button 共用 token'],
                ['error', 'boolean', 'false', '錯誤狀態，紅色邊框 + aria-invalid'],
                ['value', 'string | null', '—', 'URL 值'],
                ['onChange', '(value: string) => void', '—', '值變更回調'],
                ['placeholder', 'string', "'https://'", '空值時的佔位文字'],
                ['disabled', 'boolean', 'false', '等同 mode="disabled"'],
                ['label', 'string', '—', '自訂顯示文字（覆蓋自動 hostname 提取）'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interaction flow */}
      <div className="flex flex-col gap-3">
        <H3>互動流程</H3>
        <Desc>edit 模式下的狀態轉換。核心差異：點擊 value 開啟連結，不是進入編輯——編輯由 Pencil 觸發。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>觸發</Th><Th>效果</Th></tr></thead>
            <tbody>
              {[
                ['點擊 link text', '開啟連結（target="_blank"）'],
                ['點擊 Pencil', '切換到 input 狀態，自動 focus'],
                ['blur（合法 URL）', '切回 link 狀態，觸發 onChange'],
                ['blur（不合法 URL）', '維持 input 狀態 + error 邊框'],
                ['blur（空值）', '清除值，顯示 placeholder'],
                ['Enter', '等同 blur——觸發驗證'],
                ['Escape', '取消編輯，回復原值，不觸發驗證'],
              ].map(([trigger, effect]) => (
                <tr key={trigger}><Td>{trigger}</Td><Td>{effect}</Td></tr>
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
  const [editState, setEditState] = useState<EditStateKey>('link')
  const [size, setSize] = useState<SizeKey>('md')

  // readonly/disabled only have link state
  useEffect(() => {
    if (mode !== 'edit') setEditState('link')
  }, [mode])

  const s = SIZE_SPECS[size]
  const colors = COLOR_MAP[mode][editState]
  const showPencil = mode === 'edit' && editState === 'link'
  const showError = mode === 'edit' && editState === 'error'

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Mode</span>
          <div className="flex gap-1.5">
            {MODES.map((m) => <Tab key={m} active={mode === m} onClick={() => setMode(m)}>{m}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">State</span>
          <div className="flex gap-1.5">
            {EDIT_STATES.map((st) => (
              <Tab key={st} active={editState === st} onClick={() => { if (mode === 'edit') setEditState(st) }}>
                {st}
              </Tab>
            ))}
          </div>
          {mode !== 'edit' && <span className="text-[11px] text-fg-muted">readonly / disabled 只有 link 狀態</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Size</span>
          <div className="flex gap-1.5">
            {SIZES.map((sz) => <Tab key={sz} active={size === sz} onClick={() => setSize(sz)}>{sz}</Tab>)}
          </div>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[340px]">
          {/* Live preview */}
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <div className="w-64">
              {mode === 'edit' && editState === 'link' && (
                <LinkInput mode="edit" size={size} value="https://github.com" onChange={() => {}} />
              )}
              {mode === 'edit' && editState === 'input' && (
                <LinkInput mode="edit" size={size} value="" onChange={() => {}} />
              )}
              {mode === 'edit' && editState === 'error' && (
                <LinkInput mode="edit" size={size} value="" onChange={() => {}} error />
              )}
              {mode === 'readonly' && (
                <LinkInput mode="readonly" size={size} value="https://github.com" />
              )}
              {mode === 'disabled' && (
                <LinkInput mode="disabled" size={size} value="https://github.com" />
              )}
            </div>
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              {[
                { c: Z.pad, l: '左右內距' },
                ...(showPencil ? [{ c: Z.label, l: 'Link text' }, { c: Z.gap, l: '間距' }, { c: Z.action, l: 'Pencil' }] : [{ c: Z.label, l: 'bareInput' }]),
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
                {showPencil ? (
                  <>
                    <BpZone w={80} color={Z.label} label="link text" sub="flex-1 truncate" />
                    <BpZone w={32} color={Z.gap} label={s.gapToken} sub={`${s.gap}px`} />
                    <BpZone w={40} color={Z.action} label={`${s.icon}px`} sub="Pencil" />
                  </>
                ) : (
                  <BpZone w={140} color={Z.label} label="bareInput" sub="flex-1 min-w-0" />
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
            <p className="text-[10px] text-fg-muted">寬度為示意比例，實際由內容決定</p>
          </div>
        </div>

        {/* Right: inspect panel */}
        <div className="w-[300px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          {/* COLOR */}
          {colors && (
            <div className="px-4 py-1">
              <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span></div>
              <PropRow label="Fill"><TokenValue value={colors.wrapper.bg} /></PropRow>
              <PropRow label="Text"><TokenValue value={colors.value} /></PropRow>
              <PropRow label="Stroke"><TokenValue value={colors.wrapper.border} /></PropRow>
              {showPencil && (
                <>
                  <PropRow label="Pencil"><TokenValue value={colors.pencil} /></PropRow>
                  <PropRow label="Pencil hov"><TokenValue value={colors.pencilHover} /></PropRow>
                </>
              )}
              {showError && <PropRow label="Error bdr"><TokenValue value="--error" /></PropRow>}
              <PropRow label="Placeholder"><TokenValue value={colors.placeholder} /></PropRow>
            </div>
          )}

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="高度" dot={Z.dim.text}><TkVal token={s.heightToken} value={s.height} /></PropRow>
            <PropRow label="左右內距" dot={Z.pad.text}><TkVal token={s.pxToken} value={`${s.px}px`} /></PropRow>
            <PropRow label="元素間距" dot={Z.gap.text}><TkVal token={s.gapToken} value={`${s.gap}px`} /></PropRow>
            {showPencil && <PropRow label="Pencil icon" dot={Z.action.text}>{s.icon}px</PropRow>}
            {showPencil && <PropRow label="Action hover">{s.actionHover}px (icon+2)</PropRow>}
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
        <Desc>選擇 mode / state / size 組合，即時查看所有 token。LinkInput 的 edit mode 有三種內部狀態：link（藍色連結 + Pencil）、input（文字輸入框）、error（紅框）。</Desc>
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
        <Desc>LinkInput 的色彩設計重點：edit-link 狀態的 value 用 text-primary 呈現為可點擊連結；error 狀態的邊框用 border-error。色塊即時渲染，切 dark mode 自動更新。</Desc>
      </div>

      {/* edit mode — 3 states */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">edit 模式</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <Th>State</Th>
                <Th>預覽</Th>
                <Th>Wrapper</Th>
                <Th>Value</Th>
                <Th>Pencil</Th>
              </tr>
            </thead>
            <tbody>
              {EDIT_STATES.map((st) => {
                const c = COLOR_MAP.edit[st]!
                return (
                  <tr key={st}>
                    <Td mono>{st}</Td>
                    <td className="p-3 border-b border-divider min-w-[200px]">
                      {st === 'link' && <LinkInput mode="edit" value="https://github.com" onChange={() => {}} />}
                      {st === 'input' && <LinkInput mode="edit" value="" onChange={() => {}} />}
                      {st === 'error' && <LinkInput mode="edit" value="" onChange={() => {}} error />}
                    </td>
                    <td className="p-3 border-b border-divider align-top">
                      <TokenAnnotation colors={c.wrapper} />
                    </td>
                    <td className="p-3 border-b border-divider align-top">
                      <span className="inline-flex items-center gap-1 text-[10px]">
                        <Swatch value={c.value} size="sm" />
                        <span className="font-mono text-fg-secondary">{c.value}</span>
                      </span>
                    </td>
                    <td className="p-3 border-b border-divider align-top">
                      {c.pencil !== '—' ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px]">
                            <Swatch value={c.pencil} size="sm" />
                            <span className="font-mono text-fg-secondary">{c.pencil}</span>
                            <span className="text-fg-muted">default</span>
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px]">
                            <Swatch value={c.pencilHover} size="sm" />
                            <span className="font-mono text-fg-secondary">{c.pencilHover}</span>
                            <span className="text-fg-muted">hover</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-fg-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* readonly + disabled */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">readonly / disabled</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <Th>Mode</Th>
                <Th>預覽</Th>
                <Th>Wrapper</Th>
                <Th>Value</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              {(['readonly', 'disabled'] as const).map((m) => {
                const c = COLOR_MAP[m].link!
                return (
                  <tr key={m}>
                    <Td mono>{m}</Td>
                    <td className="p-3 border-b border-divider min-w-[200px]">
                      <LinkInput mode={m} value="https://github.com" />
                    </td>
                    <td className="p-3 border-b border-divider align-top">
                      <TokenAnnotation colors={c.wrapper} />
                    </td>
                    <td className="p-3 border-b border-divider align-top">
                      <span className="inline-flex items-center gap-1 text-[10px]">
                        <Swatch value={c.value} size="sm" />
                        <span className="font-mono text-fg-secondary">{c.value}</span>
                      </span>
                    </td>
                    <td className="p-2 border-b border-divider text-caption text-fg-muted">
                      {m === 'readonly' ? '藍色連結可點擊，無 Pencil' : '文字灰化，不可點擊'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hover states detail */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">hover 狀態</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>元素</Th><Th>Default</Th><Th>Hover</Th><Th>Active</Th></tr></thead>
            <tbody>
              <tr>
                <Td>Wrapper border (edit)</Td>
                <Td><TokenValue value="--border" /></Td>
                <Td><TokenValue value="--border-hover" /></Td>
                <Td>—</Td>
              </tr>
              <tr>
                <Td>Link text</Td>
                <Td><TokenValue value="--primary" /></Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <TokenValue value="--primary-hover" />
                    <span className="text-[10px] text-fg-muted">+ underline</span>
                  </span>
                </Td>
                <Td>—</Td>
              </tr>
              <tr>
                <Td>Pencil icon</Td>
                <Td><TokenValue value="--fg-muted" /></Td>
                <Td><TokenValue value="--foreground" /></Td>
                <Td><TokenValue value="--foreground" /></Td>
              </tr>
              <tr>
                <Td>Pencil bg</Td>
                <Td><TokenValue value="transparent" /></Td>
                <Td><TokenValue value="--neutral-hover" /></Td>
                <Td><TokenValue value="--neutral-active" /></Td>
              </tr>
              <tr>
                <Td>Error border</Td>
                <Td><TokenValue value="--error" /></Td>
                <Td><TokenValue value="--error-hover" /></Td>
                <Td>—</Td>
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
        <Desc>每個 size 對應的 token 一覽。高度使用 --field-height-* semantic token，與 Button 共用同一組 token。</Desc>
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
              { label: 'Pencil icon', subFn: (s: SizeSpec) => `${s.icon}px` },
              { label: 'Action hover', subFn: (s: SizeSpec) => `${s.actionHover}px (icon+2)` },
            ]).map((row) => (
              <tr key={row.label}>
                <Td>{row.label}</Td>
                {SIZES.map((sz) => {
                  const spec = SIZE_SPECS[sz]
                  const token = row.key ? spec[row.key] as string : undefined
                  const sub = 'subKey' in row && row.subKey ? spec[row.subKey] as string : row.subFn?.(spec)
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

      {/* Visual preview */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽 — link 狀態</span>
        <div className="flex flex-col gap-3">
          {SIZES.map((sz) => (
            <div key={sz} className="flex items-center gap-4">
              <span className="text-[11px] text-fg-muted w-8 shrink-0 font-mono">{sz}</span>
              <LinkInput mode="edit" size={sz} value="https://github.com" onChange={() => {}} className="max-w-xs" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽 — input 狀態</span>
        <div className="flex flex-col gap-3">
          {SIZES.map((sz) => (
            <div key={sz} className="flex items-center gap-4">
              <span className="text-[11px] text-fg-muted w-8 shrink-0 font-mono">{sz}</span>
              <LinkInput mode="edit" size={sz} value="" onChange={() => {}} className="max-w-xs" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽 — readonly / disabled</span>
        <div className="flex flex-col gap-3">
          {(['readonly', 'disabled'] as const).map((m) => (
            <div key={m} className="flex items-center gap-4">
              <span className="text-[11px] text-fg-muted w-16 shrink-0 font-mono">{m}</span>
              <LinkInput mode={m} value="https://github.com" className="max-w-xs" />
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
      <p className="whitespace-pre-line">{"詳 `link-input.spec.md` 「A11y 預設」段。摘要:\n\n  ARIA / Pattern  :native  <input type=\"url\">  element 預設 a11y;label 關聯靠  id ( fieldCtx.id )+ FieldLabel  <label htmlFor> (native  for  機制);input 上另設  aria-invalid  /  aria-describedby (error 時  aria-errormessage )。\n\n  Keyboard 行為  :\n\n- Tab — focus 進輸入框\n- 字母鍵 — 輸入\n- Enter — 提交,觸發 blur 驗證\n- Esc — 取消編輯,回復原值,不觸發驗證\n\n  Focus  :原生 input outline 已關閉;focus 視覺提示由 Field wrapper 的  focus-within:!border-primary  提供(滑鼠點入也亮藍框,對齊 Field wrapper canonical)。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。"}</p>
    </div>
  ),
}

// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta } from '@storybook/react'
import { useState, useEffect } from 'react'
import { Copy, Pencil, Trash2, Monitor, ChevronDown, ChevronRight, Check, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuCheckboxItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from './dropdown-menu'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/DropdownMenu/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type ItemTypeKey = 'item' | 'checkbox' | 'subTrigger' | 'label' | 'separator'
type StateKey = 'default' | 'hover' | 'active/selected' | 'disabled'
type SizeKey = 'sm' | 'md' | 'lg'
type ColorSpec = { bg: string; text: string; border: string }

const STATES: StateKey[] = ['default', 'hover', 'active/selected', 'disabled']

const ITEM_TOKEN_MAP: Record<'item' | 'checkbox', Record<StateKey, ColorSpec>> = {
  item: {
    default:          { bg: '--surface-raised', text: '--foreground', border: 'transparent' },
    hover:            { bg: '--neutral-hover', text: '--foreground', border: 'transparent' },
    'active/selected': { bg: '--neutral-selected', text: '--foreground', border: 'transparent' },
    disabled:         { bg: '--surface-raised', text: '--fg-disabled', border: 'transparent' },
  },
  checkbox: {
    default:          { bg: '--surface-raised', text: '--foreground', border: 'transparent' },
    hover:            { bg: '--neutral-hover', text: '--foreground', border: 'transparent' },
    'active/selected': { bg: '--surface-raised', text: '--foreground', border: 'transparent' },
    disabled:         { bg: '--surface-raised', text: '--fg-disabled', border: 'transparent' },
  },
}

const DANGER_ITEM_MAP: Record<StateKey, ColorSpec> = {
  default:          { bg: '--surface-raised', text: '--error', border: 'transparent' },
  hover:            { bg: '--neutral-hover', text: '--error', border: 'transparent' },
  'active/selected': { bg: '--neutral-selected', text: '--error', border: 'transparent' },
  disabled:         { bg: '--surface-raised', text: '--fg-disabled', border: 'transparent' },
}

interface SizeSpec {
  heightToken: string; height: string
  paddingFormula: string
  fontToken: string; font: string
  lineHeight: string
  icon: number
  checkboxSize: string
}

const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  sm: { heightToken: '--field-height-sm', height: '28px', paddingFormula: '(field-height-sm − 一行文字高度) / 2', fontToken: 'text-body', font: '14px', lineHeight: 'leading-compact (1.3)', icon: 16, checkboxSize: 'sm (16px)' },
  md: { heightToken: '--field-height-md', height: '32px', paddingFormula: '(field-height-md − 一行文字高度) / 2', fontToken: 'text-body', font: '14px', lineHeight: 'leading-compact (1.3)', icon: 16, checkboxSize: 'md (16px)' },
  lg: { heightToken: '--field-height-lg', height: '36px', paddingFormula: '(field-height-lg − 一行文字高度) / 2', fontToken: 'text-body-lg', font: '16px', lineHeight: 'leading-compact (1.3)', icon: 20, checkboxSize: 'lg (20px)' },
}

const ITEM_TYPE_DESC: Record<ItemTypeKey, string> = {
  item: '執行一次性動作（複製、刪除），選完即關。selected=true 時作為單選項目（bg-neutral-selected）',
  checkbox: '切換開關狀態（顯示/隱藏），選單保持開啟',
  subTrigger: '展開下一層選單，自動附加 ChevronRight',
  label: '群組標題，不可互動',
  separator: '視覺分隔線，my-2 h-px',
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
      {/* Anatomy — Trigger -> Content -> Items */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）</H3>
          <Desc>Trigger 觸發浮層 Content，Content 內含各類 Item。浮層由 SizeContext 統一控制所有子項目尺寸。所有 Item 類型內部使用 MenuItem 進行視覺渲染，Radix primitive 只處理行為。</Desc>
        </div>
        <div className="flex gap-8 items-start">
          {/* Trigger -> Content flow */}
          <div className="flex flex-col gap-3">
            <span className="text-[11px] text-fg-muted font-medium">觸發流程</span>
            <div className="flex items-center gap-3">
              <div className="border-2 border-dashed border-primary/30 rounded-md px-3 py-2">
                <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: 'var(--info)', backgroundColor: 'var(--info-subtle)', color: 'var(--info)' }}>Trigger</span>
              </div>
              <span className="text-fg-muted text-caption">→</span>
              <div className="border-2 border-dashed border-primary/30 rounded-lg px-3 py-2 flex flex-col gap-1">
                <span className="text-[10px] font-mono text-fg-muted mb-1">Content (size={'{sm|md|lg}'})</span>
                {[
                  { name: 'Item', color: 'success' },
                  { name: 'CheckboxItem', color: 'warning' },
                  { name: 'SubTrigger', color: 'info' },
                  { name: 'Label', color: 'neutral' as const },
                  { name: 'Separator', color: 'neutral' as const },
                ].map((s) => (
                  <span key={s.name} className="rounded px-2 py-0.5 text-[11px] font-mono border border-dashed"
                    style={{
                      borderColor: s.color === 'neutral' ? 'var(--border)' : `var(--${s.color})`,
                      backgroundColor: s.color === 'neutral' ? 'var(--neutral-hover)' : `var(--${s.color}-subtle)`,
                      color: s.color === 'neutral' ? 'var(--fg-muted)' : `var(--${s.color})`,
                    }}>{s.name}</span>
                ))}
              </div>
            </div>
          </div>
          {/* Item layout */}
          <div className="flex flex-col gap-3">
            <span className="text-[11px] text-fg-muted font-medium">Item 佈局（via MenuItem）</span>
            <div className="border-2 border-dashed border-primary/30 rounded-md px-3 py-2 flex items-center gap-2">
              {[
                { name: 'prefix', color: 'info' },
                { name: 'label', color: 'success' },
                { name: 'suffix', color: 'warning' },
              ].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <div className="text-[10px] text-fg-muted font-mono flex flex-col gap-0.5">
              <span>prefix: startIcon (一行文字高度) or Checkbox</span>
              <span>label: flex-1, text content + description</span>
              <span>suffix: tag / badge / endIcon / shortcut (一行文字高度 ml-auto)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Item types */}
      <div className="flex flex-col gap-3">
        <H3>Item 類型一覽</H3>
        <div className="flex flex-col gap-2">
          {(Object.keys(ITEM_TYPE_DESC) as ItemTypeKey[]).map((t) => (
            <div key={t} className="flex items-center gap-4">
              <span className="w-28 shrink-0 font-mono text-caption font-medium">{t}</span>
              <span className="text-caption text-fg-secondary">{ITEM_TYPE_DESC[t]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Props */}
      <div className="flex flex-col gap-3">
        <H3>Props</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>元件</Th><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['Content', 'size', "'sm'|'md'|'lg'", "'md'", '所有子項目尺寸，經 SizeContext 傳遞'],
                ['Content', 'sideOffset', 'number', '8', '浮層與觸發元件的間距 (px)'],
                ['Content', 'align', "'start'|'center'|'end'", "'start'", '浮層對齊方式'],
                ['Content', 'minWidth', 'number', 'max(180px, trigger-width)', '浮層最小寬度 (px)'],
                ['Content', 'maxHeight', 'number', '—', '浮層最大高度，超過時捲動'],
                ['Item', 'startIcon', 'LucideIcon', '—', '左側 icon，與 label 同色'],
                ['Item', 'avatar', 'AvatarData', '—', '左側頭像資料，與 startIcon 互斥'],
                ['Item', 'description', 'ReactNode', '—', '次要說明文字'],
                ['Item', 'tag', 'ReactNode', '—', '後綴 Tag'],
                ['Item', 'badge', 'ReactNode', '—', '後綴 Badge'],
                ['Item', 'endIcon', 'LucideIcon', '—', '後綴指示 icon（fg-muted）'],
                ['Item', 'shortcut', 'string', '—', '鍵盤快捷鍵'],
                ['Item', 'selected', 'boolean', '—', '單選選中（bg-neutral-selected）'],
                ['SubTrigger', 'startIcon', 'LucideIcon', '—', '左側 icon'],
                ['SubTrigger', 'value', 'string', '—', '子選單目前狀態文字（如 "深色"）'],
                ['SubTrigger', 'badge', 'ReactNode', '—', '子選單狀態 badge'],
                ['CheckboxItem', 'checked', 'boolean', '—', '勾選狀態'],
                ['CheckboxItem', 'startIcon', 'LucideIcon', '—', '左側 icon'],
              ].map(([comp, p, t, d, desc], i) => (
                <tr key={i}><Td>{comp}</Td><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
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
  pad:    { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  icon:   { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  gap:    { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  label:  { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  suffix: { bg: 'rgba(230,178,199,0.6)', border: 'rgba(190,103,138,0.9)', text: '#a83560' },
  dim:    { text: '#d04040' },
}

const BpZone = ({ w, color, label, sub }: { w: number; color: typeof Z.pad; label: string; sub?: string }) => (
  <div className="flex flex-col items-center justify-center shrink-0 gap-0.5"
    style={{ width: w, height: '100%', background: color.bg, borderLeft: `1.5px dashed ${color.border}`, borderRight: `1.5px dashed ${color.border}` }}>
    <span className="text-[11px] font-mono font-bold leading-none" style={{ color: color.text }}>{label}</span>
    {sub && <span className="text-[9px] font-mono leading-none opacity-70" style={{ color: color.text }}>{sub}</span>}
  </div>
)

type ItemMode = 'item' | 'checkbox' | 'subTrigger'

const InspectorInner = () => {
  const [size, setSize] = useState<SizeKey>('md')
  const [itemMode, setItemMode] = useState<ItemMode>('item')
  const [danger, setDanger] = useState(false)
  const [state, setState] = useState<StateKey>('default')

  const canDanger = itemMode === 'item'
  useEffect(() => { if (!canDanger) setDanger(false) }, [canDanger])
  const hasDanger = danger && canDanger

  const s = SIZE_SPECS[size]

  // Checkbox active/selected: bg stays --surface-raised (no bg change), checkbox shows checked
  // Item active/selected: bg-neutral-selected
  const colors = hasDanger
    ? DANGER_ITEM_MAP[state]
    : ITEM_TOKEN_MAP[itemMode === 'subTrigger' ? 'item' : itemMode][state]

  // Whether the checkbox is visually checked in the preview
  const isCheckboxChecked = itemMode === 'checkbox' && state === 'active/selected'

  // Suffix gap info
  const suffixGapToken = itemMode === 'subTrigger' ? 'gap-1' : 'gap-2'
  const suffixGapPx = itemMode === 'subTrigger' ? '4px' : '8px'
  const suffixContent = itemMode === 'subTrigger' ? 'value + ChevronRight' : 'badge + endIcon'

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Size</span>
          <div className="flex gap-1.5">
            {(['sm', 'md', 'lg'] as const).map((sz) => <Tab key={sz} active={size === sz} onClick={() => setSize(sz)}>{sz}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Item</span>
          <div className="flex gap-1.5">
            {(['item', 'checkbox', 'subTrigger'] as const).map((m) => <Tab key={m} active={itemMode === m} onClick={() => setItemMode(m)}>{m}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Danger</span>
          <div className="flex gap-1.5">
            <Tab active={!danger} onClick={() => setDanger(false)}>off</Tab>
            <Tab active={danger && canDanger} onClick={() => setDanger(true)} disabled={!canDanger}>on</Tab>
          </div>
          {!canDanger && <span className="text-[11px] text-fg-muted">僅限 Item</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">State</span>
          <div className="flex gap-1.5">
            {STATES.map((st) => <Tab key={st} active={state === st} onClick={() => setState(st)}>{st}</Tab>)}
          </div>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[380px]">
          {/* Live preview (static rendering — no Radix context needed) */}
          <div className="px-10 py-6 rounded-lg bg-canvas border border-divider">
            <div className="rounded-lg border border-border bg-surface-raised py-2" style={{ boxShadow: 'var(--elevation-200)', minWidth: 220 }}>
              {itemMode === 'item' && (
                <>
                  <ItemPreview size={size} danger={hasDanger} state={state} icon={Copy} label="複製" shortcut="⌘C" />
                  <ItemPreview size={size} danger={false} state="default" icon={Pencil} label="編輯" shortcut="⌘E" />
                  {hasDanger && (
                    <>
                      <div className="my-2 h-px bg-divider" />
                      <ItemPreview size={size} danger state={state} icon={Trash2} label="刪除" shortcut="⌘⌫" />
                    </>
                  )}
                </>
              )}
              {itemMode === 'checkbox' && (
                <>
                  <CheckboxPreview size={size} label="狀態" checked={isCheckboxChecked || true} state={state} />
                  <CheckboxPreview size={size} label="最近活動" checked={false} state="default" />
                </>
              )}
              {itemMode === 'subTrigger' && (
                <SubTriggerPreview size={size} state={state} icon={Monitor} label="主題" triggerValue="深色" />
              )}
            </div>
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              {[
                { c: Z.pad, l: '左右內距' },
                ...(itemMode === 'checkbox' ? [{ c: Z.icon, l: 'Checkbox' }] : [{ c: Z.icon, l: 'Icon' }]),
                { c: Z.gap, l: 'Gap' },
                { c: Z.label, l: 'Label' },
                ...(itemMode !== 'checkbox' ? [{ c: Z.suffix, l: 'Suffix' }] : []),
              ].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center">
              <div className="flex items-center rounded-md overflow-hidden" style={{ height: 52, outline: `2px solid ${Z.dim.text}22` }}>
                <BpZone w={44} color={Z.pad} label="px-3" sub="12px" />
                <BpZone w={44} color={Z.icon} label={`${s.icon}px`} sub={itemMode === 'checkbox' ? 'checkbox' : 'icon'} />
                <BpZone w={32} color={Z.gap} label="gap-2" sub="8px" />
                <BpZone w={56} color={Z.label} label="Label" sub={s.fontToken} />
                {itemMode !== 'checkbox' && (
                  <>
                    <BpZone w={24} color={Z.gap} label="auto" sub="ml-auto" />
                    <BpZone w={56} color={Z.suffix} label={suffixGapToken} sub={`${suffixGapPx} ${suffixContent}`} />
                  </>
                )}
                <BpZone w={44} color={Z.pad} label="px-3" sub="12px" />
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
            <p className="text-[10px] text-fg-muted">
              py = (field-height − 一行文字高度) / 2 — 單行時總高度等於同 size 的 Button / Input
            </p>
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
            {hasDanger && <PropRow label="Danger"><span className="text-[11px] text-error">prefix icon + label both --error</span></PropRow>}
            {isCheckboxChecked && <PropRow label="Checkbox"><span className="text-[11px] text-primary">checked — bg-primary border-primary</span></PropRow>}
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="Item 高度" dot={Z.dim.text}><TkVal token={s.heightToken} value={`${s.height} (single-line)`} /></PropRow>
            <PropRow label="Padding-y"><TkVal token={`calc((${s.heightToken} − 一行文字高度) / 2)`} /></PropRow>
            <PropRow label="Padding-x" dot={Z.pad.text}><TkVal token="px-3" value="12px" /></PropRow>
            <PropRow label="Gap" dot={Z.gap.text}><TkVal token="gap-2" value="8px" /></PropRow>
            <PropRow label="Icon" dot={Z.icon.text}>{s.icon}px</PropRow>
            {itemMode !== 'checkbox' && (
              <PropRow label="Suffix Gap" dot={Z.suffix.text}><TkVal token={suffixGapToken} value={`${suffixGapPx} — ${suffixContent}`} /></PropRow>
            )}
            <PropRow label="Prefix 對齊"><TkVal token="一行文字高度" value="items-center" /></PropRow>
          </div>

          {/* TYPOGRAPHY */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Typography</span></div>
            <PropRow label="Font"><TkVal token={s.fontToken} value={s.font} /></PropRow>
            <PropRow label="Line-h"><TkVal token="leading-compact" value="1.3" /></PropRow>
            <PropRow label="Shortcut"><TkVal token="text-caption" value="12px" /></PropRow>
          </div>

          {/* STYLE — floating layer */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Floating Layer</span></div>
            <PropRow label="Background"><TokenValue value="--surface-raised" /></PropRow>
            <PropRow label="Shadow"><TkVal token="--elevation-200" /></PropRow>
            <PropRow label="Radius"><TkVal token="rounded-lg" value="8px" /></PropRow>
            <PropRow label="Border"><TkVal token="border border-border" value="1px solid" /></PropRow>
            <PropRow label="Offset"><TkVal token="sideOffset" value="8px" /></PropRow>
            <PropRow label="Padding-y"><TkVal token="py-2" value="8px" /></PropRow>
            <PropRow label="Min Width"><TkVal token="max(180px, trigger-width)" /></PropRow>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Static item preview for inspector (not interactive) */
const ItemPreview = ({ size, danger, state, icon: Icon, label, shortcut }: {
  size: SizeKey; danger: boolean; state: StateKey; icon: LucideIcon; label: string; shortcut?: string
}) => {
  const iconPx = SIZE_SPECS[size].icon
  const bgClass = state === 'hover' ? 'bg-neutral-hover' : state === 'active/selected' ? 'bg-neutral-selected' : ''
  const textClass = danger ? 'text-error' : state === 'disabled' ? 'text-fg-disabled' : ''
  const fontClass = size === 'lg' ? 'text-body-lg' : 'text-body'
  return (
    <div className={`flex items-start gap-2 px-3 ${fontClass} leading-compact ${bgClass} ${textClass}`}
      style={{ paddingTop: `calc((var(--field-height-${size}) - 1lh) / 2)`, paddingBottom: `calc((var(--field-height-${size}) - 1lh) / 2)` }}>
      <div className="h-[1lh] flex items-center shrink-0"><Icon size={iconPx} /></div>
      <span>{label}</span>
      {shortcut && <span className="h-[1lh] flex items-center ml-auto text-caption text-fg-muted shrink-0 gap-2">{shortcut}</span>}
    </div>
  )
}

/** Static subTrigger preview — suffix uses gap-1, shows value + ChevronRight */
const SubTriggerPreview = ({ size, state, icon: Icon, label, triggerValue }: {
  size: SizeKey; state: StateKey; icon: LucideIcon; label: string; triggerValue?: string
}) => {
  const iconPx = SIZE_SPECS[size].icon
  const bgClass = state === 'hover' || state === 'active/selected' ? 'bg-neutral-hover' : ''
  const textClass = state === 'disabled' ? 'text-fg-disabled' : ''
  const fontClass = size === 'lg' ? 'text-body-lg' : 'text-body'
  return (
    <div className={`flex items-start gap-2 px-3 ${fontClass} leading-compact ${bgClass} ${textClass}`}
      style={{ paddingTop: `calc((var(--field-height-${size}) - 1lh) / 2)`, paddingBottom: `calc((var(--field-height-${size}) - 1lh) / 2)` }}>
      <div className="h-[1lh] flex items-center shrink-0"><Icon size={iconPx} /></div>
      <span>{label}</span>
      <div className="h-[1lh] flex items-center gap-1 ml-auto shrink-0">
        {triggerValue && <span className="text-fg-muted">{triggerValue}</span>}
        <ChevronRight size={iconPx} className="text-fg-muted" />
      </div>
    </div>
  )
}

const CheckboxPreview = ({ size, label, checked, state }: {
  size: SizeKey; label: string; checked: boolean; state: StateKey
}) => {
  // Checkbox active/selected: show checkbox as checked, no bg change
  const isCheckedVisual = state === 'active/selected' ? true : checked
  const bgClass = state === 'hover' ? 'bg-neutral-hover' : ''
  const textClass = state === 'disabled' ? 'text-fg-disabled' : ''
  const fontClass = size === 'lg' ? 'text-body-lg' : 'text-body'
  const checkboxPx = SIZE_SPECS[size].icon
  return (
    <div className={`flex items-start gap-2 px-3 ${fontClass} leading-compact ${bgClass} ${textClass}`}
      style={{ paddingTop: `calc((var(--field-height-${size}) - 1lh) / 2)`, paddingBottom: `calc((var(--field-height-${size}) - 1lh) / 2)` }}>
      <div className="h-[1lh] flex items-center shrink-0">
        <div className={`rounded border flex items-center justify-center shrink-0 ${isCheckedVisual ? 'bg-primary border-primary' : 'border-border'}`}
          style={{ width: checkboxPx, height: checkboxPx }}>
          {isCheckedVisual && <Check size={checkboxPx * 0.65} className="text-white" strokeWidth={3} />}
        </div>
      </div>
      <span>{label}</span>
    </div>
  )
}

export const Inspector = {
  name: '元件檢閱器',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <H3>元件檢閱器</H3>
        <Desc>選擇 size 與 item 類型，即時查看所有 token。Item 的 py 由公式 (field-height − 一行文字高度) / 2 計算，density 切換時自動調整。</Desc>
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
        <H3>Item State 色彩對照</H3>
        <Desc>不同 item 類型在各狀態下的背景與文字色 token。色塊即時渲染，切 dark mode 自動更新。</Desc>
      </div>

      {/* Item / Checkbox */}
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead><tr><Th>Item 類型</Th>{STATES.map((st) => <Th key={st}>{st}</Th>)}</tr></thead>
          <tbody>
            {(['item', 'checkbox'] as const).map((type) => (
              <tr key={type}>
                <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top">{type}</td>
                {STATES.map((st) => {
                  const isCheckboxSelected = type === 'checkbox' && st === 'active/selected'
                  return (
                    <td key={st} className="p-3 border-b border-divider align-top min-w-[160px]">
                      <div className="rounded px-3 py-1.5 text-body leading-compact border border-border flex items-center gap-2"
                        style={{
                          backgroundColor: `var(${ITEM_TOKEN_MAP[type][st].bg})`,
                          color: `var(${ITEM_TOKEN_MAP[type][st].text})`,
                        }}>
                        {type === 'checkbox' && (
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            isCheckboxSelected ? 'bg-primary border-primary' : 'border-border'
                          }`}>
                            {isCheckboxSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                          </div>
                        )}
                        {st === 'active/selected' ? (type === 'checkbox' ? 'checked' : 'selected') : type}
                      </div>
                      <TokenAnnotation colors={ITEM_TOKEN_MAP[type][st]} />
                      {isCheckboxSelected && (
                        <div className="flex items-center gap-1 mt-1 text-[10px]">
                          <span className="w-3 h-3 rounded-md shrink-0 bg-primary border border-black/10" />
                          <span className="text-fg-muted">checkbox: bg-primary</span>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Danger */}
      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-fg-secondary">danger item (text-error)</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>Item 類型</Th>{STATES.map((st) => <Th key={st}>{st}</Th>)}</tr></thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top">item + danger</td>
                {STATES.map((st) => (
                  <td key={st} className="p-3 border-b border-divider align-top min-w-[160px]">
                    <div className="rounded px-3 py-1.5 text-body leading-compact border border-border flex items-center gap-2"
                      style={{
                        backgroundColor: `var(${DANGER_ITEM_MAP[st].bg})`,
                        color: `var(${DANGER_ITEM_MAP[st].text})`,
                      }}>
                      <Trash2 size={16} />
                      刪除
                    </div>
                    <TokenAnnotation colors={DANGER_ITEM_MAP[st]} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Icon color rules */}
      <div className="flex flex-col gap-3">
        <H3>Icon 色彩原則</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Icon 角色</Th><Th>顏色 Token</Th><Th>範例</Th></tr></thead>
            <tbody>
              {[
                ['prefix icon (content)', '--foreground', 'Mail, Settings, Copy — follows label color'],
                ['prefix icon (danger)', '--error', 'Trash2 — follows label text-error'],
                ['suffix icon (direction)', '--fg-muted', 'ChevronRight, ExternalLink — via endIcon prop'],
                ['suffix value text', '--fg-muted', '"深色", "已啟用"'],
                ['shortcut text', '--fg-muted', '⌘C, ⌘E — via shortcut prop'],
                ['all icons (disabled)', '--fg-disabled', 'unified'],
              ].map(([role, token, ex], i) => (
                <tr key={i}>
                  <Td>{role}</Td>
                  <Td mono><span className="inline-flex items-center gap-1.5"><Swatch value={token} size="sm" />{token}</span></Td>
                  <Td>{ex}</Td>
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
   4. 尺寸對照表
   ═══════════════════════════════════════════════════════════════════════════ */

const SIZES: SizeKey[] = ['sm', 'md', 'lg']

export const SizeMatrix = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Size Token 對照</H3>
        <Desc>Content 的 size prop 統一控制所有子項目。開發只需設 token，density 切換由系統自動處理。</Desc>
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
              { label: 'Item 高度 (single-line)', key: 'heightToken' as const, sub: 'height' as const },
              { label: 'Padding-y', key: 'paddingFormula' as const, sub: undefined },
              { label: 'Label 字體', key: 'fontToken' as const, subFn: (sp: SizeSpec) => sp.font },
              { label: '行高', key: 'lineHeight' as const, sub: undefined },
              { label: 'Icon', key: undefined, subFn: (sp: SizeSpec) => `${sp.icon}px` },
              { label: 'Checkbox 控件', key: 'checkboxSize' as const, sub: undefined },
            ].map((row) => (
              <tr key={row.label}>
                <Td>{row.label}</Td>
                {SIZES.map((sz) => {
                  const spec = SIZE_SPECS[sz]
                  const token = row.key ? spec[row.key] as string : undefined
                  const sub = row.sub ? spec[row.sub] as string : row.subFn?.(spec)
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

      {/* Floating layer shared specs */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">浮層規格（所有 size 共用）</span>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>屬性</Th><Th>Token</Th><Th>值</Th></tr></thead>
            <tbody>
              {[
                ['背景', 'bg-surface-raised', '不透明，避免底層透出'],
                ['陰影', '--elevation-200', 'elevation level 2'],
                ['圓角', 'rounded-lg', '8px'],
                ['邊框', 'border border-border', '1px solid'],
                ['距離觸發器', 'sideOffset', '8px'],
                ['容器內距', 'py-2', '8px (top + bottom)'],
                ['最小寬度', 'max(180px, trigger-width)', 'follows trigger'],
                ['分隔線', 'my-2 h-px bg-divider', 'separator'],
              ].map(([attr, token, val], i) => (
                <tr key={i}><Td>{attr}</Td><Td mono>{token}</Td><Td>{val}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual preview: all sizes side by side */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽</span>
        <div className="flex gap-6 items-start">
          {SIZES.map((sz) => (
            <div key={sz} className="flex flex-col gap-2 items-start">
              <span className="text-[11px] text-fg-muted font-medium font-mono">{sz}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="tertiary" size={sz} endIcon={ChevronDown}>操作</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent size={sz}>
                  <DropdownMenuItem startIcon={Copy}>
                    複製
                  </DropdownMenuItem>
                  <DropdownMenuItem startIcon={Pencil}>
                    編輯
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem startIcon={Trash2} className="text-error">
                    刪除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. 狀態行為 — Overlay Open/Close + Submenu + Checkbox Toggle
   ═══════════════════════════════════════════════════════════════════════════ */

// Visual simulator of animation state frames
const AnimationFrame = ({
  label,
  state,
  desc,
}: {
  label: string
  state: 'closed' | 'opening' | 'open' | 'closing'
  desc: string
}) => {
  const opacity = state === 'closed' ? 0 : state === 'open' ? 1 : state === 'opening' ? 0.6 : 0.3
  const scale = state === 'closed' ? 0.95 : state === 'open' ? 1 : state === 'opening' ? 0.98 : 0.97
  const translate = state === 'closed' ? -8 : state === 'open' ? 0 : state === 'opening' ? -3 : -5
  return (
    <div className="flex flex-col gap-1.5 items-start">
      <span className="text-[10px] text-fg-muted font-mono">{label}</span>
      <div className="w-[180px] h-[140px] relative bg-canvas rounded-md border border-divider">
        <Button variant="tertiary" size="sm" className="absolute top-3 left-3 pointer-events-none">
          開啟
        </Button>
        <div
          className="absolute bg-surface-raised border border-border rounded-lg shadow-[var(--elevation-200)] text-caption"
          style={{
            top: 48,
            left: 12,
            width: 140,
            opacity,
            transform: `scale(${scale}) translateY(${translate}px)`,
            transformOrigin: 'top left',
            transition: 'none',
          }}
        >
          <div className="px-3 py-1.5 border-b border-divider text-fg-muted">複製</div>
          <div className="px-3 py-1.5 border-b border-divider text-fg-muted">編輯</div>
          <div className="px-3 py-1.5 text-error">刪除</div>
        </div>
      </div>
      <span className="text-[10px] text-fg-secondary">{desc}</span>
    </div>
  )
}

const StateBehaviorInner = () => {
  const [showMarketing, setShowMarketing] = useState(true)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showBilling, setShowBilling] = useState(true)

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <H3>狀態行為</H3>
        <Desc>
          DropdownMenu 層級特有的狀態:overlay open/close 動畫、submenu 展開 / 收起、CheckboxItem 多選 toggle。
          Item 級別的 default / hover / focused / selected / disabled 色彩對照見「3. 色彩對照表」,由 MenuItem primitive 擁有(主檔)。
        </Desc>
      </div>

      {/* Overlay open/close animation */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">行為 1:浮層 open / close 動畫(Radix data-state 驅動)</span>
        <Desc>
          Trigger 點擊 → `data-state="open"` → `animate-in fade-in-0 zoom-in-95 slide-in-from-top-2`。
          外部點擊 / Esc / 選 item → `data-state="closed"` → `animate-out fade-out-0 zoom-out-95`。
          Origin 由 `--radix-dropdown-menu-content-transform-origin` 自動跟著 trigger side/align 旋轉。
        </Desc>
        <div className="flex gap-6 pt-2">
          <AnimationFrame label='data-state="closed"' state="closed" desc="menu 未渲染(opacity 0 / scale 95% / -8px)" />
          <AnimationFrame label="opening" state="opening" desc="animate-in,~150ms duration" />
          <AnimationFrame label='data-state="open"' state="open" desc="完全 render(opacity 1 / scale 100%)" />
          <AnimationFrame label="closing" state="closing" desc="animate-out,~150ms duration" />
        </div>
        <div className="text-caption text-fg-muted pt-2 border-t border-divider">
          觸發 `close` 的路徑:(a) 點擊 item(auto close)/ (b) Esc / (c) 外部點擊(onPointerDownOutside)/ (d) blur。
          Trigger 會回到 focused 狀態,保留鍵盤流程。
        </div>
      </div>

      {/* Submenu expansion */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">行為 2:Submenu 展開(hover/focus 延遲 + sideways slide)</span>
        <Desc>
          SubTrigger hover 約 100ms 自動展開 submenu 向右側滑入(RTL 向左)。Submenu 是獨立 floating layer——與 parent 共存,parent 不 close。鍵盤用 ArrowRight 展開 / ArrowLeft 收起。
        </Desc>
        <div className="flex gap-6 items-start">
          <div className="flex items-center justify-center px-6 py-8 rounded-lg bg-canvas border border-divider min-w-[280px]">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" endIcon={ChevronDown}>分享檔案</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem startIcon={Copy}>複製連結</DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger startIcon={Monitor}>匯出為</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem>PDF</DropdownMenuItem>
                    <DropdownMenuItem>Excel (.xlsx)</DropdownMenuItem>
                    <DropdownMenuItem>CSV</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem startIcon={Trash2} className="text-error">刪除</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col gap-2 text-[11px] text-fg-muted max-w-[280px]">
            <div>點「分享檔案」打開主選單,hover「匯出為」看 submenu 向右滑入。</div>
            <div className="pt-1 border-t border-divider">
              ChevronRight suffix 是 SubTrigger 的視覺 affordance(消費 item-anatomy row 主檔,不自刻)。
            </div>
            <div className="pt-1 border-t border-divider">
              鍵盤:焦點在 SubTrigger 時 ArrowRight 展開、ArrowLeft 回 parent。
            </div>
          </div>
        </div>
      </div>

      {/* CheckboxItem toggle */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">行為 3:CheckboxItem toggle(多選維持 open)</span>
        <Desc>
          CheckboxItem 與一般 Item 的關鍵差異:點擊後 menu **不 close**(保留當前 filter 狀態讓使用者繼續勾 / 取消勾),直到 Esc / 外部點擊才關閉。對比 {'<DropdownMenuItem>'} 點擊即 close。
        </Desc>
        <div className="flex gap-6 items-start">
          <div className="flex items-center justify-center px-6 py-8 rounded-lg bg-canvas border border-divider min-w-[280px]">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" endIcon={ChevronDown}>
                  欄位({[showMarketing, showAnalytics, showBilling].filter(Boolean).length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuCheckboxItem
                  checked={showMarketing}
                  onCheckedChange={setShowMarketing}
                >
                  Marketing spend
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showAnalytics}
                  onCheckedChange={setShowAnalytics}
                >
                  Analytics
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showBilling}
                  onCheckedChange={setShowBilling}
                >
                  Billing
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col gap-2 text-[11px] text-fg-muted max-w-[280px]">
            <div>打開後逐項勾選——menu 不會 close,使用者看得到即時的選擇組合。</div>
            <div className="pt-1 border-t border-divider">
              世界級對照:Linear / Jira column toggle / Notion filter selector 全採此模式。對照 Select 單選下拉選一項即 close(那是 commit 語意)。
            </div>
          </div>
        </div>
      </div>

      {/* Rule notes */}
      <div className="flex flex-col gap-2 pt-4 border-t border-divider">
        <span className="text-caption font-medium text-fg-secondary">行為規則</span>
        <ul className="text-caption text-fg-secondary space-y-1.5 ml-4 list-disc">
          <li>`DropdownMenuItem` 點擊即 close——這是「action 觸發即完成」語意。</li>
          <li>`DropdownMenuCheckboxItem` 點擊**不 close**——多選語意,等使用者關 menu 才 commit。</li>
          <li>`DropdownMenuSub` 永遠右側滑入,parent menu 保持展開——提供 breadcrumb 式認知流,使用者知道自己在哪層。</li>
          <li>Escape close 整個選單(含所有展開子層;Radix root close)。ArrowLeft 才逐層收合(焦點回 SubTrigger)。</li>
          <li>Portal render 到 body,`z-50` 確保不被 parent overflow 截斷。</li>
          <li>Focus trap:menu open 時鍵盤焦點進入 menu,close 時自動 restore 到 trigger。</li>
        </ul>
      </div>
    </div>
  )
}

export const StateBehavior = {
  name: '狀態行為',
  render: () => <StateBehaviorInner />,
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"無障礙能力沿用 Radix 選單元件的內建支援,涵蓋語意角色、選單導覽與焦點管理,設計師與工程師不需額外設定。\n\n鍵盤操作:\n\n- Tab — 將焦點移到觸發按鈕\n- Enter / Space / 向下鍵 — 開啟選單\n- 向上鍵 / 向下鍵 — 在選項之間移動\n- Enter — 選擇目前的選項\n- Esc — 關閉整個選單(含子選單;逐層收合用左方向鍵)\n\n焦點管理:選單開啟時焦點會進入選單,關閉後自動回到原本的觸發按鈕;目前導覽到的選項會以明顯的 highlight 底色標示,鍵盤使用者隨時看得到自己在哪一項。\n\n驗證:鍵盤可完整操作(不需滑鼠),文字對比達 WCAG AA;在 Storybook 無障礙檢查面板上應為零項嚴重問題。"}</p>
      <p className="mt-4 text-fg-muted">完整 ARIA 細節參考 <a className="text-primary hover:underline" href="https://www.radix-ui.com/primitives/docs/components/dropdown-menu#accessibility" target="_blank" rel="noreferrer">Radix Accessibility 文件</a>。</p>
    </div>
  ),
}

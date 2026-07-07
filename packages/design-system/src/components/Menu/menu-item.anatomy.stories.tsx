// @anatomy-rationale:
//   StateBehavior covered by ColorMatrix「State 色彩對照」段(default / hover /
//     selected / disabled,單選 × 多選 = 8 組合)+ Header 子段。Menu item
//     狀態本身就是色彩變化(bg / text / icon / desc 四 token),分到獨立 5.
//     會與 ColorMatrix 重複。
import type { Meta } from '@storybook/react'
import { useState, useEffect } from 'react'
import { Mail, Bell, FileText } from 'lucide-react'
import { MenuItem, MenuGroup } from './menu-item'
import { Tag } from '@/design-system/components/Tag/tag'
// Avatar is now passed as AvatarData (data object), rendered internally by MenuItem

const meta: Meta = {
  title: 'Design System/Internal/Menu/設計規格',
  tags: ['!dev'],
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type SizeKey = 'sm' | 'md' | 'lg'
type StateKey = 'default' | 'hover' | 'selected' | 'disabled'
type ModeKey = 'single' | 'multi'
type ColorSpec = { bg: string; text: string; icon: string; desc: string }

const SIZES: SizeKey[] = ['sm', 'md', 'lg']
const STATES: StateKey[] = ['default', 'hover', 'selected', 'disabled']

/** 單選 token map */
const SINGLE_TOKEN_MAP: Record<StateKey, ColorSpec> = {
  default:  { bg: 'transparent',     text: '--foreground', icon: '--foreground',  desc: '--fg-secondary' },
  hover:    { bg: '--neutral-hover', text: '--foreground', icon: '--foreground',  desc: '--fg-secondary' },
  selected: { bg: '--neutral-selected',text: '--foreground', icon: '--foreground',  desc: '--fg-secondary' },
  disabled: { bg: 'transparent',     text: '--fg-disabled',icon: '--fg-disabled', desc: '--fg-disabled' },
}

/** 多選 token map */
const MULTI_TOKEN_MAP: Record<StateKey, ColorSpec> = {
  default:  { bg: 'transparent',     text: '--foreground', icon: '--foreground',  desc: '--fg-secondary' },
  hover:    { bg: '--neutral-hover', text: '--foreground', icon: '--foreground',  desc: '--fg-secondary' },
  selected: { bg: 'transparent',     text: '--foreground', icon: '--foreground',  desc: '--fg-secondary' },
  disabled: { bg: 'transparent',     text: '--fg-disabled',icon: '--fg-disabled', desc: '--fg-disabled' },
}

interface SizeSpec {
  heightToken: string
  labelFont: string; labelSize: string
  descFont: string; descSize: string
  icon: number
  checkbox: string
  avatarInline: number; avatarBlock: number
  py: string
}

const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  sm: {
    heightToken: '--field-height-sm',
    labelFont: 'text-body leading-compact', labelSize: '14px × 1.3',
    descFont: 'text-caption', descSize: '12px × 1.3',
    icon: 16, checkbox: 'sm (16px)',
    avatarInline: 20, avatarBlock: 32,
    py: 'calc((var(--field-height-sm) − 一行文字高度) / 2)',
  },
  md: {
    heightToken: '--field-height-md',
    labelFont: 'text-body leading-compact', labelSize: '14px × 1.3',
    descFont: 'text-caption', descSize: '12px × 1.3',
    icon: 16, checkbox: 'md (16px)',
    avatarInline: 24, avatarBlock: 32,
    py: 'calc((var(--field-height-md) − 一行文字高度) / 2)',
  },
  lg: {
    heightToken: '--field-height-lg',
    labelFont: 'text-body-lg leading-compact', labelSize: '16px × 1.3',
    descFont: 'text-body leading-compact', descSize: '14px × 1.3',
    icon: 20, checkbox: 'lg (20px)',
    avatarInline: 24, avatarBlock: 40,
    py: 'calc((var(--field-height-lg) − 一行文字高度) / 2)',
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared UI

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
    {([['bg', 'bg'], ['text', 'label'], ['icon', 'icon'], ['desc', 'desc']] as const).map(([key, label]) => (
      <span key={key} className="inline-flex items-center gap-1 text-[10px]">
        <Swatch value={colors[key]} size="sm" />
        <span className="text-fg-muted w-7 shrink-0">{label}</span>
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
    <span className="text-[11px] text-fg-muted font-medium w-[80px] shrink-0 pt-0.5 flex items-center gap-1.5">
      {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
      {label}
    </span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

const TokenValue = ({ value }: { value: string }) => (
  <span className="inline-flex items-center gap-2"><Swatch value={value} /><span>{value}</span></span>
)

/* ── Blueprint zone colors ── */
const Z = {
  pad:     { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  prefix:  { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  gap:     { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  content: { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  suffix:  { bg: 'rgba(251,191,206,0.6)', border: 'rgba(220,110,140,0.9)', text: '#a33060' },
  dim:     { text: '#d04040' },
}

/** Horizontal zone block */
const BpZoneH = ({ w, color, label, sub }: { w: number; color: { bg: string; border: string; text: string }; label: string; sub?: string }) => (
  <div className="flex flex-col items-center justify-center shrink-0 gap-0.5"
    style={{ width: w, height: '100%', background: color.bg, borderLeft: `1.5px dashed ${color.border}`, borderRight: `1.5px dashed ${color.border}` }}>
    <span className="text-[10px] font-mono font-bold leading-none" style={{ color: color.text }}>{label}</span>
    {sub && <span className="text-[9px] font-mono leading-none opacity-70" style={{ color: color.text }}>{sub}</span>}
  </div>
)

/** Vertical zone block (full width, fixed height) */
const BpZoneV = ({ h, color, label, sub }: { h: number; color: { bg: string; border: string; text: string }; label: string; sub?: string }) => (
  <div className="flex items-center justify-center gap-1.5"
    style={{ height: h, width: '100%', background: color.bg, borderTop: `1.5px dashed ${color.border}`, borderBottom: `1.5px dashed ${color.border}` }}>
    <span className="text-[10px] font-mono font-bold leading-none" style={{ color: color.text }}>{label}</span>
    {sub && <span className="text-[9px] font-mono leading-none opacity-70" style={{ color: color.text }}>{sub}</span>}
  </div>
)

const MenuContainer = ({ children, width = 320 }: { children: React.ReactNode; width?: number }) => (
  <div className="rounded-lg bg-surface-raised border border-border overflow-hidden"
    style={{ boxShadow: 'var(--elevation-200)', width }}>
    {children}
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
          <Desc>三個區域：prefix（checkbox + icon 或 avatar）、content（label + description）、suffix（tag）。prefix 內 checkbox 和 icon/avatar 由對齊容器統一管理。</Desc>
        </div>
        <div className="flex flex-col gap-4">
          {/* Full structure */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">完整結構</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
              {[
                { name: 'checkbox', color: 'warning' },
                { name: 'startIcon | avatar', color: 'info' },
                { name: 'label', color: 'success' },
                { name: 'description', color: 'magenta' },
                { name: 'tag', color: 'warning' },
              ].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            <span className="text-[10px] text-fg-muted font-mono">
              prefix: [checkbox?] [startIcon? | avatar?] &middot; content: [label + description?] &middot; suffix: [tag?]
            </span>
          </div>

          {/* Prefix alignment modes */}
          <div className="flex gap-8">
            <div className="flex flex-col gap-2 items-start">
              <span className="text-[11px] text-fg-muted font-medium">Inline 對齊（prefix &le; 24px）</span>
              <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
                <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: 'var(--info)', backgroundColor: 'var(--info-subtle)', color: 'var(--info)' }}>icon 16px</span>
                <div className="flex flex-col gap-0.5">
                  <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                    style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>label</span>
                  <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                    style={{ borderColor: 'var(--color-magenta-6)', backgroundColor: 'var(--color-magenta-1)', color: 'var(--color-magenta-6)' }}>description</span>
                </div>
              </div>
              <span className="text-[10px] text-fg-muted font-mono">prefix 容器高度 = 一行文字高度，對齊第一行 label</span>
            </div>
            <div className="flex flex-col gap-2 items-start">
              <span className="text-[11px] text-fg-muted font-medium">Block 對齊（avatar &gt; 24px + description）</span>
              <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-2">
                <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: 'var(--info)', backgroundColor: 'var(--info-subtle)', color: 'var(--info)' }}>avatar 32px</span>
                <div className="flex flex-col gap-0.5">
                  <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                    style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>label</span>
                  <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                    style={{ borderColor: 'var(--color-magenta-6)', backgroundColor: 'var(--color-magenta-1)', color: 'var(--color-magenta-6)' }}>description</span>
                </div>
              </div>
              <span className="text-[10px] text-fg-muted font-mono">prefix 容器高度 = label行高 + 2px + desc行高，對齊文字塊中心</span>
            </div>
          </div>
        </div>
      </div>

      {/* Props */}
      <div className="flex flex-col gap-3">
        <H3>Props</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['children', 'ReactNode', '(required)', 'Label 文字'],
                ['description', 'ReactNode', '—', '次要說明，顯示在 label 下方'],
                ['startIcon', 'LucideIcon', '—', '左側 icon，與 avatar 互斥'],
                ['avatar', 'AvatarData', '—', '左側頭像資料（{ src?, alt, color? }），元件內部渲染 Avatar。與 startIcon 互斥'],
                ['checkbox', 'boolean', 'false', '顯示 checkbox（多選模式）'],
                ['checked', "boolean | 'indeterminate'", 'false', 'checkbox 選中狀態'],
                ['selected', 'boolean', 'false', '單選選中（bg-neutral-selected 背景）'],
                ['tag', 'ReactNode', '—', '後綴 Tag，靠右對齊'],
                ['disabled', 'boolean', 'false', '停用：文字 / startIcon 套 fg-disabled，checkbox 用 disabled 樣式，tag / endContent 套 opacity-disabled，avatar 不變'],
                ['header', 'boolean', 'false', '群組標題，不可選不可 hover'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", '尺寸，對齊 field-height token'],
                ['endContent', 'ReactNode', '—', '後綴自訂內容（DropdownMenu 的 badge/endIcon/shortcut 經由此注入）'],
                ['labelMaxLines', "number | 'none'", '1', `標籤最大行數，'none' 不截斷`],
                ['descMaxLines', "number | 'none'", '1', `描述最大行數，'none' 不截斷`],
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
  const [size, setSize] = useState<SizeKey>('md')
  const [mode, setMode] = useState<ModeKey>('single')
  const [selected, setSelected] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [hasIcon, setHasIcon] = useState(true)
  const [hasAvatar, setHasAvatar] = useState(false)
  const [hasDesc, setHasDesc] = useState(false)
  const [hasTag, setHasTag] = useState(false)

  // avatar and icon are mutually exclusive
  useEffect(() => { if (hasAvatar) setHasIcon(false) }, [hasAvatar])
  useEffect(() => { if (hasIcon) setHasAvatar(false) }, [hasIcon])

  const s = SIZE_SPECS[size]
  const isMulti = mode === 'multi'
  const stateKey: StateKey = disabled ? 'disabled' : selected ? 'selected' : 'default'
  const colors = isMulti ? MULTI_TOKEN_MAP[stateKey] : SINGLE_TOKEN_MAP[stateKey]
  const avatarPx = hasAvatar ? (hasDesc ? s.avatarBlock : s.avatarInline) : 0
  const prefixAlign = avatarPx > 24 && hasDesc ? 'block' : 'inline'
  const hasPrefix = isMulti || hasIcon || hasAvatar

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">Size</span>
          <div className="flex gap-1.5">
            {SIZES.map((sz) => <Tab key={sz} active={size === sz} onClick={() => setSize(sz)}>{sz}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">Mode</span>
          <div className="flex gap-1.5">
            <Tab active={mode === 'single'} onClick={() => setMode('single')}>single</Tab>
            <Tab active={mode === 'multi'} onClick={() => setMode('multi')}>multi</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">selected</span>
          <div className="flex gap-1.5">
            <Tab active={!selected} onClick={() => setSelected(false)}>off</Tab>
            <Tab active={selected} onClick={() => setSelected(true)}>on</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">disabled</span>
          <div className="flex gap-1.5">
            <Tab active={!disabled} onClick={() => setDisabled(false)}>off</Tab>
            <Tab active={disabled} onClick={() => setDisabled(true)}>on</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">startIcon</span>
          <div className="flex gap-1.5">
            <Tab active={!hasIcon} onClick={() => setHasIcon(false)}>off</Tab>
            <Tab active={hasIcon} onClick={() => setHasIcon(true)} disabled={hasAvatar}>on</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">avatar</span>
          <div className="flex gap-1.5">
            <Tab active={!hasAvatar} onClick={() => setHasAvatar(false)}>off</Tab>
            <Tab active={hasAvatar} onClick={() => setHasAvatar(true)} disabled={hasIcon}>on</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">description</span>
          <div className="flex gap-1.5">
            <Tab active={!hasDesc} onClick={() => setHasDesc(false)}>off</Tab>
            <Tab active={hasDesc} onClick={() => setHasDesc(true)}>on</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">tag</span>
          <div className="flex gap-1.5">
            <Tab active={!hasTag} onClick={() => setHasTag(false)}>off</Tab>
            <Tab active={hasTag} onClick={() => setHasTag(true)}>on</Tab>
          </div>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[360px]">
          <div className="px-4 py-6 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <MenuContainer width={340}>
              <MenuGroup>
                <MenuItem
                  size={size}
                  startIcon={hasIcon ? Mail : undefined}
                  avatar={hasAvatar ? { alt: "Alice", color: "indigo" as const } : undefined}
                  description={hasDesc ? '每日摘要信件到信箱' : undefined}
                  checkbox={isMulti}
                  checked={isMulti ? selected : undefined}
                  selected={!isMulti ? selected : undefined}
                  disabled={disabled}
                  tag={hasTag ? <Tag size={size} color="neutral">標籤</Tag> : undefined}
                >
                  電子郵件通知
                </MenuItem>
              </MenuGroup>
            </MenuContainer>
          </div>

          {/* 2D Blueprint */}
          <div className="flex flex-col gap-2">
            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] flex-wrap">
              {[
                { c: Z.pad, l: '內距' },
                ...(hasPrefix ? [{ c: Z.prefix, l: 'Prefix' }] : []),
                { c: Z.gap, l: '間距' },
                { c: Z.content, l: 'Content' },
                ...(hasTag ? [{ c: Z.suffix, l: 'Suffix' }] : []),
              ].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>

            {/* Blueprint rows: top padding → content row → bottom padding */}
            <div className="flex items-start gap-0">
              <div className="flex flex-col rounded-md overflow-hidden" style={{ outline: `2px solid ${Z.dim.text}22` }}>
                {/* Top padding-y */}
                <BpZoneV h={20} color={Z.pad} label="padding-y" sub={s.py} />
                {/* Horizontal content row */}
                <div className="flex items-center" style={{ height: 44 }}>
                  {/* Left padding-x */}
                  <BpZoneH w={40} color={Z.pad} label="px-3" sub="12px" />
                  {/* Prefix */}
                  {hasPrefix && (
                    <>
                      <BpZoneH w={isMulti ? 50 : 44} color={Z.prefix}
                        label={isMulti && hasIcon ? 'CB+Icon' : isMulti ? 'Checkbox' : hasIcon ? `${s.icon}px` : hasAvatar ? `${avatarPx}px` : '—'}
                        sub={isMulti && hasIcon ? `${s.checkbox}+${s.icon}px` : isMulti ? s.checkbox : hasIcon ? 'icon' : hasAvatar ? 'avatar' : ''} />
                      <BpZoneH w={28} color={Z.gap} label="gap-2" sub="8px" />
                    </>
                  )}
                  {/* Content */}
                  <BpZoneH w={hasDesc ? 80 : 64} color={Z.content}
                    label={hasDesc ? 'Label+Desc' : 'Label'}
                    sub={s.labelFont} />
                  {/* Suffix */}
                  {hasTag && (
                    <>
                      <BpZoneH w={28} color={Z.gap} label="gap-2" sub="8px" />
                      <BpZoneH w={36} color={Z.suffix} label="Tag" sub="suffix" />
                    </>
                  )}
                  {/* Right padding-x */}
                  <BpZoneH w={40} color={Z.pad} label="px-3" sub="12px" />
                </div>
                {/* Bottom padding-y */}
                <BpZoneV h={20} color={Z.pad} label="padding-y" sub={s.py} />
              </div>

              {/* Height dimension line */}
              <div className="ml-3 flex items-center" style={{ height: 84 }}>
                <svg width="10" height="84" className="shrink-0">
                  <line x1="5" y1="2" x2="5" y2="82" stroke={Z.dim.text} strokeWidth="1" />
                  <line x1="1" y1="2" x2="9" y2="2" stroke={Z.dim.text} strokeWidth="1.5" />
                  <line x1="1" y1="82" x2="9" y2="82" stroke={Z.dim.text} strokeWidth="1.5" />
                </svg>
                <div className="ml-1.5"><TkVal token={s.heightToken} /></div>
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
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span></div>
            <PropRow label="Background"><TokenValue value={colors.bg} /></PropRow>
            <PropRow label="Label"><TokenValue value={colors.text} /></PropRow>
            <PropRow label="Prefix icon"><TokenValue value={colors.icon} /></PropRow>
            {hasDesc && <PropRow label="Description"><TokenValue value={colors.desc} /></PropRow>}
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="單行高度"><TkVal token={s.heightToken} /></PropRow>
            <PropRow label="padding-y"><TkVal token={s.py} /></PropRow>
            <PropRow label="padding-x"><TkVal token="px-3" value="12px" /></PropRow>
            <PropRow label="元素間距"><TkVal token="gap-2" value="8px" /></PropRow>
            <PropRow label="Prefix align">
              {prefixAlign === 'inline'
                ? <TkVal token="一行文字高度" value="對齊第一行 label" />
                : <TkVal token="label行高 + 2px + desc行高" value="對齊文字塊中心" />
              }
            </PropRow>
            {hasIcon && <PropRow label="Icon">{s.icon}px</PropRow>}
            {hasAvatar && <PropRow label="Avatar">{avatarPx}px ({prefixAlign})</PropRow>}
            {isMulti && <PropRow label="Checkbox">{s.checkbox}</PropRow>}
          </div>

          {/* TYPOGRAPHY */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Typography</span></div>
            <PropRow label="Label"><TkVal token={s.labelFont} value={s.labelSize} /></PropRow>
            {hasDesc && <PropRow label="Description"><TkVal token={s.descFont} value={s.descSize} /></PropRow>}
            {hasDesc && <PropRow label="Label-Desc 間距"><TkVal token={size === 'lg' ? '--item-gap-label-desc-scanning-lg' : '--item-gap-label-desc-scanning'} value="2px" /></PropRow>}
          </div>

          {/* SELECTION */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Selection</span></div>
            <PropRow label="模式">{isMulti ? 'Checkbox 勾選' : 'bg-neutral-selected 背景'}</PropRow>
            <PropRow label="選後行為">{isMulti ? '不關閉浮層' : '關閉浮層'}</PropRow>
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
        <H3>State 色彩對照</H3>
        <Desc>單選用 bg-neutral-selected 背景指示選中，多選用 Checkbox 勾選——背景不變。disabled 時所有元素統一 fg-disabled。色塊即時渲染，切 dark mode 自動更新。</Desc>
      </div>

      {/* Single-select */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">單選（selected = bg-neutral-selected）</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>State</Th><Th>預覽</Th><Th>Token</Th></tr></thead>
            <tbody>
              {STATES.map((st) => (
                <tr key={st}>
                  <Td mono>{st}</Td>
                  <td className="p-3 border-b border-divider align-top min-w-[280px]">
                    <MenuContainer width={260}>
                      <MenuGroup>
                        <MenuItem
                          size="md"
                          startIcon={Mail}
                          selected={st === 'selected'}
                          disabled={st === 'disabled'}
                          description="摘要通知"
                        >
                          電子郵件
                        </MenuItem>
                      </MenuGroup>
                    </MenuContainer>
                  </td>
                  <td className="p-3 border-b border-divider align-top min-w-[200px]">
                    <TokenAnnotation colors={SINGLE_TOKEN_MAP[st]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-select */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">多選（selected = checkbox 勾選，背景不變）</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>State</Th><Th>預覽</Th><Th>Token</Th></tr></thead>
            <tbody>
              {STATES.map((st) => (
                <tr key={st}>
                  <Td mono>{st}</Td>
                  <td className="p-3 border-b border-divider align-top min-w-[280px]">
                    <MenuContainer width={260}>
                      <MenuGroup>
                        <MenuItem
                          size="md"
                          startIcon={Mail}
                          checkbox
                          checked={st === 'selected'}
                          disabled={st === 'disabled'}
                          description="摘要通知"
                        >
                          電子郵件
                        </MenuItem>
                      </MenuGroup>
                    </MenuContainer>
                  </td>
                  <td className="p-3 border-b border-divider align-top min-w-[200px]">
                    <TokenAnnotation colors={MULTI_TOKEN_MAP[st]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Header（群組標題）</span>
        <div className="flex items-start gap-4">
          <MenuContainer width={260}>
            <MenuGroup>
              <MenuItem size="md" header>群組標題</MenuItem>
              <MenuItem size="md" startIcon={FileText}>一般選項</MenuItem>
            </MenuGroup>
          </MenuContainer>
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px]">
              <span className="text-fg-muted w-7 shrink-0">text</span>
              <span className="font-mono text-fg-secondary">--fg-muted + font-medium</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[10px]">
              <span className="text-fg-muted w-7 shrink-0">互動</span>
              <span className="font-mono text-fg-secondary">pointer-events-none</span>
            </span>
          </div>
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
        <Desc>每個 size 對應的 token 一覽。density 切換由系統自動處理 field-height 值。</Desc>
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
              <Td>單行高度</Td>
              {SIZES.map((sz) => <Td key={sz} mono><TkVal token={SIZE_SPECS[sz].heightToken} /></Td>)}
            </tr>
            <tr>
              <Td>padding-y</Td>
              {SIZES.map((sz) => <Td key={sz} mono><span className="text-fg-secondary text-[11px]">(field-height − 一行文字高度) / 2</span></Td>)}
            </tr>
            <tr>
              <Td>padding-x</Td>
              {SIZES.map(() => <Td mono><TkVal token="px-3" value="12px" /></Td>)}
            </tr>
            <tr>
              <Td>Label 字體</Td>
              {SIZES.map((sz) => <Td key={sz} mono><TkVal token={SIZE_SPECS[sz].labelFont} value={SIZE_SPECS[sz].labelSize} /></Td>)}
            </tr>
            <tr>
              <Td>Description 字體</Td>
              {SIZES.map((sz) => <Td key={sz} mono><TkVal token={SIZE_SPECS[sz].descFont} value={SIZE_SPECS[sz].descSize} /></Td>)}
            </tr>
            <tr>
              <Td>Icon</Td>
              {SIZES.map((sz) => <Td key={sz} mono>{SIZE_SPECS[sz].icon}px</Td>)}
            </tr>
            <tr>
              <Td>Checkbox</Td>
              {SIZES.map((sz) => <Td key={sz} mono>{SIZE_SPECS[sz].checkbox}</Td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Avatar sizing */}
      <div className="flex flex-col gap-3">
        <H3>Avatar 尺寸——24px 閾值</H3>
        <Desc>
          avatar 尺寸由 description 決定。無 description 時使用 inline 尺寸（對齊 Tag 高度，&le; 24px），有 description 時使用 block 尺寸（floor8(label行高 + 2px + desc行高)，&gt; 24px）。24px 是物理限制——16px icon 在 24px 圓內可辨識，更小則不行。
        </Desc>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr>
              <Th>Avatar 模式</Th>
              {SIZES.map((sz) => <Th key={sz}>{sz}</Th>)}
              <Th>Prefix 對齊</Th>
            </tr></thead>
            <tbody>
              <tr>
                <Td>inline（無 description）</Td>
                {SIZES.map((sz) => <Td key={sz} mono>{SIZE_SPECS[sz].avatarInline}px</Td>)}
                <Td mono>一行文字高度</Td>
              </tr>
              <tr>
                <Td>block（有 description）</Td>
                {SIZES.map((sz) => <Td key={sz} mono>{SIZE_SPECS[sz].avatarBlock}px</Td>)}
                <Td mono>label行高 + 2px + desc行高</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual preview per size */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽</span>
        <div className="flex flex-col gap-6">
          {SIZES.map((sz) => (
            <div key={sz} className="flex flex-col gap-1">
              <span className="text-caption text-fg-muted font-mono">{sz}{sz === 'md' ? '（預設）' : ''}</span>
              <MenuContainer width={380}>
                <MenuGroup>
                  <MenuItem size={sz} startIcon={Mail} description="每日摘要信件">
                    電子郵件通知
                  </MenuItem>
                  <MenuItem size={sz} avatar={{ alt: "Alice", color: "indigo" as const }}>
                    Alice Chen
                  </MenuItem>
                  <MenuItem size={sz} avatar={{ alt: "Bob", color: "magenta" as const }} description="工程部門">
                    Bob Wang
                  </MenuItem>
                  <MenuItem size={sz} checkbox checked={true} startIcon={Bell}>
                    推播通知
                  </MenuItem>
                  <MenuItem size={sz} tag={<Tag size={sz} color="neutral">Admin</Tag>}>
                    權限標記
                  </MenuItem>
                </MenuGroup>
              </MenuContainer>
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
      <p className="whitespace-pre-line">{"MenuItem 只負責單行的視覺排版,本身不接管鍵盤與焦點。真正的鍵盤導覽(上下鍵切換、Enter 選取、Esc 關閉)與焦點管理由外層的選單元件(SelectMenu / DropdownMenu)負責——MenuItem 不重複實作這些行為。\n\n  語意 role  :直接使用時(如本元件 stories 的 listbox demo)MenuItem 預設渲染為 role=\"option\" 並帶 aria-selected / aria-disabled;巢狀在外層互動節點內時(SelectMenu / Combobox 的 cmdk option、DropdownMenu 的 Radix menuitem)外層會傳 role=\"presentation\",MenuItem 同步抑制 aria-selected / aria-disabled——ARIA 語意由外層節點單一持有,內層僅保留 data-* 樣式屬性。哪一項目前被聚焦與選取由外層選單決定。\n\n  焦點外觀  :聚焦時以 bg-neutral-hover 背景高亮標示被聚焦的選項(cva base 為 outline-none + focus-visible:bg-neutral-hover),對齊 menu/listbox option 的 active-highlight 慣例,而非畫 outline ring。\n\n  驗證  :Storybook a11y addon 面板應 0 critical violation;整個選單用鍵盤即可完整操作(無需滑鼠);文字對比 ≥ 4.5:1、介面元素對比 ≥ 3:1(WCAG AA)。"}</p>
    </div>
  ),
}

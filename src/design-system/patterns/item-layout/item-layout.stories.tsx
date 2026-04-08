import type { Meta } from '@storybook/react'
import { useState } from 'react'
import {
  Mail, Bell, Settings, Star, ChevronRight, ExternalLink, User,
  Trash2, Copy, Archive, Pencil, Globe, Lock,
} from 'lucide-react'
import { SelectMenuItem } from '@/design-system/components/SelectMenu/select-menu-item'
import { SelectionItem } from '@/design-system/components/SelectionControl/selection-item'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { RadioGroup, RadioGroupItem } from '@/design-system/components/Radio/radio'
import { Tag } from '@/design-system/components/Tag/tag'

const meta: Meta = {
  title: 'Design System/Patterns/Item Layout',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type SizeKey = 'sm' | 'md' | 'lg'
type ModeKey = 'scanning' | 'reading'
type PrefixType = 'icon' | 'avatar'

const SIZES: SizeKey[] = ['sm', 'md', 'lg']

interface SizeSpec {
  heightToken: string
  height: string
  pyFormula: string
  labelFont: string
  labelSize: string
  labelLh: string
  descFont: string
  descSize: string
  descLh: string
  iconPx: number
  controlPx: number
}

const SCANNING_SPECS: Record<SizeKey, SizeSpec> = {
  sm: { heightToken: '--field-height-sm', height: '28px', pyFormula: '(field-height-sm - 1lh) / 2', labelFont: 'text-body leading-compact', labelSize: '14px', labelLh: '1.3', descFont: 'text-caption', descSize: '12px', descLh: '1.3', iconPx: 16, controlPx: 16 },
  md: { heightToken: '--field-height-md', height: '32px', pyFormula: '(field-height-md - 1lh) / 2', labelFont: 'text-body leading-compact', labelSize: '14px', labelLh: '1.3', descFont: 'text-caption', descSize: '12px', descLh: '1.3', iconPx: 16, controlPx: 16 },
  lg: { heightToken: '--field-height-lg', height: '36px', pyFormula: '(field-height-lg - 1lh) / 2', labelFont: 'text-body-lg leading-compact', labelSize: '16px', labelLh: '1.3', descFont: 'text-body leading-compact', descSize: '14px', descLh: '1.3', iconPx: 20, controlPx: 20 },
}

const READING_SPECS: Record<SizeKey, SizeSpec> = {
  sm: { heightToken: '--field-height-sm', height: '28px', pyFormula: '(field-height-sm - 1lh) / 2', labelFont: 'text-body', labelSize: '14px', labelLh: '1.5', descFont: 'text-body', descSize: '14px', descLh: '1.5', iconPx: 16, controlPx: 16 },
  md: { heightToken: '--field-height-md', height: '32px', pyFormula: '(field-height-md - 1lh) / 2', labelFont: 'text-body', labelSize: '14px', labelLh: '1.5', descFont: 'text-body', descSize: '14px', descLh: '1.5', iconPx: 16, controlPx: 16 },
  lg: { heightToken: '--field-height-lg', height: '36px', pyFormula: '(field-height-lg - 1lh) / 2', labelFont: 'text-body-lg', labelSize: '16px', labelLh: '1.5', descFont: 'text-body-lg', descSize: '16px', descLh: '1.5', iconPx: 20, controlPx: 20 },
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared UI Components (matching Button anatomy quality)
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
    return <span className={`${s} rounded-sm shrink-0 border border-border`}
      style={{ backgroundImage: 'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0,3px 3px' }} />
  }
  return <span className={`${s} rounded-sm shrink-0 border border-black/10`} style={{ backgroundColor: `var(${value})` }} />
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
    <span className="text-[11px] text-fg-muted font-medium w-[88px] shrink-0 pt-0.5 flex items-center gap-1.5">
      {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
      {label}
    </span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

/** Blueprint zone colors */
const Z = {
  pad:     { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  icon:    { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  gap:     { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  label:   { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  dim:     { text: '#d04040' },
  suffix:  { bg: 'rgba(253,186,186,0.5)', border: 'rgba(210,80,80,0.7)', text: '#a03030' },
}

const BpZone = ({ w, color, label, sub }: { w: number; color: typeof Z.pad; label: string; sub?: string }) => (
  <div className="flex flex-col items-center justify-center shrink-0 gap-0.5"
    style={{ width: w, height: '100%', background: color.bg, borderLeft: `1.5px dashed ${color.border}`, borderRight: `1.5px dashed ${color.border}` }}>
    <span className="text-[11px] font-mono font-bold leading-none" style={{ color: color.text }}>{label}</span>
    {sub && <span className="text-[9px] font-mono leading-none opacity-70" style={{ color: color.text }}>{sub}</span>}
  </div>
)

/** Menu container */
const MenuFrame = ({ children, width = 320 }: { children: React.ReactNode; width?: number }) => (
  <div
    className="rounded-lg bg-surface-raised border border-border overflow-hidden py-2"
    style={{ width, boxShadow: 'var(--elevation-200)' }}
  >
    {children}
  </div>
)

/** Avatar placeholder */
const AvatarImg = ({ bg = '#e0e7ff' }: { bg?: string }) => (
  <div
    className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-medium"
    style={{ backgroundColor: bg }}
  >
    <User size={12} className="text-fg-muted" />
  </div>
)

/* ═══════════════════════════════════════════════════════════════════════════
   1. 總覽 + 檢閱器
   ═══════════════════════════════════════════════════════════════════════════ */

const InspectorInner = () => {
  const [size, setSize] = useState<SizeKey>('md')
  const [mode, setMode] = useState<ModeKey>('scanning')
  const [hasPrefix, setHasPrefix] = useState(true)
  const [hasDescription, setHasDescription] = useState(true)
  const [hasSuffix, setHasSuffix] = useState(false)
  const [prefixType, setPrefixType] = useState<PrefixType>('icon')

  const spec = mode === 'scanning' ? SCANNING_SPECS[size] : READING_SPECS[size]
  const isBlockAlign = prefixType === 'avatar' && hasDescription && mode === 'scanning'
  const hRef = isBlockAlign
    ? `h-[calc(1lh+2px+desc_1lh)]`
    : 'h-[1lh]'
  const hRefDesc = isBlockAlign
    ? 'prefix > 24px, block align'
    : 'prefix <= 24px, inline align'

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
            <Tab active={mode === 'scanning'} onClick={() => setMode('scanning')}>scanning</Tab>
            <Tab active={mode === 'reading'} onClick={() => setMode('reading')}>reading</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">hasPrefix</span>
          <div className="flex gap-1.5">
            <Tab active={hasPrefix} onClick={() => setHasPrefix(true)}>on</Tab>
            <Tab active={!hasPrefix} onClick={() => setHasPrefix(false)}>off</Tab>
          </div>
        </div>
        {hasPrefix && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-fg-muted w-20 shrink-0">prefixType</span>
            <div className="flex gap-1.5">
              <Tab active={prefixType === 'icon'} onClick={() => setPrefixType('icon')}>icon</Tab>
              <Tab active={prefixType === 'avatar'} onClick={() => setPrefixType('avatar')}>avatar</Tab>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">hasDescription</span>
          <div className="flex gap-1.5">
            <Tab active={hasDescription} onClick={() => setHasDescription(true)}>on</Tab>
            <Tab active={!hasDescription} onClick={() => setHasDescription(false)}>off</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">hasSuffix</span>
          <div className="flex gap-1.5">
            <Tab active={hasSuffix} onClick={() => setHasSuffix(true)}>on</Tab>
            <Tab active={!hasSuffix} onClick={() => setHasSuffix(false)}>off</Tab>
          </div>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[380px]">
          {/* Live preview */}
          <div className="px-6 py-6 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            {mode === 'scanning' ? (
              <MenuFrame width={340}>
                <SelectMenuItem
                  size={size}
                  startIcon={hasPrefix && prefixType === 'icon' ? Mail : undefined}
                  avatar={hasPrefix && prefixType === 'avatar' ? <AvatarImg /> : undefined}
                  description={hasDescription ? '每日寄送摘要信件' : undefined}
                  tag={hasSuffix ? <Tag size={size} variant="blue">Pro</Tag> : undefined}
                >
                  電子郵件通知
                </SelectMenuItem>
              </MenuFrame>
            ) : (
              <div className="w-[340px]">
                <SelectionItem
                  size={size}
                  control={<Checkbox size={size} checked={true} />}
                  label="電子郵件通知"
                  description={hasDescription ? '每日寄送摘要信件到您的電子信箱' : undefined}
                />
              </div>
            )}
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              {[
                { c: Z.pad, l: 'Padding' },
                { c: Z.icon, l: 'Prefix' },
                { c: Z.gap, l: 'Gap' },
                { c: Z.label, l: 'Content' },
                ...(hasSuffix ? [{ c: Z.suffix, l: 'Suffix' }] : []),
              ].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>

            {/* Blueprint diagram */}
            <div className="flex items-center">
              <div className="flex items-stretch rounded-md overflow-hidden" style={{ height: hasDescription ? 64 : 52, outline: `2px solid ${Z.dim.text}22` }}>
                {mode === 'scanning' && (
                  <BpZone w={44} color={Z.pad} label="px-3" sub="12px" />
                )}
                {hasPrefix && (
                  <>
                    <BpZone w={44} color={Z.icon} label={`${spec.iconPx}px`} sub={prefixType === 'icon' ? 'icon' : 'avatar'} />
                    <BpZone w={32} color={Z.gap} label="gap-2" sub="8px" />
                  </>
                )}
                <div className="flex flex-col items-center justify-center shrink-0 gap-0.5"
                  style={{ width: hasDescription ? 100 : 80, height: '100%', background: Z.label.bg, borderLeft: `1.5px dashed ${Z.label.border}`, borderRight: `1.5px dashed ${Z.label.border}` }}>
                  <span className="text-[11px] font-mono font-bold leading-none" style={{ color: Z.label.text }}>Label</span>
                  <span className="text-[9px] font-mono leading-none opacity-70" style={{ color: Z.label.text }}>{spec.labelFont}</span>
                  {hasDescription && (
                    <>
                      <span className="text-[8px] font-mono leading-none opacity-50 mt-0.5" style={{ color: Z.gap.text }}>mt-0.5 (2px)</span>
                      <span className="text-[9px] font-mono leading-none opacity-70" style={{ color: Z.label.text }}>desc: {spec.descFont}</span>
                    </>
                  )}
                </div>
                {hasSuffix && (
                  <>
                    <div className="flex items-center justify-center shrink-0"
                      style={{ width: 40, height: '100%', background: 'transparent' }}>
                      <span className="text-[9px] font-mono text-fg-muted">ml-auto</span>
                    </div>
                    <BpZone w={44} color={Z.suffix} label="suffix" sub="h-ref" />
                  </>
                )}
                {mode === 'scanning' && (
                  <BpZone w={44} color={Z.pad} label="px-3" sub="12px" />
                )}
              </div>
              {/* Height annotation */}
              <div className="ml-3 flex items-center" style={{ height: hasDescription ? 64 : 52 }}>
                <svg width="10" height={hasDescription ? 64 : 52} className="shrink-0">
                  <line x1="5" y1="2" x2="5" y2={hasDescription ? 62 : 50} stroke={Z.dim.text} strokeWidth="1" />
                  <line x1="1" y1="2" x2="9" y2="2" stroke={Z.dim.text} strokeWidth="1.5" />
                  <line x1="1" y1={hasDescription ? 62 : 50} x2="9" y2={hasDescription ? 62 : 50} stroke={Z.dim.text} strokeWidth="1.5" />
                </svg>
                <div className="ml-1.5">
                  <TkVal token={spec.heightToken} value={`${spec.height} (single-line)`} />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-fg-muted">寬度為示意比例，實際由內容決定。多行時 padding 不變，高度自然撐開。</p>
          </div>
        </div>

        {/* Right: inspect panel */}
        <div className="w-[320px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="高度 (single)" dot={Z.dim.text}><TkVal token={spec.heightToken} value={spec.height} /></PropRow>
            <PropRow label="padding-y" dot={Z.pad.text}><TkVal token={`calc(${spec.pyFormula})`} /></PropRow>
            {mode === 'scanning' && (
              <PropRow label="padding-x" dot={Z.pad.text}><TkVal token="px-3" value="12px" /></PropRow>
            )}
            <PropRow label="prefix-content" dot={Z.gap.text}><TkVal token="gap-2" value="8px" /></PropRow>
            {hasDescription && (
              <PropRow label="label-desc" dot={Z.gap.text}><TkVal token="mt-0.5" value="2px" /></PropRow>
            )}
            {hasSuffix && (
              <PropRow label="suffix gap"><TkVal token="ml-auto" value="pushed right" /></PropRow>
            )}
            <PropRow label="Icon 尺寸" dot={Z.icon.text}>{spec.iconPx}px</PropRow>
          </div>

          {/* TYPOGRAPHY */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Typography</span></div>
            <PropRow label="Label 字體"><TkVal token={spec.labelFont} value={spec.labelSize} /></PropRow>
            <PropRow label="Label 行高"><TkVal token={mode === 'scanning' ? 'leading-compact' : 'default'} value={spec.labelLh} /></PropRow>
            {hasDescription && (
              <>
                <PropRow label="Desc 字體"><TkVal token={spec.descFont} value={spec.descSize} /></PropRow>
                <PropRow label="Desc 顏色">
                  <span className="inline-flex items-center gap-2"><Swatch value="--fg-secondary" /><span>fg-secondary</span></span>
                </PropRow>
              </>
            )}
          </div>

          {/* ALIGNMENT */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Alignment</span></div>
            <PropRow label="外層"><TkVal token="flex items-start" /></PropRow>
            <PropRow label="h-ref"><TkVal token={hRef} value={hRefDesc} /></PropRow>
            <PropRow label="閾值"><TkVal token="24px" value="prefix > 24px triggers block align" /></PropRow>
            {hasSuffix && (
              <PropRow label="suffix h-ref"><TkVal token={hRef} value="shares prefix h-ref" /></PropRow>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Overview = {
  name: '1. 總覽 + 檢閱器',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <H3>Item Layout 檢閱器</H3>
        <Desc>
          所有「prefix + content + suffix」結構的元件共用此佈局邏輯。選擇任意組合，即時查看所有 token。
          目前套用的元件：SelectMenuItem（掃描模式）、SelectionItem（閱讀模式）。
        </Desc>
      </div>
      <InspectorInner />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. 對齊模式 — 24px 閾值
   ═══════════════════════════════════════════════════════════════════════════ */

export const AlignmentThreshold = {
  name: '2. 對齊模式',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Prefix 對齊——24px 閾值</H3>
        <Desc>
          prefix 內容物 &le; 24px 時，容器 h-[1lh] 對齊第一行 label 垂直中心（inline）。
          prefix 內容物 &gt; 24px 時，容器 h-[calc(1lh+2px+desc_1lh)] 對齊 label + description 文字塊（block）。
          Suffix 永遠跟 prefix 使用相同的 h-ref。
        </Desc>
      </div>

      {/* Inline mode: icon <= 24px */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: Z.icon.bg, border: `1px dashed ${Z.icon.border}` }} />
          <span className="text-caption font-medium text-fg-secondary">Inline 對齊 — prefix &le; 24px（icon 16/20px）</span>
        </div>

        <div className="flex gap-8 items-start">
          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-stretch rounded-md overflow-hidden" style={{ height: 60, outline: `2px solid ${Z.dim.text}22` }}>
              <div className="flex flex-col items-center justify-center shrink-0 gap-0.5"
                style={{ width: 60, height: '100%', background: Z.icon.bg, borderRight: `1.5px dashed ${Z.icon.border}` }}>
                <span className="text-[11px] font-mono font-bold leading-none" style={{ color: Z.icon.text }}>prefix</span>
                <span className="text-[9px] font-mono leading-none opacity-70" style={{ color: Z.icon.text }}>h-[1lh]</span>
              </div>
              <BpZone w={32} color={Z.gap} label="gap-2" sub="8px" />
              <div className="flex flex-col items-start justify-center shrink-0 px-3"
                style={{ width: 100, height: '100%', background: Z.label.bg, borderRight: `1.5px dashed ${Z.label.border}` }}>
                <span className="text-[11px] font-mono font-bold leading-none" style={{ color: Z.label.text }}>Label</span>
                <span className="text-[8px] font-mono leading-none opacity-50 mt-1" style={{ color: Z.gap.text }}>mt-0.5</span>
                <span className="text-[10px] font-mono leading-none opacity-70 mt-0.5" style={{ color: Z.label.text }}>description</span>
              </div>
            </div>
            <span className="text-[10px] text-fg-muted font-mono">prefix center = label 第一行中心</span>
          </div>

          {/* Live example */}
          <MenuFrame width={320}>
            <SelectMenuItem size="md" startIcon={Mail} description="每日寄送摘要信件">
              電子郵件通知
            </SelectMenuItem>
            <SelectMenuItem size="md" startIcon={Bell} description="瀏覽器推送即時通知">
              推送通知
            </SelectMenuItem>
          </MenuFrame>
        </div>
      </div>

      {/* Block mode: avatar > 24px */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: Z.suffix.bg, border: `1px dashed ${Z.suffix.border}` }} />
          <span className="text-caption font-medium text-fg-secondary">Block 對齊 — prefix &gt; 24px（avatar 32/40px）</span>
        </div>

        <div className="flex gap-8 items-start">
          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-stretch rounded-md overflow-hidden" style={{ height: 60, outline: `2px solid ${Z.dim.text}22` }}>
              <div className="flex flex-col items-center justify-center shrink-0 gap-0.5"
                style={{ width: 60, height: '100%', background: Z.icon.bg, borderRight: `1.5px dashed ${Z.icon.border}` }}>
                <span className="text-[11px] font-mono font-bold leading-none" style={{ color: Z.icon.text }}>prefix</span>
                <span className="text-[8px] font-mono leading-none opacity-70" style={{ color: Z.icon.text }}>h-[calc(</span>
                <span className="text-[8px] font-mono leading-none opacity-70" style={{ color: Z.icon.text }}>1lh+2px+desc)]</span>
              </div>
              <BpZone w={32} color={Z.gap} label="gap-2" sub="8px" />
              <div className="flex flex-col items-start justify-center shrink-0 px-3"
                style={{ width: 100, height: '100%', background: Z.label.bg, borderRight: `1.5px dashed ${Z.label.border}` }}>
                <span className="text-[11px] font-mono font-bold leading-none" style={{ color: Z.label.text }}>Label</span>
                <span className="text-[8px] font-mono leading-none opacity-50 mt-1" style={{ color: Z.gap.text }}>mt-0.5</span>
                <span className="text-[10px] font-mono leading-none opacity-70 mt-0.5" style={{ color: Z.label.text }}>description</span>
              </div>
            </div>
            <span className="text-[10px] text-fg-muted font-mono">prefix center = label+desc 文字塊中心</span>
          </div>

          {/* Live example */}
          <MenuFrame width={320}>
            <SelectMenuItem size="md" avatar={<AvatarImg bg="#e0e7ff" />} description="Design team lead">
              Alice Chen
            </SelectMenuItem>
            <SelectMenuItem size="md" avatar={<AvatarImg bg="#fde68a" />} description="Backend engineer">
              Bob Wang
            </SelectMenuItem>
          </MenuFrame>
        </div>
      </div>

      {/* Suffix alignment symmetry */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Suffix 與 prefix 使用相同 h-ref</span>
        <div className="flex gap-8 items-start">
          <MenuFrame width={380}>
            <SelectMenuItem size="md" startIcon={Mail} description="每日摘要" tag={<Tag size="md" variant="blue">Pro</Tag>}>
              電子郵件通知
            </SelectMenuItem>
            <SelectMenuItem size="md" startIcon={Bell} tag={<Tag size="md" variant="green">Free</Tag>}>
              推送通知
            </SelectMenuItem>
          </MenuFrame>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-fg-muted font-mono">有 desc: prefix h-ref = suffix h-ref = h-[1lh]</span>
            <span className="text-[10px] text-fg-muted font-mono">icon (16px) &le; 24px, always inline</span>
          </div>
        </div>
      </div>

      {/* Token table */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead><tr><Th>條件</Th><Th>h-ref</Th><Th>對齊目標</Th><Th>適用場景</Th></tr></thead>
          <tbody>
            <tr>
              <Td>prefix &le; 24px</Td>
              <Td mono>h-[1lh]</Td>
              <Td>第一行 label 垂直中心</Td>
              <Td>icon (16/20px), checkbox (16/20px)</Td>
            </tr>
            <tr>
              <Td>prefix &gt; 24px + 有 desc</Td>
              <Td mono>h-[calc(1lh+2px+desc_1lh)]</Td>
              <Td>label + gap + desc 文字塊中心</Td>
              <Td>avatar (32/40px) with description</Td>
            </tr>
            <tr>
              <Td>無 description</Td>
              <Td mono>h-[1lh]</Td>
              <Td>強制 inline</Td>
              <Td>prefix 上限 24px</Td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 兩種閱讀模式
   ═══════════════════════════════════════════════════════════════════════════ */

export const ReadingModes = {
  name: '3. 兩種閱讀模式',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Scanning vs Reading — Typography 策略</H3>
        <Desc>
          同一套佈局公式，typography 策略根據閱讀模式調整。「使用者會仔細讀，還是一掃而過？」決定行高、字體降級、和 gap 策略。
        </Desc>
      </div>

      {/* Side-by-side comparison */}
      <div className="flex gap-8 items-start">
        {/* Scanning */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-foreground">Scanning（掃描模式）</span>
            <span className="text-[11px] text-fg-muted">浮層 / overlay —— SelectMenuItem, ComboboxItem</span>
          </div>
          {SIZES.map((sz) => (
            <div key={sz} className="flex items-start gap-3">
              <span className="text-[11px] text-fg-muted w-6 shrink-0 pt-1 font-mono">{sz}</span>
              <MenuFrame width={280}>
                <SelectMenuItem size={sz} startIcon={Mail} description="每日寄送摘要信件">
                  電子郵件通知
                </SelectMenuItem>
              </MenuFrame>
            </div>
          ))}
          <div className="mt-1 text-[10px] text-fg-muted font-mono space-y-0.5">
            <p>leading-compact (1.3)</p>
            <p>desc 字體降一級 + fg-secondary</p>
            <p>mt-0.5 (2px) 分隔</p>
          </div>
        </div>

        {/* Reading */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-foreground">Reading（閱讀模式）</span>
            <span className="text-[11px] text-fg-muted">頁面 / 表單 —— SelectionItem (Checkbox/Radio)</span>
          </div>
          {SIZES.map((sz) => (
            <div key={sz} className="flex items-start gap-3">
              <span className="text-[11px] text-fg-muted w-6 shrink-0 pt-1 font-mono">{sz}</span>
              <div className="w-[280px]">
                <SelectionItem
                  size={sz}
                  control={<Checkbox size={sz} checked={true} />}
                  label="電子郵件通知"
                  description="每日寄送摘要信件到您的電子信箱"
                />
              </div>
            </div>
          ))}
          <div className="mt-1 text-[10px] text-fg-muted font-mono space-y-0.5">
            <p>default line-height (1.5)</p>
            <p>desc 同字體 + fg-secondary（僅顏色區分）</p>
            <p>mt-0.5 (2px) 分隔</p>
          </div>
        </div>
      </div>

      {/* Token comparison table */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Typography Token 對照表</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead>
              <tr>
                <Th>Size</Th>
                <Th>掃描 — Label</Th>
                <Th>掃描 — Desc</Th>
                <Th>閱讀 — Label</Th>
                <Th>閱讀 — Desc</Th>
                <Th>Label-Desc Gap</Th>
              </tr>
            </thead>
            <tbody>
              {SIZES.map((sz) => {
                const sc = SCANNING_SPECS[sz]
                const rd = READING_SPECS[sz]
                return (
                  <tr key={sz}>
                    <Td mono>{sz}</Td>
                    <Td><TkVal token={sc.labelFont} value={`${sc.labelSize}, lh ${sc.labelLh}`} /></Td>
                    <Td><TkVal token={sc.descFont} value={`${sc.descSize}, lh ${sc.descLh}`} /></Td>
                    <Td><TkVal token={rd.labelFont} value={`${rd.labelSize}, lh ${rd.labelLh}`} /></Td>
                    <Td><TkVal token={rd.descFont} value={`${rd.descSize}, lh ${rd.descLh}`} /></Td>
                    <Td mono>mt-0.5 (2px)</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Padding formula table */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Padding 公式 — py = (field-height - 1lh) / 2</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr><Th>Size</Th><Th>field-height token</Th><Th>height (md density)</Th><Th>py formula (Tailwind)</Th></tr></thead>
            <tbody>
              {SIZES.map((sz) => {
                const spec = SCANNING_SPECS[sz]
                return (
                  <tr key={sz}>
                    <Td mono>{sz}</Td>
                    <Td mono>{spec.heightToken}</Td>
                    <Td mono>{spec.height}</Td>
                    <Td mono>py-[calc(({spec.heightToken}-1lh)/2)]</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-fg-muted">
          單行時 item 總高度 = field-height。多行時 padding 不變，高度自然撐開。density 切換時 field-height 自動調整。
        </p>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. Icon 色彩原則
   ═══════════════════════════════════════════════════════════════════════════ */

export const IconColors = {
  name: '4. Icon 色彩原則',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Icon 色彩原則</H3>
        <Desc>
          一條統一規則：icon 代表 label 或 label 的類別 → 與 label 同色（foreground）。
          icon 純粹指示方向/展開/導覽 → fg-muted（neutral-7）。
        </Desc>
      </div>

      {/* Color rule table with swatches */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">色彩判斷規則</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr><Th>判斷</Th><Th>顏色</Th><Th>Token</Th><Th>範例</Th></tr></thead>
            <tbody>
              <tr>
                <Td>代表內容/類別</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Swatch value="--foreground" />
                    <span className="font-mono">foreground</span>
                  </span>
                </Td>
                <Td mono>text color inherited</Td>
                <Td>Mail, Settings, Star</Td>
              </tr>
              <tr>
                <Td>代表危險操作</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Swatch value="--error" />
                    <span className="font-mono">error</span>
                  </span>
                </Td>
                <Td mono>text-error</Td>
                <Td>Trash2 + 紅色「刪除」</Td>
              </tr>
              <tr>
                <Td>指示方向/展開</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Swatch value="--fg-muted" />
                    <span className="font-mono">fg-muted</span>
                  </span>
                </Td>
                <Td mono>text-fg-muted</Td>
                <Td>ChevronRight, ChevronDown, ExternalLink</Td>
              </tr>
              <tr>
                <Td>disabled</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Swatch value="--fg-disabled" />
                    <span className="font-mono">fg-disabled</span>
                  </span>
                </Td>
                <Td mono>text-fg-disabled</Td>
                <Td>全部統一</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Applied to components */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">套用到各元件位置</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr><Th>元件</Th><Th>位置</Th><Th>判斷</Th><Th>顏色</Th></tr></thead>
            <tbody>
              {[
                { comp: 'Menu Item prefix icon', pos: '左側', reason: '代表 item 內容', color: '--foreground', label: 'foreground' },
                { comp: 'Menu Item suffix icon', pos: '右側', reason: '指示方向', color: '--fg-muted', label: 'fg-muted' },
                { comp: 'Menu Item suffix value', pos: '右側', reason: '反映子選單狀態', color: '--fg-muted', label: 'fg-muted' },
                { comp: 'Field startIcon', pos: '左側', reason: '指示 field 用途', color: '--fg-muted', label: 'fg-muted' },
                { comp: 'Field ChevronDown', pos: '右側', reason: '指示可下拉', color: '--fg-muted', label: 'fg-muted' },
                { comp: 'Field value icon', pos: '左側', reason: '代表目前 value 類別', color: '--foreground', label: 'foreground' },
              ].map(({ comp, pos, reason, color, label }) => (
                <tr key={comp}>
                  <Td>{comp}</Td>
                  <Td>{pos}</Td>
                  <Td>{reason}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <Swatch value={color} size="sm" />
                      <span className="font-mono">{label}</span>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live examples */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">視覺參考</span>
        <div className="flex gap-8 items-start">
          {/* Prefix icons: foreground (no fg-muted!) */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted">Prefix icon = foreground（代表內容）</span>
            <MenuFrame width={260}>
              <SelectMenuItem size="md" startIcon={Mail}>電子郵件</SelectMenuItem>
              <SelectMenuItem size="md" startIcon={Settings}>設定</SelectMenuItem>
              <SelectMenuItem size="md" startIcon={Star}>收藏</SelectMenuItem>
            </MenuFrame>
          </div>

          {/* Suffix indicators: fg-muted */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted">Suffix indicator = fg-muted（指示方向）</span>
            <MenuFrame width={260}>
              <SelectMenuItem
                size="md"
                startIcon={Globe}
                endContent={
                  <div className="h-[1lh] flex items-center gap-1 ml-auto">
                    <span className="text-body text-fg-muted">English</span>
                    <ChevronRight size={16} className="text-fg-muted" />
                  </div>
                }
              >
                語言
              </SelectMenuItem>
              <SelectMenuItem
                size="md"
                startIcon={Lock}
                endContent={
                  <div className="h-[1lh] flex items-center ml-auto">
                    <ChevronRight size={16} className="text-fg-muted" />
                  </div>
                }
              >
                隱私設定
              </SelectMenuItem>
            </MenuFrame>
          </div>

          {/* Danger: prefix same color as label */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted">危險操作 = 與 label 同色（text-error）</span>
            <MenuFrame width={260}>
              <SelectMenuItem size="md" startIcon={Trash2} className="text-error">
                刪除專案
              </SelectMenuItem>
            </MenuFrame>
          </div>
        </div>
      </div>

      {/* Suffix value text rule */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Suffix value 文字</span>
        <div className="flex items-start gap-6">
          <MenuFrame width={300}>
            <SelectMenuItem
              size="md"
              startIcon={Globe}
              endContent={
                <div className="h-[1lh] flex items-center gap-1 ml-auto">
                  <span className="text-body text-fg-muted">Dark</span>
                  <ChevronRight size={16} className="text-fg-muted" />
                </div>
              }
            >
              佈景主題
            </SelectMenuItem>
          </MenuFrame>
          <div className="flex flex-col gap-1 text-[10px] text-fg-muted font-mono">
            <p>suffix value 字體大小 = label 字體大小</p>
            <p>suffix value 顏色 = fg-muted</p>
            <p>只有顏色不同，不降字體級</p>
          </div>
        </div>
      </div>
    </div>
  ),
}

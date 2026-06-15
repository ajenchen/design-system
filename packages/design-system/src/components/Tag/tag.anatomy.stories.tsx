// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-rationale:
//   StateBehavior covered by ColorMatrix「Dismiss 按鈕色彩」段(default /
//     hover / active × subtle / solid 兩模式)。Tag 本身是非互動展示元件
//     ——沒有 hover / focus / active state(對齊 Material Chip / Ant Tag 慣例),
//     唯一 interactive 部位是 onRemove button,其狀態色彩集中於 ColorMatrix 比拆 5. 直觀。
import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { Hash } from 'lucide-react'
import { Tag } from './tag'
import {
  CATEGORICAL_HUES,
  CAT_SUBTLE_TOKENS,
  CAT_SOLID_TOKENS,
  type CategoricalColor,
  type CategoricalHue,
} from '@/design-system/tokens/categorical-color'

const meta: Meta = {
  title: 'Design System/Components/Tag/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type VariantKey = CategoricalColor // 'neutral' + 12 categorical 色相
type SizeKey = 'sm' | 'md' | 'lg'
type ColorSpec = { bg: string; text: string; border: string }
type SolidSpec = 'subtle' | 'solid'

// neutral + 全 12 色相(順序對齊 SSOT CATEGORICAL_HUES,1:1 對 primitives.css / color token 列)
const VARIANTS: VariantKey[] = ['neutral', ...CATEGORICAL_HUES]
const SIZES: SizeKey[] = ['sm', 'md', 'lg']

// **TOKEN_MAP 由 categorical-color SSOT 機械衍生**(strip `var()` 取顯示用 token 名),
// 確保 anatomy 文件表永遠與 cva 真實消費的 token 1:1,零未來漂移(M17 + 2026-06-04 SSOT 重構)。
const stripVar = (s: string) => s.replace(/^var\(/, '').replace(/\)$/, '')
const hueSpec = (m: Record<CategoricalHue, { bg: string; text: string }>) =>
  Object.fromEntries(
    CATEGORICAL_HUES.map((h) => [h, { bg: stripVar(m[h].bg), text: stripVar(m[h].text), border: 'transparent' }]),
  ) as Record<CategoricalHue, ColorSpec>

const TOKEN_MAP: Record<SolidSpec, Record<VariantKey, ColorSpec>> = {
  subtle: {
    neutral: { bg: '--secondary', text: '--foreground', border: 'transparent' },
    ...hueSpec(CAT_SUBTLE_TOKENS),
  },
  solid: {
    neutral: { bg: '--color-neutral-9', text: '--inverse-fg', border: 'transparent' },
    ...hueSpec(CAT_SOLID_TOKENS),
  },
}

// categorical 色相描述(裝飾性分類,非語意狀態)。2026-06-04 修:移除「red=錯誤/危險」等
// 語意框架(red = 品牌紅 hue 25,跟語意 --error〔= deep-orange〕無關),改純色相 + primitive 指向。
const VARIANT_DESC: Record<VariantKey, string> = {
  neutral:       '通用分類、草稿、無特定語義(secondary 底)',
  blue:          'categorical 色相（--color-blue-*）',
  green:         'categorical 色相（--color-green-*）',
  'deep-orange': 'categorical 色相（--color-deep-orange-*，hue 38）',
  yellow:        'categorical 色相（--color-yellow-*，淺底深字）',
  red:           'categorical 色相（--color-red-*，品牌紅家族 hue 25；≠ 語意 --error）',
  orange:        'categorical 色相（--color-orange-*）',
  amber:         'categorical 色相（--color-amber-*，淺底深字）',
  lime:          'categorical 色相（--color-lime-*）',
  turquoise:     'categorical 色相（--color-turquoise-*）',
  indigo:        'categorical 色相（--color-indigo-*）',
  purple:        'categorical 色相（--color-purple-*）',
  magenta:       'categorical 色相（--color-magenta-*）',
}

interface SizeSpec {
  height: string
  tagPx: string; tagPxVal: number
  textPx: string; textPxVal: number
  fontToken: string; font: string
  weightToken: string; weight: string
  icon: number
}

const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  sm: { height: '20px', tagPx: 'px-1', tagPxVal: 4, textPx: 'px-1', textPxVal: 4, fontToken: 'text-caption',  font: '12px', weightToken: 'font-medium', weight: '500', icon: 16 },
  md: { height: '24px', tagPx: 'px-1', tagPxVal: 4, textPx: 'px-1', textPxVal: 4, fontToken: 'text-body',    font: '14px', weightToken: 'font-normal', weight: '400', icon: 16 },
  lg: { height: '24px', tagPx: 'px-1', tagPxVal: 4, textPx: 'px-1', textPxVal: 4, fontToken: 'text-body',    font: '14px', weightToken: 'font-normal', weight: '400', icon: 16 },
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
    <span className="text-[11px] text-fg-secondary font-medium w-[72px] shrink-0 pt-0.5 flex items-center gap-1.5">
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
  pad:     { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  icon:    { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  textPx:  { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  label:   { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  dismiss: { bg: 'rgba(245,166,166,0.6)', border: 'rgba(210,80,80,0.9)',  text: '#9f2d2d' },
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
      {/* Anatomy */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）</H3>
          <Desc>Inline label，用於分類標籤、狀態標記、多選已選值。icon 與 avatar 互斥，onRemove 自動渲染 remove 按鈕。</Desc>
        </div>
        <div className="flex gap-8">
          {/* Text only */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-secondary font-medium">純文字</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-1">
              {[{ name: 'label', color: 'success' }].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color}-text)` }}>{s.name}</span>
              ))}
            </div>
          </div>
          {/* With icon + dismiss */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-secondary font-medium">icon + dismiss</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-1">
              {[{ name: 'icon', color: 'info' }, { name: 'icon', color: 'success' }, { name: 'icon', color: 'error' }].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color}-text)` }}>{s.name}</span>
              ))}
            </div>
          </div>
          {/* With avatar */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-secondary font-medium">avatar</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2.5 gap-1">
              {[{ name: 'avatar', color: 'warning' }, { name: 'avatar', color: 'success' }].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color}-text)` }}>{s.name}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="text-[10px] text-fg-muted font-mono">
          內部結構：[tag-px] [icon? | avatar?] [text-px TEXT text-px] [dismiss?] [tag-px]
        </div>
      </div>

      {/* Variant catalog */}
      <div className="flex flex-col gap-3">
        <H3>Variant 一覽</H3>
        <Desc>以色名命名（色名即色相），語義由消費端內容與上下文決定。13 色（neutral + 12 categorical 色相）皆直接消費 primitive token（{'`--color-{hue}-*`'}），不對應語義 token。</Desc>
        <div className="flex flex-col gap-2">
          {VARIANTS.map((v) => (
            <div key={v} className="flex items-center gap-4">
              <div className="w-28 shrink-0"><Tag color={v}>Design</Tag></div>
              <span className="text-caption text-fg-secondary">{VARIANT_DESC[v]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Props table */}
      <div className="flex flex-col gap-3">
        <H3>Props</H3>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tag 變體對照表(可橫向捲動)">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['color', "'neutral'|'blue'|'green'|'deep-orange'|'yellow'|'red'|'orange'|'amber'|'lime'|'turquoise'|'indigo'|'purple'|'magenta'", "'neutral'", '色相 variant，語義由消費端內容決定（13 色 = neutral + 12 categorical 色相）'],
                ['size', "'sm'|'md'|'lg'", "'md'", '尺寸（lg = md alias，子元件補齊原則）'],
                ['icon', 'LucideIcon', '—', '左側 icon，統一 16px。與 avatar 互斥'],
                ['avatar', 'ReactNode', '—', '左側 avatar（16px 圓形）。與 icon 互斥'],
                ['onRemove', '() => void', '—', '可移除——Tag 自動渲染 remove 按鈕'],
                ['solid', 'boolean', 'false', '深底配對前景模式（step-6 背景；yellow/amber/orange/lime 用深字，其餘白字）'],
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
  const [variant, setVariant] = useState<VariantKey>('neutral')
  const [size, setSize] = useState<SizeKey>('md')
  const [withIcon, setWithIcon] = useState(false)
  const [withDismiss, setWithDismiss] = useState(false)
  const [solid, setSolid] = useState(false)

  const colors = TOKEN_MAP[solid ? 'solid' : 'subtle'][variant]
  const s = SIZE_SPECS[size]

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Variant</span>
          <div className="flex flex-wrap gap-1.5">
            {VARIANTS.map((v) => <Tab key={v} active={variant === v} onClick={() => setVariant(v)}>{v}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Size</span>
          <div className="flex gap-1.5">
            {SIZES.map((sz) => <Tab key={sz} active={size === sz} onClick={() => setSize(sz)}>{sz}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Icon</span>
          <div className="flex gap-1.5">
            <Tab active={!withIcon} onClick={() => setWithIcon(false)}>off</Tab>
            <Tab active={withIcon} onClick={() => setWithIcon(true)}>on</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Dismiss</span>
          <div className="flex gap-1.5">
            <Tab active={!withDismiss} onClick={() => setWithDismiss(false)}>off</Tab>
            <Tab active={withDismiss} onClick={() => setWithDismiss(true)}>on</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-secondary w-16 shrink-0">Solid</span>
          <div className="flex gap-1.5">
            <Tab active={!solid} onClick={() => setSolid(false)}>off</Tab>
            <Tab active={solid} onClick={() => setSolid(true)}>on</Tab>
          </div>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[340px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <Tag
              color={variant}
              size={size}
              icon={withIcon ? Hash : undefined}
              onRemove={withDismiss ? () => {} : undefined}
              solid={solid}
            >
              Label
            </Tag>
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              {[
                { c: Z.pad, l: 'Tag 內距' },
                ...(withIcon ? [{ c: Z.icon, l: 'Icon' }] : []),
                { c: Z.textPx, l: 'Text 內距' },
                { c: Z.label, l: 'Label' },
                ...(withDismiss ? [{ c: Z.dismiss, l: 'Dismiss' }] : []),
              ].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center">
              <div className="flex items-center rounded-md overflow-hidden" style={{ height: 48, outline: `2px solid ${Z.dim.text}22` }}>
                <BpZone w={28} color={Z.pad} label="px-1" sub={`${s.tagPxVal}px`} />
                {withIcon && <BpZone w={40} color={Z.icon} label={`${s.icon}px`} sub="icon" />}
                <BpZone w={28} color={Z.textPx} label="px-1" sub={`${s.textPxVal}px`} />
                <BpZone w={48} color={Z.label} label="Label" sub={s.fontToken} />
                <BpZone w={28} color={Z.textPx} label="px-1" sub={`${s.textPxVal}px`} />
                {withDismiss && <BpZone w={40} color={Z.dismiss} label="16px" sub="dismiss" />}
                <BpZone w={28} color={Z.pad} label="px-1" sub={`${s.tagPxVal}px`} />
              </div>
              <div className="ml-3 flex items-center" style={{ height: 48 }}>
                <svg width="10" height="48" className="shrink-0">
                  <line x1="5" y1="2" x2="5" y2="46" stroke={Z.dim.text} strokeWidth="1" />
                  <line x1="1" y1="2" x2="9" y2="2" stroke={Z.dim.text} strokeWidth="1.5" />
                  <line x1="1" y1="46" x2="9" y2="46" stroke={Z.dim.text} strokeWidth="1.5" />
                </svg>
                <div className="ml-1.5"><TkVal token={size === 'sm' ? 'h-5' : 'h-6'} value={s.height} /></div>
              </div>
            </div>
            <p className="text-[10px] text-fg-muted">寬度為示意比例，實際由內容決定。不用 gap——text padding 自然拉開 icon/dismiss 間距。</p>
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
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="高度" dot={Z.dim.text}><TkVal token={size === 'sm' ? 'h-5' : 'h-6'} value={s.height} /></PropRow>
            <PropRow label="Tag 內距" dot={Z.pad.text}><TkVal token={s.tagPx} value={`${s.tagPxVal}px`} /></PropRow>
            <PropRow label="Text 內距" dot={Z.textPx.text}><TkVal token={s.textPx} value={`${s.textPxVal}px`} /></PropRow>
            <PropRow label="Max Width"><TkVal token="min(var(--combobox-tag-area-inline-size, 10rem), 10rem)" value="預設 cap 160px（Combobox 窄格可注入更小有效上限）" /></PropRow>
            <PropRow label="Icon 尺寸" dot={Z.icon.text}>16px（統一不分 size）</PropRow>
            {withDismiss && <PropRow label="Dismiss" dot={Z.dismiss.text}>16px icon · 18px hover 背景</PropRow>}
          </div>

          {/* TYPOGRAPHY */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Typography</span></div>
            <PropRow label="Font"><TkVal token={s.fontToken} value={s.font} /></PropRow>
            <PropRow label="Weight"><TkVal token={s.weightToken} value={s.weight} /></PropRow>
          </div>

          {/* STYLE */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span></div>
            <PropRow label="Radius"><TkVal token="rounded-md" value="4px" /></PropRow>
            <PropRow label="Border"><TkVal token="border-transparent" value="1px solid transparent" /></PropRow>
            <PropRow label="Truncate"><TkVal token="truncate" value="超過寬度上限（預設 160px）截斷 + tooltip" /></PropRow>
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
        <Desc>選擇任意組合，即時查看所有 token。開發只需確認 token 正確——theme 的值解析由系統處理。</Desc>
      </div>
      <InspectorInner />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 色彩對照表 — Variant Token Matrix
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Variant 色彩對照</H3>
        <Desc>
          Tag 無 hover/active 狀態（非互動元件），只有單一色彩組合。Subtle 模式有色 variant 文字用 --color-&#123;hue&#125;-7 primitive（step-7，不隨 dark mode 反轉），neutral 用 foreground。Solid 模式 step-6 背景 + on-emphasis 配對文字:夠深的 hue 用白字（--on-emphasis），亮色 hue（yellow/amber/orange/lime）用深字（--on-emphasis-dark），green 維持白字（documented exception）。色塊即時渲染，切 dark mode 自動更新。
        </Desc>
      </div>

      {/* Subtle */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-fg-secondary">Subtle（預設）</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <Th>Variant</Th>
                <Th>預覽</Th>
                <Th>背景 (bg)</Th>
                <Th>文字 (text)</Th>
              </tr>
            </thead>
            <tbody>
              {VARIANTS.map((v) => {
                const c = TOKEN_MAP.subtle[v]
                return (
                  <tr key={v}>
                    <td className="p-3 border-b border-divider font-mono text-caption font-medium align-middle">{v}</td>
                    <td className="p-3 border-b border-divider align-middle">
                      <Tag color={v} icon={Hash}>Frontend</Tag>
                    </td>
                    <td className="p-3 border-b border-divider align-middle">
                      <span className="inline-flex items-center gap-1.5 text-[11px]">
                        <Swatch value={c.bg} />
                        <span className="font-mono text-fg-secondary">{c.bg}</span>
                      </span>
                    </td>
                    <td className="p-3 border-b border-divider align-middle">
                      <span className="inline-flex items-center gap-1.5 text-[11px]">
                        <Swatch value={c.text} />
                        <span className="font-mono text-fg-secondary">{c.text}</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Solid */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-fg-secondary">Solid</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <Th>Variant</Th>
                <Th>預覽</Th>
                <Th>背景 (bg)</Th>
                <Th>文字 (text)</Th>
              </tr>
            </thead>
            <tbody>
              {VARIANTS.map((v) => {
                const c = TOKEN_MAP.solid[v]
                return (
                  <tr key={v}>
                    <td className="p-3 border-b border-divider font-mono text-caption font-medium align-middle">{v}</td>
                    <td className="p-3 border-b border-divider align-middle">
                      <Tag color={v} icon={Hash} solid>Bug</Tag>
                    </td>
                    <td className="p-3 border-b border-divider align-middle">
                      <span className="inline-flex items-center gap-1.5 text-[11px]">
                        <Swatch value={c.bg} />
                        <span className="font-mono text-fg-secondary">{c.bg}</span>
                      </span>
                    </td>
                    <td className="p-3 border-b border-divider align-middle">
                      <span className="inline-flex items-center gap-1.5 text-[11px]">
                        <span className="font-mono text-fg-secondary">{c.text}</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dismiss action colors */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-fg-secondary">Dismiss 按鈕色彩</span>
        <Desc>Subtle 模式使用 neutral-hover/active。Solid 模式使用色相自身的 primitive hover/active token——深色底上 neutral-hover 幾乎不可見。</Desc>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr><Th>模式</Th><Th>狀態</Th><Th>Icon 色</Th><Th>Hover 背景</Th></tr></thead>
            <tbody>
              {[
                { mode: 'Subtle', state: 'default', iconColor: '繼承 Tag 文字色', hoverBg: 'transparent' },
                { mode: '', state: 'hover', iconColor: '繼承 Tag 文字色', hoverBg: '--neutral-hover' },
                { mode: '', state: 'active', iconColor: '繼承 Tag 文字色', hoverBg: '--neutral-active' },
                { mode: 'Solid', state: 'default', iconColor: '繼承 Tag 文字色', hoverBg: 'transparent' },
                { mode: '', state: 'hover', iconColor: '繼承 Tag 文字色', hoverBg: '--{hue}-hover（如 --blue-hover）· neutral: --inverse-neutral-hover' },
                { mode: '', state: 'active', iconColor: '繼承 Tag 文字色', hoverBg: '--{hue}-active（如 --blue-active）· neutral: --inverse-neutral-active' },
              ].map(({ mode, state, iconColor, hoverBg }, i) => (
                <tr key={i}>
                  {mode ? <td className="p-2 border-b border-divider align-top text-caption font-mono font-medium" rowSpan={3}>{mode}</td> : null}
                  <Td mono>{state}</Td>
                  <Td>
                    <span className="font-mono text-fg-secondary text-[11px]">{iconColor}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-fg-secondary text-[11px]">{hoverBg}</span>
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
        <Desc>三種尺寸（子元件補齊原則）：sm 配 field sm，md 配 field md，lg = md alias 配 field lg。Tag 尺寸不引用 field-height token——兩者獨立。</Desc>
      </div>

      {/* Token comparison table */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead><tr>
            <Th>屬性</Th>
            {SIZES.map((sz) => <Th key={sz}>{sz}{sz === 'md' ? '（預設）' : sz === 'lg' ? '（= md alias）' : ''}</Th>)}
          </tr></thead>
          <tbody>
            {([
              { label: '高度', tokenKey: undefined as string | undefined, valFn: (s: SizeSpec, sz: SizeKey) => ({ token: sz === 'sm' ? 'h-5' : 'h-6', value: s.height }) },
              { label: 'Tag 內距', tokenKey: 'tagPx', valFn: (s: SizeSpec) => ({ token: s.tagPx, value: `${s.tagPxVal}px` }) },
              { label: 'Text 內距', tokenKey: 'textPx', valFn: (s: SizeSpec) => ({ token: s.textPx, value: `${s.textPxVal}px` }) },
              { label: '字體', tokenKey: undefined, valFn: (s: SizeSpec) => ({ token: s.fontToken, value: s.font }) },
              { label: '字重', tokenKey: undefined, valFn: (s: SizeSpec) => ({ token: s.weightToken, value: s.weight }) },
              { label: 'Icon', tokenKey: undefined, valFn: (s: SizeSpec) => ({ token: `${s.icon}px`, value: '統一不分 size' }) },
            ]).map((row) => (
              <tr key={row.label}>
                <Td>{row.label}</Td>
                {SIZES.map((sz) => {
                  const spec = SIZE_SPECS[sz]
                  const { token, value } = row.valFn(spec, sz)
                  return (
                    <Td key={sz} mono>
                      <div className="text-fg-secondary">{token}</div>
                      {value && <div className="text-fg-muted text-[10px]">{value}</div>}
                    </Td>
                  )
                })}
              </tr>
            ))}
            {/* Dismiss specs */}
            <tr>
              <Td>Dismiss hover 背景</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">18px</div>
                  <div className="text-fg-muted text-[10px]">呼吸空間 {sz === 'sm' ? '1px' : '3px'}</div>
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
              {SIZES.map((sz) => <Th key={`icon-${sz}`}>{sz} + icon</Th>)}
              {SIZES.map((sz) => <Th key={`dismiss-${sz}`}>{sz} + dismiss</Th>)}
            </tr></thead>
            <tbody>
              {(['neutral', 'blue', 'green', 'red', 'purple'] as VariantKey[]).map((v) => (
                <tr key={v}>
                  <Td mono>{v}</Td>
                  {SIZES.map((sz) => (
                    <Td key={sz}><Tag color={v} size={sz}>Done</Tag></Td>
                  ))}
                  {SIZES.map((sz) => (
                    <Td key={`icon-${sz}`}><Tag color={v} size={sz} icon={Hash}>API</Tag></Td>
                  ))}
                  {SIZES.map((sz) => (
                    <Td key={`dismiss-${sz}`}><Tag color={v} size={sz} onRemove={() => {}}>Review</Tag></Td>
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
      <p className="whitespace-pre-line">{"靜態 Tag(無 onRemove)為純視覺呈現,無 keyboard / ARIA role / focus state;包進互動容器(Button / Card / Link)時 a11y 由容器決定。傳 onRemove 時 Tag 渲染原生 remove button(aria-label「移除 {label}」):Tab 可聚焦、Enter/Space 觸發移除、focus-visible 帶 outline ring(詳 spec「A11y 預設」)。"}</p>
    </div>
  ),
}

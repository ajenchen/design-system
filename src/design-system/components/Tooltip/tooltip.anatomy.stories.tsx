// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-rationale:
//   ColorMatrix N/A — Tooltip 色彩固定(--tooltip bg + white text,內部 wrapper
//     強制 data-theme="dark"),無 variant × state 色彩矩陣。所有色彩 token 已
//     於 Inspector「Token Details」面板列出。
//   SizeMatrix N/A — Tooltip 不提供 size prop;尺寸固定 text-body(14px)+
//     px-3 py-2 + max-w-[280px],對齊 Polaris / Material / Atlassian「tooltip
//     是 micro UI、不縮放」共識。
//   StateBehavior represented as PlacementReference + Inspector — Tooltip 無
//     hover / focus / active(自身就是 hover affordance);實際行為差異在
//     placement(top / right / bottom / left + 動畫方向)由 PlacementReference(3.)
//     涵蓋,warm-up timing 由 Overview 段落涵蓋。
import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { Info, Settings } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'
import { Button } from '../Button/button'

const meta: Meta = {
  title: 'Design System/Components/Tooltip/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Shared UI Components

   NOTE: Kept local (not imported from `_anatomy/anatomy-utils`) because the
   Button-family inspector layout diverges visually from the canonical helpers:
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

/* Zone colors for blueprint */
const Z = {
  pad:     { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  content: { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  gap:     { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  trigger: { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  dim:     { text: '#d04040' },
}

const BpZone = ({ w, h, color, label, sub }: { w: number; h?: number; color: typeof Z.pad; label: string; sub?: string }) => (
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
          <Desc>Tooltip 由三個部分組成：觸發器（Trigger）、浮動內容區（Content）、以及連接兩者的間距（sideOffset）。Content 內有 data-theme="dark" wrapper，子元素自動適配深色背景。</Desc>
        </div>
        <div className="flex gap-8 items-start">
          {/* Anatomy diagram */}
          <div className="flex flex-col items-center gap-0">
            {/* Content */}
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md px-3 py-2">
              {[
                { name: 'Content', color: 'info' },
              ].map((s) => (
                <span key={s.name} className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                  style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>
              ))}
            </div>
            {/* sideOffset */}
            <div className="flex flex-col items-center py-1">
              <span className="text-[10px] font-mono text-fg-muted">sideOffset 8px</span>
              <div className="w-px h-3 bg-divider" />
            </div>
            {/* Trigger */}
            <div className="inline-flex items-center border-2 border-dashed rounded-md px-3 py-2"
              style={{ borderColor: 'var(--success)' }}>
              <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>Trigger</span>
            </div>
            <span className="text-[10px] text-fg-muted font-mono mt-1">asChild — 套用至子元件</span>
          </div>

          {/* Live example */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">Live 範例</span>
            <Tooltip defaultOpen>
              <TooltipTrigger asChild>
                <Button variant="secondary" startIcon={Info} size="sm">滑鼠移上</Button>
              </TooltipTrigger>
              <TooltipContent side="top">這是一個 Tooltip</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Composition parts */}
      <div className="flex flex-col gap-3">
        <H3>組合零件</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>零件</Th><Th>元素</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['TooltipProvider', '<TooltipPrimitive.Provider>', '全域 Provider，控制 warm-up delay 參數（全產品一個）'],
                ['Tooltip', '<TooltipPrimitive.Root>', '單一 tooltip 實例的容器'],
                ['TooltipTrigger', '<TooltipPrimitive.Trigger>', '觸發器，搭配 asChild 套用至任意子元素'],
                ['TooltipContent', '<TooltipPrimitive.Content>', '浮動內容區，透過 Portal 渲染'],
              ].map(([part, el, desc]) => (
                <tr key={part}><Td mono>{part}</Td><Td mono>{el}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Props */}
      <div className="flex flex-col gap-3">
        <H3>Props（TooltipContent）</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['side', "'top'|'right'|'bottom'|'left'", "'top'", '浮動方向'],
                ['sideOffset', 'number', '8', '與觸發器的間距（px）'],
                ['align', "'start'|'center'|'end'", "'center'", '沿 side 軸的對齊'],
                ['className', 'string', '—', '額外 CSS class'],
                ['children', 'ReactNode', '—', '提示文字內容'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warm-up pattern */}
      <div className="flex flex-col gap-3">
        <H3>Warm-up Pattern（暖機模式）</H3>
        <Desc>全產品統一一組時間參數，由 TooltipProvider 控制。不因 tooltip 類型或位置而異。</Desc>
        <div className="flex flex-col gap-1.5 text-caption max-w-[600px]">
          <div className="flex items-start gap-2 py-1.5 border-b border-divider">
            <span className="text-fg-muted w-5 shrink-0 font-mono">1.</span>
            <span>首次 hover → 等待 <span className="font-mono text-fg-secondary">delayDuration={500}</span><span className="text-fg-muted"> (500ms)</span>，確認是刻意停留</span>
          </div>
          <div className="flex items-start gap-2 py-1.5 border-b border-divider">
            <span className="text-fg-muted w-5 shrink-0 font-mono">2.</span>
            <span>出現後移到下一個觸發器 → 在 <span className="font-mono text-fg-secondary">skipDelayDuration={300}</span><span className="text-fg-muted"> (300ms)</span> 窗口內即時切換</span>
          </div>
          <div className="flex items-start gap-2 py-1.5 border-b border-divider">
            <span className="text-fg-muted w-5 shrink-0 font-mono">3.</span>
            <span>離開所有觸發器超過 300ms → 冷卻，下次 hover 重新等待 500ms</span>
          </div>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. 元件檢閱器
   ═══════════════════════════════════════════════════════════════════════════ */

type SideKey = 'top' | 'right' | 'bottom' | 'left'

const InspectorInner = () => {
  const [side, setSide] = useState<SideKey>('top')

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Side</span>
          <div className="flex gap-1.5">
            {(['top', 'right', 'bottom', 'left'] as const).map((s) => (
              <Tab key={s} active={side === s} onClick={() => setSide(s)}>{s}</Tab>
            ))}
          </div>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-8 items-start">
        {/* Left: live preview */}
        <div className="flex flex-col gap-5 min-w-[340px]">
          <div className="px-16 py-16 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <Tooltip defaultOpen>
              <TooltipTrigger asChild>
                <Button variant="secondary" startIcon={Settings} size="sm">觸發器</Button>
              </TooltipTrigger>
              <TooltipContent side={side}>提示文字</TooltipContent>
            </Tooltip>
          </div>

          {/* Blueprint: Content internal structure */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted font-medium">Content 內部結構</span>
            <div className="flex items-center gap-4 text-[10px]">
              {[{ c: Z.pad, l: '水平內距' }, { c: Z.content, l: '文字' }, { c: Z.gap, l: '垂直內距' }].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center">
              <div className="flex items-center rounded-md overflow-hidden" style={{ height: 44, outline: `2px solid ${Z.dim.text}22` }}>
                <BpZone w={44} color={Z.pad} label="px-3" sub="12px" />
                <BpZone w={80} color={Z.content} label="text-body" sub="14px" />
                <BpZone w={44} color={Z.pad} label="px-3" sub="12px" />
              </div>
              <div className="ml-3 flex items-center" style={{ height: 44 }}>
                <svg width="10" height="44" className="shrink-0">
                  <line x1="5" y1="2" x2="5" y2="42" stroke={Z.dim.text} strokeWidth="1" />
                  <line x1="1" y1="2" x2="9" y2="2" stroke={Z.dim.text} strokeWidth="1.5" />
                  <line x1="1" y1="42" x2="9" y2="42" stroke={Z.dim.text} strokeWidth="1.5" />
                </svg>
                <div className="ml-1.5"><TkVal token="py-2" value="8px top + 8px bottom" /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: token panel */}
        <div className="flex flex-col gap-0 min-w-[260px] border border-divider rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-surface-raised border-b border-divider">
            <span className="text-[12px] font-semibold text-fg-secondary">Token Details</span>
          </div>

          <div className="px-3 py-1">
            <PropRow label="bg" dot="var(--tooltip)">
              <span className="inline-flex items-center gap-2">
                <Swatch value="--tooltip" />
                <span>--tooltip</span>
              </span>
              <div className="text-[10px] text-fg-muted mt-0.5">light: --color-neutral-9-opaque</div>
              <div className="text-[10px] text-fg-muted">dark: --color-neutral-5-opaque</div>
            </PropRow>
            <PropRow label="text">
              <span>white (text-white)</span>
            </PropRow>
            <PropRow label="font">
              <TkVal token="text-body" value="14px / font-normal" />
            </PropRow>
            <PropRow label="padding-x">
              <TkVal token="px-3" value="12px" />
            </PropRow>
            <PropRow label="padding-y">
              <TkVal token="py-2" value="8px" />
            </PropRow>
            <PropRow label="radius">
              <TkVal token="rounded-md" value="4px (--radius-md)" />
            </PropRow>
            <PropRow label="max-width">
              <TkVal token="max-w-[280px]" value="280px" />
            </PropRow>
            <PropRow label="sideOffset">
              <TkVal token="sideOffset={8}" value="8px" />
            </PropRow>
            <PropRow label="shadow">
              <TkVal token="--elevation-200" />
            </PropRow>
            <PropRow label="z-index">
              <TkVal token="z-50" value="50" />
            </PropRow>
            <PropRow label="theme">
              <span>data-theme="dark" (inner wrapper)</span>
            </PropRow>
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
        <Desc>切換方向查看 tooltip 的 placement。右側面板列出所有 design token 及其對應值。</Desc>
      </div>
      <InspectorInner />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 方向與間距
   ═══════════════════════════════════════════════════════════════════════════ */

export const PlacementReference = {
  name: '方向與間距',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>四方向 Placement</H3>
        <Desc>side 決定浮動方向，sideOffset 控制與觸發器的間距。Radix 自動處理碰撞偵測——空間不足時翻轉到對面。</Desc>
      </div>

      <div className="grid grid-cols-2 gap-6 max-w-[600px]">
        {(['top', 'right', 'bottom', 'left'] as const).map((s) => (
          <div key={s} className="flex flex-col gap-2 items-start">
            <span className="text-[11px] font-mono text-fg-muted font-medium">side="{s}"</span>
            <div className="px-8 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center w-full">
              <Tooltip defaultOpen>
                <TooltipTrigger asChild>
                  <Button variant="tertiary" size="sm">{s}</Button>
                </TooltipTrigger>
                <TooltipContent side={s}>提示文字</TooltipContent>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>

      {/* Animation */}
      <div className="flex flex-col gap-3">
        <H3>動畫</H3>
        <Desc>Content 使用 Tailwind animate utilities，根據 side 從對應方向滑入。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Side</Th><Th>進場動畫</Th><Th>出場動畫</Th></tr></thead>
            <tbody>
              {[
                ['top', 'slide-in-from-bottom-2', 'fade-out + zoom-out-95'],
                ['right', 'slide-in-from-left-2', 'fade-out + zoom-out-95'],
                ['bottom', 'slide-in-from-top-2', 'fade-out + zoom-out-95'],
                ['left', 'slide-in-from-right-2', 'fade-out + zoom-out-95'],
              ].map(([side, enter, exit]) => (
                <tr key={side}><Td mono>{side}</Td><Td mono>{enter}</Td><Td mono>{exit}</Td></tr>
              ))}
              <tr><Td mono>共通</Td><Td mono>fade-in-0 + zoom-in-95</Td><Td mono>fade-out-0 + zoom-out-95</Td></tr>
            </tbody>
          </table>
        </div>
        <Desc>transform-origin 使用 --radix-tooltip-content-transform-origin，zoom 效果從觸發器方向展開。</Desc>
      </div>
    </div>
  ),
}

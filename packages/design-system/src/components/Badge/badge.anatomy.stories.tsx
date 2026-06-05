// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   StateBehavior N/A — Badge 是純展示元件(無互動),無 hover / focus / active /
//     disabled。唯一行為層 logic 是 max overflow(99+),已由 SizeMatrix 與 Inspector
//     涵蓋。
import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { Badge } from './badge'

const meta: Meta = {
  title: 'Design System/Components/Badge/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type VariantKey = 'critical' | 'high' | 'medium' | 'low'
type ModeKey = 'count' | 'dot'

const VARIANTS: VariantKey[] = ['critical', 'high', 'medium', 'low']

type ColorSpec = { bg: string; text: string }

const TOKEN_MAP: Record<VariantKey, ColorSpec> = {
  critical: { bg: '--notification', text: 'white' },
  high:     { bg: '--info',         text: 'white' },
  medium:   { bg: '--info-subtle',  text: '--info-text' },
  low:      { bg: '--secondary',    text: '--fg-muted' },
}

const VARIANT_DESC: Record<VariantKey, string> = {
  critical: '需要立即處理——未讀訊息、錯誤計數',
  high:     '重要但不緊急——新功能、待辦事項',
  medium:   '參考資訊——更新數量、評論計數',
  low:      '被動計數——總數、已完成數量',
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
   Blueprint helpers
   ═══════════════════════════════════════════════════════════════════════════ */

const Z = {
  pad:   { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
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
          <Desc>Badge 有兩種模式：Count（數字膠囊）與 Dot（純色圓點）。Count 模式個位數為正圓，多位數自動展開為膠囊。</Desc>
        </div>
        <div className="flex gap-8">
          {/* Count mode */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">Count 模式</span>
            <div className="flex gap-4">
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-full px-3 py-2">
                  <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                    style={{ borderColor: 'var(--info)', backgroundColor: 'var(--info-subtle)', color: 'var(--info)' }}>count</span>
                </div>
                <span className="text-[10px] text-fg-muted font-mono">個位數 → 正圓</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-full px-3 py-2 gap-1">
                  <span className="rounded px-1 py-1 text-[11px] font-mono border border-dashed"
                    style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>px</span>
                  <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                    style={{ borderColor: 'var(--info)', backgroundColor: 'var(--info-subtle)', color: 'var(--info)' }}>count</span>
                  <span className="rounded px-1 py-1 text-[11px] font-mono border border-dashed"
                    style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-subtle)', color: 'var(--success)' }}>px</span>
                </div>
                <span className="text-[10px] text-fg-muted font-mono">多位數 → 膠囊</span>
              </div>
            </div>
          </div>
          {/* Dot mode */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">Dot 模式</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-full p-3">
              <span className="rounded px-2 py-1 text-[11px] font-mono border border-dashed"
                style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-subtle)', color: 'var(--warning)' }}>dot</span>
            </div>
            <span className="text-[10px] text-fg-muted font-mono">6×6px · 無文字</span>
          </div>
        </div>
      </div>

      {/* Variant catalog */}
      <div className="flex flex-col gap-3">
        <H3>Variant 一覽</H3>
        <div className="flex flex-col gap-2">
          {VARIANTS.map((v) => (
            <div key={v} className="flex items-center gap-4">
              <div className="w-16 shrink-0 flex justify-center"><Badge count={3} variant={v} /></div>
              <span className="font-mono text-caption text-fg-secondary w-14 shrink-0">{v}</span>
              <span className="text-caption text-fg-secondary">{VARIANT_DESC[v]}</span>
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
                ['variant', "'low'|'medium'|'high'|'critical'", "'low'", '緊急程度層級（default low, escalate with reason）'],
                ['dot', 'boolean', 'false', '6×6px 純色圓點模式，無文字'],
                ['count', 'number', '—', '顯示的數量（dot 模式下忽略）'],
                ['max', 'number', '—', '數量上限，超過時顯示 "max+"'],
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
  const [variant, setVariant] = useState<VariantKey>('low')
  const [mode, setMode] = useState<ModeKey>('count')
  const [count, setCount] = useState(3)

  const colors = TOKEN_MAP[variant]
  const isDot = mode === 'dot'
  const isMultiDigit = count >= 10

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Variant</span>
          <div className="flex flex-wrap gap-1.5">
            {(isDot ? VARIANTS.filter((v) => v === 'critical' || v === 'high') : VARIANTS).map((v) => <Tab key={v} active={variant === v} onClick={() => setVariant(v)}>{v}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Mode</span>
          <div className="flex gap-1.5">
            <Tab active={mode === 'count'} onClick={() => setMode('count')}>count</Tab>
            <Tab active={mode === 'dot'} onClick={() => { setMode('dot'); if (variant !== 'critical' && variant !== 'high') setVariant('critical') }}>dot</Tab>
          </div>
        </div>
        {!isDot && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-fg-muted w-16 shrink-0">Count</span>
            <div className="flex gap-1.5">
              {[1, 5, 12, 99, 150].map((n) => <Tab key={n} active={count === n} onClick={() => setCount(n)}>{n}</Tab>)}
            </div>
          </div>
        )}
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[280px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            {isDot
              ? <Badge dot variant={variant === 'high' ? 'high' : 'critical'} />
              : <Badge count={count} variant={variant} max={count > 99 ? 99 : undefined} />
            }
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            {isDot ? (
              /* Dot blueprint */
              <div className="flex items-center">
                <div className="flex items-center justify-center rounded-full overflow-hidden"
                  style={{ width: 40, height: 40, background: Z.dim.text + '15', border: `2px solid ${Z.dim.text}22` }}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[11px] font-mono font-bold" style={{ color: Z.dim.text }}>6px</span>
                    <span className="text-[9px] font-mono opacity-70" style={{ color: Z.dim.text }}>dot</span>
                  </div>
                </div>
                <div className="ml-3 flex flex-col gap-0.5">
                  <TkVal token="w-1.5 h-1.5" value="6×6px" />
                  <span className="font-mono text-[10px] text-fg-muted">rounded-full · 無文字</span>
                </div>
              </div>
            ) : (
              /* Count blueprint */
              <>
                <div className="flex items-center gap-4 text-[10px]">
                  {[{ c: Z.pad, l: '左右內距' }, { c: Z.label, l: 'Count 文字' }].map(({ c, l }) => (
                    <span key={l} className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                      <span className="font-medium" style={{ color: c.text }}>{l}</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center">
                  <div className="flex items-center rounded-full overflow-hidden" style={{ height: 40, outline: `2px solid ${Z.dim.text}22` }}>
                    {isMultiDigit && <BpZone w={32} color={Z.pad} label="px-1" sub="4px" />}
                    <BpZone w={isMultiDigit ? 44 : 40} color={Z.label} label={String(count > 99 ? '99+' : count)} sub="text-[10px]" />
                    {isMultiDigit && <BpZone w={32} color={Z.pad} label="px-1" sub="4px" />}
                  </div>
                  <div className="ml-3 flex items-center" style={{ height: 40 }}>
                    <svg width="10" height="40" className="shrink-0">
                      <line x1="5" y1="2" x2="5" y2="38" stroke={Z.dim.text} strokeWidth="1" />
                      <line x1="1" y1="2" x2="9" y2="2" stroke={Z.dim.text} strokeWidth="1.5" />
                      <line x1="1" y1="38" x2="9" y2="38" stroke={Z.dim.text} strokeWidth="1.5" />
                    </svg>
                    <div className="ml-1.5"><TkVal token="h-4" value="16px" /></div>
                  </div>
                </div>
                <p className="text-[10px] text-fg-muted">
                  {isMultiDigit
                    ? '多位數：px-1 左右 padding → 膠囊形'
                    : '個位數：min-w-4 = 寬高 16px → 正圓'
                  }
                </p>
              </>
            )}
          </div>
        </div>

        {/* Right: inspect panel */}
        <div className="w-[280px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          {/* COLOR */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span></div>
            <PropRow label="Fill"><TokenValue value={colors.bg} /></PropRow>
            {!isDot && <PropRow label="Text"><TokenValue value={colors.text} /></PropRow>}
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            {isDot ? (
              <>
                <PropRow label="尺寸"><TkVal token="w-1.5 h-1.5" value="6×6px" /></PropRow>
              </>
            ) : (
              <>
                <PropRow label="高度" dot={Z.dim.text}><TkVal token="h-4" value="16px" /></PropRow>
                <PropRow label="最小寬度"><TkVal token="min-w-4" value="16px" /></PropRow>
                <PropRow label="左右內距" dot={Z.pad.text}><TkVal token="px-1" value="4px" /></PropRow>
              </>
            )}
          </div>

          {/* TYPOGRAPHY */}
          {!isDot && (
            <div className="px-4 py-1">
              <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Typography</span></div>
              <PropRow label="Font"><TkVal token="text-[10px]" value="10px" /></PropRow>
              <PropRow label="Weight"><TkVal token="font-medium" value="500" /></PropRow>
              <PropRow label="Line-h"><TkVal token="leading-none" value="1" /></PropRow>
            </div>
          )}

          {/* STYLE */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span></div>
            <PropRow label="Radius"><TkVal token="rounded-full" value="9999px" /></PropRow>
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
        <Desc>選擇 variant 與模式，即時查看所有 token。色塊即時渲染，切 dark mode 自動更新。</Desc>
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
        <H3>Variant 色彩對照</H3>
        <Desc>Badge 沒有互動狀態，每個 variant 只有一組色彩。色塊即時渲染，切 dark mode 自動更新。</Desc>
      </div>

      {/* Count mode */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Count 模式</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>Variant</Th><Th>預覽</Th><Th>Fill</Th><Th>Text</Th></tr></thead>
            <tbody>
              {VARIANTS.map((v) => {
                const c = TOKEN_MAP[v]
                return (
                  <tr key={v}>
                    <td className="p-3 border-b border-divider font-mono text-caption font-medium align-middle">{v}</td>
                    <td className="p-3 border-b border-divider align-middle">
                      <div className="flex items-center gap-2">
                        <Badge count={3} variant={v} />
                        <Badge count={42} variant={v} />
                        <Badge count={150} variant={v} max={99} />
                      </div>
                    </td>
                    <td className="p-3 border-b border-divider align-middle">
                      <span className="inline-flex items-center gap-1.5">
                        <Swatch value={c.bg} />
                        <span className="font-mono text-[12px] text-fg-secondary">{c.bg}</span>
                      </span>
                    </td>
                    <td className="p-3 border-b border-divider align-middle">
                      <span className="inline-flex items-center gap-1.5">
                        <Swatch value={c.text} />
                        <span className="font-mono text-[12px] text-fg-secondary">{c.text}</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dot mode */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Dot 模式</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead><tr><Th>Variant</Th><Th>預覽</Th><Th>Fill</Th></tr></thead>
            <tbody>
              {VARIANTS.map((v) => {
                const c = TOKEN_MAP[v]
                return (
                  <tr key={v}>
                    <td className="p-3 border-b border-divider font-mono text-caption font-medium align-middle">{v}</td>
                    <td className="p-3 border-b border-divider align-middle">
                      {(v === 'critical' || v === 'high') ? <Badge dot variant={v} /> : <span className="text-fg-muted text-caption">—</span>}
                    </td>
                    <td className="p-3 border-b border-divider align-middle">
                      {(v === 'critical' || v === 'high') ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Swatch value={c.bg} />
                          <span className="font-mono text-[12px] text-fg-secondary">{c.bg}</span>
                        </span>
                      ) : <span className="text-fg-muted text-caption">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Button pairing guidance */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">容器 Contrast floor 對照</span>
        <Desc>容器 bg 決定 badge 的 contrast floor（可見度下限）——badge 至少要到此層級才看得清。Floor 是下限不是上限：semantic 永遠可往上升（floor 以上的所有層級都合法）。critical 的紅白對比在任何底色都清楚，不受 floor 限制。</Desc>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr><Th>容器</Th><Th>Contrast floor（最低層級）</Th></tr></thead>
            <tbody>
              {[
                ['text / tab item / icon button（透明 / 極淺）', 'low'],
                ['secondary / tertiary（淺底帶邊框）', 'low'],
                ['checked（pressed，淺灰 / subtle 底）', 'low / medium'],
                ['primary / secondary+danger（飽和深底）', 'high'],
              ].map(([container, floor]) => (
                <tr key={container}><Td>{container}</Td><Td>{floor}</Td></tr>
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

export const SizeMatrix = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>尺寸 Token 對照</H3>
        <Desc>Badge 只有兩種固定尺寸模式，不隨 density 變化。Count 模式高 16px，Dot 模式 6×6px。</Desc>
      </div>

      {/* Token comparison */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead><tr>
            <Th>屬性</Th>
            <Th>Count 模式</Th>
            <Th>Dot 模式</Th>
          </tr></thead>
          <tbody>
            {[
              { label: '高度', count: { token: 'h-4', value: '16px' }, dot: { token: 'h-1.5', value: '6px' } },
              { label: '寬度', count: { token: 'min-w-4', value: '16px（個位數正圓）' }, dot: { token: 'w-1.5', value: '6px' } },
              { label: '左右內距', count: { token: 'px-1', value: '4px' }, dot: { token: '—', value: '' } },
              { label: '字體', count: { token: 'text-[10px]', value: '10px' }, dot: { token: '—', value: '無文字' } },
              { label: 'Font Weight', count: { token: 'font-medium', value: '500' }, dot: { token: '—', value: '' } },
              { label: 'Line Height', count: { token: 'leading-none', value: '1' }, dot: { token: '—', value: '' } },
              { label: 'Radius', count: { token: 'rounded-full', value: '9999px' }, dot: { token: 'rounded-full', value: '9999px（base rounded-full）' } },
            ].map((row) => (
              <tr key={row.label}>
                <Td>{row.label}</Td>
                <Td mono>
                  {row.count.token !== '—' ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-fg-secondary">{row.count.token}</span>
                      {row.count.value && <span className="text-fg-muted text-[10px]">{row.count.value}</span>}
                    </div>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </Td>
                <Td mono>
                  {row.dot.token !== '—' ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-fg-secondary">{row.dot.token}</span>
                      {row.dot.value && <span className="text-fg-muted text-[10px]">{row.dot.value}</span>}
                    </div>
                  ) : (
                    <span className="text-fg-muted">{row.dot.value || '—'}</span>
                  )}
                </Td>
              </tr>
            ))}
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
              <Th>個位數</Th>
              <Th>多位數</Th>
              <Th>溢出（99+）</Th>
              <Th>Dot</Th>
            </tr></thead>
            <tbody>
              {VARIANTS.map((v) => (
                <tr key={v}>
                  <td className="p-3 border-b border-divider font-mono text-caption font-medium align-middle">{v}</td>
                  <td className="p-3 border-b border-divider align-middle"><Badge count={3} variant={v} /></td>
                  <td className="p-3 border-b border-divider align-middle"><Badge count={42} variant={v} /></td>
                  <td className="p-3 border-b border-divider align-middle"><Badge count={150} variant={v} max={99} /></td>
                  <td className="p-3 border-b border-divider align-middle">{(v === 'critical' || v === 'high') ? <Badge dot variant={v} /> : <span className="text-fg-muted text-caption">—</span>}</td>
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
    <div className="max-w-3xl text-body text-fg-secondary flex flex-col gap-3">
      <h3 className="text-h5 text-foreground mb-1">無障礙設計</h3>
      <p>Badge 不可聚焦、無鍵盤互動（非互動元件），但**不是**完全無語意：元件預設帶 <code className="font-mono text-fg-secondary">role="status"</code>（live region，計數變化可被 screen reader 播報），consumer 可傳 <code className="font-mono text-fg-secondary">role</code> override。</p>
      <ul className="list-disc pl-5 space-y-1 text-caption text-fg-muted">
        <li><span className="font-mono text-fg-secondary">role="status"</span>：元件預設（forwardRef render，consumer 可傳 role override），計數更新時自動播報，不需 consumer 設定。</li>
        <li>Count 模式：數字會被讀出，但需 parent 容器的 <span className="font-mono text-fg-secondary">aria-label</span> 補 context（「通知 (3 則未讀)」）。</li>
        <li>Dot 模式：無文字 → screen reader 看不到 → <span className="font-mono text-fg-secondary">aria-label</span> 為必填。</li>
        <li>色彩不獨立承載語意（color-blind）：level 不能只靠紅 / 藍 / 灰，需搭配 count 數字或 aria-label。</li>
      </ul>
      <p className="text-caption text-fg-muted">完整 aria-label 整合 / dot 必填 / color-blind 反例 demo 見「設計原則」頁的「無障礙必備」story；keyboard / focus 由宿主互動容器（Button / Card / Link）負責。</p>
    </div>
  ),
}

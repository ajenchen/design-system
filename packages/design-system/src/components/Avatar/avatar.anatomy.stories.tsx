// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   StateBehavior 涵蓋 fallback chain(src 失敗 → icon → alt 首字 → User icon)
//   與 status presence dot 四態(online / away / busy / offline),屬資料載入的視覺降級而非互動狀態。
import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { Building2, Folder, Globe } from 'lucide-react'
import { Avatar } from './avatar'
import {
  CATEGORICAL_HUES,
  CAT_SUBTLE_TOKENS,
  CAT_SOLID_TOKENS,
  type CategoricalColor,
  type CategoricalHue,
} from '@/design-system/tokens/categorical-color'

const meta: Meta = {
  title: 'Design System/Components/Avatar/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type ModeKey = 'image' | 'icon' | 'text'
type ShapeKey = 'circle' | 'square'
type ColorKey = CategoricalColor // 'neutral' + 12 categorical 色相

const ALL_COLORS: ColorKey[] = ['neutral', ...CATEGORICAL_HUES]
const PRESET_SIZES = [20, 24, 32, 40] as const

type VariantKey = 'subtle' | 'solid'

// 與 Tag 元件完全對齊：**消費 categorical-color SSOT**(strip `var()` 取顯示用 token 名),
// key X 一律對 `--color-X-*`(1:1,零 offset)。subtle = step-1 底 + step-7 字,solid = step-6 底
// + on-emphasis 配對字(亮 hue yellow/amber/orange/lime → --on-emphasis-dark 深字;green 白字例外)。neutral 非色相,Avatar 用 --muted 自處理。
// 2026-06-04 SSOT 重構後 anatomy 表機械衍生,永遠與 tsx COLOR_MAP 1:1 無漂移(M17)。
const stripVar = (s: string) => s.replace(/^var\(/, '').replace(/\)$/, '')
const hueTokens = (m: Record<CategoricalHue, { bg: string; text: string }>) =>
  Object.fromEntries(
    CATEGORICAL_HUES.map((h) => [h, { bg: stripVar(m[h].bg), text: stripVar(m[h].text) }]),
  ) as Record<CategoricalHue, { bg: string; text: string }>

const COLOR_TOKENS: Record<VariantKey, Record<ColorKey, { bg: string; text: string }>> = {
  subtle: {
    neutral: { bg: '--muted', text: '--foreground' },
    ...hueTokens(CAT_SUBTLE_TOKENS),
  },
  solid: {
    neutral: { bg: '--color-neutral-9', text: '--inverse-fg' },
    ...hueTokens(CAT_SOLID_TOKENS),
  },
}

/** round_even(size * 0.6) */
function getIconSize(size: number): number {
  return Math.round((size * 0.6) / 2) * 2
}

/** round(size * 0.5) */
function getTextSize(size: number): number {
  return Math.round(size * 0.5)
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
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-8">
      {/* Anatomy - Three Modes */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>三種內容模式</H3>
          <Desc>按優先順序決定顯示內容：src → icon → alt 首字。都沒有時顯示預設 User icon。</Desc>
        </div>
        <div className="flex gap-8">
          {([
            { mode: 'Image', desc: '有 src → 圖片填滿容器', el: <Avatar size={48} src="https://i.pravatar.cc/96?u=overview" alt="Alice" /> },
            { mode: 'Icon', desc: '有 icon → Icon 在底色背景', el: <Avatar size={48} icon={Building2} color="blue" /> },
            { mode: 'Text', desc: '有 alt → 首字大寫', el: <Avatar size={48} alt="Bob" color="purple" /> },
          ] as const).map(({ mode, desc, el }) => (
            <div key={mode} className="flex flex-col gap-3 items-center">
              <div className="flex items-center justify-center w-[80px] h-[80px] rounded-lg border-2 border-dashed border-primary/30">
                {el}
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[12px] font-mono font-semibold text-fg-secondary">{mode}</span>
                <span className="text-[10px] text-fg-muted text-center max-w-[140px]">{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Shapes */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>形狀</H3>
          <Desc>circle 用於人物，square 用於實體（專案、組織、App）。判斷標準：代表一個人，還是一個東西？</Desc>
        </div>
        <div className="flex gap-8">
          <div className="flex flex-col items-center gap-2">
            <Avatar size={40} alt="Alice" color="blue" shape="circle" />
            <span className="text-[11px] font-mono text-fg-muted">circle（預設）</span>
            <span className="text-[10px] text-fg-muted">rounded-full</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Avatar size={40} icon={Building2} color="purple" shape="square" />
            <span className="text-[11px] font-mono text-fg-muted">square</span>
            <span className="text-[10px] text-fg-muted">rounded-md (4px)</span>
          </div>
        </div>
      </div>

      {/* Props Table */}
      <div className="flex flex-col gap-3">
        <H3>Props</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['size', "number | 'fill'", '32', '尺寸（px）或 \'fill\'（填滿父容器，icon 60%、text 50cqi）'],
                ['shape', "'circle' | 'square'", "'circle'", '圓形（人物）或方形（實體）'],
                ['src', 'string', '—', '圖片 URL'],
                ['alt', 'string', '—', '替代文字（圖片失敗時取首字作 fallback）'],
                ['icon', 'LucideIcon', '—', 'Icon 模式（與 src/alt 互斥優先）'],
                ['color', 'ColorKey', "'neutral'", 'Icon / Text 模式的背景色'],
                ['solid', 'boolean', 'false', '深底配對前景模式（step-6 背景；yellow/amber/orange/lime 用深字，其餘白字）'],
                ['status', "'online' | 'away' | 'busy' | 'offline'", '—', '在線狀態 dot（presence），顯示在右下角；可與 badgeCount（右上）並存'],
                ['badgeCount', 'number', '—', '未讀 / 通知計數 badge，顯示在右上角（消費 Badge critical，>99 顯示 99+）；可與 status（右下）並存'],
                ['hoverCard', 'ReactNode', '—', 'hover 時彈出的內容（如 ProfileCard），person avatar 預設必帶'],
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

const Z = {
  container: { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  content:   { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  dim:       { text: '#d04040' },
}

const InspectorInner = () => {
  const [mode, setMode] = useState<ModeKey>('icon')
  const [shape, setShape] = useState<ShapeKey>('circle')
  const [size, setSize] = useState(32)
  const [color, setColor] = useState<ColorKey>('blue')
  const [solid, setSolid] = useState(false)

  const iconPx = getIconSize(size)
  const textPx = getTextSize(size)
  const colors = COLOR_TOKENS[solid ? 'solid' : 'subtle'][color]
  const radius = shape === 'circle' ? '9999px (rounded-full)' : '4px (rounded-md)'

  const renderAvatar = () => {
    switch (mode) {
      case 'image': return <Avatar size={size} shape={shape} src="https://i.pravatar.cc/96?u=inspector" alt="User" />
      case 'icon': return <Avatar size={size} shape={shape} icon={Folder} color={color} solid={solid} />
      case 'text': return <Avatar size={size} shape={shape} alt="Alice" color={color} solid={solid} />
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Mode</span>
          <div className="flex gap-1.5">
            {(['image', 'icon', 'text'] as const).map((m) => <Tab key={m} active={mode === m} onClick={() => setMode(m)}>{m}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Shape</span>
          <div className="flex gap-1.5">
            {(['circle', 'square'] as const).map((s) => <Tab key={s} active={shape === s} onClick={() => setShape(s)}>{s}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Size</span>
          <div className="flex gap-1.5">
            {PRESET_SIZES.map((s) => <Tab key={s} active={size === s} onClick={() => setSize(s)}>{s}px</Tab>)}
          </div>
        </div>
        {mode !== 'image' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-fg-muted w-16 shrink-0">Color</span>
            <div className="flex flex-wrap gap-1.5">
              {ALL_COLORS.map((c) => <Tab key={c} active={color === c} onClick={() => setColor(c)}>{c}</Tab>)}
            </div>
          </div>
        )}
        {mode !== 'image' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-fg-muted w-16 shrink-0">Solid</span>
            <div className="flex gap-1.5">
              <Tab active={!solid} onClick={() => setSolid(false)}>off</Tab>
              <Tab active={solid} onClick={() => setSolid(true)}>on</Tab>
            </div>
          </div>
        )}
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview + blueprint */}
        <div className="flex flex-col gap-5 min-w-[280px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            {renderAvatar()}
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              {[{ c: Z.container, l: '容器' }, { c: Z.content, l: '內容' }].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-md" style={{ background: c.bg, border: `1px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center">
              <div className="flex items-center justify-center overflow-hidden"
                style={{
                  width: 72, height: 72,
                  borderRadius: shape === 'circle' ? '50%' : '4px',
                  background: Z.container.bg,
                  border: `2px dashed ${Z.container.border}`,
                }}>
                <div className="flex flex-col items-center justify-center gap-0.5"
                  style={{
                    width: 40, height: 40,
                    borderRadius: '2px',
                    background: Z.content.bg,
                    border: `1.5px dashed ${Z.content.border}`,
                  }}>
                  <span className="text-[11px] font-mono font-bold leading-none" style={{ color: Z.content.text }}>
                    {mode === 'text' ? `${textPx}px` : `${iconPx}px`}
                  </span>
                  <span className="text-[9px] font-mono leading-none opacity-70" style={{ color: Z.content.text }}>
                    {mode === 'text' ? 'font' : 'icon'}
                  </span>
                </div>
              </div>
              <div className="ml-3 flex items-center" style={{ height: 72 }}>
                <svg width="10" height="72" className="shrink-0">
                  <line x1="5" y1="2" x2="5" y2="70" stroke={Z.dim.text} strokeWidth="1" />
                  <line x1="1" y1="2" x2="9" y2="2" stroke={Z.dim.text} strokeWidth="1.5" />
                  <line x1="1" y1="70" x2="9" y2="70" stroke={Z.dim.text} strokeWidth="1.5" />
                </svg>
                <div className="ml-1.5"><TkVal token={`${size}px`} value="width = height" /></div>
              </div>
            </div>
            <p className="text-[10px] text-fg-muted">容器為示意比例，實際尺寸由 size prop 決定</p>
          </div>
        </div>

        {/* Right: inspect panel */}
        <div className="w-[300px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="Size" dot={Z.dim.text}><TkVal token={`${size}px`} value="width = height" /></PropRow>
            <PropRow label="Border Radius"><TkVal token={radius} /></PropRow>
          </div>

          {/* CONTENT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Content</span></div>
            {mode === 'image' ? (
              <PropRow label="Content">圖片填滿（object-cover）</PropRow>
            ) : mode === 'icon' ? (
              <PropRow label="Icon 尺寸" dot={Z.content.text}>
                <TkVal token={`${iconPx}px`} value={`round_even(${size} x 0.6)`} />
              </PropRow>
            ) : (
              <PropRow label="Font Size" dot={Z.content.text}>
                <TkVal token={`${textPx}px`} value={`round(${size} x 0.5)`} />
              </PropRow>
            )}
            {mode === 'text' && (
              <PropRow label="Weight"><TkVal token="font-medium" value="500" /></PropRow>
            )}
          </div>

          {/* COLOR */}
          {mode !== 'image' && (
            <div className="px-4 py-1 pb-3">
              <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span></div>
              <PropRow label="Background"><TokenValue value={colors.bg} /></PropRow>
              <PropRow label="Foreground"><TokenValue value={colors.text} /></PropRow>
            </div>
          )}
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
        <Desc>選擇任意組合，即時查看所有 token 與自動計算值。開發只需設定 size 和 color，內部元素尺寸自動按比例計算。</Desc>
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
        <H3>色彩對照表</H3>
        <Desc>所有 primitive 色的背景 + 前景 token 對照，含 subtle 與 solid 兩種模式。色塊即時渲染，切 dark mode 自動更新。Image 模式不使用背景色。</Desc>
      </div>

      {/* Subtle */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-fg-secondary">Subtle（預設）</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <Th>Color</Th>
                <Th>Icon 模式</Th>
                <Th>Text 模式</Th>
                <Th>背景 token</Th>
                <Th>前景 token</Th>
              </tr>
            </thead>
            <tbody>
              {ALL_COLORS.map((c) => {
                const tokens = COLOR_TOKENS.subtle[c]
                return (
                  <tr key={c}>
                    <Td mono>{c}{c === 'neutral' ? '（預設）' : ''}</Td>
                    <td className="p-3 border-b border-divider">
                      <Avatar size={32} icon={Globe} color={c} />
                    </td>
                    <td className="p-3 border-b border-divider">
                      <Avatar size={32} alt={c.charAt(0).toUpperCase() + c.slice(1)} color={c} />
                    </td>
                    <td className="p-2 border-b border-divider">
                      <span className="inline-flex items-center gap-2">
                        <Swatch value={tokens.bg} />
                        <span className="font-mono text-[12px] text-fg-secondary">{tokens.bg}</span>
                      </span>
                    </td>
                    <td className="p-2 border-b border-divider">
                      <span className="inline-flex items-center gap-2">
                        <Swatch value={tokens.text} />
                        <span className="font-mono text-[12px] text-fg-secondary">{tokens.text}</span>
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
                <Th>Color</Th>
                <Th>Icon 模式</Th>
                <Th>Text 模式</Th>
                <Th>背景 token</Th>
                <Th>前景 token</Th>
              </tr>
            </thead>
            <tbody>
              {ALL_COLORS.map((c) => {
                const tokens = COLOR_TOKENS.solid[c]
                return (
                  <tr key={c}>
                    <Td mono>{c}</Td>
                    <td className="p-3 border-b border-divider">
                      <Avatar size={32} icon={Globe} color={c} solid />
                    </td>
                    <td className="p-3 border-b border-divider">
                      <Avatar size={32} alt={c.charAt(0).toUpperCase() + c.slice(1)} color={c} solid />
                    </td>
                    <td className="p-2 border-b border-divider">
                      <span className="inline-flex items-center gap-2">
                        <Swatch value={tokens.bg} />
                        <span className="font-mono text-[12px] text-fg-secondary">{tokens.bg}</span>
                      </span>
                    </td>
                    <td className="p-2 border-b border-divider">
                      <span className="font-mono text-[12px] text-fg-secondary">{tokens.text}</span>
                    </td>
                  </tr>
                )
              })}
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
        <H3>尺寸對照表</H3>
        <Desc>size 接受任意 px 值，內部 icon 和文字尺寸自動按比例計算。不提供預設尺寸名稱，尺寸由消費元件決定。</Desc>
      </div>

      {/* Token calculation table */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead>
            <tr>
              <Th>屬性</Th>
              {PRESET_SIZES.map((s) => <Th key={s}>{s}px</Th>)}
              <Th>公式</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>容器尺寸</Td>
              {PRESET_SIZES.map((s) => (
                <Td key={s} mono>
                  <div className="text-fg-secondary">{s}px</div>
                  <div className="text-fg-muted text-[10px]">width = height</div>
                </Td>
              ))}
              <Td mono><span className="text-fg-muted text-[10px]">= size</span></Td>
            </tr>
            <tr>
              <Td>Icon 尺寸</Td>
              {PRESET_SIZES.map((s) => {
                const iPx = getIconSize(s)
                return (
                  <Td key={s} mono>
                    <div className="text-fg-secondary">{iPx}px</div>
                    <div className="text-fg-muted text-[10px]">{Math.round(iPx / s * 100)}%</div>
                  </Td>
                )
              })}
              <Td mono><span className="text-fg-muted text-[10px]">round_even(size x 0.6)</span></Td>
            </tr>
            <tr>
              <Td>Text 字體</Td>
              {PRESET_SIZES.map((s) => {
                const tPx = getTextSize(s)
                return (
                  <Td key={s} mono>
                    <div className="text-fg-secondary">{tPx}px</div>
                    <div className="text-fg-muted text-[10px]">{Math.round(tPx / s * 100)}%</div>
                  </Td>
                )
              })}
              <Td mono><span className="text-fg-muted text-[10px]">round(size x 0.5)</span></Td>
            </tr>
            <tr>
              <Td>Border Radius (circle)</Td>
              {PRESET_SIZES.map((s) => (
                <Td key={s} mono><div className="text-fg-secondary">9999px</div></Td>
              ))}
              <Td mono><span className="text-fg-muted text-[10px]">rounded-full</span></Td>
            </tr>
            <tr>
              <Td>Border Radius (square)</Td>
              {PRESET_SIZES.map((s) => (
                <Td key={s} mono><div className="text-fg-secondary">4px</div></Td>
              ))}
              <Td mono><span className="text-fg-muted text-[10px]">rounded-md</span></Td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Visual preview */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <Th>模式</Th>
                {PRESET_SIZES.map((s) => <Th key={s}>{s}px</Th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Image</Td>
                {PRESET_SIZES.map((s) => (
                  <td key={s} className="p-3 border-b border-divider">
                    <Avatar size={s} src={`https://i.pravatar.cc/${s * 2}?u=size-matrix`} alt="User" />
                  </td>
                ))}
              </tr>
              <tr>
                <Td>Icon (circle)</Td>
                {PRESET_SIZES.map((s) => (
                  <td key={s} className="p-3 border-b border-divider">
                    <Avatar size={s} icon={Folder} color="blue" />
                  </td>
                ))}
              </tr>
              <tr>
                <Td>Icon (square)</Td>
                {PRESET_SIZES.map((s) => (
                  <td key={s} className="p-3 border-b border-divider">
                    <Avatar size={s} icon={Building2} color="purple" shape="square" />
                  </td>
                ))}
              </tr>
              <tr>
                <Td>Text (circle)</Td>
                {PRESET_SIZES.map((s) => (
                  <td key={s} className="p-3 border-b border-divider">
                    <Avatar size={s} alt="Alice" color="green" />
                  </td>
                ))}
              </tr>
              <tr>
                <Td>Text (square)</Td>
                {PRESET_SIZES.map((s) => (
                  <td key={s} className="p-3 border-b border-divider">
                    <Avatar size={s} alt="Org" color="magenta" shape="square" />
                  </td>
                ))}
              </tr>
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
        <H3>Fallback chain（src 失敗 → icon → alt → User）</H3>
        <Desc>Avatar 不是互動元件,沒有 hover / focus / active。實際「狀態」是內容降級——src 載入失敗時自動依優先順序往下回退,確保永遠不會出現破圖。</Desc>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead><tr><Th>來源</Th><Th>渲染</Th><Th>條件</Th></tr></thead>
          <tbody>
            <tr>
              <Td mono>src 載入成功</Td>
              <td className="p-3 border-b border-divider"><Avatar size={32} src="https://i.pravatar.cc/64?u=state-ok" alt="Alice" /></td>
              <Td>{'有 src + 載入成功 → 圖片'}</Td>
            </tr>
            <tr>
              <Td mono>src 失敗 → icon</Td>
              <td className="p-3 border-b border-divider"><Avatar size={32} src="https://invalid.local/x.jpg" alt="Bob" icon={Building2} color="blue" /></td>
              <Td>{'有 icon prop → 圖片失敗時顯示 icon'}</Td>
            </tr>
            <tr>
              <Td mono>src 失敗 → alt 首字</Td>
              <td className="p-3 border-b border-divider"><Avatar size={32} src="https://invalid.local/y.jpg" alt="Carol" color="purple" /></td>
              <Td>{'無 icon → 取 alt 第一個字大寫'}</Td>
            </tr>
            <tr>
              <Td mono>無 src 無 alt</Td>
              <td className="p-3 border-b border-divider"><Avatar size={32} /></td>
              <Td>{'最終 fallback → 預設 User icon(neutral 底色)'}</Td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1">
        <H3>Status presence dot(線上 / 離開 / 忙碌 / 離線)</H3>
        <Desc>傳 status prop 在 Avatar 右下角加狀態點,尺寸為 avatar 的 28%(clamp 8–16px),色彩語意對齊 Slack / Teams 業界共識(見 ProfileCard ColorMatrix「四種狀態對應色彩」)。狀態本身為唯讀,Avatar 不擁有切換邏輯。</Desc>
      </div>
      <div className="flex items-center gap-6">
        {(['online', 'away', 'busy', 'offline'] as const).map(s => (
          <div key={s} className="flex flex-col items-center gap-2">
            <Avatar size={40} alt="Ada" color="indigo" status={s} />
            <span className="text-[11px] font-mono text-fg-muted">{s}</span>
          </div>
        ))}
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
      <p className="whitespace-pre-line">{"・alt 必傳：即使有圖片,alt 同時是「圖片載入失敗時的文字 fallback」與「螢幕報讀時的身份說明」。人員頭像的 alt 建議含姓名與在線狀態(例:「陳冠霖(在線)」),組織 / 專案頭像用品牌或專案名;極少數純裝飾用途才用空字串。\n\n・沒有 alt 時的降級:圖片模式會自動降級為首字或 icon,不會留下沒有任何報讀內容的空頭像。\n\n・在線狀態點不另發報讀:右下角的狀態小點不會被螢幕報讀單獨朗讀,在線狀態整合進頭像本身的 alt 文字。這樣一長串成員名單就不會同時朗讀一堆「在線 / 離線」造成讀屏洪水。\n\n・hover 名片可用鍵盤抵達:當頭像帶有 hoverCard 時,頭像本身會變成可用 Tab 聚焦的按鈕並顯示聚焦框,鍵盤使用者也能打開名片浮層。"}</p>
    </div>
  ),
}

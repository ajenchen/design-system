// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-rationale:
//   SizeMatrix N/A — Track 高度固定 4px(無 size prop),與 Material / Carbon /
//     Atlassian 共識一致(progress bar 是 micro-indicator,size 由 affix 文字 /
//     icon 決定行高,track 本體不縮放)。
//   StateBehavior represented as AffixBehavior — ProgressBar 的非互動元件,沒
//     有 hover / focus / active / disabled。實際「狀態」是 status prop(inProgress /
//     success / error)的色彩切換已於 ColorMatrix 展示;affix 三種模式(value /
//     status-icon / ReactNode)的行為差異由 AffixBehavior(4.)涵蓋。
import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { CircleCheck, XCircle, X } from 'lucide-react'
import { ProgressBar } from './progress-bar'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Th, Td, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/ProgressBar/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data (與 progress-bar.tsx 的 cva 對應表一致)
   ═══════════════════════════════════════════════════════════════════════════ */

type StatusKey = 'inProgress' | 'success' | 'error'
type AffixKey = 'none' | 'value' | 'status-icon'

const STATUSES: StatusKey[] = ['inProgress', 'success', 'error']

const STATUS_TOKEN: Record<StatusKey, { fill: string; desc: string; affixIcon?: string }> = {
  inProgress: { fill: '--primary', desc: '進行中 / 未完成 ratio' },
  success: { fill: '--success', desc: '完成 / 成功', affixIcon: '--success' },
  error:   { fill: '--error',   desc: '失敗 / 中斷', affixIcon: '--error' },
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      {/* Anatomy 圖 */}
      <div>
        <H3>結構(Anatomy)</H3>
        <Desc>
          三層結構:<span className="font-mono">track</span>(灰底容器) + <span className="font-mono">fill</span>(狀態色填充)
          + 可選 <span className="font-mono">affix</span>(右側百分比 / 狀態 icon / 客製 ReactNode)。
        </Desc>
        <div className="flex flex-col gap-6">
          {/* 無 affix */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">無 affix(純 bar)</span>
            <div className="inline-flex flex-col gap-1 border-2 border-dashed border-primary/30 rounded-md px-3 py-3 w-[360px]">
              <div className="relative">
                {/* fake track with labels */}
                <div className="rounded-full bg-secondary overflow-hidden" style={{ height: 6 }}>
                  <div className="h-full rounded-full bg-primary" style={{ width: '45%' }} />
                </div>
                <span className="absolute -left-1 -top-5 text-[10px] font-mono" style={{ color: 'var(--primary)' }}>fill 45%</span>
                <span className="absolute right-0 -bottom-5 text-[10px] font-mono text-fg-muted">track</span>
              </div>
            </div>
          </div>
          {/* 含 affix */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">含 affix</span>
            <div className="inline-flex items-center gap-2 border-2 border-dashed border-primary/30 rounded-md px-3 py-3 w-[360px]">
              <div className="flex-1 min-w-0">
                <div className="rounded-full bg-secondary overflow-hidden" style={{ height: 6 }}>
                  <div className="h-full rounded-full bg-primary" style={{ width: '45%' }} />
                </div>
              </div>
              <span className="rounded px-2 py-0.5 text-[11px] font-mono border border-dashed"
                style={{ borderColor: 'var(--magenta)', backgroundColor: 'var(--magenta-subtle)', color: 'var(--magenta)' }}>affix</span>
            </div>
            <span className="text-[10px] text-fg-muted font-mono">wrapper: flex items-center gap-2 · bar: flex-1 min-w-0</span>
          </div>
        </div>
      </div>

      {/* Status 一覽 */}
      <div>
        <H3>Status 一覽</H3>
        <div className="flex flex-col gap-3">
          {STATUSES.map((s) => (
            <div key={s} className="flex items-center gap-4">
              <div className="w-28 shrink-0">
                <ProgressBar value={s === 'success' ? 100 : s === 'error' ? 60 : 45} status={s} />
              </div>
              <span className="font-mono text-caption w-20 text-fg-secondary">{s}</span>
              <span className="text-caption text-fg-secondary">{STATUS_TOKEN[s].desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Props 速查 */}
      <div>
        <H3>Props</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Prop</Th>
                <Th>Type</Th>
                <Th>Default</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              {[
                ['value', 'number (0-100)', '—', '當前進度,超出自動 clamp'],
                ['status', "'inProgress' | 'success' | 'error'", "'inProgress'", 'fill 色語意'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", 'track 高度(2 / 4 / 6 px)'],
                ['affix', "'value' | 'status-icon' | ReactNode", '—', '右側附加:百分比文字 / 狀態 icon / 客製內容'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}>
                  <Td mono>{p}</Td>
                  <Td mono>{t}</Td>
                  <Td mono>{d}</Td>
                  <Td>{desc}</Td>
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
   2. 元件檢閱器
   ═══════════════════════════════════════════════════════════════════════════ */

const Tab = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2.5 py-1 text-[12px] font-mono rounded-md cursor-pointer transition-colors ${
      active ? 'bg-primary text-white font-semibold' : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
    }`}
  >
    {children}
  </button>
)

const PropRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
    <span className="text-[11px] text-fg-muted font-medium w-[72px] shrink-0 pt-0.5">{label}</span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

const InspectorInner = () => {
  const [status, setStatus] = useState<StatusKey>('inProgress')
  const [affix, setAffix] = useState<AffixKey>('value')
  const [value, setValue] = useState(45)

  const sTok = STATUS_TOKEN[status]
  const trackHeightPx = 4  // 固定(無 size prop)
  const affixNode =
    affix === 'value' ? ('value' as const) :
    affix === 'status-icon' ? ('status-icon' as const) :
    undefined

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Status</span>
          <div className="flex gap-1.5">
            {STATUSES.map((s) => <Tab key={s} active={status === s} onClick={() => setStatus(s)}>{s}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Affix</span>
          <div className="flex gap-1.5">
            <Tab active={affix === 'none'} onClick={() => setAffix('none')}>none</Tab>
            <Tab active={affix === 'value'} onClick={() => setAffix('value')}>value</Tab>
            <Tab active={affix === 'status-icon'} onClick={() => setAffix('status-icon')}>status-icon</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Value</span>
          <input
            type="range" min={0} max={100} value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-[240px]"
          />
          <span className="text-[11px] font-mono text-fg-secondary tabular-nums w-10">{value}%</span>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview */}
        <div className="flex flex-col gap-5 min-w-[360px]">
          <div className="px-6 py-10 rounded-lg bg-canvas border border-divider">
            <ProgressBar value={value} status={status} affix={affixNode} />
          </div>

          {/* Blueprint:顯示 track 高度 + fill 寬度 */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-fg-muted font-medium">Blueprint</span>
            <div className="relative rounded-md overflow-hidden bg-[rgba(253,218,158,0.3)] border-2 border-dashed border-[rgba(218,165,60,0.6)] px-2 py-3">
              <div className="relative">
                <div className="rounded-full bg-secondary overflow-hidden" style={{ height: trackHeightPx }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${value}%`, backgroundColor: `var(${sTok.fill})` }} />
                </div>
                <span className="absolute left-0 -bottom-5 text-[10px] font-mono text-fg-muted">
                  track h={trackHeightPx}px · fill {value}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: inspect panel */}
        <div className="w-[300px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span>
            </div>
            <PropRow label="Fill"><TokenCell token={sTok.fill} /></PropRow>
            <PropRow label="Track"><TokenCell token="--secondary" /></PropRow>
            {affix === 'status-icon' && status !== 'inProgress' && (
              <PropRow label="Affix"><TokenCell token={sTok.affixIcon!} /></PropRow>
            )}
          </div>

          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span>
            </div>
            <PropRow label="高度">{trackHeightPx}px(固定,無 size prop)</PropRow>
            <PropRow label="Fill width">{`${value}%`}</PropRow>
            {affix !== 'none' && (
              <>
                <PropRow label="Wrapper">flex items-center gap-2</PropRow>
                <PropRow label="Bar container">flex-1 min-w-0</PropRow>
              </>
            )}
          </div>

          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span>
            </div>
            <PropRow label="Radius">rounded-full(track & fill)</PropRow>
            <PropRow label="Transition">width 300ms</PropRow>
            <PropRow label="A11y">role=progressbar · aria-valuenow=value</PropRow>
            {affix === 'value' && (
              <PropRow label="Value text">text-caption · tabular-nums · text-foreground</PropRow>
            )}
            {affix === 'status-icon' && (
              <PropRow label="Icon">16px · shrink-0</PropRow>
            )}
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
      <H3>元件檢閱器</H3>
      <Desc>
        選擇任意組合,即時查看 fill / track token 與 layout。藍圖展示 track 高度隨 size 切換。
      </Desc>
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
      <H3>Status × Token 對照</H3>
      <Desc>
        橫向看同 status 的 track / fill / affix 色塊;縱向比較三種 status 的 token 差異。
        inProgress 的 affix-icon 無顯示(inProgress 不帶終態 icon)。
      </Desc>
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead>
            <tr>
              <Th>Status</Th>
              <Th>預覽(md, value=60)</Th>
              <Th>Track</Th>
              <Th>Fill</Th>
              <Th>Affix icon</Th>
            </tr>
          </thead>
          <tbody>
            {STATUSES.map((s) => (
              <tr key={s}>
                <Td mono>{s}</Td>
                <Td>
                  <div className="w-[180px]">
                    <ProgressBar value={s === 'success' ? 100 : 60} status={s} />
                  </div>
                </Td>
                <Td><TokenCell token="--secondary" /></Td>
                <Td><TokenCell token={STATUS_TOKEN[s].fill} /></Td>
                <Td>
                  {STATUS_TOKEN[s].affixIcon
                    ? <TokenCell token={STATUS_TOKEN[s].affixIcon!} />
                    : <span className="text-fg-muted">—</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">含 affix 預覽</span>
        <div className="flex flex-col gap-3 max-w-[420px]">
          <ProgressBar value={42} status="inProgress" affix="value" />
          <ProgressBar value={100} status="success" affix="status-icon" />
          <ProgressBar value={68} status="error" affix="status-icon" />
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. Affix 行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const AffixBehavior = {
  name: 'Affix 行為',
  render: () => (
    <div className="flex flex-col gap-8">
      <H3>Affix 三種模式</H3>
      <Desc>
        右側附加可傳 string enum(<span className="font-mono">'value'</span> / <span className="font-mono">'status-icon'</span>)
        或任意 <span className="font-mono">ReactNode</span>。wrapper 自動加 flex + gap-2,bar 佔 flex-1。
      </Desc>

      <div className="flex flex-col gap-6">
        {/* value */}
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-fg-secondary">affix="value" — 靜態 poll 場景</span>
          <p className="text-footnote text-fg-muted">
            顯示 <span className="font-mono">{'{value}%'}</span>,使用 <span className="font-mono">text-caption tabular-nums text-foreground</span>。
            配額使用率、下載進度等需要精確數字時使用。
          </p>
          <div className="w-[360px]">
            <ProgressBar value={45} status="inProgress" affix="value" />
          </div>
        </div>

        {/* status-icon */}
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-fg-secondary">affix="status-icon" — final state</span>
          <p className="text-footnote text-fg-muted">
            success → <CircleCheck size={14} className="inline text-success" /> CircleCheck(16px, text-success);
            error → <XCircle size={14} className="inline text-error" /> XCircle(16px, text-error);
            inProgress → 無 icon(inProgress 非終態)。
          </p>
          <div className="flex flex-col gap-2 w-[360px]">
            <ProgressBar value={100} status="success" affix="status-icon" />
            <ProgressBar value={72} status="error" affix="status-icon" />
            <ProgressBar value={50} status="inProgress" affix="status-icon" />
            <span className="text-footnote text-fg-muted">↑ inProgress 傳 status-icon 時不渲染 icon(仍保留 wrapper gap)</span>
          </div>
        </div>

        {/* ReactNode */}
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-fg-secondary">affix={`{ReactNode}`} — 客製</span>
          <p className="text-footnote text-fg-muted">
            上傳中提供取消按鈕;或顯示 <span className="font-mono">2.3 / 5.0 MB</span> 等具體 bytes。
          </p>
          <div className="flex flex-col gap-3 w-[360px]">
            <ProgressBar
              value={42}
              status="inProgress"
             
              affix={
                <Button variant="text" size="xs" iconOnly startIcon={X} aria-label="取消上傳" />
              }
            />
            <ProgressBar
              value={66}
              status="inProgress"
             
              affix={<span className="text-caption text-fg-muted tabular-nums shrink-0">1.3 / 2.0 MB</span>}
            />
          </div>
        </div>

        {/* none */}
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-fg-secondary">不傳 affix — 純 bar</span>
          <p className="text-footnote text-fg-muted">
            不包 wrapper,ProgressBar 本身就是整個元件。適合 FileItem 的 compact mode(上方已有檔名文字)。
          </p>
          <div className="w-[360px]">
            <ProgressBar value={55} status="inProgress" />
          </div>
        </div>
      </div>
    </div>
  ),
}

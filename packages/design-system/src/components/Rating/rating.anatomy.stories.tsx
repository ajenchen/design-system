import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { Rating } from './rating'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Rating/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ── Data ─────────────────────────────────────────────── */

type SizeKey = 'sm' | 'md' | 'lg'
type PrecisionKey = 'full' | 'half'
type ModeKey = 'interactive' | 'readOnly' | 'disabled'

const SIZES: SizeKey[] = ['sm', 'md', 'lg']
// 對齊 item-anatomy inline Avatar(sm=20 / md=24 / lg=24),詳見 rating.spec.md「Icon 尺寸對齊 Avatar inline」
const SIZE_PX: Record<SizeKey, number> = { sm: 20, md: 24, lg: 24 }

const SIZE_USE: Record<SizeKey, string> = {
  sm: '商品列表、搜尋結果、DataTable cell',
  md: '一般卡片、評論列表、商品詳情（預設）',
  lg: '送出評分的 review form 主 CTA 區',
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>結構（Anatomy）</H3>
        <Desc>
          Rating 由 `max`（預設 5）顆 Star icon 並排組成。每顆 icon 有 filled / empty 兩態；
          precision=half 時 filled 疊在 empty 上用 `overflow-hidden` 裁出左半。容器 `inline-flex gap-1`。
        </Desc>
        <div className="flex flex-col gap-4">
          {/* Single star anatomy */}
          <div className="flex gap-8 items-start">
            <div className="flex flex-col gap-2 items-start">
              <span className="text-[11px] text-fg-muted font-medium">單顆星 — filled</span>
              <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md p-3">
                <Rating value={1} max={1} readOnly size="lg" aria-label="filled" />
              </div>
              <span className="text-[10px] text-fg-muted font-mono">fill = var(--warning)</span>
            </div>
            <div className="flex flex-col gap-2 items-start">
              <span className="text-[11px] text-fg-muted font-medium">單顆星 — empty</span>
              <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md p-3">
                <Rating value={0} max={1} readOnly size="lg" aria-label="empty" />
              </div>
              <span className="text-[10px] text-fg-muted font-mono">fill = var(--divider)</span>
            </div>
            <div className="flex flex-col gap-2 items-start">
              <span className="text-[11px] text-fg-muted font-medium">單顆星 — half (precision=half)</span>
              <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md p-3">
                <Rating value={0.5} max={1} readOnly precision="half" size="lg" aria-label="half" />
              </div>
              <span className="text-[10px] text-fg-muted font-mono">left 50% filled / right 50% empty</span>
            </div>
          </div>

          {/* Full Rating layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">整體 — 5 顆星 inline</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md p-3">
              <Rating value={4.5} readOnly precision="half" size="lg" aria-label="4.5 星" />
            </div>
            <span className="text-[10px] text-fg-muted font-mono">inline-flex · gap-1（4px）· items-center</span>
          </div>
        </div>
      </div>

      <div>
        <H3>Props</H3>
        <table className="border-collapse">
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
              ['value', 'number', '—', '當前評分（controlled，0 ~ max）'],
              ['defaultValue', 'number', '0', 'uncontrolled 預設值'],
              ['onChange', '(value: number) => void', '—', '評分改變 callback'],
              ['max', 'number', '5', '滿分星數（世界級慣例 = 5，不建議超過 7）'],
              ['size', "'xs'|'sm'|'md'|'lg'", 'xs / md', '尺寸,star icon 20/20/24/24 px(對齊 inline Avatar,非 icon tier)。預設依情境:獨立展示 xs,Field 內跟隨 Field md'],
              ['precision', "'full'|'half'", "'full'", '整星 / 半星'],
              ['readOnly', 'boolean', 'false', '唯讀展示（不響應 hover/click/鍵盤）'],
              ['disabled', 'boolean', 'false', '完全停用'],
              ['loading', 'boolean', 'false', '暫時性等待,視覺同 disabled、aria-busy(詳 spec「Loading canonical」段)'],
              ['icon', 'LucideIcon', 'Star', '自訂 icon（極少用，禁止換成 Heart/ThumbsUp）'],
              ['aria-label', 'string', '—', 'readOnly 時必填，描述分數'],
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
    <span className="text-[11px] text-fg-muted font-medium w-[80px] shrink-0 pt-0.5">{label}</span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

const InspectorInner = () => {
  const [size, setSize] = useState<SizeKey>('md')
  const [precision, setPrecision] = useState<PrecisionKey>('full')
  const [mode, setMode] = useState<ModeKey>('interactive')
  const [value, setValue] = useState(3)

  const iconPx = SIZE_PX[size]
  const readOnly = mode === 'readOnly'
  const disabled = mode === 'disabled'

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
          <span className="text-[11px] text-fg-muted w-20 shrink-0">Precision</span>
          <div className="flex gap-1.5">
            {(['full', 'half'] as const).map((p) => <Tab key={p} active={precision === p} onClick={() => setPrecision(p)}>{p}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">Mode</span>
          <div className="flex gap-1.5">
            {(['interactive', 'readOnly', 'disabled'] as const).map((m) => (
              <Tab key={m} active={mode === m} onClick={() => setMode(m)}>{m}</Tab>
            ))}
          </div>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start flex-wrap">
        <div className="flex flex-col gap-5 min-w-[300px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <Rating
              value={value}
              onChange={setValue}
              size={size}
              precision={precision}
              readOnly={readOnly}
              disabled={disabled}
              aria-label={readOnly ? `平均評分 ${value} 星，共 5 星` : undefined}
            />
          </div>
          <div className="text-caption text-fg-muted font-mono">
            當前值：{value} / 5
          </div>
        </div>

        {/* Right panel */}
        <div className="w-[320px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span>
            </div>
            <PropRow label="Filled"><TokenCell token="--warning" /></PropRow>
            <PropRow label="Empty"><TokenCell token="--divider" /></PropRow>
            <PropRow label="Focus ring"><TokenCell token="--ring" display="ring-2 ring-ring ring-offset-2" /></PropRow>
          </div>

          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span>
            </div>
            <PropRow label="Icon size">{iconPx}px</PropRow>
            <PropRow label="Gap">gap-1 (4px)</PropRow>
            <PropRow label="Container">inline-flex · items-center</PropRow>
            <PropRow label="Rounded">rounded-md (focus box)</PropRow>
          </div>

          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Behavior</span>
            </div>
            <PropRow label="Role">{readOnly || disabled ? 'img' : 'slider'}</PropRow>
            <PropRow label="tabIndex">{readOnly || disabled ? '—' : '0'}</PropRow>
            <PropRow label="Hover">{readOnly || disabled ? '—' : '填色預覽至游標所在星（不改尺寸）'}</PropRow>
            <PropRow label="Keyboard">{readOnly || disabled ? '—' : `Arrow ± ${precision === 'half' ? '0.5' : '1'} · Home=0 · End=max`}</PropRow>
          </div>

          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">A11y</span>
            </div>
            <PropRow label="aria-valuenow">{readOnly || disabled ? '—' : value}</PropRow>
            <PropRow label="aria-valuemin">{readOnly || disabled ? '—' : '0'}</PropRow>
            <PropRow label="aria-valuemax">{readOnly || disabled ? '—' : '5'}</PropRow>
            <PropRow label="aria-valuetext">{readOnly || disabled ? '—' : `${value} of 5 stars`}</PropRow>
            <PropRow label="aria-label">{readOnly ? '必填' : 'Field 內免填 · standalone 必填'}</PropRow>
            <PropRow label="aria-labelledby">{readOnly || disabled ? '—' : 'Field 內自動指向 FieldLabel'}</PropRow>
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
        選擇 size / precision / mode，即時查看所有 token 與行為。
        Rating 無 theme-dependent 色值以外的 resolved 數字（純 icon px + 黃灰兩色）。
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
    <div className="flex flex-col gap-6">
      <div>
        <H3>State × Token 對照</H3>
        <Desc>
          Rating 僅有 filled / empty 兩個視覺色；hover / focus / disabled 是行為層疊加，不改 fill 色。
        </Desc>
      </div>
      <table className="border-collapse">
        <thead>
          <tr>
            <Th>State</Th>
            <Th>預覽</Th>
            <Th>Filled token</Th>
            <Th>Empty token</Th>
            <Th>額外視覺</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td mono>filled</Td>
            <Td><Rating value={5} readOnly size="md" aria-label="滿分" /></Td>
            <Td><TokenCell token="--warning" /></Td>
            <Td>—</Td>
            <Td>—</Td>
          </tr>
          <tr>
            <Td mono>empty</Td>
            <Td><Rating value={0} readOnly size="md" aria-label="零分" /></Td>
            <Td>—</Td>
            <Td><TokenCell token="--divider" /></Td>
            <Td>—</Td>
          </tr>
          <tr>
            <Td mono>half</Td>
            <Td><Rating value={3.5} readOnly precision="half" size="md" aria-label="3.5 星" /></Td>
            <Td><TokenCell token="--warning" /></Td>
            <Td><TokenCell token="--divider" /></Td>
            <Td className="text-[11px]">left 50% filled overlay</Td>
          </tr>
          <tr>
            <Td mono>hover (interactive)</Td>
            <Td><Rating defaultValue={3} size="md" aria-label="hover 範例" /></Td>
            <Td><TokenCell token="--warning" /></Td>
            <Td><TokenCell token="--divider" /></Td>
            <Td className="text-[11px]">填色預覽至游標所在星</Td>
          </tr>
          <tr>
            <Td mono>focus (keyboard)</Td>
            <Td><Rating defaultValue={3} size="md" aria-label="focus 範例" /></Td>
            <Td><TokenCell token="--warning" /></Td>
            <Td><TokenCell token="--divider" /></Td>
            <Td className="text-[11px]">ring-2 ring-ring ring-offset-2</Td>
          </tr>
          <tr>
            <Td mono>disabled</Td>
            <Td><Rating value={3} disabled size="md" aria-label="disabled 範例" /></Td>
            <Td><TokenCell token="--warning" /></Td>
            <Td><TokenCell token="--divider" /></Td>
            <Td className="text-[11px]">opacity-disabled · pointer-events-none</Td>
          </tr>
        </tbody>
      </table>
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
      <div>
        <H3>Size 對照</H3>
        <Desc>
          Rating 的 star icon 大小 sm=20 / md=24 / lg=24,**對齊 item-anatomy inline Avatar**——
          Rating 是 filled identity 視覺(主要資料點),跟 Avatar 同重量才能在 row 內 visual weight 對齊。
          Container 走 `--field-height-*`(sm=28 / md=32 / lg=36)跟 Input/Select/Button 並排時 row-align;
          star 本身不走 icon tier(16/16/20,那是次要 affordance icon 的尺寸)。詳見 rating.spec.md。
        </Desc>
      </div>

      <table className="border-collapse text-caption">
        <thead>
          <tr>
            <Th>Size</Th>
            <Th>Icon px</Th>
            <Th>Gap</Th>
            <Th>使用情境</Th>
            <Th>預覽</Th>
          </tr>
        </thead>
        <tbody>
          {SIZES.map((sz) => (
            <tr key={sz}>
              <Td mono>{sz}{sz === 'md' ? ' ★default' : ''}</Td>
              <Td mono>{SIZE_PX[sz]}px</Td>
              <Td mono>gap-1 (4px)</Td>
              <Td>{SIZE_USE[sz]}</Td>
              <Td>
                <Rating value={4.5} readOnly precision="half" size={sz} aria-label={`${sz} 範例 4.5 星`} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Container 消費 field-height,star icon 走 inline-Avatar 尺寸</span>
        <p className="text-caption text-fg-muted max-w-[720px] leading-relaxed">
          Rating 的 container 消費 `--field-height-*`（xs=24 / sm=28 / md=32 / lg=36），讓它與
          Input / NumberInput / DatePicker / Select / Button 等 field-height family 元件並排同一 row 時高度對齊。
          這一層是「外框高度」對齊；star icon 本身則走 item-anatomy inline Avatar 尺寸（sm=20 / md=24 / lg=24），
          而非 icon tier（16/16/20）——因為一顆星是 filled identity 視覺（主要資料點），視覺份量要跟 Avatar 齊。
          兩層分開設計:container 高度對齊 Field row,icon 大小對齊 Avatar 重量。
        </p>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. 狀態行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior = {
  name: '狀態行為',
  render: () => {
    const Interactive = () => {
      const [v1, setV1] = useState(0)
      const [v2, setV2] = useState(0)
      return (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">
              Precision — full vs half
            </span>
            <p className="text-caption text-fg-muted max-w-[720px]">
              full 適合送出評分（使用者給整數清晰）；half 適合展示平均分（`4.7` 這類小數需要更細的視覺刻度）。
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <span className="text-caption text-fg-muted w-32">full（送出）</span>
                <Rating defaultValue={0} precision="full" aria-label="full precision" />
                <span className="text-caption text-fg-muted">step = 1</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-caption text-fg-muted w-32">half（展示平均）</span>
                <Rating value={4.7} readOnly precision="half" aria-label="平均 4.7 星" />
                <span className="text-caption text-fg-muted">顯示 4.7</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">
              Interactive — hover 預覽 + click 設值
            </span>
            <p className="text-caption text-fg-muted max-w-[720px]">
              hover 某顆星時顯示到該星為止的填色預覽（state 未提交），click 才寫入。
              Mouse leave 恢復當前已提交值。
            </p>
            <div className="flex items-center gap-4">
              <Rating value={v1} onChange={setV1} size="lg" aria-label="hover 預覽範例" />
              <span className="text-caption text-fg-muted">當前值：{v1}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">
              Keyboard — Arrow Left/Right/Up/Down 改值 · Home / End 跳極值
            </span>
            <p className="text-caption text-fg-muted max-w-[720px]">
              Focus 進入 Rating 容器後，Arrow Right/Up 加一、Arrow Left/Down 減一（precision=half 時 step=0.5）；
              Home 跳到 0、End 跳到 max（完整 WAI-ARIA slider 鍵盤 pattern）。
              值範圍 0 ~ max，超出自動 clamp。
            </p>
            <div className="flex items-center gap-4">
              <Rating value={v2} onChange={setV2} precision="half" size="lg" aria-label="鍵盤控制範例" />
              <span className="text-caption text-fg-muted">當前值：{v2}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">
              ReadOnly — 不響應 hover / click / 鍵盤
            </span>
            <p className="text-caption text-fg-muted max-w-[720px]">
              展示平均分或他人評分時使用。`role="img"` + `aria-label`（必填）讓螢幕閱讀器讀出分數。
            </p>
            <div className="flex items-center gap-4">
              <Rating value={4.5} readOnly precision="half" size="lg" aria-label="平均評分 4.5 星，共 5 星" />
              <span className="text-caption text-fg-muted">pointer / keyboard 都不響應</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">
              Disabled — 整體降透明度，阻擋所有事件
            </span>
            <p className="text-caption text-fg-muted max-w-[720px]">
              `opacity-disabled` + `pointer-events-none`。`aria-disabled="true"`。
            </p>
            <div className="flex items-center gap-4">
              <Rating value={4} disabled size="lg" aria-label="disabled 範例" />
            </div>
          </div>
        </div>
      )
    }
    return <Interactive />
  },
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `rating.spec.md` 「A11y 預設」段。摘要:\n\n-   interactive  ： role=\"slider\"  +  aria-valuenow={value}  +  aria-valuemin={0}  +  aria-valuemax={max}  +  aria-valuetext={`{value} of {max} stars`}  +  tabIndex={0} ，鍵盤 Arrow Left/Right/Up/Down ± step（precision=half 時 step=0.5，否則 step=1），Home=0 / End=max（完整 WAI-ARIA slider 鍵盤 pattern）\n-   readOnly  ： role=\"img\"  +  aria-label （  必填  ），例： aria-label=\"平均評分 4.7 星，共 5 星\" 。無 tabIndex\n-   disabled  ： aria-disabled=\"true\"  +  pointer-events-none \n-   單顆星    aria-hidden ：內部點擊目標是  <span role=\"presentation\" aria-hidden> （非 interactive element，避免與外層 role=\"slider\" 形成 axe nested-interactive；含 half-precision 兩個 hover zone）"}</p>
    </div>
  ),
}

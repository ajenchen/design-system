// @anatomy-rationale:
//   ColorMatrix represented as ShapeMatrix — Trigger pill 色彩由 shape 決定
//     (circle = bg-muted、tag = tagVariants neutral),非獨立色彩變體。
//     ShapeMatrix(3.)已對照 shape × 色彩 token + consumer 場景。HoverCard
//     content 走深色 tooltip,色彩繼承 tooltip token。
//   StateBehavior N/A — Trigger pill 本身無 hover 視覺(hover 觸發 HoverCard
//     展開即是 state 表達);無 active / disabled;focus-visible ring 屬 a11y
//     focusable 修正(2026-06-01 #13,見 Accessibility story)非獨立視覺軸。openDelay /
//     closeDelay 等行為已於 Inspector 展示。HoverCard 內容互動由消費的內容
//     元件(Avatar / Tag)各自負責。
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { OverflowIndicator } from './overflow-indicator'
import { Tag } from '@/design-system/components/Tag/tag'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'

const personHover = (name: string) => (
  <ProfileCard
    name={name}
    subtitle="Design｜D-0042｜EMP-1001"
    avatar={{ alt: name }}
    status="online"
    statusMessage="Out of Office: Back on Monday."
    actions={<ProfileCardDefaultActions />}
    fields={[
      { label: 'ID', value: 'YHANAX' },
      { label: 'Employee number', value: '1234567' },
    ]}
    onViewMore={() => {}}
  />
)
const P = { A: 'Alan Chen', B: 'Betty Wu', C: 'Charlie Lee' } as const
import { H3, Desc, Td, Th, Swatch } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Internal/OverflowIndicator/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

type SizeKey = 'sm' | 'md' | 'lg'
type ShapeKey = 'circle' | 'tag'

const SIZES: SizeKey[] = ['sm', 'md', 'lg']
const SHAPES: ShapeKey[] = ['circle', 'tag']

// font-size 依 shape 分流(re-verified 2026-06-01):circle shape 走元件內建 triggerText
// map(overflow-indicator.tsx:24-28),tag shape 走 tagVariants({ size })(tag.tsx:45-47)。
// circleText / tagText 兩欄分別對應,避免把 circle-only 字級當成兩 shape 通用。
const SIZE_SPECS: Record<
  SizeKey,
  { height: string; heightPx: number; circleText: string; circleTextPx: number; tagText: string; tagTextPx: number }
> = {
  sm: { height: 'h-5 min-w-5', heightPx: 20, circleText: 'text-[10px]', circleTextPx: 10, tagText: 'text-caption', tagTextPx: 12 },
  md: { height: 'h-6 min-w-6', heightPx: 24, circleText: 'text-caption', circleTextPx: 12, tagText: 'text-body', tagTextPx: 14 },
  lg: { height: 'h-6 min-w-6', heightPx: 24, circleText: 'text-caption', circleTextPx: 12, tagText: 'text-body', tagTextPx: 14 },
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. Overview
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>
          OverflowIndicator = 「+N trigger pill」+「HoverCard 浮層展開隱藏內容」的組合 primitive。trigger 本身只有計數
          pill,真正的內容由 children 傳入、透過 HoverCard 呈現。兩種形狀:
          <code className="font-mono text-footnote mx-1">circle</code>(Avatar stack 用)與
          <code className="font-mono text-footnote mx-1">tag</code>(Tag 組溢出用)。
        </Desc>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <OverflowIndicator count={5} shape="circle" size="md">
              <div className="text-caption p-1">5 人隱藏</div>
            </OverflowIndicator>
            <span className="text-footnote text-fg-muted font-mono">shape="circle"</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <OverflowIndicator count={3} shape="tag" size="md">
              <div className="text-caption p-1">3 個 tag 隱藏</div>
            </OverflowIndicator>
            <span className="text-footnote text-fg-muted font-mono">shape="tag"</span>
          </div>
        </div>
      </div>

      <div>
        <H3>結構</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>層</Th>
                <Th>角色</Th>
                <Th>元素 / token</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>Trigger(circle)</Td>
                <Td>Avatar stack 尾端 +N pill</Td>
                <Td mono>rounded-full · bg-muted · text-foreground</Td>
              </tr>
              <tr>
                <Td mono>Trigger(tag)</Td>
                <Td>Tag 組尾端 +N</Td>
                <Td mono>tagVariants{`{ color: 'neutral', size }`}</Td>
              </tr>
              <tr>
                <Td mono>HoverCardContent</Td>
                <Td>展開容器(深色 tooltip 風格)</Td>
                <Td mono>bg-tooltip · data-theme="dark" · rounded-lg</Td>
              </tr>
              <tr>
                <Td mono>ShrinkWrapList</Td>
                <Td>內部 flex-wrap 容器,自動量測最大 row 寬度避免 overflow</Td>
                <Td mono>flex flex-wrap gap-1 p-2 max-w-[280px]</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
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
              <tr>
                <Td mono>count</Td>
                <Td mono>number</Td>
                <Td>—(必填)</Td>
                <Td>隱藏項目數量。≤ 0 時 return null。</Td>
              </tr>
              <tr>
                <Td mono>shape</Td>
                <Td mono>'circle' | 'tag'</Td>
                <Td mono>'circle'</Td>
                <Td>trigger 外形</Td>
              </tr>
              <tr>
                <Td mono>size</Td>
                <Td mono>'sm' | 'md' | 'lg'</Td>
                <Td mono>'md'</Td>
                <Td>trigger 尺寸(lg 視覺同 md)</Td>
              </tr>
              <tr>
                <Td mono>children</Td>
                <Td mono>ReactNode</Td>
                <Td>—(必填)</Td>
                <Td>HoverCard 內展開的隱藏內容</Td>
              </tr>
              <tr>
                <Td mono>className</Td>
                <Td mono>string</Td>
                <Td mono>undefined</Td>
                <Td>額外套到 trigger pill 上(如 Avatar stack 的 ring)</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. Inspector
   ═══════════════════════════════════════════════════════════════════════════ */

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => <OverflowInspector />,
}

function OverflowInspector() {
  const [shape, setShape] = useState<ShapeKey>('circle')
  const [size, setSize] = useState<SizeKey>('md')
  const [count, setCount] = useState(5)

  const spec = SIZE_SPECS[size]
  // font-size 隨 shape 不同:circle 走 triggerText map、tag 走 tagVariants
  const textClass = shape === 'tag' ? spec.tagText : spec.circleText
  const textPx = shape === 'tag' ? spec.tagTextPx : spec.circleTextPx

  return (
    <div className="grid grid-cols-[1fr_320px] gap-8 max-w-5xl">
      <div className="flex flex-col gap-6">
        <div>
          <H3>即時預覽</H3>
          <div className="p-6 rounded-md border border-divider bg-muted flex items-center gap-4">
            <span className="text-caption text-fg-muted">hover 看展開:</span>
            <OverflowIndicator count={count} shape={shape} size={size}>
              <div className="flex flex-col gap-1 text-caption min-w-[140px]">
                {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
                  <span key={i}>隱藏項目 {i + 1}</span>
                ))}
                {count > 8 && <span className="text-fg-muted">…及其他 {count - 8} 項</span>}
              </div>
            </OverflowIndicator>
          </div>
        </div>

        <div>
          <H3>尺寸藍圖</H3>
          <div className="border border-divider rounded-md p-4 bg-muted">
            <pre className="text-footnote font-mono text-fg-secondary leading-relaxed whitespace-pre">
{`shape=${shape}   size=${size}
  ┌───────────────┐
  │   +${count.toString().padStart(2, ' ')}           │   ← trigger pill
  │  ${spec.height.padEnd(13)}│      ${spec.heightPx}px (min-width 同高)
  │  ${textClass.padEnd(13)}│      ${textPx}px 字體 (${shape})
  └───────────────┘
         │ hover
         ▼
  ┌────────────────────────┐
  │  HoverCardContent      │  bg-tooltip · data-theme="dark"
  │  ShrinkWrapList        │  flex-wrap · gap-1 · p-2 · max-w-[280px]
  │  ▸ 隱藏項目 1          │
  │  ▸ 隱藏項目 2          │
  │  …                     │
  └────────────────────────┘`}
            </pre>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <H3>Shape</H3>
          <div className="flex gap-2">
            {SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShape(s)}
                className={`px-2.5 py-1 text-caption rounded-md font-mono cursor-pointer ${
                  s === shape
                    ? 'bg-primary text-white'
                    : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <H3>Size</H3>
          <div className="flex gap-2">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`px-2.5 py-1 text-caption rounded-md font-mono cursor-pointer ${
                  s === size
                    ? 'bg-primary text-white'
                    : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <H3>Count</H3>
          <input
            type="range"
            min={1}
            max={30}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10))}
            className="w-full"
          />
          <div className="text-caption font-mono text-fg-secondary">count = {count}</div>
        </div>

        <div>
          <H3>Inspect</H3>
          <table className="text-caption border-collapse w-full">
            <tbody>
              <tr>
                <Td mono>height</Td>
                <Td mono>{spec.height} · {spec.heightPx}px</Td>
              </tr>
              <tr>
                <Td mono>font-size</Td>
                <Td mono>{textClass} · {textPx}px（{shape}）</Td>
              </tr>
              <tr>
                <Td mono>bg</Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch value={shape === 'circle' ? '--muted' : '--secondary'} size="sm" />
                    <span className="font-mono">
                      {shape === 'circle' ? '--muted' : 'tagVariants neutral (--secondary)'}
                    </span>
                  </span>
                </Td>
              </tr>
              <tr>
                <Td mono>rounded</Td>
                <Td mono>{shape === 'circle' ? 'rounded-full' : 'rounded-md'}</Td>
              </tr>
              <tr>
                <Td mono>openDelay</Td>
                <Td mono>500ms（HOVER_DELAY_PLAIN_MS）</Td>
              </tr>
              <tr>
                <Td mono>closeDelay</Td>
                <Td mono>200ms（HOVER_DELAY_CLOSE_MS）</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. ShapeMatrix — 元件特有(取代 ColorMatrix,見 spec「為何無 ColorMatrix」)
   ═══════════════════════════════════════════════════════════════════════════ */

export const ShapeMatrix: Story = {
  name: '形狀對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Shape × 使用情境</H3>
        <Desc>
          兩種形狀對應不同的消費場景——circle 跟 Avatar stack 的圓形單元一致,tag 跟 Tag 組的 rounded rectangle
          一致。Consumer 選哪個由「被溢出的項目」形狀決定,不是色彩決策。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Shape</Th>
                <Th>外形</Th>
                <Th>樣式</Th>
                <Th>典型 consumer</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>circle</Td>
                <Td>
                  <OverflowIndicator count={5} shape="circle" size="md">
                    <div className="p-1 text-caption">預覽</div>
                  </OverflowIndicator>
                </Td>
                <Td mono>rounded-full · bg-muted · text-foreground · font-medium</Td>
                <Td>PeoplePicker / Avatar Group +N</Td>
              </tr>
              <tr>
                <Td mono>tag</Td>
                <Td>
                  <OverflowIndicator count={5} shape="tag" size="md">
                    <div className="p-1 text-caption">預覽</div>
                  </OverflowIndicator>
                </Td>
                <Td mono>tagVariants neutral · rounded-md · 同 Tag 視覺</Td>
                <Td>Combobox multi-select tag 溢出 / Breadcrumb 收合</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Shape × Size 視覺矩陣</H3>
        <Desc>
          3 × 2 矩陣:三個 size(sm / md / lg)× 兩個 shape。lg 視覺等同 md,因為 HoverCard 的 +N 不需要再放大。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Shape \ Size</Th>
                {SIZES.map((s) => (
                  <Th key={s}>{s}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHAPES.map((shape) => (
                <tr key={shape}>
                  <Td mono>{shape}</Td>
                  {SIZES.map((size) => (
                    <Td key={size}>
                      <OverflowIndicator count={7} shape={shape} size={size}>
                        <div className="p-1 text-caption">預覽</div>
                      </OverflowIndicator>
                    </Td>
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

/* ═══════════════════════════════════════════════════════════════════════════
   4. SizeMatrix
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Size token 對照</H3>
        <Desc>
          對齊 Tag family 的 sm / md 尺寸(20 / 24px)。lg 視覺等同 md——hover trigger 不需要繼續放大(HoverCard
          內容才是重點)。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Size</Th>
                <Th>Height</Th>
                <Th>Min-width</Th>
                <Th>Font-size（circle）</Th>
                <Th>Font-size（tag）</Th>
                <Th>對齊</Th>
              </tr>
            </thead>
            <tbody>
              {SIZES.map((s) => (
                <tr key={s}>
                  <Td mono>{s}</Td>
                  <Td mono>{SIZE_SPECS[s].height.split(' ')[0]} · {SIZE_SPECS[s].heightPx}px</Td>
                  <Td mono>{SIZE_SPECS[s].height.split(' ')[1]} · {SIZE_SPECS[s].heightPx}px</Td>
                  <Td mono>{SIZE_SPECS[s].circleText} · {SIZE_SPECS[s].circleTextPx}px</Td>
                  <Td mono>{SIZE_SPECS[s].tagText} · {SIZE_SPECS[s].tagTextPx}px</Td>
                  <Td>{s === 'lg' ? '同 md(24px)' : `Tag ${s}`}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          font-size 依 shape 分流——<code className="font-mono">circle</code> 走元件內建 triggerText map、
          <code className="font-mono">tag</code> 走 <code className="font-mono">tagVariants</code>(對齊 Tag 字級)。
          circle shape 的 <code className="font-mono">sm</code> 用
          <code className="font-mono mx-1">text-[10px]</code>
          的理由見 spec「尺寸」段——sub-footnote 特殊例外,與 Badge 共享 micro-indicator typography tier。
        </p>
      </div>

      <div>
        <H3>Consumer 場景對照</H3>
        <Desc>三個 consumer 場景對應的 size 選擇:</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>情境</Th>
                <Th>推薦 size</Th>
                <Th>範例</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>DataTable row 人員欄位(20px avatar stack)</Td>
                <Td mono>sm</Td>
                <Td>
                  <div className="flex items-center">
                    <Avatar alt={P.A} color="indigo" size={20} hoverCard={personHover(P.A)} />
                    <span className="-ml-1.5">
                      <Avatar alt={P.B} color="magenta" size={20} hoverCard={personHover(P.B)} />
                    </span>
                    <span className="-ml-1.5">
                      <OverflowIndicator count={3} shape="circle" size="sm">
                        <div className="p-1 text-caption">…</div>
                      </OverflowIndicator>
                    </span>
                  </div>
                </Td>
              </tr>
              <tr>
                <Td>Combobox 單行 tag 溢出(sm tag)</Td>
                <Td mono>sm</Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <Tag size="sm">bug</Tag>
                    <Tag size="sm">P0</Tag>
                    <OverflowIndicator count={3} shape="tag" size="sm">
                      <div className="p-1 text-caption">…</div>
                    </OverflowIndicator>
                  </div>
                </Td>
              </tr>
              <tr>
                <Td>Field md 內的 avatar stack(24px)</Td>
                <Td mono>md</Td>
                <Td>
                  <div className="flex items-center">
                    <Avatar alt={P.A} color="indigo" size={24} hoverCard={personHover(P.A)} />
                    <span className="-ml-1.5">
                      <OverflowIndicator count={4} shape="circle" size="md">
                        <div className="p-1 text-caption">…</div>
                      </OverflowIndicator>
                    </span>
                  </div>
                </Td>
              </tr>
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
      <p className="whitespace-pre-line">{"摘要:\n\n  ARIA / Pattern  :對齊 [W3C ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) 對應 pattern。\n\n  互動行為  :\n\n  +N trigger 是 keyboard-focusable 計數 span（tabIndex=0 + role=\"button\" + aria-haspopup=\"dialog\"；2026-06-01 #13 由純 passive 改 focusable，修 WCAG 2.1.1 違反）。HoverCard 在 hover 或 trigger 取得 focus 時自動展開，沒有「按 Enter 開選單」的鍵盤指令，也沒有 click 切換。\n\n  Focus  :trigger 是 tab stop（focus-visible ring，鍵盤使用者可 focus 開啟 HoverCard 看溢出內容）；HoverCard 內展開的可互動內容（人員 tag / ProfileCard）由各自內容元件負責 focus 管理。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation；HoverCard 內容透過 hover 或 focus 自動顯示（非鍵盤指令觸發）。WCAG AA contrast ≥ 4.5:1（text）/ 3:1（UI）。"}</p>
    </div>
  ),
}

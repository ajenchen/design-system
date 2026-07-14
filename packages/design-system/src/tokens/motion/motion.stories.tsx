// @story-baseline: components/HoverCard/hover-card.stories.tsx#LinkPreview — 延遲體感 demo 消費真實 consumer(Button iconOnly auto-Tooltip + HoverCard 預設 delay),非手刻浮層
import type { Meta, StoryObj } from '@storybook/react'
import { Download } from 'lucide-react'
import { Button } from '@/design-system/components/Button/button'
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from '@/design-system/components/HoverCard/hover-card'

const meta: Meta = {
  title: 'Design System/Tokens/Motion',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
Motion token 系統。\`--motion-*\` 統一前綴下**兩個 sub-family**(2026-07-11 Phase 1-4 起;原「唯一家族 = hover delay」敘述已過時):

**(A) delay 3-tier**(「hover 觸發 → 延遲 N ms → overlay 顯示」)——目的不是動畫長度,是「user 真的想看」過濾器。

**(B) 進出場動畫**(overlay fade/zoom/slide 的 duration / easing / 幾何)——\`--motion-duration-{overlay,surface}\` + \`--motion-easing-{enter,exit}\` + \`--motion-enter-{distance,scale}\`,由 tw-animate-css 的 \`--tw-duration\` / \`--tw-ease\` 變數綁定;共用 SSOT = \`overlay-motion.ts\`(overlayMotion / surfaceMotion)。

完整規則:\`packages/design-system/src/tokens/motion/motion.spec.md\`

**JS mirror**:Radix props(\`delayDuration\` / \`openDelay\` / \`closeDelay\`)只吃 number 不認 CSS var,故 consumer 消費 \`motion.ts\` 的 \`MOTION_DELAY_PLAIN_MS\` / \`MOTION_DELAY_RICH_MS\` / \`MOTION_DELAY_CLOSE_MS\`(與 \`motion.css\` 同值鏡像)。
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


function DelayRow({ token, value, usage, consumers }: {
  token: string; value: string; usage: string; consumers: string
}) {
  return (
    <div className="grid items-center gap-x-6 gap-y-1 border-b border-border py-4 last:border-0"
      style={{ gridTemplateColumns: '200px 80px 1fr 220px' }}>
      <div>
        <code className="block text-caption font-medium text-fg-secondary">{token}</code>
      </div>
      <div className="text-caption font-mono text-fg-muted">{value}</div>
      <div className="text-body text-foreground">{usage}</div>
      <div className="text-caption text-fg-muted">{consumers}</div>
    </div>
  )
}


export const Overview: Story = {
  name: '總覽',
  render: () => (
    <div className="max-w-4xl">
      <h2 className="text-h3 mb-2">Hover Delay Tokens</h2>
      <p className="text-body text-fg-secondary mb-6">
        三層 tier:<code>plain</code>(被動文字提示)/ <code>rich</code>(含 fetch 的內容預覽,門檻更高)/
        <code>close</code>(通用關閉緩衝)。命名對齊 Material 3「plain / rich tooltip」術語 +
        DS 既有 <code>compact / rich</code> mode 詞彙。
      </p>

      <DelayRow
        token="--motion-delay-plain"
        value="500ms"
        usage="純文字提示——被動 hint,user 真停留才觸發,避免滑過列表時 N 次視覺擾動"
        consumers="Tooltip / OverflowIndicator"
      />
      <DelayRow
        token="--motion-delay-rich"
        value="700ms"
        usage="內容預覽——含 fetch / multi-section,避免列表掃視誤觸發 fetch waterfall"
        consumers="HoverCard / ProfileCard / Avatar"
      />
      <DelayRow
        token="--motion-delay-close"
        value="200ms"
        usage="通用關閉緩衝——mouse leave 後 200ms 內移回不會關(誤滑出容錯)"
        consumers="所有 hover overlay"
      />

      {/* 2026-07-14 Dim 68 修:補 (B) 進出場動畫 sub-family 展示 — 原頁只列 delay,
          與 motion.css / motion.spec.md 兩 sub-family 現況 drift(「系統無 duration/easing token」已過時)。
          世界級對照值 cite:tokens/motion/motion.spec.md#L113-L116 表(m3.material.io/styles/motion/easing-and-duration
          + carbondesignsystem.com/guidelines/motion/overview,spec frontmatter benchmark 段)。 */}
      <h2 className="text-h3 mb-2 mt-10">進出場動畫 Tokens</h2>
      <p className="text-body text-fg-secondary mb-6">
        Overlay fade/zoom/slide 的 duration / easing / 幾何,由 tw-animate-css 的
        <code>--tw-duration</code> / <code>--tw-ease</code> 變數綁定;共用 SSOT =
        <code>overlay-motion.ts</code>(overlayMotion / surfaceMotion)。世界級對照見
        <code>motion.spec.md</code>「進出場動畫 token」表。
      </p>

      <DelayRow
        token="--motion-duration-overlay"
        value="150ms"
        usage="輕量浮層進出場(對照表 cite: motion.spec.md#L113)"
        consumers="Tooltip / Popover / HoverCard / DropdownMenu"
      />
      <DelayRow
        token="--motion-duration-surface"
        value="250ms"
        usage="模態面板進出場——面積大、位移遠,慢一階(對照表 cite: motion.spec.md#L114)"
        consumers="Dialog / Sheet / FileViewer"
      />
      <DelayRow
        token="--motion-easing-enter"
        value="0,0,0,1"
        usage="進場減速曲線——快起、平滑落定(對照表 cite: motion.spec.md#L115)"
        consumers="所有 overlay 進場"
      />
      <DelayRow
        token="--motion-easing-exit"
        value="0.3,0,1,1"
        usage="出場加速曲線(對照表 cite: motion.spec.md#L116)"
        consumers="所有 overlay 出場"
      />
      <DelayRow
        token="--motion-enter-distance"
        value="0.5rem"
        usage="slide 進場位移(沿用現行 slide-*-2 幾何,cite: motion.css#L24)"
        consumers="slide 型進場 overlay"
      />
      <DelayRow
        token="--motion-enter-scale"
        value="0.95"
        usage="zoom 進場 scale(沿用現行 zoom-95 幾何,cite: motion.css#L25)"
        consumers="zoom 型進場 overlay"
      />

      <p className="text-caption text-fg-muted mt-6">
        實際 CSS 值見 <code>packages/design-system/src/tokens/motion/motion.css</code>;
        JS number 鏡像見同目錄 <code>motion.ts</code>;tier 選擇表(何時用哪 token)見 <code>motion.spec.md</code>。
      </p>
    </div>
  ),
}


/* 延遲體感 — 用真實 consumer 展示三個 token 的實際時序(非模擬動畫):
   Tooltip 走全域 TooltipProvider delayDuration=500(= plain);
   HoverCard Root 預設 openDelay=700 / closeDelay=200(= rich / close)。 */
export const DelayFeel: Story = {
  name: '延遲體感',
  render: () => (
    <div className="flex max-w-2xl flex-col gap-8">
      <section className="flex flex-col gap-2">
        <div className="text-body font-medium text-foreground">plain(500ms)— 工具列 icon 按鈕的文字提示</div>
        <p className="text-caption text-fg-secondary">
          hover 下方按鈕停留 500ms 才出現 tooltip;快速滑過不觸發。移開後 tooltip 立即依全域
          Provider 收合節奏消失。
        </p>
        <div>
          <Button iconOnly variant="text" size="sm" startIcon={Download} aria-label="下載簡報" />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-body font-medium text-foreground">rich(700ms)+ close(200ms)— 留言裡的人名預覽卡</div>
        <p className="text-caption text-fg-secondary">
          rich 內容(可能含 fetch)門檻比 plain 高 200ms——必須「真的想看」才停留 700ms;
          移開後 200ms 內移回卡片不會關(close 緩衝)。
        </p>
        <p className="text-body leading-relaxed">
          這版 onboarding 流程的視覺稿請找
          {/* defaultOpen:讓 visual snapshot 看得到卡片(M15 OpenSnapshot);移開再 hover 即體驗 700/200ms 時序 */}
          <HoverCard defaultOpen>
            <HoverCardTrigger asChild>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-primary underline underline-offset-2 mx-1 cursor-pointer"
              >
                陳美惠
              </a>
            </HoverCardTrigger>
            <HoverCardContent
              className="bg-surface-raised border border-border rounded-lg p-4"
              style={{ boxShadow: 'var(--elevation-200)', width: 260 }}
            >
              <div className="flex flex-col gap-1">
                <div className="text-body font-medium text-foreground">陳美惠</div>
                <div className="text-caption text-fg-secondary">產品設計師 · Design Platform</div>
                <div className="text-footnote text-fg-muted">台北 · GMT+8 · 上班時間 10:00–19:00</div>
              </div>
            </HoverCardContent>
          </HoverCard>
          確認,她負責這一季的設計系統整合。
        </p>
      </section>
    </div>
  ),
}

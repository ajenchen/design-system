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
Motion token 系統。目前唯一 token 家族 = **hover delay 3-tier**(「hover 觸發 → 延遲 N ms → overlay 顯示」)——目的不是動畫長度,是「user 真的想看」過濾器;overlay 開閉的 enter / exit 動畫由 Radix data-state + CSS 處理,系統**無** duration / easing token。

完整規則:\`packages/design-system/src/tokens/motion/motion.spec.md\`

**JS mirror**:Radix props(\`delayDuration\` / \`openDelay\` / \`closeDelay\`)只吃 number 不認 CSS var,故 consumer 消費 \`motion.ts\` 的 \`HOVER_DELAY_PLAIN_MS\` / \`HOVER_DELAY_RICH_MS\` / \`HOVER_DELAY_CLOSE_MS\`(與 \`motion.css\` 同值鏡像)。
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
        token="--hover-delay-plain"
        value="500ms"
        usage="純文字提示——被動 hint,user 真停留才觸發,避免滑過列表時 N 次視覺擾動"
        consumers="Tooltip / OverflowIndicator"
      />
      <DelayRow
        token="--hover-delay-rich"
        value="700ms"
        usage="內容預覽——含 fetch / multi-section,避免列表掃視誤觸發 fetch waterfall"
        consumers="HoverCard / ProfileCard / Avatar"
      />
      <DelayRow
        token="--hover-delay-close"
        value="200ms"
        usage="通用關閉緩衝——mouse leave 後 200ms 內移回不會關(誤滑出容錯)"
        consumers="所有 hover overlay"
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

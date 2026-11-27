// @story-baseline: packages/design-system/src/components/DataTable/data-table.stories.tsx#WithBulkActions — 標題塊量測(test-only):表格上方的搜尋列照工具列用 Input sm(同 stories-helpers/scene/data-toolbar.tsx)
import type { Meta, StoryObj } from '@storybook/react-vite'
import { createColumnHelper } from '@tanstack/react-table'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/design-system/components/Button/button'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import { Input } from '@/design-system/components/Input/input'
import { TutorialPage, TutorialSection, TutorialList } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Tokens/LayoutSpace',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
版面間距 token 系統。定義 pattern 層級的「鬆 / 緊 / 底」間距,跟 \`--field-height\` 等元件 token 分層。

**何時用 token vs Tailwind 數字 utility?**
- pattern 結構間距(toolbar / surface header / row inside)→ token
- 局部 fine-tune(icon 跟 label 距離,單 component 內)→ Tailwind \`gap-N\` OK
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


function SpaceRow({ utility, mdValue, lgValue, usage }: {
  utility: string
  mdValue: string
  lgValue: string
  usage: string
}) {
  return (
    // @layout-space-magic-ok: token 表同質列 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值)
    <div className="grid items-center gap-x-6 gap-y-1 border-b border-border py-4 last:border-0"
      style={{ gridTemplateColumns: '220px 80px 80px 1fr 100px' }}>
      <div>
        <code className="block text-caption font-medium text-fg-secondary">{utility}</code>
      </div>
      <div className="text-caption font-mono text-fg-secondary">md: {mdValue}</div>
      <div className="text-caption font-mono text-fg-secondary">lg: {lgValue}</div>
      <div className="text-body text-foreground">{usage}</div>
      <div className="flex items-center justify-end">
        <div aria-hidden="true" className="bg-primary h-6" style={{ width: mdValue }} />
      </div>
    </div>
  )
}


// ── 標題塊量測(test-only)────────────────────────────────────────────────
// layoutSpace.spec.md 規則 3「標題塊」的量測對象:`scripts/section-gap-invariant.mjs` 的 title-block 列。
// DS 文件頁先不改(user 2026-11-27 選「先不改」)→ 不做讀者範例,只給量測(story-rules.md「Technical probe visibility」)。
// 情境:任務類型設定頁的三塊。data-tb-gap = 上面那一列(text = 字列、control = 有框控件列),data-tb-gap-to = 它下面那一列;
// data-tb-block = 一整塊(塊與塊之間 loose)。標題字級用內文 14 / 21 + font-medium【AI 推導 2026-11-27:規格算法「14px 字、行高 21」】。
type TaskType = { name: string; category: string }
const typeCol = createColumnHelper<TaskType>()
const typeColumns = [
  typeCol.accessor('name', { header: '名稱', meta: { type: 'string', width: 240 } }),
  typeCol.accessor('category', { header: '分類', meta: { type: 'string', width: 160 } }),
]
const statuses: TaskType[] = [
  { name: '待處理', category: '未開始' },
  { name: '進行中', category: '已開始' },
  { name: '已完成', category: '已結束' },
]
const priorities: TaskType[] = [
  { name: '緊急', category: '24 小時內回覆' },
  { name: '一般', category: '本週內處理' },
]
const labels: TaskType[] = [
  { name: '前端', category: '工程' },
  { name: '設計稿', category: '設計' },
]

function TitleBlockScene() {
  return (
    <div className="flex max-w-3xl flex-col gap-[var(--layout-space-loose)]" data-title-block-probe="">
      {/* 塊 1:標題(右邊無框小圖示鈕,不撐高這一列)→ 表 = 8 */}
      <section className="flex flex-col gap-2" data-tb-block="statuses" aria-labelledby="tb-statuses">
        <div className="flex items-start justify-between">
          <h3 id="tb-statuses" className="text-body font-medium" data-tb-gap="statuses:text">Statuses</h3>
          <span className="flex h-[1lh] items-center">
            <Button size="xs" iconOnly variant="text" startIcon={Plus} aria-label="新增狀態" />
          </span>
        </div>
        <div data-tb-gap-to="statuses:text">
          <DataTable columns={typeColumns} data={statuses} maxHeight="none" />
        </div>
      </section>
      {/* 塊 2:標題 → 搜尋列 → 表 = 8,再 tight */}
      <section className="flex flex-col gap-2" data-tb-block="priorities" aria-labelledby="tb-priorities">
        <h3 id="tb-priorities" className="text-body font-medium" data-tb-gap="priorities:text">Priorities</h3>
        <div className="flex flex-col gap-[var(--layout-space-tight)]" data-tb-gap-to="priorities:text">
          <div className="flex" data-tb-gap="priorities:control">
            <Input size="sm" startIcon={Search} placeholder="搜尋優先順序" aria-label="搜尋優先順序" className="max-w-xs" />
          </div>
          <div data-tb-gap-to="priorities:control">
            <DataTable columns={typeColumns} data={priorities} maxHeight="none" />
          </div>
        </div>
      </section>
      {/* 塊 3:標題列放有框按鈕 = 有框控件列 → 表 = tight */}
      <section className="flex flex-col gap-[var(--layout-space-tight)]" data-tb-block="labels" aria-labelledby="tb-labels">
        <div className="flex items-center justify-between" data-tb-gap="labels:control">
          <h3 id="tb-labels" className="text-body font-medium">Labels</h3>
          <Button size="sm" variant="tertiary" startIcon={Plus}>新增標籤</Button>
        </div>
        <div data-tb-gap-to="labels:control">
          <DataTable columns={typeColumns} data={labels} maxHeight="none" />
        </div>
      </section>
    </div>
  )
}

export const Overview: Story = {
  name: '總覽',
  render: () => (
    <TutorialPage>
      {/* 表格寬 = 原本的整頁 max-w-5xl(頁根不再自訂寬,BA-tutorial-width);下方規則清單是段落文字,跟著頁寬 */}
      <TutorialSection title="Layout Space Tokens">
        <div className="max-w-5xl">
          <p className="text-body text-fg-secondary mb-[var(--layout-space-tight)]">
            Pattern 層級間距 token,跟 density 連動(md / lg 兩個值)。下表展示 md density 預覽。
          </p>

          <SpaceRow utility="--layout-space-tight" mdValue="12px" lgValue="16px" usage="header / footer 上下 padding;緊密 inline gap" />
          <SpaceRow utility="--layout-space-loose" mdValue="16px" lgValue="24px" usage="surface 左右 padding;tabs trigger gap;form field 間距" />
          <SpaceRow utility="--layout-space-bottom" mdValue="48px" lgValue="48px" usage="body 收尾的結論留白(會擋住頁面或高度撐滿的容器,例如 Dialog / Sheet body 底部;固定,不隨 density)" />
          <SpaceRow utility="--layout-space-viewport-inset" mdValue="48px" lgValue="48px" usage="浮層外殼 → 視窗邊的安全距離(Dialog 高度上限與最大寬度;AppShell 的 AI agent 浮層左側、Menu 浮層右側至少留這麼多;固定,不隨 density)" />
        </div>
      </TutorialSection>

      <TutorialSection title="使用規則">
        <div>
          <TutorialList>
            <li>跨範疇 + functional 交互 → <code>tight</code>(12/16);同範疇 / bundled → 元件 spec 自管</li>
            <li>跨範疇 + parallel → <code>loose</code>(16/24)</li>
            <li>容器底看最後一個東西:一般元素(欄位 / 文字 / 按鈕)→ 容器會擋住頁面或高度撐滿時 <code>bottom</code>(48,不隨 density),不擋頁面、高度貼著內容時跟頂部同值;有框區塊 → <code>loose</code>;無框清單 → 0</li>
          </TutorialList>
        </div>
      </TutorialSection>
    </TutorialPage>
  ),
}

export const TitleBlockProbe: Story = {
  name: '標題塊量測',
  tags: ['test-only'],
  render: () => <TitleBlockScene />,
}

import type { Meta, StoryObj } from '@storybook/react'
import { TutorialPage, TutorialSection } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Tokens/Elevation',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
陰影系統。兩個層級對應兩種「浮起高度」，用 CSS 變數 \`box-shadow\` 實現。Light / dark mode 自動切換。

完整規則：\`packages/design-system/src/tokens/elevation/elevation.spec.md\`

**⚠️ \`--elevation-200\` 的容器必須搭配 \`bg-surface-raised\`（不透明）。**
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj




export const Overview: Story = {
  name: '總覽',
  render: () => (
    // 段落 = 共用教學頁元件的 TutorialSection(2026-10-20 T7 甲):段落之間 loose × 2(md 32 / lg 48),
    // 不小於 elevation-200 模糊半徑 32px(primitives.css:248)—— 原本 space-y-8 要守的「兩個陰影不相融」照樣成立
    <TutorialPage>
      <TutorialSection title="elevation-100 — Card">
        {/* 樣本卡寬 224px:卡內距吃 loose(lg 24px)後,最長的 token 名「--elevation-200-hover」仍放得下一行(寬 192px 時 lg 會在「-hover」前斷行) */}
        {/* @layout-space-magic-ok: 並列陰影樣本卡之間 32px = elevation-200 模糊半徑(primitives.css:248)的留白(layoutSpace.spec.md:167 視覺平衡) */}
        <div className="flex flex-wrap gap-8">
          <div
            className="flex h-24 w-56 flex-col items-start justify-end rounded-md border border-border bg-surface p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-100)' }}
          >
            <code className="text-caption font-medium">--elevation-100</code>
            <span className="text-caption text-fg-muted">靜止狀態</span>
          </div>
          <div
            className="flex h-24 w-56 flex-col items-start justify-end rounded-md border border-border bg-surface p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-100-hover)' }}
          >
            <code className="text-caption font-medium">--elevation-100-hover</code>
            <span className="text-caption text-fg-muted">hover / 拖拽</span>
          </div>
        </div>
      </TutorialSection>

      <TutorialSection title="elevation-200 — Modal / Popover / Dropdown">
        {/* @layout-space-magic-ok: 並列陰影樣本卡之間 32px = elevation-200 模糊半徑(primitives.css:248)的留白(layoutSpace.spec.md:167 視覺平衡) */}
        <div className="flex flex-wrap gap-8">
          <div
            className="flex h-24 w-56 flex-col items-start justify-end rounded-lg border border-border bg-surface-raised p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-200)' }}
          >
            <code className="text-caption font-medium">--elevation-200</code>
            <span className="text-caption text-fg-muted">靜止狀態</span>
          </div>
          <div
            className="flex h-24 w-56 flex-col items-start justify-end rounded-lg border border-border bg-surface-raised p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-200-hover)' }}
          >
            <code className="text-caption font-medium">--elevation-200-hover</code>
            <span className="text-caption text-fg-muted">hover 狀態</span>
          </div>
        </div>
      </TutorialSection>

      <TutorialSection title="層級對比 — Card 在下，Popover 浮在上">
        <div className="relative flex h-52 w-full max-w-lg items-center justify-center rounded-md bg-canvas">
          <div
            className="absolute left-8 top-8 h-28 w-40 rounded-md border border-border bg-surface p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-100)' }}
          >
            <span className="text-caption text-fg-muted">Card（100）</span>
          </div>
          {/* Popover 疊在 Card 右下角上(左上角落在 Card 內 64 × 64px),才看得出「浮在上」:陰影落在 Card 上、邊框蓋過 Card 的邊。
              2026-10-20 前兩張卡水平相距 120px、完全不重疊,標題說的「浮在上」看不到(獨立驗證 OV-V06) */}
          <div
            className="absolute left-32 top-20 h-28 w-44 rounded-lg border border-border bg-surface-raised p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-200)' }}
          >
            <span className="text-caption text-fg-muted">Popover（200）</span>
          </div>
        </div>
      </TutorialSection>
    </TutorialPage>
  ),
}

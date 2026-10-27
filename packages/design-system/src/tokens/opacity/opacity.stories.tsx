import type { Meta, StoryObj } from '@storybook/react'
import { TutorialPage, TutorialSection } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Tokens/Opacity',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
透明度 token 系統。系統內唯一 opacity token = \`--opacity-disabled\`(disabled 狀態);其他透明度需求走 alpha 色階(\`--white-aN\` / \`--black-aN\`),不另開 opacity token。

**禁:**\`opacity-{5..95}\` 數字 ladder 與 arbitrary \`opacity-[0.N]\`(走 token,不直接寫死);\`opacity-0\` / \`opacity-100\`(show / hide transition)與 \`opacity-disabled\` 為 utility-registry allow。
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


function OpacityRow({ utility, value, usage }: { utility: string; value: string; usage: string }) {
  return (
    // @layout-space-magic-ok: token 表同質列 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值)
    <div className="grid items-center gap-x-6 gap-y-1 border-b border-border py-4 last:border-0"
      style={{ gridTemplateColumns: '180px 100px 1fr 200px' }}>
      <div>
        <code className="block text-caption font-medium text-fg-secondary">{utility}</code>
      </div>
      <div className="text-caption font-mono text-fg-muted">{value}</div>
      <div className="text-body text-foreground">{usage}</div>
      {/* @layout-space-magic-ok: 色塊 ↔ 標籤 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值) */}
      <div className="flex items-center gap-2">
        <div
          aria-hidden="true"
          className="h-8 w-8 rounded bg-primary"
          style={{ opacity: parseFloat(value) }}
        />
        <span className="text-caption text-fg-muted">preview</span>
      </div>
    </div>
  )
}


export const Overview: Story = {
  name: '總覽',
  render: () => (
    <TutorialPage className="max-w-4xl">
      <TutorialSection title="Opacity Tokens">
        <div>
          <p className="text-body text-fg-secondary mb-[var(--layout-space-tight)]">
            本系統只定義 1 個 opacity token——<code>--opacity-disabled</code>(0.45,系統內唯一)。
            其他透明度需求走 alpha 色階(<code>--white-aN</code> / <code>--black-aN</code>),不另開 opacity token;
            值不隨 dark mode 切換(light / dark 共用 0.45)。
          </p>

          <OpacityRow utility="opacity-disabled" value="0.45" usage="所有元件的 disabled 狀態(token swap 為主、opacity blanket 為輔)" />
        </div>
      </TutorialSection>
    </TutorialPage>
  ),
}

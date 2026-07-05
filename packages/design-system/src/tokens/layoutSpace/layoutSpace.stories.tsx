import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta = {
  title: 'Design System/Tokens/LayoutSpace',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
版面間距 token 系統。定義 pattern 層級的「鬆 / 緊 / 底」間距,跟 \`--field-height\` 等元件 token 分層。

完整規則:\`packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md\`

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
    <div className="grid items-center gap-x-6 gap-y-1 border-b border-border py-4 last:border-0"
      style={{ gridTemplateColumns: '220px 80px 80px 1fr 100px' }}>
      <div>
        <code className="block text-caption font-medium text-fg-secondary">{utility}</code>
      </div>
      <div className="text-caption font-mono text-fg-muted">md: {mdValue}</div>
      <div className="text-caption font-mono text-fg-muted">lg: {lgValue}</div>
      <div className="text-body text-foreground">{usage}</div>
      <div className="flex items-center justify-end">
        <div className="bg-primary h-6" style={{ width: mdValue }} aria-label={`${utility} preview`} />
      </div>
    </div>
  )
}


export const Overview: Story = {
  name: '總覽',
  render: () => (
    <div className="max-w-5xl">
      <h2 className="text-h3 mb-2">Layout Space Tokens</h2>
      <p className="text-body text-fg-secondary mb-6">
        Pattern 層級間距 token,跟 density 連動(md / lg 兩個值)。下表展示 md density 預覽。
      </p>

      <SpaceRow utility="--layout-space-tight" mdValue="12px" lgValue="16px" usage="header / footer 上下 padding;緊密 inline gap" />
      <SpaceRow utility="--layout-space-loose" mdValue="16px" lgValue="24px" usage="surface 左右 padding;tabs trigger gap;form field 間距" />
      <SpaceRow utility="--layout-space-bottom" mdValue="48px" lgValue="48px" usage="Dialog / Sheet body 底部多一拍 + modal viewport inset(固定,不隨 density)" />

      <h3 className="text-h5 mt-8 mb-2">使用規則</h3>
      <ul className="list-disc pl-6 text-body text-fg-secondary space-y-1">
        <li>跨範疇 + functional 交互 → <code>tight</code>(12/16);同範疇 / bundled → 元件 spec 自管</li>
        <li>跨範疇 + parallel → <code>loose</code>(16/24)</li>
        <li>容器最底部 → <code>bottom</code>(48 固定)</li>
      </ul>

      <p className="text-caption text-fg-muted mt-6">
        實際 CSS 值見 <code>packages/design-system/src/tokens/layoutSpace/layoutSpace.css</code>;規則 6 條(親疏判)詳 spec.md。
      </p>
    </div>
  ),
}

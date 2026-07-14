// @story-trait-rationale: hasSizes 由 anatomy.stories.tsx SizeMatrix auto-compile owns size showcase(2026-05-15 F-migration);Default scenario 由 WithLabel / HorizontalLayout 等真實 form 情境 story 覆蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { RadioGroup, RadioGroupItem } from './radio-group'

const meta: Meta<typeof RadioGroupItem> = {
  title: 'Design System/Components/RadioGroup/展示',
  component: RadioGroupItem,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof RadioGroupItem>

// 2026-07-14 dim-68 修:展示層原直用 internal <SelectionItem control={...} htmlFor>(selection-item.spec.md
// 「何時用」明文禁止裸用)→ 收斂為公開 <RadioGroupItem value label description>(自動 wire SelectionItem
// + id/htmlFor),與同元件 principles / anatomy 層一致 — 三層 story 一律示範公開 API。

// @story-trait-rationale: pre-existing trait gaps tracked separately; this PR scope = add Modes story with display card.
/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => (
    <div className="flex flex-col gap-6 max-w-md">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
        <RadioGroup defaultValue="yearly" aria-label="付款方案(edit mode demo)">
          <RadioGroupItem value="monthly" label="月付方案" />
          <RadioGroupItem value="yearly" label="年付方案" description="每年 $2,990，省下兩個月" />
          <RadioGroupItem value="lifetime" label="終身方案" />
        </RadioGroup>
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">display</h3>
        <RadioGroup mode="display" value="yearly" aria-label="付款方案(display mode demo)">
          <RadioGroupItem value="monthly" label="月付方案" />
          <RadioGroupItem value="yearly" label="年付方案" description="每年 $2,990，省下兩個月" />
          <RadioGroupItem value="lifetime" label="終身方案" />
        </RadioGroup>
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <RadioGroup mode="readonly" value="yearly" aria-label="付款方案(readonly mode demo)">
          <RadioGroupItem value="monthly" label="月付方案" />
          <RadioGroupItem value="yearly" label="年付方案" />
          <RadioGroupItem value="lifetime" label="終身方案" />
        </RadioGroup>
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        {/* mode="disabled" → Radix Root disabled 原生 propagate 全 item(radio 控件真停用);
            RadioGroupDisabledContext 同步讓每個 item 的 label/description 降 text-fg-disabled */}
        <RadioGroup mode="disabled" value="yearly" aria-label="付款方案(disabled mode demo)">
          <RadioGroupItem value="monthly" label="月付方案" />
          <RadioGroupItem value="yearly" label="年付方案" />
          <RadioGroupItem value="lifetime" label="終身方案" />
        </RadioGroup>
      </div>
    </div>
  ),
}

// @story-trait-rationale: States retired 2026-05-17 per audit Dim 24 —
//   anatomy.stories.tsx SizeMatrix + StateBehavior own size/state trait grid。
//   展示層保留 typical real-product Group 情境(Vertical/Horizontal/Modes)。

/* ── 垂直 Group ── */
export const VerticalGroup: Story = {
  name: '直式群組',
  render: () => (
    <div className="flex flex-col gap-4 max-w-md">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <p className="text-caption text-fg-muted mb-1">size="{size}"</p>
          <RadioGroup defaultValue="monthly">
            <RadioGroupItem size={size} value="monthly" label="月付方案" />
            <RadioGroupItem size={size} value="yearly" label="年付方案" description="每年 $2,990，省下兩個月" />
            <RadioGroupItem size={size} value="lifetime" label="終身方案" />
          </RadioGroup>
        </div>
      ))}
    </div>
  ),
}

/* ── 水平排列 ── */
export const Horizontal: Story = {
  name: '水平排列',
  render: () => (
    <RadioGroup defaultValue="light" className="flex gap-6 max-w-md">
      <RadioGroupItem value="light" label="淺色" />
      <RadioGroupItem value="dark" label="深色" />
      <RadioGroupItem value="system" label="系統" />
    </RadioGroup>
  ),
}

// @story-trait-rationale: Disabled retired 2026-07-14 per audit Dim 24 —
//   disabled 覆蓋已由 Modes story 的 disabled 列 + anatomy StateBehavior
//   「Mutual Exclusion + Disabled Item Matrix」owns;對齊 Checkbox / Switch
//   同 Family 已 retire 的獨立 Disabled story。

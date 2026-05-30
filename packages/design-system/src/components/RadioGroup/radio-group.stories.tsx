// @story-trait-rationale: hasSizes 由 anatomy.stories.tsx SizeMatrix auto-compile owns size showcase(2026-05-15 F-migration);Default scenario 由 WithLabel / HorizontalLayout 等真實 form 情境 story 覆蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { RadioGroup, RadioGroupItem } from './radio-group'
import { SelectionItem } from '@/design-system/components/SelectionControl/selection-item'

const meta: Meta<typeof RadioGroupItem> = {
  title: 'Design System/Components/RadioGroup/展示',
  component: RadioGroupItem,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof RadioGroupItem>

// @story-trait-rationale: pre-existing trait gaps tracked separately; this PR scope = add Modes story with display card.
/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => (
    <div className="flex flex-col gap-6 max-w-md">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
        <RadioGroup defaultValue="yearly" aria-label="付款方案(edit mode demo)">
          <SelectionItem control={<RadioGroupItem value="monthly" id="m-edit" />} label="月付方案" htmlFor="m-edit" />
          <SelectionItem control={<RadioGroupItem value="yearly" id="y-edit" />} label="年付方案" description="每年 $2,990，省下兩個月" htmlFor="y-edit" />
          <SelectionItem control={<RadioGroupItem value="lifetime" id="l-edit" />} label="終身方案" htmlFor="l-edit" />
        </RadioGroup>
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">display</h3>
        <RadioGroup mode="display" value="yearly" aria-label="付款方案(display mode demo)">
          <SelectionItem control={<RadioGroupItem value="monthly" id="m-disp" />} label="月付方案" htmlFor="m-disp" />
          <SelectionItem control={<RadioGroupItem value="yearly" id="y-disp" />} label="年付方案" description="每年 $2,990，省下兩個月" htmlFor="y-disp" />
          <SelectionItem control={<RadioGroupItem value="lifetime" id="l-disp" />} label="終身方案" htmlFor="l-disp" />
        </RadioGroup>
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <RadioGroup value="yearly" aria-label="付款方案(readonly mode demo)">
          <SelectionItem control={<RadioGroupItem value="monthly" id="m-ro" readOnly />} label="月付方案" htmlFor="m-ro" />
          <SelectionItem control={<RadioGroupItem value="yearly" id="y-ro" readOnly />} label="年付方案" htmlFor="y-ro" />
          <SelectionItem control={<RadioGroupItem value="lifetime" id="l-ro" readOnly />} label="終身方案" htmlFor="l-ro" />
        </RadioGroup>
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        <RadioGroup value="yearly" aria-label="付款方案(disabled mode demo)">
          <SelectionItem control={<RadioGroupItem value="monthly" id="m-dis" />} label="月付方案" htmlFor="m-dis" disabled />
          <SelectionItem control={<RadioGroupItem value="yearly" id="y-dis" />} label="年付方案" htmlFor="y-dis" disabled />
          <SelectionItem control={<RadioGroupItem value="lifetime" id="l-dis" />} label="終身方案" htmlFor="l-dis" disabled />
        </RadioGroup>
      </div>
    </div>
  ),
}

// @story-trait-rationale: States retired 2026-05-17 per audit Dim 24 —
//   anatomy.stories.tsx SizeMatrix + StateBehavior own size/state trait grid。
//   展示層保留 typical real-product Group 情境(Vertical/Horizontal/Modes/Disabled)。

/* ── 垂直 Group ── */
export const VerticalGroup: Story = {
  name: '直式群組',
  render: () => (
    <div className="flex flex-col gap-4 max-w-md">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <p className="text-caption text-fg-muted mb-1">size="{size}"</p>
          <RadioGroup defaultValue="monthly">
            <SelectionItem size={size} control={<RadioGroupItem value="monthly" id={`${size}-monthly`} size={size} />} label="月付方案" htmlFor={`${size}-monthly`} />
            <SelectionItem size={size} control={<RadioGroupItem value="yearly" id={`${size}-yearly`} size={size} />} label="年付方案" description="每年 $2,990，省下兩個月" htmlFor={`${size}-yearly`} />
            <SelectionItem size={size} control={<RadioGroupItem value="lifetime" id={`${size}-lifetime`} size={size} />} label="終身方案" htmlFor={`${size}-lifetime`} />
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
      <SelectionItem control={<RadioGroupItem value="light" id="h-light" />} label="淺色" htmlFor="h-light" />
      <SelectionItem control={<RadioGroupItem value="dark" id="h-dark" />} label="深色" htmlFor="h-dark" />
      <SelectionItem control={<RadioGroupItem value="system" id="h-system" />} label="系統" htmlFor="h-system" />
    </RadioGroup>
  ),
}

/* ── Disabled ── */
export const Disabled: Story = {
  name: '停用',
  render: () => (
    <RadioGroup defaultValue="bank" className="max-w-sm">
      <SelectionItem control={<RadioGroupItem value="bank" id="dis-a" disabled />} label="銀行轉帳" description="帳單已開立,付款方式鎖定" htmlFor="dis-a" disabled />
      <SelectionItem control={<RadioGroupItem value="invoice" id="dis-b" disabled />} label="月結發票" description="需企業方案才能使用" htmlFor="dis-b" disabled />
    </RadioGroup>
  ),
}

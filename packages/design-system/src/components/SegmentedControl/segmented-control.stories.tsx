// @story-trait-rationale: 6 stories(Default/WithStartIcon/WithBadge/IconOnly/FullWidth/Disabled)
// 2026-05-17 retire per audit Dim 24:跟 anatomy.stories.tsx 4 個 matrix
// (Overview/IconOnlyMatrix/FullWidthMatrix/StateBehavior)完全 trait-grid 重複,無 unique teaching。
// 真實業務情境靠 principles.stories.tsx 的 UsageGuidance / IconOnlyRule / FullWidthRule;
// trait matrix 靠 anatomy.stories.tsx;本檔保留 1 典型「Jira-style view switcher」入口情境。
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { List, LayoutGrid, Calendar } from 'lucide-react'
import { SegmentedControl, SegmentedControlItem } from './segmented-control'

const meta: Meta<typeof SegmentedControl> = {
  title: 'Design System/Components/SegmentedControl/展示',
  component: SegmentedControl,
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj<typeof SegmentedControl>

// 典型 Jira / Notion / Linear view switcher 入口情境(對齊 mindset #4「真實業務場景」)
export const ViewSwitcher: Story = {
  name: '視圖切換器',
  render: () => {
    const [view, setView] = useState('list')
    return (
      <SegmentedControl value={view} onValueChange={setView}>
        <SegmentedControlItem value="list" startIcon={List}>清單</SegmentedControlItem>
        <SegmentedControlItem value="board" startIcon={LayoutGrid}>看板</SegmentedControlItem>
        <SegmentedControlItem value="calendar" startIcon={Calendar}>行事曆</SegmentedControlItem>
      </SegmentedControl>
    )
  },
}

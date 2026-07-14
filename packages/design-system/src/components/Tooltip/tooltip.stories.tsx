import type { Meta, StoryObj } from '@storybook/react'
import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'
import { Button } from '../Button/button'

const meta: Meta<typeof TooltipContent> = {
  title: 'Design System/Components/Tooltip/展示',
  component: TooltipContent,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '補充畫面上未能清楚傳達的資訊。hover 或 focus 時出現。',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="flex items-center justify-center p-16">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TooltipContent>

/* ── 基本用法 ── */
export const Default: Story = {
  name: '基本用法',
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant="secondary" startIcon={Info}>
          自動套用品牌
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>付款頁會自動帶入你的 logo 與主色</p>
      </TooltipContent>
    </Tooltip>
  ),
}

/* ── 非 Button 元素搭配 Tooltip ── */
export const NonButtonTrigger: Story = {
  name: '非 Button 元素',
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-body text-error cursor-default underline underline-offset-2 decoration-dotted">
          停權中
        </span>
      </TooltipTrigger>
      <TooltipContent>此帳號已於 2024/12/01 被管理員停權</TooltipContent>
    </Tooltip>
  ),
}

// Retired 2026-07-14 audit Dim 24:`Placement` 四方向展示是 anatomy PlacementReference
// (tooltip.anatomy.stories.tsx)的完整子集(同 top/right/bottom/left grid,anatomy 版含
// 動畫方向 + placement 選擇規則),無額外內容或限制 → retire(earn-existence 2-test 雙 NO)。
// Placement canonical home = anatomy `PlacementReference`。

/* ── 長文字（測試換行） ── */
export const LongText: Story = {
  name: '長文字',
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant="secondary" startIcon={Info}>
          長文字提示
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        API key 會授權第三方應用存取你的工作區資料,請勿公開分享或提交到公開 repo。
      </TooltipContent>
    </Tooltip>
  ),
}

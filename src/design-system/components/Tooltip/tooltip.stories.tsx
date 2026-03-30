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
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant="secondary" startIcon={Info}>
          Hover me
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>這是一個基本的 Tooltip</p>
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

/* ── 四個方向 ── */
export const Placement: Story = {
  name: '方向',
  render: () => (
    <div className="grid grid-cols-3 gap-4 items-center justify-items-center w-[300px]">
      <div />
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="secondary" size="sm">Top</Button>
        </TooltipTrigger>
        <TooltipContent side="top">上方提示</TooltipContent>
      </Tooltip>
      <div />

      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="secondary" size="sm">Left</Button>
        </TooltipTrigger>
        <TooltipContent side="left">左方提示</TooltipContent>
      </Tooltip>
      <div />
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="secondary" size="sm">Right</Button>
        </TooltipTrigger>
        <TooltipContent side="right">右方提示</TooltipContent>
      </Tooltip>

      <div />
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="secondary" size="sm">Bottom</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">下方提示</TooltipContent>
      </Tooltip>
      <div />
    </div>
  ),
}

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
        這是一段較長的提示文字，用來展示超過最大寬度時的自動換行行為。
      </TooltipContent>
    </Tooltip>
  ),
}

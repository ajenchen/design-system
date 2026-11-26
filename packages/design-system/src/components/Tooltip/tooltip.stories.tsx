import type { Meta, StoryObj } from '@storybook/react'
import { Palette } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'
import { Button } from '../Button/button'
import { FieldLabel } from '@/design-system/components/Field/field'
import { Tag } from '@/design-system/components/Tag/tag'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

const meta: Meta<typeof TooltipContent> = {
  title: 'Design System/Components/Tooltip/展示',
  component: TooltipContent,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '為圖示按鈕、截斷文字或不熟悉的控制項補上簡短、不可互動的說明，hover 或 focus 時出現。較豐富或可互動的內容改用 HoverCard 或 Popover；關鍵狀態、錯誤或必須操作的資訊則應直接顯示或使用 Alert。',
      },
    },
  },
  decorators: [
    (Story) => (
      // @layout-space-magic-ok: decorator 四周 64px 畫布留白是範例原值(與已發布版同值,F-S8),讓 Tooltip 浮層落在畫布內;規格沒寫這個值(放行章 (d))
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
    // 觸發點是真的動作(按了套用並跳 Toast),Tooltip 只補一句非必要的說明;只給資訊的 ⓘ 用 FieldLabel info(見「長文字」)
    <>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="tertiary" startIcon={Palette} onClick={() => toast({ variant: 'success', title: '已套用品牌', description: '付款頁已帶入你的 logo 與主色' })}>
            自動套用品牌
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>付款頁會自動帶入你的 logo 與主色</p>
        </TooltipContent>
      </Tooltip>
      <Toaster />
    </>
  ),
}

/* ── 非 Button 元素搭配 Tooltip ── */
export const NonButtonTrigger: Story = {
  name: '非 Button 元素',
  render: () => (
    // 狀態標記 = Tag(不手刻紅字底線);停權原因放 tooltip。Tooltip 要鍵盤到得了才算數 → Tag 給 tabIndex(同 tag.spec.md「Keyboard」截斷時可 focus 的理由)
    <Tooltip>
      <TooltipTrigger asChild>
        <Tag color="red" tabIndex={0}>停權中</Tag>
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
    // 只給資訊的 ⓘ 用 FieldLabel info(不用 Button:Button 有底色與手形,點了也沒事做);長文字超過 280px 自動換行
    <FieldLabel info="API key 會授權第三方應用存取你的工作區資料,請勿公開分享或提交到公開 repo。">API 金鑰</FieldLabel>
  ),
}

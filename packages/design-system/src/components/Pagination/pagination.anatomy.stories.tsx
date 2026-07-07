// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
//   SizeMatrix N/A — 無 size 軸(按鈕固定 size="sm",chrome 級導覽不隨密度縮放;詳 pagination.spec.md「SizeMatrix N/A rationale」)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Pagination } from './pagination'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

type InspectorArgs = {
  page: number
  total: number
}

const meta: Meta = {
  title: 'Design System/Components/Pagination/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj
type InspectorStory = StoryObj<InspectorArgs>

export const Overview: Story = {
  name: '元件總覽',
  render: () => {
    const [page, setPage] = React.useState(5)
    return (
      <div className="flex flex-col gap-10">
        <div>
          <H3>Anatomy</H3>
          <Desc>
            {'nav[aria-label="Pagination"] > ul > li(shadcn 骨架);上下頁 = Button text sm iconOnly,'}
            {'未選數字 = Button text sm、當前頁 = Button secondary(等寬 min-w = field-height-sm,方形節奏對齊 Ant);'}
            {'當前頁 aria-current="page" + 選中 canonical(主色描邊+染字、不染底,semantic.css SSOT);'}
            {'… = MoreHorizontal 純指示(aria-hidden,不可點)。格位恆 ≤ 7(boundary/sibling = 1/1)。'}
          </Desc>
          <Pagination total={240} page={page} onPageChange={setPage} />
        </div>
      </div>
    )
  },
}

export const Inspector: InspectorStory = {
  name: '互動檢視',
  args: { page: 5, total: 240 },
  argTypes: {
    page: { control: { type: 'number', min: 1, max: 500 } },
    total: { control: { type: 'number', min: 0, max: 10000 } },
  },
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Desc>調 page / total 觀察摺疊行為(總頁數 = ceil(total / 20)):≤ 7 頁不摺疊;超過後依當前頁位置單側或雙側摺疊。</Desc>
      <Pagination total={args.total} page={args.page} onPageChange={() => {}} />
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照',
  render: () => (
    <div className="flex flex-col gap-6">
      <Desc>
        數字鈕四態的 token 對照。default / hover / disabled 全數繼承 Button text variant;
        selected(當前頁)消費 DS「持續選中」canonical —— 主色 base 同時染邊框與文字、底色維持
        surface 不染(semantic.css「選中狀態」段 SSOT;與 Chip / SegmentedControl 選中同族)。
      </Desc>
      <table className="text-body">
        <thead>
          <tr><Th>State</Th><Th>text</Th><Th>border</Th><Th>bg</Th></tr>
        </thead>
        <tbody>
          <tr>
            <Td>default</Td>
            <Td><TokenCell token="--fg" display="text-foreground" /></Td>
            <Td mono>transparent(佔位防選中位移)</Td>
            <Td mono>transparent</Td>
          </tr>
          <tr>
            <Td>hover</Td>
            <Td><TokenCell token="--fg" display="text-foreground" /></Td>
            <Td mono>transparent</Td>
            <Td><TokenCell token="--neutral-hover" display="bg-neutral-hover" /></Td>
          </tr>
          <tr>
            <Td>selected(當前頁 = Button secondary)</Td>
            <Td><TokenCell token="--primary" display="text-primary" /></Td>
            <Td><TokenCell token="--primary" display="border-primary" /></Td>
            <Td><TokenCell token="--surface" display="bg-surface(不染底,同 Chip selected)" /></Td>
          </tr>
          <tr>
            <Td>disabled(上下頁邊界)</Td>
            <Td><TokenCell token="--fg-disabled" display="text-fg-disabled" /></Td>
            <Td mono>transparent</Td>
            <Td mono>transparent</Td>
          </tr>
        </tbody>
      </table>
      <div className="flex flex-col gap-2">
        <p className="text-caption text-fg-muted">實例對照(第 1 頁:上一頁 disabled + 當前頁選中):</p>
        <Pagination total={100} page={1} onPageChange={() => {}} />
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => {
    const [page, setPage] = React.useState(2)
    return (
      <div className="flex flex-col gap-6">
        <Desc>
          hover / active / focus-visible 全數繼承 Button:未選數字與上下頁 = text variant(hover 淡灰底、
          active 深一階);當前頁 = secondary variant(hover 升 primary-hover 階、按壓 primary-active,
          無灰底 —— 選中之上的互動 = 同色相升降階)。當前頁是位置指示非 toggle —— 點擊當前頁
          fire onPageChange(同頁),不會「取消選中」。第一頁 / 最後一頁時對應箭頭 disabled
          (focus 掉落行為對齊 Ant / MUI,不做 focus 轉移)。
        </Desc>
        <Pagination total={100} page={page} onPageChange={setPage} />
        <p className="text-caption text-fg-muted">目前在第 {page} 頁 —— 點數字 / 箭頭觀察 controlled 行為。</p>
      </div>
    )
  },
}

export const Accessibility: Story = {
  name: '無障礙',
  render: () => (
    <div className="flex flex-col gap-4 max-w-[720px]">
      <H3>A11y 預設</H3>
      <p className="text-body leading-relaxed whitespace-pre-line">
        {'ARIA:WAI-ARIA 無專門 pagination pattern,公認做法(shadcn / MUI / Atlassian 一致)=\n' +
          '- root <nav aria-label="Pagination">(landmark;英文 pattern 名,follow Breadcrumb 慣例)\n' +
          '- 當前頁 aria-current="page"(不用 aria-pressed —— pressed 是可取消 toggle,當前頁不可取消)\n' +
          '- ellipsis aria-hidden(純視覺指示)\n' +
          '- 上下頁 iconOnly 帶 aria-label(預設「上一頁」/「下一頁」,props 可覆寫)\n\n' +
          '鍵盤:Tab 逐鈕(原生 button 序)、Enter / Space 觸發 —— 全繼承 Button 原生語意,' +
          '不做 roving tabindex(nav landmark 內獨立按鈕群,非 composite widget)。\n\n' +
          '驗證:Storybook a11y 面板 0 critical violation;純鍵盤可完成翻頁與跳頁。'}
      </p>
      <Pagination total={180} page={3} onPageChange={() => {}} />
    </div>
  ),
}

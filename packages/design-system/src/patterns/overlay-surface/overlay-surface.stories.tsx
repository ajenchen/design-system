// @story-baseline: packages/design-system/src/components/Dialog/dialog.stories.tsx#Default
// 2026-05-23 ship per patterns/README.md charter「每 pattern 提供 .stories.tsx 展示」
// overlay-surface 提供 SurfaceHeader / SurfaceBody / SurfaceFooter sub-components — Dialog / Sheet / Popover / HoverCard / Coachmark 消費的 padding SSOT primitive
import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { SurfaceHeader, SurfaceBody, SurfaceFooter } from './overlay-surface'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Internal Patterns/Overlay Surface',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

export const ThreeSlotCompose: Story = {
  name: '標題 / 內容 / 底欄三段組合',
  render: () => (
    <div className="w-[420px] bg-surface border border-divider rounded-md shadow-md overflow-hidden flex flex-col">
      <SurfaceHeader>
        <span className="text-body font-medium">刪除這個專案?</span>
      </SurfaceHeader>
      <SurfaceBody>
        <p className="text-body">刪除後 30 天內可從垃圾桶還原,30 天後永久消失。</p>
      </SurfaceBody>
      <SurfaceFooter>
        <Button variant="text" size="sm">取消</Button>
        <Button variant="solid" tone="danger" size="sm">刪除</Button>
      </SurfaceFooter>
    </div>
  ),
}

export const HeaderOnly: Story = {
  name: '僅標題段(小型提示彈窗)',
  render: () => (
    <div className="w-[280px] bg-surface border border-divider rounded-md shadow-md overflow-hidden">
      <SurfaceHeader>
        <span className="text-body font-medium">已儲存草稿</span>
      </SurfaceHeader>
    </div>
  ),
}

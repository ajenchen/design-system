// @story-baseline: packages/design-system/src/components/Sidebar/sidebar.stories.tsx#IconCollapse
// 2026-05-23 ship per patterns/README.md charter「每 pattern 提供 .stories.tsx 展示」
// header-canonical 是 chrome + overlay 兩 header 家族的 cross-family canonical SSOT;ChromeHeader primitive 是 public-API
import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { ChromeHeader } from './chrome-header'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof ChromeHeader> = {
  title: 'Design System/Internal Patterns/Header Canonical',
  component: ChromeHeader,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof ChromeHeader>

export const ChromeHeaderDefault: Story = {
  name: '應用框架:固定高度標題列',
  render: () => (
    <div className="bg-surface">
      <ChromeHeader>
        <span className="text-body font-medium flex-1">專案總覽</span>
        <Button size="sm" variant="text">設定</Button>
      </ChromeHeader>
      <div className="p-loose text-body-muted">page content...</div>
    </div>
  ),
}

export const ChromeHeaderWithTabs: Story = {
  name: '標題列下方疊分頁:無縫貼齊',
  render: () => (
    <div className="bg-surface">
      <ChromeHeader withTabs>
        <span className="text-body font-medium flex-1">會員管理</span>
      </ChromeHeader>
      <div className="border-b border-divider h-[var(--tab-height-sm)] flex items-center px-loose gap-3 text-caption">
        <span className="font-medium">總覽</span>
        <span className="text-fg-muted">活動紀錄</span>
        <span className="text-fg-muted">權限</span>
      </div>
      <div className="p-loose text-body-muted">tab content...</div>
    </div>
  ),
}

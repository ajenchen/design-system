// @story-baseline: none — primitive 用 minimal scenario showcase visual + cursor + 鍵盤
import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { ResizeHandle } from './resize-handle'

const meta: Meta<typeof ResizeHandle> = {
  title: 'Design System/Patterns/Resize Handle',
  tags: ['autodocs'],
  component: ResizeHandle,
  parameters: {
    layout: 'centered',
    docs: { description: { component: '可調整尺寸的拖曳把手(完整 window-splitter):方向、游標、命中區、1px 線、拖拉、鍵盤(←/→、Home/End)與 ARIA separator 一次擁有。DataTable 欄寬與 AgentPanel 面板寬都消費同一顆。' } },
  },
}
export default meta

type Story = StoryObj<typeof ResizeHandle>

/** DataTable「訂單金額」欄頭右緣把手:可拖、聚焦後 ←/→ 每步 16、Home 最窄(無上限 → End 停用)。 */
const ColumnDemo: React.FC<{ disabled?: boolean; max?: number }> = ({ disabled, max }) => {
  const [width, setWidth] = React.useState(200)
  return (
    <div className="flex flex-col gap-2">
      <div className="relative inline-block bg-surface border border-divider px-[var(--layout-space-loose)] py-2" style={{ width }}>
        <span className="text-body font-medium">訂單金額</span>
        <ResizeHandle
          direction="horizontal"
          position="end"
          value={width}
          min={120}
          max={max}
          ariaLabel="調整「訂單金額」欄寬"
          disabled={disabled}
          lineInsetStart="var(--table-cell-py, 8px)"
          lineInsetEnd="var(--table-cell-py, 8px)"
          onValueChange={setWidth}
        />
      </div>
      <span className="text-caption text-fg-muted">寬 {width}px</span>
    </div>
  )
}

export const Default: Story = {
  name: '預設',
  render: () => (
    <div className="flex flex-col gap-4">
      <ColumnDemo />
      <p className="text-caption text-fg-secondary">滑鼠移到右邊緣游標變左右拖拉、分隔線加深;拖曳中分隔線變主色。Tab 到把手後 ←/→ 每步 16px、Home 回最窄。</p>
    </div>
  ),
}

export const WithMax: Story = {
  name: '有上限',
  render: () => (
    <div className="flex flex-col gap-4">
      <ColumnDemo max={320} />
      <p className="text-caption text-fg-secondary">傳 max 後 End 跳到最寬、aria-valuemax 輸出(AgentPanel 面板寬 360–640 同款)。</p>
    </div>
  ),
}

export const Disabled: Story = {
  name: '停用',
  render: () => (
    <div className="flex flex-col gap-4">
      <ColumnDemo disabled />
      <p className="text-caption text-fg-secondary">停用時只保留 1px 分隔線,不進 Tab 順序、無游標、輔助技術忽略(DataTable 系統欄 / 邊界欄同款)。</p>
    </div>
  ),
}

export const Vertical: Story = {
  name: '垂直方向',
  render: function VerticalStory() {
    const [height, setHeight] = React.useState(120)
    return (
      <div className="relative bg-surface border border-divider px-[var(--layout-space-loose)] py-2 w-[300px]" style={{ height }}>
        <span className="text-body">查詢結果面板</span>
        <ResizeHandle direction="vertical" position="end" value={height} min={80} max={240} ariaLabel="調整結果面板高度" onValueChange={setHeight} />
      </div>
    )
  },
}

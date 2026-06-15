// @story-trait-rationale: hasSizes 由 anatomy.stories.tsx SizeMatrix auto-compile owns size showcase(2026-05-15 F-migration)。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Slider } from './slider'

const meta: Meta<typeof Slider> = {
  title: 'Design System/Components/Slider/展示',
  component: Slider,
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj<typeof Slider>

// @story-trait-rationale: Default / Range retired 2026-05-17 per audit Dim 24 —
//   anatomy.stories.tsx Overview(含 Anatomy + Range mode 子段)已 cover baseline + range showcase。
//   展示層保留 typical 情境(SizeAlignment / MinMaxStep / Disabled 等),避免跟 anatomy 重複。

// ── Sizes(容器對齊)───────────────────────────────────────────────────

export const SizeAlignment: Story = {
  name: '容器尺寸對齊',
  render: () => (
    <div className="w-[360px] flex flex-col gap-6">
      <p className="text-caption text-fg-secondary max-w-[480px]">
        三個 size 下 track 厚度與 thumb 直徑一致——只有容器外高跟著
        `--field-height-*` 變。這讓 Slider 能在 Field 內跟 Input / Select /
        NumberInput 並排對齊,同時保持自己的視覺身分不變。
      </p>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size} className="flex flex-col gap-2">
          <div className="text-caption text-fg-muted">
            size = {size}(h-field-{size})
          </div>
          <div className="border border-dashed border-border rounded-md p-0">
            <Slider size={size} defaultValue={[40]} />
          </div>
        </div>
      ))}
    </div>
  ),
}

// ── Min / Max / Step ─────────────────────────────────────────────────────

export const MinMaxStep: Story = {
  name: '最小 / 最大 / 步階',
  render: () => {
    const [value, setValue] = React.useState([32])
    return (
      <div className="w-[360px] flex flex-col gap-4">
        <div className="text-caption text-fg-muted">
          min=0, max=100, step=4
        </div>
        <Slider
          value={value}
          onValueChange={setValue}
          min={0}
          max={100}
          step={4}
        />
        <p className="text-caption text-fg-secondary">Value: {value[0]}</p>
      </div>
    )
  },
}

// @story-trait-rationale: Disabled retired 2026-05-17 per audit Dim 24 —
//   anatomy.stories.tsx StateBehavior 已 cover disabled state(單值 + 範圍)。展示層保留 SizeAlignment + MinMaxStep + OnCommit。
//   2026-06-11:刪除 zombie export `Disabled_REMOVED`,對齊 DS-wide comment-only 退役慣例(deep-audit dim25)。

// ── With live value commit ──────────────────────────────────────────────

export const OnCommit: Story = {
  name: '提交數值回呼',
  render: () => {
    const [live, setLive] = React.useState([50])
    const [committed, setCommitted] = React.useState([50])
    return (
      <div className="w-[360px] flex flex-col gap-4">
        <p className="text-caption text-fg-secondary">
          拖曳時 live 跟著變,放開才更新 committed(適合昂貴操作如 API
          query、圖片重繪)
        </p>
        <Slider
          value={live}
          onValueChange={setLive}
          onValueCommit={setCommitted}
        />
        <div className="flex flex-col gap-1 text-caption">
          <span className="text-fg-secondary">Live: {live[0]}</span>
          <span className="text-foreground font-medium">
            Committed: {committed[0]}
          </span>
        </div>
      </div>
    )
  },
}

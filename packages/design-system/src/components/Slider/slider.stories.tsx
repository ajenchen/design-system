// @story-trait-rationale: hasSizes 由 anatomy.stories.tsx SizeMatrix auto-compile owns size showcase(2026-05-15 F-migration)。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Slider } from './slider'
import { NumberInput } from '@/design-system/components/NumberInput/number-input'

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
    <div className="w-[420px] flex flex-col gap-6">
      <p className="text-caption text-fg-secondary max-w-[480px]">
        三個 size 下 track 厚度與 thumb 直徑一致——只有容器外高跟著
        `--field-height-*` 變。這讓 Slider 能在同一列跟 NumberInput 等 field
        控件並排、field-height 完美對齊,同時保持自己的視覺身分不變。
      </p>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size} className="flex flex-col gap-2">
          <div className="text-caption text-fg-muted">size = {size}</div>
          <div className="flex items-center gap-3">
            <span className="text-body w-10 shrink-0">音量</span>
            <Slider size={size} defaultValue={[40]} aria-label="音量" className="flex-1" />
            <NumberInput size={size} value={40} onChange={() => {}} className="w-20 shrink-0" />
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
    const [quality, setQuality] = React.useState([80])
    return (
      <div className="w-[360px] flex flex-col gap-4">
        <p className="text-caption text-fg-secondary">
          匯出圖片品質——限制在 10–100% 之間,每次以 5% 為一階(min / max / step)
        </p>
        <div className="flex items-center gap-3">
          <span className="text-body w-16 shrink-0">圖片品質</span>
          <Slider
            value={quality}
            onValueChange={setQuality}
            min={10}
            max={100}
            step={5}
            aria-label="匯出圖片品質"
            className="flex-1"
          />
          <span className="text-caption text-fg-muted font-mono w-10 shrink-0">{quality[0]}%</span>
        </div>
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
    const [preview, setPreview] = React.useState([3000])
    const [applied, setApplied] = React.useState([3000])
    return (
      <div className="w-[360px] flex flex-col gap-4">
        <p className="text-caption text-fg-secondary">
          價格上限篩選——拖曳時即時預覽,放開才送出查詢(適合昂貴操作如 API
          query、重新載入結果)
        </p>
        <div className="flex items-center gap-3">
          <span className="text-body w-12 shrink-0">價格</span>
          <Slider
            value={preview}
            onValueChange={setPreview}
            onValueCommit={setApplied}
            min={0}
            max={10000}
            step={100}
            aria-label="價格上限"
            className="flex-1"
          />
        </div>
        <div className="flex flex-col gap-1 text-caption">
          <span className="text-fg-secondary">即時預覽:${preview[0]}</span>
          <span className="text-foreground font-medium">已套用查詢:${applied[0]}</span>
        </div>
      </div>
    )
  },
}

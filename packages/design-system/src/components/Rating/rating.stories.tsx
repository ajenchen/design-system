import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Rating } from './rating'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldError } from '@/design-system/components/Field/field'

const meta: Meta<typeof Rating> = {
  title: 'Design System/Components/Rating/展示',
  component: Rating,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '星星評分元件——離散 1–5 分。interactive 送出評分 / readOnly 展示平均分；precision full 整星 / half 半星。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Rating>

/* ── 商品列表的平均分（Amazon / Shopify 風格）── */
export const ReadOnlyProductRating: Story = {
  name: '商品列表平均分',
  render: () => (
    <div className="flex flex-col gap-4 w-[420px]">
      {[
        { name: 'AirPods Pro （第二代）', rating: 4.7, count: 12843 },
        { name: 'Kindle Paperwhite', rating: 4.5, count: 8921 },
        { name: 'Anker 快充行動電源 20000mAh', rating: 4.8, count: 23104 },
        { name: 'UNIQLO 輕量羽絨外套', rating: 4.2, count: 592 },
      ].map((p) => (
        <div key={p.name} className="flex items-center gap-3 p-3 border border-border rounded-md bg-surface">
          <div className="flex-1 min-w-0">
            <div className="text-body font-medium truncate">{p.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <Rating
                value={p.rating}
                readOnly
                precision="half"
                size="xs"
                aria-label={`平均評分 ${p.rating} 星，共 5 星,${p.count} 則評論`}
              />
              <span className="text-caption text-fg-secondary">{p.rating}</span>
              <span className="text-caption text-fg-muted">({p.count.toLocaleString()})</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  ),
}

/* ── 送出評分 flow（Yelp / Google Reviews 風格）── */
export const InteractiveReview: Story = {
  name: '送出評分流程',
  render: () => {
    const ReviewForm = () => {
      const [rating, setRating] = useState(0)
      const labels = ['', '很差', '不佳', '普通', '不錯', '很棒']
      return (
        <div className="flex flex-col gap-4 w-[420px] p-5 border border-border rounded-md bg-surface">
          <div className="text-body font-semibold">為這次服務評分</div>
          <p className="text-caption text-fg-muted">
            訂單編號 #A-2026-0412 · 完成於 2026/04/15
          </p>
          <div className="flex items-center gap-3 py-2">
            <Rating
              value={rating}
              onChange={setRating}
              size="lg"
              precision="full"
              aria-label="為這次服務給 1 到 5 星"
            />
            <span className="text-body text-fg-secondary min-w-[48px]">
              {labels[rating] ?? ''}
            </span>
          </div>
          <div className="flex items-center gap-2 justify-end pt-1">
            <Button variant="primary" size="md" disabled={rating === 0}>
              送出評分
            </Button>
          </div>
        </div>
      )
    }
    return <ReviewForm />
  },
}

/* ── Field 包裝(Rating 可塞進 Field wrapper)── */
export const InField: Story = {
  name: '包在 Field 內',
  render: () => {
    const [rating, setRating] = useState(0)
    return (
      <div className="w-[420px]">
        <Field>
          <FieldLabel required>整體滿意度</FieldLabel>
          <Rating
            value={rating}
            onChange={setRating}
            size="md"
            aria-label="整體滿意度評分"
          />
          {rating === 0 && <FieldError>請至少給 1 星</FieldError>}
        </Field>
      </div>
    )
  },
}

/* @story-trait-rationale: AllSizes retired per F migration 2026-05-15 — anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。 */
// @story-trait-rationale: Disabled retired per audit Dim 24 —
//   disabled 覆蓋已由 anatomy.stories.tsx StateBehavior 的 disabled live case
//   (value=4 disabled)owns;對齊 Checkbox / Switch / RadioGroup 同 Family
//   已 retire 的獨立 Disabled story,不重複展示同一 state。

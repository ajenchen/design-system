// @story-baseline: packages/design-system/src/components/DataTable/data-table.anatomy.stories.tsx#AlignmentRule — 商品列表平均分:唯讀元件放進 DataTable 自訂儲存格(同 ProgressBar「DataTable 儲存格內進度」)
// @story-baseline: packages/design-system/src/components/Field/field.stories.tsx#FormValidation — 包在 Field 內:CreateProjectForm 同款 useFormValidation 建立表單
import type { Meta, StoryObj } from '@storybook/react'
import type { ColumnDef } from '@tanstack/react-table'
import { useState } from 'react'
import { Rating } from './rating'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldError, useFormValidation } from '@/design-system/components/Field/field'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging

const meta: Meta<typeof Rating> = {
  title: 'Design System/Components/Rating/展示',
  component: Rating,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '讓使用者點一顆整星給分；已提交的個人或平均評分一律用唯讀精簡版「★ 4.7 (12,843)」顯示。連續數值改用 Slider，二元喜好改用 Switch 或 icon button，完成進度改用 ProgressBar / CircularProgress。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Rating>

/* ── 商品列表的平均分 —— 唯讀精簡版放進 DataTable 自訂儲存格,評論數走 count ── */
// 列表 = DataTable(data-table.spec.md「何時用」商品管理 /「簡單展示也用 DataTable」);
// 唯讀 Rating 在表格外沒有 Field,aria-label 必填且要說出分數與評論數(rating.spec.md「A11y 預設」)。

interface ProductRatingRow {
  name: string
  rating: number
  count: number
}

const productRatings: ProductRatingRow[] = [
  { name: 'AirPods Pro（第二代）', rating: 4.7, count: 12843 },
  { name: 'Kindle Paperwhite', rating: 4.5, count: 8921 },
  { name: 'Anker 快充行動電源 20000mAh', rating: 4.8, count: 23104 },
  { name: 'UNIQLO 輕量羽絨外套', rating: 4.2, count: 592 },
]

const productRatingColumns: ColumnDef<ProductRatingRow>[] = [
  { accessorKey: 'name', header: '商品', meta: { width: 240 } },
  {
    id: 'rating',
    header: '平均評分',
    meta: { width: 180 },
    cell: ({ row }) => (
      <Rating
        value={row.original.rating}
        count={row.original.count}
        readOnly
        aria-label={`平均評分 ${row.original.rating} 星，共 5 星，${row.original.count.toLocaleString()} 則評論`}
      />
    ),
  },
]

export const ReadOnlyProductRating: Story = {
  name: '商品列表平均分',
  render: () => (
    <div className="w-[420px]">
      <DataTable columns={productRatingColumns} data={productRatings} getRowId={(r) => r.name} height="auto" />
    </div>
  ),
}

/* ── 送出評分 —— Rating 包在 Field 內,驗證走 useFormValidation(同 field.stories.tsx CreateProjectForm)── */
// 送出前 = interactive,送出後 = 同一欄切成唯讀精簡版(rating.spec.md「Interactive vs ReadOnly」判斷法;
// 走 <Field mode="readonly">,rating.spec.md「放入 Field 的可組合性」)。

function ServiceRatingForm() {
  // 送出成功 → Toast(user 2026-10-01 逐字:「以上噎一律處理到完美，然後送出成功跳提示」;form-validation.spec.md「A11y 預設 › Submit 成功宣告」),
  // 讀屏由 Toaster 的 polite 朗讀區宣讀;送出後同一欄切唯讀(rating.spec.md「送出前 = interactive,送出後 = readOnly」)
  const [submitted, setSubmitted] = useState(false)
  const form = useFormValidation({
    initialValues: { rating: 0 },
    intent: 'create', // 新建:送出鈕永遠可按,按了才驗證全部(form-validation.spec.md「Submit Button 狀態」)
    validate: { rating: (v) => (v === 0 ? '請至少給 1 星' : undefined) },
    onSubmit: () => { setSubmitted(true); toast({ variant: 'success', title: '評分已送出' }) },
  })
  return (
    <form onSubmit={form.handleSubmit} className="w-80" aria-label="為這次服務評分">
      <Field required invalid={!!form.errors.rating} mode={submitted ? 'readonly' : 'edit'}>
        <FieldLabel>整體滿意度</FieldLabel>
        <Rating {...form.getInputProps('rating')} />
        <FieldError>{form.errors.rating}</FieldError>
      </Field>
      <div className="mt-[var(--layout-space-bottom)] flex items-center gap-2">
        <Button type="submit" variant="primary">送出評分</Button>
      </div>
    </form>
  )
}

export const InField: Story = {
  name: '包在 Field 內',
  parameters: {
    docs: {
      description: {
        story:
          '訂單完成後幫這次服務評分。送出鈕永遠可按:沒給分就離開評分或按送出,欄位顯示「請至少給 1 星」;按送出時焦點同時移到評分。送出成功後跳出「評分已送出」提示(Toast),同一欄改成唯讀精簡版。',
      },
    },
  },
  // Toaster:每個獨立 story root 掛一個(toast.spec.md「app-level-one」合約允許)
  render: () => (
    <>
      <Toaster />
      <ServiceRatingForm />
    </>
  ),
}

/* @story-history: AllSizes retired per F migration 2026-05-15 — anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。 */
// @story-history: Disabled retired per audit Dim 24 —
//   disabled 覆蓋已由 anatomy.stories.tsx StateBehavior 的 disabled live case
//   (value=4 disabled)owns;對齊 Checkbox / Switch / RadioGroup 同 Family
//   已 retire 的獨立 Disabled story,不重複展示同一 state。
// @story-history: InteractiveReview(送出評分流程)retired 2026-09-30 —
//   手刻卡片 / 標題 / 間距、新建情境卻停用送出鈕(form-validation.spec.md「Submit Button 狀態」)、
//   按送出沒有任何後續、自創「很差…很棒」文字標籤(rating.spec.md Props 無此 API)。
//   送出評分情境改由「包在 Field 內」承擔(useFormValidation 建立表單 + 送出後唯讀),story-rules.md earn-existence 兩題皆否。

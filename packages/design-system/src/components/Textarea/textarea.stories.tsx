// @story-trait-rationale: isInputLike -> InField — InField 已同時渲染 invalid Field chrome 與 FieldError；另開 error-only story 會重複相同表單情境。
// @story-history: hasSizes 由 anatomy.stories.tsx SizeMatrix auto-compile owns size showcase(2026-05-15 F-migration)。
import type { Meta, StoryObj } from '@storybook/react'
import { Textarea } from './textarea'
import { Field, FieldLabel, FieldDescription, FieldError } from '@/design-system/components/Field/field'

const meta: Meta<typeof Textarea> = {
  title: 'Design System/Components/Textarea/展示',
  component: Textarea,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '多行文字輸入控制項，支援不同尺寸、驗證與表單 Field 組合。需要輸入描述、備註或段落內容時使用；短且單行的資料改用 Input。' } },
  },
}
export default meta

type Story = StoryObj<typeof Textarea>

export const Default: Story = {
  name: '基本用法',
  args: {
    placeholder: '請輸入多行文字...',
  },
  render: (args) => (
    <div className="max-w-md">
      <Textarea {...args} />
    </div>
  ),
}

// @story-history: AllSizes / Modes / WithError retired per F migration 2026-05-15+17 —
//   anatomy.stories.tsx SizeMatrix + ModeMatrix own trait matrices(state/mode/size 全 cover)。
//   展示層保留 typical real-product 情境(Default + InField),避免跟 anatomy trait grid 重複。
export const InField: Story = {
  name: '在 Field 內',
  render: () => (
    <div className="max-w-md flex flex-col gap-4">
      <Field required>
        <FieldLabel>專案說明</FieldLabel>
        <Textarea placeholder="描述這個專案的目的、時程、關鍵議題..." rows={5} />
        <FieldDescription>會顯示在專案列表的摘要欄</FieldDescription>
      </Field>

      <Field invalid>
        <FieldLabel>備註</FieldLabel>
        <Textarea defaultValue="太短了" rows={3} />
        <FieldError>備註至少 20 字</FieldError>
      </Field>

      <Field orientation="horizontal" labelWidth="120px">
        <FieldLabel>補充說明</FieldLabel>
        <Textarea placeholder="橫式 field 內的 textarea" rows={4} />
      </Field>
    </div>
  ),
}

// @story-trait-rationale: isInputLike -> InField — InField 已同時渲染 invalid Field chrome 與 FieldError；另開 error-only story 會重複相同表單情境。(2026-11-21 複查仍成立:InField 的「退件原因」欄是 `<Field invalid>` + FieldError;規則見 check_story_invariants.sh R3)
// @story-history: hasSizes 由 textarea.anatomy.stories.tsx SizeMatrix auto-compile owns size showcase(2026-05-15 F-migration)。
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Textarea } from './textarea'
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } from '@/design-system/components/Field/field'

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
    placeholder: '例:需要法務審核的條款、預計的上線時程',
  },
  // 真實情境 + 欄位名稱(稽核 L074)
  render: (args) => (
    <Field className="max-w-md">
      <FieldLabel>補充說明</FieldLabel>
      <Textarea {...args} />
    </Field>
  ),
}

// @story-history: AllSizes / Modes / WithError retired per F migration 2026-05-15+17 —
//   textarea.anatomy.stories.tsx SizeMatrix + ModeMatrix own trait matrices(state/mode/size 全 cover)。
//   展示層保留 typical real-product 情境(Default + InField),避免跟 anatomy trait grid 重複。
export const InField: Story = {
  name: '在 Field 內',
  render: () => (
    <FieldGroup className="max-w-md">
      {/* 字數計數(field-controls.spec.md「字數計數」):有說明時計數在說明那一行的右端;摘要欄最多 200 字,打到上限就擋住 */}
      <Field required>
        <FieldLabel>專案說明</FieldLabel>
        <Textarea placeholder="描述這個專案的目的、時程、關鍵議題..." rows={5} maxLength={200} showCount />
        <FieldDescription>會顯示在專案列表的摘要欄</FieldDescription>
      </Field>

      {/* 錯誤的值與錯誤訊息對得上(稽核 L074):退件原因只寫了 4 個字,規則是至少 10 字 */}
      <Field invalid>
        <FieldLabel>退件原因</FieldLabel>
        <Textarea defaultValue="資料不全" rows={3} />
        <FieldError>退件原因至少 10 字</FieldError>
      </Field>

      {/* 沒有說明時那一行只有計數(右端) */}
      <Field orientation="horizontal" labelWidth="120px">
        <FieldLabel>補充說明</FieldLabel>
        <Textarea placeholder="例:需要法務審核的條款" rows={4} maxLength={500} showCount />
      </Field>
    </FieldGroup>
  ),
}

// @story-history: hasSizes/hasInteractiveStates 由 anatomy.stories.tsx SizeMatrix + StateBehavior
// owns 完整 trait grid;展示層 States 保留為 compact all-states overview(對齊 Switch 同 Family 檔頭豁免,
// 2026-07-14 audit Dim 46 補),跟 anatomy focused subsection 不同教學,不另開抽象 Default/AllSizes。
import type { Meta, StoryObj } from '@storybook/react'
import { Checkbox } from './checkbox'
import { CheckboxGroup } from './checkbox-group'
import { ExampleSection, ExampleStack } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta<typeof Checkbox> = {
  title: 'Design System/Components/Checkbox/展示',
  component: Checkbox,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: '切換彼此獨立的布林選項，支援 checked、unchecked 與 indeterminate。使用者可以同時選多項或單獨同意條款時使用；互斥選擇改用 RadioGroup。' } },
  },
}

export default meta
type Story = StoryObj<typeof Checkbox>

/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => (
    <ExampleStack className="max-w-sm">
      <ExampleSection title="edit">
        <Checkbox defaultChecked aria-label="同意條款(edit mode demo)" />
      </ExampleSection>
      <ExampleSection title="view">
        <ExampleGroup>
          <Checkbox mode="view" checked />
          <p className="text-caption text-fg-muted">純視覺 glyph（勾/叉 icon，Check/X）；語意由 context（如 DataTable 表頭 + 行標籤）提供，view 不暴露獨立 aria-label。需螢幕報讀器可讀的勾選請用 edit / readonly 模式。</p>
        </ExampleGroup>
      </ExampleSection>
      <ExampleSection title="readonly">
        <Checkbox readOnly checked aria-label="同意條款(readonly mode demo)" />
      </ExampleSection>
      <ExampleSection title="disabled">
        <Checkbox disabled checked aria-label="同意條款(disabled mode demo)" />
      </ExampleSection>
    </ExampleStack>
  ),
}

/* ── 狀態 ── */
export const States: Story = {
  name: '狀態',
  // 尺寸與狀態的說明放 docs(畫布只留元件本身;A-L110 同類)
  parameters: {
    docs: { description: { story: '上排是標準尺寸(16px),下排是大尺寸(20px)。由左到右:未勾選、已勾選、部分勾選,後三個是同樣三種狀態的停用。' } },
  },
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      {(['md', 'lg'] as const).map((size) => (
        <div key={size} className="flex items-center gap-[var(--layout-space-loose)]">
          <Checkbox size={size} aria-label="未勾選" />
          <Checkbox size={size} defaultChecked aria-label="已勾選" />
          <Checkbox size={size} checked="indeterminate" aria-label="部分勾選" />
          <Checkbox size={size} disabled aria-label="未勾選(停用)" />
          <Checkbox size={size} disabled defaultChecked aria-label="已勾選(停用)" />
          <Checkbox size={size} disabled checked="indeterminate" aria-label="部分勾選(停用)" />
        </div>
      ))}
    </div>
  ),
}

/* ── 垂直 Group ── */
export const VerticalGroup: Story = {
  name: '直式群組',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-md">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">size="{size}"</p>
          {/* 直式群組 = <CheckboxGroup>(預設 vertical = grid、外層 0 gap,列距由 SelectionItem py 擁有;checkbox.spec.md「Orientation」) */}
          <CheckboxGroup aria-label="商品類別">
            {/* 公開 API:`<Checkbox label>` 自動包 SelectionItem + wire id/htmlFor(selection-item.spec.md 禁裸用) */}
            <Checkbox size={size} label="Electronics" />
            <Checkbox size={size} label="Furniture" description="桌椅、收納、辦公家具" />
            <Checkbox size={size} label="Food & Beverage" />
          </CheckboxGroup>
        </div>
      ))}
    </div>
  ),
}

/* ── 水平排列 ── */
export const Horizontal: Story = {
  name: '水平排列',
  render: () => (
    <CheckboxGroup orientation="horizontal" aria-label="商品類別" className="max-w-md">
      <Checkbox label="Electronics" />
      <Checkbox label="Furniture" />
      <Checkbox label="Food" />
    </CheckboxGroup>
  ),
}

// @story-history: Disabled retired 2026-05-17 per audit Dim 24/25 strict re-run —
//   anatomy.stories.tsx StateBehavior「Disabled — 品牌色移除,統一 neutral」段(L535-558)已 cover。
//   非 trait-required(`isSelectionMulti` 不 mandate Disabled);RadioGroup 同 Family 已 retire 同類。
//   States showcase (compact all-states overview)保留,跟 anatomy「focused subsection」不同教學。

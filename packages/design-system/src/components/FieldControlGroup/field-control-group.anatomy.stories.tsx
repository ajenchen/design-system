// @story-trait-rationale: Inspector + ColorMatrix N/A — FieldControlGroup 是
// self-contained layout-primitive(border-collapse 接合 N 個 Field child),
// spec frontmatter `variants: {}` / `sizes: {}` / `traits: []`(明示 layout-primitive 無 trait variants)。
// 無 cva color variant → ColorMatrix N/A;無 interactive prop control(僅 children layout)→ Inspector N/A。
// 對齊 design-system-audit Dim 13 trait-rationale 例外 SSOT。
import type { Meta, StoryObj } from '@storybook/react'
import { FieldControlGroup } from './field-control-group'
import { Select } from '@/design-system/components/Select/select'
import { Input } from '@/design-system/components/Input/input'
import { OPERATOR_REGISTRY } from '@/design-system/components/DataTable/filter-operators'

const meta: Meta<typeof FieldControlGroup> = {
  title: 'Design System/Components/FieldControlGroup/設計規格',
  component: FieldControlGroup,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof FieldControlGroup>

const FIELDS = [
  { value: 'sku', label: 'SKU' },
  { value: 'name', label: '名稱' },
]
// op 選項消費 OPERATOR_REGISTRY SSOT(audit dim 32 — 禁 hardcode op 字串)
const OPS = OPERATOR_REGISTRY.string
  .filter((o) => ['is', 'contains'].includes(o.op))
  .map((o) => ({ value: o.op, label: o.label }))

/* Overview */
export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-6 w-[520px]">
      <section>
        <h3 className="text-body font-bold mb-2">接合機制</h3>
        <ul className="text-body text-fg-secondary list-disc pl-5 space-y-1">
          <li>子 controls 保留自身 border + radius(不 strip)</li>
          <li>鄰接子用 <code>margin-left: -1px</code> 重疊 border → 視覺 1 條線</li>
          <li>z-index:default 2 / hover/focus 3 / disabled 0</li>
          <li>first child 右 radii=0;middle 全 radii=0;last child 左 radii=0</li>
        </ul>
      </section>
      <section>
        <h3 className="text-body font-bold mb-2">範例</h3>
        <FieldControlGroup block>
          <Select className="w-[120px]" options={FIELDS} value="name" onChange={() => {}} aria-label="篩選欄位" />
          <Select className="w-[100px]" options={OPS} value="contains" onChange={() => {}} aria-label="篩選運算子" />
          <Input className="flex-1" defaultValue="無線滑鼠" aria-label="篩選值" />
        </FieldControlGroup>
      </section>
    </div>
  ),
}

/* SizeMatrix */
export const SizeMatrix: Story = {
  name: '尺寸矩陣',
  render: () => (
    <div className="flex flex-col gap-6 w-[420px]">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <p className="text-caption text-fg-muted mb-2">size="{size}"</p>
          <FieldControlGroup block>
            <Select size={size} className="w-[120px]" options={FIELDS} value="name" onChange={() => {}} aria-label="篩選欄位" />
            <Input size={size} className="flex-1" defaultValue="無線滑鼠" aria-label="篩選值" />
          </FieldControlGroup>
        </div>
      ))}
    </div>
  ),
}

/* StateBehavior */
export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-6 w-[420px]">
      <div>
        <p className="text-caption text-fg-muted mb-2">default</p>
        <FieldControlGroup block>
          <Select className="w-[120px]" options={FIELDS} value="name" onChange={() => {}} aria-label="篩選欄位" />
          <Input className="flex-1" defaultValue="無線滑鼠" aria-label="篩選值" />
        </FieldControlGroup>
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-2">disabled(整 group children 各自 disabled)</p>
        <FieldControlGroup block>
          <Select className="w-[120px]" options={FIELDS} value="name" onChange={() => {}} disabled aria-label="篩選欄位" />
          <Input className="flex-1" defaultValue="無線滑鼠" disabled aria-label="篩選值" />
        </FieldControlGroup>
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-2">cell error(其中一 child invalid → border-error;聚焦該 child 時才提升到 z-3 蓋過鄰接 border)</p>
        <FieldControlGroup block>
          <Select className="w-[120px]" options={FIELDS} value="name" onChange={() => {}} aria-label="篩選欄位" />
          <Input className="flex-1" defaultValue="無線滑鼠" error aria-label="篩選值" />
        </FieldControlGroup>
      </div>
    </div>
  ),
}

/* Accessibility */
export const Accessibility: Story = {
  name: '無障礙',
  render: () => (
    <div className="flex flex-col gap-3 w-[420px]">
      <p className="text-body">
        Container 不加 ARIA role(透明 wrapper);children 各自 aria-label。Tab 鍵在 children 之間正常移動,no focus trap。
      </p>
      <FieldControlGroup block>
        <Select className="w-[120px]" options={FIELDS} value="name" onChange={() => {}} aria-label="篩選欄位" />
        <Select className="w-[100px]" options={OPS} value="contains" onChange={() => {}} aria-label="篩選運算子" />
        <Input className="flex-1" defaultValue="無線滑鼠" aria-label="篩選值" />
      </FieldControlGroup>
    </div>
  ),
}

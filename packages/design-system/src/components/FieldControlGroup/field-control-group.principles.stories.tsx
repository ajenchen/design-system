// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { Search } from 'lucide-react'
import { FieldControlGroup } from './field-control-group'
import { Field, FieldLabel, FieldGroup } from '@/design-system/components/Field/field'
import { Select } from '@/design-system/components/Select/select'
import { Input } from '@/design-system/components/Input/input'
import { Button } from '@/design-system/components/Button/button'
import { OPERATOR_REGISTRY } from '@/design-system/components/DataTable/filter-operators'

const meta: Meta<typeof FieldControlGroup> = {
  title: 'Design System/Components/FieldControlGroup/設計原則',
  component: FieldControlGroup,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof FieldControlGroup>

const CODES = [{ value: '+886', label: '+886' }, { value: '+1', label: '+1' }]
const FIELDS = [{ value: 'sku', label: 'SKU' }, { value: 'name', label: '名稱' }]
// op 選項消費 OPERATOR_REGISTRY SSOT(audit dim 32 — 禁 hardcode op 字串)
const OPS = OPERATOR_REGISTRY.string
  .filter((o) => ['is', 'contains'].includes(o.op))
  .map((o) => ({ value: o.op, label: o.label }))

/* WhenToUse + WhenNotToUse + VsRule + ContentGuidelines = single UsageGuidance */
export const UsageGuidance: Story = {
  name: '使用準則',
  render: () => (
    <div className="flex flex-col gap-10 w-[640px]">
      <section>
        <h2 className="text-body-lg font-bold mb-3">何時用 ✓</h2>
        <ul className="text-body text-fg-secondary list-disc pl-5 space-y-1">
          <li>兩個語意連動的 control 視覺一體(電話 = 國碼 + 號碼)</li>
          <li>Filter row(field + op + value)</li>
          <li>Search input + Submit button</li>
          <li>Range input(start + end + 中介符號)</li>
        </ul>
        <div className="mt-3">
          <FieldControlGroup block>
            <Input className="flex-1" startIcon={Search} placeholder="搜尋..." />
            <Button variant="primary">搜尋</Button>
          </FieldControlGroup>
        </div>
      </section>

      <section>
        <h2 className="text-body-lg font-bold mb-3">何時不用 ✗</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-body font-medium mb-2 text-error-text">❌ 多 fields 垂直排列</p>
            <FieldGroup>
              <Field><FieldLabel>姓名</FieldLabel><Input /></Field>
              <Field><FieldLabel>Email</FieldLabel><Input /></Field>
            </FieldGroup>
            <p className="text-caption text-fg-muted mt-1">→ 用 FieldGroup,不是 FieldControlGroup</p>
          </div>
          <div>
            <p className="text-body font-medium mb-2 text-error-text">❌ 不相關 controls 強行接合</p>
            <p className="text-caption text-fg-muted">姓名 + 公司電話放同一 group 語意混亂 — 用 separate Field</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-body-lg font-bold mb-3">FieldControlGroup vs FieldGroup</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-divider rounded-md p-4">
            <p className="text-body font-bold mb-2">FieldGroup(垂直堆疊)</p>
            <ul className="text-body text-fg-secondary space-y-1">
              <li>Scope:多個 Field</li>
              <li>Direction:vertical</li>
              <li>視覺:gap 分離</li>
              <li>語意:表單 section</li>
            </ul>
          </div>
          <div className="border border-divider rounded-md p-4">
            <p className="text-body font-bold mb-2">FieldControlGroup(橫向接合)</p>
            <ul className="text-body text-fg-secondary space-y-1">
              <li>Scope:多個 control(1 Field 內)</li>
              <li>Direction:horizontal</li>
              <li>視覺:border collapse 接合</li>
              <li>語意:複合 input(視覺一體)</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-body-lg font-bold mb-3">內容準則</h2>
        <ul className="text-body text-fg-secondary list-disc pl-5 space-y-1">
          <li>Children 同 size — 不混用 sm/md/lg(視覺高度需一致)</li>
          <li>Children 自管 width — fixed selects + flex input 是典型 pattern</li>
          <li>Mode A(包進 Field):size 從 Field context 自動繼承,children 不傳 size</li>
          <li>Children scope:Input / NumberInput / Select / Combobox / DatePicker / Button(對齊 Ant 限定 list)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-body-lg font-bold mb-3">Mode A — 包進 Field 當 control slot</h2>
        <Field>
          <FieldLabel>聯絡電話</FieldLabel>
          <FieldControlGroup block>
            <Select className="w-[88px]" options={CODES} value="+886" onChange={() => {}} />
            <Input className="flex-1" placeholder="912 345 678" />
          </FieldControlGroup>
        </Field>
        <p className="text-caption text-fg-muted mt-2">Field label / description / error 對 group 整體生效;children 的 size 各自從外層 Field context 繼承(FCG 不傳遞 size)。</p>
      </section>

      <section>
        <h2 className="text-body-lg font-bold mb-3">Mode B — Filter row 場景</h2>
        <FieldControlGroup block>
          <Select className="w-[140px]" options={FIELDS} value="name" onChange={() => {}} />
          <Select className="w-[120px]" options={OPS} value="contains" onChange={() => {}} />
          <Input className="flex-1" defaultValue="無線滑鼠" />
        </FieldControlGroup>
      </section>
    </div>
  ),
}

// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Phone, Search } from 'lucide-react'
import { FieldControlGroup } from './field-control-group'
import { Field, FieldLabel, FieldDescription } from '@/design-system/components/Field/field'
import { Select } from '@/design-system/components/Select/select'
import { Input } from '@/design-system/components/Input/input'
import { NumberInput } from '@/design-system/components/NumberInput/number-input'
import { Button } from '@/design-system/components/Button/button'
import { OPERATOR_REGISTRY } from '@/design-system/components/DataTable/filter-operators'

const meta: Meta<typeof FieldControlGroup> = {
  title: 'Design System/Components/FieldControlGroup/展示',
  component: FieldControlGroup,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '多個 Field controls 視覺接合成一個 input frame(border-collapse)。對齊 Ant Space.Compact / Bootstrap input-group idiom。',
      },
    },
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof FieldControlGroup>

const COUNTRY_CODES = [
  { value: '+886', label: '+886' },
  { value: '+1',   label: '+1' },
  { value: '+81',  label: '+81' },
  { value: '+86',  label: '+86' },
  { value: '+852', label: '+852' },
]

const CURRENCIES = [
  { value: 'TWD', label: 'TWD' },
  { value: 'USD', label: 'USD' },
  { value: 'JPY', label: 'JPY' },
  { value: 'EUR', label: 'EUR' },
]

/* ── 電話輸入(國碼 + 號碼)── */
export const PhoneNumber: Story = {
  name: '電話',
  render: () => {
    const [code, setCode] = React.useState('+886')
    const [num, setNum] = React.useState('')
    return (
      <div className="w-[360px]">
        <Field>
          <FieldLabel>聯絡電話</FieldLabel>
          {/* `!w-[]` important override Select 內 trigger w-full;w-120px 容「+886」+ phone icon + chevron */}
          <FieldControlGroup block>
            <Select
              className="!w-[120px] flex-shrink-0"
              options={COUNTRY_CODES}
              value={code}
              onChange={setCode}
              startIcon={Phone}
            />
            <Input
              className="!flex-1 !min-w-0"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              placeholder="912 345 678"
            />
          </FieldControlGroup>
          <FieldDescription>含國碼,例如 +886 912 345 678</FieldDescription>
        </Field>
      </div>
    )
  },
}

/* ── 金額輸入(幣別 + 數字)── */
export const CurrencyAmount: Story = {
  name: '金額',
  render: () => {
    const [currency, setCurrency] = React.useState('TWD')
    const [amount, setAmount] = React.useState<number | null>(null)
    return (
      <div className="w-[320px]">
        <Field>
          <FieldLabel>採購金額</FieldLabel>
          <FieldControlGroup block>
            <Select
              className="!w-[88px] flex-shrink-0"
              options={CURRENCIES}
              value={currency}
              onChange={setCurrency}
            />
            <NumberInput
              className="!flex-1 !min-w-0"
              value={amount}
              onChange={setAmount}
              placeholder="0"
            />
          </FieldControlGroup>
        </Field>
      </div>
    )
  },
}

/* ── 搜尋 + 提交按鈕 ── */
export const SearchSubmit: Story = {
  name: '搜尋與提交',
  render: () => {
    const [q, setQ] = React.useState('')
    return (
      <div className="w-[440px]">
        <FieldControlGroup block>
          <Input
            className="!flex-1 !min-w-0"
            startIcon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋商品或關鍵字"
          />
          <Button variant="primary">搜尋</Button>
        </FieldControlGroup>
      </div>
    )
  },
}

/* ── DataTable Filter row(Field + Op + Value)── */
const FILTER_FIELDS = [
  { value: 'sku', label: 'SKU' },
  { value: 'name', label: '名稱' },
  { value: 'category', label: '類別' },
  { value: 'stock', label: '庫存' },
]
// op 選項消費 OPERATOR_REGISTRY SSOT(DataTable/filter-operators.ts;audit dim 32 — 禁 hardcode op 字串)
const STRING_OPS = OPERATOR_REGISTRY.string
  .filter((o) => o.valueShape === 'text')
  .map((o) => ({ value: o.op, label: o.label }))

export const FilterRow: Story = {
  name: '篩選列（資料表進階篩選實例）',
  render: () => {
    const [field, setField] = React.useState('name')
    const [op, setOp] = React.useState('contains')
    const [value, setValue] = React.useState('')
    return (
      <div className="w-[640px]">
        <p className="text-caption text-fg-muted mb-3">DataTable 進階篩選 row 是 FieldControlGroup 的典型 consumer。</p>
        <FieldControlGroup block>
          <Select className="!w-[160px] flex-shrink-0" options={FILTER_FIELDS} value={field} onChange={setField} />
          <Select className="!w-[120px] flex-shrink-0" options={STRING_OPS} value={op} onChange={setOp} />
          <Input className="!flex-1 !min-w-0" value={value} onChange={(e) => setValue(e.target.value)} placeholder="輸入值..." />
        </FieldControlGroup>
      </div>
    )
  },
}

/* @story-trait-rationale: AllSizes retired per F migration 2026-05-15 — anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。 */

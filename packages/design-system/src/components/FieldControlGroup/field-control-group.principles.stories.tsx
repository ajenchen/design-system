// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { Search } from 'lucide-react'
import { FieldControlGroup } from './field-control-group'
import { Field, FieldLabel, FieldGroup } from '@/design-system/components/Field/field'
import { Select } from '@/design-system/components/Select/select'
import { Input } from '@/design-system/components/Input/input'
import { Button } from '@/design-system/components/Button/button'
import { OPERATOR_REGISTRY } from '@/design-system/components/DataTable/filter-operators'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

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

// 範例的說明一律 ExampleCaption(CaptionedExamples 自動併組);規則標題由共用元件畫(2026-10-20 T5:原本兩則「❌」是手寫的紅色 h3)
const TutorialRule = createTutorialRule({ examples: true })

/* 使用指引固定三段;內容準則與尺寸規則各自一則(2026-10-20 T4:原本六段全擠在使用指引裡) */
export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage className="w-[640px]">
      <UsageSection kind="when">
        {/* 清單說的就是下面這個示範:說明 ↔ 範例 tight(ExampleGroup) */}
        <ExampleGroup>
          <TutorialList>
            <li>兩個語意連動的控件要看起來是一體(電話 = 國碼 + 號碼)</li>
            <li>篩選列(欄位 + 運算子 + 值)</li>
            <li>搜尋框 + 搜尋按鈕</li>
            <li>範圍輸入(起 + 迄 + 中間的符號)</li>
          </TutorialList>
          <FieldControlGroup block>
            <Input className="flex-1" startIcon={Search} placeholder="搜尋..." aria-label="搜尋" />
            <Button variant="primary">搜尋</Button>
          </FieldControlGroup>
        </ExampleGroup>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule title="❌ 多個欄位上下排列:用 FieldGroup">
          <FieldGroup>
            <Field><FieldLabel>姓名</FieldLabel><Input /></Field>
            <Field><FieldLabel>Email</FieldLabel><Input /></Field>
          </FieldGroup>
          <ExampleCaption>↑ 多個欄位上下排列是 FieldGroup 的工作,不是 FieldControlGroup</ExampleCaption>
        </TutorialRule>
        <TutorialRule title="❌ 把不相關的控件硬接在一起" note="姓名 + 公司電話放同一組,語意混亂 —— 各自用獨立的 Field" />
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>FieldGroup</strong> —— 多個 Field 上下堆疊、以間距分開;語意是表單裡的一段</li>
          <li><strong>FieldControlGroup</strong> —— 同一個 Field 裡的多個控件橫向接合(邊框相接);語意是一個複合輸入,看起來是一體</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const ContentGuidelines: Story = {
  name: '內容準則',
  render: () => (
    <TutorialPage className="w-[640px]">
      <TutorialList>
        <li>裡面的控件同一個尺寸 —— 不混用 sm / md / lg(高度要一致)</li>
        <li>控件各自管寬度 —— 固定寬的下拉 + 撐滿的輸入框是典型組合</li>
        <li>包進 Field 時,尺寸從 Field 自動繼承,控件不另外傳 size</li>
        <li>可以放的控件:Input / NumberInput / Select / Combobox / DatePicker / Button(對齊 Ant 的限定清單)</li>
      </TutorialList>
    </TutorialPage>
  ),
}

export const SizeRule: Story = {
  name: '尺寸怎麼給',
  render: () => (
    <TutorialPage className="w-[640px]">
      <TutorialRule title="繼承 Field 尺寸 — 包進 Field 當控件">
        <Field>
          <FieldLabel>聯絡電話</FieldLabel>
          <FieldControlGroup block>
            <Select className="!w-[88px]" options={CODES} value="+886" onChange={() => {}} aria-label="國碼" />
            <Input className="flex-1" placeholder="912 345 678" aria-label="電話號碼" />
          </FieldControlGroup>
        </Field>
        <ExampleCaption>↑ Field 的標籤 / 說明 / 錯誤訊息對整組生效;裡面控件的尺寸各自從外層 Field 繼承(FieldControlGroup 不傳遞 size)</ExampleCaption>
      </TutorialRule>

      <TutorialRule title="單獨使用時逐一設尺寸 — 篩選列">
        <FieldControlGroup block>
          <Select className="!w-[140px]" options={FIELDS} value="name" onChange={() => {}} aria-label="篩選欄位" />
          <Select className="!w-[120px]" options={OPS} value="contains" onChange={() => {}} aria-label="篩選運算子" />
          <Input className="flex-1" defaultValue="無線滑鼠" aria-label="篩選值" />
        </FieldControlGroup>
      </TutorialRule>
    </TutorialPage>
  ),
}

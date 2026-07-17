// @story-trait-rationale: Field 是 compound component(FieldLabel / FieldError / FieldDescription / FieldGroup),hasSizes / Default 由 anatomy.stories.tsx SizeMatrix + Inspector auto-compile owns(2026-05-15 F-migration);showcase 展示 Vertical / Horizontal 兩種 orientation 真實 form 情境。
import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { Upload } from 'lucide-react'
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup, useFormValidation } from './field'
import { Input } from '@/design-system/components/Input/input'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { Switch } from '@/design-system/components/Switch/switch'
import { Button } from '@/design-system/components/Button/button'
import { RadioGroup, RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'
import { SegmentedControl, SegmentedControlItem } from '@/design-system/components/SegmentedControl/segmented-control'
import { Slider } from '@/design-system/components/Slider/slider'
import { NumberInput } from '@/design-system/components/NumberInput/number-input'
import { Select } from '@/design-system/components/Select/select'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { Rating } from '@/design-system/components/Rating/rating'

const meta: Meta = {
  title: 'Design System/Components/Field/展示',
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj

// ── Vertical（預設） ────────────────────────────────────────────────────

export const Vertical: Story = {
  name: '垂直',
  render: () => (
    <div className="max-w-sm">
      <FieldGroup>
        <Field required>
          <FieldLabel>姓名</FieldLabel>
          <Input placeholder="請輸入姓名" />
          <FieldDescription>中英文皆可</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Email</FieldLabel>
          <Input placeholder="name@example.com" />
        </Field>

        <Field required invalid>
          <FieldLabel>密碼</FieldLabel>
          <Input placeholder="至少 8 碼" />
          <FieldError>密碼長度不足</FieldError>
        </Field>

        <Field>
          <FieldLabel>備註</FieldLabel>
          <Input placeholder="選填" />
          <FieldDescription>其他專案相關說明</FieldDescription>
        </Field>
      </FieldGroup>
    </div>
  ),
}

// ── Field 狀態 cascade（2026-06-08 補：disabled / mode 透過 context 流給所有 field 控件）──────
// @story-trait-rationale: Field 透過 context 把 disabled / mode 流給「所有」field 控件。此前無 story 覆蓋此
// cascade，致 picker 漏讀 fieldCtx.mode、Switch/Rating/Slider/PeoplePicker 漏讀 fieldCtx.disabled 的 cascade
// bug 長期隱形（M15）。本 story 為 cascade 視覺驗證 SSOT —— 控件「皆不」自帶 disabled/mode prop，純靠 <Field> cascade。

const CASCADE_PRIORITY = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

export const StateCascade: Story = {
  name: '欄位狀態連動 — 停用態 / 純展示態 流給所有控件',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-body-sm font-medium text-fg-secondary mb-3">{'<Field disabled> — 所有控件自動停用（含 Switch / Rating / Slider / Select / DatePicker）'}</p>
        <div className="flex flex-wrap gap-x-8 gap-y-4 max-w-3xl">
          <Field disabled className="w-44"><FieldLabel>負責人</FieldLabel><Input value="王小明" onChange={() => {}} /></Field>
          <Field disabled className="w-44"><FieldLabel>優先級</FieldLabel><Select options={CASCADE_PRIORITY} value="high" onChange={() => {}} aria-label="優先級" /></Field>
          <Field disabled className="w-44"><FieldLabel>截止日</FieldLabel><DatePicker value="2026-06-20" onChange={() => {}} /></Field>
          <Field disabled className="w-44"><FieldLabel>啟用通知</FieldLabel><Switch defaultChecked /></Field>
          <Field disabled className="w-44"><FieldLabel>滿意度</FieldLabel><Rating value={4} aria-label="滿意度" /></Field>
          <Field disabled className="w-44"><FieldLabel>完成度</FieldLabel><Slider value={[60]} onValueChange={() => {}} /></Field>
          <Field disabled className="w-44"><FieldLabel>同意條款</FieldLabel><Checkbox defaultChecked /></Field>
          <Field disabled className="w-44"><FieldLabel>付款方式</FieldLabel><RadioGroup defaultValue="card"><RadioGroupItem value="card" label="信用卡" /><RadioGroupItem value="cash" label="貨到付款" /></RadioGroup></Field>
        </div>
      </div>
      <div>
        <p className="text-body-sm font-medium text-fg-secondary mb-3">{'<Field mode="readonly"> — 鎖定表單:文字控件灰框;boolean/單選 = 灰框 + 勾/叉 icon/選中項(2026-06-12 拍板);Rating 星星鎖定、Slider 鎖互動保留視覺'}</p>
        <div className="flex flex-wrap gap-x-8 gap-y-4 max-w-3xl">
          <Field mode="readonly" className="w-44"><FieldLabel>負責人</FieldLabel><Input value="王小明" onChange={() => {}} /></Field>
          <Field mode="readonly" className="w-44"><FieldLabel>同意條款</FieldLabel><Checkbox checked /></Field>
          <Field mode="readonly" className="w-44"><FieldLabel>已啟用</FieldLabel><Switch checked /></Field>
          <Field mode="readonly" className="w-44"><FieldLabel>行銷電子報</FieldLabel><Checkbox /></Field>
          <Field mode="readonly" className="w-44"><FieldLabel>付款方式</FieldLabel><RadioGroup value="card"><RadioGroupItem value="card" label="信用卡" /><RadioGroupItem value="cash" label="貨到付款" /></RadioGroup></Field>
          <Field mode="readonly" className="w-44"><FieldLabel>滿意度</FieldLabel><Rating value={4} aria-label="滿意度" /></Field>
          <Field mode="readonly" className="w-44"><FieldLabel>完成度</FieldLabel><Slider defaultValue={[40]} aria-label="完成度" /></Field>
        </div>
      </div>
      <div>
        <p className="text-body-sm font-medium text-fg-secondary mb-3">{'<Field mode="view"> — 有展示態的控件自動切純展示（Select / DatePicker / Checkbox / Switch 修復後生效）'}</p>
        <div className="flex flex-wrap gap-x-8 gap-y-4 max-w-3xl">
          <Field mode="view" className="w-44"><FieldLabel>負責人</FieldLabel><Input value="王小明" onChange={() => {}} /></Field>
          <Field mode="view" className="w-44"><FieldLabel>優先級</FieldLabel><Select options={CASCADE_PRIORITY} value="high" aria-label="優先級" /></Field>
          <Field mode="view" className="w-44"><FieldLabel>截止日</FieldLabel><DatePicker value="2026-06-20" onChange={() => {}} /></Field>
          <Field mode="view" className="w-44"><FieldLabel>數量</FieldLabel><NumberInput value={42} onChange={() => {}} /></Field>
          <Field mode="view" className="w-44"><FieldLabel>已啟用</FieldLabel><Switch checked /></Field>
          <Field mode="view" className="w-44"><FieldLabel>同意條款</FieldLabel><Checkbox checked /></Field>
        </div>
      </div>
    </div>
  ),
}

// ── Horizontal ──────────────────────────────────────────────────────────

export const Horizontal: Story = {
  name: '水平',
  render: () => (
    <div className="max-w-2xl">
      <FieldGroup>
        <Field orientation="horizontal" labelWidth="120px" required>
          <FieldLabel>姓名</FieldLabel>
          <Input placeholder="請輸入姓名" />
          <FieldDescription>中英文皆可</FieldDescription>
        </Field>

        <Field orientation="horizontal" labelWidth="120px">
          <FieldLabel>Email</FieldLabel>
          <Input placeholder="name@example.com" />
        </Field>

        <Field orientation="horizontal" labelWidth="120px" required invalid>
          <FieldLabel>密碼</FieldLabel>
          <Input placeholder="至少 8 碼" />
          <FieldError>密碼長度不足</FieldError>
        </Field>
      </FieldGroup>
    </div>
  ),
}

// ── Horizontal 垂直對齊公式驗證 ─────────────────────────────────────────

export const HorizontalLabelAlignment: Story = {
  name: '水平:標籤與控件垂直對齊',
  render: () => (
    <div className="max-w-3xl flex flex-col gap-8">
      <div>
        <h3 className="text-body font-bold mb-2">驗證：單行 label 與 input 中線對齊</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          Label 是單行時，文字應與 input 的文字中線完全對齊。
          這是 padding-top: calc((field-height - 1lh) / 2) 的基本情境。
        </p>
        <Field orientation="horizontal" labelWidth="160px">
          <FieldLabel>職稱</FieldLabel>
          <Input placeholder="如:資深產品設計師" />
        </Field>
      </div>

      <div>
        <h3 className="text-body font-bold mb-2">驗證：多行 label 第一行對齊 input 中線</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          Label 換行時，第一行仍然與 input 中線對齊，後續行往下流。
          視覺上 label 從 input 中線往下延伸，而不是從 input 頂部開始。
        </p>
        <Field orientation="horizontal" labelWidth="160px">
          <FieldLabel>緊急聯絡人手機(發生狀況時優先撥打)</FieldLabel>
          <Input placeholder="如:0912-345-678" />
        </Field>
      </div>

      <div>
        <h3 className="text-body font-bold mb-2">驗證：size 切換時 label 自動跟隨</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          公式用 <code>var(--field-height-&#123;size&#125;)</code>，size 切換時 padding-top 自動重算，
          無需 JS 測量。
        </p>
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-caption text-fg-muted mb-1">小尺寸 sm — 控件高 28px</div>
            <Field orientation="horizontal" labelWidth="100px" size="sm">
              <FieldLabel>電子郵件</FieldLabel>
              <Input size="sm" placeholder="name@example.com" />
            </Field>
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-1">中尺寸 md — 控件高 32px</div>
            <Field orientation="horizontal" labelWidth="100px" size="md">
              <FieldLabel>電子郵件</FieldLabel>
              <Input size="md" placeholder="name@example.com" />
            </Field>
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-1">大尺寸 lg — 控件高 36px</div>
            <Field orientation="horizontal" labelWidth="100px" size="lg">
              <FieldLabel>電子郵件</FieldLabel>
              <Input size="lg" placeholder="name@example.com" />
            </Field>
          </div>
        </div>
      </div>
    </div>
  ),
}

// ── Checkbox / Switch 在 Field 內的高度對齊 ─────────────────────────────

export const MixedControlAlignment: Story = {
  name: '混合控制元件的高度對齊',
  render: () => (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h3 className="text-body font-bold mb-2">垂直 Field：Input / Checkbox / Switch 高度節奏一致</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          每個欄位的控件區都有相同的最小高度,讓整欄看起來節奏一致。
          文字輸入框會撐滿整個高度,勾選框與開關則維持原本尺寸並在區內垂直置中。
        </p>
        <FieldGroup>
          <Field>
            <FieldLabel>姓名</FieldLabel>
            <Input placeholder="text input" />
          </Field>
          <Field>
            <FieldLabel>訂閱電子報</FieldLabel>
            <Checkbox />
          </Field>
          <Field>
            <FieldLabel>開啟通知</FieldLabel>
            <Switch />
          </Field>
        </FieldGroup>
      </div>

      <div>
        <h3 className="text-body font-bold mb-2">水平並排：Input / Checkbox / Switch 中線對齊</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          多個 Field 橫向並排時，每個 Field 的 control 中線都在同一水平線上。
        </p>
        <div className="grid grid-cols-3 gap-4">
          <Field>
            <FieldLabel>姓名</FieldLabel>
            <Input placeholder="input" />
          </Field>
          <Field>
            <FieldLabel>訂閱</FieldLabel>
            <Checkbox />
          </Field>
          <Field>
            <FieldLabel>通知</FieldLabel>
            <Switch />
          </Field>
        </div>
      </div>

      <div>
        <h3 className="text-body font-bold mb-2">Horizontal Field：label 與任何 control 都對齊中線</h3>
        <FieldGroup>
          <Field orientation="horizontal" labelWidth="120px">
            <FieldLabel>姓名</FieldLabel>
            <Input placeholder="text input" />
          </Field>
          <Field orientation="horizontal" labelWidth="120px">
            <FieldLabel>訂閱電子報</FieldLabel>
            <Checkbox />
          </Field>
          <Field orientation="horizontal" labelWidth="120px">
            <FieldLabel>開啟通知</FieldLabel>
            {/* 混合表單 = Form-edit → ml-0 靠左(switch.spec.md「兩種對齊慣例」) */}
            <Switch className="ml-0" />
          </Field>
        </FieldGroup>
      </div>
    </div>
  ),
}

// ── SegmentedControl 在 Field 內 ────────────────────────────────────────

export const SegmentedControlInField: Story = {
  name: 'SegmentedControl 作為 Field 控制元件',
  render: () => (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h3 className="text-body font-bold mb-2">Vertical：SegmentedControl 自動繼承 Field size</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          分段控制器放進欄位後,會自動沿用欄位設定的尺寸,不需要再單獨指定——跟按鈕、輸入框的做法一致。
          整個欄位改尺寸時,分段控制器也會跟著一起縮放。
        </p>
        <FieldGroup>
          <div>
            <div className="text-caption text-fg-muted mb-1">小尺寸 sm</div>
            <Field size="sm">
              <FieldLabel>檢視模式</FieldLabel>
              <SegmentedControl defaultValue="list">
                <SegmentedControlItem value="list">清單</SegmentedControlItem>
                <SegmentedControlItem value="board">看板</SegmentedControlItem>
                <SegmentedControlItem value="calendar">行事曆</SegmentedControlItem>
              </SegmentedControl>
              <FieldDescription>切換內容呈現方式</FieldDescription>
            </Field>
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-1">中尺寸 md</div>
            <Field size="md">
              <FieldLabel>檢視模式</FieldLabel>
              <SegmentedControl defaultValue="list">
                <SegmentedControlItem value="list">清單</SegmentedControlItem>
                <SegmentedControlItem value="board">看板</SegmentedControlItem>
                <SegmentedControlItem value="calendar">行事曆</SegmentedControlItem>
              </SegmentedControl>
            </Field>
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-1">大尺寸 lg</div>
            <Field size="lg">
              <FieldLabel>檢視模式</FieldLabel>
              <SegmentedControl defaultValue="list">
                <SegmentedControlItem value="list">清單</SegmentedControlItem>
                <SegmentedControlItem value="board">看板</SegmentedControlItem>
                <SegmentedControlItem value="calendar">行事曆</SegmentedControlItem>
              </SegmentedControl>
            </Field>
          </div>
        </FieldGroup>
      </div>

      <div>
        <h3 className="text-body font-bold mb-2">Horizontal：label 與 SegmentedControl 中線對齊</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          水平排列時,分段控制器跟其他控件(輸入框、勾選框、開關)一樣維持相同的行高節奏,
          標籤的第一行會對齊控件的垂直中線。
        </p>
        <FieldGroup>
          <Field orientation="horizontal" labelWidth="120px">
            <FieldLabel>名稱</FieldLabel>
            <Input placeholder="text input" />
          </Field>
          <Field orientation="horizontal" labelWidth="120px">
            <FieldLabel>檢視模式</FieldLabel>
            <SegmentedControl defaultValue="list">
              <SegmentedControlItem value="list">清單</SegmentedControlItem>
              <SegmentedControlItem value="board">看板</SegmentedControlItem>
              <SegmentedControlItem value="calendar">行事曆</SegmentedControlItem>
            </SegmentedControl>
          </Field>
          <Field orientation="horizontal" labelWidth="120px">
            <FieldLabel>訂閱通知</FieldLabel>
            {/* 混合表單(Input/SegmentedControl 同列)= Form-edit 情境 → Switch 跟其他控件靠左
                (switch.spec.md「兩種對齊慣例」判準;ml-0 覆寫 Field 內預設 ml-auto 齊右 —— 齊右屬純 settings list)*/}
            <Switch className="ml-0" />
          </Field>
        </FieldGroup>
      </div>

      <div>
        <h3 className="text-body font-bold mb-2">Disabled：Field disabled 時 SegmentedControl 跟著 disabled</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          跟 Button / Input 相同——Field 的 disabled state 透過 context 傳給 SegmentedControl，
          consumer 不需要在 SegmentedControl 上重複傳 disabled。
        </p>
        <Field disabled>
          <FieldLabel>檢視模式</FieldLabel>
          <SegmentedControl defaultValue="list">
            <SegmentedControlItem value="list">清單</SegmentedControlItem>
            <SegmentedControlItem value="board">看板</SegmentedControlItem>
            <SegmentedControlItem value="calendar">行事曆</SegmentedControlItem>
          </SegmentedControl>
        </Field>
      </div>
    </div>
  ),
}

// @story-trait-rationale: States retired 2026-05-17 per audit Dim 24 —
//   anatomy.stories.tsx StateBehavior own required/disabled/invalid/readonly state matrix。
//   展示層保留 typical real-product 情境(Block control / Mode 等),避免跟 anatomy trait grid 重複。

// ── Block Control: RadioGroup ───────────────────────────────────────────

export const BlockControlRadioGroup: Story = {
  name: '區塊內控制元件 — RadioGroup',
  render: () => (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h3 className="text-body font-bold mb-2">Vertical:RadioGroup 在 control area 內堆疊</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          單選群組會讓欄位自動切換成「多行區塊」排版——
          控件區不固定高度,而是把第一個選項的中線對齊到單行控件的中線位置。
          使用時不需要額外傳任何設定。
        </p>
        <div className="max-w-sm">
          <Field>
            <FieldLabel>性別</FieldLabel>
            <RadioGroup defaultValue="female">
              <RadioGroupItem value="male" label="男性" />
              <RadioGroupItem value="female" label="女性" />
              <RadioGroupItem value="other" label="其他" />
            </RadioGroup>
            <FieldDescription>會用於統計報表,可隨時修改</FieldDescription>
          </Field>
        </div>
      </div>

      <div>
        <h3 className="text-body font-bold mb-2">Horizontal:label 第一行對齊第一個 option 中線</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          水平排列時,標籤與控件區用同一套對齊方式,讓兩者的「第一行中線」落在同一條基準線上,
          所以標籤文字會精準對齊第一個單選項的文字中線,後面的選項往下排列。
        </p>
        <Field orientation="horizontal" labelWidth="120px">
          <FieldLabel>性別</FieldLabel>
          <RadioGroup defaultValue="female">
            <RadioGroupItem value="male" label="男性" />
            <RadioGroupItem value="female" label="女性" />
            <RadioGroupItem value="other" label="其他" />
          </RadioGroup>
        </Field>
      </div>

      <div>
        <h3 className="text-body font-bold mb-2">Inline + Block 並排:FieldGroup 韻律不斷</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          同一組欄位裡混用單行控件(輸入框)和多行控件(單選群組)時,每個欄位標籤的
          第一行中線都落在同一條視覺基準上——姓名輸入框的中線、性別第一個選項(男性)的中線、Email 輸入框的中線。
          這就是整套欄位一致的行高節奏。
        </p>
        <FieldGroup>
          <Field orientation="horizontal" labelWidth="120px" required>
            <FieldLabel>姓名</FieldLabel>
            <Input placeholder="請輸入姓名" />
          </Field>
          <Field orientation="horizontal" labelWidth="120px" required>
            <FieldLabel>性別</FieldLabel>
            <RadioGroup defaultValue="female">
              <RadioGroupItem value="male" label="男性" />
              <RadioGroupItem value="female" label="女性" />
              <RadioGroupItem value="other" label="其他" />
            </RadioGroup>
          </Field>
          <Field orientation="horizontal" labelWidth="120px">
            <FieldLabel>Email</FieldLabel>
            <Input placeholder="name@example.com" />
          </Field>
        </FieldGroup>
      </div>
    </div>
  ),
}

// ── Button as Data Input Affordance ─────────────────────────────────────

export const ButtonAsControl: Story = {
  name: 'Button 作為控制元件',
  render: () => (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h3 className="text-body font-bold mb-2">Upload Button 作為附件欄位的 control</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          Button 是「承載 file value 的輸入介面」——點擊開檔案選擇器,結果寫回 field。
          Button 高度與 `field-height` 共用同一組 token,放進 inline control area 自然對齊
          Input 中線,horizontal label 公式也直接套用,不需要任何特例。
        </p>
        <FieldGroup>
          <Field orientation="horizontal" labelWidth="120px" required>
            <FieldLabel>專案名稱</FieldLabel>
            <Input placeholder="如:Q2 行銷活動" />
          </Field>
          <Field orientation="horizontal" labelWidth="120px">
            <FieldLabel>合約附件</FieldLabel>
            <Button startIcon={Upload} variant="secondary">上傳檔案</Button>
            <FieldDescription>PDF / DOCX,最大 10 MB</FieldDescription>
          </Field>
          <Field orientation="horizontal" labelWidth="120px">
            <FieldLabel>備註</FieldLabel>
            <Input placeholder="選填" />
          </Field>
        </FieldGroup>
      </div>

      <div>
        <h3 className="text-body font-bold mb-2">判斷標準:點擊是否產生此欄位的 value?</h3>
        <p className="text-caption text-fg-muted mb-4 max-w-xl">
          ✅ 上傳檔案、開選人對話框、Connect OAuth——Button 是 control。<br/>
          ❌ 表單 submit / cancel、頁面導覽、刪除整筆資料——這些是 form / page action,
          不是 field control,要放在 form footer 或 page header。
        </p>
      </div>
    </div>
  ),
}

// ── Label Width 變化 ────────────────────────────────────────────────────

export const LabelWidth: Story = {
  name: '標籤寬度',
  render: () => (
    <div className="max-w-2xl flex flex-col gap-4">
      <p className="text-caption text-fg-muted">labelWidth 支援任何 CSS length 值(80px / 160px / 240px / 30% 等);同一表單依最長的 label 挑一個固定寬,讓控件起點對齊。</p>
      <div>
        <div className="text-caption text-fg-muted mb-1">labelWidth = 80px</div>
        <Field orientation="horizontal" labelWidth="80px">
          <FieldLabel>城市</FieldLabel>
          <Input placeholder="如:台北市" />
        </Field>
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-1">labelWidth = 160px(預設常用)</div>
        <Field orientation="horizontal" labelWidth="160px">
          <FieldLabel>公司統一編號</FieldLabel>
          <Input placeholder="8 碼數字" />
        </Field>
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-1">labelWidth = 240px(寬 label 欄)</div>
        <Field orientation="horizontal" labelWidth="240px">
          <FieldLabel>發票寄送電子郵件地址</FieldLabel>
          <Input placeholder="billing@company.com" />
        </Field>
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-1">labelWidth = 30%(比例)</div>
        <Field orientation="horizontal" labelWidth="30%">
          <FieldLabel>備註</FieldLabel>
          <Input placeholder="選填" />
        </Field>
      </div>
    </div>
  ),
}

// ── Slider in Field ──────────────────────────────────────────────────────

export const WithSlider: Story = {
  name: '包 Slider',
  render: () => {
    const [volume, setVolume] = React.useState([60])
    const [priceRange, setPriceRange] = React.useState([2000, 8000])
    return (
      <div className="max-w-sm">
        <FieldGroup>
          <Field>
            <FieldLabel>音量</FieldLabel>
            <Slider value={volume} onValueChange={setVolume} />
            <FieldDescription>目前 {volume[0]}%</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>價格區間</FieldLabel>
            <Slider
              value={priceRange}
              onValueChange={setPriceRange}
              min={0}
              max={10000}
              step={100}
            />
            <FieldDescription>
              NT$ {priceRange[0].toLocaleString()} – NT${' '}
              {priceRange[1].toLocaleString()}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>儲存空間配額</FieldLabel>
            <Slider defaultValue={[40]} disabled />
            <FieldDescription>由系統管理員設定,無法自行調整</FieldDescription>
          </Field>
        </FieldGroup>
      </div>
    )
  },
}

// ── Slider 跟 Input 並排:驗證 field-height 對齊 ─────────────────────────

export const SliderAlignsWithOtherFields: Story = {
  name: 'Slider 跟 Input / NumberInput 並排',
  render: () => (
    <div className="flex flex-col gap-8">
      <p className="text-caption text-fg-secondary max-w-[560px]">
        把 Slider、Input、NumberInput 並排在同一個 Field 行裡,會看到三者的高度
        完全對齊(`h-field-*`)——Slider 的 track/thumb 視覺身分不變,只有容器
        外高跟著 Field size 變。
      </p>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <div className="text-caption text-fg-muted mb-3">size = {size}</div>
          <FieldGroup>
            <Field orientation="horizontal" labelWidth="96px">
              <FieldLabel>姓名</FieldLabel>
              <Input size={size} placeholder="請輸入姓名" />
            </Field>
            <Field orientation="horizontal" labelWidth="96px">
              <FieldLabel>年齡</FieldLabel>
              <NumberInput size={size} placeholder="0" />
            </Field>
            <Field orientation="horizontal" labelWidth="96px">
              <FieldLabel>音量</FieldLabel>
              <Slider size={size} defaultValue={[50]} />
            </Field>
          </FieldGroup>
        </div>
      ))}
    </div>
  ),
}

// ── Slider 配 NumberInput(常見雙向綁定 pattern)──────────────────────

export const SliderWithLiveNumberInput: Story = {
  name: 'Slider + NumberInput 雙向綁定',
  render: () => {
    const [value, setValue] = React.useState(50)
    return (
      <div className="max-w-sm">
        <Field>
          <FieldLabel>縮放比例</FieldLabel>
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 min-w-0">
              <Slider
                value={[value]}
                onValueChange={v => setValue(v[0])}
                min={0}
                max={200}
              />
            </div>
            <NumberInput
              className="w-[96px]"
              value={value}
              onChange={v => setValue(v ?? 0)}
              min={0}
              max={200}
            />
          </div>
          {/* Slider 與 NumberInput 透過 `h-field-md` 對齊高度——實作細節,不進使用者可見文案 */}
          <FieldDescription>
            拖曳滑桿或直接輸入數字都能即時調整縮放比例,範圍 0–200%。
          </FieldDescription>
        </Field>
      </div>
    )
  },
}

// ── 表單驗證(useFormValidation)──────────────────────────────────────────
// form-validation.spec.md 可執行層 showcase:blur 驗證 / edit 清 error / Escape 回復 /
// submit 全驗 + anchor 第一個錯誤 / 業務錯誤同軌 / Create·Update 按鈕不對稱。

const EXISTING_PROJECT_NAMES = ['產品路線圖 Q3', '客服工單系統'] // 模擬「名稱重複」業務驗證(規則 9)

function UpdateProjectSettingsForm() {
  const [saved, setSaved] = React.useState(false)
  const form = useFormValidation({
    initialValues: { name: '產品路線圖', ownerEmail: 'pm@acme.com' },
    intent: 'update', // Update:disabled-until-dirty(沒改就不用存)
    validate: {
      name: (v) => (String(v).trim() ? undefined : '專案名稱必填'),
      ownerEmail: (v) => (/^\S+@\S+\.\S+$/.test(String(v)) ? undefined : 'Email 格式不正確'),
    },
    onSubmit: (values) => {
      if (EXISTING_PROJECT_NAMES.includes(String(values.name).trim())) {
        return { name: '此專案名稱已存在' } // 業務驗證(規則 9)→ 自動 setError + anchor
      }
      setSaved(true)
    },
  })
  return (
    <form onSubmit={form.handleSubmit} className="w-80" aria-label="專案設定">
      <FieldGroup>
        <Field required invalid={!!form.errors.name}>
          <FieldLabel>專案名稱</FieldLabel>
          <Input {...form.getInputProps('name')} />
          <FieldDescription>專案名稱不得與其他專案重複</FieldDescription>
          <FieldError>{form.errors.name}</FieldError>
        </Field>
        <Field required invalid={!!form.errors.ownerEmail}>
          <FieldLabel>負責人 Email</FieldLabel>
          <Input {...form.getInputProps('ownerEmail')} />
          <FieldError>{form.errors.ownerEmail}</FieldError>
        </Field>
      </FieldGroup>
      {/* 規則 4:內容 → action button = --layout-space-bottom(48px,commitment 前留白) */}
      <div className="mt-[var(--layout-space-bottom)] flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={form.submitDisabled}>儲存變更</Button>
        {saved && <span className="text-caption text-fg-muted">已儲存 ✓</span>}
      </div>
    </form>
  )
}

function CreateProjectForm() {
  const [created, setCreated] = React.useState(false)
  const form = useFormValidation({
    initialValues: { name: '', ownerEmail: '' },
    intent: 'create', // Create:永遠 enabled(不讓使用者猜「為什麼按不了」)
    validate: {
      name: (v) => (String(v).trim() ? undefined : '專案名稱必填'),
      ownerEmail: (v) => (/^\S+@\S+\.\S+$/.test(String(v)) ? undefined : 'Email 格式不正確'),
    },
    onSubmit: () => setCreated(true),
  })
  return (
    <form onSubmit={form.handleSubmit} className="w-80" aria-label="建立專案">
      <FieldGroup>
        <Field required invalid={!!form.errors.name}>
          <FieldLabel>專案名稱</FieldLabel>
          <Input placeholder="例:結帳流程改版" {...form.getInputProps('name')} />
          <FieldError>{form.errors.name}</FieldError>
        </Field>
        <Field required invalid={!!form.errors.ownerEmail}>
          <FieldLabel>負責人 Email</FieldLabel>
          <Input placeholder="pm@company.com" {...form.getInputProps('ownerEmail')} />
          <FieldError>{form.errors.ownerEmail}</FieldError>
        </Field>
      </FieldGroup>
      <div className="mt-[var(--layout-space-bottom)] flex items-center gap-2">
        <Button type="submit" variant="primary">建立專案</Button>
        {created && <span className="text-caption text-fg-muted">已建立 ✓</span>}
      </div>
    </form>
  )
}

export const FormValidation: Story = {
  name: '表單驗證 — useFormValidation 可執行層',
  render: () => (
    <div className="flex flex-wrap items-start gap-[var(--layout-space-loose)]">
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-body font-bold">更新:專案設定(disabled-until-dirty)</h3>
        <p className="text-caption text-fg-muted max-w-80">
          按鈕沒改不亮;打字中不報錯(blur 才驗);已出錯欄位一編輯立即清 error;
          Escape 回復原值;空 submit / 格式錯 → anchor 到第一個錯誤欄位。
          試著把名稱改成「產品路線圖 Q3」再儲存,會觸發「名稱重複」業務驗證。
        </p>
        <UpdateProjectSettingsForm />
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-body font-bold">建立:新專案(永遠 enabled)</h3>
        <p className="text-caption text-fg-muted max-w-80">
          Create 按鈕永遠可按 —— 點了才驗證全部並 scroll 到第一個錯誤,
          不讓使用者對著 disabled 按鈕猜原因。
        </p>
        <CreateProjectForm />
      </div>
    </div>
  ),
}

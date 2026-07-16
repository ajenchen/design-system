import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { InlineEdit } from './inline-edit'
import { Select } from '@/design-system/components/Select/select'
import { Field, FieldLabel } from '@/design-system/components/Field/field'

// 就地編輯無 disabled 態的世界級對照(cite,per M22):
//   MUI X isCellEditable/cellMode https://mui.com/x/react-data-grid/editing/
//   AG Grid editable https://www.ag-grid.com/react-data-grid/cell-editing/
//   Atlassian inline-edit readView/editView https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx
//
// InlineEdit 設計規格(anatomy)—— view ↔ edit 二態就地編輯 primitive。
// Model A(2026-07-16):view 不自帶幾何 cva,委派控件 view mode / fieldViewGeometry helper;read↔edit 零跳。
const meta: Meta<typeof InlineEdit> = {
  title: 'Design System/Components/InlineEdit/設計規格',
  component: InlineEdit,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof InlineEdit>

// ── shared UI ────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="mb-3 border-b border-divider pb-2 text-body-lg font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}
function PropRow({ name, type, def, desc }: { name: string; type: string; def: string; desc: string }) {
  return (
    <tr className="border-b border-divider align-top">
      <td className="py-2 pr-4 font-mono text-caption text-foreground">{name}</td>
      <td className="py-2 pr-4 font-mono text-caption text-fg-secondary">{type}</td>
      <td className="py-2 pr-4 font-mono text-caption text-fg-muted">{def}</td>
      <td className="py-2 text-caption text-fg-secondary">{desc}</td>
    </tr>
  )
}
function Stateful({ value: initial, ...props }: Omit<React.ComponentProps<typeof InlineEdit>, 'onCommit'>) {
  const [value, setValue] = React.useState(initial)
  return <InlineEdit {...props} value={value} onCommit={setValue} />
}

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="max-w-[720px]">
      <Section title="定位">
        <p className="text-body text-fg-secondary">
          就地編輯 primitive:值平常以 <b>view 態</b>(純內容)呈現,滑鼠移入顯示灰底提示、點擊(或鍵盤 Enter)切成
          <b> edit 態</b>(真正的 Field 控件)。與 DataTable cell 同一份就地編輯語義 —— 只有 <code>view ↔ edit</code> 兩態
          + <code>editable</code> 判準閘,<b>無 disabled 態</b>(世界級就地編輯共識,cite 見檔頭)。
        </p>
      </Section>
      <Section title="Model A —— view 幾何來源">
        <p className="mb-2 text-body text-fg-secondary">
          InlineEdit <b>不自帶</b> geometry cva(消 M17 重複)。view 幾何來源分兩路,read↔edit 零跳因兩態同一顆控件、只差 chrome:
        </p>
        <ul className="ml-5 list-disc text-body text-fg-secondary">
          <li><b>值-格式化</b>(Select→Tag / 日期 / avatar):<code>renderRead</code> 委派 <code>{'<Control mode="view">'}</code>,
            幾何 + 內部間距(多 tag gap / avatar↔label)皆由控件 view×default 提供。</li>
          <li><b>純值 / 標題</b>(<code>as="h1"</code>):套 <code>fieldViewGeometry(size, multiline)</code> helper
            (= view×default 幾何 SSOT:<code>px-field-px</code> + <code>min-h-field</code> + 多行 <code>py-2</code>)。</li>
        </ul>
      </Section>
    </div>
  ),
}

export const Inspector: Story = {
  name: '屬性一覽',
  render: () => (
    <div className="max-w-[860px]">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-border text-left">
            <th className="py-2 pr-4 text-caption font-semibold text-fg-muted">Prop</th>
            <th className="py-2 pr-4 text-caption font-semibold text-fg-muted">型別</th>
            <th className="py-2 pr-4 text-caption font-semibold text-fg-muted">預設</th>
            <th className="py-2 text-caption font-semibold text-fg-muted">說明</th>
          </tr>
        </thead>
        <tbody>
          <PropRow name="value" type="T" def="—" desc="已提交的欄位值(view 顯示 / edit 初值)。泛型:string / number / string[] / PersonValue" />
          <PropRow name="onCommit" type="(next: T) => void" def="—" desc="blur / Enter 且草稿有變更時提交" />
          <PropRow name="editable" type="boolean" def="true" desc="false → view 無 hover 入口、無藍框、不可進 edit、不灰化(鎖定 = 純 view)" />
          <PropRow name="renderRead" type="(v: T) => ReactNode" def="String(value)" desc="格式化 view;鐵律:渲染對應控件 mode='view',不可自刻" />
          <PropRow name="renderEdit" type="(p) => ReactNode" def="Input/Textarea" desc="edit 控件(必 mode='edit');非 string 值必傳" />
          <PropRow name="multiline" type="boolean" def="false" desc="Jira description 類:view 換行 + edit 用 Textarea(py-2 = Textarea)" />
          <PropRow name="as" type="'span'|'h1'..'h6'|'p'|'div'" def="'span'" desc="view 語意標籤;標題保留文件大綱 a11y" />
          <PropRow name="size" type="'sm'|'md'|'lg'" def="sm(fieldCtx cascade)" desc="接 fieldCtx.size;standalone fallback sm。靜態 fieldPreferredSize='sm' 讓外層 Field 自動收 sm" />
          <PropRow name="label" type="string" def="—" desc="view 按鈕 aria-label(「編輯 {label}」)+ 控件 aria-label" />
        </tbody>
      </table>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="grid max-w-[720px] grid-cols-[140px_1fr] gap-x-6 gap-y-5">
      <span className="text-body font-medium text-foreground">view(可編)</span>
      <div><Stateful value="Fix flaky e2e test" label="標題" /></div>
      <span className="text-body font-medium text-foreground">view(鎖定)</span>
      <div><Stateful value="PROJ-482(系統產生)" label="編號" editable={false} /></div>
      <span className="text-body font-medium text-foreground">多行</span>
      <div><Stateful value={'第一行說明\n第二行說明(換行保留上下 padding)'} label="說明" multiline /></div>
      <span className="text-body font-medium text-foreground">格式化(Tag)</span>
      <div>
        <Stateful
          value="in-progress"
          label="狀態"
          renderRead={(v) => (
            <Select mode="view" display="tag" size="sm" value={v as string} options={[
              { value: 'in-progress', label: '進行中', tagVariant: 'blue' },
              { value: 'done', label: '完成', tagVariant: 'green' },
            ]} />
          )}
          renderEdit={(p) => (
            <Select
              autoFocus
              display="tag"
              size="sm"
              defaultOpen
              value={p.value as string}
              aria-label={p['aria-label']}
              options={[
                { value: 'in-progress', label: '進行中', tagVariant: 'blue' },
                { value: 'done', label: '完成', tagVariant: 'green' },
              ]}
              onChange={(next) => { p.onChange(next as string); p.commit() }}
            />
          )}
        />
      </div>
      <span className="text-body font-medium text-foreground">空值</span>
      <div><Stateful value="" label="負責人" placeholder="指派負責人…" /></div>
    </div>
  ),
}

// auto-sm 靠 Field 偵測 child 靜態 `fieldPreferredSize`(對齊 detectControlLayout 讀 fieldLayout)——
//   **必 InlineEdit 為 Field 直接子**(包一層 wrapper 元件會遮蔽靜態,Field 偵測不到 → 退回 md)。
function CascadeDemo() {
  const [title, setTitle] = React.useState('Fix flaky checkout e2e test')
  const [owner, setOwner] = React.useState('')
  return (
    <div className="w-[420px] rounded-lg border border-border bg-surface p-[var(--layout-space-loose)]">
      {/* Field 偵測 InlineEdit 靜態 fieldPreferredSize='sm' → 未指定 size 自動收 sm;
          vertical orientation → InlineEdit -mx 讓 view 值落 FieldLabel 同左緣 */}
      <Field className="mb-4">
        <FieldLabel>任務標題</FieldLabel>
        <InlineEdit value={title} onCommit={setTitle} label="任務標題" />
      </Field>
      <Field>
        <FieldLabel>負責人</FieldLabel>
        <InlineEdit value={owner} onCommit={setOwner} label="負責人" placeholder="指派…" />
      </Field>
    </div>
  )
}
export const InFieldCascade: Story = {
  name: '包進表單欄位:尺寸自動收斂與左緣對齊',
  render: () => <CascadeDemo />,
}

export const Accessibility: Story = {
  name: '無障礙',
  render: () => (
    <div className="max-w-[640px] text-body text-fg-secondary">
      <ul className="ml-5 list-disc space-y-1">
        <li>view 疊隱形 <code>{'<button aria-label="編輯 {label}">'}</code> —— Tab 可聚焦、Enter/Space 進 edit;
          與 <code>as="h1"</code> 分離(HTML 不允許 heading 巢狀於 button),標題大綱不破壞。</li>
        <li>鍵盤 focus 顯 <code>border-primary</code> 藍框(<code>focus-visible</code>,僅鍵盤);滑鼠點擊不顯藍框。</li>
        <li>結算焦點路徑分流:鍵盤 Enter/Esc → 焦點回 view 按鈕;滑鼠 blur → 純 view 不搶焦。</li>
        <li><code>editable=false</code>:不渲染 Pressable,鍵盤跳過,語意 = 唯讀值(非 disabled)。</li>
        <li>edit 態 = 真正的 Field 控件,繼承其 a11y(Input/Textarea/Select 各自 ARIA)。</li>
      </ul>
    </div>
  ),
}

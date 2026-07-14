import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { InlineEdit } from './inline-edit'
import { Select } from '@/design-system/components/Select/select'
import { Field, FieldLabel } from '@/design-system/components/Field/field'

const meta: Meta<typeof InlineEdit> = {
  title: 'Design System/Components/InlineEdit/展示',
  component: InlineEdit,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof InlineEdit>

// 受控 helper —— InlineEdit 的 value 由 consumer 持有,onCommit 回寫
type StatefulProps = Omit<React.ComponentProps<typeof InlineEdit>, 'onCommit'>
function StatefulInlineEdit({ value: initial, ...props }: StatefulProps) {
  const [value, setValue] = React.useState(initial)
  return <InlineEdit {...props} value={value} onCommit={setValue} />
}

/* ── 真實業務:工作項目詳情面板標題就地編輯 ── */
export const TaskTitle: Story = {
  name: '任務標題就地編輯',
  render: () => {
    const [title, setTitle] = React.useState('Fix flaky checkout e2e test on Safari')
    return (
      <div className="w-[560px] rounded-lg border border-border bg-surface p-[var(--layout-space-loose)]">
        <p className="mb-1 text-caption text-fg-secondary">PROJ-482</p>
        <InlineEdit
          as="h1"
          value={title}
          onCommit={setTitle}
          label="task title"
          readClassName="text-h4 font-bold text-foreground"
          placeholder="Add a title…"
        />
        <p className="mt-4 text-body text-fg-muted">
          標題平常是純文字,滑鼠移入顯示灰底提示可編輯;點擊(或鍵盤 Tab + Enter)切成輸入框,Enter 儲存、Esc 取消。
        </p>
      </div>
    )
  },
}

/* ── 真實業務:詳情面板多個 metadata 欄位逐欄就地編輯 ── */
function MetaRow({ label, value, placeholder }: { label: string; value: string; placeholder?: string }) {
  return (
    <div className="grid grid-cols-[128px_1fr] items-center gap-[var(--layout-space-tight)]">
      <span className="text-body text-fg-secondary">{label}</span>
      <StatefulInlineEdit value={value} label={label} placeholder={placeholder} size="sm" />
    </div>
  )
}

export const MetadataFields: Story = {
  name: '詳情欄位就地編輯',
  render: () => (
    <div className="w-[440px] rounded-lg border border-border bg-surface p-[var(--layout-space-loose)]">
      {/* heading → fields = tight（functional labeling）;fields 彼此 = loose（parallel 獨立欄位,layoutSpace.spec.md 親疏 3 級） */}
      <h2 className="mb-[var(--layout-space-tight)] text-body font-bold text-foreground">Details</h2>
      <div className="flex flex-col gap-[var(--layout-space-loose)]">
        <MetaRow label="Summary" value="Q3 launch checklist owner handoff" />
        <MetaRow label="Story points" value="5" />
        <MetaRow label="External link" value="figma.com/file/checkout-flow" placeholder="Add a link…" />
        <MetaRow label="Reviewer note" value="" placeholder="Add a note…" />
      </div>
    </div>
  ),
}

/* ── 三態 matrix:read / hover / edit（play 驅動 hover + edit 態顯示）── */
function StateRow({
  caption,
  children,
  ...rest
}: { caption: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest}>
      <p className="mb-2 text-caption text-fg-muted">{caption}</p>
      {/* px-field-px 抵銷 InlineEdit 的 -mx-field-px,讓文字左緣與說明對齊 */}
      <div className="px-[var(--field-px)]">{children}</div>
    </div>
  )
}

export const States: Story = {
  name: '三態:閱讀/懸停/編輯',
  render: () => (
    <div className="flex w-[440px] flex-col gap-6">
      <StateRow caption="read(靜態)—— 純文字,透明邊框(預留、不可見)、無底色">
        <StatefulInlineEdit value="Design review notes" label="標題" />
      </StateRow>
      <StateRow
        caption="read + hover —— 灰底 bg-neutral-hover + rounded-md(非邊框)"
        data-testid="inline-edit-hover-row"
      >
        <StatefulInlineEdit value="Design review notes" label="標題" />
      </StateRow>
      <StateRow
        caption="edit —— 真正的 Field 控件(border + focus 藍框 + input)"
        data-testid="inline-edit-edit-row"
      >
        <StatefulInlineEdit value="Design review notes" label="標題" />
      </StateRow>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { userEvent } = await import('@storybook/test')
    // hover 態:滑鼠移入第二列 → 顯示 bg-neutral-hover 灰底
    const hoverBtn = canvasElement
      .querySelector('[data-testid="inline-edit-hover-row"]')
      ?.querySelector('button')
    if (hoverBtn) await userEvent.hover(hoverBtn)
    // edit 態:點擊第三列 → 切成真正的 Input 控件
    const editBtn = canvasElement
      .querySelector('[data-testid="inline-edit-edit-row"]')
      ?.querySelector('button')
    if (editBtn) await userEvent.click(editBtn)
  },
}

/* ── 真實業務:工作項目 Status 就地編輯(型別化 read = Tag)──
   SSOT 示範:read 態的 Tag **不是** InlineEdit 自刻,而是渲染 `<Select mode="display" display="tag">`
   —— 「select 值 → Tag」的格式化 SSOT 住在 Select 的 display mode(= DataTable 格子消費的同一份)。
   read 與 edit 用同一個 Select、只切 mode,格式零分歧。 */
const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do', tagVariant: 'neutral' },
  { value: 'in-progress', label: 'In Progress', tagVariant: 'blue' },
  { value: 'in-review', label: 'In Review', tagVariant: 'yellow' },
  { value: 'done', label: 'Done', tagVariant: 'green' },
]

// 架構理由(移出 story name,per story-rules.md name 必人話):read 態顯示為 Tag,SSOT = Select
// 的 display mode —— InlineEdit 委派 Select 控件,read view 消費 Select 的 display 呈現(標籤/色點)。
export const SelectTagField: Story = {
  name: '狀態就地編輯(讀取時顯示為標籤)',
  render: () => {
    const [status, setStatus] = React.useState('in-progress')
    return (
      <div className="grid w-[440px] grid-cols-[128px_1fr] items-center gap-[var(--layout-space-tight)] rounded-lg border border-border bg-surface p-[var(--layout-space-loose)]">
        <span className="text-body text-fg-secondary">Status</span>
        <InlineEdit<string>
          value={status}
          onCommit={setStatus}
          label="status"
          size="sm"
          // read:Select 的 display mode 輸出 Tag(格式化 SSOT 住在 Select,InlineEdit 不自刻)。
          // Tag **盒子左緣**對齊 label / 其他純文字值,tag 文字被 pill 內距自然縮排 —— 對齊 Meegle 實測
          // (PIL 量測 2026-07-10:Meegle pill box=label 左緣、text 縮排 ~8px@1x)。**不做 text outdent**。
          renderRead={(v) => (
            <Select mode="display" display="tag" size="sm" value={v} options={STATUS_OPTIONS} />
          )}
          // edit:同一個 Select 切 edit mode + 立即開選單;選完即 commit 回 read
          renderEdit={(p) => (
            <Select
              autoFocus
              display="tag"
              size="sm"
              value={p.value}
              options={STATUS_OPTIONS}
              defaultOpen
              onChange={(next) => {
                p.onChange(next as string)
                p.commit()
              }}
            />
          )}
        />
      </div>
    )
  },
}

/* ── 真實業務:工作項目 Description 多行就地編輯(Jira description 類)──
   multiline:read 態換行顯示、edit 態預設 Textarea(Enter=換行、Cmd/Ctrl+Enter 或 blur 提交)。 */
export const MultilineDescription: Story = {
  name: '多行描述就地編輯(Jira 描述欄類)',
  render: () => {
    const [desc, setDesc] = React.useState(
      'Safari 上點擊結帳時,e2e 測試會間歇性失敗。\n\n重現:連跑測試 5 次,約 2 次失敗;疑似 checkout webhook race。',
    )
    return (
      <div className="w-[560px] rounded-lg border border-border bg-surface p-[var(--layout-space-loose)]">
        <p className="mb-1 text-caption text-fg-secondary">DESCRIPTION</p>
        <InlineEdit
          multiline
          value={desc}
          onCommit={setDesc}
          label="description"
          placeholder="Add a description…"
        />
      </div>
    )
  },
}

/* ── 真實業務:工作項目詳情面板 —— vertical Field(FieldLabel + control)+ InlineEdit ──
   混合 plain / Tag / 多行欄位,驗證 Tag 值與 FieldLabel + 其他 plain 值的左緣視覺對齊。 */
export const VerticalFieldForm: Story = {
  name: '詳情面板:垂直排列 Field + InlineEdit(Tag 對齊)',
  render: () => {
    const [status, setStatus] = React.useState('in-progress')
    const [desc, setDesc] = React.useState('Safari 上點擊結帳時,e2e 測試會間歇性失敗。')
    return (
      <div
        data-testid="vfield-form"
        className="flex w-[420px] flex-col gap-[var(--layout-space-loose)] rounded-lg border border-border bg-surface p-[var(--layout-space-loose)]"
      >
        <Field orientation="vertical">
          <FieldLabel>Assignee</FieldLabel>
          <StatefulInlineEdit value="Alex Rivera" label="assignee" />
        </Field>
        <Field orientation="vertical">
          <FieldLabel>Status</FieldLabel>
          <InlineEdit<string>
            value={status}
            onCommit={setStatus}
            label="status"
            renderRead={(v) => (
              <Select mode="display" display="tag" size="sm" value={v} options={STATUS_OPTIONS} />
            )}
            renderEdit={(p) => (
              <Select
                autoFocus
                display="tag"
                size="sm"
                value={p.value}
                options={STATUS_OPTIONS}
                defaultOpen
                onChange={(next) => {
                  p.onChange(next as string)
                  p.commit()
                }}
              />
            )}
          />
        </Field>
        <Field orientation="vertical">
          <FieldLabel>Description</FieldLabel>
          <InlineEdit multiline value={desc} onCommit={setDesc} label="description" />
        </Field>
      </div>
    )
  },
}
